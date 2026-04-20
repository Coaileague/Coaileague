/**
 * Support Audit Service — Phase 9
 *
 * Thin wrapper that writes support-system events into the universal_audit_trail
 * table (entity_type = 'support_ticket') so that ticket lifecycle actions are
 * queryable alongside all other audit entries.
 *
 * Callers must `await` this (or handle the returned Promise) — do NOT
 * fire-and-forget per Section B of TRINITY.md.
 */

import { universalAudit } from '../universalAuditService';
import { createLogger } from '../../lib/logger';

const log = createLogger('supportAuditService');

export interface SupportAuditEntry {
  workspaceId: string;
  ticketId: string;
  /** e.g. 'ticket_created', 'ticket_assigned', 'status_changed', 'ticket_closed', 'ticket_escalated' */
  action: string;
  actorId?: string | null;
  /** Additional context stored in the metadata column */
  metadata?: Record<string, unknown>;
}

/**
 * Write an immutable audit row for a support-ticket lifecycle event.
 *
 * Returns a Promise so callers can await it or attach a non-fatal `.catch()`.
 */
export async function writeSupportAuditLog(entry: SupportAuditEntry): Promise<void> {
  try {
    await universalAudit.log({
      workspaceId: entry.workspaceId,
      actorId:     entry.actorId ?? null,
      actorType:   entry.actorId ? 'user' : 'system',
      action:      `support.${entry.action}`,
      entityType:  'support_ticket',
      entityId:    entry.ticketId,
      changeType:  'action',
      metadata:    entry.metadata ?? {},
    });
  } catch (err) {
    log.warn('[SupportAudit] write failed (non-fatal):', (err as Error)?.message);
  }
}
