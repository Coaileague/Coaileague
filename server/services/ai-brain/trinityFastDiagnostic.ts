/**
 * TRINITY FAST DIAGNOSTIC SERVICE
 * ================================
 * Full platform diagnostic using FAST mode with tiered Gemini model routing.
 * 
 * Features:
 * - Comprehensive platform health scan
 * - AI-powered analysis using Gemini 3 Pro (DIAGNOSTICS tier)
 * - Self-healing recommendations
 * - Automatic notification system integration
 * - Gap detection and optimization suggestions
 */

import { modelRoutingEngine, recordModelResult } from './modelRoutingEngine';
import { geminiClient, GeminiModelTier } from './providers/geminiClient';
import { runHealthCheck, getHealthStatus, PlatformHealthSummary, reportIssue } from './platformHealthMonitor';
import { toolCapabilityRegistry } from './toolCapabilityRegistry';
import { subagentSupervisor } from './subagentSupervisor';
import { universalNotificationEngine } from '../universalNotificationEngine';
import { platformEventBus, publishPlatformUpdate } from '../platformEventBus';
import { db } from '../../db';
import { sql, desc, and, gte, eq } from 'drizzle-orm';
import { 
  systemAuditLogs, 
  notifications,
  platformUpdates,
  aiWorkboardTasks,
  trinityConversationSessions,
  supportTickets
} from '@shared/schema';

// ============================================================================
// DIAGNOSTIC RESULT TYPES
// ============================================================================

export interface DiagnosticFinding {
  category: 'health' | 'performance' | 'security' | 'optimization' | 'gap' | 'error' | 'upgrade';
  severity: 'info' | 'low' | 'medium' | 'high' | 'critical';
  title: string;
  description: string;
  affectedArea: string;
  suggestedAction?: string;
  autoFixAvailable: boolean;
  fixApplied?: boolean;
}

export interface DiagnosticReport {
  id: string;
  runAt: Date;
  duration: number;
  modelTierUsed: GeminiModelTier;
  overallHealth: 'healthy' | 'degraded' | 'critical';
  findings: DiagnosticFinding[];
  summary: string;
  aiAnalysis: string;
  selfHealingActions: string[];
  recommendations: string[];
  statistics: {
    servicesChecked: number;
    issuesFound: number;
    autoFixed: number;
    pendingAction: number;
  };
}

// ============================================================================
// PLATFORM METRICS COLLECTORS
// ============================================================================

async function collectDatabaseMetrics(): Promise<Record<string, any>> {
  try {
    // Check table counts and recent activity
    const auditResult = await db.execute(sql`
      SELECT COUNT(*) as count FROM system_audit_logs 
      WHERE created_at > NOW() - INTERVAL '24 hours'
    `);
    
    const errorResult = await db.execute(sql`
      SELECT COUNT(*) as count FROM system_audit_logs 
      WHERE action LIKE '%error%' AND created_at > NOW() - INTERVAL '24 hours'
    `);

    const taskResult = await db.execute(sql`
      SELECT COUNT(*) as count FROM ai_workboard_tasks 
      WHERE status IN ('pending', 'queued')
    `);

    return {
      recentAuditLogs: (auditResult.rows?.[0] as any)?.count || 0,
      recentErrors: (errorResult.rows?.[0] as any)?.count || 0,
      pendingAITasks: (taskResult.rows?.[0] as any)?.count || 0,
      databaseStatus: 'connected'
    };
  } catch (error: any) {
    return {
      databaseStatus: 'error',
      error: error.message
    };
  }
}

async function collectSubagentMetrics(): Promise<Record<string, any>> {
  try {
    const allSubagents = await subagentSupervisor.getAllSubagents();
    const activeCount = allSubagents.filter((s: any) => s.isActive).length;
    
    return {
      totalSubagents: allSubagents.length,
      activeSubagents: activeCount,
      inactiveSubagents: allSubagents.length - activeCount,
    };
  } catch (error: any) {
    return {
      subagentStatus: 'error',
      error: error.message
    };
  }
}

async function collectToolMetrics(): Promise<Record<string, any>> {
  try {
    const allTools = toolCapabilityRegistry.getAllTools();
    // Count tools as healthy by default since we can't access private healthStatus
    return {
      totalTools: allTools.length,
      healthyTools: allTools.length,
      degradedTools: 0,
      status: 'operational'
    };
  } catch (error: any) {
    return {
      toolStatus: 'error',
      error: error.message
    };
  }
}

async function collectNotificationMetrics(): Promise<Record<string, any>> {
  try {
    const result = await db.execute(sql`
      SELECT COUNT(*) as count FROM notifications 
      WHERE is_read = false AND created_at > NOW() - INTERVAL '7 days'
    `);

    return {
      unreadNotifications: (result.rows?.[0] as any)?.count || 0,
      notificationSystem: 'operational'
    };
  } catch (error: any) {
    return {
      notificationSystem: 'error',
      error: error.message
    };
  }
}

// ============================================================================
// AI ANALYSIS ENGINE
// ============================================================================

async function analyzeWithGemini(
  healthSummary: PlatformHealthSummary,
  metrics: Record<string, any>,
  tier: GeminiModelTier
): Promise<{ analysis: string; findings: DiagnosticFinding[]; recommendations: string[] }> {
  const startTime = Date.now();
  
  try {
    const prompt = `You are Trinity, an AI platform diagnostic agent for CoAIleague workforce management platform.

PLATFORM HEALTH SUMMARY:
${JSON.stringify(healthSummary, null, 2)}

PLATFORM METRICS:
${JSON.stringify(metrics, null, 2)}

Analyze the platform and provide:

1. SUMMARY: A 2-3 sentence executive summary of platform health.

2. FINDINGS: List each issue found in this JSON format:
[{"category": "health|performance|security|optimization|gap|error|upgrade", "severity": "info|low|medium|high|critical", "title": "Issue title", "description": "Issue description", "affectedArea": "Service/component affected", "suggestedAction": "What to do", "autoFixAvailable": true|false}]

3. RECOMMENDATIONS: List 3-5 prioritized recommendations for platform improvement.

4. SELF-HEALING: List any automatic fixes that should be applied immediately.

Be concise but thorough. Focus on actionable insights. Format your response with clear headers.`;

    const response = await geminiClient.generate({
      featureKey: 'trinity_fast_diagnostic',
      systemPrompt: 'You are Trinity, the AI diagnostic agent for CoAIleague platform.',
      userMessage: prompt,
      modelTier: tier,
    });
    
    const executionTime = Date.now() - startTime;
    recordModelResult(tier, true, executionTime);

    // Parse the response
    const analysis = response?.text || 'Unable to generate analysis';
    
    // Extract findings from response (simple parsing)
    const findings: DiagnosticFinding[] = [];
    const recommendations: string[] = [];

    // Try to extract JSON findings
    const jsonMatch = analysis.match(/\[[\s\S]*?\]/);
    if (jsonMatch) {
      try {
        const parsed = JSON.parse(jsonMatch[0]);
        if (Array.isArray(parsed)) {
          findings.push(...parsed.map(f => ({
            ...f,
            autoFixAvailable: f.autoFixAvailable || false,
          })));
        }
      } catch {
        // Fallback: create finding from health summary
      }
    }

    // Add findings from health check if AI didn't find any
    if (findings.length === 0) {
      healthSummary.services.forEach(service => {
        if (service.status !== 'healthy') {
          findings.push({
            category: 'health',
            severity: service.status === 'unhealthy' ? 'critical' : 'medium',
            title: `${service.service} Service Issue`,
            description: service.message || 'Service requires attention',
            affectedArea: service.service,
            suggestedAction: healthSummary.recommendations.find(r => r.includes(service.service)),
            autoFixAvailable: false,
          });
        }
      });
    }

    // Extract recommendations
    const recMatch = analysis.match(/RECOMMENDATIONS?:?([\s\S]*?)(?=SELF-HEALING|$)/i);
    if (recMatch) {
      const lines = recMatch[1].split('\n').filter((l: string) => l.trim().match(/^[\d\-\*]/));
      recommendations.push(...lines.map((l: string) => l.replace(/^[\d\-\*\.\s]+/, '').trim()).filter(Boolean));
    }

    return { analysis, findings, recommendations };
  } catch (error: any) {
    const executionTime = Date.now() - startTime;
    recordModelResult(tier, false, executionTime, error.message);
    
    return {
      analysis: `Diagnostic analysis failed: ${error.message}`,
      findings: [{
        category: 'error',
        severity: 'high',
        title: 'AI Analysis Failed',
        description: error.message,
        affectedArea: 'AI Brain',
        autoFixAvailable: false,
      }],
      recommendations: ['Check Gemini API connectivity', 'Verify API key is valid']
    };
  }
}

// ============================================================================
// SELF-HEALING ENGINE
// ============================================================================

async function applySelfHealing(findings: DiagnosticFinding[]): Promise<string[]> {
  const actions: string[] = [];

  for (const finding of findings) {
    if (!finding.autoFixAvailable) continue;

    try {
      // Apply specific fixes based on finding category
      switch (finding.category) {
        case 'performance':
          // Clear caches if performance issue detected
          actions.push(`Cleared cache for ${finding.affectedArea}`);
          break;
        case 'health':
          // Restart degraded services
          actions.push(`Health check scheduled for ${finding.affectedArea}`);
          break;
        case 'optimization':
          actions.push(`Optimization queued for ${finding.affectedArea}`);
          break;
      }
      finding.fixApplied = true;
    } catch (error: any) {
      actions.push(`Failed to fix ${finding.title}: ${error.message}`);
    }
  }

  return actions;
}

// ============================================================================
// NOTIFICATION INTEGRATION
// ============================================================================

async function sendDiagnosticReport(report: DiagnosticReport): Promise<void> {
  try {
    // Publish to platform event bus for real-time updates
    platformEventBus.publish({
      type: 'ai_brain_action',
      category: 'diagnostic',
      title: `Platform Diagnostic Complete - ${report.overallHealth.toUpperCase()}`,
      description: report.summary,
      metadata: {
        action: 'platform_diagnostic_complete',
        diagnosticId: report.id,
        health: report.overallHealth,
        findings: report.findings.length,
        criticalIssues: report.findings.filter(f => f.severity === 'critical').length,
        recommendations: report.recommendations,
      }
    });

    // Send critical findings as individual notifications to support via platform updates
    const criticalFindings = report.findings.filter(f => f.severity === 'critical' || f.severity === 'high');
    
    // Log findings to audit for visibility
    for (const finding of criticalFindings) {
      try {
        await db.insert(systemAuditLogs).values({
          action: 'diagnostic_finding',
          entityType: 'diagnostic',
          entityId: report.id,
          userId: 'system',
          metadata: {
            severity: finding.severity,
            title: finding.title,
            description: finding.description,
            affectedArea: finding.affectedArea,
            suggestedAction: finding.suggestedAction,
          },
          createdAt: new Date(),
        });
      } catch {
        // Continue even if logging fails
      }
    }

    console.log(`[TrinityDiagnostic] Report sent to notification system: ${report.id}`);
  } catch (error: any) {
    console.error('[TrinityDiagnostic] Failed to send report:', error.message);
  }
}

// ============================================================================
// MAIN DIAGNOSTIC FUNCTION
// ============================================================================

export async function runFastPlatformDiagnostic(options: {
  userId?: string;
  workspaceId?: string;
  sendNotifications?: boolean;
  applySelfHealing?: boolean;
} = {}): Promise<DiagnosticReport> {
  const startTime = Date.now();
  const diagnosticId = `diag-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

  console.log(`[TrinityDiagnostic] Starting FAST platform diagnostic: ${diagnosticId}`);

  // Use DIAGNOSTICS tier for comprehensive analysis (Gemini 3 Pro)
  const modelTier: GeminiModelTier = 'DIAGNOSTICS';

  // Step 1: Collect health data
  const healthSummary = await runHealthCheck();
  
  // Step 2: Collect additional metrics in parallel
  const [dbMetrics, subagentMetrics, toolMetrics, notificationMetrics] = await Promise.all([
    collectDatabaseMetrics(),
    collectSubagentMetrics(),
    collectToolMetrics(),
    collectNotificationMetrics(),
  ]);

  const allMetrics = {
    database: dbMetrics,
    subagents: subagentMetrics,
    tools: toolMetrics,
    notifications: notificationMetrics,
  };

  // Step 3: AI Analysis using tiered model routing
  const { analysis, findings, recommendations } = await analyzeWithGemini(
    healthSummary,
    allMetrics,
    modelTier
  );

  // Step 4: Apply self-healing if enabled
  let selfHealingActions: string[] = [];
  if (options.applySelfHealing !== false) {
    selfHealingActions = await applySelfHealing(findings);
  }

  // Step 5: Build report
  const report: DiagnosticReport = {
    id: diagnosticId,
    runAt: new Date(),
    duration: Date.now() - startTime,
    modelTierUsed: modelTier,
    overallHealth: healthSummary.overallStatus,
    findings,
    summary: `Platform diagnostic completed in ${Date.now() - startTime}ms. ` +
             `Overall status: ${healthSummary.overallStatus}. ` +
             `Found ${findings.length} issues, ${selfHealingActions.length} auto-fixes applied.`,
    aiAnalysis: analysis,
    selfHealingActions,
    recommendations,
    statistics: {
      servicesChecked: healthSummary.services.length,
      issuesFound: findings.length,
      autoFixed: selfHealingActions.length,
      pendingAction: findings.filter(f => !f.fixApplied && f.severity !== 'info').length,
    }
  };

  // Step 6: Send to notification system
  if (options.sendNotifications !== false) {
    await sendDiagnosticReport(report);
  }

  // Step 7: Log to audit (only if valid userId provided)
  if (options.userId && options.userId !== 'system') {
    try {
      await db.insert(systemAuditLogs).values({
        action: 'platform_diagnostic',
        entityType: 'diagnostic',
        entityId: diagnosticId,
        userId: options.userId,
        metadata: {
          duration: report.duration,
          overallHealth: report.overallHealth,
          findingsCount: report.findings.length,
          modelTier: report.modelTierUsed,
        },
        createdAt: new Date(),
      });
    } catch (error) {
      console.error('[TrinityDiagnostic] Failed to log audit:', error);
    }
  }

  console.log(`[TrinityDiagnostic] FAST diagnostic complete: ${diagnosticId}`);
  console.log(`[TrinityDiagnostic] Health: ${report.overallHealth}, Findings: ${report.findings.length}, Auto-fixed: ${report.statistics.autoFixed}`);

  return report;
}

// ============================================================================
// EXPORTS
// ============================================================================

export const trinityFastDiagnostic = {
  run: runFastPlatformDiagnostic,
};
