// Health Check Service - Monitor critical platform services

import type { ServiceHealth, ServiceStatus, HealthSummary } from '../../shared/healthTypes';
import { db } from '../db';
import { sql } from 'drizzle-orm';
import Stripe from 'stripe';
import { wsCounter } from './websocketCounter';
import { objectStorageClient } from '../objectStorage';
import { storage } from '../storage';
import { getFeatureToggle } from '../../shared/config/featureToggleAccess';

// Platform workspace ID for system-level support tickets
// This should be configured during platform initialization
const PLATFORM_WORKSPACE_ID = process.env.PLATFORM_WORKSPACE_ID || 'platform';

// Cache health check results to prevent thrashing
// Don't cache failures so recovery is detected quickly
const healthCache = new Map<string, { result: ServiceHealth; expiresAt: number }>();
const CACHE_TTL_MS = 30000; // 30 seconds for successful checks
const FAILURE_CACHE_TTL_MS = 5000; // 5 seconds for failed checks (faster recovery detection)

// Track last ticket creation time per service to prevent spam
// Only create 1 ticket per service per hour
const lastTicketCreation = new Map<string, number>();
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
    console.log(`[HealthCheck] Skipping ticket creation for ${serviceHealth.service} - cooldown active`);
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

    // Update last ticket creation time
    lastTicketCreation.set(serviceHealth.service, now);

    console.log(`[HealthCheck] Created support ticket ${ticket.ticketNumber} for critical ${serviceHealth.service} failure`);
  } catch (error: any) {
    console.error(`[HealthCheck] Failed to create support ticket for ${serviceHealth.service}:`, error.message);
    // Don't throw - health check should continue even if ticket creation fails
  }
}

// Database health check with real connectivity probe
export async function checkDatabase(): Promise<ServiceHealth> {
  const cached = getCached('database');
  if (cached) return cached;

  const startTime = Date.now();
  try {
    // Real connectivity probe
    await db.execute(sql`SELECT 1 as health_check`);
    const latencyMs = Date.now() - startTime;

    const status: ServiceStatus = latencyMs < 1000 ? 'operational' : 'degraded';
    const result: ServiceHealth = {
      service: 'database',
      status,
      isCritical: true,
      message: latencyMs < 1000 ? 'Database responding normally' : 'Database slow response',
      lastChecked: new Date().toISOString(),
      latencyMs,
    };

    setCache('database', result, CACHE_TTL_MS);
    return result;
  } catch (error: any) {
    const result: ServiceHealth = {
      service: 'database',
      status: 'down',
      isCritical: true,
      message: `Database connection failed: ${error.message}`,
      lastChecked: new Date().toISOString(),
      latencyMs: Date.now() - startTime,
    };

    setCache('database', result, FAILURE_CACHE_TTL_MS); // Short cache for failures
    
    // Auto-create support ticket for critical failure
    await createHealthCheckTicket(result);
    
    return result;
  }
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
      message: `Chat WebSocket server unavailable: ${error.message}`,
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
      message: `Gemini AI configuration issue: ${error.message}`,
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
      message: `Object storage connectivity failed: ${error.message}`,
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
    const stripe = new Stripe(stripeKey, { apiVersion: '2025-09-30.clover' });
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
      message: `Stripe API unavailable: ${error.message}`,
      lastChecked: new Date().toISOString(),
      latencyMs: Date.now() - startTime,
    };

    setCache('stripe', result, FAILURE_CACHE_TTL_MS);
    return result;
  }
}

// Email (Resend) health check - configuration check
// Actual email send would be too expensive for health checks
export async function checkEmail(): Promise<ServiceHealth> {
  const cached = getCached('email');
  if (cached) return cached;

  try {
    const resendKey = process.env.RESEND_API_KEY;
    if (!resendKey) {
      const result: ServiceHealth = {
        service: 'email',
        status: 'down',
        isCritical: false, // Non-critical - emails can be queued
        message: 'Email service not configured',
        lastChecked: new Date().toISOString(),
      };
      setCache('email', result, FAILURE_CACHE_TTL_MS);
      return result;
    }

    // Configuration check (actual email send test would be too expensive)
    const result: ServiceHealth = {
      service: 'email',
      status: 'operational',
      isCritical: false,
      message: 'Email service configured',
      lastChecked: new Date().toISOString(),
    };

    setCache('email', result, CACHE_TTL_MS);
    return result;
  } catch (error: any) {
    const result: ServiceHealth = {
      service: 'email',
      status: 'degraded',
      isCritical: false,
      message: `Email service issue: ${error.message}`,
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
  ]);

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
    default:
      return null;
  }
}

/**
 * Get active WebSocket connection count
 * Exported for use in analytics and health checks
 */
export function getActiveConnectionCount(): number {
  return wsCounter.getActiveConnectionCount();
}
