/**
 * GAP INTELLIGENCE SERVICE - Trinity Autonomous Issue Detection
 * ==============================================================
 * Periodic scanners that autonomously detect platform issues:
 * - TypeScript/LSP errors
 * - Schema mismatches
 * - Code gaps and missing handlers
 * - React hook issues
 * - Runtime log errors
 * 
 * Runs on configurable schedules and stores findings in aiGapFindings table.
 * Part of Trinity's Full Platform Awareness initiative.
 */

import cron from 'node-cron';
import { db } from '../../db';
import { aiGapFindings, aiWorkflowApprovals } from '@shared/schema';
import { eq, and, desc, sql, gte, lt } from 'drizzle-orm';
import { exec } from 'child_process';
import { promisify } from 'util';
import * as fs from 'fs';
import * as path from 'path';
import {
  schemaOpsSubagent,
  logOpsSubagent,
  handlerOpsSubagent,
  hookOpsSubagent,
  persistGapFinding,
  persistGapFindings,
  GapFinding,
} from './subagents/domainOpsSubagents';
import { helpaiOrchestrator } from '../helpai/helpaiActionOrchestrator';
import { platformEventBus, PlatformEvent } from '../platformEventBus';

const execAsync = promisify(exec);

// ============================================================================
// CONFIGURATION
// ============================================================================

interface GapIntelligenceConfig {
  enabled: boolean;
  schedules: {
    typescript: string;
    schema: string;
    handlers: string;
    hooks: string;
    logs: string;
    fullScan: string;
  };
  maxFindingsPerScan: number;
  autoApproveThreshold: number;
}

const DEFAULT_CONFIG: GapIntelligenceConfig = {
  enabled: true,
  schedules: {
    typescript: '0 */2 * * *',
    schema: '0 */6 * * *',
    handlers: '0 */4 * * *',
    hooks: '0 */4 * * *',
    logs: '*/30 * * * *',
    fullScan: '0 3 * * *',
  },
  maxFindingsPerScan: 100,
  autoApproveThreshold: 0.95,
};

// ============================================================================
// GAP INTELLIGENCE SERVICE
// ============================================================================

class GapIntelligenceService {
  private static instance: GapIntelligenceService;
  private config: GapIntelligenceConfig;
  private scheduledJobs: Map<string, cron.ScheduledTask> = new Map();
  private isRunning: boolean = false;
  private lastScanResults: Map<string, { timestamp: Date; findingsCount: number }> = new Map();

  private constructor() {
    this.config = { ...DEFAULT_CONFIG };
  }

  static getInstance(): GapIntelligenceService {
    if (!this.instance) {
      this.instance = new GapIntelligenceService();
    }
    return this.instance;
  }

  // ==========================================================================
  // CAPABILITY CHECKS
  // ==========================================================================

  private isGeminiAvailable(): boolean {
    return !!process.env.GEMINI_API_KEY;
  }

  // ==========================================================================
  // TYPESCRIPT/LSP ERROR SCANNER
  // ==========================================================================

  async scanTypeScriptErrors(): Promise<GapFinding[]> {
    console.log('[GapIntelligence] Scanning for TypeScript errors...');
    const findings: GapFinding[] = [];

    try {
      let output = '';
      try {
        const result = await execAsync('npx tsc --noEmit --pretty false', {
          cwd: process.cwd(),
          timeout: 180000,
          maxBuffer: 10 * 1024 * 1024,
        });
        output = result.stdout + result.stderr;
      } catch (execError: any) {
        output = (execError.stdout || '') + (execError.stderr || '');
        if (!output && execError.message) {
          console.log('[GapIntelligence] tsc execution failed:', execError.message);
        }
      }

      if (!output.trim()) {
        console.log('[GapIntelligence] No TypeScript errors found');
        this.lastScanResults.set('typescript', {
          timestamp: new Date(),
          findingsCount: 0,
        });
        return [];
      }

      const errorLines = output.split('\n').filter(line => 
        line.includes('error TS') || /\.tsx?\(\d+,\d+\)/.test(line)
      );

      for (const line of errorLines.slice(0, this.config.maxFindingsPerScan)) {
        const match = line.match(/^(.+?)\((\d+),(\d+)\):\s*error\s+(TS\d+):\s*(.+)$/);
        if (match) {
          const [, filePath, lineNum, colNum, errorCode, message] = match;
          
          findings.push({
            filePath: filePath.trim(),
            lineNumber: parseInt(lineNum, 10),
            columnNumber: parseInt(colNum, 10),
            gapType: 'typescript_error',
            severity: 'error',
            title: `${errorCode}: ${message.substring(0, 100)}`,
            description: message,
            technicalDetails: `TypeScript compiler error at line ${lineNum}, column ${colNum}`,
            suggestedFix: this.suggestTypeScriptFix(errorCode, message),
            detectionMethod: 'tsc_noEmit',
            confidence: 1.0,
          });
        }
      }

      console.log(`[GapIntelligence] Found ${findings.length} TypeScript errors`);
      
      if (findings.length > 0) {
        const persistedIds = await persistGapFindings(findings, 'GapIntelligence:TypeScript');
        if (persistedIds.length > 0) {
          await this.emitScanEvent('typescript_scan', {
            totalFindings: findings.length,
            newFindings: persistedIds.length,
            criticalCount: 0,
            errorCount: findings.length,
            warningCount: 0,
            infoCount: 0,
            scanDuration: 0,
          });
        }
      }

      this.lastScanResults.set('typescript', {
        timestamp: new Date(),
        findingsCount: findings.length,
      });

      return findings;
    } catch (error) {
      console.error('[GapIntelligence] TypeScript scan error:', error);
      return [];
    }
  }

  private suggestTypeScriptFix(errorCode: string, message: string): string {
    const fixes: Record<string, string> = {
      'TS2304': 'Import the missing type or variable, or install @types package',
      'TS2339': 'Check if property exists on the type, or add type assertion',
      'TS2345': 'Ensure argument types match parameter types',
      'TS2322': 'Check type compatibility and add proper type annotations',
      'TS2531': 'Add null check or use optional chaining (?.) operator',
      'TS2532': 'Add undefined check or use optional chaining (?.) operator',
      'TS7006': 'Add explicit type annotation to parameter',
      'TS2307': 'Install missing module or check import path',
      'TS18046': 'Handle the unknown type by narrowing with type guard',
    };
    return fixes[errorCode] || 'Review the error message and fix the type issue';
  }

  // ==========================================================================
  // SCHEMA SCANNER
  // ==========================================================================

  async scanSchemaIssues(): Promise<GapFinding[]> {
    console.log('[GapIntelligence] Scanning for schema issues...');
    const findings: GapFinding[] = [];

    try {
      try {
        const mismatches = await schemaOpsSubagent.detectSchemaMismatches();
        findings.push(...mismatches);
      } catch (mismatchError) {
        console.warn('[GapIntelligence] Schema mismatch detection failed:', mismatchError);
      }

      try {
        const relationships = await schemaOpsSubagent.analyzeRelationships();
        findings.push(...relationships);
      } catch (relationshipError) {
        console.warn('[GapIntelligence] Relationship analysis failed:', relationshipError);
      }

      if (findings.length > 0) {
        const persistedIds = await persistGapFindings(findings, 'GapIntelligence:Schema');
        if (persistedIds.length > 0) {
          await this.emitScanEvent('schema_scan', {
            totalFindings: findings.length,
            newFindings: persistedIds.length,
            criticalCount: 0,
            errorCount: findings.filter(f => f.severity === 'error').length,
            warningCount: findings.filter(f => f.severity === 'warning').length,
            infoCount: findings.filter(f => f.severity === 'info').length,
            scanDuration: 0,
          });
        }
      }

      this.lastScanResults.set('schema', {
        timestamp: new Date(),
        findingsCount: findings.length,
      });

      console.log(`[GapIntelligence] Found ${findings.length} schema issues`);
      return findings;
    } catch (error) {
      console.error('[GapIntelligence] Schema scan error:', error);
      return [];
    }
  }

  // ==========================================================================
  // HANDLER/ROUTE SCANNER
  // ==========================================================================

  async scanHandlerGaps(): Promise<GapFinding[]> {
    console.log('[GapIntelligence] Scanning for handler gaps...');
    const findings: GapFinding[] = [];

    try {
      try {
        const gaps = await handlerOpsSubagent.detectUnmatchedRoutes();
        findings.push(...gaps);
      } catch (gapError) {
        console.warn('[GapIntelligence] Handler gap detection failed:', gapError);
      }

      if (findings.length > 0) {
        await persistGapFindings(findings, 'GapIntelligence:Handlers');
      }

      this.lastScanResults.set('handlers', {
        timestamp: new Date(),
        findingsCount: findings.length,
      });

      console.log(`[GapIntelligence] Found ${findings.length} handler gaps`);
      return findings;
    } catch (error) {
      console.error('[GapIntelligence] Handler scan error:', error);
      return [];
    }
  }

  // ==========================================================================
  // HOOK SCANNER
  // ==========================================================================

  async scanHookIssues(): Promise<GapFinding[]> {
    console.log('[GapIntelligence] Scanning for hook issues...');
    const findings: GapFinding[] = [];

    try {
      try {
        const issues = await hookOpsSubagent.detectHookIssues();
        findings.push(...issues);
      } catch (hookError) {
        console.warn('[GapIntelligence] Hook issue detection failed:', hookError);
      }

      if (findings.length > 0) {
        await persistGapFindings(findings, 'GapIntelligence:Hooks');
      }

      this.lastScanResults.set('hooks', {
        timestamp: new Date(),
        findingsCount: findings.length,
      });

      console.log(`[GapIntelligence] Found ${findings.length} hook issues`);
      return findings;
    } catch (error) {
      console.error('[GapIntelligence] Hook scan error:', error);
      return [];
    }
  }

  // ==========================================================================
  // LOG SCANNER
  // ==========================================================================

  async scanRecentLogs(): Promise<GapFinding[]> {
    console.log('[GapIntelligence] Scanning recent logs for errors...');

    try {
      const logPaths = ['/tmp/logs', 'logs'];
      const allContent: string[] = [];
      const sources: string[] = [];
      const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);

      for (const logDir of logPaths) {
        if (!fs.existsSync(logDir)) continue;

        const files = fs.readdirSync(logDir)
          .filter(f => f.endsWith('.log'))
          .slice(-10);
        
        for (const file of files) {
          try {
            const logPath = path.join(logDir, file);
            const stat = fs.statSync(logPath);
            
            if (stat.mtime < oneHourAgo) continue;

            const content = fs.readFileSync(logPath, 'utf-8');
            allContent.push(content);
            sources.push(logPath);
          } catch (fileError) {
            console.warn(`[GapIntelligence] Could not read log file ${file}:`, fileError);
          }
        }
      }

      if (allContent.length === 0) {
        console.log('[GapIntelligence] No recent log files to analyze');
        this.lastScanResults.set('logs', { timestamp: new Date(), findingsCount: 0 });
        return [];
      }

      const combinedContent = allContent.join('\n---LOG BOUNDARY---\n');
      const findings = await logOpsSubagent.analyzeLogContent(combinedContent, sources.join(', '));
      const limitedFindings = findings.slice(0, this.config.maxFindingsPerScan);

      this.lastScanResults.set('logs', {
        timestamp: new Date(),
        findingsCount: limitedFindings.length,
      });

      console.log(`[GapIntelligence] Found ${limitedFindings.length} log issues`);
      return limitedFindings;
    } catch (error) {
      console.error('[GapIntelligence] Log scan error:', error);
      return [];
    }
  }

  // ==========================================================================
  // FULL PLATFORM SCAN
  // ==========================================================================

  async runFullPlatformScan(): Promise<{
    typescript: GapFinding[];
    schema: GapFinding[];
    handlers: GapFinding[];
    hooks: GapFinding[];
    logs: GapFinding[];
    summary: {
      totalFindings: number;
      criticalCount: number;
      errorCount: number;
      warningCount: number;
      infoCount: number;
      scanDuration: number;
    };
  }> {
    console.log('[GapIntelligence] Starting full platform scan...');
    const startTime = Date.now();

    const [typescript, schema, handlers, hooks, logs] = await Promise.all([
      this.scanTypeScriptErrors(),
      this.scanSchemaIssues(),
      this.scanHandlerGaps(),
      this.scanHookIssues(),
      this.scanRecentLogs(),
    ]);

    const allFindings = [...typescript, ...schema, ...handlers, ...hooks, ...logs];
    
    const summary = {
      totalFindings: allFindings.length,
      criticalCount: allFindings.filter(f => f.severity === 'critical' || f.severity === 'blocker').length,
      errorCount: allFindings.filter(f => f.severity === 'error').length,
      warningCount: allFindings.filter(f => f.severity === 'warning').length,
      infoCount: allFindings.filter(f => f.severity === 'info').length,
      scanDuration: Date.now() - startTime,
    };

    await this.emitScanEvent('full_platform_scan', summary);

    console.log(`[GapIntelligence] Full scan complete: ${summary.totalFindings} findings in ${summary.scanDuration}ms`);

    return { typescript, schema, handlers, hooks, logs, summary };
  }

  // ==========================================================================
  // FINDINGS MANAGEMENT
  // ==========================================================================

  async getOpenFindings(limit: number = 50): Promise<any[]> {
    return db
      .select()
      .from(aiGapFindings)
      .where(eq(aiGapFindings.status, 'open'))
      .orderBy(desc(aiGapFindings.createdAt))
      .limit(limit);
  }

  /**
   * Get gap findings formatted for the Universal Notification System (UNS)
   * Returns actionable notifications for platform support roles
   */
  async getGapFindingsForUNS(limit: number = 20): Promise<Array<{
    id: string;
    title: string;
    message: string;
    priority: 'critical' | 'high' | 'medium' | 'info';
    category: 'system_alerts' | 'for_you';
    subCategory: string;
    serviceSource: string;
    statusTag: string;
    isRead: boolean;
    createdAt: Date;
    actions: Array<{
      label: string;
      type: 'orchestration' | 'navigate' | 'api_call';
      target: string;
      variant: 'primary' | 'secondary' | 'ghost';
    }>;
    metadata: Record<string, any>;
  }>> {
    const openFindings = await this.getOpenFindings(limit);
    
    return openFindings.map(finding => {
      // Map severity to priority
      const priorityMap: Record<string, 'critical' | 'high' | 'medium' | 'info'> = {
        'critical': 'critical',
        'blocker': 'critical',
        'error': 'high',
        'warning': 'medium',
        'info': 'info',
      };
      
      // Map gap type to human-readable category
      const gapTypeLabels: Record<string, string> = {
        'schema_mismatch': 'Schema Issue',
        'performance_issue': 'Performance Issue',
        'typescript_error': 'Code Error',
        'handler_gap': 'Handler Gap',
        'hook_issue': 'Hook Issue',
        'log_error': 'Runtime Error',
      };
      
      // Generate end-user friendly message
      const userMessage = finding.endUserSummary || 
        `Found ${gapTypeLabels[finding.gapType] || finding.gapType}: ${finding.title}`;
      
      return {
        id: `gap-finding-${finding.id}`,
        title: `Trinity: ${gapTypeLabels[finding.gapType] || 'Issue'} Detected`,
        message: userMessage,
        priority: priorityMap[finding.severity] || 'medium',
        category: 'system_alerts' as const,
        subCategory: 'trinity_analysis',
        serviceSource: 'Gap Intelligence',
        statusTag: finding.status === 'open' ? 'ACTION REQUIRED' : 'IN PROGRESS',
        isRead: false,
        createdAt: finding.createdAt,
        actions: [
          {
            label: 'Approve Fix',
            type: 'orchestration' as const,
            target: `gap_intelligence.approve_fix:${finding.id}`,
            variant: 'primary' as const,
          },
          {
            label: 'View Details',
            type: 'navigate' as const,
            target: `/diagnostics?findingId=${finding.id}`,
            variant: 'secondary' as const,
          },
          {
            label: 'Dismiss',
            type: 'orchestration' as const,
            target: `gap_intelligence.dismiss:${finding.id}`,
            variant: 'ghost' as const,
          },
        ],
        metadata: {
          findingId: finding.id,
          gapType: finding.gapType,
          severity: finding.severity,
          filePath: finding.filePath,
          lineNumber: finding.lineNumber,
          suggestedFix: finding.suggestedFix,
          detectedBy: finding.detectedBy,
          domain: finding.domain,
        },
      };
    });
  }

  async getCriticalFindings(): Promise<any[]> {
    return db
      .select()
      .from(aiGapFindings)
      .where(and(
        eq(aiGapFindings.status, 'open'),
        sql`${aiGapFindings.severity} IN ('critical', 'blocker', 'error')`
      ))
      .orderBy(desc(aiGapFindings.lastDetectedAt));
  }

  async markFindingResolved(findingId: number, resolvedBy: string): Promise<boolean> {
    try {
      await db
        .update(aiGapFindings)
        .set({
          status: 'resolved',
          resolvedAt: new Date(),
          resolvedBy,
        })
        .where(eq(aiGapFindings.id, findingId));
      return true;
    } catch (error) {
      console.error('[GapIntelligence] Error marking finding resolved:', error);
      return false;
    }
  }

  async markFindingInProgress(findingId: number, assignedTo: string): Promise<boolean> {
    try {
      await db
        .update(aiGapFindings)
        .set({
          status: 'in_progress',
          assignedTo,
        })
        .where(eq(aiGapFindings.id, findingId));
      return true;
    } catch (error) {
      console.error('[GapIntelligence] Error marking finding in progress:', error);
      return false;
    }
  }

  // ==========================================================================
  // SCHEDULER MANAGEMENT
  // ==========================================================================

  startScheduledScans(): void {
    if (this.isRunning) {
      console.log('[GapIntelligence] Scheduler already running');
      return;
    }

    console.log('[GapIntelligence] Starting scheduled scans...');

    const typescriptJob = cron.schedule(this.config.schedules.typescript, async () => {
      console.log('[GapIntelligence] Running scheduled TypeScript scan');
      await this.scanTypeScriptErrors();
    });
    this.scheduledJobs.set('typescript', typescriptJob);

    const schemaJob = cron.schedule(this.config.schedules.schema, async () => {
      console.log('[GapIntelligence] Running scheduled schema scan');
      await this.scanSchemaIssues();
    });
    this.scheduledJobs.set('schema', schemaJob);

    const handlersJob = cron.schedule(this.config.schedules.handlers, async () => {
      console.log('[GapIntelligence] Running scheduled handler scan');
      await this.scanHandlerGaps();
    });
    this.scheduledJobs.set('handlers', handlersJob);

    const hooksJob = cron.schedule(this.config.schedules.hooks, async () => {
      console.log('[GapIntelligence] Running scheduled hook scan');
      await this.scanHookIssues();
    });
    this.scheduledJobs.set('hooks', hooksJob);

    const logsJob = cron.schedule(this.config.schedules.logs, async () => {
      console.log('[GapIntelligence] Running scheduled log scan');
      await this.scanRecentLogs();
    });
    this.scheduledJobs.set('logs', logsJob);

    const fullScanJob = cron.schedule(this.config.schedules.fullScan, async () => {
      console.log('[GapIntelligence] Running scheduled full platform scan');
      await this.runFullPlatformScan();
    });
    this.scheduledJobs.set('fullScan', fullScanJob);

    this.isRunning = true;
    console.log('[GapIntelligence] All scheduled scans started');
  }

  stopScheduledScans(): void {
    console.log('[GapIntelligence] Stopping scheduled scans...');
    
    for (const [name, job] of this.scheduledJobs) {
      job.stop();
      console.log(`[GapIntelligence] Stopped ${name} scan`);
    }
    
    this.scheduledJobs.clear();
    this.isRunning = false;
    console.log('[GapIntelligence] All scheduled scans stopped');
  }

  getSchedulerStatus(): {
    isRunning: boolean;
    scheduledJobs: string[];
    lastScanResults: Record<string, { timestamp: Date; findingsCount: number }>;
    config: GapIntelligenceConfig;
  } {
    return {
      isRunning: this.isRunning,
      scheduledJobs: Array.from(this.scheduledJobs.keys()),
      lastScanResults: Object.fromEntries(this.lastScanResults),
      config: this.config,
    };
  }

  // ==========================================================================
  // EVENT EMISSION
  // ==========================================================================

  private async emitScanEvent(scanType: string, summary: any): Promise<void> {
    const event: PlatformEvent = {
      type: 'gap_intelligence_scan',
      category: 'improvement',
      title: `Gap Intelligence: ${scanType} Complete`,
      description: `Found ${summary.totalFindings} issues (${summary.criticalCount} critical, ${summary.errorCount} errors)`,
      metadata: {
        scanType,
        ...summary,
        timestamp: new Date().toISOString(),
      },
      visibility: 'admin',
    };

    try {
      await platformEventBus.publish(event);
    } catch (error) {
      console.error('[GapIntelligence] Failed to emit scan event:', error);
    }
  }

  // ==========================================================================
  // AI BRAIN ACTIONS
  // ==========================================================================

  registerActions(): void {
    helpaiOrchestrator.registerAction('gap_intelligence.scan_typescript', {
      handler: async () => {
        const findings = await this.scanTypeScriptErrors();
        return {
          success: true,
          data: findings,
          count: findings.length,
          message: `Found ${findings.length} TypeScript errors`,
        };
      },
      category: 'gap_intelligence',
      description: 'Scan for TypeScript/LSP errors in the codebase',
      parameters: {},
      requiredRole: 'support_engineer',
    });

    helpaiOrchestrator.registerAction('gap_intelligence.scan_schema', {
      handler: async () => {
        const findings = await this.scanSchemaIssues();
        return {
          success: true,
          data: findings,
          count: findings.length,
          message: `Found ${findings.length} schema issues`,
        };
      },
      category: 'gap_intelligence',
      description: 'Scan for schema mismatches and relationship issues',
      parameters: {},
      requiredRole: 'support_engineer',
    });

    helpaiOrchestrator.registerAction('gap_intelligence.scan_handlers', {
      handler: async () => {
        const findings = await this.scanHandlerGaps();
        return {
          success: true,
          data: findings,
          count: findings.length,
          message: `Found ${findings.length} handler gaps`,
        };
      },
      category: 'gap_intelligence',
      description: 'Scan for unmatched routes and handler gaps',
      parameters: {},
      requiredRole: 'support_engineer',
    });

    helpaiOrchestrator.registerAction('gap_intelligence.scan_hooks', {
      handler: async () => {
        const findings = await this.scanHookIssues();
        return {
          success: true,
          data: findings,
          count: findings.length,
          message: `Found ${findings.length} hook issues`,
        };
      },
      category: 'gap_intelligence',
      description: 'Scan for React hook issues',
      parameters: {},
      requiredRole: 'support_engineer',
    });

    helpaiOrchestrator.registerAction('gap_intelligence.scan_logs', {
      handler: async () => {
        const findings = await this.scanRecentLogs();
        return {
          success: true,
          data: findings,
          count: findings.length,
          message: `Found ${findings.length} log issues`,
        };
      },
      category: 'gap_intelligence',
      description: 'Scan recent logs for errors and issues',
      parameters: {},
      requiredRole: 'support_engineer',
    });

    helpaiOrchestrator.registerAction('gap_intelligence.full_scan', {
      handler: async () => {
        const results = await this.runFullPlatformScan();
        return {
          success: true,
          data: results.summary,
          typescript: results.typescript.length,
          schema: results.schema.length,
          handlers: results.handlers.length,
          hooks: results.hooks.length,
          logs: results.logs.length,
          message: `Full scan complete: ${results.summary.totalFindings} findings`,
        };
      },
      category: 'gap_intelligence',
      description: 'Run a complete platform-wide gap analysis',
      parameters: {},
      requiredRole: 'support_engineer',
    });

    helpaiOrchestrator.registerAction('gap_intelligence.get_findings', {
      handler: async (params) => {
        const critical = params?.critical === true;
        const findings = critical 
          ? await this.getCriticalFindings()
          : await this.getOpenFindings(params?.limit || 50);
        return {
          success: true,
          data: findings,
          count: findings.length,
          message: `Retrieved ${findings.length} ${critical ? 'critical ' : ''}findings`,
        };
      },
      category: 'gap_intelligence',
      description: 'Get open gap findings from the database',
      parameters: { critical: 'boolean (optional)', limit: 'number (optional)' },
      requiredRole: 'employee',
    });

    helpaiOrchestrator.registerAction('gap_intelligence.resolve_finding', {
      handler: async (params) => {
        const { findingId, resolvedBy } = params;
        const success = await this.markFindingResolved(findingId, resolvedBy || 'Trinity');
        return {
          success,
          message: success ? 'Finding marked as resolved' : 'Failed to resolve finding',
        };
      },
      category: 'gap_intelligence',
      description: 'Mark a gap finding as resolved',
      parameters: { findingId: 'number', resolvedBy: 'string (optional)' },
      requiredRole: 'support_engineer',
    });

    helpaiOrchestrator.registerAction('gap_intelligence.scheduler_status', {
      handler: async () => {
        const status = this.getSchedulerStatus();
        return {
          success: true,
          data: status,
          message: status.isRunning ? 'Scheduler is running' : 'Scheduler is stopped',
        };
      },
      category: 'gap_intelligence',
      description: 'Get the status of the gap intelligence scheduler',
      parameters: {},
      requiredRole: 'employee',
    });

    helpaiOrchestrator.registerAction('gap_intelligence.start_scheduler', {
      handler: async () => {
        this.startScheduledScans();
        return {
          success: true,
          message: 'Gap intelligence scheduler started',
        };
      },
      category: 'gap_intelligence',
      description: 'Start the scheduled gap intelligence scans',
      parameters: {},
      requiredRole: 'platform_admin',
    });

    helpaiOrchestrator.registerAction('gap_intelligence.stop_scheduler', {
      handler: async () => {
        this.stopScheduledScans();
        return {
          success: true,
          message: 'Gap intelligence scheduler stopped',
        };
      },
      category: 'gap_intelligence',
      description: 'Stop the scheduled gap intelligence scans',
      parameters: {},
      requiredRole: 'platform_admin',
    });

    console.log('[GapIntelligence] Registered 11 AI Brain actions');
  }
}

// ============================================================================
// EXPORTS
// ============================================================================

export const gapIntelligenceService = GapIntelligenceService.getInstance();

export async function initializeGapIntelligence(): Promise<void> {
  console.log('[GapIntelligence] Initializing Gap Intelligence Service...');
  gapIntelligenceService.registerActions();
  gapIntelligenceService.startScheduledScans();
  console.log('[GapIntelligence] Gap Intelligence Service initialized');
}

export { GapIntelligenceService };
