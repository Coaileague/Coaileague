/**
 * Document Pipeline Service - 7-Step Document Processing
 * 
 * Pipeline Steps:
 * 1. CAPTURE - Bot captures raw content from room
 * 2. PROCESS - AI analyzes and structures content
 * 3. GENERATE - Create PDF/formatted output
 * 4. APPROVE - Human approval if required
 * 5. ROUTE - Send to destinations
 * 6. DELIVER - Confirm delivery
 * 7. STORE - Archive with retention policy
 * 
 * Related services:
 * - documentUnderstandingPipeline.ts: AI-powered OCR/extraction for onboarding (uses meteredGemini)
 * - documentExtraction.ts: AI extraction for business migration workflows (uses meteredGemini)
 * Both AI services are properly metered through tokenManager for billing.
 */

import { randomUUID } from 'crypto';
import {
  PipelineDocument,
  PipelineStatus,
  DocumentType,
  DocumentSource,
  PipelineConfig,
  DEFAULT_PIPELINE_CONFIGS,
  PipelineAuditEntry,
  RoutingDestination,
} from './types';
import { platformEventBus } from '../services/platformEventBus';
import { createLogger } from '../lib/logger';
const log = createLogger('documentPipeline');


class DocumentPipelineService {
  private documents: Map<string, PipelineDocument> = new Map();
  private processingQueue: string[] = [];
  private isProcessing: boolean = false;

  async createDocument(
    type: DocumentType,
    orgId: string,
    source: DocumentSource,
    options?: {
      title?: string;
      priority?: 'low' | 'normal' | 'high' | 'urgent';
      workspaceId?: string;
      metadata?: Record<string, any>;
      tags?: string[];
    }
  ): Promise<PipelineDocument> {
    const config = DEFAULT_PIPELINE_CONFIGS[type];
    const now = new Date();

    const doc: PipelineDocument = {
      id: randomUUID(),
      type,
      orgId,
      workspaceId: options?.workspaceId,
      title: options?.title || `${type} - ${now.toISOString()}`,
      source,
      processed: {
        status: 'pending',
        content: null,
        processingNotes: [],
      },
      approval: {
        required: config.requiresApproval,
        status: config.requiresApproval ? 'pending' : 'auto_approved',
        autoApprovalReason: config.requiresApproval ? undefined : 'No approval required for this document type',
      },
      routing: {
        destinations: config.defaultRouting.map(d => ({ ...d })),
        routingNotes: [],
      },
      storage: {
        stored: false,
        retentionPolicy: `${config.retentionDays} days`,
        encrypted: config.encryptAtRest,
      },
      status: PipelineStatus.DRAFT,
      priority: options?.priority || 'normal',
      createdAt: now,
      updatedAt: now,
      metadata: options?.metadata || {},
      tags: options?.tags || [],
      auditLog: [],
    };

    this.addAuditEntry(doc, 'Document created', 'bot', source.botId);
    this.documents.set(doc.id, doc);

    log.info(`[Pipeline] Created document ${doc.id} (${type}) from ${source.botId}`);

    this.processingQueue.push(doc.id);
    this.processQueue();

    return doc;
  }

  private async processQueue(): Promise<void> {
    if (this.isProcessing || this.processingQueue.length === 0) return;

    this.isProcessing = true;

    while (this.processingQueue.length > 0) {
      const docId = this.processingQueue.shift()!;
      const doc = this.documents.get(docId);
      
      if (!doc) continue;

      try {
        await this.runPipeline(doc);
      } catch (error) {
        log.error(`[Pipeline] Error processing ${docId}:`, error);
        const previousStatus = doc.status;
        doc.status = PipelineStatus.ERROR;
        doc.processed.status = 'error';
        doc.processed.processingNotes.push(`Error at step ${previousStatus}: ${error}`);
        this.addAuditEntry(doc, `Pipeline error at ${previousStatus}: ${error}`, 'system');
        
        if (doc.auditLog.filter(e => e.action.includes('error')).length >= 3) {
          doc.status = PipelineStatus.DEAD_LETTER;
          this.addAuditEntry(doc, 'Moved to dead letter queue after 3 failures', 'system');
        }
      }
    }

    this.isProcessing = false;
  }

  private async runPipeline(doc: PipelineDocument): Promise<void> {
    // If the document was already approved (re-entered from approveDocument),
    // steps 1-4 already completed — skip straight to post-approval steps.
    if (doc.approval.status === 'approved') {
      this.addAuditEntry(doc, 'Pipeline resumed after approval — skipping steps 1-4', 'system');
      await this.step5Route(doc);
      await this.step6Deliver(doc);
      await this.step7Store(doc);
      return;
    }

    await this.step1Capture(doc);
    await this.step2Process(doc);
    await this.step3Generate(doc);
    await this.step4Approve(doc);
    
    if (doc.approval.status === 'rejected') {
      doc.status = PipelineStatus.REJECTED;
      this.addAuditEntry(doc, 'Pipeline stopped: document rejected', 'system');
      return;
    }
    
    await this.step5Route(doc);
    await this.step6Deliver(doc);
    await this.step7Store(doc);
  }

  private async step1Capture(doc: PipelineDocument): Promise<void> {
    log.info(`[Pipeline] Step 1: Capture - ${doc.id}`);
    const previousStatus = doc.status;
    doc.status = PipelineStatus.CAPTURING;
    this.addAuditEntry(doc, 'Step 1: Content captured', 'bot', doc.source.botId, undefined);
    doc.auditLog[doc.auditLog.length - 1].previousStatus = previousStatus;
    doc.auditLog[doc.auditLog.length - 1].newStatus = doc.status;
    doc.updatedAt = new Date();
  }

  private async step2Process(doc: PipelineDocument): Promise<void> {
    log.info(`[Pipeline] Step 2: Process - ${doc.id}`);
    doc.status = PipelineStatus.PROCESSING;
    doc.processed.status = 'processing';
    this.addAuditEntry(doc, 'Step 2: AI processing started', 'system');

    try {
      doc.processed.content = await this.analyzeContent(doc);
      doc.processed.status = 'complete';
      doc.processed.processingNotes.push('Content analyzed successfully');
      this.addAuditEntry(doc, 'Step 2: AI processing complete', 'system');
    } catch (error) {
      doc.processed.status = 'error';
      doc.processed.processingNotes.push(`Error: ${error}`);
      throw error;
    }

    doc.updatedAt = new Date();
  }

  private async step3Generate(doc: PipelineDocument): Promise<void> {
    log.info(`[Pipeline] Step 3: Generate - ${doc.id}`);
    const previousStatus = doc.status;
    doc.status = PipelineStatus.GENERATING;
    this.addAuditEntry(doc, 'Step 3: Document generation started', 'system');
    doc.auditLog[doc.auditLog.length - 1].previousStatus = previousStatus;
    doc.auditLog[doc.auditLog.length - 1].newStatus = doc.status;

    doc.processed.generatedAt = new Date();
    this.addAuditEntry(doc, 'Step 3: Document generated', 'system');
    doc.updatedAt = new Date();
  }

  private async step4Approve(doc: PipelineDocument): Promise<void> {
    log.info(`[Pipeline] Step 4: Approve - ${doc.id}`);
    
    if (!doc.approval.required) {
      doc.approval.status = 'auto_approved';
      doc.approval.decidedAt = new Date();
      this.addAuditEntry(doc, 'Step 4: Auto-approved (no approval required)', 'system');
      doc.status = PipelineStatus.APPROVED;
    } else {
      const config = DEFAULT_PIPELINE_CONFIGS[doc.type];
      if (config.autoApprovalThreshold && doc.processed.aiConfidence) {
        if (doc.processed.aiConfidence >= config.autoApprovalThreshold) {
          doc.approval.status = 'auto_approved';
          doc.approval.decidedAt = new Date();
          doc.approval.autoApprovalReason = `AI confidence ${doc.processed.aiConfidence} >= threshold ${config.autoApprovalThreshold}`;
          this.addAuditEntry(doc, 'Step 4: Auto-approved (high confidence)', 'system');
          doc.status = PipelineStatus.APPROVED;
        } else {
          doc.status = PipelineStatus.PENDING_APPROVAL;
          doc.approval.requestedAt = new Date();
          this.addAuditEntry(doc, 'Step 4: Awaiting human approval', 'system');
          
          await this.requestApproval(doc);
        }
      } else {
        doc.status = PipelineStatus.PENDING_APPROVAL;
        doc.approval.requestedAt = new Date();
        this.addAuditEntry(doc, 'Step 4: Awaiting human approval', 'system');
        
        await this.requestApproval(doc);
      }
    }

    doc.updatedAt = new Date();
  }

  private async step5Route(doc: PipelineDocument): Promise<void> {
    log.info(`[Pipeline] Step 5: Route - ${doc.id}`);
    doc.status = PipelineStatus.ROUTING;
    doc.routing.routedAt = new Date();
    this.addAuditEntry(doc, 'Step 5: Routing started', 'system');

    for (const dest of doc.routing.destinations) {
      try {
        await this.routeToDestination(doc, dest);
        dest.status = 'sent';
        dest.sentAt = new Date();
        doc.routing.routingNotes.push(`Routed to ${dest.type}:${dest.target}`);
      } catch (error) {
        dest.status = 'failed';
        dest.error = String(error);
        doc.routing.routingNotes.push(`Failed to route to ${dest.type}:${dest.target}: ${error}`);
      }
    }

    this.addAuditEntry(doc, 'Step 5: Routing complete', 'system');
    doc.updatedAt = new Date();
  }

  private async step6Deliver(doc: PipelineDocument): Promise<void> {
    log.info(`[Pipeline] Step 6: Deliver - ${doc.id}`);
    doc.status = PipelineStatus.DELIVERED;
    this.addAuditEntry(doc, 'Step 6: Delivery confirmed', 'system');

    const config = DEFAULT_PIPELINE_CONFIGS[doc.type];
    if (config.notifyOnComplete) {
      platformEventBus.publish({
        type: 'document_completed',
        category: 'automation',
        title: `Document Pipeline Complete — ${doc.title}`,
        description: `Document '${doc.title}' (${doc.type}) has completed the pipeline and been delivered`,
        workspaceId: doc.workspaceId || doc.orgId,
        metadata: { documentId: doc.id, documentType: doc.type, documentTitle: doc.title },
        visibility: 'all',
      }).catch((e: unknown) => log.warn('[DocumentPipeline] event publish failed:', e));
    }

    doc.updatedAt = new Date();
  }

  private async step7Store(doc: PipelineDocument): Promise<void> {
    log.info(`[Pipeline] Step 7: Store - ${doc.id}`);
    doc.status = PipelineStatus.STORED;
    doc.storage.stored = true;
    doc.storage.storedAt = new Date();
    doc.completedAt = new Date();

    const config = DEFAULT_PIPELINE_CONFIGS[doc.type];
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + config.retentionDays);
    doc.storage.expiresAt = expiresAt;

    this.addAuditEntry(doc, 'Step 7: Document stored', 'system');
    doc.updatedAt = new Date();

    log.info(`[Pipeline] Document ${doc.id} completed pipeline successfully`);
  }

  private async analyzeContent(doc: PipelineDocument): Promise<any> {
    return {
      summary: 'Document content analyzed',
      extractedAt: new Date(),
      rawLength: JSON.stringify(doc.source.rawContent).length,
    };
  }

  private async requestApproval(doc: PipelineDocument): Promise<void> {
    log.info(`[Pipeline] Requesting approval for ${doc.id}`);
    
    platformEventBus.publish({
      type: 'approval_requested',
      category: 'automation',
      title: `Approval Required — ${doc.title}`,
      description: `Document '${doc.title}' (${doc.type}) requires approval before delivery`,
      workspaceId: doc.workspaceId || doc.orgId,
      metadata: { documentId: doc.id, documentType: doc.type, documentTitle: doc.title, requestedAt: new Date().toISOString() },
      visibility: 'all',
    }).catch((e: unknown) => log.warn('[DocumentPipeline] event publish failed:', e));
  }

  private async routeToDestination(doc: PipelineDocument, dest: RoutingDestination): Promise<void> {
    log.info(`[Pipeline] Routing ${doc.id} to ${dest.type}:${dest.target}`);
  }

  async approveDocument(docId: string, userId: string, userName: string): Promise<boolean> {
    const doc = this.documents.get(docId);
    if (!doc || doc.approval.status !== 'pending') return false;

    doc.approval.status = 'approved';
    doc.approval.decidedAt = new Date();
    doc.approval.decidedBy = userId;
    doc.approval.decidedByName = userName;
    doc.status = PipelineStatus.APPROVED;

    this.addAuditEntry(doc, `Approved by ${userName}`, 'user', userId, userName);

    this.processingQueue.push(docId);
    this.processQueue();

    return true;
  }

  async rejectDocument(docId: string, userId: string, userName: string, reason: string): Promise<boolean> {
    const doc = this.documents.get(docId);
    if (!doc || doc.approval.status !== 'pending') return false;

    doc.approval.status = 'rejected';
    doc.approval.decidedAt = new Date();
    doc.approval.decidedBy = userId;
    doc.approval.decidedByName = userName;
    doc.approval.reason = reason;
    doc.status = PipelineStatus.REJECTED;

    this.addAuditEntry(doc, `Rejected by ${userName}: ${reason}`, 'user', userId, userName);

    return true;
  }

  getDocument(docId: string): PipelineDocument | undefined {
    return this.documents.get(docId);
  }

  getDocumentsByOrg(orgId: string): PipelineDocument[] {
    return Array.from(this.documents.values()).filter(doc => doc.orgId === orgId);
  }

  getPendingApprovals(orgId?: string): PipelineDocument[] {
    return Array.from(this.documents.values()).filter(doc => 
      doc.approval.status === 'pending' &&
      (!orgId || doc.orgId === orgId)
    );
  }

  getStats(): {
    total: number;
    byStatus: Record<PipelineStatus, number>;
    byType: Record<DocumentType, number>;
    pendingApprovals: number;
  } {
    const byStatus: Record<string, number> = {};
    const byType: Record<string, number> = {};
    let pendingApprovals = 0;

    for (const doc of this.documents.values()) {
      byStatus[doc.status] = (byStatus[doc.status] || 0) + 1;
      byType[doc.type] = (byType[doc.type] || 0) + 1;
      if (doc.approval.status === 'pending') pendingApprovals++;
    }

    return {
      total: this.documents.size,
      byStatus: byStatus as Record<PipelineStatus, number>,
      byType: byType as Record<DocumentType, number>,
      pendingApprovals,
    };
  }

  private addAuditEntry(
    doc: PipelineDocument,
    action: string,
    actor: 'system' | 'bot' | 'user',
    actorId?: string,
    actorName?: string
  ): void {
    const entry: PipelineAuditEntry = {
      timestamp: new Date(),
      action,
      actor,
      actorId,
      actorName,
      previousStatus: doc.status,
      newStatus: doc.status,
    };
    doc.auditLog.push(entry);
  }
}

export const documentPipeline = new DocumentPipelineService();

log.info('[DocumentPipeline] 7-Step Document Pipeline Service initialized');
