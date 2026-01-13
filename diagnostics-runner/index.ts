/**
 * Diagnostics Runner - Main Orchestrator
 * 
 * Usage:
 *   npm run diag           - Run full diagnostics (crawl + workflows)
 *   npm run diag:crawl     - Run crawl mode only
 *   npm run diag:workflows - Run workflow tests only
 *   npm run diag:nightly   - Nightly full run with extended settings
 */

import { config } from './config/diagnostics.config';
import { 
  DiagnosticSummary, 
  DiagnosticIssue, 
  IssueCategory,
  PageAuditResult,
  WorkflowResult
} from './config/types';
import { PageCrawler } from './crawlers/pageCrawler';
import { WorkflowRunner } from './workflows/workflowRunner';
import { HtmlReporter } from './reporters/htmlReporter';
import { 
  generateRunId, 
  ensureDir, 
  categorySeverity, 
  getRecommendedFix,
  generateId 
} from './utils/helpers';
import * as fs from 'fs';
import * as path from 'path';

type RunMode = 'crawl' | 'workflows' | 'full';

async function loadWorkflows(): Promise<any[]> {
  const workflowsPath = path.join(process.cwd(), 'diagnostics-runner', 'workflows.json');
  
  if (!fs.existsSync(workflowsPath)) {
    console.log('[Orchestrator] No workflows.json found, using default workflows');
    return getDefaultWorkflows();
  }
  
  try {
    const content = fs.readFileSync(workflowsPath, 'utf-8');
    return JSON.parse(content);
  } catch (error) {
    console.error('[Orchestrator] Error loading workflows.json:', error);
    return getDefaultWorkflows();
  }
}

function getDefaultWorkflows(): any[] {
  return [
    {
      name: 'Homepage Load',
      description: 'Verify homepage loads correctly',
      steps: [
        { action: 'goto', url: config.baseUrl, description: 'Navigate to homepage' },
        { action: 'waitForSelector', selector: 'body', description: 'Wait for page to load' },
        { action: 'screenshot', description: 'Capture homepage' }
      ]
    },
    {
      name: 'Login Page Access',
      description: 'Verify login page is accessible',
      steps: [
        { action: 'goto', url: `${config.baseUrl}/login`, description: 'Navigate to login page' },
        { action: 'waitForSelector', selector: 'body', description: 'Wait for page to load' },
        { action: 'screenshot', description: 'Capture login page' }
      ]
    },
    {
      name: 'Pricing Page',
      description: 'Verify pricing page loads',
      steps: [
        { action: 'goto', url: `${config.baseUrl}/pricing`, description: 'Navigate to pricing' },
        { action: 'waitForSelector', selector: 'body', description: 'Wait for page to load' },
        { action: 'screenshot', description: 'Capture pricing page' }
      ]
    },
    {
      name: 'Dashboard Navigation',
      description: 'Test dashboard access (requires login)',
      steps: [
        { action: 'goto', url: `${config.baseUrl}/dashboard`, description: 'Navigate to dashboard' },
        { action: 'waitForSelector', selector: 'body', description: 'Wait for page to load' },
        { action: 'screenshot', description: 'Capture dashboard or redirect' }
      ]
    },
    {
      name: 'Schedule Page',
      description: 'Test schedule page access',
      steps: [
        { action: 'goto', url: `${config.baseUrl}/schedule`, description: 'Navigate to schedule' },
        { action: 'waitForSelector', selector: 'body', description: 'Wait for page to load' },
        { action: 'screenshot', description: 'Capture schedule page' }
      ]
    }
  ];
}

function convertPageResultsToIssues(results: PageAuditResult[]): DiagnosticIssue[] {
  const issues: DiagnosticIssue[] = [];
  
  for (const result of results) {
    if (result.captchaDetected) {
      issues.push({
        id: generateId(),
        category: 'captcha_blocker',
        severity: 'critical',
        url: result.url,
        message: 'CAPTCHA detected - page blocked',
        screenshotPath: result.screenshotPath,
        timestamp: result.timestamp,
        recommendedFix: getRecommendedFix('captcha_blocker')
      });
    }
    
    for (const error of result.consoleErrors) {
      issues.push({
        id: generateId(),
        category: 'console_error',
        severity: categorySeverity('console_error'),
        url: result.url,
        message: error.message,
        details: error.stackTrace,
        timestamp: result.timestamp,
        recommendedFix: getRecommendedFix('console_error')
      });
    }
    
    for (const failure of result.networkFailures) {
      issues.push({
        id: generateId(),
        category: 'network_failure',
        severity: failure.statusCode >= 500 ? 'critical' : 'high',
        url: result.url,
        message: `${failure.method} ${failure.url} returned ${failure.statusCode}`,
        requestUrl: failure.url,
        statusCode: failure.statusCode,
        timestamp: result.timestamp,
        recommendedFix: getRecommendedFix('network_failure')
      });
    }
    
    for (const image of result.brokenImages) {
      issues.push({
        id: generateId(),
        category: 'broken_image',
        severity: categorySeverity('broken_image'),
        url: result.url,
        message: `Broken image: ${image.src}`,
        details: image.reason,
        timestamp: result.timestamp,
        recommendedFix: getRecommendedFix('broken_image')
      });
    }
    
    for (const uiError of result.uiErrors) {
      issues.push({
        id: generateId(),
        category: 'ui_error',
        severity: categorySeverity('ui_error'),
        url: result.url,
        message: uiError,
        timestamp: result.timestamp,
        recommendedFix: getRecommendedFix('ui_error')
      });
    }
  }
  
  return issues;
}

function convertWorkflowResultsToIssues(results: WorkflowResult[]): DiagnosticIssue[] {
  const issues: DiagnosticIssue[] = [];
  
  for (const result of results) {
    if (!result.success) {
      if (result.captchaDetected) {
        issues.push({
          id: generateId(),
          category: 'captcha_blocker',
          severity: 'critical',
          url: config.baseUrl,
          message: `Workflow "${result.name}" blocked by CAPTCHA`,
          details: `Failed at: ${result.failedStep}`,
          screenshotPath: result.screenshotPath,
          timestamp: new Date().toISOString(),
          recommendedFix: getRecommendedFix('captcha_blocker')
        });
      } else {
        issues.push({
          id: generateId(),
          category: 'workflow_failure',
          severity: 'high',
          url: config.baseUrl,
          message: `Workflow "${result.name}" failed`,
          details: `${result.error}\nFailed at step: ${result.failedStep}\nCompleted: ${result.stepsCompleted}/${result.totalSteps}`,
          screenshotPath: result.screenshotPath,
          timestamp: new Date().toISOString(),
          recommendedFix: getRecommendedFix('workflow_failure')
        });
      }
    }
  }
  
  return issues;
}

function generateNextSteps(issues: DiagnosticIssue[]): string[] {
  const steps: string[] = [];
  const categoryCounts = new Map<IssueCategory, number>();
  
  for (const issue of issues) {
    categoryCounts.set(issue.category, (categoryCounts.get(issue.category) || 0) + 1);
  }
  
  if (categoryCounts.get('captcha_blocker')) {
    steps.push('Configure CAPTCHA bypass for test environment or disable CAPTCHA during testing');
  }
  
  if (categoryCounts.get('network_failure')) {
    steps.push(`Fix ${categoryCounts.get('network_failure')} API endpoint failures (check server logs)`);
  }
  
  if (categoryCounts.get('console_error')) {
    steps.push(`Resolve ${categoryCounts.get('console_error')} JavaScript console errors`);
  }
  
  if (categoryCounts.get('broken_image')) {
    steps.push(`Fix ${categoryCounts.get('broken_image')} broken images`);
  }
  
  if (categoryCounts.get('workflow_failure')) {
    steps.push(`Debug ${categoryCounts.get('workflow_failure')} failed user workflows`);
  }
  
  if (steps.length === 0) {
    steps.push('No critical issues found - consider adding more workflow tests');
  }
  
  return steps;
}

async function run(mode: RunMode = 'full'): Promise<void> {
  const runId = generateRunId();
  const outputDir = path.join(config.outputDir, runId);
  const startTime = Date.now();
  
  console.log('╔════════════════════════════════════════════════╗');
  console.log('║     DIAGNOSTICS RUNNER STARTING               ║');
  console.log('╚════════════════════════════════════════════════╝');
  console.log(`[Orchestrator] Run ID: ${runId}`);
  console.log(`[Orchestrator] Mode: ${mode}`);
  console.log(`[Orchestrator] Base URL: ${config.baseUrl}`);
  console.log(`[Orchestrator] Output: ${outputDir}`);
  
  await ensureDir(outputDir);
  
  let pageResults: PageAuditResult[] = [];
  let workflowResults: WorkflowResult[] = [];
  
  if (mode === 'crawl' || mode === 'full') {
    console.log('\n[Orchestrator] === CRAWL MODE ===');
    const crawler = new PageCrawler(runId);
    await crawler.initialize();
    const crawlState = await crawler.crawl();
    pageResults = crawlState.results;
    await crawler.saveTrace(runId);
    await crawler.close();
  }
  
  if (mode === 'workflows' || mode === 'full') {
    console.log('\n[Orchestrator] === WORKFLOW MODE ===');
    const workflows = await loadWorkflows();
    const runner = new WorkflowRunner(runId);
    await runner.initialize();
    workflowResults = await runner.runAll(workflows);
    await runner.close();
  }
  
  console.log('\n[Orchestrator] === GENERATING REPORT ===');
  
  const pageIssues = convertPageResultsToIssues(pageResults);
  const workflowIssues = convertWorkflowResultsToIssues(workflowResults);
  const allIssues = [...pageIssues, ...workflowIssues];
  
  const severityCounts = {
    critical: allIssues.filter(i => i.severity === 'critical').length,
    high: allIssues.filter(i => i.severity === 'high').length,
    medium: allIssues.filter(i => i.severity === 'medium').length,
    low: allIssues.filter(i => i.severity === 'low').length,
    info: allIssues.filter(i => i.severity === 'info').length
  };
  
  const categoryCounts: Record<IssueCategory, number> = {
    captcha_blocker: 0,
    console_error: 0,
    page_error: 0,
    network_failure: 0,
    broken_image: 0,
    broken_link: 0,
    workflow_failure: 0,
    timeout: 0,
    ui_error: 0
  };
  
  for (const issue of allIssues) {
    categoryCounts[issue.category]++;
  }
  
  const summary: DiagnosticSummary = {
    runId,
    startedAt: new Date(startTime).toISOString(),
    completedAt: new Date().toISOString(),
    duration: Date.now() - startTime,
    mode,
    baseUrl: config.baseUrl,
    totals: {
      pagesVisited: pageResults.length,
      workflowsRun: workflowResults.length,
      issuesFound: allIssues.length,
      captchaBlockers: categoryCounts.captcha_blocker
    },
    severityCounts,
    categoryCounts,
    issues: allIssues,
    pageResults,
    workflowResults,
    blockers: allIssues
      .filter(i => i.category === 'captcha_blocker')
      .map(i => i.message),
    nextSteps: generateNextSteps(allIssues),
    reportPath: path.join(outputDir, 'report.html'),
    artifactsPath: outputDir
  };
  
  const summaryPath = path.join(outputDir, 'summary.json');
  fs.writeFileSync(summaryPath, JSON.stringify(summary, null, 2));
  console.log(`[Orchestrator] Summary saved to: ${summaryPath}`);
  
  HtmlReporter.generate(summary, summary.reportPath);
  
  const latestPath = path.join(config.outputDir, 'latest');
  if (fs.existsSync(latestPath)) {
    fs.unlinkSync(latestPath);
  }
  fs.symlinkSync(runId, latestPath);
  console.log(`[Orchestrator] Latest symlink updated`);
  
  console.log('\n╔════════════════════════════════════════════════╗');
  console.log('║     DIAGNOSTICS COMPLETE                       ║');
  console.log('╚════════════════════════════════════════════════╝');
  console.log(`[Orchestrator] Pages visited: ${summary.totals.pagesVisited}`);
  console.log(`[Orchestrator] Workflows run: ${summary.totals.workflowsRun}`);
  console.log(`[Orchestrator] Issues found: ${summary.totals.issuesFound}`);
  console.log(`[Orchestrator] CAPTCHA blockers: ${summary.totals.captchaBlockers}`);
  console.log(`[Orchestrator] Report: ${summary.reportPath}`);
  console.log(`[Orchestrator] Summary JSON: ${summaryPath}`);
}

const mode = (process.argv[2] as RunMode) || 'full';
run(mode).catch(error => {
  console.error('[Orchestrator] Fatal error:', error);
  process.exit(1);
});
