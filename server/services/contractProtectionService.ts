/**
 * Phase G — Contract Protection System
 * CoAIleague Legal/Safety Sprint
 *
 * Tracks contract versions, amendments, signature validity, and
 * expiration warnings for all client service agreements.
 * Uses the existing amendment_data JSONB and content_hash columns.
 */

import { createHash } from "crypto";
import { db, pool } from "../db";
import { sql } from "drizzle-orm";
import { typedPool, typedPoolExec } from '../lib/typedSql';

export interface ContractAmendment {
  version: number;
  contentHash: string;
  capturedAt: string;
  capturedBy: string;
  changeType: "created" | "amended" | "renewed" | "terminated" | "signed";
  changeSummary: string;
}

export interface ContractSnapshot {
  contractId: string;
  workspaceId: string;
  version: number;
  contentHash: string;
  capturedAt: string;
  capturedBy: string;
  changeType: ContractAmendment["changeType"];
  changeSummary: string;
}

export interface ContractExpirationAlert {
  contractId: string;
  clientName: string;
  expiresAt: string;
  daysUntilExpiry: number;
  urgency: "critical" | "warning" | "notice";
}

export interface ContractIntegrityReport {
  workspaceId: string;
  reportedAt: string;
  totalContracts: number;
  integrityPassed: number;
  integrityFailed: number;
  expiringSoon: ContractExpirationAlert[];
  tamperDetected: Array<{ contractId: string; clientName: string }>;
}

// ─── Hash Utilities ───────────────────────────────────────────────────────────

export function hashContractContent(contract: Record<string, unknown>): string {
  const canonical = JSON.stringify({
    id: contract.id,
    content: contract.content,
    billing_terms: contract.billing_terms,
    services: contract.services,
    total_value: contract.total_value,
    special_terms: contract.special_terms,
    effective_date: contract.effective_date,
    term_end_date: contract.term_end_date,
    client_name: contract.client_name,
    client_email: contract.client_email,
  });
  return createHash("sha256").update(canonical, "utf8").digest("hex");
}

// ─── Snapshot a Contract Version ─────────────────────────────────────────────

export async function snapshotContract(params: {
  contractId: string;
  workspaceId: string;
  capturedBy: string;
  changeType: ContractAmendment["changeType"];
  changeSummary: string;
}): Promise<ContractSnapshot | null> {
  const { contractId, workspaceId, capturedBy, changeType, changeSummary } = params;

  const result = await typedPool(
    `SELECT * FROM client_contracts WHERE id = $1 AND workspace_id = $2`,
    [contractId, workspaceId]
  );
  if (!(result as any).length) return null;

  const contract = result[0];
  const contentHash = hashContractContent(contract);
  const nextVersion = (contract.version || 0) + 1;

  const existingAmendments: ContractAmendment[] = Array.isArray(contract.amendment_data)
    ? contract.amendment_data
    : (typeof contract.amendment_data === "object" && contract.amendment_data?.amendments)
      ? contract.amendment_data.amendments
      : [];

  const newAmendment: ContractAmendment = {
    version: nextVersion,
    contentHash,
    capturedAt: new Date().toISOString(),
    capturedBy,
    changeType,
    changeSummary,
  };

  const updatedAmendments = [...existingAmendments, newAmendment];

  // CATEGORY C — Raw SQL retained: ::jsonb | Tables: client_contracts | Verified: 2026-03-23
  await typedPoolExec(
    `UPDATE client_contracts
     SET version = $1,
         content_hash = $2,
         amendment_data = amendment_data || $3::jsonb,
         updated_at = NOW()
     WHERE id = $4 AND workspace_id = $5`,
    [nextVersion, contentHash, JSON.stringify({ amendments: updatedAmendments, lastSnapshot: newAmendment }), contractId, workspaceId]
  );

  return {
    contractId,
    workspaceId,
    version: nextVersion,
    contentHash,
    capturedAt: newAmendment.capturedAt,
    capturedBy,
    changeType,
    changeSummary,
  };
}

// ─── Verify Contract Integrity ────────────────────────────────────────────────

export async function verifyContractIntegrity(contractId: string, workspaceId: string): Promise<{
  passed: boolean;
  contractId: string;
  clientName: string;
  storedHash: string | null;
  computedHash: string | null;
  tamperDetected: boolean;
  message: string;
}> {
  const result = await typedPool(
    `SELECT * FROM client_contracts WHERE id = $1 AND workspace_id = $2`,
    [contractId, workspaceId]
  );
  if (!(result as any).length) {
    return { passed: false, contractId, clientName: "Unknown", storedHash: null, computedHash: null, tamperDetected: false, message: "Contract not found" };
  }

  const contract = result[0];
  if (!contract.content_hash) {
    return { passed: true, contractId, clientName: contract.client_name, storedHash: null, computedHash: null, tamperDetected: false, message: "No hash stored — contract predates integrity tracking" };
  }

  const computedHash = hashContractContent(contract);
  const tamperDetected = computedHash !== contract.content_hash;

  return {
    passed: !tamperDetected,
    contractId,
    clientName: contract.client_name,
    storedHash: contract.content_hash,
    computedHash,
    tamperDetected,
    message: tamperDetected
      ? "INTEGRITY FAILURE: Contract content has been modified outside the system. Investigate immediately."
      : "Integrity verified — contract matches stored hash.",
  };
}

// ─── Expiration Scan ──────────────────────────────────────────────────────────

export async function scanContractExpirations(workspaceId: string): Promise<ContractExpirationAlert[]> {
  // Converted to Drizzle ORM: scanContractExpirations → INTERVAL + inArray
  const { clientContracts } = await import('@shared/schema');
  const { and, eq, inArray, isNotNull, gt, lt, asc, sql: drizzleSql } = await import('drizzle-orm');

  const result = await db
    .select({
      id: clientContracts.id,
      clientName: clientContracts.clientName,
      expiresAt: clientContracts.expiresAt,
      termEndDate: clientContracts.termEndDate,
    })
    .from(clientContracts)
    .where(and(
      eq(clientContracts.workspaceId, workspaceId),
      inArray(clientContracts.status, ['active', 'executed', 'signed']),
      isNotNull(drizzleSql`COALESCE(${clientContracts.expiresAt}, ${clientContracts.termEndDate})`),
      gt(drizzleSql`COALESCE(${clientContracts.expiresAt}, ${clientContracts.termEndDate})`, drizzleSql`NOW()`),
      lt(drizzleSql`COALESCE(${clientContracts.expiresAt}, ${clientContracts.termEndDate})`, drizzleSql`NOW() + INTERVAL '90 days'`),
    ))
    .orderBy(asc(drizzleSql`COALESCE(${clientContracts.expiresAt}, ${clientContracts.termEndDate})`));

  return result.map(row => {
    const expiryDate = row.expiresAt || row.termEndDate;
    const daysUntilExpiry = Math.ceil(
      (new Date(expiryDate!).getTime() - Date.now()) / (1000 * 60 * 60 * 24)
    );
    const urgency: ContractExpirationAlert["urgency"] =
      daysUntilExpiry <= 14 ? "critical" :
      daysUntilExpiry <= 30 ? "warning" : "notice";
    return {
      contractId: row.id,
      clientName: row.clientName!,
      expiresAt: new Date(expiryDate!).toISOString(),
      daysUntilExpiry,
      urgency,
    };
  });
}

// ─── Full Workspace Integrity Report ─────────────────────────────────────────

export async function generateContractIntegrityReport(workspaceId: string): Promise<ContractIntegrityReport> {
  // Converted to Drizzle ORM: generateContractIntegrityReport → inArray
  const { clientContracts } = await import('@shared/schema');
  const { and, eq, inArray } = await import('drizzle-orm');

  const contractsData = await db
    .select({ id: clientContracts.id })
    .from(clientContracts)
    .where(and(
      eq(clientContracts.workspaceId, workspaceId),
      inArray(clientContracts.status, ['active', 'executed', 'signed', 'accepted']),
    ));

  let passed = 0;
  let failed = 0;
  const tamperDetected: Array<{ contractId: string; clientName: string }> = [];

  for (const row of contractsData) {
    const check = await verifyContractIntegrity(row.id, workspaceId);
    if (check.passed) {
      passed++;
    } else {
      failed++;
      if (check.tamperDetected) {
        tamperDetected.push({ contractId: row.id, clientName: check.clientName });
      }
    }
  }

  const expiring = await scanContractExpirations(workspaceId);

  return {
    workspaceId,
    reportedAt: new Date().toISOString(),
    totalContracts: contractsData.length,
    integrityPassed: passed,
    integrityFailed: failed,
    expiringSoon: expiring,
    tamperDetected,
  };
}
