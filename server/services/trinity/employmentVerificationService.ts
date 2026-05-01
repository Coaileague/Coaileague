/**
 * EMPLOYMENT VERIFICATION SERVICE
 * ================================
 * Handles inbound employment verification emails sent to
 * verify@{slug}.coaileague.com.
 *
 * FCRA-compliant workflow:
 *   1. Trinity parses the email (Gemini) to extract requester + employee info
 *      and detect whether a signed authorization form is present.
 *   2. A support ticket (category = employment_verification) is created in
 *      the tenant's workspace with a VER-XXXXXX reference number.
 *   3. Management is emailed with a parsed summary plus approve/deny links.
 *   4. The requester receives an auto-acknowledgement with the reference.
 *
 * Trinity never discloses employment details until a manager explicitly
 * approves — at which point the template-driven approve endpoint sends the
 * FCRA-allowed subset (name, title, dates, status, pay band, officer
 * readiness score + link). Exact salary, disciplinary history, termination
 * reasons, performance reviews, and medical/personal data are never shared.
 */

import { createLogger } from '../../lib/logger';
import { pool } from '../../db';
import { sendCanSpamCompliantEmail } from '../emailCore';
import { meteredGemini } from '../billing/meteredGeminiClient';

const log = createLogger('EmploymentVerification');

export interface ResendInboundEmailLike {
  from: string;
  to: string[];
  subject?: string;
  text?: string;
  html?: string;
  message_id?: string;
  [k: string]: any;
}

interface ParsedVerificationRequest {
  requester_name?: string;
  requester_organization?: string;
  requester_email?: string;
  employee_name?: string;
  employee_id_if_provided?: string;
  purpose?: string;
  has_authorization?: boolean;
  authorization_confidence?: number;
}

const APP_BASE_URL = (process.env.APP_BASE_URL || 'https://www.coaileague.com').replace(/\/$/, '');

function extractFromAddress(from: string | undefined): { email: string; name?: string } {
  const raw = (from || '').trim();
  const match = raw.match(/<([^>]+)>/);
  if (match?.[1]) {
    return { email: match[1].trim(), name: raw.split('<')[0].trim() || undefined };
  }
  return { email: raw };
}

function sanitizeHtml(value: string | undefined | null): string {
  if (!value) return '';
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

async function resolveManagementEmail(workspaceId: string, slug: string): Promise<string> {
  try {
    const { rows } = await pool.query(
      `SELECT u.email
         FROM users u
        WHERE u.workspace_id = $1
          AND u.workspace_role IN ('org_owner','co_owner','org_admin','org_manager')
          AND u.email IS NOT NULL
        ORDER BY
          CASE u.workspace_role
            WHEN 'org_owner' THEN 1
            WHEN 'co_owner' THEN 2
            WHEN 'org_admin' THEN 3
            ELSE 4
          END
        LIMIT 1`,
      [workspaceId]
    );
    if (rows[0]?.email) return rows[0].email as string;
  } catch (err: unknown) {
    log.warn(`[EmploymentVerification] Management email lookup failed: ${err?.message}`);
  }
  return `management@${slug}.coaileague.com`;
}

/**
 * Parse an inbound verification email using Gemini. Falls back to a minimal
 * heuristic parse when Gemini is unavailable so the ticket still gets
 * created with whatever information we can extract.
 */
async function parseRequestWithGemini(
  workspaceId: string,
  body: string,
  fromEmail: string
): Promise<ParsedVerificationRequest> {
  const trimmed = (body || '').slice(0, 2000);
  try {
    const resp = await meteredGemini.generate({
      workspaceId,
      featureKey: 'employment_verification_parse',
      feature: 'employment_verification_parse',
      model: 'gemini-2.5-flash',
      jsonMode: true,
      prompt: `Parse this employment verification request email and extract:
- requester_name: who is asking
- requester_organization: their company
- requester_email: their email address (if mentioned in the body, otherwise leave blank)
- employee_name: whose employment they want to verify
- employee_id_if_provided: any employee/ID number mentioned (format EMP-XXX-00000)
- purpose: why they need this (background check, new employer, lease, loan, etc.)
- has_authorization: boolean — does the email include a signed authorization form or signed consent
- authorization_confidence: number between 0 and 1

Email body:
"""
${trimmed}
"""

Return ONLY a JSON object with these keys. No prose.`,
    });

    const raw = (resp?.text || '').trim();
    // Gemini sometimes wraps JSON in code fences when jsonMode isn't honored
    const cleaned = raw.replace(/^```(?:json)?/i, '').replace(/```$/i, '').trim();
    const parsed = JSON.parse(cleaned || '{}') as ParsedVerificationRequest;
    if (!parsed.requester_email) parsed.requester_email = fromEmail;
    return parsed;
  } catch (err: unknown) {
    log.warn(`[EmploymentVerification] Gemini parse failed (non-fatal): ${err?.message}`);
    return {
      requester_email: fromEmail,
      has_authorization: /authorization|consent|signed/i.test(body || ''),
      authorization_confidence: 0.2,
    };
  }
}

async function lookupEmployee(
  workspaceId: string,
  parsed: ParsedVerificationRequest
): Promise<{ id: string; firstName: string; lastName: string; employeeNumber: string | null } | null> {
  const rawId = (parsed.employee_id_if_provided || '').toString();
  const normalizedId = rawId.replace(/[^A-Z0-9-]/gi, '').toUpperCase();
  const nameLike = `%${(parsed.employee_name || '').slice(0, 100).toLowerCase()}%`;

  try {
    if (normalizedId) {
      const { rows } = await pool.query(
        `SELECT id, first_name, last_name, employee_number
           FROM employees
          WHERE workspace_id = $1
            AND UPPER(employee_number) = $2
          LIMIT 1`,
        [workspaceId, normalizedId]
      );
      if (rows[0]) {
        return {
          id: rows[0].id,
          firstName: rows[0].first_name,
          lastName: rows[0].last_name,
          employeeNumber: rows[0].employee_number,
        };
      }
    }
    if (parsed.employee_name) {
      const { rows } = await pool.query(
        `SELECT id, first_name, last_name, employee_number
           FROM employees
          WHERE workspace_id = $1
            AND LOWER(first_name || ' ' || last_name) LIKE $2
          LIMIT 1`,
        [workspaceId, nameLike]
      );
      if (rows[0]) {
        return {
          id: rows[0].id,
          firstName: rows[0].first_name,
          lastName: rows[0].last_name,
          employeeNumber: rows[0].employee_number,
        };
      }
    }
  } catch (err: unknown) {
    log.warn(`[EmploymentVerification] Employee lookup failed: ${err?.message}`);
  }
  return null;
}

function buildReferenceNumber(): string {
  return `VER-${Date.now().toString(36).toUpperCase().slice(-6)}`;
}

export async function handleEmploymentVerificationEmail(
  email: ResendInboundEmailLike,
  slug: string,
  workspaceId: string
): Promise<void> {
  const { email: fromEmail, name: fromName } = extractFromAddress(email.from);
  const subject = email.subject || 'Employment Verification Request';
  const body = email.text || (email.html || '').replace(/<[^>]*>/g, ' ');
  const refNum = buildReferenceNumber();

  try {
    const parsed = await parseRequestWithGemini(workspaceId, body, fromEmail);
    const employee = await lookupEmployee(workspaceId, parsed);

    // Company name for the acknowledgement footer.
    let companyName = 'your employer';
    try {
      const { rows } = await pool.query(
        `SELECT company_name, name FROM workspaces WHERE id = $1 LIMIT 1`,
        [workspaceId]
      );
      companyName = rows[0]?.company_name || rows[0]?.name || companyName;
    } catch { /* non-fatal */ }

    // Create verification ticket (FCRA audit trail)
    try {
      await pool.query(
        `INSERT INTO support_tickets
           (workspace_id, ticket_number, type, priority, subject, description,
            status, submission_method, email_category, requested_by,
            created_at, updated_at)
         VALUES ($1, $2, 'employment_verification', 'normal', $3, $4,
                 'open', 'email', 'employment_verification', $5,
                 NOW(), NOW())`,
        [
          workspaceId,
          refNum,
          `Employment Verification Request — ${parsed.employee_name || 'Unknown Employee'}`,
          JSON.stringify({
            requester: parsed,
            employeeFound: !!employee,
            employeeId: employee?.id ?? null,
            employeeName: employee ? `${employee.firstName} ${employee.lastName}` : null,
            employeeNumber: employee?.employeeNumber ?? null,
            hasAuthorization: !!parsed.has_authorization,
            authorizationConfidence: parsed.authorization_confidence ?? 0,
            originalEmail: body.slice(0, 2000),
            fromEmail,
            fromName: fromName || null,
            subject,
            slug,
            refNum,
          }),
          fromName ? `${fromName} <${fromEmail}>` : fromEmail,
        ]
      );
    } catch (err: unknown) {
      log.warn(`[EmploymentVerification] Ticket insert failed (non-fatal): ${err?.message}`);
    }

    const approveUrl = `${APP_BASE_URL}/api/employment-verify/approve/${refNum}`;
    const denyUrl = `${APP_BASE_URL}/api/employment-verify/deny/${refNum}`;
    const authConfidencePct = Math.round(((parsed.authorization_confidence ?? 0) as number) * 100);

    const mgmtEmail = await resolveManagementEmail(workspaceId, slug);

    // Management alert with approve/deny — awaited per NDS rules
    const mgmtHtml = `
      <div style="font-family: Arial, sans-serif; max-width: 640px; color: #111;">
        <h2 style="margin-bottom:8px;">Employment Verification Request</h2>
        <p><strong>Reference:</strong> ${sanitizeHtml(refNum)}</p>
        <p><strong>From:</strong> ${sanitizeHtml(parsed.requester_name || 'Unknown')} at ${sanitizeHtml(parsed.requester_organization || 'Unknown')} (${sanitizeHtml(fromEmail)})</p>
        <p><strong>Employee requested:</strong> ${sanitizeHtml(parsed.employee_name || 'Not specified')}</p>
        <p><strong>Purpose:</strong> ${sanitizeHtml(parsed.purpose || 'Not specified')}</p>
        <p><strong>Authorization included:</strong> ${parsed.has_authorization
          ? `Yes (confidence ${authConfidencePct}%)`
          : 'No &mdash; <strong>authorization is required before responding</strong>'}</p>
        ${employee
          ? `<p><strong>Employee found in system:</strong> ${sanitizeHtml(employee.firstName)} ${sanitizeHtml(employee.lastName)} (${sanitizeHtml(employee.employeeNumber || 'no ID')})</p>`
          : '<p><strong>Employee not found in system</strong></p>'}
        <hr style="border:none;border-top:1px solid #e5e7eb;margin:20px 0" />
        <p>
          <a href="${approveUrl}" style="background:#16a34a;color:#ffffff;padding:10px 20px;text-decoration:none;border-radius:4px;margin-right:10px;display:inline-block;">Approve &amp; Send Verification</a>
          <a href="${denyUrl}" style="background:#dc2626;color:#ffffff;padding:10px 20px;text-decoration:none;border-radius:4px;display:inline-block;">Deny Request</a>
        </p>
        <p style="color:#666;font-size:12px;margin-top:16px;">Only approve if you have a signed authorization form from the employee on file. FCRA requires written consent before disclosing employment details. Approving shares only FCRA-allowed fields: name, title, dates, status, pay band, officer readiness score + explanation link.</p>
      </div>`;

    try {
      await sendCanSpamCompliantEmail({
        to: mgmtEmail,
        subject: `[Action Required] Employment Verification Request — ${parsed.employee_name || 'Unknown'} — Ref ${refNum}`,
        html: mgmtHtml,
        emailType: 'employment_verification_management_alert',
        workspaceId,
        skipUnsubscribeCheck: true,
      });
    } catch (err: unknown) {
      log.warn(`[EmploymentVerification] Management alert send failed (non-fatal): ${err?.message}`);
    }

    // Auto-acknowledge to requester — transactional, does not need unsubscribe.
    if (fromEmail && /@/.test(fromEmail)) {
      const ackHtml = `
        <div style="font-family: Arial, sans-serif; max-width: 640px; color: #111;">
          <p>Thank you for your employment verification request.</p>
          <p>Your reference number is <strong>${sanitizeHtml(refNum)}</strong>.</p>
          <p>We have received your request and will respond within two business days, provided we have the required employee authorization on file.</p>
          <p>If you have not already included a signed employee authorization form, please reply to this email with the completed form attached.</p>
          <p style="color:#555;font-size:13px;">— ${sanitizeHtml(companyName)} via Co-League</p>
        </div>`;
      try {
        await sendCanSpamCompliantEmail({
          to: fromEmail,
          subject: `Employment Verification Request Received — Ref ${refNum}`,
          html: ackHtml,
          emailType: 'employment_verification_acknowledgement',
          workspaceId,
          skipUnsubscribeCheck: true,
        });
      } catch (err: unknown) {
        log.warn(`[EmploymentVerification] Requester ack send failed (non-fatal): ${err?.message}`);
      }
    }

    log.info(`[EmploymentVerification] Ticket ${refNum} created for workspace ${workspaceId} (employee found: ${!!employee}, auth: ${!!parsed.has_authorization})`);
  } catch (err: unknown) {
    log.error(`[EmploymentVerification] Workflow failed: ${err?.message}`);
  }
}
