/**
 * CoAIleague Animated Splash / Loading Screen
 *
 * Saturn-ring orbital enhancement: multi-layer particle rings orbit
 * the Trinity mark at different radii, speeds, and inclinations —
 * like the rings of Saturn, giving the Trinity mark planetary presence.
 *
 * Visual layers (outside-in):
 *   1. Distant ambient halo (very faint, slow pulse)
 *   2. Saturn outer ring  — 36 particles, 11s orbit, tilted 15°
 *   3. Saturn inner ring  — 24 particles, 7s orbit, tilted -8°
 *   4. TrinityAnimatedLogo (arms + core) — spinning CW
 *   5. Inner corona ring  — 12 particles, 4s orbit, opposite direction
 */

import { useState, useEffect } from "react";
import { TrinityAnimatedLogo } from "@/components/ui/trinity-animated-logo";

const PLATFORM_NAME = "CoAIleague";

const LOADING_MESSAGES = [
  "Preparing your workspace...",
  "Syncing intelligence...",
  "Loading your data...",
  "Almost there...",
];

const LETTER_ANIMS: Record<string, string> = {
  C: "letter-slide-left",
  o: "letter-fall-top",
  A: "letter-rotate",
  I: "letter-zoom",
  l: "letter-stretch",
  e: "letter-spin",
  a: "letter-bounce",
  g: "letter-swing",
  u: "letter-wobble",
  e2: "letter-slide-right",
};

const LETTER_DELAYS: number[] = [0, 0.05, 0.1, 0.15, 0.2, 0.25, 0.3, 0.35, 0.4, 0.45];

/** Particle positions on an ellipse (tilt = degrees of inclination) */
function ellipseParticles(count: number, rx: number, ry: number, tilt: number) {
  return Array.from({ length: count }, (_, i) => {
    const angle = (i / count) * 2 * Math.PI;
    const cosT = Math.cos((tilt * Math.PI) / 180);
    const sinT = Math.sin((tilt * Math.PI) / 180);
    const px = rx * Math.cos(angle);
    const py = ry * Math.sin(angle);
    return {
      x: 60 + px * cosT - py * sinT,
      y: 60 + px * sinT + py * cosT,
      delay: (i / count) * 11,
      size: 0.8 + Math.random() * 1.2,
    };
  });
}

const OUTER_RING  = ellipseParticles(36, 75, 32, 15);
const MIDDLE_RING = ellipseParticles(24, 58, 22, -8);
const INNER_RING  = ellipseParticles(14, 40, 14, 20);
const COMET_RING  = ellipseParticles(6,  88, 38, -20);

export function LoadingScreen() {
  const [msgIdx, setMsgIdx] = useState(0);

  useEffect(() => {
    const t = setTimeout(() => {
      window.dispatchEvent(new Event("coaileague:force-ready"));
    }, 8000);
    return () => clearTimeout(t);
  }, []);

  useEffect(() => {
    const iv = setInterval(() => setMsgIdx((p) => (p + 1) % LOADING_MESSAGES.length), 900);
    return () => clearInterval(iv);
  }, []);

  const letters = PLATFORM_NAME.split("");

  return (
    <div
      className="fixed inset-0 flex flex-col items-center justify-center z-[9999]"
      style={{ backgroundColor: "#0a1628", color: "#e2e8f0" }}
      role="status"
      aria-live="polite"
      aria-label="Loading CoAIleague"
      data-testid="loading-screen"
    >
      {/* ── Far ambient halo ── */}
      <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
        <div style={{
          width: 420, height: 420, borderRadius: "50%",
          border: "1px solid rgba(139,92,246,0.06)",
          animation: "haloBreath 6s ease-in-out infinite",
        }} />
        <div style={{
          position: "absolute", width: 340, height: 340, borderRadius: "50%",
          border: "1px solid rgba(99,102,241,0.08)",
          animation: "haloBreath 6s ease-in-out infinite 2s",
        }} />
      </div>

      {/* ── Trinity + Saturn orbital system ── */}
      <div className="relative flex items-center justify-center mb-5" style={{ width: 220, height: 220 }}>

        {/* LAYER 1: Comet ring — slow wide ellipse with bright comets */}
        <svg viewBox="0 0 120 120" width={220} height={220}
          style={{ position: "absolute", inset: 0, overflow: "visible" }}>
          <g style={{ animation: "orbitSlow 22s linear infinite reverse" }}>
            {COMET_RING.map((p, i) => (
              <g key={i}>
                <circle cx={p.x} cy={p.y} r={p.size * 1.4} fill="#c4b5fd">
                  <animate attributeName="opacity"
                    values="0;0.9;0.6;0" dur="22s"
                    begin={`${p.delay * 2}s`} repeatCount="indefinite" />
                  <animate attributeName="r"
                    values={`${p.size};${p.size * 2.5};${p.size}`} dur="22s"
                    begin={`${p.delay * 2}s`} repeatCount="indefinite" />
                </circle>
              </g>
            ))}
          </g>
        </svg>

        {/* LAYER 2: Outer Saturn ring — 36 particles, 11s orbit */}
        <svg viewBox="0 0 120 120" width={220} height={220}
          style={{ position: "absolute", inset: 0, overflow: "visible" }}>
          {/* Ring band — ellipse outline */}
          <ellipse cx="60" cy="60" rx="75" ry="32"
            fill="none" stroke="rgba(139,92,246,0.12)"
            strokeWidth="8"
            transform="rotate(15 60 60)" />
          <ellipse cx="60" cy="60" rx="75" ry="32"
            fill="none" stroke="rgba(139,92,246,0.06)"
            strokeWidth="14"
            transform="rotate(15 60 60)" />
          <g style={{ animation: "orbitCW 11s linear infinite", transformOrigin: "60px 60px" }}>
            {OUTER_RING.map((p, i) => (
              <circle key={i} cx={p.x} cy={p.y} r={p.size}
                fill={i % 3 === 0 ? "#a78bfa" : i % 3 === 1 ? "#60a5fa" : "#fb923c"}>
                <animate attributeName="opacity"
                  values="0.1;0.85;0.5;0.1" dur="11s"
                  begin={`${p.delay}s`} repeatCount="indefinite" />
              </circle>
            ))}
          </g>
        </svg>

        {/* LAYER 3: Middle ring — 24 particles, 7s orbit, counter */}
        <svg viewBox="0 0 120 120" width={220} height={220}
          style={{ position: "absolute", inset: 0, overflow: "visible" }}>
          <ellipse cx="60" cy="60" rx="58" ry="22"
            fill="none" stroke="rgba(96,165,250,0.10)"
            strokeWidth="5"
            transform="rotate(-8 60 60)" />
          <g style={{ animation: "orbitCCW 7s linear infinite", transformOrigin: "60px 60px" }}>
            {MIDDLE_RING.map((p, i) => (
              <circle key={i} cx={p.x} cy={p.y} r={p.size * 0.9}
                fill={i % 2 === 0 ? "#93c5fd" : "#c4b5fd"}>
                <animate attributeName="opacity"
                  values="0.2;1;0.4;0.2" dur="7s"
                  begin={`${p.delay * 0.7}s`} repeatCount="indefinite" />
              </circle>
            ))}
          </g>
        </svg>

        {/* LAYER 4: Trinity logo — center */}
        <div style={{ position: "relative", zIndex: 10, width: 120, height: 120 }}>
          <TrinityAnimatedLogo size={120} state="loading" alwaysAnimate={true} />
        </div>

        {/* LAYER 5: Inner corona — 14 particles, 4s orbit CW close-in */}
        <svg viewBox="0 0 120 120" width={220} height={220}
          style={{ position: "absolute", inset: 0, overflow: "visible" }}>
          <g style={{ animation: "orbitCW 4s linear infinite reverse", transformOrigin: "60px 60px" }}>
            {INNER_RING.map((p, i) => (
              <circle key={i} cx={p.x} cy={p.y} r={p.size * 0.7}
                fill={i % 2 === 0 ? "#fbbf24" : "#f97316"}>
                <animate attributeName="opacity"
                  values="0;1;0.6;0" dur="4s"
                  begin={`${p.delay * 0.4}s`} repeatCount="indefinite" />
                <animate attributeName="r"
                  values={`${p.size * 0.4};${p.size * 1.2};${p.size * 0.4}`} dur="4s"
                  begin={`${p.delay * 0.4}s`} repeatCount="indefinite" />
              </circle>
            ))}
          </g>
        </svg>
      </div>

      {/* ── Trinity™ identity ── */}
      <div className="text-center" style={{ animation: "fadeSlideUp 0.5s ease both" }}>
        <span className="text-[22px] font-bold tracking-wide text-primary">Trinity</span>
        <sup className="text-[10px] font-semibold text-muted-foreground align-super">™</sup>
        <span className="block text-[9px] text-muted-foreground tracking-[2px] uppercase mt-0.5">
          AI Co-Pilot
        </span>
      </div>

      {/* ── CoAIleague wordmark ── */}
      <div aria-label={PLATFORM_NAME} className="flex items-end mb-1 mt-4" style={{ gap: 1 }}>
        {letters.map((letter, i) => {
          const isSecondE = letter === "e" && i === letters.length - 1;
          const animKey   = isSecondE ? "e2" : letter;
          const animName  = LETTER_ANIMS[animKey] || "letter-float";
          const colorClass = i % 2 === 0 ? "text-primary" : "text-foreground";
          return (
            <span key={i} className={`inline-block text-[34px] font-extrabold leading-tight ${colorClass}`}
              style={{
                letterSpacing: "-0.5px",
                animation: `${animName} 2.4s ease-in-out infinite`,
                animationDelay: `${LETTER_DELAYS[i] || 0}s`,
                transformOrigin: "50% 80%",
              }}>
              {letter}
            </span>
          );
        })}
        <sup className="text-[11px] font-semibold text-primary align-super self-start ml-px pt-1">®</sup>
      </div>

      <p className="text-muted-foreground text-[10px] tracking-[2.5px] uppercase mb-6 mt-0"
        style={{ animation: "fadeSlideUp 0.6s ease both 0.1s", animationFillMode: "both" }}>
        AI-Powered Workforce Platform
      </p>

      {/* Status message */}
      <p key={msgIdx} className="text-muted-foreground text-[13px] mb-5 text-center px-4"
        style={{ minHeight: 20, animation: "msgFade 0.4s ease both" }}>
        {LOADING_MESSAGES[msgIdx]}
      </p>

      {/* Bouncing dots */}
      <div className="flex gap-1.5 mb-5">
        <span className="w-[7px] h-[7px] rounded-full bg-primary"
          style={{ animation: "dotBounce 1.2s ease-in-out infinite" }} />
        <span className="w-[7px] h-[7px] rounded-full bg-primary/70"
          style={{ animation: "dotBounce 1.2s ease-in-out infinite 0.18s" }} />
        <span className="w-[7px] h-[7px] rounded-full bg-primary/40"
          style={{ animation: "dotBounce 1.2s ease-in-out infinite 0.36s" }} />
      </div>

      {/* Progress shimmer */}
      <div className="rounded-full overflow-hidden bg-muted" style={{ width: 200, maxWidth: "70vw", height: 3 }}>
        <div className="h-full rounded-full bg-gradient-to-r from-primary via-primary/60 to-primary"
          style={{ backgroundSize: "300% 100%", animation: "barShimmer 2s linear infinite" }} />
      </div>

      {/* Footer */}
      <div className="absolute bottom-5 left-0 right-0 flex flex-col items-center gap-1 px-4"
        style={{ animation: "fadeSlideUp 0.8s ease both 0.3s", animationFillMode: "both" }}>
        <p className="text-[11px] text-muted-foreground tracking-wide m-0">
          Powered by <span className="font-semibold text-foreground">Trinity</span>
          <sup className="text-[9px] text-muted-foreground align-super">™</sup>
        </p>
        <p className="text-[10px] text-muted-foreground/70 text-center tracking-wide m-0">
          © {new Date().getFullYear()} CoAIleague
          <sup className="text-[9px] text-muted-foreground/70 align-super">®</sup>
          {" · Trinity"}
          <sup className="text-[9px] text-muted-foreground/70 align-super">™</sup>
          {" is a trademark of CoAIleague. All rights reserved."}
        </p>
      </div>

      <style>{`
        @keyframes haloBreath  { 0%,100%{opacity:.4;transform:scale(1)}50%{opacity:.9;transform:scale(1.04)} }
        @keyframes orbitCW     { to { transform: rotate(360deg); } }
        @keyframes orbitCCW    { to { transform: rotate(-360deg); } }
        @keyframes orbitSlow   { to { transform: rotate(360deg); } }
        @keyframes ringPulse   { 0%,100%{opacity:.4;transform:scale(1)}50%{opacity:.9;transform:scale(1.05)} }
        @keyframes fadeSlideUp { from{opacity:0;transform:translateY(12px)}to{opacity:1;transform:translateY(0)} }
        @keyframes msgFade     { from{opacity:0;transform:translateY(6px)}to{opacity:1;transform:translateY(0)} }
        @keyframes dotBounce   { 0%,80%,100%{transform:translateY(0)scale(1);opacity:.8}40%{transform:translateY(-8px)scale(1.2);opacity:1} }
        @keyframes barShimmer  { 0%{background-position:100% 50%}100%{background-position:-200% 50%} }
        @keyframes letter-slide-left  { 0%,100%{transform:translateX(0)}30%{transform:translateX(-6px)rotate(-8deg)}60%{transform:translateX(2px)rotate(3deg)} }
        @keyframes letter-fall-top    { 0%,100%{transform:translateY(0)}25%{transform:translateY(-10px)scaleY(.9)}55%{transform:translateY(4px)scaleY(1.1)}75%{transform:translateY(-3px)} }
        @keyframes letter-rotate      { 0%,100%{transform:rotate(0)}40%{transform:rotate(-18deg)scale(1.15)}70%{transform:rotate(8deg)scale(.95)} }
        @keyframes letter-zoom        { 0%,100%{transform:scale(1)}35%{transform:scale(1.35)translateY(-4px)}65%{transform:scale(.85)translateY(3px)} }
        @keyframes letter-stretch     { 0%,100%{transform:scaleY(1)}40%{transform:scaleY(1.4)translateY(-5px)}70%{transform:scaleY(.85)translateY(3px)} }
        @keyframes letter-spin        { 0%,100%{transform:rotateY(0)}40%{transform:rotateY(180deg)scale(1.1)}80%{transform:rotateY(320deg)} }
        @keyframes letter-bounce      { 0%,100%{transform:translateY(0)scale(1)}30%{transform:translateY(-12px)scale(1.1)}55%{transform:translateY(5px)scale(.95)}75%{transform:translateY(-4px)} }
        @keyframes letter-swing       { 0%,100%{transform:rotate(0)}25%{transform:rotate(15deg)}50%{transform:rotate(-12deg)}75%{transform:rotate(7deg)} }
        @keyframes letter-wobble      { 0%,100%{transform:skewX(0)}20%{transform:skewX(-10deg)translateX(-3px)}50%{transform:skewX(8deg)translateX(3px)}80%{transform:skewX(-4deg)} }
        @keyframes letter-slide-right { 0%,100%{transform:translateX(0)}30%{transform:translateX(6px)rotate(8deg)}60%{transform:translateX(-2px)rotate(-3deg)} }
        @keyframes letter-float       { 0%,100%{transform:translateY(0)}50%{transform:translateY(-8px)} }
      `}</style>
    </div>
  );
}
