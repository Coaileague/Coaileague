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
import {
  aiBrainJobs,
  aiEventStream,
  aiGlobalPatterns,
  aiSolutionLibrary,
  aiFeedbackLoops,
  helposFaqs,
  externalIdentifiers,
  workspaces,
  shifts,
  scheduleProposals,
  invoices,
  payrollRuns,
  employees,
  timeEntries,
  type AiBrainJob,
  type InsertAiFeedbackLoop,
} from '@shared/schema';
import { eq, and, desc, sql, gte, lte, count } from 'drizzle-orm';
import { geminiClient } from './providers/geminiClient';
import crypto from 'crypto';

// Define typed input interfaces for each skill
interface HelpOSInput {
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

export interface EnqueueJobRequest {
  workspaceId?: string;
  userId?: string;
  skill: string;
  input: any;
  priority?: 'low' | 'normal' | 'high' | 'critical';
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
    console.log(`🧠 [AI Brain] New job: ${request.skill} for workspace ${request.workspaceId || 'global'}`);

    const [job] = await db.insert(aiBrainJobs).values({
      workspaceId: request.workspaceId || null,
      userId: request.userId || null,
      skill: request.skill as any,
      input: request.input,
      priority: request.priority || 'normal',
      status: 'pending'
    }).returning();

    try {
      const result = await this.executeJob(job);
      return result;
    } catch (error: any) {
      console.error(`❌ [AI Brain] Job ${job.id} failed:`, error);
      
      await db.update(aiBrainJobs)
        .set({
          status: 'failed',
          error: error.message,
          completedAt: new Date()
        })
        .where(eq(aiBrainJobs.id, job.id));

      return {
        jobId: job.id,
        status: 'failed',
        error: error.message
      };
    }
  }

  /**
   * Execute a job - Routes to appropriate skill handler
   */
  private async executeJob(job: AiBrainJob): Promise<JobResult> {
    const startTime = Date.now();

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

    switch (job.skill) {
      case 'helpos_support':
        const helpResult = await this.executeHelpOSSupport(job, input as HelpOSInput);
        output = helpResult.output;
        tokensUsed = helpResult.tokensUsed;
        confidenceScore = 0.95;
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

      default:
        throw new Error(`Unknown skill: ${job.skill}`);
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
    
    console.log(`✅ [AI Brain] Job ${job.id} completed in ${executionTime}ms (confidence: ${confidenceScore?.toFixed(2)}) - ${orgInfo}`);

    return {
      jobId: job.id,
      status: finalStatus,
      output,
      confidenceScore,
      requiresApproval
    };
  }

  /**
   * HelpOS Support - Customer support AI with FAQ learning
   */
  private async executeHelpOSSupport(job: AiBrainJob, input: HelpOSInput): Promise<{ output: any; tokensUsed: number }> {
    const { message, conversationHistory, shouldLearn } = input;

    // Search for relevant FAQs first
    const relevantFaqs = await this.searchFAQs(message, job.workspaceId || undefined);

    const systemPrompt = `You are CoAIleague AI Support Assistant, a helpful and knowledgeable assistant for the CoAIleague workforce management platform.

${relevantFaqs.length > 0 ? `RELEVANT FAQs (use these first if they match the user's question):
${relevantFaqs.map(f => `Q: ${f.question}\nA: ${f.answer}`).join('\n\n')}

` : ''}You help users with:
- Time tracking and clock in/out issues
- Schedule management and shift assignments
- Billing, invoicing, and payroll questions
- Employee management and permissions
- Compliance and policy questions
- General platform navigation

IMPORTANT GUIDELINES:
1. If an FAQ matches the question, use that answer (personalized)
2. Be concise, professional, and helpful
3. If you don't know something specific, suggest contacting human support
4. When relevant, mention platform features that could help the user
5. Always end with asking if there's anything else you can help with`;

    const response = await geminiClient.generate({
      workspaceId: job.workspaceId || undefined,
      userId: job.userId || undefined,
      featureKey: 'helpos_support',
      systemPrompt,
      userMessage: message,
      conversationHistory
    });

    // Learn from successful interactions
    if (shouldLearn && response.text.length > 50 && !response.text.includes("I don't know")) {
      await this.learnFromInteraction(job.workspaceId || undefined, message, response.text);
    }

    return {
      output: {
        response: response.text,
        suggestedFaqs: relevantFaqs.slice(0, 3),
        timestamp: new Date().toISOString()
      },
      tokensUsed: response.tokensUsed
    };
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
      console.error('[AI Brain] FAQ search error:', error);
      return [];
    }
  }

  /**
   * Learn from successful interactions - Create or update FAQs
   */
  private async learnFromInteraction(workspaceId: string | undefined, question: string, answer: string): Promise<void> {
    try {
      // Check if a similar FAQ already exists
      const existingFaqs = await this.searchFAQs(question, workspaceId);
      
      if (existingFaqs.length > 0 && existingFaqs[0].score > 3) {
        // Update helpfulness score of matching FAQ
        await db.update(helposFaqs)
          .set({
            helpfulCount: sql`COALESCE(${helposFaqs.helpfulCount}, 0) + 1`
          })
          .where(eq(helposFaqs.id, existingFaqs[0].id));
        
        console.log(`📚 [AI Brain] Updated FAQ helpfulness: ${existingFaqs[0].id}`);
      } else {
        // Create new FAQ entry for learning (global FAQs)
        await db.insert(helposFaqs).values({
          question: question.substring(0, 500),
          answer: answer.substring(0, 2000),
          category: 'ai_learned',
          isPublished: true,
          helpfulCount: 1,
          tags: ['ai-generated', 'auto-learned']
        });
        
        console.log(`🆕 [AI Brain] Created new FAQ from successful interaction`);
      }
    } catch (error) {
      console.error('[AI Brain] Learning error:', error);
    }
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
      console.error('[AI Brain] Failed to parse schedule response:', parseError);
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
      // Log AI decision to event stream
      const fingerprint = crypto.createHash('md5').update(JSON.stringify(scheduleResult.assignments)).digest('hex');
      
      await db.insert(aiEventStream).values({
        eventType: 'schedule_generated',
        feature: 'scheduleos',
        fingerprint,
        payload: {
          jobId,
          assignments: scheduleResult.assignments,
          confidence,
          reasoning: scheduleResult.reasoning,
          requiresApproval,
          weekStart: weekStart.toISOString(),
          weekEnd: weekEnd.toISOString(),
        }
      });

      if (requiresApproval) {
        await db.insert(scheduleProposals).values({
          workspaceId,
          createdBy: userId,
          weekStartDate: weekStart,
          weekEndDate: weekEnd,
          aiResponse: scheduleResult,
          confidence: confidencePercent,
          status: 'pending',
        });
        
        console.log(`📋 [AI Brain] Schedule queued for approval (confidence: ${(confidence * 100).toFixed(1)}%)`);
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
              status: 'confirmed',
              aiGenerated: true,
              aiConfidenceScore: String(assignment.confidence || confidence),
              title: assignment.position || 'AI Scheduled Shift',
            }).returning();
            
            createdShifts.push(shift);
          }
        }
        
        console.log(`✅ [AI Brain] Auto-approved ${createdShifts.length} shift(s) (confidence: ${(confidence * 100).toFixed(1)}%)`);
      }
    } catch (error: any) {
      console.error('[AI Brain] Failed to persist schedule:', error);
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
    const contextData = await this.gatherBusinessContext(job.workspaceId || '', insightType, timeframe);

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
      console.error('[AI Brain] Error gathering business context:', error);
    }

    return context;
  }

  /**
   * NEW: Platform Recommendation - Self-selling AI
   */
  private async executePlatformRecommendation(job: AiBrainJob, input: PlatformRecommendationInput): Promise<{ output: any; tokensUsed: number }> {
    const { userNeed, currentPlan, currentUsage } = input;

    const response = await geminiClient.generatePlatformRecommendation({
      workspaceId: job.workspaceId || '',
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
        question: question.substring(0, 500),
        answer: answer.substring(0, 2000),
        category,
        tags: tags,
        isPublished: true,
        helpfulCount: 0
      }).returning();

      console.log(`📚 [AI Brain] Created new FAQ: ${newFaq.id}`);

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
          error: error.message
        },
        tokensUsed: 0
      };
    }
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

    await db.insert(aiEventStream).values({
      eventType: event.eventType,
      feature: event.feature,
      payload: event.payload,
      fingerprint
    });

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

      console.log(`📊 [AI Brain] Pattern ${fingerprint} seen ${currentOccurrences + 1} times across orgs`);
    } else {
      await db.insert(aiGlobalPatterns).values({
        patternType: eventType,
        fingerprint,
        description: `${feature} - ${eventType}`,
        occurrences: 1,
        affectedWorkspaces: 1
      });

      console.log(`🆕 [AI Brain] New global pattern discovered: ${fingerprint}`);
    }
  }

  /**
   * Submit feedback for AI job - Helps brain learn
   */
  async submitFeedback(feedback: Omit<InsertAiFeedbackLoop, 'createdAt'>): Promise<void> {
    await db.insert(aiFeedbackLoops).values(feedback);
    console.log(`💡 [AI Brain] Feedback received for job ${feedback.jobId}`);
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

    console.log(`✅ [AI Brain] Job ${jobId} approved by ${userId}`);
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

    console.log(`❌ [AI Brain] Job ${jobId} rejected by ${userId}: ${reason}`);
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
      'faq_update'
    ];
  }
}

// Export singleton - ONE AI Brain for the entire platform
export const aiBrainService = new AIBrainService();
