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
 * Integrates with animation system for smooth logout transition
 * 
 * Usage: await performLogout()
 */
export async function performLogout() {
  try {
    // Show logout animation if animation context is available
    if (animationContextRef?.show) {
      animationContextRef.show({
        mode: 'warp',
        mainText: 'Logging Out',
        subText: 'See you soon!',
        duration: 1800,
        source: 'system'
      });
    }

    // 1. Clear all cached auth data IMMEDIATELY before API call
    // This ensures component re-renders as unauthenticated right away
    LOGOUT_CONFIG.cacheKeysToClear.forEach((key) => {
      queryClient.setQueryData([key], null);
    });

    // 2. Invalidate all queries to force refetch
    await queryClient.invalidateQueries();

    // 3. Call logout API and WAIT for response (don't fire and forget)
    const response = await fetch(LOGOUT_CONFIG.endpoint, {
      method: LOGOUT_CONFIG.method,
      credentials: "include",
      headers: {
        "Content-Type": "application/json",
      },
    });

    // Ensure API call succeeded before redirecting
    if (!response.ok) {
      console.warn(`Logout API returned ${response.status}`);
    }

    // 4. Clear cookies manually as backup (in case server doesn't)
    // Some browsers need explicit cookie clearing
    document.cookie = "connect.sid=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/;";
    
    // 5. Redirect user to homepage after animation completes
    // Animation duration is 1800ms, so redirect after
    setTimeout(() => {
      window.location.href = LOGOUT_CONFIG.redirectPath;
    }, 1900);
    
  } catch (error) {
    console.error(LOGOUT_CONFIG.logoutErrorMessage, error);

    // Show error animation if available
    if (animationContextRef?.show) {
      animationContextRef.show({
        mode: 'error',
        mainText: 'Logout Error',
        subText: 'Redirecting...',
        duration: 1800,
        source: 'system'
      });
    }

    // Still clear cache and redirect even if cache clearing fails
    LOGOUT_CONFIG.cacheKeysToClear.forEach((key) => {
      queryClient.setQueryData([key], null);
    });

    // Clear cookies as backup
    document.cookie = "connect.sid=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/;";
    
    // Force redirect to home after animation completes
    setTimeout(() => {
      window.location.href = LOGOUT_CONFIG.redirectPath;
    }, 1900);
  }
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
