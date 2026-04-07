/**
 * ═══════════════════════════════════════════════════════════════════════
 *  CoAIleague Design System — Master JS/TS Export
 *
 *  Import anything design-related from this single file.
 *  CSS tokens live in: client/src/styles/tokens.css  (source of truth)
 *  Chart colors live in: client/src/lib/chartPalette.ts
 *
 *  Usage:
 *    import { Z_INDEX, ICON_SIZES, NAV_COLORS, OVERFLOW,
 *             CHART_PALETTE, CHART_SERIES, breakpoints } from '@/lib/designSystem'
 * ═══════════════════════════════════════════════════════════════════════
 */

export {
  breakpoints,
  breakpointValues,
  colors,
  fonts,
  spacing,
  radius,
  duration,
  dimensions,
  Z_INDEX,
  ICON_SIZES,
  NAV_COLORS,
  OVERFLOW,
} from './tokens';

export type {
  BadgeVariant,
  ButtonVariant,
  ButtonSize,
  CardVariant,
  ModalSize,
  IconSize,
} from './tokens';

export {
  CHART_PALETTE,
  CHART_SERIES,
} from './chartPalette';

export type { ChartPaletteKey } from './chartPalette';
