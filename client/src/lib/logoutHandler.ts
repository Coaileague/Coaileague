/**
 * Universal Logout Handler
 * Single source of truth for ALL logout functionality
 * 
 * Usage: Call performLogout() from any component
 * No hardcoded values - everything from config
 */

import { LOGOUT_CONFIG } from "@/config/logout";
import { queryClient } from "@/lib/queryClient";

/**
 * Perform logout across the entire application
 * Handles API call, cache clearing, and redirect
 * 
 * Usage: await performLogout()
 */
export async function performLogout() {
  try {
    // 1. Clear all cached auth data IMMEDIATELY before API call
    // This ensures component re-renders as unauthenticated right away
    LOGOUT_CONFIG.cacheKeysToClear.forEach((key) => {
      queryClient.setQueryData([key], null);
    });

    // 2. Invalidate all queries to force refetch
    await queryClient.invalidateQueries();

    // 3. Call logout API in background (fire and forget)
    fetch(LOGOUT_CONFIG.endpoint, {
      method: LOGOUT_CONFIG.method,
      credentials: "include",
      headers: {
        "Content-Type": "application/json",
      },
    }).catch(err => console.error("Logout API call failed:", err));

    // 4. Redirect user immediately (from centralized config)
    // Don't wait for API - cache is already cleared
    window.location.href = LOGOUT_CONFIG.redirectPath;
  } catch (error) {
    console.error(LOGOUT_CONFIG.logoutErrorMessage, error);

    // Still clear cache and redirect even if cache clearing fails
    LOGOUT_CONFIG.cacheKeysToClear.forEach((key) => {
      queryClient.setQueryData([key], null);
    });

    // Force redirect to home
    window.location.href = LOGOUT_CONFIG.redirectPath;
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
