/**
 * IRC-Style Event Registry for CoAIleague Chat System
 * 
 * Provides standardized event types and payloads for real-time chat operations.
 * Designed for dynamic rooms (meetings, trainings, client chats) with fast event propagation.
 * 
 * Event Categories:
 * - CONNECTION: Client lifecycle (connect, disconnect, ping/pong)
 * - ROOM: Room lifecycle (create, join, part, destroy, topic, mode)
 * - MESSAGE: All message types (privmsg, notice, action, system)
 * - PRESENCE: User state (online, away, typing, idle)
 * - MODERATION: Admin actions (kick, ban, mute, promote)
 * - QUERY: Information requests (who, names, list, whois)
 */
import { createLogger } from '../lib/logger';
import { isPlatformStaffRole, isWorkspaceLeadershipRole } from '../../shared/config/rbac';
const log = createLogger('ircEventRegistry');

/**
 * RBAC guard for IRC moderation actions.
 * Platform staff or workspace leadership can kick/ban/mute.
 * Returns true if the actor is authorized.
 */
export function canPerformModerationAction(actorRole: string, platformRole?: string): boolean {
  return isPlatformStaffRole(platformRole) || isWorkspaceLeadershipRole(actorRole);
}

export const IRC_EVENTS = {
  // === CONNECTION EVENTS ===
  CONNECT: 'irc:connect',           // Client connected to server
  DISCONNECT: 'irc:disconnect',     // Client disconnected
  PING: 'irc:ping',                 // Keepalive ping
  PONG: 'irc:pong',                 // Keepalive response
  AUTH: 'irc:auth',                 // Authentication complete
  AUTH_FAIL: 'irc:auth_fail',       // Authentication failed
  RECONNECT: 'irc:reconnect',       // Client reconnecting
  
  // === ROOM LIFECYCLE EVENTS ===
  JOIN: 'irc:join',                 // User joined room
  PART: 'irc:part',                 // User left room
  QUIT: 'irc:quit',                 // User quit all rooms (disconnect)
  CREATE: 'irc:create',             // Room created
  DESTROY: 'irc:destroy',           // Room destroyed/closed
  TOPIC: 'irc:topic',               // Room topic changed
  MODE: 'irc:mode',                 // Room mode changed (permissions, settings)
  INVITE: 'irc:invite',             // User invited to room
  KICK: 'irc:kick',                 // User kicked from room
  
  // === MESSAGE EVENTS ===
  PRIVMSG: 'irc:privmsg',           // Private/room message
  NOTICE: 'irc:notice',             // System/bot notice (no reply expected)
  ACTION: 'irc:action',             // /me style action message
  SYSTEM: 'irc:system',             // System announcement
  MOTD: 'irc:motd',                 // Message of the day (room welcome)
  ERROR: 'irc:error',               // Error message
  ACK: 'irc:ack',                   // Message acknowledgment (delivered/read)
  
  // === PRESENCE EVENTS ===
  ONLINE: 'irc:online',             // User came online
  OFFLINE: 'irc:offline',           // User went offline
  AWAY: 'irc:away',                 // User set away status
  BACK: 'irc:back',                 // User returned from away
  TYPING: 'irc:typing',             // User started typing
  TYPING_STOP: 'irc:typing_stop',   // User stopped typing
  IDLE: 'irc:idle',                 // User went idle (timeout)
  
  // === MODERATION EVENTS ===
  BAN: 'irc:ban',                   // User banned from room
  UNBAN: 'irc:unban',               // User unbanned
  MUTE: 'irc:mute',                 // User muted (can't send messages)
  UNMUTE: 'irc:unmute',             // User unmuted
  PROMOTE: 'irc:promote',           // User promoted (given permissions)
  DEMOTE: 'irc:demote',             // User demoted (permissions removed)
  WARN: 'irc:warn',                 // User warned by moderator
  
  // === QUERY EVENTS ===
  WHO: 'irc:who',                   // Request list of users in room
  WHO_REPLY: 'irc:who_reply',       // Response to WHO
  NAMES: 'irc:names',               // Request names in room (simpler than WHO)
  NAMES_REPLY: 'irc:names_reply',   // Response to NAMES
  LIST: 'irc:list',                 // Request list of available rooms
  LIST_REPLY: 'irc:list_reply',     // Response to LIST
  WHOIS: 'irc:whois',               // Request user info
  WHOIS_REPLY: 'irc:whois_reply',   // Response to WHOIS
  
  // === ROOM STATE SYNC ===
  SYNC: 'irc:sync',                 // Full room state sync (after reconnect)
  DELTA: 'irc:delta',               // Incremental state update
  HISTORY: 'irc:history',           // Historical messages batch
} as const;

export type IRCEventType = typeof IRC_EVENTS[keyof typeof IRC_EVENTS];

// Event payload interfaces
export interface IRCBasePayload {
  event: IRCEventType;
  timestamp: number;
  commandId?: string;  // For request-response tracking
}

export interface IRCJoinPayload extends IRCBasePayload {
  event: typeof IRC_EVENTS.JOIN;
  roomId: string;
  roomName: string;
  userId: string;
  userName: string;
  userRole?: string;
  isBot?: boolean;
  memberCount?: number;
}

export interface IRCPartPayload extends IRCBasePayload {
  event: typeof IRC_EVENTS.PART;
  roomId: string;
  roomName: string;
  userId: string;
  userName: string;
  reason?: string;
  memberCount?: number;
}

export interface IRCPrivmsgPayload extends IRCBasePayload {
  event: typeof IRC_EVENTS.PRIVMSG;
  roomId: string;
  messageId: string;
  senderId: string;
  senderName: string;
  content: string;
  isPrivate?: boolean;
  recipientId?: string;
  replyTo?: string;
  metadata?: Record<string, unknown>;
}

export interface IRCNoticePayload extends IRCBasePayload {
  event: typeof IRC_EVENTS.NOTICE;
  roomId?: string;
  source: 'system' | 'bot' | 'moderator';
  content: string;
  priority?: 'low' | 'normal' | 'high' | 'urgent';
}

export interface IRCTypingPayload extends IRCBasePayload {
  event: typeof IRC_EVENTS.TYPING | typeof IRC_EVENTS.TYPING_STOP;
  roomId: string;
  userId: string;
  userName: string;
}

export interface IRCPresencePayload extends IRCBasePayload {
  event: typeof IRC_EVENTS.ONLINE | typeof IRC_EVENTS.OFFLINE | typeof IRC_EVENTS.AWAY | typeof IRC_EVENTS.BACK;
  userId: string;
  userName: string;
  status: 'online' | 'offline' | 'away' | 'idle';
  roomId?: string;  // Room scope for targeted broadcast (if omitted, may be global)
  lastSeen?: number;
  awayMessage?: string;
}

export interface IRCNamesReplyPayload extends IRCBasePayload {
  event: typeof IRC_EVENTS.NAMES_REPLY;
  roomId: string;
  roomName: string;
  users: Array<{
    userId: string;
    userName: string;
    role?: string;
    status: 'online' | 'away' | 'idle';
    isBot?: boolean;
  }>;
  totalCount: number;
}

export interface IRCTopicPayload extends IRCBasePayload {
  event: typeof IRC_EVENTS.TOPIC;
  roomId: string;
  roomName: string;
  topic: string;
  setBy: string;
  setByName: string;
}

export interface IRCModePayload extends IRCBasePayload {
  event: typeof IRC_EVENTS.MODE;
  roomId: string;
  roomName: string;
  mode: string;
  value?: boolean | string;
  setBy: string;
  setByName: string;
}

export interface IRCSyncPayload extends IRCBasePayload {
  event: typeof IRC_EVENTS.SYNC;
  roomId: string;
  roomName: string;
  topic?: string;
  users: Array<{
    userId: string;
    userName: string;
    role?: string;
    status: 'online' | 'away' | 'idle';
  }>;
  modes: Record<string, boolean | string>;
  recentMessages?: Array<{
    messageId: string;
    senderId: string;
    senderName: string;
    content: string;
    timestamp: number;
  }>;
}

export interface IRCAckPayload extends IRCBasePayload {
  event: typeof IRC_EVENTS.ACK;
  messageId: string;
  status: 'sent' | 'delivered' | 'read' | 'failed';
  recipientId?: string;
  error?: string;
}

// Union type for all payloads
export type IRCPayload = 
  | IRCJoinPayload 
  | IRCPartPayload 
  | IRCPrivmsgPayload 
  | IRCNoticePayload
  | IRCTypingPayload
  | IRCPresencePayload
  | IRCNamesReplyPayload
  | IRCTopicPayload
  | IRCModePayload
  | IRCSyncPayload
  | IRCAckPayload
  | IRCBasePayload;

/**
 * IRC Event Emitter - Fast event construction and emission
 */
export class IRCEventEmitter {
  private broadcaster: ((payload: any) => void) | null = null;
  private typingTimeouts: Map<string, NodeJS.Timeout> = new Map();
  private readonly TYPING_TIMEOUT_MS = 3000; // Auto-stop typing after 3s

  setBroadcaster(fn: (payload: any) => void) {
    this.broadcaster = fn;
  }

  private emit(payload: IRCPayload) {
    if (this.broadcaster) {
      this.broadcaster({
        type: 'irc_event',
        ...payload,
      });
    }
  }

  // === ROOM EVENTS ===
  
  join(params: {
    roomId: string;
    roomName: string;
    userId: string;
    userName: string;
    userRole?: string;
    isBot?: boolean;
    memberCount?: number;
    commandId?: string;
  }) {
    this.emit({
      event: IRC_EVENTS.JOIN,
      timestamp: Date.now(),
      ...params,
    });
    log.info(`[IRC] JOIN ${params.roomName} by ${params.userName}`);
  }

  part(params: {
    roomId: string;
    roomName: string;
    userId: string;
    userName: string;
    reason?: string;
    memberCount?: number;
    commandId?: string;
  }) {
    this.emit({
      event: IRC_EVENTS.PART,
      timestamp: Date.now(),
      ...params,
    });
    log.info(`[IRC] PART ${params.roomName} by ${params.userName}: ${params.reason || 'left'}`);
  }

  quit(params: {
    userId: string;
    userName: string;
    reason?: string;
    commandId?: string;
  }) {
    this.emit({
      event: IRC_EVENTS.QUIT,
      timestamp: Date.now(),
      ...params,
    } as IRCBasePayload);
    log.info(`[IRC] QUIT ${params.userName}: ${params.reason || 'disconnected'}`);
  }

  // === MESSAGE EVENTS ===
  
  privmsg(params: {
    roomId: string;
    messageId: string;
    senderId: string;
    senderName: string;
    content: string;
    isPrivate?: boolean;
    recipientId?: string;
    replyTo?: string;
    metadata?: Record<string, unknown>;
    commandId?: string;
  }) {
    this.emit({
      event: IRC_EVENTS.PRIVMSG,
      timestamp: Date.now(),
      ...params,
    });
  }

  notice(params: {
    roomId?: string;
    source: 'system' | 'bot' | 'moderator';
    content: string;
    priority?: 'low' | 'normal' | 'high' | 'urgent';
    commandId?: string;
  }) {
    this.emit({
      event: IRC_EVENTS.NOTICE,
      timestamp: Date.now(),
      ...params,
    });
  }

  /**
   * Send a bot message to a room - wraps privmsg with bot-specific defaults
   * Used for HelpAI, Trinity, and other automated responses
   */
  botMessage(params: {
    roomId: string;
    messageId: string;
    botId: string;
    botName: string;
    content: string;
    isPrivate?: boolean;
    recipientId?: string;
    replyTo?: string;
    metadata?: Record<string, unknown>;
    commandId?: string;
  }) {
    this.emit({
      event: IRC_EVENTS.PRIVMSG,
      timestamp: Date.now(),
      roomId: params.roomId,
      messageId: params.messageId,
      senderId: params.botId,
      senderName: params.botName,
      content: params.content,
      isPrivate: params.isPrivate,
      recipientId: params.recipientId,
      replyTo: params.replyTo,
      metadata: {
        ...params.metadata,
        isBot: true,
        botId: params.botId,
      },
      commandId: params.commandId,
    });
  }

  system(params: {
    roomId?: string;
    content: string;
    commandId?: string;
  }) {
    this.emit({
      event: IRC_EVENTS.SYSTEM,
      timestamp: Date.now(),
      ...params,
    } as IRCBasePayload);
  }

  ack(params: {
    messageId: string;
    status: 'sent' | 'delivered' | 'read' | 'failed';
    recipientId?: string;
    error?: string;
    commandId?: string;
  }) {
    this.emit({
      event: IRC_EVENTS.ACK,
      timestamp: Date.now(),
      ...params,
    });
  }

  // === PRESENCE EVENTS ===
  
  typing(params: {
    roomId: string;
    userId: string;
    userName: string;
    commandId?: string;
  }) {
    const key = `${params.roomId}:${params.userId}`;
    
    // Clear existing timeout
    const existing = this.typingTimeouts.get(key);
    if (existing) clearTimeout(existing);
    
    // Emit typing event
    this.emit({
      event: IRC_EVENTS.TYPING,
      timestamp: Date.now(),
      ...params,
    });
    
    // Auto-stop typing after timeout
    const timeout = setTimeout(() => {
      this.typingStop(params);
      this.typingTimeouts.delete(key);
    }, this.TYPING_TIMEOUT_MS);
    
    this.typingTimeouts.set(key, timeout);
  }

  typingStop(params: {
    roomId: string;
    userId: string;
    userName: string;
    commandId?: string;
  }) {
    const key = `${params.roomId}:${params.userId}`;
    const existing = this.typingTimeouts.get(key);
    if (existing) {
      clearTimeout(existing);
      this.typingTimeouts.delete(key);
    }
    
    this.emit({
      event: IRC_EVENTS.TYPING_STOP,
      timestamp: Date.now(),
      ...params,
    });
  }

  online(params: {
    userId: string;
    userName: string;
    commandId?: string;
  }) {
    this.emit({
      event: IRC_EVENTS.ONLINE,
      timestamp: Date.now(),
      status: 'online',
      ...params,
    });
  }

  offline(params: {
    userId: string;
    userName: string;
    commandId?: string;
  }) {
    this.emit({
      event: IRC_EVENTS.OFFLINE,
      timestamp: Date.now(),
      status: 'offline',
      lastSeen: Date.now(),
      ...params,
    });
  }

  away(params: {
    userId: string;
    userName: string;
    awayMessage?: string;
    roomId?: string;  // Optional room scope for targeted broadcast
    commandId?: string;
  }) {
    this.emit({
      event: IRC_EVENTS.AWAY,
      timestamp: Date.now(),
      status: 'away',
      ...params,
    });
  }

  back(params: {
    userId: string;
    userName: string;
    roomId?: string;  // Optional room scope for targeted broadcast
    commandId?: string;
  }) {
    this.emit({
      event: IRC_EVENTS.BACK,
      timestamp: Date.now(),
      status: 'online',
      ...params,
    });
  }

  // === QUERY RESPONSES ===
  
  namesReply(params: {
    roomId: string;
    roomName: string;
    users: Array<{
      userId: string;
      userName: string;
      role?: string;
      status: 'online' | 'away' | 'idle';
      isBot?: boolean;
    }>;
    totalCount: number;
    commandId?: string;
  }) {
    this.emit({
      event: IRC_EVENTS.NAMES_REPLY,
      timestamp: Date.now(),
      ...params,
    });
  }

  // === ROOM STATE ===
  
  topic(params: {
    roomId: string;
    roomName: string;
    topic: string;
    setBy: string;
    setByName: string;
    commandId?: string;
  }) {
    this.emit({
      event: IRC_EVENTS.TOPIC,
      timestamp: Date.now(),
      ...params,
    });
    log.info(`[IRC] TOPIC ${params.roomName}: "${params.topic}" by ${params.setByName}`);
  }

  mode(params: {
    roomId: string;
    roomName: string;
    mode: string;
    value?: boolean | string;
    setBy: string;
    setByName: string;
    commandId?: string;
  }) {
    this.emit({
      event: IRC_EVENTS.MODE,
      timestamp: Date.now(),
      ...params,
    });
    log.info(`[IRC] MODE ${params.roomName} ${params.mode}=${params.value} by ${params.setByName}`);
  }

  sync(params: {
    roomId: string;
    roomName: string;
    topic?: string;
    users: Array<{
      userId: string;
      userName: string;
      role?: string;
      status: 'online' | 'away' | 'idle';
    }>;
    modes: Record<string, boolean | string>;
    recentMessages?: Array<{
      messageId: string;
      senderId: string;
      senderName: string;
      content: string;
      timestamp: number;
    }>;
    commandId?: string;
  }) {
    this.emit({
      event: IRC_EVENTS.SYNC,
      timestamp: Date.now(),
      ...params,
    });
    log.info(`[IRC] SYNC ${params.roomName}: ${params.users.length} users`);
  }

  // === MODERATION ===
  
  kick(params: {
    roomId: string;
    roomName: string;
    userId: string;
    userName: string;
    kickedBy: string;
    kickedByName: string;
    reason?: string;
    commandId?: string;
  }) {
    this.emit({
      event: IRC_EVENTS.KICK,
      timestamp: Date.now(),
      ...params,
    } as IRCBasePayload);
    log.info(`[IRC] KICK ${params.userName} from ${params.roomName} by ${params.kickedByName}: ${params.reason || 'no reason'}`);
  }

  mute(params: {
    roomId: string;
    userId: string;
    userName: string;
    mutedBy: string;
    mutedByName: string;
    duration?: number;
    reason?: string;
    commandId?: string;
  }) {
    this.emit({
      event: IRC_EVENTS.MUTE,
      timestamp: Date.now(),
      ...params,
    } as IRCBasePayload);
  }

  unmute(params: {
    roomId: string;
    userId: string;
    userName: string;
    unmutedBy: string;
    unmutedByName: string;
    commandId?: string;
  }) {
    this.emit({
      event: IRC_EVENTS.UNMUTE,
      timestamp: Date.now(),
      ...params,
    } as IRCBasePayload);
  }
}

// Singleton instance
export const ircEmitter = new IRCEventEmitter();

// Room presence tracker for fast user lookups
export class RoomPresenceTracker {
  private rooms: Map<string, Map<string, {
    userName: string;
    role?: string;
    status: 'online' | 'away' | 'idle';
    lastActivity: number;
    isBot?: boolean;
  }>> = new Map();
  
  private readonly IDLE_TIMEOUT_MS = 5 * 60 * 1000; // 5 minutes

  join(roomId: string, userId: string, userData: {
    userName: string;
    role?: string;
    isBot?: boolean;
  }) {
    if (!this.rooms.has(roomId)) {
      this.rooms.set(roomId, new Map());
    }
    
    this.rooms.get(roomId)!.set(userId, {
      ...userData,
      status: 'online',
      lastActivity: Date.now(),
    });
    
    return this.getMemberCount(roomId);
  }

  part(roomId: string, userId: string): number {
    const room = this.rooms.get(roomId);
    if (room) {
      room.delete(userId);
      if (room.size === 0) {
        this.rooms.delete(roomId);
        return 0;
      }
      return room.size;
    }
    return 0;
  }

  updateActivity(roomId: string, userId: string) {
    const room = this.rooms.get(roomId);
    if (room && room.has(userId)) {
      const user = room.get(userId)!;
      user.lastActivity = Date.now();
      user.status = 'online';
    }
  }

  setAway(userId: string, isAway: boolean) {
    for (const room of this.rooms.values()) {
      if (room.has(userId)) {
        room.get(userId)!.status = isAway ? 'away' : 'online';
      }
    }
  }

  getMemberCount(roomId: string): number {
    return this.rooms.get(roomId)?.size || 0;
  }

  getMembers(roomId: string): Array<{
    userId: string;
    userName: string;
    role?: string;
    status: 'online' | 'away' | 'idle';
    isBot?: boolean;
  }> {
    const room = this.rooms.get(roomId);
    if (!room) return [];
    
    const now = Date.now();
    const members: Array<{
      userId: string;
      userName: string;
      role?: string;
      status: 'online' | 'away' | 'idle';
      isBot?: boolean;
    }> = [];
    
    for (const [userId, data] of room.entries()) {
      // Check for idle timeout
      const isIdle = (now - data.lastActivity) > this.IDLE_TIMEOUT_MS;
      members.push({
        userId,
        userName: data.userName,
        role: data.role,
        status: isIdle ? 'idle' : data.status,
        isBot: data.isBot,
      });
    }
    
    return members;
  }

  isUserInRoom(roomId: string, userId: string): boolean {
    return this.rooms.get(roomId)?.has(userId) || false;
  }

  getUserRooms(userId: string): string[] {
    const userRooms: string[] = [];
    for (const [roomId, room] of this.rooms.entries()) {
      if (room.has(userId)) {
        userRooms.push(roomId);
      }
    }
    return userRooms;
  }

  // Clean up idle users periodically
  pruneIdleUsers(callback?: (roomId: string, userId: string) => void) {
    const now = Date.now();
    const veryIdleTimeout = 30 * 60 * 1000; // 30 minutes
    
    for (const [roomId, room] of this.rooms.entries()) {
      for (const [userId, data] of room.entries()) {
        if ((now - data.lastActivity) > veryIdleTimeout && !data.isBot) {
          room.delete(userId);
          callback?.(roomId, userId);
        }
      }
      
      if (room.size === 0) {
        this.rooms.delete(roomId);
      }
    }
  }
}

// Singleton presence tracker
export const roomPresence = new RoomPresenceTracker();

log.info('[IRCEventRegistry] Initialized with', Object.keys(IRC_EVENTS).length, 'event types');
