// Health Check Service - Monitor critical platform services

import type { ServiceHealth, ServiceStatus, HealthSummary } from '../../shared/healthTypes';
import { db } from '../db';
import { sql, eq, and, desc, like } from 'drizzle-orm';
import Stripe from 'stripe';
import { wsCounter } from './websocketCounter';
import { objectStorageClient } from '../objectStorage';
import { storage } from '../storage';
import { getFeatureToggle } from '../../shared/config/featureToggleAccess';
import { TIMEOUTS } from '../config/platformConfig';
import { typedCount, typedQuery } from '../lib/typedSql';
import { partnerConnections } from '@shared/schema';
import { createLogger } from '../lib/logger';
const log = createLogger('healthCheck');


// Platform workspace ID for system-level support tickets
// This should be configured during platform initialization
const PLATFORM_WORKSPACE_ID = process.env.PLATFORM_WORKSPACE_ID || 'platform';

// Cache health check results to prevent thrashing
// Don't cache failures so recovery is detected quickly
const healthCache = new Map<string, { result: ServiceHealth; expiresAt: number }>();
const CACHE_TTL_MS = TIMEOUTS.healthCheckCacheTtlMs;
const FAILURE_CACHE_TTL_MS = TIMEOUTS.healthCheckFailCacheTtlMs;

// Track last ticket creation time per service to prevent spam
// Only create 1 ticket per service per hour
const lastTicketCreation = new Map<string, number>();

// Track which services were previously down — for auto-resolve on recovery
const previouslyDownServices = new Set<string>();
const TICKET_CREATION_COOLDOWN_MS = 60 * 60 * 1000; // 1 hour

function getCached(key: string): ServiceHealth | null {
  const cached = healthCache.get(key);
  if (cached && Date.now() < cached.expiresAt) {
    return cached.result;
  }
  healthCache.delete(key);
  return null;
}

function setCache(key: string, result: ServiceHealth, ttl: number = CACHE_TTL_MS): void {
  healthCache.set(key, {
    result,
    expiresAt: Date.now() + ttl,
  });
}

// Service criticality mapping
const CRITICAL_SERVICES: Set<string> = new Set(['database', 'chat_websocket', 'gemini_ai']);

function isCriticalService(service: string): boolean {
  return CRITICAL_SERVICES.has(service);
}

/**
 * Generate unique ticket number for health check tickets
 * Format: HEALTH-YYYYMMDD-HHmmss-SERVICE
 */
function generateTicketNumber(serviceName: string): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  const hours = String(now.getHours()).padStart(2, '0');
  const minutes = String(now.getMinutes()).padStart(2, '0');
  const seconds = String(now.getSeconds()).padStart(2, '0');
  
  return `HEALTH-${year}${month}${day}-${hours}${minutes}${seconds}-${serviceName.toUpperCase()}`;
}

/**
 * Create support ticket for critical health check failure
 * Only creates ticket if:
 * - Feature is enabled
 * - Service status is 'critical' (not 'down' from the schema, but we map 'down' to 'critical')
 * - No ticket created for this service in the last hour
 */
async function createHealthCheckTicket(serviceHealth: ServiceHealth): Promise<void> {
  // Check if auto-ticket creation is enabled via feature toggle
  if (!getFeatureToggle('automation.autoTicketCreation')) {
    return;
  }

  // Only create tickets for critical status (map 'down' to critical)
  if (serviceHealth.status !== 'down') {
    return;
  }

  // Check if service is critical
  if (!serviceHealth.isCritical) {
    return;
  }

  // Check cooldown period - prevent duplicate tickets
  const lastCreated = lastTicketCreation.get(serviceHealth.service);
  const now = Date.now();
  if (lastCreated && (now - lastCreated) < TICKET_CREATION_COOLDOWN_MS) {
    log.info(`[HealthCheck] Skipping ticket creation for ${serviceHealth.service} - cooldown active`);
    return;
  }

  try {
    // Build ticket description with service details
    const description = `Critical health check failure detected for ${serviceHealth.service}

**Status**: ${serviceHealth.status}
**Error Message**: ${serviceHealth.message}
**Response Time**: ${serviceHealth.latencyMs ? `${serviceHealth.latencyMs}ms` : 'N/A'}
**Timestamp**: ${serviceHealth.lastChecked}

${serviceHealth.metadata ? `**Additional Details**:\n${JSON.stringify(serviceHealth.metadata, null, 2)}` : ''}

This is an automated ticket created by the health monitoring system. Immediate investigation required.`;

    // Create support ticket
    const ticket = await storage.createSupportTicket({
      workspaceId: PLATFORM_WORKSPACE_ID,
      ticketNumber: generateTicketNumber(serviceHealth.service),
      type: 'support',
      priority: 'high', // High priority for critical failures
      subject: `[CRITICAL] ${serviceHealth.service} service failure`,
      description,
      status: 'open',
      requestedBy: 'system-health-monitor',
    });

    // Update last ticket creation time and mark service as down
    lastTicketCreation.set(serviceHealth.service, now);
    previouslyDownServices.add(serviceHealth.service);

    log.info(`[HealthCheck] Created support ticket ${ticket.ticketNumber} for critical ${serviceHealth.service} failure`);
  } catch (error: any) {
    log.error(`[HealthCheck] Failed to create support ticket for ${serviceHealth.service}:`, (error instanceof Error ? error.message : String(error)));
  }
}

async function checkAndAutoResolveRecoveredServices(serviceHealth: ServiceHealth): Promise<void> {
  if (serviceHealth.status !== 'operational' && serviceHealth.status !== 'degraded') {
    return;
  }

  if (!previouslyDownServices.has(serviceHealth.service)) {
    return;
  }

  previouslyDownServices.delete(serviceHealth.service);

  try {
    const { autoResolveHealthTicket } = await import('./autoTicketCreation');
    const { supportTickets } = await import('@shared/schema');
    const { eq, and, desc, like } = await import('drizzle-orm');

    const [openTicket] = await db
      .select({ id: supportTickets.id })
      .from(supportTickets)
      .where(
        and(
          eq(supportTickets.status, 'open'),
          eq(supportTickets.requestedBy, 'system-health-monitor'),
          like(supportTickets.subject, `%${serviceHealth.service}%`)
        )
      )
      .orderBy(desc(supportTickets.createdAt))
      .limit(1);

    if (openTicket) {
      await autoResolveHealthTicket(openTicket.id);
      log.info(`[HealthCheck] Auto-resolved ticket ${openTicket.id} — ${serviceHealth.service} recovered`);
    }
  } catch (err: any) {
    log.warn(`[HealthCheck] Auto-resolve failed for ${serviceHealth.service}: ${(err instanceof Error ? err.message : String(err))}`);
  }
}

// Track startup time for cold start grace period
const serverStartTime = Date.now();
const COLD_START_GRACE_PERIOD_MS = TIMEOUTS.healthCheckGracePeriodMs;
const COLD_START_LATENCY_THRESHOLD_MS = TIMEOUTS.healthCheckLatencyThresholdMs;

// Database health check with real connectivity probe and cold start resilience
export async function checkDatabase(): Promise<ServiceHealth> {
  const cached = getCached('database');
  if (cached) return cached;

  const startTime = Date.now();
  const isInColdStartPeriod = (Date.now() - serverStartTime) < COLD_START_GRACE_PERIOD_MS;
  
  // Use more lenient threshold during cold start
  const latencyThreshold = isInColdStartPeriod ? COLD_START_LATENCY_THRESHOLD_MS : 1000;
  
  // Retry logic for transient failures
  const maxRetries = isInColdStartPeriod ? 3 : 1;
  let lastError: Error | null = null;
  
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      // Converted to Drizzle ORM: health check ping
      await db.execute(sql`SELECT 1 as health_check`);
      const latencyMs = Date.now() - startTime;

      const status: ServiceStatus = latencyMs < latencyThreshold ? 'operational' : 'degraded';
      const result: ServiceHealth = {
        service: 'database',
        status,
        isCritical: true,
        message: latencyMs < latencyThreshold ? 'Database responding normally' : 'Database slow response',
        lastChecked: new Date().toISOString(),
        latencyMs,
        metadata: isInColdStartPeriod ? { coldStart: true, threshold: latencyThreshold } : undefined,
      };

      setCache('database', result, CACHE_TTL_MS);
      return result;
    } catch (error: any) {
      lastError = error;
      
      // Only retry if in cold start period and not the last attempt
      if (attempt < maxRetries - 1) {
        const retryDelay = Math.min(500 * Math.pow(2, attempt), 2000);
        log.info(`[HealthCheck] Database check failed (attempt ${attempt + 1}/${maxRetries}), retrying in ${retryDelay}ms...`);
        await new Promise(resolve => setTimeout(resolve, retryDelay));
      }
    }
  }

  // All retries failed
  const result: ServiceHealth = {
    service: 'database',
    status: 'down',
    isCritical: true,
    message: `Database connection failed: ${lastError?.message || 'Unknown error'}`,
    lastChecked: new Date().toISOString(),
    latencyMs: Date.now() - startTime,
    metadata: isInColdStartPeriod ? { coldStart: true, retryAttempts: maxRetries } : undefined,
  };

  setCache('database', result, FAILURE_CACHE_TTL_MS); // Short cache for failures
  
  // Auto-create support ticket for critical failure
  await createHealthCheckTicket(result);
  
  return result;
}

// WebSocket Chat Server health check
// Server is operational if it's running and accepting connections (0 connections is valid when idle)
export async function checkChatWebSocket(): Promise<ServiceHealth> {
  const cached = getCached('chat_websocket');
  if (cached) return cached;

  try {
    // Real WebSocket connection count from wsCounter
    const activeConnections = wsCounter.getActiveConnectionCount();
    const stats = wsCounter.getStatistics();
    
    // WebSocket server is operational as long as it's running (0 connections is normal when idle)
    const status: ServiceStatus = 'operational';
    const result: ServiceHealth = {
      service: 'chat_websocket',
      status,
      isCritical: true,
      message: activeConnections > 0 
        ? `Chat WebSocket server active (${activeConnections} connections, avg duration: ${stats.averageConnectionDuration}ms)`
        : 'Chat WebSocket server ready (awaiting connections)',
      lastChecked: new Date().toISOString(),
      metadata: {
        activeConnections,
        averageMessageCount: stats.averageMessageCount,
        averageConnectionDuration: stats.averageConnectionDuration,
      },
    };

    setCache('chat_websocket', result, CACHE_TTL_MS);
    return result;
  } catch (error: any) {
    const result: ServiceHealth = {
      service: 'chat_websocket',
      status: 'down',
      isCritical: true,
      message: `Chat WebSocket server unavailable: ${(error instanceof Error ? error.message : String(error))}`,
      lastChecked: new Date().toISOString(),
    };

    setCache('chat_websocket', result, FAILURE_CACHE_TTL_MS);
    
    // Auto-create support ticket for critical failure
    await createHealthCheckTicket(result);
    
    return result;
  }
}

// Gemini AI health check - lightweight connectivity test
export async function checkGeminiAI(): Promise<ServiceHealth> {
  const cached = getCached('gemini_ai');
  if (cached) return cached;

  try {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      const result: ServiceHealth = {
        service: 'gemini_ai',
        status: 'down',
        isCritical: true,
        message: 'Gemini API key not configured',
        lastChecked: new Date().toISOString(),
      };
      setCache('gemini_ai', result, FAILURE_CACHE_TTL_MS);
      
      // Auto-create support ticket for critical failure
      await createHealthCheckTicket(result);
      
      return result;
    }

    // Configuration check (actual API call would be too expensive for frequent health checks)
    // In production, consider periodic test calls or monitoring API quota/errors
    const result: ServiceHealth = {
      service: 'gemini_ai',
      status: 'operational',
      isCritical: true,
      message: 'Gemini AI configured',
      lastChecked: new Date().toISOString(),
    };

    setCache('gemini_ai', result, CACHE_TTL_MS);
    return result;
  } catch (error: any) {
    const result: ServiceHealth = {
      service: 'gemini_ai',
      status: 'degraded',
      isCritical: true,
      message: `Gemini AI configuration issue: ${(error instanceof Error ? error.message : String(error))}`,
      lastChecked: new Date().toISOString(),
    };

    setCache('gemini_ai', result, FAILURE_CACHE_TTL_MS);
    return result;
  }
}

// Object Storage health check with real connectivity probe
export async function checkObjectStorage(): Promise<ServiceHealth> {
  const cached = getCached('object_storage');
  if (cached) return cached;

  const startTime = Date.now();
  try {
    const bucketId = process.env.DEFAULT_OBJECT_STORAGE_BUCKET_ID;
    if (!bucketId) {
      const result: ServiceHealth = {
        service: 'object_storage',
        status: 'down',
        isCritical: false, // Non-critical service
        message: 'Object storage not configured',
        lastChecked: new Date().toISOString(),
      };
      setCache('object_storage', result, FAILURE_CACHE_TTL_MS);
      return result;
    }

    // Real connectivity probe - list objects with limit 1 (lightweight)
    const bucket = objectStorageClient.bucket(bucketId);
    const [files] = await bucket.getFiles({ maxResults: 1 });
    const latencyMs = Date.now() - startTime;

    const status: ServiceStatus = latencyMs < 2000 ? 'operational' : 'degraded';
    const result: ServiceHealth = {
      service: 'object_storage',
      status,
      isCritical: false,
      message: status === 'operational' 
        ? `Object storage responding normally (${files.length ? 'files present' : 'empty bucket'})`
        : 'Object storage slow response',
      lastChecked: new Date().toISOString(),
      latencyMs,
      metadata: {
        bucketId,
        hasFiles: files.length > 0,
      },
    };

    setCache('object_storage', result, CACHE_TTL_MS);
    return result;
  } catch (error: any) {
    const result: ServiceHealth = {
      service: 'object_storage',
      status: 'degraded',
      isCritical: false,
      message: `Object storage connectivity failed: ${(error instanceof Error ? error.message : String(error))}`,
      lastChecked: new Date().toISOString(),
      latencyMs: Date.now() - startTime,
    };

    setCache('object_storage', result, FAILURE_CACHE_TTL_MS);
    return result;
  }
}

// Stripe health check with API ping
export async function checkStripe(): Promise<ServiceHealth> {
  const cached = getCached('stripe');
  if (cached) return cached;

  const startTime = Date.now();
  try {
    const stripeKey = process.env.STRIPE_SECRET_KEY;
    if (!stripeKey) {
      const result: ServiceHealth = {
        service: 'stripe',
        status: 'down',
        isCritical: false, // Non-critical - billing can be queued
        message: 'Stripe not configured',
        lastChecked: new Date().toISOString(),
      };
      setCache('stripe', result, FAILURE_CACHE_TTL_MS);
      return result;
    }

    // Lightweight connectivity probe - fetch balance (cheap API call)
    const { getStripe: getLazyStripe } = await import('./billing/stripeClient');
    const stripe = getLazyStripe();
    await stripe.balance.retrieve({ timeout: 5000 }); // 5 second timeout
    const latencyMs = Date.now() - startTime;

    const status: ServiceStatus = latencyMs < 2000 ? 'operational' : 'degraded';
    const result: ServiceHealth = {
      service: 'stripe',
      status,
      isCritical: false,
      message: status === 'operational' ? 'Stripe API responding normally' : 'Stripe API slow response',
      lastChecked: new Date().toISOString(),
      latencyMs,
    };

    setCache('stripe', result, CACHE_TTL_MS);
    return result;
  } catch (error: any) {
    const result: ServiceHealth = {
      service: 'stripe',
      status: 'down',
      isCritical: false,
      message: `Stripe API unavailable: ${(error instanceof Error ? error.message : String(error))}`,
      lastChecked: new Date().toISOString(),
      latencyMs: Date.now() - startTime,
    };

    setCache('stripe', result, FAILURE_CACHE_TTL_MS);
    return result;
  }
}

// QuickBooks health check - Check connection status and token freshness
export async function checkQuickBooks(): Promise<ServiceHealth> {
  const cached = getCached('quickbooks');
  if (cached) return cached;

  try {
    // Converted to Drizzle ORM: CASE WHEN → sql fragment
    const countResult = await db.select({
      totalConnected: sql<number>`count(*)::int`,
      expiringSoon: sql<number>`count(case when ${partnerConnections.expiresAt} < now() + interval '24 hours' then 1 end)::int`
    })
    .from(partnerConnections)
    .where(and(
      eq(partnerConnections.partnerType, 'quickbooks'),
      eq(partnerConnections.status, 'connected')
    ));
    
    const row = countResult[0];
    const connectedCount = row?.totalConnected || 0;
    const expiringCount = row?.expiringSoon || 0;
    
    if (connectedCount === 0) {
      const result: ServiceHealth = {
        service: 'quickbooks',
        status: 'operational',
        isCritical: false,
        message: 'QuickBooks integration ready (no active connections)',
        lastChecked: new Date().toISOString(),
        metadata: { connectedAccounts: 0 },
      };
      setCache('quickbooks', result, CACHE_TTL_MS);
      return result;
    }

    const status: ServiceStatus = expiringCount > 0 ? 'degraded' : 'operational';
    const result: ServiceHealth = {
      service: 'quickbooks',
      status,
      isCritical: false,
      message: expiringCount > 0 
        ? `QuickBooks: ${expiringCount} connection(s) need token refresh`
        : `QuickBooks: ${connectedCount} active connection(s)`,
      lastChecked: new Date().toISOString(),
      metadata: {
        connectedAccounts: connectedCount,
        expiringTokens: expiringCount,
      },
    };

    setCache('quickbooks', result, CACHE_TTL_MS);
    return result;
  } catch (error: any) {
    const result: ServiceHealth = {
      service: 'quickbooks',
      status: 'degraded',
      isCritical: false,
      message: `QuickBooks status check failed: ${(error instanceof Error ? error.message : String(error))}`,
      lastChecked: new Date().toISOString(),
    };
    setCache('quickbooks', result, FAILURE_CACHE_TTL_MS);
    return result;
  }
}

// Gusto health check - Check connection status and token freshness
export async function checkGusto(): Promise<ServiceHealth> {
  const cached = getCached('gusto');
  if (cached) return cached;

  try {
    // Converted to Drizzle ORM: CASE WHEN → sql fragment
    const countResult = await db.select({
      totalConnected: sql<number>`count(*)::int`,
      expiringSoon: sql<number>`count(case when ${partnerConnections.expiresAt} < now() + interval '24 hours' then 1 end)::int`
    })
    .from(partnerConnections)
    .where(and(
      eq(partnerConnections.partnerType, 'gusto'),
      eq(partnerConnections.status, 'connected')
    ));
    
    const row = countResult[0];
    const connectedCount = row?.totalConnected || 0;
    const expiringCount = row?.expiringSoon || 0;
    
    if (connectedCount === 0) {
      const result: ServiceHealth = {
        service: 'gusto',
        status: 'operational',
        isCritical: false,
        message: 'Gusto integration ready (no active connections)',
        lastChecked: new Date().toISOString(),
        metadata: { connectedAccounts: 0 },
      };
      setCache('gusto', result, CACHE_TTL_MS);
      return result;
    }

    const status: ServiceStatus = expiringCount > 0 ? 'degraded' : 'operational';
    const result: ServiceHealth = {
      service: 'gusto',
      status,
      isCritical: false,
      message: expiringCount > 0 
        ? `Gusto: ${expiringCount} connection(s) need token refresh`
        : `Gusto: ${connectedCount} active connection(s)`,
      lastChecked: new Date().toISOString(),
      metadata: {
        connectedAccounts: connectedCount,
        expiringTokens: expiringCount,
      },
    };

    setCache('gusto', result, CACHE_TTL_MS);
    return result;
  } catch (error: any) {
    const result: ServiceHealth = {
      service: 'gusto',
      status: 'degraded',
      isCritical: false,
      message: `Gusto status check failed: ${(error instanceof Error ? error.message : String(error))}`,
      lastChecked: new Date().toISOString(),
    };
    setCache('gusto', result, FAILURE_CACHE_TTL_MS);
    return result;
  }
}

// Email (Resend) health check - configuration check
// Actual email send would be too expensive for health checks
export async function checkEmail(): Promise<ServiceHealth> {
  const cached = getCached('email');
  if (cached) return cached;

  try {
    // Check for RESEND_API_KEY env var first
    const resendKey = process.env.RESEND_API_KEY;
    if (resendKey) {
      const result: ServiceHealth = {
        service: 'email',
        status: 'operational',
        isCritical: false,
        message: 'Email service configured (API key)',
        lastChecked: new Date().toISOString(),
      };
      setCache('email', result, CACHE_TTL_MS);
      return result;
    }
    
    // Railway-only: the Replit connector fallback has been removed.
    // Email is considered configured if RESEND_API_KEY is set (see the
    // happy-path check earlier in this function). If we reach this point
    // it means the env var is missing.
    const result: ServiceHealth = {
      service: 'email',
      status: 'down',
      isCritical: false, // Non-critical - emails can be queued
      message: 'Email service not configured',
      lastChecked: new Date().toISOString(),
    };
    setCache('email', result, FAILURE_CACHE_TTL_MS);
    return result;
  } catch (error: any) {
    const result: ServiceHealth = {
      service: 'email',
      status: 'degraded',
      isCritical: false,
      message: `Email service issue: ${(error instanceof Error ? error.message : String(error))}`,
      lastChecked: new Date().toISOString(),
    };

    setCache('email', result, FAILURE_CACHE_TTL_MS);
    return result;
  }
}

// Get overall health summary with critical vs non-critical distinction
export async function getHealthSummary(): Promise<HealthSummary> {
  const checks = await Promise.all([
    checkDatabase(),
    checkChatWebSocket(),
    checkGeminiAI(),
    checkObjectStorage(),
    checkStripe(),
    checkEmail(),
    checkQuickBooks(),
    checkGusto(),
  ]);

  for (const svc of checks) {
    if (svc.status === 'down') {
      createHealthCheckTicket(svc).catch((err) => log.warn('[healthCheck] Fire-and-forget failed:', err));
    } else {
      checkAndAutoResolveRecoveredServices(svc).catch((err) => log.warn('[healthCheck] Fire-and-forget failed:', err));
    }
  }

  // Calculate stats
  const criticalServices = checks.filter(c => c.isCritical);
  const criticalServicesCount = criticalServices.length;
  const operationalServicesCount = checks.filter(c => c.status === 'operational').length;

  // Determine overall status based on CRITICAL services only
  const hasCriticalDown = criticalServices.some(c => c.status === 'down');
  const hasCriticalDegraded = criticalServices.some(c => c.status === 'degraded');

  const overall: ServiceStatus = hasCriticalDown ? 'down' : hasCriticalDegraded ? 'degraded' : 'operational';

  return {
    overall,
    services: checks,
    timestamp: new Date().toISOString(),
    criticalServicesCount,
    operationalServicesCount,
  };
}

// Get individual service health
export async function getServiceHealth(service: string): Promise<ServiceHealth | null> {
  switch (service) {
    case 'database':
      return await checkDatabase();
    case 'chat_websocket':
      return await checkChatWebSocket();
    case 'gemini_ai':
      return await checkGeminiAI();
    case 'object_storage':
      return await checkObjectStorage();
    case 'stripe':
      return await checkStripe();
    case 'email':
      return await checkEmail();
    case 'quickbooks':
      return await checkQuickBooks();
    case 'gusto':
      return await checkGusto();
    default:
      return null;
  }
}

// Get integration-specific health summary (QuickBooks + Gusto)
export async function getIntegrationHealthSummary(): Promise<{
  quickbooks: ServiceHealth;
  gusto: ServiceHealth;
  overall: ServiceStatus;
  timestamp: string;
}> {
  const [quickbooks, gusto] = await Promise.all([
    checkQuickBooks(),
    checkGusto(),
  ]);

  const hasDown = quickbooks.status === 'down' || gusto.status === 'down';
  const hasDegraded = quickbooks.status === 'degraded' || gusto.status === 'degraded';
  
  return {
    quickbooks,
    gusto,
    overall: hasDown ? 'down' : hasDegraded ? 'degraded' : 'operational',
    timestamp: new Date().toISOString(),
  };
}

/**
 * Gateway Health Check - Comprehensive platform readiness monitoring
 * 
 * Returns:
 * - Gateway operational status
 * - Connected systems health (Database, Gemini, Resend)
 * - Active room count and participant statistics
 * - Event processing stats
 * - Gateway version
 * 
 * Used for monitoring platform readiness and system integration status
 */
export interface GatewayHealthResponse {
  gateway: {
    status: ServiceStatus;
    isInitialized: boolean;
    version: string;
    lastChecked: string;
  };
  systems: {
    database: ServiceHealth;
    gemini: ServiceHealth;
    email: ServiceHealth;
    websocket: ServiceHealth;
  };
  rooms: {
    totalCount: number;
    byType: {
      support: number;
      work: number;
      meeting: number;
      org: number;
    };
    totalParticipants: number;
  };
  eventProcessing: {
    activeConnections: number;
    averageConnectionDuration: number;
    averageMessageCount: number;
  };
  platformReadiness: 'ready' | 'degraded' | 'critical';
  timestamp: string;
}

export async function getGatewayHealth(): Promise<GatewayHealthResponse> {
  try {
    // Import ChatServerHub dynamically to avoid circular imports
    const { getChatServerHubStats } = await import('./ChatServerHub');
    
    // Perform all health checks in parallel
    const [dbHealth, geminiHealth, emailHealth, wsHealth] = await Promise.all([
      checkDatabase(),
      checkGeminiAI(),
      checkEmail(),
      checkChatWebSocket(),
    ]);

    // Get gateway stats
    const gatewayStats = getChatServerHubStats();
    
    // Get WebSocket connection stats
    const wsStats = wsCounter.getStatistics();

    // Determine gateway status based on critical services
    const criticalServices = [dbHealth, geminiHealth, wsHealth];
    const hasCriticalDown = criticalServices.some(s => s.status === 'down');
    const hasCriticalDegraded = criticalServices.some(s => s.status === 'degraded');
    
    const gatewayStatus: ServiceStatus = hasCriticalDown ? 'down' : hasCriticalDegraded ? 'degraded' : 'operational';
    const platformReadiness: 'ready' | 'degraded' | 'critical' = 
      hasCriticalDown ? 'critical' : 
      hasCriticalDegraded ? 'degraded' : 
      'ready';

    return {
      gateway: {
        status: gatewayStatus,
        isInitialized: gatewayStats.isInitialized,
        version: gatewayStats.version,
        lastChecked: new Date().toISOString(),
      },
      systems: {
        database: dbHealth,
        gemini: geminiHealth,
        email: emailHealth,
        websocket: wsHealth,
      },
      rooms: {
        totalCount: gatewayStats.totalRooms,
        byType: {
          support: gatewayStats.roomsByType['support'] || 0,
          work: gatewayStats.roomsByType['work'] || 0,
          meeting: gatewayStats.roomsByType['meeting'] || 0,
          org: gatewayStats.roomsByType['org'] || 0,
        },
        totalParticipants: gatewayStats.totalParticipants,
      },
      eventProcessing: {
        activeConnections: wsStats.totalConnections,
        averageConnectionDuration: wsStats.averageConnectionDuration,
        averageMessageCount: wsStats.averageMessageCount,
      },
      platformReadiness,
      timestamp: new Date().toISOString(),
    };
  } catch (error: any) {
    log.error('[HealthCheck] Error computing gateway health:', error);
    
    // Return degraded response if we can't compute full health
    return {
      gateway: {
        status: 'degraded',
        isInitialized: false,
        version: 'unknown',
        lastChecked: new Date().toISOString(),
      },
      systems: {
        database: { service: 'database', status: 'down', isCritical: true, message: 'Health check failed', lastChecked: new Date().toISOString() },
        gemini: { service: 'gemini_ai', status: 'down', isCritical: true, message: 'Health check failed', lastChecked: new Date().toISOString() },
        email: { service: 'email', status: 'down', isCritical: false, message: 'Health check failed', lastChecked: new Date().toISOString() },
        websocket: { service: 'chat_websocket', status: 'down', isCritical: true, message: 'Health check failed', lastChecked: new Date().toISOString() },
      },
      rooms: {
        totalCount: 0,
        byType: {
          support: 0,
          work: 0,
          meeting: 0,
          org: 0,
        },
        totalParticipants: 0,
      },
      eventProcessing: {
        activeConnections: 0,
        averageConnectionDuration: 0,
        averageMessageCount: 0,
      },
      platformReadiness: 'critical',
      timestamp: new Date().toISOString(),
    };
  }
}

/**
 * Get active WebSocket connection count
 * Exported for use in analytics and health checks
 */
export function getActiveConnectionCount(): number {
  return wsCounter.getActiveConnectionCount();
}
