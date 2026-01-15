/**
 * QuickBooks Phase 3 API Routes
 * Intelligence & Compliance features:
 * - Industry Service Templates
 * - EVV Billing Codes
 * - Multi-Location Rollups
 * - Financial Watchdog
 * - 1099/W-2 Tax Classification
 */

import { Router, Request, Response } from 'express';
import { db } from '../db';
import { sql } from 'drizzle-orm';

const router = Router();

// ============================================================================
// INDUSTRY SERVICE TEMPLATES
// ============================================================================

router.get('/industry-templates', async (req: Request, res: Response) => {
  try {
    const { industry } = req.query;
    
    let query = sql`SELECT * FROM industry_service_templates WHERE is_active = true`;
    if (industry) {
      query = sql`SELECT * FROM industry_service_templates WHERE is_active = true AND industry_key = ${industry as string}`;
    }
    
    const templates = await db.execute(query);
    res.json({
      success: true,
      templates: templates.rows,
      count: templates.rows.length
    });
  } catch (error: any) {
    console.error('[Phase3] Error fetching industry templates:', error);
    res.status(500).json({ error: 'Failed to fetch industry templates', details: error.message });
  }
});

router.get('/industry-templates/industries', async (req: Request, res: Response) => {
  try {
    const industries = await db.execute(sql`
      SELECT DISTINCT industry_key, 
        COUNT(*) as service_count
      FROM industry_service_templates 
      WHERE is_active = true
      GROUP BY industry_key
      ORDER BY industry_key
    `);
    
    res.json({
      success: true,
      industries: industries.rows
    });
  } catch (error: any) {
    console.error('[Phase3] Error fetching industries:', error);
    res.status(500).json({ error: 'Failed to fetch industries', details: error.message });
  }
});

// ============================================================================
// EVV BILLING CODES
// ============================================================================

router.get('/evv/billing-codes', async (req: Request, res: Response) => {
  try {
    const { state } = req.query;
    
    let query = sql`SELECT * FROM evv_billing_codes WHERE is_active = true ORDER BY state_code, billing_code`;
    if (state) {
      query = sql`SELECT * FROM evv_billing_codes WHERE is_active = true AND state_code = ${state as string} ORDER BY billing_code`;
    }
    
    const codes = await db.execute(query);
    res.json({
      success: true,
      billingCodes: codes.rows,
      count: codes.rows.length
    });
  } catch (error: any) {
    console.error('[Phase3] Error fetching EVV billing codes:', error);
    res.status(500).json({ error: 'Failed to fetch EVV billing codes', details: error.message });
  }
});

router.get('/evv/states', async (req: Request, res: Response) => {
  try {
    const states = await db.execute(sql`
      SELECT DISTINCT state_code, 
        COUNT(*) as code_count
      FROM evv_billing_codes 
      WHERE is_active = true
      GROUP BY state_code
      ORDER BY state_code
    `);
    
    res.json({
      success: true,
      states: states.rows
    });
  } catch (error: any) {
    console.error('[Phase3] Error fetching EVV states:', error);
    res.status(500).json({ error: 'Failed to fetch EVV states', details: error.message });
  }
});

// ============================================================================
// MULTI-LOCATION ROLLUPS
// ============================================================================

router.get('/locations', async (req: Request, res: Response) => {
  try {
    const workspaceId = (req as any).workspaceId;
    
    const locations = await db.execute(sql`
      SELECT bl.*, 
        e.full_name as manager_name
      FROM business_locations bl
      LEFT JOIN employees e ON bl.manager_id = e.id
      WHERE bl.workspace_id = ${workspaceId} AND bl.is_active = true
      ORDER BY bl.name
    `);
    
    res.json({
      success: true,
      locations: locations.rows,
      count: locations.rows.length
    });
  } catch (error: any) {
    console.error('[Phase3] Error fetching locations:', error);
    res.status(500).json({ error: 'Failed to fetch locations', details: error.message });
  }
});

router.get('/locations/:id/pnl', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { period } = req.query;
    
    let query = sql`
      SELECT * FROM location_pnl_snapshots 
      WHERE location_id = ${id}
      ORDER BY period_start DESC
      LIMIT 12
    `;
    
    if (period) {
      query = sql`
        SELECT * FROM location_pnl_snapshots 
        WHERE location_id = ${id} AND period_type = ${period as string}
        ORDER BY period_start DESC
        LIMIT 12
      `;
    }
    
    const pnl = await db.execute(query);
    
    res.json({
      success: true,
      snapshots: pnl.rows,
      count: pnl.rows.length
    });
  } catch (error: any) {
    console.error('[Phase3] Error fetching location P&L:', error);
    res.status(500).json({ error: 'Failed to fetch location P&L', details: error.message });
  }
});

// ============================================================================
// FINANCIAL WATCHDOG (Reconciliation)
// ============================================================================

router.get('/reconciliation/runs', async (req: Request, res: Response) => {
  try {
    const workspaceId = (req as any).workspaceId;
    
    const runs = await db.execute(sql`
      SELECT * FROM reconciliation_runs 
      WHERE workspace_id = ${workspaceId}
      ORDER BY started_at DESC
      LIMIT 20
    `);
    
    res.json({
      success: true,
      runs: runs.rows,
      count: runs.rows.length
    });
  } catch (error: any) {
    console.error('[Phase3] Error fetching reconciliation runs:', error);
    res.status(500).json({ error: 'Failed to fetch reconciliation runs', details: error.message });
  }
});

router.get('/reconciliation/findings', async (req: Request, res: Response) => {
  try {
    const workspaceId = (req as any).workspaceId;
    const { status, severity } = req.query;
    
    let query = sql`
      SELECT * FROM reconciliation_findings 
      WHERE workspace_id = ${workspaceId}
      ORDER BY created_at DESC
      LIMIT 100
    `;
    
    if (status) {
      query = sql`
        SELECT * FROM reconciliation_findings 
        WHERE workspace_id = ${workspaceId} AND status = ${status as string}
        ORDER BY created_at DESC
        LIMIT 100
      `;
    }
    
    const findings = await db.execute(query);
    
    res.json({
      success: true,
      findings: findings.rows,
      count: findings.rows.length
    });
  } catch (error: any) {
    console.error('[Phase3] Error fetching reconciliation findings:', error);
    res.status(500).json({ error: 'Failed to fetch reconciliation findings', details: error.message });
  }
});

// ============================================================================
// 1099/W-2 TAX CLASSIFICATION
// ============================================================================

router.get('/tax-classification/history', async (req: Request, res: Response) => {
  try {
    const workspaceId = (req as any).workspaceId;
    const { employeeId, year } = req.query;
    
    let query = sql`
      SELECT wtch.*, e.full_name as employee_name
      FROM worker_tax_classification_history wtch
      JOIN employees e ON wtch.employee_id = e.id
      WHERE wtch.workspace_id = ${workspaceId}
      ORDER BY wtch.created_at DESC
      LIMIT 100
    `;
    
    if (employeeId) {
      query = sql`
        SELECT wtch.*, e.full_name as employee_name
        FROM worker_tax_classification_history wtch
        JOIN employees e ON wtch.employee_id = e.id
        WHERE wtch.workspace_id = ${workspaceId} AND wtch.employee_id = ${employeeId as string}
        ORDER BY wtch.created_at DESC
      `;
    }
    
    const history = await db.execute(query);
    
    res.json({
      success: true,
      history: history.rows,
      count: history.rows.length
    });
  } catch (error: any) {
    console.error('[Phase3] Error fetching tax classification history:', error);
    res.status(500).json({ error: 'Failed to fetch tax classification history', details: error.message });
  }
});

router.get('/tax-classification/1099-candidates', async (req: Request, res: Response) => {
  try {
    const workspaceId = (req as any).workspaceId;
    const year = new Date().getFullYear();
    
    const candidates = await db.execute(sql`
      SELECT DISTINCT ON (e.id) 
        e.id, e.full_name, e.email, e.employment_type,
        wtch.new_classification, wtch.is_1099_eligible, wtch.ai_confidence, wtch.ai_reasoning
      FROM employees e
      LEFT JOIN worker_tax_classification_history wtch ON e.id = wtch.employee_id AND wtch.tax_year = ${year}
      WHERE e.workspace_id = ${workspaceId}
        AND (e.employment_type = 'contractor' OR wtch.is_1099_eligible = true)
      ORDER BY e.id, wtch.created_at DESC
    `);
    
    res.json({
      success: true,
      candidates: candidates.rows,
      count: candidates.rows.length,
      taxYear: year
    });
  } catch (error: any) {
    console.error('[Phase3] Error fetching 1099 candidates:', error);
    res.status(500).json({ error: 'Failed to fetch 1099 candidates', details: error.message });
  }
});

// ============================================================================
// PHASE 3 SUMMARY/HEALTH
// ============================================================================

router.get('/phase3/summary', async (req: Request, res: Response) => {
  try {
    const workspaceId = (req as any).workspaceId;
    
    const [templates, evvCodes, locations, reconRuns, taxHistory] = await Promise.all([
      db.execute(sql`SELECT COUNT(*) as count FROM industry_service_templates WHERE is_active = true`),
      db.execute(sql`SELECT COUNT(*) as count FROM evv_billing_codes WHERE is_active = true`),
      db.execute(sql`SELECT COUNT(*) as count FROM business_locations WHERE workspace_id = ${workspaceId} AND is_active = true`),
      db.execute(sql`SELECT COUNT(*) as count FROM reconciliation_runs WHERE workspace_id = ${workspaceId}`),
      db.execute(sql`SELECT COUNT(*) as count FROM worker_tax_classification_history WHERE workspace_id = ${workspaceId}`)
    ]);
    
    res.json({
      success: true,
      summary: {
        industryTemplates: Number(templates.rows[0]?.count || 0),
        evvBillingCodes: Number(evvCodes.rows[0]?.count || 0),
        businessLocations: Number(locations.rows[0]?.count || 0),
        reconciliationRuns: Number(reconRuns.rows[0]?.count || 0),
        taxClassificationHistory: Number(taxHistory.rows[0]?.count || 0)
      },
      status: 'Phase 3 Intelligence & Compliance features active'
    });
  } catch (error: any) {
    console.error('[Phase3] Error fetching Phase 3 summary:', error);
    res.status(500).json({ error: 'Failed to fetch Phase 3 summary', details: error.message });
  }
});

export default router;
