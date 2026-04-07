/**
 * CHAT INTERVIEW SERVICE
 * Phase 58 — Trinity Interview Pipeline
 *
 * Manages the DockChat-based interview room for candidates who pass Round 2.
 *
 * Flow:
 * 1. A dedicated DockChat room is created in `organization_chat_rooms`
 * 2. The candidate is given a join link; recruiters are added as members
 * 3. A `chat_interview` session is created in `candidateInterviewSessions`
 * 4. Trinity posts a recruiter-only co-pilot message stream (hidden from candidate)
 *    → live scoring, evasiveness flags, suggested follow-up questions
 * 5. When the recruiter closes the session, a scorecard is finalized
 */

import { db } from '../../db';
import { pool } from '../../db';
import {
  interviewCandidates,
  candidateInterviewSessions,
  type InterviewCandidate,
} from '@shared/schema';
import { eq, and } from 'drizzle-orm';
import { advanceCandidateStage } from './candidateService';
import { getQuestionsForRound } from './trinityScreeningService';
import { meteredGemini } from '../billing/meteredGeminiClient';
import { createLogger } from '../../lib/logger';

const log = createLogger('ChatInterviewService');

// ─── Create DockChat Interview Room ──────────────────────────────────────────

export async function createChatInterviewRoom(
  candidate: InterviewCandidate,
  workspaceId: string,
  recruiterUserIds: string[] = [],
): Promise<{
  roomId: string;
  roomSlug: string;
  sessionId: string;
  chatRoomUrl: string;
}> {
  const roomName = `Interview — ${candidate.firstName} ${candidate.lastName} (${candidate.positionTitle ?? candidate.positionType})`;
  const rawSlug = `interview-${candidate.id.slice(0, 8)}-${Date.now()}`;

  // 1. Create the chat room
  const { rows: roomRows } = await pool.query(
    `INSERT INTO organization_chat_rooms
       (workspace_id, room_name, room_slug, description, created_by, status)
     VALUES ($1, $2, $3, $4, 'trinity-recruitment', 'active')
     RETURNING *`,
    [workspaceId, roomName, rawSlug, `Chat interview room for candidate ${candidate.candidateNumber}`]
  );
  const room = roomRows[0];

  // 2. Add recruiters as owners
  for (const uid of recruiterUserIds) {
    await pool.query(
      `INSERT INTO organization_room_members (room_id, user_id, workspace_id, role, is_approved)
       VALUES ($1,$2,$3,'owner',true) ON CONFLICT DO NOTHING`,
      [room.id, uid, workspaceId]
    ).catch((err) => log.warn('[chatInterviewService] Fire-and-forget failed:', err));
  }

  // 3. Create the interview session
  const questions = await getQuestionsForRound(workspaceId, candidate.positionType, 3)
    .catch(() => []);

  const [session] = await db.insert(candidateInterviewSessions).values({
    workspaceId,
    candidateId: candidate.id,
    sessionType: 'chat_interview',
    status: 'in_progress',
    questionsAsked: questions.map(q => ({
      questionId: q.id,
      questionText: q.questionText,
      sentAt: new Date().toISOString(),
    })),
    responsesReceived: [],
    startedAt: new Date(),
  }).returning();

  // 4. Update candidate with chat room info
  // The chatRoomUrl is the DockChat interview room deep-link for recruiters.
  // Candidates join through a separate path — but the DockChat URL with
  // interview mode query-param ensures the copilot panel shows only to users
  // who are authenticated workspace members (recruiter side).
  const baseUrl = process.env.APP_BASE_URL
    || (process.env.REPL_SLUG ? `https://${process.env.REPL_SLUG}.replit.app` : '')
    || 'https://coaileague.replit.app';
  const chatRoomUrl = `${baseUrl}/dock-chat?interview=${encodeURIComponent(room.id)}&candidate=${encodeURIComponent(candidate.id)}`;

  await db.update(interviewCandidates)
    .set({
      chatRoomId: room.id,
      chatRoomUrl,
      updatedAt: new Date(),
    })
    .where(and(eq(interviewCandidates.id, candidate.id), eq(interviewCandidates.workspaceId, workspaceId)));

  // 5. Post Trinity co-pilot bootstrap message (recruiter-only system message)
  await postCopilotSystemMessage(room.id, workspaceId, candidate, questions);

  log.info(`[ChatInterview] Room created: ${room.id} for candidate ${candidate.id}`);

  return {
    roomId: room.id,
    roomSlug: rawSlug,
    sessionId: session.id,
    chatRoomUrl,
  };
}

// ─── Trinity Recruiter-Only Co-Pilot Message ──────────────────────────────────

async function postCopilotSystemMessage(
  roomId: string,
  workspaceId: string,
  candidate: InterviewCandidate,
  questions: Array<{ questionText: string; id: string }>,
): Promise<void> {
  const questionList = questions.length
    ? questions.map((q, i) => `${i + 1}. ${q.questionText}`).join('\n')
    : 'No structured questions configured — use open-ended probing.';

  const copilotMsg = [
    `**[Trinity Co-Pilot — Recruiter Only]**`,
    ``,
    `Candidate: **${candidate.firstName} ${candidate.lastName}** | ${candidate.positionTitle ?? candidate.positionType}`,
    `Qualification Score: ${candidate.qualificationScore ?? 'N/A'}/100`,
    ``,
    `**Suggested Interview Questions:**`,
    questionList,
    ``,
    `**Co-Pilot Active:** Trinity will analyze each candidate response in real time and post:`,
    `- Evasiveness flags when answers lack specificity`,
    `- Follow-up probes when a topic needs deeper exploration`,
    `- Live scoring updates after each substantive response`,
    ``,
    `_This message is visible to recruiters only._`,
  ].join('\n');

  await pool.query(
    `INSERT INTO chat_messages
       (workspace_id, sender_id, sender_type, content, message_type, metadata)
     VALUES ($1,'trinity','trinity',$2,'announcement',$3)`,
    [
      workspaceId,
      copilotMsg,
      JSON.stringify({
        room_id: roomId,
        copilot: true,
        recruiter_only: true,
        candidateId: candidate.id,
      }),
    ]
  ).catch((err: unknown) => {
    const msg = err instanceof Error ? err.message : String(err);
    log.warn('[ChatInterview] Failed to post co-pilot bootstrap:', msg);
  });
}

// ─── Score a Chat Response (Trinity Co-Pilot Analysis) ────────────────────────

export async function analyzeChatResponse(
  sessionId: string,
  workspaceId: string,
  candidateId: string,
  roomId: string,
  messageContent: string,
): Promise<void> {
  // Fetch session context
  const [session] = await db.select()
    .from(candidateInterviewSessions)
    .where(and(
      eq(candidateInterviewSessions.id, sessionId),
      eq(candidateInterviewSessions.workspaceId, workspaceId),
    ))
    .limit(1);

  if (!session) return;

  const questions = (session.questionsAsked ?? []) as Array<{ questionText: string }>;
  const existingResponses = (session.responsesReceived ?? []) as Array<{ score?: number }>;
  const questionContext = questions.map((q, i) => `Q${i + 1}: ${q.questionText}`).join('\n');

  try {
    const analysis = await meteredGemini.generate({
      workspaceId,
      featureKey: 'chat_interview_copilot',
      prompt: `You are Trinity, an AI recruiter co-pilot analyzing a live chat interview response.

Candidate message: "${messageContent}"

Interview questions being covered:
${questionContext || '(open-ended interview)'}

Analyze this response and return a JSON object with:
- score: number 0-10 (how well this response demonstrates competency)
- evasive: boolean (true if the candidate is vague or avoids answering directly)
- followUp: string|null (a specific follow-up question the recruiter should ask, or null if not needed)
- insight: string (1-sentence observation for the recruiter)

Return ONLY valid JSON.`,
      jsonMode: true,
    });
    const analysisText = analysis.text ?? '';

    let parsed: { score?: number; evasive?: boolean; followUp?: string | null; insight?: string } = {};
    try {
      const match = analysisText.match(/\{[\s\S]*\}/);
      if (match) parsed = JSON.parse(match[0]);
    } catch (parseErr) {
      log.warn('[ChatInterview] JSON parse failed for co-pilot analysis:', parseErr);
    }

    const score = Math.max(0, Math.min(10, parsed.score ?? 5));
    const newResponse = {
      questionIndex: existingResponses.length,
      responseText: messageContent.slice(0, 500),
      score,
      feedback: parsed.insight ?? '',
      evasive: parsed.evasive ?? false,
      followUp: parsed.followUp ?? null,
    };

    const updatedResponses = [...existingResponses, newResponse];
    const avgScore = Math.round(
      updatedResponses.reduce((s, r) => s + (r.score ?? 0), 0) / updatedResponses.length * 10
    );

    await db.update(candidateInterviewSessions)
      .set({
        responsesReceived: updatedResponses,
        sessionScore: avgScore,
        updatedAt: new Date(),
      })
      .where(eq(candidateInterviewSessions.id, sessionId));

    // Post co-pilot observation in the room
    const flagLine = parsed.evasive ? `\n**Evasiveness Flag:** Candidate response lacks specificity.` : '';
    const followUpLine = parsed.followUp ? `\n**Suggested Follow-up:** ${parsed.followUp}` : '';
    const copilotNote = [
      `**[Trinity Co-Pilot]** Response score: **${score}/10**`,
      parsed.insight ? `Insight: ${parsed.insight}` : '',
      flagLine,
      followUpLine,
      `Running session score: **${avgScore}/100**`,
    ].filter(Boolean).join('\n');

    await pool.query(
      `INSERT INTO chat_messages
         (workspace_id, sender_id, sender_type, content, message_type, metadata)
       VALUES ($1,'trinity','trinity',$2,'announcement',$3)`,
      [
        workspaceId,
        copilotNote,
        JSON.stringify({
          room_id: roomId,
          copilot: true,
          recruiter_only: true,
          candidateId,
          score,
          evasive: parsed.evasive ?? false,
        }),
      ]
    ).catch((err) => log.warn('[chatInterviewService] Fire-and-forget failed:', err));
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    log.warn('[ChatInterview] Co-pilot analysis failed:', msg);
  }
}

// ─── Close Chat Session ────────────────────────────────────────────────────────

export async function closeChatInterviewSession(
  sessionId: string,
  workspaceId: string,
): Promise<{ sessionScore: number }> {
  const [session] = await db.select()
    .from(candidateInterviewSessions)
    .where(and(
      eq(candidateInterviewSessions.id, sessionId),
      eq(candidateInterviewSessions.workspaceId, workspaceId),
    ))
    .limit(1);

  if (!session) throw new Error('Session not found');

  const responses = (session.responsesReceived ?? []) as Array<{ score?: number }>;
  const sessionScore = responses.length
    ? Math.round(responses.reduce((s, r) => s + (r.score ?? 0), 0) / responses.length * 10)
    : 0;

  await db.update(candidateInterviewSessions)
    .set({
      status: 'completed',
      sessionScore,
      completedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(eq(candidateInterviewSessions.id, sessionId));

  // Auto-advance to voice_interview if score >= 75
  if (sessionScore >= 75) {
    await advanceCandidateStage(workspaceId, session.candidateId, 'voice_interview');
  }

  return { sessionScore };
}

// ─── Get Co-Pilot Events (recruiter-only messages) ────────────────────────────

export async function getCopilotEvents(
  roomId: string,
  workspaceId: string,
): Promise<Array<{ content: string; createdAt: string; evasive?: boolean; score?: number }>> {
  interface CopilotRow {
    content: string;
    created_at: string;
    metadata: Record<string, unknown> | null;
  }

  const queryResult = await pool.query<CopilotRow>(
    `SELECT content, created_at, metadata
     FROM chat_messages
     WHERE workspace_id=$1 AND (metadata->>'room_id')=$2 AND (metadata->>'copilot')='true'
     ORDER BY created_at ASC`,
    [workspaceId, roomId]
  ).catch(() => ({ rows: [] as CopilotRow[] }));

  return queryResult.rows.map((r) => {
    const meta: Record<string, unknown> = typeof r.metadata === 'object' && r.metadata !== null ? r.metadata : {};
    return {
      content: r.content,
      createdAt: r.created_at,
      evasive: (meta.evasive as boolean | undefined) ?? false,
      score: meta.score as number | undefined,
    };
  });
}
