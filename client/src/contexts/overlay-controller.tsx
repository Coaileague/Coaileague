/**
 * OverlayController - Centralized loading overlay management
 * Prevents double loading bars by ensuring only one overlay renders at a time
 */

import { createContext, useContext, useState, useCallback, useRef, ReactNode } from "react";
import { ProgressLoadingOverlay, ProgressScenario } from "@/components/progress-loading-overlay";

export type OverlayStatus = "loading" | "success" | "error" | "info";
export type OverlayPriority = "critical" | "high" | "normal";

interface OverlayRequest {
  id: string;
  priority: OverlayPriority;
  status: OverlayStatus;
  scenario?: ProgressScenario;
  title?: string;
  duration?: number;
  onComplete?: () => void;
  visibleSince?: number; // Timestamp when overlay became visible
  onActivate?: () => void; // Called when overlay becomes visible
}

interface OverlayControllerContextValue {
  showOverlay: (request: Omit<OverlayRequest, "id" | "visibleSince">) => string;
  hideOverlay: (id: string, minDuration?: number) => void;
  updateOverlay: (id: string, updates: Partial<OverlayRequest>) => void;
}

const OverlayControllerContext = createContext<OverlayControllerContextValue | null>(null);

export function OverlayControllerProvider({ children }: { children: ReactNode }) {
  const [activeOverlay, setActiveOverlay] = useState<OverlayRequest | null>(null);
  const [queue, setQueue] = useState<OverlayRequest[]>([]);
  const requestCounterRef = useRef(0);

  const showOverlay = useCallback((request: Omit<OverlayRequest, "id" | "visibleSince">) => {
    const id = `overlay-${++requestCounterRef.current}`;
    const newRequest: OverlayRequest = {
      ...request,
      id,
      priority: request.priority || "normal",
      visibleSince: undefined // Will be set when activated
    };

    // If no active overlay or new request has higher priority, activate immediately
    if (!activeOverlay || getPriorityValue(newRequest.priority) > getPriorityValue(activeOverlay.priority)) {
      // Queue current active if exists
      if (activeOverlay) {
        setQueue(prev => [...prev, activeOverlay].sort((a, b) => 
          getPriorityValue(b.priority) - getPriorityValue(a.priority)
        ));
      }
      // Mark as visible and call onActivate
      newRequest.visibleSince = Date.now();
      if (newRequest.onActivate) {
        newRequest.onActivate();
      }
      setActiveOverlay(newRequest);
    } else {
      // Add to priority queue (will be activated later)
      setQueue(prev => [...prev, newRequest].sort((a, b) => 
        getPriorityValue(b.priority) - getPriorityValue(a.priority)
      ));
    }

    return id;
  }, [activeOverlay, requestCounterRef]);

  const hideOverlay = useCallback((id: string, minDuration?: number) => {
    if (activeOverlay?.id === id) {
      const elapsed = activeOverlay.visibleSince ? Date.now() - activeOverlay.visibleSince : 0;
      const remaining = minDuration ? Math.max(0, minDuration - elapsed) : 0;

      const finishHide = () => {
        // Complete callback if exists
        if (activeOverlay.onComplete) {
          activeOverlay.onComplete();
        }

        // Process queue - activate next highest priority
        setQueue(prev => {
          if (prev.length > 0) {
            const [next, ...rest] = prev;
            // Mark next overlay as visible and call onActivate
            const activatedNext = {
              ...next,
              visibleSince: Date.now()
            };
            if (next.onActivate) {
              next.onActivate();
            }
            setActiveOverlay(activatedNext);
            return rest;
          }
          setActiveOverlay(null);
          return prev;
        });
      };

      if (remaining > 0) {
        setTimeout(finishHide, remaining);
      } else {
        finishHide();
      }
    } else {
      // Remove from queue if queued
      setQueue(prev => prev.filter(req => req.id !== id));
    }
  }, [activeOverlay]);

  const updateOverlay = useCallback((id: string, updates: Partial<OverlayRequest>) => {
    if (activeOverlay?.id === id) {
      setActiveOverlay(prev => prev ? { ...prev, ...updates } : null);
    } else {
      setQueue(prev => prev.map(req => 
        req.id === id ? { ...req, ...updates } : req
      ));
    }
  }, [activeOverlay]);

  return (
    <OverlayControllerContext.Provider value={{ showOverlay, hideOverlay, updateOverlay }}>
      {children}
      {/* Single overlay instance - only one can be visible at a time */}
      {activeOverlay && (
        <ProgressLoadingOverlay
          isVisible={true}
          status={activeOverlay.status}
          scenario={activeOverlay.scenario}
          title={activeOverlay.title}
          duration={activeOverlay.duration}
        />
      )}
    </OverlayControllerContext.Provider>
  );
}

export function useOverlayController() {
  const context = useContext(OverlayControllerContext);
  if (!context) {
    throw new Error("useOverlayController must be used within OverlayControllerProvider");
  }
  return context;
}

// Priority ranking: critical > high > normal
function getPriorityValue(priority: OverlayPriority): number {
  switch (priority) {
    case "critical": return 3;
    case "high": return 2;
    case "normal": return 1;
    default: return 1;
  }
}
