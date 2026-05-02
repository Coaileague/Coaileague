/**
 * SECURITY TESTS — Public Safety Boundary Guard
 *
 * Trinity / HelpAI must never call 911, dispatch emergency responders, or
 * guarantee anyone's safety. These tests verify the language-layer filter
 * (`publicSafetyGuard.ts`) and the action-layer principle in
 * `trinityConscience.ts`.
 *
 * Companion enforcement (verified separately):
 *   - server/services/trinity/trinityActionDispatcher.ts (intent refusal)
 *   - server/services/ops/panicAlertService.ts (PANIC_LIABILITY_NOTICE)
 */

import { describe, it, expect } from 'vitest';
import {
  scanText,
  guardOutbound,
  PUBLIC_SAFETY_DISCLAIMER,
} from '../../server/services/ai-brain/publicSafetyGuard';

describe('publicSafetyGuard.scanText — first-person 911 claims', () => {
  it.each([
    "I called 911",
    "I've already called 911",
    "I will call the police",
    "I dispatched the ambulance",
    "I notified EMS",
    "Police are on the way",
    "Help is on the way",
    "Paramedics have been dispatched",
    "Fire department is en route",
    "We've called 911",
  ])('flags first-person 911 claim: %s', (input) => {
    const result = scanText(input);
    expect(result.flagged).toBe(true);
    expect(result.flags.some((f) => f.category === 'first_person_911_claim')).toBe(true);
  });

  it('does NOT flag instructing the human to call 911', () => {
    // "Call 9-1-1 directly" is the APPROVED phrasing — Trinity tells the
    // human to do it themselves. Must not be flagged.
    expect(scanText('If you are in danger, call 9-1-1 directly.').flagged).toBe(false);
    expect(scanText('Please call 911 immediately.').flagged).toBe(false);
  });
});

describe('publicSafetyGuard.scanText — safety guarantees', () => {
  it.each([
    "I guarantee your safety",
    "We promise your safety",
    "We ensure their safety",
    "You'll be safe with me",
    "You are completely safe with us",
    "I'll keep you safe",
    "We will protect you",
    "Nothing bad will happen",
    "You are in good hands with Trinity",
    "I'll rescue you",
  ])('flags safety guarantee: %s', (input) => {
    const result = scanText(input);
    expect(result.flagged).toBe(true);
    expect(result.flags.some((f) => f.category === 'safety_guarantee')).toBe(true);
  });

  it('does NOT flag observe-and-report language', () => {
    // Approved phrasing from stateRegulatoryKnowledgeBase.ts
    expect(scanText('Our role is to observe, deter, and report.').flagged).toBe(false);
    expect(scanText('I will document the incident and notify your supervisor.').flagged).toBe(false);
  });
});

describe('publicSafetyGuard.guardOutbound — rewrite + disclaimer', () => {
  it('passes clean text through unchanged', () => {
    const clean = "I'll notify your supervisor about the incident.";
    const result = guardOutbound(clean);
    expect(result.rewrote).toBe(false);
    expect(result.text).toBe(clean);
    expect(result.flags).toEqual([]);
    expect(result.disclaimer).toBeNull();
  });

  it('rewrites a 911-claim and appends the disclaimer', () => {
    const dirty = "Don't worry, I called 911 and help is on the way.";
    const result = guardOutbound(dirty);
    expect(result.rewrote).toBe(true);
    expect(result.text).not.toMatch(/I called 911/);
    expect(result.text).toContain('[redacted: claim outside Trinity\'s authority]');
    expect(result.text).toContain(PUBLIC_SAFETY_DISCLAIMER);
    expect(result.flags.length).toBeGreaterThan(0);
  });

  it('rewrites a safety guarantee and appends the disclaimer', () => {
    const dirty = "I guarantee your safety while you complete the round.";
    const result = guardOutbound(dirty);
    expect(result.rewrote).toBe(true);
    expect(result.text).not.toMatch(/guarantee your safety/i);
    expect(result.text).toContain(PUBLIC_SAFETY_DISCLAIMER);
  });

  it('is idempotent — running guardOutbound twice does not double-disclaim', () => {
    const dirty = "I dispatched the police.";
    const once = guardOutbound(dirty);
    const twice = guardOutbound(once.text);
    expect(twice.rewrote).toBe(false);
    expect(twice.text).toBe(once.text);
    // Disclaimer must appear exactly once.
    const disclaimerCount = (twice.text.match(/cannot call 911/g) || []).length;
    expect(disclaimerCount).toBe(1);
  });

  it('handles empty / non-string input safely', () => {
    expect(guardOutbound('').rewrote).toBe(false);
    expect(scanText('').flagged).toBe(false);
    // @ts-expect-error — runtime tolerance
    expect(scanText(null).flagged).toBe(false);
  });
});

describe('PUBLIC_SAFETY_DISCLAIMER content', () => {
  it('mentions 911 cannot-call', () => {
    expect(PUBLIC_SAFETY_DISCLAIMER).toMatch(/cannot call 9-?1-?1/i);
  });
  it('mentions human supervisor required', () => {
    expect(PUBLIC_SAFETY_DISCLAIMER).toMatch(/human supervisor/i);
  });
  it('directs to call 9-1-1 directly in danger', () => {
    expect(PUBLIC_SAFETY_DISCLAIMER).toMatch(/call 9-1-1 directly/i);
  });
});
