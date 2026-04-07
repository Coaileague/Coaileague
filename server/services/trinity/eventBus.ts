/**
 * Trinity Event Bus
 * =================
 * Wrapper for Trinity AI to receive events from all platform services.
 * Routes events to the platform event bus and AI Brain for orchestration.
 */

import { EventEmitter } from 'events';
import { platformEventBus, type PlatformEvent, type EventCategory } from '../platformEventBus';
import { db } from '../../db';
import { aiBrainActionLogs } from '@shared/schema';
import { createLogger } from '../../lib/logger';
const log = createLogger('eventBus');


/**
 * General-purpose event bus for internal service communication
 * Provides EventEmitter-style API for cross-service events
 */
class TrinityEventBus extends EventEmitter {
  constructor() {
    super();
    this.setMaxListeners(50); // Allow many services to subscribe
  }
}

export const eventBus = new TrinityEventBus();

// Domain-specific event types that Trinity tracks
export type TrinityEmailEventType = 
  | 'mailbox_provisioned'
  | 'email_sent'
  | 'email_received'
  | 'email_read'
  | 'email_soft_deleted'
  | 'email_permanently_deleted'
  | 'email_restored'
  | 'email_flagged';

/**
 * Emit a Trinity-aware event for internal email operations
 * This logs to the AI Brain action logs so Trinity can track all email activity
 */
export async function emitTrinityEvent(
  domain: string,
  eventType: string,
  data: Record<string, any>
): Promise<void> {
  try {
    // Log to AI Brain action logs for Trinity awareness (only existing DB columns)
    if (data.workspaceId) {
      await db.insert(aiBrainActionLogs).values({
        workspaceId: data.workspaceId,
        actionType: `${domain}.${eventType}`,
        actionData: { actor: data.actorId || data.userId || 'trinity-event-bus', ...data },
        result: 'COMPLETED',
      });
    }

    // Also emit to platform event bus for real-time updates
    const platformEvent: PlatformEvent = {
      type: 'ai_brain_action',
      category: 'ai_brain' as EventCategory,
      title: `Internal Email: ${eventType.replace(/_/g, ' ')}`,
      description: `Trinity tracked ${domain} event: ${eventType}`,
      workspaceId: data.workspaceId,
      userId: data.actorId || data.userId,
      metadata: {
        domain,
        eventType,
        ...data,
      },
    };

    // CANONICAL LAW: .publish() routes through DB persist + Trinity subscribers + WebSocket.
    // .emit(object) was broken — EventEmitter treats the first arg as event name string.
    await platformEventBus.publish(platformEvent);
  } catch (error) {
    // Silently fail - event logging should never block main operations
    log.error('[Trinity EventBus] Failed to emit event:', error);
  }
}

/**
 * Emit mailbox provisioning event
 */
export async function emitMailboxProvisioned(data: {
  mailboxId: string;
  userId: string;
  workspaceId?: string;
  emailAddress: string;
}): Promise<void> {
  await emitTrinityEvent('internal_email', 'mailbox_provisioned', data);
}

/**
 * Emit email sent event
 */
export async function emitEmailSent(data: {
  emailId: string;
  fromMailboxId: string;
  toAddresses: string[];
  subject: string;
  workspaceId?: string;
}): Promise<void> {
  await emitTrinityEvent('internal_email', 'email_sent', data);
}

export default {
  emitTrinityEvent,
  emitMailboxProvisioned,
  emitEmailSent,
};
