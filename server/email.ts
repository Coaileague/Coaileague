/**
 * server/email.ts — Root email barrel
 *
 * All routes and services that do `await import('../email')` or
 * `await import('../../email')` land here.  Every symbol lives in
 * emailCore; this file is a transparent re-export so import paths
 * that were written against the root resolve correctly.
 */

export * from './services/emailCore';

import { createLogger } from './lib/logger';
const log = createLogger('email');
import {
  sendCanSpamCompliantEmail,
  isResendConfigured,
  getUncachableResendClient,
  type CanSpamEmailOptions,
} from './services/emailCore';

/**
 * Generic sendEmail — thin wrapper around sendCanSpamCompliantEmail.
 * Used by externalEmailRoutes and any other caller that just needs a
 * simple {to, subject, html, text} interface.
 *
 * Failure semantics: returns { success: false } when Resend is not
 * configured, but propagates the underlying reason so callers can mark
 * the row as failed instead of silently writing status='sent'. Callers
 * MUST check `result.success` before treating the send as delivered.
 */
export async function sendEmail(opts: {
  to: string;
  subject: string;
  html: string;
  text?: string;
  from?: string;
  replyTo?: string;
  workspaceId?: string;
}): Promise<{ id?: string; success: boolean; error?: string }> {
  if (!isResendConfigured()) {
    // Trigger client construction once so the configured flag is set on first
    // boot. getUncachableResendClient() is the canonical source of truth and
    // also drives the production-mode "throw" behavior — relying on the
    // cached `resendConfigured` flag alone produced a chicken-and-egg silent
    // failure on the very first call after server start.
    await getUncachableResendClient();
  }

  if (!isResendConfigured()) {
    log.warn('[email] Resend not configured — email not sent to:', opts.to);
    return { success: false, error: 'Resend not configured' };
  }

  const result = await sendCanSpamCompliantEmail({
    to: opts.to,
    subject: opts.subject,
    html: opts.html,
    text: opts.text,
    from: opts.from,
    replyTo: opts.replyTo,
    workspaceId: opts.workspaceId,
  } as CanSpamEmailOptions);

  if (!result.success) {
    return {
      success: false,
      error: result.reason || (result.error?.message ?? 'Email delivery failed'),
    };
  }

  return { id: (result as Record<string,unknown>)?.data?.id, success: true };
}
