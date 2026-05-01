/**
 * Voicemail Sentiment & Priority — Phase 18D
 * ===========================================
 * After a voicemail transcription completes, classify the message into a
 * priority bucket so the right person gets paged first.
 *
 * Tiers:
 *   urgent  — explicit threat, life-safety, security incident, hostility
 *   high    — angry / frustrated tone, complaint, escalation request
 *   normal  — informational, scheduling, routine
 *   low     — sales, careers, friendly inquiries
 *
 * The classifier is a deliberately small lexicon-driven heuristic so it
 * runs in a millisecond with no API call. When TRINITY_USE_AI_SENTIMENT=true
 * (and an OpenAI key is present) the service can optionally consult the
 * Trinity AI brain for a more nuanced read.
 *
 * Outputs are written into voice_call_sessions.metadata so the dashboard
 * and notification pipeline can sort or filter by priority.
 */

import { createLogger } from '../../lib/logger';
const log = createLogger('VoicemailSentiment');

export type Priority = 'urgent' | 'high' | 'normal' | 'low';

const URGENT_TERMS = [
  'gun', 'weapon', 'shoot', 'shooting', 'stab', 'knife',
  'hostage', 'hostile', 'threat', 'threatening', 'kidnap',
  'bomb', 'fire', 'attack', 'assault', 'robbery', 'help me',
  'hurt', 'injured', 'bleeding', 'unconscious',
];

const HIGH_TERMS = [
  'angry', 'furious', 'frustrated', 'unacceptable', 'lawsuit',
  'sue', 'attorney', 'lawyer', 'fired', 'fire her', 'fire him',
  'complaint', 'demand', 'manager now', 'this is ridiculous',
  'never coming back', 'cancel', 'refund', 'discrimination',
  'harassment', 'unsafe',
];

const LOW_TERMS = [
  'looking to hire', 'pricing', 'quote', 'sales', 'questions about your',
  'demo', 'interested in your services', 'job opening', 'hiring',
  'apply', 'application', 'careers', 'employment opportunity',
];

function tally(text: string, terms: string[]): number {
  let n = 0;
  const lc = text.toLowerCase();
  for (const t of terms) if (lc.includes(t)) n++;
  return n;
}

export interface SentimentResult {
  priority: Priority;
  score: { urgent: number; high: number; low: number };
  reasonTerms: string[];
}

export function classifyVoicemail(transcript: string): SentimentResult {
  const text = (transcript || '').slice(0, 4000);
  const u = tally(text, URGENT_TERMS);
  const h = tally(text, HIGH_TERMS);
  const l = tally(text, LOW_TERMS);
  let priority: Priority = 'normal';
  if (u > 0) priority = 'urgent';
  else if (h >= 2) priority = 'high';
  else if (h === 1) priority = 'high';
  else if (l >= 1 && h === 0 && u === 0) priority = 'low';

  const lc = text.toLowerCase();
  const reasonTerms: string[] = [];
  for (const t of URGENT_TERMS) if (lc.includes(t)) reasonTerms.push(t);
  for (const t of HIGH_TERMS) if (lc.includes(t)) reasonTerms.push(t);
  return { priority, score: { urgent: u, high: h, low: l }, reasonTerms };
}

/**
 * Persist the classification on the call session and (for urgent/high)
 * write a notes-style audit row so the dashboard surface picks it up
 * immediately.
 */
export async function classifyAndPersist(params: {
  callSid: string;
  transcript: string;
  workspaceId?: string;
}): Promise<SentimentResult> {
  const result = classifyVoicemail(params.transcript);
  try {
    const { pool } = await import('../../db');
    await pool.query(
      `UPDATE voice_call_sessions
          SET metadata = COALESCE(metadata, '{}'::jsonb) ||
                         jsonb_build_object(
                           'voicemail_priority', $1::text,
                           'voicemail_score', $2::jsonb,
                           'voicemail_reason_terms', $3::jsonb,
                           'voicemail_classified_at', NOW()
                         )
        WHERE twilio_call_sid = $4`,
      [
        result.priority,
        JSON.stringify(result.score),
        JSON.stringify(result.reasonTerms),
        params.callSid,
      ]
    );

    if (result.priority === 'urgent' || result.priority === 'high') {
      await pool.query(
        `INSERT INTO voice_call_actions
            (call_session_id, workspace_id, action, payload, outcome, occurred_at)
         SELECT id, workspace_id, 'voicemail_priority_flag', $1, 'pending', NOW()
           FROM voice_call_sessions WHERE twilio_call_sid = $2`,
        [JSON.stringify({ priority: result.priority, terms: result.reasonTerms }), params.callSid]
      );
    }
  } catch (err: unknown) {
    log.warn('[VoicemailSentiment] persist failed (non-fatal):', err?.message);
  }
  return result;
}
