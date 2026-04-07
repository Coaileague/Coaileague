-- Migration 0003: Shift overlap exclusion constraint
--
-- 🔴 RACE CONDITION FIX (Phase G audit, 2026-04-07):
--
-- shiftRoutes.ts references the PostgreSQL exclusion constraint
-- `no_overlapping_employee_shifts` as the SOLE atomic enforcement of
-- shift-overlap prevention (RC5 Phase 2). The application-level SELECT
-- overlap check was deliberately removed in favor of this constraint.
--
-- However the constraint was never created in any prior migration. If
-- the production database is rebuilt from migrations alone (or restored
-- to a fresh shape) overlap protection silently disappears and two
-- concurrent INSERTs can double-book an officer.
--
-- This migration installs the missing constraint canonically.
--
-- The constraint scopes overlap detection by (workspace_id, employee_id)
-- using a tstzrange built from start_time/end_time. Cancelled and denied
-- shifts are excluded so a replacement shift can occupy the same window
-- as a previously-rejected one.
--
-- Idempotent: uses IF NOT EXISTS so re-running on a DB that already has
-- the constraint is a no-op. Catches the legitimate case where the
-- constraint was created manually in production.

-- Required for the EXCLUDE USING gist on a (text, text, tstzrange) tuple
CREATE EXTENSION IF NOT EXISTS btree_gist;

-- Add the exclusion constraint only if it does not already exist
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'no_overlapping_employee_shifts'
  ) THEN
    ALTER TABLE shifts
      ADD CONSTRAINT no_overlapping_employee_shifts
      EXCLUDE USING gist (
        workspace_id WITH =,
        employee_id  WITH =,
        tstzrange(start_time, end_time, '[)') WITH &&
      )
      WHERE (
        employee_id IS NOT NULL
        AND status NOT IN ('cancelled', 'denied')
      );
  END IF;
END$$;

-- Sanity index that the constraint relies on for fast conflict detection.
-- (The exclusion constraint creates its own gist index, but this btree
-- index keeps the application-level lookups in shiftRoutes.ts fast.)
CREATE INDEX IF NOT EXISTS shifts_workspace_employee_time_idx
  ON shifts (workspace_id, employee_id, start_time, end_time)
  WHERE employee_id IS NOT NULL;
