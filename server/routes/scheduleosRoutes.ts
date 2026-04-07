import { sanitizeError } from '../middleware/errorHandler';
import { Router } from "express";
import crypto from 'crypto';
import { storage } from "../storage";
import { db } from "../db";
import { requireAuth } from "../auth";
import { requireManager, resolveWorkspaceForUser, type AuthenticatedRequest } from "../rbac";
import { requireStarter, requireProfessional } from "../tierGuards";
import { calculateInvoiceLineItem, calculateInvoiceTotal, applyTax, addFinancialValues, divideFinancialValues, toFinancialString } from '../services/financialCalculator';
import {
  workspaces,
  smartScheduleUsage,
  shifts,
  stagedShifts,
  employees,
  users,
  platformRoles,
} from "@shared/schema";
import { creditManager } from '../services/billing/creditManager';
import { sql, eq, and, or, isNull, isNotNull, inArray, desc, gte, lte } from "drizzle-orm";
import { z } from "zod";
import { stripe } from "../routes";
import * as notificationHelpers from "../notifications";
import { createLogger } from '../lib/logger';
const log = createLogger('ScheduleosRoutes');


const router = Router();

router.post('/ai/toggle', requireManager, async (req: AuthenticatedRequest, res) => {
    try {
      const { enabled, workspaceId } = req.body;
      const userId = req.user?.id || req.user?.claims?.sub;
      
      if (!workspaceId) {
        return res.status(400).json({ message: "workspaceId is required" });
      }

      // SECURITY: Enforce workspace ownership — user may only toggle AI for their own workspace.
      // requireManager validates manager role in the session workspace, not in an arbitrary workspaceId.
      const sessionWorkspaceId = req.user?.currentWorkspaceId;
      if (workspaceId !== sessionWorkspaceId) {
        return res.status(403).json({ message: "Access denied: cannot modify another workspace" });
      }
      
      const workspace = await storage.getWorkspace(workspaceId);
      if (!workspace) {
        return res.status(404).json({ message: "Workspace not found" });
      }
      
      const priorEnabled = workspace.featureScheduleosEnabled ?? false;
      
      const { billingAuditLog } = await import("@shared/schema");
      await db.transaction(async (tx) => {
        const activationTimestamp = enabled ? new Date() : null;
        await tx.update(workspaces).set({
          featureScheduleosEnabled: enabled,
          scheduleosActivatedAt: enabled ? activationTimestamp : null,
          scheduleosActivatedBy: enabled ? userId : null,
        }).where(eq(workspaces.id, workspaceId));
        
        await tx.insert(billingAuditLog).values({
          workspaceId,
          eventType: 'feature_toggled',
          eventCategory: 'feature',
          actorType: 'user',
          actorId: userId,
          description: `${enabled ? 'Enabled' : 'Disabled'} SmartSchedule AI automation`,
          relatedEntityType: 'feature',
          relatedEntityId: 'scheduleos_ai',
          previousState: { enabled: priorEnabled },
          newState: { enabled },
          metadata: {
            feature: 'scheduleos_ai',
            workspaceName: workspace.name,
            activatedAt: activationTimestamp,
            priorActivatedAt: workspace.scheduleosActivatedAt,
            priorActivatedBy: workspace.scheduleosActivatedBy,
          },
        });
      });
      
      res.json({ success: true, enabled, message: `SmartSchedule AI ${enabled ? 'enabled' : 'disabled'}`, workspaceId, workspaceName: workspace.name });
    } catch (error: unknown) {
      log.error("Error toggling SmartSchedule AI:", error);
      res.status(500).json({ message: "Failed to toggle AI" });
    }
  });

  router.post('/ai/trigger-session', requireManager, async (req: AuthenticatedRequest, res) => {
    try {
      const { workspaceId, mode = 'fill_gaps' } = req.body;
      const userId = req.user?.id || req.user?.claims?.sub;
      
      if (!workspaceId) {
        return res.status(400).json({ message: "workspaceId is required" });
      }
      
      const validModes = ['optimize', 'fill_gaps', 'full_generate'];
      if (!validModes.includes(mode)) {
        return res.status(400).json({ message: "Invalid mode. Must be one of: optimize, fill_gaps, full_generate" });
      }
      
      const workspace = await storage.getWorkspace(workspaceId);
      if (!workspace) {
        return res.status(404).json({ message: "Workspace not found" });
      }
      
      const { resolveWorkspaceForUser } = await import('../rbac');
      const { role, error: rbacError } = await resolveWorkspaceForUser(userId, workspaceId);
      if (rbacError || !role) {
        return res.status(403).json({ message: "You do not have access to this workspace" });
      }
      if (!['org_owner', 'co_owner', 'manager'].includes(role)) {
        return res.status(403).json({ message: "Only organization owners, admins, and managers can trigger autonomous scheduling" });
      }
      const { trinitySchedulingOrchestrator } = await import('../services/orchestration/trinitySchedulingOrchestrator');
      
      
      const result = await trinitySchedulingOrchestrator.startSchedulingSession({
        workspaceId,
        triggeredBy: userId || 'system',
        mode: mode as 'optimize' | 'fill_gaps' | 'full_generate',
      });
      
      res.json({
        success: true,
        sessionId: result.sessionId,
        executionId: result.executionId,
        totalMutations: result.totalMutations,
        summary: result.summary,
        aiSummary: result.aiSummary,
        requiresVerification: result.requiresVerification,
        verificationDeadline: result.verificationDeadline,
      });
    } catch (error: unknown) {
      log.error("Error triggering Trinity scheduling session:", error);
      res.status(500).json({ message: sanitizeError(error) || "Failed to start scheduling session" });
    }
  });
  
  router.get('/ai/status', requireAuth, async (req: any, res) => {
    try {
      const { workspaceId } = req.query;
      if (!workspaceId) return res.status(400).json({ message: "workspaceId query parameter is required" });

      // SECURITY: Enforce workspace scoping — user may only read status for their own workspace.
      const sessionWorkspaceId = req.user?.currentWorkspaceId;
      if ((workspaceId as string) !== sessionWorkspaceId) {
        return res.status(403).json({ message: "Access denied: cannot read another workspace" });
      }
      
      const workspace = await storage.getWorkspace(workspaceId as string);
      if (!workspace) return res.status(404).json({ message: "Workspace not found" });
      
      const enabled = workspace.featureScheduleosEnabled ?? false;
      
      res.json({ enabled, workspaceId, workspaceName: workspace.name });
    } catch (error: unknown) {
      res.status(500).json({ message: "Failed to get AI status" });
    }
  });
  
  router.post('/smart-generate', requireManager, requireStarter, async (req: any, res) => {
    try {
      const userId = req.user?.id || req.user?.claims?.sub;
      const userWorkspace = await storage.getWorkspaceMemberByUserId(userId);
      if (!userWorkspace) return res.status(404).json({ message: "Workspace not found" });
      const workspace = await storage.getWorkspace(userWorkspace.workspaceId);
      if (!workspace) return res.status(404).json({ message: "Workspace not found" });
      
      const aiEnabled = workspace.featureScheduleosEnabled ?? false;
      if (!aiEnabled) return res.status(403).json({ message: "SmartSchedule AI is disabled" });

      const hasSmartScheduleAccess = 
        workspace.subscriptionTier === 'professional' || 
        workspace.subscriptionTier === 'enterprise' ||
        workspace.enabledAddons?.includes('smart_schedule_ai');

      if (!hasSmartScheduleAccess) {
        return res.status(402).json({ 
          message: "Smart Schedule AI requires Professional/Enterprise tier or à la carte add-on",
          requiresUpgrade: true,
          currentTier: workspace.subscriptionTier,
          upgradeOptions: ['professional', 'enterprise', 'addon:smart_schedule_ai']
        });
      }

      if (workspace.subscriptionStatus !== 'active') {
        return res.status(402).json({ 
          message: "Active subscription required. Please update payment method or add prepay balance.",
          requiresPayment: true,
          subscriptionStatus: workspace.subscriptionStatus
        });
      }
      
      const { openShiftIds, constraints } = req.body;
      if (!openShiftIds || !Array.isArray(openShiftIds) || openShiftIds.length === 0) {
        return res.status(400).json({ message: "openShiftIds array is required" });
      }
      
      const openShifts = await db.select().from(shifts).where(
        and(
          eq(shifts.workspaceId, workspace.id),
          inArray(shifts.id, openShiftIds),
          isNull(shifts.employeeId)
        )
      );
      
      if (openShifts.length === 0) {
        return res.status(404).json({ message: "No open shifts found" });
      }
      
      const availableEmployees = await db.select().from(employees).where(
        eq(employees.workspaceId, workspace.id)
      );
      
      const { scheduleSmartAI } = await import("../services/scheduleSmartAI");
      const aiResponse = await scheduleSmartAI({
        openShifts,
        availableEmployees,
        workspaceId: workspace.id,
        userId,
        constraints,
      });
      
      const { scheduleProposals } = await import("@shared/schema");
      
      if (aiResponse.overallConfidence >= 95) {
        const shiftIdsCreated: string[] = [];
        
        await db.transaction(async (tx) => {
          for (const assignment of aiResponse.assignments) {
            await tx.update(shifts).set({
              employeeId: assignment.employeeId,
              status: 'scheduled',
              updatedAt: new Date(),
            }).where(eq(shifts.id, assignment.shiftId));
            shiftIdsCreated.push(assignment.shiftId);
          }
          
          const [proposal] = await tx.insert(scheduleProposals).values({
            workspaceId: workspace.id,
            createdBy: userId,
            aiResponse: aiResponse as any,
            confidence: aiResponse.overallConfidence,
            status: 'auto_approved',
            approvedBy: userId,
            approvedAt: new Date(),
            disclaimerAcknowledged: true,
            shiftIdsCreated,
          }).returning();
          
          
          res.json({
            applied: true,
            proposalId: proposal.id,
            confidence: aiResponse.overallConfidence,
            assignmentsApplied: aiResponse.assignments.length,
            summary: aiResponse.summary,
            message: `AI auto-approved schedule with ${aiResponse.overallConfidence}% confidence. ${shiftIdsCreated.length} shifts assigned.`,
          });
        });
      } else {
        const [proposal] = await db.insert(scheduleProposals).values({
          workspaceId: workspace.id,
          createdBy: userId,
          aiResponse: aiResponse as any,
          confidence: aiResponse.overallConfidence,
          status: 'pending',
        }).returning();
        
        
        res.json({
          applied: false,
          proposalId: proposal.id,
          needsApproval: true,
          confidence: aiResponse.overallConfidence,
          assignmentsProposed: aiResponse.assignments.length,
          summary: aiResponse.summary,
          confidenceFactors: aiResponse.confidenceFactors,
          message: `AI schedule requires human approval (${aiResponse.overallConfidence}% confidence). Review proposal to continue.`,
        });
      }
    } catch (error: unknown) {
      log.error("AI Scheduling™ Smart Generate Error:", error);
      res.status(500).json({ message: sanitizeError(error) || "Failed to generate schedule" });
    }
  });
  
  router.get('/proposals', requireManager, async (req: any, res) => {
    try {
      const userId = req.user?.id || req.user?.claims?.sub;
      const userWorkspace = await storage.getWorkspaceMemberByUserId(userId);
      if (!userWorkspace) return res.status(404).json({ message: "Workspace not found" });
      
      const { scheduleProposals } = await import("@shared/schema");
      
      const page = Math.max(1, parseInt(req.query.page as string) || 1);
      const limit = Math.min(100, Math.max(1, parseInt(req.query.limit as string) || 25));
      const offset = (page - 1) * limit;

      const rawProposals = await db.select().from(scheduleProposals)
        .where(eq(scheduleProposals.workspaceId, userWorkspace.workspaceId))
        .orderBy(desc(scheduleProposals.id))
        .limit(limit)
        .offset(offset);
      
      const proposals = rawProposals.map(p => {
        const aiResp = p.aiResponse as any;
        
        let weekStart: Date | null = null;
        let weekEnd: Date | null = null;
        
        try {
          const firstShift = aiResp?.assignments?.[0]?.shifts?.[0];
          if (firstShift?.startTime) {
            weekStart = new Date(firstShift.startTime);
            weekEnd = new Date(weekStart);
            weekEnd.setDate(weekEnd.getDate() + 6);
          }
        } catch (e) {
          log.warn('Failed to extract week dates from proposal:', p.id);
        }
        
        if (!weekStart) {
          weekStart = p.createdAt ? new Date(p.createdAt) : new Date();
          weekEnd = new Date(weekStart);
          weekEnd.setDate(weekEnd.getDate() + 6);
        }
        
        return {
          ...p,
          weekStartDate: weekStart.toISOString(),
          weekEndDate: (weekEnd as Date).toISOString(),
        };
      });
      
      res.json(proposals);
    } catch (error: unknown) {
      log.error("Error fetching schedule proposals:", error);
      res.status(500).json({ message: sanitizeError(error) || "Failed to fetch proposals" });
    }
  });
  
  router.get('/proposals/:id', requireAuth, async (req: any, res) => {
    try {
      const { id } = req.params;
      const userId = req.user?.id || req.user?.claims?.sub;
      const userWorkspace = await storage.getWorkspaceMemberByUserId(userId);
      if (!userWorkspace) return res.status(404).json({ message: "Workspace not found" });
      
      const { scheduleProposals } = await import("@shared/schema");
      const [proposal] = await db.select().from(scheduleProposals).where(
        and(
          eq(scheduleProposals.id, id),
          eq(scheduleProposals.workspaceId, userWorkspace.workspaceId)
        )
      ).limit(1);
      
      if (!proposal) {
        return res.status(404).json({ message: "Proposal not found" });
      }
      
      res.json(proposal);
    } catch (error: unknown) {
      res.status(500).json({ message: sanitizeError(error) || "Failed to fetch proposal" });
    }
  });
  
  router.patch('/proposals/:id/approve', requireManager, async (req: any, res) => {
    try {
      const { id } = req.params;
      const { disclaimerAcknowledged } = req.body;
      const userId = req.user?.id || req.user?.claims?.sub;
      const userWorkspace = await storage.getWorkspaceMemberByUserId(userId);
      if (!userWorkspace) return res.status(404).json({ message: "Workspace not found" });
      
      const { scheduleProposals } = await import("@shared/schema");
      const [proposal] = await db.select().from(scheduleProposals).where(
        and(
          eq(scheduleProposals.id, id),
          eq(scheduleProposals.workspaceId, userWorkspace.workspaceId),
          eq(scheduleProposals.status, 'pending')
        )
      ).limit(1);
      
      if (!proposal) {
        return res.status(404).json({ message: "Proposal not found or already processed" });
      }
      
      if (proposal.confidence < 100 && !disclaimerAcknowledged) {
        return res.status(400).json({ message: "Legal disclaimer must be acknowledged for proposals with <100% confidence" });
      }
      
      const aiResponse = proposal.aiResponse as any;
      const shiftIdsCreated: string[] = [];
      
      await db.transaction(async (tx) => {
        for (const assignment of aiResponse.assignments) {
          await tx.update(shifts).set({
            employeeId: assignment.employeeId,
            status: 'scheduled',
            updatedAt: new Date(),
          }).where(eq(shifts.id, assignment.shiftId));
          shiftIdsCreated.push(assignment.shiftId);
        }
        
        await tx.update(scheduleProposals).set({
          status: 'approved',
          approvedBy: userId,
          approvedAt: new Date(),
          disclaimerAcknowledged: disclaimerAcknowledged || false,
          disclaimerAcknowledgedBy: disclaimerAcknowledged ? userId : null,
          disclaimerAcknowledgedAt: disclaimerAcknowledged ? new Date() : null,
          shiftIdsCreated,
          updatedAt: new Date(),
        }).where(eq(scheduleProposals.id, id));
        
        
        res.json({
          success: true,
          proposalId: id,
          shiftsCreated: shiftIdsCreated.length,
          message: `Schedule approved. ${shiftIdsCreated.length} shifts assigned to employees.`,
        });
      });
    } catch (error: unknown) {
      log.error("AI Scheduling™ Approval Error:", error);
      res.status(500).json({ message: sanitizeError(error) || "Failed to approve proposal" });
    }
  });
  
  router.patch('/proposals/:id/reject', requireManager, async (req: any, res) => {
    try {
      const { id } = req.params;
      const { reason } = req.body;
      const userId = req.user?.id || req.user?.claims?.sub;
      const userWorkspace = await storage.getWorkspaceMemberByUserId(userId);
      if (!userWorkspace) return res.status(404).json({ message: "Workspace not found" });
      
      const { scheduleProposals } = await import("@shared/schema");
      const [proposal] = await db.select().from(scheduleProposals).where(
        and(
          eq(scheduleProposals.id, id),
          eq(scheduleProposals.workspaceId, userWorkspace.workspaceId),
          eq(scheduleProposals.status, 'pending')
        )
      ).limit(1);
      
      if (!proposal) {
        return res.status(404).json({ message: "Proposal not found or already processed" });
      }
      
      await db.update(scheduleProposals).set({
        status: 'rejected',
        rejectedBy: userId,
        rejectedAt: new Date(),
        rejectionReason: reason || 'No reason provided',
        updatedAt: new Date(),
      }).where(eq(scheduleProposals.id, id));
      
      
      res.json({
        success: true,
        proposalId: id,
        message: 'Schedule proposal rejected. No shifts were modified.',
      });
    } catch (error: unknown) {
      res.status(500).json({ message: sanitizeError(error) || "Failed to reject proposal" });
    }
  });
  
  router.post('/migrate-schedule', requireManager, async (req: any, res) => {
    try {
      const { fileData, mimeType, sourceApp } = req.body;

      if (!fileData || !mimeType) {
        return res.status(400).json({ message: "fileData and mimeType are required" });
      }

      const allowedTypes = ['image/png', 'image/jpeg', 'application/pdf'];
      if (!allowedTypes.includes(mimeType)) {
        return res.status(400).json({ message: "Unsupported file type. Use PNG, JPEG, or PDF" });
      }

      const authReq = req as AuthenticatedRequest;
      const userId = authReq.user?.id;
      
      if (!userId) {
        return res.status(401).json({ message: 'Unauthorized' });
      }
      // M09: Workspace resolved from auth-middleware to prevent workspace confusion
      const { workspaceId } = await resolveWorkspaceForUser(userId, req.workspaceId);

      if (!workspaceId) {
        return res.status(400).json({ message: 'Could not resolve workspace' });
      }

      const { extractScheduleFromFile } = await import('../services/scheduleMigration');

      const migrationResult = await extractScheduleFromFile({
        fileData,
        mimeType,
        sourceApp,
        workspaceId,
        userId,
      });

      res.json(migrationResult);
    } catch (error: unknown) {
      log.error("Schedule migration error:", error);
      res.status(500).json({ message: sanitizeError(error) || "Failed to migrate schedule" });
    }
  });

  router.post('/import-migrated-shifts', requireManager, async (req: any, res) => {
    try {
      const { extractedShifts, sourceApp } = req.body;

      if (!Array.isArray(extractedShifts) || extractedShifts.length === 0) {
        return res.status(400).json({ message: "extractedShifts array is required" });
      }

      const authReq = req as AuthenticatedRequest;
      const userId = authReq.user?.id;
      
      if (!userId) {
        return res.status(401).json({ message: 'Unauthorized' });
      }
      // M10: Workspace resolved from auth-middleware to prevent workspace confusion
      const { workspaceId } = await resolveWorkspaceForUser(userId, req.workspaceId);

      if (!workspaceId) {
        return res.status(400).json({ message: 'Could not resolve workspace' });
      }

      const { shifts } = await import('@shared/schema');
      const { extractedShiftSchema } = await import('../services/scheduleMigration');

      const validatedShifts = [];
      const errors = [];

      for (let i = 0; i < extractedShifts.length; i++) {
        const extracted = extractedShifts[i];
        
        try {
          extractedShiftSchema.parse(extracted);
          
          const startDateTime = new Date(`${extracted.startDate}T${extracted.startTime}`);
          const endDateTime = new Date(`${extracted.endDate}T${extracted.endTime}`);
          
          if (isNaN(startDateTime.getTime()) || isNaN(endDateTime.getTime())) {
            errors.push(`Shift ${i + 1}: Invalid date/time format`);
            continue;
          }
          
          if (endDateTime <= startDateTime) {
            errors.push(`Shift ${i + 1}: End time must be after start time`);
            continue;
          }

          validatedShifts.push({
            workspaceId,
            title: extracted.position || extracted.employeeName || 'Imported Shift',
            description: `Migrated from ${sourceApp || 'external app'}${extracted.notes ? ` - ${extracted.notes}` : ''}\nEmployee: ${extracted.employeeName}${extracted.location ? `\nLocation: ${extracted.location}` : ''}`,
            startTime: startDateTime,
            endTime: endDateTime,
            status: 'draft' as const,
            aiGenerated: false,
          });
        } catch (validationError: unknown) {
          errors.push(`Shift ${i + 1}: ${validationError.message}`);
        }
      }

      if (validatedShifts.length === 0) {
        return res.status(400).json({ 
          message: "No valid shifts to import",
          errors,
        });
      }

      const createdShifts = await db.insert(shifts).values(validatedShifts).returning();


      res.json({
        success: true,
        shiftsCreated: createdShifts.length,
        shiftsTotal: extractedShifts.length,
        shifts: createdShifts,
        errors: errors.length > 0 ? errors : undefined,
      });
    } catch (error: unknown) {
      log.error("Shift import error:", error);
      res.status(500).json({ message: sanitizeError(error) || "Failed to import shifts" });
    }
  });
  
  router.post('/request-service', requireManager, async (req: any, res) => {
    try {
      const userId = req.user?.id || req.user?.claims?.sub;
      const userWorkspace = await storage.getWorkspaceMemberByUserId(userId);
      if (!userWorkspace) return res.status(404).json({ message: "Workspace not found" });
      const workspace = await storage.getWorkspace(userWorkspace.workspaceId);
      if (!workspace) return res.status(404).json({ message: "Workspace not found" });
      
      const aiEnabled = workspace.featureScheduleosEnabled ?? false;
      if (!aiEnabled) return res.status(403).json({ message: "SmartSchedule AI is disabled" });
      
      const serviceCoverageBodySchema = z.object({
        startTime: z.string().min(1, 'Start time is required'),
        endTime: z.string().min(1, 'End time is required'),
        title: z.string().min(1, 'Title is required'),
        clientId: z.string().optional(),
        numberOfEmployeesNeeded: z.number().int().positive().optional(),
        requiredSkills: z.array(z.string()).optional(),
        jobSiteAddress: z.string().optional(),
        jobSiteCity: z.string().optional(),
        jobSiteState: z.string().optional(),
        jobSiteZipCode: z.string().optional(),
        jobSiteLatitude: z.number().optional(),
        jobSiteLongitude: z.number().optional(),
        requiredCertifications: z.array(z.string()).optional(),
        description: z.string().optional(),
      });
      const serviceCoverageParsed = serviceCoverageBodySchema.safeParse(req.body);
      if (!serviceCoverageParsed.success) {
        return res.status(400).json({ error: 'Invalid request', details: serviceCoverageParsed.error.flatten() });
      }
      const scData = serviceCoverageParsed.data;

      const { serviceCoverageRequests, workspaceAiUsage } = await import("@shared/schema");
      const count = await db.select({ count: sql<number>`count(*)` }).from(serviceCoverageRequests).where(eq(serviceCoverageRequests.workspaceId, workspace.id));
      const requestNumber = `REQ-${new Date().getFullYear()}-${String(count[0].count + 1).padStart(3, '0')}`;
      
      const { startTime, endTime, title, clientId, numberOfEmployeesNeeded, requiredSkills, jobSiteAddress, jobSiteCity, jobSiteState, jobSiteZipCode, jobSiteLatitude, jobSiteLongitude, requiredCertifications, description } = scData;
      const safeValues: Record<string, any> = { workspaceId: workspace.id, requestNumber, requestedBy: userId, status: 'processing' };
      if (startTime !== undefined) safeValues.startTime = new Date(startTime);
      if (endTime !== undefined) safeValues.endTime = new Date(endTime);
      if (title !== undefined) safeValues.title = title;
      if (clientId !== undefined) safeValues.clientId = clientId;
      if (numberOfEmployeesNeeded !== undefined) safeValues.numberOfEmployeesNeeded = numberOfEmployeesNeeded;
      if (requiredSkills !== undefined) safeValues.requiredSkills = requiredSkills;
      if (jobSiteAddress !== undefined) safeValues.jobSiteAddress = jobSiteAddress;
      if (jobSiteCity !== undefined) safeValues.jobSiteCity = jobSiteCity;
      if (jobSiteState !== undefined) safeValues.jobSiteState = jobSiteState;
      if (jobSiteZipCode !== undefined) safeValues.jobSiteZipCode = jobSiteZipCode;
      if (jobSiteLatitude !== undefined) safeValues.jobSiteLatitude = jobSiteLatitude;
      if (jobSiteLongitude !== undefined) safeValues.jobSiteLongitude = jobSiteLongitude;
      if (requiredCertifications !== undefined) safeValues.requiredCertifications = requiredCertifications;
      if (description !== undefined) safeValues.description = description;
      const [request] = await db.insert(serviceCoverageRequests).values(safeValues as any).returning();
      
      const { SchedulingAI } = await import("../ai/scheduleos");
      const result = await (new SchedulingAI()).generateSchedule({ workspaceId: workspace.id, weekStartDate: new Date(scData.startTime), clientIds: scData.clientId ? [scData.clientId] : [], shiftRequirements: [{ title: scData.title || '', clientId: scData.clientId || '', startTime: new Date(scData.startTime), endTime: new Date(scData.endTime), requiredEmployees: scData.numberOfEmployeesNeeded || 1, requiredSkills: scData.requiredSkills }] });
      
      const tokens = 1500 + (result.shiftsGenerated * 40);
      const cost = (tokens / 1000) * 0.045 * 4;
      const [log] = await db.insert(workspaceAiUsage).values({ workspaceId: workspace.id, feature: 'smart_schedule_ai', operation: 'find_coverage', requestId: requestNumber, tokensUsed: tokens, model: 'gpt-4', providerCostUsd: ((tokens/1000)*0.045).toFixed(6), markupPercentage: "300", clientChargeUsd: cost.toFixed(6), status: 'pending', billingPeriod: new Date().toISOString().slice(0,7), inputData: req.body, outputData: { matchesFound: result.shiftsGenerated } }).returning();
      
      await db.update(serviceCoverageRequests).set({ aiProcessed: true, aiProcessedAt: new Date(), aiSuggestedEmployees: result.generatedShifts.map((s: any) => ({ employeeId: s.employeeId, employeeName: s.employeeName, confidenceScore: s.aiConfidenceScore })), aiConfidenceScore: "0.85", status: 'matched', aiUsageLogId: log.id }).where(eq(serviceCoverageRequests.id, request.id));
      
      res.json({ request: { ...request, requestNumber }, matches: result.generatedShifts, billing: { aiUsageId: log.id, tokensUsed: tokens, costUsd: parseFloat(cost.toFixed(2)) } });
    } catch (error: unknown) {
      res.status(500).json({ message: sanitizeError(error) || "Failed to find coverage" });
    }
  });

  router.post('/start-trial', requireAuth, async (req: any, res) => {
    try {
      const userId = req.user?.id || req.user?.claims?.sub;
      const workspace = await storage.getWorkspaceByOwnerId(userId) || await storage.getWorkspaceByMembership(userId);
      
      if (!workspace) {
        return res.status(404).json({ message: "Workspace not found" });
      }

      if (workspace.scheduleosTrialStartedAt) {
        const trialStart = new Date(workspace.scheduleosTrialStartedAt);
        const trialEnd = new Date(trialStart.getTime() + 7 * 24 * 60 * 60 * 1000);
        const now = new Date();
        const daysLeft = Math.ceil((trialEnd.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
        
        return res.json({
          alreadyStarted: true,
          trialStartedAt: workspace.scheduleosTrialStartedAt,
          trialEndsAt: trialEnd,
          daysLeft: Math.max(0, daysLeft),
          isActive: workspace.scheduleosActivatedAt ? true : (daysLeft > 0),
        });
      }

      await storage.updateWorkspace(workspace.id, {
        scheduleosTrialStartedAt: new Date(),
      });

      res.json({
        success: true,
        message: "AI Scheduling™ 7-day free trial activated!",
        trialStartedAt: new Date(),
        trialEndsAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
        daysLeft: 7,
      });
    } catch (error: unknown) {
      log.error("Error starting AI Scheduling™ trial:", error);
      res.status(500).json({ message: "Failed to start trial" });
    }
  });

  router.post('/payment-intent', requireManager, async (req: any, res) => {
    try {
      const userId = req.user?.id || req.user?.claims?.sub;
      
      const employee = await storage.getEmployeeByUserId(userId);
      if (!employee) {
        return res.status(404).json({ message: "Employee not found" });
      }

      const [workspace] = await db.select()
        .from(workspaces)
        .where(eq(workspaces.id, employee.workspaceId))
        .limit(1);

      if (!workspace) {
        return res.status(404).json({ message: "Workspace not found" });
      }

      if (workspace.scheduleosActivatedAt) {
        return res.status(400).json({
          error: "Scheduling already activated",
          alreadyActivated: true,
          activatedAt: workspace.scheduleosActivatedAt,
        });
      }

      if (!stripe) {
        return res.status(500).json({ error: "Payment processing is not configured" });
      }

      const SCHEDULEOS_ACTIVATION_FEE = 9900;

      if (workspace.scheduleosPaymentIntentId) {
        try {
          const existingIntent = await stripe.paymentIntents.retrieve(
            workspace.scheduleosPaymentIntentId
          );
          
          if (existingIntent.status === 'succeeded') {
            return res.json({
              alreadyPaid: true,
              clientSecret: existingIntent.client_secret,
              paymentIntentId: existingIntent.id,
              amount: SCHEDULEOS_ACTIVATION_FEE,
              status: existingIntent.status,
            });
          }
          
          await storage.updateWorkspace(workspace.id, {
            scheduleosPaymentIntentId: null,
          });
        } catch (stripeError: unknown) {
          await storage.updateWorkspace(workspace.id, {
            scheduleosPaymentIntentId: null,
          });
        }
      }

      let customerId = workspace.stripeCustomerId;
      if (!customerId) {
        const { subscriptionManager } = await import('../services/billing/subscriptionManager');
        customerId = await subscriptionManager.ensureStripeCustomer(workspace.id);
      }

      const paymentIntent = await stripe.paymentIntents.create({
        automatic_payment_methods: { enabled: true },
        amount: SCHEDULEOS_ACTIVATION_FEE,
        currency: 'usd',
        customer: customerId,
        metadata: {
          workspaceId: workspace.id,
          userId: userId,
          purpose: 'scheduleos_activation',
          createdAt: new Date().toISOString(),
        },
        description: 'Scheduling Activation - One-time payment',
      }, { idempotencyKey: `pi-scheduleos-${workspace.id}` });


      await storage.updateWorkspace(workspace.id, {
        scheduleosPaymentIntentId: paymentIntent.id,
      });

      res.json({
        success: true,
        requiresPayment: true,
        clientSecret: paymentIntent.client_secret,
        paymentIntentId: paymentIntent.id,
        amount: SCHEDULEOS_ACTIVATION_FEE,
        status: paymentIntent.status,
      });
    } catch (error: unknown) {
      log.error('[Stripe] Error creating Payment Intent:', error);
      res.status(500).json({ error: "Failed to create payment intent", details: sanitizeError(error) });
    }
  });

  router.post('/activate', requireManager, async (req: any, res) => {
    try {
      const userId = req.user?.id || req.user?.claims?.sub;
      
      const employee = await storage.getEmployeeByUserId(userId);
      if (!employee) {
        return res.status(404).json({ message: "Employee not found" });
      }

      const [workspace] = await db.select()
        .from(workspaces)
        .where(eq(workspaces.id, employee.workspaceId))
        .limit(1);

      if (!workspace) {
        return res.status(404).json({ message: "Workspace not found" });
      }

      const { paymentMethod, paymentIntentId } = req.body;

      if (!paymentMethod) {
        return res.status(400).json({ message: "Payment method required" });
      }

      if (workspace.scheduleosActivatedAt) {
        return res.json({
          alreadyActivated: true,
          activatedAt: workspace.scheduleosActivatedAt,
          activatedBy: workspace.scheduleosActivatedBy,
        });
      }

      if (workspace.subscriptionTier !== 'free') {
        
        await storage.updateWorkspace(workspace.id, {
          scheduleosActivatedAt: new Date(),
          scheduleosActivatedBy: userId,
          scheduleosPaymentMethod: 'subscription_included',
        });

        return res.json({
          success: true,
          message: "AI Scheduling™ activated successfully! (Included in your subscription)",
          activatedAt: new Date(),
          activatedBy: userId,
        });
      }

      const SCHEDULEOS_ACTIVATION_FEE = 9900;

      if (!stripe) {
        return res.status(500).json({ error: "Payment processing is not configured" });
      }

      if (paymentMethod === 'stripe_subscription') {
        if (!workspace.stripeSubscriptionId) {
          return res.status(400).json({
            success: false,
            error: "No active subscription found. Please upgrade your tier first.",
            requiresUpgrade: true,
          });
        }


        await storage.updateWorkspace(workspace.id, {
          scheduleosActivatedAt: new Date(),
          scheduleosActivatedBy: userId,
          scheduleosPaymentMethod: 'stripe_subscription',
        });

        return res.json({
          success: true,
          message: "AI Scheduling™ activated successfully!",
          activatedAt: new Date(),
          activatedBy: userId,
        });
      }

      if (paymentMethod === 'stripe_card') {
        if (!paymentIntentId) {
          return res.status(400).json({
            success: false,
            error: "Payment Intent ID required. Please create payment intent first.",
          });
        }

        try {
          const paymentIntent = await stripe.paymentIntents.retrieve(paymentIntentId);

          if (paymentIntent.status !== 'succeeded') {
            log.error('[Stripe] Payment not succeeded:', paymentIntent.status);
            return res.status(400).json({
              success: false,
              error: `Payment failed: ${paymentIntent.status}`,
            });
          }

          if (paymentIntent.amount !== SCHEDULEOS_ACTIVATION_FEE) {
            log.error('[Stripe] Invalid payment amount:', paymentIntent.amount, 'expected:', SCHEDULEOS_ACTIVATION_FEE);
            return res.status(400).json({
              success: false,
              error: "Invalid payment amount",
            });
          }

          if (paymentIntent.metadata?.workspaceId !== workspace.id) {
            log.error('[Stripe] Payment Intent workspace mismatch:', paymentIntent.metadata?.workspaceId, 'vs', workspace.id);
            return res.status(400).json({
              success: false,
              error: "Payment Intent does not belong to this workspace",
            });
          }

          if (paymentIntent.metadata?.purpose !== 'scheduleos_activation') {
            log.error('[Stripe] Invalid Payment Intent purpose:', paymentIntent.metadata?.purpose);
            return res.status(400).json({
              success: false,
              error: "Invalid Payment Intent purpose",
            });
          }

          const [existingUsage] = await db
            .select()
            .from(workspaces)
            .where(eq(workspaces.scheduleosPaymentIntentId, paymentIntentId))
            .limit(1);

          if (existingUsage) {
            log.error('[Stripe] Payment Intent already used:', paymentIntentId, 'by workspace:', existingUsage.id);
            return res.status(400).json({
              success: false,
              error: "Payment Intent has already been used",
            });
          }


          await storage.updateWorkspace(workspace.id, {
            scheduleosActivatedAt: new Date(),
            scheduleosActivatedBy: userId,
            scheduleosPaymentMethod: 'stripe_card',
            scheduleosPaymentIntentId: paymentIntentId,
          });

          return res.json({
            success: true,
            message: "AI Scheduling™ activated successfully!",
            activatedAt: new Date(),
            activatedBy: userId,
          });
        } catch (stripeError: unknown) {
          log.error('[Stripe] Error verifying payment:', stripeError);
          return res.status(400).json({
            success: false,
            error: `Payment verification failed: ${stripeError.message}`,
          });
        }
      }

      return res.status(400).json({
        success: false,
        error: "Invalid payment method",
      });
    } catch (error: unknown) {
      log.error("Error activating AI Scheduling™:", error);
      res.status(500).json({ message: "Failed to activate AI Scheduling™" });
    }
  });

  router.get('/overview', async (req: any, res) => {
    try {
      const workspaceId = req.workspaceId || req.workspaceId;
      if (!workspaceId) return res.status(400).json({ message: 'Workspace required' });
      const workspace = await storage.getWorkspace(workspaceId);
      if (!workspace) return res.status(404).json({ message: 'Workspace not found' });
      const response: any = {
        isActivated: !!workspace.scheduleosActivatedAt,
        activatedAt: workspace.scheduleosActivatedAt || null,
        activatedBy: workspace.scheduleosActivatedBy || null,
        paymentMethod: workspace.scheduleosPaymentMethod || null,
        trialStartedAt: workspace.scheduleosTrialStartedAt || null,
      };
      if (workspace.scheduleosTrialStartedAt && !workspace.scheduleosActivatedAt) {
        const trialStart = new Date(workspace.scheduleosTrialStartedAt);
        const trialEnd = new Date(trialStart.getTime() + 7 * 24 * 60 * 60 * 1000);
        const daysLeft = Math.ceil((trialEnd.getTime() - Date.now()) / (1000 * 60 * 60 * 24));
        response.isTrialActive = daysLeft > 0;
        response.trialEndsAt = trialEnd;
        response.daysLeft = Math.max(0, daysLeft);
        response.trialExpired = daysLeft <= 0;
      }
      res.json(response);
    } catch (err: unknown) {
      res.status(500).json({ message: 'Failed to fetch ScheduleOS overview' });
    }
  });

  router.get('/status', async (req: any, res) => {
    try {
      let userId: string;
      let user: any;
      
      if (req.requireAuth && req.requireAuth() && req.user?.claims) {
        userId = req.user?.id;
        user = req.user;
      } else if (req.session?.userId) {
        userId = req.session.userId;
        const [dbUser] = await db.select().from(users).where(eq(users.id, userId)).limit(1);
        if (!dbUser) {
          return res.status(401).json({ message: "Unauthorized" });
        }
        user = dbUser;
        const userPlatformRoles = await db.select().from(platformRoles).where(eq(platformRoles.userId, userId));
        const activePlatformRole = userPlatformRoles.find(pr => !pr.revokedAt);
        user.platformRole = activePlatformRole?.role || null;
      } else {
        return res.status(401).json({ message: "Unauthorized" });
      }
      
      if (user.platformRole === 'root_admin' || user.platformRole === 'sysop') {
        const allWorkspaces = await db.select().from(workspaces).limit(1);
        if (allWorkspaces.length > 0) {
          const workspace = allWorkspaces[0];
          const response: any = {
            isActivated: !!workspace.scheduleosActivatedAt,
            activatedAt: workspace.scheduleosActivatedAt,
            activatedBy: workspace.scheduleosActivatedBy,
            paymentMethod: workspace.scheduleosPaymentMethod,
            trialStartedAt: workspace.scheduleosTrialStartedAt,
          };
          if (workspace.scheduleosTrialStartedAt && !workspace.scheduleosActivatedAt) {
            const trialStart = new Date(workspace.scheduleosTrialStartedAt);
            const trialEnd = new Date(trialStart.getTime() + 7 * 24 * 60 * 60 * 1000);
            const now = new Date();
            const daysLeft = Math.ceil((trialEnd.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
            response.isTrialActive = daysLeft > 0;
            response.trialEndsAt = trialEnd;
            response.daysLeft = Math.max(0, daysLeft);
            response.trialExpired = daysLeft <= 0;
          }
          return res.json(response);
        }
        return res.json({ isActivated: false });
      }
      
      const workspace = await storage.getWorkspaceByOwnerId(userId) || await storage.getWorkspaceByMembership(userId);
      
      if (!workspace) {
        return res.status(404).json({ message: "Workspace not found" });
      }

      const response: any = {
        isActivated: !!workspace.scheduleosActivatedAt,
        activatedAt: workspace.scheduleosActivatedAt,
        activatedBy: workspace.scheduleosActivatedBy,
        paymentMethod: workspace.scheduleosPaymentMethod,
        trialStartedAt: workspace.scheduleosTrialStartedAt,
      };

      if (workspace.scheduleosTrialStartedAt && !workspace.scheduleosActivatedAt) {
        const trialStart = new Date(workspace.scheduleosTrialStartedAt);
        const trialEnd = new Date(trialStart.getTime() + 7 * 24 * 60 * 60 * 1000);
        const now = new Date();
        const daysLeft = Math.ceil((trialEnd.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
        
        response.isTrialActive = daysLeft > 0;
        response.trialEndsAt = trialEnd;
        response.daysLeft = Math.max(0, daysLeft);
        response.trialExpired = daysLeft <= 0;
      }

      res.json(response);
    } catch (error: unknown) {
      log.error("Error checking AI Scheduling™ status:", error);
      res.status(500).json({ message: "Failed to check status" });
    }
  });

  router.post('/generate', requireAuth, async (req: any, res) => {
    try {
      const userId = req.user?.id || req.user?.claims?.sub;
      const workspace = await storage.getWorkspaceByOwnerId(userId) || await storage.getWorkspaceByMembership(userId);
      
      if (!workspace) {
        return res.status(404).json({ message: "Workspace not found" });
      }

      const platformRole = await storage.getUserPlatformRole(userId);
      const isPlatformStaff = platformRole && ['root_admin', 'deputy_admin', 'deputy_assistant', 'sysop', 'support'].includes(platformRole);

      if (!isPlatformStaff) {
        // Credit account check via aiUsageEvents-backed creditManager (workspace_credits dropped)
        const creditAccount = await creditManager.getCreditsAccount(workspace.id);
        const hasCreditAccount = creditAccount !== null && creditAccount.isActive;

        if (!hasCreditAccount) {
          const isActivated = !!workspace.scheduleosActivatedAt;
          let isInTrial = false;
          
          if (workspace.scheduleosTrialStartedAt && !isActivated) {
            const trialStart = new Date(workspace.scheduleosTrialStartedAt);
            const trialEnd = new Date(trialStart.getTime() + 7 * 24 * 60 * 60 * 1000);
            const now = new Date();
            const daysLeft = Math.ceil((trialEnd.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
            isInTrial = daysLeft > 0;
          }

          if (!isActivated && !isInTrial) {
            return res.status(403).json({
              message: "AI Scheduling™ requires payment activation or active trial",
              trialExpired: workspace.scheduleosTrialStartedAt ? true : false,
              requiresPayment: true,
              feature: "scheduleOS"
            });
          }
        }
      }

      const { scheduleOSAI } = await import('../ai/scheduleos');

      const { weekStartDate, shiftRequirements, clientIds } = req.body;

      if (!weekStartDate || !shiftRequirements) {
        return res.status(400).json({
          message: "Missing required fields: weekStartDate and shiftRequirements"
        });
      }

      const { withCredits } = await import('../services/billing/creditWrapper');

      const creditResult = await withCredits(
        {
          workspaceId: workspace.id,
          featureKey: 'ai_scheduling',
          description: `AI schedule generation for week ${weekStartDate}`,
          userId,
        },
        async () => {
          return await scheduleOSAI.generateSchedule({
            workspaceId: workspace.id,
            weekStartDate: new Date(weekStartDate),
            clientIds: clientIds || [],
            shiftRequirements,
          });
        }
      );

      if (!creditResult.success) {
        if (creditResult.insufficientCredits) {
          return res.status(402).json({
            message: creditResult.error || 'Insufficient credits for AI scheduling',
            feature: 'ai_scheduling',
            creditsRequired: 25,
          });
        }
        
        return res.status(500).json({
          message: creditResult.error || 'Failed to generate AI schedule',
        });
      }

      const result = creditResult.result;

      if (!result) {
        return res.status(500).json({ error: "Schedule generation returned no result" });
      }

      const tier = workspace.subscriptionTier || 'free';

      await db.insert(smartScheduleUsage).values({
        workspaceId: workspace.id,
        scheduleDate: new Date(weekStartDate),
        employeesScheduled: result.employeesScheduled,
        shiftsGenerated: result.shiftsGenerated,
        billingModel: tier === 'elite' ? 'tier_included' : 'tier_included',
        chargeAmount: '0',
        aiModel: 'gpt-4',
        processingTimeMs: result.processingTimeMs,
      });

      const billableShifts = result.generatedShifts.filter(s => s.clientId);
      const invoiceLineItems: any[] = [];

      for (const shift of billableShifts) {
        try {
          const client = await storage.getClient(shift.clientId, workspace.id);
          if (!client) continue;

          const hours = shift.billableHours;
          const rateStr = hours > 0 ? divideFinancialValues(toFinancialString(shift.estimatedCost), toFinancialString(hours)) : '0';
          const amountStr = calculateInvoiceLineItem(toFinancialString(hours), rateStr);

          const invoiceMonth = new Date(shift.startTime);
          invoiceMonth.setDate(1);
          invoiceMonth.setHours(0, 0, 0, 0);

          const existingInvoices = await storage.getInvoicesByClient(shift.clientId, workspace.id);
          let invoice = existingInvoices.find((inv: any) => {
            const invDate = new Date(inv.createdAt);
            return invDate.getMonth() === invoiceMonth.getMonth() && 
                   invDate.getFullYear() === invoiceMonth.getFullYear() &&
                   inv.status === 'draft';
          });

          if (!invoice) {
            invoice = await storage.createInvoice({
              workspaceId: workspace.id,
              clientId: shift.clientId,
              invoiceNumber: `INV-${Date.now()}-${crypto.randomUUID().slice(0, 8).toUpperCase()}`,
              status: 'draft',
              dueDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
              subtotal: '0',
              taxRate: '0',
              taxAmount: '0',
              total: '0',
              notes: `Auto-generated by AI Scheduling™ for ${invoiceMonth.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}`,
            });
          }

          const lineItem = await storage.createInvoiceLineItem({
            invoiceId: invoice.id,
            description: `${shift.title} - ${shift.employeeName} (${new Date(shift.startTime).toLocaleDateString()})`,
            quantity: hours.toString(),
            unitPrice: rateStr,
            amount: amountStr,
            metadata: {
              shiftId: shift.employeeId,
              aiGenerated: true,
              scheduleOSGenerated: true,
              billableHours: hours,
            },
          });

          invoiceLineItems.push(lineItem);

          const allLineItems = await storage.getInvoiceLineItems(invoice.id);
          const newSubtotalStr = calculateInvoiceTotal(allLineItems.map((item: any) => item.amount || '0'));
          const newTaxAmountStr = applyTax(newSubtotalStr, toFinancialString(invoice.taxRate || '0'));
          const newTotalStr = addFinancialValues(newSubtotalStr, newTaxAmountStr);

          await storage.updateInvoice(invoice.id, workspace.id, {
            subtotal: newSubtotalStr,
            taxAmount: newTaxAmountStr,
            total: newTotalStr,
          });

        } catch (billingError: unknown) {
          log.error(`[Billing Platform] Failed to create invoice line item for shift:`, billingError);
        }
      }

      res.json({
        ...result,
        message: `AI Scheduling™ generated ${result.shiftsGenerated} shifts for ${result.employeesScheduled} employees in ${result.processingTimeMs}ms`,
        billosIntegration: {
          invoiceLineItemsCreated: invoiceLineItems.length,
          totalBillableHours: billableShifts.reduce((sum, s) => sum + s.billableHours, 0),
          totalEstimatedRevenue: billableShifts.reduce((sum, s) => sum + s.estimatedCost, 0),
          message: invoiceLineItems.length > 0 
            ? `Auto-created ${invoiceLineItems.length} invoice line items for client billing`
            : 'No billable shifts generated for this schedule',
        },
      });
    } catch (error: unknown) {
      log.error("AI Scheduling™ error:", error);
      res.status(500).json({
        message: sanitizeError(error) || "AI Scheduling™ failed to generate schedule",
        error: "SCHEDULEOS_ERROR"
      });
    }
  });

  router.post('/acknowledge/:shiftId', requireAuth, async (req: any, res) => {
    try {
      const userId = req.user?.id || req.user?.claims?.sub;
      const { shiftId } = req.params;

      const shift = await db.query.shifts.findFirst({
        where: eq(shifts.id, shiftId),
      });

      if (!shift) {
        return res.status(404).json({ message: "Shift not found" });
      }

      if (!shift.aiGenerated) {
        return res.status(400).json({ message: "This shift was not AI-generated" });
      }

      await db.update(shifts)
        .set({
          acknowledgedAt: new Date(),
        })
        .where(eq(shifts.id, shiftId));

      res.json({
        success: true,
        message: "Shift acknowledged successfully",
        shiftId,
        acknowledgedAt: new Date(),
      });
    } catch (error: unknown) {
      log.error("Error acknowledging shift:", error);
      res.status(500).json({ message: "Failed to acknowledge shift" });
    }
  });

export default router;
