/**
 * CoAIleague Loading Screen — Trinity Halo
 * ─────────────────────────────────────────────────────────────────────────────
 * IDENTITY LOCK: Uses the existing TrinityOrbitalAvatar asset unchanged.
 * This component ONLY adds external halo sweep arcs around the existing icon.
 *
 * Visual design:
 *   Center: TrinityOrbitalAvatar (existing component, state="loading")
 *           — 3-arm trifecta + spinning orbital rings, unchanged
 *   Halo:   4 colored sweep arcs orbiting OUTSIDE the avatar
 *           Purple (#7C3AED) → Teal (#0D9488) → Gold (#F59E0B)
 *           Each arc is an SVG path segment, not a particle system.
 *           Smooth conic-gradient "comet tail" — same Gemini-style energy.
 */

import { useState, useEffect } from "react";
import { TrinityOrbitalAvatar } from "@/components/ui/trinity-animated-logo";

const LOADING_MESSAGES = [
  "Connecting to Trinity...",
  "Preparing your workspace...",
  "Syncing intelligence...",
  "Almost there...",
];

const PLATFORM_NAME = "CoAIleague";

/** Single branded halo arc orbiting outside TrinityOrbitalAvatar */
function HaloArc({
  radius,
  duration,
  delay,
  colorFrom,
  colorTo,
  thickness = 3,
  arcDeg = 110,
  ccw = false,
}: {
  radius: number;
  duration: number;
  delay: number;
  colorFrom: string;
  colorTo: string;
  thickness?: number;
  arcDeg?: number;
  ccw?: boolean;
}) {
  const box   = (radius + thickness + 6) * 2;
  const cx    = box / 2;
  const cy    = box / 2;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const half  = arcDeg / 2;
  const x1 = cx + radius * Math.cos(toRad(-half));
  const y1 = cy + radius * Math.sin(toRad(-half));
  const x2 = cx + radius * Math.cos(toRad(half));
  const y2 = cy + radius * Math.sin(toRad(half));
  const gid = `halo-${radius}-${colorFrom.slice(1, 5)}`;
  const animName = `haloSpin-${radius}-${ccw ? 'ccw' : 'cw'}`;

  return (
    <div style={{
      position: "absolute",
      width: box,
      height: box,
      top: "50%",
      left: "50%",
      transform: "translate(-50%,-50%)",
      animation: `${animName} ${duration}s linear ${delay}s infinite`,
      willChange: "transform",
      pointerEvents: "none",
    }}>
      <svg width={box} height={box} viewBox={`0 0 ${box} ${box}`} overflow="visible">
        <defs>
          <linearGradient id={gid} gradientUnits="userSpaceOnUse"
            x1={x1} y1={y1} x2={x2} y2={y2}>
            <stop offset="0%"   stopColor={colorFrom} stopOpacity="0"   />
            <stop offset="35%"  stopColor={colorFrom} stopOpacity="0.8" />
            <stop offset="80%"  stopColor={colorTo}   stopOpacity="1"   />
            <stop offset="100%" stopColor={colorTo}   stopOpacity="0.2" />
          </linearGradient>
          <filter id={`${gid}-glow`} x="-40%" y="-40%" width="180%" height="180%">
            <feGaussianBlur stdDeviation="2" result="b"/>
            <feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge>
          </filter>
        </defs>

        {/* Arc path */}
        <path
          d={`M ${x1} ${y1} A ${radius} ${radius} 0 0 1 ${x2} ${y2}`}
          fill="none"
          stroke={`url(#${gid})`}
          strokeWidth={thickness}
          strokeLinecap="round"
          filter={`url(#${gid}-glow)`}
        />
        {/* Bright leading tip */}
        <circle cx={x2} cy={y2} r={thickness * 0.85}
          fill={colorTo} filter={`url(#${gid}-glow)`} opacity={0.9} />
      </svg>

      <style>{`
        @keyframes ${animName} {
          from { transform: translate(-50%,-50%) rotate(${ccw ? '360deg' : '0deg'}); }
          to   { transform: translate(-50%,-50%) rotate(${ccw ? '0deg'   : '360deg'}); }
        }
      `}</style>
    </div>
  );
}

export function LoadingScreen() {
  const [msgIdx, setMsgIdx] = useState(0);

  /* Force-ready fallback — never leave user stuck on splash */
  useEffect(() => {
    const t = setTimeout(() => {
      window.dispatchEvent(new Event("coaileague:force-ready"));
    }, 10_000);
    return () => clearTimeout(t);
  }, []);

  useEffect(() => {
    const iv = setInterval(
      () => setMsgIdx(p => (p + 1) % LOADING_MESSAGES.length),
      1800
    );
    return () => clearInterval(iv);
  }, []);

  const letters = PLATFORM_NAME.split("");

  return (
    <div
      className="fixed inset-0 flex flex-col items-center justify-center z-[9999]"
      style={{ backgroundColor: "#080f1e", color: "#e2e8f0" }}
      role="status"
      aria-live="polite"
      aria-label="Loading CoAIleague"
      data-testid="loading-screen"
    >
      {/* ── Ambient radial glow behind everything ── */}
      <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
        <div style={{
          width: 360, height: 360, borderRadius: "50%",
          background: "radial-gradient(ellipse, rgba(109,40,217,0.10) 0%, rgba(13,148,136,0.05) 45%, transparent 70%)",
          animation: "ambientPulse 5s ease-in-out infinite",
        }} />
      </div>

      {/* ── TrinityOrbitalAvatar + external halo arcs ── */}
      <div style={{
        position: "relative",
        width: 220,
        height: 220,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        marginBottom: 28,
      }}>

        {/* Halo Arc 1 — Outer — Purple → Teal — slow CW */}
        <HaloArc
          radius={96}  duration={3.6}  delay={0}
          colorFrom="#7C3AED" colorTo="#0D9488"
          thickness={3.5} arcDeg={120}
        />

        {/* Halo Arc 2 — Mid — Teal → Gold — medium CCW */}
        <HaloArc
          radius={76}  duration={2.6}  delay={0.7}
          colorFrom="#0D9488" colorTo="#F59E0B"
          thickness={3} arcDeg={105} ccw
        />

        {/* Halo Arc 3 — Inner — Gold → Purple — fast CW */}
        <HaloArc
          radius={58}  duration={1.9}  delay={0.3}
          colorFrom="#F59E0B" colorTo="#7C3AED"
          thickness={2.5} arcDeg={90}
        />

        {/* Halo Arc 4 — Ghost outer — very faint purple ring */}
        <HaloArc
          radius={110} duration={5.5} delay={1.4}
          colorFrom="rgba(124,58,237,0.25)" colorTo="rgba(13,148,136,0.35)"
          thickness={1.8} arcDeg={75} ccw
        />

        {/* ── EXISTING TrinityOrbitalAvatar — UNCHANGED ── */}
        <div style={{ position: "relative", zIndex: 20 }}>
          {/* Inner pulse ring — glows with the avatar */}
          <div style={{
            position: "absolute",
            inset: -14,
            borderRadius: "50%",
            background: "radial-gradient(ellipse, rgba(109,40,217,0.20) 0%, transparent 70%)",
            animation: "corePulse 2.4s ease-in-out infinite",
          }} />
          <TrinityOrbitalAvatar size={100} state="loading" />
        </div>
      </div>

      {/* ── Trinity™ wordmark ── */}
      <div className="text-center mb-4" style={{ animation: "fadeUp 0.5s ease both" }}>
        <div style={{ display: "flex", alignItems: "baseline", justifyContent: "center", gap: 3 }}>
          <span style={{
            fontSize: 24,
            fontWeight: 700,
            background: "linear-gradient(135deg, #7C3AED 0%, #0D9488 50%, #F59E0B 100%)",
            WebkitBackgroundClip: "text",
            WebkitTextFillColor: "transparent",
            backgroundClip: "text",
            backgroundSize: "200% 100%",
            animation: "gradShift 4s ease-in-out infinite",
          }}>Trinity</span>
          <sup style={{ fontSize: 10, color: "#64748b", marginBottom: 6 }}>™</sup>
        </div>
        <span style={{
          display: "block",
          fontSize: 8.5,
          color: "#475569",
          letterSpacing: "3px",
          textTransform: "uppercase",
          marginTop: 2,
        }}>AI Co-Pilot</span>
      </div>

      {/* ── CoAIleague letter-by-letter ── */}
      <div aria-label={PLATFORM_NAME} style={{ display: "flex", alignItems: "flex-end", gap: 0, marginBottom: 6 }}>
        {letters.map((letter, i) => (
          <span key={i}
            style={{
              display: "inline-block",
              fontSize: 26,
              fontWeight: 800,
              letterSpacing: "-0.5px",
              lineHeight: 1.1,
              color: i % 2 === 0 ? "#a78bfa" : "#e2e8f0",
              animation: `letterBob 2.4s ease-in-out ${i * 0.05}s infinite`,
              transformOrigin: "50% 80%",
            }}>{letter}</span>
        ))}
        <sup style={{ fontSize: 11, color: "#7c3aed", alignSelf: "flex-start", marginTop: 4, marginLeft: 1 }}>®</sup>
      </div>

      <p style={{
        fontSize: 9,
        color: "#334155",
        letterSpacing: "2.5px",
        textTransform: "uppercase",
        marginBottom: 22,
      }}>
        AI-Powered Workforce Platform
      </p>

      {/* ── Rotating loading message ── */}
      <p key={msgIdx} style={{
        color: "#94a3b8",
        fontSize: 13,
        marginBottom: 20,
        minHeight: 20,
        animation: "msgFade 0.4s ease both",
        textAlign: "center",
      }}>
        {LOADING_MESSAGES[msgIdx]}
      </p>

      {/* ── Slim shimmer bar ── */}
      <div style={{
        width: 180, height: 2, borderRadius: 2,
        background: "rgba(255,255,255,0.06)", overflow: "hidden",
      }}>
        <div style={{
          height: "100%", borderRadius: 2,
          background: "linear-gradient(90deg, #7C3AED, #0D9488, #F59E0B, #7C3AED)",
          backgroundSize: "300% 100%",
          animation: "barShimmer 2s linear infinite",
        }} />
      </div>

      {/* ── Footer ── */}
      <div style={{
        position: "absolute", bottom: 18, left: 0, right: 0,
        textAlign: "center",
        animation: "fadeUp 0.8s ease both 0.3s",
        animationFillMode: "both",
      }}>
        <p style={{ fontSize: 10, color: "#1e293b" }}>
          © {new Date().getFullYear()} CoAIleague® · Trinity™ is a trademark of CoAIleague
        </p>
      </div>

      <style>{`
        @keyframes ambientPulse { 0%,100%{opacity:.6;transform:scale(1)}  50%{opacity:1;transform:scale(1.1)} }
        @keyframes corePulse    { 0%,100%{opacity:.4;transform:scale(1)}  50%{opacity:1;transform:scale(1.4)} }
        @keyframes gradShift    { 0%{background-position:0% 50%} 50%{background-position:100% 50%} 100%{background-position:0% 50%} }
        @keyframes barShimmer   { 0%{background-position:100% 50%} 100%{background-position:-200% 50%} }
        @keyframes fadeUp       { from{opacity:0;transform:translateY(10px)} to{opacity:1;transform:translateY(0)} }
        @keyframes msgFade      { from{opacity:0;transform:translateY(5px)}  to{opacity:1;transform:translateY(0)} }
        @keyframes letterBob    { 0%,100%{transform:translateY(0)} 50%{transform:translateY(-5px)} }
      `}</style>
    </div>
  );
}
