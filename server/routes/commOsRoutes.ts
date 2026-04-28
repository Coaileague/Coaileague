import { Router } from "express";
import { storage } from "../storage";
import { db } from "../db";
import { eq, and, isNull, or } from "drizzle-orm";
import { supportRooms, auditLogs } from "@shared/schema";
import { requireAuth } from "../auth";
import type { AuthenticatedRequest } from "../rbac";
import { createLogger } from '../lib/logger';
import { z } from 'zod';
const log = createLogger('CommOsRoutes');


const router = Router();

router.get('/rooms', requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const authReq = req as AuthenticatedRequest;
    const userId = authReq.user?.id;
    
    if (!userId) {
      return res.status(401).json({ message: 'Unauthorized' });
    }
    const workspaceId = req.workspaceId;
    // @ts-expect-error — TS migration: fix in refactoring sprint
    const userRole = req.user.role;
    const platformRole = (req.user)?.platformRole;
    const isSupportStaff = !!platformRole && platformRole !== 'none';

    let rooms;
    if (isSupportStaff) {
      rooms = await storage.getAllOrganizationChatRooms();
    } else if (workspaceId) {
      rooms = await storage.getOrganizationChatRoomsByWorkspace(workspaceId);
    } else {
      return res.status(400).json({ message: "No workspace found" });
    }

    res.json(rooms);
  } catch (error: unknown) {
    log.error("Error fetching chat rooms:", error);
    res.status(500).json({ message: "Failed to fetch chat rooms" });
  }
});

router.get('/rooms/live', requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const authReq = req as AuthenticatedRequest;
    const userId = authReq.user?.id;
    
    if (!userId) {
      return res.status(401).json({ message: 'Unauthorized' });
    }
    const workspaceId = req.workspaceId;
    // @ts-expect-error — TS migration: fix in refactoring sprint
    const userRole = req.user.role;
    const platformRole = (req.user)?.platformRole;
    const isSupportStaff = !!platformRole && platformRole !== 'none';

    let orgRooms: any[] = [];
    if (isSupportStaff) {
      orgRooms = await storage.getAllOrganizationChatRooms();
    } else if (workspaceId) {
      orgRooms = await storage.getOrganizationChatRoomsByWorkspace(workspaceId);
    }
    
    const platformSupportRoomsList = await db
      .select()
      .from(supportRooms)
      .where(and(
        or(
          isNull(supportRooms.workspaceId),
          eq(supportRooms.workspaceId, 'system')
        ),
        eq(supportRooms.status, 'open')
      ));
    
    const rooms = [
      ...orgRooms,
      ...platformSupportRoomsList.map(sr => ({
        id: sr.id,
        roomName: sr.name,
        slug: sr.slug,
        workspaceId: null,
        status: sr.status || 'active',
        maxMembers: 1000,
        createdAt: sr.createdAt,
        updatedAt: sr.updatedAt,
        isPlatformRoom: true,
        conversationId: sr.conversationId,
        description: sr.description,
      }))
    ];

    const { getLiveRoomConnections } = await import('../websocket');
    const liveConnections = getLiveRoomConnections();

    const liveRooms = rooms.map((room) => {
      const connectionData = liveConnections.get(room.id) || { onlineUsers: [] };

      return {
        id: room.id,
        roomName: room.roomName,
        slug: room.slug,
        workspaceId: room.workspaceId,
        status: room.status || 'active',
        maxMembers: room.maxMembers || 100,
        currentMembers: connectionData.onlineUsers.length,
        onlineMembers: connectionData.onlineUsers.map(u => ({
          id: u.id,
          name: u.name,
          role: u.isStaff ? 'staff' : 'member',
          status: u.status,
          isStaff: u.isStaff,
        })),
        isJoined: connectionData.onlineUsers.some(u => u.id === userId),
        unreadCount: (connectionData as any).unreadCounts?.[userId] || 0,
        lastActivity: room.updatedAt || room.createdAt,
      };
    });

    res.json(liveRooms);
  } catch (error: unknown) {
    log.error("Error fetching live rooms:", error);
    res.status(500).json({ message: "Failed to fetch live rooms" });
  }
});

router.post('/rooms/:id/join', requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const roomId = req.params.id;
    const authReq = req as AuthenticatedRequest;
    const userId = authReq.user?.id;
    
    if (!userId) {
      return res.status(401).json({ message: 'Unauthorized' });
    }
    
    let room: any = await storage.getOrganizationChatRoom(roomId);
    let isSupportRoom = false;
    
    if (!room) {
      const [supportRoom] = await db
        .select()
        .from(supportRooms)
        .where(eq(supportRooms.id, roomId))
        .limit(1);
      
      if (supportRoom) {
        room = {
          id: supportRoom.id,
          roomName: supportRoom.name,
          slug: supportRoom.slug,
          workspaceId: supportRoom.workspaceId,
          status: supportRoom.status,
          conversationId: supportRoom.conversationId,
        };
        isSupportRoom = true;
      }
    }
    
    if (!room) {
      return res.status(404).json({ message: "Room not found" });
    }
    
    const workspaceId = req.workspaceId;
    // @ts-expect-error — TS migration: fix in refactoring sprint
    const userRole = req.user.role;
    const platformRole = (req.user)?.platformRole;
    const isSupportStaff = !!platformRole && platformRole !== 'none';
    
    if (!isSupportRoom || room.workspaceId !== null) {
      if (!isSupportStaff && room.workspaceId !== workspaceId) {
        return res.status(403).json({ message: "Access denied" });
      }
    }
    
    res.json({ 
      success: true,
      message: "You can now connect to this room via WebSocket",
      roomId: room.id,
      conversationId: room.conversationId || room.id,
    });
  } catch (error: unknown) {
    log.error("Error joining room:", error);
    res.status(500).json({ message: "Failed to join room" });
  }
});

router.post('/rooms/:id/leave', requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const roomId = req.params.id;
    
    res.json({ 
      success: true,
      message: "Disconnected from room",
      roomId,
    });
  } catch (error: unknown) {
    log.error("Error leaving room:", error);
    res.status(500).json({ message: "Failed to leave room" });
  }
});

router.get('/messages/search', requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const authReq = req as AuthenticatedRequest;
    const userId = authReq.user?.id;
    
    if (!userId) {
      return res.status(401).json({ message: 'Unauthorized' });
    }
    const workspaceId = req.workspaceId;
    // @ts-expect-error — TS migration: fix in refactoring sprint
    const userRole = req.user.role;
    const platformRole = (req.user)?.platformRole;
    const isSupportStaff = !!platformRole && platformRole !== 'none';
    
    const { query, roomId, startDate, endDate, limit = 50 } = req.query;
    
    if (!query && !roomId && !startDate && !endDate) {
      return res.status(400).json({ message: "Must provide at least one filter (query, roomId, or date range)" });
    }
    
    let accessibleRooms;
    if (isSupportStaff) {
      accessibleRooms = await storage.getAllOrganizationChatRooms();
    } else if (workspaceId) {
      accessibleRooms = await storage.getOrganizationChatRoomsByWorkspace(workspaceId);
    } else {
      return res.status(400).json({ message: "No workspace found" });
    }
    
    const roomIds = roomId ? [roomId as string] : accessibleRooms.map(r => r.id);
    
    const results = [];
    for (const conversationId of roomIds) {
      // @ts-expect-error — TS migration: fix in refactoring sprint
      const messages = await storage.getChatMessagesByConversation(conversationId);
      
      let filteredMessages = messages;
      
      if (query) {
        const searchTerm = (query as string).toLowerCase();
        filteredMessages = filteredMessages.filter(m => 
          (m as any).messageContent?.toLowerCase().includes(searchTerm) ||
          m.senderName?.toLowerCase().includes(searchTerm)
        );
      }
      
      if (startDate) {
        const start = new Date(startDate as string);
        // @ts-expect-error — TS migration: fix in refactoring sprint
        filteredMessages = filteredMessages.filter(m => new Date(m.createdAt) >= start);
      }
      if (endDate) {
        const end = new Date(endDate as string);
        // @ts-expect-error — TS migration: fix in refactoring sprint
        filteredMessages = filteredMessages.filter(m => new Date(m.createdAt) <= end);
      }
      
      const room = accessibleRooms.find(r => r.id === conversationId);
      const messagesWithContext = filteredMessages.map(m => ({
        ...m,
        roomName: room?.roomName || 'Unknown Room',
        roomId: conversationId,
      }));
      
      results.push(...messagesWithContext);
    }
    
    const sortedResults = results
      // @ts-expect-error — TS migration: fix in refactoring sprint
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
      .slice(0, Math.min(Math.max(1, Number(limit) || 50), 200));
    
    res.json({
      results: sortedResults,
      totalCount: results.length,
      limit: Math.min(Math.max(1, Number(limit) || 50), 200),
    });
  } catch (error: unknown) {
    log.error("Error searching messages:", error);
    res.status(500).json({ message: "Failed to search messages" });
  }
});

router.get('/onboarding-status', requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const workspaceId = req.workspaceId;
    if (!workspaceId) {
      return res.status(400).json({ message: "No workspace found" });
    }

    const onboarding = await storage.getOrganizationRoomOnboarding(workspaceId);
    if (!onboarding) {
      return res.json({ isCompleted: false, currentStep: 0 });
    }

    res.json(onboarding);
  } catch (error: unknown) {
    log.error("Error fetching onboarding status:", error);
    res.status(500).json({ message: "Failed to fetch onboarding status" });
  }
});

router.post('/complete-onboarding', requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const authReq = req as AuthenticatedRequest;
    const userId = authReq.user?.id;
    
    if (!userId) {
      return res.status(401).json({ message: 'Unauthorized' });
    }
    const workspaceId = req.workspaceId;
    if (!workspaceId) {
      return res.status(400).json({ message: "No workspace found" });
    }

    const { roomName, roomDescription, channels, allowGuests } = req.body;

    if (!roomName || !roomName.trim()) {
      return res.status(400).json({ message: "Room name is required" });
    }

    const existingRooms = await storage.getOrganizationChatRoomsByWorkspace(workspaceId);
    const activeRooms = existingRooms.filter(r => r.status === 'active');
    if (activeRooms.length >= 10) {
      return res.status(400).json({ 
        message: "Organization has reached maximum of 10 active rooms. Please close an existing room before creating a new one." 
      });
    }

    const room = await storage.completeOrganizationOnboarding(workspaceId, userId, {
      roomName: roomName.trim(),
      roomDescription: roomDescription?.trim(),
      channels: channels || [],
      allowGuests: allowGuests !== false,
    });

    await db.insert(auditLogs).values({
      workspaceId: workspaceId,
      userId: userId,
      userName: req.user?.email || 'system',
      userRole: req.user?.role || 'employee',
      rawAction: 'room_created',
      entityType: 'organization_chat_room',
      entityId: room.id,
      changesAfter: {
        roomName: room.roomName,
        channelCount: (channels || []).length,
        timestamp: new Date().toISOString(),
      },
      ipAddress: req.ip || 'unknown',
      userAgent: req.headers['user-agent'] || 'unknown',
    });

    res.json({ message: "Onboarding completed successfully", room });
  } catch (error: unknown) {
    log.error("Error completing onboarding:", error);
    res.status(500).json({ message: "Failed to complete onboarding" });
  }
});

router.post('/rooms/:id/suspend', requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const authReq = req as AuthenticatedRequest;
    const userId = authReq.user?.id;
    
    if (!userId) {
      return res.status(401).json({ message: 'Unauthorized' });
    }
    const roomId = req.params.id;
    const { reason } = req.body;
    // @ts-expect-error — TS migration: fix in refactoring sprint
    const userRole = req.user.role;
    const platformRole = (req.user)?.platformRole;
    const isSupportStaff = !!platformRole && platformRole !== 'none';

    if (!isSupportStaff) {
      return res.status(403).json({ message: "Only support staff can suspend rooms" });
    }

    if (!reason || !reason.trim()) {
      return res.status(400).json({ message: "Suspension reason is required" });
    }

    const room = await storage.getOrganizationChatRoom(roomId);
    if (!room) {
      return res.status(404).json({ message: "Room not found" });
    }

    await storage.suspendOrganizationChatRoom(roomId, userId, reason);

    await db.insert(auditLogs).values({
      workspaceId: room.workspaceId,
      userId: userId,
      userName: req.user?.email || 'system',
      userRole: req.user?.role || 'employee',
      rawAction: 'room_suspended',
      entityType: 'organization_chat_room',
      entityId: roomId,
      changesAfter: {
        reason,
        suspendedBy: userId,
        timestamp: new Date().toISOString(),
      },
      ipAddress: req.ip || 'unknown',
      userAgent: req.headers['user-agent'] || 'unknown',
    });

    res.json({ message: "Room suspended successfully" });
  } catch (error: unknown) {
    log.error("Error suspending room:", error);
    res.status(500).json({ message: "Failed to suspend room" });
  }
});

router.post('/rooms/:id/lift-suspension', requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const authReq = req as AuthenticatedRequest;
    const userId = authReq.user?.id;
    
    if (!userId) {
      return res.status(401).json({ message: 'Unauthorized' });
    }
    const roomId = req.params.id;
    // @ts-expect-error — TS migration: fix in refactoring sprint
    const userRole = req.user.role;
    const platformRole = (req.user)?.platformRole;
    const isSupportStaff = !!platformRole && platformRole !== 'none';

    if (!isSupportStaff) {
      return res.status(403).json({ message: "Only support staff can lift room suspensions" });
    }

    const room = await storage.getOrganizationChatRoom(roomId);
    if (!room) {
      return res.status(404).json({ message: "Room not found" });
    }

    await storage.liftOrganizationChatRoomSuspension(roomId);

    await db.insert(auditLogs).values({
      workspaceId: room.workspaceId,
      userId: userId,
      userName: req.user?.email || 'system',
      userRole: req.user?.role || 'employee',
      rawAction: 'room_suspension_lifted',
      entityType: 'organization_chat_room',
      entityId: roomId,
      changesAfter: {
        liftedBy: userId,
        timestamp: new Date().toISOString(),
      },
      ipAddress: req.ip || 'unknown',
      userAgent: req.headers['user-agent'] || 'unknown',
    });

    res.json({ message: "Suspension lifted successfully" });
  } catch (error: unknown) {
    log.error("Error lifting suspension:", error);
    res.status(500).json({ message: "Failed to lift suspension" });
  }
});

export default router;
