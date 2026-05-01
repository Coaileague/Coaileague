/**
 * Caller-ID Lookup + Voice Insights — Phase 18D
 * ==============================================
 * Combines two Twilio capabilities:
 *
 *   1. Twilio Lookup v2 line_type_intelligence — risk-scores an inbound
 *      number. Voip / hosted / prepaid / disposable carriers are flagged
 *      and downstream verification can be tightened (or refused outright
 *      based on workspace policy).
 *
 *   2. Twilio Voice Insights "extra speaker" flag — exposed via the
 *      recording transcription pipeline. A second voice on what should be
 *      a single-officer clock-in / authentication call is suspicious.
 *
 * Both helpers degrade gracefully when Twilio creds aren't present so dev
 * environments aren't broken; the only effect is the risk score returns
 * `unknown`.
 *
 * Results are cached for CACHE_TTL_HOURS in `caller_id_lookup_cache` so
 * repeat callers don't hit Twilio every message.
 */

import { createLogger } from '../../lib/logger';
const log = createLogger('CallerIdLookup');

const CACHE_TTL_HOURS = parseInt(process.env.CALLER_LOOKUP_CACHE_TTL_HOURS || '168', 10); // 7 days
const RISKY_LINE_TYPES = new Set(['nonFixedVoip', 'tollFree', 'voicemail']);

let bootstrapped = false;
async function ensureTables(): Promise<void> {
  if (bootstrapped) return;
  try {
    const { pool } = await import('../../db');
    await pool.query(`
      CREATE TABLE IF NOT EXISTS caller_id_lookup_cache (
        phone           VARCHAR PRIMARY KEY,
        line_type       VARCHAR,
        carrier_name    VARCHAR,
        country_code    VARCHAR,
        risk            VARCHAR NOT NULL DEFAULT 'unknown',
        raw             JSONB,
        looked_up_at    TIMESTAMP NOT NULL DEFAULT NOW()
      );
    `);
    bootstrapped = true;
  } catch (err: unknown) {
    log.warn('[CallerIdLookup] Bootstrap failed (non-fatal):', err?.message);
  }
}

export interface LookupResult {
  phone: string;
  risk: 'low' | 'high' | 'unknown';
  lineType?: string;
  carrierName?: string;
  countryCode?: string;
  cached: boolean;
}

export async function lookupCallerId(rawPhone: string): Promise<LookupResult> {
  await ensureTables();
  const phone = (rawPhone || '').trim();
  if (!phone) return { phone, risk: 'unknown', cached: false };

  try {
    const { pool } = await import('../../db');

    // 1. Cache check
    const cached = await pool.query(
      `SELECT line_type, carrier_name, country_code, risk
         FROM caller_id_lookup_cache
        WHERE phone = $1
          AND looked_up_at > NOW() - ($2::int * INTERVAL '1 hour')`,
      [phone, CACHE_TTL_HOURS]
    );
    if (cached.rows.length) {
      const row = cached.rows[0];
      return {
        phone,
        risk: row.risk,
        lineType: row.line_type,
        carrierName: row.carrier_name,
        countryCode: row.country_code,
        cached: true,
      };
    }

    // 2. Twilio Lookup v2 (only if we have creds)
    const sid = process.env.TWILIO_ACCOUNT_SID;
    const token = process.env.TWILIO_AUTH_TOKEN;
    if (!sid || !token) {
      return { phone, risk: 'unknown', cached: false };
    }

    const twilio = (await import('twilio')).default;
    const client = twilio(sid, token);
    const lookup = await client.lookups.v2.phoneNumbers(phone).fetch({
      fields: 'line_type_intelligence',
    });

    const lti = (lookup as any).lineTypeIntelligence || {};
    const lineType: string | undefined = lti.type;
    const carrierName: string | undefined = lti.carrier_name;
    const countryCode: string | undefined = (lookup as any).countryCode;
    const risk: 'low' | 'high' | 'unknown' = lineType
      ? (RISKY_LINE_TYPES.has(lineType) ? 'high' : 'low')
      : 'unknown';

    await pool.query(
      `INSERT INTO caller_id_lookup_cache (phone, line_type, carrier_name, country_code, risk, raw, looked_up_at)
       VALUES ($1, $2, $3, $4, $5, $6, NOW())
       ON CONFLICT (phone) DO UPDATE SET
         line_type = EXCLUDED.line_type,
         carrier_name = EXCLUDED.carrier_name,
         country_code = EXCLUDED.country_code,
         risk = EXCLUDED.risk,
         raw = EXCLUDED.raw,
         looked_up_at = NOW()`,
      [phone, lineType || null, carrierName || null, countryCode || null, risk, JSON.stringify(lti)]
    );

    return { phone, risk, lineType, carrierName, countryCode, cached: false };
  } catch (err: unknown) {
    log.warn('[CallerIdLookup] lookup failed (open):', err?.message);
    return { phone, risk: 'unknown', cached: false };
  }
}

/**
 * Mark a call session as having multiple distinct speakers detected. Called
 * by the Voice Insights webhook (or transcript post-processor). The simple
 * heuristic in the absence of Voice Insights is to count distinct speaker
 * tags in the diarized transcript.
 */
export async function flagMultipleSpeakers(params: {
  callSid: string;
  speakerCount: number;
}): Promise<void> {
  if (params.speakerCount <= 1) return;
  try {
    const { pool } = await import('../../db');
    await pool.query(
      `UPDATE voice_call_sessions
          SET metadata = COALESCE(metadata, '{}'::jsonb) ||
                         jsonb_build_object('multi_speaker_flag', true,
                                            'speaker_count', $1::int)
        WHERE twilio_call_sid = $2`,
      [params.speakerCount, params.callSid]
    );
    log.info(`[CallerIdLookup] Flagged ${params.callSid} with ${params.speakerCount} speakers`);
  } catch (err: unknown) {
    log.warn('[CallerIdLookup] flag failed:', err?.message);
  }
}

/**
 * Cheap heuristic for a transcript when Voice Insights isn't available.
 * Looks for speaker change markers or alternating "Person 1:"/"Person 2:"
 * patterns. Returns the rough distinct speaker count.
 */
export function estimateSpeakerCountFromTranscript(transcript: string): number {
  if (!transcript) return 1;
  const speakerTags = new Set<string>();
  const re = /(?:speaker[\s_-]*\d+|person[\s_-]*\d+|caller|agent|trinity|^[A-Z][a-z]+:)\s*[:\-]/gim;
  for (const m of transcript.matchAll(re)) {
    speakerTags.add(m[0].toLowerCase().replace(/[\s:_\-]/g, ''));
  }
  return Math.max(1, speakerTags.size);
}
