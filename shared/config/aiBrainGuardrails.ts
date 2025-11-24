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
  triggerType: "document_extraction" | "issue_detected" | "migration_complete" | "guardrail_violation" | "quota_warning";
  requiredRoles: string[]; // RBAC: only these roles receive this notification
  channels: ("email" | "in-app" | "webhook" | "sms")[];
  priority: "low" | "medium" | "high" | "urgent";
  template: string; // Dynamic template with variable substitution
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
  manager: {
    role: "manager",
    canNotify: true,
    notificationTypes: ["migration_complete", "issue_detected", "guardrail_violation"],
    canApproveAutomation: true,
    canEditGuardrails: false,
    canViewIssues: true,
    escalationPath: ["admin"],
  },
  employee: {
    role: "employee",
    canNotify: true,
    notificationTypes: ["migration_complete"],
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
