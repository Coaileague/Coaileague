/**
 * Pre-Audit Red Team Engine — Wave 20
 * ─────────────────────────────────────────────────────────────────────────────
 * FULLY DYNAMIC — reads from state_regulatory_config and regulatory_knowledge_base.
 * Works for Texas, California, Florida, New York, or any state in the DB.
 *
 * No state-specific code is hardcoded. License tier names, regulatory body names,
 * reporting requirements, and UoF thresholds all come from the DB config.
 *
 * Trinity and HelpAI use this report to proactively alert owners before audits.
 */

import { Router, type Response } from "express";
import { requireAuth } from "../auth";
import { type AuthenticatedRequest, requireManager } from "../rbac";
import { ensureWorkspaceAccess } from "../middleware/workspaceScope";
import { pool } from "../db";
import { createLogger } from "../lib/logger";
import { sanitizeError } from "../middleware/errorHandler";

const log = createLogger("PreAuditEngine");
export const preAuditRouter = Router();

interface AuditFlag {
  severity: "critical" | "warning" | "info";
  category: "license" | "use_of_force" | "training" | "documentation" | "staffing";
  employeeId: string;
  employeeName: string;
  flagCode: string;
  description: string;
  shiftDate?: string;
  shiftId?: string;
  remediation: string;
}

interface PreAuditReport {
  generatedAt: string;
  workspaceId: string;
  stateCode: string;
  regulatoryBody: string;
  overallRisk: "critical" | "warning" | "clean";
  summary: {
    totalFlags: number;
    criticalCount: number;
    warningCount: number;
    infoCount: number;
    armedPostsReviewed: number;
    officersReviewed: number;
  };
  flags: AuditFlag[];
  auditReadinessScore: number;
}

preAuditRouter.get(
  "/pre-audit",
  requireAuth,
  ensureWorkspaceAccess,
  requireManager,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const workspaceId = req.workspaceId!;
      const flags: AuditFlag[] = [];

      // ── Load workspace state + regulatory config dynamically ──────────────
      const wsRow = await pool.query(
        `SELECT w.state, w.company_name,
                src.state_name, src.licensing_authority,
                src.license_types, src.renewal_period_months
         FROM workspaces w
         LEFT JOIN state_regulatory_config src ON src.state_code = UPPER(w.state)
         WHERE w.id = $1 LIMIT 1`,
        [workspaceId]
      );

      const wsState = wsRow.rows[0]?.state || "TX";
      const regulatoryBody = wsRow.rows[0]?.licensing_authority || "State Regulatory Authority";
      const licenseTypes: Array<{ code: string; name: string; armedAllowed: boolean }> =
        wsRow.rows[0]?.license_types || [];

      // Which license codes allow armed posts? Read from DB config, not hardcoded.
      const armedLicenseCodes = new Set(
        licenseTypes.filter(lt => lt.armedAllowed).map(lt => lt.code)
      );
      // Armed post license requires at least one of these level codes
      const unarmedOnlyCodes = new Set(
        licenseTypes.filter(lt => !lt.armedAllowed).map(lt => lt.code)
      );

      // ── 1. Armed posts × expired/missing guard card ───────────────────────
      const armedShifts = await pool.query(
        `SELECT
           s.id AS shift_id, s.start_time,
           e.id AS employee_id,
           e.first_name || ' ' || e.last_name AS employee_name,
           e.guard_card_number, e.guard_card_expiry_date,
           e.guard_card_status, e.license_type, e.is_armed
         FROM shifts s
         JOIN employees e ON e.id = s.assigned_employee_id
         WHERE s.workspace_id = $1
           AND s.is_armed_post = TRUE
           AND s.status IN ('completed','active','started')
           AND s.start_time >= NOW() - INTERVAL '12 months'
         ORDER BY s.start_time DESC
         LIMIT 500`,
        [workspaceId]
      );

      let armedPostsReviewed = 0;
      const employeesReviewed = new Set<string>();

      for (const row of armedShifts.rows) {
        armedPostsReviewed++;
        employeesReviewed.add(row.employee_id);

        // Missing guard card
        if (!row.guard_card_number) {
          flags.push({
            severity: "critical", category: "license",
            employeeId: row.employee_id, employeeName: row.employee_name,
            flagCode: "ARMED_POST_NO_GUARD_CARD",
            description: `${row.employee_name} worked an armed post on ${new Date(row.start_time).toLocaleDateString()} with no guard card number on file.`,
            shiftDate: row.start_time, shiftId: row.shift_id,
            remediation: `Upload current guard card to employee document vault. Contact ${regulatoryBody} if lost.`,
          });
        }

        // Expired guard card
        if (row.guard_card_expiry_date &&
            new Date(row.guard_card_expiry_date) < new Date(row.start_time)) {
          flags.push({
            severity: "critical", category: "license",
            employeeId: row.employee_id, employeeName: row.employee_name,
            flagCode: "ARMED_POST_EXPIRED_LICENSE",
            description: `${row.employee_name} worked an armed post on ${new Date(row.start_time).toLocaleDateString()} with a license that expired on ${new Date(row.guard_card_expiry_date).toLocaleDateString()}.`,
            shiftDate: row.start_time, shiftId: row.shift_id,
            remediation: `Renew license with ${regulatoryBody} immediately. File corrective report if required by ${wsRow.rows[0]?.state_name || wsState} regulations.`,
          });
        }

        // Unarmed-only license on armed post (dynamic check)
        if (row.license_type && unarmedOnlyCodes.size > 0 &&
            unarmedOnlyCodes.has(row.license_type)) {
          const licenseName = licenseTypes.find(l => l.code === row.license_type)?.name || row.license_type;
          flags.push({
            severity: "critical", category: "license",
            employeeId: row.employee_id, employeeName: row.employee_name,
            flagCode: "ARMED_POST_INSUFFICIENT_LICENSE",
            description: `${row.employee_name} (${licenseName}) worked an armed post but this license type does not authorize armed carry per ${regulatoryBody}.`,
            shiftDate: row.start_time, shiftId: row.shift_id,
            remediation: `Officer must upgrade to an armed license before working armed posts. Remove from armed assignments immediately.`,
          });
        }

        // Expiring within 30 days
        if (row.guard_card_expiry_date) {
          const expiry = new Date(row.guard_card_expiry_date);
          const days = Math.floor((expiry.getTime() - Date.now()) / 86400000);
          if (days > 0 && days <= 30) {
            flags.push({
              severity: "warning", category: "license",
              employeeId: row.employee_id, employeeName: row.employee_name,
              flagCode: "LICENSE_EXPIRING_SOON",
              description: `${row.employee_name}'s license expires in ${days} days (${expiry.toLocaleDateString()}).`,
              remediation: `Submit renewal application to ${regulatoryBody} before expiry date.`,
            });
          }
        }
      }

      // ── 2. UoF incidents without formal reports ───────────────────────────
      // Load UoF incident types from regulatory knowledge base (dynamic)
      const uofTypesRow = await pool.query(
        `SELECT content_json FROM regulatory_knowledge_base
         WHERE state_code = $1 AND knowledge_type = 'uof_reportable_incident_types'
         LIMIT 1`,
        [wsState]
      );
      const uofTypes: string[] = uofTypesRow.rows[0]?.content_json?.types || [
        'use_of_force','firearm_discharge','physical_altercation',
        'use_of_force_incident','weapon_drawn','officer_involved',
      ];

      const uofResult = await pool.query(
        `SELECT i.id, i.incident_number, i.title, i.incident_type,
                i.reported_by, i.created_at, i.polished_description,
                e.first_name || ' ' || e.last_name AS employee_name,
                e.id AS employee_id
         FROM incident_reports i
         LEFT JOIN employees e ON e.id::text = i.reported_by
         WHERE i.workspace_id = $1
           AND i.incident_type = ANY($2::text[])
           AND i.created_at >= NOW() - INTERVAL '12 months'
         ORDER BY i.created_at DESC`,
        [workspaceId, uofTypes]
      );

      for (const row of uofResult.rows) {
        if (!row.polished_description) {
          flags.push({
            severity: "critical", category: "use_of_force",
            employeeId: row.employee_id || "unknown",
            employeeName: row.employee_name || "Unknown Officer",
            flagCode: "UOF_MISSING_FORMAL_REPORT",
            description: `Use of Force incident "${row.title}" on ${new Date(row.created_at).toLocaleDateString()} has no completed formal report on file.`,
            remediation: "Complete Use of Force report using Trinity's UoF writer. Required by state regulations.",
          });
        }
      }

      // ── 3. Armed officers missing training certifications ─────────────────
      // Load required cert types from DB (dynamic per state)
      const certTypesRow = await pool.query(
        `SELECT content_json FROM regulatory_knowledge_base
         WHERE state_code = $1 AND knowledge_type = 'required_armed_certifications'
         LIMIT 1`,
        [wsState]
      );
      const requiredCerts: string[] = certTypesRow.rows[0]?.content_json?.certTypes || [
        'firearm_qualification', 'armed_security',
      ];

      const trainingResult = await pool.query(
        `SELECT e.id, e.first_name || ' ' || e.last_name AS employee_name,
                e.is_armed, e.license_type,
                (SELECT COUNT(*) FROM training_certifications tc
                 WHERE tc.employee_id = e.id
                   AND tc.certification_type = ANY($2::text[])
                   AND tc.status = 'active') AS cert_count
         FROM employees e
         WHERE e.workspace_id = $1 AND e.is_active = TRUE AND e.is_armed = TRUE`,
        [workspaceId, requiredCerts]
      );

      for (const row of trainingResult.rows) {
        if (Number(row.cert_count) === 0) {
          flags.push({
            severity: "critical", category: "training",
            employeeId: row.id, employeeName: row.employee_name,
            flagCode: "ARMED_OFFICER_MISSING_REQUIRED_CERT",
            description: `${row.employee_name} is active as armed but has no current required training certifications on file.`,
            remediation: `Schedule required training per ${regulatoryBody} requirements and upload certificates.`,
          });
        }
      }

      // ── 4. Missing liability insurance ────────────────────────────────────
      const insResult = await pool.query(
        `SELECT count(*) AS cnt FROM compliance_documents
         WHERE workspace_id = $1 AND document_type = 'liability_insurance'
           AND status = 'approved'
           AND (expiration_date IS NULL OR expiration_date > NOW())`,
        [workspaceId]
      );
      if (Number(insResult.rows[0]?.cnt || 0) === 0) {
        flags.push({
          severity: "critical", category: "documentation",
          employeeId: "workspace", employeeName: "Company",
          flagCode: "MISSING_LIABILITY_INSURANCE",
          description: `No current Certificate of Liability Insurance on file. Required by ${regulatoryBody}.`,
          remediation: "Upload current Certificate of Liability Insurance to company documents.",
        });
      }

      // ── Score ─────────────────────────────────────────────────────────────
      const criticalCount = flags.filter(f => f.severity === "critical").length;
      const warningCount = flags.filter(f => f.severity === "warning").length;
      const score = Math.max(0, 100 - criticalCount * 15 - warningCount * 5);

      const report: PreAuditReport = {
        generatedAt: new Date().toISOString(),
        workspaceId, stateCode: wsState, regulatoryBody,
        overallRisk: criticalCount > 0 ? "critical" : warningCount > 0 ? "warning" : "clean",
        summary: {
          totalFlags: flags.length, criticalCount, warningCount,
          infoCount: 0, armedPostsReviewed,
          officersReviewed: employeesReviewed.size,
        },
        flags: flags.sort((a,b) => ({ critical:0,warning:1,info:2 }[a.severity]!) - ({ critical:0,warning:1,info:2 }[b.severity]!)),
        auditReadinessScore: score,
      };

      return res.json({ success: true, report });
    } catch (err: unknown) {
      log.error("[PreAudit] Scan failed:", err instanceof Error ? err.message : String(err));
      return res.status(500).json({ success: false, error: sanitizeError(err) });
    }
  }
);
