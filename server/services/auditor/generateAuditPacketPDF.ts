/**
 * Generate Audit Packet PDF — AI Regulatory Audit Suite Phase 4
 * =============================================================
 * Trinity compiles requested compliance data (office info, guard cards,
 * schedules, licenses) into a single PDF "audit packet." The packet is
 * never sent directly to the auditor — it goes through the HITL approval
 * loop (see auditChatService.ts) where the Tenant Owner reviews, modifies,
 * and approves before it is released.
 *
 * PDF generation uses pdfkit (consistent with darPdfService, formsPdfService).
 * Final PDF is stored in GCS under workspaces/{workspaceId}/audit-packets/.
 * All operations are audit-logged (TRINITY.md §L).
 * All GCS keys are workspace-scoped (TRINITY.md §G).
 */

import PDFDocument from 'pdfkit';
import { Storage } from '@google-cloud/storage';
import { createLogger } from '../../lib/logger';
import { logActionAudit } from '../ai-brain/actionAuditLogger';

const log = createLogger('GenerateAuditPacketPDF');

// ─── Data loaders ─────────────────────────────────────────────────────────────

async function loadWorkspaceInfo(workspaceId: string): Promise<unknown> {
  const { pool } = await import('../../db');
  const r = await pool.query(
    `SELECT company_name, phone, email, address, city, state, zip,
            license_number, subscription_tier
       FROM workspaces
      WHERE id = $1`,
    [workspaceId],
  );
  return r.rows[0] ?? {};
}

async function loadGuardCards(workspaceId: string): Promise<any[]> {
  const { pool } = await import('../../db');
  const r = await pool.query(
    `SELECT e.first_name, e.last_name, e.employee_number,
            e.license_number, e.license_expiry, e.role,
            e.hire_date, e.status
       FROM employees e
      WHERE e.workspace_id = $1
        AND e.status = 'active'
        AND e.deleted_at IS NULL
      ORDER BY e.last_name, e.first_name`,
    [workspaceId],
  );
  return r.rows;
}

async function loadRecentSchedule(workspaceId: string): Promise<any[]> {
  const { pool } = await import('../../db');
  const r = await pool.query(
    `SELECT s.id, s.start_time, s.end_time, s.status,
            e.first_name || ' ' || e.last_name AS employee_name,
            e.employee_number,
            c.name AS client_name, l.name AS location_name
       FROM shifts s
       LEFT JOIN employees e   ON e.id = s.employee_id
       LEFT JOIN clients c     ON c.id = s.client_id
       LEFT JOIN locations l   ON l.id = s.location_id
      WHERE s.workspace_id = $1
        AND s.start_time >= NOW() - INTERVAL '30 days'
        AND s.start_time <= NOW() + INTERVAL '7 days'
        AND s.status NOT IN ('cancelled','denied')
      ORDER BY s.start_time DESC
      LIMIT 100`,
    [workspaceId],
  );
  return r.rows;
}

async function loadVisualComplianceArtifacts(workspaceId: string): Promise<any[]> {
  const { pool } = await import('../../db');
  const r = await pool.query(
    `SELECT artifact_type, status, confidence_score, reasoning_text, ocr_text, created_at
       FROM visual_compliance_artifacts
      WHERE workspace_id = $1
      ORDER BY created_at DESC
      LIMIT 20`,
    [workspaceId],
  );
  return r.rows;
}

// ─── PDF builder ──────────────────────────────────────────────────────────────

interface AuditPacketOptions {
  workspaceId: string;
  auditId:     string;
  requestedBy: string; // auditorId or 'trinity'
  sections?: ('office_info' | 'guard_cards' | 'schedule' | 'visual_compliance')[];
  modifyInstructions?: string; // Natural-language redaction/modification instructions
}

async function applyModifyInstructions(
  data: {
    workspace: any;
    guards: any[];
    schedule: any[];
    artifacts: any[];
  },
  instructions: string,
): Promise<typeof data> {
  // Trinity interprets natural-language modification rules and applies them
  const apiKey = process.env.CLAUDE_API_KEY || process.env.ANTHROPIC_API_KEY;
  if (!apiKey || !instructions.trim()) return data;

  const prompt = `You are Trinity. An owner has asked you to modify an audit packet before sending it to a regulator. Apply ONLY the modifications requested. Return a JSON object with the same structure as the input, with the requested changes applied.

MODIFICATION INSTRUCTIONS: ${instructions}

CURRENT DATA:
${JSON.stringify(data, null, 2).substring(0, 3000)}

Rules:
- "remove page 3" or "remove schedule" → set schedule to []
- "scrub social security numbers" → remove any ssn fields from all records
- "remove [employee name]" → filter that employee out of guards and schedule arrays
- "remove salary" or "remove pay rate" → delete hourly_rate, salary fields from each record
- If you cannot safely apply an instruction, include it unchanged and add a note in a "trinity_notes" field
- Return ONLY valid JSON with the same top-level structure: { workspace, guards, schedule, artifacts, trinity_notes? }`;

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
        max_tokens: 2048,
        messages: [{ role: 'user', content: prompt }],
      }),
    });

    if (!response.ok) return data;
    const res = await response.json() as any;
    const text: string = res?.content?.[0]?.text ?? '{}';
    const match = text.match(/\{[\s\S]*\}/);
    if (!match) return data;
    const modified = JSON.parse(match[0]);
    return {
      workspace:  modified.workspace  ?? data.workspace,
      guards:     modified.guards     ?? data.guards,
      schedule:   modified.schedule   ?? data.schedule,
      artifacts:  modified.artifacts  ?? data.artifacts,
    };
  } catch {
    return data; // Fail-safe: return unmodified data
  }
}

function buildPdf(
  data: { workspace: any; guards: any[]; schedule: any[]; artifacts: any[] },
  auditId: string,
): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    const doc = new PDFDocument({ margin: 50, size: 'LETTER' });

    doc.on('data', (chunk: Buffer) => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    const navy = '#1a2744';
    const gold  = '#c9a227';
    const gray  = '#5a5a5a';

    // ── Cover ─────────────────────────────────────────────────────────────────
    doc.rect(0, 0, 612, 120).fill(navy);
    doc.fillColor('white').fontSize(22).font('Helvetica-Bold')
      .text('COAILEAGUE — REGULATORY AUDIT PACKET', 50, 35);
    doc.fontSize(11).font('Helvetica')
      .text(`Generated by Trinity Intelligence  |  Audit ID: ${auditId}`, 50, 70)
      .text(`Date: ${new Date().toLocaleDateString('en-US', { dateStyle: 'long' })}`, 50, 88);

    doc.fillColor(navy);
    doc.moveDown(2);

    const section = (title: string) => {
      doc.addPage();
      doc.rect(50, 50, 512, 30).fill(navy);
      doc.fillColor('white').fontSize(14).font('Helvetica-Bold')
        .text(title, 60, 58);
      doc.fillColor(navy).moveDown(2);
    };

    // ── Section 1: Office Information ─────────────────────────────────────────
    section('Section 1 — Business Office Information');
    const ws = data.workspace;
    doc.fontSize(11).font('Helvetica');
    const officeLines: [string, string][] = [
      ['Company Name',    ws.company_name    ?? 'N/A'],
      ['License Number',  ws.license_number  ?? 'N/A'],
      ['Phone',           ws.phone           ?? 'N/A'],
      ['Email',           ws.email           ?? 'N/A'],
      ['Address',         [ws.address, ws.city, ws.state, ws.zip].filter(Boolean).join(', ') || 'N/A'],
    ];
    for (const [label, value] of officeLines) {
      doc.fillColor(gray).text(`${label}:`, 60, doc.y, { continued: true, width: 150 });
      doc.fillColor(navy).text(` ${value}`, { width: 362 });
    }

    // ── Section 2: Guard Cards / Personnel ────────────────────────────────────
    if (data.guards.length > 0) {
      section('Section 2 — Active Guard Cards & Personnel');
      doc.fontSize(9).font('Helvetica-Bold').fillColor(navy);
      doc.text('Name', 60, doc.y, { width: 130, continued: true });
      doc.text('Employee #', { width: 90, continued: true });
      doc.text('License #', { width: 110, continued: true });
      doc.text('Expiry', { width: 90, continued: true });
      doc.text('Status', { width: 80 });
      doc.moveTo(60, doc.y + 3).lineTo(562, doc.y + 3).stroke(gold);
      doc.moveDown(0.5);

      doc.fontSize(9).font('Helvetica').fillColor(gray);
      for (const g of data.guards) {
        const name = `${g.last_name ?? ''}, ${g.first_name ?? ''}`;
        const expiry = g.license_expiry
          ? new Date(g.license_expiry).toLocaleDateString('en-US')
          : 'N/A';
        doc.text(name, 60, doc.y, { width: 130, continued: true });
        doc.text(g.employee_number ?? 'N/A', { width: 90, continued: true });
        doc.text(g.license_number  ?? 'N/A', { width: 110, continued: true });
        doc.text(expiry,                      { width: 90, continued: true });
        doc.text(g.status          ?? 'N/A', { width: 80 });
        if (doc.y > 700) { doc.addPage(); }
      }
    }

    // ── Section 3: Schedule (last 30d / next 7d) ──────────────────────────────
    if (data.schedule.length > 0) {
      section('Section 3 — Shift Schedule (30-day lookback / 7-day forecast)');
      doc.fontSize(9).font('Helvetica-Bold').fillColor(navy);
      doc.text('Employee', 60, doc.y, { width: 130, continued: true });
      doc.text('Client', { width: 110, continued: true });
      doc.text('Start', { width: 110, continued: true });
      doc.text('End', { width: 110 });
      doc.moveTo(60, doc.y + 3).lineTo(562, doc.y + 3).stroke(gold);
      doc.moveDown(0.5);

      doc.fontSize(9).font('Helvetica').fillColor(gray);
      for (const s of data.schedule) {
        const start = s.start_time ? new Date(s.start_time).toLocaleString('en-US') : 'N/A';
        const end   = s.end_time   ? new Date(s.end_time).toLocaleString('en-US')   : 'N/A';
        doc.text(s.employee_name ?? 'N/A', 60, doc.y, { width: 130, continued: true });
        doc.text(s.client_name   ?? 'N/A', { width: 110, continued: true });
        doc.text(start, { width: 110, continued: true });
        doc.text(end,   { width: 110 });
        if (doc.y > 700) { doc.addPage(); }
      }
    }

    // ── Section 4: Visual Compliance Artifacts ────────────────────────────────
    if (data.artifacts.length > 0) {
      section('Section 4 — Visual Compliance Audit Results');
      doc.fontSize(10).font('Helvetica').fillColor(gray);
      for (const a of data.artifacts) {
        const statusColor = a.status === 'passed' ? '#27ae60' : a.status === 'flagged' ? '#e74c3c' : gray;
        doc.font('Helvetica-Bold').fillColor(navy)
          .text(String(a.artifact_type).replace(/_/g, ' ').toUpperCase(), 60, doc.y);
        doc.font('Helvetica').fillColor(statusColor)
          .text(`Status: ${a.status?.toUpperCase() ?? 'N/A'}  |  Confidence: ${a.confidence_score ? (Number(a.confidence_score) * 100).toFixed(0) + '%' : 'N/A'}`);
        if (a.reasoning_text) {
          doc.fillColor(gray).text(a.reasoning_text, { width: 500 });
        }
        if (a.ocr_text) {
          doc.fillColor(gray).text(`OCR: ${a.ocr_text}`, { width: 500 });
        }
        doc.moveDown(0.5);
        if (doc.y > 700) { doc.addPage(); }
      }
    }

    // ── Footer ─────────────────────────────────────────────────────────────────
    doc.addPage();
    doc.rect(50, 700, 512, 60).fill(navy);
    doc.fillColor('white').fontSize(9).font('Helvetica')
      .text(
        'This document was compiled by Trinity Intelligence on behalf of the above-named security company. ' +
        'All information is derived from the company\'s own CoAIleague records. ' +
        'This packet was reviewed and approved by the Tenant Owner before release.',
        60, 710, { width: 492, align: 'center' },
      );

    doc.end();
  });
}

// ─── GCS storage ─────────────────────────────────────────────────────────────

async function saveDraftToGcs(workspaceId: string, auditId: string, pdfBuffer: Buffer): Promise<string> {
  const storage = new Storage();
  const bucketName = process.env.DEFAULT_OBJECT_STORAGE_BUCKET_ID;
  if (!bucketName) throw new Error('DEFAULT_OBJECT_STORAGE_BUCKET_ID not configured');

  const gcsKey = `workspaces/${workspaceId}/audit-packets/draft_${auditId}_${Date.now()}.pdf`;
  await storage.bucket(bucketName).file(gcsKey).save(pdfBuffer, {
    contentType: 'application/pdf',
    resumable: false,
  });
  return `gs://${bucketName}/${gcsKey}`;
}

// ─── Public interface ─────────────────────────────────────────────────────────

export interface GenerateAuditPacketResult {
  draftId: string;
  gcsUrl: string;
  message: string; // Private message to Tenant Owner from Trinity
}

/**
 * Generates a draft audit packet PDF, stores it in GCS, writes a
 * audit_packet_drafts row, and returns a private message for the
 * Tenant Owner's HITL approval gate.
 */
export async function generateAuditPacketPDF(
  options: AuditPacketOptions,
): Promise<GenerateAuditPacketResult> {
  const start = Date.now();
  const { pool } = await import('../../db');

  // Load all data (workspace-scoped per TRINITY.md §G)
  let rawData = {
    workspace: await loadWorkspaceInfo(options.workspaceId),
    guards:    await loadGuardCards(options.workspaceId),
    schedule:  await loadRecentSchedule(options.workspaceId),
    artifacts: await loadVisualComplianceArtifacts(options.workspaceId),
  };

  // Apply natural-language modification instructions if provided
  if (options.modifyInstructions) {
    rawData = await applyModifyInstructions(rawData, options.modifyInstructions);
  }

  const pdfBuffer = await buildPdf(rawData, options.auditId);
  const gcsUrl    = await saveDraftToGcs(options.workspaceId, options.auditId, pdfBuffer);

  const r = await pool.query<{ id: string }>(
    `INSERT INTO audit_packet_drafts
       (audit_id, workspace_id, gcs_url, status)
     VALUES ($1,$2,$3,'pending_owner_review')
     RETURNING id`,
    [options.auditId, options.workspaceId, gcsUrl],
  );

  const draftId = r.rows[0].id;

  await logActionAudit({
    actionId:    'audit_packet.generated',
    workspaceId: options.workspaceId,
    userId:      options.requestedBy,
    entityType:  'audit_packet_draft',
    entityId:    draftId,
    success:     true,
    message:     `Draft audit packet PDF generated for audit ${options.auditId}`,
    changesAfter: { draftId, gcsUrl, modifyInstructions: options.modifyInstructions },
    durationMs:   Date.now() - start,
  });

  log.info('[AuditPacket] Draft generated', { draftId, auditId: options.auditId });

  const ownerMessage = `Trinity has compiled an audit packet containing the information requested by the auditor. The packet includes: business office information, active guard cards (${rawData.guards.length} personnel), shift schedule (last 30 days), and visual compliance results.\n\nPlease preview and review the document before releasing it to the auditor. You may request modifications using plain language (e.g., "Remove page 3" or "Scrub social security numbers") and Trinity will regenerate the packet.\n\nThis document will NOT be sent to the auditor until you click "Approve & Send."`;

  return { draftId, gcsUrl, message: ownerMessage };
}

/**
 * Approve a draft and mark it sent to the auditor.
 */
export async function approveAndSendDraft(
  draftId: string,
  workspaceId: string,
  approvedByUserId: string,
): Promise<{ gcsUrl: string }> {
  const { pool } = await import('../../db');
  const r = await pool.query<{ gcs_url: string; audit_id: string }>(
    `UPDATE audit_packet_drafts
        SET status = 'approved', approved_by = $1, approved_at = NOW(),
            sent_to_auditor = true, sent_at = NOW(), updated_at = NOW()
      WHERE id = $2 AND workspace_id = $3 AND status = 'pending_owner_review'
      RETURNING gcs_url, audit_id`,
    [approvedByUserId, draftId, workspaceId],
  );
  if (!r.rows[0]) throw new Error('Draft not found or already actioned');

  await logActionAudit({
    actionId:    'audit_packet.approved_and_sent',
    workspaceId,
    userId:      approvedByUserId,
    entityType:  'audit_packet_draft',
    entityId:    draftId,
    success:     true,
    message:     `Owner approved draft ${draftId} — released to auditor`,
  });

  return { gcsUrl: r.rows[0].gcs_url };
}

/**
 * Reject a draft (owner chose "Reject / Modify"). Records the instruction
 * for regeneration.
 */
export async function rejectDraft(
  draftId: string,
  workspaceId: string,
  rejectedByUserId: string,
  modifyInstructions: string,
): Promise<void> {
  const { pool } = await import('../../db');
  await pool.query(
    `UPDATE audit_packet_drafts
        SET status = 'rejected', rejected_by = $1, rejected_at = NOW(),
            modify_instructions = $2, updated_at = NOW()
      WHERE id = $3 AND workspace_id = $4`,
    [rejectedByUserId, modifyInstructions, draftId, workspaceId],
  );

  await logActionAudit({
    actionId:    'audit_packet.rejected_for_modification',
    workspaceId,
    userId:      rejectedByUserId,
    entityType:  'audit_packet_draft',
    entityId:    draftId,
    success:     true,
    message:     `Owner requested modification of draft ${draftId}: ${modifyInstructions}`,
  });
}

export async function getDraftsForAudit(auditId: string, workspaceId: string): Promise<any[]> {
  const { pool } = await import('../../db');
  const r = await pool.query(
    `SELECT * FROM audit_packet_drafts
      WHERE audit_id = $1 AND workspace_id = $2
      ORDER BY created_at DESC`,
    [auditId, workspaceId],
  );
  return r.rows;
}
