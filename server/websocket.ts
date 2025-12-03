import { WebSocketServer, WebSocket } from 'ws';
import { Server, IncomingMessage } from 'http';
import { storage } from './storage';
import { db } from './db';
import { eq, sql } from 'drizzle-orm';
import { formatUserDisplayName, formatUserDisplayNameForChat } from './utils/formatUserDisplayName';
import { parseSlashCommand, validateCommand, getHelpText, COMMAND_REGISTRY } from '@shared/commands';
import { queueManager } from './services/helpOsQueue';
import type { ChatMessage } from '@shared/schema';
import { trackConnection, trackDisconnection, checkMessageRateLimit } from './middleware/wsRateLimiter';
import { randomUUID } from 'crypto';
import { sanitizeChatMessage, sanitizePlainText } from './lib/sanitization';
import { CHAT_SERVER_CONFIG } from './config/chatServer';
import { ChatServerHub } from './services/ChatServerHub';
import cookie from 'cookie';
import { unsign } from 'cookie-signature';
import { hasPlatformWideAccess, getUserPlatformRole } from './rbac';
import { PLATFORM_WORKSPACE_ID } from './seed-platform-workspace';

// ============================================================================
// SESSION-BASED WEBSOCKET AUTHENTICATION
// Securely extracts user identity from HTTP session (not client-supplied IDs)
// ============================================================================

interface AuthenticatedSession {
  userId: string;
  workspaceId?: string;
  role?: string;
  email?: string;
}

/**
 * Parse the session from WebSocket upgrade request cookies
 * This is the ONLY secure way to authenticate WebSocket connections
 * @param request - The HTTP upgrade request containing cookies
 * @returns The authenticated session or null if not authenticated
 */
async function getSessionFromRequest(request: IncomingMessage): Promise<AuthenticatedSession | null> {
  try {
    // Parse cookies from request headers
    const cookies = cookie.parse(request.headers.cookie || '');
    const signedSessionId = cookies['connect.sid'];
    
    if (!signedSessionId) {
      return null;
    }
    
    // Remove 's:' prefix and unsign the session ID
    // connect.sid format: s:sessionId.signature
    const sessionSecret = process.env.SESSION_SECRET;
    if (!sessionSecret) {
      console.error('[WebSocket Auth] SESSION_SECRET not configured');
      return null;
    }
    
    // Extract session ID from signed cookie (format: s:sessionId.signature)
    let sessionId = signedSessionId;
    if (sessionId.startsWith('s:')) {
      sessionId = sessionId.substring(2);
      const unsigned = unsign(sessionId, sessionSecret);
      if (unsigned === false) {
        console.warn('[WebSocket Auth] Invalid session signature');
        return null;
      }
      sessionId = unsigned;
    }
    
    // Look up session in PostgreSQL sessions table
    const result = await db.execute(
      sql`SELECT sess FROM sessions WHERE sid = ${sessionId} AND expire > NOW()`
    );
    
    if (!result.rows || result.rows.length === 0) {
      return null;
    }
    
    const sess = result.rows[0].sess as any;
    
    // Extract user info from session data
    // Session structure: { userId: "...", passport: { user: { claims: {...} } } }
    // OR: { passport: { user: { id: "..." } } }
    const userId = sess?.userId || sess?.passport?.user?.id || sess?.passport?.user?.claims?.sub;
    
    if (!userId) {
      console.log('[WebSocket Auth] No userId found in session');
      return null;
    }
    
    // Get email from various possible locations
    const email = sess?.email || sess?.passport?.user?.claims?.email || sess?.passport?.user?.email;
    
    // Extract workspace from various possible locations in session
    // Priority: explicit workspaceId > currentWorkspaceId > passport claims > membership
    let workspaceId = sess.workspaceId || 
                      sess.currentWorkspaceId || 
                      sess.passport?.user?.workspaceId ||
                      sess.passport?.user?.claims?.workspaceId ||
                      sess.passport?.user?.claims?.currentWorkspaceId;
    
    // If still no workspace, try to get from tenant membership list
    if (!workspaceId && sess.passport?.user?.claims?.tenantMembership) {
      const memberships = sess.passport.user.claims.tenantMembership;
      if (Array.isArray(memberships) && memberships.length > 0) {
        // Use first membership workspace as default
        workspaceId = memberships[0]?.workspaceId || memberships[0];
      }
    }
    
    return {
      userId,
      workspaceId,
      role: sess.role || sess.passport?.user?.role || sess.passport?.user?.claims?.role,
      email,
    };
  } catch (error) {
    console.error('[WebSocket Auth] Session lookup failed:', error);
    return null;
  }
}

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
    
    // Sentiment analysis fields
    sentiment: null,
    sentimentScore: null,
    sentimentConfidence: null,
    urgencyLevel: null,
    shouldEscalate: false,
    sentimentAnalyzedAt: null,
    
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
    platformRole?: string;
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
let currentMOTD = "Welcome to HelpAI Support - Your satisfaction is our priority - 24/7/365";

// Main HelpDesk room identifier (consistent across all handlers)
const MAIN_ROOM_ID = 'helpdesk';

// Permanently banned users tracking (in-memory)
const bannedUsers = new Set<string>();

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

// Global broadcast function for force-refresh events (used by support command console)
let globalWSS: WebSocketServer | null = null;

// Global broadcaster for notifications
let globalBroadcaster: any = null;

export function setGlobalBroadcaster(broadcaster: any) {
  globalBroadcaster = broadcaster;
}

export function broadcastNotificationToUser(
  workspaceId: string,
  userId: string,
  notification: any
) {
  if (!globalBroadcaster) {
    console.warn('[WebSocket] Global broadcaster not initialized for notification');
    return false;
  }
  
  try {
    globalBroadcaster.broadcastNotification(
      workspaceId,
      userId,
      'notification_new',
      notification,
      undefined
    );
    return true;
  } catch (err) {
    console.warn('[WebSocket] Failed to broadcast notification:', err);
    return false;
  }
}

/**
 * Broadcast user-scoped notification (for users without workspace context)
 * Mirrors broadcastNotificationToUser but works for workspace-less users
 * Ensures unread counter parity with workspace-scoped notifications
 */
export function broadcastUserScopedNotification(
  userId: string,
  notification: any
) {
  if (!globalWSS) {
    console.warn('[WebSocket] Global WSS not initialized for user-scoped notification');
    return false;
  }
  
  try {
    const payload = JSON.stringify({
      type: 'notification_new',
      notification: {
        ...notification,
        scope: 'user',
      },
      targetUserId: userId,
    });
    
    let sentCount = 0;
    globalWSS.clients.forEach((client: any) => {
      if (client.readyState === WebSocket.OPEN) {
        const clientUserId = client.userId || client._userId;
        if (clientUserId === userId) {
          client.send(payload);
          sentCount++;
        }
      }
    });
    
    console.log(`[WebSocket] User-scoped notification sent to ${sentCount} connections for user ${userId}`);
    return sentCount > 0;
  } catch (err) {
    console.warn('[WebSocket] Failed to broadcast user-scoped notification:', err);
    return false;
  }
}

export function broadcastToAllClients(message: any) {
  if (!globalWSS) {
    console.warn('[WebSocket] Global WSS not initialized for broadcast');
    return 0;
  }
  
  let count = 0;
  const payload = typeof message === 'string' ? message : JSON.stringify(message);
  
  globalWSS.clients.forEach((client) => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(payload);
      count++;
    }
  });
  
  console.log(`[WebSocket] Broadcast sent to ${count} clients`);
  return count;
}

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
    const isStaff = hasPlatformWideAccess(role ?? undefined);
    
    return {
      userId: user.id,
      workspaceId: user.currentWorkspaceId || '',
      role: role ?? null,
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
  globalWSS = wss; // Set global reference for force-broadcast
  
  // Track connections subscribed to shift updates by workspace ID
  const shiftUpdateClients = new Map<string, Set<WebSocketClient>>();
  
  // Track notification clients (workspaceId -> Set of WebSocket clients)
  const notificationClients = new Map<string, Map<string, WebSocketClient>>();
  
  // Track AI Dispatch™ connections by workspace ID
  const dispatchUpdateClients = new Map<string, Set<WebSocketClient>>();

  // =========================================================================
  // CHAT SERVER HUB INTEGRATION - Unified event broadcasting
  // =========================================================================
  ChatServerHub.setWebSocketBroadcaster((event) => {
    const { type, conversationId, workspaceId, userId, payload } = event;
    
    if (conversationId) {
      const clients = conversationClients.get(conversationId);
      if (clients) {
        const eventPayload = JSON.stringify({
          type: 'platform_event',
          conversationId,
          payload,
        });
        clients.forEach((client) => {
          if (client.readyState === WebSocket.OPEN) {
            if (!userId || client.userId === userId) {
              client.send(eventPayload);
            }
          }
        });
      }
    } else if (workspaceId) {
      const wsClients = notificationClients.get(workspaceId);
      if (wsClients) {
        const eventPayload = JSON.stringify({
          type: 'platform_event',
          workspaceId,
          payload,
        });
        wsClients.forEach((client) => {
          if (client.readyState === WebSocket.OPEN) {
            if (!userId || client.userId === userId) {
              client.send(eventPayload);
            }
          }
        });
      }
    }
  });
  console.log('[WebSocket] ChatServerHub broadcaster registered');

  wss.on('connection', async (ws: WebSocketClient, request: IncomingMessage) => {
    // Extract IP address and user agent from request
    const ipAddress = getClientIP(request);
    const userAgent = request.headers['user-agent'] || 'unknown';
    
    // Generate unique session ID for connection tracking
    const connectionId = randomUUID();
    ws.sessionId = connectionId;
    
    // Store for audit trail
    ws.ipAddress = ipAddress;
    ws.userAgent = userAgent;
    
    // =========================================================================
    // SESSION-BASED AUTHENTICATION AT CONNECTION TIME
    // Securely extract authenticated user identity from HTTP session cookies
    // This is done ONCE at connection time - not per-message
    // =========================================================================
    const authenticatedSession = await getSessionFromRequest(request);
    if (authenticatedSession) {
      // Store authenticated identity on WebSocket - NEVER trust client-supplied IDs
      ws.userId = authenticatedSession.userId;
      ws.workspaceId = authenticatedSession.workspaceId;
      
      // Fetch platform role for platform-wide access checks (root_admin, support_agent, Bot, etc.)
      const platformRole = await getUserPlatformRole(authenticatedSession.userId);
      
      ws.serverAuth = {
        userId: authenticatedSession.userId,
        workspaceId: authenticatedSession.workspaceId || '',
        role: authenticatedSession.role || 'user',
        platformRole: platformRole !== 'none' ? platformRole : undefined,
        sessionId: connectionId,
        authenticatedAt: new Date(),
      };
      console.log(`New authenticated WebSocket connection from ${ipAddress} (user: ${authenticatedSession.userId}, platformRole: ${platformRole}, connection: ${connectionId})`);
    } else {
      // Guest/anonymous connection - allowed for helpdesk but limited permissions
      console.log(`New guest WebSocket connection from ${ipAddress} (connection: ${connectionId})`);
    }
    
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
                    workspaceId: supportRoom.workspaceId || 'coaileague-platform-workspace',
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

            // =========================================================================
            // SECURITY: Use session-based authentication - NEVER trust client-supplied IDs
            // The authenticated user ID was set at connection time from HTTP session
            // =========================================================================
            
            // Check for valid authentication
            const hasSessionAuth = ws.serverAuth !== undefined;
            
            // Guest access rules:
            // 1. Must NOT have a valid session (session users should use their real ID)
            // 2. Must claim guest status with proper prefix (guest-*)
            // 3. Must be joining the main helpdesk room only
            const claimsGuest = typeof payload.userId === 'string' && 
                               payload.userId.startsWith('guest-') && 
                               /^guest-[a-f0-9-]{8,}$/i.test(payload.userId);
            const isMainRoomRequest = isMainRoom || payload.conversationId === MAIN_ROOM_ID;
            const isGuestUser = !hasSessionAuth && claimsGuest && isMainRoomRequest;
            
            // For authenticated users, use the server-verified identity only
            // For guests, use the claimed guest ID (only allowed in helpdesk)
            let effectiveUserId: string | null = null;
            
            if (hasSessionAuth) {
              // Session-authenticated: use server-verified identity
              effectiveUserId = ws.serverAuth!.userId;
            } else if (isGuestUser) {
              // Valid guest user for helpdesk
              effectiveUserId = payload.userId;
            }
            
            // If not authenticated and not a valid guest, reject
            if (!effectiveUserId) {
              const reason = !hasSessionAuth && payload.userId && !claimsGuest 
                ? 'Invalid user ID format. Guests must use guest-* prefix.'
                : !isMainRoomRequest && claimsGuest
                ? 'Guests can only join the public HelpDesk.'
                : 'Authentication required. Please log in or connect as a guest.';
              
              ws.send(JSON.stringify({
                type: 'error',
                message: reason,
              }));
              console.warn(`[Security] Rejected join attempt - ${reason} (IP: ${ws.ipAddress})`);
              return;
            }
            
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
              // Authenticated user - use session-verified userId
              const userInfo = await storage.getUserDisplayInfo(effectiveUserId);
              displayName = userInfo ? formatUserDisplayNameForChat({
                firstName: userInfo.firstName,
                lastName: userInfo.lastName,
                email: userInfo.email || undefined,
                platformRole: userInfo.platformRole || undefined,
                workspaceRole: userInfo.workspaceRole || undefined,
              }) : 'User';

              // Determine user type and set initial status
              const fetchedRole = await storage.getUserPlatformRole(effectiveUserId).catch(() => null);
              platformRole = fetchedRole ?? null;
              isStaff = hasPlatformWideAccess(platformRole ?? undefined);
              
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
              
              // SECURITY: Validate workspace access for authenticated users
              // Non-staff users must have workspace context and can only access matching workspaces
              if (!isMainRoom) {
                const userWorkspaceId = ws.serverAuth?.workspaceId;
                
                // Authenticated non-staff users REQUIRE valid workspace in session
                if (!isStaff && !userWorkspaceId) {
                  ws.send(JSON.stringify({
                    type: 'error',
                    message: 'Your session lacks workspace context. Please refresh and try again.',
                  }));
                  console.warn(`[Security] User ${effectiveUserId} has no workspace in session`);
                  return;
                }
                
                // Conversations without workspace are only accessible in helpdesk
                // For non-helpdesk, conversation MUST have a workspace
                if (!conversation.workspaceId && !isStaff) {
                  ws.send(JSON.stringify({
                    type: 'error',
                    message: 'Invalid conversation: no workspace context.',
                  }));
                  console.warn(`[Security] Conversation ${conversationId} has no workspace - blocked for user ${effectiveUserId}`);
                  return;
                }
                
                // Verify conversation workspace matches user's workspace (staff exempt)
                if (conversation.workspaceId && !isStaff && conversation.workspaceId !== userWorkspaceId) {
                  ws.send(JSON.stringify({
                    type: 'error',
                    message: 'Access denied: You do not have permission to access this conversation.',
                  }));
                  console.warn(`[Security] User ${effectiveUserId} blocked from workspace ${conversation.workspaceId} (belongs to ${userWorkspaceId})`);
                  return;
                }
              }
              
              // Do NOT update serverAuth.workspaceId from conversation - keep session-derived workspace
              // serverAuth was set at connection time and should remain stable
            }

            // RATE LIMITING: Track connection (enforce 3 concurrent connections max)
            // Skip tracking for guest users since they don't have user records
            if (!isGuestUser) {
              const connectionTracking = await trackConnection(
                effectiveUserId,
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

            // Associate this client with the conversation (using server-verified ID)
            // SECURITY: Guests don't get workspace assignment; authenticated users keep session workspace
            ws.userId = effectiveUserId;
            ws.userName = displayName;
            ws.workspaceId = isGuestUser ? undefined : (ws.serverAuth?.workspaceId || undefined);
            ws.conversationId = conversationId; // Use resolved conversation ID
            ws.userStatus = 'online'; // Default status
            ws.userType = userType;

            // Check if user already has an active connection in this room
            const existingClients = conversationClients.get(conversationId);
            const userAlreadyInRoom = existingClients ? Array.from(existingClients).some(
              client => client.userId === effectiveUserId && client.readyState === WebSocket.OPEN
            ) : false;

            if (!conversationClients.has(conversationId)) {
              conversationClients.set(conversationId, new Set());
            }
            conversationClients.get(conversationId)!.add(ws);

            // GLOBAL TRACKING: Add to platform-wide stats
            globalConnections.totalConnections++;
            globalConnections.allUsers.set(effectiveUserId, ws);
            if (userType === 'staff') {
              globalConnections.staffUsers.add(effectiveUserId);
            } else if (userType === 'org_user' || userType === 'guest') {
              // Track non-staff users as subscribers
              globalConnections.subscriberUsers.add(effectiveUserId);
            }

            // CRITICAL: Send join acknowledgment FIRST so client updates resolvedConversationId
            // before receiving conversation_history. Otherwise filter rejects all messages!
            ws.send(JSON.stringify({
              type: 'conversation_joined',
              conversationId: conversationId, // Send back the resolved UUID, not the slug
              success: true,
            }));

            // REAL-TIME NOTIFICATIONS: Notify other users that someone joined
            // Only emit for non-guests and when user wasn't already in the room
            if (!isGuestUser && !userAlreadyInRoom) {
              ChatServerHub.emitUserJoinedRoom({
                conversationId: conversationId,
                roomName: conversation.subject || 'Chat',
                workspaceId: conversation.workspaceId || undefined,
                userId: effectiveUserId,
                userName: displayName,
              }).catch(err => console.error('[ChatServerHub] Failed to emit user_joined_room:', err));
            }

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
              await storage.markMessagesAsRead(conversationId, effectiveUserId);
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

                // Add HelpAI Bot from config (always first in list for main room)
                if (payload.conversationId === MAIN_ROOM_ID) {
                  onlineUsers.push({
                    id: CHAT_SERVER_CONFIG.helpai.userId,
                    name: CHAT_SERVER_CONFIG.helpai.name,
                    role: 'bot',
                    status: 'online',
                    userType: 'staff'
                  });
                }

                // Add real users from database - fetch fresh display info for sync consistency
                const clientArray = Array.from(clients);
                for (const client of clientArray) {
                  if (client.userId && client.readyState === WebSocket.OPEN) {
                    const userRole = await storage.getUserPlatformRole(client.userId) || undefined;
                    const isClientStaff = hasPlatformWideAccess(userRole);
                    
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

            // HELPDESK ANNOUNCEMENTS: System + HelpAI (only if user is joining for the first time)
            if (isMainRoom && !userAlreadyInRoom) {
              try {
                const announcePlatformRole = await storage.getUserPlatformRole(payload.userId) || undefined;
                const isAnnounceStaff = hasPlatformWideAccess(announcePlatformRole);
                
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

                // 2. HelpAI announcement (AI Bot): Only for customers (not staff)
                if (!isAnnounceStaff) {
                  // AUTO-VOICE for public HelpDesk room: Give guests immediate ability to send messages
                  if (isMainRoom) {
                    if (ws.readyState === WebSocket.OPEN) {
                      ws.send(JSON.stringify({ type: 'voice_granted' }));
                      console.log(`[HelpAI] Auto-granted voice to ${displayName} in public HelpDesk`);
                    }
                  }

                  // Check if user has an active support ticket
                  const existingTicket = await storage.getActiveSupportTicket(payload.userId ?? '', ws.workspaceId ?? '');
                  
                  let welcomeMessage: string;
                  let ticketNumber: string;
                  
                  if (!existingTicket && ws.workspaceId) {
                    // NO TICKET: Use default greeting from config
                    welcomeMessage = CHAT_SERVER_CONFIG.helpai.greetings.default;
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
                      welcomeMessage = CHAT_SERVER_CONFIG.helpai.messages.ticketCreated(displayName, ticketNumber, position, waitTime, queueStatus.waitingCount);
                      await queueManager.markWelcomeSent(queueEntry.id);
                    } else {
                      welcomeMessage = CHAT_SERVER_CONFIG.helpai.messages.ticketCreatedSimple(displayName, ticketNumber);
                    }
                  }
                  
                  // EPHEMERAL welcome message - NOT saved to database to prevent doubles
                  const botMessage = {
                    id: `temp-${Date.now()}`,
                    conversationId: conversationId,
                    senderId: CHAT_SERVER_CONFIG.helpai.userId,
                    senderName: CHAT_SERVER_CONFIG.helpai.name,
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

                  // Send PRIVATE HelpAI welcome DM (only to this user, ephemeral)
                  const privateWelcome = JSON.stringify({
                    type: 'private_message',
                    message: botMessage,
                    from: CHAT_SERVER_CONFIG.helpai.name,
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

            // HelpAI greets everyone who joins (only send to the joining user, not the entire room, and only if first time joining)
            if (isMainRoom && !userAlreadyInRoom) {
              try {
                // Determine greeting based on user type - use config greetings
                let greeting = '';
                if (isStaff) {
                  // Staff returning greeting
                  greeting = CHAT_SERVER_CONFIG.helpai.greetings.returning.replace('I\'m HelpAI, ready to assist you.', `Support chat is active. Right-click users for quick actions, ${displayName}!`);
                } else {
                  // Guest/user greeting
                  greeting = CHAT_SERVER_CONFIG.helpai.greetings.default;
                }

                // Send welcome message ONLY to the joining user (not saved to DB)
                const welcomePayload = JSON.stringify({
                  type: 'private_message',
                  message: {
                    id: `welcome-${Date.now()}`,
                    createdAt: new Date(),
                    conversationId: conversationId,
                    senderId: CHAT_SERVER_CONFIG.helpai.userId,
                    senderName: CHAT_SERVER_CONFIG.helpai.name,
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
                console.error('[HelpAI] Greeting failed:', greetError);
              }
            }

            // Single consolidated log message (only for NEW joins, not reconnections)
            if (!userAlreadyInRoom) {
              if (isMainRoom) {
                console.log(`✅ ${displayName} joined HelpDesk (${userRoleInfo})`);
              } else {
                console.log(`${displayName} joined conversation ${payload.conversationId}`);
              }

              // CHAT SERVER HUB: Emit user_joined event for unified event system
              ChatServerHub.emit({
                type: isStaff ? 'staff_joined' : 'user_joined_room',
                title: isStaff ? 'Staff Joined' : 'User Joined',
                description: `${displayName} joined the chat`,
                metadata: {
                  conversationId: conversationId,
                  roomSlug: isMainRoom ? MAIN_ROOM_ID : undefined,
                  workspaceId: ws.workspaceId,
                  userId: payload.userId,
                  userName: displayName,
                  audience: 'room',
                },
                shouldPersistToWhatsNew: false,
                shouldNotify: isStaff, // Only notify when staff joins
              }).catch(err => console.error('[ChatServerHub] Failed to emit user_joined:', err));
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
                const cmdPlatformRole = await storage.getUserPlatformRole(ws.userId) || undefined;
                const isCmdStaff = hasPlatformWideAccess(cmdPlatformRole);
                if (!isCmdStaff) {
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
                  const introMessage = `📢 ${staffDisplayName} (${staffRoleName}) is now ready to assist you!\n\nℹ️ To help you better, please share:\n• Your full name\n• Organization/Company name\n• Brief description of how we can help\n\n💬 Our support team is here to help with any questions about CoAIleague™!`;
                  
                  const botMsg = await storage.createChatMessage({
                    conversationId: ws.conversationId,
                    senderId: CHAT_SERVER_CONFIG.helpai.userId,
                    senderName: CHAT_SERVER_CONFIG.helpai.name,
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
                    senderId: CHAT_SERVER_CONFIG.helpai.userId,
                    senderName: CHAT_SERVER_CONFIG.helpai.name,
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
                  const isAuthorized = hasPlatformWideAccess(role);
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
                    senderId: CHAT_SERVER_CONFIG.helpai.userId,
                    senderName: CHAT_SERVER_CONFIG.helpai.name,
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
                  const isStaffAuthorized = hasPlatformWideAccess(role);
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
                      requestedByWorkspaceId: workspaceId || undefined,
                      targetUserId: undefined,
                      targetEmail: email,
                      targetWorkspaceId: undefined,
                      success: false,
                      outcomeCode: 'rate_limited',
                      reason: `Rate limit exceeded (blocked by ${rateLimit.blockedBy})`,
                      ipAddress: ws.ipAddress || undefined,
                      userAgent: ws.userAgent || undefined,
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
                        requestedByWorkspaceId: workspaceId || undefined,
                        targetUserId: undefined,
                        targetEmail: email,
                        targetWorkspaceId: undefined,
                        success: false,
                        outcomeCode: 'not_found',
                        reason: 'User not found - action blocked for security',
                        ipAddress: ws.ipAddress || undefined,
                        userAgent: ws.userAgent || undefined,
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
                        requestedByWorkspaceId: workspaceId || undefined,
                        targetUserId: user.id,
                        targetEmail: email,
                        targetWorkspaceId: targetWorkspaceId || undefined,
                        success: false,
                        outcomeCode: 'error',
                        reason: 'Cross-workspace reset blocked',
                        ipAddress: ws.ipAddress || undefined,
                        userAgent: ws.userAgent || undefined,
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
                        requestedByWorkspaceId: workspaceId || undefined,
                        targetUserId: user.id,
                        targetEmail: email,
                        targetWorkspaceId: user.currentWorkspaceId || undefined,
                        success: true,
                        outcomeCode: 'sent',
                        reason: 'Reset email sent',
                        ipAddress: ws.ipAddress || undefined,
                        userAgent: ws.userAgent || undefined,
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
                        requestedByWorkspaceId: workspaceId || undefined,
                        targetUserId: user.id,
                        targetEmail: email,
                        targetWorkspaceId: user.currentWorkspaceId || undefined,
                        success: false,
                        outcomeCode: 'email_failed',
                        reason: `Email send failed: ${(emailError as Error).message}`,
                        ipAddress: ws.ipAddress || undefined,
                        userAgent: ws.userAgent || undefined,
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
                    senderId: CHAT_SERVER_CONFIG.helpai.userId,
                    senderName: CHAT_SERVER_CONFIG.helpai.name,
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
                    senderId: CHAT_SERVER_CONFIG.helpai.userId,
                    senderName: CHAT_SERVER_CONFIG.helpai.name,
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
                        if (client.userId) {
                          targetUserId = client.userId;
                        }
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
                      ? `${staffDisplayName} (${staffRoleName}) removed ${targetUserDisplayName} from chat. Reason: ${reason}`
                      : `Kick command executed by ${staffDisplayName}. Note: ${targetUserDisplayName} was not connected to this room.`,
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
                    senderId: CHAT_SERVER_CONFIG.helpai.userId,
                    senderName: CHAT_SERVER_CONFIG.helpai.name,
                    senderType: 'bot',
                    message: userConnected
                      ? `User Muted: ${targetUsername} has been muted for ${duration} minutes. They can still read messages but cannot send messages during this time.`
                      : `Mute command executed for ${targetUsername} (${duration} min). Note: User is not currently connected to this room.`,
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
                      ? `${staffDisplayName} (${staffRoleName}) transferred ticket to ${targetStaff}`
                      : `Transfer requested to ${targetStaff} by ${staffDisplayName}. Note: Target staff member is not currently online.`,
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
                  const helpPlatformRole = await storage.getUserPlatformRole(ws.userId) || undefined;
                  const isHelpStaff = hasPlatformWideAccess(helpPlatformRole);
                  const helpText = getHelpText(isHelpStaff);
                  
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
                              content: `You are a helpful HR assistant for CoAIleague™. Answer employee questions about company policies, procedures, and benefits using the provided knowledge base. Be concise, friendly, and accurate. If you don't know the answer, say so and suggest contacting HR.`
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
                
                case 'welcome': {
                  // Send welcome message to customer
                  const customerName = parsedCommand.args.join(' ') || 'valued customer';
                  const welcomeMessage = `Welcome ${customerName}!\n\nThank you for reaching out to CoAIleague Support. ${staffDisplayName} (${staffRoleName}) is here to assist you.\n\nHow may we help you today?`;
                  
                  const welcomeMsg = await storage.createChatMessage({
                    conversationId: ws.conversationId,
                    senderId: CHAT_SERVER_CONFIG.helpai.userId,
                    senderName: CHAT_SERVER_CONFIG.helpai.name,
                    senderType: 'bot',
                    message: welcomeMessage,
                    messageType: 'text',
                  });
                  
                  if (clients) {
                    clients.forEach((client) => {
                      if (client.readyState === WebSocket.OPEN) {
                        client.send(JSON.stringify({ type: 'new_message', message: welcomeMsg }));
                      }
                    });
                  }
                  break;
                }
                
                case 'assign': {
                  // Assign conversation to staff member
                  const assignee = parsedCommand.args.join(' ') || staffDisplayName;
                  
                  // Update conversation assignment in database via direct query
                  try {
                    const { chatConversations } = await import('@shared/schema');
                    await db.update(chatConversations)
                      .set({ 
                        supportAgentId: ws.userId,
                        supportAgentName: staffDisplayName,
                        updatedAt: new Date()
                      })
                      .where(eq(chatConversations.id, ws.conversationId));
                    
                    const assignMsg = await storage.createChatMessage({
                      conversationId: ws.conversationId,
                      senderId: null,
                      senderName: 'System',
                      senderType: 'system',
                      message: `Conversation assigned to ${assignee}`,
                      messageType: 'text',
                      isSystemMessage: true,
                    });
                    
                    if (clients) {
                      clients.forEach((client) => {
                        if (client.readyState === WebSocket.OPEN) {
                          client.send(JSON.stringify({ type: 'new_message', message: assignMsg }));
                        }
                      });
                    }
                  } catch (error) {
                    console.error('[WebSocket] Error assigning conversation:', error);
                    ws.send(JSON.stringify({ type: 'error', message: 'Failed to assign conversation' }));
                  }
                  break;
                }
                
                case 'broadcast': {
                  // Broadcast announcement to all connected users (admin only)
                  if (!ws.serverAuth || !['root_admin', 'deputy_admin'].includes(ws.serverAuth.platformRole || '')) {
                    ws.send(JSON.stringify({ type: 'error', message: 'Broadcast requires admin privileges' }));
                    break;
                  }
                  
                  const announcement = parsedCommand.args.join(' ');
                  if (!announcement) {
                    ws.send(JSON.stringify({ type: 'error', message: 'Usage: /broadcast <message>' }));
                    break;
                  }
                  
                  // Broadcast to all connected clients
                  const broadcastPayload = JSON.stringify({
                    type: 'system_announcement',
                    message: `[ANNOUNCEMENT] ${announcement}`,
                    from: staffDisplayName,
                    timestamp: new Date().toISOString(),
                  });
                  
                  let broadcastCount = 0;
                  conversationClients.forEach((clientSet) => {
                    clientSet.forEach((client) => {
                      if (client.readyState === WebSocket.OPEN) {
                        client.send(broadcastPayload);
                        broadcastCount++;
                      }
                    });
                  });
                  
                  ws.send(JSON.stringify({ 
                    type: 'system_message', 
                    message: `Broadcast sent to ${broadcastCount} connections` 
                  }));
                  break;
                }
                
                case 'suspend': {
                  // Suspend a staff member (admin only)
                  if (!ws.serverAuth || !['root_admin', 'deputy_admin'].includes(ws.serverAuth.platformRole || '')) {
                    ws.send(JSON.stringify({ type: 'error', message: 'Suspend requires admin privileges' }));
                    break;
                  }
                  
                  const targetUsername = parsedCommand.args[0];
                  const reason = parsedCommand.args.slice(1).join(' ') || 'No reason provided';
                  
                  if (!targetUsername) {
                    ws.send(JSON.stringify({ type: 'error', message: 'Usage: /suspend <username> [reason]' }));
                    break;
                  }
                  
                  try {
                    const targetUser = await storage.getUserByUsernameOrEmail(targetUsername);
                    if (!targetUser) {
                      ws.send(JSON.stringify({ type: 'error', message: `User "${targetUsername}" not found` }));
                      break;
                    }
                    
                    // Suspend the user via direct query
                    const { users: usersTable } = await import('@shared/schema');
                    await db.update(usersTable)
                      .set({ 
                        isSuspended: true,
                        suspendedReason: reason,
                        suspendedAt: new Date(),
                        suspendedBy: ws.userId,
                        updatedAt: new Date()
                      } as any)
                      .where(eq(usersTable.id, targetUser.id));
                    
                    ws.send(JSON.stringify({ 
                      type: 'system_message', 
                      message: `User ${targetUsername} has been suspended. Reason: ${reason}` 
                    }));
                  } catch (error) {
                    console.error('[WebSocket] Error suspending user:', error);
                    ws.send(JSON.stringify({ type: 'error', message: 'Failed to suspend user' }));
                  }
                  break;
                }
                
                case 'reactivate': {
                  // Reactivate a suspended staff member (admin only)
                  if (!ws.serverAuth || !['root_admin', 'deputy_admin'].includes(ws.serverAuth.platformRole || '')) {
                    ws.send(JSON.stringify({ type: 'error', message: 'Reactivate requires admin privileges' }));
                    break;
                  }
                  
                  const targetUsername = parsedCommand.args[0];
                  
                  if (!targetUsername) {
                    ws.send(JSON.stringify({ type: 'error', message: 'Usage: /reactivate <username>' }));
                    break;
                  }
                  
                  try {
                    const targetUser = await storage.getUserByUsernameOrEmail(targetUsername);
                    if (!targetUser) {
                      ws.send(JSON.stringify({ type: 'error', message: `User "${targetUsername}" not found` }));
                      break;
                    }
                    
                    // Reactivate the user via direct query
                    const { users: usersTable } = await import('@shared/schema');
                    await db.update(usersTable)
                      .set({ 
                        isSuspended: false,
                        suspendedReason: null,
                        suspendedAt: null,
                        suspendedBy: null,
                        updatedAt: new Date()
                      } as any)
                      .where(eq(usersTable.id, targetUser.id));
                    
                    ws.send(JSON.stringify({ 
                      type: 'system_message', 
                      message: `User ${targetUsername} has been reactivated` 
                    }));
                  } catch (error) {
                    console.error('[WebSocket] Error reactivating user:', error);
                    ws.send(JSON.stringify({ type: 'error', message: 'Failed to reactivate user' }));
                  }
                  break;
                }
                
                case 'staffstatus': {
                  // Check staff member status
                  const targetUsername = parsedCommand.args[0];
                  
                  if (!targetUsername) {
                    ws.send(JSON.stringify({ type: 'error', message: 'Usage: /staffstatus <username>' }));
                    break;
                  }
                  
                  try {
                    const targetUser = await storage.getUserByUsernameOrEmail(targetUsername);
                    if (!targetUser) {
                      ws.send(JSON.stringify({ type: 'error', message: `User "${targetUsername}" not found` }));
                      break;
                    }
                    
                    const platformRole = await storage.getUserPlatformRole(targetUser.id);
                    const isOnline = Array.from(conversationClients.values()).some(clientSet => 
                      Array.from(clientSet).some((client: any) => client.userId === targetUser.id && client.readyState === WebSocket.OPEN)
                    );
                    
                    // Check suspension status from user record
                    const isSuspended = (targetUser as any).isSuspended === true;
                    
                    const statusMsg = `Staff Status: ${targetUsername}\n` +
                      `Role: ${platformRole || 'N/A'}\n` +
                      `Status: ${isOnline ? 'Online' : 'Offline'}\n` +
                      `Account: ${isSuspended ? 'Suspended' : 'Active'}`;
                    
                    ws.send(JSON.stringify({ type: 'system_message', message: statusMsg }));
                  } catch (error) {
                    console.error('[WebSocket] Error checking staff status:', error);
                    ws.send(JSON.stringify({ type: 'error', message: 'Failed to check staff status' }));
                  }
                  break;
                }
                
                case 'restart': {
                  // Restart chat services (admin only)
                  if (!ws.serverAuth || !['root_admin'].includes(ws.serverAuth.platformRole || '')) {
                    ws.send(JSON.stringify({ type: 'error', message: 'Restart requires root admin privileges' }));
                    break;
                  }
                  
                  // Send restart notification to all clients
                  const restartPayload = JSON.stringify({
                    type: 'system_announcement',
                    message: 'Chat services are being restarted by an administrator. Please reconnect in a moment.',
                    from: 'System',
                    timestamp: new Date().toISOString(),
                  });
                  
                  conversationClients.forEach((clientSet) => {
                    clientSet.forEach((client) => {
                      if (client.readyState === WebSocket.OPEN) {
                        client.send(restartPayload);
                      }
                    });
                  });
                  
                  ws.send(JSON.stringify({ type: 'system_message', message: 'Restart notification sent to all clients' }));
                  break;
                }
                
                default: {
                  // Command Not Implemented Handler
                  const errorMsg = await storage.createChatMessage({
                    conversationId: ws.conversationId,
                    senderId: null,
                    senderName: 'System',
                    senderType: 'system',
                    message: `Command '/${parsedCommand.command}' is not available.\n\nUse /help to see available commands.`,
                    messageType: 'text',
                    isSystemMessage: true,
                  });
                  
                  if (clients) {
                    clients.forEach((client) => {
                      if (client.readyState === WebSocket.OPEN) {
                        client.send(JSON.stringify({ type: 'new_message', message: errorMsg }));
                      }
                    });
                  }
                  break;
                }
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

            // SENTIMENT ANALYSIS: Analyze message sentiment asynchronously (non-blocking)
            (async () => {
              try {
                const { analyzeChatMessageSentiment, updateMessageSentiment } = await import('./services/chatSentimentService');
                
                const sentimentAnalysis = await analyzeChatMessageSentiment(sanitizedMessage, {
                  senderType: payload.senderType,
                  conversationContext: `User: ${displayName} in conversation ${ws.conversationId}`,
                });
                
                // Update message with sentiment data
                await updateMessageSentiment(savedMessage.id, sentimentAnalysis);
                
                // ALERT ROUTING: Emit alert event for support staff if negative/urgent
                if (sentimentAnalysis.shouldEscalate) {
                  console.log(`[ChatSentiment] Alert triggered for message ${savedMessage.id}: ${sentimentAnalysis.sentiment} (urgency: ${sentimentAnalysis.urgencyLevel})`);
                  
                  ChatServerHub.emitSentimentAlert({
                    conversationId: ws.conversationId ?? '',
                    workspaceId: ws.workspaceId || '',
                    messageId: savedMessage.id,
                    userId: ws.userId ?? '',
                    userName: displayName,
                    sentiment: sentimentAnalysis.sentiment,
                    sentimentScore: sentimentAnalysis.sentimentScore,
                    urgencyLevel: sentimentAnalysis.urgencyLevel,
                    messagePreview: sanitizedMessage.substring(0, 150),
                    summary: sentimentAnalysis.summary,
                  }).catch(err => console.error('[ChatSentiment] Failed to emit alert:', err));
                }
              } catch (sentimentError) {
                console.error('[ChatSentiment] Sentiment analysis failed (non-blocking):', sentimentError);
                // Don't throw - sentiment analysis failure shouldn't break chat
              }
            })();

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

            // CHAT SERVER HUB: Emit message_posted event for unified event system
            ChatServerHub.emitMessagePosted({
              conversationId: ws.conversationId,
              roomSlug: ws.conversationId === MAIN_ROOM_ID ? MAIN_ROOM_ID : undefined,
              workspaceId: ws.workspaceId,
              userId: ws.userId,
              userName: displayName,
              messageId: savedMessage.id,
              messagePreview: sanitizedMessage.substring(0, 100),
            }).catch(err => console.error('[ChatServerHub] Failed to emit message_posted:', err));

            // REAL-TIME NOTIFICATIONS: Send toast notifications to users not viewing this chat
            // Get users currently in the conversation to exclude from notifications
            const activeUserIds = new Set<string>();
            if (clients) {
              clients.forEach((client) => {
                if (client.userId && client.readyState === WebSocket.OPEN) {
                  activeUserIds.add(client.userId);
                }
              });
            }
            
            // Get conversation info for notification context
            const notifConversation = ws.conversationId ? await storage.getChatConversation(ws.conversationId) : null;
            
            // Broadcast notification to all notification-subscribed users not in this conversation
            notificationClients.forEach((userClients, notifWorkspaceId) => {
              userClients.forEach((userClient, userId) => {
                // Skip the sender and users currently viewing the conversation
                if (userId === ws.userId || activeUserIds.has(userId)) {
                  return;
                }
                
                // Only notify users in the same workspace (if workspace-scoped)
                if (ws.workspaceId && ws.workspaceId !== notifWorkspaceId) {
                  return;
                }
                
                if (userClient.readyState === WebSocket.OPEN) {
                  try {
                    userClient.send(JSON.stringify({
                      type: 'new_chatroom_message',
                      chatroomId: ws.conversationId,
                      chatroomName: notifConversation?.subject || 'Chat',
                      senderName: displayName,
                      messagePreview: sanitizedMessage.substring(0, 50) + (sanitizedMessage.length > 50 ? '...' : ''),
                      timestamp: new Date().toISOString(),
                    }));
                    console.log(`💬 Chat notification sent to user ${userId}`);
                  } catch (err) {
                    console.error('[ChatNotification] Failed to send notification:', err);
                  }
                }
              });
            });

            // GEMINI Q&A BOT: Intelligent responses using Gemini 2.0 Flash
            const { shouldBotRespond, getAiResponse } = await import('./services/geminiQABot');
            
            if (ws.conversationId === MAIN_ROOM_ID && shouldBotRespond(payload.message)) {
              try {
                // Determine if user is staff (subscriber)
                const botPlatformRole = await storage.getUserPlatformRole(ws.userId) || undefined;
                const isSubscriber = hasPlatformWideAccess(botPlatformRole);
                
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
                    senderId: CHAT_SERVER_CONFIG.helpai.userId,
                    senderName: CHAT_SERVER_CONFIG.helpai.name,
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
            const kickerRole = await storage.getUserPlatformRole(ws.userId).catch(() => null) ?? undefined;
            const canKick = hasPlatformWideAccess(kickerRole);
            
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

            // Find the target user's connection (real users only - no simulated users)
            const clients = conversationClients.get(ws.conversationId);
            if (!clients) return;

            let targetClient: WebSocketClient | null = null;
            let targetUserName = 'User';

            for (const client of Array.from(clients)) {
              if (client.userId === payload.targetUserId) {
                targetClient = client;
                targetUserName = client.userName || 'User';
                break;
              }
            }

            // User not found - provide helpful error message
            if (!targetClient) {
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

            // Get target user name from database (no simulated users)
            if (!targetClient && payload.targetUserId) {
              try {
                const targetInfo = await storage.getUserDisplayInfo(payload.targetUserId);
                if (targetInfo) {
                  targetUserName = formatUserDisplayName({
                    firstName: targetInfo.firstName,
                    lastName: targetInfo.lastName,
                    email: targetInfo.email || undefined,
                    platformRole: targetInfo.platformRole || undefined,
                    workspaceRole: targetInfo.workspaceRole || undefined,
                  });
                }
              } catch (err) {
                console.error('Failed to get target user name:', err);
              }
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

            // DISCONNECT the real user (no simulated users - all users are real)
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
            console.log(`[HelpAI] User ${targetUserName} kicked by ${ws.userName} - Reason: ${reason}`);

            // Broadcast updated user list with real users only (+ HelpAI bot from config)
            const realUsers = Array.from(clients)
              .filter(c => c.userId && c.userName)
              .map(c => ({
                id: c.userId!,
                name: c.userName!,
                role: c.workspaceId || 'guest',
                status: c.userStatus || 'online',
                userType: c.userType || 'guest',
              }));

            // Add HelpAI bot from config for main room
            const allUsers = (ws.conversationId === MAIN_ROOM_ID) 
              ? [{
                  id: CHAT_SERVER_CONFIG.helpai.userId,
                  name: CHAT_SERVER_CONFIG.helpai.name,
                  role: 'bot',
                  status: 'online',
                  userType: 'staff'
                }, ...realUsers]
              : realUsers;

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
            const silencerRole = await storage.getUserPlatformRole(ws.userId).catch(() => null) ?? undefined;
            const canSilence = hasPlatformWideAccess(silencerRole);
            
            if (!canSilence) {
              // IRC-STYLE COMMAND ACKNOWLEDGMENT - Permission denied
              if (ws.readyState === WebSocket.OPEN) {
                ws.send(JSON.stringify({
                  type: 'command_ack',
                  commandId: payload.commandId,
                  action: 'silence_user',
                  success: false,
                  message: 'Permission denied - Staff role required',
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
                  message: 'Conversation not found',
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
              `${targetUserName} has been silenced for ${duration} minutes by ${ws.userName}. Reason: ${reason}`
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

            console.log(`[HelpAI] ${targetUserName} silenced by ${ws.userName} for ${duration} minutes - Reason: ${reason}`);

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
            const voiceStaffRole = await storage.getUserPlatformRole(ws.userId).catch(() => null) ?? undefined;
            const canGiveVoice = hasPlatformWideAccess(voiceStaffRole);
            
            if (!canGiveVoice) {
              // IRC-STYLE COMMAND ACKNOWLEDGMENT - Permission denied
              if (ws.readyState === WebSocket.OPEN) {
                ws.send(JSON.stringify({
                  type: 'command_ack',
                  commandId: payload.commandId,
                  action: 'give_voice',
                  success: false,
                  message: 'Permission denied - Staff role required',
                  errorType: 'PERMISSION_DENIED',
                }));
              }

              // Log failed attempt to AuditOS™
              try {
                const voiceStaffInfo = await storage.getUserDisplayInfo(ws.userId);
                await storage.createAuditLog({
                  commandId: payload.commandId || null,
                  userId: ws.userId,
                  userEmail: voiceStaffInfo?.email || ws.userName || 'unknown',
                  userRole: voiceStaffRole || 'unknown',
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
                  message: 'Conversation not found',
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
                userRole: voiceStaffRole || 'unknown',
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
            // SECURITY: Require session authentication - no client-supplied IDs
            
            // Must have server-authenticated identity
            if (!ws.serverAuth) {
              ws.send(JSON.stringify({
                type: 'error',
                message: 'Authentication required. Please log in first.',
              }));
              console.warn(`[Shifts] Rejected unauthenticated shift subscription from ${ws.ipAddress}`);
              return;
            }
            
            // SECURITY: Guests cannot subscribe to shift updates
            if (ws.serverAuth.userId.startsWith('guest-')) {
              ws.send(JSON.stringify({
                type: 'error',
                message: 'Guests cannot subscribe to shift updates.',
              }));
              console.warn(`[Shifts] Rejected guest shift subscription from ${ws.ipAddress}`);
              return;
            }
            
            const userId = ws.serverAuth.userId;
            const workspaceId = ws.serverAuth.workspaceId;
            const platformRole = ws.serverAuth.platformRole;
            
            // SECURITY: Require workspace context for shift updates
            // Staff can receive updates for any workspace they specify (if implemented)
            // Regular users must have workspace in session
            const isStaff = hasPlatformWideAccess(platformRole);
            if (!workspaceId) {
              if (isStaff) {
                // Staff without workspace context get platform-wide access (logged for audit)
                console.log(`[Shifts] Staff ${userId} (${platformRole}) accessing shifts without workspace context`);
              } else {
                ws.send(JSON.stringify({
                  type: 'error',
                  message: 'Your session lacks workspace context. Please refresh and try again.',
                }));
                console.warn(`[Shifts] User ${userId} rejected - no workspace in session`);
                return;
              }
            }

            // Add to shift update clients for this workspace (or undefined for staff platform access)
            const effectiveWorkspaceId = workspaceId || 'platform-staff';
            if (!shiftUpdateClients.has(effectiveWorkspaceId)) {
              shiftUpdateClients.set(effectiveWorkspaceId, new Set());
            }
            shiftUpdateClients.get(effectiveWorkspaceId)!.add(ws);

            console.log(`✅ User ${userId} subscribed to shift updates for workspace ${workspaceId || 'platform-wide (staff)'}`);

            // Send confirmation
            ws.send(JSON.stringify({
              type: 'shift_updates_subscribed',
              workspaceId: workspaceId,
            }));
            break;
          }

          case 'join_notifications': {
            // Subscribe to real-time notifications for a user
            // SECURITY: Require session authentication - no fallback to other sources
            
            // Must have server-authenticated identity from HTTP session
            if (!ws.serverAuth) {
              ws.send(JSON.stringify({
                type: 'error',
                message: 'Authentication required. Please log in first.',
              }));
              console.warn(`[Notifications] Rejected unauthenticated subscription attempt from ${ws.ipAddress}`);
              return;
            }
            
            // SECURITY: Guests cannot subscribe to notifications (they shouldn't receive workspace data)
            if (ws.serverAuth.userId.startsWith('guest-')) {
              ws.send(JSON.stringify({
                type: 'error',
                message: 'Guests cannot subscribe to notifications.',
              }));
              console.warn(`[Notifications] Rejected guest notification subscription from ${ws.ipAddress}`);
              return;
            }
            
            // Use authenticated credentials only from session
            const userId = ws.serverAuth.userId;
            const workspaceId = ws.serverAuth.workspaceId;
            const platformRole = ws.serverAuth.platformRole;
            
            // SECURITY: Non-staff users require workspace context
            // Staff can receive platform-wide notifications without workspace
            const isStaff = hasPlatformWideAccess(platformRole);
            if (!isStaff && !workspaceId) {
              ws.send(JSON.stringify({
                type: 'error',
                message: 'Your session lacks workspace context. Please refresh and try again.',
              }));
              console.warn(`[Notifications] User ${userId} rejected - no workspace in session`);
              return;
            }
            
            // Normalize workspace key for platform staff - use PLATFORM_WORKSPACE_ID
            // This ensures platform staff are stored under the same key that platform notifications broadcast to
            const effectiveWorkspaceId = (!workspaceId && hasPlatformWideAccess(platformRole))
              ? PLATFORM_WORKSPACE_ID
              : workspaceId;
            
            console.log(`[Notifications] Authenticated subscription for ${userId} in workspace ${effectiveWorkspaceId || 'unknown'} (platform role: ${platformRole || 'none'})`);

            // Add to notification clients for this workspace/user combination
            if (!notificationClients.has(effectiveWorkspaceId)) {
              notificationClients.set(effectiveWorkspaceId, new Map());
            }
            notificationClients.get(effectiveWorkspaceId)!.set(userId, ws);

            // Get initial unread count (use effectiveWorkspaceId for consistency)
            const unreadCount = await storage.getUnreadNotificationCount(userId, effectiveWorkspaceId);

            console.log(`✅ User ${userId} subscribed to notifications for workspace ${effectiveWorkspaceId} (${unreadCount} unread)`);

            // Send confirmation with current unread count
            ws.send(JSON.stringify({
              type: 'notifications_subscribed',
              workspaceId: effectiveWorkspaceId,
              unreadCount,
            }));
            break;
          }

          case 'ban_user': {
            // Permanently ban a user from chat (platform staff only)
            if (!ws.conversationId || !ws.userId) {
              return;
            }

            // Check if user has staff permissions using centralized hasPlatformWideAccess
            const staffInfo = await storage.getUserDisplayInfo(ws.userId);
            const isBanStaff = hasPlatformWideAccess(staffInfo?.platformRole ?? undefined);
            
            if (!isBanStaff) {
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
            bannedUsers.add(payload.targetUserId);

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
      
      // Send leave announcement for main helpdesk room
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

  // NOTE: Chat simulation removed - system uses only live data from database with real users
  // All user data now comes from storage.getUserDisplayInfo() for consistency

  console.log('WebSocket server initialized on /ws/chat');
  
  // Export broadcast function for shift updates
  const broadcaster = {
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

      let sanitizedNotification = undefined;
      
      if (updateType === 'notification_count_updated' && notification) {
        sanitizedNotification = {
          type: notification.type,
          counts: notification.counts,
          source: notification.source,
        };
      } else if (notification) {
        const metadata = notification.metadata || {};
        sanitizedNotification = {
          id: notification.id,
          type: notification.type,
          title: notification.title,
          message: notification.message,
          isRead: notification.isRead,
          actionUrl: notification.actionUrl,
          createdAt: notification.createdAt,
          detailedCategory: metadata.detailedCategory || notification.detailedCategory,
          sourceType: metadata.sourceType || notification.sourceType,
          sourceName: metadata.sourceName || notification.sourceName,
          endUserSummary: metadata.endUserSummary || notification.endUserSummary,
          brokenDescription: metadata.brokenDescription || notification.brokenDescription,
          impactDescription: metadata.impactDescription || notification.impactDescription,
          badge: metadata.badge || notification.badge,
          category: metadata.category || notification.category,
        };
      }

      const payload = JSON.stringify({
        type: updateType,
        notification: sanitizedNotification,
        unreadCount,
        timestamp: new Date().toISOString(),
      });

      console.log(`🔔 Broadcasting ${updateType} to user ${userId} in workspace ${workspaceId} (count: ${unreadCount})`);

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
    // Platform-wide broadcast for What's New and announcements
    broadcastPlatformUpdate: (update: {
      type: 'platform_update' | 'whats_new' | 'announcement';
      category: 'feature' | 'improvement' | 'bugfix' | 'security' | 'announcement';
      title: string;
      description: string;
      version?: string;
      priority?: number;
      learnMoreUrl?: string;
      metadata?: any;
      // Enhanced fields for end-user display
      detailedCategory?: string;
      sourceType?: string;
      sourceName?: string;
      endUserSummary?: string;
      brokenDescription?: string;
      impactDescription?: string;
      badge?: string;
    }) => {
      // Extract enhanced metadata for live display
      const enhancedMetadata = update.metadata || {};
      const payload = JSON.stringify({
        type: 'platform_update',
        update: {
          ...update,
          isNew: true,
          // Ensure enhanced fields are included at top level for frontend consumption
          detailedCategory: update.detailedCategory || enhancedMetadata.detailedCategory,
          sourceType: update.sourceType || enhancedMetadata.sourceType,
          sourceName: update.sourceName || enhancedMetadata.sourceName,
          endUserSummary: update.endUserSummary || enhancedMetadata.endUserSummary,
          brokenDescription: update.brokenDescription || enhancedMetadata.brokenDescription,
          impactDescription: update.impactDescription || enhancedMetadata.impactDescription,
          badge: update.badge || enhancedMetadata.badge,
        },
        timestamp: new Date().toISOString(),
      });

      console.log(`[WebSocket] Broadcasting platform update: ${update.title}`);

      // Broadcast to all chat clients (all conversations)
      let clientCount = 0;
      conversationClients.forEach((clients, conversationId) => {
        clients.forEach((client) => {
          if (client.readyState === WebSocket.OPEN) {
            client.send(payload);
            clientCount++;
          }
        });
      });

      // Also broadcast to notification clients
      notificationClients.forEach((userClients, workspaceId) => {
        userClients.forEach((client, userId) => {
          if (client.readyState === WebSocket.OPEN) {
            client.send(payload);
            clientCount++;
          }
        });
      });

      console.log(`[WebSocket] Platform update sent to ${clientCount} clients`);
    },
  };

  // Initialize global broadcaster for use by other services (e.g., platformChangeMonitor)
  setGlobalBroadcaster(broadcaster);
  console.log('[WebSocket] Global broadcaster initialized');

  return broadcaster;
}
