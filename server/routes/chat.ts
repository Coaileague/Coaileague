import { sanitizeError } from '../middleware/errorHandler';
import crypto from 'crypto';
import { Router, type Request, type Response } from "express";
import { db } from "../db";
import { storage } from "../storage";
import { requireAuth, requireAnyAuth } from "../auth";
import { requireManager, type AuthenticatedRequest } from "../rbac";
import {
  chatConversationLimiter,
  chatUploadLimiter,
  chatMessageLimiter,
  readLimiter,
} from "../middleware/rateLimiter";
import {
  typingIndicators,
  chatMacros,
  insertChatConversationSchema,
  insertChatMessageSchema,
  editChatMessageSchema,
  insertChatMacroSchema,
} from "@shared/schema";
import { and, desc, eq, or, sql } from 'drizzle-orm';
import PDFDocument from "pdfkit";
import { unreadMessageService } from "../services/unreadMessageService";
import { createLogger } from '../lib/logger';
import { PLATFORM_WORKSPACE_ID } from '../services/billing/billingConstants';
import { PLATFORM } from '../config/platformConfig';
import { InsertChatConversation } from '@shared/schema';
const log = createLogger('Chat');


const router = Router();

// ============================================================================
// CHAT API ROUTES
// ============================================================================
  router.get('/api/chat/conversations', requireAnyAuth, async (req: AuthenticatedRequest, res) => {
    try {
      const authReq = req as AuthenticatedRequest;
      const userId = authReq.user?.id;
      
      // For unauthenticated users, return success (frontend handles localStorage)
      if (!userId) {
        return res.status(401).json({ message: 'Unauthorized' });
      }
      
      // Check if user is platform admin/staff
      const platformRole = await storage.getUserPlatformRole(userId);
      
      if (platformRole && ['root', 'deputy_admin', 'deputy_assistant', 'sysop'].includes(platformRole)) {
        // Platform staff can see ALL conversations across all workspaces
        const status = req.query.status as string | undefined;
        const allConversations = await storage.getAllChatConversations({ status });
        return res.json(allConversations);
      }
      
      // Regular workspace users see only their workspace conversations
      const workspace = await storage.getWorkspaceByOwnerId(userId) || 
                        await storage.getWorkspaceByMembership(userId);
      
      if (!workspace) {
        return res.status(404).json({ message: "Workspace not found" });
      }

      const status = req.query.status as string | undefined;
      const conversations = await storage.getChatConversationsByWorkspace(workspace.id, { status });
      res.json(conversations);
    } catch (error) {
      log.error("Error fetching conversations:", error);
      res.status(500).json({ message: "Failed to fetch conversations" });
    }
  });

  // Create new conversation
  router.post('/api/chat/conversations', requireAuth, async (req: any, res) => {
    try {
      const userId = req.user?.id || req.user?.claims?.sub;
      const workspace = await storage.getWorkspaceByOwnerId(userId) || 
                        await storage.getWorkspaceByMembership(userId);
      
      if (!workspace) {
        return res.status(404).json({ message: "Workspace not found" });
      }

      const validated = insertChatConversationSchema.parse({
        ...req.body,
        workspaceId: workspace.id,
      });

      const conversation = await storage.createChatConversation(validated);
      res.status(201).json(conversation);
    } catch (error: unknown) {
      log.error("Error creating conversation:", error);
      res.status(400).json({ message: sanitizeError(error) || "Failed to create conversation" });
    }
  });

  // Get conversation messages
  router.get('/api/chat/conversations/:id/messages', requireAnyAuth, async (req: AuthenticatedRequest, res) => {
    try {
      const { id } = req.params;
      const authReq = req as AuthenticatedRequest;
      const userId = authReq.user?.id;
      
      // For unauthenticated users, return success (frontend handles localStorage)
      if (!userId) {
        return res.status(401).json({ message: 'Unauthorized' });
      }
      
      // Check if user is platform admin/staff
      const platformRole = await storage.getUserPlatformRole(userId);
      
      if (platformRole && ['root', 'deputy_admin', 'deputy_assistant', 'sysop'].includes(platformRole)) {
        // Platform staff can view ANY conversation's messages (full security/monitoring access)
        const messages = await storage.getChatMessagesByConversation(id);
        
        // Batch lookup sender info (N+1 query optimization)
        const senderIds = messages.map(m => m.senderId).filter(Boolean) as string[];
        const [roleMap, infoMap] = await Promise.all([
          storage.getUserPlatformRolesBatch(senderIds),
          storage.getUserDisplayInfoBatch(senderIds),
        ]);
        
        // Enrich messages with sender's platform role for frontend display
        const enrichedMessages = messages.map((msg) => {
          if (!msg.senderId || msg.senderId === 'system' || msg.senderId === 'ai-bot') {
            return { ...msg, role: msg.senderId === 'ai-bot' ? 'bot' : 'system', userType: 'system' };
          }
          const senderRole = roleMap.get(msg.senderId);
          const userInfo = infoMap.get(msg.senderId);
          return { 
            ...msg, 
            role: senderRole || 'guest',
            userType: userInfo?.userType || 'guest'
          };
        });
        
        return res.json(enrichedMessages);
      }
      
      // Regular workspace users need workspace verification
      const workspace = await storage.getWorkspaceByOwnerId(userId) || 
                        await storage.getWorkspaceByMembership(userId);
      
      if (!workspace) {
        return res.status(404).json({ message: "Workspace not found" });
      }

      // Verify conversation belongs to workspace
      const conversation = await storage.getChatConversation(id);
      if (!conversation || conversation.workspaceId !== workspace.id) {
        return res.status(403).json({ message: "Unauthorized" });
      }

      await storage.ensureChatParticipant(id, userId);

      const messages = await storage.getChatMessagesByConversation(id);
      
      // Batch lookup sender info (N+1 query optimization)
      const senderIds = messages.map(m => m.senderId).filter(Boolean) as string[];
      const [roleMap, infoMap] = await Promise.all([
        storage.getUserPlatformRolesBatch(senderIds),
        storage.getUserDisplayInfoBatch(senderIds),
      ]);
      
      // Enrich messages with sender's platform role for frontend display
      const enrichedMessages = messages.map((msg) => {
        if (!msg.senderId || msg.senderId === 'system' || msg.senderId === 'ai-bot') {
          return { ...msg, role: msg.senderId === 'ai-bot' ? 'bot' : 'system', userType: 'system' };
        }
        const senderRole = roleMap.get(msg.senderId);
        const userInfo = infoMap.get(msg.senderId);
        return { 
          ...msg, 
          role: senderRole || 'guest',
          userType: userInfo?.userType || 'guest'
        };
      });
      
      res.json(enrichedMessages);
    } catch (error) {
      log.error("Error fetching messages:", error);
      res.status(500).json({ message: "Failed to fetch messages" });
    }
  });

  // Update conversation (assign agent, change status, etc.)
  router.patch('/api/chat/conversations/:id', requireAuth, async (req: any, res) => {
    try {
      const { id } = req.params;
      const userId = req.user?.id || req.user?.claims?.sub;
      const workspace = await storage.getWorkspaceByOwnerId(userId) || 
                        await storage.getWorkspaceByMembership(userId);
      
      if (!workspace) {
        return res.status(404).json({ message: "Workspace not found" });
      }

      // Verify conversation belongs to workspace
      const conversation = await storage.getChatConversation(id);
      if (!conversation || conversation.workspaceId !== workspace.id) {
        return res.status(403).json({ message: "Unauthorized" });
      }
      
      const validated = insertChatConversationSchema
        .partial()
        .omit({ workspaceId: true })
        .parse(req.body);
      
      const updated = await storage.updateChatConversation(id, validated);
      
      if (!updated) {
        return res.status(404).json({ message: "Conversation not found" });
      }

      res.json(updated);
    } catch (error: unknown) {
      log.error("Error updating conversation:", error);
      res.status(400).json({ message: sanitizeError(error) || "Failed to update conversation" });
    }
  });

  // Close conversation
  router.post('/api/chat/conversations/:id/close', requireAuth, async (req: any, res) => {
    try {
      const { id } = req.params;
      const userId = req.user?.id || req.user?.claims?.sub;
      const workspace = await storage.getWorkspaceByOwnerId(userId) || 
                        await storage.getWorkspaceByMembership(userId);
      
      if (!workspace) {
        return res.status(404).json({ message: "Workspace not found" });
      }

      // Verify conversation belongs to workspace
      const conversation = await storage.getChatConversation(id);
      if (!conversation || conversation.workspaceId !== workspace.id) {
        return res.status(403).json({ message: "Unauthorized" });
      }

      const closed = await storage.closeChatConversation(id);
      
      if (!closed) {
        return res.status(404).json({ message: "Conversation not found" });
      }

      res.json(closed);
    } catch (error) {
      log.error("Error closing conversation:", error);
      res.status(500).json({ message: "Failed to close conversation" });
    }
  });

  // ============================================================================
  // LIVE CHATROOM (IRC/MSN Style - Single Room Always Open)
  // ============================================================================
  
  const MAIN_ROOM_ID = 'main-chatroom-workforceos';
  
  // Get or create main chatroom
  router.get('/api/chat/main-room', requireAnyAuth, async (req: AuthenticatedRequest, res) => {
    try {
      let mainRoom = await storage.getChatConversation(MAIN_ROOM_ID);
      
      // Create main room if it doesn't exist
      if (!mainRoom) {
        mainRoom = await storage.createChatConversation({
          id: MAIN_ROOM_ID,
          workspaceId: PLATFORM_WORKSPACE_ID, // Use actual platform workspace
          customerName: 'Main Chatroom',
          customerEmail: 'chatroom@coaileague.com',
          subject: `${PLATFORM.name} Live Support Chat`,
          isActive: true,
          priority: 'medium',
          isSilenced: false,
          lastMessageAt: new Date(),
        });
      }
      
      res.json(mainRoom);
    } catch (error) {
      log.error("Error getting main room:", error);
      res.status(500).json({ message: "Failed to get main room" });
    }
  });
  
  // Get all messages from main room (live feed)
  router.get('/api/chat/main-room/messages', requireAnyAuth, async (req: AuthenticatedRequest, res) => {
    try {
      // Ensure room exists first
      let mainRoom = await storage.getChatConversation(MAIN_ROOM_ID);
      if (!mainRoom) {
        mainRoom = await storage.createChatConversation({
          id: MAIN_ROOM_ID,
          workspaceId: PLATFORM_WORKSPACE_ID,
          customerName: 'Main Chatroom',
          customerEmail: 'chatroom@coaileague.com',
          subject: `${PLATFORM.name} Live Support Chat`,
          isActive: true,
          priority: 'medium',
          isSilenced: false,
          lastMessageAt: new Date(),
        });
      }
      
      const messages = await storage.getChatMessagesByConversation(MAIN_ROOM_ID);
      res.json(messages);
    } catch (error) {
      log.error("Error fetching main room messages:", error);
      res.status(500).json({ message: "Failed to fetch messages" });
    }
  });
  
  // Send message to main room
  router.post('/api/chat/main-room/messages', requireAnyAuth, async (req: AuthenticatedRequest, res) => {
    try {
      const authReq = req as AuthenticatedRequest;
      const userId = authReq.user?.id;
      
      // For unauthenticated users, return success (frontend handles localStorage)
      if (!userId) {
        return res.status(401).json({ message: 'Unauthorized' });
      }
      const user = req.user!;
      
      // Ensure room exists
      let mainRoom = await storage.getChatConversation(MAIN_ROOM_ID);
      if (!mainRoom) {
        mainRoom = await storage.createChatConversation({
          id: MAIN_ROOM_ID,
          workspaceId: PLATFORM_WORKSPACE_ID,
          customerName: 'Main Chatroom',
          customerEmail: 'chatroom@coaileague.com',
          subject: `${PLATFORM.name} Live Support Chat`,
          isActive: true,
          priority: 'medium',
          isSilenced: false,
          lastMessageAt: new Date(),
        });
      }
      
      const { message, messageType = "text" } = req.body;
      
      if (!message || !message.trim()) {
        return res.status(400).json({ message: "Message content is required" });
      }
      
      // Determine sender name and type
      const platformRole = await storage.getUserPlatformRole(userId);
      const senderType = platformRole ? 'support' : 'customer';
      const { formatUserDisplayNameForChat } = await import('../utils/formatUserDisplayName');
      const senderName = formatUserDisplayNameForChat({
        firstName: user.firstName,
        lastName: user.lastName,
        email: user.email || undefined,
        platformRole: platformRole || undefined,
      });
      
      const newMessage = await storage.createChatMessage({
        conversationId: MAIN_ROOM_ID,
        senderId: userId,
        senderName,
        senderType,
        message: message.trim(),
        messageType,
        isRead: false,
      });
      
      // Update last message timestamp
      await storage.updateChatConversation(MAIN_ROOM_ID, {
        lastMessageAt: new Date(),
      });
      
      res.status(201).json(newMessage);
    } catch (error: unknown) {
      log.error("Error sending message:", error);
      res.status(400).json({ message: sanitizeError(error) || "Failed to send message" });
    }
  });

  // Grant voice to user (remove silence) - Managers and Owners only
  router.post('/api/chat/conversations/:id/grant-voice', requireManager, async (req: any, res) => {
    try {
      const { id } = req.params;
      const userId = req.user?.id;
      const userName = req.user?.email || 'Support Agent';
      
      // Get conversation first to determine workspace
      const conversation = await storage.getChatConversation(id);
      if (!conversation) {
        return res.status(404).json({ message: "Conversation not found" });
      }

      // CRITICAL: Verify user's workspace matches conversation's workspace (tenant scoping)
      // requireManager already validates role, now we validate workspace membership
      const userWorkspace = await storage.getWorkspaceByOwnerId(userId) || 
                           await storage.getWorkspaceByMembership(userId);
      
      // If user is not the owner, they might be a manager - check workspaceId from request
      const workspaceId = req.workspaceId || userWorkspace?.id;
      
      if (!workspaceId || workspaceId !== conversation.workspaceId) {
        return res.status(403).json({ message: "Access denied: Conversation belongs to a different workspace" });
      }

      // Grant voice (remove silence)
      const updated = await storage.updateChatConversation(id, {
        isSilenced: false,
        voiceGrantedBy: userId,
        voiceGrantedAt: new Date(),
      });

      // Send system message about voice being granted
      const { HelpBotService } = await import('./ai/help-bot');
      const systemMessage = await HelpBotService.generateVoiceGrantedMessage(userName);
      
      await storage.createChatMessage({
        conversationId: id,
        senderName: 'help_bot',
        senderType: 'bot',
        message: systemMessage,
        messageType: 'system',
      });

      res.json(updated);
    } catch (error) {
      log.error("Error granting voice:", error);
      res.status(500).json({ message: "Failed to grant voice" });
    }
  });

  // Help bot: Send AI response
  router.post('/api/chat/help-bot/respond', requireAuth, async (req: any, res) => {
    try {
      const { conversationId, userMessage, previousMessages } = req.body;
      const userId = req.user?.id || req.user?.claims?.sub;
      const workspace = await storage.getWorkspaceByOwnerId(userId) || 
                        await storage.getWorkspaceByMembership(userId);
      
      if (!workspace) {
        return res.status(404).json({ message: "Workspace not found" });
      }

      // Verify conversation belongs to workspace
      const conversation = await storage.getChatConversation(conversationId);
      if (!conversation || conversation.workspaceId !== workspace.id) {
        return res.status(403).json({ message: "Unauthorized" });
      }

      const { HelpBotService } = await import('./ai/help-bot');
      const botResponse = await HelpBotService.generateResponse(userMessage, {
        conversationId,
        customerName: conversation.customerName || undefined,
        customerEmail: conversation.customerEmail || undefined,
        previousMessages,
        workspaceId: workspace.id, // CRITICAL: Required for billing tracking
        userId, // Track which user initiated the request
      });

      // Save bot response as message
      const message = await storage.createChatMessage({
        conversationId,
        senderName: 'help_bot',
        senderType: 'bot',
        message: botResponse,
        messageType: 'text',
      });

      res.json(message);
    } catch (error) {
      log.error("Error generating bot response:", error);
      res.status(500).json({ message: "Failed to generate bot response" });
    }
  });

  // Gemini AI: Generate chat response (with usage-based billing)
  router.post('/api/chat/gemini', requireAnyAuth, chatMessageLimiter, async (req: AuthenticatedRequest, res) => {
    try {
      const { message, conversationHistory, systemPrompt } = req.body;
      
      if (!message || typeof message !== 'string') {
        return res.status(400).json({ message: "Message is required" });
      }

      const { generateGeminiResponse, isGeminiAvailable } = await import('./gemini');
      
      if (!isGeminiAvailable()) {
        return res.status(503).json({ 
          message: "Gemini AI is not configured. Please contact support.",
          available: false 
        });
      }

      // PUBLIC ACCESS: Guests can access chat but AI features require workspace for billing
      // Workspace users get AI assistance (billed), guests get human support only
      const workspaceId = req.workspaceId || req.user?.workspaceId;
      if (!workspaceId) {
        // Gracefully disable AI for guests instead of blocking chat access
        return res.status(200).json({ 
          message: "AI features are available to workspace members only. A human support agent will assist you shortly.",
          available: false,
          guestMode: true
        });
      }

      const userId = req.user?.id || req.user?.claims?.sub;

      // Generate AI response with billing (workspace users only)
      const response = await generateGeminiResponse({
        message,
        conversationHistory: conversationHistory || [],
        systemPrompt,
        workspaceId, // Track usage per workspace for billing (REQUIRED)
        userId, // Track which user initiated the request
      });

      res.json({ 
        response,
        available: true 
      });
    } catch (error: unknown) {
      log.error("Error generating Gemini response:", error);
      res.status(500).json({ 
        message: sanitizeError(error) || "Failed to generate AI response",
        available: false 
      });
    }
  });

  // Check Gemini AI availability
  router.get('/api/chat/gemini/status', requireAnyAuth, async (req: AuthenticatedRequest, res) => {
    try {
      const { isGeminiAvailable } = await import('./gemini');
      const available = isGeminiAvailable();
      
      res.json({ 
        available,
        message: available ? "Gemini AI is ready" : "Gemini AI is not configured"
      });
    } catch (error: unknown) {
      log.error("Error checking Gemini status:", error);
      res.status(500).json({ 
        available: false,
        message: "Failed to check AI status" 
      });
    }
  });

  // ============================================================================
  // CHAT MACROS & TYPING INDICATORS (Premium Chat Features)
  // ============================================================================

  // Get all chat macros for workspace - Support agents only
  router.get('/api/chat/macros', requireAnyAuth, async (req: AuthenticatedRequest, res) => {
    try {
      const authReq = req as AuthenticatedRequest;
      const userId = authReq.user?.id;
      
      // For unauthenticated users, return success (frontend handles localStorage)
      if (!userId) {
        return res.status(401).json({ message: 'Unauthorized' });
      }
      
      // RBAC: Only support agents can access macros
      const platformRole = await storage.getUserPlatformRole(userId);
      if (!platformRole || !['root', 'deputy_admin', 'deputy_assistant', 'sysop', 'support'].includes(platformRole)) {
        return res.status(403).json({ message: "Unauthorized - Support agent access required" });
      }
      
      // Get workspace for the user (optional workspaceId query param for platform staff)
      const workspaceId = req.query.workspaceId as string | undefined;
      let workspace;
      
      if (workspaceId) {
        // Platform staff can query any workspace
        workspace = await storage.getWorkspace(workspaceId);
      } else {
        // Default to user's own workspace
        workspace = await storage.getWorkspaceByOwnerId(userId) || 
                          await storage.getWorkspaceByMembership(userId);
      }
      
      // Return BOTH workspace-specific macros AND global macros
      const macros = await db
        .select()
        .from(chatMacros)
        .where(
          workspace?.id 
            ? or(
                eq(chatMacros.workspaceId, workspace.id),
                sql`${chatMacros.workspaceId} IS NULL`
              )
            : sql`${chatMacros.workspaceId} IS NULL`
        )
        .orderBy(chatMacros.category, chatMacros.title);
      
      res.json(macros);
    } catch (error: unknown) {
      log.error("Error fetching chat macros:", error);
      res.status(500).json({ message: "Failed to fetch chat macros" });
    }
  });

  // Create new chat macro - Support agents only
  router.post('/api/chat/macros', requireAnyAuth, async (req: AuthenticatedRequest, res) => {
    try {
      const authReq = req as AuthenticatedRequest;
      const userId = authReq.user?.id;
      
      // For unauthenticated users, return success (frontend handles localStorage)
      if (!userId) {
        return res.status(401).json({ message: 'Unauthorized' });
      }
      
      // RBAC: Only support agents can create macros
      const platformRole = await storage.getUserPlatformRole(userId);
      if (!platformRole || !['root', 'deputy_admin', 'deputy_assistant', 'sysop', 'support'].includes(platformRole)) {
        return res.status(403).json({ message: "Unauthorized - Support agent access required" });
      }
      
      // Validate request body (workspaceId can be explicitly provided or auto-detected)
      const validatedData = insertChatMacroSchema.parse({
        ...req.body,
        createdBy: userId,
      });
      
      // Determine target workspace
      let targetWorkspaceId = validatedData.workspaceId;
      
      if (!targetWorkspaceId) {
        // Auto-detect workspace if not provided
        const workspace = await storage.getWorkspaceByOwnerId(userId) || 
                          await storage.getWorkspaceByMembership(userId);
        targetWorkspaceId = workspace?.id || null;
      } else {
        // Validate workspace exists if explicitly provided
        const workspace = await storage.getWorkspace(targetWorkspaceId);
        if (!workspace) {
          return res.status(404).json({ message: "Workspace not found" });
        }
      }
      
      // Check for duplicate shortcut in target workspace scope
      if (validatedData.shortcut) {
        const existing = await db
          .select()
          .from(chatMacros)
          .where(
            and(
              targetWorkspaceId 
                ? eq(chatMacros.workspaceId, targetWorkspaceId)
                : sql`${chatMacros.workspaceId} IS NULL`,
              eq(chatMacros.shortcut, validatedData.shortcut)
            )
          )
          .limit(1);
        
        if (existing.length > 0) {
          return res.status(409).json({ message: "A macro with this shortcut already exists in this workspace" });
        }
      }
      
      // Create the macro with explicit workspace assignment
      const [macro] = await db
        .insert(chatMacros)
        .values({
          ...validatedData,
          workspaceId: targetWorkspaceId,
        })
        .returning();
      
      res.status(201).json(macro);
    } catch (error: unknown) {
      log.error("Error creating chat macro:", error);
      if (error instanceof Error && error.name === 'ZodError') {
        return res.status(400).json({ message: "Invalid macro data", errors: (error as any).errors });
      }
      res.status(500).json({ message: "Failed to create chat macro" });
    }
  });

  // Delete chat macro - Support agents only
  router.delete('/api/chat/macros/:id', requireAnyAuth, async (req: AuthenticatedRequest, res) => {
    try {
      const authReq = req as AuthenticatedRequest;
      const userId = authReq.user?.id;
      
      // For unauthenticated users, return success (frontend handles localStorage)
      if (!userId) {
        return res.status(401).json({ message: 'Unauthorized' });
      }
      const { id } = req.params;
      
      // RBAC: Only support agents can delete macros
      const platformRole = await storage.getUserPlatformRole(userId);
      if (!platformRole || !['root', 'deputy_admin', 'deputy_assistant', 'sysop', 'support'].includes(platformRole)) {
        return res.status(403).json({ message: "Unauthorized - Support agent access required" });
      }
      
      // Get workspace for the user
      const workspace = await storage.getWorkspaceByOwnerId(userId) || 
                        await storage.getWorkspaceByMembership(userId);
      
      // Verify macro exists and belongs to user's workspace
      const macro = await db
        .select()
        .from(chatMacros)
        .where(eq(chatMacros.id, id))
        .limit(1);
      
      if (!macro.length) {
        return res.status(404).json({ message: "Macro not found" });
      }
      
      // Verify workspace ownership (or null for global)
      if (macro[0].workspaceId && macro[0].workspaceId !== workspace?.id) {
        return res.status(403).json({ message: "Unauthorized - Cannot delete macros from other workspaces" });
      }
      
      // Delete the macro
      await db.delete(chatMacros).where(eq(chatMacros.id, id));
      
      res.json({ message: "Macro deleted successfully" });
    } catch (error: unknown) {
      log.error("Error deleting chat macro:", error);
      res.status(500).json({ message: "Failed to delete chat macro" });
    }
  });

  // Start typing indicator
  router.post('/api/chat/conversations/:id/typing', requireAnyAuth, async (req: AuthenticatedRequest, res) => {
    try {
      const authReq = req as AuthenticatedRequest;
      const userId = authReq.user?.id;
      
      // For unauthenticated users, return success (frontend handles localStorage)
      if (!userId) {
        return res.status(401).json({ message: 'Unauthorized' });
      }
      const user = req.user!;
      const { id: conversationId } = req.params;
      
      // SECURITY: Verify conversation exists and user is a participant
      const conversation = await storage.getChatConversation(conversationId);
      if (!conversation) {
        return res.status(404).json({ message: "Conversation not found" });
      }
      
      // SECURITY: Verify user is a participant or workspace member
      const isParticipant = conversation.participantIds?.includes(userId);
      const isCreator = conversation.creatorId === userId;
      let isWorkspaceMember = false;
      
      if (!isParticipant && !isCreator && conversation.workspaceId) {
        const workspace = await storage.getWorkspaceByOwnerId(userId) || 
                          await storage.getWorkspaceByMembership(userId);
        if (workspace && workspace.id === conversation.workspaceId) {
          isWorkspaceMember = true;
          await storage.ensureChatParticipant(conversationId, userId);
        }
      }
      
      if (!isParticipant && !isCreator && !isWorkspaceMember) {
        return res.status(403).json({ message: "Unauthorized - Not a participant in this conversation" });
      }
      
      // SECURITY: Verify workspace alignment (if conversation is workspace-scoped)
      if (conversation.workspaceId && !isWorkspaceMember) {
        const workspace = await storage.getWorkspaceByOwnerId(userId) || 
                          await storage.getWorkspaceByMembership(userId);
        
        if (!workspace || workspace.id !== conversation.workspaceId) {
          return res.status(403).json({ message: "Unauthorized - Conversation belongs to different workspace" });
        }
      }
      
      // Upsert typing indicator (overwrite if exists)
      await db
        .insert(typingIndicators)
        .values({
          workspaceId: workspaceId,
          conversationId,
          userId,
          userName: user.displayName || user.username || "Anonymous",
        })
        .onConflictDoUpdate({
          target: [typingIndicators.conversationId, typingIndicators.userId],
          set: {
            startedAt: sql`NOW()`,
            userName: user.displayName || user.username || "Anonymous",
          },
        });
      
      res.json({ message: "Typing indicator started" });
    } catch (error: unknown) {
      log.error("Error starting typing indicator:", error);
      res.status(500).json({ message: "Failed to start typing indicator" });
    }
  });

  // Stop typing indicator
  router.delete('/api/chat/conversations/:id/typing', requireAnyAuth, async (req: AuthenticatedRequest, res) => {
    try {
      const conversationId = req.params.id;
      const authReq = req as AuthenticatedRequest;
      const userId = authReq.user?.id;
      
      if (!userId) {
        return res.status(401).json({ message: 'Unauthorized' });
      }

      // Delete typing indicator for this user
      await db.delete(typingIndicators).where(
        and(
          eq(typingIndicators.conversationId, conversationId),
          eq(typingIndicators.userId, userId)
        )
      );
      
      res.json({ message: "Typing indicator stopped" });
    } catch (error: unknown) {
      log.error("Error stopping typing indicator:", error);
      res.status(500).json({ message: "Failed to stop typing indicator" });
    }
  });

// ============================================================================
// CHAT CREATE ENDPOINT
// ============================================================================

  router.post('/api/chats/create', requireAuth, chatConversationLimiter, async (req: AuthenticatedRequest, res) => {
    try {
      const workspaceId = req.workspaceId!;
      const authReq = req as AuthenticatedRequest;
      const userId = authReq.user?.id;
      
      // For unauthenticated users, return success (frontend handles localStorage)
      if (!userId) {
        return res.status(401).json({ message: 'Unauthorized' });
      }
      const user = await storage.getUser(userId);
      
      if (!user) {
        return res.status(404).json({ message: "User not found" });
      }
      
      const {
        subject,
        chatType, // 'employee_to_employee', 'manager_to_employee', 'group', 'customer_support'
        shiftId, // Optional: link to specific shift
        participantIds, // Array of user IDs to add as participants
        guestInvitations, // Array of { name, email, phone, expiresInDays }
        conversationType // 'open_chat', 'dm_user', 'shift_chat'
      } = req.body;
      
      // Create the conversation
      const conversationData: InsertChatConversation = {
        workspaceId,
        subject: subject || 'Team Chat',
        isActive: true,
        conversationType: conversationType || 'open_chat',
        shiftId: shiftId || null,
        isEncrypted: false, // Open chats are not encrypted
        isSilenced: false // Participants can send messages
      };
      
      const conversation = await storage.createChatConversation(conversationData);
      
      // Add participants (if provided)
      const addedParticipants = [];
      if (participantIds && participantIds.length > 0) {
        for (const participantId of participantIds) {
          const participant = await storage.getUser(participantId);
          if (participant) {
            // Note: We need to add chatParticipants storage method
            // For now, just track in memory
            addedParticipants.push({
              id: participant.id,
              name: participant.displayName || participant.email,
              email: participant.email
            });
          }
        }
      }
      
      // Create guest tokens (if provided)
      const createdGuestTokens = [];
      if (guestInvitations && guestInvitations.length > 0) {
        for (const guest of guestInvitations) {
          const token = crypto.randomUUID();
          const expiresAt = new Date();
          expiresAt.setDate(expiresAt.getDate() + (guest.expiresInDays || 7));
          
          // Note: We need to add chatGuestTokens storage method
          // For now, return token info
          createdGuestTokens.push({
            guestName: guest.name,
            guestEmail: guest.email,
            guestPhone: guest.phone,
            accessToken: token,
            expiresAt
          });
        }
      }
      
      // Send welcome system message
      const userName = user.displayName || user.email;
      const welcomeMessage = `Chat created by ${userName}. Type: ${chatType}`;
      
      await storage.createChatMessage({
        conversationId: conversation.id,
        senderId: userId,
        senderName: userName,
        senderType: 'system',
        message: welcomeMessage,
        isSystemMessage: true,
        isEncrypted: false
      });
      
      res.json({
        conversation,
        participants: addedParticipants,
        guestTokens: createdGuestTokens,
        message: "Chat created successfully"
      });
    } catch (error: unknown) {
      log.error("Error creating chat:", error);
      res.status(500).json({ message: sanitizeError(error) || "Failed to create chat" });
    }
  });

  // ============================================================================

// ============================================================================
// CHAT EXPORT ENDPOINTS
// ============================================================================

  // POST /api/chat-export/support-conversation/:id - Export support conversation (PDF or HTML)
  router.post('/api/chat-export/support-conversation/:id', requireAuth, async (req: AuthenticatedRequest, res) => {
    try {
      const user = req.user!;
      // Support staff authorization
      const userRole = user.role;
      const platformRole = (user as any)?.platformRole;
      const isSupportStaff = userRole === 'platform_admin' || userRole === 'support_staff' || platformRole === 'root_admin' || platformRole === 'platform_admin' || platformRole === 'support_staff';
      if (!isSupportStaff) {
        return res.status(403).json({ message: "Access denied. Support staff only." });
      }

      const conversationId = req.params.id;
      const { format } = req.body;

      if (!['pdf', 'html'].includes(format)) {
        return res.status(400).json({ message: "Format must be 'pdf' or 'html'" });
      }

      const data = await storage.getSupportConversationForExport(conversationId);
      if (!data) {
        return res.status(404).json({ message: "Conversation not found" });
      }

      // Log export action for audit compliance
      await storage.createAuditLog({
        workspaceId: data.conversation.workspaceId || 'platform',
        userId: user.id,
        userEmail: user.email,
        userRole: user.role || 'support_staff',
        action: 'export_data',
        actionDescription: `Exported support conversation ${conversationId} as ${format.toUpperCase()}`,
        targetType: 'conversation',
        targetId: conversationId,
        metadata: {
          exportType: 'support_conversation',
          format,
          messageCount: data.messages.length,
          exportedBy: `${user.firstName} ${user.lastName}`.trim(),
        },
        ipAddress: req.ip,
      });

      const { generateChatPDF, generateChatHTML } = await import('./chat-export.js');

      const exportData = {
        title: data.conversation.subject || 'Support Conversation',
        subtitle: `Conversation ID: ${conversationId}`,
        messages: data.messages.map((m: any) => ({
          id: m.id,
          senderId: m.senderId,
          senderName: m.senderName,
          message: m.message,
          createdAt: m.createdAt,
        })),
        metadata: {
          exportedAt: new Date(),
          exportedBy: `${user.firstName} ${user.lastName}`.trim(),
          exportedByRole: user.role,
          totalMessages: data.messages.length,
          dateRange: data.messages.length > 0 ? {
            start: new Date(data.messages[0].createdAt),
            end: new Date(data.messages[data.messages.length - 1].createdAt),
          } : undefined,
          participants: [data.conversation.customerName, data.conversation.supportAgentName].filter(Boolean),
        },
      };

      if (format === 'pdf') {
        const pdfBuffer = await generateChatPDF(exportData);
        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `attachment; filename="conversation-${conversationId}.pdf"`);
        res.send(pdfBuffer);
      } else {
        const html = generateChatHTML(exportData);
        res.setHeader('Content-Type', 'text/html');
        res.send(html);
      }
    } catch (error: unknown) {
      log.error("Error exporting support conversation:", error);
      res.status(500).json({ message: "Failed to export conversation" });
    }
  });

  // POST /api/chat-export/comm-room/:id - Export AI Communications room (PDF or HTML)
  router.post('/api/chat-export/comm-room/:id', requireAuth, async (req: AuthenticatedRequest, res) => {
    try {
      const user = req.user!;
      // Support staff authorization
      const userRole = user.role;
      const platformRole = (user as any)?.platformRole;
      const isSupportStaff = userRole === 'platform_admin' || userRole === 'support_staff' || platformRole === 'root_admin' || platformRole === 'platform_admin' || platformRole === 'support_staff';
      if (!isSupportStaff) {
        return res.status(403).json({ message: "Access denied. Support staff only." });
      }

      const roomId = req.params.id;
      const { format } = req.body;

      if (!['pdf', 'html'].includes(format)) {
        return res.status(400).json({ message: "Format must be 'pdf' or 'html'" });
      }

      const data = await storage.getCommRoomForExport(roomId);
      if (!data) {
        return res.status(404).json({ message: "Chat room not found" });
      }

      // Log export action for audit compliance
      await storage.createAuditLog({
        workspaceId: data.room.workspaceId || 'platform',
        userId: user.id,
        userEmail: user.email,
        userRole: user.role || 'support_staff',
        action: 'export_data',
        actionDescription: `Exported AI Communications room ${data.room.name || roomId} as ${format.toUpperCase()}`,
        targetType: 'comm_room',
        targetId: roomId,
        metadata: {
          exportType: 'comm_room',
          roomName: data.room.name,
          format,
          messageCount: data.messages.length,
          memberCount: data.members?.length || 0,
          exportedBy: `${user.firstName} ${user.lastName}`.trim(),
        },
        ipAddress: req.ip,
      });

      const { generateChatPDF, generateChatHTML } = await import('./chat-export.js');

      const exportData = {
        title: data.room.name || 'Chat Room',
        subtitle: `Room ID: ${roomId}`,
        messages: data.messages.map((m: any) => ({
          id: m.id,
          senderId: m.senderId,
          senderName: m.senderName,
          message: m.message,
          createdAt: m.createdAt,
        })),
        metadata: {
          exportedAt: new Date(),
          exportedBy: `${user.firstName} ${user.lastName}`.trim(),
          exportedByRole: user.role,
          totalMessages: data.messages.length,
          dateRange: data.messages.length > 0 ? {
            start: new Date(data.messages[0].createdAt),
            end: new Date(data.messages[data.messages.length - 1].createdAt),
          } : undefined,
          participants: data.members?.map((m: any) => m.memberName).filter(Boolean) || [],
        },
      };

      if (format === 'pdf') {
        const pdfBuffer = await generateChatPDF(exportData);
        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `attachment; filename="chatroom-${roomId}.pdf"`);
        res.send(pdfBuffer);
      } else {
        const html = generateChatHTML(exportData);
        res.setHeader('Content-Type', 'text/html');
        res.send(html);
      }
    } catch (error: unknown) {
      log.error("Error exporting chat room:", error);
      res.status(500).json({ message: "Failed to export chat room" });
    }
  });

  // POST /api/chat-export/private-conversation/:id - Export private DM conversation (requires audit approval)
  router.post('/api/chat-export/private-conversation/:id', requireAuth, async (req: AuthenticatedRequest, res) => {
    try {
      const user = req.user!;
      // Support staff authorization (only platform_admin or support_staff can export encrypted DMs)
      const userRole = user.role;
      const platformRole = (user as any)?.platformRole;
      const isSupportStaff = userRole === 'platform_admin' || userRole === 'support_staff' || platformRole === 'root_admin' || platformRole === 'platform_admin' || platformRole === 'support_staff';
      if (!isSupportStaff) {
        return res.status(403).json({ message: "Access denied. Support staff only." });
      }

      const userId = user.id;

      // For unauthenticated users, return success (frontend handles localStorage)
      if (!userId) {
        return res.status(401).json({ message: 'Unauthorized' });
      }
      const conversationId = req.params.id;
      const { format } = req.body;

      if (!['pdf', 'html'].includes(format)) {
        return res.status(400).json({ message: "Format must be 'pdf' or 'html'" });
      }

      // This method handles DM decryption and audit authorization internally
      const data = await storage.getPrivateConversationForExport(conversationId, userId);
      if (!data) {
        return res.status(404).json({ message: "Conversation not found or access denied" });
      }

      // Log export action for audit compliance
      await storage.createAuditLog({
        workspaceId: data.conversation.workspaceId || 'platform',
        userId: user.id,
        userEmail: user.email,
        userRole: user.role || 'support_staff',
        action: 'export_data',
        actionDescription: `Exported private DM conversation ${conversationId} as ${format.toUpperCase()} (Authorized Investigation)`,
        targetType: 'conversation',
        targetId: conversationId,
        metadata: {
          exportType: 'private_dm',
          format,
          messageCount: data.messages.length,
          exportedBy: `${user.firstName} ${user.lastName}`.trim(),
          auditRequestId: data.auditInfo?.auditRequestId,
          confidential: true,
        },
        ipAddress: req.ip,
        isSensitiveData: true,
        complianceTag: 'confidential',
      });

      const { generateChatPDF, generateChatHTML } = await import('./chat-export.js');

      const exportData = {
        title: 'Private Conversation - CONFIDENTIAL',
        subtitle: `Conversation ID: ${conversationId} • Audit Request: ${data.auditInfo?.auditRequestId || 'N/A'}`,
        messages: data.messages.map((m: any) => ({
          id: m.id,
          senderId: m.senderId,
          senderName: m.senderName,
          message: m.message,
          createdAt: m.createdAt,
        })),
        metadata: {
          exportedAt: new Date(),
          exportedBy: `${user.firstName} ${user.lastName}`.trim() + ' (Authorized Investigation)',
          exportedByRole: user.role,
          auditRequestId: data.auditInfo?.auditRequestId,
          auditReason: data.auditInfo?.reason,
          totalMessages: data.messages.length,
          dateRange: data.messages.length > 0 ? {
            start: new Date(data.messages[0].createdAt),
            end: new Date(data.messages[data.messages.length - 1].createdAt),
          } : undefined,
          participants: data.participants || [],
        },
      };

      if (format === 'pdf') {
        const pdfBuffer = await generateChatPDF(exportData);
        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `attachment; filename="private-dm-${conversationId}.pdf"`);
        res.send(pdfBuffer);
      } else {
        const html = generateChatHTML(exportData);
        res.setHeader('Content-Type', 'text/html');
        res.send(html);
      }
    } catch (error: unknown) {
      log.error("Error exporting private conversation:", error);
      res.status(500).json({ message: "Failed to export private conversation" });
    }
  });

// ============================================================================
// CHAT UNREAD/READ ENDPOINTS
// ============================================================================

router.get("/api/chat/unread-count", requireAuth, readLimiter, async (req: AuthenticatedRequest, res) => {
  try {
    const authReq = req as AuthenticatedRequest;
      const userId = authReq.user?.id;
      
      // For unauthenticated users, return success (frontend handles localStorage)
      if (!userId) {
        return res.status(401).json({ message: 'Unauthorized' });
      }
    const { conversationId } = req.query;

    if (conversationId) {
      // Get unread for specific conversation
      const count = await unreadMessageService.getUnreadCount(conversationId as string, userId);
      res.json({ success: true, data: { conversationId, unreadCount: count } });
    } else {
      // Get total unread across all conversations
      const total = await unreadMessageService.getTotalUnreadCount(userId);
      res.json({ success: true, data: { totalUnreadCount: total } });
    }
  } catch (error: unknown) {
    log.error('Error fetching unread count:', error);
    res.status(500).json({ error: sanitizeError(error) });
  }
});

router.post("/api/chat/mark-as-read", requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const authReq = req as AuthenticatedRequest;
      const userId = authReq.user?.id;
      
      // For unauthenticated users, return success (frontend handles localStorage)
      if (!userId) {
        return res.status(401).json({ message: 'Unauthorized' });
      }
    const { conversationId } = req.body;
    if (!conversationId) return res.status(400).json({ error: 'conversationId required' });

    await unreadMessageService.markMessagesAsRead(conversationId, userId);
    res.json({ success: true, message: 'Messages marked as read' });
  } catch (error: unknown) {
    log.error('Error marking messages as read:', error);
    res.status(500).json({ error: sanitizeError(error) });
  }
});

// ============================================================================
// TIER-2: SHIFT REMINDERS
// ============================================================================

// ============================================================================
// CHATSERVER ENDPOINTS
// ============================================================================

  router.get("/api/chatserver/presence", requireAuth, async (req: AuthenticatedRequest, res) => {
    try {
      const { getChatServerLivePresence } = await import("../services/ai-brain/chatServerSubagent");
      const presence = await getChatServerLivePresence();
      res.json({ success: true, presence });
    } catch (error: unknown) {
      log.error("[ChatServerSubagent] Presence error:", error);
      res.status(500).json({ success: false, error: sanitizeError(error) });
    }
  });

  /**
   * Run diagnostics and get health report
   */
  router.get("/api/chatserver/diagnostics", requireAuth, async (req: AuthenticatedRequest, res) => {
    try {
      const { runChatServerDiagnostics } = await import("../services/ai-brain/chatServerSubagent");
      const report = await runChatServerDiagnostics();
      res.json({ success: true, report });
    } catch (error: unknown) {
      log.error("[ChatServerSubagent] Diagnostics error:", error);
      res.status(500).json({ success: false, error: sanitizeError(error) });
    }
  });

  /**
   * Get self-awareness state
   */
  router.get("/api/chatserver/self-awareness", requireAuth, async (req: AuthenticatedRequest, res) => {
    try {
      const { getChatServerSelfAwareness } = await import("../services/ai-brain/chatServerSubagent");
      const awareness = getChatServerSelfAwareness();
      res.json({ success: true, awareness });
    } catch (error: unknown) {
      res.status(500).json({ success: false, error: sanitizeError(error) });
    }
  });

  /**
   * Get UX improvement suggestions
   */
  router.get("/api/chatserver/ux-suggestions", requireAuth, async (req: AuthenticatedRequest, res) => {
    try {
      const { generateChatServerUXSuggestions } = await import("../services/ai-brain/chatServerSubagent");
      const suggestions = await generateChatServerUXSuggestions();
      res.json({ success: true, suggestions });
    } catch (error: unknown) {
      res.status(500).json({ success: false, error: sanitizeError(error) });
    }
  });

  /**
   * Trigger self-healing manually
   */
  router.post("/api/chatserver/self-heal", requireAuth, async (req: AuthenticatedRequest, res) => {
    try {
      const { runChatServerDiagnostics } = await import("../services/ai-brain/chatServerSubagent");
      const report = await runChatServerDiagnostics();
      
      res.json({ 
        success: true, 
        status: report.status,
        issuesFound: report.issues.length,
        healingActions: report.selfHealingActions.length,
        message: report.status === 'healthy' 
          ? 'Chat server is healthy, no healing needed' 
          : `Self-healing triggered for ${report.issues.length} issues`
      });
    } catch (error: unknown) {
      res.status(500).json({ success: false, error: sanitizeError(error) });
    }
  });

  /**
   * Get combined chat server status (for Trinity dashboard)
   */
  router.get("/api/chatserver/status", requireAuth, async (req: AuthenticatedRequest, res) => {
    try {
      const { getChatServerLivePresence, runChatServerDiagnostics, getChatServerSelfAwareness } = 
        await import("../services/ai-brain/chatServerSubagent");
      
      const [presence, health, awareness] = await Promise.all([
        getChatServerLivePresence(),
        runChatServerDiagnostics(),
        Promise.resolve(getChatServerSelfAwareness())
      ]);

      res.json({
        success: true,
        status: {
          health: health.status,
          totalOnline: presence.totalParticipants,
          usersOnline: presence.totalUsersOnline,
          botsOnline: presence.totalBotsOnline,
          activeRooms: health.metrics.activeRooms,
          issueCount: health.issues.length,
          selfAwareness: {
            state: awareness.currentState,
            confidence: awareness.confidenceScore,
            lastDiagnostic: awareness.lastDiagnostic
          }
        }
      });
    } catch (error: unknown) {
      res.status(500).json({ success: false, error: sanitizeError(error) });
    }
  });

// ============================================================================
// CHATROOM MOTD & COMMAND HELP ENDPOINTS
// ============================================================================

/**
 * Get MOTD (Message of the Day) for a chatroom
 * Shows available commands and room information
 */
router.get("/api/chat/room/:roomId/motd", requireAnyAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const { roomId } = req.params;
    const { 
      generateMOTD, 
      formatMOTDMessage,
      getCommandsForModes,
      getGlobalCommands 
    } = await import("../services/chatroomCommandService");
    const { RoomMode } = await import("@shared/types/chat");
    
    const conversation = await storage.getChatConversation(roomId);
    if (!conversation) {
      return res.status(404).json({ message: "Room not found" });
    }
    
    const roomModes = (conversation.metadata as any)?.modes || [RoomMode.ORG];
    const activeBots = (conversation.metadata as any)?.activeBots || [];
    const roomName = conversation.subject || "Chat Room";
    
    const motd = generateMOTD(roomName, roomModes, activeBots);
    const formattedMotd = formatMOTDMessage(motd);
    
    res.json({
      roomId,
      roomName,
      modes: roomModes,
      activeBots,
      motd: formattedMotd,
      commands: [...getGlobalCommands(), ...getCommandsForModes(roomModes)],
    });
  } catch (error: unknown) {
    log.error("[Chat] Error getting MOTD:", error);
    res.status(500).json({ message: "Failed to get room MOTD" });
  }
});

/**
 * Get help for all available commands or a specific command
 */
router.get("/api/chat/commands/help", requireAnyAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const { command, roomModes } = req.query;
    const {
      formatHelpMessage,
      getGlobalCommands,
      getCommandsForModes,
    } = await import("../services/chatroomCommandService");
    const { getCommandHelp, getHelpTextCondensed } = await import("@shared/commands");
    const { RoomMode } = await import("@shared/types/chat");
    
    const userId = req.user?.id;
    const isStaff = userId ? await storage.getUserPlatformRole(userId) !== null : false;
    
    if (command && typeof command === 'string') {
      const help = getCommandHelp(command);
      if (help) {
        return res.json({ 
          command, 
          help,
          type: 'specific'
        });
      }
      return res.status(404).json({ message: `Command "${command}" not found` });
    }
    
    const modes = roomModes 
      ? (Array.isArray(roomModes) ? roomModes : [roomModes]).map(m => m as RoomMode)
      : [RoomMode.ORG];
    
    const globalCommands = getGlobalCommands();
    const modeCommands = getCommandsForModes(modes);
    const systemHelp = getHelpTextCondensed(isStaff);
    
    res.json({
      systemCommands: globalCommands,
      botCommands: modeCommands,
      formattedHelp: formatHelpMessage(modes, [], undefined),
      systemHelp,
      type: 'full'
    });
  } catch (error: unknown) {
    log.error("[Chat] Error getting command help:", error);
    res.status(500).json({ message: "Failed to get command help" });
  }
});

/**
 * Get available bots for a room's modes
 */
router.get("/api/chat/room/:roomId/bots", requireAnyAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const { roomId } = req.params;
    const { formatBotsMessage } = await import("../services/chatroomCommandService");
    const { getBotsForMode, BOT_REGISTRY } = await import("../bots/registry");
    const { RoomMode } = await import("@shared/types/chat");
    
    const conversation = await storage.getChatConversation(roomId);
    if (!conversation) {
      return res.status(404).json({ message: "Room not found" });
    }
    
    const roomModes = (conversation.metadata as any)?.modes || [RoomMode.ORG];
    const activeBots = (conversation.metadata as any)?.activeBots || [];
    
    const availableBots = new Set<string>();
    for (const mode of roomModes) {
      getBotsForMode(mode).forEach(bot => availableBots.add(bot.id));
    }
    
    const botDetails = Array.from(availableBots).map(botId => {
      const bot = BOT_REGISTRY[botId];
      return {
        id: bot.id,
        name: bot.name,
        description: bot.description,
        presence: bot.presence,
        active: activeBots.includes(bot.id),
        commands: bot.commands.map(c => ({
          name: c.name,
          usage: c.usage,
          description: c.description,
          minRole: c.minRole,
        })),
      };
    });
    
    res.json({
      roomId,
      modes: roomModes,
      bots: botDetails,
      formattedMessage: formatBotsMessage(roomModes, activeBots),
    });
  } catch (error: unknown) {
    log.error("[Chat] Error getting room bots:", error);
    res.status(500).json({ message: "Failed to get room bots" });
  }
});

// ============================================================================
// H004: HELPAI COMMAND INTERCEPT — ChatServerHub /command → HelpAI Orchestrator
// ============================================================================
// When users type /escalate or /helpai in a chatroom, this endpoint intercepts
// the command, routes it to the HelpAI orchestrator, and logs the action.
// Called by the frontend chatroom UI when the message starts with /.

/**
 * POST /api/chat/commands/execute
 * Execute a slash command from within a chatroom.
 * /escalate [reason] → starts or continues a HelpAI session, triggers escalation
 * /helpai [question] → starts or continues a HelpAI session with the given question
 */
router.post("/api/chat/commands/execute", requireAnyAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const { message, roomId, sessionId } = req.body;
    const user = req.user!;

    if (!message || typeof message !== 'string' || !message.startsWith('/')) {
      return res.status(400).json({ message: "Message must be a slash command" });
    }

    const parts = message.trim().split(/\s+/);
    const command = parts[0].toLowerCase();
    const args = parts.slice(1).join(' ');

    // Only HelpAI-routed commands are handled here
    const HELPAI_COMMANDS = ['/helpai', '/escalate', '/help'];
    if (!HELPAI_COMMANDS.includes(command)) {
      // Not a HelpAI command — return unhandled so caller can fallback
      return res.json({ handled: false, command });
    }

    const { helpAIOrchestrator } = await import('../services/helpai/helpAIOrchestrator');

    // If caller already has an active session, process message within it
    if (sessionId) {
      const result = await helpAIOrchestrator.processMessage({
        sessionId,
        message,
        userId: user?.id,
        workspaceId: user?.currentWorkspaceId,
      });
      return res.json({ handled: true, command, ...result });
    }

    // Otherwise start a new HelpAI session and send the command as first message
    const session = await helpAIOrchestrator.startSession({
      userId: user?.id,
      workspaceId: user?.currentWorkspaceId,
      guestName: user ? `${user.firstName} ${user.lastName}`.trim() : undefined,
      guestEmail: user?.email,
      ipAddress: req.ip,
    });

    // Immediately process the command message in the new session
    const result = await helpAIOrchestrator.processMessage({
      sessionId: session.sessionId,
      message,
      userId: user?.id,
      workspaceId: user?.currentWorkspaceId,
    });

    log.info(`[Chat Commands] Routed ${command} from room ${roomId} to HelpAI session ${session.sessionId}`);
    return res.json({ handled: true, command, ...result });

  } catch (error: unknown) {
    log.error("[Chat Commands] Command execute error:", sanitizeError(error));
    res.status(500).json({ message: "Failed to execute command", error: sanitizeError(error) });
  }
});

export default router;
