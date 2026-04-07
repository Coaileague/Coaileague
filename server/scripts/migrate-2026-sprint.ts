/**
 * CoAIleague 2026 Legal/Safety Sprint — Database Migration
 * =========================================================
 * Per USER LAW: no db:push — uses ALTER TABLE ADD COLUMN IF NOT EXISTS
 * and CREATE TABLE IF NOT EXISTS for all additions.
 * NEVER drops columns or modifies existing types.
 *
 * New tables:  sms_consent, sms_attempt_log, emergency_events, on_call_schedule
 * New columns: incident_reports (integrity + bilingual),
 *              users (preferred_language)
 *              helpos_faqs (language, review fields)
 *
 * Run: npx tsx server/scripts/migrate-2026-sprint.ts
 */

import { db } from '../db';
import { sql } from 'drizzle-orm';
import { typedCount, typedExec } from '../lib/typedSql';

async function run() {
  console.log('\n══════════════════════════════════════════════');
  console.log('  CoAIleague 2026 Legal/Safety Sprint Migration');
  console.log('══════════════════════════════════════════════\n');

  // ── Phase B: SMS Consent ─────────────────────────────────────────────────

  console.log('Phase B — Creating sms_consent table...');
  // CATEGORY C — Raw SQL retained: CREATE TABLE | Tables:  | Verified: 2026-03-23
  await typedExec(sql`
    CREATE TABLE IF NOT EXISTS sms_consent (
      id            VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id       VARCHAR NOT NULL,
      workspace_id  VARCHAR NOT NULL,
      phone_number  VARCHAR(20) NOT NULL,
      consent_given BOOLEAN NOT NULL DEFAULT FALSE,
      consent_given_at     TIMESTAMP,
      consent_ip_address   VARCHAR(45),
      consent_method       VARCHAR(50) DEFAULT 'onboarding_form',
      opt_out_at           TIMESTAMP,
      opt_out_method       VARCHAR(50),
      emergency_alerts_only BOOLEAN NOT NULL DEFAULT FALSE,
      last_updated  TIMESTAMP DEFAULT NOW(),
      created_at    TIMESTAMP DEFAULT NOW()
    )
  `);
  // CATEGORY C — Raw SQL retained: CREATE INDEX | Tables:  | Verified: 2026-03-23
  await typedExec(sql`CREATE INDEX IF NOT EXISTS sms_consent_user_idx     ON sms_consent(user_id)`);
  // CATEGORY C — Raw SQL retained: CREATE INDEX | Tables:  | Verified: 2026-03-23
  await typedExec(sql`CREATE INDEX IF NOT EXISTS sms_consent_phone_idx    ON sms_consent(phone_number)`);
  // CATEGORY C — Raw SQL retained: CREATE INDEX | Tables:  | Verified: 2026-03-23
  await typedExec(sql`CREATE INDEX IF NOT EXISTS sms_consent_workspace_idx ON sms_consent(workspace_id)`);

  console.log('Phase B — Creating sms_attempt_log table...');
  // CATEGORY C — Raw SQL retained: CREATE TABLE | Tables:  | Verified: 2026-03-23
  await typedExec(sql`
    CREATE TABLE IF NOT EXISTS sms_attempt_log (
      id               VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id          VARCHAR,
      workspace_id     VARCHAR,
      phone_number     VARCHAR(20),
      message_type     VARCHAR(100) NOT NULL,
      sent             BOOLEAN NOT NULL DEFAULT FALSE,
      consent_verified BOOLEAN NOT NULL DEFAULT FALSE,
      reason_not_sent  VARCHAR(200),
      twilio_message_id VARCHAR,
      sent_at          TIMESTAMP DEFAULT NOW()
    )
  `);
  // CATEGORY C — Raw SQL retained: CREATE INDEX | Tables:  | Verified: 2026-03-23
  await typedExec(sql`CREATE INDEX IF NOT EXISTS sms_attempt_log_user_idx    ON sms_attempt_log(user_id)`);
  // CATEGORY C — Raw SQL retained: CREATE INDEX | Tables:  | Verified: 2026-03-23
  await typedExec(sql`CREATE INDEX IF NOT EXISTS sms_attempt_log_sent_at_idx ON sms_attempt_log(sent_at)`);
  console.log('  [ok] sms_consent + sms_attempt_log');

  // ── Phase C: Emergency Events ─────────────────────────────────────────────

  console.log('Phase C — Creating emergency_events table...');
  // CATEGORY C — Raw SQL retained: CREATE TABLE | Tables:  | Verified: 2026-03-23
  await typedExec(sql`
    CREATE TABLE IF NOT EXISTS emergency_events (
      id                      VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
      workspace_id            VARCHAR NOT NULL,
      officer_id              VARCHAR NOT NULL,
      panic_activated_at      TIMESTAMP NOT NULL DEFAULT NOW(),
      gps_latitude            DOUBLE PRECISION,
      gps_longitude           DOUBLE PRECISION,
      gps_accuracy_meters     DOUBLE PRECISION,
      site_id                 VARCHAR,
      site_address            TEXT,
      on_call_supervisor_id   VARCHAR,
      on_call_supervisor_phone VARCHAR(20),
      manager_ids             JSONB DEFAULT '[]'::jsonb,
      owner_id                VARCHAR,
      last_check_in_at        TIMESTAMP,
      active_shift_id         VARCHAR,
      emergency_chatroom_id   VARCHAR,
      first_acknowledgment_at TIMESTAMP,
      first_acknowledged_by   VARCHAR,
      resolved_at             TIMESTAMP,
      resolved_by             VARCHAR,
      response_time_seconds   INTEGER,
      sms_attempts            JSONB DEFAULT '[]'::jsonb,
      escalation_count        INTEGER NOT NULL DEFAULT 0,
      status                  VARCHAR(30) NOT NULL DEFAULT 'active',
      incident_report_id      VARCHAR,
      created_at              TIMESTAMP DEFAULT NOW(),
      updated_at              TIMESTAMP DEFAULT NOW()
    )
  `);
  // CATEGORY C — Raw SQL retained: CREATE INDEX | Tables:  | Verified: 2026-03-23
  await typedExec(sql`CREATE INDEX IF NOT EXISTS emergency_events_workspace_idx  ON emergency_events(workspace_id)`);
  // CATEGORY C — Raw SQL retained: CREATE INDEX | Tables:  | Verified: 2026-03-23
  await typedExec(sql`CREATE INDEX IF NOT EXISTS emergency_events_officer_idx    ON emergency_events(officer_id)`);
  // CATEGORY C — Raw SQL retained: CREATE INDEX | Tables:  | Verified: 2026-03-23
  await typedExec(sql`CREATE INDEX IF NOT EXISTS emergency_events_status_idx     ON emergency_events(status)`);
  // CATEGORY C — Raw SQL retained: CREATE INDEX | Tables:  | Verified: 2026-03-23
  await typedExec(sql`CREATE INDEX IF NOT EXISTS emergency_events_activated_idx  ON emergency_events(panic_activated_at)`);
  console.log('  [ok] emergency_events');

  // ── Phase D: On-Call Schedule ─────────────────────────────────────────────

  console.log('Phase D — Creating on_call_schedule table...');
  // CATEGORY C — Raw SQL retained: CREATE TABLE | Tables:  | Verified: 2026-03-23
  await typedExec(sql`
    CREATE TABLE IF NOT EXISTS on_call_schedule (
      id                VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
      workspace_id      VARCHAR NOT NULL,
      user_id           VARCHAR NOT NULL,
      role              VARCHAR(30) NOT NULL,
      phone_number      VARCHAR(20),
      shift_type        VARCHAR(30) NOT NULL,
      on_call_start     TIMESTAMP NOT NULL,
      on_call_end       TIMESTAMP NOT NULL,
      days_of_week      JSONB DEFAULT '[]'::jsonb,
      is_backup         BOOLEAN NOT NULL DEFAULT FALSE,
      backup_for_user_id VARCHAR,
      created_by        VARCHAR NOT NULL,
      active            BOOLEAN NOT NULL DEFAULT TRUE,
      created_at        TIMESTAMP DEFAULT NOW(),
      updated_at        TIMESTAMP DEFAULT NOW()
    )
  `);
  // CATEGORY C — Raw SQL retained: CREATE INDEX | Tables:  | Verified: 2026-03-23
  await typedExec(sql`CREATE INDEX IF NOT EXISTS on_call_schedule_workspace_idx ON on_call_schedule(workspace_id)`);
  // CATEGORY C — Raw SQL retained: CREATE INDEX | Tables:  | Verified: 2026-03-23
  await typedExec(sql`CREATE INDEX IF NOT EXISTS on_call_schedule_user_idx      ON on_call_schedule(user_id)`);
  // CATEGORY C — Raw SQL retained: CREATE INDEX | Tables:  | Verified: 2026-03-23
  await typedExec(sql`CREATE INDEX IF NOT EXISTS on_call_schedule_range_idx     ON on_call_schedule(on_call_start, on_call_end)`);
  // CATEGORY C — Raw SQL retained: CREATE INDEX | Tables:  | Verified: 2026-03-23
  await typedExec(sql`CREATE INDEX IF NOT EXISTS on_call_schedule_active_idx    ON on_call_schedule(active)`);
  console.log('  [ok] on_call_schedule');

  // ── Phase H: Bilingual — preferred_language on users ─────────────────────

  console.log('Phase H — Adding preferred_language to users...');
  // CATEGORY C — Raw SQL retained: ALTER TABLE | Tables:  | Verified: 2026-03-23
  await typedExec(sql`
    ALTER TABLE users
    ADD COLUMN IF NOT EXISTS preferred_language VARCHAR(5) NOT NULL DEFAULT 'en'
  `);
  console.log('  [ok] users.preferred_language');

  // ── Phase H + I: Incident Reports — bilingual + integrity columns ─────────

  console.log('Phase H+I — Adding bilingual + integrity columns to incident_reports...');
  // CATEGORY C — Raw SQL retained: ALTER TABLE | Tables:  | Verified: 2026-03-23
  await typedExec(sql`ALTER TABLE incident_reports ADD COLUMN IF NOT EXISTS content_hash            VARCHAR(64)`);
  // CATEGORY C — Raw SQL retained: ALTER TABLE | Tables:  | Verified: 2026-03-23
  await typedExec(sql`ALTER TABLE incident_reports ADD COLUMN IF NOT EXISTS content_hash_generated_at TIMESTAMP`);
  // CATEGORY C — Raw SQL retained: ALTER TABLE | Tables:  | Verified: 2026-03-23
  await typedExec(sql`ALTER TABLE incident_reports ADD COLUMN IF NOT EXISTS original_language       VARCHAR(5) DEFAULT 'en'`);
  // CATEGORY C — Raw SQL retained: ALTER TABLE | Tables:  | Verified: 2026-03-23
  await typedExec(sql`ALTER TABLE incident_reports ADD COLUMN IF NOT EXISTS original_text           TEXT`);
  // CATEGORY C — Raw SQL retained: ALTER TABLE | Tables:  | Verified: 2026-03-23
  await typedExec(sql`ALTER TABLE incident_reports ADD COLUMN IF NOT EXISTS translated_text         TEXT`);
  // CATEGORY C — Raw SQL retained: ALTER TABLE | Tables:  | Verified: 2026-03-23
  await typedExec(sql`ALTER TABLE incident_reports ADD COLUMN IF NOT EXISTS translation_method      VARCHAR(30)`);
  // CATEGORY C — Raw SQL retained: ALTER TABLE | Tables:  | Verified: 2026-03-23
  await typedExec(sql`ALTER TABLE incident_reports ADD COLUMN IF NOT EXISTS translation_generated_at TIMESTAMP`);
  // CATEGORY C — Raw SQL retained: ALTER TABLE | Tables:  | Verified: 2026-03-23
  await typedExec(sql`ALTER TABLE incident_reports ADD COLUMN IF NOT EXISTS translation_disclaimer  TEXT DEFAULT 'AI-generated for reference only. Original text is the official record.'`);
  // CATEGORY C — Raw SQL retained: ALTER TABLE | Tables:  | Verified: 2026-03-23
  await typedExec(sql`ALTER TABLE incident_reports ADD COLUMN IF NOT EXISTS coaching_note           TEXT`);
  // CATEGORY C — Raw SQL retained: ALTER TABLE | Tables:  | Verified: 2026-03-23
  await typedExec(sql`ALTER TABLE incident_reports ADD COLUMN IF NOT EXISTS coaching_note_created_at TIMESTAMP`);
  // CATEGORY C — Raw SQL retained: ALTER TABLE | Tables:  | Verified: 2026-03-23
  await typedExec(sql`ALTER TABLE incident_reports ADD COLUMN IF NOT EXISTS version                 INTEGER NOT NULL DEFAULT 1`);
  // CATEGORY C — Raw SQL retained: ALTER TABLE | Tables:  | Verified: 2026-03-23
  await typedExec(sql`ALTER TABLE incident_reports ADD COLUMN IF NOT EXISTS version_history         JSONB DEFAULT '[]'::jsonb`);
  console.log('  [ok] incident_reports bilingual + integrity columns');

  // ── Phase E: FAQ — missing columns on helpos_faqs ────────────────────────

  console.log('Phase E — Adding missing columns to helpos_faqs...');
  // CATEGORY C — Raw SQL retained: ALTER TABLE | Tables:  | Verified: 2026-03-23
  await typedExec(sql`ALTER TABLE helpos_faqs ADD COLUMN IF NOT EXISTS language              VARCHAR(5) DEFAULT 'en'`);
  // CATEGORY C — Raw SQL retained: ALTER TABLE | Tables:  | Verified: 2026-03-23
  await typedExec(sql`ALTER TABLE helpos_faqs ADD COLUMN IF NOT EXISTS scope                VARCHAR(30) DEFAULT 'platform_wide'`);
  // CATEGORY C — Raw SQL retained: ALTER TABLE | Tables:  | Verified: 2026-03-23
  await typedExec(sql`ALTER TABLE helpos_faqs ADD COLUMN IF NOT EXISTS update_ordered_by    VARCHAR`);
  // CATEGORY C — Raw SQL retained: ALTER TABLE | Tables:  | Verified: 2026-03-23
  await typedExec(sql`ALTER TABLE helpos_faqs ADD COLUMN IF NOT EXISTS update_order_reason  TEXT`);
  // CATEGORY C — Raw SQL retained: ALTER TABLE | Tables:  | Verified: 2026-03-23
  await typedExec(sql`ALTER TABLE helpos_faqs ADD COLUMN IF NOT EXISTS review_required      BOOLEAN NOT NULL DEFAULT FALSE`);
  // CATEGORY C — Raw SQL retained: ALTER TABLE | Tables:  | Verified: 2026-03-23
  await typedExec(sql`ALTER TABLE helpos_faqs ADD COLUMN IF NOT EXISTS reviewed_by          VARCHAR`);
  // CATEGORY C — Raw SQL retained: ALTER TABLE | Tables:  | Verified: 2026-03-23
  await typedExec(sql`ALTER TABLE helpos_faqs ADD COLUMN IF NOT EXISTS reviewed_at          TIMESTAMP`);
  // CATEGORY C — Raw SQL retained: ALTER TABLE | Tables:  | Verified: 2026-03-23
  await typedExec(sql`ALTER TABLE helpos_faqs ADD COLUMN IF NOT EXISTS published_at         TIMESTAMP`);
  // CATEGORY C — Raw SQL retained: ALTER TABLE | Tables:  | Verified: 2026-03-23
  await typedExec(sql`ALTER TABLE helpos_faqs ADD COLUMN IF NOT EXISTS published_by         VARCHAR`);
  // CATEGORY C — Raw SQL retained: ALTER TABLE | Tables:  | Verified: 2026-03-23
  await typedExec(sql`ALTER TABLE helpos_faqs ADD COLUMN IF NOT EXISTS created_by           VARCHAR`);
  console.log('  [ok] helpos_faqs compliance fields');

  // ── Verification ─────────────────────────────────────────────────────────

  console.log('\n══════════════════════════════════════════════');
  console.log('  Verifying tables...');
  console.log('══════════════════════════════════════════════\n');

  const tables = [
    'sms_consent',
    'sms_attempt_log',
    'emergency_events',
    'on_call_schedule',
  ];

  for (const table of tables) {
    // CATEGORY C — Raw SQL retained: information_schema | Tables: information_schema | Verified: 2026-03-23
    const result = await typedCount(sql`
      SELECT COUNT(*) FROM information_schema.tables
      WHERE table_name = ${table}
      AND table_schema = 'public'
    `);
    const exists = Number((result.rows[0] as any).count) > 0;
    console.log(`  ${exists ? '✓' : '✗'} ${table}`);
  }

  const columns = [
    ['users',            'preferred_language'],
    ['incident_reports', 'content_hash'],
    ['incident_reports', 'original_language'],
    ['incident_reports', 'translated_text'],
    ['incident_reports', 'coaching_note'],
    ['helpos_faqs',      'language'],
    ['helpos_faqs',      'review_required'],
  ];

  for (const [table, col] of columns) {
    // CATEGORY C — Raw SQL retained: information_schema | Tables: information_schema | Verified: 2026-03-23
    const result = await typedCount(sql`
      SELECT COUNT(*) FROM information_schema.columns
      WHERE table_name = ${table}
      AND column_name = ${col}
      AND table_schema = 'public'
    `);
    const exists = Number((result.rows[0] as any).count) > 0;
    console.log(`  ${exists ? '✓' : '✗'} ${table}.${col}`);
  }

  console.log('\n✅ Migration complete.\n');
}

run().catch(err => {
  console.error('Migration failed:', err);
  process.exit(1);
});
