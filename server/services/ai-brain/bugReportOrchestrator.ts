/**
 * BUG REPORT ORCHESTRATOR
 * =======================
 * Fortune 500-grade bug report analysis and auto-remediation system.
 * Connects user feedback/bug reports to AI Brain for analysis,
 * proposes fixes via TrinityCodeOps, and routes to human support for approval.
 * 
 * Flow:
 * 1. Bug report submitted via feedback form
 * 2. AI Brain (Gemini 3 Pro) analyzes the issue
 * 3. Trinity proposes a fix with TrinityCodeOps
 * 4. Fix sent to support console for human approval
 * 5. Upon approval, hotpatch is applied and committed
 * 6. All stakeholders notified (support, org subscribers, clients)
 */

import { platformEventBus } from '../platformEventBus';
import { trinityCodeOps } from './trinityCodeOps';
import crypto from 'crypto';
import { createLogger } from '../../lib/logger';
const log = createLogger('bugReportOrchestrator');

// ============================================================================
// TYPES
// ============================================================================

export interface BugReport {
  id: string;
  type: 'bug' | 'feature' | 'question' | 'other';
  title: string;
  description: string;
  screenshot?: string;
  url: string;
  userAgent: string;
  timestamp: string;
  userId?: string;
  workspaceId?: string;
  email?: string;
}

export interface BugAnalysis {
  reportId: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  category: 'ui' | 'backend' | 'database' | 'integration' | 'performance' | 'security' | 'unknown';
  rootCause: string;
  affectedComponents: string[];
  suggestedFix: {
    description: string;
    confidence: number;
    estimatedTime: string;
    patches?: Array<{
      file: string;
      type: 'insert' | 'delete' | 'replace';
      oldContent?: string;
      newContent?: string;
      description: string;
    }>;
  };
  requiresHumanReview: boolean;
  analysisTimestamp: Date;
}

export interface RemediationRequest {
  id: string;
  reportId: string;
  analysisId: string;
  status: 'pending_approval' | 'approved' | 'rejected' | 'executing' | 'completed' | 'failed';
  patches: Array<{
    file: string;
    type: 'insert' | 'delete' | 'replace';
    oldContent?: string;
    newContent?: string;
    description: string;
  }>;
  commitMessage: string;
  submittedBy: string;
  approvedBy?: string;
  approvalTimestamp?: Date;
  executionTimestamp?: Date;
  commitHash?: string;
  error?: string;
}

// ============================================================================
// IN-MEMORY STORAGE — reset on server restart
// Bug reports and analyses are transient support-session data; a full audit trail lives in the audit_log table.
// ============================================================================

const bugReports: Map<string, BugReport> = new Map();
const bugAnalyses: Map<string, BugAnalysis> = new Map();
const remediationRequests: Map<string, RemediationRequest> = new Map();

log.info('[BugReportOrchestrator] bugReports, bugAnalyses, remediationRequests are in-memory only — state resets on server restart. Persistent audit records are written to the audit_log table.');

// ============================================================================
// BUG REPORT ORCHESTRATOR CLASS
// ============================================================================

class BugReportOrchestrator {
  private static instance: BugReportOrchestrator;

  private constructor() {
    log.info('[BugReportOrchestrator] Initialized - Bug report analysis and remediation active');
  }

  static getInstance(): BugReportOrchestrator {
    if (!BugReportOrchestrator.instance) {
      BugReportOrchestrator.instance = new BugReportOrchestrator();
    }
    return BugReportOrchestrator.instance;
  }

  // ---------------------------------------------------------------------------
  // BUG REPORT SUBMISSION
  // ---------------------------------------------------------------------------

  async submitBugReport(report: Omit<BugReport, 'id'>): Promise<{ reportId: string; analysisQueued: boolean }> {
    const reportId = crypto.randomUUID();
    const fullReport: BugReport = { ...report, id: reportId };
    
    bugReports.set(reportId, fullReport);

    log.info(`[BugReportOrchestrator] Bug report submitted: ${reportId}`);

    // Queue for AI analysis if it's a bug report
    let analysisQueued = false;
    if (report.type === 'bug') {
      this.analyzeBugReport(reportId).catch(err => {
        log.error(`[BugReportOrchestrator] Analysis failed for ${reportId}:`, err);
      });
      analysisQueued = true;
    }

    // Emit event for real-time tracking
    platformEventBus.publish({
      type: 'automation_completed' as any,
      category: 'ai_brain',
      title: 'Bug Report Received',
      description: `New ${report.type} report: ${report.title}`,
      metadata: { reportId, type: report.type, analysisQueued },
      // @ts-expect-error — TS migration: fix in refactoring sprint
      severity: 'info',
      isNew: true
    }).catch((err) => log.warn('[bugReportOrchestrator] Fire-and-forget failed:', err));

    return { reportId, analysisQueued };
  }

  // ---------------------------------------------------------------------------
  // AI ANALYSIS
  // ---------------------------------------------------------------------------

  async analyzeBugReport(reportId: string): Promise<BugAnalysis | null> {
    const report = bugReports.get(reportId);
    if (!report) {
      log.error(`[BugReportOrchestrator] Report not found: ${reportId}`);
      return null;
    }

    log.info(`[BugReportOrchestrator] Analyzing bug report: ${reportId}`);

    try {
      const { geminiClient } = await import('./providers/geminiClient');

      const prompt = this.buildAnalysisPrompt(report);

      const response = await geminiClient.generate({
        // @ts-expect-error — TS migration: fix in refactoring sprint
        tier: 'pro',
        prompt,
        systemInstruction: `You are Trinity, an expert AI system analyst for the CoAIleague platform.
Analyze bug reports and provide structured remediation plans.
Be precise about affected files, code changes, and risk assessment.
Always prioritize user safety and data integrity.`,
        temperature: 0.3,
        maxTokens: 4000,
        workspaceId: report.workspaceId,
        featureKey: 'bug_report_analysis',
      });

      const analysis = this.parseAnalysisResponse(reportId, response.text);
      bugAnalyses.set(reportId, analysis);

      log.info(`[BugReportOrchestrator] Analysis complete for ${reportId}:`, {
        severity: analysis.severity,
        category: analysis.category,
        hasFix: !!analysis.suggestedFix.patches?.length
      });

      if (analysis.suggestedFix.patches && analysis.suggestedFix.patches.length > 0) {
        await this.createRemediationRequest(reportId, analysis);
      }

      platformEventBus.publish({
        type: 'automation_completed' as any,
        category: 'ai_brain',
        title: 'Bug Analysis Complete',
        description: `Analysis for report ${reportId}: ${analysis.severity} severity, ${analysis.category} issue`,
        metadata: { reportId, severity: analysis.severity, category: analysis.category },
        // @ts-expect-error — TS migration: fix in refactoring sprint
        severity: analysis.severity === 'critical' ? 'error' : 'info',
        isNew: true
      }).catch((err) => log.warn('[bugReportOrchestrator] Fire-and-forget failed:', err));

      return analysis;

    } catch (error: any) {
      log.error(`[BugReportOrchestrator] Analysis error for ${reportId}:`, error);
      
      const fallbackAnalysis: BugAnalysis = {
        reportId,
        severity: 'medium',
        category: 'unknown',
        rootCause: 'Unable to determine - manual review required',
        affectedComponents: ['unknown'],
        suggestedFix: {
          description: 'Manual investigation needed',
          confidence: 0,
          estimatedTime: 'Unknown'
        },
        requiresHumanReview: true,
        analysisTimestamp: new Date()
      };
      
      bugAnalyses.set(reportId, fallbackAnalysis);
      return fallbackAnalysis;
    }
  }

  private buildAnalysisPrompt(report: BugReport): string {
    return `Analyze this bug report and provide remediation recommendations:

## Bug Report
- **Title:** ${report.title}
- **Description:** ${report.description}
- **URL:** ${report.url}
- **User Agent:** ${report.userAgent}
- **Timestamp:** ${report.timestamp}

## Task
1. Determine the severity (low, medium, high, critical)
2. Categorize the issue (ui, backend, database, integration, performance, security, unknown)
3. Identify the root cause
4. List affected components/files
5. Propose a fix with specific code changes if possible

## Response Format (JSON)
\`\`\`json
{
  "severity": "medium",
  "category": "ui",
  "rootCause": "Description of what's causing the issue",
  "affectedComponents": ["client/src/components/example.tsx"],
  "suggestedFix": {
    "description": "What needs to be done",
    "confidence": 0.85,
    "estimatedTime": "15 minutes",
    "patches": [
      {
        "file": "client/src/components/example.tsx",
        "type": "replace",
        "oldContent": "buggy code",
        "newContent": "fixed code",
        "description": "Fix the specific issue"
      }
    ]
  },
  "requiresHumanReview": true
}
\`\`\``;
  }

  private parseAnalysisResponse(reportId: string, responseText: string): BugAnalysis {
    try {
      const jsonMatch = responseText.match(/```json\s*([\s\S]*?)\s*```/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[1]);
        return {
          reportId,
          severity: parsed.severity || 'medium',
          category: parsed.category || 'unknown',
          rootCause: parsed.rootCause || 'Unable to determine',
          affectedComponents: parsed.affectedComponents || [],
          suggestedFix: {
            description: parsed.suggestedFix?.description || 'Manual review needed',
            confidence: parsed.suggestedFix?.confidence || 0,
            estimatedTime: parsed.suggestedFix?.estimatedTime || 'Unknown',
            patches: parsed.suggestedFix?.patches || []
          },
          requiresHumanReview: parsed.requiresHumanReview !== false,
          analysisTimestamp: new Date()
        };
      }
    } catch (err) {
      log.error('[BugReportOrchestrator] Failed to parse analysis:', err);
    }

    return {
      reportId,
      severity: 'medium',
      category: 'unknown',
      rootCause: 'Parse error - manual review required',
      affectedComponents: [],
      suggestedFix: {
        description: 'Unable to generate automated fix',
        confidence: 0,
        estimatedTime: 'Unknown'
      },
      requiresHumanReview: true,
      analysisTimestamp: new Date()
    };
  }

  // ---------------------------------------------------------------------------
  // REMEDIATION WORKFLOW
  // ---------------------------------------------------------------------------

  private async createRemediationRequest(reportId: string, analysis: BugAnalysis): Promise<RemediationRequest> {
    const requestId = crypto.randomUUID();
    const report = bugReports.get(reportId);

    const request: RemediationRequest = {
      id: requestId,
      reportId,
      analysisId: reportId,
      status: 'pending_approval',
      patches: analysis.suggestedFix.patches || [],
      commitMessage: `fix: ${report?.title || 'Bug fix'}\n\nAuto-generated by AI Brain\nReport ID: ${reportId}\nAnalysis confidence: ${analysis.suggestedFix.confidence * 100}%`,
      submittedBy: 'Trinity AI'
    };

    remediationRequests.set(requestId, request);

    log.info(`[BugReportOrchestrator] Remediation request created: ${requestId}`);

    platformEventBus.publish({
      type: 'ticket_created' as any,
      category: 'ai_brain',
      title: `🔧 Auto-Fix Pending: ${report?.title || 'Bug fix'}`,
      description: `I've proposed a fix. Severity: ${analysis.severity}, Confidence: ${(analysis.suggestedFix.confidence * 100).toFixed(0)}%`,
      metadata: {
        remediationId: request.id,
        reportId: request.reportId,
        severity: analysis.severity,
        patchCount: request.patches.length
      },
      // @ts-expect-error — TS migration: fix in refactoring sprint
      severity: analysis.severity === 'critical' ? 'error' : 'warning',
      isNew: true
    }).catch((err) => log.warn('[bugReportOrchestrator] Fire-and-forget failed:', err));

    return request;
  }

  // ---------------------------------------------------------------------------
  // APPROVAL HANDLING
  // ---------------------------------------------------------------------------

  async approveRemediation(requestId: string, approverId: string): Promise<{ success: boolean; commitHash?: string; error?: string }> {
    const request = remediationRequests.get(requestId);
    if (!request) {
      return { success: false, error: 'Remediation request not found' };
    }

    if (request.status !== 'pending_approval') {
      return { success: false, error: `Invalid status: ${request.status}` };
    }

    log.info(`[BugReportOrchestrator] Remediation ${requestId} approved by ${approverId}`);

    request.status = 'executing';
    request.approvedBy = approverId;
    request.approvalTimestamp = new Date();

    try {
      const result = await trinityCodeOps.applyPatch({
        operationId: requestId,
        workspaceId: 'system',
        userId: approverId,
        patches: request.patches.map(p => ({
          type: p.type as 'insert' | 'delete' | 'replace',
          file: p.file,
          oldContent: p.oldContent,
          newContent: p.newContent,
          description: p.description
        })),
        commitMessage: request.commitMessage,
        autoCommit: true,
        requiresApproval: false,
        reasoning: `Approved hotfix for bug report ${request.reportId}`
      });

      if (result.success) {
        request.status = 'completed';
        request.commitHash = result.commitHash;
        request.executionTimestamp = new Date();

        platformEventBus.publish({
          type: 'automation_completed' as any,
          category: 'ai_brain',
          title: 'Hotfix Applied Successfully',
          description: `Bug fix committed: ${result.commitHash}`,
          metadata: { remediationId: request.id, commitHash: result.commitHash },
          // @ts-expect-error — TS migration: fix in refactoring sprint
          severity: 'info',
          isNew: true
        }).catch((err) => log.warn('[bugReportOrchestrator] Fire-and-forget failed:', err));

        return { success: true, commitHash: result.commitHash };
      } else {
        request.status = 'failed';
        request.error = result.errors.join(', ');
        return { success: false, error: request.error };
      }

    } catch (err: any) {
      log.error(`[BugReportOrchestrator] Remediation execution failed:`, err);
      request.status = 'failed';
      request.error = (err instanceof Error ? err.message : String(err));
      return { success: false, error: (err instanceof Error ? err.message : String(err)) };
    }
  }

  async rejectRemediation(requestId: string, rejecterId: string, reason: string): Promise<boolean> {
    const request = remediationRequests.get(requestId);
    if (!request) return false;

    request.status = 'rejected';
    request.error = reason;

    log.info(`[BugReportOrchestrator] Remediation ${requestId} rejected by ${rejecterId}: ${reason}`);

    return true;
  }

  // ---------------------------------------------------------------------------
  // QUERY METHODS
  // ---------------------------------------------------------------------------

  getBugReport(reportId: string): BugReport | undefined {
    return bugReports.get(reportId);
  }

  getBugAnalysis(reportId: string): BugAnalysis | undefined {
    return bugAnalyses.get(reportId);
  }

  getRemediationRequest(requestId: string): RemediationRequest | undefined {
    return remediationRequests.get(requestId);
  }

  getPendingRemediations(): RemediationRequest[] {
    return Array.from(remediationRequests.values())
      .filter(r => r.status === 'pending_approval');
  }

  getAllRemediations(): RemediationRequest[] {
    return Array.from(remediationRequests.values());
  }

  getStats(): {
    totalReports: number;
    analyzedReports: number;
    pendingRemediations: number;
    completedRemediations: number;
    failedRemediations: number;
  } {
    const remediations = Array.from(remediationRequests.values());
    return {
      totalReports: bugReports.size,
      analyzedReports: bugAnalyses.size,
      pendingRemediations: remediations.filter(r => r.status === 'pending_approval').length,
      completedRemediations: remediations.filter(r => r.status === 'completed').length,
      failedRemediations: remediations.filter(r => r.status === 'failed').length
    };
  }
}

export const bugReportOrchestrator = BugReportOrchestrator.getInstance();
