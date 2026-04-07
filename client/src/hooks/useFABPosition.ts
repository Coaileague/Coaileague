/**
 * useFABPosition
 * ==============
 * Computes route-aware bottom / right positions for the UniversalFAB.
 *
 * Mobile: Sits just above the 44px bottom nav bar with safe-area support.
 * Desktop: Anchored to bottom-right corner (24px from edges).
 *
 * highPages raise the FAB slightly to avoid covering row items at the bottom.
 */

import { useLocation } from "wouter";
import { useIsMobile } from "@/hooks/use-mobile";

export interface FABPositionStyle {
  bottom: string;
  right?: string;
  left?: string;
}

const HIGH_PAGES = ["/schedule", "/timesheets", "/team", "/compliance"];
const FAB_SIZE_PX = 56;
const FAB_GAP_PX = 8;
const BASE_BOTTOM_PX = 72;
const HIGH_BOTTOM_EXTRA_PX = 12;

function matchesRoute(path: string, candidates: string[]): boolean {
  return candidates.some((c) => path === c || path.startsWith(c + "/"));
}

function computePositions(path: string, isMobile: boolean) {
  if (!isMobile) {
    return {
      // Single unified FAB on desktop — bottom-right corner
      unified: { bottom: "24px", right: "24px" } as FABPositionStyle,
      // Legacy aliases kept for any remaining consumers
      trinity: { bottom: "24px", right: "24px" } as FABPositionStyle,
      quickActions: { bottom: "24px", right: "24px" } as FABPositionStyle,
    };
  }

  const isHighPage = matchesRoute(path, HIGH_PAGES);
  const bottomPx = BASE_BOTTOM_PX + (isHighPage ? HIGH_BOTTOM_EXTRA_PX : 0);
  const safeArea = "env(safe-area-inset-bottom, 0px)";

  return {
    unified: {
      bottom: `calc(${bottomPx}px + ${safeArea})`,
      right: "16px",
    } as FABPositionStyle,
    // Legacy aliases
    trinity: {
      bottom: `calc(${bottomPx}px + ${safeArea})`,
      right: "16px",
    } as FABPositionStyle,
    quickActions: {
      bottom: `calc(${bottomPx}px + ${safeArea})`,
      right: "16px",
    } as FABPositionStyle,
  };
}

export function useFABPosition() {
  const [location] = useLocation();
  const isMobile = useIsMobile();
  return computePositions(location, isMobile);
}
