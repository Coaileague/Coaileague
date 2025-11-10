/**
 * Friendly Strings - Plain English vocabulary for non-technical users
 * 
 * This module provides simple, grandmother-friendly language to replace
 * technical jargon throughout the AutoForce platform.
 */

export const FRIENDLY_LABELS = {
  // Integration Status
  connected: 'Connected',
  disconnected: 'Not Connected',
  expired: 'Connection Needs Renewal',
  error: 'Connection Problem',
  
  // Actions
  connect: 'Connect',
  disconnect: 'Disconnect',
  reconnect: 'Reconnect',
  refresh: 'Renew Connection',
  sync: 'Update',
  
  // QuickBooks & Gusto
  quickbooks: 'QuickBooks (Invoicing)',
  gusto: 'Gusto (Payroll)',
} as const;

export const FRIENDLY_MESSAGES = {
  // Success messages
  connectionSuccess: 'Successfully connected! Your data will update automatically.',
  disconnectSuccess: 'Disconnected successfully',
  refreshSuccess: 'Connection renewed successfully',
  
  // Error messages
  connectionFailed: 'Could not connect. Please try again or contact support.',
  disconnectFailed: 'Could not disconnect. Please try again.',
  refreshFailed: 'Could not renew connection. Please reconnect.',
  
  // Descriptions
  quickbooksDescription: 'Connect to automatically create invoices and track payments',
  gustoDescription: 'Connect to automatically process payroll and manage time tracking',
  
  // Warnings
  tokenExpiring: 'Your connection will expire soon. Click "Renew Connection" to keep everything running smoothly.',
  notConnected: 'Not connected yet. Click "Connect" to get started.',
  
  // Instructions
  setupRequired: 'Set up your connection to enable automatic operations',
} as const;

export const FRIENDLY_HELP = {
  companyId: 'This is your unique company identifier',
  lastSynced: 'Last time data was updated',
  tokenExpires: 'Connection expires on',
  productionSetup: 'Ask your IT team to configure the connection keys',
} as const;

/**
 * Convert technical error message to friendly version
 */
export function friendlyError(technicalMessage: string): string {
  const errorMap: Record<string, string> = {
    'Failed to initiate connection': 'Could not start connection. Please try again.',
    'Failed to disconnect': 'Could not disconnect. Please try again.',
    'Failed to refresh token': 'Could not renew connection. Please try reconnecting.',
    'Connection Failed': 'Could not connect. Please check your settings or contact support.',
    'Unauthorized': 'Session expired. Please log in again.',
    'Token expired': 'Connection expired. Please reconnect.',
    'Invalid credentials': 'Login information is incorrect. Please try again.',
  };
  
  // Check for exact matches first
  for (const [technical, friendly] of Object.entries(errorMap)) {
    if (technicalMessage.toLowerCase().includes(technical.toLowerCase())) {
      return friendly;
    }
  }
  
  // Generic fallback
  return 'Something went wrong. Please try again or contact support.';
}
