/**
 * CoAIleagueLogoMark — THE canonical CoAIleague brand mark.
 *
 * The Trinity Arrow Mark: three elongated arrows radiating from a central
 * glowing nexus, in blue / orange / purple gradients. Matches the static
 * asset at `client/public/logo.svg` exactly, inlined as React so it can be
 * styled, sized, and animated per-instance without fetching an SVG.
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
    blue: `coai-blue-${reactId}`,
    orange: `coai-orange-${reactId}`,
    purple: `coai-purple-${reactId}`,
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
        {/* Blue gradient — top arrow */}
        <linearGradient id={id.blue} x1="50%" y1="0%" x2="50%" y2="100%">
          <stop offset="0%" stopColor="#60A5FA" />
          <stop offset="100%" stopColor="#3B82F6" />
        </linearGradient>

        {/* Orange gradient — right arrow */}
        <linearGradient id={id.orange} x1="0%" y1="50%" x2="100%" y2="50%">
          <stop offset="0%" stopColor="#FB923C" />
          <stop offset="100%" stopColor="#F97316" />
        </linearGradient>

        {/* Purple gradient — left arrow */}
        <linearGradient id={id.purple} x1="100%" y1="50%" x2="0%" y2="50%">
          <stop offset="0%" stopColor="#A78BFA" />
          <stop offset="100%" stopColor="#8B5CF6" />
        </linearGradient>

        {/* Central core gradient */}
        <radialGradient id={id.core} cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="#ffffff" />
          <stop offset="60%" stopColor="#E0E7FF" />
          <stop offset="100%" stopColor="#C4B5FD" stopOpacity="0.9" />
        </radialGradient>

        {/* Glow filter */}
        <filter id={id.glow} x="-20%" y="-20%" width="140%" height="140%">
          <feGaussianBlur stdDeviation="1.5" result="blur" />
          <feMerge>
            <feMergeNode in="blur" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
      </defs>

      {/* Arrow 1 — Blue (top, 12 o'clock) */}
      <path
        d="M 50 5 L 59 15 L 56 15 L 56 42 L 50 50 L 44 42 L 44 15 L 41 15 Z"
        fill={`url(#${id.blue})`}
        filter={`url(#${id.glow})`}
      />

      {/* Arrow 2 — Orange (bottom-right, 4 o'clock) */}
      <path
        d="M 50 5 L 59 15 L 56 15 L 56 42 L 50 50 L 44 42 L 44 15 L 41 15 Z"
        fill={`url(#${id.orange})`}
        filter={`url(#${id.glow})`}
        transform="rotate(120, 50, 50)"
      />

      {/* Arrow 3 — Purple (bottom-left, 8 o'clock) */}
      <path
        d="M 50 5 L 59 15 L 56 15 L 56 42 L 50 50 L 44 42 L 44 15 L 41 15 Z"
        fill={`url(#${id.purple})`}
        filter={`url(#${id.glow})`}
        transform="rotate(240, 50, 50)"
      />

      {/* Central convergence point — glowing core */}
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
// changes — they all render the same Trinity arrow mark.
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
