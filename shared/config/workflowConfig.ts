/**
 * Workflow Configuration - Universal & Dynamic
 * Eliminates hardcoded workflow approval routing rules
 * Supports multi-step approval chains with configurable routing logic
 */

export const workflowConfig = {
  // Approval Workflow Tiers
  approvalTiers: {
    // Tier 1: Manager Review (Direct Manager)
    managerReview: {
      requiredRole: 'manager',
      maxApprovalTimeHours: parseInt(process.env.VITE_WORKFLOW_MANAGER_APPROVAL_HOURS || '24', 10),
      autoEscalateIfOverdue: process.env.VITE_WORKFLOW_AUTO_ESCALATE === 'true' || true,
    },
    // Tier 2: Supervisor Review (Department Head)
    supervisorReview: {
      requiredRole: 'supervisor',
      maxApprovalTimeHours: parseInt(process.env.VITE_WORKFLOW_SUPERVISOR_APPROVAL_HOURS || '48', 10),
      autoEscalateIfOverdue: process.env.VITE_WORKFLOW_AUTO_ESCALATE === 'true' || true,
    },
    // Tier 3: Admin Review (Finance/HR)
    adminReview: {
      requiredRole: 'admin',
      maxApprovalTimeHours: parseInt(process.env.VITE_WORKFLOW_ADMIN_APPROVAL_HOURS || '72', 10),
      autoEscalateIfOverdue: process.env.VITE_WORKFLOW_AUTO_ESCALATE === 'true' || false,
    },
  },

  // Workflow Templates (by document type)
  templates: {
    payroll: {
      name: 'Payroll Approval Workflow',
      enabled: process.env.VITE_WORKFLOW_PAYROLL_ENABLED === 'true' || true,
      steps: [
        { step: 1, roleRequired: 'manager', stepName: 'Manager Review' },
        { step: 2, roleRequired: 'supervisor', stepName: 'Department Head Review' },
        { step: 3, roleRequired: 'admin', stepName: 'Finance Approval' },
      ],
      finalDestination: 'payroll_queue',
    },
    invoices: {
      name: 'Invoice Approval Workflow',
      enabled: process.env.VITE_WORKFLOW_INVOICE_ENABLED === 'true' || true,
      steps: [
        { step: 1, roleRequired: 'manager', stepName: 'Manager Review' },
        { step: 2, roleRequired: 'admin', stepName: 'Admin Approval' },
      ],
      finalDestination: 'invoice_queue',
    },
    schedules: {
      name: 'Schedule Approval Workflow',
      enabled: process.env.VITE_WORKFLOW_SCHEDULE_ENABLED === 'true' || true,
      steps: [
        { step: 1, roleRequired: 'manager', stepName: 'Manager Review' },
        { step: 2, roleRequired: 'supervisor', stepName: 'Supervisor Approval' },
      ],
      finalDestination: 'schedule_publication',
    },
    reports: {
      name: 'Report Approval Workflow',
      enabled: process.env.VITE_WORKFLOW_REPORT_ENABLED === 'true' || true,
      steps: [
        { step: 1, roleRequired: 'manager', stepName: 'Manager Review' },
        { step: 2, roleRequired: 'admin', stepName: 'Final Approval' },
      ],
      finalDestination: 'report_archive',
    },
  },

  // Rejection Handling
  rejectionHandling: {
    allowResubmission: process.env.VITE_WORKFLOW_ALLOW_RESUBMIT === 'true' || true,
    resubmissionRequiresChanges: process.env.VITE_WORKFLOW_REQUIRE_CHANGES === 'true' || true,
    notifySubmitterOnRejection: process.env.VITE_WORKFLOW_NOTIFY_REJECTION === 'true' || true,
    preserveRejectionHistory: process.env.VITE_WORKFLOW_PRESERVE_HISTORY === 'true' || true,
  },

  // Escalation Rules
  escalationRules: {
    enableAutoEscalation: process.env.VITE_WORKFLOW_AUTO_ESCALATE === 'true' || true,
    escalationNotificationEmails: process.env.VITE_WORKFLOW_ESCALATION_EMAILS?.split(',') || ['admin@coaileague.ai'],
    escalationAlertSeverity: process.env.VITE_WORKFLOW_ESCALATION_SEVERITY || 'HIGH',
  },

  // Notification Configuration
  notifications: {
    notifyApproverOnAssignment: process.env.VITE_WORKFLOW_NOTIFY_APPROVER === 'true' || true,
    notifySubmitterOnApproval: process.env.VITE_WORKFLOW_NOTIFY_APPROVAL === 'true' || true,
    notifySubmitterOnRejection: process.env.VITE_WORKFLOW_NOTIFY_REJECTION === 'true' || true,
    enableReminderEmails: process.env.VITE_WORKFLOW_ENABLE_REMINDERS === 'true' || true,
    reminderIntervalHours: parseInt(process.env.VITE_WORKFLOW_REMINDER_HOURS || '24', 10),
  },

  // Audit & Compliance
  auditLogging: {
    logAllApprovals: process.env.VITE_WORKFLOW_LOG_APPROVALS === 'true' || true,
    immutableAuditTrail: process.env.VITE_WORKFLOW_IMMUTABLE_AUDIT === 'true' || true,
    retentionDays: parseInt(process.env.VITE_WORKFLOW_RETENTION_DAYS || '2555', 10), // 7 years
  },

  // Permissions & Security
  security: {
    requireApproverSignature: process.env.VITE_WORKFLOW_REQUIRE_SIGNATURE === 'true' || false,
    enforceApproverWorkspace: process.env.VITE_WORKFLOW_ENFORCE_WORKSPACE === 'true' || true,
    preventSelfApproval: process.env.VITE_WORKFLOW_PREVENT_SELF_APPROVAL === 'true' || true,
  },
};

export default workflowConfig;
