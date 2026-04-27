import { sanitizeError } from '../middleware/errorHandler';
import { Router } from "express";
import { db, pool } from "../db";
import { and, desc, eq, inArray, sql } from 'drizzle-orm';
import { requireAuth } from "../auth";
import { requireOwner, requirePlatformAdmin, type AuthenticatedRequest } from "../rbac";
import { typedCount, typedExec, typedQuery } from '../lib/typedSql';
import { quickbooksSyncReceipts, chatMessages as chatMessagesTable } from '@shared/schema';
import { createLogger } from '../lib/logger';
import { PLATFORM } from '../config/platformConfig';
import { isProduction } from '../lib/isProduction';
const log = createLogger('DevRoutes');

const router = Router();

/**
 * POST /api/dev/trinity/fill-unassigned-shifts
 * Autonomous shift-filling demo endpoint.
 * Queries all unassigned published shifts, batches them through the
 * scheduleSmartAI engine (Gemini), applies DB assignments, and returns
 * a full Trinity-style report.
 */
// ─── QB Sandbox Sync Test ─────────────────────────────────────────────────────
// POST /api/dev/qb-sandbox-sync
// Pushes Acme invoices + payroll entries to QB sandbox (real or simulated).
// Pass { forceResync: true } to push even if already synced.
// ─── Stripe Payroll Test ───────────────────────────────────────────────────────
// POST /api/dev/stripe-payroll-test
// Processes Anvil's pending payroll run through Stripe in test mode.
// Shows Stripe Connect transfer details for each employee.
// ─── Stripe Invoice Payment Test ──────────────────────────────────────────────
// POST /api/dev/stripe-invoice-test
// Creates/confirms PaymentIntents for Anvil's pending invoices.
// ─── Financial Integration Status ─────────────────────────────────────────────
// GET /api/dev/financial-integration-status
// Returns current billing provider settings and sync health for both workspaces.
// ── T008: Full Shift Room Bot Simulation — Scenarios A–E ──────────────────────
// ── Expansion Sprint Seed ─────────────────────────────────────────────────
// ── Acme Demo Full Seed (demo-workspace-00000000) ─────────────────────────
// GET: check seed status
// POST: run the seed
// ──────────────────────────────────────────────────────────────────────────────
// ACME COMPLETE SEED — full 20-category sprint for dev-acme-security-ws
// Mounted at /api/dev → full path: POST /api/dev/seed/acme
// ──────────────────────────────────────────────────────────────────────────────
// ──────────────────────────────────────────────────────────────────────────────
// FULL DEVELOPMENT SEED — POST /api/dev/seed/full
// Seeds all 3 test tenants: ACME, Anvil, Test Statewide
// Protected: platform_admin only + production guard
// ──────────────────────────────────────────────────────────────────────────────
// GET: Full status dashboard — GET /api/dev/seed/status
// GET: status check for ACME complete seed — GET /api/dev/seed/acme/status
// ──────────────────────────────────────────────────────────────────────────────
// TRINITY DEMO ACTIONS TRIGGER — POST /api/dev/trinity/trigger-demo-actions
// ──────────────────────────────────────────────────────────────────────────────
// ──────────────────────────────────────────────────────────────────────────────
// EMAIL LOG VIEWER — GET /api/dev/email-log
// ──────────────────────────────────────────────────────────────────────────────
// ──────────────────────────────────────────────────────────────────────────────
// CRON STATUS — GET /api/dev/cron-status
// ──────────────────────────────────────────────────────────────────────────────
// ─── Email System Diagnostic & Live Test ─────────────────────────────────────
// POST /api/test/email
// Sends a real email via Resend and returns full diagnostic details.
// Optionally simulates an inbound email to trinity@coaileague.com.
// Platform-admin only.

// GET /api/test/email/status — Quick Resend credential check (no email sent)
router.post("/demo-tenant-seed", requirePlatformAdmin, async (_req: AuthenticatedRequest, res) => {
  try {
    const { seedDemoTenant } = await import("../services/demoTenantSeed");
    const result = await seedDemoTenant();
    if (!result.success) return res.status(500).json(result);
    res.json(result);
  } catch (err: any) {
    log.error('[DevRoutes] demo-tenant-seed failed:', err?.message);
    res.status(500).json({ error: err?.message || 'Demo tenant seed failed' });
  }
});

/**
 * POST /api/dev/compliance-snapshot/:workspaceId — Readiness Section 17
 * Takes a compliance-score snapshot and fires an owner notification if
 * the score dropped ≥ 10 points vs the prior snapshot. Typically run by
 * a nightly cron, exposed here for admin-triggered verification.
 */
router.post("/compliance-snapshot/:workspaceId", requirePlatformAdmin, async (req: AuthenticatedRequest, res) => {
  try {
    const { snapshotAndMonitor } = await import("../services/complianceScoreMonitor");
    const result = await snapshotAndMonitor(req.params.workspaceId);
    res.json(result);
  } catch (err: any) {
    log.error('[DevRoutes] compliance-snapshot failed:', err?.message);
    res.status(500).json({ error: err?.message || 'Compliance snapshot failed' });
  }
});

/**
 * POST /api/dev/seed-multi-state-regulatory — Readiness Section 24
 * Adds California (BSIS) + Florida (DACS-DOL) rows to compliance_states.
 * Idempotent via ON CONFLICT(state_code) DO NOTHING. Texas is already
 * seeded elsewhere.
 */
router.post("/seed-multi-state-regulatory", requirePlatformAdmin, async (_req: AuthenticatedRequest, res) => {
  try {
    const { seedMultiStateRegulatory } = await import("../services/multiStateRegulatorySeed");
    const result = await seedMultiStateRegulatory();
    res.json(result);
  } catch (err: any) {
    log.error('[DevRoutes] multi-state seed failed:', err?.message);
    res.status(500).json({ error: err?.message || 'Multi-state seed failed' });
  }
});

/**
 * POST /api/dev/retention-scan — Readiness Section 27 #11
 * Runs the pure-function retention policy from §23 across every
 * workspace and returns the non-retain decisions. Dry-run only; an
 * archival/deletion executor is a separate (non-engineering-in-this-
 * branch) step. Called manually from platform-ops UI; scheduled
 * monthly via cron when wired.
 */
router.post("/retention-scan", requirePlatformAdmin, async (_req: AuthenticatedRequest, res) => {
  try {
    const { runRetentionScan } = await import("../services/retentionPolicyService");
    const result = await runRetentionScan();
    res.json(result);
  } catch (err: any) {
    log.error('[DevRoutes] retention-scan failed:', err?.message);
    res.status(500).json({ error: err?.message || 'Retention scan failed' });
  }
});

// ──────────────────────────────────────────────────────────────────────────────
// FULL SYSTEM STRESS TEST — POST /api/dev/stress-test
// Runs all 14 phases: DB integrity, security, financials, Trinity, billing,
// scheduling, communications, compliance, resilience, production readiness.
// Returns pass/fail for every check. Platform admin only. Dev only.
// ──────────────────────────────────────────────────────────────────────────────
// GET /api/dev/stress-test/quick — fast health check (DB + auth + financials only)
// ══════════════════════════════════════════════════════════════════════════════
// LIVE SYSTEM STRESS TEST — POST /api/dev/live-stress-test
// Fires REAL workflows: emails via Resend, Trinity staffing, invoice creation,
// payroll, SMS via Twilio, push notifications, Stripe test transactions.
// Everything persists to DB and produces real observable outcomes.
// Platform admin only. Development only.
// ══════════════════════════════════════════════════════════════════════════════
export default router;
