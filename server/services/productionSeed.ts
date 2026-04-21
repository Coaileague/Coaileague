/**
 * Production Database Seeding Service
 * 
 * Automatically migrates essential data from development to production
 * on first deployment. Uses idempotent INSERT ... ON CONFLICT DO NOTHING
 * to safely handle re-runs.
 * 
 * Trigger: Runs on server startup when isProduction() returns true
 *          (Replit, Railway, Cloud Run, NODE_ENV=production)
 * Guard: Checks for sentinel user to avoid duplicate runs
 */

import { db } from "../db";
import { users, platformRoles, workspaces, employees, invoices, payrollEntries, orgLedger } from "@shared/schema";
import { eq, sql, and, notInArray, ne, inArray } from "drizzle-orm";
import { typedCount, typedExec, typedQuery } from '../lib/typedSql';
import { PLATFORM_WORKSPACE_ID } from './billing/billingConstants';

const SENTINEL_USER_ID = 'root-user-00000000';
const SENTINEL_EMAIL = process.env.ROOT_ADMIN_EMAIL || 'root@coaileague.local';

/**
 * One-time data corrections - runs on PRODUCTION startup only
 * Fixes existing records that were created with incorrect data
 * EXPORTED so it can be called independently in server/index.ts
 */
export async function runDataCorrections(): Promise<void> {
  const { isProduction } = await import('../lib/isProduction');
  if (!isProduction()) return;

  console.log('🔧 Data Corrections Service: Starting...');

  try {
    // CATEGORY C — Raw SQL retained: Production seed data correction | Tables: users | Verified: 2026-03-23
    await typedExec(sql`
      UPDATE users
      SET email = 'admin@coaileague.com',
          login_attempts = 0,
          email_verified = TRUE
      WHERE id = 'root-user-00000000'
    `);
    console.log('🔧 Data Correction: root admin email set to admin@coaileague.com');
  } catch (err) {
    console.log('🔧 Data Correction: root admin email fix skipped:', (err as any)?.message);
  }

  // Ensure the Statewide Protective Services workspace and its owner exist
  await runStatewideWorkspaceBootstrap();

  console.log('🔧 Data Corrections Service: Complete');
}

/**
 * Idempotent bootstrap for the Statewide Protective Services production workspace.
 *
 * Runs at every production startup (called by runDataCorrections).  Safe to
 * call repeatedly — every statement uses ON CONFLICT DO NOTHING / DO UPDATE so
 * no duplicate rows are ever created.
 *
 * What it does:
 *  1. Creates the Statewide workspace if it does not exist, or upgrades it to
 *     enterprise/active + billing_exempt if it does.
 *  2. Creates the owner user (txpsinvestigations@gmail.com) if they do not
 *     exist; either way sets email_verified=TRUE and clears any login lockout.
 *  3. Creates the workspace_members row (org_owner) if it does not exist.
 *  4. Creates the employee record if it does not exist.
 *
 * IDs are read from env vars first (GRANDFATHERED_TENANT_ID /
 * GRANDFATHERED_TENANT_OWNER_ID), falling back to the well-known production
 * values that were established in production-migration.sql.
 */
export async function runStatewideWorkspaceBootstrap(): Promise<void> {
  const { isProduction } = await import('../lib/isProduction');
  if (!isProduction()) return;

  // Canonical production IDs (established in production-migration.sql).
  // Env vars take precedence if set so the values can be rotated without a deploy.
  const WS_ID   = process.env.GRANDFATHERED_TENANT_ID     || '37a04d24-51bd-4856-9faa-d26a2fe82094';
  const USER_ID  = process.env.GRANDFATHERED_TENANT_OWNER_ID || '48003611';
  const EMP_ID   = '3fd50980-85f8-4f18-8b7a-5906ba8ccfe0';
  const EMAIL    = 'txpsinvestigations@gmail.com';
  // Bcrypt hash of the temporary login password "Statewide2026!" (bcryptjs cost 12).
  // This replaces the stale cost-10 hash that shipped in production-migration.sql,
  // which did NOT match "Statewide2026!" and caused login to fail.
  // GRANDFATHERED TENANT EXCEPTION (Section I): hardcoded credentials are
  // permitted only for this one grandfathered tenant — the same exception that
  // covers WS_ID and USER_ID above.
  const PW_HASH  = '$2b$12$F/GGRAFBVQW7.opHUvwyXO5HvbG7pPvkejwUDMFbf8kr2eTIRakCe';
  // The stale hash from production-migration.sql — used only to detect rows
  // that still need the one-time migration to the correct temp-password hash.
  // Remove this constant (and the CASE below) once the migration has run in
  // production and the owner has changed their password.
  const STALE_PW_HASH = '$2b$10$r3GT8OdoCwxosnHVWfQmFeMRnvv1BOhJIKA5BjWQ3g2eG3LQ4ko0K';

  console.log(`🏢 [StatewideBootstrap] Starting — workspace=${WS_ID}, owner=${USER_ID}`);

  // ── 1. Workspace ─────────────────────────────────────────────────────────
  try {
    // CATEGORY C — Raw SQL retained: Statewide bootstrap | Tables: workspaces | Verified: 2026-04-11
    await typedExec(sql`
      INSERT INTO workspaces (
        id, name, owner_id,
        subscription_tier, subscription_status,
        billing_exempt, founder_exemption,
        inbound_email_forward_to,
        created_at, updated_at
      )
      VALUES (
        ${WS_ID}, 'Statewide Protective Services', ${USER_ID},
        'enterprise', 'active',
        TRUE, TRUE,
        'saraybebo@gmail.com',
        NOW(), NOW()
      )
      ON CONFLICT (id) DO UPDATE
        SET subscription_tier         = 'enterprise',
            subscription_status       = 'active',
            billing_exempt            = TRUE,
            founder_exemption         = TRUE,
            trial_ends_at             = NULL,
            inbound_email_forward_to  = 'saraybebo@gmail.com',
            updated_at                = NOW()
        WHERE workspaces.subscription_tier   != 'enterprise'
           OR workspaces.subscription_status != 'active'
           OR workspaces.billing_exempt       IS NOT TRUE
           OR workspaces.founder_exemption    IS NOT TRUE
           OR workspaces.inbound_email_forward_to IS DISTINCT FROM 'saraybebo@gmail.com'
    `);
    console.log('🏢 [StatewideBootstrap] Workspace upserted (enterprise/active/billing_exempt, forward→saraybebo@gmail.com)');
  } catch (err) {
    console.error('🏢 [StatewideBootstrap] Workspace upsert failed:', (err as any)?.message);
  }

  // ── 2. Owner user ─────────────────────────────────────────────────────────
  try {
    // CATEGORY C — Raw SQL retained: Statewide bootstrap | Tables: users | Verified: 2026-04-11
    await typedExec(sql`
      INSERT INTO users (
        id, email, first_name, last_name, role,
        password_hash, email_verified, current_workspace_id,
        login_attempts, mfa_enabled,
        created_at, updated_at
      )
      VALUES (
        ${USER_ID}, ${EMAIL}, 'Brigido', 'Guillen', 'user',
        ${PW_HASH}, TRUE, ${WS_ID},
        0, FALSE,
        NOW(), NOW()
      )
      ON CONFLICT (id) DO UPDATE
        SET email_verified       = TRUE,
            login_attempts       = 0,
            locked_until         = NULL,
            current_workspace_id = ${WS_ID},
            -- One-time migration: if the row still holds the stale cost-10 hash
            -- that shipped in production-migration.sql (which did NOT match the
            -- "Statewide2026!" temp password), replace it with the correct hash.
            -- Once the owner has set a real password this CASE becomes a no-op
            -- and their custom password is preserved across deployments.
            password_hash        = CASE
                                     WHEN users.password_hash = ${STALE_PW_HASH}
                                     THEN ${PW_HASH}
                                     ELSE users.password_hash
                                   END,
            updated_at           = NOW()
        WHERE users.email_verified   IS NOT TRUE
           OR users.login_attempts   > 0
           OR users.locked_until     IS NOT NULL
           OR users.password_hash    = ${STALE_PW_HASH}
    `);
    console.log(`🏢 [StatewideBootstrap] Owner user upserted (email_verified=TRUE)`);
  } catch (err) {
    console.error('🏢 [StatewideBootstrap] Owner user upsert failed:', (err as any)?.message);
  }

  // ── 3. Workspace member ───────────────────────────────────────────────────
  try {
    // CATEGORY C — Raw SQL retained: Statewide bootstrap | Tables: workspace_members | Verified: 2026-04-11
    await typedExec(sql`
      INSERT INTO workspace_members (user_id, workspace_id, role, status, joined_at, created_at, updated_at)
      VALUES (${USER_ID}, ${WS_ID}, 'org_owner', 'active', NOW(), NOW(), NOW())
      ON CONFLICT (user_id, workspace_id) DO NOTHING
    `);
    console.log('🏢 [StatewideBootstrap] Workspace member record verified');
  } catch (err) {
    // Constraint may not be (user_id, workspace_id) — fall back to a SELECT guard
    try {
      // CATEGORY C — Raw SQL retained: Statewide bootstrap fallback | Tables: workspace_members | Verified: 2026-04-11
      await typedExec(sql`
        INSERT INTO workspace_members (user_id, workspace_id, role, status, joined_at, created_at, updated_at)
        SELECT ${USER_ID}, ${WS_ID}, 'org_owner', 'active', NOW(), NOW(), NOW()
        WHERE NOT EXISTS (
          SELECT 1 FROM workspace_members
          WHERE user_id = ${USER_ID} AND workspace_id = ${WS_ID}
        )
      `);
      console.log('🏢 [StatewideBootstrap] Workspace member record verified (via SELECT guard)');
    } catch (err2) {
      console.error('🏢 [StatewideBootstrap] Workspace member upsert failed:', (err2 as any)?.message);
    }
  }

  // ── 4. Employee record ────────────────────────────────────────────────────
  try {
    // CATEGORY C — Raw SQL retained: Statewide bootstrap | Tables: employees | Verified: 2026-04-11
    await typedExec(sql`
      INSERT INTO employees (
        id, user_id, workspace_id,
        first_name, last_name, email,
        role, workspace_role, employee_number,
        created_at, updated_at
      )
      VALUES (
        ${EMP_ID}, ${USER_ID}, ${WS_ID},
        'Brigido', 'Guillen', ${EMAIL},
        'Owner', 'org_owner', 'EMP-SPS-00001',
        NOW(), NOW()
      )
      ON CONFLICT (id) DO NOTHING
    `);
    console.log('🏢 [StatewideBootstrap] Employee record verified');
  } catch (err) {
    console.error('🏢 [StatewideBootstrap] Employee record upsert failed:', (err as any)?.message);
  }

  // ── 5. Org code + email slug ──────────────────────────────────────────────
  try {
    // CATEGORY C — Raw SQL retained: Statewide bootstrap | Tables: workspaces | Verified: 2026-04-21
    await typedExec(sql`
      UPDATE workspaces
      SET org_code        = 'sps',
          org_code_status = 'active',
          org_code_claimed_at = COALESCE(org_code_claimed_at, NOW()),
          updated_at      = NOW()
      WHERE id = ${WS_ID}
        AND (org_code IS DISTINCT FROM 'sps' OR org_code_status IS DISTINCT FROM 'active')
    `);
    console.log('🏢 [StatewideBootstrap] Org code set to "sps" (active)');

    // Provision all workspace email addresses under the "sps" slug.
    // Non-blocking so a transient email-service error never blocks startup.
    import('../services/email/emailProvisioningService')
      .then(({ emailProvisioningService }) =>
        emailProvisioningService.provisionWorkspaceAddresses(WS_ID, 'sps')
      )
      .catch(err => console.warn('🏢 [StatewideBootstrap] Email provisioning warning:', (err as any)?.message));
  } catch (err) {
    console.error('🏢 [StatewideBootstrap] Org code update failed:', (err as any)?.message);
  }

  console.log('🏢 [StatewideBootstrap] Complete — Statewide Protective Services is ready');
}

/**
 * One-time production data cleanup — removes ALL dev/sandbox/test data
 * Keeps ONLY: Grandfathered production tenant, CoAIleague Platform, System Automation
 * Everything else (dev-*, demo-*, test-*, ops-*, UUID test orgs) is contamination and gets removed
 * EXPORTED so it can be called from server/index.ts
 */
export async function runProductionDataCleanup(): Promise<void> {
  // Guard: only runs in deployed production (Replit, Railway, Cloud Run, NODE_ENV=production)
  const { isProduction } = await import('../lib/isProduction');
  if (!isProduction()) return;

  console.log('🧹 Production Data Cleanup: Starting...');

  const GRANDFATHERED_WS = process.env.GRANDFATHERED_TENANT_ID || process.env.STATEWIDE_WORKSPACE_ID;
  const GRANDFATHERED_OWNER = process.env.GRANDFATHERED_TENANT_OWNER_ID;
  const PLATFORM_WS = PLATFORM_WORKSPACE_ID;           // coaileague-platform-workspace
  const SYSTEM_WS = 'system';                           // system automation workspace

  // Financial record protection — refuse to run if grandfathered tenant financial data exists
  // CATEGORY C — Raw SQL retained: COUNT( | Tables: invoices, payroll_entries, org_ledger | Verified: 2026-04-12
  const protectedWs = GRANDFATHERED_WS;
  if (protectedWs) {
    const [sentInvoices, payrollEntriesCount, ledgerEntries] = await Promise.all([
      db.select({ count: sql`COUNT(*)` }).from(invoices).where(and(eq(invoices.status, 'sent'), eq(invoices.workspaceId, protectedWs))),
      db.select({ count: sql`COUNT(*)` }).from(payrollEntries).where(eq(payrollEntries.workspaceId, protectedWs)),
      db.select({ count: sql`COUNT(*)` }).from(orgLedger).where(eq(orgLedger.workspaceId, protectedWs)),
    ]);

    const sentInvoicesCount = parseInt(String((sentInvoices[0] as any)?.count || '0'));
    const payrollCount = parseInt(String((payrollEntriesCount[0] as any)?.count || '0'));
    const ledgerCount = parseInt(String((ledgerEntries[0] as any)?.count || '0'));

    if (sentInvoicesCount > 0 || payrollCount > 0 || ledgerCount > 0) {
      console.error(`[BLOCKED] runProductionDataCleanup REFUSED — financial records exist in protected workspace:`);
      console.error(`  Sent invoices: ${sentInvoicesCount}`);
      console.error(`  Payroll entries: ${payrollCount}`);
      console.error(`  Ledger entries: ${ledgerCount}`);
      console.error(`  These records are PROTECTED. Cannot bulk-delete workspace data when financial pipeline has processed records.`);
      return;
    }
  }

  // Keep ONLY: Grandfathered production tenant, CoAIleague Platform, System Automation
  // ALL others are contamination — dev/test/sandbox/demo workspaces that bled into production
  const KEEP_WORKSPACES = [...(protectedWs ? [protectedWs] : []), PLATFORM_WS, SYSTEM_WS];

  // ── Dynamic table discovery ───────────────────────────────────────────────
  // Query information_schema for ALL tables with a workspace_id column.
  // This is self-maintaining — new tables are automatically included without
  // needing to update a static list. The old static list of ~30 tables missed
  // hundreds of workspace-scoped tables.
  // CATEGORY C — Raw SQL retained: information_schema discovery | Tables: information_schema | Verified: 2026-04-12
  let allWorkspaceScopedTables: string[];
  try {
    const tableRows = await typedQuery<{ table_name: string }>(sql`
      SELECT DISTINCT c.table_name
      FROM information_schema.columns c
      JOIN information_schema.tables t
        ON t.table_name = c.table_name AND t.table_schema = c.table_schema
      WHERE c.column_name = 'workspace_id'
        AND c.table_schema = 'public'
        AND t.table_type = 'BASE TABLE'
        AND c.table_name != 'workspaces'
      ORDER BY c.table_name
    `);
    allWorkspaceScopedTables = tableRows.map(r => r.table_name);
    console.log(`🧹 Discovered ${allWorkspaceScopedTables.length} workspace-scoped tables`);
  } catch (err) {
    console.error('🧹 Failed to discover workspace-scoped tables — falling back to static list');
    // Fallback: the original static list (covers most critical tables)
    allWorkspaceScopedTables = [
      'employees', 'clients', 'shifts', 'time_entries', 'schedules',
      'invoices', 'notifications', 'chat_messages', 'chatrooms',
      'incidents', 'visitor_logs', 'daily_activity_reports',
      'pay_stubs', 'payroll_runs', 'compliance_documents',
      'availability', 'break_records', 'contracts', 'documents',
      'form_templates', 'form_submissions', 'automation_executions',
      'workspace_configs', 'geofences', 'bolo_alerts',
      'shift_swap_requests', 'recurring_shifts', 'tax_forms',
    ];
  }

  try {
    // ── Pre-cleanup snapshot ──────────────────────────────────────────────
    const allWorkspaces = await db.select({ id: workspaces.id, name: workspaces.name })
      .from(workspaces);
    const devWorkspaces = allWorkspaces.filter(ws => !KEEP_WORKSPACES.includes(ws.id));

    // CATEGORY C — Raw SQL retained: Count( | Tables: employees | Verified: 2026-04-12
    const protectedEmp = protectedWs ? await db.select({ count: sql`COUNT(*)` })
      .from(employees)
      .where(and(
        eq(employees.workspaceId, protectedWs),
        ...(GRANDFATHERED_OWNER ? [ne(employees.userId, GRANDFATHERED_OWNER)] : [])
      )) : [{ count: '0' }];
    const sandboxEmpCount = parseInt(String((protectedEmp[0] as any)?.count || '0'));

    // Count phantom users
    const phantomUserRows = await typedQuery<{ cnt: string }>(sql`
      SELECT COUNT(*) AS cnt FROM users
      WHERE id LIKE 'dev-%' OR id LIKE 'tenant-%' OR id LIKE 'txps-%'
         OR id LIKE 'demo-%' OR id LIKE 'anvil-%' OR id = 'root-admin-workfos'
    `);
    const phantomUserCount = parseInt(phantomUserRows[0]?.cnt || '0');

    // Count test emails
    const testEmailRows = await typedQuery<{ cnt: string }>(sql`
      SELECT COUNT(*) AS cnt FROM users
      WHERE email LIKE '%.test' OR email LIKE '%@acme%' OR email LIKE '%@frostbank%'
         OR email LIKE '%@anvilsecurity%' OR email LIKE '%@metroplex%'
    `);
    const testEmailCount = parseInt(testEmailRows[0]?.cnt || '0');

    console.log('🧹 ── Pre-cleanup snapshot ──────────────────');
    console.log(`🧹   Total workspaces: ${allWorkspaces.length}`);
    console.log(`🧹   Contaminated workspaces: ${devWorkspaces.length}`);
    console.log(`🧹   Sandbox employees in protected ws: ${sandboxEmpCount}`);
    console.log(`🧹   Phantom users (dev/test IDs): ${phantomUserCount}`);
    console.log(`🧹   Users with test emails: ${testEmailCount}`);
    console.log(`🧹   Tables to scan: ${allWorkspaceScopedTables.length}`);
    console.log('🧹 ────────────────────────────────────────────');

    if (devWorkspaces.length === 0 && sandboxEmpCount === 0 && phantomUserCount === 0 && testEmailCount === 0) {
      console.log('🧹 Production Data Cleanup: Already clean — nothing to do');
      return;
    }

    // 25P02 fix: every cleanup statement is wrapped in its own savepoint
    // (a Drizzle nested transaction). When any statement fails, only that
    // savepoint is rolled back — the outer transaction stays alive and
    // subsequent statements can still run.
    const savepoint = async (label: string, fn: (sp: any) => Promise<void>): Promise<void> => {
      try {
        await db.transaction(async (sp) => {
          await fn(sp);
        });
      } catch (err: any) {
        // Don't log the entire txn abort cascade — just the original failure.
        // 25P02 = aborted transaction state, 42P01 = missing table — both expected.
        if (err?.code !== '25P02' && err?.code !== '42P01') {
          console.log(`🧹 [${label}] failed (non-fatal): ${err?.message}`);
        }
      }
    };

    // ── Step 1: Remove ALL contaminated workspaces and their data ────────
    if (devWorkspaces.length > 0) {
      console.log(`🧹 Step 1: Removing ${devWorkspaces.length} non-production workspaces:`);
      for (const ws of devWorkspaces) {
        console.log(`   - ${ws.id} (${ws.name})`);
      }

      for (const ws of devWorkspaces) {
        let tablesDeleted = 0;
        for (const table of allWorkspaceScopedTables) {
          await savepoint(`step1.${table}.${ws.id}`, async (sp) => {
            // CATEGORY C — Raw SQL retained: dynamic table cleanup | Tables: dynamic | Verified: 2026-04-12
            const result = await sp.execute(sql.raw(
              `DELETE FROM "${table}" WHERE workspace_id = '${ws.id.replace(/'/g, "''")}'`
            ));
            if (result.rowCount > 0) tablesDeleted++;
          });
        }
        // Delete workspace_members separately (FK to workspaces)
        await savepoint(`step1.workspace_members.${ws.id}`, async (sp) => {
          await sp.execute(sql.raw(
            `DELETE FROM workspace_members WHERE workspace_id = '${ws.id.replace(/'/g, "''")}'`
          ));
        });
        // Delete the workspace itself last
        await savepoint(`step1.workspace.${ws.id}`, async (sp) => {
          await sp.execute(sql.raw(`DELETE FROM workspaces WHERE id = '${ws.id.replace(/'/g, "''")}'`));
        });
        console.log(`🧹   Cleaned workspace ${ws.id} (${ws.name}) — touched ${tablesDeleted} tables`);
      }
      console.log('🧹 Step 1: Complete');
    }

    // ── Step 2: Clean grandfathered workspace of seeded sandbox data ─────
    console.log('🧹 Step 2: Cleaning grandfathered workspace of sandbox contamination...');
    if (protectedWs && GRANDFATHERED_OWNER) {
      // Remove sandbox employees (keep only the real owner)
      await savepoint('step2.employees', async (sp) => {
        const deleted = await sp.execute(sql`
          DELETE FROM employees
          WHERE workspace_id = ${protectedWs}
          AND user_id IS DISTINCT FROM ${GRANDFATHERED_OWNER}
        `);
        console.log(`🧹   Removed ${deleted.rowCount || 0} sandbox employees from protected workspace`);
      });

      // Remove all other workspace-scoped data (clients, shifts, invoices, etc.)
      // that was seeded by dev code bleeding into production
      let protectedTablesDeleted = 0;
      for (const table of allWorkspaceScopedTables) {
        if (table === 'employees') continue; // handled above with owner filter
        await savepoint(`step2.${table}`, async (sp) => {
          const result = await sp.execute(sql.raw(
            `DELETE FROM "${table}" WHERE workspace_id = '${protectedWs.replace(/'/g, "''")}'`
          ));
          if (result.rowCount > 0) protectedTablesDeleted++;
        });
      }
      console.log(`🧹   Cleaned ${protectedTablesDeleted} tables in protected workspace`);
    } else {
      console.log('🧹   Skipped — protected workspace or owner ID not configured');
    }
    console.log('🧹 Step 2: Complete');

    // ── Step 3: Remove phantom users (dev/test/tenant/demo IDs) ─────────
    console.log('🧹 Step 3: Removing phantom users...');
    // Delete from dependent tables first (platform_roles, employees, workspace_members)
    await savepoint('step3.platform_roles', async (sp) => {
      await sp.execute(sql`
        DELETE FROM platform_roles
        WHERE user_id IN (
          SELECT id FROM users
          WHERE id LIKE 'dev-%' OR id LIKE 'tenant-%' OR id LIKE 'txps-%'
          OR id LIKE 'demo-%' OR id LIKE 'anvil-%' OR id = 'root-admin-workfos'
        )
      `);
    });
    await savepoint('step3.workspace_members', async (sp) => {
      await sp.execute(sql`
        DELETE FROM workspace_members
        WHERE user_id IN (
          SELECT id FROM users
          WHERE id LIKE 'dev-%' OR id LIKE 'tenant-%' OR id LIKE 'txps-%'
          OR id LIKE 'demo-%' OR id LIKE 'anvil-%' OR id = 'root-admin-workfos'
        )
      `);
    });
    await savepoint('step3.employees', async (sp) => {
      await sp.execute(sql`
        DELETE FROM employees
        WHERE user_id IN (
          SELECT id FROM users
          WHERE id LIKE 'dev-%' OR id LIKE 'tenant-%' OR id LIKE 'txps-%'
          OR id LIKE 'demo-%' OR id LIKE 'anvil-%'
        )
      `);
    });
    await savepoint('step3.users', async (sp) => {
      const deleted = await sp.execute(sql`
        DELETE FROM users
        WHERE id LIKE 'dev-%' OR id LIKE 'tenant-%' OR id LIKE 'txps-%'
        OR id LIKE 'demo-%' OR id LIKE 'anvil-%' OR id = 'root-admin-workfos'
      `);
      console.log(`🧹   Removed ${deleted.rowCount || 0} phantom users`);
    });

    // Also remove users with test email domains that slipped through
    await savepoint('step3.test_email_employees', async (sp) => {
      await sp.execute(sql`
        DELETE FROM employees
        WHERE user_id IN (
          SELECT id FROM users
          WHERE email LIKE '%.test' OR email LIKE '%@acme%'
             OR email LIKE '%@frostbank%' OR email LIKE '%@anvilsecurity%'
             OR email LIKE '%@metroplex%'
        )
      `);
    });
    await savepoint('step3.test_email_users', async (sp) => {
      const deleted = await sp.execute(sql`
        DELETE FROM users
        WHERE email LIKE '%.test' OR email LIKE '%@acme%'
           OR email LIKE '%@frostbank%' OR email LIKE '%@anvilsecurity%'
           OR email LIKE '%@metroplex%'
      `);
      console.log(`🧹   Removed ${deleted.rowCount || 0} users with test email domains`);
    });
    console.log('🧹 Step 3: Complete');

    // ── Step 4: Clean platform workspace of non-system employees ─────────
    console.log('🧹 Step 4: Cleaning platform workspace...');
    await savepoint('step4.platform_employees', async (sp) => {
      const deleted = await sp.execute(sql`
        DELETE FROM employees
        WHERE workspace_id = ${PLATFORM_WS}
        AND id NOT IN ('8d31a497-e9fe-48d9-b819-9c6869948c39', 'helpai-employee', 'trinity-employee')
      `);
      console.log(`🧹   Removed ${deleted.rowCount || 0} non-system employees from platform workspace`);
    });
    console.log('🧹 Step 4: Complete');

    // ── Step 5: Clean platform-level test data (emails, notifications) ───
    console.log('🧹 Step 5: Cleaning platform-level test data...');
    // Remove platform emails with test domains
    await savepoint('step5.platform_emails', async (sp) => {
      const deleted = await sp.execute(sql`
        DELETE FROM platform_emails
        WHERE to_addr LIKE '%.test' OR to_addr LIKE '%@frostbank%'
           OR to_addr LIKE '%@acme%' OR to_addr LIKE '%@anvilsecurity%'
           OR to_addr LIKE '%@metroplex%'
           OR from_addr LIKE '%.test' OR from_addr LIKE '%@frostbank%'
      `);
      console.log(`🧹   Removed ${deleted.rowCount || 0} test platform emails`);
    });
    // Remove SMS attempts to test numbers
    await savepoint('step5.sms_attempt_log', async (sp) => {
      const deleted = await sp.execute(sql`
        DELETE FROM sms_attempt_log
        WHERE to_number LIKE '555-%' OR to_number LIKE '%555-0%'
      `);
      console.log(`🧹   Removed ${deleted.rowCount || 0} test SMS attempts`);
    });
    // Remove seed sentinel markers from key-value style tables
    await savepoint('step5.seed_sentinels', async (sp) => {
      await sp.execute(sql`
        DELETE FROM idempotency_keys
        WHERE key LIKE 'dev-%' OR key LIKE 'seed-%' OR key LIKE 'demo-%'
      `);
    });
    console.log('🧹 Step 5: Complete');

    // ── Post-cleanup verification ────────────────────────────────────────
    const remainingWorkspaces = await db.select({ id: workspaces.id, name: workspaces.name })
      .from(workspaces);
    const remainingUsers = await typedQuery<{ cnt: string }>(sql`SELECT COUNT(*) AS cnt FROM users`);
    const remainingEmployees = await typedQuery<{ cnt: string }>(sql`SELECT COUNT(*) AS cnt FROM employees`);
    const remainingPhantoms = await typedQuery<{ cnt: string }>(sql`
      SELECT COUNT(*) AS cnt FROM users
      WHERE id LIKE 'dev-%' OR id LIKE 'tenant-%' OR id LIKE 'txps-%'
         OR id LIKE 'demo-%' OR id LIKE 'anvil-%' OR id = 'root-admin-workfos'
    `);
    const remainingTestEmails = await typedQuery<{ cnt: string }>(sql`
      SELECT COUNT(*) AS cnt FROM users
      WHERE email LIKE '%.test' OR email LIKE '%@acme%' OR email LIKE '%@frostbank%'
         OR email LIKE '%@anvilsecurity%' OR email LIKE '%@metroplex%'
    `);

    console.log('🧹 ═══════════════════════════════════════════');
    console.log('🧹 Production Data Cleanup: COMPLETE');
    console.log('🧹 ── Post-cleanup verification ─────────────');
    console.log(`🧹   Workspaces remaining: ${remainingWorkspaces.length}`);
    for (const ws of remainingWorkspaces) {
      console.log(`🧹     - ${ws.id} (${ws.name})`);
    }
    console.log(`🧹   Total users: ${remainingUsers[0]?.cnt || 0}`);
    console.log(`🧹   Total employees: ${remainingEmployees[0]?.cnt || 0}`);
    console.log(`🧹   Phantom users remaining: ${remainingPhantoms[0]?.cnt || 0}`);
    console.log(`🧹   Test email users remaining: ${remainingTestEmails[0]?.cnt || 0}`);
    console.log('🧹 ═══════════════════════════════════════════');
  } catch (err) {
    console.error('🧹 Production Data Cleanup: ERROR', (err as any)?.message);
    console.error('🧹 Full error:', err);
  }
}

/**
 * One-time password migrations - runs EVERY startup (dev and prod)
 * Use this for urgent password updates that need to apply to existing users
 * EXPORTED so it can be called independently in server/index.ts
 */
export async function runPasswordMigrations(): Promise<void> {
  console.log('🔑 Password Migration Service: Starting...');
  
  const { isProduction } = await import('../lib/isProduction');
  if (isProduction()) {
    console.log('🔑 Password Migration: SKIPPED in production (passwords must be changed via user flow)');
    console.log('🔑 Password Migration Service: Complete');
    return;
  }
  
  const migrations: Array<{ email: string; newHash: string; note: string }> = [
    {
      email: 'admin@coaileague.com',
      newHash: '$2b$12$Z2CsEFb.K/Y6ySBE5k5LEe79ien8SNZmg8mS8lovdL6ZyTeJ.7Xo.',
      note: 'DEV ONLY: Platform root admin password reset to admin123@*',
    },
    {
      email: 'txpsinvestigations@gmail.com',
      newHash: '$2b$12$hOeQmgFMh8.vDrMgVstFM.LCdci5NuhKOFNfOygA0A5VzG4NDE3hu',
      note: 'DEV ONLY: TXPS org owner password reset to admin123@*',
    },
  ];
  
  if (migrations.length === 0) {
    console.log('🔑 Password Migration: No pending migrations');
    console.log('🔑 Password Migration Service: Complete');
    return;
  }
  
  for (const migration of migrations) {
    try {
      // CATEGORY C — Raw SQL retained: Production seed password migration | Tables: users | Verified: 2026-03-23
      const result = await typedExec(sql`
        UPDATE users 
        SET password_hash = ${migration.newHash}, login_attempts = 0
        WHERE email = ${migration.email}
      `);
      console.log(`🔑 Password Migration: SUCCESS - Updated ${migration.email}`);
    } catch (err) {
      console.log(`🔑 Password Migration: SKIPPED - ${migration.email} (user may not exist in this database)`);
    }
  }
  
  console.log('🔑 Password Migration Service: Complete');
}

/**
 * Workspace health corrections - runs EVERY startup (dev and prod)
 * Ensures known first-party workspaces stay active regardless of trial expiry jobs.
 * Only updates workspaces that are genuinely suspended/cancelled — leaves active ones alone.
 */
export async function runWorkspaceHealthCorrections(): Promise<void> {
  console.log('🏢 Workspace Health: Starting corrections...');

  // Restore the TXPS org owner's workspace to enterprise/active.
  // The daily trial-expiry cron may have suspended it — override that here.
  try {
    // Converted to Drizzle ORM: IN subquery → inArray()
    await db.update(workspaces).set({
      subscriptionStatus: 'active',
      subscriptionTier: 'enterprise',
      trialEndsAt: null,
      updatedAt: sql`now()`,
    }).where(and(
      inArray(workspaces.ownerId,
        db.select({ id: users.id })
          .from(users)
          .where(eq(users.email, 'txpsinvestigations@gmail.com'))
      ),
      inArray(workspaces.subscriptionStatus, ['suspended', 'cancelled', 'trial'])
    ));
    console.log('🏢 Workspace Health: TXPS workspace restored to enterprise/active (if it was suspended)');
  } catch (err) {
    console.log('🏢 Workspace Health: TXPS workspace fix skipped:', (err as any)?.message);
  }

  // Same for the root admin platform workspace
  try {
    // Converted to Drizzle ORM
    await db.update(workspaces).set({
      subscriptionStatus: 'active',
      updatedAt: sql`now()`,
    }).where(and(eq(workspaces.id, PLATFORM_WORKSPACE_ID), sql`subscription_status != 'active'`));
  } catch (err) {
    // Non-fatal
  }

  console.log('🏢 Workspace Health: Complete');
}

/**
 * Ensure the system automation user and workspace exist.
 * These are required by autonomousScheduler for audit log FK constraints.
 * Runs on EVERY startup (dev + production), idempotent via ON CONFLICT.
 */
export async function ensureSystemEntities(): Promise<void> {
  try {
    // Converted to Drizzle ORM: ON CONFLICT
    await db.insert(users).values({
      id: 'system-coaileague',
      email: 'automation@coaileague.ai',
      firstName: 'CoAIleague',
      lastName: 'Automation',
      role: 'system',
      emailVerified: true,
    }).onConflictDoNothing();
    // Converted to Drizzle ORM: ON CONFLICT
    await db.insert(workspaces).values({
      id: 'system',
      name: 'System Automation',
      ownerId: 'system-coaileague',
      subscriptionTier: 'enterprise',
      subscriptionStatus: 'active',
    }).onConflictDoNothing();
    console.log('[SystemSeed] System automation user and workspace verified');
  } catch (err) {
    console.error('[SystemSeed] Failed to ensure system entities (non-fatal):', (err as any)?.message);
  }
}

export async function runProductionSeed(): Promise<{ success: boolean; message: string }> {
  const { isProduction } = await import('../lib/isProduction');
  const isProd = isProduction();

  console.log(`🌱 Production Seed: Environment check - production=${isProd}`);

  if (!isProd) {
    console.log('🌱 Production Seed: Skipping (not in production deployment)');
    return { success: true, message: 'Skipped - not in production' };
  }
  
  // Always run password migrations first (for existing users)
  console.log('🔑 Running password migrations...');
  await runPasswordMigrations();
  
  try {
    // Check if sentinel user already exists
    const existingUser = await db.select({ id: users.id })
      .from(users)
      .where(eq(users.id, SENTINEL_USER_ID))
      .limit(1);
    
    if (existingUser.length > 0) {
      console.log(`🌱 Production Seed: Sentinel user (${SENTINEL_EMAIL}) already exists. Skipping migration.`);
      return { success: true, message: 'Already seeded' };
    }
    
    console.log('🌱 Production Seed: Starting database migration...');
    
    // Run all inserts in a transaction
    await db.transaction(async (tx) => {
      // =========================================================================
      // 1. USERS TABLE - Core authentication data
      // =========================================================================
      console.log('🌱 Seeding users...');
      
      const usersData = [
        { id: 'root-user-00000000', email: SENTINEL_EMAIL, firstName: 'Root', lastName: 'Administrator', passwordHash: '$2b$10$wN0UMmTiGuG0wEi/04xywOqwnLUILRxQmFTjuTfgovPv1kBS.T3ei', role: 'root_admin', emailVerified: false, currentWorkspaceId: PLATFORM_WORKSPACE_ID },
        { id: 'helpai-bot', email: 'helpai@coaileague.ai', firstName: 'HelpAI', lastName: 'Bot', passwordHash: null, role: 'user', emailVerified: false },
      ];
      
      for (const user of usersData) {
        await tx.execute(sql`
          INSERT INTO users (id, email, first_name, last_name, password_hash, role, email_verified, current_workspace_id, created_at, updated_at, login_attempts, mfa_enabled)
          VALUES (${user.id}, ${user.email}, ${user.firstName}, ${user.lastName}, ${user.passwordHash}, ${user.role}, ${user.emailVerified}, ${(user as any).currentWorkspaceId || null}, NOW(), NOW(), 0, FALSE)
          ON CONFLICT (id) DO NOTHING
        `);
      }
      
      // =========================================================================
      // 2. PLATFORM_ROLES TABLE - Admin and system roles
      // =========================================================================
      console.log('🌱 Seeding platform roles...');
      
      const rolesData = [
        { id: 'e2d402f8-fb44-4129-a0f2-703f0dc91aaa', userId: 'root-user-00000000', role: 'root_admin' },
      ];
      
      for (const pr of rolesData) {
        await tx.execute(sql`
          INSERT INTO platform_roles (id, user_id, role, granted_at)
          VALUES (${pr.id}, ${pr.userId}, ${pr.role}, NOW())
          ON CONFLICT (id) DO NOTHING
        `);
      }
      
      // =========================================================================
      // 3. WORKSPACES TABLE - Organization/tenant data
      // =========================================================================
      console.log('🌱 Seeding workspaces...');
      
      for (const ws of [
        { id: PLATFORM_WORKSPACE_ID, name: 'CoAIleague Support', ownerId: 'root-user-00000000', subscriptionTier: 'enterprise', subscriptionStatus: 'active' },
      ]) {
        await tx.execute(sql`
          INSERT INTO workspaces (id, name, owner_id, subscription_tier, subscription_status, inbound_email_forward_to, created_at, updated_at)
          VALUES (${ws.id}, ${ws.name}, ${ws.ownerId}, ${ws.subscriptionTier}, ${ws.subscriptionStatus}, 'txpsinvestigations@gmail.com', NOW(), NOW())
          ON CONFLICT (id) DO UPDATE
            SET name = 'CoAIleague Support',
                inbound_email_forward_to = 'txpsinvestigations@gmail.com'
            WHERE workspaces.name IS DISTINCT FROM 'CoAIleague Support'
               OR workspaces.inbound_email_forward_to IS DISTINCT FROM 'txpsinvestigations@gmail.com'
        `);
      }
      
      // =========================================================================
      // 4. EMPLOYEES TABLE - Employee records
      // =========================================================================
      console.log('🌱 Seeding employees...');
      
      const employeesData = [
        { id: '8d31a497-e9fe-48d9-b819-9c6869948c39', userId: 'root-user-00000000', workspaceId: PLATFORM_WORKSPACE_ID, firstName: 'Root', lastName: 'Administrator', email: SENTINEL_EMAIL, hourlyRate: '0.00', workspaceRole: 'org_owner', employeeNumber: 'EMP-COAI-00001' },
        { id: 'helpai-employee', userId: null, workspaceId: PLATFORM_WORKSPACE_ID, firstName: 'HelpAI', lastName: 'Bot', email: 'helpai@coaileague.support', hourlyRate: null, role: 'AI Support Assistant', workspaceRole: null, employeeNumber: 'EMP-HELP-00001' },
        { id: 'trinity-employee', userId: null, workspaceId: PLATFORM_WORKSPACE_ID, firstName: 'Trinity', lastName: 'AI', email: 'trinity@coaileague.support', hourlyRate: null, role: 'AI Platform Guide', workspaceRole: null, employeeNumber: 'EMP-TRIN-00001' },
      ];
      
      for (const emp of employeesData) {
        await tx.execute(sql`
          INSERT INTO employees (id, user_id, workspace_id, first_name, last_name, email, hourly_rate, role, workspace_role, employee_number, created_at, updated_at)
          VALUES (${emp.id}, ${emp.userId}, ${emp.workspaceId}, ${emp.firstName}, ${emp.lastName}, ${emp.email}, ${emp.hourlyRate}, ${(emp as any).role || null}, ${emp.workspaceRole}, ${emp.employeeNumber}, NOW(), NOW())
          ON CONFLICT (id) DO NOTHING
        `);
      }
    });
    
    console.log('✅ Production Seed: Database migration completed successfully!');
    console.log('   - Users: 2 (root admin + helpai bot)');
    console.log('   - Platform Roles: 1 (root_admin)');
    console.log('   - Workspaces: 1 (CoAIleague Support)');
    console.log('   - Employees: 3 (root admin + 2 AI bots)');
    
    return { success: true, message: 'Production database seeded successfully' };
    
  } catch (error) {
    console.error('❌ Production Seed: Migration failed:', error);
    return { success: false, message: `Seed failed: ${error}` };
  }
}
