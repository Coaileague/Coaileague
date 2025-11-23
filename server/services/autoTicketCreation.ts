/**
 * Auto-Ticket Creation Service
 * Implements health check auto-ticket creation for proactive incident management
 */

import { db } from '../db';
import { supportTickets, workspaces } from '@shared/schema';
import { eq } from 'drizzle-orm';
import { checkDatabase } from './healthCheck';

export interface AutoTicketConfig {
  workspaceId: string;
  ticketType: string; // 'performance', 'connectivity', 'quota', 'security'
  severity: 'low' | 'medium' | 'high' | 'critical';
  autoResolveAfterMinutes?: number;
}

/**
 * Create auto-ticket when health check fails
 * Triggered by monitoring service when system metrics degrade
 */
export async function createHealthCheckTicket(
  workspaceId: string,
  healthCheckName: string,
  failureReason: string
): Promise<{ ticketId: string; created: boolean }> {
  try {
    const workspace = await db
      .select()
      .from(workspaces)
      .where(eq(workspaces.id, workspaceId))
      .then(r => r[0]);

    if (!workspace) {
      return { ticketId: '', created: false };
    }

    // Determine severity based on health check
    const severityMap: Record<string, 'low' | 'medium' | 'high' | 'critical'> = {
      'database': 'critical',
      'chat_websocket': 'high',
      'gemini_ai': 'high',
      'stripe': 'high',
      'storage': 'medium',
      'email': 'medium',
    };

    const severity = severityMap[healthCheckName] || 'medium';

    // Create support ticket
    const [ticket] = await db
      .insert(supportTickets)
      .values({
        workspaceId,
        type: 'support',
        ticketNumber: `AUTO-${Date.now()}`,
        subject: `⚠️ System Alert: ${healthCheckName} Health Check Failed`,
        description: `Automated health check detected a problem:\n\n${failureReason}\n\nThis ticket was auto-created by the monitoring system.`,
        status: 'open',
        priority: severity,
      })
      .returning();

    // Log ticket creation for audit trail
    console.log(`[AutoTicket] Created ticket ${ticket.id} for ${healthCheckName} failure in workspace ${workspaceId}`);

    return {
      ticketId: ticket.id,
      created: true,
    };
  } catch (error) {
    console.error('[AutoTicketCreation] Error creating health check ticket:', error);
    return { ticketId: '', created: false };
  }
}

/**
 * Create ticket for quota warnings
 * When workspace reaches 80% of limit
 */
export async function createQuotaWarningTicket(
  workspaceId: string,
  quotaType: string, // 'employees', 'clients', 'api_calls'
  currentUsage: number,
  limit: number
): Promise<string | null> {
  try {
    const percentageUsed = (currentUsage / limit) * 100;

    const [ticket] = await db
      .insert(supportTickets)
      .values({
        workspaceId,
        type: 'support',
        ticketNumber: `QUOTA-${Date.now()}`,
        subject: `⚠️ Quota Alert: ${quotaType} at ${percentageUsed.toFixed(0)}% Capacity`,
        description: `Your ${quotaType} quota is running low:\n\nCurrent: ${currentUsage}\nLimit: ${limit}\nUsage: ${percentageUsed.toFixed(1)}%\n\nPlease upgrade your plan or contact support.`,
        status: 'open',
        priority: 'high',
      })
      .returning();

    return ticket.id;
  } catch (error) {
    console.error('[AutoTicketCreation] Error creating quota ticket:', error);
    return null;
  }
}

/**
 * Create ticket for security alerts
 * When suspicious activity detected
 */
export async function createSecurityAlertTicket(
  workspaceId: string,
  alertType: string,
  details: string
): Promise<string | null> {
  try {
    const [ticket] = await db
      .insert(supportTickets)
      .values({
        workspaceId,
        type: 'support',
        ticketNumber: `SEC-${Date.now()}`,
        subject: `🔒 Security Alert: ${alertType}`,
        description: `A security alert has been triggered:\n\n${details}\n\nPlease review immediately.`,
        status: 'open',
        priority: 'critical',
      })
      .returning();

    return ticket.id;
  } catch (error) {
    console.error('[AutoTicketCreation] Error creating security ticket:', error);
    return null;
  }
}

/**
 * Auto-resolve ticket when health check passes again
 */
export async function autoResolveHealthTicket(ticketId: string): Promise<boolean> {
  try {
    await db
      .update(supportTickets)
      .set({
        status: 'resolved',
        resolvedAt: new Date(),
      })
      .where(eq(supportTickets.id, ticketId))
      .catch(() => null);

    return true;
  } catch (error) {
    console.error('[AutoTicketCreation] Error resolving ticket:', error);
    return false;
  }
}
