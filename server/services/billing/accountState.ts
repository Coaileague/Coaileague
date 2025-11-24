import { db } from '../../db';
import {
  workspaces,
  billingAuditLog,
  subscriptionInvoices,
  users,
  type Workspace,
} from '@shared/schema';
import { eq, and, lte } from 'drizzle-orm';

export type AccountState = 'active' | 'payment_failed' | 'suspended' | 'requires_support';

export interface AccountStateChange {
  workspaceId: string;
  newState: AccountState;
  reason: string;
  actorId?: string;
  actorType?: 'user' | 'system' | 'admin' | 'webhook';
}

export class AccountStateService {
  /**
   * Verify if an actor has admin or support permissions
   */
  private async isAdminOrSupport(actorId: string | undefined): Promise<boolean> {
    if (!actorId) return false;
    
    try {
      const [actor] = await db.select({ role: users.role })
        .from(users)
        .where(eq(users.id, actorId))
        .limit(1);
      
      return actor && (actor.role === 'admin' || actor.role === 'root' || actor.role === 'support');
    } catch (error) {
      return false;
    }
  }

  /**
   * Transition account to a new state with audit logging
   */
  async transitionState(change: AccountStateChange): Promise<Workspace> {
    const { workspaceId, newState, reason, actorId, actorType = 'system' } = change;

    // Get current state
    const [workspace] = await db.select()
      .from(workspaces)
      .where(eq(workspaces.id, workspaceId))
      .limit(1);

    if (!workspace) {
      throw new Error(`Workspace ${workspaceId} not found`);
    }

    const previousState = workspace.accountState || 'active';

    // Validate state transition
    this.validateStateTransition(previousState as AccountState, newState);

    // Update workspace
    const updateData: Partial<typeof workspaces.$inferInsert> = {
      accountState: newState,
      accountSuspensionReason: reason,
      updatedAt: new Date(),
    };

    // Set suspension timestamp if suspending
    if (newState === 'suspended' || newState === 'requires_support') {
      updateData.accountSuspendedAt = new Date();
    }

    // Clear suspension data if reactivating
    if (newState === 'active') {
      updateData.accountSuspensionReason = null;
      updateData.accountSuspendedAt = null;
      updateData.supportTicketId = null;
    }

    const [updatedWorkspace] = await db.update(workspaces)
      .set(updateData)
      .where(eq(workspaces.id, workspaceId))
      .returning();

    // Log audit event
    await db.insert(billingAuditLog).values({
      workspaceId,
      eventType: newState === 'suspended' ? 'account_suspended' : 
                 newState === 'active' ? 'account_reactivated' : 
                 'account_state_changed',
      eventCategory: 'account',
      actorType,
      actorId,
      description: reason,
      previousState: { accountState: previousState },
      newState: { accountState: newState },
      metadata: {
        stateTransition: `${previousState} → ${newState}`,
      },
    });

    return updatedWorkspace;
  }

  /**
   * Suspend account for non-payment
   */
  async suspendForNonPayment(
    workspaceId: string,
    invoiceId: string
  ): Promise<Workspace> {
    const [invoice] = await db.select()
      .from(subscriptionInvoices)
      .where(eq(subscriptionInvoices.id, invoiceId))
      .limit(1);

    if (!invoice) {
      throw new Error(`Invoice ${invoiceId} not found`);
    }

    return this.transitionState({
      workspaceId,
      newState: 'suspended',
      reason: `Payment failed for invoice ${invoice.invoiceNumber}. Account suspended pending payment.`,
      actorType: 'system',
    });
  }

  /**
   * Suspend account and require support intervention
   */
  async suspendRequiringSupport(
    workspaceId: string,
    reason: string,
    supportTicketId?: string
  ): Promise<Workspace> {
    const [workspace] = await db.update(workspaces)
      .set({
        accountState: 'requires_support',
        accountSuspensionReason: reason,
        accountSuspendedAt: new Date(),
        supportTicketId,
        updatedAt: new Date(),
      })
      .where(eq(workspaces.id, workspaceId))
      .returning();

    // Log audit event
    await db.insert(billingAuditLog).values({
      workspaceId,
      eventType: 'account_suspended',
      eventCategory: 'account',
      actorType: 'system',
      description: reason,
      newState: {
        accountState: 'requires_support',
        supportTicketId,
      },
      metadata: {
        requiresSupportIntervention: true,
      },
    });

    return workspace;
  }

  /**
   * Reactivate account (requires support/admin intervention if in requires_support state)
   */
  async reactivateAccount(
    workspaceId: string,
    actorId: string,
    reason: string
  ): Promise<Workspace> {
    const [workspace] = await db.select()
      .from(workspaces)
      .where(eq(workspaces.id, workspaceId))
      .limit(1);

    if (!workspace) {
      throw new Error(`Workspace ${workspaceId} not found`);
    }

    // If account requires support, only admins/support can reactivate
    if (workspace.accountState === 'requires_support') {
      const isAdmin = await this.isAdminOrSupport(actorId);
      if (!isAdmin) {
        throw new Error('Only administrators or support staff can reactivate suspended accounts. Access denied.');
      }
    }

    return this.transitionState({
      workspaceId,
      newState: 'active',
      reason: `Account reactivated: ${reason}`,
      actorId,
      actorType: 'admin',
    });
  }

  /**
   * Mark payment as failed
   */
  async markPaymentFailed(
    workspaceId: string,
    reason: string
  ): Promise<Workspace> {
    return this.transitionState({
      workspaceId,
      newState: 'payment_failed',
      reason: `Payment failed: ${reason}`,
      actorType: 'webhook',
    });
  }

  /**
   * Check if account is active and can use features
   */
  async canUseFeatures(workspaceId: string): Promise<boolean> {
    const [workspace] = await db.select({
      accountState: workspaces.accountState,
    })
      .from(workspaces)
      .where(eq(workspaces.id, workspaceId))
      .limit(1);

    if (!workspace) return false;

    return workspace.accountState === 'active';
  }

  /**
   * Get account status details
   */
  async getAccountStatus(workspaceId: string): Promise<{
    state: AccountState;
    isActive: boolean;
    suspensionReason?: string;
    suspendedAt?: Date;
    supportTicketId?: string;
    canBeReactivated: boolean;
    requiresSupportIntervention: boolean;
  } | null> {
    const [workspace] = await db.select()
      .from(workspaces)
      .where(eq(workspaces.id, workspaceId))
      .limit(1);

    if (!workspace) return null;

    const state = (workspace.accountState || 'active') as AccountState;
    const requiresSupportIntervention = state === 'requires_support';

    return {
      state,
      isActive: state === 'active',
      suspensionReason: workspace.accountSuspensionReason || undefined,
      suspendedAt: workspace.accountSuspendedAt || undefined,
      supportTicketId: workspace.supportTicketId || undefined,
      canBeReactivated: state !== 'active',
      requiresSupportIntervention,
    };
  }

  /**
   * Find overdue invoices and suspend accounts
   * Called by cron job
   */
  async processOverdueInvoices(): Promise<void> {
    const now = new Date();

    // Find overdue unpaid invoices
    const overdueInvoices = await db.select()
      .from(subscriptionInvoices)
      .where(
        and(
          lte(subscriptionInvoices.dueDate, now),
          eq(subscriptionInvoices.status, 'pending')
        )
      );

    for (const invoice of overdueInvoices) {
      try {
        // Mark invoice as overdue
        await db.update(subscriptionInvoices)
          .set({
            status: 'overdue',
            updatedAt: new Date(),
          })
          .where(eq(subscriptionInvoices.id, invoice.id));

        // Check how long overdue
        const daysOverdue = Math.floor((now.getTime() - invoice.dueDate.getTime()) / (1000 * 60 * 60 * 24));

        if (daysOverdue >= 7) {
          // 7+ days overdue - suspend account
          await this.suspendForNonPayment(invoice.workspaceId, invoice.id);
        } else if (daysOverdue >= 3) {
          // 3+ days overdue - mark payment failed
          await this.markPaymentFailed(
            invoice.workspaceId,
            `Invoice ${invoice.invoiceNumber} is ${daysOverdue} days overdue`
          );
        }

        // Log audit event
        await db.insert(billingAuditLog).values({
          workspaceId: invoice.workspaceId,
          eventType: 'invoice_overdue',
          eventCategory: 'payment',
          actorType: 'system',
          description: `Invoice ${invoice.invoiceNumber} marked as overdue (${daysOverdue} days)`,
          relatedEntityType: 'invoice',
          relatedEntityId: invoice.id,
          metadata: {
            daysOverdue,
            invoiceNumber: invoice.invoiceNumber,
            totalAmount: invoice.totalAmount,
          },
        });
      } catch (error) {
        console.error(`Failed to process overdue invoice ${invoice.id}:`, error);
      }
    }
  }

  /**
   * Validate state transition is allowed
   */
  private validateStateTransition(from: AccountState, to: AccountState): void {
    const allowedTransitions: Record<AccountState, AccountState[]> = {
      'active': ['payment_failed', 'suspended', 'requires_support'],
      'payment_failed': ['active', 'suspended', 'requires_support'],
      'suspended': ['active', 'requires_support'],
      'requires_support': ['active'],
    };

    const allowed = allowedTransitions[from];
    if (!allowed || !allowed.includes(to)) {
      throw new Error(`Invalid state transition: ${from} → ${to}`);
    }
  }

  /**
   * Get all workspaces in a specific state
   */
  async getWorkspacesByState(state: AccountState): Promise<Workspace[]> {
    return db.select()
      .from(workspaces)
      .where(eq(workspaces.accountState, state));
  }
}

// Singleton instance
export const accountStateService = new AccountStateService();
