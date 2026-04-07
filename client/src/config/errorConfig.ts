/**
 * Universal Error Configuration System
 * 
 * Centralized error handling configuration following CoAIleague universal dynamic pattern.
 * Every error message, handler, and behavior is configurable and centralized.
 */

export const errorConfig = {
  // Error messages by type
  messages: {
    generic: "Something went wrong. Please try again or contact support.",
    network: "Network error. Please check your connection and try again.",
    unauthorized: "You don't have permission to perform this action.",
    notFound: "The requested resource was not found.",
    validation: "Please check your input and try again.",
    timeout: "The request took too long. Please try again.",
    serverError: "Server error. Our team has been notified.",
    conflict: "This action conflicts with an existing operation.",
    forbidden: "Access denied.",
  },

  // Error codes mapping
  codes: {
    400: "validation",
    401: "unauthorized",
    403: "forbidden",
    404: "notFound",
    409: "conflict",
    500: "serverError",
    503: "serverError",
    0: "network", // Network timeout/error
  },

  // Error recovery actions
  recovery: {
    generic: { retry: true, goHome: true, contact: true },
    network: { retry: true, checkConnection: true },
    unauthorized: { login: true, goHome: true },
    notFound: { goHome: true, goBack: true },
    timeout: { retry: true, goHome: true },
    serverError: { retry: true, contact: true },
  },

  // Error boundary behavior
  boundaries: {
    global: true, // Enable global error boundary
    perPage: true, // Enable error boundaries per page
    fallbackRoute: "/dashboard", // Where to redirect on critical error
    showDetails: import.meta.env.MODE === "development", // Show error details in dev
    logToService: true, // Log errors to monitoring service
  },

  // Retry configuration
  retry: {
    maxAttempts: 3,
    delayMs: 1000,
    backoffMultiplier: 2,
  },
};

/**
 * Get error message for error type
 */
export function getErrorMessage(type: string | number): string {
  if (typeof type === "number") {
    const msgType = errorConfig.codes[type as keyof typeof errorConfig.codes] || "generic";
    return errorConfig.messages[msgType as keyof typeof errorConfig.messages];
  }
  return errorConfig.messages[type as keyof typeof errorConfig.messages] || errorConfig.messages.generic;
}

/**
 * Get recovery actions for error type
 */
export function getRecoveryActions(type: string) {
  return errorConfig.recovery[type as keyof typeof errorConfig.recovery] || errorConfig.recovery.generic;
}

/**
 * Determine if error is recoverable
 */
export function isRecoverable(error: any): boolean {
  if (!error) return true;
  
  const status = error.status || error.statusCode;
  const retryable = [408, 429, 500, 502, 503, 504]; // Timeout, Rate limit, Server errors
  
  return retryable.includes(status) || error.code === "NETWORK_ERROR";
}
