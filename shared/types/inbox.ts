/**
 * Notification Hub Type Definitions
 * Enterprise-grade notification and action item system
 */

export type InboxItemType = 
  // Shift related
  | 'shift_swap_request'
  | 'shift_swap_response'
  | 'coverage_request'
  | 'coverage_response'
  | 'shift_assigned'
  | 'shift_cancelled'
  | 'shift_reminder'
  // Documents
  | 'document_sign'
  | 'document_upload_request'
  | 'document_review'
  | 'policy_acknowledgment'
  | 'contract_review'
  // Approvals
  | 'timesheet_approval'
  | 'time_off_request'
  | 'expense_approval'
  | 'schedule_approval'
  // Workflows
  | 'workflow_step'
  | 'workflow_complete'
  | 'onboarding_task'
  // Support
  | 'ticket_assigned'
  | 'ticket_escalated'
  | 'ticket_response'
  // System
  | 'system_alert'
  | 'compliance_warning'
  | 'certification_expiring'
  | 'password_expiring'
  // Messages
  | 'direct_message'
  | 'mention'
  | 'announcement';

export type InboxTab = 'all' | 'urgent' | 'shifts' | 'documents' | 'approvals' | 'archive';

export type InboxItemStatus = 'pending' | 'completed' | 'expired' | 'cancelled';

export interface InboxAction {
  id: string;
  label: string;
  icon?: string;
  variant: 'primary' | 'secondary' | 'danger' | 'ghost';
  confirmRequired?: boolean;
  confirmMessage?: string;
  handler: string;
}

export interface InboxSender {
  id: string;
  name: string;
  role: string;
  avatar?: string;
}

export interface InboxWorkflow {
  id: string;
  type: string;
  currentStep: number;
  totalSteps: number;
  data: Record<string, any>;
}

export interface InboxDocument {
  id: string;
  name: string;
  type: string;
  url?: string;
  requiresSignature: boolean;
  requiresUpload: boolean;
  dueDate?: string;
}

export interface InboxShift {
  id: string;
  date: string;
  startTime: string;
  endTime: string;
  location: string;
  role: string;
  payRate?: number;
  isOvertime?: boolean;
}

export interface InboxItem {
  id: string;
  type: InboxItemType;
  title: string;
  description: string;
  timestamp: string;
  read: boolean;
  urgent: boolean;
  status: InboxItemStatus;
  sender?: InboxSender;
  actions: InboxAction[];
  workflow?: InboxWorkflow;
  document?: InboxDocument;
  shift?: InboxShift;
  metadata?: Record<string, any>;
}

export interface InboxFilters {
  type?: InboxItemType[];
  status?: InboxItemStatus[];
  urgent?: boolean;
  read?: boolean;
  dateRange?: {
    start: string;
    end: string;
  };
  sender?: string;
}

export function getInboxTabFromType(type: InboxItemType): InboxTab {
  if (type.startsWith('shift_') || type === 'coverage_request' || type === 'coverage_response') {
    return 'shifts';
  }
  if (type.startsWith('document_') || type === 'policy_acknowledgment' || type === 'contract_review') {
    return 'documents';
  }
  if (type.endsWith('_approval') || type === 'time_off_request') {
    return 'approvals';
  }
  return 'all';
}

export function getInboxItemIcon(type: InboxItemType): string {
  const iconMap: Record<InboxItemType, string> = {
    shift_swap_request: 'ArrowLeftRight',
    shift_swap_response: 'ArrowLeftRight',
    coverage_request: 'UserPlus',
    coverage_response: 'UserCheck',
    shift_assigned: 'Calendar',
    shift_cancelled: 'CalendarX',
    shift_reminder: 'Bell',
    document_sign: 'FileSignature',
    document_upload_request: 'Upload',
    document_review: 'FileSearch',
    policy_acknowledgment: 'FileCheck',
    contract_review: 'FileText',
    timesheet_approval: 'Clock',
    time_off_request: 'CalendarOff',
    expense_approval: 'Receipt',
    schedule_approval: 'CalendarCheck',
    workflow_step: 'Workflow',
    workflow_complete: 'CheckCircle',
    onboarding_task: 'ClipboardList',
    ticket_assigned: 'Ticket',
    ticket_escalated: 'AlertTriangle',
    ticket_response: 'MessageSquare',
    system_alert: 'AlertCircle',
    compliance_warning: 'Shield',
    certification_expiring: 'Award',
    password_expiring: 'Key',
    direct_message: 'Mail',
    mention: 'AtSign',
    announcement: 'Megaphone',
  };
  return iconMap[type] || 'Bell';
}
