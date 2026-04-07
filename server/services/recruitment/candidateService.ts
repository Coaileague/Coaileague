/**
 * CANDIDATE SERVICE
 * Phase 58 — Trinity Interview Pipeline
 *
 * Handles candidate creation, stage advancement, and candidate queries.
 */

import { db } from '../../db';
import {
  interviewCandidates,
  candidateInterviewSessions,
  interviewScorecards,
  type InsertInterviewCandidate,
  type InterviewCandidate,
} from '@shared/schema';
import { eq, and, desc, ilike, or, sql } from 'drizzle-orm';
import { generateCandidateNumber, deriveOrgShort } from '../universalIdService';
import { workspaces } from '@shared/schema';

// ─── Create Candidate ─────────────────────────────────────────────────────────

export async function createCandidate(
  data: InsertInterviewCandidate & { workspaceId: string },
): Promise<InterviewCandidate> {
  // Get workspace for org short-code
  const [ws] = await db.select({ companyName: workspaces.companyName })
    .from(workspaces)
    .where(eq(workspaces.id, data.workspaceId))
    .limit(1);

  const orgShort = deriveOrgShort(ws?.companyName);
  const candidateNumber = await generateCandidateNumber(data.workspaceId, orgShort);

  const [candidate] = await db.insert(interviewCandidates).values({
    ...data,
    candidateNumber,
    stage: data.stage || 'new',
  }).returning();

  return candidate;
}

// ─── Advance Stage ────────────────────────────────────────────────────────────

export async function advanceCandidateStage(
  workspaceId: string,
  candidateId: string,
  newStage: string,
): Promise<InterviewCandidate | null> {
  const [updated] = await db.update(interviewCandidates)
    .set({ stage: newStage, updatedAt: new Date() })
    .where(and(eq(interviewCandidates.id, candidateId), eq(interviewCandidates.workspaceId, workspaceId)))
    .returning();
  return updated || null;
}

// ─── Update Score ─────────────────────────────────────────────────────────────

export async function updateCandidateScore(
  workspaceId: string,
  candidateId: string,
  qualificationScore: number,
): Promise<void> {
  await db.update(interviewCandidates)
    .set({ qualificationScore, updatedAt: new Date() })
    .where(and(eq(interviewCandidates.id, candidateId), eq(interviewCandidates.workspaceId, workspaceId)));
}

// ─── Record Decision ──────────────────────────────────────────────────────────

export async function recordDecision(
  workspaceId: string,
  candidateId: string,
  decision: 'hire' | 'reject' | 'hold',
  notes: string,
  decisionBy: string,
): Promise<void> {
  await db.update(interviewCandidates)
    .set({
      decision,
      decisionNotes: notes,
      decisionBy,
      decisionAt: new Date(),
      stage: 'decided',
      updatedAt: new Date(),
    })
    .where(and(eq(interviewCandidates.id, candidateId), eq(interviewCandidates.workspaceId, workspaceId)));
}

// ─── Get Candidates ───────────────────────────────────────────────────────────

export async function getCandidates(
  workspaceId: string,
  opts: {
    stage?: string;
    search?: string;
    limit?: number;
    offset?: number;
  } = {},
): Promise<{ candidates: InterviewCandidate[]; total: number }> {
  const { stage, search, limit = 50, offset = 0 } = opts;

  const conditions = [eq(interviewCandidates.workspaceId, workspaceId)];
  if (stage) conditions.push(eq(interviewCandidates.stage, stage));
  if (search) {
    const searchCondition = or(
      ilike(interviewCandidates.firstName, `%${search}%`),
      ilike(interviewCandidates.lastName, `%${search}%`),
      ilike(interviewCandidates.email, `%${search}%`),
      ilike(interviewCandidates.candidateNumber, `%${search}%`),
    );
    if (searchCondition) conditions.push(searchCondition);
  }

  const [candidates, countResult] = await Promise.all([
    db.select()
      .from(interviewCandidates)
      .where(and(...conditions))
      .orderBy(desc(interviewCandidates.createdAt))
      .limit(limit)
      .offset(offset),
    db.select({ count: sql<number>`COUNT(*)::int` })
      .from(interviewCandidates)
      .where(and(...conditions)),
  ]);

  return { candidates, total: countResult[0]?.count || 0 };
}

// ─── Get Candidate by ID ──────────────────────────────────────────────────────

export async function getCandidateById(
  candidateId: string,
  workspaceId: string,
): Promise<{
  candidate: InterviewCandidate | null;
  sessions: any[];
  scorecard: any | null;
}> {
  const [candidate] = await db.select()
    .from(interviewCandidates)
    .where(and(
      eq(interviewCandidates.id, candidateId),
      eq(interviewCandidates.workspaceId, workspaceId),
    ))
    .limit(1);

  if (!candidate) return { candidate: null, sessions: [], scorecard: null };

  const [sessions, scorecards] = await Promise.all([
    db.select()
      .from(candidateInterviewSessions)
      .where(eq(candidateInterviewSessions.candidateId, candidateId))
      .orderBy(desc(candidateInterviewSessions.createdAt)),
    db.select()
      .from(interviewScorecards)
      .where(eq(interviewScorecards.candidateId, candidateId))
      .orderBy(desc(interviewScorecards.generatedAt))
      .limit(1),
  ]);

  return {
    candidate,
    sessions,
    scorecard: scorecards[0] || null,
  };
}

// ─── Pipeline Summary ─────────────────────────────────────────────────────────

export async function getPipelineSummary(workspaceId: string): Promise<Record<string, number>> {
  const rows = await db.select({
    stage: interviewCandidates.stage,
    count: sql<number>`COUNT(*)::int`,
  })
    .from(interviewCandidates)
    .where(eq(interviewCandidates.workspaceId, workspaceId))
    .groupBy(interviewCandidates.stage);

  const summary: Record<string, number> = {
    new: 0,
    screening: 0,
    email_round_1: 0,
    email_round_2: 0,
    chat_interview: 0,
    voice_interview: 0,
    decided: 0,
  };

  for (const r of rows) {
    summary[r.stage] = r.count;
  }
  return summary;
}
