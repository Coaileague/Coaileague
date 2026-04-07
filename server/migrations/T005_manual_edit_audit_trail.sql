ALTER TABLE time_entries ADD COLUMN IF NOT EXISTS manually_edited BOOLEAN DEFAULT false;
ALTER TABLE time_entries ADD COLUMN IF NOT EXISTS manual_edited_at TIMESTAMP;
ALTER TABLE time_entries ADD COLUMN IF NOT EXISTS manual_edited_by VARCHAR REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE time_entries ADD COLUMN IF NOT EXISTS manual_edit_reason TEXT;
ALTER TABLE time_entries ADD COLUMN IF NOT EXISTS pre_edit_snapshot JSONB;
