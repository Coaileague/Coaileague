/**
 * CoAIleague Responsive Utility Functions
 * Helper functions for responsive design
 */

/**
 * Get current device type based on window width
 */
export function getDeviceType(): 'mobile' | 'tablet' | 'desktop' {
  if (typeof window === 'undefined') return 'desktop';
  
  const width = window.innerWidth;
  
  if (width < 768) return 'mobile';
  if (width < 1024) return 'tablet';
  return 'desktop';
}

/**
 * Check if device is mobile
 */
export function isMobileDevice(): boolean {
  if (typeof window === 'undefined') return false;
  return window.innerWidth < 768;
}

/**
 * Check if device is tablet
 */
export function isTabletDevice(): boolean {
  if (typeof window === 'undefined') return false;
  const width = window.innerWidth;
  return width >= 768 && width < 1024;
}

/**
 * Check if device is desktop
 */
export function isDesktopDevice(): boolean {
  if (typeof window === 'undefined') return true;
  return window.innerWidth >= 1024;
}

/**
 * Check if device supports touch
 */
export function isTouchDevice(): boolean {
  if (typeof window === 'undefined') return false;
  return (
    'ontouchstart' in window ||
    navigator.maxTouchPoints > 0 ||
    // @ts-ignore
    navigator.msMaxTouchPoints > 0
  );
}

/**
 * Get responsive font size based on base size and device
 */
export function getResponsiveFontSize(baseSize: number): string {
  const device = getDeviceType();
  
  switch (device) {
    case 'mobile':
      return `${baseSize * 0.875}px`; // 87.5% on mobile
    case 'tablet':
      return `${baseSize}px`; // 100% on tablet
    case 'desktop':
      return `${baseSize * 1.125}px`; // 112.5% on desktop
    default:
      return `${baseSize}px`;
  }
}

/**
 * Get responsive spacing based on base spacing and device
 */
export function getResponsiveSpacing(baseSpacing: number): number {
  const device = getDeviceType();
  
  switch (device) {
    case 'mobile':
      return baseSpacing * 0.75; // 75% on mobile
    case 'tablet':
      return baseSpacing; // 100% on tablet
    case 'desktop':
      return baseSpacing * 1.25; // 125% on desktop
    default:
      return baseSpacing;
  }
}

/**
 * Get responsive number of columns for grid
 */
export function getResponsiveColumns(desktopColumns: number): number {
  const device = getDeviceType();
  
  switch (device) {
    case 'mobile':
      return 1; // Always 1 column on mobile
    case 'tablet':
      return Math.min(2, desktopColumns); // Max 2 columns on tablet
    case 'desktop':
      return desktopColumns; // Full columns on desktop
    default:
      return desktopColumns;
  }
}

/**
 * Format image URL for responsive loading (add size parameters if supported)
 */
export function getResponsiveImageUrl(url: string, width?: number): string {
  if (!url) return url;
  
  const device = getDeviceType();
  const deviceWidth = width || (device === 'mobile' ? 640 : device === 'tablet' ? 768 : 1280);
  
  // If URL supports query parameters for resizing (e.g., imgix, cloudinary)
  const hasQuery = url.includes('?');
  const separator = hasQuery ? '&' : '?';
  
  // Add width parameter if URL looks like it might support it
  if (url.includes('cloudinary') || url.includes('imgix') || url.includes('imagekit')) {
    return `${url}${separator}w=${deviceWidth}&auto=format,compress`;
  }
  
  return url;
}

/**
 * Clamp text length based on device (shorter on mobile)
 */
export function getResponsiveTextLength(
  text: string,
  mobileLength: number,
  tabletLength: number,
  desktopLength: number
): string {
  const device = getDeviceType();
  const maxLength =
    device === 'mobile' ? mobileLength : device === 'tablet' ? tabletLength : desktopLength;
  
  if (text.length <= maxLength) return text;
  return text.substring(0, maxLength) + '...';
}

/**
 * Get optimal image dimensions for device
 */
export function getOptimalImageDimensions(aspectRatio: 'video' | 'square' | 'portrait' | 'landscape' = 'video'): {
  width: number;
  height: number;
} {
  const device = getDeviceType();
  
  const baseWidths = {
    mobile: 640,
    tablet: 768,
    desktop: 1280,
  };
  
  const width = baseWidths[device];
  
  const aspectRatios = {
    video: 16 / 9,
    square: 1,
    portrait: 3 / 4,
    landscape: 4 / 3,
  };
  
  const ratio = aspectRatios[aspectRatio];
  const height = Math.round(width / ratio);
  
  return { width, height };
}

/**
 * =================================================================
 * COMPACT DESIGN UTILITIES (Nov 10, 2025)
 * Progressive disclosure and table optimization helpers
 * =================================================================
 */

export type ColumnPriority = 'P1' | 'P2' | 'P3';

export interface ColumnConfig {
  key: string;
  label: string;
  priority: ColumnPriority;
  description?: string;
  mobileLabel?: string; // Shorter label for mobile
}

export interface ResponsiveTableConfig {
  columns: ColumnConfig[];
  defaultHiddenColumns?: string[]; // Keys of columns hidden by default on desktop
  mobileVisibleColumns?: string[]; // Keys of columns always visible in mobile summary card
}

/**
 * Filters columns based on screen size and user preferences
 * 
 * IMPORTANT: User preferences (userHiddenColumns and defaultHiddenColumns) 
 * are honored across ALL breakpoints to prevent columns from reappearing 
 * when viewport size changes.
 */
export function getVisibleColumns(
  config: ResponsiveTableConfig,
  screenSize: 'mobile' | 'tablet' | 'desktop',
  userHiddenColumns: string[] = []
): ColumnConfig[] {
  const { columns, defaultHiddenColumns = [], mobileVisibleColumns = [] } = config;

  if (screenSize === 'mobile') {
    // On mobile, show P1 columns or explicitly requested mobile columns
    // BUT respect user preferences and default hidden columns
    return columns.filter(col => 
      (col.priority === 'P1' || mobileVisibleColumns.includes(col.key)) &&
      !defaultHiddenColumns.includes(col.key) &&
      !userHiddenColumns.includes(col.key)
    );
  }

  if (screenSize === 'tablet') {
    // On tablet, show P1 and P2 columns
    // BUT respect user preferences and default hidden columns
    return columns.filter(col => 
      (col.priority === 'P1' || col.priority === 'P2') && 
      !defaultHiddenColumns.includes(col.key) &&
      !userHiddenColumns.includes(col.key)
    );
  }

  // Desktop: show all columns except those hidden by default or by user
  return columns.filter(col => 
    !defaultHiddenColumns.includes(col.key) && 
    !userHiddenColumns.includes(col.key)
  );
}

/**
 * Gets columns to show in mobile accordion (hidden from summary card)
 */
export function getMobileAccordionColumns(
  config: ResponsiveTableConfig
): ColumnConfig[] {
  const { columns, mobileVisibleColumns = [] } = config;
  
  return columns.filter(col => 
    col.priority !== 'P1' && !mobileVisibleColumns.includes(col.key)
  );
}

/**
 * Generates unique anchor IDs for sections
 */
export function generateSectionId(label: string): string {
  return label
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

/**
 * Creates sticky navigation items from section headings
 */
export interface SectionAnchor {
  id: string;
  label: string;
  shortLabel?: string;
}

export function createSectionAnchors(sections: string[]): SectionAnchor[] {
  return sections.map(label => ({
    id: generateSectionId(label),
    label,
    shortLabel: label.length > 12 ? label.substring(0, 10) + '...' : undefined,
  }));
}

/**
 * Column toggle presets for different user personas
 */
export type PersonaPreset = 'manager' | 'auditor' | 'executive' | 'all';

export interface PresetConfig {
  name: string;
  description: string;
  visibleColumns: string[];
}

export function getPersonaPreset(
  preset: PersonaPreset,
  allColumns: ColumnConfig[]
): PresetConfig {
  const allKeys = allColumns.map(c => c.key);
  
  switch (preset) {
    case 'manager':
      return {
        name: 'Manager View',
        description: 'Focus on operations and team metrics',
        visibleColumns: allColumns
          .filter(c => c.priority === 'P1' || c.priority === 'P2')
          .map(c => c.key),
      };
      
    case 'auditor':
      return {
        name: 'Auditor View',
        description: 'Complete audit trail with timestamps',
        visibleColumns: allKeys,
      };
      
    case 'executive':
      return {
        name: 'Executive View',
        description: 'High-level KPIs only',
        visibleColumns: allColumns
          .filter(c => c.priority === 'P1')
          .map(c => c.key),
      };
      
    case 'all':
      return {
        name: 'All Columns',
        description: 'Show all available data',
        visibleColumns: allKeys,
      };
      
    default:
      return getPersonaPreset('manager', allColumns);
  }
}

/**
 * Local storage helpers for persisting column preferences
 */
const STORAGE_PREFIX = 'af_columns_';

export function saveColumnPreferences(pageKey: string, hiddenColumns: string[]): void {
  try {
    localStorage.setItem(`${STORAGE_PREFIX}${pageKey}`, JSON.stringify(hiddenColumns));
  } catch (error) {
    console.warn('Failed to save column preferences:', error);
  }
}

export function loadColumnPreferences(pageKey: string): string[] {
  try {
    const saved = localStorage.getItem(`${STORAGE_PREFIX}${pageKey}`);
    return saved ? JSON.parse(saved) : [];
  } catch (error) {
    console.warn('Failed to load column preferences:', error);
    return [];
  }
}

export function clearColumnPreferences(pageKey: string): void {
  try {
    localStorage.removeItem(`${STORAGE_PREFIX}${pageKey}`);
  } catch (error) {
    console.warn('Failed to clear column preferences:', error);
  }
}

/**
 * Formats large numbers with K/M suffixes for compact display
 */
export function formatCompactNumber(value: number): string {
  if (value >= 1000000) {
    return (value / 1000000).toFixed(1) + 'M';
  }
  if (value >= 1000) {
    return (value / 1000).toFixed(1) + 'K';
  }
  return value.toString();
}
