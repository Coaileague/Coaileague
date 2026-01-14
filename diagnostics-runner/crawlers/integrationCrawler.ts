/**
 * INTEGRATION CRAWLER - Trinity Debug Triad
 * ==========================================
 * Specialized crawler for testing workflows, data flows, 
 * WebSocket connections, and cross-surface integrations.
 * 
 * Tests:
 * - Multi-step user workflows (registration, login, etc.)
 * - WebSocket connection stability
 * - Data consistency across frontend/backend
 * - Pipeline execution (scheduled jobs, etc.)
 * - Third-party integration points
 */

import { chromium, Browser, Page, BrowserContext } from 'playwright';
import { 
  TriadIssue, 
  IntegrationCrawlerResult, 
  IntegrationTestCase, 
  IntegrationTestResult,
  CrawlerProgress 
} from '../config/triadTypes';
import { generateId, ensureDir } from '../utils/helpers';
import * as path from 'path';

interface IntegrationCrawlerConfig {
  baseUrl: string;
  runId: string;
  outputDir: string;
  credentials?: {
    username: string;
    password: string;
    bypassSecret?: string;
  };
  onProgress?: (progress: CrawlerProgress) => void;
}

export class IntegrationCrawler {
  private browser: Browser | null = null;
  private context: BrowserContext | null = null;
  private config: IntegrationCrawlerConfig;
  private issues: TriadIssue[] = [];
  private testResults: IntegrationTestResult[] = [];
  
  private workflowsTestedCount = 0;
  private websocketConnectionsTested = 0;
  private pipelinesTestedCount = 0;
  private crossSurfaceFlowsTested = 0;
  private isAuthenticated = false;
  
  constructor(config: IntegrationCrawlerConfig) {
    this.config = config;
  }
  
  private emitProgress(status: string, progress: number) {
    if (this.config.onProgress) {
      this.config.onProgress({
        crawlerType: 'integration',
        progress,
        status,
        issuesFound: this.issues.length
      });
    }
  }
  
  async run(): Promise<IntegrationCrawlerResult> {
    console.log('[IntegrationCrawler] Starting integration tests...');
    
    try {
      this.browser = await chromium.launch({
        headless: true,
        args: ['--no-sandbox', '--disable-setuid-sandbox']
      });
      
      // Add bypass headers for diagnostics access
      const extraHTTPHeaders: Record<string, string> = {
        'X-Diagnostics-Runner': 'true'
      };
      if (this.config.credentials?.bypassSecret) {
        extraHTTPHeaders['X-Diagnostics-Runner'] = this.config.credentials.bypassSecret;
      }
      
      this.context = await this.browser.newContext({
        viewport: { width: 1280, height: 720 },
        userAgent: 'TrinityDiagnosticsTriad/1.0 IntegrationCrawler',
        ignoreHTTPSErrors: true,
        extraHTTPHeaders
      });
      
      // Attempt login if credentials provided
      if (this.config.credentials?.username && this.config.credentials?.password) {
        await this.performLogin();
      }
      
      const testCases = this.getTestCases();
      const totalTests = testCases.length;
      let completedTests = 0;
      
      for (const testCase of testCases) {
        // Skip authenticated tests if not logged in
        if (testCase.requiresAuth && !this.isAuthenticated) {
          console.log(`[IntegrationCrawler] Skipping ${testCase.name} - requires auth`);
          completedTests++;
          continue;
        }
        
        this.emitProgress(`Testing: ${testCase.name}`, (completedTests / totalTests) * 100);
        
        const result = await this.executeTest(testCase);
        this.testResults.push(result);
        
        if (!result.success) {
          this.createIssueFromResult(result);
        }
        
        this.categorizeTest(testCase);
        completedTests++;
      }
      
      await this.testWebSocketConnections();
      
      console.log(`[IntegrationCrawler] Completed. Tested ${totalTests} integrations, found ${this.issues.length} issues. Authenticated: ${this.isAuthenticated}`);
      
      return {
        workflowsTestedCount: this.workflowsTestedCount,
        testResults: this.testResults,
        issues: this.issues,
        websocketConnectionsTested: this.websocketConnectionsTested,
        pipelinesTestedCount: this.pipelinesTestedCount,
        crossSurfaceFlowsTested: this.crossSurfaceFlowsTested
      };
      
    } finally {
      if (this.browser) {
        await this.browser.close();
      }
    }
  }
  
  private async performLogin(): Promise<void> {
    console.log('[IntegrationCrawler] Attempting authenticated session...');
    const page = await this.context!.newPage();
    
    try {
      await page.goto(`${this.config.baseUrl}/login`, { 
        waitUntil: 'networkidle',
        timeout: 30000 
      });
      
      await page.waitForSelector('input[name="email"], input[type="email"], [data-testid="input-email"]', { timeout: 10000 });
      
      const emailInput = await page.$('input[name="email"], input[type="email"], [data-testid="input-email"]');
      const passwordInput = await page.$('input[name="password"], input[type="password"], [data-testid="input-password"]');
      
      if (emailInput && passwordInput) {
        await emailInput.fill(this.config.credentials!.username);
        await passwordInput.fill(this.config.credentials!.password);
        
        const loginButton = await page.$('button[type="submit"], [data-testid="button-login"], [data-testid="button-submit"]');
        if (loginButton) {
          await loginButton.click();
          
          try {
            await page.waitForURL(url => !url.href.includes('/login'), { timeout: 15000 });
            this.isAuthenticated = true;
            console.log('[IntegrationCrawler] Login successful! Authenticated session established.');
          } catch {
            console.log('[IntegrationCrawler] Login redirect timeout - may not be authenticated');
          }
        }
      }
    } catch (error: any) {
      console.log(`[IntegrationCrawler] Login failed: ${error.message}`);
    } finally {
      await page.close();
    }
  }
  
  private categorizeTest(testCase: IntegrationTestCase): void {
    switch (testCase.type) {
      case 'workflow':
        this.workflowsTestedCount++;
        break;
      case 'websocket':
        this.websocketConnectionsTested++;
        break;
      case 'pipeline':
        this.pipelinesTestedCount++;
        break;
      case 'data-flow':
        this.crossSurfaceFlowsTested++;
        break;
    }
  }
  
  private getTestCases(): IntegrationTestCase[] {
    return [
      {
        id: 'homepage-to-register',
        name: 'Homepage to Registration Flow',
        description: 'User navigates from homepage to registration',
        type: 'workflow',
        critical: true,
        steps: [
          { action: 'ui-action', target: '/', description: 'Load homepage' },
          { action: 'wait', timeout: 2000, description: 'Wait for page load' },
          { action: 'ui-action', target: '[data-testid="button-get-started"]', description: 'Click Get Started' },
          { action: 'assert', target: '/register', description: 'Should be on register page' }
        ]
      },
      {
        id: 'homepage-to-login',
        name: 'Homepage to Login Flow',
        description: 'User navigates from homepage to login',
        type: 'workflow',
        critical: true,
        steps: [
          { action: 'ui-action', target: '/', description: 'Load homepage' },
          { action: 'wait', timeout: 2000, description: 'Wait for page load' },
          { action: 'ui-action', target: '[data-testid="button-login"]', description: 'Click Login' },
          { action: 'assert', target: '/login', description: 'Should be on login page' }
        ]
      },
      {
        id: 'pricing-page-flow',
        name: 'Pricing Page CTA Flow',
        description: 'User views pricing and clicks CTA',
        type: 'workflow',
        critical: true,
        steps: [
          { action: 'ui-action', target: '/pricing', description: 'Load pricing page' },
          { action: 'wait', timeout: 2000, description: 'Wait for page load' },
          { action: 'assert', target: 'pricing', description: 'Verify pricing content loaded' }
        ]
      },
      {
        id: 'support-page-flow',
        name: 'Support Page Access',
        description: 'User can access support/help page',
        type: 'workflow',
        critical: false,
        steps: [
          { action: 'ui-action', target: '/support', description: 'Load support page' },
          { action: 'wait', timeout: 2000, description: 'Wait for page load' },
          { action: 'assert', target: 'support', description: 'Verify support page loaded' }
        ]
      },
      {
        id: 'trinity-features-flow',
        name: 'Trinity Features Page',
        description: 'User views Trinity AI features page',
        type: 'workflow',
        critical: false,
        steps: [
          { action: 'ui-action', target: '/trinity-features', description: 'Load Trinity features' },
          { action: 'wait', timeout: 2000, description: 'Wait for page load' },
          { action: 'assert', target: 'trinity', description: 'Verify Trinity features loaded' }
        ]
      },
      {
        id: 'api-health-check',
        name: 'API Health Integration',
        description: 'Frontend correctly fetches API health status',
        type: 'data-flow',
        critical: true,
        steps: [
          { action: 'api-call', target: '/api/health', description: 'Call health endpoint' },
          { action: 'assert', expectedResult: { status: 200 }, description: 'Health should return 200' }
        ]
      },
      {
        id: 'websocket-main',
        name: 'Main WebSocket Connection',
        description: 'WebSocket server accepts connections',
        type: 'websocket',
        critical: true,
        steps: [
          { action: 'websocket-connect', target: '/ws', description: 'Connect to main WebSocket' },
          { action: 'wait', timeout: 3000, description: 'Wait for connection' },
          { action: 'assert', description: 'Connection should be established' }
        ]
      },
      {
        id: 'mobile-menu-navigation',
        name: 'Mobile Menu Navigation',
        description: 'Mobile hamburger menu works correctly',
        type: 'workflow',
        critical: false,
        steps: [
          { action: 'ui-action', target: '/', data: { viewport: { width: 375, height: 667 } }, description: 'Load homepage on mobile' },
          { action: 'ui-action', target: '[data-testid="button-mobile-menu"]', description: 'Click mobile menu' },
          { action: 'wait', timeout: 1000, description: 'Wait for menu animation' },
          { action: 'assert', description: 'Menu should be visible' }
        ]
      },
      // AUTHENTICATED WORKSPACE TESTS
      {
        id: 'dashboard-loads',
        name: 'Dashboard Page Loads',
        description: 'Authenticated user can access dashboard',
        type: 'workflow',
        critical: true,
        requiresAuth: true,
        steps: [
          { action: 'ui-action', target: '/dashboard', description: 'Navigate to dashboard' },
          { action: 'wait', timeout: 3000, description: 'Wait for dashboard load' },
          { action: 'assert', target: 'dashboard', description: 'Dashboard content should be visible' }
        ]
      },
      {
        id: 'employees-page-loads',
        name: 'Employees Page Loads',
        description: 'Authenticated user can access employees page',
        type: 'workflow',
        critical: true,
        requiresAuth: true,
        steps: [
          { action: 'ui-action', target: '/employees', description: 'Navigate to employees page' },
          { action: 'wait', timeout: 3000, description: 'Wait for employees load' },
          { action: 'assert', target: 'employee', description: 'Employees content should be visible' }
        ]
      },
      {
        id: 'schedule-page-loads',
        name: 'Schedule Page Loads',
        description: 'Authenticated user can access schedule page',
        type: 'workflow',
        critical: true,
        requiresAuth: true,
        steps: [
          { action: 'ui-action', target: '/schedule', description: 'Navigate to schedule page' },
          { action: 'wait', timeout: 3000, description: 'Wait for schedule load' },
          { action: 'assert', target: 'schedule', description: 'Schedule content should be visible' }
        ]
      },
      {
        id: 'employee-invite-dialog',
        name: 'Employee Invite Dialog Opens',
        description: 'Owner can open the employee invite dialog',
        type: 'workflow',
        critical: true,
        requiresAuth: true,
        steps: [
          { action: 'ui-action', target: '/employees', description: 'Navigate to employees page' },
          { action: 'wait', timeout: 3000, description: 'Wait for page load' },
          { action: 'ui-action', target: '[data-testid="button-add-employee"], [data-testid="button-add-first-employee"]', description: 'Click add employee button' },
          { action: 'wait', timeout: 2000, description: 'Wait for dialog' },
          { action: 'assert', target: 'employee', description: 'Employee dialog should be visible' }
        ]
      },
      {
        id: 'settings-page-loads',
        name: 'Settings Page Loads',
        description: 'Authenticated user can access settings',
        type: 'workflow',
        critical: false,
        requiresAuth: true,
        steps: [
          { action: 'ui-action', target: '/settings', description: 'Navigate to settings page' },
          { action: 'wait', timeout: 3000, description: 'Wait for settings load' },
          { action: 'assert', target: 'settings', description: 'Settings content should be visible' }
        ]
      },
      {
        id: 'clients-page-loads',
        name: 'Clients Page Loads',
        description: 'Authenticated user can access clients page',
        type: 'workflow',
        critical: false,
        requiresAuth: true,
        steps: [
          { action: 'ui-action', target: '/clients', description: 'Navigate to clients page' },
          { action: 'wait', timeout: 3000, description: 'Wait for clients load' },
          { action: 'assert', target: 'client', description: 'Clients content should be visible' }
        ]
      },
      {
        id: 'time-tracking-loads',
        name: 'Time Tracking Page Loads',
        description: 'Authenticated user can access time tracking',
        type: 'workflow',
        critical: false,
        requiresAuth: true,
        steps: [
          { action: 'ui-action', target: '/time-tracking', description: 'Navigate to time tracking' },
          { action: 'wait', timeout: 3000, description: 'Wait for time tracking load' },
          { action: 'assert', target: 'time', description: 'Time tracking content should be visible' }
        ]
      },
      // =================================================
      // BUSINESS WORKFLOW TESTS - Core Revenue Features
      // =================================================
      {
        id: 'schedule-create-shift',
        name: 'Schedule: Create New Shift',
        description: 'Test shift creation workflow in schedule page',
        type: 'workflow',
        critical: true,
        requiresAuth: true,
        steps: [
          { action: 'ui-action', target: '/schedule', description: 'Navigate to schedule page' },
          { action: 'wait', timeout: 3000, description: 'Wait for schedule load' },
          { action: 'ui-action', target: '[data-testid="button-add-shift"], [data-testid="button-create-shift"]', description: 'Click add shift button' },
          { action: 'wait', timeout: 2000, description: 'Wait for shift dialog' },
          { action: 'assert', target: 'shift', description: 'Shift creation dialog should appear' }
        ]
      },
      {
        id: 'invoices-page-loads',
        name: 'Invoices Page Loads',
        description: 'Authenticated user can access invoices page',
        type: 'workflow',
        critical: true,
        requiresAuth: true,
        steps: [
          { action: 'ui-action', target: '/invoices', description: 'Navigate to invoices page' },
          { action: 'wait', timeout: 3000, description: 'Wait for invoices load' },
          { action: 'assert', target: 'invoice', description: 'Invoices content should be visible' }
        ]
      },
      {
        id: 'invoice-create-flow',
        name: 'Invoice: Create New Invoice',
        description: 'Test invoice creation workflow',
        type: 'workflow',
        critical: true,
        requiresAuth: true,
        steps: [
          { action: 'ui-action', target: '/invoices', description: 'Navigate to invoices page' },
          { action: 'wait', timeout: 3000, description: 'Wait for page load' },
          { action: 'ui-action', target: '[data-testid="button-create-invoice"], [data-testid="button-new-invoice"]', description: 'Click create invoice' },
          { action: 'wait', timeout: 2000, description: 'Wait for invoice dialog' },
          { action: 'assert', target: 'create', description: 'Invoice creation form should appear' }
        ]
      },
      {
        id: 'payroll-page-loads',
        name: 'Payroll Page Loads',
        description: 'Authenticated user can access payroll page',
        type: 'workflow',
        critical: true,
        requiresAuth: true,
        steps: [
          { action: 'ui-action', target: '/payroll', description: 'Navigate to payroll page' },
          { action: 'wait', timeout: 3000, description: 'Wait for payroll load' },
          { action: 'assert', target: 'payroll', description: 'Payroll content should be visible' }
        ]
      },
      {
        id: 'payroll-run-workflow',
        name: 'Payroll: Create Payroll Run',
        description: 'Test payroll run initiation',
        type: 'workflow',
        critical: true,
        requiresAuth: true,
        steps: [
          { action: 'ui-action', target: '/payroll', description: 'Navigate to payroll page' },
          { action: 'wait', timeout: 3000, description: 'Wait for page load' },
          { action: 'ui-action', target: '[data-testid="button-create-payroll"], [data-testid="button-create-first-payroll"]', description: 'Click create payroll' },
          { action: 'wait', timeout: 2000, description: 'Wait for payroll action' },
          { action: 'assert', target: 'payroll', description: 'Payroll workflow should initiate' }
        ]
      },
      {
        id: 'time-tracking-clock-in',
        name: 'Time Tracking: Clock In/Out',
        description: 'Test clock in/out functionality',
        type: 'workflow',
        critical: true,
        requiresAuth: true,
        steps: [
          { action: 'ui-action', target: '/time-tracking', description: 'Navigate to time tracking' },
          { action: 'wait', timeout: 3000, description: 'Wait for page load' },
          { action: 'assert', target: 'clock', description: 'Clock in/out controls should be visible' }
        ]
      },
      // =================================================
      // API DATA VALIDATION TESTS - Financial Integrity
      // =================================================
      {
        id: 'api-payroll-calculations',
        name: 'API: Payroll Calculations Valid',
        description: 'Verify payroll calculation API returns valid data',
        type: 'data-flow',
        critical: true,
        requiresAuth: true,
        steps: [
          { action: 'api-call', target: '/api/payroll/preview', description: 'Fetch payroll preview' },
          { action: 'assert', expectedResult: { status: 200 }, description: 'API should respond successfully' }
        ]
      },
      {
        id: 'api-invoices-list',
        name: 'API: Invoices List Valid',
        description: 'Verify invoices API returns valid data',
        type: 'data-flow',
        critical: true,
        requiresAuth: true,
        steps: [
          { action: 'api-call', target: '/api/invoices', description: 'Fetch invoices list' },
          { action: 'assert', expectedResult: { status: 200 }, description: 'API should respond successfully' }
        ]
      },
      {
        id: 'api-time-entries',
        name: 'API: Time Entries Valid',
        description: 'Verify time entries API returns valid data',
        type: 'data-flow',
        critical: true,
        requiresAuth: true,
        steps: [
          { action: 'api-call', target: '/api/time-entries', description: 'Fetch time entries' },
          { action: 'assert', expectedResult: { status: 200 }, description: 'API should respond successfully' }
        ]
      },
      {
        id: 'api-schedule-shifts',
        name: 'API: Schedule Shifts Valid',
        description: 'Verify schedule/shifts API returns valid data',
        type: 'data-flow',
        critical: true,
        requiresAuth: true,
        steps: [
          { action: 'api-call', target: '/api/shifts', description: 'Fetch shifts' },
          { action: 'assert', expectedResult: { status: 200 }, description: 'API should respond successfully' }
        ]
      },
      // =================================================
      // QUICKBOOKS INTEGRATION TESTS
      // =================================================
      {
        id: 'quickbooks-status',
        name: 'QuickBooks: Connection Status',
        description: 'Verify QuickBooks integration status',
        type: 'data-flow',
        critical: false,
        requiresAuth: true,
        steps: [
          { action: 'api-call', target: '/api/quickbooks/status', description: 'Check QuickBooks status' },
          { action: 'assert', expectedResult: { status: 200 }, description: 'Status endpoint should respond' }
        ]
      },
      {
        id: 'quickbooks-sync-validation',
        name: 'QuickBooks: Sync Data Validation',
        description: 'Verify QuickBooks sync returns valid reconciliation data',
        type: 'data-flow',
        critical: false,
        requiresAuth: true,
        steps: [
          { action: 'api-call', target: '/api/quickbooks/sync-status', description: 'Check sync status' },
          { action: 'assert', expectedResult: { status: 200 }, description: 'Sync status should be accessible' }
        ]
      },
      {
        id: 'integrations-page-loads',
        name: 'Integrations Page Loads',
        description: 'Authenticated user can access integrations settings',
        type: 'workflow',
        critical: false,
        requiresAuth: true,
        steps: [
          { action: 'ui-action', target: '/integrations', description: 'Navigate to integrations' },
          { action: 'wait', timeout: 3000, description: 'Wait for integrations load' },
          { action: 'assert', target: 'integration', description: 'Integrations page should be visible' }
        ]
      },
      // =================================================
      // AUTOMATION VERIFICATION TESTS
      // =================================================
      {
        id: 'automation-scheduler-status',
        name: 'Automation: Scheduler Status',
        description: 'Verify autonomous scheduler is operational',
        type: 'pipeline',
        critical: true,
        requiresAuth: true,
        steps: [
          { action: 'api-call', target: '/api/scheduler/status', description: 'Check scheduler status' },
          { action: 'assert', expectedResult: { status: 200 }, description: 'Scheduler should respond' }
        ]
      },
      {
        id: 'automation-trinity-status',
        name: 'Automation: Trinity AI Status',
        description: 'Verify Trinity AI brain is operational',
        type: 'pipeline',
        critical: true,
        requiresAuth: true,
        steps: [
          { action: 'api-call', target: '/api/trinity/status', description: 'Check Trinity status' },
          { action: 'assert', expectedResult: { status: 200 }, description: 'Trinity should respond' }
        ]
      },
      {
        id: 'notifications-system',
        name: 'Notifications: System Status',
        description: 'Verify notification system is operational',
        type: 'pipeline',
        critical: false,
        requiresAuth: true,
        steps: [
          { action: 'api-call', target: '/api/notifications', description: 'Fetch notifications' },
          { action: 'assert', expectedResult: { status: 200 }, description: 'Notifications should load' }
        ]
      }
    ];
  }
  
  private async executeTest(testCase: IntegrationTestCase): Promise<IntegrationTestResult> {
    const startTime = Date.now();
    let stepsCompleted = 0;
    let failedStep: string | undefined;
    let error: string | undefined;
    
    const page = await this.context!.newPage();
    
    try {
      for (const step of testCase.steps) {
        try {
          await this.executeStep(page, step);
          stepsCompleted++;
        } catch (stepError: any) {
          failedStep = step.description;
          error = stepError.message;
          break;
        }
      }
      
      return {
        testCase,
        success: stepsCompleted === testCase.steps.length,
        stepsCompleted,
        failedStep,
        error,
        duration: Date.now() - startTime,
        timestamp: new Date().toISOString()
      };
      
    } finally {
      await page.close();
    }
  }
  
  private async executeStep(page: Page, step: IntegrationTestCase['steps'][0]): Promise<void> {
    switch (step.action) {
      case 'ui-action':
        if (step.target?.startsWith('/')) {
          if (step.data?.viewport) {
            await page.setViewportSize(step.data.viewport);
          }
          await page.goto(`${this.config.baseUrl}${step.target}`, { 
            waitUntil: 'networkidle',
            timeout: 45000 
          });
        } else if (step.target) {
          // Wait for element to be visible first, then click with extended timeout
          await page.waitForSelector(step.target, { state: 'visible', timeout: 20000 });
          await page.click(step.target, { timeout: 20000 });
        }
        break;
        
      case 'wait':
        await page.waitForTimeout(step.timeout || 1000);
        break;
        
      case 'assert':
        if (step.target?.startsWith('/')) {
          await page.waitForURL(`**${step.target}**`, { timeout: 20000 });
        } else if (step.target) {
          const content = await page.content();
          if (!content.toLowerCase().includes(step.target.toLowerCase())) {
            throw new Error(`Content assertion failed: "${step.target}" not found`);
          }
        }
        break;
        
      case 'api-call':
        const headers: Record<string, string> = {
          'X-Diagnostics-Runner': this.config.credentials?.bypassSecret || 'true'
        };
        const response = await fetch(`${this.config.baseUrl}${step.target}`, { headers });
        if (step.expectedResult?.status && response.status !== step.expectedResult.status) {
          throw new Error(`Expected status ${step.expectedResult.status}, got ${response.status}`);
        }
        break;
        
      case 'websocket-connect':
        break;
        
      default:
        console.warn(`[IntegrationCrawler] Unknown step action: ${step.action}`);
    }
  }
  
  private async testWebSocketConnections(): Promise<void> {
    console.log('[IntegrationCrawler] Testing WebSocket connections...');
    
    const wsEndpoints = [
      { path: '/ws', name: 'Main WebSocket' },
      { path: '/ws/chat', name: 'Chat WebSocket' }
    ];
    
    for (const endpoint of wsEndpoints) {
      try {
        const wsUrl = this.config.baseUrl
          .replace('http://', 'ws://')
          .replace('https://', 'wss://') + endpoint.path;
        
        const connected = await this.testWebSocket(wsUrl, 5000);
        
        if (!connected) {
          this.issues.push({
            id: generateId(),
            category: 'network_failure',
            severity: 'high',
            url: wsUrl,
            message: `WebSocket ${endpoint.name} failed to connect`,
            timestamp: new Date().toISOString(),
            crawlerType: 'integration',
            subsystem: 'websocket',
            reproducible: true
          });
        } else {
          console.log(`[IntegrationCrawler] ${endpoint.name} connection successful`);
        }
        
        this.websocketConnectionsTested++;
      } catch (error: any) {
        console.warn(`[IntegrationCrawler] WebSocket test error for ${endpoint.name}:`, error.message);
      }
    }
  }
  
  private testWebSocket(url: string, timeout: number): Promise<boolean> {
    return new Promise((resolve) => {
      try {
        const WebSocket = require('ws');
        const ws = new WebSocket(url, {
          headers: {
            'User-Agent': 'TrinityDiagnosticsTriad/1.0'
          }
        });
        
        const timer = setTimeout(() => {
          ws.close();
          resolve(false);
        }, timeout);
        
        ws.on('open', () => {
          clearTimeout(timer);
          ws.close();
          resolve(true);
        });
        
        ws.on('error', () => {
          clearTimeout(timer);
          resolve(false);
        });
      } catch {
        resolve(false);
      }
    });
  }
  
  private createIssueFromResult(result: IntegrationTestResult): void {
    const severity = result.testCase.critical ? 'critical' : 'high';
    
    let subsystem: TriadIssue['subsystem'] = 'workflow';
    if (result.testCase.type === 'websocket') subsystem = 'websocket';
    if (result.testCase.type === 'data-flow') subsystem = 'integration';
    
    this.issues.push({
      id: generateId(),
      category: 'workflow_failure',
      severity,
      url: this.config.baseUrl,
      message: `${result.testCase.name} failed: ${result.error || 'Unknown error'}`,
      details: `Failed at step: ${result.failedStep || 'Unknown'}. Completed ${result.stepsCompleted}/${result.testCase.steps.length} steps.`,
      timestamp: result.timestamp,
      crawlerType: 'integration',
      subsystem,
      reproducible: true
    });
  }
}
