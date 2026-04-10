/**
 * Universal Logout Handler
 * Single source of truth for ALL logout functionality
 *
 * Usage: Call performLogout() from any component
 * No hardcoded values - everything from config
 *
 * Features:
 * - Smooth, synchronized progress bar animation
 * - Proper session destruction and cookie clearing
 * - Hard redirect to ensure clean state
 */

import { secureFetch } from "@/lib/csrf";
import { LOGOUT_CONFIG } from "@/config/logout";
import { queryClient } from "@/lib/queryClient";
// @ts-expect-error — TS migration: fix in refactoring sprint
import { startLogoutTransition, type TransitionLoaderContextValue } from "@/components/canvas-hub";
import { broadcastLogout } from "@/lib/tabSync";

// Global transition loader reference (set by logout trigger)
let transitionLoaderRef: TransitionLoaderContextValue | null = null;

export function setLogoutTransitionLoader(loader: TransitionLoaderContextValue | null) {
  transitionLoaderRef = loader;
}

/**
 * Clear all possible authentication cookies
 * Handles different path/domain configurations
 */
function clearAllAuthCookies() {
  const cookiesToClear = ['connect.sid', 'session', 'auth', 'token', 'jwt', 'sid'];
  const paths = ['/', '/api', ''];
  const hostname = window.location.hostname;

  cookiesToClear.forEach(cookieName => {
    paths.forEach(path => {
      const baseClear = `${cookieName}=; expires=Thu, 01 Jan 1970 00:00:00 UTC; max-age=0;`;

      // Clear with various path/domain combinations
      document.cookie = `${baseClear} path=${path || '/'};`;
      document.cookie = `${baseClear} path=${path || '/'}; domain=${hostname};`;
      document.cookie = `${baseClear} path=${path || '/'}; domain=.${hostname};`;

      // Also try without domain for localhost scenarios
      document.cookie = `${cookieName}=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=${path || '/'};`;
    });
  });
}

/**
 * Clear all local storage auth data
 */
function clearLocalAuthData() {
  try {
    // Known auth-related keys
    const keysToRemove = [
      'coaileague_remember_me',
      'auth_token',
      'user',
      'session',
      'accessToken',
      'refreshToken',
    ];

    keysToRemove.forEach(key => {
      localStorage.removeItem(key);
      sessionStorage.removeItem(key);
    });

    // Clear session storage entirely
    sessionStorage.clear();
  } catch (e) {
    // Storage might be blocked in some contexts
    console.warn('Could not clear storage:', e);
  }

  // Security: Clear service worker caches to prevent stale PII from being served
  // to the next user on shared devices after logout.
  if ('caches' in window) {
    caches.keys().then(cacheNames => {
      cacheNames.forEach(name => caches.delete(name));
    }).catch(() => {});
  }

  // Security: Clear the offline IndexedDB queue which may contain request bodies
  // with PII and Authorization headers from the logged-out session.
  try {
    const offlineDbNames = ['coaileague-offline', 'CoAIleagueOffline'];
    offlineDbNames.forEach(dbName => {
      const req = indexedDB.deleteDatabase(dbName);
      req.onerror = () => {};
    });
  } catch {
    // IndexedDB may not be available in all contexts
  }
}

/**
 * Perform logout across the entire application
 * Handles API call, cache clearing, and redirect
 *
 * Usage: await performLogout()
 */
export async function performLogout() {
  // Start the synchronized transition via Canvas Hub
  const transition = transitionLoaderRef ? startLogoutTransition(transitionLoaderRef) : null;

  try {
    transition?.setProgress(10);
    transition?.updateMessage('Signing Out', 'Saving your work...');

    const pendingMutations = queryClient.getMutationCache().getAll()
      .filter(m => m.state.status === 'pending');

    if (pendingMutations.length > 0) {
      await Promise.all(pendingMutations.map(m => m.state.submittedAt));
    }

    transition?.setProgress(30);
    transition?.updateMessage('Signing Out', 'Syncing data...');

    // STEP 2: Call backend to destroy session - CRITICAL: must await and verify
    try {
      const response = await secureFetch(LOGOUT_CONFIG.endpoint, {
        method: LOGOUT_CONFIG.method,
        credentials: "include",
        headers: { "Content-Type": "application/json" },
      });

      if (!response.ok) {
        console.warn('Logout API returned status:', response.status);
      }
    } catch (fetchError) {
      console.warn('Logout API call failed:', fetchError);
      // Continue with client-side cleanup even if API fails
    }

    transition?.setProgress(60);
    transition?.updateMessage('Signing Out', 'Clearing session...');

    LOGOUT_CONFIG.cacheKeysToClear.forEach((key) => {
      queryClient.setQueryData([key], null);
    });

    queryClient.clear();

    broadcastLogout();

    transition?.setProgress(75);

    clearAllAuthCookies();
    clearLocalAuthData();

    transition?.setProgress(90);
    transition?.updateMessage('Signing Out', 'Finalizing...');
  } catch (error) {
    console.warn('Logout process error:', error);
  }

  if (transition) {
    try {
      await Promise.race([
        transition.complete(),
        new Promise(resolve => setTimeout(resolve, 3000)),
      ]);
    } catch {
      // Ensure redirect happens even if animation fails
    }
  }

  const redirectUrl = new URL(LOGOUT_CONFIG.redirectPath, window.location.origin);
  redirectUrl.searchParams.set('_logout', Date.now().toString());
  window.location.replace(redirectUrl.toString());
}

/**
 * Get the logout endpoint from config
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
