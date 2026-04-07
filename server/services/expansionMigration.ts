/**
 * EXPANSION SPRINT — Database Migration
 * Creates all 15 new tables for the 8-module expansion.
 * Uses CREATE TABLE IF NOT EXISTS — safe to run multiple times.
 * Follows USER LAW: no npm run db:push.
 */

import { db } from "../db";
import { createLogger } from '../lib/logger';
const log = createLogger('expansionMigration');


export async function runExpansionMigration(): Promise<void> {
  const { isProduction: isProd } = await import('../lib/isProduction');
  const isProduction = isProd();
  log.info(`[ExpansionMigration] Starting expansion table migration (production=${isProduction})...`);

  const statements: string[] = [
    // ── MODULE 1: Post Order Versions ──────────────────────────────────────
    `CREATE TABLE IF NOT EXISTS post_order_versions (
      id VARCHAR(255) PRIMARY KEY DEFAULT gen_random_uuid()::text,
      workspace_id VARCHAR(255) NOT NULL,
      site_id VARCHAR(255),
      version_number INTEGER NOT NULL DEFAULT 1,
      title VARCHAR(500) NOT NULL,
      content TEXT NOT NULL,
      change_summary TEXT,
      effective_date DATE,
      created_by VARCHAR(255),
      created_at TIMESTAMP DEFAULT NOW(),
      is_current BOOLEAN DEFAULT TRUE,
      requires_acknowledgment BOOLEAN DEFAULT TRUE,
      acknowledgment_deadline DATE,
      officers_required_to_acknowledge JSONB DEFAULT '[]',
      acknowledged_count INTEGER DEFAULT 0,
      pending_count INTEGER DEFAULT 0
    )`,

    `CREATE INDEX IF NOT EXISTS idx_po_versions_workspace ON post_order_versions(workspace_id)`,
    `CREATE INDEX IF NOT EXISTS idx_po_versions_site ON post_order_versions(site_id)`,
    `CREATE INDEX IF NOT EXISTS idx_po_versions_current ON post_order_versions(workspace_id, is_current)`,

    `CREATE TABLE IF NOT EXISTS post_order_version_acknowledgments (
      id VARCHAR(255) PRIMARY KEY DEFAULT gen_random_uuid()::text,
      workspace_id VARCHAR(255) NOT NULL,
      site_id VARCHAR(255),
      post_order_version_id VARCHAR(255) NOT NULL,
      employee_id VARCHAR(255) NOT NULL,
      acknowledged_at TIMESTAMP DEFAULT NOW(),
      acknowledgment_method VARCHAR(50) DEFAULT 'manual',
      device_info TEXT,
      ip_address VARCHAR(100),
      UNIQUE(post_order_version_id, employee_id)
    )`,

    `CREATE INDEX IF NOT EXISTS idx_pova_workspace ON post_order_version_acknowledgments(workspace_id)`,
    `CREATE INDEX IF NOT EXISTS idx_pova_version ON post_order_version_acknowledgments(post_order_version_id)`,

    // ── MODULE 2: Incident Patterns ────────────────────────────────────────
    `CREATE TABLE IF NOT EXISTS incident_patterns (
      id VARCHAR(255) PRIMARY KEY DEFAULT gen_random_uuid()::text,
      workspace_id VARCHAR(255) NOT NULL,
      pattern_type VARCHAR(100) NOT NULL,
      pattern_scope VARCHAR(100) NOT NULL,
      sites_affected JSONB DEFAULT '[]',
      officers_involved JSONB DEFAULT '[]',
      incident_count INTEGER DEFAULT 0,
      first_occurrence TIMESTAMP,
      most_recent_occurrence TIMESTAMP,
      pattern_description TEXT,
      risk_level VARCHAR(50) DEFAULT 'medium',
      recommended_action TEXT,
      status VARCHAR(50) DEFAULT 'active',
      addressed_by VARCHAR(255),
      addressed_at TIMESTAMP,
      address_notes TEXT,
      created_by VARCHAR(255) DEFAULT 'trinity',
      created_at TIMESTAMP DEFAULT NOW()
    )`,

    `CREATE INDEX IF NOT EXISTS idx_ip_workspace ON incident_patterns(workspace_id)`,
    `CREATE INDEX IF NOT EXISTS idx_ip_status ON incident_patterns(workspace_id, status)`,

    // ── MODULE 3: Contract Renewal Tasks ───────────────────────────────────
    `ALTER TABLE client_contracts ADD COLUMN IF NOT EXISTS renewal_notice_days INTEGER DEFAULT 90`,
    `ALTER TABLE client_contracts ADD COLUMN IF NOT EXISTS auto_renew BOOLEAN DEFAULT FALSE`,
    `ALTER TABLE client_contracts ADD COLUMN IF NOT EXISTS renewal_proposed_at TIMESTAMP`,
    `ALTER TABLE client_contracts ADD COLUMN IF NOT EXISTS renewal_status VARCHAR(50) DEFAULT 'not_started'`,
    `ALTER TABLE client_contracts ADD COLUMN IF NOT EXISTS annual_value NUMERIC(10,2)`,

    `CREATE TABLE IF NOT EXISTS contract_renewal_tasks (
      id VARCHAR(255) PRIMARY KEY DEFAULT gen_random_uuid()::text,
      workspace_id VARCHAR(255) NOT NULL,
      contract_id VARCHAR(255) NOT NULL,
      task_type VARCHAR(100) NOT NULL,
      due_date DATE NOT NULL,
      completed_at TIMESTAMP,
      status VARCHAR(50) DEFAULT 'pending',
      trinity_action_taken TEXT,
      owner_notified BOOLEAN DEFAULT FALSE,
      created_at TIMESTAMP DEFAULT NOW()
    )`,

    `CREATE INDEX IF NOT EXISTS idx_crt_workspace ON contract_renewal_tasks(workspace_id)`,
    `CREATE INDEX IF NOT EXISTS idx_crt_contract ON contract_renewal_tasks(contract_id)`,
    `CREATE INDEX IF NOT EXISTS idx_crt_status ON contract_renewal_tasks(workspace_id, status)`,

    // ── MODULE 3/8: Extend pipeline_deals for proposals ────────────────────
    `ALTER TABLE pipeline_deals ADD COLUMN IF NOT EXISTS proposal_type VARCHAR(100) DEFAULT 'new_client'`,
    `ALTER TABLE pipeline_deals ADD COLUMN IF NOT EXISTS competition_known BOOLEAN DEFAULT FALSE`,
    `ALTER TABLE pipeline_deals ADD COLUMN IF NOT EXISTS competitor_names JSONB DEFAULT '[]'`,
    `ALTER TABLE pipeline_deals ADD COLUMN IF NOT EXISTS decision_timeline VARCHAR(255)`,
    `ALTER TABLE pipeline_deals ADD COLUMN IF NOT EXISTS decision_maker_name VARCHAR(255)`,
    `ALTER TABLE pipeline_deals ADD COLUMN IF NOT EXISTS decision_maker_title VARCHAR(255)`,
    `ALTER TABLE pipeline_deals ADD COLUMN IF NOT EXISTS requirements_summary TEXT`,
    `ALTER TABLE pipeline_deals ADD COLUMN IF NOT EXISTS our_differentiators TEXT`,
    `ALTER TABLE pipeline_deals ADD COLUMN IF NOT EXISTS price_per_hour_proposed NUMERIC(8,2)`,
    `ALTER TABLE pipeline_deals ADD COLUMN IF NOT EXISTS estimated_annual_value NUMERIC(12,2)`,
    `ALTER TABLE pipeline_deals ADD COLUMN IF NOT EXISTS loss_reason TEXT`,
    `ALTER TABLE pipeline_deals ADD COLUMN IF NOT EXISTS follow_up_count INTEGER DEFAULT 0`,
    `ALTER TABLE pipeline_deals ADD COLUMN IF NOT EXISTS last_follow_up_at TIMESTAMP`,
    `ALTER TABLE pipeline_deals ADD COLUMN IF NOT EXISTS expected_close_date DATE`,
    `ALTER TABLE pipeline_deals ADD COLUMN IF NOT EXISTS actual_close_date DATE`,
    `ALTER TABLE pipeline_deals ADD COLUMN IF NOT EXISTS converted_to_client_id VARCHAR(255)`,

    // ── MODULE 4: Applicant Tracking System ───────────────────────────────
    `CREATE TABLE IF NOT EXISTS job_postings (
      id VARCHAR(255) PRIMARY KEY DEFAULT gen_random_uuid()::text,
      workspace_id VARCHAR(255) NOT NULL,
      title VARCHAR(500) NOT NULL,
      description TEXT,
      position_type VARCHAR(100) DEFAULT 'unarmed',
      employment_type VARCHAR(100) DEFAULT 'full_time',
      sites JSONB DEFAULT '[]',
      pay_rate_min NUMERIC(8,2),
      pay_rate_max NUMERIC(8,2),
      required_certifications JSONB DEFAULT '[]',
      status VARCHAR(50) DEFAULT 'active',
      applications_count INTEGER DEFAULT 0,
      posted_at TIMESTAMP DEFAULT NOW(),
      closed_at TIMESTAMP,
      created_by VARCHAR(255),
      created_at TIMESTAMP DEFAULT NOW()
    )`,

    `CREATE INDEX IF NOT EXISTS idx_jp_workspace ON job_postings(workspace_id)`,
    `CREATE INDEX IF NOT EXISTS idx_jp_status ON job_postings(workspace_id, status)`,

    `CREATE TABLE IF NOT EXISTS applicants (
      id VARCHAR(255) PRIMARY KEY DEFAULT gen_random_uuid()::text,
      workspace_id VARCHAR(255) NOT NULL,
      job_posting_id VARCHAR(255),
      first_name VARCHAR(255) NOT NULL,
      last_name VARCHAR(255) NOT NULL,
      email VARCHAR(500),
      phone VARCHAR(50),
      address TEXT,
      has_guard_card BOOLEAN DEFAULT FALSE,
      guard_card_number VARCHAR(255),
      guard_card_expiration DATE,
      has_armed_endorsement BOOLEAN DEFAULT FALSE,
      years_experience INTEGER DEFAULT 0,
      prior_employers JSONB DEFAULT '[]',
      applicant_references JSONB DEFAULT '[]',
      applied_at TIMESTAMP DEFAULT NOW(),
      status VARCHAR(100) DEFAULT 'applied',
      trinity_score INTEGER DEFAULT 0,
      trinity_score_rationale TEXT,
      rejection_reason TEXT,
      notes TEXT
    )`,

    `CREATE INDEX IF NOT EXISTS idx_app_workspace ON applicants(workspace_id)`,
    `CREATE INDEX IF NOT EXISTS idx_app_posting ON applicants(job_posting_id)`,
    `CREATE INDEX IF NOT EXISTS idx_app_status ON applicants(workspace_id, status)`,

    `CREATE TABLE IF NOT EXISTS applicant_interviews (
      id VARCHAR(255) PRIMARY KEY DEFAULT gen_random_uuid()::text,
      workspace_id VARCHAR(255) NOT NULL,
      applicant_id VARCHAR(255) NOT NULL,
      scheduled_at TIMESTAMP,
      completed_at TIMESTAMP,
      interviewer_id VARCHAR(255),
      interview_type VARCHAR(50) DEFAULT 'in_person',
      notes TEXT,
      rating INTEGER,
      recommendation VARCHAR(50),
      status VARCHAR(50) DEFAULT 'scheduled',
      created_at TIMESTAMP DEFAULT NOW()
    )`,

    `CREATE INDEX IF NOT EXISTS idx_ai_workspace ON applicant_interviews(workspace_id)`,
    `CREATE INDEX IF NOT EXISTS idx_ai_applicant ON applicant_interviews(applicant_id)`,

    `CREATE TABLE IF NOT EXISTS offer_letters (
      id VARCHAR(255) PRIMARY KEY DEFAULT gen_random_uuid()::text,
      workspace_id VARCHAR(255) NOT NULL,
      applicant_id VARCHAR(255) NOT NULL,
      position VARCHAR(500),
      start_date DATE,
      pay_rate NUMERIC(8,2),
      pay_type VARCHAR(50) DEFAULT 'hourly',
      employment_type VARCHAR(100) DEFAULT 'full_time',
      reporting_to VARCHAR(255),
      offer_sent_at TIMESTAMP,
      offer_expires_at TIMESTAMP,
      offer_accepted_at TIMESTAMP,
      offer_declined_at TIMESTAMP,
      decline_reason TEXT,
      file_path TEXT,
      status VARCHAR(50) DEFAULT 'draft',
      created_at TIMESTAMP DEFAULT NOW()
    )`,

    `CREATE INDEX IF NOT EXISTS idx_ol_workspace ON offer_letters(workspace_id)`,
    `CREATE INDEX IF NOT EXISTS idx_ol_applicant ON offer_letters(applicant_id)`,

    // ── MODULE 5: Training Requirements & Records ──────────────────────────
    `CREATE TABLE IF NOT EXISTS training_requirements (
      id VARCHAR(255) PRIMARY KEY DEFAULT gen_random_uuid()::text,
      workspace_id VARCHAR(255),
      requirement_name VARCHAR(500) NOT NULL,
      requirement_type VARCHAR(100) NOT NULL,
      applies_to_roles JSONB DEFAULT '[]',
      applies_to_positions JSONB DEFAULT '[]',
      applies_to_sites JSONB DEFAULT '[]',
      frequency VARCHAR(100) DEFAULT 'annual',
      frequency_months INTEGER,
      required_hours INTEGER,
      provider_required BOOLEAN DEFAULT FALSE,
      approved_providers JSONB DEFAULT '[]',
      consequence_of_expiry VARCHAR(100) DEFAULT 'warning',
      state_required BOOLEAN DEFAULT FALSE,
      state_code VARCHAR(10),
      regulatory_reference TEXT,
      created_by VARCHAR(255),
      active BOOLEAN DEFAULT TRUE,
      created_at TIMESTAMP DEFAULT NOW()
    )`,

    `CREATE INDEX IF NOT EXISTS idx_tr_workspace ON training_requirements(workspace_id)`,

    `CREATE TABLE IF NOT EXISTS employee_training_records (
      id VARCHAR(255) PRIMARY KEY DEFAULT gen_random_uuid()::text,
      workspace_id VARCHAR(255) NOT NULL,
      employee_id VARCHAR(255) NOT NULL,
      requirement_id VARCHAR(255),
      training_name VARCHAR(500) NOT NULL,
      completion_date DATE,
      expiration_date DATE,
      hours_completed NUMERIC(5,1),
      provider_name VARCHAR(500),
      certificate_number VARCHAR(255),
      certificate_file_path TEXT,
      verified BOOLEAN DEFAULT FALSE,
      verified_by VARCHAR(255),
      verified_at TIMESTAMP,
      status VARCHAR(100) DEFAULT 'current',
      notes TEXT,
      created_at TIMESTAMP DEFAULT NOW()
    )`,

    `CREATE INDEX IF NOT EXISTS idx_etr_workspace ON employee_training_records(workspace_id)`,
    `CREATE INDEX IF NOT EXISTS idx_etr_employee ON employee_training_records(employee_id)`,
    `CREATE INDEX IF NOT EXISTS idx_etr_status ON employee_training_records(workspace_id, status)`,

    `CREATE TABLE IF NOT EXISTS training_scheduled_sessions (
      id VARCHAR(255) PRIMARY KEY DEFAULT gen_random_uuid()::text,
      workspace_id VARCHAR(255) NOT NULL,
      employee_id VARCHAR(255) NOT NULL,
      requirement_id VARCHAR(255),
      scheduled_date DATE NOT NULL,
      provider VARCHAR(500),
      location TEXT,
      status VARCHAR(50) DEFAULT 'scheduled',
      reminder_sent_7_day BOOLEAN DEFAULT FALSE,
      reminder_sent_1_day BOOLEAN DEFAULT FALSE,
      created_by VARCHAR(255),
      created_at TIMESTAMP DEFAULT NOW()
    )`,

    `CREATE INDEX IF NOT EXISTS idx_tss_workspace ON training_scheduled_sessions(workspace_id)`,
    `CREATE INDEX IF NOT EXISTS idx_tss_employee ON training_scheduled_sessions(employee_id)`,

    // ── MODULE 6: Subcontractor Companies ─────────────────────────────────
    `CREATE TABLE IF NOT EXISTS subcontractor_companies (
      id VARCHAR(255) PRIMARY KEY DEFAULT gen_random_uuid()::text,
      workspace_id VARCHAR(255) NOT NULL,
      company_name VARCHAR(500) NOT NULL,
      dba_name VARCHAR(500),
      contact_name VARCHAR(255),
      contact_email VARCHAR(500),
      contact_phone VARCHAR(50),
      company_license_number VARCHAR(255),
      company_license_state VARCHAR(10) DEFAULT 'TX',
      company_license_expiration DATE,
      insurance_coi_path TEXT,
      insurance_expiration DATE,
      insurance_coverage_amount NUMERIC(14,2),
      contract_path TEXT,
      contract_start DATE,
      contract_end DATE,
      payment_terms VARCHAR(255),
      hourly_rate NUMERIC(8,2),
      flat_rate NUMERIC(10,2),
      status VARCHAR(50) DEFAULT 'active',
      notes TEXT,
      created_by VARCHAR(255),
      created_at TIMESTAMP DEFAULT NOW()
    )`,

    `CREATE INDEX IF NOT EXISTS idx_sc_workspace ON subcontractor_companies(workspace_id)`,
    `CREATE INDEX IF NOT EXISTS idx_sc_status ON subcontractor_companies(workspace_id, status)`,

    // ── MODULE 7: Client Satisfaction ─────────────────────────────────────
    `CREATE TABLE IF NOT EXISTS client_satisfaction_records (
      id VARCHAR(255) PRIMARY KEY DEFAULT gen_random_uuid()::text,
      workspace_id VARCHAR(255) NOT NULL,
      client_id VARCHAR(255) NOT NULL,
      check_in_type VARCHAR(100) DEFAULT 'scheduled',
      check_in_date DATE NOT NULL,
      conducted_by VARCHAR(255),
      satisfaction_score NUMERIC(3,1),
      nps_score INTEGER,
      feedback_text TEXT,
      issues_raised JSONB DEFAULT '[]',
      issues_resolved BOOLEAN DEFAULT FALSE,
      follow_up_required BOOLEAN DEFAULT FALSE,
      follow_up_completed_at TIMESTAMP,
      created_at TIMESTAMP DEFAULT NOW()
    )`,

    `CREATE INDEX IF NOT EXISTS idx_csr_workspace ON client_satisfaction_records(workspace_id)`,
    `CREATE INDEX IF NOT EXISTS idx_csr_client ON client_satisfaction_records(client_id)`,

    `CREATE TABLE IF NOT EXISTS client_concerns (
      id VARCHAR(255) PRIMARY KEY DEFAULT gen_random_uuid()::text,
      workspace_id VARCHAR(255) NOT NULL,
      client_id VARCHAR(255) NOT NULL,
      concern_type VARCHAR(100) NOT NULL,
      severity VARCHAR(50) DEFAULT 'moderate',
      description TEXT NOT NULL,
      raised_at TIMESTAMP DEFAULT NOW(),
      raised_by VARCHAR(255),
      assigned_to VARCHAR(255),
      status VARCHAR(50) DEFAULT 'open',
      resolution_notes TEXT,
      resolved_at TIMESTAMP,
      resolved_by VARCHAR(255),
      linked_incident_id VARCHAR(255)
    )`,

    `CREATE INDEX IF NOT EXISTS idx_cc_workspace ON client_concerns(workspace_id)`,
    `CREATE INDEX IF NOT EXISTS idx_cc_client ON client_concerns(client_id)`,
    `CREATE INDEX IF NOT EXISTS idx_cc_status ON client_concerns(workspace_id, status)`,

    // ── MODULE 8: Bid Analytics ────────────────────────────────────────────
    `CREATE TABLE IF NOT EXISTS bid_analytics (
      id VARCHAR(255) PRIMARY KEY DEFAULT gen_random_uuid()::text,
      workspace_id VARCHAR(255) NOT NULL,
      period_start DATE NOT NULL,
      period_end DATE NOT NULL,
      total_bids_submitted INTEGER DEFAULT 0,
      total_bids_won INTEGER DEFAULT 0,
      total_bids_lost INTEGER DEFAULT 0,
      total_bids_no_response INTEGER DEFAULT 0,
      win_rate_pct NUMERIC(5,2) DEFAULT 0,
      average_proposal_value NUMERIC(12,2) DEFAULT 0,
      total_pipeline_value NUMERIC(14,2) DEFAULT 0,
      total_won_value NUMERIC(14,2) DEFAULT 0,
      average_days_to_close NUMERIC(6,1) DEFAULT 0,
      most_common_loss_reason TEXT,
      generated_at TIMESTAMP DEFAULT NOW()
    )`,

    `CREATE INDEX IF NOT EXISTS idx_ba_workspace ON bid_analytics(workspace_id)`,
  ];

  let created = 0;
  let failed = 0;
  for (const stmt of statements) {
    try {
      // CATEGORY C — Raw SQL retained: DDL expansion migration via db.$client | Tables: dynamic | Verified: 2026-03-23
      await db.$client.query(stmt);
      created++;
    } catch (err: any) {
      // Log but don't crash — best-effort
      log.warn(`[ExpansionMigration] Statement warning: ${(err instanceof Error ? err.message : String(err))?.substring(0, 120)}`);
      failed++;
    }
  }

  log.info(`[ExpansionMigration] Done — ${created} statements OK, ${failed} warnings`);
}

// Phase 35H: Equipment tracking column additions (idempotent ADD COLUMN IF NOT EXISTS)
export async function runEquipmentExpansionMigration(): Promise<void> {
  const statements: string[] = [
    `ALTER TABLE equipment_assignments ADD COLUMN IF NOT EXISTS condition_at_checkout VARCHAR(50) DEFAULT 'good'`,
    `ALTER TABLE equipment_assignments ADD COLUMN IF NOT EXISTS damage_notes TEXT`,
    `ALTER TABLE equipment_assignments ADD COLUMN IF NOT EXISTS deduction_amount DECIMAL(10,2)`,
    `ALTER TABLE equipment_assignments ADD COLUMN IF NOT EXISTS is_lost BOOLEAN DEFAULT FALSE`,
    `ALTER TABLE equipment_items ADD COLUMN IF NOT EXISTS item_type VARCHAR(50)`,
    `ALTER TABLE equipment_items ADD COLUMN IF NOT EXISTS low_inventory_threshold INTEGER DEFAULT 1`,
    `ALTER TABLE equipment_items ADD COLUMN IF NOT EXISTS quantity INTEGER DEFAULT 1`,
    `CREATE INDEX IF NOT EXISTS idx_equipment_assignments_employee_active ON equipment_assignments(employee_id, workspace_id) WHERE actual_return_date IS NULL`,
    `CREATE INDEX IF NOT EXISTS idx_equipment_assignments_overdue ON equipment_assignments(expected_return_date) WHERE actual_return_date IS NULL AND expected_return_date IS NOT NULL`,
  ];

  let created = 0;
  let failed = 0;
  for (const stmt of statements) {
    try {
      await db.$client.query(stmt);
      created++;
    } catch (err: any) {
      log.warn(`[EquipmentMigration] Statement warning: ${(err instanceof Error ? err.message : String(err))?.substring(0, 120)}`);
      failed++;
    }
  }
  log.info(`[EquipmentMigration] Done — ${created} statements OK, ${failed} warnings`);
}

/**
 * Phase 35K: TCOLE Session Management Migration
 * Creates training_sessions, training_attendance, training_providers tables.
 */
export async function runTCOLESessionMigration(): Promise<void> {
  const statements: string[] = [
    // ── training_providers ────────────────────────────────────────
    `CREATE TABLE IF NOT EXISTS training_providers (
      id VARCHAR(255) PRIMARY KEY DEFAULT gen_random_uuid()::text,
      workspace_id VARCHAR(255) NOT NULL,
      name VARCHAR(255) NOT NULL,
      contact_name VARCHAR(255),
      contact_email VARCHAR(255),
      contact_phone VARCHAR(50),
      address TEXT,
      website TEXT,
      approved BOOLEAN DEFAULT FALSE,
      tcole_approved BOOLEAN DEFAULT FALSE,
      specialties JSONB DEFAULT '[]',
      notes TEXT,
      created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
    )`,

    `CREATE INDEX IF NOT EXISTS idx_tp_workspace ON training_providers(workspace_id)`,

    // ── training_sessions ─────────────────────────────────────────
    `CREATE TABLE IF NOT EXISTS training_sessions (
      id VARCHAR(255) PRIMARY KEY DEFAULT gen_random_uuid()::text,
      workspace_id VARCHAR(255) NOT NULL,
      title VARCHAR(255) NOT NULL,
      description TEXT,
      training_type VARCHAR(100) NOT NULL,
      required_for VARCHAR(100),
      provider_id VARCHAR(255),
      instructor_name VARCHAR(255),
      location VARCHAR(255),
      session_date TIMESTAMP WITH TIME ZONE NOT NULL,
      duration_hours DECIMAL(5,2) NOT NULL,
      max_attendees INTEGER,
      tcole_hours_credit DECIMAL(5,2) DEFAULT 0,
      status VARCHAR(50) NOT NULL DEFAULT 'scheduled',
      qr_code TEXT,
      certificate_template TEXT,
      created_by VARCHAR(255),
      created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
      updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
    )`,

    `CREATE INDEX IF NOT EXISTS idx_ts_workspace ON training_sessions(workspace_id)`,
    `CREATE INDEX IF NOT EXISTS idx_ts_status ON training_sessions(status)`,
    `CREATE INDEX IF NOT EXISTS idx_ts_date ON training_sessions(session_date)`,

    // ── training_attendance ───────────────────────────────────────
    `CREATE TABLE IF NOT EXISTS training_attendance (
      id VARCHAR(255) PRIMARY KEY DEFAULT gen_random_uuid()::text,
      workspace_id VARCHAR(255) NOT NULL,
      session_id VARCHAR(255) NOT NULL,
      employee_id VARCHAR(255) NOT NULL,
      status VARCHAR(50) NOT NULL DEFAULT 'registered',
      check_in_method VARCHAR(50),
      checked_in_at TIMESTAMP WITH TIME ZONE,
      tcole_hours_awarded DECIMAL(5,2) DEFAULT 0,
      certificate_url TEXT,
      notes TEXT,
      created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
      UNIQUE(session_id, employee_id)
    )`,

    `CREATE INDEX IF NOT EXISTS idx_ta_workspace ON training_attendance(workspace_id)`,
    `CREATE INDEX IF NOT EXISTS idx_ta_session ON training_attendance(session_id)`,
    `CREATE INDEX IF NOT EXISTS idx_ta_employee ON training_attendance(employee_id)`,

    // ── CHECK constraints for enum-like fields ─────────────────────────────
    `DO $$ BEGIN
       IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'training_sessions_status_chk') THEN
         ALTER TABLE training_sessions ADD CONSTRAINT training_sessions_status_chk
           CHECK (status IN ('scheduled','in_progress','completed','cancelled'));
       END IF;
     END $$`,

    `DO $$ BEGIN
       IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'training_attendance_status_chk') THEN
         ALTER TABLE training_attendance ADD CONSTRAINT training_attendance_status_chk
           CHECK (status IN ('registered','attended','absent','excused'));
       END IF;
     END $$`,

    `DO $$ BEGIN
       IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'training_attendance_method_chk') THEN
         ALTER TABLE training_attendance ADD CONSTRAINT training_attendance_method_chk
           CHECK (check_in_method IS NULL OR check_in_method IN ('qr','manual','self_report'));
       END IF;
     END $$`,

    `DO $$ BEGIN
       ALTER TABLE training_sessions DROP CONSTRAINT IF EXISTS training_sessions_type_chk;
       ALTER TABLE training_sessions ADD CONSTRAINT training_sessions_type_chk
         CHECK (training_type IN ('firearms_qualification','de_escalation','tcole_mandated','online','in_house','third_party','first_aid','legal','other'));
     END $$`,

    `DO $$ BEGIN
       ALTER TABLE training_sessions DROP CONSTRAINT IF EXISTS training_sessions_required_for_chk;
       ALTER TABLE training_sessions ADD CONSTRAINT training_sessions_required_for_chk
         CHECK (required_for IS NULL OR required_for IN ('all','armed','unarmed','supervisors','custom'));
     END $$`,

    `CREATE TABLE IF NOT EXISTS tcole_alert_log (
      workspace_id VARCHAR(255) NOT NULL,
      employee_id VARCHAR(255) NOT NULL,
      year INTEGER NOT NULL,
      threshold_days INTEGER NOT NULL,
      sent_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
      PRIMARY KEY (workspace_id, employee_id, year, threshold_days)
    )`
  ];

  let created = 0;
  let failed = 0;
  for (const stmt of statements) {
    try {
      await db.$client.query(stmt);
      created++;
    } catch (err: any) {
      log.warn(`[TCOLEMigration] Statement warning: ${(err instanceof Error ? err.message : String(err))?.substring(0, 120)}`);
      failed++;
    }
  }
  log.info(`[TCOLEMigration] Done — ${created} statements OK, ${failed} warnings`);
}
