/**
 * Diagnostics Runner Type Definitions
 */

export type IssueSeverity = 'critical' | 'high' | 'medium' | 'low' | 'info';
export type IssueCategory = 
  | 'captcha_blocker'
  | 'console_error'
  | 'page_error'
  | 'network_failure'
  | 'broken_image'
  | 'broken_link'
  | 'workflow_failure'
  | 'timeout'
  | 'ui_error';

export interface DiagnosticIssue {
  id: string;
  category: IssueCategory;
  severity: IssueSeverity;
  url: string;
  selector?: string;
  message: string;
  details?: string;
  stackTrace?: string;
  requestUrl?: string;
  statusCode?: number;
  screenshotPath?: string;
  htmlSnapshotPath?: string;
  timestamp: string;
  recommendedFix?: string;
}

export interface PageAuditResult {
  url: string;
  statusCode: number;
  loadTime: number;
  screenshotPath?: string;
  consoleErrors: ConsoleError[];
  networkFailures: NetworkFailure[];
  brokenImages: BrokenAsset[];
  brokenLinks: BrokenAsset[];
  uiErrors: string[];
  captchaDetected: boolean;
  timestamp: string;
}

export interface ConsoleError {
  type: 'error' | 'warning' | 'pageerror';
  message: string;
  location?: string;
  stackTrace?: string;
}

export interface NetworkFailure {
  url: string;
  method: string;
  statusCode: number;
  statusText: string;
  resourceType: string;
}

export interface BrokenAsset {
  src: string;
  type: 'image' | 'link';
  statusCode?: number;
  reason?: string;
}

export interface WorkflowStep {
  action: 'goto' | 'click' | 'fill' | 'waitForURL' | 'waitForSelector' | 
          'assertVisible' | 'assertText' | 'select' | 'upload' | 'screenshot';
  selector?: string;
  value?: string;
  url?: string;
  text?: string;
  timeout?: number;
  description?: string;
}

export interface Workflow {
  name: string;
  description?: string;
  steps: WorkflowStep[];
  critical?: boolean;
}

export interface WorkflowResult {
  name: string;
  success: boolean;
  stepsCompleted: number;
  totalSteps: number;
  failedStep?: string;
  error?: string;
  screenshotPath?: string;
  tracePath?: string;
  videoPath?: string;
  duration: number;
  captchaDetected: boolean;
}

export interface DiagnosticSummary {
  runId: string;
  startedAt: string;
  completedAt: string;
  duration: number;
  mode: 'crawl' | 'workflows' | 'full';
  baseUrl: string;
  
  totals: {
    pagesVisited: number;
    workflowsRun: number;
    issuesFound: number;
    captchaBlockers: number;
  };
  
  severityCounts: {
    critical: number;
    high: number;
    medium: number;
    low: number;
    info: number;
  };
  
  categoryCounts: Record<IssueCategory, number>;
  
  issues: DiagnosticIssue[];
  
  pageResults: PageAuditResult[];
  workflowResults: WorkflowResult[];
  
  blockers: string[];
  
  nextSteps: string[];
  
  reportPath: string;
  artifactsPath: string;
}

export interface CrawlState {
  visited: Set<string>;
  queue: string[];
  results: PageAuditResult[];
}
