/**
 * TrinityAnimatedLogo — The living brand mark for Trinity AI.
 *
 * Replaces the static clunky arrows with a sleek Gemini-inspired orbital system:
 *   - Three slender luminous arcs orbit a radiant core (not chunky arrows)
 *   - The core breathes, pulses, glows in response to state
 *   - Outer orbital ring spins continuously like a celestial body
 *   - Counter-rotating inner arc for depth
 *   - State-aware color temperature: cool blue (idle) → warm gold (thinking) → violet (speaking)
 *
 * Use Cases:
 *   - TrinityThoughtBar (replaces TrinityArrowMark)
 *   - Header trinity button avatar
 *   - Loading states within any surface
 *   - Trinity task/modal header
 *
 * States: idle | thinking | speaking | listening | success | warning | error | loading | focused
 */

import { useId, useEffect, useState } from "react";
import { cn } from "@/lib/utils";

export type TrinityState =
  | "idle" | "thinking" | "speaking" | "listening"
  | "success" | "warning" | "error" | "loading" | "focused";

interface TrinityAnimatedLogoProps {
  size?: number;
  state?: TrinityState;
  className?: string;
  /** If true, pulses + orbits continuously regardless of state */
  alwaysAnimate?: boolean;
}

const STATE_COLORS: Record<TrinityState, { core: string; arc1: string; arc2: string; arc3: string; glow: string }> = {
  idle:      { core: "#A78BFA", arc1: "#60A5FA", arc2: "#FB923C", arc3: "#A78BFA", glow: "#7C3AED" },
  thinking:  { core: "#60A5FA", arc1: "#38BDF8", arc2: "#818CF8", arc3: "#60A5FA", glow: "#2563EB" },
  speaking:  { core: "#C084FC", arc1: "#A78BFA", arc2: "#60A5FA", arc3: "#FB923C", glow: "#9333EA" },
  listening: { core: "#34D399", arc1: "#6EE7B7", arc2: "#34D399", arc3: "#60A5FA", glow: "#059669" },
  success:   { core: "#4ADE80", arc1: "#86EFAC", arc2: "#4ADE80", arc3: "#FCD34D", glow: "#16A34A" },
  warning:   { core: "#FBBF24", arc1: "#FCD34D", arc2: "#FB923C", arc3: "#FBBF24", glow: "#D97706" },
  error:     { core: "#F87171", arc1: "#FCA5A5", arc2: "#F87171", arc3: "#FB923C", glow: "#DC2626" },
  loading:   { core: "#818CF8", arc1: "#60A5FA", arc2: "#A78BFA", arc3: "#FB923C", glow: "#4F46E5" },
  focused:   { core: "#E879F9", arc1: "#C084FC", arc2: "#818CF8", arc3: "#60A5FA", glow: "#A21CAF" },
};

const SPIN_SPEEDS: Record<TrinityState, { outer: string; inner: string; core: string }> = {
  idle:      { outer: "8s",  inner: "12s", core: "4s"  },
  thinking:  { outer: "2s",  inner: "3s",  core: "1.5s" },
  speaking:  { outer: "4s",  inner: "6s",  core: "2s"  },
  listening: { outer: "10s", inner: "15s", core: "5s"  },
  success:   { outer: "3s",  inner: "4s",  core: "2s"  },
  warning:   { outer: "2s",  inner: "3s",  core: "1s"  },
  error:     { outer: "1s",  inner: "1.5s",core: "0.8s"},
  loading:   { outer: "3s",  inner: "5s",  core: "2.5s"},
  focused:   { outer: "6s",  inner: "9s",  core: "3s"  },
};

export function TrinityAnimatedLogo({
  size = 32,
  state = "idle",
  className,
  alwaysAnimate = true,
}: TrinityAnimatedLogoProps) {
  const uid = useId().replace(/:/g, "");
  const colors = STATE_COLORS[state];
  const speed  = SPIN_SPEEDS[state];
  const r = size / 2;

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 100 100"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={cn("shrink-0", className)}
      aria-hidden="true"
    >
      <defs>
        {/* Core radial gradient */}
        <radialGradient id={`core-${uid}`} cx="50%" cy="50%" r="50%">
          <stop offset="0%"   stopColor="#ffffff" />
          <stop offset="35%"  stopColor={colors.core} />
          <stop offset="100%" stopColor={colors.glow} stopOpacity="0.6" />
        </radialGradient>

        {/* Arc gradients — each arm has its own color temperature */}
        <linearGradient id={`a1-${uid}`} x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%"   stopColor={colors.arc1} stopOpacity="0.9" />
          <stop offset="100%" stopColor={colors.arc1} stopOpacity="0.1" />
        </linearGradient>
        <linearGradient id={`a2-${uid}`} x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%"   stopColor={colors.arc2} stopOpacity="0.9" />
          <stop offset="100%" stopColor={colors.arc2} stopOpacity="0.1" />
        </linearGradient>
        <linearGradient id={`a3-${uid}`} x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%"   stopColor={colors.arc3} stopOpacity="0.9" />
          <stop offset="100%" stopColor={colors.arc3} stopOpacity="0.1" />
        </linearGradient>

        {/* Soft outer glow */}
        <filter id={`glow-${uid}`} x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur stdDeviation="3" result="blur" />
          <feMerge><feMergeNode in="blur"/><feMergeNode in="SourceGraphic"/></feMerge>
        </filter>
        <filter id={`core-glow-${uid}`} x="-80%" y="-80%" width="260%" height="260%">
          <feGaussianBlur stdDeviation="5" result="blur" />
          <feMerge><feMergeNode in="blur"/><feMergeNode in="SourceGraphic"/></feMerge>
        </filter>
        <filter id={`arc-glow-${uid}`} x="-30%" y="-30%" width="160%" height="160%">
          <feGaussianBlur stdDeviation="2.5" result="blur" />
          <feMerge><feMergeNode in="blur"/><feMergeNode in="SourceGraphic"/></feMerge>
        </filter>
      </defs>

      {/* ── Outer orbital ring (continuous slow spin) ── */}
      <g opacity="0.25">
        <circle cx="50" cy="50" r="44" fill="none" stroke={colors.arc1}
          strokeWidth="0.8" strokeDasharray="6 18 2 18" >
          {alwaysAnimate && (
            <animateTransform attributeName="transform" type="rotate"
              from="0 50 50" to="360 50 50" dur={speed.outer} repeatCount="indefinite" />
          )}
        </circle>
      </g>

      {/* ── Middle orbital ring (counter-spin) ── */}
      <g opacity="0.18">
        <circle cx="50" cy="50" r="38" fill="none" stroke={colors.arc2}
          strokeWidth="0.6" strokeDasharray="3 12">
          {alwaysAnimate && (
            <animateTransform attributeName="transform" type="rotate"
              from="360 50 50" to="0 50 50" dur={speed.inner} repeatCount="indefinite" />
          )}
        </circle>
      </g>

      {/* ── The three orbital arcs (slim, elegant, Gemini-like) ── */}
      {/* Arc 1 — tapered luminous arm at 0° */}
      <g filter={`url(#arc-glow-${uid})`}>
        <path
          d="M50 34 C46 28, 45 18, 50 8 C55 18, 54 28, 50 34 Z"
          fill={`url(#a1-${uid})`}
          opacity="0.95"
        />
        {/* Tip dot */}
        <circle cx="50" cy="9" r="1.8" fill={colors.arc1} opacity="0.9" />
      </g>
      {/* Arc 2 — 120° */}
      <g filter={`url(#arc-glow-${uid})`} transform="rotate(120 50 50)">
        <path
          d="M50 34 C46 28, 45 18, 50 8 C55 18, 54 28, 50 34 Z"
          fill={`url(#a2-${uid})`}
          opacity="0.95"
        />
        <circle cx="50" cy="9" r="1.8" fill={colors.arc2} opacity="0.9" />
      </g>
      {/* Arc 3 — 240° */}
      <g filter={`url(#arc-glow-${uid})`} transform="rotate(240 50 50)">
        <path
          d="M50 34 C46 28, 45 18, 50 8 C55 18, 54 28, 50 34 Z"
          fill={`url(#a3-${uid})`}
          opacity="0.95"
        />
        <circle cx="50" cy="9" r="1.8" fill={colors.arc3} opacity="0.9" />
      </g>

      {/* ── Central glowing core ── */}
      <circle cx="50" cy="50" r="14" fill={`url(#core-${uid})`}
        filter={`url(#core-glow-${uid})`} opacity="0.85">
        {alwaysAnimate && (
          <>
            <animate attributeName="r" values="12;15;12" dur={speed.core} repeatCount="indefinite" />
            <animate attributeName="opacity" values="0.75;0.95;0.75" dur={speed.core} repeatCount="indefinite" />
          </>
        )}
      </circle>

      {/* Bright inner core */}
      <circle cx="50" cy="50" r="6" fill="#ffffff" opacity="0.9">
        {alwaysAnimate && (
          <animate attributeName="opacity" values="0.7;1;0.7" dur={speed.core} repeatCount="indefinite" />
        )}
      </circle>

      {/* Specular highlight */}
      <circle cx="47" cy="47" r="2" fill="#ffffff" opacity="0.8" />

      {/* ── State-specific particle corona (thinking/loading/error) ── */}
      {(state === "thinking" || state === "loading") && alwaysAnimate && (
        <g opacity="0.6">
          {[0, 72, 144, 216, 288].map((deg, i) => (
            <circle key={i}
              cx={50 + 28 * Math.cos((deg * Math.PI) / 180)}
              cy={50 + 28 * Math.sin((deg * Math.PI) / 180)}
              r="1.5" fill={colors.arc1} opacity="0">
              <animate attributeName="opacity" values="0;0.8;0"
                dur="1.8s" begin={`${i * 0.36}s`} repeatCount="indefinite" />
              <animate attributeName="r" values="0.5;2;0.5"
                dur="1.8s" begin={`${i * 0.36}s`} repeatCount="indefinite" />
            </circle>
          ))}
        </g>
      )}

      {state === "success" && alwaysAnimate && (
        <g>
          {[30, 90, 150, 210, 270, 330].map((deg, i) => (
            <circle key={i}
              cx={50 + 32 * Math.cos((deg * Math.PI) / 180)}
              cy={50 + 32 * Math.sin((deg * Math.PI) / 180)}
              r="1.2" fill="#4ADE80" opacity="0">
              <animate attributeName="opacity" values="0;1;0"
                dur="1.2s" begin={`${i * 0.2}s`} repeatCount="indefinite" />
            </circle>
          ))}
        </g>
      )}
    </svg>
  );
}

/**
 * useTrinityGlobalState — subscribes to Trinity's live state broadcast.
 * TrinityThoughtBar (and future surfaces) emit 'trinity-state-change' events
 * whenever Trinity's cognitive state changes. This hook picks it up so any
 * TrinityOrbitalAvatar or TrinityAnimatedLogo auto-animates without prop drilling.
 */
export function useTrinityGlobalState(defaultState: TrinityState = "idle"): TrinityState {
  const [state, setState] = useState<TrinityState>(defaultState);
  
  useEffect(() => {
    function handleStateChange(e: Event) {
      const evt = e as CustomEvent<{ state: TrinityState }>;
      if (evt.detail?.state) setState(evt.detail.state);
    }
    window.addEventListener("trinity-state-change", handleStateChange);
    return () => window.removeEventListener("trinity-state-change", handleStateChange);
  }, []);
  
  return state;
}

/**
 * TrinityOrbitalAvatar — The purple-circle-with-icon from the thought bar.
 *
 * Replaces the static purple circle with a living Gemini-inspired orbital:
 *   - Animated orbital ring spins around the avatar
 *   - The inner logo breathes (scale pulse)
 *   - On "thinking": ring speeds up + particles appear
 *   - On "speaking": ring shimmers with color shift
 */
interface TrinityOrbitalAvatarProps {
  size?: number;
  state?: TrinityState;  // Optional — auto-detects from global Trinity state if omitted
  className?: string;
}

export function TrinityOrbitalAvatar({
  size = 36,
  state: stateProp,
  className,
}: TrinityOrbitalAvatarProps) {
  const uid = useId().replace(/:/g, "");
  // Auto-detect Trinity's global state unless a specific state is forced via prop
  const globalState = useTrinityGlobalState("idle");
  const state = stateProp ?? globalState;
  const colors = STATE_COLORS[state];
  const speed  = SPIN_SPEEDS[state];

  return (
    <div
      className={cn("relative flex items-center justify-center shrink-0", className)}
      style={{ width: size, height: size }}
      aria-hidden="true"
    >
      {/* SVG orbital ring layer */}
      <svg
        className="absolute inset-0"
        width={size} height={size}
        viewBox="0 0 100 100"
        fill="none"
      >
        <defs>
          <filter id={`av-glow-${uid}`} x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur stdDeviation="4" result="b" />
            <feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge>
          </filter>
        </defs>

        {/* Pulsing glow ring behind the avatar */}
        <circle cx="50" cy="50" r="48" fill="none"
          stroke={colors.glow} strokeWidth="1.5" opacity="0.25">
          <animate attributeName="opacity" values="0.1;0.35;0.1" dur={speed.core} repeatCount="indefinite" />
          <animate attributeName="r" values="45;49;45" dur={speed.core} repeatCount="indefinite" />
        </circle>

        {/* Spinning orbital arc */}
        <circle cx="50" cy="50" r="44" fill="none"
          stroke={colors.arc1} strokeWidth="1.5"
          strokeDasharray="20 60" strokeLinecap="round"
          opacity="0.7" filter={`url(#av-glow-${uid})`}>
          <animateTransform attributeName="transform" type="rotate"
            from="0 50 50" to="360 50 50" dur={speed.outer} repeatCount="indefinite" />
        </circle>

        {/* Counter-rotating second arc */}
        <circle cx="50" cy="50" r="44" fill="none"
          stroke={colors.arc2} strokeWidth="1"
          strokeDasharray="8 72" strokeLinecap="round"
          opacity="0.45">
          <animateTransform attributeName="transform" type="rotate"
            from="360 50 50" to="0 50 50" dur={speed.inner} repeatCount="indefinite" />
        </circle>

        {/* Third arc fragment */}
        <circle cx="50" cy="50" r="44" fill="none"
          stroke={colors.arc3} strokeWidth="0.8"
          strokeDasharray="4 76" strokeLinecap="round"
          opacity="0.35">
          <animateTransform attributeName="transform" type="rotate"
            from="120 50 50" to="480 50 50" dur={`${parseFloat(speed.outer) * 1.5}s`} repeatCount="indefinite" />
        </circle>
      </svg>

      {/* The actual avatar circle — purple glass pill */}
      <div
        className="relative z-10 flex items-center justify-center rounded-full"
        style={{
          width: size * 0.78,
          height: size * 0.78,
          background: `radial-gradient(circle at 35% 35%, ${colors.core}40, ${colors.glow}cc)`,
          boxShadow: `0 0 ${size * 0.3}px ${colors.glow}60, inset 0 1px 1px rgba(255,255,255,0.3)`,
          border: `1px solid ${colors.arc1}50`,
        }}
      >
        {/* Inner Trinity Trifecta logo — slim version */}
        <TrinityAnimatedLogo
          size={Math.round(size * 0.46)}
          state={state}
          alwaysAnimate={true}
        />
      </div>
    </div>
  );
}

export default TrinityAnimatedLogo;
