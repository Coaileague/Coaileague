/**
 * Centralized API Client
 * Handles all API calls with automatic endpoint resolution from config
 * Provides type-safe, consistent API interaction
 */

import { configManager } from "@/lib/configManager";
import { queryClient } from "@/lib/queryClient";

export type RequestMethod = "GET" | "POST" | "PUT" | "PATCH" | "DELETE";

interface RequestOptions {
  method?: RequestMethod;
  body?: any;
  headers?: Record<string, string>;
  params?: Record<string, any>;
}

/**
 * Make API request with centralized endpoint resolution
 * Usage: apiClient('employees.list', { params: { page: 1 } })
 */
export async function apiClient(
  endpointPath: string,
  options: RequestOptions = {}
): Promise<any> {
  try {
    const { method = "GET", body, headers = {}, params } = options;

    // Get endpoint from centralized config
    const endpoint = configManager.getEndpoint(endpointPath);
    if (!endpoint) {
      throw new Error(`Endpoint not found: ${endpointPath}`);
    }

    // Build full URL with params
    const fullUrl = configManager.buildApiUrl(endpoint, params);

    // Make request
    const response = await fetch(fullUrl, {
      method,
      credentials: "include",
      headers: {
        "Content-Type": "application/json",
        ...headers,
      },
      ...(body && { body: JSON.stringify(body) }),
    });

    // Handle response
    if (!response.ok) {
      const error = await response.json().catch(() => ({}));
      throw new Error(error.message || `API error: ${response.status}`);
    }

    return response.json();
  } catch (error) {
    console.error(`API request failed: ${endpointPath}`, error);
    throw error;
  }
}

/**
 * GET request helper
 */
export function apiGet(endpoint: string, params?: Record<string, any>) {
  return apiClient(endpoint, { method: "GET", params });
}

/**
 * POST request helper
 */
export function apiPost(endpoint: string, body?: any, params?: Record<string, any>) {
  return apiClient(endpoint, { method: "POST", body, params });
}

/**
 * PUT request helper
 */
export function apiPut(endpoint: string, body?: any, params?: Record<string, any>) {
  return apiClient(endpoint, { method: "PUT", body, params });
}

/**
 * PATCH request helper
 */
export function apiPatch(endpoint: string, body?: any, params?: Record<string, any>) {
  return apiClient(endpoint, { method: "PATCH", body, params });
}

/**
 * DELETE request helper
 */
export function apiDelete(endpoint: string, params?: Record<string, any>) {
  return apiClient(endpoint, { method: "DELETE", params });
}
