/**
 * CoAIleague Animated Splash / Loading Screen
 * - SVG trinity logo (blue/orange/purple arrows + orb) with orbital spin + pulse
 * - "CoAIleague" with per-letter alive animations (spread, rotate, float, bounce)
 * - Rotating status messages + progress shimmer bar
 * - Fully self-contained, zero lazy-load dependency
 */

import { useState, useEffect } from "react";

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
      className="fixed inset-0 flex flex-col items-center justify-center z-[9999]"
      style={{ background: "linear-gradient(135deg, #0a1628 0%, #0f2247 50%, #0a1628 100%)" }}
      role="status"
      aria-live="polite"
      aria-label="Loading CoAIleague"
      data-testid="loading-screen"
    >
      {/* ── Ambient glow rings ── */}
      <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
        <div style={{ width: 320, height: 320, borderRadius: "50%", border: "1px solid rgba(96,165,250,0.08)", animation: "ringPulse 3s ease-in-out infinite" }} />
        <div style={{ position: "absolute", width: 220, height: 220, borderRadius: "50%", border: "1px solid rgba(251,146,60,0.08)", animation: "ringPulse 3s ease-in-out infinite 1s" }} />
        <div style={{ position: "absolute", width: 150, height: 150, borderRadius: "50%", border: "1px solid rgba(167,139,250,0.08)", animation: "ringPulse 3s ease-in-out infinite 2s" }} />
      </div>

      {/* ── Trinity SVG Logo + name ── */}
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", marginBottom: 20 }}>
        {/* Spinning logo */}
        <div style={{ position: "relative", width: 120, height: 120, marginBottom: 10 }}>
          <div style={{ animation: "logoOrbit 6s linear infinite", width: "100%", height: "100%" }}>
            <svg viewBox="0 0 120 120" width="120" height="120" xmlns="http://www.w3.org/2000/svg">
              {/* Blue arrow — UP */}
              <g style={{ animation: "arrowPulseBlue 2s ease-in-out infinite" }}>
                <polygon points="60,8 72,32 64,32 64,58 56,58 56,32 48,32" fill="#3b82f6" />
                <polygon points="60,4 76,28 44,28" fill="#60a5fa" />
              </g>
              {/* Orange arrow — BOTTOM-RIGHT */}
              <g style={{ transformOrigin: "60px 60px", transform: "rotate(120deg)", animation: "arrowPulseOrange 2s ease-in-out infinite 0.66s" }}>
                <polygon points="60,8 72,32 64,32 64,58 56,58 56,32 48,32" fill="#f97316" />
                <polygon points="60,4 76,28 44,28" fill="#fb923c" />
              </g>
              {/* Purple arrow — BOTTOM-LEFT */}
              <g style={{ transformOrigin: "60px 60px", transform: "rotate(240deg)", animation: "arrowPulsePurple 2s ease-in-out infinite 1.33s" }}>
                <polygon points="60,8 72,32 64,32 64,58 56,58 56,32 48,32" fill="#8b5cf6" />
                <polygon points="60,4 76,28 44,28" fill="#a78bfa" />
              </g>
              {/* Center orb */}
              <circle cx="60" cy="60" r="10" fill="white" style={{ animation: "orbGlow 2s ease-in-out infinite" }} />
              <circle cx="60" cy="60" r="7" fill="#e2e8f0" />
            </svg>
          </div>
        </div>

        {/* Trinity™ — the AI identity */}
        <div style={{ textAlign: "center", animation: "fadeSlideUp 0.5s ease both" }}>
          <span
            style={{
              fontSize: 22,
              fontWeight: 700,
              background: "linear-gradient(90deg, #60a5fa, #a78bfa, #fb923c)",
              WebkitBackgroundClip: "text",
              WebkitTextFillColor: "transparent",
              backgroundClip: "text",
              letterSpacing: 1,
            }}
          >
            Trinity
          </span>
          <sup
            style={{
              fontSize: 10,
              fontWeight: 600,
              color: "#94a3b8",
              WebkitTextFillColor: "#94a3b8",
              verticalAlign: "super",
              letterSpacing: 0,
            }}
          >
            ™
          </sup>
          <span
            style={{
              display: "block",
              fontSize: 9,
              color: "#475569",
              letterSpacing: 2,
              textTransform: "uppercase",
              marginTop: 1,
            }}
          >
            AI Co-Pilot
          </span>
        </div>
      </div>

      {/* ── "CoAIleague" — per-letter alive animations ── */}
      <div
        aria-label={PLATFORM_NAME}
        style={{ display: "flex", alignItems: "flex-end", gap: 1, marginBottom: 4 }}
      >
        {letters.map((letter, i) => {
          const isSecondE = letter === "e" && i === letters.length - 1;
          const animKey = isSecondE ? "e2" : letter;
          const animName = LETTER_ANIMS[animKey] || "letter-float";
          return (
            <span
              key={i}
              style={{
                display: "inline-block",
                fontSize: 34,
                fontWeight: 800,
                letterSpacing: "-0.5px",
                background: i < 2
                  ? "linear-gradient(180deg, #60a5fa, #3b82f6)"
                  : i < 4
                  ? "linear-gradient(180deg, #f97316, #fb923c)"
                  : i < 7
                  ? "linear-gradient(180deg, #a78bfa, #8b5cf6)"
                  : "linear-gradient(180deg, #60a5fa, #a78bfa)",
                WebkitBackgroundClip: "text",
                WebkitTextFillColor: "transparent",
                backgroundClip: "text",
                animation: `${animName} 2.4s ease-in-out infinite`,
                animationDelay: `${LETTER_DELAYS[i] || 0}s`,
                transformOrigin: "50% 80%",
                lineHeight: 1.1,
              }}
            >
              {letter}
            </span>
          );
        })}
        {/* Platform trademark mark */}
        <sup
          style={{
            fontSize: 11,
            fontWeight: 600,
            color: "#60a5fa",
            WebkitTextFillColor: "#60a5fa",
            verticalAlign: "super",
            marginLeft: 1,
            alignSelf: "flex-start",
            paddingTop: 4,
          }}
        >
          ®
        </sup>
      </div>

      {/* ── Subtitle tagline ── */}
      <p
        style={{
          color: "#64748b",
          fontSize: 10,
          letterSpacing: 2.5,
          textTransform: "uppercase",
          marginBottom: 24,
          animation: "fadeSlideUp 0.6s ease both 0.1s",
          animationFillMode: "both",
        }}
      >
        AI-Powered Workforce Platform
      </p>

      {/* ── Status message ── */}
      <p
        key={msgIdx}
        style={{
          color: "#64748b",
          fontSize: 13,
          marginBottom: 20,
          minHeight: 20,
          animation: "msgFade 0.4s ease both",
          textAlign: "center",
          paddingLeft: 16,
          paddingRight: 16,
        }}
      >
        {LOADING_MESSAGES[msgIdx]}
      </p>

      {/* ── Three bouncing dots ── */}
      <div style={{ display: "flex", gap: 6, marginBottom: 20 }}>
        {[0, 1, 2].map((i) => (
          <span
            key={i}
            style={{
              width: 7,
              height: 7,
              borderRadius: "50%",
              background: i === 0 ? "#3b82f6" : i === 1 ? "#f97316" : "#8b5cf6",
              animation: "dotBounce 1.2s ease-in-out infinite",
              animationDelay: `${i * 0.18}s`,
            }}
          />
        ))}
      </div>

      {/* ── Progress shimmer bar ── */}
      <div
        style={{
          width: 200,
          maxWidth: "70vw",
          height: 3,
          background: "rgba(255,255,255,0.06)",
          borderRadius: 99,
          overflow: "hidden",
        }}
      >
        <div
          style={{
            height: "100%",
            borderRadius: 99,
            background: "linear-gradient(90deg, #3b82f6, #8b5cf6, #f97316, #3b82f6)",
            backgroundSize: "300% 100%",
            animation: "barShimmer 2s linear infinite",
          }}
        />
      </div>

      {/* ── Copyright / trademark footer ── */}
      <div
        style={{
          position: "absolute",
          bottom: 20,
          left: 0,
          right: 0,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          gap: 4,
          animation: "fadeSlideUp 0.8s ease both 0.3s",
          animationFillMode: "both",
        }}
      >
        {/* "Powered by Trinity™" line */}
        <p style={{ fontSize: 11, color: "#334155", margin: 0, letterSpacing: 0.5 }}>
          Powered by{" "}
          <span
            style={{
              fontWeight: 700,
              background: "linear-gradient(90deg, #60a5fa, #a78bfa, #fb923c)",
              WebkitBackgroundClip: "text",
              WebkitTextFillColor: "transparent",
              backgroundClip: "text",
            }}
          >
            Trinity
          </span>
          <span style={{ color: "#475569", WebkitTextFillColor: "#475569", fontSize: 9, verticalAlign: "super" }}>™</span>
        </p>

        {/* Copyright line */}
        <p style={{ fontSize: 10, color: "#1e293b", margin: 0, letterSpacing: 0.3, textAlign: "center", paddingLeft: 16, paddingRight: 16 }}>
          © {new Date().getFullYear()} CoAIleague
          <span style={{ color: "#475569", fontSize: 9, verticalAlign: "super" }}>®</span>
          {" "}· Trinity
          <span style={{ color: "#475569", fontSize: 9, verticalAlign: "super" }}>™</span>
          {" "}is a trademark of CoAIleague. All rights reserved.
        </p>
      </div>

      {/* ── All keyframes ── */}
      <style>{`
        /* Logo orbit */
        @keyframes logoOrbit {
          from { transform: rotate(0deg); }
          to   { transform: rotate(360deg); }
        }

        /* Arrow pulse colours */
        @keyframes arrowPulseBlue {
          0%,100% { opacity: 1; filter: drop-shadow(0 0 6px #3b82f6); }
          50%      { opacity: 0.7; filter: drop-shadow(0 0 14px #93c5fd); }
        }
        @keyframes arrowPulseOrange {
          0%,100% { opacity: 1; filter: drop-shadow(0 0 6px #f97316); }
          50%      { opacity: 0.7; filter: drop-shadow(0 0 14px #fdba74); }
        }
        @keyframes arrowPulsePurple {
          0%,100% { opacity: 1; filter: drop-shadow(0 0 6px #8b5cf6); }
          50%      { opacity: 0.7; filter: drop-shadow(0 0 14px #c4b5fd); }
        }

        /* Center orb */
        @keyframes orbGlow {
          0%,100% { r: 10; opacity: 1; filter: drop-shadow(0 0 4px #fff); }
          50%      { r: 12; opacity: 0.85; filter: drop-shadow(0 0 10px #e2e8f0); }
        }

        /* Ambient rings */
        @keyframes ringPulse {
          0%,100% { opacity: 0.4; transform: scale(1); }
          50%      { opacity: 0.9; transform: scale(1.05); }
        }

        /* ── Per-letter animations ── */

        /* C — slides from left */
        @keyframes letter-slide-left {
          0%,100% { transform: translateX(0); }
          30%      { transform: translateX(-6px) rotate(-8deg); }
          60%      { transform: translateX(2px) rotate(3deg); }
        }

        /* o — falls from top and bounces */
        @keyframes letter-fall-top {
          0%,100% { transform: translateY(0); }
          25%      { transform: translateY(-10px) scaleY(0.9); }
          55%      { transform: translateY(4px) scaleY(1.1); }
          75%      { transform: translateY(-3px); }
        }

        /* A — rotates */
        @keyframes letter-rotate {
          0%,100% { transform: rotate(0deg); }
          40%      { transform: rotate(-18deg) scale(1.15); }
          70%      { transform: rotate(8deg) scale(0.95); }
        }

        /* I — zooms in/out */
        @keyframes letter-zoom {
          0%,100% { transform: scale(1); }
          35%      { transform: scale(1.35) translateY(-4px); }
          65%      { transform: scale(0.85) translateY(3px); }
        }

        /* l — stretches tall */
        @keyframes letter-stretch {
          0%,100% { transform: scaleY(1); }
          40%      { transform: scaleY(1.4) translateY(-5px); }
          70%      { transform: scaleY(0.85) translateY(3px); }
        }

        /* e — spins around Y axis (flip) */
        @keyframes letter-spin {
          0%,100% { transform: rotateY(0deg); }
          40%      { transform: rotateY(180deg) scale(1.1); }
          80%      { transform: rotateY(320deg); }
        }

        /* a — bounces vertically */
        @keyframes letter-bounce {
          0%,100% { transform: translateY(0) scale(1); }
          30%      { transform: translateY(-12px) scale(1.1); }
          55%      { transform: translateY(5px) scale(0.95); }
          75%      { transform: translateY(-4px); }
        }

        /* g — swings like a pendulum */
        @keyframes letter-swing {
          0%,100% { transform: rotate(0deg); }
          25%      { transform: rotate(15deg); }
          50%      { transform: rotate(-12deg); }
          75%      { transform: rotate(7deg); }
        }

        /* u — wobbles left/right */
        @keyframes letter-wobble {
          0%,100% { transform: skewX(0deg); }
          20%      { transform: skewX(-10deg) translateX(-3px); }
          50%      { transform: skewX(8deg) translateX(3px); }
          80%      { transform: skewX(-4deg); }
        }

        /* final e — slides from right */
        @keyframes letter-slide-right {
          0%,100% { transform: translateX(0); }
          30%      { transform: translateX(6px) rotate(8deg); }
          60%      { transform: translateX(-2px) rotate(-3deg); }
        }

        /* generic float fallback */
        @keyframes letter-float {
          0%,100% { transform: translateY(0); }
          50%      { transform: translateY(-8px); }
        }

        /* Status message fade */
        @keyframes msgFade {
          from { opacity: 0; transform: translateY(6px); }
          to   { opacity: 1; transform: translateY(0); }
        }

        /* Subtitle fade+slide */
        @keyframes fadeSlideUp {
          from { opacity: 0; transform: translateY(12px); }
          to   { opacity: 1; transform: translateY(0); }
        }

        /* Loading dots */
        @keyframes dotBounce {
          0%,80%,100% { transform: translateY(0) scale(1); opacity: 0.8; }
          40%          { transform: translateY(-8px) scale(1.2); opacity: 1; }
        }

        /* Progress bar shimmer */
        @keyframes barShimmer {
          0%   { background-position: 100% 50%; }
          100% { background-position: -200% 50%; }
        }
      `}</style>
    </div>
  );
}
