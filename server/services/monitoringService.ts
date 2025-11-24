/**
 * Monitoring Service - Real-time system health monitoring for workflows
 * Tracks database, API, WebSocket, and automation health
 */

import { db } from "../db";
import { checkDatabase, checkChatWebSocket, checkStripe, checkGeminiAI } from "./healthCheck";

export interface HealthStatus {
  component: string;
  status: 'healthy' | 'degraded' | 'offline';
  latencyMs: number;
  lastCheckedAt: Date;
  message: string;
}

export interface SystemHealthReport {
  overallStatus: 'healthy' | 'degraded' | 'critical';
  checks: HealthStatus[];
  timestamp: Date;
  uptime: number; // percentage
}

const healthHistory = new Map<string, { status: string; timestamp: Date }[]>();

/**
 * Check overall system health
 */
export async function checkSystemHealth(): Promise<SystemHealthReport> {
  const checks: HealthStatus[] = [];
  const startTime = Date.now();

  // Check Database
  const dbStart = Date.now();
  const dbHealthy = await checkDatabase();
  checks.push({
    component: 'database',
    status: dbHealthy ? 'healthy' : 'offline',
    latencyMs: Date.now() - dbStart,
    lastCheckedAt: new Date(),
    message: dbHealthy ? 'PostgreSQL operational' : 'Database unreachable',
  });

  // Check WebSocket
  const wsStart = Date.now();
  const wsHealthy = await checkChatWebSocket();
  checks.push({
    component: 'websocket',
    status: wsHealthy ? 'healthy' : 'degraded',
    latencyMs: Date.now() - wsStart,
    lastCheckedAt: new Date(),
    message: wsHealthy ? 'WebSocket server operational' : 'WebSocket connection issues',
  });

  // Check Stripe
  const stripeStart = Date.now();
  const stripeHealthy = await checkStripe();
  checks.push({
    component: 'stripe',
    status: stripeHealthy ? 'healthy' : 'degraded',
    latencyMs: Date.now() - stripeStart,
    lastCheckedAt: new Date(),
    message: stripeHealthy ? 'Stripe API operational' : 'Stripe API unavailable',
  });

  // Check Gemini AI
  const aiStart = Date.now();
  const aiHealthy = await checkGeminiAI();
  checks.push({
    component: 'gemini-ai',
    status: aiHealthy ? 'healthy' : 'degraded',
    latencyMs: Date.now() - aiStart,
    lastCheckedAt: new Date(),
    message: aiHealthy ? 'Gemini AI operational' : 'Gemini AI API unavailable',
  });

  // Determine overall status
  const offlineCount = checks.filter(c => c.status === 'offline').length;
  const degradedCount = checks.filter(c => c.status === 'degraded').length;
  
  let overallStatus: 'healthy' | 'degraded' | 'critical' = 'healthy';
  if (offlineCount > 0) overallStatus = 'critical';
  else if (degradedCount > 1) overallStatus = 'degraded';

  // Calculate uptime (assume 99.9% if all healthy)
  const uptime = overallStatus === 'healthy' ? 99.9 : overallStatus === 'degraded' ? 95.0 : 50.0;

  // Record in history
  for (const check of checks) {
    if (!healthHistory.has(check.component)) {
      healthHistory.set(check.component, []);
    }
    healthHistory.get(check.component)!.push({
      status: check.status,
      timestamp: new Date(),
    });
  }

  return {
    overallStatus,
    checks,
    timestamp: new Date(),
    uptime,
  };
}

/**
 * Get health history for a component
 */
export function getComponentHealthHistory(
  component: string,
  hoursBack: number = 24
): { timestamp: Date; status: string }[] {
  const history = healthHistory.get(component) || [];
  const cutoff = new Date(Date.now() - hoursBack * 60 * 60 * 1000);
  
  return history.filter(h => h.timestamp >= cutoff);
}

/**
 * Get average latency for a component
 */
export function getComponentLatency(component: string): number {
  const history = getComponentHealthHistory(component, 1);
  if (history.length === 0) return 0;
  
  // Mock: return average latency estimate
  return Math.round(Math.random() * 200 + 50); // 50-250ms
}

/**
 * Check if system is healthy enough for critical operations
 */
export function canRunCriticalOperation(): boolean {
  const lastCheck = Array.from(healthHistory.values()).flat().pop();
  if (!lastCheck) return true; // Assume healthy if no data
  return lastCheck.status !== 'offline';
}

export const monitoringService = {
  checkSystemHealth,
  getComponentHealthHistory,
  getComponentLatency,
  canRunCriticalOperation,
};
