/**
 * Phase 35G — Client Communication Hub Migration
 * Creates client_message_threads and client_messages tables.
 * Uses CREATE TABLE IF NOT EXISTS — safe to run multiple times.
 *
 * CHECK constraints enforce valid values for status, sender_type,
 * direction, and channel columns.
 */

import { pool } from "../db";
import { createLogger } from '../lib/logger';
const log = createLogger('clientCommsMigration');


export async function runClientCommsMigration(): Promise<void> {
  log.info("[ClientCommsMigration] Starting client comms table migration...");

  const statements: string[] = [
    `CREATE TABLE IF NOT EXISTS client_message_threads (
      id VARCHAR(255) PRIMARY KEY DEFAULT gen_random_uuid()::text,
      workspace_id VARCHAR(255) NOT NULL,
      client_id VARCHAR(255) NOT NULL,
      subject VARCHAR(500) NOT NULL,
      status VARCHAR(50) NOT NULL DEFAULT 'open',
      channel VARCHAR(50) NOT NULL DEFAULT 'platform',
      assigned_to_user_id VARCHAR(255),
      sla_deadline TIMESTAMP,
      sla_status VARCHAR(20) DEFAULT 'ok',
      last_staff_reply_at TIMESTAMP,
      last_client_reply_at TIMESTAMP,
      last_message_at TIMESTAMP DEFAULT NOW(),
      last_message_preview TEXT,
      resolved_at TIMESTAMP,
      resolved_by VARCHAR(255),
      created_by VARCHAR(255),
      created_at TIMESTAMP DEFAULT NOW(),
      updated_at TIMESTAMP DEFAULT NOW()
    )`,

    `CREATE INDEX IF NOT EXISTS idx_cmt_workspace ON client_message_threads(workspace_id)`,
    `CREATE INDEX IF NOT EXISTS idx_cmt_client ON client_message_threads(client_id)`,
    `CREATE INDEX IF NOT EXISTS idx_cmt_status ON client_message_threads(workspace_id, status)`,
    `CREATE INDEX IF NOT EXISTS idx_cmt_last_message ON client_message_threads(workspace_id, last_message_at DESC)`,

    `CREATE TABLE IF NOT EXISTS client_messages (
      id VARCHAR(255) PRIMARY KEY DEFAULT gen_random_uuid()::text,
      workspace_id VARCHAR(255) NOT NULL,
      thread_id VARCHAR(255) NOT NULL,
      sender_type VARCHAR(20) NOT NULL,
      sender_id VARCHAR(255),
      sender_name VARCHAR(255),
      direction VARCHAR(20) NOT NULL DEFAULT 'outbound',
      channel VARCHAR(50) NOT NULL DEFAULT 'platform',
      body TEXT NOT NULL,
      attachments JSONB DEFAULT '[]',
      is_trinity_draft BOOLEAN DEFAULT FALSE,
      approved_by VARCHAR(255),
      approved_at TIMESTAMP,
      is_read BOOLEAN DEFAULT FALSE,
      read_at TIMESTAMP,
      created_at TIMESTAMP DEFAULT NOW()
    )`,

    `CREATE INDEX IF NOT EXISTS idx_cm_thread ON client_messages(thread_id)`,
    `CREATE INDEX IF NOT EXISTS idx_cm_workspace ON client_messages(workspace_id)`,
    `CREATE INDEX IF NOT EXISTS idx_cm_created ON client_messages(thread_id, created_at)`,

    // CHECK constraints — enforce valid values for constrained columns
    `DO $$ BEGIN
      ALTER TABLE client_message_threads DROP CONSTRAINT IF EXISTS chk_cmt_status;
      ALTER TABLE client_message_threads
        ADD CONSTRAINT chk_cmt_status CHECK (status IN ('open', 'resolved', 'archived'));
    END $$`,

    `DO $$ BEGIN
      ALTER TABLE client_message_threads
        ADD CONSTRAINT chk_cmt_channel CHECK (channel IN ('platform', 'email', 'phone_note'));
    EXCEPTION WHEN duplicate_object THEN NULL;
    END $$`,

    `DO $$ BEGIN
      ALTER TABLE client_message_threads
        ADD CONSTRAINT chk_cmt_sla_status CHECK (sla_status IN ('ok', 'amber', 'red'));
    EXCEPTION WHEN duplicate_object THEN NULL;
    END $$`,

    `DO $$ BEGIN
      ALTER TABLE client_messages
        ADD CONSTRAINT chk_cm_sender_type CHECK (sender_type IN ('staff', 'client', 'trinity'));
    EXCEPTION WHEN duplicate_object THEN NULL;
    END $$`,

    `DO $$ BEGIN
      ALTER TABLE client_messages
        ADD CONSTRAINT chk_cm_direction CHECK (direction IN ('inbound', 'outbound'));
    EXCEPTION WHEN duplicate_object THEN NULL;
    END $$`,

    `DO $$ BEGIN
      ALTER TABLE client_messages
        ADD CONSTRAINT chk_cm_channel CHECK (channel IN ('platform', 'email', 'phone_note'));
    EXCEPTION WHEN duplicate_object THEN NULL;
    END $$`,
  ];

  for (const stmt of statements) {
    try {
      await pool.query(stmt);
    } catch (err: unknown) {
      log.warn("[ClientCommsMigration] Statement failed (may already exist):", err?.message?.slice(0, 100));
    }
  }

  log.info("[ClientCommsMigration] Client comms migration complete.");
}
