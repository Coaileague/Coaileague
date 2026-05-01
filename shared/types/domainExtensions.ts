/**
 * Shift extended types — runtime JOIN result shapes
 * 
 * Drizzle's Shift type only includes columns from the shifts table.
 * These types extend it with fields that come from JOINs and computed values,
 * eliminating the need for `as any` throughout the scheduling routes.
 */
import type { InferSelectModel } from 'drizzle-orm';
import { shifts } from '../schema/domains/scheduling';

/** Internal Shift base type from Drizzle schema */
type ShiftBase = InferSelectModel<typeof shifts>;

/**
 * Shift with fields from JOINs and computed values.
 * Used when querying shifts with associated employee, client, and site data.
 */
export interface ShiftWithJoins extends ShiftBase {
  // Employee JOIN fields
  employeeName?: string | null;
  employeeFirstName?: string | null;
  employeeLastName?: string | null;
  isArmed?: boolean | null;
  armedLicenseVerified?: boolean | null;
  guardCardExpiryDate?: string | null;
  
  // Client/Site JOIN fields
  clientName?: string | null;
  siteName?: string | null;
  jobSiteName?: string | null;
  siteAddress?: string | null;
  
  // Schedule assignment (array form)
  assignedEmployeeIds?: string[];
  
  // Skill requirements
  requiredSkills?: string[];
  
  // Computed/metadata fields
  displayName?: string | null;
  userId?: string | null;
  metadata?: Record<string, unknown> | null;
  reason?: string | null;
  isManuallyLocked?: boolean;
}

/**
 * Employee extended type with fields from JOINs.
 */
export interface EmployeeWithStatus {
  id: string;
  workspaceId: string;
  userId?: string | null;
  firstName: string;
  lastName: string;
  email?: string | null;
  phone?: string | null;
  workspaceRole?: string | null;
  isActive?: boolean | null;
  status?: string | null;          // 'active' | 'suspended' | 'pending' | 'terminated'
  isArmed?: boolean | null;
  armedLicenseVerified?: boolean | null;
  guardCardExpiryDate?: string | null;
  employeeNumber?: string | null;
  hireDate?: string | Date | null;
  onboardingStatus?: string | null;
  hourlyRate?: string | null;
  color?: string | null;
  profileImageUrl?: string | null;
  [key: string]: unknown;          // Allow additional JOIN fields
}

/**
 * Workspace extended type — includes fields not always in base schema.
 */
export interface WorkspaceWithExtras {
  id: string;
  name: string;
  ownerId: string;
  subscriptionStatus?: string | null;
  tier?: string | null;
  taxId?: string | null;
  platformFeePercentage?: string | null;
  [key: string]: unknown;
}
