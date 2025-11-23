/**
 * Universal Home Button Configuration
 * Centralized settings for all home buttons across dialogs and sheets
 * 
 * All values are configurable - NO hardcoded values anywhere
 */

export const HOME_BUTTON_CONFIG = {
  // General settings
  enabled: true,                           // Enable/disable home button globally
  icon: "Home",                            // Icon from lucide-react: "Home", "House", "Building", etc.
  
  // Appearance
  variant: "ghost" as const,               // Button variant: ghost, outline, default, secondary
  size: "sm" as const,                     // Size: sm, default, lg, icon
  className: "opacity-70 hover:opacity-100", // Custom CSS classes
  
  // Behavior
  navigationPath: "/",                     // Default path for non-authenticated users
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
