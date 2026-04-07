import type { CSSProperties } from 'react';

export const breakpoints = {
  mobile:    '375px',
  mobileLg:  '430px',
  tablet:    '768px',
  desktop:   '1280px',
  wide:      '1440px',
  ultrawide: '1920px',
} as const;

export const breakpointValues = {
  mobile:    375,
  mobileLg:  430,
  tablet:    768,
  desktop:   1280,
  wide:      1440,
  ultrawide: 1920,
} as const;

export const colors = {
  bg: {
    primary:   '#0D1117',
    secondary: '#161B22',
    tertiary:  '#21262D',
    overlay:   '#1C2128',
  },
  brand: {
    primary:   '#00D4FF',
    secondary: '#7B5EA7',
  },
  text: {
    primary:   '#F0F6FC',
    secondary: '#8B949E',
    disabled:  '#484F58',
    inverse:   '#0D1117',
  },
  semantic: {
    success: '#3FB950',
    warning: '#D29922',
    danger:  '#F85149',
    info:    '#58A6FF',
  },
  border: {
    subtle:   '#21262D',
    default:  '#30363D',
    emphasis: '#484F58',
  },
} as const;

export const fonts = {
  display: "'Syne', 'Inter', sans-serif",
  body:    "'DM Sans', 'Inter', sans-serif",
  mono:    "'JetBrains Mono', monospace",
} as const;

export const spacing = {
  1:  '4px',
  2:  '8px',
  3:  '12px',
  4:  '16px',
  5:  '20px',
  6:  '24px',
  8:  '32px',
  10: '40px',
  12: '48px',
  16: '64px',
} as const;

export const radius = {
  sm:   '6px',
  md:   '10px',
  lg:   '14px',
  xl:   '20px',
  full: '9999px',
} as const;

export const duration = {
  fast:   120,
  normal: 200,
  slow:   350,
  page:   400,
} as const;

export const dimensions = {
  headerMobile:      56,
  headerDesktop:     64,
  bottomNavHeight:   56,
  sidebarWidth:      240,
  sidebarCollapsed:  64,
  touchMin:          44,
} as const;

/**
 * Z_INDEX — JS mirror of --z-* CSS vars in tokens.css.
 * Use in inline style props where var() isn't available.
 * Edit tokens.css to change values platform-wide.
 */
export const Z_INDEX = {
  base:       0,
  pageTitle:  1015,
  sticky:     1020,
  header:     1030,
  bottomNav:  1040,
  dropdown:   2000,
  sheetBg:    2000,
  sheet:      2001,
  modalBg:    2500,
  modal:      2501,
  tooltip:    3000,
  overlay:    4500,
  toast:      5000,
  sync:       6000,
  fab:        9000,
} as const;

/**
 * ICON_SIZES — JS mirror of --icon-* CSS vars in tokens.css.
 * Use when passing numeric size props to Lucide icons.
 */
export const ICON_SIZES = {
  xs: 14,
  sm: 16,
  md: 20,
  lg: 24,
  xl: 32,
} as const;

export type IconSize = keyof typeof ICON_SIZES;

/**
 * NAV_COLORS — CSS var references for all header / navigation surfaces.
 * Use var() strings in style props so theme changes in tokens.css propagate.
 */
export const NAV_COLORS = {
  bg:                'var(--color-nav-bg)',
  bgElevated:        'var(--color-nav-bg-elevated)',
  border:            'var(--color-nav-border)',
  text:              'var(--color-nav-text)',
  textSecondary:     'var(--color-nav-text-secondary)',
  icon:              'var(--color-nav-icon)',
  itemActiveBg:      'var(--color-nav-item-active-bg)',
  itemActive:        'var(--color-nav-item-active)',
  itemHoverBg:       'var(--color-nav-item-hover-bg)',
  badgeBg:           'var(--color-nav-badge-bg)',
  badge:             'var(--color-nav-badge)',
} as const;

/**
 * OVERFLOW — Standard overflow / text-truncation helpers.
 * Apply to any element that should clip long text with ellipsis.
 */
export const OVERFLOW = {
  ellipsis: {
    overflow:     'hidden',
    textOverflow: 'ellipsis',
    whiteSpace:   'nowrap',
  } as CSSProperties,
  clip: {
    overflow: 'hidden',
  } as CSSProperties,
  scroll: {
    overflow:                  'auto',
    WebkitOverflowScrolling:   'touch',
  } as CSSProperties,
} as const;

export type BadgeVariant = 'default' | 'success' | 'warning' | 'danger' | 'info' | 'brand';
export type ButtonVariant = 'primary' | 'secondary' | 'outline' | 'ghost' | 'danger' | 'success';
export type ButtonSize = 'xs' | 'sm' | 'md' | 'lg' | 'xl';
export type CardVariant = 'default' | 'elevated' | 'outlined' | 'ghost' | 'gradient';
export type ModalSize = 'sm' | 'md' | 'lg' | 'xl' | 'full';
