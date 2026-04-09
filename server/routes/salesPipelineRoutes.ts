/**
 * Phase 35B — Autonomous Sales Engine & RFP Pipeline
 * Routes: /api/sales/leads, /api/sales/proposals, /api/sales/pipeline
 */
import { sanitizeError } from '../middleware/errorHandler';
import { Router } from "express";
import { pool } from "../db";
import { platformActionHub } from "../services/helpai/platformActionHub";
import { requireAuth, requireManager, type AuthenticatedRequest } from "../rbac";
import { meteredGemini } from "../services/billing/meteredGeminiClient";

const router = Router();

// ── LEADS ──────────────────────────────────────────────────────────────────

router.get("/leads", requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const wid = req.workspaceId;
    if (!wid) return res.status(400).json({ error: "Workspace required" });
    const { stage, assigned_to, lead_source, limit = 50, offset = 0 } = (req as any).query;
    const conditions = ["workspace_id = $1"];
    const params: any[] = [wid];
    let p = 2;
    if (stage) { conditions.push(`stage = $${p++}`); params.push(stage); }
    if (assigned_to) { conditions.push(`assigned_to = $${p++}`); params.push(assigned_to); }
    if (lead_source) { conditions.push(`lead_source = $${p++}`); params.push(lead_source); }
    const where = conditions.join(" AND ");
    const { rows } = await pool.query(
      `SELECT * FROM sales_leads WHERE ${where} ORDER BY created_at DESC LIMIT $${p} OFFSET $${p+1}`,
      [...params, parseInt(limit), parseInt(offset)]
    );
    const countRes = await pool.query(`SELECT COUNT(*) FROM sales_leads WHERE ${where}`, params);
    res.json({ leads: rows, total: parseInt(countRes.rows[0].count) });
  } catch (err: any) { res.status(500).json({ error: sanitizeError(err) }); }
});

router.post("/leads", requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const wid = req.workspaceId;
    if (!wid) return res.status(400).json({ error: "Workspace required" });
    const { companyName, contactName, contactEmail, contactPhone, leadSource, estimatedContractValue,
            estimatedOfficersNeeded, primaryPostType, operatingStates, notes, assignedTo, expectedCloseDate } = req.body;
    if (!companyName) return res.status(400).json({ error: "companyName required" });

    // Auto-score via Trinity (non-blocking — if fails, score stays 0)
    let leadScore = 50; // default
    try {
      const scoreResult = await meteredGemini.generate({
        workspaceId: wid,
        featureKey: "trinity_sales_lead_score",
        prompt: `Score this security services lead 0-100. Company: ${companyName}. Officers needed: ${estimatedOfficersNeeded ?? "unknown"}. Contract value: ${estimatedContractValue ?? "unknown"}. States: ${(operatingStates || []).join(", ") || "unknown"}. Return only a JSON object: {"score": <number>}`,
      });
      const match = scoreResult.text?.match(/"score"\s*:\s*(\d+)/);
      if (match) leadScore = Math.min(100, Math.max(0, parseInt(match[1])));
    } catch { /* non-fatal */ }

    const { rows } = await pool.query(
      `INSERT INTO sales_leads (workspace_id, company_name, contact_name, contact_email, contact_phone,
        lead_source, stage, lead_score, assigned_to, estimated_contract_value, estimated_officers_needed,
        primary_post_type, operating_states, notes, expected_close_date)
       VALUES ($1,$2,$3,$4,$5,$6,'captured',$7,$8,$9,$10,$11,$12,$13,$14)
       RETURNING *`,
      [wid, companyName, contactName, contactEmail, contactPhone, leadSource || "manual_entry", leadScore,
       assignedTo || req.user?.id, estimatedContractValue || null, estimatedOfficersNeeded || null,
       primaryPostType || null, operatingStates || [], notes || null, expectedCloseDate || null]
    );

    // Log activity
    await pool.query(
      `INSERT INTO sales_activities (lead_id, workspace_id, activity_type, direction, subject, actor_id)
       VALUES ($1,$2,'stage_change','outbound','Lead created',$3)`,
      [rows[0].id, wid, req.user?.id]
    );
    res.status(201).json(rows[0]);
  } catch (err: any) { res.status(500).json({ error: sanitizeError(err) }); }
});

router.patch("/leads/:id", requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const wid = req.workspaceId;
    if (!wid) return res.status(400).json({ error: "Workspace required" });
    const { id } = req.params;

    const existing = await pool.query(`SELECT * FROM sales_leads WHERE id=$1 AND workspace_id=$2`, [id, wid]);
    if (!existing.rows[0]) return res.status(404).json({ error: "Lead not found" });

    const allowed = ["companyName","contactName","contactEmail","contactPhone","leadSource","stage",
                     "lostReason","assignedTo","estimatedContractValue","estimatedOfficersNeeded",
                     "primaryPostType","operatingStates","notes","expectedCloseDate","trinityContext"];
    const colMap: Record<string,string> = {
      companyName:"company_name", contactName:"contact_name", contactEmail:"contact_email",
      contactPhone:"contact_phone", leadSource:"lead_source", lostReason:"lost_reason",
      assignedTo:"assigned_to", estimatedContractValue:"estimated_contract_value",
      estimatedOfficersNeeded:"estimated_officers_needed", primaryPostType:"primary_post_type",
      operatingStates:"operating_states", expectedCloseDate:"expected_close_date",
      trinityContext:"trinity_context",
    };

    const setClauses: string[] = [];
    const params: any[] = [];
    let p = 1;
    for (const key of allowed) {
      if (req.body[key] !== undefined) {
        const col = colMap[key] || key.replace(/([A-Z])/g, "_$1").toLowerCase();
        setClauses.push(`${col} = $${p++}`);
        params.push(req.body[key]);
      }
    }
    if (setClauses.length === 0) return res.status(400).json({ error: "No fields to update" });
    setClauses.push(`updated_at = NOW()`);
    params.push(id, wid);

    const { rows } = await pool.query(
      `UPDATE sales_leads SET ${setClauses.join(",")} WHERE id=$${p} AND workspace_id=$${p+1} RETURNING *`,
      params
    );

    // Log stage change if applicable
    if (req.body.stage && req.body.stage !== existing.rows[0].stage) {
      await pool.query(
        `INSERT INTO sales_activities (lead_id,workspace_id,activity_type,direction,subject,body,actor_id)
         VALUES ($1,$2,'stage_change','outbound',$3,$4,$5)`,
        [id, wid, `Stage: ${existing.rows[0].stage} → ${req.body.stage}`,
         `Transition from ${existing.rows[0].stage} to ${req.body.stage}`, req.user?.id]
      );
    }
    res.json(rows[0]);
  } catch (err: any) { res.status(500).json({ error: sanitizeError(err) }); }
});

router.post("/leads/:id/advance", requireManager, async (req: AuthenticatedRequest, res) => {
  try {
    const wid = req.workspaceId;
    if (!wid) return res.status(400).json({ error: "Workspace required" });
    const { id } = req.params;
    const STAGE_ORDER = ["captured","qualified","outreach_active","proposal_sent","proposal_approved",
                         "contract_sent","contract_executed","onboarded"];
    const lead = await pool.query(`SELECT * FROM sales_leads WHERE id=$1 AND workspace_id=$2`, [id, wid]);
    if (!lead.rows[0]) return res.status(404).json({ error: "Lead not found" });

    const currentIdx = STAGE_ORDER.indexOf(lead.rows[0].stage);
    if (currentIdx === -1 || currentIdx >= STAGE_ORDER.length - 1) {
      return res.status(400).json({ error: "Cannot advance from current stage" });
    }
    const nextStage = STAGE_ORDER[currentIdx + 1];
    const { rows } = await pool.query(
      `UPDATE sales_leads SET stage=$1, updated_at=NOW() WHERE id=$2 AND workspace_id=$3 RETURNING *`,
      [nextStage, id, wid]
    );
    await pool.query(
      `INSERT INTO sales_activities (lead_id,workspace_id,activity_type,direction,subject,body,actor_id)
       VALUES ($1,$2,'stage_change','outbound',$3,$4,$5)`,
      [id, wid, `Advanced to ${nextStage}`, `Manager advanced stage: ${lead.rows[0].stage} → ${nextStage}`, req.user?.id]
    );
    res.json(rows[0]);
  } catch (err: any) { res.status(500).json({ error: sanitizeError(err) }); }
});

// ── ACTIVITIES ─────────────────────────────────────────────────────────────

router.get("/leads/:id/activities", requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const wid = req.workspaceId;
    if (!wid) return res.status(400).json({ error: "Workspace required" });
    const { rows } = await pool.query(
      `SELECT * FROM sales_activities WHERE lead_id=$1 AND workspace_id=$2 ORDER BY timestamp DESC LIMIT 100`,
      [req.params.id, wid]
    );
    res.json(rows);
  } catch (err: any) { res.status(500).json({ error: sanitizeError(err) }); }
});

router.post("/leads/:id/activities", requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const wid = req.workspaceId;
    if (!wid) return res.status(400).json({ error: "Workspace required" });
    const { activityType, direction, subject, body } = req.body;
    const { rows } = await pool.query(
      `INSERT INTO sales_activities (lead_id,workspace_id,activity_type,direction,subject,body,actor_id)
       VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
      [req.params.id, wid, activityType || "note", direction || "outbound", subject, body, req.user?.id]
    );
    res.status(201).json(rows[0]);
  } catch (err: any) { res.status(500).json({ error: sanitizeError(err) }); }
});

// ── PROPOSALS ──────────────────────────────────────────────────────────────

router.post("/proposals/generate", requireManager, async (req: AuthenticatedRequest, res) => {
  try {
    const wid = req.workspaceId;
    if (!wid) return res.status(400).json({ error: "Workspace required" });
    const { leadId, monthlyRate, estimatedOfficers, contractTermMonths, servicesDescription } = req.body;
    if (!leadId) return res.status(400).json({ error: "leadId required" });

    const lead = await pool.query(`SELECT * FROM sales_leads WHERE id=$1 AND workspace_id=$2`, [leadId, wid]);
    if (!lead.rows[0]) return res.status(404).json({ error: "Lead not found" });

    const proposalNumber = `PROP-${Date.now().toString(36).toUpperCase()}`;
    const { rows } = await pool.query(
      `INSERT INTO sales_proposals (lead_id,workspace_id,proposal_number,status,services_description,
        estimated_officers,monthly_rate,contract_term_months,valid_until)
       VALUES ($1,$2,$3,'draft',$4,$5,$6,$7,NOW()+INTERVAL '30 days') RETURNING *`,
      [leadId, wid, proposalNumber, servicesDescription || null, estimatedOfficers || null, monthlyRate || null, contractTermMonths || 12]
    );

    await pool.query(
      `UPDATE sales_leads SET stage='proposal_sent', updated_at=NOW() WHERE id=$1 AND workspace_id=$2`,
      [leadId, wid]
    );
    await pool.query(
      `INSERT INTO sales_activities (lead_id,workspace_id,activity_type,direction,subject,actor_id)
       VALUES ($1,$2,'proposal','outbound','Proposal generated',$3)`,
      [leadId, wid, req.user?.id]
    );
    res.status(201).json(rows[0]);
  } catch (err: any) { res.status(500).json({ error: sanitizeError(err) }); }
});

router.post("/proposals/:id/send", requireManager, async (req: AuthenticatedRequest, res) => {
  try {
    const wid = req.workspaceId;
    if (!wid) return res.status(400).json({ error: "Workspace required" });
    const { rows } = await pool.query(
      `UPDATE sales_proposals SET status='sent', sent_at=NOW(), org_owner_signed_at=NOW(), updated_at=NOW()
       WHERE id=$1 AND workspace_id=$2 RETURNING *`,
      [req.params.id, wid]
    );
    if (!rows[0]) return res.status(404).json({ error: "Proposal not found" });
    res.json(rows[0]);
  } catch (err: any) { res.status(500).json({ error: sanitizeError(err) }); }
});

router.post("/proposals/:id/approve", requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const wid = req.workspaceId;
    if (!wid) return res.status(400).json({ error: "Workspace required" });
    const { rows } = await pool.query(
      `UPDATE sales_proposals SET status='approved', approved_at=NOW(), prospect_signed_at=NOW(), updated_at=NOW()
       WHERE id=$1 AND workspace_id=$2 RETURNING *`,
      [req.params.id, wid]
    );
    if (!rows[0]) return res.status(404).json({ error: "Proposal not found" });

    // Advance lead to proposal_approved
    await pool.query(
      `UPDATE sales_leads SET stage='proposal_approved', updated_at=NOW() WHERE id=$1 AND workspace_id=$2`,
      [rows[0].lead_id, wid]
    );
    res.json(rows[0]);
  } catch (err: any) { res.status(500).json({ error: sanitizeError(err) }); }
});

// ── PIPELINE ANALYTICS ─────────────────────────────────────────────────────

router.get("/pipeline/analytics", requireManager, async (req: AuthenticatedRequest, res) => {
  try {
    const wid = req.workspaceId;
    if (!wid) return res.status(400).json({ error: "Workspace required" });

    const stagesRes = await pool.query(
      `SELECT stage,
              COUNT(*) AS count,
              COALESCE(SUM(estimated_contract_value), 0) AS pipeline_value
       FROM sales_leads WHERE workspace_id=$1 GROUP BY stage`,
      [wid]
    );
    const totalRes = await pool.query(
      `SELECT COUNT(*) AS total,
              COUNT(*) FILTER (WHERE stage='onboarded') AS won,
              COUNT(*) FILTER (WHERE stage='lost') AS lost,
              COALESCE(AVG(lead_score),0) AS avg_score
       FROM sales_leads WHERE workspace_id=$1`, [wid]
    );
    const r = totalRes.rows[0];
    const total = parseInt(r.total) || 1;
    res.json({
      byStage: stagesRes.rows,
      winRate: ((parseInt(r.won) / total) * 100).toFixed(1),
      lossRate: ((parseInt(r.lost) / total) * 100).toFixed(1),
      totalLeads: r.total,
      avgLeadScore: parseFloat(r.avg_score).toFixed(0),
    });
  } catch (err: any) { res.status(500).json({ error: sanitizeError(err) }); }
});

// ── TRINITY ACTIONS ────────────────────────────────────────────────────────

export function registerSalesPipelineActions(): void {
  platformActionHub.registerAction({
    actionId: "sales.lead.score",
    name: "Score Sales Lead",
    category: "sales",
    description: "Score a lead 0-100 based on company size, urgency, and geographic fit.",
    requiredRoles: ["owner", "co_owner", "org_admin", "account_manager"],
    inputSchema: { type: 'object', required: ['leadId'], properties: { leadId: { type: 'string', description: 'Sales lead ID to score' } } },
    handler: async (request) => {
      const { workspaceId, payload } = request;
      if (!workspaceId) return { success: false, actionId: request.actionId, message: "workspace required", data: null };
      const leadId = payload?.leadId;
      if (!leadId) return { success: false, actionId: request.actionId, message: "leadId required", data: null };
      const lead = await pool.query(`SELECT * FROM sales_leads WHERE id=$1 AND workspace_id=$2`, [leadId, workspaceId]);
      if (!lead.rows[0]) return { success: false, actionId: request.actionId, message: "Lead not found", data: null };
      const l = lead.rows[0];
      // Simple scoring heuristic
      let score = 50;
      if (l.estimated_contract_value && parseFloat(l.estimated_contract_value) > 10000) score += 20;
      if (l.estimated_officers_needed && l.estimated_officers_needed > 5) score += 10;
      if (l.contact_email) score += 10;
      if ((l.operating_states || []).length > 0) score += 10;
      score = Math.min(100, score);
      await pool.query(`UPDATE sales_leads SET lead_score=$1, updated_at=NOW() WHERE id=$2`, [score, leadId]);
      return { success: true, actionId: request.actionId, message: `Lead scored: ${score}/100`, data: { score } };
    },
  });

  platformActionHub.registerAction({
    actionId: "sales.lead.qualify",
    name: "Qualify Sales Lead",
    category: "sales",
    description: "Assess lead and recommend next stage.",
    requiredRoles: ["owner", "co_owner", "org_admin", "account_manager"],
    inputSchema: { type: 'object', required: ['leadId'], properties: { leadId: { type: 'string', description: 'Sales lead ID to qualify' } } },
    handler: async (request) => {
      const { workspaceId, payload } = request;
      if (!workspaceId) return { success: false, actionId: request.actionId, message: "workspace required", data: null };
      const { rows } = await pool.query(
        `SELECT * FROM sales_leads WHERE id=$1 AND workspace_id=$2`, [payload?.leadId, workspaceId]
      );
      if (!rows[0]) return { success: false, actionId: request.actionId, message: "Lead not found", data: null };
      const recommended = rows[0].lead_score >= 60 ? "qualified" : "captured";
      return { success: true, actionId: request.actionId, message: `Recommended stage: ${recommended}`, data: { recommended, current: rows[0].stage } };
    },
  });

  platformActionHub.registerAction({
    actionId: "sales.outreach.draft",
    name: "Draft Outreach Email",
    category: "sales",
    description: "Draft personalized outreach email for org_owner review.",
    requiredRoles: ["owner", "co_owner", "org_admin", "account_manager"],
    inputSchema: { type: 'object', required: ['leadId'], properties: { leadId: { type: 'string', description: 'Sales lead ID to draft outreach for' }, tone: { type: 'string', description: 'Email tone: professional, casual, urgent', default: 'professional' } } },
    handler: async (request) => {
      const { workspaceId, payload } = request;
      if (!workspaceId) return { success: false, actionId: request.actionId, message: "workspace required", data: null };
      const { rows } = await pool.query(
        `SELECT * FROM sales_leads WHERE id=$1 AND workspace_id=$2`, [payload?.leadId, workspaceId]
      );
      if (!rows[0]) return { success: false, actionId: request.actionId, message: "Lead not found", data: null };
      const l = rows[0];
      const draft = `Subject: Security Services Partnership — ${l.company_name}\n\nDear ${l.contact_name || "Decision Maker"},\n\nWe have reviewed your security needs and believe we can provide exceptional coverage for ${l.company_name}. Our team specializes in ${l.primary_post_type || "comprehensive security solutions"}.\n\nI'd love to schedule a brief call to discuss your specific requirements.\n\nBest regards,\n[Your Name]`;
      return { success: true, actionId: request.actionId, message: "Outreach email drafted", data: { draft, leadId: l.id } };
    },
  });

  platformActionHub.registerAction({
    actionId: "sales.proposal.generate",
    name: "Generate Proposal",
    category: "sales",
    description: "Generate proposal from lead data.",
    requiredRoles: ["owner", "co_owner", "org_admin"],
    inputSchema: { type: 'object', required: ['leadId'], properties: { leadId: { type: 'string', description: 'Sales lead ID to generate proposal for' }, validDays: { type: 'integer', description: 'Days proposal is valid', default: 30 } } },
    handler: async (request) => {
      const { workspaceId, payload } = request;
      if (!workspaceId) return { success: false, actionId: request.actionId, message: "workspace required", data: null };
      const { rows } = await pool.query(
        `SELECT * FROM sales_leads WHERE id=$1 AND workspace_id=$2`, [payload?.leadId, workspaceId]
      );
      if (!rows[0]) return { success: false, actionId: request.actionId, message: "Lead not found", data: null };
      const l = rows[0];
      const proposalNumber = `PROP-${Date.now().toString(36).toUpperCase()}`;
      const { rows: p } = await pool.query(
        `INSERT INTO sales_proposals (lead_id,workspace_id,proposal_number,status,estimated_officers,valid_until)
         VALUES ($1,$2,$3,'draft',$4,NOW()+INTERVAL '30 days') RETURNING *`,
        [l.id, workspaceId, proposalNumber, l.estimated_officers_needed || 1]
      );
      return { success: true, actionId: request.actionId, message: "Proposal created", data: p[0] };
    },
  });

  platformActionHub.registerAction({
    actionId: "sales.pipeline.summary",
    name: "Pipeline Summary",
    category: "sales",
    description: "Pipeline value and conversion metrics.",
    requiredRoles: ["owner", "co_owner", "org_admin", "account_manager"],
    inputSchema: { type: 'object', properties: {} },
    handler: async (request) => {
      const { workspaceId } = request;
      if (!workspaceId) return { success: false, actionId: request.actionId, message: "workspace required", data: null };
      const { rows } = await pool.query(
        `SELECT stage, COUNT(*) AS count, COALESCE(SUM(estimated_contract_value),0) AS value
         FROM sales_leads WHERE workspace_id=$1 GROUP BY stage ORDER BY stage`,
        [workspaceId]
      );
      return { success: true, actionId: request.actionId, message: "Pipeline summary", data: { stages: rows } };
    },
  });

  platformActionHub.registerAction({
    actionId: "sales.lead.query",
    name: "Query Leads",
    category: "sales",
    description: "Query leads by criteria in natural language.",
    requiredRoles: ["owner", "co_owner", "org_admin", "account_manager"],
    inputSchema: { type: 'object', properties: { stage: { type: 'string', description: 'Filter by stage: captured, qualified, proposal_sent, negotiation, won, lost' }, minScore: { type: 'integer', description: 'Minimum lead score (0-100)' }, limit: { type: 'integer', default: 20 } } },
    handler: async (request) => {
      const { workspaceId, payload } = request;
      if (!workspaceId) return { success: false, actionId: request.actionId, message: "workspace required", data: null };
      const { stage, minScore } = payload || {};
      let q = `SELECT id, company_name, stage, lead_score, contact_email FROM sales_leads WHERE workspace_id=$1`;
      const params: any[] = [workspaceId];
      let p = 2;
      if (stage) { q += ` AND stage=$${p++}`; params.push(stage); }
      if (minScore) { q += ` AND lead_score >= $${p++}`; params.push(parseInt(minScore)); }
      q += ` ORDER BY lead_score DESC LIMIT 20`;
      const { rows } = await pool.query(q, params);
      return { success: true, actionId: request.actionId, message: `Found ${rows.length} leads`, data: { leads: rows } };
    },
  });
}

export default router;
