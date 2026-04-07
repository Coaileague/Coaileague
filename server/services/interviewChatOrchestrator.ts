import { pool } from '../db';
import { createLogger } from '../lib/logger';

const log = createLogger('InterviewChatOrchestrator');

const TRINITY_ACTOR_ID = 'trinity-system-actor-000000000000';

export class InterviewChatOrchestrator {
  private static instance: InterviewChatOrchestrator;

  static getInstance(): InterviewChatOrchestrator {
    if (!InterviewChatOrchestrator.instance) {
      InterviewChatOrchestrator.instance = new InterviewChatOrchestrator();
    }
    return InterviewChatOrchestrator.instance;
  }

  async createChatroom(params: {
    workspaceId: string;
    candidateId: string;
    sessionId?: string;
    humanCopilotUserId?: string;
    roomType?: string;
  }): Promise<any> {
    const questions = await this.getDefaultQuestions(params.workspaceId);
    const result = await pool.query(
      `INSERT INTO interview_chatrooms
       (workspace_id, candidate_id, session_id, human_copilot_user_id,
        room_type, status, questions_asked, trinity_active)
       VALUES ($1, $2, $3, $4, $5, 'pending', $6, true)
       RETURNING *`,
      [
        params.workspaceId,
        params.candidateId,
        params.sessionId || null,
        params.humanCopilotUserId || null,
        params.roomType || 'structured_interview',
        JSON.stringify(questions),
      ]
    );
    return result.rows[0];
  }

  async startInterview(chatroomId: string): Promise<void> {
    const room = await this.getChatroom(chatroomId);
    if (!room) throw new Error('Chatroom not found');

    const candidate = await this.getCandidate(room.candidate_id);
    const questions = room.questions_asked as any[];

    await pool.query(
      `UPDATE interview_chatrooms
       SET status = 'active', started_at = NOW(), current_question_index = 0
       WHERE id = $1`,
      [chatroomId]
    );

    const firstQ = questions[0]?.question_text || 'Tell me a little about yourself and why you are interested in this position.';

    await this.sendTrinityMessage(chatroomId, room.workspace_id, `Hello ${candidate?.full_name || 'there'}!

I'm Trinity, the AI assistant conducting your initial screening interview today for the ${candidate?.position_applied || 'position'} role.

This interview should take about 10-15 minutes. I'll ask you several questions and your responses will be reviewed by our hiring team.

Please answer as naturally and completely as you can — there are no trick questions.

Let's begin: ${firstQ}`);

    if (room.human_copilot_user_id) {
      await this.sendCopilotWhisper(chatroomId, room.workspace_id, `Interview started.
Candidate: ${candidate?.full_name || 'Unknown'}
Position: ${candidate?.position_applied || 'Unknown'}
Questions queued: ${questions.length}
Status: Awaiting first response.`);
    }
  }

  async processCandidateResponse(chatroomId: string, responseText: string): Promise<void> {
    const room = await this.getChatroom(chatroomId);
    if (!room || room.status !== 'active') return;

    const questions = room.questions_asked as any[];
    const idx = room.current_question_index || 0;
    const currentQ = questions[idx];

    if (!currentQ) {
      await this.completeInterview(chatroomId, room.responses_received as any[]);
      return;
    }

    // Score the response
    const score = await this.scoreResponse(responseText, currentQ);

    const responses = [
      ...(room.responses_received as any[]),
      {
        questionId: currentQ.id,
        questionText: currentQ.question_text,
        response: responseText,
        score: score.score,
        flags: score.flags,
        scoredAt: new Date().toISOString(),
      },
    ];

    const nextIdx = idx + 1;

    await pool.query(
      `UPDATE interview_chatrooms
       SET current_question_index = $1, responses_received = $2
       WHERE id = $3`,
      [nextIdx, JSON.stringify(responses), chatroomId]
    );

    // Co-pilot whisper
    if (room.human_copilot_user_id) {
      await this.sendCopilotWhisper(chatroomId, room.workspace_id,
        `Score for Q${idx + 1}: ${score.score}/10\nFlags: ${score.flags.join(', ') || 'None'}\nAssessment: ${score.assessment}`
      );
    }

    if (nextIdx >= questions.length) {
      await this.completeInterview(chatroomId, responses);
    } else {
      const nextQ = questions[nextIdx];
      await this.sendTrinityMessage(chatroomId, room.workspace_id, nextQ.question_text);
    }
  }

  async completeInterview(chatroomId: string, responses: any[]): Promise<void> {
    const room = await this.getChatroom(chatroomId);
    if (!room) return;

    const candidate = await this.getCandidate(room.candidate_id);
    const scores = responses.map((r) => r.score || 5);
    const avg = scores.reduce((a, b) => a + b, 0) / Math.max(scores.length, 1);
    const overallScore = Math.round(avg * 10);

    const recommendation =
      overallScore >= 80 ? 'strong_hire' :
      overallScore >= 65 ? 'hire' :
      overallScore >= 50 ? 'maybe' : 'no_hire';

    await pool.query(
      `UPDATE interview_chatrooms SET
         status = 'completed',
         overall_score = $1,
         trinity_recommendation = $2,
         completed_at = NOW(),
         responses_received = $3
       WHERE id = $4`,
      [overallScore, recommendation, JSON.stringify(responses), chatroomId]
    );

    await this.sendTrinityMessage(chatroomId, room.workspace_id,
      `Thank you ${candidate?.full_name || 'for your time'} for completing the interview!

Your responses have been recorded and will be reviewed by our hiring team. You can expect to hear back within 2-3 business days.

We appreciate your interest in joining the team!`
    );

    // Update candidate stage (awaited; non-blocking failure handled in try)
    try {
      await pool.query(
        `UPDATE interview_candidates SET stage = 'awaiting_decision' WHERE id = $1`,
        [room.candidate_id]
      );
    } catch (err) {
      log.warn('[interviewChatOrchestrator] Candidate stage update failed (non-fatal):', err);
    }

    log.info(`Interview completed chatroom=${chatroomId} score=${overallScore} rec=${recommendation}`);
  }

  async sendTrinityMessage(chatroomId: string, workspaceId: string, text: string): Promise<any> {
    const result = await pool.query(
      `INSERT INTO interview_messages
       (chatroom_id, workspace_id, sender_type, sender_id, message_text,
        is_visible_to_candidate, sent_at)
       VALUES ($1, $2, 'trinity', $3, $4, true, NOW())
       RETURNING *`,
      [chatroomId, workspaceId, TRINITY_ACTOR_ID, text.trim()]
    );
    return result.rows[0];
  }

  async sendCopilotWhisper(chatroomId: string, workspaceId: string, text: string): Promise<void> {
    await pool.query(
      `INSERT INTO interview_messages
       (chatroom_id, workspace_id, sender_type, sender_id, message_text,
        is_visible_to_candidate, sent_at)
       VALUES ($1, $2, 'human_copilot_whisper', 'trinity-copilot', $3, false, NOW())`,
      [chatroomId, workspaceId, text.trim()]
    );
  }

  async sendCandidateMessage(chatroomId: string, workspaceId: string, candidateId: string, text: string): Promise<any> {
    const result = await pool.query(
      `INSERT INTO interview_messages
       (chatroom_id, workspace_id, sender_type, sender_id, message_text,
        is_visible_to_candidate, sent_at)
       VALUES ($1, $2, 'candidate', $3, $4, true, NOW())
       RETURNING *`,
      [chatroomId, workspaceId, candidateId, text.trim()]
    );
    return result.rows[0];
  }

  async getMessages(chatroomId: string, includeWhispers = false): Promise<any[]> {
    const result = await pool.query(
      `SELECT * FROM interview_messages
       WHERE chatroom_id = $1
         AND ($2 OR is_visible_to_candidate = true)
       ORDER BY sent_at ASC`,
      [chatroomId, includeWhispers]
    );
    return result.rows;
  }

  async getChatroom(chatroomId: string): Promise<any | null> {
    const result = await pool.query(
      `SELECT * FROM interview_chatrooms WHERE id = $1`,
      [chatroomId]
    );
    return result.rows[0] || null;
  }

  async getChatroomByToken(token: string): Promise<any | null> {
    const result = await pool.query(
      `SELECT * FROM interview_chatrooms WHERE access_token = $1`,
      [token]
    );
    return result.rows[0] || null;
  }

  async getCandidate(candidateId: string): Promise<any | null> {
    const result = await pool.query(
      `SELECT * FROM interview_candidates WHERE id = $1`,
      [candidateId]
    );
    return result.rows[0] || null;
  }

  private async getDefaultQuestions(workspaceId: string): Promise<any[]> {
    // Try workspace-specific questions first
    const result = await pool.query(
      `SELECT id, question_text, scoring_criteria, question_order, category
       FROM interview_questions_bank
       WHERE (workspace_id = $1 OR workspace_id IS NULL)
         AND is_active = true
       ORDER BY question_order, created_at
       LIMIT 8`,
      [workspaceId]
    ).catch(() => ({ rows: [] }));

    if (result.rows.length > 0) return result.rows;

    // Default questions
    return [
      { id: 'q1', question_text: 'Tell me about yourself and your security experience.', question_order: 1, scoring_criteria: { keywords: ['experience', 'training', 'professional'], min_words: 30 } },
      { id: 'q2', question_text: 'Why are you interested in working in security?', question_order: 2, scoring_criteria: { keywords: ['protect', 'safety', 'service'], min_words: 20 } },
      { id: 'q3', question_text: 'Describe a time you had to handle a difficult or confrontational situation. What did you do?', question_order: 3, scoring_criteria: { keywords: ['calm', 'professional', 'de-escalate', 'reported'], min_words: 40 } },
      { id: 'q4', question_text: 'Are you comfortable working overnight shifts or weekends?', question_order: 4, scoring_criteria: { keywords: ['yes', 'available', 'flexible', 'night', 'weekend'], min_words: 10 } },
      { id: 'q5', question_text: 'Do you hold a valid security officer license? If so, in which state(s)?', question_order: 5, scoring_criteria: { keywords: ['license', 'licensed', 'state', 'valid', 'BSIS'], min_words: 5 } },
      { id: 'q6', question_text: 'What would you do if you witnessed a co-worker violating company policy?', question_order: 6, scoring_criteria: { keywords: ['report', 'supervisor', 'management', 'document', 'protocol'], min_words: 25 } },
    ];
  }

  private async scoreResponse(responseText: string, question: any): Promise<{ score: number; flags: string[]; assessment: string }> {
    const text = responseText.toLowerCase();
    const criteria = question.scoring_criteria || {};
    const keywords: string[] = criteria.keywords || [];
    const minWords: number = criteria.min_words || 10;

    const wordCount = responseText.trim().split(/\s+/).length;
    const keywordsMatched = keywords.filter((k: string) => text.includes(k.toLowerCase())).length;
    const keywordScore = keywords.length > 0 ? (keywordsMatched / keywords.length) * 5 : 5;
    const lengthScore = Math.min((wordCount / Math.max(minWords, 10)) * 5, 5);
    const score = Math.min(Math.round((keywordScore + lengthScore) * 10) / 10, 10);

    const flags: string[] = [];
    if (wordCount < 5) flags.push('very_short');
    if (wordCount < minWords / 2) flags.push('insufficient_detail');
    if (score >= 8) flags.push('strong_answer');
    if (score < 4) flags.push('weak_answer');

    const assessment =
      score >= 8 ? 'Strong, detailed response demonstrating relevant experience.' :
      score >= 6 ? 'Adequate response with room for elaboration.' :
      score >= 4 ? 'Limited response — may need follow-up.' :
      'Very brief — candidate may need prompting.';

    return { score, flags, assessment };
  }
}

export const interviewChatOrchestrator = InterviewChatOrchestrator.getInstance();
