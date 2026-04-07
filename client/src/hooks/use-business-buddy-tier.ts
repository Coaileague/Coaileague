/**
 * useTrinityMode — Resolves the active Trinity operational mode for the current user.
 *
 * Trinity has two distinct intelligent modes:
 *   - COO Mode      : For org owners and managers at security companies. Full
 *                     business intelligence, ops management, payroll, scheduling.
 *   - Tech Guru Mode: For platform support agents. Platform diagnostics, health
 *                     monitoring, escalation management.
 *   - Standard      : All other authenticated users.
 *
 * NOTE: "Business Buddy" was an old concept and has been fully removed.
 *       All references should use trinityMode ('coo' | 'guru' | 'standard').
 */

import { useMemo } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { useTrinityContext } from './use-trinity-context';

export type TrinityMode = 'coo' | 'guru' | 'standard';

export interface TrinityModeResult {
  mode: TrinityMode;
  isCOO: boolean;
  isGuru: boolean;
  isStandard: boolean;
  modeLabel: string;
  modeDescription: string;
  /** @deprecated Use mode instead. Kept for compatibility during migration. */
  tier: TrinityMode;
  /** @deprecated No longer meaningful — Trinity is not gated by subscription add-ons. */
  isDemo: boolean;
  /** @deprecated Always true for authenticated users with COO or Guru mode. */
  hasFullAccess: boolean;
  /** @deprecated Upgrade nudges removed. Always false. */
  shouldShowUpgradeNudge: false;
  /** @deprecated Use modeLabel instead. */
  tierLabel: string;
}

export function useTrinityMode(): TrinityModeResult {
  const { user } = useAuth();
  const { context } = useTrinityContext();

  const mode = useMemo((): TrinityMode => {
    if (!user) return 'standard';
    return context?.trinityMode ?? 'standard';
  }, [user, context?.trinityMode]);

  return useMemo((): TrinityModeResult => {
    const isCOO = mode === 'coo';
    const isGuru = mode === 'guru';
    const label = isCOO ? 'COO Mode' : isGuru ? 'Tech Guru Mode' : 'Standard';
    const description = isCOO
      ? 'Full business intelligence and org oversight for security companies'
      : isGuru
      ? 'Platform diagnostics and health monitoring for support agents'
      : 'AI assistant';
    return {
      mode,
      isCOO,
      isGuru,
      isStandard: !isCOO && !isGuru,
      modeLabel: label,
      modeDescription: description,
      tier: mode,
      isDemo: false,
      hasFullAccess: isCOO || isGuru,
      shouldShowUpgradeNudge: false,
      tierLabel: label,
    };
  }, [mode]);
}

/** @deprecated Use useTrinityMode instead. */
export const useBusinessBuddyTier = useTrinityMode;

/** All mascot modes — no longer filtered by tier. */
const ALL_MODES = [
  'IDLE', 'SEARCHING', 'THINKING', 'ANALYZING', 'CODING',
  'UPLOADING', 'LISTENING', 'SUCCESS', 'ERROR', 'ADVISING',
  'HOLIDAY', 'CELEBRATING', 'GREETING',
] as const;

/** @deprecated Mode filtering is no longer needed. All modes are always allowed. */
export function getAllowedModes(_mode?: TrinityMode): readonly string[] {
  return ALL_MODES;
}

/** @deprecated Mode gating removed. Always returns true. */
export function isModeAllowed(_mode: TrinityMode, _mascotMode: string): boolean {
  return true;
}

/** @deprecated Upgrade nudges removed. Returns empty string. */
export function getUpgradeNudgeMessage(_context?: string): string {
  return '';
}
