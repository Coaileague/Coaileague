// Shared TypeScript types for CoAIleague
// Reusable type definitions for consistent typing across server and client

import type { Client, Employee, Invoice } from './schema';

// ============================================================================
// PAGINATION TYPES
// ============================================================================

export type PaginatedResponse<T> = {
  data: T[];
  total: number;
  page: number;
  limit: number;
  pageCount: number;
  hasNext: boolean;
  hasPrev: boolean;
};

// ============================================================================
// CLIENT AGGREGATED TYPES
// ============================================================================

export type ClientWithInvoiceCount = Client & {
  invoiceCount: number;
};

// ============================================================================
// EMPLOYEE AGGREGATED TYPES (for future use)
// ============================================================================

export type EmployeeWithShiftCount = Employee & {
  shiftCount: number;
  activeShifts: number;
};

// ============================================================================
// INVOICE AGGREGATED TYPES (for future use)
// ============================================================================

export type InvoiceWithPaymentTotal = Invoice & {
  totalPaid: number;
  balance: number;
};
