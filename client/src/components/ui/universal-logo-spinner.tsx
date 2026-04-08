/**
 * UniversalLogoSpinner — the single source of truth for all loading spinners.
 *
 * One component, four sizes, living animation:
 *  - Clockwise → counter-clockwise spin cycle (not a mechanical linear rotate)
 *  - Y-axis tilt mid-rotation using CSS 3D transforms
 *  - Scale breath (1.0 → 1.05 → 1.0) in sync with the spin
 *  - Pulsing gold glow (Trinity brand amber #F59E0B) via drop-shadow
 *  - All keyframes ease-in-out so motion feels alive, not mechanical
 *
 * Wraps <TrinityLogo> as the base graphic so the brand mark is always on
 * screen during loading — reinforcing brand recognition.
 *
 * Sizing map:
 *   sm  = 24px — inline in buttons, table rows, small card fallbacks
 *   md  = 40px — Suspense page fallbacks, section loaders
 *   lg  = 72px — modal loaders, dialog bodies
 *   xl  = 120px — SplashScreen, full-page transitions
 *
 * Usage:
 *   <UniversalLogoSpinner size="xl" />
 *   <UniversalLogoSpinner size="md" label="Loading your dashboard…" />
 */

import { motion } from "framer-motion";
import { TrinityLogo } from "@/components/trinity-logo";
import { cn } from "@/lib/utils";

export type UniversalLogoSpinnerSize = "sm" | "md" | "lg" | "xl";

export interface UniversalLogoSpinnerProps {
  size?: UniversalLogoSpinnerSize;
  className?: string;
  /** Optional caption rendered under the spinner. Only shown at md/lg/xl. */
  label?: string;
}

const SIZE_PX: Record<UniversalLogoSpinnerSize, number> = {
  sm: 24,
  md: 40,
  lg: 72,
  xl: 120,
};

const LABEL_SIZE_CLASS: Record<UniversalLogoSpinnerSize, string> = {
  sm: "text-[10px]",
  md: "text-xs",
  lg: "text-sm",
  xl: "text-sm",
};

/**
 * The outer rotation cycle: clockwise → reverse counter-clockwise → back.
 * Using framer-motion keyframes + ease-in-out so the motion has acceleration
 * and deceleration at each direction change — it feels alive.
 *
 * Total cycle: ~4.4 seconds.
 */
const outerRotate = {
  rotate: [0, 360, 360, 0, 0],
};

const outerRotateTransition = {
  duration: 4.4,
  ease: "easeInOut" as const,
  repeat: Infinity,
  times: [0, 0.4, 0.5, 0.9, 1],
};

/**
 * The inner 3D tilt: rotateY flips the logo on its vertical axis mid-spin,
 * so the brand mark appears to turn sideways, then flip back. Combined with
 * the outer rotation, the motion reads as "living" instead of mechanical.
 */
const innerTilt = {
  rotateY: [0, 0, 180, 180, 360, 360, 0],
  scale: [1, 1.05, 1, 1.05, 1, 1.05, 1],
};

const innerTiltTransition = {
  duration: 4.4,
  ease: "easeInOut" as const,
  repeat: Infinity,
  times: [0, 0.15, 0.35, 0.55, 0.75, 0.9, 1],
};

/**
 * The glow shimmer: a pulsing drop-shadow in Trinity gold (#F59E0B).
 * Uses filter on the outer motion.div so the entire logo mark gets the halo.
 */
const glowShimmer = {
  filter: [
    "drop-shadow(0 0 0px rgba(245, 158, 11, 0))",
    "drop-shadow(0 0 10px rgba(245, 158, 11, 0.55))",
    "drop-shadow(0 0 4px rgba(245, 158, 11, 0.25))",
    "drop-shadow(0 0 12px rgba(245, 158, 11, 0.6))",
    "drop-shadow(0 0 0px rgba(245, 158, 11, 0))",
  ],
};

const glowShimmerTransition = {
  duration: 2.4,
  ease: "easeInOut" as const,
  repeat: Infinity,
};

export function UniversalLogoSpinner({
  size = "md",
  className,
  label,
}: UniversalLogoSpinnerProps) {
  const px = SIZE_PX[size];
  const showLabel = Boolean(label) && size !== "sm";

  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center gap-3",
        className,
      )}
      data-testid="universal-logo-spinner"
      data-size={size}
      role="status"
      aria-live="polite"
      aria-label={label ?? "Loading"}
    >
      {/* Outer layer: rotation + glow shimmer */}
      <motion.div
        animate={{ ...outerRotate, ...glowShimmer }}
        transition={{
          rotate: outerRotateTransition,
          filter: glowShimmerTransition,
        }}
        style={{
          width: px,
          height: px,
          // 3D perspective so the inner rotateY tilt reads as depth
          perspective: px * 4,
        }}
      >
        {/* Inner layer: Y-axis tilt + scale breath */}
        <motion.div
          animate={innerTilt}
          transition={innerTiltTransition}
          style={{
            width: "100%",
            height: "100%",
            transformStyle: "preserve-3d",
          }}
        >
          <TrinityLogo size={px} />
        </motion.div>
      </motion.div>

      {showLabel && (
        <span
          className={cn(
            "font-medium text-muted-foreground tracking-wide",
            LABEL_SIZE_CLASS[size],
          )}
        >
          {label}
        </span>
      )}
    </div>
  );
}

export default UniversalLogoSpinner;
