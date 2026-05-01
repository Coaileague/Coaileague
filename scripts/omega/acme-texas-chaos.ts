#!/usr/bin/env tsx
/**
 * OMEGA — ACME TEXAS CHAOS
 * Exercises the Texas Regulatory Gatekeeper (OC Ch. 1702) against three "legal landmines":
 *   1. §1702.163 — armed officer with MMPI / PSP-13 still 'pending' → must downgrade to unarmed
 *   2. §1702.201 — pocket card / armed license expired before shift start → must block
 *   3. §1702.323 — plainclothes / personal-protection post without Level IV PPO → must block
 *
 * Run: tsx scripts/omega/acme-texas-chaos.ts
 *
 * No DB writes. Pure-function evaluation against fixtures. Pair with audit-trinity-citations.ts
 * to verify the same § citations appear in trinity_decision_log after a Trinity run.
 */

import {
  evaluateTexasGatekeeper,
  collapseOutcomes,
  type GatekeeperShift,
  type GatekeeperEmployee,
  type GatekeeperOutcome,
} from '../../server/services/compliance/texasGatekeeper';

interface Landmine {
  id: string;
  citation: string;
  shift: GatekeeperShift;
  employee: GatekeeperEmployee;
  expectKind: 'block' | 'downgrade';
  expectCode: string;
}

const NOW = new Date('2026-05-01T18:00:00Z');
const SHIFT_START = new Date('2026-05-02T00:00:00Z');
const SHIFT_END = new Date('2026-05-02T12:00:00Z');

const landmines: Landmine[] = [
  {
    id: 'L1-psych-pending',
    citation: 'TX OC §1702.163',
    shift: { requiredCertifications: ['requires_armed'], startTime: SHIFT_START },
    employee: {
      id: 'emp-psych-pending',
      isArmed: true,
      armedLicenseVerified: true,
      guardCardVerified: true,
      armedLicenseExpiration: new Date('2027-01-01T00:00:00Z'),
      guardCardExpirationDate: new Date('2027-01-01T00:00:00Z'),
      psychEvalStatus: 'pending',
    },
    expectKind: 'downgrade',
    expectCode: 'psych_eval_pending',
  },
  {
    id: 'L2-midnight-expiry',
    citation: 'TX OC §1702.201',
    shift: { requiredCertifications: ['requires_armed'], startTime: SHIFT_START },
    employee: {
      id: 'emp-card-expired',
      isArmed: true,
      armedLicenseVerified: true,
      guardCardVerified: true,
      armedLicenseExpiration: new Date('2027-01-01T00:00:00Z'),
      // Card expired at midnight UTC the day of the shift — exactly the chaos test.
      guardCardExpirationDate: new Date('2026-05-01T23:59:59Z'),
      psychEvalStatus: 'cleared',
    },
    expectKind: 'block',
    expectCode: 'expired_license_override',
  },
  {
    id: 'L3-plainclothes-no-ppo',
    citation: 'TX OC §1702.323',
    shift: { requiredCertifications: ['requires_plainclothes'], startTime: SHIFT_START },
    employee: {
      id: 'emp-no-ppo',
      isArmed: true,
      armedLicenseVerified: true,
      guardCardVerified: true,
      armedLicenseExpiration: new Date('2027-01-01T00:00:00Z'),
      guardCardExpirationDate: new Date('2027-01-01T00:00:00Z'),
      // Level III only — no Level IV PPO endorsement loaded.
      certifications: [{ certificationType: 'armed_security', status: 'active' }],
      psychEvalStatus: 'cleared',
    },
    expectKind: 'block',
    expectCode: 'plainclothes_without_ppo',
  },
  {
    id: 'L4-armed-commission-invalid',
    citation: 'TX OC §1702.161',
    shift: { requiredCertifications: ['requires_armed'], startTime: SHIFT_START },
    employee: {
      id: 'emp-no-commission',
      // Armed assignment requested but the officer's commission isn't verified.
      isArmed: true,
      armedLicenseVerified: false,
      guardCardVerified: true,
      armedLicenseExpiration: new Date('2027-01-01T00:00:00Z'),
      guardCardExpirationDate: new Date('2027-01-01T00:00:00Z'),
      psychEvalStatus: 'cleared',
    },
    expectKind: 'block',
    expectCode: 'armed_commission_invalid',
  },
];

interface Result {
  id: string;
  pass: boolean;
  detail: string;
}

function runLandmine(l: Landmine): Result {
  const outcomes: GatekeeperOutcome[] = evaluateTexasGatekeeper(l.shift, l.employee, 'TX');
  const collapsed = collapseOutcomes(outcomes);

  if (!collapsed) {
    return { id: l.id, pass: false, detail: `expected ${l.expectKind} ${l.expectCode}, got no outcomes` };
  }

  const kindOk = collapsed.kind === l.expectKind;
  const codeOk = collapsed.code === l.expectCode;
  const cited = collapsed.citation === l.citation;

  if (kindOk && codeOk && cited) {
    return { id: l.id, pass: true, detail: `${collapsed.kind} ${collapsed.code} → ${collapsed.citation}` };
  }
  return {
    id: l.id,
    pass: false,
    detail: `expected ${l.expectKind} ${l.expectCode} (${l.citation}); got ${collapsed.kind} ${collapsed.code} (${collapsed.citation})`,
  };
}

function runNonTexasNoOp(): Result {
  // Sanity: gatekeeper must NOT engage for non-TX workspaces.
  const outcomes = evaluateTexasGatekeeper(
    { requiredCertifications: ['requires_armed'], startTime: SHIFT_START },
    { id: 'ca-employee', isArmed: false, armedLicenseVerified: false, psychEvalStatus: 'pending' },
    'CA',
  );
  return outcomes.length === 0
    ? { id: 'L0-non-texas-noop', pass: true, detail: 'CA workspace bypassed gatekeeper as expected' }
    : { id: 'L0-non-texas-noop', pass: false, detail: `CA workspace produced ${outcomes.length} TX outcomes` };
}

function main(): void {
  console.log('\n═══════════════════════════════════════════════════');
  console.log(' OMEGA — ACME TEXAS CHAOS (Texas Occ. Code Ch. 1702)');
  console.log(` Now: ${NOW.toISOString()}`);
  console.log('═══════════════════════════════════════════════════\n');

  const results: Result[] = [runNonTexasNoOp(), ...landmines.map(runLandmine)];

  for (const r of results) {
    console.log(`${r.pass ? 'PASS' : 'FAIL'}  ${r.id.padEnd(32)}  ${r.detail}`);
  }

  const failed = results.filter(r => !r.pass).length;
  console.log(`\n${results.length - failed}/${results.length} landmines handled correctly.`);

  if (failed > 0) {
    console.log('\nThe Texas Regulatory Gatekeeper failed to enforce one or more landmines.');
    console.log('Inspect server/services/compliance/texasGatekeeper.ts and re-run.');
    process.exit(1);
  }

  console.log('\nGatekeeper canonical for ACME. Now run audit-trinity-citations.ts to verify');
  console.log('the same § citations appear in trinity_decision_log after a live Trinity run.');
}

main();
