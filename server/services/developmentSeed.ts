/**
 * Development Database Seeding Service
 *
 * Populates realistic simulated data for development and testing.
 * Only runs in development mode — guarded by isProduction() which
 * detects Replit, Railway, Cloud Run, and NODE_ENV=production.
 * Uses idempotent INSERT ... ON CONFLICT DO NOTHING for safe re-runs.
 *
 * Trigger: Runs on server startup in development mode
 * Guard: Checks for sentinel workspace to avoid duplicate seeding
 */

import { isProduction } from '../lib/isProduction';
import { db } from "../db";
import { and, eq, inArray, notExists, sql } from 'drizzle-orm';
import { typedExec, typedQuery } from '../lib/typedSql';
import {
  workspaceMembers,
  users, employees, clients, shifts, invoices, payStubs,
  shiftChatrooms, shiftChatroomMembers, shiftChatroomMessages, darReports, workspaces
} from '@shared/schema';

const DEV_SENTINEL_WORKSPACE = 'dev-acme-security-ws';

export async function runDevelopmentSeed(): Promise<{ success: boolean; message: string }> {
  if (isProduction()) {
    return { success: true, message: 'Skipped - production environment' };
  }

  console.log('[DevSeed] Checking development database...');

  try {
    // Converted to Drizzle ORM: LIMIT
    const existing = await db.select({ id: workspaces.id })
      .from(workspaces)
      .where(eq(workspaces.id, DEV_SENTINEL_WORKSPACE))
      .limit(1);

    if (existing.length > 0) {
      console.log('[DevSeed] Development data already exists. Skipping.');
      return { success: true, message: 'Already seeded' };
    }

    console.log('[DevSeed] Seeding development data...');

    await db.transaction(async (tx) => {
      // =====================================================================
      // 1. DEV USERS - Test accounts for different roles
      // =====================================================================
      console.log('[DevSeed] Creating test users...');

      const devUsers = [
        { id: 'dev-owner-001', email: 'owner@acme-security.test', firstName: 'Marcus', lastName: 'Rivera', passwordHash: '$2b$10$XEUX3wL9wI2VEjEoUdCSw.O8xFVIfhUJAGahknql8PdWYj0DITrSe', role: 'user' },
        { id: 'dev-manager-001', email: 'manager@acme-security.test', firstName: 'Sarah', lastName: 'Chen', passwordHash: '$2b$10$XEUX3wL9wI2VEjEoUdCSw.O8xFVIfhUJAGahknql8PdWYj0DITrSe', role: 'user' },
        { id: 'dev-manager-002', email: 'ops@acme-security.test', firstName: 'James', lastName: 'Washington', passwordHash: '$2b$10$XEUX3wL9wI2VEjEoUdCSw.O8xFVIfhUJAGahknql8PdWYj0DITrSe', role: 'user' },
        { id: 'dev-emp-001', email: 'garcia@acme-security.test', firstName: 'Carlos', lastName: 'Garcia', passwordHash: '$2b$10$XEUX3wL9wI2VEjEoUdCSw.O8xFVIfhUJAGahknql8PdWYj0DITrSe', role: 'user' },
        { id: 'dev-emp-002', email: 'johnson@acme-security.test', firstName: 'Diana', lastName: 'Johnson', passwordHash: '$2b$10$XEUX3wL9wI2VEjEoUdCSw.O8xFVIfhUJAGahknql8PdWYj0DITrSe', role: 'user' },
        { id: 'dev-emp-003', email: 'williams@acme-security.test', firstName: 'Robert', lastName: 'Williams', passwordHash: '$2b$10$XEUX3wL9wI2VEjEoUdCSw.O8xFVIfhUJAGahknql8PdWYj0DITrSe', role: 'user' },
        { id: 'dev-emp-004', email: 'martinez@acme-security.test', firstName: 'Elena', lastName: 'Martinez', passwordHash: '$2b$10$XEUX3wL9wI2VEjEoUdCSw.O8xFVIfhUJAGahknql8PdWYj0DITrSe', role: 'user' },
        { id: 'dev-emp-005', email: 'thompson@acme-security.test', firstName: 'Michael', lastName: 'Thompson', passwordHash: '$2b$10$XEUX3wL9wI2VEjEoUdCSw.O8xFVIfhUJAGahknql8PdWYj0DITrSe', role: 'user' },
        { id: 'dev-emp-006', email: 'davis@acme-security.test', firstName: 'Angela', lastName: 'Davis', passwordHash: '$2b$10$XEUX3wL9wI2VEjEoUdCSw.O8xFVIfhUJAGahknql8PdWYj0DITrSe', role: 'user' },
        { id: 'dev-emp-007', email: 'brown@acme-security.test', firstName: 'Kevin', lastName: 'Brown', passwordHash: '$2b$10$XEUX3wL9wI2VEjEoUdCSw.O8xFVIfhUJAGahknql8PdWYj0DITrSe', role: 'user' },
        { id: 'dev-emp-008', email: 'lee@acme-security.test', firstName: 'Jennifer', lastName: 'Lee', passwordHash: '$2b$10$XEUX3wL9wI2VEjEoUdCSw.O8xFVIfhUJAGahknql8PdWYj0DITrSe', role: 'user' },
        { id: 'dev-emp-009', email: 'wilson@acme-security.test', firstName: 'David', lastName: 'Wilson', passwordHash: '$2b$10$XEUX3wL9wI2VEjEoUdCSw.O8xFVIfhUJAGahknql8PdWYj0DITrSe', role: 'user' },
        { id: 'dev-emp-010', email: 'anderson@acme-security.test', firstName: 'Lisa', lastName: 'Anderson', passwordHash: '$2b$10$XEUX3wL9wI2VEjEoUdCSw.O8xFVIfhUJAGahknql8PdWYj0DITrSe', role: 'user' },
        { id: 'dev-owner-002', email: 'owner@lonestar-security.test', firstName: 'Raymond', lastName: 'Castillo', passwordHash: '$2b$10$XEUX3wL9wI2VEjEoUdCSw.O8xFVIfhUJAGahknql8PdWYj0DITrSe', role: 'user' },
        { id: 'dev-emp-011', email: 'rodriguez@lonestar-security.test', firstName: 'Diego', lastName: 'Rodriguez', passwordHash: '$2b$10$XEUX3wL9wI2VEjEoUdCSw.O8xFVIfhUJAGahknql8PdWYj0DITrSe', role: 'user' },
        { id: 'dev-emp-012', email: 'nguyen@lonestar-security.test', firstName: 'Linh', lastName: 'Nguyen', passwordHash: '$2b$10$XEUX3wL9wI2VEjEoUdCSw.O8xFVIfhUJAGahknql8PdWYj0DITrSe', role: 'user' },
        { id: 'dev-emp-013', email: 'foster@lonestar-security.test', firstName: 'Marcus', lastName: 'Foster', passwordHash: '$2b$10$XEUX3wL9wI2VEjEoUdCSw.O8xFVIfhUJAGahknql8PdWYj0DITrSe', role: 'user' },
        { id: 'dev-emp-014', email: 'reyes@lonestar-security.test', firstName: 'Ana', lastName: 'Reyes', passwordHash: '$2b$10$XEUX3wL9wI2VEjEoUdCSw.O8xFVIfhUJAGahknql8PdWYj0DITrSe', role: 'user' },
        { id: 'dev-demo-user', email: 'demo@coaileague.test', firstName: 'Demo', lastName: 'User', passwordHash: '$2b$10$XEUX3wL9wI2VEjEoUdCSw.O8xFVIfhUJAGahknql8PdWYj0DITrSe', role: 'user' },
        // Extended Acme team — supervisors, department managers, contractors, officers
        { id: 'dev-emp-015', email: 'nguyen@acme-security.test', firstName: 'Tony', lastName: 'Nguyen', passwordHash: '$2b$10$XEUX3wL9wI2VEjEoUdCSw.O8xFVIfhUJAGahknql8PdWYj0DITrSe', role: 'user' },
        { id: 'dev-emp-016', email: 'moore@acme-security.test', firstName: 'Patricia', lastName: 'Moore', passwordHash: '$2b$10$XEUX3wL9wI2VEjEoUdCSw.O8xFVIfhUJAGahknql8PdWYj0DITrSe', role: 'user' },
        { id: 'dev-emp-017', email: 'taylor@acme-security.test', firstName: 'Brian', lastName: 'Taylor', passwordHash: '$2b$10$XEUX3wL9wI2VEjEoUdCSw.O8xFVIfhUJAGahknql8PdWYj0DITrSe', role: 'user' },
        { id: 'dev-emp-018', email: 'white@acme-security.test', firstName: 'Sandra', lastName: 'White', passwordHash: '$2b$10$XEUX3wL9wI2VEjEoUdCSw.O8xFVIfhUJAGahknql8PdWYj0DITrSe', role: 'user' },
        { id: 'dev-emp-019', email: 'kenny@acme-security.test', firstName: 'Kenneth', lastName: 'Parker', passwordHash: '$2b$10$XEUX3wL9wI2VEjEoUdCSw.O8xFVIfhUJAGahknql8PdWYj0DITrSe', role: 'user' },
        { id: 'dev-emp-020', email: 'santos@acme-security.test', firstName: 'Maria', lastName: 'Santos', passwordHash: '$2b$10$XEUX3wL9wI2VEjEoUdCSw.O8xFVIfhUJAGahknql8PdWYj0DITrSe', role: 'user' },
        { id: 'dev-emp-021', email: 'phillips@acme-security.test', firstName: 'Derek', lastName: 'Phillips', passwordHash: '$2b$10$XEUX3wL9wI2VEjEoUdCSw.O8xFVIfhUJAGahknql8PdWYj0DITrSe', role: 'user' },
        { id: 'dev-emp-022', email: 'cruz@acme-security.test', firstName: 'Vanessa', lastName: 'Cruz', passwordHash: '$2b$10$XEUX3wL9wI2VEjEoUdCSw.O8xFVIfhUJAGahknql8PdWYj0DITrSe', role: 'user' },
        { id: 'dev-emp-023', email: 'obrien@acme-security.test', firstName: 'James', lastName: 'OBrien', passwordHash: '$2b$10$XEUX3wL9wI2VEjEoUdCSw.O8xFVIfhUJAGahknql8PdWYj0DITrSe', role: 'user' },
        { id: 'dev-emp-024', email: 'scott@acme-security.test', firstName: 'Brandon', lastName: 'Scott', passwordHash: '$2b$10$XEUX3wL9wI2VEjEoUdCSw.O8xFVIfhUJAGahknql8PdWYj0DITrSe', role: 'user' },
        { id: 'dev-emp-025', email: 'turner@acme-security.test', firstName: 'Keisha', lastName: 'Turner', passwordHash: '$2b$10$XEUX3wL9wI2VEjEoUdCSw.O8xFVIfhUJAGahknql8PdWYj0DITrSe', role: 'user' },
        { id: 'dev-emp-026', email: 'clark@acme-security.test', firstName: 'Nathan', lastName: 'Clark', passwordHash: '$2b$10$XEUX3wL9wI2VEjEoUdCSw.O8xFVIfhUJAGahknql8PdWYj0DITrSe', role: 'user' },
        { id: 'dev-emp-027', email: 'allen@acme-security.test', firstName: 'Sophia', lastName: 'Allen', passwordHash: '$2b$10$XEUX3wL9wI2VEjEoUdCSw.O8xFVIfhUJAGahknql8PdWYj0DITrSe', role: 'user' },
        { id: 'dev-emp-028', email: 'flores@acme-security.test', firstName: 'Luis', lastName: 'Flores', passwordHash: '$2b$10$XEUX3wL9wI2VEjEoUdCSw.O8xFVIfhUJAGahknql8PdWYj0DITrSe', role: 'user' },
        { id: 'dev-emp-029', email: 'robinson@acme-security.test', firstName: 'Tasha', lastName: 'Robinson', passwordHash: '$2b$10$XEUX3wL9wI2VEjEoUdCSw.O8xFVIfhUJAGahknql8PdWYj0DITrSe', role: 'user' },
        { id: 'dev-emp-030', email: 'morgan@acme-security.test', firstName: 'Chris', lastName: 'Morgan', passwordHash: '$2b$10$XEUX3wL9wI2VEjEoUdCSw.O8xFVIfhUJAGahknql8PdWYj0DITrSe', role: 'user' },
      ];

      for (const user of devUsers) {
        await tx.execute(sql`
          INSERT INTO users (id, email, first_name, last_name, password_hash, role, email_verified, current_workspace_id, created_at, updated_at, login_attempts, mfa_enabled)
          VALUES (${user.id}, ${user.email}, ${user.firstName}, ${user.lastName}, ${user.passwordHash}, ${user.role}, TRUE, NULL, NOW(), NOW(), 0, FALSE)
          ON CONFLICT (id) DO NOTHING
        `);
      }

      // =====================================================================
      // 2. DEV WORKSPACES - Two test companies + demo workspace
      // =====================================================================
      console.log('[DevSeed] Creating test workspaces...');

      const devWorkspaces = [
        { id: DEV_SENTINEL_WORKSPACE, name: 'Acme Security Services', ownerId: 'dev-owner-001', tier: 'enterprise', status: 'active', category: 'security', maxEmp: 50, maxClients: 25 },
        { id: 'dev-lonestar-security-ws', name: 'Lone Star Security Group', ownerId: 'dev-owner-002', tier: 'professional', status: 'active', category: 'security', maxEmp: 20, maxClients: 15 },
        { id: 'dev-demo-workspace', name: 'Demo Workspace', ownerId: 'dev-demo-user', tier: 'enterprise', status: 'active', category: 'general', maxEmp: 100, maxClients: 50 },
      ];

      for (const ws of devWorkspaces) {
        await tx.execute(sql`
          INSERT INTO workspaces (id, name, owner_id, subscription_tier, subscription_status, business_category, max_employees, max_clients, created_at, updated_at)
          VALUES (${ws.id}, ${ws.name}, ${ws.ownerId}, ${ws.tier}, ${ws.status}, ${ws.category}, ${ws.maxEmp}, ${ws.maxClients}, NOW(), NOW())
          ON CONFLICT (id) DO NOTHING
        `);
      }

      // Update users with their workspace assignments
      await tx.execute(sql`UPDATE users SET current_workspace_id = ${DEV_SENTINEL_WORKSPACE} WHERE id IN ('dev-owner-001', 'dev-manager-001', 'dev-manager-002', 'dev-emp-001', 'dev-emp-002', 'dev-emp-003', 'dev-emp-004', 'dev-emp-005', 'dev-emp-006', 'dev-emp-007', 'dev-emp-008', 'dev-emp-009', 'dev-emp-010', 'dev-emp-015', 'dev-emp-016', 'dev-emp-017', 'dev-emp-018', 'dev-emp-019', 'dev-emp-020', 'dev-emp-021', 'dev-emp-022', 'dev-emp-023', 'dev-emp-024', 'dev-emp-025', 'dev-emp-026', 'dev-emp-027', 'dev-emp-028', 'dev-emp-029', 'dev-emp-030') AND current_workspace_id IS NULL`);
      await tx.execute(sql`UPDATE users SET current_workspace_id = 'dev-lonestar-security-ws' WHERE id IN ('dev-owner-002', 'dev-emp-011', 'dev-emp-012', 'dev-emp-013', 'dev-emp-014') AND current_workspace_id IS NULL`);
      await tx.execute(sql`UPDATE users SET current_workspace_id = 'dev-demo-workspace' WHERE id = 'dev-demo-user' AND current_workspace_id IS NULL`);

      // =====================================================================
      // 3. DEV PLATFORM ROLES - Test admin roles
      // =====================================================================
      console.log('[DevSeed] Creating test platform roles...');

      // IMPORTANT: dev-owner-001 (Marcus Rivera) is an org_owner of Acme Security - NOT a platform admin.
      // Only actual platform staff (root-admin-workfos, root-user-00000000) get platform roles.
      // Org owners must NEVER receive platform admin roles - they are workspace-level roles only.

      // =====================================================================
      // 4. DEV EMPLOYEES - Acme Security team (13 employees)
      // =====================================================================
      console.log('[DevSeed] Creating test employees...');

      const acmeEmployees = [
        { id: 'dev-acme-emp-001', userId: 'dev-owner-001', firstName: 'Marcus', lastName: 'Rivera', email: 'owner@acme-security.test', hourlyRate: '45.00', role: 'Operations Director', workspaceRole: 'org_owner', empNum: 'EMP-ACME-00001' },
        { id: 'dev-acme-emp-002', userId: 'dev-manager-001', firstName: 'Sarah', lastName: 'Chen', email: 'manager@acme-security.test', hourlyRate: '35.00', role: 'Field Supervisor', workspaceRole: 'manager', empNum: 'EMP-ACME-00002' },
        { id: 'dev-acme-emp-003', userId: 'dev-manager-002', firstName: 'James', lastName: 'Washington', email: 'ops@acme-security.test', hourlyRate: '32.00', role: 'Scheduling Manager', workspaceRole: 'manager', empNum: 'EMP-ACME-00003' },
        { id: 'dev-acme-emp-004', userId: 'dev-emp-001', firstName: 'Carlos', lastName: 'Garcia', email: 'garcia@acme-security.test', hourlyRate: '22.00', role: 'Security Officer', workspaceRole: 'employee', empNum: 'EMP-ACME-00004' },
        { id: 'dev-acme-emp-005', userId: 'dev-emp-002', firstName: 'Diana', lastName: 'Johnson', email: 'johnson@acme-security.test', hourlyRate: '24.00', role: 'Senior Security Officer', workspaceRole: 'employee', empNum: 'EMP-ACME-00005' },
        { id: 'dev-acme-emp-006', userId: 'dev-emp-003', firstName: 'Robert', lastName: 'Williams', email: 'williams@acme-security.test', hourlyRate: '20.00', role: 'Security Officer', workspaceRole: 'employee', empNum: 'EMP-ACME-00006' },
        { id: 'dev-acme-emp-007', userId: 'dev-emp-004', firstName: 'Elena', lastName: 'Martinez', email: 'martinez@acme-security.test', hourlyRate: '23.00', role: 'Security Officer', workspaceRole: 'employee', empNum: 'EMP-ACME-00007' },
        { id: 'dev-acme-emp-008', userId: 'dev-emp-005', firstName: 'Michael', lastName: 'Thompson', email: 'thompson@acme-security.test', hourlyRate: '21.00', role: 'Security Officer', workspaceRole: 'employee', empNum: 'EMP-ACME-00008' },
        { id: 'dev-acme-emp-009', userId: 'dev-emp-006', firstName: 'Angela', lastName: 'Davis', email: 'davis@acme-security.test', hourlyRate: '22.50', role: 'Patrol Officer', workspaceRole: 'employee', empNum: 'EMP-ACME-00009' },
        { id: 'dev-acme-emp-010', userId: 'dev-emp-007', firstName: 'Kevin', lastName: 'Brown', email: 'brown@acme-security.test', hourlyRate: '20.00', role: 'Security Officer', workspaceRole: 'employee', empNum: 'EMP-ACME-00010' },
        { id: 'dev-acme-emp-011', userId: 'dev-emp-008', firstName: 'Jennifer', lastName: 'Lee', email: 'lee@acme-security.test', hourlyRate: '24.50', role: 'Access Control Specialist', workspaceRole: 'employee', empNum: 'EMP-ACME-00011' },
        { id: 'dev-acme-emp-012', userId: 'dev-emp-009', firstName: 'David', lastName: 'Wilson', email: 'wilson@acme-security.test', hourlyRate: '19.50', role: 'Security Officer', workspaceRole: 'employee', empNum: 'EMP-ACME-00012' },
        { id: 'dev-acme-emp-013', userId: 'dev-emp-010', firstName: 'Lisa', lastName: 'Anderson', email: 'anderson@acme-security.test', hourlyRate: '21.00', role: 'Dispatch Coordinator', workspaceRole: 'employee', empNum: 'EMP-ACME-00013' },
        // Extended team: supervisors, department managers, contractors, extra officers
        { id: 'dev-acme-emp-014', userId: 'dev-emp-015', firstName: 'Tony', lastName: 'Nguyen', email: 'nguyen@acme-security.test', hourlyRate: '28.00', role: 'Shift Supervisor', workspaceRole: 'supervisor', empNum: 'EMP-ACME-00014' },
        { id: 'dev-acme-emp-015', userId: 'dev-emp-016', firstName: 'Patricia', lastName: 'Moore', email: 'moore@acme-security.test', hourlyRate: '29.50', role: 'Site Supervisor', workspaceRole: 'supervisor', empNum: 'EMP-ACME-00015' },
        { id: 'dev-acme-emp-016', userId: 'dev-emp-017', firstName: 'Brian', lastName: 'Taylor', email: 'taylor@acme-security.test', hourlyRate: '33.00', role: 'Department Manager - North Region', workspaceRole: 'department_manager', empNum: 'EMP-ACME-00016' },
        { id: 'dev-acme-emp-017', userId: 'dev-emp-018', firstName: 'Sandra', lastName: 'White', email: 'white@acme-security.test', hourlyRate: '34.00', role: 'Department Manager - South Region', workspaceRole: 'department_manager', empNum: 'EMP-ACME-00017' },
        { id: 'dev-acme-emp-018', userId: 'dev-emp-019', firstName: 'Kenneth', lastName: 'Parker', email: 'kenny@acme-security.test', hourlyRate: '18.00', role: 'Contract Security Officer', workspaceRole: 'contractor', empNum: 'CTR-ACME-00001' },
        { id: 'dev-acme-emp-019', userId: 'dev-emp-020', firstName: 'Maria', lastName: 'Santos', email: 'santos@acme-security.test', hourlyRate: '17.50', role: 'Contract Security Officer', workspaceRole: 'contractor', empNum: 'CTR-ACME-00002' },
        { id: 'dev-acme-emp-020', userId: 'dev-emp-021', firstName: 'Derek', lastName: 'Phillips', email: 'phillips@acme-security.test', hourlyRate: '19.00', role: 'Contract Patrol Officer', workspaceRole: 'contractor', empNum: 'CTR-ACME-00003' },
        { id: 'dev-acme-emp-021', userId: 'dev-emp-022', firstName: 'Vanessa', lastName: 'Cruz', email: 'cruz@acme-security.test', hourlyRate: '18.50', role: 'Contract Security Officer', workspaceRole: 'contractor', empNum: 'CTR-ACME-00004' },
        { id: 'dev-acme-emp-022', userId: 'dev-emp-023', firstName: 'James', lastName: 'OBrien', email: 'obrien@acme-security.test', hourlyRate: '20.00', role: 'Contract Access Control Specialist', workspaceRole: 'contractor', empNum: 'CTR-ACME-00005' },
        { id: 'dev-acme-emp-023', userId: 'dev-emp-024', firstName: 'Brandon', lastName: 'Scott', email: 'scott@acme-security.test', hourlyRate: '21.50', role: 'Security Officer', workspaceRole: 'employee', empNum: 'EMP-ACME-00023' },
        { id: 'dev-acme-emp-024', userId: 'dev-emp-025', firstName: 'Keisha', lastName: 'Turner', email: 'turner@acme-security.test', hourlyRate: '22.00', role: 'Senior Security Officer', workspaceRole: 'employee', empNum: 'EMP-ACME-00024' },
        { id: 'dev-acme-emp-025', userId: 'dev-emp-026', firstName: 'Nathan', lastName: 'Clark', email: 'clark@acme-security.test', hourlyRate: '20.50', role: 'Security Officer', workspaceRole: 'employee', empNum: 'EMP-ACME-00025' },
        { id: 'dev-acme-emp-026', userId: 'dev-emp-027', firstName: 'Sophia', lastName: 'Allen', email: 'allen@acme-security.test', hourlyRate: '23.00', role: 'Patrol Officer', workspaceRole: 'employee', empNum: 'EMP-ACME-00026' },
        { id: 'dev-acme-emp-027', userId: 'dev-emp-028', firstName: 'Luis', lastName: 'Flores', email: 'flores@acme-security.test', hourlyRate: '21.00', role: 'Security Officer', workspaceRole: 'employee', empNum: 'EMP-ACME-00027' },
        { id: 'dev-acme-emp-028', userId: 'dev-emp-029', firstName: 'Tasha', lastName: 'Robinson', email: 'robinson@acme-security.test', hourlyRate: '22.50', role: 'Security Officer', workspaceRole: 'employee', empNum: 'EMP-ACME-00028' },
        { id: 'dev-acme-emp-029', userId: 'dev-emp-030', firstName: 'Chris', lastName: 'Morgan', email: 'morgan@acme-security.test', hourlyRate: '20.00', role: 'Security Officer', workspaceRole: 'employee', empNum: 'EMP-ACME-00029' },
      ];

      for (const emp of acmeEmployees) {
        await tx.execute(sql`
          INSERT INTO employees (id, user_id, workspace_id, first_name, last_name, email, hourly_rate, role, workspace_role, employee_number, created_at, updated_at)
          VALUES (${emp.id}, ${emp.userId}, ${DEV_SENTINEL_WORKSPACE}, ${emp.firstName}, ${emp.lastName}, ${emp.email}, ${emp.hourlyRate}, ${emp.role}, ${emp.workspaceRole}, ${emp.empNum}, NOW(), NOW())
          ON CONFLICT (id) DO NOTHING
        `);
      }

      // Lone Star Security Group employees (5 employees)
      const lonestarEmployees = [
        { id: 'dev-lstar-emp-001', userId: 'dev-owner-002', firstName: 'Raymond', lastName: 'Castillo', email: 'owner@lonestar-security.test', hourlyRate: '40.00', role: 'President / CEO', workspaceRole: 'org_owner', empNum: 'EMP-LSG-00001' },
        { id: 'dev-lstar-emp-002', userId: 'dev-emp-011', firstName: 'Diego', lastName: 'Rodriguez', email: 'rodriguez@lonestar-security.test', hourlyRate: '28.00', role: 'Field Supervisor', workspaceRole: 'employee', empNum: 'EMP-LSG-00002' },
        { id: 'dev-lstar-emp-003', userId: 'dev-emp-012', firstName: 'Linh', lastName: 'Nguyen', email: 'nguyen@lonestar-security.test', hourlyRate: '22.00', role: 'Security Officer', workspaceRole: 'employee', empNum: 'EMP-LSG-00003' },
        { id: 'dev-lstar-emp-004', userId: 'dev-emp-013', firstName: 'Marcus', lastName: 'Foster', email: 'foster@lonestar-security.test', hourlyRate: '21.50', role: 'Security Officer', workspaceRole: 'employee', empNum: 'EMP-LSG-00004' },
        { id: 'dev-lstar-emp-005', userId: 'dev-emp-014', firstName: 'Ana', lastName: 'Reyes', email: 'reyes@lonestar-security.test', hourlyRate: '22.50', role: 'Security Officer', workspaceRole: 'employee', empNum: 'EMP-LSG-00005' },
      ];

      for (const emp of lonestarEmployees) {
        await tx.execute(sql`
          INSERT INTO employees (id, user_id, workspace_id, first_name, last_name, email, hourly_rate, role, workspace_role, employee_number, created_at, updated_at)
          VALUES (${emp.id}, ${emp.userId}, 'dev-lonestar-security-ws', ${emp.firstName}, ${emp.lastName}, ${emp.email}, ${emp.hourlyRate}, ${emp.role}, ${emp.workspaceRole}, ${emp.empNum}, NOW(), NOW())
          ON CONFLICT (id) DO NOTHING
        `);
      }

      // =====================================================================
      // 5. DEV CLIENTS - Realistic client accounts
      // =====================================================================
      console.log('[DevSeed] Creating test clients...');

      const acmeClients = [
        { id: 'dev-client-001', firstName: 'Riverside', lastName: 'Mall Management', companyName: 'Riverside Shopping Center', email: 'security@riverside-mall.test', phone: '555-100-2001', address: '4500 Riverside Blvd', city: 'Dallas', state: 'TX', postalCode: '75201', contractRate: '28.00', pocName: 'Tom Bradley', pocPhone: '555-100-2002', pocEmail: 'tbradley@riverside-mall.test', pocTitle: 'Facilities Manager' },
        { id: 'dev-client-002', firstName: 'Downtown', lastName: 'Office Tower', companyName: 'Pinnacle Tower LLC', email: 'management@pinnacle-tower.test', phone: '555-200-3001', address: '1200 Main Street, Suite 500', city: 'Fort Worth', state: 'TX', postalCode: '76102', contractRate: '32.00', pocName: 'Rebecca Stone', pocPhone: '555-200-3002', pocEmail: 'rstone@pinnacle-tower.test', pocTitle: 'Property Manager' },
        { id: 'dev-client-003', firstName: 'Lone Star', lastName: 'Hospital', companyName: 'Lone Star Medical Center', email: 'security@lonestar-medical.test', phone: '555-300-4001', address: '8900 Medical Center Dr', city: 'Arlington', state: 'TX', postalCode: '76010', contractRate: '35.00', pocName: 'Dr. Karen Mitchell', pocPhone: '555-300-4002', pocEmail: 'kmitchell@lonestar-medical.test', pocTitle: 'Director of Safety' },
        { id: 'dev-client-004', firstName: 'Texas Star', lastName: 'Events', companyName: 'Texas Star Event Center', email: 'ops@texasstar-events.test', phone: '555-400-5001', address: '2200 Entertainment Ave', city: 'Grand Prairie', state: 'TX', postalCode: '75050', contractRate: '30.00', pocName: 'Miguel Santos', pocPhone: '555-400-5002', pocEmail: 'msantos@texasstar-events.test', pocTitle: 'Operations Director' },
        { id: 'dev-client-005', firstName: 'Heritage', lastName: 'Bank Group', companyName: 'Heritage National Bank', email: 'security@heritage-bank.test', phone: '555-500-6001', address: '700 Commerce Street', city: 'Dallas', state: 'TX', postalCode: '75202', contractRate: '38.00', pocName: 'William Harper', pocPhone: '555-500-6002', pocEmail: 'wharper@heritage-bank.test', pocTitle: 'VP Security' },
        { id: 'dev-client-006', firstName: 'Oakwood', lastName: 'Apartments', companyName: 'Oakwood Residential Management', email: 'management@oakwood-apts.test', phone: '555-600-7001', address: '3100 Oak Lawn Ave', city: 'Dallas', state: 'TX', postalCode: '75219', contractRate: '24.00', pocName: 'Janet Cruz', pocPhone: '555-600-7002', pocEmail: 'jcruz@oakwood-apts.test', pocTitle: 'Community Manager' },
        { id: 'dev-client-007', firstName: 'DFW', lastName: 'Logistics Hub', companyName: 'DFW Distribution Center', email: 'security@dfw-logistics.test', phone: '555-700-8001', address: '5600 Airport Freeway', city: 'Irving', state: 'TX', postalCode: '75062', contractRate: '26.00', pocName: 'Richard Park', pocPhone: '555-700-8002', pocEmail: 'rpark@dfw-logistics.test', pocTitle: 'Warehouse Manager' },
        { id: 'dev-client-008', firstName: 'Alliance', lastName: 'Protection Agency', companyName: 'Alliance National Security', email: 'contracts@alliance-security.test', phone: '555-800-9001', address: '900 Alliance Gateway', city: 'Fort Worth', state: 'TX', postalCode: '76177', contractRate: '40.00', pocName: 'Col. Frank Morrison', pocPhone: '555-800-9002', pocEmail: 'fmorrison@alliance-security.test', pocTitle: 'Contract Officer', isAgency: true },
      ];

      for (const client of acmeClients) {
        await tx.execute(sql`
          INSERT INTO clients (id, workspace_id, first_name, last_name, company_name, email, phone, address, city, state, postal_code, country, contract_rate, contract_rate_type, poc_name, poc_phone, poc_email, poc_title, is_agency, created_at, updated_at)
          VALUES (${client.id}, ${DEV_SENTINEL_WORKSPACE}, ${client.firstName}, ${client.lastName}, ${client.companyName}, ${client.email}, ${client.phone}, ${client.address}, ${client.city}, ${client.state}, ${client.postalCode}, 'US', ${client.contractRate}, 'hourly', ${client.pocName}, ${client.pocPhone}, ${client.pocEmail}, ${client.pocTitle}, ${(client as any).isAgency || false}, NOW(), NOW())
          ON CONFLICT (id) DO NOTHING
        `);
      }

      const lonestarClients = [
        { id: 'dev-client-101', firstName: 'Corporate', lastName: 'Plaza', companyName: 'Corporate Plaza Office Park', email: 'facilities@corp-plaza.test', phone: '5551102001', address: '2500 Corporate Blvd', city: 'Plano', state: 'TX', postalCode: '75024', contractRate: '29.50', pocName: 'Amy Foster', pocPhone: '5551102002', pocEmail: 'afoster@corp-plaza.test', pocTitle: 'Facilities Manager' },
        { id: 'dev-client-102', firstName: 'Sunridge', lastName: 'Medical', companyName: 'Sunridge Medical Center', email: 'security@sunridge-medical.test', phone: '5551203001', address: '1800 Sunridge Dr', city: 'Richardson', state: 'TX', postalCode: '75080', contractRate: '34.00', pocName: 'Nancy Kim', pocPhone: '5551203002', pocEmail: 'nkim@sunridge-medical.test', pocTitle: 'Security Director' },
        { id: 'dev-client-103', firstName: 'Garland', lastName: 'Logistics', companyName: 'Garland Distribution Center', email: 'ops@garland-dist.test', phone: '5551304001', address: '600 Industrial Pkwy', city: 'Garland', state: 'TX', postalCode: '75040', contractRate: '27.00', pocName: 'John Reed', pocPhone: '5551304002', pocEmail: 'jreed@garland-dist.test', pocTitle: 'Operations Manager' },
      ];

      for (const client of lonestarClients) {
        await tx.execute(sql`
          INSERT INTO clients (id, workspace_id, first_name, last_name, company_name, email, phone, address, city, state, postal_code, country, contract_rate, contract_rate_type, poc_name, poc_phone, poc_email, poc_title, created_at, updated_at)
          VALUES (${client.id}, 'dev-lonestar-security-ws', ${client.firstName}, ${client.lastName}, ${client.companyName}, ${client.email}, ${client.phone}, ${client.address}, ${client.city}, ${client.state}, ${client.postalCode}, 'US', ${client.contractRate}, 'hourly', ${client.pocName}, ${client.pocPhone}, ${client.pocEmail}, ${client.pocTitle}, NOW(), NOW())
          ON CONFLICT (id) DO NOTHING
        `);
      }

      // =====================================================================
      // 6. DEV SHIFTS - Sample shifts for the current week
      // =====================================================================
      console.log('[DevSeed] Creating test shifts...');

      const now = new Date();
      const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());

      const shiftTemplates = [
        { empId: 'dev-acme-emp-004', clientId: 'dev-client-001', title: 'Mall Patrol - Day Shift', category: 'security', dayOffset: 0, startHour: 6, endHour: 14 },
        { empId: 'dev-acme-emp-005', clientId: 'dev-client-001', title: 'Mall Patrol - Evening Shift', category: 'security', dayOffset: 0, startHour: 14, endHour: 22 },
        { empId: 'dev-acme-emp-006', clientId: 'dev-client-002', title: 'Tower Lobby - Day', category: 'field_ops', dayOffset: 0, startHour: 7, endHour: 15 },
        { empId: 'dev-acme-emp-007', clientId: 'dev-client-003', title: 'Hospital Security - Night', category: 'emergency', dayOffset: 0, startHour: 22, endHour: 6 },
        { empId: 'dev-acme-emp-008', clientId: 'dev-client-004', title: 'Event Security', category: 'security', dayOffset: 1, startHour: 16, endHour: 0 },
        { empId: 'dev-acme-emp-009', clientId: 'dev-client-005', title: 'Bank Patrol', category: 'security', dayOffset: 1, startHour: 8, endHour: 17 },
        { empId: 'dev-acme-emp-010', clientId: 'dev-client-006', title: 'Apartment Complex - Night', category: 'field_ops', dayOffset: 1, startHour: 22, endHour: 6 },
        { empId: 'dev-acme-emp-011', clientId: 'dev-client-007', title: 'Warehouse Access Control', category: 'field_ops', dayOffset: 2, startHour: 6, endHour: 14 },
        { empId: 'dev-acme-emp-012', clientId: 'dev-client-002', title: 'Tower Lobby - Evening', category: 'field_ops', dayOffset: 2, startHour: 14, endHour: 22 },
        { empId: 'dev-acme-emp-004', clientId: 'dev-client-003', title: 'Hospital Security - Day', category: 'emergency', dayOffset: 2, startHour: 6, endHour: 14 },
        { empId: 'dev-acme-emp-005', clientId: 'dev-client-005', title: 'Bank Branch Security', category: 'security', dayOffset: 3, startHour: 8, endHour: 16 },
        { empId: 'dev-acme-emp-006', clientId: 'dev-client-001', title: 'Mall Weekend Coverage', category: 'security', dayOffset: 3, startHour: 10, endHour: 18 },
        { empId: 'dev-acme-emp-007', clientId: 'dev-client-004', title: 'Concert Security', category: 'security', dayOffset: 4, startHour: 17, endHour: 1 },
        { empId: 'dev-acme-emp-008', clientId: 'dev-client-006', title: 'Apartment Complex - Day', category: 'field_ops', dayOffset: 4, startHour: 7, endHour: 15 },
        { empId: 'dev-acme-emp-013', clientId: 'dev-client-007', title: 'Warehouse Night Security', category: 'security', dayOffset: 4, startHour: 22, endHour: 6 },
        { empId: 'dev-acme-emp-009', clientId: 'dev-client-002', title: 'Tower Weekend Patrol', category: 'field_ops', dayOffset: 5, startHour: 8, endHour: 20 },
        { empId: 'dev-acme-emp-010', clientId: 'dev-client-001', title: 'Mall Sunday Coverage', category: 'security', dayOffset: 6, startHour: 10, endHour: 18 },
        { empId: 'dev-acme-emp-011', clientId: 'dev-client-003', title: 'Hospital ER Security', category: 'emergency', dayOffset: 6, startHour: 18, endHour: 6 },
      ];

      for (let i = 0; i < shiftTemplates.length; i++) {
        const shift = shiftTemplates[i];
        const startDate = new Date(today);
        startDate.setDate(startDate.getDate() + shift.dayOffset);
        startDate.setHours(shift.startHour, 0, 0, 0);

        const endDate = new Date(startDate);
        if (shift.endHour <= shift.startHour) {
          endDate.setDate(endDate.getDate() + 1);
        }
        endDate.setHours(shift.endHour, 0, 0, 0);

        const dateStr = startDate.toISOString().split('T')[0];

        await tx.execute(sql`
          INSERT INTO shifts (id, workspace_id, employee_id, client_id, title, category, start_time, end_time, date, status, billable_to_client, created_at, updated_at)
          VALUES (${`dev-shift-${String(i + 1).padStart(3, '0')}`}, ${DEV_SENTINEL_WORKSPACE}, ${shift.empId}, ${shift.clientId}, ${shift.title}, ${shift.category}, ${startDate.toISOString()}, ${endDate.toISOString()}, ${dateStr}, 'confirmed', TRUE, NOW(), NOW())
          ON CONFLICT (id) DO NOTHING
        `);
      }

      // =====================================================================
      // 6b. OPEN SHIFTS — Unassigned shifts for Trinity to fill
      //     These have no employee_id so they appear as "open" in the schedule
      // =====================================================================
      console.log('[DevSeed] Creating open shifts for Trinity auto-fill testing...');

      const openShiftTemplates = [
        { clientId: 'dev-client-001', title: 'Mall Patrol - Open Day Shift', category: 'security', dayOffset: 0, startHour: 6, endHour: 14 },
        { clientId: 'dev-client-001', title: 'Mall Patrol - Open Evening Shift', category: 'security', dayOffset: 0, startHour: 14, endHour: 22 },
        { clientId: 'dev-client-001', title: 'Mall Patrol - Open Night Shift', category: 'security', dayOffset: 0, startHour: 22, endHour: 6 },
        { clientId: 'dev-client-002', title: 'Tower Lobby - Open Day', category: 'field_ops', dayOffset: 1, startHour: 7, endHour: 15 },
        { clientId: 'dev-client-002', title: 'Tower Lobby - Open Night', category: 'field_ops', dayOffset: 1, startHour: 19, endHour: 3 },
        { clientId: 'dev-client-003', title: 'Hospital Security - Open Day', category: 'emergency', dayOffset: 1, startHour: 6, endHour: 14 },
        { clientId: 'dev-client-003', title: 'Hospital Security - Open Night', category: 'emergency', dayOffset: 1, startHour: 22, endHour: 6 },
        { clientId: 'dev-client-004', title: 'Event Security - Open', category: 'security', dayOffset: 2, startHour: 16, endHour: 0 },
        { clientId: 'dev-client-005', title: 'Bank Open Shift - Morning', category: 'security', dayOffset: 2, startHour: 8, endHour: 16 },
        { clientId: 'dev-client-006', title: 'Apartment Complex - Open Night', category: 'field_ops', dayOffset: 2, startHour: 22, endHour: 6 },
        { clientId: 'dev-client-007', title: 'Warehouse Open - Day', category: 'field_ops', dayOffset: 3, startHour: 6, endHour: 14 },
        { clientId: 'dev-client-007', title: 'Warehouse Open - Night', category: 'field_ops', dayOffset: 3, startHour: 22, endHour: 6 },
        { clientId: 'dev-client-001', title: 'Mall Weekend - Open AM', category: 'security', dayOffset: 4, startHour: 8, endHour: 16 },
        { clientId: 'dev-client-001', title: 'Mall Weekend - Open PM', category: 'security', dayOffset: 4, startHour: 16, endHour: 0 },
        { clientId: 'dev-client-003', title: 'Hospital ER - Open', category: 'emergency', dayOffset: 5, startHour: 18, endHour: 6 },
        { clientId: 'dev-client-002', title: 'Tower Weekend - Open', category: 'field_ops', dayOffset: 5, startHour: 8, endHour: 20 },
        { clientId: 'dev-client-005', title: 'Bank Branch - Open Saturday', category: 'security', dayOffset: 5, startHour: 9, endHour: 17 },
        { clientId: 'dev-client-006', title: 'Apartment - Open Sunday', category: 'field_ops', dayOffset: 6, startHour: 7, endHour: 15 },
        { clientId: 'dev-client-004', title: 'Event Security - Open Sunday', category: 'security', dayOffset: 6, startHour: 14, endHour: 22 },
        { clientId: 'dev-client-007', title: 'Warehouse Open - Sunday Day', category: 'field_ops', dayOffset: 6, startHour: 6, endHour: 14 },
      ];

      for (let i = 0; i < openShiftTemplates.length; i++) {
        const shift = openShiftTemplates[i];
        const startDate = new Date(today);
        startDate.setDate(startDate.getDate() + shift.dayOffset);
        startDate.setHours(shift.startHour, 0, 0, 0);

        const endDate = new Date(startDate);
        if (shift.endHour <= shift.startHour) {
          endDate.setDate(endDate.getDate() + 1);
        }
        endDate.setHours(shift.endHour, 0, 0, 0);

        const dateStr = startDate.toISOString().split('T')[0];
        const openShiftId = `dev-open-shift-${String(i + 1).padStart(3, '0')}`;

        await tx.execute(sql`
          INSERT INTO shifts (id, workspace_id, employee_id, client_id, title, category, start_time, end_time, date, status, billable_to_client, created_at, updated_at)
          VALUES (${openShiftId}, ${DEV_SENTINEL_WORKSPACE}, NULL, ${shift.clientId}, ${shift.title}, ${shift.category}, ${startDate.toISOString()}, ${endDate.toISOString()}, ${dateStr}, 'open', TRUE, NOW(), NOW())
          ON CONFLICT (id) DO NOTHING
        `);
      }

      // =====================================================================
      // 7. DEV WORKSPACE CREDITS - Give test workspaces credits
      // =====================================================================
      console.log('[DevSeed] Setting up workspace credits...');

      try {
        const creditWorkspaces = [
          { id: 'dev-credits-acme', wsId: DEV_SENTINEL_WORKSPACE, balance: 25000, monthly: 25000 },
          { id: 'dev-credits-lstar', wsId: 'dev-lonestar-security-ws', balance: 8000, monthly: 8000 },
          { id: 'dev-credits-demo', wsId: 'dev-demo-workspace', balance: 25000, monthly: 25000 },
        ];

        for (const cred of creditWorkspaces) {
          await tx.execute(sql`
            INSERT INTO workspace_credits (id, workspace_id, current_balance, monthly_allocation, total_credits_earned, total_credits_spent, total_credits_purchased, is_active, created_at, updated_at)
            VALUES (${cred.id}, ${cred.wsId}, ${cred.balance}, ${cred.monthly}, ${cred.balance}, 0, 0, TRUE, NOW(), NOW())
            ON CONFLICT (id) DO NOTHING
          `);
        }
      } catch (err) {
        console.log('[DevSeed] Workspace credits setup skipped:', (err as Error).message);
      }

      // =====================================================================
      // 8. MARCUS TIME ENTRIES — Realistic March 1-15 shifts for earnings widget
      //    Marcus Rivera (dev-acme-emp-001) @ $45/hr — 10 weekday shifts, ~80 hrs
      // =====================================================================
      console.log('[DevSeed] Setting up Marcus time entries for pay period...');
      const marcusShifts = [
        { date: '2026-03-02', start: '06:00', end: '14:00', hours: 8.0 },
        { date: '2026-03-03', start: '06:00', end: '14:00', hours: 8.0 },
        { date: '2026-03-04', start: '07:00', end: '14:30', hours: 7.5 },
        { date: '2026-03-05', start: '06:00', end: '14:00', hours: 8.0 },
        { date: '2026-03-06', start: '06:00', end: '15:00', hours: 9.0 },
        { date: '2026-03-09', start: '06:00', end: '14:00', hours: 8.0 },
        { date: '2026-03-10', start: '06:00', end: '14:00', hours: 8.0 },
        { date: '2026-03-11', start: '07:00', end: '14:00', hours: 7.0 },
        { date: '2026-03-12', start: '06:00', end: '14:00', hours: 8.0 },
        { date: '2026-03-13', start: '06:00', end: '14:30', hours: 8.5 },
      ];
      try {
        for (const shift of marcusShifts) {
          await tx.execute(sql`
            INSERT INTO time_entries (workspace_id, employee_id, clock_in, clock_out, total_hours, hourly_rate, total_amount, status, billable_to_client, regular_hours)
            VALUES (
              ${DEV_SENTINEL_WORKSPACE}, 'dev-acme-emp-001',
              ${`${shift.date} ${shift.start}:00`}::timestamp,
              ${`${shift.date} ${shift.end}:00`}::timestamp,
              ${shift.hours}, 45.00, ${(shift.hours * 45).toFixed(2)},
              'approved', false, ${shift.hours}
            )
            ON CONFLICT DO NOTHING
          `);
        }
      } catch (err) {
        console.log('[DevSeed] Marcus time entries setup skipped:', (err as Error).message);
      }

      // =====================================================================
      // 9. MARCUS PAYROLL RUNS — Two processed pay periods so my-paychecks
      //    widget shows real data (Feb 16-28 and Mar 1-15, 2026)
      // =====================================================================
      console.log('[DevSeed] Setting up Marcus payroll runs...');
      try {
        const DEV_RUN_FEB = 'dev-payrun-marcus-feb-2026';
        const DEV_RUN_MAR = 'dev-payrun-marcus-mar-2026';

        await tx.execute(sql`
          INSERT INTO payroll_runs (id, workspace_id, period_start, period_end, status,
            total_gross_pay, total_taxes, total_net_pay, run_type, disbursement_status,
            processed_by, processed_at, created_at, updated_at)
          VALUES
            (${DEV_RUN_FEB}, ${DEV_SENTINEL_WORKSPACE},
             '2026-02-16 00:00:00', '2026-02-28 23:59:59', 'processed',
             3600.00, 1211.40, 2388.60, 'regular', 'disbursed',
             'dev-owner-001', '2026-02-28 18:00:00', '2026-02-28 17:00:00', '2026-02-28 18:00:00'),
            (${DEV_RUN_MAR}, ${DEV_SENTINEL_WORKSPACE},
             '2026-03-01 00:00:00', '2026-03-15 23:59:59', 'processed',
             3600.00, 1211.40, 2388.60, 'regular', 'disbursed',
             'dev-owner-001', '2026-03-15 18:00:00', '2026-03-15 17:00:00', '2026-03-15 18:00:00')
          ON CONFLICT (id) DO NOTHING
        `);

        await tx.execute(sql`
          INSERT INTO payroll_entries (id, payroll_run_id, employee_id, workspace_id,
            regular_hours, overtime_hours, hourly_rate,
            gross_pay, federal_tax, state_tax, social_security, medicare, net_pay,
            worker_type, created_at)
          VALUES
            (
              'dev-payentry-marcus-feb-2026', ${DEV_RUN_FEB}, 'dev-acme-emp-001', ${DEV_SENTINEL_WORKSPACE},
              80.00, 0.00, 45.00,
              3600.00, 792.00, 144.00, 223.20, 52.20, 2388.60,
              'employee', '2026-02-28 18:00:00'
            ),
            (
              'dev-payentry-marcus-mar-2026', ${DEV_RUN_MAR}, 'dev-acme-emp-001', ${DEV_SENTINEL_WORKSPACE},
              80.00, 0.00, 45.00,
              3600.00, 792.00, 144.00, 223.20, 52.20, 2388.60,
              'employee', '2026-03-15 18:00:00'
            )
          ON CONFLICT (id) DO NOTHING
        `);
      } catch (err) {
        console.log('[DevSeed] Marcus payroll runs setup skipped:', (err as Error).message);
      }
    });

    // ── ACME INVOICES (5 required for audit compliance) ──────────────────────
    try {
      const now = new Date();
      const d = (offsetDays: number) => new Date(now.getTime() + offsetDays * 86400000);
      // Converted to Drizzle ORM: ON CONFLICT
      await db.insert(invoices).values([
        {
          id: 'dev-inv-acme-001', workspaceId: DEV_SENTINEL_WORKSPACE, clientId: 'dev-client-001',
          invoiceNumber: 'INV-ACME-2026-001', issueDate: d(0), dueDate: d(30),
          subtotal: '2240.00', taxRate: '0.00', taxAmount: '0.00', total: '2240.00',
          status: 'draft', paidAt: null, amountPaid: '0.00', sentAt: null,
          notes: 'Current week security services — Downtown Mall',
        },
        {
          id: 'dev-inv-acme-002', workspaceId: DEV_SENTINEL_WORKSPACE, clientId: 'dev-client-002',
          invoiceNumber: 'INV-ACME-2026-002', issueDate: d(-5), dueDate: d(25),
          subtotal: '1920.00', taxRate: '0.00', taxAmount: '0.00', total: '1920.00',
          status: 'sent', paidAt: null, amountPaid: '0.00', sentAt: d(-5),
          notes: 'Pinnacle Tower lobby security — week of Mar 10',
        },
        {
          id: 'dev-inv-acme-003', workspaceId: DEV_SENTINEL_WORKSPACE, clientId: 'dev-client-007',
          invoiceNumber: 'INV-ACME-2026-003', issueDate: d(-46), dueDate: d(-16),
          subtotal: '2847.00', taxRate: '0.00', taxAmount: '0.00', total: '2847.00',
          status: 'overdue', paidAt: null, amountPaid: '0.00', sentAt: d(-46),
          notes: 'DFW Distribution Center — February patrol services. COLLECTIONS ACTIVE.',
        },
        {
          id: 'dev-inv-acme-004', workspaceId: DEV_SENTINEL_WORKSPACE, clientId: 'dev-client-001',
          invoiceNumber: 'INV-ACME-2026-004', issueDate: d(-35), dueDate: d(-5),
          subtotal: '2100.00', taxRate: '0.00', taxAmount: '0.00', total: '2100.00',
          status: 'paid', paidAt: d(-3), amountPaid: '2100.00', sentAt: d(-35),
          notes: 'Riverside Mall February security — PAID IN FULL',
        },
        {
          id: 'dev-inv-acme-005', workspaceId: DEV_SENTINEL_WORKSPACE, clientId: 'dev-client-003',
          invoiceNumber: 'INV-ACME-2026-005', issueDate: d(-15), dueDate: d(15),
          subtotal: '1200.00', taxRate: '0.00', taxAmount: '0.00', total: '1200.00',
          status: 'partial', paidAt: null, amountPaid: '500.00', sentAt: d(-15),
          notes: 'Lone Star Medical Center — partial payment received $500 of $1200',
        },
      ]).onConflictDoNothing();
      console.log('[DevSeed] Acme invoices seeded (5 invoices)');
    } catch (err) {
      console.log('[DevSeed] Acme invoices skipped:', (err as Error).message.slice(0, 100));
    }

    // ── ACME PAY STUBS for Officers 1-3 (Marcus Feb run) ─────────────────────
    try {
      // Converted to Drizzle ORM: ON CONFLICT
      await db.insert(payStubs).values([
        {
          id: 'dev-stub-acme-004-feb', workspaceId: DEV_SENTINEL_WORKSPACE,
          payrollRunId: 'dev-payrun-marcus-feb-2026', payrollEntryId: null, employeeId: 'dev-acme-emp-004',
          payPeriodStart: new Date('2026-02-16 00:00:00'), payPeriodEnd: new Date('2026-02-28 23:59:59'), payDate: new Date('2026-03-01 00:00:00'),
          grossPay: '1760.00', totalDeductions: '500.16', netPay: '1259.84',
          deductionsBreakdown: {federal_tax:'175.94',state_tax:'0.00',social_security:'109.12',medicare:'25.52',health_insurance:'189.58'},
          earningsBreakdown: {regular_hours:'80',regular_rate:'22.00',regular_pay:'1760.00',overtime_hours:'0',overtime_pay:'0.00'},
          status: 'generated',
        },
        {
          id: 'dev-stub-acme-005-feb', workspaceId: DEV_SENTINEL_WORKSPACE,
          payrollRunId: 'dev-payrun-marcus-feb-2026', payrollEntryId: null, employeeId: 'dev-acme-emp-005',
          payPeriodStart: new Date('2026-02-16 00:00:00'), payPeriodEnd: new Date('2026-02-28 23:59:59'), payDate: new Date('2026-03-01 00:00:00'),
          grossPay: '1920.00', totalDeductions: '384.00', netPay: '1536.00',
          deductionsBreakdown: {federal_tax:'288.00',state_tax:'0.00',social_security:'0.00',medicare:'0.00'},
          earningsBreakdown: {regular_hours:'80',regular_rate:'24.00',regular_pay:'1920.00',overtime_hours:'0',overtime_pay:'0.00'},
          status: 'generated',
        },
        {
          id: 'dev-stub-acme-006-feb', workspaceId: DEV_SENTINEL_WORKSPACE,
          payrollRunId: 'dev-payrun-marcus-feb-2026', payrollEntryId: null, employeeId: 'dev-acme-emp-006',
          payPeriodStart: new Date('2026-02-16 00:00:00'), payPeriodEnd: new Date('2026-02-28 23:59:59'), payDate: new Date('2026-03-01 00:00:00'),
          grossPay: '1600.00', totalDeductions: '451.36', netPay: '1148.64',
          deductionsBreakdown: {federal_tax:'159.94',state_tax:'0.00',social_security:'99.20',medicare:'23.20',health_insurance:'169.02'},
          earningsBreakdown: {regular_hours:'80',regular_rate:'20.00',regular_pay:'1600.00',overtime_hours:'0',overtime_pay:'0.00'},
          status: 'generated',
        },
      ]).onConflictDoNothing();
      console.log('[DevSeed] Acme pay stubs seeded (3 officer stubs)');
    } catch (err) {
      console.log('[DevSeed] Acme pay stubs skipped:', (err as Error).message.slice(0, 100));
    }

    // ── PHASE 0: Marcus Rodriguez + Downtown Mall Security (ReportBot demo shift) ──
    try {
      const now0 = new Date();
      const today0 = new Date(now0.getFullYear(), now0.getMonth(), now0.getDate());
      const shiftStart0 = new Date(today0); shiftStart0.setHours(8, 0, 0, 0);
      const shiftEnd0   = new Date(today0); shiftEnd0.setHours(20, 0, 0, 0);

      // Converted to Drizzle ORM: ON CONFLICT
      await db.insert(users).values({
        id: 'dev-emp-marcus-r',
        email: 'rodriguez@acme-security.test',
        firstName: 'Marcus',
        lastName: 'Rodriguez',
        passwordHash: '$2b$10$XEUX3wL9wI2VEjEoUdCSw.O8xFVIfhUJAGahknql8PdWYj0DITrSe',
        role: 'user',
        emailVerified: true,
        currentWorkspaceId: DEV_SENTINEL_WORKSPACE,
        createdAt: sql`now()`,
        updatedAt: sql`now()`,
        loginAttempts: 0,
        mfaEnabled: false,
      }).onConflictDoNothing();

      // Converted to Drizzle ORM: ON CONFLICT
      await db.insert(employees).values({
        id: 'dev-acme-emp-marcus',
        userId: 'dev-emp-marcus-r',
        workspaceId: DEV_SENTINEL_WORKSPACE,
        firstName: 'Marcus',
        lastName: 'Rodriguez',
        email: 'rodriguez@acme-security.test',
        hourlyRate: '23.50',
        role: 'Security Officer',
        workspaceRole: 'employee',
        employeeNumber: 'GC-2024-001',
        createdAt: sql`now()`,
        updatedAt: sql`now()`,
      }).onConflictDoNothing();

      // Converted to Drizzle ORM: ON CONFLICT
      await db.insert(clients).values({
        id: 'dev-client-downtown-mall',
        workspaceId: DEV_SENTINEL_WORKSPACE,
        firstName: 'Downtown',
        lastName: 'Mall Security',
        companyName: 'Downtown Mall Security LLC',
        email: 'security@downtown-mall.test',
        phone: '555-900-1001',
        address: '200 S Alamo St',
        city: 'San Antonio',
        state: 'TX',
        postalCode: '78205',
        country: 'US',
        contractRate: '27.00',
        contractRateType: 'hourly',
        pocName: 'Raymond Okonkwo',
        pocPhone: '555-900-1002',
        pocEmail: 'pokonkwo@downtown-mall.test',
        pocTitle: 'Director of Security',
        createdAt: sql`now()`,
        updatedAt: sql`now()`,
      }).onConflictDoNothing();

      // Converted to Drizzle ORM: ON CONFLICT
      await db.insert(shifts).values({
        id: 'dev-shift-marcus-today',
        workspaceId: DEV_SENTINEL_WORKSPACE,
        employeeId: 'dev-acme-emp-marcus',
        clientId: 'dev-client-downtown-mall',
        title: 'Downtown Mall — Day Security',
        category: 'security' as any,
        startTime: shiftStart0,
        endTime: shiftEnd0,
        date: today0.toISOString().split('T')[0],
        status: 'confirmed',
        billableToClient: true,
        createdAt: sql`now()`,
        updatedAt: sql`now()`,
      }).onConflictDoNothing();

      // Converted to Drizzle ORM: ON CONFLICT
      await db.insert(shiftChatrooms).values({
        id: 'dev-chatroom-marcus-today',
        workspaceId: DEV_SENTINEL_WORKSPACE,
        shiftId: 'dev-shift-marcus-today',
        name: 'Downtown Mall — Day Security [08:00-20:00]',
        description: 'Shift chatroom for Marcus Rodriguez — Downtown Mall Security',
        status: 'active',
        isAuditProtected: true,
        isMeetingRoom: false,
        trinityRecordingEnabled: false,
        autoCloseTimeoutMinutes: 60,
        createdAt: sql`now()`,
        updatedAt: sql`now()`,
      }).onConflictDoNothing();

      // Converted to Drizzle ORM: ON CONFLICT
      await db.insert(shiftChatroomMembers).values({
        id: 'dev-cmember-marcus-001',
        chatroomId: 'dev-chatroom-marcus-today',
        userId: 'dev-emp-marcus-r',
        employeeId: 'dev-acme-emp-marcus',
        role: 'member',
        joinedAt: shiftStart0,
        messageCount: 0,
        photoCount: 0,
      }).onConflictDoNothing();

      // Phase 0 messages — realistic full shift message history
      const m8_02  = new Date(today0); m8_02.setHours(8, 2, 0, 0);
      const m8_15  = new Date(today0); m8_15.setHours(8, 15, 0, 0);
      const m8_47  = new Date(today0); m8_47.setHours(8, 47, 0, 0);
      const m9_10  = new Date(today0); m9_10.setHours(9, 10, 0, 0);
      const m10_22 = new Date(today0); m10_22.setHours(10, 22, 0, 0);
      const m10_55 = new Date(today0); m10_55.setHours(10, 55, 0, 0);
      const m11_30 = new Date(today0); m11_30.setHours(11, 30, 0, 0);
      const m11_47 = new Date(today0); m11_47.setHours(11, 47, 0, 0);
      const m12_05 = new Date(today0); m12_05.setHours(12, 5, 0, 0);
      const m12_38 = new Date(today0); m12_38.setHours(12, 38, 0, 0);
      const m13_14 = new Date(today0); m13_14.setHours(13, 14, 0, 0);
      const m13_55 = new Date(today0); m13_55.setHours(13, 55, 0, 0);
      const m14_22 = new Date(today0); m14_22.setHours(14, 22, 0, 0);

      const phase0Messages = [
        // ReportBot welcome (already seeded as system from bot)
        { id: 'dev-msg-m-001', userId: 'reportbot', msgType: 'system', content: `Good morning, Marcus. I'm ReportBot — your shift documentation assistant.\n\nShift details:\nClient: Downtown Mall Security LLC\nYour shift: 08:00 — 20:00\n\nType /incident to log an incident, /report for routine activities, /endshift when done.`, meta: JSON.stringify({botEvent:'reportbot_welcome',isBot:true}), ts: m8_02 },
        // Officer check-in
        { id: 'dev-msg-m-002', userId: 'dev-emp-marcus-r', msgType: 'text', content: 'On post. Doing initial walkthrough of all entrances.', meta: '{}', ts: m8_15 },
        // Loitering note
        { id: 'dev-msg-m-003', userId: 'dev-emp-marcus-r', msgType: 'text', content: 'Two individuals loitering near the north entrance. Asked them to move along, they complied without incident.', meta: '{}', ts: m8_47 },
        // Slip hazard
        { id: 'dev-msg-m-004', userId: 'dev-emp-marcus-r', msgType: 'text', content: '/report Wet floor near food court fountain — no wet floor sign. Notified maintenance at 09:10. Wet floor sign placed.', meta: '{}', ts: m9_10 },
        // Photo documentation
        { id: 'dev-msg-m-005', userId: 'dev-emp-marcus-r', msgType: 'photo', content: 'Wet floor hazard area — food court fountain', meta: JSON.stringify({gps:{lat:29.4241,lng:-98.4936},caption:'Wet floor documentation'}), ts: m10_22 },
        // ReportBot photo ack
        { id: 'dev-msg-m-006', userId: 'reportbot', msgType: 'system', content: 'Photo logged with GPS coordinates (29.4241, -98.4936). Added to DAR photo manifest.', meta: JSON.stringify({botEvent:'photo_ack',isBot:true}), ts: m10_22 },
        // Shoplifting incident keywords — bot responds
        { id: 'dev-msg-m-007', userId: 'dev-emp-marcus-r', msgType: 'text', content: 'Possible theft in progress — store 114 Foot Locker. Heading over.', meta: '{}', ts: m10_55 },
        // Bot keyword response (incident suggested)
        { id: 'dev-msg-m-008', userId: 'reportbot', msgType: 'system', content: 'I noticed this may involve a reportable event. If this requires formal documentation, use /incident to start a structured incident report.\n\nType /incident [brief description] to begin.', meta: JSON.stringify({botEvent:'keyword_incident_suggested',isBot:true}), ts: m10_55 },
        // Officer continues — no arrest, subject fled
        { id: 'dev-msg-m-009', userId: 'dev-emp-marcus-r', msgType: 'text', content: 'Subject had already exited by time I arrived. Foot Locker staff reviewed cameras — juvenile male, early teens, took 1 pair of sneakers. They are filing their own police report. I documented and got the store LP contact (Rosa Herrera, 555-912-3344).', meta: '{}', ts: m11_30 },
        // Food court fight — triggers full incident flow
        { id: 'dev-msg-m-010', userId: 'dev-emp-marcus-r', msgType: 'text', content: '/incident Fight in food court, two adult males', meta: '{}', ts: m11_47 },
        // ReportBot incident Q1
        { id: 'dev-msg-m-011', userId: 'reportbot', msgType: 'system', content: 'INCIDENT DOCUMENTATION\nLet\'s make sure we capture everything. I\'ll ask you 9 questions.\n\nQuestion 1 of 9: What time did the incident occur? (e.g., 14:17)', meta: JSON.stringify({botEvent:'incident_flow_start',isBot:true}), ts: m11_47 },
        // Marcus answer Q1
        { id: 'dev-msg-m-012', userId: 'dev-emp-marcus-r', msgType: 'text', content: '11:41', meta: '{}', ts: m12_05 },
        // [Q2-Q9 flow condensed into a single incident completion message for seed data clarity]
        { id: 'dev-msg-m-013', userId: 'reportbot', msgType: 'system', content: `Incident report complete. Here's what I have:\n\nINCIDENT SUMMARY:\nTime of incident: 11:41\nLocation: Food court, center seating area near Panda Express\nDescription: Two adult males became embroiled in a verbal altercation that escalated to pushing. Officer Rodriguez intervened verbally and the two parties were separated. No further physical contact.\nPersons involved: Subject 1 — Black male, approx 30-35 yrs, red hoodie, jeans. Subject 2 — Hispanic male, approx 25-30 yrs, gray t-shirt, khaki shorts.\nUse of force: No physical force required. Verbal de-escalation only.\nPolice contact: No — incident resolved on scene.\nInjuries: None observed.\nEvidence collected: No CCTV requested. Witnesses: table of 3 near incident (declined to provide names).\nCurrent status: Resolved. Both parties escorted to separate exits.\n\nFiled by: Marcus Rodriguez\nFiled at: ${today0.toLocaleDateString()}\n\nThis incident has been saved and will be included in your shift DAR. Your supervisor has been notified.`, meta: JSON.stringify({botEvent:'incident_report_complete',isBot:true,forceUsed:false,policeInvolved:false}), ts: m13_14 },
        // Officer post-incident
        { id: 'dev-msg-m-014', userId: 'dev-emp-marcus-r', msgType: 'text', content: 'Resumed patrol after incident. All clear in food court.', meta: '{}', ts: m13_55 },
        // Second photo
        { id: 'dev-msg-m-015', userId: 'dev-emp-marcus-r', msgType: 'photo', content: 'Food court incident location — post-incident clear', meta: JSON.stringify({gps:{lat:29.4244,lng:-98.4938},caption:'Post-incident documentation - food court'}), ts: m14_22 },
      ];

      for (const msg of phase0Messages) {
        // Converted to Drizzle ORM: ON CONFLICT
        await db.insert(shiftChatroomMessages).values({
          id: msg.id,
          workspaceId: DEV_SENTINEL_WORKSPACE,
          chatroomId: 'dev-chatroom-marcus-today',
          userId: msg.userId,
          content: msg.content,
          messageType: msg.msgType,
          isAuditProtected: msg.msgType === 'photo' || msg.msgType === 'report',
          metadata: JSON.parse(msg.meta),
          createdAt: msg.ts,
          updatedAt: msg.ts,
        }).onConflictDoNothing();
      }

      console.log('[DevSeed] Phase 0 data seeded: Marcus Rodriguez + Downtown Mall + today\'s shift + 15 messages');
    } catch (phaseErr: any) {
      console.log('[DevSeed] Phase 0 seed skipped:', phaseErr.message?.slice(0, 150));
    }

    console.log('[DevSeed] Development data seeded successfully!');
    console.log('   - Users: 36 test accounts (inc. Marcus Rodriguez)');
    console.log('   - Workspaces: 3 organizations (Acme Security, Lone Star Security, Demo)');
    console.log('   - Employees: 35 across workspaces (29 Acme + 5 Lone Star + Marcus Rodriguez)');
    console.log('     Acme roles: 1 org_owner, 2 managers, 2 department_managers, 2 supervisors, 5 contractors, 17 employees');
    console.log('   - Clients: 12 client accounts (inc. Downtown Mall Security)');
    console.log('   - Shifts: 18 assigned + 20 open (Trinity fill targets) + Phase 0 today shift');
    console.log('   - Invoices: 5 Acme invoices (draft/sent/overdue/paid/partial)');
    console.log('   - Pay Stubs: 3 Acme officer stubs + 2 Marcus stubs');
    console.log('   - AI Credits: Allocated to all workspaces');
    console.log('');
    console.log('   Phase 0 officer: rodriguez@acme-security.test (Marcus Rodriguez, GC-2024-001)');
    console.log('   Test login: owner@acme-security.test');
    console.log('   Demo login: demo@coaileague.test');

    return { success: true, message: 'Development data seeded successfully' };

  } catch (error) {
    console.error('[DevSeed] Failed to seed development data:', error);
    return { success: false, message: `Dev seed failed: ${error}` };
  }
}

/**
 * Phase 0 Seed — Marcus Rodriguez + Downtown Mall + ReportBot demo shift
 *
 * Separate from the main seed so it runs even when the workspace sentinel
 * has already blocked the full seed. Uses its own idempotency check:
 *   "dev-acme-emp-marcus exists → already seeded"
 *
 * All inserts use ON CONFLICT DO NOTHING — safe to call on every restart.
 */
export async function ensurePhase0Seed(): Promise<void> {
  if (isProduction()) return;

  try {
    const DEV_WS = 'dev-acme-security-ws';

    // Idempotency: if Marcus already exists, nothing to do
    // CATEGORY C — Raw SQL retained: LIMIT | Tables: employees | Verified: 2026-03-23
    const existing = await typedQuery(sql`
      SELECT id FROM employees WHERE id = 'dev-acme-emp-marcus' LIMIT 1
    `);
    if (existing.length > 0) {
      console.log('[Phase0Seed] Already seeded — skipping');
      return;
    }

    console.log('[Phase0Seed] Seeding Marcus Rodriguez + Downtown Mall + shift chatroom...');

    const now0       = new Date();
    const today0     = new Date(now0.getFullYear(), now0.getMonth(), now0.getDate());
    const shiftStart = new Date(today0); shiftStart.setHours(8, 0, 0, 0);
    const shiftEnd   = new Date(today0); shiftEnd.setHours(20, 0, 0, 0);

    // ── User ──
    // Converted to Drizzle ORM: ON CONFLICT
    await db.insert(users).values({
      id: 'dev-emp-marcus-r',
      email: 'rodriguez@acme-security.test',
      firstName: 'Marcus',
      lastName: 'Rodriguez',
      passwordHash: '$2b$10$XEUX3wL9wI2VEjEoUdCSw.O8xFVIfhUJAGahknql8PdWYj0DITrSe',
      role: 'user',
      emailVerified: true,
      currentWorkspaceId: DEV_WS,
      createdAt: sql`now()`,
      updatedAt: sql`now()`,
      loginAttempts: 0,
      mfaEnabled: false,
    }).onConflictDoNothing();

    // ── Employee record (GC-2024-001) ──
    // Converted to Drizzle ORM: ON CONFLICT
    await db.insert(employees).values({
      id: 'dev-acme-emp-marcus',
      userId: 'dev-emp-marcus-r',
      workspaceId: DEV_WS,
      firstName: 'Marcus',
      lastName: 'Rodriguez',
      email: 'rodriguez@acme-security.test',
      hourlyRate: '23.50',
      role: 'Security Officer',
      workspaceRole: 'employee',
      employeeNumber: 'GC-2024-001',
      createdAt: sql`now()`,
      updatedAt: sql`now()`,
    }).onConflictDoNothing();

    // ── Client — Downtown Mall Security ──
    // Converted to Drizzle ORM: ON CONFLICT
    await db.insert(clients).values({
      id: 'dev-client-downtown-mall',
      workspaceId: DEV_WS,
      firstName: 'Downtown',
      lastName: 'Mall Security',
      companyName: 'Downtown Mall Security LLC',
      email: 'security@downtown-mall.test',
      phone: '555-900-1001',
      address: '200 S Alamo St',
      city: 'San Antonio',
      state: 'TX',
      postalCode: '78205',
      country: 'US',
      contractRate: '27.00',
      contractRateType: 'hourly',
      pocName: 'Raymond Okonkwo',
      pocPhone: '555-900-1002',
      pocEmail: 'pokonkwo@downtown-mall.test',
      pocTitle: 'Director of Security',
      createdAt: sql`now()`,
      updatedAt: sql`now()`,
    }).onConflictDoNothing();

    // ── Shift — today 08:00-20:00 ──
    // Converted to Drizzle ORM: ON CONFLICT
    await db.insert(shifts).values({
      id: 'dev-shift-marcus-today',
      workspaceId: DEV_WS,
      employeeId: 'dev-acme-emp-marcus',
      clientId: 'dev-client-downtown-mall',
      title: 'Downtown Mall — Day Security',
      category: 'security',
      startTime: new Date(shiftStart.toISOString()),
      endTime: new Date(shiftEnd.toISOString()),
      date: today0.toISOString().split('T')[0],
      status: 'confirmed',
      billableToClient: true,
      createdAt: sql`now()`,
      updatedAt: sql`now()`,
    }).onConflictDoNothing();

    // ── Shift chatroom ──
    // Converted to Drizzle ORM: ON CONFLICT
    await db.insert(shiftChatrooms).values({
      id: 'dev-chatroom-marcus-today',
      workspaceId: DEV_WS,
      shiftId: 'dev-shift-marcus-today',
      name: 'Downtown Mall — Day Security [08:00-20:00]',
      description: 'Shift chatroom for Marcus Rodriguez — Downtown Mall Security',
      status: 'active',
      isAuditProtected: true,
      isMeetingRoom: false,
      trinityRecordingEnabled: false,
      autoCloseTimeoutMinutes: 60,
      createdAt: sql`now()`,
      updatedAt: sql`now()`,
    }).onConflictDoNothing();

    // ── Chatroom member ──
    // Converted to Drizzle ORM: ON CONFLICT
    await db.insert(shiftChatroomMembers).values({
      id: 'dev-cmember-marcus-001',
      workspaceId: DEV_WS,
      chatroomId: 'dev-chatroom-marcus-today',
      userId: 'dev-emp-marcus-r',
      employeeId: 'dev-acme-emp-marcus',
      role: 'member',
      joinedAt: new Date(shiftStart.toISOString()),
      messageCount: 0,
      photoCount: 0,
    }).onConflictDoNothing();

    // ── Workspace member entry for Marcus (guard against duplicates with subquery) ──
    // Converted to Drizzle ORM: NOT EXISTS
    await (db.insert(workspaceMembers).values({
      workspaceId: DEV_WS,
      userId: 'dev-emp-marcus-r',
      role: 'employee',
      createdAt: new Date(),
    }) as any).where(notExists(
      db.select()
        .from(workspaceMembers)
        .where(and(
          eq(workspaceMembers.workspaceId, DEV_WS),
          eq(workspaceMembers.userId, 'dev-emp-marcus-r')
        ))
    )).onConflictDoNothing();

    // ── Phase 0 messages — full realistic shift history ──
    const ts = (h: number, m: number) => { const d = new Date(today0); d.setHours(h, m, 0, 0); return d.toISOString(); };

    const messages = [
      { id: 'dev-msg-m-001', userId: 'reportbot', type: 'system',
        content: `Good morning, Marcus. I'm ReportBot — your shift documentation assistant.\n\nShift details:\nClient: Downtown Mall Security LLC\nYour shift: 08:00 — 20:00\n\nType /incident to log an incident, /report for routine activities, /endshift when done.`,
        meta: JSON.stringify({ botEvent: 'reportbot_welcome', isBot: true }), ts: ts(8, 2) },
      { id: 'dev-msg-m-002', userId: 'dev-emp-marcus-r', type: 'text',
        content: 'On post. Doing initial walkthrough of all entrances.', meta: '{}', ts: ts(8, 15) },
      { id: 'dev-msg-m-003', userId: 'dev-emp-marcus-r', type: 'text',
        content: 'Two individuals loitering near the north entrance. Asked them to move along, they complied without incident.', meta: '{}', ts: ts(8, 47) },
      { id: 'dev-msg-m-004', userId: 'dev-emp-marcus-r', type: 'text',
        content: '/report Wet floor near food court fountain — no wet floor sign. Notified maintenance at 09:10. Wet floor sign placed.', meta: '{}', ts: ts(9, 10) },
      { id: 'dev-msg-m-005', userId: 'dev-emp-marcus-r', type: 'photo',
        content: 'Wet floor hazard area — food court fountain',
        meta: JSON.stringify({ gps: { lat: 29.4241, lng: -98.4936 }, caption: 'Wet floor documentation' }), ts: ts(10, 22) },
      { id: 'dev-msg-m-006', userId: 'reportbot', type: 'system',
        content: 'Photo logged with GPS coordinates (29.4241, -98.4936). Added to DAR photo manifest.',
        meta: JSON.stringify({ botEvent: 'photo_ack', isBot: true }), ts: ts(10, 22) },
      { id: 'dev-msg-m-007', userId: 'dev-emp-marcus-r', type: 'text',
        content: 'Possible theft in progress — store 114 Foot Locker. Heading over.', meta: '{}', ts: ts(10, 55) },
      { id: 'dev-msg-m-008', userId: 'reportbot', type: 'system',
        content: 'I noticed this may involve a reportable event. If this requires formal documentation, use /incident to start a structured incident report.\n\nType /incident [brief description] to begin.',
        meta: JSON.stringify({ botEvent: 'keyword_incident_suggested', isBot: true }), ts: ts(10, 55) },
      { id: 'dev-msg-m-009', userId: 'dev-emp-marcus-r', type: 'text',
        content: 'Subject had already exited by time I arrived. Foot Locker staff reviewed cameras — juvenile male, early teens, took 1 pair of sneakers. They are filing their own police report. I documented and got the store LP contact (Rosa Herrera, 555-912-3344).', meta: '{}', ts: ts(11, 30) },
      { id: 'dev-msg-m-010', userId: 'dev-emp-marcus-r', type: 'text',
        content: '/incident Fight in food court, two adult males', meta: '{}', ts: ts(11, 47) },
      { id: 'dev-msg-m-011', userId: 'reportbot', type: 'system',
        content: "INCIDENT DOCUMENTATION\nLet's make sure we capture everything. I'll ask you 9 questions.\n\nQuestion 1 of 9: What time did the incident occur? (e.g., 14:17)",
        meta: JSON.stringify({ botEvent: 'incident_flow_start', isBot: true }), ts: ts(11, 47) },
      { id: 'dev-msg-m-012', userId: 'dev-emp-marcus-r', type: 'text',
        content: '11:41', meta: '{}', ts: ts(12, 5) },
      { id: 'dev-msg-m-013', userId: 'reportbot', type: 'system',
        content: `Incident report complete. Here's what I have:\n\nINCIDENT SUMMARY:\nTime of incident: 11:41\nLocation: Food court, center seating area near Panda Express\nDescription: Two adult males became embroiled in a verbal altercation that escalated to pushing. Officer Rodriguez intervened verbally and the two parties were separated. No further physical contact.\nPersons involved: Subject 1 — Black male, approx 30-35 yrs, red hoodie, jeans. Subject 2 — Hispanic male, approx 25-30 yrs, gray t-shirt, khaki shorts.\nUse of force: No physical force required. Verbal de-escalation only.\nPolice contact: No — incident resolved on scene.\nInjuries: None observed.\nEvidence collected: No CCTV requested. Witnesses: table of 3 near incident (declined to provide names).\nCurrent status: Resolved. Both parties escorted to separate exits.\n\nFiled by: Marcus Rodriguez\nFiled at: ${today0.toLocaleDateString()}\n\nThis incident has been saved and will be included in your shift DAR. Your supervisor has been notified.`,
        meta: JSON.stringify({ botEvent: 'incident_report_complete', isBot: true, forceUsed: false, policeInvolved: false }), ts: ts(13, 14) },
      { id: 'dev-msg-m-014', userId: 'dev-emp-marcus-r', type: 'text',
        content: 'Resumed patrol after incident. All clear in food court.', meta: '{}', ts: ts(13, 55) },
      { id: 'dev-msg-m-015', userId: 'dev-emp-marcus-r', type: 'photo',
        content: 'Food court incident location — post-incident clear',
        meta: JSON.stringify({ gps: { lat: 29.4244, lng: -98.4938 }, caption: 'Post-incident documentation - food court' }), ts: ts(14, 22) },
    ];

    for (const msg of messages) {
      // Converted to Drizzle ORM: ON CONFLICT
      await db.insert(shiftChatroomMessages).values({
        id: msg.id,
        workspaceId: DEV_WS,
        chatroomId: 'dev-chatroom-marcus-today',
        userId: msg.userId,
        content: msg.content,
        messageType: msg.type,
        isAuditProtected: msg.type === 'photo' || msg.type === 'report',
        metadata: JSON.parse(msg.meta),
        createdAt: new Date(msg.ts),
        updatedAt: new Date(msg.ts),
      }).onConflictDoNothing();
    }

    console.log('[Phase0Seed] Done — Marcus Rodriguez + Downtown Mall + chatroom + 15 messages seeded');
  } catch (err: any) {
    console.error('[Phase0Seed] Error:', (err instanceof Error ? err.message : String(err))?.slice(0, 200));
  }
}

/**
 * ensurePhase0ExtendedSeed()
 *
 * Adds three historical shift chatroom variants for Marcus Rodriguez
 * so every Phase 0 test scenario is covered:
 *   1. Routine shift  (dev-chatroom-marcus-routine)   — patrol only, no incidents, DAR completed
 *   2. Photo-only     (dev-chatroom-marcus-photo)     — just photo evidence, no text incidents
 *   3. Abandoned      (dev-chatroom-marcus-abandoned)  — officer went dark mid-shift, shift never closed
 *
 * Sentinel: dev-chatroom-marcus-routine
 * All inserts use ON CONFLICT DO NOTHING — safe to call on every restart.
 */
export async function ensurePhase0ExtendedSeed(): Promise<void> {
  if (isProduction()) return;

  try {
    const DEV_WS = 'dev-acme-security-ws';

    // Idempotency: if the routine chatroom already exists, nothing to do
    // Converted to Drizzle ORM: LIMIT
    const existing = await db.select({ id: shiftChatrooms.id })
      .from(shiftChatrooms)
      .where(eq(shiftChatrooms.id, 'dev-chatroom-marcus-routine'))
      .limit(1);

    if (existing && existing.length > 0) {
      console.log('[Phase0ExtSeed] Already seeded — skipping');
      return;
    }

    console.log('[Phase0ExtSeed] Seeding routine / photo-only / abandoned shift variants...');

    const now = new Date();

    // Date helpers
    const dayAt = (offset: number, h: number, m: number) => {
      const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() + offset);
      d.setHours(h, m, 0, 0);
      return d.toISOString();
    };

    // ── 1. ROUTINE SHIFT (yesterday, 08:00-20:00, fully completed) ──────────
    // Converted to Drizzle ORM: ON CONFLICT
    await db.insert(shifts).values({
      id: 'dev-shift-marcus-routine',
      workspaceId: DEV_WS,
      employeeId: 'dev-acme-emp-marcus',
      clientId: 'dev-client-downtown-mall',
      title: 'Downtown Mall — Day Security [08:00-20:00]',
      startTime: new Date(dayAt(-1, 8, 0)),
      endTime: new Date(dayAt(-1, 20, 0)),
      status: 'completed',
      createdAt: new Date(dayAt(-1, 7, 55)),
      updatedAt: new Date(dayAt(-1, 20, 5)),
    }).onConflictDoNothing();

    // Converted to Drizzle ORM: ON CONFLICT
    await db.insert(shiftChatrooms).values({
      id: 'dev-chatroom-marcus-routine',
      workspaceId: DEV_WS,
      shiftId: 'dev-shift-marcus-routine',
      name: 'Downtown Mall — Day Security [08:00-20:00]',
      description: 'Shift chatroom for Marcus Rodriguez — Downtown Mall Security (routine)',
      status: 'closed',
      isAuditProtected: true,
      isMeetingRoom: false,
      trinityRecordingEnabled: false,
      autoCloseTimeoutMinutes: 60,
      createdAt: new Date(dayAt(-1, 7, 58)),
      updatedAt: new Date(dayAt(-1, 20, 5)),
    }).onConflictDoNothing();

    // Converted to Drizzle ORM: ON CONFLICT
    await db.insert(shiftChatroomMembers).values({
      id: 'dev-cmember-routine-001',
      workspaceId: DEV_WS,
      chatroomId: 'dev-chatroom-marcus-routine',
      userId: 'dev-emp-marcus-r',
      employeeId: 'dev-acme-emp-marcus',
      role: 'member',
      joinedAt: new Date(dayAt(-1, 7, 58)),
      messageCount: 8,
      photoCount: 1,
      createdAt: new Date(dayAt(-1, 7, 58)),
      updatedAt: new Date(dayAt(-1, 20, 5)),
    }).onConflictDoNothing();

    const routineMsgs = [
      { id: 'dev-msg-r-001', userId: 'reportbot', type: 'system',
        content: `Good morning, Marcus. I'm ReportBot — your shift documentation assistant.\n\nShift details:\nClient: Downtown Mall Security LLC\nYour shift: 08:00 — 20:00\n\nType /incident to log an incident, /report for routine activities, /endshift when done.`,
        ts: dayAt(-1, 8, 2), meta: JSON.stringify({ botEvent: 'reportbot_welcome', isBot: true }) },
      { id: 'dev-msg-r-002', userId: 'dev-emp-marcus-r', type: 'text',
        content: 'On post. All clear on arrival — normal morning crowd.',
        ts: dayAt(-1, 8, 10), meta: '{}' },
      { id: 'dev-msg-r-003', userId: 'dev-emp-marcus-r', type: 'text',
        content: 'Completed perimeter walk. All exterior doors secured. Parking garage level 1 and 2 clear.',
        ts: dayAt(-1, 9, 30), meta: '{}' },
      { id: 'dev-msg-r-004', userId: 'dev-emp-marcus-r', type: 'text',
        content: '/report Routine inspection — all exits secure, no hazards found.',
        ts: dayAt(-1, 11, 0), meta: '{}' },
      { id: 'dev-msg-r-005', userId: 'reportbot', type: 'system',
        content: 'Routine activity logged and added to your DAR.',
        ts: dayAt(-1, 11, 0), meta: JSON.stringify({ botEvent: 'routine_activity_logged', isBot: true }) },
      { id: 'dev-msg-r-006', userId: 'dev-emp-marcus-r', type: 'text',
        content: 'Lunch hour — increased foot traffic in food court. All normal.',
        ts: dayAt(-1, 12, 15), meta: '{}' },
      { id: 'dev-msg-r-007', userId: 'dev-emp-marcus-r', type: 'text',
        content: 'Assisted lost child — reunited with parent at Guest Services within 4 minutes. No incident report required.',
        ts: dayAt(-1, 14, 33), meta: '{}' },
      { id: 'dev-msg-r-008', userId: 'dev-emp-marcus-r', type: 'text',
        content: '/report PM inspection complete — food court, restrooms, all anchor store entrances clear.',
        ts: dayAt(-1, 17, 0), meta: '{}' },
      { id: 'dev-msg-r-009', userId: 'dev-emp-marcus-r', type: 'text',
        content: 'End of shift patrol done. No incidents during shift. Ready to hand off to night crew.',
        ts: dayAt(-1, 19, 45), meta: '{}' },
      { id: 'dev-msg-r-010', userId: 'dev-emp-marcus-r', type: 'text',
        content: '/endshift',
        ts: dayAt(-1, 19, 58), meta: '{}' },
      { id: 'dev-msg-r-011', userId: 'reportbot', type: 'system',
        content: 'Shift documentation complete. Daily Activity Report compiled and submitted for supervisor review.',
        ts: dayAt(-1, 19, 59), meta: JSON.stringify({ botEvent: 'dar_compiled', isBot: true }) },
    ];

    for (const msg of routineMsgs) {
      // Converted to Drizzle ORM: ON CONFLICT
      await db.insert(shiftChatroomMessages).values({
        id: msg.id,
        workspaceId: DEV_WS,
        chatroomId: 'dev-chatroom-marcus-routine',
        userId: msg.userId,
        content: msg.content,
        messageType: msg.type,
        isAuditProtected: msg.type === 'photo' || msg.type === 'report',
        metadata: JSON.parse(msg.meta),
        createdAt: new Date(msg.ts),
        updatedAt: new Date(msg.ts),
      }).onConflictDoNothing();
    }

    // Insert DAR for routine shift
    // Converted to Drizzle ORM: ON CONFLICT
    await db.insert(darReports).values({
      id: 'dev-dar-marcus-routine',
      workspaceId: DEV_WS,
      shiftId: 'dev-shift-marcus-routine',
      chatroomId: 'dev-chatroom-marcus-routine',
      clientId: 'dev-client-downtown-mall',
      employeeId: 'dev-acme-emp-marcus',
      employeeName: 'Marcus Rodriguez',
      shiftStartTime: new Date(dayAt(-1, 8, 0)),
      shiftEndTime: new Date(dayAt(-1, 20, 0)),
      actualClockIn: new Date(dayAt(-1, 7, 58)),
      actualClockOut: new Date(dayAt(-1, 20, 3)),
      title: 'Daily Activity Report — Downtown Mall Security LLC',
      summary: 'Uneventful shift with no reportable incidents. Standard patrol schedule maintained throughout. Officer Rodriguez assisted one lost child who was reunited with parent at Guest Services.',
      content: 'DAILY ACTIVITY REPORT\n\nOfficer: Marcus Rodriguez (GC-2024-001)\nDate: Yesterday\nClient: Downtown Mall Security LLC\nShift: 08:00 — 20:00\nClock In: 07:58 | Clock Out: 20:03\n\nSHIFT SUMMARY:\nNo incidents reported during this shift. Standard patrol rotations completed on schedule. All entrances, exits, and common areas were inspected and found secure throughout the tour of duty.\n\nROUTINE ACTIVITIES:\n08:10 — On post, morning walkthrough completed, all clear.\n09:30 — Perimeter walk completed. All exterior doors secured. Parking garage levels 1 and 2 clear.\n11:00 — Routine inspection: all exits secure, no hazards found.\n12:15 — Lunch hour foot traffic increase in food court. All normal.\n14:33 — Assisted lost child at food court. Reunited with parent at Guest Services in under 4 minutes. No incident report required.\n17:00 — PM inspection: food court, restrooms, all anchor store entrances clear.\n19:45 — End-of-shift patrol completed. All clear.\n\nINCIDENTS: None.\nUSE OF FORCE: None.\nPOLICE CONTACT: None.\n\nSubmitted by: Marcus Rodriguez\nBadge: GC-2024-001',
      status: 'approved',
      photoCount: 1,
      messageCount: 11,
      pageCount: 2,
      trinityArticulated: true,
      createdAt: new Date(dayAt(-1, 20, 0)),
      updatedAt: new Date(dayAt(-1, 20, 5)),
    }).onConflictDoNothing();

    // ── 2. PHOTO-ONLY SHIFT (2 days ago, 14:00-22:00, completed) ────────────
    // Converted to Drizzle ORM: ON CONFLICT
    await db.insert(shifts).values({
      id: 'dev-shift-marcus-photo',
      workspaceId: DEV_WS,
      employeeId: 'dev-acme-emp-marcus',
      clientId: 'dev-client-downtown-mall',
      title: 'Downtown Mall — PM Security [14:00-22:00]',
      startTime: new Date(dayAt(-2, 14, 0)),
      endTime: new Date(dayAt(-2, 22, 0)),
      status: 'completed',
      createdAt: new Date(dayAt(-2, 13, 55)),
      updatedAt: new Date(dayAt(-2, 22, 8)),
    }).onConflictDoNothing();

    // Converted to Drizzle ORM: ON CONFLICT
    await db.insert(shiftChatrooms).values({
      id: 'dev-chatroom-marcus-photo',
      workspaceId: DEV_WS,
      shiftId: 'dev-shift-marcus-photo',
      name: 'Downtown Mall — PM Security [14:00-22:00]',
      description: 'Shift chatroom for Marcus Rodriguez — Downtown Mall Security (photo documentation)',
      status: 'closed',
      isAuditProtected: true,
      isMeetingRoom: false,
      trinityRecordingEnabled: false,
      autoCloseTimeoutMinutes: 60,
      createdAt: new Date(dayAt(-2, 13, 57)),
      updatedAt: new Date(dayAt(-2, 22, 8)),
    }).onConflictDoNothing();

    // Converted to Drizzle ORM: ON CONFLICT
    await db.insert(shiftChatroomMembers).values({
      id: 'dev-cmember-photo-001',
      workspaceId: DEV_WS,
      chatroomId: 'dev-chatroom-marcus-photo',
      userId: 'dev-emp-marcus-r',
      employeeId: 'dev-acme-emp-marcus',
      role: 'member',
      joinedAt: new Date(dayAt(-2, 13, 57)),
      messageCount: 7,
      photoCount: 4,
      createdAt: new Date(dayAt(-2, 13, 57)),
      updatedAt: new Date(dayAt(-2, 22, 8)),
    }).onConflictDoNothing();

    const photoMsgs = [
      { id: 'dev-msg-p-001', userId: 'reportbot', type: 'system',
        content: `Good afternoon, Marcus. I'm ReportBot — your shift documentation assistant.\n\nShift details:\nClient: Downtown Mall Security LLC\nYour shift: 14:00 — 22:00\n\nType /incident to log an incident, /report for routine activities, /endshift when done.`,
        ts: dayAt(-2, 14, 1), meta: JSON.stringify({ botEvent: 'reportbot_welcome', isBot: true }) },
      { id: 'dev-msg-p-002', userId: 'dev-emp-marcus-r', type: 'text',
        content: 'On post. Starting PM inspection.',
        ts: dayAt(-2, 14, 5), meta: '{}' },
      { id: 'dev-msg-p-003', userId: 'dev-emp-marcus-r', type: 'photo',
        content: 'Blocked fire exit — east service corridor. Pallet jack left against door.',
        ts: dayAt(-2, 14, 22),
        meta: JSON.stringify({ gps: { lat: 29.4240, lng: -98.4935 }, caption: 'Fire exit obstruction — east corridor' }) },
      { id: 'dev-msg-p-004', userId: 'reportbot', type: 'system',
        content: 'Photo logged with GPS coordinates (29.4240, -98.4935). Added to DAR photo manifest.',
        ts: dayAt(-2, 14, 22), meta: JSON.stringify({ botEvent: 'photo_ack', isBot: true }) },
      { id: 'dev-msg-p-005', userId: 'dev-emp-marcus-r', type: 'photo',
        content: 'Graffiti on parking deck pillar P-14 — new tagging since yesterday.',
        ts: dayAt(-2, 15, 44),
        meta: JSON.stringify({ gps: { lat: 29.4238, lng: -98.4932 }, caption: 'Graffiti damage — parking deck P-14' }) },
      { id: 'dev-msg-p-006', userId: 'reportbot', type: 'system',
        content: 'Photo logged with GPS coordinates (29.4238, -98.4932). Added to DAR photo manifest.',
        ts: dayAt(-2, 15, 44), meta: JSON.stringify({ botEvent: 'photo_ack', isBot: true }) },
      { id: 'dev-msg-p-007', userId: 'dev-emp-marcus-r', type: 'photo',
        content: 'Broken storefront glass — Suite 218 (vacant). Notified mall management.',
        ts: dayAt(-2, 17, 10),
        meta: JSON.stringify({ gps: { lat: 29.4242, lng: -98.4937 }, caption: 'Broken glass — vacant suite 218' }) },
      { id: 'dev-msg-p-008', userId: 'reportbot', type: 'system',
        content: 'Photo logged with GPS coordinates (29.4242, -98.4937). Added to DAR photo manifest.',
        ts: dayAt(-2, 17, 10), meta: JSON.stringify({ botEvent: 'photo_ack', isBot: true }) },
      { id: 'dev-msg-p-009', userId: 'dev-emp-marcus-r', type: 'photo',
        content: 'Closing sweep complete — food court and all east wing stores clear.',
        ts: dayAt(-2, 21, 50),
        meta: JSON.stringify({ gps: { lat: 29.4241, lng: -98.4936 }, caption: 'Closing sweep documentation' }) },
      { id: 'dev-msg-p-010', userId: 'dev-emp-marcus-r', type: 'text',
        content: '/endshift',
        ts: dayAt(-2, 22, 2), meta: '{}' },
      { id: 'dev-msg-p-011', userId: 'reportbot', type: 'system',
        content: 'Shift documentation complete. Daily Activity Report compiled with 4 photo evidence items and submitted for supervisor review.',
        ts: dayAt(-2, 22, 3), meta: JSON.stringify({ botEvent: 'dar_compiled', isBot: true }) },
    ];

    for (const msg of photoMsgs) {
      // Converted to Drizzle ORM: ON CONFLICT
      await db.insert(shiftChatroomMessages).values({
        id: msg.id,
        workspaceId: DEV_WS,
        chatroomId: 'dev-chatroom-marcus-photo',
        userId: msg.userId,
        content: msg.content,
        messageType: msg.type,
        isAuditProtected: msg.type === 'photo' || msg.type === 'report',
        metadata: JSON.parse(msg.meta),
        createdAt: new Date(msg.ts),
        updatedAt: new Date(msg.ts),
      }).onConflictDoNothing();
    }

    // Insert DAR for photo shift
    // Converted to Drizzle ORM: ON CONFLICT
    await db.insert(darReports).values({
      id: 'dev-dar-marcus-photo',
      workspaceId: DEV_WS,
      shiftId: 'dev-shift-marcus-photo',
      chatroomId: 'dev-chatroom-marcus-photo',
      clientId: 'dev-client-downtown-mall',
      employeeId: 'dev-acme-emp-marcus',
      employeeName: 'Marcus Rodriguez',
      shiftStartTime: new Date(dayAt(-2, 14, 0)),
      shiftEndTime: new Date(dayAt(-2, 22, 0)),
      actualClockIn: new Date(dayAt(-2, 13, 57)),
      actualClockOut: new Date(dayAt(-2, 22, 6)),
      title: 'Daily Activity Report — Downtown Mall Security LLC',
      summary: 'Shift included four documented property conditions requiring management attention: one fire exit obstruction (pallet jack blocking east service corridor door), fresh graffiti on parking deck pillar P-14, broken storefront glass at vacant Suite 218, and closing sweep confirmation. No incidents or use of force.',
      content: 'DAILY ACTIVITY REPORT\n\nOfficer: Marcus Rodriguez (GC-2024-001)\nDate: 2 Days Ago\nClient: Downtown Mall Security LLC\nShift: 14:00 — 22:00\nClock In: 13:57 | Clock Out: 22:06\n\nSHIFT SUMMARY:\nNo incidents during this shift. Officer Rodriguez conducted thorough property inspection and documented four conditions requiring management attention. All findings were photographed with GPS coordinates.\n\nDOCUMENTED CONDITIONS:\n14:22 — Fire exit obstruction: Pallet jack left blocking east service corridor emergency exit door. Photo logged. Notified mall operations. [GPS: 29.4240, -98.4935]\n15:44 — Property damage (graffiti): New tagging found on parking deck pillar P-14, not present during previous patrol. Photo logged. [GPS: 29.4238, -98.4932]\n17:10 — Property damage (broken glass): Storefront glass cracked at vacant Suite 218. Notified mall management. Photo logged. [GPS: 29.4242, -98.4937]\n21:50 — Closing sweep: Food court and east wing confirmed clear. Documented. [GPS: 29.4241, -98.4936]\n\nPHOTO EVIDENCE: 4 items with GPS metadata\nINCIDENTS: None.\nUSE OF FORCE: None.\nPOLICE CONTACT: None.\n\nSubmitted by: Marcus Rodriguez\nBadge: GC-2024-001',
      status: 'pending_review',
      photoCount: 4,
      messageCount: 11,
      pageCount: 3,
      photoManifest: [{"caption":"Fire exit obstruction — east corridor","gps":{"lat":29.4240,"lng":-98.4935}},{"caption":"Graffiti damage — parking deck P-14","gps":{"lat":29.4238,"lng":-98.4932}},{"caption":"Broken glass — vacant suite 218","gps":{"lat":29.4242,"lng":-98.4937}},{"caption":"Closing sweep documentation","gps":{"lat":29.4241,"lng":-98.4936}}],
      flaggedForReview: false,
      trinityArticulated: true,
      createdAt: new Date(dayAt(-2, 22, 5)),
      updatedAt: new Date(dayAt(-2, 22, 8)),
    }).onConflictDoNothing();

    // ── 3. ABANDONED SHIFT (3 days ago, 08:00-20:00, officer went silent) ───
    // Converted to Drizzle ORM: ON CONFLICT
    await db.insert(shifts).values({
      id: 'dev-shift-marcus-abandoned',
      workspaceId: DEV_WS,
      employeeId: 'dev-acme-emp-marcus',
      clientId: 'dev-client-downtown-mall',
      title: 'Downtown Mall — Day Security [08:00-20:00]',
      startTime: new Date(dayAt(-3, 8, 0)),
      endTime: new Date(dayAt(-3, 20, 0)),
      status: 'in_progress',
      createdAt: new Date(dayAt(-3, 7, 55)),
      updatedAt: new Date(dayAt(-3, 10, 12)),
    }).onConflictDoNothing();

    // Converted to Drizzle ORM: ON CONFLICT
    await db.insert(shiftChatrooms).values({
      id: 'dev-chatroom-marcus-abandoned',
      workspaceId: DEV_WS,
      shiftId: 'dev-shift-marcus-abandoned',
      name: 'Downtown Mall — Day Security [08:00-20:00]',
      description: 'Shift chatroom for Marcus Rodriguez — Downtown Mall Security (abandoned, officer went silent)',
      status: 'active',
      isAuditProtected: true,
      isMeetingRoom: false,
      trinityRecordingEnabled: false,
      autoCloseTimeoutMinutes: 60,
      createdAt: new Date(dayAt(-3, 8, 3)),
      updatedAt: new Date(dayAt(-3, 10, 12)),
    }).onConflictDoNothing();

    // Converted to Drizzle ORM: ON CONFLICT
    await db.insert(shiftChatroomMembers).values({
      id: 'dev-cmember-abandoned-001',
      workspaceId: DEV_WS,
      chatroomId: 'dev-chatroom-marcus-abandoned',
      userId: 'dev-emp-marcus-r',
      employeeId: 'dev-acme-emp-marcus',
      role: 'member',
      joinedAt: new Date(dayAt(-3, 8, 3)),
      messageCount: 4,
      photoCount: 0,
      createdAt: new Date(dayAt(-3, 8, 3)),
      updatedAt: new Date(dayAt(-3, 10, 12)),
    }).onConflictDoNothing();

    const abandonedMsgs = [
      { id: 'dev-msg-a-001', userId: 'reportbot', type: 'system',
        content: `Good morning, Marcus. I'm ReportBot — your shift documentation assistant.\n\nShift details:\nClient: Downtown Mall Security LLC\nYour shift: 08:00 — 20:00\n\nType /incident to log an incident, /report for routine activities, /endshift when done.`,
        ts: dayAt(-3, 8, 4), meta: JSON.stringify({ botEvent: 'reportbot_welcome', isBot: true }) },
      { id: 'dev-msg-a-002', userId: 'dev-emp-marcus-r', type: 'text',
        content: 'On post. Starting walkthrough.',
        ts: dayAt(-3, 8, 15), meta: '{}' },
      { id: 'dev-msg-a-003', userId: 'dev-emp-marcus-r', type: 'text',
        content: 'Suspicious vehicle in lot B — older model silver sedan, no plates, engine running. Going to check.',
        ts: dayAt(-3, 10, 8), meta: '{}' },
      { id: 'dev-msg-a-004', userId: 'reportbot', type: 'system',
        content: 'I noticed this may involve a reportable event. If this requires formal documentation, use /incident to start a structured incident report.\n\nType /incident [brief description] to begin.',
        ts: dayAt(-3, 10, 8), meta: JSON.stringify({ botEvent: 'keyword_incident_suggested', isBot: true }) },
    ];

    for (const msg of abandonedMsgs) {
      // Converted to Drizzle ORM: ON CONFLICT
      await db.insert(shiftChatroomMessages).values({
        id: msg.id,
        workspaceId: DEV_WS,
        chatroomId: 'dev-chatroom-marcus-abandoned',
        userId: msg.userId,
        content: msg.content,
        messageType: msg.type,
        isAuditProtected: msg.type === 'photo' || msg.type === 'report',
        metadata: JSON.parse(msg.meta),
        createdAt: new Date(msg.ts),
        updatedAt: new Date(msg.ts),
      }).onConflictDoNothing();
    }

    console.log('[Phase0ExtSeed] Done — routine + photo-only + abandoned shift variants seeded');
  } catch (err: any) {
    console.error('[Phase0ExtSeed] Error:', (err instanceof Error ? err.message : String(err))?.slice(0, 200));
  }
}
