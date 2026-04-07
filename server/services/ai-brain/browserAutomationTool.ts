/**
 * BROWSER AUTOMATION TOOL
 * ========================
 * Puppeteer-based headless browser tool for Trinity's Visual QA capabilities.
 * Captures pixel-perfect screenshots at specified viewports for visual analysis.
 * 
 * Features:
 * - Viewport presets (desktop, tablet, mobile devices)
 * - Full-page and element-specific screenshots
 * - Rate limiting and resource management
 * - Base64 encoding for Gemini multimodal analysis
 */

import puppeteer, { Browser, Page } from 'puppeteer';
import { createLogger } from '../../lib/logger';
const log = createLogger('browserAutomationTool');

// Viewport presets for common devices
export const VIEWPORT_PRESETS: Record<string, { width: number; height: number; deviceScaleFactor?: number; isMobile?: boolean }> = {
  'desktop-1080p': { width: 1920, height: 1080 },
  'desktop-720p': { width: 1280, height: 720 },
  'laptop': { width: 1440, height: 900 },
  'tablet-landscape': { width: 1024, height: 768 },
  'tablet-portrait': { width: 768, height: 1024 },
  'iphone-15-pro': { width: 393, height: 852, deviceScaleFactor: 3, isMobile: true },
  'iphone-15': { width: 390, height: 844, deviceScaleFactor: 3, isMobile: true },
  'iphone-se': { width: 375, height: 667, deviceScaleFactor: 2, isMobile: true },
  'android-pixel': { width: 412, height: 915, deviceScaleFactor: 2.625, isMobile: true },
  'android-samsung': { width: 360, height: 780, deviceScaleFactor: 3, isMobile: true },
};

export interface ScreenshotOptions {
  url: string;
  width?: number;
  height?: number;
  deviceName?: string;
  fullPage?: boolean;
  waitForSelector?: string;
  waitForTimeout?: number;
  elementSelector?: string;
  hideSelectors?: string[];
  quality?: number;
}

export interface ScreenshotResult {
  success: boolean;
  base64?: string;
  mimeType: string;
  width: number;
  height: number;
  deviceName?: string;
  captureTimeMs: number;
  errorMessage?: string;
  pageTitle?: string;
  pageUrl?: string;
}

class BrowserAutomationTool {
  private browser: Browser | null = null;
  private browserLaunchPromise: Promise<Browser> | null = null;
  private lastUsed: Date = new Date();
  private readonly IDLE_TIMEOUT = 5 * 60 * 1000; // 5 minutes

  async getBrowser(): Promise<Browser> {
    if (this.browser && this.browser.connected) {
      this.lastUsed = new Date();
      return this.browser;
    }

    if (this.browserLaunchPromise) {
      return this.browserLaunchPromise;
    }

    this.browserLaunchPromise = this.launchBrowser();
    this.browser = await this.browserLaunchPromise;
    this.browserLaunchPromise = null;
    this.lastUsed = new Date();
    
    this.startIdleTimer();
    
    return this.browser;
  }

  private async launchBrowser(): Promise<Browser> {
    log.info('[BrowserAutomation] Launching headless browser...');
    
    return puppeteer.launch({
      headless: true,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-accelerated-2d-canvas',
        '--disable-gpu',
        '--window-size=1920,1080',
        '--single-process',
      ],
      timeout: 30000,
    });
  }

  private startIdleTimer(): void {
    setInterval(async () => {
      try {
        const idleTime = Date.now() - this.lastUsed.getTime();
        if (idleTime > this.IDLE_TIMEOUT && this.browser) {
          log.info('[BrowserAutomation] Closing idle browser');
          await this.closeBrowser();
        }
      } catch (error: any) {
        log.warn('[BrowserAutomation] Idle check failed (non-fatal):', error?.message || 'unknown');
      }
    }, 60000).unref();
  }

  async closeBrowser(): Promise<void> {
    if (this.browser) {
      try {
        await this.browser.close();
      } catch (error) {
        log.error('[BrowserAutomation] Error closing browser:', error);
      }
      this.browser = null;
    }
  }

  async captureScreenshot(options: ScreenshotOptions): Promise<ScreenshotResult> {
    const startTime = Date.now();
    let page: Page | null = null;

    try {
      const browser = await this.getBrowser();
      page = await browser.newPage();

      // Determine viewport settings
      let viewportConfig = { width: options.width || 1920, height: options.height || 1080 };
      let deviceName = options.deviceName;

      if (deviceName && VIEWPORT_PRESETS[deviceName]) {
        const preset = VIEWPORT_PRESETS[deviceName];
        viewportConfig = {
          width: preset.width,
          height: preset.height,
        };
        await page.setViewport({
          width: preset.width,
          height: preset.height,
          deviceScaleFactor: preset.deviceScaleFactor || 1,
          isMobile: preset.isMobile || false,
        });
      } else {
        await page.setViewport(viewportConfig);
      }

      // Navigate to URL
      await page.goto(options.url, {
        waitUntil: 'networkidle2',
        timeout: 30000,
      });

      // Wait for specific selector if provided
      if (options.waitForSelector) {
        await page.waitForSelector(options.waitForSelector, { timeout: 10000 });
      }

      // Additional wait time if specified
      if (options.waitForTimeout) {
        await new Promise(resolve => setTimeout(resolve, options.waitForTimeout));
      }

      // Hide specified elements (e.g., cookie banners, modals)
      if (options.hideSelectors && options.hideSelectors.length > 0) {
        for (const selector of options.hideSelectors) {
          await page.evaluate((sel) => {
            const elements = document.querySelectorAll(sel);
            elements.forEach(el => (el as HTMLElement).style.display = 'none');
          }, selector);
        }
      }

      // Capture screenshot
      let screenshotBuffer: Buffer;
      
      if (options.elementSelector) {
        const element = await page.$(options.elementSelector);
        if (!element) {
          throw new Error(`Element not found: ${options.elementSelector}`);
        }
        screenshotBuffer = await element.screenshot({
          type: 'png',
        }) as Buffer;
      } else {
        screenshotBuffer = await page.screenshot({
          type: 'png',
          fullPage: options.fullPage ?? false,
        }) as Buffer;
      }

      const pageTitle = await page.title();
      const pageUrl = page.url();

      await page.close();

      return {
        success: true,
        base64: screenshotBuffer.toString('base64'),
        mimeType: 'image/png',
        width: viewportConfig.width,
        height: viewportConfig.height,
        deviceName,
        captureTimeMs: Date.now() - startTime,
        pageTitle,
        pageUrl,
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      log.error('[BrowserAutomation] Screenshot capture failed:', errorMessage);

      if (page) {
        try {
          await page.close();
        } catch (closeError) {
          log.warn('[BrowserAutomation] Failed to close page during cleanup:', closeError);
        }
      }

      return {
        success: false,
        mimeType: 'image/png',
        width: options.width || 1920,
        height: options.height || 1080,
        deviceName: options.deviceName,
        captureTimeMs: Date.now() - startTime,
        errorMessage,
      };
    }
  }

  async captureMultipleViewports(url: string, deviceNames: string[]): Promise<Map<string, ScreenshotResult>> {
    const results = new Map<string, ScreenshotResult>();
    
    for (const deviceName of deviceNames) {
      const result = await this.captureScreenshot({ url, deviceName });
      results.set(deviceName, result);
    }
    
    return results;
  }

  getAvailablePresets(): string[] {
    return Object.keys(VIEWPORT_PRESETS);
  }

  getPresetConfig(deviceName: string): typeof VIEWPORT_PRESETS[string] | null {
    return VIEWPORT_PRESETS[deviceName] || null;
  }
}

export const browserAutomationTool = new BrowserAutomationTool();
