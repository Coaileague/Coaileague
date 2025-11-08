-- ============================================================================
-- RBAC Role Migration: Old Role Names → New Role Names
-- ============================================================================
-- This migration updates existing role data to match the new comprehensive
-- RBAC structure with clear separation between Platform and Organization roles.
--
-- Migration Date: November 2025
-- Reason: Implement two-tier RBAC (Platform Support vs Organization/Tenant)
-- ============================================================================

-- BACKUP REMINDER: Always backup your database before running migrations!

-- ============================================================================
-- STEP 1: Add New Enum Values (if they don't already exist)
-- ============================================================================

-- Add new platform_role enum values
DO $$ BEGIN
  ALTER TYPE platform_role ADD VALUE IF NOT EXISTS 'root_admin';
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  ALTER TYPE platform_role ADD VALUE IF NOT EXISTS 'support_manager';
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  ALTER TYPE platform_role ADD VALUE IF NOT EXISTS 'support_agent';
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  ALTER TYPE platform_role ADD VALUE IF NOT EXISTS 'compliance_officer';
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

-- Add new workspace_role enum values
DO $$ BEGIN
  ALTER TYPE workspace_role ADD VALUE IF NOT EXISTS 'org_owner';
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  ALTER TYPE workspace_role ADD VALUE IF NOT EXISTS 'org_admin';
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  ALTER TYPE workspace_role ADD VALUE IF NOT EXISTS 'department_manager';
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  ALTER TYPE workspace_role ADD VALUE IF NOT EXISTS 'staff';
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  ALTER TYPE workspace_role ADD VALUE IF NOT EXISTS 'auditor';
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  ALTER TYPE workspace_role ADD VALUE IF NOT EXISTS 'contractor';
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

-- ============================================================================
-- STEP 2: Update Platform Roles (users table)
-- ============================================================================

-- Map old platform role values to new platform role values
-- Old → New mappings:
--   'root' → 'root_admin'
--   'deputy_admin' → 'deputy_admin' (no change)
--   'deputy_assistant' → 'support_manager' (promoted to manager role)
--   'sysop' → 'sysop' (no change)
--   'support' → 'support_agent' (clarified as agent role)
--   'none' → 'none' (no change)

UPDATE users
SET platform_role = CASE platform_role
  WHEN 'root' THEN 'root_admin'
  WHEN 'deputy_admin' THEN 'deputy_admin'
  WHEN 'deputy_assistant' THEN 'support_manager'
  WHEN 'sysop' THEN 'sysop'
  WHEN 'support' THEN 'support_agent'
  WHEN 'none' THEN 'none'
  ELSE platform_role
END
WHERE platform_role IN ('root', 'deputy_assistant', 'support');

-- ============================================================================
-- PART 2: Update Workspace/Organization Roles (users table)
-- ============================================================================

-- Map old workspace role values to new organization role values
-- Old → New mappings:
--   'owner' → 'org_owner'
--   'manager' → 'org_admin' (promoted to admin role for day-to-day ops)
--   'hr_manager' → 'org_admin' (consolidated into admin with HR capabilities)
--   'supervisor' → 'supervisor' (no change)
--   'employee' → 'staff' (clarified as staff role)

UPDATE users
SET workspace_role = CASE workspace_role
  WHEN 'owner' THEN 'org_owner'
  WHEN 'manager' THEN 'org_admin'
  WHEN 'hr_manager' THEN 'org_admin'
  WHEN 'supervisor' THEN 'supervisor'
  WHEN 'employee' THEN 'staff'
  ELSE workspace_role
END
WHERE workspace_role IN ('owner', 'manager', 'hr_manager', 'employee');

-- ============================================================================
-- PART 3: Update Employee Records (employees table)
-- ============================================================================

-- Update workspace_role in employees table
UPDATE employees
SET workspace_role = CASE workspace_role
  WHEN 'owner' THEN 'org_owner'
  WHEN 'manager' THEN 'org_admin'
  WHEN 'hr_manager' THEN 'org_admin'
  WHEN 'supervisor' THEN 'supervisor'
  WHEN 'employee' THEN 'staff'
  ELSE workspace_role
END
WHERE workspace_role IN ('owner', 'manager', 'hr_manager', 'employee');

-- ============================================================================
-- PART 4: Update Role Capabilities Table
-- ============================================================================

-- Update workspace_role in role_capabilities table
UPDATE role_capabilities
SET workspace_role = CASE workspace_role
  WHEN 'owner' THEN 'org_owner'
  WHEN 'manager' THEN 'org_admin'
  WHEN 'hr_manager' THEN 'org_admin'
  WHEN 'supervisor' THEN 'supervisor'
  WHEN 'employee' THEN 'staff'
  ELSE workspace_role
END
WHERE workspace_role IN ('owner', 'manager', 'hr_manager', 'employee');

-- ============================================================================
-- PART 5: Verification Queries (run these to verify migration success)
-- ============================================================================

-- Check platform role distribution
-- SELECT platform_role, COUNT(*) as count FROM users GROUP BY platform_role ORDER BY count DESC;

-- Check workspace role distribution
-- SELECT workspace_role, COUNT(*) as count FROM users WHERE workspace_role IS NOT NULL GROUP BY workspace_role ORDER BY count DESC;

-- Check for any unmigrated roles (should return 0 rows)
-- SELECT id, email, platform_role, workspace_role FROM users 
-- WHERE platform_role IN ('root', 'deputy_assistant', 'support')
--    OR workspace_role IN ('owner', 'manager', 'hr_manager', 'employee');

-- ============================================================================
-- NOTES:
-- ============================================================================
-- 1. This migration is IDEMPOTENT - safe to run multiple times
-- 2. After running this migration, update Drizzle schema and push changes
-- 3. All old role values are preserved in the CASE statement for safety
-- 4. hr_manager users are promoted to org_admin (they can manage HR as admins)
-- 5. deputy_assistant users are promoted to support_manager (leadership role)
-- ============================================================================
