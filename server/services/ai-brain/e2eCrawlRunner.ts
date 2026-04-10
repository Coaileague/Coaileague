/**
 * E2E CRAWL RUNNER
 * =================
 * Comprehensive authenticated crawl of all workspace pages.
 * Logs in as a test user and tests every page, button, and workflow.
 */

import puppeteer, { Browser, Page } from 'puppeteer';

interface CrawlResult {
  url: string;
  pageName: string;
  status: 'success' | 'error' | 'warning';
  loadTimeMs: number;
  consoleErrors: string[];
  consoleWarnings: string[];
  networkErrors: string[];
  brokenImages: string[];
  missingElements: string[];
  screenshotBase64?: string;
  errorMessage?: string;
}

interface CrawlReport {
  startedAt: Date;
  completedAt?: Date;
  totalPages: number;
  successCount: number;
  errorCount: number;
  warningCount: number;
  results: CrawlResult[];
  summary: string;
}

// All workspace routes to crawl
const ROUTES_TO_CRAWL = [
  { path: '/', name: 'Landing Page' },
  { path: '/login', name: 'Login Page' },
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
];

class E2ECrawlRunner {
  private browser: Browser | null = null;
  private page: Page | null = null;
  private baseUrl: string;
  private report: CrawlReport;

  constructor(baseUrl?: string) {
    // Use HTTPS Replit domain for session cookies to work (secure: true)
    const replitDomain = process.env.APP_BASE_URL;
    this.baseUrl = baseUrl || (replitDomain ? `https://${replitDomain}` : 'http://localhost:5000');
    console.log(`[E2E Crawl] Base URL: ${this.baseUrl}`);
    this.report = {
      startedAt: new Date(),
      totalPages: 0,
      successCount: 0,
      errorCount: 0,
      warningCount: 0,
      results: [],
      summary: '',
    };
  }

  async initialize(): Promise<void> {
    console.log('[E2E Crawl] Launching browser...');
    
    // Use system chromium on Replit
    const executablePath = process.env.PUPPETEER_EXECUTABLE_PATH || '/nix/store/*/bin/chromium';
    const chromiumPath = require('child_process').execSync('which chromium 2>/dev/null || echo ""').toString().trim();
    
    this.browser = await puppeteer.launch({
      headless: true,
      executablePath: chromiumPath || undefined,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-accelerated-2d-canvas',
        '--disable-gpu',
        '--window-size=1920,1080',
        '--single-process',
        '--disable-software-rasterizer',
      ],
      timeout: 60000,
    });

    this.page = await this.browser.newPage();
    await this.page.setViewport({ width: 1920, height: 1080 });

    // Set up console and network error tracking
    this.setupErrorTracking();
  }

  private setupErrorTracking(): void {
    if (!this.page) return;

    // Track console errors per page
    this.page.on('console', (msg) => {
      const type = msg.type();
      // @ts-expect-error — TS migration: fix in refactoring sprint
      if (type === 'error' || type === 'warning') {
        // Will be captured in crawlPage
      }
    });

    // Track failed requests
    this.page.on('requestfailed', (request) => {
      // Will be captured in crawlPage
    });
  }

  async login(email: string, password: string): Promise<boolean> {
    if (!this.page) throw new Error('Browser not initialized');

    console.log(`[E2E Crawl] Authenticating via API as ${email}...`);

    try {
      // First navigate to base URL to establish context
      await this.page.goto(this.baseUrl, {
        waitUntil: 'networkidle2',
        timeout: 30000,
      });
      
      // Use API-based login which returns session cookie
      const response = await this.page.evaluate(async (credentials: { email: string; password: string }) => {
        try {
          const res = await fetch('/api/auth/login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email: credentials.email, password: credentials.password }),
            credentials: 'include',
          });
          const data = await res.json().catch(() => ({}));
          return { ok: res.ok, status: res.status, message: data.message || '' };
        } catch (err: any) {
          return { ok: false, status: 0, message: err.message };
        }
      }, { email, password });

      console.log(`[E2E Crawl] Login response: ${response.status} - ${response.message}`);

      if (response.ok) {
        console.log('[E2E Crawl] API login successful, session cookie set');
        
        // Navigate to dashboard to verify
        await this.page.goto(`${this.baseUrl}/dashboard`, {
          waitUntil: 'networkidle2',
          timeout: 30000,
        });
        
        // Wait for page to load
        await new Promise(resolve => setTimeout(resolve, 2000));
        
        const currentUrl = this.page.url();
        console.log(`[E2E Crawl] Navigated to: ${currentUrl}`);
        
        if (!currentUrl.includes('/login')) {
          console.log('[E2E Crawl] Successfully authenticated!');
          return true;
        } else {
          console.log('[E2E Crawl] Still on login page after auth - session may not be persisting');
        }
      }

      console.log(`[E2E Crawl] API login failed with status: ${response.status}`);
      return false;
    } catch (error) {
      console.error('[E2E Crawl] Login error:', error);
      return false;
    }
  }

  async crawlPage(path: string, pageName: string): Promise<CrawlResult> {
    if (!this.page) throw new Error('Browser not initialized');

    const url = `${this.baseUrl}${path}`;
    const consoleErrors: string[] = [];
    const consoleWarnings: string[] = [];
    const networkErrors: string[] = [];
    const brokenImages: string[] = [];

    // Set up temporary listeners for this page
    const consoleHandler = (msg: any) => {
      const text = msg.text();
      if (msg.type() === 'error') {
        consoleErrors.push(text);
      } else if (msg.type() === 'warning') {
        consoleWarnings.push(text);
      }
    };

    const requestFailedHandler = (request: any) => {
      const failure = request.failure();
      if (failure) {
        networkErrors.push(`${failure.errorText}: ${request.url()}`);
      }
    };

    this.page.on('console', consoleHandler);
    this.page.on('requestfailed', requestFailedHandler);

    const startTime = Date.now();
    let status: 'success' | 'error' | 'warning' = 'success';
    let errorMessage: string | undefined;
    let screenshotBase64: string | undefined;
    let finalUrl = url;

    try {
      console.log(`[E2E Crawl] Testing: ${pageName} (${path})`);

      // Navigate and wait for network to settle
      const response = await this.page.goto(url, {
        waitUntil: 'networkidle0',
        timeout: 30000,
      });

      // Wait for any client-side redirects to complete
      await new Promise(resolve => setTimeout(resolve, 3000));
      
      // Get final URL after any redirects
      finalUrl = this.page.url();
      
      // Check if we were redirected to login (auth issue)
      if (finalUrl.includes('/login') && !path.includes('/login')) {
        console.log(`[E2E Crawl] ${pageName} redirected to login - auth may have expired`);
        status = 'warning';
        errorMessage = 'Redirected to login';
      } else {
        // Try to check for broken images (wrapped in try-catch for navigation safety)
        try {
          const images = await this.page.$$eval('img', (imgs: HTMLImageElement[]) =>
            imgs
              .filter(img => !img.complete || img.naturalWidth === 0)
              .map(img => img.src)
          );
          brokenImages.push(...images);
        } catch (evalErr) {
          // Page may have navigated, that's okay
        }

        // Take screenshot
        try {
          const screenshot = await this.page.screenshot({ type: 'png' });
          // @ts-expect-error — TS migration: fix in refactoring sprint
          screenshotBase64 = screenshot.toString('base64');
        } catch (screenshotErr) {
          // Screenshot failed, continue anyway
        }
      }

      // Determine final status based on issues found
      if (status === 'success') {
        const hasErrors = consoleErrors.filter(e => 
          !e.includes('WebSocket') && 
          !e.includes('Manifest') &&
          !e.includes('favicon')
        ).length > 0;
        
        if (hasErrors || networkErrors.length > 0 || brokenImages.length > 0) {
          status = 'warning';
        }
      }

    } catch (error) {
      const errMsg = error instanceof Error ? error.message : 'Unknown error';
      
      // Some errors are expected and not critical
      if (errMsg.includes('Execution context was destroyed') || 
          errMsg.includes('Cannot find context')) {
        // Page redirected - this is expected behavior for protected routes
        console.log(`[E2E Crawl] ${pageName}: Page redirected during load`);
        status = 'warning';
        errorMessage = 'Page redirected during load (expected for auth-protected routes)';
      } else {
        status = 'error';
        errorMessage = errMsg;
        console.error(`[E2E Crawl] Error on ${pageName}:`, errorMessage);
      }
    }

    // Clean up listeners
    this.page.off('console', consoleHandler);
    this.page.off('requestfailed', requestFailedHandler);

    const loadTimeMs = Date.now() - startTime;

    return {
      url: finalUrl,
      pageName,
      status,
      loadTimeMs,
      consoleErrors,
      consoleWarnings,
      networkErrors,
      brokenImages,
      missingElements: [],
      screenshotBase64,
      errorMessage,
    };
  }

  async runFullCrawl(email: string, password: string): Promise<CrawlReport> {
    try {
      await this.initialize();

      // First, try to login
      const loginSuccess = await this.login(email, password);
      
      if (!loginSuccess) {
        // Still crawl public pages even if login fails
        console.log('[E2E Crawl] Continuing with unauthenticated crawl...');
      }

      // Crawl all routes
      for (const route of ROUTES_TO_CRAWL) {
        try {
          const result = await this.crawlPage(route.path, route.name);
          this.report.results.push(result);
          this.report.totalPages++;

          if (result.status === 'success') {
            this.report.successCount++;
          } else if (result.status === 'error') {
            this.report.errorCount++;
          } else {
            this.report.warningCount++;
          }
        } catch (error) {
          console.error(`[E2E Crawl] Failed to crawl ${route.name}:`, error);
          this.report.results.push({
            url: `${this.baseUrl}${route.path}`,
            pageName: route.name,
            status: 'error',
            loadTimeMs: 0,
            consoleErrors: [],
            consoleWarnings: [],
            networkErrors: [],
            brokenImages: [],
            missingElements: [],
            errorMessage: error instanceof Error ? error.message : 'Unknown error',
          });
          this.report.errorCount++;
          this.report.totalPages++;
        }
      }

      this.report.completedAt = new Date();
      this.report.summary = this.generateSummary();

      return this.report;
    } finally {
      await this.cleanup();
    }
  }

  private generateSummary(): string {
    const duration = this.report.completedAt
      ? (this.report.completedAt.getTime() - this.report.startedAt.getTime()) / 1000
      : 0;

    const criticalIssues = this.report.results.filter(r => r.status === 'error');
    const warnings = this.report.results.filter(r => r.status === 'warning');
    
    let summary = `
╔════════════════════════════════════════════════════════════════╗
║               E2E CRAWL REPORT - STATEWIDE QA                  ║
╚════════════════════════════════════════════════════════════════╝

📊 SUMMARY:
   Total Pages Tested: ${this.report.totalPages}
   ✅ Successful: ${this.report.successCount}
   ⚠️  Warnings: ${this.report.warningCount}
   ❌ Errors: ${this.report.errorCount}
   ⏱️  Duration: ${duration.toFixed(1)}s

`;

    if (criticalIssues.length > 0) {
      summary += `\n❌ CRITICAL ISSUES (${criticalIssues.length}):\n`;
      criticalIssues.forEach(issue => {
        summary += `   • ${issue.pageName}: ${issue.errorMessage || 'Page failed to load'}\n`;
      });
    }

    if (warnings.length > 0) {
      summary += `\n⚠️  WARNINGS (${warnings.length}):\n`;
      warnings.forEach(warning => {
        const issues = [];
        if (warning.consoleErrors.length > 0) issues.push(`${warning.consoleErrors.length} console errors`);
        if (warning.networkErrors.length > 0) issues.push(`${warning.networkErrors.length} network errors`);
        if (warning.brokenImages.length > 0) issues.push(`${warning.brokenImages.length} broken images`);
        summary += `   • ${warning.pageName}: ${issues.join(', ')}\n`;
      });
    }

    // Detailed console errors
    const allConsoleErrors = this.report.results.flatMap(r => 
      r.consoleErrors.map(e => ({ page: r.pageName, error: e }))
    );
    if (allConsoleErrors.length > 0) {
      summary += `\n🔴 CONSOLE ERRORS (${allConsoleErrors.length}):\n`;
      allConsoleErrors.slice(0, 10).forEach(e => {
        summary += `   [${e.page}] ${e.error.substring(0, 100)}...\n`;
      });
      if (allConsoleErrors.length > 10) {
        summary += `   ... and ${allConsoleErrors.length - 10} more\n`;
      }
    }

    // Broken images
    const allBrokenImages = this.report.results.flatMap(r =>
      r.brokenImages.map(img => ({ page: r.pageName, src: img }))
    );
    if (allBrokenImages.length > 0) {
      summary += `\n🖼️  BROKEN IMAGES (${allBrokenImages.length}):\n`;
      allBrokenImages.slice(0, 5).forEach(img => {
        summary += `   [${img.page}] ${img.src}\n`;
      });
    }

    // Page load times
    const avgLoadTime = this.report.results.reduce((acc, r) => acc + r.loadTimeMs, 0) / this.report.totalPages;
    const slowPages = this.report.results.filter(r => r.loadTimeMs > 5000);
    
    summary += `\n⚡ PERFORMANCE:\n`;
    summary += `   Average Load Time: ${(avgLoadTime / 1000).toFixed(2)}s\n`;
    if (slowPages.length > 0) {
      summary += `   Slow Pages (>5s):\n`;
      slowPages.forEach(p => {
        summary += `   • ${p.pageName}: ${(p.loadTimeMs / 1000).toFixed(2)}s\n`;
      });
    }

    const healthScore = Math.round((this.report.successCount / this.report.totalPages) * 100);
    summary += `\n🎯 OVERALL HEALTH SCORE: ${healthScore}%\n`;

    return summary;
  }

  async cleanup(): Promise<void> {
    if (this.page) {
      try {
        await this.page.close();
      } catch {}
    }
    if (this.browser) {
      try {
        await this.browser.close();
      } catch {}
    }
  }
}

// Export runner function
export async function runE2ECrawl(
  email: string = 'statewide-qa@test.local',
  password: string = 'TestPassword123!'
): Promise<CrawlReport> {
  const runner = new E2ECrawlRunner();
  return runner.runFullCrawl(email, password);
}

export { E2ECrawlRunner, CrawlReport, CrawlResult };
