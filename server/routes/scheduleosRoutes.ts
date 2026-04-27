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
import { tokenManager } from '../services/billing/tokenManager';
import { sql, eq, and, or, isNull, isNotNull, inArray, desc, gte, lte } from "drizzle-orm";
import { z } from "zod";
import { stripe } from "../routes";
import { isStripeConfigured } from "../services/billing/stripeClient";
import * as notificationHelpers from "../notifications";
import { createLogger } from '../lib/logger';
const log = createLogger('ScheduleosRoutes');

const router = Router();

router.post('/ai/toggle', requireManager, async (req: AuthenticatedRequest, res) => {
    try {
      const { enabled, workspaceId } = req.body;
      const userId = req.user?.id || (req.user)?.claims?.sub;
      
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
        (workspace as any).enabledAddons?.includes('smart_schedule_ai');

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
      log.error("Trinity Schedule Smart Generate Error:", error);
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
      log.error("Trinity Schedule Approval Error:", error);
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
          // @ts-expect-error — TS migration: fix in refactoring sprint
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
        message: "Trinity Schedule 7-day free trial activated!",
        trialStartedAt: new Date(),
        trialEndsAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
        daysLeft: 7,
      });
    } catch (error: unknown) {
      log.error("Error starting Trinity Schedule trial:", error);
      res.status(500).json({ message: "Failed to start trial" });
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
          message: "Trinity Schedule activated successfully! (Included in your subscription)",
          activatedAt: new Date(),
          activatedBy: userId,
        });
      }

      const SCHEDULEOS_ACTIVATION_FEE = 9900;

      if (!isStripeConfigured()) {
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
          message: "Trinity Schedule activated successfully!",
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
            message: "Trinity Schedule activated successfully!",
            activatedAt: new Date(),
            activatedBy: userId,
          });
        } catch (stripeError: unknown) {
          log.error('[Stripe] Error verifying payment:', stripeError);
          return res.status(400).json({
            success: false,
            // @ts-expect-error — TS migration: fix in refactoring sprint
            error: `Payment verification failed: ${stripeError.message}`,
          });
        }
      }

      return res.status(400).json({
        success: false,
        error: "Invalid payment method",
      });
    } catch (error: unknown) {
      log.error("Error activating Trinity Schedule:", error);
      res.status(500).json({ message: "Failed to activate Trinity Schedule" });
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
      log.error("Error checking Trinity Schedule status:", error);
      res.status(500).json({ message: "Failed to check status" });
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
