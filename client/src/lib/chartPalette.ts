/**
 * Canonical chart color palette for CoAIleague
 *
 * WHY LITERALS: Recharts renders inside SVG elements where CSS custom properties
 * (var(--token)) are not reliably resolved. These values MUST be literal hex/rgba
 * strings at render time.
 *
 * WHY ONE MODULE: All chart colors live here so they stay in sync with tokens.css.
 * If the brand palette changes, update tokens.css AND the matching constant here —
 * never scatter hex values across individual page files.
 *
 * Token mapping (tokens.css → CHART_PALETTE):
 *   --color-brand-primary    #00D4FF  → BRAND
 *   --color-brand-secondary  #7B5EA7  → SECONDARY
 *   --color-success          #3FB950  → SUCCESS
 *   --color-danger           #F85149  → DANGER
 *   --color-warning          #D29922  → WARNING
 *   --color-info             #58A6FF  → INFO
 *   --color-text-secondary   #8B949E  → MUTED
 */

export const CHART_PALETTE = {
  BRAND:     '#00D4FF',
  SECONDARY: '#7B5EA7',
  SUCCESS:   '#3FB950',
  DANGER:    '#F85149',
  WARNING:   '#D29922',
  INFO:      '#58A6FF',
  MUTED:     '#8B949E',
} as const;

/**
 * Ordered series palette for multi-series charts (pie, stacked bar, etc.)
 * Cycles through distinct, accessible colors in DS token order.
 */
export const CHART_SERIES: readonly string[] = [
  CHART_PALETTE.BRAND,
  CHART_PALETTE.INFO,
  CHART_PALETTE.SUCCESS,
  CHART_PALETTE.SECONDARY,
  CHART_PALETTE.WARNING,
  CHART_PALETTE.DANGER,
  CHART_PALETTE.MUTED,
] as const;

export type ChartPaletteKey = keyof typeof CHART_PALETTE;
