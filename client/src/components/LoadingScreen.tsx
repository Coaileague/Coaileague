/**
 * CoAIleague Loading Screen — Trinity Gemini Orbital
 * ─────────────────────────────────────────────────────────────────────────────
 * Inspired by the Gemini AI loading animation:
 *   - Trinity diamond (4-pointed star) at center
 *   - Smooth colored light arcs sweeping in orbit around it
 *   - Each arc is a conic-gradient "comet tail" on its own orbit layer
 *   - Colors shift through Trinity's palette: violet → blue → amber → cyan
 *   - Three arcs at different speeds, radii, and phase offsets
 *   - Subtle inner glow pulses in sync with the sweep
 *
 * Nothing is particle-based. All motion is smooth CSS arc animation.
 */

import { useState, useEffect, useMemo } from "react";

const LOADING_MESSAGES = [
  "Preparing your workspace...",
  "Syncing intelligence...",
  "Connecting to Trinity...",
  "Almost there...",
];

const PLATFORM_NAME = "CoAIleague";

/** Trinity 4-pointed diamond — pure SVG, no external dependency */
function TrinityDiamond({ size = 72, glow = true }: { size?: number; glow?: boolean }) {
  const s = size;
  const h = s / 2;
  return (
    <svg width={s} height={s} viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg">
      {glow && (
        <defs>
          <filter id="tdGlow" x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur stdDeviation="6" result="blur" />
            <feMerge><feMergeNode in="blur"/><feMergeNode in="SourceGraphic"/></feMerge>
          </filter>
          <radialGradient id="tdGrad" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="#a78bfa" />
            <stop offset="60%" stopColor="#60a5fa" />
            <stop offset="100%" stopColor="#3730a3" />
          </radialGradient>
        </defs>
      )}
      {/* 4-pointed star / Gemini diamond shape */}
      <path
        d="M50 5 C50 5 56 38 95 50 C56 62 50 95 50 95 C50 95 44 62 5 50 C44 38 50 5 50 5Z"
        fill={glow ? "url(#tdGrad)" : "#a78bfa"}
        filter={glow ? "url(#tdGlow)" : undefined}
      />
    </svg>
  );
}

/** One sweeping arc — a gradient conic ring segment */
function SweepArc({
  radius,
  duration,
  delay,
  color1,
  color2,
  thickness = 3,
  arcDegrees = 110,
  direction = 1,
}: {
  radius: number;
  duration: number;
  delay: number;
  color1: string;
  color2: string;
  thickness?: number;
  arcDegrees?: number;
  direction?: 1 | -1;
}) {
  const size = (radius + thickness + 4) * 2;
  const cx = size / 2;
  const cy = size / 2;
  const r = radius;

  // Build arc path using SVG arc command
  const startAngle = -arcDegrees / 2;
  const endAngle   =  arcDegrees / 2;
  const toRad = (deg: number) => (deg * Math.PI) / 180;

  const x1 = cx + r * Math.cos(toRad(startAngle));
  const y1 = cy + r * Math.sin(toRad(startAngle));
  const x2 = cx + r * Math.cos(toRad(endAngle));
  const y2 = cy + r * Math.sin(toRad(endAngle));

  const animName = `sweep-${radius}-${direction > 0 ? 'cw' : 'ccw'}`;

  return (
    <div style={{
      position: "absolute",
      width: size,
      height: size,
      top: "50%",
      left: "50%",
      transform: "translate(-50%, -50%)",
      animation: `${animName} ${duration}s linear ${delay}s infinite`,
    }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} overflow="visible">
        <defs>
          <linearGradient id={`arc-grad-${radius}-${color1.replace('#','')}`}
            gradientUnits="userSpaceOnUse"
            x1={x1} y1={y1} x2={x2} y2={y2}>
            <stop offset="0%" stopColor={color1} stopOpacity="0" />
            <stop offset="40%" stopColor={color1} stopOpacity="0.9" />
            <stop offset="70%" stopColor={color2} stopOpacity="1" />
            <stop offset="100%" stopColor={color2} stopOpacity="0.2" />
          </linearGradient>
          <filter id={`arc-glow-${radius}`} x="-30%" y="-30%" width="160%" height="160%">
            <feGaussianBlur stdDeviation="2.5" result="blur" />
            <feMerge><feMergeNode in="blur"/><feMergeNode in="SourceGraphic"/></feMerge>
          </filter>
        </defs>
        <path
          d={`M ${x1} ${y1} A ${r} ${r} 0 0 1 ${x2} ${y2}`}
          fill="none"
          stroke={`url(#arc-grad-${radius}-${color1.replace('#','')})`}
          strokeWidth={thickness}
          strokeLinecap="round"
          filter={`url(#arc-glow-${radius})`}
        />
        {/* Bright leading tip */}
        <circle
          cx={x2} cy={y2} r={thickness * 0.9}
          fill={color2}
          filter={`url(#arc-glow-${radius})`}
          opacity={0.95}
        />
      </svg>
      <style>{`
        @keyframes ${animName} {
          from { transform: translate(-50%,-50%) rotate(${direction > 0 ? '0' : '360'}deg); }
          to   { transform: translate(-50%,-50%) rotate(${direction > 0 ? '360' : '0'}deg); }
        }
      `}</style>
    </div>
  );
}

export function LoadingScreen() {
  const [msgIdx, setMsgIdx] = useState(0);

  useEffect(() => {
    const t = setTimeout(() => {
      window.dispatchEvent(new Event("coaileague:force-ready"));
    }, 10000);
    return () => clearTimeout(t);
  }, []);

  useEffect(() => {
    const iv = setInterval(
      () => setMsgIdx((p) => (p + 1) % LOADING_MESSAGES.length),
      1800
    );
    return () => clearInterval(iv);
  }, []);

  return (
    <div
      className="fixed inset-0 flex flex-col items-center justify-center z-[9999]"
      style={{ backgroundColor: "#080f1e", color: "#e2e8f0" }}
      role="status"
      aria-live="polite"
      aria-label="Loading CoAIleague"
      data-testid="loading-screen"
    >
      {/* ── Ambient background glow ── */}
      <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
        <div style={{
          width: 320, height: 320, borderRadius: "50%",
          background: "radial-gradient(ellipse, rgba(139,92,246,0.08) 0%, transparent 70%)",
          animation: "ambientPulse 4s ease-in-out infinite",
        }} />
      </div>

      {/* ── Orbital system ── */}
      <div style={{
        position: "relative",
        width: 200,
        height: 200,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        marginBottom: 32,
      }}>

        {/* Arc 1 — Outer — Violet to Blue — slow CW */}
        <SweepArc
          radius={84}
          duration={3.2}
          delay={0}
          color1="#7c3aed"
          color2="#60a5fa"
          thickness={3.5}
          arcDegrees={120}
          direction={1}
        />

        {/* Arc 2 — Mid — Amber to Violet — medium CCW */}
        <SweepArc
          radius={65}
          duration={2.4}
          delay={0.6}
          color1="#f59e0b"
          color2="#a78bfa"
          thickness={3}
          arcDegrees={100}
          direction={-1}
        />

        {/* Arc 3 — Inner — Cyan to Amber — fast CW */}
        <SweepArc
          radius={48}
          duration={1.8}
          delay={0.3}
          color1="#22d3ee"
          color2="#fbbf24"
          thickness={2.5}
          arcDegrees={90}
          direction={1}
        />

        {/* Arc 4 — Outermost — subtle blue ghost ring — very slow */}
        <SweepArc
          radius={98}
          duration={5}
          delay={1.2}
          color1="rgba(96,165,250,0.3)"
          color2="rgba(139,92,246,0.4)"
          thickness={2}
          arcDegrees={80}
          direction={-1}
        />

        {/* ── Trinity diamond center ── */}
        <div style={{
          position: "relative",
          zIndex: 20,
          animation: "diamondPulse 3s ease-in-out infinite",
          willChange: "transform",
        }}>
          {/* Inner halo behind diamond */}
          <div style={{
            position: "absolute",
            inset: -16,
            borderRadius: "50%",
            background: "radial-gradient(ellipse, rgba(139,92,246,0.22) 0%, transparent 70%)",
            animation: "haloPulse 2s ease-in-out infinite",
          }} />
          <TrinityDiamond size={68} glow={true} />
        </div>
      </div>

      {/* ── Trinity™ label ── */}
      <div className="text-center mb-4" style={{ animation: "fadeUp 0.5s ease both" }}>
        <div style={{ display: "flex", alignItems: "baseline", justifyContent: "center", gap: 2 }}>
          <span style={{
            fontSize: 26,
            fontWeight: 700,
            letterSpacing: "-0.5px",
            background: "linear-gradient(135deg, #a78bfa 0%, #60a5fa 50%, #f59e0b 100%)",
            WebkitBackgroundClip: "text",
            WebkitTextFillColor: "transparent",
            backgroundClip: "text",
            animation: "gradientShift 4s ease-in-out infinite",
            backgroundSize: "200% 100%",
          }}>Trinity</span>
          <sup style={{ fontSize: 10, color: "#94a3b8", marginBottom: 8 }}>™</sup>
        </div>
        <span style={{
          display: "block",
          fontSize: 9,
          color: "#64748b",
          letterSpacing: "3px",
          textTransform: "uppercase",
          marginTop: 2,
        }}>AI Co-Pilot</span>
      </div>

      {/* ── CoAIleague wordmark ── */}
      <div style={{
        fontSize: 22,
        fontWeight: 800,
        letterSpacing: "-0.5px",
        marginBottom: 6,
        background: "linear-gradient(90deg, #a78bfa, #60a5fa, #f59e0b, #a78bfa)",
        WebkitBackgroundClip: "text",
        WebkitTextFillColor: "transparent",
        backgroundClip: "text",
        backgroundSize: "300% 100%",
        animation: "gradientShift 4s ease-in-out infinite",
      }}>
        CoAIleague<sup style={{ fontSize: 11, WebkitTextFillColor: "#a78bfa" }}>®</sup>
      </div>

      <p style={{
        fontSize: 9,
        color: "#475569",
        letterSpacing: "2.5px",
        textTransform: "uppercase",
        marginBottom: 24,
      }}>
        AI-Powered Workforce Platform
      </p>

      {/* ── Loading message ── */}
      <p
        key={msgIdx}
        style={{
          color: "#94a3b8",
          fontSize: 13,
          marginBottom: 20,
          animation: "msgFade 0.4s ease both",
          minHeight: 20,
          textAlign: "center",
        }}
      >
        {LOADING_MESSAGES[msgIdx]}
      </p>

      {/* ── Slim progress bar ── */}
      <div style={{
        width: 180,
        height: 2,
        borderRadius: 2,
        background: "rgba(255,255,255,0.06)",
        overflow: "hidden",
      }}>
        <div style={{
          height: "100%",
          borderRadius: 2,
          background: "linear-gradient(90deg, #7c3aed, #60a5fa, #f59e0b)",
          backgroundSize: "300% 100%",
          animation: "barShimmer 2s linear infinite",
        }} />
      </div>

      {/* ── Footer ── */}
      <div style={{
        position: "absolute",
        bottom: 20,
        left: 0,
        right: 0,
        textAlign: "center",
        animation: "fadeUp 0.8s ease both 0.3s",
        animationFillMode: "both",
      }}>
        <p style={{ fontSize: 10, color: "#334155", letterSpacing: "0.5px" }}>
          © {new Date().getFullYear()} CoAIleague® · Trinity™ is a trademark of CoAIleague
        </p>
      </div>

      <style>{`
        @keyframes ambientPulse   { 0%,100%{opacity:.6;transform:scale(1)}50%{opacity:1;transform:scale(1.08)} }
        @keyframes diamondPulse   { 0%,100%{transform:scale(1) rotate(-2deg)}50%{transform:scale(1.06) rotate(2deg)} }
        @keyframes haloPulse      { 0%,100%{opacity:.5;transform:scale(1)}50%{opacity:1;transform:scale(1.3)} }
        @keyframes gradientShift  { 0%{background-position:0% 50%}50%{background-position:100% 50%}100%{background-position:0% 50%} }
        @keyframes barShimmer     { 0%{background-position:100% 50%}100%{background-position:-200% 50%} }
        @keyframes fadeUp         { from{opacity:0;transform:translateY(10px)}to{opacity:1;transform:translateY(0)} }
        @keyframes msgFade        { from{opacity:0;transform:translateY(5px)}to{opacity:1;transform:translateY(0)} }
      `}</style>
    </div>
  );
}
