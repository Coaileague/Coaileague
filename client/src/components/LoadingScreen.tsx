/**
 * CoAIleague Animated Splash / Loading Screen
 *
 * THEME-AWARE (2026-04-08): background + text colors use CSS theme
 * tokens so this screen automatically switches between day / night
 * mode. The Trinity three-arrow SVG itself KEEPS its intentional brand
 * colors (blue / orange / purple arrows with a white center) because
 * those are fixed brand marks, not theme colors.
 *
 * Tokens used:
 *   bg-background       → white in light, dark navy in dark
 *   text-foreground     → primary text (Trinity™, CoAIleague wordmark)
 *   text-muted-foreground → secondary text (subtitles, status, footer)
 *   text-primary        → brand accent letters
 *   bg-primary          → dots + progress bar base (brand teal/blue)
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

/* Per-letter animation definitions — each letter feels different */
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

export function LoadingScreen() {
  const [msgIdx, setMsgIdx] = useState(0);

  useEffect(() => {
    const iv = setInterval(() => setMsgIdx((p) => (p + 1) % LOADING_MESSAGES.length), 900);
    return () => clearInterval(iv);
  }, []);

  const letters = PLATFORM_NAME.split("");

  return (
    <div
      className="fixed inset-0 flex flex-col items-center justify-center z-[9999] bg-background text-foreground"
      role="status"
      aria-live="polite"
      aria-label="Loading CoAIleague"
      data-testid="loading-screen"
    >
      {/* ── Ambient glow rings ── */}
      <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
        <div
          className="rounded-full border border-primary/10"
          style={{ width: 320, height: 320, animation: "ringPulse 3s ease-in-out infinite" }}
        />
        <div
          className="absolute rounded-full border border-primary/10"
          style={{ width: 220, height: 220, animation: "ringPulse 3s ease-in-out infinite 1s" }}
        />
        <div
          className="absolute rounded-full border border-primary/10"
          style={{ width: 150, height: 150, animation: "ringPulse 3s ease-in-out infinite 2s" }}
        />
      </div>

      {/* ── Trinity SVG Logo + name ── */}
      <div className="flex flex-col items-center mb-5">
        {/* Spinning logo — brand colors intentional, not theme tokens */}
        <div className="relative mb-2.5 flex items-center justify-center" style={{ width: 120, height: 120 }}>
          <TrinityAnimatedLogo size={120} state="idle" alwaysAnimate={true} />
        </div>

        {/* Trinity™ — the AI identity */}
        <div className="text-center" style={{ animation: "fadeSlideUp 0.5s ease both" }}>
          <span className="text-[22px] font-bold tracking-wide text-primary">
            Trinity
          </span>
          <sup className="text-[10px] font-semibold text-muted-foreground align-super">
            ™
          </sup>
          <span className="block text-[9px] text-muted-foreground tracking-[2px] uppercase mt-0.5">
            AI Co-Pilot
          </span>
        </div>
      </div>

      {/* ── "CoAIleague" — per-letter animations, theme-aware colors ── */}
      <div
        aria-label={PLATFORM_NAME}
        className="flex items-end mb-1"
        style={{ gap: 1 }}
      >
        {letters.map((letter, i) => {
          const isSecondE = letter === "e" && i === letters.length - 1;
          const animKey = isSecondE ? "e2" : letter;
          const animName = LETTER_ANIMS[animKey] || "letter-float";
          // Alternate theme tokens for visual rhythm: accent / foreground
          const colorClass = i % 2 === 0 ? "text-primary" : "text-foreground";
          return (
            <span
              key={i}
              className={`inline-block text-[34px] font-extrabold leading-tight ${colorClass}`}
              style={{
                letterSpacing: "-0.5px",
                animation: `${animName} 2.4s ease-in-out infinite`,
                animationDelay: `${LETTER_DELAYS[i] || 0}s`,
                transformOrigin: "50% 80%",
              }}
            >
              {letter}
            </span>
          );
        })}
        <sup className="text-[11px] font-semibold text-primary align-super self-start ml-px pt-1">
          ®
        </sup>
      </div>

      {/* ── Subtitle tagline ── */}
      <p
        className="text-muted-foreground text-[10px] tracking-[2.5px] uppercase mb-6 mt-0"
        style={{ animation: "fadeSlideUp 0.6s ease both 0.1s", animationFillMode: "both" }}
      >
        AI-Powered Workforce Platform
      </p>

      {/* ── Status message ── */}
      <p
        key={msgIdx}
        className="text-muted-foreground text-[13px] mb-5 text-center px-4"
        style={{ minHeight: 20, animation: "msgFade 0.4s ease both" }}
      >
        {LOADING_MESSAGES[msgIdx]}
      </p>

      {/* ── Three bouncing dots — theme-aware brand tones ── */}
      <div className="flex gap-1.5 mb-5">
        <span
          className="w-[7px] h-[7px] rounded-full bg-primary"
          style={{ animation: "dotBounce 1.2s ease-in-out infinite" }}
        />
        <span
          className="w-[7px] h-[7px] rounded-full bg-primary/70"
          style={{ animation: "dotBounce 1.2s ease-in-out infinite 0.18s" }}
        />
        <span
          className="w-[7px] h-[7px] rounded-full bg-primary/40"
          style={{ animation: "dotBounce 1.2s ease-in-out infinite 0.36s" }}
        />
      </div>

      {/* ── Progress shimmer bar ── */}
      <div
        className="rounded-full overflow-hidden bg-muted"
        style={{ width: 200, maxWidth: "70vw", height: 3 }}
      >
        <div
          className="h-full rounded-full bg-gradient-to-r from-primary via-primary/60 to-primary"
          style={{ backgroundSize: "300% 100%", animation: "barShimmer 2s linear infinite" }}
        />
      </div>

      {/* ── Copyright / trademark footer ── */}
      <div
        className="absolute bottom-5 left-0 right-0 flex flex-col items-center gap-1 px-4"
        style={{ animation: "fadeSlideUp 0.8s ease both 0.3s", animationFillMode: "both" }}
      >
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

      {/* ── Keyframes (inline to keep component self-contained) ── */}
      <style>{`
        @keyframes logoOrbit    { to { transform: rotate(360deg); } }
        @keyframes ringPulse    { 0%,100%{opacity:.4;transform:scale(1)}50%{opacity:.9;transform:scale(1.05)} }
        @keyframes arrowPulseBlue   { 0%,100%{opacity:1;filter:drop-shadow(0 0 6px #3b82f6)}50%{opacity:.7;filter:drop-shadow(0 0 14px #93c5fd)} }
        @keyframes arrowPulseOrange { 0%,100%{opacity:1;filter:drop-shadow(0 0 6px #f97316)}50%{opacity:.7;filter:drop-shadow(0 0 14px #fdba74)} }
        @keyframes arrowPulsePurple { 0%,100%{opacity:1;filter:drop-shadow(0 0 6px #8b5cf6)}50%{opacity:.7;filter:drop-shadow(0 0 14px #c4b5fd)} }
        @keyframes orbGlow      { 0%,100%{opacity:1;filter:drop-shadow(0 0 4px #fff)}50%{opacity:.85;filter:drop-shadow(0 0 10px #e2e8f0)} }
        @keyframes fadeSlideUp  { from{opacity:0;transform:translateY(12px)}to{opacity:1;transform:translateY(0)} }
        @keyframes msgFade      { from{opacity:0;transform:translateY(6px)}to{opacity:1;transform:translateY(0)} }
        @keyframes dotBounce    { 0%,80%,100%{transform:translateY(0)scale(1);opacity:.8}40%{transform:translateY(-8px)scale(1.2);opacity:1} }
        @keyframes barShimmer   { 0%{background-position:100% 50%}100%{background-position:-200% 50%} }
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
