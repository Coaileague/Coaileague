/**
 * EMAIL INTERVIEW SERVICE
 * Phase 58 — Trinity Interview Pipeline
 *
 * Handles sending interview questions via email and processing replies.
 * Manages Round 1 and Round 2 adaptive email interview logic.
 */

import { db } from '../../db';
import {
  interviewCandidates,
  candidateInterviewSessions,
  interviewQuestionsBank,
  type InterviewCandidate,
} from '@shared/schema';
import { eq, and, desc } from 'drizzle-orm';
import { getQuestionsForRound, scoreResponse } from './trinityScreeningService';
import { advanceCandidateStage } from './candidateService';
import { sendCanSpamCompliantEmail } from '../emailCore';
import { createLogger } from '../../lib/logger';
const log = createLogger('emailInterviewService');


// ─── Send Round 1 Questions ───────────────────────────────────────────────────

export async function sendEmailRound1(
  candidate: InterviewCandidate,
  workspaceId: string,
): Promise<{ sessionId: string; questionCount: number }> {
  const questions = await getQuestionsForRound(workspaceId, candidate.positionType, 1);

  if (questions.length === 0) {
    throw new Error('No Round 1 questions configured for position type: ' + candidate.positionType);
  }

  const now = new Date();

  // Create interview session
  const [session] = await db.insert(candidateInterviewSessions).values({
    workspaceId,
    candidateId: candidate.id,
    sessionType: 'email_round_1',
    status: 'in_progress',
    questionsAsked: questions.map(q => ({
      questionId: q.id,
      questionText: q.questionText,
      sentAt: now.toISOString(),
    })),
    responsesReceived: [],
    startedAt: now,
  }).returning();

  // Build email body
  const questionsHtml = questions.map((q, i) => `
    <div style="margin-bottom: 24px; padding: 16px; background: #f8f9fa; border-radius: 8px; border-left: 3px solid #2563eb;">
      <p style="margin: 0 0 8px 0; font-weight: bold; color: #1e40af;">Question ${i + 1}:</p>
      <p style="margin: 0; color: #374151;">${q.questionText}</p>
    </div>
  `).join('');

  const html = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
      <div style="background: linear-gradient(135deg, #1e40af 0%, #3b82f6 100%); padding: 20px; border-radius: 12px 12px 0 0;">
        <h1 style="color: white; margin: 0; font-size: 22px;">Your Interview Questions — Round 1</h1>
      </div>
      <div style="background: #ffffff; padding: 24px; border: 1px solid #e5e7eb; border-top: none; border-radius: 0 0 12px 12px;">
        <p style="color: #374151;">Hi ${candidate.firstName},</p>
        <p style="color: #374151;">Thank you for your interest in joining our team! We reviewed your application and would like to move forward with the next step.</p>
        <p style="color: #374151;">Please respond to the following questions by replying to this email. Be as detailed as possible — your responses help us understand your background and fit for the role.</p>
        
        ${questionsHtml}
        
        <p style="color: #6b7280; font-size: 14px; margin-top: 24px;">Please reply to this email with your answers numbered to match the questions above. We look forward to learning more about you!</p>
        <p style="color: #6b7280; font-size: 14px;">— Recruitment Team</p>
      </div>
    </div>
  `;

  await sendCanSpamCompliantEmail({
    to: candidate.email,
    subject: `Interview Questions — Round 1 (${candidate.positionTitle || candidate.positionType})`,
    html,
    emailType: 'onboarding',
    workspaceId,
    tags: [
      { name: 'interviewSessionId', value: session.id },
      { name: 'candidateId', value: candidate.id },
      { name: 'round', value: '1' },
    ],
  });

  // Advance stage
  await advanceCandidateStage(workspaceId, candidate.id, 'email_round_1');

  return { sessionId: session.id, questionCount: questions.length };
}

// ─── Send Round 2 Questions ───────────────────────────────────────────────────

export async function sendEmailRound2(
  candidate: InterviewCandidate,
  workspaceId: string,
  round1SessionId?: string,
): Promise<{ sessionId: string; questionCount: number }> {
  // If round1SessionId was not supplied, auto-resolve the most recent completed Round 1 session
  let resolvedR1Id = round1SessionId;
  if (!resolvedR1Id) {
    const [latest] = await db.select({ id: candidateInterviewSessions.id })
      .from(candidateInterviewSessions)
      .where(and(
        eq(candidateInterviewSessions.candidateId, candidate.id),
        eq(candidateInterviewSessions.workspaceId, workspaceId),
        eq(candidateInterviewSessions.sessionType, 'email_round_1'),
      ))
      .orderBy(desc(candidateInterviewSessions.startedAt))
      .limit(1);
    resolvedR1Id = latest?.id;
  }

  // Get round 1 scores for branching
  const [r1Session] = resolvedR1Id
    ? await db.select()
        .from(candidateInterviewSessions)
        .where(eq(candidateInterviewSessions.id, resolvedR1Id))
        .limit(1)
    : [];

  type RoundResponse = { questionId?: string; score?: number; notes?: string };
  const r1Responses: RoundResponse[] = Array.isArray(r1Session?.responsesReceived)
    ? (r1Session!.responsesReceived as RoundResponse[])
    : [];
  const round1Scores = r1Responses.map((r: RoundResponse) => ({
    questionId: r.questionId ?? '',
    score: r.score || 0,
  }));

  const questions = await getQuestionsForRound(workspaceId, candidate.positionType, 2, round1Scores);

  if (questions.length === 0) {
    throw new Error('No Round 2 questions available for position type: ' + candidate.positionType);
  }

  const now = new Date();

  const [session] = await db.insert(candidateInterviewSessions).values({
    workspaceId,
    candidateId: candidate.id,
    sessionType: 'email_round_2',
    status: 'in_progress',
    questionsAsked: questions.map(q => ({
      questionId: q.id,
      questionText: q.questionText,
      sentAt: now.toISOString(),
    })),
    responsesReceived: [],
    startedAt: now,
  }).returning();

  const questionsHtml = questions.map((q, i) => `
    <div style="margin-bottom: 24px; padding: 16px; background: #f0f9ff; border-radius: 8px; border-left: 3px solid #0ea5e9;">
      <p style="margin: 0 0 8px 0; font-weight: bold; color: #0c4a6e;">Question ${i + 1}:</p>
      <p style="margin: 0; color: #374151;">${q.questionText}</p>
    </div>
  `).join('');

  const html = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
      <div style="background: linear-gradient(135deg, #0c4a6e 0%, #0ea5e9 100%); padding: 20px; border-radius: 12px 12px 0 0;">
        <h1 style="color: white; margin: 0; font-size: 22px;">Interview Questions — Round 2</h1>
      </div>
      <div style="background: #ffffff; padding: 24px; border: 1px solid #e5e7eb; border-top: none; border-radius: 0 0 12px 12px;">
        <p style="color: #374151;">Hi ${candidate.firstName},</p>
        <p style="color: #374151;">Excellent work on Round 1! We're impressed with your responses and would like to learn more about you with this second round of questions.</p>
        
        ${questionsHtml}
        
        <p style="color: #6b7280; font-size: 14px; margin-top: 24px;">Please reply to this email with your numbered responses. Thank you for your continued interest!</p>
        <p style="color: #6b7280; font-size: 14px;">— Recruitment Team</p>
      </div>
    </div>
  `;

  await sendCanSpamCompliantEmail({
    to: candidate.email,
    subject: `Interview Questions — Round 2 (${candidate.positionTitle || candidate.positionType})`,
    html,
    emailType: 'onboarding',
    workspaceId,
    tags: [
      { name: 'interviewSessionId', value: session.id },
      { name: 'candidateId', value: candidate.id },
      { name: 'round', value: '2' },
    ],
  });

  // Advance stage
  await advanceCandidateStage(workspaceId, candidate.id, 'email_round_2');

  return { sessionId: session.id, questionCount: questions.length };
}

// ─── Process Email Reply ───────────────────────────────────────────────────────

export async function processEmailReply(
  sessionId: string,
  replyText: string,
): Promise<{ sessionScore: number; advanceToChat: boolean }> {
  const [session] = await db.select()
    .from(candidateInterviewSessions)
    .where(eq(candidateInterviewSessions.id, sessionId))
    .limit(1);

  if (!session) throw new Error('Session not found: ' + sessionId);

  type QuestionRecord = { questionId?: string; questionText?: string; sentAt?: string };
  type ResponseRecord = { questionId?: string; questionText?: string; responseText?: string; score?: number; maxScore?: number; scoringNotes?: string; receivedAt?: string };

  const questions: QuestionRecord[] = Array.isArray(session.questionsAsked)
    ? (session.questionsAsked as QuestionRecord[])
    : [];
  const existingResponses: ResponseRecord[] = Array.isArray(session.responsesReceived)
    ? (session.responsesReceived as ResponseRecord[])
    : [];

  // Parse responses (simple: split by numbered lines)
  const responseLines = replyText.split(/\n+/);
  const parsedResponses: Record<number, string> = {};
  let currentQ = 0;
  let currentText = '';

  for (const line of responseLines) {
    const match = line.match(/^(\d+)[.\)]\s+(.+)/);
    if (match) {
      if (currentQ > 0 && currentText) {
        parsedResponses[currentQ] = currentText.trim();
      }
      currentQ = parseInt(match[1]);
      currentText = match[2] || '';
    } else if (currentQ > 0) {
      currentText += ' ' + line;
    }
  }
  if (currentQ > 0 && currentText) {
    parsedResponses[currentQ] = currentText.trim();
  }

  // If no numbered responses, treat entire reply as response to Q1
  if (Object.keys(parsedResponses).length === 0) {
    parsedResponses[1] = replyText.slice(0, 1000);
  }

  // Score each response
  const scoredResponses: ResponseRecord[] = [...existingResponses];
  let totalScore = 0;
  let scoredCount = 0;

  for (let i = 0; i < questions.length; i++) {
    const q = questions[i];
    const responseText = parsedResponses[i + 1] || '';
    if (!responseText) continue;

    // Get question details for scoring criteria
    const [qRow] = await db.select()
      .from(interviewQuestionsBank)
      .where(eq(interviewQuestionsBank.id, q.questionId ?? ''))
      .limit(1);
    const scoringCriteria = (qRow?.scoringCriteria as Record<string, unknown> | null) ?? null;
    const maxScore = qRow?.maxScore || 10;

    const scored = await scoreResponse(q.questionText ?? '', responseText, scoringCriteria, maxScore);

    scoredResponses.push({
      questionId: q.questionId,
      questionText: q.questionText,
      responseText,
      score: scored.score,
      maxScore,
      scoringNotes: scored.notes,
      receivedAt: new Date().toISOString(),
    });

    totalScore += (scored.score / maxScore) * 100; // Normalize to 0-100
    scoredCount++;
  }

  const sessionScore = scoredCount > 0 ? Math.round(totalScore / scoredCount) : 0;

  await db.update(candidateInterviewSessions)
    .set({
      responsesReceived: scoredResponses,
      sessionScore,
      status: 'completed',
      completedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(eq(candidateInterviewSessions.id, sessionId));

  // Determine if candidate should advance to chat
  const advanceToChat = session.sessionType === 'email_round_2' && sessionScore >= 75;

  // Auto-advance pipeline:
  // - Round 1 complete with passing score (>= 60) → advance to Round 2
  // - Round 2 complete with high score (>= 75) → advance to chat invite
  if (session.sessionType === 'email_round_1' && sessionScore >= 60) {
    // Advance to email_round_2 stage and automatically send Round 2 questions
    await advanceCandidateStage(session.workspaceId, session.candidateId, 'email_round_2');
    try {
      const [cand] = await db.select()
        .from(interviewCandidates)
        .where(and(eq(interviewCandidates.id, session.candidateId), eq(interviewCandidates.workspaceId, session.workspaceId)))
        .limit(1);
      if (cand) {
        // Auto-send Round 2, using the just-completed session as round1SessionId
        await sendEmailRound2(cand, session.workspaceId, sessionId);
      }
    } catch (r2Err: any) {
      log.warn('[EmailInterview] Auto Round 2 send failed:', r2Err.message);
    }
  } else if (advanceToChat) {
    // Generate a chat room ID and send invite
    try {
      const [candidate] = await db.select()
        .from(interviewCandidates)
        .where(and(eq(interviewCandidates.id, session.candidateId), eq(interviewCandidates.workspaceId, session.workspaceId)))
        .limit(1);
      if (candidate) {
        const chatRoomId = `chat-${candidate.id}-${Date.now()}`;
        // Build absolute URL for email delivery (candidates open from external email client)
        const baseUrl = process.env.APP_BASE_URL
          || (process.env.REPL_SLUG ? `https://${process.env.REPL_SLUG}.replit.app` : '')
          || 'https://coaileague.replit.app';
        const chatRoomUrl = `${baseUrl}/recruitment/candidates/${candidate.id}`;
        await sendChatInvitation(candidate, session.workspaceId, chatRoomId, chatRoomUrl);
      }
    } catch (chatErr: any) {
      log.warn('[EmailInterview] Auto chat invite failed:', chatErr.message);
    }
  }

  return { sessionScore, advanceToChat };
}

// ─── Send Chat Interview Invitation ──────────────────────────────────────────

export async function sendChatInvitation(
  candidate: InterviewCandidate,
  workspaceId: string,
  chatRoomId: string,
  chatRoomUrl: string,
): Promise<void> {
  const html = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
      <div style="background: linear-gradient(135deg, #059669 0%, #10b981 100%); padding: 20px; border-radius: 12px 12px 0 0;">
        <h1 style="color: white; margin: 0; font-size: 22px;">You're Invited — Live Chat Interview</h1>
      </div>
      <div style="background: #ffffff; padding: 24px; border: 1px solid #e5e7eb; border-top: none; border-radius: 0 0 12px 12px;">
        <p style="color: #374151;">Hi ${candidate.firstName},</p>
        <p style="color: #374151;">Congratulations! Based on your outstanding responses in both interview rounds, we would like to invite you to a live chat interview.</p>
        <p style="color: #374151;">Please click the button below to join your private interview room:</p>
        
        <div style="text-align: center; margin: 24px 0;">
          <a href="${chatRoomUrl}" style="background: #059669; color: white; padding: 14px 28px; text-decoration: none; border-radius: 8px; font-weight: bold; font-size: 16px;">
            Join Interview Room
          </a>
        </div>
        
        <p style="color: #6b7280; font-size: 14px;">This is a secure, private room. You will be connected with a member of our recruitment team.</p>
        <p style="color: #6b7280; font-size: 14px;">— Recruitment Team</p>
      </div>
    </div>
  `;

  await sendCanSpamCompliantEmail({
    to: candidate.email,
    subject: 'Invitation to Live Chat Interview',
    html,
    emailType: 'onboarding',
    workspaceId,
    tags: [
      { name: 'chatRoomId', value: chatRoomId },
      { name: 'candidateId', value: candidate.id },
    ],
  });

  await advanceCandidateStage(workspaceId, candidate.id, 'chat_interview');
}
