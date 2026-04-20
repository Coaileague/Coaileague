// ═══════════════════════════════════════════════════════════════
// Domain 15 of 15: Field Ops
// ═══════════════════════════════════════════════════════════════
// THE LAW: No new tables without Bryan's explicit approval. Zero DROP TABLE ever.
// Tables: 42

import { pgTable, varchar, text, integer, boolean, timestamp, jsonb, decimal, date, time, doublePrecision, index, uniqueIndex, primaryKey, unique, numeric } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import {
  agentStatusEnum,
  entityTypeEnum,
  equipmentCategoryEnum,
  equipmentStatusEnum,
  guardTourScanStatusEnum,
  guardTourStatusEnum,
  maintenanceAlertSeverityEnum,
  maintenanceAlertStatusEnum,
} from '../../enums';

export const assets = pgTable("assets", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  workspaceId: varchar("workspace_id").notNull(),

  // Asset identification
  assetNumber: varchar("asset_number").notNull(), // "TRUCK-001", "RIG-4"
  assetName: varchar("asset_name").notNull(), // "2020 Ford F-150"
  assetType: varchar("asset_type").notNull(), // 'vehicle', 'equipment', 'tool', 'facility'
  category: varchar("category"), // "Pickup Truck", "Drilling Rig", "Forklift"

  // Asset details
  manufacturer: varchar("manufacturer"),
  model: varchar("model"),
  serialNumber: varchar("serial_number"),
  yearManufactured: integer("year_manufactured"),
  purchaseDate: timestamp("purchase_date"),
  purchasePrice: decimal("purchase_price", { precision: 12, scale: 2 }),

  // Location & assignment
  currentLocation: text("current_location"),
  homeLocation: text("home_location"), // Default storage location
  assignedToClientId: varchar("assigned_to_client_id"),

  // Billing configuration
  hourlyRate: decimal("hourly_rate", { precision: 10, scale: 2 }),
  dailyRate: decimal("daily_rate", { precision: 10, scale: 2 }),
  weeklyRate: decimal("weekly_rate", { precision: 10, scale: 2 }),
  billingType: varchar("billing_type").default("hourly"), // 'hourly', 'daily', 'weekly', 'flat_fee'
  isBillable: boolean("is_billable").default(true),

  // Maintenance & compliance
  lastMaintenanceDate: timestamp("last_maintenance_date"),
  nextMaintenanceDate: timestamp("next_maintenance_date"),
  maintenanceIntervalDays: integer("maintenance_interval_days"),
  certifications: jsonb("certifications").$type<string[]>().default(sql`'[]'`), // ['DOT Inspection', 'Safety Certified']
  certificationExpiry: timestamp("certification_expiry"),

  // Availability & status
  status: varchar("status").default("available"), // 'available', 'in_use', 'maintenance', 'retired'
  isSchedulable: boolean("is_schedulable").default(true),
  requiresOperatorCertification: boolean("requires_operator_certification").default(false),
  requiredCertifications: jsonb("required_certifications").$type<string[]>().default(sql`'[]'`), // Employee must have these

  // Documentation
  photos: jsonb("photos").$type<string[]>().default(sql`'[]'`), // URLs to asset photos
  documents: jsonb("documents").$type<string[]>().default(sql`'[]'`), // Manuals, insurance docs
  notes: text("notes"),

  // Depreciation (for accounting)
  depreciationMethod: varchar("depreciation_method"), // 'straight_line', 'declining_balance'
  depreciationRate: decimal("depreciation_rate", { precision: 5, scale: 2 }),
  currentValue: decimal("current_value", { precision: 12, scale: 2 }),

  // Metadata
  isActive: boolean("is_active").default(true),
  createdBy: varchar("created_by").notNull(),

  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),

  scheduleData: jsonb("schedule_data").default('{}'),
  assignmentData: jsonb("assignment_data").default('{}'),
  maintenanceData: jsonb("maintenance_data").default('{}'),
  usageData: jsonb("usage_data").default('{}'),
}, (table) => ({
  workspaceNumberIndex: uniqueIndex("assets_workspace_number_idx").on(table.workspaceId, table.assetNumber),
  statusIndex: index("assets_status_idx").on(table.status, table.isSchedulable),
  maintenanceIndex: index("assets_maintenance_idx").on(table.nextMaintenanceDate),
}));

export const assetSchedules = pgTable("asset_schedules", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  workspaceId: varchar("workspace_id").notNull(),
  assetId: varchar("asset_id").notNull(),

  // Linked to employee shift (dual-layer scheduling)
  shiftId: varchar("shift_id"),
  employeeId: varchar("employee_id"),
  clientId: varchar("client_id"),

  // Scheduling details
  startTime: timestamp("start_time").notNull(),
  endTime: timestamp("end_time").notNull(),
  date: varchar("date", { length: 10 }), // YYYY-MM-DD format for quick date lookups
  jobDescription: text("job_description"),
  jobLocation: text("job_location"),

  // Conflict detection flags
  hasConflict: boolean("has_conflict").default(false),
  conflictWith: jsonb("conflict_with").$type<string[]>().default(sql`'[]'`), // Asset schedule IDs that overlap

  // Usage tracking (for billing)
  actualStartTime: timestamp("actual_start_time"),
  actualEndTime: timestamp("actual_end_time"),
  actualHours: decimal("actual_hours", { precision: 10, scale: 2 }),
  odometerStart: decimal("odometer_start", { precision: 10, scale: 2 }),
  odometerEnd: decimal("odometer_end", { precision: 10, scale: 2 }),
  fuelUsed: decimal("fuel_used", { precision: 10, scale: 2 }),

  // Billing (auto-calculated for Billing Platform)
  billableHours: decimal("billable_hours", { precision: 10, scale: 2 }),
  hourlyRate: decimal("hourly_rate", { precision: 10, scale: 2 }),
  totalCharge: decimal("total_charge", { precision: 10, scale: 2 }),
  invoiced: boolean("invoiced").default(false),
  invoiceId: varchar("invoice_id"),

  // Pre/post inspection (safety compliance)
  preInspectionCompleted: boolean("pre_inspection_completed").default(false),
  preInspectionBy: varchar("pre_inspection_by"),
  preInspectionNotes: text("pre_inspection_notes"),
  postInspectionCompleted: boolean("post_inspection_completed").default(false),
  postInspectionBy: varchar("post_inspection_by"),
  postInspectionNotes: text("post_inspection_notes"),
  damageReported: boolean("damage_reported").default(false),
  damageDescription: text("damage_description"),

  // Status
  status: varchar("status").default("scheduled"), // 'scheduled', 'in_progress', 'completed', 'cancelled'
  cancelledBy: varchar("cancelled_by"),
  cancelledAt: timestamp("cancelled_at"),
  cancellationReason: text("cancellation_reason"),

  createdBy: varchar("created_by").notNull(),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => ({
  assetTimeIndex: index("asset_schedules_asset_time_idx").on(table.assetId, table.startTime),
  shiftIndex: index("asset_schedules_shift_idx").on(table.shiftId),
  conflictIndex: index("asset_schedules_conflict_idx").on(table.hasConflict),
}));

export const assetUsageLogs = pgTable("asset_usage_logs", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  workspaceId: varchar("workspace_id").notNull(),
  assetId: varchar("asset_id").notNull(),
  assetScheduleId: varchar("asset_schedule_id"),

  // Usage period
  usagePeriodStart: timestamp("usage_period_start").notNull(),
  usagePeriodEnd: timestamp("usage_period_end").notNull(),
  totalHours: decimal("total_hours", { precision: 10, scale: 2 }),

  // Operator details
  operatedBy: varchar("operated_by"),
  operatorCertificationVerified: boolean("operator_certification_verified").default(false),

  // Client billing
  clientId: varchar("client_id"),
  costCenterCode: varchar("cost_center_code"), // For client's internal accounting

  // Maintenance tracking
  maintenanceRequired: boolean("maintenance_required").default(false),
  maintenanceNotes: text("maintenance_notes"),
  issuesReported: jsonb("issues_reported").$type<string[]>().default(sql`'[]'`),

  // Auto-aggregated metrics
  totalDistance: decimal("total_distance", { precision: 10, scale: 2 }), // Miles/KM
  fuelConsumed: decimal("fuel_consumed", { precision: 10, scale: 2 }),
  idleTime: decimal("idle_time", { precision: 10, scale: 2 }), // Hours

  // Billing Platform integration
  invoiceLineItemId: varchar("invoice_line_item_id"),
  billingStatus: varchar("billing_status").default("pending"), // 'pending', 'invoiced', 'paid'

  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => ({
  assetPeriodIndex: index("asset_usage_logs_asset_period_idx").on(table.assetId, table.usagePeriodStart),
  clientIndex: index("asset_usage_logs_client_idx").on(table.clientId, table.billingStatus),
}));

export const maintenanceAlerts = pgTable("maintenance_alerts", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  workspaceId: varchar("workspace_id"), // null = platform-wide
  createdById: varchar("created_by_id"),
  
  // Alert details
  title: varchar("title", { length: 255 }).notNull(),
  description: text("description").notNull(),
  severity: maintenanceAlertSeverityEnum("severity").notNull(),
  
  // Timing
  scheduledStartTime: timestamp("scheduled_start_time").notNull(),
  scheduledEndTime: timestamp("scheduled_end_time").notNull(),
  actualStartTime: timestamp("actual_start_time"),
  actualEndTime: timestamp("actual_end_time"),
  
  // Impact
  affectedServices: jsonb("affected_services").$type<string[]>().notNull(), // Array of service names
  estimatedImpactMinutes: integer("estimated_impact_minutes"),
  
  // Status tracking
  status: maintenanceAlertStatusEnum("status").default("scheduled"),
  isBroadcast: boolean("is_broadcast").default(false), // Sent to all workspaces if true
  
  // Admin tracking
  acknowledgedByCount: integer("acknowledged_by_count").default(0),
  
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => ({
  workspaceIdx: index("maintenance_alerts_workspace_idx").on(table.workspaceId),
  statusIdx: index("maintenance_alerts_status_idx").on(table.status),
  severityIdx: index("maintenance_alerts_severity_idx").on(table.severity),
  scheduledIdx: index("maintenance_alerts_scheduled_idx").on(table.scheduledStartTime),
  createdIdx: index("maintenance_alerts_created_idx").on(table.createdAt),
}));

export const maintenanceAcknowledgments = pgTable("maintenance_acknowledgments", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  workspaceId: varchar("workspace_id"),
  alertId: varchar("alert_id").notNull(),
  userId: varchar("user_id").notNull(),
  
  acknowledgedAt: timestamp("acknowledged_at").defaultNow(),

  createdAt: timestamp("created_at", { withTimezone: true }).default(sql`now()`),
  updatedAt: timestamp("updated_at", { withTimezone: true }).default(sql`now()`),
}, (table) => ({
  alertIdx: index("maintenance_acks_alert_idx").on(table.alertId),
  userIdx: index("maintenance_acks_user_idx").on(table.userId),
  uniqueAck: uniqueIndex("maintenance_acks_unique").on(table.alertId, table.userId),
}));

export const dispatchIncidents = pgTable("dispatch_incidents", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  workspaceId: varchar("workspace_id").notNull(),
  
  // Incident identification
  incidentNumber: varchar("incident_number").notNull().unique(), // CAD-2024-001234
  priority: varchar("priority").notNull(), // emergency, urgent, routine, low
  type: varchar("type").notNull(), // alarm, medical, patrol, disturbance, fire, theft, etc.
  status: varchar("status").notNull().default('queued'), // queued, dispatched, en_route, on_scene, cleared, cancelled
  
  // Location
  clientId: varchar("client_id"), // FIXED: VARCHAR to match clients.id
  locationAddress: text("location_address").notNull(),
  locationLatitude: doublePrecision("location_latitude"),
  locationLongitude: doublePrecision("location_longitude"),
  locationZone: varchar("location_zone"), // "North Sector", "Downtown", etc.
  
  // Caller information
  callerName: varchar("caller_name"),
  callerPhone: varchar("caller_phone"),
  callerType: varchar("caller_type"), // client, employee, public, system
  
  // Incident details
  description: text("description"),
  specialInstructions: text("special_instructions"),
  notes: text("notes"),
  
  // Timeline tracking
  callReceivedAt: timestamp("call_received_at").notNull(),
  dispatchedAt: timestamp("dispatched_at"),
  enRouteAt: timestamp("en_route_at"),
  arrivedAt: timestamp("arrived_at"),
  clearedAt: timestamp("cleared_at"),
  cancelledAt: timestamp("cancelled_at"),
  
  // Performance metrics
  responseTimeSeconds: integer("response_time_seconds"), // dispatchedAt - callReceivedAt
  travelTimeSeconds: integer("travel_time_seconds"), // arrivedAt - enRouteAt
  sceneTimeSeconds: integer("scene_time_seconds"), // clearedAt - arrivedAt
  totalTimeSeconds: integer("total_time_seconds"), // clearedAt - callReceivedAt
  
  // Assignment
  assignedUnits: text("assigned_units").array(), // ["U-12", "U-7"]
  requiredCertifications: text("required_certifications").array(), // ["CPR", "Armed"]
  
  // Metadata
  createdBy: varchar("created_by"), // Dispatcher user ID
  cancelledBy: varchar("cancelled_by"),
  cancellationReason: text("cancellation_reason"),
  
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),

  incidentType: varchar("incident_type"),
  assignmentData: jsonb("assignment_data").default('{}'),
  logData: jsonb("log_data").default('{}'),
}, (table) => ({
  workspaceIdx: index("dispatch_incidents_workspace_idx").on(table.workspaceId),
  statusIdx: index("dispatch_incidents_status_idx").on(table.status),
  priorityIdx: index("dispatch_incidents_priority_idx").on(table.priority),
  incidentNumberIdx: index("dispatch_incidents_number_idx").on(table.incidentNumber),
  clientIdx: index("dispatch_incidents_client_idx").on(table.clientId),
  createdAtIdx: index("dispatch_incidents_created_at_idx").on(table.createdAt),
  callReceivedIdx: index("dispatch_incidents_call_received_idx").on(table.callReceivedAt),
}));

export const dispatchAssignments = pgTable("dispatch_assignments", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  workspaceId: varchar("workspace_id").notNull(),
  
  // Assignment details
  incidentId: varchar("incident_id").notNull(),
  employeeId: varchar("employee_id").notNull(), // FIXED: VARCHAR to match employees.id
  unitNumber: varchar("unit_number").notNull(), // "U-12", "AMB-3", "ENG-7"
  
  // Status tracking
  status: varchar("status").notNull().default('assigned'), // assigned, accepted, rejected, en_route, on_scene, cleared, cancelled
  
  // Timeline
  assignedAt: timestamp("assigned_at").notNull(),
  acceptedAt: timestamp("accepted_at"),
  rejectedAt: timestamp("rejected_at"),
  enRouteAt: timestamp("en_route_at"),
  arrivedAt: timestamp("arrived_at"),
  clearedAt: timestamp("cleared_at"),
  
  // Additional data
  rejectionReason: text("rejection_reason"),
  notes: text("notes"),
  isPrimary: boolean("is_primary").default(false), // Primary unit vs backup
  
  // Assignment source
  assignedBy: varchar("assigned_by"), // Dispatcher or system
  assignmentMethod: varchar("assignment_method").default('manual'), // manual, auto, requested
  
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => ({
  workspaceIdx: index("dispatch_assignments_workspace_idx").on(table.workspaceId),
  incidentIdx: index("dispatch_assignments_incident_idx").on(table.incidentId),
  employeeIdx: index("dispatch_assignments_employee_idx").on(table.employeeId),
  statusIdx: index("dispatch_assignments_status_idx").on(table.status),
  unitNumberIdx: index("dispatch_assignments_unit_idx").on(table.unitNumber),
  createdAtIdx: index("dispatch_assignments_created_at_idx").on(table.createdAt),
}));

export const unitStatuses = pgTable("unit_statuses", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  workspaceId: varchar("workspace_id").notNull(),
  employeeId: varchar("employee_id").notNull().unique(), // FIXED: VARCHAR to match employees.id
  
  // Unit identification
  unitNumber: varchar("unit_number").notNull(), // "U-12", "AMB-3", "ENG-7"
  unitType: varchar("unit_type"), // patrol, ambulance, supervisor, fire_engine, etc.
  
  // Current status
  status: varchar("status").notNull().default('offline'), // available, en_route, on_scene, offline, out_of_service, meal_break
  statusChangedAt: timestamp("status_changed_at").notNull(),
  statusChangedBy: varchar("status_changed_by"), // User ID or 'system'
  
  // Current assignment
  currentIncidentId: varchar("current_incident_id"),
  
  // Last known location
  lastKnownLatitude: doublePrecision("last_known_latitude"),
  lastKnownLongitude: doublePrecision("last_known_longitude"),
  lastLocationUpdate: timestamp("last_location_update"),
  
  // Zone assignment
  assignedZone: varchar("assigned_zone"), // "North Sector", "Downtown", etc.
  
  // Capabilities
  capabilities: text("capabilities").array(), // ["EMT", "CPR", "Armed", "K9"]
  equipmentAssigned: text("equipment_assigned").array(), // ["Radio-123", "Vehicle-456"]
  
  // Shift tracking
  currentShiftId: varchar("current_shift_id"), // FIXED: VARCHAR to match shifts.id
  clockedInAt: timestamp("clocked_in_at"),
  
  // Device info
  deviceId: varchar("device_id"),
  appVersion: varchar("app_version"),
  lastHeartbeat: timestamp("last_heartbeat"), // For detecting disconnected units
  
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => ({
  workspaceIdx: index("unit_statuses_workspace_idx").on(table.workspaceId),
  employeeIdx: index("unit_statuses_employee_idx").on(table.employeeId),
  statusIdx: index("unit_statuses_status_idx").on(table.status),
  unitNumberIdx: index("unit_statuses_unit_number_idx").on(table.unitNumber),
  incidentIdx: index("unit_statuses_incident_idx").on(table.currentIncidentId),
  zoneIdx: index("unit_statuses_zone_idx").on(table.assignedZone),
}));

export const dispatchLogs = pgTable("dispatch_logs", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  workspaceId: varchar("workspace_id").notNull(),
  
  // Event details
  incidentId: varchar("incident_id"),
  employeeId: varchar("employee_id"), // FIXED: VARCHAR to match employees.id
  
  // Action tracking
  action: varchar("action").notNull(), // created_incident, assigned_unit, changed_status, sent_message, cancelled_incident, etc.
  actionCategory: varchar("action_category").notNull(), // incident, unit, communication, system
  
  // Actor
  userId: varchar("user_id"),
  actorType: varchar("actor_type").default('user'), // user, system, auto
  
  // Details
  description: text("description").notNull(),
  details: jsonb("details"), // Additional structured data
  
  // Metadata
  ipAddress: varchar("ip_address"),
  userAgent: text("user_agent"),
  
  timestamp: timestamp("timestamp").notNull().defaultNow(),
}, (table) => ({
  workspaceIdx: index("dispatch_logs_workspace_idx").on(table.workspaceId),
  incidentIdx: index("dispatch_logs_incident_idx").on(table.incidentId),
  employeeIdx: index("dispatch_logs_employee_idx").on(table.employeeId),
  actionIdx: index("dispatch_logs_action_idx").on(table.action),
  timestampIdx: index("dispatch_logs_timestamp_idx").on(table.timestamp),
}));

export const agentIdentities = pgTable("agent_identities", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  
  // Identity
  agentId: varchar("agent_id", { length: 100 }).notNull().unique(), // e.g., "trinity-orchestrator", "subagent-payroll-001"
  name: varchar("name", { length: 255 }).notNull(),
  description: text("description"),
  entityType: entityTypeEnum("entity_type").notNull().default("bot"),
  
  // Workspace isolation
  workspaceId: varchar("workspace_id"),
  isGlobal: boolean("is_global").default(false), // Platform-wide agents like Trinity
  
  // Authorization
  status: agentStatusEnum("status").notNull().default("active"),
  role: varchar("role", { length: 50 }), // Base RBAC role
  permissions: text("permissions").array(), // Explicit permissions
  deniedPermissions: text("denied_permissions").array(), // Explicit denials
  
  // Mission & Context
  missionObjective: text("mission_objective"), // Current assigned task/objective
  riskProfile: varchar("risk_profile", { length: 20 }).default("low"), // 'low', 'medium', 'high', 'critical'
  maxAutonomyLevel: integer("max_autonomy_level").default(3), // 1-5 scale
  
  // Token management
  tokenExpiryMinutes: integer("token_expiry_minutes").default(15), // Short-lived tokens
  lastTokenIssuedAt: timestamp("last_token_issued_at"),
  tokenCount24h: integer("token_count_24h").default(0), // Track authentication frequency
  
  // Tool access control
  allowedTools: text("allowed_tools").array(), // Explicit tool allowlist
  deniedTools: text("denied_tools").array(), // Explicit tool denylist
  allowedDomains: text("allowed_domains").array(), // AI Brain domains
  
  // Rate limiting
  requestsPerMinute: integer("requests_per_minute").default(60),
  requestsPerHour: integer("requests_per_hour").default(1000),
  currentMinuteRequests: integer("current_minute_requests").default(0),
  currentHourRequests: integer("current_hour_requests").default(0),
  lastRequestAt: timestamp("last_request_at"),
  
  // Audit trail
  createdBy: varchar("created_by"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
  lastActiveAt: timestamp("last_active_at"),
  suspendedAt: timestamp("suspended_at"),
  suspendedBy: varchar("suspended_by"),
  suspensionReason: text("suspension_reason"),
}, (table) => [
  index("agent_identities_workspace_idx").on(table.workspaceId),
  index("agent_identities_status_idx").on(table.status),
  index("agent_identities_type_idx").on(table.entityType),
  index("agent_identities_agent_id_idx").on(table.agentId),
]);

export const equipmentItems = pgTable("equipment_items", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  workspaceId: varchar("workspace_id").notNull(),
  name: varchar("name").notNull(),
  serialNumber: varchar("serial_number"),
  category: equipmentCategoryEnum("category").notNull().default('other'),
  status: equipmentStatusEnum("status").notNull().default('available'),
  description: text("description"),
  purchaseDate: timestamp("purchase_date"),
  purchaseCost: decimal("purchase_cost", { precision: 10, scale: 2 }),
  warrantyExpiration: timestamp("warranty_expiration"),
  notes: text("notes"),
  metadata: jsonb("metadata"),
  itemType: varchar("item_type"),
  lowInventoryThreshold: integer("low_inventory_threshold").default(1),
  quantity: integer("quantity").default(1),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => [
  index("idx_equipment_items_workspace").on(table.workspaceId),
  index("idx_equipment_items_status").on(table.status),
  index("idx_equipment_items_category").on(table.category),
]);

export const equipmentAssignments = pgTable("equipment_assignments", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  workspaceId: varchar("workspace_id").notNull(),
  equipmentItemId: varchar("equipment_item_id").notNull(),
  employeeId: varchar("employee_id").notNull(),
  assignedBy: varchar("assigned_by"),
  checkoutDate: timestamp("checkout_date").notNull().defaultNow(),
  expectedReturnDate: timestamp("expected_return_date"),
  actualReturnDate: timestamp("actual_return_date"),
  condition: varchar("condition").default("good"),
  conditionAtCheckout: varchar("condition_at_checkout").default("good"),
  damageNotes: text("damage_notes"),
  deductionAmount: decimal("deduction_amount", { precision: 10, scale: 2 }),
  isLost: boolean("is_lost").default(false),
  notes: text("notes"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => [
  index("idx_equipment_assignments_workspace").on(table.workspaceId),
  index("idx_equipment_assignments_item").on(table.equipmentItemId),
  index("idx_equipment_assignments_employee").on(table.employeeId),
]);

export const equipmentMaintenanceLogs = pgTable("equipment_maintenance_logs", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  workspaceId: varchar("workspace_id").notNull(),
  equipmentItemId: varchar("equipment_item_id").notNull(),
  maintenanceType: varchar("maintenance_type").notNull().default("repair"),
  description: text("description"),
  performedBy: varchar("performed_by"),
  cost: decimal("cost", { precision: 10, scale: 2 }),
  scheduledDate: timestamp("scheduled_date"),
  completedDate: timestamp("completed_date"),
  nextMaintenanceDate: timestamp("next_maintenance_date"),
  notes: text("notes"),
  createdAt: timestamp("created_at").defaultNow(),

  updatedAt: timestamp("updated_at", { withTimezone: true }).default(sql`now()`),
}, (table) => [
  index("idx_equipment_maintenance_workspace").on(table.workspaceId),
  index("idx_equipment_maintenance_item").on(table.equipmentItemId),
]);

export const weapons = pgTable("weapons", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  workspaceId: varchar("workspace_id").notNull(),
  serialNumber: varchar("serial_number").notNull(),
  weaponType: varchar("weapon_type").notNull(),
  make: varchar("make"),
  model: varchar("model"),
  caliber: varchar("caliber"),
  status: varchar("status").default("available"),
  assignedEmployeeId: varchar("assigned_employee_id"),
  purchaseDate: timestamp("purchase_date"),
  lastInspectionAt: timestamp("last_inspection_at"),
  nextInspectionDue: timestamp("next_inspection_due"),
  certificateExpiry: timestamp("certificate_expiry"),
  condition: varchar("condition").default("good"),
  notes: text("notes"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
  // TRINITY.md Section R / Law P1 — soft delete (armory record retained for audit)
  deletedAt: timestamp("deleted_at"),
  deletedBy: varchar("deleted_by"),
}, (table) => [
  index("weapons_workspace_idx").on(table.workspaceId),
  index("weapons_assigned_idx").on(table.assignedEmployeeId),
  index("weapons_serial_idx").on(table.serialNumber),
]);

export const weaponCheckouts = pgTable("weapon_checkouts", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  weaponId: varchar("weapon_id").notNull(),
  workspaceId: varchar("workspace_id").notNull(),
  employeeId: varchar("employee_id").notNull(),
  checkedOutAt: timestamp("checked_out_at").defaultNow(),
  checkedInAt: timestamp("checked_in_at"),
  checkoutSignature: text("checkout_signature"),
  checkinSignature: text("checkin_signature"),
  conditionAtCheckout: varchar("condition_at_checkout"),
  conditionAtCheckin: varchar("condition_at_checkin"),
  shiftId: varchar("shift_id"),
  notes: text("notes"),
  createdAt: timestamp("created_at").defaultNow(),

  updatedAt: timestamp("updated_at", { withTimezone: true }).default(sql`now()`),
}, (table) => [
  index("weapon_checkout_weapon_idx").on(table.weaponId),
  index("weapon_checkout_ws_idx").on(table.workspaceId),
  index("weapon_checkout_emp_idx").on(table.employeeId),
]);

// ─────────────────────────────────────────────────────────────
// Armory gap closure (Readiness Section 2)
// Weapon inspections, qualifications, and ammo tracking.
// Every mutation writes audit_logs (CLAUDE §L). workspace_id
// indexed on every table (CLAUDE §D). Raw SQL must filter by
// workspace_id in WHERE (CLAUDE §G).
// ─────────────────────────────────────────────────────────────

export const weaponInspections = pgTable("weapon_inspections", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  workspaceId: varchar("workspace_id").notNull(),
  weaponId: varchar("weapon_id").notNull(),
  inspectedByEmployeeId: varchar("inspected_by_employee_id"),
  inspectedAt: timestamp("inspected_at").notNull().defaultNow(),
  inspectionType: varchar("inspection_type").notNull(), // routine, pre_shift, post_shift, quarterly, annual
  condition: varchar("condition").notNull(), // excellent, good, fair, poor, unserviceable
  roundsFired: integer("rounds_fired"),
  findings: text("findings"),
  actionTaken: varchar("action_taken"), // none, cleaned, repaired, removed_from_service
  nextInspectionDue: timestamp("next_inspection_due"),
  photoUrls: jsonb("photo_urls").$type<string[]>().default(sql`'[]'::jsonb`),
  signature: text("signature"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => [
  index("weapon_inspections_workspace_idx").on(table.workspaceId),
  index("weapon_inspections_weapon_idx").on(table.weaponId),
  index("weapon_inspections_inspected_at_idx").on(table.inspectedAt),
]);

export const weaponQualifications = pgTable("weapon_qualifications", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  workspaceId: varchar("workspace_id").notNull(),
  employeeId: varchar("employee_id").notNull(),
  weaponType: varchar("weapon_type").notNull(), // handgun, rifle, shotgun, taser, baton
  caliber: varchar("caliber"),
  qualificationLevel: varchar("qualification_level"), // basic, advanced, instructor
  qualifiedAt: timestamp("qualified_at").notNull(),
  expiresAt: timestamp("expires_at").notNull(),
  score: integer("score"),
  maxScore: integer("max_score"),
  instructorName: varchar("instructor_name"),
  instructorLicenseNumber: varchar("instructor_license_number"),
  rangeName: varchar("range_name"),
  certificateUrl: text("certificate_url"),
  status: varchar("status").default("active"), // active, expired, revoked
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => [
  index("weapon_quals_workspace_idx").on(table.workspaceId),
  index("weapon_quals_employee_idx").on(table.employeeId),
  index("weapon_quals_expires_idx").on(table.expiresAt),
]);

export const ammoInventory = pgTable("ammo_inventory", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  workspaceId: varchar("workspace_id").notNull(),
  caliber: varchar("caliber").notNull(),
  manufacturer: varchar("manufacturer"),
  lotNumber: varchar("lot_number"),
  grainWeight: integer("grain_weight"),
  roundType: varchar("round_type"), // fmj, hp, jhp, training
  quantityOnHand: integer("quantity_on_hand").notNull().default(0),
  reorderThreshold: integer("reorder_threshold").default(0),
  unitCost: decimal("unit_cost", { precision: 10, scale: 4 }),
  storageLocation: varchar("storage_location"),
  purchaseOrderNumber: varchar("purchase_order_number"),
  receivedAt: timestamp("received_at"),
  expiresAt: timestamp("expires_at"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => [
  index("ammo_inventory_workspace_idx").on(table.workspaceId),
  index("ammo_inventory_caliber_idx").on(table.caliber),
]);

export const ammoTransactions = pgTable("ammo_transactions", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  workspaceId: varchar("workspace_id").notNull(),
  ammoInventoryId: varchar("ammo_inventory_id").notNull(),
  transactionType: varchar("transaction_type").notNull(), // receive, issue, return, expended, damaged, audit_adjustment
  quantity: integer("quantity").notNull(), // positive for receive/return, negative for issue/expended
  quantityAfter: integer("quantity_after").notNull(),
  employeeId: varchar("employee_id"), // issued to / returned from
  relatedQualificationId: varchar("related_qualification_id"),
  relatedShiftId: varchar("related_shift_id"),
  reason: text("reason"),
  performedByUserId: varchar("performed_by_user_id"),
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => [
  index("ammo_tx_workspace_idx").on(table.workspaceId),
  index("ammo_tx_inventory_idx").on(table.ammoInventoryId),
  index("ammo_tx_employee_idx").on(table.employeeId),
  index("ammo_tx_created_at_idx").on(table.createdAt),
]);

export type WeaponInspection = typeof weaponInspections.$inferSelect;
export type WeaponQualification = typeof weaponQualifications.$inferSelect;
export type AmmoInventory = typeof ammoInventory.$inferSelect;
export type AmmoTransaction = typeof ammoTransactions.$inferSelect;

export const guardTours = pgTable("guard_tours", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  workspaceId: varchar("workspace_id").notNull(),
  name: varchar("name").notNull(),
  description: text("description"),
  clientId: varchar("client_id"),
  siteAddress: text("site_address"),
  assignedEmployeeId: varchar("assigned_employee_id"),
  status: guardTourStatusEnum("status").default("active"),
  intervalMinutes: integer("interval_minutes").default(60),
  startTime: time("start_time"),
  endTime: time("end_time"),
  daysOfWeek: text("days_of_week").array().default(sql`ARRAY[]::text[]`),
  createdBy: varchar("created_by"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => [
  index("guard_tours_workspace_idx").on(table.workspaceId),
  index("guard_tours_client_idx").on(table.clientId),
  index("guard_tours_employee_idx").on(table.assignedEmployeeId),
]);

export const guardTourCheckpoints = pgTable("guard_tour_checkpoints", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  tourId: varchar("tour_id").notNull(),
  workspaceId: varchar("workspace_id").notNull(),
  name: varchar("name").notNull(),
  description: text("description"),
  latitude: decimal("latitude", { precision: 10, scale: 7 }),
  longitude: decimal("longitude", { precision: 10, scale: 7 }),
  sortOrder: integer("sort_order").default(0),
  qrCode: varchar("qr_code"),
  nfcTagId: varchar("nfc_tag_id"),
  radiusMeters: integer("radius_meters").default(50),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),

  scanType: varchar("scan_type"),
  scannedAt: timestamp("scanned_at", { withTimezone: true }),
  scannedBy: varchar("scanned_by"),
  scanMethod: varchar("scan_method"),
  scanData: jsonb("scan_data"),
  checkpointType: varchar("checkpoint_type"),
}, (table) => [
  index("guard_checkpoints_tour_idx").on(table.tourId),
  index("guard_checkpoints_workspace_idx").on(table.workspaceId),
]);

export const guardTourScans = pgTable("guard_tour_scans", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  tourId: varchar("tour_id").notNull(),
  checkpointId: varchar("checkpoint_id").notNull(),
  workspaceId: varchar("workspace_id").notNull(),
  employeeId: varchar("employee_id").notNull(),
  scannedAt: timestamp("scanned_at").notNull().defaultNow(),
  latitude: decimal("latitude", { precision: 10, scale: 7 }),
  longitude: decimal("longitude", { precision: 10, scale: 7 }),
  status: guardTourScanStatusEnum("status").default("completed"),
  notes: text("notes"),
  photoUrl: text("photo_url"),
  scanMethod: varchar("scan_method").default("manual"),
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => [
  index("guard_scans_tour_idx").on(table.tourId),
  index("guard_scans_checkpoint_idx").on(table.checkpointId),
  index("guard_scans_employee_idx").on(table.employeeId),
  index("guard_scans_workspace_idx").on(table.workspaceId),
  index("guard_scans_time_idx").on(table.scannedAt),
]);

export const vehicles = pgTable("vehicles", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  workspaceId: varchar("workspace_id").notNull(),
  make: varchar("make").notNull(),
  model: varchar("model").notNull(),
  year: integer("year"),
  vin: varchar("vin"),
  licensePlate: varchar("license_plate"),
  status: varchar("status").default("active"),
  assignedEmployeeId: varchar("assigned_employee_id"),
  currentMileage: integer("current_mileage"),
  fuelType: varchar("fuel_type"),
  insuranceExpiry: timestamp("insurance_expiry"),
  registrationExpiry: timestamp("registration_expiry"),
  color: varchar("color"),
  notes: text("notes"),
  updatedAt: timestamp("updated_at").defaultNow(),

  createdAt: timestamp("created_at", { withTimezone: true }).default(sql`now()`),
  // TRINITY.md Section R / Law P1 — soft delete (vehicle record retained)
  deletedAt: timestamp("deleted_at"),
  deletedBy: varchar("deleted_by"),
}, (table) => [
  index("idx_vehicles_workspace").on(table.workspaceId),
  index("idx_vehicles_status").on(table.status),
  index("idx_vehicles_assigned").on(table.assignedEmployeeId),
]);

export const vehicleAssignments = pgTable("vehicle_assignments", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  vehicleId: varchar("vehicle_id").notNull(),
  employeeId: varchar("employee_id").notNull(),
  workspaceId: varchar("workspace_id").notNull(),
  checkoutDate: timestamp("checkout_date").defaultNow(),
  returnDate: timestamp("return_date"),
  startMileage: integer("start_mileage"),
  endMileage: integer("end_mileage"),
  purpose: text("purpose"),
  notes: text("notes"),
  updatedAt: timestamp("updated_at").defaultNow(),

  createdAt: timestamp("created_at", { withTimezone: true }).default(sql`now()`),
}, (table) => [
  index("idx_vehicle_assignments_vehicle").on(table.vehicleId),
  index("idx_vehicle_assignments_employee").on(table.employeeId),
  index("idx_vehicle_assignments_workspace").on(table.workspaceId),
]);

export const vehicleMaintenance = pgTable("vehicle_maintenance", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  vehicleId: varchar("vehicle_id").notNull(),
  workspaceId: varchar("workspace_id").notNull(),
  type: varchar("type").notNull(),
  date: timestamp("date").defaultNow(),
  cost: decimal("cost", { precision: 10, scale: 2 }),
  vendor: varchar("vendor"),
  notes: text("notes"),
  nextDueDate: timestamp("next_due_date"),
  nextDueMileage: integer("next_due_mileage"),
  updatedAt: timestamp("updated_at").defaultNow(),

  createdAt: timestamp("created_at", { withTimezone: true }).default(sql`now()`),
}, (table) => [
  index("idx_vehicle_maintenance_vehicle").on(table.vehicleId),
  index("idx_vehicle_maintenance_workspace").on(table.workspaceId),
  index("idx_vehicle_maintenance_next_due").on(table.nextDueDate),
]);

export const panicAlerts = pgTable("panic_alerts", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  workspaceId: varchar("workspace_id").notNull(),
  employeeId: varchar("employee_id"),
  siteId: varchar("site_id"),
  alertType: varchar("alert_type").default('panic'),
  status: varchar("status").default('active'),
  latitude: numeric("latitude", { precision: 10, scale: 6 }),
  longitude: numeric("longitude", { precision: 10, scale: 6 }),
  message: text("message"),
  resolvedAt: timestamp("resolved_at"),
  resolvedBy: varchar("resolved_by"),
  metadata: jsonb("metadata"),
  createdAt: timestamp("created_at").defaultNow(),

  alertNumber: varchar("alert_number"),
  employeeName: varchar("employee_name"),
  siteName: varchar("site_name"),
  locationAccuracy: decimal("location_accuracy"),
  triggeredAt: timestamp("triggered_at").default(sql`now()`),
});

export const loneWorkerSessions = pgTable("lone_worker_sessions", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  workspaceId: varchar("workspace_id").notNull(),
  employeeId: varchar("employee_id").notNull(),
  shiftId: varchar("shift_id"),
  status: varchar("status").default('active'),
  checkInInterval: integer("check_in_interval").default(30),
  lastCheckIn: timestamp("last_check_in"),
  nextCheckInDue: timestamp("next_check_in_due"),
  latitude: numeric("latitude", { precision: 10, scale: 6 }),
  longitude: numeric("longitude", { precision: 10, scale: 6 }),
  endedAt: timestamp("ended_at"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const boloAlerts = pgTable("bolo_alerts", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  workspaceId: varchar("workspace_id").notNull(),
  subjectName: varchar("subject_name").notNull(),
  subjectDob: varchar("subject_dob"),
  subjectDescription: text("subject_description"),
  photoUrl: varchar("photo_url"),
  reason: text("reason").notNull(),
  isActive: boolean("is_active").default(true),
  expiresAt: timestamp("expires_at"),
  createdById: varchar("created_by_id"),
  createdByName: varchar("created_by_name"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => [
  index("bolo_alerts_workspace_idx").on(table.workspaceId),
]);

export const lostFoundItems = pgTable("lost_found_items", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  workspaceId: varchar("workspace_id").notNull(),
  siteId: varchar("site_id"),
  reportedBy: varchar("reported_by"),
  itemDescription: text("item_description").notNull(),
  category: varchar("category"),
  status: varchar("status").default('found'),
  claimedBy: varchar("claimed_by"),
  claimedAt: timestamp("claimed_at"),
  storedLocation: varchar("stored_location"),
  metadata: jsonb("metadata"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),

  itemNumber: varchar("item_number"),
  siteName: varchar("site_name"),
  foundLocation: varchar("found_location"),
  foundByEmployeeId: varchar("found_by_employee_id"),
  foundByName: varchar("found_by_name"),
  foundAt: timestamp("found_at").default(sql`now()`),
  notes: text("notes"),
});

export const visitorLogs = pgTable("visitor_logs", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  workspaceId: varchar("workspace_id").notNull(),
  siteId: varchar("site_id"),
  siteName: varchar("site_name").notNull(),
  visitorName: varchar("visitor_name").notNull(),
  visitorCompany: varchar("visitor_company"),
  visitorIdType: varchar("visitor_id_type"),
  visitorIdNumber: varchar("visitor_id_number"),
  visitorBadgeNumber: varchar("visitor_badge_number"),
  hostName: varchar("host_name"),
  hostEmployeeId: varchar("host_employee_id"),
  hostContact: varchar("host_contact"),
  purpose: varchar("purpose"),
  // visitor_type: guest|vendor|contractor|employee|delivery|law_enforcement|other
  visitorType: varchar("visitor_type").default("guest"),
  vehiclePlate: varchar("vehicle_plate"),
  vehicleDescription: varchar("vehicle_description"),
  checkedInAt: timestamp("checked_in_at").defaultNow().notNull(),
  checkedOutAt: timestamp("checked_out_at"),
  checkedInBy: varchar("checked_in_by"),
  checkedOutBy: varchar("checked_out_by"),
  notes: text("notes"),
  photoUrl: varchar("photo_url"),
  createdAt: timestamp("created_at").defaultNow(),
  idPhotoUrl: varchar("id_photo_url"),
  vehicleFrontPhotoUrl: varchar("vehicle_front_photo_url"),
  vehicleRearPhotoUrl: varchar("vehicle_rear_photo_url"),
  visitorPhotoUrl: varchar("visitor_photo_url"),
  expectedDeparture: timestamp("expected_departure"),
  alertSent: boolean("alert_sent").default(false),
  // Phase 35I additions
  preRegistrationId: varchar("pre_registration_id"),
  isBanned: boolean("is_banned").default(false),
  isFastTrack: boolean("is_fast_track").default(false),
}, (table) => [
  index("visitor_logs_workspace_idx").on(table.workspaceId),
  index("visitor_logs_site_idx").on(table.siteId),
  index("visitor_logs_active_idx").on(table.workspaceId, table.checkedOutAt),
]);

export type VisitorLog = typeof visitorLogs.$inferSelect;

// ─── PHASE 35I: VISITOR PRE-REGISTRATIONS ────────────────────────────────────
export const visitorPreRegistrations = pgTable("visitor_pre_registrations", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  workspaceId: varchar("workspace_id").notNull(),
  clientId: varchar("client_id"),
  siteId: varchar("site_id"),
  siteName: varchar("site_name").notNull(),
  expectedVisitorName: varchar("expected_visitor_name").notNull(),
  expectedVisitorCompany: varchar("expected_visitor_company"),
  // visitor_type: guest|vendor|contractor|employee|delivery|law_enforcement|other
  visitorType: varchar("visitor_type").default("guest"),
  expectedArrival: timestamp("expected_arrival").notNull(),
  expectedDeparture: timestamp("expected_departure"),
  hostName: varchar("host_name"),
  hostContact: varchar("host_contact"),
  reason: text("reason"),
  // status: pending|checked_in|completed|cancelled
  status: varchar("status").default("pending").notNull(),
  notes: text("notes"),
  submittedBy: varchar("submitted_by"),
  submittedByName: varchar("submitted_by_name"),
  checkedInLogId: varchar("checked_in_log_id"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => [
  index("visitor_pre_reg_workspace_idx").on(table.workspaceId),
  index("visitor_pre_reg_client_idx").on(table.clientId),
  index("visitor_pre_reg_status_idx").on(table.status),
  index("visitor_pre_reg_arrival_idx").on(table.expectedArrival),
]);

export type VisitorPreRegistration = typeof visitorPreRegistrations.$inferSelect;

export const cadCalls = pgTable("cad_calls", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  workspaceId: varchar("workspace_id").notNull(),
  callNumber: varchar("call_number").notNull(),
  callType: varchar("call_type").notNull(),
  priority: integer("priority"),
  status: varchar("status").notNull(),
  siteId: varchar("site_id"),
  siteName: varchar("site_name"),
  locationDescription: text("location_description"),
  callerName: varchar("caller_name"),
  callerPhone: varchar("caller_phone"),
  callerType: varchar("caller_type"),
  incidentDescription: text("incident_description"),
  dispatchedUnits: jsonb("dispatched_units"),
  primaryUnitId: varchar("primary_unit_id"),
  receivedAt: timestamp("received_at"),
  dispatchedAt: timestamp("dispatched_at"),
  onSceneAt: timestamp("on_scene_at"),
  resolvedAt: timestamp("resolved_at"),
  closedAt: timestamp("closed_at"),
  resolutionCode: varchar("resolution_code"),
  resolutionNotes: text("resolution_notes"),
  incidentReportId: varchar("incident_report_id"),
  createdBy: varchar("created_by"),
  latitude: doublePrecision("latitude"),
  longitude: doublePrecision("longitude"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const cadUnits = pgTable("cad_units", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  workspaceId: varchar("workspace_id").notNull(),
  unitIdentifier: varchar("unit_identifier").notNull(),
  employeeId: varchar("employee_id"),
  employeeName: varchar("employee_name"),
  currentStatus: varchar("current_status").default("available"),
  currentCallId: varchar("current_call_id"),
  currentSiteId: varchar("current_site_id"),
  currentSiteName: varchar("current_site_name"),
  radioChannel: varchar("radio_channel"),
  vehicleId: varchar("vehicle_id"),
  latitude: doublePrecision("latitude"),
  longitude: doublePrecision("longitude"),
  lastLocationUpdate: timestamp("last_location_update"),
  notes: text("notes"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const cadDispatchLog = pgTable("cad_dispatch_log", {
  id: varchar("id").primaryKey(),
  workspaceId: varchar("workspace_id").notNull(),
  callId: varchar("call_id"),
  unitId: varchar("unit_id"),
  action: varchar("action").notNull(),
  actionBy: varchar("action_by"),
  actionByName: varchar("action_by_name"),
  notes: text("notes"),
  loggedAt: timestamp("logged_at").defaultNow(),
});

export const geofenceZones = pgTable("geofence_zones", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  workspaceId: varchar("workspace_id").notNull(),
  siteId: varchar("site_id"),
  siteName: varchar("site_name"),
  zoneName: varchar("zone_name").notNull(),
  zoneType: varchar("zone_type"),
  centerLat: doublePrecision("center_lat"),
  centerLng: doublePrecision("center_lng"),
  radiusMeters: integer("radius_meters"),
  polygonCoords: jsonb("polygon_coords"),
  isActive: boolean("is_active").default(true),
  alertOnExit: boolean("alert_on_exit").default(true),
  alertOnEntry: boolean("alert_on_entry").default(false),
  alertDelaySeconds: integer("alert_delay_seconds").default(0),
  assignedEmployeeIds: jsonb("assigned_employee_ids"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const geofenceDepartureLog = pgTable("geofence_departure_log", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  workspaceId: varchar("workspace_id").notNull(),
  employeeId: varchar("employee_id").notNull(),
  employeeName: varchar("employee_name"),
  siteId: varchar("site_id"),
  siteName: varchar("site_name"),
  unitId: varchar("unit_id"),
  departedAt: timestamp("departed_at"),
  acknowledgedAt: timestamp("acknowledged_at"),
  acknowledgedBy: varchar("acknowledged_by"),
  overrideReason: text("override_reason"),
  returnedAt: timestamp("returned_at"),
});

export const escalationChains = pgTable("escalation_chains", {
  id: varchar("id").primaryKey(),
  workspaceId: varchar("workspace_id").notNull(),
  currentTier: integer("current_tier"),
  unfilledPositions: integer("unfilled_positions"),
  totalPositions: integer("total_positions"),
  startedAt: timestamp("started_at"),
  lastEscalatedAt: timestamp("last_escalated_at"),
  notifiedEmployeeIds: text("notified_employee_ids").array(),
  notifiedManagerIds: text("notified_manager_ids").array(),
  status: varchar("status").default("active"),
});

export const keyControlLogs = pgTable("key_control_logs", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  workspaceId: varchar("workspace_id").notNull(),
  siteId: varchar("site_id"),
  siteName: varchar("site_name"),
  keyIdentifier: varchar("key_identifier").notNull(),
  keyDescription: varchar("key_description"),
  checkedOutByEmployeeId: varchar("checked_out_by_employee_id"),
  checkedOutByName: varchar("checked_out_by_name"),
  checkedOutAt: timestamp("checked_out_at").defaultNow(),
  expectedReturnAt: timestamp("expected_return_at"),
  returnedAt: timestamp("returned_at"),
  returnedTo: varchar("returned_to"),
  purpose: text("purpose"),

  notes: text("notes"),
  isOverdue: boolean("is_overdue").default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).default(sql`now()`),
  updatedAt: timestamp("updated_at", { withTimezone: true }).default(sql`now()`),
});

export const evidenceItems = pgTable("evidence_items", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  workspaceId: varchar("workspace_id").notNull(),
  caseId: varchar("case_id"),
  itemNumber: varchar("item_number"),
  description: text("description"),
  category: varchar("category"),
  storageLocation: varchar("storage_location"),
  photoUrls: jsonb("photo_urls"),
  status: varchar("status").default("received"),
  policeCaseNumber: varchar("police_case_number"),
  currentCustodianName: varchar("current_custodian_name"),
  createdByByName: varchar("created_by_name"),
  createdAt: timestamp("created_at").defaultNow(),

  updatedAt: timestamp("updated_at", { withTimezone: true }).default(sql`now()`),
});

export const evidenceCustodyLog = pgTable("evidence_custody_log", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  evidenceId: varchar("evidence_id").notNull(),
  workspaceId: varchar("workspace_id").notNull(),
  transferredFromName: varchar("transferred_from_name"),
  transferredToName: varchar("transferred_to_name"),
  method: varchar("method"),
  notes: text("notes"),
  policeCaseNumber: varchar("police_case_number"),
  transferredAt: timestamp("transferred_at").defaultNow(),
  createdAt: timestamp("created_at").defaultNow(),
});

export const incidentReportActivity = pgTable("incident_report_activity", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  workspaceId: varchar("workspace_id"),
  incidentId: varchar("incident_id").notNull(),
  action: varchar("action").notNull(),
  performedBy: varchar("performed_by"),
  performedByRole: varchar("performed_by_role"),
  details: text("details"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const trespassNotices = pgTable("trespass_notices", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  workspaceId: varchar("workspace_id").notNull(),
  noticeNumber: varchar("notice_number"),
  siteId: varchar("site_id"),
  siteName: varchar("site_name"),
  subjectName: varchar("subject_name"),
  subjectDob: date("subject_dob"),
  subjectDescription: text("subject_description"),
  reason: text("reason"),
  issuedAt: timestamp("issued_at").defaultNow(),
  issuedByEmployeeId: varchar("issued_by_employee_id"),
  issuedByName: varchar("issued_by_name"),
  validUntil: date("valid_until"),
  isPermanent: boolean("is_permanent").default(false),
  witnessName: varchar("witness_name"),
  policeNotified: boolean("police_notified").default(false),
  policeReportNumber: varchar("police_report_number"),
  status: varchar("status").default("active"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const dailyActivityReports = pgTable("daily_activity_reports", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  workspaceId: varchar("workspace_id").notNull(),
  reportNumber: varchar("report_number"),
  employeeId: varchar("employee_id"),
  employeeName: varchar("employee_name"),
  siteId: varchar("site_id"),
  siteName: varchar("site_name"),
  shiftId: varchar("shift_id"),
  shiftDate: date("shift_date"),
  shiftStart: varchar("shift_start"),
  shiftEnd: varchar("shift_end"),
  activitySummary: text("activity_summary"),
  incidentsOccurred: boolean("incidents_occurred").default(false),
  weatherConditions: varchar("weather_conditions"),
  patrolCount: integer("patrol_count"),
  vehicleChecks: integer("vehicle_checks"),
  notes: text("notes"),
  status: varchar("status").default("draft"),
  submittedAt: timestamp("submitted_at"),
  createdBy: varchar("created_by"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),

  incidentReportIds: jsonb("incident_report_ids").default('[]'),
  equipmentChecked: boolean("equipment_checked").default(true),
  equipmentNotes: text("equipment_notes"),
  visitorCount: integer("visitor_count").default(0),
  patrolRoundsCompleted: integer("patrol_rounds_completed").default(0),
  postOrdersFollowed: boolean("post_orders_followed").default(true),
  postOrdersNotes: text("post_orders_notes"),
  photos: jsonb("photos").default('[]'),
  aiSummary: text("ai_summary"),
  pdfUrl: text("pdf_url"),
  pdfGeneratedAt: timestamp("pdf_generated_at", { withTimezone: true }),
  supervisorId: varchar("supervisor_id"),
  supervisorReviewAt: timestamp("supervisor_review_at", { withTimezone: true }),
  trinityArticulated: boolean("trinity_articulated").default(false),
});

export const slaBreachLog = pgTable("sla_breach_log", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  workspaceId: varchar("workspace_id").notNull(),
  slaContractId: varchar("sla_contract_id"),
  clientName: varchar("client_name"),
  breachType: varchar("breach_type"),
  description: text("description"),
  severity: varchar("severity").default("medium"),
  detectedAt: timestamp("detected_at"),
  resolvedAt: timestamp("resolved_at"),
  clientNotified: boolean("client_notified").default(false),
  notifiedAt: timestamp("notified_at"),
  resolutionNotes: text("resolution_notes"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const anonymousReports = pgTable("anonymous_reports", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  workspaceId: varchar("workspace_id").notNull(),
  reportCode: varchar("report_code"),
  category: varchar("category"),
  severity: varchar("severity"),
  description: text("description").notNull(),
  siteName: varchar("site_name"),
  occurredAt: timestamp("occurred_at"),
  aiTriageCategory: varchar("ai_triage_category"),
  aiSeverityScore: integer("ai_severity_score"),
  aiRouting: varchar("ai_routing"),
  aiSummary: text("ai_summary"),
  status: varchar("status").default("pending"),
  followUpToken: varchar("follow_up_token"),
  reporterEmail: varchar("reporter_email"),
  resolution: text("resolution"),
  assignedTo: varchar("assigned_to"),
  resolvedAt: timestamp("resolved_at"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const orchestratedSwapRequests = pgTable("orchestrated_swap_requests", {
  id: varchar("id").primaryKey(),
  workspaceId: varchar("workspace_id").notNull(),
  requestData: jsonb("request_data"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const errorEvents = pgTable("error_events", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  fingerprint: varchar("fingerprint", { length: 64 }).notNull(),
  message: text("message").notNull(),
  severity: varchar("severity", { length: 20 }).notNull(),
  source: varchar("source", { length: 50 }).notNull(),
  stack: text("stack"),
  context: jsonb("context").default(sql`'{}'::jsonb`),
  tags: jsonb("tags").default(sql`'{}'::jsonb`),
  occurrenceCount: integer("occurrence_count").default(1).notNull(),
  firstSeen: timestamp("first_seen", { withTimezone: true }).defaultNow().notNull(),
  lastSeen: timestamp("last_seen", { withTimezone: true }).defaultNow().notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  occurrenceData: jsonb("occurrence_data").default(sql`'{}'::jsonb`),
}, (table) => [
  index("error_events_fingerprint_idx").on(table.fingerprint),
  index("error_events_severity_idx").on(table.severity),
  index("error_events_last_seen_idx").on(table.lastSeen),
]);

export const errorOccurrences = pgTable("error_occurrences", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  fingerprint: varchar("fingerprint", { length: 64 }).notNull(),
  context: jsonb("context").default(sql`'{}'::jsonb`),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
}, (table) => [
  index("error_occurrences_fingerprint_idx").on(table.fingerprint),
  index("error_occurrences_created_idx").on(table.createdAt),
]);

// ── platform_exceptions ────────────────────────────────────────────────────
// Cross-domain exception log for orchestration failures and system errors.
// Written by crossDomainExceptionService.ts with graceful fallback.
export const platformExceptions = pgTable("platform_exceptions", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  workspaceId: varchar("workspace_id"),
  exceptionType: varchar("exception_type", { length: 100 }),
  exceptionData: jsonb("exception_data"),
  source: varchar("source", { length: 255 }),
  severity: varchar("severity", { length: 30 }).default('error'),
  resolved: boolean("resolved").default(false),
  resolvedAt: timestamp("resolved_at"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => [
  index("platform_exceptions_workspace_idx").on(table.workspaceId),
  index("platform_exceptions_type_idx").on(table.exceptionType),
  index("platform_exceptions_created_idx").on(table.createdAt),
]);

// ── dashboard_layouts ──────────────────────────────────────────────────────
// Persists per-user widget layout preferences for the dashboard.
// Upserted on (workspace_id, user_id) — one layout per user per workspace.
export const dashboardLayouts = pgTable("dashboard_layouts", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  workspaceId: varchar("workspace_id").notNull(),
  userId: varchar("user_id").notNull(),
  layoutConfig: jsonb("layout_config").notNull().default(sql`'[]'`),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => [
  uniqueIndex("dashboard_layouts_ws_user_idx").on(table.workspaceId, table.userId),
  index("dashboard_layouts_workspace_idx").on(table.workspaceId),
]);

// ── welfare_checks ─────────────────────────────────────────────────────────
// Persistent store for lone-worker welfare checks.
// Ensures active checks survive server restarts (replaces volatile in-memory Maps).
export const welfareChecks = pgTable("welfare_checks", {
  id: varchar("id").primaryKey(),
  workspaceId: varchar("workspace_id").notNull(),
  employeeId: varchar("employee_id").notNull(),
  employeeName: varchar("employee_name", { length: 255 }),
  shiftId: varchar("shift_id"),
  sentAt: timestamp("sent_at").notNull(),
  deadline: timestamp("deadline").notNull(),
  acknowledged: boolean("acknowledged").default(false),
  acknowledgedAt: timestamp("acknowledged_at"),
  escalationLevel: varchar("escalation_level", { length: 50 }),
  escalatedAt: timestamp("escalated_at"),
  resolved: boolean("resolved").default(false),
  resolvedAt: timestamp("resolved_at"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => [
  index("welfare_checks_workspace_idx").on(table.workspaceId),
  index("welfare_checks_employee_idx").on(table.employeeId),
  index("welfare_checks_resolved_idx").on(table.resolved),
]);

// ─── GROUP 5 PHASE 35D: WORK ORDER MANAGEMENT ───────────────────────────────
export const workOrders = pgTable("work_orders", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  workspaceId: varchar("workspace_id").notNull(),
  clientId: varchar("client_id"),
  title: varchar("title").notNull(),
  // work_order_type: special_assignment|escort|investigation|event_security|emergency_deployment|other
  workOrderType: varchar("work_order_type").notNull().default("special_assignment"),
  // status: draft|pending_assignment|active|completed|cancelled|billed
  status: varchar("status").notNull().default("draft"),
  description: text("description"),
  location: text("location"),
  requiredCertifications: text("required_certifications").array().default(sql`ARRAY[]::text[]`),
  estimatedHours: decimal("estimated_hours", { precision: 8, scale: 2 }),
  actualHours: decimal("actual_hours", { precision: 8, scale: 2 }),
  billingRate: decimal("billing_rate", { precision: 10, scale: 2 }),
  billingAmount: decimal("billing_amount", { precision: 12, scale: 2 }),
  assignedOfficerIds: text("assigned_officer_ids").array().default(sql`ARRAY[]::text[]`),
  scheduledStart: timestamp("scheduled_start"),
  scheduledEnd: timestamp("scheduled_end"),
  actualStart: timestamp("actual_start"),
  actualEnd: timestamp("actual_end"),
  clientSignedAt: timestamp("client_signed_at"),
  clientSignedBy: varchar("client_signed_by"),
  invoiceId: varchar("invoice_id"),
  createdBy: varchar("created_by"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => [
  index("work_orders_workspace_idx").on(table.workspaceId),
  index("work_orders_client_idx").on(table.clientId),
  index("work_orders_status_idx").on(table.status),
  index("work_orders_scheduled_idx").on(table.scheduledStart),
]);
export type WorkOrder = typeof workOrders.$inferSelect;

export const workOrderEvidence = pgTable("work_order_evidence", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  workOrderId: varchar("work_order_id").notNull(),
  workspaceId: varchar("workspace_id").notNull(),
  // evidence_type: photo|document|note
  evidenceType: varchar("evidence_type").notNull().default("photo"),
  fileUrl: text("file_url"),
  sha256Hash: varchar("sha256_hash"),
  capturedBy: varchar("captured_by"),
  capturedAt: timestamp("captured_at").defaultNow(),
  notes: text("notes"),
}, (table) => [
  index("work_order_evidence_order_idx").on(table.workOrderId),
  index("work_order_evidence_workspace_idx").on(table.workspaceId),
]);
export type WorkOrderEvidence = typeof workOrderEvidence.$inferSelect;

// ─── GROUP 5 PHASE 35E: PATROL TOURS ─────────────────────────────────────────
// guardTours → patrol routes, guardTourCheckpoints → patrol checkpoints
// guardTourScans → patrol checkpoint scans
// patrol_tours is the new "instance of completing a route" table
export const patrolTours = pgTable("patrol_tours", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  patrolRouteId: varchar("patrol_route_id").notNull(), // references guard_tours.id
  workspaceId: varchar("workspace_id").notNull(),
  officerId: varchar("officer_id").notNull(),
  shiftId: varchar("shift_id"),
  // status: in_progress|completed|incomplete|missed
  status: varchar("status").notNull().default("in_progress"),
  startedAt: timestamp("started_at").defaultNow(),
  completedAt: timestamp("completed_at"),
  completionPercentage: decimal("completion_percentage", { precision: 5, scale: 2 }).default("0"),
  missedCheckpointIds: text("missed_checkpoint_ids").array().default(sql`ARRAY[]::text[]`),
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => [
  index("patrol_tours_route_idx").on(table.patrolRouteId),
  index("patrol_tours_workspace_idx").on(table.workspaceId),
  index("patrol_tours_officer_idx").on(table.officerId),
  index("patrol_tours_status_idx").on(table.status),
]);
export type PatrolTour = typeof patrolTours.$inferSelect;


// ─────────────────────────────────────────────────────────────────────────────
// Canonical Configuration Values System
// Platform-wide and workspace-scoped lookup/enum value catalog.
// root_admin manages system values; workspace owners can add workspace-scoped extensions.
// ─────────────────────────────────────────────────────────────────────────────

export const platformConfigGroups = pgTable("platform_config_groups", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()::text`),
  groupKey: varchar("group_key", { length: 100 }).notNull().unique(),
  label: varchar("label", { length: 200 }).notNull(),
  description: text("description"),
  domain: varchar("domain", { length: 100 }),
  tableName: varchar("table_name", { length: 100 }),
  columnName: varchar("column_name", { length: 100 }),
  isExtendable: boolean("is_extendable").notNull().default(true),
  isSystem: boolean("is_system").notNull().default(true),
  sortOrder: integer("sort_order").notNull().default(0),
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => [
  index("pcg_group_key_idx").on(table.groupKey),
  index("pcg_domain_idx").on(table.domain),
]);

export type PlatformConfigGroup = typeof platformConfigGroups.$inferSelect;

export const platformConfigValues = pgTable("platform_config_values", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()::text`),
  groupKey: varchar("group_key", { length: 100 }).notNull(),
  value: varchar("value", { length: 200 }).notNull(),
  label: varchar("label", { length: 200 }).notNull(),
  description: text("description"),
  color: varchar("color", { length: 50 }),
  icon: varchar("icon", { length: 50 }),
  sortOrder: integer("sort_order").notNull().default(0),
  isActive: boolean("is_active").notNull().default(true),
  isSystem: boolean("is_system").notNull().default(true),
  workspaceId: varchar("workspace_id"),
  metadata: jsonb("metadata").$type<Record<string, any>>(),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => [
  index("pcv_group_key_idx").on(table.groupKey),
  index("pcv_workspace_idx").on(table.workspaceId),
  index("pcv_active_idx").on(table.isActive),
  index("pcv_group_workspace_idx").on(table.groupKey, table.workspaceId),
]);

export type PlatformConfigValue = typeof platformConfigValues.$inferSelect;

export * from './extended';
