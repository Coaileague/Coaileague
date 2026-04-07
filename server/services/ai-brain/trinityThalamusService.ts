/**
 * TRINITY THALAMUS SERVICE
 * ========================
 * The Universal Sensory Gateway — the missing structural organ that every
 * other brain region depends on to function correctly.
 *
 * Biological analog: Every sensory signal the human brain receives passes
 * through the thalamus before reaching the cortex. Nothing reaches
 * consciousness without thalamic clearance. The thalamus filters noise,
 * prioritizes signals, and routes each signal to the correct brain region.
 *
 * Trinity's Thalamus does the same for ALL platform signals:
 * - Classifies every incoming signal into exactly one of 12 types
 * - Assigns a priority score 0-100 based on urgency, trust tier, and context
 * - Routes to the correct brain region(s)
 * - Deduplicates signals within a 60-second window
 * - Rate-protects the global workspace at 50 signals/second
 * - Logs every signal to thalamic_log — Trinity's complete sensory record
 *
 * The thalamus does not make decisions. It classifies, prioritizes, and routes.
 */

import { db, pool } from '../../db';
import { thalamiclogs } from '@shared/schema';
import { broadcastToGlobalWorkspace } from './trinityConnectomeService';
import crypto from 'crypto';
import { typedPool } from '../../lib/typedSql';
import { createLogger } from '../../lib/logger';
const log = createLogger('trinityThalamusService');

// ============================================================================
// SIGNAL TYPES — 12 canonical input categories
// ============================================================================

export type ThalamicSignalType =
  | 'CONVERSATIONAL'   // Direct message or chat from a human user
  | 'VOICE_INPUT'      // Transcribed audio from officer or manager
  | 'PLATFORM_EVENT'   // Internal CoAIleague event from the event bus
  | 'INCIDENT_SIGNAL'  // ReportBot DAR submission, panic alert, emergency escalation
  | 'COMPLIANCE_SIGNAL'// License expiration alert, armed post violation, regulatory trigger
  | 'FINANCIAL_SIGNAL' // Invoice, payroll, payment, billing event
  | 'SCHEDULE_SIGNAL'  // Shift assignment, calloff, coverage gap, schedule publication
  | 'DOCUMENT_SIGNAL'  // Uploaded document, form submission, signature completion
  | 'SENSOR_SIGNAL'    // GPS event, clock in/out, lone worker check-in, visitor log
  | 'EXTERNAL_SIGNAL'  // Resend email, Stripe webhook, QuickBooks event, Plaid event
  | 'SYSTEM_SIGNAL'    // Health check, cron completion, kill switch change, domain health
  | 'SELF_SIGNAL';     // Trinity's own internal signals: dream state, self-model updates

// ============================================================================
// TRUST TIERS — signal source authority hierarchy
// ============================================================================

export type TrustTier =
  | 'owner'           // Platform owner — highest authority
  | 'operations_manager'
  | 'supervisor'
  | 'officer'
  | 'client'
  | 'system'          // Internal platform system
  | 'external'        // Third-party webhooks
  | 'trinity_self';   // Trinity's own internal signals

// Priority base scores by trust tier (additive modifier)
const TRUST_TIER_MODIFIER: Record<TrustTier, number> = {
  owner: 15,
  operations_manager: 10,
  supervisor: 7,
  officer: 4,
  client: 3,
  system: 5,
  external: 2,
  trinity_self: 1,
};

// ============================================================================
// BRAIN REGION ROUTING MAP
// ============================================================================

export type BrainRegionTarget =
  | 'WERNICKE_BROCA'        // Language processing
  | 'AMYGDALA'              // Urgency / threat detection
  | 'PREFRONTAL_CORTEX'     // Executive reasoning / financial decisions
  | 'CEREBELLUM'            // Habit-based pattern execution (bots)
  | 'HIPPOCAMPUS'           // Memory storage and retrieval
  | 'GLOBAL_WORKSPACE'      // Immediate broadcast — high priority bypass
  | 'PROPRIOCEPTION'        // System health monitoring
  | 'SELF_AWARENESS';       // Self-model update pipeline

// ============================================================================
// STRUCTURED SIGNAL — what the thalamus passes to brain regions
// ============================================================================

export interface ThalamicSignal {
  signalId: string;
  arrivedAt: Date;
  signalType: ThalamicSignalType;
  source: string;
  sourceTrustTier: TrustTier;
  workspaceId?: string;
  userId?: string;
  priorityScore: number;
  routedTo: BrainRegionTarget[];
  routingReason: string;
  highPriorityCopySent: boolean;
  payload: Record<string, any>;
  rawSignalHash: string;
}

// ============================================================================
// DEDUPLICATION WINDOW — in-memory cache for 60-second dedup
// ============================================================================

interface DedupEntry {
  signalId: string;
  hash: string;
  arrivedAt: number;
  mergeCount: number;
}

const DEDUP_WINDOW_MS = 60_000;        // 60 second dedup window
const NEAR_DEDUP_WINDOW_MS = 5_000;   // 5 second near-duplicate merge window
const MAX_DEDUP_CACHE = 5_000;

// ============================================================================
// RATE PROTECTION — 50 signals/second ceiling to global workspace
// ============================================================================

const RATE_LIMIT_PER_SECOND = 50;

// ============================================================================
// THALAMUS SERVICE CLASS
// ============================================================================

class TrinityThalamusService {
  private dedupCache: Map<string, DedupEntry> = new Map();
  private signalQueue: ThalamicSignal[] = [];
  private globalWorkspaceCount = 0;
  private rateWindowStart = Date.now();
  private floodAlertSent = false;

  constructor() {
    // Prune dedup cache every 90 seconds
    setInterval(() => this.pruneDedupCache(), 90_000);
    // Reset rate counter every second
    setInterval(() => {
      this.globalWorkspaceCount = 0;
      this.rateWindowStart = Date.now();
      this.floodAlertSent = false;
    }, 1_000);
  }

  // ==========================================================================
  // PUBLIC ENTRY POINT — every signal must pass through here
  // ==========================================================================

  /**
   * Process any incoming signal through all four thalamic operations:
   * 1. Classify  2. Score priority  3. Route  4. Log
   *
   * @param rawPayload    The raw event/message payload
   * @param sourceHint    Optional hint for classification (e.g. 'chat', 'webhook', 'clockbot')
   * @param userId        Originating user ID if known
   * @param workspaceId   Workspace context if known
   * @param trustTier     Trust tier of the signal source
   * @returns             The structured ThalamicSignal, or null if deduplicated/dropped
   */
  async process(
    rawPayload: Record<string, any>,
    sourceHint: string,
    userId?: string,
    workspaceId?: string,
    trustTier: TrustTier = 'system',
  ): Promise<ThalamicSignal | null> {
    const arrivedAt = new Date();
    const signalId = crypto.randomUUID();

    // OPERATION 1 — CLASSIFICATION
    const signalType = this.classify(rawPayload, sourceHint);

    // OPERATION 2 — PRIORITY SCORING
    const priorityScore = this.score(signalType, trustTier, rawPayload, workspaceId);

    // DEDUPLICATION CHECK
    const rawSignalHash = this.hashSignal(rawPayload, signalType, workspaceId, userId);
    const dedupResult = this.checkDedup(rawSignalHash, signalId, priorityScore);
    if (dedupResult === 'DROP') {
      await this.logSignal({
        signalId,
        arrivedAt,
        signalType,
        source: sourceHint,
        sourceTrustTier: trustTier,
        workspaceId,
        userId,
        priorityScore,
        routedTo: [],
        routingReason: 'deduplicated — exact duplicate within 60s window',
        highPriorityCopySent: false,
        payload: rawPayload,
        rawSignalHash,
      }, true, false);
      return null;
    }

    // OPERATION 3 — ROUTING
    const { routedTo, routingReason } = this.route(signalType, priorityScore, rawPayload);

    const signal: ThalamicSignal = {
      signalId,
      arrivedAt,
      signalType,
      source: sourceHint,
      sourceTrustTier: trustTier,
      workspaceId,
      userId,
      priorityScore,
      routedTo,
      routingReason,
      highPriorityCopySent: false,
      payload: rawPayload,
      rawSignalHash,
    };

    // High-priority bypass — simultaneously route to destination AND global workspace
    if (priorityScore >= 70) {
      signal.highPriorityCopySent = true;
      this.broadcastHighPriority(signal);
    }

    // RATE PROTECTION for global workspace broadcasts
    if (routedTo.includes('GLOBAL_WORKSPACE')) {
      this.globalWorkspaceCount++;
      if (this.globalWorkspaceCount > RATE_LIMIT_PER_SECOND) {
        // Queue for priority-ordered processing — never drop CRITICAL (90+)
        if (priorityScore < 90) {
          this.signalQueue.push(signal);
          this.signalQueue.sort((a, b) => b.priorityScore - a.priorityScore);
          await this.logSignal(signal, false, false);
          return signal; // Still return but queued
        }
      }
    }

    // OPERATION 4 — LOGGING (non-blocking for LOW/BACKGROUND)
    if (priorityScore >= 50) {
      await this.logSignal(signal, false, dedupResult === 'MERGE');
    } else {
      this.logSignal(signal, false, dedupResult === 'MERGE').catch((err) => log.warn('[trinityThalamusService] Fire-and-forget failed:', err));
    }

    return signal;
  }

  // ==========================================================================
  // OPERATION 1 — CLASSIFICATION
  // ==========================================================================

  classify(payload: Record<string, any>, sourceHint: string): ThalamicSignalType {
    const hint = sourceHint.toLowerCase();
    const type = (payload.type || payload.eventType || payload.signalType || '').toLowerCase();
    const event = (payload.event || '').toLowerCase();

    // Self signals — Trinity's own internal outputs
    if (hint.includes('dreamstate') || hint.includes('dream') || hint.includes('selfmodel')
        || type.includes('dream') || type.includes('self_model') || hint.includes('self_signal')) {
      return 'SELF_SIGNAL';
    }

    // Incident / emergency signals — highest attention
    if (hint.includes('panic') || hint.includes('incident') || hint.includes('reportbot')
        || type.includes('panic') || type.includes('incident') || type.includes('dar')
        || event.includes('incident') || event.includes('panic') || event.includes('bolo')) {
      return 'INCIDENT_SIGNAL';
    }

    // Compliance signals — includes Phase A regulatory KB signals
    if (hint.includes('compliance') || hint.includes('license') || hint.includes('regulatory')
        || hint.includes('regulatory_kb') || hint.includes('trinityregulatory')
        || type.includes('compliance') || type.includes('license') || type.includes('regulatory')
        || event.includes('compliance') || event.includes('license') || event.includes('regulatory')
        || event.includes('regulatory_review') || event.includes('statute')) {
      return 'COMPLIANCE_SIGNAL';
    }

    // Financial signals — includes Phase B financial intelligence engine signals
    if (hint.includes('payroll') || hint.includes('invoice') || hint.includes('stripe')
        || hint.includes('payment') || hint.includes('billing') || hint.includes('plaid')
        || hint.includes('financial_intelligence') || hint.includes('site_margin')
        || hint.includes('contract_health') || hint.includes('labor_forecast')
        || type.includes('payroll') || type.includes('invoice') || type.includes('billing')
        || type.includes('site_margin') || type.includes('contract_health') || type.includes('margin_alert')
        || event.includes('payment') || event.includes('invoice') || event.includes('payroll')
        || event.includes('margin_drop') || event.includes('contract_overrun')) {
      return 'FINANCIAL_SIGNAL';
    }

    // Schedule signals
    if (hint.includes('schedule') || hint.includes('shift') || hint.includes('calloff')
        || type.includes('schedule') || type.includes('shift')
        || event.includes('shift') || event.includes('schedule') || event.includes('calloff')) {
      return 'SCHEDULE_SIGNAL';
    }

    // Sensor signals — clock events, GPS, lone worker, visitor log
    if (hint.includes('clock') || hint.includes('clockbot') || hint.includes('gps')
        || hint.includes('lone_worker') || hint.includes('visitor')
        || type.includes('clock') || type.includes('gps') || type.includes('checkin')
        || event.includes('clock') || event.includes('visitor') || event.includes('lone_worker')) {
      return 'SENSOR_SIGNAL';
    }

    // Document signals
    if (hint.includes('document') || hint.includes('upload') || hint.includes('signature')
        || type.includes('document') || type.includes('upload') || type.includes('form')
        || event.includes('document') || event.includes('signature')) {
      return 'DOCUMENT_SIGNAL';
    }

    // External webhooks
    if (hint.includes('webhook') || hint.includes('resend') || hint.includes('quickbooks')
        || hint.includes('stripe_webhook') || hint.includes('plaid')
        || type.includes('webhook') || event.includes('webhook')) {
      return 'EXTERNAL_SIGNAL';
    }

    // Voice input
    if (hint.includes('voice') || hint.includes('audio') || hint.includes('transcr')
        || type.includes('voice') || type.includes('audio')) {
      return 'VOICE_INPUT';
    }

    // System signals — health, cron, kill switch, Phase C autonomous task queue
    if (hint.includes('health') || hint.includes('cron') || hint.includes('kill_switch')
        || hint.includes('system') || hint.includes('domain_health')
        || hint.includes('autonomous_task') || hint.includes('trinityautonomous')
        || hint.includes('task_queue') || hint.includes('autonomous_scan')
        || type.includes('health') || type.includes('cron') || type.includes('system')
        || type.includes('autonomous_task') || type.includes('task_identified')
        || event.includes('autonomous_task') || event.includes('task_queue_scan')) {
      return 'SYSTEM_SIGNAL';
    }

    // Platform events — internal event bus emissions
    if (hint.includes('platform_event') || hint.includes('event_bus') || type.includes('platform')
        || event.length > 0) {
      return 'PLATFORM_EVENT';
    }

    // Default — conversational text message
    return 'CONVERSATIONAL';
  }

  // ==========================================================================
  // OPERATION 2 — PRIORITY SCORING
  // ==========================================================================

  score(
    signalType: ThalamicSignalType,
    trustTier: TrustTier,
    payload: Record<string, any>,
    workspaceId?: string,
  ): number {
    // Base score by signal type
    const BASE_SCORES: Record<ThalamicSignalType, number> = {
      INCIDENT_SIGNAL:   90,
      COMPLIANCE_SIGNAL: 70,
      FINANCIAL_SIGNAL:  65,
      SCHEDULE_SIGNAL:   50,
      SENSOR_SIGNAL:     55,
      CONVERSATIONAL:    45,
      VOICE_INPUT:       50,
      DOCUMENT_SIGNAL:   35,
      PLATFORM_EVENT:    40,
      EXTERNAL_SIGNAL:   35,
      SYSTEM_SIGNAL:     25,
      SELF_SIGNAL:        5,
    };

    let score = BASE_SCORES[signalType];

    // Trust tier modifier
    score += TRUST_TIER_MODIFIER[trustTier] || 0;

    // Time sensitivity modifiers
    const payloadStr = JSON.stringify(payload).toLowerCase();

    // Elevate for urgency keywords
    if (payloadStr.includes('panic') || payloadStr.includes('emergency') || payloadStr.includes('critical')) {
      score += 20;
    }
    if (payloadStr.includes('urgent') || payloadStr.includes('immediate') || payloadStr.includes('alert')) {
      score += 10;
    }
    // Elevate for safety-critical context
    if (payloadStr.includes('armed post') || payloadStr.includes('lone worker') || payloadStr.includes('missing officer')) {
      score += 15;
    }
    // Elevate for compliance near-expiry
    if (payloadStr.includes('expir') && (payloadStr.includes('7 day') || payloadStr.includes('today') || payloadStr.includes('overdue'))) {
      score += 12;
    }
    // Elevate for coverage gaps
    if (payloadStr.includes('no coverage') || payloadStr.includes('uncovered') || payloadStr.includes('gap')) {
      score += 8;
    }
    // Reduce for clearly routine/informational
    if (payloadStr.includes('routine') || payloadStr.includes('health check') || payloadStr.includes('cron complete')) {
      score -= 10;
    }

    return Math.min(100, Math.max(0, score));
  }

  // ==========================================================================
  // OPERATION 3 — ROUTING
  // ==========================================================================

  route(
    signalType: ThalamicSignalType,
    priorityScore: number,
    payload: Record<string, any>,
  ): { routedTo: BrainRegionTarget[]; routingReason: string } {
    const targets: Set<BrainRegionTarget> = new Set();
    let reason = '';

    switch (signalType) {
      case 'CONVERSATIONAL':
        targets.add('WERNICKE_BROCA');
        reason = 'Conversational input → language processing region';
        break;

      case 'VOICE_INPUT':
        targets.add('WERNICKE_BROCA');
        reason = 'Voice input → auditory processing → Wernicke/Broca';
        break;

      case 'INCIDENT_SIGNAL':
        targets.add('AMYGDALA');
        targets.add('GLOBAL_WORKSPACE');
        reason = 'Incident signal → amygdala urgency processing + immediate global workspace escalation';
        break;

      case 'COMPLIANCE_SIGNAL':
        targets.add('CEREBELLUM');
        reason = 'Compliance signal → regulatory compliance execution region';
        break;

      case 'FINANCIAL_SIGNAL':
        targets.add('PREFRONTAL_CORTEX');
        reason = 'Financial signal → prefrontal cortex with dual-AI gate flag';
        break;

      case 'SCHEDULE_SIGNAL':
        targets.add('CEREBELLUM');
        reason = 'Schedule signal → cerebellum scheduling execution region';
        break;

      case 'DOCUMENT_SIGNAL':
        targets.add('CEREBELLUM');
        reason = 'Document signal → document processing region (cerebellum)';
        break;

      case 'SENSOR_SIGNAL':
        targets.add('CEREBELLUM');
        // Sensor signals above urgency threshold also copy to amygdala
        if (priorityScore >= 70) {
          targets.add('AMYGDALA');
          reason = 'High-priority sensor signal → cerebellum + amygdala copy (urgency threshold exceeded)';
        } else {
          reason = 'Sensor signal → cerebellum (clock/GPS/lone worker processing)';
        }
        break;

      case 'PLATFORM_EVENT': {
        // Route based on event domain embedded in payload
        const eventType = (payload.type || payload.event || '').toLowerCase();
        if (eventType.includes('payroll') || eventType.includes('invoice') || eventType.includes('billing')) {
          targets.add('PREFRONTAL_CORTEX');
          reason = 'Platform financial event → prefrontal cortex';
        } else if (eventType.includes('schedule') || eventType.includes('shift')) {
          targets.add('CEREBELLUM');
          reason = 'Platform schedule event → cerebellum';
        } else if (eventType.includes('compliance') || eventType.includes('license')) {
          targets.add('CEREBELLUM');
          reason = 'Platform compliance event → regulatory region';
        } else if (eventType.includes('incident') || eventType.includes('panic')) {
          targets.add('AMYGDALA');
          targets.add('GLOBAL_WORKSPACE');
          reason = 'Platform emergency event → amygdala + global workspace escalation';
        } else {
          targets.add('WERNICKE_BROCA');
          reason = 'Generic platform event → language processing for awareness';
        }
        break;
      }

      case 'EXTERNAL_SIGNAL': {
        const src = (payload.source || payload.provider || '').toLowerCase();
        if (src.includes('stripe')) {
          targets.add('PREFRONTAL_CORTEX');
          reason = 'Stripe webhook → prefrontal cortex (financial gate)';
        } else if (src.includes('quickbooks')) {
          targets.add('PREFRONTAL_CORTEX');
          reason = 'QuickBooks webhook → prefrontal cortex (financial gate)';
        } else if (src.includes('resend') || src.includes('email')) {
          targets.add('WERNICKE_BROCA');
          reason = 'Inbound email → Wernicke/Broca language region';
        } else {
          targets.add('WERNICKE_BROCA');
          reason = 'External signal → language region (workspace_id verification required)';
        }
        break;
      }

      case 'SYSTEM_SIGNAL':
        targets.add('PROPRIOCEPTION');
        reason = 'System signal → proprioception health monitor';
        break;

      case 'SELF_SIGNAL':
        targets.add('SELF_AWARENESS');
        reason = 'Self signal → self-awareness self-model update pipeline';
        break;

      default:
        targets.add('WERNICKE_BROCA');
        reason = 'Unclassified signal → language region (default)';
    }

    // Any signal at 90+ bypasses to global workspace regardless of primary target
    if (priorityScore >= 90 && !targets.has('GLOBAL_WORKSPACE')) {
      targets.add('GLOBAL_WORKSPACE');
      reason += ' | CRITICAL: simultaneously routed to global workspace';
    }

    return { routedTo: Array.from(targets), routingReason: reason };
  }

  // ==========================================================================
  // DEDUPLICATION
  // ==========================================================================

  private checkDedup(hash: string, signalId: string, priorityScore: number): 'PROCESS' | 'DROP' | 'MERGE' {
    const now = Date.now();

    // Prune stale entries
    if (this.dedupCache.size > MAX_DEDUP_CACHE) {
      this.pruneDedupCache();
    }

    const existing = this.dedupCache.get(hash);
    if (existing) {
      const age = now - existing.arrivedAt;
      if (age <= NEAR_DEDUP_WINDOW_MS) {
        // Near-duplicate within 5s — merge (process once)
        existing.mergeCount++;
        return 'MERGE';
      } else if (age <= DEDUP_WINDOW_MS) {
        // Exact duplicate within 60s — drop (never drop CRITICAL)
        if (priorityScore >= 90) return 'PROCESS';
        return 'DROP';
      }
    }

    // New signal — register in cache
    this.dedupCache.set(hash, {
      signalId,
      hash,
      arrivedAt: now,
      mergeCount: 0,
    });

    return 'PROCESS';
  }

  private pruneDedupCache(): void {
    const cutoff = Date.now() - DEDUP_WINDOW_MS;
    for (const [key, entry] of this.dedupCache.entries()) {
      if (entry.arrivedAt < cutoff) {
        this.dedupCache.delete(key);
      }
    }
  }

  // ==========================================================================
  // HASHING
  // ==========================================================================

  private hashSignal(
    payload: Record<string, any>,
    signalType: string,
    workspaceId?: string,
    userId?: string,
  ): string {
    const keyFields = {
      signalType,
      workspaceId: workspaceId || '',
      userId: userId || '',
      message: payload.message || payload.content || payload.text || '',
      type: payload.type || payload.event || '',
    };
    return crypto.createHash('sha256').update(JSON.stringify(keyFields)).digest('hex').slice(0, 64);
  }

  // ==========================================================================
  // HIGH PRIORITY BROADCAST
  // ==========================================================================

  private broadcastHighPriority(signal: ThalamicSignal): void {
    try {
      broadcastToGlobalWorkspace('AMYGDALA', 'thalamic_high_priority_signal', {
        signalId: signal.signalId,
        signalType: signal.signalType,
        priorityScore: signal.priorityScore,
        workspaceId: signal.workspaceId,
        routedTo: signal.routedTo,
        arrivedAt: signal.arrivedAt.toISOString(),
        summary: `High-priority ${signal.signalType} signal (score: ${signal.priorityScore}) from ${signal.source}`,
      });
    } catch {
      // Non-fatal — thalamus must never crash the caller
    }
  }

  // ==========================================================================
  // OPERATION 4 — THALAMIC LOGGING
  // ==========================================================================

  private async logSignal(
    signal: ThalamicSignal,
    wasDropped: boolean,
    wasMerged: boolean,
  ): Promise<void> {
    try {
      await db.insert(thalamiclogs).values({
        signalId: signal.signalId,
        arrivedAt: signal.arrivedAt,
        signalType: signal.signalType,
        source: signal.source,
        sourceTrustTier: signal.sourceTrustTier,
        workspaceId: signal.workspaceId,
        userId: signal.userId,
        priorityScore: signal.priorityScore,
        routedTo: signal.routedTo,
        routingReason: signal.routingReason,
        processingStartedAt: new Date(),
        highPriorityCopySent: signal.highPriorityCopySent,
        rawSignalHash: signal.rawSignalHash,
        isDuplicate: wasDropped || wasMerged,
        wasMerged,
        wasDropped,
        dropReason: wasDropped ? 'duplicate_within_60s_window' : null,
        signalPayload: this.sanitizePayload(signal.payload),
      });
    } catch {
      // Thalamus logging is non-fatal — brain function must not depend on logging
    }
  }

  // Strip sensitive fields before persisting
  private sanitizePayload(payload: Record<string, any>): Record<string, any> {
    const SENSITIVE_KEYS = ['password', 'token', 'secret', 'ssn', 'creditCard', 'apiKey'];
    const clean: Record<string, any> = {};
    for (const [k, v] of Object.entries(payload)) {
      if (SENSITIVE_KEYS.some(s => k.toLowerCase().includes(s))) continue;
      clean[k] = typeof v === 'object' && v !== null ? '[object]' : v;
    }
    return clean;
  }

  // ==========================================================================
  // FLOOD DETECTION
  // ==========================================================================

  isFloodDetected(): boolean {
    return this.globalWorkspaceCount > RATE_LIMIT_PER_SECOND;
  }

  // ==========================================================================
  // CONVENIENCE WRAPPERS — one per signal entry point
  // These wrap existing handlers without replacing them.
  // ==========================================================================

  async processChat(
    message: string,
    userId: string,
    workspaceId: string,
    trustTier: TrustTier = 'officer',
  ): Promise<ThalamicSignal | null> {
    return this.process(
      { message, type: 'chat_message' },
      'chat',
      userId,
      workspaceId,
      trustTier,
    );
  }

  async processPlatformEvent(
    event: Record<string, any>,
    workspaceId?: string,
    userId?: string,
  ): Promise<ThalamicSignal | null> {
    return this.process(event, 'platform_event', userId, workspaceId, 'system');
  }

  async processWebhook(
    source: string,
    payload: Record<string, any>,
    workspaceId?: string,
  ): Promise<ThalamicSignal | null> {
    return this.process({ ...payload, source }, `webhook_${source}`, undefined, workspaceId, 'external');
  }

  async processIncident(
    incidentData: Record<string, any>,
    userId: string,
    workspaceId: string,
    trustTier: TrustTier = 'officer',
  ): Promise<ThalamicSignal | null> {
    return this.process({ ...incidentData, type: 'incident' }, 'reportbot', userId, workspaceId, trustTier);
  }

  async processSensorEvent(
    sensorType: string,
    data: Record<string, any>,
    userId?: string,
    workspaceId?: string,
  ): Promise<ThalamicSignal | null> {
    return this.process({ ...data, sensorType, type: sensorType }, `clockbot_${sensorType}`, userId, workspaceId, 'system');
  }

  async processSelfSignal(
    signalName: string,
    data: Record<string, any>,
    workspaceId?: string,
  ): Promise<ThalamicSignal | null> {
    return this.process({ ...data, type: signalName }, 'trinity_self', undefined, workspaceId, 'trinity_self');
  }

  async getDashboardStats(workspaceId: string): Promise<{
    todayTotal: number;
    last7DayTotal: number;
    bySignalType: Record<string, number>;
    byRegion: Record<string, number>;
    avgPriority: number;
    criticalCount: number;
    droppedDedupCount: number;
    recentSignals: { signalId: string; signalType: string; priority: number; routedTo: string; processedAt: Date }[];
  }> {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

    try {
      // CATEGORY C — Raw SQL retained: ORDER BY | Tables: thalamic_log | Verified: 2026-03-23
      const result = await typedPool(`
        SELECT
          signal_id, signal_type, priority_score, routed_to, arrived_at,
          is_duplicate, was_dropped
        FROM thalamic_log
        WHERE workspace_id = $1
          AND arrived_at >= $2
        ORDER BY arrived_at DESC
        LIMIT 500
      `, [workspaceId, sevenDaysAgo.toISOString()]);

      const allRows = (result as any[]) || [];
      const todayRows = allRows.filter(r => new Date(r.arrived_at) >= today);

      const bySignalType: Record<string, number> = {};
      const byRegion: Record<string, number> = {};
      let prioritySum = 0;
      let criticalCount = 0;
      let droppedDedupCount = 0;

      for (const row of allRows) {
        bySignalType[row.signal_type] = (bySignalType[row.signal_type] || 0) + 1;
        // routed_to is jsonb — may be array or object
        if (row.routed_to) {
          const rt = typeof row.routed_to === 'string' ? JSON.parse(row.routed_to) : row.routed_to;
          const regions: string[] = Array.isArray(rt) ? rt : typeof rt === 'object' ? Object.keys(rt) : [String(rt)];
          for (const region of regions) {
            byRegion[region] = (byRegion[region] || 0) + 1;
          }
        }
        prioritySum += row.priority_score || 0;
        if ((row.priority_score || 0) >= 90) criticalCount++;
        if (row.is_duplicate || row.was_dropped) droppedDedupCount++;
      }

      return {
        todayTotal: todayRows.length,
        last7DayTotal: allRows.length,
        bySignalType,
        byRegion,
        avgPriority: allRows.length > 0 ? Math.round(prioritySum / allRows.length) : 0,
        criticalCount,
        droppedDedupCount,
        recentSignals: allRows.slice(0, 20).map(r => ({
          signalId: r.signal_id,
          signalType: r.signal_type,
          priority: r.priority_score,
          routedTo: (() => {
            if (!r.routed_to) return '';
            const rt = typeof r.routed_to === 'string' ? JSON.parse(r.routed_to) : r.routed_to;
            return Array.isArray(rt) ? rt[0] : typeof rt === 'object' ? Object.keys(rt)[0] : String(rt);
          })(),
          processedAt: r.arrived_at,
        })),
      };
    } catch {
      return {
        todayTotal: 0,
        last7DayTotal: 0,
        bySignalType: {},
        byRegion: {},
        avgPriority: 0,
        criticalCount: 0,
        droppedDedupCount: 0,
        recentSignals: [],
      };
    }
  }
}

// ============================================================================
// SINGLETON EXPORT
// ============================================================================

export const trinityThalamus = new TrinityThalamusService();
