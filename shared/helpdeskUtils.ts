import type { SupportTicket } from './schema';

export type UITicketStatus = 'new' | 'assigned' | 'investigating' | 'waiting_user' | 'resolved' | 'escalated';

export type TicketPriority = 'low' | 'normal' | 'high' | 'urgent';

export type TicketLifecyclePhase = 'intake' | 'triage' | 'diagnosing' | 'awaiting_customer' | 'validating' | 'completed';

export const SLA_THRESHOLDS: Record<TicketPriority, number> = {
  low: 72 * 60 * 60,
  normal: 48 * 60 * 60,
  high: 12 * 60 * 60,
  urgent: 4 * 60 * 60,
};

export const LIFECYCLE_PHASE_CONFIG: Record<TicketLifecyclePhase, {
  label: string;
  color: string;
  gradient: string;
  customerLabel: string;
  order: number;
}> = {
  intake: {
    label: 'Intake',
    color: 'text-slate-600',
    gradient: 'from-slate-400 to-slate-500',
    customerLabel: 'Received',
    order: 0
  },
  triage: {
    label: 'Triage',
    color: 'text-blue-600',
    gradient: 'from-blue-500 to-blue-600',
    customerLabel: 'Reviewing',
    order: 1
  },
  diagnosing: {
    label: 'Diagnosing',
    color: 'text-emerald-600',
    gradient: 'from-emerald-500 to-cyan-500',
    customerLabel: 'Investigating',
    order: 2
  },
  awaiting_customer: {
    label: 'Awaiting Customer',
    color: 'text-amber-600',
    gradient: 'from-amber-500 to-orange-500',
    customerLabel: 'Need Your Input',
    order: 3
  },
  validating: {
    label: 'Validating Fix',
    color: 'text-cyan-600',
    gradient: 'from-cyan-500 to-teal-500',
    customerLabel: 'Testing Solution',
    order: 4
  },
  completed: {
    label: 'Completed',
    color: 'text-emerald-600',
    gradient: 'from-emerald-600 to-green-600',
    customerLabel: 'Resolved',
    order: 5
  }
};

export function mapTicketStatusToHeaderStatus(ticket: Pick<SupportTicket, 'status' | 'assignedTo'>): UITicketStatus {
  if (ticket.status === 'closed') return 'resolved';
  if (ticket.status === 'resolved') return 'resolved';
  
  if (!ticket.assignedTo) return 'new';
  
  if (ticket.status === 'open') return 'assigned';
  
  if (ticket.status === 'in_progress') return 'investigating';
  
  return 'investigating';
}

export function mapUIStatusToLifecyclePhase(
  uiStatus: UITicketStatus
): TicketLifecyclePhase {
  switch (uiStatus) {
    case 'new':
      return 'intake';
    case 'assigned':
      return 'triage';
    case 'investigating':
      return 'diagnosing';
    case 'waiting_user':
      return 'awaiting_customer';
    case 'resolved':
      return 'validating';
    case 'escalated':
      return 'completed';
    default:
      return 'diagnosing';
  }
}

export function mapStatusToLifecyclePhase(
  status: string,
  assignedTo: string | null
): TicketLifecyclePhase {
  if (status === 'closed') return 'completed';
  if (status === 'resolved') return 'validating';
  if (!assignedTo) return 'intake';
  if (status === 'open') return 'triage';
  if (status === 'in_progress') return 'diagnosing';
  return 'diagnosing';
}

export function calculateSLARemaining(
  createdAt: Date,
  priority: TicketPriority = 'normal',
  now: Date = new Date()
): number {
  const threshold = SLA_THRESHOLDS[priority];
  const elapsed = (now.getTime() - new Date(createdAt).getTime()) / 1000;
  return Math.max(0, threshold - elapsed);
}

export interface TicketViewModel {
  id: string;
  ticketNumber: string;
  status: UITicketStatus;
  priority: TicketPriority;
  assignedAgent?: string;
  slaRemaining: number;
  subject: string;
  description: string;
  workspaceId: string;
  createdAt: Date;
}

export interface TicketLifecycleView {
  id: string;
  ticketNumber: string;
  lifecyclePhase: TicketLifecyclePhase;
  priority: TicketPriority;
  assignedAgent?: string;
  assignedTeamName?: string;
  slaRemaining: number;
  slaBreached: boolean;
  subject: string;
  latestPublicComment?: string;
  estimatedResolutionTime?: string;
  internalNotes?: string;
  conversationId?: string;
  lastTransitionAt: Date;
  createdAt: Date;
}

export interface AgentTicketView extends TicketLifecycleView {
  fullHistory: boolean;
  internalNotes: string;
  slaBreachDetails?: {
    breachedAt: Date;
    targetResolutionTime: Date;
  };
}

export interface CustomerTicketView {
  ticketNumber: string;
  lifecyclePhase: TicketLifecyclePhase;
  statusLabel: string;
  estimatedResolutionTime?: string;
  latestPublicComment?: string;
  assignedTeamName: string;
  lastUpdateAt: Date;
}
