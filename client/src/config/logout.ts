/**
 * Universal Logout Configuration
 * Centralized settings for all logout functionality
 * 
 * NO HARDCODED VALUES - Everything configurable here
 */

export const LOGOUT_CONFIG = {
  // API endpoint
  endpoint: "/api/auth/logout",
  
  // Method
  method: "POST" as const,
  
  // Navigation
  redirectPath: "/",
  logoutSuccessMessage: "You've been signed out successfully",
  logoutErrorMessage: "Logout failed. Please try again.",
  
  // Cleanup
  clearQueryCache: true,
  cacheKeysToClear: ["/api/auth/me", "/api/workspace", "/api/user"],
  
  // Behavior
  fullPageReload: false,
  showLogoutAnimation: true,
  animationDuration: 300,
  
  // Test IDs
  testId: "button-logout",
};
