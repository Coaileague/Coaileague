/**
 * TrinityArrowMark — the Trinity AI Co-Pilot three-arrow brand icon.
 *
 * This is the ICON for the TRINITY SUB-BRAND — used specifically in the
 * branded splash / loading / launch experience (SplashScreen, LoadingScreen,
 * and the pre-React HTML loader in `client/index.html`).
 *
 * Three elongated arrow shapes radiating outward from a central glowing nexus:
 *   - Blue arrow (#3B82F6 → #60A5FA)   — Top (12 o'clock)    — Intelligence
 *   - Gold arrow (#F59E0B → #FBBF24)   — Bottom-left (4 o'clock) — Innovation
 *   - Purple arrow (#8B5CF6 → #A78BFA) — Bottom-right (8 o'clock) — Collaboration
 *
 * DO NOT confuse with:
 *   - `CoAIleagueLogoMark` (the triquetra) — platform brand used in headers,
 *     avatars, navigation, and general app UI
 *   - `TrinityMascotIcon` (the three-blob flower) — AI mascot, DELETED
 *
 * Each mark has its own purpose:
 *   - Splash / loading / launch: TrinityArrowMark (this file)
 *   - App UI / header / nav:    CoAIleagueLogoMark
 *
 * This component was originally deleted in commit 41f3a97b during a logo
 * consolidation pass that incorrectly treated the splash screen as general
 * UI. The splash is a branded launch experience with its own intentional
 * design (dark navy background, Trinity mark, specific layout) and should
 * have been excluded from that cleanup. Restored on 2026-04-08.
 *
 * The export was renamed from `TrinityLogo` to `TrinityArrowMark` because
 * `TrinityLogo` now exists as a backward-compat alias in
 * `components/ui/coaileague-logo-mark.tsx` pointing at the triquetra for
 * general UI call sites. Using distinct names removes naming ambiguity.
 */

import { cn } from "@/lib/utils";
import { useId } from "react";

interface TrinityArrowMarkProps {
  size?: number | string;
  className?: string;
}

export function TrinityArrowMark({
  size = 40,
  className = "",
}: TrinityArrowMarkProps) {
  const reactId = useId();

  const ids = {
    blueGrad: `trinityArrow-blueGrad${reactId}`,
    purpleGrad: `trinityArrow-purpleGrad${reactId}`,
    goldGrad: `trinityArrow-goldGrad${reactId}`,
    coreGrad: `trinityArrow-coreGrad${reactId}`,
    glowFilter: `trinityArrow-glow${reactId}`,
  };

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 100 100"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={cn("shrink-0", className)}
      data-testid="trinity-arrow-mark"
    >
      <defs>
        {/* Blue gradient — Intelligence */}
        <linearGradient id={ids.blueGrad} x1="50%" y1="0%" x2="50%" y2="100%">
          <stop offset="0%" stopColor="#60A5FA" />
          <stop offset="100%" stopColor="#3B82F6" />
        </linearGradient>

        {/* Purple gradient — Collaboration */}
        <linearGradient id={ids.purpleGrad} x1="100%" y1="50%" x2="0%" y2="50%">
          <stop offset="0%" stopColor="#A78BFA" />
          <stop offset="100%" stopColor="#8B5CF6" />
        </linearGradient>

        {/* Gold gradient — Innovation */}
        <linearGradient id={ids.goldGrad} x1="0%" y1="50%" x2="100%" y2="50%">
          <stop offset="0%" stopColor="#FBBF24" />
          <stop offset="100%" stopColor="#F59E0B" />
        </linearGradient>

        {/* Central core gradient */}
        <radialGradient id={ids.coreGrad} cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="#ffffff" />
          <stop offset="60%" stopColor="#E0E7FF" />
          <stop offset="100%" stopColor="#C4B5FD" stopOpacity="0.9" />
        </radialGradient>

        {/* Subtle glow filter */}
        <filter id={ids.glowFilter} x="-20%" y="-20%" width="140%" height="140%">
          <feGaussianBlur stdDeviation="1.5" result="blur" />
          <feMerge>
            <feMergeNode in="blur" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
      </defs>

      {/* Three elongated arrow shapes radiating outward from center */}

      {/* Arrow 1 — Blue (top, 12 o'clock) */}
      <path
        d="M 50 5
           L 59 15
           L 56 15
           L 56 42
           L 50 50
           L 44 42
           L 44 15
           L 41 15
           Z"
        fill={`url(#${ids.blueGrad})`}
        filter={`url(#${ids.glowFilter})`}
      />

      {/* Arrow 2 — Gold (bottom-left, 8 o'clock) */}
      <path
        d="M 50 5
           L 59 15
           L 56 15
           L 56 42
           L 50 50
           L 44 42
           L 44 15
           L 41 15
           Z"
        fill={`url(#${ids.goldGrad})`}
        filter={`url(#${ids.glowFilter})`}
        transform="rotate(120, 50, 50)"
      />

      {/* Arrow 3 — Purple (bottom-right, 4 o'clock) */}
      <path
        d="M 50 5
           L 59 15
           L 56 15
           L 56 42
           L 50 50
           L 44 42
           L 44 15
           L 41 15
           Z"
        fill={`url(#${ids.purpleGrad})`}
        filter={`url(#${ids.glowFilter})`}
        transform="rotate(240, 50, 50)"
      />

      {/* Central convergence point — glowing core */}
      <circle
        cx="50"
        cy="50"
        r="10"
        fill={`url(#${ids.coreGrad})`}
        filter={`url(#${ids.glowFilter})`}
      />
      <circle cx="50" cy="50" r="5" fill="#ffffff" opacity="0.95" />
    </svg>
  );
}

export default TrinityArrowMark;
