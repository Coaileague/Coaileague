/**
 * TRINITY DEBUG TRIAD - Master Orchestrator
 * ==========================================
 * Coordinates three specialized crawlers running in parallel:
 * - UI Crawler: Frontend testing
 * - API Crawler: Backend testing  
 * - Integration Crawler: Cross-surface workflow testing
 * 
 * Produces a unified report with Trinity AI-enhanced insights.
 */

import { 
  TriadReport, 
  TriadOrchestratorConfig, 
  TriadIssue,
  CrawlerProgress,
  UICrawlerResult,
  APICrawlerResult,
  IntegrationCrawlerResult
} from './config/triadTypes';
import { UICrawler } from './crawlers/uiCrawler';
import { APICrawler } from './crawlers/apiCrawler';
import { IntegrationCrawler } from './crawlers/integrationCrawler';
import { trinityDiagnosticsAgent } from './ai/trinityDiagnosticsAgent';
import { generateRunId, ensureDir } from './utils/helpers';
import * as fs from 'fs';
import * as path from 'path';

export class TriadOrchestrator {
  private config: TriadOrchestratorConfig;
  private startTime: Date = new Date();
  private crawlerProgress: Map<string, CrawlerProgress> = new Map();
  
  constructor(config: Partial<TriadOrchestratorConfig>) {
    this.config = {
      baseUrl: config.baseUrl || process.env.DIAGNOSTICS_BASE_URL || 'https://coaileague.com',
      runId: config.runId || generateRunId(),
      mode: config.mode || 'full-triad',
      parallel: config.parallel ?? true,
      maxPagesPerCrawler: config.maxPagesPerCrawler || 50,
      timeout: config.timeout || 300000,
      credentials: config.credentials,
      enableAIAnalysis: config.enableAIAnalysis ?? true,
      outputDir: config.outputDir || path.join(process.cwd(), 'diagnostics-runner', 'output', `triad_${config.runId || generateRunId()}`)
    };
    
    ensureDir(this.config.outputDir);
    ensureDir(path.join(this.config.outputDir, 'screenshots'));
    ensureDir(path.join(this.config.outputDir, 'logs'));
  }
  
  private handleProgress(progress: CrawlerProgress): void {
    this.crawlerProgress.set(progress.crawlerType, progress);
    
    const allProgress = Array.from(this.crawlerProgress.values());
    const avgProgress = allProgress.reduce((sum, p) => sum + p.progress, 0) / allProgress.length;
    const totalIssues = allProgress.reduce((sum, p) => sum + p.issuesFound, 0);
    
    console.log(`[Orchestrator] Progress: ${avgProgress.toFixed(1)}% | Issues: ${totalIssues} | ${progress.crawlerType}: ${progress.status}`);
  }
  
  async run(): Promise<TriadReport> {
    console.log('╔════════════════════════════════════════════════════════════╗');
    console.log('║       TRINITY DEBUG TRIAD - Starting Parallel Scan         ║');
    console.log('╠════════════════════════════════════════════════════════════╣');
    console.log(`║  Mode: ${this.config.mode.padEnd(52)}║`);
    console.log(`║  Target: ${this.config.baseUrl.padEnd(50)}║`);
    console.log(`║  Run ID: ${this.config.runId.padEnd(50)}║`);
    console.log('╚════════════════════════════════════════════════════════════╝');
    
    this.startTime = new Date();
    
    let uiResult: UICrawlerResult | undefined;
    let apiResult: APICrawlerResult | undefined;
    let integrationResult: IntegrationCrawlerResult | undefined;
    
    const crawlerConfigs = {
      baseUrl: this.config.baseUrl,
      runId: this.config.runId,
      outputDir: this.config.outputDir,
      credentials: this.config.credentials,
      onProgress: (p: CrawlerProgress) => this.handleProgress(p)
    };
    
    if (this.config.parallel) {
      console.log('[Orchestrator] Running crawlers in PARALLEL mode...');
      
      const promises: Promise<any>[] = [];
      
      if (this.config.mode === 'full-triad' || this.config.mode === 'ui-only') {
        const uiCrawler = new UICrawler({
          ...crawlerConfigs,
          maxPages: this.config.maxPagesPerCrawler
        });
        promises.push(uiCrawler.run().then(r => { uiResult = r; return r; }));
      }
      
      if (this.config.mode === 'full-triad' || this.config.mode === 'api-only') {
        const apiCrawler = new APICrawler(crawlerConfigs);
        promises.push(apiCrawler.run().then(r => { apiResult = r; return r; }));
      }
      
      if (this.config.mode === 'full-triad' || this.config.mode === 'integration-only') {
        const integrationCrawler = new IntegrationCrawler(crawlerConfigs);
        promises.push(integrationCrawler.run().then(r => { integrationResult = r; return r; }));
      }
      
      await Promise.all(promises);
      
    } else {
      console.log('[Orchestrator] Running crawlers in SEQUENTIAL mode...');
      
      if (this.config.mode === 'full-triad' || this.config.mode === 'ui-only') {
        const uiCrawler = new UICrawler({
          ...crawlerConfigs,
          maxPages: this.config.maxPagesPerCrawler
        });
        uiResult = await uiCrawler.run();
      }
      
      if (this.config.mode === 'full-triad' || this.config.mode === 'api-only') {
        const apiCrawler = new APICrawler(crawlerConfigs);
        apiResult = await apiCrawler.run();
      }
      
      if (this.config.mode === 'full-triad' || this.config.mode === 'integration-only') {
        const integrationCrawler = new IntegrationCrawler(crawlerConfigs);
        integrationResult = await integrationCrawler.run();
      }
    }
    
    const report = await this.generateReport(uiResult, apiResult, integrationResult);
    
    await this.saveReport(report);
    
    this.printSummary(report);
    
    return report;
  }
  
  private async generateReport(
    uiResult?: UICrawlerResult,
    apiResult?: APICrawlerResult,
    integrationResult?: IntegrationCrawlerResult
  ): Promise<TriadReport> {
    console.log('[Orchestrator] Generating unified report...');
    
    const allIssues: TriadIssue[] = [
      ...(uiResult?.issues || []),
      ...(apiResult?.issues || []),
      ...(integrationResult?.issues || [])
    ];
    
    const deduplicatedIssues = this.deduplicateIssues(allIssues);
    
    const sortedIssues = deduplicatedIssues.sort((a, b) => {
      const severityOrder = { critical: 0, high: 1, medium: 2, low: 3, info: 4 };
      return severityOrder[a.severity] - severityOrder[b.severity];
    });
    
    if (this.config.enableAIAnalysis) {
      console.log('[Orchestrator] Running Trinity AI analysis on top issues...');
      const topIssues = sortedIssues.slice(0, 10);
      
      for (const issue of topIssues) {
        try {
          const analysis = await trinityDiagnosticsAgent.analyzeIssue(issue);
          issue.aiAnalysis = analysis;
        } catch (error) {
          console.warn('[Orchestrator] AI analysis failed for issue:', issue.id);
        }
      }
    }
    
    const summary = this.calculateSummary(sortedIssues);
    const prioritizedFixes = this.prioritizeFixes(sortedIssues);
    const trinityInsights = await this.generateTrinityInsights(sortedIssues, summary);
    
    const endTime = new Date();
    
    return {
      runId: this.config.runId,
      startedAt: this.startTime.toISOString(),
      completedAt: endTime.toISOString(),
      duration: endTime.getTime() - this.startTime.getTime(),
      baseUrl: this.config.baseUrl,
      mode: this.config.mode,
      
      crawlerResults: {
        ui: uiResult,
        api: apiResult,
        integration: integrationResult
      },
      
      allIssues: sortedIssues,
      summary,
      prioritizedFixes,
      trinityInsights,
      
      artifactsPath: this.config.outputDir,
      reportPath: path.join(this.config.outputDir, 'triad_report.json')
    };
  }
  
  private deduplicateIssues(issues: TriadIssue[]): TriadIssue[] {
    const seen = new Map<string, TriadIssue>();
    
    for (const issue of issues) {
      const key = `${issue.category}:${issue.url}:${issue.message.substring(0, 100)}`;
      
      if (!seen.has(key)) {
        seen.set(key, issue);
      } else {
        const existing = seen.get(key)!;
        const severityOrder = { critical: 0, high: 1, medium: 2, low: 3, info: 4 };
        if (severityOrder[issue.severity] < severityOrder[existing.severity]) {
          seen.set(key, issue);
        }
      }
    }
    
    return Array.from(seen.values());
  }
  
  private calculateSummary(issues: TriadIssue[]): TriadReport['summary'] {
    const bySubsystem: Record<string, number> = {};
    const byCrawler: Record<string, number> = {};
    
    let criticalCount = 0;
    let highCount = 0;
    let mediumCount = 0;
    let lowCount = 0;
    
    for (const issue of issues) {
      bySubsystem[issue.subsystem] = (bySubsystem[issue.subsystem] || 0) + 1;
      byCrawler[issue.crawlerType] = (byCrawler[issue.crawlerType] || 0) + 1;
      
      switch (issue.severity) {
        case 'critical': criticalCount++; break;
        case 'high': highCount++; break;
        case 'medium': mediumCount++; break;
        case 'low': lowCount++; break;
      }
    }
    
    const readinessScore = Math.max(0, 100 - (criticalCount * 25) - (highCount * 10) - (mediumCount * 3) - (lowCount * 1));
    
    const blockers = issues
      .filter(i => i.severity === 'critical')
      .map(i => i.message);
    
    return {
      totalIssuesFound: issues.length,
      criticalCount,
      highCount,
      mediumCount,
      lowCount,
      bySubsystem: bySubsystem as any,
      byCrawler: byCrawler as any,
      readinessScore,
      blockers
    };
  }
  
  private prioritizeFixes(issues: TriadIssue[]): TriadReport['prioritizedFixes'] {
    return issues.slice(0, 20).map((issue, index) => ({
      rank: index + 1,
      issue,
      estimatedImpact: issue.severity === 'critical' ? 'high' : issue.severity === 'high' ? 'high' : 'medium',
      fixInstructions: issue.aiAnalysis?.fixRecommendation || issue.recommendedFix || 'Manual investigation required'
    }));
  }
  
  private async generateTrinityInsights(
    issues: TriadIssue[], 
    summary: TriadReport['summary']
  ): Promise<TriadReport['trinityInsights']> {
    const criticalIssues = issues.filter(i => i.severity === 'critical');
    const highIssues = issues.filter(i => i.severity === 'high');
    
    let launchReadiness: 'ready' | 'needs-work' | 'not-ready' = 'ready';
    if (summary.criticalCount > 0) {
      launchReadiness = 'not-ready';
    } else if (summary.highCount > 3) {
      launchReadiness = 'needs-work';
    }
    
    const quickWins = issues
      .filter(i => i.aiAnalysis?.estimatedEffort === 'trivial' || i.aiAnalysis?.estimatedEffort === 'easy')
      .slice(0, 5)
      .map(i => i.message);
    
    const technicalDebt = issues
      .filter(i => i.severity === 'low' || i.severity === 'medium')
      .slice(0, 5)
      .map(i => i.message);
    
    return {
      overallAssessment: summary.criticalCount === 0 && summary.highCount <= 2
        ? 'Platform is in good shape with minor issues to address.'
        : summary.criticalCount > 0
        ? `${summary.criticalCount} critical blocker(s) must be fixed before launch.`
        : `${summary.highCount} high-priority issues should be addressed soon.`,
      topPriorities: criticalIssues.concat(highIssues).slice(0, 5).map(i => i.message),
      quickWins,
      technicalDebt,
      launchReadiness,
      confidenceScore: Math.min(95, summary.readinessScore + 10)
    };
  }
  
  private async saveReport(report: TriadReport): Promise<void> {
    const reportPath = path.join(this.config.outputDir, 'triad_report.json');
    fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
    console.log(`[Orchestrator] Report saved to: ${reportPath}`);
    
    const htmlPath = path.join(this.config.outputDir, 'triad_report.html');
    const html = this.generateHtmlReport(report);
    fs.writeFileSync(htmlPath, html);
    console.log(`[Orchestrator] HTML report saved to: ${htmlPath}`);
  }
  
  private generateHtmlReport(report: TriadReport): string {
    const severityColors = {
      critical: '#dc2626',
      high: '#ea580c',
      medium: '#ca8a04',
      low: '#16a34a',
      info: '#6b7280'
    };
    
    const issueRows = report.allIssues.map(issue => `
      <tr>
        <td><span class="severity ${issue.severity}">${issue.severity.toUpperCase()}</span></td>
        <td><span class="crawler ${issue.crawlerType}">${issue.crawlerType.toUpperCase()}</span></td>
        <td>${issue.subsystem}</td>
        <td>${issue.message}</td>
        <td><a href="${issue.url}" target="_blank">${issue.url}</a></td>
        <td>${issue.aiAnalysis?.fixRecommendation || issue.recommendedFix || '-'}</td>
      </tr>
    `).join('');
    
    return `<!DOCTYPE html>
<html>
<head>
  <title>Trinity Debug Triad Report - ${report.runId}</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; margin: 0; padding: 20px; background: #0f172a; color: #e2e8f0; }
    .container { max-width: 1400px; margin: 0 auto; }
    h1 { color: #818cf8; border-bottom: 2px solid #818cf8; padding-bottom: 10px; }
    h2 { color: #a5b4fc; margin-top: 30px; }
    .summary-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 20px; margin: 20px 0; }
    .summary-card { background: #1e293b; padding: 20px; border-radius: 12px; text-align: center; }
    .summary-card h3 { margin: 0 0 10px 0; color: #94a3b8; font-size: 14px; }
    .summary-card .value { font-size: 36px; font-weight: bold; }
    .readiness { font-size: 24px; }
    .readiness.ready { color: #22c55e; }
    .readiness.needs-work { color: #eab308; }
    .readiness.not-ready { color: #ef4444; }
    table { width: 100%; border-collapse: collapse; margin: 20px 0; }
    th, td { padding: 12px; text-align: left; border-bottom: 1px solid #334155; }
    th { background: #1e293b; color: #818cf8; }
    tr:hover { background: #1e293b; }
    .severity { padding: 4px 8px; border-radius: 4px; font-size: 11px; font-weight: bold; }
    .severity.critical { background: #dc2626; color: white; }
    .severity.high { background: #ea580c; color: white; }
    .severity.medium { background: #ca8a04; color: white; }
    .severity.low { background: #16a34a; color: white; }
    .crawler { padding: 4px 8px; border-radius: 4px; font-size: 11px; }
    .crawler.ui { background: #7c3aed; color: white; }
    .crawler.api { background: #0891b2; color: white; }
    .crawler.integration { background: #d97706; color: white; }
    a { color: #60a5fa; }
    .insights { background: linear-gradient(135deg, #312e81 0%, #1e1b4b 100%); padding: 20px; border-radius: 12px; margin: 20px 0; }
    .insights h3 { color: #c4b5fd; margin-top: 0; }
    .insights p { color: #e2e8f0; line-height: 1.6; }
    .insights ul { color: #cbd5e1; }
  </style>
</head>
<body>
  <div class="container">
    <h1>🔱 Trinity Debug Triad Report</h1>
    
    <div class="summary-grid">
      <div class="summary-card">
        <h3>READINESS SCORE</h3>
        <div class="value readiness ${report.trinityInsights.launchReadiness}">${report.summary.readinessScore}%</div>
      </div>
      <div class="summary-card">
        <h3>TOTAL ISSUES</h3>
        <div class="value">${report.summary.totalIssuesFound}</div>
      </div>
      <div class="summary-card">
        <h3>CRITICAL</h3>
        <div class="value" style="color: #dc2626">${report.summary.criticalCount}</div>
      </div>
      <div class="summary-card">
        <h3>HIGH</h3>
        <div class="value" style="color: #ea580c">${report.summary.highCount}</div>
      </div>
      <div class="summary-card">
        <h3>MEDIUM</h3>
        <div class="value" style="color: #ca8a04">${report.summary.mediumCount}</div>
      </div>
      <div class="summary-card">
        <h3>LOW</h3>
        <div class="value" style="color: #16a34a">${report.summary.lowCount}</div>
      </div>
    </div>
    
    <div class="insights">
      <h3>🧠 Trinity Insights</h3>
      <p><strong>Assessment:</strong> ${report.trinityInsights.overallAssessment}</p>
      <p><strong>Launch Status:</strong> <span class="readiness ${report.trinityInsights.launchReadiness}">${report.trinityInsights.launchReadiness.toUpperCase()}</span></p>
      ${report.trinityInsights.topPriorities.length > 0 ? `
        <h4>Top Priorities:</h4>
        <ul>${report.trinityInsights.topPriorities.map(p => `<li>${p}</li>`).join('')}</ul>
      ` : ''}
      ${report.trinityInsights.quickWins.length > 0 ? `
        <h4>Quick Wins:</h4>
        <ul>${report.trinityInsights.quickWins.map(w => `<li>${w}</li>`).join('')}</ul>
      ` : ''}
    </div>
    
    <h2>All Issues (${report.allIssues.length})</h2>
    <table>
      <thead>
        <tr>
          <th>Severity</th>
          <th>Crawler</th>
          <th>Subsystem</th>
          <th>Message</th>
          <th>URL</th>
          <th>Fix Recommendation</th>
        </tr>
      </thead>
      <tbody>
        ${issueRows}
      </tbody>
    </table>
    
    <p style="color: #64748b; text-align: center; margin-top: 40px;">
      Generated by Trinity Debug Triad v1.0 | Run ID: ${report.runId} | Duration: ${(report.duration / 1000).toFixed(1)}s
    </p>
  </div>
</body>
</html>`;
  }
  
  private printSummary(report: TriadReport): void {
    console.log('');
    console.log('╔════════════════════════════════════════════════════════════╗');
    console.log('║            TRINITY DEBUG TRIAD - SCAN COMPLETE             ║');
    console.log('╠════════════════════════════════════════════════════════════╣');
    console.log(`║  Readiness Score: ${String(report.summary.readinessScore).padEnd(41)}║`);
    console.log(`║  Launch Status: ${report.trinityInsights.launchReadiness.toUpperCase().padEnd(43)}║`);
    console.log('╠════════════════════════════════════════════════════════════╣');
    console.log(`║  Total Issues: ${String(report.summary.totalIssuesFound).padEnd(44)}║`);
    console.log(`║  Critical: ${String(report.summary.criticalCount).padEnd(48)}║`);
    console.log(`║  High: ${String(report.summary.highCount).padEnd(52)}║`);
    console.log(`║  Medium: ${String(report.summary.mediumCount).padEnd(50)}║`);
    console.log(`║  Low: ${String(report.summary.lowCount).padEnd(53)}║`);
    console.log('╠════════════════════════════════════════════════════════════╣');
    console.log(`║  Duration: ${(report.duration / 1000).toFixed(1)}s`.padEnd(61) + '║');
    console.log(`║  Report: ${report.reportPath.substring(0, 49).padEnd(50)}║`);
    console.log('╚════════════════════════════════════════════════════════════╝');
  }
}

export async function runTriad(options?: Partial<TriadOrchestratorConfig>): Promise<TriadReport> {
  const orchestrator = new TriadOrchestrator(options || {});
  return orchestrator.run();
}
