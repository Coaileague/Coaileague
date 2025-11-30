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

  // Check Database and record latency
  const dbStart = Date.now();
  const dbHealthy = await checkDatabase();
  const dbLatency = Date.now() - dbStart;
  recordLatency('database', dbLatency);
  checks.push({
    component: 'database',
    status: dbHealthy ? 'healthy' : 'offline',
    latencyMs: dbLatency,
    lastCheckedAt: new Date(),
    message: dbHealthy ? 'PostgreSQL operational' : 'Database unreachable',
  });

  // Check WebSocket and record latency
  const wsStart = Date.now();
  const wsHealthy = await checkChatWebSocket();
  const wsLatency = Date.now() - wsStart;
  recordLatency('websocket', wsLatency);
  checks.push({
    component: 'websocket',
    status: wsHealthy ? 'healthy' : 'degraded',
    latencyMs: wsLatency,
    lastCheckedAt: new Date(),
    message: wsHealthy ? 'WebSocket server operational' : 'WebSocket connection issues',
  });

  // Check Stripe and record latency
  const stripeStart = Date.now();
  const stripeHealthy = await checkStripe();
  const stripeLatency = Date.now() - stripeStart;
  recordLatency('stripe', stripeLatency);
  checks.push({
    component: 'stripe',
    status: stripeHealthy ? 'healthy' : 'degraded',
    latencyMs: stripeLatency,
    lastCheckedAt: new Date(),
    message: stripeHealthy ? 'Stripe API operational' : 'Stripe API unavailable',
  });

  // Check Gemini AI and record latency
  const aiStart = Date.now();
  const aiHealthy = await checkGeminiAI();
  const aiLatency = Date.now() - aiStart;
  recordLatency('gemini-ai', aiLatency);
  checks.push({
    component: 'gemini-ai',
    status: aiHealthy ? 'healthy' : 'degraded',
    latencyMs: aiLatency,
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

// Store actual latency measurements
const latencyHistory = new Map<string, number[]>();

/**
 * Record a latency measurement for a component
 */
export function recordLatency(component: string, latencyMs: number): void {
  if (!latencyHistory.has(component)) {
    latencyHistory.set(component, []);
  }
  const history = latencyHistory.get(component)!;
  history.push(latencyMs);
  // Keep last 100 measurements
  if (history.length > 100) {
    history.shift();
  }
}

/**
 * Get average latency for a component from real measurements
 */
export function getComponentLatency(component: string): number {
  const history = latencyHistory.get(component);
  if (!history || history.length === 0) {
    // Return 0 if no measurements yet (will populate on first health check)
    return 0;
  }
  
  // Calculate real average from stored measurements
  const sum = history.reduce((a, b) => a + b, 0);
  return Math.round(sum / history.length);
}

/**
 * Check if system is healthy enough for critical operations
 */
export function canRunCriticalOperation(): boolean {
  const lastCheck = Array.from(healthHistory.values()).flat().pop();
  if (!lastCheck) return true; // Assume healthy if no data
  return lastCheck.status !== 'offline';
}

// ============================================================================
// SYSTEM METRICS (Used by platformAdmin.ts)
// ============================================================================

const serverStartTime = Date.now();
let lastCpu = 5;
let lastMemory = 30;
let lastCpuSample = process.cpuUsage();
let lastSampleTime = Date.now();

// Sample CPU every 5 seconds for accurate readings
setInterval(() => {
  try {
    const currentCpuUsage = process.cpuUsage(lastCpuSample);
    const elapsedMs = Date.now() - lastSampleTime;
    
    if (elapsedMs > 0) {
      // Calculate CPU percentage from delta
      const totalCpuMicros = currentCpuUsage.user + currentCpuUsage.system;
      const elapsedMicros = elapsedMs * 1000;
      lastCpu = Math.min(100, Math.round((totalCpuMicros / elapsedMicros) * 100));
    }
    
    // Update memory
    const memUsage = process.memoryUsage();
    const totalMem = 512 * 1024 * 1024; // 512MB container
    lastMemory = Math.round((memUsage.heapUsed / totalMem) * 100);
    
    // Update samples for next iteration
    lastCpuSample = process.cpuUsage();
    lastSampleTime = Date.now();
  } catch {
    // Keep last values on error
  }
}, 5000);

/**
 * Get platform uptime in seconds
 */
export function getPlatformUptime(): number {
  return Math.floor((Date.now() - serverStartTime) / 1000);
}

/**
 * Get system metrics (CPU, memory usage)
 * Uses sampled process metrics from Node.js (updated every 5s)
 */
export function getSystemMetrics(): { cpu: number; memory: number } {
  return { cpu: lastCpu, memory: lastMemory };
}

// ============================================================================
// AUTOMATION METRICS TRACKING (Gap #P2)
// ============================================================================

interface AutomationJobMetrics {
  jobName: string;
  lastRunAt: Date | null;
  lastDurationMs: number;
  successCount: number;
  failureCount: number;
  averageDurationMs: number;
  status: 'idle' | 'running' | 'success' | 'failed';
  lastError?: string;
}

const automationMetrics = new Map<string, AutomationJobMetrics>();

/**
 * Record start of an automation job
 */
export function recordJobStart(jobName: string): () => void {
  const startTime = Date.now();
  
  if (!automationMetrics.has(jobName)) {
    automationMetrics.set(jobName, {
      jobName,
      lastRunAt: null,
      lastDurationMs: 0,
      successCount: 0,
      failureCount: 0,
      averageDurationMs: 0,
      status: 'idle',
    });
  }
  
  const metrics = automationMetrics.get(jobName)!;
  metrics.status = 'running';
  metrics.lastRunAt = new Date();
  
  return () => {
    const duration = Date.now() - startTime;
    recordJobComplete(jobName, duration, true);
  };
}

/**
 * Record completion of an automation job
 */
export function recordJobComplete(
  jobName: string,
  durationMs: number,
  success: boolean,
  errorMessage?: string
): void {
  if (!automationMetrics.has(jobName)) {
    automationMetrics.set(jobName, {
      jobName,
      lastRunAt: new Date(),
      lastDurationMs: durationMs,
      successCount: success ? 1 : 0,
      failureCount: success ? 0 : 1,
      averageDurationMs: durationMs,
      status: success ? 'success' : 'failed',
      lastError: errorMessage,
    });
    return;
  }
  
  const metrics = automationMetrics.get(jobName)!;
  metrics.lastDurationMs = durationMs;
  metrics.status = success ? 'success' : 'failed';
  
  if (success) {
    metrics.successCount++;
    metrics.lastError = undefined;
  } else {
    metrics.failureCount++;
    metrics.lastError = errorMessage;
  }
  
  // Update rolling average
  const totalRuns = metrics.successCount + metrics.failureCount;
  metrics.averageDurationMs = Math.round(
    ((metrics.averageDurationMs * (totalRuns - 1)) + durationMs) / totalRuns
  );
}

/**
 * Get metrics for a specific automation job
 */
export function getJobMetrics(jobName: string): AutomationJobMetrics | null {
  return automationMetrics.get(jobName) || null;
}

/**
 * Get metrics for all automation jobs
 */
export function getAllJobMetrics(): AutomationJobMetrics[] {
  return Array.from(automationMetrics.values());
}

/**
 * Get automation health summary
 */
export function getAutomationHealthSummary(): {
  totalJobs: number;
  runningJobs: number;
  failedJobs: number;
  avgSuccessRate: number;
  avgDurationMs: number;
} {
  const jobs = getAllJobMetrics();
  
  if (jobs.length === 0) {
    return {
      totalJobs: 0,
      runningJobs: 0,
      failedJobs: 0,
      avgSuccessRate: 100,
      avgDurationMs: 0,
    };
  }
  
  const runningJobs = jobs.filter(j => j.status === 'running').length;
  const failedJobs = jobs.filter(j => j.status === 'failed').length;
  
  const totalSuccesses = jobs.reduce((sum, j) => sum + j.successCount, 0);
  const totalFailures = jobs.reduce((sum, j) => sum + j.failureCount, 0);
  const totalRuns = totalSuccesses + totalFailures;
  
  const avgSuccessRate = totalRuns > 0 
    ? Math.round((totalSuccesses / totalRuns) * 100) 
    : 100;
  
  const avgDurationMs = jobs.length > 0
    ? Math.round(jobs.reduce((sum, j) => sum + j.averageDurationMs, 0) / jobs.length)
    : 0;
  
  return {
    totalJobs: jobs.length,
    runningJobs,
    failedJobs,
    avgSuccessRate,
    avgDurationMs,
  };
}

export const monitoringService = {
  checkSystemHealth,
  getComponentHealthHistory,
  getComponentLatency,
  recordLatency,
  canRunCriticalOperation,
  getSystemMetrics,
  getPlatformUptime,
  recordJobStart,
  recordJobComplete,
  getJobMetrics,
  getAllJobMetrics,
  getAutomationHealthSummary,
};
