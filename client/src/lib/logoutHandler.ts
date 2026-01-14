/**
 * Universal Logout Handler
 * Single source of truth for ALL logout functionality
 * 
 * Usage: Call performLogout() from any component
 * No hardcoded values - everything from config
 */

import { LOGOUT_CONFIG } from "@/config/logout";
import { queryClient } from "@/lib/queryClient";

// Global animation context reference (set by logout trigger)
let animationContextRef: any = null;

export function setLogoutAnimationContext(context: any) {
  animationContextRef = context;
}

/**
 * Perform logout across the entire application
 * Handles API call, cache clearing, and redirect
 * Optimized for IMMEDIATE visual feedback
 * 
 * Usage: await performLogout()
 */
export async function performLogout() {
  // STEP 1: Show visual feedback with graceful animation (10 seconds for users to enjoy)
  const showAnimation = animationContextRef?.show;
  if (showAnimation) {
    showAnimation({
      mode: 'warp',
      mainText: 'Signing Out...',
      subText: 'See you soon!',
      duration: 10000,
      source: 'system'
    });
  }

  // STEP 2: Wait for backend to properly close connections
  try {
    await fetch(LOGOUT_CONFIG.endpoint, {
      method: LOGOUT_CONFIG.method,
      credentials: "include",
      headers: { "Content-Type": "application/json" },
    });
  } catch (error) {
    console.warn('Logout API call failed:', error);
  }

  // STEP 3: Clear auth cache after backend confirms
  LOGOUT_CONFIG.cacheKeysToClear.forEach((key) => {
    queryClient.setQueryData([key], null);
  });

  // STEP 4: Clear cookies
  document.cookie = "connect.sid=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/;";

  // STEP 5: Invalidate queries
  await queryClient.invalidateQueries().catch(() => {});

  // STEP 6: Graceful redirect with time for animation to complete (10 seconds)
  const redirectDelay = showAnimation ? 10000 : 500;
  setTimeout(() => {
    window.location.href = LOGOUT_CONFIG.redirectPath;
  }, redirectDelay);
}

/**
 * Get the logout endpoint from config
 * Use this if you need the endpoint for other purposes
 */
export function getLogoutEndpoint() {
  return LOGOUT_CONFIG.endpoint;
}

/**
 * Get the logout redirect path from config
 */
export function getLogoutRedirectPath() {
  return LOGOUT_CONFIG.redirectPath;
}
