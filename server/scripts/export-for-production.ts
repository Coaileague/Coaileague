/**
 * Database Migration Script: Export Development Data for Production
 * 
 * This script exports essential authentication data from development
 * and generates SQL INSERT statements for production.
 * 
 * Usage: npx tsx server/scripts/export-for-production.ts
 * 
 * Tables migrated (in order for referential integrity):
 * 1. users - User accounts with password hashes
 * 2. platform_roles - Admin/system roles
 * 3. workspaces - Organization workspaces
 * 4. employees - Employee records linked to users and workspaces
 */

import { db } from "../db";
import { users, platformRoles, workspaces, employees } from "@shared/schema";
import { sql } from "drizzle-orm";
import * as fs from "fs";

function escapeSQL(value: any): string {
  if (value === null || value === undefined) {
    return "NULL";
  }
  if (typeof value === "boolean") {
    return value ? "TRUE" : "FALSE";
  }
  if (typeof value === "number") {
    return String(value);
  }
  if (value instanceof Date) {
    return `'${value.toISOString()}'`;
  }
  if (Array.isArray(value)) {
    const escaped = value.map(v => escapeSQL(v).replace(/^'|'$/g, '')).join(',');
    return `ARRAY[${value.map(v => `'${String(v).replace(/'/g, "''")}'`).join(',')}]`;
  }
  if (typeof value === "object") {
    return `'${JSON.stringify(value).replace(/'/g, "''")}'::jsonb`;
  }
  // String - escape single quotes
  return `'${String(value).replace(/'/g, "''")}'`;
}

async function exportData() {
  console.log("🚀 Starting database export for production migration...\n");
  
  let sqlOutput = `-- CoAIleague Production Database Migration
-- Generated: ${new Date().toISOString()}
-- 
-- This script safely migrates development data to production.
-- Uses INSERT ... ON CONFLICT DO NOTHING to avoid duplicates.
-- Run this in the Replit Production Database pane.
--
-- IMPORTANT: Run these statements in order!

BEGIN;

-- ============================================================================
-- 1. USERS TABLE - Core authentication data
-- ============================================================================
`;

  // Export users
  const allUsers = await db.select().from(users);
  console.log(`📦 Found ${allUsers.length} users to export`);
  
  for (const user of allUsers) {
    const columns = [
      'id', 'email', 'first_name', 'last_name', 'password_hash', 
      'role', 'email_verified', 'current_workspace_id', 'created_at', 
      'updated_at', 'profile_image_url', 'phone', 'last_login_at',
      'login_attempts', 'locked_until', 'mfa_enabled', 'mfa_secret',
      'work_id'
    ];
    
    const values = [
      escapeSQL(user.id),
      escapeSQL(user.email),
      escapeSQL(user.firstName),
      escapeSQL(user.lastName),
      escapeSQL(user.passwordHash),
      escapeSQL(user.role),
      escapeSQL(user.emailVerified),
      escapeSQL(user.currentWorkspaceId),
      escapeSQL(user.createdAt),
      escapeSQL(user.updatedAt),
      escapeSQL(user.profileImageUrl),
      escapeSQL(user.phone),
      escapeSQL(user.lastLoginAt),
      escapeSQL(user.loginAttempts),
      escapeSQL(user.lockedUntil),
      escapeSQL((user as any).mfaEnabled),
      escapeSQL((user as any).mfaSecret),
      escapeSQL((user as any).workId),
    ];
    
    sqlOutput += `INSERT INTO users (${columns.join(', ')}) VALUES (${values.join(', ')}) ON CONFLICT (id) DO NOTHING;\n`;
  }

  sqlOutput += `
-- ============================================================================
-- 2. PLATFORM_ROLES TABLE - Admin and system roles
-- ============================================================================
`;

  // Export platform roles
  const allRoles = await db.select().from(platformRoles);
  console.log(`📦 Found ${allRoles.length} platform roles to export`);
  
  for (const role of allRoles) {
    const columns = ['id', 'user_id', 'role', 'granted_at', 'granted_by', 'notes', 'revoked_at', 'revoked_by'];
    const values = [
      escapeSQL(role.id),
      escapeSQL(role.userId),
      escapeSQL(role.role),
      escapeSQL(role.grantedAt),
      escapeSQL(role.grantedBy),
      escapeSQL(role.notes),
      escapeSQL(role.revokedAt),
      escapeSQL(role.revokedBy),
    ];
    
    sqlOutput += `INSERT INTO platform_roles (${columns.join(', ')}) VALUES (${values.join(', ')}) ON CONFLICT (id) DO NOTHING;\n`;
  }

  sqlOutput += `
-- ============================================================================
-- 3. WORKSPACES TABLE - Organization/tenant data
-- ============================================================================
`;

  // Export workspaces
  const allWorkspaces = await db.select().from(workspaces);
  console.log(`📦 Found ${allWorkspaces.length} workspaces to export`);
  
  for (const ws of allWorkspaces) {
    const columns = [
      'id', 'name', 'slug', 'owner_id', 'logo_url', 'primary_color',
      'created_at', 'updated_at', 'address', 'city', 'state', 'zip_code',
      'phone', 'email', 'subscription_tier', 'stripe_customer_id',
      'stripe_subscription_id', 'billing_email', 'trial_ends_at',
      'subscription_status', 'features', 'settings'
    ];
    
    const values = [
      escapeSQL(ws.id),
      escapeSQL(ws.name),
      escapeSQL(ws.slug),
      escapeSQL(ws.ownerId),
      escapeSQL(ws.logoUrl),
      escapeSQL(ws.primaryColor),
      escapeSQL(ws.createdAt),
      escapeSQL(ws.updatedAt),
      escapeSQL(ws.address),
      escapeSQL(ws.city),
      escapeSQL(ws.state),
      escapeSQL(ws.zipCode),
      escapeSQL(ws.phone),
      escapeSQL(ws.email),
      escapeSQL(ws.subscriptionTier),
      escapeSQL(ws.stripeCustomerId),
      escapeSQL(ws.stripeSubscriptionId),
      escapeSQL(ws.billingEmail),
      escapeSQL(ws.trialEndsAt),
      escapeSQL(ws.subscriptionStatus),
      escapeSQL(ws.features),
      escapeSQL(ws.settings),
    ];
    
    sqlOutput += `INSERT INTO workspaces (${columns.join(', ')}) VALUES (${values.join(', ')}) ON CONFLICT (id) DO NOTHING;\n`;
  }

  sqlOutput += `
-- ============================================================================
-- 4. EMPLOYEES TABLE - Employee records linked to users/workspaces
-- ============================================================================
`;

  // Export employees
  const allEmployees = await db.select().from(employees);
  console.log(`📦 Found ${allEmployees.length} employees to export`);
  
  for (const emp of allEmployees) {
    const columns = [
      'id', 'user_id', 'workspace_id', 'employee_id', 'first_name', 'last_name',
      'email', 'phone', 'role', 'department', 'hire_date', 'status',
      'hourly_rate', 'created_at', 'updated_at', 'profile_image_url',
      'permissions', 'skills', 'certifications'
    ];
    
    const values = [
      escapeSQL(emp.id),
      escapeSQL(emp.userId),
      escapeSQL(emp.workspaceId),
      escapeSQL(emp.employeeId),
      escapeSQL(emp.firstName),
      escapeSQL(emp.lastName),
      escapeSQL(emp.email),
      escapeSQL(emp.phone),
      escapeSQL(emp.role),
      escapeSQL(emp.department),
      escapeSQL(emp.hireDate),
      escapeSQL(emp.status),
      escapeSQL(emp.hourlyRate),
      escapeSQL(emp.createdAt),
      escapeSQL(emp.updatedAt),
      escapeSQL(emp.profileImageUrl),
      escapeSQL(emp.permissions),
      escapeSQL(emp.skills),
      escapeSQL(emp.certifications),
    ];
    
    sqlOutput += `INSERT INTO employees (${columns.join(', ')}) VALUES (${values.join(', ')}) ON CONFLICT (id) DO NOTHING;\n`;
  }

  sqlOutput += `
-- ============================================================================
-- COMMIT TRANSACTION
-- ============================================================================
COMMIT;

-- Migration complete! 
-- Total records: ${allUsers.length} users, ${allRoles.length} roles, ${allWorkspaces.length} workspaces, ${allEmployees.length} employees
`;

  // Write to file
  const outputPath = "production-migration.sql";
  fs.writeFileSync(outputPath, sqlOutput);
  
  console.log(`\n✅ Migration SQL exported to: ${outputPath}`);
  console.log(`\n📋 Summary:`);
  console.log(`   - Users: ${allUsers.length}`);
  console.log(`   - Platform Roles: ${allRoles.length}`);
  console.log(`   - Workspaces: ${allWorkspaces.length}`);
  console.log(`   - Employees: ${allEmployees.length}`);
  console.log(`\n🔧 Next Steps:`);
  console.log(`   1. Open the Replit Database pane`);
  console.log(`   2. Switch to the Production database`);
  console.log(`   3. Copy and paste the SQL from production-migration.sql`);
  console.log(`   4. Execute the SQL statements`);
  console.log(`   5. Test login in production`);
}

exportData()
  .then(() => {
    console.log("\n🎉 Export complete!");
    process.exit(0);
  })
  .catch((error) => {
    console.error("❌ Export failed:", error);
    process.exit(1);
  });
