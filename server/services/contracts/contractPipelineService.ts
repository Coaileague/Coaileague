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

import { db } from '../../db';
import { eq, and, gte, lte, desc, sql, or, ilike } from 'drizzle-orm';
import {
  clientContracts,
  clientContractTemplates,
  clientContractSignatures,
  clientContractAuditLog,
  clientContractAccessTokens,
  clientContractAttachments,
  clientContractPipelineUsage,
  clients,
  users,
  workspaces,
  InsertClientContract,
  InsertClientContractTemplate,
  InsertClientContractSignature,
  InsertClientContractAuditLog,
  InsertClientContractAccessToken,
  InsertClientContractAttachment,
  InsertClientContractPipelineUsage,
  ClientContract,
  ClientContractTemplate,
  ClientContractSignature,
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
      .insert(clientContractTemplates)
      .values(input)
      .returning();
    
    return template;
  }
  
  /**
   * Get all templates for a workspace
   */
  async getTemplates(workspaceId: string, category?: string): Promise<ClientContractTemplate[]> {
    const conditions = [eq(clientContractTemplates.workspaceId, workspaceId)];
    if (category) {
      conditions.push(eq(clientContractTemplates.category, category));
    }
    
    return db
      .select()
      .from(clientContractTemplates)
      .where(and(...conditions))
      .orderBy(desc(clientContractTemplates.createdAt));
  }
  
  /**
   * Get template by ID
   */
  async getTemplate(templateId: string): Promise<ClientContractTemplate | null> {
    const [template] = await db
      .select()
      .from(clientContractTemplates)
      .where(eq(clientContractTemplates.id, templateId));
    return template || null;
  }
  
  /**
   * Update template
   */
  async updateTemplate(templateId: string, updates: Partial<InsertClientContractTemplate>): Promise<ClientContractTemplate | null> {
    const [template] = await db
      .update(clientContractTemplates)
      .set({ ...updates, updatedAt: new Date() })
      .where(eq(clientContractTemplates.id, templateId))
      .returning();
    return template || null;
  }
  
  /**
   * Delete template (soft delete by setting isActive = false)
   */
  async deleteTemplate(templateId: string): Promise<boolean> {
    const [template] = await db
      .update(clientContractTemplates)
      .set({ isActive: false, updatedAt: new Date() })
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
        .update(clientContractTemplates)
        .set({ usageCount: sql`usage_count + 1` })
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
    
    // Generate portal URL (would be your actual domain)
    const portalUrl = `/contract-portal/${token}`;
    
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
    const proposal = await this.getContract(contractId);
    if (!proposal) throw new Error('Proposal not found');
    if (proposal.docType !== 'proposal') throw new Error('Only proposals can be accepted');
    if (!['sent', 'viewed'].includes(proposal.status)) {
      throw new Error('Proposal must be sent or viewed to accept');
    }
    
    // Update proposal to accepted
    const [updated] = await db
      .update(clientContracts)
      .set({
        status: 'accepted',
        acceptedAt: new Date(),
        statusChangedAt: new Date(),
      })
      .where(eq(clientContracts.id, contractId))
      .returning();
    
    await this.logAudit(contractId, 'accepted', auditContext);
    
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
    
    return updated;
  }
  
  // ==========================================================================
  // DIGITAL SIGNATURES
  // ==========================================================================
  
  /**
   * Capture a digital signature
   */
  async captureSignature(input: CaptureSignatureInput, auditContext: AuditContext): Promise<ClientContractSignature> {
    const contract = await this.getContract(input.contractId);
    if (!contract) throw new Error('Contract not found');
    if (!['pending_signatures', 'partially_signed', 'accepted'].includes(contract.status)) {
      throw new Error('Contract is not in a signable state');
    }
    
    // Create signature record
    const [signature] = await db
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
        emailVerified: true, // Assume verified via token access
      } as InsertClientContractSignature)
      .returning();
    
    await this.logAudit(input.contractId, 'signed', {
      ...auditContext,
      metadata: {
        signerRole: input.signerRole,
        signerName: input.signerName,
        signatureType: input.signatureType,
      },
    });
    
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
      .from(clientContractSignatures)
      .where(eq(clientContractSignatures.contractId, contractId))
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
    
    if (accessToken.isRevoked) {
      return { valid: false, error: 'Access token has been revoked' };
    }
    
    if (new Date() > accessToken.expiresAt) {
      return { valid: false, error: 'Access token has expired' };
    }
    
    if (accessToken.maxUses && accessToken.useCount! >= accessToken.maxUses) {
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
