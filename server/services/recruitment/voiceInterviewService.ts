/**
 * VOICE INTERVIEW SERVICE
 * Phase 58 — Trinity Interview Pipeline (Phase 56 Extension 6)
 *
 * Manages structured voice interviews via Twilio Gather.
 *
 * Flow:
 * 1. Twilio calls candidate — Trinity greets and reads Q1 via <Say>
 * 2. Twilio <Gather input="speech"> captures response
 * 3. POST /api/webhooks/twilio/voice-interview/response receives SpeechResult
 * 4. Trinity scores the response in real time
 * 5. Next question is read, or interview concludes with a closing message
 * 6. Final scorecard is saved to the candidate session
 */

import { db } from '../../db';
import {
  candidateInterviewSessions,
  type InterviewCandidate,
} from '@shared/schema';
import { eq, and } from 'drizzle-orm';
import { getQuestionsForRound } from './trinityScreeningService';
import { advanceCandidateStage } from './candidateService';
import { meteredGemini } from '../billing/meteredGeminiClient';
import { createLogger } from '../../lib/logger';

const log = createLogger('VoiceInterviewService');

// ─── Types ────────────────────────────────────────────────────────────────────

export interface VoiceInterviewState {
  sessionId: string;
  candidateId: string;
  workspaceId: string;
  questionIndex: number;
  questions: Array<{ id: string; questionText: string; maxScore: number }>;
  responses: Array<{
    questionIndex: number;
    speechTranscript: string;
    score: number;
    feedback: string;
  }>;
}

// ─── Create Voice Interview Session ──────────────────────────────────────────

export async function createVoiceInterviewSession(
  candidate: InterviewCandidate,
  workspaceId: string,
): Promise<{ sessionId: string; questionCount: number }> {
  const questions = await getQuestionsForRound(workspaceId, candidate.positionType, 3)
    .catch(() => []);

  // Fall back to round 2 questions for voice if no round 3 exists
  const voiceQuestions = questions.length
    ? questions
    : await getQuestionsForRound(workspaceId, candidate.positionType, 2).catch(() => []);

  const [session] = await db.insert(candidateInterviewSessions).values({
    workspaceId,
    candidateId: candidate.id,
    sessionType: 'voice_interview',
    status: 'in_progress',
    questionsAsked: voiceQuestions.map(q => ({
      questionId: q.id,
      questionText: q.questionText,
      maxScore: q.maxScore ?? 10,
      sentAt: new Date().toISOString(),
    })),
    responsesReceived: [],
    startedAt: new Date(),
  }).returning();

  // Voice session is tracked via candidateInterviewSessions (candidateId link is sufficient)
  log.info(`[VoiceInterview] Session ${session.id} created for candidate ${candidate.id} with ${voiceQuestions.length} questions`);

  return { sessionId: session.id, questionCount: voiceQuestions.length };
}

// ─── Build TwiML for Question Prompt ─────────────────────────────────────────

export function buildQuestionTwiml(
  sessionId: string,
  workspaceId: string,
  questionIndex: number,
  questionText: string,
  webhookBase: string,
): string {
  const sid = encodeURIComponent(sessionId);
  const wid = encodeURIComponent(workspaceId);
  const qi = questionIndex;

  // Embed sessionId, workspaceId, and qIndex in the Gather action URL so
  // Twilio posts them back alongside SpeechResult.
  const gatherAction = `${webhookBase}/api/webhooks/twilio/voice-interview/response?sessionId=${sid}&workspaceId=${wid}&qIndex=${qi}`;
  const retryUrl = `${webhookBase}/api/webhooks/twilio/voice-interview/question?sessionId=${sid}&workspaceId=${wid}&qIndex=${qi}`;

  return `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Gather input="speech" action="${gatherAction}" method="POST" speechTimeout="auto" timeout="10" enhanced="true">
    <Say voice="Polly.Joanna">
      ${questionIndex === 0 ? 'Hello, thank you for joining your voice interview with us today. Trinity, our AI interviewer, will guide you through a few questions. Please speak clearly after each prompt. ' : ''}
      Question ${questionIndex + 1}: ${escapeXml(questionText)}
    </Say>
  </Gather>
  <Say voice="Polly.Joanna">We did not detect a response. Let us try again.</Say>
  <Redirect method="GET">${retryUrl}</Redirect>
</Response>`;
}

// ─── Build TwiML for Interview Close ─────────────────────────────────────────

export function buildClosingTwiml(sessionScore: number): string {
  const assessment = sessionScore >= 75
    ? 'Excellent — you have performed very well in this interview.'
    : sessionScore >= 50
      ? 'Thank you — you demonstrated solid experience in several areas.'
      : 'Thank you for your time today.';

  return `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say voice="Polly.Joanna">
    Thank you for completing your voice interview. ${assessment}
    Our recruitment team will review your responses and be in touch shortly.
    Have a great day. Goodbye.
  </Say>
  <Hangup/>
</Response>`;
}

// ─── Score a Speech Response ──────────────────────────────────────────────────

export async function scoreSpeechResponse(
  sessionId: string,
  workspaceId: string,
  questionIndex: number,
  speechTranscript: string,
): Promise<{
  score: number;
  feedback: string;
  nextQuestionIndex: number | null;
  sessionScore: number;
  candidateId: string;
}> {
  const [session] = await db.select()
    .from(candidateInterviewSessions)
    .where(and(
      eq(candidateInterviewSessions.id, sessionId),
      eq(candidateInterviewSessions.workspaceId, workspaceId),
    ))
    .limit(1);

  if (!session) throw new Error(`Voice session ${sessionId} not found`);

  const questions = (session.questionsAsked ?? []) as Array<{ questionText: string; maxScore?: number }>;
  const existingResponses = (session.responsesReceived ?? []) as Array<{ score?: number }>;
  const question = questions[questionIndex];

  let score = 5;
  let feedback = 'Response recorded.';

  if (question && speechTranscript?.trim()) {
    try {
      const result = await meteredGemini.generate({
        workspaceId,
        featureKey: 'voice_interview_scoring',
        prompt: `You are Trinity, an AI recruitment interviewer. Score this voice interview response.

Question: "${question.questionText}"
Candidate response (transcribed): "${speechTranscript}"

Rate the response on a scale of 0-10 considering:
- Relevance to the question
- Clarity and specificity  
- Demonstration of competency

Return JSON: { "score": number, "feedback": "1-sentence feedback for recruiter" }`,
        jsonMode: true,
      });

      const text = result.text ?? '';
      const match = text.match(/\{[\s\S]*\}/);
      if (match) {
        const parsed = JSON.parse(match[0]);
        score = Math.max(0, Math.min(10, parsed.score ?? 5));
        feedback = parsed.feedback ?? feedback;
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      log.warn('[VoiceInterview] Scoring failed, using default score:', msg);
    }
  }

  const newResponse = {
    questionIndex,
    speechTranscript: speechTranscript?.slice(0, 1000) ?? '',
    score,
    feedback,
    scoredAt: new Date().toISOString(),
  };

  const updatedResponses = [...existingResponses, newResponse];
  const nextQuestionIndex = questionIndex + 1 < questions.length ? questionIndex + 1 : null;

  // Compute running session score (0-100 scale)
  const scored = updatedResponses.filter(r => r.score != null);
  const sessionScore = scored.length
    ? Math.round(scored.reduce((s, r) => s + (r.score ?? 0), 0) / scored.length * 10)
    : 0;

  // Finalize if last question
  if (nextQuestionIndex === null) {
    await db.update(candidateInterviewSessions)
      .set({
        responsesReceived: updatedResponses,
        sessionScore,
        status: 'completed',
        completedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(candidateInterviewSessions.id, sessionId));

    // Auto-advance to decided if score >= 75
    if (sessionScore >= 75) {
      await advanceCandidateStage(workspaceId, session.candidateId, 'decided').catch((err) => log.warn('[voiceInterviewService] Fire-and-forget failed:', err));
    }
  } else {
    await db.update(candidateInterviewSessions)
      .set({
        responsesReceived: updatedResponses,
        sessionScore,
        updatedAt: new Date(),
      })
      .where(eq(candidateInterviewSessions.id, sessionId));
  }

  return { score, feedback, nextQuestionIndex, sessionScore, candidateId: session.candidateId };
}

// ─── Get Voice Session State ──────────────────────────────────────────────────

export async function getVoiceSessionState(
  sessionId: string,
  workspaceId: string,
): Promise<VoiceInterviewState | null> {
  const [session] = await db.select()
    .from(candidateInterviewSessions)
    .where(and(
      eq(candidateInterviewSessions.id, sessionId),
      eq(candidateInterviewSessions.workspaceId, workspaceId),
    ))
    .limit(1);

  if (!session) return null;

  type QRow = VoiceInterviewState['questions'][number];
  type RRow = VoiceInterviewState['responses'][number];

  return {
    sessionId: session.id,
    candidateId: session.candidateId,
    workspaceId: session.workspaceId,
    questionIndex: (session.responsesReceived as RRow[] | null ?? []).length,
    questions: (session.questionsAsked as QRow[] | null) ?? [],
    responses: (session.responsesReceived as RRow[] | null) ?? [],
  };
}

// ─── Utility ──────────────────────────────────────────────────────────────────

function escapeXml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}
