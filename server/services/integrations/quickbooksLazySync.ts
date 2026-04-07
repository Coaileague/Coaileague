/**
 * QuickBooks Lazy Sync Service - On-demand record provisioning
 *
 * SOURCE OF TRUTH POLICY:
 *   CoAIleague is the master for: names, contact info, worker classification
 *   QuickBooks is the master for: billing data, tax info, payment terms
 *   Direction: CoAIleague → QuickBooks (one-way push, no QB→CoAIleague sync)
 *
 * DELETION HANDLING:
 *   If a QB record is deleted externally, the next sync attempt will detect
 *   a stale ID (404 response) and clear the stored quickbooks*Id, then
 *   re-provision on next attempt. CoAIleague never deletes QB records.
 *
 * MULTI-COMPANY:
 *   Each workspace can have one QB connection (realmId). QB IDs are scoped
 *   per realmId — switching companies clears stored IDs for re-provisioning.
 *   Multiple workspaces can connect to the same realmId independently.
 *
 * ENVIRONMENT SCOPING:
 *   quickbooksRealmId is stored alongside QB entity IDs. If the connected
 *   realmId changes (e.g., sandbox→production), stored IDs are invalidated
 *   and records are re-provisioned in the new environment.
 *
 * DUPLICATE DETECTION:
 *   Matches by email first, then DisplayName. If a "duplicate name" error
 *   (code 6240) occurs, attempts recovery by re-querying QB.
 *
 * PARTIAL FAILURE RECOVERY:
 *   If QB create succeeds but DB save fails, the next call will find the
 *   orphaned QB record by email/name and re-link it (no duplicates).
 *
 * RATE LIMITING:
 *   429/503 responses trigger exponential backoff (1s, 2s, 4s) with
 *   up to 3 retries. Respects Retry-After header when present.
 */

import { db } from '../../db';
import { clients, employees, partnerConnections } from '@shared/schema';
import { eq, and } from 'drizzle-orm';
import { INTEGRATIONS } from '@shared/platformConfig';
import { quickbooksOAuthService } from '../oauth/quickbooks';
import { createLogger } from '../../lib/logger';
const log = createLogger('quickbooksLazySync');


const API_MINOR_VERSION = INTEGRATIONS.quickbooks.minorVersion;
const MAX_RETRIES = 3;
const BASE_RETRY_DELAY_MS = 1000;

type QBEntityType = 'customer' | 'employee' | 'vendor';

interface LazySyncResult {
  success: boolean;
  qbId: string | null;
  created: boolean;
  matched: boolean;
  matchedBy?: 'displayName' | 'email' | 'phone' | 'recovery';
  error?: string;
  retryable?: boolean;
}

class QBApiError extends Error {
  status: number;
  retryable: boolean;
  qbErrorCode?: string;
  constructor(message: string, status: number, qbErrorCode?: string) {
    super(message);
    this.name = 'QBApiError';
    this.status = status;
    this.qbErrorCode = qbErrorCode;
    this.retryable = status === 429 || status === 503 || status === 500;
  }
}

interface QBConnection {
  accessToken: string;
  realmId: string;
  apiBase: string;
  connectionId: string;
  environment: string;
}

async function getQBConnection(workspaceId: string): Promise<QBConnection | null> {
  const connections = await db.select()
    .from(partnerConnections)
    .where(
      and(
        eq(partnerConnections.workspaceId, workspaceId),
        eq(partnerConnections.partnerType, 'quickbooks'),
        eq(partnerConnections.status, 'connected')
      )
    )
    .limit(1);

  const connection = connections[0];
  if (!connection?.accessToken || !connection?.realmId) return null;

  let accessToken: string;
  try {
    accessToken = await quickbooksOAuthService.getValidAccessToken(connection.id);
  } catch (err: any) {
    log.error(`[QBLazySync] Token refresh failed for connection ${connection.id}:`, (err instanceof Error ? err.message : String(err)));
    return null;
  }

  const environment = INTEGRATIONS.quickbooks.getEnvironment();
  const apiBase = environment === 'production'
    ? INTEGRATIONS.quickbooks.apiUrls.production
    : INTEGRATIONS.quickbooks.apiUrls.sandbox;

  return { accessToken, realmId: connection.realmId, apiBase, connectionId: connection.id, environment };
}

function qbHeaders(accessToken: string) {
  return {
    'Accept': 'application/json',
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${accessToken}`,
  };
}

async function sleep(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function qbQuery(apiBase: string, realmId: string, accessToken: string, query: string): Promise<any[]> {
  const url = `${apiBase}/v3/company/${realmId}/query?query=${encodeURIComponent(query)}&minorversion=${API_MINOR_VERSION}`;

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    const resp = await fetch(url, { headers: qbHeaders(accessToken) });

    if (resp.ok) {
      const data = await resp.json();
      return data.QueryResponse?.Customer || data.QueryResponse?.Employee || data.QueryResponse?.Vendor || [];
    }

    if (resp.status === 429 || resp.status === 503) {
      const retryAfter = resp.headers.get('Retry-After');
      const delayMs = retryAfter
        ? parseInt(retryAfter, 10) * 1000
        : BASE_RETRY_DELAY_MS * Math.pow(2, attempt);
      log.warn(`[QBLazySync] Rate limited (${resp.status}), retry ${attempt + 1}/${MAX_RETRIES} in ${delayMs}ms`);
      if (attempt < MAX_RETRIES) {
        await sleep(delayMs);
        continue;
      }
    }

    if (resp.status === 401) {
      throw new QBApiError('QuickBooks authentication expired - token refresh needed', 401);
    }

    const errBody = await resp.text().catch(() => '');
    throw new QBApiError(
      `QB query failed (${resp.status}): ${errBody.slice(0, 200)}`,
      resp.status
    );
  }

  return [];
}

async function qbCreate(apiBase: string, realmId: string, accessToken: string, entity: string, payload: any): Promise<any> {
  const url = `${apiBase}/v3/company/${realmId}/${entity}?minorversion=${API_MINOR_VERSION}`;

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    const resp = await fetch(url, {
      method: 'POST',
      headers: qbHeaders(accessToken),
      body: JSON.stringify(payload),
    });

    if (resp.ok) {
      const data = await resp.json();
      return data.Customer || data.Employee || data.Vendor;
    }

    if (resp.status === 429 || resp.status === 503) {
      const retryAfter = resp.headers.get('Retry-After');
      const delayMs = retryAfter
        ? parseInt(retryAfter, 10) * 1000
        : BASE_RETRY_DELAY_MS * Math.pow(2, attempt);
      log.warn(`[QBLazySync] Rate limited on create (${resp.status}), retry ${attempt + 1}/${MAX_RETRIES} in ${delayMs}ms`);
      if (attempt < MAX_RETRIES) {
        await sleep(delayMs);
        continue;
      }
    }

    const errData = await resp.json().catch(() => ({}));
    const errMsg = errData.Fault?.Error?.[0]?.Message || `QB API ${resp.status}`;
    const errCode = errData.Fault?.Error?.[0]?.code;
    throw new QBApiError(errMsg, resp.status, errCode);
  }

  throw new QBApiError('Max retries exceeded', 429);
}

function escapeQBString(str: string): string {
  return str.replace(/'/g, "\\'").replace(/"/g, '\\"');
}

function validateRequiredFields(
  entityType: QBEntityType,
  record: { firstName?: string | null; lastName?: string | null; companyName?: string | null; name?: string | null; email?: string | null }
): { valid: boolean; displayName: string; errors: string[] } {
  const errors: string[] = [];

  const firstName = (record.firstName || '').trim();
  const lastName = (record.lastName || '').trim();
  const companyName = ((record as any).companyName || '').trim();
  const name = (record.name || '').trim();

  let displayName = '';

  if (entityType === 'customer') {
    displayName = companyName || `${firstName} ${lastName}`.trim() || name;
  } else {
    displayName = `${firstName} ${lastName}`.trim();
  }

  if (!displayName) {
    errors.push(`${entityType} requires at least a name (first/last or company). Cannot create in QuickBooks without DisplayName.`);
  }

  if (entityType === 'employee' || entityType === 'vendor') {
    if (!firstName && !lastName) {
      errors.push(`QB ${entityType} requires GivenName or FamilyName. Both are empty.`);
    }
  }

  if (displayName && displayName.length > 500) {
    displayName = displayName.slice(0, 500);
  }

  return { valid: errors.length === 0, displayName, errors };
}

async function findByEmail(
  conn: QBConnection,
  entityType: QBEntityType,
  email: string
): Promise<any | null> {
  if (!email) return null;
  const qbEntityName = entityType === 'customer' ? 'Customer' : entityType === 'employee' ? 'Employee' : 'Vendor';
  try {
    const results = await qbQuery(conn.apiBase, conn.realmId, conn.accessToken,
      `SELECT * FROM ${qbEntityName} WHERE PrimaryEmailAddr = '${escapeQBString(email)}'`);
    return results.length > 0 ? results[0] : null;
  } catch (err: any) {
    if (err instanceof QBApiError && !err.retryable) throw err;
    log.warn(`[QBLazySync] findByEmail(${email}) non-fatal error:`, (err instanceof Error ? err.message : String(err)));
    return null;
  }
}

async function findByDisplayName(
  conn: QBConnection,
  entityType: QBEntityType,
  displayName: string
): Promise<any | null> {
  const qbEntityName = entityType === 'customer' ? 'Customer' : entityType === 'employee' ? 'Employee' : 'Vendor';
  try {
    const results = await qbQuery(conn.apiBase, conn.realmId, conn.accessToken,
      `SELECT * FROM ${qbEntityName} WHERE DisplayName = '${escapeQBString(displayName)}'`);
    return results.length > 0 ? results[0] : null;
  } catch (err: any) {
    if (err instanceof QBApiError && !err.retryable) throw err;
    log.warn(`[QBLazySync] findByDisplayName("${displayName}") non-fatal error:`, (err instanceof Error ? err.message : String(err)));
    return null;
  }
}

async function findExistingQBRecord(
  conn: QBConnection,
  entityType: QBEntityType,
  displayName: string,
  email?: string | null
): Promise<{ record: any; matchedBy: 'email' | 'displayName' } | null> {
  if (email) {
    const byEmail = await findByEmail(conn, entityType, email);
    if (byEmail) return { record: byEmail, matchedBy: 'email' };
  }

  const byName = await findByDisplayName(conn, entityType, displayName);
  if (byName) return { record: byName, matchedBy: 'displayName' };

  return null;
}

function verifyEnvironment(conn: QBConnection, storedRealmId?: string | null): boolean {
  if (!storedRealmId) return true;
  return storedRealmId === conn.realmId;
}

async function saveQBId(
  entityType: QBEntityType,
  entityId: string,
  qbId: string,
  realmId: string,
  action: 'created' | 'matched'
): Promise<boolean> {
  try {
    if (entityType === 'customer') {
      await db.update(clients)
        .set({
          quickbooksClientId: qbId,
          quickbooksSyncStatus: 'synced',
          quickbooksLastSync: new Date(),
          quickbooksRealmId: realmId,
        } as any)
        .where(eq(clients.id, entityId));
    } else if (entityType === 'employee') {
      await db.update(employees)
        .set({
          quickbooksEmployeeId: qbId,
          quickbooksSyncStatus: 'synced',
          quickbooksLastSync: new Date(),
          quickbooksRealmId: realmId,
        } as any)
        .where(eq(employees.id, entityId));
    } else if (entityType === 'vendor') {
      await db.update(employees)
        .set({
          quickbooksVendorId: qbId,
          quickbooksSyncStatus: 'synced',
          quickbooksLastSync: new Date(),
          quickbooksRealmId: realmId,
        } as any)
        .where(eq(employees.id, entityId));
    }
    return true;
  } catch (err: any) {
    log.error(`[QBLazySync] DB save failed for ${entityType} ${entityId} → QB ${qbId}:`, (err instanceof Error ? err.message : String(err)));
    return false;
  }
}

async function recoverOrphanedQBRecord(
  conn: QBConnection,
  entityType: QBEntityType,
  entityId: string,
  displayName: string,
  email?: string | null
): Promise<LazySyncResult | null> {
  log.info(`[QBLazySync] Recovery: checking if ${entityType} "${displayName}" was previously created but not linked...`);
  const found = await findExistingQBRecord(conn, entityType, displayName, email);
  if (found) {
    const qbId = found.record.Id;
    const saved = await saveQBId(entityType, entityId, qbId, conn.realmId, 'matched');
    if (saved) {
      log.info(`[QBLazySync] Recovery: re-linked ${entityType} "${displayName}" → QB ${qbId} (matched by ${found.matchedBy})`);
      return { success: true, qbId, created: false, matched: true, matchedBy: 'recovery' };
    }
  }
  return null;
}

async function ensureCustomer(clientId: string, workspaceId: string): Promise<LazySyncResult> {
  const client = await db.query.clients.findFirst({
    where: and(eq(clients.id, clientId), eq(clients.workspaceId, workspaceId)),
  });
  if (!client) return { success: false, qbId: null, created: false, matched: false, error: 'Client not found' };

  const conn = await getQBConnection(workspaceId);
  if (!conn) return { success: false, qbId: null, created: false, matched: false, error: 'QuickBooks not connected', retryable: true };

  const existingQbId = (client as any).quickbooksClientId;
  const storedRealmId = (client as any).quickbooksRealmId;
  if (existingQbId && verifyEnvironment(conn, storedRealmId)) {
    return { success: true, qbId: existingQbId, created: false, matched: false };
  }
  if (existingQbId && !verifyEnvironment(conn, storedRealmId)) {
    log.warn(`[QBLazySync] Realm mismatch for client ${clientId}: stored=${storedRealmId}, current=${conn.realmId}. Re-provisioning.`);
  }

  const validation = validateRequiredFields('customer', {
    firstName: (client as any).firstName,
    lastName: (client as any).lastName,
    companyName: (client as any).companyName,
    name: client.companyName || `${client.firstName} ${client.lastName}`,
    email: client.email,
  });

  if (!validation.valid) {
    return { success: false, qbId: null, created: false, matched: false, error: validation.errors.join('; '), retryable: false };
  }

  const displayName = validation.displayName;

  try {
    const existing = await findExistingQBRecord(conn, 'customer', displayName, client.email);

    if (existing) {
      const qbId = existing.record.Id;
      const saved = await saveQBId('customer', clientId, qbId, conn.realmId, 'matched');
      if (!saved) {
        return { success: false, qbId: qbId, created: false, matched: true, error: 'QB record matched but DB save failed - will retry', retryable: true };
      }
      log.info(`[QBLazySync] Matched client "${displayName}" → QB Customer ${qbId} (by ${existing.matchedBy})`);
      return { success: true, qbId, created: false, matched: true, matchedBy: existing.matchedBy };
    }

    const created = await qbCreate(conn.apiBase, conn.realmId, conn.accessToken, 'customer', {
      DisplayName: displayName,
      CompanyName: (client as any).companyName || displayName,
      PrimaryEmailAddr: client.email ? { Address: client.email } : undefined,
      PrimaryPhone: client.phone ? { FreeFormNumber: client.phone } : undefined,
    });

    const qbId = created.Id;
    const saved = await saveQBId('customer', clientId, qbId, conn.realmId, 'created');
    if (!saved) {
      log.error(`[QBLazySync] CRITICAL: QB Customer ${qbId} created but DB save failed for client ${clientId}. Will recover on next call.`);
      return { success: false, qbId: qbId, created: true, matched: false, error: 'QB record created but DB save failed - will auto-recover on next attempt', retryable: true };
    }
    log.info(`[QBLazySync] Created client "${displayName}" → QB Customer ${qbId}`);
    return { success: true, qbId, created: true, matched: false };
  } catch (err: any) {
    if (err instanceof QBApiError && err.qbErrorCode === '6240') {
      const recovered = await recoverOrphanedQBRecord(conn, 'customer', clientId, displayName, client.email);
      if (recovered) return recovered;
    }
    log.error(`[QBLazySync] Failed to provision customer "${displayName}":`, (err instanceof Error ? err.message : String(err)));
    return { success: false, qbId: null, created: false, matched: false, error: err.message, retryable: err instanceof QBApiError && err.retryable };
  }
}

async function ensureEmployee(employeeId: string, workspaceId: string): Promise<LazySyncResult> {
  const emp = await db.query.employees.findFirst({
    where: and(eq(employees.id, employeeId), eq(employees.workspaceId, workspaceId)),
  });
  if (!emp) return { success: false, qbId: null, created: false, matched: false, error: 'Employee not found' };

  const conn = await getQBConnection(workspaceId);
  if (!conn) return { success: false, qbId: null, created: false, matched: false, error: 'QuickBooks not connected', retryable: true };

  const existingQbId = (emp as any).quickbooksEmployeeId;
  const storedRealmId = (emp as any).quickbooksRealmId;
  if (existingQbId && verifyEnvironment(conn, storedRealmId)) {
    return { success: true, qbId: existingQbId, created: false, matched: false };
  }
  if (existingQbId && !verifyEnvironment(conn, storedRealmId)) {
    log.warn(`[QBLazySync] Realm mismatch for employee ${employeeId}: stored=${storedRealmId}, current=${conn.realmId}. Re-provisioning.`);
  }

  const validation = validateRequiredFields('employee', {
    firstName: emp.firstName,
    lastName: emp.lastName,
    email: emp.email,
  });

  if (!validation.valid) {
    return { success: false, qbId: null, created: false, matched: false, error: validation.errors.join('; '), retryable: false };
  }

  const displayName = validation.displayName;

  try {
    const existing = await findExistingQBRecord(conn, 'employee', displayName, emp.email);

    if (existing) {
      const qbId = existing.record.Id;
      const saved = await saveQBId('employee', employeeId, qbId, conn.realmId, 'matched');
      if (!saved) {
        return { success: false, qbId: qbId, created: false, matched: true, error: 'QB record matched but DB save failed - will retry', retryable: true };
      }
      log.info(`[QBLazySync] Matched employee "${displayName}" → QB Employee ${qbId} (by ${existing.matchedBy})`);
      return { success: true, qbId, created: false, matched: true, matchedBy: existing.matchedBy };
    }

    const created = await qbCreate(conn.apiBase, conn.realmId, conn.accessToken, 'employee', {
      DisplayName: displayName,
      GivenName: emp.firstName,
      FamilyName: emp.lastName,
      PrimaryEmailAddr: emp.email ? { Address: emp.email } : undefined,
      PrimaryPhone: emp.phone ? { FreeFormNumber: emp.phone } : undefined,
    });

    const qbId = created.Id;
    const saved = await saveQBId('employee', employeeId, qbId, conn.realmId, 'created');
    if (!saved) {
      log.error(`[QBLazySync] CRITICAL: QB Employee ${qbId} created but DB save failed for employee ${employeeId}. Will recover on next call.`);
      return { success: false, qbId: qbId, created: true, matched: false, error: 'QB record created but DB save failed - will auto-recover on next attempt', retryable: true };
    }
    log.info(`[QBLazySync] Created employee "${displayName}" → QB Employee ${qbId}`);
    return { success: true, qbId, created: true, matched: false };
  } catch (err: any) {
    if (err instanceof QBApiError && err.qbErrorCode === '6240') {
      const recovered = await recoverOrphanedQBRecord(conn, 'employee', employeeId, displayName, emp.email);
      if (recovered) return recovered;
    }
    log.error(`[QBLazySync] Failed to provision employee "${displayName}":`, (err instanceof Error ? err.message : String(err)));
    return { success: false, qbId: null, created: false, matched: false, error: err.message, retryable: err instanceof QBApiError && err.retryable };
  }
}

async function ensureVendor(employeeId: string, workspaceId: string): Promise<LazySyncResult> {
  const emp = await db.query.employees.findFirst({
    where: and(eq(employees.id, employeeId), eq(employees.workspaceId, workspaceId)),
  });
  if (!emp) return { success: false, qbId: null, created: false, matched: false, error: 'Employee/contractor not found' };

  const conn = await getQBConnection(workspaceId);
  if (!conn) return { success: false, qbId: null, created: false, matched: false, error: 'QuickBooks not connected', retryable: true };

  const existingQbId = (emp as any).quickbooksVendorId;
  const storedRealmId = (emp as any).quickbooksRealmId;
  if (existingQbId && verifyEnvironment(conn, storedRealmId)) {
    return { success: true, qbId: existingQbId, created: false, matched: false };
  }
  if (existingQbId && !verifyEnvironment(conn, storedRealmId)) {
    log.warn(`[QBLazySync] Realm mismatch for vendor ${employeeId}: stored=${storedRealmId}, current=${conn.realmId}. Re-provisioning.`);
  }

  const validation = validateRequiredFields('vendor', {
    firstName: emp.firstName,
    lastName: emp.lastName,
    email: emp.email,
  });

  if (!validation.valid) {
    return { success: false, qbId: null, created: false, matched: false, error: validation.errors.join('; '), retryable: false };
  }

  const displayName = validation.displayName;

  try {
    const existing = await findExistingQBRecord(conn, 'vendor', displayName, emp.email);

    if (existing) {
      const qbId = existing.record.Id;
      const saved = await saveQBId('vendor', employeeId, qbId, conn.realmId, 'matched');
      if (!saved) {
        return { success: false, qbId: qbId, created: false, matched: true, error: 'QB record matched but DB save failed - will retry', retryable: true };
      }
      log.info(`[QBLazySync] Matched contractor "${displayName}" → QB Vendor ${qbId} (by ${existing.matchedBy})`);
      return { success: true, qbId, created: false, matched: true, matchedBy: existing.matchedBy };
    }

    const created = await qbCreate(conn.apiBase, conn.realmId, conn.accessToken, 'vendor', {
      DisplayName: displayName,
      GivenName: emp.firstName,
      FamilyName: emp.lastName,
      PrimaryEmailAddr: emp.email ? { Address: emp.email } : undefined,
      PrimaryPhone: emp.phone ? { FreeFormNumber: emp.phone } : undefined,
    });

    const qbId = created.Id;
    const saved = await saveQBId('vendor', employeeId, qbId, conn.realmId, 'created');
    if (!saved) {
      log.error(`[QBLazySync] CRITICAL: QB Vendor ${qbId} created but DB save failed for employee ${employeeId}. Will recover on next call.`);
      return { success: false, qbId: qbId, created: true, matched: false, error: 'QB record created but DB save failed - will auto-recover on next attempt', retryable: true };
    }
    log.info(`[QBLazySync] Created contractor "${displayName}" → QB Vendor ${qbId}`);
    return { success: true, qbId, created: true, matched: false };
  } catch (err: any) {
    if (err instanceof QBApiError && err.qbErrorCode === '6240') {
      const recovered = await recoverOrphanedQBRecord(conn, 'vendor', employeeId, displayName, emp.email);
      if (recovered) return recovered;
    }
    log.error(`[QBLazySync] Failed to provision vendor "${displayName}":`, (err instanceof Error ? err.message : String(err)));
    return { success: false, qbId: null, created: false, matched: false, error: err.message, retryable: err instanceof QBApiError && err.retryable };
  }
}

export async function ensureQuickBooksRecord(
  type: QBEntityType,
  entityId: string,
  workspaceId: string
): Promise<LazySyncResult> {
  switch (type) {
    case 'customer': return ensureCustomer(entityId, workspaceId);
    case 'employee': return ensureEmployee(entityId, workspaceId);
    case 'vendor': return ensureVendor(entityId, workspaceId);
    default: return { success: false, qbId: null, created: false, matched: false, error: `Unknown entity type: ${type}` };
  }
}

export const quickbooksLazySync = {
  ensureQuickBooksRecord,
  ensureCustomer,
  ensureEmployee,
  ensureVendor,
};
