/**
 * Application Messages & Strings
 * All user-facing messages in one place
 * Edit here to change messaging everywhere
 */

export const MESSAGES = {
  // Authentication
  auth: {
    loginSuccess: "Welcome back! You're now logged in.",
    loginError: "Login failed. Please check your credentials.",
    registerSuccess: "Account created successfully! Check your email to verify.",
    registerError: "Registration failed. Please try again.",
    logoutSuccess: "You've been signed out successfully.",
    logoutError: "Logout failed. Please try again.",
    sessionExpired: "Your session has expired. Please login again.",
    mfaRequired: "Multi-factor authentication required.",
  },

  // Workspace
  workspace: {
    switchSuccess: "Workspace switched successfully.",
    switchError: "Failed to switch workspace.",
    noWorkspace: "No workspace selected.",
    workspaceNotFound: "Workspace not found.",
    suspended: "Your workspace is suspended.",
    suspended_payment: "Your workspace is suspended due to payment issues. Please update your billing.",
    suspended_violation: "Your workspace has been suspended due to policy violation.",
  },

  // Operations
  create: {
    success: "{entity} created successfully.",
    error: "Failed to create {entity}.",
  },
  update: {
    success: "{entity} updated successfully.",
    error: "Failed to update {entity}.",
  },
  delete: {
    success: "{entity} deleted successfully.",
    error: "Failed to delete {entity}.",
    confirm: "Are you sure you want to delete {entity}? This action cannot be undone.",
  },
  fetch: {
    error: "Failed to load {entity}. Please try again.",
    noData: "No {entity} found.",
  },

  // Time Tracking
  timeTracking: {
    clockInSuccess: "Clocked in successfully.",
    clockOutSuccess: "Clocked out successfully.",
    alreadyClockedIn: "You're already clocked in.",
    notClockedIn: "You're not currently clocked in.",
    breakStarted: "Break started.",
    breakEnded: "Break ended.",
    overtimeWarning: "You're approaching overtime.",
  },

  // Payroll
  payroll: {
    payrollProcessed: "Payroll processed successfully.",
    noTimesheetData: "No timesheet data available for payroll period.",
    taxCalculationError: "Failed to calculate taxes.",
    invoiceGenerated: "Invoice generated successfully.",
  },

  // Scheduling
  scheduling: {
    scheduleCreated: "Schedule created successfully.",
    schedulePublished: "Schedule published to employees.",
    shiftAdded: "Shift added successfully.",
    shiftCancelled: "Shift cancelled.",
    employeeAssigned: "Employee assigned to shift.",
    noAvailability: "No available employees for this shift.",
    conflictDetected: "Schedule conflict detected.",
  },

  // Support & Help
  support: {
    ticketCreated: "Support ticket created.",
    ticketResolved: "Support ticket resolved.",
    messageSent: "Message sent successfully.",
    noResponse: "No response yet. A support agent will reply soon.",
    contactSupport: "Contact support for assistance.",
  },

  // Validation Errors
  validation: {
    required: "{field} is required.",
    email: "Please enter a valid email address.",
    minLength: "{field} must be at least {length} characters.",
    maxLength: "{field} must be no more than {length} characters.",
    number: "{field} must be a number.",
    date: "{field} must be a valid date.",
    future: "{field} must be in the future.",
    past: "{field} must be in the past.",
  },

  // Network & System
  network: {
    offline: "You're offline. Check your internet connection.",
    retry: "Retrying... Attempt {current} of {max}",
    timeout: "Request timed out. Please try again.",
    serverError: "Server error. Please try again later.",
    unauthorized: "You don't have permission to perform this action.",
  },

  // Loading & Status
  loading: {
    processing: "Processing...",
    saving: "Saving...",
    loading: "Loading...",
    updating: "Updating...",
    deleting: "Deleting...",
  },

  // Confirmations
  confirm: {
    logout: "Are you sure you want to logout?",
    delete: "Are you sure you want to delete this item?",
    unsavedChanges: "You have unsaved changes. Do you want to discard them?",
  },

  // Notifications
  notifications: {
    success: "Success!",
    error: "Error",
    warning: "Warning",
    info: "Information",
  },
};

/**
 * Get message with interpolation
 * Usage: getMessage('create.success', { entity: 'Employee' })
 */
export function getMessage(path: string, vars?: Record<string, any>): string {
  const parts = path.split(".");
  let message: any = MESSAGES;
  
  for (const part of parts) {
    message = message[part];
    if (!message) {
      console.warn(`Message not found: ${path}`);
      return path;
    }
  }

  // Replace variables
  if (vars && typeof message === "string") {
    Object.entries(vars).forEach(([key, value]) => {
      message = message.replace(`{${key}}`, value);
    });
  }

  return message;
}

/**
 * Get all messages for a category
 */
export function getMessages(category: string): any {
  return (MESSAGES as any)[category] || null;
}
