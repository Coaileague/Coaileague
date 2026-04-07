/**
 * Phase 48 — Onboarding Task Migration
 * ======================================
 * Creates onboarding_task_templates + employee_onboarding_completions tables.
 * Seeds 17 officer tasks (Tier 1-3) and 7 client onboarding tasks.
 * Uses pool.query() directly (drizzle-kit not in PATH).
 */

import { createLogger } from '../lib/logger';
const log = createLogger('onboardingTaskMigration');
import { pool } from '../db';

const OFFICER_TASKS = [
  // ── Tier 1: Must complete before first shift/clock-in ─────────────────────
  { category: 'officer', tier: 1, title: 'Complete W-4 Tax Withholding Form',        description: 'Federal tax withholding elections required before payroll processing.',    due_by_days: 1,  is_required: true,  sort_order: 10,  document_type: 'w4' },
  { category: 'officer', tier: 1, title: 'Complete I-9 Employment Eligibility',       description: 'Work authorization verification required by federal law (Section 1).',    due_by_days: 1,  is_required: true,  sort_order: 20,  document_type: 'i9' },
  { category: 'officer', tier: 1, title: 'Direct Deposit Authorization',              description: 'Bank account details for payroll direct deposit.',                         due_by_days: 1,  is_required: true,  sort_order: 30,  document_type: 'direct_deposit_authorization' },
  { category: 'officer', tier: 1, title: 'Sign Offer Letter / Employment Agreement',  description: 'Review and sign terms of employment.',                                     due_by_days: 1,  is_required: true,  sort_order: 40,  document_type: 'offer_letter' },
  { category: 'officer', tier: 1, title: 'Upload Government-Issued Photo ID',         description: 'Front and back of valid government ID for I-9 verification.',             due_by_days: 1,  is_required: true,  sort_order: 50,  document_type: null },
  { category: 'officer', tier: 1, title: 'Upload Guard Card / PSB License',           description: 'Active guard card required before first post assignment.',                 due_by_days: 1,  is_required: true,  sort_order: 60,  document_type: null },
  { category: 'officer', tier: 1, title: 'Sign Employee Handbook Acknowledgment',     description: 'Acknowledge receipt and understanding of company policies.',               due_by_days: 1,  is_required: true,  sort_order: 70,  document_type: 'handbook_acknowledgment' },
  // ── Tier 2: Complete within first 7 days ──────────────────────────────────
  { category: 'officer', tier: 2, title: 'Sign Drug-Free Workplace Policy',           description: 'Mandatory drug-free workplace acknowledgment.',                           due_by_days: 7,  is_required: true,  sort_order: 80,  document_type: 'drug_free_policy' },
  { category: 'officer', tier: 2, title: 'Sign Employee Responsibility Clause',       description: 'Equipment and uniform responsibility agreement.',                          due_by_days: 7,  is_required: true,  sort_order: 90,  document_type: 'employee_responsibility_clause' },
  { category: 'officer', tier: 2, title: 'Uniform & Equipment Acknowledgment',        description: 'Confirm receipt of issued uniform and equipment.',                         due_by_days: 7,  is_required: true,  sort_order: 100, document_type: 'uniform_equipment_policy' },
  { category: 'officer', tier: 2, title: 'Emergency Contact Information',             description: 'Provide emergency contact and beneficiary details.',                       due_by_days: 7,  is_required: true,  sort_order: 110, document_type: null },
  { category: 'officer', tier: 2, title: 'Complete Firearms Qualification (Armed)',   description: 'Required only for Level 3/4 armed officers — firearm proficiency cert.', due_by_days: 7,  is_required: false, sort_order: 120, document_type: null },
  // ── Tier 3: Complete within first 30 days ─────────────────────────────────
  { category: 'officer', tier: 3, title: 'Upload Social Security Card',               description: 'Social Security card scan for file completion.',                           due_by_days: 30, is_required: false, sort_order: 130, document_type: null },
  { category: 'officer', tier: 3, title: 'Complete DAR Training Module',              description: 'Daily Activity Report system training certification.',                     due_by_days: 30, is_required: true,  sort_order: 140, document_type: null },
  { category: 'officer', tier: 3, title: 'BSIS 40-Hour Training Certificate Upload', description: 'Required for Tier 3 license holders — upload completion cert.',           due_by_days: 30, is_required: false, sort_order: 150, document_type: null },
  { category: 'officer', tier: 3, title: 'Site-Specific Post Orders Acknowledgment', description: 'Read and acknowledge post-specific security protocols.',                   due_by_days: 30, is_required: true,  sort_order: 160, document_type: null },
  { category: 'officer', tier: 3, title: 'Insurance Beneficiary Designation',         description: 'Workers comp and benefits beneficiary form completion.',                   due_by_days: 30, is_required: false, sort_order: 170, document_type: null },
];

const CLIENT_TASKS = [
  { category: 'client', tier: 1, title: 'Sign Master Service Agreement',             description: 'MSA required before services commence.',                                  due_by_days: 1,  is_required: true,  sort_order: 10,  document_type: 'offer_letter' },
  { category: 'client', tier: 1, title: 'Provide Site Address and Access Details',   description: 'Service location, gate codes, and site contact information.',             due_by_days: 1,  is_required: true,  sort_order: 20,  document_type: null },
  { category: 'client', tier: 1, title: 'Confirm Billing Contact and Method',         description: 'Invoice recipient, billing email, payment terms and method.',             due_by_days: 1,  is_required: true,  sort_order: 30,  document_type: null },
  { category: 'client', tier: 2, title: 'Approve Post Orders / Standing Instructions', description: 'Review and approve officer standing orders for the site.',                due_by_days: 7,  is_required: true,  sort_order: 40,  document_type: null },
  { category: 'client', tier: 2, title: 'Designate Authorized Site Contact',          description: 'Identify who officers should contact for site-specific issues.',          due_by_days: 7,  is_required: true,  sort_order: 50,  document_type: null },
  { category: 'client', tier: 3, title: 'Complete Emergency Notification Setup',      description: 'Configure after-hours emergency escalation contacts.',                    due_by_days: 30, is_required: false, sort_order: 60,  document_type: null },
  { category: 'client', tier: 3, title: 'Enable Client Portal Access',               description: 'Activate client portal credentials for report and invoice access.',       due_by_days: 30, is_required: false, sort_order: 70,  document_type: null },
];

export async function runOnboardingTaskMigration() {
  try {
    // 1. Create tables
    await pool.query(`
      CREATE TABLE IF NOT EXISTS onboarding_task_templates (
        id             VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
        workspace_id   VARCHAR,
        category       VARCHAR(32)  NOT NULL,
        tier           INTEGER      NOT NULL DEFAULT 1,
        title          TEXT         NOT NULL,
        description    TEXT,
        due_by_days    INTEGER      NOT NULL DEFAULT 1,
        is_required    BOOLEAN      NOT NULL DEFAULT true,
        is_active      BOOLEAN      NOT NULL DEFAULT true,
        sort_order     INTEGER      NOT NULL DEFAULT 0,
        document_type  VARCHAR(64),
        created_at     TIMESTAMP    NOT NULL DEFAULT now()
      )
    `);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS employee_onboarding_completions (
        id                VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
        employee_id       VARCHAR      NOT NULL,
        workspace_id      VARCHAR      NOT NULL,
        task_template_id  VARCHAR      NOT NULL,
        status            VARCHAR(32)  NOT NULL DEFAULT 'pending',
        completed_at      TIMESTAMP,
        waived_by         VARCHAR,
        waived_reason     TEXT,
        notes             TEXT,
        metadata          JSONB,
        due_date          TIMESTAMP,
        created_at        TIMESTAMP    NOT NULL DEFAULT now(),
        updated_at        TIMESTAMP    NOT NULL DEFAULT now()
      )
    `);

    // 2. Indexes
    await pool.query(`
      CREATE INDEX IF NOT EXISTS ott_workspace_category ON onboarding_task_templates(workspace_id, category);
      CREATE INDEX IF NOT EXISTS ott_tier ON onboarding_task_templates(tier);
      CREATE INDEX IF NOT EXISTS eoc_employee ON employee_onboarding_completions(employee_id);
      CREATE INDEX IF NOT EXISTS eoc_workspace_status ON employee_onboarding_completions(workspace_id, status);
      CREATE INDEX IF NOT EXISTS eoc_template ON employee_onboarding_completions(task_template_id);
    `);

    // 3. Seed default tasks (only if none exist for workspace_id = NULL)
    const { rows: existing } = await pool.query(
      `SELECT COUNT(*) as cnt FROM onboarding_task_templates WHERE workspace_id IS NULL`
    );
    const count = parseInt(existing[0]?.cnt || '0', 10);
    if (count === 0) {
      const allTasks = [...OFFICER_TASKS, ...CLIENT_TASKS];
      for (const task of allTasks) {
        await pool.query(
          `INSERT INTO onboarding_task_templates
             (workspace_id, category, tier, title, description, due_by_days, is_required, is_active, sort_order, document_type)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
          [
            null,
            task.category,
            task.tier,
            task.title,
            task.description,
            task.due_by_days,
            task.is_required,
            true,
            task.sort_order,
            (task as any).document_type ?? null,
          ]
        );
      }
      log.info(`[OnboardingTasks] Seeded ${allTasks.length} default tasks (${OFFICER_TASKS.length} officer, ${CLIENT_TASKS.length} client)`);
    } else {
      log.info(`[OnboardingTasks] Default tasks already seeded (${count} rows) — skipping`);
    }

    log.info('[OnboardingTasks] Schema migration complete');
  } catch (err) {
    log.error('[OnboardingTasks] Migration error:', err);
    // Non-fatal — don't block server startup
  }
}
