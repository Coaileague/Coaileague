import { useEffect, useCallback, useState } from "react";
import { useLocation } from "wouter";

/**
 * Hook to warn users when they try to leave a page with unsaved changes
 * @param hasUnsavedChanges - Boolean indicating if there are unsaved changes
 * @param message - Custom warning message (optional)
 */
export function useUnsavedChangesWarning(
  hasUnsavedChanges: boolean,
  message: string = "You have unsaved changes. Are you sure you want to leave?"
) {
  const [location] = useLocation();
  const [previousLocation, setPreviousLocation] = useState(location);

  // Warn on browser navigation (refresh, close tab, back button)
  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (hasUnsavedChanges) {
        e.preventDefault();
        e.returnValue = message;
        return message;
      }
    };

    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, [hasUnsavedChanges, message]);

  // Warn on internal navigation
  useEffect(() => {
    if (location !== previousLocation && hasUnsavedChanges) {
      const confirmed = window.confirm(message);
      if (!confirmed) {
        // Try to prevent navigation (this might not work in all cases with wouter)
        window.history.pushState(null, "", previousLocation);
      }
    }
    setPreviousLocation(location);
  }, [location, previousLocation, hasUnsavedChanges, message]);

  // Return a function to manually check before navigation
  const confirmNavigation = useCallback(() => {
    if (hasUnsavedChanges) {
      return window.confirm(message);
    }
    return true;
  }, [hasUnsavedChanges, message]);

  return { confirmNavigation };
}
