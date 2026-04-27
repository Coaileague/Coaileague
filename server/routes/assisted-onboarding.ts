/**
 * ASSISTED ONBOARDING ROUTES
 * ==========================
 * API endpoints for support staff to create and manage organizations on behalf of users
 * 
 * Routes:
 * - POST /api/support/assisted-onboarding/create - Create workspace for user
 * - GET /api/support/assisted-onboarding/list - List assisted workspaces
 * - GET /api/support/assisted-onboarding/:id - Get workspace details
 * - POST /api/support/assisted-onboarding/:id/upload-documents - Record document upload
 * - POST /api/support/assisted-onboarding/:id/extract - Start AI extraction
 * - POST /api/support/assisted-onboarding/:id/store-extracted - Store extracted data
 * - POST /api/support/assisted-onboarding/:id/ready - Mark ready for handoff
 * - POST /api/support/assisted-onboarding/:id/handoff - Initiate handoff (send email)
 * - GET /api/accept-handoff/:token - Validate handoff token (public)
 * - POST /api/accept-handoff/:token/complete - Complete handoff (authenticated)
 */

import { Router } from 'express';
import { z } from 'zod';
import { requirePlatformRole } from '../rbac';
import { assistedOnboardingService } from '../services/assistedOnboardingService';
import { db } from '../db';
import { workspaces } from '@shared/schema';
import { eq } from 'drizzle-orm';
import { createLogger } from '../lib/logger';
const log = createLogger('AssistedOnboarding');


export const assistedOnboardingRouter = Router();

const SUPPORT_ROLES = ['support_manager', 'support_agent', 'sysop', 'deputy_admin', 'root_admin'] as const;

const createWorkspaceSchema = z.object({
  targetUserEmail: z.string().email('Invalid email address'),
  targetUserName: z.string().min(1, 'Name is required'),
  targetUserPhone: z.string().optional(),
  workspaceName: z.string().min(1, 'Workspace name is required'),
  notes: z.string().optional(),
  industryData: z.object({
    sectorId: z.string().optional(),
    industryGroupId: z.string().optional(),
    subIndustryId: z.string().optional(),
    customIndustryName: z.string().optional(),
    customIndustryDescription: z.string().optional(),
  }).optional(),
});

const documentUploadSchema = z.object({
  count: z.number().int().positive().default(1),
});

const storeExtractedSchema = z.object({
  extractedData: z.record(z.any()),
  processedCount: z.number().int().positive().default(1),
});

assistedOnboardingRouter.post(
  '/create',
  requirePlatformRole([...SUPPORT_ROLES]),
  async (req: any, res: any) => {
    try {
      const parsed = createWorkspaceSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ 
          error: 'Validation failed', 
          details: parsed.error.flatten() 
        });
      }

      const result = await assistedOnboardingService.createAssistedWorkspace({
        supportUserId: req.user?.id,
        ...parsed.data,
      });

      if (!result.success) {
        return res.status(400).json({ error: result.error });
      }

      res.status(201).json({
        success: true,
        workspaceId: result.workspaceId,
        message: 'Workspace created successfully',
      });
    } catch (error: unknown) {
      log.error('[AssistedOnboarding] Create error:', error);
      res.status(500).json({ error: 'Failed to create workspace' });
    }
  }
);

assistedOnboardingRouter.get(
  '/list',
  requirePlatformRole([...SUPPORT_ROLES]),
  async (req: any, res: any) => {
    try {
      const workspaceList = await assistedOnboardingService.getAssistedWorkspaces(req.user?.id);
      
      res.json({
        success: true,
        workspaces: workspaceList,
        count: workspaceList.length,
      });
    } catch (error: unknown) {
      log.error('[AssistedOnboarding] List error:', error);
      res.status(500).json({ error: 'Failed to list workspaces' });
    }
  }
);

assistedOnboardingRouter.get(
  '/:id',
  requirePlatformRole([...SUPPORT_ROLES]),
  async (req: any, res: any) => {
    try {
      const { id } = req.params;
      
      const workspace = await db.query.workspaces.findFirst({
        where: eq(workspaces.id, id),
        columns: {
          id: true,
          name: true,
          targetUserEmail: true,
          targetUserName: true,
          targetUserPhone: true,
          handoffStatus: true,
          assistedOnboardingBy: true,
          assistedOnboardingAt: true,
          assistedOnboardingNotes: true,
          assistedDocsUploaded: true,
          assistedDocsProcessed: true,
          assistedExtractionStatus: true,
          assistedDataExtracted: true,
          handoffSentAt: true,
          handoffTokenExpiry: true,
          createdAt: true,
        },
      });

      if (!workspace) {
        return res.status(404).json({ error: 'Workspace not found' });
      }

      res.json({
        success: true,
        workspace,
      });
    } catch (error: unknown) {
      log.error('[AssistedOnboarding] Get error:', error);
      res.status(500).json({ error: 'Failed to get workspace' });
    }
  }
);

assistedOnboardingRouter.post(
  '/:id/upload-documents',
  requirePlatformRole([...SUPPORT_ROLES]),
  async (req: any, res: any) => {
    try {
      const { id } = req.params;
      const parsed = documentUploadSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ error: 'Invalid count' });
      }

      const success = await assistedOnboardingService.recordDocumentUpload(id, parsed.data.count);
      
      if (!success) {
        return res.status(404).json({ error: 'Workspace not found' });
      }

      res.json({
        success: true,
        message: `Recorded ${parsed.data.count} document(s) uploaded`,
      });
    } catch (error: unknown) {
      log.error('[AssistedOnboarding] Upload error:', error);
      res.status(500).json({ error: 'Failed to record document upload' });
    }
  }
);

assistedOnboardingRouter.post(
  '/:id/extract',
  requirePlatformRole([...SUPPORT_ROLES]),
  async (req: any, res: any) => {
    try {
      const { id } = req.params;
      
      const result = await assistedOnboardingService.startExtraction(id);
      
      if (!result.success) {
        return res.status(400).json({ error: result.error });
      }

      res.json({
        success: true,
        status: result.status,
        message: 'Extraction started',
      });
    } catch (error: unknown) {
      log.error('[AssistedOnboarding] Extract error:', error);
      res.status(500).json({ error: 'Failed to start extraction' });
    }
  }
);

assistedOnboardingRouter.post(
  '/:id/store-extracted',
  requirePlatformRole([...SUPPORT_ROLES]),
  async (req: any, res: any) => {
    try {
      const { id } = req.params;
      const parsed = storeExtractedSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ 
          error: 'Validation failed', 
          details: parsed.error.flatten() 
        });
      }

      const result = await assistedOnboardingService.storeExtractedData(
        id,
        parsed.data.extractedData,
        parsed.data.processedCount
      );
      
      if (!result.success) {
        return res.status(400).json({ error: result.error });
      }

      res.json({
        success: true,
        status: result.status,
        extractedData: result.extractedData,
      });
    } catch (error: unknown) {
      log.error('[AssistedOnboarding] Store extracted error:', error);
      res.status(500).json({ error: 'Failed to store extracted data' });
    }
  }
);

assistedOnboardingRouter.post(
  '/:id/ready',
  requirePlatformRole([...SUPPORT_ROLES]),
  async (req: any, res: any) => {
    try {
      const { id } = req.params;
      
      const success = await assistedOnboardingService.markReadyForHandoff(id);
      
      if (!success) {
        return res.status(404).json({ error: 'Workspace not found or update failed' });
      }

      res.json({
        success: true,
        message: 'Workspace marked ready for handoff',
      });
    } catch (error: unknown) {
      log.error('[AssistedOnboarding] Ready error:', error);
      res.status(500).json({ error: 'Failed to mark ready' });
    }
  }
);

assistedOnboardingRouter.post(
  '/:id/handoff',
  requirePlatformRole([...SUPPORT_ROLES]),
  async (req: any, res: any) => {
    try {
      const { id } = req.params;
      
      const result = await assistedOnboardingService.initiateHandoff(id);
      
      if (!result.success) {
        return res.status(400).json({ error: result.error });
      }

      res.json({
        success: true,
        message: 'Handoff initiated - email sent to target user',
        expiresAt: result.expiresAt,
      });
    } catch (error: unknown) {
      log.error('[AssistedOnboarding] Handoff error:', error);
      res.status(500).json({ error: 'Failed to initiate handoff' });
    }
  }
);

export const acceptHandoffRouter = Router();

acceptHandoffRouter.get(
  '/:token',
  async (req: any, res: any) => {
    try {
      const { token } = req.params;
      
      const result = await assistedOnboardingService.getWorkspaceByToken(token);
      
      if (!result.valid) {
        return res.status(400).json({ 
          valid: false, 
          error: result.error 
        });
      }

      res.json({
        valid: true,
        workspace: result.workspace,
      });
    } catch (error: unknown) {
      log.error('[AssistedOnboarding] Validate token error:', error);
      res.status(500).json({ valid: false, error: 'Failed to validate token' });
    }
  }
);

acceptHandoffRouter.post(
  '/:token/complete',
  async (req: any, res: any) => {
    try {
      const { token } = req.params;
      
      if (!req.user?.id) {
        return res.status(401).json({ error: 'Authentication required to complete handoff' });
      }

      const result = await assistedOnboardingService.completeHandoff(token, req.user?.id);
      
      if (!result.success) {
        return res.status(400).json({ error: result.error });
      }

      res.json({
        success: true,
        workspaceId: result.workspaceId,
        workspaceName: result.workspaceName,
        message: 'Handoff complete - you are now the owner of this workspace',
        redirectTo: '/onboarding/email-intro',
      });
    } catch (error: unknown) {
      log.error('[AssistedOnboarding] Complete handoff error:', error);
      res.status(500).json({ error: 'Failed to complete handoff' });
    }
  }
);
