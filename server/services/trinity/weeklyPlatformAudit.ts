/**
 * WEEKLY PLATFORM AUDIT SERVICE
 * ==============================
 * Trinity's autonomous platform health monitoring system.
 * Runs comprehensive audits using Visual QA, Scan Orchestrator, and API validation.
 * 
 * Detects:
 * - Aesthetic/UI issues (overlapping elements, z-index problems)
 * - Placeholder/mock data in production paths
 * - Failing APIs and missing endpoints
 * - Broken buttons, links, and navigation
 * - Performance regressions
 * - Security vulnerabilities
 * 
 * Generates weekly reports for review and automated fix suggestions.
 */

import { db } from '../../db';
import { eq, desc, sql } from 'drizzle-orm';
import { visualQaSubagent, VisualAnomaly } from '../ai-brain/subagents/visualQaSubagent';
import { trinityScanOrchestrator, ScanResult, LearnedPattern } from '../ai-brain/trinityScanOrchestrator';
import { browserAutomationTool } from '../ai-brain/browserAutomationTool';
import { geminiClient } from '../ai-brain/providers/geminiClient';
import { ExecutionPipeline } from '../executionPipeline';
import { getAppBaseUrl } from '../../utils/getAppBaseUrl';
import { typedQuery } from '../../lib/typedSql';
import { createLogger } from '../../lib/logger';
const log = createLogger('weeklyPlatformAudit');


export interface AuditFinding {
  id: string;
  category: 'ui' | 'api' | 'data' | 'performance' | 'security' | 'ux';
  severity: 'critical' | 'high' | 'medium' | 'low' | 'info';
  title: string;
  description: string;
  location: string;
  screenshot?: string;
  suggestedFix?: string;
  autoFixable: boolean;
  status: 'new' | 'acknowledged' | 'in_progress' | 'fixed' | 'wont_fix';
  detectedAt: Date;
}

export interface PlatformAuditReport {
  reportId: string;
  generatedAt: Date;
  auditDuration: number;
  
  summary: {
    totalFindings: number;
    criticalCount: number;
    highCount: number;
    mediumCount: number;
    lowCount: number;
    infoCount: number;
    overallHealthScore: number;
    readinessScore: number;
  };
  
  categories: {
    ui: AuditFinding[];
    api: AuditFinding[];
    data: AuditFinding[];
    performance: AuditFinding[];
    security: AuditFinding[];
    ux: AuditFinding[];
  };
  
  pagesAudited: string[];
  apisChecked: string[];
  
  trends: {
    previousWeekScore: number;
    scoreChange: number;
    newIssues: number;
    resolvedIssues: number;
  };
  
  recommendations: string[];
  nextAuditScheduled: Date;
}

const CRITICAL_PAGES_TO_AUDIT = [
  '/',
  '/login',
  '/dashboard',
  '/schedule',
  '/employees',
  '/settings',
  '/billing',
  '/compliance',
  '/reports',
  '/timesheet',
  '/payroll',
  '/onboarding',
];

const CRITICAL_API_ENDPOINTS = [
  { method: 'GET', path: '/api/health/summary', expectStatus: 200 },
  { method: 'GET', path: '/api/user', expectStatus: [200, 401] },
  { method: 'GET', path: '/api/workspace', expectStatus: [200, 400, 401] },
  { method: 'GET', path: '/api/hr/employees', expectStatus: [200, 401] },
  { method: 'GET', path: '/api/shifts', expectStatus: [200, 400, 401] },
  { method: 'GET', path: '/api/finance/credits/balance', expectStatus: [200, 401] },
  { method: 'GET', path: '/api/trinity/editable-registry', expectStatus: 200 },
  { method: 'GET', path: '/api/trinity/route-health', expectStatus: 200 },
  { method: 'GET', path: '/api/comms/notifications/combined', expectStatus: [200, 401] },
  { method: 'GET', path: '/api/ai-brain/system-status', expectStatus: [200, 401] },
];

const PLACEHOLDER_PATTERNS = [
  /\blorem ipsum\b/i,
  /\bplaceholder\b/i,
  /\btest@test\.com\b/i,
  /\b555-\d{3}-\d{4}\b/,
  /\bTODO\b/,
  /\bFIXME\b/,
  /\bexample\.com\b/i,
  /\$0\.00/,
  /\$999(,999)?/,
  /\bJohn Doe\b/i,
  /\bJane Doe\b/i,
  /\bAcme Corp\b/i,
  /\bsample\s+data\b/i,
  /\bmock\s+data\b/i,
];

class WeeklyPlatformAuditService {
  private static instance: WeeklyPlatformAuditService;
  private isRunning = false;
  private lastReport: PlatformAuditReport | null = null;
  private reportHistory: PlatformAuditReport[] = [];

  static getInstance(): WeeklyPlatformAuditService {
    if (!this.instance) {
      this.instance = new WeeklyPlatformAuditService();
    }
    return this.instance;
  }

  async runFullAudit(): Promise<PlatformAuditReport> {
    if (this.isRunning) {
      throw new Error('Audit already in progress');
    }

    this.isRunning = true;
    const startTime = Date.now();
    const reportId = `audit_${Date.now()}`;

    log.info('[WeeklyAudit] Starting comprehensive platform audit...');

    const findings: AuditFinding[] = [];
    const pagesAudited: string[] = [];
    const apisChecked: string[] = [];

    try {
      const pipeline = ExecutionPipeline.getInstance();
      
      await pipeline.execute({
        operationType: 'automation',
        operationName: 'weekly_platform_audit',
        initiator: 'trinity:audit_service',
        initiatorType: 'system',
      }, {
        process: async (ctx) => {
          log.info(`[WeeklyAudit] Execution ID: ${ctx.executionId}`);
          
          const visualFindings = await this.runVisualAudit(pagesAudited);
          findings.push(...visualFindings);

          const apiFindings = await this.runApiAudit(apisChecked);
          findings.push(...apiFindings);

          const dataFindings = await this.runDataQualityAudit();
          findings.push(...dataFindings);

          const platformScan = await trinityScanOrchestrator.performInitialScan();
          const patternFindings = this.convertPatternsToFindings(platformScan.patternsLearned);
          findings.push(...patternFindings);

          return { findings, pagesAudited, apisChecked };
        }
      });

      const report = this.generateReport(reportId, startTime, findings, pagesAudited, apisChecked);
      
      this.lastReport = report;
      this.reportHistory.push(report);
      if (this.reportHistory.length > 12) {
        this.reportHistory.shift();
      }

      log.info(`[WeeklyAudit] Audit complete. Found ${findings.length} issues.`);
      log.info(`[WeeklyAudit] Health Score: ${report.summary.overallHealthScore}/100`);

      return report;

    } finally {
      this.isRunning = false;
    }
  }

  private async runVisualAudit(pagesAudited: string[]): Promise<AuditFinding[]> {
    const findings: AuditFinding[] = [];
    const baseUrl = getAppBaseUrl();

    for (const page of CRITICAL_PAGES_TO_AUDIT) {
      const url = `${baseUrl}${page}`;
      pagesAudited.push(page);

      try {
        log.info(`[WeeklyAudit] Visual check: ${page}`);
        
        const result = await visualQaSubagent.runVisualCheck({
          url,
          workspaceId: 'system',
          triggeredBy: 'weekly_audit',
          triggerSource: 'scheduled',
        });

        if (result.analysis?.anomalies) {
          for (const anomaly of (result as any).analysis.anomalies) {
            findings.push(this.convertAnomalyToFinding(anomaly, page, (result as any).screenshot?.filePath));
          }
        }

        const pageContent = await this.getPageContent(url);
        const placeholderFindings = this.checkForPlaceholderData(pageContent, page);
        findings.push(...placeholderFindings);

      } catch (error: any) {
        findings.push({
          id: `vqa_error_${Date.now()}`,
          category: 'ui',
          severity: 'high',
          title: `Visual audit failed for ${page}`,
          description: (error instanceof Error ? error.message : String(error)),
          location: page,
          autoFixable: false,
          status: 'new',
          detectedAt: new Date(),
        });
      }
    }

    return findings;
  }

  private async runApiAudit(apisChecked: string[]): Promise<AuditFinding[]> {
    const findings: AuditFinding[] = [];
    const baseUrl = getAppBaseUrl();

    for (const endpoint of CRITICAL_API_ENDPOINTS) {
      const url = `${baseUrl}${endpoint.path}`;
      apisChecked.push(`${endpoint.method} ${endpoint.path}`);

      try {
        log.info(`[WeeklyAudit] API check: ${endpoint.method} ${endpoint.path}`);
        
        const response = await fetch(url, {
          method: endpoint.method,
          headers: { 'Content-Type': 'application/json' },
        });

        const expectedStatuses = Array.isArray(endpoint.expectStatus) 
          ? endpoint.expectStatus 
          : [endpoint.expectStatus];

        if (!expectedStatuses.includes(response.status)) {
          findings.push({
            id: `api_${Date.now()}_${endpoint.path.replace(/\//g, '_')}`,
            category: 'api',
            severity: response.status >= 500 ? 'critical' : 'high',
            title: `API endpoint returned unexpected status`,
            description: `${endpoint.method} ${endpoint.path} returned ${response.status}, expected one of: ${expectedStatuses.join(', ')}`,
            location: endpoint.path,
            autoFixable: false,
            status: 'new',
            detectedAt: new Date(),
          });
        }

        if (response.ok) {
          const contentType = response.headers.get('content-type');
          if (contentType?.includes('application/json')) {
            try {
              const body = await response.text();
              const placeholderFindings = this.checkForPlaceholderData(body, endpoint.path);
              findings.push(...placeholderFindings);
            } catch (bodyError) {
              log.warn(`[WeeklyPlatformAudit] Failed to read response body for ${endpoint.path}:`, bodyError);
            }
          }
        }

      } catch (error: any) {
        findings.push({
          id: `api_error_${Date.now()}`,
          category: 'api',
          severity: 'critical',
          title: `API endpoint unreachable`,
          description: `${endpoint.method} ${endpoint.path}: ${(error instanceof Error ? error.message : String(error))}`,
          location: endpoint.path,
          autoFixable: false,
          status: 'new',
          detectedAt: new Date(),
        });
      }
    }

    return findings;
  }

  private async runDataQualityAudit(): Promise<AuditFinding[]> {
    const findings: AuditFinding[] = [];

    try {
      // CATEGORY C — Raw SQL retained: UNION | Tables: employees, workspaces | Verified: 2026-03-23
      const result = await typedQuery(sql`
        SELECT 
          'employees' as table_name,
          COUNT(*) as total,
          COUNT(CASE WHEN first_name ILIKE '%test%' OR last_name ILIKE '%test%' THEN 1 END) as test_records,
          COUNT(CASE WHEN email ILIKE '%test%' OR email ILIKE '%example%' THEN 1 END) as test_emails
        FROM employees
        UNION ALL
        SELECT 
          'workspaces' as table_name,
          COUNT(*) as total,
          COUNT(CASE WHEN name ILIKE '%test%' OR name ILIKE '%demo%' THEN 1 END) as test_records,
          0 as test_emails
        FROM workspaces
      `);

      for (const row of (result as any[]) || []) {
        const testRecords = Number(row.test_records) || 0;
        const testEmails = Number(row.test_emails) || 0;
        
        if (testRecords > 0 || testEmails > 0) {
          findings.push({
            id: `data_quality_${row.table_name}_${Date.now()}`,
            category: 'data',
            severity: 'medium',
            title: `Possible test/placeholder data in ${row.table_name}`,
            description: `Found ${testRecords} records with test-like names and ${testEmails} test-like emails in ${row.table_name} table`,
            location: `database.${row.table_name}`,
            autoFixable: false,
            status: 'new',
            detectedAt: new Date(),
          });
        }
      }
    } catch (error: any) {
      log.error('[WeeklyAudit] Data quality check error:', (error instanceof Error ? error.message : String(error)));
    }

    return findings;
  }

  private async getPageContent(url: string): Promise<string> {
    try {
      const response = await fetch(url);
      return await response.text();
    } catch {
      return '';
    }
  }

  private checkForPlaceholderData(content: string, location: string): AuditFinding[] {
    const findings: AuditFinding[] = [];

    for (const pattern of PLACEHOLDER_PATTERNS) {
      const matches = content.match(pattern);
      if (matches) {
        const existingFinding = findings.find(f => 
          f.title.includes('Placeholder/mock data detected') && f.location === location
        );
        
        if (existingFinding) {
          existingFinding.description += `, "${matches[0]}"`;
        } else {
          findings.push({
            id: `placeholder_${Date.now()}_${crypto.randomUUID().slice(0, 8)}`,
            category: 'data',
            severity: 'medium',
            title: 'Placeholder/mock data detected',
            description: `Found placeholder pattern: "${matches[0]}"`,
            location,
            autoFixable: false,
            status: 'new',
            detectedAt: new Date(),
          });
        }
      }
    }

    return findings;
  }

  private convertAnomalyToFinding(anomaly: VisualAnomaly, page: string, screenshot?: string): AuditFinding {
    return {
      id: `vqa_${Date.now()}_${crypto.randomUUID().slice(0, 8)}`,
      category: 'ui',
      severity: anomaly.severity,
      title: `${anomaly.category.replace(/_/g, ' ')} on ${page}`,
      description: anomaly.description,
      location: page,
      screenshot,
      suggestedFix: anomaly.suggestedFix || anomaly.suggestedCss,
      autoFixable: !!anomaly.suggestedCss,
      status: 'new',
      detectedAt: new Date(),
    };
  }

  private convertPatternsToFindings(patterns: LearnedPattern[]): AuditFinding[] {
    return patterns
      .filter(p => p.patternType === 'error' || p.patternType === 'ui')
      .map(pattern => ({
        id: pattern.patternId,
        category: pattern.patternType === 'ui' ? 'ux' : 'performance',
        severity: pattern.confidence > 0.8 ? 'high' : pattern.confidence > 0.5 ? 'medium' : 'low',
        title: pattern.description.substring(0, 100),
        description: pattern.description,
        location: pattern.affectedAreas.join(', '),
        suggestedFix: pattern.suggestedAction,
        autoFixable: false,
        status: 'new',
        detectedAt: new Date(),
      }));
  }

  private generateReport(
    reportId: string,
    startTime: number,
    findings: AuditFinding[],
    pagesAudited: string[],
    apisChecked: string[]
  ): PlatformAuditReport {
    const auditDuration = Date.now() - startTime;

    const criticalCount = findings.filter(f => f.severity === 'critical').length;
    const highCount = findings.filter(f => f.severity === 'high').length;
    const mediumCount = findings.filter(f => f.severity === 'medium').length;
    const lowCount = findings.filter(f => f.severity === 'low').length;
    const infoCount = findings.filter(f => f.severity === 'info').length;

    const healthDeductions = 
      criticalCount * 15 + 
      highCount * 8 + 
      mediumCount * 3 + 
      lowCount * 1;
    const overallHealthScore = Math.max(0, 100 - healthDeductions);

    const previousReport = this.reportHistory[this.reportHistory.length - 1];
    const previousWeekScore = previousReport?.summary.overallHealthScore || 100;
    
    const previousFindingIds = new Set(
      previousReport 
        ? Object.values(previousReport.categories).flat().map(f => f.id)
        : []
    );
    const currentFindingIds = new Set(findings.map(f => f.id));
    
    const newIssues = findings.filter(f => !previousFindingIds.has(f.id)).length;
    const resolvedIssues = previousReport 
      ? Object.values(previousReport.categories).flat().filter(f => !currentFindingIds.has(f.id)).length
      : 0;

    const recommendations = this.generateRecommendations(findings, overallHealthScore);

    const nextAudit = new Date();
    nextAudit.setDate(nextAudit.getDate() + 7);

    return {
      reportId,
      generatedAt: new Date(),
      auditDuration,
      summary: {
        totalFindings: findings.length,
        criticalCount,
        highCount,
        mediumCount,
        lowCount,
        infoCount,
        overallHealthScore,
        readinessScore: Math.max(0, 100 - (criticalCount * 20) - (highCount * 10)),
      },
      categories: {
        ui: findings.filter(f => f.category === 'ui'),
        api: findings.filter(f => f.category === 'api'),
        data: findings.filter(f => f.category === 'data'),
        performance: findings.filter(f => f.category === 'performance'),
        security: findings.filter(f => f.category === 'security'),
        ux: findings.filter(f => f.category === 'ux'),
      },
      pagesAudited,
      apisChecked,
      trends: {
        previousWeekScore,
        scoreChange: overallHealthScore - previousWeekScore,
        newIssues,
        resolvedIssues,
      },
      recommendations,
      nextAuditScheduled: nextAudit,
    };
  }

  private generateRecommendations(findings: AuditFinding[], healthScore: number): string[] {
    const recommendations: string[] = [];

    const criticalFindings = findings.filter(f => f.severity === 'critical');
    if (criticalFindings.length > 0) {
      recommendations.push(`URGENT: Address ${criticalFindings.length} critical issues immediately`);
      criticalFindings.slice(0, 3).forEach(f => {
        recommendations.push(`  - Fix: ${f.title} at ${f.location}`);
      });
    }

    const uiIssues = findings.filter(f => f.category === 'ui').length;
    if (uiIssues > 5) {
      recommendations.push(`UI needs attention: ${uiIssues} visual issues detected. Consider a UI review sprint.`);
    }

    const apiIssues = findings.filter(f => f.category === 'api').length;
    if (apiIssues > 0) {
      recommendations.push(`API reliability: ${apiIssues} endpoint issues found. Review backend stability.`);
    }

    const dataIssues = findings.filter(f => f.category === 'data').length;
    if (dataIssues > 0) {
      recommendations.push(`Data quality: ${dataIssues} placeholder/test data instances found. Clean up before production.`);
    }

    if (healthScore < 70) {
      recommendations.push('Overall platform health is concerning. Schedule dedicated bug-fix sprint.');
    } else if (healthScore < 85) {
      recommendations.push('Platform health is fair. Address high-priority issues in next sprint.');
    } else if (healthScore >= 95) {
      recommendations.push('Excellent platform health! Continue monitoring and maintain quality.');
    }

    return recommendations;
  }

  getLastReport(): PlatformAuditReport | null {
    return this.lastReport;
  }

  getReportHistory(): PlatformAuditReport[] {
    return this.reportHistory;
  }

  isAuditRunning(): boolean {
    return this.isRunning;
  }
}

export const weeklyPlatformAudit = WeeklyPlatformAuditService.getInstance();
