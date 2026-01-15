/**
 * Contract Pipeline API Routes
 * =============================
 * REST API for the Contract Lifecycle Pipeline feature.
 * Includes public portal endpoints for client access.
 */

import { Router, Request, Response } from 'express';
import { contractPipelineService } from '../services/contracts/contractPipelineService';
import { z } from 'zod';

const router = Router();

// Public router for portal endpoints (no auth required)
export const publicPortalRouter = Router();

// Middleware types
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
    ipAddress: getClientIP(req),
    userAgent: req.headers['user-agent'],
  };
}

// ============================================================================
// TEMPLATES
// ============================================================================

router.get('/templates', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const workspaceId = req.session?.workspaceId;
    if (!workspaceId) {
      return res.status(401).json({ error: 'Not authenticated' });
    }

    const category = req.query.category as string | undefined;
    const templates = await contractPipelineService.getTemplates(workspaceId, category);
    res.json({ templates });
  } catch (error: any) {
    console.error('[ContractPipeline] Get templates error:', error);
    res.status(500).json({ error: error.message || 'Failed to get templates' });
  }
});

router.post('/templates', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const workspaceId = req.session?.workspaceId;
    const userId = req.session?.userId;
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
  } catch (error: any) {
    console.error('[ContractPipeline] Create template error:', error);
    res.status(400).json({ error: error.message || 'Failed to create template' });
  }
});

router.get('/templates/:id', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const template = await contractPipelineService.getTemplate(req.params.id);
    if (!template) {
      return res.status(404).json({ error: 'Template not found' });
    }
    res.json({ template });
  } catch (error: any) {
    console.error('[ContractPipeline] Get template error:', error);
    res.status(500).json({ error: error.message || 'Failed to get template' });
  }
});

router.patch('/templates/:id', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const template = await contractPipelineService.updateTemplate(req.params.id, req.body);
    if (!template) {
      return res.status(404).json({ error: 'Template not found' });
    }
    res.json({ template });
  } catch (error: any) {
    console.error('[ContractPipeline] Update template error:', error);
    res.status(400).json({ error: error.message || 'Failed to update template' });
  }
});

router.delete('/templates/:id', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const deleted = await contractPipelineService.deleteTemplate(req.params.id);
    if (!deleted) {
      return res.status(404).json({ error: 'Template not found' });
    }
    res.json({ success: true });
  } catch (error: any) {
    console.error('[ContractPipeline] Delete template error:', error);
    res.status(500).json({ error: error.message || 'Failed to delete template' });
  }
});

// ============================================================================
// CONTRACTS (Proposals, Contracts, Amendments)
// ============================================================================

router.get('/contracts', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const workspaceId = req.session?.workspaceId;
    if (!workspaceId) {
      return res.status(401).json({ error: 'Not authenticated' });
    }

    const filters = {
      status: req.query.status as any,
      docType: req.query.docType as any,
      clientId: req.query.clientId as string,
      search: req.query.search as string,
      limit: req.query.limit ? parseInt(req.query.limit as string) : 50,
      offset: req.query.offset ? parseInt(req.query.offset as string) : 0,
    };

    const result = await contractPipelineService.getContracts(workspaceId, filters);
    res.json(result);
  } catch (error: any) {
    console.error('[ContractPipeline] Get contracts error:', error);
    res.status(500).json({ error: error.message || 'Failed to get contracts' });
  }
});

router.post('/contracts', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const workspaceId = req.session?.workspaceId;
    const userId = req.session?.userId;
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
  } catch (error: any) {
    console.error('[ContractPipeline] Create contract error:', error);
    res.status(400).json({ error: error.message || 'Failed to create proposal' });
  }
});

router.get('/contracts/:id', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const contract = await contractPipelineService.getContract(req.params.id);
    if (!contract) {
      return res.status(404).json({ error: 'Contract not found' });
    }
    res.json({ contract });
  } catch (error: any) {
    console.error('[ContractPipeline] Get contract error:', error);
    res.status(500).json({ error: error.message || 'Failed to get contract' });
  }
});

router.patch('/contracts/:id', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const contract = await contractPipelineService.updateContract(
      req.params.id,
      req.body,
      getAuditContext(req)
    );
    if (!contract) {
      return res.status(404).json({ error: 'Contract not found' });
    }
    res.json({ contract });
  } catch (error: any) {
    console.error('[ContractPipeline] Update contract error:', error);
    res.status(400).json({ error: error.message || 'Failed to update contract' });
  }
});

// ============================================================================
// PROPOSAL WORKFLOW
// ============================================================================

router.post('/contracts/:id/send', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const result = await contractPipelineService.sendProposal(
      req.params.id,
      getAuditContext(req)
    );
    res.json(result);
  } catch (error: any) {
    console.error('[ContractPipeline] Send proposal error:', error);
    res.status(400).json({ error: error.message || 'Failed to send proposal' });
  }
});

router.post('/contracts/:id/accept', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const contract = await contractPipelineService.acceptProposal(
      req.params.id,
      getAuditContext(req, 'client')
    );
    res.json({ contract });
  } catch (error: any) {
    console.error('[ContractPipeline] Accept proposal error:', error);
    res.status(400).json({ error: error.message || 'Failed to accept proposal' });
  }
});

router.post('/contracts/:id/request-changes', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { changesRequested } = req.body;
    if (!changesRequested) {
      return res.status(400).json({ error: 'changesRequested is required' });
    }
    const contract = await contractPipelineService.requestChanges(
      req.params.id,
      changesRequested,
      getAuditContext(req, 'client')
    );
    res.json({ contract });
  } catch (error: any) {
    console.error('[ContractPipeline] Request changes error:', error);
    res.status(400).json({ error: error.message || 'Failed to request changes' });
  }
});

router.post('/contracts/:id/decline', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { reason } = req.body;
    const contract = await contractPipelineService.declineProposal(
      req.params.id,
      reason || 'No reason provided',
      getAuditContext(req, 'client')
    );
    res.json({ contract });
  } catch (error: any) {
    console.error('[ContractPipeline] Decline proposal error:', error);
    res.status(400).json({ error: error.message || 'Failed to decline proposal' });
  }
});

// ============================================================================
// SIGNATURES
// ============================================================================

router.get('/contracts/:id/signatures', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const signatures = await contractPipelineService.getSignatures(req.params.id);
    res.json({ signatures });
  } catch (error: any) {
    console.error('[ContractPipeline] Get signatures error:', error);
    res.status(500).json({ error: error.message || 'Failed to get signatures' });
  }
});

router.post('/contracts/:id/sign', async (req: AuthenticatedRequest, res: Response) => {
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
        ipAddress: getClientIP(req),
        userAgent: req.headers['user-agent'] || 'unknown',
      },
      getAuditContext(req, input.signerRole === 'company' ? 'user' : 'client')
    );

    res.status(201).json({ signature });
  } catch (error: any) {
    console.error('[ContractPipeline] Capture signature error:', error);
    res.status(400).json({ error: error.message || 'Failed to capture signature' });
  }
});

// ============================================================================
// AUDIT TRAIL
// ============================================================================

router.get('/contracts/:id/audit', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const auditTrail = await contractPipelineService.getAuditTrail(req.params.id);
    res.json({ auditTrail });
  } catch (error: any) {
    console.error('[ContractPipeline] Get audit trail error:', error);
    res.status(500).json({ error: error.message || 'Failed to get audit trail' });
  }
});

// ============================================================================
// EVIDENCE EXPORT
// ============================================================================

router.get('/contracts/:id/evidence', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const evidencePackage = await contractPipelineService.generateEvidencePackage(req.params.id);
    res.json(evidencePackage);
  } catch (error: any) {
    console.error('[ContractPipeline] Generate evidence error:', error);
    res.status(500).json({ error: error.message || 'Failed to generate evidence package' });
  }
});

router.get('/contracts/:id/verify', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const verification = await contractPipelineService.verifyDocumentIntegrity(req.params.id);
    res.json(verification);
  } catch (error: any) {
    console.error('[ContractPipeline] Verify document error:', error);
    res.status(500).json({ error: error.message || 'Failed to verify document' });
  }
});

// ============================================================================
// USAGE & QUOTA
// ============================================================================

router.get('/usage', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const workspaceId = req.session?.workspaceId;
    if (!workspaceId) {
      return res.status(401).json({ error: 'Not authenticated' });
    }
    const usage = await contractPipelineService.getUsage(workspaceId);
    res.json(usage);
  } catch (error: any) {
    console.error('[ContractPipeline] Get usage error:', error);
    res.status(500).json({ error: error.message || 'Failed to get usage' });
  }
});

router.get('/access', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const workspaceId = req.session?.workspaceId;
    if (!workspaceId) {
      return res.status(401).json({ error: 'Not authenticated' });
    }
    const access = await contractPipelineService.checkAccess(workspaceId);
    res.json(access);
  } catch (error: any) {
    console.error('[ContractPipeline] Check access error:', error);
    res.status(500).json({ error: error.message || 'Failed to check access' });
  }
});

// ============================================================================
// STATISTICS
// ============================================================================

router.get('/stats', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const workspaceId = req.session?.workspaceId;
    if (!workspaceId) {
      return res.status(401).json({ error: 'Not authenticated' });
    }
    const stats = await contractPipelineService.getStatistics(workspaceId);
    res.json(stats);
  } catch (error: any) {
    console.error('[ContractPipeline] Get stats error:', error);
    res.status(500).json({ error: error.message || 'Failed to get statistics' });
  }
});

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
  } catch (error: any) {
    console.error('[ContractPipeline] Portal view error:', error);
    res.status(500).json({ error: error.message || 'Failed to view contract' });
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
  } catch (error: any) {
    console.error('[ContractPipeline] Portal accept error:', error);
    res.status(400).json({ error: error.message || 'Failed to accept proposal' });
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
    });

    const input = schema.parse(req.body);
    const signature = await contractPipelineService.captureSignature(
      {
        contractId: result.contract!.id,
        signerRole: 'client',
        ...input,
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

    res.status(201).json({ signature });
  } catch (error: any) {
    console.error('[ContractPipeline] Portal sign error:', error);
    res.status(400).json({ error: error.message || 'Failed to sign contract' });
  }
});

publicPortalRouter.post('/:token/decline', async (req: Request, res: Response) => {
  try {
    const result = await contractPipelineService.validateAccessToken(req.params.token);
    if (!result.valid) {
      return res.status(401).json({ error: result.error });
    }

    const { reason } = req.body;
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
  } catch (error: any) {
    console.error('[ContractPipeline] Portal decline error:', error);
    res.status(400).json({ error: error.message || 'Failed to decline proposal' });
  }
});

publicPortalRouter.post('/:token/request-changes', async (req: Request, res: Response) => {
  try {
    const result = await contractPipelineService.validateAccessToken(req.params.token);
    if (!result.valid) {
      return res.status(401).json({ error: result.error });
    }

    const { changesRequested } = req.body;
    if (!changesRequested) {
      return res.status(400).json({ error: 'changesRequested is required' });
    }

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
  } catch (error: any) {
    console.error('[ContractPipeline] Portal request changes error:', error);
    res.status(400).json({ error: error.message || 'Failed to request changes' });
  }
});

export default router;
