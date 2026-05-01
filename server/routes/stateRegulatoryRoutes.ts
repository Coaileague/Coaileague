import { sanitizeError } from '../middleware/errorHandler';
import { Router } from 'express';
import { db } from '../db';
import { pool } from '../db';
import {
  stateRegulatoryConfig,
  postRequirements,
  insertStateRegulatoryConfigSchema,
  insertPostRequirementSchema,
} from '@shared/schema';
import { eq, and, desc } from 'drizzle-orm';
import { requireAuth } from '../auth';
import { hasManagerAccess, type AuthenticatedRequest } from '../rbac';
import { trinityStateContext } from '../services/trinity/trinityStateContextService';
import { trinityWorkforceProtocol } from '../services/trinity/trinityWorkforceProtocolService';
import { getStateConfigStatic } from '../services/compliance/stateRegulatoryKnowledgeBase';
import { typedPool, typedPoolExec } from '../lib/typedSql';
import { createLogger } from '../lib/logger';
const log = createLogger('StateRegulatoryRoutes');


const router = Router();

// ────────────────────────────────────────────────────────────────
// STATE CONTEXT API — Workspace-aware regulatory context
// ────────────────────────────────────────────────────────────────

// GET /api/regulatory/state-context — full state-aware context for this workspace
router.get('/state-context', requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const workspaceId = req.workspaceId;
    if (!workspaceId) return res.status(403).json({ error: 'Workspace context required' });

    const context = await trinityStateContext.getStateAwareContext(workspaceId);
    res.json(context);
  } catch (err: unknown) {
    res.status(500).json({ error: sanitizeError(err) });
  }
});

// GET /api/regulatory/state-context/tax-summary — sales tax summary for invoicing
router.get('/state-context/tax-summary', requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const workspaceId = req.workspaceId;
    if (!workspaceId) return res.status(403).json({ error: 'Workspace context required' });

    const clientStateCode = typeof req.query.clientState === 'string' ? req.query.clientState : undefined;
    const summary = await trinityStateContext.getStateTaxSummaryForInvoice(workspaceId, clientStateCode);
    res.json(summary);
  } catch (err: unknown) {
    res.status(500).json({ error: sanitizeError(err) });
  }
});

// GET /api/regulatory/penal-guidance/:stateCode — all penal code scenarios for a state
router.get('/penal-guidance/:stateCode', requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const { stateCode } = req.params;
    const config = getStateConfigStatic(stateCode.toUpperCase());
    if (!config) return res.status(404).json({ error: `No data for state: ${stateCode}` });

    res.json({
      stateCode: config.stateCode,
      stateName: config.stateName,
      scenarios: config.penalCodeScenarios,
    });
  } catch (err: unknown) {
    res.status(500).json({ error: sanitizeError(err) });
  }
});

// GET /api/regulatory/civil-guidance/:stateCode — civil liability guidance for a state
router.get('/civil-guidance/:stateCode', requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const { stateCode } = req.params;
    const config = getStateConfigStatic(stateCode.toUpperCase());
    if (!config) return res.status(404).json({ error: `No data for state: ${stateCode}` });

    res.json({
      stateCode: config.stateCode,
      stateName: config.stateName,
      guidance: config.civilLiabilityGuidance,
    });
  } catch (err: unknown) {
    res.status(500).json({ error: sanitizeError(err) });
  }
});

// GET /api/regulatory/knowledge-base — all 50 states static config summary
router.get('/knowledge-base', requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const { STATE_REGULATORY_KNOWLEDGE } = await import('../services/compliance/stateRegulatoryKnowledgeBase');
    const summary = STATE_REGULATORY_KNOWLEDGE.map(s => ({
      stateCode: s.stateCode,
      stateName: s.stateName,
      regulatoryBody: s.regulatoryBody,
      regulatoryBodyAcronym: s.regulatoryBodyAcronym,
      portalUrl: s.portalUrl,
      licenseTypeCount: s.licenseTypes.length,
      requiredTrainingHours: s.requiredTrainingHours,
      armedTrainingHours: s.armedTrainingHours,
      licenseRenewalMonths: s.licenseRenewalPeriodMonths,
      continuingEducationRequired: s.continuingEducationRequired,
      continuingEducationHours: s.continuingEducationHours,
      minimumAge: s.minimumAge,
      fallbackToManualVerification: s.fallbackToManualVerification,
      penalScenarioCount: s.penalCodeScenarios.length,
      civilGuidanceCount: s.civilLiabilityGuidance.length,
    }));
    res.json({ count: summary.length, states: summary });
  } catch (err: unknown) {
    res.status(500).json({ error: sanitizeError(err) });
  }
});

// ────────────────────────────────────────────────────────────────
// WORKFORCE PROTOCOL API
// ────────────────────────────────────────────────────────────────

// GET /api/regulatory/workforce/threshold/:employeeId — check 3-in-6-month rule
router.get('/workforce/threshold/:employeeId', requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const workspaceId = req.workspaceId;
    if (!workspaceId) return res.status(403).json({ error: 'Workspace context required' });
    // @ts-expect-error — TS migration: fix in refactoring sprint
    if (!hasManagerAccess(req)) return res.status(403).json({ error: 'Manager access required' });

    const { employeeId } = req.params;
    const result = await trinityWorkforceProtocol.checkDisciplinaryThreshold(workspaceId, employeeId);
    res.json(result);
  } catch (err: unknown) {
    res.status(500).json({ error: sanitizeError(err) });
  }
});

// GET /api/regulatory/workforce/guidance — situation-specific guidance
router.get('/workforce/guidance', requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const workspaceId = req.workspaceId;
    if (!workspaceId) return res.status(403).json({ error: 'Workspace context required' });
    // @ts-expect-error — TS migration: fix in refactoring sprint
    if (!hasManagerAccess(req)) return res.status(403).json({ error: 'Manager access required' });

    const { situation, workerType, severity } = req.query;
    const stateCode = await trinityStateContext.getWorkspaceOperatingState(workspaceId);

    const validSituations = [
      'policy_violation', 'law_violation', 'performance_issue', 'safety_concern',
      'mental_health_concern', 'client_complaint', 'client_sop_violation', 'no_longer_needed'
    ];
    const validWorkerTypes = ['employee', 'contractor'];
    const validSeverities = ['minor', 'moderate', 'critical'];

    if (!situation || !validSituations.includes(situation as string)) {
      return res.status(400).json({ error: `Invalid situation. Valid options: ${validSituations.join(', ')}` });
    }
    if (!workerType || !validWorkerTypes.includes(workerType as string)) {
      return res.status(400).json({ error: `Invalid workerType. Valid options: ${validWorkerTypes.join(', ')}` });
    }

    const guidance = trinityWorkforceProtocol.getGuidanceForSituation(
      situation as any,
      workerType as any,
      stateCode,
      (validSeverities.includes(severity as string) ? severity : 'moderate') as any
    );
    res.json(guidance);
  } catch (err: unknown) {
    res.status(500).json({ error: sanitizeError(err) });
  }
});

// GET /api/regulatory/workforce/protocol/:workerType — full protocol for a worker type
router.get('/workforce/protocol/:workerType', requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const workspaceId = req.workspaceId;
    if (!workspaceId) return res.status(403).json({ error: 'Workspace context required' });
    // @ts-expect-error — TS migration: fix in refactoring sprint
    if (!hasManagerAccess(req)) return res.status(403).json({ error: 'Manager access required' });

    const { workerType } = req.params;
    if (!['employee', 'contractor'].includes(workerType)) {
      return res.status(400).json({ error: 'Invalid workerType. Must be "employee" or "contractor".' });
    }
    const protocol = trinityWorkforceProtocol.getWorkerTypeProtocol(workerType as any);
    res.json(protocol);
  } catch (err: unknown) {
    res.status(500).json({ error: sanitizeError(err) });
  }
});

// GET /api/regulatory/workforce/handbook-context/:employeeId — handbook + SOP availability
router.get('/workforce/handbook-context/:employeeId', requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const workspaceId = req.workspaceId;
    if (!workspaceId) return res.status(403).json({ error: 'Workspace context required' });
    // @ts-expect-error — TS migration: fix in refactoring sprint
    if (!hasManagerAccess(req)) return res.status(403).json({ error: 'Manager access required' });

    const { employeeId } = req.params;
    const clientId = typeof req.query.clientId === 'string' ? req.query.clientId : undefined;

    const context = await trinityWorkforceProtocol.getHandbookSOPContextForEmployee(
      workspaceId, employeeId, clientId
    );
    res.json(context);
  } catch (err: unknown) {
    res.status(500).json({ error: sanitizeError(err) });
  }
});

// ────────────────────────────────────────────────────────────────
// STATE REGULATORY CONFIG
// ────────────────────────────────────────────────────────────────

// GET /api/regulatory/states — all active state configs
router.get('/states', async (_req, res) => {
  try {
    const states = await db
      .select()
      .from(stateRegulatoryConfig)
      .where(eq(stateRegulatoryConfig.active, true))
      .orderBy(stateRegulatoryConfig.stateName);
    res.json(states);
  } catch (err: unknown) {
    res.status(500).json({ error: sanitizeError(err) });
  }
});

// GET /api/regulatory/states/:stateCode
router.get('/states/:stateCode', async (req, res) => {
  try {
    const [state] = await db
      .select()
      .from(stateRegulatoryConfig)
      .where(eq(stateRegulatoryConfig.stateCode, req.params.stateCode.toUpperCase()));
    if (!state) return res.status(404).json({ error: 'State not found' });
    res.json(state);
  } catch (err: unknown) {
    res.status(500).json({ error: sanitizeError(err) });
  }
});

// POST /api/regulatory/states — platform admin creates state config
router.post('/states', requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    if (!(req as any).user?.isPlatformAdmin) return res.status(403).json({ error: 'Platform admin only' });

    const parsed = insertStateRegulatoryConfigSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: parsed.error.errors });

    // @ts-expect-error — TS migration: fix in refactoring sprint
    const [state] = await db.insert(stateRegulatoryConfig).values(parsed.data).returning();
    res.status(201).json(state);
  } catch (err: unknown) {
    res.status(500).json({ error: sanitizeError(err) });
  }
});

// PATCH /api/regulatory/states/:stateCode
router.patch('/states/:stateCode', requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    if (!(req as any).user?.isPlatformAdmin) return res.status(403).json({ error: 'Platform admin only' });

    const [updated] = await db
      .update(stateRegulatoryConfig)
      .set({ ...req.body, updatedAt: new Date() })
      .where(eq(stateRegulatoryConfig.stateCode, req.params.stateCode.toUpperCase()))
      .returning();

    if (!updated) return res.status(404).json({ error: 'State not found' });
    res.json(updated);
  } catch (err: unknown) {
    res.status(500).json({ error: sanitizeError(err) });
  }
});

// ────────────────────────────────────────────────────────────────
// POST REQUIREMENTS
// ────────────────────────────────────────────────────────────────

// GET /api/regulatory/post-requirements?siteId=xxx
router.get('/post-requirements', requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const workspaceId = req.workspaceId;
    if (!workspaceId) return res.status(403).json({ error: 'Workspace context required' });

    const { siteId } = req.query;

    const reqs = await db
      .select()
      .from(postRequirements)
      .where(and(
        eq(postRequirements.workspaceId, workspaceId),
        eq(postRequirements.active, true),
        ...(siteId && typeof siteId === 'string' ? [eq(postRequirements.siteId, siteId)] : []),
      ))
      .orderBy(postRequirements.postName);

    res.json(reqs);
  } catch (err: unknown) {
    res.status(500).json({ error: sanitizeError(err) });
  }
});

// POST /api/regulatory/post-requirements
router.post('/post-requirements', requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const workspaceId = req.workspaceId;
    if (!workspaceId) return res.status(403).json({ error: 'Workspace context required' });
    // @ts-expect-error — TS migration: fix in refactoring sprint
    if (!hasManagerAccess(req)) return res.status(403).json({ error: 'Manager access required' });

    const parsed = insertPostRequirementSchema.safeParse({ ...req.body, workspaceId });
    if (!parsed.success) return res.status(400).json({ error: parsed.error.errors });

    // @ts-expect-error — TS migration: fix in refactoring sprint
    const [req_] = await db.insert(postRequirements).values(parsed.data).returning();
    res.status(201).json(req_);
  } catch (err: unknown) {
    res.status(500).json({ error: sanitizeError(err) });
  }
});

// PATCH /api/regulatory/post-requirements/:id
router.patch('/post-requirements/:id', requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const workspaceId = req.workspaceId;
    if (!workspaceId) return res.status(403).json({ error: 'Workspace context required' });
    // @ts-expect-error — TS migration: fix in refactoring sprint
    if (!hasManagerAccess(req)) return res.status(403).json({ error: 'Manager access required' });

    const [updated] = await db
      .update(postRequirements)
      .set({ ...req.body, updatedAt: new Date() })
      .where(and(eq(postRequirements.id, req.params.id), eq(postRequirements.workspaceId, workspaceId)))
      .returning();

    if (!updated) return res.status(404).json({ error: 'Post requirement not found' });
    res.json(updated);
  } catch (err: unknown) {
    res.status(500).json({ error: sanitizeError(err) });
  }
});

// DELETE /api/regulatory/post-requirements/:id — soft delete
router.delete('/post-requirements/:id', requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const workspaceId = req.workspaceId;
    if (!workspaceId) return res.status(403).json({ error: 'Workspace context required' });
    // @ts-expect-error — TS migration: fix in refactoring sprint
    if (!hasManagerAccess(req)) return res.status(403).json({ error: 'Manager access required' });

    await db
      .update(postRequirements)
      .set({ active: false, updatedAt: new Date() })
      .where(and(eq(postRequirements.id, req.params.id), eq(postRequirements.workspaceId, workspaceId)));

    res.json({ success: true });
  } catch (err: unknown) {
    res.status(500).json({ error: sanitizeError(err) });
  }
});

// ────────────────────────────────────────────────────────────────
// STARTUP SEED — Texas regulatory config (idempotent)
// ────────────────────────────────────────────────────────────────
export async function seedTexasRegulatoryConfig(): Promise<void> {
  try {
    // CATEGORY C — Raw SQL retained: LIMIT | Tables: state_regulatory_config | Verified: 2026-03-23
    const existing = await typedPool(
      `SELECT id FROM state_regulatory_config WHERE state_code = 'TX' LIMIT 1`
    );
    // @ts-expect-error — TS migration: fix in refactoring sprint
    if (existing.length > 0) return;

    // CATEGORY C — Raw SQL retained: ::jsonb | Tables: state_regulatory_config | Verified: 2026-03-23
    await typedPoolExec(`
      INSERT INTO state_regulatory_config (
        id, state_code, state_name, licensing_authority, licensing_authority_url,
        license_types, ce_requirements, renewal_period_months,
        fingerprint_required, background_check_required, minimum_age, notes, active
      ) VALUES (
        gen_random_uuid(), 'TX', 'Texas',
        'Texas Department of Public Safety — Private Security Bureau',
        'https://www.dps.texas.gov/rsd/psb/',
        '[
          {"code":"C3","name":"Level 3 Security Officer","description":"Unarmed security officer","armedAllowed":false,"renewalPeriodMonths":24,"initialTrainingHours":6},
          {"code":"C3AR","name":"Level 3 with Armed Endorsement","description":"Armed security officer with firearm endorsement","armedAllowed":true,"renewalPeriodMonths":24,"initialTrainingHours":40},
          {"code":"C3PR","name":"Personal Protection Officer","description":"Close protection / executive protection officer","armedAllowed":true,"renewalPeriodMonths":24,"initialTrainingHours":40},
          {"code":"C3SR","name":"Commissioned Security Officer","description":"Commissioned peace officer powers for security","armedAllowed":true,"renewalPeriodMonths":24,"initialTrainingHours":40}
        ]'::jsonb,
        '{"hoursPerRenewal":6,"armedAdditionalHours":4,"courseTypes":["Firearms Proficiency","Use of Force","Legal Updates","Ethics"],"notes":"DPS PSB requires annual firearms qualification for armed endorsements. CE must be reported via the PSB online portal."}'::jsonb,
        24, true, true, 18,
        'Texas DPS Private Security Bureau (PSB) regulates all security officers in the state. Commissioned officers must maintain annual firearms proficiency. Level II fingerprinting required for all new applicants.',
        true
      )
      ON CONFLICT (state_code) DO NOTHING
    `);

    log.info('[StateRegulatoryConfig] Texas seed complete');
  } catch (err) {
    log.error('[StateRegulatoryConfig] Texas seed failed (non-fatal):', err);
  }
}

export default router;
