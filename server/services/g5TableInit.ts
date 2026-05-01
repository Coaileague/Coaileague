/**
 * Group 5 Table Initializer
 * Creates all Group 5 (phases 35B–35F) tables if they don't exist.
 * Called during server startup — idempotent.
 */
import { pool } from "../db";
import { createLogger } from '../lib/logger';
const log = createLogger('g5TableInit');


export async function initGroup5Tables(): Promise<void> {
  // Idempotent ALTER COLUMN add-ons. Earlier g5TableInit versions created
  // some tables (sales_activities, sales_proposals, sales_email_threads,
  // work_order_evidence) without lead_id / workspace_id, and CREATE TABLE
  // IF NOT EXISTS does not back-fill new columns. The CREATE INDEX
  // statements below referenced those missing columns and erroreds every
  // boot. These ALTER TABLE ADD COLUMN IF NOT EXISTS statements are
  // idempotent and safe to re-run.
  const columnPatches = [
    `ALTER TABLE IF EXISTS sales_activities ADD COLUMN IF NOT EXISTS lead_id VARCHAR`,
    `ALTER TABLE IF EXISTS sales_activities ADD COLUMN IF NOT EXISTS workspace_id VARCHAR`,
    `ALTER TABLE IF EXISTS sales_proposals ADD COLUMN IF NOT EXISTS lead_id VARCHAR`,
    `ALTER TABLE IF EXISTS sales_proposals ADD COLUMN IF NOT EXISTS workspace_id VARCHAR`,
    `ALTER TABLE IF EXISTS sales_email_threads ADD COLUMN IF NOT EXISTS lead_id VARCHAR`,
    `ALTER TABLE IF EXISTS sales_email_threads ADD COLUMN IF NOT EXISTS workspace_id VARCHAR`,
    `ALTER TABLE IF EXISTS work_order_evidence ADD COLUMN IF NOT EXISTS work_order_id VARCHAR`,
    `ALTER TABLE IF EXISTS work_order_evidence ADD COLUMN IF NOT EXISTS workspace_id VARCHAR`,
    `ALTER TABLE IF EXISTS sales_leads ADD COLUMN IF NOT EXISTS workspace_id VARCHAR`,
    `ALTER TABLE IF EXISTS sales_leads ADD COLUMN IF NOT EXISTS lead_score INTEGER DEFAULT 0`,
    `ALTER TABLE IF EXISTS chat_bot_commands ADD COLUMN IF NOT EXISTS workspace_id VARCHAR`,
    `ALTER TABLE IF EXISTS work_orders ADD COLUMN IF NOT EXISTS workspace_id VARCHAR`,
    `ALTER TABLE IF EXISTS work_orders ADD COLUMN IF NOT EXISTS client_id VARCHAR`,
    `ALTER TABLE IF EXISTS work_orders ADD COLUMN IF NOT EXISTS status VARCHAR DEFAULT 'draft'`,
    `ALTER TABLE IF EXISTS patrol_tours ADD COLUMN IF NOT EXISTS patrol_route_id VARCHAR`,
    `ALTER TABLE IF EXISTS patrol_tours ADD COLUMN IF NOT EXISTS officer_id VARCHAR`,
    `ALTER TABLE IF EXISTS patrol_tours ADD COLUMN IF NOT EXISTS workspace_id VARCHAR`,
    `ALTER TABLE IF EXISTS officer_availability ADD COLUMN IF NOT EXISTS workspace_id VARCHAR`,
    `ALTER TABLE IF EXISTS officer_availability ADD COLUMN IF NOT EXISTS officer_id VARCHAR`,
    `ALTER TABLE IF EXISTS shift_trade_requests ADD COLUMN IF NOT EXISTS workspace_id VARCHAR`,
    `ALTER TABLE IF EXISTS shift_trade_requests ADD COLUMN IF NOT EXISTS status VARCHAR DEFAULT 'pending'`,
  ];
  for (const patch of columnPatches) {
    try { await pool.query(patch); } catch { /* idempotent — table may not exist yet */ }
  }

  const stmts = [
    // ─── 35B: SALES ENGINE ───────────────────────────────────────────────────
    `CREATE TABLE IF NOT EXISTS sales_leads (
      id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
      workspace_id VARCHAR NOT NULL,
      company_name VARCHAR NOT NULL,
      contact_name VARCHAR,
      contact_email VARCHAR,
      contact_phone VARCHAR,
      lead_source VARCHAR DEFAULT 'manual_entry',
      stage VARCHAR NOT NULL DEFAULT 'captured',
      lost_reason TEXT,
      lead_score INTEGER DEFAULT 0,
      assigned_to VARCHAR,
      estimated_contract_value DECIMAL(12,2),
      estimated_officers_needed INTEGER,
      primary_post_type VARCHAR,
      operating_states TEXT[] DEFAULT ARRAY[]::TEXT[],
      notes TEXT,
      trinity_context JSONB DEFAULT '{}',
      last_contacted_at TIMESTAMP,
      expected_close_date DATE,
      created_at TIMESTAMP DEFAULT NOW(),
      updated_at TIMESTAMP DEFAULT NOW()
    )`,
    `CREATE INDEX IF NOT EXISTS sales_leads_workspace_idx ON sales_leads(workspace_id)`,
    `CREATE INDEX IF NOT EXISTS sales_leads_stage_idx ON sales_leads(stage)`,
    `CREATE INDEX IF NOT EXISTS sales_leads_score_idx ON sales_leads(lead_score DESC)`,

    `CREATE TABLE IF NOT EXISTS sales_activities (
      id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
      lead_id VARCHAR NOT NULL,
      workspace_id VARCHAR NOT NULL,
      activity_type VARCHAR NOT NULL DEFAULT 'note',
      direction VARCHAR DEFAULT 'outbound',
      subject VARCHAR,
      body TEXT,
      actor_id VARCHAR,
      timestamp TIMESTAMP DEFAULT NOW()
    )`,
    `CREATE INDEX IF NOT EXISTS sales_activities_lead_idx ON sales_activities(lead_id)`,
    `CREATE INDEX IF NOT EXISTS sales_activities_workspace_idx ON sales_activities(workspace_id)`,

    `CREATE TABLE IF NOT EXISTS sales_proposals (
      id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
      lead_id VARCHAR NOT NULL,
      workspace_id VARCHAR NOT NULL,
      proposal_number VARCHAR,
      status VARCHAR NOT NULL DEFAULT 'draft',
      services_description TEXT,
      estimated_officers INTEGER,
      post_locations TEXT,
      coverage_schedule TEXT,
      monthly_rate DECIMAL(12,2),
      setup_fee DECIMAL(12,2) DEFAULT 0,
      contract_term_months INTEGER DEFAULT 12,
      document_url TEXT,
      org_owner_signed_at TIMESTAMP,
      prospect_signed_at TIMESTAMP,
      valid_until TIMESTAMP,
      sent_at TIMESTAMP,
      approved_at TIMESTAMP,
      created_at TIMESTAMP DEFAULT NOW(),
      updated_at TIMESTAMP DEFAULT NOW()
    )`,
    `CREATE INDEX IF NOT EXISTS sales_proposals_lead_idx ON sales_proposals(lead_id)`,
    `CREATE INDEX IF NOT EXISTS sales_proposals_workspace_idx ON sales_proposals(workspace_id)`,

    `CREATE TABLE IF NOT EXISTS sales_email_threads (
      id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
      lead_id VARCHAR NOT NULL,
      workspace_id VARCHAR NOT NULL,
      thread_id VARCHAR,
      from_email VARCHAR,
      to_email VARCHAR,
      subject VARCHAR,
      direction VARCHAR DEFAULT 'outbound',
      body TEXT,
      trinity_generated BOOLEAN DEFAULT false,
      sent_at TIMESTAMP DEFAULT NOW()
    )`,
    `CREATE INDEX IF NOT EXISTS sales_email_threads_lead_idx ON sales_email_threads(lead_id)`,

    // ─── 35C: DOCCHAT BOT COMMANDS ───────────────────────────────────────────
    `CREATE TABLE IF NOT EXISTS chat_bot_commands (
      id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
      workspace_id VARCHAR NOT NULL,
      command_prefix VARCHAR NOT NULL,
      command_type VARCHAR NOT NULL DEFAULT 'built_in',
      handler VARCHAR,
      description TEXT,
      min_role VARCHAR DEFAULT 'staff',
      is_enabled BOOLEAN DEFAULT true,
      created_at TIMESTAMPTZ DEFAULT NOW()
    )`,
    `CREATE INDEX IF NOT EXISTS chat_bot_commands_workspace_idx ON chat_bot_commands(workspace_id)`,

    // ─── 35D: WORK ORDERS ────────────────────────────────────────────────────
    `CREATE TABLE IF NOT EXISTS work_orders (
      id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
      workspace_id VARCHAR NOT NULL,
      client_id VARCHAR,
      title VARCHAR NOT NULL,
      work_order_type VARCHAR NOT NULL DEFAULT 'special_assignment',
      status VARCHAR NOT NULL DEFAULT 'draft',
      description TEXT,
      location TEXT,
      required_certifications TEXT[] DEFAULT ARRAY[]::TEXT[],
      estimated_hours DECIMAL(8,2),
      actual_hours DECIMAL(8,2),
      billing_rate DECIMAL(10,2),
      billing_amount DECIMAL(12,2),
      assigned_officer_ids TEXT[] DEFAULT ARRAY[]::TEXT[],
      scheduled_start TIMESTAMP,
      scheduled_end TIMESTAMP,
      actual_start TIMESTAMP,
      actual_end TIMESTAMP,
      client_signed_at TIMESTAMP,
      client_signed_by VARCHAR,
      invoice_id VARCHAR,
      created_by VARCHAR,
      created_at TIMESTAMP DEFAULT NOW(),
      updated_at TIMESTAMP DEFAULT NOW()
    )`,
    `CREATE INDEX IF NOT EXISTS work_orders_workspace_idx ON work_orders(workspace_id)`,
    `CREATE INDEX IF NOT EXISTS work_orders_status_idx ON work_orders(status)`,
    `CREATE INDEX IF NOT EXISTS work_orders_client_idx ON work_orders(client_id)`,

    `CREATE TABLE IF NOT EXISTS work_order_evidence (
      id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
      work_order_id VARCHAR NOT NULL,
      workspace_id VARCHAR NOT NULL,
      evidence_type VARCHAR NOT NULL DEFAULT 'photo',
      file_url TEXT,
      sha256_hash VARCHAR,
      captured_by VARCHAR,
      captured_at TIMESTAMP DEFAULT NOW(),
      notes TEXT
    )`,
    `CREATE INDEX IF NOT EXISTS work_order_evidence_order_idx ON work_order_evidence(work_order_id)`,

    // ─── 35E: PATROL TOURS ───────────────────────────────────────────────────
    `CREATE TABLE IF NOT EXISTS patrol_tours (
      id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
      patrol_route_id VARCHAR NOT NULL,
      workspace_id VARCHAR NOT NULL,
      officer_id VARCHAR NOT NULL,
      shift_id VARCHAR,
      status VARCHAR NOT NULL DEFAULT 'in_progress',
      started_at TIMESTAMP DEFAULT NOW(),
      completed_at TIMESTAMP,
      completion_percentage DECIMAL(5,2) DEFAULT 0,
      missed_checkpoint_ids TEXT[] DEFAULT ARRAY[]::TEXT[],
      created_at TIMESTAMP DEFAULT NOW()
    )`,
    `CREATE INDEX IF NOT EXISTS patrol_tours_route_idx ON patrol_tours(patrol_route_id)`,
    `CREATE INDEX IF NOT EXISTS patrol_tours_officer_idx ON patrol_tours(officer_id)`,
    `CREATE INDEX IF NOT EXISTS patrol_tours_workspace_idx ON patrol_tours(workspace_id)`,

    // ─── 35F: OFFICER AVAILABILITY + SHIFT TRADES ────────────────────────────
    `CREATE TABLE IF NOT EXISTS officer_availability (
      id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
      workspace_id VARCHAR NOT NULL,
      officer_id VARCHAR NOT NULL,
      day_of_week INTEGER NOT NULL,
      start_time TIME NOT NULL,
      end_time TIME NOT NULL,
      is_available BOOLEAN NOT NULL DEFAULT true,
      effective_from DATE,
      effective_until DATE,
      created_at TIMESTAMP DEFAULT NOW(),
      updated_at TIMESTAMP DEFAULT NOW()
    )`,
    `CREATE INDEX IF NOT EXISTS officer_avail_workspace_idx ON officer_availability(workspace_id)`,
    `CREATE INDEX IF NOT EXISTS officer_avail_officer_idx ON officer_availability(officer_id)`,

    `CREATE TABLE IF NOT EXISTS shift_trade_requests (
      id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
      workspace_id VARCHAR NOT NULL,
      requesting_officer_id VARCHAR NOT NULL,
      requested_shift_id VARCHAR NOT NULL,
      offered_shift_id VARCHAR,
      target_officer_id VARCHAR,
      status VARCHAR NOT NULL DEFAULT 'pending',
      reason TEXT,
      manager_id VARCHAR,
      manager_note TEXT,
      expires_at TIMESTAMP,
      created_at TIMESTAMP DEFAULT NOW(),
      updated_at TIMESTAMP DEFAULT NOW()
    )`,
    `CREATE INDEX IF NOT EXISTS shift_trade_workspace_idx ON shift_trade_requests(workspace_id)`,
    `CREATE INDEX IF NOT EXISTS shift_trade_status_idx ON shift_trade_requests(status)`,
  ];

  let ok = 0;
  let errors = 0;
  for (const stmt of stmts) {
    try {
      await pool.query(stmt);
      ok++;
    } catch (err: unknown) {
      log.error(`[G5Init] Error: ${err.message?.slice(0, 120)}`);
      errors++;
    }
  }
  log.info(`[G5Init] Group 5 table init complete — ${ok} OK, ${errors} errors`);
}
