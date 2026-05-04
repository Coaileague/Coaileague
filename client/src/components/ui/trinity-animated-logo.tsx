/**
 * TrinityAnimatedLogo — The living Trinity Trifecta mark.
 *
 * Three slim teardrop arms radiating from a glowing core.
 * Orbital rings spin via SMIL animateTransform (cross-browser safe).
 * Core breathes. Arms pulse in sequence. Particles on thinking/loading.
 * 9 emotion states with color temperature + speed changes.
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
  alwaysAnimate?: boolean;
}

const COLORS: Record<TrinityState, { arm1: string; arm2: string; arm3: string; core: string; glow: string }> = {
  idle:      { arm1: "#93C5FD", arm2: "#FED7AA", arm3: "#C4B5FD", core: "#A78BFA", glow: "#7C3AED" },
  thinking:  { arm1: "#38BDF8", arm2: "#818CF8", arm3: "#60A5FA", core: "#60A5FA", glow: "#2563EB" },
  speaking:  { arm1: "#C084FC", arm2: "#60A5FA", arm3: "#FB923C", core: "#C084FC", glow: "#9333EA" },
  listening: { arm1: "#6EE7B7", arm2: "#34D399", arm3: "#60A5FA", core: "#34D399", glow: "#059669" },
  success:   { arm1: "#86EFAC", arm2: "#4ADE80", arm3: "#FCD34D", core: "#4ADE80", glow: "#16A34A" },
  warning:   { arm1: "#FCD34D", arm2: "#FB923C", arm3: "#FBBF24", core: "#FBBF24", glow: "#D97706" },
  error:     { arm1: "#FCA5A5", arm2: "#F87171", arm3: "#FB923C", core: "#F87171", glow: "#DC2626" },
  loading:   { arm1: "#7C3AED", arm2: "#0D9488", arm3: "#F59E0B", core: "#A78BFA", glow: "#6D28D9" }, // Purple | Teal | Gold
  focused:   { arm1: "#C084FC", arm2: "#818CF8", arm3: "#60A5FA", core: "#E879F9", glow: "#A21CAF" },
};

const SPEEDS: Record<TrinityState, { ring1: string; ring2: string; core: string; arm: string }> = {
  idle:      { ring1: "8s",  ring2: "13s", core: "4s",  arm: "4s"  },
  thinking:  { ring1: "2s",  ring2: "3s",  core: "1.2s",arm: "1.5s"},
  speaking:  { ring1: "4s",  ring2: "7s",  core: "2s",  arm: "2.5s"},
  listening: { ring1: "12s", ring2: "18s", core: "6s",  arm: "6s"  },
  success:   { ring1: "3s",  ring2: "5s",  core: "1.5s",arm: "2s"  },
  warning:   { ring1: "2s",  ring2: "3s",  core: "1s",  arm: "1.5s"},
  error:     { ring1: "1s",  ring2: "1.5s",core: "0.8s",arm: "1s"  },
  loading:   { ring1: "3s",  ring2: "5s",  core: "2s",  arm: "2.5s"},
  focused:   { ring1: "6s",  ring2: "10s", core: "3s",  arm: "3.5s"},
};

// Arm path: slim teardrop from nexus edge to pointed tip
const ARM = "M60 43 C55 34,53 19,60 6 C67 19,65 34,60 43 Z";

export function TrinityAnimatedLogo({
  size = 32,
  state = "idle",
  className,
  alwaysAnimate = true,
}: TrinityAnimatedLogoProps) {
  const uid = useId().replace(/:/g, "");
  const c = COLORS[state];
  const sp = SPEEDS[state];
  const isThinking = state === "thinking" || state === "loading";
  const isSuccess  = state === "success";

  return (
    <svg
      width={size} height={size}
      viewBox="0 0 120 120"
      fill="none" xmlns="http://www.w3.org/2000/svg"
      className={cn("shrink-0 select-none", className)}
      aria-hidden="true"
    >
      <defs>
        <radialGradient id={`c-${uid}`} cx="50%" cy="50%" r="50%">
          <stop offset="0%"   stopColor="#ffffff" />
          <stop offset="40%"  stopColor={c.core} />
          <stop offset="100%" stopColor={c.glow} stopOpacity="0.5" />
        </radialGradient>
        <linearGradient id={`a1-${uid}`} x1="50%" y1="0%" x2="50%" y2="100%">
          <stop offset="0%"   stopColor={c.arm1} stopOpacity="0.95" />
          <stop offset="100%" stopColor={c.arm1} stopOpacity="0.1" />
        </linearGradient>
        <linearGradient id={`a2-${uid}`} x1="50%" y1="0%" x2="50%" y2="100%">
          <stop offset="0%"   stopColor={c.arm2} stopOpacity="0.95" />
          <stop offset="100%" stopColor={c.arm2} stopOpacity="0.1" />
        </linearGradient>
        <linearGradient id={`a3-${uid}`} x1="50%" y1="0%" x2="50%" y2="100%">
          <stop offset="0%"   stopColor={c.arm3} stopOpacity="0.95" />
          <stop offset="100%" stopColor={c.arm3} stopOpacity="0.1" />
        </linearGradient>
        <filter id={`ga-${uid}`} x="-60%" y="-60%" width="220%" height="220%">
          <feGaussianBlur stdDeviation="3" result="b"/>
          <feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge>
        </filter>
        <filter id={`gc-${uid}`} x="-100%" y="-100%" width="300%" height="300%">
          <feGaussianBlur stdDeviation="7" result="b"/>
          <feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge>
        </filter>
      </defs>

      {/* ── Trifecta: arms breathe/glow — no group spin ── */}
      {/* Arms are fixed at 12/4/8 o'clock. Only opacity/size breathes. */}
      <g>
        {/* Arm 1 — 12 o'clock */}
        <g filter={`url(#ga-${uid})`}>
          <path d={ARM} fill={`url(#a1-${uid})`}>
            {alwaysAnimate && <animate attributeName="opacity" values="0.6;1;0.6" dur={sp.core} repeatCount="indefinite"/>}
          </path>
          <circle cx="60" cy="6" r="3" fill={c.arm1} opacity="0.9">
            {alwaysAnimate && <animate attributeName="r" values="2;4;2" dur={sp.core} repeatCount="indefinite"/>}
          </circle>
        </g>
        {/* Arm 2 — 4 o'clock */}
        <g filter={`url(#ga-${uid})`} transform="rotate(120 60 60)">
          <path d={ARM} fill={`url(#a2-${uid})`}>
            {alwaysAnimate && <animate attributeName="opacity" values="0.6;1;0.6" dur={sp.core} begin="0.5s" repeatCount="indefinite"/>}
          </path>
          <circle cx="60" cy="6" r="3" fill={c.arm2} opacity="0.9">
            {alwaysAnimate && <animate attributeName="r" values="2;4;2" dur={sp.core} begin="0.5s" repeatCount="indefinite"/>}
          </circle>
        </g>
        {/* Arm 3 — 8 o'clock */}
        <g filter={`url(#ga-${uid})`} transform="rotate(240 60 60)">
          <path d={ARM} fill={`url(#a3-${uid})`}>
            {alwaysAnimate && <animate attributeName="opacity" values="0.6;1;0.6" dur={sp.core} begin="1s" repeatCount="indefinite"/>}
          </path>
          <circle cx="60" cy="6" r="3" fill={c.arm3} opacity="0.9">
            {alwaysAnimate && <animate attributeName="r" values="2;4;2" dur={sp.core} begin="1s" repeatCount="indefinite"/>}
          </circle>
        </g>
      </g>
      {/* ── Core — small bright centre dot, glow via filter only (no filled disc) ── */}
      <circle cx="60" cy="60" r="6" fill={`url(#c-${uid})`}
        filter={`url(#gc-${uid})`} opacity="0.7">
        {alwaysAnimate && (
          <>
            <animate attributeName="r" values="5;8;5" dur={sp.core} repeatCount="indefinite"/>
            <animate attributeName="opacity" values="0.5;0.85;0.5" dur={sp.core} repeatCount="indefinite"/>
          </>
        )}
      </circle>
      <circle cx="60" cy="60" r="7" fill="#ffffff" opacity="0.92">
        {alwaysAnimate && (
          <animate attributeName="opacity" values="0.7;1;0.7" dur={sp.core} repeatCount="indefinite"/>
        )}
      </circle>
      <circle cx="57" cy="57" r="2.5" fill="#ffffff" opacity="0.8"/>

      {/* ── Thinking / loading: particle corona ── */}
      {isThinking && alwaysAnimate && [0,72,144,216,288].map((deg, i) => (
        <circle key={i}
          cx={60 + 34 * Math.cos((deg * Math.PI) / 180)}
          cy={60 + 34 * Math.sin((deg * Math.PI) / 180)}
          r="2" fill={c.arm1} opacity="0">
          <animate attributeName="opacity" values="0;0.9;0"
            dur={sp.arm} begin={`${i * (parseFloat(sp.arm) / 5)}s`} repeatCount="indefinite"/>
          <animate attributeName="r" values="0.5;2.5;0.5"
            dur={sp.arm} begin={`${i * (parseFloat(sp.arm) / 5)}s`} repeatCount="indefinite"/>
        </circle>
      ))}

      {/* ── Success: star burst ── */}
      {isSuccess && alwaysAnimate && [30,90,150,210,270,330].map((deg, i) => (
        <circle key={i}
          cx={60 + 38 * Math.cos((deg * Math.PI) / 180)}
          cy={60 + 38 * Math.sin((deg * Math.PI) / 180)}
          r="1.5" fill={c.arm2} opacity="0">
          <animate attributeName="opacity" values="0;1;0"
            dur="1.2s" begin={`${i * 0.2}s`} repeatCount="indefinite"/>
        </circle>
      ))}
    </svg>
  );
}

/**
 * useTrinityGlobalState — subscribes to Trinity's live state broadcast.
 */
export function useTrinityGlobalState(defaultState: TrinityState = "idle"): TrinityState {
  const [state, setState] = useState<TrinityState>(defaultState);
  useEffect(() => {
    function handle(e: Event) {
      const evt = e as CustomEvent<{ state: TrinityState }>;
      if (evt.detail?.state) setState(evt.detail.state);
    }
    window.addEventListener("trinity-state-change", handle);
    return () => window.removeEventListener("trinity-state-change", handle);
  }, []);
  return state;
}

/**
 * TrinityOrbitalAvatar — Purple orbital avatar with live spinning rings.
 * Auto-tracks Trinity global state via useTrinityGlobalState.
 */
interface TrinityOrbitalAvatarProps {
  size?: number;
  state?: TrinityState;
  className?: string;
  /** When true: zero animation — just the static arms. For header/chrome use. */
  noAnimation?: boolean;
}

export function TrinityOrbitalAvatar({ size = 36, state: stateProp, className, noAnimation = false }: TrinityOrbitalAvatarProps) {
  const uid  = useId().replace(/:/g, "");
  const auto = useTrinityGlobalState("idle");
  const state = stateProp ?? auto;
  const c  = COLORS[state];
  const sp = SPEEDS[state];

  // IDLE: one soft comet arc sweeps ~180° and fades — Gemini-style. No constant spin.
  // ACTIVE states (thinking/speaking/loading/listening/focused): arcs animate to show activity.
  // SUCCESS/WARNING/ERROR: brief burst.
  // noAnimation overrides everything — pure static mark for header
  const isActive = noAnimation ? false : state !== "idle";

  return (
    <div
      className={cn("relative inline-flex items-center justify-center shrink-0", className)}
      style={{ width: size, height: size }}
      aria-hidden="true"
    >
      {/* ── Halo SVG — absolute, fills container ── */}
      <svg className="absolute inset-0 pointer-events-none" width={size} height={size} viewBox="0 0 100 100" fill="none">
        <defs>
          <filter id={`av-glow-${uid}`} x="-80%" y="-80%" width="260%" height="260%">
            <feGaussianBlur stdDeviation="3" result="b"/>
            <feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge>
          </filter>
        </defs>

        {/* IDLE: single comet arc — sweeps around once and fades. Barely perceptible. */}
        {!isActive && !noAnimation && (
          <g>
            <animateTransform attributeName="transform" type="rotate"
              from="0 50 50" to="360 50 50" dur="6s" repeatCount="indefinite"/>
            <circle cx="50" cy="50" r="46" fill="none" stroke={c.arm1}
              strokeWidth="2" strokeDasharray="30 90" strokeLinecap="round"
              opacity="0">
              <animate attributeName="opacity" values="0;0.55;0.55;0" dur="6s" repeatCount="indefinite"/>
            </circle>
          </g>
        )}

        {/* ACTIVE: halo provided by parent (ThoughtBar/UniversalSpinner CSS conic-gradient) */}
        {/* No inner SVG arcs — prevents double-ring appearance */}
      </svg>

      {/* ── Arms — transparent, no background box ── */}
      <div
        style={{
          position: "relative", zIndex: 10,
          display: "flex", alignItems: "center", justifyContent: "center",
          width: Math.round(size * 0.76),
          height: Math.round(size * 0.76),
        }}
      >
        {/* TrinityAnimatedLogo spins its trifecta independently */}
        <TrinityAnimatedLogo
          size={Math.round(size * 0.52)}
          state={state}
          alwaysAnimate={!noAnimation && isActive}
        />
      </div>
    </div>
  );

}

// ── TrinityStaticMark ─────────────────────────────────────────────────────────
// Zero-animation Trinity orbital arms. Header/chrome/favicon contexts.
// Same arm paths as TrinityAnimatedLogo — no breathing, no halo, no spin.
// THREE logos total in the system:
//   1. TrinityAnimatedLogo  — animated arms + breathing (chatdock, loading)
//   2. TrinityOrbitalAvatar — animated + Gemini halo (ThoughtBar, spinners)
//   3. TrinityStaticMark    — static arms only (header, favicon contexts)
export function TrinityStaticMark({ size = 28, className }: { size?: number; className?: string }) {
  return (
    <svg
      width={size} height={size}
      viewBox="0 0 120 120" fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={cn("shrink-0 select-none", className)}
      aria-hidden="true"
    >
      {/* Arm 1 — 12 o'clock — blue */}
      <path d={ARM} fill="#93C5FD" opacity="0.92"/>
      <circle cx="60" cy="6" r="3.5" fill="#93C5FD" opacity="0.85"/>
      {/* Arm 2 — 4 o'clock — gold */}
      <g transform="rotate(120 60 60)">
        <path d={ARM} fill="#FED7AA" opacity="0.92"/>
        <circle cx="60" cy="6" r="3.5" fill="#FED7AA" opacity="0.85"/>
      </g>
      {/* Arm 3 — 8 o'clock — purple */}
      <g transform="rotate(240 60 60)">
        <path d={ARM} fill="#C4B5FD" opacity="0.92"/>
        <circle cx="60" cy="6" r="3.5" fill="#C4B5FD" opacity="0.85"/>
      </g>
      {/* Core */}
      <circle cx="60" cy="60" r="9" fill="white" opacity="0.93"/>
      <circle cx="57" cy="57" r="3" fill="white" opacity="0.75"/>
    </svg>
  );
}
