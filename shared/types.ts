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

// ============================================================================
// TRINITY (MASCOT) ACCESS TYPES
// ============================================================================

export type PlatformRole = 
  | 'root_admin' 
  | 'deputy_admin' 
  | 'sysop' 
  | 'support_manager' 
  | 'support_agent' 
  | 'compliance_officer' 
  | 'Bot' 
  | 'none';

export type WorkspaceRole = 
  | 'org_owner' 
  | 'co_owner' 
  | 'department_manager' 
  | 'supervisor' 
  | 'staff' 
  | 'auditor' 
  | 'contractor';

export interface TrinityAccessContext {
  platformRole?: PlatformRole | null;
  workspaceRole?: WorkspaceRole | null;
  isOrgOwner?: boolean;
}

export interface TrinityAccessResult {
  hasAccess: boolean;
  platformRole?: PlatformRole;
  workspaceRole?: WorkspaceRole;
  isOrgOwner?: boolean;
}

export const TRINITY_ALLOWED_PLATFORM_ROLES: PlatformRole[] = [
  'root_admin',
  'deputy_admin',
  'sysop',
  'support_manager',
  'support_agent',
  'compliance_officer'
];

export const TRINITY_ALLOWED_WORKSPACE_ROLES: WorkspaceRole[] = ['org_owner', 'co_owner', 'admin'];

export function canAccessTrinity(context: TrinityAccessContext): boolean {
  const { platformRole, workspaceRole, isOrgOwner } = context;
  
  if (platformRole && TRINITY_ALLOWED_PLATFORM_ROLES.includes(platformRole)) {
    return true;
  }
  
  if (workspaceRole && TRINITY_ALLOWED_WORKSPACE_ROLES.includes(workspaceRole)) {
    return true;
  }
  
  if (isOrgOwner) {
    return true;
  }
  
  return false;
}
