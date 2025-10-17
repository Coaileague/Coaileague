import { TransitionStatus } from "@/components/universal-transition-overlay";

export interface TransitionHelperProps {
  showTransition: (options?: any) => void;
  hideTransition: () => void;
  updateTransition: (options: any) => void;
}

/**
 * Login transition helper
 */
export function showLoginTransition(helpers: TransitionHelperProps, username: string) {
  helpers.showTransition({
    status: "loading" as TransitionStatus,
    message: "Logging you in...",
    submessage: `Welcome back, ${username}!`
  });
}

/**
 * Logout transition helper
 */
export function showLogoutTransition(helpers: TransitionHelperProps) {
  helpers.showTransition({
    status: "loading" as TransitionStatus,
    message: "Logging you out...",
    submessage: "See you soon!",
    duration: 1500,
    onComplete: () => {
      window.location.href = "/login";
    }
  });
}

/**
 * Success transition with auto-redirect
 */
export function showSuccessTransition(
  helpers: TransitionHelperProps, 
  message: string, 
  redirectTo?: string, 
  submessage?: string
) {
  helpers.showTransition({
    status: "success" as TransitionStatus,
    message,
    submessage,
    duration: 2000,
    onComplete: () => {
      if (redirectTo) {
        window.location.href = redirectTo;
      } else {
        helpers.hideTransition();
      }
    }
  });
}

/**
 * Error transition
 */
export function showErrorTransition(
  helpers: TransitionHelperProps, 
  message: string, 
  submessage?: string
) {
  helpers.showTransition({
    status: "error" as TransitionStatus,
    message,
    submessage,
    duration: 3000,
    onComplete: () => helpers.hideTransition()
  });
}

/**
 * Info transition with auto-redirect
 */
export function showInfoTransition(
  helpers: TransitionHelperProps, 
  message: string, 
  redirectTo?: string, 
  submessage?: string
) {
  helpers.showTransition({
    status: "info" as TransitionStatus,
    message,
    submessage,
    duration: 2000,
    onComplete: () => {
      if (redirectTo) {
        window.location.href = redirectTo;
      } else {
        helpers.hideTransition();
      }
    }
  });
}

/**
 * Form submission transition helper
 */
export async function handleFormSubmissionWithTransition<T>(
  helpers: TransitionHelperProps,
  submitFn: () => Promise<T>,
  options: {
    loadingMessage?: string;
    successMessage?: string;
    errorMessage?: string;
    redirectTo?: string;
  }
): Promise<T | null> {
  try {
    helpers.showTransition({
      status: "loading" as TransitionStatus,
      message: options.loadingMessage || "Processing...",
    });

    const result = await submitFn();

    showSuccessTransition(
      helpers, 
      options.successMessage || "Success!", 
      options.redirectTo
    );

    return result;
  } catch (error: any) {
    showErrorTransition(
      helpers,
      options.errorMessage || "Something went wrong",
      error.message
    );
    return null;
  }
}

/**
 * Navigation transition helper
 */
export function navigateWithTransition(
  helpers: TransitionHelperProps,
  path: string,
  message?: string
) {
  helpers.showTransition({
    status: "loading" as TransitionStatus,
    message: message || "Navigating...",
    duration: 400,
    onComplete: () => {
      window.location.href = path;
    }
  });
}

/**
 * Action verification transition (for confirmations)
 */
export function showVerificationTransition(
  helpers: TransitionHelperProps,
  message: string,
  submessage?: string
) {
  helpers.showTransition({
    status: "info" as TransitionStatus,
    message,
    submessage,
    duration: 1500,
    onComplete: () => helpers.hideTransition()
  });
}
