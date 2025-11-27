/**
 * UNIFIED AI BRAIN ORCHESTRATOR
 * 
 * This is the ONE AI system for CoAIleague that:
 * - Learns from all organizations (cross-tenant intelligence)
 * - Provides unified intelligence across all features
 * - Manages all AI operations through one central service
 * - Fixes issues once for everyone
 */

import { db } from '../../db';
import {
  aiBrainJobs,
  aiEventStream,
  aiGlobalPatterns,
  aiSolutionLibrary,
  aiFeedbackLoops,
  aiSkillRegistry,
  externalIdentifiers,
  workspaces,
  shifts,
  scheduleProposals,
  type InsertAiBrainJob,
  type AiBrainJob,
  type InsertAiEventStream,
  type InsertAiGlobalPattern,
  type InsertAiFeedbackLoop,
} from '@shared/schema';
import { eq, and, desc, sql } from 'drizzle-orm';
import { geminiClient } from './providers/geminiClient';
import crypto from 'crypto';

export interface EnqueueJobRequest {
  workspaceId?: string;
  userId?: string;
  skill: string; // e.g., 'scheduleos_generation', 'helpos_support'
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

    // Create job record
    const [job] = await db.insert(aiBrainJobs).values({
      workspaceId: request.workspaceId || null,
      userId: request.userId || null,
      skill: request.skill as any,
      input: request.input,
      priority: request.priority || 'normal',
      status: 'pending'
    }).returning();

    // Execute job immediately (in-memory queue for now)
    try {
      const result = await this.executeJob(job);
      return result;
    } catch (error: any) {
      console.error(`❌ [AI Brain] Job ${job.id} failed:`, error);
      
      // Update job as failed
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

    // Update status to running
    await db.update(aiBrainJobs)
      .set({
        status: 'running',
        startedAt: new Date()
      })
      .where(eq(aiBrainJobs.id, job.id));

    // Route to skill handler based on job.skill
    let output: any;
    let confidenceScore: number | undefined;
    let tokensUsed = 0;

    switch (job.skill) {
      case 'helpos_support':
        const helpResult = await this.executeHelpOSSupport(job);
        output = helpResult.output;
        tokensUsed = helpResult.tokensUsed;
        confidenceScore = 0.95; // HelpOS is high confidence
        break;

      case 'scheduleos_generation':
        const scheduleResult = await this.executeScheduleGeneration(job);
        output = scheduleResult.output;
        tokensUsed = scheduleResult.tokensUsed;
        confidenceScore = scheduleResult.confidence;
        break;

      case 'intelligenceos_prediction':
        const predictionResult = await this.executePrediction(job);
        output = predictionResult.output;
        tokensUsed = predictionResult.tokensUsed;
        confidenceScore = predictionResult.confidence;
        break;

      default:
        throw new Error(`Unknown skill: ${job.skill}`);
    }

    // Determine if requires human approval (low confidence)
    const requiresApproval = confidenceScore ? confidenceScore < 0.95 : false;
    const finalStatus = requiresApproval ? 'requires_approval' : 'completed';

    // Update job as completed
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

    // Enhanced logging with external IDs for better audit trails
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
   * HelpOS Support - Customer support AI
   */
  private async executeHelpOSSupport(job: AiBrainJob): Promise<{ output: any; tokensUsed: number }> {
    const { message, conversationHistory } = job.input;

    const systemPrompt = `You are CoAIleague AI Support Assistant, a helpful and knowledgeable assistant for the CoAIleague workforce management platform.

You help users with:
- Time tracking and clock in/out issues
- Schedule management and shift assignments
- Billing, invoicing, and payroll questions
- Employee management and permissions
- Compliance and policy questions
- General platform navigation

Be concise, professional, and helpful. If you don't know something specific to the platform, suggest contacting human support.`;

    const response = await geminiClient.generate({
      workspaceId: job.workspaceId || undefined,
      userId: job.userId || undefined,
      featureKey: 'helpos_support',
      systemPrompt,
      userMessage: message,
      conversationHistory
    });

    return {
      output: {
        response: response.text,
        timestamp: new Date().toISOString()
      },
      tokensUsed: response.tokensUsed
    };
  }

  /**
   * AI Scheduling Generation - AI-powered scheduling
   */
  private async executeScheduleGeneration(job: AiBrainJob): Promise<{ output: any; tokensUsed: number; confidence: number }> {
    const { shifts, employees, constraints } = job.input;

    // Enrich employee data with external IDs for better audit trails
    const enrichedInput = await this.enrichWithExternalIds(
      { shifts, employees, constraints },
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
  "assignments": [{"shiftId": "...", "employeeId": "...", "confidence": 0.95}],
  "confidence": 0.98,
  "reasoning": "Brief explanation of scheduling decisions"
}`;

    const userMessage = `Create schedule assignments for:\n\nShifts: ${JSON.stringify(enrichedInput.shifts, null, 2)}\n\nEmployees: ${JSON.stringify(enrichedInput.employees, null, 2)}\n\nConstraints: ${JSON.stringify(enrichedInput.constraints, null, 2)}`;

    const response = await geminiClient.generate({
      workspaceId: job.workspaceId || undefined,
      userId: job.userId || undefined,
      featureKey: 'scheduleos_generation',
      systemPrompt,
      userMessage,
      temperature: 0.3 // Lower temperature for more deterministic scheduling
    });

    // Parse AI response
    const result = JSON.parse(response.text);

    // Include audit metadata with external IDs
    result._auditMetadata = {
      orgExternalId: enrichedInput._orgExternalId,
      orgName: enrichedInput._orgName,
      employeeCount: enrichedInput.employees?.length || 0,
      processedAt: new Date().toISOString()
    };

    // AUTONOMOUS PERSISTENCE: Save schedules to database and queue low-confidence for approval
    if (job.workspaceId && result.assignments) {
      // Extract schedule window from input constraints
      const scheduleWindow = constraints ? {
        weekStart: constraints.weekStart,
        weekEnd: constraints.weekEnd,
      } : undefined;
      await this.persistScheduleAssignments(job.workspaceId, result, job.id, scheduleWindow);
    }

    return {
      output: result,
      tokensUsed: response.tokensUsed,
      confidence: result.confidence || 0.9
    };
  }

  /**
   * Persist AI-generated schedule assignments to database
   * Auto-approve high confidence (>=0.95), queue low confidence for human review
   */
  private async persistScheduleAssignments(workspaceId: string, scheduleResult: any, jobId: string, scheduleWindow?: { weekStart: string, weekEnd: string }): Promise<void> {
    const confidence = scheduleResult.confidence || 0.9;
    const requiresApproval = confidence < 0.95;
    
    // Extract schedule window from assignments or use provided window
    let weekStart = scheduleWindow?.weekStart ? new Date(scheduleWindow.weekStart) : new Date();
    let weekEnd = scheduleWindow?.weekEnd ? new Date(scheduleWindow.weekEnd) : new Date();
    
    // If no window provided, derive from first assignment
    if (!scheduleWindow && scheduleResult.assignments?.length > 0) {
      const firstAssignment = scheduleResult.assignments[0];
      if (firstAssignment.startTime) {
        weekStart = new Date(firstAssignment.startTime);
        // Set weekEnd to 7 days later
        weekEnd = new Date(weekStart);
        weekEnd.setDate(weekEnd.getDate() + 7);
      }
    }
    
    try {
      // Log AI decision to event stream for audit trail
      await db.insert(aiEventStream).values({
        workspaceId,
        eventType: 'schedule_generated',
        feature: 'scheduleos',
        payload: {
          jobId,
          assignments: scheduleResult.assignments,
          confidence,
          reasoning: scheduleResult.reasoning,
          requiresApproval,
          weekStart: weekStart.toISOString(),
          weekEnd: weekEnd.toISOString(),
        },
        metadata: {
          model: 'gemini-2.0-flash-exp',
          autoApproved: !requiresApproval,
        },
        fingerprint: crypto.createHash('md5').update(JSON.stringify(scheduleResult.assignments)).digest('hex'),
      });

      if (requiresApproval) {
        // Low confidence - create proposal for human approval with actual schedule window
        await db.insert(scheduleProposals).values({
          workspaceId,
          weekStartDate: weekStart,
          weekEndDate: weekEnd,
          aiResponse: scheduleResult,
          confidence,
          status: 'pending',
        });
        
        console.log(`📋 [AI Brain] Schedule queued for approval (confidence: ${(confidence * 100).toFixed(1)}%, period: ${weekStart.toISOString().split('T')[0]} to ${weekEnd.toISOString().split('T')[0]})`);
      } else {
        // High confidence - auto-approve and persist shifts
        const createdShifts = [];
        
        for (const assignment of scheduleResult.assignments) {
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
        
        console.log(`✅ [AI Brain] Auto-approved ${createdShifts.length} shift(s) (confidence: ${(confidence * 100).toFixed(1)}%)`);
      }
    } catch (error: any) {
      console.error('[AI Brain] Failed to persist schedule:', error);
      throw error;
    }
  }

  /**
   * IntelligenceOS Prediction - Predictive analytics
   */
  private async executePrediction(job: AiBrainJob): Promise<{ output: any; tokensUsed: number; confidence: number }> {
    const { predictionType, historicalData } = job.input;

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

    const result = JSON.parse(response.text);

    return {
      output: result,
      tokensUsed: response.tokensUsed,
      confidence: result.confidence || 0.85
    };
  }

  /**
   * Enrich employee/org data with human-readable external IDs (EMP-XXXX, ORG-XXXX)
   * This makes AI audit logs more readable and debuggable
   */
  private async enrichWithExternalIds(data: any, workspaceId?: string): Promise<any> {
    if (!data) return data;

    // Enrich workspace/org info
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

      // Also fetch org name for better context
      const [workspace] = await db
        .select({ name: workspaces.name })
        .from(workspaces)
        .where(eq(workspaces.id, workspaceId))
        .limit(1);

      if (workspace) {
        data._orgName = workspace.name;
      }
    }

    // Enrich employee array if present
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
  async recordEvent(event: Omit<InsertAiEventStream, 'fingerprint'> & { rawData?: any }): Promise<void> {
    // Generate anonymized fingerprint for pattern matching
    const fingerprint = this.generateFingerprint(event.eventType, event.feature, event.rawData);

    await db.insert(aiEventStream).values({
      ...event,
      fingerprint
    });

    // Check if this pattern exists globally
    await this.updateGlobalPatterns(fingerprint, event.eventType, event.feature);
  }

  /**
   * Generate anonymized fingerprint for cross-org pattern matching
   */
  private generateFingerprint(eventType: string, feature: string, rawData?: any): string {
    // Create hash that doesn't expose tenant-specific data
    const normalized = {
      type: eventType,
      feature,
      // Add anonymized features here (e.g., error codes, not actual data)
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
    // Check if pattern exists
    const [existing] = await db
      .select()
      .from(aiGlobalPatterns)
      .where(eq(aiGlobalPatterns.fingerprint, fingerprint))
      .limit(1);

    if (existing) {
      // Update occurrences
      await db
        .update(aiGlobalPatterns)
        .set({
          occurrences: sql`${aiGlobalPatterns.occurrences} + 1`,
          lastSeenAt: new Date()
        })
        .where(eq(aiGlobalPatterns.id, existing.id));

      console.log(`📊 [AI Brain] Pattern ${fingerprint} seen ${existing.occurrences + 1} times across orgs`);
    } else {
      // Create new global pattern
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
    // Get job statistics
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
}

// Export singleton - ONE AI Brain for the entire platform
export const aiBrainService = new AIBrainService();
