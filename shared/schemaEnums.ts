/**
 * SHARED SCHEMA ENUMS
 * ===================
 * This file contains shared/reusable enum patterns that can be used for NEW tables.
 * 
 * IMPORTANT: Do NOT change existing table column types to use these.
 * These are for NEW tables only to reduce enum duplication going forward.
 * 
 * Existing tables with similar enums should continue using their original enums
 * to avoid migration risks.
 */

import { pgEnum } from "drizzle-orm/pg-core";

// ============================================================================
// GENERIC STATUS ENUMS (For new tables)
// ============================================================================

/**
 * Universal status for general workflows
 * Usage: General-purpose status tracking
 */
export const sharedGenericStatusEnum = pgEnum('shared_generic_status', [
  'pending',
  'active', 
  'completed',
  'cancelled',
]);

/**
 * Approval workflow status
 * Usage: Requests that need approval (leave, swap, etc.)
 */
export const sharedApprovalStatusEnum = pgEnum('shared_approval_status', [
  'pending',
  'approved',
  'rejected',
  'cancelled',
  'expired',
]);

/**
 * Document lifecycle status  
 * Usage: Invoices, contracts, policies, etc.
 */
export const sharedDocumentStatusEnum = pgEnum('shared_document_status', [
  'draft',
  'sent',
  'viewed',
  'signed',
  'expired',
  'cancelled',
]);

/**
 * Payment/financial status
 * Usage: Invoices, payments, subscriptions
 */
export const sharedPaymentStatusEnum = pgEnum('shared_payment_status', [
  'pending',
  'processing',
  'paid',
  'failed',
  'refunded',
  'cancelled',
]);

/**
 * Task/job status for async operations
 * Usage: Background jobs, migrations, imports
 */
export const sharedTaskStatusEnum = pgEnum('shared_task_status', [
  'queued',
  'in_progress',
  'completed',
  'failed',
  'cancelled',
  'retrying',
]);

// ============================================================================
// GENERIC PRIORITY ENUMS
// ============================================================================

/**
 * Standard priority levels
 * Usage: Tickets, tasks, notifications
 */
export const sharedPriorityEnum = pgEnum('shared_priority', [
  'low',
  'medium',
  'high',
  'urgent',
  'critical',
]);

/**
 * Severity levels for issues/alerts
 * Usage: Incidents, alerts, errors
 */
export const sharedSeverityEnum = pgEnum('shared_severity', [
  'info',
  'warning',
  'error',
  'critical',
]);

// ============================================================================
// DOCUMENTATION: Existing Duplicate Enums (DO NOT MODIFY)
// ============================================================================
// 
// The following existing enums have similar patterns but MUST NOT be changed:
//
// Generic Status Pattern ('pending', 'active', 'completed', 'cancelled'):
// - benefitStatusEnum (line 1494)
// - subscriptionStatus (various tables using varchar)
//
// Approval Pattern ('pending', 'approved', 'rejected', 'cancelled'):
// - ptoStatusEnum (line 1642)
// - swapRequestStatusEnum (line 2224)
// - applicationStatusEnum (line 3848)
// - onboardingStatusEnum (line 3950)
//
// Document Pattern ('draft', 'sent', 'paid', 'overdue', 'cancelled'):
// - invoiceStatusEnum (line 3076)
// - shiftStatusEnum (line 1925)
//
// Task Pattern ('pending', 'in_progress', 'completed', 'failed'):
// - migrationJobStatusEnum (line 1138)
// - terminationStatusEnum (line 1678)
// - reviewStatusEnum (line 1543)
//
// These existing enums cannot be changed because:
// 1. Existing data uses these enum values
// 2. Migrations would require data transformation
// 3. Foreign key constraints depend on them
//
// For NEW tables, prefer using the shared enums above to reduce duplication.
