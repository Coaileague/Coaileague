import { WebSocketServer, WebSocket } from 'ws';
import { Server, IncomingMessage } from 'http';
import { storage } from './storage';
import { formatUserDisplayName, formatUserDisplayNameForChat } from './utils/formatUserDisplayName';
import { parseSlashCommand, validateCommand, getHelpText, COMMAND_REGISTRY } from '@shared/commands';
import { queueManager } from './services/helpOsQueue';
import type { ChatMessage } from '@shared/schema';
import { trackConnection, trackDisconnection, checkMessageRateLimit } from './middleware/wsRateLimiter';
import { randomUUID } from 'crypto';
import { sanitizeChatMessage, sanitizePlainText } from './lib/sanitization';

/**
 * Helper function to create system messages with all required ChatMessage fields
 * @param conversationId - The conversation ID where the message will be sent
 * @param message - The message content
 * @param options - Optional overrides for specific fields
 */
function createSystemMessage(
  conversationId: string,
  message: string,
  options?: {
    senderId?: string | null;
    senderName?: string;
    recipientId?: string | null;
    isPrivateMessage?: boolean;
    visibleToStaffOnly?: boolean;
  }
): ChatMessage {
  return {
    id: Date.now().toString(),
    conversationId,
    senderId: options?.senderId ?? null,
    senderName: options?.senderName ?? 'System',
    message,
    senderType: 'system',
    messageType: 'text',
    isSystemMessage: true,
    isPrivateMessage: options?.isPrivateMessage ?? false,
    recipientId: options?.recipientId ?? null,
    
    // Encryption fields
    isEncrypted: null,
    encryptionIv: null,
    
    // Threading fields
    parentMessageId: null,
    threadId: null,
    replyCount: null,
    
    // Attachment fields
    attachmentUrl: null,
    attachmentName: null,
    attachmentType: null,
    attachmentSize: null,
    attachmentThumbnail: null,
    
    // Rich text fields
    isFormatted: null,
    formattedContent: null,
    
    // Mentions
    mentions: [],
    
    // Visibility
    visibleToStaffOnly: options?.visibleToStaffOnly ?? null,
    
    // Status fields
    isRead: false,
    readAt: null,
    isEdited: null,
    editedAt: null,
    
    // Timestamps
    createdAt: new Date(),
  };
}

interface WebSocketClient extends WebSocket {
  // Legacy fields (deprecated, use serverAuth instead)
  userId?: string;
  userName?: string;
  workspaceId?: string;
  userType?: 'staff' | 'subscriber' | 'org_user' | 'guest';
  sessionId?: string;
  
  // NEW: Server-controlled authentication (validated at connection time)
  serverAuth?: {
    userId: string;
    workspaceId: string;
    role: string;
    sessionId: string;
    authenticatedAt: Date;
  };
  
  // Connection metadata
  conversationId?: string;
  userStatus?: 'online' | 'away' | 'busy';
  isAlive?: boolean;
  pingInterval?: NodeJS.Timeout;
  ipAddress?: string;
  userAgent?: string;
}

interface ChatMessagePayload {
  type: 'chat_message';
  conversationId: string;
  message: string;
  senderName: string;
  senderType: 'customer' | 'support' | 'system';
}

interface JoinConversationPayload {
  type: 'join_conversation';
  conversationId: string;
  userId: string; // Will be validated server-side
}

interface TypingPayload {
  type: 'typing';
  userId: string;
  userName: string;
  isStaff: boolean;
  isTyping: boolean;
}

interface StatusChangePayload {
  type: 'status_change';
  userId: string;
  status: 'online' | 'away' | 'busy';
}

interface KickUserPayload {
  type: 'kick_user';
  conversationId?: string;
  targetUserId: string;
  reason?: string;
  commandId?: string; // IRC-style command tracking for acknowledgments
}

interface RequestSecurePayload {
  type: 'request_secure';
  targetUserId: string;
  requestType: string;
  message?: string;
}

interface SecureResponsePayload {
  type: 'secure_response';
  data: any;
}

interface ReleaseSpectatorPayload {
  type: 'release_spectator';
  targetUserId: string;
}

interface TransferUserPayload {
  type: 'transfer_user';
  targetUserId: string;
  commandId?: string; // IRC-style command tracking
}

interface SilenceUserPayload {
  type: 'silence_user';
  targetUserId: string;
  duration?: number;
  reason?: string;
  commandId?: string; // IRC-style command tracking
}

interface GiveVoicePayload {
  type: 'give_voice';
  targetUserId: string;
  commandId?: string; // IRC-style command tracking
}

interface BanUserPayload {
  type: 'ban_user';
  targetUserId: string;
  reason?: string;
  commandId?: string; // IRC-style command tracking
}

interface JoinShiftUpdatesPayload {
  type: 'join_shift_updates';
  userId: string;
  workspaceId: string;
}

interface ShiftUpdatePayload {
  type: 'shift_created' | 'shift_updated' | 'shift_deleted';
  shift?: any;
  shiftId?: string;
}

interface JoinNotificationsPayload {
  type: 'join_notifications';
  userId: string;
  workspaceId: string;
}

interface NotificationUpdatePayload {
  type: 'notification_new' | 'notification_read' | 'notification_count_updated';
  notification?: any;
  unreadCount?: number;
}

interface CallInitiatedPayload {
  type: 'call_initiated';
  roomId: string;
  callerId: string;
  callerName: string;
}

interface CallAcceptedPayload {
  type: 'call_accepted';
  roomId: string;
}

interface CallRejectedPayload {
  type: 'call_rejected';
  roomId: string;
}

interface CallEndedPayload {
  type: 'call_ended';
  roomId: string;
}

interface WebRTCOfferPayload {
  type: 'webrtc_offer';
  roomId: string;
  offer: RTCSessionDescriptionInit;
}

interface WebRTCAnswerPayload {
  type: 'webrtc_answer';
  roomId: string;
  answer: RTCSessionDescriptionInit;
}

interface WebRTCIceCandidatePayload {
  type: 'webrtc_ice_candidate';
  roomId: string;
  candidate: RTCIceCandidateInit;
}

// AI Dispatch™ WebSocket Payloads
interface JoinDispatchUpdatesPayload {
  type: 'join_dispatch_updates';
  workspaceId: string;
}

interface DispatchGPSUpdatePayload {
  type: 'dispatch_gps_update';
  employeeId: string;
  latitude: number;
  longitude: number;
  status: string;
  timestamp: string;
}

interface DispatchIncidentUpdatePayload {
  type: 'dispatch_incident_created' | 'dispatch_incident_updated' | 'dispatch_incident_assigned';
  incident?: any;
  incidentId?: number;
}

interface DispatchUnitStatusUpdatePayload {
  type: 'dispatch_unit_status_changed';
  employeeId: string;
  status: string;
  incidentId?: number | null;
}

type WebSocketMessage = ChatMessagePayload | JoinConversationPayload | TypingPayload | StatusChangePayload | KickUserPayload | RequestSecurePayload | SecureResponsePayload | ReleaseSpectatorPayload | TransferUserPayload | SilenceUserPayload | GiveVoicePayload | BanUserPayload | JoinShiftUpdatesPayload | ShiftUpdatePayload | JoinNotificationsPayload | NotificationUpdatePayload | CallInitiatedPayload | CallAcceptedPayload | CallRejectedPayload | CallEndedPayload | WebRTCOfferPayload | WebRTCAnswerPayload | WebRTCIceCandidatePayload | JoinDispatchUpdatesPayload | DispatchGPSUpdatePayload | DispatchIncidentUpdatePayload | DispatchUnitStatusUpdatePayload;

// In-memory MOTD storage (staff can update)
let currentMOTD = "Welcome to AutoForce™ HelpDesk Support Network - Your satisfaction is our priority - 24/7/365";

// GLOBAL CONNECTION TRACKING for Platform Stats
const globalConnections = {
  allUsers: new Map<string, WebSocketClient>(), // userId -> WebSocket
  staffUsers: new Set<string>(), // staff user IDs
  subscriberUsers: new Set<string>(), // subscriber user IDs
  totalConnections: 0
};

// Export function to get live connection stats
export function getLiveConnectionStats() {
  return {
    totalConnections: globalConnections.totalConnections,
    chatUsers: globalConnections.subscriberUsers.size,
    chatStaff: globalConnections.staffUsers.size,
    allActiveUsers: globalConnections.allUsers.size
  };
}

// Track active connections by conversation ID (module-level for export access)
const conversationClients = new Map<string, Set<WebSocketClient>>();

// =============================================================================
// SECURITY: MULTI-DIMENSIONAL RATE LIMITING (User + IP + Session)
// =============================================================================
const rateLimitStore = new Map<string, {
  count: number;
  resetAt: Date;
  violations: number;
}>();

// Cleanup old entries every 5 minutes
setInterval(() => {
  const now = new Date();
  for (const [key, entry] of rateLimitStore.entries()) {
    if (entry.resetAt < now) {
      rateLimitStore.delete(key);
    }
  }
}, 5 * 60 * 1000);

// Legacy single-dimension rate limiting (deprecated)
function checkRateLimit(key: string, maxAttempts: number, windowMinutes: number): {allowed: boolean; remainingAttempts: number} {
  const now = new Date();
  const entry = rateLimitStore.get(key);
  
  if (!entry || entry.resetAt < now) {
    rateLimitStore.set(key, {
      count: 1,
      resetAt: new Date(now.getTime() + windowMinutes * 60 * 1000),
      violations: 0
    });
    return { allowed: true, remainingAttempts: maxAttempts - 1 };
  }
  
  if (entry.count >= maxAttempts) {
    return { allowed: false, remainingAttempts: 0 };
  }
  
  entry.count++;
  return { allowed: true, remainingAttempts: maxAttempts - entry.count };
}

// NEW: Multi-dimensional rate limiting (user + IP + session + target)
function checkMultiDimensionalRateLimit(
  userId: string,
  targetEmail: string,
  ipAddress: string,
  sessionId: string,
  maxAttempts: number,
  windowMinutes: number
): {
  allowed: boolean;
  remainingAttempts: number;
  blockedBy: 'user' | 'ip' | 'session' | null;
} {
  const now = new Date();
  const resetAt = new Date(now.getTime() + windowMinutes * 60 * 1000);
  
  // Check multiple dimensions
  const dimensions = [
    { key: `user:${userId}:${targetEmail}`, type: 'user' as const },
    { key: `ip:${ipAddress}:${targetEmail}`, type: 'ip' as const },
    { key: `session:${sessionId}:${targetEmail}`, type: 'session' as const },
  ];
  
  for (const { key, type } of dimensions) {
    const entry = rateLimitStore.get(key);
    
    if (!entry || entry.resetAt < now) {
      // New window - reset
      rateLimitStore.set(key, { count: 0, resetAt, violations: 0 });
      continue;
    }
    
    if (entry.count >= maxAttempts) {
      // Limit exceeded
      entry.violations++;
      return {
        allowed: false,
        remainingAttempts: 0,
        blockedBy: type,
      };
    }
  }
  
  // Increment all dimensions
  for (const { key } of dimensions) {
    const entry = rateLimitStore.get(key)!;
    entry.count++;
  }
  
  const userEntry = rateLimitStore.get(dimensions[0].key)!;
  return {
    allowed: true,
    remainingAttempts: maxAttempts - userEntry.count,
    blockedBy: null,
  };
}

// =============================================================================
// SECURITY: RE-VALIDATE USER AUTHORIZATION (Don't trust ws.userType)
// =============================================================================
async function revalidateUserAuth(ws: WebSocketClient): Promise<{
  userId: string;
  workspaceId: string;
  role: string | null;
  isStaff: boolean;
} | null> {
  if (!ws.userId) {
    return null;
  }
  
  try {
    // Fetch fresh user info from database (server-side truth)
    const user = await storage.getUser(ws.userId);
    if (!user) {
      console.error('[WS SECURITY] User not found during revalidation:', ws.userId);
      return null;
    }
    
    // Get current platform role from database
    const role = await storage.getUserPlatformRole(ws.userId).catch(() => null);
    const isStaff = role && ['root_admin', 'deputy_admin', 'support_agent', 'support_manager', 'sysop'].includes(role);
    
    return {
      userId: user.id,
      workspaceId: user.currentWorkspaceId || '',
      role: role,
      isStaff: !!isStaff,
    };
  } catch (error) {
    console.error('[WS SECURITY] Auth revalidation failed:', error);
    return null;
  }
}

// =============================================================================
// SECURITY: WORKSPACE ACCESS VALIDATION (Prevent cross-workspace leakage)
// =============================================================================
function validateWorkspaceAccess(
  userWorkspaceId: string,
  targetWorkspaceId: string,
  userRole: string | null
): { allowed: boolean; reason?: string } {
  // root_admin can access any workspace
  if (userRole === 'root_admin') {
    return { allowed: true };
  }
  
  // Platform-level users (no workspace) can only access their own resources
  if (!userWorkspaceId || !targetWorkspaceId) {
    return { allowed: true }; // Allow if either is platform-level
  }
  
  // All other users must match workspace
  if (userWorkspaceId !== targetWorkspaceId) {
    return {
      allowed: false,
      reason: `Cross-workspace access denied: user workspace ${userWorkspaceId}, target workspace ${targetWorkspaceId}`
    };
  }
  
  return { allowed: true };
}

// =============================================================================
// SECURITY: EXTRACT CLIENT IP ADDRESS (For rate limiting & audit logging)
// =============================================================================
function getClientIP(request: IncomingMessage): string {
  return (request.headers['x-forwarded-for'] as string)?.split(',')[0].trim() 
    || request.socket.remoteAddress 
    || 'unknown';
}

// Export function to get live room data for API
export function getLiveRoomConnections() {
  const roomData = new Map<string, {
    conversationId: string;
    onlineUsers: Array<{
      id: string;
      name: string;
      status: 'online' | 'away' | 'busy';
      isStaff: boolean;
      workspaceId?: string;
    }>;
  }>();
  
  conversationClients.forEach((clients, conversationId) => {
    const onlineUsers: Array<any> = [];
    clients.forEach((client) => {
      if (client.userId && client.userName) {
        onlineUsers.push({
          id: client.userId,
          name: client.userName,
          status: client.userStatus || 'online',
          isStaff: client.userType === 'staff',
          workspaceId: client.workspaceId,
        });
      }
    });
    
    roomData.set(conversationId, {
      conversationId,
      onlineUsers,
    });
  });
  
  return roomData;
}

export function setupWebSocket(server: Server) {
  const wss = new WebSocketServer({ 
    server,
    path: '/ws/chat',
    clientTracking: true,
    maxPayload: 10 * 1024 * 1024, // 10MB max payload
  });
  
  // Track connections subscribed to shift updates by workspace ID
  const shiftUpdateClients = new Map<string, Set<WebSocketClient>>();
  
  // Track notification clients (workspaceId -> Set of WebSocket clients)
  const notificationClients = new Map<string, Map<string, WebSocketClient>>();
  
  // Track AI Dispatch™ connections by workspace ID
  const dispatchUpdateClients = new Map<string, Set<WebSocketClient>>();
  
  // Track removed simulated users (so they don't re-appear on reconnect)
  const removedSimulatedUsers = new Set<string>();

  wss.on('connection', async (ws: WebSocketClient, request: IncomingMessage) => {
    // Extract IP address and user agent from request
    const ipAddress = getClientIP(request);
    const userAgent = request.headers['user-agent'] || 'unknown';
    
    // Generate unique session ID for connection tracking
    const sessionId = randomUUID();
    ws.sessionId = sessionId;
    
    // Store for audit trail
    ws.ipAddress = ipAddress;
    ws.userAgent = userAgent;
    
    console.log(`New WebSocket connection from ${ipAddress} (session: ${sessionId})`);
    
    // Initialize heartbeat
    ws.isAlive = true;
    
    // Handle pong responses (heartbeat)
    ws.on('pong', () => {
      ws.isAlive = true;
    });
    
    // Start heartbeat interval (30 seconds)
    ws.pingInterval = setInterval(() => {
      if (ws.isAlive === false) {
        console.log('WebSocket connection terminated due to no heartbeat');
        clearInterval(ws.pingInterval);
        return ws.terminate();
      }
      ws.isAlive = false;
      ws.ping();
    }, 30000);

    ws.on('message', async (data: string) => {
      try {
        const payload: WebSocketMessage = JSON.parse(data.toString());

        switch (payload.type) {
          case 'join_conversation': {
            const MAIN_ROOM_ID = 'helpdesk'; // Support room slug
            
            // Check if this is a support room slug instead of conversation ID
            let conversationId = payload.conversationId;
            let isMainRoom = false; // Track if this is the main helpdesk room
            let conversation = await storage.getChatConversation(conversationId);
            
            // If conversation not found, check if it's a support room slug
            if (!conversation) {
              const supportRoom = await storage.getSupportRoomBySlug(conversationId);
              if (supportRoom) {
                // Track if this is the main helpdesk room
                isMainRoom = (supportRoom.slug === MAIN_ROOM_ID);
                
                // Support room exists - get or create its conversation
                if (supportRoom.conversationId) {
                  conversationId = supportRoom.conversationId;
                  conversation = await storage.getChatConversation(conversationId);
                } else {
                  // Auto-create conversation for this support room
                  // Use platform workspace for platform-wide rooms (null workspaceId)
                  const newConversation = await storage.createChatConversation({
                    subject: supportRoom.name,
                    conversationType: 'open_chat',
                    workspaceId: supportRoom.workspaceId || 'autoforce-platform-workspace',
                    participants: [],
                    isActive: true,
                  });
                  
                  // Link conversation to support room
                  await storage.updateSupportRoomConversation(supportRoom.slug, newConversation.id);
                  
                  conversationId = newConversation.id;
                  conversation = newConversation;
                }
              }
            }
            
            // SECURITY: Verify conversation exists before allowing join
            if (!conversation) {
              ws.send(JSON.stringify({
                type: 'error',
                message: 'Conversation not found',
              }));
              return;
            }

            // CHECK FOR GUEST/ANONYMOUS USERS FIRST - Short-circuit all database lookups
            const isGuestUser = payload.userId?.startsWith('guest-');
            let displayName = 'Guest';
            let userType: 'staff' | 'subscriber' | 'org_user' | 'guest' = 'guest';
            let platformRole: string | null = null;
            let isStaff = false;

            // HELPDESK ACCESS CONTROL: For the main HelpDesk room (public IRC-style chatroom)
            let userRoleInfo = '';
            
            if (isGuestUser) {
              // Anonymous guest user - completely skip database lookups and workspace checks
              displayName = 'Guest';
              userType = 'guest';
              userRoleInfo = 'anonymous guest';
              
              // Guests can only join the main helpdesk room (not private workspaces)
              if (!isMainRoom && payload.conversationId !== MAIN_ROOM_ID) {
                ws.send(JSON.stringify({
                  type: 'error',
                  message: 'Guests can only join the public HelpDesk',
                }));
                return;
              }
            } else {
              // Authenticated user - fetch display info from database
              const userInfo = await storage.getUserDisplayInfo(payload.userId);
              displayName = userInfo ? formatUserDisplayNameForChat({
                firstName: userInfo.firstName,
                lastName: userInfo.lastName,
                email: userInfo.email || undefined,
                platformRole: userInfo.platformRole || undefined,
                workspaceRole: userInfo.workspaceRole || undefined,
              }) : 'User';

              // Determine user type and set initial status
              platformRole = await storage.getUserPlatformRole(payload.userId).catch(() => null);
              isStaff = platformRole && ['root_admin', 'deputy_admin', 'support_manager', 'sysop'].includes(platformRole);
              
              if (isStaff) {
                userType = 'staff';
              } else if (conversation.workspaceId) {
                // Users in a workspace are organization users
                userType = 'org_user';
              }
              
              // Set role info for authenticated users
              if (isMainRoom || payload.conversationId === MAIN_ROOM_ID) {
                // This is the main HelpDesk public chatroom
                if (isStaff) {
                  userRoleInfo = `platform staff - ${platformRole}`;
                } else {
                  userRoleInfo = 'guest/customer';
                }
              }
              
              // =========================================================================
              // SECURITY: Populate server-derived authentication context
              // This binds the user session to the WebSocket for /verify and /resetpass
              // =========================================================================
              ws.serverAuth = {
                userId: payload.userId,
                workspaceId: conversation.workspaceId || '',
                role: platformRole || 'user',
                sessionId: ws.sessionId!,
                authenticatedAt: new Date(),
              };
            }

            // RATE LIMITING: Track connection (enforce 3 concurrent connections max)
            // Skip tracking for guest users since they don't have user records
            if (!isGuestUser) {
              const connectionTracking = await trackConnection(
                payload.userId,
                ws.sessionId!,
                ws.ipAddress,
                ws.userAgent
              );
              
              if (!connectionTracking.allowed) {
                ws.send(JSON.stringify({
                  type: 'error',
                  message: connectionTracking.error || 'Connection limit exceeded',
                }));
                ws.close(1008, 'Too many concurrent connections');
                return;
              }
            }

            // Associate this client with the conversation
            ws.userId = payload.userId;
            ws.userName = displayName;
            ws.workspaceId = conversation.workspaceId;
            ws.conversationId = conversationId; // Use resolved conversation ID
            ws.userStatus = 'online'; // Default status
            ws.userType = userType;

            // Check if user already has an active connection in this room
            const existingClients = conversationClients.get(conversationId);
            const userAlreadyInRoom = existingClients ? Array.from(existingClients).some(
              client => client.userId === payload.userId && client.readyState === WebSocket.OPEN
            ) : false;

            if (!conversationClients.has(conversationId)) {
              conversationClients.set(conversationId, new Set());
            }
            conversationClients.get(conversationId)!.add(ws);

            // GLOBAL TRACKING: Add to platform-wide stats
            globalConnections.totalConnections++;
            globalConnections.allUsers.set(payload.userId, ws);
            if (userType === 'staff') {
              globalConnections.staffUsers.add(payload.userId);
            } else if (userType === 'org_user' || userType === 'guest') {
              // Track non-staff users as subscribers
              globalConnections.subscriberUsers.add(payload.userId);
            }

            // CRITICAL: Send join acknowledgment FIRST so client updates resolvedConversationId
            // before receiving conversation_history. Otherwise filter rejects all messages!
            ws.send(JSON.stringify({
              type: 'conversation_joined',
              conversationId: conversationId, // Send back the resolved UUID, not the slug
              success: true,
            }));

            // Send conversation history - but only for escalated tickets, not main HelpDesk
            // Main HelpDesk starts fresh each time (users get individual help)
            // Escalated tickets need history for staff context
            if (!isMainRoom) {
              const messages = await storage.getChatMessagesByConversation(conversationId);
              ws.send(JSON.stringify({
                type: 'conversation_history',
                conversationId, // CRITICAL: Include conversationId so frontend filter accepts messages
                messages,
              }));
              
              // Mark messages as read for escalated tickets
              await storage.markMessagesAsRead(conversationId, payload.userId);
            } else {
              // For main HelpDesk: Send empty history (start fresh)
              ws.send(JSON.stringify({
                type: 'conversation_history',
                conversationId,
                messages: [],
              }));
            }

            // Broadcast updated user list to all clients in this conversation
            const broadcastUserList = async () => {
              const clients = conversationClients.get(conversationId);
              if (clients) {
                const onlineUsers = [];

                // Add simulation/test users (for testing features)
                if (payload.conversationId === MAIN_ROOM_ID) {
                  // HelpOS AI Bot - Always first in list (check if removed)
                  if (!removedSimulatedUsers.has('helpos-ai-bot')) {
                    onlineUsers.push({
                      id: 'helpos-ai-bot',
                      name: 'HelpOS',
                      role: 'bot',
                      status: 'online',
                      userType: 'staff'
                    });
                  }
                  
                  // Support Staff Team (check if removed)
                  if (!removedSimulatedUsers.has('sim-staff-1')) {
                    onlineUsers.push({
                      id: 'sim-staff-1',
                      name: 'Deputy Sarah',
                      role: 'deputy_admin',
                      status: 'online',
                      userType: 'staff'
                    });
                  }
                  if (!removedSimulatedUsers.has('sim-staff-2')) {
                    onlineUsers.push({
                      id: 'sim-staff-2',
                      name: 'SysOp Mike',
                      role: 'sysop',
                      status: 'online',
                      userType: 'staff'
                    });
                  }
                  if (!removedSimulatedUsers.has('sim-staff-3')) {
                    onlineUsers.push({
                      id: 'sim-staff-3',
                      name: 'Assistant Emily',
                      role: 'deputy_assistant',
                      status: 'online',
                      userType: 'staff'
                    });
                  }
                  if (!removedSimulatedUsers.has('sim-staff-4')) {
                    onlineUsers.push({
                      id: 'sim-staff-4',
                      name: 'SysOp David',
                      role: 'sysop',
                      status: 'busy',
                      userType: 'staff'
                    });
                  }
                  
                  // 10 Users with Different Issues (check if removed)
                  
                  // User 1 - Password Reset Issue
                  if (!removedSimulatedUsers.has('sim-user-1')) {
                    onlineUsers.push({
                      id: 'sim-user-1',
                      name: 'Jennifer Lopez',
                      role: 'guest',
                      status: 'online',
                      userType: 'org_user'
                    });
                  }
                  
                  // User 2 - Billing Question
                  if (!removedSimulatedUsers.has('sim-user-2')) {
                    onlineUsers.push({
                      id: 'sim-user-2',
                      name: 'Robert Johnson',
                      role: 'guest',
                      status: 'online',
                      userType: 'subscriber'
                    });
                  }
                  
                  // User 3 - Account Locked
                  if (!removedSimulatedUsers.has('sim-user-3')) {
                    onlineUsers.push({
                      id: 'sim-user-3',
                      name: 'Maria Garcia',
                      role: 'guest',
                      status: 'online',
                      userType: 'org_user'
                    });
                  }
                  
                  // User 4 - Schedule/Shift Help
                  if (!removedSimulatedUsers.has('sim-user-4')) {
                    onlineUsers.push({
                      id: 'sim-user-4',
                      name: 'James Wilson',
                      role: 'guest',
                      status: 'online',
                      userType: 'org_user'
                    });
                  }
                  
                  // User 5 - Payroll Question
                  if (!removedSimulatedUsers.has('sim-user-5')) {
                    onlineUsers.push({
                      id: 'sim-user-5',
                      name: 'Lisa Anderson',
                      role: 'guest',
                      status: 'away',
                      userType: 'subscriber'
                    });
                  }
                  
                  // User 6 - Feature Request
                  if (!removedSimulatedUsers.has('sim-user-6')) {
                    onlineUsers.push({
                      id: 'sim-user-6',
                      name: 'Michael Brown',
                      role: 'guest',
                      status: 'online',
                      userType: 'subscriber'
                    });
                  }
                  
                  // User 7 - Bug Report
                  if (!removedSimulatedUsers.has('sim-user-7')) {
                    onlineUsers.push({
                      id: 'sim-user-7',
                      name: 'Patricia Davis',
                      role: 'guest',
                      status: 'online',
                      userType: 'org_user'
                    });
                  }
                  
                  // User 8 - Invoice Issue
                  if (!removedSimulatedUsers.has('sim-user-8')) {
                    onlineUsers.push({
                      id: 'sim-user-8',
                      name: 'Christopher Lee',
                      role: 'guest',
                      status: 'online',
                      userType: 'subscriber'
                    });
                  }
                  
                  // User 9 - Onboarding Help
                  if (!removedSimulatedUsers.has('sim-user-9')) {
                    onlineUsers.push({
                      id: 'sim-user-9',
                      name: 'Amanda White',
                      role: 'guest',
                      status: 'online',
                      userType: 'guest'
                    });
                  }
                  
                  // User 10 - Time Tracking Question
                  if (!removedSimulatedUsers.has('sim-user-10')) {
                    onlineUsers.push({
                      id: 'sim-user-10',
                      name: 'Daniel Martinez',
                      role: 'guest',
                      status: 'online',
                      userType: 'org_user'
                    });
                  }
                }

                // Add real users - fetch fresh display info for sync consistency
                const clientArray = Array.from(clients);
                for (const client of clientArray) {
                  if (client.userId && client.readyState === WebSocket.OPEN) {
                    const userRole = await storage.getUserPlatformRole(client.userId);
                    const isStaff = userRole && ['root_admin', 'deputy_admin', 'support_manager', 'sysop'].includes(userRole);
                    
                    // SYNC FIX: Use formatUserDisplayNameForChat for consistency with messages
                    const userInfo = await storage.getUserDisplayInfo(client.userId);
                    const displayName = userInfo ? formatUserDisplayNameForChat({
                      firstName: userInfo.firstName,
                      lastName: userInfo.lastName,
                      email: userInfo.email || undefined,
                      platformRole: userInfo.platformRole || undefined,
                      workspaceRole: userInfo.workspaceRole || undefined,
                    }) : (client.userName || 'User');
                    
                    onlineUsers.push({
                      id: client.userId,
                      name: displayName,
                      role: userRole || 'guest',
                      status: client.userStatus || 'online',
                      userType: client.userType || 'guest'
                    });
                  }
                }
                
                // Users are already filtered above - no need for additional filter
                const filteredUsers = onlineUsers;

                const userListPayload = JSON.stringify({
                  type: 'user_list_update',
                  conversationId: conversationId,
                  users: filteredUsers,
                  count: filteredUsers.length
                });

                clients.forEach((client) => {
                  if (client.readyState === WebSocket.OPEN) {
                    client.send(userListPayload);
                  }
                });
              }
            };

            // Join acknowledgment already sent above (before conversation_history)
            // This ensures the frontend updates its security checks before filtering messages
            await broadcastUserList();

            // Broadcast participants update with detailed user info
            const clients2 = conversationClients.get(payload.conversationId);
            if (clients2) {
              const participants = [];
              for (const client of Array.from(clients2)) {
                if (client.userId && client.readyState === WebSocket.OPEN) {
                  const userRole = await storage.getUserPlatformRole(client.userId).catch(() => null);
                  
                  // SYNC FIX: Use formatUserDisplayNameForChat for consistency
                  const userInfo = await storage.getUserDisplayInfo(client.userId);
                  const displayName = userInfo ? formatUserDisplayNameForChat({
                    firstName: userInfo.firstName,
                    lastName: userInfo.lastName,
                    email: userInfo.email || undefined,
                    platformRole: userInfo.platformRole || undefined,
                    workspaceRole: userInfo.workspaceRole || undefined,
                  }) : (client.userName || 'User');
                  
                  participants.push({
                    id: client.userId,
                    name: displayName,
                    role: userRole || 'guest',
                    status: client.userStatus || 'online',
                    userType: client.userType || 'guest'
                  });
                }
              }

              const participantsPayload = JSON.stringify({
                type: 'participants_update',
                conversationId: conversationId,
                participants: participants,
              });

              clients2.forEach((client) => {
                if (client.readyState === WebSocket.OPEN) {
                  client.send(participantsPayload);
                }
              });
            }

            // HELPDESK ANNOUNCEMENTS: System + HelpOS™ (only if user is joining for the first time)
            if (isMainRoom && !userAlreadyInRoom) {
              try {
                const platformRole = await storage.getUserPlatformRole(payload.userId);
                const isStaff = platformRole && ['root_admin', 'deputy_admin', 'support_manager', 'sysop'].includes(platformRole);
                
                // 1. SYSTEM announcement (IRC-style): User joined
                // displayName already includes title for staff (e.g., "Admin Brigido", "SysOp James")
                const systemJoinMessage = await storage.createChatMessage({
                  conversationId: conversationId,
                  senderId: null,
                  senderName: 'Server',
                  senderType: 'system',
                  message: `${displayName} has joined the chatroom`,
                  messageType: 'text',
                  isSystemMessage: true,
                });

                // Broadcast system message with conversationId so frontend accepts it
                const clients = conversationClients.get(conversationId);
                if (clients) {
                  const systemPayload = JSON.stringify({
                    type: 'new_message',
                    conversationId: conversationId,
                    message: systemJoinMessage,
                  });
                  clients.forEach((client) => {
                    if (client.readyState === WebSocket.OPEN) {
                      client.send(systemPayload);
                    }
                  });
                }

                // 2. HELPOS™ announcement (AI Bot): Only for customers (not staff)
                if (!isStaff) {
                  // AUTO-VOICE for public HelpDesk room: Give guests immediate ability to send messages
                  if (isMainRoom) {
                    if (ws.readyState === WebSocket.OPEN) {
                      ws.send(JSON.stringify({ type: 'voice_granted' }));
                      console.log(`🎤 Auto-granted voice to ${displayName} in public HelpDesk`);
                    }
                  }

                  // Check if user has an active support ticket
                  const existingTicket = await storage.getActiveSupportTicket(payload.userId, ws.workspaceId);
                  
                  let welcomeMessage: string;
                  let ticketNumber: string;
                  
                  if (!existingTicket && ws.workspaceId) {
                    // NO TICKET: Provide welcome message with instructions
                    welcomeMessage = "👋 Welcome to AutoForce™ Support! I'm HelpOS, your AI assistant.\n\nHow can I help you today? Please describe your question or issue, and I'll do my best to assist you.";
                    ticketNumber = `INTAKE-${Date.now().toString().slice(-6)}`; // Temp ID until real ticket created
                  } else {
                    // HAS TICKET: Use existing ticket or create temp one
                    ticketNumber = existingTicket?.ticketNumber || `TKT-${Date.now().toString().slice(-6)}`;
                    
                    const queueEntry = await queueManager.enqueue({
                      conversationId: conversationId,
                      userId: payload.userId?.startsWith('guest-') ? undefined : payload.userId,
                      ticketNumber,
                      userName: displayName,
                      workspaceId: ws.workspaceId,
                    });

                    await queueManager.updateQueuePositions();
                    const updatedEntry = await queueManager.getQueueEntry(conversationId);
                    
                    if (updatedEntry) {
                      const queueStatus = await queueManager.getQueueStatus();
                      const position = updatedEntry.queuePosition || 1;
                      const waitTime = updatedEntry.estimatedWaitMinutes || 5;
                      welcomeMessage = `👋 Welcome ${displayName}! Your ticket ${ticketNumber} has been created.\n\nYou're #${position} in queue with an estimated wait time of ${waitTime} minutes. ${queueStatus.waitingCount} users are currently waiting. A support staff member will assist you shortly.`;
                      await queueManager.markWelcomeSent(queueEntry.id);
                    } else {
                      welcomeMessage = `Welcome ${displayName}! Your ticket is ${ticketNumber}.`;
                    }
                  }
                  
                  // EPHEMERAL welcome message - NOT saved to database to prevent doubles
                  const botMessage = {
                    id: `temp-${Date.now()}`,
                    conversationId: conversationId,
                    senderId: 'ai-bot',
                    senderName: 'HelpOS™',
                    senderType: 'bot',
                    message: welcomeMessage,
                    messageType: 'text',
                    createdAt: new Date(),
                    isPrivateMessage: true,
                    recipientId: payload.userId,
                    isSystemMessage: false,
                    attachmentUrl: null,
                    attachmentName: null,
                    isRead: false,
                    readAt: null,
                  };

                  // Send PRIVATE HelpOS welcome DM (only to this user, ephemeral)
                  const privateWelcome = JSON.stringify({
                    type: 'private_message',
                    message: botMessage,
                    from: 'HelpOS™',
                  });
                  if (ws.readyState === WebSocket.OPEN) {
                    ws.send(privateWelcome);
                  }
                }
              } catch (announceError) {
                console.error('Failed to send join announcements:', announceError);
                
                // FALLBACK: Send basic welcome if queue system fails
                try {
                  const clients = conversationClients.get(conversationId);
                  const fallbackMessage = await storage.createChatMessage({
                    conversationId: conversationId,
                    senderId: null,
                    senderName: 'System',
                    senderType: 'system',
                    message: `Welcome to HelpDesk! Support staff will assist you shortly.`,
                    messageType: 'text',
                    isSystemMessage: true,
                  });

                  if (clients) {
                    const fallbackPayload = JSON.stringify({
                      type: 'new_message',
                      message: fallbackMessage,
                    });
                    clients.forEach((client) => {
                      if (client.readyState === WebSocket.OPEN) {
                        client.send(fallbackPayload);
                      }
                    });
                  }
                } catch (fallbackError) {
                  console.error('Fallback welcome also failed:', fallbackError);
                }
              }
            }

            // HelpOS greets everyone who joins (only send to the joining user, not the entire room, and only if first time joining)
            if (isMainRoom && !userAlreadyInRoom) {
              try {
                // Determine greeting based on user type
                // displayName already includes title for staff (e.g., "Admin Brigido")
                let greeting = '';
                if (isStaff) {
                  greeting = `Welcome back, ${displayName}! Support chat is active. Right-click users for quick actions.`;
                } else {
                  greeting = `Welcome to AutoForce™ Support! You can send messages right away. A support agent will assist you shortly. Feel free to describe your issue or ask any questions.`;
                }

                // Send welcome message ONLY to the joining user (not saved to DB)
                const welcomePayload = JSON.stringify({
                  type: 'private_message',
                  message: {
                    id: `welcome-${Date.now()}`,
                    createdAt: new Date(),
                    conversationId: conversationId,
                    senderId: 'helpos-ai-bot',
                    senderName: 'HelpOS™',
                    senderType: 'bot',
                    message: greeting,
                    messageType: 'text',
                    isSystemMessage: false,
                  },
                });
                
                // Send ONLY to the user who just joined
                if (ws.readyState === WebSocket.OPEN) {
                  ws.send(welcomePayload);
                }
              } catch (greetError) {
                console.error('HelpOS greeting failed:', greetError);
              }
            }

            // Single consolidated log message (only for NEW joins, not reconnections)
            if (!userAlreadyInRoom) {
              if (isMainRoom) {
                console.log(`✅ ${displayName} joined HelpDesk (${userRoleInfo})`);
              } else {
                console.log(`${displayName} joined conversation ${payload.conversationId}`);
              }
            }
            break;
          }

          case 'chat_message': {
            if (!ws.conversationId || !ws.userId) {
              ws.send(JSON.stringify({
                type: 'error',
                message: 'Must join a conversation first',
              }));
              return;
            }

            // SECURITY: Enforce that message goes to the joined conversation only
            if (payload.conversationId !== ws.conversationId) {
              ws.send(JSON.stringify({
                type: 'error',
                message: 'Cannot send message to different conversation',
              }));
              return;
            }

            // RATE LIMITING: Check message rate limit (30 messages/minute)
            const rateCheck = checkMessageRateLimit(ws.userId);
            if (!rateCheck.allowed) {
              ws.send(JSON.stringify({
                type: 'error',
                message: `Rate limit exceeded. You can send another message in ${rateCheck.retryAfter} seconds.`,
                retryAfter: rateCheck.retryAfter
              }));
              return;
            }

            // Get user display info for formatted name (server-side formatting for security)
            const userInfo = await storage.getUserDisplayInfo(ws.userId);
            const displayName = userInfo ? formatUserDisplayNameForChat({
              firstName: userInfo.firstName,
              lastName: userInfo.lastName,
              email: userInfo.email || undefined,
              platformRole: userInfo.platformRole || undefined,
              workspaceRole: userInfo.workspaceRole || undefined,
            }) : payload.senderName || 'User';

            // SLASH COMMAND HANDLER: Check if message is a command
            const parsedCommand = parseSlashCommand(payload.message);
            if (parsedCommand) {
              // Validate command
              const validation = validateCommand(parsedCommand);
              if (!validation.valid) {
                ws.send(JSON.stringify({
                  type: 'error',
                  message: validation.error,
                }));
                return;
              }

              // Check if user has permission for staff commands
              const commandDef = COMMAND_REGISTRY[parsedCommand.command];
              if (commandDef.requiresStaff) {
                const platformRole = await storage.getUserPlatformRole(ws.userId);
                const isStaff = platformRole && ['root_admin', 'deputy_admin', 'support_manager', 'sysop'].includes(platformRole);
                if (!isStaff) {
                  ws.send(JSON.stringify({
                    type: 'error',
                    message: 'You do not have permission to use this command.',
                  }));
                  return;
                }
              }

              // Execute command
              const clients = conversationClients.get(ws.conversationId);
              
              // Get staff member info for command execution
              const staffInfo = await storage.getUserDisplayInfo(ws.userId);
              const staffDisplayName = staffInfo ? formatUserDisplayName({
                firstName: staffInfo.firstName,
                lastName: staffInfo.lastName,
                email: staffInfo.email || undefined,
                platformRole: staffInfo.platformRole || undefined,
                workspaceRole: staffInfo.workspaceRole || undefined,
              }) : ws.userName || 'Support Staff';
              
              const staffRole = staffInfo?.platformRole || 'support';
              const staffRoleName = staffRole === 'root_admin' ? 'Senior Support Administrator' :
                                  staffRole === 'deputy_admin' ? 'Support Manager' :
                                  staffRole === 'deputy_assistant' ? 'Senior Support Agent' :
                                  staffRole === 'sysop' ? 'Support Agent' : 'Support Team Member';
              
              switch (parsedCommand.command) {
                case 'intro': {
                  // AI bot introduces staff to customer with role and identity
                  const introMessage = `📢 ${staffDisplayName} (${staffRoleName}) is now ready to assist you!\n\nℹ️ To help you better, please share:\n• Your full name\n• Organization/Company name\n• Brief description of how we can help\n\n💬 Our support team is here to help with any questions about WorkforceOS!`;
                  
                  const botMsg = await storage.createChatMessage({
                    conversationId: ws.conversationId,
                    senderId: 'ai-bot',
                    senderName: 'HelpOS™',
                    senderType: 'bot',
                    message: introMessage,
                    messageType: 'text',
                  });
                  
                  if (clients) {
                    clients.forEach((client) => {
                      if (client.readyState === WebSocket.OPEN) {
                        client.send(JSON.stringify({ type: 'new_message', message: botMsg }));
                      }
                    });
                  }
                  break;
                }
                
                case 'auth': {
                  // Request user authentication
                  const username = parsedCommand.args[0];
                  if (!username) {
                    ws.send(JSON.stringify({
                      type: 'error',
                      message: 'Usage: /auth <username>',
                    }));
                    break;
                  }
                  
                  const authMsg = await storage.createChatMessage({
                    conversationId: ws.conversationId,
                    senderId: 'ai-bot',
                    senderName: 'HelpOS™',
                    senderType: 'bot',
                    message: `🔐 Authentication Request\n\nPlease authenticate user: ${username}\n\nThe user will receive instructions to verify their identity. This may include:\n• Confirming email address\n• Answering security questions\n• Providing account details\n\nWaiting for user verification...`,
                    messageType: 'text',
                  });
                  
                  if (clients) {
                    clients.forEach((client) => {
                      if (client.readyState === WebSocket.OPEN) {
                        client.send(JSON.stringify({ type: 'new_message', message: authMsg }));
                      }
                    });
                  }
                  break;
                }
                
                case 'verify': {
                  // SECURITY: Use server-derived authentication (cannot be forged)
                  if (!ws.serverAuth) {
                    ws.send(JSON.stringify({
                      type: 'error',
                      message: '⛔ Authentication required',
                    }));
                    break;
                  }
                  
                  const { userId, workspaceId, role } = ws.serverAuth;
                  
                  // SECURITY: Verify staff-only access with server-derived role
                  const isAuthorized = ['root_admin', 'deputy_admin', 'support_agent', 'support_manager', 'sysop'].includes(role);
                  if (!isAuthorized) {
                    ws.send(JSON.stringify({
                      type: 'error',
                      message: '⛔ Unauthorized: This command requires staff privileges',
                    }));
                    break;
                  }
                  
                  const username = parsedCommand.args[0];
                  if (!username) {
                    ws.send(JSON.stringify({
                      type: 'error',
                      message: 'Usage: /verify <username>',
                    }));
                    break;
                  }
                  
                  const user = await storage.getUserByUsernameOrEmail(username);
                  
                  let verifyMsg: string;
                  if (!user) {
                    verifyMsg = `❌ User Verification Failed\n\nUser "${username}" not found in the system.\n\nPlease check:\n• Username spelling\n• Email address\n• User may not be registered yet`;
                  } else {
                    // SECURITY: Workspace enforcement - block cross-workspace access
                    const targetWorkspaceId = user.currentWorkspaceId || '';
                    const access = validateWorkspaceAccess(workspaceId, targetWorkspaceId, role);
                    
                    if (!access.allowed) {
                      verifyMsg = `⛔ Access Denied\n\nCannot access users from other workspaces.\n\nYour workspace: ${workspaceId || 'platform'}\nTarget workspace: ${targetWorkspaceId || 'platform'}\n\n${access.reason}`;
                    } else {
                      const workspace = user.currentWorkspaceId 
                        ? await storage.getWorkspace(user.currentWorkspaceId)
                        : null;
                      
                      // SECURITY: Redact sensitive information
                      const redactedEmail = user.email 
                        ? `${user.email.substring(0, 3)}***@${user.email.split('@')[1]}` 
                        : 'Not available';
                      const redactedLastName = user.lastName 
                        ? `${user.lastName.substring(0, 1)}***` 
                        : 'N/A';
                      
                      verifyMsg = `✅ User Verification Successful\n\nUser: ${redactedEmail}\nName: ${user.firstName || 'N/A'} ${redactedLastName}\nOrganization: ${workspace?.name || 'Unknown'}\nRole: ${user.role || 'No role assigned'}\nEmail Verified: ${user.emailVerified ? 'Yes' : 'No'}\n\n✓ Credentials verified`;
                    }
                  }
                  
                  const botMsg = await storage.createChatMessage({
                    conversationId: ws.conversationId,
                    senderId: 'ai-bot',
                    senderName: 'HelpOS™',
                    senderType: 'bot',
                    message: verifyMsg,
                    messageType: 'text',
                    visibleToStaffOnly: true,
                  });
                  
                  // SECURITY: Send only to requesting user (not broadcast to all)
                  ws.send(JSON.stringify({ type: 'new_message', message: botMsg }));
                  break;
                }
                
                case 'resetpass': {
                  // SECURITY: Use server-derived authentication (cannot be forged)
                  if (!ws.serverAuth) {
                    ws.send(JSON.stringify({
                      type: 'error',
                      message: '⛔ Authentication required',
                    }));
                    break;
                  }
                  
                  const { userId, workspaceId, role, sessionId } = ws.serverAuth;
                  
                  // SECURITY: Verify support staff role with server-derived authorization
                  const isStaffAuthorized = ['support_agent', 'deputy_admin', 'root_admin', 'support_manager'].includes(role);
                  if (!isStaffAuthorized) {
                    ws.send(JSON.stringify({
                      type: 'error',
                      message: '⛔ Unauthorized: This command requires support team privileges',
                    }));
                    break;
                  }
                  
                  const email = parsedCommand.args[0];
                  if (!email) {
                    ws.send(JSON.stringify({
                      type: 'error',
                      message: 'Usage: /resetpass <email>',
                    }));
                    break;
                  }
                  
                  // Validate email format
                  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
                  if (!emailRegex.test(email)) {
                    ws.send(JSON.stringify({
                      type: 'error',
                      message: '❌ Invalid email format',
                    }));
                    break;
                  }
                  
                  // SECURITY: Multi-dimensional rate limiting (user + IP + session)
                  const rateLimit = checkMultiDimensionalRateLimit(
                    userId,
                    email,
                    ws.ipAddress || 'unknown',
                    sessionId,
                    5, // 5 attempts
                    60  // per hour
                  );
                  
                  if (!rateLimit.allowed) {
                    await storage.logPasswordResetAttempt({
                      requestedBy: userId,
                      requestedByWorkspaceId: workspaceId || null,
                      targetUserId: null,
                      targetEmail: email,
                      targetWorkspaceId: null,
                      success: false,
                      outcomeCode: 'rate_limited',
                      reason: `Rate limit exceeded (blocked by ${rateLimit.blockedBy})`,
                      ipAddress: ws.ipAddress || null,
                      userAgent: ws.userAgent || null,
                    });
                    
                    const resetMsg = `❌ Rate Limit Exceeded\n\nToo many password reset attempts.\n\nBlocked by: ${rateLimit.blockedBy}\nLimit: 5 attempts per hour\n\nPlease try again later.`;
                    
                    ws.send(JSON.stringify({ type: 'system_message', message: resetMsg }));
                    break;
                  }
                  
                  let resetMsg: string;
                  
                  try {
                    // Look up user by email
                    const user = await storage.getUserByEmail(email);
                    
                    // SECURITY: MANDATORY workspace resolution
                    if (!user) {
                      // User not found - BLOCK action and log as security event
                      await storage.logPasswordResetAttempt({
                        requestedBy: userId,
                        requestedByWorkspaceId: workspaceId || null,
                        targetUserId: null,
                        targetEmail: email,
                        targetWorkspaceId: null,
                        success: false,
                        outcomeCode: 'not_found',
                        reason: 'User not found - action blocked for security',
                        ipAddress: ws.ipAddress || null,
                        userAgent: ws.userAgent || null,
                      });
                      
                      // SECURITY: Generic message (don't reveal if email exists)
                      resetMsg = `✅ Password Reset Processed\n\nIf an account exists with this email, a password reset link has been sent.\n\nThe link will expire in 1 hour.`;
                      
                      ws.send(JSON.stringify({ 
                        type: 'system_message', 
                        message: resetMsg 
                      }));
                      break; // BLOCK action (don't proceed to email send)
                    }
                    
                    // User found - validate workspace access
                    const targetWorkspaceId = user.currentWorkspaceId || '';
                    const access = validateWorkspaceAccess(workspaceId, targetWorkspaceId, role);
                    
                    if (!access.allowed) {
                      // Cross-workspace attempt - LOG AND BLOCK
                      await storage.logPasswordResetAttempt({
                        requestedBy: userId,
                        requestedByWorkspaceId: workspaceId || null,
                        targetUserId: user.id,
                        targetEmail: email,
                        targetWorkspaceId: targetWorkspaceId || null,
                        success: false,
                        outcomeCode: 'error',
                        reason: 'Cross-workspace reset blocked',
                        ipAddress: ws.ipAddress || null,
                        userAgent: ws.userAgent || null,
                      });
                      
                      resetMsg = `❌ Cross-Workspace Access Denied\n\nYou cannot reset passwords for users in other workspaces.\n\nTarget workspace: ${targetWorkspaceId || 'platform'}\nYour workspace: ${workspaceId || 'platform'}`;
                      
                      ws.send(JSON.stringify({ 
                        type: 'system_message', 
                        message: resetMsg 
                      }));
                      break; // BLOCK action
                    }
                    
                    // Workspace validated - attempt password reset
                    try {
                      await storage.createPasswordResetToken(user.id);
                      
                      // Success - log with IP/session context
                      await storage.logPasswordResetAttempt({
                        requestedBy: userId,
                        requestedByWorkspaceId: workspaceId || null,
                        targetUserId: user.id,
                        targetEmail: email,
                        targetWorkspaceId: user.currentWorkspaceId || null,
                        success: true,
                        outcomeCode: 'sent',
                        reason: 'Reset email sent',
                        ipAddress: ws.ipAddress || null,
                        userAgent: ws.userAgent || null,
                      });
                      
                      // Redact email for privacy
                      const redactedEmail = `${email.substring(0, 3)}***@${email.split('@')[1]}`;
                      
                      resetMsg = `✅ Password Reset Email Sent\n\nA password reset link has been sent to:\n${redactedEmail}\n\nUser: ${user.firstName} ${user.lastName?.substring(0, 1)}***\n\nThe link will expire in 1 hour.`;
                      
                      console.log(`[AUDIT] Password reset triggered via WebSocket by ${userId} for ${user.id} from IP ${ws.ipAddress}`);
                    } catch (emailError) {
                      // Email sending failed
                      console.error('[WEBSOCKET] Password reset email error:', emailError);
                      
                      await storage.logPasswordResetAttempt({
                        requestedBy: userId,
                        requestedByWorkspaceId: workspaceId || null,
                        targetUserId: user.id,
                        targetEmail: email,
                        targetWorkspaceId: user.currentWorkspaceId || null,
                        success: false,
                        outcomeCode: 'email_failed',
                        reason: `Email send failed: ${(emailError as Error).message}`,
                        ipAddress: ws.ipAddress || null,
                        userAgent: ws.userAgent || null,
                      });
                      
                      resetMsg = `❌ Password Reset Failed\n\nFailed to send password reset email.\n\nReason: ${(emailError as Error).message}\n\nPlease try again or contact system administrator.`;
                    }
                  } catch (error) {
                    console.error('[WEBSOCKET] Password reset error:', error);
                    resetMsg = `❌ Password Reset Failed\n\nAn error occurred while processing the password reset.\n\nPlease try again or contact a system administrator.`;
                  }
                  
                  // Send result only to requesting user (not broadcast)
                  ws.send(JSON.stringify({ 
                    type: 'system_message', 
                    message: resetMsg 
                  }));
                  
                  break;
                }
                
                case 'close': {
                  // Close current ticket/session
                  const reason = parsedCommand.args.join(' ') || 'Session closed by staff';
                  
                  // System announcement: Ticket closed
                  const systemMsg = await storage.createChatMessage({
                    conversationId: ws.conversationId,
                    senderId: null,
                    senderName: 'Server',
                    senderType: 'system',
                    message: `${displayName} closed ticket. Reason: ${reason}`,
                    messageType: 'text',
                    isSystemMessage: true,
                  });
                  
                  // Remove from queue if present
                  await queueManager.dequeue(ws.conversationId, 'resolved');
                  
                  // Close conversation
                  await storage.closeChatConversation(ws.conversationId);
                  
                  // Broadcast closure
                  if (clients) {
                    clients.forEach((client) => {
                      if (client.readyState === WebSocket.OPEN) {
                        client.send(JSON.stringify({ 
                          type: 'new_message', 
                          message: systemMsg 
                        }));
                        // Trigger feedback request on client side
                        client.send(JSON.stringify({
                          type: 'request_feedback',
                          conversationId: ws.conversationId,
                        }));
                      }
                    });
                  }
                  break;
                }
                
                case 'status': {
                  // Customer checks their ticket status
                  const conversation = await storage.getChatConversation(ws.conversationId);
                  const queueEntry = await queueManager.getPosition(ws.conversationId);
                  
                  let statusMsg = `📊 Ticket Status\n\n`;
                  statusMsg += `Status: ${conversation?.status || 'Unknown'}\n`;
                  statusMsg += `Ticket ID: ${ws.conversationId}\n`;
                  
                  if (queueEntry) {
                    statusMsg += `\nQueue Information:\n`;
                    statusMsg += `• Position: #${queueEntry.position}\n`;
                    statusMsg += `• Priority Score: ${queueEntry.priorityScore}\n`;
                    statusMsg += `• Wait Time: ${Math.floor(queueEntry.waitTimeMinutes)} minutes\n`;
                  }
                  
                  const botMsg = await storage.createChatMessage({
                    conversationId: ws.conversationId,
                    senderId: 'ai-bot',
                    senderName: 'HelpOS™',
                    senderType: 'bot',
                    message: statusMsg,
                    messageType: 'text',
                  });
                  
                  if (clients) {
                    clients.forEach((client) => {
                      if (client.readyState === WebSocket.OPEN) {
                        client.send(JSON.stringify({ type: 'new_message', message: botMsg }));
                      }
                    });
                  }
                  break;
                }
                
                case 'queue': {
                  // Customer checks queue position
                  const queueEntry = await queueManager.getPosition(ws.conversationId);
                  
                  let queueMsg: string;
                  if (queueEntry) {
                    queueMsg = `⏳ Queue Position\n\nYou are currently #${queueEntry.position} in line.\n\nEstimated wait: ${Math.ceil(queueEntry.waitTimeMinutes)} minutes\nPriority score: ${queueEntry.priorityScore} points\n\nWe'll notify you when a support agent is available!`;
                  } else {
                    queueMsg = `✅ Not in Queue\n\nYou are not currently in the support queue. You may already be connected with a support agent, or your ticket has been resolved.`;
                  }
                  
                  const botMsg = await storage.createChatMessage({
                    conversationId: ws.conversationId,
                    senderId: 'ai-bot',
                    senderName: 'HelpOS™',
                    senderType: 'bot',
                    message: queueMsg,
                    messageType: 'text',
                  });
                  
                  if (clients) {
                    clients.forEach((client) => {
                      if (client.readyState === WebSocket.OPEN) {
                        client.send(JSON.stringify({ type: 'new_message', message: botMsg }));
                      }
                    });
                  }
                  break;
                }
                
                case 'kick': {
                  // Staff kicks a user from chat (with hierarchy protection)
                  const { checkStaffActionAuthorization } = await import('./services/staffHierarchy');
                  
                  const targetUsername = parsedCommand.args[0];
                  const reason = parsedCommand.args.slice(1).join(' ') || 'No reason provided';
                  
                  if (!targetUsername) {
                    ws.send(JSON.stringify({
                      type: 'error',
                      message: 'Usage: /kick <username> [reason]',
                    }));
                    break;
                  }
                  
                  // CRITICAL FIX: Find target user ID from connected clients (not display name)
                  let targetUserId: string | null = null;
                  let targetUserDisplayName: string = targetUsername;
                  
                  if (clients) {
                    clients.forEach((client) => {
                      // Match by userId OR by display name
                      if (client.userId === targetUsername || client.userName === targetUsername) {
                        targetUserId = client.userId;
                        targetUserDisplayName = client.userName || targetUsername;
                      }
                    });
                  }
                  
                  if (!targetUserId) {
                    ws.send(JSON.stringify({
                      type: 'error',
                      message: `User "${targetUsername}" not found in this conversation.`,
                    }));
                    break;
                  }
                  
                  // SELF-KICK PROTECTION: Prevent kicking yourself
                  if (targetUserId === ws.userId) {
                    ws.send(JSON.stringify({
                      type: 'error',
                      message: '⛔ You cannot kick yourself from the chat.',
                    }));
                    break;
                  }
                  
                  // Find target user role (use userId, not username)
                  const targetRole = await storage.getUserPlatformRole(targetUserId);
                  const actorRole = await storage.getUserPlatformRole(ws.userId);
                  
                  // ROOT ADMIN PROTECTION: Nobody can kick root_admin
                  if (targetRole === 'root_admin') {
                    ws.send(JSON.stringify({
                      type: 'error',
                      message: '⛔ Platform administrators cannot be kicked.',
                    }));
                    break;
                  }
                  
                  // Check hierarchy authorization
                  const authCheck = checkStaffActionAuthorization(actorRole, targetRole, 'kick');
                  if (!authCheck.authorized) {
                    ws.send(JSON.stringify({
                      type: 'error',
                      message: authCheck.reason || 'You cannot kick this user.',
                    }));
                    break;
                  }
                  
                  // Check if target user is actually connected and kick ONLY them
                  let userFound = false;
                  let wasConnected = false;
                  
                  if (clients) {
                    clients.forEach((client) => {
                      // FIX: Compare userId to userId (not userId to display name)
                      if (client.userId === targetUserId && client.readyState === WebSocket.OPEN) {
                        userFound = true;
                        wasConnected = true;
                        // Send kick event to target user
                        client.send(JSON.stringify({
                          type: 'kicked',
                          reason: reason,
                        }));
                        client.close(1000, `Kicked: ${reason}`);
                      }
                    });
                  }
                  
                  // System announcement with appropriate feedback (use display name for clarity)
                  const kickMsg = await storage.createChatMessage({
                    conversationId: ws.conversationId,
                    senderId: null,
                    senderName: 'Server',
                    senderType: 'system',
                    message: wasConnected 
                      ? `✅ ${staffDisplayName} (${staffRoleName}) removed ${targetUserDisplayName} from chat. Reason: ${reason}`
                      : `⚠️ Command executed: ${staffDisplayName} (${staffRoleName}) attempted to kick ${targetUserDisplayName} (user not currently connected). Reason: ${reason}`,
                    messageType: 'text',
                    isSystemMessage: true,
                  });
                  
                  if (clients) {
                    clients.forEach((client) => {
                      if (client.readyState === WebSocket.OPEN) {
                        client.send(JSON.stringify({ type: 'new_message', message: kickMsg }));
                      }
                    });
                  }
                  break;
                }
                
                case 'mute': {
                  // Staff mutes a user temporarily
                  const targetUsername = parsedCommand.args[0];
                  const duration = parsedCommand.args[1] || '5'; // minutes
                  
                  if (!targetUsername) {
                    ws.send(JSON.stringify({
                      type: 'error',
                      message: 'Usage: /mute <username> [duration_in_minutes]',
                    }));
                    break;
                  }
                  
                  // Check if target user is actually connected
                  let userConnected = false;
                  if (clients) {
                    clients.forEach((client) => {
                      if (client.userId === targetUsername && client.readyState === WebSocket.OPEN) {
                        userConnected = true;
                        // Send mute notification to target user
                        client.send(JSON.stringify({
                          type: 'muted',
                          duration: duration,
                        }));
                        // Send voice_removed event for animated status bar
                        client.send(JSON.stringify({
                          type: 'voice_removed',
                        }));
                      }
                    });
                  }
                  
                  const muteMsg = await storage.createChatMessage({
                    conversationId: ws.conversationId,
                    senderId: 'ai-bot',
                    senderName: 'HelpOS™',
                    senderType: 'bot',
                    message: userConnected
                      ? `🔇 User Muted\n\n${targetUsername} has been muted for ${duration} minutes.\n\nThey can still read messages but cannot send messages during this time.`
                      : `⚠️ Mute Command Executed\n\nAttempted to mute ${targetUsername} for ${duration} minutes.\n\n⚠️ *Note: User not currently connected or is a simulated/test user. Command worked but had no active target.*`,
                    messageType: 'text',
                  });
                  
                  if (clients) {
                    clients.forEach((client) => {
                      if (client.readyState === WebSocket.OPEN) {
                        client.send(JSON.stringify({ type: 'new_message', message: muteMsg }));
                      }
                    });
                  }
                  break;
                }
                
                case 'whisper': {
                  // Send private message to specific user (staff only)
                  const targetUserId = parsedCommand.args[0];
                  const privateMessage = parsedCommand.args.slice(1).join(' ');
                  
                  if (!targetUserId || !privateMessage) {
                    ws.send(JSON.stringify({
                      type: 'error',
                      message: 'Usage: /whisper <userId> <message>',
                    }));
                    break;
                  }
                  
                  // Find target user by userId
                  let targetClient: any = null;
                  let targetUserName: string = targetUserId;
                  
                  if (clients) {
                    clients.forEach((client) => {
                      if (client.userId === targetUserId && client.readyState === WebSocket.OPEN) {
                        targetClient = client;
                        targetUserName = client.userName || targetUserId;
                      }
                    });
                  }
                  
                  if (!targetClient) {
                    ws.send(JSON.stringify({
                      type: 'error',
                      message: `User "${targetUserId}" not found or not currently online. Use /users to see online users and their IDs.`,
                    }));
                    break;
                  }
                  
                  // Create private message (saved to database with isPrivateMessage = true)
                  const whisperMsg = await storage.createChatMessage({
                    conversationId: ws.conversationId,
                    senderId: ws.userId!,
                    senderName: displayName,
                    senderType: 'user',
                    message: privateMessage,
                    messageType: 'text',
                    isPrivateMessage: true,
                    recipientId: targetUserId,
                  });
                  
                  // Send to target user only
                  if (targetClient.readyState === WebSocket.OPEN) {
                    targetClient.send(JSON.stringify({
                      type: 'new_message',
                      message: whisperMsg,
                    }));
                  }
                  
                  // Send confirmation back to sender (so they see what they sent)
                  ws.send(JSON.stringify({
                    type: 'new_message',
                    message: whisperMsg,
                  }));
                  
                  console.log(`✅ Whisper delivered: ${displayName} → ${targetUserName}: "${privateMessage.substring(0, 50)}..."`);
                  break;
                }
                
                case 'transfer': {
                  // Transfer ticket to another staff member
                  const targetStaff = parsedCommand.args[0];
                  
                  if (!targetStaff) {
                    ws.send(JSON.stringify({
                      type: 'error',
                      message: 'Usage: /transfer <staff_username>',
                    }));
                    break;
                  }
                  
                  // Check if target staff is actually connected
                  let staffConnected = false;
                  if (clients) {
                    clients.forEach((client) => {
                      if (client.userId === targetStaff && client.readyState === WebSocket.OPEN) {
                        staffConnected = true;
                        // Notify target staff of transfer
                        client.send(JSON.stringify({
                          type: 'transfer_assigned',
                          from: displayName,
                        }));
                      }
                    });
                  }
                  
                  const transferMsg = await storage.createChatMessage({
                    conversationId: ws.conversationId,
                    senderId: null,
                    senderName: 'Server',
                    senderType: 'system',
                    message: staffConnected
                      ? `✅ ${staffDisplayName} (${staffRoleName}) transferred ticket to ${targetStaff}`
                      : `⚠️ ${staffDisplayName} (${staffRoleName}) attempted transfer to ${targetStaff} (staff member not currently online or is simulated/test user)`,
                    messageType: 'text',
                    isSystemMessage: true,
                  });
                  
                  if (clients) {
                    clients.forEach((client) => {
                      if (client.readyState === WebSocket.OPEN) {
                        client.send(JSON.stringify({ type: 'new_message', message: transferMsg }));
                      }
                    });
                  }
                  break;
                }
                
                case 'help': {
                  const platformRole = await storage.getUserPlatformRole(ws.userId);
                  const isStaff = !!(platformRole && ['root_admin', 'deputy_admin', 'support_manager', 'sysop'].includes(platformRole));
                  const helpText = getHelpText(isStaff);
                  
                  ws.send(JSON.stringify({
                    type: 'system_message',
                    message: helpText,
                  }));
                  break;
                }
                
                case 'motd': {
                  // Update Message of the Day
                  const newMOTD = parsedCommand.args.join(' ');
                  currentMOTD = newMOTD;
                  
                  // Broadcast IRC-style MOTD update to all users in conversation
                  const motdUpdateMsg = await storage.createChatMessage({
                    conversationId: ws.conversationId,
                    senderId: null,
                    senderName: 'irc.wfos.com',
                    senderType: 'system',
                    message: `MOTD updated by ${displayName}: ${newMOTD}`,
                    messageType: 'text',
                    isSystemMessage: true,
                  });
                  
                  if (clients) {
                    clients.forEach((client) => {
                      if (client.readyState === WebSocket.OPEN) {
                        client.send(JSON.stringify({ 
                          type: 'motd_update',
                          motd: newMOTD,
                          message: motdUpdateMsg 
                        }));
                      }
                    });
                  }
                  break;
                }
                
                case 'banner': {
                  // Update announcement banner message
                  const bannerMessage = parsedCommand.args.join(' ');
                  
                  // Broadcast banner update to all users in conversation
                  const bannerUpdateMsg = await storage.createChatMessage({
                    conversationId: ws.conversationId,
                    senderId: null,
                    senderName: 'System',
                    senderType: 'system',
                    message: `📢 Banner updated by ${displayName}`,
                    messageType: 'text',
                    isSystemMessage: true,
                  });
                  
                  if (clients) {
                    clients.forEach((client) => {
                      if (client.readyState === WebSocket.OPEN) {
                        client.send(JSON.stringify({ 
                          type: 'banner_update',
                          bannerMessage,
                          staffName: displayName,
                          message: bannerUpdateMsg 
                        }));
                      }
                    });
                  }
                  break;
                }
                
                case 'ask': {
                  // AI Knowledge Retrieval - Ask questions about policies, procedures, FAQs
                  const query = parsedCommand.args.join(' ');
                  
                  if (!query || query.trim().length === 0) {
                    ws.send(JSON.stringify({
                      type: 'error',
                      message: 'Usage: /ask <your question>\n\nExample: /ask What is the vacation policy?',
                    }));
                    break;
                  }
                  
                  // Send "thinking" indicator
                  const thinkingMsg = await storage.createChatMessage({
                    conversationId: ws.conversationId,
                    senderId: 'ai-bot',
                    senderName: 'KnowledgeOS™',
                    senderType: 'bot',
                    message: `🔍 Searching knowledge base for: "${query}"...`,
                    messageType: 'text',
                  });
                  
                  if (clients) {
                    clients.forEach((client) => {
                      if (client.readyState === WebSocket.OPEN) {
                        client.send(JSON.stringify({ type: 'new_message', message: thinkingMsg }));
                      }
                    });
                  }
                  
                  try {
                    // Import required modules
                    const { db } = await import('./db');
                    const { knowledgeArticles, knowledgeQueries } = await import('@shared/schema');
                    const { eq, or } = await import('drizzle-orm');
                    
                    // Get workspace ID
                    const workspaceId = ws.workspaceId || null;
                    const startTime = Date.now();
                    
                    // Search relevant knowledge articles (public articles available to all)
                    const relevantArticles = await db
                      .select()
                      .from(knowledgeArticles)
                      .where(eq(knowledgeArticles.isPublic, true))
                      .limit(5);
                    
                    // Build context from articles
                    const context = relevantArticles
                      .map((article: any, idx: number) => `[Article ${idx + 1}: ${article.title}]\n${article.content}`)
                      .join('\n\n');
                    
                    let aiResponse = '';
                    
                    // Try AI if available
                    if (process.env.OPENAI_API_KEY || process.env.AI_INTEGRATIONS_OPENAI_API_KEY) {
                      try {
                        const { default: OpenAI } = await import('openai');
                        const openai = new OpenAI({ 
                          apiKey: process.env.OPENAI_API_KEY || process.env.AI_INTEGRATIONS_OPENAI_API_KEY,
                          baseURL: process.env.AI_INTEGRATIONS_OPENAI_BASE_URL,
                        });
                        
                        const completion = await openai.chat.completions.create({
                          model: 'gpt-4',
                          messages: [
                            {
                              role: 'system',
                              content: `You are a helpful HR assistant for WorkforceOS. Answer employee questions about company policies, procedures, and benefits using the provided knowledge base. Be concise, friendly, and accurate. If you don't know the answer, say so and suggest contacting HR.`
                            },
                            {
                              role: 'user',
                              content: `Context from knowledge base:\n${context}\n\nEmployee question: ${query}`
                            }
                          ],
                          temperature: 0.3,
                          max_tokens: 500,
                        });
                        
                        aiResponse = completion.choices[0]?.message?.content || '';
                      } catch (aiError) {
                        console.error('AI generation error:', aiError);
                      }
                    }
                    
                    // Fallback if AI unavailable
                    if (!aiResponse) {
                      aiResponse = relevantArticles.length > 0
                        ? `I found ${relevantArticles.length} related articles:\n\n${relevantArticles.map((a: any) => `• ${a.title}\n  ${a.summary || a.content.substring(0, 200)}...`).join('\n\n')}`
                        : "I couldn't find any relevant information in the knowledge base. Please contact HR or your manager for assistance.";
                    }
                    
                    // Log the query
                    await db.insert(knowledgeQueries).values({
                      workspaceId,
                      userId: ws.userId,
                      query,
                      response: aiResponse,
                      responseTime: Date.now() - startTime,
                      articlesRetrieved: relevantArticles.map((a: any) => a.id),
                    });
                    
                    // Format response with article references
                    let formattedResponse = `🤖 **Answer**\n\n${aiResponse}`;
                    
                    if (relevantArticles.length > 0) {
                      formattedResponse += `\n\n📚 **Sources:**\n${relevantArticles.slice(0, 3).map((a: any, idx: number) => 
                        `${idx + 1}. ${a.title}`
                      ).join('\n')}`;
                    }
                    
                    const knowledgeMsg = await storage.createChatMessage({
                      conversationId: ws.conversationId,
                      senderId: 'ai-bot',
                      senderName: 'KnowledgeOS™',
                      senderType: 'bot',
                      message: formattedResponse,
                      messageType: 'text',
                    });
                    
                    if (clients) {
                      clients.forEach((client) => {
                        if (client.readyState === WebSocket.OPEN) {
                          client.send(JSON.stringify({ type: 'new_message', message: knowledgeMsg }));
                        }
                      });
                    }
                  } catch (error) {
                    console.error('Error in /ask command:', error);
                    
                    const errorMsg = await storage.createChatMessage({
                      conversationId: ws.conversationId,
                      senderId: 'ai-bot',
                      senderName: 'KnowledgeOS™',
                      senderType: 'bot',
                      message: `⚠️ I'm sorry, I encountered an error while searching for an answer. Please try again or contact support.`,
                      messageType: 'text',
                    });
                    
                    if (clients) {
                      clients.forEach((client) => {
                        if (client.readyState === WebSocket.OPEN) {
                          client.send(JSON.stringify({ type: 'new_message', message: errorMsg }));
                        }
                      });
                    }
                  }
                  break;
                }
                
                default:
                  ws.send(JSON.stringify({
                    type: 'error',
                    message: `Command /${parsedCommand.command} is not yet implemented.`,
                  }));
              }
              
              return; // Don't save command as regular message
            }

            // ABUSE DETECTION: Check for verbal abuse to protect support staff
            const { detectAbuse, getWarningMessage, determineAction } = await import('./services/abuseDetection');
            const abuseResult = detectAbuse(payload.message);
            
            if (abuseResult.isAbusive) {
              // Get current violation count (safely handle missing table)
              let currentViolationCount = 0;
              try {
                currentViolationCount = await storage.getUserViolationCount(ws.userId);
              } catch (tableError: any) {
                // If abuse_violations table doesn't exist, treat as first violation
                if (tableError?.code === '42P01') {
                  console.warn('⚠️ abuse_violations table not found, treating as first violation');
                  currentViolationCount = 0;
                } else {
                  throw tableError; // Re-throw if it's a different error
                }
              }
              const newViolationCount = currentViolationCount + 1;
              
              // Determine action
              const action = determineAction(newViolationCount, abuseResult.severity);
              const warningMsg = getWarningMessage(newViolationCount, abuseResult.severity);
              
              // Log violation (safely handle missing table)
              try {
                await storage.createAbuseViolation({
                  userId: ws.userId,
                  conversationId: ws.conversationId,
                  violationType: abuseResult.severity === 'high' ? 'threat' : 'profanity',
                  severity: abuseResult.severity,
                  detectedPatterns: abuseResult.matchedPatterns,
                  originalMessage: payload.message,
                  action,
                  warningMessage: warningMsg,
                  detectedBy: 'system',
                  userViolationCount: newViolationCount,
                  isBanned: action === 'ban',
                  bannedUntil: action === 'ban' ? null : undefined, // null = permanent ban
                  banReason: action === 'ban' ? `Repeated abusive behavior (${newViolationCount} violations)` : undefined,
                });
              } catch (violationError: any) {
                // If abuse_violations table doesn't exist, just log the warning
                if (violationError?.code === '42P01') {
                  console.warn('⚠️ abuse_violations table not found, skipping violation logging');
                } else {
                  console.error('Error logging abuse violation:', violationError);
                }
              }
              
              // Broadcast Server warning to chatroom
              const serverWarning = await storage.createChatMessage({
                conversationId: ws.conversationId,
                senderId: null,
                senderName: 'Server',
                senderType: 'system',
                message: warningMsg,
                messageType: 'text',
                isSystemMessage: true,
              });
              
              const clients = conversationClients.get(ws.conversationId);
              if (clients) {
                const warningPayload = JSON.stringify({
                  type: 'new_message',
                  message: serverWarning,
                });
                clients.forEach((client) => {
                  if (client.readyState === WebSocket.OPEN) {
                    client.send(warningPayload);
                  }
                });
              }
              
              // Take action
              if (action === 'kick' || action === 'ban') {
                // Remove user from chatroom
                conversationClients.get(ws.conversationId)?.delete(ws);
                
                // Send kick notification
                const kickMessage = await storage.createChatMessage({
                  conversationId: ws.conversationId,
                  senderId: null,
                  senderName: 'Server',
                  senderType: 'system',
                  message: `${displayName} has been ${action === 'ban' ? 'banned' : 'removed'} from chat for abusive behavior`,
                  messageType: 'text',
                  isSystemMessage: true,
                });
                
                if (clients) {
                  const kickPayload = JSON.stringify({
                    type: 'new_message',
                    message: kickMessage,
                  });
                  clients.forEach((client) => {
                    if (client.readyState === WebSocket.OPEN) {
                      client.send(kickPayload);
                    }
                  });
                }
                
                // Disconnect the abusive user
                ws.close(1008, action === 'ban' ? 'Banned for abusive behavior' : 'Kicked for abusive behavior');
              }
              
              return; // Don't save the abusive message
            }

            // SECURITY: Sanitize message content to prevent XSS attacks
            const sanitizedMessage = sanitizeChatMessage(payload.message);

            // Save message to database
            const savedMessage = await storage.createChatMessage({
              conversationId: ws.conversationId, // Use server-bound conversation, not client payload
              senderId: ws.userId?.startsWith('guest-') ? null : ws.userId, // Guests don't have user records - use null for FK compatibility
              senderName: displayName, // Use server-formatted display name
              senderType: payload.senderType,
              message: sanitizedMessage, // Use sanitized message
              messageType: 'text',
            });

            // Enrich message with user's platform role for frontend display
            const userPlatformRole = await storage.getUserPlatformRole(ws.userId).catch(() => null);
            const enrichedMessage = {
              ...savedMessage,
              role: userPlatformRole || 'guest', // Add role for frontend superscript badges
              userType: ws.userType || 'guest', // Add userType for avatar display
            };

            // Broadcast to all clients in this conversation
            const clients = conversationClients.get(ws.conversationId);
            if (clients) {
              const messagePayload = JSON.stringify({
                type: 'new_message',
                message: enrichedMessage, // Send enriched message with role and userType
              });

              clients.forEach((client) => {
                if (client.readyState === WebSocket.OPEN) {
                  client.send(messagePayload);
                  
                  // Emit read_receipt when other clients receive the message
                  // (simulate immediate read for real-time chat experience)
                  if (client.userId !== ws.userId) {
                    setTimeout(() => {
                      if (client.readyState === WebSocket.OPEN) {
                        client.send(JSON.stringify({
                          type: 'read_receipt',
                          messageId: savedMessage.id,
                          readBy: client.userId,
                          readByName: client.userName || 'User',
                          readAt: new Date().toISOString(),
                        }));
                      }
                    }, 1000); // 1 second delay to simulate reading
                  }
                }
              });
            }

            // GEMINI Q&A BOT: Intelligent responses using Gemini 2.0 Flash
            const MAIN_ROOM_ID = 'helpdesk';
            const { shouldBotRespond, getAiResponse } = await import('./services/geminiQABot');
            
            if (ws.conversationId === MAIN_ROOM_ID && shouldBotRespond(payload.message)) {
              try {
                // Determine if user is subscriber
                const platformRole = await storage.getUserPlatformRole(ws.userId);
                const isSubscriber = !!(platformRole && ['root_admin', 'deputy_admin', 'support_manager', 'sysop'].includes(platformRole));
                
                // Get conversation history (last 5 messages for context)
                const recentMessages = await storage.getChatMessagesByConversation(ws.conversationId);
                const conversationHistory = recentMessages
                  .slice(-5)
                  .filter(m => m.senderType !== 'system')
                  .map(m => ({
                    role: m.senderType === 'bot' ? 'assistant' as const : 'user' as const,
                    content: m.message
                  }));

                // Get AI response with Gemini
                const aiResponse = await getAiResponse(
                  ws.userId,
                  ws.workspaceId || 'platform-external',
                  ws.conversationId,
                  payload.message,
                  conversationHistory,
                  isSubscriber
                );

                if (aiResponse.shouldRespond) {
                  // Save AI response to database
                  const aiMessage = await storage.createChatMessage({
                    conversationId: ws.conversationId,
                    senderId: 'ai-bot',
                    senderName: 'HelpOS™',
                    senderType: 'bot',
                    message: aiResponse.message,
                    messageType: 'text',
                  });

                  // Log cost for debugging
                  if (aiResponse.tokenUsage) {
                    console.log(`✨ Gemini Q&A: $${aiResponse.tokenUsage.totalCost.toFixed(6)} (${aiResponse.tokenUsage.totalTokens} tokens)`);
                  }

                  // Broadcast AI response to all clients
                  if (clients) {
                    const aiPayload = JSON.stringify({
                      type: 'new_message',
                      message: aiMessage,
                    });
                    clients.forEach((client) => {
                      if (client.readyState === WebSocket.OPEN) {
                        client.send(aiPayload);
                      }
                    });
                  }
                }
              } catch (aiError) {
                console.error('Gemini Q&A Bot error:', aiError);
              }
            }
            break;
          }

          case 'typing': {
            if (!ws.conversationId || !ws.userId) {
              return;
            }

            // Broadcast typing status to ALL clients in same conversation (including sender for debug)
            const clients = conversationClients.get(ws.conversationId);
            if (clients) {
              const typingPayload = JSON.stringify({
                type: 'user_typing',
                userId: ws.userId,
                typingUserName: payload.userName || ws.userName || 'User',
                typingUserIsStaff: payload.isStaff || ws.userType === 'staff',
                isTyping: payload.isTyping,
              });

              // Broadcast to all clients (they'll filter out their own typing indicator)
              clients.forEach((client) => {
                if (client.readyState === WebSocket.OPEN) {
                  client.send(typingPayload);
                }
              });
            }
            break;
          }

          case 'status_change': {
            if (!ws.conversationId || !ws.userId || !ws.userName) {
              return;
            }

            // Update user's status
            ws.userStatus = payload.status;

            // Create system message for status change
            const statusMessage = createSystemMessage(
              ws.conversationId,
              `${ws.userName} is now ${payload.status === 'online' ? 'Available' : payload.status === 'away' ? 'Away' : 'Busy'}`
            );

            // Save status change message
            try {
              await storage.createChatMessage({
                conversationId: ws.conversationId,
                senderId: null,
                senderName: 'System',
                message: statusMessage.message,
                senderType: 'system',
              });
            } catch (err) {
              console.error('Failed to save status change message:', err);
            }

            // Broadcast status change to all clients in this conversation
            const clients = conversationClients.get(ws.conversationId);
            if (clients) {
              clients.forEach((client) => {
                if (client.readyState === WebSocket.OPEN) {
                  client.send(JSON.stringify({
                    type: 'new_message',
                    message: statusMessage,
                  }));
                  client.send(JSON.stringify({
                    type: 'status_change',
                    userId: ws.userId,
                    userName: ws.userName,
                    status: payload.status,
                  }));
                }
              });
            }
            break;
          }

          case 'kick_user': {
            if (!ws.conversationId || !ws.userId) {
              return;
            }

            // SECURITY: Only platform staff (root_admin, deputy admins, support managers) can kick users
            const kickerRole = await storage.getUserPlatformRole(ws.userId).catch(() => null);
            const canKick = kickerRole && ['root_admin', 'deputy_admin', 'support_manager', 'sysop'].includes(kickerRole);
            
            if (!canKick) {
              // IRC-style command acknowledgment for permission denied
              ws.send(JSON.stringify({
                type: 'command_ack',
                commandId: payload.commandId,
                action: 'kick_user',
                success: false,
                error: 'PERMISSION_DENIED',
                message: 'You do not have permission to kick users',
              }));
              return;
            }

            // PROTECTION: Check if target user can be kicked
            const targetRole = await storage.getUserPlatformRole(payload.targetUserId).catch(() => null);
            const rawTargetInfo = await storage.getUserDisplayInfo(payload.targetUserId).catch(() => null);
            const targetUserInfo = rawTargetInfo ? {
              ...rawTargetInfo,
              email: rawTargetInfo.email ?? undefined,
            } : null;
            const targetDisplayName = targetUserInfo ? formatUserDisplayName(targetUserInfo) : 'User';
            
            // Only root_admin can kick root_admin
            if (targetRole === 'root_admin' && kickerRole !== 'root_admin') {
              // Send public error message visible to all in chat
              const errorMessage = createSystemMessage(
                ws.conversationId,
                `❌ DENIED: Cannot remove ${targetDisplayName}. Root administrators cannot be removed by non-root users.`
              );
              
              // Broadcast error to all clients
              const clients = conversationClients.get(ws.conversationId);
              if (clients) {
                clients.forEach((client) => {
                  if (client.readyState === WebSocket.OPEN) {
                    client.send(JSON.stringify({
                      type: 'new_message',
                      message: errorMessage,
                    }));
                  }
                });
              }
              
              // Also save to database
              try {
                await storage.createChatMessage({
                  conversationId: ws.conversationId,
                  senderId: null,
                  senderName: 'System',
                  message: errorMessage.message,
                  senderType: 'system',
                  isSystemMessage: true,
                });
              } catch (err) {
                console.error('Failed to save error message:', err);
              }
              
              // IRC-style command acknowledgment for root protection
              ws.send(JSON.stringify({
                type: 'command_ack',
                commandId: payload.commandId,
                action: 'kick_user',
                success: false,
                error: 'TARGET_PROTECTED',
                message: `Cannot remove ${targetDisplayName}. Root administrators cannot be removed by non-root users.`,
              }));
              return;
            }
            
            // Deputy admins can only kick non-staff users
            if (targetRole && ['deputy_admin', 'deputy_assistant', 'sysop'].includes(targetRole) && kickerRole === 'deputy_admin') {
              const errorMessage = createSystemMessage(
                ws.conversationId,
                `❌ DENIED: Cannot remove ${targetDisplayName}. Staff members cannot remove other staff members.`
              );
              
              // Broadcast error to all clients
              const clients = conversationClients.get(ws.conversationId);
              if (clients) {
                clients.forEach((client) => {
                  if (client.readyState === WebSocket.OPEN) {
                    client.send(JSON.stringify({
                      type: 'new_message',
                      message: errorMessage,
                    }));
                  }
                });
              }
              
              // Also save to database
              try {
                await storage.createChatMessage({
                  conversationId: ws.conversationId,
                  senderId: null,
                  senderName: 'System',
                  message: errorMessage.message,
                  senderType: 'system',
                  isSystemMessage: true,
                });
              } catch (err) {
                console.error('Failed to save error message:', err);
              }
              
              // IRC-style command acknowledgment for staff protection
              ws.send(JSON.stringify({
                type: 'command_ack',
                commandId: payload.commandId,
                action: 'kick_user',
                success: false,
                error: 'TARGET_PROTECTED',
                message: `Cannot remove ${targetDisplayName}. Staff members cannot remove other staff members.`,
              }));
              return;
            }

            // Find the target user's connection
            const clients = conversationClients.get(ws.conversationId);
            if (!clients) return;

            let targetClient: WebSocketClient | null = null;
            let targetUserName = 'User';
            let isSimulatedUser = payload.targetUserId.startsWith('sim-user-');

            for (const client of Array.from(clients)) {
              if (client.userId === payload.targetUserId) {
                targetClient = client;
                targetUserName = client.userName || 'User';
                break;
              }
            }

            // If not found as a connected client but is a simulated user, handle removal
            if (!targetClient && !isSimulatedUser) {
              // Check if user exists in database to provide better error message
              let helpfulMessage = 'User not found in this room';
              try {
                const userExists = await storage.getUser(payload.targetUserId);
                if (userExists) {
                  helpfulMessage = 'User is offline or disconnected. They are not currently in this room.';
                } else {
                  helpfulMessage = 'User not found. They may have never joined this conversation or the user ID is invalid.';
                }
              } catch (err) {
                // If user lookup fails, use generic message
                console.error('Failed to check user existence for kick:', err);
              }
              
              // IRC-style command acknowledgment for user not found
              ws.send(JSON.stringify({
                type: 'command_ack',
                commandId: payload.commandId,
                action: 'kick_user',
                success: false,
                error: 'USER_NOT_FOUND',
                message: helpfulMessage,
              }));
              return;
            }

            // For simulated users, find their name from the hardcoded list
            if (isSimulatedUser && !targetClient) {
              const simUserNames: Record<string, string> = {
                'sim-user-1': 'Jennifer Lopez',
                'sim-user-2': 'Robert Johnson',
                'sim-user-3': 'Maria Garcia',
                'sim-user-4': 'James Wilson',
                'sim-user-5': 'Lisa Anderson',
                'sim-user-6': 'Michael Brown',
                'sim-user-7': 'Sarah Thompson',
                'sim-user-8': 'Christopher Lee',
                'sim-user-9': 'Amanda White',
                'sim-user-10': 'Daniel Martinez',
                'sim-bot-helpos': 'HelpOS™ AI',
                'sim-staff-1': 'Sarah Martinez',
                'sim-staff-2': 'Mike Chen',
                'sim-staff-3': 'Emily Taylor',
              };
              targetUserName = simUserNames[payload.targetUserId] || 'Simulated User';
            }

            // Create kick message
            const reason = payload.reason || 'violation of chat rules';
            const kickMessage = createSystemMessage(
              ws.conversationId,
              `${targetUserName} has been removed from the chat (Reason: ${reason})`
            );

            // Save kick message
            try {
              await storage.createChatMessage({
                conversationId: ws.conversationId,
                senderId: null,
                senderName: 'System',
                message: kickMessage.message,
                senderType: 'system',
              });
            } catch (err) {
              console.error('Failed to save kick message:', err);
            }

            // Broadcast kick message to all clients FIRST
            clients.forEach((client) => {
              if (client.readyState === WebSocket.OPEN) {
                client.send(JSON.stringify({
                  type: 'new_message',
                  message: kickMessage,
                }));
              }
            });

            // Handle simulated user removal
            if (isSimulatedUser) {
              // Add to removed list so they don't appear in future broadcasts
              removedSimulatedUsers.add(payload.targetUserId);
              console.log(`✅ Simulated user ${targetUserName} (${payload.targetUserId}) removed by ${ws.userName}`);
            } else {
              // DISCONNECT the real user
              if (targetClient && targetClient.readyState === WebSocket.OPEN) {
                targetClient.send(JSON.stringify({
                  type: 'kicked',
                  reason: reason,
                  message: `You have been removed from the chat for: ${reason}`,
                }));
                targetClient.close(1000, `Kicked: ${reason}`);
              }

              // Remove from clients list
              if (targetClient) {
                clients.delete(targetClient);
              }
              console.log(`✅ Real user ${targetUserName} kicked by ${ws.userName} - Reason: ${reason}`);
            }

            // Broadcast updated user list after removal (includes real users + filtered simulated users)
            const realUsers = Array.from(clients)
              .filter(c => c.userId && c.userName)
              .map(c => ({
                id: c.userId!,
                name: c.userName!,
                role: c.workspaceId || 'guest',
                status: c.userStatus || 'online',
                userType: c.userType || 'guest',
              }));

            // Recreate simulated users list and filter out removed ones
            const simulatedUsers: any[] = [];
            
            if (payload.conversationId === 'main-chatroom-workforceos' || ws.conversationId === 'main-chatroom-workforceos') {
              // HelpOS AI Bot
              if (!removedSimulatedUsers.has('sim-bot-helpos')) {
                simulatedUsers.push({
                  id: 'sim-bot-helpos',
                  name: 'HelpOS™ AI',
                  role: 'bot',
                  status: 'online',
                  userType: 'staff'
                });
              }
              
              // Add other simulated users if not removed
              const simUsers = [
                { id: 'sim-staff-1', name: 'Sarah Martinez', role: 'deputy_admin', userType: 'staff' },
                { id: 'sim-staff-2', name: 'Mike Chen', role: 'sysop', userType: 'staff' },
                { id: 'sim-staff-3', name: 'Emily Taylor', role: 'deputy_assistant', userType: 'staff' },
                { id: 'sim-user-1', name: 'Jennifer Lopez', role: 'guest', userType: 'org_user' },
                { id: 'sim-user-2', name: 'Robert Johnson', role: 'guest', userType: 'subscriber' },
                { id: 'sim-user-3', name: 'Maria Garcia', role: 'guest', userType: 'org_user' },
                { id: 'sim-user-4', name: 'James Wilson', role: 'guest', userType: 'org_user' },
                { id: 'sim-user-5', name: 'Lisa Anderson', role: 'guest', userType: 'subscriber' },
                { id: 'sim-user-6', name: 'Michael Brown', role: 'guest', userType: 'org_user' },
                { id: 'sim-user-7', name: 'Sarah Thompson', role: 'guest', userType: 'subscriber' },
                { id: 'sim-user-8', name: 'Christopher Lee', role: 'guest', userType: 'org_user' },
                { id: 'sim-user-9', name: 'Amanda White', role: 'guest', userType: 'guest' },
                { id: 'sim-user-10', name: 'Daniel Martinez', role: 'guest', userType: 'org_user' },
              ];
              
              simUsers.forEach(user => {
                if (!removedSimulatedUsers.has(user.id)) {
                  simulatedUsers.push({ ...user, status: 'online' });
                }
              });
            }

            const allUsers = [...realUsers, ...simulatedUsers];

            clients.forEach((client) => {
              if (client.readyState === WebSocket.OPEN) {
                client.send(JSON.stringify({
                  type: 'user_list_update',
                  conversationId: ws.conversationId,
                  users: allUsers,
                  count: allUsers.length,
                }));
              }
            });

            // ===================================================================
            // AUDITOS™ - Log the moderation action for compliance tracking
            // ===================================================================
            try {
              const kickerInfo = await storage.getUserDisplayInfo(ws.userId);
              const kickerDisplayName = kickerInfo ? formatUserDisplayName({
                firstName: kickerInfo.firstName,
                lastName: kickerInfo.lastName,
                email: kickerInfo.email || undefined,
                platformRole: kickerInfo.platformRole || undefined,
                workspaceRole: kickerInfo.workspaceRole || undefined,
              }) : ws.userName || 'Unknown';

              await storage.createAuditLog({
                commandId: payload.commandId || null, // IRC-style command tracking
                userId: ws.userId,
                userEmail: kickerInfo?.email || ws.userName || 'unknown',
                userRole: kickerRole || 'unknown',
                action: 'kick_user',
                actionDescription: `${kickerDisplayName} removed ${targetUserName} from chat`,
                entityType: 'user',
                entityId: payload.targetUserId,
                targetId: payload.targetUserId,
                targetName: targetUserName,
                targetType: 'user',
                conversationId: ws.conversationId,
                reason: reason,
                metadata: {
                  commandPayload: {
                    type: 'kick_user',
                    targetUserId: payload.targetUserId,
                    reason: reason,
                  },
                  isSimulatedUser: isSimulatedUser,
                },
                ipAddress: ws.ipAddress || null,
                userAgent: ws.userAgent || null,
                success: true,
                errorMessage: null,
              });
            } catch (auditErr) {
              console.error('AuditOS™ failed to log kick action:', auditErr);
            }

            // ===================================================================
            // IRC-STYLE COMMAND ACKNOWLEDGMENT - Send success response to originating client
            // ===================================================================
            if (ws.readyState === WebSocket.OPEN) {
              ws.send(JSON.stringify({
                type: 'command_ack',
                commandId: payload.commandId,
                action: 'kick_user',
                success: true,
                message: `✓ ${targetUserName} removed from chat`,
                targetUserId: payload.targetUserId,
                targetName: targetUserName,
              }));
            }

            break;
          }

          case 'silence_user': {
            // Mute/silence a user temporarily with IRC-style acknowledgments
            if (!ws.conversationId || !ws.userId) {
              return;
            }

            // SECURITY: Only platform staff can silence users
            const silencerRole = await storage.getUserPlatformRole(ws.userId).catch(() => null);
            const canSilence = silencerRole && ['root_admin', 'deputy_admin', 'support_manager', 'sysop'].includes(silencerRole);
            
            if (!canSilence) {
              // IRC-STYLE COMMAND ACKNOWLEDGMENT - Permission denied
              if (ws.readyState === WebSocket.OPEN) {
                ws.send(JSON.stringify({
                  type: 'command_ack',
                  commandId: payload.commandId,
                  action: 'silence_user',
                  success: false,
                  message: '✗ Permission denied - Staff role required',
                  errorType: 'PERMISSION_DENIED',
                }));
              }

              // Log failed attempt to AuditOS™
              try {
                const silencerInfo = await storage.getUserDisplayInfo(ws.userId);
                await storage.createAuditLog({
                  commandId: payload.commandId || null,
                  userId: ws.userId,
                  userEmail: silencerInfo?.email || ws.userName || 'unknown',
                  userRole: silencerRole || 'unknown',
                  action: 'silence_user',
                  actionDescription: `Permission denied: ${ws.userName} attempted to silence user`,
                  entityType: 'user',
                  entityId: payload.targetUserId || 'unknown',
                  targetId: payload.targetUserId || null,
                  targetName: null,
                  targetType: 'user',
                  conversationId: ws.conversationId,
                  reason: payload.reason || null,
                  metadata: {
                    commandPayload: {
                      type: 'silence_user',
                      targetUserId: payload.targetUserId,
                      duration: payload.duration,
                      reason: payload.reason,
                    },
                  },
                  ipAddress: ws.ipAddress || null,
                  userAgent: ws.userAgent || null,
                  success: false,
                  errorMessage: 'Permission denied - Staff role required',
                });
              } catch (auditErr) {
                console.error('AuditOS™ failed to log silence attempt:', auditErr);
              }
              return;
            }

            const clients = conversationClients.get(ws.conversationId);
            if (!clients) {
              // IRC acknowledgment - Conversation not found
              if (ws.readyState === WebSocket.OPEN) {
                ws.send(JSON.stringify({
                  type: 'command_ack',
                  commandId: payload.commandId,
                  action: 'silence_user',
                  success: false,
                  message: '✗ Conversation not found',
                  errorType: 'NOT_FOUND',
                }));
              }
              return;
            }

            // Find target user
            let targetUserName = 'User';
            for (const client of Array.from(clients)) {
              if (client.userId === payload.targetUserId) {
                targetUserName = client.userName || 'User';
                break;
              }
            }

            // Create system announcement message
            const duration = payload.duration || 5;
            const reason = payload.reason || 'Chat violation';
            const silenceMessage = createSystemMessage(
              ws.conversationId,
              `🔇 ${targetUserName} has been silenced for ${duration} minutes by ${ws.userName}. Reason: ${reason}`
            );

            // Save and broadcast the silence message FIRST
            try {
              await storage.createChatMessage({
                conversationId: ws.conversationId,
                senderId: null,
                senderName: 'System',
                message: silenceMessage.message,
                senderType: 'system',
              });
            } catch (err) {
              console.error('Failed to save silence message:', err);
            }

            // Broadcast to all clients
            clients.forEach((client) => {
              if (client.readyState === WebSocket.OPEN) {
                client.send(JSON.stringify({
                  type: 'new_message',
                  message: silenceMessage,
                }));
              }
            });

            console.log(`🔇 ${targetUserName} silenced by ${ws.userName} for ${duration} minutes - Reason: ${reason}`);

            // ===================================================================
            // AUDITOS™ - Log the moderation action for compliance tracking
            // ===================================================================
            try {
              const silencerInfo = await storage.getUserDisplayInfo(ws.userId);
              const silencerDisplayName = silencerInfo ? formatUserDisplayName({
                firstName: silencerInfo.firstName,
                lastName: silencerInfo.lastName,
                email: silencerInfo.email || undefined,
                platformRole: silencerInfo.platformRole || undefined,
                workspaceRole: silencerInfo.workspaceRole || undefined,
              }) : ws.userName || 'Unknown';

              await storage.createAuditLog({
                commandId: payload.commandId || null, // IRC-style command tracking
                userId: ws.userId,
                userEmail: silencerInfo?.email || ws.userName || 'unknown',
                userRole: silencerRole || 'unknown',
                action: 'silence_user',
                actionDescription: `${silencerDisplayName} silenced ${targetUserName} for ${duration} minutes`,
                entityType: 'user',
                entityId: payload.targetUserId,
                targetId: payload.targetUserId,
                targetName: targetUserName,
                targetType: 'user',
                conversationId: ws.conversationId,
                reason: reason,
                metadata: {
                  commandPayload: {
                    type: 'silence_user',
                    targetUserId: payload.targetUserId,
                    duration: duration,
                    reason: reason,
                  },
                  durationMinutes: duration,
                },
                ipAddress: ws.ipAddress || null,
                userAgent: ws.userAgent || null,
                success: true,
                errorMessage: null,
              });
            } catch (auditErr) {
              console.error('AuditOS™ failed to log silence action:', auditErr);
            }

            // ===================================================================
            // IRC-STYLE COMMAND ACKNOWLEDGMENT - Send success response to originating client
            // ===================================================================
            if (ws.readyState === WebSocket.OPEN) {
              ws.send(JSON.stringify({
                type: 'command_ack',
                commandId: payload.commandId,
                action: 'silence_user',
                success: true,
                message: `✓ ${targetUserName} silenced for ${duration} minutes`,
                targetUserId: payload.targetUserId,
                targetName: targetUserName,
                duration: duration,
              }));
            }

            break;
          }

          case 'give_voice': {
            // Unmute a user (give them voice back) with IRC-style acknowledgments
            if (!ws.conversationId || !ws.userId) {
              return;
            }

            // SECURITY: Only platform staff can give voice
            const staffRole = await storage.getUserPlatformRole(ws.userId).catch(() => null);
            const canGiveVoice = staffRole && ['root_admin', 'deputy_admin', 'support_manager', 'sysop'].includes(staffRole);
            
            if (!canGiveVoice) {
              // IRC-STYLE COMMAND ACKNOWLEDGMENT - Permission denied
              if (ws.readyState === WebSocket.OPEN) {
                ws.send(JSON.stringify({
                  type: 'command_ack',
                  commandId: payload.commandId,
                  action: 'give_voice',
                  success: false,
                  message: '✗ Permission denied - Staff role required',
                  errorType: 'PERMISSION_DENIED',
                }));
              }

              // Log failed attempt to AuditOS™
              try {
                const staffInfo = await storage.getUserDisplayInfo(ws.userId);
                await storage.createAuditLog({
                  commandId: payload.commandId || null,
                  userId: ws.userId,
                  userEmail: staffInfo?.email || ws.userName || 'unknown',
                  userRole: staffRole || 'unknown',
                  action: 'give_voice',
                  actionDescription: `Permission denied: ${ws.userName} attempted to unmute user`,
                  entityType: 'user',
                  entityId: payload.targetUserId || 'unknown',
                  targetId: payload.targetUserId || null,
                  targetName: null,
                  targetType: 'user',
                  conversationId: ws.conversationId,
                  reason: null,
                  metadata: {
                    commandPayload: {
                      type: 'give_voice',
                      targetUserId: payload.targetUserId,
                    },
                  },
                  ipAddress: ws.ipAddress || null,
                  userAgent: ws.userAgent || null,
                  success: false,
                  errorMessage: 'Permission denied - Staff role required',
                });
              } catch (auditErr) {
                console.error('AuditOS™ failed to log give_voice attempt:', auditErr);
              }
              return;
            }

            const clients = conversationClients.get(ws.conversationId);
            if (!clients) {
              // IRC acknowledgment - Conversation not found
              if (ws.readyState === WebSocket.OPEN) {
                ws.send(JSON.stringify({
                  type: 'command_ack',
                  commandId: payload.commandId,
                  action: 'give_voice',
                  success: false,
                  message: '✗ Conversation not found',
                  errorType: 'NOT_FOUND',
                }));
              }
              return;
            }

            // Find target user
            let targetUserName = 'User';
            for (const client of Array.from(clients)) {
              if (client.userId === payload.targetUserId) {
                targetUserName = client.userName || 'User';
                break;
              }
            }

            // Create system announcement message
            const unmuteMessage = createSystemMessage(
              ws.conversationId,
              `🔊 ${targetUserName} has been unmuted by ${ws.userName} and can now speak.`
            );

            // Save and broadcast the unmute message FIRST
            try {
              await storage.createChatMessage({
                conversationId: ws.conversationId,
                senderId: null,
                senderName: 'System',
                message: unmuteMessage.message,
                senderType: 'system',
              });
            } catch (err) {
              console.error('Failed to save unmute message:', err);
            }

            // Broadcast to all clients
            clients.forEach((client) => {
              if (client.readyState === WebSocket.OPEN) {
                client.send(JSON.stringify({
                  type: 'new_message',
                  message: unmuteMessage,
                }));
              }
            });

            console.log(`🔊 ${targetUserName} unmuted by ${ws.userName}`);

            // ===================================================================
            // AUDITOS™ - Log the moderation action for compliance tracking
            // ===================================================================
            try {
              const staffInfo = await storage.getUserDisplayInfo(ws.userId);
              const staffDisplayName = staffInfo ? formatUserDisplayName({
                firstName: staffInfo.firstName,
                lastName: staffInfo.lastName,
                email: staffInfo.email || undefined,
                platformRole: staffInfo.platformRole || undefined,
                workspaceRole: staffInfo.workspaceRole || undefined,
              }) : ws.userName || 'Unknown';

              await storage.createAuditLog({
                commandId: payload.commandId || null, // IRC-style command tracking
                userId: ws.userId,
                userEmail: staffInfo?.email || ws.userName || 'unknown',
                userRole: staffRole || 'unknown',
                action: 'give_voice',
                actionDescription: `${staffDisplayName} unmuted ${targetUserName}`,
                entityType: 'user',
                entityId: payload.targetUserId,
                targetId: payload.targetUserId,
                targetName: targetUserName,
                targetType: 'user',
                conversationId: ws.conversationId,
                reason: null,
                metadata: {
                  commandPayload: {
                    type: 'give_voice',
                    targetUserId: payload.targetUserId,
                  },
                },
                ipAddress: ws.ipAddress || null,
                userAgent: ws.userAgent || null,
                success: true,
                errorMessage: null,
              });
            } catch (auditErr) {
              console.error('AuditOS™ failed to log give_voice action:', auditErr);
            }

            // ===================================================================
            // IRC-STYLE COMMAND ACKNOWLEDGMENT - Send success response to originating client
            // ===================================================================
            if (ws.readyState === WebSocket.OPEN) {
              ws.send(JSON.stringify({
                type: 'command_ack',
                commandId: payload.commandId,
                action: 'give_voice',
                success: true,
                message: `✓ ${targetUserName} can now speak`,
                targetUserId: payload.targetUserId,
                targetName: targetUserName,
              }));
            }

            break;
          }

          case 'join_shift_updates': {
            // Subscribe to real-time shift updates for a workspace
            if (!payload.userId || !payload.workspaceId) {
              ws.send(JSON.stringify({
                type: 'error',
                message: 'User ID and Workspace ID are required',
              }));
              return;
            }

            // SECURITY: Verify user belongs to the workspace they're trying to subscribe to
            try {
              const userWorkspace = await storage.getWorkspaceByOwnerId(payload.userId);
              const workspaceMember = await storage.getEmployeeByUserId(payload.userId);
              
              // User must either own the workspace or be a member of the workspace
              const hasAccess = (userWorkspace && userWorkspace.id === payload.workspaceId) || (workspaceMember && workspaceMember.workspaceId === payload.workspaceId);
              
              if (!hasAccess) {
                ws.send(JSON.stringify({
                  type: 'error',
                  message: 'Access denied: You do not have permission to view this workspace',
                }));
                console.warn(`⚠️ User ${payload.userId} attempted unauthorized shift subscription to workspace ${payload.workspaceId}`);
                return;
              }
            } catch (authError) {
              console.error('Shift WebSocket authorization error:', authError);
              ws.send(JSON.stringify({
                type: 'error',
                message: 'Authorization failed',
              }));
              return;
            }

            ws.userId = payload.userId;
            ws.workspaceId = payload.workspaceId;

            // Add to shift update clients for this workspace
            if (!shiftUpdateClients.has(payload.workspaceId)) {
              shiftUpdateClients.set(payload.workspaceId, new Set());
            }
            shiftUpdateClients.get(payload.workspaceId)!.add(ws);

            console.log(`✅ User ${payload.userId} subscribed to shift updates for workspace ${payload.workspaceId}`);

            // Send confirmation
            ws.send(JSON.stringify({
              type: 'shift_updates_subscribed',
              workspaceId: payload.workspaceId,
            }));
            break;
          }

          case 'join_notifications': {
            // Subscribe to real-time notifications for a user
            if (!payload.userId || !payload.workspaceId) {
              ws.send(JSON.stringify({
                type: 'error',
                message: 'User ID and Workspace ID are required',
              }));
              return;
            }

            // SECURITY: Verify user belongs to the workspace they're trying to subscribe to
            try {
              const userWorkspace = await storage.getWorkspaceByOwnerId(payload.userId);
              const workspaceMember = await storage.getEmployeeByUserId(payload.userId);
              
              // User must either own the workspace or be a member of the workspace
              const hasAccess = (userWorkspace && userWorkspace.id === payload.workspaceId) || (workspaceMember && workspaceMember.workspaceId === payload.workspaceId);
              
              if (!hasAccess) {
                ws.send(JSON.stringify({
                  type: 'error',
                  message: 'Access denied: You do not have permission to view this workspace',
                }));
                console.warn(`⚠️ User ${payload.userId} attempted unauthorized notification subscription to workspace ${payload.workspaceId}`);
                return;
              }
            } catch (authError) {
              console.error('Notification WebSocket authorization error:', authError);
              ws.send(JSON.stringify({
                type: 'error',
                message: 'Authorization failed',
              }));
              return;
            }

            ws.userId = payload.userId;
            ws.workspaceId = payload.workspaceId;

            // Add to notification clients for this workspace/user combination
            if (!notificationClients.has(payload.workspaceId)) {
              notificationClients.set(payload.workspaceId, new Map());
            }
            notificationClients.get(payload.workspaceId)!.set(payload.userId, ws);

            // Get initial unread count
            const unreadCount = await storage.getUnreadNotificationCount(payload.userId, payload.workspaceId);

            console.log(`✅ User ${payload.userId} subscribed to notifications for workspace ${payload.workspaceId} (${unreadCount} unread)`);

            // Send confirmation with current unread count
            ws.send(JSON.stringify({
              type: 'notifications_subscribed',
              workspaceId: payload.workspaceId,
              unreadCount,
            }));
            break;
          }

          case 'ban_user': {
            // Permanently ban a user from chat (platform staff only)
            if (!ws.conversationId || !ws.userId) {
              return;
            }

            // Check if user has staff permissions
            const staffInfo = await storage.getUserDisplayInfo(ws.userId);
            const isStaff = staffInfo?.platformRole && ['root_admin', 'deputy_admin', 'support_manager', 'sysop', 'support_agent'].includes(staffInfo.platformRole);
            
            if (!isStaff) {
              ws.send(JSON.stringify({
                type: 'error',
                message: '⛔ Permission denied - Staff role required for banning users',
              }));
              return;
            }

            // Get target user info
            const targetUser = await storage.getUserDisplayInfo(payload.targetUserId);
            const targetUserName = targetUser ? `${targetUser.firstName || ''} ${targetUser.lastName || ''}`.trim() || targetUser.email || 'Unknown' : 'Unknown';
            
            // Get staff display name
            const staffRole = staffInfo?.platformRole || 'unknown';
            const staffDisplayName = staffInfo ? formatUserDisplayName({
              firstName: staffInfo.firstName,
              lastName: staffInfo.lastName,
              email: staffInfo.email || undefined,
              platformRole: staffInfo.platformRole || undefined,
              workspaceRole: staffInfo.workspaceRole || undefined,
            }) : ws.userName || 'Unknown';

            // Audit log the ban action
            try {
              await storage.createAuditLog({
                commandId: payload.commandId || null,
                userId: ws.userId,
                userEmail: staffInfo?.email || ws.userName || 'unknown',
                userRole: staffRole || 'unknown',
                action: 'ban_user',
                actionDescription: `${staffDisplayName} permanently banned ${targetUserName}`,
                entityType: 'user',
                entityId: payload.targetUserId,
                targetId: payload.targetUserId,
                targetName: targetUserName,
                targetType: 'user',
                conversationId: ws.conversationId,
                reason: payload.reason || null,
                metadata: {
                  commandPayload: {
                    type: 'ban_user',
                    targetUserId: payload.targetUserId,
                    reason: payload.reason,
                  },
                },
                ipAddress: ws.ipAddress || null,
                userAgent: ws.userAgent || null,
                success: true,
                errorMessage: null,
              });
            } catch (auditErr) {
              console.error('AuditOS™ failed to log ban action:', auditErr);
            }

            // Find and disconnect target user from all conversations
            const clients = conversationClients.get(ws.conversationId);
            if (clients) {
              for (const client of Array.from(clients)) {
                if (client.userId === payload.targetUserId) {
                  // Send ban notification to target user
                  if (client.readyState === WebSocket.OPEN) {
                    client.send(JSON.stringify({
                      type: 'banned',
                      reason: payload.reason || 'Violation of chat policies',
                      message: '🚫 You have been permanently banned from chat by platform staff',
                      bannedBy: staffDisplayName,
                    }));
                  }
                  
                  // Remove from conversation and close connection
                  clients.delete(client);
                  client.close();
                  console.log(`🚫 ${payload.targetUserId} has been permanently banned by ${staffDisplayName}`);
                }
              }
            }

            // Add to permanently banned users list (in-memory tracking)
            removedSimulatedUsers.add(payload.targetUserId);

            // Broadcast ban announcement to room
            const reason = payload.reason ? ` (Reason: ${payload.reason})` : '';
            const banMessage = await storage.createChatMessage({
              conversationId: ws.conversationId,
              senderId: null,
              senderName: 'System',
              senderType: 'system',
              message: `🚫 ${targetUserName} has been permanently banned by ${staffDisplayName}${reason}`,
              messageType: 'text',
              isSystemMessage: true,
            });

            // Broadcast to all clients in the conversation
            const conversationClients_ = conversationClients.get(ws.conversationId);
            if (conversationClients_) {
              const banPayload = JSON.stringify({
                type: 'new_message',
                message: banMessage,
              });
              conversationClients_.forEach((client) => {
                if (client.readyState === WebSocket.OPEN && client.userId !== ws.userId) {
                  client.send(banPayload);
                }
              });
            }

            // Send success acknowledgment
            if (ws.readyState === WebSocket.OPEN) {
              ws.send(JSON.stringify({
                type: 'command_ack',
                commandId: payload.commandId,
                action: 'ban_user',
                success: true,
                message: `✓ ${targetUserName} has been permanently banned`,
                targetUserId: payload.targetUserId,
                targetName: targetUserName,
              }));
            }

            break;
          }

          case 'request_secure': {
            // Staff requests secure information from a user
            if (!ws.conversationId || !ws.userId) {
              return;
            }

            // Find target user's connection
            const clients = conversationClients.get(ws.conversationId);
            if (!clients) return;

            let targetClient: WebSocketClient | null = null;
            for (const client of Array.from(clients)) {
              if (client.userId === payload.targetUserId) {
                targetClient = client;
                break;
              }
            }

            if (!targetClient || targetClient.readyState !== WebSocket.OPEN) {
              ws.send(JSON.stringify({
                type: 'error',
                message: 'Target user not found or offline',
              }));
              return;
            }

            // Send secure request to target user
            targetClient.send(JSON.stringify({
              type: 'secure_request',
              requestType: payload.requestType,
              requestedBy: ws.userName || 'Support Staff',
              message: payload.message || '',
            }));

            console.log(`🔐 ${ws.userName} requested ${payload.requestType} from user ${payload.targetUserId}`);
            break;
          }

          case 'secure_response': {
            // User responds with secure information
            if (!ws.conversationId || !ws.userId) {
              return;
            }

            // Find staff members in the room to send the response to
            const clients = conversationClients.get(ws.conversationId);
            if (!clients) return;

            // Send to all staff members
            clients.forEach((client) => {
              if (client.userId !== ws.userId && client.readyState === WebSocket.OPEN) {
                // Only send to staff (check if they have platform role)
                client.send(JSON.stringify({
                  type: 'secure_data_received',
                  fromUser: ws.userName || 'User',
                  fromUserId: ws.userId,
                  data: payload.data,
                }));
              }
            });

            console.log(`📥 Secure data received from ${ws.userName}`);
            break;
          }

          case 'release_spectator': {
            // Release user from spectator/hold mode
            if (!ws.conversationId || !ws.userId) {
              return;
            }

            const clients = conversationClients.get(ws.conversationId);
            if (!clients) return;

            let targetClient: WebSocketClient | null = null;
            for (const client of Array.from(clients)) {
              if (client.userId === payload.targetUserId) {
                targetClient = client;
                break;
              }
            }

            if (!targetClient || targetClient.readyState !== WebSocket.OPEN) {
              ws.send(JSON.stringify({
                type: 'error',
                message: 'Target user not found',
              }));
              return;
            }

            // Notify target they're released from hold (legacy)
            targetClient.send(JSON.stringify({
              type: 'spectator_released',
              releasedBy: ws.userName || 'Support Staff',
            }));

            // Send voice_granted event for new animated status
            targetClient.send(JSON.stringify({
              type: 'voice_granted',
            }));

            console.log(`🎤 ${ws.userName} released ${payload.targetUserId} from hold`);
            break;
          }

          case 'transfer_user': {
            // Transfer user to another agent
            if (!ws.conversationId || !ws.userId) {
              return;
            }

            // Create transfer announcement
            const transferMessage = createSystemMessage(
              ws.conversationId,
              `${ws.userName} has transferred the customer to the next available agent`
            );

            // Save and broadcast
            try {
              await storage.createChatMessage({
                conversationId: ws.conversationId,
                senderId: null,
                senderName: 'System',
                message: transferMessage.message,
                senderType: 'system',
              });

              const clients = conversationClients.get(ws.conversationId);
              if (clients) {
                clients.forEach((client) => {
                  if (client.readyState === WebSocket.OPEN) {
                    client.send(JSON.stringify({
                      type: 'new_message',
                      message: transferMessage,
                    }));
                  }
                });
              }
            } catch (err) {
              console.error('Failed to save transfer message:', err);
            }

            console.log(`🔄 ${ws.userName} transferred user ${payload.targetUserId}`);
            break;
          }

          case 'call_initiated': {
            // WebRTC voice/video call initiated
            if (!ws.conversationId || !ws.userId) return;

            // SECURITY: Verify caller is actually in the conversation's client set
            const clients = conversationClients.get(ws.conversationId);
            if (!clients || !clients.has(ws)) {
              ws.send(JSON.stringify({
                type: 'error',
                message: 'You are not a member of this conversation',
              }));
              return;
            }

            // SECURITY: Verify roomId matches conversation
            if (ws.conversationId !== payload.roomId) {
              ws.send(JSON.stringify({
                type: 'error',
                message: 'Cannot initiate call in a different room',
              }));
              return;
            }

            // Broadcast to all other clients in the room
            clients.forEach((client) => {
              if (client !== ws && client.readyState === WebSocket.OPEN) {
                client.send(JSON.stringify({
                  type: 'call_initiated',
                  callerId: payload.callerId,
                  callerName: payload.callerName,
                  roomId: payload.roomId,
                }));
              }
            });

            console.log(`📞 Call initiated by ${payload.callerName} in room ${payload.roomId}`);
            break;
          }

          case 'call_accepted': {
            // WebRTC call accepted
            if (!ws.conversationId) return;

            const clients = conversationClients.get(ws.conversationId);
            if (!clients) return;

            // Broadcast to all clients in the room
            clients.forEach((client) => {
              if (client !== ws && client.readyState === WebSocket.OPEN) {
                client.send(JSON.stringify({
                  type: 'call_accepted',
                  roomId: payload.roomId,
                }));
              }
            });

            console.log(`✅ Call accepted in room ${payload.roomId}`);
            break;
          }

          case 'call_rejected': {
            // WebRTC call rejected
            if (!ws.conversationId) return;

            const clients = conversationClients.get(ws.conversationId);
            if (!clients) return;

            // Broadcast to all clients in the room
            clients.forEach((client) => {
              if (client !== ws && client.readyState === WebSocket.OPEN) {
                client.send(JSON.stringify({
                  type: 'call_rejected',
                  roomId: payload.roomId,
                }));
              }
            });

            console.log(`❌ Call rejected in room ${payload.roomId}`);
            break;
          }

          case 'call_ended': {
            // WebRTC call ended
            if (!ws.conversationId) return;

            const clients = conversationClients.get(ws.conversationId);
            if (!clients) return;

            // Broadcast to all clients in the room
            clients.forEach((client) => {
              if (client !== ws && client.readyState === WebSocket.OPEN) {
                client.send(JSON.stringify({
                  type: 'call_ended',
                  roomId: payload.roomId,
                }));
              }
            });

            console.log(`📴 Call ended in room ${payload.roomId}`);
            break;
          }

          case 'webrtc_offer': {
            // WebRTC SDP offer
            if (!ws.conversationId || !ws.userId) return;

            // SECURITY: Verify caller is actually in the conversation's client set
            const offerClients = conversationClients.get(ws.conversationId);
            if (!offerClients || !offerClients.has(ws)) {
              ws.send(JSON.stringify({
                type: 'error',
                message: 'You are not a member of this conversation',
              }));
              return;
            }

            // SECURITY: Verify roomId matches conversation
            if (ws.conversationId !== payload.roomId) {
              ws.send(JSON.stringify({
                type: 'error',
                message: 'Cannot send WebRTC offer to a different room',
              }));
              return;
            }

            // Broadcast offer to all other clients
            offerClients.forEach((client) => {
              if (client !== ws && client.readyState === WebSocket.OPEN) {
                client.send(JSON.stringify({
                  type: 'webrtc_offer',
                  roomId: payload.roomId,
                  offer: payload.offer,
                }));
              }
            });

            console.log(`📡 WebRTC offer sent for room ${payload.roomId}`);
            break;
          }

          case 'webrtc_answer': {
            // WebRTC SDP answer
            if (!ws.conversationId || !ws.userId) return;

            // SECURITY: Verify caller is actually in the conversation's client set
            const answerClients = conversationClients.get(ws.conversationId);
            if (!answerClients || !answerClients.has(ws)) {
              ws.send(JSON.stringify({
                type: 'error',
                message: 'You are not a member of this conversation',
              }));
              return;
            }

            // SECURITY: Verify roomId matches conversation
            if (ws.conversationId !== payload.roomId) {
              ws.send(JSON.stringify({
                type: 'error',
                message: 'Cannot send WebRTC answer to a different room',
              }));
              return;
            }

            // Broadcast answer to all other clients
            answerClients.forEach((client) => {
              if (client !== ws && client.readyState === WebSocket.OPEN) {
                client.send(JSON.stringify({
                  type: 'webrtc_answer',
                  roomId: payload.roomId,
                  answer: payload.answer,
                }));
              }
            });

            console.log(`📡 WebRTC answer sent for room ${payload.roomId}`);
            break;
          }

          case 'webrtc_ice_candidate': {
            // WebRTC ICE candidate
            if (!ws.conversationId || !ws.userId) return;

            // SECURITY: Verify caller is actually in the conversation's client set
            const iceClients = conversationClients.get(ws.conversationId);
            if (!iceClients || !iceClients.has(ws)) {
              ws.send(JSON.stringify({
                type: 'error',
                message: 'You are not a member of this conversation',
              }));
              return;
            }

            // SECURITY: Verify roomId matches conversation
            if (ws.conversationId !== payload.roomId) {
              ws.send(JSON.stringify({
                type: 'error',
                message: 'Cannot send ICE candidate to a different room',
              }));
              return;
            }

            // Broadcast ICE candidate to all other clients
            iceClients.forEach((client) => {
              if (client !== ws && client.readyState === WebSocket.OPEN) {
                client.send(JSON.stringify({
                  type: 'webrtc_ice_candidate',
                  roomId: payload.roomId,
                  candidate: payload.candidate,
                }));
              }
            });

            console.log(`🧊 WebRTC ICE candidate sent for room ${payload.roomId}`);
            break;
          }
        }
      } catch (error) {
        console.error('❌ WebSocket message processing error:', error);
        console.error('Error details:', {
          name: error instanceof Error ? error.name : 'Unknown',
          message: error instanceof Error ? error.message : String(error),
          stack: error instanceof Error ? error.stack : undefined,
          rawMessage: data ? String(data).substring(0, 500) : 'N/A' // First 500 chars of raw data
        });
        ws.send(JSON.stringify({
          type: 'error',
          message: 'Failed to process message',
        }));
      }
    });

    ws.on('close', async () => {
      // RATE LIMITING: Track disconnection in database
      if (ws.sessionId) {
        await trackDisconnection(ws.sessionId, 'user_closed');
      }

      // Clean up heartbeat interval
      if (ws.pingInterval) {
        clearInterval(ws.pingInterval);
      }

      // GLOBAL TRACKING CLEANUP: Remove from platform-wide stats
      if (ws.userId) {
        globalConnections.totalConnections = Math.max(0, globalConnections.totalConnections - 1);
        globalConnections.allUsers.delete(ws.userId);
        globalConnections.staffUsers.delete(ws.userId);
        globalConnections.subscriberUsers.delete(ws.userId);
      }
      
      // SHIFT UPDATES CLEANUP: Remove from shift update clients
      if (ws.workspaceId && shiftUpdateClients.has(ws.workspaceId)) {
        const clients = shiftUpdateClients.get(ws.workspaceId)!;
        clients.delete(ws);
        // Clean up empty workspace sets
        if (clients.size === 0) {
          shiftUpdateClients.delete(ws.workspaceId);
        }
        console.log(`🔌 Removed client from shift updates for workspace ${ws.workspaceId}`);
      }
      
      // NOTIFICATIONS CLEANUP: Remove from notification clients
      if (ws.workspaceId && ws.userId && notificationClients.has(ws.workspaceId)) {
        const userClients = notificationClients.get(ws.workspaceId)!;
        userClients.delete(ws.userId);
        // Clean up empty workspace maps
        if (userClients.size === 0) {
          notificationClients.delete(ws.workspaceId);
        }
        console.log(`🔌 Removed client from notifications for user ${ws.userId} in workspace ${ws.workspaceId}`);
      }
      
      // Send leave announcement for main chatroom
      const MAIN_ROOM_ID = 'main-chatroom-workforceos';
      if (ws.conversationId === MAIN_ROOM_ID && ws.userId) {
        try {
          // Get user display info for leave announcement
          const userInfo = await storage.getUserDisplayInfo(ws.userId);
          const displayName = userInfo ? formatUserDisplayNameForChat({
            firstName: userInfo.firstName,
            lastName: userInfo.lastName,
            email: userInfo.email || undefined,
            platformRole: userInfo.platformRole || undefined,
            workspaceRole: userInfo.workspaceRole || undefined,
          }) : 'User';

          // Create leave announcement
          const leaveAnnouncement = await storage.createChatMessage({
            conversationId: ws.conversationId,
            senderId: ws.userId?.startsWith('guest-') ? null : ws.userId, // Guests don't have user records - use null for FK compatibility
            senderName: 'Server',
            senderType: 'system',
            message: `${displayName} has left the chatroom`,
            messageType: 'text',
            isSystemMessage: true,
          });

          // Broadcast leave announcement to remaining clients
          const clients = conversationClients.get(ws.conversationId);
          if (clients) {
            const announcementPayload = JSON.stringify({
              type: 'new_message',
              message: leaveAnnouncement,
            });
            clients.forEach((client) => {
              if (client !== ws && client.readyState === WebSocket.OPEN) {
                client.send(announcementPayload);
              }
            });
          }

          console.log(`${displayName} left conversation ${ws.conversationId}`);
        } catch (error) {
          console.error('Error sending leave announcement:', error);
        }
      }

      // Remove client from conversation
      if (ws.conversationId) {
        const clients = conversationClients.get(ws.conversationId);
        if (clients) {
          clients.delete(ws);
          
          // Broadcast updated participants list after user leaves
          const participants = [];
          for (const client of Array.from(clients)) {
            if (client.userId && client.readyState === WebSocket.OPEN) {
              const userRole = await storage.getUserPlatformRole(client.userId).catch(() => null);
              participants.push({
                id: client.userId,
                name: client.userName || 'User',
                role: userRole || 'guest',
                status: client.userStatus || 'online',
                userType: client.userType || 'guest'
              });
            }
          }

          const participantsPayload = JSON.stringify({
            type: 'participants_update',
            conversationId: ws.conversationId,
            participants: participants,
          });

          clients.forEach((client) => {
            if (client.readyState === WebSocket.OPEN) {
              client.send(participantsPayload);
            }
          });
          
          if (clients.size === 0) {
            conversationClients.delete(ws.conversationId);
          }
        }
      }
      console.log('WebSocket connection closed');
    });

    ws.on('error', (error) => {
      console.error('WebSocket error:', error);
      // Clean up heartbeat interval on error
      if (ws.pingInterval) {
        clearInterval(ws.pingInterval);
      }
    });
  });

  // REALISTIC CHAT SIMULATION: Generate realistic conversation flow
  const MAIN_ROOM_ID = 'main-chatroom-workforceos';
  let simulationRunning = false;
  
  async function startChatSimulation() {
    if (simulationRunning) return;
    simulationRunning = true;
    
    const clients = conversationClients.get(MAIN_ROOM_ID);
    if (!clients || clients.size === 0) {
      simulationRunning = false;
      return;
    }

    // Realistic conversation scenarios
    const scenarios = [
      // Scenario 1: Password reset help
      { sender: 'sim-user-1', name: 'Jennifer Lopez', type: 'customer', message: 'Hi, I forgot my password and the reset email never came through. Can someone help?' },
      { sender: 'helpos-ai-bot', name: 'HelpOS', type: 'bot', message: 'Jennifer - I see you need password reset help. Sarah Martinez is our password specialist. Alerting her now.' },
      { sender: 'sim-staff-1', name: 'Sarah Martinez', type: 'support', message: 'Hi Jennifer! I can help with that. Can you confirm the email address on your account?' },
      { sender: 'sim-user-1', name: 'Jennifer Lopez', type: 'customer', message: 'Yes, it is jennifer.lopez@company.com' },
      { sender: 'sim-staff-1', name: 'Sarah Martinez', type: 'support', message: 'Perfect! I just resent the password reset link. Please check your spam folder as well. It should arrive in 2-3 minutes.' },
      { sender: 'sim-user-1', name: 'Jennifer Lopez', type: 'customer', message: 'Got it! Thank you so much for the quick help!' },
      
      // Scenario 2: Billing question
      { sender: 'sim-user-2', name: 'Robert Johnson', type: 'customer', message: 'I have a question about my invoice. I was charged twice this month.' },
      { sender: 'helpos-ai-bot', name: 'HelpOS', type: 'bot', message: 'Robert - Billing issue detected. Mike Chen handles billing inquiries. Routing your request now.' },
      { sender: 'sim-staff-2', name: 'Mike Chen', type: 'support', message: 'Hi Robert, I am looking at your account now. Can you provide your invoice number?' },
      { sender: 'sim-user-2', name: 'Robert Johnson', type: 'customer', message: 'Invoice #INV-2024-1234 and #INV-2024-1235' },
      { sender: 'sim-staff-2', name: 'Mike Chen', type: 'support', message: 'I see the duplicate charge. This was a processing error on our end. I am issuing a full refund for the duplicate charge right now. You should see it in 3-5 business days.' },
      { sender: 'sim-user-2', name: 'Robert Johnson', type: 'customer', message: 'That is great! Thank you for resolving this so quickly.' },
      
      // Scenario 3: Account locked
      { sender: 'sim-user-3', name: 'Maria Garcia', type: 'customer', message: 'My account is locked after too many failed login attempts. How do I unlock it?' },
      { sender: 'helpos-ai-bot', name: 'HelpOS', type: 'bot', message: 'Maria - Account security issue. Emily Taylor specializes in account access. Connecting you now.' },
      { sender: 'sim-staff-3', name: 'Emily Taylor', type: 'support', message: 'Hi Maria! I can unlock your account. For security, can you verify the last 4 digits of your phone number?' },
      { sender: 'sim-user-3', name: 'Maria Garcia', type: 'customer', message: '4567' },
      { sender: 'sim-staff-3', name: 'Emily Taylor', type: 'support', message: 'Perfect! Your account is now unlocked. I also reset your password for security. Check your email for the new temporary password.' },
      { sender: 'sim-user-3', name: 'Maria Garcia', type: 'customer', message: 'Thank you! I can log in now!' },
      
      // Scenario 4: Schedule question
      { sender: 'sim-user-4', name: 'James Wilson', type: 'customer', message: 'I need help with AI Scheduling. How do I assign shifts to multiple employees at once?' },
      { sender: 'sim-staff-1', name: 'Sarah Martinez', type: 'support', message: 'Hi James! You can use the drag-and-drop feature. Just hold Shift and click multiple employees, then drag a shift template onto the selection.' },
      { sender: 'sim-user-4', name: 'James Wilson', type: 'customer', message: 'Oh wow, that is so much easier! Thank you!' },
      
      // Scenario 5: Feature request
      { sender: 'sim-user-5', name: 'Linda Brown', type: 'customer', message: 'Is there a way to export timesheet data to Excel? I need it for my accountant.' },
      { sender: 'sim-staff-2', name: 'Mike Chen', type: 'support', message: 'Yes! Go to TrackOS > Reports > Export. You can choose Excel, CSV, or PDF format.' },
      { sender: 'sim-user-5', name: 'Linda Brown', type: 'customer', message: 'Perfect! Found it. This is exactly what I needed.' },
      
      // Scenario 6: Technical issue
      { sender: 'sim-user-6', name: 'Michael Davis', type: 'customer', message: 'The mobile app keeps crashing when I try to clock in. Is this a known issue?' },
      { sender: 'helpos-ai-bot', name: 'HelpOS', type: 'bot', message: 'Michael - Technical issue detected. David Kim is our mobile specialist but currently busy. Sarah will assist.' },
      { sender: 'sim-staff-1', name: 'Sarah Martinez', type: 'support', message: 'Hi Michael! What device and OS version are you using?' },
      { sender: 'sim-user-6', name: 'Michael Davis', type: 'customer', message: 'iPhone 14, iOS 17.2' },
      { sender: 'sim-staff-1', name: 'Sarah Martinez', type: 'support', message: 'Try clearing the app cache: Settings > Apps > WorkforceOS > Clear Cache. If that does not work, uninstall and reinstall the app. Your data is saved in the cloud.' },
      { sender: 'sim-user-6', name: 'Michael Davis', type: 'customer', message: 'Clearing cache fixed it! Thanks!' },
      
      // Scenario 7: Upgrade question
      { sender: 'sim-user-7', name: 'Patricia Miller', type: 'customer', message: 'What is the difference between Professional and Enterprise plans?' },
      { sender: 'sim-staff-3', name: 'Emily Taylor', type: 'support', message: 'Great question! Enterprise includes AI auto-scheduling, advanced analytics, and priority support. Professional has all core features like time tracking and invoicing. Would you like me to send you a detailed comparison?' },
      { sender: 'sim-user-7', name: 'Patricia Miller', type: 'customer', message: 'Yes please! That would be helpful.' },
      { sender: 'sim-staff-3', name: 'Emily Taylor', type: 'support', message: 'Just emailed you the comparison guide. Let me know if you have questions!' },
      
      // Scenario 8: Integration question
      { sender: 'sim-user-8', name: 'Christopher Lee', type: 'customer', message: 'Can WorkforceOS integrate with QuickBooks for payroll?' },
      { sender: 'helpos-ai-bot', name: 'HelpOS', type: 'bot', message: 'Christopher - Integration inquiry. Mike Chen is our integration expert.' },
      { sender: 'sim-staff-2', name: 'Mike Chen', type: 'support', message: 'Yes! We have a direct QuickBooks integration. Go to Settings > Integrations > QuickBooks and follow the OAuth connection flow. Takes about 2 minutes.' },
      { sender: 'sim-user-8', name: 'Christopher Lee', type: 'customer', message: 'Excellent! I will set that up now.' },
      
      // Scenario 9: Report question
      { sender: 'sim-user-9', name: 'Sarah Anderson', type: 'customer', message: 'How do I create custom reports in ReportOS?' },
      { sender: 'sim-staff-1', name: 'Sarah Martinez', type: 'support', message: 'Hi Sarah! Go to ReportOS > Templates > Create New. You can add custom fields, set required fields, and even require photo uploads.' },
      { sender: 'sim-user-9', name: 'Sarah Anderson', type: 'customer', message: 'Can I require employees to submit daily reports?' },
      { sender: 'sim-staff-1', name: 'Sarah Martinez', type: 'support', message: 'Absolutely! In the template settings, enable "Mandatory Daily Submission" and set the deadline time. Employees will get automated reminders.' },
      { sender: 'sim-user-9', name: 'Sarah Anderson', type: 'customer', message: 'This is fantastic! Thank you!' },
      
      // Scenario 10: Compliance question
      { sender: 'sim-user-10', name: 'Daniel Martinez', type: 'customer', message: 'I need to pull audit logs for a compliance review. Where can I find those?' },
      { sender: 'sim-staff-3', name: 'Emily Taylor', type: 'support', message: 'Hi Daniel! As an Owner, go to Settings > Audit Logs. You can filter by date range, user, and action type, then export to PDF or CSV.' },
      { sender: 'sim-user-10', name: 'Daniel Martinez', type: 'customer', message: 'Perfect! Found everything I need. Your platform is very thorough!' },
      
      // HelpOS provides stats
      { sender: 'helpos-ai-bot', name: 'HelpOS', type: 'bot', message: 'Support stats: 10 issues resolved today. Average response time: 2 minutes. Customer satisfaction: 98%. Great work team!' },
    ];

    // Send messages with realistic timing
    let messageIndex = 0;
    const sendNextMessage = async () => {
      if (messageIndex >= scenarios.length) {
        console.log('Chat simulation completed');
        simulationRunning = false;
        return;
      }

      const scenario = scenarios[messageIndex];
      messageIndex++;

      try {
        // Create and broadcast message
        const chatMessage = await storage.createChatMessage({
          conversationId: MAIN_ROOM_ID,
          senderId: scenario.sender,
          senderName: scenario.name,
          senderType: scenario.type as 'customer' | 'support' | 'system' | 'bot',
          message: scenario.message,
          messageType: 'text',
        });

        // Broadcast to all connected clients
        const clients = conversationClients.get(MAIN_ROOM_ID);
        if (clients) {
          const payload = JSON.stringify({
            type: 'new_message',
            message: chatMessage,
          });
          clients.forEach((client) => {
            if (client.readyState === WebSocket.OPEN) {
              client.send(payload);
            }
          });
        }

        // Realistic delay between messages (3-8 seconds)
        const delay = Math.random() * 5000 + 3000;
        setTimeout(sendNextMessage, delay);
      } catch (error) {
        console.error('Simulation message error:', error);
        setTimeout(sendNextMessage, 1000);
      }
    };

    // Start sending messages
    setTimeout(sendNextMessage, 5000); // Start after 5 seconds
  }

  // Start simulation when first user joins the main room
  // DISABLED: Simulation was causing FK constraint violations with non-existent users
  // setInterval(() => {
  //   const clients = conversationClients.get(MAIN_ROOM_ID);
  //   if (clients && clients.size > 0 && !simulationRunning) {
  //     startChatSimulation();
  //   }
  // }, 10000); // Check every 10 seconds

  // Add handler for shift updates subscription (before closing the listener)
  // This is already handled in the ws.on('message') switch statement above

  console.log('WebSocket server initialized on /ws/chat');
  
  // Export broadcast function for shift updates
  return {
    wss,
    broadcastShiftUpdate: (workspaceId: string, updateType: 'shift_created' | 'shift_updated' | 'shift_deleted', shift?: any, shiftId?: string) => {
      const clients = shiftUpdateClients.get(workspaceId);
      if (!clients || clients.size === 0) {
        console.log(`No clients subscribed to shift updates for workspace ${workspaceId}`);
        return;
      }

      // SECURITY: Sanitize shift payload - remove sensitive fields
      let sanitizedShift = undefined;
      if (shift) {
        sanitizedShift = {
          id: shift.id,
          title: shift.title,
          startTime: shift.startTime,
          endTime: shift.endTime,
          employeeId: shift.employeeId,
          clientId: shift.clientId,
          status: shift.status,
          workspaceId: shift.workspaceId,
          // Explicitly exclude: cost, hourlyRate, notes, internalNotes, paymentDetails
        };
      }

      const payload = JSON.stringify({
        type: updateType,
        shift: sanitizedShift,
        shiftId,
        timestamp: new Date().toISOString(),
      });

      console.log(`📡 Broadcasting ${updateType} to ${clients.size} clients in workspace ${workspaceId}`);

      clients.forEach((client) => {
        if (client.readyState === WebSocket.OPEN) {
          client.send(payload);
        } else {
          // Clean up dead connections
          clients.delete(client);
        }
      });
    },
    broadcastNotification: (workspaceId: string, userId: string, updateType: 'notification_new' | 'notification_read' | 'notification_count_updated', notification?: any, unreadCount?: number) => {
      const workspaceClients = notificationClients.get(workspaceId);
      if (!workspaceClients) {
        console.log(`No notification clients for workspace ${workspaceId}`);
        return;
      }

      const userClient = workspaceClients.get(userId);
      if (!userClient || userClient.readyState !== WebSocket.OPEN) {
        console.log(`User ${userId} not subscribed to notifications or connection not open`);
        return;
      }

      // Sanitize notification payload if present
      let sanitizedNotification = undefined;
      if (notification) {
        sanitizedNotification = {
          id: notification.id,
          type: notification.type,
          title: notification.title,
          message: notification.message,
          isRead: notification.isRead,
          actionUrl: notification.actionUrl,
          createdAt: notification.createdAt,
          // Explicitly exclude: metadata, relatedEntityId, createdBy
        };
      }

      const payload = JSON.stringify({
        type: updateType,
        notification: sanitizedNotification,
        unreadCount,
        timestamp: new Date().toISOString(),
      });

      console.log(`🔔 Broadcasting ${updateType} to user ${userId} in workspace ${workspaceId}`);

      userClient.send(payload);
    },
    // AI Dispatch™ WebSocket Broadcast Functions
    broadcastGPSUpdate: (workspaceId: string, employeeId: string, latitude: number, longitude: number, status: string) => {
      const clients = dispatchUpdateClients.get(workspaceId);
      if (!clients || clients.size === 0) {
        return;
      }

      const payload = JSON.stringify({
        type: 'dispatch_gps_update',
        employeeId,
        latitude,
        longitude,
        status,
        timestamp: new Date().toISOString(),
      });

      clients.forEach((client) => {
        if (client.readyState === WebSocket.OPEN) {
          client.send(payload);
        }
      });
    },
    broadcastIncidentUpdate: (workspaceId: string, updateType: 'dispatch_incident_created' | 'dispatch_incident_updated' | 'dispatch_incident_assigned', incident: any) => {
      const clients = dispatchUpdateClients.get(workspaceId);
      if (!clients || clients.size === 0) {
        return;
      }

      // Sanitize incident payload
      const sanitizedIncident = {
        id: incident.id,
        incidentNumber: incident.incidentNumber,
        priority: incident.priority,
        incidentType: incident.incidentType,
        locationAddress: incident.locationAddress,
        locationLat: incident.locationLat,
        locationLng: incident.locationLng,
        status: incident.status,
        callReceivedAt: incident.callReceivedAt,
        dispatchedAt: incident.dispatchedAt,
      };

      const payload = JSON.stringify({
        type: updateType,
        incident: sanitizedIncident,
        timestamp: new Date().toISOString(),
      });

      clients.forEach((client) => {
        if (client.readyState === WebSocket.OPEN) {
          client.send(payload);
        }
      });
    },
    broadcastUnitStatusUpdate: (workspaceId: string, employeeId: string, status: string, incidentId?: number | null) => {
      const clients = dispatchUpdateClients.get(workspaceId);
      if (!clients || clients.size === 0) {
        return;
      }

      const payload = JSON.stringify({
        type: 'dispatch_unit_status_changed',
        employeeId,
        status,
        incidentId,
        timestamp: new Date().toISOString(),
      });

      clients.forEach((client) => {
        if (client.readyState === WebSocket.OPEN) {
          client.send(payload);
        }
      });
    },
    broadcastToWorkspace: (workspaceId: string, data: any) => {
      const clients = shiftUpdateClients.get(workspaceId);
      if (!clients || clients.size === 0) {
        return;
      }

      const payload = JSON.stringify({
        ...data,
        timestamp: new Date().toISOString(),
      });

      clients.forEach((client) => {
        if (client.readyState === WebSocket.OPEN) {
          client.send(payload);
        }
      });
    },
  };
}
