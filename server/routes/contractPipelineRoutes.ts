/**
 * Contract Pipeline API Routes
 * =============================
 * REST API for the Contract Lifecycle Pipeline feature.
 * Includes public portal endpoints for client access.
 */

import { sanitizeError } from '../middleware/errorHandler';
import { Router, Request, Response } from 'express';
import { contractPipelineService } from '../services/contracts/contractPipelineService';
import { z } from 'zod';
import { requireAuth } from '../auth';
import { hasManagerAccess } from '../rbac';
import { tokenManager } from '../services/billing/tokenManager';
import { requirePlan } from '../tierGuards';
import { createLogger } from '../lib/logger';
const log = createLogger('ContractPipelineRoutes');

const router = Router();

// Contract pipeline is a Professional+ feature (contract_pipeline, e_signatures, document_signing)
router.use(requireAuth);
router.use(requirePlan('professional'));

// Public router for portal endpoints (no auth required)
// Clients access their portal via signed token — intentionally outside the tier gate.
export const publicPortalRouter = Router();

// Middleware types
// @ts-expect-error — TS migration: fix in refactoring sprint
interface AuthenticatedRequest extends Request {
  session: {
    userId?: string;
    workspaceId?: string;
  };
  headers: Request['headers'] & {
    'x-forwarded-for'?: string;
  };
}

// Helper to get client IP
function getClientIP(req: Request): string {
  const forwarded = req.headers['x-forwarded-for'];
  if (typeof forwarded === 'string') {
    return forwarded.split(',')[0].trim();
  }
  return req.socket?.remoteAddress || 'unknown';
}

// Helper for audit context
function getAuditContext(req: AuthenticatedRequest, actorType: 'user' | 'client' | 'system' = 'user') {
  return {
    actorId: req.session?.userId,
    actorType,
    // @ts-expect-error — TS migration: fix in refactoring sprint
    ipAddress: getClientIP(req),
    userAgent: req.headers['user-agent'],
  };
}

// ============================================================================
// TEMPLATES
// ============================================================================

router.post('/templates', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const workspaceId = req.workspaceId || req.user?.currentWorkspaceId;
    const userId = req.user?.id || req.session?.userId;
    if (!workspaceId || !userId) {
      return res.status(401).json({ error: 'Not authenticated' });
    }

    const schema = z.object({
      name: z.string().min(1).max(200),
      description: z.string().optional(),
      category: z.string().optional(),
      content: z.string().min(1),
      fieldMappings: z.record(z.any()).optional(),
      includedClauses: z.array(z.string()).optional(),
      isDefault: z.boolean().optional(),
    });

    const input = schema.parse(req.body);
    const template = await contractPipelineService.createTemplate({
      ...input,
      workspaceId,
      createdBy: userId,
    });

    res.status(201).json({ template });
  } catch (error: unknown) {
    log.error('[ContractPipeline] Create template error:', error);
    res.status(400).json({ error: sanitizeError(error) || 'Failed to create template' });
  }
});

router.patch('/templates/:id', async (req: AuthenticatedRequest, res: Response) => {
  try {
    if (!hasManagerAccess(req.workspaceRole || '')) {
      return res.status(403).json({ error: 'Manager access required to update contract templates' });
    }
    const existing = await contractPipelineService.getTemplate(req.params.id);
    if (!existing || existing.workspaceId !== req.workspaceId) {
      return res.status(404).json({ error: 'Template not found' });
    }
    const template = await contractPipelineService.updateTemplate(req.params.id, req.body);
    if (!template) {
      return res.status(404).json({ error: 'Template not found' });
    }
    res.json({ template });
  } catch (error: unknown) {
    log.error('[ContractPipeline] Update template error:', error);
    res.status(400).json({ error: sanitizeError(error) || 'Failed to update template' });
  }
});

// ============================================================================
// CONTRACTS (Proposals, Contracts, Amendments)
// ============================================================================

router.get('/', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const workspaceId = req.workspaceId || req.user?.currentWorkspaceId;
    if (!workspaceId) {
      return res.status(401).json({ error: 'Not authenticated' });
    }

    const filters = {
      status: req.query.status as any,
      docType: req.query.docType as any,
      clientId: req.query.clientId as string,
      search: req.query.search as string,
      limit: Math.min(Math.max(1, req.query.limit ? parseInt(req.query.limit as string) : 50), 500),
      offset: req.query.offset ? parseInt(req.query.offset as string) : 0,
    };

    const result = await contractPipelineService.getContracts(workspaceId, filters);
    res.json(result);
  } catch (error: unknown) {
    log.error('[ContractPipeline] Get contracts error:', error);
    res.status(500).json({ error: sanitizeError(error) || 'Failed to get contracts' });
  }
});

router.post('/', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const workspaceId = req.workspaceId || req.user?.currentWorkspaceId;
    const userId = req.user?.id || req.session?.userId;
    if (!workspaceId || !userId) {
      return res.status(401).json({ error: 'Not authenticated' });
    }

    const schema = z.object({
      clientId: z.string().optional(),
      clientName: z.string().min(1),
      clientEmail: z.string().email(),
      title: z.string().min(1).max(300),
      content: z.string().min(1),
      templateId: z.string().optional(),
      services: z.array(z.any()).optional(),
      billingTerms: z.record(z.any()).optional(),
      totalValue: z.number().optional(),
      effectiveDate: z.string().optional(),
      termEndDate: z.string().optional(),
      expiresAt: z.string().optional(),
      specialTerms: z.string().optional(),
    });

    const input = schema.parse(req.body);
    const result = await contractPipelineService.createProposal(
      {
        ...input,
        workspaceId,
        createdBy: userId,
        expiresAt: input.expiresAt ? new Date(input.expiresAt) : undefined,
      },
      getAuditContext(req)
    );

    res.status(201).json(result);
  } catch (error: unknown) {
    log.error('[ContractPipeline] Create contract error:', error);
    res.status(400).json({ error: sanitizeError(error) || 'Failed to create proposal' });
  }
});

router.get('/access', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const workspaceId = req.workspaceId || req.user?.currentWorkspaceId;
    if (!workspaceId) {
      return res.status(401).json({ error: 'Not authenticated' });
    }
    const access = await contractPipelineService.checkAccess(workspaceId);
    res.json(access);
  } catch (error: unknown) {
    log.error('[ContractPipeline] Check access error:', error);
    res.status(500).json({ error: sanitizeError(error) || 'Failed to check access' });
  }
});

router.get('/stats', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const workspaceId = req.workspaceId || req.user?.currentWorkspaceId;
    if (!workspaceId) {
      return res.status(401).json({ error: 'Not authenticated' });
    }
    const stats = await contractPipelineService.getStatistics(workspaceId);
    res.json(stats);
  } catch (error: unknown) {
    log.error('[ContractPipeline] Get stats error:', error);
    res.status(500).json({ error: sanitizeError(error) || 'Failed to get statistics' });
  }
});

// =
// PROPOSAL WORKFLOW
// ============================================================================

router.post('/:id/accept', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const contract = await contractPipelineService.acceptProposal(
      req.params.id,
      getAuditContext(req, 'client')
    );
    res.json({ contract });
  } catch (error: unknown) {
    log.error('[ContractPipeline] Accept proposal error:', error);
    res.status(400).json({ error: sanitizeError(error) || 'Failed to accept proposal' });
  }
});

router.post('/:id/decline', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const declineSchema = z.object({ reason: z.string().optional() });
    const declineParsed = declineSchema.safeParse(req.body);
    if (!declineParsed.success) return res.status(400).json({ error: 'Invalid request body', details: declineParsed.error.issues });
    const { reason } = declineParsed.data;
    const contract = await contractPipelineService.declineProposal(
      req.params.id,
      reason || 'No reason provided',
      getAuditContext(req, 'client')
    );
    res.json({ contract });
  } catch (error: unknown) {
    log.error('[ContractPipeline] Decline proposal error:', error);
    res.status(400).json({ error: sanitizeError(error) || 'Failed to decline proposal' });
  }
});

// ============================================================================
// SIGNATURES
// ============================================================================

router.post('/:id/sign', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const schema = z.object({
      signerRole: z.enum(['company', 'client', 'witness', 'notary']),
      signerName: z.string().min(1),
      signerEmail: z.string().email(),
      signerTitle: z.string().optional(),
      signatureType: z.enum(['typed', 'drawn', 'uploaded']),
      signatureData: z.string().optional(),
      consentText: z.string().min(1),
      geolocation: z.object({
        lat: z.number(),
        lng: z.number(),
        accuracy: z.number(),
      }).optional(),
      timezone: z.string().optional(),
    });

    const input = schema.parse(req.body);
    const signature = await contractPipelineService.captureSignature(
      {
        contractId: req.params.id,
        ...input,
        // @ts-expect-error — TS migration: fix in refactoring sprint
        ipAddress: getClientIP(req),
        userAgent: req.headers['user-agent'] || 'unknown',
      },
      getAuditContext(req, input.signerRole === 'company' ? 'user' : 'client')
    );

    res.status(201).json({ signature });
  } catch (error: unknown) {
    log.error('[ContractPipeline] Capture signature error:', error);
    res.status(400).json({ error: sanitizeError(error) || 'Failed to capture signature' });
  }
});

// ============================================================================
// SIGNER MANAGEMENT & SEQUENCING
// ============================================================================

router.get('/:id/signers', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const signers = await contractPipelineService.getSignersForContract(req.params.id);
    const nextSigner = await contractPipelineService.getNextSigner(req.params.id);
    res.json({ signers, nextSigner });
  } catch (error: unknown) {
    log.error('[ContractPipeline] Get signers error:', error);
    res.status(500).json({ error: sanitizeError(error) || 'Failed to get signers' });
  }
});

router.patch('/:id/signers/reorder', async (req: AuthenticatedRequest, res: Response) => {
  try {
    if (!hasManagerAccess(req.workspaceRole || '')) {
      return res.status(403).json({ error: 'Manager access required to reorder contract signers' });
    }
    const schema = z.object({
      signerOrders: z.array(z.object({
        signerId: z.string().min(1),
        order: z.number().int().min(1),
      })).min(1),
    });

    const { signerOrders } = schema.parse(req.body);
    const result = await contractPipelineService.reorderSigners(
      req.params.id,
      signerOrders,
      getAuditContext(req)
    );

    res.json({ signers: result });
  } catch (error: unknown) {
    log.error('[ContractPipeline] Reorder signers error:', error);
    res.status(400).json({ error: sanitizeError(error) || 'Failed to reorder signers' });
  }
});

// ============================================================================
// AUDIT TRAIL
// ============================================================================

// ============================================================================
// EVIDENCE EXPORT
// ============================================================================

router.get('/:id/verify', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const verification = await contractPipelineService.verifyDocumentIntegrity(req.params.id);
    res.json(verification);
  } catch (error: unknown) {
    log.error('[ContractPipeline] Verify document error:', error);
    res.status(500).json({ error: sanitizeError(error) || 'Failed to verify document' });
  }
});

// ============================================================================
// USAGE & QUOTA
// ============================================================================

// ============================================================================
// PUBLIC PORTAL (No Auth Required) - Uses publicPortalRouter
// ============================================================================

publicPortalRouter.get('/:token', async (req: Request, res: Response) => {
  try {
    const result = await contractPipelineService.validateAccessToken(req.params.token);
    
    if (!result.valid) {
      return res.status(401).json({ error: result.error });
    }

    // Record view
    await contractPipelineService.recordView(result.contract!.id, {
      actorType: 'client',
      actorEmail: result.contract!.clientEmail || undefined,
      ipAddress: getClientIP(req),
      userAgent: req.headers['user-agent'],
    });

    res.json({ contract: result.contract });
  } catch (error: unknown) {
    log.error('[ContractPipeline] Portal view error:', error);
    res.status(500).json({ error: sanitizeError(error) || 'Failed to view contract' });
  }
});

publicPortalRouter.post('/:token/accept', async (req: Request, res: Response) => {
  try {
    const result = await contractPipelineService.validateAccessToken(req.params.token);
    if (!result.valid) {
      return res.status(401).json({ error: result.error });
    }

    const contract = await contractPipelineService.acceptProposal(
      result.contract!.id,
      {
        actorType: 'client',
        actorEmail: result.contract!.clientEmail || undefined,
        ipAddress: getClientIP(req),
        userAgent: req.headers['user-agent'],
      }
    );

    res.json({ contract });
  } catch (error: unknown) {
    log.error('[ContractPipeline] Portal accept error:', error);
    res.status(400).json({ error: sanitizeError(error) || 'Failed to accept proposal' });
  }
});

publicPortalRouter.post('/:token/sign', async (req: Request, res: Response) => {
  try {
    const result = await contractPipelineService.validateAccessToken(req.params.token);
    if (!result.valid) {
      return res.status(401).json({ error: result.error });
    }

    const schema = z.object({
      signerName: z.string().min(1),
      signerEmail: z.string().email(),
      signerTitle: z.string().optional(),
      signatureType: z.enum(['typed', 'drawn', 'uploaded']),
      signatureData: z.string().optional(),
      consentText: z.string().min(1),
      geolocation: z.object({
        lat: z.number(),
        lng: z.number(),
        accuracy: z.number(),
      }).optional(),
      timezone: z.string().optional(),
      clientInitials: z.record(z.boolean()).optional(),
      governmentIdData: z.string().optional(),
      governmentIdType: z.string().optional(),
    });

    const input = schema.parse(req.body);
    const { clientInitials, governmentIdData, governmentIdType, ...sigInput } = input;

    // ── S7: pass the access token's bound recipientEmail so canSignerSign
    // can reject cases where a shared/leaked token is used to sign as a
    // different listed signer.
    const signerCheck = await contractPipelineService.canSignerSign(
      result.contract!.id,
      input.signerEmail,
      result.recipientEmail,
    );
    if (!signerCheck.canSign) {
      return res.status(403).json({ error: signerCheck.reason || 'Not allowed to sign at this time' });
    }

    const signature = await contractPipelineService.captureSignature(
      {
        contractId: result.contract!.id,
        signerRole: 'client',
        ...sigInput,
        ipAddress: getClientIP(req),
        userAgent: req.headers['user-agent'] || 'unknown',
      },
      {
        actorType: 'client',
        actorEmail: input.signerEmail,
        ipAddress: getClientIP(req),
        userAgent: req.headers['user-agent'],
      }
    );

    // Store initials + government ID on the contract record
    if (clientInitials || governmentIdData || governmentIdType) {
      try {
        const { db } = await import('../db');
        const { clientContracts } = await import('@shared/schema');
        const { eq } = await import('drizzle-orm');
        await db.update(clientContracts)
          .set({
            ...(clientInitials ? { clientInitials } : {}),
            ...(governmentIdData ? { governmentIdUrl: governmentIdData } : {}),
            ...(governmentIdType ? { governmentIdType } : {}),
          })
          .where(eq(clientContracts.id, result.contract!.id));
      } catch (updateErr) {
        log.error('[ContractPipeline] Failed to store initials/govId:', updateErr);
      }
    }

    res.status(201).json({ signature });
  } catch (error: unknown) {
    log.error('[ContractPipeline] Portal sign error:', error);
    res.status(400).json({ error: sanitizeError(error) || 'Failed to sign contract' });
  }
});

publicPortalRouter.post('/:token/decline', async (req: Request, res: Response) => {
  try {
    const result = await contractPipelineService.validateAccessToken(req.params.token);
    if (!result.valid) {
      return res.status(401).json({ error: result.error });
    }

    const portalDeclineSchema = z.object({ reason: z.string().optional() });
    const portalDeclineParsed = portalDeclineSchema.safeParse(req.body);
    if (!portalDeclineParsed.success) return res.status(400).json({ error: 'Invalid request body', details: portalDeclineParsed.error.issues });
    const { reason } = portalDeclineParsed.data;
    const contract = await contractPipelineService.declineProposal(
      result.contract!.id,
      reason || 'No reason provided',
      {
        actorType: 'client',
        actorEmail: result.contract!.clientEmail || undefined,
        ipAddress: getClientIP(req),
        userAgent: req.headers['user-agent'],
      }
    );

    res.json({ contract });
  } catch (error: unknown) {
    log.error('[ContractPipeline] Portal decline error:', error);
    res.status(400).json({ error: sanitizeError(error) || 'Failed to decline proposal' });
  }
});

publicPortalRouter.post('/:token/request-changes', async (req: Request, res: Response) => {
  try {
    const result = await contractPipelineService.validateAccessToken(req.params.token);
    if (!result.valid) {
      return res.status(401).json({ error: result.error });
    }

    const requestChangesSchema = z.object({ changesRequested: z.string().min(1, 'changesRequested is required') });
    const changesParsed = requestChangesSchema.safeParse(req.body);
    if (!changesParsed.success) return res.status(400).json({ error: 'Invalid request body', details: changesParsed.error.issues });
    const { changesRequested } = changesParsed.data;

    const contract = await contractPipelineService.requestChanges(
      result.contract!.id,
      changesRequested,
      {
        actorType: 'client',
        actorEmail: result.contract!.clientEmail || undefined,
        ipAddress: getClientIP(req),
        userAgent: req.headers['user-agent'],
      }
    );

    res.json({ contract });
  } catch (error: unknown) {
    log.error('[ContractPipeline] Portal request changes error:', error);
    res.status(400).json({ error: sanitizeError(error) || 'Failed to request changes' });
  }
});

export default router;
