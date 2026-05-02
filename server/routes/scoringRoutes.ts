/**
 * Scoring Routes
 * ==============
 * HTTP surface for the cross-tenant score system.
 *
 *   GET  /api/scoring/officer/me              — authed officer's score + closing history
 *   GET  /api/scoring/officer/:globalOfficerId — manager view (workspace-scoped officer)
 *   POST /api/scoring/officer/recompute       — force recompute (manager+ only)
 *   POST /api/scoring/officer/move-ups        — Trinity move-up recommendations
 *   GET  /api/scoring/tenant                  — current tenant score for the workspace
 *   POST /api/scoring/tenant/snapshot         — owner-only: snapshot tenant score
 *   GET  /api/public/honor-roll               — public Officer of the Month/Year (no auth)
 *
 * The /api/public/honor-roll endpoint is the only public-no-auth read path.
 * It returns PII-light payloads (first name + last initial only) and respects
 * globalOfficers.publicRecognitionConsent.
 */

import { Router } from 'express';
import { z } from 'zod';
import { requireAuth } from '../auth';
import { db, pool } from '../db';
import { eq, and } from 'drizzle-orm';
import {
  employees,
  globalOfficers,
  workspaceMembers,
  tenantScores,
} from '@shared/schema';
import { computeOfficerScore, recomputeAndPersist } from '../services/scoring/scoreEngineService';
import { getClosingScoresForOfficer } from '../services/scoring/closingScoreService';
import { computeTenantScore, snapshotTenantScore } from '../services/scoring/tenantScoreService';
import { recommendMoveUps } from '../services/scoring/moveUpRecommender';
import { getCurrentHonorRoll, selectHonorRollPick } from '../services/scoring/honorRollService';
import {
  linkOfficerToGlobal,
  setPublicRecognitionConsent,
  verifyVeteranStatus,
} from '../services/scoring/officerLinkageService';
import { createLogger } from '../lib/logger';
import { registerLegacyBootstrap } from '../services/legacyBootstrapRegistry';
import { platformActionHub, type ActionRequest, type ActionResult } from '../services/helpai/platformActionHub';

// Trinity action: score.recommend_moveups — surfaces move-up roles for an
// officer based on their cross-tenant score. Subject to Trinity Conscience
// (low-risk advisory) and PublicSafetyGuard at the language layer when the
// recommendation is delivered as chat copy.
platformActionHub.registerAction({
  actionId: 'score.recommend_moveups',
  name: 'Score-Driven Move-Up Recommendations',
  category: 'hr',
  description: 'Recommend better-fit roles across tenants for high-scoring officers',
  requiredRoles: ['manager', 'owner', 'root_admin', 'staff'],
  inputSchema: {
    type: 'object',
    properties: {
      employeeId: { type: 'string' },
      globalOfficerId: { type: 'string' },
      source: { type: 'string', enum: ['unsolicited', 'requested'], default: 'requested' },
      limit: { type: 'integer', default: 3 },
    },
    required: ['employeeId', 'globalOfficerId'],
  } as Record<string, unknown>,
  handler: async (request: ActionRequest): Promise<ActionResult> => {
    const t = Date.now();
    const params = (request.payload ?? {}) as {
      employeeId?: string;
      globalOfficerId?: string;
      source?: 'unsolicited' | 'requested';
      limit?: number;
    };
    const recommendations = await recommendMoveUps({
      globalOfficerId: params.globalOfficerId ?? '',
      currentEmployeeId: params.employeeId ?? '',
      currentWorkspaceId: request.workspaceId ?? '',
      source: params.source ?? 'requested',
      limit: params.limit ?? 3,
    });
    return {
      success: true,
      actionId: 'score.recommend_moveups',
      message: `${recommendations.length} move-up recommendation(s)`,
      executionTimeMs: Date.now() - t,
      data: { recommendations },
    };
  },
});

// Trinity action: score.append_closing — append-only closing-score writer.
// This is the ONLY action authorized to mutate global_officers.closing_scores
// (see trinityConscience.ts Principle 9). Modify/delete variants are blocked.
platformActionHub.registerAction({
  actionId: 'score.append_closing',
  name: 'Append Closing Score',
  category: 'hr',
  description: 'Compute and freeze a final closing score on officer separation',
  requiredRoles: ['owner', 'root_admin'],
  inputSchema: {
    type: 'object',
    properties: {
      employeeId: { type: 'string' },
      globalOfficerId: { type: 'string' },
      separationType: { type: 'string', enum: ['voluntary', 'involuntary', 'layoff', 'end_of_contract', 'retirement', 'other'] },
    },
    required: ['employeeId', 'globalOfficerId', 'separationType'],
  } as Record<string, unknown>,
  handler: async (request: ActionRequest): Promise<ActionResult> => {
    const t = Date.now();
    const params = (request.payload ?? {}) as {
      employeeId?: string;
      globalOfficerId?: string;
      separationType?: 'voluntary' | 'involuntary' | 'layoff' | 'end_of_contract' | 'retirement' | 'other';
    };
    const { computeAndAppendClosingScore } = await import('../services/scoring/closingScoreService');
    const entry = await computeAndAppendClosingScore({
      employeeId: params.employeeId ?? '',
      globalOfficerId: params.globalOfficerId ?? '',
      workspaceId: request.workspaceId ?? '',
      separationType: params.separationType ?? 'other',
    });
    return {
      success: true,
      actionId: 'score.append_closing',
      message: `Closing score frozen at ${entry.score} (${entry.tier})`,
      executionTimeMs: Date.now() - t,
      data: { entry },
    };
  },
});

const log = createLogger('scoringRoutes');
const router = Router();

const OWNER_ROLES = new Set(['org_owner', 'co_owner', 'root_admin', 'owner']);
const MANAGER_ROLES = new Set(['org_owner', 'co_owner', 'root_admin', 'owner', 'org_manager', 'manager', 'department_manager', 'supervisor']);

async function getWorkspaceRole(userId: string, workspaceId: string): Promise<string | null> {
  const [m] = await db
    .select({ role: workspaceMembers.role })
    .from(workspaceMembers)
    .where(and(eq(workspaceMembers.userId, userId), eq(workspaceMembers.workspaceId, workspaceId)))
    .limit(1);
  return m?.role ?? null;
}

async function getMyEmployee(userId: string, workspaceId: string) {
  const [emp] = await db
    .select()
    .from(employees)
    .where(and(eq(employees.userId, userId), eq(employees.workspaceId, workspaceId)))
    .limit(1);
  return emp ?? null;
}

// ────────────────────────────────────────────────────────────────────────────
// /api/scoring/officer/me — authed officer's view
// ────────────────────────────────────────────────────────────────────────────

router.get('/api/scoring/officer/me', requireAuth, async (req, res) => {
  try {
    const userId = req.user?.id;
    const workspaceId = req.workspaceId;
    if (!userId || !workspaceId) return res.status(400).json({ error: 'Missing context' });

    const emp = await getMyEmployee(userId, workspaceId);
    if (!emp) return res.status(404).json({ error: 'No employee record in this workspace' });

    const globalOfficerId = (emp as Record<string, unknown>).globalOfficerId as string | undefined
      ?? (emp as Record<string, unknown>).global_officer_id as string | undefined;
    if (!globalOfficerId) {
      return res.status(404).json({
        error: 'Global officer record not yet linked. SSN fingerprinting required.',
      });
    }

    const [officer] = await db
      .select()
      .from(globalOfficers)
      .where(eq(globalOfficers.id, globalOfficerId))
      .limit(1);
    if (!officer) return res.status(404).json({ error: 'Global officer not found' });

    const closingHistory = await getClosingScoresForOfficer(globalOfficerId);

    res.json({
      currentScore: officer.currentScore,
      tier: officer.currentTier,
      factorBreakdown: officer.scoreFactorBreakdown,
      veteranStatus: officer.veteranStatus,
      veteranVerified: !!officer.veteranVerifiedAt,
      primaryLanguages: officer.primaryLanguages,
      bilingualVerified: officer.bilingualVerified,
      tenureFirstSeenAt: officer.firstSeenAt,
      // Officer sees their own closing history but not raw factor breakdowns of past tenants
      closingHistory: closingHistory.map((c) => ({
        tenantName: c.tenantName,
        score: c.score,
        tier: c.tier,
        separationType: c.separationType,
        separationDate: c.separationDate,
      })),
    });
  } catch (err) {
    log.error('[scoring] /officer/me failed:', err);
    res.status(500).json({ error: 'Failed to load score' });
  }
});

// ────────────────────────────────────────────────────────────────────────────
// /api/scoring/officer/recompute — manager+ recompute for an employee in workspace
// ────────────────────────────────────────────────────────────────────────────

const recomputeSchema = z.object({
  employeeId: z.string().min(1),
});

router.post('/api/scoring/officer/recompute', requireAuth, async (req, res) => {
  try {
    const userId = req.user?.id;
    const workspaceId = req.workspaceId;
    if (!userId || !workspaceId) return res.status(400).json({ error: 'Missing context' });

    const role = await getWorkspaceRole(userId, workspaceId);
    if (!role || !MANAGER_ROLES.has(role)) {
      return res.status(403).json({ error: 'Manager role required' });
    }

    const parsed = recomputeSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: parsed.error.errors[0]?.message });

    const [emp] = await db
      .select()
      .from(employees)
      .where(and(eq(employees.id, parsed.data.employeeId), eq(employees.workspaceId, workspaceId)))
      .limit(1);
    if (!emp) return res.status(404).json({ error: 'Employee not found in workspace' });

    const globalOfficerId = (emp as Record<string, unknown>).globalOfficerId as string | undefined
      ?? (emp as Record<string, unknown>).global_officer_id as string | undefined;
    if (!globalOfficerId) return res.status(400).json({ error: 'Officer not yet linked to global record' });

    const result = await recomputeAndPersist(emp.id, globalOfficerId, workspaceId);
    res.json(result);
  } catch (err) {
    log.error('[scoring] /officer/recompute failed:', err);
    res.status(500).json({ error: 'Failed to recompute score' });
  }
});

// ────────────────────────────────────────────────────────────────────────────
// /api/scoring/officer/move-ups — Trinity move-up recommendations
// ────────────────────────────────────────────────────────────────────────────

router.post('/api/scoring/officer/move-ups', requireAuth, async (req, res) => {
  try {
    const userId = req.user?.id;
    const workspaceId = req.workspaceId;
    if (!userId || !workspaceId) return res.status(400).json({ error: 'Missing context' });

    const emp = await getMyEmployee(userId, workspaceId);
    if (!emp) return res.status(404).json({ error: 'No employee record' });

    const globalOfficerId = (emp as Record<string, unknown>).globalOfficerId as string | undefined
      ?? (emp as Record<string, unknown>).global_officer_id as string | undefined;
    if (!globalOfficerId) return res.json({ recommendations: [] });

    const recommendations = await recommendMoveUps({
      globalOfficerId,
      currentEmployeeId: emp.id,
      currentWorkspaceId: workspaceId,
      source: 'requested',
      limit: 5,
    });
    res.json({ recommendations });
  } catch (err) {
    log.error('[scoring] /officer/move-ups failed:', err);
    res.status(500).json({ error: 'Failed to fetch recommendations' });
  }
});

// ────────────────────────────────────────────────────────────────────────────
// /api/scoring/tenant — current tenant score
// ────────────────────────────────────────────────────────────────────────────

router.get('/api/scoring/tenant', requireAuth, async (req, res) => {
  try {
    const workspaceId = req.workspaceId;
    if (!workspaceId) return res.status(400).json({ error: 'Missing workspace context' });

    // Most recent snapshot, fall back to live compute if none exists.
    const [latest] = await db
      .select()
      .from(tenantScores)
      .where(eq(tenantScores.workspaceId, workspaceId))
      .orderBy(tenantScores.periodEnd)
      .limit(1);

    if (latest) {
      return res.json({ source: 'snapshot', ...latest });
    }
    const live = await computeTenantScore(workspaceId);
    res.json({ source: 'live', ...live });
  } catch (err) {
    log.error('[scoring] /tenant failed:', err);
    res.status(500).json({ error: 'Failed to load tenant score' });
  }
});

// ────────────────────────────────────────────────────────────────────────────
// /api/scoring/officer/link — find-or-create globalOfficer for current officer
// Called by onboarding and HR backfill. Owner+ only because it touches SSN.
// ────────────────────────────────────────────────────────────────────────────

const linkSchema = z.object({
  employeeId: z.string().min(1),
  rawSSN: z.string().min(9),
  legalFirstName: z.string().min(1),
  legalLastName: z.string().min(1),
  dateOfBirth: z.string().optional(),
});

router.post('/api/scoring/officer/link', requireAuth, async (req, res) => {
  try {
    const userId = req.user?.id;
    const workspaceId = req.workspaceId;
    if (!userId || !workspaceId) return res.status(400).json({ error: 'Missing context' });

    const role = await getWorkspaceRole(userId, workspaceId);
    if (!role || !OWNER_ROLES.has(role)) {
      return res.status(403).json({ error: 'Owner role required (handles SSN)' });
    }

    const parsed = linkSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: parsed.error.errors[0]?.message });

    const result = await linkOfficerToGlobal({
      employeeId: parsed.data.employeeId,
      workspaceId,
      rawSSN: parsed.data.rawSSN,
      legalFirstName: parsed.data.legalFirstName,
      legalLastName: parsed.data.legalLastName,
      dateOfBirth: parsed.data.dateOfBirth ?? null,
    });
    // Don't return the fingerprint to the client.
    res.json({ globalOfficerId: result.globalOfficerId, isNew: result.isNew });
  } catch (err) {
    log.error('[scoring] /officer/link failed:', err);
    res.status(500).json({ error: (err as Error).message ?? 'Failed to link officer' });
  }
});

// ────────────────────────────────────────────────────────────────────────────
// /api/scoring/officer/consent — public-recognition opt in/out
// Self-service: officer can toggle their own consent.
// ────────────────────────────────────────────────────────────────────────────

router.post('/api/scoring/officer/consent', requireAuth, async (req, res) => {
  try {
    const userId = req.user?.id;
    const workspaceId = req.workspaceId;
    if (!userId || !workspaceId) return res.status(400).json({ error: 'Missing context' });

    const consent = req.body?.consent === true;
    const emp = await getMyEmployee(userId, workspaceId);
    if (!emp) return res.status(404).json({ error: 'No employee record' });
    const globalOfficerId = (emp as Record<string, unknown>).globalOfficerId as string | undefined;
    if (!globalOfficerId) return res.status(400).json({ error: 'Officer not yet linked' });

    await setPublicRecognitionConsent({ globalOfficerId, consent });
    res.json({ consent });
  } catch (err) {
    log.error('[scoring] /officer/consent failed:', err);
    res.status(500).json({ error: 'Failed to update consent' });
  }
});

// ────────────────────────────────────────────────────────────────────────────
// /api/scoring/officer/veteran/verify — DD-214 review approval
// Manager+ only. Document must already be approved in employeeDocuments.
// ────────────────────────────────────────────────────────────────────────────

const veteranVerifySchema = z.object({
  globalOfficerId: z.string().min(1),
  documentId: z.string().min(1),
});

router.post('/api/scoring/officer/veteran/verify', requireAuth, async (req, res) => {
  try {
    const userId = req.user?.id;
    const workspaceId = req.workspaceId;
    if (!userId || !workspaceId) return res.status(400).json({ error: 'Missing context' });

    const role = await getWorkspaceRole(userId, workspaceId);
    if (!role || !MANAGER_ROLES.has(role)) {
      return res.status(403).json({ error: 'Manager role required' });
    }

    const parsed = veteranVerifySchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: parsed.error.errors[0]?.message });

    const result = await verifyVeteranStatus(parsed.data);
    res.json(result);
  } catch (err) {
    log.error('[scoring] /officer/veteran/verify failed:', err);
    res.status(400).json({ error: (err as Error).message ?? 'Failed to verify' });
  }
});

router.post('/api/scoring/tenant/snapshot', requireAuth, async (req, res) => {
  try {
    const userId = req.user?.id;
    const workspaceId = req.workspaceId;
    if (!userId || !workspaceId) return res.status(400).json({ error: 'Missing context' });

    const role = await getWorkspaceRole(userId, workspaceId);
    if (!role || !OWNER_ROLES.has(role)) {
      return res.status(403).json({ error: 'Owner role required' });
    }

    const result = await snapshotTenantScore(workspaceId);
    res.json(result);
  } catch (err) {
    log.error('[scoring] /tenant/snapshot failed:', err);
    res.status(500).json({ error: 'Failed to snapshot tenant score' });
  }
});

// ────────────────────────────────────────────────────────────────────────────
// /api/public/honor-roll — public Officer of the Month/Year (no auth)
// ────────────────────────────────────────────────────────────────────────────

const publicRouter = Router();

publicRouter.get('/api/public/honor-roll', async (_req, res) => {
  try {
    const data = await getCurrentHonorRoll();
    res.json(data);
  } catch (err) {
    log.error('[scoring] public honor-roll failed:', err);
    res.status(500).json({ error: 'Failed to load honor roll' });
  }
});

publicRouter.post('/api/admin/honor-roll/select', requireAuth, async (req, res) => {
  try {
    const userId = req.user?.id;
    const workspaceId = req.workspaceId;
    if (!userId || !workspaceId) return res.status(400).json({ error: 'Missing context' });

    const role = await getWorkspaceRole(userId, workspaceId);
    if (!role || !OWNER_ROLES.has(role)) {
      return res.status(403).json({ error: 'Owner role required' });
    }

    const award = (req.body?.awardType === 'officer_of_year' ? 'officer_of_year' : 'officer_of_month') as
      'officer_of_month' | 'officer_of_year';
    const pick = await selectHonorRollPick(award);
    res.json({ pick });
  } catch (err) {
    log.error('[scoring] honor-roll/select failed:', err);
    res.status(500).json({ error: 'Failed to select honor roll pick' });
  }
});

// ────────────────────────────────────────────────────────────────────────────
// Bootstrap — create new tables + add employees.global_officer_id column.
// Honors the schema law: NO DROP TABLE. Pure additive.
// ────────────────────────────────────────────────────────────────────────────

registerLegacyBootstrap('scoring', async (p) => {
  await p.query(`
    CREATE TABLE IF NOT EXISTS global_officers (
      id varchar PRIMARY KEY DEFAULT gen_random_uuid()::text,
      ssn_fingerprint varchar NOT NULL UNIQUE,
      legal_first_name varchar NOT NULL,
      legal_last_name varchar NOT NULL,
      date_of_birth date,
      veteran_status boolean DEFAULT false,
      veteran_verified_at timestamptz,
      veteran_document_id varchar,
      primary_languages text[] DEFAULT ARRAY['en']::text[],
      bilingual_verified boolean DEFAULT false,
      current_score integer DEFAULT 75,
      current_tier varchar DEFAULT 'favorable',
      score_factor_breakdown jsonb,
      closing_scores jsonb DEFAULT '[]'::jsonb NOT NULL,
      public_recognition_consent boolean DEFAULT false,
      public_recognition_consent_at timestamptz,
      first_seen_at timestamptz DEFAULT NOW(),
      last_updated_at timestamptz DEFAULT NOW(),
      last_score_recompute_at timestamptz,
      created_at timestamptz DEFAULT NOW(),
      updated_at timestamptz DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS global_officers_score_idx ON global_officers (current_score);
    CREATE INDEX IF NOT EXISTS global_officers_tier_idx ON global_officers (current_tier);
    CREATE INDEX IF NOT EXISTS global_officers_consent_idx ON global_officers (public_recognition_consent);

    CREATE TABLE IF NOT EXISTS tenant_scores (
      id varchar PRIMARY KEY DEFAULT gen_random_uuid()::text,
      workspace_id varchar NOT NULL,
      period_type varchar NOT NULL,
      period_start timestamptz NOT NULL,
      period_end timestamptz NOT NULL,
      overall_score integer NOT NULL,
      tier varchar NOT NULL,
      turnover_score integer,
      pay_competitiveness_score integer,
      work_availability_score integer,
      role_diversity_score integer,
      internal_mobility_score integer,
      license_upkeep_score integer,
      payroll_reliability_score integer,
      aggregate_compliance_score integer,
      raw_inputs jsonb,
      engine_version varchar DEFAULT 'v1.0',
      created_at timestamptz DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS tenant_scores_workspace_idx ON tenant_scores (workspace_id);
    CREATE INDEX IF NOT EXISTS tenant_scores_period_idx ON tenant_scores (workspace_id, period_end);
    CREATE INDEX IF NOT EXISTS tenant_scores_score_idx ON tenant_scores (overall_score);

    CREATE TABLE IF NOT EXISTS honor_roll_selections (
      id varchar PRIMARY KEY DEFAULT gen_random_uuid()::text,
      global_officer_id varchar NOT NULL,
      award_type varchar NOT NULL,
      period_label varchar NOT NULL,
      period_start timestamptz NOT NULL,
      period_end timestamptz NOT NULL,
      score_at_selection integer NOT NULL,
      tier_at_selection varchar,
      months_above_threshold integer,
      featured_workspace_id varchar,
      featured_workspace_name varchar,
      display_first_name varchar NOT NULL,
      display_last_initial varchar(1) NOT NULL,
      photo_consent boolean DEFAULT false,
      photo_url text,
      published_at timestamptz DEFAULT NOW(),
      created_at timestamptz DEFAULT NOW()
    );
    CREATE UNIQUE INDEX IF NOT EXISTS honor_roll_period_award_idx ON honor_roll_selections (award_type, period_label);
    CREATE INDEX IF NOT EXISTS honor_roll_officer_idx ON honor_roll_selections (global_officer_id);
    CREATE INDEX IF NOT EXISTS honor_roll_period_idx ON honor_roll_selections (period_start, period_end);

    -- Cross-tenant linkage on employees. Additive only.
    ALTER TABLE employees ADD COLUMN IF NOT EXISTS global_officer_id varchar;
    CREATE INDEX IF NOT EXISTS employees_global_officer_idx ON employees (global_officer_id);
  `);
});

export { publicRouter };
export default router;
