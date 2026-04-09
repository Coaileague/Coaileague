import { Router, Request, Response } from "express";
import { z } from "zod";
import { requireAuth } from "../../auth";
import { hasManagerAccess, hasPlatformWideAccess, requireManager, requireAdmin } from "../../rbac";
import { enforceAuditorSession } from "../../middleware/auditorGuard";
import { complianceScoringBridge, COMPLIANCE_POINT_RULES } from "../../services/compliance/complianceScoringBridge";
import { employeeDocumentOnboardingService } from "../../services/employeeDocumentOnboardingService";
import { db, pool } from "../../db";
import {
  coaileagueEmployeeProfiles,
  employees,
  employeeEventLog,
  employeeDocuments,
  employeeBehaviorScores,
} from '@shared/schema';
import { eq, and, desc, sql } from "drizzle-orm";
import crypto from "crypto";
import { createLogger } from '../../lib/logger';
const log = createLogger('ComplianceEnforcement');


const grievanceAdjustmentSchema = z.object({
  employeeId: z.string().min(1),
  adjustmentPoints: z.number(),
  grievanceId: z.string().min(1),
  reason: z.string().min(1).max(2000),
});

const hiringScoreAuthSchema = z.object({
  purpose: z.string().min(10).max(2000),
});

const crossOrgHiringSchema = z.object({
  employeeId: z.string().min(1),
  purpose: z.string().min(1).max(2000),
});
import {
  STATE_COMPLIANCE_CONFIGS,
  getStateComplianceConfig,
  getStateRequiredDocuments,
  getSupportedStates,
} from "../../services/compliance/stateComplianceConfig";

// DB-backed compliance authorization tokens (replaces lost-on-restart in-memory Map)
async function setComplianceAuthToken(token: string, data: {
  requestingWorkspaceId: string; requestedBy: string;
  employeeId: string; purpose: string; expiresAt: Date;
}): Promise<void> {
  await pool.query(
    `INSERT INTO compliance_authorization_tokens
       (token, requesting_workspace_id, requested_by, employee_id, purpose, expires_at)
     VALUES ($1,$2,$3,$4,$5,$6)
     ON CONFLICT (token) DO NOTHING`,
    [token, data.requestingWorkspaceId, data.requestedBy, data.employeeId, data.purpose, data.expiresAt]
  );
  // Purge expired tokens on every write
  await pool.query(`DELETE FROM compliance_authorization_tokens WHERE expires_at < NOW()`);
}

async function getComplianceAuthToken(token: string): Promise<{
  requestingWorkspaceId: string; requestedBy: string;
  employeeId: string; purpose: string; expiresAt: Date;
} | null> {
  const r = await pool.query(
    `SELECT requesting_workspace_id, requested_by, employee_id, purpose, expires_at
     FROM compliance_authorization_tokens
     WHERE token = $1 AND expires_at > NOW() AND revoked = false
     LIMIT 1`,
    [token]
  );
  if (!r.rows.length) return null;
  const row = r.rows[0];
  return {
    requestingWorkspaceId: row.requesting_workspace_id,
    requestedBy: row.requested_by,
    employeeId: row.employee_id,
    purpose: row.purpose,
    expiresAt: new Date(row.expires_at),
  };
}

async function deleteComplianceAuthToken(token: string): Promise<void> {
  await pool.query(`DELETE FROM compliance_authorization_tokens WHERE token = $1`, [token]);
}

function requireManagerRole(req: Request, res: Response, next: Function) {
  const workspaceRole = req.workspaceRole;
  const platformRole = req.platformRole;
  if (hasPlatformWideAccess(platformRole) || hasManagerAccess(workspaceRole)) {
    return next();
  }
  return res.status(403).json({ success: false, error: "Manager or higher access required" });
}

if (!process.env.SESSION_SECRET) {
  throw new Error('[Compliance Enforcement] SESSION_SECRET env var is required for HMAC token signing. Server cannot start without it.');
}
const AUDITOR_SECRET = process.env.SESSION_SECRET;
function verifyAuditorToken(token: string): string | null {
  try {
    const decoded = Buffer.from(token, 'base64url').toString('utf8');
    const parts = decoded.split(':');
    if (parts.length !== 3) return null;
    const [auditorId, expiresStr, sig] = parts;
    if (Date.now() > parseInt(expiresStr, 10)) return null;
    const payload = `${auditorId}:${expiresStr}`;
    const expected = crypto.createHmac('sha256', AUDITOR_SECRET).update(payload).digest('hex');
    if (!crypto.timingSafeEqual(Buffer.from(sig, 'hex'), Buffer.from(expected, 'hex'))) return null;
    return auditorId;
  } catch {
    return null;
  }
}

function resolveAuditorId(req: Request): string | null {
  const authHeader = (req.headers.authorization ?? '') as string;
  const headerToken = req.headers['x-auditor-token'] as string | undefined;
  let rawToken: string | null = null;
  if (authHeader.startsWith('Bearer ')) rawToken = authHeader.slice(7);
  else if (headerToken) rawToken = headerToken;
  if (rawToken) return verifyAuditorToken(rawToken);
  return null;
}

async function requireAuditorOrStandardAuth(req: Request, res: Response, next: Function) {
  const auditorId = resolveAuditorId(req);
  if (auditorId) {
    req.auditorId = auditorId;
    // Property 1 + 2: enforce DB-level isActive and expiresAt
    return enforceAuditorSession(req, res, next);
  }
  requireAuth(req, res, next);
}

async function requireAuditorOrManagerAuth(req: Request, res: Response, next: Function) {
  const auditorId = resolveAuditorId(req);
  if (auditorId) {
    req.auditorId = auditorId;
    // Property 1 + 2: enforce DB-level isActive and expiresAt
    return enforceAuditorSession(req, res, next);
  }
  requireAuth(req, res, () => requireManagerRole(req, res, next));
}

const router = Router();

router.get("/audit", requireAuth, requireManager, async (req: Request, res: Response) => {
  try {
    const workspaceId = req.workspaceId || (req.user)?.currentWorkspaceId;
    if (!workspaceId) {
      return res.status(400).json({ success: false, error: "Workspace required" });
    }

    const result = await complianceScoringBridge.runComplianceAudit(workspaceId);
    res.json({ success: true, ...result });
  } catch (error) {
    log.error("[Compliance Enforcement] Audit error:", error);
    res.status(500).json({ success: false, error: "Failed to run compliance audit" });
  }
});

router.get("/employee/:employeeId/eligibility", requireAuth, requireManager, async (req: Request, res: Response) => {
  try {
    const { employeeId } = req.params;
    const result = await employeeDocumentOnboardingService.checkWorkEligibility(employeeId);
    res.json({ success: true, ...result });
  } catch (error) {
    log.error("[Compliance Enforcement] Eligibility check error:", error);
    res.status(500).json({ success: false, error: "Failed to check eligibility" });
  }
});

router.post("/employee/:employeeId/check-suspension", requireAuth, requireManager, async (req: Request, res: Response) => {
  try {
    const workspaceId = req.workspaceId || (req.user)?.currentWorkspaceId;
    const { employeeId } = req.params;

    if (!workspaceId) {
      return res.status(400).json({ success: false, error: "Workspace required" });
    }

    const wasSuspended = await complianceScoringBridge.checkAndEnforceSuspension(employeeId, workspaceId);
    const wasLifted = !wasSuspended ? await complianceScoringBridge.checkAndLiftSuspension(employeeId, workspaceId) : false;

    res.json({
      success: true,
      action: wasSuspended ? 'suspended' : wasLifted ? 'reinstated' : 'no_change',
    });
  } catch (error) {
    log.error("[Compliance Enforcement] Suspension check error:", error);
    res.status(500).json({ success: false, error: "Failed to check suspension" });
  }
});

router.post("/grievance-score-adjustment", requireAuth, requireManager, async (req: Request, res: Response) => {
  try {
    const workspaceId = req.workspaceId || (req.user)?.currentWorkspaceId;
    const userId = req.user?.id;
    if (!workspaceId || !userId) {
      return res.status(400).json({ success: false, error: "Workspace and user required" });
    }

    const gParsed = grievanceAdjustmentSchema.safeParse(req.body);
    if (!gParsed.success) {
      return res.status(400).json({ success: false, error: "Invalid input", details: gParsed.error.flatten().fieldErrors });
    }
    const { employeeId, adjustmentPoints, grievanceId, reason } = gParsed.data;

    const result = await complianceScoringBridge.processGrievanceScoreAdjustment(
      workspaceId,
      employeeId,
      adjustmentPoints,
      grievanceId,
      reason,
      userId
    );

    res.json({ success: true, ...result });
  } catch (error) {
    log.error("[Compliance Enforcement] Grievance adjustment error:", error);
    res.status(500).json({ success: false, error: "Failed to process grievance score adjustment" });
  }
});

router.get("/config", requireAuth, requireAdmin, async (req: Request, res: Response) => {
  try {
    const config = complianceScoringBridge.getConfig();
    res.json({ success: true, config });
  } catch (error) {
    res.status(500).json({ success: false, error: "Failed to get config" });
  }
});

router.patch("/config", requireAuth, requireAdmin, async (req: Request, res: Response) => {
  try {
    const configBody = z.record(z.unknown()).safeParse(req.body);
    if (!configBody.success) {
      return res.status(400).json({ success: false, error: "Invalid config data" });
    }
    complianceScoringBridge.updateConfig(configBody.data);
    const config = complianceScoringBridge.getConfig();
    res.json({ success: true, config });
  } catch (error) {
    res.status(500).json({ success: false, error: "Failed to update config" });
  }
});

router.get("/hiring-score/:employeeId", requireAuth, requireManagerRole, async (req: Request, res: Response) => {
  try {
    const requestingWorkspaceId = req.workspaceId || (req.user)?.workspaceId || (req.user)?.currentWorkspaceId;
    const { employeeId } = req.params;
    const { authorizationToken } = req.query;

    if (!requestingWorkspaceId) {
      return res.status(400).json({ success: false, error: "Workspace required" });
    }

    const employee = await db.query.employees.findFirst({
      where: and(eq(employees.id, employeeId), eq(employees.workspaceId, requestingWorkspaceId)),
    });

    if (!employee) {
      return res.status(404).json({ success: false, error: "Employee not found" });
    }

    const profile = await db.query.coaileagueEmployeeProfiles.findFirst({
      where: eq(coaileagueEmployeeProfiles.employeeId, employeeId),
    });

    const behaviorScore = await db.query.employeeBehaviorScores.findFirst({
      where: eq(employeeBehaviorScores.employeeId, employeeId),
    });

    const isSameOrg = employee.workspaceId === requestingWorkspaceId;

    if (isSameOrg) {
      return res.json({
        success: true,
        accessLevel: 'full',
        employeeId,
        employeeName: `${employee.firstName} ${employee.lastName}`,
        overallScore: profile ? parseFloat(profile.overallScore || '0') : null,
        reliabilityScore: profile ? parseFloat(profile.reliabilityScore || '0') : null,
        netPoints: profile ? Number(profile.netPoints || 0) : null,
        goodPoints: profile ? Number(profile.goodPoints || 0) : null,
        negativePoints: profile ? Number(profile.negativePoints || 0) : null,
        totalShiftsCompleted: behaviorScore ? Number(behaviorScore.totalShiftsCompleted || 0) : null,
        onTimeArrivalRate: behaviorScore ? parseFloat(behaviorScore.onTimeArrivalRate || '0') : null,
        shiftCompletionRate: behaviorScore ? parseFloat(behaviorScore.shiftCompletionRate || '0') : null,
        noShowRate: behaviorScore ? parseFloat(behaviorScore.noShowRate || '0') : null,
        backgroundCheckStatus: employee.status,
        complianceStatus: profile ? 'available' : 'no_profile',
      });
    }

    let hasBackgroundAuth = false;
    if (authorizationToken && typeof authorizationToken === 'string') {
      const auth = await getComplianceAuthToken(authorizationToken);
      if (auth && auth.employeeId === employeeId && auth.requestingWorkspaceId === requestingWorkspaceId) {
        hasBackgroundAuth = true;
      }
    }

    const anonymizedScore: any = {
      success: true,
      accessLevel: hasBackgroundAuth ? 'authorized' : 'anonymized',
      employeeId,
      employeeName: hasBackgroundAuth ? `${employee.firstName} ${employee.lastName}` : `Officer ${employeeId.slice(-4).toUpperCase()}`,
      overallScore: profile ? parseFloat(profile.overallScore || '0') : null,
      reliabilityScore: profile ? parseFloat(profile.reliabilityScore || '0') : null,
      scoreCategory: profile ? getScoreCategory(parseFloat(profile.overallScore || '0')) : 'unknown',
      totalShiftsCompleted: behaviorScore ? Number(behaviorScore.totalShiftsCompleted || 0) : null,
      shiftCompletionRate: behaviorScore ? parseFloat(behaviorScore.shiftCompletionRate || '0') : null,
      backgroundCheckStatus: hasBackgroundAuth ? employee.status : 'requires_authorization',
      personalDetailsHidden: !hasBackgroundAuth,
      complianceStatus: profile ? 'available' : 'no_profile',
    };

    if (hasBackgroundAuth) {
      anonymizedScore.netPoints = profile ? Number(profile.netPoints || 0) : null;
      anonymizedScore.goodPoints = profile ? Number(profile.goodPoints || 0) : null;
      anonymizedScore.negativePoints = profile ? Number(profile.negativePoints || 0) : null;
      anonymizedScore.onTimeArrivalRate = behaviorScore ? parseFloat(behaviorScore.onTimeArrivalRate || '0') : null;
      anonymizedScore.noShowRate = behaviorScore ? parseFloat(behaviorScore.noShowRate || '0') : null;
    }

    res.json(anonymizedScore);
  } catch (error) {
    log.error("[Compliance Enforcement] Hiring score error:", error);
    res.status(500).json({ success: false, error: "Failed to fetch hiring score" });
  }
});

router.post("/hiring-score/:employeeId/authorize", requireAuth, requireManagerRole, async (req: Request, res: Response) => {
  try {
    const workspaceId = req.workspaceId || (req.user)?.workspaceId || (req.user)?.currentWorkspaceId;
    const userId = req.user?.id;
    const { employeeId } = req.params;
    const hsParsed = hiringScoreAuthSchema.safeParse(req.body);
    if (!hsParsed.success) {
      return res.status(400).json({ success: false, error: "Invalid input - purpose must be at least 10 characters" });
    }
    const { purpose } = hsParsed.data;

    if (!workspaceId || !userId) {
      return res.status(400).json({ success: false, error: "Workspace and user required" });
    }

    if (!purpose || purpose.length < 10) {
      return res.status(400).json({ success: false, error: "A detailed purpose (minimum 10 characters) is required for background authorization" });
    }

    const token = crypto.randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);

    await setComplianceAuthToken(token, {
      requestingWorkspaceId: workspaceId,
      requestedBy: userId,
      employeeId,
      purpose,
      expiresAt,
    });

    log.info(`[Compliance Enforcement] Background authorization granted: workspace=${workspaceId}, employee=${employeeId}, by=${userId}, purpose=${purpose}`);

    res.json({
      success: true,
      authorizationToken: token,
      employeeId,
      purpose,
      requestedBy: userId,
      expiresAt: expiresAt.toISOString(),
      note: 'Use this token as authorizationToken query parameter when fetching the hiring score',
    });
  } catch (error) {
    log.error("[Compliance Enforcement] Authorization error:", error);
    res.status(500).json({ success: false, error: "Failed to process authorization" });
  }
});

function getScoreCategory(score: number): string {
  if (score >= 0.9) return 'excellent';
  if (score >= 0.75) return 'good';
  if (score >= 0.6) return 'satisfactory';
  if (score >= 0.4) return 'needs_improvement';
  return 'at_risk';
}

router.get("/gap-analysis/:employeeId/:stateCode", requireAuth, async (req: Request, res: Response) => {
  try {
    const { employeeId, stateCode } = req.params;

    const report = await employeeDocumentOnboardingService.getStateComplianceGapReport(employeeId, stateCode);
    if (!report) {
      return res.status(404).json({ success: false, error: "Gap report could not be generated" });
    }

    res.json({ success: true, report });
  } catch (error) {
    log.error("[Compliance Enforcement] Gap analysis error:", error);
    res.status(500).json({ success: false, error: "Failed to generate compliance gap analysis" });
  }
});

router.get("/state-configs", requireAuditorOrStandardAuth, async (req: Request, res: Response) => {
  try {
    const summary = Object.values(STATE_COMPLIANCE_CONFIGS).map((config) => ({
      stateCode: config.stateCode,
      stateName: config.stateName,
      regulatoryBody: config.regulatoryBody,
      regulatoryBodyAbbreviation: config.regulatoryBodyAbbreviation,
      portalUrl: config.portalUrl,
      retentionPeriodDescription: config.retentionPeriodDescription,
    }));

    res.json({ success: true, configs: summary });
  } catch (error) {
    log.error("[Compliance Enforcement] State configs error:", error);
    res.status(500).json({ success: false, error: "Failed to fetch state configurations" });
  }
});

router.get("/state-configs/:stateCode", requireAuth, async (req: Request, res: Response) => {
  try {
    const { stateCode } = req.params;

    const config = getStateComplianceConfig(stateCode);
    if (!config) {
      return res.status(404).json({ success: false, error: "State configuration not found" });
    }

    res.json({ success: true, config });
  } catch (error) {
    log.error("[Compliance Enforcement] State config detail error:", error);
    res.status(500).json({ success: false, error: "Failed to fetch state configuration" });
  }
});

router.get("/state-requirements/:stateCode/:guardType", requireAuth, async (req: Request, res: Response) => {
  try {
    const { stateCode, guardType } = req.params;

    if (guardType !== 'armed' && guardType !== 'unarmed') {
      return res.status(400).json({ success: false, error: "guardType must be 'armed' or 'unarmed'" });
    }

    const documents = getStateRequiredDocuments(stateCode, guardType);
    if (!documents || documents.length === 0) {
      return res.status(404).json({ success: false, error: "No required documents found for this state/guard type combination" });
    }

    res.json({ success: true, documents });
  } catch (error) {
    log.error("[Compliance Enforcement] State requirements error:", error);
    res.status(500).json({ success: false, error: "Failed to fetch state requirements" });
  }
});

router.get("/onboarding-status", requireAuth, async (req: Request, res: Response) => {
  try {
    const userId = (req.user)?.id;
    if (!userId) {
      return res.status(401).json({ success: false, error: "Not authenticated" });
    }

    const workspaceId = (req as any).workspaceId || (req.user)?.currentWorkspaceId;

    const employee = await db.query.employees.findFirst({
      where: workspaceId
        ? and(eq(employees.userId, userId), eq(employees.workspaceId, workspaceId))
        : eq(employees.userId, userId),
    });

    if (!employee) {
      return res.status(404).json({ success: false, error: "Employee profile not found" });
    }

    const status = await employeeDocumentOnboardingService.getEmployeeOnboardingStatus(employee.id.toString());
    if (!status) {
      return res.status(404).json({ success: false, error: "Onboarding status not found" });
    }

    res.json({ success: true, status });
  } catch (error) {
    log.error("[Compliance Enforcement] Onboarding status error:", error);
    res.status(500).json({ success: false, error: "Failed to fetch onboarding status" });
  }
});

router.get("/onboarding-status/:employeeId", requireAuth, requireManagerRole, async (req: Request, res: Response) => {
  try {
    const { employeeId } = req.params;
    const workspaceId = req.workspaceId || (req.user)?.currentWorkspaceId;
    if (!workspaceId) {
      return res.status(400).json({ success: false, error: "Workspace required" });
    }
    const employeeCheck = await db.query.employees.findFirst({
      where: and(eq(employees.id, employeeId), eq(employees.workspaceId, workspaceId)),
      columns: { id: true },
    });
    if (!employeeCheck) {
      return res.status(404).json({ success: false, error: "Employee not found" });
    }
    const status = await employeeDocumentOnboardingService.getEmployeeOnboardingStatus(employeeId);
    if (!status) {
      return res.status(404).json({ success: false, error: "Employee not found" });
    }
    res.json({ success: true, status });
  } catch (error) {
    log.error("[Compliance Enforcement] Onboarding status error:", error);
    res.status(500).json({ success: false, error: "Failed to fetch onboarding status" });
  }
});

router.get("/point-rules", requireAuditorOrStandardAuth, async (_req: Request, res: Response) => {
  try {
    const rules = Object.entries(COMPLIANCE_POINT_RULES).map(([eventType, rule]) => ({
      eventType,
      ...rule,
    }));
    res.json({ success: true, rules });
  } catch (error) {
    log.error("[Compliance Enforcement] Point rules error:", error);
    res.status(500).json({ success: false, error: "Failed to fetch point rules" });
  }
});

router.get("/compliance-score/:employeeId", requireAuth, requireManagerRole, async (req: Request, res: Response) => {
  try {
    const { employeeId } = req.params;
    const workspaceId = req.workspaceId || (req.user)?.currentWorkspaceId;
    if (!workspaceId) {
      return res.status(400).json({ success: false, error: "No workspace context" });
    }

    const score = await complianceScoringBridge.calculateComplianceScore(employeeId, workspaceId);

    let certificationCompliance = null;
    try {
      const { checkEmployeeCertificationCompliance } = await import('../../services/compliance/certificationTypes');
      const employee = await db.query.employees.findFirst({
        where: and(eq(employees.id, employeeId), eq(employees.workspaceId, workspaceId)),
      });
      if (employee) {
        const stateCode = (employee as any).stateCode || 'CA';
        const guardType = ((employee as any).guardType || 'unarmed') as 'armed' | 'unarmed';
        const empDocs = await db.select()
          .from(employeeDocuments)
          .where(and(eq(employeeDocuments.employeeId, employeeId), eq(employeeDocuments.workspaceId, workspaceId)));
        certificationCompliance = checkEmployeeCertificationCompliance(
          stateCode,
          guardType,
          empDocs.map(d => ({
            certificationType: d.documentType || '',
            expirationDate: d.expirationDate,
            status: d.status,
          }))
        );
      }
    } catch (certErr) {
      log.warn('[Compliance] Certification compliance check failed (non-blocking):', certErr);
    }

    res.json({ success: true, score, certificationCompliance });
  } catch (error) {
    log.error("[Compliance Enforcement] Compliance score error:", error);
    res.status(500).json({ success: false, error: "Failed to calculate compliance score" });
  }
});

router.get("/compliance-score-history/:employeeId", requireAuth, requireManagerRole, async (req: Request, res: Response) => {
  try {
    const { employeeId } = req.params;
    const days = Math.min(Math.max(1, parseInt(req.query.days as string) || 30), 365);
    const history = await complianceScoringBridge.getComplianceScoreHistory(employeeId, days);
    res.json({ success: true, history });
  } catch (error) {
    log.error("[Compliance Enforcement] Score history error:", error);
    res.status(500).json({ success: false, error: "Failed to fetch score history" });
  }
});

router.get("/scoreboard", requireAuth, requireManagerRole, async (req: Request, res: Response) => {
  try {
    const workspaceId = req.workspaceId || (req.user)?.currentWorkspaceId;
    if (!workspaceId) {
      return res.status(400).json({ success: false, error: "No workspace context" });
    }

    const scoreboard = await complianceScoringBridge.getWorkspaceComplianceScoreboard(workspaceId);
    res.json({ success: true, scoreboard });
  } catch (error) {
    log.error("[Compliance Enforcement] Scoreboard error:", error);
    res.status(500).json({ success: false, error: "Failed to fetch scoreboard" });
  }
});

router.get("/audit-report", requireAuditorOrManagerAuth, async (req: Request, res: Response) => {
  try {
    const workspaceId = req.workspaceId || (req.user)?.currentWorkspaceId;
    if (!workspaceId) {
      return res.status(400).json({ success: false, error: "No workspace context" });
    }

    const auditResult = await complianceScoringBridge.runComplianceAudit(workspaceId);

    const compliancePercentage = auditResult.totalEmployees > 0
      ? Math.round((auditResult.compliant / auditResult.totalEmployees) * 100)
      : 100;

    let scoreboardArray: any[] = [];
    try {
      const scoreboardResult = await complianceScoringBridge.getWorkspaceComplianceScoreboard(workspaceId);
      scoreboardArray = scoreboardResult?.scoreboard || [];
    } catch (sbErr) {
      log.error("[Compliance Enforcement] Scoreboard fetch error (non-blocking):", sbErr);
    }

    res.json({
      success: true,
      report: {
        totalEmployees: auditResult.totalEmployees,
        compliant: auditResult.compliant,
        nonCompliant: auditResult.nonCompliant,
        suspended: auditResult.suspended,
        expiringWithin30Days: auditResult.expiringWithin30Days,
        actions: auditResult.actions,
        compliancePercentage,
        scoreboard: scoreboardArray,
        lastAuditDate: new Date().toISOString(),
        riskLevel: compliancePercentage >= 80 ? 'low' : compliancePercentage >= 60 ? 'medium' : 'high',
      },
    });
  } catch (error) {
    log.error("[Compliance Enforcement] Audit report error:", error);
    res.status(500).json({ success: false, error: "Failed to generate audit report" });
  }
});

router.get("/workspace-overview", requireAuth, requireManagerRole, async (req: Request, res: Response) => {
  try {
    const workspaceId = req.workspaceId || (req.user)?.currentWorkspaceId;
    if (!workspaceId) {
      return res.status(400).json({ success: false, error: "No workspace context" });
    }

    const overview = await employeeDocumentOnboardingService.getWorkspaceOnboardingOverview(workspaceId);

    const overdueCount = overview.employeeStatuses.filter(s => s.onboardingDeadline?.isOverdue).length;
    const criticalCount = overview.employeeStatuses.filter(s => s.onboardingDeadline?.urgencyLevel === 'critical').length;
    const warningCount = overview.employeeStatuses.filter(s => s.onboardingDeadline?.urgencyLevel === 'warning').length;

    res.json({
      success: true,
      overview: {
        totalEmployees: overview.totalEmployees,
        workEligibleCount: overview.workEligibleCount,
        notEligibleCount: overview.totalEmployees - overview.workEligibleCount,
        pendingDocumentsCount: overview.pendingDocumentsCount,
        expiringDocumentsCount: overview.expiringDocumentsCount,
        overdueOnboardingCount: overdueCount,
        criticalDeadlineCount: criticalCount,
        warningDeadlineCount: warningCount,
        employees: overview.employeeStatuses,
        supportedStates: getSupportedStates(),
      },
    });
  } catch (error) {
    log.error("[Compliance Enforcement] Workspace overview error:", error);
    res.status(500).json({ success: false, error: "Failed to fetch workspace overview" });
  }
});

router.post("/cross-org-hiring-score/request", requireAuth, requireManagerRole, async (req: Request, res: Response) => {
  try {
    const cohParsed = crossOrgHiringSchema.safeParse(req.body);
    if (!cohParsed.success) {
      return res.status(400).json({ success: false, error: "Invalid input", details: cohParsed.error.flatten().fieldErrors });
    }
    const { employeeId, purpose } = cohParsed.data;
    const requestingWorkspaceId = req.workspaceId || (req.user)?.currentWorkspaceId;
    const requestedBy = (req.user)?.id;

    if (!employeeId || !purpose) {
      return res.status(400).json({ success: false, error: "employeeId and purpose are required" });
    }

    const token = crypto.randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);

    await setComplianceAuthToken(token, {
      requestingWorkspaceId,
      requestedBy,
      employeeId,
      purpose,
      expiresAt,
    });

    res.json({
      success: true,
      authorization: {
        token,
        expiresAt: expiresAt.toISOString(),
        employeeId,
        purpose,
      },
    });
  } catch (error) {
    log.error("[Compliance Enforcement] Cross-org request error:", error);
    res.status(500).json({ success: false, error: "Failed to create hiring score request" });
  }
});

router.get("/cross-org-hiring-score/verify/:token", requireAuth, requireManagerRole, async (req: Request, res: Response) => {
  try {
    const { token } = req.params;
    const requestingWorkspaceId = req.workspaceId || (req.user)?.currentWorkspaceId;
    const auth = await getComplianceAuthToken(token);

    if (!auth) {
      return res.status(404).json({ success: false, error: "Authorization not found or expired" });
    }

    if (auth.requestingWorkspaceId !== requestingWorkspaceId) {
      log.warn(`[Compliance Enforcement] Cross-org token workspace mismatch: token workspace=${auth.requestingWorkspaceId}, requesting workspace=${requestingWorkspaceId}, user=${(req.user)?.id}, employee=${auth.employeeId}`);
      return res.status(403).json({ success: false, error: "This authorization token belongs to a different organization" });
    }

    const employee = await db.query.employees.findFirst({
      where: eq(employees.id, auth.employeeId),
    });

    if (!employee) {
      return res.status(404).json({ success: false, error: "Employee not found" });
    }

    const behaviorScore = await db.select()
      .from(employeeBehaviorScores)
      .where(eq(employeeBehaviorScores.employeeId, auth.employeeId))
      .limit(1);

    const complianceScore = await complianceScoringBridge.calculateComplianceScore(
      auth.employeeId,
      employee.workspaceId
    );

    const hiringScore = {
      employeeId: auth.employeeId,
      employeeName: `${employee.firstName} ${employee.lastName}`,
      complianceScore: {
        score: complianceScore.score,
        grade: complianceScore.grade,
        riskLevel: complianceScore.riskLevel,
      },
      behaviorScore: behaviorScore[0] ? {
        reliabilityScore: parseFloat(behaviorScore[0].reliabilityScore || '0.5'),
        onTimeArrivalRate: parseFloat(behaviorScore[0].onTimeArrivalRate || '1.0'),
        shiftCompletionRate: parseFloat(behaviorScore[0].shiftCompletionRate || '1.0'),
        noShowRate: parseFloat(behaviorScore[0].noShowRate || '0'),
        clientSatisfactionScore: parseFloat(behaviorScore[0].clientSatisfactionScore || '0.8'),
        totalShiftsCompleted: behaviorScore[0].totalShiftsCompleted || 0,
      } : null,
      overallHiringRecommendation: getHiringRecommendation(complianceScore.score, behaviorScore[0]),
      verifiedAt: new Date().toISOString(),
      purpose: auth.purpose,
    };

    res.json({ success: true, hiringScore });
  } catch (error) {
    log.error("[Compliance Enforcement] Cross-org verify error:", error);
    res.status(500).json({ success: false, error: "Failed to verify hiring score" });
  }
});

function getHiringRecommendation(complianceScore: number, behaviorScore: any): {
  recommendation: 'strongly_recommend' | 'recommend' | 'neutral' | 'caution' | 'do_not_recommend';
  reasons: string[];
} {
  const reasons: string[] = [];
  let score = 0;

  if (complianceScore >= 800) { score += 3; reasons.push('Excellent compliance record'); }
  else if (complianceScore >= 650) { score += 2; reasons.push('Good compliance record'); }
  else if (complianceScore >= 500) { score += 1; reasons.push('Average compliance record'); }
  else { score -= 1; reasons.push('Below average compliance - review required'); }

  if (behaviorScore) {
    const reliability = parseFloat(behaviorScore.reliabilityScore || '0.5');
    if (reliability >= 0.8) { score += 2; reasons.push('High reliability score'); }
    else if (reliability >= 0.6) { score += 1; reasons.push('Acceptable reliability'); }
    else { score -= 1; reasons.push('Low reliability - frequent issues'); }

    const noShow = parseFloat(behaviorScore.noShowRate || '0');
    if (noShow > 0.1) { score -= 2; reasons.push('High no-show rate'); }
    else if (noShow === 0) { score += 1; reasons.push('Zero no-show history'); }

    const completion = parseFloat(behaviorScore.shiftCompletionRate || '1.0');
    if (completion >= 0.95) { score += 1; reasons.push('Excellent shift completion rate'); }
    else if (completion < 0.8) { score -= 1; reasons.push('Low shift completion rate'); }
  } else {
    reasons.push('No behavior history available');
  }

  let recommendation: 'strongly_recommend' | 'recommend' | 'neutral' | 'caution' | 'do_not_recommend';
  if (score >= 5) recommendation = 'strongly_recommend';
  else if (score >= 3) recommendation = 'recommend';
  else if (score >= 1) recommendation = 'neutral';
  else if (score >= -1) recommendation = 'caution';
  else recommendation = 'do_not_recommend';

  return { recommendation, reasons };
}

export const enforcementRoutes = router;
