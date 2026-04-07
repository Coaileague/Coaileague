import { useEffect } from "react";
import { queryClient, ApiError } from "@/lib/queryClient";
import { useUniversalToast } from "@/components/universal/UniversalToast";

function formatMutationError(error: unknown): string {
  if (error instanceof ApiError) {
    switch (error.status) {
      case 401:
        return "Session expired. Please refresh the page and log in again.";
      case 403:
        return "You don't have permission to perform this action.";
      case 404:
        return "The requested resource was not found.";
      case 409:
        return "This action conflicts with existing data. Please refresh and try again.";
      case 422:
      case 400: {
        const raw = error.message;
        const colonIdx = raw.indexOf(": ");
        if (colonIdx !== -1) {
          const body = raw.slice(colonIdx + 2);
          try {
            const parsed = JSON.parse(body);
            if (parsed.message) return parsed.message;
            if (parsed.error) return parsed.error;
          } catch {
            if (body.length < 200) return body;
          }
        }
        return "Invalid request. Please check your input and try again.";
      }
      case 429:
        return "Too many requests. Please wait a moment and try again.";
      case 503:
        return "Service temporarily unavailable. Please try again shortly.";
      default:
        if (error.status >= 500) {
          return "A server error occurred. Please try again or contact support.";
        }
        return error.message || "Something went wrong. Please try again.";
    }
  }

  if (error instanceof Error) {
    if (error.message.includes("Failed to fetch") || error.message.includes("NetworkError")) {
      return "Network error. Please check your connection and try again.";
    }
    if (error.message.length < 200) return error.message;
  }

  return "Something went wrong. Please try again.";
}

export function GlobalMutationErrorHandler() {
  const { error } = useUniversalToast();

  useEffect(() => {
    const unsubscribe = queryClient.getMutationCache().subscribe((event) => {
      if (
        event.type === "updated" &&
        event.mutation?.state.status === "error"
      ) {
        const mutation = event.mutation;
        if (mutation.options.onError) {
          return;
        }

        const err = mutation.state.error;
        if (err) {
          error(formatMutationError(err));
        }
      }
    });

    return unsubscribe;
  }, [error]);

  return null;
}
