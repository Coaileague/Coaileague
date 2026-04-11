import { pool } from '../db';
import { createLogger } from '../lib/logger';
import { NotificationDeliveryService } from './notificationDeliveryService';
import {
  processInboundEmail,
  type ParsedInboundEmail,
} from './trinity/trinityInboundEmailProcessor';

const log = createLogger('TrinityEmailProcessor');

export interface InboundEmailData {
  to: string;
  from: string;
  subject: string;
  body: string;
  htmlBody?: string;
  attachments?: any[];
  messageId: string;
  inReplyTo?: string;
  threadId?: string;
}

type AddressType = 'careers' | 'verify' | 'support' | 'calloffs' | 'trinity' | 'main';

export class TrinityEmailProcessor {
  private static instance: TrinityEmailProcessor;

  static getInstance(): TrinityEmailProcessor {
    if (!TrinityEmailProcessor.instance) {
      TrinityEmailProcessor.instance = new TrinityEmailProcessor();
    }
    return TrinityEmailProcessor.instance;
  }

  async processInbound(emailData: InboundEmailData): Promise<void> {
    try {
      const workspace = await this.resolveWorkspaceFromEmail(emailData.to);
      if (!workspace) {
        log.warn(`Inbound email to unknown address: ${emailData.to}`);
        return;
      }

      const sender = await this.identifySender(emailData.from, workspace.id);
      const storedEmail = await this.storeInboundEmail(emailData, workspace.id, sender);
      const addressType = this.getAddressType(emailData.to, workspace);

      log.info(`Processing inbound email type=${addressType} workspace=${workspace.id} from=${emailData.from}`);

      switch (addressType) {
        case 'careers':
          await this.handleCareersEmail(storedEmail, workspace, sender);
          break;
        case 'verify':
          await this.handleVerificationEmail(storedEmail, workspace, sender);
          break;
        case 'support':
          await this.handleSupportEmail(storedEmail, workspace, sender);
          break;
        case 'calloffs':
          await this.handleCalloffEmail(storedEmail, workspace, sender);
          break;
        case 'trinity':
          await this.handleTrinityDirectEmail(storedEmail, workspace, sender);
          break;
        default:
          await this.handleMainInboxEmail(storedEmail, workspace, sender);
      }
    } catch (err: any) {
      log.error('Error processing inbound email:', err?.message);
    }
  }

  getAddressType(toAddress: string, workspace: any): AddressType {
    const to = (toAddress || '').toLowerCase();
    if (workspace.careers_email && to === workspace.careers_email.toLowerCase()) return 'careers';
    if (workspace.verify_email && to === workspace.verify_email.toLowerCase()) return 'verify';
    if (workspace.support_email && to === workspace.support_email.toLowerCase()) return 'support';
    if (workspace.calloffs_email && to === workspace.calloffs_email.toLowerCase()) return 'calloffs';
    if (workspace.trinity_email && to === workspace.trinity_email.toLowerCase()) return 'trinity';
    return 'main';
  }

  async resolveWorkspaceFromEmail(toAddress: string): Promise<any | null> {
    if (!toAddress) return null;
    const addr = toAddress.toLowerCase();

    // Step 4 (Email Build): Primary lookup via platform_email_addresses table
    // This supports per-workspace provisioned addresses (trinity@, careers@, etc.)
    const pea = await pool.query(
      `SELECT pea.workspace_id, pea.address_type, pea.trinity_calltype, pea.auto_trinity_process,
              w.id, w.name, w.slug, w.subscription_tier, w.workspace_type,
              w.trinity_email, w.careers_email, w.verify_email, w.support_email, w.calloffs_email
       FROM platform_email_addresses pea
       JOIN workspaces w ON w.id = pea.workspace_id
       WHERE LOWER(pea.address) = $1
         AND pea.is_active = true
         AND pea.is_outbound_only = false
       LIMIT 1`,
      [addr]
    );
    if (pea.rows[0]) return pea.rows[0];

    // Fallback: legacy workspace column lookup (for workspaces not yet migrated to platform_email_addresses)
    const legacy = await pool.query(
      `SELECT * FROM workspaces
       WHERE LOWER(trinity_email) = $1
          OR LOWER(careers_email) = $1
          OR LOWER(verify_email) = $1
          OR LOWER(support_email) = $1
          OR LOWER(calloffs_email) = $1
       LIMIT 1`,
      [addr]
    );
    return legacy.rows[0] || null;
  }

  async identifySender(fromEmail: string, workspaceId: string): Promise<any | null> {
    const result = await pool.query(
      `SELECT u.*, e.first_name, e.last_name
       FROM users u
       LEFT JOIN employees e ON e.id = u.employee_id
       WHERE u.email = $1 AND u.workspace_id = $2
       LIMIT 1`,
      [fromEmail, workspaceId]
    );
    return result.rows[0] || null;
  }

  async storeInboundEmail(emailData: InboundEmailData, workspaceId: string, sender: any): Promise<any> {
    const result = await pool.query(
      `INSERT INTO inbound_emails
       (workspace_id, from_email, from_name, to_email, subject, body_text, body_html,
        message_id, status, received_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'pending', NOW())
       ON CONFLICT (message_id) DO NOTHING
       RETURNING *`,
      [
        workspaceId,
        emailData.from,
        sender?.from_name || null,
        emailData.to,
        emailData.subject,
        emailData.body,
        emailData.htmlBody || null,
        emailData.messageId,
      ]
    );
    return result.rows[0] || { workspace_id: workspaceId, from_email: emailData.from, to_email: emailData.to, subject: emailData.subject };
  }

  async replyToEmail(params: {
    originalMessageId: string;
    toAddress: string;
    fromAddress: string;
    subject: string;
    body: string;
    workspaceId: string;
  }): Promise<void> {
    try {
      await NotificationDeliveryService.sendEmailReply({
        fromAddress: params.fromAddress,
        toAddress: params.toAddress,
        subject: params.subject,
        html: params.body,
        originalMessageId: params.originalMessageId,
      });
      log.info(`Trinity replied to ${params.toAddress} from ${params.fromAddress}`);
    } catch (err: any) {
      log.warn('[TrinityEmailProcessor] replyToEmail via NDS failed:', err?.message);
    }
  }

  private async handleCareersEmail(email: any, workspace: any, sender: any): Promise<void> {
    log.info(`[careers] New career inquiry from ${email.from_email} to ${workspace.company_name}`);
    try {
      await pool.query(
        `INSERT INTO inbound_email_log
         (workspace_id, category, from_email, to_email, subject, message_id, processing_status)
         VALUES ($1, 'careers', $2, $3, $4, $5, 'received')
         ON CONFLICT (message_id) DO NOTHING`,
        [workspace.id, email.from_email, email.to_email, email.subject, email.message_id]
      );
    } catch (err) {
      log.warn('[trinityEmailProcessor] Careers email log insert failed:', err);
    }
  }

  private async handleVerificationEmail(email: any, workspace: any, _sender: any): Promise<void> {
    log.info(`[verify] Employment verification request from ${email.from_email} to ${workspace.company_name}`);
    await this._delegateToFullPipeline(email);
  }

  private async handleSupportEmail(email: any, workspace: any, _sender: any): Promise<void> {
    log.info(`[support] Support request from ${email.from_email} to ${workspace.company_name}`);
    await this._delegateToFullPipeline(email);
  }

  private async handleCalloffEmail(email: any, workspace: any, sender: any): Promise<void> {
    log.info(`[calloffs] Calloff email from ${email.from_email} to ${workspace.company_name}`);
    await this._delegateToFullPipeline(email);
  }

  private async handleTrinityDirectEmail(email: any, workspace: any, sender: any): Promise<void> {
    log.info(`[trinity-direct] Direct Trinity message from ${email.from_email} to ${workspace.company_name}`);
    await this._delegateToFullPipeline(email);
  }

  private async handleMainInboxEmail(email: any, workspace: any, sender: any): Promise<void> {
    log.info(`[main] Main inbox email from ${email.from_email} to ${workspace.company_name}`);
    await this._delegateToFullPipeline(email);
  }

  /**
   * Converts the legacy stored-email shape to ParsedInboundEmail and delegates
   * to the full Trinity inbound pipeline (trinityInboundEmailProcessor.ts).
   * This ensures all stub handlers produce real DB records and acknowledgments.
   */
  private async _delegateToFullPipeline(email: any): Promise<void> {
    try {
      const parsed: ParsedInboundEmail = {
        messageId: email.message_id || undefined,
        fromEmail: email.from_email || '',
        fromName: email.from_name || undefined,
        toEmail: email.to_email || '',
        subject: email.subject || undefined,
        bodyText: email.body_text || undefined,
        bodyHtml: email.body_html || undefined,
        attachments: [],
        receivedAt: email.received_at ? new Date(email.received_at) : new Date(),
        rawPayload: {},
      };
      await processInboundEmail(parsed);
    } catch (err: any) {
      log.warn('[trinityEmailProcessor] _delegateToFullPipeline failed (non-fatal):', err?.message);
    }
  }

  async processFormSubmission(
    submission: any,
    submitAction: string | null,
    contextType: string | null,
    contextId: string | null
  ): Promise<void> {
    log.info(`Processing form submission action=${submitAction} context=${contextType}/${contextId}`);
    const data = submission.data || {};

    if (submitAction === 'create_candidate' && data.email) {
      try {
        await pool.query(
          `INSERT INTO interview_candidates
           (workspace_id, full_name, email, phone, position_applied, stage, source, created_at)
           VALUES ($1, $2, $3, $4, $5, 'applied', 'job_application_form', NOW())
           ON CONFLICT (workspace_id, email) DO NOTHING`,
          [
            submission.workspace_id,
            data.full_name || 'Unknown',
            data.email,
            data.phone || null,
            data.position || 'Security Officer',
          ]
        );
      } catch (e: any) {
        log.warn('create_candidate insert failed:', e.message);
      }
    }

    if (submitAction === 'complete_onboarding_task' && contextId) {
      try {
        await pool.query(
          `UPDATE onboarding_tasks SET status = 'completed', completed_at = NOW()
           WHERE id = $1`,
          [contextId]
        );
      } catch (err) {
        log.warn('[trinityEmailProcessor] complete_onboarding_task update failed:', err);
      }
    }

    try {
      await pool.query(
        `UPDATE form_submissions SET processed_at = NOW(), processed_by = 'trinity_auto', trinity_action_taken = $1
         WHERE id = $2`,
        [submitAction, submission.id]
      );
    } catch (err) {
      log.warn('[trinityEmailProcessor] form_submissions update failed:', err);
    }
  }
}

export const trinityEmailProcessor = TrinityEmailProcessor.getInstance();
