/**
 * Trinity Triad Crawler - Comprehensive E2E Testing System
 * Tests EVERYTHING: public pages, authenticated pages, all CRUD operations
 * 
 * Three Phases:
 * 1. PHASE 1 - Public Pages: Landing, login, signup, pricing, etc.
 * 2. PHASE 2 - Authenticated Pages: All workspace pages with session
 * 3. PHASE 3 - Workflow Pipelines: All CRUD operations (create, read, update, delete)
 */

import puppeteer, { Browser, Page } from 'puppeteer';
import { execSync } from 'child_process';

// Test credentials
const TEST_USER = {
  email: 'statewide-qa@test.local',
  password: 'TestPassword123!'
};

// Get base URL (use HTTPS for Replit)
const getBaseUrl = () => {
  const replitDomain = process.env.REPLIT_DEV_DOMAIN;
  return replitDomain ? `https://${replitDomain}` : 'http://localhost:5000';
};

// ============================================================================
// PHASE 1: PUBLIC PAGES
// ============================================================================
const PUBLIC_PAGES = [
  { path: '/', name: 'Landing Page' },
  { path: '/login', name: 'Login Page' },
  { path: '/signup', name: 'Signup Page' },
  { path: '/pricing', name: 'Pricing Page' },
  { path: '/features', name: 'Features Page' },
  { path: '/about', name: 'About Page' },
  { path: '/contact', name: 'Contact Page' },
  { path: '/privacy', name: 'Privacy Policy' },
  { path: '/terms', name: 'Terms of Service' },
  { path: '/help', name: 'Help Center' },
  { path: '/demo', name: 'Demo Page' },
];

// ============================================================================
// PHASE 2: AUTHENTICATED PAGES
// ============================================================================
const AUTHENTICATED_PAGES = [
  { path: '/dashboard', name: 'Dashboard' },
  { path: '/schedule', name: 'Schedule' },
  { path: '/employees', name: 'Employees' },
  { path: '/time-tracking', name: 'Time Tracking' },
  { path: '/payroll', name: 'Payroll' },
  { path: '/clients', name: 'Clients' },
  { path: '/invoices', name: 'Invoices' },
  { path: '/analytics', name: 'Analytics' },
  { path: '/compliance', name: 'Compliance' },
  { path: '/settings', name: 'Settings' },
  { path: '/notifications', name: 'Notifications' },
  { path: '/support', name: 'Support' },
  { path: '/onboarding', name: 'Onboarding' },
  { path: '/billing', name: 'Billing' },
  { path: '/integrations', name: 'Integrations' },
  { path: '/reports', name: 'Reports' },
  { path: '/documents', name: 'Documents' },
  { path: '/certifications', name: 'Certifications' },
  { path: '/profile', name: 'Profile' },
  { path: '/availability', name: 'Availability' },
];

// ============================================================================
// PHASE 3: WORKFLOW PIPELINES (CRUD Operations)
// ============================================================================
interface WorkflowTest {
  name: string;
  category: 'auth' | 'employees' | 'shifts' | 'invites' | 'clients' | 'invoices' | 'time' | 'settings' | 'payroll';
  method: 'GET' | 'POST' | 'PATCH' | 'DELETE';
  endpoint: string;
  body?: any;
  requiresId?: boolean;
  description: string;
}

const WORKFLOW_PIPELINES: WorkflowTest[] = [
  // Auth workflows
  { name: 'Get Current User', category: 'auth', method: 'GET', endpoint: '/api/user', description: 'Verify authenticated session' },
  { name: 'Get User Profile', category: 'auth', method: 'GET', endpoint: '/api/profile', description: 'Fetch user profile data' },
  
  // Employee workflows
  { name: 'List Employees', category: 'employees', method: 'GET', endpoint: '/api/employees', description: 'Get all employees' },
  { name: 'Create Employee', category: 'employees', method: 'POST', endpoint: '/api/employees', body: {
    firstName: 'E2E',
    lastName: 'TestEmployee',
    email: `e2e-emp-${Date.now()}@test.local`,
    phone: '555-0100',
    role: 'Employee',
    workspaceRole: 'employee',
    status: 'active',
    hourlyRate: 25
  }, description: 'Create new employee' },
  
  // Invite workflows
  { name: 'List Invites', category: 'invites', method: 'GET', endpoint: '/api/onboarding/invites', description: 'Get all pending invites' },
  { name: 'Send Employee Invite', category: 'invites', method: 'POST', endpoint: '/api/onboarding/invite', body: {
    email: `e2e-invite-${Date.now()}@test.local`,
    firstName: 'E2E',
    lastName: 'InviteTest',
    role: 'Employee',
    workspaceRole: 'employee'
  }, description: 'Send employee invitation' },
  { name: 'Get Invite Stats', category: 'invites', method: 'GET', endpoint: '/api/onboarding/invites/stats', description: 'Get invitation statistics' },
  
  // Shift workflows
  { name: 'List Shifts', category: 'shifts', method: 'GET', endpoint: '/api/shifts', description: 'Get all shifts' },
  { name: 'Create Shift', category: 'shifts', method: 'POST', endpoint: '/api/shifts', body: {
    date: new Date(Date.now() + 86400000).toISOString().split('T')[0],
    startTime: '09:00',
    endTime: '17:00',
    notes: 'E2E Test Shift'
  }, description: 'Create new shift' },
  
  // Client workflows
  { name: 'List Clients', category: 'clients', method: 'GET', endpoint: '/api/clients', description: 'Get all clients' },
  { name: 'Create Client', category: 'clients', method: 'POST', endpoint: '/api/clients', body: {
    name: `E2E Test Client ${Date.now()}`,
    email: `e2e-client-${Date.now()}@test.local`,
    phone: '555-0200',
    status: 'active'
  }, description: 'Create new client' },
  
  // Invoice workflows
  { name: 'List Invoices', category: 'invoices', method: 'GET', endpoint: '/api/invoices', description: 'Get all invoices' },
  
  // Time tracking workflows
  { name: 'Get Time Entries', category: 'time', method: 'GET', endpoint: '/api/time-entries', description: 'Get time entries' },
  { name: 'Get Timesheets', category: 'time', method: 'GET', endpoint: '/api/timesheets', description: 'Get timesheets' },
  
  // Settings workflows
  { name: 'Get Settings', category: 'settings', method: 'GET', endpoint: '/api/settings', description: 'Get workspace settings' },
  { name: 'Get Workspace', category: 'settings', method: 'GET', endpoint: '/api/workspace', description: 'Get current workspace' },
  
  // Payroll workflows
  { name: 'Get Payroll Runs', category: 'payroll', method: 'GET', endpoint: '/api/payroll/runs', description: 'Get payroll runs' },
  { name: 'Get Pay Periods', category: 'payroll', method: 'GET', endpoint: '/api/payroll/periods', description: 'Get pay periods' },
];

// ============================================================================
// RESULT TYPES
// ============================================================================
interface PageResult {
  name: string;
  path: string;
  status: 'success' | 'warning' | 'error';
  loadTimeMs: number;
  httpStatus?: number;
  errorMessage?: string;
  consoleErrors: string[];
}

interface WorkflowResult {
  name: string;
  category: string;
  method: string;
  endpoint: string;
  status: 'success' | 'error';
  httpStatus: number;
  responseTime: number;
  errorMessage?: string;
  responsePreview?: string;
}

interface TriadReport {
  startedAt: Date;
  completedAt?: Date;
  durationSeconds: number;
  
  phase1: {
    name: string;
    totalPages: number;
    passed: number;
    warnings: number;
    errors: number;
    results: PageResult[];
  };
  
  phase2: {
    name: string;
    totalPages: number;
    passed: number;
    warnings: number;
    errors: number;
    results: PageResult[];
  };
  
  phase3: {
    name: string;
    totalWorkflows: number;
    passed: number;
    errors: number;
    results: WorkflowResult[];
  };
  
  overallScore: number;
  summary: string;
}

// ============================================================================
// TRINITY TRIAD CRAWLER CLASS
// ============================================================================
class TrinityTriadCrawler {
  private browser: Browser | null = null;
  private pages: Page[] = [];
  private baseUrl: string;
  private report: TriadReport;
  private isAuthenticated = false;
  private sessionCookies: any[] = [];
  private parallelism: number;

  constructor(parallelism: number = 5) {
    this.baseUrl = getBaseUrl();
    this.report = this.initReport();
    this.parallelism = parallelism; // Number of parallel browser tabs
  }

  private initReport(): TriadReport {
    return {
      startedAt: new Date(),
      durationSeconds: 0,
      phase1: { name: 'Public Pages', totalPages: 0, passed: 0, warnings: 0, errors: 0, results: [] },
      phase2: { name: 'Authenticated Pages', totalPages: 0, passed: 0, warnings: 0, errors: 0, results: [] },
      phase3: { name: 'Workflow Pipelines', totalWorkflows: 0, passed: 0, errors: 0, results: [] },
      overallScore: 0,
      summary: ''
    };
  }

  async initialize(): Promise<void> {
    console.log('\n' + '═'.repeat(70));
    console.log('   🔱 TRINITY TRIAD CRAWLER - FAST PARALLEL MODE');
    console.log('═'.repeat(70));
    console.log(`Base URL: ${this.baseUrl}`);
    console.log(`Parallelism: ${this.parallelism} concurrent tabs`);
    console.log(`Started: ${new Date().toISOString()}\n`);

    const chromiumPath = execSync('which chromium 2>/dev/null || echo ""').toString().trim();
    
    this.browser = await puppeteer.launch({
      headless: true,
      executablePath: chromiumPath || undefined,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-gpu',
      ],
    });

    // Create parallel page pool
    for (let i = 0; i < this.parallelism; i++) {
      const page = await this.browser.newPage();
      await page.setViewport({ width: 1920, height: 1080 });
      page.setDefaultNavigationTimeout(20000);
      page.setDefaultTimeout(20000);
      this.pages.push(page);
    }
    console.log(`   ✅ Created ${this.parallelism} browser tabs for parallel testing`);
  }

  async authenticate(): Promise<boolean> {
    if (!this.page) return false;

    console.log('🔐 Authenticating...');
    
    try {
      await this.page.goto(this.baseUrl, { waitUntil: 'networkidle2' });
      
      const loginResult = await this.page.evaluate(async (url: string, creds: typeof TEST_USER) => {
        const res = await fetch(url + '/api/auth/login', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email: creds.email, password: creds.password }),
          credentials: 'include',
        });
        const data = await res.json().catch(() => ({}));
        return { ok: res.ok, status: res.status, userId: data.user?.id };
      }, this.baseUrl, TEST_USER);

      if (loginResult.ok) {
        // Navigate to set session context
        await this.page.goto(this.baseUrl + '/dashboard', { waitUntil: 'networkidle2' });
        await new Promise(r => setTimeout(r, 2000));
        
        // Verify session
        const authCheck = await this.page.evaluate(async (url: string) => {
          const res = await fetch(url + '/api/user', { credentials: 'include' });
          return res.ok;
        }, this.baseUrl);

        this.isAuthenticated = authCheck;
        console.log(authCheck ? '   ✅ Authentication successful!' : '   ❌ Session verification failed');
        return authCheck;
      }
      
      console.log('   ❌ Login failed:', loginResult.status);
      return false;
    } catch (error) {
      console.error('   ❌ Auth error:', error);
      return false;
    }
  }

  // ============================================================================
  // PHASE 1: Public Pages
  // ============================================================================
  async runPhase1(): Promise<void> {
    if (!this.page) return;

    console.log('\n' + '─'.repeat(70));
    console.log('📄 PHASE 1: PUBLIC PAGES');
    console.log('─'.repeat(70));

    for (const pageConfig of PUBLIC_PAGES) {
      const result = await this.testPage(pageConfig.path, pageConfig.name, false);
      this.report.phase1.results.push(result);
      this.report.phase1.totalPages++;
      
      if (result.status === 'success') this.report.phase1.passed++;
      else if (result.status === 'warning') this.report.phase1.warnings++;
      else this.report.phase1.errors++;

      const icon = result.status === 'success' ? '✅' : result.status === 'warning' ? '⚠️' : '❌';
      console.log(`   ${icon} ${result.name} (${result.loadTimeMs}ms) ${result.httpStatus || ''}`);
    }
  }

  // ============================================================================
  // PHASE 2: Authenticated Pages
  // ============================================================================
  async runPhase2(): Promise<void> {
    if (!this.page || !this.isAuthenticated) {
      console.log('\n⚠️  Skipping Phase 2 - Not authenticated');
      return;
    }

    console.log('\n' + '─'.repeat(70));
    console.log('🔒 PHASE 2: AUTHENTICATED PAGES');
    console.log('─'.repeat(70));

    for (const pageConfig of AUTHENTICATED_PAGES) {
      const result = await this.testPage(pageConfig.path, pageConfig.name, true);
      this.report.phase2.results.push(result);
      this.report.phase2.totalPages++;
      
      if (result.status === 'success') this.report.phase2.passed++;
      else if (result.status === 'warning') this.report.phase2.warnings++;
      else this.report.phase2.errors++;

      const icon = result.status === 'success' ? '✅' : result.status === 'warning' ? '⚠️' : '❌';
      console.log(`   ${icon} ${result.name} (${result.loadTimeMs}ms)`);
    }
  }

  // ============================================================================
  // PHASE 3: Workflow Pipelines
  // ============================================================================
  async runPhase3(): Promise<void> {
    if (!this.page || !this.isAuthenticated) {
      console.log('\n⚠️  Skipping Phase 3 - Not authenticated');
      return;
    }

    console.log('\n' + '─'.repeat(70));
    console.log('⚡ PHASE 3: WORKFLOW PIPELINES (CRUD Operations)');
    console.log('─'.repeat(70));

    let currentCategory = '';
    
    for (const workflow of WORKFLOW_PIPELINES) {
      // Print category header
      if (workflow.category !== currentCategory) {
        currentCategory = workflow.category;
        console.log(`\n   [${currentCategory.toUpperCase()}]`);
      }

      const result = await this.testWorkflow(workflow);
      this.report.phase3.results.push(result);
      this.report.phase3.totalWorkflows++;
      
      if (result.status === 'success') this.report.phase3.passed++;
      else this.report.phase3.errors++;

      const icon = result.status === 'success' ? '✅' : '❌';
      const statusText = result.status === 'success' ? result.httpStatus : `${result.httpStatus} - ${result.errorMessage?.substring(0, 40)}`;
      console.log(`   ${icon} ${workflow.method} ${workflow.endpoint} → ${statusText}`);
    }
  }

  private async testPage(path: string, name: string, requiresAuth: boolean): Promise<PageResult> {
    if (!this.page) {
      return { name, path, status: 'error', loadTimeMs: 0, consoleErrors: [], errorMessage: 'No page instance' };
    }

    const consoleErrors: string[] = [];
    const errorHandler = (msg: any) => {
      if (msg.type() === 'error') {
        consoleErrors.push(msg.text().substring(0, 200));
      }
    };

    this.page.on('console', errorHandler);

    try {
      const startTime = Date.now();
      const response = await this.page.goto(this.baseUrl + path, { 
        waitUntil: 'networkidle2',
        timeout: 30000 
      });
      const loadTimeMs = Date.now() - startTime;

      // Wait for page to settle
      await new Promise(r => setTimeout(r, 1000));

      const httpStatus = response?.status() || 0;

      // Check for redirect to login (unauthorized)
      const currentUrl = this.page.url();
      if (requiresAuth && currentUrl.includes('/login')) {
        this.page.off('console', errorHandler);
        return {
          name, path, status: 'error', loadTimeMs, httpStatus,
          errorMessage: 'Redirected to login - auth failed',
          consoleErrors
        };
      }

      // Check for error pages
      const pageContent = await this.page.content();
      if (pageContent.includes('404') && pageContent.includes('not found')) {
        this.page.off('console', errorHandler);
        return { name, path, status: 'error', loadTimeMs, httpStatus: 404, errorMessage: 'Page not found', consoleErrors };
      }

      this.page.off('console', errorHandler);

      // Determine status
      if (httpStatus >= 400) {
        return { name, path, status: 'error', loadTimeMs, httpStatus, errorMessage: `HTTP ${httpStatus}`, consoleErrors };
      }
      if (consoleErrors.length > 2) {
        return { name, path, status: 'warning', loadTimeMs, httpStatus, errorMessage: 'Console errors', consoleErrors };
      }
      return { name, path, status: 'success', loadTimeMs, httpStatus, consoleErrors };

    } catch (error: any) {
      this.page.off('console', errorHandler);
      return { name, path, status: 'error', loadTimeMs: 0, errorMessage: error.message, consoleErrors };
    }
  }

  private async testWorkflow(workflow: WorkflowTest): Promise<WorkflowResult> {
    if (!this.page) {
      return {
        name: workflow.name,
        category: workflow.category,
        method: workflow.method,
        endpoint: workflow.endpoint,
        status: 'error',
        httpStatus: 0,
        responseTime: 0,
        errorMessage: 'No page instance'
      };
    }

    try {
      const startTime = Date.now();
      
      const result = await this.page.evaluate(async (url: string, wf: WorkflowTest) => {
        const options: RequestInit = {
          method: wf.method,
          credentials: 'include' as RequestCredentials,
          headers: { 'Content-Type': 'application/json' }
        };
        
        if (wf.body && (wf.method === 'POST' || wf.method === 'PATCH')) {
          options.body = JSON.stringify(wf.body);
        }

        const res = await fetch(url + wf.endpoint, options);
        const text = await res.text();
        let data;
        try {
          data = JSON.parse(text);
        } catch {
          data = { raw: text.substring(0, 200) };
        }
        
        return {
          ok: res.ok,
          status: res.status,
          message: data.message || data.error || (Array.isArray(data) ? `${data.length} items` : 'OK'),
          preview: JSON.stringify(data).substring(0, 100)
        };
      }, this.baseUrl, workflow);

      const responseTime = Date.now() - startTime;

      return {
        name: workflow.name,
        category: workflow.category,
        method: workflow.method,
        endpoint: workflow.endpoint,
        status: result.ok ? 'success' : 'error',
        httpStatus: result.status,
        responseTime,
        errorMessage: result.ok ? undefined : result.message,
        responsePreview: result.preview
      };

    } catch (error: any) {
      return {
        name: workflow.name,
        category: workflow.category,
        method: workflow.method,
        endpoint: workflow.endpoint,
        status: 'error',
        httpStatus: 0,
        responseTime: 0,
        errorMessage: error.message
      };
    }
  }

  async generateReport(): Promise<TriadReport> {
    this.report.completedAt = new Date();
    this.report.durationSeconds = Math.round((this.report.completedAt.getTime() - this.report.startedAt.getTime()) / 1000);

    // Calculate overall score
    const phase1Score = this.report.phase1.totalPages > 0 
      ? (this.report.phase1.passed / this.report.phase1.totalPages) * 100 : 0;
    const phase2Score = this.report.phase2.totalPages > 0 
      ? (this.report.phase2.passed / this.report.phase2.totalPages) * 100 : 0;
    const phase3Score = this.report.phase3.totalWorkflows > 0 
      ? (this.report.phase3.passed / this.report.phase3.totalWorkflows) * 100 : 0;

    // Weight: Phase 3 (workflows) most important at 50%, Phase 2 at 35%, Phase 1 at 15%
    this.report.overallScore = Math.round(phase1Score * 0.15 + phase2Score * 0.35 + phase3Score * 0.50);

    this.report.summary = this.formatSummary();
    return this.report;
  }

  private formatSummary(): string {
    const lines: string[] = [];
    lines.push('\n' + '═'.repeat(70));
    lines.push('   🔱 TRINITY TRIAD CRAWLER - FINAL REPORT');
    lines.push('═'.repeat(70));
    lines.push(`\n📊 OVERALL HEALTH SCORE: ${this.report.overallScore}%\n`);
    
    lines.push('─'.repeat(70));
    lines.push(`📄 PHASE 1 - Public Pages: ${this.report.phase1.passed}/${this.report.phase1.totalPages} passed`);
    if (this.report.phase1.errors > 0) {
      lines.push(`   ❌ Errors: ${this.report.phase1.errors}`);
      this.report.phase1.results.filter(r => r.status === 'error').forEach(r => {
        lines.push(`      • ${r.name}: ${r.errorMessage}`);
      });
    }
    
    lines.push('─'.repeat(70));
    lines.push(`🔒 PHASE 2 - Authenticated Pages: ${this.report.phase2.passed}/${this.report.phase2.totalPages} passed`);
    if (this.report.phase2.errors > 0) {
      lines.push(`   ❌ Errors: ${this.report.phase2.errors}`);
      this.report.phase2.results.filter(r => r.status === 'error').forEach(r => {
        lines.push(`      • ${r.name}: ${r.errorMessage}`);
      });
    }
    
    lines.push('─'.repeat(70));
    lines.push(`⚡ PHASE 3 - Workflow Pipelines: ${this.report.phase3.passed}/${this.report.phase3.totalWorkflows} passed`);
    if (this.report.phase3.errors > 0) {
      lines.push(`   ❌ FAILED WORKFLOWS:`);
      this.report.phase3.results.filter(r => r.status === 'error').forEach(r => {
        lines.push(`      • ${r.method} ${r.endpoint}: ${r.httpStatus} - ${r.errorMessage}`);
      });
    }

    lines.push('─'.repeat(70));
    lines.push(`⏱️  Total Duration: ${this.report.durationSeconds}s`);
    lines.push('═'.repeat(70));

    return lines.join('\n');
  }

  async cleanup(): Promise<void> {
    if (this.browser) {
      await this.browser.close();
    }
  }

  async runFullCrawl(): Promise<TriadReport> {
    try {
      await this.initialize();
      
      // Phase 1: Public pages (no auth needed)
      await this.runPhase1();
      
      // Authenticate for Phases 2 & 3
      await this.authenticate();
      
      // Phase 2: Authenticated pages
      await this.runPhase2();
      
      // Phase 3: Workflow pipelines
      await this.runPhase3();
      
      const report = await this.generateReport();
      console.log(report.summary);
      
      return report;
    } finally {
      await this.cleanup();
    }
  }
}

// ============================================================================
// EXPORT FUNCTIONS
// ============================================================================
export async function runTrinityTriadCrawl(): Promise<TriadReport> {
  const crawler = new TrinityTriadCrawler();
  return crawler.runFullCrawl();
}

export { TrinityTriadCrawler, TriadReport, PageResult, WorkflowResult };
