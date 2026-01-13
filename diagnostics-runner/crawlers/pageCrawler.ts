/**
 * Page Crawler - Visits pages and collects diagnostic data
 */

import { chromium, Browser, Page, BrowserContext } from 'playwright';
import { config } from '../config/diagnostics.config';
import { 
  PageAuditResult, 
  ConsoleError, 
  NetworkFailure, 
  BrokenAsset,
  CrawlState 
} from '../config/types';
import { detectCaptcha, isDestructiveElement } from '../utils/guards';
import { ensureDir, generateId } from '../utils/helpers';
import * as path from 'path';
import * as fs from 'fs';

export class PageCrawler {
  private browser: Browser | null = null;
  private context: BrowserContext | null = null;
  private outputDir: string;
  private screenshotsDir: string;
  private logsDir: string;
  private htmlSnapshotsDir: string;
  
  constructor(runId: string) {
    this.outputDir = path.join(config.outputDir, runId);
    this.screenshotsDir = path.join(this.outputDir, 'screenshots');
    this.logsDir = path.join(this.outputDir, 'logs');
    this.htmlSnapshotsDir = path.join(this.outputDir, 'html_snapshots');
  }
  
  async initialize(): Promise<void> {
    await ensureDir(this.screenshotsDir);
    await ensureDir(this.logsDir);
    await ensureDir(this.htmlSnapshotsDir);
    
    this.browser = await chromium.launch({
      headless: true,
      executablePath: process.env.PLAYWRIGHT_CHROMIUM_PATH || undefined,
      args: ['--no-sandbox', '--disable-setuid-sandbox']
    });
    
    const contextOptions: any = {
      viewport: { width: 1920, height: 1080 },
      userAgent: 'DiagnosticsRunner/1.0 (Playwright)',
      ignoreHTTPSErrors: true
    };
    
    if (config.enableVideo) {
      contextOptions.recordVideo = {
        dir: path.join(this.outputDir, 'videos'),
        size: { width: 1280, height: 720 }
      };
    }
    
    if (config.diagBypassCaptcha) {
      contextOptions.extraHTTPHeaders = {
        'X-Diagnostics-Runner': 'true'
      };
    }
    
    this.context = await this.browser.newContext(contextOptions);
    
    if (config.enableTrace) {
      await this.context.tracing.start({
        screenshots: true,
        snapshots: true,
        sources: true
      });
    }
  }
  
  async crawl(): Promise<CrawlState> {
    const state: CrawlState = {
      visited: new Set<string>(),
      queue: [config.baseUrl],
      results: []
    };
    
    console.log(`[Crawler] Starting crawl from ${config.baseUrl}`);
    console.log(`[Crawler] Max pages: ${config.maxPages}`);
    
    while (state.queue.length > 0 && state.visited.size < config.maxPages) {
      const url = state.queue.shift()!;
      
      if (state.visited.has(url)) continue;
      state.visited.add(url);
      
      console.log(`[Crawler] Visiting (${state.visited.size}/${config.maxPages}): ${url}`);
      
      try {
        const result = await this.auditPage(url);
        state.results.push(result);
        
        if (!result.captchaDetected) {
          const newLinks = await this.extractLinks(url);
          for (const link of newLinks) {
            if (!state.visited.has(link) && !state.queue.includes(link)) {
              state.queue.push(link);
            }
          }
        }
      } catch (error) {
        console.error(`[Crawler] Error auditing ${url}:`, error);
        state.results.push({
          url,
          statusCode: 0,
          loadTime: 0,
          consoleErrors: [{
            type: 'pageerror',
            message: `Crawler error: ${error instanceof Error ? error.message : String(error)}`
          }],
          networkFailures: [],
          brokenImages: [],
          brokenLinks: [],
          uiErrors: [],
          captchaDetected: false,
          timestamp: new Date().toISOString()
        });
      }
    }
    
    console.log(`[Crawler] Crawl complete. Visited ${state.visited.size} pages`);
    return state;
  }
  
  async auditPage(url: string): Promise<PageAuditResult> {
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
    
    let statusCode = 0;
    let captchaDetected = false;
    let screenshotPath: string | undefined;
    
    try {
      const response = await page.goto(url, {
        timeout: config.pageTimeout,
        waitUntil: 'networkidle'
      });
      
      statusCode = response?.status() || 0;
      
      captchaDetected = await detectCaptcha(page);
      
      if (captchaDetected) {
        console.log(`[Crawler] CAPTCHA detected at ${url}`);
        const htmlContent = await page.content();
        const snapshotPath = path.join(
          this.htmlSnapshotsDir, 
          `captcha_${generateId()}.html`
        );
        fs.writeFileSync(snapshotPath, htmlContent);
      }
      
      if (config.enableScreenshots) {
        const filename = `page_${generateId()}.png`;
        screenshotPath = path.join(this.screenshotsDir, filename);
        await page.screenshot({ 
          path: screenshotPath, 
          fullPage: true 
        });
      }
      
    } catch (error) {
      consoleErrors.push({
        type: 'pageerror',
        message: `Navigation failed: ${error instanceof Error ? error.message : String(error)}`
      });
    }
    
    const brokenImages = await this.detectBrokenImages(page);
    const uiErrors = await this.detectUIErrors(page);
    
    const loadTime = Date.now() - startTime;
    
    await page.close();
    
    return {
      url,
      statusCode,
      loadTime,
      screenshotPath,
      consoleErrors,
      networkFailures,
      brokenImages,
      brokenLinks: [],
      uiErrors,
      captchaDetected,
      timestamp: new Date().toISOString()
    };
  }
  
  private async detectBrokenImages(page: Page): Promise<BrokenAsset[]> {
    const broken: BrokenAsset[] = [];
    
    try {
      const images = await page.$$eval('img', imgs => 
        imgs.map(img => ({
          src: img.src,
          naturalWidth: img.naturalWidth,
          complete: img.complete
        }))
      );
      
      for (const img of images) {
        if (img.complete && img.naturalWidth === 0 && img.src) {
          broken.push({
            src: img.src,
            type: 'image',
            reason: 'Image failed to load (naturalWidth=0)'
          });
        }
      }
    } catch (error) {
      console.error('[Crawler] Error detecting broken images:', error);
    }
    
    return broken;
  }
  
  private async detectUIErrors(page: Page): Promise<string[]> {
    const errors: string[] = [];
    
    try {
      const bodyText = await page.textContent('body') || '';
      const lowerText = bodyText.toLowerCase();
      
      for (const keyword of config.errorKeywords) {
        if (lowerText.includes(keyword.toLowerCase())) {
          const snippetIndex = lowerText.indexOf(keyword.toLowerCase());
          const start = Math.max(0, snippetIndex - 50);
          const end = Math.min(bodyText.length, snippetIndex + keyword.length + 50);
          const snippet = bodyText.substring(start, end).trim();
          errors.push(`Found "${keyword}": ...${snippet}...`);
        }
      }
    } catch (error) {
      console.error('[Crawler] Error detecting UI errors:', error);
    }
    
    return errors;
  }
  
  private async extractLinks(currentUrl: string): Promise<string[]> {
    const page = await this.context!.newPage();
    const links: string[] = [];
    
    try {
      await page.goto(currentUrl, { timeout: config.pageTimeout, waitUntil: 'domcontentloaded' });
      
      const hrefs = await page.$$eval('a[href]', anchors => 
        anchors.map(a => a.href)
      );
      
      const baseHost = new URL(config.baseUrl).host;
      
      for (const href of hrefs) {
        try {
          const url = new URL(href);
          if (url.host === baseHost && url.protocol.startsWith('http')) {
            const cleanUrl = `${url.origin}${url.pathname}`;
            if (!cleanUrl.includes('#') && !links.includes(cleanUrl)) {
              links.push(cleanUrl);
            }
          }
        } catch {
        }
      }
    } catch (error) {
      console.error(`[Crawler] Error extracting links from ${currentUrl}:`, error);
    }
    
    await page.close();
    return links;
  }
  
  async saveTrace(runId: string): Promise<string | null> {
    if (!config.enableTrace || !this.context) return null;
    
    const tracePath = path.join(this.outputDir, 'traces', `trace_${runId}.zip`);
    await ensureDir(path.dirname(tracePath));
    await this.context.tracing.stop({ path: tracePath });
    return tracePath;
  }
  
  async close(): Promise<void> {
    if (this.context) await this.context.close();
    if (this.browser) await this.browser.close();
  }
}
