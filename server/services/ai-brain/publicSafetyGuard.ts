/**
 * PUBLIC SAFETY BOUNDARY GUARD
 * ============================
 * Trinity and HelpAI are NOT public-safety services. They never:
 *   - Call 911 / police / fire / EMS / ambulance
 *   - Dispatch emergency responders
 *   - Promise or guarantee an individual's safety, rescue, welfare, or
 *     a particular outcome
 *
 * A licensed human supervisor must always be in the loop. This is both a
 * legal necessity (public-duty doctrine, assumption-of-duty doctrine in
 * TX/AZ/NV/IL/NC and others — see stateRegulatoryKnowledgeBase.ts) and the
 * platform's deliberate design (panicAlertService.ts:65-74).
 *
 * This module enforces the rule at the LANGUAGE layer:
 *   - scanText()    — returns flags for any safety-guarantee or 911-claim phrasing
 *   - guardOutbound() — wraps Trinity's final response, rewriting offending
 *                     phrases and appending a corrective disclaimer
 *   - PUBLIC_SAFETY_DISCLAIMER — canonical short-form disclaimer for chat/SMS
 *
 * Companion enforcement layers:
 *   - server/services/ai-brain/trinityConscience.ts (Principle 8 — action layer)
 *   - server/services/trinity/trinityActionDispatcher.ts (intent-pattern refusal)
 *   - server/services/ops/panicAlertService.ts:65-74 (PANIC_LIABILITY_NOTICE)
 *
 * Change only with written legal approval — see TRINITY.md / CLAUDE.md.
 */

export const PUBLIC_SAFETY_DISCLAIMER =
  'I cannot call 911, dispatch emergency services, or guarantee anyone\'s ' +
  'safety. A human supervisor is always required. ' +
  'If anyone is in immediate danger, call 9-1-1 directly.';

// ── Detection patterns ──────────────────────────────────────────────────────
//
// Three regex helpers used throughout. Each matches the SUBJECT plus any
// following auxiliary verb so the next required token (verb or "safe") lines
// up against \s+.
//
//   SUBJ_I_WE       — "I", "I'll", "I will", "I've", "I am going to", "we'll", etc.
//   SUBJ_YOU_THEY   — "you", "you'll be", "you're", "you are", "they will be", etc.
//   SUBJ_THEY_BARE  — same as above but without the "be" auxiliary, for
//                     constructions where "be" is not part of the surface form
//                     ("you are in good hands").
//
// Patterns favor recall over precision — false positives are rewritten to
// `[redacted: ...]` which is recoverable; false negatives are a legal risk.
const SUBJ_I_WE = `(?:i|we)(?:'(?:ll|ve|m|re)|\\s+(?:will|can|may|am|are|have|'?ll|'?ve|'?m|'?re|am\\s+going\\s+to|are\\s+going\\s+to|'?m\\s+going\\s+to|going\\s+to))?`;
const SUBJ_YOU_THEY = `(?:you|he|she|they)(?:'(?:re|ll\\s+be|ve|s)|\\s+(?:are|'re|will\\s+be|'ll\\s+be|will|can|may|'?ve|are\\s+going\\s+to|'re\\s+going\\s+to))?`;
const SUBJ_YOU_THEY_BARE = `(?:you|he|she|they)(?:'(?:re|ve|s)|\\s+(?:are|'re|'?ve))?`;

// First-person 911 / dispatch claims. Trinity must NEVER imply she did or
// will do any of these. Allow up to two filler words (article / determiner)
// between the verb and the noun ("I dispatched the police", "I called local
// EMS"). Verbs use `\w*` to absorb tense variation (call/called/calling/calls).
const RESPONDER_NOUN = `(?:9-?1-?1|police|cops|sheriff|sapd|ambulance|paramedics?|ems|emts?|fire(?:fighters?|\\s+dept|\\s+department)?)`;
const DISPATCH_VERB = `(?:dispatch\\w*|sen[dt]\\w*|call\\w*|notif\\w*|contact\\w*|page\\w*|alert\\w*|reach\\w*\\s+out\\s+to)`;

const FIRST_PERSON_911_CLAIM: RegExp[] = [
  new RegExp(
    `\\b${SUBJ_I_WE}\\s+(?:already\\s+)?${DISPATCH_VERB}\\s+(?:\\w+\\s+){0,2}${RESPONDER_NOUN}\\b`,
    'i',
  ),
  new RegExp(
    `\\b${RESPONDER_NOUN}\\s+(?:has\\s+been|have\\s+been|are|is)\\s+(?:dispatched|notified|on\\s+(?:the|their)\\s+way|en\\s+route|coming|responding)\\b`,
    'i',
  ),
  /\bhelp\s+is\s+(?:on\s+(?:the|its)\s+way|coming|en\s+route)\b/i,
];

// Safety / outcome guarantees. Sourced from
// stateRegulatoryKnowledgeBase.ts:154 prohibitedLanguage and expanded for
// first-person Trinity speech.
const SAFETY_GUARANTEE: RegExp[] = [
  // "I/we guarantee/promise/assure your safety"
  new RegExp(
    `\\b${SUBJ_I_WE}\\s+(?:guarantee|promise|assure|ensure|swear)\\s+(?:your|his|her|their|the\\s+\\w+'s?)\\s+safety\\b`,
    'i',
  ),
  // "you/he/she/they (are|'re|'ll be|will be) safe (with|now|because|while)"
  new RegExp(
    `\\b${SUBJ_YOU_THEY}\\s+(?:completely\\s+|totally\\s+|absolutely\\s+)?safe\\s+(?:with|now|because|while)\\b`,
    'i',
  ),
  // "I'll keep / I will keep / I can keep / I'm going to keep you safe"
  // Also catches "I'll protect/guard/defend/shield you (safe?)"
  new RegExp(
    `\\b${SUBJ_I_WE}\\s+(?:keep|make|protect|guard|defend|shield)\\s+(?:you|him|her|them)(?:\\s+safe)?\\b`,
    'i',
  ),
  // "Nothing bad will happen"
  /\bnothing\s+bad\s+(?:will|can|shall|is\s+going\s+to)\s+happen\b/i,
  // "I/we guarantee no harm/injury/incident"
  new RegExp(
    `\\b${SUBJ_I_WE}\\s+(?:guarantee|promise)\\s+(?:no|that\\s+no)\\s+(?:harm|injury|incident)\\b`,
    'i',
  ),
  // "you're / you are in good hands" — uses BARE helper because there's no
  // "be" in the surface form.
  new RegExp(
    `\\b${SUBJ_YOU_THEY_BARE}\\s+in\\s+good\\s+hands\\b`,
    'i',
  ),
  // "I'll rescue / I will rescue / I can rescue you"
  new RegExp(
    `\\b${SUBJ_I_WE}\\s+(?:rescue|save|recover|extract)\\s+(?:you|him|her|them)\\b`,
    'i',
  ),
];

export interface SafetyScanFlag {
  category: 'first_person_911_claim' | 'safety_guarantee';
  match: string;
}

export interface SafetyScanResult {
  flagged: boolean;
  flags: SafetyScanFlag[];
}

/**
 * Pure scanner — does NOT mutate input. Use guardOutbound() to also rewrite.
 */
export function scanText(input: string): SafetyScanResult {
  const flags: SafetyScanFlag[] = [];
  if (!input || typeof input !== 'string') return { flagged: false, flags };
  for (const re of FIRST_PERSON_911_CLAIM) {
    const m = input.match(re);
    if (m) flags.push({ category: 'first_person_911_claim', match: m[0] });
  }
  for (const re of SAFETY_GUARANTEE) {
    const m = input.match(re);
    if (m) flags.push({ category: 'safety_guarantee', match: m[0] });
  }
  return { flagged: flags.length > 0, flags };
}

export interface GuardResult {
  text: string;
  rewrote: boolean;
  flags: SafetyScanFlag[];
  disclaimer: string | null;
}

/**
 * Outbound guard. If the text contains any prohibited phrasing, rewrite the
 * matching span with `[redacted: claim outside Trinity's authority]` AND
 * append the canonical PUBLIC_SAFETY_DISCLAIMER. We rewrite in-place rather
 * than dropping the message because callers (chat / voice / SMS) still need
 * a usable response — they just need a corrected one.
 *
 * Idempotent: running this twice on the same string is a no-op the second
 * time because the rewrite token doesn't match either pattern.
 */
export function guardOutbound(input: string): GuardResult {
  const scan = scanText(input);
  if (!scan.flagged) {
    return { text: input, rewrote: false, flags: [], disclaimer: null };
  }
  let rewritten = input;
  for (const re of [...FIRST_PERSON_911_CLAIM, ...SAFETY_GUARANTEE]) {
    rewritten = rewritten.replace(re, '[redacted: claim outside Trinity\'s authority]');
  }
  // Avoid duplicating the disclaimer if a caller already appended one.
  const alreadyHasDisclaimer = rewritten.includes('cannot call 911') && rewritten.includes('human supervisor');
  const finalText = alreadyHasDisclaimer
    ? rewritten
    : `${rewritten}\n\n${PUBLIC_SAFETY_DISCLAIMER}`;
  return {
    text: finalText,
    rewrote: true,
    flags: scan.flags,
    disclaimer: PUBLIC_SAFETY_DISCLAIMER,
  };
}
