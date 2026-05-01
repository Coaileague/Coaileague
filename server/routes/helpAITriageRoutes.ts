/**
 * HELPAI TRIAGE ROUTES — Phase 63 (Semantic Audit Pass)
 *
 * POST /api/helpai/triage — Multi-tier autonomous resolution:
 *   Tier 0: FAQ lookup (instant answer)
 *   Tier 1: Trinity auto-action (account unlock, notification fix, onboarding reset, form resend, payroll dispute)
 *   Tier 2: Context-enriched response + Trinity intelligence routing
 *   Tier 3: HR/legal escalation — immediate human handoff, no Trinity attempt
 *
 * GET /api/support/my-workspace-history — Org owner transparency endpoint.
 */

import { Router } from 'express';
import type { Request, Response } from 'express';
import { pool } from '../db';
import { requireAuth } from '../auth';
import { executeSupportAction } from '../services/helpai/supportActionRegistry';
import { trinityResolutionFabric } from '../services/ai-brain/trinityResolutionFabric';
import { flagFaqCandidate, promoteQualifiedFaqCandidates } from '../services/helpai/faqLearningService';
import { trinityAuditIntelligenceService } from '../services/trinity/trinityAuditIntelligenceService';
import { createLogger } from '../lib/logger';
import { z } from 'zod';

const log = createLogger('HelpAITriage');
const router = Router();

interface AuthenticatedRequest extends Request {
  userId?: string;
  user?: any;
  workspaceId?: string;
}

const TRINITY_ACTOR_ID = 'trinity-system-actor-000000000000';

// ─── Message Classification ────────────────────────────────────────────────

const TRIAGE_CATEGORIES: Record<string, string[]> = {
  account_access: ['log in', 'login', 'locked out', 'locked', 'password', 'pin', '2fa', 'two factor', 'cannot access', 'reset pin', 'clock in pin', 'forgot password', 'cannot log', 'access denied'],
  scheduling_issue: ['schedule', 'shift', 'assigned', 'not on the schedule', 'missing shift', 'wrong shift', 'swap', 'trade', 'roster', 'no shifts', 'my shift'],
  payroll_dispute: ['paycheck', 'pay stub', 'hours wrong', 'wrong hours', 'not paid', 'payroll', 'direct deposit', 'overtime', 'missing pay', 'underpaid', 'pay date'],
  notification_not_received: ['notification', 'not receiving', 'no alert', 'no message', 'did not receive', 'sms', 'email alert', 'push notification', 'not getting alerts'],
  document_missing: ['document', 'offer letter', 'w-4', 'i-9', 'form', 'onboarding document', 'cannot find', 'missing document', 'paperwork', 'where is my'],
  onboarding_stuck: ['onboarding', 'stuck', 'not complete', 'waiting', 'activation', 'pending', 'new hire', 'getting started', 'cannot complete onboarding'],
  billing_question: ['billing', 'invoice', 'payment', 'charge', 'subscription', 'plan', 'seat', 'pricing'],
  compliance_alert: ['compliance', 'license', 'expired', 'certificate', 'renewal', 'tcole', 'bsis', 'guard card', 'expiring'],
  technical_error: ['error', 'bug', 'not working', 'broken', 'crash', 'page shows error', 'blank screen', 'cannot load', 'loading issue'],
  general_question: ['how do i', 'what is', 'where is', 'help me', 'explain', 'show me', 'tell me']
};

const TIER3_ESCALATION_KEYWORDS = [
  'hostile work', 'harassment', 'discrimination', 'complaint', 'legal', 'lawsuit',
  'fraud', 'theft', 'security incident', 'assault', 'threatened', 'unsafe', 'wrongful'
];

function classifyMessage(message: string): string {
  const lower = message.toLowerCase();
  for (const keyword of TIER3_ESCALATION_KEYWORDS) {
    if (lower.includes(keyword)) return 'hr_escalation';
  }
  let bestCategory = 'general_question';
  let bestScore = 0;
  for (const [category, keywords] of Object.entries(TRIAGE_CATEGORIES)) {
    let score = 0;
    for (const kw of keywords) {
      if (lower.includes(kw)) score++;
    }
    if (score > bestScore) { bestScore = score; bestCategory = category; }
  }
  return bestCategory;
}

// ─── FAQ Lookup ────────────────────────────────────────────────────────────

async function searchFAQ(message: string, workspaceId?: string): Promise<{ found: boolean; answer?: string; question?: string }> {
  const lower = message.toLowerCase();
  const words = lower.split(/\s+/).filter(w => w.length > 3);
  if (words.length === 0) return { found: false };

  const params: (string)[] = words.slice(0, 6).map(w => `%${w}%`);
  const conditions = params.map((_, i) => `(LOWER(question) LIKE $${i + 1} OR LOWER(answer) LIKE $${i + 1})`).join(' OR ');
  const wsIdx = params.length + 1;
  params.push(workspaceId || '');
  const wsCondition = workspaceId
    ? `AND (workspace_id IS NULL OR workspace_id = $${wsIdx})`
    : `AND workspace_id IS NULL`;

  const result = await pool.query(
    `SELECT question, answer FROM faq_entries
     WHERE status = 'published' ${wsCondition}
     AND (${conditions})
     ORDER BY created_at ASC
     LIMIT 1`,
    params
  );
  if (result.rows.length > 0) {
    return { found: true, answer: result.rows[0].answer, question: result.rows[0].question };
  }
  return { found: false };
}

// ─── Workspace Context Loader ──────────────────────────────────────────────

async function loadWorkspaceContext(workspaceId: string): Promise<Record<string, any>> {
  const [ws, empCount, activeShifts, openInvoices, recentTickets] = await Promise.all([
    pool.query(`SELECT id, name FROM workspaces WHERE id = $1`, [workspaceId]),
    pool.query(`SELECT COUNT(*) FROM employees WHERE workspace_id = $1 AND status = 'active'`, [workspaceId]),
    pool.query(`SELECT COUNT(*) FROM shifts WHERE workspace_id = $1 AND status IN ('open','assigned')`, [workspaceId]),
    pool.query(`SELECT COUNT(*) FROM invoices WHERE workspace_id = $1 AND status IN ('pending','overdue')`, [workspaceId]),
    pool.query(`SELECT ticket_number, subject, status, created_at FROM support_tickets WHERE workspace_id = $1 ORDER BY created_at DESC LIMIT 3`, [workspaceId])
  ]);
  return {
    workspace: ws.rows[0],
    activeEmployees: parseInt(empCount.rows[0].count),
    activeShifts: parseInt(activeShifts.rows[0].count),
    openInvoices: parseInt(openInvoices.rows[0].count),
    recentTickets: recentTickets.rows
  };
}

// ─── Employee Lookup (userId → employee record) ────────────────────────────

async function lookupEmployeeForUser(userId: string, workspaceId: string): Promise<{ id: string; status: string; firstName: string; lastName: string } | null> {
  const r = await pool.query(
    `SELECT e.id, e.status, e.first_name AS "firstName", e.last_name AS "lastName"
     FROM employees e
     JOIN users u ON u.email = e.email
     WHERE u.id = $1 AND e.workspace_id = $2
     LIMIT 1`,
    [userId, workspaceId]
  );
  return r.rows.length > 0 ? r.rows[0] : null;
}

// ─── Ticket Creator ────────────────────────────────────────────────────────

async function createSupportTicket(params: {
  workspaceId: string;
  userId?: string;
  employeeId?: string;
  message: string;
  category: string;
  priority?: string;
  trinityAttempted: boolean;
  trinityTranscript?: string;
  actionsJson?: any[];
  escalatedToHuman?: boolean;
  escalationReason?: string;
  resolvedByFaq?: boolean;
}): Promise<{ id: string; ticketNumber: string }> {
  const ticketNumber = `TKT-${new Date().toISOString().slice(0, 10).replace(/-/g, '')}-${Math.floor(10000 + Math.random() * 89999)}`;
  const status = params.resolvedByFaq || (params.trinityAttempted && !params.escalatedToHuman) ? 'resolved' : params.escalatedToHuman ? 'escalated' : 'open';
  const priority = params.priority || (params.escalatedToHuman ? 'high' : 'normal');

  const result = await pool.query(`
    INSERT INTO support_tickets (
      workspace_id, user_id, employee_id, ticket_number, type, subject, description, status, priority,
      category, assigned_to_trinity, trinity_attempted, trinity_transcript, trinity_actions_taken,
      human_escalated_at, escalation_reason, created_at, updated_at
    ) VALUES ($1,$2,$3,$4,'helpai_triage',$5,$6,$7,$8,
      $9, NOT $10, $11, $12, $13,
      CASE WHEN $10 THEN NOW() ELSE NULL END,
      $14, NOW(), NOW()
    ) RETURNING id, ticket_number
  `, [
    params.workspaceId,
    params.userId || null,
    params.employeeId || null,
    ticketNumber,
    params.message.slice(0, 255),
    params.message,
    status,
    priority,
    params.category,
    params.escalatedToHuman || false,
    params.trinityAttempted,
    params.trinityTranscript || params.message,
    JSON.stringify(params.actionsJson || []),
    params.escalationReason || null,
  ]);
  return { id: result.rows[0].id, ticketNumber: result.rows[0].ticket_number };
}

// ─── Category-Specific Auto-Resolution Handlers ───────────────────────────

async function tryResolveAccountAccess(
  userId: string | undefined,
  workspaceId: string,
  message: string,
  actionsLog: any[]
): Promise<{ resolved: boolean; message: string }> {
  if (!userId) {
    return { resolved: false, message: 'For account access issues, use the Forgot Password link on the login screen. If your account is locked, contact support.' };
  }
  const lockCheck = await pool.query(`SELECT locked_until, login_attempts, email FROM users WHERE id = $1`, [userId]);
  if (lockCheck.rows.length > 0 && lockCheck.rows[0].locked_until) {
    const r = await executeSupportAction({
      actionType: 'support.account.unlock',
      workspaceId,
      targetEntityType: 'user',
      targetEntityId: userId,
      reason: `User self-reported: ${message}`,
      actorId: TRINITY_ACTOR_ID,
      actorType: 'trinity'
    });
    if (r.success) {
      actionsLog.push({ action: 'account.unlock', success: true, detail: r.actionDescription });
      return { resolved: true, message: 'Your account has been unlocked by Trinity. You can now log in. If you continue to experience issues, contact support.' };
    }
  }
  return { resolved: false, message: 'For account access issues, please use the Forgot Password link on the login screen. If your account remains locked, a support agent will unlock it within minutes.' };
}

async function tryResolveOnboardingStuck(
  userId: string | undefined,
  workspaceId: string,
  message: string,
  actionsLog: any[]
): Promise<{ resolved: boolean; message: string }> {
  if (!userId) {
    return { resolved: false, message: 'If your onboarding is stuck, try refreshing the page. A support agent has been assigned to review your progress.' };
  }
  const emp = await lookupEmployeeForUser(userId, workspaceId);
  if (!emp) {
    return { resolved: false, message: 'A support agent will review your onboarding progress and reach out to you shortly.' };
  }

  const progress = await pool.query(
    `SELECT id, status, task_type FROM employee_onboarding_progress WHERE employee_id = $1 AND workspace_id = $2`,
    [emp.id, workspaceId]
  );

  let actionsPerformed = 0;

  // Reset any stuck tasks
  for (const task of progress.rows.filter((t: any) => t.status === 'stuck' || t.status === 'error')) {
    const r = await executeSupportAction({
      actionType: 'support.onboarding.reset_task',
      workspaceId,
      targetEntityType: 'employee',
      targetEntityId: emp.id,
      reason: `User self-reported onboarding stuck: ${message}`,
      actorId: TRINITY_ACTOR_ID,
      actorType: 'trinity',
      correctionData: { employeeId: emp.id, taskType: task.task_type }
    });
    if (r.success) {
      actionsLog.push({ action: 'onboarding.reset_task', taskType: task.task_type, success: true });
      actionsPerformed++;
    }
  }

  // If employee is pending, trigger activation
  if (emp.status === 'pending') {
    const r = await executeSupportAction({
      actionType: 'support.onboarding.trigger_activation',
      workspaceId,
      targetEntityType: 'employee',
      targetEntityId: emp.id,
      reason: `User self-reported onboarding stuck — activating pending employee: ${message}`,
      actorId: TRINITY_ACTOR_ID,
      actorType: 'trinity'
    });
    if (r.success) {
      actionsLog.push({ action: 'onboarding.trigger_activation', success: true });
      actionsPerformed++;
    }
  }

  if (actionsPerformed > 0) {
    return { resolved: true, message: `Trinity has reset your onboarding progress and cleared any stuck tasks. Please refresh your onboarding page and continue from where you left off. If any steps remain blocked, contact support.` };
  }

  // Also use trinityResolutionFabric for AI-powered delegation
  try {
    const fabricResult = await trinityResolutionFabric.resolve({
      type: 'onboarding_stuck',
      workspaceId,
      targetEntityId: emp.id,
      targetEntityType: 'employee',
      description: `Employee ${emp.firstName} ${emp.lastName} self-reported onboarding stuck: ${message}`,
      priority: 'high',
      sourceSystem: 'helpai_triage',
    });
    if (fabricResult.resolved) {
      actionsLog.push({ action: 'fabric.onboarding_stuck', success: true, trinityMessage: fabricResult.trinityMessage });
      return { resolved: true, message: 'Trinity has initiated an onboarding recovery sequence. Your administrator will be notified to assist you. Please allow a few minutes for the process to complete.' };
    }
  } catch (_err) { /* fabric is best-effort */ }

  return { resolved: false, message: 'Your onboarding issue has been flagged and a support agent will reset any stuck tasks within 10 minutes.' };
}

async function tryResolveDocumentMissing(
  userId: string | undefined,
  workspaceId: string,
  message: string,
  actionsLog: any[]
): Promise<{ resolved: boolean; message: string }> {
  if (!userId) {
    return { resolved: false, message: 'Please check Documents in the main menu. If the document is missing, a support agent will resend it.' };
  }

  // Look up pending form invitations for this user
  const invitations = await pool.query(
    `SELECT fi.id, fi.sent_to_email, fi.form_id, fi.status, fi.context_id
     FROM form_invitations fi
     JOIN users u ON u.email = fi.sent_to_email
     WHERE u.id = $1
       AND fi.workspace_id = $2
       AND fi.status IN ('sent','pending','expired')
     ORDER BY fi.created_at DESC
     LIMIT 3`,
    [userId, workspaceId]
  ).catch(() => ({ rows: [] as any[] }));

  let actionsPerformed = 0;
  for (const inv of invitations.rows) {
    const r = await executeSupportAction({
      actionType: 'support.form.resend_invitation',
      workspaceId,
      targetEntityType: 'form_invitation',
      targetEntityId: inv.id,
      reason: `User self-reported missing document: ${message}`,
      actorId: TRINITY_ACTOR_ID,
      actorType: 'trinity'
    });
    if (r.success) {
      actionsLog.push({ action: 'form.resend_invitation', invitationId: inv.id, success: true });
      actionsPerformed++;
    }
  }

  if (actionsPerformed > 0) {
    return { resolved: true, message: `Trinity has resent your form invitation(s). Please check your email for a new link. If you still cannot find your documents, contact support with your name and organization.` };
  }
  return { resolved: false, message: 'Please check Documents in the main menu. If the document link is expired, a support agent will resend it to your email on file.' };
}

async function tryResolveNotificationIssue(
  userId: string | undefined,
  workspaceId: string,
  message: string,
  actionsLog: any[]
): Promise<{ resolved: boolean; message: string }> {
  if (!userId) {
    return { resolved: false, message: 'Go to Settings > Notifications to ensure SMS and email alerts are enabled.' };
  }
  const r = await executeSupportAction({
    actionType: 'support.notification.fix_preferences',
    workspaceId,
    targetEntityType: 'user',
    targetEntityId: userId,
    reason: `User self-reported not receiving notifications: ${message}`,
    actorId: TRINITY_ACTOR_ID,
    actorType: 'trinity'
  });
  if (r.success) {
    actionsLog.push({ action: 'notification.fix_preferences', success: true });
    return { resolved: true, message: 'Trinity has checked and restored your notification preferences. You should now receive alerts. Please also ensure your phone number is correct in Settings > Profile.' };
  }
  return { resolved: false, message: 'Go to Settings > Notifications to verify SMS and email are enabled. If still not receiving, contact support.' };
}

async function tryResolvePayrollDispute(
  userId: string | undefined,
  workspaceId: string,
  message: string,
  actionsLog: any[]
): Promise<{ resolved: boolean; message: string }> {
  const emp = userId ? await lookupEmployeeForUser(userId, workspaceId) : null;
  const r = await executeSupportAction({
    actionType: 'support.payroll.dispute_review',
    workspaceId,
    targetEntityType: 'employee',
    targetEntityId: emp?.id || workspaceId,
    reason: `Employee self-reported payroll dispute: ${message}`,
    actorId: TRINITY_ACTOR_ID,
    actorType: 'trinity',
    correctionData: emp ? {
      employeeId: emp.id,
      subject: `Payroll Dispute: ${message.slice(0, 100)}`,
    } : undefined
  });
  if (r.success) {
    actionsLog.push({ action: 'payroll.dispute_review', success: true, detail: r.actionDescription });
    return { resolved: true, message: 'Trinity has created a high-priority payroll dispute ticket. A payroll supervisor will verify your hours within 24 hours and correct any discrepancies. Your ticket number is in your support history.' };
  }
  return { resolved: false, message: 'Your payroll concern has been logged with high priority. A supervisor will review and respond within 24 hours.' };
}

// ─── Auditor HelpAI (Phase 6) ──────────────────────────────────────────────
// Compliance-scoped HelpAI for DPS/regulatory auditors. Read-only — never
// exposes financial, payroll, or commercial data. Authorized under TX OC §1702.
async function handleAuditorHelpAI(
  query: string,
  workspaceId: string,
  _auditorId: string,
): Promise<{ reply: string; resolved: boolean }> {
  if (!workspaceId) {
    return { reply: 'Auditor session missing workspace context. Please start from an approved audit link.', resolved: true };
  }

  const OFFICER_LIST_PATTERN = /\b(list|show|all|give me|roster|directory).{0,25}(officers?|employees?|staff|guards?)\b/i;
  const LICENSE_PATTERN = /\b(licens|certif|guard\s*card|registered|commissioned)\b/i;
  const INCIDENT_PATTERN = /\b(incident|report|use\s*of\s*force|UOF|use-of-force)\b/i;
  const PAYROLL_PATTERN = /\b(pay(roll|check|rate|stub)?|wage|salary|compensation|earnings)\b/i;
  const FINANCIAL_PATTERN = /\b(invoice|billing|revenue|profit|bank|account\s*balance)\b/i;
  const EXPIRING_PATTERN = /\b(expir|expiring|upcoming\s*renewal|renewal)\b/i;

  if (PAYROLL_PATTERN.test(query) || FINANCIAL_PATTERN.test(query)) {
    return {
      reply:
        "I'm not able to share payroll, billing, or financial information with auditors. " +
        'Per Texas OC Chapter 1702, auditor access is limited to licensing, certification, ' +
        'and compliance records. If you need wage records for a specific officer under a ' +
        'court order, please work with the organization directly.',
      resolved: true,
    };
  }

  if (EXPIRING_PATTERN.test(query) && LICENSE_PATTERN.test(query)) {
    try {
      const { rows } = await pool.query(
        `SELECT (e.first_name || ' ' || e.last_name) AS name,
                e.employee_number, e.guard_card_number, e.guard_card_expiry_date,
                e.guard_card_status, e.is_armed
           FROM employees e
          WHERE e.workspace_id = $1
            AND e.is_active = TRUE
            AND e.guard_card_expiry_date IS NOT NULL
            AND e.guard_card_expiry_date <= NOW() + INTERVAL '60 days'
          ORDER BY e.guard_card_expiry_date ASC
          LIMIT 50`,
        [workspaceId],
      );
      if (!rows.length) {
        return { reply: 'No officers have licenses expiring within 60 days.', resolved: true };
      }
      const summary = rows.map((r: any) => {
        const expiry = r.guard_card_expiry_date ? new Date(r.guard_card_expiry_date).toLocaleDateString() : 'N/A';
        return `• ${r.name} (${r.employee_number || 'N/A'}) — ${r.is_armed ? 'Armed' : 'Unarmed'} — Expires: ${expiry}`;
      }).join('\n');
      return { reply: `Officers with licenses expiring in 60 days (${rows.length}):\n\n${summary}`, resolved: true };
    } catch (err: unknown) {
      return { reply: 'Unable to retrieve expiry data right now. Please try again.', resolved: false };
    }
  }

  if (OFFICER_LIST_PATTERN.test(query) || LICENSE_PATTERN.test(query)) {
    try {
      const { rows } = await pool.query(
        `SELECT (e.first_name || ' ' || e.last_name) AS name,
                e.employee_number,
                e.guard_card_status,
                e.guard_card_number,
                e.guard_card_expiry_date,
                e.is_armed,
                e.is_active
           FROM employees e
          WHERE e.workspace_id = $1
            AND e.is_active = TRUE
          ORDER BY e.last_name, e.first_name
          LIMIT 500`,
        [workspaceId],
      );
      if (!rows.length) return { reply: 'No active officers found in this workspace.', resolved: true };
      const summary = rows.map((r: any) => {
        const status = (r.guard_card_status || 'unknown').replace(/_/g, ' ');
        const expiry = r.guard_card_expiry_date ? new Date(r.guard_card_expiry_date).toLocaleDateString() : 'N/A';
        return `• ${r.name} (${r.employee_number || 'N/A'}) — ${r.is_armed ? 'Armed' : 'Unarmed'} — ${status} — Expires: ${expiry}`;
      }).join('\n');
      return {
        reply: `Active officers in this organization (${rows.length} total):\n\n${summary}`,
        resolved: true,
      };
    } catch (err: unknown) {
      return { reply: 'Unable to retrieve officer records right now. Please try again.', resolved: false };
    }
  }

  if (INCIDENT_PATTERN.test(query)) {
    try {
      const { rows } = await pool.query(
        `SELECT ir.incident_number, ir.incident_date, ir.incident_type,
                ir.location, ir.severity,
                (e.first_name || ' ' || e.last_name) AS officer_name
           FROM incident_reports ir
           LEFT JOIN employees e ON e.id = ir.reporting_officer_id
          WHERE ir.workspace_id = $1
          ORDER BY ir.incident_date DESC LIMIT 25`,
        [workspaceId],
      );
      if (!rows.length) return { reply: 'No incident reports on file.', resolved: true };
      const summary = rows.map((r: any) =>
        `• ${r.incident_number || 'N/A'} — ${new Date(r.incident_date).toLocaleDateString()} — ${r.incident_type || 'general'} — ${r.severity || 'low'} — Officer: ${r.officer_name || 'Unknown'}`,
      ).join('\n');
      return { reply: `Recent incident reports (last 25):\n\n${summary}`, resolved: true };
    } catch (err: unknown) {
      return { reply: 'Unable to retrieve incident reports right now. Please try again.', resolved: false };
    }
  }

  return {
    reply:
      "I can help with officer licensing records, certifications, expiring guard cards, and incident reports. " +
      "What specific information do you need for your audit?",
    resolved: false,
  };
}

// ─── Main Triage Handler ───────────────────────────────────────────────────

router.post('/triage', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const schema = z.object({
      message: z.string().min(1).max(2000),
      workspaceId: z.string().optional(),
      userId: z.string().optional()
    });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: 'message is required' });

    const { message } = parsed.data;
    // Never accept workspaceId from the request body — always derive it from the
    // authenticated session to prevent cross-tenant workspace confusion.
    const workspaceId = req.workspaceId || req.user?.workspaceId;
    const userId = req.userId;

    const category = classifyMessage(message);
    const actionsLog: any[] = [];

    // ── Phase 6: Auditor HelpAI branch ─────────────────────────────────────
    // When the caller is a DPS/regulatory auditor, route through Trinity
    // Audit Intelligence — a full AI session backed by a complete brief of
    // who the auditor is, the tenant's compliance history, open findings,
    // overdue conditions, and live license/incident snapshot.
    // Financial data, payroll, and banking are hard-blocked at the service layer.
    const isAuditorSession = req.workspaceRole === 'auditor';
    if (isAuditorSession) {
      try {
        const auditorId = req.user?.id || userId || '';
        const brief = await trinityAuditIntelligenceService.buildAuditorBrief(
          auditorId,
          workspaceId || '',
        );

        if (brief) {
          // Full Trinity AI call with audit-scoped system prompt
          const auditSystemPrompt = trinityAuditIntelligenceService.buildAuditSystemPrompt(brief);
          const { generateGeminiResponse } = await import('../gemini');
          const reply = await generateGeminiResponse({
            message,
            systemPrompt: auditSystemPrompt,
            workspaceId: workspaceId || '',
            userId: auditorId,
          });
          return res.json({
            category: 'auditor_query',
            trinityAttempted: true,
            resolved: true,
            message: reply,
            language: 'en',
            auditContext: {
              auditorName: brief.auditor.name,
              workspaceName: brief.workspaceName,
              openFindings: brief.history.openFindings.length,
              overdueConditions: brief.history.overdueConditions.length,
            },
          });
        }
      } catch (auditErr: unknown) {
        log.warn('[HelpAITriage] Audit intelligence failed, falling back to pattern handler:', auditErr?.message);
      }

      // Fallback: simple pattern-based handler when AI layer fails
      const auditResponse = await handleAuditorHelpAI(message, workspaceId || '', userId || '');
      return res.json({
        category: 'auditor_query',
        trinityAttempted: true,
        resolved: auditResponse.resolved,
        message: auditResponse.reply,
        language: 'en',
      });
    }

    // ── TIER 3: Immediate human escalation — no Trinity attempt ──
    if (category === 'hr_escalation') {
      const ticket = await createSupportTicket({
        workspaceId: workspaceId || '',
        userId,
        message,
        category: 'hr_escalation',
        priority: 'urgent',
        trinityAttempted: false,
        escalatedToHuman: true,
        escalationReason: 'Sensitive HR issue requiring human judgment',
        trinityTranscript: `User: ${message}`
      });
      return res.status(201).json({
        category: 'hr_escalation',
        trinityAttempted: false,
        resolved: false,
        escalatedToHuman: true,
        escalationReason: 'Your concern has been flagged for a human support agent.',
        ticketId: ticket.id,
        ticketNumber: ticket.ticketNumber,
        message: 'Your concern has been received and assigned to a support specialist. Someone will reach out to you shortly.',
        language: 'en'
      });
    }

    // ── TIER 0: FAQ search — instant answer from knowledge base ──
    const faqResult = workspaceId ? await searchFAQ(message, workspaceId) : { found: false };
    if (faqResult.found) {
      const ticket = await createSupportTicket({
        workspaceId: workspaceId || '',
        userId,
        message,
        category,
        trinityAttempted: true,
        resolvedByFaq: true,
        trinityTranscript: `User: ${message}\nTrinity (FAQ): ${faqResult.answer}`
      });
      return res.status(201).json({
        category,
        trinityAttempted: true,
        resolved: true,
        answeredFromFaq: true,
        ticketId: ticket.id,
        ticketNumber: ticket.ticketNumber,
        message: faqResult.answer,
        sourceQuestion: faqResult.question,
        language: 'en'
      });
    }

    // ── TIER 1: Trinity auto-resolution by category ──
    let workspaceContext: Record<string, unknown> = {};
    if (workspaceId) {
      workspaceContext = await loadWorkspaceContext(workspaceId).catch(() => ({}));
    }

    let resolved = false;
    let trinityMessage = '';

    if (workspaceId) {
      switch (category) {
        case 'account_access': {
          const r = await tryResolveAccountAccess(userId, workspaceId, message, actionsLog);
          resolved = r.resolved;
          trinityMessage = r.message;
          break;
        }
        case 'notification_not_received': {
          const r = await tryResolveNotificationIssue(userId, workspaceId, message, actionsLog);
          resolved = r.resolved;
          trinityMessage = r.message;
          break;
        }
        case 'onboarding_stuck': {
          const r = await tryResolveOnboardingStuck(userId, workspaceId, message, actionsLog);
          resolved = r.resolved;
          trinityMessage = r.message;
          break;
        }
        case 'document_missing': {
          const r = await tryResolveDocumentMissing(userId, workspaceId, message, actionsLog);
          resolved = r.resolved;
          trinityMessage = r.message;
          break;
        }
        case 'payroll_dispute': {
          const r = await tryResolvePayrollDispute(userId, workspaceId, message, actionsLog);
          resolved = r.resolved;
          trinityMessage = r.message;
          break;
        }
        default: {
          // TIER 2: Context-enriched canned response + log for FAQ candidate
          trinityMessage = generateContextualResponse(category, workspaceContext, message);
          await flagFaqCandidate(message, workspaceId, category);
        }
      }
    } else {
      trinityMessage = generateContextualResponse(category, workspaceContext, message);
    }

    // Create ticket with full Trinity state
    const ticket = await createSupportTicket({
      workspaceId: workspaceId || '',
      userId,
      message,
      category,
      trinityAttempted: true,
      resolvedByFaq: resolved,
      trinityTranscript: `User: ${message}\nTrinity: ${trinityMessage}`,
      actionsJson: actionsLog
    });

    // Background: promote qualified FAQ candidates (fire-and-forget)
    if (workspaceId) {
      promoteQualifiedFaqCandidates().catch((err: any) => log.warn('[EventBus] Publish failed (non-blocking):', err?.message));
    }

    return res.status(201).json({
      category,
      trinityAttempted: true,
      resolved,
      escalatedToHuman: false,
      answeredFromFaq: false,
      ticketId: ticket.id,
      ticketNumber: ticket.ticketNumber,
      message: trinityMessage,
      actionsPerformed: actionsLog.length,
      language: 'en',
      workspaceContext: resolved ? undefined : {
        employeeCount: workspaceContext.activeEmployees,
        workspaceName: workspaceContext.workspace?.name
      }
    });

  } catch (err) {
    log.error('HelpAI triage failed', { err });
    res.status(500).json({ error: 'Triage failed' });
  }
});

// ─── Contextual Response Generator (Tier 2 fallback) ──────────────────────

function generateContextualResponse(category: string, ctx: Record<string, unknown>, message: string): string {
  const orgName = ctx.workspace?.name ? `for ${ctx.workspace.name}` : '';
  switch (category) {
    case 'scheduling_issue':
      return `I see you have a scheduling concern. Your ticket has been created and assigned to your schedule supervisor ${orgName}. They will review your schedule and follow up. You can also view your schedule in the Schedule section.`;
    case 'billing_question':
      return `Your billing inquiry has been logged. A platform administrator will review and respond within one business day. For urgent billing issues, email billing@coaileague.com.`;
    case 'compliance_alert':
      return `Your compliance concern has been noted. Please upload any renewed documents in Documents > Compliance Evidence. If already uploaded, a compliance officer will verify within 24 hours.`;
    case 'technical_error':
      return `Your technical issue has been logged with high priority. Please try clearing your browser cache and refreshing. If the error persists, our technical team will investigate your ticket.`;
    default:
      return `Thank you for reaching out. Your question has been logged and a support agent will respond. For urgent issues, contact your supervisor directly.`;
  }
}

// ─── GET /api/support/my-workspace-history ────────────────────────────────

router.get('/my-workspace-history', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const workspaceId = req.user?.workspaceId || req.workspaceId;
    if (!workspaceId) return res.status(400).json({ error: 'Workspace context required' });

    const [tickets, actions, alerts] = await Promise.all([
      pool.query(`
        SELECT id, ticket_number, type, subject, status, priority, category,
               trinity_attempted, trinity_actions_taken, resolution_method,
               human_escalated_at, created_at, updated_at
        FROM support_tickets
        WHERE workspace_id = $1
        ORDER BY created_at DESC
        LIMIT 50
      `, [workspaceId]),
      pool.query(`
        SELECT sa.id, sa.action_type, sa.action_description, sa.performed_at,
               sa.performed_by, sa.success, sa.before_state, sa.after_state
        FROM support_actions sa
        WHERE sa.workspace_id = $1
        ORDER BY sa.performed_at DESC
        LIMIT 30
      `, [workspaceId]),
      pool.query(`
        SELECT id, alert_type, description, priority, acknowledged, created_at
        FROM helpai_proactive_alerts
        WHERE workspace_id = $1
        ORDER BY created_at DESC
        LIMIT 20
      `, [workspaceId])
    ]);

    res.json({
      workspaceId,
      tickets: tickets.rows,
      supportActions: actions.rows,
      proactiveAlerts: alerts.rows,
      summary: {
        totalTickets: tickets.rows.length,
        resolvedByTrinity: tickets.rows.filter(t => t.trinity_attempted && t.status === 'resolved').length,
        escalatedToHuman: tickets.rows.filter(t => t.human_escalated_at).length,
        openTickets: tickets.rows.filter(t => t.status === 'open').length,
      }
    });
  } catch (err) {
    log.error('my-workspace-history failed', { err });
    res.status(500).json({ error: 'Failed to load support history' });
  }
});

export default router;
