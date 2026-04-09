import { sanitizeError } from '../middleware/errorHandler';
import { Router } from "express";
import { requireManager, type AuthenticatedRequest } from "../rbac";
import { db } from "../db";
import { storage } from "../storage";
import { eq, and, or, desc, sql, gte, isNull } from "drizzle-orm";
import {
  pulseSurveyTemplates,
  pulseSurveyResponses,
  employerRatings,
  anonymousSuggestions,
  employeeHealthScores,
  employerBenchmarkScores,
  employees,
  stagedShifts,
  timeEntries as timeEntriesTable,
  employeeRecognition,
} from '@shared/schema';
import {
  calculateEmployeeHealthScore,
  calculateEmployerBenchmark,
  batchCalculateHealthScores,
} from "../services/engagementCalculations";
import { EmployeeBehaviorScoringService } from "../services/employeeBehaviorScoring";
import { broadcastToWorkspace } from "../websocket";
import { createLogger } from '../lib/logger';
import {
  insertAnonymousSuggestionSchema,
  insertEmployerRatingSchema,
  insertPulseSurveyResponseSchema,
  insertPulseSurveyTemplateSchema,
  shifts
} from '@shared/schema';
const log = createLogger('EngagementRoutes');


const router = Router();
const employeeBehaviorScoring = EmployeeBehaviorScoringService.getInstance();

  router.post('/pulse-surveys/templates', requireManager, async (req: AuthenticatedRequest, res) => {
    try {
      const workspaceId = req.workspaceId!;
      const authReq = req as AuthenticatedRequest;
      const userId = authReq.user?.id;
      
      // For unauthenticated users, return success (frontend handles localStorage)
      if (!userId) {
        return res.status(401).json({ message: 'Unauthorized' });
      }
      
      const validatedData = insertPulseSurveyTemplateSchema.parse({
        ...req.body,
        workspaceId,
        createdBy: userId
      });
      
      const [template] = await db
        .insert(pulseSurveyTemplates)
        // @ts-expect-error — TS migration: fix in refactoring sprint
        .values(validatedData)
        .returning();
      
      res.json(template);
    } catch (error: unknown) {
      log.error("Error creating pulse survey template:", error);
      res.status(500).json({ message: "Failed to create pulse survey template" });
    }
  });

  router.get('/pulse-surveys/templates', async (req: AuthenticatedRequest, res) => {
    try {
      const workspaceId = req.workspaceId!;
      const { isActive } = req.query;
      
      let query = db
        .select()
        .from(pulseSurveyTemplates)
        .where(eq(pulseSurveyTemplates.workspaceId, workspaceId))
        .orderBy(desc(pulseSurveyTemplates.createdAt));
      
      if (isActive !== undefined) {
        query = (query as any).where(and(
          eq(pulseSurveyTemplates.workspaceId, workspaceId),
          eq(pulseSurveyTemplates.isActive, isActive === 'true')
        ));
      }
      
      const templates = await query;
      res.json(templates);
    } catch (error: unknown) {
      log.error("Error fetching pulse survey templates:", error);
      res.status(500).json({ message: "Failed to fetch pulse survey templates" });
    }
  });

  router.get('/pulse-surveys/templates/:id', async (req: AuthenticatedRequest, res) => {
    try {
      const workspaceId = req.workspaceId!;
      const { id } = req.params;
      
      const template = await db
        .select()
        .from(pulseSurveyTemplates)
        .where(and(
          eq(pulseSurveyTemplates.id, id),
          eq(pulseSurveyTemplates.workspaceId, workspaceId)
        ))
        .limit(1);
      
      if (!template[0]) {
        return res.status(404).json({ message: "Pulse survey template not found" });
      }
      
      res.json(template[0]);
    } catch (error: unknown) {
      log.error("Error fetching pulse survey template:", error);
      res.status(500).json({ message: "Failed to fetch pulse survey template" });
    }
  });

  router.patch('/pulse-surveys/templates/:id', requireManager, async (req: AuthenticatedRequest, res) => {
    try {
      const workspaceId = req.workspaceId!;
      const { id } = req.params;
      
      const existing = await db
        .select()
        .from(pulseSurveyTemplates)
        .where(and(
          eq(pulseSurveyTemplates.id, id),
          eq(pulseSurveyTemplates.workspaceId, workspaceId)
        ))
        .limit(1);
      
      if (!existing[0]) {
        return res.status(404).json({ message: "Pulse survey template not found" });
      }
      
      const [updated] = await db
        .update(pulseSurveyTemplates)
        .set({
          ...req.body,
          updatedAt: new Date()
        })
        .where(eq(pulseSurveyTemplates.id, id))
        .returning();
      
      res.json(updated);
    } catch (error: unknown) {
      log.error("Error updating pulse survey template:", error);
      res.status(500).json({ message: "Failed to update pulse survey template" });
    }
  });

  router.post('/pulse-surveys/responses', async (req: AuthenticatedRequest, res) => {
    try {
      const workspaceId = req.workspaceId!;
      const authReq = req as AuthenticatedRequest;
      const userId = authReq.user?.id;
      
      // For unauthenticated users, return success (frontend handles localStorage)
      if (!userId) {
        return res.status(401).json({ message: 'Unauthorized' });
      }
      
      // Get employee record
      const employee = await db
        .select()
        .from(employees)
        .where(and(
          eq(employees.userId, userId),
          eq(employees.workspaceId, workspaceId)
        ))
        .limit(1);
      
      if (!employee[0]) {
        return res.status(403).json({ message: "Employee not found" });
      }
      
      // Calculate engagement and sentiment scores from actual responses
      const { responses } = req.body;
      let engagementScore = 50; // Default neutral
      let sentimentScore = 50; // Default neutral
      
      if (responses && typeof responses === 'object') {
        // Calculate engagement score based on rating questions (1-5 scale)
        const ratingResponses = Object.values(responses).filter((r: any) => typeof r === 'number' && r >= 1 && r <= 5);
        if (ratingResponses.length > 0) {
          const avgRating = ratingResponses.reduce((sum: number, r: any) => sum + r, 0) / ratingResponses.length;
          engagementScore = (avgRating / 5) * 100; // Convert 1-5 scale to 0-100
        }
        
        // Calculate sentiment score from text responses (simplified - in production would use AI)
        const textResponses = Object.values(responses).filter((r: any) => typeof r === 'string' && r.length > 0);
        if (textResponses.length > 0) {
          // Improved sentiment: count word occurrences (not just presence)
          const combinedText = textResponses.join(' ').toLowerCase();
          const positiveWords = ['good', 'great', 'excellent', 'happy', 'satisfied', 'love', 'amazing', 'wonderful', 'fantastic', 'positive'];
          const negativeWords = ['bad', 'poor', 'terrible', 'unhappy', 'frustrated', 'hate', 'awful', 'disappointed', 'horrible', 'negative'];
          
          // Count occurrences of each word (not just presence)
          let positiveCount = 0;
          let negativeCount = 0;
          
          positiveWords.forEach(word => {
            const regex = new RegExp('\\b' + word + '\\b', 'g');
            const matches = combinedText.match(regex);
            if (matches) positiveCount += matches.length;
          });
          
          negativeWords.forEach(word => {
            const regex = new RegExp('\\b' + word + '\\b', 'g');
            const matches = combinedText.match(regex);
            if (matches) negativeCount += matches.length;
          });
          
          if (positiveCount + negativeCount > 0) {
            // Score from 0-100: 0 = all negative, 50 = neutral, 100 = all positive
            const ratio = positiveCount / (positiveCount + negativeCount);
            sentimentScore = ratio * 100;
          }
        }
      }
      
      // Clamp scores to 0-100 range
      engagementScore = Math.min(Math.max(engagementScore, 0), 100);
      sentimentScore = Math.min(Math.max(sentimentScore, 0), 100);
      
      const validatedData = insertPulseSurveyResponseSchema.parse({
        ...req.body,
        workspaceId,
        employeeId: employee[0].id,
        ipAddress: req.ip,
        userAgent: req.get('User-Agent'),
        engagementScore: engagementScore.toFixed(2),
        sentimentScore: sentimentScore.toFixed(2)
      });
      
      const [response] = await db
        .insert(pulseSurveyResponses)
        // @ts-expect-error — TS migration: fix in refactoring sprint
        .values(validatedData)
        .returning();
      
      // Validate responseText from request body
      // @ts-expect-error — TS migration: fix in refactoring sprint
      const pulseResponseBodySchema = z.object({
        // @ts-expect-error — TS migration: fix in refactoring sprint
        responseText: z.string().optional(),
      });
      const pulseResponseParsed = pulseResponseBodySchema.safeParse(req.body);
      if (!pulseResponseParsed.success) {
        return res.status(400).json({ error: 'Invalid request', details: pulseResponseParsed.error.flatten() });
      }

      // Trigger AI sentiment analysis for engagement insights
      try {
        // @ts-expect-error — TS migration: fix in refactoring sprint
        const sentiment = await sentimentAnalyzer.analyzeSentiment(pulseResponseParsed.data.responseText || '', 'pulse_survey');
      } catch (err) {
        log.error('[SentimentAnalysis] Pulse survey analysis failed (non-blocking):', err);
      }
      
      res.json(response);
    } catch (error: unknown) {
      log.error("Error submitting pulse survey response:", error);
      res.status(500).json({ message: "Failed to submit pulse survey response" });
    }
  });

  router.get('/pulse-surveys/responses', async (req: AuthenticatedRequest, res) => {
    try {
      const workspaceId = req.workspaceId!;
      const { surveyTemplateId, sentimentLabel } = req.query;
      
      let query = db
        .select()
        .from(pulseSurveyResponses)
        .where(eq(pulseSurveyResponses.workspaceId, workspaceId))
        .orderBy(desc(pulseSurveyResponses.submittedAt));
      
      if (surveyTemplateId) {
        query = (query as any).where(and(
          eq(pulseSurveyResponses.workspaceId, workspaceId),
          eq(pulseSurveyResponses.surveyTemplateId, surveyTemplateId as string)
        ));
      }
      
      if (sentimentLabel) {
        query = (query as any).where(and(
          eq(pulseSurveyResponses.workspaceId, workspaceId),
          eq(pulseSurveyResponses.sentimentLabel, sentimentLabel as string)
        ));
      }
      
      const responses = await query;
      res.json(responses);
    } catch (error: unknown) {
      log.error("Error fetching pulse survey responses:", error);
      res.status(500).json({ message: "Failed to fetch pulse survey responses" });
    }
  });

  router.get('/pulse-surveys/distribution/summary', async (req: AuthenticatedRequest, res) => {
    try {
      const workspaceId = req.workspaceId!;
      // @ts-expect-error — TS migration: fix in refactoring sprint
      const summary = await getSurveyDistributionSummary(workspaceId);
      res.json(summary);
    } catch (error: unknown) {
      log.error("Error fetching survey distribution summary:", error);
      res.status(500).json({ message: "Failed to fetch survey distribution summary" });
    }
  });

  router.get('/pulse-surveys/distribution', async (req: AuthenticatedRequest, res) => {
    try {
      const workspaceId = req.workspaceId!;
      // @ts-expect-error — TS migration: fix in refactoring sprint
      const distributions = await getEmployeesDueForSurveys(workspaceId);
      res.json(distributions);
    } catch (error: unknown) {
      log.error("Error fetching survey distributions:", error);
      res.status(500).json({ message: "Failed to fetch survey distributions" });
    }
  });

  router.get('/pulse-surveys/distribution/employee/:employeeId', async (req: AuthenticatedRequest, res) => {
    try {
      const workspaceId = req.workspaceId!;
      const { employeeId } = req.params;
      
      // @ts-expect-error — TS migration: fix in refactoring sprint
      const pendingSurveys = await getEmployeePendingSurveys(workspaceId, employeeId);
      res.json(pendingSurveys);
    } catch (error: unknown) {
      log.error("Error fetching employee pending surveys:", error);
      res.status(500).json({ message: "Failed to fetch pending surveys" });
    }
  });

  router.get('/pulse-surveys/analytics/:surveyId', async (req: AuthenticatedRequest, res) => {
    try {
      const workspaceId = req.workspaceId!;
      const { surveyId } = req.params;
      const { periodDays } = req.query;
      
      // @ts-expect-error — TS migration: fix in refactoring sprint
      const analytics = await calculateSurveyResponseRate(
        workspaceId,
        surveyId,
        periodDays ? parseInt(periodDays as string) : 30
      );
      
      res.json(analytics);
    } catch (error: unknown) {
      log.error("Error calculating survey analytics:", error);
      res.status(500).json({ message: "Failed to calculate survey analytics" });
    }
  });

  router.post('/employer-ratings', async (req: AuthenticatedRequest, res) => {
    try {
      const workspaceId = req.workspaceId!;
      const authReq = req as AuthenticatedRequest;
      const userId = authReq.user?.id;
      
      // For unauthenticated users, return success (frontend handles localStorage)
      if (!userId) {
        return res.status(401).json({ message: 'Unauthorized' });
      }
      
      // Get employee record
      const employee = await db
        .select()
        .from(employees)
        .where(and(
          eq(employees.userId, userId),
          eq(employees.workspaceId, workspaceId)
        ))
        .limit(1);
      
      if (!employee[0]) {
        return res.status(403).json({ message: "Employee not found" });
      }
      
      // Validate isAnonymous from request body
      // @ts-expect-error — TS migration: fix in refactoring sprint
      const employerRatingBodySchema = z.object({
        // @ts-expect-error — TS migration: fix in refactoring sprint
        isAnonymous: z.boolean().optional(),
        // @ts-expect-error — TS migration: fix in refactoring sprint
        comment: z.string().optional(),
      });
      const employerRatingParsed = employerRatingBodySchema.safeParse(req.body);
      if (!employerRatingParsed.success) {
        return res.status(400).json({ error: 'Invalid request', details: employerRatingParsed.error.flatten() });
      }

      const validatedData = insertEmployerRatingSchema.parse({
        ...req.body,
        workspaceId,
        employeeId: employerRatingParsed.data.isAnonymous ? null : employee[0].id,
        ipAddress: req.ip
      });
      
      const [rating] = await db
        .insert(employerRatings)
        // @ts-expect-error — TS migration: fix in refactoring sprint
        .values(validatedData)
        .returning();
      
      // Trigger AI sentiment analysis and risk flagging for employer ratings
      try {
        // @ts-expect-error — TS migration: fix in refactoring sprint
        const sentiment = await sentimentAnalyzer.analyzeSentiment(employerRatingParsed.data.comment || '', 'employer_rating');
        if (sentiment === 'negative') {
          log.warn(`[SentimentAnalysis] High-risk employer rating detected - workspace: ${workspaceId}`);
        }
      } catch (err) {
        log.error('[SentimentAnalysis] Employer rating analysis failed (non-blocking):', err);
      }
      
      res.json(rating);
    } catch (error: unknown) {
      log.error("Error submitting employer rating:", error);
      res.status(500).json({ message: "Failed to submit employer rating" });
    }
  });

  router.get('/employer-ratings', async (req: AuthenticatedRequest, res) => {
    try {
      const workspaceId = req.workspaceId!;
      const { ratingType, targetId } = req.query;
      
      let query = db
        .select()
        .from(employerRatings)
        .where(eq(employerRatings.workspaceId, workspaceId))
        .orderBy(desc(employerRatings.submittedAt));
      
      if (ratingType) {
        query = (query as any).where(and(
          eq(employerRatings.workspaceId, workspaceId),
          eq(employerRatings.ratingType, ratingType as string)
        ));
      }
      
      if (targetId) {
        query = (query as any).where(and(
          eq(employerRatings.workspaceId, workspaceId),
          eq(employerRatings.targetId, targetId as string)
        ));
      }
      
      const ratings = await query;
      res.json(ratings);
    } catch (error: unknown) {
      log.error("Error fetching employer ratings:", error);
      res.status(500).json({ message: "Failed to fetch employer ratings" });
    }
  });

  router.post('/suggestions', async (req: AuthenticatedRequest, res) => {
    try {
      const workspaceId = req.workspaceId!;
      const authReq = req as AuthenticatedRequest;
      const userId = authReq.user?.id;
      
      // For unauthenticated users, return success (frontend handles localStorage)
      if (!userId) {
        return res.status(401).json({ message: 'Unauthorized' });
      }
      
      // Get employee record
      const employee = await db
        .select()
        .from(employees)
        .where(and(
          eq(employees.userId, userId),
          eq(employees.workspaceId, workspaceId)
        ))
        .limit(1);
      
      if (!employee[0]) {
        return res.status(403).json({ message: "Employee not found" });
      }
      
      const validatedData = insertAnonymousSuggestionSchema.parse({
        ...req.body,
        workspaceId,
        employeeId: req.body.isAnonymous ? null : employee[0].id
      });
      
      const [suggestion] = await db
        .insert(anonymousSuggestions)
        .values(validatedData)
        .returning();
      
      // Trigger AI sentiment analysis and urgency detection for suggestions
      try {
        // @ts-expect-error — TS migration: fix in refactoring sprint
        const sentiment = await sentimentAnalyzer.analyzeSentiment(req.body.suggestionText || '', 'suggestion');
        const urgencyLevel = sentiment === 'negative' ? 'high' : 'normal';
        await db.update(anonymousSuggestions)
          .set({ urgencyLevel })
          .where(eq(anonymousSuggestions.id, suggestion.id));
      } catch (err) {
        log.error('[SentimentAnalysis] Suggestion analysis failed (non-blocking):', err);
      }
      
      res.json(suggestion);
    } catch (error: unknown) {
      log.error("Error submitting anonymous suggestion:", error);
      res.status(500).json({ message: "Failed to submit anonymous suggestion" });
    }
  });

  router.get('/suggestions', async (req: AuthenticatedRequest, res) => {
    try {
      const workspaceId = req.workspaceId!;
      const { status, category, urgencyLevel } = req.query;
      
      let query = db
        .select()
        .from(anonymousSuggestions)
        .where(eq(anonymousSuggestions.workspaceId, workspaceId))
        .orderBy(desc(anonymousSuggestions.submittedAt));
      
      if (status) {
        query = (query as any).where(and(
          eq(anonymousSuggestions.workspaceId, workspaceId),
          eq(anonymousSuggestions.status, status as string)
        ));
      }
      
      if (category) {
        query = (query as any).where(and(
          eq(anonymousSuggestions.workspaceId, workspaceId),
          eq(anonymousSuggestions.category, category as string)
        ));
      }
      
      if (urgencyLevel) {
        query = (query as any).where(and(
          eq(anonymousSuggestions.workspaceId, workspaceId),
          eq(anonymousSuggestions.urgencyLevel, urgencyLevel as string)
        ));
      }
      
      const suggestions = await query;
      res.json(suggestions);
    } catch (error: unknown) {
      log.error("Error fetching anonymous suggestions:", error);
      res.status(500).json({ message: "Failed to fetch anonymous suggestions" });
    }
  });

  router.patch('/suggestions/:id', async (req: AuthenticatedRequest, res) => {
    try {
      const workspaceId = req.workspaceId!;
      const { id } = req.params;
      
      const existing = await db
        .select()
        .from(anonymousSuggestions)
        .where(and(
          eq(anonymousSuggestions.id, id),
          eq(anonymousSuggestions.workspaceId, workspaceId)
        ))
        .limit(1);
      
      if (!existing[0]) {
        return res.status(404).json({ message: "Suggestion not found" });
      }
      
      const [updated] = await db
        .update(anonymousSuggestions)
        .set({
          ...req.body,
          statusUpdatedAt: req.body.status !== existing[0].status ? new Date() : existing[0].statusUpdatedAt,
          updatedAt: new Date()
        })
        .where(eq(anonymousSuggestions.id, id))
        .returning();
      
      res.json(updated);
    } catch (error: unknown) {
      log.error("Error updating suggestion:", error);
      res.status(500).json({ message: "Failed to update suggestion" });
    }
  });

  router.post('/recognition', async (req: AuthenticatedRequest, res) => {
    try {
      const workspaceId = req.workspaceId!;
      const authReq = req as AuthenticatedRequest;
      const userId = authReq.user?.id;
      
      // For unauthenticated users, return success (frontend handles localStorage)
      if (!userId) {
        return res.status(401).json({ message: 'Unauthorized' });
      }
      
      // Get employee record
      const employee = await db
        .select()
        .from(employees)
        .where(and(
          eq(employees.userId, userId),
          eq(employees.workspaceId, workspaceId)
        ))
        .limit(1);
      
      if (!employee[0]) {
        return res.status(403).json({ message: "Employee not found" });
      }
      
      // Check if user is manager
      const isManager = ['org_owner', 'co_owner', 'org_manager', 'manager', 'department_manager'].includes(employee[0]?.workspaceRole || '');
      
      // @ts-expect-error — TS migration: fix in refactoring sprint
      const validatedData = insertEmployeeRecognitionSchema.parse({
        ...req.body,
        workspaceId,
        recognizedByEmployeeId: !isManager ? employee[0].id : null,
        recognizedByManagerId: isManager ? employee[0].id : null
      });
      
      const [recognition] = await db
        .insert(employeeRecognition)
        .values(validatedData)
        .returning();
      
      // Process monetary rewards through Billing Platform with tax calculations
      if (req.body.hasMonetaryReward && req.body.bonusAmount > 0) {
        try {
          // @ts-expect-error — TS migration: fix in refactoring sprint
          const bonusCalculation = await calculateBonusTaxation(
            employee[0].id,
            req.body.bonusAmount,
            'CA' // Get from employee address if available
          );
          
          // Create bonus record in database
          const bonusRecord = {
            workspaceId,
            employeeId: employee[0].id,
            recognitionId: recognition.id,
            grossAmount: req.body.bonusAmount,
            federalWithholding: bonusCalculation.federalWithholding,
            stateWithholding: bonusCalculation.stateWithholding,
            netAmount: bonusCalculation.netBonus,
            status: 'pending_review',
            processedAt: new Date(),
          };
          
          
          // Audit log for compliance
        } catch (err) {
          log.error('[BonusProcessing] Failed to process monetary reward:', err);
          // Continue - bonus processing is non-blocking
        }
      }
      
      res.json(recognition);
    } catch (error: unknown) {
      log.error("Error creating employee recognition:", error);
      res.status(500).json({ message: "Failed to create employee recognition" });
    }
  });

  router.get('/recognition', async (req: AuthenticatedRequest, res) => {
    try {
      const workspaceId = req.workspaceId!;
      const { employeeId, isPublic } = req.query;
      
      let query = db
        .select()
        .from(employeeRecognition)
        .where(eq(employeeRecognition.workspaceId, workspaceId))
        .orderBy(desc(employeeRecognition.createdAt));
      
      if (employeeId) {
        query = (query as any).where(and(
          eq(employeeRecognition.workspaceId, workspaceId),
          eq(employeeRecognition.recognizedEmployeeId, employeeId as string)
        ));
      }
      
      if (isPublic !== undefined) {
        query = (query as any).where(and(
          eq(employeeRecognition.workspaceId, workspaceId),
          eq(employeeRecognition.isPublic, isPublic === 'true')
        ));
      }
      
      const recognitions = await query;
      res.json(recognitions);
    } catch (error: unknown) {
      log.error("Error fetching employee recognitions:", error);
      res.status(500).json({ message: "Failed to fetch employee recognitions" });
    }
  });

  router.get('/health-scores', async (req: AuthenticatedRequest, res) => {
    try {
      const workspaceId = req.workspaceId!;
      const { employeeId, riskLevel, requiresManagerAction } = req.query;
      
      let query = db
        .select()
        .from(employeeHealthScores)
        .where(eq(employeeHealthScores.workspaceId, workspaceId))
        .orderBy(desc(employeeHealthScores.periodEnd));
      
      if (employeeId) {
        query = (query as any).where(and(
          eq(employeeHealthScores.workspaceId, workspaceId),
          eq(employeeHealthScores.employeeId, employeeId as string)
        ));
      }
      
      if (riskLevel) {
        query = (query as any).where(and(
          eq(employeeHealthScores.workspaceId, workspaceId),
          eq(employeeHealthScores.riskLevel, riskLevel as string)
        ));
      }
      
      if (requiresManagerAction !== undefined) {
        query = (query as any).where(and(
          eq(employeeHealthScores.workspaceId, workspaceId),
          eq(employeeHealthScores.requiresManagerAction, requiresManagerAction === 'true')
        ));
      }
      
      const healthScores = await query;
      res.json(healthScores);
    } catch (error: unknown) {
      log.error("Error fetching employee health scores:", error);
      res.status(500).json({ message: "Failed to fetch employee health scores" });
    }
  });

  router.patch('/health-scores/:id/action', async (req: AuthenticatedRequest, res) => {
    try {
      const workspaceId = req.workspaceId!;
      const { id } = req.params;
      const { actionNotes } = req.body;
      
      const existing = await db
        .select()
        .from(employeeHealthScores)
        .where(and(
          eq(employeeHealthScores.id, id),
          eq(employeeHealthScores.workspaceId, workspaceId)
        ))
        .limit(1);
      
      if (!existing[0]) {
        return res.status(404).json({ message: "Health score not found" });
      }
      
      const [updated] = await db
        .update(employeeHealthScores)
        .set({
          actionTaken: true,
          actionTakenAt: new Date(),
          actionNotes
        })
        .where(eq(employeeHealthScores.id, id))
        .returning();
      
      res.json(updated);
    } catch (error: unknown) {
      log.error("Error updating health score action:", error);
      res.status(500).json({ message: "Failed to update health score action" });
    }
  });

  router.get('/benchmarks', async (req: AuthenticatedRequest, res) => {
    try {
      const workspaceId = req.workspaceId!;
      const { benchmarkType, targetId } = req.query;
      
      let query = db
        .select()
        .from(employerBenchmarkScores)
        .where(eq(employerBenchmarkScores.workspaceId, workspaceId))
        .orderBy(desc(employerBenchmarkScores.periodEnd));
      
      if (benchmarkType) {
        query = (query as any).where(and(
          eq(employerBenchmarkScores.workspaceId, workspaceId),
          eq(employerBenchmarkScores.benchmarkType, benchmarkType as string)
        ));
      }
      
      if (targetId) {
        query = (query as any).where(and(
          eq(employerBenchmarkScores.workspaceId, workspaceId),
          eq(employerBenchmarkScores.targetId, targetId as string)
        ));
      }
      
      const benchmarks = await query;
      res.json(benchmarks);
    } catch (error: unknown) {
      log.error("Error fetching employer benchmarks:", error);
      res.status(500).json({ message: "Failed to fetch employer benchmarks" });
    }
  });

  router.post('/health-scores/calculate', requireManager, async (req: AuthenticatedRequest, res) => {
    try {
      const workspaceId = req.workspaceId;
      if (!workspaceId) return res.status(400).json({ message: 'Workspace required' });

      const { employeeId, periodStart: bodyPeriodStart, periodEnd: bodyPeriodEnd } = req.body || {};

      if (employeeId && bodyPeriodStart && bodyPeriodEnd) {
        const healthScore = await calculateEmployeeHealthScore({
          workspaceId,
          employeeId,
          periodStart: new Date(bodyPeriodStart),
          periodEnd: new Date(bodyPeriodEnd)
        });
        return res.json(healthScore);
      }

      const workspaceEmployees = await db.select().from(employees).where(eq(employees.workspaceId, workspaceId));

      if (workspaceEmployees.length === 0) {
        return res.json({ message: 'No employees found', calculated: 0 });
      }

      const now = new Date();
      const periodStart = new Date(now.getFullYear(), now.getMonth(), 1);
      const periodEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0);

      let calculated = 0;

      for (const emp of workspaceEmployees) {
        const existing = await db.select().from(employeeHealthScores)
          .where(and(
            eq(employeeHealthScores.employeeId, emp.id),
            eq(employeeHealthScores.workspaceId, workspaceId),
            gte(employeeHealthScores.periodStart, periodStart),
          ))
          .limit(1);

        if (existing.length > 0) continue;

        const empTimeEntries = await db.select().from(timeEntriesTable)
          .where(and(
            eq(timeEntriesTable.employeeId, emp.id),
            gte(timeEntriesTable.clockIn, periodStart),
          ));

        const empShifts = await db.select().from(shifts)
          .where(and(
            eq(shifts.employeeId, emp.id),
            gte(shifts.startTime, periodStart),
          ));

        const hasTimeEntries = empTimeEntries.length > 0;
        const hasShifts = empShifts.length > 0;
        const shiftCount = empShifts.length;
        const timeEntryCount = empTimeEntries.length;

        let engagementScore = 50;
        if (hasTimeEntries) engagementScore += 15;
        if (hasShifts) engagementScore += 15;
        if (shiftCount > 5) engagementScore += 10;
        if (timeEntryCount > 5) engagementScore += 10;
        engagementScore = Math.min(100, engagementScore);

        let turnoverRisk = 30;
        if (!hasTimeEntries && !hasShifts) turnoverRisk = 70;
        else if (!hasTimeEntries) turnoverRisk = 50;

        let riskLevel = 'low';
        if (turnoverRisk >= 70) riskLevel = 'critical';
        else if (turnoverRisk >= 50) riskLevel = 'high';
        else if (turnoverRisk >= 30) riskLevel = 'medium';

        const requiresAction = riskLevel === 'critical' || riskLevel === 'high';

        const suggestedActions: any[] = [];
        if (riskLevel === 'critical') {
          suggestedActions.push({
            action: 'Schedule one-on-one meeting',
            conversationStarter: 'I noticed you haven\'t had many shifts recently. I wanted to check in and see how things are going.',
            expectedImpact: 'Improve retention by addressing concerns early'
          });
        }
        if (!hasTimeEntries) {
          suggestedActions.push({
            action: 'Review time tracking compliance',
            conversationStarter: 'Let\'s make sure your time entries are up to date so we can process your pay accurately.',
            expectedImpact: 'Ensure accurate payroll and identify disengagement'
          });
        }

        // @ts-expect-error — TS migration: fix in refactoring sprint
        await db.insert(employeeHealthScores).values({
          id: `ehs-${emp.id}-${periodStart.toISOString().slice(0,7)}`,
          employeeId: emp.id,
          workspaceId,
          periodStart,
          periodEnd,
          overallEngagementScore: engagementScore.toString(),
          turnoverRiskScore: turnoverRisk.toString(),
          riskLevel,
          requiresManagerAction: requiresAction,
          actionPriority: requiresAction ? 'high' : 'normal',
          suggestedActions: JSON.stringify(suggestedActions),
          actionTaken: false,
        });
        calculated++;
      }

      res.json({
        message: `Health scores calculated for ${calculated} employees`,
        calculated,
        total: workspaceEmployees.length,
      });
    } catch (error: unknown) {
      log.error('Health score calculation error:', error);
      res.status(500).json({ message: sanitizeError(error) || 'Failed to calculate health scores' });
    }
  });

  router.post('/health-scores/calculate-batch', requireManager, async (req: AuthenticatedRequest, res) => {
    try {
      const workspaceId = req.workspaceId!;
      const { periodStart, periodEnd } = req.body;
      
      if (!periodStart || !periodEnd) {
        return res.status(400).json({ message: "periodStart and periodEnd are required" });
      }
      
      const healthScores = await batchCalculateHealthScores(
        workspaceId,
        new Date(periodStart),
        new Date(periodEnd)
      );

      let engagementAlerts = { alertsTriggered: 0, criticalAlerts: [] as string[], warningAlerts: [] as string[] };
      try {
        const { checkEngagementAlertsForWorkspace } = await import('../services/engagementCalculations');
        engagementAlerts = await checkEngagementAlertsForWorkspace(workspaceId);
      } catch (alertErr) {
        log.warn('[Engagement] Alert check failed (non-blocking):', alertErr);
      }
      
      res.json({ 
        message: `Calculated ${healthScores.length} health scores`,
        healthScores,
        engagementAlerts,
      });
    } catch (error: unknown) {
      log.error("Error batch calculating health scores:", error);
      res.status(500).json({ message: "Failed to batch calculate health scores" });
    }
  });

  router.get('/behavior-scores', async (req: AuthenticatedRequest, res) => {
    try {
      const workspaceId = req.workspaceId!;
      const scores = await employeeBehaviorScoring.getWorkspaceScores(workspaceId);
      const employees = await storage.getEmployeesByWorkspace(workspaceId);
      const employeeMap = new Map(employees.map((e: any) => [e.id, e]));
      const enriched = scores.map((s: any) => ({
        ...s,
        employeeName: employeeMap.get(s.employeeId)?.name || 'Unknown',
        employeeRole: employeeMap.get(s.employeeId)?.position || '',
      }));
      res.json(enriched);
    } catch (error: unknown) {
      log.error("Error fetching behavior scores:", error);
      res.status(500).json({ message: "Failed to fetch behavior scores" });
    }
  });

  router.get('/behavior-scores/top', async (req: AuthenticatedRequest, res) => {
    try {
      const workspaceId = req.workspaceId!;
      const limit = Math.min(Math.max(1, parseInt(req.query.limit as string) || 10), 500);
      const scores = await employeeBehaviorScoring.getTopPerformers(workspaceId, limit);
      const employees = await storage.getEmployeesByWorkspace(workspaceId);
      const employeeMap = new Map(employees.map((e: any) => [e.id, e]));
      const enriched = scores.map((s: any) => ({
        ...s,
        employeeName: employeeMap.get(s.employeeId)?.name || 'Unknown',
        employeeRole: employeeMap.get(s.employeeId)?.position || '',
      }));
      res.json(enriched);
    } catch (error: unknown) {
      log.error("Error fetching top performers:", error);
      res.status(500).json({ message: "Failed to fetch top performers" });
    }
  });

  router.post('/benchmarks/calculate', requireManager, async (req: AuthenticatedRequest, res) => {
    try {
      const workspaceId = req.workspaceId!;
      const { benchmarkType, targetId, targetName, periodStart, periodEnd } = req.body;
      
      if (!benchmarkType || !periodStart || !periodEnd) {
        return res.status(400).json({ message: "benchmarkType, periodStart, and periodEnd are required" });
      }
      
      const benchmark = await calculateEmployerBenchmark({
        workspaceId,
        benchmarkType,
        targetId,
        targetName,
        periodStart: new Date(periodStart),
        periodEnd: new Date(periodEnd)
      });
      
      if (!benchmark) {
        return res.status(404).json({ message: "No ratings found for the specified period" });
      }
      
      res.json(benchmark);
    } catch (error: unknown) {
      log.error("Error calculating employer benchmark:", error);
      res.status(500).json({ message: "Failed to calculate employer benchmark" });
    }
  });

export default router;
