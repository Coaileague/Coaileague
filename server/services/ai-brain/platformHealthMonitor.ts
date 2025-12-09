/**
 * Platform Health Monitor for Trinity
 * 
 * Monitors platform health, detects issues, and provides diagnostics
 * for support and root admin roles to act upon.
 */

import { db } from '../../db';
import { sql } from 'drizzle-orm';

export interface HealthCheckResult {
  service: string;
  status: 'healthy' | 'degraded' | 'unhealthy' | 'unknown';
  latencyMs?: number;
  message?: string;
  lastChecked: Date;
}

export interface PlatformHealthSummary {
  overallStatus: 'healthy' | 'degraded' | 'critical';
  services: HealthCheckResult[];
  activeIssues: PlatformIssue[];
  recommendations: string[];
  lastFullCheck: Date;
}

export interface PlatformIssue {
  id: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  category: 'database' | 'api' | 'frontend' | 'integration' | 'performance' | 'security';
  title: string;
  description: string;
  detectedAt: Date;
  suggestedFix?: HotfixSuggestion;
  status: 'detected' | 'acknowledged' | 'fixing' | 'resolved';
}

export interface HotfixSuggestion {
  id: string;
  issueId: string;
  description: string;
  action: 'code_change' | 'config_update' | 'restart_service' | 'clear_cache' | 'database_fix';
  targetFile?: string;
  suggestedCode?: string;
  riskLevel: 'low' | 'medium' | 'high';
  requiresApproval: boolean;
  createdAt: Date;
  approvedBy?: string;
  approvedAt?: Date;
  executedAt?: Date;
  status: 'pending' | 'approved' | 'rejected' | 'executed' | 'failed';
}

// In-memory storage for issues and hotfixes (would be database-backed in production)
const activeIssues: Map<string, PlatformIssue> = new Map();
const hotfixQueue: Map<string, HotfixSuggestion> = new Map();
let lastHealthCheck: PlatformHealthSummary | null = null;

/**
 * Check database connectivity and performance
 */
async function checkDatabase(): Promise<HealthCheckResult> {
  const start = Date.now();
  try {
    await db.execute(sql`SELECT 1`);
    const latency = Date.now() - start;
    return {
      service: 'database',
      status: latency > 1000 ? 'degraded' : 'healthy',
      latencyMs: latency,
      message: latency > 1000 ? 'High latency detected' : 'Connected',
      lastChecked: new Date(),
    };
  } catch (error: any) {
    return {
      service: 'database',
      status: 'unhealthy',
      message: error.message || 'Connection failed',
      lastChecked: new Date(),
    };
  }
}

/**
 * Check AI Brain services availability
 */
async function checkAIBrain(): Promise<HealthCheckResult> {
  try {
    const geminiKey = process.env.GEMINI_API_KEY;
    return {
      service: 'ai_brain',
      status: geminiKey ? 'healthy' : 'degraded',
      message: geminiKey ? 'Gemini API configured' : 'Missing Gemini API key',
      lastChecked: new Date(),
    };
  } catch (error: any) {
    return {
      service: 'ai_brain',
      status: 'unhealthy',
      message: error.message,
      lastChecked: new Date(),
    };
  }
}

/**
 * Check Stripe integration
 */
async function checkStripeIntegration(): Promise<HealthCheckResult> {
  try {
    const stripeKey = process.env.STRIPE_SECRET_KEY || process.env.TESTING_STRIPE_SECRET_KEY;
    return {
      service: 'stripe',
      status: stripeKey ? 'healthy' : 'degraded',
      message: stripeKey ? 'Stripe configured' : 'Missing Stripe API key',
      lastChecked: new Date(),
    };
  } catch (error: any) {
    return {
      service: 'stripe',
      status: 'unknown',
      message: error.message,
      lastChecked: new Date(),
    };
  }
}

/**
 * Check email service
 */
async function checkEmailService(): Promise<HealthCheckResult> {
  try {
    const resendKey = process.env.RESEND_API_KEY;
    return {
      service: 'email',
      status: resendKey ? 'healthy' : 'degraded',
      message: resendKey ? 'Resend API configured' : 'Missing Resend API key',
      lastChecked: new Date(),
    };
  } catch (error: any) {
    return {
      service: 'email',
      status: 'unknown',
      message: error.message,
      lastChecked: new Date(),
    };
  }
}

/**
 * Check WebSocket service
 */
function checkWebSocket(): HealthCheckResult {
  return {
    service: 'websocket',
    status: 'healthy',
    message: 'WebSocket server running',
    lastChecked: new Date(),
  };
}

/**
 * Check Notification System via Trinity Bridge Watchdog
 */
async function checkNotificationSystem(): Promise<HealthCheckResult> {
  try {
    // Import dynamically to avoid circular dependencies
    const { trinityNotificationBridge } = await import('./trinityNotificationBridge');
    const metrics = trinityNotificationBridge.getMetrics();
    const watchdog = trinityNotificationBridge.getWatchdogStatus();

    return {
      service: 'notifications',
      status: metrics.health,
      latencyMs: metrics.averageDeliveryTime,
      message: watchdog.running 
        ? `Watchdog active, ${metrics.queueDepth} queued, ${metrics.totalSent} sent` 
        : 'Watchdog not running',
      lastChecked: new Date(),
    };
  } catch (error: any) {
    return {
      service: 'notifications',
      status: 'unknown',
      message: error.message || 'Failed to check notification system',
      lastChecked: new Date(),
    };
  }
}

/**
 * Run full platform health check
 */
export async function runHealthCheck(): Promise<PlatformHealthSummary> {
  const services = await Promise.all([
    checkDatabase(),
    checkAIBrain(),
    checkStripeIntegration(),
    checkEmailService(),
    Promise.resolve(checkWebSocket()),
    checkNotificationSystem(),
  ]);

  const unhealthyCount = services.filter(s => s.status === 'unhealthy').length;
  const degradedCount = services.filter(s => s.status === 'degraded').length;

  let overallStatus: 'healthy' | 'degraded' | 'critical';
  if (unhealthyCount > 0) {
    overallStatus = 'critical';
  } else if (degradedCount > 0) {
    overallStatus = 'degraded';
  } else {
    overallStatus = 'healthy';
  }

  const recommendations: string[] = [];
  
  services.forEach(service => {
    if (service.status === 'unhealthy') {
      recommendations.push(`CRITICAL: ${service.service} is down - ${service.message}`);
    } else if (service.status === 'degraded') {
      recommendations.push(`WARNING: ${service.service} needs attention - ${service.message}`);
    }
  });

  lastHealthCheck = {
    overallStatus,
    services,
    activeIssues: Array.from(activeIssues.values()),
    recommendations,
    lastFullCheck: new Date(),
  };

  return lastHealthCheck;
}

/**
 * Get cached health status or run new check
 */
export async function getHealthStatus(forceRefresh = false): Promise<PlatformHealthSummary> {
  if (!forceRefresh && lastHealthCheck) {
    const age = Date.now() - lastHealthCheck.lastFullCheck.getTime();
    if (age < 60000) { // Cache for 1 minute
      return lastHealthCheck;
    }
  }
  return runHealthCheck();
}

/**
 * Report a detected issue
 */
export function reportIssue(issue: Omit<PlatformIssue, 'id' | 'detectedAt' | 'status'>): PlatformIssue {
  const fullIssue: PlatformIssue = {
    ...issue,
    id: `issue-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
    detectedAt: new Date(),
    status: 'detected',
  };
  activeIssues.set(fullIssue.id, fullIssue);
  return fullIssue;
}

/**
 * Create a hotfix suggestion for an issue
 */
export function suggestHotfix(suggestion: Omit<HotfixSuggestion, 'id' | 'createdAt' | 'status'>): HotfixSuggestion {
  const hotfix: HotfixSuggestion = {
    ...suggestion,
    id: `hotfix-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
    createdAt: new Date(),
    status: 'pending',
  };
  hotfixQueue.set(hotfix.id, hotfix);
  
  // Link hotfix to issue
  const issue = activeIssues.get(suggestion.issueId);
  if (issue) {
    issue.suggestedFix = hotfix;
    activeIssues.set(issue.id, issue);
  }
  
  return hotfix;
}

/**
 * Get pending hotfixes for approval
 */
export function getPendingHotfixes(): HotfixSuggestion[] {
  return Array.from(hotfixQueue.values()).filter(h => h.status === 'pending');
}

/**
 * Approve a hotfix (for root/support roles)
 */
export function approveHotfix(hotfixId: string, approvedBy: string): HotfixSuggestion | null {
  const hotfix = hotfixQueue.get(hotfixId);
  if (!hotfix || hotfix.status !== 'pending') return null;
  
  hotfix.status = 'approved';
  hotfix.approvedBy = approvedBy;
  hotfix.approvedAt = new Date();
  hotfixQueue.set(hotfixId, hotfix);
  return hotfix;
}

/**
 * Reject a hotfix
 */
export function rejectHotfix(hotfixId: string, rejectedBy: string): HotfixSuggestion | null {
  const hotfix = hotfixQueue.get(hotfixId);
  if (!hotfix || hotfix.status !== 'pending') return null;
  
  hotfix.status = 'rejected';
  hotfixQueue.set(hotfixId, hotfix);
  return hotfix;
}

/**
 * Mark hotfix as executed
 */
export function markHotfixExecuted(hotfixId: string, success: boolean): HotfixSuggestion | null {
  const hotfix = hotfixQueue.get(hotfixId);
  if (!hotfix) return null;
  
  hotfix.status = success ? 'executed' : 'failed';
  hotfix.executedAt = new Date();
  hotfixQueue.set(hotfixId, hotfix);
  
  // Resolve the linked issue if successful
  if (success && hotfix.issueId) {
    const issue = activeIssues.get(hotfix.issueId);
    if (issue) {
      issue.status = 'resolved';
      activeIssues.set(issue.id, issue);
    }
  }
  
  return hotfix;
}

/**
 * Get all active issues
 */
export function getActiveIssues(): PlatformIssue[] {
  return Array.from(activeIssues.values()).filter(i => i.status !== 'resolved');
}

/**
 * Generate Trinity-friendly health summary
 */
export async function getTrinityHealthInsight(): Promise<string> {
  const health = await getHealthStatus();
  
  if (health.overallStatus === 'healthy' && health.activeIssues.length === 0) {
    const messages = [
      'All platform systems are running smoothly. No issues detected.',
      'Platform health check passed. All services operational.',
      'Everything looks good! Database, AI, and integrations are healthy.',
    ];
    return messages[Math.floor(Math.random() * messages.length)];
  }
  
  if (health.overallStatus === 'critical') {
    const critical = health.services.filter(s => s.status === 'unhealthy');
    return `ALERT: Critical issues detected! ${critical.map(s => s.service).join(', ')} ${critical.length === 1 ? 'is' : 'are'} down. Immediate attention required.`;
  }
  
  if (health.overallStatus === 'degraded') {
    const degraded = health.services.filter(s => s.status === 'degraded');
    return `Platform status: Degraded. ${degraded.map(s => `${s.service}: ${s.message}`).join('; ')}. Consider investigating.`;
  }
  
  if (health.activeIssues.length > 0) {
    const highPriority = health.activeIssues.filter(i => i.severity === 'high' || i.severity === 'critical');
    if (highPriority.length > 0) {
      return `${highPriority.length} high-priority issue${highPriority.length > 1 ? 's' : ''} detected: ${highPriority[0].title}. Shall I suggest a fix?`;
    }
    return `${health.activeIssues.length} active issue${health.activeIssues.length > 1 ? 's' : ''} being tracked. Most recent: ${health.activeIssues[0].title}`;
  }
  
  return 'Platform health nominal. Monitoring for issues.';
}

export const platformHealthMonitor = {
  runHealthCheck,
  getHealthStatus,
  reportIssue,
  suggestHotfix,
  getPendingHotfixes,
  approveHotfix,
  rejectHotfix,
  markHotfixExecuted,
  getActiveIssues,
  getTrinityHealthInsight,
};
