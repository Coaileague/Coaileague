/**
 * Production Database Seeding Service
 * 
 * Automatically migrates essential data from development to production
 * on first deployment. Uses idempotent INSERT ... ON CONFLICT DO NOTHING
 * to safely handle re-runs.
 * 
 * Trigger: Runs on server startup when REPLIT_DEPLOYMENT=1 (production)
 * Guard: Checks for sentinel user (root@getdc360.com) to avoid duplicate runs
 */

import { db } from "../db";
import { users, platformRoles, workspaces, employees } from "@shared/schema";
import { eq, sql } from "drizzle-orm";

const SENTINEL_USER_ID = 'root-user-00000000';
const SENTINEL_EMAIL = 'root@getdc360.com';

/**
 * One-time password migrations - runs EVERY startup (dev and prod)
 * Use this for urgent password updates that need to apply to existing users
 * EXPORTED so it can be called independently in server/index.ts
 */
export async function runPasswordMigrations(): Promise<void> {
  console.log('🔑 Password Migration Service: Starting...');
  
  // ONE-TIME emergency password reset - REMOVE AFTER SUCCESSFUL LOGIN
  const migrations: Array<{ email: string; newHash: string; note: string }> = [
    { 
      email: 'txpsinvestigations@gmail.com', 
      newHash: '$2b$10$Ys8kclEUPliSbv0HQVU5veqYeHxmu6Bd43/IIGNLO.dUp3VMvj/HC',
      note: 'ONE-TIME RESET: Password = SPS@2026!'
    },
  ];
  
  if (migrations.length === 0) {
    console.log('🔑 Password Migration: No pending migrations');
    console.log('🔑 Password Migration Service: Complete');
    return;
  }
  
  for (const migration of migrations) {
    try {
      const result = await db.execute(sql`
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

export async function runProductionSeed(): Promise<{ success: boolean; message: string }> {
  const isProduction = process.env.REPLIT_DEPLOYMENT === '1';
  
  console.log(`🌱 Production Seed: Environment check - REPLIT_DEPLOYMENT=${process.env.REPLIT_DEPLOYMENT}`);
  
  if (!isProduction) {
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
        { id: 'GTa1Ag', email: 'Root@getdc360.com', firstName: 'Root', lastName: 'User', passwordHash: '$2b$12$x1ClcnPDnA8IFvYG9z7clu7xBlMXy3kokTEKRfGJxMapCQpuBU9wu', role: 'user', emailVerified: true },
        { id: 'ai-bot', email: 'ai-bot@workforceos.com', firstName: 'AI', lastName: 'Assistant', passwordHash: 'no-password-bot-account', role: 'user', emailVerified: false },
        { id: 'helpos-ai-bot', email: 'helpos@workforceos.com', firstName: 'HelpOS', lastName: 'AI Bot', passwordHash: null, role: 'user', emailVerified: true },
        { id: 'root-admin-workfos', email: 'root@workf-os.com', firstName: 'Brigido', lastName: 'Guillen', passwordHash: '$2b$10$XEUX3wL9wI2VEjEoUdCSw.O8xFVIfhUJAGahknql8PdWYj0DITrSe', role: 'user', emailVerified: true, currentWorkspaceId: 'ops-workspace-00000000' },
        { id: '48003611', email: 'txpsinvestigations@gmail.com', firstName: 'Brigido', lastName: 'Guillen', passwordHash: '$2b$10$Ys8kclEUPliSbv0HQVU5veqYeHxmu6Bd43/IIGNLO.dUp3VMvj/HC', role: 'user', emailVerified: false, currentWorkspaceId: '37a04d24-51bd-4856-9faa-d26a2fe82094' },
        { id: 'root-user-00000000', email: 'root@getdc360.com', firstName: 'Brigido', lastName: 'Guillen', passwordHash: '$2b$10$wN0UMmTiGuG0wEi/04xywOqwnLUILRxQmFTjuTfgovPv1kBS.T3ei', role: 'admin', emailVerified: false, currentWorkspaceId: 'ops-workspace-00000000' },
        { id: 'demo-user-00000000', email: 'demo@shiftsync.app', firstName: 'Demo', lastName: 'User', passwordHash: null, role: 'support_staff', emailVerified: false, currentWorkspaceId: 'demo-workspace-00000000' },
        { id: 'helpai-bot', email: 'helpai@coaileague.ai', firstName: 'HelpAI', lastName: 'Bot', passwordHash: null, role: 'user', emailVerified: false },
        { id: 'f356ebda-c5da-4f43-ba93-38d5725bac26', email: 'test@workforceos.demo', firstName: 'Test', lastName: 'Organization', passwordHash: '$2a$10$8Z5yZJ4bQ8pX9X9X9X9X9OqG7.yZJ4bQ8pX9X9X9X9X9OqG7.yZJ4b', role: 'user', emailVerified: true },
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
        { id: 'b495135c-14bf-4579-8c04-23fd38994696', userId: 'root-admin-workfos', role: 'root_admin' },
        { id: '9543b698-9267-4197-a21e-e72cd31406f6', userId: 'f356ebda-c5da-4f43-ba93-38d5725bac26', role: 'root_admin' },
        { id: 'dc25aceb-26f6-4d0d-8ea2-d75552df94ac', userId: 'GTa1Ag', role: 'root_admin' },
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
        { id: 'ops-workspace-00000000', name: 'CoAIleague Support', ownerId: 'root-user-00000000', subscriptionTier: 'enterprise', subscriptionStatus: 'active' },
        { id: 'demo-workspace-00000000', name: 'Demo Workspace', ownerId: 'root-user-00000000', subscriptionTier: 'enterprise', subscriptionStatus: 'active' },
        { id: 'autoforce-platform-workspace', name: 'AutoForce Platform', ownerId: 'root-user-00000000', subscriptionTier: 'enterprise', subscriptionStatus: 'cancelled' },
        { id: 'coaileague-platform-workspace', name: 'CoAIleague Platform', ownerId: 'root-user-00000000', subscriptionTier: 'enterprise', subscriptionStatus: 'cancelled' },
        { id: '37a04d24-51bd-4856-9faa-d26a2fe82094', name: 'Statewide Protective Services', ownerId: '48003611', subscriptionTier: 'free', subscriptionStatus: 'trial' },
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
        { id: '8d31a497-e9fe-48d9-b819-9c6869948c39', userId: 'root-user-00000000', workspaceId: 'ops-workspace-00000000', firstName: 'Root', lastName: 'Administrator', email: 'root@getdc360.com', hourlyRate: '0.00' },
        { id: 'helpai-employee', userId: null, workspaceId: 'ops-workspace-00000000', firstName: 'HelpAI', lastName: 'Bot', email: 'helpai@coaileague.support', hourlyRate: null, role: 'AI Support Assistant' },
        { id: 'trinity-employee', userId: null, workspaceId: 'ops-workspace-00000000', firstName: 'Trinity', lastName: 'AI', email: 'trinity@coaileague.support', hourlyRate: null, role: 'AI Platform Guide' },
        { id: '3fd50980-85f8-4f18-8b7a-5906ba8ccfe0', userId: '48003611', workspaceId: '37a04d24-51bd-4856-9faa-d26a2fe82094', firstName: 'Brigido', lastName: 'Guillen', email: 'txpsinvestigations@gmail.com', hourlyRate: '25.00' },
      ];
      
      for (const emp of employeesData) {
        await tx.execute(sql`
          INSERT INTO employees (id, user_id, workspace_id, first_name, last_name, email, hourly_rate, role, created_at, updated_at)
          VALUES (${emp.id}, ${emp.userId}, ${emp.workspaceId}, ${emp.firstName}, ${emp.lastName}, ${emp.email}, ${emp.hourlyRate}, ${(emp as any).role || null}, NOW(), NOW())
          ON CONFLICT (id) DO NOTHING
        `);
      }
    });
    
    console.log('✅ Production Seed: Database migration completed successfully!');
    console.log('   - Users: 9 core accounts');
    console.log('   - Platform Roles: 4 admin roles');
    console.log('   - Workspaces: 5 organizations');
    console.log('   - Employees: 4 records');
    
    return { success: true, message: 'Production database seeded successfully' };
    
  } catch (error) {
    console.error('❌ Production Seed: Migration failed:', error);
    return { success: false, message: `Seed failed: ${error}` };
  }
}
