/**
 * TRINITY DEBUG TRIAD - Type Definitions
 * =======================================
 * Enhanced types for the 3-crawler parallel diagnostics system.
 * 
 * Crawlers:
 * - UI Crawler: Pages, buttons, links, forms, visual checks
 * - API Crawler: Endpoints, authentication, validation, database
 * - Integration Crawler: Workflows, data flows, WebSocket, pipelines
 */

import { DiagnosticIssue, IssueSeverity, IssueCategory, PageAuditResult, WorkflowResult } from './types';

export type CrawlerType = 'ui' | 'api' | 'integration';

export type Subsystem = 
  | 'frontend'      // React components, pages, UI elements
  | 'backend'       // Express routes, middleware, services
  | 'database'      // PostgreSQL, Drizzle ORM operations
  | 'auth'          // Authentication, sessions, RBAC
  | 'websocket'     // Real-time connections
  | 'ai'            // Trinity/Gemini integrations
  | 'integration'   // Third-party: Stripe, QuickBooks, etc.
  | 'workflow'      // Multi-step business processes
  | 'performance'   // Speed, memory, response times
  | 'unknown';

export interface TriadIssue extends DiagnosticIssue {
  crawlerType: CrawlerType;
  subsystem: Subsystem;
  affectedComponent?: string;
  reproducible: boolean;
  aiAnalysis?: {
    rootCause: string;
    fixRecommendation: string;
    codeSnippet?: string;
    filesLikelyAffected: string[];
    estimatedEffort: 'trivial' | 'easy' | 'medium' | 'complex';
    confidence: number;
    relatedIssues?: string[];
  };
}

export interface CrawlerTelemetry {
  crawlerId: string;
  crawlerType: CrawlerType;
  status: 'initializing' | 'running' | 'completed' | 'failed';
  progress: number;
  startedAt: string;
  lastHeartbeat: string;
  currentTask?: string;
  tasksCompleted: number;
  totalTasks: number;
  issuesFound: number;
  errors: string[];
}

export interface APITestCase {
  id: string;
  name: string;
  endpoint: string;
  method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  headers?: Record<string, string>;
  body?: any;
  expectedStatus: number | number[];
  validateResponse?: (response: any) => boolean;
  requiresAuth: boolean;
  description?: string;
}

export interface APITestResult {
  testCase: APITestCase;
  success: boolean;
  statusCode: number;
  responseTime: number;
  responseBody?: any;
  error?: string;
  timestamp: string;
}

export interface IntegrationTestCase {
  id: string;
  name: string;
  description: string;
  type: 'workflow' | 'websocket' | 'pipeline' | 'data-flow';
  steps: IntegrationStep[];
  critical: boolean;
}

export interface IntegrationStep {
  action: 'api-call' | 'ui-action' | 'wait' | 'assert' | 'websocket-connect' | 'websocket-message' | 'db-check';
  target?: string;
  data?: any;
  expectedResult?: any;
  timeout?: number;
  description: string;
}

export interface IntegrationTestResult {
  testCase: IntegrationTestCase;
  success: boolean;
  stepsCompleted: number;
  failedStep?: string;
  error?: string;
  duration: number;
  timestamp: string;
}

export interface UICrawlerResult {
  pagesVisited: number;
  pageResults: PageAuditResult[];
  issues: TriadIssue[];
  buttonsTestedCount: number;
  formsTestedCount: number;
  linksCheckedCount: number;
  accessibilityScore?: number;
}

export interface APICrawlerResult {
  endpointsTestedCount: number;
  testResults: APITestResult[];
  issues: TriadIssue[];
  authFlowsTestedCount: number;
  averageResponseTime: number;
  slowestEndpoints: Array<{ endpoint: string; responseTime: number }>;
}

export interface IntegrationCrawlerResult {
  workflowsTestedCount: number;
  testResults: IntegrationTestResult[];
  issues: TriadIssue[];
  websocketConnectionsTested: number;
  pipelinesTestedCount: number;
  crossSurfaceFlowsTested: number;
}

export interface TriadReport {
  runId: string;
  startedAt: string;
  completedAt: string;
  duration: number;
  baseUrl: string;
  mode: 'ui-only' | 'api-only' | 'integration-only' | 'full-triad';
  
  crawlerResults: {
    ui?: UICrawlerResult;
    api?: APICrawlerResult;
    integration?: IntegrationCrawlerResult;
  };
  
  allIssues: TriadIssue[];
  
  summary: {
    totalIssuesFound: number;
    criticalCount: number;
    highCount: number;
    mediumCount: number;
    lowCount: number;
    bySubsystem: Record<Subsystem, number>;
    byCrawler: Record<CrawlerType, number>;
    readinessScore: number;
    blockers: string[];
  };
  
  prioritizedFixes: Array<{
    rank: number;
    issue: TriadIssue;
    estimatedImpact: 'high' | 'medium' | 'low';
    fixInstructions: string;
  }>;
  
  trinityInsights: {
    overallAssessment: string;
    topPriorities: string[];
    quickWins: string[];
    technicalDebt: string[];
    launchReadiness: 'ready' | 'needs-work' | 'not-ready';
    confidenceScore: number;
  };
  
  artifactsPath: string;
  reportPath: string;
}

export interface TriadOrchestratorConfig {
  baseUrl: string;
  runId: string;
  mode: TriadReport['mode'];
  parallel: boolean;
  maxPagesPerCrawler: number;
  timeout: number;
  credentials?: {
    username: string;
    password: string;
    bypassSecret?: string;
  };
  enableAIAnalysis: boolean;
  outputDir: string;
}

export interface CrawlerProgress {
  crawlerType: CrawlerType;
  progress: number;
  status: string;
  issuesFound: number;
}

export type TriadEventType = 
  | 'crawler:started'
  | 'crawler:progress'
  | 'crawler:completed'
  | 'crawler:error'
  | 'issue:found'
  | 'orchestrator:started'
  | 'orchestrator:completed'
  | 'report:generated';

export interface TriadEvent {
  type: TriadEventType;
  crawlerType?: CrawlerType;
  data: any;
  timestamp: string;
}
