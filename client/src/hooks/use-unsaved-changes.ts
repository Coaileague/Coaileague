import { useEffect, useCallback, useRef } from "react";
import { useLocation } from "wouter";

/**
 * Hook to warn users when they try to leave a page with unsaved changes
 * 
 * IMPORTANT: This hook primarily protects against browser navigation (refresh, close, back).
 * For internal React navigation, you MUST use the returned `confirmNavigation` function
 * before programmatically changing routes.
 * 
 * @example
 * ```tsx
 * const { confirmNavigation } = useUnsavedChangesWarning(hasUnsavedChanges);
 * 
 * const handleSave = () => {
 *   if (confirmNavigation()) {
 *     setLocation('/dashboard');
 *   }
 * };
 * ```
 * 
 * @param hasUnsavedChanges - Boolean indicating if there are unsaved changes
 * @param message - Custom warning message (optional)
 */
export function useUnsavedChangesWarning(
  hasUnsavedChanges: boolean,
  message: string = "You have unsaved changes. Are you sure you want to leave?"
) {
  const isNavigatingRef = useRef(false);

  // Warn on browser navigation (refresh, close tab, back button)
  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (hasUnsavedChanges && !isNavigatingRef.current) {
        e.preventDefault();
        e.returnValue = message;
        return message;
      }
    };

    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, [hasUnsavedChanges, message]);

  // Return a function to manually check before navigation
  // This MUST be called before any programmatic navigation
  const confirmNavigation = useCallback(() => {
    if (hasUnsavedChanges) {
      const confirmed = window.confirm(message);
      if (confirmed) {
        isNavigatingRef.current = true;
      }
      return confirmed;
    }
    return true;
  }, [hasUnsavedChanges, message]);

  return { confirmNavigation };
}

/**
 * Helper hook that wraps wouter's setLocation to automatically check for unsaved changes
 * 
 * @example
 * ```tsx
 * const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
 * const [location, setLocation] = useSafeLocation(hasUnsavedChanges);
 * 
 * // This will now prompt before navigation if there are unsaved changes
 * <Button onClick={() => setLocation('/dashboard')}>Leave</Button>
 * ```
 */
export function useSafeLocation(
  hasUnsavedChanges: boolean,
  message?: string
): [string, (to: string) => void] {
  const [location, setLocation] = useLocation();
  const { confirmNavigation } = useUnsavedChangesWarning(hasUnsavedChanges, message);

  const safeSetLocation = useCallback((to: string) => {
    if (confirmNavigation()) {
      setLocation(to);
    }
  }, [confirmNavigation, setLocation]);

  return [location, safeSetLocation];
}
