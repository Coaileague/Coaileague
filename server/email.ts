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
 */
export async function sendEmail(opts: {
  to: string;
  subject: string;
  html: string;
  text?: string;
  from?: string;
  replyTo?: string;
  workspaceId?: string;
}): Promise<{ id?: string; success: boolean }> {
  if (!isResendConfigured()) {
    log.warn('[email] Resend not configured — email not sent to:', opts.to);
    return { success: false };
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

  return { id: (result as any)?.id, success: true };
}
