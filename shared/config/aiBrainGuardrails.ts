/**
 * AI Brain Guardrails & Logic Tools Configuration
 * Central dynamic configuration for all AI automation rules, constraints, and decision logic
 * No hardcoded values - all configurable via environment variables
 */

export interface GuardrailRule {
  id: string;
  name: string;
  description: string;
  enabled: boolean;
  condition: string; // Logic to evaluate
  action: string; // Action to take when condition is met
  severity: "info" | "warning" | "error" | "critical";
  requiresApproval: boolean;
  maxRetries: number;
}

export interface NotificationRule {
  id: string;
  name: string;
  enabled: boolean;
  triggerType: string;
  requiredRoles: string[];
  channels: ("email" | "in-app" | "webhook" | "sms")[];
  priority: "low" | "medium" | "high" | "urgent";
  template: string;
}

export interface IssueDetectionRule {
  id: string;
  name: string;
  description: string;
  enabled: boolean;
  dataTypes: string[]; // Which document types trigger this
  conditions: Array<{
    field: string;
    operator: "equals" | "contains" | "greaterThan" | "lessThan" | "missingField" | "malformed";
    value: string | number;
  }>;
  severity: "info" | "warning" | "critical";
  suggestedAction: string;
}

export interface RBACNotificationConfig {
  role: string;
  canNotify: boolean;
  notificationTypes: string[];
  canApproveAutomation: boolean;
  canEditGuardrails: boolean;
  canViewIssues: boolean;
  escalationPath: string[]; // Who to escalate to
}

// DYNAMIC GUARDRAILS - Configure via environment variables
const guardrailsConfig = {
  // Document Extraction Guardrails
  documentExtraction: {
    maxFileSizeBytes: parseInt(process.env.AI_GUARDRAIL_MAX_FILE_SIZE || "52428800"), // 50MB default
    maxBatchSize: parseInt(process.env.AI_GUARDRAIL_MAX_BATCH_SIZE || "100"),
    confidenceThreshold: parseFloat(process.env.AI_GUARDRAIL_MIN_CONFIDENCE || "0.75"),
    requiredFieldsRatio: parseFloat(process.env.AI_GUARDRAIL_REQUIRED_FIELDS_RATIO || "0.8"),
    allowedDocumentTypes: (process.env.AI_GUARDRAIL_ALLOWED_DOC_TYPES || "contract,invoice,employee_record,client_data,financial_statement").split(","),
    maxExtractionTimeSeconds: parseInt(process.env.AI_GUARDRAIL_MAX_EXTRACTION_TIME || "120"),
  },

  // Data Migration Guardrails
  dataMigration: {
    requiresApprovalAboveCount: parseInt(process.env.AI_GUARDRAIL_APPROVAL_ABOVE_COUNT || "50"),
    autoApproveBelow: parseInt(process.env.AI_GUARDRAIL_AUTO_APPROVE_COUNT || "10"),
    allowedEntityTypes: (process.env.AI_GUARDRAIL_ALLOWED_ENTITIES || "employee,client,vendor,invoice,schedule").split(","),
    validateDataIntegrity: process.env.AI_GUARDRAIL_VALIDATE_INTEGRITY !== "false",
    preventDuplicates: process.env.AI_GUARDRAIL_PREVENT_DUPLICATES !== "false",
    matchingThreshold: parseFloat(process.env.AI_GUARDRAIL_MATCHING_THRESHOLD || "0.85"),
  },

  // AI Automation Guardrails
  automation: {
    maxConcurrentTasks: parseInt(process.env.AI_GUARDRAIL_MAX_CONCURRENT || "5"),
    rateLimit: {
      requestsPerMinute: parseInt(process.env.AI_GUARDRAIL_RATE_LIMIT || "100"),
      requestsPerHour: parseInt(process.env.AI_GUARDRAIL_RATE_LIMIT_HOUR || "5000"),
    },
    requiresApproval: process.env.AI_GUARDRAIL_APPROVAL_REQUIRED === "true",
    rollbackOnError: process.env.AI_GUARDRAIL_ROLLBACK_ON_ERROR !== "false",
    auditAllOperations: process.env.AI_GUARDRAIL_AUDIT !== "false",
  },

  // Issue Detection Guardrails
  issueDetection: {
    enabled: process.env.AI_GUARDRAIL_ISSUE_DETECTION !== "false",
    severityLevels: ["info", "warning", "critical"],
    autoEscalateOn: (process.env.AI_GUARDRAIL_AUTO_ESCALATE || "critical").split(","),
    detectionPatterns: {
      missingFields: process.env.AI_GUARDRAIL_DETECT_MISSING !== "false",
      malformedData: process.env.AI_GUARDRAIL_DETECT_MALFORMED !== "false",
      duplicateDetection: process.env.AI_GUARDRAIL_DETECT_DUPLICATES !== "false",
      anomalyDetection: process.env.AI_GUARDRAIL_DETECT_ANOMALIES !== "false",
    },
  },

  // Cost Control Guardrails
  costControl: {
    maxCreditsPerOperation: parseInt(process.env.AI_GUARDRAIL_MAX_CREDITS_OP || "1000"),
    monthlyBudgetLimit: parseInt(process.env.AI_GUARDRAIL_MONTHLY_BUDGET || "50000"),
    warnAboveThreshold: parseFloat(process.env.AI_GUARDRAIL_COST_WARNING || "0.8"),
  },
};

// RBAC Configuration - Role-based access and notification settings
const rbacConfig: Record<string, RBACNotificationConfig> = {
  admin: {
    role: "admin",
    canNotify: true,
    notificationTypes: ["all"],
    canApproveAutomation: true,
    canEditGuardrails: true,
    canViewIssues: true,
    escalationPath: ["ceo", "board"],
  },
  org_owner: {
    role: "org_owner",
    canNotify: true,
    notificationTypes: ["all"],
    canApproveAutomation: true,
    canEditGuardrails: false,
    canViewIssues: true,
    escalationPath: ["admin"],
  },
  manager: {
    role: "manager",
    canNotify: true,
    notificationTypes: ["migration_complete", "issue_detected", "guardrail_violation", "system", "platform_update"],
    canApproveAutomation: true,
    canEditGuardrails: false,
    canViewIssues: true,
    escalationPath: ["admin"],
  },
  employee: {
    role: "employee",
    canNotify: true,
    notificationTypes: ["migration_complete", "system", "platform_update"],
    canApproveAutomation: false,
    canEditGuardrails: false,
    canViewIssues: false,
    escalationPath: ["manager"],
  },
  viewer: {
    role: "viewer",
    canNotify: false,
    notificationTypes: [],
    canApproveAutomation: false,
    canEditGuardrails: false,
    canViewIssues: false,
    escalationPath: ["manager"],
  },
};

// DEFAULT NOTIFICATION RULES - Fully configurable
const notificationRulesConfig: NotificationRule[] = [
  {
    id: "doc_extract_complete",
    name: "Document Extraction Complete",
    enabled: process.env.NOTIFY_DOC_EXTRACT !== "false",
    triggerType: "document_extraction",
    requiredRoles: ["admin", "manager"],
    channels: ["email", "in-app"],
    priority: "medium",
    template: "Document {{documentName}} has been successfully extracted with {{fieldCount}} fields",
  },
  {
    id: "issue_detected_critical",
    name: "Critical Issue Detected",
    enabled: process.env.NOTIFY_CRITICAL_ISSUE !== "false",
    triggerType: "issue_detected",
    requiredRoles: ["admin", "manager"],
    channels: ["email", "in-app", "sms"],
    priority: "urgent",
    template: "CRITICAL: {{issueName}} detected in {{documentName}} - Immediate action required",
  },
  {
    id: "migration_complete",
    name: "Data Migration Complete",
    enabled: process.env.NOTIFY_MIGRATION !== "false",
    triggerType: "migration_complete",
    requiredRoles: ["admin", "manager", "employee"],
    channels: ["email", "in-app"],
    priority: "high",
    template: "{{entityCount}} {{entityType}} records successfully migrated",
  },
  {
    id: "guardrail_violation",
    name: "Guardrail Violation Detected",
    enabled: process.env.NOTIFY_GUARDRAIL !== "false",
    triggerType: "guardrail_violation",
    requiredRoles: ["admin", "manager"],
    channels: ["email", "in-app"],
    priority: "high",
    template: "Guardrail {{guardrailName}} was violated - {{violationDescription}}",
  },
  {
    id: "quota_warning",
    name: "Quota Warning",
    enabled: process.env.NOTIFY_QUOTA !== "false",
    triggerType: "quota_warning",
    requiredRoles: ["admin"],
    channels: ["email"],
    priority: "medium",
    template: "Usage at {{usagePercent}}% of monthly limit",
  },
  {
    id: "system_notification",
    name: "System Notification",
    enabled: process.env.NOTIFY_SYSTEM !== "false",
    triggerType: "system",
    requiredRoles: ["admin", "manager", "employee", "org_owner"],
    channels: ["in-app"],
    priority: "medium",
    template: "{{title}}: {{message}}",
  },
  {
    id: "platform_update",
    name: "Platform Update",
    enabled: process.env.NOTIFY_PLATFORM_UPDATE !== "false",
    triggerType: "platform_update",
    requiredRoles: ["admin", "manager", "employee", "org_owner"],
    channels: ["in-app"],
    priority: "low",
    template: "{{title}}: {{message}}",
  },
  {
    id: "schedule_published",
    name: "Schedule Published",
    enabled: process.env.NOTIFY_SCHEDULE_PUBLISHED !== "false",
    triggerType: "schedule_published",
    requiredRoles: ["org_owner", "co_owner", "manager", "supervisor"],
    channels: ["in-app"],
    priority: "medium",
    template: "{{title}}: {{message}}",
  },
  {
    id: "payroll_initiated",
    name: "Payroll Run Initiated",
    enabled: process.env.NOTIFY_PAYROLL_INITIATED !== "false",
    triggerType: "payroll_initiated",
    requiredRoles: ["org_owner", "co_owner", "manager"],
    channels: ["email", "in-app"],
    priority: "high",
    template: "{{title}}: {{message}}",
  },
  {
    id: "compliance_violation",
    name: "Compliance Violation",
    enabled: process.env.NOTIFY_COMPLIANCE_VIOLATION !== "false",
    triggerType: "compliance_violation",
    requiredRoles: ["org_owner", "co_owner", "manager", "supervisor"],
    channels: ["email", "in-app"],
    priority: "urgent",
    template: "{{title}}: {{message}}",
  },

  // ── SECURITY & SYSTEM ALERTS ─────────────────────────────────────────────
  {
    id: "billing_failure",
    name: "Billing Failure",
    enabled: true,
    triggerType: "billing_failure",
    requiredRoles: ["org_owner", "co_owner"],
    channels: ["email", "in-app"],
    priority: "urgent",
    template: "{{title}}: {{message}}",
  },
  {
    id: "security_alert",
    name: "Security Alert",
    enabled: true,
    triggerType: "security_alert",
    requiredRoles: ["org_owner", "co_owner"],
    channels: ["email", "in-app"],
    priority: "urgent",
    template: "{{title}}: {{message}}",
  },
  {
    id: "panic_alert",
    name: "Panic Alert",
    enabled: true,
    triggerType: "panic_alert",
    requiredRoles: ["org_owner", "co_owner", "manager", "supervisor"],
    channels: ["email", "in-app", "sms"],
    priority: "urgent",
    template: "{{title}}: {{message}}",
  },
  {
    id: "system_error",
    name: "System Error",
    enabled: true,
    triggerType: "system_error",
    requiredRoles: ["org_owner", "co_owner"],
    channels: ["email", "in-app"],
    priority: "urgent",
    template: "{{title}}: {{message}}",
  },

  // ── EXECUTIVE ────────────────────────────────────────────────────────────
  {
    id: "critical_alert",
    name: "Critical Alert",
    enabled: true,
    triggerType: "critical_alert",
    requiredRoles: ["org_owner", "co_owner"],
    channels: ["email", "in-app", "sms"],
    priority: "urgent",
    template: "{{title}}: {{message}}",
  },
  {
    id: "staffing_critical_escalation",
    name: "Staffing Critical Escalation",
    enabled: true,
    triggerType: "staffing_critical_escalation",
    requiredRoles: ["org_owner", "co_owner"],
    channels: ["email", "in-app"],
    priority: "urgent",
    template: "{{title}}: {{message}}",
  },
  {
    id: "payment_overdue",
    name: "Payment Overdue",
    enabled: true,
    triggerType: "payment_overdue",
    requiredRoles: ["org_owner", "co_owner"],
    channels: ["email", "in-app"],
    priority: "urgent",
    template: "{{title}}: {{message}}",
  },
  {
    id: "payroll_processed",
    name: "Payroll Processed",
    enabled: true,
    triggerType: "payroll_processed",
    requiredRoles: ["org_owner", "co_owner"],
    channels: ["email", "in-app"],
    priority: "high",
    template: "{{title}}: {{message}}",
  },
  {
    id: "credit_warning",
    name: "Credit Warning",
    enabled: true,
    triggerType: "credit_warning",
    requiredRoles: ["org_owner", "co_owner"],
    channels: ["email", "in-app"],
    priority: "high",
    template: "{{title}}: {{message}}",
  },

  // ── MANAGEMENT / FINANCIAL ───────────────────────────────────────────────
  {
    id: "invoice_generated",
    name: "Invoice Generated",
    enabled: true,
    triggerType: "invoice_generated",
    requiredRoles: ["org_owner", "co_owner", "manager"],
    channels: ["email", "in-app"],
    priority: "medium",
    template: "{{title}}: {{message}}",
  },
  {
    id: "invoice_paid",
    name: "Invoice Paid",
    enabled: true,
    triggerType: "invoice_paid",
    requiredRoles: ["org_owner", "co_owner", "manager"],
    channels: ["email", "in-app"],
    priority: "medium",
    template: "{{title}}: {{message}}",
  },
  {
    id: "invoice_overdue",
    name: "Invoice Overdue",
    enabled: true,
    triggerType: "invoice_overdue",
    requiredRoles: ["org_owner", "co_owner", "manager"],
    channels: ["email", "in-app"],
    priority: "high",
    template: "{{title}}: {{message}}",
  },
  {
    id: "payment_received",
    name: "Payment Received",
    enabled: true,
    triggerType: "payment_received",
    requiredRoles: ["org_owner", "co_owner", "manager"],
    channels: ["in-app"],
    priority: "medium",
    template: "{{title}}: {{message}}",
  },
  {
    id: "payroll_pending",
    name: "Payroll Pending Review",
    enabled: true,
    triggerType: "payroll_pending",
    requiredRoles: ["org_owner", "co_owner", "manager"],
    channels: ["email", "in-app"],
    priority: "high",
    template: "{{title}}: {{message}}",
  },
  {
    id: "staffing_escalation",
    name: "Staffing Escalation",
    enabled: true,
    triggerType: "staffing_escalation",
    requiredRoles: ["org_owner", "co_owner", "manager"],
    channels: ["email", "in-app"],
    priority: "high",
    template: "{{title}}: {{message}}",
  },
  {
    id: "approval_required",
    name: "Approval Required",
    enabled: true,
    triggerType: "approval_required",
    requiredRoles: ["org_owner", "co_owner", "manager"],
    channels: ["in-app"],
    priority: "high",
    template: "{{title}}: {{message}}",
  },
  {
    id: "ai_approval_needed",
    name: "AI Action Awaiting Approval",
    enabled: true,
    triggerType: "ai_approval_needed",
    requiredRoles: ["org_owner", "co_owner", "manager"],
    channels: ["in-app"],
    priority: "high",
    template: "{{title}}: {{message}}",
  },
  {
    id: "ai_action_completed",
    name: "AI Action Completed",
    enabled: true,
    triggerType: "ai_action_completed",
    requiredRoles: ["org_owner", "co_owner", "manager"],
    channels: ["in-app"],
    priority: "medium",
    template: "{{title}}: {{message}}",
  },
  {
    id: "ai_schedule_ready",
    name: "AI Schedule Ready for Review",
    enabled: true,
    triggerType: "ai_schedule_ready",
    requiredRoles: ["org_owner", "co_owner", "manager"],
    channels: ["email", "in-app"],
    priority: "high",
    template: "{{title}}: {{message}}",
  },
  {
    id: "dispute_filed",
    name: "Dispute Filed",
    enabled: true,
    triggerType: "dispute_filed",
    requiredRoles: ["org_owner", "co_owner", "manager"],
    channels: ["email", "in-app"],
    priority: "high",
    template: "{{title}}: {{message}}",
  },
  {
    id: "trinity_autonomous_alert",
    name: "Trinity Autonomous Alert",
    enabled: true,
    triggerType: "trinity_autonomous_alert",
    requiredRoles: ["org_owner", "co_owner", "manager"],
    channels: ["in-app"],
    priority: "high",
    template: "{{title}}: {{message}}",
  },
  {
    id: "scheduler_job_failed",
    name: "Scheduler Job Failed",
    enabled: true,
    triggerType: "scheduler_job_failed",
    requiredRoles: ["org_owner", "co_owner", "manager"],
    channels: ["email", "in-app"],
    priority: "high",
    template: "{{title}}: {{message}}",
  },

  // ── OPERATIONS ───────────────────────────────────────────────────────────
  {
    id: "coverage_offer",
    name: "Coverage Offer Available",
    enabled: true,
    triggerType: "coverage_offer",
    requiredRoles: ["org_owner", "co_owner", "manager", "supervisor"],
    channels: ["in-app"],
    priority: "high",
    template: "{{title}}: {{message}}",
  },
  {
    id: "coverage_requested",
    name: "Coverage Requested",
    enabled: true,
    triggerType: "coverage_requested",
    requiredRoles: ["org_owner", "co_owner", "manager", "supervisor"],
    channels: ["in-app"],
    priority: "high",
    template: "{{title}}: {{message}}",
  },
  {
    id: "coverage_filled",
    name: "Coverage Filled",
    enabled: true,
    triggerType: "coverage_filled",
    requiredRoles: ["org_owner", "co_owner", "manager", "supervisor"],
    channels: ["in-app"],
    priority: "medium",
    template: "{{title}}: {{message}}",
  },
  {
    id: "coverage_expired",
    name: "Coverage Request Expired",
    enabled: true,
    triggerType: "coverage_expired",
    requiredRoles: ["org_owner", "co_owner", "manager", "supervisor"],
    channels: ["email", "in-app"],
    priority: "high",
    template: "{{title}}: {{message}}",
  },
  {
    id: "shift_offer",
    name: "Shift Offer",
    enabled: true,
    triggerType: "shift_offer",
    requiredRoles: ["org_owner", "co_owner", "manager", "supervisor"],
    channels: ["in-app"],
    priority: "medium",
    template: "{{title}}: {{message}}",
  },
  {
    id: "compliance_alert",
    name: "Compliance Alert",
    enabled: true,
    triggerType: "compliance_alert",
    requiredRoles: ["org_owner", "co_owner", "manager", "supervisor"],
    channels: ["email", "in-app"],
    priority: "high",
    template: "{{title}}: {{message}}",
  },
  {
    id: "calloff_alert",
    name: "Call-Off Alert",
    enabled: true,
    triggerType: "calloff_alert",
    requiredRoles: ["org_owner", "co_owner", "manager", "supervisor"],
    channels: ["email", "in-app"],
    priority: "urgent",
    template: "{{title}}: {{message}}",
  },
  {
    id: "deadline_approaching",
    name: "Deadline Approaching",
    enabled: true,
    triggerType: "deadline_approaching",
    requiredRoles: ["org_owner", "co_owner", "manager", "supervisor"],
    channels: ["in-app"],
    priority: "medium",
    template: "{{title}}: {{message}}",
  },
  {
    id: "action_required",
    name: "Action Required",
    enabled: true,
    triggerType: "action_required",
    requiredRoles: ["org_owner", "co_owner", "manager", "supervisor"],
    channels: ["in-app"],
    priority: "high",
    template: "{{title}}: {{message}}",
  },
  {
    id: "clock_in_reminder",
    name: "Clock-In Reminder",
    enabled: true,
    triggerType: "clock_in_reminder",
    requiredRoles: ["manager", "supervisor"],
    channels: ["in-app"],
    priority: "medium",
    template: "{{title}}: {{message}}",
  },

  // ── PERSONAL / EMPLOYEE ──────────────────────────────────────────────────
  {
    id: "shift_assigned",
    name: "Shift Assigned",
    enabled: true,
    triggerType: "shift_assigned",
    requiredRoles: ["employee", "contractor", "supervisor", "manager", "org_owner"],
    channels: ["in-app"],
    priority: "medium",
    template: "{{title}}: {{message}}",
  },
  {
    id: "shift_changed",
    name: "Shift Changed",
    enabled: true,
    triggerType: "shift_changed",
    requiredRoles: ["employee", "contractor", "supervisor", "manager", "org_owner"],
    channels: ["in-app"],
    priority: "medium",
    template: "{{title}}: {{message}}",
  },
  {
    id: "shift_cancelled",
    name: "Shift Cancelled",
    enabled: true,
    triggerType: "shift_cancelled",
    requiredRoles: ["employee", "contractor", "supervisor", "manager", "org_owner"],
    channels: ["email", "in-app"],
    priority: "high",
    template: "{{title}}: {{message}}",
  },
  {
    id: "shift_unassigned",
    name: "Shift Unassigned",
    enabled: true,
    triggerType: "shift_unassigned",
    requiredRoles: ["employee", "contractor", "supervisor", "manager", "org_owner"],
    channels: ["in-app"],
    priority: "medium",
    template: "{{title}}: {{message}}",
  },
  {
    id: "shift_reminder",
    name: "Shift Reminder",
    enabled: true,
    triggerType: "shift_reminder",
    requiredRoles: ["employee", "contractor"],
    channels: ["in-app"],
    priority: "medium",
    template: "{{title}}: {{message}}",
  },
  {
    id: "pto_approved",
    name: "PTO Approved",
    enabled: true,
    triggerType: "pto_approved",
    requiredRoles: ["employee", "contractor"],
    channels: ["email", "in-app"],
    priority: "medium",
    template: "{{title}}: {{message}}",
  },
  {
    id: "pto_denied",
    name: "PTO Denied",
    enabled: true,
    triggerType: "pto_denied",
    requiredRoles: ["employee", "contractor"],
    channels: ["email", "in-app"],
    priority: "medium",
    template: "{{title}}: {{message}}",
  },
  {
    id: "timesheet_approved",
    name: "Timesheet Approved",
    enabled: true,
    triggerType: "timesheet_approved",
    requiredRoles: ["employee", "contractor"],
    channels: ["in-app"],
    priority: "low",
    template: "{{title}}: {{message}}",
  },
  {
    id: "timesheet_rejected",
    name: "Timesheet Rejected",
    enabled: true,
    triggerType: "timesheet_rejected",
    requiredRoles: ["employee", "contractor"],
    channels: ["email", "in-app"],
    priority: "high",
    template: "{{title}}: {{message}}",
  },
  {
    id: "pay_stub_available",
    name: "Pay Stub Available",
    enabled: true,
    triggerType: "pay_stub_available",
    requiredRoles: ["employee", "contractor"],
    channels: ["email", "in-app"],
    priority: "medium",
    template: "{{title}}: {{message}}",
  },
  {
    id: "officer_deactivated",
    name: "Officer Deactivated",
    enabled: true,
    triggerType: "officer_deactivated",
    requiredRoles: ["employee"],
    channels: ["email", "in-app"],
    priority: "high",
    template: "{{title}}: {{message}}",
  },
  {
    id: "profile_updated",
    name: "Profile Updated",
    enabled: true,
    triggerType: "profile_updated",
    requiredRoles: ["employee", "contractor"],
    channels: ["in-app"],
    priority: "low",
    template: "{{title}}: {{message}}",
  },
  {
    id: "form_assigned",
    name: "Form Assigned",
    enabled: true,
    triggerType: "form_assigned",
    requiredRoles: ["employee", "contractor"],
    channels: ["in-app"],
    priority: "medium",
    template: "{{title}}: {{message}}",
  },

  // ── DOCUMENTS / SIGNATURES ───────────────────────────────────────────────
  {
    id: "document_expiring",
    name: "Document Expiring",
    enabled: true,
    triggerType: "document_expiring",
    requiredRoles: ["employee", "contractor", "supervisor", "manager", "org_owner"],
    channels: ["email", "in-app"],
    priority: "high",
    template: "{{title}}: {{message}}",
  },
  {
    id: "document_uploaded",
    name: "Document Uploaded",
    enabled: true,
    triggerType: "document_uploaded",
    requiredRoles: ["employee", "contractor"],
    channels: ["in-app"],
    priority: "low",
    template: "{{title}}: {{message}}",
  },
  {
    id: "document_signature_request",
    name: "Document Signature Request",
    enabled: true,
    triggerType: "document_signature_request",
    requiredRoles: ["employee", "contractor"],
    channels: ["email", "in-app"],
    priority: "high",
    template: "{{title}}: {{message}}",
  },
  {
    id: "document_signed",
    name: "Document Signed",
    enabled: true,
    triggerType: "document_signed",
    requiredRoles: ["employee", "contractor", "manager", "org_owner"],
    channels: ["in-app"],
    priority: "medium",
    template: "{{title}}: {{message}}",
  },
  {
    id: "document_fully_executed",
    name: "Document Fully Executed",
    enabled: true,
    triggerType: "document_fully_executed",
    requiredRoles: ["employee", "contractor", "manager", "org_owner"],
    channels: ["email", "in-app"],
    priority: "medium",
    template: "{{title}}: {{message}}",
  },
  {
    id: "document_signature_reminder",
    name: "Signature Reminder",
    enabled: true,
    triggerType: "document_signature_reminder",
    requiredRoles: ["employee", "contractor"],
    channels: ["email", "in-app"],
    priority: "medium",
    template: "{{title}}: {{message}}",
  },

  // ── WELCOME ──────────────────────────────────────────────────────────────
  {
    id: "welcome_org",
    name: "Welcome Organization",
    enabled: true,
    triggerType: "welcome_org",
    requiredRoles: ["org_owner", "co_owner"],
    channels: ["email", "in-app"],
    priority: "high",
    template: "{{title}}: {{message}}",
  },
  {
    id: "welcome_employee",
    name: "Welcome Employee",
    enabled: true,
    triggerType: "welcome_employee",
    requiredRoles: ["employee", "contractor"],
    channels: ["email", "in-app"],
    priority: "medium",
    template: "{{title}}: {{message}}",
  },
];

// DEFAULT ISSUE DETECTION RULES
const issueDetectionRulesConfig: IssueDetectionRule[] = [
  {
    id: "missing_required_fields",
    name: "Missing Required Fields",
    description: "Detected missing critical fields in extracted data",
    enabled: true,
    dataTypes: ["invoice", "employee_record", "client_data"],
    conditions: [
      { field: "any", operator: "missingField", value: "" },
    ],
    severity: "warning",
    suggestedAction: "Review extracted data and fill in missing fields manually",
  },
  {
    id: "malformed_data",
    name: "Malformed Data Detected",
    description: "Data format does not match expected schema",
    enabled: true,
    dataTypes: ["invoice", "financial_statement"],
    conditions: [
      { field: "amount", operator: "malformed", value: "" },
    ],
    severity: "warning",
    suggestedAction: "Verify data format and correct invalid values",
  },
  {
    id: "potential_duplicate",
    name: "Potential Duplicate Record",
    description: "Similar record already exists in system",
    enabled: true,
    dataTypes: ["employee_record", "client_data"],
    conditions: [
      { field: "name", operator: "equals", value: "" },
    ],
    severity: "info",
    suggestedAction: "Review potential duplicate and merge if necessary",
  },
  {
    id: "data_anomaly",
    name: "Data Anomaly Detected",
    description: "Data value is statistically unusual",
    enabled: true,
    dataTypes: ["financial_statement", "invoice"],
    conditions: [
      { field: "amount", operator: "greaterThan", value: "999999" },
    ],
    severity: "warning",
    suggestedAction: "Verify unusually high values are correct",
  },
  {
    id: "low_extraction_confidence",
    name: "Low Extraction Confidence",
    description: "AI extraction confidence is below threshold",
    enabled: true,
    dataTypes: ["contract", "employee_record"],
    conditions: [
      { field: "confidence", operator: "lessThan", value: "0.75" },
    ],
    severity: "warning",
    suggestedAction: "Manual review recommended for low confidence extractions",
  },
];

export const aiBrainConfig = {
  guardrails: guardrailsConfig,
  rbac: rbacConfig,
  notificationRules: notificationRulesConfig,
  issueDetectionRules: issueDetectionRulesConfig,

  // Helper functions
  isGuardrailViolated(ruleName: string, value: any): boolean {
    const rules = guardrailsConfig as any;
    for (const category of Object.values(rules)) {
      const categoryRules = category as any;
      for (const [key, limit] of Object.entries(categoryRules)) {
        if (key === ruleName && typeof limit === "number") {
          return value > limit;
        }
      }
    }
    return false;
  },

  getRBACConfig(role: string): RBACNotificationConfig | null {
    return rbacConfig[role] || null;
  },

  getNotificationChannels(triggerType: string, userRole: string): string[] {
    const rule = notificationRulesConfig.find((r) => r.triggerType === triggerType as any);
    if (!rule || !rule.enabled) return [];

    const rbacCfg = this.getRBACConfig(userRole);
    if (!rbacCfg || !rbacCfg.canNotify || !rule.requiredRoles.includes(userRole)) {
      return [];
    }

    return rule.channels;
  },

  getIssueDetectionRules(documentType: string): IssueDetectionRule[] {
    return issueDetectionRulesConfig.filter((r) => r.enabled && r.dataTypes.includes(documentType));
  },
};

export default aiBrainConfig;
