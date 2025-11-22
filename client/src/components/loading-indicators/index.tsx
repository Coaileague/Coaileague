/**
 * ResponsiveLoading - Universal loading indicator system
 * Uses UniversalTransitionOverlay for professional loading states
 * Supports multiple animations, scenarios, and status types
 */

import { UniversalTransitionOverlay, type AnimationType, type ScenarioType, type TransitionStatus } from "@/components/universal-transition-overlay";
import { useUniversalLoadingGate } from "@/contexts/universal-loading-gate";

interface LoadingProps {
  isVisible?: boolean;
  message?: string;
  submessage?: string;
  progress?: number;
  status?: TransitionStatus;
  animationType?: AnimationType;
  scenario?: ScenarioType;
  duration?: number;
  onComplete?: () => void;
}

export function ResponsiveLoading({
  isVisible = true,
  message = "Loading...",
  submessage,
  progress,
  status = "loading",
  animationType = "spinner",
  scenario = "general",
  duration,
  onComplete
}: LoadingProps) {
  // CRITICAL: Respect universal loading gate - NEVER show on public routes
  const { isLoadingBlocked } = useUniversalLoadingGate();
  
  // If loading is blocked (public route), don't render anything
  if (isLoadingBlocked) {
    return null;
  }

  return (
    <UniversalTransitionOverlay
      isVisible={isVisible}
      status={status}
      animationType={animationType}
      scenario={scenario}
      message={message}
      submessage={submessage}
      progress={progress}
      duration={duration}
      onComplete={onComplete}
    />
  );
}

// Export types for use in other components
export type { AnimationType, ScenarioType, TransitionStatus };
