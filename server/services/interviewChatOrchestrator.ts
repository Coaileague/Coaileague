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
  }): Promise<unknown> {
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
    const chatroomRow = result.rows[0];

    // ── Wave 6 / Task 2: Also create a temporalChatSessions row (G-3) ────────
    // The temporalSession gives the candidate a shareable join URL with no
    // permanent user account required. The interview_chatrooms row is preserved
    // intact — the temporal session is additive and links to the same conversation.
    let temporalSessionToken: string | null = null;
    let temporalJoinUrl: string | null = null;
    try {
      const { randomBytes } = await import('crypto');
      const { db } = await import('../db');
      const { temporalChatSessions } = await import('../../shared/schema');

      // Fetch candidate name for the guest record
      const candidate = await pool.query(
        `SELECT first_name, last_name, COALESCE(position_applied, position_type) AS position_type
         FROM interview_candidates WHERE id = $1 LIMIT 1`,
        [params.candidateId]
      ).then(r => r.rows[0]).catch(() => null);

      const guestName = candidate
        ? `${candidate.first_name || ''} ${candidate.last_name || ''}`.trim()
        : 'Candidate';

      const accessToken = randomBytes(32).toString('hex'); // 64-char secure token
      const expiresAt = new Date(Date.now() + 90 * 60_000); // 90-minute interview window

      await db.insert(temporalChatSessions).values({
        workspaceId: params.workspaceId,
        purpose: 'interview',
        accessToken,
        expiresAt,
        maxMessages: 200,
        hostUserId: params.humanCopilotUserId || 'system',
        guestName,
        guestEmail: null,
        guestMetadata: {
          candidateId: params.candidateId,
          positionType: candidate?.position_type || null,
          chatroomId: chatroomRow?.id,
          source: 'interview_chat_orchestrator',
        },
        conversationId: null, // interview_chatrooms uses its own chat system
        status: 'active',
      });

      temporalSessionToken = accessToken;
      temporalJoinUrl = `${process.env.APP_BASE_URL || 'https://app.coaileague.com'}/guest/interview/${accessToken}`;
      log.info('[InterviewOrchestrator] Temporal session created for candidate', {
        candidateId: params.candidateId,
        accessToken: accessToken.slice(0, 8) + '...',
        expiresAt: expiresAt.toISOString(),
      });
    } catch (tsErr: unknown) {
      log.warn('[InterviewOrchestrator] Temporal session creation failed (non-fatal):', tsErr instanceof Error ? tsErr.message : String(tsErr));
    }

    return {
      ...chatroomRow,
      temporalSessionToken,
      temporalJoinUrl,
    };
  }

  async startInterview(chatroomId: string): Promise<void> {
    const room = await this.getChatroom(chatroomId);
    if (!room) throw new Error('Chatroom not found');

    const candidate = await this.getCandidate(room.candidate_id);
    const questions = room.questions_asked as unknown[];

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

    const questions = room.questions_asked as unknown[];
    const idx = room.current_question_index || 0;
    const currentQ = questions[idx];

    if (!currentQ) {
      await this.completeInterview(chatroomId, room.responses_received as unknown[]);
      return;
    }

    // Score the response
    const score = await this.scoreResponse(responseText, currentQ);

    const responses = [
      ...(room.responses_received as unknown[]),
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

  async completeInterview(chatroomId: string, responses: unknown[]): Promise<void> {
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

  async sendTrinityMessage(chatroomId: string, workspaceId: string, text: string): Promise<unknown> {
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

  async sendCandidateMessage(chatroomId: string, workspaceId: string, candidateId: string, text: string): Promise<unknown> {
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

  /**
   * scoreInterviewResponse — Wave 6 / Task 2 (G-2)
   * Replaces the naive keyword-counter with a full AI-powered 6-dimension rubric.
   * Uses the same scoring framework as trinityScreeningService.screenCandidate():
   *   license_eligibility, experience_fit, reliability_signals,
   *   liability_indicators, operational_fit, speed_to_deploy
   * Injects Texas OC Chapter 1702 knowledge for jurisdiction-aware scoring.
   *
   * Vision upgrade: if attachmentUrl is present in the message (e.g., a guard
   * card photo), passes the image to Gemini's multimodal endpoint to extract
   * and verify expiration date and DPS license level (Level II/III).
   */
  private async scoreInterviewResponse(
    responseText: string,
    question: unknown,
    candidateContext?: {
      positionType?: string;
      stateJurisdiction?: string;
      attachmentUrl?: string;  // Guard card / ID image URL for vision verification
    }
  ): Promise<{
    score: number;
    flags: string[];
    assessment: string;
    dimensions?: Record<string, { score: number; notes: string }>;
    visionVerification?: Record<string, unknown>;
  }> {
    const q = question as { question_text?: string; category?: string; scoring_criteria?: Record<string, unknown> };
    const questionText = q.question_text || 'Interview question';
    const isTexas = (candidateContext?.stateJurisdiction || 'TX') === 'TX';
    const isArmed = candidateContext?.positionType?.includes('armed') ?? false;

    // ── Vision verification (guard card / ID image) ───────────────────────
    let visionVerification: Record<string, unknown> | undefined;
    if (candidateContext?.attachmentUrl) {
      try {
        const { UnifiedGeminiClient } = await import('./ai-brain/providers/geminiClient');
        const ai = new UnifiedGeminiClient();

        const imgRes = await fetch(candidateContext.attachmentUrl);
        if (imgRes.ok) {
          const imgBuffer = Buffer.from(await imgRes.arrayBuffer());
          const base64Image = imgBuffer.toString('base64');
          const mimeType = candidateContext.attachmentUrl.match(/\.png/i) ? 'image/png' : 'image/jpeg';

          const visionResult = await ai.generateContent({
            prompt: `You are a Texas DPS security license verification expert.
Analyze this document image and extract:
1. License type (Level II Non-Commissioned / Level III Commissioned / Armed / Other)
2. License number
3. Expiration date (exact date)
4. Name on license
5. Status: VALID (not expired, not denied/suspended) or INVALID
6. Any flags (expired, approaching expiry within 30 days, armed endorsement present)

Return ONLY valid JSON:
{
  "licenseType": "...",
  "licenseNumber": "...",
  "expirationDate": "YYYY-MM-DD or null",
  "nameOnLicense": "...",
  "status": "VALID|INVALID|UNREADABLE",
  "isArmedEndorsement": false,
  "flags": [],
  "confidence": 0.0
}`,
            imageParts: [{ inlineData: { data: base64Image, mimeType } }],
          }).catch(() => null);

          if (visionResult) {
            try {
              const clean = (typeof visionResult === 'string' ? visionResult : JSON.stringify(visionResult))
                .replace(/```json|```/g, '').trim();
              visionVerification = JSON.parse(clean);
              log.info('[InterviewOrchestrator] Vision verification complete', { status: visionVerification?.status });
            } catch {
              visionVerification = { status: 'UNREADABLE', raw: String(visionResult).slice(0, 200) };
            }
          }
        }
      } catch (visionErr: unknown) {
        log.warn('[InterviewOrchestrator] Vision verification failed (non-fatal):', visionErr instanceof Error ? visionErr.message : String(visionErr));
      }
    }

    // ── AI 6-dimension rubric scoring ────────────────────────────────────
    try {
      const { UnifiedGeminiClient } = await import('./ai-brain/providers/geminiClient');
      const ai = new UnifiedGeminiClient();

      const texasLicensing = isTexas ? `
TEXAS LICENSING CONTEXT (OC Chapter 1702):
- Unarmed officers need Level II Non-Commissioned Security Officer registration
- Armed officers need Level III Commissioned Security Officer license
- Pre-license unarmed work allowed if TOPS shows Licensed or Substantially Complete Application within 48hr
- Armed pre-license: NEVER allowed under any circumstance
- Denied or Suspended TOPS status = automatic disqualifier` : '';

      const visionContext = visionVerification
        ? `\nGUARD CARD VISION SCAN: ${JSON.stringify(visionVerification)}`
        : '';

      const prompt = `You are Trinity, scoring a ${isArmed ? 'ARMED' : 'UNARMED'} security officer interview response.
${texasLicensing}${visionContext}

INTERVIEW QUESTION: "${questionText}"
CANDIDATE RESPONSE: "${responseText.slice(0, 2000)}"

Score this response across 6 dimensions. Each dimension uses a 0-10 scale.
Return ONLY valid JSON with no preamble:
{
  "dimensions": {
    "license_eligibility":   { "score": 0-10, "notes": "..." },
    "experience_fit":        { "score": 0-10, "notes": "..." },
    "reliability_signals":   { "score": 0-10, "notes": "..." },
    "liability_indicators":  { "score": 0-10, "notes": "..." },
    "operational_fit":       { "score": 0-10, "notes": "..." },
    "speed_to_deploy":       { "score": 0-10, "notes": "..." }
  },
  "composite_score": 0-10,
  "flags": ["strong_answer"|"weak_answer"|"license_issue"|"availability_concern"|"liability_flag"],
  "assessment": "One clear sentence summarizing this response."
}`;

      const raw = await ai.generateContent({ prompt });
      const text = typeof raw === 'string' ? raw : (raw as Record<string, unknown>)?.text as string ?? '';
      const clean = text.replace(/```json|```/g, '').trim();
      const parsed = JSON.parse(clean) as {
        dimensions: Record<string, { score: number; notes: string }>;
        composite_score: number;
        flags: string[];
        assessment: string;
      };

      return {
        score: Math.min(10, Math.max(0, parsed.composite_score || 5)),
        flags: parsed.flags || [],
        assessment: parsed.assessment || 'Response evaluated.',
        dimensions: parsed.dimensions,
        visionVerification,
      };
    } catch (aiErr: unknown) {
      log.warn('[InterviewOrchestrator] AI scoring failed — fallback to keyword score:', aiErr instanceof Error ? aiErr.message : String(aiErr));
      // Keyword fallback (preserves original logic as safety net)
      const text = responseText.toLowerCase();
      const criteria = (q.scoring_criteria || {}) as Record<string, unknown>;
      const keywords = (criteria.keywords as string[]) || [];
      const minWords = (criteria.min_words as number) || 10;
      const wordCount = responseText.trim().split(/\s+/).length;
      const kScore = keywords.length > 0 ? (keywords.filter(k => text.includes(k.toLowerCase())).length / keywords.length) * 5 : 5;
      const lScore = Math.min((wordCount / Math.max(minWords, 10)) * 5, 5);
      const score = Math.min(Math.round((kScore + lScore) * 10) / 10, 10);
      const flags: string[] = [];
      if (wordCount < 5) flags.push('very_short');
      if (score >= 8) flags.push('strong_answer');
      if (score < 4) flags.push('weak_answer');
      return { score, flags, assessment: score >= 6 ? 'Adequate response.' : 'Limited response.' };
    }
  }

  // Legacy alias — internal callers that use scoreResponse still work
  private async scoreResponse(responseText: string, question: unknown): Promise<{ score: number; flags: string[]; assessment: string }> {
    return this.scoreInterviewResponse(responseText, question);
  }
}

export const interviewChatOrchestrator = InterviewChatOrchestrator.getInstance();
