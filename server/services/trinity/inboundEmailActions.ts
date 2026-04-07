/**
 * TRINITY INBOUND EMAIL ACTIONS
 * Phase 13 — Inbound Email Routing and Trinity Auto-Processing
 *
 * Registers 6 Trinity actions for the inbound email pipeline:
 *   inbound.calloff.process
 *   inbound.incident.process
 *   inbound.docs.process
 *   inbound.support.process
 *   inbound.email.query
 *   inbound.email.reprocess
 *
 * All actions respect the requesting user's role and workspace context.
 */

import { helpaiOrchestrator } from '../helpai/platformActionHub';
import { db } from '../../db';
import { inboundEmailLog } from '@shared/schema';
import { eq, and, desc, sql } from 'drizzle-orm';
import {
  processInboundEmail,
  reprocessInboundEmail,
} from './trinityInboundEmailProcessor';
import { createLogger } from '../../lib/logger';
const log = createLogger('inboundEmailActions');


export function registerInboundEmailActions(): void {
  // ── 1. inbound.calloff.process ─────────────────────────────────────────────
  helpaiOrchestrator.registerAction({
    actionId: 'inbound.calloff.process',
    name: 'Inbound Calloff Process',
    category: 'scheduling',
    description: 'Process an inbound calloff email payload through the calloff pipeline',
    requiredRoles: ['manager', 'owner', 'root_admin'],
    handler: async (req) => {
      const start = Date.now();
      const { fromEmail, fromName, subject, bodyText, messageId } = req.payload || {};
      if (!fromEmail) return { success: false, actionId: 'inbound.calloff.process', message: 'fromEmail is required', executionTimeMs: Date.now() - start };
      const toEmail = `calloffs@${process.env.INBOUND_EMAIL_DOMAIN || 'coaileague.com'}`;
      const result = await processInboundEmail({ messageId, fromEmail, fromName, toEmail, subject, bodyText });
      return { success: true, actionId: 'inbound.calloff.process', message: 'Calloff email processed', data: { result }, executionTimeMs: Date.now() - start };
    },
  });

  // ── 2. inbound.incident.process ────────────────────────────────────────────
  helpaiOrchestrator.registerAction({
    actionId: 'inbound.incident.process',
    name: 'Inbound Incident Process',
    category: 'compliance',
    description: 'Process an inbound incident report email payload',
    requiredRoles: ['manager', 'owner', 'root_admin'],
    handler: async (req) => {
      const start = Date.now();
      const { fromEmail, fromName, subject, bodyText, messageId } = req.payload || {};
      if (!fromEmail) return { success: false, actionId: 'inbound.incident.process', message: 'fromEmail is required', executionTimeMs: Date.now() - start };
      const toEmail = `incidents@${process.env.INBOUND_EMAIL_DOMAIN || 'coaileague.com'}`;
      const result = await processInboundEmail({ messageId, fromEmail, fromName, toEmail, subject, bodyText });
      return { success: true, actionId: 'inbound.incident.process', message: 'Incident email processed', data: { result }, executionTimeMs: Date.now() - start };
    },
  });

  // ── 3. inbound.docs.process ────────────────────────────────────────────────
  helpaiOrchestrator.registerAction({
    actionId: 'inbound.docs.process',
    name: 'Inbound Docs Process',
    category: 'compliance',
    description: 'Process an inbound document email payload',
    requiredRoles: ['manager', 'owner', 'root_admin'],
    handler: async (req) => {
      const start = Date.now();
      const { fromEmail, fromName, subject, bodyText, messageId } = req.payload || {};
      if (!fromEmail) return { success: false, actionId: 'inbound.docs.process', message: 'fromEmail is required', executionTimeMs: Date.now() - start };
      const toEmail = `docs@${process.env.INBOUND_EMAIL_DOMAIN || 'coaileague.com'}`;
      const result = await processInboundEmail({ messageId, fromEmail, fromName, toEmail, subject, bodyText });
      return { success: true, actionId: 'inbound.docs.process', message: 'Document email processed', data: { result }, executionTimeMs: Date.now() - start };
    },
  });

  // ── 4. inbound.support.process ─────────────────────────────────────────────
  helpaiOrchestrator.registerAction({
    actionId: 'inbound.support.process',
    name: 'Inbound Support Process',
    category: 'helpdesk',
    description: 'Process an inbound support email payload',
    requiredRoles: ['employee', 'manager', 'owner', 'root_admin'],
    handler: async (req) => {
      const start = Date.now();
      const { fromEmail, fromName, subject, bodyText, messageId } = req.payload || {};
      if (!fromEmail) return { success: false, actionId: 'inbound.support.process', message: 'fromEmail is required', executionTimeMs: Date.now() - start };
      const toEmail = `support@${process.env.INBOUND_EMAIL_DOMAIN || 'coaileague.com'}`;
      const result = await processInboundEmail({ messageId, fromEmail, fromName, toEmail, subject, bodyText });
      return { success: true, actionId: 'inbound.support.process', message: 'Support email processed', data: { result }, executionTimeMs: Date.now() - start };
    },
  });

  // ── 5. inbound.email.query ─────────────────────────────────────────────────
  helpaiOrchestrator.registerAction({
    actionId: 'inbound.email.query',
    name: 'Inbound Email Query',
    category: 'audit',
    description: 'Query the inbound_email_log for recent emails by category, sender, or status',
    requiredRoles: ['manager', 'owner', 'root_admin'],
    handler: async (req) => {
      const start = Date.now();
      const {
        workspaceId,
        category,
        processingStatus,
        fromEmail,
        needsReview,
        limit = 20,
      } = req.payload || {};

      if (!workspaceId) return { success: false, actionId: 'inbound.email.query', message: 'workspaceId is required', executionTimeMs: Date.now() - start };

      const conditions = [eq(inboundEmailLog.workspaceId, workspaceId)];
      if (category) conditions.push(eq(inboundEmailLog.category, category));
      if (processingStatus) conditions.push(eq(inboundEmailLog.processingStatus, processingStatus));
      if (fromEmail) conditions.push(eq(inboundEmailLog.fromEmail, fromEmail));
      if (needsReview !== undefined) conditions.push(eq(inboundEmailLog.needsReview, needsReview === true || needsReview === 'true'));

      const rows = await db.select({
        id: inboundEmailLog.id,
        fromEmail: inboundEmailLog.fromEmail,
        toEmail: inboundEmailLog.toEmail,
        subject: inboundEmailLog.subject,
        category: inboundEmailLog.category,
        processingStatus: inboundEmailLog.processingStatus,
        needsReview: inboundEmailLog.needsReview,
        reviewReason: inboundEmailLog.reviewReason,
        downstreamRecordType: inboundEmailLog.downstreamRecordType,
        downstreamRecordId: inboundEmailLog.downstreamRecordId,
        receivedAt: inboundEmailLog.receivedAt,
        processedAt: inboundEmailLog.processedAt,
      })
        .from(inboundEmailLog)
        .where(and(...conditions))
        .orderBy(desc(inboundEmailLog.receivedAt))
        .limit(Math.min(Number(limit), 100));

      return { success: true, actionId: 'inbound.email.query', message: `Found ${rows.length} email(s)`, data: { emails: rows, count: rows.length }, executionTimeMs: Date.now() - start };
    },
  });

  // ── 6. inbound.email.reprocess ─────────────────────────────────────────────
  helpaiOrchestrator.registerAction({
    actionId: 'inbound.email.reprocess',
    name: 'Inbound Email Reprocess',
    category: 'audit',
    description: 'Manually trigger reprocessing of a flagged inbound email by its log ID',
    requiredRoles: ['manager', 'owner', 'root_admin'],
    handler: async (req) => {
      const start = Date.now();
      const { logId } = req.payload || {};
      if (!logId) return { success: false, actionId: 'inbound.email.reprocess', message: 'logId is required', executionTimeMs: Date.now() - start };
      const result = await reprocessInboundEmail(logId);
      return { success: true, actionId: 'inbound.email.reprocess', message: 'Email queued for reprocessing', data: { result }, executionTimeMs: Date.now() - start };
    },
  });

  log.info('[InboundEmailActions] Registered 6 Trinity inbound email actions');
}
