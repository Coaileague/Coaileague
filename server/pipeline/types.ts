import { createLogger } from '../lib/logger';
const log = createLogger('pipelineTypes');
/**
 * Document Pipeline Types - 7-Step Processing Pipeline
 * Handles document lifecycle from capture to storage
 */

export enum PipelineStatus {
  DRAFT = 'draft',
  CAPTURING = 'capturing',
  PROCESSING = 'processing',
  GENERATING = 'generating',
  PENDING_APPROVAL = 'pending_approval',
  APPROVED = 'approved',
  REJECTED = 'rejected',
  ROUTING = 'routing',
  DELIVERED = 'delivered',
  STORED = 'stored',
  ERROR = 'error',
  DEAD_LETTER = 'dead_letter',
}

export type DocumentType = 
  | 'meeting_minutes' 
  | 'incident_report' 
  | 'clock_entry' 
  | 'shift_report'
  | 'bug_report'
  | 'support_ticket'
  | 'other';

export interface DocumentSource {
  botId: string;
  botInstanceId: string;
  roomId: string;
  capturedAt: Date;
  rawContent: any;
  messageIds?: string[];
  participantIds?: string[];
}

export interface ProcessedContent {
  status: 'pending' | 'processing' | 'complete' | 'error';
  content: any;
  pdfUrl?: string;
  generatedAt?: Date;
  processingNotes: string[];
  aiConfidence?: number;
  extractedData?: Record<string, any>;
}

export interface ApprovalInfo {
  required: boolean;
  status: 'pending' | 'approved' | 'rejected' | 'auto_approved';
  requestedAt?: Date;
  decidedAt?: Date;
  decidedBy?: string;
  decidedByName?: string;
  reason?: string;
  autoApprovalReason?: string;
}

export interface RoutingInfo {
  destinations: RoutingDestination[];
  routedAt?: Date;
  routingNotes: string[];
}

export interface RoutingDestination {
  type: 'email' | 'webhook' | 'storage' | 'notification' | 'integration';
  target: string;
  status: 'pending' | 'sent' | 'failed';
  sentAt?: Date;
  error?: string;
  metadata?: Record<string, any>;
}

export interface StorageInfo {
  stored: boolean;
  storedAt?: Date;
  storageLocation?: string;
  retentionPolicy?: string;
  expiresAt?: Date;
  encrypted?: boolean;
  backupLocation?: string;
}

export interface PipelineDocument {
  id: string;
  type: DocumentType;
  orgId: string;
  workspaceId?: string;
  title: string;
  
  source: DocumentSource;
  processed: ProcessedContent;
  approval: ApprovalInfo;
  routing: RoutingInfo;
  storage: StorageInfo;
  
  status: PipelineStatus;
  priority: 'low' | 'normal' | 'high' | 'urgent';
  
  createdAt: Date;
  updatedAt: Date;
  completedAt?: Date;
  
  metadata: Record<string, any>;
  tags: string[];
  
  auditLog: PipelineAuditEntry[];
}

export interface PipelineAuditEntry {
  timestamp: Date;
  action: string;
  actor: 'system' | 'bot' | 'user';
  actorId?: string;
  actorName?: string;
  details?: string;
  previousStatus?: PipelineStatus;
  newStatus?: PipelineStatus;
}

export interface PipelineConfig {
  documentType: DocumentType;
  requiresApproval: boolean;
  approvalRoles: string[];
  autoApprovalThreshold?: number;
  defaultRouting: RoutingDestination[];
  retentionDays: number;
  encryptAtRest: boolean;
  notifyOnComplete: boolean;
  webhooks?: string[];
}

export const DEFAULT_PIPELINE_CONFIGS: Record<DocumentType, PipelineConfig> = {
  meeting_minutes: {
    documentType: 'meeting_minutes',
    requiresApproval: true,
    approvalRoles: ['manager', 'admin'],
    autoApprovalThreshold: 0.95,
    defaultRouting: [
      { type: 'storage', target: 'documents/meetings', status: 'pending' },
      { type: 'email', target: 'participants', status: 'pending' },
    ],
    retentionDays: 365 * 7,
    encryptAtRest: true,
    notifyOnComplete: true,
  },
  incident_report: {
    documentType: 'incident_report',
    requiresApproval: true,
    approvalRoles: ['supervisor', 'manager', 'admin'],
    defaultRouting: [
      { type: 'storage', target: 'documents/incidents', status: 'pending' },
      { type: 'notification', target: 'supervisors', status: 'pending' },
      { type: 'email', target: 'client', status: 'pending' },
    ],
    retentionDays: 365 * 7,
    encryptAtRest: true,
    notifyOnComplete: true,
  },
  clock_entry: {
    documentType: 'clock_entry',
    requiresApproval: false,
    approvalRoles: [],
    defaultRouting: [
      { type: 'storage', target: 'time_entries', status: 'pending' },
    ],
    retentionDays: 365 * 3,
    encryptAtRest: false,
    notifyOnComplete: false,
  },
  shift_report: {
    documentType: 'shift_report',
    requiresApproval: false,
    approvalRoles: [],
    defaultRouting: [
      { type: 'storage', target: 'documents/shifts', status: 'pending' },
    ],
    retentionDays: 365 * 2,
    encryptAtRest: false,
    notifyOnComplete: false,
  },
  bug_report: {
    documentType: 'bug_report',
    requiresApproval: false,
    approvalRoles: [],
    defaultRouting: [
      { type: 'storage', target: 'support/bugs', status: 'pending' },
      { type: 'notification', target: 'support_team', status: 'pending' },
    ],
    retentionDays: 365 * 2,
    encryptAtRest: false,
    notifyOnComplete: true,
  },
  support_ticket: {
    documentType: 'support_ticket',
    requiresApproval: false,
    approvalRoles: [],
    defaultRouting: [
      { type: 'storage', target: 'support/tickets', status: 'pending' },
    ],
    retentionDays: 365 * 2,
    encryptAtRest: false,
    notifyOnComplete: false,
  },
  other: {
    documentType: 'other',
    requiresApproval: true,
    approvalRoles: ['admin'],
    defaultRouting: [
      { type: 'storage', target: 'documents/misc', status: 'pending' },
    ],
    retentionDays: 365,
    encryptAtRest: false,
    notifyOnComplete: false,
  },
};

log.info('[PipelineTypes] Document pipeline types initialized');
