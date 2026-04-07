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

  console.log('🔧 Data Corrections Service: Complete');
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
  // CATEGORY C — Raw SQL retained: COUNT( | Tables: invoices, payroll_entries, org_ledger | Verified: 2026-03-23
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

  const WORKSPACE_SCOPED_TABLES = [
    'employees', 'clients', 'shifts', 'time_entries', 'schedules',
    'invoices', 'notifications', 'chat_messages', 'chatrooms',
    'incidents', 'visitor_logs', 'daily_activity_reports',
    'pay_stubs', 'payroll_runs', 'compliance_documents',
    'availability', 'break_records', 'contracts', 'documents',
    'form_templates', 'form_submissions', 'automation_executions',
    'workspace_configs', 'geofences', 'bolo_alerts',
    'shift_swap_requests', 'recurring_shifts', 'tax_forms',
  ];

  try {
    // Converted to Drizzle ORM: NOT IN → notInArray()
    const devWorkspaces = await db.select({ id: workspaces.id, name: workspaces.name })
      .from(workspaces)
      .where(notInArray(workspaces.id, KEEP_WORKSPACES));

    // CATEGORY C — Raw SQL retained: Count( | Tables: employees | Verified: 2026-03-23
    const protectedEmp = protectedWs ? await db.select({ count: sql`COUNT(*)` })
      .from(employees)
      .where(and(
        eq(employees.workspaceId, protectedWs),
        ...(GRANDFATHERED_OWNER ? [ne(employees.userId, GRANDFATHERED_OWNER)] : [])
      )) : [{ count: '0' }];
    const sandboxEmpCount = parseInt(String((protectedEmp[0] as any)?.count || '0'));

    if (devWorkspaces.length === 0 && sandboxEmpCount === 0) {
      console.log('🧹 Production Data Cleanup: Already clean — nothing to do');
      return;
    }

    await db.transaction(async (tx) => {
      if (devWorkspaces.length > 0) {
        console.log(`🧹 Step 1: Removing ${devWorkspaces.length} non-production workspaces:`);
        for (const ws of devWorkspaces) {
          console.log(`   - ${ws.id} (${ws.name})`);
        }

        for (const ws of devWorkspaces) {
          for (const table of WORKSPACE_SCOPED_TABLES) {
            try {
              await tx.execute(sql.raw(`DELETE FROM "${table}" WHERE workspace_id = '${ws.id}'`));
            } catch {}
          }
          try {
            await tx.execute(sql.raw(`DELETE FROM workspaces WHERE id = '${ws.id}'`));
          } catch (err) {
            console.log(`🧹 Could not delete workspace ${ws.id}: ${(err as any)?.message}`);
          }
        }
        console.log('🧹 Step 1: Complete');
      }

      console.log('🧹 Step 2: Cleaning Statewide workspace — removing all non-owner data...');
      const deleted = await tx.execute(sql`
        DELETE FROM employees 
        WHERE workspace_id = ${protectedWs} 
        AND user_id IS DISTINCT FROM ${REAL_OWNER_USER_ID}
      `);
      console.log(`🧹 Step 2a: Removed ${deleted.rowCount || 0} sandbox employees`);

      for (const table of WORKSPACE_SCOPED_TABLES) {
        if (table === 'employees') continue;
        try {
          await tx.execute(sql.raw(`DELETE FROM "${table}" WHERE workspace_id = '${protectedWs || ""}'`));
        } catch {}
      }
      console.log('🧹 Step 2b: All sandbox clients, shifts, invoices, etc. removed');

      console.log('🧹 Step 3: Removing phantom users (dev/test/tenant IDs)...');
      try {
        await tx.execute(sql`
          DELETE FROM platform_roles 
          WHERE user_id IN (
            SELECT id FROM users 
            WHERE id LIKE 'dev-%' OR id LIKE 'tenant-%' OR id LIKE 'txps-%' 
            OR id LIKE 'demo-%' OR id = 'root-admin-workfos'
          )
        `);
      } catch {}
      try {
        await tx.execute(sql`
          DELETE FROM employees 
          WHERE user_id IN (
            SELECT id FROM users 
            WHERE id LIKE 'dev-%' OR id LIKE 'tenant-%' OR id LIKE 'txps-%' 
            OR id LIKE 'demo-%'
          )
        `);
      } catch {}
      await tx.execute(sql`
        DELETE FROM users 
        WHERE id LIKE 'dev-%' OR id LIKE 'tenant-%' OR id LIKE 'txps-%' 
        OR id LIKE 'demo-%' OR id = 'root-admin-workfos'
      `);
      console.log('🧹 Step 3: Phantom users removed');

      console.log('🧹 Step 4: Cleaning platform workspace of non-system employees...');
      await tx.execute(sql`
        DELETE FROM employees 
        WHERE workspace_id = ${PLATFORM_WS}
        AND id NOT IN ('8d31a497-e9fe-48d9-b819-9c6869948c39', 'helpai-employee', 'trinity-employee')
      `);
      console.log('🧹 Step 4: Platform workspace cleaned');
    });

    console.log('🧹 ========================================');
    console.log('🧹 Production Data Cleanup: COMPLETE');
    console.log('🧹 Remaining workspaces:');
    console.log('🧹   1. CoAIleague Platform (support/root org)');
    console.log('🧹   2. Grandfathered tenant (owner only — ready for QB import)');
    console.log('🧹   3. System Automation (internal)');
    console.log('🧹 ========================================');
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
      
      const workspacesData = [
        { id: PLATFORM_WORKSPACE_ID, name: 'CoAIleague Platform', ownerId: 'root-user-00000000', subscriptionTier: 'enterprise', subscriptionStatus: 'active' },
      ];
      
      for (const ws of workspacesData) {
        await tx.execute(sql`
          INSERT INTO workspaces (id, name, owner_id, subscription_tier, subscription_status, created_at, updated_at)
          VALUES (${ws.id}, ${ws.name}, ${ws.ownerId}, ${ws.subscriptionTier}, ${ws.subscriptionStatus}, NOW(), NOW())
          ON CONFLICT (id) DO NOTHING
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
    console.log('   - Workspaces: 1 (CoAIleague Platform)');
    console.log('   - Employees: 3 (root admin + 2 AI bots)');
    
    return { success: true, message: 'Production database seeded successfully' };
    
  } catch (error) {
    console.error('❌ Production Seed: Migration failed:', error);
    return { success: false, message: `Seed failed: ${error}` };
  }
}
