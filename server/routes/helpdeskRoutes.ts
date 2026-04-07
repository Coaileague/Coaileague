import { sanitizeError } from '../middleware/errorHandler';
import { Router } from 'express';
import { z } from 'zod';
import { eq, and, or, isNull, lte, gte, desc, asc, sql } from 'drizzle-orm';
import { storage } from '../storage';
import { db } from '../db';
import {
  supportTickets,
  users,
  platformRoles,
  helpOsQueue,
  motdMessages,
  motdAcknowledgment,
  termsAcknowledgments,
  chatAgreementAcceptances,
  chatMessages,
  employees,
  workspaces,
  helpaiSessions,
  helpaiActionLog
} from '@shared/schema';
import type { AuthenticatedRequest } from '../rbac';
import { getUserPlatformRole, requirePlatformStaff } from '../rbac';
import { requireAuth } from '../auth';
import { HelpAIService } from '../helpos-ai';
import { helpAIBotService, HelpAIState } from '../services/helpai/helpAIBotService';
import { createLogger } from '../lib/logger';
const log = createLogger('HelpdeskRoutes');


// CATEGORY C — db.$client.query call in this file uses raw SQL for dynamic helpdesk ticket queries | Tables: support_tickets | Verified: 2026-03-23
const router = Router();

// ── PUBLIC: Feedback submission ──────────────────────────────────────────
router.post("/feedback", async (req, res) => {
  try {
    const { category, message, rating, contactEmail, workspaceId } = req.body;
    
    // In a real app, we'd save this to a feedback table.
    // For now, we log it and return success.
    log.info(`[Feedback] Received ${category} feedback: ${rating}/5`, { workspaceId, contactEmail });
    
    res.json({ success: true, message: "Thank you for your feedback!" });
  } catch (err: unknown) {
    res.status(500).json({ error: sanitizeError(err) });
  }
});

// ── PUBLIC: FAQ entries — no auth required ────────────────────────────────
router.get("/faq/entries", async (req: any, res) => {
  try {
    const { category, language } = req.query as Record<string, string>;
    let query = `SELECT * FROM faq_entries WHERE is_active = true`;
    const params: any[] = [];
    let i = 1;
    if (category) { query += ` AND category = $${i++}`; params.push(category); }
    query += ` ORDER BY category, id`;
    const result = await db.$client.query(query, params);
    res.json({ entries: result.rows, total: result.rows.length });
  } catch (err: unknown) {
    res.status(500).json({ error: sanitizeError(err) });
  }
});

// ============================================================================
// AUTH REQUIRED — applied to all routes in this router
// Public helpdesk endpoints (authenticate-ticket, authenticate-workid) are
// rate-limited at mount level in routes.ts and don't need session auth.
// ============================================================================
router.use((req, res, next) => {
  const publicPaths = ['/authenticate-ticket', '/authenticate-workid', '/feedback', '/testimonials', '/faq/entries'];
  if (publicPaths.includes(req.path)) {
    return next();
  }
  return requireAuth(req, res, next);
});

// ============================================================================
// HELPAI SESSION ENDPOINTS (H003)
// ============================================================================

router.post('/session/start', async (req: AuthenticatedRequest, res) => {
  try {
    const { workspaceId, channelId } = req.body;
    const userId = req.user?.id;

    if (!userId || !workspaceId) {
      return res.status(400).json({ message: "UserId and workspaceId are required" });
    }

    const sessionData = await helpAIBotService.startSession(workspaceId, userId, channelId);
    res.json(sessionData);
  } catch (error) {
    log.error("Error starting HelpAI session:", error);
    res.status(500).json({ message: "Failed to start HelpAI session" });
  }
});

router.post('/session/:sessionId/message', async (req: AuthenticatedRequest, res) => {
  try {
    const { sessionId } = req.params;
    const { message } = req.body;

    if (!message) {
      return res.status(400).json({ message: "Message is required" });
    }

    const response = await helpAIBotService.handleMessage(sessionId, message);
    
    // Fetch actions for this message if any were logged
    const actions = await db.select().from(helpaiActionLog)
      .where(eq(helpaiActionLog.sessionId, sessionId))
      .orderBy(desc(helpaiActionLog.createdAt))
      .limit(5);

    res.json({
      reply: response.response,
      state: response.state,
      shouldEscalate: response.shouldEscalate,
      actions
    });
  } catch (error) {
    log.error("Error handling HelpAI message:", error);
    res.status(500).json({ message: "Failed to process message" });
  }
});

router.post('/session/:sessionId/escalate', async (req: AuthenticatedRequest, res) => {
  try {
    const { sessionId } = req.params;
    const { reason } = req.body;

    await helpAIBotService.escalateToHuman(sessionId, reason || "User requested escalation");
    res.json({ success: true, message: "Escalated to human support" });
  } catch (error) {
    log.error("Error escalating HelpAI session:", error);
    res.status(500).json({ message: "Failed to escalate session" });
  }
});

router.post('/session/:sessionId/close', async (req: AuthenticatedRequest, res) => {
  try {
    const { sessionId } = req.params;
    const { rating } = req.body;

    await helpAIBotService.closeSession(sessionId, rating);
    res.json({ success: true, message: "Session closed" });
  } catch (error) {
    log.error("Error closing HelpAI session:", error);
    res.status(500).json({ message: "Failed to close session" });
  }
});

router.get('/session/:sessionId', async (req: AuthenticatedRequest, res) => {
  try {
    const { sessionId } = req.params;
    
    const [session] = await db.select().from(helpaiSessions).where(eq(helpaiSessions.id, sessionId)).limit(1);
    if (!session) {
      return res.status(404).json({ message: "Session not found" });
    }

    const actions = await db.select().from(helpaiActionLog)
      .where(eq(helpaiActionLog.sessionId, sessionId))
      .orderBy(asc(helpaiActionLog.createdAt));

    res.json({ session, actions });
  } catch (error) {
    log.error("Error fetching HelpAI session:", error);
    res.status(500).json({ message: "Failed to fetch session" });
  }
});

router.get('/admin/sessions', requirePlatformStaff, async (req: AuthenticatedRequest, res) => {
  try {
    const userId = req.user?.id;
    if (!userId) return res.status(401).json({ message: "Unauthorized" });

    const platformRole = await storage.getUserPlatformRole(userId);
    if (!platformRole || !['root_admin', 'deputy_admin', 'sysop', 'support_manager', 'support_agent'].includes(platformRole)) {
      return res.status(403).json({ message: "Unauthorized - Admin access required" });
    }

    const { status, from, to, workspaceId } = req.query;
    const conditions = [];
    
    if (status) conditions.push(eq(helpaiSessions.state, status as string));
    if (workspaceId) conditions.push(eq(helpaiSessions.workspaceId, workspaceId as string));
    if (from) conditions.push(gte(helpaiSessions.createdAt, new Date(from as string)));
    if (to) conditions.push(lte(helpaiSessions.createdAt, new Date(to as string)));

    const sessions = await db.select().from(helpaiSessions)
      .where(conditions.length > 0 ? and(...conditions) : undefined)
      .orderBy(desc(helpaiSessions.createdAt));

    res.json(sessions);
  } catch (error) {
    log.error("Error listing HelpAI sessions:", error);
    res.status(500).json({ message: "Failed to list sessions" });
  }
});

router.get('/admin/action-log', requirePlatformStaff, async (req: AuthenticatedRequest, res) => {
  try {
    const userId = req.user?.id;
    if (!userId) return res.status(401).json({ message: "Unauthorized" });

    const platformRole = await storage.getUserPlatformRole(userId);
    if (!platformRole || !['root_admin', 'deputy_admin', 'sysop', 'support_manager', 'support_agent'].includes(platformRole)) {
      return res.status(403).json({ message: "Unauthorized - Admin access required" });
    }

    const { workspaceId, sessionId } = req.query;
    const conditions = [];
    
    if (workspaceId) conditions.push(eq(helpaiActionLog.workspaceId, workspaceId as string));
    if (sessionId) conditions.push(eq(helpaiActionLog.sessionId, sessionId as string));

    const logs = await db.select().from(helpaiActionLog)
      .where(conditions.length > 0 ? and(...conditions) : undefined)
      .orderBy(desc(helpaiActionLog.createdAt))
      .limit(100);

    res.json(logs);
  } catch (error) {
    log.error("Error fetching action logs:", error);
    res.status(500).json({ message: "Failed to fetch action logs" });
  }
});

router.get('/room/:slug', async (req: AuthenticatedRequest, res) => {
  try {
    const { slug } = req.params;
    const room = await storage.getSupportRoomBySlug(slug);

    if (!room) {
      return res.status(404).json({ message: "HelpDesk room not found" });
    }

    res.json(room);
  } catch (error) {
    log.error("Error fetching HelpDesk room:", error);
    res.status(500).json({ message: "Failed to fetch HelpDesk room" });
  }
});

router.get('/rooms', async (req: AuthenticatedRequest, res) => {
  try {
    const authReq = req as AuthenticatedRequest;
    const userId = authReq.user?.id;

    if (!userId) {
      return res.status(401).json({ message: 'Unauthorized' });
    }

    const platformRole = await storage.getUserPlatformRole(userId);
    if (!platformRole || !['root', 'deputy_admin', 'deputy_assistant', 'sysop', 'support'].includes(platformRole)) {
      return res.status(403).json({ message: "Unauthorized - Staff access required" });
    }

    const workspace = await storage.getWorkspaceByOwnerId(userId) ||
                      await storage.getWorkspaceByMembership(userId);

    const rooms = await storage.getAllSupportRooms(workspace?.id);
    res.json(rooms);
  } catch (error) {
    log.error("Error listing HelpDesk rooms:", error);
    res.status(500).json({ message: "Failed to list rooms" });
  }
});

router.post('/rooms', async (req: AuthenticatedRequest, res) => {
  try {
    const authReq = req as AuthenticatedRequest;
    const userId = authReq.user?.id;

    if (!userId) {
      return res.status(401).json({ message: 'Unauthorized' });
    }
    const { name, description, slug } = req.body;

    if (!name || !slug) {
      return res.status(400).json({ message: "Room name and slug are required" });
    }

    if (!/^[a-z0-9-]+$/.test(slug)) {
      return res.status(400).json({ message: "Invalid slug format. Use lowercase letters, numbers, and hyphens only." });
    }

    const workspace = await storage.getWorkspaceByOwnerId(userId) ||
                      await storage.getWorkspaceByMembership(userId);

    if (!workspace) {
      return res.status(403).json({ message: "Unauthorized - Organization membership required" });
    }

    const member = await storage.getWorkspaceMemberByUserId(userId);
    if (!member || member.workspaceId !== workspace.id) {
      return res.status(403).json({ message: "Unauthorized - Organization membership required" });
    }
    const memberRole = member.role as string;
    if (memberRole !== 'org_owner' && memberRole !== 'co_owner' && memberRole !== 'org_admin' && memberRole !== 'manager') {
      return res.status(403).json({ message: "Unauthorized - Owner or Manager role required" });
    }

    const existingRoom = await storage.getSupportRoomBySlug(slug);
    if (existingRoom) {
      return res.status(409).json({ message: "A room with this slug already exists" });
    }

    const room = await storage.createSupportRoom({
      slug,
      name,
      description: description || `Private chat room for ${workspace.name}`,
      status: 'open',
      statusMessage: null,
      workspaceId: workspace.id,
      conversationId: null,
      requiresTicket: false,
      allowedRoles: null,
      lastStatusChange: new Date(),
      statusChangedBy: null,
      createdBy: userId,
    });

    res.status(201).json(room);
  } catch (error: unknown) {
    log.error("Error creating organization room:", error);
    res.status(500).json({ message: "Failed to create room" });
  }
});

router.post('/room/:slug/status', async (req: AuthenticatedRequest, res) => {
  try {
    const { slug } = req.params;
    const { status, statusMessage } = req.body;
    const authReq = req as AuthenticatedRequest;
    const userId = authReq.user?.id;

    if (!userId) {
      return res.status(401).json({ message: 'Unauthorized' });
    }

    const platformRole = await storage.getUserPlatformRole(userId);
    if (!platformRole || !['root', 'deputy_admin', 'deputy_assistant', 'sysop'].includes(platformRole)) {
      return res.status(403).json({ message: "Unauthorized - Staff access required" });
    }

    if (!['open', 'closed', 'maintenance'].includes(status)) {
      return res.status(400).json({ message: "Invalid status. Must be 'open', 'closed', or 'maintenance'" });
    }

    const updated = await storage.updateSupportRoomStatus(slug, status, statusMessage || null, userId);

    if (!updated) {
      return res.status(404).json({ message: "HelpDesk room not found" });
    }

    res.json(updated);
  } catch (error) {
    log.error("Error updating HelpDesk room status:", error);
    res.status(500).json({ message: "Failed to update room status" });
  }
});

router.get('/queue', async (req: AuthenticatedRequest, res) => {
  try {
    const workspaceId = req.workspaceId;
    if (!workspaceId) {
      return res.status(400).json({ message: "Workspace ID required" });
    }

    const waiting = await db.query.helpOsQueue.findMany({
      where: and(
        eq(helpOsQueue.status, "waiting"),
        eq(helpOsQueue.workspaceId, workspaceId)
      ),
      orderBy: [desc(helpOsQueue.priorityScore), asc(helpOsQueue.joinedAt)],
    });

    const queueEntries = waiting.map((entry, index) => {
      const waitTimeMinutes = Math.floor(
        (Date.now() - new Date(entry.joinedAt).getTime()) / 60000
      );

      return {
        id: entry.id,
        userId: entry.userId,
        userName: entry.userName || 'User',
        position: index + 1,
        estimatedWaitMinutes: entry.estimatedWaitMinutes || 5,
        priority: entry.priorityLevel || 'normal',
        userType: entry.userType || 'guest',
        waitTimeMinutes,
      };
    });

    res.json(queueEntries);
  } catch (error) {
    log.error("Error fetching HelpDesk queue:", error);
    res.status(500).json({ message: "Failed to fetch queue data" });
  }
});

router.post('/ai/toggle', async (req: AuthenticatedRequest, res) => {
  try {
    const { enabled, workspaceId } = req.body;
    const authReq = req as AuthenticatedRequest;
    const userId = authReq.user?.id;

    if (!userId) {
      return res.status(401).json({ message: 'Unauthorized' });
    }

    const platformRole = await storage.getUserPlatformRole(userId);
    if (!platformRole || !['root', 'deputy_admin', 'deputy_assistant', 'sysop'].includes(platformRole)) {
      return res.status(403).json({ message: "Unauthorized - Staff access required" });
    }

    if (typeof enabled !== 'boolean') {
      return res.status(400).json({ message: "Invalid parameter. 'enabled' must be a boolean." });
    }

    if (!workspaceId || typeof workspaceId !== 'string') {
      return res.status(400).json({ message: "Invalid parameter. 'workspaceId' is required and must be a string." });
    }

    const workspace = await storage.getWorkspace(workspaceId);
    if (!workspace) {
      return res.status(404).json({ message: "Workspace not found" });
    }

    const helposAI = new HelpAIService(workspaceId);
    const newState = helposAI.toggleAI(enabled);

    res.json({
      enabled: newState,
      message: `HelpAI ${newState ? 'enabled' : 'disabled'} successfully for workspace ${workspace.name}`,
      workspaceId
    });
  } catch (error) {
    log.error("Error toggling HelpAI:", error);
    res.status(500).json({ message: "Failed to toggle AI" });
  }
});

router.get('/ai/status', async (req: AuthenticatedRequest, res) => {
  try {
    const authReq = req as AuthenticatedRequest;
    const userId = authReq.user?.id;

    if (!userId) {
      return res.status(401).json({ message: 'Unauthorized' });
    }
    const { workspaceId } = req.query;

    const platformRole = await storage.getUserPlatformRole(userId);
    if (!platformRole || !['root', 'deputy_admin', 'deputy_assistant', 'sysop'].includes(platformRole)) {
      return res.status(403).json({ message: "Unauthorized - Staff access required" });
    }

    if (!workspaceId || typeof workspaceId !== 'string') {
      return res.status(400).json({ message: "Invalid parameter. 'workspaceId' query parameter is required." });
    }

    const workspace = await storage.getWorkspace(workspaceId);
    if (!workspace) {
      return res.status(404).json({ message: "Workspace not found" });
    }

    const helposAI = new HelpAIService(workspaceId);
    const isEnabled = helposAI.isEnabled();

    res.json({
      enabled: isEnabled,
      workspaceId,
      workspaceName: workspace.name
    });
  } catch (error) {
    log.error("Error fetching HelpAI status:", error);
    res.status(500).json({ message: "Failed to fetch AI status" });
  }
});

router.post('/authenticate-ticket', async (req, res) => {
  try {
    const { ticketNumber, email } = req.body;

    if (!ticketNumber || !email) {
      return res.status(400).json({ message: "Ticket number and email are required" });
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return res.status(400).json({ message: "Invalid email address" });
    }

    const [ticket] = await db
      .select()
      .from(supportTickets)
      .where(eq(supportTickets.ticketNumber, ticketNumber));

    if (!ticket) {
      return res.status(401).json({ message: "Invalid credentials. Please check your ticket number and email." });
    }

    const emailMatch = ticket.requestedBy?.match(/<(.+?)>/);
    const ticketEmail = emailMatch ? emailMatch[1] : ticket.requestedBy;

    if (!ticketEmail || ticketEmail.toLowerCase() !== email.toLowerCase()) {
      return res.status(401).json({ message: "Invalid credentials. Please check your ticket number and email." });
    }

    if (ticket.status === 'closed' || ticket.status === 'resolved') {
      return res.status(403).json({ message: "This ticket has been closed. Please create a new support ticket." });
    }

    const guestUserId = `guest-${ticket.id}`;
    const guestUsername = `Guest-${ticketNumber}`;
    const guestEmail = email;

    let [guestUser] = await db
      .select()
      .from(users)
      .where(eq(users.id, guestUserId));

    if (!guestUser) {
      [guestUser] = await db.insert(users).values({
        id: guestUserId,
        firstName: guestUsername,
        email: guestEmail,
        role: 'employee',
        currentWorkspaceId: ticket.workspaceId,
      }).returning();
    }

    (req.session as any).userId = guestUser.id;
    await new Promise((resolve, reject) => {
      req.session.save((err: any) => {
        if (err) reject(err);
        else resolve(undefined);
      });
    });

    res.json({
      success: true,
      message: "Authentication successful! You can now access Live Chat.",
      user: {
        id: guestUser.id,
        username: guestUser.username,
        email: guestUser.email,
      },
      ticket: {
        id: ticket.id,
        ticketNumber: ticket.ticketNumber,
        subject: ticket.subject,
      },
    });
  } catch (error) {
    log.error("Error authenticating ticket:", error);
    res.status(500).json({ message: "Failed to authenticate ticket. Please try again." });
  }
});

router.post('/authenticate-workid', async (req, res) => {
  try {
    const { workId, email } = req.body;

    if (!workId || !email) {
      return res.status(400).json({ message: "Work ID and email are required" });
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return res.status(400).json({ message: "Invalid email address" });
    }

    const [staffUser] = await db
      .select()
      .from(users)
      .where(eq(users.id, workId));

    if (!staffUser) {
      return res.status(401).json({ message: "Invalid credentials. Please check your Work ID and email." });
    }

    if (!staffUser.email || staffUser.email.toLowerCase() !== email.toLowerCase()) {
      return res.status(401).json({ message: "Invalid credentials. Please check your Work ID and email." });
    }

    const [roleRecord] = await db
      .select()
      .from(platformRoles)
      .where(eq(platformRoles.userId, staffUser.id));

    const hasStaffRole = roleRecord && ['root_admin', 'deputy_admin', 'deputy_assistant', 'sysop'].includes(roleRecord.role);

    if (!hasStaffRole) {
      return res.status(403).json({ message: "Unauthorized - Staff access required" });
    }

    (req.session as any).userId = staffUser.id;
    await new Promise((resolve, reject) => {
      req.session.save((err: any) => {
        if (err) reject(err);
        else resolve(undefined);
      });
    });

    res.json({
      success: true,
      message: "Staff authentication successful! You now have access to Live Chat.",
      user: {
        id: staffUser.id,
        username: staffUser.username,
        email: staffUser.email,
        role: roleRecord.role,
      },
    });
  } catch (error) {
    log.error("Error authenticating work ID:", error);
    res.status(500).json({ message: "Failed to authenticate. Please try again." });
  }
});

router.post('/verify-ticket', async (req: AuthenticatedRequest, res) => {
  try {
    const { ticketNumber, roomSlug } = req.body;
    const authReq = req as AuthenticatedRequest;
    const userId = authReq.user?.id;

    if (!userId) {
      return res.status(401).json({ message: 'Unauthorized' });
    }

    if (!ticketNumber || !roomSlug) {
      return res.status(400).json({ message: "Ticket number and room slug are required" });
    }

    const room = await storage.getSupportRoomBySlug(roomSlug);
    if (!room) {
      return res.status(404).json({ message: "HelpDesk room not found" });
    }

    if (room.status !== 'open') {
      return res.status(403).json({
        message: "HelpDesk room is currently closed",
        statusMessage: room.statusMessage
      });
    }

    const ticket = await storage.verifyTicketForChatAccess(ticketNumber, userId);

    if (!ticket) {
      return res.status(403).json({
        message: "Invalid ticket or unauthorized access. Ticket must be verified by support staff and belong to you."
      });
    }

    let access = await storage.checkTicketAccess(userId, room.id);

    if (!access) {
      const expiresAt = new Date();
      expiresAt.setHours(expiresAt.getHours() + 48);

      access = await storage.grantTicketAccess({
        ticketId: ticket.id,
        userId,
        roomId: room.id,
        grantedBy: userId,
        expiresAt,
      });
    }

    res.json({
      access,
      room,
      message: "Access granted to HelpDesk room"
    });
  } catch (error) {
    log.error("Error verifying ticket:", error);
    res.status(500).json({ message: "Failed to verify ticket" });
  }
});

router.post('/terms/accept', async (req: any, res) => {
  try {
    const { initialsProvided, userName, userEmail, workspaceId, ticketNumber } = req.body;

    let userId: string | null;
    let finalUserName: string;
    let finalUserEmail: string;

    if (req.user || req.session?.userId) {
      const user = req.user || (req.session?.userId ? await db.select().from(users).where(eq(users.id, req.session.userId)).limit(1).then(r => r[0]) : null);
      userId = user?.id || null;
      finalUserName = userName || (user?.firstName && user?.lastName ? `${user.firstName} ${user.lastName}` : 'Unknown');
      finalUserEmail = userEmail || user?.email || 'unknown@email.com';
    } else {
      userId = null;
      finalUserName = userName || 'Guest';
      finalUserEmail = userEmail || 'guest@email.com';
    }

    if (!initialsProvided || initialsProvided.trim().length < 2) {
      return res.status(400).json({ message: "Valid initials are required for e-signature" });
    }

    const ipAddress = req.ip || req.socket.remoteAddress || 'unknown';
    const userAgent = req.headers['user-agent'] || 'unknown';

    const [acknowledgment] = await db.insert(termsAcknowledgments).values({
      userId,
      userName: finalUserName,
      userEmail: finalUserEmail,
      workspaceId: workspaceId || null,
      ticketNumber: ticketNumber || null,
      initialsProvided: initialsProvided.toUpperCase(),
      acceptedTermsVersion: '1.0',
      ipAddress,
      userAgent,
    }).returning();

    res.json({
      success: true,
      message: "Terms accepted and recorded for compliance",
      acknowledgmentId: acknowledgment.id
    });
  } catch (error) {
    log.error("Error saving terms acknowledgment:", error);
    res.status(500).json({ message: "Failed to save terms acceptance" });
  }
});

router.get('/check-access/:roomSlug', async (req: AuthenticatedRequest, res) => {
  try {
    const { roomSlug } = req.params;
    const authReq = req as AuthenticatedRequest;
    const userId = authReq.user?.id;

    if (!userId) {
      return res.status(401).json({ message: 'Unauthorized' });
    }

    const room = await storage.getSupportRoomBySlug(roomSlug);
    if (!room) {
      return res.status(404).json({ message: "HelpDesk room not found" });
    }

    const platformRole = await storage.getUserPlatformRole(userId);
    const isStaff = platformRole && ['root_admin', 'deputy_admin', 'deputy_assistant', 'sysop'].includes(platformRole);

    if (isStaff) {
      return res.json({
        hasAccess: true,
        accessType: 'staff',
        room
      });
    }

    const access = await storage.checkTicketAccess(userId, room.id);

    if (access) {
      return res.json({
        hasAccess: true,
        accessType: 'ticket',
        access,
        room
      });
    }

    res.json({
      hasAccess: false,
      room
    });
  } catch (error) {
    log.error("Error checking access:", error);
    res.status(500).json({ message: "Failed to check access" });
  }
});

router.post('/revoke-access', async (req: AuthenticatedRequest, res) => {
  try {
    const { accessId, reason } = req.body;
    const authReq = req as AuthenticatedRequest;
    const userId = authReq.user?.id;

    if (!userId) {
      return res.status(401).json({ message: 'Unauthorized' });
    }

    const platformRole = await storage.getUserPlatformRole(userId);
    if (!platformRole || !['root_admin', 'deputy_admin', 'deputy_assistant', 'sysop'].includes(platformRole)) {
      return res.status(403).json({ message: "Unauthorized - Staff access required" });
    }

    if (!accessId) {
      return res.status(400).json({ message: "Access ID is required" });
    }

    const revoked = await storage.revokeTicketAccess(accessId, userId, reason || "Revoked by staff");

    if (!revoked) {
      return res.status(404).json({ message: "Access record not found" });
    }

    res.json({ message: "Access revoked successfully" });
  } catch (error) {
    log.error("Error revoking access:", error);
    res.status(500).json({ message: "Failed to revoke access" });
  }
});

router.post('/feedback', async (req, res) => {
  try {
    const schema = z.object({
      conversationId: z.string(),
      rating: z.number().min(1).max(5),
      feedback: z.string().optional(),
    });

    const { conversationId, rating, feedback } = schema.parse(req.body);

    await storage.updateChatConversation(conversationId, {
      rating,
      feedback: feedback || null,
    });

    res.json({ success: true });
  } catch (error: unknown) {
    res.status(400).json({ error: sanitizeError(error) });
  }
});

router.get('/reviews', async (req: AuthenticatedRequest, res) => {
  try {
    const closedTickets = await storage.getClosedConversationsForReview();
    res.json(closedTickets);
  } catch (error: unknown) {
    res.status(500).json({ error: sanitizeError(error) });
  }
});

router.get('/testimonials', async (req, res) => {
  try {
    const testimonials = await storage.getPositiveTestimonials();
    res.json(testimonials);
  } catch (error: unknown) {
    res.status(500).json({ error: sanitizeError(error) });
  }
});

router.get('/motd', async (req: AuthenticatedRequest, res) => {
  try {
    const authReq = req as AuthenticatedRequest;
    const userId = authReq.user?.id;

    if (!userId) {
      return res.status(401).json({ message: 'Unauthorized' });
    }

    const [motd] = await db
      .select()
      .from(motdMessages)
      .where(
        and(
          eq(motdMessages.isActive, true),
          or(
            isNull(motdMessages.startsAt),
            lte(motdMessages.startsAt, new Date())
          ),
          or(
            isNull(motdMessages.endsAt),
            gte(motdMessages.endsAt, new Date())
          )
        )
      )
      .orderBy(desc(motdMessages.displayOrder))
      .limit(1);

    if (!motd) {
      return res.json({ motd: null, acknowledged: true });
    }

    const [acknowledgment] = await db
      .select()
      .from(motdAcknowledgment)
      .where(
        and(
          eq(motdAcknowledgment.motdId, motd.id),
          eq(motdAcknowledgment.userId, userId)
        )
      )
      .limit(1);

    res.json({
      motd,
      acknowledged: !!acknowledgment
    });
  } catch (error: unknown) {
    log.error("Error fetching MOTD:", error);
    res.status(500).json({ error: sanitizeError(error) });
  }
});

router.post('/motd', async (req: AuthenticatedRequest, res) => {
  try {
    const authReq = req as AuthenticatedRequest;
    const userId = authReq.user?.id;

    if (!userId) {
      return res.status(401).json({ message: 'Unauthorized' });
    }

    const platformRole = await storage.getUserPlatformRole(userId);
    if (!platformRole || !['root_admin', 'deputy_admin', 'deputy_assistant', 'sysop'].includes(platformRole)) {
      return res.status(403).json({ error: "Staff access required" });
    }

    const schema = z.object({
      title: z.string(),
      content: z.string(),
      isActive: z.boolean().optional().default(true),
      startsAt: z.string().optional(),
      endsAt: z.string().optional(),
    });

    const validationResult = schema.safeParse(req.body);
    if (!validationResult.success) {
      return res.status(400).json({
        error: "Invalid request",
        details: validationResult.error.errors
      });
    }

    const data = validationResult.data;

    await db
      .update(motdMessages)
      .set({ isActive: false })
      .where(eq(motdMessages.isActive, true));

    const [newMotd] = await db
      .insert(motdMessages)
      .values({
        workspaceId: workspaceId,
        ...data,
        startsAt: data.startsAt ? new Date(data.startsAt) : null,
        endsAt: data.endsAt ? new Date(data.endsAt) : null,
        createdBy: userId,
        updatedBy: userId,
      })
      .returning();

    res.json(newMotd);
  } catch (error: unknown) {
    log.error("Error creating MOTD:", error);
    res.status(500).json({ error: sanitizeError(error) });
  }
});

router.post('/motd/acknowledge', async (req: AuthenticatedRequest, res) => {
  try {
    const authReq = req as AuthenticatedRequest;
    const userId = authReq.user?.id;

    if (!userId) {
      return res.status(401).json({ message: 'Unauthorized' });
    }
    const { motdId } = req.body;

    if (!motdId) {
      return res.status(400).json({ error: "MOTD ID required" });
    }

    const [existing] = await db
      .select()
      .from(motdAcknowledgment)
      .where(
        and(
          eq(motdAcknowledgment.motdId, motdId),
          eq(motdAcknowledgment.userId, userId)
        )
      )
      .limit(1);

    if (existing) {
      return res.json({ success: true, alreadyAcknowledged: true });
    }

    await db
      .insert(motdAcknowledgment)
      .values({
        workspaceId: workspaceId,
        motdId,
        userId,
      });

    res.json({ success: true });
  } catch (error: unknown) {
    log.error("Error acknowledging MOTD:", error);
    res.status(500).json({ error: sanitizeError(error) });
  }
});

router.post('/agreement/accept', async (req: any, res) => {
  try {
    const schema = z.object({
      fullName: z.string().optional(),
      agreementVersion: z.string().default("1.0"),
      roomSlug: z.string(),
      ticketId: z.string().optional(),
      sessionId: z.string().optional(),
    });

    const validationResult = schema.safeParse(req.body);
    if (!validationResult.success) {
      return res.status(400).json({
        error: "Invalid request",
        details: validationResult.error.errors
      });
    }

    const { fullName, agreementVersion, roomSlug, ticketId, sessionId } = validationResult.data;

    const ipAddress = req.ip || req.headers['x-forwarded-for'] || req.connection.remoteAddress;
    const userAgent = req.headers['user-agent'];

    const userId = req.user?.id || null;
    const platformRole = userId ? await getUserPlatformRole(userId) : null;

    const [acceptance] = await db
      .insert(chatAgreementAcceptances)
      .values({
        workspaceId: workspaceId,
        userId,
        ticketId: ticketId || null,
        sessionId: sessionId || null,
        agreementVersion,
        fullName: fullName || null,
        agreedToTerms: true,
        ipAddress: ipAddress?.toString() || null,
        userAgent: userAgent || null,
        roomSlug,
        platformRole,
      })
      .returning();

    res.json({
      success: true,
      acceptanceId: acceptance.id,
      message: "Agreement accepted and recorded for compliance"
    });
  } catch (error: unknown) {
    log.error("Error recording agreement acceptance:", error);
    res.status(500).json({ error: sanitizeError(error) });
  }
});

router.get('/agreement/check/:roomSlug', async (req: any, res) => {
  try {
    const { roomSlug } = req.params;
    const userId = req.user?.id || req.user?.claims?.sub;
    const sessionId = req.query.sessionId;

    if (!userId && !sessionId) {
      return res.json({ hasAccepted: false });
    }

    const conditions = [];
    if (userId) {
      conditions.push(eq(chatAgreementAcceptances.userId, userId));
    }
    if (sessionId) {
      conditions.push(eq(chatAgreementAcceptances.sessionId, sessionId as string));
    }
    conditions.push(eq(chatAgreementAcceptances.roomSlug, roomSlug));

    const [acceptance] = await db
      .select()
      .from(chatAgreementAcceptances)
      .where(and(...conditions))
      .orderBy(desc(chatAgreementAcceptances.acceptedAt))
      .limit(1);

    res.json({
      hasAccepted: !!acceptance,
      acceptedAt: acceptance?.acceptedAt || null
    });
  } catch (error: unknown) {
    if (error.code === '42P01' || sanitizeError(error)?.includes('does not exist')) {
      return res.json({ hasAccepted: false, acceptedAt: null });
    }
    log.error("Error checking agreement acceptance:", error);
    res.status(500).json({ error: sanitizeError(error) });
  }
});

router.get('/user-context/:userId', async (req: any, res) => {
  try {
    const { userId } = req.params;

    const user = await storage.getUser(userId);
    if (!user) {
      return res.status(404).json({
        error: "User not found",
        suggestion: "This user may not exist in the database or may be a guest user with no account",
        userId
      });
    }

    let workspace = null;
    let workspaceRole = null;
    try {
      workspace = await storage.getWorkspaceByOwnerId(userId) || await storage.getWorkspaceByMembership(userId);
      if (!workspace) {
        const employeeRecords = await db
          .select()
          .from(employees)
          .where(eq(employees.userId, userId))
          .limit(1);
        if (employeeRecords.length > 0) {
          const employee = employeeRecords[0];
          workspace = await db.query.workspaces.findFirst({
            where: eq(workspaces.id, employee.workspaceId)
          });
          workspaceRole = employee.workspaceRole;
        }
      } else {
        workspaceRole = 'org_owner';
      }
    } catch (err) {
      log.error("Error fetching workspace:", err);
    }

    const activeTickets: any[] = [];
    const ticketHistory: any[] = [];

    const recentMessages = await db
      .select()
      .from(chatMessages)
      .where(eq(chatMessages.senderId, userId))
      .orderBy(desc(chatMessages.createdAt))
      .limit(50);

    const platformRole = await storage.getUserPlatformRole(userId);

    const totalTickets = activeTickets.length + ticketHistory.length;
    const resolvedTickets = ticketHistory.filter(t => t.status === 'resolved').length;
    const resolutionRate = totalTickets > 0 ? (resolvedTickets / totalTickets) * 100 : 0;

    res.json({
      user: {
        id: user.id,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        phone: user.phone || null,
        platformRole: platformRole || 'guest',
        createdAt: user.createdAt,
      },
      workspace: workspace ? {
        id: workspace.id,
        name: workspace.name,
        organizationId: workspace.organizationId || null,
        organizationSerial: workspace.organizationSerial || null,
        companyName: workspace.companyName || null,
        subscriptionTier: workspace.subscriptionTier || null,
        subscriptionStatus: workspace.subscriptionStatus || null,
        role: workspaceRole,
      } : null,
      tickets: {
        active: activeTickets.map(t => ({
          id: t.id,
          category: t.category,
          priority: t.priority,
          title: t.title,
          description: t.description,
          status: t.status,
          createdAt: t.createdAt,
        })),
        history: ticketHistory.map(t => ({
          id: t.id,
          category: t.category,
          priority: t.priority,
          title: t.title,
          status: t.status,
          createdAt: t.createdAt,
          resolvedAt: t.resolvedAt,
        })),
      },
      chatHistory: recentMessages.map(m => ({
        message: m.message,
        createdAt: m.createdAt,
        senderType: m.senderType,
      })),
      metrics: {
        totalTickets,
        activeTickets: activeTickets.length,
        resolvedTickets,
        resolutionRate: Math.round(resolutionRate),
        messagesSent: recentMessages.length,
      },
    });
  } catch (error: unknown) {
    log.error("Error fetching user context:", error);
    res.status(500).json({ error: sanitizeError(error) });
  }
});

export default router;
