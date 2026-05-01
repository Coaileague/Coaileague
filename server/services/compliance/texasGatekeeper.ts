/**
 * Texas Regulatory Gatekeeper
 * ===========================
 * Pure-function rules that enforce Texas Occupations Code Chapter 1702 (Private Security Act)
 * at scheduler time. Each rule returns a structured rejection that includes the OC § citation,
 * so callers can both surface it as a `disqualifyReason` and persist it to
 * `trinity_decision_log` with the canonical regulatoryReference.
 *
 * Source-of-truth citation map: server/services/compliance/regulatoryViolationService.ts
 *
 * Inputs are intentionally permissive — the helper coerces missing fields safely so it can
 * be called against any shape that the scheduler already loads. No DB calls are performed
 * here; callers are responsible for hydrating credentials before invoking.
 */

export interface GatekeeperShift {
  // Tokens drawn from shift.requiredCertifications. Recognized values:
  //   'requires_armed'        — armed post (Lvl III commission required)
  //   'requires_plainclothes' — plainclothes post (Lvl IV PPO endorsement required)
  //   'requires_level_iv'     — explicit Level IV PPO requirement
  //   'level_iv_ppo'          — alias used by the existing certification registry
  requiredCertifications?: string[] | null;
  startTime?: Date | string | null;
}

export interface GatekeeperEmployee {
  id: string;
  // Denormalized credential fields (workforce.employees + compliance.employee_compliance_records).
  isArmed?: boolean | null;
  armedLicenseVerified?: boolean | null;
  guardCardVerified?: boolean | null;
  armedLicenseExpiration?: Date | string | null;
  guardCardExpirationDate?: Date | string | null;
  // Optional hydrated lists. The scheduler currently does NOT load these per-employee, so the
  // helper degrades gracefully: when undefined the corresponding rule is treated as advisory
  // and emits a `softWarn` instead of a hard block.
  certifications?: Array<{ certificationType?: string | null; status?: string | null; expirationDate?: Date | string | null }> | null;
  psychEvalStatus?: 'cleared' | 'pending' | 'failed' | 'missing' | null;
}

export type GatekeeperOutcome =
  | { kind: 'block'; code: string; citation: string; reason: string }
  | { kind: 'downgrade'; code: string; citation: string; reason: string; downgradeTo: 'unarmed' }
  | { kind: 'softWarn'; code: string; citation: string; reason: string };

const TX_CITATIONS = {
  armed_commission_invalid: 'TX OC §1702.161',
  psych_eval_pending: 'TX OC §1702.163',
  plainclothes_without_ppo: 'TX OC §1702.323',
  expired_license: 'TX OC §1702.201',
} as const;

function hasToken(arr: string[] | null | undefined, token: string): boolean {
  if (!arr) return false;
  return arr.includes(token);
}

function asDate(v: Date | string | null | undefined): Date | null {
  if (!v) return null;
  const d = v instanceof Date ? v : new Date(v);
  return Number.isFinite(d.getTime()) ? d : null;
}

/**
 * Evaluate a single (shift, employee) pair against the Texas gatekeeper rules.
 * Returns zero-or-more outcomes; callers concatenate them into disqualifyReasons.
 *
 * @param stateCode Workspace state code. Rules only apply when 'TX'.
 */
export function evaluateTexasGatekeeper(
  shift: GatekeeperShift,
  employee: GatekeeperEmployee,
  stateCode?: string | null,
): GatekeeperOutcome[] {
  if ((stateCode ?? '').toUpperCase() !== 'TX') return [];

  const outcomes: GatekeeperOutcome[] = [];
  const certs = shift.requiredCertifications ?? [];
  const requiresArmed = hasToken(certs, 'requires_armed') || hasToken(certs, 'armed_security') || hasToken(certs, 'ppb_armed');
  const requiresPlainclothes = hasToken(certs, 'requires_plainclothes') || hasToken(certs, 'requires_level_iv') || hasToken(certs, 'level_iv_ppo');
  const shiftStart = asDate(shift.startTime);

  // Rule 1 — §1702.161: armed assignment requires a verified, current commissioned officer license.
  if (requiresArmed) {
    const armedExpiry = asDate(employee.armedLicenseExpiration);
    const armedExpired = shiftStart && armedExpiry ? armedExpiry < shiftStart : false;
    const armedInvalid = !employee.isArmed || !employee.armedLicenseVerified || armedExpired;
    if (armedInvalid) {
      outcomes.push({
        kind: 'block',
        code: 'armed_commission_invalid',
        citation: TX_CITATIONS.armed_commission_invalid,
        reason: `Assignment Rejected. Under ${TX_CITATIONS.armed_commission_invalid}, officer ${employee.id} cannot be assigned to an armed post — Commissioned Security Officer license is ${armedExpired ? 'Expired' : (!employee.armedLicenseVerified ? 'Unverified' : 'Invalid')}.`,
      });
    }
  }

  // Rule 2 — §1702.163: armed Level III/IV requires cleared MMPI / PSP-13 psych eval.
  // Soft-warn when status is unknown (employee record not hydrated); downgrade when explicitly pending.
  if (requiresArmed) {
    const psych = employee.psychEvalStatus;
    if (psych === 'pending' || psych === 'missing' || psych === 'failed') {
      outcomes.push({
        kind: 'downgrade',
        code: 'psych_eval_pending',
        citation: TX_CITATIONS.psych_eval_pending,
        reason: `Legal Hold: MMPI-3 / PSP-13 results ${psych === 'pending' ? 'pending' : 'not found'} for officer ${employee.id}. Assignment downgraded to Unarmed per Texas State Law (${TX_CITATIONS.psych_eval_pending}).`,
        downgradeTo: 'unarmed',
      });
    } else if (psych === undefined || psych === null) {
      outcomes.push({
        kind: 'softWarn',
        code: 'psych_eval_pending',
        citation: TX_CITATIONS.psych_eval_pending,
        reason: `Advisory: psychological evaluation status not loaded for officer ${employee.id}. Verify MMPI / PSP-13 clearance before armed assignment (${TX_CITATIONS.psych_eval_pending}).`,
      });
    }
  }

  // Rule 3 — §1702.323: plainclothes / personal-protection assignment requires Level IV PPO endorsement.
  if (requiresPlainclothes) {
    const certList = employee.certifications;
    if (certList === undefined || certList === null) {
      outcomes.push({
        kind: 'softWarn',
        code: 'plainclothes_without_ppo',
        citation: TX_CITATIONS.plainclothes_without_ppo,
        reason: `Advisory: certifications not loaded for officer ${employee.id}. Verify Level IV PPO endorsement before plainclothes assignment (${TX_CITATIONS.plainclothes_without_ppo}).`,
      });
    } else {
      const hasActivePPO = certList.some(c => (c.certificationType === 'level_iv_ppo') && ((c.status ?? 'active') === 'active'));
      if (!hasActivePPO) {
        outcomes.push({
          kind: 'block',
          code: 'plainclothes_without_ppo',
          citation: TX_CITATIONS.plainclothes_without_ppo,
          reason: `Regulatory Error: Plainclothes / Personal Protection security requires a Level IV PPO Endorsement under ${TX_CITATIONS.plainclothes_without_ppo}. Officer ${employee.id} does not hold an active Level IV PPO certification — assignment blocked.`,
        });
      }
    }
  }

  // Rule 4 — §1702.201: pocket card / guard card must be current at the moment of the shift.
  // Always evaluated when any guard credential is present.
  const guardExpiry = asDate(employee.guardCardExpirationDate);
  if (shiftStart && guardExpiry && guardExpiry < shiftStart) {
    outcomes.push({
      kind: 'block',
      code: 'expired_license_override',
      citation: TX_CITATIONS.expired_license,
      reason: `Alert: Guard Card / PERC for officer ${employee.id} expired at ${guardExpiry.toISOString()}. Assignment blocked per ${TX_CITATIONS.expired_license}.`,
    });
  }

  return outcomes;
}

/**
 * Convenience: collapse a list of outcomes into the strongest action.
 * - any 'block' wins
 * - else any 'downgrade' wins
 * - else 'softWarn' (advisory only)
 */
export function collapseOutcomes(outcomes: GatekeeperOutcome[]): GatekeeperOutcome | null {
  if (outcomes.length === 0) return null;
  return outcomes.find(o => o.kind === 'block')
    ?? outcomes.find(o => o.kind === 'downgrade')
    ?? outcomes[0];
}
