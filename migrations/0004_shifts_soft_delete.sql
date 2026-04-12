-- Migration: add deleted_at column to shifts table for soft-delete support
-- Existing rows receive NULL (not deleted), preserving all historic data.

ALTER TABLE shifts
  ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMP;
