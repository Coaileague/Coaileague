import type { SupportTicket } from './schema';

export type UITicketStatus = 'new' | 'assigned' | 'investigating' | 'waiting_user' | 'resolved' | 'escalated';

export type TicketPriority = 'low' | 'normal' | 'high' | 'urgent';

export const SLA_THRESHOLDS: Record<TicketPriority, number> = {
  low: 72 * 60 * 60,
  normal: 48 * 60 * 60,
  high: 12 * 60 * 60,
  urgent: 4 * 60 * 60,
};

export function mapTicketStatusToHeaderStatus(ticket: Pick<SupportTicket, 'status' | 'assignedTo'>): UITicketStatus {
  if (ticket.status === 'closed') return 'resolved';
  if (ticket.status === 'resolved') return 'resolved';
  
  if (!ticket.assignedTo) return 'new';
  
  if (ticket.status === 'open') return 'assigned';
  
  if (ticket.status === 'in_progress') return 'investigating';
  
  return 'investigating';
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
