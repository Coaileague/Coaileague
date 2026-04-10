/**
 * CoAIleague Dynamic Theme System
 * Central configuration for all colors, spacing, typography, and layout
 * Change values here to instantly update the entire application
 */

export const THEME = {
  // ===== COLORS =====
  colors: {
    // Primary Brand Colors
    primary: {
      main: '#2563eb',        // CoAIleague Blue
      dark: '#1d4ed8',        // Darker shade for hover/active
      light: '#3b82f6',       // Lighter shade for accents
      pale: '#dbeafe',        // Pale background
    },
    // Text Colors
    text: {
      primary: '#1e293b',     // Main text
      secondary: '#334155',   // Secondary text
      muted: '#64748b',       // Muted/metadata text
      placeholder: '#94a3b8', // Input placeholders
      white: '#ffffff',
    },
    // Backgrounds
    bg: {
      primary: '#ffffff',           // Main app background
      secondary: '#f8fafc',         // Input/subtle backgrounds
      tertiary: '#eff6ff',          // Hover backgrounds
      gradient: 'linear-gradient(135deg, #f0f9ff 0%, #dbeafe 100%)',
    },
    // Borders
    border: {
      primary: '#e2e8f0',     // Main borders
      accent: '#93c5fd',      // Highlighted borders
    },
    // Shadows
    shadow: {
      sm: '0 2px 8px rgba(59, 130, 246, 0.2)',
      md: '0 4px 16px rgba(37, 99, 235, 0.3)',
      lg: '0 8px 32px rgba(0, 0, 0, 0.1)',
      xl: '0 20px 60px rgba(0, 0, 0, 0.1)',
    },
    // Status Colors
    status: {
      success: '#10b981',
      warning: '#f59e0b',
      error: '#ef4444',
      info: '#2563eb',
    },
  },

  // ===== TYPOGRAPHY =====
  typography: {
    fontFamily: {
      primary: "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
      mono: "'JetBrains Mono', monospace",
    },
    // Font sizes (in rem)
    fontSize: {
      xs: '0.75rem',      // 12px
      sm: '0.875rem',     // 14px
      base: '1rem',       // 16px
      lg: '1.125rem',     // 18px
      xl: '1.25rem',      // 20px
      '2xl': '1.5rem',    // 24px
      '3xl': '1.875rem',  // 30px
      '4xl': '2.25rem',   // 36px
      '5xl': '3rem',      // 48px
      '6xl': '3.75rem',   // 60px
    },
    // Font weights
    fontWeight: {
      regular: 400,
      medium: 500,
      semibold: 600,
      bold: 700,
    },
  },

  // ===== SPACING =====
  spacing: {
    xs: '0.5rem',       // 8px
    sm: '0.75rem',      // 12px
    md: '1rem',         // 16px
    lg: '1.5rem',       // 24px
    xl: '2rem',         // 32px
    '2xl': '3rem',      // 48px
    '3xl': '4rem',      // 64px
  },

  // ===== COMPONENT SIZES =====
  components: {
    // Input field sizing
    input: {
      height: {
        sm: '32px',     // Compact (used on login)
        md: '36px',     // Default
        lg: '44px',     // Large
      },
      padding: {
        x: '10px',      // Horizontal padding
        y: '8px',       // Vertical padding (for sm)
      },
      borderRadius: '6px',
      fontSize: '0.875rem',
      fontSizeCompact: '0.75rem',
    },
    // Button sizing
    button: {
      height: {
        sm: '32px',     // Compact
        md: '36px',     // Default
        lg: '44px',     // Large
      },
      padding: {
        x: '16px',      // Horizontal
        y: '8px',       // Vertical (for sm)
      },
      borderRadius: '6px',
      fontSize: '0.875rem',
      fontSizeCompact: '0.75rem',
    },
    // Card & Panel styling
    card: {
      padding: '32px',        // Desktop padding
      paddingMobile: '24px',  // Mobile padding
      borderRadius: '16px',
      shadow: '0 8px 32px rgba(0, 0, 0, 0.1)',
    },
    // Header sizing
    header: {
      height: '64px',
      paddingX: '24px',
      paddingY: '16px',
      borderColor: '#e2e8f0',
    },
  },

  // ===== LAYOUT =====
  layout: {
    // Form widths
    formWidth: '420px',
    formWidthCompact: '100%',
    formMaxWidth: 'max-w-sm',
    
    // Container widths
    containerMax: '1280px',
    containerPadding: '24px',
    
    // Breakpoints
    breakpoints: {
      sm: '640px',
      md: '768px',
      lg: '1024px',
      xl: '1280px',
      '2xl': '1536px',
    },
  },

  // ===== LOGIN PAGE SPECIFIC =====
  pages: {
    login: {
      // Header styling
      header: {
        bg: 'rgba(255, 255, 255, 0.7)',
        borderColor: '#e2e8f0',
        logoGradient: 'linear-gradient(135deg, #3b82f6 0%, #2563eb 100%)',
        logoSize: '40px',
        logoFontSize: '20px',
        logoShadow: '0 2px 8px rgba(59, 130, 246, 0.2)',
      },
      // Page background
      background: 'linear-gradient(135deg, #fafbff 0%, #f5f9ff 100%)',
      
      // Card styling
      card: {
        bg: '#ffffff',
        padding: '32px',
        paddingMobile: '24px',
        borderRadius: '16px',
        shadow: '0 8px 32px rgba(0, 0, 0, 0.1)',
        maxWidth: '420px',
      },
      
      // Form elements
      heading: {
        fontSize: '1.125rem',
        fontWeight: 600,
        color: '#1e293b',
      },
      subheading: {
        fontSize: '0.75rem',
        color: '#94a3b8',
      },
      
      // Input styling
      input: {
        height: '32px',
        fontSize: '0.75rem',
        padding: '10px 10px',
        bg: '#f8fafc',
        borderColor: '#e2e8f0',
        color: '#1e293b',
        borderRadius: '6px',
      },
      
      // Button styling
      button: {
        height: '32px',
        fontSize: '0.75rem',
        padding: '8px 16px',
        gradient: 'linear-gradient(135deg, #3b82f6 0%, #2563eb 100%)',
        shadow: '0 2px 8px rgba(59, 130, 246, 0.2)',
        borderRadius: '6px',
      },
      
      // Label styling
      label: {
        fontSize: '0.75rem',
        fontWeight: 600,
        textTransform: 'uppercase',
        color: '#475569',
        letterSpacing: '0.05em',
      },
      
      // Link styling
      link: {
        color: '#3b82f6',
        fontSize: '0.75rem',
      },
      
      // Spacing
      spacing: {
        headerBottom: '24px',
        formGap: '12px',
        buttonTop: '16px',
        dividerMargin: '12px',
      },
    },
  },

  // ===== ANIMATION & TRANSITIONS =====
  animation: {
    duration: {
      fast: '0.2s',
      normal: '0.3s',
      slow: '0.5s',
    },
    timing: 'ease-in-out',
  },
} as const;

/**
 * Helper function to get nested theme values
 * Usage: getThemeValue('pages.login.input.height')
 */
export function getThemeValue(path: string): any {
  // @ts-expect-error — TS migration: fix in refactoring sprint
  return path.split('.').reduce((obj, key) => obj?.[key], THEME);
}

export type Theme = typeof THEME;
