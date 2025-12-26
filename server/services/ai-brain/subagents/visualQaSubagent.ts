/**
 * VISUAL QA SUBAGENT
 * ===================
 * Trinity's "eyes" for visual inspection and self-healing.
 * Uses Puppeteer for screenshots and Gemini multimodal for anomaly detection.
 * 
 * Capabilities:
 * - Capture UI screenshots at various viewports
 * - Analyze images for visual anomalies using Gemini Vision
 * - Compare against baselines for regression detection
 * - Suggest CSS fixes for detected issues
 * - Trigger self-healing workflows
 */

import { browserAutomationTool, ScreenshotResult, VIEWPORT_PRESETS } from '../browserAutomationTool';
import { geminiClient } from '../providers/geminiClient';
import { db } from '../../../db';
import { eq, and, desc } from 'drizzle-orm';
import {
  publishTrinityDiagnosticStarted,
  publishTrinityDiagnosticCompleted,
  publishTrinityIssueDetected,
} from '../../platformEventBus';
import {
  visualQaRuns,
  visualQaFindings,
  visualQaBaselines,
  InsertVisualQaRun,
  InsertVisualQaFinding,
  VisualQaRun,
  VisualQaFinding,
  VisualQaBaseline,
} from '@shared/schema';

// Anomaly categories for classification
export const ANOMALY_CATEGORIES = [
  'broken_icon',
  'layout_shift',
  'text_overlap',
  'missing_element',
  'color_mismatch',
  'font_issue',
  'alignment_error',
  'responsive_issue',
  'z_index_problem',
  'spacing_issue',
  'visual_regression',
] as const;

export type AnomalyCategory = typeof ANOMALY_CATEGORIES[number];

export interface VisualAnomaly {
  category: AnomalyCategory;
  severity: 'critical' | 'high' | 'medium' | 'low' | 'info';
  description: string;
  boundingBox?: { y_min: number; x_min: number; y_max: number; x_max: number };
  elementSelector?: string;
  suggestedFix?: string;
  suggestedCss?: string;
  confidence: number;
}

export interface VisualAnalysisResult {
  success: boolean;
  anomalies: VisualAnomaly[];
  overallScore: number; // 0-100 visual quality score
  summary: string;
  analysisTimeMs: number;
  tokensUsed: number;
  errorMessage?: string;
}

export interface VqaCheckOptions {
  url: string;
  workspaceId: string;
  triggeredBy?: string;
  triggerSource?: 'manual' | 'scheduled' | 'trinity' | 'monitoring';
  viewport?: { width: number; height: number };
  deviceName?: string;
  baselineId?: string;
  analysisPrompt?: string;
  autoHeal?: boolean;
}

export interface VqaCheckResult {
  runId: string;
  success: boolean;
  screenshot?: ScreenshotResult;
  analysis?: VisualAnalysisResult;
  findings: VisualQaFinding[];
  selfHealAttempted: boolean;
  selfHealSuccess?: boolean;
  totalTimeMs: number;
}

class VisualQaSubagent {
  // Uses generateVision method which uses DIAGNOSTICS tier for vision analysis

  async runVisualCheck(options: VqaCheckOptions): Promise<VqaCheckResult> {
    const startTime = Date.now();
    console.log(`[VQA] Starting visual check for ${options.url}`);

    // Create run record
    const runData: InsertVisualQaRun = {
      workspaceId: options.workspaceId,
      pageUrl: options.url,
      triggerSource: options.triggerSource || 'manual',
      triggeredBy: options.triggeredBy,
      viewport: options.viewport || (options.deviceName ? VIEWPORT_PRESETS[options.deviceName] : { width: 1920, height: 1080 }),
      baselineId: options.baselineId,
      status: 'capturing',
    };

    const [run] = await db.insert(visualQaRuns).values(runData).returning();

    try {
      // Step 1: Capture screenshot
      const screenshotStart = Date.now();
      const screenshot = await browserAutomationTool.captureScreenshot({
        url: options.url,
        deviceName: options.deviceName,
        width: options.viewport?.width,
        height: options.viewport?.height,
        fullPage: false,
        waitForTimeout: 2000, // Wait for animations to settle
      });

      if (!screenshot.success || !screenshot.base64) {
        await this.updateRunStatus(run.id, 'failed', {
          errorMessage: screenshot.errorMessage || 'Screenshot capture failed',
          captureTimeMs: Date.now() - screenshotStart,
        });
        
        return {
          runId: run.id,
          success: false,
          screenshot,
          findings: [],
          selfHealAttempted: false,
          totalTimeMs: Date.now() - startTime,
        };
      }

      await this.updateRunStatus(run.id, 'analyzing', {
        captureTimeMs: screenshot.captureTimeMs,
      });

      // Step 2: Analyze with Gemini Vision
      const analysisStart = Date.now();
      const analysis = await this.analyzeScreenshot(
        screenshot.base64,
        options.analysisPrompt,
        options.baselineId
      );

      // Step 3: Store findings
      const findings: VisualQaFinding[] = [];
      
      for (const anomaly of analysis.anomalies) {
        const findingData: InsertVisualQaFinding = {
          runId: run.id,
          workspaceId: options.workspaceId,
          severity: anomaly.severity,
          category: anomaly.category,
          description: anomaly.description,
          boundingBox: anomaly.boundingBox,
          elementSelector: anomaly.elementSelector,
          suggestedFix: anomaly.suggestedFix,
          suggestedCss: anomaly.suggestedCss,
          confidence: anomaly.confidence.toString(),
          status: 'open',
        };

        const [finding] = await db.insert(visualQaFindings).values(findingData).returning();
        findings.push(finding);
      }

      // Guard against failed analysis - don't proceed if analysis failed
      if (!analysis.success) {
        await this.updateRunStatus(run.id, 'failed', {
          analysisResult: analysis,
          errorMessage: analysis.errorMessage || 'Gemini analysis failed',
          analysisTimeMs: analysis.analysisTimeMs,
          totalTimeMs: Date.now() - startTime,
          tokensUsed: analysis.tokensUsed,
        });

        return {
          runId: run.id,
          success: false,
          screenshot,
          analysis,
          findings: [],
          selfHealAttempted: false,
          totalTimeMs: Date.now() - startTime,
        };
      }

      // Step 4: Optional self-healing (only if analysis succeeded and high-severity issues found)
      let selfHealAttempted = false;
      let selfHealSuccess: boolean | undefined;

      if (options.autoHeal && analysis.success && findings.some(f => f.severity === 'critical' || f.severity === 'high')) {
        selfHealAttempted = true;
        // Self-healing would trigger CodeExecution subagent here
        // For now, just mark as attempted - full implementation requires code editor integration
        console.log(`[VQA] Self-healing would be triggered for ${findings.length} findings`);
        // selfHealSuccess = await this.triggerSelfHeal(findings);
      }

      // Step 5: Update run with final status
      await this.updateRunStatus(run.id, 'completed', {
        analysisResult: analysis,
        anomalyCount: findings.length,
        selfHealAttempted,
        selfHealSuccess,
        analysisTimeMs: analysis.analysisTimeMs,
        totalTimeMs: Date.now() - startTime,
        tokensUsed: analysis.tokensUsed,
        completedAt: new Date(),
      });

      console.log(`[VQA] Visual check completed: ${findings.length} anomalies found`);

      return {
        runId: run.id,
        success: true,
        screenshot,
        analysis,
        findings,
        selfHealAttempted,
        selfHealSuccess,
        totalTimeMs: Date.now() - startTime,
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      console.error('[VQA] Visual check failed:', errorMessage);

      await this.updateRunStatus(run.id, 'failed', {
        errorMessage,
        totalTimeMs: Date.now() - startTime,
      });

      return {
        runId: run.id,
        success: false,
        findings: [],
        selfHealAttempted: false,
        totalTimeMs: Date.now() - startTime,
      };
    }
  }

  private async analyzeScreenshot(
    base64Image: string,
    customPrompt?: string,
    baselineId?: string
  ): Promise<VisualAnalysisResult> {
    const startTime = Date.now();

    const analysisPrompt = customPrompt || `
You are a Visual QA expert analyzing a web application screenshot.

Analyze this screenshot for visual anomalies and UI issues. Look for:
1. Broken or missing icons (placeholder boxes, missing images)
2. Layout shifts or misaligned elements
3. Text overlapping or truncated - especially in navigation menus, tabs, and horizontal layouts
4. Inconsistent spacing or margins between elements
5. Color/contrast issues affecting readability
6. Font rendering problems
7. Responsive design failures
8. Z-index/layering issues
9. Any visual regression from expected design
10. Navigation/tab bar issues:
    - Crowded or jumbled menu items
    - Tab buttons touching or overlapping each other
    - Text cutoff or ellipsis in navigation labels
    - Lack of horizontal scroll indicators when content overflows
11. Touch target accessibility:
    - Buttons or clickable elements that appear too small (should be at least 44x44 pixels visually)
    - Interactive elements too close together

For each issue found, provide:
- category: One of [broken_icon, layout_shift, text_overlap, missing_element, color_mismatch, font_issue, alignment_error, responsive_issue, z_index_problem, spacing_issue, visual_regression]
- severity: One of [critical, high, medium, low, info]
  - critical: App is unusable (overlapping buttons, unreadable text)
  - high: Major usability impact (navigation issues, touch target problems)
  - medium: Visual issues that affect user experience
  - low: Minor cosmetic issues
  - info: Observations or suggestions
- description: Clear description of the issue
- boundingBox: Approximate location as {y_min, x_min, y_max, x_max} (0-1 normalized coordinates)
- elementSelector: CSS selector to target the element if identifiable (e.g., "nav button", ".tab-list")
- suggestedCss: CSS fix if applicable (e.g., "gap: 0.5rem; flex-shrink: 0;")
- confidence: 0.0-1.0 confidence score

Respond with JSON:
{
  "anomalies": [...],
  "overallScore": 0-100 (100 = perfect),
  "summary": "Brief summary of visual quality"
}
`;

    try {
      const response = await geminiClient.generateVision({
        systemPrompt: 'You are a Visual QA expert analyzing web application screenshots.',
        userMessage: analysisPrompt,
        imageData: base64Image,
        featureKey: 'ai_visual_qa',
      });

      // Parse JSON response
      let parsed: any;
      try {
        // Extract JSON from response (may be wrapped in markdown code blocks)
        const jsonMatch = response.text.match(/```json\n?([\s\S]*?)\n?```/) || 
                          response.text.match(/\{[\s\S]*\}/);
        const jsonStr = jsonMatch ? (jsonMatch[1] || jsonMatch[0]) : response.text;
        parsed = JSON.parse(jsonStr);
      } catch (parseError) {
        console.error('[VQA] Failed to parse Gemini response:', parseError);
        return {
          success: false,
          anomalies: [],
          overallScore: 0,
          summary: 'Failed to parse analysis response',
          analysisTimeMs: Date.now() - startTime,
          tokensUsed: response.tokensUsed || 0,
          errorMessage: 'JSON parse error',
        };
      }

      return {
        success: true,
        anomalies: parsed.anomalies || [],
        overallScore: parsed.overallScore || 100,
        summary: parsed.summary || 'Analysis complete',
        analysisTimeMs: Date.now() - startTime,
        tokensUsed: response.tokensUsed || 0,
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      console.error('[VQA] Gemini analysis failed:', errorMessage);

      return {
        success: false,
        anomalies: [],
        overallScore: 0,
        summary: 'Analysis failed',
        analysisTimeMs: Date.now() - startTime,
        tokensUsed: 0,
        errorMessage,
      };
    }
  }

  private async updateRunStatus(
    runId: string,
    status: string,
    updates: Partial<VisualQaRun>
  ): Promise<void> {
    await db.update(visualQaRuns)
      .set({ status, ...updates })
      .where(eq(visualQaRuns.id, runId));
  }

  async createBaseline(options: {
    workspaceId: string;
    pageId: string;
    pageName: string;
    pageUrl: string;
    deviceName?: string;
    capturedBy?: string;
  }): Promise<VisualQaBaseline | null> {
    const screenshot = await browserAutomationTool.captureScreenshot({
      url: options.pageUrl,
      deviceName: options.deviceName || 'desktop-1080p',
      fullPage: false,
    });

    if (!screenshot.success || !screenshot.base64) {
      console.error('[VQA] Failed to capture baseline screenshot');
      return null;
    }

    // Generate hash for quick comparison
    const crypto = await import('crypto');
    const screenshotHash = crypto.createHash('sha256')
      .update(screenshot.base64)
      .digest('hex');

    const [baseline] = await db.insert(visualQaBaselines).values({
      workspaceId: options.workspaceId,
      pageId: options.pageId,
      pageName: options.pageName,
      pageUrl: options.pageUrl,
      deviceName: options.deviceName || 'desktop-1080p',
      viewport: { width: screenshot.width, height: screenshot.height },
      screenshotRef: `data:image/png;base64,${screenshot.base64.substring(0, 100)}...`, // Would upload to object storage
      screenshotHash,
      capturedBy: options.capturedBy,
      isActive: true,
      version: 1,
    }).returning();

    return baseline;
  }

  async getRunHistory(workspaceId: string, limit = 20): Promise<VisualQaRun[]> {
    return db.select()
      .from(visualQaRuns)
      .where(eq(visualQaRuns.workspaceId, workspaceId))
      .orderBy(desc(visualQaRuns.createdAt))
      .limit(limit);
  }

  async getRunFindings(runId: string): Promise<VisualQaFinding[]> {
    return db.select()
      .from(visualQaFindings)
      .where(eq(visualQaFindings.runId, runId))
      .orderBy(desc(visualQaFindings.severity));
  }

  async getBaselines(workspaceId: string): Promise<VisualQaBaseline[]> {
    return db.select()
      .from(visualQaBaselines)
      .where(and(
        eq(visualQaBaselines.workspaceId, workspaceId),
        eq(visualQaBaselines.isActive, true)
      ))
      .orderBy(desc(visualQaBaselines.createdAt));
  }

  async askVisualQuestion(base64Image: string, question: string): Promise<string> {
    try {
      const response = await geminiClient.generateVision({
        systemPrompt: 'You are a Visual QA expert answering questions about web UI screenshots.',
        userMessage: question,
        imageData: base64Image,
        featureKey: 'ai_visual_qa',
      });
      return response.text;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      console.error('[VQA] Visual question failed:', errorMessage);
      return `Error: ${errorMessage}`;
    }
  }

  getAvailableViewports(): string[] {
    return browserAutomationTool.getAvailablePresets();
  }

  // ==========================================================================
  // LOGOPS INTEGRATION - Trinity Eyes + Log Analysis
  // ==========================================================================

  /**
   * Perform comprehensive diagnostic combining visual inspection with log analysis
   * This is the primary integration point between Trinity Eyes and LogOps
   */
  async runDiagnosticCheck(options: {
    url: string;
    workspaceId: string;
    includeConsoleLogs?: boolean;
    includeServerLogs?: boolean;
    logContent?: string;
    triggeredBy?: string;
  }): Promise<{
    visual: VqaCheckResult;
    logFindings: any[];
    combinedSeverity: 'healthy' | 'warning' | 'error' | 'critical';
    summary: string;
    recommendedActions: string[];
  }> {
    console.log(`[VQA] Running diagnostic check for ${options.url}`);
    const executionId = `diag-${Date.now()}`;
    
    // Emit diagnostic started event through UNS
    await publishTrinityDiagnosticStarted({
      workspaceId: options.workspaceId,
      triggeredBy: options.triggeredBy,
      executionId,
      targetUrl: options.url,
      diagnosticScope: [
        'visual',
        ...(options.includeConsoleLogs ? ['console_logs'] : []),
        ...(options.logContent ? ['server_logs'] : []),
      ],
    });
    
    // Track diagnostic state for finally block
    let visualResult: VqaCheckResult | null = null;
    let logFindings: any[] = [];
    let combinedSeverity: 'healthy' | 'warning' | 'error' | 'critical' = 'healthy';
    let recommendedActions: string[] = [];
    let diagnosticError: Error | null = null;

    try {
      // Import LogOps dynamically to avoid circular dependencies
      const { logOpsSubagent } = await import('./domainOpsSubagents');

      // Run visual check
      visualResult = await this.runVisualCheck({
        url: options.url,
        workspaceId: options.workspaceId,
        triggeredBy: options.triggeredBy || 'trinity_diagnostic',
        triggerSource: 'trinity',
        autoHeal: false,
      });

      // Analyze logs if provided
      if (options.logContent) {
        logFindings = await logOpsSubagent.analyzeLogContent(
          options.logContent,
          `diagnostic:${options.url}`
        );
      }

      // Capture browser console logs if enabled
      if (options.includeConsoleLogs && visualResult.screenshot?.base64) {
        try {
          const consoleResult = await browserAutomationTool.executeScript({
            url: options.url,
            script: `return window.__consoleLogs || [];`,
          });
          if (consoleResult.success && Array.isArray(consoleResult.result)) {
            const consoleLogs = consoleResult.result.join('\n');
            const consoleFindings = await logOpsSubagent.analyzeLogContent(
              consoleLogs,
              `console:${options.url}`
            );
            logFindings.push(...consoleFindings);
          }
        } catch (e) {
          console.warn('[VQA] Could not capture console logs:', e);
        }
      }

      // Determine combined severity
      combinedSeverity = this.determineCombinedSeverity(
        visualResult.analysis?.anomalies || [],
        logFindings
      );

      // Generate recommended actions
      recommendedActions = this.generateRecommendedActions(
        visualResult.findings,
        logFindings,
        combinedSeverity
      );
    } catch (error) {
      diagnosticError = error instanceof Error ? error : new Error(String(error));
      combinedSeverity = 'critical';
      recommendedActions = [`Diagnostic failed: ${diagnosticError.message}`];
      console.error('[VQA] Diagnostic check failed:', diagnosticError.message);
    } finally {
      // Always emit diagnostic completed event through UNS
      const visualIssues = visualResult?.findings.length || 0;
      const logIssues = logFindings.length;
      const visualScore = visualResult?.analysis?.overallScore || 0;
      
      await publishTrinityDiagnosticCompleted({
        workspaceId: options.workspaceId,
        triggeredBy: options.triggeredBy,
        executionId,
        severity: combinedSeverity,
        visualIssues,
        logIssues,
        visualScore,
        recommendedActions,
        metadata: diagnosticError ? { error: diagnosticError.message } : undefined,
      });

      // Emit individual issue detection events for critical/error issues
      if (visualResult) {
        for (const finding of visualResult.findings) {
          if (finding.severity === 'critical' || finding.severity === 'high') {
            await publishTrinityIssueDetected({
              workspaceId: options.workspaceId,
              triggeredBy: options.triggeredBy,
              executionId,
              issueTitle: finding.category,
              issueDescription: finding.description,
              issueCategory: 'visual',
              severity: finding.severity === 'critical' ? 'critical' : 'error',
              confidence: parseFloat(finding.confidence || '0'),
            });
          }
        }
      }
    }

    // Rethrow if there was an error
    if (diagnosticError) {
      throw diagnosticError;
    }

    // Create summary
    const visualIssues = visualResult!.findings.length;
    const logIssues = logFindings.length;
    const summary = this.generateDiagnosticSummary(
      visualIssues,
      logIssues,
      combinedSeverity,
      visualResult!.analysis?.overallScore || 100
    );

    return {
      visual: visualResult!,
      logFindings,
      combinedSeverity,
      summary,
      recommendedActions,
    };
  }

  /**
   * Analyze visual findings alongside log patterns for correlation
   */
  async correlateVisualAndLogIssues(
    visualFindings: VisualQaFinding[],
    logFindings: any[]
  ): Promise<{
    correlations: Array<{
      visualFinding: VisualQaFinding;
      relatedLogFinding: any;
      confidence: number;
      explanation: string;
    }>;
    uncorrelatedVisual: VisualQaFinding[];
    uncorrelatedLogs: any[];
  }> {
    const correlations: Array<{
      visualFinding: VisualQaFinding;
      relatedLogFinding: any;
      confidence: number;
      explanation: string;
    }> = [];
    
    const correlatedVisualIds = new Set<string>();
    const correlatedLogIndexes = new Set<number>();

    // Look for correlations based on timing and error patterns
    for (const visual of visualFindings) {
      for (let i = 0; i < logFindings.length; i++) {
        const log = logFindings[i];
        
        // Check for correlation patterns
        let correlation = this.checkCorrelation(visual, log);
        
        if (correlation.isCorrelated) {
          correlations.push({
            visualFinding: visual,
            relatedLogFinding: log,
            confidence: correlation.confidence,
            explanation: correlation.explanation,
          });
          correlatedVisualIds.add(visual.id);
          correlatedLogIndexes.add(i);
        }
      }
    }

    // Identify uncorrelated items
    const uncorrelatedVisual = visualFindings.filter(v => !correlatedVisualIds.has(v.id));
    const uncorrelatedLogs = logFindings.filter((_, i) => !correlatedLogIndexes.has(i));

    return {
      correlations,
      uncorrelatedVisual,
      uncorrelatedLogs,
    };
  }

  private checkCorrelation(
    visual: VisualQaFinding,
    log: any
  ): { isCorrelated: boolean; confidence: number; explanation: string } {
    // Pattern 1: Network errors often cause broken images
    if (visual.category === 'broken_icon' || visual.category === 'missing_element') {
      if (log.gapType === 'log_error' && 
          (log.title?.includes('network') || log.title?.includes('fetch') || log.title?.includes('404'))) {
        return {
          isCorrelated: true,
          confidence: 0.8,
          explanation: 'Network error likely caused missing visual element',
        };
      }
    }

    // Pattern 2: JavaScript errors can cause layout issues
    if (visual.category === 'layout_shift' || visual.category === 'responsive_issue') {
      if (log.gapType === 'log_error' && 
          (log.title?.includes('TypeError') || log.title?.includes('ReferenceError'))) {
        return {
          isCorrelated: true,
          confidence: 0.7,
          explanation: 'JavaScript error may have disrupted dynamic layout',
        };
      }
    }

    // Pattern 3: CSS loading failures
    if (visual.category === 'font_issue' || visual.category === 'color_mismatch') {
      if (log.title?.includes('CSS') || log.title?.includes('stylesheet') || log.title?.includes('font')) {
        return {
          isCorrelated: true,
          confidence: 0.75,
          explanation: 'CSS/font loading issue caused visual styling problem',
        };
      }
    }

    return { isCorrelated: false, confidence: 0, explanation: '' };
  }

  private determineCombinedSeverity(
    visualAnomalies: VisualAnomaly[],
    logFindings: any[]
  ): 'healthy' | 'warning' | 'error' | 'critical' {
    const hasCriticalVisual = visualAnomalies.some(a => a.severity === 'critical');
    const hasCriticalLog = logFindings.some(f => f.severity === 'critical');
    
    if (hasCriticalVisual || hasCriticalLog) return 'critical';

    const hasErrorVisual = visualAnomalies.some(a => a.severity === 'high' || a.severity === 'critical');
    const hasErrorLog = logFindings.some(f => f.severity === 'error');
    
    if (hasErrorVisual || hasErrorLog) return 'error';

    const hasWarningVisual = visualAnomalies.some(a => a.severity === 'medium');
    const hasWarningLog = logFindings.some(f => f.severity === 'warning');
    
    if (hasWarningVisual || hasWarningLog) return 'warning';

    return 'healthy';
  }

  private generateRecommendedActions(
    visualFindings: VisualQaFinding[],
    logFindings: any[],
    severity: string
  ): string[] {
    const actions: string[] = [];

    // Critical severity actions
    if (severity === 'critical') {
      actions.push('Immediate attention required - critical issues detected');
      actions.push('Review error logs for root cause analysis');
    }

    // Visual-specific actions
    const brokenIcons = visualFindings.filter(f => f.category === 'broken_icon');
    if (brokenIcons.length > 0) {
      actions.push(`Fix ${brokenIcons.length} broken icon(s) - check image paths and CDN availability`);
    }

    const layoutIssues = visualFindings.filter(f => 
      f.category === 'layout_shift' || f.category === 'responsive_issue'
    );
    if (layoutIssues.length > 0) {
      actions.push(`Address ${layoutIssues.length} layout issue(s) - review CSS and responsive breakpoints`);
    }

    // Log-specific actions
    const jsErrors = logFindings.filter(f => f.title?.includes('Error'));
    if (jsErrors.length > 0) {
      actions.push(`Investigate ${jsErrors.length} JavaScript error(s) in console`);
    }

    const networkErrors = logFindings.filter(f => 
      f.title?.includes('ECONNREFUSED') || f.title?.includes('ETIMEDOUT')
    );
    if (networkErrors.length > 0) {
      actions.push(`Check network connectivity - ${networkErrors.length} connection error(s) found`);
    }

    if (actions.length === 0) {
      actions.push('No immediate actions required - system appears healthy');
    }

    return actions;
  }

  private generateDiagnosticSummary(
    visualIssues: number,
    logIssues: number,
    severity: string,
    visualScore: number
  ): string {
    if (severity === 'healthy' && visualIssues === 0 && logIssues === 0) {
      return `System is healthy. Visual quality score: ${visualScore}/100. No issues detected.`;
    }

    const issueText = [];
    if (visualIssues > 0) issueText.push(`${visualIssues} visual`);
    if (logIssues > 0) issueText.push(`${logIssues} log`);
    
    return `Diagnostic complete. Status: ${severity.toUpperCase()}. Found ${issueText.join(' and ')} issue(s). Visual score: ${visualScore}/100.`;
  }
}

export const visualQaSubagent = new VisualQaSubagent();
