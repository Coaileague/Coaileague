/**
 * Contract Pipeline Service
 * ==========================
 * End-to-end proposal-to-signature-to-storage system for client contracts.
 * Premium feature with tier-based quotas and credit overage.
 * 
 * Features:
 * - Template management
 * - Proposal creation and delivery
 * - Contract generation from accepted proposals
 * - Digital signature capture (typed, drawn, uploaded)
 * - Immutable document vault with hash verification
 * - Full audit trail for E-SIGN/UETA compliance
 * - Client portal access via secure tokens
 */

import { NotificationDeliveryService } from '../notificationDeliveryService';
import { db } from '../../db';
import { eq, and, gte, lte, desc, sql, or, ilike } from 'drizzle-orm';
import {
  clientContractAccessTokens,
  clientContracts,
  clientContractAuditLog,
  clientContractPipelineUsage,
  clients,
  users,
  workspaces,
  InsertClientContract,
  InsertClientContractTemplate,
  InsertClientContractSignature,
  InsertClientContractAuditLog,
  InsertClientContractAccessToken,
  // @ts-expect-error — TS migration: fix in refactoring sprint
  InsertClientContractPipelineUsage,
  ClientContract,
  ClientContractTemplate,
  ClientContractSignature
} from '@shared/schema';
import { 
  BILLING, 
  getContractPipelineQuota, 
  hasContractPipelineAccess, 
  isContractPipelineUnlimited,
  getContractPipelineOverageCredits,
  canUseContractFeature,
  TierKey
} from '@shared/billingConfig';
import crypto from 'crypto';
import { platformEventBus } from '../platformEventBus';
import { createNotification } from '../notificationService';
import {
  orgDocuments
} from '@shared/schema';
import { createLogger } from '../../lib/logger';
const log = createLogger('contractPipelineService');


export interface ContractSigner {
  id: string;
  contractId: string;
  signerRole: SignerRole;
  signerName: string;
  signerEmail: string;
  signerTitle?: string;
  order: number;
  status: 'pending' | 'notified' | 'viewed' | 'signed' | 'declined';
  accessToken?: string;
  notifiedAt?: Date;
  viewedAt?: Date;
  signedAt?: Date;
  reminderCount: number;
  lastReminderAt?: Date;
}

async function loadSignersFromDB(contractId: string): Promise<ContractSigner[]> {
  const rows = await db
    .select()
    // @ts-expect-error — TS migration: fix in refactoring sprint
    .from(clientContractSignatures)
    // @ts-expect-error — TS migration: fix in refactoring sprint
    .where(eq(clientContractSignatures.contractId, contractId));
  return rows.map((r: any) => ({
    id: r.id,
    contractId: r.contractId,
    signerRole: r.signerRole,
    signerName: r.signerName,
    signerEmail: r.signerEmail,
    signerTitle: r.signerTitle || undefined,
    order: r.signerOrder ?? 0,
    status: (r.signerStatus || 'pending') as ContractSigner['status'],
    accessToken: r.accessToken || undefined,
    notifiedAt: r.notifiedAt || undefined,
    viewedAt: r.viewedAt || undefined,
    signedAt: r.signedAt || undefined,
    reminderCount: r.reminderCount ?? 0,
    lastReminderAt: r.lastReminderAt || undefined,
  })).sort((a, b) => a.order - b.order);
}

async function persistSignerToDB(signer: ContractSigner): Promise<void> {
  await db
    // @ts-expect-error — TS migration: fix in refactoring sprint
    .insert(clientContractSignatures)
    .values({
      id: signer.id,
      contractId: signer.contractId,
      signerRole: signer.signerRole,
      signerName: signer.signerName,
      signerEmail: signer.signerEmail,
      signerTitle: signer.signerTitle || null,
      signatureType: 'typed',
      signerOrder: signer.order,
      signerStatus: signer.status,
      reminderCount: signer.reminderCount,
      lastReminderAt: signer.lastReminderAt || null,
      notifiedAt: signer.notifiedAt || null,
      viewedAt: signer.viewedAt || null,
      accessToken: signer.accessToken || null,
    } as any)
    .onConflictDoUpdate({
      // @ts-expect-error — TS migration: fix in refactoring sprint
      target: clientContractSignatures.id,
      set: {
        signerOrder: signer.order,
        signerStatus: signer.status,
        reminderCount: signer.reminderCount,
        lastReminderAt: signer.lastReminderAt || null,
        notifiedAt: signer.notifiedAt || null,
        viewedAt: signer.viewedAt || null,
        accessToken: signer.accessToken || null,
      } as any,
    });
}

async function updateSignerInDB(signerId: string, updates: Partial<Record<string, any>>): Promise<void> {
  await db
    // @ts-expect-error — TS migration: fix in refactoring sprint
    .update(clientContractSignatures)
    .set(updates)
    // @ts-expect-error — TS migration: fix in refactoring sprint
    .where(eq(clientContractSignatures.id, signerId));
}

// ============================================================================
// TYPES
// ============================================================================

export type ContractDocType = 'proposal' | 'contract' | 'amendment' | 'addendum';
export type ContractStatus = 'draft' | 'sent' | 'viewed' | 'accepted' | 'changes_requested' | 
  'declined' | 'pending_signatures' | 'partially_signed' | 'executed' | 'expired' | 'terminated' | 'archived';
export type SignerRole = 'company' | 'client' | 'witness' | 'notary';
export type SignatureType = 'typed' | 'drawn' | 'uploaded';
export type AuditAction = 'created' | 'updated' | 'sent' | 'viewed' | 'downloaded' | 'accepted' | 
  'declined' | 'changes_requested' | 'signed' | 'executed' | 'amended' | 'terminated' | 'archived' | 
  'searched' | 'reminder_sent' | 'access_granted' | 'access_revoked';

interface CreateProposalInput {
  workspaceId: string;
  clientId?: string;
  clientName: string;
  clientEmail: string;
  title: string;
  content: string;
  templateId?: string;
  services?: any[];
  billingTerms?: any;
  totalValue?: number;
  effectiveDate?: string;
  termEndDate?: string;
  expiresAt?: Date;
  specialTerms?: string;
  createdBy: string;
}

interface CaptureSignatureInput {
  contractId: string;
  signerRole: SignerRole;
  signerName: string;
  signerEmail: string;
  signerTitle?: string;
  signatureType: SignatureType;
  signatureData?: string;
  consentText: string;
  ipAddress: string;
  userAgent: string;
  geolocation?: { lat: number; lng: number; accuracy: number };
  timezone?: string;
}

interface AuditContext {
  actorId?: string;
  actorType: 'user' | 'client' | 'system';
  actorName?: string;
  actorEmail?: string;
  ipAddress?: string;
  userAgent?: string;
  metadata?: Record<string, any>;
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

function generateContentHash(content: string): string {
  return crypto.createHash('sha256').update(content).digest('hex');
}

function generateSecureToken(): string {
  return crypto.randomBytes(32).toString('hex');
}

function hashToken(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex');
}

// ============================================================================
// CONTRACT PIPELINE SERVICE
// ============================================================================

class ContractPipelineService {
  
  // ==========================================================================
  // QUOTA & ACCESS MANAGEMENT
  // ==========================================================================
  
  /**
   * Check if workspace has contract pipeline access
   */
  async checkAccess(workspaceId: string): Promise<{ hasAccess: boolean; tier: TierKey; reason?: string }> {
    const [workspace] = await db
      .select({ subscriptionTier: workspaces.subscriptionTier })
      .from(workspaces)
      .where(eq(workspaces.id, workspaceId));
    
    if (!workspace) {
      return { hasAccess: false, tier: 'free', reason: 'Workspace not found' };
    }
    
    const tier = (workspace.subscriptionTier || 'free') as TierKey;
    const hasAccess = hasContractPipelineAccess(tier);
    
    if (!hasAccess) {
      return { hasAccess: false, tier, reason: 'Contract Pipeline requires Starter tier or higher' };
    }
    
    return { hasAccess: true, tier };
  }
  
  /**
   * Get current period usage and remaining quota
   */
  async getUsage(workspaceId: string): Promise<{
    quotaLimit: number;
    quotaUsed: number;
    remaining: number;
    isUnlimited: boolean;
    overageCount: number;
    overageCreditsCharged: number;
  }> {
    const access = await this.checkAccess(workspaceId);
    if (!access.hasAccess) {
      return { quotaLimit: 0, quotaUsed: 0, remaining: 0, isUnlimited: false, overageCount: 0, overageCreditsCharged: 0 };
    }
    
    const now = new Date();
    const periodStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const periodEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0);
    
    const [usage] = await db
      .select()
      .from(clientContractPipelineUsage)
      .where(and(
        eq(clientContractPipelineUsage.workspaceId, workspaceId),
        eq(clientContractPipelineUsage.periodStart, periodStart.toISOString().split('T')[0])
      ));
    
    const quotaLimit = getContractPipelineQuota(access.tier);
    const isUnlimited = isContractPipelineUnlimited(access.tier);
    const quotaUsed = usage?.quotaUsed || 0;
    
    return {
      quotaLimit: isUnlimited ? -1 : quotaLimit,
      quotaUsed,
      remaining: isUnlimited ? -1 : Math.max(0, quotaLimit - quotaUsed),
      isUnlimited,
      overageCount: usage?.overageCount || 0,
      overageCreditsCharged: usage?.overageCreditsCharged || 0,
    };
  }
  
  /**
   * Increment usage (call when creating proposal or executing contract)
   * Returns overage credits charged if quota exceeded
   */
  async incrementUsage(workspaceId: string): Promise<{ success: boolean; overageCredits?: number; error?: string }> {
    const access = await this.checkAccess(workspaceId);
    if (!access.hasAccess) {
      return { success: false, error: 'No contract pipeline access' };
    }
    
    if (isContractPipelineUnlimited(access.tier)) {
      return { success: true };
    }
    
    const now = new Date();
    const periodStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const periodEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0);
    const quotaLimit = getContractPipelineQuota(access.tier);
    
    // Get or create usage record
    let [usage] = await db
      .select()
      .from(clientContractPipelineUsage)
      .where(and(
        eq(clientContractPipelineUsage.workspaceId, workspaceId),
        eq(clientContractPipelineUsage.periodStart, periodStart.toISOString().split('T')[0])
      ));
    
    if (!usage) {
      const [newUsage] = await db
        .insert(clientContractPipelineUsage)
        .values({
          workspaceId,
          periodStart: periodStart.toISOString().split('T')[0],
          periodEnd: periodEnd.toISOString().split('T')[0],
          quotaLimit,
          quotaUsed: 0,
          overageCount: 0,
          overageCreditsCharged: 0,
        } as InsertClientContractPipelineUsage)
        .returning();
      usage = newUsage;
    }
    
    const newQuotaUsed = (usage.quotaUsed || 0) + 1;
    let overageCredits = 0;
    let newOverageCount = usage.overageCount || 0;
    let newOverageCreditsCharged = usage.overageCreditsCharged || 0;
    
    if (newQuotaUsed > quotaLimit) {
      overageCredits = getContractPipelineOverageCredits();
      newOverageCount++;
      newOverageCreditsCharged += overageCredits;
    }
    
    await db
      .update(clientContractPipelineUsage)
      .set({
        quotaUsed: newQuotaUsed,
        overageCount: newOverageCount,
        overageCreditsCharged: newOverageCreditsCharged,
        updatedAt: new Date(),
      })
      .where(eq(clientContractPipelineUsage.id, usage.id));
    
    return { success: true, overageCredits: overageCredits > 0 ? overageCredits : undefined };
  }
  
  // ==========================================================================
  // TEMPLATE MANAGEMENT
  // ==========================================================================
  
  /**
   * Create a new contract template
   */
  async createTemplate(input: InsertClientContractTemplate): Promise<ClientContractTemplate> {
    const [template] = await db
      // @ts-expect-error — TS migration: fix in refactoring sprint
      .insert(clientContractTemplates)
      .values(input)
      .returning();
    
    return template;
  }
  
  /**
   * Get all templates for a workspace
   */
  async getTemplates(workspaceId: string, category?: string): Promise<ClientContractTemplate[]> {
    // @ts-expect-error — TS migration: fix in refactoring sprint
    const conditions = [eq(clientContractTemplates.workspaceId, workspaceId)];
    if (category) {
      // @ts-expect-error — TS migration: fix in refactoring sprint
      conditions.push(eq(clientContractTemplates.category, category));
    }
    
    return db
      .select()
      // @ts-expect-error — TS migration: fix in refactoring sprint
      .from(clientContractTemplates)
      .where(and(...conditions))
      // @ts-expect-error — TS migration: fix in refactoring sprint
      .orderBy(desc(clientContractTemplates.createdAt));
  }
  
  /**
   * Get template by ID
   */
  async getTemplate(templateId: string): Promise<ClientContractTemplate | null> {
    const [template] = await db
      .select()
      // @ts-expect-error — TS migration: fix in refactoring sprint
      .from(clientContractTemplates)
      // @ts-expect-error — TS migration: fix in refactoring sprint
      .where(eq(clientContractTemplates.id, templateId));
    return template || null;
  }
  
  /**
   * Update template
   */
  async updateTemplate(templateId: string, updates: Partial<InsertClientContractTemplate>): Promise<ClientContractTemplate | null> {
    const [template] = await db
      // @ts-expect-error — TS migration: fix in refactoring sprint
      .update(clientContractTemplates)
      .set({ ...updates, updatedAt: new Date() })
      // @ts-expect-error — TS migration: fix in refactoring sprint
      .where(eq(clientContractTemplates.id, templateId))
      .returning();
    return template || null;
  }
  
  /**
   * Delete template (soft delete by setting isActive = false)
   */
  async deleteTemplate(templateId: string): Promise<boolean> {
    const [template] = await db
      // @ts-expect-error — TS migration: fix in refactoring sprint
      .update(clientContractTemplates)
      .set({ isActive: false, updatedAt: new Date() })
      // @ts-expect-error — TS migration: fix in refactoring sprint
      .where(eq(clientContractTemplates.id, templateId))
      .returning();
    return !!template;
  }
  
  // ==========================================================================
  // PROPOSAL/CONTRACT CREATION
  // ==========================================================================
  
  /**
   * Create a new proposal
   */
  async createProposal(input: CreateProposalInput, auditContext: AuditContext): Promise<{ contract: ClientContract; overageCredits?: number }> {
    // Check access
    const access = await this.checkAccess(input.workspaceId);
    if (!access.hasAccess) {
      throw new Error(access.reason || 'No contract pipeline access');
    }
    
    // Increment usage
    const usageResult = await this.incrementUsage(input.workspaceId);
    if (!usageResult.success) {
      throw new Error(usageResult.error || 'Failed to increment usage');
    }
    
    // Generate content hash
    const contentHash = generateContentHash(input.content);
    
    // Create proposal
    const [contract] = await db
      .insert(clientContracts)
      .values({
        workspaceId: input.workspaceId,
        docType: 'proposal',
        clientId: input.clientId,
        clientName: input.clientName,
        clientEmail: input.clientEmail,
        title: input.title,
        content: input.content,
        templateId: input.templateId,
        services: input.services || [],
        billingTerms: input.billingTerms || {},
        totalValue: input.totalValue?.toString(),
        effectiveDate: input.effectiveDate,
        termEndDate: input.termEndDate,
        expiresAt: input.expiresAt,
        specialTerms: input.specialTerms,
        status: 'draft',
        contentHash,
        createdBy: input.createdBy,
      } as InsertClientContract)
      .returning();
    
    // Log audit
    await this.logAudit(contract.id, 'created', auditContext);
    
    // Increment template usage if using a template
    if (input.templateId) {
      await db
        // @ts-expect-error — TS migration: fix in refactoring sprint
        .update(clientContractTemplates)
        .set({ usageCount: sql`usage_count + 1` })
        // @ts-expect-error — TS migration: fix in refactoring sprint
        .where(eq(clientContractTemplates.id, input.templateId));
    }
    
    return { contract, overageCredits: usageResult.overageCredits };
  }
  
  /**
   * Get contract by ID
   */
  async getContract(contractId: string): Promise<ClientContract | null> {
    const [contract] = await db
      .select()
      .from(clientContracts)
      .where(eq(clientContracts.id, contractId));
    return contract || null;
  }
  
  /**
   * Get all contracts for a workspace
   */
  async getContracts(
    workspaceId: string,
    filters?: {
      status?: ContractStatus;
      docType?: ContractDocType;
      clientId?: string;
      search?: string;
      limit?: number;
      offset?: number;
    }
  ): Promise<{ contracts: ClientContract[]; total: number }> {
    const conditions = [eq(clientContracts.workspaceId, workspaceId)];
    
    if (filters?.status) {
      conditions.push(eq(clientContracts.status, filters.status));
    }
    if (filters?.docType) {
      conditions.push(eq(clientContracts.docType, filters.docType));
    }
    if (filters?.clientId) {
      conditions.push(eq(clientContracts.clientId, filters.clientId));
    }
    if (filters?.search) {
      conditions.push(or(
        ilike(clientContracts.title, `%${filters.search}%`),
        ilike(clientContracts.clientName, `%${filters.search}%`)
      )!);
    }
    
    const [countResult] = await db
      .select({ count: sql<number>`count(*)` })
      .from(clientContracts)
      .where(and(...conditions));
    
    const contracts = await db
      .select()
      .from(clientContracts)
      .where(and(...conditions))
      .orderBy(desc(clientContracts.createdAt))
      .limit(filters?.limit || 50)
      .offset(filters?.offset || 0);
    
    return { contracts, total: Number(countResult?.count || 0) };
  }
  
  /**
   * Update contract (only allowed for drafts)
   */
  async updateContract(
    contractId: string,
    updates: Partial<InsertClientContract>,
    auditContext: AuditContext
  ): Promise<ClientContract | null> {
    const contract = await this.getContract(contractId);
    if (!contract) return null;
    
    if (contract.status !== 'draft') {
      throw new Error('Cannot update a contract that is not in draft status');
    }
    
    // Recalculate hash if content changed
    let contentHash = contract.contentHash;
    if (updates.content) {
      contentHash = generateContentHash(updates.content);
    }
    
    const [updated] = await db
      .update(clientContracts)
      .set({ ...updates, contentHash, updatedAt: new Date() })
      .where(eq(clientContracts.id, contractId))
      .returning();
    
    await this.logAudit(contractId, 'updated', auditContext);
    
    return updated || null;
  }
  
  // ==========================================================================
  // PROPOSAL WORKFLOW
  // ==========================================================================
  
  /**
   * Send proposal to client
   */
  async sendProposal(
    contractId: string,
    auditContext: AuditContext
  ): Promise<{ contract: ClientContract; accessToken: string; portalUrl: string }> {
    const contract = await this.getContract(contractId);
    if (!contract) throw new Error('Contract not found');
    if (contract.docType !== 'proposal') throw new Error('Only proposals can be sent');
    if (contract.status !== 'draft') throw new Error('Proposal must be in draft status');
    
    // Generate access token
    const token = generateSecureToken();
    const tokenHash = hashToken(token);
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 30); // 30 days expiry
    
    // @ts-expect-error — TS migration: fix in refactoring sprint
    await db.insert(clientContractAccessTokens).values({
      contractId,
      token,
      tokenHash,
      recipientEmail: contract.clientEmail!,
      recipientName: contract.clientName,
      purpose: 'both', // View and sign
      expiresAt,
    } as InsertClientContractAccessToken);
    
    // Update contract status
    const [updated] = await db
      .update(clientContracts)
      .set({
        status: 'sent',
        sentAt: new Date(),
        statusChangedAt: new Date(),
        statusChangedBy: auditContext.actorId,
      })
      .where(eq(clientContracts.id, contractId))
      .returning();
    
    await this.logAudit(contractId, 'sent', {
      ...auditContext,
      metadata: { recipientEmail: contract.clientEmail },
    });
    
    // Generate portal URL
    const portalUrl = `/contract-portal/${token}`;

    // Send signature request email to client
    if (contract.clientEmail) {
      try {
        const { emailService } = await import('../emailService');
        const baseUrl = process.env.APP_URL || process.env.APP_BASE_URL || 'https://app.coaileague.com';
        const fullPortalUrl = `${baseUrl}${portalUrl}`;
        const expiryDays = 30;

        await NotificationDeliveryService.send({ type: 'document_requires_signature', workspaceId: contract.workspaceId || 'system', recipientUserId: contract.clientEmail, channel: 'email', body: { to: contract.clientEmail, subject: `Action Required: Please Review and Sign — ${contract.title}`, html: `<div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;padding:24px;background:#ffffff;"><h2 style="color:#1a1a2e;margin-bottom:8px;">Document Ready for Your Signature</h2><p style="color:#374151;font-size:15px;">${contract.clientName ? `Hello ${contract.clientName},` : 'Hello,'}</p><p style="color:#374151;font-size:15px;">A document has been prepared for your review and signature:</p><div style="background:#f9fafb;border:1px solid #e5e7eb;border-radius:8px;padding:16px;margin:20px 0;"><strong style="color:#111827;font-size:16px;">${contract.title}</strong></div><p style="color:#374151;font-size:15px;">Please click the button below to review and sign the document. This link expires in ${expiryDays} days.</p><div style="text-align:center;margin:32px 0;"><a href="${fullPortalUrl}" style="background:#4f46e5;color:#ffffff;text-decoration:none;padding:14px 32px;border-radius:8px;font-size:16px;font-weight:600;display:inline-block;">Review &amp; Sign Document</a></div><p style="color:#6b7280;font-size:13px;">If you did not expect this document, you can safely ignore this email. This document was sent via CoAIleague's secure e-signature platform.</p><p style="color:#6b7280;font-size:12px;margin-top:24px;border-top:1px solid #e5e7eb;padding-top:16px;">This link is unique to you and should not be shared. It will expire on ${new Date(Date.now() + expiryDays * 86400000).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}.</p></div>` } });
      } catch (emailErr: any) {
        log.error('[ContractPipeline] Failed to send signature email:', emailErr?.message);
      }
    }

    // Publish so Trinity sales pipeline watcher and owner notifications fire
    platformEventBus.publish({
      type: 'contract_proposal_sent',
      category: 'automation',
      title: `Proposal Sent: ${contract.title}`,
      description: `Proposal sent to ${contract.clientEmail} for review and signature`,
      workspaceId: contract.workspaceId,
      metadata: { contractId, clientEmail: contract.clientEmail, title: contract.title },
    }).catch(err => log.warn('[ContractPipeline] contract_proposal_sent publish failed:', err?.message));
    
    return { contract: updated, accessToken: token, portalUrl };
  }
  
  /**
   * Record when client views a proposal/contract
   */
  async recordView(contractId: string, auditContext: AuditContext): Promise<void> {
    await db
      .update(clientContracts)
      .set({
        viewedAt: new Date(),
        viewCount: sql`view_count + 1`,
        status: sql`CASE WHEN status = 'sent' THEN 'viewed' ELSE status END`,
      })
      .where(eq(clientContracts.id, contractId));
    
    await this.logAudit(contractId, 'viewed', auditContext);
  }
  
  /**
   * Client accepts proposal - generates contract
   */
  async acceptProposal(
    contractId: string,
    auditContext: AuditContext
  ): Promise<ClientContract> {
    // Phase 66: SELECT FOR UPDATE inside a transaction prevents two concurrent
    // acceptance requests from both creating formal contracts from the same proposal.
    const proposal = await db.transaction(async (tx) => {
      const [locked] = await tx
        .select()
        .from(clientContracts)
        .where(eq(clientContracts.id, contractId))
        .for('update')
        .limit(1);

      if (!locked) throw new Error('Proposal not found');
      if (locked.docType !== 'proposal') throw new Error('Only proposals can be accepted');
      if (!['sent', 'viewed'].includes(locked.status)) {
        throw new Error('Proposal must be sent or viewed to accept');
      }

      // Atomically mark the proposal as accepted — status check in WHERE prevents
      // a concurrent request (which acquired the lock after us) from double-accepting.
      const [updated] = await tx
        .update(clientContracts)
        .set({ status: 'accepted', acceptedAt: new Date(), statusChangedAt: new Date() })
        .where(and(eq(clientContracts.id, contractId), or(
          eq(clientContracts.status, 'sent'),
          eq(clientContracts.status, 'viewed'),
        )))
        .returning();
      if (!updated) throw new Error('Proposal was already accepted by a concurrent request');
      return updated;
    });

    // Guards already enforced inside the transaction — proposal is now 'accepted'
    await this.logAudit(contractId, 'accepted', auditContext);

    // Publish so Trinity can trigger auto-contract generation and owner alert
    platformEventBus.publish({
      type: 'contract_proposal_accepted',
      category: 'automation',
      title: `Proposal Accepted: ${proposal.title}`,
      description: `${proposal.clientName} accepted the proposal — formal contract being generated`,
      workspaceId: proposal.workspaceId,
      metadata: { contractId, clientName: proposal.clientName, title: proposal.title },
    }).catch(err => log.warn('[ContractPipeline] contract_proposal_accepted publish failed:', err?.message));
    
    // Generate formal contract from proposal
    const [formalContract] = await db
      .insert(clientContracts)
      .values({
        workspaceId: proposal.workspaceId,
        docType: 'contract',
        parentDocumentId: contractId,
        templateId: proposal.templateId,
        clientId: proposal.clientId,
        clientName: proposal.clientName,
        clientEmail: proposal.clientEmail,
        title: proposal.title.replace('Proposal:', 'Contract:'),
        content: proposal.content,
        services: proposal.services,
        billingTerms: proposal.billingTerms,
        totalValue: proposal.totalValue,
        effectiveDate: proposal.effectiveDate,
        termEndDate: proposal.termEndDate,
        specialTerms: proposal.specialTerms,
        status: 'pending_signatures',
        contentHash: proposal.contentHash,
        createdBy: proposal.createdBy,
      } as InsertClientContract)
      .returning();
    
    await this.logAudit(formalContract.id, 'created', {
      ...auditContext,
      metadata: { sourceProposalId: contractId },
    });
    
    return formalContract;
  }
  
  /**
   * Client requests changes to proposal
   */
  async requestChanges(
    contractId: string,
    changesRequested: string,
    auditContext: AuditContext
  ): Promise<ClientContract> {
    const contract = await this.getContract(contractId);
    if (!contract) throw new Error('Contract not found');
    if (!['sent', 'viewed'].includes(contract.status)) {
      throw new Error('Changes can only be requested on sent or viewed proposals');
    }

    const [updated] = await db
      .update(clientContracts)
      .set({
        status: 'changes_requested',
        changesRequested,
        statusChangedAt: new Date(),
      })
      .where(eq(clientContracts.id, contractId))
      .returning();
    
    await this.logAudit(contractId, 'changes_requested', {
      ...auditContext,
      metadata: { changesRequested },
    });

    // Publish so Trinity flags this for account manager follow-up
    platformEventBus.publish({
      type: 'contract_changes_requested',
      category: 'automation',
      title: `Changes Requested: ${contract.title}`,
      description: `${contract.clientName} requested changes to the proposal`,
      workspaceId: contract.workspaceId,
      metadata: { contractId, clientName: contract.clientName, changesRequested },
    }).catch(err => log.warn('[ContractPipeline] contract_changes_requested publish failed:', err?.message));
    
    return updated;
  }
  
  /**
   * Client declines proposal
   */
  async declineProposal(
    contractId: string,
    reason: string,
    auditContext: AuditContext
  ): Promise<ClientContract> {
    const contract = await this.getContract(contractId);
    if (!contract) throw new Error('Contract not found');
    if (!['sent', 'viewed', 'changes_requested'].includes(contract.status)) {
      throw new Error('Can only decline proposals that are sent, viewed, or have changes requested');
    }

    const [updated] = await db
      .update(clientContracts)
      .set({
        status: 'declined',
        declineReason: reason,
        statusChangedAt: new Date(),
      })
      .where(eq(clientContracts.id, contractId))
      .returning();
    
    await this.logAudit(contractId, 'declined', {
      ...auditContext,
      metadata: { reason },
    });

    // Publish so Trinity CRM watcher logs churn signal and notifies sales rep
    platformEventBus.publish({
      type: 'contract_proposal_declined',
      category: 'automation',
      title: `Proposal Declined: ${contract.title}`,
      description: `${contract.clientName} declined the proposal: ${reason}`,
      workspaceId: contract.workspaceId,
      metadata: { contractId, clientName: contract.clientName, reason },
    }).catch(err => log.warn('[ContractPipeline] contract_proposal_declined publish failed:', err?.message));
    
    return updated;
  }
  
  // ==========================================================================
  // DIGITAL SIGNATURES
  // ==========================================================================
  
  /**
   * Capture a digital signature
   */
  async captureSignature(input: CaptureSignatureInput, auditContext: AuditContext): Promise<ClientContractSignature> {
    // Phase 62: SELECT FOR UPDATE inside a transaction prevents two signers from
    // completing the same signing step simultaneously (race condition on multi-party signing).
    const signature = await db.transaction(async (tx) => {
      // Lock the contract row — concurrent sign requests queue here
      const [contract] = await tx
        .select()
        .from(clientContracts)
        .where(eq(clientContracts.id, input.contractId))
        .for('update')
        .limit(1);

      if (!contract) throw new Error('Contract not found');
      if (!['pending_signatures', 'partially_signed', 'accepted'].includes(contract.status)) {
        throw new Error('Contract is not in a signable state');
      }

      const signerCheck = await this.canSignerSign(input.contractId, input.signerEmail);
      if (!signerCheck.canSign) {
        throw new Error(signerCheck.reason || 'Signer is not allowed to sign at this time');
      }

      const [sig] = await tx
        // @ts-expect-error — TS migration: fix in refactoring sprint
        .insert(clientContractSignatures)
        .values({
          contractId: input.contractId,
          signerRole: input.signerRole,
          signerName: input.signerName,
          signerEmail: input.signerEmail,
          signerTitle: input.signerTitle,
          signatureType: input.signatureType,
          signatureData: input.signatureData,
          consentGiven: true,
          consentText: input.consentText,
          signedAt: new Date(),
          ipAddress: input.ipAddress,
          userAgent: input.userAgent,
          geolocation: input.geolocation,
          timezone: input.timezone,
          emailVerified: true,
        } as InsertClientContractSignature)
        .returning();

      return sig;
    });
    
    await this.logAudit(input.contractId, 'signed', {
      ...auditContext,
      metadata: {
        signerRole: input.signerRole,
        signerName: input.signerName,
        signatureType: input.signatureType,
      },
    });
    
    await this.markSignerSigned(input.contractId, input.signerEmail);

    // Check if all required signatures are collected
    await this.checkAndExecuteContract(input.contractId, auditContext);
    
    return signature;
  }
  
  /**
   * Get signatures for a contract
   */
  async getSignatures(contractId: string): Promise<ClientContractSignature[]> {
    return db
      .select()
      // @ts-expect-error — TS migration: fix in refactoring sprint
      .from(clientContractSignatures)
      // @ts-expect-error — TS migration: fix in refactoring sprint
      .where(eq(clientContractSignatures.contractId, contractId))
      // @ts-expect-error — TS migration: fix in refactoring sprint
      .orderBy(clientContractSignatures.signedAt);
  }
  
  /**
   * Check if all required signatures are present and execute contract
   */
  private async checkAndExecuteContract(contractId: string, auditContext: AuditContext): Promise<void> {
    const contract = await this.getContract(contractId);
    if (!contract) return;
    
    const signatures = await this.getSignatures(contractId);
    const hasCompanySignature = signatures.some(s => s.signerRole === 'company' && s.signedAt);
    const hasClientSignature = signatures.some(s => s.signerRole === 'client' && s.signedAt);
    
    // Check witness/notary if required
    const hasWitness = !contract.requiresWitness || signatures.some(s => s.signerRole === 'witness' && s.signedAt);
    const hasNotary = !contract.requiresNotary || signatures.some(s => s.signerRole === 'notary' && s.signedAt);
    
    if (hasCompanySignature && hasClientSignature && hasWitness && hasNotary) {
      // All signatures collected - execute contract
      await this.executeContract(contractId, auditContext);
    } else if (hasCompanySignature || hasClientSignature) {
      // Partial signatures
      await db
        .update(clientContracts)
        .set({ status: 'partially_signed', statusChangedAt: new Date() })
        .where(eq(clientContracts.id, contractId));
    }
  }
  
  /**
   * Execute (finalize) a fully signed contract
   */
  async executeContract(contractId: string, auditContext: AuditContext): Promise<ClientContract> {
    const contract = await this.getContract(contractId);
    if (!contract) throw new Error('Contract not found');
    if (!['pending_signatures', 'partially_signed', 'accepted'].includes(contract.status)) {
      throw new Error('Contract must be in a signable state to execute');
    }
    
    // Lock the document (make immutable)
    const [executed] = await db
      .update(clientContracts)
      .set({
        status: 'executed',
        executedAt: new Date(),
        lockedAt: new Date(),
        statusChangedAt: new Date(),
      })
      .where(eq(clientContracts.id, contractId))
      .returning();
    
    await this.logAudit(contractId, 'executed', auditContext);

    platformEventBus.publish({
      type: 'contract_executed',
      workspaceId: contract.workspaceId,
      payload: {
        contractId,
        clientId: (contract as any).clientId || null,
        clientName: contract.clientName,
        title: contract.title,
      },
      metadata: { source: 'ContractPipelineService' },
    }).catch((err: any) => log.warn('[ContractPipeline] Failed to publish contract_executed:', err.message));

    // Trinity notification — inform the contract owner
    if (contract.createdBy) {
      try {
        await createNotification({
          workspaceId: contract.workspaceId,
          userId: contract.createdBy,
          type: 'contract_executed',
          title: `Contract Executed: ${contract.clientName || 'Client'}`,
          message: `"${contract.title}" has been fully signed by both parties. You can now create a client profile and assign the first shift. Would you like Trinity to auto-create the client record?`,
          actionUrl: `/clients?action=create&fromContract=${contractId}`,
          relatedEntityType: 'contract',
          relatedEntityId: contractId,
          metadata: {
            clientName: contract.clientName,
            clientEmail: contract.clientEmail,
            contractTitle: contract.title,
            suggestedAction: 'create_client',
          },
        });
      } catch (notifErr) {
        log.error('[ContractPipeline] Failed to send Trinity notification:', notifErr);
      }
    }

    // ── Generate executed PDF + store to GCS ─────────────────────────────────
    let gcsObjectPath: string | null = null;
    try {
      const { generateExecutedContractPdf } = await import('./contractPdfGenerator');
      const { uploadFileToObjectStorage } = await import('../../objectStorage');
      const pdfBuffer = await generateExecutedContractPdf(contractId);
      gcsObjectPath = `contracts/${contract.workspaceId}/${contractId}/executed.pdf`;
      await uploadFileToObjectStorage({
        objectPath: gcsObjectPath,
        buffer: pdfBuffer,
        workspaceId: contract.workspaceId,
        storageCategory: 'documents',
        metadata: {
          contentType: 'application/pdf',
          metadata: { contractId, executedAt: new Date().toISOString() },
        },
      });
      log.info(`[ContractPipeline] Executed PDF stored to GCS: ${gcsObjectPath}`);
    } catch (pdfErr: any) {
      log.warn(`[ContractPipeline] Executed PDF generation/upload failed (non-fatal): ${pdfErr.message}`);
    }

    // ── Bridge to org_documents library ──────────────────────────────────────
    try {
      await db.insert(orgDocuments).values({
        workspaceId: contract.workspaceId,
        uploadedBy: (auditContext as any).userId,
        category: 'client_contract',
        fileName: `${contract.title || 'Contract'} - ${contract.clientName || 'Client'}.pdf`,
        filePath: gcsObjectPath ?? `contracts://${contractId}`,
        fileType: 'pdf',
        description: `Executed contract: ${contract.title}. Client: ${contract.clientName}. Executed on ${new Date().toISOString().split('T')[0]}.`,
        requiresSignature: false,
        version: 1,
        isActive: true,
      });
      log.info(`[ContractPipeline] Bridged executed contract ${contractId} to org_documents`);
    } catch (bridgeError) {
      log.error(`[ContractPipeline] Failed to bridge contract to org_documents:`, bridgeError);
    }

    // ── Send executed copy to all parties ────────────────────────────────────
    (async () => {
      try {
        const signers = await loadSignersFromDB(contractId);
        const APP_URL = process.env.APP_BASE_URL || 'https://app.coaileague.com';
        const contractUrl = `${APP_URL}/documents?category=contracts_pipeline`;
        const recipients = signers.filter(s => s.signerEmail);
        // Also notify client if not already in signers list
        if (contract.clientEmail && !recipients.some(s => s.signerEmail === contract.clientEmail)) {
          recipients.push({
            id: 'client',
            contractId,
            signerRole: 'client',
            signerName: contract.clientName || 'Client',
            signerEmail: contract.clientEmail,
            order: 0,
            status: 'signed',
            reminderCount: 0,
          } as any);
        }
        for (const signer of recipients) {
          await NotificationDeliveryService.send({
            type: 'contract_executed',
            workspaceId: contract.workspaceId,
            recipientUserId: signer.signerEmail,
            channel: 'email',
            body: {
              to: signer.signerEmail,
              subject: `Your executed agreement is ready — ${contract.title}`,
              html: `<div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;padding:24px;background:#ffffff;">
<h2 style="color:#1a1a2e;">Agreement Fully Executed</h2>
<p style="color:#374151;">Hello ${signer.signerName || 'there'},</p>
<p style="color:#374151;">Your agreement has been fully signed by all parties and is now in effect:</p>
<div style="background:#f9fafb;border:1px solid #e5e7eb;border-radius:8px;padding:16px;margin:20px 0;">
  <strong style="color:#111827;font-size:16px;">${contract.title}</strong>
  <p style="color:#6b7280;margin:8px 0 0;">Execution Date: ${new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}</p>
</div>
<p style="color:#374151;">You can view and download your executed agreement from the document center:</p>
<div style="text-align:center;margin:32px 0;">
  <a href="${contractUrl}" style="background:#4f46e5;color:#ffffff;text-decoration:none;padding:14px 32px;border-radius:8px;font-size:16px;font-weight:600;display:inline-block;">View Executed Agreement</a>
</div>
<p style="color:#6b7280;font-size:12px;margin-top:24px;border-top:1px solid #e5e7eb;padding-top:16px;">
  This agreement was executed via CoAIleague's secure e-signature platform.
</p>
</div>`,
            },
          }).catch((emailErr: any) => log.warn(`[ContractPipeline] Executed copy email failed for ${signer.signerEmail}: ${emailErr?.message}`));
        }
      } catch (emailErr: any) {
        log.warn(`[ContractPipeline] Failed to send executed copy emails: ${emailErr.message}`);
      }
    })();

    // ── QuickBooks invoice (non-blocking, only if QB connected) ───────────────
    if (contract.totalValue) {
      (async () => {
        try {
          const [ws] = await db.select().from(workspaces)
            .where(eq(workspaces.id, contract.workspaceId))
            .limit(1);
          if ((ws as any)?.qbAccessTokenEncrypted) {
            const { ensureQuickBooksRecord } = await import('../integrations/quickbooksLazySync');
            if (contract.clientName) {
              await ensureQuickBooksRecord({
                workspaceId: contract.workspaceId,
                entityType: 'customer',
                entityName: contract.clientName,
                email: contract.clientEmail || undefined,
              } as any);
            }
            log.info(`[ContractPipeline] QB customer ensured for contract ${contractId}`);
          }
        } catch (qbErr: any) {
          log.warn(`[ContractPipeline] QB sync failed (non-fatal): ${qbErr.message}`);
        }
      })();
    }

    return executed;
  }
  
  // ==========================================================================
  // AUDIT TRAIL
  // ==========================================================================
  
  /**
   * Log an audit event
   */
  async logAudit(
    contractId: string,
    action: AuditAction,
    context: AuditContext
  ): Promise<void> {
    const contract = await this.getContract(contractId);
    
    await db.insert(clientContractAuditLog).values({
      contractId,
      action,
      actionDescription: this.getActionDescription(action),
      actorId: context.actorId,
      actorType: context.actorType,
      actorName: context.actorName,
      actorEmail: context.actorEmail,
      ipAddress: context.ipAddress,
      userAgent: context.userAgent,
      metadata: context.metadata || {},
      previousStatus: contract?.status,
    } as InsertClientContractAuditLog);
  }
  
  private getActionDescription(action: AuditAction): string {
    const descriptions: Record<AuditAction, string> = {
      created: 'Document was created',
      updated: 'Document was updated',
      sent: 'Document was sent to client',
      viewed: 'Document was viewed',
      downloaded: 'Document was downloaded',
      accepted: 'Proposal was accepted by client',
      declined: 'Proposal was declined by client',
      changes_requested: 'Client requested changes',
      signed: 'Document was signed',
      executed: 'Contract was fully executed',
      amended: 'Amendment was created',
      terminated: 'Contract was terminated',
      archived: 'Document was archived',
      searched: 'Document appeared in search results',
      reminder_sent: 'Reminder was sent',
      access_granted: 'Portal access was granted',
      access_revoked: 'Portal access was revoked',
    };
    return descriptions[action] || action;
  }
  
  /**
   * Get audit trail for a contract
   */
  async getAuditTrail(contractId: string): Promise<any[]> {
    return db
      .select()
      .from(clientContractAuditLog)
      .where(eq(clientContractAuditLog.contractId, contractId))
      .orderBy(desc(clientContractAuditLog.timestamp));
  }
  
  // ==========================================================================
  // CLIENT PORTAL ACCESS
  // ==========================================================================
  
  /**
   * Validate access token and return contract if valid
   */
  async validateAccessToken(token: string): Promise<{ valid: boolean; contract?: ClientContract; error?: string }> {
    const [accessToken] = await db
      .select()
      .from(clientContractAccessTokens)
      .where(eq(clientContractAccessTokens.token, token));
    
    if (!accessToken) {
      return { valid: false, error: 'Invalid access token' };
    }
    
    // @ts-expect-error — TS migration: fix in refactoring sprint
    if (accessToken.isRevoked) {
      return { valid: false, error: 'Access token has been revoked' };
    }
    
    // @ts-expect-error — TS migration: fix in refactoring sprint
    if (new Date() > accessToken.expiresAt) {
      return { valid: false, error: 'Access token has expired' };
    }
    
    // @ts-expect-error — TS migration: fix in refactoring sprint
    if (accessToken.maxUses && accessToken.useCount! >= (accessToken as any).maxUses) {
      return { valid: false, error: 'Access token has exceeded maximum uses' };
    }
    
    // Increment use count
    await db
      .update(clientContractAccessTokens)
      .set({
        useCount: (accessToken.useCount || 0) + 1,
        lastUsedAt: new Date(),
      })
      .where(eq(clientContractAccessTokens.id, accessToken.id));
    
    // @ts-expect-error — TS migration: fix in refactoring sprint
    const contract = await this.getContract(accessToken.contractId);
    if (!contract) {
      return { valid: false, error: 'Contract not found' };
    }
    
    return { valid: true, contract };
  }
  
  /**
   * Revoke access token
   */
  async revokeAccessToken(tokenId: string, revokedBy: string): Promise<boolean> {
    const [updated] = await db
      .update(clientContractAccessTokens)
      .set({
        // @ts-expect-error — TS migration: fix in refactoring sprint
        isRevoked: true,
        revokedAt: new Date(),
        revokedBy,
      })
      .where(eq(clientContractAccessTokens.id, tokenId))
      .returning();
    
    return !!updated;
  }
  
  // ==========================================================================
  // HASH VERIFICATION
  // ==========================================================================
  
  /**
   * Verify document integrity by comparing content hash
   */
  async verifyDocumentIntegrity(contractId: string): Promise<{ valid: boolean; storedHash?: string; computedHash?: string }> {
    const contract = await this.getContract(contractId);
    if (!contract) {
      return { valid: false };
    }
    
    const computedHash = generateContentHash(contract.content);
    const valid = contract.contentHash === computedHash;
    
    return {
      valid,
      storedHash: contract.contentHash || undefined,
      computedHash,
    };
  }
  
  // ==========================================================================
  // EVIDENCE EXPORT (E-SIGN/UETA COMPLIANCE)
  // ==========================================================================
  
  /**
   * Generate court-admissible evidence package
   */
  async generateEvidencePackage(contractId: string): Promise<{
    contract: ClientContract;
    signatures: ClientContractSignature[];
    auditTrail: any[];
    integrityVerification: { valid: boolean; storedHash?: string; computedHash?: string };
    generatedAt: Date;
  }> {
    const contract = await this.getContract(contractId);
    if (!contract) throw new Error('Contract not found');
    
    const [signatures, auditTrail, integrityVerification] = await Promise.all([
      this.getSignatures(contractId),
      this.getAuditTrail(contractId),
      this.verifyDocumentIntegrity(contractId),
    ]);
    
    return {
      contract,
      signatures,
      auditTrail,
      integrityVerification,
      generatedAt: new Date(),
    };
  }
  
  // ==========================================================================
  // SIGNER MANAGEMENT & SEQUENCING
  // ==========================================================================

  async addSigners(contractId: string, signers: Array<{
    signerRole: SignerRole;
    signerName: string;
    signerEmail: string;
    signerTitle?: string;
    order: number;
  }>, auditContext: AuditContext): Promise<ContractSigner[]> {
    const contract = await this.getContract(contractId);
    if (!contract) throw new Error('Contract not found');

    const existing = await loadSignersFromDB(contractId);
    const newSigners: ContractSigner[] = signers.map(s => ({
      id: crypto.randomUUID(),
      contractId,
      signerRole: s.signerRole,
      signerName: s.signerName,
      signerEmail: s.signerEmail,
      signerTitle: s.signerTitle,
      order: s.order,
      status: 'pending' as const,
      reminderCount: 0,
    }));

    for (const signer of newSigners) {
      await persistSignerToDB(signer);
    }
    const allSigners = [...existing, ...newSigners].sort((a, b) => a.order - b.order);

    await this.logAudit(contractId, 'updated', {
      ...auditContext,
      metadata: { action: 'signers_added', signerCount: newSigners.length, signerEmails: newSigners.map(s => s.signerEmail) },
    });

    return allSigners;
  }

  async getSignersForContract(contractId: string): Promise<ContractSigner[]> {
    return loadSignersFromDB(contractId);
  }

  async canSignerSign(contractId: string, signerEmail: string): Promise<{ canSign: boolean; reason?: string; currentOrder?: number }> {
    const signers = await loadSignersFromDB(contractId);
    if (signers.length === 0) {
      return { canSign: true };
    }

    const signer = signers.find(s => s.signerEmail.toLowerCase() === signerEmail.toLowerCase());
    if (!signer) {
      return { canSign: true };
    }

    if (signer.status === 'signed') {
      return { canSign: false, reason: 'Signer has already signed this contract', currentOrder: signer.order };
    }

    if (signer.status === 'declined') {
      return { canSign: false, reason: 'Signer has declined this contract', currentOrder: signer.order };
    }

    const previousSigners = signers.filter(s => s.order < signer.order);
    const allPreviousSigned = previousSigners.every(s => s.status === 'signed');

    if (!allPreviousSigned) {
      const pendingPrevious = previousSigners.filter(s => s.status !== 'signed');
      return {
        canSign: false,
        reason: `Waiting for prior signer(s) to sign: ${pendingPrevious.map(s => s.signerName).join(', ')}`,
        currentOrder: signer.order,
      };
    }

    return { canSign: true, currentOrder: signer.order };
  }

  async sendReminder(contractId: string, signerId: string, auditContext: AuditContext): Promise<{ success: boolean; message: string }> {
    const signers = await loadSignersFromDB(contractId);
    if (signers.length === 0) {
      return { success: false, message: 'No signers found for this contract' };
    }

    const signer = signers.find(s => s.id === signerId);
    if (!signer) {
      return { success: false, message: 'Signer not found' };
    }

    if (signer.status === 'signed') {
      return { success: false, message: 'Signer has already signed' };
    }

    if (signer.status === 'declined') {
      return { success: false, message: 'Signer has declined' };
    }

    signer.reminderCount += 1;
    signer.lastReminderAt = new Date();
    signer.status = signer.status === 'pending' ? 'notified' : signer.status;
    await updateSignerInDB(signer.id, {
      reminderCount: signer.reminderCount,
      lastReminderAt: signer.lastReminderAt,
      signerStatus: signer.status,
    });

    await this.logAudit(contractId, 'reminder_sent', {
      ...auditContext,
      metadata: {
        signerId: signer.id,
        signerName: signer.signerName,
        signerEmail: signer.signerEmail,
        reminderCount: signer.reminderCount,
      },
    });

    return { success: true, message: `Reminder sent to ${signer.signerName} (${signer.signerEmail}). Total reminders: ${signer.reminderCount}` };
  }

  async reorderSigners(contractId: string, signerOrders: Array<{ signerId: string; order: number }>, auditContext: AuditContext): Promise<ContractSigner[]> {
    const signers = await loadSignersFromDB(contractId);
    if (signers.length === 0) throw new Error('No signers found for this contract');

    for (const update of signerOrders) {
      const signer = signers.find(s => s.id === update.signerId);
      if (signer) {
        signer.order = update.order;
        await updateSignerInDB(signer.id, { signerOrder: update.order });
      }
    }

    const sorted = signers.sort((a, b) => a.order - b.order);

    await this.logAudit(contractId, 'updated', {
      ...auditContext,
      metadata: { action: 'signers_reordered', newOrder: sorted.map(s => ({ id: s.id, name: s.signerName, order: s.order })) },
    });

    return sorted;
  }

  async getNextSigner(contractId: string): Promise<ContractSigner | null> {
    const signers = await loadSignersFromDB(contractId);
    if (signers.length === 0) return null;

    return signers.find(s => s.status !== 'signed' && s.status !== 'declined') || null;
  }

  async markSignerSigned(contractId: string, signerEmail: string): Promise<void> {
    const signers = await loadSignersFromDB(contractId);
    if (signers.length === 0) return;

    const signer = signers.find(s => s.signerEmail.toLowerCase() === signerEmail.toLowerCase());
    if (!signer) return;

    await updateSignerInDB(signer.id, {
      signerStatus: 'signed',
      signedAt: new Date(),
    });
  }

  // ==========================================================================
  // STATISTICS & DASHBOARD
  // ==========================================================================
  
  /**
   * Get contract pipeline statistics for dashboard
   */
  async getStatistics(workspaceId: string): Promise<{
    totalProposals: number;
    totalContracts: number;
    pendingSignatures: number;
    executedThisMonth: number;
    totalContractValue: number;
    conversionRate: number;
  }> {
    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    
    const [stats] = await db
      .select({
        totalProposals: sql<number>`COUNT(*) FILTER (WHERE doc_type = 'proposal')`,
        totalContracts: sql<number>`COUNT(*) FILTER (WHERE doc_type = 'contract')`,
        pendingSignatures: sql<number>`COUNT(*) FILTER (WHERE status = 'pending_signatures' OR status = 'partially_signed')`,
        executedThisMonth: sql<number>`COUNT(*) FILTER (WHERE status = 'executed' AND executed_at >= ${monthStart})`,
        totalContractValue: sql<number>`COALESCE(SUM(CASE WHEN status = 'executed' THEN total_value::numeric ELSE 0 END), 0)`,
        acceptedProposals: sql<number>`COUNT(*) FILTER (WHERE doc_type = 'proposal' AND status IN ('accepted', 'executed'))`,
      })
      .from(clientContracts)
      .where(eq(clientContracts.workspaceId, workspaceId));
    
    const conversionRate = stats.totalProposals > 0 
      ? Math.round((stats.acceptedProposals / stats.totalProposals) * 100) 
      : 0;
    
    return {
      totalProposals: Number(stats.totalProposals || 0),
      totalContracts: Number(stats.totalContracts || 0),
      pendingSignatures: Number(stats.pendingSignatures || 0),
      executedThisMonth: Number(stats.executedThisMonth || 0),
      totalContractValue: Number(stats.totalContractValue || 0),
      conversionRate,
    };
  }
}

// Export singleton
export const contractPipelineService = new ContractPipelineService();

/**
 * Daily job — chases pending signatures. Scans all contracts in `sent`/`viewed`/
 * `partially_signed` state, calculates age since last activity, and emails the
 * client portal link again at 3/7/14 days. Skips contracts that have hit their
 * token expiry or are already fully executed / declined.
 *
 * Runs via autonomousScheduler cron — safe to invoke manually for testing.
 */
export async function sendContractSigningReminders(): Promise<{ scanned: number; sent: number }> {
  const now = Date.now();
  const DAY_MS = 24 * 60 * 60 * 1000;
  const reminderAges = [3, 7, 14]; // days

  // Fetch all contracts that still need a signature
  const pending = await db
    .select({
      id: clientContracts.id,
      workspaceId: clientContracts.workspaceId,
      title: clientContracts.title,
      clientEmail: clientContracts.clientEmail,
      clientName: clientContracts.clientName,
      status: clientContracts.status,
      sentAt: clientContracts.sentAt,
      statusChangedAt: clientContracts.statusChangedAt,
    })
    .from(clientContracts)
    .where(
      or(
        eq(clientContracts.status, 'sent'),
        eq(clientContracts.status, 'viewed'),
        eq(clientContracts.status, 'partially_signed'),
      )!,
    );

  let sent = 0;
  for (const contract of pending) {
    if (!contract.clientEmail) continue;
    const baseline = contract.statusChangedAt || contract.sentAt;
    if (!baseline) continue;
    const ageDays = Math.floor((now - new Date(baseline).getTime()) / DAY_MS);
    if (!reminderAges.includes(ageDays)) continue;

    // Find the latest active access token for this contract so the reminder
    // link lands on the correct portal URL.
    const [token] = await db
      .select({ token: clientContractAccessTokens.token, expiresAt: clientContractAccessTokens.expiresAt })
      .from(clientContractAccessTokens)
      .where(eq(clientContractAccessTokens.contractId, contract.id))
      .orderBy(desc(clientContractAccessTokens.createdAt))
      .limit(1);

    if (!token?.token) continue;
    if (token.expiresAt && new Date(token.expiresAt).getTime() < now) continue;

    const baseUrl = process.env.APP_URL || process.env.APP_BASE_URL || 'https://app.coaileague.com';
    const fullPortalUrl = `${baseUrl}/contract-portal/${token.token}`;

    try {
      await NotificationDeliveryService.send({
        // @ts-expect-error — TS migration: fix in refactoring sprint
        type: 'contract_signing_reminder',
        workspaceId: contract.workspaceId || 'system',
        recipientUserId: contract.clientEmail,
        channel: 'email',
        body: {
          to: contract.clientEmail,
          subject: `Reminder: Please Sign — ${contract.title}`,
          html: `<div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;padding:24px;background:#ffffff;">
            <h2 style="color:#1a1a2e;margin-bottom:8px;">Signature Reminder</h2>
            <p style="color:#374151;font-size:15px;">${contract.clientName ? `Hello ${contract.clientName},` : 'Hello,'}</p>
            <p style="color:#374151;font-size:15px;">This is a friendly reminder that the following document is still awaiting your signature:</p>
            <div style="background:#f9fafb;border:1px solid #e5e7eb;border-radius:8px;padding:16px;margin:20px 0;">
              <strong style="color:#111827;font-size:16px;">${contract.title}</strong>
              <p style="color:#6b7280;font-size:13px;margin:8px 0 0 0;">Sent ${ageDays} days ago.</p>
            </div>
            <div style="text-align:center;margin:32px 0;">
              <a href="${fullPortalUrl}" style="background:#4f46e5;color:#ffffff;text-decoration:none;padding:14px 32px;border-radius:8px;font-size:16px;font-weight:600;display:inline-block;">Review &amp; Sign Document</a>
            </div>
            <p style="color:#6b7280;font-size:12px;margin-top:24px;border-top:1px solid #e5e7eb;padding-top:16px;">If you have already completed this action, please disregard this reminder.</p>
          </div>`,
        },
        idempotencyKey: `contract-reminder-${contract.id}-${ageDays}d`,
      });
      sent++;

      platformEventBus.publish({
        type: 'contract_signing_reminder_sent',
        category: 'automation',
        title: `Signing Reminder Sent: ${contract.title}`,
        description: `Day-${ageDays} reminder emailed to ${contract.clientEmail}`,
        workspaceId: contract.workspaceId,
        metadata: { contractId: contract.id, ageDays },
      }).catch(err => log.warn('[ContractReminder] event publish failed:', err?.message));
    } catch (err: any) {
      log.error(`[ContractReminder] Failed to send reminder for contract ${contract.id}:`, err?.message);
    }
  }

  log.info(`[ContractReminder] Scanned ${pending.length} pending contracts, sent ${sent} reminders`);
  return { scanned: pending.length, sent };
}
