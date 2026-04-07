import { useEffect } from "react";
import { useLocation } from "wouter";

/**
 * SCROLL LOCK GUARD v3
 *
 * ROOT CAUSE (confirmed):
 *   react-remove-scroll adds a NON-PASSIVE BUBBLE-MODE touchmove listener on
 *   `document` that calls `preventDefault()` whenever its internal `lockStack`
 *   has entries. `lockStack` is a module-level array — not tied to
 *   `body[data-scroll-locked]`. Removing the attribute does NOT remove the
 *   listener or clear the stack.
 *
 * THE FIX (this file):
 *   1. BUBBLE INTERCEPT — Add a passive touchmove listener on `document.body`
 *      (the last node before `document` in the bubble chain). For touches that
 *      are NOT inside an open dialog/modal, call `e.stopPropagation()`. This
 *      prevents the event from ever reaching react-remove-scroll's `shouldPrevent`
 *      handler on `document`, so `preventDefault()` is never called and native
 *      scroll proceeds. `stopPropagation` does NOT affect the browser's default
 *      scroll action — only `preventDefault` does.
 *
 *   2. STALE ATTRIBUTE CLEANUP — Still remove `data-scroll-locked` / inline
 *      overflow styles when no blocking dialog is in the DOM (route changes,
 *      watchdog, visibility change).
 *
 * WHY DIALOGS STILL WORK:
 *   Touches INSIDE a Radix Dialog/Sheet/Vaul match the
 *   `[role="dialog"]` selector so we skip `stopPropagation`. The event
 *   bubbles normally to `document`, react-remove-scroll analyzes it, and may
 *   call `preventDefault()` only if the in-dialog scroll is truly exhausted —
 *   preventing background bleed-through while still allowing in-dialog scroll.
 */

const LOCK_ATTR = "data-scroll-locked";

function hasActiveLockInDOM(): boolean {
  const attr = document.body.getAttribute(LOCK_ATTR);
  if (!attr) return false;
  const count = parseInt(attr, 10);
  return isFinite(count) && count > 0;
}

function hasVisibleScrollLockingDialog(): boolean {
  return (
    document.querySelector(
      '[role="dialog"][data-state="open"], [role="alertdialog"][data-state="open"], [data-vaul-dialog][data-state="open"]'
    ) !== null
  );
}

function forceReleaseStaleLock() {
  if (hasActiveLockInDOM() && !hasVisibleScrollLockingDialog()) {
    document.body.removeAttribute(LOCK_ATTR);
  }

  if (!hasVisibleScrollLockingDialog()) {
    document.body.style.overflow = "";
    document.body.style.paddingRight = "";
    document.body.style.marginRight = "";
    document.body.style.height = "";
    document.body.style.touchAction = "";
    document.documentElement.style.overflow = "";
    document.documentElement.style.height = "";
    document.documentElement.style.touchAction = "";

    const root = document.getElementById("root");
    if (root) {
      root.style.overflow = "";
      root.style.height = "";
    }
  }

  if (document.body.getAttribute("data-nav-overlay-open") === "true") {
    if (!document.querySelector('[data-nav-overlay="true"]')) {
      document.body.removeAttribute("data-nav-overlay-open");
    }
  }
}

/**
 * Intercept touchmove in the BUBBLE phase at `document.body`.
 *
 * For touches that originate OUTSIDE an open dialog/sheet/alertdialog, stop
 * bubbling before the event reaches `document`. This prevents
 * react-remove-scroll's `shouldPrevent` handler from calling
 * `preventDefault()`, restoring one-finger native scroll everywhere.
 *
 * For touches INSIDE a dialog, let the event bubble normally so Radix can
 * manage in-dialog scroll correctly (allowing scroll within the dialog while
 * preventing background bleed-through when the dialog's content is exhausted).
 */
function installScrollPassthrough() {
  const DIALOG_SELECTOR =
    '[role="dialog"], [role="alertdialog"], [data-vaul-dialog]';

  function stopRemoveScrollBubble(e: TouchEvent) {
    const target = e.target as Element | null;
    if (!target) {
      e.stopPropagation();
      return;
    }

    // Let react-remove-scroll handle touches that are genuinely inside an
    // open modal so it can prevent background bleed-through.
    if (target.closest(DIALOG_SELECTOR)) return;

    // For everything else (main content, sidebars, public pages, etc.)
    // stop the bubble so shouldPrevent never runs and native scroll proceeds.
    e.stopPropagation();
  }

  document.body.addEventListener("touchmove", stopRemoveScrollBubble, {
    passive: true,
  });

  // Return cleanup function
  return () => {
    document.body.removeEventListener("touchmove", stopRemoveScrollBubble);
  };
}

export function useScrollLockGuard() {
  const [location] = useLocation();

  // ── 1. BUBBLE INTERCEPT (runs once, lives for the app lifetime) ─────────
  useEffect(() => {
    return installScrollPassthrough();
  }, []);

  // ── 2. Stale attribute cleanup on route changes ─────────────────────────
  useEffect(() => {
    const id = setTimeout(forceReleaseStaleLock, 350);
    return () => clearTimeout(id);
  }, [location]);

  // ── 3. Tab-switch recovery ───────────────────────────────────────────────
  useEffect(() => {
    const onVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        forceReleaseStaleLock();
      }
    };

    document.addEventListener("visibilitychange", onVisibilityChange);
    return () =>
      document.removeEventListener("visibilitychange", onVisibilityChange);
  }, []);

  // ── 4. Periodic watchdog (catches locks that survive route changes) ───────
  useEffect(() => {
    const watchdog = setInterval(() => {
      forceReleaseStaleLock();
    }, 2000);
    return () => clearInterval(watchdog);
  }, []);
}
