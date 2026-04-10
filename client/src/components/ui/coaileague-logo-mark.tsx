/**
 * CoAIleagueLogoMark — THE canonical CoAIleague brand mark.
 *
 * The Trinity Triquetra: three interlocking filled loops in teal / cyan /
 * blue gradients with a central glowing nexus. Matches the static asset at
 * `client/public/logo.svg` exactly, inlined as React so it can be styled,
 * sized, and animated per-instance without fetching an SVG.
 *
 * This is the SINGLE SOURCE OF TRUTH for the platform brand mark. The old
 * separate logo components (TrinityLogo, TrinityMascotIcon, LogoMark, etc.)
 * now alias to this file so the whole codebase renders one consistent mark.
 *
 * `useId()` namespaces the SVG gradient/filter IDs so multiple instances on
 * the same page don't collide.
 *
 * Size API:
 *   - number          → used as CSS px (e.g., `size={32}`)
 *   - CSS string      → passed through (e.g., `size="2rem"`, `size="50%"`)
 *   - size keyword    → `"xs" | "sm" | "md" | "lg" | "xl" | "2xl"` resolved
 *                       via SIZE_MAP. Preserves backward compatibility with
 *                       the old TrinityMascotIcon API.
 */

import { useId } from "react";
import { cn } from "@/lib/utils";

export type LogoMarkSizeKeyword = "xs" | "sm" | "md" | "lg" | "xl" | "2xl";
export type LogoMarkSize = number | string | LogoMarkSizeKeyword;

const SIZE_MAP: Record<LogoMarkSizeKeyword, number> = {
  xs: 20,
  sm: 24,
  md: 32,
  lg: 48,
  xl: 64,
  "2xl": 96,
};

function resolveSize(size: LogoMarkSize): number | string {
  if (typeof size === "number") return size;
  if (typeof size === "string" && size in SIZE_MAP) {
    return SIZE_MAP[size as LogoMarkSizeKeyword];
  }
  return size;
}

export interface CoAIleagueLogoMarkProps {
  size?: LogoMarkSize;
  className?: string;
}

export function CoAIleagueLogoMark({
  size = 64,
  className,
}: CoAIleagueLogoMarkProps) {
  const reactId = useId();
  const resolved = resolveSize(size);
  const id = {
    teal: `coai-teal-${reactId}`,
    cyan: `coai-cyan-${reactId}`,
    blue: `coai-blue-${reactId}`,
    core: `coai-core-${reactId}`,
    glow: `coai-glow-${reactId}`,
  };

  return (
    <svg
      width={resolved}
      height={resolved}
      viewBox="0 0 100 100"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={cn("shrink-0", className)}
      aria-hidden="true"
      data-testid="coaileague-logo-mark"
    >
      <defs>
        <linearGradient id={id.teal} x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#2dd4bf" />
          <stop offset="100%" stopColor="#14b8a6" />
        </linearGradient>
        <linearGradient id={id.cyan} x1="0%" y1="100%" x2="100%" y2="0%">
          <stop offset="0%" stopColor="#06b6d4" />
          <stop offset="100%" stopColor="#22d3ee" />
        </linearGradient>
        <linearGradient id={id.blue} x1="100%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" stopColor="#3b82f6" />
          <stop offset="100%" stopColor="#0ea5e9" />
        </linearGradient>
        <radialGradient id={id.core} cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="#ffffff" />
          <stop offset="60%" stopColor="#22d3ee" stopOpacity="0.9" />
          <stop offset="100%" stopColor="#2dd4bf" stopOpacity="0.5" />
        </radialGradient>
        <filter id={id.glow} x="-20%" y="-20%" width="140%" height="140%">
          <feGaussianBlur stdDeviation="1.5" result="blur" />
          <feMerge>
            <feMergeNode in="blur" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
      </defs>

      {/* Circle 1 — Top (Teal) */}
      <circle
        cx="50"
        cy="32"
        r="26"
        fill={`url(#${id.teal})`}
        opacity="0.75"
        filter={`url(#${id.glow})`}
      />

      {/* Circle 2 — Bottom Left (Cyan) */}
      <circle
        cx="32"
        cy="62"
        r="26"
        fill={`url(#${id.cyan})`}
        opacity="0.75"
        filter={`url(#${id.glow})`}
      />

      {/* Circle 3 — Bottom Right (Blue) */}
      <circle
        cx="68"
        cy="62"
        r="26"
        fill={`url(#${id.blue})`}
        opacity="0.75"
        filter={`url(#${id.glow})`}
      />

      {/* Central nexus */}
      <circle
        cx="50"
        cy="50"
        r="10"
        fill={`url(#${id.core})`}
        filter={`url(#${id.glow})`}
      />
      <circle cx="50" cy="50" r="5" fill="#ffffff" opacity="0.95" />
    </svg>
  );
}

// ─────────────────────────────────────────────────────────────────────────
// LEGACY NAME ALIASES
// ─────────────────────────────────────────────────────────────────────────
// The old separate logo components have been collapsed into this one
// canonical mark. Their export names are re-exported here so existing
// call sites can switch to importing from this file without any JSX
// changes — they all render the same triquetra.
//
// Any call site that still imports from `@/components/trinity-logo`,
// `@/components/ui/trinity-mascot`, or `@/components/ui/logo-mark` should
// be migrated to import from this file. Once all importers are migrated,
// the old files can be safely deleted.
// ─────────────────────────────────────────────────────────────────────────
export const TrinityLogo = CoAIleagueLogoMark;
export const TrinityMascotIcon = CoAIleagueLogoMark;
export const LogoMark = CoAIleagueLogoMark;

export default CoAIleagueLogoMark;
