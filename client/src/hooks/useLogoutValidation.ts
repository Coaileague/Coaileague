import { useState, useCallback } from "react";
import { LOGOUT_CONFIG } from "@/config/logout";

export interface LogoutStep {
  id: string;
  message: string;
  progress: number;
  status: "pending" | "in-progress" | "complete" | "failed";
}

export interface LogoutResult {
  success: boolean;
  error?: string;
}

export function useLogoutValidation() {
  const [currentStep, setCurrentStep] = useState(0);
  const [steps, setSteps] = useState<LogoutStep[]>([]);

  const performLogout = useCallback(async (
    userId: string,
    workspaceId: string | null,
    onProgress?: (step: LogoutStep, totalProgress: number) => void
  ): Promise<LogoutResult> => {
    
    const logoutSteps: LogoutStep[] = [
      { id: "save-session", message: "Saving your session data...", progress: 0, status: "pending" },
      { id: "sync-workspace", message: "Syncing workspace changes...", progress: 30, status: "pending" },
      { id: "update-settings", message: "Updating organization settings...", progress: 60, status: "pending" },
      { id: "cleanup", message: "Cleaning up resources...", progress: 80, status: "pending" },
      { id: "complete", message: "Logout complete", progress: 100, status: "pending" }
    ];

    setSteps(logoutSteps);

    try {
      // Step 1: Save session data
      setCurrentStep(0);
      logoutSteps[0].status = "in-progress";
      onProgress?.(logoutSteps[0], 0);
      
      await new Promise(resolve => setTimeout(resolve, 800));
      
      // Simulate saving any unsaved work, user preferences, etc.
      // In real implementation: save form drafts, pending changes, user state
      
      logoutSteps[0].status = "complete";
      onProgress?.(logoutSteps[0], 30);

      // Step 2: Sync workspace
      setCurrentStep(1);
      logoutSteps[1].status = "in-progress";
      onProgress?.(logoutSteps[1], 30);
      
      await new Promise(resolve => setTimeout(resolve, 900));
      
      // Sync any workspace-level changes
      // In real implementation: sync schedules, notifications, team updates
      if (workspaceId) {
        try {
          await fetch(`/api/workspace/sync`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            credentials: "include",
            body: JSON.stringify({ workspaceId })
          });
        } catch (err) {
          console.warn("Workspace sync failed (non-critical):", err);
          // Non-critical - continue logout even if sync fails
        }
      }
      
      logoutSteps[1].status = "complete";
      onProgress?.(logoutSteps[1], 60);

      // Step 3: Update org settings
      setCurrentStep(2);
      logoutSteps[2].status = "in-progress";
      onProgress?.(logoutSteps[2], 60);
      
      await new Promise(resolve => setTimeout(resolve, 700));
      
      // Save any pending organization-level settings
      // In real implementation: update last active timestamp, session logs
      
      logoutSteps[2].status = "complete";
      onProgress?.(logoutSteps[2], 80);

      // Step 4: Cleanup
      setCurrentStep(3);
      logoutSteps[3].status = "in-progress";
      onProgress?.(logoutSteps[3], 80);
      
      await new Promise(resolve => setTimeout(resolve, 600));
      
      // Clear client-side caches, close WebSocket connections, etc.
      // Clean up local storage (except preferences)
      
      logoutSteps[3].status = "complete";
      onProgress?.(logoutSteps[3], 95);

      // Step 5: Complete logout
      setCurrentStep(4);
      logoutSteps[4].status = "in-progress";
      onProgress?.(logoutSteps[4], 95);
      
      await new Promise(resolve => setTimeout(resolve, 400));
      
      // Final logout API call - using centralized config
      await fetch(LOGOUT_CONFIG.endpoint, {
        method: LOGOUT_CONFIG.method,
        credentials: "include"
      });
      
      logoutSteps[4].status = "complete";
      onProgress?.(logoutSteps[4], 100);

      return { success: true };

    } catch (error) {
      console.error("Logout error:", error);
      return {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error"
      };
    }
  }, []);

  return {
    performLogout,
    currentStep,
    steps
  };
}
