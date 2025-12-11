/**
 * useOverlayAwareness - Global overlay detection for Trinity mascot
 * 
 * Tracks when popovers, dialogs, dropdowns, and other overlays are open
 * so Trinity can automatically minimize or move out of the way.
 */

import { useState, useEffect, useCallback } from 'react';

interface OverlayState {
  isAnyOverlayOpen: boolean;
  activeOverlays: Set<string>;
  overlayPositions: Map<string, DOMRect>;
}

// Global state shared across all hook instances
let globalOverlayState: OverlayState = {
  isAnyOverlayOpen: false,
  activeOverlays: new Set(),
  overlayPositions: new Map(),
};

const listeners = new Set<(state: OverlayState) => void>();

function notifyListeners() {
  listeners.forEach(listener => listener({ ...globalOverlayState }));
}

// Selectors for detecting open overlays
const OVERLAY_SELECTORS = [
  '[data-state="open"]',
  '[data-radix-popper-content-wrapper]',
  '[role="dialog"][data-state="open"]',
  '[role="alertdialog"]',
  '[role="menu"][data-state="open"]',
  '.popover-content',
  '[data-radix-menu-content]',
  '[data-radix-dropdown-menu-content]',
  '[data-radix-select-content]',
  '[data-radix-dialog-content]',
  '[data-radix-alert-dialog-content]',
  '[data-side]', // Radix positioning attribute
];

// High-priority overlays that should definitely minimize Trinity
const HIGH_PRIORITY_SELECTORS = [
  '[data-radix-popper-content-wrapper]',
  '[role="dialog"]',
  '[role="alertdialog"]',
  '[role="menu"]',
];

function scanForOverlays(): { found: boolean; positions: Map<string, DOMRect> } {
  const positions = new Map<string, DOMRect>();
  let found = false;

  for (const selector of OVERLAY_SELECTORS) {
    try {
      const elements = document.querySelectorAll(selector);
      elements.forEach((el, index) => {
        const rect = el.getBoundingClientRect();
        if (rect.width > 0 && rect.height > 0) {
          found = true;
          const id = el.id || el.getAttribute('data-testid') || `overlay-${selector}-${index}`;
          positions.set(id, rect);
        }
      });
    } catch {
      // Ignore invalid selectors
    }
  }

  return { found, positions };
}

function hasHighPriorityOverlay(): boolean {
  for (const selector of HIGH_PRIORITY_SELECTORS) {
    try {
      const elements = document.querySelectorAll(selector);
      for (const el of elements) {
        const rect = el.getBoundingClientRect();
        if (rect.width > 0 && rect.height > 0) {
          return true;
        }
      }
    } catch {
      // Ignore
    }
  }
  return false;
}

// Start global overlay monitoring
let monitoringStarted = false;
let scanIntervalId: ReturnType<typeof setInterval> | null = null;

function startMonitoring() {
  if (monitoringStarted || typeof window === 'undefined') return;
  monitoringStarted = true;

  const observer = new MutationObserver(() => {
    const { found, positions } = scanForOverlays();
    const hasHighPriority = hasHighPriorityOverlay();
    
    const newState: OverlayState = {
      isAnyOverlayOpen: found && hasHighPriority,
      activeOverlays: new Set(positions.keys()),
      overlayPositions: positions,
    };

    if (newState.isAnyOverlayOpen !== globalOverlayState.isAnyOverlayOpen ||
        newState.activeOverlays.size !== globalOverlayState.activeOverlays.size) {
      globalOverlayState = newState;
      notifyListeners();
    }
  });

  observer.observe(document.body, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: ['data-state', 'aria-expanded', 'open', 'class', 'style'],
  });

  // Also scan periodically for edge cases
  scanIntervalId = setInterval(() => {
    const { found, positions } = scanForOverlays();
    const hasHighPriority = hasHighPriorityOverlay();
    
    if ((found && hasHighPriority) !== globalOverlayState.isAnyOverlayOpen) {
      globalOverlayState = {
        isAnyOverlayOpen: found && hasHighPriority,
        activeOverlays: new Set(positions.keys()),
        overlayPositions: positions,
      };
      notifyListeners();
    }
  }, 200);
}

export function useOverlayAwareness() {
  const [state, setState] = useState<OverlayState>(globalOverlayState);

  useEffect(() => {
    startMonitoring();
    
    const listener = (newState: OverlayState) => {
      setState(newState);
    };
    
    listeners.add(listener);
    
    return () => {
      listeners.delete(listener);
    };
  }, []);

  const isOverlayInArea = useCallback((x: number, y: number, width: number, height: number): boolean => {
    for (const rect of state.overlayPositions.values()) {
      // Check if overlay intersects with given area
      if (
        rect.left < x + width &&
        rect.right > x &&
        rect.top < y + height &&
        rect.bottom > y
      ) {
        return true;
      }
    }
    return false;
  }, [state.overlayPositions]);

  const getOverlayQuadrant = useCallback((): 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right' | null => {
    if (!state.isAnyOverlayOpen) return null;
    
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;
    const centerX = viewportWidth / 2;
    const centerY = viewportHeight / 2;

    for (const rect of state.overlayPositions.values()) {
      const overlayCenterX = rect.left + rect.width / 2;
      const overlayCenterY = rect.top + rect.height / 2;

      const isRight = overlayCenterX > centerX;
      const isBottom = overlayCenterY > centerY;

      if (isRight && !isBottom) return 'top-right';
      if (isRight && isBottom) return 'bottom-right';
      if (!isRight && !isBottom) return 'top-left';
      if (!isRight && isBottom) return 'bottom-left';
    }

    return null;
  }, [state.isAnyOverlayOpen, state.overlayPositions]);

  return {
    isAnyOverlayOpen: state.isAnyOverlayOpen,
    activeOverlays: state.activeOverlays,
    overlayPositions: state.overlayPositions,
    isOverlayInArea,
    getOverlayQuadrant,
  };
}

// Export for direct programmatic use
export function registerOverlay(id: string, rect: DOMRect) {
  globalOverlayState.activeOverlays.add(id);
  globalOverlayState.overlayPositions.set(id, rect);
  globalOverlayState.isAnyOverlayOpen = true;
  notifyListeners();
}

export function unregisterOverlay(id: string) {
  globalOverlayState.activeOverlays.delete(id);
  globalOverlayState.overlayPositions.delete(id);
  globalOverlayState.isAnyOverlayOpen = globalOverlayState.activeOverlays.size > 0;
  notifyListeners();
}
