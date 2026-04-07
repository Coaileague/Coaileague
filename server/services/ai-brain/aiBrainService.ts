/**
 * UNIFIED AI BRAIN ORCHESTRATOR - Enhanced with Business Insights & Learning
 * 
 * This is the ONE AI system for CoAIleague that:
 * - Learns from all organizations (cross-tenant intelligence)
 * - Provides unified intelligence across all features
 * - Manages all AI operations through one central service
 * - Generates business insights (sales, finance, operations, automation)
 * - Self-sells platform features based on user needs
 * - Updates FAQs based on successful resolutions
 * - Fixes issues once for everyone
 */

import { db } from '../../db';
import { createLogger } from '../../lib/logger';

const log = createLogger('AiBrainService');
type DbTransaction = Parameters<Parameters<typeof db.transaction>[0]>[0];
import { TIMEOUTS } from '../../config/platformConfig';
import {
  aiBrainJobs,
  helposFaqs,
  faqVersions,
  faqGapEvents,
  externalIdentifiers,
  workspaces,
  shifts,
  scheduleProposals,
  invoices,
  payrollRuns,
  employees,
  timeEntries,
  supportTickets,
  type AiBrainJob,
  type HelposFaq,
  type FaqGapEvent,
} from '@shared/schema';
import { eq, and, desc, sql, gte, lte, count, or, ilike, isNull } from 'drizzle-orm';
import { geminiClient } from './providers/geminiClient';
import { trinityThoughtEngine } from './trinityThoughtEngine';
import { ChatServerHub } from '../ChatServerHub';
import { platformFeatureRegistry, type PlatformFeature, type FeatureCapability } from './platformFeatureRegistry';
import crypto from 'crypto';

// ============================================================================
// SENTIMENT ANALYSIS ENGINE - Detect user emotions and adjust responses
// ============================================================================

interface SentimentResult {
  sentiment: 'positive' | 'neutral' | 'negative' | 'frustrated';
  urgency: 'low' | 'medium' | 'high' | 'critical';
  frustrationLevel: number;
  shouldEscalate: boolean;
  toneGuidance: string;
}

function analyzeSentiment(message: string): SentimentResult {
  const lower = message.toLowerCase();

  const frustrationSignals = ['frustrated', 'angry', 'furious', 'terrible', 'horrible', 'worst', 'unacceptable', 'ridiculous', 'broken', 'useless', 'hate', 'awful', 'disgusted', 'sick of', 'tired of', 'fed up', 'waste of time', 'not working', 'still broken', 'again'];
  const urgencySignals = ['urgent', 'asap', 'emergency', 'immediately', 'critical', 'deadline', 'now', 'right now', 'help!', 'payday', 'tomorrow', 'today', 'tonight'];
  const positiveSignals = ['thanks', 'great', 'awesome', 'perfect', 'love', 'excellent', 'wonderful', 'appreciate', 'helpful', 'amazing'];
  const confusionSignals = ['confused', "don't understand", 'how do i', "where is", "can't find", 'lost', 'stuck', 'help me', "doesn't make sense", "what does"];

  let frustrationScore = 0;
  let urgencyScore = 0;
  let positiveScore = 0;
  let confusionScore = 0;

  for (const kw of frustrationSignals) { if (lower.includes(kw)) frustrationScore += 1; }
  for (const kw of urgencySignals) { if (lower.includes(kw)) urgencyScore += 1; }
  for (const kw of positiveSignals) { if (lower.includes(kw)) positiveScore += 1; }
  for (const kw of confusionSignals) { if (lower.includes(kw)) confusionScore += 1; }

  const capsWords = (message.match(/[A-Z]{3,}/g) || []).length;
  const exclamations = (message.match(/!+/g) || []).length;
  frustrationScore += capsWords * 0.5;
  urgencyScore += exclamations * 0.3;

  let sentiment: SentimentResult['sentiment'] = 'neutral';
  if (frustrationScore >= 2) sentiment = 'frustrated';
  else if (frustrationScore >= 1) sentiment = 'negative';
  else if (positiveScore >= 1) sentiment = 'positive';

  let urgency: SentimentResult['urgency'] = 'low';
  if (urgencyScore >= 3 || (frustrationScore >= 2 && urgencyScore >= 1)) urgency = 'critical';
  else if (urgencyScore >= 2) urgency = 'high';
  else if (urgencyScore >= 1 || confusionScore >= 2) urgency = 'medium';

  const shouldEscalate = frustrationScore >= 3 || urgency === 'critical';

  let toneGuidance = '';
  if (sentiment === 'frustrated') {
    toneGuidance = 'TONE: This user is frustrated. Acknowledge their frustration immediately. Be empathetic and action-oriented. Lead with "I understand this is frustrating" then go straight to solving the problem. Do NOT be dismissive or repeat generic advice.';
  } else if (sentiment === 'negative') {
    toneGuidance = 'TONE: This user is unhappy. Be reassuring and proactive. Show you understand the impact of their issue and focus on resolution.';
  } else if (confusionScore >= 2) {
    toneGuidance = 'TONE: This user is confused. Be patient and clear. Break down steps simply. Avoid jargon. Offer to walk them through it.';
  } else if (urgency === 'high' || urgency === 'critical') {
    toneGuidance = 'TONE: This is urgent. Be direct and fast. Skip pleasantries. Get to the solution immediately.';
  } else {
    toneGuidance = 'TONE: Normal conversation. Be friendly, professional, and helpful.';
  }

  return {
    sentiment,
    urgency,
    frustrationLevel: Math.min(frustrationScore / 3, 1),
    shouldEscalate,
    toneGuidance,
  };
}

// ============================================================================
// DOMAIN COMPLEXITY DETECTOR - Decide if iterative reasoning is needed
// ============================================================================

interface ComplexityAssessment {
  isComplex: boolean;
  domains: string[];
  requiresDataLookup: boolean;
  requiresConflictAnalysis: boolean;
  reasoningDepth: 'simple' | 'moderate' | 'deep';
}

function assessComplexity(message: string): ComplexityAssessment {
  const lower = message.toLowerCase();
  const domains: string[] = [];
  let complexityScore = 0;

  if (/schedul|shift|coverage|assign|roster|who.?s working|open shift/i.test(lower)) {
    domains.push('scheduling');
    complexityScore += 1;
  }
  if (/payroll|pay run|gross|net pay|deduction|overtime pay|pay period|payday/i.test(lower)) {
    domains.push('payroll');
    complexityScore += 1;
  }
  if (/invoice|billing|bill|payment|overdue|outstanding|client.*owe/i.test(lower)) {
    domains.push('invoicing');
    complexityScore += 1;
  }
  if (/employee|team|staff|guard|worker|hire|fired|terminated/i.test(lower)) {
    domains.push('employees');
    complexityScore += 0.5;
  }
  if (/hours|timesheet|clock|overtime|attendance|late|absent/i.test(lower)) {
    domains.push('timekeeping');
    complexityScore += 0.5;
  }
  if (/conflict|overlap|double.?book|gap|shortage|problem|issue|wrong|error|discrepancy|mismatch/i.test(lower)) {
    complexityScore += 1.5;
  }
  if (/why|how come|explain|what happened|figure out|investigate|look into/i.test(lower)) {
    complexityScore += 0.5;
  }

  const requiresDataLookup = domains.length > 0 && /\b(my|our|this|the|current|today|tomorrow|this week|last week)\b/i.test(lower);
  const requiresConflictAnalysis = /conflict|overlap|double|gap|shortage|wrong|error|discrepancy|fix|resolve/i.test(lower) && domains.length > 0;

  let reasoningDepth: ComplexityAssessment['reasoningDepth'] = 'simple';
  if (complexityScore >= 3 || (domains.length >= 2 && requiresConflictAnalysis)) {
    reasoningDepth = 'deep';
  } else if (complexityScore >= 1.5 || requiresDataLookup) {
    reasoningDepth = 'moderate';
  }

  return {
    isComplex: complexityScore >= 1.5,
    domains,
    requiresDataLookup,
    requiresConflictAnalysis,
    reasoningDepth,
  };
}

// Define typed input interfaces for each skill
interface HelpAIInput {
  message: string;
  conversationHistory?: Array<{ role: 'user' | 'model'; content: string }>;
  userId?: string;
  shouldLearn?: boolean;
}

interface ScheduleOSInput {
  shifts: any[];
  employees: any[];
  constraints?: {
    weekStart?: string;
    weekEnd?: string;
    [key: string]: any;
  };
}

interface PredictionInput {
  predictionType: string;
  historicalData: any;
}

interface BusinessInsightInput {
  insightType: 'sales' | 'finance' | 'operations' | 'automation' | 'growth';
  timeframe?: 'weekly' | 'monthly' | 'quarterly';
  focusArea?: string;
}

interface FAQUpdateInput {
  question: string;
  answer: string;
  category?: string;
  tags?: string[];
}

interface PlatformRecommendationInput {
  userNeed: string;
  currentPlan?: string;
  currentUsage?: any;
}

interface PlatformAwarenessInput {
  query: string;
  queryType?: 'help' | 'troubleshoot' | 'feature_info' | 'how_to';
  context?: {
    currentFeature?: string;
    symptoms?: string[];
    userRole?: 'employee' | 'manager' | 'org_admin' | 'org_owner';
  };
}

interface IssueDiagnosisInput {
  description: string;
  symptoms: string[];
  affectedFeature?: string;
  context?: Record<string, any>;
}

export interface EnqueueJobRequest {
  workspaceId?: string;
  userId?: string;
  skill: string;
  input: any;
  priority?: 'low' | 'normal' | 'high' | 'critical';
  // Conversation context for proper chatroom routing
  conversationId?: string;
  sessionId?: string;
}

export interface JobResult {
  jobId: string;
  status: string;
  output?: any;
  error?: string;
  confidenceScore?: number;
  requiresApproval?: boolean;
}

export class AIBrainService {
  /**
   * Submit a job to the AI Brain - UNIVERSAL ENTRY POINT
   */
  async enqueueJob(request: EnqueueJobRequest): Promise<JobResult> {
    const contextInfo = request.conversationId 
      ? `conversation ${request.conversationId}` 
      : `workspace ${request.workspaceId || 'global'}`;
    log.info(`🧠 [AI Brain] New job: ${request.skill} for ${contextInfo}`);

    const [job] = await db.insert(aiBrainJobs).values({
      workspaceId: request.workspaceId || null,
      userId: request.userId || null,
      skill: request.skill as any,
      input: request.input,
      priority: request.priority || 'normal',
      status: 'pending',
      // Store conversation context for proper routing
      conversationId: request.conversationId || null,
      sessionId: request.sessionId || null,
    }).returning();

    try {
      const result = await this.executeJob(job);
      return result;
    } catch (error: any) {
      log.error(`❌ [AI Brain] Job ${job.id} failed:`, error);
      
      const errorMessage = (error instanceof Error ? error.message : String(error)) || 'Unknown error occurred';
      const errorStack = error.stack || '';
      
      await db.update(aiBrainJobs)
        .set({
          status: 'failed',
          error: errorMessage,
          completedAt: new Date()
        })
        .where(eq(aiBrainJobs.id, job.id));

      // Emit AI error event if job has a conversation context
      if (job.conversationId) {
        const isTimeout = error.code === 'ETIMEDOUT' || error.message?.includes('timeout');
        
        if (isTimeout) {
          await ChatServerHub.emitAITimeout({
            conversationId: job.conversationId,
            workspaceId: job.workspaceId || undefined,
            jobId: job.id,
            skill: job.skill,
            timeoutMs: 30000, // Default timeout
            executionTimeMs: 30000, // Exceeded timeout
            userId: job.userId || undefined,
            retryCount: 0,
            maxRetries: 3,
            canRetry: true,
          }).catch((err: Error) => log.error('[AI Brain] Failed to emit timeout event:', err));
        } else {
          await ChatServerHub.emitAIError({
            conversationId: job.conversationId,
            workspaceId: job.workspaceId || undefined,
            jobId: job.id,
            skill: job.skill,
            errorMessage,
            errorStack,
            userId: job.userId || undefined,
            retryCount: 0,
            maxRetries: 3,
            canRetry: true,
          }).catch((err: Error) => log.error('[AI Brain] Failed to emit error event:', err));
        }
      }

      return {
        jobId: job.id,
        status: 'failed',
        error: errorMessage
      };
    }
  }

  /**
   * Execute a job - Routes to appropriate skill handler
   * Includes timeout detection for long-running jobs
   */
  private async executeJob(job: AiBrainJob): Promise<JobResult> {
    const startTime = Date.now();
    const JOB_TIMEOUT_MS = TIMEOUTS.aiJobTimeoutMs;

    await db.update(aiBrainJobs)
      .set({
        status: 'running',
        startedAt: new Date()
      })
      .where(eq(aiBrainJobs.id, job.id));

    let output: any;
    let confidenceScore: number | undefined;
    let tokensUsed = 0;

    // Cast input to typed interface based on skill
    const input = job.input as any;

    // Create a timeout promise that rejects after JOB_TIMEOUT_MS
    const timeoutPromise = new Promise((_, reject) => {
      setTimeout(() => {
        const timeoutError = new Error(`Job execution timeout after ${JOB_TIMEOUT_MS}ms`);
        (timeoutError as any).code = 'ETIMEDOUT';
        (timeoutError as any).isTimeout = true;
        reject(timeoutError);
      }, JOB_TIMEOUT_MS);
    });

    try {
      // Execute skill handler with timeout protection
      const executionPromise = (async () => {
        switch (job.skill) {
          case 'helpos_support':
            const helpResult = await this.executeHelpAISupport(job, input as HelpAIInput);
            output = helpResult.output;
            tokensUsed = helpResult.tokensUsed;
            confidenceScore = helpResult.output?.reasoning?.reexamined ? 0.85 : 0.95;
            break;

          case 'scheduleos_generation':
            const scheduleResult = await this.executeScheduleGeneration(job, input as ScheduleOSInput);
            output = scheduleResult.output;
            tokensUsed = scheduleResult.tokensUsed;
            confidenceScore = scheduleResult.confidence;
            break;

          case 'intelligenceos_prediction':
            const predictionResult = await this.executePrediction(job, input as PredictionInput);
            output = predictionResult.output;
            tokensUsed = predictionResult.tokensUsed;
            confidenceScore = predictionResult.confidence;
            break;

          case 'business_insight':
            const insightResult = await this.executeBusinessInsight(job, input as BusinessInsightInput);
            output = insightResult.output;
            tokensUsed = insightResult.tokensUsed;
            confidenceScore = insightResult.confidence;
            break;

          case 'platform_recommendation':
            const recResult = await this.executePlatformRecommendation(job, input as PlatformRecommendationInput);
            output = recResult.output;
            tokensUsed = recResult.tokensUsed;
            confidenceScore = 0.9;
            break;

          case 'faq_update':
            const faqResult = await this.executeFAQUpdate(job, input as FAQUpdateInput);
            output = faqResult.output;
            tokensUsed = faqResult.tokensUsed;
            confidenceScore = 0.95;
            break;

          case 'platform_awareness':
            const awarenessResult = await this.executePlatformAwareness(job, input as PlatformAwarenessInput);
            output = awarenessResult.output;
            tokensUsed = awarenessResult.tokensUsed;
            confidenceScore = awarenessResult.confidence;
            break;

          case 'issue_diagnosis':
            const diagnosisResult = await this.executeIssueDiagnosis(job, input as IssueDiagnosisInput);
            output = diagnosisResult.output;
            tokensUsed = diagnosisResult.tokensUsed;
            confidenceScore = diagnosisResult.confidence;
            break;

          case 'trinity_summarize':
            // Trinity AI conversation summarization for ticket closure
            const summarizeResult = await this.executeTrinitySum(job, input);
            output = summarizeResult.output;
            tokensUsed = summarizeResult.tokensUsed;
            confidenceScore = 0.95;
            break;

          case 'helpai_greeting':
          case 'helpai_response':
          case 'helpai_faq_search':
          case 'helpai_urgency':
            // HelpAI skills - delegate to help support handler
            const helpaiResult = await this.executeHelpAISupport(job, input as HelpAIInput);
            output = helpaiResult.output;
            tokensUsed = helpaiResult.tokensUsed;
            confidenceScore = 0.9;
            break;

          default:
            throw new Error(`Unknown skill: ${job.skill}`);
        }
      })();

      // Race between execution and timeout
      await Promise.race([executionPromise, timeoutPromise]);
    } catch (error: any) {
      // Check if this is a timeout error
      if (error.code === 'ETIMEDOUT' || error.isTimeout) {
        const executionTime = Date.now() - startTime;
        
        await db.update(aiBrainJobs)
          .set({
            status: 'failed',
            error: `Timeout after ${JOB_TIMEOUT_MS}ms: ${(error instanceof Error ? error.message : String(error))}`,
            executionTimeMs: executionTime,
            completedAt: new Date()
          })
          .where(eq(aiBrainJobs.id, job.id));

        // Emit timeout event to chatroom if conversation context exists
        if (job.conversationId) {
          await ChatServerHub.emitAITimeout({
            conversationId: job.conversationId,
            workspaceId: job.workspaceId || undefined,
            jobId: job.id,
            skill: job.skill,
            timeoutMs: JOB_TIMEOUT_MS,
            executionTimeMs: executionTime,
            userId: job.userId || undefined,
            retryCount: 0,
            maxRetries: 3,
            canRetry: true,
          }).catch((err: Error) => log.error('[AI Brain] Failed to emit timeout event:', err));
        }

        log.info(`⏱️ [AI Brain] Job ${job.id} timed out after ${executionTime}ms`);
        throw error;
      }
      throw error;
    }

    const requiresApproval = confidenceScore ? confidenceScore < 0.95 : false;
    const finalStatus = requiresApproval ? 'requires_approval' : 'completed';

    const executionTime = Date.now() - startTime;
    await db.update(aiBrainJobs)
      .set({
        status: finalStatus as any,
        output,
        tokensUsed,
        confidenceScore,
        requiresHumanReview: requiresApproval,
        executionTimeMs: executionTime,
        completedAt: new Date()
      })
      .where(eq(aiBrainJobs.id, job.id));

    const logMetadata = output?._auditMetadata || {};
    const orgInfo = logMetadata.orgExternalId 
      ? `[${logMetadata.orgExternalId}] ${logMetadata.orgName || ''}` 
      : `workspace: ${job.workspaceId || 'global'}`;
    
    log.info(`✅ [AI Brain] Job ${job.id} completed in ${executionTime}ms (confidence: ${confidenceScore?.toFixed(2)}) - ${orgInfo}`);

    // UNIFIED EVENT SYSTEM: Route AI response to correct chatroom with conversation context
    if (job.conversationId) {
      // If conversation-specific, emit to the correct chatroom
      const actionType = requiresApproval ? 'escalation' : 'response';
      const skillLabel = job.skill.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
      
      ChatServerHub.emitAIAction({
        conversationId: job.conversationId,
        workspaceId: job.workspaceId || undefined,
        actionType,
        title: `AI ${skillLabel}: ${finalStatus === 'requires_approval' ? 'Needs Review' : 'Complete'}`,
        description: finalStatus === 'requires_approval'
          ? `Low confidence (${((confidenceScore || 0) * 100).toFixed(0)}%) - human review recommended`
          : `Completed in ${executionTime}ms with ${((confidenceScore || 1) * 100).toFixed(0)}% confidence`,
        targetUserId: job.userId || undefined,
      }).catch((err: Error) => log.error('[AI Brain] Failed to emit chatroom action:', err));
    } else {
      // For non-conversation jobs, emit to platform event bus
      ChatServerHub.emitAIBrainResponse({
        jobId: job.id,
        workspaceId: job.workspaceId || undefined,
        userId: job.userId || undefined,
        skill: job.skill,
        status: finalStatus,
        confidenceScore,
        requiresApproval,
        executionTimeMs: executionTime,
      }).catch((err: Error) => log.error('[AI Brain] Failed to emit event:', err));
    }

    return {
      jobId: job.id,
      status: finalStatus,
      output,
      confidenceScore,
      requiresApproval
    };
  }

  /**
   * ENHANCED HelpAI Support - With Iterative Reasoning, Sentiment Detection, and Domain Tool Calling
   * 
   * Intelligence Pipeline:
   * 1. SENTIMENT: Detect user emotion and urgency
   * 2. COMPLEXITY: Assess if the question needs data lookup or conflict analysis
   * 3. FAQ SEARCH: Check knowledge base for existing answers
   * 4. DOMAIN TOOLS: Enable tool calling for data-intensive questions (schedules, payroll, etc.)
   * 5. GENERATE: Send to Gemini with full context, tools, and tone guidance
   * 6. CONFIDENCE CHECK: If response seems low-quality, re-examine with deeper reasoning
   * 7. THOUGHT LOGGING: Record the reasoning chain for Trinity's metacognition
   * 8. LEARN: Store successful interactions for future use
   */
  private async executeHelpAISupport(job: AiBrainJob, input: HelpAIInput): Promise<{ output: any; tokensUsed: number }> {
    // Phase 48: Defence-in-depth — sanitize the message a second time at the AI
    // service boundary in case it arrives via a path that bypassed the route layer.
    const rawMessage = input.message;
    const message = typeof rawMessage === 'string'
      ? rawMessage.slice(0, 4_000).replace(/\0/g, '')
      : '';
    const { conversationHistory, shouldLearn } = input;
    const workspaceId = job.workspaceId || undefined;
    const userId = job.userId || undefined;

    // STEP 1: SENTIMENT ANALYSIS
    const sentiment = analyzeSentiment(message);
    if (sentiment.shouldEscalate) {
      log.info(`🚨 [AI Brain] High frustration/urgency detected - escalation recommended`);
    }

    // STEP 2: COMPLEXITY ASSESSMENT
    const complexity = assessComplexity(message);
    const enableTools = complexity.requiresDataLookup || complexity.requiresConflictAnalysis || complexity.isComplex;

    // METACOGNITION STEP 1: PERCEIVE — observe and understand the request
    try {
      await trinityThoughtEngine.perceive(
        `Request received: "${message.substring(0, 120)}..." | Domains: [${complexity.domains.join(', ')}] | Sentiment: ${sentiment.sentiment}/${sentiment.urgency} | Complex: ${complexity.isComplex} | Tools needed: ${enableTools}`,
        { workspaceId, triggeredBy: 'request_intake' }
      );
    } catch (e) { /* non-blocking */ }

    // METACOGNITION STEP 2: DELIBERATE — evaluate approach and form hypothesis
    const selectedProvider = this.selectProviderForDomain(complexity.domains, sentiment);
    try {
      const toolStrategy = enableTools
        ? `Will use tool calling for data lookup across [${complexity.domains.join(', ')}]`
        : 'Direct response — no data lookup needed';
      await trinityThoughtEngine.deliberate(
        `Strategy: ${toolStrategy}. Provider: ${selectedProvider}. ${complexity.requiresConflictAnalysis ? 'Conflict analysis required — step-by-step reasoning needed.' : ''}`,
        [
          enableTools ? 'Direct answer without data' : 'Full tool-calling pass',
          sentiment.shouldEscalate ? 'Immediate human escalation' : 'Continue AI handling',
        ],
        complexity.isComplex ? 0.7 : 0.85,
        { workspaceId, triggeredBy: 'strategy_selection' }
      );
    } catch (e) { /* non-blocking */ }

    // STEP 3: FAQ SEARCH
    const relevantFaqs = await this.searchFAQs(message, workspaceId);

    // STEP 4: BUILD INTELLIGENT SYSTEM PROMPT
    const systemPrompt = this.buildIntelligentPrompt(message, relevantFaqs, sentiment, complexity);

    // METACOGNITION STEP 3: DECIDE — commit to approach
    try {
      await trinityThoughtEngine.decide(
        `Proceeding with ${enableTools ? 'tool-augmented' : 'direct'} response generation via ${selectedProvider}`,
        `FAQs found: ${relevantFaqs.length}. Domains: ${complexity.domains.length}. Escalation: ${sentiment.shouldEscalate}. Reasoning depth: ${complexity.reasoningDepth}.`,
        enableTools ? 0.8 : 0.9,
        { workspaceId, triggeredBy: 'execution_decision' }
      );
    } catch (e) { /* non-blocking */ }

    // STEP 5: GENERATE — chain-of-command provider routing
    let totalTokens = 0;
    let finalResponse = '';

    const useAlternateProvider = selectedProvider !== 'gemini_trinity' && !enableTools;

    if (useAlternateProvider) {
      const { callAIWithFallback } = await import('./providers/resilientAIGateway');
      const providerMap: Record<string, 'claude' | 'openai' | 'gemini'> = {
        'claude_cfo': 'claude',
        'claude_strategic': 'claude',
        'gpt_support_escalation': 'openai',
      };
      const preferred = providerMap[selectedProvider] || 'gemini';
      log.info(`🎯 [Chain-of-Command] Routing to ${preferred} for domain: ${selectedProvider}`);

      try {
        const aiResponse = await callAIWithFallback(
          `${systemPrompt}\n\nUser: ${message}`,
          { workspaceId, userId, domains: complexity.domains },
          {
            preferredProvider: preferred,
            domain: selectedProvider,
            workspaceId,
            userId,
            maxTokens: 2048,
          }
        );
        finalResponse = aiResponse.content;
        totalTokens = finalResponse.length / 4;
        log.info(`✅ [Chain-of-Command] ${aiResponse.provider} responded (${finalResponse.length} chars, fallback: ${aiResponse.fallbackUsed})`);
      } catch (routingError: any) {
        log.warn(`⚠️ [Chain-of-Command] ${selectedProvider} routing failed, falling back to Gemini: ${routingError.message}`);
        const response = await geminiClient.generate({
          workspaceId,
          userId,
          featureKey: 'helpos_support',
          systemPrompt,
          userMessage: message,
          conversationHistory,
          enableToolCalling: false,
        });
        totalTokens = response.tokensUsed;
        finalResponse = response.text;
      }
    } else {
      const response = await geminiClient.generate({
        workspaceId,
        userId,
        featureKey: 'helpos_support',
        systemPrompt,
        userMessage: message,
        conversationHistory,
        enableToolCalling: enableTools,
      });
      totalTokens = response.tokensUsed;
      finalResponse = response.text;
    }

    // STEP 6: ITERATIVE REASONING - Re-examine if confidence seems low
    const needsReexamination = this.shouldReexamine(finalResponse, complexity, sentiment);
    if (needsReexamination) {
      log.info(`🔄 [AI Brain] Low confidence detected, re-examining with deeper reasoning...`);

      const reexaminationPrompt = `${systemPrompt}

IMPORTANT: Your previous attempt may have been too generic. The user needs SPECIFIC, ACTIONABLE help.
${complexity.requiresConflictAnalysis ? `\nCONFLICT RESOLUTION REQUIRED: Think through this step-by-step:
1. What is the specific conflict or problem?
2. What data do you need to look up to understand it?
3. What are the possible solutions?
4. Which solution is best and why?
5. What concrete action should the user take?` : ''}
${complexity.domains.length > 1 ? `\nMULTI-DOMAIN ANALYSIS: This question spans ${complexity.domains.join(' + ')}. Consider how these domains interact and affect each other.` : ''}

Previous response was: "${finalResponse.substring(0, 200)}..."
If that response was too vague or generic, provide a BETTER, more specific answer. Use the tools to look up real data.`;

      const deepResponse = await geminiClient.generate({
        workspaceId,
        userId,
        featureKey: 'helpos_support',
        systemPrompt: reexaminationPrompt,
        userMessage: message,
        conversationHistory,
        enableToolCalling: true,
      });

      totalTokens += deepResponse.tokensUsed;

      if (deepResponse.text.length > finalResponse.length * 0.8) {
        finalResponse = deepResponse.text;
        log.info(`✅ [AI Brain] Re-examination produced better response (${deepResponse.text.length} chars)`);
      }
    }

    // METACOGNITION STEP 4: REFLECT — evaluate outcome and log lessons
    try {
      const responseQuality = finalResponse.length > 100 && !finalResponse.includes("I don't know") ? 'adequate' : 'low_quality';
      const confidenceScore = needsReexamination ? 0.65 : (responseQuality === 'adequate' ? 0.9 : 0.5);
      
      await trinityThoughtEngine.reflect(
        'action',
        job.id,
        `Processed ${complexity.reasoningDepth}-depth query across [${complexity.domains.join(', ')}]. Sentiment: ${sentiment.sentiment}. Tools: ${enableTools}. Re-examined: ${needsReexamination}. Response quality: ${responseQuality}. Tokens: ${totalTokens}.`,
        { success: responseQuality === 'adequate', score: confidenceScore },
        workspaceId
      );
    } catch (e) { /* non-blocking */ }

    // STEP 8: LEARN from successful interactions
    if (shouldLearn && finalResponse.length > 50 && !finalResponse.includes("I don't know")) {
      await this.learnFromInteraction(workspaceId, message, finalResponse);
    }

    // Auto-escalation for extremely frustrated users
    let escalationNote: string | undefined;
    if (sentiment.shouldEscalate) {
      escalationNote = 'This user appears highly frustrated or has an urgent issue. A human support agent should review this conversation.';
      try {
        const ticketNumber = `ESC-${Date.now().toString(36).toUpperCase()}`;
        if (workspaceId) {
          await db.insert(supportTickets).values({
            workspaceId,
            ticketNumber,
            type: 'support',
            subject: `Auto-escalation: ${sentiment.urgency} urgency - ${message.substring(0, 80)}`,
            description: `Automatically escalated due to ${sentiment.sentiment} sentiment (frustration level: ${Math.round(sentiment.frustrationLevel * 100)}%). Original message: ${message}`,
            priority: sentiment.urgency === 'critical' ? 'urgent' : 'high',
            status: 'open',
            employeeId: userId,
          });
          log.info(`🎫 [AI Brain] Auto-created escalation ticket: ${ticketNumber}`);
        }
      } catch (e) { /* non-blocking ticket creation */ }
    }

    return {
      output: {
        response: finalResponse,
        suggestedFaqs: relevantFaqs.slice(0, 3),
        sentiment: {
          detected: sentiment.sentiment,
          urgency: sentiment.urgency,
          escalated: sentiment.shouldEscalate,
        },
        reasoning: {
          complexity: complexity.reasoningDepth,
          domains: complexity.domains,
          toolsUsed: enableTools,
          reexamined: needsReexamination,
        },
        escalationNote,
        timestamp: new Date().toISOString()
      },
      tokensUsed: totalTokens
    };
  }

  private buildIntelligentPrompt(
    message: string,
    faqs: Array<{ question: string; answer: string }>,
    sentiment: SentimentResult,
    complexity: ComplexityAssessment
  ): string {
    let prompt = `You are Trinity, the AI Brain for CoAIleague - an autonomous workforce management platform for security guard companies.

${sentiment.toneGuidance}

`;

    if (faqs.length > 0) {
      prompt += `KNOWLEDGE BASE (use these if they match the question):
${faqs.map(f => `Q: ${f.question}\nA: ${f.answer}`).join('\n\n')}

`;
    }

    if (complexity.requiresDataLookup) {
      prompt += `DATA LOOKUP REQUIRED: The user is asking about real data. Use the available tools to look up actual schedules, timesheets, payroll, invoices, or employee information. Do NOT make up numbers or give generic advice when real data is available.

`;
    }

    if (complexity.requiresConflictAnalysis) {
      prompt += `CONFLICT RESOLUTION MODE: Think through this problem step-by-step:
1. IDENTIFY the specific conflict or discrepancy
2. LOOK UP the relevant data using tools
3. ANALYZE what went wrong and why
4. RECOMMEND specific actions to resolve it
5. EXPLAIN what to do to prevent it in the future

`;
    }

    if (complexity.domains.length > 0) {
      prompt += `RELEVANT DOMAINS: ${complexity.domains.join(', ')}
`;
    }

    prompt += `RESPONSE GUIDELINES:
1. Be concise but thorough - give the actual answer, not just acknowledgment
2. If data lookup is needed, USE THE TOOLS to get real information
3. For scheduling conflicts: identify who, when, and what overlaps
4. For payroll issues: check actual pay runs, amounts, and discrepancies
5. For invoice problems: look up actual invoice statuses and amounts
6. When suggesting actions, be SPECIFIC (which button, which page, what to click)
7. If you cannot fully resolve the issue, explain exactly what needs human attention and why`;

    return prompt;
  }

  /**
   * CHAIN-OF-COMMAND: Select the optimal AI provider based on domain classification
   * - Financial/strategic → Claude CFO (higher reasoning, better at P&L, contracts)
   * - Customer support escalations → GPT-4 (trained for empathetic support)
   * - Default operations → Gemini (Trinity brain, tool calling, scheduling)
   */
  private selectProviderForDomain(
    domains: string[],
    sentiment: SentimentResult
  ): string {
    const domainSet = new Set(domains.map(d => d.toLowerCase()));

    if (domainSet.has('finance') || domainSet.has('invoicing') || domainSet.has('payroll') ||
        domainSet.has('revenue') || domainSet.has('billing') || domainSet.has('tax') ||
        domainSet.has('forecasting') || domainSet.has('budget')) {
      return 'claude_cfo';
    }

    if (sentiment.shouldEscalate && sentiment.frustrationLevel > 0.6) {
      return 'gpt_support_escalation';
    }

    if (domainSet.has('compliance') || domainSet.has('legal') || domainSet.has('contract') ||
        domainSet.has('rfp') || domainSet.has('audit')) {
      return 'claude_strategic';
    }

    return 'gemini_trinity';
  }

  private shouldReexamine(response: string, complexity: ComplexityAssessment, sentiment: SentimentResult): boolean {
    if (!complexity.isComplex) return false;
    
    const genericPhrases = [
      'contact support',
      'reach out to',
      'I cannot access',
      'I don\'t have access',
      'please check',
      'you may want to',
      'it depends on',
      'generally speaking',
    ];
    const hasGenericResponse = genericPhrases.some(phrase => response.toLowerCase().includes(phrase));
    
    if (hasGenericResponse && complexity.requiresDataLookup) return true;
    
    if (response.length < 100 && complexity.reasoningDepth === 'deep') return true;
    
    if (sentiment.urgency === 'critical' && response.length < 200) return true;
    
    return false;
  }

  /**
   * Search FAQs for relevant answers
   */
  private async searchFAQs(query: string, workspaceId?: string): Promise<Array<{ id: string; question: string; answer: string; score: number }>> {
    try {
      // Query published FAQs (helposFaqs doesn't have workspaceId - it's global)
      const faqs = await db
        .select()
        .from(helposFaqs)
        .where(eq(helposFaqs.isPublished, true))
        .limit(20);

      // Simple keyword matching for now (could be enhanced with embeddings)
      const queryLower = query.toLowerCase();
      const queryWords = queryLower.split(/\s+/).filter(w => w.length > 2);

      const scored = faqs.map(faq => {
        const questionLower = faq.question.toLowerCase();
        const answerLower = faq.answer.toLowerCase();
        let score = 0;

        for (const word of queryWords) {
          if (questionLower.includes(word)) score += 2;
          if (answerLower.includes(word)) score += 1;
        }

        return { ...faq, score };
      }).filter(f => f.score > 0).sort((a, b) => b.score - a.score);

      return scored.slice(0, 5).map(f => ({
        id: f.id,
        question: f.question,
        answer: f.answer,
        score: f.score
      }));
    } catch (error) {
      log.error('[AI Brain] FAQ search error:', error);
      return [];
    }
  }

  /**
   * Enhanced FAQ Learning System with Deduplication, Provenance, and Version Control
   */
  private async learnFromInteraction(
    workspaceId: string | undefined, 
    question: string, 
    answer: string,
    options?: {
      sourceType?: 'ai_learned' | 'ticket_resolution' | 'feature_update' | 'gap_detection';
      sourceId?: string;
      sourceContext?: Record<string, any>;
      confidence?: number;
      userId?: string;
    }
  ): Promise<{ action: 'created' | 'updated' | 'skipped'; faqId?: string }> {
    try {
      const { 
        sourceType = 'ai_learned', 
        sourceId, 
        sourceContext,
        confidence = 80,
        userId
      } = options || {};

      // 1. Generate similarity hash for deduplication
      const normalizedQuestion = this.normalizeText(question);
      const similarityHash = crypto.createHash('sha256').update(normalizedQuestion).digest('hex').substring(0, 16);
      
      // 2. Check for duplicate/similar FAQs with enhanced matching
      const existingFaqs = await this.searchFAQsAdvanced(question);
      
      if (existingFaqs.length > 0 && existingFaqs[0].similarityScore > 0.85) {
        const existingFaq = existingFaqs[0];
        
        // 3. Decide: Update existing FAQ or skip
        if (answer.length > (existingFaq.answer?.length || 0) * 1.2 || confidence > (existingFaq.confidenceScore || 0)) {
          await db.transaction(async (tx) => {
            // Save version history before updating (must be atomic with the update)
            await this.saveVersionHistory(existingFaq, 'updated', 'Better answer from AI learning', userId, tx);

            // Update existing FAQ with better answer
            await tx.update(helposFaqs)
              .set({
                answer: answer.substring(0, 2000),
                version: sql`COALESCE(${helposFaqs.version}, 1) + 1`,
                updatedAt: new Date(),
                updatedBy: userId || null,
                matchCount: sql`COALESCE(${helposFaqs.matchCount}, 0) + 1`,
                confidenceScore: Math.max(confidence, existingFaq.confidenceScore || 0),
                sourceType: sourceType,
                sourceId: sourceId || existingFaq.sourceId,
                sourceContext: {
                  ...(existingFaq.sourceContext as Record<string, any> || {}),
                  lastUpdate: new Date().toISOString(),
                  ...(sourceContext || {})
                },
                changeReason: `Updated with ${confidence}% confident answer from ${sourceType}`
              })
              .where(eq(helposFaqs.id, existingFaq.id));
          });
          
          log.info(`📝 [AI Brain] Updated FAQ ${existingFaq.id} with better answer (v${(existingFaq.version || 1) + 1})`);
          return { action: 'updated', faqId: existingFaq.id };
        } else {
          // Just increment match count for good existing FAQ
          await db.update(helposFaqs)
            .set({
              matchCount: sql`COALESCE(${helposFaqs.matchCount}, 0) + 1`,
              resolvedCount: sql`COALESCE(${helposFaqs.resolvedCount}, 0) + 1`,
              helpfulCount: sql`COALESCE(${helposFaqs.helpfulCount}, 0) + 1`
            })
            .where(eq(helposFaqs.id, existingFaq.id));
          
          log.info(`📚 [AI Brain] FAQ ${existingFaq.id} matched - incremented counters`);
          return { action: 'skipped', faqId: existingFaq.id };
        }
      }

      // 4. Create new FAQ with full provenance
      const autoPublish = confidence >= 90 && sourceType !== 'ai_learned';
      const status = autoPublish ? 'published' : 'draft';
      
      const newFaq = await db.transaction(async (tx) => {
        const [faq] = await tx.insert(helposFaqs).values({
          workspaceId: 'system',
          question: question.substring(0, 500),
          answer: answer.substring(0, 2000),
          category: this.categorizeQuestion(question),
          tags: this.extractTags(question, answer),
          searchKeywords: normalizedQuestion,

          // Provenance
          sourceType: sourceType,
          sourceId: sourceId || null,
          sourceContext: {
            originalQuestion: question,
            learningTimestamp: new Date().toISOString(),
            ...(sourceContext || {})
          },

          // Quality
          status: status,
          confidenceScore: confidence,
          isPublished: autoPublish,
          publishedAt: autoPublish ? new Date() : null,

          // Version control
          version: 1,

          // Metrics
          matchCount: 1,
          helpfulCount: 0
        }).returning();

        // Save initial version (atomic with the FAQ insert)
        await this.saveVersionHistory(faq, 'created', `Auto-created from ${sourceType}`, userId, tx);
        return faq;
      });
      
      log.info(`🆕 [AI Brain] Created new FAQ ${newFaq.id} from ${sourceType} (status: ${status})`);
      return { action: 'created', faqId: newFaq.id };
    } catch (error) {
      log.error('[AI Brain] Learning error:', error);
      return { action: 'skipped' };
    }
  }

  /**
   * Save FAQ version to history for audit trail
   */
  private async saveVersionHistory(
    faq: Partial<HelposFaq>,
    changeType: 'created' | 'updated' | 'corrected' | 'merged' | 'archived',
    changeReason: string,
    changedBy?: string | null,
    tx?: DbTransaction
  ): Promise<void> {
    try {
      const writer = tx ?? db;
      await writer.insert(faqVersions).values({
        workspaceId: 'system',
        faqId: faq.id!,
        version: faq.version || 1,
        question: faq.question || '',
        answer: faq.answer || '',
        category: faq.category || 'general',
        tags: faq.tags || [],
        changedBy: changedBy || null,
        changedByAi: !changedBy,
        changeType,
        changeReason,
        sourceType: faq.sourceType as any,
        sourceId: faq.sourceId
      });
    } catch (error) {
      log.error('[AI Brain] Version history save error:', error);
    }
  }

  /**
   * Record a gap event when AI couldn't answer well
   */
  async recordGapEvent(
    question: string,
    options: {
      sourceType: 'chat_unanswered' | 'low_confidence' | 'ticket_common' | 'feedback_negative';
      sourceId?: string;
      suggestedAnswer?: string;
      confidence?: number;
      context?: Record<string, any>;
    }
  ): Promise<string | null> {
    try {
      const similarityHash = crypto.createHash('sha256')
        .update(this.normalizeText(question))
        .digest('hex').substring(0, 16);
      
      // Check for existing similar gap
      const existingGaps = await db.select()
        .from(faqGapEvents)
        .where(eq(faqGapEvents.similarityHash, similarityHash))
        .limit(1);
      
      if (existingGaps.length > 0) {
        // Increment occurrence count
        await db.update(faqGapEvents)
          .set({
            occurrenceCount: sql`COALESCE(${faqGapEvents.occurrenceCount}, 1) + 1`,
            lastOccurredAt: new Date(),
            updatedAt: new Date()
          })
          .where(eq(faqGapEvents.id, existingGaps[0].id));
        
        log.info(`📊 [AI Brain] Gap event ${existingGaps[0].id} occurred again (count: ${(existingGaps[0].occurrenceCount || 1) + 1})`);
        return existingGaps[0].id;
      }
      
      // Create new gap event
      const [gap] = await db.insert(faqGapEvents).values({
        workspaceId: 'system',
        question: question.substring(0, 500),
        sourceType: options.sourceType,
        sourceId: options.sourceId || null,
        suggestedAnswer: options.suggestedAnswer?.substring(0, 2000) || null,
        suggestedCategory: this.categorizeQuestion(question),
        confidenceScore: options.confidence || null,
        context: options.context || null,
        status: 'open',
        similarityHash,
        occurrenceCount: 1,
        lastOccurredAt: new Date()
      }).returning();
      
      log.info(`🕳️ [AI Brain] Recorded new gap event: ${gap.id}`);
      return gap.id;
    } catch (error) {
      log.error('[AI Brain] Gap event recording error:', error);
      return null;
    }
  }

  /**
   * Learn from resolved support ticket
   */
  async learnFromTicket(ticketId: string): Promise<void> {
    try {
      const [ticket] = await db.select()
        .from(supportTickets)
        .where(eq(supportTickets.id, ticketId))
        .limit(1);
      
      if (!ticket || ticket.status !== 'resolved') {
        return;
      }
      
      // Extract learnable content from ticket
      const question = ticket.subject || ticket.description?.substring(0, 200);
      const answer = ticket.resolution || ticket.platformNotes;
      
      if (!question || !answer) {
        return;
      }
      
      await this.learnFromInteraction(undefined, question, answer, {
        sourceType: 'ticket_resolution',
        sourceId: ticketId,
        sourceContext: {
          ticketType: ticket.type,
          ticketPriority: ticket.priority,
          resolvedAt: ticket.resolvedAt,
          ticketId
        },
        confidence: 95 // High confidence for human-resolved tickets
      });
      
      // Check if this resolves any gaps
      await this.resolveGapsFromTicket(question, ticketId);
      
      log.info(`🎫 [AI Brain] Learned from ticket resolution: ${ticketId}`);
    } catch (error) {
      log.error('[AI Brain] Ticket learning error:', error);
    }
  }

  /**
   * Resolve gap events that match a newly resolved question
   */
  private async resolveGapsFromTicket(question: string, ticketId: string): Promise<void> {
    try {
      const similarityHash = crypto.createHash('sha256')
        .update(this.normalizeText(question))
        .digest('hex').substring(0, 16);
      
      await db.update(faqGapEvents)
        .set({
          status: 'faq_created',
          resolvedAt: new Date(),
          resolutionNotes: `Resolved by ticket ${ticketId}`,
          updatedAt: new Date()
        })
        .where(and(
          eq(faqGapEvents.status, 'open'),
          eq(faqGapEvents.similarityHash, similarityHash)
        ));
    } catch (error) {
      log.error('[AI Brain] Gap resolution error:', error);
    }
  }

  /**
   * Detect and flag stale FAQs that may need updates
   */
  async detectStaleFaqs(): Promise<HelposFaq[]> {
    try {
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
      
      // Find FAQs that are:
      // 1. Not verified recently
      // 2. Have high escalation rates
      // 3. Have expired
      const staleFaqs = await db.select()
        .from(helposFaqs)
        .where(and(
          eq(helposFaqs.isPublished, true),
          or(
            // Not verified in 30 days
            and(
              sql`${helposFaqs.lastVerifiedAt} IS NULL`,
              sql`${helposFaqs.createdAt} < ${thirtyDaysAgo}`
            ),
            lte(helposFaqs.lastVerifiedAt, thirtyDaysAgo),
            // High escalation rate (>20% of matches resulted in escalation)
            sql`COALESCE(${helposFaqs.escalatedCount}, 0) > COALESCE(${helposFaqs.matchCount}, 1) * 0.2`,
            // Expired
            and(
              sql`${helposFaqs.expiresAt} IS NOT NULL`,
              lte(helposFaqs.expiresAt, new Date())
            )
          )
        ))
        .limit(50);
      
      // Mark as needing review
      for (const faq of staleFaqs) {
        await db.update(helposFaqs)
          .set({ 
            status: 'needs_review',
            updatedAt: new Date()
          })
          .where(eq(helposFaqs.id, faq.id));
      }
      
      log.info(`🔍 [AI Brain] Detected ${staleFaqs.length} stale FAQs needing review`);
      return staleFaqs;
    } catch (error) {
      log.error('[AI Brain] Stale FAQ detection error:', error);
      return [];
    }
  }

  /**
   * Get top gap patterns for FAQ creation suggestions
   */
  async getTopGaps(limit: number = 10): Promise<FaqGapEvent[]> {
    try {
      const gaps = await db.select()
        .from(faqGapEvents)
        .where(eq(faqGapEvents.status, 'open'))
        .orderBy(desc(faqGapEvents.occurrenceCount))
        .limit(limit);
      
      return gaps;
    } catch (error) {
      log.error('[AI Brain] Get top gaps error:', error);
      return [];
    }
  }

  /**
   * Advanced FAQ search with similarity scoring
   */
  private async searchFAQsAdvanced(query: string): Promise<Array<HelposFaq & { similarityScore: number }>> {
    try {
      const faqs = await db.select()
        .from(helposFaqs)
        .where(eq(helposFaqs.isPublished, true))
        .limit(50);
      
      const queryLower = query.toLowerCase();
      const queryWords = new Set(queryLower.split(/\s+/).filter(w => w.length > 2));
      const normalizedQuery = this.normalizeText(query);
      
      const scored = faqs.map(faq => {
        const questionLower = (faq.question || '').toLowerCase();
        const questionWordsArr = questionLower.split(/\s+/).filter(w => w.length > 2);
        const questionWords = new Set(questionWordsArr);
        
        // Jaccard similarity for word overlap
        const queryWordsArr = Array.from(queryWords);
        const intersectionArr = queryWordsArr.filter(x => questionWords.has(x));
        const unionArr = Array.from(new Set([...queryWordsArr, ...questionWordsArr]));
        const jaccardScore = unionArr.length > 0 ? intersectionArr.length / unionArr.length : 0;
        
        // Exact substring matching bonus
        const exactBonus = questionLower.includes(normalizedQuery) ? 0.3 : 0;
        
        // Calculate final similarity score (0-1)
        const similarityScore = Math.min(jaccardScore + exactBonus, 1);
        
        return { ...faq, similarityScore };
      }).filter(f => f.similarityScore > 0.1)
        .sort((a, b) => b.similarityScore - a.similarityScore);
      
      return scored.slice(0, 10);
    } catch (error) {
      log.error('[AI Brain] Advanced FAQ search error:', error);
      return [];
    }
  }

  /**
   * Normalize text for comparison
   */
  private normalizeText(text: string): string {
    return text
      .toLowerCase()
      .replace(/[^\w\s]/g, '')
      .replace(/\s+/g, ' ')
      .trim();
  }

  /**
   * Categorize question based on keywords
   */
  private categorizeQuestion(question: string): string {
    const q = question.toLowerCase();
    if (q.includes('price') || q.includes('cost') || q.includes('pay') || q.includes('bill') || q.includes('invoice')) return 'billing';
    if (q.includes('login') || q.includes('password') || q.includes('account') || q.includes('sign')) return 'account';
    if (q.includes('schedule') || q.includes('shift') || q.includes('time') || q.includes('calendar')) return 'scheduling';
    if (q.includes('employee') || q.includes('staff') || q.includes('team') || q.includes('worker')) return 'workforce';
    if (q.includes('report') || q.includes('analytics') || q.includes('data')) return 'reporting';
    if (q.includes('how') || q.includes('what') || q.includes('tutorial')) return 'features';
    if (q.includes('error') || q.includes('bug') || q.includes('issue') || q.includes('problem')) return 'technical';
    return 'general';
  }

  /**
   * Extract relevant tags from question and answer
   */
  private extractTags(question: string, answer: string): string[] {
    const combined = `${question} ${answer}`.toLowerCase();
    const tags = new Set<string>();
    
    // Feature-based tags
    if (combined.includes('schedule')) tags.add('scheduling');
    if (combined.includes('payroll')) tags.add('payroll');
    if (combined.includes('invoice')) tags.add('invoicing');
    if (combined.includes('employee')) tags.add('employees');
    if (combined.includes('client')) tags.add('clients');
    if (combined.includes('report')) tags.add('reports');
    if (combined.includes('ai') || combined.includes('automat')) tags.add('ai-features');
    if (combined.includes('mobile')) tags.add('mobile');
    if (combined.includes('integrat')) tags.add('integrations');
    
    // Source tag
    tags.add('auto-learned');
    
    return Array.from(tags).slice(0, 10);
  }

  /**
   * AI Scheduling Generation - AI-powered scheduling
   */
  private async executeScheduleGeneration(job: AiBrainJob, input: ScheduleOSInput): Promise<{ output: any; tokensUsed: number; confidence: number }> {
    const { shifts: inputShifts, employees: inputEmployees, constraints } = input;

    const enrichedInput = await this.enrichWithExternalIds(
      { shifts: inputShifts, employees: inputEmployees, constraints },
      job.workspaceId || undefined
    );

    const systemPrompt = `You are CoAIleague AI Scheduling AI, an expert at creating optimal employee schedules.

Analyze the provided shifts, employees, and constraints to create an optimal schedule assignment.
Consider:
- Employee availability and preferences
- Skill requirements for each shift
- Labor law compliance (overtime limits, break requirements)
- Workload balance across employees
- Cost optimization

Return a JSON object with:
{
  "assignments": [{"shiftId": "...", "employeeId": "...", "confidence": 0.95, "startTime": "...", "endTime": "..."}],
  "confidence": 0.98,
  "reasoning": "Brief explanation of scheduling decisions"
}`;

    const userMessage = `Create schedule assignments for:

Shifts: ${JSON.stringify(enrichedInput.shifts, null, 2)}

Employees: ${JSON.stringify(enrichedInput.employees, null, 2)}

Constraints: ${JSON.stringify(enrichedInput.constraints, null, 2)}`;

    const response = await geminiClient.generate({
      workspaceId: job.workspaceId || undefined,
      userId: job.userId || undefined,
      featureKey: 'scheduleos_generation',
      systemPrompt,
      userMessage,
      temperature: 0.3
    });

    let result;
    try {
      // Extract JSON from response (handle markdown code blocks)
      let jsonText = response.text;
      const jsonMatch = jsonText.match(/```(?:json)?\s*([\s\S]*?)```/);
      if (jsonMatch) {
        jsonText = jsonMatch[1].trim();
      }
      result = JSON.parse(jsonText);
    } catch (parseError) {
      log.error('[AI Brain] Failed to parse schedule response:', parseError);
      result = {
        assignments: [],
        confidence: 0.5,
        reasoning: 'Failed to generate valid schedule response'
      };
    }

    result._auditMetadata = {
      orgExternalId: enrichedInput._orgExternalId,
      orgName: enrichedInput._orgName,
      employeeCount: enrichedInput.employees?.length || 0,
      processedAt: new Date().toISOString()
    };

    // Persist schedules if workspace provided
    if (job.workspaceId && job.userId && result.assignments?.length > 0) {
      await this.persistScheduleAssignments(job.workspaceId, job.userId, result, job.id, constraints);
    }

    return {
      output: result,
      tokensUsed: response.tokensUsed,
      confidence: result.confidence || 0.9
    };
  }

  /**
   * Persist AI-generated schedule assignments to database
   */
  private async persistScheduleAssignments(
    workspaceId: string, 
    userId: string,
    scheduleResult: any, 
    jobId: string, 
    constraints?: { weekStart?: string; weekEnd?: string }
  ): Promise<void> {
    const confidence = scheduleResult.confidence || 0.9;
    const confidencePercent = Math.round(confidence * 100);
    const requiresApproval = confidence < 0.95;
    
    let weekStart = constraints?.weekStart ? new Date(constraints.weekStart) : new Date();
    let weekEnd = constraints?.weekEnd ? new Date(constraints.weekEnd) : new Date();
    
    if (!constraints && scheduleResult.assignments?.length > 0) {
      const firstAssignment = scheduleResult.assignments[0];
      if (firstAssignment.startTime) {
        weekStart = new Date(firstAssignment.startTime);
        weekEnd = new Date(weekStart);
        weekEnd.setDate(weekEnd.getDate() + 7);
      }
    }
    
    try {
      if (requiresApproval) {
        // Include week dates in aiResponse since scheduleProposals doesn't have separate date columns
        const aiResponseWithDates = {
          ...scheduleResult,
          weekStartDate: weekStart.toISOString(),
          weekEndDate: weekEnd.toISOString()
        };
        
        await db.insert(scheduleProposals).values({
          workspaceId,
          createdBy: userId,
          aiResponse: aiResponseWithDates,
          confidence: confidencePercent,
          status: 'pending',
        });
        
        log.info(`📋 [AI Brain] Schedule queued for approval (confidence: ${(confidence * 100).toFixed(1)}%)`);
      } else {
        const createdShifts = [];
        
        for (const assignment of scheduleResult.assignments) {
          if (assignment.startTime && assignment.endTime && assignment.employeeId) {
            const [shift] = await db.insert(shifts).values({
              workspaceId,
              employeeId: assignment.employeeId,
              clientId: assignment.clientId || null,
              startTime: new Date(assignment.startTime),
              endTime: new Date(assignment.endTime),
              status: 'scheduled', // Valid status from shiftStatusEnum
              aiGenerated: true,
              aiConfidenceScore: String(assignment.confidence || confidence),
              title: assignment.position || 'AI Scheduled Shift',
            }).returning();
            
            createdShifts.push(shift);
          }
        }
        
        log.info(`✅ [AI Brain] Auto-approved ${createdShifts.length} shift(s) (confidence: ${(confidence * 100).toFixed(1)}%)`);
      }
    } catch (error: any) {
      log.error('[AI Brain] Failed to persist schedule:', error);
    }
  }

  /**
   * IntelligenceOS Prediction - Predictive analytics
   */
  private async executePrediction(job: AiBrainJob, input: PredictionInput): Promise<{ output: any; tokensUsed: number; confidence: number }> {
    const { predictionType, historicalData } = input;

    const systemPrompt = `You are CoAIleague IntelligenceOS AI, an expert at predictive workforce analytics.

Analyze historical data and provide insights for: ${predictionType}

Return a JSON object with:
{
  "prediction": {...},
  "confidence": 0.92,
  "insights": ["key insight 1", "key insight 2"],
  "recommendations": ["recommendation 1", "recommendation 2"]
}`;

    const userMessage = `Analyze this data and provide predictions:\n\n${JSON.stringify(historicalData, null, 2)}`;

    const response = await geminiClient.generate({
      workspaceId: job.workspaceId || undefined,
      userId: job.userId || undefined,
      featureKey: 'intelligenceos_prediction',
      systemPrompt,
      userMessage,
      temperature: 0.4
    });

    let result;
    try {
      let jsonText = response.text;
      const jsonMatch = jsonText.match(/```(?:json)?\s*([\s\S]*?)```/);
      if (jsonMatch) {
        jsonText = jsonMatch[1].trim();
      }
      result = JSON.parse(jsonText);
    } catch {
      result = {
        prediction: { error: 'Failed to parse prediction' },
        confidence: 0.5,
        insights: [],
        recommendations: []
      };
    }

    return {
      output: result,
      tokensUsed: response.tokensUsed,
      confidence: result.confidence || 0.85
    };
  }

  /**
   * NEW: Business Insight Generation - Sales, Finance, Operations, Automation, Growth
   */
  private async executeBusinessInsight(job: AiBrainJob, input: BusinessInsightInput): Promise<{ output: any; tokensUsed: number; confidence: number }> {
    const { insightType, timeframe = 'monthly', focusArea } = input;

    // Gather relevant data based on insight type
    if (!job.workspaceId) {
      log.warn('[AiBrainService] executeBusinessInsight called without workspaceId — cannot gather business context');
      return { output: { error: 'workspaceId required for business insights' }, tokensUsed: 0, confidence: 0 };
    }
    const contextData = await this.gatherBusinessContext(job.workspaceId, insightType, timeframe);

    const systemPrompt = `You are CoAIleague Business Intelligence AI, an expert business analyst helping organizations grow.

Your role is to provide actionable ${insightType} insights that help organizations:
${insightType === 'sales' ? '- Increase revenue and close rates\n- Identify high-value opportunities\n- Optimize sales processes' : ''}
${insightType === 'finance' ? '- Optimize cash flow and reduce costs\n- Identify billing inefficiencies\n- Improve financial planning' : ''}
${insightType === 'operations' ? '- Improve workforce productivity\n- Reduce scheduling conflicts\n- Optimize resource allocation' : ''}
${insightType === 'automation' ? '- Identify automation opportunities\n- Calculate time savings from AI features\n- Recommend workflow improvements' : ''}
${insightType === 'growth' ? '- Identify growth opportunities\n- Optimize customer acquisition\n- Improve retention strategies' : ''}

ALWAYS provide:
1. Key metrics and trends with specific numbers
2. 3-5 specific, actionable recommendations
3. Estimated ROI or time savings for each recommendation
4. Priority ranking (high/medium/low)
5. When relevant, suggest CoAIleague platform features that can help

Return a JSON object with:
{
  "summary": "Executive summary of findings",
  "keyMetrics": [{"name": "...", "value": "...", "trend": "up/down/stable"}],
  "insights": ["insight 1", "insight 2"],
  "recommendations": [
    {"action": "...", "impact": "high/medium/low", "estimatedROI": "$X/month or X hours saved", "platformFeature": "..."}
  ],
  "confidence": 0.9
}`;

    const userMessage = `Generate ${insightType} insights for timeframe: ${timeframe}
${focusArea ? `Focus area: ${focusArea}` : ''}

Business Context:
${JSON.stringify(contextData, null, 2)}`;

    const response = await geminiClient.generate({
      workspaceId: job.workspaceId || undefined,
      userId: job.userId || undefined,
      featureKey: `business_insight_${insightType}`,
      systemPrompt,
      userMessage,
      temperature: 0.5
    });

    let result;
    try {
      let jsonText = response.text;
      const jsonMatch = jsonText.match(/```(?:json)?\s*([\s\S]*?)```/);
      if (jsonMatch) {
        jsonText = jsonMatch[1].trim();
      }
      result = JSON.parse(jsonText);
    } catch {
      result = {
        summary: response.text,
        keyMetrics: [],
        insights: [],
        recommendations: [],
        confidence: 0.7
      };
    }

    return {
      output: {
        ...result,
        insightType,
        timeframe,
        generatedAt: new Date().toISOString()
      },
      tokensUsed: response.tokensUsed,
      confidence: result.confidence || 0.85
    };
  }

  /**
   * Gather business context data for insights
   */
  private async gatherBusinessContext(workspaceId: string, insightType: string, timeframe: string): Promise<any> {
    const now = new Date();
    let startDate: Date;
    
    switch (timeframe) {
      case 'weekly':
        startDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
        break;
      case 'quarterly':
        startDate = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);
        break;
      default: // monthly
        startDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    }

    const context: any = { timeframe, workspaceId };

    try {
      if (insightType === 'sales' || insightType === 'finance' || insightType === 'growth') {
        const invoiceStats = await db
          .select({
            totalInvoices: count(),
            totalAmount: sql<number>`COALESCE(SUM(CAST(${invoices.total} AS NUMERIC)), 0)`,
            paidAmount: sql<number>`COALESCE(SUM(CAST(${invoices.amountPaid} AS NUMERIC)), 0)`
          })
          .from(invoices)
          .where(and(
            eq(invoices.workspaceId, workspaceId),
            gte(invoices.createdAt, startDate)
          ));
        
        context.invoices = invoiceStats[0] || { totalInvoices: 0, totalAmount: 0, paidAmount: 0 };
      }

      if (insightType === 'operations' || insightType === 'automation') {
        const employeeCount = await db
          .select({ count: count() })
          .from(employees)
          .where(eq(employees.workspaceId, workspaceId));
        
        const shiftCount = await db
          .select({ 
            total: count(),
            aiGenerated: sql<number>`SUM(CASE WHEN ${shifts.aiGenerated} = true THEN 1 ELSE 0 END)`
          })
          .from(shifts)
          .where(and(
            eq(shifts.workspaceId, workspaceId),
            gte(shifts.createdAt, startDate)
          ));
        
        context.employees = employeeCount[0]?.count || 0;
        context.shifts = shiftCount[0] || { total: 0, aiGenerated: 0 };
      }

      if (insightType === 'finance' || insightType === 'operations') {
        const timeEntryStats = await db
          .select({
            totalEntries: count(),
            totalHours: sql<number>`COALESCE(SUM(${timeEntries.totalHours}), 0)`
          })
          .from(timeEntries)
          .where(and(
            eq(timeEntries.workspaceId, workspaceId),
            gte(timeEntries.createdAt, startDate)
          ));
        
        context.timeEntries = timeEntryStats[0] || { totalEntries: 0, totalHours: 0 };
      }
    } catch (error) {
      log.error('[AI Brain] Error gathering business context:', error);
    }

    return context;
  }

  /**
   * NEW: Platform Recommendation - Self-selling AI
   */
  private async executePlatformRecommendation(job: AiBrainJob, input: PlatformRecommendationInput): Promise<{ output: any; tokensUsed: number }> {
    const { userNeed, currentPlan, currentUsage } = input;

    const response = await geminiClient.generatePlatformRecommendation({
      workspaceId: job.workspaceId ?? '',
      userId: job.userId || undefined,
      userNeed,
      currentPlan,
      currentUsage
    });

    return {
      output: {
        recommendation: response.text,
        timestamp: new Date().toISOString()
      },
      tokensUsed: response.tokensUsed
    };
  }

  /**
   * NEW: FAQ Update - Learn and persist new FAQs
   */
  private async executeFAQUpdate(job: AiBrainJob, input: FAQUpdateInput): Promise<{ output: any; tokensUsed: number }> {
    const { question, answer, category = 'general', tags = [] } = input;

    try {
      const [newFaq] = await db.insert(helposFaqs).values({
        workspaceId: 'system',
        question: question.substring(0, 500),
        answer: answer.substring(0, 2000),
        category,
        tags: tags,
        isPublished: true,
        helpfulCount: 0
      }).returning();

      log.info(`📚 [AI Brain] Created new FAQ: ${newFaq.id}`);

      return {
        output: {
          success: true,
          faqId: newFaq.id,
          message: 'FAQ created successfully'
        },
        tokensUsed: 0
      };
    } catch (error: any) {
      return {
        output: {
          success: false,
          error: (error instanceof Error ? error.message : String(error))
        },
        tokensUsed: 0
      };
    }
  }

  /**
   * NEW: Platform Awareness - Answer questions about any platform feature
   */
  private async executePlatformAwareness(job: AiBrainJob, input: PlatformAwarenessInput): Promise<{ output: any; tokensUsed: number; confidence: number }> {
    const { query, queryType = 'help', context } = input;

    // Search for relevant features based on the query
    const relevantFeatures = platformFeatureRegistry.searchFeatures(query);
    const capabilityHelp = platformFeatureRegistry.findCapabilityHelp(query);

    // Build context about relevant features
    let featureContext = '';
    if (relevantFeatures.length > 0) {
      featureContext = relevantFeatures.slice(0, 3).map(f => {
        const caps = f.capabilities.map(c => `  - ${c.name}: ${c.description}${c.howTo ? `\n    How to: ${c.howTo}` : ''}`).join('\n');
        const issues = f.commonIssues.map(i => `  - ${i.issue}: ${i.solution}`).join('\n');
        return `### ${f.name} (${f.category})\n${f.description}\n\nCapabilities:\n${caps}${issues ? `\n\nCommon Issues:\n${issues}` : ''}`;
      }).join('\n\n');
    }

    // If we found a specific capability match, highlight it
    let directAnswer = '';
    if (capabilityHelp) {
      const { feature, capability } = capabilityHelp;
      directAnswer = `**Direct match found: ${capability.name} (${feature.name})**\n${capability.description}\n`;
      if (capability.howTo) {
        directAnswer += `\nHow to use: ${capability.howTo}\n`;
      }
      if (capability.troubleshooting && capability.troubleshooting.length > 0) {
        directAnswer += `\nTroubleshooting tips:\n${capability.troubleshooting.map(t => `- ${t}`).join('\n')}`;
      }
    }

    // If troubleshooting, check for common issues
    let troubleshootingInfo = '';
    if (queryType === 'troubleshoot' && context?.symptoms) {
      const matchingIssues = platformFeatureRegistry.diagnoseIssue(context.symptoms);
      if (matchingIssues.length > 0) {
        troubleshootingInfo = `\n\n### Potential Solutions:\n${matchingIssues.map(i => 
          `**${i.issue}**\nSolution: ${i.solution}${i.preventiveMeasures ? `\nPrevention: ${i.preventiveMeasures.join(', ')}` : ''}`
        ).join('\n\n')}`;
      }
    }

    const systemPrompt = `You are CoAIleague Platform Expert, an AI assistant with comprehensive knowledge of all platform features.

Your role is to help users and support agents understand how to use the CoAIleague workforce management platform effectively.

${directAnswer ? `DIRECT MATCH FOUND - Use this as the primary answer:\n${directAnswer}\n\n` : ''}
${featureContext ? `RELEVANT PLATFORM FEATURES:\n${featureContext}\n\n` : ''}
${troubleshootingInfo ? `TROUBLESHOOTING INFORMATION:\n${troubleshootingInfo}\n\n` : ''}

GUIDELINES:
1. Be specific and actionable in your responses
2. Reference the exact feature names and capabilities when helpful
3. For "how to" questions, provide step-by-step instructions
4. For troubleshooting, suggest specific solutions and preventive measures
5. If the user needs a feature not currently available, mention it clearly
6. Always maintain a helpful, professional tone
7. If you're not sure, recommend contacting support rather than guessing

${context?.userRole ? `User role: ${context.userRole} - tailor response to their access level` : ''}
${context?.currentFeature ? `User is currently using: ${context.currentFeature}` : ''}`;

    const response = await geminiClient.generate({
      workspaceId: job.workspaceId || undefined,
      userId: job.userId || undefined,
      featureKey: 'platform_awareness',
      systemPrompt,
      userMessage: query,
      temperature: 0.4
    });

    // Determine confidence based on whether we found relevant features
    let confidence = 0.7;
    if (capabilityHelp) {
      confidence = 0.95;
    } else if (relevantFeatures.length > 0) {
      confidence = 0.85;
    }

    return {
      output: {
        response: response.text,
        matchedFeatures: relevantFeatures.slice(0, 5).map(f => ({
          id: f.id,
          name: f.name,
          category: f.category,
          description: f.description
        })),
        directMatch: capabilityHelp ? {
          feature: capabilityHelp.feature.name,
          capability: capabilityHelp.capability.name,
          howTo: capabilityHelp.capability.howTo
        } : null,
        queryType,
        timestamp: new Date().toISOString()
      },
      tokensUsed: response.tokensUsed,
      confidence
    };
  }

  /**
   * NEW: Issue Diagnosis - AI diagnoses user issues based on symptoms
   */
  private async executeIssueDiagnosis(job: AiBrainJob, input: IssueDiagnosisInput): Promise<{ output: any; tokensUsed: number; confidence: number }> {
    const { description, symptoms, affectedFeature, context } = input;

    // Find matching issues from the platform registry
    const allSymptoms = [...symptoms];
    if (description) {
      allSymptoms.push(...description.split(' ').filter(w => w.length > 3));
    }
    
    const matchingIssues = platformFeatureRegistry.diagnoseIssue(allSymptoms);
    
    // If affected feature is specified, get detailed info
    let featureDetails = '';
    if (affectedFeature) {
      const feature = platformFeatureRegistry.getFeature(affectedFeature);
      if (feature) {
        featureDetails = `\n\nAFFECTED FEATURE DETAILS:\n${feature.name} - ${feature.description}\n`;
        featureDetails += `Common issues for this feature:\n`;
        featureDetails += feature.commonIssues.map(i => 
          `- ${i.issue}\n  Symptoms: ${i.symptoms.join(', ')}\n  Solution: ${i.solution}`
        ).join('\n');
      }
    }

    const systemPrompt = `You are CoAIleague Support Diagnostic AI, an expert at identifying and resolving platform issues.

Analyze the user's issue and provide a diagnosis with recommended solutions.

${matchingIssues.length > 0 ? `KNOWN MATCHING ISSUES:\n${matchingIssues.map(i => 
  `Issue: ${i.issue}\nSymptoms: ${i.symptoms.join(', ')}\nSolution: ${i.solution}${i.preventiveMeasures ? `\nPrevention: ${i.preventiveMeasures.join(', ')}` : ''}`
).join('\n\n')}\n\n` : ''}

${featureDetails}

DIAGNOSTIC GUIDELINES:
1. Identify the most likely root cause
2. Provide step-by-step troubleshooting instructions
3. Suggest preventive measures for the future
4. If the issue might be a bug, recommend reporting it
5. Estimate severity: low, medium, high, critical
6. Indicate if human support escalation is needed

Return a structured diagnosis including:
- Primary diagnosis
- Confidence level
- Recommended actions
- Need for human escalation (yes/no)`;

    const userMessage = `User Issue Report:
Description: ${description}
Symptoms: ${symptoms.join(', ')}
${affectedFeature ? `Affected Feature: ${affectedFeature}` : ''}
${context ? `Additional Context: ${JSON.stringify(context)}` : ''}`;

    const response = await geminiClient.generate({
      workspaceId: job.workspaceId || undefined,
      userId: job.userId || undefined,
      featureKey: 'issue_diagnosis',
      systemPrompt,
      userMessage,
      temperature: 0.3
    });

    // Parse structured response if possible
    let diagnosis = {
      description: response.text,
      matchedKnownIssues: matchingIssues.slice(0, 3),
      severity: 'medium',
      requiresEscalation: false
    };

    try {
      const jsonMatch = response.text.match(/```(?:json)?\s*([\s\S]*?)```/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[1].trim());
        diagnosis = { ...diagnosis, ...parsed };
      }
    } catch {
      // Use default diagnosis structure
    }

    const confidence = matchingIssues.length > 0 ? 0.85 : 0.7;

    return {
      output: {
        diagnosis,
        affectedFeature,
        symptomsAnalyzed: symptoms,
        knownIssuesMatched: matchingIssues.length,
        timestamp: new Date().toISOString()
      },
      tokensUsed: response.tokensUsed,
      confidence
    };
  }

  /**
   * Trinity AI Summarization - Generate concise summary of support conversations
   * Used when closing tickets to provide both user and staff with resolution summary
   */
  private async executeTrinitySum(job: AiBrainJob, input: { message: string; maxWords?: number }): Promise<{ output: any; tokensUsed: number }> {
    const { message, maxWords = 100 } = input;

    const systemPrompt = `You are Trinity AI, the intelligent orchestrator for CoAIleague support platform.
Your task is to summarize support conversations concisely and professionally.

Guidelines:
1. Focus on the issue reported and how it was resolved
2. Be concise - aim for ${maxWords} words or fewer
3. Use a friendly, professional tone
4. Include any key actions taken or recommendations made
5. Do NOT include any personally identifiable information

Format: Write a 2-3 sentence summary that could be shown to both the user and stored for internal records.`;

    const userMessage = message;

    try {
      const response = await geminiClient.generate({
        workspaceId: job.workspaceId || undefined,
        userId: job.userId || undefined,
        featureKey: 'trinity_summarize',
        systemPrompt,
        userMessage,
        temperature: 0.3,
        maxTokens: 200,
      });

      return {
        output: {
          response: response.text,
          wordCount: response.text.split(/\s+/).length,
          timestamp: new Date().toISOString(),
        },
        tokensUsed: response.tokensUsed,
      };
    } catch (error) {
      log.error('[AIBrain] Trinity summarization failed:', error);
      // Return a fallback summary
      return {
        output: {
          response: 'Support issue was addressed and resolved by the support team.',
          wordCount: 9,
          timestamp: new Date().toISOString(),
          fallback: true,
        },
        tokensUsed: 0,
      };
    }
  }

  /**
   * Get platform feature information for support agents
   */
  getPlatformInfo(): { features: PlatformFeature[]; categories: string[] } {
    return {
      features: platformFeatureRegistry.getAllFeatures(),
      categories: platformFeatureRegistry.getCategories() as string[]
    };
  }

  /**
   * Search platform features by query
   */
  searchPlatformFeatures(query: string): PlatformFeature[] {
    return platformFeatureRegistry.searchFeatures(query);
  }

  /**
   * Get feature status for a workspace
   */
  async getFeatureStatus(workspaceId: string): Promise<Array<{ feature: PlatformFeature; enabled: boolean }>> {
    // Get workspace settings to determine which features are enabled
    const [workspace] = await db
      .select()
      .from(workspaces)
      .where(eq(workspaces.id, workspaceId))
      .limit(1);

    const workspaceSettings = (workspace?.settings as Record<string, boolean>) || {};
    return platformFeatureRegistry.getFeatureStatus(workspaceSettings);
  }

  /**
   * Record feature usage event for learning
   */
  async recordFeatureEvent(event: {
    workspaceId: string;
    userId?: string;
    featureId: string;
    eventType: 'view' | 'use' | 'error' | 'help_request';
    metadata?: Record<string, any>;
  }): Promise<void> {
    const { workspaceId, userId, featureId, eventType, metadata } = event;
    
    await this.recordEvent({
      eventType: `feature_${eventType}`,
      feature: featureId,
      payload: {
        workspaceId,
        userId,
        featureId,
        eventType,
        metadata,
        timestamp: new Date().toISOString()
      }
    });
  }

  /**
   * Enrich employee/org data with human-readable external IDs
   */
  private async enrichWithExternalIds(data: any, workspaceId?: string): Promise<any> {
    if (!data) return data;

    if (workspaceId) {
      const [orgExtId] = await db
        .select({ externalId: externalIdentifiers.externalId })
        .from(externalIdentifiers)
        .where(
          and(
            eq(externalIdentifiers.entityType, 'org'),
            eq(externalIdentifiers.entityId, workspaceId)
          )
        )
        .limit(1);

      if (orgExtId) {
        data._orgExternalId = orgExtId.externalId;
      }

      const [workspace] = await db
        .select({ name: workspaces.name })
        .from(workspaces)
        .where(eq(workspaces.id, workspaceId))
        .limit(1);

      if (workspace) {
        data._orgName = workspace.name;
      }
    }

    if (Array.isArray(data.employees)) {
      for (const emp of data.employees) {
        if (emp.id) {
          const [empExtId] = await db
            .select({ externalId: externalIdentifiers.externalId })
            .from(externalIdentifiers)
            .where(
              and(
                eq(externalIdentifiers.entityType, 'employee'),
                eq(externalIdentifiers.entityId, emp.id)
              )
            )
            .limit(1);

          if (empExtId) {
            emp._externalId = empExtId.externalId;
          }
        }
      }
    }

    return data;
  }

  /**
   * Record platform event for cross-org learning
   */
  async recordEvent(event: { eventType: string; feature: string; payload: any; rawData?: any }): Promise<void> {
    const fingerprint = this.generateFingerprint(event.eventType, event.feature, event.rawData);
    await this.updateGlobalPatterns(fingerprint, event.eventType, event.feature);
  }

  /**
   * Generate anonymized fingerprint for cross-org pattern matching
   */
  private generateFingerprint(eventType: string, feature: string, rawData?: any): string {
    const normalized = {
      type: eventType,
      feature,
    };
    
    return crypto
      .createHash('sha256')
      .update(JSON.stringify(normalized))
      .digest('hex')
      .substring(0, 32);
  }

  /**
   * Update global patterns - Learn from all organizations
   */
  private async updateGlobalPatterns(fingerprint: string, eventType: string, feature: string): Promise<void> {
    const [existing] = await db
      .select()
      .from(aiGlobalPatterns)
      .where(eq(aiGlobalPatterns.fingerprint, fingerprint))
      .limit(1);

    if (existing) {
      const currentOccurrences = existing.occurrences || 0;
      await db
        .update(aiGlobalPatterns)
        .set({
          occurrences: currentOccurrences + 1,
          lastSeenAt: new Date()
        })
        .where(eq(aiGlobalPatterns.id, existing.id));

      log.info(`📊 [AI Brain] Pattern ${fingerprint} seen ${currentOccurrences + 1} times across orgs`);
    } else {
      await db.insert(aiGlobalPatterns).values({
        workspaceId: 'system',
        patternType: eventType,
        fingerprint,
        description: `${feature} - ${eventType}`,
        occurrences: 1,
        affectedWorkspaces: 1
      });

      log.info(`🆕 [AI Brain] New global pattern discovered: ${fingerprint}`);
    }
  }

  /**
   * Submit feedback for AI job - Helps brain learn
   */
  async submitFeedback(feedback: Omit<InsertAiFeedbackLoop, 'createdAt'>): Promise<void> {
    await db.insert(aiFeedbackLoops).values(feedback);
    log.info(`💡 [AI Brain] Feedback received for job ${feedback.jobId}`);
  }

  /**
   * Get pending approvals across all skills
   */
  async getPendingApprovals(workspaceId?: string): Promise<AiBrainJob[]> {
    const conditions = [eq(aiBrainJobs.status, 'requires_approval' as any)];
    
    if (workspaceId) {
      conditions.push(eq(aiBrainJobs.workspaceId, workspaceId));
    }

    return db
      .select()
      .from(aiBrainJobs)
      .where(and(...conditions))
      .orderBy(desc(aiBrainJobs.createdAt));
  }

  /**
   * Approve an AI job
   */
  async approveJob(jobId: string, userId: string): Promise<void> {
    await db
      .update(aiBrainJobs)
      .set({
        status: 'completed' as any,
        approvedBy: userId,
        approvedAt: new Date()
      })
      .where(eq(aiBrainJobs.id, jobId));

    log.info(`✅ [AI Brain] Job ${jobId} approved by ${userId}`);
  }

  /**
   * Reject an AI job
   */
  async rejectJob(jobId: string, userId: string, reason: string): Promise<void> {
    await db
      .update(aiBrainJobs)
      .set({
        status: 'failed' as any,
        rejectedBy: userId,
        rejectedAt: new Date(),
        rejectionReason: reason
      })
      .where(eq(aiBrainJobs.id, jobId));

    log.info(`❌ [AI Brain] Job ${jobId} rejected by ${userId}: ${reason}`);
  }

  /**
   * Get AI Brain health metrics
   */
  async getHealthMetrics(workspaceId?: string): Promise<any> {
    const conditions = workspaceId ? [eq(aiBrainJobs.workspaceId, workspaceId)] : [];

    const stats = await db
      .select({
        total: sql<number>`count(*)`,
        completed: sql<number>`sum(case when ${aiBrainJobs.status} = 'completed' then 1 else 0 end)`,
        failed: sql<number>`sum(case when ${aiBrainJobs.status} = 'failed' then 1 else 0 end)`,
        pending: sql<number>`sum(case when ${aiBrainJobs.status} = 'pending' then 1 else 0 end)`,
        requiresApproval: sql<number>`sum(case when ${aiBrainJobs.status} = 'requires_approval' then 1 else 0 end)`,
        avgExecutionTime: sql<number>`avg(${aiBrainJobs.executionTimeMs})`,
        totalTokens: sql<number>`sum(${aiBrainJobs.tokensUsed})`
      })
      .from(aiBrainJobs)
      .where(conditions.length > 0 ? and(...conditions) : undefined);

    return {
      jobs: stats[0],
      globalPatterns: await this.getGlobalPatternsCount(),
      solutions: await this.getValidatedSolutionsCount(),
      faqs: await this.getFAQsCount(workspaceId),
      lastUpdated: new Date().toISOString()
    };
  }

  private async getGlobalPatternsCount(): Promise<number> {
    const result = await db
      .select({ count: sql<number>`count(*)` })
      .from(aiGlobalPatterns);
    return result[0]?.count || 0;
  }

  private async getValidatedSolutionsCount(): Promise<number> {
    const result = await db
      .select({ count: sql<number>`count(*)` })
      .from(aiSolutionLibrary)
      .where(eq(aiSolutionLibrary.validated, true));
    return result[0]?.count || 0;
  }

  private async getFAQsCount(workspaceId?: string): Promise<number> {
    // Query global FAQs count (helposFaqs doesn't have workspaceId)
    const result = await db
      .select({ count: sql<number>`count(*)` })
      .from(helposFaqs)
      .where(eq(helposFaqs.isPublished, true));
    return result[0]?.count || 0;
  }

  /**
   * Get available AI Brain skills
   */
  getAvailableSkills(): string[] {
    return [
      'helpos_support',
      'scheduleos_generation',
      'intelligenceos_prediction',
      'business_insight',
      'platform_recommendation',
      'faq_update',
      'platform_awareness',
      'issue_diagnosis'
    ];
  }
}

// Export singleton - ONE AI Brain for the entire platform
export const aiBrainService = new AIBrainService();
