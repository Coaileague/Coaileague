/**
 * CANONICAL Z-INDEX TIER SYSTEM
 * ─────────────────────────────────────────────────────────────────────
 * Single source of truth for ALL fixed/sticky/absolute positioning.
 *
 * RULES (enforced by convention — violations cause overlay conflicts):
 *   1. NEVER hardcode a z-index number in a component.
 *      Use: className={`z-[${Z.MODAL}]`}  OR  style={{ zIndex: Z.MODAL }}
 *   2. NEVER create a new tier without adding it here AND in index.css.
 *   3. Tiers MUST only increase within their semantic group.
 *   4. All overlays that block interaction MUST go through OverlayControllerProvider.
 *      Only cosmetic/informational layers (toast, snowfall, banner) may render
 *      independently — and they MUST still use these tier constants.
 *
 * VALUES mirror the CSS variables in :root (index.css).
 * If you change a value here, change the matching CSS variable too.
 * ─────────────────────────────────────────────────────────────────────
 *
 * TIER MAP:
 *
 *   0        BASE            — Normal document flow
 *   1–999    CONTENT         — In-flow elevated content (cards, columns)
 *   1015     PAGE_TITLE      — Sticky page title bars, section headers
 *   1020     STICKY          — Generic sticky elements
 *   1030     FIXED_HEADER    — App navigation bar / top header
 *   1031     SETUP_GUIDE     — Floating setup guide widget (bottom-right)
 *   1040     BOTTOM_NAV      — Mobile bottom navigation bar
 *   1500     PANEL           — Slide-in side panels, AI insight drawers
 *   1600     CONTEXT_MENU    — Bottom-sheet context menus, right-click sheets
 *   2000     DROPDOWN        — Dropdowns, popovers, select menus
 *   2000     SHEET_BACKDROP  — Bottom sheet backdrop (same tier as dropdown)
 *   2001     SHEET           — Bottom sheet content (above its backdrop)
 *   2500     MODAL_BACKDROP  — Dialog/modal backdrop
 *   2501     MODAL           — Dialog/modal content
 *   3000     TOOLTIP         — Tooltips (must float above modals)
 *   4000     CHATDOCK        — ChatDock floating panel (not full-screen)
 *   5000     TOAST           — Toast notifications
 *   5000     ALERT           — Alert banners
 *   6000     LIGHTBOX        — Full-screen image/video lightboxes
 *   6500     SYSTEM_MODAL    — System-level blocking modals (maintenance, offline)
 *   9000     SPLASH          — Initial load splash screen
 *   9998     SNOWFALL        — Seasonal particle effects (decorative)
 *   9998     TRINITY_FAB     — Trinity floating action button
 *   9999     TRINITY_OVERLAY — Trinity AI loading overlay (full-screen)
 *   9999     CONNECTION      — Connection status banner (top stripe)
 *   99999    PAYMENT_WALL    — Payment enforcement (absolute maximum)
 */
export const Z = {
  BASE: 0,
  CONTENT: 1,

  PAGE_TITLE: 1015,
  STICKY: 1020,
  FIXED_HEADER: 1030,
  SETUP_GUIDE: 1031,
  BOTTOM_NAV: 1040,

  PANEL: 1500,
  CONTEXT_MENU: 1600,

  DROPDOWN: 2000,
  SHEET_BACKDROP: 2000,
  SHEET: 2001,

  MODAL_BACKDROP: 2500,
  MODAL: 2501,

  TOOLTIP: 3000,

  CHATDOCK: 4000,

  TOAST: 5000,
  ALERT: 5000,

  LIGHTBOX: 6000,
  SYSTEM_MODAL: 6500,

  SPLASH: 9000,
  SNOWFALL: 9998,
  TRINITY_FAB: 9998,
  TRINITY_OVERLAY: 9999,
  CONNECTION: 9999,

  PAYMENT_WALL: 99999,
} as const satisfies Record<string, number>;

export type ZTier = typeof Z[keyof typeof Z];

/**
 * Returns a Tailwind z-index class string for use in className.
 * Usage: zClass('MODAL') → 'z-[2501]'
 */
export function zClass(tier: keyof typeof Z): string {
  return `z-[${Z[tier]}]`;
}

/**
 * Returns an inline style object with the correct zIndex.
 * Usage: zStyle('TOAST') → { zIndex: 5000 }
 */
export function zStyle(tier: keyof typeof Z): { zIndex: number } {
  return { zIndex: Z[tier] };
}
