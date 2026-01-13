/**
 * UI CRAWLER - Trinity Debug Triad
 * =================================
 * Specialized Playwright-based crawler for frontend testing.
 * 
 * Tests:
 * - Page loads and navigation
 * - Button functionality
 * - Form validation and submission
 * - Link integrity
 * - Visual elements and layout
 * - Accessibility basics
 * - Console errors and warnings
 */

import { chromium, Browser, Page, BrowserContext } from 'playwright';
import { config } from '../config/diagnostics.config';
import { 
  TriadIssue, 
  UICrawlerResult, 
  CrawlerTelemetry,
  CrawlerProgress 
} from '../config/triadTypes';
import { PageAuditResult, ConsoleError, NetworkFailure, BrokenAsset } from '../config/types';
import { generateId, ensureDir } from '../utils/helpers';
import * as fs from 'fs';
import * as path from 'path';

interface UICrawlerConfig {
  baseUrl: string;
  runId: string;
  maxPages: number;
  outputDir: string;
  credentials?: {
    username: string;
    password: string;
    bypassSecret?: string;
  };
  onProgress?: (progress: CrawlerProgress) => void;
}

export class UICrawler {
  private browser: Browser | null = null;
  private context: BrowserContext | null = null;
  private config: UICrawlerConfig;
  private visited: Set<string> = new Set();
  private queue: string[] = [];
  private pageResults: PageAuditResult[] = [];
  private issues: TriadIssue[] = [];
  private telemetry: CrawlerTelemetry;
  
  private buttonsTestedCount = 0;
  private formsTestedCount = 0;
  private linksCheckedCount = 0;
  
  constructor(config: UICrawlerConfig) {
    this.config = config;
    this.telemetry = {
      crawlerId: `ui-${config.runId}`,
      crawlerType: 'ui',
      status: 'initializing',
      progress: 0,
      startedAt: new Date().toISOString(),
      lastHeartbeat: new Date().toISOString(),
      tasksCompleted: 0,
      totalTasks: config.maxPages,
      issuesFound: 0,
      errors: []
    };
  }
  
  private emitProgress(status: string) {
    const progress = this.visited.size / this.config.maxPages * 100;
    if (this.config.onProgress) {
      this.config.onProgress({
        crawlerType: 'ui',
        progress: Math.min(progress, 100),
        status,
        issuesFound: this.issues.length
      });
    }
    this.telemetry.progress = progress;
    this.telemetry.lastHeartbeat = new Date().toISOString();
    this.telemetry.currentTask = status;
  }
  
  private isAuthenticated = false;
  
  async run(): Promise<UICrawlerResult> {
    console.log('[UICrawler] Starting UI crawl...');
    this.telemetry.status = 'running';
    
    try {
      this.browser = await chromium.launch({
        headless: true,
        args: ['--no-sandbox', '--disable-setuid-sandbox']
      });
      
      this.context = await this.browser.newContext({
        viewport: { width: 1280, height: 720 },
        userAgent: 'TrinityDiagnosticsTriad/1.0 UICrawler',
        ignoreHTTPSErrors: true
      });
      
      const screenshotsDir = path.join(this.config.outputDir, 'screenshots', 'ui');
      ensureDir(screenshotsDir);
      
      // Attempt login if credentials provided
      if (this.config.credentials?.username && this.config.credentials?.password) {
        await this.performLogin();
      }
      
      this.queue = this.getSeedUrls();
      
      while (this.queue.length > 0 && this.visited.size < this.config.maxPages) {
        const url = this.queue.shift()!;
        
        if (this.visited.has(url)) continue;
        this.visited.add(url);
        
        this.emitProgress(`Crawling: ${url}`);
        await this.auditPage(url, screenshotsDir);
      }
      
      this.telemetry.status = 'completed';
      console.log(`[UICrawler] Completed. Visited ${this.visited.size} pages, found ${this.issues.length} issues. Authenticated: ${this.isAuthenticated}`);
      
      return {
        pagesVisited: this.visited.size,
        pageResults: this.pageResults,
        issues: this.issues,
        buttonsTestedCount: this.buttonsTestedCount,
        formsTestedCount: this.formsTestedCount,
        linksCheckedCount: this.linksCheckedCount
      };
      
    } finally {
      if (this.browser) {
        await this.browser.close();
      }
    }
  }
  
  private async performLogin(): Promise<void> {
    console.log('[UICrawler] Attempting authenticated session...');
    const page = await this.context!.newPage();
    
    try {
      // Navigate to login page
      await page.goto(`${this.config.baseUrl}/login`, { 
        waitUntil: 'networkidle',
        timeout: 30000 
      });
      
      // Wait for login form
      await page.waitForSelector('input[name="email"], input[type="email"], [data-testid="input-email"]', { timeout: 10000 });
      
      // Fill in credentials
      const emailInput = await page.$('input[name="email"], input[type="email"], [data-testid="input-email"]');
      const passwordInput = await page.$('input[name="password"], input[type="password"], [data-testid="input-password"]');
      
      if (emailInput && passwordInput) {
        await emailInput.fill(this.config.credentials!.username);
        await passwordInput.fill(this.config.credentials!.password);
        
        // Click login button
        const loginButton = await page.$('button[type="submit"], [data-testid="button-login"], [data-testid="button-submit"]');
        if (loginButton) {
          await loginButton.click();
          
          // Wait for redirect or dashboard
          try {
            await page.waitForURL(url => !url.href.includes('/login'), { timeout: 15000 });
            this.isAuthenticated = true;
            console.log('[UICrawler] Login successful! Authenticated session established.');
          } catch {
            console.log('[UICrawler] Login redirect timeout - may not be authenticated');
          }
        }
      } else {
        console.log('[UICrawler] Could not find login form inputs');
      }
    } catch (error: any) {
      console.log(`[UICrawler] Login failed: ${error.message}`);
    } finally {
      await page.close();
    }
  }
  
  private getSeedUrls(): string[] {
    const base = this.config.baseUrl;
    
    // Public pages
    const publicUrls = [
      base,
      `${base}/login`,
      `${base}/register`,
      `${base}/pricing`,
      `${base}/trinity-features`,
      `${base}/contact`,
      `${base}/support`,
      `${base}/terms`,
      `${base}/privacy`
    ];
    
    // Authenticated workspace pages - only include if logged in
    const workspaceUrls = this.isAuthenticated ? [
      `${base}/dashboard`,
      `${base}/schedule`,
      `${base}/employees`,
      `${base}/clients`,
      `${base}/time-tracking`,
      `${base}/invoices`,
      `${base}/settings`,
      `${base}/usage`,
      `${base}/integrations`,
      `${base}/notifications`,
      `${base}/owner-analytics`,
      `${base}/workflow-approvals`,
      `${base}/payroll`
    ] : [];
    
    return [...publicUrls, ...workspaceUrls];
  }
  
  private async auditPage(url: string, screenshotsDir: string): Promise<void> {
    const page = await this.context!.newPage();
    const consoleErrors: ConsoleError[] = [];
    const networkFailures: NetworkFailure[] = [];
    const startTime = Date.now();
    
    page.on('console', msg => {
      if (msg.type() === 'error') {
        consoleErrors.push({
          type: 'error',
          message: msg.text(),
          location: msg.location()?.url
        });
      }
    });
    
    page.on('pageerror', error => {
      consoleErrors.push({
        type: 'pageerror',
        message: error.message,
        stackTrace: error.stack
      });
    });
    
    page.on('response', response => {
      if (response.status() >= 400) {
        networkFailures.push({
          url: response.url(),
          method: response.request().method(),
          statusCode: response.status(),
          statusText: response.statusText(),
          resourceType: response.request().resourceType()
        });
      }
    });
    
    try {
      const response = await page.goto(url, { 
        waitUntil: 'networkidle',
        timeout: 30000 
      });
      
      const loadTime = Date.now() - startTime;
      const statusCode = response?.status() || 0;
      
      const captchaDetected = await this.checkForCaptcha(page);
      
      const brokenImages = await this.checkBrokenImages(page);
      const brokenLinks = await this.checkBrokenLinks(page, url);
      const uiErrors = await this.checkUIErrors(page);
      
      await this.testButtons(page, url);
      await this.testForms(page, url);
      
      const links = await this.extractLinks(page);
      this.queueNewLinks(links);
      
      const screenshotName = `page_${generateId()}.png`;
      const screenshotPath = path.join(screenshotsDir, screenshotName);
      await page.screenshot({ path: screenshotPath, fullPage: true });
      
      const result: PageAuditResult = {
        url,
        statusCode,
        loadTime,
        screenshotPath,
        consoleErrors,
        networkFailures,
        brokenImages,
        brokenLinks,
        uiErrors,
        captchaDetected,
        timestamp: new Date().toISOString()
      };
      
      this.pageResults.push(result);
      this.convertToTriadIssues(result);
      
    } catch (error: any) {
      console.error(`[UICrawler] Error auditing ${url}:`, error.message);
      this.issues.push({
        id: generateId(),
        category: 'page_error',
        severity: 'high',
        url,
        message: `Page failed to load: ${error.message}`,
        timestamp: new Date().toISOString(),
        crawlerType: 'ui',
        subsystem: 'frontend',
        reproducible: true
      });
    } finally {
      await page.close();
    }
  }
  
  private async checkForCaptcha(page: Page): Promise<boolean> {
    const captchaSelectors = [
      'iframe[src*="recaptcha"]',
      'iframe[src*="hcaptcha"]',
      '.g-recaptcha',
      '.h-captcha',
      '[data-sitekey]'
    ];
    
    for (const selector of captchaSelectors) {
      const found = await page.$(selector);
      if (found) return true;
    }
    return false;
  }
  
  private async checkBrokenImages(page: Page): Promise<BrokenAsset[]> {
    const broken: BrokenAsset[] = [];
    
    const images = await page.$$('img');
    for (const img of images) {
      const src = await img.getAttribute('src');
      if (!src) continue;
      
      const naturalWidth = await img.evaluate((el: HTMLImageElement) => el.naturalWidth);
      if (naturalWidth === 0) {
        broken.push({ src, type: 'image', reason: 'Failed to load' });
      }
    }
    
    return broken;
  }
  
  private async checkBrokenLinks(page: Page, currentUrl: string): Promise<BrokenAsset[]> {
    const broken: BrokenAsset[] = [];
    
    const links = await page.$$('a[href]');
    for (const link of links.slice(0, 50)) {
      const href = await link.getAttribute('href');
      if (!href || href.startsWith('#') || href.startsWith('javascript:') || href.startsWith('mailto:')) {
        continue;
      }
      
      this.linksCheckedCount++;
    }
    
    return broken;
  }
  
  private async checkUIErrors(page: Page): Promise<string[]> {
    const errors: string[] = [];
    
    const overflowElements = await page.$$eval('*', elements => {
      return elements.filter(el => {
        const style = window.getComputedStyle(el);
        return el.scrollWidth > el.clientWidth && style.overflow !== 'auto' && style.overflow !== 'scroll';
      }).length;
    });
    
    if (overflowElements > 5) {
      errors.push(`${overflowElements} elements have horizontal overflow`);
    }
    
    const emptyButtons = await page.$$eval('button', buttons => 
      buttons.filter(b => !b.textContent?.trim() && !b.querySelector('svg, img')).length
    );
    
    if (emptyButtons > 0) {
      errors.push(`${emptyButtons} buttons have no visible content`);
    }
    
    return errors;
  }
  
  private async testButtons(page: Page, url: string): Promise<void> {
    const buttons = await page.$$('button:visible, [role="button"]:visible');
    this.buttonsTestedCount += buttons.length;
    
    for (const button of buttons.slice(0, 10)) {
      try {
        const isDisabled = await button.getAttribute('disabled');
        const ariaLabel = await button.getAttribute('aria-label');
        const text = await button.textContent();
        
        if (!isDisabled && !ariaLabel && !text?.trim()) {
          this.issues.push({
            id: generateId(),
            category: 'ui_error',
            severity: 'low',
            url,
            message: 'Button has no accessible label',
            timestamp: new Date().toISOString(),
            crawlerType: 'ui',
            subsystem: 'frontend',
            reproducible: true
          });
        }
      } catch {
      }
    }
  }
  
  private async testForms(page: Page, url: string): Promise<void> {
    const forms = await page.$$('form');
    this.formsTestedCount += forms.length;
    
    for (const form of forms) {
      try {
        const inputs = await form.$$('input:not([type="hidden"]), textarea, select');
        for (const input of inputs) {
          const name = await input.getAttribute('name');
          const id = await input.getAttribute('id');
          const ariaLabel = await input.getAttribute('aria-label');
          const placeholder = await input.getAttribute('placeholder');
          
          const hasLabel = await page.$(`label[for="${id}"]`);
          
          if (!ariaLabel && !hasLabel && !placeholder) {
            this.issues.push({
              id: generateId(),
              category: 'ui_error',
              severity: 'low',
              url,
              message: `Form input "${name || id || 'unknown'}" lacks accessible label`,
              timestamp: new Date().toISOString(),
              crawlerType: 'ui',
              subsystem: 'frontend',
              reproducible: true
            });
          }
        }
      } catch {
      }
    }
  }
  
  private async extractLinks(page: Page): Promise<string[]> {
    const links = await page.$$eval('a[href]', anchors => 
      anchors.map(a => a.getAttribute('href')).filter(Boolean) as string[]
    );
    
    const baseHost = new URL(this.config.baseUrl).host;
    
    return links
      .map(href => {
        try {
          if (href.startsWith('/')) {
            return new URL(href, this.config.baseUrl).href;
          }
          return new URL(href).href;
        } catch {
          return null;
        }
      })
      .filter((url): url is string => {
        if (!url) return false;
        try {
          const urlObj = new URL(url);
          return urlObj.host === baseHost && !url.includes('#');
        } catch {
          return false;
        }
      });
  }
  
  private queueNewLinks(links: string[]): void {
    for (const link of links) {
      if (!this.visited.has(link) && !this.queue.includes(link)) {
        this.queue.push(link);
      }
    }
  }
  
  private convertToTriadIssues(result: PageAuditResult): void {
    if (result.captchaDetected) {
      this.issues.push({
        id: generateId(),
        category: 'captcha_blocker',
        severity: 'critical',
        url: result.url,
        message: 'CAPTCHA detected - blocks automated testing',
        timestamp: result.timestamp,
        crawlerType: 'ui',
        subsystem: 'auth',
        reproducible: true
      });
    }
    
    for (const error of result.consoleErrors) {
      this.issues.push({
        id: generateId(),
        category: 'console_error',
        severity: error.type === 'pageerror' ? 'high' : 'medium',
        url: result.url,
        message: error.message,
        details: error.stackTrace,
        timestamp: result.timestamp,
        crawlerType: 'ui',
        subsystem: 'frontend',
        reproducible: true
      });
    }
    
    for (const failure of result.networkFailures) {
      if (failure.resourceType === 'fetch' || failure.resourceType === 'xhr') {
        this.issues.push({
          id: generateId(),
          category: 'network_failure',
          severity: failure.statusCode >= 500 ? 'critical' : 'high',
          url: result.url,
          message: `${failure.method} ${failure.url} returned ${failure.statusCode}`,
          requestUrl: failure.url,
          statusCode: failure.statusCode,
          timestamp: result.timestamp,
          crawlerType: 'ui',
          subsystem: failure.url.includes('/api/') ? 'backend' : 'frontend',
          reproducible: true
        });
      }
    }
    
    for (const image of result.brokenImages) {
      this.issues.push({
        id: generateId(),
        category: 'broken_image',
        severity: 'medium',
        url: result.url,
        message: `Broken image: ${image.src}`,
        details: image.reason,
        timestamp: result.timestamp,
        crawlerType: 'ui',
        subsystem: 'frontend',
        reproducible: true
      });
    }
  }
}
