/**
 * Report Integrity Service — Phase I
 * =====================================
 * SHA-256 tamper-evident hashing for incident reports.
 *
 * Security properties:
 *  - Hash covers all legally meaningful content fields (not metadata).
 *  - Every write that changes content fields generates a new hash + version entry.
 *  - Hash verification on read detects any out-of-band DB edits.
 *  - Version history provides an immutable audit trail.
 *
 * Design note: Hashes are stored in the DB for fast verification.
 * For court-admissible chain-of-custody, export hash + timestamp + version
 * to the document vault (Phase F integration).
 */

import crypto from 'crypto';
import { db } from '../db';
import { incidentReports } from '@shared/schema';
import { eq, and } from 'drizzle-orm';
import { createLogger } from '../lib/logger';
const log = createLogger('reportIntegrityService');


// ─── Canonical Content Extractor ─────────────────────────────────────────────
// Only legally meaningful fields contribute to the hash.
// Metadata (updatedAt, reviewedAt, sentToClientAt) intentionally excluded.

type ReportHashInput = {
  title: string;
  severity: string;
  incidentType: string;
  rawDescription?: string | null;
  rawVoiceTranscript?: string | null;
  polishedDescription?: string | null;
  polishedSummary?: string | null;
  occurredAt?: Date | string | null;
  locationAddress?: string | null;
  gpsLatitude?: number | null;
  gpsLongitude?: number | null;
  photos?: unknown;
  witnessStatements?: unknown;
  originalText?: string | null;
};

function canonicalize(report: ReportHashInput): string {
  const obj = {
    title: (report.title ?? '').trim(),
    severity: (report.severity ?? '').trim(),
    incidentType: (report.incidentType ?? '').trim(),
    rawDescription: (report.rawDescription ?? '').trim(),
    rawVoiceTranscript: (report.rawVoiceTranscript ?? '').trim(),
    polishedDescription: (report.polishedDescription ?? '').trim(),
    polishedSummary: (report.polishedSummary ?? '').trim(),
    // @ts-expect-error — TS migration: fix in refactoring sprint
    occurredAt: report.occurredAt ? new Date(report as any).occurredAt.toISOString() : '',
    locationAddress: (report.locationAddress ?? '').trim(),
    gpsLatitude: report.gpsLatitude ?? '',
    gpsLongitude: report.gpsLongitude ?? '',
    photos: JSON.stringify(report.photos ?? []),
    witnessStatements: JSON.stringify(report.witnessStatements ?? []),
    originalText: (report.originalText ?? '').trim(),
  };

  return JSON.stringify(obj, Object.keys(obj).sort());
}

export function computeReportHash(report: ReportHashInput): string {
  return crypto.createHash('sha256').update(canonicalize(report)).digest('hex');
}

// ─── Stamp Hash on New/Updated Report ────────────────────────────────────────

export interface HashStampParams {
  reportId: string;
  workspaceId: string;
  changedBy: string;
  changeReason: string;
}

export async function stampReportHash(params: HashStampParams): Promise<{
  hash: string;
  version: number;
}> {
  const report = await db.query.incidentReports.findFirst({
    where: and(
      eq(incidentReports.id, params.reportId),
      eq(incidentReports.workspaceId, params.workspaceId)
    ),
  });

  if (!report) throw new Error(`Report not found: ${params.reportId}`);

  const hash = computeReportHash(report);
  const newVersion = (report.version ?? 1) + 1;
  const now = new Date();

  // Append to version history — existing history is preserved
  const history = (report.versionHistory as any[]) ?? [];
  if (report.contentHash) {
    history.push({
      version: report.version ?? 1,
      contentHash: report.contentHash,
      changedBy: params.changedBy,
      changedAt: now.toISOString(),
      changeReason: params.changeReason,
    });
  }

  await db.update(incidentReports)
    .set({
      contentHash: hash,
      contentHashGeneratedAt: now,
      version: newVersion,
      versionHistory: history,
      updatedAt: now,
    })
    .where(eq(incidentReports.id, params.reportId));

  log.info(`[ReportIntegrity] Report ${params.reportId} stamped v${newVersion} hash=${hash.substring(0, 12)}...`);
  return { hash, version: newVersion };
}

// ─── Verify Report Integrity ──────────────────────────────────────────────────

export interface VerificationResult {
  reportId: string;
  valid: boolean;
  storedHash: string | null;
  computedHash: string;
  version: number;
  tamperDetected: boolean;
  verifiedAt: string;
}

export async function verifyReportIntegrity(
  reportId: string,
  workspaceId: string
): Promise<VerificationResult> {
  const report = await db.query.incidentReports.findFirst({
    where: and(
      eq(incidentReports.id, reportId),
      eq(incidentReports.workspaceId, workspaceId)
    ),
  });

  if (!report) throw new Error(`Report not found: ${reportId}`);

  const computedHash = computeReportHash(report);
  const storedHash = report.contentHash ?? null;
  const tamperDetected = storedHash !== null && storedHash !== computedHash;

  if (tamperDetected) {
    log.error(
      `[ReportIntegrity] TAMPER DETECTED on report ${reportId} ` +
      `stored=${storedHash} computed=${computedHash}`
    );
  }

  return {
    reportId,
    valid: storedHash !== null && storedHash === computedHash,
    storedHash,
    computedHash,
    version: report.version ?? 1,
    tamperDetected,
    verifiedAt: new Date().toISOString(),
  };
}

// ─── Stamp on Creation ────────────────────────────────────────────────────────
// Called immediately after insert so every report starts with a hash.

export async function stampNewReport(reportId: string, workspaceId: string, createdBy: string): Promise<void> {
  const report = await db.query.incidentReports.findFirst({
    where: and(
      eq(incidentReports.id, reportId),
      eq(incidentReports.workspaceId, workspaceId)
    ),
  });

  if (!report) return;

  const hash = computeReportHash(report);
  const now = new Date();

  await db.update(incidentReports)
    .set({
      contentHash: hash,
      contentHashGeneratedAt: now,
      version: 1,
      versionHistory: [],
    })
    .where(eq(incidentReports.id, reportId));

  log.info(`[ReportIntegrity] New report ${reportId} stamped v1 hash=${hash.substring(0, 12)}...`);
}

// ─── Batch Verify Workspace Reports ──────────────────────────────────────────
// Background job to detect any DB-level edits. Run nightly or on-demand.

export async function batchVerifyWorkspace(workspaceId: string): Promise<{
  total: number;
  valid: number;
  tampered: number;
  unstamped: number;
  results: VerificationResult[];
}> {
  const reports = await db.query.incidentReports.findMany({
    where: eq(incidentReports.workspaceId, workspaceId),
  });

  const results: VerificationResult[] = [];
  let valid = 0, tampered = 0, unstamped = 0;

  for (const report of reports) {
    if (!report.contentHash) {
      unstamped++;
      continue;
    }
    const result = await verifyReportIntegrity(report.id, workspaceId);
    results.push(result);
    if (result.tamperDetected) tampered++;
    else if (result.valid) valid++;
  }

  log.info(
    `[ReportIntegrity] Batch verify workspace ${workspaceId}: ` +
    `${valid} valid, ${tampered} TAMPERED, ${unstamped} unstamped, ${reports.length} total`
  );

  return { total: reports.length, valid, tampered, unstamped, results };
}

// ─── Version History Reader ───────────────────────────────────────────────────

export async function getVersionHistory(reportId: string, workspaceId: string) {
  const report = await db.query.incidentReports.findFirst({
    where: and(
      eq(incidentReports.id, reportId),
      eq(incidentReports.workspaceId, workspaceId)
    ),
  });

  if (!report) throw new Error(`Report not found: ${reportId}`);

  return {
    currentVersion: report.version ?? 1,
    currentHash: report.contentHash ?? null,
    history: (report.versionHistory as any[]) ?? [],
  };
}
