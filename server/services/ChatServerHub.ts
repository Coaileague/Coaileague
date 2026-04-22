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
import { createLogger } from '../lib/logger';

const log = createLogger('ChatServerHub');
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
  helpaiSessions,
  helpaiActionLog
} from '@shared/schema';
import { eq, and, or, isNull, isNotNull, inArray, not, gte, count, sql, desc } from 'drizzle-orm';
import { CHAT_SERVER_HUB } from '@shared/platformConfig';
import { roomAnalyticsService } from './roomAnalyticsService';
import { seedPlatformWorkspace } from '../seed-platform-workspace';
import { PLATFORM_WORKSPACE_ID } from './billing/billingConstants';
import { universalNotificationEngine } from './universalNotificationEngine';
import { helpAIBotService } from './helpai/helpAIBotService';
import { typedExec } from '../lib/typedSql';
import { scheduleNonBlocking } from '../lib/scheduleNonBlocking';

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
  | 'sentiment_alert'
  | 'support_escalation';

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
  // Ticket lifecycle context
  oldStatus?: string;
  newStatus?: string;
  updatedBy?: string;
  subject?: string;
  deletedBy?: string;
  // Room context
  roomMode?: string;
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

interface CachedRoomState {
  data: ActiveRoom;
  cachedAt: number;
}

interface BatchedEvent {
  key: string;
  event: {
    type: string;
    conversationId?: string;
    workspaceId?: string;
    userId?: string;
    payload: any;
  };
  count: number;
  firstAt: number;
  lastAt: number;
}

interface ConnectionHealthStats {
  totalConnections: number;
  activeConnections: number;
  droppedConnections: number;
  avgLatencyMs: number;
  lastCheckAt: number;
  aiServiceHealthy: boolean;
  aiFailureCount: number;
  aiLastFailureAt: number | null;
  aiCircuitBreakerOpen: boolean;
}

class ChatServerHubClass {
  private wsBroadcaster: WebSocketBroadcaster | null = null;
  private eventSubscribers: Map<ChatEventType | '*', ((event: ChatEvent) => Promise<void>)[]> = new Map();
  private activeRooms: Map<string, ActiveRoom> = new Map();
  private gatewayInitialized: boolean = false;
  private heartbeatInterval: NodeJS.Timeout | null = null;
  private eventBusSubscribed: boolean = false;

  private eventBatchQueue: Map<string, BatchedEvent> = new Map();
  private batchFlushInterval: NodeJS.Timeout | null = null;
  private readonly BATCH_FLUSH_MS = 150;
  private readonly BATCH_MAX_SIZE = 75;
  private readonly PRESENCE_BATCH_FLUSH_MS = 800;
  private readonly TYPING_BATCH_FLUSH_MS = 400;
  private readonly BATCH_MAX_AGE_MS = 2000;

  private roomStateCache: Map<string, CachedRoomState> = new Map();
  private readonly CACHE_TTL_MS = 30_000;
  private readonly CACHE_CLEANUP_INTERVAL_MS = 60_000;
  private readonly CACHE_MAX_SIZE = 500;
  private cacheCleanupInterval: NodeJS.Timeout | null = null;
  private cacheHits: number = 0;
  private cacheMisses: number = 0;

  private connectionHealth: ConnectionHealthStats = {
    totalConnections: 0,
    activeConnections: 0,
    droppedConnections: 0,
    avgLatencyMs: 0,
    lastCheckAt: Date.now(),
    aiServiceHealthy: true,
    aiFailureCount: 0,
    aiLastFailureAt: null,
    aiCircuitBreakerOpen: false,
  };
  private readonly AI_CIRCUIT_BREAKER_THRESHOLD = 8;
  private readonly AI_CIRCUIT_BREAKER_RESET_MS = 60_000;
  private readonly AI_HALF_OPEN_MAX_REQUESTS = 3;
  private aiHalfOpenRequests: number = 0;
  private aiConsecutiveFailures: number = 0;
  private healthMonitorInterval: NodeJS.Timeout | null = null;
  private eventsProcessedCount: number = 0;
  private eventsBatchedCount: number = 0;
  private eventsDroppedCount: number = 0;
  private latencySamples: number[] = [];
  private readonly LATENCY_SAMPLE_SIZE = 100;
  private startedAt: number = Date.now();

  constructor() {
    setImmediate(() => this.subscribeToEventBus());
    this.startBatchFlush();
    this.startCacheCleanup();
    this.startHealthMonitor();
    log.info(`[ChatServerHub] Initialized - Version ${CHAT_SERVER_HUB.version}`);
  }

  // =========================================================================
  // EVENT BATCHING FOR HIGH-FREQUENCY EVENTS
  // =========================================================================

  private startBatchFlush(): void {
    if (this.batchFlushInterval) clearInterval(this.batchFlushInterval);
    this.batchFlushInterval = setInterval(() => this.flushEventBatch(), this.BATCH_FLUSH_MS);
  }

  private flushEventBatch(): void {
    if (this.eventBatchQueue.size === 0) return;

    const now = Date.now();
    const toFlush: BatchedEvent[] = [];

    for (const [key, batch] of this.eventBatchQueue.entries()) {
      const isPresenceEvent = batch.event.type === 'presence_update';
      const isTypingEvent = batch.event.type === 'typing_indicator';
      const flushThreshold = isPresenceEvent
        ? this.PRESENCE_BATCH_FLUSH_MS
        : isTypingEvent
          ? this.TYPING_BATCH_FLUSH_MS
          : this.BATCH_FLUSH_MS;

      const age = now - batch.firstAt;
      if (age >= flushThreshold || batch.count >= this.BATCH_MAX_SIZE || age >= this.BATCH_MAX_AGE_MS) {
        toFlush.push(batch);
        this.eventBatchQueue.delete(key);
      }
    }

    if (toFlush.length === 0) return;

    for (const batch of toFlush) {
      this.eventsBatchedCount += batch.count;
      if (this.wsBroadcaster) {
        if (batch.count > 1) {
          this.wsBroadcaster({
            type: batch.event.type,
            conversationId: batch.event.conversationId,
            workspaceId: batch.event.workspaceId,
            userId: batch.event.userId,
            payload: {
              ...batch.event.payload,
              batchedCount: batch.count,
              batchedFrom: new Date(batch.firstAt).toISOString(),
              batchedTo: new Date(batch.lastAt).toISOString(),
            },
          });
        } else {
          this.wsBroadcaster(batch.event);
        }
      }
    }
  }

  emitBatchedEvent(event: {
    type: string;
    conversationId?: string;
    workspaceId?: string;
    userId?: string;
    payload: any;
  }): void {
    const key = `${event.type}:${event.conversationId || ''}:${event.userId || ''}`;
    const now = Date.now();
    const existing = this.eventBatchQueue.get(key);

    if (existing) {
      existing.event = event;
      existing.count++;
      existing.lastAt = now;
    } else {
      this.eventBatchQueue.set(key, {
        key,
        event,
        count: 1,
        firstAt: now,
        lastAt: now,
      });
    }

    if (this.eventBatchQueue.size >= this.BATCH_MAX_SIZE) {
      this.flushEventBatch();
    }
  }

  emitTypingIndicator(params: {
    conversationId: string;
    userId: string;
    userName: string;
    isTyping: boolean;
  }): void {
    this.emitBatchedEvent({
      type: 'typing_indicator',
      conversationId: params.conversationId,
      userId: params.userId,
      payload: {
        userId: params.userId,
        userName: params.userName,
        isTyping: params.isTyping,
        timestamp: new Date().toISOString(),
      },
    });
  }

  emitPresenceUpdate(params: {
    userId: string;
    userName: string;
    status: 'online' | 'away' | 'offline';
    workspaceId?: string;
  }): void {
    this.emitBatchedEvent({
      type: 'presence_update',
      workspaceId: params.workspaceId,
      userId: params.userId,
      payload: {
        userId: params.userId,
        userName: params.userName,
        status: params.status,
        timestamp: new Date().toISOString(),
      },
    });
  }

  // =========================================================================
  // ROOM STATE CACHING WITH TTL
  // =========================================================================

  private startCacheCleanup(): void {
    if (this.cacheCleanupInterval) clearInterval(this.cacheCleanupInterval);
    this.cacheCleanupInterval = setInterval(() => {
      const now = Date.now();
      let evicted = 0;
      for (const [key, cached] of this.roomStateCache.entries()) {
        if (now - cached.cachedAt > this.CACHE_TTL_MS) {
          this.roomStateCache.delete(key);
          evicted++;
        }
      }
      if (evicted > 0) {
        log.info(`[ChatServerHub] Cache cleanup: evicted ${evicted} stale entries, ${this.roomStateCache.size} remaining`);
      }
    }, this.CACHE_CLEANUP_INTERVAL_MS);
  }

  getCachedRoomState(conversationId: string): ActiveRoom | null {
    const cached = this.roomStateCache.get(conversationId);
    if (!cached) {
      this.cacheMisses++;
      return null;
    }
    if (Date.now() - cached.cachedAt > this.CACHE_TTL_MS) {
      this.roomStateCache.delete(conversationId);
      this.cacheMisses++;
      return null;
    }
    this.cacheHits++;
    return cached.data;
  }

  setCachedRoomState(conversationId: string, room: ActiveRoom): void {
    if (this.roomStateCache.size >= this.CACHE_MAX_SIZE) {
      let oldestKey: string | null = null;
      let oldestTime = Infinity;
      for (const [key, cached] of this.roomStateCache.entries()) {
        if (cached.cachedAt < oldestTime) {
          oldestTime = cached.cachedAt;
          oldestKey = key;
        }
      }
      if (oldestKey) this.roomStateCache.delete(oldestKey);
    }
    this.roomStateCache.set(conversationId, {
      data: room,
      cachedAt: Date.now(),
    });
  }

  invalidateRoomCache(conversationId: string): void {
    this.roomStateCache.delete(conversationId);
  }

  invalidateAllRoomCaches(): void {
    this.roomStateCache.clear();
  }

  async getRoomWithCache(conversationId: string): Promise<ActiveRoom | null> {
    const cached = this.getCachedRoomState(conversationId);
    if (cached) return cached;

    const room = this.activeRooms.get(conversationId) || null;
    if (room) {
      this.setCachedRoomState(conversationId, room);
    }
    return room;
  }

  // =========================================================================
  // GRACEFUL DEGRADATION FOR AI SERVICE FAILURES
  // =========================================================================

  private recordAIFailure(): void {
    this.connectionHealth.aiFailureCount++;
    this.aiConsecutiveFailures++;
    this.connectionHealth.aiLastFailureAt = Date.now();

    if (this.aiConsecutiveFailures >= this.AI_CIRCUIT_BREAKER_THRESHOLD) {
      this.connectionHealth.aiCircuitBreakerOpen = true;
      this.connectionHealth.aiServiceHealthy = false;
      this.aiHalfOpenRequests = 0;
      log.warn(
        `[ChatServerHub] AI circuit breaker OPEN after ${this.aiConsecutiveFailures} consecutive failures ` +
        `(${this.connectionHealth.aiFailureCount} total). ` +
        `Will enter half-open state after ${this.AI_CIRCUIT_BREAKER_RESET_MS / 1000}s.`
      );
    }
  }

  private recordAISuccess(): void {
    if (this.isInHalfOpenState()) {
      this.aiHalfOpenRequests = 0;
      log.info('[ChatServerHub] AI circuit breaker CLOSED - half-open probe succeeded');
    }
    this.aiConsecutiveFailures = 0;
    this.connectionHealth.aiCircuitBreakerOpen = false;
    this.connectionHealth.aiServiceHealthy = true;
  }

  private isInHalfOpenState(): boolean {
    if (!this.connectionHealth.aiCircuitBreakerOpen) return false;
    const lastFailure = this.connectionHealth.aiLastFailureAt;
    return !!(lastFailure && Date.now() - lastFailure > this.AI_CIRCUIT_BREAKER_RESET_MS);
  }

  isAIServiceAvailable(): boolean {
    if (!this.connectionHealth.aiCircuitBreakerOpen) return true;

    if (this.isInHalfOpenState()) {
      if (this.aiHalfOpenRequests < this.AI_HALF_OPEN_MAX_REQUESTS) {
        this.aiHalfOpenRequests++;
        log.info(`[ChatServerHub] AI circuit breaker HALF-OPEN - allowing probe request ${this.aiHalfOpenRequests}/${this.AI_HALF_OPEN_MAX_REQUESTS}`);
        return true;
      }
      return false;
    }
    return false;
  }

  getAIFallbackMessage(context: string): string {
    const fallbackMessages: Record<string, string> = {
      'chat_response': 'Trinity is temporarily unavailable. A support agent will be with you shortly.',
      'sentiment_analysis': 'Sentiment analysis is temporarily paused. Messages are still being delivered normally.',
      'auto_escalation': 'Automatic escalation is temporarily unavailable. Please use manual escalation if needed.',
      'suggestion': 'AI suggestions are temporarily unavailable. Please proceed with your best judgment.',
      'document_extraction': 'Document processing is temporarily unavailable. Your document has been saved and will be processed when the service recovers.',
      'ticket_classification': 'Automatic ticket classification is temporarily offline. Your ticket has been created and will be categorized by a support agent.',
      'smart_routing': 'Smart routing is temporarily unavailable. Your request will be handled by the next available agent.',
    };
    return fallbackMessages[context] || 'AI services are temporarily unavailable. Your request has been queued for processing.';
  }

  async executeWithAIFallback<T>(
    operation: () => Promise<T>,
    fallback: () => T,
    context: string
  ): Promise<T> {
    if (!this.isAIServiceAvailable()) {
      const msg = this.getAIFallbackMessage(context);
      log.warn(`[ChatServerHub] AI service unavailable for: ${context}. ${msg}`);
      return fallback();
    }

    try {
      const startTime = Date.now();
      const result = await operation();
      const duration = Date.now() - startTime;
      this.recordAISuccess();
      if (duration > 5000) {
        log.warn(`[ChatServerHub] AI operation slow (${duration}ms) for: ${context}`);
      }
      return result;
    } catch (error) {
      this.recordAIFailure();
      const msg = this.getAIFallbackMessage(context);
      log.error(`[ChatServerHub] AI operation failed (${context}): ${msg}`, error);
      return fallback();
    }
  }

  // =========================================================================
  // CONNECTION HEALTH MONITORING
  // =========================================================================

  private startHealthMonitor(): void {
    if (this.healthMonitorInterval) clearInterval(this.healthMonitorInterval);
    this.healthMonitorInterval = setInterval(() => {
      this.connectionHealth.lastCheckAt = Date.now();
      const uptimeSeconds = (Date.now() - this.startedAt) / 1000;

      if (this.isInHalfOpenState()) {
        log.info('[ChatServerHub] Health monitor: circuit breaker in HALF-OPEN state, awaiting probe results');
      }

      if (this.connectionHealth.droppedConnections > 0 && this.connectionHealth.totalConnections > 0) {
        const dropRate = this.connectionHealth.droppedConnections / this.connectionHealth.totalConnections;
        if (dropRate > 0.1) {
          log.warn(`[ChatServerHub] Health warning: connection drop rate ${(dropRate * 100).toFixed(1)}% exceeds 10% threshold`);
        }
      }

      if (this.connectionHealth.avgLatencyMs > 1000) {
        log.warn(`[ChatServerHub] Health warning: avg latency ${this.connectionHealth.avgLatencyMs.toFixed(0)}ms exceeds 1000ms threshold`);
      }

      const totalCacheRequests = this.cacheHits + this.cacheMisses;
      if (totalCacheRequests > 100) {
        const hitRate = this.cacheHits / totalCacheRequests;
        if (hitRate < 0.5) {
          log.warn(`[ChatServerHub] Cache efficiency warning: hit rate ${(hitRate * 100).toFixed(1)}% is below 50%`);
        }
      }

      if (uptimeSeconds > 300 && uptimeSeconds % 300 < 30) {
        const eventsPerSec = this.eventsProcessedCount / uptimeSeconds;
        log.info(
          `[ChatServerHub] Health summary: ${this.connectionHealth.activeConnections} active connections, ` +
          `${eventsPerSec.toFixed(1)} events/sec, ` +
          `cache hit rate ${totalCacheRequests > 0 ? ((this.cacheHits / totalCacheRequests) * 100).toFixed(0) : 'N/A'}%, ` +
          `AI healthy: ${this.connectionHealth.aiServiceHealthy}, ` +
          `batch queue: ${this.eventBatchQueue.size}`
        );
      }
    }, 15_000);
  }

  trackConnectionOpened(): void {
    this.connectionHealth.totalConnections++;
    this.connectionHealth.activeConnections++;
  }

  trackConnectionClosed(): void {
    this.connectionHealth.activeConnections = Math.max(0, this.connectionHealth.activeConnections - 1);
  }

  trackConnectionDropped(): void {
    this.connectionHealth.droppedConnections++;
    this.connectionHealth.activeConnections = Math.max(0, this.connectionHealth.activeConnections - 1);
  }

  recordLatency(latencyMs: number): void {
    const alpha = 0.3;
    this.connectionHealth.avgLatencyMs =
      this.connectionHealth.avgLatencyMs * (1 - alpha) + latencyMs * alpha;
    this.latencySamples.push(latencyMs);
    if (this.latencySamples.length > this.LATENCY_SAMPLE_SIZE) {
      this.latencySamples.shift();
    }
  }

  private getLatencyP95(): number {
    if (this.latencySamples.length === 0) return 0;
    const sorted = [...this.latencySamples].sort((a, b) => a - b);
    const idx = Math.floor(sorted.length * 0.95);
    return sorted[Math.min(idx, sorted.length - 1)];
  }

  getConnectionHealth(): ConnectionHealthStats & {
    cacheHitRate: number;
    cacheSize: number;
    cacheMaxSize: number;
    eventsProcessed: number;
    eventsBatched: number;
    eventsDropped: number;
    batchQueueSize: number;
    uptimeMs: number;
    latencyP95Ms: number;
    aiConsecutiveFailures: number;
    eventsPerSecond: number;
  } {
    const totalCacheRequests = this.cacheHits + this.cacheMisses;
    const uptimeMs = Date.now() - this.startedAt;
    return {
      ...this.connectionHealth,
      cacheHitRate: totalCacheRequests > 0 ? this.cacheHits / totalCacheRequests : 0,
      cacheSize: this.roomStateCache.size,
      cacheMaxSize: this.CACHE_MAX_SIZE,
      eventsProcessed: this.eventsProcessedCount,
      eventsBatched: this.eventsBatchedCount,
      eventsDropped: this.eventsDroppedCount,
      batchQueueSize: this.eventBatchQueue.size,
      uptimeMs,
      latencyP95Ms: this.getLatencyP95(),
      aiConsecutiveFailures: this.aiConsecutiveFailures,
      eventsPerSecond: uptimeMs > 0 ? (this.eventsProcessedCount / (uptimeMs / 1000)) : 0,
    };
  }

  /**
   * Initialize the gateway and load all active rooms
   * Called once on application startup
   */
  async initializeGateway(): Promise<void> {
    if (this.gatewayInitialized) {
      log.info('[ChatServerHub] Gateway already initialized, skipping re-initialization');
      return;
    }

    log.info(`[ChatServerHub] Initializing gateway v${CHAT_SERVER_HUB.version}...`);
    
    try {
      // Seed persistent HelpDesk room - always available platform-wide
      await this.seedHelpDeskRoom();
      
      // Load all active rooms from database
      await this.loadAllActiveRooms();
      
      // Start heartbeat to track room activity
      this.startHeartbeat();
      
      this.gatewayInitialized = true;
      log.info(
        `[ChatServerHub] Gateway initialized successfully - ` +
        `${this.activeRooms.size} active rooms loaded`
      );
    } catch (error) {
      log.error('[ChatServerHub] Failed to initialize gateway:', error);
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

    log.info('[ChatServerHub] Seeding HelpDesk room with HelpAI bot...');
    
    try {
      // Ensure platform workspace exists before creating HelpDesk room
      // This creates the workspace with PLATFORM_WORKSPACE_ID if it doesn't exist
      await seedPlatformWorkspace();
    } catch (wsError) {
      log.warn('[ChatServerHub] Failed to seed platform workspace, HelpDesk seeding may fail:', wsError);
      // Continue anyway - the workspace might already exist from previous runs
    }

    try {
      // ──────────────────────────────────────────────────────────────────────
      // ENFORCEMENT: "Help Desk" is a PLATFORM-ONLY room.
      // Purge any duplicates from ALL three layers: supportRooms,
      // organizationChatRooms, and chatConversations outside the platform workspace.
      // This guard runs on every startup so it self-heals in development too.
      // ──────────────────────────────────────────────────────────────────────
      const HELP_DESK_NAMES = ['Help Desk', 'help desk', 'helpdesk', 'help-desk'];

      // 1. Support room duplicates (workspace-scoped)
      const dupSupportRooms = await db
        .select({ id: supportRooms.id })
        .from(supportRooms)
        .where(and(eq(supportRooms.slug, HELPDESK_SLUG), isNotNull(supportRooms.workspaceId)));
      if (dupSupportRooms.length > 0) {
        const ids = dupSupportRooms.map(d => d.id);
        await db.delete(supportRooms).where(inArray(supportRooms.id, ids));
        log.warn(`[ChatServerHub] Removed ${ids.length} workspace-scoped supportRoom duplicate(s): ${ids.join(', ')}`);
      }

      // 2. Organization chat rooms named "Help Desk" (not in platform workspace)
      const dupOrgRooms = await db
        .select({ id: organizationChatRooms.id, conversationId: organizationChatRooms.conversationId })
        .from(organizationChatRooms)
        .where(
          and(
            inArray(organizationChatRooms.roomName, HELP_DESK_NAMES),
            not(eq(organizationChatRooms.workspaceId, PLATFORM_WORKSPACE_ID))
          )
        );
      if (dupOrgRooms.length > 0) {
        const ids = dupOrgRooms.map(d => d.id);
        const convIds = dupOrgRooms.map(d => d.conversationId).filter(Boolean) as string[];
        await db.delete(organizationChatRooms).where(inArray(organizationChatRooms.id, ids));
        if (convIds.length > 0) {
          await db.delete(chatConversations).where(inArray(chatConversations.id, convIds));
        }
        log.warn(`[ChatServerHub] Removed ${ids.length} org-room "Help Desk" duplicate(s) and ${convIds.length} conversation(s)`);
      }

      // 3. chatConversations named "Help Desk" in non-platform workspaces
      const dupConvs = await db
        .select({ id: chatConversations.id })
        .from(chatConversations)
        .where(
          and(
            inArray(chatConversations.subject, HELP_DESK_NAMES),
            isNotNull(chatConversations.workspaceId),
            not(eq(chatConversations.workspaceId, PLATFORM_WORKSPACE_ID))
          )
        );
      if (dupConvs.length > 0) {
        const ids = dupConvs.map(d => d.id);
        await db.delete(chatConversations).where(inArray(chatConversations.id, ids));
        log.warn(`[ChatServerHub] Removed ${ids.length} chatConversation "Help Desk" duplicate(s) in non-platform workspaces`);
      }

      // Check if the canonical platform-wide HelpDesk room exists
      const [existingRoom] = await db
        .select()
        .from(supportRooms)
        .where(and(eq(supportRooms.slug, HELPDESK_SLUG), isNull(supportRooms.workspaceId)))
        .limit(1);

      let conversationId: string;

      if (existingRoom) {
        log.info('[ChatServerHub] HelpDesk room exists, checking conversation...');
        
        let existingConversation = null;
        if (existingRoom.conversationId) {
          const [conv] = await db
            .select()
            .from(chatConversations)
            .where(eq(chatConversations.id, existingRoom.conversationId))
            .limit(1);
          existingConversation = conv || null;
        }
        
        if (existingConversation) {
          conversationId = existingConversation.id;
          log.info('[ChatServerHub] HelpDesk conversation verified:', conversationId);
        } else {
          if (existingRoom.conversationId) {
            log.warn('[ChatServerHub] HelpDesk conversation reference is stale (', existingRoom.conversationId, ') - recreating');
          }
          const [conversation] = await db.insert(chatConversations).values({
            workspaceId: PLATFORM_WORKSPACE_ID,
            subject: 'Help Desk',
            conversationType: 'dm_support',
            visibility: 'public',
            status: 'active',
          }).returning();
          
          conversationId = conversation.id;
          
          await db.update(supportRooms)
            .set({ conversationId })
            .where(eq(supportRooms.id, existingRoom.id));
          
          log.info('[ChatServerHub] Created persistent conversation for HelpDesk room:', conversationId);
        }
      } else {
        // Create the conversation first
        const [conversation] = await db.insert(chatConversations).values({
          workspaceId: PLATFORM_WORKSPACE_ID,
          subject: 'Help Desk',
          conversationType: 'dm_support',
          visibility: 'public',
          status: 'active',
        }).returning();
        
        conversationId = conversation.id;

        // Create the HelpDesk support room
        await db.insert(supportRooms).values({
          slug: HELPDESK_SLUG,
          name: 'Help Desk',
          description: 'Live support chat powered by HelpAI - always here to assist you',
          mode: 'sup', // IRC mode: enables HelpAI bot auto-response
          status: 'open',
          workspaceId: null, // Platform-wide room
          conversationId,
          requiresTicket: false,
          allowedRoles: JSON.stringify(['*']), // Allow everyone
        });

        log.info('[ChatServerHub] Created HelpDesk support room');
      }

      // Ensure HelpAI bot user exists (use raw SQL for custom ID)
      const [existingBot] = await db
        .select()
        .from(users)
        .where(eq(users.id, HELPAI_BOT_ID))
        .limit(1);

      if (!existingBot) {
        // Converted to Drizzle ORM: ON CONFLICT
        await db.insert(users).values({
          id: HELPAI_BOT_ID,
          email: 'helpai@coaileague.ai',
          firstName: 'HelpAI',
          lastName: 'Bot',
          role: 'system',
          currentWorkspaceId: PLATFORM_WORKSPACE_ID,
        }).onConflictDoNothing({ target: users.id });
        log.info('[ChatServerHub] Created HelpAI bot user');
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
        log.info('[ChatServerHub] Added HelpAI bot as HelpDesk participant');
      } else if (!existingParticipant.isActive) {
        // Reactivate if inactive
        await db.update(chatParticipants)
          .set({ isActive: true, joinedAt: new Date() })
          .where(eq(chatParticipants.id, existingParticipant.id));
        log.info('[ChatServerHub] Reactivated HelpAI bot in HelpDesk');
      }

      log.info('[ChatServerHub] HelpDesk room seeded successfully with HelpAI bot');
    } catch (error) {
      log.error('[ChatServerHub] Error seeding HelpDesk room:', error);
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
              workspaceId: room.workspaceId || PLATFORM_WORKSPACE_ID,
              subject: room.name,
              participantCount,
              status: room.status || 'open',
              createdAt: room.createdAt || new Date(),
              lastActivity: new Date(),
            });
          }
        }
        log.info(`[ChatServerHub] Loaded ${supportRoomsList.length} support rooms`);
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
        log.info(`[ChatServerHub] Loaded ${orgRoomsList.length} organization rooms`);
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
              workspaceId: conv.workspaceId || PLATFORM_WORKSPACE_ID,
              subject: conv.subject || 'Untitled',
              participantCount,
              status: conv.status || 'active',
              createdAt: conv.createdAt || new Date(),
              lastActivity: new Date(),
            });
          }
        }
        log.info(
          `[ChatServerHub] Loaded work and meeting rooms - ` +
          `Work: ${conversations.filter(c => c.conversationType === 'shift_chat').length}, ` +
          `Meeting: ${conversations.filter(c => c.conversationType === 'open_chat').length}`
        );
      }
    } catch (error) {
      log.error('[ChatServerHub] Error loading active rooms:', error);
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
    } catch (error: any) {
      log.warn(`[ChatServerHub] Error getting participant count (non-fatal):`, error?.message || 'unknown');
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
        log.error('[ChatServerHub] Heartbeat error:', error);
      }
    }, CHAT_SERVER_HUB.heartbeatIntervalMs);

    log.info('[ChatServerHub] Heartbeat started');
  }

  /**
   * Shutdown the gateway
   */
  async shutdownGateway(): Promise<void> {
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
      this.heartbeatInterval = null;
    }
    if (this.batchFlushInterval) {
      clearInterval(this.batchFlushInterval);
      this.batchFlushInterval = null;
    }
    if (this.cacheCleanupInterval) {
      clearInterval(this.cacheCleanupInterval);
      this.cacheCleanupInterval = null;
    }
    if (this.healthMonitorInterval) {
      clearInterval(this.healthMonitorInterval);
      this.healthMonitorInterval = null;
    }
    this.flushEventBatch();
    this.activeRooms.clear();
    this.roomStateCache.clear();
    this.eventBatchQueue.clear();
    this.gatewayInitialized = false;
    log.info('[ChatServerHub] Gateway shutdown complete');
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
    cacheSize: number;
    batchQueueSize: number;
    connectionHealth: ConnectionHealthStats;
  } {
    const stats = {
      totalRooms: this.activeRooms.size,
      roomsByType: {} as Record<string, number>,
      totalParticipants: 0,
      isInitialized: this.gatewayInitialized,
      version: CHAT_SERVER_HUB.version,
      cacheSize: this.roomStateCache.size,
      batchQueueSize: this.eventBatchQueue.size,
      connectionHealth: this.getConnectionHealth(),
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
    log.info('[ChatServerHub] WebSocket broadcaster registered');
  }

  /**
   * Subscribe to platform event bus for incoming events
   */
  private subscribeToEventBus(): void {
    if (this.eventBusSubscribed) return;

    // Defensive: under certain bootstrap orders (e.g. vitest module loading,
    // partial DI in workers) `platformEventBus` may not yet be initialised
    // when our deferred `setImmediate` fires. Re-arm and retry instead of
    // throwing an uncaught TypeError that takes down the host process.
    if (!platformEventBus || typeof platformEventBus.subscribe !== 'function') {
      setImmediate(() => this.subscribeToEventBus());
      return;
    }

    this.eventBusSubscribed = true;

    // ChatServerHub intentionally uses '*' — it routes any event that carries
    // event.metadata.conversationId to the appropriate WebSocket chatroom.
    // Since conversationId can appear on any event type, filtering by '*' is correct.
    platformEventBus.subscribe('*', {
      name: 'ChatServerHub',
      handler: async (event: PlatformEvent) => {
        await this.handlePlatformEvent(event);
      }
    });
    log.info('[ChatServerHub] Subscribed to Platform Event Bus');
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
    this.eventsProcessedCount++;
    log.info(`[ChatServerHub] Event: ${event.type} - ${event.title}`);

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
      log.error('[ChatServerHub] Error processing event:', error);
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
          const sentiment = (event as any).metadata.sentiment || 'neutral';
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
          const createdAt = (event as any).metadata.createdAt || new Date();
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
      log.error('[ChatServerHub] Error tracking analytics:', error);
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
    log.info(`[ChatServerHub] Handler subscribed to ${eventType}`);
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
        // Map ChatServerHub notification types to valid UniversalNotificationEngine types
        // Valid types: document_extraction, issue_detected, migration_complete, guardrail_violation, quota_warning, platform_update, system
        const typeMapping: Record<string, 'system' | 'issue_detected'> = {
          'system': 'system',
          'support_escalation': 'issue_detected',
          'ai_action_completed': 'system',  // AI completions routed as system notifications
          'ai_approval_needed': 'issue_detected',  // Approvals are issues needing attention
          'mention': 'system',
        };
        const engineType = typeMapping[notificationType] || 'system';
        
        // Determine severity based on event type (using warning/critical only for consistency)
        const severityMapping: Record<string, 'info' | 'warning' | 'critical'> = {
          'ticket_escalated': 'warning',
          'ai_escalation': 'warning',
          'user_kicked': 'warning',
          'user_banned': 'critical',  // Bans are critical security actions
          'sentiment_alert': 'warning',
        };
        const severity = severityMapping[event.type] || 'info';
        
        // Route through Trinity AI for contextual enrichment
        // ChatDock deep link: `/chatrooms?room={roomId}` so push taps open the correct room.
        // pushTag collapses multiple pushes from the same room into one notification.
        await universalNotificationEngine.sendNotification({
          workspaceId: event.metadata.workspaceId,
          userId: event.metadata.targetUserId,
          type: engineType,
          title: event.title,
          message: event.description,
          severity,
          actionUrl: event.metadata.ticketNumber
            ? `/support/tickets/${event.metadata.ticketNumber}`
            : `/chatrooms?room=${event.metadata.conversationId}`,
          pushTag: event.metadata.conversationId
            ? `chat-room-${event.metadata.conversationId}`
            : undefined,
          metadata: { 
            chatEventType: event.type, 
            originalNotificationType: notificationType,
            relatedEntityType: 'chat_event',
            relatedEntityId: event.metadata.messageId || event.metadata.ticketId,
            source: 'chat_server_hub',
            ...event.metadata,
          },
        });
      } else if (event.metadata.audience === 'staff') {
        log.info(`[ChatServerHub] Staff notification: ${event.title}`);
      }
    } catch (error) {
      log.error('[ChatServerHub] Failed to create notifications:', error);
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
        log.error(`[ChatServerHub] Subscriber error:`, error);
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
      case 'support_escalation':
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
      case 'support_escalation':
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
    const message = params.messagePreview || '';

    // ── VOICE TRANSCRIPTION — Detect [Shared audio] attachments ───────────────
    // When a user sends a voice note, transcribe it asynchronously and
    // post the transcript as a follow-up system message so HelpAI/Trinity
    // can process it as a command. Non-fatal: original message still delivers.
    const AUDIO_PATTERN = /\[Shared audio\]\(([^)]+)\)/i;
    const audioMatch = message.match(AUDIO_PATTERN);
    if (audioMatch && audioMatch[1]) {
      const audioUrl = audioMatch[1];
      scheduleNonBlocking('chat.voice.transcribe', async () => {
        try {
          const { transcribeVoiceMessage } = await import('./chat/voiceTranscriptionService');
          const transcript = await transcribeVoiceMessage(audioUrl);
          if (!transcript) return;

          const voiceTranscriptText = `🎙️ Voice message from ${params.userName}: "${transcript}"`;

          // Broadcast the transcript as a system message so clients render it
          if (this.wsBroadcaster) {
            this.wsBroadcaster({
              type: 'bot_reply',
              conversationId: params.conversationId,
              workspaceId: params.workspaceId,
              payload: {
                message: voiceTranscriptText,
                voiceTranscript: true,
                originalAudioUrl: audioUrl,
                originalSenderId: params.userId,
              },
            });
          }

          // If this was posted in an assisting HelpAI session, feed the transcript as a user turn
          try {
            const [session] = await db
              .select()
              .from(helpaiSessions)
              .where(and(eq(helpaiSessions.userId, params.userId), eq(helpaiSessions.state, 'assisting')))
              .orderBy(desc(helpaiSessions.createdAt))
              .limit(1);
            if (session) {
              const response = await helpAIBotService.handleMessage(session.id, transcript);
              if (this.wsBroadcaster && response?.response) {
                this.wsBroadcaster({
                  type: 'bot_reply',
                  conversationId: params.conversationId,
                  workspaceId: params.workspaceId,
                  payload: { message: response.response, triggeredByVoice: true },
                });
              }
            }
          } catch (routeErr: any) {
            log.warn('[ChatServerHub] Voice transcript routing failed (non-fatal):', routeErr?.message);
          }
        } catch (err: any) {
          log.warn('[ChatServerHub] Voice transcription failed (non-fatal):', err?.message);
        }
      });
    }

    // INTERCEPT HELPAI COMMANDS (H004)
    if (message.startsWith('/helpai') || message.startsWith('/trinity help')) {
      try {
        const sessionData = await helpAIBotService.startSession(params.workspaceId || PLATFORM_WORKSPACE_ID, params.userId);
        
        // Broadcast reply to user
        const botReply = `HelpAI session started. Ticket: ${sessionData.ticketNumber}. Queue Position: ${sessionData.queuePosition || 'Immediate'}`;
        
        if (this.wsBroadcaster) {
          this.wsBroadcaster({
            type: 'bot_reply',
            conversationId: params.conversationId,
            workspaceId: params.workspaceId,
            payload: {
              message: botReply,
              ticketNumber: sessionData.ticketNumber,
              queuePosition: sessionData.queuePosition
            }
          });
        }

        // Log bot reply
        await db.insert(helpaiActionLog).values({
          sessionId: sessionData.sessionId,
          workspaceId: params.workspaceId,
          userId: 'helpai-bot',
          actionType: 'bot_reply',
          actionName: 'Session Start Acknowledgement',
          inputPayload: { message: botReply }
        });

        return; // Stop standard delivery for command
      } catch (err) {
        log.error('[ChatServerHub] Failed to handle /helpai command:', err);
      }
    }

    // INTERCEPT BOT COMMANDS LIST
    if (message === '/commands') {
      const commandsList = "Available commands: /helpai, /trinity help, /status, /ticket, /bug, /faq";
      if (this.wsBroadcaster) {
        this.wsBroadcaster({
          type: 'bot_reply',
          conversationId: params.conversationId,
          workspaceId: params.workspaceId,
          payload: { message: commandsList }
        });
      }
      return;
    }

    // DETECT SAFETY CODES (####-## pattern)
    const safetyCodeMatch = message.match(/^(\d{4}-\d{2})$/);
    if (safetyCodeMatch) {
       // Find active session for this user
       const [session] = await db.select().from(helpaiSessions)
         .where(and(eq(helpaiSessions.userId, params.userId), eq(helpaiSessions.state, 'assisting')))
         .orderBy(desc(helpaiSessions.createdAt))
         .limit(1);
       
       if (session) {
         const response = await helpAIBotService.handleMessage(session.id, message);
         if (this.wsBroadcaster) {
           this.wsBroadcaster({
             type: 'bot_reply',
             conversationId: params.conversationId,
             workspaceId: params.workspaceId,
             payload: { message: response.response }
           });
         }
         return; // Stop standard delivery for safety code
       }
    }

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
   * Emit when HelpAI determines user needs human support
   * Escalation triggers alert to support staff for takeover
   */
  async emitSupportEscalation(params: {
    conversationId: string;
    userId: string;
    userName: string;
    reason: string;
    messagePreview: string;
    workspaceId?: string;
  }): Promise<void> {
    // Broadcast to support staff via WebSocket
    if (this.wsBroadcaster) {
      this.wsBroadcaster({
        type: 'support_escalation',
        conversationId: params.conversationId,
        workspaceId: params.workspaceId,
        payload: {
          userId: params.userId,
          userName: params.userName,
          reason: params.reason,
          messagePreview: params.messagePreview,
          timestamp: new Date().toISOString(),
          priority: 'high',
        }
      });
    }

    // Log and emit event for tracking
    await this.emit({
      type: 'support_escalation',
      title: `Support Escalation: ${params.userName}`,
      description: `Reason: ${params.reason} | "${params.messagePreview}"`,
      metadata: {
        conversationId: params.conversationId,
        userId: params.userId,
        userName: params.userName,
        audience: 'staff',
        severity: 'high' as const,
      },
      visibility: 'staff',
      shouldNotify: true,
      shouldPersistToWhatsNew: true,
    });

    log.info(`[ChatServerHub] Support escalation emitted for ${params.userName}: ${params.reason}`);
  }

  /**
   * Emit when a user joins a chatroom - notify other workspace members
   * Used for WhatsApp-style notifications
   */
  async emitUserJoinedRoom(params: {
    conversationId: string;
    roomName: string;
    workspaceId?: string;
    userId: string;
    userName: string;
    addedBy?: string;
    addedByName?: string;
  }): Promise<void> {
    // Broadcast user_added_to_chatroom to notification subscribers
    if (this.wsBroadcaster) {
      this.wsBroadcaster({
        type: 'user_added_to_chatroom',
        conversationId: params.conversationId,
        workspaceId: params.workspaceId,
        userId: params.userId,
        payload: {
          chatroomId: params.conversationId,
          chatroomName: params.roomName,
          userId: params.userId,
          userName: params.userName,
          addedBy: params.addedBy,
          addedByName: params.addedByName,
          timestamp: new Date().toISOString(),
        }
      });
    }

    // Track analytics
    await this.emit({
      type: 'user_joined_room',
      title: `${params.userName} joined ${params.roomName}`,
      description: params.addedByName 
        ? `${params.userName} was added to ${params.roomName} by ${params.addedByName}`
        : `${params.userName} joined ${params.roomName}`,
      metadata: {
        conversationId: params.conversationId,
        workspaceId: params.workspaceId,
        userId: params.userId,
        userName: params.userName,
        targetUserId: params.addedBy,
        targetUserName: params.addedByName,
        audience: 'room',
      },
      shouldPersistToWhatsNew: false,
      shouldNotify: false, // Already handled via WebSocket broadcast above
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

  /**
   * Get all rooms accessible to a user based on their role
   * Support roles (root_admin, co_admin, sysops, platform_support) see ALL rooms
   * Org users see only their workspace rooms
   */
  async getAccessibleRooms(params: {
    userId: string;
    workspaceId?: string;
    platformRole?: string;
  }): Promise<ActiveRoom[]> {
    const { userId, workspaceId, platformRole } = params;
    
    // Support roles see all rooms platform-wide
    const supportRoles = ['root_admin', 'deputy_admin', 'sysop', 'support_agent', 'support_manager'];
    const hasPlatformAccess = platformRole && supportRoles.includes(platformRole);
    
    if (hasPlatformAccess) {
      return this.getAllActiveRooms();
    }
    
    // Org users see only their workspace rooms + platform HelpDesk
    const allRooms = this.getAllActiveRooms();
    return allRooms.filter(room => {
      if (room.type === 'support' && room.subject === 'Help Desk') {
        return true; // Everyone can see HelpDesk
      }
      return room.workspaceId === workspaceId;
    });
  }

  /**
   * Log support role access to private room for audit
   * Trinity chat subagent tracks all support role access
   */
  async logSupportRoleAccess(params: {
    userId: string;
    userName: string;
    platformRole: string;
    roomId: string;
    roomName: string;
    workspaceId: string;
    action: 'joined' | 'left' | 'viewed';
  }): Promise<void> {
    const { userId, userName, platformRole, roomId, roomName, workspaceId, action } = params;
    
    log.info(`[ChatServerHub] AUDIT: Support role ${platformRole} (${userName}) ${action} room "${roomName}" (${roomId}) in workspace ${workspaceId}`);
    
    // Emit audit event via platformEventBus
    await platformEventBus.publish({
      type: 'audit',
      category: 'security',
      title: `Support Role Room Access`,
      description: `${userName} (${platformRole}) ${action} private room "${roomName}"`,
      workspaceId,
      userId,
      metadata: {
        roomId,
        roomName,
        platformRole,
        action,
        timestamp: new Date().toISOString(),
        accessType: 'support_role_cross_org',
      },
      visibility: 'manager',
      priority: 3,
    });
  }

  /**
   * Force disconnect a user from a support session
   * Called when ticket is resolved to move agent to next user in queue
   */
  async forceDisconnectUser(params: {
    sessionId: string;
    userId: string;
    reason: string;
    staffId?: string;
  }): Promise<void> {
    const { sessionId, userId, reason, staffId } = params;
    
    log.info(`[ChatServerHub] Force disconnecting user ${userId} from session ${sessionId}: ${reason}`);
    
    // Broadcast disconnect event via WebSocket
    if (this.wsBroadcaster) {
      this.wsBroadcaster({
        type: 'force_disconnect',
        userId,
        payload: {
          sessionId,
          reason,
          staffId,
          timestamp: new Date().toISOString(),
          message: 'Your support session has been resolved. Thank you for contacting us!',
        }
      });
    }
    
    // Emit event for tracking
    await this.emit({
      type: 'user_left_room',
      title: 'Session Resolved - User Disconnected',
      description: `User disconnected from support session: ${reason}`,
      metadata: {
        conversationId: sessionId,
        userId,
        targetUserId: userId,
        severity: 'low',
        audience: 'staff',
      },
      shouldNotify: false,
    });
  }

  /**
   * Get HelpDesk room info for the universal helpdesk chatroom
   */
  async getHelpDeskRoom(): Promise<ActiveRoom | null> {
    const rooms = this.getActiveRoomsByType('support');
    return rooms.find(r => r.subject === 'Help Desk') || null;
  }

  /**
   * Add user to HelpDesk support session with private DM thread
   * Creates isolated DM thread where user only sees their own messages
   */
  async createHelpDeskDMThread(params: {
    userId: string;
    userName: string;
    workspaceId?: string;
    sessionId: string;
  }): Promise<{ conversationId: string; threadId: string }> {
    const { userId, userName, sessionId, workspaceId } = params;
    
    // Get HelpDesk room
    const helpDesk = await this.getHelpDeskRoom();
    if (!helpDesk) {
      throw new Error('HelpDesk room not found');
    }
    
    // The threadId is the sessionId - used to filter messages for this user
    const threadId = sessionId;
    
    log.info(`[ChatServerHub] Created DM thread ${threadId} for user ${userName} in HelpDesk`);
    
    return {
      conversationId: helpDesk.conversationId,
      threadId,
    };
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

// Export helpdesk-specific methods
export const getAccessibleChatRooms = (params: { userId: string; workspaceId?: string; platformRole?: string }) =>
  ChatServerHub.getAccessibleRooms(params);
export const logSupportRoleRoomAccess = (params: { userId: string; userName: string; platformRole: string; roomId: string; roomName: string; workspaceId: string; action: 'joined' | 'left' | 'viewed' }) =>
  ChatServerHub.logSupportRoleAccess(params);
export const forceDisconnectFromSession = (params: { sessionId: string; userId: string; reason: string; staffId?: string }) =>
  ChatServerHub.forceDisconnectUser(params);
export const getHelpDeskChatRoom = () => ChatServerHub.getHelpDeskRoom();
