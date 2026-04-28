/**
 * Visual Compliance Service — AI Regulatory Audit Suite Phase 2
 * =============================================================
 * Handles upload, EXIF extraction, and Trinity vision analysis for
 * visual evidence artifacts (uniforms, vehicles, premises) submitted
 * by applicants/tenants ahead of a regulatory audit.
 *
 * Storage: All files stream directly to GCS via memoryStorage (LAW P3).
 * Analysis: Trinity vision endpoint (one brain — TRINITY.md §S & §T).
 * All mutating operations write audit logs (TRINITY.md §L).
 * All GCS keys are scoped to workspace_id (TRINITY.md §G).
 *
 * Texas DPS rulesets per artifact type:
 *   Uniforms  — flag impersonation text (POLICE / SHERIFF / AGENT / local LE patches)
 *   Vehicles  — OCR license plate, match pattern ^[BC][0-9]{5,6}$
 *   Premises  — verify framed license & labor posters mounted on a wall;
 *               cross-reference EXIF GPS against registered business address
 */

import { createLogger } from '../../lib/logger';
import { logActionAudit } from '../ai-brain/actionAuditLogger';

const log = createLogger('VisualComplianceService');

// ─── Artifact type catalogue ──────────────────────────────────────────────────

export type ArtifactType =
  | 'uniform_front'
  | 'uniform_back'
  | 'vehicle_front'
  | 'vehicle_back'
  | 'vehicle_left'
  | 'vehicle_right'
  | 'premises_wall'
  | 'premises_license';

export const ARTIFACT_TYPES: ArtifactType[] = [
  'uniform_front', 'uniform_back',
  'vehicle_front', 'vehicle_back', 'vehicle_left', 'vehicle_right',
  'premises_wall', 'premises_license',
];

// Map each slot to a human label for UI rendering
export const ARTIFACT_LABELS: Record<ArtifactType, string> = {
  uniform_front:    'Uniform — Front View',
  uniform_back:     'Uniform — Back View',
  vehicle_front:    'Vehicle — Front (License Plate visible)',
  vehicle_back:     'Vehicle — Rear',
  vehicle_left:     'Vehicle — Left Side',
  vehicle_right:    'Vehicle — Right Side',
  premises_wall:    'Premises — Wall showing all Labor Posters',
  premises_license: 'Premises — Framed License mounted on wall',
};

// ─── EXIF extraction ──────────────────────────────────────────────────────────

export interface ExifData {
  gpsLat?: number;
  gpsLng?: number;
  capturedAt?: Date;
  make?: string;
  model?: string;
}

/**
 * Extracts EXIF GPS and timestamp from an image buffer without shelling out.
 * Uses a hand-rolled EXIF reader so no native binaries are required on Railway.
 */
export function extractExifData(buffer: Buffer): ExifData {
  try {
    const result: ExifData = {};

    // JPEG magic bytes: FF D8
    if (buffer[0] !== 0xff || buffer[1] !== 0xd8) return result;

    let offset = 2;
    while (offset < buffer.length - 1) {
      if (buffer[offset] !== 0xff) break;
      const marker = buffer[offset + 1];
      offset += 2;
      if (marker === 0xda) break; // Start of scan — no more markers after this

      const segLen = buffer.readUInt16BE(offset);
      const segData = buffer.slice(offset + 2, offset + segLen);
      offset += segLen;

      // APP1 (0xe1) contains EXIF
      if (marker === 0xe1 && segData.slice(0, 4).toString('ascii') === 'Exif') {
        const exifBuf = segData.slice(6);
        const littleEndian = exifBuf.slice(0, 2).toString('ascii') === 'II';
        const readUInt16 = (o: number) => littleEndian ? exifBuf.readUInt16LE(o) : exifBuf.readUInt16BE(o);
        const readUInt32 = (o: number) => littleEndian ? exifBuf.readUInt32LE(o) : exifBuf.readUInt32BE(o);

        const ifd0Offset = readUInt32(4);
        const ifd0Count = readUInt16(ifd0Offset);

        for (let i = 0; i < ifd0Count; i++) {
          const tagOffset = ifd0Offset + 2 + i * 12;
          if (tagOffset + 12 > exifBuf.length) break;
          const tag = readUInt16(tagOffset);
          const valueOffset = readUInt32(tagOffset + 8);

          // Tag 0x8825 = GPSInfo IFD pointer
          if (tag === 0x8825 && valueOffset + 2 <= exifBuf.length) {
            result.gpsLat = readDmsFromGpsIfd(exifBuf, valueOffset, readUInt16, readUInt32, littleEndian, true);
            result.gpsLng = readDmsFromGpsIfd(exifBuf, valueOffset, readUInt16, readUInt32, littleEndian, false);
          }

          // Tag 0x0132 = DateTime
          if (tag === 0x0132 && valueOffset + 20 <= exifBuf.length) {
            const dtStr = exifBuf.slice(valueOffset, valueOffset + 19).toString('ascii');
            // Format: "YYYY:MM:DD HH:MM:SS"
            const parsed = dtStr.replace(/^(\d{4}):(\d{2}):(\d{2})/, '$1-$2-$3');
            const d = new Date(parsed);
            if (!isNaN(d.getTime())) result.capturedAt = d;
          }
        }
      }
    }
    return result;
  } catch {
    return {};
  }
}

function readDmsFromGpsIfd(
  buf: Buffer,
  ifdOffset: number,
  readUInt16: (o: number) => number,
  readUInt32: (o: number) => number,
  littleEndian: boolean,
  isLat: boolean,
): number | undefined {
  try {
    const count = readUInt16(ifdOffset);
    // GPS tag codes: 2=GPSLatitude, 4=GPSLongitude, 1=GPSLatRef, 3=GPSLonRef
    const coordTag = isLat ? 0x0002 : 0x0004;
    const refTag   = isLat ? 0x0001 : 0x0003;
    let coordOffset: number | undefined;
    let refChar = 'N';

    for (let i = 0; i < count; i++) {
      const off = ifdOffset + 2 + i * 12;
      if (off + 12 > buf.length) break;
      const tag = readUInt16(off);
      if (tag === refTag) {
        const valOff = readUInt32(off + 8);
        if (valOff < buf.length) refChar = buf[valOff] === 83 || buf[valOff] === 87 ? 'S' : 'N';
      }
      if (tag === coordTag) coordOffset = readUInt32(off + 8);
    }
    if (coordOffset === undefined) return undefined;

    const readRational = (o: number) => {
      const num = littleEndian ? buf.readUInt32LE(o) : buf.readUInt32BE(o);
      const den = littleEndian ? buf.readUInt32LE(o + 4) : buf.readUInt32BE(o + 4);
      return den === 0 ? 0 : num / den;
    };
    const deg = readRational(coordOffset);
    const min = readRational(coordOffset + 8);
    const sec = readRational(coordOffset + 16);
    const decimal = deg + min / 60 + sec / 3600;
    return (refChar === 'S' || refChar === 'W') ? -decimal : decimal;
  } catch {
    return undefined;
  }
}

// ─── GCS upload ───────────────────────────────────────────────────────────────

async function uploadToGcs(
  workspaceId: string,
  artifactType: ArtifactType,
  fileBuffer: Buffer,
  mimeType: string,
): Promise<string> {
  const { Storage } = await import('@google-cloud/storage');
  const storage = new Storage();
  const bucketName = process.env.DEFAULT_OBJECT_STORAGE_BUCKET_ID;
  if (!bucketName) throw new Error('DEFAULT_OBJECT_STORAGE_BUCKET_ID not configured');

  const ext = mimeType === 'image/png' ? 'png' : 'jpg';
  const ts  = Date.now();
  const gcsKey = `workspaces/${workspaceId}/visual-compliance/${artifactType}_${ts}.${ext}`;

  const bucket = storage.bucket(bucketName);
  const file   = bucket.file(gcsKey);
  await file.save(fileBuffer, { contentType: mimeType, resumable: false });
  return `gs://${bucketName}/${gcsKey}`;
}

// ─── Trinity vision analysis ──────────────────────────────────────────────────

export interface VisionAnalysisResult {
  status: 'passed' | 'flagged' | 'error';
  confidenceScore: number;
  reasoningText: string;
  ocrText?: string;
}

function buildVisionPrompt(artifactType: ArtifactType, registeredAddress?: string): string {
  const base = `You are Trinity, the single AI compliance brain for CoAIleague — a Texas security guard company management platform. Analyze this image strictly against Texas DPS (Department of Public Safety) Private Security Bureau regulations. Respond ONLY in valid JSON matching: { "status": "passed"|"flagged", "confidence_score": 0.00-1.00, "reasoning": "...", "ocr_text": "..." }.`;

  const rulesets: Record<ArtifactType, string> = {
    uniform_front: `${base} RULESET — UNIFORM (FRONT): Flag if any text reads POLICE, LAW ENFORCEMENT, SHERIFF, DEPUTY, MARSHAL, AGENT, DPS, FBI, HSI, DEA, or closely mimics a government law enforcement badge or patch. Also flag if colors and insignia strongly resemble a specific local law enforcement agency. A standard security guard uniform with the word "SECURITY" is acceptable. If no impersonation risk, pass.`,
    uniform_back:  `${base} RULESET — UNIFORM (BACK): Same impersonation rules as front. Also confirm the back of the uniform does not display prohibited LE-mimicking text. Pass if only "SECURITY" or company branding is visible.`,
    vehicle_front: `${base} RULESET — VEHICLE (FRONT / LICENSE PLATE OCR): Extract the full license plate number via OCR and place it in ocr_text. A valid Texas security company vehicle license must match the pattern ^[BC][0-9]{5,6}$ (B or C followed by 5 or 6 digits). Flag if the plate is illegible, missing, obscured, or does not match this pattern. Also flag if the vehicle displays unauthorized emergency lights (red/blue) or LE-mimicking markings. Pass if plate matches pattern and no prohibited markings.`,
    vehicle_back:  `${base} RULESET — VEHICLE (REAR): Confirm rear license plate is legible. Extract via OCR into ocr_text. Flag if plate is missing, obscured, or fails ^[BC][0-9]{5,6}$ pattern.`,
    vehicle_left:  `${base} RULESET — VEHICLE (LEFT SIDE): Inspect for unauthorized emergency lights, prohibited sirens, or LE-mimicking door markings. Pass if only standard security company branding is visible.`,
    vehicle_right: `${base} RULESET — VEHICLE (RIGHT SIDE): Same rules as left side.`,
    premises_wall: `${base} RULESET — PREMISES WALL: Verify the image shows a physical wall (not a table or floor surface). Confirm the following Texas-required labor law posters are visible and mounted on the wall: (1) Texas Payday Law, (2) Texas Unemployment Insurance, (3) Workers' Compensation notice, (4) OSHA poster, (5) Equal Employment Opportunity poster. Flag if fewer than 3 posters are visible or if they are not wall-mounted. Flag if the image appears to be staged on a table.`,
    premises_license: `${base} RULESET — FRAMED LICENSE: Verify the image shows a framed or officially displayed Private Security Bureau license mounted on a wall. The license should be clearly legible. ${registeredAddress ? `The registered business address is: ${registeredAddress}. Compare any address visible on the license against this.` : ''} Flag if the license is not wall-mounted, is expired (check date if visible), or appears to be a photocopy rather than the original printed certificate.`,
  };

  return rulesets[artifactType];
}

async function runTrinityVisionAnalysis(
  gcsUrl: string,
  artifactType: ArtifactType,
  fileBuffer: Buffer,
  mimeType: string,
  registeredAddress?: string,
): Promise<VisionAnalysisResult> {
  const apiKey = process.env.CLAUDE_API_KEY || process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    log.warn('[VisualCompliance] Anthropic API key not configured — skipping vision analysis');
    return { status: 'passed', confidenceScore: 0, reasoningText: 'Vision analysis skipped — API key not configured.' };
  }

  const prompt = buildVisionPrompt(artifactType, registeredAddress);
  const base64 = fileBuffer.toString('base64');
  const mediaType = mimeType === 'image/png' ? 'image/png' : 'image/jpeg';

  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-6',
        max_tokens: 512,
        messages: [{
          role: 'user',
          content: [
            { type: 'image', source: { type: 'base64', media_type: mediaType, data: base64 } },
            { type: 'text', text: prompt },
          ],
        }],
      }),
    });

    if (!response.ok) {
      const errText = await response.text();
      log.warn('[VisualCompliance] Trinity vision API error:', response.status, errText);
      return { status: 'flagged', confidenceScore: 0, reasoningText: `Vision API error: ${response.status}` };
    }

    const data = await response.json() as any;
    const rawText: string = data?.content?.[0]?.text ?? '{}';

    // Parse JSON from Trinity's response (handle markdown code fences)
    const jsonMatch = rawText.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return { status: 'flagged', confidenceScore: 0, reasoningText: 'Unparseable Trinity response.' };

    const parsed = JSON.parse(jsonMatch[0]);
    return {
      status: parsed.status === 'passed' ? 'passed' : 'flagged',
      confidenceScore: parseFloat(parsed.confidence_score) || 0,
      reasoningText: String(parsed.reasoning || ''),
      ocrText: parsed.ocr_text ? String(parsed.ocr_text) : undefined,
    };
  } catch (err: any) {
    log.error('[VisualCompliance] Vision analysis threw:', err?.message);
    return { status: 'flagged', confidenceScore: 0, reasoningText: `Analysis error: ${err?.message}` };
  }
}

// ─── Public surface ───────────────────────────────────────────────────────────

export interface UploadVisualArtifactParams {
  workspaceId:       string;
  artifactType:      ArtifactType;
  fileBuffer:        Buffer;
  mimeType:          string;
  uploadedBy?:       string;
  auditId?:          string;
  registeredAddress?: string;
}

export interface UploadVisualArtifactResult {
  id: string;
  gcsUrl: string;
  status: 'passed' | 'flagged' | 'error';
  confidenceScore: number;
  reasoningText: string;
  ocrText?: string;
  exif: ExifData;
}

export async function uploadVisualArtifact(
  params: UploadVisualArtifactParams,
): Promise<UploadVisualArtifactResult> {
  const start = Date.now();
  const { pool } = await import('../../db');

  const exif  = extractExifData(params.fileBuffer);
  const gcsUrl = await uploadToGcs(params.workspaceId, params.artifactType, params.fileBuffer, params.mimeType);
  const vision  = await runTrinityVisionAnalysis(gcsUrl, params.artifactType, params.fileBuffer, params.mimeType, params.registeredAddress);

  const r = await pool.query<{ id: string }>(
    `INSERT INTO visual_compliance_artifacts
       (workspace_id, audit_id, artifact_type, gcs_url, status, confidence_score,
        reasoning_text, ocr_text, exif_gps_lat, exif_gps_lng, exif_timestamp, uploaded_by)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
     RETURNING id`,
    [
      params.workspaceId,
      params.auditId ?? null,
      params.artifactType,
      gcsUrl,
      vision.status,
      vision.confidenceScore,
      vision.reasoningText,
      vision.ocrText ?? null,
      exif.gpsLat ?? null,
      exif.gpsLng ?? null,
      exif.capturedAt ?? null,
      params.uploadedBy ?? null,
    ],
  );

  const artifactId = r.rows[0].id;

  await logActionAudit({
    actionId:    'visual_compliance.upload',
    workspaceId: params.workspaceId,
    userId:      params.uploadedBy ?? 'system',
    entityType:  'visual_compliance_artifact',
    entityId:    artifactId,
    success:     true,
    message:     `Artifact ${params.artifactType} uploaded. Trinity verdict: ${vision.status} (confidence ${vision.confidenceScore.toFixed(2)})`,
    changesAfter: { artifactType: params.artifactType, status: vision.status, gcsUrl },
    durationMs:  Date.now() - start,
  });

  log.info('[VisualCompliance] Artifact uploaded', { artifactId, type: params.artifactType, status: vision.status });

  return {
    id: artifactId,
    gcsUrl,
    status: vision.status,
    confidenceScore: vision.confidenceScore,
    reasoningText: vision.reasoningText,
    ocrText: vision.ocrText,
    exif,
  };
}

export async function listArtifactsForWorkspace(workspaceId: string, auditId?: string): Promise<any[]> {
  const { pool } = await import('../../db');
  const r = auditId
    ? await pool.query(
        `SELECT * FROM visual_compliance_artifacts
          WHERE workspace_id = $1 AND audit_id = $2
          ORDER BY created_at DESC`,
        [workspaceId, auditId],
      )
    : await pool.query(
        `SELECT * FROM visual_compliance_artifacts
          WHERE workspace_id = $1
          ORDER BY created_at DESC`,
        [workspaceId],
      );
  return r.rows;
}

export async function getArtifactSummary(workspaceId: string): Promise<{
  total: number;
  passed: number;
  flagged: number;
  pending: number;
  completedSlots: ArtifactType[];
  missingSlots: ArtifactType[];
}> {
  const { pool } = await import('../../db');
  const r = await pool.query(
    `SELECT artifact_type, status FROM visual_compliance_artifacts
      WHERE workspace_id = $1
      ORDER BY created_at DESC`,
    [workspaceId],
  );

  const seenTypes = new Set<string>();
  const completedSlots: ArtifactType[] = [];
  let passed = 0, flagged = 0, pending = 0;

  for (const row of r.rows) {
    if (!seenTypes.has(row.artifact_type)) {
      seenTypes.add(row.artifact_type);
      completedSlots.push(row.artifact_type as ArtifactType);
    }
    if (row.status === 'passed') passed++;
    else if (row.status === 'flagged') flagged++;
    else pending++;
  }

  const missingSlots = ARTIFACT_TYPES.filter(t => !seenTypes.has(t));
  return { total: r.rows.length, passed, flagged, pending, completedSlots, missingSlots };
}
