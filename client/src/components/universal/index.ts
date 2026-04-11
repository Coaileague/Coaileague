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
 *    import { UniversalModal, UniversalDrawer, PageBreadcrumb,
 *             WorkspaceLayout, ProgressiveHeader } from '@/components/universal'
 * ═══════════════════════════════════════════════════════════════════════
 *
 *  REGISTRY MAP  (edit the SOURCE FILE listed → changes every use)
 *  ────────────────────────────────────────────────────────────────
 *  Global Header     → client/src/components/navigation/ProgressiveHeader.tsx
 *  Slim Header       → client/src/components/navigation/SlimHeader.tsx
 *  Page Breadcrumb   → client/src/components/page-breadcrumb.tsx
 *  Modal / Dialog    → client/src/components/ui/universal-modal.tsx
 *  Drawer (side)     → client/src/components/universal/UniversalDrawer.tsx
 *  Sheet             → client/src/components/universal/UniversalSheet.tsx
 *  Data Table        → client/src/components/universal/UniversalTable.tsx
 *  Page Layout       → client/src/components/workspace-layout.tsx
 *  Canvas Hub Page   → client/src/components/canvas-hub/index.ts
 *  Plan Status      → client/src/components/credit-balance.tsx (exports CreditBalanceBadge, CreditBalanceCard)
 *  Card              → client/src/components/universal/UniversalCard.tsx
 *  Button            → client/src/components/universal/UniversalButton.tsx
 *  Badge             → client/src/components/universal/UniversalBadge.tsx
 *  Input             → client/src/components/universal/UniversalInput.tsx
 *  Toast             → client/src/components/universal/UniversalToast.tsx
 *  Empty State       → client/src/components/universal/UniversalEmptyState.tsx
 *  Icon              → client/src/components/universal/UniversalIcon.tsx
 *  Bottom Nav        → client/src/components/universal/UniversalBottomNav.tsx
 *  Sidebar           → client/src/components/universal/UniversalSidebar.tsx
 *  Layout Shell      → client/src/components/universal/UniversalLayout.tsx
 * ═══════════════════════════════════════════════════════════════════════
 */

// ── Navigation (Global Singletons) ──────────────────────────────────────
export { ProgressiveHeader } from '../navigation/ProgressiveHeader';
export { SlimHeader } from '../navigation/SlimHeader';
export { PageBreadcrumb } from '../page-breadcrumb';

// ── Page Layout ──────────────────────────────────────────────────────────
export { WorkspaceLayout, WorkspaceSection } from '../workspace-layout';
export { CanvasHubPage } from '../canvas-hub';

// ── Modal / Dialog (Desktop Dialog → Mobile Sheet) ───────────────────────
export {
  UniversalModal,
  UniversalModalContent,
  UniversalModalHeader,
  UniversalModalStyledHeader,
  UniversalModalBody,
  UniversalModalFooter,
  UniversalModalTitle,
  UniversalModalDescription,
  UniversalModalClose,
  UniversalModalTrigger,
} from './UniversalModal';

// ── Drawer / Sheet ────────────────────────────────────────────────────────
export { UniversalDrawer } from './UniversalDrawer';
export { UniversalSheet } from './UniversalSheet';

// ── Data ──────────────────────────────────────────────────────────────────
export { UniversalTable } from './UniversalTable';
export type { ColumnDef } from './UniversalTable';

// ── Credits ──────────────────────────────────────────────────────────────
export { CreditBalanceBadge, CreditBalanceCard } from '../credit-balance';

// ── Primitives ────────────────────────────────────────────────────────────
export { UniversalCard } from './UniversalCard';
export { UniversalButton } from './UniversalButton';
export { UniversalBadge } from './UniversalBadge';
export { UniversalInput } from './UniversalInput';
export { UniversalIcon } from './UniversalIcon';
export type { IconName } from './UniversalIcon';

// ── Feedback ─────────────────────────────────────────────────────────────
export { UniversalToastProvider, useUniversalToast } from './UniversalToast';
export { UniversalEmptyState } from './UniversalEmptyState';

// ── App Shell ─────────────────────────────────────────────────────────────
export { UniversalLayout } from './UniversalLayout';
export { UniversalHeader } from '../universal-header';
export { UniversalBottomNav } from './UniversalBottomNav';
export { UniversalSidebar } from './UniversalSidebar';

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
