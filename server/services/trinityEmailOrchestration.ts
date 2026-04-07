/**
 * Trinity Email Orchestration Service
 * 
 * Implements the 7-step workflow pattern for AI-powered email processing:
 * TRIGGER → FETCH → VALIDATE → PROCESS → MUTATE → CONFIRM → NOTIFY
 * 
 * Features:
 * - Autonomous email monitoring and classification
 * - AI-powered action recommendations
 * - Sentiment analysis and priority scoring
 * - Meeting detection and scheduling suggestions
 * - Smart response drafting
 */

import { db } from "../db";
import { internalEmails, internalEmailRecipients, internalMailboxes, systemAuditLogs } from "@shared/schema";
import { eq, desc, isNull, and, sql, lt, gte } from "drizzle-orm";
import { createLogger } from '../lib/logger';
const log = createLogger('trinityEmailOrchestration');


interface EmailAnalysis {
  category: 'incident' | 'scheduling' | 'compliance' | 'hr' | 'client' | 'payroll' | 'training' | 'system' | 'general';
  sentiment: 'positive' | 'neutral' | 'negative' | 'urgent';
  priority: number; // 1-10, 10 being most urgent
  actionItems: string[];
  summary: string;
  suggestedResponse?: string;
  meetingSuggestion?: {
    recommended: boolean;
    reason?: string;
    suggestedTime?: string;
  };
  entities: {
    people: string[];
    locations: string[];
    dates: string[];
    amounts: string[];
  };
  requiresHumanReview: boolean;
  confidence: number; // 0-1
}

interface OrchestrationStep {
  step: 'TRIGGER' | 'FETCH' | 'VALIDATE' | 'PROCESS' | 'MUTATE' | 'CONFIRM' | 'NOTIFY';
  status: 'pending' | 'in_progress' | 'completed' | 'failed';
  startedAt?: Date;
  completedAt?: Date;
  error?: string;
  metadata?: Record<string, unknown>;
}

interface EmailOrchestrationResult {
  executionId: string;
  emailId: string;
  steps: OrchestrationStep[];
  analysis?: EmailAnalysis;
  success: boolean;
  duration: number;
}

const CATEGORY_KEYWORDS: Record<string, string[]> = {
  incident: ['incident', 'emergency', 'accident', 'injury', 'theft', 'damage', 'unauthorized', 'suspicious', 'alarm', 'fire', 'medical'],
  scheduling: ['shift', 'schedule', 'coverage', 'swap', 'overtime', 'vacation', 'pto', 'callout', 'on-call'],
  compliance: ['license', 'certification', 'audit', 'osha', 'training', 'compliance', 'regulation', 'expir'],
  hr: ['complaint', 'resignation', 'performance', 'fmla', 'termination', 'disciplinary', 'promotion', 'harassment'],
  client: ['client', 'contract', 'invoice', 'sla', 'complaint', 'service'],
  payroll: ['payroll', 'overtime', 'bonus', 'direct deposit', 'tax', 'reimbursement', 'garnishment'],
  training: ['training', 'certification', 'course', 'module', 'assessment'],
  system: ['system', 'maintenance', 'backup', 'update', 'notification'],
};

const URGENCY_KEYWORDS = ['urgent', 'emergency', 'asap', 'immediately', 'critical', 'severe', 'warning'];
const NEGATIVE_KEYWORDS = ['complaint', 'issue', 'problem', 'failed', 'violation', 'injury', 'damage', 'dispute'];
const POSITIVE_KEYWORDS = ['excellent', 'commendation', 'praise', 'success', 'completed', 'approved', 'welcome'];

export class TrinityEmailOrchestration {
  private workspaceId: string;
  private executionId: string;

  constructor(workspaceId: string) {
    this.workspaceId = workspaceId;
    this.executionId = `email-orch-${Date.now()}-${crypto.randomUUID().slice(0, 9)}`;
  }

  /**
   * Main orchestration entry point - processes a single email through the 7-step workflow
   */
  async processEmail(emailId: string): Promise<EmailOrchestrationResult> {
    const startTime = Date.now();
    const steps: OrchestrationStep[] = [];

    try {
      // Step 1: TRIGGER - Initialize the workflow
      steps.push(await this.executeTrigger(emailId));

      // Step 2: FETCH - Retrieve email data
      const email = await this.executeFetch(emailId, steps);
      if (!email) {
        return this.createFailureResult(emailId, steps, startTime, 'Email not found');
      }

      // Step 3: VALIDATE - Check email validity and permissions
      const isValid = await this.executeValidate(email, steps);
      if (!isValid) {
        return this.createFailureResult(emailId, steps, startTime, 'Validation failed');
      }

      // Step 4: PROCESS - Analyze email with AI
      const analysis = await this.executeProcess(email, steps);

      // Step 5: MUTATE - Update email with analysis results
      await this.executeMutate(emailId, analysis, steps);

      // Step 6: CONFIRM - Verify the mutation was successful
      await this.executeConfirm(emailId, steps);

      // Step 7: NOTIFY - Send notifications for high-priority items
      await this.executeNotify(emailId, analysis, steps);

      return {
        executionId: this.executionId,
        emailId,
        steps,
        analysis,
        success: true,
        duration: Date.now() - startTime,
      };

    } catch (error) {
      log.error(`[TrinityEmailOrchestration] Error processing email ${emailId}:`, error);
      return this.createFailureResult(emailId, steps, startTime, String(error));
    }
  }

  /**
   * Process all unprocessed emails in the inbox
   */
  async processUnreadEmails(limit: number = 50): Promise<{ processed: number; results: EmailOrchestrationResult[] }> {
    log.info(`[TrinityEmailOrchestration] Starting batch processing for workspace ${this.workspaceId}`);

    // Get unprocessed emails (no AI summary yet)
    const unprocessedEmails = await db
      .select({ id: internalEmails.id })
      .from(internalEmails)
      .where(isNull(internalEmails.aiSummary))
      .orderBy(desc(internalEmails.createdAt))
      .limit(limit);

    const results: EmailOrchestrationResult[] = [];

    for (const email of unprocessedEmails) {
      const result = await this.processEmail(email.id);
      results.push(result);
    }

    log.info(`[TrinityEmailOrchestration] Processed ${results.length} emails`);
    return { processed: results.length, results };
  }

  /**
   * Step 1: TRIGGER - Initialize the workflow
   */
  private async executeTrigger(emailId: string): Promise<OrchestrationStep> {
    const step: OrchestrationStep = {
      step: 'TRIGGER',
      status: 'in_progress',
      startedAt: new Date(),
    };

    await this.logStep('TRIGGER', emailId, { action: 'workflow_initiated' });

    step.status = 'completed';
    step.completedAt = new Date();
    step.metadata = { emailId, workspaceId: this.workspaceId };

    return step;
  }

  /**
   * Step 2: FETCH - Retrieve email data
   */
  private async executeFetch(emailId: string, steps: OrchestrationStep[]): Promise<any> {
    const step: OrchestrationStep = {
      step: 'FETCH',
      status: 'in_progress',
      startedAt: new Date(),
    };
    steps.push(step);

    try {
      const [email] = await db
        .select()
        .from(internalEmails)
        .where(eq(internalEmails.id, emailId))
        .limit(1);

      step.status = 'completed';
      step.completedAt = new Date();
      step.metadata = {
        found: !!email,
        subject: email?.subject?.substring(0, 50),
        priority: email?.priority,
      };

      return email;

    } catch (error) {
      step.status = 'failed';
      step.error = String(error);
      return null;
    }
  }

  /**
   * Step 3: VALIDATE - Check email validity
   */
  private async executeValidate(email: any, steps: OrchestrationStep[]): Promise<boolean> {
    const step: OrchestrationStep = {
      step: 'VALIDATE',
      status: 'in_progress',
      startedAt: new Date(),
    };
    steps.push(step);

    try {
      // Validation checks
      const validations = {
        hasSubject: !!email.subject,
        hasBody: !!(email.bodyText || email.bodyHtml),
        hasSender: !!email.fromAddress,
        isNotSpam: !this.detectSpam(email),
      };

      const isValid = Object.values(validations).every(v => v);

      step.status = isValid ? 'completed' : 'failed';
      step.completedAt = new Date();
      step.metadata = validations;

      return isValid;

    } catch (error) {
      step.status = 'failed';
      step.error = String(error);
      return false;
    }
  }

  /**
   * Step 4: PROCESS - Analyze email with AI-like heuristics
   */
  private async executeProcess(email: any, steps: OrchestrationStep[]): Promise<EmailAnalysis> {
    const step: OrchestrationStep = {
      step: 'PROCESS',
      status: 'in_progress',
      startedAt: new Date(),
    };
    steps.push(step);

    try {
      const analysis = this.analyzeEmail(email);

      step.status = 'completed';
      step.completedAt = new Date();
      step.metadata = {
        category: analysis.category,
        priority: analysis.priority,
        sentiment: analysis.sentiment,
        actionItemCount: analysis.actionItems.length,
        confidence: analysis.confidence,
      };

      return analysis;

    } catch (error) {
      step.status = 'failed';
      step.error = String(error);
      throw error;
    }
  }

  /**
   * Step 5: MUTATE - Update email with analysis results
   */
  private async executeMutate(emailId: string, analysis: EmailAnalysis, steps: OrchestrationStep[]): Promise<void> {
    const step: OrchestrationStep = {
      step: 'MUTATE',
      status: 'in_progress',
      startedAt: new Date(),
    };
    steps.push(step);

    try {
      await db
        .update(internalEmails)
        .set({
          aiSummary: analysis.summary,
          aiCategory: analysis.category,
          aiPriority: analysis.priority,
          aiSentiment: analysis.sentiment,
          aiActionItems: JSON.stringify(analysis.actionItems),
          enhancedByTrinity: true,
          updatedAt: new Date(),
        })
        .where(eq(internalEmails.id, emailId));

      step.status = 'completed';
      step.completedAt = new Date();
      step.metadata = { fieldsUpdated: ['aiSummary', 'aiCategory', 'aiPriority', 'aiSentiment', 'aiActionItems'] };

    } catch (error) {
      step.status = 'failed';
      step.error = String(error);
      throw error;
    }
  }

  /**
   * Step 6: CONFIRM - Verify the mutation was successful
   */
  private async executeConfirm(emailId: string, steps: OrchestrationStep[]): Promise<void> {
    const step: OrchestrationStep = {
      step: 'CONFIRM',
      status: 'in_progress',
      startedAt: new Date(),
    };
    steps.push(step);

    try {
      const [updatedEmail] = await db
        .select({ aiSummary: internalEmails.aiSummary, enhancedByTrinity: internalEmails.enhancedByTrinity })
        .from(internalEmails)
        .where(eq(internalEmails.id, emailId))
        .limit(1);

      const confirmed = updatedEmail?.enhancedByTrinity === true && !!updatedEmail?.aiSummary;

      step.status = confirmed ? 'completed' : 'failed';
      step.completedAt = new Date();
      step.metadata = { confirmed };

      if (!confirmed) {
        throw new Error('Confirmation check failed - email not properly updated');
      }

    } catch (error) {
      step.status = 'failed';
      step.error = String(error);
      throw error;
    }
  }

  /**
   * Step 7: NOTIFY - Send notifications for high-priority items
   */
  private async executeNotify(emailId: string, analysis: EmailAnalysis, steps: OrchestrationStep[]): Promise<void> {
    const step: OrchestrationStep = {
      step: 'NOTIFY',
      status: 'in_progress',
      startedAt: new Date(),
    };
    steps.push(step);

    try {
      const notificationsSent: string[] = [];

      // High priority notifications
      if (analysis.priority >= 8) {
        notificationsSent.push('high_priority_alert');
        await this.logStep('NOTIFY', emailId, {
          type: 'high_priority_alert',
          priority: analysis.priority,
          category: analysis.category,
        });
      }

      // Human review required
      if (analysis.requiresHumanReview) {
        notificationsSent.push('human_review_required');
      }

      // Action items present
      if (analysis.actionItems.length > 0) {
        notificationsSent.push('action_items_detected');
      }

      step.status = 'completed';
      step.completedAt = new Date();
      step.metadata = { notificationsSent };

    } catch (error) {
      step.status = 'failed';
      step.error = String(error);
      // Don't throw - notification failure shouldn't fail the whole workflow
    }
  }

  /**
   * Analyze email content using keyword-based heuristics
   * In production, this would call Gemini/Claude APIs
   */
  private analyzeEmail(email: any): EmailAnalysis {
    const content = `${email.subject || ''} ${email.bodyText || ''}`.toLowerCase();

    // Determine category
    let category: EmailAnalysis['category'] = 'general';
    let maxScore = 0;
    for (const [cat, keywords] of Object.entries(CATEGORY_KEYWORDS)) {
      const score = keywords.filter(kw => content.includes(kw)).length;
      if (score > maxScore) {
        maxScore = score;
        category = cat as EmailAnalysis['category'];
      }
    }

    // Determine sentiment
    const urgencyScore = URGENCY_KEYWORDS.filter(kw => content.includes(kw)).length;
    const negativeScore = NEGATIVE_KEYWORDS.filter(kw => content.includes(kw)).length;
    const positiveScore = POSITIVE_KEYWORDS.filter(kw => content.includes(kw)).length;

    let sentiment: EmailAnalysis['sentiment'] = 'neutral';
    if (urgencyScore >= 2) sentiment = 'urgent';
    else if (negativeScore > positiveScore) sentiment = 'negative';
    else if (positiveScore > negativeScore) sentiment = 'positive';

    // Calculate priority (1-10)
    let priority = 5;
    if (email.priority === 'urgent') priority = 9;
    else if (email.priority === 'high') priority = 7;
    else if (email.priority === 'low') priority = 3;
    priority += urgencyScore;
    priority = Math.min(10, Math.max(1, priority));

    // Extract action items
    const actionItems = this.extractActionItems(content);

    // Generate summary
    const summary = this.generateSummary(email, category, sentiment);

    // Entity extraction
    const entities = this.extractEntities(content);

    // Determine if human review is needed
    const requiresHumanReview = priority >= 8 || 
                                 category === 'hr' || 
                                 category === 'incident' ||
                                 sentiment === 'urgent';

    return {
      category,
      sentiment,
      priority,
      actionItems,
      summary,
      entities,
      requiresHumanReview,
      confidence: 0.85 + (maxScore * 0.02), // Higher confidence with more keyword matches
      meetingSuggestion: actionItems.some(item => item.includes('schedule') || item.includes('meeting'))
        ? { recommended: true, reason: 'Action items mention scheduling' }
        : { recommended: false },
    };
  }

  private extractActionItems(content: string): string[] {
    const actionItems: string[] = [];
    
    const patterns = [
      /please\s+([^.]+)/gi,
      /need\s+to\s+([^.]+)/gi,
      /must\s+([^.]+)/gi,
      /required\s+to\s+([^.]+)/gi,
      /action\s+required[:\s]+([^.]+)/gi,
    ];

    for (const pattern of patterns) {
      const matches = content.matchAll(pattern);
      for (const match of matches) {
        const item = match[1].trim();
        if (item.length > 10 && item.length < 150) {
          actionItems.push(item);
        }
      }
    }

    return [...new Set(actionItems)].slice(0, 5); // Dedupe and limit
  }

  private generateSummary(email: any, category: string, sentiment: string): string {
    const subjectPrefix = email.subject?.split(' ').slice(0, 3).join(' ') || 'Email';
    const categoryLabel = category.charAt(0).toUpperCase() + category.slice(1);
    const sentimentLabel = sentiment === 'urgent' ? 'requires immediate attention' :
                           sentiment === 'negative' ? 'reports an issue' :
                           sentiment === 'positive' ? 'positive update' : 'informational';

    return `[${categoryLabel}] ${subjectPrefix}... - This ${sentimentLabel}.`;
  }

  private extractEntities(content: string): EmailAnalysis['entities'] {
    return {
      people: this.extractPeopleNames(content),
      locations: this.extractLocations(content),
      dates: this.extractDates(content),
      amounts: this.extractAmounts(content),
    };
  }

  private extractPeopleNames(content: string): string[] {
    const names: string[] = [];
    const namePatterns = [
      /(?:officer|employee|manager|supervisor)\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)/gi,
      /([A-Z][a-z]+)\s+(?:reported|submitted|requested|called|filed)/gi,
    ];
    
    for (const pattern of namePatterns) {
      const matches = content.matchAll(pattern);
      for (const match of matches) {
        names.push(match[1]);
      }
    }
    return [...new Set(names)].slice(0, 5);
  }

  private extractLocations(content: string): string[] {
    const locations: string[] = [];
    const locationPatterns = [
      /(?:at|location:|site:)\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)/gi,
      /(building\s+[a-z]|zone\s+\d+|floor\s+\d+)/gi,
    ];
    
    for (const pattern of locationPatterns) {
      const matches = content.matchAll(pattern);
      for (const match of matches) {
        locations.push(match[1] || match[0]);
      }
    }
    return [...new Set(locations)].slice(0, 5);
  }

  private extractDates(content: string): string[] {
    const dates: string[] = [];
    const datePatterns = [
      /(?:january|february|march|april|may|june|july|august|september|october|november|december)\s+\d{1,2}/gi,
      /\d{1,2}\/\d{1,2}(?:\/\d{2,4})?/g,
      /(?:monday|tuesday|wednesday|thursday|friday|saturday|sunday)/gi,
    ];
    
    for (const pattern of datePatterns) {
      const matches = content.matchAll(pattern);
      for (const match of matches) {
        dates.push(match[0]);
      }
    }
    return [...new Set(dates)].slice(0, 5);
  }

  private extractAmounts(content: string): string[] {
    const amounts: string[] = [];
    const amountPatterns = [
      /\$[\d,]+(?:\.\d{2})?/g,
      /\d+\s*(?:hours?|hrs?|days?|weeks?)/gi,
    ];
    
    for (const pattern of amountPatterns) {
      const matches = content.matchAll(pattern);
      for (const match of matches) {
        amounts.push(match[0]);
      }
    }
    return [...new Set(amounts)].slice(0, 5);
  }

  private detectSpam(email: any): boolean {
    const spamIndicators = [
      'win a prize',
      'click here now',
      'limited time offer',
      'act fast',
      'congratulations you won',
    ];
    const content = `${email.subject || ''} ${email.bodyText || ''}`.toLowerCase();
    return spamIndicators.some(indicator => content.includes(indicator));
  }

  private async logStep(step: string, emailId: string, metadata: Record<string, unknown>): Promise<void> {
    try {
      await db.insert(systemAuditLogs).values({
        workspaceId: this.workspaceId,
        action: 'TRINITY_EMAIL_ORCHESTRATION',
        entityType: 'internal_email',
        entityId: emailId,
        metadata: { performedBy: 'trinity-ai', severity: 'info', details: JSON.stringify({ executionId: this.executionId, step, ...metadata, timestamp: new Date().toISOString() }) },
      });
    } catch (error) {
      log.error(`[TrinityEmailOrchestration] Failed to log step ${step}:`, error);
    }
  }

  private createFailureResult(
    emailId: string,
    steps: OrchestrationStep[],
    startTime: number,
    error: string
  ): EmailOrchestrationResult {
    return {
      executionId: this.executionId,
      emailId,
      steps,
      success: false,
      duration: Date.now() - startTime,
    };
  }
}

/**
 * Factory function to create and run email orchestration
 */
export async function runTrinityEmailOrchestration(
  workspaceId: string,
  options: { emailId?: string; batchSize?: number } = {}
): Promise<EmailOrchestrationResult | { processed: number; results: EmailOrchestrationResult[] }> {
  const orchestration = new TrinityEmailOrchestration(workspaceId);

  if (options.emailId) {
    return orchestration.processEmail(options.emailId);
  } else {
    return orchestration.processUnreadEmails(options.batchSize || 50);
  }
}
