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
  loading:   { arm1: "#60A5FA", arm2: "#A78BFA", arm3: "#FB923C", core: "#818CF8", glow: "#4F46E5" },
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

      {/* ── Outer orbital ring — SMIL spin CW ── */}
      <g>
        <animateTransform attributeName="transform" type="rotate"
          from="0 60 60" to="360 60 60" dur={sp.ring1} repeatCount="indefinite"/>
        <circle cx="60" cy="60" r="53" fill="none" stroke={c.arm1}
          strokeWidth="1" strokeDasharray="7 22 2 22" opacity="0.3"/>
      </g>

      {/* ── Inner orbital ring — SMIL spin CCW ── */}
      <g>
        <animateTransform attributeName="transform" type="rotate"
          from="360 60 60" to="0 60 60" dur={sp.ring2} repeatCount="indefinite"/>
        <circle cx="60" cy="60" r="45" fill="none" stroke={c.arm2}
          strokeWidth="0.7" strokeDasharray="4 16" opacity="0.2"/>
      </g>

      {/* ── The three trifecta arms ── */}
      {/* Arm 1 — 12 o'clock */}
      <g filter={`url(#ga-${uid})`}>
        <path d={ARM} fill={`url(#a1-${uid})`}>
          {alwaysAnimate && (
            <animate attributeName="opacity"
              values="0.65;1;0.65" dur={sp.arm} repeatCount="indefinite"/>
          )}
        </path>
        <circle cx="60" cy="6" r="3" fill={c.arm1} opacity="0.9">
          {alwaysAnimate && (
            <animate attributeName="r" values="2;4;2" dur={sp.arm} repeatCount="indefinite"/>
          )}
        </circle>
      </g>

      {/* Arm 2 — 4 o'clock */}
      <g filter={`url(#ga-${uid})`} transform="rotate(120 60 60)">
        <path d={ARM} fill={`url(#a2-${uid})`}>
          {alwaysAnimate && (
            <animate attributeName="opacity"
              values="0.65;1;0.65" dur={sp.arm} begin="0.5s" repeatCount="indefinite"/>
          )}
        </path>
        <circle cx="60" cy="6" r="3" fill={c.arm2} opacity="0.9">
          {alwaysAnimate && (
            <animate attributeName="r" values="2;4;2" dur={sp.arm} begin="0.5s" repeatCount="indefinite"/>
          )}
        </circle>
      </g>

      {/* Arm 3 — 8 o'clock */}
      <g filter={`url(#ga-${uid})`} transform="rotate(240 60 60)">
        <path d={ARM} fill={`url(#a3-${uid})`}>
          {alwaysAnimate && (
            <animate attributeName="opacity"
              values="0.65;1;0.65" dur={sp.arm} begin="1s" repeatCount="indefinite"/>
          )}
        </path>
        <circle cx="60" cy="6" r="3" fill={c.arm3} opacity="0.9">
          {alwaysAnimate && (
            <animate attributeName="r" values="2;4;2" dur={sp.arm} begin="1s" repeatCount="indefinite"/>
          )}
        </circle>
      </g>

      {/* ── Core — breathing radial glow ── */}
      <circle cx="60" cy="60" r="16" fill={`url(#c-${uid})`}
        filter={`url(#gc-${uid})`} opacity="0.85">
        {alwaysAnimate && (
          <>
            <animate attributeName="r" values="13;18;13" dur={sp.core} repeatCount="indefinite"/>
            <animate attributeName="opacity" values="0.7;0.95;0.7" dur={sp.core} repeatCount="indefinite"/>
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
}

export function TrinityOrbitalAvatar({ size = 36, state: stateProp, className }: TrinityOrbitalAvatarProps) {
  const uid  = useId().replace(/:/g, "");
  const auto = useTrinityGlobalState("idle");
  const state = stateProp ?? auto;
  const c  = COLORS[state];
  const sp = SPEEDS[state];

  return (
    <div className={cn("relative inline-flex items-center justify-center shrink-0", className)}
      style={{ width: size, height: size }} aria-hidden="true">

      {/* SVG orbital rings layer */}
      <svg className="absolute inset-0" width={size} height={size} viewBox="0 0 100 100" fill="none">
        <defs>
          <filter id={`av-g-${uid}`} x="-80%" y="-80%" width="260%" height="260%">
            <feGaussianBlur stdDeviation="4" result="b"/>
            <feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge>
          </filter>
        </defs>

        {/* Pulsing halo */}
        <circle cx="50" cy="50" r="48" fill="none" stroke={c.glow} strokeWidth="1.5" opacity="0.2">
          <animate attributeName="opacity" values="0.08;0.3;0.08" dur={sp.core} repeatCount="indefinite"/>
          <animate attributeName="r"       values="45;49;45"       dur={sp.core} repeatCount="indefinite"/>
        </circle>

        {/* Primary spinning arc */}
        <g>
          <animateTransform attributeName="transform" type="rotate"
            from="0 50 50" to="360 50 50" dur={sp.ring1} repeatCount="indefinite"/>
          <circle cx="50" cy="50" r="44" fill="none" stroke={c.arm1}
            strokeWidth="2" strokeDasharray="22 58" strokeLinecap="round"
            opacity="0.8" filter={`url(#av-g-${uid})`}/>
        </g>

        {/* Counter arc */}
        <g>
          <animateTransform attributeName="transform" type="rotate"
            from="360 50 50" to="0 50 50" dur={sp.ring2} repeatCount="indefinite"/>
          <circle cx="50" cy="50" r="44" fill="none" stroke={c.arm2}
            strokeWidth="1.2" strokeDasharray="9 71" strokeLinecap="round" opacity="0.5"/>
        </g>

        {/* Third arc fragment */}
        <g>
          <animateTransform attributeName="transform" type="rotate"
            from="90 50 50" to="450 50 50"
            dur={`${parseFloat(sp.ring1) * 1.7}s`} repeatCount="indefinite"/>
          <circle cx="50" cy="50" r="44" fill="none" stroke={c.arm3}
            strokeWidth="0.8" strokeDasharray="5 75" strokeLinecap="round" opacity="0.35"/>
        </g>
      </svg>

      {/* Glass avatar circle */}
      <div className="relative z-10 flex items-center justify-center rounded-full"
        style={{
          width: size * 0.78, height: size * 0.78,
          background: `radial-gradient(circle at 35% 35%, ${c.core}50, ${c.glow}cc)`,
          boxShadow: `0 0 ${size * 0.35}px ${c.glow}55, inset 0 1px 1px rgba(255,255,255,0.25)`,
          border: `1px solid ${c.arm1}40`,
        }}>
        <TrinityAnimatedLogo size={Math.round(size * 0.48)} state={state} alwaysAnimate={true}/>
      </div>
    </div>
  );
}

export default TrinityAnimatedLogo;
