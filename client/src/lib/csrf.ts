/**
 * Centralized CSRF Token Management
 * Single source of truth for CSRF tokens across the application
 */

let cachedCsrfToken: string | null = null;
let csrfTokenPromise: Promise<string> | null = null;
let tokenFetchedAt: number = 0;
const TOKEN_REFRESH_MS = 30 * 60 * 1000; // Refresh token every 30 minutes

/**
 * Get CSRF token, fetching if needed
 */
export async function getCsrfToken(): Promise<string> {
  const now = Date.now();
  
  // Return cached token if still valid
  if (cachedCsrfToken && (now - tokenFetchedAt) < TOKEN_REFRESH_MS) {
    return cachedCsrfToken;
  }
  
  // Avoid multiple simultaneous fetches
  if (csrfTokenPromise) {
    return csrfTokenPromise;
  }
  
  // Fetch new token
  csrfTokenPromise = fetch('/api/csrf-token', { 
    credentials: 'include',
    headers: { 'Accept': 'application/json' }
  })
    .then(res => {
      if (!res.ok) {
        throw new Error('Failed to fetch CSRF token');
      }
      return res.json();
    })
    .then(data => {
      cachedCsrfToken = data.token;
      tokenFetchedAt = Date.now();
      csrfTokenPromise = null;
      return data.token;
    })
    .catch(err => {
      csrfTokenPromise = null;
      console.warn('[CSRF] Token fetch failed:', err);
      return '';
    });
  
  return csrfTokenPromise;
}

/**
 * Clear cached CSRF token (call on logout or session change)
 */
export function clearCsrfToken(): void {
  cachedCsrfToken = null;
  csrfTokenPromise = null;
  tokenFetchedAt = 0;
}

/**
 * Check if a response indicates CSRF token failure
 */
export function isCsrfError(response: Response, responseBody?: any): boolean {
  if (response.status !== 403) {
    return false;
  }
  
  // Check JSON body for CSRF error code
  if (responseBody && typeof responseBody === 'object') {
    if (responseBody.code === 'CSRF_TOKEN_INVALID' || 
        responseBody.code === 'CSRF_TOKEN_MISSING' ||
        responseBody.error?.includes('CSRF')) {
      return true;
    }
  }
  
  return false;
}

/**
 * Methods that require CSRF protection
 */
export const CSRF_METHODS = ['POST', 'PUT', 'PATCH', 'DELETE'];

/**
 * Check if method requires CSRF token
 */
export function requiresCsrfToken(method: string): boolean {
  return CSRF_METHODS.includes(method.toUpperCase());
}

/**
 * Add CSRF token to headers if method requires it
 */
export async function addCsrfHeader(
  method: string, 
  headers: Record<string, string>
): Promise<Record<string, string>> {
  if (requiresCsrfToken(method)) {
    const token = await getCsrfToken();
    if (token) {
      headers['X-CSRF-Token'] = token;
    }
  }
  return headers;
}

/**
 * Secure fetch wrapper that automatically adds CSRF tokens
 * Drop-in replacement for fetch() with automatic CSRF protection
 */
export async function secureFetch(
  url: string | URL | Request,
  init?: RequestInit
): Promise<Response> {
  const method = init?.method?.toUpperCase() || 'GET';
  
  // Only add CSRF for state-changing methods
  if (requiresCsrfToken(method)) {
    const token = await getCsrfToken();
    const headers = new Headers(init?.headers);
    
    if (token) {
      headers.set('X-CSRF-Token', token);
    }
    
    // Ensure credentials are included
    const response = await fetch(url, {
      ...init,
      headers,
      credentials: init?.credentials || 'include',
    });
    
    // Handle CSRF token expiry with retry
    if (response.status === 403) {
      try {
        const body = await response.clone().json();
        if (isCsrfError(response, body)) {
          clearCsrfToken();
          const freshToken = await getCsrfToken();
          if (freshToken) {
            headers.set('X-CSRF-Token', freshToken);
            return fetch(url, {
              ...init,
              headers,
              credentials: init?.credentials || 'include',
            });
          }
        }
      } catch {
        // JSON parse failed, return original response
      }
    }
    
    return response;
  }
  
  // For GET/HEAD, just pass through
  return fetch(url, {
    ...init,
    credentials: init?.credentials || 'include',
  });
}
