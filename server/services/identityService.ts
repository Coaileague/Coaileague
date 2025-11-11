import { db } from "../db";
import { 
  workspaces, 
  employees,
  users,
  externalIdentifiers, 
  idSequences,
  supportRegistry,
} from "@shared/schema";
import { eq, and, sql } from "drizzle-orm";
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
 * @param tx - Active transaction context
 */
async function ensureOrgIdentifiersInTx(
  tx: any,
  orgId: string,
  orgName: string
): Promise<{ orgCode: string; externalId: string }> {
  console.log(`[Identity] ensureOrgIdentifiersInTx START for org ${orgId} (${orgName})`);
  
  // Check if org already has an external ID
  console.log(`[Identity] Checking existing org external ID...`);
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

  console.log(`[Identity] Existing org check complete: ${existing.length} found`);

  if (existing.length > 0) {
    // Extract org code from existing external ID (ORG-XXXX -> XXXX)
    const orgCode = existing[0].externalId.substring(4);
    console.log(`[Identity] Using existing org code: ${orgCode}`);
    return { orgCode, externalId: existing[0].externalId };
  }

  // Try to generate unique org code with collision retry
  console.log(`[Identity] No org external ID found, generating new one...`);
  let attempts = 0;
  let orgCode: string = '';
  let externalId: string = '';
  let success = false;
  
  while (attempts < 10 && !success) {
    // First attempt uses clean name, subsequent use random suffix
    orgCode = safeOrgCode(orgName, attempts > 0);
    externalId = genOrgExternalId(orgCode);
    console.log(`[Identity] Attempt ${attempts + 1}: trying org code ${orgCode} -> ${externalId}`);
    
    try {
      // Create external identifier
      console.log(`[Identity] Inserting org external ID into database...`);
      await tx.insert(externalIdentifiers).values({
        entityType: 'org',
        entityId: orgId,
        externalId: externalId,
        orgId: null, // Orgs don't have a parent org
        isPrimary: true,
      });
      console.log(`[Identity] Org external ID insert successful!`);
      
      // Success!
      success = true;
    } catch (error: any) {
      // If unique constraint violation, another transaction may have created it
      if (error.code === '23505') {
        // Re-check if org now has an external ID (race condition)
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
          // Another transaction succeeded - use its ID
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
  await tx
    .insert(idSequences)
    .values({
      orgId: orgId,
      kind: 'employee',
      nextVal: 1,
    })
    .onConflictDoNothing();

  // Initialize client sequence for this org
  await tx
    .insert(idSequences)
    .values({
      orgId: orgId,
      kind: 'client',
      nextVal: 1,
    })
    .onConflictDoNothing();

  return { orgCode, externalId };
}

/**
 * Ensure organization has an external ID and employee sequence initialized
 * Public wrapper that starts its own transaction
 */
export async function ensureOrgIdentifiers(
  orgId: string,
  orgName: string
): Promise<{ orgCode: string; externalId: string }> {
  return await db.transaction(async (tx: any) => {
    return ensureOrgIdentifiersInTx(tx, orgId, orgName);
  });
}

/**
 * Generate and attach external ID to an employee
 */
export async function attachEmployeeExternalId(
  employeeId: string,
  orgId: string
): Promise<{ externalId: string; localNumber: number }> {
  try {
    return await db.transaction(async (tx: any) => {
      try {
        console.log(`[Identity] attachEmployeeExternalId starting for ${employeeId}`);
        
        // Check if employee already has an external ID
        console.log(`[Identity] Checking for existing external ID...`);
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
        
        console.log(`[Identity] Existing check complete: ${existing.length} found`);

        if (existing.length > 0) {
          // Extract local number from existing ID (EMP-XXXX-00001 -> 1)
          const parts = existing[0].externalId.split('-');
          const localNumber = parseInt(parts[2], 10);
          console.log(`[Identity] Employee ${employeeId} already has external ID: ${existing[0].externalId}`);
          return { externalId: existing[0].externalId, localNumber };
        }

        // Ensure org has identifiers set up
        console.log(`[Identity] About to query workspaces for orgId: ${orgId}`);
        const org = await tx
          .select({ name: workspaces.name })
          .from(workspaces)
          .where(eq(workspaces.id, orgId))
          .limit(1);
        console.log(`[Identity] Workspaces query completed, found ${org.length} rows`);

        if (org.length === 0) {
          console.error(`[Identity] Organization not found: ${orgId}`);
          throw new Error('Organization not found');
        }

        const { orgCode } = await ensureOrgIdentifiersInTx(tx, orgId, org[0].name);

        // Get next employee number for this org (with concurrent-safe initialization)
        let nextVal = 1;
        
        // Try to initialize sequence if it doesn't exist (concurrent-safe)
        try {
          await tx.insert(idSequences).values({
            orgId: orgId,
            kind: 'employee',
            nextVal: 1,
          });
        } catch (error: any) {
          // Ignore unique constraint violation - another transaction created it
          if (error.code !== '23505') {
            throw error;
          }
        }
        
        // Now atomically increment and get the value
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

        console.log(`[Identity] Created employee external ID: ${externalId} for employee ${employeeId}`);
        return { externalId, localNumber: nextVal };
      } catch (innerError: any) {
        console.error('[Identity] Transaction error in attachEmployeeExternalId:', innerError.message, innerError.code);
        throw innerError;
      }
    });
  } catch (outerError: any) {
    console.error('[Identity] Failed to attach employee external ID:', outerError.message, outerError.code);
    throw outerError;
  }
}

/**
 * Generate and attach external ID to a client
 */
export async function attachClientExternalId(
  clientId: string,
  orgId: string
): Promise<{ externalId: string; localNumber: number }> {
  try {
    return await db.transaction(async (tx: any) => {
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
          console.log(`[Identity] Client ${clientId} already has external ID: ${existing[0].externalId}`);
          return { externalId: existing[0].externalId, localNumber };
        }

        // Ensure org has identifiers set up
        const org = await tx
          .select({ name: workspaces.name })
          .from(workspaces)
          .where(eq(workspaces.id, orgId))
          .limit(1);

        if (org.length === 0) {
          console.error(`[Identity] Organization not found: ${orgId}`);
          throw new Error('Organization not found');
        }

        const { orgCode } = await ensureOrgIdentifiersInTx(tx, orgId, org[0].name);

        // Get next client number for this org (with concurrent-safe initialization)
        let nextVal = 1;
        
        // Try to initialize sequence if it doesn't exist (concurrent-safe)
        try {
          await tx.insert(idSequences).values({
            orgId: orgId,
            kind: 'client',
            nextVal: 1,
          });
        } catch (error: any) {
          // Ignore unique constraint violation - another transaction created it
          if (error.code !== '23505') {
            throw error;
          }
        }
        
        // Now atomically increment and get the value
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

        console.log(`[Identity] Created client external ID: ${externalId} for client ${clientId}`);
        return { externalId, localNumber: nextVal };
      } catch (innerError: any) {
        console.error('[Identity] Transaction error in attachClientExternalId:', innerError.message, innerError.code);
        throw innerError;
      }
    });
  } catch (outerError: any) {
    console.error('[Identity] Failed to attach client external ID:', outerError.message, outerError.code);
    throw outerError;
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
