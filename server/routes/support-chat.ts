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

import { Router, Request, Response } from 'express';
import { supportSessionService } from '../services/supportSessionService';
import { AuthenticatedRequest, requirePlatformStaff } from '../rbac';
import { requireAuth } from '../auth';

const router = Router();

router.post('/session', async (req: Request, res: Response) => {
  try {
    const authReq = req as AuthenticatedRequest;
    const { guestEmail, guestName, userAgent, url, workspaceId } = req.body;
    
    const session = await supportSessionService.createSession({
      userId: authReq.userId,
      guestEmail,
      guestName: guestName || 'Guest',
      userAgent: userAgent || req.headers['user-agent'],
      url,
      workspaceId: authReq.workspaceId || workspaceId,
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
  } catch (error: any) {
    console.error('[SupportChat] Failed to create session:', error);
    res.status(500).json({ success: false, error: error.message });
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
  } catch (error: any) {
    console.error('[SupportChat] Failed to process message:', error);
    res.status(500).json({ success: false, error: error.message });
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
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
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
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

router.get('/queue', requireAuth, requirePlatformStaff, async (req: Request, res: Response) => {
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
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

router.post('/session/:sessionId/join', requireAuth, requirePlatformStaff, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { sessionId } = req.params;
    const staffId = req.userId!;
    const staffName = req.body.staffName || 'Support Agent';

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
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

router.post('/session/:sessionId/staff-message', requireAuth, requirePlatformStaff, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { sessionId } = req.params;
    const { content } = req.body;
    const staffId = req.userId!;

    if (!content?.trim()) {
      return res.status(400).json({ success: false, error: 'Message content required' });
    }

    const message = await supportSessionService.staffSendMessage(sessionId, staffId, content);

    res.json({
      success: true,
      message,
    });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
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
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

router.get('/stats', requireAuth, requirePlatformStaff, async (req: Request, res: Response) => {
  try {
    const stats = supportSessionService.getStats();
    res.json({ success: true, stats });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

router.get('/my-sessions', requireAuth, requirePlatformStaff, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const sessions = supportSessionService.getActiveStaffSessions(req.userId!);
    
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
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
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
    const { supportTickets } = await import('@shared/schema');
    const { randomUUID } = await import('crypto');

    const ticketId = randomUUID();
    const ticketNumber = `TKT-${Date.now().toString(36).toUpperCase()}`;

    await db.insert(supportTickets).values({
      id: ticketId,
      ticketNumber,
      subject,
      description: `From: ${name} <${email}>\n\n${message}`,
      status: 'open',
      priority: 'medium',
      source: 'guest_form',
      reportedBy: null,
      category: 'general',
    } as any);

    console.log(`[SupportChat] Guest ticket created: ${ticketNumber} from ${email}`);

    res.json({
      success: true,
      ticketNumber,
      message: 'Your request has been submitted. We will respond to your email shortly.',
    });
  } catch (error: any) {
    console.error('[SupportChat] Failed to create guest ticket:', error);
    res.status(500).json({ success: false, error: 'Failed to submit ticket' });
  }
});

router.get('/my-tickets', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { db } = await import('../db');
    const { supportTickets } = await import('@shared/schema');
    const { eq, desc } = await import('drizzle-orm');

    const userId = req.userId!;
    
    const tickets = await db.select()
      .from(supportTickets)
      .where(eq(supportTickets.reportedBy, userId))
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
  } catch (error: any) {
    console.error('[SupportChat] Failed to get user tickets:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

export const supportChatRouter = router;
