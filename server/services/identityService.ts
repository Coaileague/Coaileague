import { db } from "../db";
import { createLogger } from '../lib/logger';

const log = createLogger('IdentityService');
import { 
  workspaces, 
  employees,
  clients,
  users,
  externalIdentifiers, 
  idSequences,
  supportRegistry,
  workspaceMembers,
  helpaiSessions,
  platformRoles,
} from "@shared/schema";
import { eq, and, sql, desc } from "drizzle-orm";
import { tokenManager } from './billing/tokenManager';
import type { PgTransaction } from "drizzle-orm/pg-core";
import { 
  safeOrgCode, 
  genOrgExternalId, 
  genEmployeeExternalId,
  genClientExternalId,
  genSupportCode,
  isExternalIdFormat,
  isUuidFormat,
} from "../lib/idGenerator";

/**
 * Internal: Ensure organization has external ID (transaction-aware)
 * Uses workspace's orgCode field if set by owner during onboarding
 * @param tx - Active transaction context
 */
async function ensureOrgIdentifiersInTx(
  tx: any,
  orgId: string,
  orgName: string
): Promise<{ orgCode: string; externalId: string }> {
  log.info(`[Identity] ensureOrgIdentifiersInTx START for org ${orgId} (${orgName})`);
  
  // Check if org already has an external ID
  log.info(`[Identity] Checking existing org external ID...`);
  const existing = await tx
    .select()
    .from(externalIdentifiers)
    .where(
      and(
        eq(externalIdentifiers.entityType, 'org'),
        eq(externalIdentifiers.entityId, orgId)
      )
    )
    .limit(1);

  log.info(`[Identity] Existing org check complete: ${existing.length} found`);

  if (existing.length > 0) {
    // Extract org code from existing external ID (ORG-XXXX -> XXXX)
    const orgCode = existing[0].externalId.substring(4);
    log.info(`[Identity] Using existing org code: ${orgCode}`);
    return { orgCode, externalId: existing[0].externalId };
  }

  // CRITICAL: Check if workspace has an orgCode set by owner during onboarding
  // This takes precedence over auto-generated codes
  log.info(`[Identity] Checking workspace orgCode field...`);
  const [workspace] = await tx
    .select({ orgCode: workspaces.orgCode })
    .from(workspaces)
    .where(eq(workspaces.id, orgId))
    .limit(1);
  
  const userSetOrgCode = workspace?.orgCode?.toUpperCase().replace(/[^A-Z0-9]/g, '');
  log.info(`[Identity] Workspace orgCode field: ${userSetOrgCode || 'not set'}`);

  // Try to generate unique org code with collision retry
  log.info(`[Identity] No org external ID found, generating new one...`);
  let attempts = 0;
  let orgCode: string = '';
  let externalId: string = '';
  let success = false;
  
  while (attempts < 10 && !success) {
    // PRIORITY: Use user-set orgCode from workspace, fallback to name-derived code
    if (attempts === 0 && userSetOrgCode && userSetOrgCode.length >= 3) {
      orgCode = userSetOrgCode;
    } else {
      // Fallback: derive from name or add random suffix
      orgCode = safeOrgCode(orgName, attempts > 0);
    }
    externalId = genOrgExternalId(orgCode);
    log.info(`[Identity] Attempt ${attempts + 1}: trying org code ${orgCode} -> ${externalId}`);

    // Pre-check: if this externalId is already claimed by ANY entity, skip the
    // INSERT entirely to avoid a unique-constraint violation that would abort the
    // PostgreSQL transaction and break all subsequent queries in the same tx.
    const existingForCode = await tx
      .select({ entityId: externalIdentifiers.entityId })
      .from(externalIdentifiers)
      .where(eq(externalIdentifiers.externalId, externalId))
      .limit(1);

    if (existingForCode.length > 0) {
      if (existingForCode[0].entityId === orgId) {
        // This org already owns this code — return it immediately.
        orgCode = externalId.substring(4);
        success = true;
        break;
      }
      // Code is taken by a different entity — retry with a random suffix.
      log.info(`[Identity] Org code ${externalId} taken by another entity, retrying`);
      attempts++;
      continue;
    }

    try {
      // Create external identifier
      log.info(`[Identity] Inserting org external ID into database...`);
      // Use raw pool query with ON CONFLICT DO NOTHING to prevent PostgreSQL
      // from marking the whole Drizzle transaction as ABORTED on a unique violation.
      // Pool import is at module level in db.ts; use pool directly.
      try {
        const { pool: pgPool } = await import("../db");
        await pgPool.query(
          `INSERT INTO external_identifiers (entity_type, entity_id, external_id, org_id, is_primary)
           VALUES ($1, $2, $3, NULL, true)
           ON CONFLICT DO NOTHING`,
          ['org', orgId, externalId]
        );
      } catch (_poolErr: any) {
        // Pool import failed — fall back to Drizzle (may abort tx on conflict)
        await tx.insert(externalIdentifiers).values({
          entityType: 'org',
          entityId: orgId,
          externalId: externalId,
          orgId: null,
          isPrimary: true,
        });
      }
      log.info(`[Identity] Org external ID insert successful!`);

      // Success!
      success = true;
    } catch (error: any) {
      // Concurrent insert race — re-check if this org now has an external ID.
      if (error.code === '23505') {
        const recheck = await tx
          .select()
          .from(externalIdentifiers)
          .where(
            and(
              eq(externalIdentifiers.entityType, 'org'),
              eq(externalIdentifiers.entityId, orgId)
            )
          )
          .limit(1);

        if (recheck.length > 0) {
          // Another concurrent transaction succeeded — use its ID.
          orgCode = recheck[0].externalId.substring(4);
          externalId = recheck[0].externalId;
          success = true;
          break;
        }

        // Still not found, retry with random suffix
        if (attempts < 9) {
          attempts++;
          continue;
        }
      }
      throw error;
    }
  }

  if (!success) {
    throw new Error('Failed to generate unique organization code after 10 attempts');
  }

  // Initialize employee sequence for this org
  try {
    log.info(`[Identity] Initializing employee sequence for org ${orgId}...`);
    await tx.insert(idSequences).values({
      orgId: orgId,
      kind: 'employee',
      nextVal: 1,
    });
    log.info(`[Identity] Employee sequence initialized successfully`);
  } catch (error: any) {
    log.info(`[Identity] Employee sequence init caught error: ${error.code}`);
    // Ignore unique constraint violation - another transaction created it
    if (error.code !== '23505') {
      log.error(`[Identity] Unexpected error initializing employee sequence:`, error);
      throw error;
    }
    log.info(`[Identity] Employee sequence already exists (conflict ignored)`);
  }

  // Initialize client sequence for this org
  try {
    log.info(`[Identity] Initializing client sequence for org ${orgId}...`);
    await tx.insert(idSequences).values({
      orgId: orgId,
      kind: 'client',
      nextVal: 1,
    });
    log.info(`[Identity] Client sequence initialized successfully`);
  } catch (error: any) {
    log.info(`[Identity] Client sequence init caught error: ${error.code}`);
    // Ignore unique constraint violation - another transaction created it
    if (error.code !== '23505') {
      log.error(`[Identity] Unexpected error initializing client sequence:`, error);
      throw error;
    }
    log.info(`[Identity] Client sequence already exists (conflict ignored)`);
  }

  log.info(`[Identity] ensureOrgIdentifiersInTx completed successfully`);
  return { orgCode, externalId };
}

/**
 * Ensure organization has an external ID and employee sequence initialized
 * Public wrapper that starts its own transaction (or uses provided one)
 */
export async function ensureOrgIdentifiers(
  orgId: string,
  orgName: string,
  txParam?: any
): Promise<{ orgCode: string; externalId: string }> {
  // If transaction provided, use it directly
  if (txParam) {
    return ensureOrgIdentifiersInTx(txParam, orgId, orgName);
  }
  
  // Otherwise start own transaction (backward compatible)
  return await db.transaction(async (tx: any) => {
    return ensureOrgIdentifiersInTx(tx, orgId, orgName);
  });
}

/**
 * Internal function to attach employee external ID within a transaction
 */
async function attachEmployeeExternalIdInTx(
  tx: any,
  employeeId: string,
  orgId: string
): Promise<{ externalId: string; localNumber: number }> {
      try {
        log.info(`[Identity] attachEmployeeExternalId starting for ${employeeId}`);
        
        // Check if employee already has an external ID
        log.info(`[Identity] Checking for existing external ID...`);
        const existing = await tx
          .select()
          .from(externalIdentifiers)
          .where(
            and(
              eq(externalIdentifiers.entityType, 'employee'),
              eq(externalIdentifiers.entityId, employeeId)
            )
          )
          .limit(1);
        
        log.info(`[Identity] Existing check complete: ${existing.length} found`);

        if (existing.length > 0) {
          // Extract local number from existing ID (EMP-XXXX-00001 -> 1)
          const parts = existing[0].externalId.split('-');
          const localNumber = parseInt(parts[2], 10);
          log.info(`[Identity] Employee ${employeeId} already has external ID: ${existing[0].externalId}`);
          
          // CRITICAL: Sync external ID to employees.employee_number if not already synced
          await tx
            .update(employees)
            .set({ employeeNumber: existing[0].externalId })
            .where(eq(employees.id, employeeId));
          
          return { externalId: existing[0].externalId, localNumber };
        }

        // Ensure org has identifiers set up
        log.info(`[Identity] About to query workspaces for orgId: ${orgId}`);
        const org = await tx
          .select({ name: workspaces.name })
          .from(workspaces)
          .where(eq(workspaces.id, orgId))
          .limit(1);
        log.info(`[Identity] Workspaces query completed, found ${org.length} rows`);

        if (org.length === 0) {
          log.error(`[Identity] Organization not found: ${orgId}`);
          throw new Error('Organization not found');
        }

        const { orgCode } = await ensureOrgIdentifiersInTx(tx, orgId, org[0].name);
        log.info(`[Identity] Returned from ensureOrgIdentifiersInTx with orgCode: ${orgCode}`);

        // ensureOrgIdentifiersInTx already initialized the sequence, so just increment it
        log.info(`[Identity] Atomically incrementing employee sequence...`);
        const updated = await tx
          .update(idSequences)
          .set({ 
            nextVal: sql`${idSequences.nextVal} + 1`,
            updatedAt: new Date(),
          })
          .where(
            and(
              eq(idSequences.orgId, orgId),
              eq(idSequences.kind, 'employee')
            )
          )
          .returning({ issued: sql`${idSequences.nextVal} - 1` });
        log.info(`[Identity] Atomic increment completed, updated ${updated.length} rows`);
        
        let nextVal = 1;
        
        if (updated.length > 0) {
          nextVal = updated[0].issued as number;
        }

        // Generate external ID
        const externalId = genEmployeeExternalId(orgCode, nextVal);

        // Create external identifier
        await tx.insert(externalIdentifiers).values({
          entityType: 'employee',
          entityId: employeeId,
          externalId: externalId,
          orgId: orgId,
          isPrimary: true,
        });

        // CRITICAL: Sync external ID back to employees.employee_number column
        await tx
          .update(employees)
          .set({ employeeNumber: externalId })
          .where(eq(employees.id, employeeId));

        log.info(`[Identity] Created employee external ID: ${externalId} for employee ${employeeId}`);
        return { externalId, localNumber: nextVal };
      } catch (error: any) {
        log.error('[Identity] Error in attachEmployeeExternalIdInTx:', (error instanceof Error ? error.message : String(error)), error.code);
        throw error;
      }
}

/**
 * Generate and attach external ID to an employee
 * Public wrapper that starts its own transaction (for backward compatibility)
 */
export async function attachEmployeeExternalId(
  employeeId: string,
  orgId: string,
  txParam?: any
): Promise<{ externalId: string; localNumber: number }> {
  // If transaction provided, use it directly
  if (txParam) {
    return attachEmployeeExternalIdInTx(txParam, employeeId, orgId);
  }
  
  // Otherwise start own transaction (backward compatible)
  try {
    return await db.transaction(async (tx: any) => {
      return attachEmployeeExternalIdInTx(tx, employeeId, orgId);
    });
  } catch (error: any) {
    log.error('[Identity] Failed to attach employee external ID:', (error instanceof Error ? error.message : String(error)), error.code);
    throw error;
  }
}

/**
 * Internal function to attach client external ID within a transaction
 */
async function attachClientExternalIdInTx(
  tx: any,
  clientId: string,
  orgId: string
): Promise<{ externalId: string; localNumber: number }> {
  try {
    // Check if client already has an external ID
    const existing = await tx
      .select()
      .from(externalIdentifiers)
      .where(
        and(
          eq(externalIdentifiers.entityType, 'client'),
          eq(externalIdentifiers.entityId, clientId)
        )
      )
      .limit(1);

    if (existing.length > 0) {
      const parts = existing[0].externalId.split('-');
      const localNumber = parseInt(parts[2], 10);
      log.info(`[Identity] Client ${clientId} already has external ID: ${existing[0].externalId}`);
      
      // CRITICAL: Sync external ID to clients.client_code if not already synced
      await tx
        .update(clients)
        .set({ clientCode: existing[0].externalId })
        .where(eq(clients.id, clientId));
      
      return { externalId: existing[0].externalId, localNumber };
    }

    // Ensure org has identifiers set up
    const org = await tx
      .select({ name: workspaces.name })
      .from(workspaces)
      .where(eq(workspaces.id, orgId))
      .limit(1);

    if (org.length === 0) {
      log.error(`[Identity] Organization not found: ${orgId}`);
      throw new Error('Organization not found');
    }

    const { orgCode } = await ensureOrgIdentifiersInTx(tx, orgId, org[0].name);

    // ensureOrgIdentifiersInTx already initialized the sequence, so just increment it
    const updated = await tx
      .update(idSequences)
      .set({ 
        nextVal: sql`${idSequences.nextVal} + 1`,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(idSequences.orgId, orgId),
          eq(idSequences.kind, 'client')
        )
      )
      .returning({ issued: sql`${idSequences.nextVal} - 1` });
    
    let nextVal = 1;
    
    if (updated.length > 0) {
      nextVal = updated[0].issued as number;
    }

    const externalId = genClientExternalId(orgCode, nextVal);

    await tx.insert(externalIdentifiers).values({
      entityType: 'client',
      entityId: clientId,
      externalId: externalId,
      orgId: orgId,
      isPrimary: true,
    });

    // CRITICAL: Sync external ID back to clients.client_code column
    await tx
      .update(clients)
      .set({ clientCode: externalId })
      .where(eq(clients.id, clientId));

    log.info(`[Identity] Created client external ID: ${externalId} for client ${clientId}`);
    return { externalId, localNumber: nextVal };
  } catch (error: any) {
    log.error('[Identity] Error in attachClientExternalIdInTx:', (error instanceof Error ? error.message : String(error)), error.code);
    throw error;
  }
}

/**
 * Generate and attach external ID to a client
 * Public wrapper that starts its own transaction (or uses provided one)
 */
export async function attachClientExternalId(
  clientId: string,
  orgId: string,
  txParam?: any
): Promise<{ externalId: string; localNumber: number }> {
  // If transaction provided, use it directly
  if (txParam) {
    return attachClientExternalIdInTx(txParam, clientId, orgId);
  }
  
  // Otherwise start own transaction (backward compatible)
  try {
    return await db.transaction(async (tx: any) => {
      return attachClientExternalIdInTx(tx, clientId, orgId);
    });
  } catch (error: any) {
    log.error('[Identity] Failed to attach client external ID:', (error instanceof Error ? error.message : String(error)), error.code);
    throw error;
  }
}

/**
 * Ensure support agent has a unique code
 */
export async function ensureSupportCode(userId: string): Promise<{ supportCode: string }> {
  // Check if user already has a support code
  const existing = await db
    .select()
    .from(supportRegistry)
    .where(eq(supportRegistry.userId, userId))
    .limit(1);

  if (existing.length > 0) {
    return { supportCode: existing[0].supportCode };
  }

  // Generate unique support code with retry logic
  let attempts = 0;
  while (attempts < 5) {
    const code = genSupportCode();
    
    try {
      await db.insert(supportRegistry).values({
        userId: userId,
        supportCode: code,
        isActive: true,
      });
      
      return { supportCode: code };
    } catch (error: any) {
      // If unique constraint violation, retry
      if (error.code === '23505') {
        attempts++;
        continue;
      }
      throw error;
    }
  }

  throw new Error('Failed to generate unique support code after 5 attempts');
}

/**
 * Universal lookup function for support agents
 * Searches by external ID, UUID, or email
 */
export async function supportLookup(query: string): Promise<Array<{
  entityType: string;
  entityId: string;
  externalId?: string;
  email?: string;
  name?: string;
  orgId?: string;
}>> {
  const trimmed = query.trim();
  
  // Check if it's an external ID format (ORG-XXXX, EMP-XXXX-00001, SUP-XXXX, etc.)
  if (isExternalIdFormat(trimmed)) {
    const results = await db
      .select()
      .from(externalIdentifiers)
      .where(eq(externalIdentifiers.externalId, trimmed.toUpperCase()))
      .limit(10);

    return results.map((r: any) => ({
      entityType: r.entityType,
      entityId: r.entityId,
      externalId: r.externalId,
      orgId: r.orgId || undefined,
    }));
  }

  // Check if it's a UUID format
  if (isUuidFormat(trimmed)) {
    // Look up by entity ID
    const idResults = await db
      .select()
      .from(externalIdentifiers)
      .where(eq(externalIdentifiers.entityId, trimmed))
      .limit(10);

    if (idResults.length > 0) {
      return idResults.map((r: any) => ({
        entityType: r.entityType,
        entityId: r.entityId,
        externalId: r.externalId,
        orgId: r.orgId || undefined,
      }));
    }

    // Also search users table
    const userResults = await db
      .select()
      .from(users)
      .where(eq(users.id, trimmed))
      .limit(1);

    if (userResults.length > 0) {
      const user = userResults[0];
      return [{
        entityType: 'user',
        entityId: user.id,
        email: user.email,
        name: `${user.firstName || ''} ${user.lastName || ''}`.trim(),
      }];
    }
  }

  // Assume it's an email search
  const userResults = await db
    .select()
    .from(users)
    .where(sql`LOWER(${users.email}) = LOWER(${trimmed})`)
    .limit(10);

  return userResults.map((u: any) => ({
    entityType: 'user',
    entityId: u.id,
    email: u.email,
    name: `${u.firstName || ''} ${u.lastName || ''}`.trim(),
  }));
}

/**
 * Get external ID for an entity (if it exists)
 */
export async function getExternalId(
  entityType: 'org' | 'employee' | 'client' | 'user' | 'support',
  entityId: string
): Promise<string | null> {
  const results = await db
    .select()
    .from(externalIdentifiers)
    .where(
      and(
        eq(externalIdentifiers.entityType, entityType),
        eq(externalIdentifiers.entityId, entityId),
        eq(externalIdentifiers.isPrimary, true)
      )
    )
    .limit(1);

  return results.length > 0 ? results[0].externalId : null;
}

/**
 * Migrate all employee IDs when an organization changes their org code
 * Updates both external_identifiers and employees.employee_number
 * Emits cross-device sync events for mobile/desktop consistency
 */
export async function migrateEmployeeIdsToNewOrgCode(
  workspaceId: string,
  newOrgCode: string
): Promise<{ success: boolean; migratedCount: number; errors: string[] }> {
  const errors: string[] = [];
  let migratedCount = 0;
  const migratedEmployeeIds: string[] = [];
  const normalizedCode = newOrgCode.toUpperCase().replace(/[^A-Z0-9]/g, '');
  
  if (normalizedCode.length < 3) {
    return { success: false, migratedCount: 0, errors: ['Org code must be at least 3 characters'] };
  }
  
  log.info(`[Identity] Migrating employee IDs for workspace ${workspaceId} to new org code: ${normalizedCode}`);
  
  try {
    await db.transaction(async (tx: any) => {
      // Get all employees for this workspace with their external IDs
      const empList = await tx
        .select({
          employeeId: employees.id,
          employeeNumber: employees.employeeNumber,
        })
        .from(employees)
        .where(eq(employees.workspaceId, workspaceId));
      
      // Get existing external identifiers for these employees
      const existingIds = await tx
        .select()
        .from(externalIdentifiers)
        .where(
          and(
            eq(externalIdentifiers.entityType, 'employee'),
            eq(externalIdentifiers.orgId, workspaceId)
          )
        );
      
      // Build a map of employee ID to external identifier record
      const extIdMap = new Map(existingIds.map(e => [e.entityId, e]));
      
      // Check for potential conflicts with new IDs first
      const newIdPattern = `EMP-${normalizedCode}-%`;
      const conflictCheck = await tx
        .select({ externalId: externalIdentifiers.externalId })
        .from(externalIdentifiers)
        .where(
          and(
            eq(externalIdentifiers.entityType, 'employee'),
            sql`${externalIdentifiers.externalId} LIKE ${newIdPattern}`,
            sql`${externalIdentifiers.orgId} != ${workspaceId}`
          )
        );
      
      if (conflictCheck.length > 0) {
        throw new Error(`Org code ${normalizedCode} conflicts with existing employee IDs from another organization`);
      }
      
      // Update each employee's external ID and employee_number
      for (const emp of empList) {
        try {
          const extRecord = extIdMap.get(emp.employeeId);
          
          if (extRecord) {
            // Extract sequence number from existing ID (EMP-XXXX-00001 -> 00001)
            const parts = (extRecord as any).externalId.split('-');
            const seqNumber = parts.length === 3 ? parts[2] : '00001';
            const newExternalId = `EMP-${normalizedCode}-${seqNumber}`;
            
            // Skip if already has the new format
            if (extRecord.externalId === newExternalId) {
              continue;
            }
            
            // Update external_identifiers table
            await tx
              .update(externalIdentifiers)
              .set({ externalId: newExternalId })
              .where(eq(externalIdentifiers.id, (extRecord as any).id));
            
            // Update employees.employee_number
            await tx
              .update(employees)
              .set({ employeeNumber: newExternalId })
              .where(eq(employees.id, emp.employeeId));
            
            log.info(`[Identity] Migrated ${(extRecord as any).externalId} -> ${newExternalId}`);
            migratedCount++;
            migratedEmployeeIds.push(emp.employeeId);
          }
        } catch (empError: any) {
          // Handle unique constraint violations gracefully
          if (empError.code === '23505') {
            errors.push(`Employee ${emp.employeeId}: ID conflict - skipped`);
          } else {
            errors.push(`Employee ${emp.employeeId}: ${empError.message}`);
          }
        }
      }
      
      // Update the org's external ID as well
      const orgExtId = await tx
        .select()
        .from(externalIdentifiers)
        .where(
          and(
            eq(externalIdentifiers.entityType, 'org'),
            eq(externalIdentifiers.entityId, workspaceId)
          )
        )
        .limit(1);
      
      if (orgExtId.length > 0) {
        const newOrgExternalId = `ORG-${normalizedCode}`;
        await tx
          .update(externalIdentifiers)
          .set({ externalId: newOrgExternalId })
          .where(eq(externalIdentifiers.id, orgExtId[0].id));
        log.info(`[Identity] Updated org external ID: ${newOrgExternalId}`);
      }
    });
    
    // Emit cross-device sync events for each migrated employee
    // This ensures mobile and desktop clients receive the updated IDs
    if (migratedEmployeeIds.length > 0) {
      try {
        const { eventBus } = await import('./trinity/eventBus');
        for (const employeeId of migratedEmployeeIds) {
          eventBus.emit('employee_updated', { 
            employeeId, 
            workspaceId, 
            changeType: 'id_migration',
            newOrgCode: normalizedCode 
          });
        }
        log.info(`[Identity] Emitted ${migratedEmployeeIds.length} cross-device sync events`);
      } catch (syncError: any) {
        log.warn(`[Identity] Cross-device sync warning: ${syncError.message}`);
      }
    }
    
    log.info(`[Identity] Migration complete: ${migratedCount} employees migrated to ${normalizedCode}`);
    return { success: true, migratedCount, errors };
  } catch (error: any) {
    log.error('[Identity] Migration failed:', (error instanceof Error ? error.message : String(error)));
    return { success: false, migratedCount, errors: [(error instanceof Error ? error.message : String(error))] };
  }
}

// ============================================================================
// FULL IDENTITY LOOKUP FOR SUPPORT AGENTS
// Returns everything about a user/org that a support agent needs to assist them
// ============================================================================

export interface FullIdentityRecord {
  // Identity
  userId?: string;
  email?: string;
  displayName?: string;
  firstName?: string;
  lastName?: string;
  phone?: string;
  profileImageUrl?: string;

  // System IDs
  externalId?: string;
  employeeNumber?: string;
  workId?: string;             // Format: Firstname-##-###-##-####
  supportCode?: string;        // HelpAI safety code
  safetyCode?: string;         // Legacy alias

  // Auth & Account
  emailVerified?: boolean;
  lastLoginAt?: string;
  loginAttempts?: number;
  mfaEnabled?: boolean;
  accountLocked?: boolean;

  // Workspace / Org
  workspaceId?: string;
  workspaceName?: string;
  orgCode?: string;
  orgExternalId?: string;
  subscriptionTier?: string;
  subscriptionStatus?: string;
  workspaceRole?: string;
  isSuspended?: boolean;
  isFrozen?: boolean;

  // Platform role (for platform staff)
  platformRole?: string;

  // Employee details
  employeeId?: string;
  position?: string;
  department?: string;
  hireDate?: string;
  isActive?: boolean;

  // Credits
  creditBalance?: number;
  monthlyAllocation?: number;
  autoRechargeEnabled?: boolean;

  // Recent HelpAI sessions
  recentHelpAISessions?: {
    id: string;
    ticketNumber: string;
    state: string;
    createdAt: string;
    wasEscalated: boolean;
  }[];

  // All orgs this user belongs to
  allWorkspaces?: { workspaceId: string; workspaceName: string; role: string }[];
}

/**
 * Full identity lookup for support agents.
 * Query can be: UUID, email, external ID (EMP-XXXX-00001), support code, or work ID.
 */
export async function supportLookupFull(query: string): Promise<FullIdentityRecord[]> {
  const trimmed = query.trim();
  const results: FullIdentityRecord[] = [];

  try {
    let userRecords: any[] = [];

    // 1. Try external ID format
    if (isExternalIdFormat(trimmed)) {
      const extIds = await db.select().from(externalIdentifiers)
        .where(eq(externalIdentifiers.externalId, trimmed.toUpperCase()))
        .limit(5);
      if (extIds.length > 0) {
        for (const ext of extIds) {
          if (ext.entityType === 'user' || ext.entityType === 'employee') {
            const u = await db.select().from(users).where(eq(users.id, ext.entityId)).limit(1);
            if (u.length > 0) userRecords.push({ user: u[0], extId: ext });
          }
        }
      }
    }

    // 2. Try UUID
    if (userRecords.length === 0 && isUuidFormat(trimmed)) {
      const u = await db.select().from(users).where(eq(users.id, trimmed)).limit(1);
      if (u.length > 0) userRecords.push({ user: u[0] });
    }

    // 3. Try email
    if (userRecords.length === 0) {
      const u = await db.select().from(users)
        .where(sql`LOWER(${users.email}) = LOWER(${trimmed})`)
        .limit(5);
      userRecords = u.map(user => ({ user }));
    }

    // 4. Try name / support code search in employees
    if (userRecords.length === 0) {
      const emps = await db.select().from(employees)
        .where(sql`(LOWER(${employees.firstName}) LIKE LOWER(${'%' + trimmed + '%'}) OR LOWER(${employees.lastName}) LIKE LOWER(${'%' + trimmed + '%'}))`)
        .limit(5);
      for (const emp of emps) {
        if (emp.userId) {
          const u = await db.select().from(users).where(eq(users.id, emp.userId)).limit(1);
          if (u.length > 0) userRecords.push({ user: u[0], employee: emp });
        }
      }
    }

    // Enrich each user record
    for (const { user, extId } of userRecords) {
      const record: FullIdentityRecord = {
        userId: user.id,
        email: user.email,
        displayName: `${user.firstName || ''} ${user.lastName || ''}`.trim() || user.email,
        firstName: user.firstName || undefined,
        lastName: user.lastName || undefined,
        phone: user.phone || undefined,
        profileImageUrl: user.profileImageUrl || undefined,
        workId: user.workId || undefined,
        emailVerified: user.emailVerified ?? undefined,
        lastLoginAt: user.lastLoginAt?.toISOString() || undefined,
        loginAttempts: user.loginAttempts || 0,
        mfaEnabled: user.mfaEnabled ?? false,
        accountLocked: (user.loginAttempts || 0) >= 5,
        externalId: extId?.externalId || undefined,
      };

      // Load workspace info
      const wsId = user.currentWorkspaceId;
      if (wsId) {
        record.workspaceId = wsId;
        const [ws] = await db.select().from(workspaces).where(eq(workspaces.id, wsId)).limit(1);
        if (ws) {
          record.workspaceName = ws.name || undefined;
          record.orgCode = ws.orgCode || undefined;
          record.subscriptionTier = ws.subscriptionTier || 'free';
          record.subscriptionStatus = ws.subscriptionStatus || undefined;
          record.isSuspended = ws.isSuspended || false;
          record.isFrozen = ws.isFrozen || false;
        }

        // Workspace role
        const [wm] = await db.select().from(workspaceMembers)
          .where(and(eq(workspaceMembers.workspaceId, wsId), eq(workspaceMembers.userId, user.id)))
          .limit(1);
        if (wm) record.workspaceRole = wm.role || undefined;

        // Credit balance (backed by aiUsageEvents since workspace_credits dropped)
        try {
          const credits = await tokenManager.getWorkspaceState(wsId);
          if (credits) {
            record.creditBalance = credits.currentBalance;
            record.monthlyAllocation = credits.monthlyAllocation || undefined;
            record.autoRechargeEnabled = false;
          }
        } catch { /* non-critical */ }

        // Org external ID
        const [orgExt] = await db.select().from(externalIdentifiers)
          .where(and(eq(externalIdentifiers.entityType, 'org'), eq(externalIdentifiers.entityId, wsId)))
          .limit(1);
        record.orgExternalId = orgExt?.externalId || undefined;
      }

      // Employee record
      const [emp] = await db.select().from(employees)
        .where(eq(employees.userId, user.id))
        .limit(1);
      if (emp) {
        record.employeeId = emp.id;
        record.employeeNumber = emp.employeeNumber || undefined;
        record.position = emp.position || undefined;
        record.department = (emp as any).department || undefined;
        record.hireDate = emp.hireDate?.toISOString() || undefined;
        record.isActive = emp.isActive ?? true;
        // Employee external ID
        const [empExt] = await db.select().from(externalIdentifiers)
          .where(and(eq(externalIdentifiers.entityType, 'employee'), eq(externalIdentifiers.entityId, emp.id)))
          .limit(1);
        if (empExt) record.externalId = empExt.externalId;
      }

      // Platform role
      const [pr] = await db.select().from(platformRoles)
        .where(and(eq(platformRoles.userId, user.id), sql`revoked_at IS NULL`))
        .limit(1);
      if (pr) record.platformRole = pr.role || undefined;

      // Support / safety code
      try {
        const { ensureSupportCode } = await import('./identityService');
        // Only fetch if already exists (don't create one for lookup)
        const [sr] = await db.select().from(supportRegistry)
          .where(eq(supportRegistry.userId, user.id))
          .limit(1);
        if (sr) record.supportCode = sr.supportCode || undefined;
      } catch (srErr: any) { log.warn('[Identity] Support registry lookup failed:', srErr.message); }

      // Recent HelpAI sessions (last 5)
      const sessions = await db.select({
        id: helpaiSessions.id,
        ticketNumber: helpaiSessions.ticketNumber,
        state: helpaiSessions.state,
        createdAt: helpaiSessions.createdAt,
        wasEscalated: helpaiSessions.wasEscalated,
      }).from(helpaiSessions)
        .where(eq(helpaiSessions.userId, user.id))
        .orderBy(desc(helpaiSessions.createdAt))
        .limit(5);
      record.recentHelpAISessions = sessions.map(s => ({
        id: s.id,
        ticketNumber: s.ticketNumber || '',
        state: s.state,
        createdAt: s.createdAt?.toISOString() || '',
        wasEscalated: s.wasEscalated || false,
      }));

      // All workspaces this user belongs to
      const allMemberships = await db.select({
        workspaceId: workspaceMembers.workspaceId,
        role: workspaceMembers.role,
      }).from(workspaceMembers)
        .where(eq(workspaceMembers.userId, user.id))
        .limit(10);

      const wsNames = await Promise.all(allMemberships.map(async m => {
        const [w] = await db.select({ name: workspaces.name })
          .from(workspaces)
          .where(eq(workspaces.id, m.workspaceId))
          .limit(1);
        return { workspaceId: m.workspaceId, workspaceName: w?.name || m.workspaceId, role: m.role };
      }));
      record.allWorkspaces = wsNames;

      results.push(record);
    }
  } catch (err) {
    log.error('[IdentityService] supportLookupFull error:', err);
  }

  return results;
}
