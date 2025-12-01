/**
 * ChatServerHub - Unified Event Orchestration Layer & Gateway
 * 
 * Central hub connecting ALL room types to:
 * - AI Brain (intelligent responses)
 * - Notification System (push alerts)
 * - Ticket System (issue tracking)
 * - What's New (platform updates)
 * - Analytics (usage metrics)
 * 
 * Room Types Supported:
 * - Support Rooms: Customer support chatrooms
 * - Work Rooms: Team collaboration & shift-based chat
 * - Meeting Rooms: Meeting & event discussions
 * - Organization Rooms: Company-wide communication
 * 
 * Every chat action emits events that automatically propagate to all connected systems.
 */

import { platformEventBus, PlatformEvent, PlatformEventType, EventCategory, EventVisibility } from './platformEventBus';
import { db } from '../db';
import { 
  notifications, 
  supportTickets, 
  chatMessages,
  chatConversations,
  chatParticipants,
  supportRooms,
  organizationChatRooms,
  users,
} from '@shared/schema';
import { eq, and, or, isNull, gte, count, sql } from 'drizzle-orm';
import { CHAT_SERVER_HUB } from '@shared/platformConfig';
import { roomAnalyticsService } from './roomAnalyticsService';
import { PLATFORM_WORKSPACE_ID, seedPlatformWorkspace } from '../seed-platform-workspace';

// ============================================================================
// CHAT-SPECIFIC EVENT TYPES
// ============================================================================

export type ChatEventType = 
  | 'message_posted'
  | 'message_edited'
  | 'message_deleted'
  | 'user_joined_room'
  | 'user_left_room'
  | 'user_kicked'
  | 'user_silenced'
  | 'user_banned'
  | 'room_status_changed'
  | 'ticket_created'
  | 'ticket_assigned'
  | 'ticket_escalated'
  | 'ticket_resolved'
  | 'ticket_closed'
  | 'ai_response'
  | 'ai_escalation'
  | 'ai_suggestion'
  | 'ai_error'
  | 'ai_timeout'
  | 'queue_update'
  | 'staff_joined'
  | 'staff_left'
  | 'sentiment_alert';

export interface ChatEventMetadata {
  conversationId: string;
  roomSlug?: string;
  workspaceId?: string;
  userId?: string;
  userName?: string;
  targetUserId?: string;
  targetUserName?: string;
  ticketId?: string;
  ticketNumber?: string;
  messageId?: string;
  severity?: 'low' | 'medium' | 'high' | 'critical';
  audience?: 'room' | 'workspace' | 'user' | 'staff' | 'all';
  // Escalation context
  escalationLevel?: 'tier1' | 'tier2' | 'tier3' | 'management';
  escalationReason?: string;
  // AI Error/Timeout context
  jobId?: string;
  skill?: string;
  errorMessage?: string;
  errorStack?: string;
  retryCount?: number;
  maxRetries?: number;
  canRetry?: boolean;
  timeoutMs?: number;
  executionTimeMs?: number;
  confidenceScore?: number;
}

export interface ChatEvent {
  type: ChatEventType;
  title: string;
  description: string;
  metadata: ChatEventMetadata;
  timestamp?: Date;
  shouldNotify?: boolean;
  shouldPersistToWhatsNew?: boolean;
  visibility?: EventVisibility;
}

// ============================================================================
// WEBSOCKET BROADCAST HANDLER
// ============================================================================

type WebSocketBroadcaster = (event: {
  type: string;
  conversationId?: string;
  workspaceId?: string;
  userId?: string;
  payload: any;
}) => void;

// ============================================================================
// CHAT SERVER HUB CLASS
// ============================================================================

// ============================================================================
// ACTIVE ROOM TRACKING
// ============================================================================

export interface ActiveRoom {
  id: string;
  type: 'support' | 'work' | 'meeting' | 'org';
  conversationId: string;
  workspaceId: string;
  subject: string;
  participantCount: number;
  status: string;
  createdAt: Date;
  lastActivity: Date;
}

// ============================================================================
// CHAT SERVER HUB CLASS
// ============================================================================

class ChatServerHubClass {
  private wsBroadcaster: WebSocketBroadcaster | null = null;
  private eventSubscribers: Map<ChatEventType | '*', ((event: ChatEvent) => Promise<void>)[]> = new Map();
  private activeRooms: Map<string, ActiveRoom> = new Map(); // Key: conversationId
  private gatewayInitialized: boolean = false;
  private heartbeatInterval: NodeJS.Timeout | null = null;

  constructor() {
    this.subscribeToEventBus();
    console.log(`[ChatServerHub] Initialized - Version ${CHAT_SERVER_HUB.version}`);
  }

  /**
   * Initialize the gateway and load all active rooms
   * Called once on application startup
   */
  async initializeGateway(): Promise<void> {
    if (this.gatewayInitialized) {
      console.log('[ChatServerHub] Gateway already initialized, skipping re-initialization');
      return;
    }

    console.log(`[ChatServerHub] Initializing gateway v${CHAT_SERVER_HUB.version}...`);
    
    try {
      // Seed HelpDesk room with HelpAI bot (idempotent)
      await this.seedHelpDeskRoom();
      
      // Load all active rooms from database
      await this.loadAllActiveRooms();
      
      // Start heartbeat to track room activity
      this.startHeartbeat();
      
      this.gatewayInitialized = true;
      console.log(
        `[ChatServerHub] Gateway initialized successfully - ` +
        `${this.activeRooms.size} active rooms loaded`
      );
    } catch (error) {
      console.error('[ChatServerHub] Failed to initialize gateway:', error);
      throw error;
    }
  }

  /**
   * Seed the HelpDesk support room with HelpAI bot as a participant
   * Idempotent - safe to call multiple times
   * 
   * This method is designed to be fail-safe - if any step fails,
   * the gateway initialization will still proceed with a warning.
   */
  private async seedHelpDeskRoom(): Promise<void> {
    const HELPDESK_SLUG = 'helpdesk';
    const HELPAI_BOT_ID = 'helpai-bot';
    const HELPAI_BOT_NAME = 'HelpAI';

    console.log('[ChatServerHub] Seeding HelpDesk room with HelpAI bot...');
    
    try {
      // Ensure platform workspace exists before creating HelpDesk room
      // This creates the workspace with PLATFORM_WORKSPACE_ID if it doesn't exist
      await seedPlatformWorkspace();
    } catch (wsError) {
      console.warn('[ChatServerHub] Failed to seed platform workspace, HelpDesk seeding may fail:', wsError);
      // Continue anyway - the workspace might already exist from previous runs
    }

    try {
      // Check if HelpDesk support room exists
      const [existingRoom] = await db
        .select()
        .from(supportRooms)
        .where(eq(supportRooms.slug, HELPDESK_SLUG))
        .limit(1);

      let conversationId: string;

      if (existingRoom) {
        console.log('[ChatServerHub] HelpDesk room exists, checking conversation...');
        
        if (existingRoom.conversationId) {
          conversationId = existingRoom.conversationId;
        } else {
          // Create conversation for existing room
          const [conversation] = await db.insert(chatConversations).values({
            workspaceId: PLATFORM_WORKSPACE_ID,
            subject: 'CoAIleague HelpDesk',
            conversationType: 'dm_support',
            visibility: 'public',
            status: 'active',
          }).returning();
          
          conversationId = conversation.id;
          
          // Update support room with conversation ID
          await db.update(supportRooms)
            .set({ conversationId })
            .where(eq(supportRooms.id, existingRoom.id));
          
          console.log('[ChatServerHub] Created conversation for HelpDesk room');
        }
      } else {
        // Create the conversation first
        const [conversation] = await db.insert(chatConversations).values({
          workspaceId: PLATFORM_WORKSPACE_ID,
          subject: 'CoAIleague HelpDesk',
          conversationType: 'dm_support',
          visibility: 'public',
          status: 'active',
        }).returning();
        
        conversationId = conversation.id;

        // Create the HelpDesk support room
        await db.insert(supportRooms).values({
          slug: HELPDESK_SLUG,
          name: 'CoAIleague HelpDesk',
          description: 'Live support chat powered by CoAIleague AI - HelpAI is always here to assist you',
          status: 'open',
          workspaceId: null, // Platform-wide room
          conversationId,
          requiresTicket: false,
          allowedRoles: JSON.stringify(['*']), // Allow everyone
        });

        console.log('[ChatServerHub] Created HelpDesk support room');
      }

      // Ensure HelpAI bot user exists (use raw SQL for custom ID)
      const [existingBot] = await db
        .select()
        .from(users)
        .where(eq(users.id, HELPAI_BOT_ID))
        .limit(1);

      if (!existingBot) {
        // Use raw SQL insert for custom ID to work around type constraints
        await db.execute(sql`
          INSERT INTO users (id, email, first_name, last_name, role, current_workspace_id)
          VALUES (${HELPAI_BOT_ID}, 'helpai@coaileague.ai', 'HelpAI', 'Bot', 'system', ${PLATFORM_WORKSPACE_ID})
          ON CONFLICT (id) DO NOTHING
        `);
        console.log('[ChatServerHub] Created HelpAI bot user');
      }

      // Ensure HelpAI bot is a participant in the conversation
      const [existingParticipant] = await db
        .select()
        .from(chatParticipants)
        .where(
          and(
            eq(chatParticipants.conversationId, conversationId),
            eq(chatParticipants.participantId, HELPAI_BOT_ID)
          )
        )
        .limit(1);

      if (!existingParticipant) {
        await db.insert(chatParticipants).values({
          conversationId,
          workspaceId: PLATFORM_WORKSPACE_ID,
          participantId: HELPAI_BOT_ID,
          participantName: HELPAI_BOT_NAME,
          participantEmail: 'helpai@coaileague.ai',
          participantRole: 'admin',
          canSendMessages: true,
          canViewHistory: true,
          canInviteOthers: true,
          joinedAt: new Date(),
          isActive: true,
        });
        console.log('[ChatServerHub] Added HelpAI bot as HelpDesk participant');
      } else if (!existingParticipant.isActive) {
        // Reactivate if inactive
        await db.update(chatParticipants)
          .set({ isActive: true, joinedAt: new Date() })
          .where(eq(chatParticipants.id, existingParticipant.id));
        console.log('[ChatServerHub] Reactivated HelpAI bot in HelpDesk');
      }

      console.log('[ChatServerHub] HelpDesk room seeded successfully with HelpAI bot');
    } catch (error) {
      console.error('[ChatServerHub] Error seeding HelpDesk room:', error);
      // Don't throw - allow gateway to continue initialization
    }
  }

  /**
   * Load all active conversations from all room types
   */
  private async loadAllActiveRooms(): Promise<void> {
    this.activeRooms.clear();

    try {
      // Load Support Rooms (include 'open' status for HelpDesk)
      if (CHAT_SERVER_HUB.roomTypes.support.enabled) {
        const supportRoomsList = await db
          .select()
          .from(supportRooms)
          .where(or(eq(supportRooms.status, 'active'), eq(supportRooms.status, 'open')))
          .limit(1000);

        for (const room of supportRoomsList) {
          if (room.conversationId) {
            const participantCount = await this.getParticipantCount(room.conversationId);
            this.activeRooms.set(room.conversationId, {
              id: room.id,
              type: 'support',
              conversationId: room.conversationId,
              workspaceId: room.workspaceId || 'coaileague-platform-workspace',
              subject: room.name,
              participantCount,
              status: room.status || 'open',
              createdAt: room.createdAt || new Date(),
              lastActivity: new Date(),
            });
          }
        }
        console.log(`[ChatServerHub] Loaded ${supportRoomsList.length} support rooms`);
      }

      // Load Organization Rooms
      if (CHAT_SERVER_HUB.roomTypes.org.enabled) {
        const orgRoomsList = await db
          .select()
          .from(organizationChatRooms)
          .where(eq(organizationChatRooms.status, 'active'))
          .limit(1000);

        for (const room of orgRoomsList) {
          if (room.conversationId) {
            const participantCount = await this.getParticipantCount(room.conversationId);
            this.activeRooms.set(room.conversationId, {
              id: room.id,
              type: 'org',
              conversationId: room.conversationId,
              workspaceId: room.workspaceId,
              subject: room.roomName,
              participantCount,
              status: room.status || 'active',
              createdAt: room.createdAt || new Date(),
              lastActivity: new Date(),
            });
          }
        }
        console.log(`[ChatServerHub] Loaded ${orgRoomsList.length} organization rooms`);
      }

      // Load Work & Meeting Rooms (conversation_type-based)
      if (CHAT_SERVER_HUB.roomTypes.work.enabled || CHAT_SERVER_HUB.roomTypes.meeting.enabled) {
        const conversations = await db
          .select()
          .from(chatConversations)
          .where(
            and(
              eq(chatConversations.status, 'active'),
              or(
                eq(chatConversations.conversationType, 'shift_chat'),
                eq(chatConversations.conversationType, 'open_chat')
              )
            )
          )
          .limit(2000);

        for (const conv of conversations) {
          const roomType = conv.conversationType === 'shift_chat' ? 'work' : 'meeting';
          if (CHAT_SERVER_HUB.roomTypes[roomType].enabled) {
            const participantCount = await this.getParticipantCount(conv.id);
            this.activeRooms.set(conv.id, {
              id: conv.id,
              type: roomType,
              conversationId: conv.id,
              workspaceId: conv.workspaceId || 'coaileague-platform-workspace',
              subject: conv.subject || 'Untitled',
              participantCount,
              status: conv.status || 'active',
              createdAt: conv.createdAt || new Date(),
              lastActivity: new Date(),
            });
          }
        }
        console.log(
          `[ChatServerHub] Loaded work and meeting rooms - ` +
          `Work: ${conversations.filter(c => c.conversationType === 'shift_chat').length}, ` +
          `Meeting: ${conversations.filter(c => c.conversationType === 'open_chat').length}`
        );
      }
    } catch (error) {
      console.error('[ChatServerHub] Error loading active rooms:', error);
    }
  }

  /**
   * Get participant count for a conversation
   */
  private async getParticipantCount(conversationId: string): Promise<number> {
    try {
      const result = await db
        .select({ count: count() })
        .from(chatParticipants)
        .where(
          and(
            eq(chatParticipants.conversationId, conversationId),
            eq(chatParticipants.isActive, true)
          )
        );
      return result[0]?.count || 0;
    } catch (error) {
      console.error(`[ChatServerHub] Error getting participant count:`, error);
      return 0;
    }
  }

  /**
   * Start heartbeat to track room activity
   */
  private startHeartbeat(): void {
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
    }

    this.heartbeatInterval = setInterval(async () => {
      try {
        // Update participant counts for all active rooms
        for (const room of this.activeRooms.values()) {
          const count = await this.getParticipantCount(room.conversationId);
          room.participantCount = count;
          room.lastActivity = new Date();
          
          // Remove room if no participants and older than 5 minutes
          if (count === 0 && Date.now() - room.lastActivity.getTime() > 5 * 60 * 1000) {
            this.activeRooms.delete(room.conversationId);
          }
        }
      } catch (error) {
        console.error('[ChatServerHub] Heartbeat error:', error);
      }
    }, CHAT_SERVER_HUB.heartbeatIntervalMs);

    console.log('[ChatServerHub] Heartbeat started');
  }

  /**
   * Shutdown the gateway
   */
  async shutdownGateway(): Promise<void> {
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
      this.heartbeatInterval = null;
    }
    this.activeRooms.clear();
    this.gatewayInitialized = false;
    console.log('[ChatServerHub] Gateway shutdown complete');
  }

  /**
   * Get all active rooms across all room types
   */
  getAllActiveRooms(): ActiveRoom[] {
    return Array.from(this.activeRooms.values());
  }

  /**
   * Get active rooms by type
   */
  getActiveRoomsByType(type: 'support' | 'work' | 'meeting' | 'org'): ActiveRoom[] {
    return Array.from(this.activeRooms.values()).filter(room => room.type === type);
  }

  /**
   * Get active rooms by workspace
   */
  getActiveRoomsByWorkspace(workspaceId: string): ActiveRoom[] {
    return Array.from(this.activeRooms.values()).filter(room => room.workspaceId === workspaceId);
  }

  /**
   * Get active rooms statistics
   */
  getGatewayStats(): {
    totalRooms: number;
    roomsByType: Record<string, number>;
    totalParticipants: number;
    isInitialized: boolean;
    version: string;
  } {
    const stats = {
      totalRooms: this.activeRooms.size,
      roomsByType: {} as Record<string, number>,
      totalParticipants: 0,
      isInitialized: this.gatewayInitialized,
      version: CHAT_SERVER_HUB.version,
    };

    for (const room of this.activeRooms.values()) {
      stats.roomsByType[room.type] = (stats.roomsByType[room.type] || 0) + 1;
      stats.totalParticipants += room.participantCount;
    }

    return stats;
  }

  /**
   * Register the WebSocket broadcaster for room-scoped broadcasts
   */
  setWebSocketBroadcaster(broadcaster: WebSocketBroadcaster): void {
    this.wsBroadcaster = broadcaster;
    console.log('[ChatServerHub] WebSocket broadcaster registered');
  }

  /**
   * Subscribe to platform event bus for incoming events
   */
  private subscribeToEventBus(): void {
    platformEventBus.subscribe('*', {
      name: 'ChatServerHub',
      handler: async (event: PlatformEvent) => {
        await this.handlePlatformEvent(event);
      }
    });
    console.log('[ChatServerHub] Subscribed to Platform Event Bus');
  }

  /**
   * Handle incoming platform events and route to appropriate chatrooms
   */
  private async handlePlatformEvent(event: PlatformEvent): Promise<void> {
    if (this.wsBroadcaster && event.metadata?.conversationId) {
      this.wsBroadcaster({
        type: 'platform_event',
        conversationId: event.metadata.conversationId,
        workspaceId: event.workspaceId,
        userId: event.metadata?.userId,
        payload: {
          eventType: event.type,
          title: event.title,
          description: event.description,
          category: event.category,
          metadata: event.metadata,
          timestamp: new Date().toISOString(),
        }
      });
    }
  }

  /**
   * Emit a chat event - propagates to all connected systems
   */
  async emit(event: ChatEvent): Promise<void> {
    const timestamp = event.timestamp || new Date();
    console.log(`[ChatServerHub] Event: ${event.type} - ${event.title}`);

    try {
      const platformEventType = this.mapToPlatformEventType(event.type);
      const category = this.mapToCategory(event.type);

      if (event.shouldPersistToWhatsNew !== false && this.shouldPersistEvent(event.type)) {
        await platformEventBus.publish({
          type: platformEventType,
          category,
          title: event.title,
          description: event.description,
          workspaceId: event.metadata.workspaceId,
          userId: event.metadata.userId,
          metadata: {
            ...event.metadata,
            chatEventType: event.type,
            timestamp: timestamp.toISOString(),
          },
          visibility: event.visibility || 'all',
          learnMoreUrl: event.metadata.ticketNumber 
            ? `/support/tickets/${event.metadata.ticketNumber}`
            : undefined,
        });
      }

      if (event.shouldNotify !== false && this.shouldNotify(event.type)) {
        await this.createChatNotifications(event);
      }

      if (this.wsBroadcaster) {
        this.broadcastChatEvent(event);
      }

      // Track analytics for chat events
      await this.trackAnalyticsEvent(event);

      await this.notifySubscribers(event);

    } catch (error) {
      console.error('[ChatServerHub] Error processing event:', error);
    }
  }

  /**
   * Track analytics metrics based on chat event type
   */
  private async trackAnalyticsEvent(event: ChatEvent): Promise<void> {
    try {
      const { conversationId, workspaceId } = event.metadata;
      if (!conversationId || !workspaceId) return;

      switch (event.type) {
        case 'message_posted':
          // Extract sentiment if available in metadata
          const sentiment = (event.metadata as any).sentiment || 'neutral';
          await roomAnalyticsService.trackMessagePosted(workspaceId, conversationId, sentiment);
          break;

        case 'user_joined_room':
        case 'staff_joined':
          await roomAnalyticsService.trackParticipantJoined(workspaceId, conversationId, event.metadata.userId || '');
          break;

        case 'user_left_room':
        case 'staff_left':
          await roomAnalyticsService.trackParticipantLeft(workspaceId, conversationId);
          break;

        case 'ticket_created':
          await roomAnalyticsService.trackTicketCreated(workspaceId, conversationId);
          break;

        case 'ticket_resolved':
          // Calculate resolution time in hours
          const createdAt = (event.metadata as any).createdAt || new Date();
          const resolvedAt = new Date();
          const resolutionTimeHours = (resolvedAt.getTime() - new Date(createdAt).getTime()) / (1000 * 60 * 60);
          await roomAnalyticsService.trackTicketResolved(workspaceId, conversationId, resolutionTimeHours);
          break;

        case 'ai_escalation':
          await roomAnalyticsService.trackAiEscalation(workspaceId, conversationId);
          break;

        case 'ai_response':
          await roomAnalyticsService.trackAiResponse(workspaceId, conversationId);
          break;

        default:
          // Other event types don't require analytics tracking
          break;
      }
    } catch (error) {
      console.error('[ChatServerHub] Error tracking analytics:', error);
      // Don't re-throw - analytics tracking shouldn't crash the event processing
    }
  }

  /**
   * Subscribe to specific chat event types
   */
  subscribe(eventType: ChatEventType | '*', handler: (event: ChatEvent) => Promise<void>): void {
    if (!this.eventSubscribers.has(eventType)) {
      this.eventSubscribers.set(eventType, []);
    }
    this.eventSubscribers.get(eventType)!.push(handler);
    console.log(`[ChatServerHub] Handler subscribed to ${eventType}`);
  }

  /**
   * Broadcast chat event via WebSocket
   */
  private broadcastChatEvent(event: ChatEvent): void {
    if (!this.wsBroadcaster) return;

    const broadcastPayload = {
      type: 'chat_event',
      conversationId: event.metadata.conversationId,
      workspaceId: event.metadata.workspaceId,
      userId: event.metadata.audience === 'user' ? event.metadata.targetUserId : undefined,
      payload: {
        eventType: event.type,
        title: event.title,
        description: event.description,
        metadata: event.metadata,
        timestamp: (event.timestamp || new Date()).toISOString(),
      }
    };

    this.wsBroadcaster(broadcastPayload);
  }

  /**
   * Create notifications for chat events
   */
  private async createChatNotifications(event: ChatEvent): Promise<void> {
    try {
      if (!event.metadata.workspaceId) return;

      const notificationType = this.getNotificationType(event.type);
      
      if (event.metadata.audience === 'user' && event.metadata.targetUserId) {
        await db.insert(notifications).values({
          workspaceId: event.metadata.workspaceId,
          userId: event.metadata.targetUserId,
          type: notificationType,
          title: event.title,
          message: event.description,
          actionUrl: event.metadata.ticketNumber 
            ? `/support/tickets/${event.metadata.ticketNumber}`
            : `/chat/${event.metadata.conversationId}`,
          relatedEntityType: 'chat_event',
          relatedEntityId: event.metadata.messageId || event.metadata.ticketId,
          metadata: { chatEventType: event.type, ...event.metadata },
          isRead: false,
        });
      } else if (event.metadata.audience === 'staff') {
        console.log(`[ChatServerHub] Staff notification: ${event.title}`);
      }
    } catch (error) {
      console.error('[ChatServerHub] Failed to create notifications:', error);
    }
  }

  /**
   * Notify internal subscribers
   */
  private async notifySubscribers(event: ChatEvent): Promise<void> {
    const allHandlers = this.eventSubscribers.get('*') || [];
    const typeHandlers = this.eventSubscribers.get(event.type) || [];

    for (const handler of [...allHandlers, ...typeHandlers]) {
      try {
        await handler(event);
      } catch (error) {
        console.error(`[ChatServerHub] Subscriber error:`, error);
      }
    }
  }

  /**
   * Map chat event types to platform event types
   * Each ChatEventType maps to the most specific PlatformEventType available
   */
  private mapToPlatformEventType(chatType: ChatEventType): PlatformEventType {
    switch (chatType) {
      case 'ticket_created':
        return 'ticket_created';
      case 'ticket_assigned':
        return 'ticket_assigned';
      case 'ticket_escalated':
        return 'ticket_escalated';
      case 'ticket_resolved':
        return 'ticket_resolved';
      case 'ticket_closed':
        return 'ticket_closed';
      case 'message_posted':
      case 'message_edited':
      case 'message_deleted':
        return 'chat_message';
      case 'user_joined_room':
      case 'staff_joined':
        return 'chat_user_joined';
      case 'user_left_room':
      case 'staff_left':
        return 'chat_user_left';
      case 'user_kicked':
      case 'user_silenced':
      case 'user_banned':
        return 'chat_moderation';
      case 'room_status_changed':
      case 'queue_update':
        return 'queue_update';
      case 'ai_response':
        return 'ai_brain_action';
      case 'ai_escalation':
        return 'ai_escalation';
      case 'ai_suggestion':
        return 'ai_suggestion';
      case 'sentiment_alert':
        return 'staff_action';
      default:
        return 'announcement';
    }
  }

  /**
   * Map chat event types to categories
   */
  private mapToCategory(chatType: ChatEventType): EventCategory {
    switch (chatType) {
      case 'ticket_created':
      case 'ticket_assigned':
      case 'ticket_escalated':
      case 'ticket_resolved':
      case 'ticket_closed':
        return 'improvement';
      case 'ai_response':
      case 'ai_escalation':
      case 'ai_suggestion':
        return 'feature';
      case 'user_banned':
      case 'user_kicked':
        return 'security';
      case 'sentiment_alert':
        return 'announcement';
      default:
        return 'announcement';
    }
  }

  /**
   * Determine if event should persist to What's New
   * Significant lifecycle events that users need to track
   */
  private shouldPersistEvent(type: ChatEventType): boolean {
    const persistableTypes: ChatEventType[] = [
      'ticket_created',
      'ticket_assigned',
      'ticket_escalated',
      'ticket_resolved',
      'ticket_closed',
      'ai_escalation',
      'user_banned',
      'sentiment_alert',
    ];
    return persistableTypes.includes(type);
  }

  /**
   * Determine if event should create notifications
   * Events that require user attention
   */
  private shouldNotify(type: ChatEventType): boolean {
    const notifiableTypes: ChatEventType[] = [
      'ticket_created',
      'ticket_assigned',
      'ticket_escalated',
      'ticket_resolved',
      'ticket_closed',
      'ai_escalation',
      'user_kicked',
      'user_banned',
      'staff_joined',
      'sentiment_alert',
    ];
    return notifiableTypes.includes(type);
  }

  /**
   * Get notification type from chat event type
   * Must match the notificationTypeEnum values in schema
   */
  private getNotificationType(chatType: ChatEventType): 'system' | 'support_escalation' | 'ai_action_completed' | 'ai_approval_needed' | 'mention' {
    switch (chatType) {
      case 'ticket_created':
      case 'ticket_assigned':
      case 'ticket_escalated':
      case 'ticket_resolved':
      case 'ticket_closed':
        return 'support_escalation';
      case 'ai_response':
      case 'ai_escalation':
      case 'ai_suggestion':
        return 'ai_action_completed';
      case 'user_kicked':
      case 'user_banned':
        return 'system';
      case 'staff_joined':
      case 'sentiment_alert':
        return 'support_escalation';
      default:
        return 'system';
    }
  }

  // =========================================================================
  // CONVENIENCE METHODS FOR COMMON CHAT EVENTS
  // =========================================================================

  /**
   * Emit when a message is posted in a chatroom
   */
  async emitMessagePosted(params: {
    conversationId: string;
    roomSlug?: string;
    workspaceId?: string;
    userId: string;
    userName: string;
    messageId: string;
    messagePreview?: string;
  }): Promise<void> {
    await this.emit({
      type: 'message_posted',
      title: 'New Message',
      description: params.messagePreview || 'A new message was posted',
      metadata: {
        conversationId: params.conversationId,
        roomSlug: params.roomSlug,
        workspaceId: params.workspaceId,
        userId: params.userId,
        userName: params.userName,
        messageId: params.messageId,
        audience: 'room',
      },
      shouldPersistToWhatsNew: false,
      shouldNotify: false,
    });
  }

  /**
   * Emit when a support ticket is created
   */
  async emitTicketCreated(params: {
    conversationId: string;
    workspaceId: string;
    userId: string;
    userName: string;
    ticketId: string;
    ticketNumber: string;
    issueType?: string;
    description?: string;
  }): Promise<void> {
    await this.emit({
      type: 'ticket_created',
      title: `Support Ticket Created: ${params.ticketNumber}`,
      description: params.description || `New support ticket ${params.ticketNumber} created by ${params.userName}`,
      metadata: {
        conversationId: params.conversationId,
        workspaceId: params.workspaceId,
        userId: params.userId,
        userName: params.userName,
        ticketId: params.ticketId,
        ticketNumber: params.ticketNumber,
        audience: 'staff',
        severity: 'medium',
      },
      visibility: 'staff',
      shouldNotify: true,
      shouldPersistToWhatsNew: true,
    });
  }

  /**
   * Emit when a ticket is assigned to a staff member
   */
  async emitTicketAssigned(params: {
    conversationId: string;
    workspaceId: string;
    ticketId: string;
    ticketNumber: string;
    assigneeId: string;
    assigneeName: string;
    customerId: string;
    customerName: string;
  }): Promise<void> {
    await this.emit({
      type: 'ticket_assigned',
      title: `Ticket Assigned: ${params.ticketNumber}`,
      description: `${params.assigneeName} is now handling ticket ${params.ticketNumber}`,
      metadata: {
        conversationId: params.conversationId,
        workspaceId: params.workspaceId,
        userId: params.assigneeId,
        userName: params.assigneeName,
        targetUserId: params.customerId,
        targetUserName: params.customerName,
        ticketId: params.ticketId,
        ticketNumber: params.ticketNumber,
        audience: 'user',
      },
      visibility: 'all',
      shouldNotify: true,
    });
  }

  /**
   * Emit when a ticket is escalated to higher support tier
   */
  async emitTicketEscalated(params: {
    conversationId: string;
    workspaceId: string;
    ticketId: string;
    ticketNumber: string;
    escalatedBy: string;
    escalatedByName: string;
    escalationReason: string;
    escalationLevel: 'tier1' | 'tier2' | 'tier3' | 'management';
    customerId: string;
    customerName: string;
  }): Promise<void> {
    const levelLabel = {
      'tier1': 'Tier 1 Support',
      'tier2': 'Tier 2 Support',
      'tier3': 'Tier 3 Support',
      'management': 'Management'
    }[params.escalationLevel];

    await this.emit({
      type: 'ticket_escalated',
      title: `Ticket Escalated to ${levelLabel}: ${params.ticketNumber}`,
      description: `${params.escalatedByName} escalated ticket ${params.ticketNumber} to ${levelLabel}. Reason: ${params.escalationReason}`,
      metadata: {
        conversationId: params.conversationId,
        workspaceId: params.workspaceId,
        userId: params.escalatedBy,
        userName: params.escalatedByName,
        targetUserId: params.customerId,
        targetUserName: params.customerName,
        ticketId: params.ticketId,
        ticketNumber: params.ticketNumber,
        escalationLevel: params.escalationLevel,
        escalationReason: params.escalationReason,
        audience: 'staff',
        severity: 'high',
      },
      visibility: 'staff',
      shouldNotify: true,
      shouldPersistToWhatsNew: true,
    });
  }

  /**
   * Emit when a ticket is resolved
   */
  async emitTicketResolved(params: {
    conversationId: string;
    workspaceId: string;
    ticketId: string;
    ticketNumber: string;
    resolvedBy: string;
    resolverName: string;
    customerId: string;
    resolution?: string;
  }): Promise<void> {
    await this.emit({
      type: 'ticket_resolved',
      title: `Ticket Resolved: ${params.ticketNumber}`,
      description: params.resolution || `Ticket ${params.ticketNumber} has been resolved`,
      metadata: {
        conversationId: params.conversationId,
        workspaceId: params.workspaceId,
        userId: params.resolvedBy,
        userName: params.resolverName,
        targetUserId: params.customerId,
        ticketId: params.ticketId,
        ticketNumber: params.ticketNumber,
        audience: 'user',
      },
      visibility: 'all',
      shouldNotify: true,
      shouldPersistToWhatsNew: true,
    });
  }

  /**
   * Emit when AI Brain takes an action
   */
  async emitAIAction(params: {
    conversationId: string;
    workspaceId?: string;
    actionType: 'response' | 'escalation' | 'suggestion';
    title: string;
    description: string;
    targetUserId?: string;
    ticketNumber?: string;
  }): Promise<void> {
    const eventType: ChatEventType = params.actionType === 'escalation' 
      ? 'ai_escalation' 
      : params.actionType === 'suggestion' 
        ? 'ai_suggestion' 
        : 'ai_response';

    await this.emit({
      type: eventType,
      title: params.title,
      description: params.description,
      metadata: {
        conversationId: params.conversationId,
        workspaceId: params.workspaceId,
        targetUserId: params.targetUserId,
        ticketNumber: params.ticketNumber,
        audience: params.actionType === 'escalation' ? 'staff' : 'user',
        severity: params.actionType === 'escalation' ? 'high' : 'low',
      },
      visibility: params.actionType === 'escalation' ? 'staff' : 'all',
      shouldNotify: params.actionType === 'escalation',
      shouldPersistToWhatsNew: params.actionType === 'escalation',
    });
  }

  /**
   * Emit when staff joins a chatroom
   */
  async emitStaffJoined(params: {
    conversationId: string;
    workspaceId?: string;
    staffId: string;
    staffName: string;
    staffRole: string;
    customerId?: string;
  }): Promise<void> {
    await this.emit({
      type: 'staff_joined',
      title: 'Support Agent Available',
      description: `${params.staffName} (${params.staffRole}) is now available to help`,
      metadata: {
        conversationId: params.conversationId,
        workspaceId: params.workspaceId,
        userId: params.staffId,
        userName: params.staffName,
        targetUserId: params.customerId,
        audience: 'room',
      },
      shouldNotify: true,
      shouldPersistToWhatsNew: false,
    });
  }

  /**
   * Emit when user is moderated (kicked/silenced/banned)
   */
  async emitModeration(params: {
    conversationId: string;
    workspaceId?: string;
    action: 'kicked' | 'silenced' | 'banned';
    moderatorId: string;
    moderatorName: string;
    targetUserId: string;
    targetUserName: string;
    reason?: string;
    duration?: number;
  }): Promise<void> {
    const eventType: ChatEventType = params.action === 'kicked' 
      ? 'user_kicked' 
      : params.action === 'silenced' 
        ? 'user_silenced' 
        : 'user_banned';

    await this.emit({
      type: eventType,
      title: `User ${params.action}`,
      description: params.reason || `${params.targetUserName} was ${params.action} by ${params.moderatorName}`,
      metadata: {
        conversationId: params.conversationId,
        workspaceId: params.workspaceId,
        userId: params.moderatorId,
        userName: params.moderatorName,
        targetUserId: params.targetUserId,
        targetUserName: params.targetUserName,
        audience: 'staff',
        severity: params.action === 'banned' ? 'high' : 'medium',
      },
      visibility: 'staff',
      shouldNotify: true,
      shouldPersistToWhatsNew: params.action === 'banned',
    });
  }

  /**
   * Emit queue update for waiting customers
   */
  async emitQueueUpdate(params: {
    conversationId: string;
    workspaceId?: string;
    userId: string;
    userName: string;
    ticketNumber: string;
    position: number;
    estimatedWait: number;
  }): Promise<void> {
    await this.emit({
      type: 'queue_update',
      title: 'Queue Position Update',
      description: `Position ${params.position} - Estimated wait: ${params.estimatedWait} minutes`,
      metadata: {
        conversationId: params.conversationId,
        workspaceId: params.workspaceId,
        userId: params.userId,
        userName: params.userName,
        targetUserId: params.userId,
        ticketNumber: params.ticketNumber,
        audience: 'user',
      },
      shouldNotify: false,
      shouldPersistToWhatsNew: false,
    });
  }

  /**
   * Emit when AI Brain completes a job
   */
  async emitAIBrainResponse(params: {
    jobId: string;
    workspaceId?: string;
    userId?: string;
    skill: string;
    status: string;
    confidenceScore?: number;
    requiresApproval?: boolean;
    executionTimeMs?: number;
  }): Promise<void> {
    const isApprovalNeeded = params.requiresApproval || (params.confidenceScore && params.confidenceScore < 0.95);
    const skillLabel = params.skill.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());

    await platformEventBus.publish({
      type: isApprovalNeeded ? 'ai_escalation' : 'ai_brain_action',
      category: 'feature',
      title: isApprovalNeeded 
        ? `AI Action Requires Approval: ${skillLabel}` 
        : `AI Brain: ${skillLabel}`,
      description: isApprovalNeeded
        ? `Low confidence (${((params.confidenceScore || 0) * 100).toFixed(0)}%) - human review recommended`
        : `Completed in ${params.executionTimeMs || 0}ms with ${((params.confidenceScore || 1) * 100).toFixed(0)}% confidence`,
      workspaceId: params.workspaceId,
      userId: params.userId,
      metadata: {
        jobId: params.jobId,
        skill: params.skill,
        status: params.status,
        confidenceScore: params.confidenceScore,
        requiresApproval: params.requiresApproval,
        executionTimeMs: params.executionTimeMs,
      },
      visibility: isApprovalNeeded ? 'manager' : 'staff',
    });
  }

  /**
   * Emit when sentiment analysis detects negative or urgent sentiment
   * Routes alert to support staff for escalation and monitoring
   */
  async emitSentimentAlert(params: {
    conversationId: string;
    workspaceId?: string;
    messageId: string;
    userId?: string;
    userName: string;
    sentiment: 'positive' | 'neutral' | 'negative' | 'urgent';
    sentimentScore: number;
    urgencyLevel: number;
    messagePreview: string;
    summary: string;
  }): Promise<void> {
    // Determine severity based on sentiment and urgency level
    const severity = params.sentiment === 'urgent' ? 'critical' 
                   : params.urgencyLevel >= 4 ? 'high'
                   : params.urgencyLevel >= 3 ? 'high'
                   : 'medium';

    const sentimentLabel = params.sentiment.charAt(0).toUpperCase() + params.sentiment.slice(1);
    
    await this.emit({
      type: 'sentiment_alert',
      title: `${sentimentLabel} Sentiment Detected - Urgency Level ${params.urgencyLevel}`,
      description: `${params.userName}: "${params.messagePreview}" | Score: ${params.sentimentScore} | ${params.summary}`,
      metadata: {
        conversationId: params.conversationId,
        workspaceId: params.workspaceId,
        messageId: params.messageId,
        userId: params.userId,
        userName: params.userName,
        audience: 'staff',
        severity: severity as 'low' | 'medium' | 'high' | 'critical',
      },
      visibility: 'staff',
      shouldNotify: true,
      shouldPersistToWhatsNew: params.sentiment === 'urgent',
    });
  }

  /**
   * Emit when AI job encounters an error
   * Informs users in chatroom that AI processing failed
   */
  async emitAIError(params: {
    conversationId: string;
    workspaceId?: string;
    jobId: string;
    skill: string;
    errorMessage: string;
    errorStack?: string;
    userId?: string;
    userName?: string;
    retryCount?: number;
    maxRetries?: number;
    canRetry?: boolean;
    executionTimeMs?: number;
  }): Promise<void> {
    const skillLabel = params.skill.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
    const retryInfo = params.canRetry 
      ? ` (Retry ${params.retryCount || 0}/${params.maxRetries || 3})`
      : ' - No retries available';

    await this.emit({
      type: 'ai_error',
      title: `AI ${skillLabel} Error${retryInfo}`,
      description: params.errorMessage,
      metadata: {
        conversationId: params.conversationId,
        workspaceId: params.workspaceId,
        jobId: params.jobId,
        skill: params.skill,
        userId: params.userId,
        userName: params.userName,
        errorMessage: params.errorMessage,
        errorStack: params.errorStack,
        retryCount: params.retryCount || 0,
        maxRetries: params.maxRetries || 3,
        canRetry: params.canRetry ?? true,
        executionTimeMs: params.executionTimeMs,
        audience: 'user',
        severity: params.canRetry ? 'medium' : 'high',
      },
      visibility: 'all',
      shouldNotify: true,
      shouldPersistToWhatsNew: !params.canRetry, // Only persist unrecoverable errors
    });

    // Also emit to platform event bus for monitoring
    await platformEventBus.publish({
      type: 'ai_error',
      category: 'bugfix',
      title: `AI Brain Error: ${skillLabel}`,
      description: params.errorMessage,
      workspaceId: params.workspaceId,
      userId: params.userId,
      metadata: {
        conversationId: params.conversationId,
        jobId: params.jobId,
        skill: params.skill,
        errorMessage: params.errorMessage,
        errorStack: params.errorStack,
        retryCount: params.retryCount || 0,
        maxRetries: params.maxRetries || 3,
        canRetry: params.canRetry ?? true,
        executionTimeMs: params.executionTimeMs,
      },
      priority: params.canRetry ? 2 : 5,
      visibility: 'manager',
    });
  }

  /**
   * Emit when AI job times out
   * Informs users that AI processing took too long
   */
  async emitAITimeout(params: {
    conversationId: string;
    workspaceId?: string;
    jobId: string;
    skill: string;
    timeoutMs: number;
    executionTimeMs: number;
    userId?: string;
    userName?: string;
    retryCount?: number;
    maxRetries?: number;
    canRetry?: boolean;
  }): Promise<void> {
    const skillLabel = params.skill.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
    const retryInfo = params.canRetry 
      ? ` (Retry ${params.retryCount || 0}/${params.maxRetries || 3})`
      : ' - No retries available';

    await this.emit({
      type: 'ai_timeout',
      title: `AI ${skillLabel} Timeout${retryInfo}`,
      description: `Request exceeded ${params.timeoutMs}ms limit after ${params.executionTimeMs}ms of processing`,
      metadata: {
        conversationId: params.conversationId,
        workspaceId: params.workspaceId,
        jobId: params.jobId,
        skill: params.skill,
        userId: params.userId,
        userName: params.userName,
        timeoutMs: params.timeoutMs,
        executionTimeMs: params.executionTimeMs,
        retryCount: params.retryCount || 0,
        maxRetries: params.maxRetries || 3,
        canRetry: params.canRetry ?? true,
        audience: 'user',
        severity: 'high',
      },
      visibility: 'all',
      shouldNotify: true,
      shouldPersistToWhatsNew: !params.canRetry, // Only persist unrecoverable timeouts
    });

    // Also emit to platform event bus for monitoring
    await platformEventBus.publish({
      type: 'ai_timeout',
      category: 'bugfix',
      title: `AI Brain Timeout: ${skillLabel}`,
      description: `Request exceeded ${params.timeoutMs}ms limit after ${params.executionTimeMs}ms`,
      workspaceId: params.workspaceId,
      userId: params.userId,
      metadata: {
        conversationId: params.conversationId,
        jobId: params.jobId,
        skill: params.skill,
        timeoutMs: params.timeoutMs,
        executionTimeMs: params.executionTimeMs,
        retryCount: params.retryCount || 0,
        maxRetries: params.maxRetries || 3,
        canRetry: params.canRetry ?? true,
      },
      priority: params.canRetry ? 2 : 5,
      visibility: 'manager',
    });
  }
}

// Singleton instance
export const ChatServerHub = new ChatServerHubClass();

// Export convenience functions
export const emitChatEvent = (event: ChatEvent) => ChatServerHub.emit(event);
export const subscribeToChatEvents = (type: ChatEventType | '*', handler: (event: ChatEvent) => Promise<void>) => 
  ChatServerHub.subscribe(type, handler);

// Export gateway initialization methods
export const initializeChatServerHub = () => ChatServerHub.initializeGateway();
export const shutdownChatServerHub = () => ChatServerHub.shutdownGateway();

// Export room tracking methods
export const getAllActiveChatRooms = () => ChatServerHub.getAllActiveRooms();
export const getActiveChatRoomsByType = (type: 'support' | 'work' | 'meeting' | 'org') => 
  ChatServerHub.getActiveRoomsByType(type);
export const getActiveChatRoomsByWorkspace = (workspaceId: string) => 
  ChatServerHub.getActiveRoomsByWorkspace(workspaceId);
export const getChatServerHubStats = () => ChatServerHub.getGatewayStats();
