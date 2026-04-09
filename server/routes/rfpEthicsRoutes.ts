import { Router } from "express";
import { pool } from "../db";
import { requireAuth } from "../auth";
import { ensureWorkspaceAccess } from "../middleware/workspaceScope";
import { sanitizeError } from "../middleware/errorHandler";
import { randomUUID } from "crypto";
import { typedPool } from '../lib/typedSql';
import { createLogger } from '../lib/logger';
import { clampLimit, clampOffset } from '../utils/pagination';
const log = createLogger('RfpEthicsRoutes');


export const rfpEthicsRouter = Router();

function wid(req: any) {
  return req.workspaceId || req.session?.workspaceId;
}

async function q(text: string, params: any[] = []) {
  const r = await typedPool(text, params);
  return r.rows;
}

// ─── ANONYMOUS ETHICS REPORTS (public — no auth required) ────────────────────

rfpEthicsRouter.post("/ethics/report", async (req: any, res: any) => {
  try {
    // Phase 7 security audit: client-supplied workspaceId removed.
    // Anonymous reporters must identify the company via a verified
    // workspace SLUG (the same slug used for tenant subdomains and email
    // routing — public information). The slug is resolved server-side to
    // an actual workspace_id; an unknown slug results in workspace_id=null
    // (the report goes to the platform-level review queue). This stops
    // attackers from filing false reports against arbitrary workspace IDs.
    const { workspaceSlug, category, severity, description, siteName, occurredAt, reporterEmail } = req.body;
    if (!description || description.length < 10) return res.status(400).json({ error: "Description too short" });
    let workspaceId: string | null = null;
    if (workspaceSlug && typeof workspaceSlug === 'string') {
      const slug = workspaceSlug.trim().toLowerCase().replace(/[^a-z0-9-]/g, '');
      if (slug) {
        try {
          const wsRows = await q(`SELECT id FROM workspaces WHERE slug = $1 LIMIT 1`, [slug]);
          if (wsRows.length) workspaceId = (wsRows[0] as any).id;
        } catch { /* fall through to platform queue */ }
      }
    }
    const id = randomUUID();
    const reportCode = `ETH-${Date.now().toString(36).toUpperCase()}`;
    const followUpToken = randomUUID();
    let aiCategory = category || "general";
    let aiSeverityScore = severity === "critical" ? 9 : severity === "high" ? 7 : severity === "medium" ? 5 : 3;
    let aiRouting = "hr_review";
    let aiSummary = null;
    try {
      const { meteredGemini } = await import("../services/billing/meteredGeminiClient");
      const prompt = `Triage this anonymous ethics/safety report for a security company. Provide JSON with: category (harassment|discrimination|safety|fraud|policy_violation|other), severity_score (1-10), routing (hr_review|legal|executive|safety_officer|general_review), summary (1-2 sentences).\n\nReport: "${description}"`;
      // INTENTIONAL: Ethics hotline accepts anonymous reports — platform absorbs AI cost for compliance safety
      // @ts-expect-error — TS migration: fix in refactoring sprint
      const aiResult = await meteredGemini.generate({ workspaceId: workspaceId || "system", userId: "anonymous", feature: "ethics_triage", prompt });
      const jsonMatch = (aiResult as any)?.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);
        aiCategory = parsed.category || aiCategory;
        aiSeverityScore = parsed.severity_score || aiSeverityScore;
        aiRouting = parsed.routing || aiRouting;
        aiSummary = parsed.summary || null;
      }
    // @ts-expect-error — TS migration: fix in refactoring sprint
    } catch (triageErr: unknown) { log.warn('[RFP Ethics] AI triage failed, continuing with defaults:', triageErr.message); }
    await q(`INSERT INTO anonymous_reports (id, workspace_id, report_code, category, severity, description, site_name, occurred_at, ai_triage_category, ai_severity_score, ai_routing, ai_summary, status, follow_up_token, reporter_email, created_at, updated_at) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,'pending',$13,$14,NOW(),NOW())`,
      [id, workspaceId||null, reportCode, category||"general", severity||"medium", description, siteName||null, occurredAt||null, aiCategory, aiSeverityScore, aiRouting, aiSummary, followUpToken, reporterEmail||null]);
    res.status(201).json({ success: true, reportCode, followUpToken, message: "Your report has been received and will be reviewed confidentially." });
  } catch (e: unknown) { res.status(500).json({ error: sanitizeError(e) }); }
});

rfpEthicsRouter.get("/ethics/followup/:token", async (req: any, res: any) => {
  try {
    const rows = await q(`SELECT report_code, category, severity, status, resolution, resolved_at, created_at FROM anonymous_reports WHERE follow_up_token = $1`, [req.params.token]);
    if (!rows.length) return res.status(404).json({ error: "Report not found" });
    res.json(rows[0]);
  } catch (e: unknown) { res.status(500).json({ error: sanitizeError(e) }); }
});

rfpEthicsRouter.get("/ethics/reports", requireAuth as any, ensureWorkspaceAccess as any, async (req: any, res: any) => {
  try {
    const workspaceId = wid(req);
    const { status, limit = 50, offset = 0 } = req.query;
    let query = `SELECT * FROM anonymous_reports WHERE (workspace_id = $1 OR workspace_id IS NULL)`;
    const params: any[] = [workspaceId];
    if (status) { query += ` AND status = $2`; params.push(status); }
    query += ` ORDER BY created_at DESC LIMIT ${clampLimit(limit)} OFFSET ${clampOffset(offset)}`;
    res.json({ reports: await q(query, params) });
  } catch (e: unknown) { res.status(500).json({ error: sanitizeError(e) }); }
});

rfpEthicsRouter.patch("/ethics/reports/:id", requireAuth as any, ensureWorkspaceAccess as any, async (req: any, res: any) => {
  try {
    const { status, resolution, assignedTo } = req.body;
    await q(`UPDATE anonymous_reports SET status=COALESCE($1,status), resolution=COALESCE($2,resolution), assigned_to=COALESCE($3,assigned_to), resolved_at=CASE WHEN $1='resolved' THEN NOW() ELSE resolved_at END, updated_at=NOW() WHERE id=$4`,
      [status||null, resolution||null, assignedTo||null, req.params.id]);
    const rows = await q(`SELECT * FROM anonymous_reports WHERE id=$1`, [req.params.id]);
    res.json(rows[0]);
  } catch (e: unknown) { res.status(500).json({ error: sanitizeError(e) }); }
});

// ─── RFP DOCUMENTS ────────────────────────────────────────────────────────────

rfpEthicsRouter.get("/rfp", requireAuth as any, ensureWorkspaceAccess as any, async (req: any, res: any) => {
  try {
    const workspaceId = wid(req);
    const { status, limit = 50, offset = 0 } = req.query;
    let query = `SELECT * FROM rfp_documents WHERE workspace_id = $1`;
    const params: any[] = [workspaceId];
    if (status) { query += ` AND status = $2`; params.push(status); }
    query += ` ORDER BY created_at DESC LIMIT ${clampLimit(limit)} OFFSET ${clampOffset(offset)}`;
    res.json({ rfps: await q(query, params) });
  } catch (e: unknown) { res.status(500).json({ error: sanitizeError(e) }); }
});

rfpEthicsRouter.get("/rfp/:id", requireAuth as any, ensureWorkspaceAccess as any, async (req: any, res: any) => {
  try {
    const rows = await q(`SELECT * FROM rfp_documents WHERE id=$1 AND workspace_id=$2`, [req.params.id, wid(req)]);
    if (!rows.length) return res.status(404).json({ error: "Not found" });
    res.json(rows[0]);
  } catch (e: unknown) { res.status(500).json({ error: sanitizeError(e) }); }
});

rfpEthicsRouter.post("/rfp", requireAuth as any, ensureWorkspaceAccess as any, async (req: any, res: any) => {
  try {
    const workspaceId = wid(req);
    const { clientName, clientContactName, clientContactEmail, rfpTitle, rfpDescription, requirements, deadline, estimatedValue, coverageHoursRequired, officerCountRequired, specialRequirements, createdBy } = req.body;
    if (!clientName || !rfpTitle) return res.status(400).json({ error: "clientName, rfpTitle required" });
    const id = randomUUID();
    const rfpNumber = `RFP-${Date.now().toString(36).toUpperCase()}`;
    await q(`INSERT INTO rfp_documents (id,workspace_id,rfp_number,client_name,client_contact_name,client_contact_email,rfp_title,rfp_description,requirements,deadline,estimated_value,coverage_hours_required,officer_count_required,special_requirements,status,created_by,created_at,updated_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,'intake',$15,NOW(),NOW())`,
      [id, workspaceId, rfpNumber, clientName, clientContactName||null, clientContactEmail||null, rfpTitle, rfpDescription||null, JSON.stringify(requirements||[]), deadline||null, estimatedValue||null, coverageHoursRequired||null, officerCountRequired||null, specialRequirements||null, createdBy||null]);
    const rows = await q(`SELECT * FROM rfp_documents WHERE id=$1`, [id]);
    res.status(201).json(rows[0]);
  } catch (e: unknown) { res.status(400).json({ error: sanitizeError(e) }); }
});

rfpEthicsRouter.post("/rfp/:id/generate-proposal", requireAuth as any, ensureWorkspaceAccess as any, async (req: any, res: any) => {
  try {
    const workspaceId = wid(req);
    const rows = await q(`SELECT * FROM rfp_documents WHERE id=$1 AND workspace_id=$2`, [req.params.id, workspaceId]);
    if (!rows.length) return res.status(404).json({ error: "Not found" });
    const rfp = rows[0] as any;
    const prompt = `You are a senior proposal writer for a professional security company. Generate a comprehensive, professional security services proposal in response to this RFP.\n\nRFP Title: ${rfp.rfp_title}\nClient: ${rfp.client_name}\nDescription: ${rfp.rfp_description || ""}\nCoverage Hours: ${rfp.coverage_hours_required || "TBD"}\nOfficers Required: ${rfp.officer_count_required || "TBD"}\nSpecial Requirements: ${rfp.special_requirements || "None specified"}\nDeadline: ${rfp.deadline || "TBD"}\nEstimated Value: ${rfp.estimated_value ? `$${rfp.estimated_value}` : "TBD"}\n\nWrite a complete professional proposal with: Executive Summary, Understanding of Requirements, Our Approach, Staffing Plan, Qualifications & Experience, Technology & Reporting (mention CoAIleague platform), Compliance & Certifications, Pricing Overview, and Conclusion. Use formal business language. Length: approximately 1500-2000 words.`;
    const { meteredGemini } = await import("../services/billing/meteredGeminiClient");
    // @ts-expect-error — TS migration: fix in refactoring sprint
    const proposalDraft = await meteredGemini.generate({ workspaceId, userId: req.user?.id || req.session?.userId || "system", feature: "rfp_proposal_generation", prompt });
    await q(`UPDATE rfp_documents SET proposal_draft=$1, proposal_generated_at=NOW(), status='proposal_drafted', updated_at=NOW() WHERE id=$2`, [proposalDraft, req.params.id]);
    const updated = await q(`SELECT * FROM rfp_documents WHERE id=$1`, [req.params.id]);
    res.json(updated[0]);
  } catch (e: unknown) { res.status(500).json({ error: sanitizeError(e) }); }
});

rfpEthicsRouter.patch("/rfp/:id", requireAuth as any, ensureWorkspaceAccess as any, async (req: any, res: any) => {
  try {
    const allowed = ["status","proposalDraft","winLoss","winLossReason","notes","signingDocumentId","signedAt"];
    const updates: string[] = [];
    const vals: any[] = [];
    let i = 1;
    for (const [k, v] of Object.entries(req.body)) {
      if (!allowed.includes(k)) continue;
      const col = k.replace(/[A-Z]/g, (c: string) => `_${c.toLowerCase()}`);
      updates.push(`${col}=$${i++}`);
      vals.push(v);
    }
    if (!updates.length) return res.status(400).json({ error: "Nothing to update" });
    updates.push(`updated_at=NOW()`);
    vals.push(req.params.id, wid(req));
    await q(`UPDATE rfp_documents SET ${updates.join(", ")} WHERE id=$${i++} AND workspace_id=$${i}`, vals);
    const rows = await q(`SELECT * FROM rfp_documents WHERE id=$1`, [req.params.id]);
    res.json(rows[0]);
  } catch (e: unknown) { res.status(500).json({ error: sanitizeError(e) }); }
});

// ─── SHIFT COVERAGE MARKETPLACE ───────────────────────────────────────────────

rfpEthicsRouter.get("/coverage-marketplace", requireAuth as any, ensureWorkspaceAccess as any, async (req: any, res: any) => {
  try {
    const workspaceId = wid(req);
    const { status, limit = 50, offset = 0 } = req.query;
    let query = `SELECT * FROM shift_coverage_claims WHERE workspace_id=$1`;
    const params: any[] = [workspaceId];
    if (status) { query += ` AND status=$2`; params.push(status); }
    query += ` ORDER BY created_at DESC LIMIT ${clampLimit(limit)} OFFSET ${clampOffset(offset)}`;
    res.json({ shifts: await q(query, params) });
  } catch (e: unknown) { res.status(500).json({ error: sanitizeError(e) }); }
});

rfpEthicsRouter.post("/coverage-marketplace", requireAuth as any, ensureWorkspaceAccess as any, async (req: any, res: any) => {
  try {
    const workspaceId = wid(req);
    const { shiftId, siteName, shiftDate, shiftStart, shiftEnd, payRate, requiredCertifications, notes } = req.body;
    const id = randomUUID();
    const expiresAt = new Date(Date.now() + 48 * 60 * 60 * 1000).toISOString();
    await q(`INSERT INTO shift_coverage_claims (id,workspace_id,shift_id,site_name,shift_date,shift_start,shift_end,pay_rate,required_certifications,posted_at,post_expires_at,status,notes,created_at,updated_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,NOW(),$10,'open',$11,NOW(),NOW())`,
      [id, workspaceId, shiftId||null, siteName||null, shiftDate||null, shiftStart||null, shiftEnd||null, payRate||null, JSON.stringify(requiredCertifications||[]), expiresAt, notes||null]);
    const rows = await q(`SELECT * FROM shift_coverage_claims WHERE id=$1`, [id]);
    res.status(201).json(rows[0]);
  } catch (e: unknown) { res.status(400).json({ error: sanitizeError(e) }); }
});

rfpEthicsRouter.post("/coverage-marketplace/:id/claim", requireAuth as any, ensureWorkspaceAccess as any, async (req: any, res: any) => {
  try {
    const { claimedByEmployeeId, claimedByName } = req.body;
    const existing = await q(`SELECT * FROM shift_coverage_claims WHERE id=$1 AND workspace_id=$2`, [req.params.id, wid(req)]);
    if (!existing.length) return res.status(404).json({ error: "Not found" });
    if ((existing[0] as any).status !== "open") return res.status(409).json({ error: "Shift already claimed" });
    await q(`UPDATE shift_coverage_claims SET status='claimed', claimed_by_employee_id=$1, claimed_by_name=$2, claimed_at=NOW(), updated_at=NOW() WHERE id=$3`,
      [claimedByEmployeeId||null, claimedByName||null, req.params.id]);
    const rows = await q(`SELECT * FROM shift_coverage_claims WHERE id=$1`, [req.params.id]);
    res.json(rows[0]);
  } catch (e: unknown) { res.status(500).json({ error: sanitizeError(e) }); }
});

rfpEthicsRouter.post("/coverage-marketplace/:id/approve", requireAuth as any, ensureWorkspaceAccess as any, async (req: any, res: any) => {
  try {
    const { approvedBy } = req.body;
    await q(`UPDATE shift_coverage_claims SET status='approved', approved_by=$1, approved_at=NOW(), updated_at=NOW() WHERE id=$2 AND workspace_id=$3`,
      [approvedBy||null, req.params.id, wid(req)]);
    const rows = await q(`SELECT * FROM shift_coverage_claims WHERE id=$1`, [req.params.id]);
    res.json(rows[0]);
  } catch (e: unknown) { res.status(500).json({ error: sanitizeError(e) }); }
});
