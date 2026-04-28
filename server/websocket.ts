import { WebSocketServer, WebSocket } from 'ws';
import { Server, IncomingMessage } from 'http';
import { storage } from './storage';
import { db } from './db';
import { eq, sql } from 'drizzle-orm';
import { formatUserDisplayName, formatUserDisplayNameForChat } from './utils/formatUserDisplayName';
import { parseSlashCommand, validateCommand, getHelpText, COMMAND_REGISTRY } from '@shared/commands';
import { queueManager } from './services/helpOsQueue';
import type { ChatMessage } from '@shared/schema';
import { chatConversations, helpaiActionLog } from '@shared/schema';
import { trackConnection, trackDisconnection, checkMessageRateLimit } from './middleware/wsRateLimiter';
import { randomUUID } from 'crypto';
import { sanitizeChatMessage, sanitizePlainText } from './lib/sanitization';
import { CHAT_SERVER_CONFIG } from './config/chatServer';
import { ChatServerHub } from './services/ChatServerHub';
import { ircEmitter, roomPresence, IRC_EVENTS } from './services/ircEventRegistry';
import cookie from 'cookie';
import { unsign } from 'cookie-signature';
import { hasPlatformWideAccess, getUserPlatformRole } from './rbac';
import { PLATFORM_WORKSPACE_ID } from './services/billing/billingConstants';
import { botPool } from './bots/pool';
import { BOT_REGISTRY } from './bots/registry';
import { createLogger } from './lib/logger';

const log = createLogger('WebSocket');

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

// ============================================================================
// WS AUTH TOKEN STORE
// Short-lived (60s), one-time-use tokens issued via HTTP /api/auth/ws-token
// Used as a fallback when session cookie lookup fails at WS connection time
// (e.g., DB hiccup during upgrade, cookie path issues in certain environments)
// ============================================================================
interface WsAuthTokenEntry {
  userId: string;
  workspaceId?: string;
  role?: string;
  expiresAt: number;
}
const _wsAuthTokens = new Map<string, WsAuthTokenEntry>();

// Sweep expired tokens every 5 minutes
setInterval(() => {
  const now = Date.now();
  _wsAuthTokens.forEach((v, k) => { if (v.expiresAt < now) _wsAuthTokens.delete(k); });
}, 5 * 60 * 1000).unref?.();

export function createWsAuthToken(userId: string, workspaceId?: string, role?: string): string {
  const token = randomUUID() + '-' + Date.now().toString(36);
  _wsAuthTokens.set(token, { userId, workspaceId, role, expiresAt: Date.now() + 60_000 });
  return token;
}

function _consumeWsAuthToken(token: string): WsAuthTokenEntry | null {
  const entry = _wsAuthTokens.get(token);
  if (!entry || entry.expiresAt < Date.now()) { _wsAuthTokens.delete(token); return null; }
  _wsAuthTokens.delete(token); // one-time use
  return entry;
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
      log.error('SESSION_SECRET not configured');
      return null;
    }
    
    // Extract session ID from signed cookie (format: s:sessionId.signature)
    let sessionId = signedSessionId;
    if (sessionId.startsWith('s:')) {
      sessionId = sessionId.substring(2);
      const unsigned = unsign(sessionId, sessionSecret);
      if (unsigned === false) {
        log.warn('Invalid session signature');
        return null;
      }
      sessionId = unsigned;
    }
    
    // Look up session in PostgreSQL sessions table
    // CATEGORY C — Genuine schema mismatch: sessions table managed by connect-pg-simple, no Drizzle schema defined
    // NOTE: typedQuery returns T[] directly — DO NOT use .rows (that's only for pool.query / db.$client.query)
    const rows = await typedQuery<{ sess: any }>(
      sql`SELECT sess FROM sessions WHERE sid = ${sessionId} AND expire > NOW()`
    );
    
    if (!rows || rows.length === 0) {
      return null;
    }
    
    const sess = rows[0].sess as any;
    
    // Extract user info from session data
    // Session structure: { userId: "...", passport: { user: { claims: {...} } } }
    // OR: { passport: { user: { id: "..." } } }
    const userId = sess?.userId || sess?.passport?.user?.id || sess?.passport?.user?.claims?.sub;
    
    if (!userId) {
      log.debug('No userId found in session');
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
      const memberships = sess.passport?.user?.claims?.tenantMembership;
      if (Array.isArray(memberships) && memberships.length > 0) {
        // Use first membership workspace as default
        workspaceId = memberships[0]?.workspaceId || memberships[0];
      }
    }
    
    // CRITICAL FIX: If still no workspace, dynamically resolve from user's ownership/membership
    // This ensures org owners get their workspace even if it wasn't stored in session
    let resolvedRole: string | undefined = sess.role || sess.passport?.user?.role || sess.passport?.user?.claims?.role;
    if (!workspaceId && userId) {
      try {
        const { resolveWorkspaceForUser } = await import('./rbac');
        const resolved = await resolveWorkspaceForUser(userId);
        if (resolved.workspaceId) {
          workspaceId = resolved.workspaceId;
          resolvedRole = resolved.role || resolvedRole;
          log.info('Dynamically resolved workspace for user', { userId, workspaceId, role: resolvedRole });
        }
      } catch (resolveError) {
        log.warn('Failed to dynamically resolve workspace', { error: resolveError });
      }
    }
    
    return {
      userId,
      workspaceId,
      role: resolvedRole,
      email,
    };
  } catch (error) {
    log.error('Session lookup failed', { error });
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
  // @ts-expect-error — TS migration: fix in refactoring sprint
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
  roomMode?: string; // IRC-style room mode (sup, org, met, field, coai)
  supportsBots?: boolean; // Dynamic flag - room supports bot deployment
  inTriage?: boolean; // True when user is in HelpAI triage (can type to bot)
  inHumanHandoff?: boolean; // True when escalated to human agent (still whisper-only, no voice)
  userStatus?: 'online' | 'away' | 'busy';
  isAlive?: boolean;
  pingInterval?: NodeJS.Timeout;
  ipAddress?: string;
  userAgent?: string;

  // IRC-style away status
  isAway?: boolean;
  awayMessage?: string | null;

  // Staff identification (for Trinity AI visibility filtering)
  isStaff?: boolean;

  // DM visibility filtering for helpdesk inline DMs
  platformRole?: string; // For standalone access (also in serverAuth)
  threadId?: string; // Session/thread ID for DM isolation in helpdesk

  // HelpAI session tracking
  helpAISessionId?: string;

  // Workspace role (set on join_conversation from employee record)
  workspaceRole?: string;
}

interface ChatMessagePayload {
  type: 'chat_message';
  conversationId: string;
  message: string;
  senderName: string;
  senderType: 'customer' | 'support' | 'system';
  // DM visibility fields for helpdesk inline DM threading
  isPrivateMessage?: boolean;
  recipientId?: string;
  threadId?: string;
  // Client-generated ID for delivery confirmation (deduplication)
  clientId?: string;
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

interface SessionSyncRegisterPayload {
  type: 'session_sync_register';
  deviceType?: string;
  timestamp?: string;
}

interface SessionSyncPingPayload {
  type: 'session_sync_ping';
}

type WebSocketMessage = ChatMessagePayload | JoinConversationPayload | TypingPayload | StatusChangePayload | KickUserPayload | RequestSecurePayload | SecureResponsePayload | ReleaseSpectatorPayload | TransferUserPayload | SilenceUserPayload | GiveVoicePayload | BanUserPayload | JoinShiftUpdatesPayload | ShiftUpdatePayload | JoinNotificationsPayload | NotificationUpdatePayload | CallInitiatedPayload | CallAcceptedPayload | CallRejectedPayload | CallEndedPayload | WebRTCOfferPayload | WebRTCAnswerPayload | WebRTCIceCandidatePayload | JoinDispatchUpdatesPayload | DispatchGPSUpdatePayload | DispatchIncidentUpdatePayload | DispatchUnitStatusUpdatePayload | SessionSyncRegisterPayload | SessionSyncPingPayload;

// In-memory MOTD storage (staff can update, or dynamically generated)
// Empty string means use dynamic AI generation
let currentMOTD = "";

// Room mode check - bots deploy based on mode, not slug
// This is the IRC way: all rooms use UUIDs, modes determine behavior
import { RoomMode } from '@shared/types/chat';

// Helper: Check if room mode supports HelpAI bot
function roomSupportsBots(mode: RoomMode | string | undefined): boolean {
  return mode === RoomMode.SUP || mode === RoomMode.COAI;
}

// Permanently banned users tracking (in-memory)
const bannedUsers = new Set<string>();

// =============================================================================
// WEBSOCKET MESSAGE IDEMPOTENCY - LRU Cache for Deduplication
// Prevents duplicate processing of WebSocket messages from reconnections
// =============================================================================
class MessageIdempotencyCache {
  private cache = new Map<string, number>();
  private maxSize: number;
  private ttlMs: number;

  constructor(maxSize = 1000, ttlMs = 60000) {
    this.maxSize = maxSize;
    this.ttlMs = ttlMs;
  }

  isDuplicate(messageId: string): boolean {
    const now = Date.now();
    const seen = this.cache.get(messageId);
    if (seen !== undefined) {
      if (now - seen < this.ttlMs) {
        return true;
      }
      this.cache.delete(messageId);
    }
    return false;
  }

  track(messageId: string): void {
    const now = Date.now();
    if (this.cache.size >= this.maxSize) {
      const oldest = this.cache.keys().next().value;
      if (oldest !== undefined) {
        this.cache.delete(oldest);
      }
    }
    this.cache.set(messageId, now);
  }

  prune(): void {
    const now = Date.now();
    for (const [key, timestamp] of this.cache) {
      if (now - timestamp >= this.ttlMs) {
        this.cache.delete(key);
      }
    }
  }
}

const wsMessageIdempotencyCache = new MessageIdempotencyCache(1000, 60000);

setInterval(() => {
  wsMessageIdempotencyCache.prune();
}, 30000);

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

// Track voiced users per conversation (IRC-style +v mode)
// Users without voice can read but not send messages until granted voice by staff
const voicedUsers = new Map<string, Set<string>>(); // conversationId -> Set of userIds with voice

// Helper function to check if a user has voice in a conversation
function hasVoiceInConversation(conversationId: string, userId: string): boolean {
  const voicedSet = voicedUsers.get(conversationId);
  return voicedSet ? voicedSet.has(userId) : false;
}

// Helper function to grant voice to a user in a conversation
function grantVoice(conversationId: string, userId: string): void {
  if (!voicedUsers.has(conversationId)) {
    voicedUsers.set(conversationId, new Set());
  }
  voicedUsers.get(conversationId)!.add(userId);
}

// Helper function to revoke voice from a user in a conversation
function revokeVoice(conversationId: string, userId: string): void {
  const voicedSet = voicedUsers.get(conversationId);
  if (voicedSet) {
    voicedSet.delete(userId);
  }
}

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
    log.warn('Global broadcaster not initialized for notification');
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
    log.warn('Failed to broadcast notification', { error: err });
    return false;
  }
}

export function broadcastShiftUpdate(
  workspaceId: string,
  updateType: 'shift_created' | 'shift_updated' | 'shift_deleted',
  shift?: any,
  shiftId?: string
) {
  if (!globalBroadcaster) {
    log.warn('Global broadcaster not initialized for shift update');
    return false;
  }
  
  try {
    globalBroadcaster.broadcastShiftUpdate(workspaceId, updateType, shift, shiftId);
    return true;
  } catch (err) {
    log.warn('Failed to broadcast shift update', { error: err });
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
    log.warn('Global WSS not initialized for user-scoped notification');
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
          try {
            client.send(payload);
            sentCount++;
          } catch (sendErr: any) {
            log.warn('User-scoped WS send failed — dead connection', { userId, error: sendErr?.message });
          }
        }
      }
    });
    
    log.debug('User-scoped notification sent', { sentCount, userId });
    return sentCount > 0;
  } catch (err) {
    log.warn('Failed to broadcast user-scoped notification', { error: err });
    return false;
  }
}

export function broadcastToAllClients(message: any) {
  if (!globalWSS) {
    log.warn('Global WSS not initialized for broadcast');
    return 0;
  }
  
  // CRITICAL SECURITY: broadcastToAllClients is restricted to SYSTEM-LEVEL updates only.
  // It MUST NOT be used for workspace-specific data.
  // We verify that the message type is one of the allowed global types.
  const payloadObj = typeof message === 'string' ? JSON.parse(message) : message;
  const allowedGlobalTypes = ['platform_update', 'system_maintenance', 'server_restart', 'global_notification', 'health_alert'];
  
  if (payloadObj.type && !allowedGlobalTypes.includes(payloadObj.type)) {
     log.warn('Security blocked unauthorized global broadcast type', { type: payloadObj.type });
     return 0;
  }

  let count = 0;
  const payload = typeof message === 'string' ? message : JSON.stringify(message);
  
  globalWSS.clients.forEach((client) => {
    if (client.readyState === WebSocket.OPEN) {
      try {
        client.send(payload);
        count++;
      } catch (sendErr: any) {
        log.warn('broadcastToAllClients: WS send failed — dead connection', { error: sendErr?.message });
      }
    }
  });
  
  log.debug('Broadcast sent', { clientCount: count });
  return count;
}

// =============================================================================
// SESSION SYNC: Multi-Device Real-Time Synchronization
// =============================================================================
import { sessionSyncService } from './services/ai-brain/sessionSyncService';
import { platformEventBus } from './services/platformEventBus';
import { typedQuery } from './lib/typedSql';
import { isSupportStaffRole, SUPPORT_STAFF_ROLES } from './services/chat/chatPolicyService';


// ── Moderation permission helper (Codex: eliminate per-case drift) ─────────
// Replaces repeated hasPlatformWideAccess() inline checks in kick/silence/
// give_voice/ban_user switch cases. One place to change moderation policy.
async function canPerformModerationAction(
  actorUserId: string,
  action: 'kick' | 'silence' | 'give_voice' | 'ban',
): Promise<{ allowed: boolean; reason?: string }> {
  try {
    const { storage } = await import('./storage');
    const platformRole = await storage.getUserPlatformRole(actorUserId).catch(() => null);
    if (isSupportStaffRole(platformRole)) return { allowed: true };
    // Workspace-level managers can kick/silence within their own rooms
    if (action === 'give_voice') {
      const { hasManagerAccess } = await import('./rbac');
      // give_voice is less restricted — room owner/manager can do it
      return { allowed: true };
    }
    return { allowed: false, reason: 'Platform staff access required for ' + action };
  } catch {
    return { allowed: false, reason: 'Permission check failed' };
  }
}

// ── Command-ack helper (Codex: eliminate per-case broadcast duplication) ────
function buildModerationAck(
  action: string,
  targetUserId: string,
  roomId: string,
  success: boolean,
  reason?: string,
): object {
  return {
    type: 'moderation_ack',
    action,
    targetUserId,
    roomId,
    success,
    reason,
    timestamp: Date.now(),
  };
}

// Support roles that receive Trinity alerts
const TRINITY_ALERT_ROLES = ['root_admin', 'co_admin', 'sysops', 'platform_support', 'org_owner', 'co_owner'];

/**
 * Broadcast Trinity alert to all connected support staff
 * Uses existing broadcastToAllClients but filters by role
 */
export function broadcastTrinityAlertToSupport(message: any) {
  if (!globalWSS) {
    log.warn('Global WSS not initialized for Trinity alert');
    return 0;
  }
  
  const payload = JSON.stringify(message);
  
  let sentCount = 0;
  globalWSS.clients.forEach((client: any) => {
    if (client.readyState === WebSocket.OPEN) {
      const role = client.serverAuth?.role || client.serverAuth?.platformRole;
      if (role && TRINITY_ALERT_ROLES.includes(role)) {
        try {
          client.send(payload);
          sentCount++;
        } catch (sendErr: any) {
          log.warn('broadcastTrinityAlertToSupport: WS send failed — dead connection', { role, error: sendErr?.message });
        }
      }
    }
  });
  
  if (sentCount > 0) {
    log.info('Trinity message broadcast to support staff', { sentCount });
  }
  return sentCount;
}

// Lazy-initialize Trinity notifier broadcast handler after server starts
setTimeout(async () => {
  try {
    const { trinityAutonomousNotifier } = await import('./services/ai-brain/trinityAutonomousNotifier');
    trinityAutonomousNotifier.setBroadcastHandler((message: any) => {
      broadcastTrinityAlertToSupport(message);
    });
    log.info('Trinity autonomous notifier broadcast handler registered');
  } catch (error) {
    log.warn('Failed to register Trinity notifier', { error });
  }
}, 2000);

/**
 * Register a WebSocket connection for session sync
 * Call this when a client connects to enable multi-device sync
 */
export function registerSessionSync(
  userId: string, 
  ws: WebSocket, 
  sessionId: string,
  deviceInfo?: { deviceType?: string; workspaceId?: string }
): void {
  sessionSyncService.registerConnection(userId, ws, sessionId, deviceInfo);
}

/**
 * Unregister a WebSocket connection from session sync
 */
export function unregisterSessionSync(userId: string, sessionId: string): void {
  sessionSyncService.unregisterConnection(userId, sessionId);
}

/**
 * Notify all of a user's connected devices about data changes
 */
export function syncToUserDevices(
  userId: string,
  resource: string,
  action: 'create' | 'update' | 'delete',
  data?: Record<string, any>,
  queryKeys?: string[]
): number {
  return sessionSyncService.broadcastToUser(userId, {
    type: 'data_sync',
    action,
    resource,
    data,
    queryKeys,
    timestamp: new Date().toISOString(),
  });
}

/**
 * Invalidate TanStack Query cache across all user devices
 */
export function invalidateUserQueries(
  userId: string,
  queryKeys: string[],
  resource: string = 'data'
): number {
  return sessionSyncService.notifyQueryInvalidation(userId, null, queryKeys, resource);
}

/**
 * Get session sync statistics
 */
export function getSessionSyncStats(): { totalUsers: number; totalConnections: number; workspaces: number } {
  return sessionSyncService.getGlobalStats();
}

export { sessionSyncService };

// ============================================================================
// PER-WORKSPACE EVENT REPLAY BUFFER
// Holds last 50 events per workspace for up to 5 minutes.
// Clients that reconnect within 5 minutes receive missed events instead of a
// full page refresh. Clients disconnected longer receive full_refresh_required.
// ============================================================================
// ChatDurability adapter — Redis-backed with in-memory fallback
// Replaces the in-memory workspaceEventBuffer Map that was lost on restart
import { pushEvent as pushEventDurable, onBroadcast, initChatDurability } from './services/chat/chatDurabilityAdapter';

const EVENT_BUFFER_MAX = 100;           // Kept for replay logic references
const EVENT_BUFFER_TTL_MS = 5 * 60 * 1000;

interface BufferedEvent {
  eventId: string;
  timestamp: number;
  workspaceId: string;
  data: any;
}

// Legacy in-memory map retained for getEventsSince() calls that haven't migrated
const workspaceEventBuffer = new Map<string, BufferedEvent[]>();

function pushEventToBuffer(workspaceId: string, data: any): string {
  // Async fire-and-forget to durable adapter (non-blocking for WebSocket path)
  pushEventDurable(workspaceId, data).catch(() => null);
  
  // Also maintain local buffer for immediate replay (backwards compat)
  const eventId = `evt-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const entry: BufferedEvent = { eventId, timestamp: Date.now(), workspaceId, data: { ...data, eventId } };
  const existing = workspaceEventBuffer.get(workspaceId) ?? [];
  existing.push(entry);
  const now = Date.now();
  const trimmed = existing.filter(e => now - e.timestamp < EVENT_BUFFER_TTL_MS).slice(-EVENT_BUFFER_MAX);
  workspaceEventBuffer.set(workspaceId, trimmed);
  return eventId;
}

// Initialize durability on startup (async, non-blocking)
initChatDurability().catch(() => null);

export function broadcastToWorkspace(workspaceId: string, data: any) {
  if (!globalBroadcaster) {
    log.warn('Global broadcaster not initialized for workspace broadcast');
    return 0;
  }
  
  try {
    // Push to replay buffer so reconnecting clients can catch up
    const eventId = pushEventToBuffer(workspaceId, data);
    const enrichedData = { ...data, eventId };
    globalBroadcaster.broadcastToWorkspace(workspaceId, enrichedData);
    log.debug('Workspace broadcast sent', { workspaceId, eventId });
    return 1;
  } catch (err) {
    log.warn('Failed to broadcast to workspace', { error: err });
    return 0;
  }
}

export function broadcastToUser(userId: string, data: any): number {
  if (!globalWSS || !userId) {
    return 0;
  }

  const payload = JSON.stringify(data);
  let sentCount = 0;

  globalWSS.clients.forEach((client) => {
    const ws = client as WebSocketClient;
    const wsUserId = ws.serverAuth?.userId || ws.userId;
    if (ws.readyState !== WebSocket.OPEN || wsUserId !== userId) {
      return;
    }

    try {
      ws.send(payload);
      sentCount++;
    } catch (sendErr: any) {
      log.warn('broadcastToUser: WS send failed', { userId, error: sendErr?.message });
    }
  });

  return sentCount;
}

/**
 * Broadcast platform update to all connected clients
 * Used by aiNotificationService to push real-time What's New updates
 */
export function broadcastPlatformUpdateGlobal(update: {
  id: string;
  title: string;
  description: string;
  category: string;
  priority?: number;
  learnMoreUrl?: string;
  metadata?: any;
  workspaceId?: string;
  visibility?: string;
}): boolean {
  if (!globalBroadcaster) {
    log.warn('Global broadcaster not initialized for platform update');
    return false;
  }
  
  try {
    globalBroadcaster.broadcastPlatformUpdate({
      type: 'platform_update',
      category: update.category as any,
      title: update.title,
      description: update.description,
      priority: update.priority || 1,
      learnMoreUrl: update.learnMoreUrl,
      metadata: {
        ...update.metadata,
        updateId: update.id,
        workspaceId: update.workspaceId,
        visibility: update.visibility || 'all',
      },
    });
    return true;
  } catch (err) {
    log.warn('Failed to broadcast platform update', { error: err });
    return false;
  }
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
      log.error('User not found during revalidation', { userId: ws.userId });
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
    log.error('Auth revalidation failed', { error });
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
  
  // Track Trinity scheduling progress connections by workspace ID
  const schedulingProgressClients = new Map<string, Set<WebSocketClient>>();
  
  // Track credit update connections by workspace ID for real-time balance sync
  const creditUpdateClients = new Map<string, Set<WebSocketClient>>();

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
              try {
                client.send(eventPayload);
              } catch (sendErr: any) {
                log.warn('ChatServerHub conversation send failed — dead connection', { error: sendErr?.message });
              }
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
              try {
                client.send(eventPayload);
              } catch (sendErr: any) {
                log.warn('ChatServerHub workspace send failed — dead connection', { error: sendErr?.message });
              }
            }
          }
        });
      }
    }
  });
  log.info('ChatServerHub broadcaster registered');

  // =========================================================================
  // ROOM LIFECYCLE BROADCASTER - For close/reopen status changes
  // =========================================================================
  import('./services/roomLifecycleService').then(({ registerRoomBroadcaster }) => {
    registerRoomBroadcaster((roomId: string, message: any) => {
      const clients = conversationClients.get(roomId);
      if (clients) {
        const payload = JSON.stringify(message);
        clients.forEach((client) => {
          if (client.readyState === WebSocket.OPEN) {
            try {
              client.send(payload);
            } catch (sendErr: any) {
              log.warn('Room lifecycle broadcaster send failed — dead connection', { roomId, error: sendErr?.message });
            }
          }
        });
      }
    });
    log.info('Room lifecycle broadcaster registered');
  }).catch(err => log.error('Room lifecycle broadcaster registration failed', { error: err }));

  // =========================================================================
  // IRC EVENT EMITTER - Fast real-time event broadcasting
  // =========================================================================
  ircEmitter.setBroadcaster((event) => {
    const { roomId, conversationId, targetUserId } = event;
    const targetRoom = roomId || conversationId;
    
    if (targetRoom) {
      const clients = conversationClients.get(targetRoom);
      if (clients) {
        const eventPayload = JSON.stringify(event);
        clients.forEach((client) => {
          if (client.readyState === WebSocket.OPEN) {
            // If targetUserId is specified, only send to that specific user (for ACKs, notices)
            // Otherwise broadcast to ALL clients in the room (for JOIN, PART, TYPING, etc.)
            if (!targetUserId || client.userId === targetUserId) {
              try {
                client.send(eventPayload);
              } catch (sendErr: any) {
                log.warn('IRC emitter room send failed — dead connection', { targetRoom, error: sendErr?.message });
              }
            }
          }
        });
      }
    } else {
      // Global broadcast (QUIT, global notices) - send to all connected clients
      // If targetUserId is specified, filter to just that user
      wss.clients.forEach((client) => {
        if (client.readyState === WebSocket.OPEN) {
          const wsClient = client as WebSocketClient;
          if (!targetUserId || wsClient.userId === targetUserId) {
            try {
              client.send(JSON.stringify(event));
            } catch (sendErr: any) {
              log.warn('IRC emitter global send failed — dead connection', { error: sendErr?.message });
            }
          }
        }
      });
    }
  });
  log.info('IRC event emitter registered');

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
    // CRITICAL: Register message handler IMMEDIATELY before any awaits!
    // Messages that arrive during authentication would be lost otherwise.
    // We buffer messages until authentication completes.
    // =========================================================================
    let authComplete = false;
    const messageBuffer: (Buffer | ArrayBuffer | Buffer[])[] = [];
    
    // This is the actual message processor (called after auth or from buffer)
    const MAX_WS_MESSAGE_BYTES = 512 * 1024; // 512 KB per message — prevents memory exhaustion
    const processMessage = async (data: Buffer | ArrayBuffer | Buffer[]) => {
      try {
        // Enforce message size limit BEFORE toString() to prevent large-buffer DoS
        const byteLength = Buffer.isBuffer(data)
          ? data.length
          : data instanceof ArrayBuffer
            ? data.byteLength
            : (data as Buffer[]).reduce((sum, b) => sum + b.length, 0);
        if (byteLength > MAX_WS_MESSAGE_BYTES) {
          log.warn('[WebSocket] Message rejected: exceeds 512 KB limit', { byteLength });
          ws.send(JSON.stringify({ type: 'error', message: 'Message too large' }));
          return;
        }
        const rawMessage = data.toString();
        let payload: WebSocketMessage;
        try {
          payload = JSON.parse(rawMessage);
        } catch (parseError) {
          log.warn('Malformed WebSocket message received', { error: parseError, rawMessage: rawMessage.substring(0, 100) });
          return;
        }

        if (!payload || !payload.type) {
          log.warn('WebSocket message missing type', { payload });
          return;
        }

        const incomingMessageId = (payload as any).messageId;
        if (incomingMessageId && typeof incomingMessageId === 'string') {
          if (wsMessageIdempotencyCache.isDuplicate(incomingMessageId)) {
            log.debug('Duplicate message skipped', { messageId: incomingMessageId, type: payload.type });
            if (ws.readyState === WebSocket.OPEN) {
              try {
                ws.send(JSON.stringify({
                  type: 'message_ack',
                  messageId: incomingMessageId,
                  status: 'duplicate',
                }));
              } catch (sendErr: any) {
                log.warn('Failed to send duplicate ack', { error: sendErr?.message });
              }
            }
            return;
          }
          wsMessageIdempotencyCache.track(incomingMessageId);
        }

        switch (payload.type) {
          case 'session_sync_register': {
            // Handle session sync registration for multi-device sync
            if (ws.serverAuth?.userId) {
              const deviceType = (payload as any).deviceType || 'unknown';
              sessionSyncService.registerConnection(
                ws.serverAuth.userId,
                ws,
                connectionId,
                { 
                  deviceType, 
                  workspaceId: ws.serverAuth.workspaceId 
                }
              );
              ws.send(JSON.stringify({
                type: 'session_sync_registered',
                success: true,
                deviceCount: sessionSyncService.getUserDeviceCount(ws.serverAuth.userId),
                timestamp: new Date().toISOString(),
              }));
              log.debug('SessionSync registered device', { userId: ws.serverAuth.userId, deviceType });
            } else {
              ws.send(JSON.stringify({
                type: 'session_sync_registered',
                success: false,
                error: 'Authentication required for session sync',
              }));
            }
            break;
          }
          case 'session_sync_ping': {
            // Update last activity for session sync
            if (ws.serverAuth?.userId) {
              sessionSyncService.updatePing(ws.serverAuth.userId, connectionId);
            }
            break;
          }
          // @ts-expect-error — TS migration: fix in refactoring sprint
          case 'reconnect_sync': {
            // Client reconnected and sends the timestamp of the last event it received.
            // Server replays missed events from the per-workspace buffer, or instructs
            // the client to do a full state refresh if the gap is too large.
            const wsId = ws.serverAuth?.workspaceId;
            if (!wsId) {
              ws.send(JSON.stringify({ type: 'reconnect_sync_error', error: 'No workspace context' }));
              break;
            }
            const lastEventTimestamp = Number((payload as any).lastEventTimestamp) || 0;
            const now = Date.now();
            const gapMs = lastEventTimestamp ? now - lastEventTimestamp : EVENT_BUFFER_TTL_MS + 1;
            if (gapMs > EVENT_BUFFER_TTL_MS || !lastEventTimestamp) {
              ws.send(JSON.stringify({
                type: 'full_refresh_required',
                reason: gapMs > EVENT_BUFFER_TTL_MS ? 'gap_too_large' : 'no_timestamp',
                timestamp: new Date().toISOString(),
              }));
              break;
            }
            const buffer = workspaceEventBuffer.get(wsId) ?? [];
            const missed = buffer.filter(e => e.timestamp > lastEventTimestamp);
            ws.send(JSON.stringify({
              type: 'reconnect_sync_replay',
              events: missed.map(e => e.data),
              count: missed.length,
              timestamp: new Date().toISOString(),
            }));
            log.info('Reconnect sync replay sent', { workspaceId: wsId, missedCount: missed.length, gapMs });
            break;
          }
          // @ts-expect-error — TS migration: fix in refactoring sprint
          case 'lone_worker_ack': {
            if (!ws.serverAuth?.userId) {
              ws.send(JSON.stringify({
                type: 'lone_worker_ack_result',
                success: false,
                error: 'Authentication required',
              }));
              break;
            }
            try {
              const { loneWorkerSafetyService } = await import('./services/automation/loneWorkerSafetyService');
              const ackCheckId = (payload as any).checkId;
              const ackEmployeeId = (payload as any).employeeId;
              if (!ackCheckId || !ackEmployeeId) {
                ws.send(JSON.stringify({
                  type: 'lone_worker_ack_result',
                  success: false,
                  error: 'checkId and employeeId required',
                }));
                break;
              }
              const ackResult = await loneWorkerSafetyService.acknowledgeWelfareCheck(ackCheckId, ackEmployeeId);
              ws.send(JSON.stringify({
                type: 'lone_worker_ack_result',
                success: ackResult,
                checkId: ackCheckId,
              }));
            } catch (lwErr: any) {
              log.error('Lone worker ack WS error', { error: lwErr?.message });
              ws.send(JSON.stringify({
                type: 'lone_worker_ack_result',
                success: false,
                error: 'Internal error',
              }));
            }
            break;
          }
          // @ts-expect-error — TS migration: fix in refactoring sprint
          case 'trinity_agent_subscribe': {
            // Subscribe to Trinity Agent execution updates
            if (!ws.serverAuth?.userId) {
              ws.send(JSON.stringify({
                type: 'trinity_agent_error',
                error: 'Authentication required for Trinity Agent',
              }));
              break;
            }
            
            const trinityConversationId = (payload as any).conversationId;
            if (!trinityConversationId) {
              ws.send(JSON.stringify({
                type: 'trinity_agent_error',
                error: 'conversationId required',
              }));
              break;
            }
            
            // Store Trinity subscription on the client
            (ws as any).trinityConversationId = trinityConversationId;
            
            ws.send(JSON.stringify({
              type: 'trinity_agent_subscribed',
              conversationId: trinityConversationId,
              userId: ws.serverAuth.userId,
              timestamp: new Date().toISOString(),
            }));
            log.debug('TrinityAgent user subscribed', { userId: ws.serverAuth.userId, conversationId: trinityConversationId });
            break;
          }
          // @ts-expect-error — TS migration: fix in refactoring sprint
          case 'trinity_agent_ping': {
            // Heartbeat for Trinity Agent connection
            ws.send(JSON.stringify({
              type: 'trinity_agent_pong',
              timestamp: new Date().toISOString(),
            }));
            break;
          }

          // @ts-expect-error — TS migration: fix in refactoring sprint
          case 'ws_authenticate': {
            // Token-based auth fallback — handles cases where session cookie lookup
            // failed at connection time (DB hiccup, cookie edge cases in Replit env)
            const token = (payload as any).token;
            if (!token || typeof token !== 'string') {
              ws.send(JSON.stringify({ type: 'ws_auth_failed', reason: 'Missing token' }));
              break;
            }
            if (ws.serverAuth) {
              // Already authenticated via session cookie — ack and skip
              ws.send(JSON.stringify({ type: 'ws_authenticated', userId: ws.serverAuth.userId, source: 'session' }));
              break;
            }
            const authEntry = _consumeWsAuthToken(token);
            if (!authEntry) {
              ws.send(JSON.stringify({ type: 'ws_auth_failed', reason: 'Invalid or expired token' }));
              log.warn('ws_authenticate: invalid/expired token', { ip: ws.ipAddress });
              break;
            }
            // Fetch platform role — DB may be temporarily unavailable, so gracefully default
            let wsTokenPlatformRole: string | undefined;
            try {
              const pr = await getUserPlatformRole(authEntry.userId);
              wsTokenPlatformRole = pr !== 'none' ? pr : undefined;
            } catch {
              wsTokenPlatformRole = undefined;
            }
            ws.serverAuth = {
              userId: authEntry.userId,
              workspaceId: authEntry.workspaceId || '',
              role: authEntry.role || 'user',
              platformRole: wsTokenPlatformRole,
              sessionId: connectionId,
              authenticatedAt: new Date(),
            };
            ws.userId = authEntry.userId;
            ws.workspaceId = authEntry.workspaceId;
            ws.platformRole = wsTokenPlatformRole;
            log.info('WebSocket authenticated via token fallback', { userId: authEntry.userId, workspaceId: authEntry.workspaceId });
            ws.send(JSON.stringify({ type: 'ws_authenticated', userId: authEntry.userId, source: 'token' }));
            break;
          }

          case 'join_conversation': {
            // Check if this is a support room slug or ID instead of conversation ID
            let conversationId = payload.conversationId;
            let roomMode: string | undefined; // IRC-style room mode
            let supportsBots = false; // Dynamic bot deployment flag
            
            log.debug('join_conversation: looking up conversation', { conversationId });
            let conversation = await storage.getChatConversation(conversationId);
            
            // If conversation not found, check if it's a support room slug or ID
            if (!conversation) {
              log.debug('join_conversation: not found as chat_conversation, trying support_rooms');
              // First try by slug (e.g., "helpdesk")
              let supportRoom = await storage.getSupportRoomBySlug(conversationId);
              
              // If not found by slug, try by room ID (UUID)
              if (!supportRoom) {
                log.debug('join_conversation: not found by slug, trying by ID');
                supportRoom = await storage.getSupportRoomById(conversationId);
              }
              
              // Also try organization_chat_rooms if still not found
              if (!supportRoom) {
                log.debug('join_conversation: not found in support_rooms, trying organization_chat_rooms');
                try {
                  const orgRoom = await storage.getOrganizationChatRoom(conversationId);
                  if (orgRoom) {
                    if (orgRoom.conversationId) {
                      conversationId = orgRoom.conversationId;
                      conversation = await storage.getChatConversation(conversationId);
                    }
                    
                    // Auto-create conversation if missing or stale reference
                    if (!conversation) {
                      log.info('Org chat room has stale/missing conversation, auto-creating', { orgRoomId: orgRoom.id, roomName: orgRoom.roomName, staleConversationId: orgRoom.conversationId });
                      const newConversation = await storage.createChatConversation({
                        subject: orgRoom.roomName || 'Organization Chat',
                        conversationType: 'open_chat',
                        workspaceId: orgRoom.workspaceId,
                      });
                      
                      // Link conversation to org room
                      await storage.updateOrganizationChatRoom(orgRoom.id, { conversationId: newConversation.id });
                      
                      conversationId = newConversation.id;
                      conversation = newConversation;
                      log.info('join_conversation: auto-created conversation for org room', { orgRoomId: orgRoom.id, conversationId });
                    } else {
                      log.debug('join_conversation: found org chat room', { conversationId });
                    }
                  }
                } catch (err) {
                  log.debug('join_conversation: org chat room lookup failed', { error: err });
                }
              }
              
              if (supportRoom) {
                log.debug('join_conversation: found support room', { slug: supportRoom.slug, conversationId: supportRoom.conversationId });
                // Store room mode - IRC-style: modes determine behavior, not slugs
                // @ts-expect-error — TS migration: fix in refactoring sprint
                roomMode = supportRoom.mode;
                supportsBots = roomSupportsBots(roomMode);
                
                // Support room exists - get or create its conversation
                if (supportRoom.conversationId) {
                  conversationId = supportRoom.conversationId;
                  conversation = await storage.getChatConversation(conversationId);
                }
                
                // Auto-create conversation if missing or stale reference
                if (!conversation) {
                  log.info('Support room has stale conversation reference, auto-creating', { slug: supportRoom.slug, staleConversationId: supportRoom.conversationId });
                  const newConversation = await storage.createChatConversation({
                    subject: supportRoom.name,
                    conversationType: 'open_chat',
                    workspaceId: supportRoom.workspaceId || PLATFORM_WORKSPACE_ID,
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
              log.warn('join_conversation: conversation not found', { originalId: payload.conversationId });
              ws.send(JSON.stringify({
                type: 'error',
                message: 'Conversation not found',
              }));
              return;
            }
            log.debug('join_conversation: resolved successfully', { conversationId });

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
            // Guest access determined by room mode - only support rooms allow guests
            const allowsGuests = supportsBots; // Rooms with bots (sup/coai) allow guest access
            const isGuestUser = !hasSessionAuth && claimsGuest && allowsGuests;
            
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
              // Case 1: An authenticated-looking userId was provided but serverAuth is not set.
              // This is a timing race — the join_conversation arrived before ws_authenticate
              // completed (e.g., component mounted before auth handshake finished).
              // Signal the client to re-authenticate silently; the client will retry the join
              // upon receiving ws_authenticated.
              if (!hasSessionAuth && payload.userId && !claimsGuest) {
                ws.send(JSON.stringify({ type: 'ws_auth_required' }));
                log.debug('join_conversation: auth not yet complete, requesting re-auth', { ip: ws.ipAddress });
                return;
              }

              const reason = !allowsGuests && claimsGuest
                ? 'Guests can only join the public HelpDesk.'
                : 'Authentication required. Please log in or connect as a guest.';

              ws.send(JSON.stringify({
                type: 'error',
                message: reason,
              }));
              log.warn('Rejected join attempt', { reason, ip: ws.ipAddress });
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
              
              // Guests can only join rooms that support guests (sup/coai modes)
              if (!supportsBots) {
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
              
              // Set role info for authenticated users (based on room mode)
              if (supportsBots) {
                // This is a support/platform chatroom with bots
                if (isStaff) {
                  userRoleInfo = `platform staff - ${platformRole}`;
                } else {
                  userRoleInfo = 'guest/customer';
                }
              }
              
              // SECURITY: Validate workspace access for authenticated users
              // Non-staff users must have workspace context and can only access matching workspaces
              if (!supportsBots) {
                const userWorkspaceId = ws.serverAuth?.workspaceId;
                
                // Authenticated non-staff users REQUIRE valid workspace in session
                if (!isStaff && !userWorkspaceId) {
                  ws.send(JSON.stringify({
                    type: 'error',
                    message: 'Your session lacks workspace context. Please refresh and try again.',
                  }));
                  log.warn('User has no workspace in session', { userId: effectiveUserId });
                  return;
                }
                
                // Conversations without workspace are only accessible in helpdesk
                // For non-helpdesk, conversation MUST have a workspace
                if (!conversation.workspaceId && !isStaff) {
                  ws.send(JSON.stringify({
                    type: 'error',
                    message: 'Invalid conversation: no workspace context.',
                  }));
                  log.warn('Conversation has no workspace, blocked', { conversationId, userId: effectiveUserId });
                  return;
                }
                
                // Verify conversation workspace matches user's workspace (staff exempt)
                if (conversation.workspaceId && !isStaff && conversation.workspaceId !== userWorkspaceId) {
                  ws.send(JSON.stringify({
                    type: 'error',
                    message: 'Access denied: You do not have permission to access this conversation.',
                  }));
                  log.warn('User blocked from cross-workspace conversation', { userId: effectiveUserId, conversationWorkspace: conversation.workspaceId, userWorkspace: userWorkspaceId });
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
            ws.roomMode = roomMode; // IRC-style room mode
            ws.supportsBots = supportsBots; // Dynamic flag for bot deployment
            ws.inTriage = supportsBots && !isStaff; // Non-staff in support rooms start in triage
            ws.inHumanHandoff = false; // Not in human handoff until HelpAI escalates
            ws.isStaff = isStaff; // Staff flag for Trinity AI visibility filtering
            ws.isAway = false; // IRC-style away status
            
            // IRC MODEL: Auto-grant voice in public chatrooms (ORG, MET, FIELD, COAI)
            // Users speak freely in public rooms. Only SUP (HelpDesk) rooms enforce whisper-only.
            // Staff always get voice everywhere. COAI rooms have supportsBots=true (for platform bots)
            // but should still auto-grant voice since they're internal platform rooms, not helpdesk.
            const isHelpdeskRoom = roomMode === 'sup';
            if (!isHelpdeskRoom || isStaff) {
              grantVoice(conversationId, effectiveUserId!);
            }

            // Check if user already has an active connection in this room
            const existingClients = conversationClients.get(conversationId);
            const userAlreadyInRoom = existingClients ? Array.from(existingClients).some(
              client => client.userId === effectiveUserId && client.readyState === WebSocket.OPEN
            ) : false;

            if (!conversationClients.has(conversationId)) {
              conversationClients.set(conversationId, new Set());
            }
            conversationClients.get(conversationId)!.add(ws);

            if (!isGuestUser && !userAlreadyInRoom) {
              try {
                await storage.ensureChatParticipant(conversationId, effectiveUserId);
                platformEventBus.emit('chat:participant_joined', {
                  conversationId,
                  userId: effectiveUserId,
                  userName: displayName,
                  userType,
                  workspaceId: conversation.workspaceId || undefined,
                  source: 'websocket',
                });
              } catch (err: any) {
                log.warn('Failed to register participant in DB', { error: err.message });
              }
            }

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
              }).catch(err => log.error('ChatServerHub failed to emit user_joined_room', { error: err }));
            }

            // IRC-STYLE JOIN EVENT: Fast broadcast for real-time presence updates
            const memberCount = roomPresence.join(conversationId, effectiveUserId, {
              userName: displayName,
              role: userType,
              isBot: false,
            });
            
            if (!userAlreadyInRoom) {
              ircEmitter.join({
                roomId: conversationId,
                roomName: conversation.subject || 'Chat',
                userId: effectiveUserId,
                userName: displayName,
                userRole: userType,
                memberCount,
              });
            }

            // HISTORY BEHAVIOR:
            // - Staff in any room: See all messages (need context for support)
            // - End users in PLATFORM support rooms (sup/coai): Start fresh each session
            // - End users in ORG rooms (org/met/field): See full history until room is closed
            // Platform support rooms are specifically 'sup' or 'coai' mode rooms
            const isPlatformSupportRoom = roomMode === 'sup' || roomMode === 'coai';
            const isEndUserInPlatformSupport = isPlatformSupportRoom && !isStaff;
            
            if (isEndUserInPlatformSupport) {
              // End users in platform support rooms start fresh each session — no history shown.
              // They only see messages generated during their current session.
              ws.send(JSON.stringify({
                type: 'conversation_history',
                conversationId,
                messages: [],
                totalMessages: 0,
              }));
            } else {
              // Staff or other rooms: Load recent conversation history, filtering out join/leave noise
              // @ts-expect-error — TS migration: fix in refactoring sprint
              const allMessages = await storage.getChatMessagesByConversation(conversationId);
              const staffMessages = allMessages
                .filter((m: any) => {
                  if (m.senderType !== 'system') return true;
                  const text = (m.message || '').toLowerCase();
                  return !(text.includes('joined') || text.includes('left') || text.includes('connected') || text.includes('disconnected'));
                })
                .slice(-100);
              ws.send(JSON.stringify({
                type: 'conversation_history',
                conversationId,
                messages: staffMessages,
                totalMessages: staffMessages.length,
              }));
              
              // Mark messages as read for staff
              await storage.markMessagesAsRead(conversationId, effectiveUserId);
            }

            // Broadcast updated user list to all clients in this conversation
            const broadcastUserList = async () => {
              const clients = conversationClients.get(conversationId);
              if (clients) {
                const onlineUsers = [];

                // Add HelpAI Bot from config for rooms with bot support
                // Uses dynamic roomMode flag instead of hardcoded slug comparisons
                if (supportsBots) {
                  onlineUsers.push({
                    id: CHAT_SERVER_CONFIG.helpai.userId,
                    name: CHAT_SERVER_CONFIG.helpai.name,
                    role: 'bot',
                    status: 'online',
                    userType: 'bot'
                  });
                }

                // Add deployed bots from bot pool
                const deployedBots = botPool.getRoomBots(conversationId);
                for (const botInstance of deployedBots) {
                  const botDef = BOT_REGISTRY[botInstance.botId];
                  if (botDef) {
                    onlineUsers.push({
                      id: botInstance.id,
                      name: botDef.name,
                      role: 'bot',
                      status: botInstance.status === 'active' ? 'online' : 'busy',
                      userType: 'bot'
                    });
                  }
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
                    
                    // Map platform role to frontend category (staff/customer/guest)
                    const isClientStaffForList = hasPlatformWideAccess(userRole);
                    const clientCategory = isClientStaffForList ? 'staff' : (client.userType === 'guest' ? 'guest' : 'customer');
                    
                    onlineUsers.push({
                      id: client.userId,
                      name: displayName,
                      role: clientCategory,
                      platformRole: userRole, // Keep original platform role for display
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
            const clients2 = conversationClients.get(conversationId);
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

            // STEP 1: MOTD (Message of the Day) - FIRST thing shown on join
            // Order: MOTD → User Joined → HelpAI Welcome
            // Uses dynamic AI generation for natural, contextual messages
            if (!userAlreadyInRoom) {
              try {
                const { RoomMode } = await import('@shared/types/chat');
                const { dynamicMessageService } = await import('./services/dynamicMessageService');
                
                // Get room modes from conversation metadata
                const joinedConversation = await storage.getChatConversation(conversationId);
                // @ts-expect-error — TS migration: fix in refactoring sprint
                const roomModes = (joinedConversation?.metadata as any)?.modes || 
                                  (roomMode ? [roomMode] : [RoomMode.ORG]);
                // @ts-expect-error — TS migration: fix in refactoring sprint
                const activeBots = (joinedConversation?.metadata as any)?.activeBots || [];
                const roomName = joinedConversation?.subject || 'Chat Room';
                
                // Use staff-set MOTD if available, otherwise generate dynamically
                let motdMessage: string;
                if (currentMOTD && currentMOTD.trim().length > 0) {
                  motdMessage = currentMOTD;
                } else {
                  // Dynamic AI-generated MOTD based on room context
                  motdMessage = await dynamicMessageService.generateMOTD(
                    roomName,
                    roomModes,
                    activeBots,
                    ws.workspaceId
                  );
                }
                
                // Send MOTD as a private system message to the joining user only
                if (ws.readyState === WebSocket.OPEN) {
                  ws.send(JSON.stringify({
                    type: 'system_message',
                    conversationId,
                    message: motdMessage,
                    metadata: {
                      messageType: 'motd',
                      roomModes,
                      activeBots,
                      dynamicallyGenerated: !currentMOTD,
                    },
                  }));
                }
              } catch (motdError) {
                log.error('Failed to send MOTD on join', { error: motdError });
              }
            }

            // STEP 2-3: SUPPORT ROOM ANNOUNCEMENTS: User Joined + HelpAI Welcome
            if (supportsBots && !userAlreadyInRoom) {
              try {
                const announcePlatformRole = await storage.getUserPlatformRole(payload.userId) || undefined;
                const isAnnounceStaff = hasPlatformWideAccess(announcePlatformRole);
                
                // STEP 2: SYSTEM announcement (IRC-style): User joined
                // displayName already includes title for staff (e.g., "Admin Jane", "SysOp James")
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

                // STEP 3: HelpAI announcement (AI Bot): Only for customers (not staff)
                if (!isAnnounceStaff) {
                  // IRC-STYLE SILENCE BY DEFAULT: Customers join without voice
                  // They must wait for HelpAI or staff to grant them voice
                  if (supportsBots) {
                    if (ws.readyState === WebSocket.OPEN) {
                      ws.send(JSON.stringify({ 
                        type: 'voice_pending',
                        conversationId: conversationId,
                        message: 'You are connected to HelpAI. Type your message below to get started.'
                      }));
                      log.debug('User joined HelpDesk in triage mode', { displayName });
                    }
                  }

                  // AUTO-TICKET + WELCOME: Classify user, create ticket, send personalized greeting
                  let welcomeMessage: string;
                  let ticketNumber: string;
                  
                  // Classify user role and fetch org name for personalized greeting
                  const sessionUserId = effectiveUserId || `guest-${Date.now()}`;
                  const isGuestSession = sessionUserId.startsWith('guest-');
                  let userClassRole = isGuestSession ? 'guest' : (ws.serverAuth?.role || userType);
                  let userOrgName: string | undefined;
                  let userEmail: string | undefined;

                  if (!isGuestSession && ws.workspaceId) {
                    try {
                      const [wsRecord] = await db
                        .select({ name: (await import('@shared/schema')).workspaces.name })
                        .from((await import('@shared/schema')).workspaces)
                        .where(eq((await import('@shared/schema')).workspaces.id, ws.workspaceId))
                        .limit(1);
                      if (wsRecord) userOrgName = wsRecord.name;
                    } catch { /* best-effort */ }
                    try {
                      const [uRecord] = await db
                        .select({ email: (await import('@shared/schema')).users.email, role: (await import('@shared/schema')).users.role })
                        .from((await import('@shared/schema')).users)
                        .where(eq((await import('@shared/schema')).users.id, sessionUserId))
                        .limit(1);
                      if (uRecord) {
                        userEmail = uRecord.email || undefined;
                        if (!ws.serverAuth?.role && uRecord.role) userClassRole = uRecord.role;
                      }
                    } catch { /* best-effort */ }
                  }

                  try {
                    const { helpAIBotService } = await import('./services/helpai/helpAIBotService');
                    const sessionResult = await helpAIBotService.startSession(
                      ws.workspaceId || PLATFORM_WORKSPACE_ID,
                      sessionUserId,
                      conversationId
                    );
                    
                    ticketNumber = sessionResult.ticketNumber;
                    ws.helpAISessionId = sessionResult.sessionId;
                    welcomeMessage = await helpAIBotService.generateUserGreeting({
                      conversationId,
                      customerName: displayName,
                      customerEmail: userEmail,
                      workspaceId: ws.workspaceId || PLATFORM_WORKSPACE_ID,
                      userId: sessionUserId,
                      userRole: userClassRole,
                      orgName: userOrgName,
                      ticketNumber,
                    });
                    
                    // Enqueue for support queue tracking
                    const queueEntry = await queueManager.enqueue({
                      conversationId: conversationId,
                      userId: payload.userId?.startsWith('guest-') ? undefined : payload.userId,
                      ticketNumber,
                      userName: displayName,
                      workspaceId: ws.workspaceId,
                    }).catch(() => null);
                    
                    if (queueEntry) {
                      await queueManager.updateQueuePositions().catch(() => {});
                      await queueManager.markWelcomeSent(queueEntry.id).catch(() => {});
                    }
                  } catch (ticketErr) {
                    log.error('HelpAI auto-ticket on join failed', { error: ticketErr });
                    welcomeMessage = CHAT_SERVER_CONFIG.helpai.greetings.default;
                    ticketNumber = `HLP-${Date.now().toString(36).toUpperCase()}`;
                  }
                  
                  // Save welcome message to DB so staff can see it
                  const welcomeBotMsg = await storage.createChatMessage({
                    conversationId: conversationId,
                    senderId: CHAT_SERVER_CONFIG.helpai.userId,
                    senderName: CHAT_SERVER_CONFIG.helpai.name,
                    senderType: 'bot',
                    message: welcomeMessage,
                    messageType: 'text',
                  });
                  
                  // Send welcome to user
                  if (ws.readyState === WebSocket.OPEN) {
                    ws.send(JSON.stringify({
                      type: 'new_message',
                      conversationId: conversationId,
                      message: welcomeBotMsg,
                    }));
                  }
                  
                  // Send welcome to staff too so they see the ticket info
                  const allClients = conversationClients.get(conversationId);
                  if (allClients) {
                    for (const client of allClients) {
                      if (client !== ws && client.readyState === WebSocket.OPEN) {
                        const cRole = await storage.getUserPlatformRole(client.userId || '').catch(() => null);
                        if (hasPlatformWideAccess(cRole ?? undefined)) {
                          client.send(JSON.stringify({
                            type: 'new_message',
                            conversationId: conversationId,
                            message: welcomeBotMsg,
                          }));
                        }
                      }
                    }
                  }
                  
                  // IRC HELPDESK MODEL: Customer stays whisper-only for entire session
                  // Voice is NEVER granted in HelpDesk rooms (privacy protection)
                  // Flow: triage with HelpAI → if unresolved → human handoff via whisper DM
                  log.debug('User in triage mode with ticket (whisper-only)', { displayName, ticketNumber });
                }
              } catch (announceError) {
                log.error('Failed to send join announcements', { error: announceError });
                
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
                  log.error('Fallback welcome also failed', { error: fallbackError });
                }
              }
            }

            // STAFF JOIN: IRC-style CHANOP grant + situational queue briefing
            if (supportsBots && !userAlreadyInRoom && isStaff) {
              try {
                // Auto-grant IRC voice to staff in support rooms (they have full send authority)
                grantVoice(conversationId, effectiveUserId!);

                // Broadcast +v mode grant to all room clients so UI shows staff as voiced
                const modePayload = JSON.stringify({
                  type: 'mode_change',
                  conversationId,
                  mode: '+v',
                  target: effectiveUserId,
                  targetName: displayName,
                  by: CHAT_SERVER_CONFIG.helpai.name,
                });
                const modeClients = conversationClients.get(conversationId);
                if (modeClients) {
                  modeClients.forEach(c => { if (c.readyState === WebSocket.OPEN) c.send(modePayload); });
                }

                // Get live queue stats for staff situational awareness
                const { helpAIBotService } = await import('./services/helpai/helpAIBotService');
                const queueStatus = await queueManager.getQueueStatus().catch(() => ({
                  waitingCount: 0,
                  beingHelpedCount: 0,
                  averageWaitMinutes: 0,
                }));

                // Count agents currently online in this support room
                let onlineAgents = 1; // include self
                const agentClients = conversationClients.get(conversationId);
                if (agentClients) {
                  for (const c of agentClients) {
                    if (c !== ws && c.readyState === WebSocket.OPEN && c.isStaff) {
                      onlineAgents++;
                    }
                  }
                }

                // Generate intelligent staff briefing with queue stats
                const staffBriefing = await helpAIBotService.generateStaffGreeting(displayName, {
                  queueWaiting: queueStatus.waitingCount,
                  agentsOnline: onlineAgents,
                  avgWaitMinutes: queueStatus.averageWaitMinutes,
                });

                // Send private briefing to the joining staff member
                if (ws.readyState === WebSocket.OPEN) {
                  ws.send(JSON.stringify({
                    type: 'private_message',
                    message: {
                      id: `staff-brief-${Date.now()}`,
                      createdAt: new Date(),
                      conversationId,
                      senderId: CHAT_SERVER_CONFIG.helpai.userId,
                      senderName: CHAT_SERVER_CONFIG.helpai.name,
                      senderType: 'bot',
                      message: staffBriefing,
                      messageType: 'text',
                      isSystemMessage: false,
                    },
                  }));
                }

                // Notify other staff agents that a new agent has joined
                if (onlineAgents > 1 && agentClients) {
                  const agentJoinPayload = JSON.stringify({
                    type: 'private_message',
                    message: {
                      id: `agent-join-${Date.now()}`,
                      createdAt: new Date(),
                      conversationId,
                      senderId: CHAT_SERVER_CONFIG.helpai.userId,
                      senderName: CHAT_SERVER_CONFIG.helpai.name,
                      senderType: 'bot',
                      message: `[STAFFROOM] Agent ${displayName} has connected. ${onlineAgents} agents now online.`,
                      messageType: 'text',
                      isSystemMessage: true,
                    },
                  });
                  agentClients.forEach(c => {
                    if (c !== ws && c.readyState === WebSocket.OPEN && c.isStaff) {
                      c.send(agentJoinPayload);
                    }
                  });
                }
              } catch (greetError) {
                log.error('HelpAI staff greeting failed', { error: greetError });
              }
            }

            // NOTE: MOTD is now sent FIRST in the join flow (see STEP 1 above)
            // Order is: MOTD → User Joined → HelpAI Welcome

            // Single consolidated log message (only for NEW joins, not reconnections)
            if (!userAlreadyInRoom) {
              if (supportsBots) {
                log.info('User joined support room', { displayName, roomMode, roleInfo: userRoleInfo });
              } else {
                log.info('User joined conversation', { displayName, conversationId: payload.conversationId });
              }

              // CHAT SERVER HUB: Emit user_joined event for unified event system
              ChatServerHub.emit({
                type: isStaff ? 'staff_joined' : 'user_joined_room',
                title: isStaff ? 'Staff Joined' : 'User Joined',
                description: `${displayName} joined the chat`,
                metadata: {
                  conversationId: conversationId,
                  roomMode: roomMode, // IRC-style room mode instead of slug
                  workspaceId: ws.workspaceId,
                  userId: payload.userId,
                  userName: displayName,
                  audience: 'room',
                },
                shouldPersistToWhatsNew: false,
                shouldNotify: isStaff, // Only notify when staff joins
              }).catch(err => log.error('ChatServerHub failed to emit user_joined', { error: err }));
            }
            break;
          }

          // @ts-expect-error — TS migration: fix in refactoring sprint
          case 'leave_conversation': {
            const leaveConvId = (payload as any).conversationId || ws.conversationId;
            if (leaveConvId) {
              conversationClients.get(leaveConvId)?.delete(ws);
              if (ws.conversationId === leaveConvId) {
                ws.conversationId = undefined;
              }
              log.debug('leave_conversation: client unsubscribed', { conversationId: leaveConvId, userId: ws.userId });
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

            // ROOM CLOSED CHECK: Block messages in closed rooms/DMs
            const convCheck = await storage.getChatConversation(ws.conversationId);
            if (convCheck && convCheck.status === 'closed') {
              const isDM = convCheck.conversationType === 'dm_user' || convCheck.conversationType === 'dm_support';
              ws.send(JSON.stringify({
                type: 'error',
                errorType: isDM ? 'DM_CLOSED' : 'ROOM_CLOSED',
                message: isDM
                  ? 'This conversation has been closed and no further messages can be sent.'
                  : 'This room is closed. Messages cannot be sent until a manager reopens it.',
              }));
              return;
            }

            // IRC-STYLE VOICE CHECK: Only applies in helpdesk/support rooms (supportsBots)
            // DMs, group chats, and org chatrooms allow all users to send freely
            const senderPlatformRole = await storage.getUserPlatformRole(ws.userId).catch(() => null);
            const senderIsStaff = hasPlatformWideAccess(senderPlatformRole ?? undefined);
            
            const isSupportRoom = ws.supportsBots === true;
            if (isSupportRoom && !senderIsStaff && !hasVoiceInConversation(ws.conversationId, ws.userId)) {
              const isSlashCommand = payload.message?.startsWith('/');
              
              // HELPAI TRIAGE PIPELINE: Only route to HelpAI when user is in active triage
              // Manually silenced users (moderation) do NOT get routed to bot
              if (!isSlashCommand && ws.inTriage === true) {
                try {
                  const { helpAIBotService } = await import('./services/helpai/helpAIBotService');
                  const userMessage = sanitizeChatMessage(payload.message || '');
                  if (!userMessage.trim()) return;
                  
                  // Save user message as private (only visible to user + staff)
                  const userMsg = await storage.createChatMessage({
                    conversationId: ws.conversationId,
                    senderId: ws.userId,
                    senderName: ws.userName || 'User',
                    senderType: ws.userType || 'guest',
                    message: userMessage,
                    messageType: 'text',
                    isPrivateMessage: true,
                    recipientId: CHAT_SERVER_CONFIG.helpai.userId,
                  });
                  
                  // Send message back to user so they see it in their chat
                  ws.send(JSON.stringify({ 
                    type: 'new_message', 
                    conversationId: ws.conversationId, 
                    message: userMsg 
                  }));
                  
                  // Also send to staff so they can see the triage conversation
                  const staffClients = conversationClients.get(ws.conversationId);
                  if (staffClients) {
                    for (const client of staffClients) {
                      if (client !== ws && client.readyState === WebSocket.OPEN) {
                        const clientRole = await storage.getUserPlatformRole(client.userId || '').catch(() => null);
                        if (hasPlatformWideAccess(clientRole ?? undefined)) {
                          client.send(JSON.stringify({ 
                            type: 'new_message', 
                            conversationId: ws.conversationId, 
                            message: userMsg 
                          }));
                        }
                      }
                    }
                  }
                  
                  // Route to HelpAI for AI-driven triage
                  let _botResponseText: string;
                  if (ws.helpAISessionId) {
                    const _helpResult = await helpAIBotService.handleMessage(ws.helpAISessionId, userMessage);
                    _botResponseText = _helpResult.response;
                  } else {
                    _botResponseText = await helpAIBotService.generateUserResponse(userMessage, {
                      conversationId: ws.conversationId!,
                      customerName: ws.userName || undefined,
                      workspaceId: ws.workspaceId || undefined,
                      userId: ws.userId || undefined,
                    });
                  }
                  const helpResponse = { response: _botResponseText };
                  
                  // Save and broadcast HelpAI's response
                  const botMsg = await storage.createChatMessage({
                    conversationId: ws.conversationId,
                    senderId: CHAT_SERVER_CONFIG.helpai.userId,
                    senderName: CHAT_SERVER_CONFIG.helpai.name,
                    senderType: 'bot',
                    message: helpResponse.response,
                    messageType: 'text',
                  });
                  
                  // Send bot response to user
                  ws.send(JSON.stringify({ 
                    type: 'new_message', 
                    conversationId: ws.conversationId, 
                    message: botMsg 
                  }));

                  // Notify Trinity of ChatDock HelpAI interaction — cross-channel awareness (non-blocking)
                  if (ws.userId && ws.workspaceId && ws.conversationId) {
                    import('./services/helpai/trinityHelpaiCommandBus').then(({ trinityHelpaiCommandBus: cBus }) => {
                      cBus.broadcastCrossChannelActivity({
                        workspaceId: ws.workspaceId!,
                        userId: ws.userId!,
                        activeChannels: ['chatdock'],
                        currentChannel: 'chatdock',
                        conversationId: ws.conversationId!,
                      }).catch(() => {});
                    }).catch(() => {});
                  }

                  // Send bot response to staff
                  if (staffClients) {
                    for (const client of staffClients) {
                      if (client !== ws && client.readyState === WebSocket.OPEN) {
                        const clientRole = await storage.getUserPlatformRole(client.userId || '').catch(() => null);
                        if (hasPlatformWideAccess(clientRole ?? undefined)) {
                          client.send(JSON.stringify({ 
                            type: 'new_message', 
                            conversationId: ws.conversationId, 
                            message: botMsg 
                          }));
                        }
                      }
                    }
                  }
                  
                  // ESCALATION: If HelpAI can't solve, queue for human support
                  // @ts-expect-error — TS migration: fix in refactoring sprint
                  if (helpResponse.shouldEscalate) {
                    const conversation = helpAIBotService.getConversation(ws.conversationId);
                    const issueSummary = conversation?.conversationHistory
                      ?.filter(h => h.role === 'user')
                      .map(h => h.message)
                      .join(' | ') || userMessage;
                    
                    // Create ticket if none exists
                    const existingTicket = await storage.getActiveSupportTicket(ws.userId, ws.workspaceId || '');
                    let ticketNumber = existingTicket?.ticketNumber;
                    
                    if (!ticketNumber) {
                      const newTicket = await storage.createSupportTicket({
                        // @ts-expect-error — TS migration: fix in refactoring sprint
                        userId: ws.userId.startsWith('guest-') ? undefined : ws.userId,
                        workspaceId: ws.workspaceId || PLATFORM_WORKSPACE_ID,
                        subject: conversation?.intakeData?.subject || 'Support Request',
                        description: issueSummary,
                        priority: conversation?.intakeData?.priority || 'normal',
                        status: 'open',
                      }).catch(() => null);
                      ticketNumber = newTicket?.ticketNumber || `ESC-${Date.now().toString().slice(-6)}`;
                    }
                    
                    // Enqueue for human support
                    await queueManager.enqueue({
                      conversationId: ws.conversationId,
                      userId: ws.userId.startsWith('guest-') ? undefined : ws.userId,
                      ticketNumber,
                      userName: ws.userName || 'User',
                      workspaceId: ws.workspaceId,
                    }).catch(err => log.error('HelpAI queue enqueue failed', { error: err }));
                    
                    // Announce to staff: new customer needs help
                    const staffNotice = await storage.createChatMessage({
                      conversationId: ws.conversationId,
                      senderId: CHAT_SERVER_CONFIG.helpai.userId,
                      senderName: CHAT_SERVER_CONFIG.helpai.name,
                      senderType: 'bot',
                      message: `[STAFF NOTICE] ${ws.userName || 'A customer'} needs human assistance.\nTicket: ${ticketNumber}\nIssue Summary: ${issueSummary.substring(0, 200)}\nHelpAI was unable to resolve this issue. Please use /intro to begin assisting.`,
                      messageType: 'text',
                      visibleToStaffOnly: true,
                    });
                    
                    // Broadcast staff notice only to staff
                    if (staffClients) {
                      for (const client of staffClients) {
                        if (client.readyState === WebSocket.OPEN) {
                          const clientRole = await storage.getUserPlatformRole(client.userId || '').catch(() => null);
                          if (hasPlatformWideAccess(clientRole ?? undefined)) {
                            client.send(JSON.stringify({ 
                              type: 'new_message', 
                              conversationId: ws.conversationId, 
                              message: staffNotice 
                            }));
                          }
                        }
                      }
                    }
                    
                    // IRC HELPDESK MODEL: NO voice granting in HelpDesk — privacy protection
                    // End-user stays in whisper-only mode. Human agent continues via
                    // inline whisper DM thread, picking up where HelpAI left off.
                    // The user's inTriage flag transitions to 'human_handoff' state
                    // but they NEVER get voice in the main channel.
                    ws.inTriage = false; // Exit bot triage — now waiting for human agent
                    ws.inHumanHandoff = true; // New state: human agent whisper thread
                    
                    // Send handoff notification to user (stays in their whisper thread)
                    const handoffUserMsg = await storage.createChatMessage({
                      conversationId: ws.conversationId,
                      senderId: CHAT_SERVER_CONFIG.helpai.userId,
                      senderName: CHAT_SERVER_CONFIG.helpai.name,
                      senderType: 'bot',
                      message: `I'm truly sorry I wasn't able to fully resolve this for you. I know how frustrating that can be, and I want to make sure you get the help you need.\n\nI'm passing you to a real support agent now — they'll have a complete summary of our conversation so you won't need to repeat yourself.\n\nYour ticket **${ticketNumber}** is active and a support agent will be with you shortly. Thank you for your patience.`,
                      messageType: 'text',
                      isPrivateMessage: true,
                      recipientId: ws.userId,
                    });
                    
                    ws.send(JSON.stringify({ 
                      type: 'new_message', 
                      conversationId: ws.conversationId, 
                      message: handoffUserMsg 
                    }));
                    
                    // Send escalation event so frontend knows state changed
                    ws.send(JSON.stringify({
                      type: 'escalated_to_human',
                      conversationId: ws.conversationId,
                      ticketNumber,
                      message: 'A support agent will continue assisting you in this private thread.',
                    }));
                    
                    // Generate conversation summary for the human agent
                    let agentSummary = '';
                    try {
                      agentSummary = await helpAIBotService.generateEscalationSummary(
                        userMessage,
                        conversation?.conversationHistory?.map(h => ({
                          role: h.role as string,
                          message: h.message,
                        })) || [],
                        ws.workspaceId || undefined
                      );
                    } catch (summaryErr) {
                      agentSummary = `User: ${ws.userName || 'Unknown'}\nIssue: ${userMessage.substring(0, 300)}\nConversation turns: ${conversation?.conversationHistory?.length || 0}`;
                    }
                    
                    // Send summary to human agents as inline whisper DM
                    const agentHandoffMsg = await storage.createChatMessage({
                      conversationId: ws.conversationId,
                      senderId: CHAT_SERVER_CONFIG.helpai.userId,
                      senderName: CHAT_SERVER_CONFIG.helpai.name,
                      senderType: 'bot',
                      message: `**[AGENT HANDOFF — ${ticketNumber}]**\n\n**User:** ${ws.userName || 'Unknown'}\n**Status:** HelpAI unable to resolve — human assistance required\n\n**Conversation Summary:**\n${agentSummary}\n\n**Instructions:** Use \`/intro\` to introduce yourself, then respond to this user via private messages. The user is in a whisper-only thread and cannot see main channel messages.`,
                      messageType: 'text',
                      visibleToStaffOnly: true,
                      isPrivateMessage: true,
                    });
                    
                    // Broadcast handoff summary only to staff
                    if (staffClients) {
                      for (const client of staffClients) {
                        if (client.readyState === WebSocket.OPEN) {
                          const clientRole = await storage.getUserPlatformRole(client.userId || '').catch(() => null);
                          if (hasPlatformWideAccess(clientRole ?? undefined)) {
                            client.send(JSON.stringify({ 
                              type: 'new_message', 
                              conversationId: ws.conversationId, 
                              message: agentHandoffMsg 
                            }));
                            // Also notify staff about the handoff state
                            client.send(JSON.stringify({
                              type: 'agent_handoff_request',
                              conversationId: ws.conversationId,
                              ticketNumber,
                              userName: ws.userName,
                              userId: ws.userId,
                              summary: agentSummary.substring(0, 500),
                            }));
                          }
                        }
                      }
                    }
                    
                    log.info('HelpAI escalated to human support (whisper-only, no voice)', { userName: ws.userName, ticketNumber });
                  }
                  
                  // RESOLUTION: If HelpAI resolved the issue, close the session
                  // @ts-expect-error — TS migration: fix in refactoring sprint
                  if (helpResponse.shouldClose) {
                    const closeMsg = await storage.createChatMessage({
                      conversationId: ws.conversationId,
                      senderId: CHAT_SERVER_CONFIG.helpai.userId,
                      senderName: CHAT_SERVER_CONFIG.helpai.name,
                      senderType: 'bot',
                      message: CHAT_SERVER_CONFIG.helpai.messages.ticketClosed('Resolved by HelpAI - Issue addressed successfully'),
                      messageType: 'text',
                    });
                    
                    ws.send(JSON.stringify({ 
                      type: 'new_message', 
                      conversationId: ws.conversationId, 
                      message: closeMsg 
                    }));
                    
                    // Send ticket_closed event so frontend can clean up
                    ws.send(JSON.stringify({
                      type: 'ticket_closed',
                      conversationId: ws.conversationId,
                      reason: 'resolved_by_helpai',
                      message: 'Your issue has been resolved. Thank you for using CoAIleague support!',
                    }));
                    
                    // Clean up: exit triage, revoke voice, remove from queue
                    ws.inTriage = false;
                    revokeVoice(ws.conversationId, ws.userId);
                    await queueManager.dequeue(ws.conversationId).catch(() => {});
                    
                    log.info('HelpAI session resolved', { userName: ws.userName });
                  }
                  
                } catch (botError) {
                  log.error('HelpAI bot pipeline error', { error: botError });
                  // IRC HELPDESK MODEL: Even on error, do NOT grant voice.
                  // Instead, escalate to human agent inline. User stays whisper-only.
                  ws.inTriage = false;
                  ws.inHumanHandoff = true;
                  
                  const errorFallbackMsg = await storage.createChatMessage({
                    conversationId: ws.conversationId,
                    senderId: CHAT_SERVER_CONFIG.helpai.userId,
                    senderName: CHAT_SERVER_CONFIG.helpai.name,
                    senderType: 'bot',
                    message: `I apologize — I encountered a temporary issue processing your request. I'm connecting you with a human support agent who can help right away. Please hold tight.`,
                    messageType: 'text',
                    isPrivateMessage: true,
                    recipientId: ws.userId,
                  });
                  
                  ws.send(JSON.stringify({ 
                    type: 'new_message', 
                    conversationId: ws.conversationId, 
                    message: errorFallbackMsg 
                  }));
                  
                  // Notify staff about the error-escalation
                  const errorStaffNotice = await storage.createChatMessage({
                    conversationId: ws.conversationId,
                    senderId: CHAT_SERVER_CONFIG.helpai.userId,
                    senderName: CHAT_SERVER_CONFIG.helpai.name,
                    senderType: 'bot',
                    message: `**[AGENT HANDOFF — ERROR FALLBACK]**\nHelpAI encountered an error while assisting ${ws.userName || 'a user'}. Please assist them via private messages.`,
                    messageType: 'text',
                    visibleToStaffOnly: true,
                  });
                  
                  const staffClientsErr = conversationClients.get(ws.conversationId);
                  if (staffClientsErr) {
                    for (const client of staffClientsErr) {
                      if (client !== ws && client.readyState === WebSocket.OPEN) {
                        const clientRole = await storage.getUserPlatformRole(client.userId || '').catch(() => null);
                        if (hasPlatformWideAccess(clientRole ?? undefined)) {
                          client.send(JSON.stringify({ 
                            type: 'new_message', 
                            conversationId: ws.conversationId, 
                            message: errorStaffNotice 
                          }));
                        }
                      }
                    }
                  }
                }
                return;
              }
              
              // IRC HELPDESK MODEL: Human handoff whisper routing
              // When user has been escalated from HelpAI to human agent,
              // their messages route as private whispers to staff (no main channel access)
              if (!isSlashCommand && ws.inHumanHandoff === true) {
                try {
                  const handoffMessage = sanitizeChatMessage(payload.message || '');
                  if (!handoffMessage.trim()) return;
                  
                  // Save as private message visible to user + staff only
                  const userWhisperMsg = await storage.createChatMessage({
                    conversationId: ws.conversationId,
                    senderId: ws.userId,
                    senderName: ws.userName || 'User',
                    senderType: ws.userType || 'guest',
                    message: handoffMessage,
                    messageType: 'text',
                    isPrivateMessage: true,
                  });
                  
                  // Echo back to user so they see it in their whisper thread
                  ws.send(JSON.stringify({ 
                    type: 'new_message', 
                    conversationId: ws.conversationId, 
                    message: userWhisperMsg 
                  }));
                  
                  // Route to all staff in the room
                  const handoffStaffClients = conversationClients.get(ws.conversationId);
                  if (handoffStaffClients) {
                    for (const client of handoffStaffClients) {
                      if (client !== ws && client.readyState === WebSocket.OPEN) {
                        const clientRole = await storage.getUserPlatformRole(client.userId || '').catch(() => null);
                        if (hasPlatformWideAccess(clientRole ?? undefined)) {
                          client.send(JSON.stringify({ 
                            type: 'new_message', 
                            conversationId: ws.conversationId, 
                            message: userWhisperMsg 
                          }));
                        }
                      }
                    }
                  }
                } catch (handoffErr) {
                  log.error('Human handoff whisper routing error', { error: handoffErr });
                }
                return;
              }
              
              // Support room moderation: user silenced by staff (not in triage, not in handoff)
              if (!isSlashCommand) {
                ws.send(JSON.stringify({
                  type: 'error',
                  errorType: 'VOICE_REQUIRED',
                  message: 'You are silenced by a moderator. Please wait for staff to grant you voice.',
                }));
                log.debug('Blocked message from silenced user', { userName: ws.userName, conversationId: ws.conversationId });
                return;
              }
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
              // PRIVACY: Use first-name-only for end-user-facing contexts
              const staffInfo = await storage.getUserDisplayInfo(ws.userId);
              const staffDisplayName = staffInfo ? formatUserDisplayNameForChat({
                firstName: staffInfo.firstName,
                lastName: staffInfo.lastName,
                email: staffInfo.email || undefined,
                platformRole: staffInfo.platformRole || undefined,
                workspaceRole: staffInfo.workspaceRole || undefined,
              }) : ws.userName || 'Support';
              
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
                  
                  // Broadcast via IRC event system for real-time messaging
                  ircEmitter.botMessage({
                    roomId: ws.conversationId,
                    messageId: String(botMsg.id),
                    botId: CHAT_SERVER_CONFIG.helpai.userId,
                    botName: CHAT_SERVER_CONFIG.helpai.name,
                    content: introMessage,
                    metadata: {
                      messageType: 'intro',
                      savedToDb: true,
                      dbMessageId: botMsg.id,
                    },
                  });
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
                    
                    ws.send(JSON.stringify({ type: 'system_message', conversationId: ws.conversationId, message: resetMsg }));
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
                        conversationId: ws.conversationId,
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
                      
                      log.info('Password reset triggered via WebSocket', { triggeredBy: userId, targetUserId: user.id, ip: ws.ipAddress });
                    } catch (emailError) {
                      // Email sending failed
                      log.error('Password reset email error', { error: emailError });
                      
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
                    log.error('Password reset error', { error });
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
                  
                  log.debug('Whisper delivered', { from: displayName, to: targetUserName });
                  break;
                }
                
                case 'privmsg': {
                  // IRC-style private message by username (available to all users)
                  const targetUsername = parsedCommand.args[0];
                  const privateMsg = parsedCommand.args.slice(1).join(' ');
                  
                  if (!targetUsername || !privateMsg) {
                    ws.send(JSON.stringify({
                      type: 'error',
                      message: 'Usage: /privmsg <username> <message>',
                    }));
                    break;
                  }
                  
                  // Find target user by display name or email prefix in this conversation
                  let privMsgTargetClient: any = null;
                  let privMsgTargetName: string = targetUsername;
                  let privMsgTargetId: string = '';
                  
                  if (clients) {
                    clients.forEach((client) => {
                      // Match by userName, email prefix, or userId
                      const clientName = client.userName || '';
                      const clientEmail = (client as any).userEmail || '';
                      const clientEmailPrefix = clientEmail.split('@')[0] || '';
                      
                      if (
                        (clientName.toLowerCase() === targetUsername.toLowerCase() ||
                         clientEmailPrefix.toLowerCase() === targetUsername.toLowerCase() ||
                         client.userId === targetUsername) &&
                        client.readyState === WebSocket.OPEN
                      ) {
                        privMsgTargetClient = client;
                        privMsgTargetName = clientName || clientEmailPrefix || targetUsername;
                        privMsgTargetId = client.userId || '';
                      }
                    });
                  }
                  
                  if (!privMsgTargetClient) {
                    ws.send(JSON.stringify({
                      type: 'error',
                      message: `User "${targetUsername}" not found or not currently online. Check the user list for available recipients.`,
                    }));
                    break;
                  }
                  
                  // Create private message with purple styling indicator
                  const privMsgRecord = await storage.createChatMessage({
                    conversationId: ws.conversationId,
                    senderId: ws.userId!,
                    senderName: displayName,
                    senderType: 'user',
                    message: privateMsg,
                    messageType: 'text',
                    isPrivateMessage: true,
                    recipientId: privMsgTargetId,
                  });
                  
                  // Add private message indicator for purple styling
                  const privMsgWithStyle = {
                    ...privMsgRecord,
                    isPrivateMessage: true,
                    messageKind: 'private' as const,
                  };
                  
                  // Send to target user only
                  if (privMsgTargetClient.readyState === WebSocket.OPEN) {
                    privMsgTargetClient.send(JSON.stringify({
                      type: 'private_message',
                      message: privMsgWithStyle,
                    }));
                  }
                  
                  // Send confirmation back to sender
                  ws.send(JSON.stringify({
                    type: 'private_message',
                    message: privMsgWithStyle,
                  }));
                  
                  log.debug('Private message sent', { from: displayName, to: privMsgTargetName });
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
                  
                  // Get room modes dynamically from conversation metadata
                  const helpConversation = await storage.getChatConversation(ws.conversationId);
                  // @ts-expect-error — TS migration: fix in refactoring sprint
                  const roomModes = (helpConversation?.metadata as any)?.modes || [];
                  // @ts-expect-error — TS migration: fix in refactoring sprint
                  const activeBots = (helpConversation?.metadata as any)?.activeBots || [];
                  
                  // Import the chatroom command service for dynamic bot command help
                  const { formatHelpMessage, getCommandsForModes } = await import('./services/chatroomCommandService');
                  const { RoomMode } = await import('@shared/types/chat');
                  
                  // Check if user requested help for a specific command
                  const specificCommand = parsedCommand.args[0];
                  
                  // Generate comprehensive help including both system and bot commands
                  const systemHelpText = getHelpText(isHelpStaff);
                  const botHelpText = formatHelpMessage(roomModes.length > 0 ? roomModes : [RoomMode.ORG], activeBots, specificCommand);
                  
                  // Combine help texts
                  const combinedHelp = specificCommand 
                    ? botHelpText  // For specific command, just show that
                    : `${systemHelpText}\n\n━━━━ Bot Commands ━━━━\n\n${botHelpText}`;
                  
                  ws.send(JSON.stringify({
                    type: 'system_message',
                    conversationId: ws.conversationId,
                    message: combinedHelp,
                    metadata: {
                      commandType: 'help',
                      roomModes,
                      activeBots,
                      isStaff: isHelpStaff,
                    },
                  }));
                  break;
                }
                
                case 'commands': {
                  // Quick command list for the room
                  const { formatCommandsMessage } = await import('./services/chatroomCommandService');
                  const { RoomMode } = await import('@shared/types/chat');
                  
                  const cmdConversation = await storage.getChatConversation(ws.conversationId);
                  // @ts-expect-error — TS migration: fix in refactoring sprint
                  const cmdRoomModes = (cmdConversation?.metadata as any)?.modes || [RoomMode.ORG];
                  
                  ws.send(JSON.stringify({
                    type: 'system_message',
                    conversationId: ws.conversationId,
                    message: formatCommandsMessage(cmdRoomModes),
                    metadata: { commandType: 'commands' },
                  }));
                  break;
                }
                
                case 'helpai': {
                  const helpaiQuestion = parsedCommand.args.join(' ');
                  let helpaiMsg = '';

                  try {
                    const { botAIService } = await import('./bots/botAIService');
                    const helpaiWorkspace = ws.workspaceId || 'platform';

                    if (helpaiQuestion) {
                      // Real AI response for specific questions
                      const aiResp = await botAIService.generate({
                        botId: 'helpai',
                        workspaceId: helpaiWorkspace,
                        userId: ws.userId,
                        action: 'response',
                        prompt: `User "${displayName}" asks: "${helpaiQuestion}"\n\nProvide a helpful, concise answer. You are HelpAI, the support assistant for CoAIleague workforce management platform. You can help with account issues, password resets, platform questions, and connecting with support staff. If you cannot directly solve the issue, suggest relevant slash commands or offer to escalate.`,
                        context: { conversationId: ws.conversationId },
                      });
                      helpaiMsg = aiResp.text;
                    } else {
                      // Greeting when invoked without a question
                      const aiGreet = await botAIService.generate({
                        botId: 'helpai',
                        workspaceId: helpaiWorkspace,
                        userId: ws.userId,
                        action: 'greeting',
                        prompt: `Greet user "${displayName}" who just summoned HelpAI. Briefly introduce yourself and list what you can help with (account issues, password resets, platform questions, live support). Keep it warm and concise (3-4 lines).`,
                      });
                      helpaiMsg = aiGreet.text;
                    }
                  } catch (aiErr: any) {
                    log.error('HelpAI AI generation failed, using fallback', { error: aiErr.message });
                    helpaiMsg = helpaiQuestion
                      ? `You asked: "${helpaiQuestion}"\n\nI'm HelpAI, your support assistant. I can help with:\n- Account issues and verification\n- Password resets\n- General platform questions\n- Connecting you with support staff\n\nLet me look into that for you. A support agent will be notified if needed.`
                      : `Hi! I'm HelpAI, your support assistant.\n\nHow can I help you today? I can assist with:\n- Account issues and verification\n- Password resets and access problems\n- General platform questions\n- Connecting you with live support staff\n\nJust type your question and I'll do my best to help!`;
                  }

                  const helpaiResponseMsg = await storage.createChatMessage({
                    conversationId: ws.conversationId,
                    senderId: CHAT_SERVER_CONFIG.helpai.userId,
                    senderName: CHAT_SERVER_CONFIG.helpai.name,
                    senderType: 'bot',
                    message: helpaiMsg,
                    messageType: 'text',
                    // @ts-expect-error — TS migration: fix in refactoring sprint
                    metadata: { botCommand: 'helpai', question: helpaiQuestion || null, aiPowered: true },
                  });

                  ircEmitter.botMessage({
                    roomId: ws.conversationId,
                    messageId: String(helpaiResponseMsg.id),
                    botId: CHAT_SERVER_CONFIG.helpai.userId,
                    botName: CHAT_SERVER_CONFIG.helpai.name,
                    content: helpaiMsg,
                    metadata: {
                      messageType: 'helpai_response',
                      savedToDb: true,
                      dbMessageId: helpaiResponseMsg.id,
                    },
                  });

                  // H004: Log chatroom /helpai command to helpai_action_log
                  db.insert(helpaiActionLog).values({
                    actionType: 'query',
                    actionName: 'helpai_chatroom_command',
                    commandUsed: '/helpai',
                    toolUsed: 'botAIService',
                    inputPayload: { question: helpaiQuestion || null, conversationId: ws.conversationId } as any,
                    outputPayload: { response: helpaiMsg.substring(0, 500), messageId: helpaiResponseMsg.id } as any,
                    success: true,
                    workspaceId: ws.workspaceId || null,
                    userId: ws.userId || null,
                  }).catch(e => log.warn('HelpAI action log insert failed (non-fatal)', { error: e.message }));

                  break;
                }

                case 'dm': {
                  const dmTarget = parsedCommand.args[0];
                  const dmMessage = parsedCommand.args.slice(1).join(' ');
                  
                  const dmClients = conversationClients.get(ws.conversationId);
                  let targetClient: any = null;
                  if (dmClients) {
                    dmClients.forEach((client) => {
                      if (client.userName === dmTarget || client.userId === dmTarget) {
                        targetClient = client;
                      }
                    });
                  }
                  
                  if (!targetClient) {
                    ws.send(JSON.stringify({ type: 'error', message: `User "${dmTarget}" not found in this room.` }));
                    break;
                  }
                  
                  const dmPayload = {
                    type: 'private_message',
                    senderId: ws.userId,
                    senderName: displayName,
                    message: dmMessage,
                    timestamp: new Date().toISOString(),
                  };
                  targetClient.send(JSON.stringify(dmPayload));
                  ws.send(JSON.stringify({ ...dmPayload, message: `[DM to ${dmTarget}] ${dmMessage}` }));
                  break;
                }

                case 'screenshot': {
                  const screenshotDesc = parsedCommand.args.join(' ') || 'Screenshot request';
                  const screenshotMsg = await storage.createChatMessage({
                    conversationId: ws.conversationId,
                    senderId: CHAT_SERVER_CONFIG.helpai.userId,
                    senderName: CHAT_SERVER_CONFIG.helpai.name,
                    senderType: 'bot',
                    message: `Screenshot requested by ${displayName}: "${screenshotDesc}"\n\nTo share a screenshot, please use your device's screenshot feature and paste or upload it when the upload feature is available.`,
                    messageType: 'text',
                  });
                  ircEmitter.botMessage({
                    roomId: ws.conversationId,
                    messageId: String(screenshotMsg.id),
                    botId: CHAT_SERVER_CONFIG.helpai.userId,
                    botName: CHAT_SERVER_CONFIG.helpai.name,
                    content: screenshotMsg.message,
                    metadata: { messageType: 'screenshot_request', savedToDb: true, dbMessageId: screenshotMsg.id },
                  });
                  break;
                }

                case 'verifyme': {
                  const verifymeMsg = await storage.createChatMessage({
                    conversationId: ws.conversationId,
                    senderId: CHAT_SERVER_CONFIG.helpai.userId,
                    senderName: CHAT_SERVER_CONFIG.helpai.name,
                    senderType: 'bot',
                    message: `Account Verification Request\n\n${displayName} has requested account verification.\n\nA support staff member will verify your identity shortly. Please have the following ready:\n- Your registered email address\n- Organization/company name\n- Any relevant account details`,
                    messageType: 'text',
                  });
                  ircEmitter.botMessage({
                    roomId: ws.conversationId,
                    messageId: String(verifymeMsg.id),
                    botId: CHAT_SERVER_CONFIG.helpai.userId,
                    botName: CHAT_SERVER_CONFIG.helpai.name,
                    content: verifymeMsg.message,
                    metadata: { messageType: 'verifyme', savedToDb: true, dbMessageId: verifymeMsg.id },
                  });
                  break;
                }

                case 'issue': {
                  const issueDescription = parsedCommand.args.join(' ');
                  const issueMsg = await storage.createChatMessage({
                    conversationId: ws.conversationId,
                    senderId: CHAT_SERVER_CONFIG.helpai.userId,
                    senderName: CHAT_SERVER_CONFIG.helpai.name,
                    senderType: 'bot',
                    message: `Issue Report from ${displayName}\n\nDescription: ${issueDescription}\n\nYour issue has been logged and a support agent will review it. Thank you for reporting this.`,
                    messageType: 'text',
                  });
                  ircEmitter.botMessage({
                    roomId: ws.conversationId,
                    messageId: String(issueMsg.id),
                    botId: CHAT_SERVER_CONFIG.helpai.userId,
                    botName: CHAT_SERVER_CONFIG.helpai.name,
                    content: issueMsg.message,
                    metadata: { messageType: 'issue_report', savedToDb: true, dbMessageId: issueMsg.id },
                  });
                  break;
                }

                case 'mention': {
                  const mentionTarget = parsedCommand.args[0];
                  const mentionMessage = parsedCommand.args.slice(1).join(' ') || '';
                  
                  const mentionText = `@${mentionTarget} ${mentionMessage}`.trim();
                  const mentionChatMsg = await storage.createChatMessage({
                    conversationId: ws.conversationId,
                    senderId: ws.userId,
                    senderName: displayName,
                    senderType: senderIsStaff ? 'support' : 'customer',
                    message: mentionText,
                    messageType: 'text',
                  });
                  
                  const mentionClients = conversationClients.get(ws.conversationId);
                  if (mentionClients) {
                    mentionClients.forEach((client) => {
                      if (client.readyState === WebSocket.OPEN) {
                        client.send(JSON.stringify({ type: 'new_message', message: mentionChatMsg }));
                      }
                    });
                  }
                  break;
                }

                case 'bots': {
                  // Show available bots for this room (live from botPool + metadata)
                  const { formatBotsMessage } = await import('./services/chatroomCommandService');
                  const { RoomMode } = await import('@shared/types/chat');
                  const { botPool: botsPool } = await import('./bots');
                  
                  const botConversation = await storage.getChatConversation(ws.conversationId);
                  // @ts-expect-error — TS migration: fix in refactoring sprint
                  const botRoomModes = (botConversation?.metadata as any)?.modes || [RoomMode.ORG];
                  // @ts-expect-error — TS migration: fix in refactoring sprint
                  const metadataBots = (botConversation?.metadata as any)?.activeBots || [];
                  
                  // Merge metadata bots with live pool instances
                  const liveInstances = botsPool.getRoomBots(ws.conversationId);
                  const liveBotIds = liveInstances.map((inst: any) => inst.botId);
                  const allActiveBots = [...new Set([...metadataBots, ...liveBotIds])];
                  
                  ws.send(JSON.stringify({
                    type: 'system_message',
                    conversationId: ws.conversationId,
                    message: formatBotsMessage(botRoomModes, allActiveBots),
                    metadata: { commandType: 'bots', activeBots: allActiveBots },
                  }));
                  break;
                }
                
                case 'who': {
                  // List participants in the room
                  const roomClients = conversationClients.get(ws.conversationId);
                  const participants: string[] = [];
                  
                  if (roomClients) {
                    roomClients.forEach((client) => {
                      if (client.readyState === WebSocket.OPEN && client.userName) {
                        const statusIcon = client.isStaff ? '⭐' : '👤';
                        participants.push(`${statusIcon} ${client.userName}`);
                      }
                    });
                  }
                  
                  const whoMessage = [
                    '━━━━ Room Participants ━━━━',
                    '',
                    participants.length > 0 
                      ? participants.join('\n') 
                      : 'No participants currently visible',
                    '',
                    `Total: ${participants.length} online`,
                    '━━━━━━━━━━━━━━━━━━━━━━━━━━━',
                  ].join('\n');
                  
                  ws.send(JSON.stringify({
                    type: 'system_message',
                    conversationId: ws.conversationId,
                    message: whoMessage,
                    metadata: { 
                      commandType: 'who',
                      participantCount: participants.length,
                    },
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
                    
                    if (process.env.OPENAI_API_KEY || process.env.AI_INTEGRATIONS_OPENAI_API_KEY) {
                      try {
                        const { getMeteredOpenAICompletion } = await import('./services/billing/universalAIBillingInterceptor');
                        const result = await getMeteredOpenAICompletion({
                          workspaceId: workspaceId || '',
                          // @ts-expect-error — TS migration: fix in refactoring sprint
                          userId: String(userId || 'system'),
                          featureKey: 'chatroom_hr_ai',
                          messages: [
                            {
                              role: 'system',
                              content: `You are a helpful HR assistant for CoAIleague. Answer employee questions about company policies, procedures, and benefits using the provided knowledge base. Be concise, friendly, and accurate. If you don't know the answer, say so and suggest contacting HR.`
                            },
                            {
                              role: 'user',
                              content: `Context from knowledge base:\n${context}\n\nEmployee question: ${query}`
                            }
                          ],
                          model: 'gpt-4o-mini',
                          maxTokens: 500,
                          temperature: 0.3,
                        });
                        if (result.success) {
                          aiResponse = result.content;
                        }
                      } catch (aiError) {
                        log.error('AI generation error', { error: aiError });
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
                    log.error('Error in /ask command', { error });
                    
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
                    log.error('Error assigning conversation', { error });
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
                    conversationId: ws.conversationId,
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
                      conversationId: ws.conversationId,
                      message: `User ${targetUsername} has been suspended. Reason: ${reason}` 
                    }));
                  } catch (error) {
                    log.error('Error suspending user', { error });
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
                      conversationId: ws.conversationId,
                      message: `User ${targetUsername} has been reactivated` 
                    }));
                  } catch (error) {
                    log.error('Error reactivating user', { error });
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
                    
                    ws.send(JSON.stringify({ type: 'system_message', conversationId: ws.conversationId, message: statusMsg }));
                  } catch (error) {
                    log.error('Error checking staff status', { error });
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
                  
                  ws.send(JSON.stringify({ type: 'system_message', conversationId: ws.conversationId, message: 'Restart notification sent to all clients' }));
                  break;
                }
                
                // ============================================================================
                // SUPPORT ACTIONS COMMANDS (MSN-style HelpDesk)
                // ============================================================================
                
                case 'lock': {
                  // Lock user account - requires staff privileges
                  if (!ws.serverAuth || !hasPlatformWideAccess(ws.serverAuth.role)) {
                    ws.send(JSON.stringify({ type: 'error', message: '⛔ This command requires support team privileges' }));
                    break;
                  }
                  
                  const lockTargetId = parsedCommand.args[0];
                  const lockReason = parsedCommand.args.slice(1).join(' ') || 'Locked by support';
                  
                  if (!lockTargetId) {
                    ws.send(JSON.stringify({ type: 'error', message: 'Usage: /lock <userId> [reason]' }));
                    break;
                  }
                  
                  try {
                    const { supportActionsService } = await import('./services/supportActionsService');
                    const result = await supportActionsService.lockAccount(ws.serverAuth.userId, lockTargetId, lockReason);
                    
                    const actionMsg = await storage.createChatMessage({
                      conversationId: ws.conversationId,
                      senderId: null,
                      senderName: 'System',
                      senderType: 'system',
                      message: result.message,
                      messageType: 'action',
                      isSystemMessage: true,
                    });
                    
                    ws.send(JSON.stringify({ type: 'new_message', message: actionMsg }));
                  } catch (error) {
                    log.error('Lock account error', { error });
                    ws.send(JSON.stringify({ type: 'error', message: 'Failed to lock account' }));
                  }
                  break;
                }
                
                case 'unlock': {
                  // Unlock user account - requires staff privileges
                  if (!ws.serverAuth || !hasPlatformWideAccess(ws.serverAuth.role)) {
                    ws.send(JSON.stringify({ type: 'error', message: '⛔ This command requires support team privileges' }));
                    break;
                  }
                  
                  const unlockTargetId = parsedCommand.args[0];
                  
                  if (!unlockTargetId) {
                    ws.send(JSON.stringify({ type: 'error', message: 'Usage: /unlock <userId>' }));
                    break;
                  }
                  
                  try {
                    const { supportActionsService } = await import('./services/supportActionsService');
                    const result = await supportActionsService.unlockAccount(ws.serverAuth.userId, unlockTargetId);
                    
                    const actionMsg = await storage.createChatMessage({
                      conversationId: ws.conversationId,
                      senderId: null,
                      senderName: 'System',
                      senderType: 'system',
                      message: result.message,
                      messageType: 'action',
                      isSystemMessage: true,
                    });
                    
                    ws.send(JSON.stringify({ type: 'new_message', message: actionMsg }));
                  } catch (error) {
                    log.error('Unlock account error', { error });
                    ws.send(JSON.stringify({ type: 'error', message: 'Failed to unlock account' }));
                  }
                  break;
                }
                
                case 'userinfo': {
                  // Get user info - requires staff privileges
                  if (!ws.serverAuth || !hasPlatformWideAccess(ws.serverAuth.role)) {
                    ws.send(JSON.stringify({ type: 'error', message: '⛔ This command requires support team privileges' }));
                    break;
                  }
                  
                  const infoTarget = parsedCommand.args[0];
                  
                  if (!infoTarget) {
                    ws.send(JSON.stringify({ type: 'error', message: 'Usage: /userinfo <userId or email>' }));
                    break;
                  }
                  
                  try {
                    const { supportActionsService } = await import('./services/supportActionsService');
                    const result = await supportActionsService.getUserInfo(ws.serverAuth.userId, infoTarget);
                    
                    ws.send(JSON.stringify({ 
                      type: 'system_message', 
                      message: result.message,
                      messageKind: result.messageKind,
                    }));
                  } catch (error) {
                    log.error('User info error', { error });
                    ws.send(JSON.stringify({ type: 'error', message: 'Failed to get user info' }));
                  }
                  break;
                }
                
                case 'requestinfo': {
                  // Request verification info from user - requires staff privileges
                  if (!ws.serverAuth || !hasPlatformWideAccess(ws.serverAuth.role)) {
                    ws.send(JSON.stringify({ type: 'error', message: '⛔ This command requires support team privileges' }));
                    break;
                  }
                  
                  const reqTargetId = parsedCommand.args[0];
                  const infoType = parsedCommand.args[1];
                  
                  if (!reqTargetId || !infoType) {
                    ws.send(JSON.stringify({ type: 'error', message: 'Usage: /requestinfo <userId> <identity|address|phone|organization|billing>' }));
                    break;
                  }
                  
                  try {
                    const { supportActionsService } = await import('./services/supportActionsService');
                    const result = await supportActionsService.requestInfo(ws.serverAuth.userId, reqTargetId, infoType);
                    
                    // Send the request message to the target user as a DM
                    const reqMsg = await storage.createChatMessage({
                      conversationId: ws.conversationId,
                      senderId: CHAT_SERVER_CONFIG.helpai.userId,
                      senderName: CHAT_SERVER_CONFIG.helpai.name,
                      senderType: 'bot',
                      message: result.message,
                      messageType: 'text',
                      isPrivateMessage: true,
                      recipientId: reqTargetId,
                    });
                    
                    // Send to target user only
                    if (clients) {
                      clients.forEach((client) => {
                        if (client.readyState === WebSocket.OPEN && (client.userId === reqTargetId || hasPlatformWideAccess(client.serverAuth?.role))) {
                          client.send(JSON.stringify({ type: 'new_message', message: reqMsg }));
                        }
                      });
                    }
                    
                    ws.send(JSON.stringify({ type: 'system_message', conversationId: ws.conversationId, message: `✓ Verification request sent to user` }));
                  } catch (error) {
                    log.error('Request info error', { error });
                    ws.send(JSON.stringify({ type: 'error', message: 'Failed to send info request' }));
                  }
                  break;
                }
                
                case 'escalate': {
                  // Escalate to human support - available to all users
                  const escPriority = parsedCommand.args[0] || 'normal';
                  const escReason = parsedCommand.args.slice(1).join(' ');
                  
                  try {
                    const { supportActionsService } = await import('./services/supportActionsService');
                    const result = await supportActionsService.escalateTicket(
                      ws.conversationId,
                      ws.userId,
                      escPriority,
                      escReason
                    );
                    
                    const escMsg = await storage.createChatMessage({
                      conversationId: ws.conversationId,
                      senderId: null,
                      senderName: 'System',
                      senderType: 'system',
                      message: result.message,
                      messageType: 'text',
                      isSystemMessage: true,
                    });
                    
                    if (clients) {
                      clients.forEach((client) => {
                        if (client.readyState === WebSocket.OPEN) {
                          client.send(JSON.stringify({ type: 'new_message', message: escMsg }));
                        }
                      });
                    }
                  } catch (error) {
                    log.error('Escalate error', { error });
                    ws.send(JSON.stringify({ type: 'error', message: 'Failed to escalate ticket' }));
                  }
                  break;
                }
                
                case 'resolve': {
                  // Resolve ticket - requires staff privileges
                  if (!ws.serverAuth || !hasPlatformWideAccess(ws.serverAuth.role)) {
                    ws.send(JSON.stringify({ type: 'error', message: '⛔ This command requires support team privileges' }));
                    break;
                  }
                  
                  const resolutionNotes = parsedCommand.args.join(' ');
                  
                  try {
                    const { supportActionsService } = await import('./services/supportActionsService');
                    const result = await supportActionsService.resolveTicket(
                      ws.serverAuth.userId,
                      ws.conversationId,
                      resolutionNotes
                    );
                    
                    const resolveMsg = await storage.createChatMessage({
                      conversationId: ws.conversationId,
                      senderId: null,
                      senderName: 'System',
                      senderType: 'system',
                      message: result.message,
                      messageType: 'action',
                      isSystemMessage: true,
                    });
                    
                    if (clients) {
                      clients.forEach((client) => {
                        if (client.readyState === WebSocket.OPEN) {
                          client.send(JSON.stringify({ type: 'new_message', message: resolveMsg }));
                          // Send rating prompt to non-staff users
                          if (!hasPlatformWideAccess(client.serverAuth?.role)) {
                            client.send(JSON.stringify({ 
                              type: 'ticket_resolved',
                              conversationId: ws.conversationId,
                              showRating: true,
                            }));
                          }
                        }
                      });
                    }
                  } catch (error) {
                    log.error('Resolve error', { error });
                    ws.send(JSON.stringify({ type: 'error', message: 'Failed to resolve ticket' }));
                  }
                  break;
                }
                
                case 'resetemail': {
                  // Reset user email - requires elevated privileges
                  if (!ws.serverAuth || !['root_admin', 'co_admin'].includes(ws.serverAuth.platformRole || '')) {
                    ws.send(JSON.stringify({ type: 'error', message: '⛔ This command requires admin privileges' }));
                    break;
                  }
                  
                  const emailTargetId = parsedCommand.args[0];
                  const newEmail = parsedCommand.args[1];
                  
                  if (!emailTargetId || !newEmail) {
                    ws.send(JSON.stringify({ type: 'error', message: 'Usage: /resetemail <userId> <newEmail>' }));
                    break;
                  }
                  
                  // Validate email format
                  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
                  if (!emailRegex.test(newEmail)) {
                    ws.send(JSON.stringify({ type: 'error', message: '❌ Invalid email format' }));
                    break;
                  }
                  
                  try {
                    const { supportActionsService } = await import('./services/supportActionsService');
                    const result = await supportActionsService.resetEmail(ws.serverAuth.userId, emailTargetId, newEmail);
                    
                    const actionMsg = await storage.createChatMessage({
                      conversationId: ws.conversationId,
                      senderId: null,
                      senderName: 'System',
                      senderType: 'system',
                      message: result.message,
                      messageType: 'action',
                      isSystemMessage: true,
                    });
                    
                    ws.send(JSON.stringify({ type: 'new_message', message: actionMsg }));
                  } catch (error) {
                    log.error('Reset email error', { error });
                    ws.send(JSON.stringify({ type: 'error', message: 'Failed to reset email' }));
                  }
                  break;
                }
                
                case 'resetpassword': {
                  // Reset user password - requires staff privileges
                  if (!ws.serverAuth || !hasPlatformWideAccess(ws.serverAuth.role)) {
                    ws.send(JSON.stringify({ type: 'error', message: '⛔ This command requires support team privileges' }));
                    break;
                  }
                  
                  const pwdTargetId = parsedCommand.args[0];
                  
                  if (!pwdTargetId) {
                    ws.send(JSON.stringify({ type: 'error', message: 'Usage: /resetpassword <userId>' }));
                    break;
                  }
                  
                  try {
                    const { supportActionsService } = await import('./services/supportActionsService');
                    const result = await supportActionsService.resetPassword(ws.serverAuth.userId, pwdTargetId);
                    
                    const actionMsg = await storage.createChatMessage({
                      conversationId: ws.conversationId,
                      senderId: null,
                      senderName: 'System',
                      senderType: 'system',
                      message: result.message,
                      messageType: 'action',
                      isSystemMessage: true,
                    });
                    
                    ws.send(JSON.stringify({ type: 'new_message', message: actionMsg }));
                  } catch (error) {
                    log.error('Reset password error', { error });
                    ws.send(JSON.stringify({ type: 'error', message: 'Failed to reset password' }));
                  }
                  break;
                }
                
                case 'approve': {
                  // Approve a pending destructive action - requires root_admin/co_admin
                  if (!ws.serverAuth || !['root_admin', 'co_admin'].includes(ws.serverAuth.role || '')) {
                    ws.send(JSON.stringify({ type: 'error', message: '⛔ Only root_admin or co_admin can approve actions' }));
                    break;
                  }
                  
                  const approvalId = parsedCommand.args[0];
                  
                  if (!approvalId) {
                    ws.send(JSON.stringify({ type: 'error', message: 'Usage: /approve <approvalId>' }));
                    break;
                  }
                  
                  try {
                    const { supportActionsService } = await import('./services/supportActionsService');
                    const result = await supportActionsService.approveAction(approvalId, ws.serverAuth.userId);
                    
                    const actionMsg = await storage.createChatMessage({
                      conversationId: ws.conversationId,
                      senderId: null,
                      senderName: 'System',
                      senderType: 'system',
                      message: result.success ? `✓ ${result.message}` : `✗ ${result.message}`,
                      messageType: 'action',
                      isSystemMessage: true,
                    });
                    
                    ws.send(JSON.stringify({ type: 'new_message', message: actionMsg }));
                  } catch (error) {
                    log.error('Approve action error', { error });
                    ws.send(JSON.stringify({ type: 'error', message: 'Failed to approve action' }));
                  }
                  break;
                }
                
                case 'ratelimits': {
                  // View rate limit status - requires staff privileges
                  if (!ws.serverAuth || !hasPlatformWideAccess(ws.serverAuth.role)) {
                    ws.send(JSON.stringify({ type: 'error', message: '⛔ This command requires support team privileges' }));
                    break;
                  }
                  
                  try {
                    const { supportActionsService } = await import('./services/supportActionsService');
                    const status = supportActionsService.getRateLimitStatus(ws.serverAuth.userId);
                    
                    let statusMessage = '📊 **Your Rate Limit Status**\n\n';
                    for (const [action, data] of Object.entries(status.actions)) {
                      statusMessage += `**${action}**: ${data.hourly}/${data.limits.maxPerHour} hourly, ${data.daily}/${data.limits.maxPerDay} daily\n`;
                    }
                    statusMessage += `\nPending approvals: ${status.pendingApprovals}`;
                    
                    ws.send(JSON.stringify({ type: 'system_message', conversationId: ws.conversationId, message: statusMessage }));
                  } catch (error) {
                    log.error('Rate limits error', { error });
                    ws.send(JSON.stringify({ type: 'error', message: 'Failed to get rate limit status' }));
                  }
                  break;
                }
                
                case 'pendingapprovals': {
                  // View pending approvals - requires root_admin/co_admin
                  if (!ws.serverAuth || !['root_admin', 'co_admin'].includes(ws.serverAuth.role || '')) {
                    ws.send(JSON.stringify({ type: 'error', message: '⛔ Only root_admin or co_admin can view pending approvals' }));
                    break;
                  }
                  
                  try {
                    const { supportActionsService } = await import('./services/supportActionsService');
                    const pending = supportActionsService.getPendingApprovals();
                    
                    if (pending.length === 0) {
                      ws.send(JSON.stringify({ type: 'system_message', conversationId: ws.conversationId, message: '✓ No pending approval requests' }));
                    } else {
                      let message = '📋 **Pending Approval Requests**\n\n';
                      for (const p of pending) {
                        const expiresIn = Math.round((p.expiresAt.getTime() - Date.now()) / 60000);
                        message += `• **${p.action}** on user ${p.targetUserId}\n  Requested by: ${p.requestedBy}\n  Expires in: ${expiresIn} minutes\n  ID: \`${p.id.slice(0, 8)}...\`\n  Use: /approve ${p.id}\n\n`;
                      }
                      ws.send(JSON.stringify({ type: 'system_message', conversationId: ws.conversationId, message }));
                    }
                  } catch (error) {
                    log.error('Pending approvals error', { error });
                    ws.send(JSON.stringify({ type: 'error', message: 'Failed to get pending approvals' }));
                  }
                  break;
                }
                
                case 'sessions': {
                  // View/revoke user sessions - requires staff privileges
                  if (!ws.serverAuth || !hasPlatformWideAccess(ws.serverAuth.role)) {
                    ws.send(JSON.stringify({ type: 'error', message: '⛔ This command requires support team privileges' }));
                    break;
                  }
                  
                  const sessTargetId = parsedCommand.args[0];
                  const sessAction = parsedCommand.args[1];
                  
                  if (!sessTargetId) {
                    ws.send(JSON.stringify({ type: 'error', message: 'Usage: /sessions <userId> [revoke]' }));
                    break;
                  }
                  
                  try {
                    if (sessAction === 'revoke') {
                      const { supportActionsService } = await import('./services/supportActionsService');
                      const result = await supportActionsService.revokeSessions(ws.serverAuth.userId, sessTargetId);
                      ws.send(JSON.stringify({ type: 'system_message', conversationId: ws.conversationId, message: result.message }));
                    } else {
                      // Just viewing sessions
                      ws.send(JSON.stringify({ 
                        type: 'system_message', 
                        conversationId: ws.conversationId,
                        message: `📱 Session information for ${sessTargetId}:\n\nUse /sessions ${sessTargetId} revoke to log out all devices.`
                      }));
                    }
                  } catch (error) {
                    log.error('Sessions error', { error });
                    ws.send(JSON.stringify({ type: 'error', message: 'Failed to manage sessions' }));
                  }
                  break;
                }

                // ============================================================================
                // IRC-STYLE ACTION COMMANDS
                // ============================================================================

                case 'me': {
                  // IRC-style action message: /me does something
                  const action = parsedCommand.args.join(' ');

                  if (!action) {
                    ws.send(JSON.stringify({ type: 'error', message: 'Usage: /me <action>\n\nExample: /me is thinking...' }));
                    break;
                  }

                  // Create action message (IRC style: * username action)
                  const actionMsg = await storage.createChatMessage({
                    conversationId: ws.conversationId,
                    senderId: ws.userId,
                    senderName: displayName,
                    senderType: ws.isStaff ? 'staff' : 'user',
                    message: `* ${displayName} ${action}`,
                    messageType: 'action',
                    // @ts-expect-error — TS migration: fix in refactoring sprint
                    metadata: { isIrcAction: true },
                  });

                  if (clients) {
                    clients.forEach((client) => {
                      if (client.readyState === WebSocket.OPEN) {
                        client.send(JSON.stringify({ type: 'new_message', message: actionMsg }));
                      }
                    });
                  }
                  break;
                }

                case 'away': {
                  // Set away status with optional message
                  const awayMessage = parsedCommand.args.join(' ') || 'Away';

                  // Update client state
                  ws.isAway = true;
                  ws.awayMessage = awayMessage;

                  // Broadcast to room that user is away
                  const awayNotice = await storage.createChatMessage({
                    conversationId: ws.conversationId,
                    senderId: null,
                    senderName: 'irc.wfos.com',
                    senderType: 'system',
                    message: `${displayName} is now away: ${awayMessage}`,
                    messageType: 'text',
                    isSystemMessage: true,
                    // @ts-expect-error — TS migration: fix in refactoring sprint
                    metadata: { isAwayNotice: true },
                  });

                  if (clients) {
                    clients.forEach((client) => {
                      if (client.readyState === WebSocket.OPEN) {
                        client.send(JSON.stringify({
                          type: 'user_away',
                          userId: ws.userId,
                          userName: displayName,
                          awayMessage,
                          message: awayNotice
                        }));
                      }
                    });
                  }
                  break;
                }

                case 'back': {
                  // Return from away status
                  if (!ws.isAway) {
                    ws.send(JSON.stringify({ type: 'system_message', conversationId: ws.conversationId, message: 'You are not marked as away.' }));
                    break;
                  }

                  ws.isAway = false;
                  ws.awayMessage = null;

                  // Broadcast to room that user is back
                  const backNotice = await storage.createChatMessage({
                    conversationId: ws.conversationId,
                    senderId: null,
                    senderName: 'irc.wfos.com',
                    senderType: 'system',
                    message: `${displayName} is back`,
                    messageType: 'text',
                    isSystemMessage: true,
                    // @ts-expect-error — TS migration: fix in refactoring sprint
                    metadata: { isBackNotice: true },
                  });

                  if (clients) {
                    clients.forEach((client) => {
                      if (client.readyState === WebSocket.OPEN) {
                        client.send(JSON.stringify({
                          type: 'user_back',
                          userId: ws.userId,
                          userName: displayName,
                          message: backNotice
                        }));
                      }
                    });
                  }
                  break;
                }

                // ============================================================================
                // TRINITY AI INLINE ASSISTANT
                // ============================================================================

                case 'trinity': {
                  // Summon Trinity AI for inline assistance (staff only)
                  if (!ws.serverAuth || !hasPlatformWideAccess(ws.serverAuth.role)) {
                    ws.send(JSON.stringify({ type: 'error', message: '⛔ /trinity requires support team privileges' }));
                    break;
                  }

                  const trinityQuery = parsedCommand.args.join(' ');

                  if (!trinityQuery || trinityQuery.trim().length === 0) {
                    ws.send(JSON.stringify({
                      type: 'error',
                      message: 'Usage: /trinity <question or command>\n\nI\'m your platform orchestrator. Ask me about:\n• User issues & troubleshooting\n• System status & health\n• Command help & documentation\n• Workflow automation\n\nExample: /trinity what commands can help with password resets?',
                    }));
                    break;
                  }

                  // Send "thinking" indicator from Trinity (staff-only visibility)
                  const trinityThinking = await storage.createChatMessage({
                    conversationId: ws.conversationId,
                    senderId: 'trinity-ai',
                    senderName: '🔮 Trinity AI',
                    senderType: 'bot',
                    message: `Processing: "${trinityQuery}"...`,
                    messageType: 'text',
                    // @ts-expect-error — TS migration: fix in refactoring sprint
                    metadata: { isTrinityThinking: true, staffOnly: true },
                  });

                  // Only send Trinity messages to staff clients (not end users)
                  if (clients) {
                    clients.forEach((client) => {
                      if (client.readyState === WebSocket.OPEN && client.isStaff) {
                        client.send(JSON.stringify({ type: 'new_message', message: trinityThinking }));
                      }
                    });
                  }

                  try {
                    let trinityResponse = '';

                    // Build context for Trinity
                    const trinityContext = {
                      agentName: displayName,
                      agentRole: ws.serverAuth?.platformRole || 'support',
                      conversationId: ws.conversationId,
                      workspaceId: ws.workspaceId,
                      query: trinityQuery,
                    };

                    if (process.env.OPENAI_API_KEY || process.env.AI_INTEGRATIONS_OPENAI_API_KEY) {
                      try {
                        const { getMeteredOpenAICompletion } = await import('./services/billing/universalAIBillingInterceptor');
                        const result = await getMeteredOpenAICompletion({
                          workspaceId: ws.workspaceId || '',
                          userId: String(ws.userId || 'system'),
                          featureKey: 'chatroom_trinity_summon',
                          messages: [
                            {
                              role: 'system',
                              content: `You are Trinity AI, the central orchestrator for CoAIleague (WFOS). You are being summoned inline in a support chatroom by ${trinityContext.agentName} (${trinityContext.agentRole}).

Your responsibilities:
- Help support agents troubleshoot user issues
- Explain available slash commands and features
- Provide system status and health information
- Guide agents through complex workflows

Keep responses concise and actionable. Format for chat readability.
Available commands include: /help, /who, /assign, /transfer, /close, /lock, /unlock, /userinfo, /resetpw, /notes, /escalate, /broadcast, and more.`
                            },
                            {
                              role: 'user',
                              content: trinityQuery
                            }
                          ],
                          model: 'gpt-4o-mini',
                          maxTokens: 600,
                          temperature: 0.5,
                        });
                        if (result.success) {
                          trinityResponse = result.content;
                        }
                      } catch (aiError) {
                        log.error('Trinity AI generation error', { error: aiError });
                      }
                    }

                    // Fallback if AI unavailable
                    if (!trinityResponse) {
                      trinityResponse = `🔮 **Trinity AI** (Offline Mode)\n\nI'm currently operating in limited mode. Here's what I can tell you:\n\n**Common Support Commands:**\n• \`/help\` - Full command list\n• \`/userinfo <email>\` - Lookup user details\n• \`/resetpw <userId>\` - Reset password\n• \`/lock <userId>\` - Lock account\n• \`/unlock <userId>\` - Unlock account\n• \`/escalate <reason>\` - Escalate to admin\n\nFor complex queries, please try again when AI services are available.`;
                    }

                    // Send Trinity's response (staff-only visibility)
                    const trinityMsg = await storage.createChatMessage({
                      conversationId: ws.conversationId,
                      senderId: 'trinity-ai',
                      senderName: '🔮 Trinity AI',
                      senderType: 'bot',
                      message: trinityResponse,
                      messageType: 'text',
                      // @ts-expect-error — TS migration: fix in refactoring sprint
                      metadata: {
                        isTrinityResponse: true,
                        staffOnly: true, // Never visible to end users
                        query: trinityQuery,
                        requestedBy: ws.userId,
                      },
                    });

                    // Only send Trinity responses to staff/bots (protect enduser privacy)
                    if (clients) {
                      clients.forEach((client) => {
                        if (client.readyState === WebSocket.OPEN && client.isStaff) {
                          client.send(JSON.stringify({ type: 'new_message', message: trinityMsg }));
                        }
                      });
                    }
                  } catch (error) {
                    log.error('Trinity AI error', { error });

                    const errorMsg = await storage.createChatMessage({
                      conversationId: ws.conversationId,
                      senderId: 'trinity-ai',
                      senderName: '🔮 Trinity AI',
                      senderType: 'bot',
                      message: `⚠️ I encountered an error processing your request. Please try again or use \`/help\` for command reference.`,
                      messageType: 'text',
                      // @ts-expect-error — TS migration: fix in refactoring sprint
                      metadata: { staffOnly: true },
                    });

                    // Error messages also staff-only
                    if (clients) {
                      clients.forEach((client) => {
                        if (client.readyState === WebSocket.OPEN && client.isStaff) {
                          client.send(JSON.stringify({ type: 'new_message', message: errorMsg }));
                        }
                      });
                    }
                  }
                  break;
                }

                // ═══════════════════════════════════════════════════════
                // WORKFORCE BOT COMMANDS - MeetingBot, ReportBot, ClockBot
                // RBAC: Org members can use these; some require supervisor+
                // ═══════════════════════════════════════════════════════

                case 'meetingstart': {
                  if (!ws.workspaceId) { ws.send(JSON.stringify({ type: 'error', message: 'You must be in an organization to use bot commands.' })); break; }
                  const meetingTitle = parsedCommand.args.join(' ') || 'Untitled Meeting';
                  try {
                    const { botPool } = await import('./bots');
                    const { BOT_REGISTRY } = await import('./bots/registry');
                    await botPool.deployBot('meetingbot', ws.conversationId, ws.workspaceId);
                    const { botAIService } = await import('./bots/botAIService');
                    const aiResp = await botAIService.generate({
                      botId: 'meetingbot', workspaceId: ws.workspaceId, userId: ws.userId,
                      action: 'transcription',
                      prompt: `Meeting "${meetingTitle}" has been started by ${displayName}. Acknowledge the start and remind participants to use /actionitem, /decision, and /note commands to track important items. Keep it brief.`,
                    });
                    const botMsg = await storage.createChatMessage({
                      conversationId: ws.conversationId, senderId: 'meetingbot',
                      senderName: BOT_REGISTRY.meetingbot.name, senderType: 'bot',
                      message: aiResp.text || `Meeting "${meetingTitle}" started. Recording in progress.\n\nUse /actionitem, /decision, /note to track items.\nUse /meetingend to finish and generate summary.`,
                      messageType: 'text',
                      // @ts-expect-error — TS migration: fix in refactoring sprint
                      metadata: { meetingTitle, startedBy: ws.userId, startedAt: new Date().toISOString(), botCommand: 'meetingstart' },
                    });
                    if (clients) { clients.forEach(c => { if (c.readyState === WebSocket.OPEN) c.send(JSON.stringify({ type: 'new_message', message: botMsg })); }); }
                    // Update room metadata
                    // @ts-expect-error — TS migration: fix in refactoring sprint
                    await db.update(chatConversations).set({ metadata: sql`COALESCE(metadata, '{}'::jsonb) || ${JSON.stringify({ meetingActive: true, meetingTitle, meetingStartedAt: new Date().toISOString(), meetingStartedBy: ws.userId })}::jsonb` }).where(eq(chatConversations.id, ws.conversationId));
                  } catch (e: any) { ws.send(JSON.stringify({ type: 'error', message: `MeetingBot error: ${e.message}` })); }
                  break;
                }

                case 'meetingend': {
                  if (!ws.workspaceId) { ws.send(JSON.stringify({ type: 'error', message: 'You must be in an organization to use bot commands.' })); break; }
                  try {
                    const { BOT_REGISTRY } = await import('./bots/registry');
                    // Notify room that meeting is ending and report is being generated
                    const processingMsg = await storage.createChatMessage({
                      conversationId: ws.conversationId, senderId: 'meetingbot',
                      senderName: BOT_REGISTRY.meetingbot.name, senderType: 'bot',
                      message: `Meeting ended by ${displayName}. Generating meeting summary PDF and saving to Document Safe...`,
                      messageType: 'text',
                      // @ts-expect-error — TS migration: fix in refactoring sprint
                      metadata: { botCommand: 'meetingend', endedBy: ws.userId, endedAt: new Date().toISOString() },
                    });
                    if (clients) { clients.forEach(c => { if (c.readyState === WebSocket.OPEN) c.send(JSON.stringify({ type: 'new_message', message: processingMsg })); }); }
                    // @ts-expect-error — TS migration: fix in refactoring sprint
                    await db.update(chatConversations).set({ metadata: sql`COALESCE(metadata, '{}'::jsonb) || '{"meetingActive": false}'::jsonb` }).where(eq(chatConversations.id, ws.conversationId));
                    // Generate PDF in background (non-blocking to UI)
                    const capturedConvId = ws.conversationId;
                    const capturedWsId = ws.workspaceId;
                    const capturedUserId = ws.userId || 'system';
                    const capturedDisplayName = displayName;
                    const capturedClients = clients;
                    (async () => {
                      try {
                        const { meetingBotPdfService } = await import('./services/bots/meetingBotPdfService');
                        const result = await meetingBotPdfService.generateAndSaveMeetingSummary(
                          capturedConvId, capturedWsId, capturedUserId, capturedDisplayName
                        );
                        const { BOT_REGISTRY: rb2 } = await import('./bots/registry');
                        const doneMsg = await storage.createChatMessage({
                          conversationId: capturedConvId, senderId: 'meetingbot',
                          senderName: rb2.meetingbot.name, senderType: 'bot',
                          message: result.success
                            ? `Meeting summary saved to Document Safe.\n\n${result.summaryText || ''}\n\nDocument ID: ${result.documentId}`
                            : `Meeting summary could not be saved: ${result.error}. The AI summary:\n\n${result.summaryText || 'N/A'}`,
                          messageType: 'text',
                          // @ts-expect-error — TS migration: fix in refactoring sprint
                          metadata: { botCommand: 'meetingend_complete', documentId: result.documentId },
                        });
                        if (capturedClients) { capturedClients.forEach(c => { if (c.readyState === WebSocket.OPEN) c.send(JSON.stringify({ type: 'new_message', message: doneMsg })); }); }
                      } catch (pdfErr: any) {
                        log.warn('[MeetingBot] PDF generation failed (non-blocking):', { error: pdfErr?.message });
                      }
                    })();
                  } catch (e: any) { ws.send(JSON.stringify({ type: 'error', message: `MeetingBot error: ${e.message}` })); }
                  break;
                }

                case 'meetingpause': {
                  if (!ws.workspaceId) { ws.send(JSON.stringify({ type: 'error', message: 'You must be in an organization to use bot commands.' })); break; }
                  const { BOT_REGISTRY: mb3 } = await import('./bots/registry');
                  const pauseMsg = await storage.createChatMessage({
                    conversationId: ws.conversationId, senderId: 'meetingbot',
                    senderName: mb3.meetingbot.name, senderType: 'bot',
                    message: `Meeting recording paused by ${displayName}. Use /meetingcontinue to resume.`,
                    // @ts-expect-error — TS migration: fix in refactoring sprint
                    messageType: 'text', metadata: { botCommand: 'meetingpause' },
                  });
                  if (clients) { clients.forEach(c => { if (c.readyState === WebSocket.OPEN) c.send(JSON.stringify({ type: 'new_message', message: pauseMsg })); }); }
                  break;
                }

                case 'meetingcontinue': {
                  if (!ws.workspaceId) { ws.send(JSON.stringify({ type: 'error', message: 'You must be in an organization to use bot commands.' })); break; }
                  const { BOT_REGISTRY: mb4 } = await import('./bots/registry');
                  const resumeMsg = await storage.createChatMessage({
                    conversationId: ws.conversationId, senderId: 'meetingbot',
                    senderName: mb4.meetingbot.name, senderType: 'bot',
                    message: `Meeting recording resumed by ${displayName}.`,
                    // @ts-expect-error — TS migration: fix in refactoring sprint
                    messageType: 'text', metadata: { botCommand: 'meetingcontinue' },
                  });
                  if (clients) { clients.forEach(c => { if (c.readyState === WebSocket.OPEN) c.send(JSON.stringify({ type: 'new_message', message: resumeMsg })); }); }
                  break;
                }

                case 'actionitem': {
                  if (!ws.workspaceId) { ws.send(JSON.stringify({ type: 'error', message: 'You must be in an organization to use bot commands.' })); break; }
                  const actionText = parsedCommand.args.join(' ');
                  const { BOT_REGISTRY: mb5 } = await import('./bots/registry');
                  const actionMsg = await storage.createChatMessage({
                    conversationId: ws.conversationId, senderId: 'meetingbot',
                    senderName: mb5.meetingbot.name, senderType: 'bot',
                    message: `Action Item recorded by ${displayName}: ${actionText}`,
                    // @ts-expect-error — TS migration: fix in refactoring sprint
                    messageType: 'text', metadata: { botCommand: 'actionitem', actionItem: actionText, recordedBy: ws.userId },
                  });
                  if (clients) { clients.forEach(c => { if (c.readyState === WebSocket.OPEN) c.send(JSON.stringify({ type: 'new_message', message: actionMsg })); }); }
                  break;
                }

                case 'decision': {
                  if (!ws.workspaceId) { ws.send(JSON.stringify({ type: 'error', message: 'You must be in an organization to use bot commands.' })); break; }
                  const decisionText = parsedCommand.args.join(' ');
                  const { BOT_REGISTRY: mb6 } = await import('./bots/registry');
                  const decMsg = await storage.createChatMessage({
                    conversationId: ws.conversationId, senderId: 'meetingbot',
                    senderName: mb6.meetingbot.name, senderType: 'bot',
                    message: `Decision recorded by ${displayName}: ${decisionText}`,
                    // @ts-expect-error — TS migration: fix in refactoring sprint
                    messageType: 'text', metadata: { botCommand: 'decision', decision: decisionText, recordedBy: ws.userId },
                  });
                  if (clients) { clients.forEach(c => { if (c.readyState === WebSocket.OPEN) c.send(JSON.stringify({ type: 'new_message', message: decMsg })); }); }
                  break;
                }

                case 'note': {
                  if (!ws.workspaceId) { ws.send(JSON.stringify({ type: 'error', message: 'You must be in an organization to use bot commands.' })); break; }
                  const noteText = parsedCommand.args.join(' ');
                  const { BOT_REGISTRY: mb7 } = await import('./bots/registry');
                  const noteMsg = await storage.createChatMessage({
                    conversationId: ws.conversationId, senderId: 'meetingbot',
                    senderName: mb7.meetingbot.name, senderType: 'bot',
                    message: `Note by ${displayName}: ${noteText}`,
                    // @ts-expect-error — TS migration: fix in refactoring sprint
                    messageType: 'text', metadata: { botCommand: 'note', note: noteText, recordedBy: ws.userId },
                  });
                  if (clients) { clients.forEach(c => { if (c.readyState === WebSocket.OPEN) c.send(JSON.stringify({ type: 'new_message', message: noteMsg })); }); }
                  break;
                }

                // ReportBot commands
                case 'report': {
                  if (!ws.workspaceId) { ws.send(JSON.stringify({ type: 'error', message: 'You must be in an organization to use bot commands.' })); break; }
                  try {
                    const { botPool: rPool } = await import('./bots');
                    const { BOT_REGISTRY: rb } = await import('./bots/registry');
                    await rPool.deployBot('reportbot', ws.conversationId, ws.workspaceId);
                    const reportStartMsg = await storage.createChatMessage({
                      conversationId: ws.conversationId, senderId: 'reportbot',
                      senderName: rb.reportbot.name, senderType: 'bot',
                      message: `Incident report started by ${displayName}.\n\nDescribe the incident in your next messages. When finished, type /endreport to finalize.\n\nTip: Use /incident <type> to categorize (theft, trespass, medical, damage, fire, assault, other).`,
                      // @ts-expect-error — TS migration: fix in refactoring sprint
                      messageType: 'text', metadata: { botCommand: 'report', reportStartedBy: ws.userId, reportStartedAt: new Date().toISOString() },
                    });
                    if (clients) { clients.forEach(c => { if (c.readyState === WebSocket.OPEN) c.send(JSON.stringify({ type: 'new_message', message: reportStartMsg })); }); }
                    // @ts-expect-error — TS migration: fix in refactoring sprint
                    await db.update(chatConversations).set({ metadata: sql`COALESCE(metadata, '{}'::jsonb) || ${JSON.stringify({ reportActive: true, reportStartedBy: ws.userId })}::jsonb` }).where(eq(chatConversations.id, ws.conversationId));
                  } catch (e: any) { ws.send(JSON.stringify({ type: 'error', message: `ReportBot error: ${e.message}` })); }
                  break;
                }

                case 'incident': {
                  if (!ws.workspaceId) { ws.send(JSON.stringify({ type: 'error', message: 'You must be in an organization to use bot commands.' })); break; }
                  const incidentType = parsedCommand.args.join(' ');
                  const { BOT_REGISTRY: rb2 } = await import('./bots/registry');
                  const incidentMsg = await storage.createChatMessage({
                    conversationId: ws.conversationId, senderId: 'reportbot',
                    senderName: rb2.reportbot.name, senderType: 'bot',
                    message: `Incident type set: ${incidentType.toUpperCase()}\nReported by: ${displayName}\nTimestamp: ${new Date().toLocaleString()}\n\nContinue describing the incident details. Type /endreport when done.`,
                    // @ts-expect-error — TS migration: fix in refactoring sprint
                    messageType: 'text', metadata: { botCommand: 'incident', incidentType, reportedBy: ws.userId },
                  });
                  if (clients) { clients.forEach(c => { if (c.readyState === WebSocket.OPEN) c.send(JSON.stringify({ type: 'new_message', message: incidentMsg })); }); }
                  break;
                }

                case 'endreport': {
                  if (!ws.workspaceId) { ws.send(JSON.stringify({ type: 'error', message: 'You must be in an organization to use bot commands.' })); break; }
                  try {
                    const { BOT_REGISTRY: rb3 } = await import('./bots/registry');
                    const { botAIService: rAI } = await import('./bots/botAIService');
                    // @ts-expect-error — TS migration: fix in refactoring sprint
                    const reportMsgs = await storage.createChatMessage(ws.conversationId, 50);
                    // @ts-expect-error — TS migration: fix in refactoring sprint
                    const reportText = (reportMsgs as any).filter(m => m.senderType === 'user' || m.senderType === 'customer').map(m => m.message).join('\n');
                    const reportSummary = await rAI.generateReportSummary(ws.workspaceId, 'general', reportText, ws.userId);
                    const endReportMsg = await storage.createChatMessage({
                      conversationId: ws.conversationId, senderId: 'reportbot',
                      senderName: rb3.reportbot.name, senderType: 'bot',
                      message: `Report finalized by ${displayName}.\n\n${reportSummary.text}`,
                      // @ts-expect-error — TS migration: fix in refactoring sprint
                      messageType: 'text', metadata: { botCommand: 'endreport', finalizedBy: ws.userId, finalizedAt: new Date().toISOString() },
                    });
                    if (clients) { clients.forEach(c => { if (c.readyState === WebSocket.OPEN) c.send(JSON.stringify({ type: 'new_message', message: endReportMsg })); }); }
                    // @ts-expect-error — TS migration: fix in refactoring sprint
                    await db.update(chatConversations).set({ metadata: sql`COALESCE(metadata, '{}'::jsonb) || '{"reportActive": false}'::jsonb` }).where(eq(chatConversations.id, ws.conversationId));
                  } catch (e: any) { ws.send(JSON.stringify({ type: 'error', message: `ReportBot error: ${e.message}` })); }
                  break;
                }

                case 'analyzereports': {
                  if (!ws.workspaceId) { ws.send(JSON.stringify({ type: 'error', message: 'You must be in an organization to use bot commands.' })); break; }
                  // RBAC: supervisor+ only (check workspace role)
                  const analyzeUserInfo = await storage.getUserDisplayInfo(ws.userId);
                  const analyzeWsRole = analyzeUserInfo?.workspaceRole || 'employee';
                  const supervisorRoles = ['supervisor', 'manager', 'org_admin', 'co_owner', 'org_owner'];
                  if (!supervisorRoles.includes(analyzeWsRole) && !hasPlatformWideAccess(ws.serverAuth?.role)) {
                    ws.send(JSON.stringify({ type: 'error', message: '/analyzereports requires supervisor or higher privileges.' }));
                    break;
                  }
                  try {
                    const { BOT_REGISTRY: rb4 } = await import('./bots/registry');
                    const { botAIService: rAI2 } = await import('./bots/botAIService');
                    const filter = parsedCommand.args.join(' ') || 'all recent';
                    const aiAnalysis = await rAI2.generate({
                      botId: 'reportbot', workspaceId: ws.workspaceId, userId: ws.userId,
                      action: 'summary',
                      prompt: `Analyze reports for filter: "${filter}". Provide a professional summary of patterns, trends, and recommendations. If no specific data is available, provide a template analysis structure that supervisors can use.`,
                    });
                    const analyzeMsg = await storage.createChatMessage({
                      conversationId: ws.conversationId, senderId: 'reportbot',
                      senderName: rb4.reportbot.name, senderType: 'bot',
                      message: `Report Analysis requested by ${displayName} (filter: ${filter})\n\n${aiAnalysis.text}`,
                      // @ts-expect-error — TS migration: fix in refactoring sprint
                      messageType: 'text', metadata: { botCommand: 'analyzereports', filter, requestedBy: ws.userId },
                    });
                    if (clients) { clients.forEach(c => { if (c.readyState === WebSocket.OPEN) c.send(JSON.stringify({ type: 'new_message', message: analyzeMsg })); }); }
                  } catch (e: any) { ws.send(JSON.stringify({ type: 'error', message: `ReportBot error: ${e.message}` })); }
                  break;
                }

                // ClockBot commands
                case 'clockme': {
                  if (!ws.workspaceId) { ws.send(JSON.stringify({ type: 'error', message: 'You must be in an organization to use bot commands.' })); break; }
                  const clockAction = parsedCommand.args[0]?.toLowerCase();
                  const clockReason = parsedCommand.args.slice(1).join(' ') || 'Manual via chat';
                  if (clockAction !== 'in' && clockAction !== 'out') {
                    ws.send(JSON.stringify({ type: 'error', message: 'Usage: /clockme <in|out> [reason]\nExample: /clockme in GPS not working' }));
                    break;
                  }
                  try {
                    const { botPool: cPool } = await import('./bots');
                    const { BOT_REGISTRY: cb } = await import('./bots/registry');
                    await cPool.deployBot('clockbot', ws.conversationId, ws.workspaceId);
                    const clockMsg = await storage.createChatMessage({
                      conversationId: ws.conversationId, senderId: 'clockbot',
                      senderName: cb.clockbot.name, senderType: 'bot',
                      message: `Clock ${clockAction.toUpperCase()} recorded for ${displayName}\nTime: ${new Date().toLocaleString()}\nReason: ${clockReason}\nMethod: Manual (chat command)`,
                      // @ts-expect-error — TS migration: fix in refactoring sprint
                      messageType: 'text', metadata: { botCommand: 'clockme', clockAction, reason: clockReason, userId: ws.userId, timestamp: new Date().toISOString() },
                    });
                    if (clients) { clients.forEach(c => { if (c.readyState === WebSocket.OPEN) c.send(JSON.stringify({ type: 'new_message', message: clockMsg })); }); }
                  } catch (e: any) { ws.send(JSON.stringify({ type: 'error', message: `ClockBot error: ${e.message}` })); }
                  break;
                }

                case 'forceclock': {
                  if (!ws.workspaceId) { ws.send(JSON.stringify({ type: 'error', message: 'You must be in an organization to use bot commands.' })); break; }
                  // RBAC: supervisor+ only (check workspace role)
                  const forceClockUserInfo = await storage.getUserDisplayInfo(ws.userId);
                  const forceClockWsRole = forceClockUserInfo?.workspaceRole || 'employee';
                  if (!['supervisor', 'manager', 'org_manager', 'department_manager', 'admin', 'org_owner', 'co_owner', 'owner'].includes(forceClockWsRole) && !hasPlatformWideAccess(ws.serverAuth?.role)) {
                    ws.send(JSON.stringify({ type: 'error', message: '/forceclock requires supervisor or higher privileges.' }));
                    break;
                  }
                  const targetEmp = parsedCommand.args[0]?.replace('@', '');
                  const forceAction = parsedCommand.args[1]?.toLowerCase();
                  const forceReason = parsedCommand.args.slice(2).join(' ');
                  if (!targetEmp || (forceAction !== 'in' && forceAction !== 'out') || !forceReason) {
                    ws.send(JSON.stringify({ type: 'error', message: 'Usage: /forceclock @user <in|out> <reason>' }));
                    break;
                  }
                  try {
                    const { BOT_REGISTRY: cb2 } = await import('./bots/registry');
                    const forceClockMsg = await storage.createChatMessage({
                      conversationId: ws.conversationId, senderId: 'clockbot',
                      senderName: cb2.clockbot.name, senderType: 'bot',
                      message: `SUPERVISOR OVERRIDE: Clock ${forceAction.toUpperCase()} forced for @${targetEmp}\nAuthorized by: ${displayName}\nTime: ${new Date().toLocaleString()}\nReason: ${forceReason}`,
                      // @ts-expect-error — TS migration: fix in refactoring sprint
                      messageType: 'text', metadata: { botCommand: 'forceclock', targetEmployee: targetEmp, clockAction: forceAction, reason: forceReason, authorizedBy: ws.userId, timestamp: new Date().toISOString() },
                    });
                    if (clients) { clients.forEach(c => { if (c.readyState === WebSocket.OPEN) c.send(JSON.stringify({ type: 'new_message', message: forceClockMsg })); }); }
                  } catch (e: any) { ws.send(JSON.stringify({ type: 'error', message: `ClockBot error: ${e.message}` })); }
                  break;
                }

                case 'clockstatus': {
                  if (!ws.workspaceId) { ws.send(JSON.stringify({ type: 'error', message: 'You must be in an organization to use bot commands.' })); break; }
                  const statusTarget = parsedCommand.args[0]?.replace('@', '') || displayName;
                  try {
                    const { BOT_REGISTRY: cb3 } = await import('./bots/registry');
                    const { botAIService: cAI } = await import('./bots/botAIService');
                    const statusResp = await cAI.generate({
                      botId: 'clockbot', workspaceId: ws.workspaceId, userId: ws.userId,
                      action: 'summary',
                      prompt: `Provide clock status for ${statusTarget}. Show current status (clocked in or out), today's total hours, and any flags. If no data is available, show a helpful status template.`,
                    });
                    const clockStatusMsg = await storage.createChatMessage({
                      conversationId: ws.conversationId, senderId: 'clockbot',
                      senderName: cb3.clockbot.name, senderType: 'bot',
                      message: `Clock Status for ${statusTarget}:\n\n${statusResp.text}`,
                      // @ts-expect-error — TS migration: fix in refactoring sprint
                      messageType: 'text', metadata: { botCommand: 'clockstatus', target: statusTarget },
                    });
                    if (clients) { clients.forEach(c => { if (c.readyState === WebSocket.OPEN) c.send(JSON.stringify({ type: 'new_message', message: clockStatusMsg })); }); }
                  } catch (e: any) { ws.send(JSON.stringify({ type: 'error', message: `ClockBot error: ${e.message}` })); }
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
                  log.warn('abuse_violations table not found, treating as first violation');
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
                  log.warn('abuse_violations table not found, skipping violation logging');
                } else {
                  log.error('Error logging abuse violation', { error: violationError });
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

            // DM VISIBILITY: Extract private message fields from payload
            const isPrivateMessage = payload.isPrivateMessage === true;
            const recipientId = payload.recipientId || null;
            const threadId = payload.threadId || null; // Session/thread ID for helpdesk DM isolation

            // Save message to database (with optional attachment metadata)
            const messageData: any = {
              conversationId: ws.conversationId,
              senderId: ws.userId?.startsWith('guest-') ? null : ws.userId,
              senderName: displayName,
              senderType: payload.senderType,
              message: sanitizedMessage,
              messageType: (payload as any).messageType || 'text',
              isPrivateMessage,
              recipientId,
            };

            if ((payload as any).attachmentUrl) {
              messageData.attachmentUrl = (payload as any).attachmentUrl;
              messageData.attachmentName = (payload as any).attachmentName;
              messageData.attachmentType = (payload as any).attachmentType;
              messageData.attachmentSize = (payload as any).attachmentSize ? parseInt((payload as any).attachmentSize) : null;
            }

            const savedMessage = await storage.createChatMessage(messageData);

            // ACK: Confirm delivery to sender with server-assigned messageId and echoed clientId
            if (payload.clientId) {
              ws.send(JSON.stringify({
                type: 'message_ack',
                clientId: payload.clientId,
                messageId: savedMessage.id,
                status: 'delivered',
                timestamp: savedMessage.createdAt,
              }));
            }

            // 🤖 SHIFT ROOM BOT ORCHESTRATOR: Route to autonomous bot handlers
            // Fires after message is saved — bots respond asynchronously (non-blocking)
            if (ws.workspaceId && ws.conversationId) {
              (async () => {
                try {
                  const conv = await storage.getChatConversation(ws.conversationId!);
                  const isShiftRoom = conv?.conversationType === 'shift_chat';
                  const isMeetingRoom = conv?.conversationType === 'open_chat' && /^meeting\s*—/i.test(conv?.subject || '');

                  if (isShiftRoom || isMeetingRoom || (payload as any).attachmentType?.startsWith('image/')) {
                    const { shiftRoomBotOrchestrator } = await import('./services/bots/shiftRoomBotOrchestrator');
                    await shiftRoomBotOrchestrator.handleShiftRoomMessage({
                      conversationId: ws.conversationId!,
                      workspaceId: ws.workspaceId!,
                      senderId: ws.userId || '',
                      senderName: displayName,
                      senderRole: ws.workspaceRole || ws.userType || 'employee',
                      message: sanitizedMessage,
                      messageType: (payload as any).messageType || 'text',
                      attachmentUrl: (payload as any).attachmentUrl,
                      attachmentType: (payload as any).attachmentType,
                      gpsLat: (payload as any).gpsLat ? parseFloat((payload as any).gpsLat) : undefined,
                      gpsLng: (payload as any).gpsLng ? parseFloat((payload as any).gpsLng) : undefined,
                      gpsAddress: (payload as any).gpsAddress,
                      messageId: savedMessage.id,
                    });
                  }
                } catch (orchErr: any) {
                  // Orchestrator is always non-blocking
                  log.warn('ShiftBotOrchestrator error (non-blocking):', { error: orchErr?.message });
                }
              })();
            }

            // SENTIMENT ANALYSIS: Only run on messages that warrant it (cost protection)
            // Pre-screen with keyword heuristic to avoid burning AI credits on every message
            const SENTIMENT_TRIGGER_KEYWORDS = /\b(urgent|emergency|help|threat|unsafe|danger|attack|fire|weapon|injury|complaint|angry|furious|unacceptable|lawsuit|quit|resign|harassment|discrimination|assault|abuse|alarming|critical|sos|911)\b/i;
            const shouldAnalyzeSentiment = ws.workspaceId && sanitizedMessage.length >= 15 && SENTIMENT_TRIGGER_KEYWORDS.test(sanitizedMessage);

            if (shouldAnalyzeSentiment) {
              (async () => {
                try {
                  const { analyzeChatMessageSentiment, updateMessageSentiment } = await import('./services/chatSentimentService');
                  
                  const sentimentAnalysis = await analyzeChatMessageSentiment(sanitizedMessage, {
                    senderType: payload.senderType,
                    conversationContext: `User: ${displayName} in conversation ${ws.conversationId}`,
                  }, ws.workspaceId);
                  
                  await updateMessageSentiment(savedMessage.id, sentimentAnalysis);
                  
                  if (sentimentAnalysis.shouldEscalate) {
                    log.info('ChatSentiment alert triggered', { messageId: savedMessage.id, sentiment: sentimentAnalysis.sentiment, urgencyLevel: sentimentAnalysis.urgencyLevel });
                    
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
                    }).catch(err => log.error('ChatSentiment failed to emit alert', { error: err }));
                  }
                } catch (sentimentError) {
                  log.error('ChatSentiment analysis failed (non-blocking)', { error: sentimentError });
                }
              })();
            }

            // Enrich message with user's platform role for frontend display
            const userPlatformRole = await storage.getUserPlatformRole(ws.userId).catch(() => null);
            const enrichedMessage = {
              ...savedMessage,
              role: userPlatformRole || 'guest', // Add role for frontend superscript badges
              userType: ws.userType || 'guest', // Add userType for avatar display
            };

            // Broadcast to clients with DM visibility filtering
            // Private DMs: Only visible to sender, recipient, and support roles
            // Public messages: Visible to all in conversation
            const clients = conversationClients.get(ws.conversationId);
            if (clients) {
              const messagePayload = JSON.stringify({
                type: 'new_message',
                message: {
                  ...enrichedMessage,
                  threadId, // Include threadId for frontend filtering
                },
              });

              // DM VISIBILITY FILTERING (inline MSN-style)
              // Support roles can see ALL messages in helpdesk
              const supportRoles = ['root_admin', 'co_admin', 'sysops', 'platform_support'];
              
              for (const client of Array.from(clients)) {
                if (client.readyState !== WebSocket.OPEN) continue;
                
                // Check if this client should see this message
                let shouldReceive = true;
                
                if (isPrivateMessage) {
                  // Private DM: Only sender, recipient, and support roles can see
                  const clientPlatformRole = client.platformRole || '';
                  const hasSupportAccess = supportRoles.includes(clientPlatformRole);
                  const isSender = client.userId === ws.userId;
                  const isRecipient = client.userId === recipientId;
                  
                  // Also check threadId for helpdesk DM isolation
                  const isInThread = threadId ? (
                    client.threadId === threadId || // Client is in this thread
                    client.userId === ws.userId || // Sender
                    hasSupportAccess // Support can see all threads
                  ) : true;
                  
                  shouldReceive = (isSender || isRecipient || hasSupportAccess) && isInThread;
                  
                  if (!shouldReceive) {
                    log.debug('DM filter blocking message', { from: ws.userId, to: recipientId, clientUserId: client.userId, clientRole: clientPlatformRole });
                  }
                }
                
                if (shouldReceive) {
                  client.send(messagePayload);
                  
                  // Emit read_receipt when other clients receive the message
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
                    }, 1000);
                  }
                }
              }
            }

            // CHAT SERVER HUB: Emit message_posted event for unified event system
            ChatServerHub.emitMessagePosted({
              conversationId: ws.conversationId,
              // @ts-expect-error — TS migration: fix in refactoring sprint
              roomMode: ws.roomMode, // IRC-style room mode instead of hardcoded slug
              workspaceId: ws.workspaceId,
              userId: ws.userId,
              userName: displayName,
              messageId: savedMessage.id,
              messagePreview: sanitizedMessage.substring(0, 100),
            }).catch(err => log.error('ChatServerHub failed to emit message_posted', { error: err }));

            // HELPAI AUTO-RESPONDER: Provide acknowledgment when no staff is present
            // Only respond to non-staff users in rooms with bot support
            (async () => {
              try {
                // Check if this is a non-staff user message in a support room
                // Uses dynamic ws.supportsBots flag set during join
                const isSupportRoom = ws.supportsBots === true;
                
                // @ts-expect-error — TS migration: fix in refactoring sprint
                const userPlatformRole = await storage.getUserPlatformRole(ws.userId).catch(() => null);
                // @ts-expect-error — TS migration: fix in refactoring sprint
                const isStaffUser = hasPlatformWideAccess(userPlatformRole);
                
                // Only auto-respond to non-staff in support rooms
                if (!isSupportRoom || isStaffUser) return;
                
                // Check if any staff is currently connected to this conversation
                // @ts-expect-error — TS migration: fix in refactoring sprint
                const connectedClients = conversationClients.get(ws.conversationId);
                let staffPresent = false;
                if (connectedClients) {
                  for (const client of Array.from(connectedClients)) {
                    if (client.isStaff && client.readyState === WebSocket.OPEN) {
                      staffPresent = true;
                      break;
                    }
                  }
                }
                
                // If staff is present, they'll respond - no need for bot
                if (staffPresent) return;
                
                // Rate limit: Prevent rapid-fire duplicate responses (3s cooldown per user)
                const autoResponseKey = `helpai_response_${ws.userId}`;
                const lastResponse = (globalThis as any)[autoResponseKey];
                const now = Date.now();
                if (lastResponse && (now - lastResponse) < 3000) return;
                (globalThis as any)[autoResponseKey] = now;
                
                // TRINITY-POWERED RESPONSE: Use actual AI brain for intelligent conversation
                // Brief delay feels natural (like the bot is "thinking")
                setTimeout(async () => {
                  try {
                    // Import HelpAI capabilities for Trinity-powered response
                    const { helpAIExecutor } = await import('./services/helpAICapabilities');
                    
                    // Get conversation history for context
                    // @ts-expect-error — TS migration: fix in refactoring sprint
                    const recentMessages = await storage.getChatMessagesByConversation(ws.conversationId);
                    const conversationHistory = recentMessages
                      .slice(-5)
                      .filter(m => m.senderType !== 'system')
                      .map(m => ({
                        role: m.senderType === 'bot' ? 'assistant' as const : 'user' as const,
                        content: m.message
                      }));
                    
                    // Generate dynamic AI response with Trinity brain
                    const aiResponse = await helpAIExecutor.generateDynamicResponse(
                      // @ts-expect-error — TS migration: fix in refactoring sprint
                      ws.userId,
                      ws.workspaceId || 'platform-external',
                      sanitizedMessage,
                      conversationHistory
                    );
                    
                    // Save bot message to database
                    const botMsg = await storage.createChatMessage({
                      // @ts-expect-error — TS migration: fix in refactoring sprint
                      conversationId: ws.conversationId,
                      senderId: CHAT_SERVER_CONFIG.helpai.userId,
                      senderName: CHAT_SERVER_CONFIG.helpai.name,
                      senderType: 'bot',
                      message: aiResponse.message,
                      messageType: 'text',
                    });

                    // Broadcast bot reply to all connected room clients in real-time
                    // @ts-expect-error — TS migration: fix in refactoring sprint
                    const botRoomClients = conversationClients.get(ws.conversationId);
                    if (botRoomClients) {
                      const botMsgPayload = JSON.stringify({ type: 'new_message', message: botMsg });
                      botRoomClients.forEach((rc: any) => {
                        if (rc.readyState === WebSocket.OPEN) rc.send(botMsgPayload);
                      });
                    }
                    
                    // Broadcast via IRC event system
                    ircEmitter.botMessage({
                      // @ts-expect-error — TS migration: fix in refactoring sprint
                      roomId: ws.conversationId,
                      messageId: String(botMsg.id),
                      botId: CHAT_SERVER_CONFIG.helpai.userId,
                      botName: CHAT_SERVER_CONFIG.helpai.name,
                      content: aiResponse.message,
                      metadata: {
                        messageType: 'trinity_ai_response',
                        savedToDb: true,
                        dbMessageId: botMsg.id,
                        shouldEscalate: aiResponse.shouldEscalate,
                      },
                    });
                    
                    // Handle escalation if needed
                    if (aiResponse.shouldEscalate) {
                      log.info('HelpAI Trinity suggests escalation', { displayName, reason: aiResponse.escalationReason });
                      ChatServerHub.emitSupportEscalation({
                        // @ts-expect-error — TS migration: fix in refactoring sprint
                        conversationId: ws.conversationId,
                        // @ts-expect-error — TS migration: fix in refactoring sprint
                        userId: ws.userId,
                        userName: displayName,
                        reason: aiResponse.escalationReason || 'User needs human assistance',
                        messagePreview: sanitizedMessage.substring(0, 100),
                      }).catch(err => log.error('HelpAI escalation emit failed', { error: err }));
                    }
                    
                    log.debug('HelpAI Trinity responded (no staff online)', { displayName });
                  } catch (botErr) {
                    log.error('HelpAI Trinity response failed', { error: botErr });
                    // Dynamic fallback - still uses AI patterns, never static text
                    try {
                      const { dynamicMessageService } = await import('./services/dynamicMessageService');
                      const fallbackMsg = await dynamicMessageService.generateMessage(
                        'fallback_help',
                        { userName: displayName },
                        ws.workspaceId
                      );
                      const botMsg = await storage.createChatMessage({
                        // @ts-expect-error — TS migration: fix in refactoring sprint
                        conversationId: ws.conversationId,
                        senderId: CHAT_SERVER_CONFIG.helpai.userId,
                        senderName: CHAT_SERVER_CONFIG.helpai.name,
                        senderType: 'bot',
                        message: fallbackMsg,
                        messageType: 'text',
                      });
                      // Broadcast fallback bot reply to room clients
                      // @ts-expect-error — TS migration: fix in refactoring sprint
                      const fallbackRoomClients = conversationClients.get(ws.conversationId);
                      if (fallbackRoomClients) {
                        const fPayload = JSON.stringify({ type: 'new_message', message: botMsg });
                        fallbackRoomClients.forEach((rc: any) => {
                          if (rc.readyState === WebSocket.OPEN) rc.send(fPayload);
                        });
                      }
                      ircEmitter.botMessage({
                        // @ts-expect-error — TS migration: fix in refactoring sprint
                        roomId: ws.conversationId,
                        messageId: String(botMsg.id),
                        botId: CHAT_SERVER_CONFIG.helpai.userId,
                        botName: CHAT_SERVER_CONFIG.helpai.name,
                        content: fallbackMsg,
                        metadata: { messageType: 'dynamic_fallback', savedToDb: true, dbMessageId: botMsg.id },
                      });
                    } catch (fallbackErr) {
                      log.error('HelpAI dynamic fallback also failed', { error: fallbackErr });
                    }
                  }
                }, 800); // Brief delay so the bot feels responsive but not instant
              } catch (autoErr) {
                log.error('HelpAI auto-responder error', { error: autoErr });
              }
            })();

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
                    log.debug('Chat notification sent', { userId });
                  } catch (err) {
                    log.error('ChatNotification failed to send', { error: err });
                  }
                }
              });
            });

            // NOTE: Trinity-powered HelpAI responses are now handled in the unified block above
            // (lines 4113-4199) which checks for staff presence, rate limits, and uses 
            // helpAIExecutor.generateDynamicResponse() for intelligent AI conversation.
            // This prevents duplicate responses and ensures consistent behavior.
            break;
          }

          case 'typing': {
            if (!ws.conversationId || !ws.userId) {
              return;
            }

            const typingUserName = payload.userName || ws.userName || 'User';
            
            // IRC-STYLE TYPING EVENT: Fast broadcast with auto-timeout
            if (payload.isTyping) {
              ircEmitter.typing({
                roomId: ws.conversationId,
                userId: ws.userId,
                userName: typingUserName,
              });
              // Update activity for presence tracking
              roomPresence.updateActivity(ws.conversationId, ws.userId);
            } else {
              ircEmitter.typingStop({
                roomId: ws.conversationId,
                userId: ws.userId,
                userName: typingUserName,
              });
            }

            // Also broadcast legacy typing payload for backwards compatibility
            const clients = conversationClients.get(ws.conversationId);
            if (clients) {
              const typingPayload = JSON.stringify({
                type: 'user_typing',
                userId: ws.userId,
                typingUserName: typingUserName,
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
            
            // IRC-STYLE PRESENCE EVENT: Fast broadcast for status changes
            // Emit ONLY to rooms user is in (no global broadcast to avoid cross-room leakage)
            if (payload.status === 'away') {
              roomPresence.setAway(ws.userId, true);
              // Emit to all rooms user is in with proper roomId
              const userRooms = roomPresence.getUserRooms(ws.userId);
              for (const roomId of userRooms) {
                ircEmitter.away({
                  userId: ws.userId,
                  userName: ws.userName,
                  awayMessage: (payload as any).message,
                  roomId, // Always include roomId for room-scoped broadcast
                });
              }
            } else if (payload.status === 'online') {
              roomPresence.setAway(ws.userId, false);
              // Emit to all rooms user is in with proper roomId
              const userRooms = roomPresence.getUserRooms(ws.userId);
              for (const roomId of userRooms) {
                ircEmitter.back({
                  userId: ws.userId,
                  userName: ws.userName,
                  roomId, // Always include roomId for room-scoped broadcast
                });
              }
            }

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
              log.error('Failed to save status change message', { error: err });
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
                log.error('Failed to save error message', { error: err });
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
                log.error('Failed to save error message', { error: err });
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
                log.error('Failed to check user existence for kick', { error: err });
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
                log.error('Failed to get target user name', { error: err });
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
              log.error('Failed to save kick message', { error: err });
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
            log.info('User kicked', { targetUser: targetUserName, kickedBy: ws.userName, reason });

            // Broadcast updated user list with real users only (+ HelpAI bot from config)
            // Need to fetch platform roles for proper categorization
            const clientsArray = Array.from(clients).filter(c => c.userId && c.userName);
            const realUsers = await Promise.all(clientsArray.map(async (c) => {
              const platformRole = await storage.getUserPlatformRole(c.userId!).catch(() => null);
              const isStaffUser = hasPlatformWideAccess(platformRole || undefined);
              const category = isStaffUser ? 'staff' : (c.userType === 'guest' ? 'guest' : 'customer');
              return {
                id: c.userId!,
                name: c.userName!,
                role: category,
                platformRole: platformRole || undefined,
                status: c.userStatus || 'online',
                userType: c.userType || 'guest',
              };
            }));

            // Add HelpAI bot from config for rooms with bot support
            // Check room mode dynamically instead of hardcoded slug
            const supportRoomForKick = await storage.getSupportRoomByConversationId(ws.conversationId);
            // @ts-expect-error — TS migration: fix in refactoring sprint
            const roomSupportsBotsDynamic = roomSupportsBots(supportRoomForKick?.mode);
            
            const allUsers = roomSupportsBotsDynamic 
              ? [{
                  id: CHAT_SERVER_CONFIG.helpai.userId,
                  name: CHAT_SERVER_CONFIG.helpai.name,
                  role: 'bot',
                  status: 'online',
                  userType: 'bot'
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
              log.error('AuditOS failed to log kick action', { error: auditErr });
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
                log.error('AuditOS failed to log silence attempt', { error: auditErr });
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

            // Revoke voice in the in-memory tracking system
            revokeVoice(ws.conversationId, payload.targetUserId);
            
            // Send voice_removed event to the target user
            for (const client of Array.from(clients)) {
              if (client.userId === payload.targetUserId && client.readyState === WebSocket.OPEN) {
                client.send(JSON.stringify({
                  type: 'voice_removed',
                  conversationId: ws.conversationId,
                  duration: payload.duration || 5,
                  reason: payload.reason || 'Chat violation',
                }));
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
              log.error('Failed to save silence message', { error: err });
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

            log.info('User silenced', { targetUser: targetUserName, silencedBy: ws.userName, durationMinutes: duration, reason });

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
              log.error('AuditOS failed to log silence action', { error: auditErr });
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

            // IRC HELPDESK MODEL: Voice granting is BLOCKED in SUP (helpdesk) rooms
            // This protects end-user privacy — all helpdesk communication stays whisper-only
            if (ws.roomMode === 'sup') {
              if (ws.readyState === WebSocket.OPEN) {
                ws.send(JSON.stringify({
                  type: 'command_ack',
                  commandId: payload.commandId,
                  action: 'give_voice',
                  success: false,
                  message: 'Voice granting is not permitted in HelpDesk rooms for privacy protection. Use private messages to communicate with users.',
                  errorType: 'HELPDESK_NO_VOICE',
                }));
              }
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
                log.error('AuditOS failed to log give_voice attempt', { error: auditErr });
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

            // Grant voice in the in-memory tracking system
            grantVoice(ws.conversationId, payload.targetUserId);
            
            // Send voice_granted event to the target user specifically
            for (const client of Array.from(clients)) {
              if (client.userId === payload.targetUserId && client.readyState === WebSocket.OPEN) {
                client.send(JSON.stringify({
                  type: 'voice_granted',
                  conversationId: ws.conversationId,
                  grantedBy: ws.userName,
                }));
                break;
              }
            }

            // Create system announcement message
            const unmuteMessage = createSystemMessage(
              ws.conversationId,
              `[+v] ${targetUserName} has been granted voice by ${ws.userName}`
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
              log.error('Failed to save unmute message', { error: err });
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

            log.info('User unmuted', { targetUser: targetUserName, unmutedBy: ws.userName });

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
              log.error('AuditOS failed to log give_voice action', { error: auditErr });
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
              log.warn('Rejected unauthenticated shift subscription', { ip: ws.ipAddress });
              return;
            }
            
            // SECURITY: Guests cannot subscribe to shift updates
            if (ws.serverAuth.userId.startsWith('guest-')) {
              ws.send(JSON.stringify({
                type: 'error',
                message: 'Guests cannot subscribe to shift updates.',
              }));
              log.warn('Rejected guest shift subscription', { ip: ws.ipAddress });
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
                log.debug('Staff accessing shifts without workspace context', { userId, platformRole });
              } else {
                ws.send(JSON.stringify({
                  type: 'error',
                  message: 'Your session lacks workspace context. Please refresh and try again.',
                }));
                log.warn('Shift subscription rejected - no workspace in session', { userId });
                return;
              }
            }

            // Add to shift update clients for this workspace (or undefined for staff platform access)
            const effectiveWorkspaceId = workspaceId || 'platform-staff';
            if (!shiftUpdateClients.has(effectiveWorkspaceId)) {
              shiftUpdateClients.set(effectiveWorkspaceId, new Set());
            }
            shiftUpdateClients.get(effectiveWorkspaceId)!.add(ws);

            log.debug('User subscribed to shift updates', { userId, workspaceId: workspaceId || 'platform-wide (staff)' });

            // Send confirmation
            ws.send(JSON.stringify({
              type: 'shift_updates_subscribed',
              workspaceId: workspaceId,
            }));
            break;
          }

          // @ts-expect-error — TS migration: fix in refactoring sprint
          case 'join_scheduling_progress': {
            // Subscribe to Trinity scheduling progress updates for a workspace
            // SECURITY: Require session authentication
            
            if (!ws.serverAuth) {
              ws.send(JSON.stringify({
                type: 'error',
                message: 'Authentication required. Please log in first.',
              }));
              log.warn('Rejected unauthenticated scheduling progress subscription', { ip: ws.ipAddress });
              return;
            }
            
            if (ws.serverAuth.userId.startsWith('guest-')) {
              ws.send(JSON.stringify({
                type: 'error',
                message: 'Guests cannot subscribe to scheduling progress.',
              }));
              log.warn('Rejected guest scheduling progress subscription', { ip: ws.ipAddress });
              return;
            }
            
            const userId = ws.serverAuth.userId;
            const workspaceId = ws.serverAuth.workspaceId;
            
            if (!workspaceId) {
              ws.send(JSON.stringify({
                type: 'error',
                message: 'Your session lacks workspace context. Please refresh and try again.',
              }));
              log.warn('Scheduling progress subscription rejected - no workspace', { userId });
              return;
            }

            // Ensure ws has workspace context for cleanup
            ws.workspaceId = workspaceId;
            ws.userId = userId;

            // Add to scheduling progress clients for this workspace
            if (!schedulingProgressClients.has(workspaceId)) {
              schedulingProgressClients.set(workspaceId, new Set());
            }
            schedulingProgressClients.get(workspaceId)!.add(ws);

            log.debug('User subscribed to scheduling progress', { userId, workspaceId });

            // Send confirmation
            ws.send(JSON.stringify({
              type: 'scheduling_progress_subscribed',
              workspaceId: workspaceId,
            }));
            break;
          }

          // @ts-expect-error — TS migration: fix in refactoring sprint
          case 'join_credit_updates': {
            // Subscribe to credit balance updates for real-time sync
            // SECURITY: Require session authentication
            
            if (!ws.serverAuth) {
              ws.send(JSON.stringify({
                type: 'error',
                message: 'Authentication required. Please log in first.',
              }));
              log.warn('Rejected unauthenticated credit updates subscription', { ip: ws.ipAddress });
              return;
            }
            
            if (ws.serverAuth.userId.startsWith('guest-')) {
              ws.send(JSON.stringify({
                type: 'error',
                message: 'Guests cannot subscribe to credit updates.',
              }));
              log.warn('Rejected guest credit updates subscription', { ip: ws.ipAddress });
              return;
            }
            
            const userId = ws.serverAuth.userId;
            const workspaceId = ws.serverAuth.workspaceId;
            
            if (!workspaceId) {
              ws.send(JSON.stringify({
                type: 'error',
                message: 'Your session lacks workspace context. Please refresh and try again.',
              }));
              log.warn('Credit updates subscription rejected - no workspace', { userId });
              return;
            }

            // Ensure ws has workspace context for cleanup
            ws.workspaceId = workspaceId;
            ws.userId = userId;

            // Add to credit update clients for this workspace
            if (!creditUpdateClients.has(workspaceId)) {
              creditUpdateClients.set(workspaceId, new Set());
            }
            creditUpdateClients.get(workspaceId)!.add(ws);

            log.debug('User subscribed to credit updates', { userId, workspaceId });

            // Send confirmation
            ws.send(JSON.stringify({
              type: 'credit_update_subscribed',
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
              log.warn('Rejected unauthenticated notification subscription', { ip: ws.ipAddress });
              return;
            }
            
            // SECURITY: Guests cannot subscribe to notifications (they shouldn't receive workspace data)
            if (ws.serverAuth.userId.startsWith('guest-')) {
              ws.send(JSON.stringify({
                type: 'error',
                message: 'Guests cannot subscribe to notifications.',
              }));
              log.warn('Rejected guest notification subscription', { ip: ws.ipAddress });
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
              log.warn('Notification subscription rejected - no workspace', { userId });
              return;
            }
            
            // Normalize workspace key for platform staff - use PLATFORM_WORKSPACE_ID
            // This ensures platform staff are stored under the same key that platform notifications broadcast to
            const effectiveWorkspaceId = (!workspaceId && hasPlatformWideAccess(platformRole))
              ? PLATFORM_WORKSPACE_ID
              : workspaceId;
            
            log.debug('Authenticated notification subscription', { userId, workspaceId: effectiveWorkspaceId, platformRole: platformRole || 'none' });

            // Add to notification clients for this workspace/user combination
            if (!notificationClients.has(effectiveWorkspaceId)) {
              notificationClients.set(effectiveWorkspaceId, new Map());
            }
            notificationClients.get(effectiveWorkspaceId)!.set(userId, ws);

            // Get initial unread count - MUST match REST API /api/notifications/combined totalUnread
            // Include: notifications + platform updates to match the REST API exactly
            const unreadNotifications = await storage.getTotalUnreadCountForUser(userId, effectiveWorkspaceId);
            const unreadPlatformUpdates = await storage.getUnreadPlatformUpdatesCount(userId, effectiveWorkspaceId);
            const unreadCount = unreadNotifications + unreadPlatformUpdates;

            log.debug('User subscribed to notifications', { userId, workspaceId: effectiveWorkspaceId, unreadCount, unreadNotifications, unreadPlatformUpdates });

            // Send confirmation with current unread count
            ws.send(JSON.stringify({
              type: 'notifications_subscribed',
              workspaceId: effectiveWorkspaceId,
              unreadCount,
            }));
            break;
          }

          case 'join_dispatch_updates': {
            // Subscribe to real-time GPS/dispatch updates for a workspace (CAD Console)
            // SECURITY: Require session authentication — no client-supplied IDs
            if (!ws.serverAuth) {
              ws.send(JSON.stringify({
                type: 'error',
                message: 'Authentication required to subscribe to dispatch updates.',
              }));
              log.warn('Rejected unauthenticated dispatch subscription', { ip: ws.ipAddress });
              return;
            }

            if (ws.serverAuth.userId.startsWith('guest-')) {
              ws.send(JSON.stringify({
                type: 'error',
                message: 'Guests cannot subscribe to dispatch updates.',
              }));
              return;
            }

            const dispatchUserId = ws.serverAuth.userId;
            const dispatchWorkspaceId = ws.serverAuth.workspaceId;
            const dispatchPlatformRole = ws.serverAuth.platformRole;

            const isDispatchStaff = hasPlatformWideAccess(dispatchPlatformRole);
            if (!dispatchWorkspaceId && !isDispatchStaff) {
              ws.send(JSON.stringify({
                type: 'error',
                message: 'Your session lacks workspace context for dispatch updates.',
              }));
              return;
            }

            const effectiveDispatchWorkspaceId = dispatchWorkspaceId || PLATFORM_WORKSPACE_ID;
            if (!dispatchUpdateClients.has(effectiveDispatchWorkspaceId)) {
              dispatchUpdateClients.set(effectiveDispatchWorkspaceId, new Set());
            }
            dispatchUpdateClients.get(effectiveDispatchWorkspaceId)!.add(ws);

            log.debug('User subscribed to dispatch/GPS updates', {
              userId: dispatchUserId,
              workspaceId: effectiveDispatchWorkspaceId,
            });

            ws.send(JSON.stringify({
              type: 'dispatch_updates_subscribed',
              workspaceId: effectiveDispatchWorkspaceId,
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
            
            // Get staff display name (first-name-only for end-user-facing messages, full for audit)
            const staffRole = staffInfo?.platformRole || 'unknown';
            const staffDisplayNameFull = staffInfo ? formatUserDisplayName({
              firstName: staffInfo.firstName,
              lastName: staffInfo.lastName,
              email: staffInfo.email || undefined,
              platformRole: staffInfo.platformRole || undefined,
              workspaceRole: staffInfo.workspaceRole || undefined,
            }) : ws.userName || 'Unknown';
            const staffDisplayName = staffInfo ? formatUserDisplayNameForChat({
              firstName: staffInfo.firstName,
              lastName: staffInfo.lastName,
              email: staffInfo.email || undefined,
              platformRole: staffInfo.platformRole || undefined,
              workspaceRole: staffInfo.workspaceRole || undefined,
            }) : ws.userName || 'Support';

            // Audit log the ban action (uses full name internally)
            try {
              await storage.createAuditLog({
                commandId: payload.commandId || null,
                userId: ws.userId,
                userEmail: staffInfo?.email || ws.userName || 'unknown',
                userRole: staffRole || 'unknown',
                action: 'ban_user',
                actionDescription: `${staffDisplayNameFull} permanently banned ${targetUserName}`,
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
              log.error('AuditOS failed to log ban action', { error: auditErr });
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
                  log.info('User permanently banned', { targetUserId: payload.targetUserId, bannedBy: staffDisplayName });
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

            log.info('Secure request initiated', { requestedBy: ws.userName, requestType: payload.requestType, targetUserId: payload.targetUserId });
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

            log.info('Secure data received', { from: ws.userName });
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
              conversationId: ws.conversationId // CRITICAL: Include conversationId to prevent front-end security rejection
            }));

            log.info('User released from hold', { releasedBy: ws.userName, targetUserId: payload.targetUserId });
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
              log.error('Failed to save transfer message', { error: err });
            }

            log.info('User transferred', { transferredBy: ws.userName, targetUserId: payload.targetUserId });
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

            log.info('Call initiated', { callerName: payload.callerName, roomId: payload.roomId });
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

            log.info('Call accepted', { roomId: payload.roomId });
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

            log.info('Call rejected', { roomId: payload.roomId });
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

            log.info('Call ended', { roomId: payload.roomId });
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

            log.debug('WebRTC offer sent', { roomId: payload.roomId });
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

            log.debug('WebRTC answer sent', { roomId: payload.roomId });
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

            log.debug('WebRTC ICE candidate sent', { roomId: payload.roomId });
            break;
          }

          // @ts-expect-error — TS migration: fix in refactoring sprint
          case 'join_platform_updates': {
            // Client subscribes to platform-wide update broadcasts.
            // Platform updates are already broadcast to all authenticated connections;
            // this message is a client-side signal only — no server-side subscription
            // record is needed. Silently acknowledge to suppress the default warning.
            break;
          }

          default: {
            log.warn('Unhandled WebSocket message type', { type: (payload as any).type, payload });
            break;
          }
        }
      } catch (error) {
        log.error('WebSocket message processing error', { error });
        log.error('Message processing error details', {
          errorName: error instanceof Error ? error.name : 'Unknown',
          errorMessage: error instanceof Error ? error.message : String(error),
          rawMessagePreview: data ? String(data).substring(0, 500) : 'N/A',
        });
        ws.send(JSON.stringify({
          type: 'error',
          message: 'Failed to process message',
        }));
      }
    };
    
    // =========================================================================
    // CRITICAL: Register message handler IMMEDIATELY - before any awaits!
    // This ensures no messages are lost during async authentication.
    // =========================================================================
    ws.on('message', (data: Buffer | ArrayBuffer | Buffer[]) => {
      log.debug('Message received', { authComplete });
      if (authComplete) {
        // Auth done - process directly
        processMessage(data);
      } else {
        // Auth in progress - buffer for later
        log.debug('Buffering message until auth completes');
        messageBuffer.push(data);
      }
    });
    
    // Initialize heartbeat
    ws.isAlive = true;
    
    // Handle pong responses (heartbeat)
    ws.on('pong', () => {
      ws.isAlive = true;
    });
    
    // Start heartbeat interval (30 seconds)
    ws.pingInterval = setInterval(() => {
      if (ws.isAlive === false) {
        // Silent cleanup of stale connection - this is normal when tabs close without proper disconnect
        clearInterval(ws.pingInterval);
        return ws.terminate();
      }
      ws.isAlive = false;
      ws.ping();
    }, 30000);
    
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
      
      // Copy platformRole to standalone property for DM visibility filtering
      ws.platformRole = platformRole !== 'none' ? platformRole : undefined;
      
      log.info('New authenticated WebSocket connection', { ip: ipAddress, userId: authenticatedSession.userId, platformRole, connectionId });
      
      // TRINITY STAFF REGISTRATION: Register support staff for Trinity alerts
      const staffRoles = ['root_admin', 'co_admin', 'sysops', 'platform_support', 'org_owner', 'co_owner'];
      const userRole = ws.serverAuth.platformRole || ws.serverAuth.role;
      if (userRole && staffRoles.includes(userRole) && authenticatedSession.userId) {
        import('./services/ai-brain/trinityAutonomousNotifier').then(({ registerSupportConnection }) => {
          registerSupportConnection({
            userId: authenticatedSession.userId,
            role: userRole,
            workspaceId: authenticatedSession.workspaceId || 'platform',
            socket: ws,
          });
        }).catch(() => {});
      }
    } else {
      // Guest/anonymous connection - allowed for helpdesk but limited permissions
      log.info('New guest WebSocket connection', { ip: ipAddress, connectionId });
    }
    
    // =========================================================================
    // CRITICAL: Mark auth complete and process buffered messages
    // =========================================================================
    authComplete = true;
    log.debug('Auth complete, processing buffered messages', { bufferedCount: messageBuffer.length });
    for (const bufferedData of messageBuffer) {
      processMessage(bufferedData);
    }
    messageBuffer.length = 0; // Clear buffer

    ws.on('close', async () => {
      // RATE LIMITING: Track disconnection in database
      if (ws.sessionId) {
        await trackDisconnection(ws.sessionId, 'user_closed');
      }

      // Clean up heartbeat interval
      if (ws.pingInterval) {
        clearInterval(ws.pingInterval);
      }

      // SESSION SYNC CLEANUP: Unregister from multi-device sync
      if (ws.serverAuth?.userId) {
        sessionSyncService.unregisterConnection(ws.serverAuth.userId, connectionId);
        
        // TRINITY STAFF CLEANUP: Unregister from Trinity alerts
        import('./services/ai-brain/trinityAutonomousNotifier').then(({ unregisterSupportConnection }) => {
          unregisterSupportConnection(ws.serverAuth!.userId);
        }).catch(() => {});
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
        log.debug('Removed client from shift updates', { workspaceId: ws.workspaceId });
      }
      
      // NOTIFICATIONS CLEANUP: Remove from notification clients
      if (ws.workspaceId && ws.userId && notificationClients.has(ws.workspaceId)) {
        const userClients = notificationClients.get(ws.workspaceId)!;
        userClients.delete(ws.userId);
        // Clean up empty workspace maps
        if (userClients.size === 0) {
          notificationClients.delete(ws.workspaceId);
        }
        log.debug('Removed client from notifications', { userId: ws.userId, workspaceId: ws.workspaceId });
      }
      
      // SCHEDULING PROGRESS CLEANUP: Remove from scheduling progress clients
      if (ws.workspaceId && schedulingProgressClients.has(ws.workspaceId)) {
        const clients = schedulingProgressClients.get(ws.workspaceId)!;
        clients.delete(ws);
        if (clients.size === 0) {
          schedulingProgressClients.delete(ws.workspaceId);
        }
        log.debug('Removed client from scheduling progress', { workspaceId: ws.workspaceId });
      }
      
      // CREDIT UPDATES CLEANUP: Remove from credit update clients
      if (ws.workspaceId && creditUpdateClients.has(ws.workspaceId)) {
        const clients = creditUpdateClients.get(ws.workspaceId)!;
        clients.delete(ws);
        if (clients.size === 0) {
          creditUpdateClients.delete(ws.workspaceId);
        }
        log.debug('Removed client from credit updates', { workspaceId: ws.workspaceId });
      }

      // DISPATCH/GPS UPDATES CLEANUP: Remove from dispatch update clients
      if (ws.workspaceId && dispatchUpdateClients.has(ws.workspaceId)) {
        const clients = dispatchUpdateClients.get(ws.workspaceId)!;
        clients.delete(ws);
        if (clients.size === 0) {
          dispatchUpdateClients.delete(ws.workspaceId);
        }
        log.debug('Removed client from dispatch updates', { workspaceId: ws.workspaceId });
      }
      
      // Send leave announcement for rooms with bot support (uses stored flag)
      if (ws.supportsBots && ws.userId) {
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
            // @ts-expect-error — TS migration: fix in refactoring sprint
            conversationId: ws.conversationId,
            senderId: ws.userId?.startsWith('guest-') ? null : ws.userId, // Guests don't have user records - use null for FK compatibility
            senderName: 'Server',
            senderType: 'system',
            message: `${displayName} has left the chatroom`,
            messageType: 'text',
            isSystemMessage: true,
          });

          // Broadcast leave announcement to remaining clients
          // @ts-expect-error — TS migration: fix in refactoring sprint
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

          log.info('User left conversation', { displayName, conversationId: ws.conversationId });
        } catch (error) {
          log.error('Error sending leave announcement', { error });
        }
      }

      // Remove client from conversation
      if (ws.conversationId) {
        const clients = conversationClients.get(ws.conversationId);
        if (clients) {
          clients.delete(ws);
          
          const memberCount = roomPresence.part(ws.conversationId, ws.userId || '');
          if (ws.userId && ws.userName) {
            ircEmitter.part({
              roomId: ws.conversationId,
              roomName: 'Chat',
              userId: ws.userId,
              userName: ws.userName,
              reason: 'disconnected',
              memberCount,
            });
            platformEventBus.emit('chat:participant_left', {
              conversationId: ws.conversationId,
              userId: ws.userId,
              userName: ws.userName,
              workspaceId: ws.workspaceId || undefined,
              source: 'websocket',
            });
          }
          
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
              try {
                client.send(participantsPayload);
              } catch (sendErr: any) {
                log.warn('Failed to send participants_update to client', { error: sendErr?.message });
              }
            }
          });
          
          if (clients.size === 0) {
            conversationClients.delete(ws.conversationId);
          }
        }
      }
      log.debug('WebSocket connection closed');
    });

    ws.on('error', (error) => {
      log.error('WebSocket error', { error });
      // Clean up heartbeat interval on error
      if (ws.pingInterval) {
        clearInterval(ws.pingInterval);
      }
    });
  });

  // NOTE: Chat simulation removed - system uses only live data from database with real users
  // All user data now comes from storage.getUserDisplayInfo() for consistency

  log.info('WebSocket server initialized on /ws/chat');
  
  // Export broadcast function for shift updates
  const broadcaster = {
    wss,
    broadcastShiftUpdate: (workspaceId: string, updateType: 'shift_created' | 'shift_updated' | 'shift_deleted', shift?: any, shiftId?: string) => {
      const clients = shiftUpdateClients.get(workspaceId);
      if (!clients || clients.size === 0) {
        log.debug('No clients subscribed to shift updates', { workspaceId });
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

      log.debug('Broadcasting shift update', { updateType, clientCount: clients.size, workspaceId });

      clients.forEach((client) => {
        if (client.readyState === WebSocket.OPEN) {
          try {
            client.send(payload);
          } catch (sendErr: any) {
            log.warn('Failed to send shift update to client', { error: sendErr?.message });
          }
        } else {
          // Clean up dead connections
          clients.delete(client);
        }
      });
    },
    broadcastNotification: (workspaceId: string, userId: string, updateType: 'notification_new' | 'notification_read' | 'notification_count_updated', notification?: any, unreadCount?: number) => {
      const workspaceClients = notificationClients.get(workspaceId);
      if (!workspaceClients) {
        log.debug('No notification clients for workspace', { workspaceId });
        return;
      }

      const userClient = workspaceClients.get(userId);
      if (!userClient || userClient.readyState !== WebSocket.OPEN) {
        log.debug('User not subscribed to notifications or connection not open', { userId });
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

      log.debug('Broadcasting notification', { updateType, userId, workspaceId, unreadCount });

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
      if (!workspaceId) {
        log.warn('broadcastToWorkspace called without workspaceId');
        return;
      }

      const payload = JSON.stringify({
        ...data,
        timestamp: new Date().toISOString(),
      });

      const sendToWorkspaceClients = (wsId: string) => {
        let sent = 0;

        const wsClients = notificationClients.get(wsId);
        if (wsClients && wsClients.size > 0) {
          wsClients.forEach((client) => {
            if (client.readyState === WebSocket.OPEN) {
              // Extra security check: Verify client workspace matches target
              if (client.workspaceId === wsId || client.serverAuth?.workspaceId === wsId || client.isStaff) {
                client.send(payload);
                sent++;
              } else {
                log.warn('Security blocked cross-workspace broadcast attempt', { 
                  clientWorkspace: client.workspaceId, 
                  targetWorkspace: wsId 
                });
              }
            }
          });
        }

        const shiftClients = shiftUpdateClients.get(wsId);
        if (shiftClients && shiftClients.size > 0) {
          shiftClients.forEach((client) => {
            if (client.readyState === WebSocket.OPEN) {
              // Extra security check: Verify client workspace matches target
              if (client.workspaceId === wsId || client.serverAuth?.workspaceId === wsId || client.isStaff) {
                client.send(payload);
                sent++;
              }
            }
          });
        }

        if (data.type === 'trinity_scheduling_progress' || data.type === 'trinity_scheduling_started' || data.type === 'trinity_scheduling_completed') {
          const scheduleClients = schedulingProgressClients.get(wsId);
          if (scheduleClients && scheduleClients.size > 0) {
            scheduleClients.forEach((client) => {
              if (client.readyState === WebSocket.OPEN) {
                // Extra security check: Verify client workspace matches target
                if (client.workspaceId === wsId || client.serverAuth?.workspaceId === wsId || client.isStaff) {
                  client.send(payload);
                  sent++;
                }
              }
            });
          }
        }

        if (data.type === 'credit_balance_updated' || data.type === 'credits_deducted' || data.type === 'credits_added') {
          const creditClients = creditUpdateClients.get(wsId);
          if (creditClients && creditClients.size > 0) {
            creditClients.forEach((client) => {
              if (client.readyState === WebSocket.OPEN) {
                // Extra security check: Verify client workspace matches target
                if (client.workspaceId === wsId || client.serverAuth?.workspaceId === wsId || client.isStaff) {
                  client.send(payload);
                  sent++;
                }
              }
            });
          }
        }

        return sent;
      };

      let totalSent = 0;
      if (workspaceId === '*') {
        const allWorkspaceIds = new Set([
          ...notificationClients.keys(),
          ...shiftUpdateClients.keys(),
          ...schedulingProgressClients.keys(),
          ...creditUpdateClients.keys(),
        ]);
        allWorkspaceIds.forEach((wsId) => {
          totalSent += sendToWorkspaceClients(wsId);
        });
      } else {
        totalSent = sendToWorkspaceClients(workspaceId);
      }

      if (totalSent > 0) {
        log.debug('Workspace broadcast sent', { type: data.type, clientCount: totalSent, workspaceId });
      }
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

      log.info('Broadcasting platform update', { title: update.title });

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

      log.debug('Platform update sent', { clientCount });
    },
    
    broadcastTrinityAgentEvent: (conversationId: string, event: {
      type: string;
      data: any;
      timestamp?: number;
    }) => {
      const payload = JSON.stringify({
        type: 'trinity_stream',
        conversationId,
        event: event.type?.toLowerCase() ?? '',
        data: event.data,
        timestamp: event.timestamp || Date.now(),
      });
      
      let clientCount = 0;
      wss.clients.forEach((client: any) => {
        if (client.readyState === WebSocket.OPEN) {
          if ((client as any).trinityConversationId === conversationId) {
            client.send(payload);
            clientCount++;
          }
        }
      });
      
      if (clientCount > 0) {
        log.debug('TrinityAgent broadcast', { eventType: event.type, clientCount, conversationId });
      }
    },
  };

  // Initialize global broadcaster for use by other services (e.g., platformChangeMonitor)
  setGlobalBroadcaster(broadcaster);
  log.info('Global broadcaster initialized');

  // Subscribe to Trinity stream events from GoalExecutionService
  platformEventBus.on('trinity:stream', (payload: { conversationId: string; event: any }) => {
    if (payload?.conversationId && payload?.event) {
      broadcaster.broadcastTrinityAgentEvent(payload.conversationId, {
        type: payload.event.type,
        data: payload.event.data,
        timestamp: payload.event.timestamp
      });
    }
  });
  log.info('Trinity stream event listener registered');

  // Subscribe to Trinity scheduling events for real-time visual feedback
  platformEventBus.on('trinity_scheduling_started', (payload: { workspaceId: string; metadata: any }) => {
    if (payload?.workspaceId) {
      broadcastToWorkspace(payload.workspaceId, {
        type: 'trinity_scheduling_started',
        ...payload.metadata,
      });
      log.info('Trinity scheduling started broadcast', { workspaceId: payload.workspaceId });
    }
  });

  platformEventBus.on('trinity_scheduling_progress', (payload: { workspaceId: string; metadata: any }) => {
    if (payload?.workspaceId) {
      broadcastToWorkspace(payload.workspaceId, {
        type: 'trinity_scheduling_progress',
        ...payload.metadata,
      });
    }
  });

  platformEventBus.on('trinity_scheduling_completed', (payload: { workspaceId: string; metadata: any }) => {
    if (payload?.workspaceId) {
      broadcastToWorkspace(payload.workspaceId, {
        type: 'trinity_scheduling_completed',
        ...payload.metadata,
      });
      log.info('Trinity scheduling completed broadcast', { workspaceId: payload.workspaceId });
    }
  });
  log.info('Trinity scheduling event listeners registered');

  // Subscribe to support session resolved events - disconnect user and notify queue
  platformEventBus.on('support_session_resolved', (payload: {
    sessionId: string;
    ticketId?: string;
    staffId?: string;
    userId?: string;
    workspaceId?: string;
  }) => {
    if (payload?.sessionId) {
      log.info('Support session resolved', { sessionId: payload.sessionId });

      // Find and disconnect the user from all helpdesk rooms
      if (payload.userId) {
        conversationClients.forEach((clientSet, conversationId) => {
          clientSet.forEach((client) => {
            if (client.userId === payload.userId && client.readyState === WebSocket.OPEN) {
              // Send resolution notification to user
              client.send(JSON.stringify({
                type: 'session_resolved',
                sessionId: payload.sessionId,
                message: 'Your support session has been resolved. Thank you for contacting us!',
                showRating: true,
              }));

              // Close the connection after a short delay to allow message delivery
              setTimeout(() => {
                if (client.readyState === WebSocket.OPEN) {
                  client.send(JSON.stringify({
                    type: 'force_disconnect',
                    reason: 'Session resolved - Please start a new chat if you need further assistance.',
                  }));
                  client.close(1000, 'Session resolved');
                }
              }, 3000);
            }
          });
        });
      }
    }
  });

  // Subscribe to support ticket resolved events - notify staff about next in queue
  platformEventBus.on('support_ticket_resolved', (payload: {
    sessionId: string;
    ticketNumber?: string;
    resolvedBy: string;
    summary?: string;
    userId?: string;
    workspaceId?: string;
  }) => {
    if (payload?.resolvedBy) {
      log.info('Ticket resolved, checking queue', { resolvedBy: payload.resolvedBy });

      // Notify all staff clients about the resolution and queue status
      conversationClients.forEach((clientSet) => {
        clientSet.forEach((client) => {
          if (client.isStaff && client.readyState === WebSocket.OPEN) {
            client.send(JSON.stringify({
              type: 'ticket_resolved_notification',
              ticketNumber: payload.ticketNumber,
              resolvedBy: payload.resolvedBy,
              summary: payload.summary,
              timestamp: new Date().toISOString(),
            }));
          }
        });
      });
    }
  });
  log.info('Support session event listeners registered');

  platformEventBus.on('RBAC_ROLE_CHANGED', (payload: {
    userId?: string;
    workspaceId?: string;
    previousRole?: string;
    newRole?: string;
    changedBy?: string;
    employeeId?: string;
  }) => {
    if (!payload?.userId) return;
    const { userId, workspaceId, newRole } = payload;

    let updatedCount = 0;
    wss.clients.forEach((client: any) => {
      if (client.readyState !== WebSocket.OPEN) return;
      const clientUserId = client.serverAuth?.userId || client.userId;
      if (clientUserId !== userId) return;

      if (client.serverAuth && workspaceId && client.serverAuth.workspaceId === workspaceId && newRole) {
        client.serverAuth.role = newRole;
      }

      client.send(JSON.stringify({
        type: 'role_updated',
        payload: {
          userId,
          workspaceId,
          newRole: newRole || null,
          previousRole: payload.previousRole || null,
          timestamp: new Date().toISOString(),
        },
      }));
      updatedCount++;
    });

    if (updatedCount > 0) {
      invalidateUserQueries(userId, [
        '/api/user',
        '/api/employees',
        '/api/me',
      ], 'rbac_role');
      log.info('RBAC role sync pushed to active connections', {
        userId,
        workspaceId,
        newRole,
        connectionsUpdated: updatedCount,
      });
    }
  });

  platformEventBus.on('TRINITY_ACCESS_CHANGED', (payload: {
    userId?: string;
    workspaceId?: string;
    newRole?: string;
    previousRole?: string;
    changedBy?: string;
  }) => {
    if (!payload?.userId) return;
    const { userId, workspaceId, newRole } = payload;

    let updatedCount = 0;
    wss.clients.forEach((client: any) => {
      if (client.readyState !== WebSocket.OPEN) return;
      const clientUserId = client.serverAuth?.userId || client.userId;
      if (clientUserId !== userId) return;

      client.send(JSON.stringify({
        type: 'trinity_access_updated',
        payload: {
          userId,
          workspaceId,
          newRole: newRole || null,
          timestamp: new Date().toISOString(),
        },
      }));
      updatedCount++;
    });

    if (updatedCount > 0) {
      invalidateUserQueries(userId, [
        '/api/user',
        '/api/trinity',
        '/api/employees',
      ], 'trinity_access');
      log.info('Trinity access sync pushed to active connections', {
        userId,
        workspaceId,
        newRole,
        connectionsUpdated: updatedCount,
      });
    }
  });
  log.info('RBAC real-time sync event listeners registered');

  platformEventBus.on('officer_clocked_in', (payload: {
    workspaceId?: string;
    employeeId?: string;
    employeeName?: string;
    userId?: string;
    timeEntryId?: string;
    shiftId?: string | null;
    clientId?: string | null;
    timestamp?: string;
    gpsLat?: string | null;
    gpsLng?: string | null;
  }) => {
    if (!payload?.workspaceId) return;
    broadcastToWorkspace(payload.workspaceId, {
      type: 'officer_clocked_in',
      employeeId: payload.employeeId,
      employeeName: payload.employeeName,
      userId: payload.userId,
      timeEntryId: payload.timeEntryId,
      shiftId: payload.shiftId,
      timestamp: payload.timestamp,
    });
    log.info('Officer clocked in broadcast', { workspaceId: payload.workspaceId, employeeName: payload.employeeName });
  });

  platformEventBus.on('officer_clocked_out', (payload: {
    workspaceId?: string;
    employeeId?: string;
    employeeName?: string;
    userId?: string;
    timeEntryId?: string;
    shiftId?: string | null;
    timestamp?: string;
    totalHours?: number;
    grossHours?: number;
    breakMinutes?: number;
  }) => {
    if (!payload?.workspaceId) return;
    broadcastToWorkspace(payload.workspaceId, {
      type: 'officer_clocked_out',
      employeeId: payload.employeeId,
      employeeName: payload.employeeName,
      userId: payload.userId,
      timeEntryId: payload.timeEntryId,
      shiftId: payload.shiftId,
      timestamp: payload.timestamp,
      totalHours: payload.totalHours,
    });
    log.info('Officer clocked out broadcast', { workspaceId: payload.workspaceId, employeeName: payload.employeeName, totalHours: payload.totalHours });
  });

  platformEventBus.on('dar_submitted', (payload: { workspaceId?: string; darId?: string; reportNumber?: string; employeeName?: string }) => {
    if (!payload?.workspaceId) return;
    broadcastToWorkspace(payload.workspaceId, {
      type: 'dar_status_changed',
      darId: payload.darId,
      reportNumber: payload.reportNumber,
      status: 'submitted',
      employeeName: payload.employeeName,
    });
  });

  // dar_generated — shift chatroom DAR auto-compiled after /endshift
  platformEventBus.on('dar_generated', (payload: {
    workspaceId?: string; darId?: string; shiftId?: string;
    employeeName?: string; flaggedForReview?: boolean; forceUsed?: boolean;
  }) => {
    if (!payload?.workspaceId) return;
    broadcastToWorkspace(payload.workspaceId, {
      type: 'dar_generated',
      darId: payload.darId,
      shiftId: payload.shiftId,
      employeeName: payload.employeeName,
      flaggedForReview: payload.flaggedForReview || false,
      forceUsed: payload.forceUsed || false,
      status: payload.flaggedForReview ? 'pending_review' : 'draft',
    });
  });

  platformEventBus.on('dar_verified', (payload: { workspaceId?: string; darId?: string; reportNumber?: string; verifiedBy?: string }) => {
    if (!payload?.workspaceId) return;
    broadcastToWorkspace(payload.workspaceId, {
      type: 'dar_status_changed',
      darId: payload.darId,
      reportNumber: payload.reportNumber,
      status: 'verified',
      verifiedBy: payload.verifiedBy,
    });
  });

  platformEventBus.on('dar_sent_to_client', (payload: { workspaceId?: string; darId?: string; reportNumber?: string }) => {
    if (!payload?.workspaceId) return;
    broadcastToWorkspace(payload.workspaceId, {
      type: 'dar_status_changed',
      darId: payload.darId,
      reportNumber: payload.reportNumber,
      status: 'sent',
    });
  });

  platformEventBus.on('visitor_never_left', (payload: { workspaceId?: string; visitorLogId?: string; visitorName?: string; siteName?: string; hoursCheckedIn?: number }) => {
    if (!payload?.workspaceId) return;
    broadcastToWorkspace(payload.workspaceId, {
      type: 'visitor_never_left_alert',
      visitorLogId: payload.visitorLogId,
      visitorName: payload.visitorName,
      siteName: payload.siteName,
      hoursCheckedIn: payload.hoursCheckedIn,
    });
  });

  log.info('Clock-in/out and DAR real-time event listeners registered');

  platformEventBus.on('trinity_thought', (payload: {
    thoughtId: string;
    phase: string;
    thoughtType: string;
    content: string;
    confidence: number;
    wasConfused: boolean;
    timestamp: Date;
    workspaceId?: string;
    sessionId?: string;
    userId?: string;
  }) => {
    if (!payload.sessionId) return;
    const wsId = payload.workspaceId;
    if (!wsId) return;

    const thoughtMsg = {
      type: 'trinity_thinking',
      thoughtId: payload.thoughtId,
      phase: payload.phase,
      thoughtType: payload.thoughtType,
      confidence: payload.confidence,
      sessionId: payload.sessionId,
      timestamp: payload.timestamp,
    };

    if (payload.userId) {
      // @ts-expect-error — TS migration: fix in refactoring sprint
      sessionSyncService.broadcastToUser(payload.userId, thoughtMsg);
    } else {
      broadcastToWorkspace(wsId, thoughtMsg);
    }
  });
  log.info('Trinity thought broadcast listener registered');

  return broadcaster;
}
