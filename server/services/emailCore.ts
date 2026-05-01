// Email notification service using Resend with fallback to development mode
// Includes Fortune 500-grade cost recovery via platform services metering
// CAN-SPAM COMPLIANT: All emails include List-Unsubscribe headers and unsubscribe links
//
// PLATFORM SENDER POLICY:
//   noreply@coaileague.com — all automated tenant notifications (invoices, payroll, shifts, etc.)
//   support@coaileague.com — human/platform support acknowledgements
//   trinity@coaileague.com — RESERVED for outbound platform marketing only (prospecting to regulatory
//                            agencies and prospective tenants). Inbound replies are handled exclusively
//                            by trinityMarketingReplyProcessor.ts. NEVER use trinity@ as a tenant
//                            notification sender. Tenant notifications always use noreply@.
import { Resend } from 'resend';
import { EMAIL } from '../config/platformConfig';
import { trackEmailUsage } from './billing/platformServicesMeter';
import { db } from '../db';
import { emailUnsubscribes } from '@shared/schema';
import { eq, and, or, isNull } from 'drizzle-orm';
import { randomBytes } from 'crypto';
import { getAppBaseUrl } from '../utils/getAppBaseUrl';
import { createLogger } from '../lib/logger';
import { isProduction } from '../lib/isProduction';
const log = createLogger('emailCore');


let resendConfigured = false;

// ============================================================================
// CAN-SPAM COMPLIANCE UTILITIES
// ============================================================================

/**
 * Get the base URL for unsubscribe links
 */
function getUnsubscribeBaseUrl(): string {
  return getAppBaseUrl();
}

/**
 * Generate a secure unsubscribe token
 */
export function generateUnsubscribeToken(): string {
  return randomBytes(32).toString('hex');
}

/**
 * Get or create unsubscribe token for an email address
 */
async function getOrCreateUnsubscribeToken(email: string, workspaceId?: string): Promise<string> {
  try {
    // Check if record exists
    const existing = await db.select()
      .from(emailUnsubscribes)
      .where(
        and(
          eq(emailUnsubscribes.email, email.toLowerCase()),
          workspaceId
            ? eq(emailUnsubscribes.workspaceId, workspaceId)
            : isNull(emailUnsubscribes.workspaceId)
        )
      )
      .limit(1);

    if (existing.length > 0) {
      return existing[0].unsubscribeToken;
    }

    // Create new record with token
    const token = generateUnsubscribeToken();
    await db.insert(emailUnsubscribes).values({
      email: email.toLowerCase(),
      workspaceId: workspaceId || null,
      unsubscribeToken: token,
      unsubscribeAll: false,
      unsubscribeMarketing: false,
      unsubscribeNotifications: false,
      unsubscribeDigests: false,
    });

    return token;
  } catch (error: any) {
    log.warn('[Email] Failed to get/create unsubscribe token:', (error instanceof Error ? error.message : String(error)));
    // Return a fallback token if DB fails - still allows email to be sent
    return generateUnsubscribeToken();
  }
}

/**
 * Check if an email is unsubscribed from a specific category
 */
export async function isEmailUnsubscribed(
  email: string,
  category: 'all' | 'marketing' | 'notifications' | 'digests',
  workspaceId?: string
): Promise<boolean> {
  try {
    const record = await db.select()
      .from(emailUnsubscribes)
      .where(
        and(
          eq(emailUnsubscribes.email, email.toLowerCase()),
          workspaceId
            ? or(
                eq(emailUnsubscribes.workspaceId, workspaceId),
                isNull(emailUnsubscribes.workspaceId)
              )
            : isNull(emailUnsubscribes.workspaceId)
        )
      )
      .limit(1);

    if (record.length === 0) return false;

    const unsub = record[0];

    // Check if globally unsubscribed
    if (unsub.unsubscribeAll) return true;

    // Check specific category
    switch (category) {
      case 'marketing': return unsub.unsubscribeMarketing || false;
      case 'notifications': return unsub.unsubscribeNotifications || false;
      case 'digests': return unsub.unsubscribeDigests || false;
      default: return false;
    }
  } catch (error: any) {
    log.warn('[Email] Failed to check unsubscribe status:', (error instanceof Error ? error.message : String(error)));
    return false; // Default to allowing email on error
  }
}

/**
 * Check if an email address has a permanent delivery failure on record (hard bounce
 * or spam complaint reported by Resend). Unlike user-initiated unsubscribes, hard
 * bounces indicate the address is invalid — sending to them damages sender reputation
 * and wastes delivery quota. This check applies to ALL email types, including
 * transactional, because the email will never reach the recipient anyway.
 */
export async function isHardBounced(email: string): Promise<boolean> {
  try {
    const record = await db.select({ id: emailUnsubscribes.id })
      .from(emailUnsubscribes)
      .where(
        and(
          eq(emailUnsubscribes.email, email.toLowerCase()),
          or(
            eq(emailUnsubscribes.unsubscribeSource, 'bounce'),
            eq(emailUnsubscribes.unsubscribeSource, 'complaint')
          )
        )
      )
      .limit(1);
    return record.length > 0;
  } catch {
    return false; // Default to allowing on DB error — transactional reliability takes priority
  }
}

/**
 * Generate CAN-SPAM compliant unsubscribe footer HTML
 */
function generateUnsubscribeFooter(
  unsubscribeUrl: string,
  companyName: string = EMAIL.companyName,
  companyAddress: string = EMAIL.companyAddress,
): string {
  return `
    <div style="margin-top: 40px; padding-top: 20px; border-top: 1px solid #e5e7eb; font-size: 12px; color: #6b7280; text-align: center;">
      <p style="margin: 0 0 8px 0;">
        This email was sent by ${companyName}. To manage your email preferences or unsubscribe,
        <a href="${unsubscribeUrl}" style="color: #4b5563; text-decoration: underline;">click here</a>.
      </p>
      <p style="margin: 0 0 6px 0; color: #9ca3af;">
        ${companyAddress}
      </p>
      <p style="margin: 0;">
        &copy; ${new Date().getFullYear()} ${companyName} &nbsp;&bull;&nbsp;
        <a href="${unsubscribeUrl}" style="color: #4b5563; text-decoration: underline;">Unsubscribe</a>
      </p>
    </div>
  `;
}

/**
 * Generate a plain-text version of an HTML email body.
 * Strips HTML tags, decodes common entities, and appends CAN-SPAM address.
 * Used as a multi-part text/plain fallback to prevent spam filter penalties.
 */
function htmlToPlainText(html: string): string {
  return html
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n\n')
    .replace(/<\/h[1-6]>/gi, '\n\n')
    .replace(/<\/li>/gi, '\n')
    .replace(/<\/div>/gi, '\n')
    .replace(/<\/tr>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .replace(/&bull;/g, '•')
    .replace(/&copy;/g, '©')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/**
 * Add unsubscribe footer to HTML email content
 */
function addUnsubscribeFooterToHtml(html: string, unsubscribeUrl: string): string {
  // Check if content already has unsubscribe link (prevent duplication)
  if (html.toLowerCase().includes('unsubscribe')) {
    return html;
  }

  const footer = generateUnsubscribeFooter(unsubscribeUrl);

  // Insert before closing </div> if present, otherwise append
  if (html.includes('</div>')) {
    // Find the last </div> and insert footer before it
    const lastDivIndex = html.lastIndexOf('</div>');
    return html.slice(0, lastDivIndex) + footer + html.slice(lastDivIndex);
  }

  return html + footer;
}

/**
 * Email types that should NOT include unsubscribe links (transactional)
 * These are required for service operation and CAN-SPAM exempt
 */
const TRANSACTIONAL_EMAIL_TYPES = [
  'verification',
  'password_reset',
  'security_alert',
  'account_locked',
  'two_factor',
  'invoice',
  'payment_receipt',
  'payment_failed',
  // Operational scheduling & staffing emails — CAN-SPAM exempt (required for service)
  'shift_assignment',
  'shift_reminder',
  'shift_offer',
  'staffing',
  'calloff',
  'replacement',
  'broadcast',
  // Operational HR / payroll emails
  'onboarding',
  'employee_invitation',
  'payroll',
  'paystub',
  'disbursement',
  // Operational compliance
  'compliance',
  'certification',
  // HR decision emails — employee cannot unsubscribe from PTO/termination/review decisions
  'pto',
  'performance',
  'benefit',
  'termination',
  'report_delivery',
  'review',
  'rating',
  'writeup',
  // Scheduling approval/denial emails — employee cannot unsubscribe from shift approvals
  'shift_action',
  'timesheet',
  // Inbound email forwarding — system-generated copies sent to workspace owners
  'inbound_forward',
];

/**
 * Check if email type is transactional (CAN-SPAM exempt)
 */
function isTransactionalEmail(emailType: string): boolean {
  return TRANSACTIONAL_EMAIL_TYPES.some(type =>
    emailType.toLowerCase().includes(type)
  );
}

/**
 * CAN-SPAM Compliant Email Options
 */
export interface CanSpamEmailOptions {
  to: string;
  subject: string;
  html: string;
  /** Optional plain-text version. Auto-generated from html if omitted. */
  text?: string;
  emailType: string;
  workspaceId?: string;
  /** Skip unsubscribe check for transactional emails */
  skipUnsubscribeCheck?: boolean;
  /** Reply-To address (e.g. support@coaileague.com) */
  replyTo?: string;
  /** BCC address(es) for audit copies */
  bcc?: string | string[];
  /**
   * Resend tags for delivery-webhook tracking.
   * Each tag becomes a key/value pair on the Resend message so the
   * email.delivered webhook can identify exactly which record to update.
   * Max 10 tags; name/value each ≤ 256 chars.
   */
  tags?: Array<{ name: string; value: string }>;
}

/**
 * Send an email with CAN-SPAM compliance
 * - Adds List-Unsubscribe headers (RFC 2369)
 * - Adds List-Unsubscribe-Post header (RFC 8058 one-click unsubscribe)
 * - Adds unsubscribe footer to HTML content
 * - Checks unsubscribe status before sending (unless transactional)
 */
export async function sendCanSpamCompliantEmail(
  options: CanSpamEmailOptions
): Promise<{ success: boolean; data?: any; error?: any; skipped?: boolean; reason?: string }> {
  const { to, subject, html, emailType, workspaceId, skipUnsubscribeCheck, tags, replyTo, bcc } = options;
  const isTransactional = isTransactionalEmail(emailType);

  // Email format validation
  if (!to || !to.includes('@')) {
    log.error(`[Email] ERROR: Invalid recipient address: "${to}" | Type: ${emailType}`);
    return { success: false, reason: 'Invalid recipient address' };
  }

  try {
    // Hard bounce / spam complaint check — applies to ALL email types including transactional.
    // A hard-bounced address is permanently invalid; sending to it wastes delivery quota and
    // damages sender reputation regardless of email category. This must run before the
    // transactional bypass that would otherwise skip the unsubscribe check.
    const hardBounced = await isHardBounced(to);
    if (hardBounced) {
      log.info(`[Email] Suppressed send to ${to} — hard bounce or spam complaint on record`);
      return {
        success: false,
        skipped: true,
        reason: 'Email address permanently suppressed due to hard bounce or spam complaint'
      };
    }

    // Check unsubscribe status for non-transactional emails
    if (!isTransactional && !skipUnsubscribeCheck) {
      const category = emailType.includes('marketing') ? 'marketing' :
                      emailType.includes('digest') ? 'digests' : 'notifications';

      const unsubscribed = await isEmailUnsubscribed(to, category, workspaceId);
      if (unsubscribed) {
        log.info(`[Email] Skipped sending to ${to} - unsubscribed from ${category}`);
        return {
          success: false,
          skipped: true,
          reason: `Email address unsubscribed from ${category}`
        };
      }
    }

    // Get or create unsubscribe token
    const unsubscribeToken = await getOrCreateUnsubscribeToken(to, workspaceId);
    const baseUrl = getUnsubscribeBaseUrl();
    const unsubscribeUrl = `${baseUrl}/api/email/unsubscribe?token=${unsubscribeToken}&email=${encodeURIComponent(to)}`;
    const unsubscribePostUrl = `${baseUrl}/api/email/unsubscribe`;

    // Add unsubscribe footer for non-transactional emails
    let finalHtml = html;
    if (!isTransactional) {
      finalHtml = addUnsubscribeFooterToHtml(html, unsubscribeUrl);
    }

    // Get Resend client
    const { client, fromEmail } = await getUncachableResendClient();

    // Build headers with List-Unsubscribe for CAN-SPAM compliance
    const headers: Record<string, string> = {};

    if (!isTransactional) {
      // RFC 2369 List-Unsubscribe header (mailto and https)
      headers['List-Unsubscribe'] = `<${unsubscribeUrl}>, <mailto:${EMAIL.senders.unsubscribe}?subject=Unsubscribe&body=token:${unsubscribeToken}>`;
      // RFC 8058 One-Click Unsubscribe
      headers['List-Unsubscribe-Post'] = 'List-Unsubscribe=One-Click';
    }

    // Send email via Resend with 15-second timeout to prevent hanging requests
    const RESEND_TIMEOUT_MS = 15_000;
    // Always include plain-text version to satisfy spam filters and RFC 2822 multi-part requirements
    const plainText = options.text || htmlToPlainText(finalHtml);

    const sendPromise = client.emails.send({
      from: fromEmail,
      to: [to],
      subject,
      html: finalHtml,
      text: plainText,
      reply_to: replyTo,
      bcc: bcc ? (Array.isArray(bcc) ? bcc : [bcc]) : undefined,
      headers: Object.keys(headers).length > 0 ? headers : undefined,
      tags: tags && tags.length > 0 ? tags : undefined,
    });
    const timeoutPromise = new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error(`Resend API timeout after ${RESEND_TIMEOUT_MS}ms`)), RESEND_TIMEOUT_MS)
    );
    const result = await Promise.race([sendPromise, timeoutPromise]);

    log.info(`[Email] Sent CAN-SPAM compliant ${emailType} email to ${to}`);
    return { success: true, data: result };
  } catch (error: any) {
    log.error(`[Email] Error sending ${emailType} email to ${to}:`, (error instanceof Error ? error.message : String(error)));
    return { success: false, error };
  }
}

// Email type mapping for cost tracking
type EmailCategory = 'transactional' | 'marketing' | 'inbound' | 'attachment' | 'staffing' | 'employee' | 'payroll' | 'invoice' | 'digest';

/**
 * Metered email send wrapper - tracks all email usage for billing
 * Every email sent costs credits based on type (1-3 credits per email)
 */
async function sendMeteredEmail(
  workspaceId: string | undefined,
  emailCategory: EmailCategory,
  sendFn: () => Promise<any>,
  metadata?: Record<string, unknown>
): Promise<{ success: boolean; data?: any; error?: any }> {
  try {
    const result = await sendFn();
    
    // Track usage if workspace is known (bill the org)
    if (workspaceId) {
      await trackEmailUsage(workspaceId, emailCategory, {
        ...metadata,
        timestamp: new Date().toISOString(),
      }).catch(err => {
        log.warn('[Email Metering] Failed to track usage:', (err instanceof Error ? err.message : String(err)));
      });
    }
    
    return { success: true, data: result };
  } catch (error: any) {
    log.error(`[Email] Error sending ${emailCategory} email:`, (error instanceof Error ? error.message : String(error)));
    return { success: false, error };
  }
}

async function getCredentials() {
  // Railway-only deployment. The legacy Replit connector fallback
  // (REPLIT_CONNECTORS_HOSTNAME + REPL_IDENTITY) has been removed —
  // Resend is now configured exclusively via the RESEND_API_KEY env
  // variable. Canonical production detection per TRINITY.md §A.
  const isProd = isProduction();

  if (process.env.RESEND_API_KEY) {
    return {
      apiKey: process.env.RESEND_API_KEY,
      fromEmail: process.env.RESEND_FROM_EMAIL || EMAIL.senders.noreply,
    };
  }

  if (isProd) {
    log.error(
      '[Email] CRITICAL: RESEND_API_KEY not set in PRODUCTION. Emails will NOT be sent. Configure the env var in Railway and verify the sender domain in the Resend dashboard.',
    );
  }
  return null;
}

// WARNING: Never cache this client.
// Access tokens expire, so a new client must be created each time.
export async function getUncachableResendClient() {
  const credentials = await getCredentials();

  if (!credentials) {
    // Canonical production detection per TRINITY.md §A. The previous local
    // check `NODE_ENV === 'production' || REPLIT_DEPLOYMENT` did not detect
    // Railway, which meant the noop client below fell through to the dev
    // fake-success branch on Railway deploys. Under that branch, a missing
    // RESEND_API_KEY produced emails that appeared to "send" (returning a
    // synthetic `dev-${Date.now()}` id) but never actually delivered. The
    // password reset silent failure on 2026-04-08 traced directly to this.
    const isProd = isProduction();
    resendConfigured = false;

    if (isProd) {
      log.error('[EMAIL] CRITICAL: Resend credentials not available in PRODUCTION. Emails will fail to send. Configure the Resend integration or set RESEND_API_KEY.');
    }

    return {
      client: {
        emails: {
          send: async (params: any) => {
            if (isProd) {
              log.error(`[EMAIL] PRODUCTION ERROR: Cannot send email to ${params.to} - Resend not configured. Subject: ${params.subject}`);
              throw new Error('Email delivery unavailable: Resend is not configured in production');
            }
            log.info(`[DEV MODE] Email would be sent to ${params.to}`);
            log.info(`   Subject: ${params.subject}`);
            return { data: { id: `dev-${Date.now()}` } };
          }
        }
      } as any,
      fromEmail: process.env.RESEND_FROM_EMAIL || EMAIL.senders.noreply
    };
  }

  resendConfigured = true;
  return {
    client: new Resend(credentials.apiKey),
    fromEmail: credentials.fromEmail
  };
}

/**
 * Check if Resend is properly configured
 */
export function isResendConfigured(): boolean {
  return resendConfigured;
}

// Email Templates

  import {
    emailLayout, emailHeader, emailFooter,
    greeting, para, infoCard, alertBox, stepList, checkList,
    ctaButton, divider, sectionHeading, B,
  } from './emailTemplateBase';
  

  // Email Templates
  export const emailTemplates = {
    /**
     * SHIFT ASSIGNMENT
     */
    shiftAssignment: (data: {
      employeeName: string;
      shiftTitle: string;
      shiftDate: string;
      startTime: string;
      endTime: string;
      shiftId?: string;
      location: string;
      payRate?: string;
    }) => ({
      subject: `Shift Assignment: ${data.shiftTitle || 'New Shift'} on ${data.shiftDate || 'Scheduled Date'}`,
      html: emailLayout({
        preheader: `You have been assigned a shift at ${data.location || 'your assigned location'} on ${data.shiftDate || 'Scheduled Date'}.`,
        header: emailHeader({ title: 'New Shift Assignment', subtitle: 'You have been assigned an upcoming shift', badge: 'Scheduling', theme: 'blue' }),
        body:
          greeting(data.employeeName || 'there') +
          para('You have been assigned a new shift. Please review the details below and make sure you are prepared.') +
          infoCard({
            title: 'Shift Details',
            rows: [
              { label: 'Position', value: data.shiftTitle || 'Security Professional', highlight: true },
              { label: 'Date', value: data.shiftDate || 'TBD' },
              { label: 'Time', value: (data.startTime && data.endTime) ? `${data.startTime} — ${data.endTime}` : 'TBD' },
              { label: 'Location', value: data.location || 'See Dashboard' },
              ...(data.payRate ? [{ label: 'Pay Rate', value: `$${data.payRate}/hr` }] : []),
            ],
          }) +
          alertBox({ type: 'info', title: 'Reminder', body: 'Please arrive on time and in full uniform. Contact your supervisor if you have any questions about this assignment.' }) +
          para('Log in to your CoAIleague dashboard to view the full shift details and post orders.', { muted: true, small: true }),
      }),
    }),

    /**
     * SHIFT REMINDER
     */
    shiftReminder: (data: {
      employeeName: string;
      shiftTitle: string;
      shiftDate: string;
      startTime: string;
      endTime: string;
      location: string;
      hoursUntilShift: number;
    }) => ({
      subject: `Shift Reminder: ${data.shiftTitle || 'Your Shift'} in ${data.hoursUntilShift || 'a few'} hours`,
      html: emailLayout({
        preheader: `Your shift at ${data.location || 'your assigned location'} is coming up in ${data.hoursUntilShift || 'a few'} hours.`,
        header: emailHeader({ title: 'Upcoming Shift Reminder', subtitle: `Your shift starts in ${data.hoursUntilShift || 'a few'} hours`, badge: 'Reminder', theme: 'orange' }),
        body:
          greeting(data.employeeName || 'there') +
          para(`This is a friendly reminder that you have a shift coming up in <strong>${data.hoursUntilShift || 'a few'} hours</strong>. Please make sure you are prepared.`) +
          infoCard({
            title: 'Shift Details',
            rows: [
              { label: 'Position', value: data.shiftTitle || 'Security Professional', highlight: true },
              { label: 'Date', value: data.shiftDate || 'Today' },
              { label: 'Time', value: (data.startTime && data.endTime) ? `${data.startTime} — ${data.endTime}` : 'TBD' },
              { label: 'Location', value: data.location || 'See Dashboard' },
            ],
          }) +
          checkList([
            'Arrive at least 10 minutes early',
            'Bring your uniform and required equipment',
            'Review your post orders before arriving',
            'Contact your supervisor if you cannot make it',
          ]) +
          para('If you need to make changes to this shift, contact your manager immediately.', { muted: true, small: true }),
      }),
    }),

    /**
     * INVOICE GENERATED
     */
    invoiceGenerated: (data: {
      clientName: string;
      invoiceNumber: string;
      invoiceDate: string;
      dueDate: string;
      totalAmount: string;
      lineItems: Array<{ description: string; amount: string }>;
      portalUrl?: string;
    }) => ({
      subject: `Invoice ${data.invoiceNumber || 'New'} — $${data.totalAmount || '0.00'}`,
      html: emailLayout({
        preheader: `Invoice ${data.invoiceNumber || ''} for $${data.totalAmount || '0.00'} is ready. Due ${data.dueDate || 'Soon'}.`,
        header: emailHeader({ title: 'Invoice Ready', subtitle: `Invoice ${data.invoiceNumber || ''} has been generated`, badge: 'Billing', theme: 'blue' }),
        body:
          greeting(data.clientName || 'there') +
          para('A new invoice has been generated for your account. Please review the details below and arrange payment by the due date.') +
          infoCard({
            title: 'Invoice Summary',
            rows: [
              { label: 'Invoice Number', value: data.invoiceNumber || 'TBD', highlight: true },
              { label: 'Invoice Date', value: data.invoiceDate || 'Today' },
              { label: 'Due Date', value: data.dueDate || 'TBD' },
              { label: 'Total Amount', value: `$${data.totalAmount || '0.00'}`, highlight: true },
            ],
          }) +
          (data.lineItems && data.lineItems.length > 0
            ? infoCard({
                title: 'Line Items',
                rows: data.lineItems.map(item => ({ label: item.description || 'Service', value: `$${item.amount || '0.00'}` })),
              })
            : '') +
          (data.portalUrl
            ? '<table width="100%" border="0" cellspacing="0" cellpadding="0" style="margin:28px 0;"><tr><td align="center">' +
              ctaButton({ text: 'View &amp; Pay Invoice', url: data.portalUrl }) +
              '</td></tr></table>'
            : '') +
          para('If you have questions about this invoice, please contact your account manager.', { muted: true, small: true }),
      }),
    }),

    /**
     * INVOICE OVERDUE REMINDER
     */
    invoiceOverdueReminder: (data: {
      clientName: string;
      invoiceNumber: string;
      originalDueDate: string;
      daysOverdue: number;
      totalAmount: string;
      portalUrl?: string;
    }) => ({
      subject: `Payment Overdue: Invoice ${data.invoiceNumber || ''} — ${data.daysOverdue || 'Past Due'} days past due`,
      html: emailLayout({
        preheader: `Invoice ${data.invoiceNumber || ''} for $${data.totalAmount || '0.00'} is ${data.daysOverdue || 'Past Due'} days past due.`,
        header: emailHeader({ title: 'Payment Overdue', subtitle: `Invoice ${data.invoiceNumber || ''} requires immediate attention`, badge: 'Billing Alert', theme: 'red' }),
        body:
          greeting(data.clientName || 'there') +
          para(`Your invoice <strong>${data.invoiceNumber || ''}</strong> is now <strong>${data.daysOverdue || ''} days past due</strong>. Please arrange payment as soon as possible to avoid any service interruptions.`) +
          infoCard({
            rows: [
              { label: 'Invoice Number', value: data.invoiceNumber || 'TBD', highlight: true },
              { label: 'Original Due Date', value: data.originalDueDate || 'TBD' },
              { label: 'Days Overdue', value: `${data.daysOverdue || ''} days`, highlight: true },
              { label: 'Amount Due', value: `$${data.totalAmount || '0.00'}`, highlight: true },
            ],
          }) +
          alertBox({ type: 'danger', title: 'Immediate action required', body: 'Continued non-payment may result in service suspension. Please contact your account manager if you need to discuss payment arrangements.' }) +
          (data.portalUrl
            ? '<table width="100%" border="0" cellspacing="0" cellpadding="0" style="margin:28px 0;"><tr><td align="center">' +
              ctaButton({ text: 'Pay Now', url: data.portalUrl, style: 'danger' }) +
              '</td></tr></table>'
            : '') +
          para('If you have already made this payment, please disregard this notice.', { muted: true, small: true }),
      }),
    }),

    /**
     * EMPLOYEE ONBOARDING
     */
    employeeOnboarding: (data: {
      employeeName: string;
      workspaceName: string;
      startDate: string;
      supervisorName: string;
      dashboardUrl?: string;
    }) => ({
      subject: `Welcome to ${data.workspaceName || 'CoAIleague'} — Your Onboarding Details`,
      html: emailLayout({
        preheader: `Welcome to ${data.workspaceName || 'CoAIleague'}! Your start date is ${data.startDate || 'TBD'}. Here is everything you need to know.`,
        header: emailHeader({ title: `Welcome to the Team!`, subtitle: `You are joining ${data.workspaceName || 'CoAIleague'}`, badge: 'Onboarding', theme: 'green' }),
        body:
          greeting(data.employeeName || 'there') +
          para(`Welcome to <strong>${data.workspaceName || 'CoAIleague'}</strong>! We are excited to have you join our team. Here are your onboarding details.`) +
          infoCard({
            rows: [
              { label: 'Organization', value: data.workspaceName || 'CoAIleague', highlight: true },
              { label: 'Start Date', value: data.startDate || 'TBD' },
              { label: 'Supervisor', value: data.supervisorName || 'Your Manager' },
            ],
          }) +
          sectionHeading('Before your first day:') +
          checkList([
            'Log in to CoAIleague and complete your employee profile',
            'Review the employee handbook and company policies',
            'Upload any required certifications or documents',
            'Check your shift schedule for the first week',
            'Contact your supervisor with any questions',
          ]) +
          (data.dashboardUrl
            ? '<table width="100%" border="0" cellspacing="0" cellpadding="0" style="margin:28px 0;"><tr><td align="center">' +
              ctaButton({ text: 'Go to Your Dashboard', url: data.dashboardUrl, style: 'success' }) +
              '</td></tr></table>'
            : '') +
          para('We look forward to having you on the team. Do not hesitate to reach out if you need anything.', { muted: true }),
      }),
    }),

    /**
     * ONBOARDING INVITE
     */
    onboardingInvite: (data: {
      employeeName: string;
      workspaceName: string;
      inviteUrl: string;
      tempPassword?: string;
      expiresIn: string;
    }) => ({
      subject: `Join ${data.workspaceName || 'CoAIleague'} on CoAIleague — Complete Your Setup`,
      html: emailLayout({
        preheader: `${data.workspaceName || 'A new workspace'} has invited you to join CoAIleague. Complete your profile setup now.`,
        header: emailHeader({ title: 'Complete Your Setup', subtitle: `Finish setting up your ${data.workspaceName || 'CoAIleague'} account`, badge: 'Welcome', theme: 'blue' }),
        body:
          greeting(data.employeeName || 'there') +
          para(`<strong>${data.workspaceName || 'CoAIleague'}</strong> has created an account for you. Click below to complete your profile setup and get started.`) +
          (data.tempPassword
            ? infoCard({ rows: [{ label: 'Temporary Password', value: data.tempPassword, highlight: true }] })
            : '') +
          '<table width="100%" border="0" cellspacing="0" cellpadding="0" style="margin:28px 0;"><tr><td align="center">' +
          ctaButton({ text: 'Complete Your Setup', url: data.inviteUrl }) +
          '</td></tr></table>' +
          alertBox({ type: 'warning', title: `Invitation expires in ${data.expiresIn || '24 hours'}`, body: 'Please complete your setup before the link expires. Contact your manager for a new link if needed.' }) +
          para('Once set up, you will have access to your shift schedule, time tracking, pay stubs, and more.', { muted: true, small: true }),
      }),
    }),

    /**
     * PTO APPROVED
     */
    ptoApproved: (data: {
      employeeName: string;
      startDate: string;
      endDate: string;
      days: number;
      approvedBy: string;
      notes?: string;
    }) => ({
      subject: 'Time Off Request Approved',
      html: emailLayout({
        preheader: `Your time off request from ${data.startDate || ''} to ${data.endDate || ''} has been approved.`,
        header: emailHeader({ title: 'Time Off Approved', subtitle: 'Your time off request has been approved', badge: 'PTO Approved', theme: 'green' }),
        body:
          greeting(data.employeeName || 'there') +
          para('Great news! Your time off request has been approved.') +
          infoCard({
            title: 'Time Off Details',
            rows: [
              { label: 'Start Date', value: data.startDate || 'TBD', highlight: true },
              { label: 'End Date', value: data.endDate || 'TBD' },
              { label: 'Total Days', value: `${data.days || 0} day(s)` },
              { label: 'Approved By', value: data.approvedBy || 'Manager' },
            ],
          }) +
          (data.notes ? alertBox({ type: 'info', title: 'Notes from Approver', body: data.notes }) : '') +
          alertBox({ type: 'success', title: 'Time off confirmed', body: 'Your schedule has been updated. Please ensure any outstanding work is handed off before your time off begins.' }) +
          para('Enjoy your time off! Log in to CoAIleague to view your updated schedule.', { muted: true, small: true }),
      }),
    }),

    /**
     * PTO DENIED
     */
    ptoDenied: (data: {
      employeeName: string;
      startDate: string;
      endDate: string;
      denialReason?: string;
      deniedBy: string;
    }) => ({
      subject: 'Time Off Request — Decision Required',
      html: emailLayout({
        preheader: `Your time off request from ${data.startDate || ''} to ${data.endDate || ''} was not approved.`,
        header: emailHeader({ title: 'Time Off Not Approved', subtitle: 'Your time off request could not be approved', badge: 'PTO Decision', theme: 'dark' }),
        body:
          greeting(data.employeeName || 'there') +
          para('We have reviewed your time off request. Unfortunately, we are unable to approve it at this time.') +
          infoCard({
            title: 'Request Details',
            rows: [
              { label: 'Requested Start', value: data.startDate || 'TBD' },
              { label: 'Requested End', value: data.endDate || 'TBD' },
              { label: 'Reviewed By', value: data.deniedBy || 'Manager' },
            ],
          }) +
          (data.denialReason ? alertBox({ type: 'warning', title: 'Reason', body: data.denialReason }) : '') +
          para('Please speak with your manager if you have questions or would like to discuss alternative dates.', { muted: true }),
      }),
    }),

    /**
     * SHIFT ACTION APPROVED
     */
    shiftActionApproved: (data: {
      employeeName: string;
      actionType: string;
      shiftTitle: string;
      shiftDate: string;
      approvedBy?: string;
    }) => ({
      subject: `Shift ${data.actionType || 'Request'} Approved`,
      html: emailLayout({
        preheader: `Your shift ${data.actionType ? data.actionType.toLowerCase() : 'request'} has been approved.`,
        header: emailHeader({ title: `Shift ${data.actionType || 'Request'} Approved`, subtitle: 'Your shift request has been approved', badge: 'Approved', theme: 'green' }),
        body:
          greeting(data.employeeName || 'there') +
          para(`Your shift ${data.actionType ? data.actionType.toLowerCase() : 'request'} has been approved. The schedule has been updated accordingly.`) +
          infoCard({
            rows: [
              { label: 'Action', value: data.actionType || 'Request', highlight: true },
              { label: 'Shift', value: data.shiftTitle || 'Shift' },
              { label: 'Date', value: data.shiftDate || 'TBD' },
              ...(data.approvedBy ? [{ label: 'Approved By', value: data.approvedBy }] : []),
            ],
          }) +
          alertBox({ type: 'success', title: 'Schedule updated', body: 'Your schedule has been updated to reflect this change. Log in to view your updated shifts.' }),
      }),
    }),

    /**
     * SHIFT ACTION DENIED
     */
    shiftActionDenied: (data: {
      employeeName: string;
      actionType: string;
      shiftTitle: string;
      shiftDate: string;
      denialReason?: string;
    }) => ({
      subject: `Shift ${data.actionType || 'Request'} — Not Approved`,
      html: emailLayout({
        preheader: `Your shift ${data.actionType ? data.actionType.toLowerCase() : 'request'} could not be approved.`,
        header: emailHeader({ title: `Shift ${data.actionType || 'Request'} Not Approved`, subtitle: 'Your shift request could not be approved', badge: 'Decision', theme: 'dark' }),
        body:
          greeting(data.employeeName || 'there') +
          para(`Your shift ${data.actionType ? data.actionType.toLowerCase() : 'request'} has been reviewed and could not be approved at this time.`) +
          infoCard({
            rows: [
              { label: 'Action', value: data.actionType || 'Request' },
              { label: 'Shift', value: data.shiftTitle || 'Shift' },
              { label: 'Date', value: data.shiftDate || 'TBD' },
            ],
          }) +
          (data.denialReason ? alertBox({ type: 'warning', title: 'Reason', body: data.denialReason }) : '') +
          para('Please contact your manager if you have questions about this decision.', { muted: true }),
      }),
    }),

    /**
     * TIMESHEET EDIT APPROVED
     */
    timesheetEditApproved: (data: {
      employeeName: string;
      timeEntryDate: string;
      changes: string;
    }) => ({
      subject: 'Timesheet Edit Request Approved',
      html: emailLayout({
        preheader: `Your timesheet edit for ${data.timeEntryDate || 'TBD'} has been approved and applied.`,
        header: emailHeader({ title: 'Timesheet Edit Approved', subtitle: 'Your timesheet has been updated', badge: 'Approved', theme: 'green' }),
        body:
          greeting(data.employeeName || 'there') +
          para('Your timesheet edit request has been approved and applied to your record.') +
          infoCard({
            rows: [
              { label: 'Date', value: data.timeEntryDate || 'TBD', highlight: true },
              { label: 'Changes Applied', value: data.changes || 'Updates applied' },
            ],
          }) +
          alertBox({ type: 'success', title: 'Timesheet updated', body: 'The approved changes have been applied to your timesheet. Log in to verify the changes are correct.' }),
      }),
    }),

    /**
     * TIMESHEET EDIT DENIED
     */
    timesheetEditDenied: (data: {
      employeeName: string;
      timeEntryDate: string;
      changes: string;
      denialReason?: string;
    }) => ({
      subject: 'Timesheet Edit Request — Not Approved',
      html: emailLayout({
        preheader: `Your timesheet edit request for ${data.timeEntryDate || 'TBD'} could not be approved.`,
        header: emailHeader({ title: 'Timesheet Edit Not Approved', subtitle: 'Your timesheet edit request was not approved', badge: 'Decision', theme: 'dark' }),
        body:
          greeting(data.employeeName || 'there') +
          para('Your timesheet edit request has been reviewed and could not be approved at this time.') +
          infoCard({
            rows: [
              { label: 'Date', value: data.timeEntryDate || 'TBD' },
              { label: 'Requested Changes', value: data.changes || 'No details' },
            ],
          }) +
          (data.denialReason ? alertBox({ type: 'warning', title: 'Reason', body: data.denialReason }) : '') +
          para('Please contact your manager if you have questions about this decision.', { muted: true }),
      }),
    }),

    /**
     * PERFORMANCE REVIEW
     */
    performanceReview: (data: {
      employeeName: string;
      reviewType: string;
      reviewDate: string;
      reviewerName: string;
    }) => ({
      subject: `Performance Review Scheduled — ${data.reviewType || 'Review'}`,
      html: emailLayout({
        preheader: `A ${data.reviewType || ''} performance review has been scheduled for ${data.reviewDate || 'TBD'}.`,
        header: emailHeader({ title: 'Performance Review Scheduled', subtitle: 'A review has been scheduled for you', badge: 'HR', theme: 'purple' }),
        body:
          greeting(data.employeeName || 'there') +
          para('A performance review has been scheduled for you. Please prepare and be ready to discuss your accomplishments, challenges, and goals.') +
          infoCard({
            rows: [
              { label: 'Review Type', value: data.reviewType || 'Performance Review', highlight: true },
              { label: 'Date', value: data.reviewDate || 'TBD' },
              { label: 'Reviewer', value: data.reviewerName || 'Supervisor' },
            ],
          }) +
          sectionHeading('How to prepare:') +
          checkList([
            'Review your performance metrics and shift history',
            'Prepare examples of your accomplishments',
            'Think about areas where you would like to improve',
            'Write down any questions or concerns you want to discuss',
          ], '#7c3aed') +
          para('Performance reviews are an opportunity for growth. Come prepared with an open mind.', { muted: true }),
      }),
    }),

    /**
     * BENEFIT ENROLLMENT
     */
    benefitEnrollment: (data: {
      employeeName: string;
      benefitType: string;
      startDate: string;
      monthlyContribution?: string;
    }) => ({
      subject: `Benefit Enrollment Confirmation — ${data.benefitType || 'Enrollment'}`,
      html: emailLayout({
        preheader: `Your enrollment in ${data.benefitType || 'benefits'} has been confirmed. Coverage starts ${data.startDate || 'TBD'}.`,
        header: emailHeader({ title: 'Benefit Enrollment Confirmed', subtitle: 'Your enrollment has been processed', badge: 'Benefits', theme: 'green' }),
        body:
          greeting(data.employeeName || 'there') +
          para('Your benefit enrollment has been processed successfully.') +
          infoCard({
            rows: [
              { label: 'Benefit Type', value: data.benefitType || 'Insurance', highlight: true },
              { label: 'Coverage Start Date', value: data.startDate || 'TBD' },
              ...(data.monthlyContribution ? [{ label: 'Monthly Contribution', value: `$${data.monthlyContribution}` }] : []),
            ],
          }) +
          alertBox({ type: 'success', title: 'Enrollment complete', body: 'You will receive additional documentation about your benefits coverage shortly. Keep this email for your records.' }) +
          para('Questions about your benefits? Contact your HR administrator.', { muted: true, small: true }),
      }),
    }),

    /**
     * TERMINATION NOTICE
     */
    terminationNotice: (data: {
      employeeName: string;
      terminationDate: string;
      terminationType: string;
      hrContactEmail: string;
    }) => ({
      subject: 'Important: Offboarding Information',
      html: emailLayout({
        preheader: 'This email contains important information regarding your departure.',
        header: emailHeader({ title: 'Offboarding Information', subtitle: 'Important information about your departure', badge: 'HR Notice', theme: 'dark' }),
        body:
          greeting(data.employeeName || 'there') +
          para('This email contains important information regarding your departure from the company.') +
          infoCard({
            rows: [
              { label: 'Departure Type', value: data.terminationType || 'Departure' },
              { label: 'Last Day', value: data.terminationDate || 'TBD', highlight: true },
            ],
          }) +
          sectionHeading('Next Steps:') +
          checkList([
            'Exit interview will be scheduled',
            'Return all company property and equipment',
            'Complete final paperwork and forms',
            'Review final paycheck and benefit details',
            'Ensure all timesheet entries are submitted',
          ]) +
          alertBox({ type: 'info', title: 'Questions?', body: `Contact HR at <a href="mailto:${data.hrContactEmail || 'hr@coaileague.com'}" style="color:#2563EB;">${data.hrContactEmail || 'support'}</a> for any questions about your offboarding process.` }) +
          para('We appreciate your service and wish you well in your future endeavors.', { muted: true }),
      }),
    }),

    /**
     * REPORT DELIVERY (Full Version with Data)
     */
    reportDelivery: (data: {
      clientName: string;
      reportNumber: string;
      reportName: string;
      submittedBy: string;
      submittedDate: string;
      reportData: Record<string, unknown>;
      attachmentCount?: number;
    }) => ({
      subject: `Report Delivery: ${data.reportName || 'New Report'} [${data.reportNumber || ''}]`,
      html: emailLayout({
        preheader: `Report "${data.reportName || ''}" has been delivered. Tracking ID: ${data.reportNumber || ''}.`,
        header: emailHeader({ title: 'Report Delivered', subtitle: 'A new report has been completed and delivered', badge: 'Reports', theme: 'blue' }),
        body:
          greeting(data.clientName) +
          para('A new report has been completed and delivered to you.') +
          infoCard({
            title: 'Report Information',
            rows: [
              { label: 'Report Name', value: data.reportName, highlight: true },
              { label: 'Tracking ID', value: data.reportNumber },
              { label: 'Submitted By', value: data.submittedBy },
              { label: 'Submitted Date', value: data.submittedDate },
              ...(data.attachmentCount ? [{ label: 'Attachments', value: `${data.attachmentCount} photo(s)` }] : []),
            ],
          }) +
          sectionHeading('Report Details:') +
          infoCard({
            rows: Object.entries(data.reportData).map(([key, value]) => ({
              label: key.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase()),
              value: String(value ?? 'N/A'),
            })),
          }) +
          alertBox({ type: 'info', title: 'Keep your tracking ID', body: `Please retain tracking ID <strong>${data.reportNumber}</strong> for your records. Use it to reference this report in future communications.` }),
      }),
    }),

    /**
     * REVIEW DELETED
     */
    reviewDeleted: (data: {
      recipientName: string;
      reviewType: string;
      deletedBy: string;
      explanation: string;
    }) => ({
      subject: 'Performance Review Removed — Action Taken',
      html: emailLayout({
        preheader: `A ${data.reviewType} performance review has been removed from your record.`,
        header: emailHeader({ title: 'Performance Review Removed', subtitle: 'Platform support has taken action on your record', badge: 'Support Action', theme: 'dark' }),
        body:
          greeting(data.recipientName) +
          para('A performance review has been removed from your record by platform support.') +
          infoCard({
            rows: [
              { label: 'Review Type', value: data.reviewType },
              { label: 'Removed By', value: data.deletedBy, highlight: true },
            ],
          }) +
          alertBox({ type: 'info', title: 'Explanation', body: data.explanation }) +
          para('If you have questions about this action, please contact platform support.', { muted: true }),
      }),
    }),

    /**
     * REVIEW EDITED
     */
    reviewEdited: (data: {
      recipientName: string;
      reviewType: string;
      editedBy: string;
      changesDescription: string;
      explanation: string;
    }) => ({
      subject: 'Performance Review Updated — Action Taken',
      html: emailLayout({
        preheader: `A ${data.reviewType} performance review in your record has been updated.`,
        header: emailHeader({ title: 'Performance Review Updated', subtitle: 'Platform support has updated your record', badge: 'Support Action', theme: 'orange' }),
        body:
          greeting(data.recipientName) +
          para('A performance review in your record has been updated by platform support.') +
          infoCard({
            rows: [
              { label: 'Review Type', value: data.reviewType },
              { label: 'Updated By', value: data.editedBy, highlight: true },
              { label: 'Changes', value: data.changesDescription },
            ],
          }) +
          alertBox({ type: 'info', title: 'Explanation', body: data.explanation }) +
          para('If you have questions about this action, please contact platform support.', { muted: true }),
      }),
    }),

    /**
     * RATING DELETED
     */
    ratingDeleted: (data: {
      workspaceName: string;
      deletedBy: string;
      explanation: string;
    }) => ({
      subject: 'Employer Rating Removed — Action Taken',
      html: emailLayout({
        preheader: 'An employer rating for your organization has been removed by platform support.',
        header: emailHeader({ title: 'Employer Rating Removed', subtitle: 'Platform support has taken action on a rating', badge: 'Support Action', theme: 'dark' }),
        body:
          greeting(data.workspaceName + ' Team') +
          para('An employer rating for your organization has been removed by platform support.') +
          infoCard({
            rows: [
              { label: 'Removed By', value: data.deletedBy, highlight: true },
            ],
          }) +
          alertBox({ type: 'info', title: 'Explanation', body: data.explanation }) +
          para('This action was taken to ensure rating integrity and prevent abuse. Contact platform support with any questions.', { muted: true }),
      }),
    }),

    /**
     * WRITE-UP DELETED
     */
    writeUpDeleted: (data: {
      recipientName: string;
      reportType: string;
      deletedBy: string;
      explanation: string;
    }) => ({
      subject: 'Disciplinary Report Removed — Action Taken',
      html: emailLayout({
        preheader: `A ${data.reportType} report has been removed from your record.`,
        header: emailHeader({ title: 'Disciplinary Report Removed', subtitle: 'Platform support has cleared your record', badge: 'Support Action', theme: 'green' }),
        body:
          greeting(data.recipientName) +
          para('A disciplinary report has been removed from your record by platform support.') +
          infoCard({
            rows: [
              { label: 'Report Type', value: data.reportType },
              { label: 'Removed By', value: data.deletedBy, highlight: true },
            ],
          }) +
          alertBox({ type: 'success', title: 'Record updated', body: data.explanation }) +
          para('Your record has been updated to reflect this change. Contact platform support with any questions.', { muted: true }),
      }),
    }),
  };
  

// ============================================================================
// CAN-SPAM COMPLIANT EMAIL SENDING FUNCTIONS
// All functions use sendCanSpamCompliantEmail for List-Unsubscribe headers
// ============================================================================

export async function sendShiftAssignmentEmail(
  to: string,
  data: Parameters<typeof emailTemplates.shiftAssignment>[0],
  workspaceId?: string
) {
  const template = emailTemplates.shiftAssignment(data);
  return sendCanSpamCompliantEmail({
    to,
    subject: template.subject,
    html: template.html,
    emailType: 'shift_assignment',
    workspaceId,
  });
}

export async function sendShiftReminderEmail(
  to: string,
  data: Parameters<typeof emailTemplates.shiftReminder>[0],
  workspaceId?: string
) {
  const template = emailTemplates.shiftReminder(data);
  return sendCanSpamCompliantEmail({
    to,
    subject: template.subject,
    html: template.html,
    emailType: 'shift_reminder',
    workspaceId,
  });
}

export async function sendInvoiceGeneratedEmail(
  to: string,
  data: Parameters<typeof emailTemplates.invoiceGenerated>[0],
  workspaceId?: string,
  invoiceId?: string
) {
  const template = emailTemplates.invoiceGenerated(data);
  // Invoice emails are transactional - skipUnsubscribeCheck is implicit via emailType
  return sendCanSpamCompliantEmail({
    to,
    subject: template.subject,
    html: template.html,
    emailType: 'invoice_generated',
    workspaceId,
    // Tag with invoiceId so the email.delivered webhook can flip delivery_confirmed
    tags: invoiceId
      ? [
          { name: 'invoiceId', value: invoiceId },
          { name: 'emailType', value: 'invoice_generated' },
        ]
      : undefined,
  });
}

export async function sendInvoiceOverdueReminderEmail(
  to: string,
  data: Parameters<typeof emailTemplates.invoiceOverdueReminder>[0],
  workspaceId?: string
) {
  const template = emailTemplates.invoiceOverdueReminder(data);
  return sendCanSpamCompliantEmail({
    to,
    subject: template.subject,
    html: template.html,
    emailType: 'invoice_overdue_reminder',
    workspaceId,
  });
}

export async function sendEmployeeOnboardingEmail(
  to: string,
  data: Parameters<typeof emailTemplates.employeeOnboarding>[0],
  workspaceId?: string
) {
  const template = emailTemplates.employeeOnboarding(data);
  return sendCanSpamCompliantEmail({
    to,
    subject: template.subject,
    html: template.html,
    emailType: 'employee_onboarding',
    workspaceId,
  });
}

export async function sendOnboardingInviteEmail(
  to: string,
  data: Parameters<typeof emailTemplates.onboardingInvite>[0],
  workspaceId?: string
) {
  const template = emailTemplates.onboardingInvite(data);
  return sendCanSpamCompliantEmail({
    to,
    subject: template.subject,
    html: template.html,
    emailType: 'onboarding_invite',
    workspaceId,
  });
}

export async function sendPTOApprovedEmail(
  to: string,
  data: Parameters<typeof emailTemplates.ptoApproved>[0],
  workspaceId?: string
) {
  const template = emailTemplates.ptoApproved(data);
  return sendCanSpamCompliantEmail({
    to,
    subject: template.subject,
    html: template.html,
    emailType: 'pto_approved',
    workspaceId,
  });
}

export async function sendPTODeniedEmail(
  to: string,
  data: Parameters<typeof emailTemplates.ptoDenied>[0],
  workspaceId?: string
) {
  const template = emailTemplates.ptoDenied(data);
  return sendCanSpamCompliantEmail({
    to,
    subject: template.subject,
    html: template.html,
    emailType: 'pto_denied',
    workspaceId,
  });
}

export async function sendPerformanceReviewEmail(
  to: string,
  data: Parameters<typeof emailTemplates.performanceReview>[0],
  workspaceId?: string
) {
  const template = emailTemplates.performanceReview(data);
  return sendCanSpamCompliantEmail({
    to,
    subject: template.subject,
    html: template.html,
    emailType: 'performance_review',
    workspaceId,
  });
}

export async function sendBenefitEnrollmentEmail(
  to: string,
  data: Parameters<typeof emailTemplates.benefitEnrollment>[0],
  workspaceId?: string
) {
  const template = emailTemplates.benefitEnrollment(data);
  return sendCanSpamCompliantEmail({
    to,
    subject: template.subject,
    html: template.html,
    emailType: 'benefit_enrollment',
    workspaceId,
  });
}

export async function sendTerminationNoticeEmail(
  to: string,
  data: Parameters<typeof emailTemplates.terminationNotice>[0],
  workspaceId?: string
) {
  const template = emailTemplates.terminationNotice(data);
  return sendCanSpamCompliantEmail({
    to,
    subject: template.subject,
    html: template.html,
    emailType: 'termination_notice',
    workspaceId,
  });
}

export async function sendReportDeliveryEmail(
  to: string,
  data: Parameters<typeof emailTemplates.reportDelivery>[0],
  workspaceId?: string
) {
  const template = emailTemplates.reportDelivery(data);
  return sendCanSpamCompliantEmail({
    to,
    subject: template.subject,
    html: template.html,
    emailType: 'report_delivery',
    workspaceId,
  });
}

// Dispute Resolution Email Functions
export async function sendReviewDeletedEmail(
  to: string,
  data: Parameters<typeof emailTemplates.reviewDeleted>[0],
  workspaceId?: string
) {
  const template = emailTemplates.reviewDeleted(data);
  return sendCanSpamCompliantEmail({
    to,
    subject: template.subject,
    html: template.html,
    emailType: 'review_deleted',
    workspaceId,
  });
}

export async function sendReviewEditedEmail(
  to: string,
  data: Parameters<typeof emailTemplates.reviewEdited>[0],
  workspaceId?: string
) {
  const template = emailTemplates.reviewEdited(data);
  return sendCanSpamCompliantEmail({
    to,
    subject: template.subject,
    html: template.html,
    emailType: 'review_edited',
    workspaceId,
  });
}

export async function sendRatingDeletedEmail(
  to: string,
  data: Parameters<typeof emailTemplates.ratingDeleted>[0],
  workspaceId?: string
) {
  const template = emailTemplates.ratingDeleted(data);
  return sendCanSpamCompliantEmail({
    to,
    subject: template.subject,
    html: template.html,
    emailType: 'rating_deleted',
    workspaceId,
  });
}

export async function sendWriteUpDeletedEmail(
  to: string,
  data: Parameters<typeof emailTemplates.writeUpDeleted>[0],
  workspaceId?: string
) {
  const template = emailTemplates.writeUpDeleted(data);
  return sendCanSpamCompliantEmail({
    to,
    subject: template.subject,
    html: template.html,
    emailType: 'writeup_deleted',
    workspaceId,
  });
}

// Shift Action Notification Emails
export async function sendShiftActionApprovedEmail(
  to: string,
  data: Parameters<typeof emailTemplates.shiftActionApproved>[0],
  workspaceId?: string
) {
  const template = emailTemplates.shiftActionApproved(data);
  return sendCanSpamCompliantEmail({
    to,
    subject: template.subject,
    html: template.html,
    emailType: 'shift_action_approved',
    workspaceId,
  });
}

export async function sendShiftActionDeniedEmail(
  to: string,
  data: Parameters<typeof emailTemplates.shiftActionDenied>[0],
  workspaceId?: string
) {
  const template = emailTemplates.shiftActionDenied(data);
  return sendCanSpamCompliantEmail({
    to,
    subject: template.subject,
    html: template.html,
    emailType: 'shift_action_denied',
    workspaceId,
  });
}

// Timesheet Edit Request Notification Emails
export async function sendTimesheetEditApprovedEmail(
  to: string,
  data: Parameters<typeof emailTemplates.timesheetEditApproved>[0],
  workspaceId?: string
) {
  const template = emailTemplates.timesheetEditApproved(data);
  return sendCanSpamCompliantEmail({
    to,
    subject: template.subject,
    html: template.html,
    emailType: 'timesheet_edit_approved',
    workspaceId,
  });
}

export async function sendTimesheetEditDeniedEmail(
  to: string,
  data: Parameters<typeof emailTemplates.timesheetEditDenied>[0],
  workspaceId?: string
) {
  const template = emailTemplates.timesheetEditDenied(data);
  return sendCanSpamCompliantEmail({
    to,
    subject: template.subject,
    html: template.html,
    emailType: 'timesheet_edit_denied',
    workspaceId,
  });
}

// ============================================================================
// WORKSPACE WELCOME EMAIL
// ============================================================================

export async function sendWorkspaceWelcomeEmail(
  to: string,
  data: { orgName: string; ownerName?: string },
  workspaceId?: string
) {
  const firstName = data.ownerName?.split(' ')[0] || 'there';
  return sendCanSpamCompliantEmail({
    to,
    subject: `Welcome to CoAIleague — ${data.orgName} is ready`,
    html: `
      <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; max-width: 600px; margin: 0 auto; padding: 32px 24px; background: #0f172a; color: #e2e8f0;">
        <div style="margin-bottom: 32px;">
          <img src="https://app.coaileague.com/logo.png" alt="CoAIleague" style="height: 40px;" onerror="this.style.display='none'" />
        </div>
        <h1 style="color: #f8fafc; font-size: 24px; font-weight: 700; margin: 0 0 8px;">
          Welcome to CoAIleague, ${firstName}.
        </h1>
        <p style="color: #94a3b8; font-size: 15px; line-height: 1.6; margin: 0 0 24px;">
          Your workspace <strong style="color: #e2e8f0;">${data.orgName}</strong> is set up and ready to go.
          Trinity AI is standing by with 500 trial credits to help you run your operations from day one.
        </p>
        <div style="background: #1e293b; border-radius: 8px; padding: 20px; margin-bottom: 24px;">
          <p style="color: #94a3b8; font-size: 13px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.05em; margin: 0 0 12px;">Next steps</p>
          <ol style="color: #cbd5e1; font-size: 14px; line-height: 1.8; padding-left: 20px; margin: 0;">
            <li>Import your employees via CSV</li>
            <li>Import your clients and job sites</li>
            <li>Create your first schedule</li>
            <li>Ask Trinity AI anything about your operations</li>
          </ol>
        </div>
        <a href="https://app.coaileague.com" style="display: inline-block; background: #d4a017; color: #0f172a; font-weight: 700; font-size: 15px; padding: 12px 28px; border-radius: 6px; text-decoration: none; margin-bottom: 24px;">
          Open CoAIleague
        </a>
        <p style="color: #475569; font-size: 13px; margin: 0;">
          You have <strong style="color: #94a3b8;">500 trial credits</strong> — enough to experience scheduling, invoicing, and payroll automation for your full team.
          Credits reset monthly when you subscribe to a paid plan.
        </p>
        <hr style="border: none; border-top: 1px solid #1e293b; margin: 24px 0;" />
        <p style="color: #334155; font-size: 12px; margin: 0;">
          CoAIleague · Built for security companies · 
          <a href="https://app.coaileague.com/unsubscribe" style="color: #475569;">Unsubscribe</a>
        </p>
      </div>
    `,
    emailType: 'workspace_welcome',
    workspaceId,
  });
}

// ============================================================================
// PAY STUB NOTIFICATION — Track A
// Trigger: payroll run status → 'processed'
// To: each employee
// ============================================================================
export async function sendPayStubEmail(
  to: string,
  data: {
    employeeName: string;
    payPeriodLabel: string;
    grossPay: string;
    netPay: string;
    payStubUrl: string;
    orgName: string;
  },
  workspaceId?: string
) {
  const {
    emailLayout, emailHeader,
    greeting, para, infoCard, alertBox, ctaButton,
  } = await import('./emailTemplateBase');
  const html = emailLayout({
    preheader: `Your pay stub for ${data.payPeriodLabel || 'the current period'} is ready. Net pay: $${data.netPay || '0.00'}.`,
    header: emailHeader({ title: 'Your Pay Stub is Ready', subtitle: `Pay period: ${data.payPeriodLabel || 'Recent'}`, badge: 'Payroll', theme: 'green' }),
    body:
      greeting(data.employeeName || 'there') +
      para(`Your pay stub for <strong>${data.payPeriodLabel || 'the recent pay period'}</strong> has been approved and is now available.`) +
      infoCard({
        title: 'Pay Summary',
        rows: [
          { label: 'Pay Period', value: data.payPeriodLabel || 'TBD' },
          { label: 'Gross Pay', value: `$${data.grossPay || '0.00'}` },
          { label: 'Net Pay', value: `$${data.netPay || '0.00'}`, highlight: true },
          { label: 'Organization', value: data.orgName || 'CoAIleague' },
        ],
      }) +
      `<table width="100%" border="0" cellspacing="0" cellpadding="0" style="margin:28px 0;"><tr><td align="center">` +
      ctaButton({ text: 'View Pay Stub', url: data.payStubUrl, style: 'success' }) +
      `</td></tr></table>` +
      para('Your full pay stub with deductions and hours breakdown is available in your CoAIleague dashboard.', { muted: true, small: true }),
  });
  return sendCanSpamCompliantEmail({
    to,
    subject: `Your Pay Stub for ${data.payPeriodLabel || 'the current period'} is Ready`,
    html,
    emailType: 'pay_stub_available',
    workspaceId,
    skipUnsubscribeCheck: true,
  });
}

// ============================================================================
// CREDIT WARNING — Track A
// Trigger: tokenManager.ts PHASE 16 — 25% and 10% thresholds
// To: org_owner
// ============================================================================
export async function sendCreditWarningEmail(
  to: string,
  data: {
    ownerName: string;
    orgName: string;
    currentBalance: number;
    monthlyAllocation: number;
    percentRemaining: number;
    isCritical: boolean;
    topUpUrl: string;
    billingUrl: string;
    burnRateDailyEstimate?: number;
    topConsumers?: Array<{ action: string; credits: number }>;
  },
  workspaceId?: string
) {
  const {
    emailLayout, emailHeader,
    greeting, para, infoCard, alertBox, ctaButton, divider,
  } = await import('./emailTemplateBase');

  const pctLabel = `${data.percentRemaining}%`;
  const daysLeft = data.burnRateDailyEstimate && data.burnRateDailyEstimate > 0
    ? Math.floor(data.currentBalance / data.burnRateDailyEstimate)
    : null;

  const html = emailLayout({
    preheader: data.isCritical
      ? `CRITICAL: Only ${pctLabel} of your AI credits remain. AI features will stop at zero.`
      : `Warning: Only ${pctLabel} of your AI credits remain. Top up to avoid interruption.`,
    header: emailHeader({
      title: data.isCritical ? 'Credits Critically Low' : 'Credits Running Low',
      subtitle: `${data.orgName || 'Your Workspace'} — ${pctLabel} remaining`,
      badge: data.isCritical ? 'Critical Alert' : 'Credit Warning',
      theme: data.isCritical ? 'red' : 'orange',
    }),
    body:
      greeting(data.ownerName || 'there') +
      para(data.isCritical
        ? `Your AI credit balance has dropped to <strong>${(data.currentBalance || 0).toLocaleString()} credits</strong> — only <strong>${pctLabel}</strong> of your monthly allocation. AI features will pause when the balance reaches zero.`
        : `Your AI credit balance is at <strong>${(data.currentBalance || 0).toLocaleString()} credits</strong> — <strong>${pctLabel}</strong> of your ${(data.monthlyAllocation || 0).toLocaleString()} monthly allocation.`) +
      infoCard({
        title: 'Credit Status',
        rows: [
          { label: 'Current Balance', value: `${(data.currentBalance || 0).toLocaleString()} credits`, highlight: true },
          { label: 'Monthly Allocation', value: `${(data.monthlyAllocation || 0).toLocaleString()} credits` },
          { label: 'Remaining', value: pctLabel, highlight: data.isCritical },
          ...(daysLeft !== null ? [{ label: 'Estimated Days Left', value: `${daysLeft} day${daysLeft !== 1 ? 's' : ''}` }] : []),
        ],
      }) +
      (data.topConsumers && data.topConsumers.length > 0
        ? infoCard({
            title: 'Top Credit-Consuming Actions',
            rows: data.topConsumers.map(c => ({ label: c.action, value: `${c.credits} credits` })),
          })
        : '') +
      alertBox({
        type: data.isCritical ? 'danger' : 'warning',
        title: data.isCritical ? 'Immediate action required' : 'Action recommended',
        body: data.isCritical
          ? 'AI-powered features including scheduling assistance, compliance monitoring, and Trinity AI will stop working when your balance reaches zero. Top up now to prevent interruption.'
          : 'Consider purchasing additional credits or upgrading your plan to ensure uninterrupted AI operations.',
      }) +
      `<table width="100%" border="0" cellspacing="0" cellpadding="0" style="margin:28px 0;"><tr>` +
      `<td align="center" style="padding:0 8px;">` +
      ctaButton({ text: 'Buy Credits Now', url: data.topUpUrl, style: data.isCritical ? 'danger' : 'warning' }) +
      `</td></tr></table>` +
      divider() +
      para(`You can also <a href="${data.billingUrl}" style="color:#2563EB;">upgrade your plan</a> for a higher monthly credit allocation.`, { muted: true, small: true }),
  });

  return sendCanSpamCompliantEmail({
    to,
    subject: data.isCritical
      ? `Action Required — AI Credits Critically Low (${pctLabel} remaining) — ${data.orgName}`
      : `Warning — AI Credits Running Low (${pctLabel} remaining) — ${data.orgName}`,
    html,
    emailType: 'credit_warning',
    workspaceId,
    skipUnsubscribeCheck: true,
  });
}

// ============================================================================
// COMPLIANCE ALERT — Track A (tiered)
// Trigger: license expiry scan
// To: org_owner and manager
// ============================================================================
export async function sendComplianceAlertEmail(
  to: string,
  data: {
    recipientName: string;
    officerName: string;
    licenseType: string;
    expirationDate: string;
    daysRemaining: number;
    tier: 'info' | 'warning' | 'urgent' | 'critical';
    schedulingImpact: string;
    complianceUrl: string;
    renewalInstructions?: string;
    orgName: string;
  },
  workspaceId?: string
) {
  const {
    emailLayout, emailHeader,
    greeting, para, infoCard, alertBox, ctaButton,
  } = await import('./emailTemplateBase');

  const tierConfig = {
    info:     { theme: 'blue',   badge: 'Compliance — 90 Days',  alertType: 'info' as const,    title: 'License Expiring in 90 Days' },
    warning:  { theme: 'orange', badge: 'Compliance — 60 Days',  alertType: 'warning' as const, title: 'License Expiring in 60 Days' },
    urgent:   { theme: 'red',    badge: 'Compliance — 30 Days',  alertType: 'danger' as const,  title: 'License Expiring in 30 Days' },
    critical: { theme: 'red',    badge: 'License Expired',       alertType: 'danger' as const,  title: 'License Expired — Officer Removed from Scheduling' },
  }[data.tier];

  const subjectByTier = {
    info:     `Security License Expiring in 90 Days — ${data.officerName}`,
    warning:  `Warning — Security License Expiring in 60 Days — ${data.officerName}`,
    urgent:   `Urgent — Security License Expiring in 30 Days — ${data.officerName}`,
    critical: `License Expired — ${data.officerName} Removed from Scheduling`,
  }[data.tier];

  const html = emailLayout({
    preheader: `${data.officerName}'s ${data.licenseType} ${data.tier === 'critical' ? 'has expired' : `expires in ${data.daysRemaining} days`}.`,
    header: emailHeader({ title: tierConfig.title, subtitle: `Officer: ${data.officerName}`, badge: tierConfig.badge, theme: tierConfig.theme }),
    body:
      greeting(data.recipientName) +
      para(data.tier === 'critical'
        ? `<strong>${data.officerName}</strong>'s <strong>${data.licenseType}</strong> has expired. This officer has been automatically removed from scheduling until the license is renewed.`
        : `<strong>${data.officerName}</strong>'s <strong>${data.licenseType}</strong> expires in <strong>${data.daysRemaining} day${data.daysRemaining !== 1 ? 's' : ''}</strong>. Action is required to maintain scheduling eligibility.`) +
      infoCard({
        title: 'License Details',
        rows: [
          { label: 'Officer', value: data.officerName, highlight: true },
          { label: 'License Type', value: data.licenseType },
          { label: 'Expiration Date', value: data.expirationDate, highlight: data.tier === 'critical' || data.tier === 'urgent' },
          { label: 'Days Remaining', value: data.tier === 'critical' ? 'EXPIRED' : `${data.daysRemaining} days` },
          { label: 'Scheduling Impact', value: data.schedulingImpact },
        ],
      }) +
      alertBox({
        type: tierConfig.alertType,
        title: data.tier === 'critical' ? 'Scheduling suspended' : 'Renewal required',
        body: data.renewalInstructions || 'Contact the officer to ensure their license renewal is in progress. Update the license record in CoAIleague once renewed.',
      }) +
      `<table width="100%" border="0" cellspacing="0" cellpadding="0" style="margin:28px 0;"><tr><td align="center">` +
      ctaButton({ text: 'View Compliance Record', url: data.complianceUrl, style: data.tier === 'critical' ? 'danger' : data.tier === 'urgent' ? 'warning' : 'primary' }) +
      `</td></tr></table>`,
  });

  return sendCanSpamCompliantEmail({
    to,
    subject: subjectByTier,
    html,
    emailType: `compliance_alert_${data.tier}`,
    workspaceId,
  });
}

// ============================================================================
// INVOICE PAID CONFIRMATION — Track A
// Trigger: invoice marked as paid
// To: org_owner
// ============================================================================
export async function sendInvoicePaidEmail(
  to: string,
  data: {
    ownerName: string;
    invoiceNumber: string;
    clientName: string;
    amountPaid: string;
    paymentDate: string;
    paymentMethod: string;
    referenceNumber?: string;
    invoiceUrl: string;
    monthlyRevenueTotal?: string;
  },
  workspaceId?: string
) {
  const {
    emailLayout, emailHeader,
    greeting, para, infoCard, alertBox, ctaButton,
  } = await import('./emailTemplateBase');

  const html = emailLayout({
    preheader: `Payment received: ${data.clientName} paid Invoice ${data.invoiceNumber} — $${data.amountPaid}.`,
    header: emailHeader({ title: 'Payment Received', subtitle: `Invoice ${data.invoiceNumber} has been paid`, badge: 'Billing', theme: 'green' }),
    body:
      greeting(data.ownerName) +
      para(`Good news — <strong>${data.clientName}</strong> has paid invoice <strong>${data.invoiceNumber}</strong>.`) +
      infoCard({
        title: 'Payment Details',
        rows: [
          { label: 'Invoice Number', value: data.invoiceNumber },
          { label: 'Client', value: data.clientName, highlight: true },
          { label: 'Amount Received', value: `$${data.amountPaid}`, highlight: true },
          { label: 'Payment Date', value: data.paymentDate },
          { label: 'Payment Method', value: data.paymentMethod },
          ...(data.referenceNumber ? [{ label: 'Reference Number', value: data.referenceNumber }] : []),
          ...(data.monthlyRevenueTotal ? [{ label: 'Monthly Revenue (MTD)', value: `$${data.monthlyRevenueTotal}` }] : []),
        ],
      }) +
      alertBox({ type: 'success', title: 'Payment confirmed', body: 'This invoice has been marked as paid and the ledger has been updated automatically.' }) +
      `<table width="100%" border="0" cellspacing="0" cellpadding="0" style="margin:28px 0;"><tr><td align="center">` +
      ctaButton({ text: 'View Invoice Record', url: data.invoiceUrl, style: 'success' }) +
      `</td></tr></table>`,
  });

  return sendCanSpamCompliantEmail({
    to,
    subject: `Payment Received — Invoice ${data.invoiceNumber} paid by ${data.clientName}`,
    html,
    emailType: 'invoice_paid_confirmation',
    workspaceId,
    skipUnsubscribeCheck: true,
  });
}

// ============================================================================
// PAYMENT RECEIPT — Track B
// Trigger: invoice marked as paid
// To: client (the company/contact that received the invoice)
// ============================================================================
export async function sendPaymentReceiptToClientEmail(
  to: string,
  data: {
    clientName: string;
    invoiceNumber: string;
    amountPaid: string;
    paymentDate: string;
    paymentMethod: string;
    referenceNumber?: string;
  },
  workspaceId?: string
) {
  const {
    emailLayout, emailHeader,
    greeting, para, infoCard, alertBox,
  } = await import('./emailTemplateBase');

  const html = emailLayout({
    preheader: `Payment confirmed: $${data.amountPaid} received for Invoice ${data.invoiceNumber}. Thank you.`,
    header: emailHeader({ title: 'Payment Confirmed', subtitle: `Receipt for Invoice ${data.invoiceNumber}`, badge: 'Payment', theme: 'green' }),
    body:
      greeting(data.clientName) +
      para(`Thank you — your payment of <strong>$${data.amountPaid}</strong> for Invoice <strong>${data.invoiceNumber}</strong> has been received and applied to your account.`) +
      infoCard({
        title: 'Receipt Details',
        rows: [
          { label: 'Invoice Number', value: data.invoiceNumber },
          { label: 'Amount Paid', value: `$${data.amountPaid}`, highlight: true },
          { label: 'Payment Date', value: data.paymentDate },
          { label: 'Payment Method', value: data.paymentMethod },
          ...(data.referenceNumber ? [{ label: 'Reference Number', value: data.referenceNumber }] : []),
        ],
      }) +
      alertBox({ type: 'success', title: 'Payment recorded', body: 'Please retain this email as your payment confirmation. If you have any questions about this payment, contact your account manager.' }),
  });

  return sendCanSpamCompliantEmail({
    to,
    subject: `Payment Receipt — Invoice ${data.invoiceNumber} ($${data.amountPaid})`,
    html,
    emailType: 'payment_receipt',
    workspaceId,
    skipUnsubscribeCheck: true,
  });
}

// ============================================================================
// SUBSCRIPTION UPGRADE CONFIRMATION — Track A
// Trigger: plan upgrade via Stripe webhook
// To: org_owner
// ============================================================================
export async function sendSubscriptionUpgradeEmail(
  to: string,
  data: {
    ownerName: string;
    orgName: string;
    oldPlan: string;
    newPlan: string;
    newCreditAllocation: number;
    newSeatCount?: number;
    effectiveDate: string;
    nextBillingDate: string;
    billingUrl: string;
    newFeatures: string[];
  },
  workspaceId?: string
) {
  const {
    emailLayout, emailHeader,
    greeting, para, infoCard, checkList, alertBox, ctaButton,
  } = await import('./emailTemplateBase');

  const html = emailLayout({
    preheader: `You have been upgraded from ${data.oldPlan} to ${data.newPlan}. Your new credits: ${data.newCreditAllocation.toLocaleString()}/month.`,
    header: emailHeader({ title: `Upgraded to ${data.newPlan}`, subtitle: `${data.orgName} — Plan Upgrade Confirmed`, badge: 'Subscription', theme: 'purple' }),
    body:
      greeting(data.ownerName) +
      para(`Your subscription has been upgraded from <strong>${data.oldPlan}</strong> to <strong>${data.newPlan}</strong>. Your new features and increased credit allocation are active immediately.`) +
      infoCard({
        title: 'Upgrade Summary',
        rows: [
          { label: 'Previous Plan', value: data.oldPlan },
          { label: 'New Plan', value: data.newPlan, highlight: true },
          { label: 'Monthly Credits', value: `${data.newCreditAllocation.toLocaleString()} credits`, highlight: true },
          ...(data.newSeatCount ? [{ label: 'Seats', value: data.newSeatCount.toString() }] : []),
          { label: 'Effective Date', value: data.effectiveDate },
          { label: 'Next Billing Date', value: data.nextBillingDate },
        ],
      }) +
      (data.newFeatures.length > 0
        ? `<p style="margin:0 0 12px;font-size:15px;font-weight:700;color:#0f172a;">New features now available</p>` +
          checkList(data.newFeatures)
        : '') +
      alertBox({ type: 'info', title: 'Your upgrade is active', body: 'All new features and your increased credit allocation are available immediately. No action required.' }) +
      `<table width="100%" border="0" cellspacing="0" cellpadding="0" style="margin:28px 0;"><tr><td align="center">` +
      ctaButton({ text: 'View Billing & Plan Details', url: data.billingUrl, style: 'purple' }) +
      `</td></tr></table>`,
  });

  return sendCanSpamCompliantEmail({
    to,
    subject: `You have been upgraded to ${data.newPlan} — ${data.orgName}`,
    html,
    emailType: 'subscription_upgrade',
    workspaceId,
    skipUnsubscribeCheck: true,
  });
}

// ============================================================================
// WEEKLY SCHEDULE DISTRIBUTION — Track A
// Trigger: schedule published event
// To: each assigned officer individually (their shifts only)
// ============================================================================
export async function sendWeeklyScheduleEmail(
  to: string,
  data: {
    employeeName: string;
    weekLabel: string;
    shifts: Array<{
      day: string;
      date: string;
      startTime: string;
      endTime: string;
      siteName: string;
      postTitle: string;
      specialInstructions?: string;
    }>;
    scheduleUrl: string;
    orgName: string;
  },
  workspaceId?: string
) {
  const {
    emailLayout, emailHeader,
    greeting, para, alertBox, ctaButton, B,
  } = await import('./emailTemplateBase');

  const shiftRows = data.shifts.map(s =>
    `<tr>
      <td style="padding:10px 12px;border-bottom:1px solid ${B.border};font-size:13px;font-weight:600;color:${B.textPrimary};white-space:nowrap;">${s.day}</td>
      <td style="padding:10px 12px;border-bottom:1px solid ${B.border};font-size:13px;color:${B.textBody};white-space:nowrap;">${s.date}</td>
      <td style="padding:10px 12px;border-bottom:1px solid ${B.border};font-size:13px;color:${B.textBody};white-space:nowrap;">${s.startTime} – ${s.endTime}</td>
      <td style="padding:10px 12px;border-bottom:1px solid ${B.border};font-size:13px;color:${B.textBody};">${s.siteName}</td>
      <td style="padding:10px 12px;border-bottom:1px solid ${B.border};font-size:13px;color:${B.textMuted};">${s.postTitle}</td>
    </tr>`
  ).join('');

  const scheduleTable = `
    <table width="100%" border="0" cellspacing="0" cellpadding="0" style="margin:0 0 24px;border:1px solid ${B.border};border-radius:8px;overflow:hidden;">
      <thead>
        <tr style="background:${B.bgCardSoft};">
          <th style="padding:10px 12px;text-align:left;font-size:12px;font-weight:700;color:${B.textMuted};text-transform:uppercase;letter-spacing:0.05em;">Day</th>
          <th style="padding:10px 12px;text-align:left;font-size:12px;font-weight:700;color:${B.textMuted};text-transform:uppercase;letter-spacing:0.05em;">Date</th>
          <th style="padding:10px 12px;text-align:left;font-size:12px;font-weight:700;color:${B.textMuted};text-transform:uppercase;letter-spacing:0.05em;">Time</th>
          <th style="padding:10px 12px;text-align:left;font-size:12px;font-weight:700;color:${B.textMuted};text-transform:uppercase;letter-spacing:0.05em;">Site</th>
          <th style="padding:10px 12px;text-align:left;font-size:12px;font-weight:700;color:${B.textMuted};text-transform:uppercase;letter-spacing:0.05em;">Post</th>
        </tr>
      </thead>
      <tbody>${shiftRows}</tbody>
    </table>`;

  const html = emailLayout({
    preheader: `Your schedule for the week of ${data.weekLabel} is ready — ${data.shifts.length} shift${data.shifts.length !== 1 ? 's' : ''} assigned.`,
    header: emailHeader({ title: 'Your Weekly Schedule', subtitle: `Week of ${data.weekLabel}`, badge: 'Schedule', theme: 'blue' }),
    body:
      greeting(data.employeeName) +
      para(`Your schedule for the week of <strong>${data.weekLabel}</strong> has been published. You have <strong>${data.shifts.length} shift${data.shifts.length !== 1 ? 's' : ''}</strong> this week.`) +
      scheduleTable +
      alertBox({ type: 'info', title: 'Your shifts only', body: 'This email shows only your assigned shifts. Log in to the platform to view post orders, site details, and supervisor contacts.' }) +
      `<table width="100%" border="0" cellspacing="0" cellpadding="0" style="margin:28px 0;"><tr><td align="center">` +
      ctaButton({ text: 'View Full Schedule', url: data.scheduleUrl }) +
      `</td></tr></table>`,
  });

  return sendCanSpamCompliantEmail({
    to,
    subject: `Your Schedule for the Week of ${data.weekLabel}`,
    html,
    emailType: 'weekly_schedule_distribution',
    workspaceId,
  });
}

// ============================================================================
// SHIFT BROADCAST — Track A
// Trigger: manager instructs Trinity to broadcast open shift to available officers
// To: each available officer — each email has a UNIQUE one-use tokenized accept link
// ============================================================================
export async function sendShiftBroadcastEmail(
  to: string,
  data: {
    officerName: string;
    siteName: string;
    shiftDate: string;
    startTime: string;
    endTime: string;
    postType: string;
    payRate?: string;
    acceptUrl: string;
    expiresIn: string;
    orgName: string;
  },
  workspaceId?: string
) {
  const {
    emailLayout, emailHeader,
    greeting, para, infoCard, alertBox, ctaButton,
  } = await import('./emailTemplateBase');

  const html = emailLayout({
    preheader: `Open shift opportunity at ${data.siteName} on ${data.shiftDate}. Accept now — first confirmed officer gets the shift.`,
    header: emailHeader({ title: 'Shift Opportunity Available', subtitle: `${data.siteName} — ${data.shiftDate}`, badge: 'Open Shift', theme: 'blue' }),
    body:
      greeting(data.officerName) +
      para(`An open shift opportunity is available that matches your qualifications. Review the details below and accept if you are available.`) +
      infoCard({
        title: 'Shift Details',
        rows: [
          { label: 'Site', value: data.siteName, highlight: true },
          { label: 'Date', value: data.shiftDate },
          { label: 'Time', value: `${data.startTime} – ${data.endTime}` },
          { label: 'Post Type', value: data.postType },
          ...(data.payRate ? [{ label: 'Pay Rate', value: `$${data.payRate}/hr`, highlight: true }] : []),
        ],
      }) +
      alertBox({ type: 'warning', title: 'First confirmed officer gets the shift', body: `This offer expires in ${data.expiresIn}. Once a replacement is confirmed, this link will be deactivated.` }) +
      `<table width="100%" border="0" cellspacing="0" cellpadding="0" style="margin:28px 0;"><tr><td align="center">` +
      ctaButton({ text: 'Accept This Shift', url: data.acceptUrl, style: 'success' }) +
      `</td></tr></table>` +
      para('This accept link is unique to you. Do not forward this email. Accepting will notify your manager for final confirmation.', { muted: true, small: true }),
  });

  return sendCanSpamCompliantEmail({
    to,
    subject: `Shift Opportunity — ${data.siteName} — ${data.shiftDate} — ${data.startTime}`,
    html,
    emailType: 'shift_broadcast',
    workspaceId,
  });
}

// ============================================================================
// CALL-OFF CONFIRMATION — Track A
// Trigger: officer submits call-off
// To: the officer who called off
// ============================================================================
export async function sendCallOffConfirmationEmail(
  to: string,
  data: {
    officerName: string;
    shiftDate: string;
    siteName: string;
    supervisorName: string;
    supervisorPhone?: string;
    whatHappensNext: string;
    orgName: string;
  },
  workspaceId?: string
) {
  const {
    emailLayout, emailHeader,
    greeting, para, infoCard, alertBox,
  } = await import('./emailTemplateBase');

  const html = emailLayout({
    preheader: `Your call-off for ${data.shiftDate} at ${data.siteName} has been received and confirmed.`,
    header: emailHeader({ title: 'Call-Off Confirmed', subtitle: `${data.shiftDate} — ${data.siteName}`, badge: 'Call-Off', theme: 'dark' }),
    body:
      greeting(data.officerName) +
      para('Your call-off has been received and your supervisor has been notified. Here are the details of your reported absence.') +
      infoCard({
        title: 'Call-Off Details',
        rows: [
          { label: 'Shift Date', value: data.shiftDate },
          { label: 'Site', value: data.siteName },
          { label: 'Supervisor', value: data.supervisorName },
          ...(data.supervisorPhone ? [{ label: 'Supervisor Phone', value: data.supervisorPhone }] : []),
        ],
      }) +
      alertBox({ type: 'info', title: 'What happens next', body: data.whatHappensNext }) +
      para('You may be contacted by your supervisor if there are questions about your absence. Please respond promptly to any follow-up communication.', { muted: true, small: true }),
  });

  return sendCanSpamCompliantEmail({
    to,
    subject: `Call-Off Confirmed — ${data.shiftDate} — ${data.siteName}`,
    html,
    emailType: 'calloff_confirmation',
    workspaceId,
  });
}

// ============================================================================
// CALL-OFF MANAGER ALERT — Track A
// Trigger: officer submits call-off (supplements in-platform notification)
// To: manager
// ============================================================================
export async function sendCallOffManagerAlertEmail(
  to: string,
  data: {
    managerName: string;
    officerName: string;
    shiftDate: string;
    siteName: string;
    shiftStart: string;
    shiftEnd: string;
    replacementCandidates: Array<{ name: string; availability: string; phone?: string }>;
    approveUrl: string;
    orgName: string;
    reason?: string;
  },
  workspaceId?: string
) {
  const {
    emailLayout, emailHeader,
    greeting, para, infoCard, alertBox, ctaButton, B,
  } = await import('./emailTemplateBase');

  const candidateRows = data.replacementCandidates.slice(0, 3).map((c, i) =>
    `<tr>
      <td style="padding:10px 12px;border-bottom:1px solid ${B.border};font-size:13px;font-weight:600;color:${B.textPrimary};">#${i + 1} — ${c.name}</td>
      <td style="padding:10px 12px;border-bottom:1px solid ${B.border};font-size:13px;color:${B.textBody};">${c.availability}</td>
      <td style="padding:10px 12px;border-bottom:1px solid ${B.border};font-size:13px;color:${B.textMuted};">${c.phone || '—'}</td>
    </tr>`
  ).join('');

  const candidatesTable = data.replacementCandidates.length > 0
    ? `<p style="margin:0 0 12px;font-size:15px;font-weight:700;color:${B.textPrimary};">Trinity Replacement Candidates</p>` +
      `<table width="100%" border="0" cellspacing="0" cellpadding="0" style="margin:0 0 24px;border:1px solid ${B.border};border-radius:8px;overflow:hidden;">
        <thead><tr style="background:${B.bgCardSoft};">
          <th style="padding:10px 12px;text-align:left;font-size:12px;font-weight:700;color:${B.textMuted};text-transform:uppercase;">Officer</th>
          <th style="padding:10px 12px;text-align:left;font-size:12px;font-weight:700;color:${B.textMuted};text-transform:uppercase;">Availability</th>
          <th style="padding:10px 12px;text-align:left;font-size:12px;font-weight:700;color:${B.textMuted};text-transform:uppercase;">Phone</th>
        </tr></thead>
        <tbody>${candidateRows}</tbody>
      </table>`
    : '';

  const html = emailLayout({
    preheader: `Officer call-off alert: ${data.officerName} is unable to work the ${data.shiftDate} shift at ${data.siteName}.`,
    header: emailHeader({ title: 'Officer Call-Off Alert', subtitle: `${data.officerName} — ${data.shiftDate} — ${data.siteName}`, badge: 'Call-Off Alert', theme: 'orange' }),
    body:
      greeting(data.managerName) +
      para(`<strong>${data.officerName}</strong> has submitted a call-off for the following shift. Trinity has identified replacement candidates for your review.`) +
      infoCard({
        title: 'Affected Shift',
        rows: [
          { label: 'Officer', value: data.officerName, highlight: true },
          { label: 'Date', value: data.shiftDate },
          { label: 'Time', value: `${data.shiftStart} – ${data.shiftEnd}` },
          { label: 'Site', value: data.siteName },
          ...(data.reason ? [{ label: 'Call-Off Reason', value: data.reason }] : []),
        ],
      }) +
      candidatesTable +
      alertBox({ type: 'warning', title: 'Action required', body: 'Log in to approve a replacement. Trinity will notify the selected officer and manage the confirmation.' }) +
      `<table width="100%" border="0" cellspacing="0" cellpadding="0" style="margin:28px 0;"><tr><td align="center">` +
      ctaButton({ text: 'Approve Replacement', url: data.approveUrl, style: 'warning' }) +
      `</td></tr></table>`,
  });

  return sendCanSpamCompliantEmail({
    to,
    subject: `Officer Call-Off Alert — ${data.shiftDate} — ${data.siteName}`,
    html,
    emailType: 'calloff_manager_alert',
    workspaceId,
  });
}

// ============================================================================
// CALL-OFF REPLACEMENT ASSIGNMENT — Track A
// Trigger: manager assigns replacement officer
// To: replacement officer
// ============================================================================
export async function sendCallOffReplacementEmail(
  to: string,
  data: {
    officerName: string;
    shiftDate: string;
    startTime: string;
    endTime: string;
    siteName: string;
    siteAddress: string;
    postOrdersSummary?: string;
    confirmUrl: string;
    declineUrl: string;
    responseDeadline: string;
    supervisorName: string;
    supervisorPhone?: string;
    orgName: string;
  },
  workspaceId?: string
) {
  const {
    emailLayout, emailHeader,
    greeting, para, infoCard, alertBox, ctaButton,
  } = await import('./emailTemplateBase');

  const html = emailLayout({
    preheader: `You have been assigned to cover a shift at ${data.siteName} on ${data.shiftDate}. Please confirm by ${data.responseDeadline}.`,
    header: emailHeader({ title: 'Shift Assignment — Coverage Needed', subtitle: `${data.siteName} — ${data.shiftDate}`, badge: 'Replacement Assignment', theme: 'orange' }),
    body:
      greeting(data.officerName) +
      para(`You have been selected to cover an open shift. Please review the details and confirm your availability.`) +
      infoCard({
        title: 'Shift Details',
        rows: [
          { label: 'Date', value: data.shiftDate },
          { label: 'Time', value: `${data.startTime} – ${data.endTime}` },
          { label: 'Site', value: data.siteName, highlight: true },
          { label: 'Address', value: data.siteAddress },
          { label: 'Supervisor', value: data.supervisorName },
          ...(data.supervisorPhone ? [{ label: 'Supervisor Phone', value: data.supervisorPhone }] : []),
        ],
      }) +
      (data.postOrdersSummary
        ? `<p style="margin:0 0 12px;font-size:15px;font-weight:700;color:#0f172a;">Post Orders Summary</p>` +
          `<p style="margin:0 0 24px;font-size:14px;color:#334155;line-height:1.6;">${data.postOrdersSummary}</p>`
        : '') +
      alertBox({ type: 'warning', title: `Please respond by ${data.responseDeadline}`, body: 'If you do not respond within 2 hours, Trinity will escalate back to the manager to assign another officer.' }) +
      `<table width="100%" border="0" cellspacing="0" cellpadding="0" style="margin:28px 0;"><tr>` +
      `<td align="center" style="padding:0 8px;">` +
      ctaButton({ text: 'Confirm — I Can Work This Shift', url: data.confirmUrl, style: 'success' }) +
      `</td></tr><tr><td align="center" style="padding:12px 8px 0;">` +
      ctaButton({ text: 'Cannot Accept This Shift', url: data.declineUrl, style: 'dark' }) +
      `</td></tr></table>`,
  });

  return sendCanSpamCompliantEmail({
    to,
    subject: `Shift Assignment — ${data.siteName} — ${data.shiftDate}`,
    html,
    emailType: 'calloff_replacement_assignment',
    workspaceId,
  });
}
