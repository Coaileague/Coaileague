/**
 * ResponsiveLoading - UNIFIED Trinity Loading System
 * 
 * All loading overlays now use TrinityLoadingOverlay exclusively.
 * This provides a consistent, brand-compliant loading experience across the platform.
 */

import { TrinityLoadingOverlay } from "@/components/trinity-loading-overlay";
import { useUniversalLoadingGate } from "@/contexts/universal-loading-gate";

// Legacy types kept for API compatibility
export type TransitionStatus = "loading" | "success" | "error" | "info" | "denied";
export type AnimationType = 
  | "spinner" | "progress-bar" | "waves" | "dots" | "pulse" 
  | "gradient" | "orbit" | "skeleton" | "ripple" | "bounce";
export type ScenarioType = 
  | "login" | "logout" | "schedule" | "invoice" | "payroll" 
  | "email" | "analytics" | "upload" | "general";

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
  message,
  submessage,
  status = "loading",
  progress,
}: LoadingProps) {
  const { isLoadingBlocked } = useUniversalLoadingGate();
  
  if (isLoadingBlocked || !isVisible) {
    return null;
  }

  // Map status to appropriate default message if none provided
  const displayMessage = message || (
    status === "success" ? "Success!" :
    status === "error" ? "Error occurred" :
    status === "denied" ? "Access Denied" :
    "Loading your workspace..."
  );

  return (
    <TrinityLoadingOverlay
      isLoading={isVisible}
      message={displayMessage}
      subMessage={submessage}
      variant="fullscreen"
      status={status as any}
      progress={progress}
    />
  );
}
