/**
 * LoadingScreen — full-viewport loading state shown while auth resolves
 * or while a universal page gates on data.
 *
 * SPLASH OVERHAUL v2 (2026-04-08):
 *   This file used to be a 442-line self-contained component with a
 *   hardcoded navy gradient background (`#0a1628`), a bespoke three-arrow
 *   Trinity SVG animation, per-letter keyframe animations, and hardcoded
 *   dark footer colors. It completely bypassed the theme token system so
 *   light-mode visitors saw a dark backdrop and unreadable footer text.
 *
 *   Replaced with a theme-aware layout that reuses the single source of
 *   truth for loading motion: <UniversalLogoSpinner />. All colors flow
 *   from CSS custom properties (`bg-background`, `text-foreground`,
 *   `text-muted-foreground`, `text-primary`) so both light and dark
 *   modes render correctly. The layout mirrors SplashScreen for
 *   perceptual continuity across boot → auth-loading → dashboard.
 */

import { useState, useEffect } from "react";
import { UniversalLogoSpinner } from "@/components/ui/universal-logo-spinner";

const PLATFORM_NAME =
  (import.meta.env.VITE_PLATFORM_NAME as string) || "CoAIleague";

const LOADING_MESSAGES = [
  "Preparing your workspace…",
  "Syncing intelligence…",
  "Loading your data…",
  "Almost there…",
];

const YEAR = new Date().getFullYear();

export function LoadingScreen() {
  const [msgIdx, setMsgIdx] = useState(0);

  useEffect(() => {
    const iv = setInterval(
      () => setMsgIdx((p) => (p + 1) % LOADING_MESSAGES.length),
      900,
    );
    return () => clearInterval(iv);
  }, []);

  return (
    <div
      className="fixed inset-0 z-[9999] flex flex-col items-center justify-center bg-background text-foreground"
      role="status"
      aria-live="polite"
      aria-label={`Loading ${PLATFORM_NAME}`}
      data-testid="loading-screen"
    >
      <div className="flex flex-col items-center gap-6 px-6">
        <UniversalLogoSpinner size="xl" />

        {/* Wordmark — theme-aware, cyan accent pulled from --primary */}
        <div className="text-center">
          <h1 className="text-2xl font-bold text-foreground tracking-tight">
            <span className="text-primary">Co</span>
            <span>AI</span>
            <span className="text-primary">league</span>
            <sup className="text-[10px] text-muted-foreground ml-0.5 align-super font-semibold">
              ™
            </sup>
          </h1>
          <p className="text-[10px] font-medium uppercase tracking-[0.2em] text-muted-foreground mt-1">
            AI-Powered Workforce Platform
          </p>
        </div>

        {/* Rotating status message */}
        <p
          key={msgIdx}
          className="text-sm text-muted-foreground min-h-[20px] animate-in fade-in slide-in-from-bottom-1 duration-300"
          data-testid="loading-message"
        >
          {LOADING_MESSAGES[msgIdx]}
        </p>

        {/* Three bouncing dots — theme-aware (primary + accent tones) */}
        <div className="flex gap-1.5" aria-hidden="true">
          <span className="w-1.5 h-1.5 rounded-full bg-primary animate-bounce [animation-delay:0ms]" />
          <span className="w-1.5 h-1.5 rounded-full bg-primary/70 animate-bounce [animation-delay:150ms]" />
          <span className="w-1.5 h-1.5 rounded-full bg-primary/40 animate-bounce [animation-delay:300ms]" />
        </div>
      </div>

      {/* Footer — theme-aware, always readable */}
      <div className="absolute bottom-5 left-0 right-0 flex flex-col items-center gap-1 px-4">
        <p className="text-[11px] text-muted-foreground tracking-wide">
          Powered by{" "}
          <span className="font-semibold text-foreground">Trinity</span>
          <sup className="text-[9px] text-muted-foreground/80 align-super">
            ™
          </sup>
        </p>
        <p className="text-[10px] text-muted-foreground/70 text-center tracking-wide">
          © {YEAR} {PLATFORM_NAME}
          <sup className="text-[9px] text-muted-foreground/70 align-super">
            ®
          </sup>
          {" · Trinity"}
          <sup className="text-[9px] text-muted-foreground/70 align-super">
            ™
          </sup>
          {" is a trademark of "}
          {PLATFORM_NAME}. All rights reserved.
        </p>
      </div>
    </div>
  );
}
