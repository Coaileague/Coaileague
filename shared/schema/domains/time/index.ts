// ═══════════════════════════════════════════════════════════════
// Domain 5 of 15: Time & Attendance
// ═══════════════════════════════════════════════════════════════
// THE LAW: No new tables without Bryan's explicit approval. Zero DROP TABLE ever.
// Tables: 7

import { pgTable, varchar, text, integer, boolean, timestamp, jsonb, decimal, time, doublePrecision, index, uniqueIndex, primaryKey } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import {
  auditActionTypeEnum,
  breakTypeEnum,
  ptoStatusEnum,
  ptoTypeEnum,
  timesheetEditRequestStatusEnum,
} from '../../enums';

export const ptoRequests = pgTable("pto_requests", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  workspaceId: varchar("workspace_id").notNull(),
  employeeId: varchar("employee_id").notNull(),
  approverId: varchar("approver_id"),

  // Request details
  ptoType: ptoTypeEnum("pto_type").notNull(),
  startDate: timestamp("start_date").notNull(),
  endDate: timestamp("end_date").notNull(),
  totalHours: decimal("total_hours", { precision: 10, scale: 2 }).notNull(),

  // Request & approval
  requestNotes: text("request_notes"),
  status: ptoStatusEnum("status").default("pending"),
  approvedAt: timestamp("approved_at"),
  denialReason: text("denial_reason"),

  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const timeEntries = pgTable("time_entries", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  workspaceId: varchar("workspace_id").notNull(),
  shiftId: varchar("shift_id"),
  employeeId: varchar("employee_id").notNull(),
  clientId: varchar("client_id"),
  subClientId: varchar("sub_client_id"),
  siteId: varchar("site_id"),

  // Rates (captured at time of clock-in for historical accuracy)
  capturedBillRate: decimal("captured_bill_rate", { precision: 10, scale: 2 }),
  capturedPayRate: decimal("captured_pay_rate", { precision: 10, scale: 2 }),
  overtimeBillRate: decimal("overtime_bill_rate", { precision: 10, scale: 2 }),
  overtimePayRate: decimal("overtime_pay_rate", { precision: 10, scale: 2 }),
  regularHours: decimal("regular_hours", { precision: 5, scale: 2 }),
  overtimeHours: decimal("overtime_hours", { precision: 5, scale: 2 }),
  holidayHours: decimal("holiday_hours", { precision: 5, scale: 2 }),
  billableAmount: decimal("billable_amount", { precision: 10, scale: 2 }),
  payableAmount: decimal("payable_amount", { precision: 10, scale: 2 }),

  // Time tracking
  clockIn: timestamp("clock_in").notNull(),
  clockOut: timestamp("clock_out"),
  totalHours: decimal("total_hours", { precision: 10, scale: 2 }),

  // Billing
  hourlyRate: decimal("hourly_rate", { precision: 10, scale: 2 }),
  totalAmount: decimal("total_amount", { precision: 10, scale: 2 }),

  // GEO-COMPLIANCE: GPS & IP Tracking (Monopolistic Feature #3)
  clockInLatitude: decimal("clock_in_latitude", { precision: 10, scale: 7 }), // GPS lat at clock-in
  clockInLongitude: decimal("clock_in_longitude", { precision: 10, scale: 7 }), // GPS lng at clock-in
  clockInAccuracy: decimal("clock_in_accuracy", { precision: 8, scale: 2 }), // GPS accuracy in meters
  clockInIpAddress: varchar("clock_in_ip_address"), // IP address at clock-in
  clockInPhotoUrl: text("clock_in_photo_url"), // Photo verification at clock-in

  clockOutLatitude: decimal("clock_out_latitude", { precision: 10, scale: 7 }), // GPS lat at clock-out
  clockOutLongitude: decimal("clock_out_longitude", { precision: 10, scale: 7 }), // GPS lng at clock-out
  clockOutAccuracy: decimal("clock_out_accuracy", { precision: 8, scale: 2 }), // GPS accuracy in meters
  clockOutIpAddress: varchar("clock_out_ip_address"), // IP address at clock-out
  clockOutPhotoUrl: text("clock_out_photo_url"), // Photo verification at clock-out

  // GPS Activity Monitoring (Silent Supervisor)
  lastGpsPingAt: timestamp("last_gps_ping_at"),
  lastGpsPingLat: decimal("last_gps_ping_lat", { precision: 10, scale: 7 }),
  lastGpsPingLng: decimal("last_gps_ping_lng", { precision: 10, scale: 7 }),

  // Job site location (for discrepancy detection)
  jobSiteLatitude: decimal("job_site_latitude", { precision: 10, scale: 7 }),
  jobSiteLongitude: decimal("job_site_longitude", { precision: 10, scale: 7 }),
  jobSiteAddress: text("job_site_address"),

  // Approval workflow (approval-focused states only)
  status: varchar("status").default('pending'), // 'pending', 'approved', 'rejected'
  approvedBy: varchar("approved_by"), // Who approved
  approvedAt: timestamp("approved_at"), // When approved
  rejectedBy: varchar("rejected_by"), // Who rejected
  rejectedAt: timestamp("rejected_at"), // When rejected
  rejectionReason: text("rejection_reason"), // Why rejected

  // Billing Platform & Payroll Platform Integration (separate orthogonal tracking)
  invoiceId: varchar("invoice_id"),
  billedAt: timestamp("billed_at"), // When included in invoice
  payrollRunId: varchar("payroll_run_id"),
  payrolledAt: timestamp("payrolled_at"), // When included in payroll
  billableToClient: boolean("billable_to_client").default(true),

  // QuickBooks TimeActivity Integration - Bidirectional sync support
  quickbooksTimeActivityId: varchar("quickbooks_time_activity_id"), // QB TimeActivity ID after sync
  quickbooksSyncStatus: varchar("quickbooks_sync_status").default("pending"), // pending, synced, error, orphaned
  quickbooksLastSync: timestamp("quickbooks_last_sync"), // Last successful sync timestamp
  quickbooksSyncToken: varchar("quickbooks_sync_token"), // QB SyncToken for change detection

  // Manual edit tracking - survives QuickBooks sync
  manuallyEdited: boolean("manually_edited").default(false),
  manualEditedAt: timestamp("manual_edited_at"),
  manualEditedBy: varchar("manual_edited_by"),
  manualEditReason: text("manual_edit_reason"),
  preEditSnapshot: jsonb("pre_edit_snapshot"),

  notes: text("notes"),

  // Universal Identification — Phase 57
  // Format: CLK-YYYYMMDD-NNNNN  e.g. CLK-20260329-00847
  referenceId: varchar("reference_id"), // Human-readable clock-in reference number
  clockInMethod: varchar("clock_in_method").default("app"), // 'app' | 'voice_phone' | 'kiosk' | 'supervisor' | 'trinity_ai'

  // Trinity-assisted clock-in tracking
  trinityAssistedClockin: boolean("trinity_assisted_clockin").default(false),
  trinityClockInReason: text("trinity_clockin_reason"),

  // Supervisor / ClockBot override audit trail (JSONB)
  correctionData: jsonb("correction_data"),

  // Geofence override workflow (guard clocks in outside geofence boundary)
  geofenceOverrideRequired: boolean("geofence_override_required").default(false),
  geofenceOverrideStatus: varchar("geofence_override_status").default("pending"),
  geofenceOverrideBy: varchar("geofence_override_by"),
  geofenceOverrideReason: text("geofence_override_reason"),
  geofenceOverrideAt: timestamp("geofence_override_at"),

  // GPS verification audit — tracks whether GPS was provided and verified at clock-in/out
  // Values: 'verified' | 'no_gps_provided' | 'gps_error' | 'gps_disabled' | 'exception_used'
  // Allows supervisors to filter and review entries missing GPS when GPS enforcement is enabled
  gpsVerificationStatus: varchar("gps_verification_status").default("gps_disabled"),

  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),

  outsideGeofence: boolean("outside_geofence").default(false),
}, (table) => [
  index("time_entries_workspace_idx").on(table.workspaceId),
  index("time_entries_workspace_status_idx").on(table.workspaceId, table.status),
  index("time_entries_employee_idx").on(table.employeeId),
  index("time_entries_shift_idx").on(table.shiftId),
  index("time_entries_client_idx").on(table.clientId),
  index("time_entries_status_idx").on(table.status),
  index("time_entries_clock_in_idx").on(table.clockIn),
  index("time_entries_invoice_idx").on(table.invoiceId),
  index("time_entries_workspace_employee_idx").on(table.workspaceId, table.employeeId, table.clockIn),
  index("time_entries_qb_time_activity_idx").on(table.quickbooksTimeActivityId),
  index("time_entries_qb_sync_status_idx").on(table.quickbooksSyncStatus),
  // Phase 25: Prevent double clock-in — only one open entry per employee per workspace
  // Partial unique index: enforced at DB level so concurrent requests are rejected atomically.
  uniqueIndex("uq_time_entries_active_clock_in").on(table.employeeId, table.workspaceId).where(sql`clock_out IS NULL`),
]);

export const timeEntryAuditEvents = pgTable("time_entry_audit_events", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  workspaceId: varchar("workspace_id").notNull(),
  timeEntryId: varchar("time_entry_id"),
  breakId: varchar("break_id"),
  
  // Actor information
  actorUserId: varchar("actor_user_id"),
  actorEmployeeId: varchar("actor_employee_id"),
  actorName: varchar("actor_name").notNull(), // Cached for display
  
  // Action details
  actionType: auditActionTypeEnum("action_type").notNull(),
  description: text("description").notNull(), // Human-readable description
  payload: jsonb("payload"), // JSON data with before/after values, coordinates, etc.
  
  // Context
  ipAddress: varchar("ip_address"),
  userAgent: text("user_agent"),
  
  occurredAt: timestamp("occurred_at").defaultNow().notNull(),

  createdAt: timestamp("created_at").defaultNow(),
});

export const gpsLocations = pgTable("gps_locations", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  workspaceId: varchar("workspace_id").notNull(),
  
  // References - for different use cases
  timeEntryId: varchar("time_entry_id"), // Clock-in verification
  employeeId: varchar("employee_id"), // DispatchOS tracking

  // Location data
  latitude: doublePrecision("latitude").notNull(),
  longitude: doublePrecision("longitude").notNull(),
  accuracy: decimal("accuracy", { precision: 10, scale: 2 }), // meters
  altitude: decimal("altitude", { precision: 10, scale: 2 }), // meters

  // Movement data (for DispatchOS)
  speed: decimal("speed", { precision: 10, scale: 2 }), // km/h or mph
  heading: decimal("heading", { precision: 10, scale: 2 }), // degrees 0-360
  isMoving: boolean("is_moving").default(false),

  // Clock-in verification fields
  address: varchar("address"),
  verified: boolean("verified").default(false),
  deviceInfo: jsonb("device_info"),
  
  // Device data (for DispatchOS)
  batteryLevel: integer("battery_level"), // percentage 0-100
  timestamp: timestamp("timestamp").notNull().defaultNow(),
  recordedAt: timestamp("recorded_at").defaultNow(), // Canonical name — sync with timestamp column

  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),

  incidentId: varchar("incident_id"),
  unitStatus: varchar("unit_status"),
}, (table) => ({
  workspaceIdx: index("gps_locations_workspace_idx").on(table.workspaceId),
  employeeIdx: index("gps_locations_employee_idx").on(table.employeeId),
  timestampIdx: index("gps_locations_timestamp_idx").on(table.timestamp),
}));

export const scheduledBreaks = pgTable("scheduled_breaks", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  workspaceId: varchar("workspace_id").notNull(),
  shiftId: varchar("shift_id"),
  employeeId: varchar("employee_id"),
  
  // Break Details
  breakType: breakTypeEnum("break_type").notNull().default('rest'), // 'meal' or 'rest'
  scheduledStart: timestamp("scheduled_start").notNull(),
  scheduledEnd: timestamp("scheduled_end").notNull(),
  durationMinutes: integer("duration_minutes").notNull(),
  isPaid: boolean("is_paid").default(false),
  
  // Compliance Tracking
  laborLawRuleId: varchar("labor_law_rule_id"),
  jurisdiction: varchar("jurisdiction"), // Cached for reference
  isRequired: boolean("is_required").default(true), // Required by law vs optional
  complianceStatus: varchar("compliance_status").default('scheduled'), // 'scheduled', 'taken', 'skipped', 'waived', 'late'
  
  // Actual Break Tracking
  actualStart: timestamp("actual_start"),
  actualEnd: timestamp("actual_end"),
  actualDurationMinutes: integer("actual_duration_minutes"),
  waiverSigned: boolean("waiver_signed").default(false),
  waiverSignedAt: timestamp("waiver_signed_at"),
  
  // AI Optimization
  aiOptimized: boolean("ai_optimized").default(false), // Was timing optimized by AI?
  coverageScore: decimal("coverage_score", { precision: 5, scale: 2 }), // How well coverage was maintained
  aiNotes: text("ai_notes"), // AI explanation for timing choice
  
  notes: text("notes"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => [
  index("scheduled_breaks_workspace_idx").on(table.workspaceId),
  index("scheduled_breaks_shift_idx").on(table.shiftId),
  index("scheduled_breaks_employee_idx").on(table.employeeId),
  index("scheduled_breaks_scheduled_start_idx").on(table.scheduledStart),
  index("scheduled_breaks_compliance_idx").on(table.complianceStatus),
]);

export const evvVisitRecords = pgTable("evv_visit_records", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  workspaceId: varchar("workspace_id").notNull(),
  timeEntryId: varchar("time_entry_id"),
  employeeId: varchar("employee_id").notNull(),
  clientId: varchar("client_id").notNull(),
  billingCodeId: varchar("billing_code_id"),
  // Visit timing
  scheduledStart: timestamp("scheduled_start"),
  scheduledEnd: timestamp("scheduled_end"),
  actualStart: timestamp("actual_start"),
  actualEnd: timestamp("actual_end"),
  // GPS verification
  checkInLat: decimal("check_in_lat", { precision: 10, scale: 7 }),
  checkInLng: decimal("check_in_lng", { precision: 10, scale: 7 }),
  checkOutLat: decimal("check_out_lat", { precision: 10, scale: 7 }),
  checkOutLng: decimal("check_out_lng", { precision: 10, scale: 7 }),
  gpsVerified: boolean("gps_verified").default(false),
  // Client verification
  clientSignature: text("client_signature"), // Base64 signature image
  clientSignedAt: timestamp("client_signed_at"),
  // Billing
  unitsProvided: decimal("units_provided", { precision: 6, scale: 2 }),
  billableAmount: decimal("billable_amount", { precision: 10, scale: 2 }),
  invoiceId: varchar("invoice_id"),
  // Status
  status: varchar("status", { length: 30 }).default("pending"), // pending, verified, disputed, billed
  verificationNotes: text("verification_notes"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => [
  index("evv_visits_workspace_idx").on(table.workspaceId),
  index("evv_visits_employee_idx").on(table.employeeId),
  index("evv_visits_client_idx").on(table.clientId),
  index("evv_visits_status_idx").on(table.status),
  index("evv_visits_date_idx").on(table.actualStart),
]);

export const manualClockinOverrides = pgTable("manual_clockin_overrides", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  workspaceId: varchar("workspace_id").notNull(),
  employeeId: varchar("employee_id").notNull(),
  shiftId: varchar("shift_id"),
  overrideType: varchar("override_type").default('manual'),
  originalClockIn: timestamp("original_clock_in"),
  originalClockOut: timestamp("original_clock_out"),
  adjustedClockIn: timestamp("adjusted_clock_in"),
  adjustedClockOut: timestamp("adjusted_clock_out"),
  reason: text("reason"),
  approvedBy: varchar("approved_by"),
  approvedAt: timestamp("approved_at"),
  metadata: jsonb("metadata"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// ─── Recovered unmapped tables ─────────────────────────────────────────────

export const timeEntryBreaks = pgTable("time_entry_breaks", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  workspaceId: varchar("workspace_id").notNull(),
  timeEntryId: varchar("time_entry_id").notNull(),
  employeeId: varchar("employee_id").notNull(),
  
  // Break tracking
  breakType: breakTypeEnum("break_type").default('rest'),
  startTime: timestamp("start_time").notNull(),
  endTime: timestamp("end_time"),
  duration: decimal("duration", { precision: 10, scale: 2 }), // Minutes
  
  // Break details
  isPaid: boolean("is_paid").default(false),
  notes: text("notes"),
  
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),

  durationMinutes: integer("duration_minutes"),
});

export const timeEntryDiscrepancies = pgTable("time_entry_discrepancies", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  workspaceId: varchar("workspace_id").notNull(),
  timeEntryId: varchar("time_entry_id").notNull(),
  employeeId: varchar("employee_id").notNull(),

  // Discrepancy details
  discrepancyType: varchar("discrepancy_type").notNull(), // 'location_mismatch', 'ip_anomaly', 'impossible_travel'
  severity: varchar("severity").notNull(), // 'low', 'medium', 'high', 'critical'

  // Location analysis
  expectedLocation: jsonb("expected_location"), // Job site coordinates
  actualLocation: jsonb("actual_location"), // Clock-in coordinates
  distanceMeters: decimal("distance_meters", { precision: 10, scale: 2 }), // Distance from job site

  // Detection details
  detectedAt: timestamp("detected_at").defaultNow(),
  autoFlagged: boolean("auto_flagged").default(true), // Auto-detected vs manual

  // Resolution
  status: varchar("status").default("open"), // 'open', 'investigating', 'resolved', 'dismissed'
  reviewedBy: varchar("reviewed_by"),
  reviewedAt: timestamp("reviewed_at"),
  resolution: text("resolution"),
  resolutionNotes: text("resolution_notes"),

  // Evidence preservation
  evidenceSnapshot: jsonb("evidence_snapshot"), // Complete time entry data at time of flag

  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const timeOffRequests = pgTable("time_off_requests", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  workspaceId: varchar("workspace_id").notNull(),
  employeeId: varchar("employee_id").notNull(),
  
  // Request details
  startDate: timestamp("start_date").notNull(),
  endDate: timestamp("end_date").notNull(),
  requestType: varchar("request_type").notNull(), // 'vacation', 'sick', 'personal', 'unpaid'
  totalDays: integer("total_days"),
  reason: text("reason"),
  notes: text("notes"),
  
  // Approval workflow
  status: varchar("status").default('pending'), // 'pending', 'approved', 'denied'
  reviewedBy: varchar("reviewed_by"),
  reviewedAt: timestamp("reviewed_at"),
  reviewNotes: text("review_notes"),
  
  // AI scheduling impact
  affectsScheduling: boolean("affects_scheduling").default(true),
  aiNotified: boolean("ai_notified").default(false), // Has Scheduling been notified?
  
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => ({
  workspaceIdx: index("time_off_requests_workspace_idx").on(table.workspaceId),
  employeeIdx: index("time_off_requests_employee_idx").on(table.employeeId),
  statusIdx: index("time_off_requests_status_idx").on(table.status),
  dateRangeIdx: index("time_off_requests_date_range_idx").on(table.startDate, table.endDate),
}));

export const timesheetEditRequests = pgTable("timesheet_edit_requests", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  workspaceId: varchar("workspace_id").notNull(),
  timeEntryId: varchar("time_entry_id").notNull(),
  
  // Request details
  requestedBy: varchar("requested_by").notNull(),
  reason: text("reason").notNull(),
  
  // Proposed changes
  proposedClockIn: timestamp("proposed_clock_in"),
  proposedClockOut: timestamp("proposed_clock_out"),
  proposedNotes: text("proposed_notes"),
  
  // Current values (for comparison)
  originalClockIn: timestamp("original_clock_in"),
  originalClockOut: timestamp("original_clock_out"),
  originalNotes: text("original_notes"),
  
  // Approval workflow
  status: timesheetEditRequestStatusEnum("status").default('pending'),
  reviewedBy: varchar("reviewed_by"),
  reviewedAt: timestamp("reviewed_at"),
  reviewNotes: text("review_notes"),
  
  // Applied changes
  appliedBy: varchar("applied_by"),
  appliedAt: timestamp("applied_at"),
  
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => ({
  workspaceIdx: index("timesheet_edit_requests_workspace_idx").on(table.workspaceId),
  timeEntryIdx: index("timesheet_edit_requests_time_entry_idx").on(table.timeEntryId),
  requestedByIdx: index("timesheet_edit_requests_requested_by_idx").on(table.requestedBy),
  statusIdx: index("timesheet_edit_requests_status_idx").on(table.status),
}));

// ============================================================================
// MILEAGE LOGS — Employee Trip & Reimbursement Tracking
// ============================================================================

export const mileageLogs = pgTable("mileage_logs", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  workspaceId: varchar("workspace_id").notNull(),
  employeeId: varchar("employee_id").notNull(),

  // Trip details
  tripDate: timestamp("trip_date").notNull(),
  startLocation: text("start_location"),
  endLocation: text("end_location"),
  purpose: text("purpose"),
  tripType: varchar("trip_type").default("other"), // client_visit | site_patrol | training | supply_run | other

  // Miles + reimbursement
  miles: decimal("miles", { precision: 8, scale: 2 }).notNull(),
  ratePerMile: decimal("rate_per_mile", { precision: 6, scale: 4 }).default("0.6700"), // IRS 2025 standard
  reimbursementAmount: decimal("reimbursement_amount", { precision: 10, scale: 2 }),

  // Approval workflow: draft → submitted → approved | rejected → paid
  status: varchar("status").default("draft"),
  submittedAt: timestamp("submitted_at"),
  approvedBy: varchar("approved_by"),
  approvedAt: timestamp("approved_at"),
  paidAt: timestamp("paid_at"),
  rejectionReason: text("rejection_reason"),

  notes: text("notes"),
  shiftId: varchar("shift_id"),
  trinityRecommendationId: varchar("trinity_recommendation_id"),

  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => ({
  workspaceIdx: index("mileage_logs_workspace_idx").on(table.workspaceId),
  employeeIdx: index("mileage_logs_employee_idx").on(table.employeeId),
  statusIdx:   index("mileage_logs_status_idx").on(table.status),
  dateIdx:     index("mileage_logs_date_idx").on(table.tripDate),
}));

export * from './extended';
