/**
 * HTML Report Generator
 */

import * as fs from 'fs';
import * as path from 'path';
import { DiagnosticSummary, DiagnosticIssue, IssueCategory } from '../config/types';
import { formatDuration, truncate } from '../utils/helpers';

export class HtmlReporter {
  static generate(summary: DiagnosticSummary, outputPath: string): void {
    const html = HtmlReporter.buildHtml(summary);
    fs.writeFileSync(outputPath, html, 'utf-8');
    console.log(`[Reporter] HTML report saved to: ${outputPath}`);
  }
  
  private static buildHtml(summary: DiagnosticSummary): string {
    const issuesByCategory = HtmlReporter.groupByCategory(summary.issues);
    
    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Diagnostics Report - ${summary.runId}</title>
  <style>
    :root {
      --bg: #1a1a2e;
      --card-bg: #16213e;
      --text: #eee;
      --text-muted: #888;
      --critical: #ff4757;
      --high: #ff7f50;
      --medium: #ffa502;
      --low: #2ed573;
      --info: #5352ed;
      --border: #333;
    }
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      background: var(--bg);
      color: var(--text);
      line-height: 1.6;
      padding: 20px;
    }
    .container { max-width: 1200px; margin: 0 auto; }
    header {
      background: var(--card-bg);
      padding: 30px;
      border-radius: 12px;
      margin-bottom: 30px;
    }
    h1 { font-size: 2rem; margin-bottom: 10px; }
    .meta { color: var(--text-muted); font-size: 0.9rem; }
    .summary-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
      gap: 20px;
      margin: 30px 0;
    }
    .stat-card {
      background: var(--card-bg);
      padding: 20px;
      border-radius: 8px;
      text-align: center;
    }
    .stat-value {
      font-size: 2.5rem;
      font-weight: bold;
      margin-bottom: 5px;
    }
    .stat-label { color: var(--text-muted); }
    .severity-critical { color: var(--critical); }
    .severity-high { color: var(--high); }
    .severity-medium { color: var(--medium); }
    .severity-low { color: var(--low); }
    .severity-info { color: var(--info); }
    .section {
      background: var(--card-bg);
      padding: 25px;
      border-radius: 12px;
      margin-bottom: 20px;
    }
    .section h2 {
      font-size: 1.3rem;
      margin-bottom: 15px;
      padding-bottom: 10px;
      border-bottom: 1px solid var(--border);
    }
    .issue {
      background: rgba(0,0,0,0.2);
      padding: 15px;
      border-radius: 8px;
      margin-bottom: 15px;
      border-left: 4px solid var(--border);
    }
    .issue.critical { border-left-color: var(--critical); }
    .issue.high { border-left-color: var(--high); }
    .issue.medium { border-left-color: var(--medium); }
    .issue.low { border-left-color: var(--low); }
    .issue-header {
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      margin-bottom: 10px;
    }
    .issue-title { font-weight: 600; }
    .issue-badge {
      padding: 3px 8px;
      border-radius: 4px;
      font-size: 0.75rem;
      font-weight: bold;
      text-transform: uppercase;
    }
    .badge-critical { background: var(--critical); color: white; }
    .badge-high { background: var(--high); color: white; }
    .badge-medium { background: var(--medium); color: black; }
    .badge-low { background: var(--low); color: black; }
    .issue-url {
      color: var(--info);
      font-size: 0.85rem;
      word-break: break-all;
    }
    .issue-message {
      color: var(--text-muted);
      font-size: 0.9rem;
      margin-top: 8px;
    }
    .issue-fix {
      margin-top: 10px;
      padding: 10px;
      background: rgba(46, 213, 115, 0.1);
      border-radius: 4px;
      font-size: 0.85rem;
    }
    .issue-fix strong { color: var(--low); }
    .screenshot-link {
      display: inline-block;
      margin-top: 10px;
      color: var(--info);
      text-decoration: none;
    }
    .screenshot-link:hover { text-decoration: underline; }
    .next-steps {
      background: rgba(83, 82, 237, 0.1);
      padding: 20px;
      border-radius: 8px;
      margin-top: 15px;
    }
    .next-steps h3 { margin-bottom: 10px; color: var(--info); }
    .next-steps ul { padding-left: 20px; }
    .next-steps li { margin-bottom: 5px; }
    .empty-state {
      text-align: center;
      padding: 40px;
      color: var(--text-muted);
    }
    footer {
      text-align: center;
      padding: 20px;
      color: var(--text-muted);
      font-size: 0.8rem;
    }
  </style>
</head>
<body>
  <div class="container">
    <header>
      <h1>Diagnostics Report</h1>
      <div class="meta">
        <p><strong>Run ID:</strong> ${summary.runId}</p>
        <p><strong>Base URL:</strong> ${summary.baseUrl}</p>
        <p><strong>Started:</strong> ${new Date(summary.startedAt).toLocaleString()}</p>
        <p><strong>Duration:</strong> ${formatDuration(summary.duration)}</p>
        <p><strong>Mode:</strong> ${summary.mode}</p>
      </div>
    </header>
    
    <div class="summary-grid">
      <div class="stat-card">
        <div class="stat-value">${summary.totals.pagesVisited}</div>
        <div class="stat-label">Pages Visited</div>
      </div>
      <div class="stat-card">
        <div class="stat-value">${summary.totals.workflowsRun}</div>
        <div class="stat-label">Workflows Run</div>
      </div>
      <div class="stat-card">
        <div class="stat-value severity-critical">${summary.totals.issuesFound}</div>
        <div class="stat-label">Issues Found</div>
      </div>
      <div class="stat-card">
        <div class="stat-value severity-high">${summary.totals.captchaBlockers}</div>
        <div class="stat-label">CAPTCHA Blockers</div>
      </div>
    </div>
    
    <div class="summary-grid">
      <div class="stat-card">
        <div class="stat-value severity-critical">${summary.severityCounts.critical}</div>
        <div class="stat-label">Critical</div>
      </div>
      <div class="stat-card">
        <div class="stat-value severity-high">${summary.severityCounts.high}</div>
        <div class="stat-label">High</div>
      </div>
      <div class="stat-card">
        <div class="stat-value severity-medium">${summary.severityCounts.medium}</div>
        <div class="stat-label">Medium</div>
      </div>
      <div class="stat-card">
        <div class="stat-value severity-low">${summary.severityCounts.low}</div>
        <div class="stat-label">Low</div>
      </div>
    </div>
    
    ${HtmlReporter.renderCategorySection('CAPTCHA Blockers', 'captcha_blocker', issuesByCategory)}
    ${HtmlReporter.renderCategorySection('Network Failures (4xx/5xx)', 'network_failure', issuesByCategory)}
    ${HtmlReporter.renderCategorySection('Console Errors', 'console_error', issuesByCategory)}
    ${HtmlReporter.renderCategorySection('Page Errors', 'page_error', issuesByCategory)}
    ${HtmlReporter.renderCategorySection('Broken Images', 'broken_image', issuesByCategory)}
    ${HtmlReporter.renderCategorySection('Broken Links', 'broken_link', issuesByCategory)}
    ${HtmlReporter.renderCategorySection('Workflow Failures', 'workflow_failure', issuesByCategory)}
    ${HtmlReporter.renderCategorySection('UI Errors', 'ui_error', issuesByCategory)}
    ${HtmlReporter.renderCategorySection('Timeouts', 'timeout', issuesByCategory)}
    
    ${summary.nextSteps.length > 0 ? `
    <div class="section">
      <h2>Recommended Next Steps</h2>
      <div class="next-steps">
        <ul>
          ${summary.nextSteps.map(step => `<li>${step}</li>`).join('')}
        </ul>
      </div>
    </div>
    ` : ''}
    
    <footer>
      <p>Generated by CoAIleague Diagnostics Runner</p>
      <p>Report path: ${summary.reportPath}</p>
    </footer>
  </div>
</body>
</html>`;
  }
  
  private static groupByCategory(issues: DiagnosticIssue[]): Map<IssueCategory, DiagnosticIssue[]> {
    const grouped = new Map<IssueCategory, DiagnosticIssue[]>();
    
    for (const issue of issues) {
      const list = grouped.get(issue.category) || [];
      list.push(issue);
      grouped.set(issue.category, list);
    }
    
    return grouped;
  }
  
  private static renderCategorySection(
    title: string, 
    category: IssueCategory, 
    issuesByCategory: Map<IssueCategory, DiagnosticIssue[]>
  ): string {
    const issues = issuesByCategory.get(category) || [];
    
    if (issues.length === 0) {
      return '';
    }
    
    return `
    <div class="section">
      <h2>${title} (${issues.length})</h2>
      ${issues.map(issue => HtmlReporter.renderIssue(issue)).join('')}
    </div>
    `;
  }
  
  private static renderIssue(issue: DiagnosticIssue): string {
    return `
    <div class="issue ${issue.severity}">
      <div class="issue-header">
        <span class="issue-title">${truncate(issue.message, 100)}</span>
        <span class="issue-badge badge-${issue.severity}">${issue.severity}</span>
      </div>
      <div class="issue-url">${issue.url}</div>
      ${issue.details ? `<div class="issue-message">${truncate(issue.details, 300)}</div>` : ''}
      ${issue.requestUrl ? `<div class="issue-message"><strong>Request:</strong> ${issue.requestUrl} (${issue.statusCode})</div>` : ''}
      ${issue.recommendedFix ? `
      <div class="issue-fix">
        <strong>Recommended Fix:</strong> ${issue.recommendedFix}
      </div>
      ` : ''}
      ${issue.screenshotPath ? `
      <a href="${path.basename(issue.screenshotPath)}" class="screenshot-link" target="_blank">View Screenshot</a>
      ` : ''}
    </div>
    `;
  }
}
