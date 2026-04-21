import { sanitizeError } from '../middleware/errorHandler';
import { Router } from 'express';
import { NotificationDeliveryService } from '../services/notificationDeliveryService';
import { z } from 'zod';
import { eq, and, or, isNull, inArray, desc, asc, sql } from 'drizzle-orm';
import { storage } from '../storage';
import { db } from '../db';
import {
  supportTickets,
  escalationTickets,
  platformRoles,
  users,
  chatConversations,
  chatParticipants,
  chatMessages,
  workspaces,
  performanceReviews,
  employerRatings,
  reportSubmissions,
  reportTemplates,
  employees,
  insertSupportTicketSchema,
} from '@shared/schema';
import crypto from 'crypto';
import { resolveWorkspaceForUser, type AuthenticatedRequest, requirePlatformStaff, getUserPlatformRole } from '../rbac';
import { requireAuth } from '../auth';
import { helposService } from '../services/helposService';
import { notificationEngine } from '../services/universalNotificationEngine';
import { PLATFORM_SUPPORT_ROLES } from '@shared/platformConfig';
import { PLATFORM } from '../config/platformConfig';
import { createLogger } from '../lib/logger';
const log = createLogger('SupportRoutes');


const router = Router();

router.post('/escalate', async (req, res) => {
  try {
    const { conversationId, guestName, guestEmail, issue, sessionId } = req.body;

    if (!conversationId || !guestName || !guestEmail || !issue) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    const guestToken = crypto.randomBytes(32).toString('hex');

    res.json({
      conversationId,
      ticketNumber: conversationId,
      guestToken,
      success: true
    });
  } catch (error) {
    log.error('[HelpAI] Escalation error:', error);
    res.status(500).json({
      error: 'Failed to complete escalation',
      details: error instanceof Error ? sanitizeError(error) : 'Unknown error'
    });
  }
});

router.post('/create-ticket', async (req, res) => {
  try {
    const authReq = req as AuthenticatedRequest;
    const { subject, description, conversationHistory } = req.body;

    if (!subject || !description) {
      return res.status(400).json({ message: 'Subject and description are required' });
    }

    let userId: string | null = null;
    let workspaceId: string | null = null;
    let userEmail = 'guest@coaileague.local';

    if (authReq.session?.userId) {
      userId = authReq.session.userId;
      workspaceId = authReq.session.workspaceId || null;
    }
    // @ts-expect-error — TS migration: fix in refactoring sprint
    else if (authReq.requireAuth?.() && authReq.user?.id) {
      userId = authReq.user.id;
      userEmail = (authReq as any).user?.claims?.email || userEmail;
    }

    const { PLATFORM_WORKSPACE_ID } = await import('../services/billing/billingConstants');
    if (!workspaceId) {
      workspaceId = PLATFORM_WORKSPACE_ID;
    }

    const fullDescription = conversationHistory && Array.isArray(conversationHistory)
      ? `${description}\n\n--- Conversation History ---\n${conversationHistory.map((m: any) => `${m.type === 'user' ? 'User' : 'AI'}: ${m.text}`).join('\n')}`
      : description;

    const ticketNumber = `TKT-${new Date().getFullYear()}-${crypto.randomBytes(4).toString('hex').toUpperCase()}`;

    const ticket = await storage.createSupportTicket({
      workspaceId,
      type: 'support',
      requestedBy: userId || userEmail || 'guest-user',
      subject,
      description: fullDescription,
      priority: 'medium',
      status: 'open',
      ticketNumber
    });

    res.json({
      success: true,
      ticketId: ticket.id,
      ticketNumber: (ticket as any).ticketNumber || ticket.id
    });
  } catch (error) {
    log.error('[CoAIleague AI] Error creating support ticket:', error);
    res.status(500).json({
      error: 'Failed to create support ticket',
      details: error instanceof Error ? sanitizeError(error) : 'Unknown error'
    });
  }
});

router.post('/helpos-chat', async (req, res) => {
  try {
    const authReq = req as AuthenticatedRequest;
    const helposChatBodySchema = z.object({
      message: z.string().min(1, 'Message is required'),
      sessionId: z.string().optional(),
      conversationHistory: z.array(z.any()).optional(),
      workspaceId: z.string().optional(),
    });
    const helposChatParsed = helposChatBodySchema.safeParse(req.body);
    if (!helposChatParsed.success) {
      return res.status(400).json({ error: 'Invalid request', details: helposChatParsed.error.flatten() });
    }
    const { message, sessionId, conversationHistory } = helposChatParsed.data;

    let userId: string | null = null;
    let requireAuth = false;

    if (authReq.session?.userId) {
      userId = authReq.session.userId;
      requireAuth = true;
    }
    // @ts-expect-error — TS migration: fix in refactoring sprint
    else if (authReq.requireAuth?.() && authReq.user?.id) {
      userId = authReq.user.id;
      requireAuth = true;
    }

    if (!requireAuth) {
      userId = sessionId
        ? `anon-${sessionId}`
        : `anon-${Date.now()}-${crypto.randomUUID().slice(0, 9)}`;
    }

    const { PLATFORM_WORKSPACE_ID } = await import('../services/billing/billingConstants');
    let workspaceId: string;

    if (requireAuth) {
      let requestedWorkspaceId = helposChatParsed.data.workspaceId;

      if (!requestedWorkspaceId) {
        const [userRecord] = await db.select().from(users).where(eq(users.id, userId!)).limit(1);
        requestedWorkspaceId = userRecord?.currentWorkspaceId || undefined;
      }

      const resolution = await resolveWorkspaceForUser(userId!, requestedWorkspaceId);

      if (!resolution.workspaceId) {
        return res.status(400).json({
          message: resolution.error || 'Please select a workspace using the workspace switcher',
          requiresWorkspace: true
        });
      }

      workspaceId = resolution.workspaceId;
    } else {
      workspaceId = PLATFORM_WORKSPACE_ID;
    }

    if (sessionId) {
      const existingSession = await storage.getHelposSession(sessionId, workspaceId);
      if (existingSession) {
        if (existingSession.userId !== userId) {
          log.error('[HelpAI] Session hijacking attempt:', {
            sessionId,
            expectedUserId: userId,
            actualUserId: existingSession.userId,
            requireAuth
          });
          return res.status(403).json({ message: 'Unauthorized: Session does not belong to this user' });
        }
      }
    }

    // @ts-expect-error — TS migration: fix in refactoring sprint
    const user = requireAuth ? await storage.getUser(userId) : null;
    const userName = user?.email || (requireAuth ? 'User' : 'Guest');
    const userEmail = user?.email || '';

    // @ts-expect-error — TS migration: fix in refactoring sprint
    const { bubbleAgent_reply } = await import('../helpos-ai');
    const response = await bubbleAgent_reply({
      workspaceId,
      userId,
      userName,
      userEmail,
      message,
      sessionId,
      conversationHistory,
      requireAuth,
    });

    if (response.shouldEscalate && response.escalationReason) {
      let platformWorkspaceSeedingInProgress = false;
      if (workspaceId === PLATFORM_WORKSPACE_ID) {
        let existingWorkspace = await storage.getWorkspace(PLATFORM_WORKSPACE_ID);
        if (!existingWorkspace) {
          try {
            const { seedRootUser } = await import('../seed-root-user');
            const { seedPlatformWorkspace } = await import('../seed-platform-workspace');
            await seedRootUser();
            await seedPlatformWorkspace();

            existingWorkspace = await storage.getWorkspace(PLATFORM_WORKSPACE_ID);
            if (!existingWorkspace) {
              throw new Error('CRITICAL: Platform workspace seeding failed - workspace still missing after seed attempt');
            }
          } catch (seedErr) {
            log.error('Platform workspace seed error:', seedErr);
            throw seedErr;
          }
        }
      }

      if (!requireAuth) {
        const ticketNumber = `GUEST-${Date.now()}`;
        const conversation = await storage.createChatConversation({
          workspaceId,
          customerId: null,
          customerName: userName || 'Guest',
          customerEmail: userEmail || 'guest@anonymous',
          subject: `HelpAI Escalation - ${response.escalationReason}`,
          // @ts-expect-error — TS migration: fix in refactoring sprint
          isActive: true,
          priority: 'medium',
        });

        return res.json({
          ...response,
          escalated: true,
          conversationId: conversation.id,
          ticketNumber,
        });
      }

      const session = await storage.getHelposSession(response.sessionId, workspaceId);
      const aiSummary = session?.aiSummary || 'No summary available';

      const escalationData = await helposService.handleEscalation({
        workspaceId,
        // @ts-expect-error — TS migration: fix in refactoring sprint
        userId,
        userName,
        userEmail,
        sessionId: response.sessionId,
        escalationReason: response.escalationReason,
        aiSummary,
        // @ts-expect-error — TS migration: fix in refactoring sprint
        storage,
      });

      const { broadcastToWorkspace } = await import('../websocket');
      await broadcastToWorkspace(workspaceId, {
        type: 'helpos_escalation',
        payload: {
          ticketId: escalationData.ticketId,
          ticketNumber: escalationData.ticketNumber,
          conversationId: escalationData.conversationId,
          customerName: userName,
          priority: response.escalationReason === 'critical_keyword' ? 'urgent' : 'normal',
        },
      });

      return res.json({
        ...response,
        escalated: true,
        conversationId: escalationData.conversationId,
        ticketNumber: escalationData.ticketNumber,
      });
    }

    res.json(response);
  } catch (error: unknown) {
    log.error('HelpAI chat error:', error);
    res.status(500).json({ message: sanitizeError(error) || 'Failed to process HelpAI chat' });
  }
});

router.post('/helpos-copilot', async (req, res) => {
  try {
    const authReq = req as AuthenticatedRequest;
    const { message, chatHistory, userContext } = req.body;

    if (!message || typeof message !== 'string') {
      return res.status(400).json({ message: 'Message is required' });
    }

    const userId = authReq.user!.id;
    // M11: Workspace resolved from auth-middleware to prevent workspace confusion
    const { workspaceId } = await resolveWorkspaceForUser(userId, req.workspaceId);

    const suggestion = await helposService.staffCopilot_suggestResponse({
      // @ts-expect-error — TS migration: fix in refactoring sprint
      workspaceId,
      userMessage: message,
      chatHistory: chatHistory || [],
      userContext,
    });

    res.json({ suggestion });
  } catch (error: unknown) {
    log.error('HelpAI copilot error:', error);
    res.status(500).json({ message: sanitizeError(error) || 'Failed to generate suggestion' });
  }
});

router.post('/tickets', async (req: AuthenticatedRequest, res) => {
  try {
    const authReq = req as AuthenticatedRequest;
    const userId = authReq.user?.id;

    if (!userId) {
      return res.status(401).json({ message: 'Unauthorized' });
    }
    const user = await storage.getUser(userId);
    if (!user?.currentWorkspaceId) {
      return res.status(403).json({ message: "No workspace selected" });
    }

    const validated = insertSupportTicketSchema.omit({
      workspaceId: true,
      ticketNumber: true,
      isEscalated: true,
      escalatedAt: true,
      escalatedBy: true,
      escalatedReason: true,
      platformAssignedTo: true,
      platformNotes: true
    }).parse(req.body);

    const ticketNumber = `TKT-${new Date().getFullYear()}-${crypto.randomBytes(4).toString('hex').toUpperCase()}`;

    // T010: Prefer the auth-middleware workspaceId over user.currentWorkspaceId to ensure
    // the ticket is written to the workspace the session is actively scoped to.
    const resolvedWorkspaceId = (req as AuthenticatedRequest).workspaceId || user.currentWorkspaceId;

    const [ticket] = await db.transaction(async (tx) => {
      return tx.insert(supportTickets).values({
        ...validated,
        ticketNumber,
        workspaceId: resolvedWorkspaceId,
        createdAt: new Date(),
        updatedAt: new Date(),
      }).returning();
    });

    // SLA Clock Start Notification — runs after ticket commit so ticketId is valid
    await notificationEngine.sendNotification({
      workspaceId: resolvedWorkspaceId,
      userId: userId,
      type: 'support_ticket_created',
      title: 'Support Ticket Received',
      message: `Your ticket #${ticketNumber} has been received. Our team will respond shortly.`,
      severity: 'info',
      metadata: { ticketId: ticket.id, ticketNumber },
    });

    res.status(201).json(ticket);
  } catch (error) {
    log.error("Error creating support ticket:", error);
    res.status(500).json({ message: "Failed to create support ticket" });
  }
});

router.get('/tickets', async (req: AuthenticatedRequest, res) => {
  try {
    const authReq = req as AuthenticatedRequest;
    const userId = authReq.user?.id;

    if (!userId) {
      return res.status(401).json({ message: 'Unauthorized' });
    }
    const user = await storage.getUser(userId);
    if (!user?.currentWorkspaceId) {
      return res.status(403).json({ message: "No workspace selected" });
    }

    const tickets = await storage.getSupportTickets(user.currentWorkspaceId);
    res.json(tickets);
  } catch (error) {
    log.error("Error fetching support tickets:", error);
    res.status(500).json({ message: "Failed to fetch support tickets" });
  }
});

router.patch('/tickets/:id', async (req: AuthenticatedRequest, res) => {
  try {
    const { id } = req.params;
    const authReq = req as AuthenticatedRequest;
    const userId = authReq.user?.id;
    if (!userId) return res.status(401).json({ message: 'Unauthorized' });

    const user = await storage.getUser(userId);
    if (!user?.currentWorkspaceId) return res.status(403).json({ message: 'No workspace selected' });

    const existing = await storage.getSupportTicket(id, user.currentWorkspaceId);
    if (!existing) return res.status(404).json({ message: 'Ticket not found in this workspace' });

    // Optimistic locking on status changes to prevent concurrent overwrites
    if (req.body.status && req.body.expectedStatus && existing.status !== req.body.expectedStatus) {
      return res.status(409).json({
        message: `Conflict: ticket status is now '${existing.status}', expected '${req.body.expectedStatus}'`,
        currentStatus: existing.status,
      });
    }

    const { expectedStatus: _ignored, ...updateData } = req.body;
    const ticket = await storage.updateSupportTicket(id, updateData, user.currentWorkspaceId);
    res.json(ticket);
  } catch (error) {
    log.error("Error updating support ticket:", error);
    res.status(500).json({ message: "Failed to update support ticket" });
  }
});

router.post('/tickets/:id/escalate', async (req: AuthenticatedRequest, res) => {
  try {
    const { id } = req.params;
    const { reason } = req.body;
    const authReq = req as AuthenticatedRequest;
    const userId = authReq.user?.id;

    if (!userId) {
      return res.status(401).json({ message: 'Unauthorized' });
    }

    if (!reason) {
      return res.status(400).json({ message: "Escalation reason required" });
    }

    // Fetch ticket WITH workspaceId filter in one query — prevents ID probing
    // across tenants (avoids 404 vs 403 timing oracle that leaks record existence).
    const authReqInner = req as AuthenticatedRequest;
    const workspaceId = authReqInner.workspaceId || (await storage.getUser(userId))?.currentWorkspaceId;

    if (!workspaceId) {
      return res.status(400).json({ message: "Workspace context required" });
    }

    const ticket = await db.query.supportTickets.findFirst({
      where: and(eq(supportTickets.id, id), eq(supportTickets.workspaceId, workspaceId)),
    });

    if (!ticket) {
      return res.status(404).json({ message: "Ticket not found" });
    }

    if (ticket.isEscalated) {
      return res.status(400).json({ message: "Ticket already escalated" });
    }

    const [updatedTicket] = await db.transaction(async (tx) => {
      return tx.update(supportTickets)
        .set({
          isEscalated: true,
          escalatedAt: new Date(),
          escalatedBy: userId,
          escalatedReason: reason,
          priority: 'high',
          updatedAt: new Date(),
        })
        .where(and(eq(supportTickets.id, id), eq(supportTickets.workspaceId, workspaceId)))
        .returning();
    });

    const platformStaff = await db.query.platformRoles.findMany({
      where: inArray(platformRoles.role, [...PLATFORM_SUPPORT_ROLES] as any),
    });

    for (const staff of platformStaff) {
      await notificationEngine.sendNotification({
        workspaceId: ticket.workspaceId || 'platform',
        userId: staff.userId,
        type: 'support_escalation',
        title: 'Support Ticket Escalated',
        message: `Ticket #${ticket.ticketNumber} escalated: ${ticket.subject}`,
        actionUrl: `/platform-admin/support`,
        severity: 'warning',
        metadata: {
          ticketId: ticket.id,
          ticketNumber: ticket.ticketNumber,
          skipFeatureCheck: true,
        },
      });
    }

    res.json(updatedTicket);
  } catch (error) {
    log.error("Error escalating support ticket:", error);
    res.status(500).json({ message: "Failed to escalate support ticket" });
  }
});

router.get('/escalated', requirePlatformStaff, async (req: AuthenticatedRequest, res) => {
  try {
    const rawTickets = await db.query.supportTickets.findMany({
      where: eq(supportTickets.isEscalated, true),
      orderBy: (tickets, { desc }) => [desc(tickets.escalatedAt)],
    });

    const wsIds = [...new Set(rawTickets.map((t: any) => t.workspaceId).filter(Boolean))];
    const wsRows = wsIds.length > 0
      ? await db.query.workspaces.findMany({ where: inArray(workspaces.id, wsIds) })
      : [];
    const wsMap = new Map((wsRows as any[]).map(w => [w.id, w]));
    const tickets = rawTickets.map((t: any) => ({ ...t, workspace: wsMap.get(t.workspaceId) || null }));

    res.json(tickets);
  } catch (error) {
    log.error("Error fetching escalated tickets:", error);
    res.status(500).json({ message: "Failed to fetch escalated tickets" });
  }
});

router.get('/priority-queue', requirePlatformStaff, async (req: AuthenticatedRequest, res) => {
  try {
    const rawTickets = await db.query.supportTickets.findMany({
      where: and(
        eq(supportTickets.status, 'open'),
        isNull(supportTickets.resolvedAt)
      ),
      orderBy: (tickets, { asc }) => [asc(tickets.createdAt)],
    });

    const pqWsIds = [...new Set(rawTickets.map((t: any) => t.workspaceId).filter(Boolean))];
    const pqWsRows = pqWsIds.length > 0
      ? await db.query.workspaces.findMany({ where: inArray(workspaces.id, pqWsIds) })
      : [];
    const pqWsMap = new Map((pqWsRows as any[]).map(w => [w.id, w]));
    const tickets = rawTickets.map((t: any) => ({ ...t, workspace: pqWsMap.get(t.workspaceId) || null }));

    const tierWeights: Record<string, number> = {
      'strategic': 50,
      'enterprise': 40,
      'business': 30,
      'professional': 25,
      'starter': 15,
      'trial': 10,
      'free': 10,
    };

    const priorityUsers = tickets.map((ticket) => {
      const workspace = ticket.workspace;
      const tier = (workspace?.subscriptionTier || 'free').toLowerCase();
      const tierWeight = tierWeights[tier] || 10;
      const isVIP = (workspace as any)?.isVip || false;
      const vipBonus = isVIP ? 25 : 0;

      const createdAt = new Date(ticket.createdAt);
      const now = new Date();
      const waitTimeMs = now.getTime() - createdAt.getTime();
      const waitTime = Math.floor(waitTimeMs / (1000 * 60));
      const waitTimeBonus = Math.min(waitTime, 25);

      const priorityScore = tierWeight + vipBonus + waitTimeBonus;

      let displayTier: 'strategic' | 'enterprise' | 'professional' | 'free' = 'free';
      if (['strategic'].includes(tier)) displayTier = 'strategic';
      else if (['enterprise', 'business'].includes(tier)) displayTier = 'enterprise';
      else if (['professional', 'starter'].includes(tier)) displayTier = 'professional';

      return {
        userId: ticket.requestedBy || 'unknown',
        username: ticket.requestedBy || 'Unknown User',
        waitTime,
        tier: displayTier,
        isVIP,
        issueType: ticket.type || 'general',
        ticketNumber: ticket.ticketNumber,
        ticketId: ticket.id,
        subject: ticket.subject,
        status: ticket.status,
        priority: ticket.priority,
        priorityScore,
        workspaceName: workspace?.name || 'Unknown',
        workspaceId: ticket.workspaceId,
      };
    });

    priorityUsers.sort((a, b) => b.priorityScore - a.priorityScore);

    res.json(priorityUsers);
  } catch (error) {
    log.error("Error fetching priority queue:", error);
    res.status(500).json({ message: "Failed to fetch priority queue" });
  }
});

router.patch('/escalated/:id/assign', requirePlatformStaff, async (req: AuthenticatedRequest, res) => {
  try {
    const { id } = req.params;

    const validated = z.object({
      staffId: z.string().min(1, "Staff ID required")
    }).parse(req.body);

    const { staffId } = validated;
    const authReq = req as AuthenticatedRequest;
    const userId = authReq.user?.id;

    if (!userId) {
      return res.status(401).json({ message: 'Unauthorized' });
    }

    const ticket = await db.query.supportTickets.findFirst({
      where: eq(supportTickets.id, id),
    });

    if (!ticket || !ticket.isEscalated) {
      return res.status(404).json({ message: "Escalated ticket not found" });
    }

    const [updatedTicket] = await db.update(supportTickets)
      .set({
        platformAssignedTo: staffId || userId,
        status: 'in_progress',
        updatedAt: new Date(),
      })
      .from(supportTickets)
      .where(eq(supportTickets.id, id))
      .returning();

    res.json(updatedTicket);
  } catch (error) {
    log.error("Error assigning escalated ticket:", error);
    res.status(500).json({ message: "Failed to assign escalated ticket" });
  }
});

router.patch('/escalated/:id/notes', requirePlatformStaff, async (req: AuthenticatedRequest, res) => {
  try {
    const { id } = req.params;

    const validated = z.object({
      notes: z.string().min(1, "Notes required")
    }).parse(req.body);

    const { notes } = validated;

    const [updatedTicket] = await db.update(supportTickets)
      .set({
        platformNotes: notes,
        updatedAt: new Date(),
      })
      .from(supportTickets)
      .where(eq(supportTickets.id, id))
      .returning();

    res.json(updatedTicket);
  } catch (error) {
    log.error("Error updating platform notes:", error);
    res.status(500).json({ message: "Failed to update platform notes" });
  }
});

router.patch('/escalated/:id/resolve', requirePlatformStaff, async (req: AuthenticatedRequest, res) => {
  try {
    const { id } = req.params;
    const authReq = req as AuthenticatedRequest;
    const userId = authReq.user?.id;

    if (!userId) {
      return res.status(401).json({ message: 'Unauthorized' });
    }

    const validated = z.object({
      resolution: z.string().min(1, "Resolution required")
    }).parse(req.body);

    const { resolution } = validated;

    const ticket = await db.query.supportTickets.findFirst({
      where: eq(supportTickets.id, id),
    });

    if (!ticket || !ticket.isEscalated) {
      return res.status(404).json({ message: "Escalated ticket not found" });
    }

    const [updatedTicket] = await db.update(supportTickets)
      .set({
        resolution,
        status: 'resolved',
        resolvedAt: new Date(),
        resolvedBy: userId,
        updatedAt: new Date(),
      })
      .from(supportTickets)
      .where(eq(supportTickets.id, id))
      .returning();

    if (ticket.escalatedBy) {
      await notificationEngine.sendNotification({
        workspaceId: ticket.workspaceId || 'platform',
        userId: ticket.escalatedBy,
        type: 'support_resolved',
        title: 'Escalated Ticket Resolved',
        message: `Your escalated ticket #${ticket.ticketNumber} has been resolved by platform support.`,
        actionUrl: `/org-support`,
        severity: 'info',
        metadata: {
          ticketId: ticket.id,
          ticketNumber: ticket.ticketNumber,
          resolution: resolution,
          skipFeatureCheck: true,
        },
      });
    }

    res.json(updatedTicket);
  } catch (error) {
    log.error("Error resolving escalated ticket:", error);
    res.status(500).json({ message: "Failed to resolve escalated ticket" });
  }
});

router.post('/tickets/:id/generate-summary', requirePlatformStaff, async (req, res) => {
  try {
    const { id } = req.params;
    const { messages, guestEmail, guestName } = req.body;

    if (!messages || !Array.isArray(messages)) {
      return res.status(400).json({ message: 'Messages array is required' });
    }

    const ticket = await db.query.supportTickets.findFirst({
      where: eq(supportTickets.id, id),
    });

    if (!ticket) {
      return res.status(404).json({ message: 'Ticket not found' });
    }

    try {
      const { generateGeminiResponse, isGeminiAvailable } = await import('../gemini');

      if (!isGeminiAvailable()) {
        log.warn('Gemini not available, skipping AI summary generation');
        return res.status(503).json({ message: 'AI summary generation temporarily unavailable' });
      }

      const conversationText = messages
        .map((m: any) => `${m.senderName || 'Support Agent'}: ${m.message}`)
        .join('\n');

      const summaryPrompt = `Please provide a concise executive summary of this support conversation in 2-3 sentences, focusing on:
1. The customer's main issue
2. What was resolved or recommended
3. Next steps if any

Conversation:
${conversationText}

Summary:`;

      const summary = await generateGeminiResponse({
        // @ts-expect-error — TS migration: fix in refactoring sprint
        model: 'gemini-2.5-flash',
        messages: [{
          role: 'user',
          content: summaryPrompt
        }],
        maxTokens: 200
      });

      const [updatedTicket] = await db.update(supportTickets)
        .set({
          resolution: summary,
          updatedAt: new Date(),
        })
        .from(supportTickets)
        .where(eq(supportTickets.id, id))
        .returning();

      res.json({
        success: true,
        summary,
        ticket: updatedTicket
      });
    } catch (geminiError) {
      log.error('Gemini summary generation failed:', geminiError);
      res.status(503).json({
        message: 'AI summary generation failed',
        details: geminiError instanceof Error ? geminiError.message : 'Unknown error'
      });
    }
  } catch (error) {
    log.error('Error generating summary:', error);
    res.status(500).json({ message: 'Failed to generate summary' });
  }
});

router.post('/tickets/:id/close', requirePlatformStaff, async (req, res) => {
  try {
    const { id } = req.params;
    const { summary, guestEmail, guestName } = req.body;

    if (!guestEmail) {
      return res.status(400).json({ message: 'Guest email is required' });
    }

    const ticket = await db.query.supportTickets.findFirst({
      where: eq(supportTickets.id, id),
    });

    if (!ticket) {
      return res.status(404).json({ message: 'Ticket not found' });
    }

    const [closedTicket] = await db.update(supportTickets)
      .set({
        status: 'closed',
        resolution: summary || ticket.resolution || 'Support completed',
        updatedAt: new Date(),
      })
      .from(supportTickets)
      .where(eq(supportTickets.id, id))
      .returning();

    try {
      const emailHtml = `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h2 style="color: #2563eb;">Support Ticket Closed - ${ticket.ticketNumber}</h2>
          <p>Hello ${guestName || 'there'},</p>
          <p>Thank you for contacting ${PLATFORM.name} Support. Your support ticket has been closed.</p>
          
          <div style="background-color: #f3f4f6; padding: 20px; border-radius: 8px; margin: 20px 0;">
            <p style="margin: 5px 0;"><strong>Ticket #:</strong> ${ticket.ticketNumber}</p>
            <p style="margin: 5px 0;"><strong>Issue:</strong> ${ticket.subject}</p>
            <p style="margin: 10px 0; font-weight: bold;">Summary of Resolution:</p>
            <p style="margin: 5px 0; white-space: pre-wrap;">${summary || 'Support completed'}</p>
          </div>

          <p>If you have any follow-up questions or need further assistance, please don't hesitate to reach out to us.</p>
          
          <p style="color: #6b7280; font-size: 14px; margin-top: 30px;">
            This is an automated message from ${PLATFORM.name} Support.<br/>
            Thank you for using our services!
          </p>
        </div>
      `;
      await NotificationDeliveryService.send({ type: 'support_ticket_confirmation', workspaceId: ticket.workspaceId || 'system', recipientUserId: guestEmail, channel: 'email', body: { to: guestEmail, subject: `Support Ticket Closed: ${ticket.ticketNumber}`, html: emailHtml } });
    } catch (emailError) {
      log.error('Failed to send support summary email:', emailError);
    }

    res.json({
      success: true,
      message: 'Ticket closed and summary sent to customer',
      ticket: closedTicket
    });
  } catch (error) {
    log.error('Error closing ticket:', error);
    res.status(500).json({ message: 'Failed to close ticket' });
  }
});

router.patch('/tickets/:id/status', async (req: AuthenticatedRequest, res) => {
  try {
    const { id } = req.params;
    const { status } = req.body;
    const authReq = req as AuthenticatedRequest;
    const userId = authReq.user?.id;

    if (!userId) {
      return res.status(401).json({ message: 'Unauthorized' });
    }

    const validStatuses = ['open', 'in_progress', 'waiting_for_customer', 'resolved', 'closed', 'on_hold'];
    if (!status || !validStatuses.includes(status)) {
      return res.status(400).json({ message: `Invalid status. Must be one of: ${validStatuses.join(', ')}` });
    }

    const user = await storage.getUser(userId);
    if (!user?.currentWorkspaceId) {
      return res.status(403).json({ message: 'No workspace selected' });
    }

    const ticket = await storage.getSupportTicket(id, user.currentWorkspaceId);
    if (!ticket) {
      return res.status(404).json({ message: 'Ticket not found' });
    }

    // Optimistic locking: accept optional expectedStatus to prevent concurrent overwrites
    const { expectedStatus } = req.body;
    if (expectedStatus && ticket.status !== expectedStatus) {
      return res.status(409).json({
        message: `Conflict: ticket status is now '${ticket.status}', expected '${expectedStatus}'`,
        currentStatus: ticket.status,
      });
    }

    const updatedTicket = await storage.updateSupportTicket(id, {
      status,
      // @ts-expect-error — TS migration: fix in refactoring sprint
      updatedAt: new Date(),
    }, user.currentWorkspaceId);

    if (!updatedTicket) {
      return res.status(500).json({ message: 'Failed to update ticket status' });
    }

    try {
      const { ChatServerHub } = await import('../services/ChatServerHub');
      ChatServerHub.emit({
        // @ts-expect-error — TS migration: fix in refactoring sprint
        type: 'ticket_status_changed',
        title: 'Support Ticket Status Updated',
        description: `Ticket #${ticket.ticketNumber} status changed to ${status}`,
        metadata: {
          ticketId: id,
          ticketNumber: ticket.ticketNumber,
          // @ts-expect-error — TS migration: fix in refactoring sprint
          oldStatus: ticket.status,
          newStatus: status,
          updatedBy: userId,
          workspaceId: ticket.workspaceId,
        },
        workspaceId: ticket.workspaceId,
      });
    } catch (emitError) {
      log.error('[ChatServerHub] Failed to emit ticket_status_changed:', emitError);
    }

    res.json({
      success: true,
      ticket: updatedTicket,
      message: `Ticket status updated to ${status}`,
    });
  } catch (error) {
    log.error('Error updating ticket status:', error);
    res.status(500).json({ message: 'Failed to update ticket status' });
  }
});

router.delete('/tickets/:id', async (req: AuthenticatedRequest, res) => {
  try {
    const { id } = req.params;
    const authReq = req as AuthenticatedRequest;
    const userId = authReq.user?.id;

    if (!userId) {
      return res.status(401).json({ message: 'Unauthorized' });
    }

    const user = await storage.getUser(userId);
    if (!user?.currentWorkspaceId) {
      return res.status(403).json({ message: 'No workspace selected' });
    }

    const ticket = await storage.getSupportTicket(id, user.currentWorkspaceId);
    if (!ticket) {
      return res.status(404).json({ message: 'Ticket not found' });
    }

    const success = await storage.deleteSupportTicket(id, user.currentWorkspaceId);
    if (!success) {
      return res.status(500).json({ message: 'Failed to delete ticket' });
    }

    try {
      const { ChatServerHub } = await import('../services/ChatServerHub');
      ChatServerHub.emit({
        // @ts-expect-error — TS migration: fix in refactoring sprint
        type: 'ticket_deleted',
        title: 'Support Ticket Deleted',
        description: `Ticket #${ticket.ticketNumber} has been deleted`,
        // @ts-expect-error — TS migration: fix in refactoring sprint
        metadata: {
          ticketId: id,
          ticketNumber: ticket.ticketNumber,
          subject: ticket.subject,
          deletedBy: userId,
          workspaceId: ticket.workspaceId,
        },
        workspaceId: ticket.workspaceId,
      });
    } catch (emitError) {
      log.error('[ChatServerHub] Failed to emit ticket_deleted:', emitError);
    }

    res.json({
      success: true,
      message: `Ticket #${ticket.ticketNumber} deleted successfully`,
    });
  } catch (error) {
    log.error('Error deleting support ticket:', error);
    res.status(500).json({ message: 'Failed to delete support ticket' });
  }
});

router.delete('/performance-reviews/:id', requirePlatformStaff, async (req: any, res) => {
  try {
    const { id } = req.params;
    const { explanation, notifyUserId } = req.body;

    if (!explanation) {
      return res.status(400).json({ message: "explanation is required" });
    }

    const review = await db.query.performanceReviews.findFirst({
      where: (reviews, { eq }) => eq(reviews.id, id),
    });

    if (!review) {
      return res.status(404).json({ message: "Performance review not found" });
    }

    await db.delete(performanceReviews).where(eq(performanceReviews.id, id));

    if (notifyUserId) {
      const notifyUser = await storage.getUser(notifyUserId);
      const employee = await db.query.employees.findFirst({
        where: (employees, { eq }) => eq(employees.id, review.employeeId),
      });
      const staffUser = await storage.getUser(req.user?.id);

      if (notifyUser?.email && employee) {
        const { sendReviewDeletedEmail } = await import('../services/supportActionEmails');
        await sendReviewDeletedEmail(notifyUser.email, {
          recipientName: `${employee.firstName} ${employee.lastName}`,
          reviewType: 'Performance Review',
          deletedBy: staffUser?.email || 'Platform Support',
          explanation
        }).catch ((err: unknown) => log.error('Failed to send review deleted email:', err));
      }
    }

    res.json({
      success: true,
      message: "Performance review deleted successfully",
      explanation
    });
  } catch (error) {
    log.error("Error deleting performance review:", error);
    res.status(500).json({ message: "Failed to delete performance review" });
  }
});

router.patch('/performance-reviews/:id', requirePlatformStaff, async (req: any, res) => {
  try {
    const { id } = req.params;
    const { updates, explanation, notifyUserId } = req.body;

    if (!explanation) {
      return res.status(400).json({ message: "explanation is required" });
    }

    if (!updates) {
      return res.status(400).json({ message: "updates object is required" });
    }

    const { overallRating, comments, strengths, areasForImprovement, goals, status: reviewStatus } = updates;
    const safeReviewUpdates: Record<string, any> = {};
    if (overallRating !== undefined) safeReviewUpdates.overallRating = overallRating;
    if (comments !== undefined) safeReviewUpdates.comments = comments;
    if (strengths !== undefined) safeReviewUpdates.strengths = strengths;
    if (areasForImprovement !== undefined) safeReviewUpdates.areasForImprovement = areasForImprovement;
    if (goals !== undefined) safeReviewUpdates.goals = goals;
    if (reviewStatus !== undefined) safeReviewUpdates.status = reviewStatus;

    const updatedReview = await db.update(performanceReviews)
      .set(safeReviewUpdates)
      .where(eq(performanceReviews.id, id))
      .returning();

    if (!updatedReview.length) {
      return res.status(404).json({ message: "Performance review not found" });
    }

    if (notifyUserId) {
      const notifyUser = await storage.getUser(notifyUserId);
      const employee = await db.query.employees.findFirst({
        where: (employees, { eq }) => eq(employees.id, updatedReview[0].employeeId),
      });
      const staffUser = await storage.getUser(req.user?.id);

      const changesDescription = Object.keys(safeReviewUpdates).join(', ');

      if (notifyUser?.email && employee) {
        const { sendReviewEditedEmail } = await import('../services/supportActionEmails');
        await sendReviewEditedEmail(notifyUser.email, {
          recipientName: `${employee.firstName} ${employee.lastName}`,
          reviewType: 'Performance Review',
          editedBy: staffUser?.email || 'Platform Support',
          changesDescription,
          explanation
        }).catch ((err: unknown) => log.error('Failed to send review edited email:', err));
      }
    }

    res.json({
      success: true,
      message: "Performance review updated successfully",
      review: updatedReview[0],
      explanation
    });
  } catch (error) {
    log.error("Error updating performance review:", error);
    res.status(500).json({ message: "Failed to update performance review" });
  }
});

router.delete('/employer-ratings/:id', requirePlatformStaff, async (req: any, res) => {
  try {
    const { id } = req.params;
    const { explanation, notifyWorkspaceId } = req.body;

    if (!explanation) {
      return res.status(400).json({ message: "explanation is required" });
    }

    const rating = await db.query.employerRatings.findFirst({
      where: (ratings, { eq }) => eq(ratings.id, id),
    });

    if (!rating) {
      return res.status(404).json({ message: "Employer rating not found" });
    }

    await db.delete(employerRatings).where(eq(employerRatings.id, id));

    if (notifyWorkspaceId) {
      const workspace = await db.query.workspaces.findFirst({
        where: (workspaces, { eq }) => eq(workspaces.id, notifyWorkspaceId),
      });
      const staffUser = await storage.getUser(req.user?.id);

      const ownerEmployee = await db.query.employees.findFirst({
        where: (employees, { and, eq }) => and(
          eq(employees.workspaceId, notifyWorkspaceId),
          eq(employees.role, 'org_owner')
        ),
      });

      if (ownerEmployee?.email && workspace) {
        const { sendRatingDeletedEmail } = await import('../services/supportActionEmails');
        await sendRatingDeletedEmail(ownerEmployee.email, {
          workspaceName: workspace.name,
          deletedBy: staffUser?.email || 'Platform Support',
          explanation
        }).catch ((err: unknown) => log.error('Failed to send rating deleted email:', err));
      }
    }

    res.json({
      success: true,
      message: "Employer rating deleted successfully",
      explanation
    });
  } catch (error) {
    log.error("Error deleting employer rating:", error);
    res.status(500).json({ message: "Failed to delete employer rating" });
  }
});

router.patch('/employer-ratings/:id', requirePlatformStaff, async (req: any, res) => {
  try {
    const { id } = req.params;
    const { updates, explanation, notifyWorkspaceId } = req.body;

    if (!explanation) {
      return res.status(400).json({ message: "explanation is required" });
    }

    if (!updates) {
      return res.status(400).json({ message: "updates object is required" });
    }

    const { overallRating: ratingScore, communicationScore, paymentReliability, workEnvironment, managementQuality, comments: ratingComments, status: ratingStatus } = updates;
    const safeRatingUpdates: Record<string, any> = {};
    if (ratingScore !== undefined) safeRatingUpdates.overallRating = ratingScore;
    if (communicationScore !== undefined) safeRatingUpdates.communicationScore = communicationScore;
    if (paymentReliability !== undefined) safeRatingUpdates.paymentReliability = paymentReliability;
    if (workEnvironment !== undefined) safeRatingUpdates.workEnvironment = workEnvironment;
    if (managementQuality !== undefined) safeRatingUpdates.managementQuality = managementQuality;
    if (ratingComments !== undefined) safeRatingUpdates.comments = ratingComments;
    if (ratingStatus !== undefined) safeRatingUpdates.status = ratingStatus;

    const updatedRating = await db.update(employerRatings)
      .set(safeRatingUpdates)
      .where(eq(employerRatings.id, id))
      .returning();

    if (!updatedRating.length) {
      return res.status(404).json({ message: "Employer rating not found" });
    }

    if (notifyWorkspaceId) {
      const workspace = await db.query.workspaces.findFirst({
        where: (workspaces, { eq }) => eq(workspaces.id, notifyWorkspaceId),
      });
      const staffUser = await storage.getUser(req.user?.id);

      const ownerEmployee = await db.query.employees.findFirst({
        where: (employees, { and, eq }) => and(
          eq(employees.workspaceId, notifyWorkspaceId),
          eq(employees.role, 'org_owner')
        ),
      });

      const changesDescription = Object.keys(updates).join(', ');

      if (ownerEmployee?.email && workspace) {
        const { sendRatingDeletedEmail } = await import('../services/supportActionEmails');
        await sendRatingDeletedEmail(ownerEmployee.email, {
          workspaceName: `${workspace.name} - Rating Updated`,
          deletedBy: staffUser?.email || 'Platform Support',
          explanation: `Changes made: ${changesDescription}. ${explanation}`
        }).catch ((err: unknown) => log.error('Failed to send rating updated email:', err));
      }
    }

    res.json({
      success: true,
      message: "Employer rating updated successfully",
      rating: updatedRating[0],
      explanation
    });
  } catch (error) {
    log.error("Error updating employer rating:", error);
    res.status(500).json({ message: "Failed to update employer rating" });
  }
});

router.delete('/report-submissions/:id', requirePlatformStaff, async (req: any, res) => {
  try {
    const { id } = req.params;
    const { explanation, notifyUserId } = req.body;

    if (!explanation) {
      return res.status(400).json({ message: "explanation is required" });
    }

    const report = await db.query.reportSubmissions.findFirst({
      where: (reports, { eq }) => eq(reports.id, id),
    });

    if (!report) {
      return res.status(404).json({ message: "Report submission not found" });
    }

    const template = await db.query.reportTemplates.findFirst({
      where: (templates, { eq }) => eq(templates.id, report.templateId),
    });

    await db.delete(reportSubmissions).where(eq(reportSubmissions.id, id));

    if (notifyUserId) {
      const notifyUser = await storage.getUser(notifyUserId);
      const employee = await db.query.employees.findFirst({
        where: (employees, { eq }) => eq(employees.id, report.employeeId),
      });
      const staffUser = await storage.getUser(req.user?.id);

      if (notifyUser?.email && employee) {
        const { sendWriteUpDeletedEmail } = await import('../services/supportActionEmails');
        await sendWriteUpDeletedEmail(notifyUser.email, {
          recipientName: `${employee.firstName} ${employee.lastName}`,
          reportType: template?.name || 'Disciplinary Report',
          deletedBy: staffUser?.email || 'Platform Support',
          explanation
        }).catch ((err: unknown) => log.error('Failed to send write-up deleted email:', err));
      }
    }

    res.json({
      success: true,
      message: "Report submission deleted successfully",
      explanation
    });
  } catch (error) {
    log.error("Error deleting report submission:", error);
    res.status(500).json({ message: "Failed to delete report submission" });
  }
});

router.get('/chatrooms', async (req: AuthenticatedRequest, res) => {
  try {
    if (!req.user) {
      return res.status(401).json({ message: "Authentication required" });
    }
    // @ts-expect-error — TS migration: fix in refactoring sprint
    const isSupportStaff = (req.user).platformRole && [
      'root_admin',
      'support_manager',
      'support_agent',
      'support',
      'root',
      'sysop',
      'deputy_admin',
      'deputy_assistant'
    // @ts-expect-error — TS migration: fix in refactoring sprint
    ].includes((req.user).platformRole);

    if (!isSupportStaff) {
      return res.status(403).json({ message: "Only support staff can access this endpoint" });
    }

    const conversations = await db.select().from(chatConversations).where(eq(chatConversations.status, 'active')).execute();

    const formattedRooms = await Promise.all(conversations.map(async (conv) => {
      const participants = await db.select().from(chatParticipants)
        .where(eq(chatParticipants.conversationId, conv.id)).execute();

      const messages = await db.select().from(chatMessages)
        .where(eq(chatMessages.conversationId, conv.id))
        .orderBy(desc(chatMessages.createdAt))
        .limit(1)
        .execute();

      const workspace = await db.select().from(workspaces)
        .where(eq(workspaces.id, conv.workspaceId))
        .limit(1)
        .execute();

      const unreadCount = 0;

      return {
        id: conv.id,
        name: conv.subject || `Chat ${conv.id.substring(0, 8)}`,
        workspaceId: conv.workspaceId,
        workspaceName: workspace[0]?.name || 'Unknown Organization',
        conversationType: conv.conversationType || 'group',
        participantCount: participants.length,
        unreadCount: unreadCount,
        lastMessageAt: messages[0]?.createdAt || conv.createdAt,
        createdAt: conv.createdAt,
        status: conv.status,
      };
    }));

    const activeRooms = formattedRooms.filter(room => room.status === 'active' || room.status === 'open');

    res.json(activeRooms);
  } catch (error: unknown) {
    log.error("Error fetching support chatrooms:", error);
    res.status(500).json({ message: "Failed to fetch support chatrooms" });
  }
});

router.post('/session/elevate', async (req: AuthenticatedRequest, res) => {
  try {
    const elevatedSessionService = await import("../services/session/elevatedSessionService");
    const userId = req.user!;
    const sessionId = req.sessionID;

    // @ts-expect-error — TS migration: fix in refactoring sprint
    const eligibility = await elevatedSessionService.canReceiveElevation(userId);
    if (!eligibility.canElevate) {
      return res.status(403).json({
        success: false,
        error: eligibility.reason || 'Not eligible for session elevation',
        info: 'Only support roles and AI services can receive elevated sessions'
      });
    }

    const result = await elevatedSessionService.issueElevation(
      // @ts-expect-error — TS migration: fix in refactoring sprint
      userId,
      sessionId,
      'auto_support_login',
      userId,
      req.ip,
      req.get('user-agent')
    );

    if (result.success) {
      res.json({
        success: true,
        elevationId: result.elevationId,
        expiresAt: result.expiresAt,
        role: eligibility.role
      });
    } else {
      res.status(500).json({ success: false, error: result.error });
    }
  } catch (error: unknown) {
    log.error('[Elevation Route] Error:', error);
    res.status(500).json({ success: false, error: sanitizeError(error) });
  }
});

router.get('/session/status', async (req: AuthenticatedRequest, res) => {
  try {
    const elevatedSessionService = await import("../services/session/elevatedSessionService");
    const context = await elevatedSessionService.isElevatedSupportSession(req);
    res.json({
      success: true,
      isElevated: context.isElevated,
      elevationId: context.elevationId,
      platformRole: context.platformRole,
      expiresAt: context.expiresAt,
      actionsExecuted: context.actionsExecuted
    });
  } catch (error: unknown) {
    res.status(500).json({ success: false, error: sanitizeError(error) });
  }
});

router.post('/session/revoke', async (req: AuthenticatedRequest, res) => {
  try {
    const elevatedSessionService = await import("../services/session/elevatedSessionService");
    const userId = req.user!;
    // @ts-expect-error — TS migration: fix in refactoring sprint
    const count = await elevatedSessionService.revokeAllUserElevations(userId, 'manual_logout');
    res.json({ success: true, revokedCount: count });
  } catch (error: unknown) {
    res.status(500).json({ success: false, error: sanitizeError(error) });
  }
});

router.post('/session/ai-service', async (req: AuthenticatedRequest, res) => {
  try {
    const { aiBrainAuthorizationService } = await import("../services/ai-brain/aiBrainAuthorizationService");

    // @ts-expect-error — TS migration: fix in refactoring sprint
    const authCheck = await aiBrainAuthorizationService.validateSupportStaff(req.user!);
    if (!authCheck.valid || !['root_admin', 'deputy_admin', 'sysop'].includes(authCheck.role || '')) {
      return res.status(403).json({ success: false, error: 'Insufficient permissions to issue AI service elevations' });
    }

    const { serviceType, serviceUserId, workflowId } = req.body;
    if (!serviceType || !serviceUserId) {
      return res.status(400).json({ success: false, error: 'serviceType and serviceUserId required' });
    }

    const elevatedSessionService = await import("../services/session/elevatedSessionService");
    const result = await elevatedSessionService.issueAIServiceElevation(
      serviceType,
      serviceUserId,
      workflowId
    );

    res.json(result);
  } catch (error: unknown) {
    res.status(500).json({ success: false, error: sanitizeError(error) });
  }
});

router.get('/session/admin/active', async (req: AuthenticatedRequest, res) => {
  try {
    const { supportSessionElevations } = await import("@shared/schema");
    const { eq, gt, and } = await import("drizzle-orm");

    const now = new Date();
    const activeSessions = await db.select()
      .from(supportSessionElevations)
      .where(and(
        eq(supportSessionElevations.isActive, true),
        gt(supportSessionElevations.expiresAt, now)
      ))
      .limit(100);

    res.json({ success: true, sessions: activeSessions, count: activeSessions.length });
  } catch (error: unknown) {
    res.status(500).json({ success: false, error: sanitizeError(error) });
  }
});

// ============================================================================
// GET /api/support/my-workspace-history — Org owner transparency
// Returns Trinity support actions + tickets for the requesting workspace.
// ============================================================================
router.get('/my-workspace-history', async (req: AuthenticatedRequest, res) => {
  try {
    const workspaceId = (req as any).user?.workspaceId || (req as any).workspaceId;
    if (!workspaceId) return res.status(400).json({ error: 'Workspace required' });

    const { pool } = await import('../db');
    const [tickets, actions] = await Promise.all([
      pool.query(`
        SELECT id, ticket_number, subject, category, status, priority,
          assigned_to_trinity, trinity_attempted, resolution_method,
          time_to_resolution_minutes, org_notified_of_intervention,
          created_at, resolved_at
        FROM support_tickets
        WHERE workspace_id = $1
        ORDER BY created_at DESC
        LIMIT 50
      `, [workspaceId]),
      pool.query(`
        SELECT id, action_type, action_description, actor_type, success, executed_at, reason
        FROM support_actions
        WHERE workspace_id = $1
        ORDER BY executed_at DESC
        LIMIT 30
      `, [workspaceId])
    ]);

    res.json({
      tickets: tickets.rows,
      supportActions: actions.rows,
      summary: {
        totalTickets: tickets.rows.length,
        openTickets: tickets.rows.filter((t: any) => t.status === 'open').length,
        resolvedByTrinity: tickets.rows.filter((t: any) => t.resolution_method === 'trinity_auto').length,
        escalated: tickets.rows.filter((t: any) => t.status === 'escalated').length
      }
    });
  } catch (err) {
    res.status(500).json({ error: sanitizeError(err) });
  }
});

export default router;
