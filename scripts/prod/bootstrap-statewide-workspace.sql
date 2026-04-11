-- scripts/prod/bootstrap-statewide-workspace.sql
--
-- PURPOSE: Pure-SQL equivalent of bootstrap-statewide-workspace.ts.
--          Created so Bryan can paste this directly into the Railway
--          Postgres query console (Data tab) when the TypeScript script
--          cannot be reached from the local network.
--
-- Safe to run multiple times — every statement is ON CONFLICT DO NOTHING /
-- DO UPDATE so no duplicate rows are ever created.
--
-- Sets a TEMPORARY login password: "Statewide2026!"
-- bcrypt hash below was generated with bcryptjs cost 12 and verified in
-- sandbox. Matches the format server/auth.ts compares against.
-- IMPORTANT: change this password immediately after logging in.
--
-- What it creates / fixes:
--   1. Workspace  — enterprise/active/billing_exempt=TRUE/founder_exemption=TRUE
--   2. Owner user — txpsinvestigations@gmail.com, email_verified=TRUE,
--                   login_attempts=0, locked_until=NULL, password force-set
--   3. Workspace member row (org_owner role)
--   4. Employee record

BEGIN;

-- ── 1. Workspace ────────────────────────────────────────────────────────────
INSERT INTO workspaces (
  id, name, owner_id,
  subscription_tier, subscription_status,
  billing_exempt, founder_exemption,
  created_at, updated_at
)
VALUES (
  '37a04d24-51bd-4856-9faa-d26a2fe82094',
  'Statewide Protective Services',
  '48003611',
  'enterprise', 'active',
  TRUE, TRUE,
  NOW(), NOW()
)
ON CONFLICT (id) DO UPDATE
  SET subscription_tier   = 'enterprise',
      subscription_status = 'active',
      billing_exempt      = TRUE,
      founder_exemption   = TRUE,
      trial_ends_at       = NULL,
      updated_at          = NOW();

-- ── 2. Owner user ───────────────────────────────────────────────────────────
-- Bcrypt hash of "Statewide2026!" (bcryptjs, cost 12) — force-updated on
-- both INSERT and UPDATE so the owner can log in immediately.
INSERT INTO users (
  id, email, first_name, last_name, role,
  password_hash, email_verified, current_workspace_id,
  login_attempts, mfa_enabled,
  created_at, updated_at
)
VALUES (
  '48003611',
  'txpsinvestigations@gmail.com',
  'Brigido', 'Guillen', 'user',
  '$2b$12$F/GGRAFBVQW7.opHUvwyXO5HvbG7pPvkejwUDMFbf8kr2eTIRakCe',
  TRUE,
  '37a04d24-51bd-4856-9faa-d26a2fe82094',
  0, FALSE,
  NOW(), NOW()
)
ON CONFLICT (id) DO UPDATE
  SET email_verified       = TRUE,
      login_attempts       = 0,
      locked_until         = NULL,
      current_workspace_id = '37a04d24-51bd-4856-9faa-d26a2fe82094',
      password_hash        = '$2b$12$F/GGRAFBVQW7.opHUvwyXO5HvbG7pPvkejwUDMFbf8kr2eTIRakCe',
      updated_at           = NOW();

-- ── 3. Workspace member ─────────────────────────────────────────────────────
INSERT INTO workspace_members (
  user_id, workspace_id, role, status, joined_at, created_at, updated_at
)
SELECT
  '48003611',
  '37a04d24-51bd-4856-9faa-d26a2fe82094',
  'org_owner',
  'active',
  NOW(), NOW(), NOW()
WHERE NOT EXISTS (
  SELECT 1 FROM workspace_members
  WHERE user_id = '48003611'
    AND workspace_id = '37a04d24-51bd-4856-9faa-d26a2fe82094'
);

-- ── 4. Employee record ──────────────────────────────────────────────────────
INSERT INTO employees (
  id, user_id, workspace_id,
  first_name, last_name, email,
  role, workspace_role, employee_number,
  created_at, updated_at
)
VALUES (
  '3fd50980-85f8-4f18-8b7a-5906ba8ccfe0',
  '48003611',
  '37a04d24-51bd-4856-9faa-d26a2fe82094',
  'Brigido', 'Guillen', 'txpsinvestigations@gmail.com',
  'Owner', 'org_owner', 'EMP-SPS-00001',
  NOW(), NOW()
)
ON CONFLICT (id) DO NOTHING;

COMMIT;

-- ── Verification — these four SELECTs should all return exactly 1 row ──────
SELECT
  id,
  name,
  subscription_tier,
  subscription_status,
  billing_exempt,
  founder_exemption
FROM workspaces
WHERE id = '37a04d24-51bd-4856-9faa-d26a2fe82094';

SELECT
  id,
  email,
  email_verified,
  login_attempts,
  locked_until,
  current_workspace_id,
  LEFT(password_hash, 7) AS pw_prefix
FROM users
WHERE id = '48003611';

SELECT
  id,
  user_id,
  workspace_id,
  role,
  status
FROM workspace_members
WHERE user_id = '48003611'
  AND workspace_id = '37a04d24-51bd-4856-9faa-d26a2fe82094';

SELECT
  id,
  user_id,
  workspace_id,
  email,
  workspace_role,
  employee_number
FROM employees
WHERE id = '3fd50980-85f8-4f18-8b7a-5906ba8ccfe0';
