/**
 * ═══════════════════════════════════════════════════════════════════════
 *  UNIVERSAL COMPONENT REGISTRY — Single Source of Truth
 *
 *  Edit ONE file → changes EVERY instance platform-wide.
 *
 *  Rule: Any platform-wide UI pattern has exactly ONE source file.
 *  Import everything from this barrel. Never import from scattered paths.
 *
 *  Usage:
 *             WorkspaceLayout, ProgressiveHeader } from '@/components/universal'
 * ═══════════════════════════════════════════════════════════════════════
 *
 *  REGISTRY MAP  (edit the SOURCE FILE listed → changes every use)
 *  ────────────────────────────────────────────────────────────────
 *  Global Header     → client/src/components/navigation/ProgressiveHeader.tsx
 *  Page Breadcrumb   → client/src/components/page-breadcrumb.tsx
 *  Modal / Dialog    → client/src/components/ui/universal-modal.tsx
 *  Page Layout       → client/src/components/workspace-layout.tsx
 *  Canvas Hub Page   → client/src/components/canvas-hub/index.ts
 *  Plan Status      → client/src/components/plan-status.tsx (exports CreditBalanceBadge, CreditBalanceCard)
 *  Toast             → client/src/components/universal/UniversalToast.tsx
 *  Empty State       → client/src/components/universal/UniversalEmptyState.tsx
 * ═══════════════════════════════════════════════════════════════════════
 */

// ── Navigation (Global Singletons) ──────────────────────────────────────
export { ProgressiveHeader } from '../navigation/ProgressiveHeader';
export { PageBreadcrumb } from '../page-breadcrumb';

// ── Page Layout ──────────────────────────────────────────────────────────
export { WorkspaceLayout, WorkspaceSection } from '../workspace-layout';
export { CanvasHubPage } from '../canvas-hub';

// ── Modal / Dialog (Desktop Dialog → Mobile Sheet) ───────────────────────

// ── Drawer / Sheet ────────────────────────────────────────────────────────

// ── Data ──────────────────────────────────────────────────────────────────

// ── Plan status (legacy-named exports retained) ──────────────────────────
export { CreditBalanceBadge, CreditBalanceCard } from '../plan-status';

// ── Primitives ────────────────────────────────────────────────────────────

// ── Feedback ─────────────────────────────────────────────────────────────
export { UniversalToastProvider, useUniversalToast } from './UniversalToast';
export { UniversalEmptyState } from './UniversalEmptyState';

// ── App Shell ─────────────────────────────────────────────────────────────
export { UniversalHeader } from '../universal-header';

// ── Design System Tokens (JS/TS mirrors of tokens.css) ────────────────────
export {
  Z_INDEX,
  ICON_SIZES,
  NAV_COLORS,
  OVERFLOW,
  breakpoints,
  breakpointValues,
  colors,
  fonts,
  spacing,
  radius,
  duration,
  dimensions,
  CHART_PALETTE,
  CHART_SERIES,
} from '@/lib/designSystem';

export type {
  BadgeVariant,
  ButtonVariant,
  ButtonSize,
  CardVariant,
  ModalSize,
  IconSize,
  ChartPaletteKey,
} from '@/lib/designSystem';
