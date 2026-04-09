/**
 * SUPPORT CHAT ROUTES
 * 
 * REST API for support chat sessions:
 * - Create session
 * - Send message (user or staff)
 * - Get session info
 * - Get waiting queue (staff only)
 * - Join session (staff only)
 * - Resolve session
 */

import { sanitizeError } from '../middleware/errorHandler';
import { Router, Request, Response } from 'express';
import { supportSessionService } from '../services/supportSessionService';
import { AuthenticatedRequest, requirePlatformStaff } from '../rbac';
import { storage } from '../storage';
import { requireAuth } from '../auth';
import { createLogger } from '../lib/logger';
const log = createLogger('SupportChat');


const router = Router();

router.post('/session', async (req: Request, res: Response) => {
  try {
    const authReq = req as AuthenticatedRequest;
    const { guestEmail, guestName, userAgent, url, workspaceId, issueDescription, quickbooksId } = req.body;
    
    const session = await supportSessionService.createSession({
      // @ts-expect-error — TS migration: fix in refactoring sprint
      userId: authReq.user,
      guestEmail,
      guestName: guestName || 'Guest',
      userAgent: userAgent || req.headers['user-agent'],
      url,
      workspaceId: authReq.workspaceId || workspaceId,
      issueDescription,
      quickbooksId,
    });

    res.json({
      success: true,
      session: {
        id: session.id,
        status: session.status,
        messages: session.messages,
        ticketNumber: session.ticketNumber,
      },
    });
  } catch (error: unknown) {
    log.error('[SupportChat] Failed to create session:', error);
    res.status(500).json({ success: false, error: sanitizeError(error) });
  }
});

router.post('/session/:sessionId/message', async (req: Request, res: Response) => {
  try {
    const { sessionId } = req.params;
    const { content } = req.body;

    if (!content?.trim()) {
      return res.status(400).json({ success: false, error: 'Message content required' });
    }

    const response = await supportSessionService.processUserMessage(sessionId, content);
    const session = supportSessionService.getSession(sessionId);

    res.json({
      success: true,
      message: response,
      session: session ? {
        id: session.id,
        status: session.status,
        ticketNumber: session.ticketNumber,
        staffName: session.staffName,
      } : undefined,
    });
  } catch (error: unknown) {
    log.error('[SupportChat] Failed to process message:', error);
    res.status(500).json({ success: false, error: sanitizeError(error) });
  }
});

router.get('/session/:sessionId', async (req: Request, res: Response) => {
  try {
    const { sessionId } = req.params;
    const session = supportSessionService.getSession(sessionId);

    if (!session) {
      return res.status(404).json({ success: false, error: 'Session not found' });
    }

    res.json({
      success: true,
      session: {
        id: session.id,
        status: session.status,
        messages: session.messages,
        ticketNumber: session.ticketNumber,
        staffName: session.staffName,
        createdAt: session.createdAt,
      },
    });
  } catch (error: unknown) {
    res.status(500).json({ success: false, error: sanitizeError(error) });
  }
});

router.post('/session/:sessionId/escalate', async (req: Request, res: Response) => {
  try {
    const { sessionId } = req.params;
    const { reason } = req.body;

    const session = await supportSessionService.escalateToHuman(sessionId, reason);

    res.json({
      success: true,
      session: {
        id: session.id,
        status: session.status,
        ticketNumber: session.ticketNumber,
        messages: session.messages.slice(-3),
      },
    });
  } catch (error: unknown) {
    res.status(500).json({ success: false, error: sanitizeError(error) });
  }
});

router.get('/queue', requirePlatformStaff, async (req: Request, res: Response) => {
  try {
    const queue = supportSessionService.getWaitingQueue();
    const stats = supportSessionService.getStats();

    res.json({
      success: true,
      queue: queue.map(s => ({
        id: s.id,
        ticketNumber: s.ticketNumber,
        userName: s.guestName || s.userId || 'Anonymous',
        email: s.guestEmail,
        waitingSince: s.updatedAt,
        messageCount: s.messages.length,
        lastMessage: s.messages[s.messages.length - 1]?.content,
        metadata: s.metadata,
      })),
      stats,
    });
  } catch (error: unknown) {
    res.status(500).json({ success: false, error: sanitizeError(error) });
  }
});

router.post('/session/:sessionId/join', requirePlatformStaff, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { sessionId } = req.params;
    const staffId = req.user!;
    // @ts-expect-error — TS migration: fix in refactoring sprint
    const staffInfo = await storage.getUserDisplayInfo(staffId);
    const { formatStaffDisplayNameForEndUser } = await import('../utils/formatUserDisplayName');
    const staffName = staffInfo
      ? formatStaffDisplayNameForEndUser({
          firstName: staffInfo.firstName,
          lastName: staffInfo.lastName,
          email: staffInfo.email || undefined,
        })
      : 'Support';

    // @ts-expect-error — TS migration: fix in refactoring sprint
    const session = await supportSessionService.staffJoinSession(sessionId, staffId, staffName);

    res.json({
      success: true,
      session: {
        id: session.id,
        status: session.status,
        messages: session.messages,
        ticketNumber: session.ticketNumber,
      },
    });
  } catch (error: unknown) {
    res.status(500).json({ success: false, error: sanitizeError(error) });
  }
});

router.post('/session/:sessionId/staff-message', requirePlatformStaff, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { sessionId } = req.params;
    const { content } = req.body;
    const staffId = req.user!;

    if (!content?.trim()) {
      return res.status(400).json({ success: false, error: 'Message content required' });
    }

    // @ts-expect-error — TS migration: fix in refactoring sprint
    const message = await supportSessionService.staffSendMessage(sessionId, staffId, content);

    res.json({
      success: true,
      message,
    });
  } catch (error: unknown) {
    res.status(500).json({ success: false, error: sanitizeError(error) });
  }
});

router.post('/session/:sessionId/resolve', async (req: Request, res: Response) => {
  try {
    const { sessionId } = req.params;
    const { resolution } = req.body;

    const session = await supportSessionService.resolveSession(sessionId, resolution);

    res.json({
      success: true,
      session: {
        id: session.id,
        status: session.status,
        ticketNumber: session.ticketNumber,
      },
    });
  } catch (error: unknown) {
    res.status(500).json({ success: false, error: sanitizeError(error) });
  }
});

router.get('/stats', requirePlatformStaff, async (req: Request, res: Response) => {
  try {
    const stats = supportSessionService.getSessionStats();
    res.json({ success: true, stats });
  } catch (error: unknown) {
    res.status(500).json({ success: false, error: sanitizeError(error) });
  }
});

router.post('/session/:sessionId/feedback', async (req: Request, res: Response) => {
  try {
    const { sessionId } = req.params;
    const { rating, comment } = req.body;

    if (typeof rating !== 'number' || rating < 1 || rating > 5) {
      return res.status(400).json({ success: false, error: 'Rating must be 1-5' });
    }

    await supportSessionService.submitFeedback(sessionId, rating, comment);

    res.json({
      success: true,
      message: 'Thank you for your feedback!',
    });
  } catch (error: unknown) {
    res.status(500).json({ success: false, error: sanitizeError(error) });
  }
});

router.get('/sessions/all', requirePlatformStaff, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const sessions = await supportSessionService.getAllSessionsForSupport();
    res.json({
      success: true,
      sessions: sessions.map(s => ({
        id: s.id,
        status: s.status,
        ticketNumber: s.ticketNumber,
        userName: s.guestName || s.userId || 'Anonymous',
        workspaceId: s.workspaceId,
        staffName: s.staffName,
        messageCount: s.messages.length,
        createdAt: s.createdAt,
        updatedAt: s.updatedAt,
      })),
    });
  } catch (error: unknown) {
    res.status(500).json({ success: false, error: sanitizeError(error) });
  }
});

router.get('/my-sessions', requirePlatformStaff, async (req: AuthenticatedRequest, res: Response) => {
  try {
    // @ts-expect-error — TS migration: fix in refactoring sprint
    const sessions = supportSessionService.getActiveStaffSessions(req.user!);
    
    res.json({
      success: true,
      sessions: sessions.map(s => ({
        id: s.id,
        ticketNumber: s.ticketNumber,
        userName: s.guestName || s.userId || 'Anonymous',
        status: s.status,
        messageCount: s.messages.length,
        lastMessage: s.messages[s.messages.length - 1]?.content,
        updatedAt: s.updatedAt,
      })),
    });
  } catch (error: unknown) {
    res.status(500).json({ success: false, error: sanitizeError(error) });
  }
});

router.post('/guest-ticket', async (req: Request, res: Response) => {
  try {
    const { name, email, subject, message } = req.body;

    if (!name || !email || !subject || !message) {
      return res.status(400).json({ success: false, error: 'All fields are required' });
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return res.status(400).json({ success: false, error: 'Invalid email address' });
    }

    const { db } = await import('../db');
    const { supportTickets, workspaces } = await import('@shared/schema');
    const { eq } = await import('drizzle-orm');
    const { randomUUID } = await import('crypto');

    // Get or create a platform workspace for guest tickets
    // First try to find an existing platform workspace
    let platformWorkspaceId: string;
    
    // Look for existing platform/system workspace
    const existingWorkspace = await db.select()
      .from(workspaces)
      .where(eq(workspaces.name, 'Platform Support'))
      .limit(1);
    
    if (existingWorkspace.length > 0) {
      platformWorkspaceId = existingWorkspace[0].id;
    } else {
      // Use sandbox workspace as fallback for guest tickets
      const { getSandboxWorkspaceId } = await import('@shared/config/sandboxConfig');
      platformWorkspaceId = getSandboxWorkspaceId();
    }

    const ticketId = randomUUID();
    const ticketNumber = `TKT-${Date.now().toString(36).toUpperCase()}`;

    await db.insert(supportTickets).values({
      id: ticketId,
      ticketNumber,
      workspaceId: platformWorkspaceId,
      type: 'support',
      subject,
      description: `From: ${name} <${email}>\n\n${message}`,
      status: 'open',
      priority: 'medium',
    });

    log.info(`[SupportChat] Guest ticket created: ${ticketNumber} from ${email}`);

    res.json({
      success: true,
      ticketNumber,
      message: 'Your request has been submitted. We will respond to your email shortly.',
    });
  } catch (error: unknown) {
    log.error('[SupportChat] Failed to create guest ticket:', error);
    res.status(500).json({ success: false, error: 'Failed to submit ticket' });
  }
});

router.get('/my-tickets', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { db } = await import('../db');
    const { supportTickets } = await import('@shared/schema');
    const { eq, desc } = await import('drizzle-orm');

    const userId = req.user!;
    
    const tickets = await db.select()
      .from(supportTickets)
      // @ts-expect-error — TS migration: fix in refactoring sprint
      .where(eq(supportTickets.requestedBy, userId))
      .orderBy(desc(supportTickets.createdAt))
      .limit(100);

    res.json({
      success: true,
      tickets: tickets.map(t => ({
        id: t.id,
        ticketNumber: t.ticketNumber || `TKT-${t.id.slice(0, 8)}`,
        subject: t.subject,
        description: t.description,
        status: t.status,
        priority: t.priority,
        createdAt: t.createdAt,
        updatedAt: t.updatedAt,
        resolvedAt: t.resolvedAt,
        resolution: t.resolution,
      })),
    });
  } catch (error: unknown) {
    log.error('[SupportChat] Failed to get user tickets:', error);
    res.status(500).json({ success: false, error: sanitizeError(error) });
  }
});

export const supportChatRouter = router;
