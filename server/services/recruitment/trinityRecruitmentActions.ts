/**
 * TRINITY RECRUITMENT ACTIONS
 * Phase 58 — Trinity Interview Pipeline
 *
 * Registers 5 Trinity actions for the recruitment pipeline:
 *   interview.screen
 *   interview.send_questions
 *   interview.score_response
 *   interview.generate_scorecard
 *   interview.ranked_summary
 *
 * All handlers use req.payload (canonical ActionRequest contract) and return
 * an ActionResult-compliant object: { success, actionId, message, data, executionTimeMs }
 */

import { helpaiOrchestrator } from '../helpai/platformActionHub';
import type { ActionResult } from '../helpai/platformActionHub';
import { db } from '../../db';
import {
  interviewCandidates,
  candidateInterviewSessions,
} from '@shared/schema';
import { eq, and } from 'drizzle-orm';
import {
  screenCandidate,
  scoreResponse,
} from './trinityScreeningService';
import {
  generateComprehensiveScorecard,
  getRankedSummary,
} from './scorecardService';
import {
  sendEmailRound1,
  sendEmailRound2,
  processEmailReply,
} from './emailInterviewService';
import { createLogger } from '../../lib/logger';
const log = createLogger('trinityRecruitmentActions');


export function registerRecruitmentActions(): void {
  // ── 1. interview.screen ────────────────────────────────────────────────────
  helpaiOrchestrator.registerAction({
    actionId: 'interview.screen',
    name: 'Screen Interview Candidate',
    category: 'hr',
    description: 'Run Trinity AI initial qualification screening on a job applicant (0-100 score)',
    requiredRoles: ['org_owner', 'co_owner', 'org_admin', 'org_manager', 'manager'],
    handler: async (req): Promise<ActionResult> => {
      const t0 = Date.now();
      const { workspaceId, candidateId, resumeText, positionType } = req.payload || {};
      if (!workspaceId || !candidateId) {
        return {
          success: false,
          actionId: 'interview.screen',
          message: 'workspaceId and candidateId are required',
          executionTimeMs: Date.now() - t0,
        };
      }

      const [candidate] = await db.select()
        .from(interviewCandidates)
        .where(and(eq(interviewCandidates.id, candidateId), eq(interviewCandidates.workspaceId, workspaceId)))
        .limit(1);

      if (!candidate) {
        return {
          success: false,
          actionId: 'interview.screen',
          message: 'Candidate not found',
          executionTimeMs: Date.now() - t0,
        };
      }

      const result = await screenCandidate(
        candidate,
        resumeText || candidate.rawApplicationText || '',
        positionType || candidate.positionType,
      );

      await db.update(interviewCandidates)
        .set({
          qualificationScore: result.score,
          resumeParsed: result.parsedData,
          stage: result.score >= 60 ? 'screening' : 'decided',
          decision: result.score < 60 ? 'reject' : null,
          updatedAt: new Date(),
        })
        .where(and(eq(interviewCandidates.id, candidateId), eq(interviewCandidates.workspaceId, workspaceId)));

      return {
        success: true,
        actionId: 'interview.screen',
        message: `Candidate screened. Score: ${result.score}/100. ${result.score >= 60 ? 'Qualified' : 'Not qualified'}.`,
        data: {
          score: result.score,
          reasoning: result.reasoning,
          parsedData: result.parsedData,
          qualified: result.score >= 60,
        },
        executionTimeMs: Date.now() - t0,
      };
    },
  });

  // ── 2. interview.send_questions ────────────────────────────────────────────
  helpaiOrchestrator.registerAction({
    actionId: 'interview.send_questions',
    name: 'Send Interview Questions',
    category: 'hr',
    description: 'Send adaptive email interview questions (Round 1 or Round 2) to a candidate',
    requiredRoles: ['org_owner', 'co_owner', 'org_admin', 'org_manager', 'manager'],
    handler: async (req): Promise<ActionResult> => {
      const t0 = Date.now();
      const { workspaceId, candidateId, round, round1SessionId } = req.payload || {};
      if (!workspaceId || !candidateId) {
        return {
          success: false,
          actionId: 'interview.send_questions',
          message: 'workspaceId and candidateId are required',
          executionTimeMs: Date.now() - t0,
        };
      }

      const [candidate] = await db.select()
        .from(interviewCandidates)
        .where(and(eq(interviewCandidates.id, candidateId), eq(interviewCandidates.workspaceId, workspaceId)))
        .limit(1);

      if (!candidate) {
        return {
          success: false,
          actionId: 'interview.send_questions',
          message: 'Candidate not found',
          executionTimeMs: Date.now() - t0,
        };
      }

      const roundNum = parseInt(round || '1');

      if (roundNum === 1) {
        const result = await sendEmailRound1(candidate, workspaceId);
        return {
          success: true,
          actionId: 'interview.send_questions',
          message: `Round 1 questions sent (${result.questionCount} questions)`,
          data: { ...result, round: 1 },
          executionTimeMs: Date.now() - t0,
        };
      } else if (roundNum === 2) {
        // round1SessionId optional — service auto-resolves latest Round 1 session if absent
        const result = await sendEmailRound2(candidate, workspaceId, round1SessionId ?? undefined);
        return {
          success: true,
          actionId: 'interview.send_questions',
          message: `Round 2 questions sent (${result.questionCount} questions)`,
          data: { ...result, round: 2 },
          executionTimeMs: Date.now() - t0,
        };
      }

      return {
        success: false,
        actionId: 'interview.send_questions',
        message: 'Invalid round number (1 or 2 only)',
        executionTimeMs: Date.now() - t0,
      };
    },
  });

  // ── 3. interview.score_response ────────────────────────────────────────────
  helpaiOrchestrator.registerAction({
    actionId: 'interview.score_response',
    name: 'Score Interview Response',
    category: 'hr',
    description: 'Score a candidate\'s response to an interview question (0-10)',
    requiredRoles: ['org_owner', 'co_owner', 'org_admin', 'org_manager', 'manager'],
    handler: async (req): Promise<ActionResult> => {
      const t0 = Date.now();
      const { workspaceId, sessionId, replyText } = req.payload || {};
      if (!workspaceId || !sessionId || !replyText) {
        return {
          success: false,
          actionId: 'interview.score_response',
          message: 'workspaceId, sessionId, and replyText are required',
          executionTimeMs: Date.now() - t0,
        };
      }

      // Verify session belongs to workspace (IDOR prevention)
      const [session] = await db.select({ id: candidateInterviewSessions.id })
        .from(candidateInterviewSessions)
        .where(and(
          eq(candidateInterviewSessions.id, sessionId),
          eq(candidateInterviewSessions.workspaceId, workspaceId),
        ))
        .limit(1);

      if (!session) {
        return {
          success: false,
          actionId: 'interview.score_response',
          message: 'Session not found in this workspace',
          executionTimeMs: Date.now() - t0,
        };
      }

      const result = await processEmailReply(sessionId, replyText);
      return {
        success: true,
        actionId: 'interview.score_response',
        message: `Reply processed and scored for session ${sessionId}`,
        data: result,
        executionTimeMs: Date.now() - t0,
      };
    },
  });

  // ── 4. interview.generate_scorecard ────────────────────────────────────────
  helpaiOrchestrator.registerAction({
    actionId: 'interview.generate_scorecard',
    name: 'Generate Interview Scorecard',
    category: 'hr',
    description: 'Generate comprehensive interview scorecard for a candidate across all rounds',
    requiredRoles: ['org_owner', 'co_owner', 'org_admin', 'org_manager', 'manager'],
    handler: async (req): Promise<ActionResult> => {
      const t0 = Date.now();
      const { workspaceId, candidateId } = req.payload || {};
      if (!workspaceId || !candidateId) {
        return {
          success: false,
          actionId: 'interview.generate_scorecard',
          message: 'workspaceId and candidateId are required',
          executionTimeMs: Date.now() - t0,
        };
      }

      // Verify candidate belongs to workspace before generating scorecard
      const [candidate] = await db.select({ id: interviewCandidates.id })
        .from(interviewCandidates)
        .where(and(eq(interviewCandidates.id, candidateId), eq(interviewCandidates.workspaceId, workspaceId)))
        .limit(1);

      if (!candidate) {
        return {
          success: false,
          actionId: 'interview.generate_scorecard',
          message: 'Candidate not found',
          executionTimeMs: Date.now() - t0,
        };
      }

      await generateComprehensiveScorecard(candidateId, workspaceId);
      return {
        success: true,
        actionId: 'interview.generate_scorecard',
        message: 'Scorecard generated successfully',
        data: { candidateId },
        executionTimeMs: Date.now() - t0,
      };
    },
  });

  // ── 5. interview.ranked_summary ────────────────────────────────────────────
  helpaiOrchestrator.registerAction({
    actionId: 'interview.ranked_summary',
    name: 'Get Ranked Candidate Summary',
    category: 'hr',
    description: 'Get Trinity\'s ranked summary of all candidates by overall score and recommendation',
    requiredRoles: ['org_owner', 'co_owner', 'org_admin', 'org_manager', 'manager'],
    handler: async (req): Promise<ActionResult> => {
      const t0 = Date.now();
      const { workspaceId, positionType } = req.payload || {};
      if (!workspaceId) {
        return {
          success: false,
          actionId: 'interview.ranked_summary',
          message: 'workspaceId is required',
          executionTimeMs: Date.now() - t0,
        };
      }

      const summary = await getRankedSummary(workspaceId, positionType);
      return {
        success: true,
        actionId: 'interview.ranked_summary',
        message: `Retrieved ${summary.length} ranked candidates`,
        data: {
          rankedCandidates: summary.map(s => ({
            candidateNumber: s.candidate.candidateNumber,
            name: `${s.candidate.firstName} ${s.candidate.lastName}`,
            email: s.candidate.email,
            stage: s.candidate.stage,
            overallScore: s.overallScore,
            recommendation: s.recommendation,
            reasoning: s.reasoning,
          })),
          total: summary.length,
        },
        executionTimeMs: Date.now() - t0,
      };
    },
  });

  log.info('[RecruitmentActions] Registered 5 Trinity recruitment actions');
}
