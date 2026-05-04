/**
 * UniversalSpinner — Gemini-style conic-gradient arc around TrinityOrbitalAvatar.
 *
 * The Gemini technique: ONE div with a conic-gradient that creates the color
 * sweep, masked with a radial-gradient to make it a ring.
 * Colors cycle: Purple → Blue → Teal → Gold → (transparent gap) → repeat.
 *
 * Sizes:
 *   sm  →  40px — inline/button fallbacks
 *   md  →  72px — auth screens, page fallbacks
 *   lg  → 128px — LoadingScreen, TransitionLoader (Signing In overlay)
 */

import "@/styles/universal-spinner.css";
import { TrinityOrbitalAvatar } from "@/components/ui/trinity-animated-logo";
import { cn } from "@/lib/utils";

export type UniversalSpinnerSize = "sm" | "md" | "lg";

export interface UniversalSpinnerProps {
  size?: UniversalSpinnerSize;
  className?: string;
  label?: string;
}

const SIZE_PX: Record<UniversalSpinnerSize, number> = { sm: 40, md: 72, lg: 128 };

/* Ring thickness scales with size */
const RING_INSET: Record<UniversalSpinnerSize, number> = { sm: 3, md: 5, lg: 8 };
const RING_THICK: Record<UniversalSpinnerSize, number> = { sm: 2, md: 3, lg: 4 };

const LABEL_SIZE_CLASS: Record<UniversalSpinnerSize, string> = {
  sm: "text-[10px]",
  md: "text-xs",
  lg: "text-sm",
};

export function UniversalSpinner({ size = "md", className, label }: UniversalSpinnerProps) {
  const px       = SIZE_PX[size];
  const inset    = RING_INSET[size];
  const thick    = RING_THICK[size];
  const showLabel = Boolean(label) && size !== "sm";
  const outerPx  = px + inset * 2;

  return (
    <div
      className={cn("flex flex-col items-center justify-center gap-3", className)}
      role="status"
      aria-live="polite"
      aria-label={label ?? "Loading"}
      data-testid="universal-spinner"
      data-size={size}
    >
      {/* Wrapper contains icon + two conic arcs */}
      <div style={{ position: "relative", width: outerPx, height: outerPx }}>

        {/* Primary Gemini arc — CW */}
        <div style={{
          position: "absolute", inset: 0, borderRadius: "50%",
          background: `conic-gradient(
            from 0deg,
            transparent 0deg,
            #7C3AED 40deg,
            #2563EB 100deg,
            #0D9488 170deg,
            #F59E0B 230deg,
            rgba(245,158,11,0.2) 265deg,
            transparent 290deg
          )`,
          animation: "geminiSpin 2.2s linear infinite",
          mask: `radial-gradient(farthest-side, transparent calc(100% - ${thick + 1}px), white calc(100% - ${thick}px))`,
          WebkitMask: `radial-gradient(farthest-side, transparent calc(100% - ${thick + 1}px), white calc(100% - ${thick}px))`,
          filter: "blur(0.4px)",
        }} />

        {/* Secondary Gemini arc — CCW, offset phase */}
        <div style={{
          position: "absolute", inset: Math.round(inset * 0.3), borderRadius: "50%",
          background: `conic-gradient(
            from 180deg,
            transparent 0deg,
            #0D9488 55deg,
            #F59E0B 120deg,
            #7C3AED 185deg,
            rgba(124,58,237,0.15) 230deg,
            transparent 260deg
          )`,
          animation: "geminiSpinCCW 3.4s linear infinite",
          mask: `radial-gradient(farthest-side, transparent calc(100% - ${thick}px), white calc(100% - ${thick - 1}px))`,
          WebkitMask: `radial-gradient(farthest-side, transparent calc(100% - ${thick}px), white calc(100% - ${thick - 1}px))`,
          opacity: 0.65,
          filter: "blur(0.3px)",
        }} />

        {/* TrinityOrbitalAvatar — centered, shape unchanged */}
        <div style={{
          position: "absolute",
          top: inset, left: inset,
          width: px, height: px,
          display: "flex", alignItems: "center", justifyContent: "center",
        }}>
          <span className="coai-universal-spinner" style={{ width: px, height: px }}>
            <TrinityOrbitalAvatar size={px} state="loading" />
          </span>
        </div>
      </div>

      {showLabel && (
        <span className={cn("font-medium text-muted-foreground tracking-wide", LABEL_SIZE_CLASS[size])}>
          {label}
        </span>
      )}
    </div>
  );
}
