/**
 * Shift extended types — runtime JOIN result shapes
 * 
 * Drizzle's Shift type only includes columns from the shifts table.
 * These types extend it with fields that come from JOINs and computed values,
 * eliminating the need for `as unknown` throughout the scheduling routes.
 */
import type { InferSelectModel } from 'drizzle-orm';
import { shifts } from '../schema/domains/scheduling';

/** Internal Shift base type from Drizzle schema */
type ShiftBase = InferSelectModel<typeof shifts>;

/**
 * Shift with fields from JOINs and computed values.
 * Used when querying shifts with associated employee, client, and site data.
 *
 * `isManuallyLocked` is omitted from the base then re-declared as optional
 * because JOINed query projections may not always include it.
 */
export interface ShiftWithJoins extends Omit<ShiftBase, 'isManuallyLocked'> {
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
  isManuallyLocked?: boolean | null;
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
  // Scheduling & availability fields
  schedulingScore?: number | null;
  travelRadiusMiles?: number | null;
  availabilityMode?: string | null;
  armedLicenseNumber?: string | null;
  armedLicenseExpiration?: string | Date | null;
  guardCardNumber?: string | null;
  guardCardExpirationDate?: string | Date | null;
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

/**
 * Client extended type — includes fields from JOINs and compliance records.
 */
export interface ClientWithExtras {
  id: string;
  workspaceId: string;
  name: string;
  email?: string | null;
  phone?: string | null;
  isActive?: boolean | null;
  requiresArmed?: boolean | null;
  armedBillRate?: string | number | null;
  unarmedBillRate?: string | number | null;
  requiredLicenseTypes?: string[] | null;
  minOfficerSchedulingScore?: number | null;
  overtimeBillRate?: string | number | null;
  holidayBillRate?: string | number | null;
  [key: string]: unknown;
}

/**
 * Employee compliance record extended type — includes license/credential fields.
 */
export interface EmployeeComplianceRecord {
  id?: string;
  employeeId?: string;
  workspaceId?: string;
  isArmed?: boolean | null;
  armedLicenseNumber?: string | null;
  armedLicenseExpiration?: string | Date | null;
  guardCardNumber?: string | null;
  guardCardExpirationDate?: string | Date | null;
  licenseType?: string | null;
  licenseExpiry?: string | Date | null;
  certificationLevel?: string | null;
  [key: string]: unknown;
}
