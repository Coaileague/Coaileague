import { createContext, useContext, useState, useCallback, useRef, useEffect } from "react";
import { type ProgressScenario } from "@/components/progress-loading-overlay";
import { useOverlayController } from "./overlay-controller";

// Scenario rotation order
const SCENARIO_ROTATION: ProgressScenario[] = [
  "login",
  "dashboardLoading",
  "dataSync",
  "aiProcessing",
  "heavyOperation",
  "logout",
];

// Minimum display time for professional UX (2.5 seconds)
const MIN_DISPLAY_TIME_MS = 2500;

interface LoadingRequest {
  id: string;
  overlayId: string; // Track overlay controller ID
  scenario?: ProgressScenario;
  minDuration?: number;
  startTime: number;
}

interface LoadingManagerContextValue {
  beginLoading: (options?: { scenario?: ProgressScenario; minDuration?: number }) => string;
  endLoading: (id: string) => void;
  isLoading: boolean;
}

const LoadingManagerContext = createContext<LoadingManagerContextValue | null>(null);

export function LoadingManagerProvider({ children }: { children: React.ReactNode }) {
  const overlayController = useOverlayController();
  const [activeRequest, setActiveRequest] = useState<LoadingRequest | null>(null);
  const [queue, setQueue] = useState<LoadingRequest[]>([]);
  const scenarioIndexRef = useRef(0);
  const requestCounterRef = useRef(0);
  const [isBootComplete, setIsBootComplete] = useState(false);

  // Mark boot as complete when HTML loader finishes
  useEffect(() => {
    // Wait for static HTML loader to complete (it removes itself)
    const checkBootComplete = () => {
      const htmlLoader = document.getElementById('initial-loader');
      if (!htmlLoader) {
        setIsBootComplete(true);
      } else {
        // Check again in 100ms
        setTimeout(checkBootComplete, 100);
      }
    };
    
    // Start checking after a small delay
    setTimeout(checkBootComplete, 500);
  }, []);

  // Load last used scenario index from sessionStorage
  useEffect(() => {
    const stored = sessionStorage.getItem("autoforce_loading_scenario_index");
    if (stored) {
      const parsed = parseInt(stored, 10);
      if (!isNaN(parsed)) {
        scenarioIndexRef.current = parsed;
      }
    }
  }, []);

  // Get next scenario in rotation
  const getNextScenario = useCallback(() => {
    const scenario = SCENARIO_ROTATION[scenarioIndexRef.current];
    scenarioIndexRef.current = (scenarioIndexRef.current + 1) % SCENARIO_ROTATION.length;
    // Persist to sessionStorage
    sessionStorage.setItem("autoforce_loading_scenario_index", scenarioIndexRef.current.toString());
    return scenario;
  }, []);

  // Begin loading - returns request ID
  const beginLoading = useCallback((options?: { scenario?: ProgressScenario; minDuration?: number }) => {
    // SUPPRESS during initial boot - let HTML loader handle it
    if (!isBootComplete) {
      console.log('[LoadingManager] Suppressed during boot - using HTML loader');
      return `suppressed-${++requestCounterRef.current}`;
    }

    const id = `loading-${++requestCounterRef.current}`;
    const scenario = options?.scenario || getNextScenario();
    const minDuration = options?.minDuration || MIN_DISPLAY_TIME_MS;
    
    const request: LoadingRequest = {
      id,
      overlayId: '', // Will be set below
      scenario,
      minDuration,
      startTime: Date.now(),
    };

    // Show overlay via shared controller with normal priority
    // onActivate callback resets startTime when overlay actually becomes visible
    const overlayId = overlayController.showOverlay({
      status: "loading",
      scenario,
      priority: "normal", // Normal priority - transitions take precedence
      onActivate: () => {
        // Reset timer when overlay becomes visible (handles queued overlays)
        setActiveRequest(prev => prev?.id === id ? { ...prev, startTime: Date.now() } : prev);
      }
    });
    
    request.overlayId = overlayId;

    // If no active request, make this one active immediately
    if (!activeRequest) {
      setActiveRequest(request);
    } else {
      // Queue it
      setQueue((prev) => [...prev, request]);
    }

    return id;
  }, [activeRequest, getNextScenario, overlayController, isBootComplete]);

  // End loading - enforces minimum display time
  const endLoading = useCallback((id: string) => {
    // Skip suppressed requests
    if (id.startsWith('suppressed-')) {
      return;
    }

    if (activeRequest?.id === id) {
      // Pass minDuration to controller so it enforces timing from visibleSince
      overlayController.hideOverlay(activeRequest.overlayId, activeRequest.minDuration || MIN_DISPLAY_TIME_MS);
      
      // Immediately process queue (controller will handle timing)
      setActiveRequest(null);
      setQueue((prev) => {
        if (prev.length > 0) {
          const [next, ...rest] = prev;
          setActiveRequest(next);
          return rest;
        }
        return prev;
      });
    }
  }, [activeRequest, overlayController]);

  return (
    <LoadingManagerContext.Provider value={{ beginLoading, endLoading, isLoading: !!activeRequest }}>
      {children}
    </LoadingManagerContext.Provider>
  );
}

export function useLoadingManager() {
  const context = useContext(LoadingManagerContext);
  if (!context) {
    throw new Error("useLoadingManager must be used within LoadingManagerProvider");
  }
  return context;
}

// Convenience hook for wrapping async operations
export function useLoadingOperation() {
  const { beginLoading, endLoading } = useLoadingManager();

  return useCallback(
    async <T,>(
      asyncFn: () => Promise<T>,
      options?: { scenario?: ProgressScenario; minDuration?: number }
    ): Promise<T> => {
      const id = beginLoading(options);
      try {
        const result = await asyncFn();
        return result;
      } finally {
        endLoading(id);
      }
    },
    [beginLoading, endLoading]
  );
}
