/**
 * Universal Modal Button Configuration
 * Centralized settings for all modal/dialog/sheet header buttons
 * 
 * All values are configurable - NO hardcoded values anywhere
 */

// Button styling configuration for modal headers
export const MODAL_BUTTON_STYLES = {
  // Spacing between header buttons
  buttonGap: "gap-2",
  
  // Home button styling (blue theme)
  homeButton: {
    className: "flex items-center justify-center rounded-md min-h-10 min-w-10 border border-primary/30 bg-primary/10 text-primary ring-offset-background transition-all hover:bg-primary/20 hover:border-primary/50 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 active:bg-primary/30",
    iconSize: "h-4 w-4",
  },
  
  // Close button styling (muted theme)
  closeButton: {
    className: "flex items-center justify-center rounded-md min-h-10 min-w-10 border border-border bg-muted/50 text-muted-foreground ring-offset-background transition-all hover:bg-muted hover:text-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:pointer-events-none active:bg-muted/80",
    iconSize: "h-4 w-4",
  },
  
  // Responsive sizing for desktop
  desktop: {
    minSize: "sm:min-h-9 sm:min-w-9",
  },
};

export const HOME_BUTTON_CONFIG = {
  // General settings
  enabled: true,                           // Enable/disable home button globally
  icon: "Home",                            // Icon from lucide-react: "Home", "House", "Building", etc.
  
  // Appearance
  variant: "ghost" as const,               // Button variant: ghost, outline, default, secondary
  size: "sm" as const,                     // Size: sm, default, lg, icon
  className: "opacity-70 hover:opacity-100", // Custom CSS classes
  
  // Behavior
  navigationPath: "/dashboard",            // Default path navigates to workspace dashboard
  dashboardPath: "/dashboard",             // Path for authenticated users
  useFullPageReload: false,                // Force full page reload instead of SPA navigation
  
  // Tooltips & Labels
  tooltip: "Go to Home",                   // Hover tooltip text
  ariaLabel: "Go to Home",                 // Accessibility label
  
  // Keyboard
  escapeKeyEnabled: true,                  // Esc key navigates home
  
  // Position in dialogs
  position: "top-right" as const,          // Position in dialog: top-right, top-left, bottom-right, bottom-left
  
  // Test IDs for automation
  testId: "button-home",
};

/**
 * Guest-specific home button config (for help desk intake form)
 * Override defaults for guest/anonymous users
 */
export const GUEST_HOME_BUTTON_CONFIG = {
  ...HOME_BUTTON_CONFIG,
  navigationPath: "/pricing",              // Guests go to pricing page
  tooltip: "Back to Pricing",
  ariaLabel: "Go to Pricing",
};

/**
 * Helper to get appropriate home button config based on user context
 */
export function getHomeButtonConfig(isGuest: boolean = false) {
  return isGuest ? GUEST_HOME_BUTTON_CONFIG : HOME_BUTTON_CONFIG;
}
