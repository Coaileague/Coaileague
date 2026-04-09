import { sanitizeError } from '../middleware/errorHandler';
import { Router } from 'express';
import { z } from 'zod';
import { eq, and, or, desc, sql } from 'drizzle-orm';
import { storage } from '../storage';
import { db } from '../db';
import {
  chatMacros,
  typingIndicators,
  insertChatConversationSchema,
  insertChatMacroSchema,
  chatParticipants,
  chatConversations,
} from '@shared/schema';
import type { AuthenticatedRequest } from '../rbac';
import { requireAuth } from '../auth';
import { unreadMessageService } from '../services/unreadMessageService';
import { createLogger } from '../lib/logger';
import { PLATFORM_WORKSPACE_ID } from '../services/billing/billingConstants';
import { PLATFORM } from '../config/platformConfig';
const log = createLogger('ChatInlineRoutes');


const router = Router();
router.use(requireAuth);

router.get('/conversations', async (req: AuthenticatedRequest, res) => {
  try {
    const authReq = req as AuthenticatedRequest;
    const userId = authReq.user?.id;

    if (!userId) {
      return res.status(401).json({ message: 'Unauthorized' });
    }

    const platformRole = await storage.getUserPlatformRole(userId);

    if (platformRole && ['root', 'deputy_admin', 'deputy_assistant', 'sysop'].includes(platformRole)) {
      const status = req.query.status as string | undefined;
      const allConversations = await storage.getAllChatConversations({ status });
      return res.json(allConversations);
    }

    const workspace = await storage.getWorkspaceByOwnerId(userId) || await storage.getWorkspaceByMembership(userId);

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

router.post('/conversations', async (req: any, res) => {
  try {
    const userId = req.user?.id || req.user?.claims?.sub;
    const workspace = await storage.getWorkspaceByOwnerId(userId) || await storage.getWorkspaceByMembership(userId);

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

// Conversation types that preserve full history on leave/rejoin.
// dm_user: personal 1-on-1 messages — always preserved
// dm_support: support ticket — history preserved while ticket is open; once closed
//   the ticket is removed from the room list (24h window), so a fresh conversation
//   starts automatically. No cursor reset needed here.
const DM_HISTORY_PRESERVED_TYPES = ['dm_user', 'dm_bot', 'dm_support'];

async function getRoomHistoryCursor(conversationId: string, userId: string): Promise<Date | undefined> {
  // Returns the joinedAt timestamp for a user in a non-DM room.
  // Messages before this time are invisible to the user (they were not present).
  try {
    const [participant] = await db
      .select({ joinedAt: chatParticipants.joinedAt })
      .from(chatParticipants)
      .where(
        and(
          eq(chatParticipants.conversationId, conversationId),
          eq(chatParticipants.participantId, userId)
        )
      )
      .limit(1);
    return participant?.joinedAt ?? undefined;
  } catch {
    return undefined;
  }
}

async function getHistorySince(conversationId: string, userId: string): Promise<Date | undefined> {
  // For room-type conversations, return the user's joinedAt cursor so history
  // starts fresh after each rejoin (WhatsApp/Messenger group behavior).
  // For DMs (dm_user, dm_bot), always return undefined (full history preserved).
  try {
    const [conv] = await db
      .select({ conversationType: chatConversations.conversationType })
      .from(chatConversations)
      .where(eq(chatConversations.id, conversationId))
      .limit(1);
    if (!conv) return undefined;
    if (DM_HISTORY_PRESERVED_TYPES.includes(conv.conversationType ?? '')) return undefined;
    return getRoomHistoryCursor(conversationId, userId);
  } catch {
    return undefined;
  }
}

router.get('/conversations/:id/messages', async (req: AuthenticatedRequest, res) => {
  try {
    const { id } = req.params;
    const authReq = req as AuthenticatedRequest;
    const userId = authReq.user?.id;

    if (!userId) {
      return res.status(401).json({ message: 'Unauthorized' });
    }

    const platformRole = await storage.getUserPlatformRole(userId);

    if (platformRole && ['root', 'deputy_admin', 'deputy_assistant', 'sysop'].includes(platformRole)) {
      // Platform staff always see full history (for moderation/support)
      const messages = await storage.getChatMessagesByConversation(id);

      const enrichedMessages = await Promise.all(messages.map(async (msg) => {
        if (!msg.senderId || msg.senderId === 'system' || msg.senderId === 'ai-bot') {
          return { ...msg, role: msg.senderId === 'ai-bot' ? 'bot' : 'system', userType: 'system' };
        }
        const senderRole = await storage.getUserPlatformRole(msg.senderId).catch(() => null);
        const userInfo = await storage.getUserDisplayInfo(msg.senderId).catch(() => null);
        return {
          ...msg,
          role: senderRole || 'guest',
          userType: userInfo?.userType || 'guest'
        };
      }));

      return res.json(enrichedMessages);
    }

    const workspace = await storage.getWorkspaceByOwnerId(userId) || await storage.getWorkspaceByMembership(userId);

    if (!workspace) {
      return res.status(404).json({ message: "Workspace not found" });
    }

    const conversation = await storage.getChatConversation(id);
    if (!conversation || conversation.workspaceId !== workspace.id) {
      return res.status(403).json({ message: "Unauthorized" });
    }

    // For rooms: only show messages from when the user last joined/rejoined.
    // For DMs (dm_user, dm_bot): always show full history.
    const since = await getHistorySince(id, userId);

    const messages = await storage.getChatMessagesByConversation(id, since);

    const enrichedMessages = await Promise.all(messages.map(async (msg) => {
      if (!msg.senderId || msg.senderId === 'system' || msg.senderId === 'ai-bot') {
        return { ...msg, role: msg.senderId === 'ai-bot' ? 'bot' : 'system', userType: 'system' };
      }
      const senderRole = await storage.getUserPlatformRole(msg.senderId).catch(() => null);
      const userInfo = await storage.getUserDisplayInfo(msg.senderId).catch(() => null);
      return {
        ...msg,
        role: senderRole || 'guest',
        userType: userInfo?.userType || 'guest'
      };
    }));

    res.json(enrichedMessages);
  } catch (error) {
    log.error("Error fetching messages:", error);
    res.status(500).json({ message: "Failed to fetch messages" });
  }
});

router.patch('/conversations/:id', async (req: any, res) => {
  try {
    const { id } = req.params;
    const userId = req.user?.id || req.user?.claims?.sub;
    const workspace = await storage.getWorkspaceByOwnerId(userId) || await storage.getWorkspaceByMembership(userId);

    if (!workspace) {
      return res.status(404).json({ message: "Workspace not found" });
    }

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

router.post('/conversations/:id/close', async (req: any, res) => {
  try {
    const { id } = req.params;
    const userId = req.user?.id || req.user?.claims?.sub;
    const workspace = await storage.getWorkspaceByOwnerId(userId) || await storage.getWorkspaceByMembership(userId);

    if (!workspace) {
      return res.status(404).json({ message: "Workspace not found" });
    }

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

const MAIN_ROOM_ID = 'main-chatroom-workforceos';

router.get('/main-room', async (req: AuthenticatedRequest, res) => {
  try {
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

    res.json(mainRoom);
  } catch (error) {
    log.error("Error getting main room:", error);
    res.status(500).json({ message: "Failed to get main room" });
  }
});

router.get('/main-room/messages', async (req: AuthenticatedRequest, res) => {
  try {
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

    const enrichedMessages = await Promise.all(messages.map(async (msg) => {
      if (!msg.senderId || msg.senderId === 'system') {
        return { ...msg, role: 'system', userType: 'system' };
      }
      const senderRole = await storage.getUserPlatformRole(msg.senderId).catch(() => null);
      const userInfo = await storage.getUserDisplayInfo(msg.senderId).catch(() => null);
      return {
        ...msg,
        role: senderRole || 'guest',
        userType: userInfo?.userType || 'guest'
      };
    }));

    res.json(enrichedMessages);
  } catch (error) {
    log.error("Error getting main room messages:", error);
    res.status(500).json({ message: "Failed to get messages" });
  }
});

router.post('/main-room/messages', async (req: AuthenticatedRequest, res) => {
  try {
    const authReq = req as AuthenticatedRequest;
    const userId = authReq.user?.id;

    if (!userId) {
      return res.status(401).json({ message: 'Unauthorized' });
    }
    const user = req.user;

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

    await storage.updateChatConversation(MAIN_ROOM_ID, {
      lastMessageAt: new Date(),
    });

    res.status(201).json(newMessage);
  } catch (error: unknown) {
    log.error("Error sending message:", error);
    res.status(400).json({ message: sanitizeError(error) || "Failed to send message" });
  }
});

router.post('/conversations/:id/grant-voice', async (req: any, res) => {
  try {
    const { id } = req.params;
    const userId = req.user?.id;
    const userName = (req.user?.firstName && req.user?.lastName)
      ? `${req.user.firstName} ${req.user.lastName}`.trim()
      : (req.user?.firstName || req.user?.lastName || req.user?.email || 'Support Agent');

    const conversation = await storage.getChatConversation(id);
    if (!conversation) {
      return res.status(404).json({ message: "Conversation not found" });
    }

    const userWorkspace = await storage.getWorkspaceByOwnerId(userId) || await storage.getWorkspaceByMembership(userId);

    const workspaceId = req.workspaceId || userWorkspace?.id;

    if (!workspaceId || workspaceId !== conversation.workspaceId) {
      return res.status(403).json({ message: "Access denied: Conversation belongs to a different workspace" });
    }

    const updated = await storage.updateChatConversation(id, {
      isSilenced: false,
      voiceGrantedBy: userId,
      voiceGrantedAt: new Date(),
    });

    const { HelpBotService } = await import('../services/helpai/helpAIBotService');
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

router.post('/help-bot/respond', async (req: any, res) => {
  try {
    const { conversationId, userMessage, previousMessages } = req.body;
    const userId = req.user?.id || req.user?.claims?.sub;
    const workspace = await storage.getWorkspaceByOwnerId(userId) || await storage.getWorkspaceByMembership(userId);

    if (!workspace) {
      return res.status(404).json({ message: "Workspace not found" });
    }

    const conversation = await storage.getChatConversation(conversationId);
    if (!conversation || conversation.workspaceId !== workspace.id) {
      return res.status(403).json({ message: "Unauthorized" });
    }

    const { HelpBotService } = await import('../services/helpai/helpAIBotService');
    const botResponse = await HelpBotService.generateResponse(userMessage, {
      conversationId,
      customerName: conversation.customerName || undefined,
      customerEmail: conversation.customerEmail || undefined,
      previousMessages,
      workspaceId: workspace.id,
      userId,
    });

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

router.post('/gemini', async (req: AuthenticatedRequest, res) => {
  try {
    const { message, conversationHistory, systemPrompt } = req.body;

    if (!message || typeof message !== 'string') {
      return res.status(400).json({ message: "Message is required" });
    }

    const { generateGeminiResponse, isGeminiAvailable } = await import('../gemini');

    if (!isGeminiAvailable()) {
      return res.status(503).json({
        message: "Gemini AI is not configured. Please contact support.",
        available: false
      });
    }

    const workspaceId = req.workspaceId || (req.user)?.workspaceId;
    if (!workspaceId) {
      return res.status(200).json({
        message: "AI features are available to workspace members only. A human support agent will assist you shortly.",
        available: false,
        guestMode: true
      });
    }

    const userId = req.user?.id || (req.user)?.claims?.sub;

    const response = await generateGeminiResponse({
      message,
      conversationHistory: conversationHistory || [],
      systemPrompt,
      workspaceId,
      userId,
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

/**
 * Trinity Chat Field Query — Natural language operational intelligence
 * Officers and dispatchers can ask Trinity real-time questions about field operations.
 * Trinity uses keyword-intent detection to route to the appropriate Platform Action Hub action.
 */
router.post('/trinity-field-query', async (req: AuthenticatedRequest, res) => {
  try {
    const userId = req.user?.id || (req.user)?.claims?.sub;
    if (!userId) return res.status(401).json({ message: 'Unauthorized' });

    const workspaceId = req.workspaceId || (req.user)?.workspaceId;
    if (!workspaceId) return res.status(400).json({ message: 'Workspace context required' });

    const { question } = req.body;
    if (!question || typeof question !== 'string') {
      return res.status(400).json({ message: 'question is required' });
    }

    const { helpaiOrchestrator } = await import('../services/helpai/platformActionHub');

    const q = question.toLowerCase();

    // Intent detection → action routing
    type FieldIntent = {
      actionId: string;
      payload: Record<string, any>;
      label: string;
    };
    let intent: FieldIntent | null = null;

    if (/who.*(on duty|working|clocked in|available)|on.?duty officer|active unit/i.test(q)) {
      intent = { actionId: 'cad.get_on_duty_officers', payload: {}, label: 'on-duty officers' };
    } else if (/active call|open call|pending call|dispatch|cad call/i.test(q)) {
      intent = { actionId: 'cad.get_active_calls', payload: {}, label: 'active CAD calls' };
    } else if (/nearest|closest|unit near|who.*near/i.test(q)) {
      intent = { actionId: 'cad.get_nearest_unit', payload: {}, label: 'nearest available unit' };
    } else if (/suggest.*dispatch|best.*unit|recommend.*dispatch/i.test(q)) {
      intent = { actionId: 'cad.suggest_dispatch', payload: {}, label: 'dispatch suggestion' };
    } else if (/panic|sos|emergency alert|panic alert/i.test(q)) {
      intent = { actionId: 'safety.get_panic_history', payload: { limit: 5 }, label: 'recent panic alerts' };
    } else if (/incident.*officer|officer.*incident|report.*by/i.test(q)) {
      const nameMatch = question.match(/officer\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)/i);
      intent = { actionId: 'rms.get_officer_incident_history', payload: { employeeName: nameMatch?.[1] || undefined, days: 30 }, label: 'officer incident history' };
    } else if (/incident|report|crime|case/i.test(q)) {
      const siteMatch = question.match(/at\s+([A-Z][a-zA-Z\s]+?)(?:\s+this|\s+today|\s+last|\?|$)/i);
      intent = { actionId: 'rms.get_incidents_by_site', payload: { siteName: siteMatch?.[1]?.trim() || undefined, limit: 10 }, label: 'recent incidents' };
    } else if (/status.*officer|officer.*status|where is/i.test(q)) {
      const nameMatch = question.match(/(?:status of|where is)\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)/i);
      intent = { actionId: 'scheduling.get_officer_status', payload: { employeeName: nameMatch?.[1] || undefined }, label: 'officer status' };
    }

    if (!intent) {
      return res.json({
        answered: false,
        question,
        response: "I can answer questions about on-duty officers, active CAD calls, incident history, panic alerts, and officer locations. Try: 'Who is on duty right now?' or 'Show active dispatch calls'.",
        suggestions: [
          'Who is on duty right now?',
          'Show me active CAD calls',
          'What incidents happened today?',
          'Who is the nearest available unit?',
          'Show recent panic alerts',
        ],
      });
    }

    const result = await helpaiOrchestrator.executeAction({
      actionId: intent.actionId,
      workspaceId,
      userId,
      payload: intent.payload,
    });

    // Build a human-readable Trinity response
    let narrative = '';
    if (result.success && result.data) {
      const data = result.data;
      if (intent.actionId === 'cad.get_on_duty_officers') {
        const units = Array.isArray(data) ? data : [];
        if (!units.length) {
          narrative = 'No officers are currently on duty.';
        } else {
          narrative = `**${units.length} officer${units.length !== 1 ? 's' : ''} on duty:**\n\n` +
            units.map((u: any) => `• **${u.employee_name}** (${u.unit_identifier}) — ${u.current_status}${u.current_site_name ? ` at ${u.current_site_name}` : ''}`).join('\n');
        }
      } else if (intent.actionId === 'cad.get_active_calls') {
        const calls = Array.isArray(data) ? data : [];
        if (!calls.length) {
          narrative = 'No active CAD calls at this time.';
        } else {
          narrative = `**${calls.length} active call${calls.length !== 1 ? 's' : ''}:**\n\n` +
            calls.map((c: any) => `• **${c.call_number}** — P${c.priority} ${c.call_type} at ${c.site_name || c.location || 'unknown'} [${c.status}]`).join('\n');
        }
      } else if (intent.actionId === 'cad.suggest_dispatch') {
        const { suggestion, reason } = data;
        narrative = suggestion
          ? `**Recommended dispatch:** ${suggestion.unit_identifier} — ${suggestion.employee_name}\n\n${reason}`
          : 'No available units to suggest for dispatch.';
      } else if (intent.actionId === 'cad.get_nearest_unit') {
        const units = Array.isArray(data) ? data : [];
        const top = units[0];
        narrative = top
          ? `**Nearest available unit:** ${top.unit_identifier} — ${top.employee_name} (${top.current_status})`
          : 'No available units on duty.';
      } else if (intent.actionId === 'safety.get_panic_history') {
        const alerts = Array.isArray(data) ? data : [];
        if (!alerts.length) {
          narrative = 'No recent panic alerts on record.';
        } else {
          narrative = `**${alerts.length} recent panic alert${alerts.length !== 1 ? 's' : ''}:**\n\n` +
            alerts.map((a: any) => `• **${a.alert_number}** — ${a.employee_name} at ${a.site_name || 'unknown'} [${a.status}]`).join('\n');
        }
      } else if (intent.actionId === 'rms.get_incidents_by_site') {
        const incidents = Array.isArray(data) ? data : [];
        if (!incidents.length) {
          narrative = 'No incidents found for that location.';
        } else {
          narrative = `**${incidents.length} incident${incidents.length !== 1 ? 's' : ''}:**\n\n` +
            incidents.slice(0, 5).map((i: any) => `• **${i.report_number}** — ${i.category} (${i.priority}) at ${i.site_name || 'unknown'} [${i.status}]`).join('\n') +
            (incidents.length > 5 ? `\n\n_...and ${incidents.length - 5} more_` : '');
        }
      } else if (intent.actionId === 'rms.get_officer_incident_history') {
        const { incidents, summary } = data;
        narrative = summary
          ? `**Officer Incident Summary (last ${summary.days} days):**\n\n• Total: ${summary.total}\n• Critical: ${summary.criticalCount}\n• Top category: ${summary.topCategory}`
          : 'No incident history found for that officer.';
      } else if (intent.actionId === 'scheduling.get_officer_status') {
        const unit = data;
        narrative = unit
          ? `**${unit.employeeName}** — Status: **${unit.status}**\n• Last ping: ${unit.lastPing ? new Date(unit.lastPing).toLocaleTimeString() : 'unknown'}${unit.currentCallId ? `\n• Assigned to call: ${unit.currentCallId}` : ''}`
          : 'Officer not found in active duty roster.';
      } else {
        narrative = result.message || 'Query complete.';
      }
    } else {
      narrative = result.message || 'Unable to retrieve field data at this time.';
    }

    return res.json({
      answered: true,
      question,
      intent: intent.actionId,
      label: intent.label,
      response: narrative,
      rawData: result.data,
    });

  } catch (error: unknown) {
    log.error('[TrinityFieldQuery] Error:', error);
    res.status(500).json({ message: sanitizeError(error) || 'Trinity field query failed' });
  }
});

router.get('/gemini/status', async (req: AuthenticatedRequest, res) => {
  try {
    const { isGeminiAvailable } = await import('../gemini');
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

router.get('/macros', async (req: AuthenticatedRequest, res) => {
  try {
    const authReq = req as AuthenticatedRequest;
    const userId = authReq.user?.id;

    if (!userId) {
      return res.status(401).json({ message: 'Unauthorized' });
    }

    const platformRole = await storage.getUserPlatformRole(userId);
    if (!platformRole || !['root', 'deputy_admin', 'deputy_assistant', 'sysop', 'support'].includes(platformRole)) {
      return res.status(403).json({ message: "Unauthorized - Support agent access required" });
    }

    const workspaceId = req.query.workspaceId as string | undefined;
    let workspace;

    if (workspaceId) {
      workspace = await storage.getWorkspace(workspaceId);
    } else {
      workspace = await storage.getWorkspaceByOwnerId(userId) ||
                        await storage.getWorkspaceByMembership(userId);
    }

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

router.post('/macros', async (req: AuthenticatedRequest, res) => {
  try {
    const authReq = req as AuthenticatedRequest;
    const userId = authReq.user?.id;

    if (!userId) {
      return res.status(401).json({ message: 'Unauthorized' });
    }

    const platformRole = await storage.getUserPlatformRole(userId);
    if (!platformRole || !['root', 'deputy_admin', 'deputy_assistant', 'sysop', 'support'].includes(platformRole)) {
      return res.status(403).json({ message: "Unauthorized - Support agent access required" });
    }

    const validatedData = insertChatMacroSchema.parse({
      ...req.body,
      createdBy: userId,
    });

    let targetWorkspaceId = validatedData.workspaceId;

    if (!targetWorkspaceId) {
      const workspace = await storage.getWorkspaceByOwnerId(userId) ||
                        await storage.getWorkspaceByMembership(userId);
      targetWorkspaceId = workspace?.id || null;
    } else {
      const workspace = await storage.getWorkspace(targetWorkspaceId);
      if (!workspace) {
        return res.status(404).json({ message: "Workspace not found" });
      }
    }

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
    if (error.name === 'ZodError') {
      return res.status(400).json({ message: "Invalid macro data", errors: error.errors });
    }
    res.status(500).json({ message: "Failed to create chat macro" });
  }
});

router.delete('/macros/:id', async (req: AuthenticatedRequest, res) => {
  try {
    const authReq = req as AuthenticatedRequest;
    const userId = authReq.user?.id;

    if (!userId) {
      return res.status(401).json({ message: 'Unauthorized' });
    }
    const { id } = req.params;

    const platformRole = await storage.getUserPlatformRole(userId);
    if (!platformRole || !['root', 'deputy_admin', 'deputy_assistant', 'sysop', 'support'].includes(platformRole)) {
      return res.status(403).json({ message: "Unauthorized - Support agent access required" });
    }

    const workspace = await storage.getWorkspaceByOwnerId(userId) ||
                      await storage.getWorkspaceByMembership(userId);

    const macro = await db
      .select()
      .from(chatMacros)
      .where(eq(chatMacros.id, id))
      .limit(1);

    if (!macro.length) {
      return res.status(404).json({ message: "Macro not found" });
    }

    if (macro[0].workspaceId && macro[0].workspaceId !== workspace?.id) {
      return res.status(403).json({ message: "Unauthorized - Cannot delete macros from other workspaces" });
    }

    await db.delete(chatMacros).where(eq(chatMacros.id, id));

    res.json({ message: "Macro deleted successfully" });
  } catch (error: unknown) {
    log.error("Error deleting chat macro:", error);
    res.status(500).json({ message: "Failed to delete chat macro" });
  }
});

router.post('/conversations/:id/typing', async (req: AuthenticatedRequest, res) => {
  try {
    const authReq = req as AuthenticatedRequest;
    const userId = authReq.user?.id;

    if (!userId) {
      return res.status(401).json({ message: 'Unauthorized' });
    }
    const user = req.user;
    const { id: conversationId } = req.params;

    const conversation = await storage.getChatConversation(conversationId);
    if (!conversation) {
      return res.status(404).json({ message: "Conversation not found" });
    }

    const isParticipant = conversation.participantIds?.includes(userId);
    const isCreator = conversation.creatorId === userId;
    let isWorkspaceMember = false;

    if (!isParticipant && !isCreator && conversation.workspaceId) {
      const ws = await storage.getWorkspaceByOwnerId(userId) ||
                        await storage.getWorkspaceByMembership(userId);
      if (ws && ws.id === conversation.workspaceId) {
        isWorkspaceMember = true;
        await storage.ensureChatParticipant(conversationId, userId);
      }
    }

    if (!isParticipant && !isCreator && !isWorkspaceMember) {
      return res.status(403).json({ message: "Unauthorized - Not a participant in this conversation" });
    }

    if (conversation.workspaceId && !isWorkspaceMember) {
      const ws = await storage.getWorkspaceByOwnerId(userId) ||
                        await storage.getWorkspaceByMembership(userId);

      if (!ws || ws.id !== conversation.workspaceId) {
        return res.status(403).json({ message: "Unauthorized - Conversation belongs to different workspace" });
      }
    }

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

router.delete('/conversations/:id/typing', async (req: AuthenticatedRequest, res) => {
  try {
    const authReq = req as AuthenticatedRequest;
    const userId = authReq.user?.id;

    if (!userId) {
      return res.status(401).json({ message: 'Unauthorized' });
    }
    const { id: conversationId } = req.params;

    const conversation = await storage.getChatConversation(conversationId);
    if (!conversation) {
      return res.status(404).json({ message: "Conversation not found" });
    }

    const isParticipant = conversation.participantIds?.includes(userId);
    const isCreator = conversation.creatorId === userId;
    let isWorkspaceMember = false;

    if (!isParticipant && !isCreator && conversation.workspaceId) {
      const ws = await storage.getWorkspaceByOwnerId(userId) ||
                        await storage.getWorkspaceByMembership(userId);
      if (ws && ws.id === conversation.workspaceId) {
        isWorkspaceMember = true;
        await storage.ensureChatParticipant(conversationId, userId);
      }
    }

    if (!isParticipant && !isCreator && !isWorkspaceMember) {
      return res.status(403).json({ message: "Unauthorized - Not a participant in this conversation" });
    }

    if (conversation.workspaceId && !isWorkspaceMember) {
      const ws = await storage.getWorkspaceByOwnerId(userId) ||
                        await storage.getWorkspaceByMembership(userId);

      if (!ws || ws.id !== conversation.workspaceId) {
        return res.status(403).json({ message: "Unauthorized - Conversation belongs to different workspace" });
      }
    }

    await db
      .delete(typingIndicators)
      .where(
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

router.get('/tickets/:id', async (req: AuthenticatedRequest, res) => {
  try {
    const { mapTicketStatusToHeaderStatus, calculateSLARemaining } = await import('@shared/helpdeskUtils');

    const ticketId = req.params.id;
    const user = req.user;

    const employee = await storage.getEmployeeByUserId(user.id);

    if (!employee || !employee.workspaceId) {
      return res.status(403).json({ error: 'Forbidden - No workspace access' });
    }

    const workspaceId = employee.workspaceId;
    const ticket = await storage.getSupportTicket(ticketId, workspaceId);

    if (!ticket) {
      return res.status(404).json({ error: 'Ticket not found' });
    }

    if (ticket.workspaceId !== workspaceId) {
      return res.status(404).json({ error: 'Ticket not found' });
    }

    const isStaff = employee && ['root_admin', 'deputy_admin', 'support_manager', 'sysop', 'support_agent'].includes((employee as any).platformRole || '');

    if (!isStaff) {
      if (ticket.employeeId !== employee.id && ticket.clientId !== employee.id) {
        return res.status(404).json({ error: 'Ticket not found' });
      }
    }

    let assignedAgent: string | undefined;
    if (ticket.assignedTo) {
      const agent = await storage.getEmployeeById(ticket.assignedTo);
      assignedAgent = agent ? `${agent.firstName} ${agent.lastName}` : undefined;
    }

    const viewModel = {
      id: ticket.id,
      ticketNumber: ticket.ticketNumber,
      status: mapTicketStatusToHeaderStatus(ticket),
      priority: (ticket.priority || 'normal'),
      assignedAgent,
      slaRemaining: calculateSLARemaining(ticket.createdAt!, (ticket.priority || 'normal')),
      subject: ticket.subject,
      description: ticket.description,
      workspaceId: ticket.workspaceId,
      createdAt: ticket.createdAt!,
    };

    res.json(viewModel);
  } catch (error: unknown) {
    log.error('Error fetching chat ticket:', error);
    res.status(500).json({ error: 'Failed to fetch ticket' });
  }
});

router.get('/tickets', async (req: AuthenticatedRequest, res) => {
  try {
    const { mapTicketStatusToHeaderStatus, calculateSLARemaining } = await import('@shared/helpdeskUtils');

    const user = req.user;

    const employee = await storage.getEmployeeByUserId(user.id);

    if (!employee || !employee.workspaceId) {
      return res.status(403).json({ error: 'Forbidden - No workspace access' });
    }

    const workspaceId = employee.workspaceId;
    let tickets = await storage.getSupportTickets(workspaceId);

    const isStaff = employee && ['root_admin', 'deputy_admin', 'support_manager', 'sysop', 'support_agent'].includes((employee as any).platformRole || '');

    if (!isStaff) {
      tickets = tickets.filter(t =>
        t.workspaceId === workspaceId &&
        (t.employeeId === employee.id || t.clientId === employee.id)
      );
    } else {
      tickets = tickets.filter(t => t.workspaceId === workspaceId);
    }

    const viewModels = await Promise.all(
      tickets.map(async (ticket) => {
        let assignedAgent: string | undefined;
        if (ticket.assignedTo) {
          const agent = await storage.getEmployeeById(ticket.assignedTo);
          assignedAgent = agent ? `${agent.firstName} ${agent.lastName}` : undefined;
        }

        return {
          id: ticket.id,
          ticketNumber: ticket.ticketNumber,
          status: mapTicketStatusToHeaderStatus(ticket),
          priority: (ticket.priority || 'normal'),
          assignedAgent,
          slaRemaining: calculateSLARemaining(ticket.createdAt!, (ticket.priority || 'normal')),
          subject: ticket.subject,
          description: ticket.description,
          workspaceId: ticket.workspaceId,
          createdAt: ticket.createdAt!,
        };
      })
    );

    res.json(viewModels);
  } catch (error: unknown) {
    log.error('Error fetching chat tickets:', error);
    res.status(500).json({ error: 'Failed to fetch tickets' });
  }
});

router.get('/unread-count', async (req: AuthenticatedRequest, res) => {
  try {
    const authReq = req as AuthenticatedRequest;
    const userId = authReq.user?.id;

    if (!userId) {
      return res.status(401).json({ message: 'Unauthorized' });
    }
    const { conversationId } = req.query;

    if (conversationId) {
      const count = await unreadMessageService.getUnreadCount(conversationId as string, userId);
      res.json({ success: true, data: { conversationId, unreadCount: count } });
    } else {
      const total = await unreadMessageService.getTotalUnreadCount(userId);
      res.json({ success: true, data: { totalUnreadCount: total } });
    }
  } catch (error: unknown) {
    log.error('Error fetching unread count:', error);
    res.status(500).json({ error: sanitizeError(error) });
  }
});

router.post('/mark-as-read', async (req: AuthenticatedRequest, res) => {
  try {
    const authReq = req as AuthenticatedRequest;
    const userId = authReq.user?.id;

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
// BOT ECOSYSTEM ROUTES - MOTD, Commands, Bot Registry
// ============================================================================

router.get('/room/:roomId/motd', async (req: AuthenticatedRequest, res) => {
  try {
    const { roomId } = req.params;
    const {
      generateMOTD,
      formatMOTDMessage,
      getCommandsForModes,
      getGlobalCommands
    } = await import('../services/chatroomCommandService');
    const { RoomMode } = await import('@shared/types/chat');

    const conversation = await storage.getChatConversation(roomId);
    if (!conversation) {
      return res.status(404).json({ message: 'Room not found' });
    }

    const roomModes = (conversation.metadata as any)?.modes || [RoomMode.ORG];
    const activeBots = (conversation.metadata as any)?.activeBots || [];
    const roomName = conversation.subject || 'Chat Room';

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
    log.error('[Chat] Error getting MOTD:', error);
    res.status(500).json({ message: 'Failed to get room MOTD' });
  }
});

router.get('/commands/help', async (req: AuthenticatedRequest, res) => {
  try {
    const { command, roomModes } = req.query;
    const {
      formatHelpMessage,
      getGlobalCommands,
      getCommandsForModes,
    } = await import('../services/chatroomCommandService');
    const { getCommandHelp, getHelpTextCondensed } = await import('@shared/commands');
    const { RoomMode } = await import('@shared/types/chat');

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
    log.error('[Chat] Error getting command help:', error);
    res.status(500).json({ message: 'Failed to get command help' });
  }
});

router.get('/room/:roomId/bots', async (req: AuthenticatedRequest, res) => {
  try {
    const { roomId } = req.params;
    const { formatBotsMessage } = await import('../services/chatroomCommandService');
    const { getBotsForMode, BOT_REGISTRY } = await import('../bots/registry');
    const { RoomMode } = await import('@shared/types/chat');

    const conversation = await storage.getChatConversation(roomId);
    if (!conversation) {
      return res.status(404).json({ message: 'Room not found' });
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
    log.error('[Chat] Error getting room bots:', error);
    res.status(500).json({ message: 'Failed to get room bots' });
  }
});

export default router;
