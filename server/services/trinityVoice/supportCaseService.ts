/**
 * TRINITY VOICE SUPPORT CASE SERVICE
 * ====================================
 * Manages voice support cases (cause numbers), human agent directory,
 * escalation notifications, and case resolution workflow.
 *
 * Cause Number format: CSP-YYYYMMDD-XXXX
 * e.g. CSP-20260330-0042
 */

import { pool } from '../../db';
import { createLogger } from '../../lib/logger';

const log = createLogger('SupportCaseService');

export interface SupportCase {
  id: string;
  workspace_id: string;
  case_number: string;
  call_session_id?: string;
  caller_number?: string;
  caller_name?: string;
  issue_summary: string;
  ai_resolution_attempted: boolean;
  ai_resolution_text?: string;
  ai_model_used?: string;
  status: 'open' | 'in_progress' | 'resolved';
  resolved_at?: Date;
  resolved_by?: string;
  resolution_notes?: string;
  agent_notified: boolean;
  notification_sent_at?: Date;
  language: string;
  transcript?: string;
  created_at: Date;
  updated_at: Date;
}

export interface SupportAgent {
  id: string;
  workspace_id: string;
  name: string;
  email?: string;
  phone?: string;
  role: string;
  notification_channels: string[];
  is_active: boolean;
}

// ─── Cause Number Generation ──────────────────────────────────────────────────

function formatDateStamp(): string {
  const d = new Date();
  return `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`;
}

async function generateCauseNumber(workspaceId: string): Promise<string> {
  const dateStamp = formatDateStamp();
  const prefix = `CSP-${dateStamp}-`;

  const result = await pool.query(
    `SELECT COUNT(*) AS cnt FROM voice_support_cases
     WHERE workspace_id = $1 AND case_number LIKE $2`,
    [workspaceId, `${prefix}%`]
  );
  const seq = (parseInt(result.rows[0]?.cnt || '0', 10) + 1).toString().padStart(4, '0');
  return `${prefix}${seq}`;
}

// ─── Case Creation ─────────────────────────────────────────────────────────────

export async function createSupportCase(params: {
  workspaceId: string;
  callSessionId?: string;
  callerNumber?: string;
  callerName?: string;
  issueSummary: string;
  aiResolutionAttempted: boolean;
  aiResolutionText?: string;
  aiModelUsed?: string;
  language?: string;
  transcript?: string;
}): Promise<SupportCase> {
  const caseNumber = await generateCauseNumber(params.workspaceId);

  const res = await pool.query(
    `INSERT INTO voice_support_cases
     (id, workspace_id, case_number, call_session_id, caller_number, caller_name,
      issue_summary, ai_resolution_attempted, ai_resolution_text, ai_model_used,
      status, language, transcript, agent_notified,
      created_at, updated_at)
     VALUES (gen_random_uuid()::text, $1, $2, $3, $4, $5, $6, $7, $8, $9,
             'open', $10, $11, false, NOW(), NOW())
     RETURNING *`,
    [
      params.workspaceId,
      caseNumber,
      params.callSessionId || null,
      params.callerNumber || null,
      params.callerName || null,
      params.issueSummary,
      params.aiResolutionAttempted,
      params.aiResolutionText || null,
      params.aiModelUsed || null,
      params.language || 'en',
      params.transcript || null,
    ]
  );

  log.info(`[SupportCase] Created case ${caseNumber} for workspace ${params.workspaceId}`);
  return res.rows[0] as SupportCase;
}

// ─── Case Lookup ───────────────────────────────────────────────────────────────

export async function findCaseByNumber(
  caseNumber: string,
  workspaceId?: string
): Promise<SupportCase | null> {
  const normalizedNumber = caseNumber.trim().toUpperCase();
  const query = workspaceId
    ? `SELECT * FROM voice_support_cases WHERE case_number = $1 AND workspace_id = $2 LIMIT 1`
    : `SELECT * FROM voice_support_cases WHERE case_number = $1 LIMIT 1`;
  const params = workspaceId ? [normalizedNumber, workspaceId] : [normalizedNumber];
  const res = await pool.query(query, params);
  return res.rows[0] || null;
}

export async function findCaseBySid(callSessionId: string): Promise<SupportCase | null> {
  const res = await pool.query(
    `SELECT * FROM voice_support_cases WHERE call_session_id = $1 LIMIT 1`,
    [callSessionId]
  );
  return res.rows[0] || null;
}

export async function listOpenCases(workspaceId: string, limit = 50): Promise<SupportCase[]> {
  const res = await pool.query(
    `SELECT * FROM voice_support_cases
     WHERE workspace_id = $1 AND status != 'resolved'
     ORDER BY created_at DESC LIMIT $2`,
    [workspaceId, limit]
  );
  return res.rows as SupportCase[];
}

export async function listAllCases(workspaceId: string, limit = 100): Promise<SupportCase[]> {
  const res = await pool.query(
    `SELECT * FROM voice_support_cases
     WHERE workspace_id = $1
     ORDER BY created_at DESC LIMIT $2`,
    [workspaceId, limit]
  );
  return res.rows as SupportCase[];
}

// ─── Case Resolution ───────────────────────────────────────────────────────────

export async function resolveSupportCase(params: {
  caseNumber: string;
  workspaceId?: string;
  resolvedBy: string;
  resolutionNotes?: string;
}): Promise<SupportCase | null> {
  const existing = await findCaseByNumber(params.caseNumber, params.workspaceId);
  if (!existing) return null;

  const res = await pool.query(
    `UPDATE voice_support_cases
     SET status = 'resolved', resolved_at = NOW(), resolved_by = $1,
         resolution_notes = $2, updated_at = NOW()
     WHERE case_number = $3
     RETURNING *`,
    [params.resolvedBy, params.resolutionNotes || null, params.caseNumber.trim().toUpperCase()]
  );

  log.info(`[SupportCase] Case ${params.caseNumber} resolved by ${params.resolvedBy}`);
  return res.rows[0] || null;
}

export async function updateCaseTranscript(caseNumber: string, transcript: string): Promise<void> {
  await pool.query(
    `UPDATE voice_support_cases SET transcript = $1, updated_at = NOW() WHERE case_number = $2`,
    [transcript, caseNumber.toUpperCase()]
  ).catch((err) => log.warn('[supportCaseService] Fire-and-forget failed:', err));
}

export async function markCaseAgentNotified(caseNumber: string): Promise<void> {
  await pool.query(
    `UPDATE voice_support_cases
     SET agent_notified = true, notification_sent_at = NOW(), updated_at = NOW()
     WHERE case_number = $1`,
    [caseNumber.toUpperCase()]
  ).catch((err) => log.warn('[supportCaseService] Fire-and-forget failed:', err));
}

// ─── Human Agent Directory ─────────────────────────────────────────────────────

export async function getActiveAgents(workspaceId: string): Promise<SupportAgent[]> {
  const res = await pool.query(
    `SELECT * FROM voice_support_agents
     WHERE workspace_id = $1 AND is_active = true
     ORDER BY name`,
    [workspaceId]
  );
  return res.rows.map(r => ({
    ...r,
    notification_channels: Array.isArray(r.notification_channels)
      ? r.notification_channels
      : (typeof r.notification_channels === 'string'
          ? JSON.parse(r.notification_channels)
          : ['email']),
  })) as SupportAgent[];
}

export async function getAllAgents(workspaceId: string): Promise<SupportAgent[]> {
  const res = await pool.query(
    `SELECT * FROM voice_support_agents WHERE workspace_id = $1 ORDER BY name`,
    [workspaceId]
  );
  return res.rows.map(r => ({
    ...r,
    notification_channels: Array.isArray(r.notification_channels)
      ? r.notification_channels
      : (typeof r.notification_channels === 'string'
          ? JSON.parse(r.notification_channels)
          : ['email']),
  })) as SupportAgent[];
}

export async function upsertAgent(params: {
  workspaceId: string;
  name: string;
  email?: string;
  phone?: string;
  role?: string;
  notificationChannels?: string[];
}): Promise<SupportAgent> {
  const channels = JSON.stringify(params.notificationChannels || ['email']);
  const res = await pool.query(
    `INSERT INTO voice_support_agents
     (id, workspace_id, name, email, phone, role, notification_channels, is_active)
     VALUES (gen_random_uuid()::text, $1, $2, $3, $4, $5, $6, true)
     ON CONFLICT (workspace_id, email)
     DO UPDATE SET name = EXCLUDED.name, phone = EXCLUDED.phone,
       role = EXCLUDED.role, notification_channels = EXCLUDED.notification_channels,
       is_active = true
     RETURNING *`,
    [
      params.workspaceId,
      params.name,
      params.email || null,
      params.phone || null,
      params.role || 'support_agent',
      channels,
    ]
  );
  return res.rows[0] as SupportAgent;
}

export async function deactivateAgent(agentId: string, workspaceId: string): Promise<void> {
  await pool.query(
    `UPDATE voice_support_agents SET is_active = false WHERE id = $1 AND workspace_id = $2`,
    [agentId, workspaceId]
  );
}

// ─── Agent Notification Dispatch ───────────────────────────────────────────────

export async function notifyHumanAgents(params: {
  supportCase: SupportCase;
  workspaceId: string;
  workspaceName?: string;
}): Promise<{ emailsSent: number; smsSent: number; errors: string[] }> {
  const { supportCase, workspaceId, workspaceName } = params;
  const agents = await getActiveAgents(workspaceId);

  if (agents.length === 0) {
    log.warn(`[SupportCase] No active agents for workspace ${workspaceId} — case ${supportCase.case_number} not dispatched`);
    return { emailsSent: 0, smsSent: 0, errors: ['No active human agents configured'] };
  }

  let emailsSent = 0;
  let smsSent = 0;
  const errors: string[] = [];

  const orgName = workspaceName || 'CoAIleague';
  const baseUrl = process.env.BASE_URL || 'https://www.coaileague.com';
  const caseUrl = `${baseUrl}/voice-settings?tab=cases&case=${encodeURIComponent(supportCase.case_number)}`;

  const emailHtml = buildAgentEmailHtml({ supportCase, orgName, caseUrl });
  const smsBody = buildAgentSmsBody({ supportCase, orgName });

  for (const agent of agents) {
    const channels = agent.notification_channels || ['email'];

    // Email notification
    if (channels.includes('email') && agent.email) {
      try {
        const { sendCanSpamCompliantEmail, isResendConfigured } = await import('../emailCore');
        if (isResendConfigured()) {
          await sendCanSpamCompliantEmail({
            to: agent.email,
            subject: `[TRINITY CASE ${supportCase.case_number}] New Support Request — Action Required`,
            html: emailHtml,
            emailType: 'voice_support_case_alert',
            workspaceId,
            skipUnsubscribeCheck: true,
          });
          emailsSent++;
          log.info(`[SupportCase] Email dispatched to agent ${agent.name} <${agent.email}>`);
        }
      } catch (e: unknown) {
        errors.push(`Email to ${agent.email}: ${e?.message}`);
      }
    }

    // SMS notification
    if (channels.includes('sms') && agent.phone) {
      try {
        const { sendSMS } = await import('../smsService');
        await sendSMS({
          to: agent.phone,
          body: smsBody,
          workspaceId,
          type: 'voice_support_case_alert',
        });
        smsSent++;
        log.info(`[SupportCase] SMS dispatched to agent ${agent.name}`);
      } catch (e: unknown) {
        errors.push(`SMS to ${agent.phone}: ${e?.message}`);
      }
    }
  }

  if (emailsSent + smsSent > 0) {
    await markCaseAgentNotified(supportCase.case_number);
  }

  return { emailsSent, smsSent, errors };
}

function buildAgentEmailHtml(params: {
  supportCase: SupportCase;
  orgName: string;
  caseUrl: string;
}): string {
  const { supportCase, orgName, caseUrl } = params;
  const createdAt = new Date(supportCase.created_at).toLocaleString();

  return `
<div style="font-family:Arial,sans-serif;max-width:640px;margin:0 auto;background:#f9fafb;">
  <div style="background:linear-gradient(135deg,#0f2a4a 0%,#1e3a5f 100%);padding:24px 32px;border-radius:8px 8px 0 0;">
    <h1 style="color:#fff;margin:0;font-size:20px;">Trinity Voice</h1>
    <p style="color:#d4af37;margin:5px 0 0;font-size:11px;letter-spacing:1px;text-transform:uppercase;">Support Case — Human Intervention Required</p>
  </div>
  <div style="background:#fff;padding:24px 32px;border:1px solid #e5e7eb;border-top:none;">
    <div style="background:#fef3c7;border:1px solid #f59e0b;border-radius:6px;padding:14px;margin-bottom:20px;">
      <p style="margin:0;color:#92400e;font-size:14px;font-weight:600;">
        A caller could not be resolved by Trinity AI and has been escalated to human support.
      </p>
    </div>

    <table style="width:100%;border-collapse:collapse;margin-bottom:20px;">
      <tr>
        <td style="padding:8px 12px;background:#f3f4f6;font-size:12px;color:#6b7280;width:38%;text-transform:uppercase;letter-spacing:0.5px;">Cause Number</td>
        <td style="padding:8px 12px;font-size:16px;font-weight:700;color:#0f2a4a;">${supportCase.case_number}</td>
      </tr>
      <tr>
        <td style="padding:8px 12px;background:#f9fafb;font-size:12px;color:#6b7280;text-transform:uppercase;letter-spacing:0.5px;">Status</td>
        <td style="padding:8px 12px;font-size:14px;color:#374151;text-transform:capitalize;">${supportCase.status}</td>
      </tr>
      <tr>
        <td style="padding:8px 12px;background:#f3f4f6;font-size:12px;color:#6b7280;text-transform:uppercase;letter-spacing:0.5px;">Caller</td>
        <td style="padding:8px 12px;font-size:14px;color:#374151;">${supportCase.caller_name || '(name not given)'} — ${supportCase.caller_number || '(number unavailable)'}</td>
      </tr>
      <tr>
        <td style="padding:8px 12px;background:#f9fafb;font-size:12px;color:#6b7280;text-transform:uppercase;letter-spacing:0.5px;">Received</td>
        <td style="padding:8px 12px;font-size:14px;color:#374151;">${createdAt}</td>
      </tr>
      <tr>
        <td style="padding:8px 12px;background:#f3f4f6;font-size:12px;color:#6b7280;text-transform:uppercase;letter-spacing:0.5px;">Language</td>
        <td style="padding:8px 12px;font-size:14px;color:#374151;">${supportCase.language === 'es' ? 'Spanish' : 'English'}</td>
      </tr>
    </table>

    <div style="background:#f3f4f6;padding:16px;border-radius:6px;margin-bottom:20px;border-left:4px solid #d4af37;">
      <p style="margin:0 0 6px;font-size:11px;color:#6b7280;text-transform:uppercase;letter-spacing:0.5px;">Issue Reported</p>
      <p style="margin:0;font-size:14px;color:#111827;line-height:1.6;">${supportCase.issue_summary}</p>
    </div>

    ${supportCase.ai_resolution_text ? `
    <div style="background:#eff6ff;padding:14px;border-radius:6px;margin-bottom:20px;border-left:4px solid #3b82f6;">
      <p style="margin:0 0 6px;font-size:11px;color:#1d4ed8;text-transform:uppercase;letter-spacing:0.5px;">Trinity's AI Attempted Resolution</p>
      <p style="margin:0;font-size:13px;color:#1e3a5f;line-height:1.6;">${supportCase.ai_resolution_text}</p>
    </div>` : ''}

    <div style="text-align:center;margin:24px 0;">
      <a href="${caseUrl}" style="background:#0f2a4a;color:#fff;padding:12px 28px;text-decoration:none;border-radius:6px;font-weight:700;display:inline-block;font-size:14px;">
        View &amp; Resolve Case in Dashboard
      </a>
    </div>

    <div style="background:#f9fafb;border:1px solid #e5e7eb;border-radius:6px;padding:14px;">
      <p style="margin:0 0 8px;font-size:12px;font-weight:600;color:#374151;">To resolve this case, you can:</p>
      <ol style="margin:0;padding-left:20px;font-size:13px;color:#4b5563;line-height:1.8;">
        <li>Open the dashboard link above and mark it resolved</li>
        <li>Call the caller back and tell Trinity: "Resolve case ${supportCase.case_number}"</li>
        <li>API: <code style="background:#e5e7eb;padding:2px 6px;border-radius:3px;">POST /api/voice/support/cases/${supportCase.case_number}/resolve</code></li>
      </ol>
    </div>
  </div>
  <div style="padding:12px 32px;text-align:center;">
    <p style="color:#9ca3af;font-size:11px;margin:0;">Trinity Voice · ${orgName} · Support Case Management System</p>
  </div>
</div>`;
}

function buildAgentSmsBody(params: { supportCase: SupportCase; orgName: string }): string {
  const { supportCase } = params;
  const summary = supportCase.issue_summary.slice(0, 120);
  return `[TRINITY CASE ${supportCase.case_number}] New voice support case needs human assistance. Caller: ${supportCase.caller_name || 'unknown'} (${supportCase.caller_number || 'unknown'}). Issue: ${summary}${summary.length >= 120 ? '...' : ''}. Check your dashboard or email to resolve.`;
}
