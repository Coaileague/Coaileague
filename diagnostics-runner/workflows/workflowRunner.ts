/**
 * Workflow Runner - Executes defined user flow tests
 */

import { chromium, Browser, Page, BrowserContext } from 'playwright';
import { config } from '../config/diagnostics.config';
import { Workflow, WorkflowStep, WorkflowResult } from '../config/types';
import { detectCaptcha, isDestructiveElement } from '../utils/guards';
import { ensureDir, generateId } from '../utils/helpers';
import * as path from 'path';
import * as fs from 'fs';

export class WorkflowRunner {
  private browser: Browser | null = null;
  private context: BrowserContext | null = null;
  private outputDir: string;
  private screenshotsDir: string;
  private tracesDir: string;
  private videosDir: string;
  
  constructor(runId: string) {
    this.outputDir = path.join(config.outputDir, runId);
    this.screenshotsDir = path.join(this.outputDir, 'screenshots');
    this.tracesDir = path.join(this.outputDir, 'traces');
    this.videosDir = path.join(this.outputDir, 'videos');
  }
  
  async initialize(): Promise<void> {
    await ensureDir(this.screenshotsDir);
    await ensureDir(this.tracesDir);
    
    this.browser = await chromium.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox']
    });
  }
  
  async runWorkflow(workflow: Workflow): Promise<WorkflowResult> {
    console.log(`[Workflow] Starting: ${workflow.name}`);
    const startTime = Date.now();
    
    const contextOptions: any = {
      viewport: { width: 1920, height: 1080 },
      userAgent: 'DiagnosticsRunner/1.0 (Playwright)',
      ignoreHTTPSErrors: true
    };
    
    if (config.enableVideo) {
      await ensureDir(this.videosDir);
      contextOptions.recordVideo = {
        dir: this.videosDir,
        size: { width: 1280, height: 720 }
      };
    }
    
    if (config.diagBypassCaptcha) {
      contextOptions.extraHTTPHeaders = {
        'X-Diagnostics-Runner': 'true'
      };
    }
    
    const context = await this.browser!.newContext(contextOptions);
    const page = await context.newPage();
    
    let tracePath: string | undefined;
    if (config.enableTrace) {
      tracePath = path.join(this.tracesDir, `trace_${workflow.name.replace(/\s+/g, '_')}.zip`);
      await context.tracing.start({
        screenshots: true,
        snapshots: true,
        sources: true
      });
    }
    
    let stepsCompleted = 0;
    let failedStep: string | undefined;
    let error: string | undefined;
    let screenshotPath: string | undefined;
    let captchaDetected = false;
    
    try {
      for (const step of workflow.steps) {
        captchaDetected = await detectCaptcha(page);
        if (captchaDetected) {
          console.log(`[Workflow] CAPTCHA detected at step: ${step.description || step.action}`);
          screenshotPath = await this.captureScreenshot(page, `captcha_${workflow.name}`);
          error = 'CAPTCHA detected - workflow blocked';
          failedStep = step.description || step.action;
          break;
        }
        
        const stepDesc = step.description || `${step.action}: ${step.selector || step.url || step.value || ''}`;
        console.log(`[Workflow] Step ${stepsCompleted + 1}/${workflow.steps.length}: ${stepDesc}`);
        
        await this.executeStep(page, step);
        stepsCompleted++;
      }
    } catch (err) {
      error = err instanceof Error ? err.message : String(err);
      failedStep = workflow.steps[stepsCompleted]?.description || 
                   `Step ${stepsCompleted + 1}`;
      console.error(`[Workflow] Failed at step ${stepsCompleted + 1}: ${error}`);
      screenshotPath = await this.captureScreenshot(page, `error_${workflow.name}`);
    }
    
    if (config.enableTrace && tracePath) {
      await context.tracing.stop({ path: tracePath });
    }
    
    let videoPath: string | undefined;
    if (config.enableVideo) {
      const video = page.video();
      if (video) {
        videoPath = await video.path();
      }
    }
    
    await page.close();
    await context.close();
    
    const duration = Date.now() - startTime;
    const success = stepsCompleted === workflow.steps.length && !error;
    
    console.log(`[Workflow] ${workflow.name} ${success ? 'PASSED' : 'FAILED'} (${duration}ms)`);
    
    return {
      name: workflow.name,
      success,
      stepsCompleted,
      totalSteps: workflow.steps.length,
      failedStep,
      error,
      screenshotPath,
      tracePath,
      videoPath,
      duration,
      captchaDetected
    };
  }
  
  private async executeStep(page: Page, step: WorkflowStep): Promise<void> {
    const timeout = step.timeout || config.workflowTimeout;
    
    switch (step.action) {
      case 'goto':
        if (!step.url) throw new Error('goto requires url');
        await page.goto(step.url, { timeout, waitUntil: 'networkidle' });
        break;
        
      case 'click':
        if (!step.selector) throw new Error('click requires selector');
        const clickElement = await page.waitForSelector(step.selector, { timeout });
        if (!clickElement) throw new Error(`Element not found: ${step.selector}`);
        
        const clickText = await clickElement.textContent() || '';
        if (isDestructiveElement(clickText, step.selector)) {
          throw new Error(`Blocked destructive action on: ${step.selector}`);
        }
        
        await clickElement.click();
        break;
        
      case 'fill':
        if (!step.selector || step.value === undefined) {
          throw new Error('fill requires selector and value');
        }
        await page.waitForSelector(step.selector, { timeout });
        await page.fill(step.selector, step.value);
        break;
        
      case 'waitForURL':
        if (!step.url) throw new Error('waitForURL requires url');
        await page.waitForURL(step.url, { timeout });
        break;
        
      case 'waitForSelector':
        if (!step.selector) throw new Error('waitForSelector requires selector');
        await page.waitForSelector(step.selector, { timeout });
        break;
        
      case 'assertVisible':
        if (!step.selector) throw new Error('assertVisible requires selector');
        const visible = await page.isVisible(step.selector);
        if (!visible) throw new Error(`Element not visible: ${step.selector}`);
        break;
        
      case 'assertText':
        if (!step.selector || !step.text) {
          throw new Error('assertText requires selector and text');
        }
        const elementText = await page.textContent(step.selector);
        if (!elementText?.includes(step.text)) {
          throw new Error(`Text "${step.text}" not found in ${step.selector}`);
        }
        break;
        
      case 'select':
        if (!step.selector || !step.value) {
          throw new Error('select requires selector and value');
        }
        await page.selectOption(step.selector, step.value);
        break;
        
      case 'upload':
        if (!step.selector || !step.value) {
          throw new Error('upload requires selector and value (file path)');
        }
        await page.setInputFiles(step.selector, step.value);
        break;
        
      case 'screenshot':
        await this.captureScreenshot(page, step.description || 'step');
        break;
        
      default:
        throw new Error(`Unknown action: ${step.action}`);
    }
  }
  
  private async captureScreenshot(page: Page, name: string): Promise<string> {
    const filename = `${name.replace(/\s+/g, '_')}_${generateId()}.png`;
    const filepath = path.join(this.screenshotsDir, filename);
    await page.screenshot({ path: filepath, fullPage: true });
    return filepath;
  }
  
  async runAll(workflows: Workflow[]): Promise<WorkflowResult[]> {
    const results: WorkflowResult[] = [];
    
    for (const workflow of workflows) {
      try {
        const result = await this.runWorkflow(workflow);
        results.push(result);
      } catch (error) {
        console.error(`[Workflow] Error running ${workflow.name}:`, error);
        results.push({
          name: workflow.name,
          success: false,
          stepsCompleted: 0,
          totalSteps: workflow.steps.length,
          error: error instanceof Error ? error.message : String(error),
          duration: 0,
          captchaDetected: false
        });
      }
    }
    
    return results;
  }
  
  async close(): Promise<void> {
    if (this.browser) await this.browser.close();
  }
}
