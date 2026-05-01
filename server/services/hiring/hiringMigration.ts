import { db } from '../../db';
import { typedPoolExec } from '../../lib/typedSql';
import { createLogger } from '../../lib/logger';
const log = createLogger('hiringMigration');


export async function runHiringMigration(): Promise<void> {
  const pool = db.$client;
  try {
    // CATEGORY C — Raw SQL retained: ALTER TABLE | Tables:  | Verified: 2026-03-23
    await typedPoolExec(`
      ALTER TABLE job_postings
        ADD COLUMN IF NOT EXISTS shift_type TEXT DEFAULT 'unarmed',
        ADD COLUMN IF NOT EXISTS schedule_details TEXT,
        ADD COLUMN IF NOT EXISTS requires_license BOOLEAN DEFAULT FALSE,
        ADD COLUMN IF NOT EXISTS auto_generated BOOLEAN DEFAULT FALSE,
        ADD COLUMN IF NOT EXISTS demand_trigger TEXT
    `);

    // CATEGORY C — Raw SQL retained: ALTER TABLE | Tables:  | Verified: 2026-03-23
    await typedPoolExec(`
      ALTER TABLE applicants
        ADD COLUMN IF NOT EXISTS license_state TEXT,
        ADD COLUMN IF NOT EXISTS license_type TEXT,
        ADD COLUMN IF NOT EXISTS license_screenshot_url TEXT,
        ADD COLUMN IF NOT EXISTS license_verified BOOLEAN DEFAULT FALSE,
        ADD COLUMN IF NOT EXISTS license_verification_notes TEXT,
        ADD COLUMN IF NOT EXISTS pipeline_stage TEXT DEFAULT 'applied',
        ADD COLUMN IF NOT EXISTS interview_score INTEGER,
        ADD COLUMN IF NOT EXISTS liability_score INTEGER,
        ADD COLUMN IF NOT EXISTS trinity_summary TEXT,
        ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP DEFAULT NOW()
    `);

    // CATEGORY C — Raw SQL retained: CREATE TABLE | Tables:  | Verified: 2026-03-23
    await typedPoolExec(`
      CREATE TABLE IF NOT EXISTS interview_question_sets (
        id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid()::VARCHAR,
        workspace_id VARCHAR NOT NULL,
        role_type VARCHAR NOT NULL,
        questions JSONB NOT NULL DEFAULT '[]',
        is_default BOOLEAN DEFAULT FALSE,
        created_by VARCHAR,
        created_at TIMESTAMP DEFAULT NOW()
      )
    `);

    // CATEGORY C — Raw SQL retained: CREATE TABLE | Tables:  | Verified: 2026-03-23
    await typedPoolExec(`
      CREATE TABLE IF NOT EXISTS interview_sessions (
        id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid()::VARCHAR,
        workspace_id VARCHAR NOT NULL,
        applicant_id VARCHAR NOT NULL,
        job_posting_id VARCHAR,
        conversation_id VARCHAR,
        session_type VARCHAR DEFAULT 'async',
        status VARCHAR DEFAULT 'pending',
        question_set_id VARCHAR,
        transcript JSONB DEFAULT '[]',
        score_breakdown JSONB DEFAULT '{}',
        overall_score INTEGER,
        transcript_summary TEXT,
        completed_at TIMESTAMP,
        created_at TIMESTAMP DEFAULT NOW()
      )
    `);

    // CATEGORY C — Raw SQL retained: ALTER TABLE | Tables:  | Verified: 2026-03-23
    await typedPoolExec(`
      ALTER TABLE interview_sessions
        ADD COLUMN IF NOT EXISTS overall_score INTEGER,
        ADD COLUMN IF NOT EXISTS transcript_summary TEXT
    `);

    log.info('[HiringMigration] Schema migration complete');
  } catch (err: unknown) {
    log.error('[HiringMigration] Error:', (err instanceof Error ? err.message : String(err)));
  }
}
