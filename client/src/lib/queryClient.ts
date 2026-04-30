import { QueryClient, QueryFunction } from "@tanstack/react-query";
import { getCsrfToken, clearCsrfToken, isCsrfError, requiresCsrfToken } from "./csrf";
import { toast } from "@/hooks/use-toast";

// Re-export for backwards compatibility
export { clearCsrfToken };

// ─────────────────────────────────────────────────────────────────────────────
// PHASE 3: Global camelCase ↔ snake_case Interceptor
// Drizzle returns snake_case column names from PostgreSQL. All frontend
// interfaces use camelCase. This interceptor converts automatically so we
// never have to touch individual files.
//
// RULES:
//   Outgoing (request body)  → camelCase keys become snake_case
//   Incoming (response JSON) → snake_case keys become camelCase
//
// SKIP LIST: keys that must never be transformed (file fields, Stripe IDs,
// external service payloads that already expect snake_case from the provider).
// ─────────────────────────────────────────────────────────────────────────────

const SKIP_TRANSFORM = new Set([
  // Stripe webhook fields come pre-snake_cased from Stripe
  "client_secret", "payment_method", "payment_intent",
  // Plaid passthrough fields
  "account_id", "routing_number",
  // Raw SQL / JSONB blobs stored verbatim — never transform their inner keys
  "pre_edit_snapshot", "correction_data", "evidence_snapshot",
  "risk_factors", "staged_metadata", "line_items", "shift_details",
]);

/** camelCase → snake_case  (e.g. "workspaceId" → "workspace_id") */
function toSnakeCase(str: string): string {
  return str.replace(/([A-Z])/g, (c) => `_${c.toLowerCase()}`);
}

/** snake_case → camelCase  (e.g. "workspace_id" → "workspaceId") */
function toCamelCase(str: string): string {
  return str.replace(/_([a-z])/g, (_, c) => c.toUpperCase());
}

type JsonValue = string | number | boolean | null | JsonObject | JsonArray;
type JsonObject = { [key: string]: JsonValue };
type JsonArray = JsonValue[];

/**
 * Recursively converts all object keys to snake_case.
 * Arrays are traversed but their items' types are preserved.
 * Primitives are returned as-is.
 */
export function deepToSnake(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(deepToSnake);
  if (value !== null && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      const snakeKey = SKIP_TRANSFORM.has(k) ? k : toSnakeCase(k);
      out[snakeKey] = SKIP_TRANSFORM.has(k) ? v : deepToSnake(v);
    }
    return out;
  }
  return value;
}

/**
 * Recursively converts all object keys to camelCase.
 * Safe to call on any JSON value returned by the server.
 */
export function deepToCamel(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(deepToCamel);
  if (value !== null && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      const camelKey = SKIP_TRANSFORM.has(k) ? k : toCamelCase(k);
      out[camelKey] = SKIP_TRANSFORM.has(k) ? v : deepToCamel(v);
    }
    return out;
  }
  return value;
}

// Custom error class that includes HTTP status for better error handling
export class ApiError extends Error {
  status: number;
  statusText: string;
  
  constructor(status: number, message: string, statusText: string = '') {
    super(`${status}: ${message}`);
    this.name = 'ApiError';
    this.status = status;
    this.statusText = statusText;
  }
}

async function throwIfResNotOk(res: Response) {
  if (!res.ok) {
    const text = (await res.text()) || res.statusText;
    throw new ApiError(res.status, text, res.statusText);
  }
}

/**
 * Core API request utility for making authenticated and CSRF-protected requests to the backend.
 * 
 * @param method - HTTP method (GET, POST, PUT, PATCH, DELETE)
 * @param url - API endpoint URL
 * @param data - Request body data (will be JSON stringified)
 * @returns Promise<Response>
 * 
 * @throws {ApiError} - Custom error class for non-OK HTTP responses
 * @throws {TypeError} - Network errors (triggers "Network Error" toast)
 * 
 * Features:
 * - Automatic JSON content-type header when data is provided
 * - CSRF token injection for state-changing methods
 * - Global 401 (Unauthorized) redirect hook to /auth
 * - Automatic CSRF token retry logic on 403 Forbidden
 */
export async function apiRequest(
  method: string,
  url: string,
  data?: unknown | undefined,
): Promise<Response> {
  const headers: Record<string, string> = {};
  
  // Always set Content-Type for state-changing methods so the server's
  // Content-Type enforcement middleware (which returns 415 for missing headers)
  // never blocks bodyless POSTs/PUTs/PATCHes.
  if (data || ['POST', 'PUT', 'PATCH'].includes(method.toUpperCase())) {
    headers["Content-Type"] = "application/json";
  }
  
  // Add CSRF token for state-changing methods
  if (requiresCsrfToken(method)) {
    const csrfToken = await getCsrfToken();
    if (csrfToken) {
      headers["X-CSRF-Token"] = csrfToken;
    }
  }
  
  try {
    const res = await fetch(url, {
      method,
      headers,
      // Outgoing: camelCase → snake_case before leaving the client
      body: data ? JSON.stringify(deepToSnake(data)) : undefined,
      credentials: "include",
    });

    if (res.status === 401) {
      const path = typeof window !== "undefined" ? window.location.pathname : "";
      const isOnPublicOrAuthPage = path === "/" || path === "/login" || path === "/register" ||
        path === "/forgot-password" || path === "/reset-password" ||
        path === "/pricing" || path === "/features" || path === "/trinity-features" ||
        path === "/contact" || path === "/support" || path === "/terms" || path === "/privacy" ||
        path === "/homepage" || path === "/compare" || path === "/roi-calculator" ||
        path.startsWith("/onboarding/") || path.startsWith("/regulatory") ||
        path.startsWith("/client-portal/") || path.startsWith("/forms/") ||
        path.startsWith("/jobs/") || path.startsWith("/pay-invoice/");
      if (typeof window !== "undefined" && !isOnPublicOrAuthPage) {
        window.location.href = "/login";
      }
    }

    // If CSRF validation failed, clear token and retry once
    if (res.status === 403) {
      try {
        const responseBody = await res.clone().json();
        if (isCsrfError(res, responseBody)) {
          clearCsrfToken();
          // Get fresh token and retry
          const freshToken = await getCsrfToken();
          if (freshToken) {
            headers["X-CSRF-Token"] = freshToken;
            const retryRes = await fetch(url, {
              method,
              headers,
              // Outgoing: camelCase → snake_case on retry too
              body: data ? JSON.stringify(deepToSnake(data)) : undefined,
              credentials: "include",
            });
            await throwIfResNotOk(retryRes);
            return retryRes;
          }
        }
      } catch {
        // JSON parse failed, continue with original response
      }
    }

    await throwIfResNotOk(res);
    return res;
  } catch (error) {
    if (error instanceof TypeError && error.message === "Failed to fetch") {
      toast({
        title: "Network Error",
        description: "Please check your internet connection and try again.",
        variant: "destructive",
      });
    }
    throw error;
  }
}

type UnauthorizedBehavior = "returnNull" | "throw";
export const getQueryFn: <T>(options: {
  on401: UnauthorizedBehavior;
}) => QueryFunction<T> =
  ({ on401: unauthorizedBehavior }) =>
  async ({ queryKey }) => {
    let url: string;
    
    // Handle structured keys with params: ["/api/path", { param1: value1, ... }]
    if (queryKey.length === 2 && typeof queryKey[1] === 'object' && queryKey[1] !== null && !Array.isArray(queryKey[1])) {
      const basePath = queryKey[0] as string;
      const params = queryKey[1] as Record<string, unknown>;
      const searchParams = new URLSearchParams();
      
      // Serialize params to query string
      Object.entries(params).forEach(([key, value]) => {
        if (value !== undefined && value !== null) {
          searchParams.set(key, String(value));
        }
      });
      
      const queryString = searchParams.toString();
      url = queryString ? `${basePath}?${queryString}` : basePath;
    } else {
      // Default behavior: join segments with "/"
      url = queryKey.join("/") as string;
    }
    
    const res = await fetch(url, {
      credentials: "include",
    });

    if (unauthorizedBehavior === "returnNull" && res.status === 401) {
      return null;
    }

    if (res.status === 401) {
      // Redirect to login only when on a protected (non-public) route
      const path = typeof window !== "undefined" ? window.location.pathname : "";
      const isOnPublicOrAuthPage = path === "/" || path === "/login" || path === "/register" ||
        path === "/forgot-password" || path === "/reset-password" ||
        path === "/pricing" || path === "/features" || path === "/trinity-features" ||
        path === "/contact" || path === "/support" || path === "/terms" || path === "/privacy" ||
        path === "/homepage" || path === "/compare" || path === "/roi-calculator" ||
        path.startsWith("/onboarding/") || path.startsWith("/regulatory") ||
        path.startsWith("/client-portal/") || path.startsWith("/forms/") ||
        path.startsWith("/jobs/") || path.startsWith("/pay-invoice/");
      if (typeof window !== "undefined" && !isOnPublicOrAuthPage) {
        window.location.href = "/login";
      }
    }

    if (res.status === 429) {
      // Rate limited — retry once after the Retry-After delay. Never crash to splash screen.
      const retryAfterSec = parseInt(res.headers.get('Retry-After') || '10', 10);
      const waitMs = Math.min(retryAfterSec * 1000, 30_000); // cap at 30s
      await new Promise(resolve => setTimeout(resolve, waitMs));
      const retryRes = await fetch(url, { credentials: 'include' });
      if (retryRes.ok) {
        return deepToCamel(await retryRes.json()) as T;
      }
      throw new ApiError(429, 'RATE_LIMITED', 'Too many requests — please try again in a moment.');
    }

    await throwIfResNotOk(res);
    // Incoming: snake_case → camelCase on every GET response
    return deepToCamel(await res.json()) as T;
  };

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      queryFn: getQueryFn({ on401: "throw" }),
      refetchInterval: false,
      refetchOnWindowFocus: false,
      staleTime: 0,
      retry: (failureCount, error) => {
        // 429 is retryable — the getQueryFn already does one inline retry with
        // Retry-After delay. If it still fails, allow one more attempt here.
        if (error instanceof ApiError && error.status === 429) return failureCount < 1;
        // All other 4xx are permanent failures — don't retry.
        if (error instanceof ApiError && error.status < 500) return false;
        return failureCount < 2;
      },
      retryDelay: (attempt, error) => {
        // For 429s: use a longer delay on each attempt
        if (error instanceof ApiError && error.status === 429) {
          return Math.min(1000 * 2 ** attempt, 15_000); // 2s, 4s, ... up to 15s
        }
        return Math.min(1000 * 2 ** attempt, 10_000);
      },
    },
    mutations: {
      retry: false,
    },
  },
});
