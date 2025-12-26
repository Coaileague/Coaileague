import { useState, useCallback } from "react";
import { AnimationType, ScenarioType, TransitionStatus } from "@/components/universal-transition-overlay";

export interface LoadingOptions {
  scenario?: ScenarioType;
  animationType?: AnimationType;
  initialMessage?: string;
  initialSubmessage?: string;
}

export interface LoadingState {
  isVisible: boolean;
  status: TransitionStatus;
  animationType: AnimationType;
  scenario: ScenarioType;
  message: string;
  submessage: string;
  progress: number;
}

/**
 * Hook for managing enhanced loading overlays across the application
 * Provides easy-to-use methods for different operation types
 */
export function useEnhancedLoading() {
  const [loadingState, setLoadingState] = useState<LoadingState>({
    isVisible: false,
    status: "loading",
    animationType: "spinner",
    scenario: "general",
    message: "",
    submessage: "",
    progress: 0,
  });

  const showLoading = useCallback((options: LoadingOptions = {}) => {
    setLoadingState({
      isVisible: true,
      status: "loading",
      animationType: options.animationType || "spinner",
      scenario: options.scenario || "general",
      message: options.initialMessage || "Loading...",
      submessage: options.initialSubmessage || "",
      progress: 0,
    });
  }, []);

  const updateProgress = useCallback((progress: number, message?: string, submessage?: string) => {
    setLoadingState(prev => ({
      ...prev,
      progress,
      ...(message && { message }),
      ...(submessage && { submessage })
    }));
  }, []);

  const updateMessage = useCallback((message: string, submessage?: string) => {
    setLoadingState(prev => ({
      ...prev,
      message,
      ...(submessage !== undefined && { submessage })
    }));
  }, []);

  const setSuccess = useCallback((message: string = "Success!", submessage?: string) => {
    setLoadingState(prev => ({
      ...prev,
      status: "success",
      message,
      submessage: submessage || "",
      progress: 100,
    }));
  }, []);

  const setError = useCallback((message: string = "Error occurred", submessage?: string) => {
    setLoadingState(prev => ({
      ...prev,
      status: "error",
      message,
      submessage: submessage || "",
      progress: 0,
    }));
  }, []);

  const setDenied = useCallback((message: string = "Access Denied", submessage?: string) => {
    setLoadingState(prev => ({
      ...prev,
      status: "denied",
      message,
      submessage: submessage || "",
      progress: 0,
    }));
  }, []);

  const hideLoading = useCallback(() => {
    setLoadingState(prev => ({
      ...prev,
      isVisible: false,
    }));
  }, []);

  // Specialized methods for common scenarios

  const showScheduleLoading = useCallback(() => {
    showLoading({
      scenario: "schedule",
      animationType: "orbit",
      initialMessage: "Processing Schedule...",
      initialSubmessage: "Trinity™ analyzing shifts and availability"
    });
  }, [showLoading]);

  const showInvoiceLoading = useCallback(() => {
    showLoading({
      scenario: "invoice",
      animationType: "pulse",
      initialMessage: "Generating Invoices...",
      initialSubmessage: "Calculating billable hours and costs"
    });
  }, [showLoading]);

  const showPayrollLoading = useCallback(() => {
    showLoading({
      scenario: "payroll",
      animationType: "progress-bar",
      initialMessage: "Processing Payroll...",
      initialSubmessage: "Computing wages, taxes, and deductions"
    });
  }, [showLoading]);

  const showEmailLoading = useCallback(() => {
    showLoading({
      scenario: "email",
      animationType: "dots",
      initialMessage: "Sending Emails...",
      initialSubmessage: "Delivering notifications to recipients"
    });
  }, [showLoading]);

  const showAnalyticsLoading = useCallback(() => {
    showLoading({
      scenario: "analytics",
      animationType: "gradient",
      initialMessage: "Generating Analytics...",
      initialSubmessage: "Trinity™ processing data insights"
    });
  }, [showLoading]);

  const showUploadLoading = useCallback(() => {
    showLoading({
      scenario: "upload",
      animationType: "ripple",
      initialMessage: "Uploading Files...",
      initialSubmessage: "Transferring data to cloud storage"
    });
  }, [showLoading]);

  return {
    loadingState,
    showLoading,
    updateProgress,
    updateMessage,
    setSuccess,
    setError,
    setDenied,
    hideLoading,
    // Specialized methods
    showScheduleLoading,
    showInvoiceLoading,
    showPayrollLoading,
    showEmailLoading,
    showAnalyticsLoading,
    showUploadLoading,
  };
}

/**
 * Helper function to simulate progress for operations
 * Useful for showing progress while awaiting async operations
 */
export function simulateProgress(
  onProgress: (progress: number) => void,
  durationMs: number = 3000,
  steps: number = 10
): () => void {
  const interval = durationMs / steps;
  let currentStep = 0;

  const timer = setInterval(() => {
    currentStep++;
    const progress = Math.min((currentStep / steps) * 100, 95); // Cap at 95% until complete
    onProgress(progress);

    if (currentStep >= steps) {
      clearInterval(timer);
    }
  }, interval);

  return () => clearInterval(timer);
}
