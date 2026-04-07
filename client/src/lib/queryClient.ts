import { QueryClient, QueryFunction } from "@tanstack/react-query";
import { getCsrfToken, clearCsrfToken, isCsrfError, requiresCsrfToken } from "./csrf";
import { toast } from "@/hooks/use-toast";

// Re-export for backwards compatibility
export { clearCsrfToken };

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
      body: data ? JSON.stringify(data) : undefined,
      credentials: "include",
    });

    if (res.status === 401) {
      const path = typeof window !== "undefined" ? window.location.pathname : "";
      const isOnAuthPage = path === "/login" || path === "/register" || path === "/forgot-password" || path === "/reset-password" || path.startsWith("/onboarding/");
      if (typeof window !== "undefined" && !isOnAuthPage) {
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
              body: data ? JSON.stringify(data) : undefined,
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
      // Redirect to login if not already on an auth/public page
      const path = typeof window !== "undefined" ? window.location.pathname : "";
      const isOnAuthPage = path === "/login" || path === "/register" || path === "/forgot-password" || path === "/reset-password" || path.startsWith("/onboarding/");
      if (typeof window !== "undefined" && !isOnAuthPage) {
        window.location.href = "/login";
      }
    }

    await throwIfResNotOk(res);
    return await res.json();
  };

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      queryFn: getQueryFn({ on401: "throw" }),
      refetchInterval: false,
      refetchOnWindowFocus: false,
      staleTime: 0,
      retry: (failureCount, error) => {
        if (error instanceof ApiError && error.status < 500) return false;
        return failureCount < 2;
      },
    },
    mutations: {
      retry: false,
    },
  },
});
