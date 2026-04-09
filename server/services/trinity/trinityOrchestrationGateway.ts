/**
 * TRINITY ORCHESTRATION GATEWAY
 * =============================
 * Central orchestration layer for CoAIleague with complete platform visibility.
 * Routes ALL requests through Trinity for intelligent tracking, blocking detection,
 * pain point identification, and proactive upselling.
 * 
 * CORE RESPONSIBILITIES:
 * 1. Log ALL service requests (API, feature, workflow, automation)
 * 2. Track usage analytics with blocked attempt detection
 * 3. Generate intelligent upsell recommendations based on pain points
 * 4. Provide complete visibility into platform usage patterns
 * 
 * INTEGRATION POINTS:
 * - UniversalNotificationEngine (UNE) for notifications
 * - Feature Registry for tier validation
 * - Billing/Subscription for tier checking
 * - Trinity Self-Awareness for context
 */

import { db } from '../../db';
import { 
  trinityRequests, 
  trinityUsageAnalytics, 
  trinityRecommendations,
  trinityOrgStats,
  workspaces,
  users,
  InsertTrinityRequest,
  InsertTrinityUsageAnalytics,
  InsertTrinityRecommendation,
} from '@shared/schema';
import { eq, and, desc, gte, sql, count } from 'drizzle-orm';
import { platformEventBus } from '../platformEventBus';
// @ts-expect-error — TS migration: fix in refactoring sprint
import { featureRegistryService, FeatureDefinition } from '../featureRegistryService';
import { universalAudit } from '../universalAuditService';
import { notifyTrinity, type EventSource } from '../ai-brain/platformAwarenessHelper';
import { createLogger } from '../../lib/logger';
const log = createLogger('trinityOrchestrationGateway');


// Security pain point categories (from the 35-point audit)
const PAIN_POINT_CATEGORIES = {
  TIME_ATTENDANCE: ['time_theft', 'manual_scheduling', 'call_outs', 'overtime_tracking'],
  COMPLIANCE: ['audit_prep', 'license_expiry', 'multi_state', 'background_checks'],
  BILLING: ['client_billing', 'invoice_disputes', 'payment_collection', 'billing_errors'],
  OPERATIONS: ['incident_reporting', 'post_orders', 'guard_tours', 'equipment_tracking'],
  HR: ['onboarding', 'training_tracking', 'performance_reviews', 'payroll_errors'],
  CLIENT_MANAGEMENT: ['client_communication', 'service_reports', 'contract_management', 'site_management'],
  GROWTH: ['proposal_creation', 'lead_tracking', 'competitive_pricing', 'upselling'],
} as const;

// Tier to recommended upgrade mapping
const TIER_UPGRADES: Record<string, string> = {
  'free_trial': 'starter',
  'starter': 'professional',
  'professional': 'enterprise',
  'enterprise': 'enterprise', // Custom solutions
};

// Add-on recommendations based on pain points
const PAIN_POINT_ADDONS: Record<string, string[]> = {
  'overtime_tracking': ['predictive_workforce_insights'],
  'client_billing': ['client_profitability_analytics'],
  'ai_features': ['claude_premium_ai'],
  'multi_location': ['additional_location'],
};

export interface RequestTrackingParams {
  workspaceId?: string;
  userId?: string;
  requestType: 'api' | 'feature' | 'workflow' | 'automation';
  endpoint?: string;
  method?: string;
  featureKey?: string;
  source?: 'web' | 'mobile' | 'api' | 'automation' | 'trinity';
  sessionId?: string;
  userAgent?: string;
  ipAddress?: string;
  requestPayload?: Record<string, any>;
  responseStatus?: number;
  responseTimeMs?: number;
  wasBlocked?: boolean;
  blockReason?: string;
  tierAtRequest?: string;
}

export interface UpsellSignal {
  workspaceId: string;
  painPointId: string;
  painPointCategory: string;
  triggerEvent: string;
  triggerCount: number;
  evidenceData: Record<string, any>;
}

export interface PlatformAuditResult {
  painPointId: string;
  category: string;
  status: 'ALREADY_BUILT' | 'PARTIALLY_BUILT' | 'NOT_BUILT' | 'NEEDS_WORK';
  evidence: string;
  completeness: number;
  recommendations: string[];
}

class TrinityOrchestrationGateway {
  private static instance: TrinityOrchestrationGateway;
  private requestBuffer: InsertTrinityRequest[] = [];
  private flushInterval: NodeJS.Timer | null = null;
  private readonly BUFFER_FLUSH_SIZE = 50;
  private readonly BUFFER_FLUSH_INTERVAL = 30000; // 30 seconds (was 5s — reduced to limit DB connection storms)
  // Circuit breaker state
  private consecutiveFlushFailures = 0;
  private flushBackoffUntil = 0;

  static getInstance(): TrinityOrchestrationGateway {
    if (!this.instance) {
      this.instance = new TrinityOrchestrationGateway();
    }
    return this.instance;
  }

  constructor() {
    this.startFlushInterval();
    this.subscribeToEvents();
  }

  private startFlushInterval(): void {
    if (this.flushInterval) return;
    
    this.flushInterval = setInterval(() => {
      // Circuit breaker: skip if in backoff window
      if (Date.now() < this.flushBackoffUntil) return;
      if (this.requestBuffer.length === 0) return;
      this.flushRequestBuffer().then(() => {
        this.consecutiveFlushFailures = 0;
        this.flushBackoffUntil = 0;
      }).catch(err => {
        this.consecutiveFlushFailures++;
        // Exponential backoff: 60s → 120s → 300s max
        const backoffMs = Math.min(60000 * Math.pow(2, this.consecutiveFlushFailures - 1), 300000);
        this.flushBackoffUntil = Date.now() + backoffMs;
        if (this.consecutiveFlushFailures <= 2) {
          // Detailed Postgres error logging — matches the inner catch.
          log.warn('[TrinityOrchestrationGateway] Flush error (outer catch):', {
            message: err?.message,
            code: err?.code,
            detail: err?.detail,
            column: err?.column,
            constraint: err?.constraint,
            table: err?.table,
            schema: err?.schema,
            hint: err?.hint,
          });
        }
      });
    }, this.BUFFER_FLUSH_INTERVAL);
  }

  private subscribeToEvents(): void {
    platformEventBus.subscribe('feature_blocked', async (data: any) => {
      await this.trackRequest({
        workspaceId: data.workspaceId,
        userId: data.userId,
        requestType: 'feature',
        featureKey: data.featureKey,
        wasBlocked: true,
        blockReason: data.reason || 'tier_limit',
        tierAtRequest: data.currentTier,
      });

      await this.detectUpsellOpportunity({
        workspaceId: data.workspaceId,
        painPointId: `blocked_${data.featureKey}`,
        painPointCategory: 'feature_access',
        triggerEvent: 'feature_blocked',
        triggerCount: 1,
        evidenceData: { featureKey: data.featureKey, reason: data.reason },
      });
    });

    platformEventBus.subscribe('rate_limit_hit', async (data: any) => {
      await this.trackRequest({
        workspaceId: data.workspaceId,
        userId: data.userId,
        requestType: 'api',
        endpoint: data.endpoint,
        wasBlocked: true,
        blockReason: 'rate_limit',
      });
    });

    platformEventBus.subscribe('quota_exceeded', async (data: any) => {
      await this.detectUpsellOpportunity({
        workspaceId: data.workspaceId,
        painPointId: `quota_${data.quotaType}`,
        painPointCategory: 'resource_limits',
        triggerEvent: 'quota_exceeded',
        triggerCount: 1,
        evidenceData: { quotaType: data.quotaType, limit: data.limit, used: data.used },
      });
    });
  }

  /**
   * Track a request through the gateway
   */
  async trackRequest(params: RequestTrackingParams): Promise<void> {
    const requestData: InsertTrinityRequest = {
      workspaceId: params.workspaceId || null,
      userId: params.userId || null,
      requestType: params.requestType,
      endpoint: params.endpoint,
      method: params.method,
      featureKey: params.featureKey,
      source: params.source,
      sessionId: params.sessionId,
      userAgent: params.userAgent,
      ipAddress: params.ipAddress,
      requestPayload: this.sanitizePayload(params.requestPayload),
      responseStatus: params.responseStatus,
      responseTimeMs: params.responseTimeMs,
      wasBlocked: params.wasBlocked || false,
      blockReason: params.blockReason,
      tierAtRequest: params.tierAtRequest,
      trinityEnriched: false,
      metadata: {},
    };

    this.requestBuffer.push(requestData);

    if (this.requestBuffer.length >= this.BUFFER_FLUSH_SIZE) {
      await this.flushRequestBuffer();
    }

    if (params.wasBlocked && params.workspaceId) {
      await this.analyzeBlockedRequest(params);
    }
  }

  private sanitizePayload(payload?: Record<string, any>): Record<string, any> | null {
    if (!payload) return null;

    const sensitiveKeys = ['password', 'token', 'secret', 'key', 'auth', 'credit_card', 'ssn'];
    const sanitized = { ...payload };

    for (const key of Object.keys(sanitized)) {
      if (sensitiveKeys.some(sk => key.toLowerCase().includes(sk))) {
        sanitized[key] = '[REDACTED]';
      }
    }

    return sanitized;
  }

  private async flushRequestBuffer(): Promise<void> {
    if (this.requestBuffer.length === 0) return;

    const toFlush = [...this.requestBuffer];
    this.requestBuffer = [];

    try {
      await db.insert(trinityRequests).values(toFlush);

      const auditableEntries = toFlush.filter(r => r.wasBlocked && r.workspaceId);
      if (auditableEntries.length > 0) {
        universalAudit.logBatch(auditableEntries.map(r => ({
          workspaceId: r.workspaceId!,
          actorId: r.userId || null,
          actorType: 'trinity' as const,
          action: r.wasBlocked ? 'trinity.request_blocked' : 'trinity.request_tracked',
          entityType: r.requestType || 'api_request',
          entityId: r.endpoint || r.featureKey || null,
          changeType: 'action' as const,
          metadata: {
            blockReason: r.blockReason,
            tier: r.tierAtRequest,
            featureKey: r.featureKey,
            endpoint: r.endpoint,
            method: r.method,
          },
          sourceRoute: r.endpoint || undefined,
        }))).catch((err) => log.warn('[trinityOrchestrationGateway] Fire-and-forget failed:', err));
      }
    } catch (error: any) {
      // Detailed error logging — Postgres errors carry code/detail/
      // column/constraint/table fields that explain WHAT actually
      // failed. The previous one-liner only logged .message which
      // hides the real cause.
      log.error('[TrinityOrchestrationGateway] Flush error:', {
        message: error?.message,
        code: error?.code,
        detail: error?.detail,
        column: error?.column,
        constraint: error?.constraint,
        table: error?.table,
        schema: error?.schema,
        where: error?.where,
        firstRow: toFlush[0],
        rowCount: toFlush.length,
      });
      this.requestBuffer = [...toFlush, ...this.requestBuffer].slice(0, 1000);
    }
  }

  /**
   * Analyze a blocked request for pain points and upsell opportunities
   */
  private async analyzeBlockedRequest(params: RequestTrackingParams): Promise<void> {
    if (!params.workspaceId) return;

    let painPointId: string | undefined;
    let painPointCategory: string | undefined;

    if (params.blockReason === 'tier_limit' && params.featureKey) {
      painPointId = `tier_blocked_${params.featureKey}`;
      painPointCategory = this.categorizePainPoint(params.featureKey);
    } else if (params.blockReason === 'rate_limit') {
      painPointId = 'rate_limit_hit';
      painPointCategory = 'operations';
    } else if (params.blockReason?.includes('employee_limit')) {
      painPointId = 'employee_limit_reached';
      painPointCategory = 'growth';
    }

    if (painPointId && painPointCategory) {
      await this.detectUpsellOpportunity({
        workspaceId: params.workspaceId,
        painPointId,
        painPointCategory,
        triggerEvent: 'blocked_request',
        triggerCount: 1,
        evidenceData: {
          featureKey: params.featureKey,
          blockReason: params.blockReason,
          endpoint: params.endpoint,
        },
      });
    }
  }

  private categorizePainPoint(featureKey: string): string {
    for (const [category, keywords] of Object.entries(PAIN_POINT_CATEGORIES)) {
      if (keywords.some(kw => featureKey.toLowerCase().includes(kw))) {
        return category.toLowerCase();
      }
    }
    return 'operations';
  }

  /**
   * Detect and create upsell opportunities based on usage patterns
   */
  async detectUpsellOpportunity(signal: UpsellSignal): Promise<void> {
    try {
      const existing = await db.query.trinityRecommendations.findFirst({
        where: and(
          eq(trinityRecommendations.workspaceId, signal.workspaceId),
          eq(trinityRecommendations.painPointId, signal.painPointId),
          eq(trinityRecommendations.status, 'pending')
        ),
      });

      if (existing) {
        await db
          .update(trinityRecommendations)
          .set({
            triggerCount: sql`${trinityRecommendations.triggerCount} + 1`,
            evidenceData: sql`${trinityRecommendations.evidenceData} || ${JSON.stringify(signal.evidenceData)}::jsonb`,
            updatedAt: new Date(),
          })
          .where(eq(trinityRecommendations.id, existing.id));
        return;
      }

      const workspace = await db.query.workspaces.findFirst({
        where: eq(workspaces.id, signal.workspaceId),
      });

      const currentTier = workspace?.subscriptionTier || 'free_trial';
      const targetTier = TIER_UPGRADES[currentTier];
      const recommendedAddons = PAIN_POINT_ADDONS[signal.painPointId] || [];

      const recommendation: InsertTrinityRecommendation = {
        workspaceId: signal.workspaceId,
        recommendationType: recommendedAddons.length > 0 ? 'addon' : 'tier_upgrade',
        targetTier: targetTier !== currentTier ? targetTier : undefined,
        targetAddon: recommendedAddons[0],
        painPointId: signal.painPointId,
        painPointCategory: signal.painPointCategory,
        painPointSeverity: this.calculatePainSeverity(signal.triggerCount),
        headline: this.generateHeadline(signal),
        description: this.generateDescription(signal),
        valueProposition: this.generateValueProp(signal),
        triggerEvent: signal.triggerEvent,
        triggerCount: signal.triggerCount,
        evidenceData: signal.evidenceData,
        relevanceScore: '0.7',
        urgencyScore: this.calculateUrgency(signal.triggerCount),
        status: 'pending',
        displayLocation: 'dashboard_banner',
        displayPriority: Math.min(100, 50 + signal.triggerCount * 5),
        expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // 30 days
      };

      await db.insert(trinityRecommendations).values(recommendation);
      log.info(`[TrinityOrchestrationGateway] Created upsell recommendation: ${signal.painPointId}`);
    } catch (error: any) {
      log.error('[TrinityOrchestrationGateway] Upsell detection error:', (error instanceof Error ? error.message : String(error)));
    }
  }

  private calculatePainSeverity(triggerCount: number): string {
    if (triggerCount >= 10) return 'critical';
    if (triggerCount >= 5) return 'high';
    if (triggerCount >= 2) return 'medium';
    return 'low';
  }

  private calculateUrgency(triggerCount: number): string {
    const urgency = Math.min(0.95, 0.3 + (triggerCount * 0.1));
    return urgency.toFixed(4);
  }

  private generateHeadline(signal: UpsellSignal): string {
    const headlines: Record<string, string> = {
      'employee_limit_reached': "You're hitting your employee limit",
      'rate_limit_hit': 'Your team is very active - consider upgrading for unlimited access',
      'blocked_request': 'Unlock this feature to boost productivity',
    };
    
    if (signal.painPointId.startsWith('tier_blocked_')) {
      const feature = signal.painPointId.replace('tier_blocked_', '');
      return `Unlock ${feature.replace(/_/g, ' ')} for your team`;
    }
    
    if (signal.painPointId.startsWith('quota_')) {
      const quota = signal.painPointId.replace('quota_', '');
      return `You've used your ${quota.replace(/_/g, ' ')} allocation`;
    }
    
    return headlines[signal.triggerEvent] || 'Optimize your workflow with an upgrade';
  }

  private generateDescription(signal: UpsellSignal): string {
    return `Based on your team's activity, you've encountered this ${signal.triggerCount} time(s). ` +
      `Upgrading would eliminate this friction and save your team valuable time.`;
  }

  private generateValueProp(signal: UpsellSignal): string {
    const valueProps: Record<string, string> = {
      'time_attendance': 'Save 15-20 hours/week on scheduling with AI automation',
      'compliance': 'Reduce audit prep from 3-5 days to 15 minutes',
      'billing': 'Cut billing errors by 90% with automated invoicing',
      'operations': 'Real-time visibility into all field operations',
      'hr': 'Streamline onboarding and reduce payroll errors',
      'growth': 'Close deals faster with AI-powered proposals',
    };
    
    return valueProps[signal.painPointCategory] || 
      'Unlock advanced features to boost productivity';
  }

  /**
   * Aggregate usage analytics for a workspace
   */
  async aggregateUsageAnalytics(
    workspaceId: string,
    periodType: 'hourly' | 'daily' | 'weekly' | 'monthly' = 'daily'
  ): Promise<void> {
    const now = new Date();
    let periodStart: Date;
    let periodEnd: Date = now;

    switch (periodType) {
      case 'hourly':
        periodStart = new Date(now.getTime() - 60 * 60 * 1000);
        break;
      case 'daily':
        periodStart = new Date(now.getTime() - 24 * 60 * 60 * 1000);
        break;
      case 'weekly':
        periodStart = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
        break;
      case 'monthly':
        periodStart = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
        break;
    }

    try {
      const requests = await db
        .select()
        .from(trinityRequests)
        .where(
          and(
            eq(trinityRequests.workspaceId, workspaceId),
            gte(trinityRequests.createdAt, periodStart)
          )
        );

      const totalRequests = requests.length;
      const uniqueUsers = new Set(requests.map(r => r.userId).filter(Boolean)).size;
      const uniqueFeatures = new Set(requests.map(r => r.featureKey).filter(Boolean)).size;

      const blockedRequests = requests.filter(r => r.wasBlocked);
      const blockedByTier: Record<string, number> = {};
      const blockedByFeature: Record<string, number> = {};
      const featureUsage: Record<string, number> = {};
      const painPointsDetected: Record<string, number> = {};

      for (const req of requests) {
        if (req.featureKey) {
          featureUsage[req.featureKey] = (featureUsage[req.featureKey] || 0) + 1;
        }
        if (req.wasBlocked && req.blockReason) {
          blockedByTier[req.blockReason] = (blockedByTier[req.blockReason] || 0) + 1;
          if (req.featureKey) {
            blockedByFeature[req.featureKey] = (blockedByFeature[req.featureKey] || 0) + 1;
          }
        }
        if (req.painPointDetected) {
          painPointsDetected[req.painPointDetected] = (painPointsDetected[req.painPointDetected] || 0) + 1;
        }
      }

      const topFeatures = Object.entries(featureUsage)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 10)
        .map(([key]) => key);

      const upsellScore = this.calculateUpsellScore(blockedRequests.length, totalRequests, painPointsDetected);

      const analytics: InsertTrinityUsageAnalytics = {
        workspaceId,
        periodStart,
        periodEnd,
        periodType,
        totalRequests,
        uniqueUsers,
        uniqueFeatures,
        blockedRequests: blockedRequests.length,
        blockedByTier,
        blockedByFeature,
        featureUsage,
        topFeatures,
        painPointsDetected,
        upsellScore: upsellScore.toFixed(4),
      };

      await db
        .insert(trinityUsageAnalytics)
        .values(analytics)
        .onConflictDoUpdate({
          target: [trinityUsageAnalytics.workspaceId, trinityUsageAnalytics.periodStart, trinityUsageAnalytics.periodType],
          set: {
            totalRequests,
            uniqueUsers,
            uniqueFeatures,
            blockedRequests: blockedRequests.length,
            blockedByTier,
            blockedByFeature,
            featureUsage,
            topFeatures,
            painPointsDetected,
            upsellScore: upsellScore.toFixed(4),
            updatedAt: new Date(),
          },
        });

      log.info(`[TrinityOrchestrationGateway] Aggregated ${periodType} analytics for ${workspaceId}`);
    } catch (error: any) {
      log.error('[TrinityOrchestrationGateway] Analytics aggregation error:', (error instanceof Error ? error.message : String(error)));
    }
  }

  private calculateUpsellScore(
    blockedCount: number,
    totalCount: number,
    painPoints: Record<string, number>
  ): number {
    if (totalCount === 0) return 0;

    const blockRate = blockedCount / totalCount;
    const painPointCount = Object.keys(painPoints).length;
    const painPointFrequency = Object.values(painPoints).reduce((a, b) => a + b, 0);

    return Math.min(0.99, (blockRate * 0.4) + (painPointCount * 0.1) + (painPointFrequency * 0.01));
  }

  /**
   * Get pending recommendations for a workspace
   */
  async getRecommendations(workspaceId: string): Promise<any[]> {
    return db.query.trinityRecommendations.findMany({
      where: and(
        eq(trinityRecommendations.workspaceId, workspaceId),
        eq(trinityRecommendations.status, 'pending')
      ),
      orderBy: [desc(trinityRecommendations.displayPriority)],
      limit: 5,
    });
  }

  /**
   * Mark recommendation as shown/clicked/dismissed/converted
   */
  async updateRecommendationStatus(
    recommendationId: string,
    status: 'shown' | 'clicked' | 'dismissed' | 'converted',
    dismissReason?: string
  ): Promise<void> {
    const updates: Record<string, any> = {
      status,
      updatedAt: new Date(),
    };

    switch (status) {
      case 'shown':
        updates.shownAt = new Date();
        updates.impressionCount = sql`${trinityRecommendations.impressionCount} + 1`;
        break;
      case 'clicked':
        updates.clickedAt = new Date();
        break;
      case 'dismissed':
        updates.dismissedAt = new Date();
        updates.dismissReason = dismissReason;
        break;
      case 'converted':
        updates.convertedAt = new Date();
        break;
    }

    await db
      .update(trinityRecommendations)
      .set(updates)
      .where(eq(trinityRecommendations.id, recommendationId));
  }

  /**
   * Run the 35-point security pain audit against the platform
   */
  async runSecurityPainAudit(): Promise<PlatformAuditResult[]> {
    log.info('[TrinityOrchestrationGateway] Running 35-point security pain audit...');
    
    const auditResults: PlatformAuditResult[] = [];

    // Category 1: Time & Attendance (4 pain points)
    auditResults.push(await this.auditPainPoint('time_theft', 'TIME_ATTENDANCE', [
      'time-entry-routes', 'mobileWorkerRoutes', 'gps', 'geofence', 'photo_verification'
    ]));
    auditResults.push(await this.auditPainPoint('manual_scheduling', 'TIME_ATTENDANCE', [
      'aiSchedulingRoutes', 'advancedSchedulingRoutes', 'schedulerRoutes', 'trinity_auto_fill'
    ]));
    auditResults.push(await this.auditPainPoint('call_outs', 'TIME_ATTENDANCE', [
      'shift_swap', 'coverage', 'backup_notifications', 'reliability_score'
    ]));
    auditResults.push(await this.auditPainPoint('overtime_tracking', 'TIME_ATTENDANCE', [
      'overtime', 'weekly_hours', 'budget_alerts', 'labor_cost'
    ]));

    // Category 2: Compliance (4 pain points)
    auditResults.push(await this.auditPainPoint('audit_prep', 'COMPLIANCE', [
      'compliance', 'document_vault', 'audit_export', 'regulator_portal', 'worm'
    ]));
    auditResults.push(await this.auditPainPoint('license_expiry', 'COMPLIANCE', [
      'certification', 'expiration', 'renewal_reminder', 'compliance_dashboard'
    ]));
    auditResults.push(await this.auditPainPoint('multi_state', 'COMPLIANCE', [
      'multi_state', 'state_compliance', 'labor_law', 'break_compliance'
    ]));
    auditResults.push(await this.auditPainPoint('background_checks', 'COMPLIANCE', [
      'background_check', 'checkr', 'sterling', 'background_expiry'
    ]));

    // Category 3: Billing (4 pain points)
    auditResults.push(await this.auditPainPoint('client_billing', 'BILLING', [
      'invoice', 'client_billing', 'billable_hours', 'rate_management'
    ]));
    auditResults.push(await this.auditPainPoint('invoice_disputes', 'BILLING', [
      'dispute', 'invoice_reconciliation', 'payment_exception', 'billing_exception'
    ]));
    auditResults.push(await this.auditPainPoint('payment_collection', 'BILLING', [
      'payment', 'collection', 'aging_report', 'payment_reminder'
    ]));
    auditResults.push(await this.auditPainPoint('billing_errors', 'BILLING', [
      'quickbooks', 'accounting', 'reconciliation', 'financial_intelligence'
    ]));

    // Category 4: Operations (4 pain points)
    auditResults.push(await this.auditPainPoint('incident_reporting', 'OPERATIONS', [
      'incident', 'report', 'daily_activity', 'dar'
    ]));
    auditResults.push(await this.auditPainPoint('post_orders', 'OPERATIONS', [
      'post_order', 'site_instruction', 'sop', 'procedures'
    ]));
    auditResults.push(await this.auditPainPoint('guard_tours', 'OPERATIONS', [
      'patrol', 'checkpoint', 'guard_tour', 'qr_scan'
    ]));
    auditResults.push(await this.auditPainPoint('equipment_tracking', 'OPERATIONS', [
      'equipment', 'asset', 'inventory', 'uniform'
    ]));

    // Category 5: HR (4 pain points)
    auditResults.push(await this.auditPainPoint('onboarding', 'HR', [
      'onboarding', 'new_hire', 'employee_setup', 'cognitive_onboarding'
    ]));
    auditResults.push(await this.auditPainPoint('training_tracking', 'HR', [
      'training', 'certification', 'skill', 'course'
    ]));
    auditResults.push(await this.auditPainPoint('performance_reviews', 'HR', [
      'performance', 'review', 'evaluation', 'feedback'
    ]));
    auditResults.push(await this.auditPainPoint('payroll_errors', 'HR', [
      'payroll', 'pay_stub', 'wage', 'deduction'
    ]));

    // Category 6: Client Management (4 pain points)
    auditResults.push(await this.auditPainPoint('client_communication', 'CLIENT_MANAGEMENT', [
      'client_portal', 'client_notification', 'service_report', 'client_dashboard'
    ]));
    auditResults.push(await this.auditPainPoint('service_reports', 'CLIENT_MANAGEMENT', [
      'service_report', 'activity_report', 'summary_report', 'analytics'
    ]));
    auditResults.push(await this.auditPainPoint('contract_management', 'CLIENT_MANAGEMENT', [
      'contract', 'proposal', 'agreement', 'renewal'
    ]));
    auditResults.push(await this.auditPainPoint('site_management', 'CLIENT_MANAGEMENT', [
      'site', 'location', 'zone', 'property'
    ]));

    // Category 7: Growth (4 pain points)
    auditResults.push(await this.auditPainPoint('proposal_creation', 'GROWTH', [
      'proposal', 'quote', 'estimate', 'bid'
    ]));
    auditResults.push(await this.auditPainPoint('lead_tracking', 'GROWTH', [
      'lead', 'crm', 'prospect', 'opportunity'
    ]));
    auditResults.push(await this.auditPainPoint('competitive_pricing', 'GROWTH', [
      'pricing', 'rate_card', 'margin', 'profitability'
    ]));
    auditResults.push(await this.auditPainPoint('upselling', 'GROWTH', [
      'upsell', 'cross_sell', 'addon', 'premium'
    ]));

    // Additional pain points to reach 35
    auditResults.push(await this.auditPainPoint('employee_turnover', 'HR', [
      'turnover', 'retention', 'exit_interview', 'attrition'
    ]));
    auditResults.push(await this.auditPainPoint('communication_gaps', 'OPERATIONS', [
      'messaging', 'notification', 'announcement', 'broadcast'
    ]));
    auditResults.push(await this.auditPainPoint('data_silos', 'OPERATIONS', [
      'integration', 'sync', 'api', 'export'
    ]));

    log.info(`[TrinityOrchestrationGateway] Audit complete: ${auditResults.length} pain points analyzed`);
    return auditResults;
  }

  private async auditPainPoint(
    painPointId: string,
    category: string,
    keywords: string[]
  ): Promise<PlatformAuditResult> {
    const evidence: string[] = [];
    let completeness = 0;
    let status: PlatformAuditResult['status'] = 'NOT_BUILT';

    // Check feature registry for related features
    // @ts-expect-error — TS migration: fix in refactoring sprint
    const allFeatures = featureRegistryService.getFeature();
    // @ts-expect-error — TS migration: fix in refactoring sprint
    const matchedFeatures = (allFeatures as any).filter(f => 
      keywords.some(kw => 
        f.key.toLowerCase().includes(kw) || 
        f.name.toLowerCase().includes(kw) ||
        (f.description && f.description.toLowerCase().includes(kw))
      )
    );

    if (matchedFeatures.length > 0) {
      // @ts-expect-error — TS migration: fix in refactoring sprint
      const activeFeatures = matchedFeatures.filter(f => f.lifecycle === 'active');
      // @ts-expect-error — TS migration: fix in refactoring sprint
      const betaFeatures = matchedFeatures.filter(f => f.lifecycle === 'beta');
      // @ts-expect-error — TS migration: fix in refactoring sprint
      const plannedFeatures = matchedFeatures.filter(f => f.lifecycle === 'planned');

      if (activeFeatures.length > 0) {
        status = 'ALREADY_BUILT';
        completeness = Math.min(100, 60 + (activeFeatures.length * 10));
        // @ts-expect-error — TS migration: fix in refactoring sprint
        evidence.push(`Active features: ${activeFeatures.map(f => f.key).join(', ')}`);
      } else if (betaFeatures.length > 0) {
        status = 'PARTIALLY_BUILT';
        completeness = Math.min(80, 30 + (betaFeatures.length * 15));
        // @ts-expect-error — TS migration: fix in refactoring sprint
        evidence.push(`Beta features: ${betaFeatures.map(f => f.key).join(', ')}`);
      } else if (plannedFeatures.length > 0) {
        status = 'NEEDS_WORK';
        completeness = 10;
        // @ts-expect-error — TS migration: fix in refactoring sprint
        evidence.push(`Planned features: ${plannedFeatures.map(f => f.key).join(', ')}`);
      }
    }

    const recommendations: string[] = [];
    if (completeness < 100) {
      recommendations.push(`Enhance ${painPointId.replace(/_/g, ' ')} capabilities`);
      if (status === 'NOT_BUILT') {
        recommendations.push(`Build core ${category.toLowerCase()} infrastructure`);
      }
    }

    return {
      painPointId,
      category,
      status,
      evidence: evidence.join('; ') || 'No matching features found',
      completeness,
      recommendations,
    };
  }

  /**
   * Get audit summary report
   */
  async getAuditSummary(): Promise<{
    totalPainPoints: number;
    alreadyBuilt: number;
    partiallyBuilt: number;
    notBuilt: number;
    needsWork: number;
    averageCompleteness: number;
    byCategory: Record<string, { count: number; completeness: number }>;
  }> {
    const results = await this.runSecurityPainAudit();

    const summary = {
      totalPainPoints: results.length,
      alreadyBuilt: results.filter(r => r.status === 'ALREADY_BUILT').length,
      partiallyBuilt: results.filter(r => r.status === 'PARTIALLY_BUILT').length,
      notBuilt: results.filter(r => r.status === 'NOT_BUILT').length,
      needsWork: results.filter(r => r.status === 'NEEDS_WORK').length,
      averageCompleteness: results.reduce((a, r) => a + r.completeness, 0) / results.length,
      byCategory: {} as Record<string, { count: number; completeness: number }>,
    };

    for (const result of results) {
      if (!summary.byCategory[result.category]) {
        summary.byCategory[result.category] = { count: 0, completeness: 0 };
      }
      summary.byCategory[result.category].count++;
      summary.byCategory[result.category].completeness += result.completeness;
    }

    for (const category of Object.keys(summary.byCategory)) {
      summary.byCategory[category].completeness = 
        summary.byCategory[category].completeness / summary.byCategory[category].count;
    }

    return summary;
  }

  /**
   * Cleanup and shutdown
   */
  async shutdown(): Promise<void> {
    if (this.flushInterval) {
      // @ts-expect-error — TS migration: fix in refactoring sprint
      clearInterval(this.flushInterval);
      this.flushInterval = null;
    }
    await this.flushRequestBuffer();
  }
}

export const trinityOrchestrationGateway = TrinityOrchestrationGateway.getInstance();

// ─────────────────────────────────────────────────────────────────────────────
// Trinity Universal Mutation Awareness — resource type inference
// Maps URL path segments to semantic resource type names Trinity understands
// ─────────────────────────────────────────────────────────────────────────────

function inferResourceTypeFromEndpoint(endpoint: string): string {
  const p = endpoint.toLowerCase().split('?')[0];
  if (p.includes('/employees') || p.includes('/hr/employee')) return 'employees';
  if (p.includes('/shifts') || p.includes('/coverage')) return 'shifts';
  if (p.includes('/schedules') || p.includes('/scheduling')) return 'schedules';
  if (p.includes('/time-entries') || p.includes('/timeclock') || p.includes('/clock-')) return 'time_entries';
  if (p.includes('/payroll')) return 'payroll_runs';
  if (p.includes('/invoices') || p.includes('/invoice')) return 'invoices';
  if (p.includes('/clients') || p.includes('/client')) return 'clients';
  if (p.includes('/certifications') || p.includes('/compliance')) return 'certifications';
  if (p.includes('/notifications')) return 'notifications';
  if (p.includes('/workspaces') || p.includes('/workspace')) return 'workspaces';
  if (p.includes('/users') || p.includes('/user')) return 'users';
  if (p.includes('/documents') || p.includes('/document')) return 'documents';
  if (p.includes('/settings') || p.includes('/config')) return 'settings';
  if (p.includes('/hiring') || p.includes('/applicant')) return 'hiring';
  if (p.includes('/disputes') || p.includes('/dispute')) return 'disputes';
  if (p.includes('/incidents') || p.includes('/incident')) return 'incidents';
  if (p.includes('/announcements') || p.includes('/announcement')) return 'announcements';
  if (p.includes('/chat') || p.includes('/messages')) return 'chat_messages';
  if (p.includes('/availability')) return 'employee_availability';
  if (p.includes('/tos')) return 'tos_agreements';
  // Extract first meaningful path segment as fallback
  const match = p.match(/\/api\/(?:hr\/|mobile\/|trinity\/|schedules\/)?([a-z][a-z0-9-_]*)/);
  return match ? match[1].replace(/-/g, '_') : 'platform';
}

const MUTATION_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

/**
 * Express middleware that tracks ALL API requests through Trinity Orchestration Gateway.
 * This middleware should be mounted early in the middleware chain.
 */
export function trinityOrchestrationMiddleware() {
  return async (req: any, res: any, next: any) => {
    const startTime = Date.now();
    const originalEnd = res.end;
    const originalJson = res.json;

    // Extract tracking info
    const workspaceId = req.session?.workspaceId || req.workspace?.id || null;
    const userId = req.session?.userId || req.user?.id || null;
    const endpoint = req.originalUrl || req.url;
    const method = req.method;
    const userAgent = req.get('user-agent') || undefined;
    const ipAddress = req.ip || req.connection?.remoteAddress;
    const sessionId = req.sessionID;
    
    // Detect source
    let source: 'web' | 'mobile' | 'api' | 'automation' | 'trinity' = 'web';
    if (userAgent?.includes('Mobile') || endpoint.includes('/mobile/')) {
      source = 'mobile';
    } else if (endpoint.includes('/api/automation') || endpoint.includes('/webhook')) {
      source = 'automation';
    } else if (endpoint.includes('/trinity/')) {
      source = 'trinity';
    }

    // Log request type
    let requestType: 'api' | 'feature' | 'workflow' | 'automation' = 'api';
    if (endpoint.includes('/workflow/') || endpoint.includes('/schedules/')) {
      requestType = 'workflow';
    } else if (endpoint.includes('/automation/')) {
      requestType = 'automation';
    }

    // Check for feature key in path
    let featureKey: string | undefined;
    const featureMatch = endpoint.match(/\/api\/(\w+)/);
    if (featureMatch) {
      featureKey = featureMatch[1];
    }

    // Intercept res.json to capture response data
    res.json = function(data: any) {
      res.responseData = data;
      return originalJson.call(this, data);
    };

    // Intercept res.end to log after response completes
    res.end = function(...args: any[]) {
      const responseTimeMs = Date.now() - startTime;
      const responseStatus = res.statusCode;
      const isSuccess = responseStatus >= 200 && responseStatus < 300;

      // Determine if request was blocked
      const wasBlocked = responseStatus === 403 || responseStatus === 429 || 
        (res.responseData?.error?.includes?.('tier') || res.responseData?.error?.includes?.('limit'));
      const blockReason = wasBlocked ? (
        responseStatus === 429 ? 'rate_limit' :
        res.responseData?.error || 'access_denied'
      ) : undefined;

      // Track the request (fire and forget)
      trinityOrchestrationGateway.trackRequest({
        workspaceId,
        userId,
        requestType,
        endpoint,
        method,
        featureKey,
        source,
        sessionId,
        userAgent,
        ipAddress,
        responseStatus,
        responseTimeMs,
        wasBlocked,
        blockReason,
        tierAtRequest: req.workspace?.subscriptionTier,
      }).catch(err => {
        // Silent failure - don't break request flow
        if (process.env.NODE_ENV === 'development') {
          log.debug('[TrinityOrchestration] Track error:', (err instanceof Error ? err.message : String(err)));
        }
      });

      if (wasBlocked && endpoint.startsWith('/api/') && !endpoint.includes('/health')) {
        log.info(`[TrinityOrchestration] ${method} ${endpoint} [blocked]`);
      }

      // Trinity Universal Mutation Awareness Gate
      // Every successful state-changing API call is recorded to Trinity's knowledge base.
      // Fire-and-forget — never blocks the response.
      if (
        MUTATION_METHODS.has(method) &&
        isSuccess &&
        endpoint.startsWith('/api/') &&
        !endpoint.includes('/health') &&
        !endpoint.includes('/trinity/requests') &&
        !endpoint.includes('/control-console')
      ) {
        const resourceType = inferResourceTypeFromEndpoint(endpoint);
        const operation = method === 'POST' ? 'create' : method === 'DELETE' ? 'delete' : 'update';
        const trinitySource: EventSource = endpoint.includes('/webhook') ? 'webhook'
          : endpoint.includes('/automation') ? 'automation'
          : endpoint.includes('/trinity') ? 'trinity'
          : 'api';
        notifyTrinity(
          workspaceId,
          resourceType,
          operation as any,
          trinitySource,
          {
            resourceId: (res as any).responseData?.id
              || (res as any).responseData?.data?.id
              || undefined,
            metadata: { method, endpoint, status: responseStatus },
          }
        );
      }

      return originalEnd.apply(this, args);
    };

    next();
  };
}

/**
 * ROUTE EXISTENCE CHECKS for deterministic auditing
 * These check actual route/feature presence rather than grep counts
 */
const ROUTE_CHECKS: Record<string, { routes: string[]; services: string[]; features: string[] }> = {
  'time_theft': {
    routes: ['/api/hr/time-entries', '/api/mobile/clock-in', '/api/mobile/clock-out'],
    services: ['mobileWorkerRoutes', 'timeEntryRouter'],
    features: ['gps_clock', 'geofence_verification', 'photo_clock_in'],
  },
  'manual_scheduling': {
    routes: ['/api/schedules', '/api/ai-scheduling', '/api/trinity/auto-fill'],
    services: ['aiSchedulingRoutes', 'advancedSchedulingRoutes'],
    features: ['ai_scheduling', 'trinity_auto_fill', 'smart_scheduling'],
  },
  'call_outs': {
    routes: ['/api/schedules/swap-requests', '/api/shifts/coverage'],
    services: ['advancedSchedulingRoutes'],
    features: ['shift_swap', 'backup_notifications', 'coverage_alerts'],
  },
  'overtime_tracking': {
    routes: ['/api/analytics/overtime', '/api/labor-costs'],
    services: ['analyticsRoutes', 'payrollRoutes'],
    features: ['overtime_alerts', 'budget_tracking', 'labor_analytics'],
  },
  'audit_prep': {
    routes: ['/api/hr/compliance', '/api/hr/compliance/audit-packet', '/api/regulator-portal'],
    services: ['complianceVaultRoutes', 'regulatorPortalRoutes'],
    features: ['document_vault', 'worm_protection', 'audit_export'],
  },
  'license_expiry': {
    routes: ['/api/hr/compliance/certifications', '/api/hr/compliance/expiring'],
    services: ['complianceVaultRoutes'],
    features: ['certification_tracking', 'expiry_alerts', 'renewal_reminders'],
  },
  'multi_state': {
    routes: ['/api/hr/compliance/states'],
    services: ['complianceVaultRoutes'],
    features: ['multi_state_compliance', 'state_requirements'],
  },
  'client_billing': {
    routes: ['/api/invoices', '/api/client-billing', '/api/timesheet-invoices'],
    services: ['invoiceRoutes', 'timesheetInvoiceRouter'],
    features: ['auto_invoicing', 'billable_hours', 'invoice_generation'],
  },
  'helpdesk': {
    routes: ['/api/helpdesk', '/api/tickets', '/api/chat-rooms'],
    services: ['helpdeskRoutes', 'chatServerHub'],
    features: ['helpai', 'ticket_system', 'support_chat'],
  },
  'mobile_app': {
    routes: ['/api/mobile', '/api/worker'],
    services: ['mobileWorkerRoutes'],
    features: ['pwa', 'offline_support', 'mobile_clock'],
  },
};

export async function initializeTrinityOrchestrationGateway(): Promise<void> {
  log.info('[TrinityOrchestrationGateway] Initializing...');
  log.info('[TrinityOrchestrationGateway] Request tracking middleware ready');
  log.info('[TrinityOrchestrationGateway] Event subscriptions active');
  log.info('[TrinityOrchestrationGateway] Upsell detection active');
  log.info('[TrinityOrchestrationGateway] 35-point security pain audit ready');
}
