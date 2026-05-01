/**
 * ChatDock shared helpers (C2 — code-split groundwork).
 *
 * Lives outside both ChatDock.tsx (the bubble shell) and ConversationPane.tsx
 * (the lazy-loaded conversation view) so neither file has to import the
 * other. Anything that genuinely needs to be reachable from both lives here.
 */
import { useState, useEffect } from "react";

/**
 * Tracks the live viewport-height delta when the iOS / Android on-screen
 * keyboard opens, so the composer can lift above it without losing focus.
 *
 * Two paths:
 *   • Modern: visualViewport API (Safari 13+, Chrome 61+).
 *   • Fallback: focusin/focusout — assumes ~40% of innerHeight when an
 *     input is focused. Imprecise but better than overlap.
 *
 * Both ChatDock's BubblePopup (shell) and InlineChatView (pane) use this,
 * which is why it lives here instead of in either file.
 */
export function useMobileKeyboardOffset() {
  const [offset, setOffset] = useState(0);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const vv = window.visualViewport;

    if (!vv) {
      const handleFocus = (e: FocusEvent) => {
        const t = e.target as HTMLElement;
        if (t?.tagName === "INPUT" || t?.tagName === "TEXTAREA") {
          setOffset(Math.round(window.innerHeight * 0.4));
        }
      };
      const handleBlur = () => setOffset(0);
      document.addEventListener("focusin", handleFocus);
      document.addEventListener("focusout", handleBlur);
      return () => {
        document.removeEventListener("focusin", handleFocus);
        document.removeEventListener("focusout", handleBlur);
      };
    }

    const update = () => {
      const keyboardHeight = window.innerHeight - vv.height;
      const viewportOffset = vv.offsetTop || 0;
      const totalOffset = keyboardHeight + viewportOffset;
      setOffset(totalOffset > 80 ? totalOffset : 0);
    };

    vv.addEventListener("resize", update);
    vv.addEventListener("scroll", update);
    return () => {
      vv.removeEventListener("resize", update);
      vv.removeEventListener("scroll", update);
    };
  }, []);

  return offset;
}
