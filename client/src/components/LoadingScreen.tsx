/**
 * CoAIleague Loading Screen — Trinity Gemini Arc
 * ─────────────────────────────────────────────────────────────────────────────
 * IDENTITY LOCK: TrinityOrbitalAvatar at center, shape unchanged.
 * The HALO is a single CSS conic-gradient arc — the TRUE Gemini technique:
 *   ONE rotating ring where the gradient creates the color sweep illusion.
 *   Colors cycle: transparent → Purple → Blue → Teal → Gold → transparent.
 *   As the ring spins, colors appear to chase each other around the icon.
 *   No SVG paths. No separate arc components. Pure CSS conic-gradient.
 */

import { useState, useEffect } from "react";
import { TrinityOrbitalAvatar } from "@/components/ui/trinity-animated-logo";

const LOADING_MESSAGES = [
  "Connecting to Trinity...",
  "Preparing your workspace...",
  "Syncing intelligence...",
  "Almost there...",
];

export function LoadingScreen() {
  const [msgIdx, setMsgIdx] = useState(0);

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

  return (
    <div
      className="fixed inset-0 flex flex-col items-center justify-center z-[9999]"
      style={{ backgroundColor: "#080f1e", color: "#e2e8f0" }}
      role="status"
      aria-live="polite"
      aria-label="Loading CoAIleague"
      data-testid="loading-screen"
    >
      {/* ── Ambient radial glow ── */}
      <div
        className="absolute inset-0 flex items-center justify-center pointer-events-none"
        aria-hidden="true"
      >
        <div style={{
          width: 320, height: 320, borderRadius: "50%",
          background: "radial-gradient(ellipse, rgba(109,40,217,0.09) 0%, rgba(13,148,136,0.05) 45%, transparent 70%)",
          animation: "ambientPulse 5s ease-in-out infinite",
        }} />
      </div>

      {/* ── Halo + Trinity icon ── */}
      <div
        style={{ position: "relative", width: 200, height: 200, marginBottom: 28 }}
        aria-hidden="true"
      >
        {/* Outer Gemini arc — conic-gradient ring, slow rotation */}
        <div style={{
          position: "absolute", inset: -16, borderRadius: "50%",
          background: "conic-gradient(from 0deg, transparent 0deg, #7C3AED 40deg, #2563EB 100deg, #0D9488 170deg, #F59E0B 230deg, rgba(245,158,11,0.3) 270deg, transparent 300deg)",
          animation: "geminiSpin 2.4s linear infinite",
          // Punch a hole — ring thickness ≈ 4px
          mask: "radial-gradient(farthest-side, transparent calc(100% - 5px), white calc(100% - 4px))",
          WebkitMask: "radial-gradient(farthest-side, transparent calc(100% - 5px), white calc(100% - 4px))",
          filter: "blur(0.5px)",
        }} />

        {/* Inner Gemini arc — tighter ring, counter-rotation, offset phase */}
        <div style={{
          position: "absolute", inset: 2, borderRadius: "50%",
          background: "conic-gradient(from 180deg, transparent 0deg, #0D9488 50deg, #F59E0B 120deg, #7C3AED 190deg, rgba(124,58,237,0.2) 240deg, transparent 270deg)",
          animation: "geminiSpinCCW 3.6s linear infinite",
          mask: "radial-gradient(farthest-side, transparent calc(100% - 4px), white calc(100% - 3px))",
          WebkitMask: "radial-gradient(farthest-side, transparent calc(100% - 4px), white calc(100% - 3px))",
          opacity: 0.7,
          filter: "blur(0.3px)",
        }} />

        {/* ── Existing TrinityOrbitalAvatar — UNCHANGED ── */}
        <div style={{
          position: "absolute", inset: 0,
          display: "flex", alignItems: "center", justifyContent: "center",
          zIndex: 10,
        }}>
          {/* Inner core glow pulse */}
          <div style={{
            position: "absolute", inset: 20, borderRadius: "50%",
            background: "radial-gradient(ellipse, rgba(109,40,217,0.18) 0%, transparent 70%)",
            animation: "corePulse 2.4s ease-in-out infinite",
          }} />
          <TrinityOrbitalAvatar size={110} state="loading" />
        </div>
      </div>

      {/* ── Trinity wordmark ── */}
      <div className="text-center mb-4" style={{ animation: "fadeUp 0.5s ease both" }}>
        <div style={{ display: "flex", alignItems: "baseline", justifyContent: "center", gap: 3 }}>
          <span style={{
            fontSize: 24, fontWeight: 700,
            background: "linear-gradient(135deg, #7C3AED 0%, #0D9488 50%, #F59E0B 100%)",
            WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent",
            backgroundClip: "text", backgroundSize: "200% 100%",
            animation: "gradShift 4s ease-in-out infinite",
          }}>Trinity</span>
          <sup style={{ fontSize: 10, color: "#64748b", marginBottom: 6 }}>™</sup>
        </div>
        <span style={{
          display: "block", fontSize: 8.5, color: "#475569",
          letterSpacing: "3px", textTransform: "uppercase", marginTop: 2,
        }}>AI Co-Pilot</span>
      </div>

      {/* ── CoAIleague wordmark ── */}
      <div style={{
        fontSize: 22, fontWeight: 800, letterSpacing: "-0.5px", marginBottom: 6,
        background: "linear-gradient(90deg, #7C3AED, #0D9488, #F59E0B, #7C3AED)",
        WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent",
        backgroundClip: "text", backgroundSize: "300% 100%",
        animation: "gradShift 4s ease-in-out infinite",
      }}>
        CoAIleague<sup style={{ fontSize: 11, WebkitTextFillColor: "#7c3aed" }}>®</sup>
      </div>

      <p style={{
        fontSize: 9, color: "#334155", letterSpacing: "2.5px",
        textTransform: "uppercase", marginBottom: 22,
      }}>
        AI-Powered Workforce Platform
      </p>

      {/* ── Rotating message ── */}
      <p key={msgIdx} style={{
        color: "#94a3b8", fontSize: 13, marginBottom: 20,
        minHeight: 20, animation: "msgFade 0.4s ease both", textAlign: "center",
      }}>
        {LOADING_MESSAGES[msgIdx]}
      </p>

      {/* ── Slim Gemini shimmer bar ── */}
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
        textAlign: "center", animation: "fadeUp 0.8s ease both 0.3s",
        animationFillMode: "both",
      }}>
        <p style={{ fontSize: 10, color: "#1e293b" }}>
          © {new Date().getFullYear()} CoAIleague® · Trinity™
        </p>
      </div>

      <style>{`
        @keyframes geminiSpin     { to { transform: rotate(360deg); } }
        @keyframes geminiSpinCCW  { to { transform: rotate(-360deg); } }
        @keyframes ambientPulse   { 0%,100%{opacity:.6;transform:scale(1)}  50%{opacity:1;transform:scale(1.1)} }
        @keyframes corePulse      { 0%,100%{opacity:.4;transform:scale(1)}  50%{opacity:1;transform:scale(1.4)} }
        @keyframes gradShift      { 0%{background-position:0% 50%} 50%{background-position:100% 50%} 100%{background-position:0% 50%} }
        @keyframes barShimmer     { 0%{background-position:100% 50%} 100%{background-position:-200% 50%} }
        @keyframes fadeUp         { from{opacity:0;transform:translateY(10px)} to{opacity:1;transform:translateY(0)} }
        @keyframes msgFade        { from{opacity:0;transform:translateY(5px)}  to{opacity:1;transform:translateY(0)} }
      `}</style>
    </div>
  );
}
