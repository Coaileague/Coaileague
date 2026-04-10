/**
 * QuickBooks Phase 3 API Routes
 * Intelligence & Compliance features:
 * - Industry Service Templates
 * - EVV Billing Codes
 * - Multi-Location Rollups
 * - Financial Watchdog
 * - 1099/W-2 Tax Classification
 */

import { sanitizeError } from '../middleware/errorHandler';
import { Router, Request, Response } from 'express';
import { requireAuth } from '../auth';
import { requireManager, AuthenticatedRequest } from '../rbac';
import { db } from '../db';
import { eq, and, desc, sql, count, inArray } from 'drizzle-orm';
import { typedCount, typedQuery } from '../lib/typedSql';
import { industryServiceTemplates } from '@shared/schema/domains/orgs';
import { evvBillingCodes, reconciliationRuns, locationPnlSnapshots, reconciliationFindings } from '@shared/schema/domains/billing';
import { businessLocations } from '@shared/schema/domains/clients';
import { workerTaxClassificationHistory, employees } from '@shared/schema';
import { createLogger } from '../lib/logger';
const log = createLogger('QuickbooksPhase3Routes');


const router = Router();

// ============================================================================
// INDUSTRY SERVICE TEMPLATES
// ============================================================================

router.get('/industry-templates', requireAuth, async (req: Request, res: Response) => {
  try {
    const { industry } = req.query;
    
    const conditions = [eq(industryServiceTemplates.isActive, true)];
    if (industry) {
      conditions.push(eq(industryServiceTemplates.industryKey, industry as string));
    }
    
    const templates = await db
      .select()
      .from(industryServiceTemplates)
      .where(and(...conditions));

    res.json({
      success: true,
      templates,
      count: templates.length
    });
  } catch (error: unknown) {
    log.error('[Phase3] Error fetching industry templates:', error);
    res.status(500).json({ error: 'Failed to fetch industry templates', details: sanitizeError(error) });
  }
});

router.get('/industry-templates/industries', requireAuth, async (req: Request, res: Response) => {
  try {
    // CATEGORY C — Raw SQL retained: GROUP BY | Tables: industry_service_templates | Verified: 2026-03-23
    const industries = await typedQuery(sql`
      SELECT DISTINCT industry_key, 
        COUNT(*) as service_count
      FROM industry_service_templates 
      WHERE is_active = true
      GROUP BY industry_key
      ORDER BY industry_key
    `);
    
    res.json({
      success: true,
      industries: industries
    });
  } catch (error: unknown) {
    log.error('[Phase3] Error fetching industries:', error);
    res.status(500).json({ error: 'Failed to fetch industries', details: sanitizeError(error) });
  }
});

// ============================================================================
// EVV BILLING CODES
// ============================================================================

router.get('/evv/billing-codes', requireAuth, async (req: Request, res: Response) => {
  try {
    const { state } = req.query;
    
    const conditions = [eq(evvBillingCodes.isActive, true)];
    if (state) {
      conditions.push(eq(evvBillingCodes.stateCode, state as string));
    }
    
    const codes = await db
      .select()
      .from(evvBillingCodes)
      .where(and(...conditions))
      .orderBy(evvBillingCodes.stateCode, evvBillingCodes.billingCode);

    res.json({
      success: true,
      billingCodes: codes,
      count: codes.length
    });
  } catch (error: unknown) {
    log.error('[Phase3] Error fetching EVV billing codes:', error);
    res.status(500).json({ error: 'Failed to fetch EVV billing codes', details: sanitizeError(error) });
  }
});

router.get('/evv/states', requireAuth, async (req: Request, res: Response) => {
  try {
    // CATEGORY C — Raw SQL retained: GROUP BY | Tables: evv_billing_codes | Verified: 2026-03-23
    const states = await typedQuery(sql`
      SELECT DISTINCT state_code, 
        COUNT(*) as code_count
      FROM evv_billing_codes 
      WHERE is_active = true
      GROUP BY state_code
      ORDER BY state_code
    `);
    
    res.json({
      success: true,
      states: states
    });
  } catch (error: unknown) {
    log.error('[Phase3] Error fetching EVV states:', error);
    res.status(500).json({ error: 'Failed to fetch EVV states', details: sanitizeError(error) });
  }
});

// ============================================================================
// MULTI-LOCATION ROLLUPS
// ============================================================================

router.get('/locations', requireAuth, async (req: Request, res: Response) => {
  try {
    const workspaceId = req.workspaceId || req.user?.currentWorkspaceId;
        if (!workspaceId) return res.status(403).json({ error: 'Workspace context required' });
    
    // Converted to Drizzle ORM: LEFT JOIN → leftJoin
    const locationsData = await db
      .select({
        id: businessLocations.id,
        workspaceId: businessLocations.workspaceId,
        name: businessLocations.name,
        isActive: businessLocations.isActive,
        managerId: businessLocations.managerId,
        managerName: sql<string>`CONCAT(${employees.firstName}, ' ', ${employees.lastName})`
      })
      .from(businessLocations)
      .leftJoin(employees, eq(businessLocations.managerId, employees.id))
      .where(and(
        eq(businessLocations.workspaceId, workspaceId),
        eq(businessLocations.isActive, true)
      ))
      .orderBy(businessLocations.name);
    
    res.json({
      success: true,
      locations: locationsData,
      count: locationsData.length
    });
  } catch (error: unknown) {
    log.error('[Phase3] Error fetching locations:', error);
    res.status(500).json({ error: 'Failed to fetch locations', details: sanitizeError(error) });
  }
});

router.get('/locations/:id/pnl', requireAuth, async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { period } = req.query;
    
    const conditions = [eq(locationPnlSnapshots.locationId, id)];
    if (period) {
      conditions.push(eq(locationPnlSnapshots.periodType, period as string));
    }
    
    const snapshots = await db
      .select()
      .from(locationPnlSnapshots)
      .where(and(...conditions))
      .orderBy(desc(locationPnlSnapshots.periodStart))
      .limit(12);

    res.json({
      success: true,
      snapshots,
      count: snapshots.length
    });
  } catch (error: unknown) {
    log.error('[Phase3] Error fetching location P&L:', error);
    res.status(500).json({ error: 'Failed to fetch location P&L', details: sanitizeError(error) });
  }
});

// ============================================================================
// FINANCIAL WATCHDOG (Reconciliation)
// ============================================================================

router.get('/reconciliation/runs', requireAuth, async (req: Request, res: Response) => {
  try {
    const workspaceId = req.workspaceId || req.user?.currentWorkspaceId;
        if (!workspaceId) return res.status(403).json({ error: 'Workspace context required' });
    
    const runs = await db
      .select()
      .from(reconciliationRuns)
      .where(eq(reconciliationRuns.workspaceId, workspaceId))
      .orderBy(desc(reconciliationRuns.startedAt))
      .limit(20);
    
    res.json({
      success: true,
      runs,
      count: runs.length
    });
  } catch (error: unknown) {
    log.error('[Phase3] Error fetching reconciliation runs:', error);
    res.status(500).json({ error: 'Failed to fetch reconciliation runs', details: sanitizeError(error) });
  }
});

router.get('/reconciliation/findings', requireAuth, async (req: Request, res: Response) => {
  try {
    const workspaceId = req.workspaceId || req.user?.currentWorkspaceId;
        if (!workspaceId) return res.status(403).json({ error: 'Workspace context required' });
    const { status: statusFilter } = req.query;
    
    const conditions = [eq(reconciliationFindings.workspaceId, workspaceId)];
    if (statusFilter) {
      conditions.push(eq(reconciliationFindings.status, statusFilter as string));
    }
    
    const findings = await db
      .select()
      .from(reconciliationFindings)
      .where(and(...conditions))
      .orderBy(desc(reconciliationFindings.createdAt))
      .limit(100);
    
    res.json({
      success: true,
      findings,
      count: findings.length
    });
  } catch (error: unknown) {
    log.error('[Phase3] Error fetching reconciliation findings:', error);
    res.status(500).json({ error: 'Failed to fetch reconciliation findings', details: sanitizeError(error) });
  }
});

// ============================================================================
// 1099/W-2 TAX CLASSIFICATION
// ============================================================================

router.get('/tax-classification/history', requireAuth, async (req: Request, res: Response) => {
  try {
    const workspaceId = req.workspaceId || req.user?.currentWorkspaceId;
        if (!workspaceId) return res.status(403).json({ error: 'Workspace context required' });
    const { employeeId, year } = req.query;
    
    // Converted to Drizzle ORM: LEFT JOIN → leftJoin
    const history = await db.select({
      id: (await import('@shared/schema')).workerTaxClassificationHistory.id,
      employeeId: (await import('@shared/schema')).workerTaxClassificationHistory.employeeId,
      workspaceId: (await import('@shared/schema')).workerTaxClassificationHistory.workspaceId,
      taxYear: (await import('@shared/schema')).workerTaxClassificationHistory.taxYear,
      oldClassification: (await import('@shared/schema')).workerTaxClassificationHistory.newClassification,
      newClassification: (await import('@shared/schema')).workerTaxClassificationHistory.newClassification,
      is1099Eligible: (await import('@shared/schema')).workerTaxClassificationHistory.is1099Eligible,
      aiConfidence: (await import('@shared/schema')).workerTaxClassificationHistory.aiConfidence,
      aiReasoning: (await import('@shared/schema')).workerTaxClassificationHistory.aiReasoning,
      createdAt: (await import('@shared/schema')).workerTaxClassificationHistory.createdAt,
      employeeName: sql<string>`CONCAT(${employees.firstName}, ' ', ${employees.lastName})`
    })
    .from((await import('@shared/schema')).workerTaxClassificationHistory)
    // @ts-expect-error — TS migration: fix in refactoring sprint
    .join(employees, eq((await import('@shared/schema')).workerTaxClassificationHistory.employeeId, employees.id))
    .where(and(
      eq((await import('@shared/schema')).workerTaxClassificationHistory.workspaceId, workspaceId),
      employeeId ? eq((await import('@shared/schema')).workerTaxClassificationHistory.employeeId, employeeId as string) : undefined
    ))
    .orderBy(desc((await import('@shared/schema')).workerTaxClassificationHistory.createdAt))
    .limit(100);
    
    res.json({
      success: true,
      history,
      count: history.length
    });
  } catch (error: unknown) {
    log.error('[Phase3] Error fetching tax classification history:', error);
    res.status(500).json({ error: 'Failed to fetch tax classification history', details: sanitizeError(error) });
  }
});

router.get('/tax-classification/1099-candidates', requireAuth, async (req: Request, res: Response) => {
  try {
    const workspaceId = req.workspaceId || req.user?.currentWorkspaceId;
        if (!workspaceId) return res.status(403).json({ error: 'Workspace context required' });
    const year = new Date().getFullYear();
    
    // CATEGORY C — Raw SQL retained: DISTINCT ON — "DISTINCT ON has no Drizzle equivalent" | Tables: employees, worker_tax_classification_history | Verified: 2026-03-23
    const candidates = await typedQuery(sql`
      SELECT DISTINCT ON (e.id)
        e.id, CONCAT(e.first_name, ' ', e.last_name) AS full_name, e.email, e.worker_type AS employment_type,
        wtch.new_classification, wtch.is_1099_eligible, wtch.ai_confidence, wtch.ai_reasoning
      FROM employees e
      LEFT JOIN worker_tax_classification_history wtch ON e.id = wtch.employee_id AND wtch.tax_year = ${year}
      WHERE e.workspace_id = ${workspaceId}
        AND (e.worker_type = 'contractor' OR wtch.is_1099_eligible = true)
      ORDER BY e.id, wtch.created_at DESC
    `);
    
    res.json({
      success: true,
      candidates: candidates,
      count: candidates.length,
      taxYear: year
    });
  } catch (error: unknown) {
    log.error('[Phase3] Error fetching 1099 candidates:', error);
    res.status(500).json({ error: 'Failed to fetch 1099 candidates', details: sanitizeError(error) });
  }
});

// ============================================================================
// PHASE 3 SUMMARY/HEALTH
// ============================================================================

router.get('/phase3/summary', requireAuth, async (req: Request, res: Response) => {
  try {
    const workspaceId = req.workspaceId || req.user?.currentWorkspaceId;
        if (!workspaceId) return res.status(403).json({ error: 'Workspace context required' });
    
    const [templates, evvCodes, locations, reconRuns, taxHistory] = await Promise.all([
      // CATEGORY C — Raw SQL retained: Count( | Tables: industry_service_templates | Verified: 2026-03-23
      typedCount(sql`SELECT COUNT(*) as count FROM industry_service_templates WHERE is_active = true`),
      // CATEGORY C — Raw SQL retained: Count( | Tables: evv_billing_codes | Verified: 2026-03-23
      typedCount(sql`SELECT COUNT(*) as count FROM evv_billing_codes WHERE is_active = true`),
      // CATEGORY C — Raw SQL retained: Count( | Tables: business_locations | Verified: 2026-03-23
      typedCount(sql`SELECT COUNT(*) as count FROM business_locations WHERE workspace_id = ${workspaceId} AND is_active = true`),
      // CATEGORY C — Raw SQL retained: Count( | Tables: reconciliation_runs | Verified: 2026-03-23
      typedCount(sql`SELECT COUNT(*) as count FROM reconciliation_runs WHERE workspace_id = ${workspaceId}`),
      // CATEGORY C — Raw SQL retained: Count( | Tables: worker_tax_classification_history | Verified: 2026-03-23
      typedCount(sql`SELECT COUNT(*) as count FROM worker_tax_classification_history WHERE workspace_id = ${workspaceId}`)
    ]);
    
    res.json({
      success: true,
      summary: {
        industryTemplates: Number((templates as any).rows[0]?.count || 0),
        evvBillingCodes: Number((evvCodes as any).rows[0]?.count || 0),
        businessLocations: Number((locations as any).rows[0]?.count || 0),
        reconciliationRuns: Number((reconRuns as any).rows[0]?.count || 0),
        taxClassificationHistory: Number((taxHistory as any).rows[0]?.count || 0)
      },
      status: 'Phase 3 Intelligence & Compliance features active'
    });
  } catch (error: unknown) {
    log.error('[Phase3] Error fetching Phase 3 summary:', error);
    res.status(500).json({ error: 'Failed to fetch Phase 3 summary', details: sanitizeError(error) });
  }
});

export default router;
