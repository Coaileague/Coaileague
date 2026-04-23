import { db } from '../db';
import { orgFinanceSettings, workspaces } from '@shared/schema';
import { eq } from 'drizzle-orm';
import { createLogger } from '../lib/logger';
import { SubscriptionManager } from './billing/subscriptionManager';
import { isStripeConfigured } from './billing/stripeClient';

const log = createLogger('workspaceProvisioningService');

export async function provisionWorkspace(params: {
  workspaceId: string;
  ownerId: string;
}): Promise<void> {
  const { workspaceId, ownerId } = params;

  try {
    if (isStripeConfigured()) {
      const subscriptionManager = new SubscriptionManager();
      await subscriptionManager.ensureStripeCustomer(workspaceId);
    }
  } catch (err: unknown) {
    log.warn('[WorkspaceProvisioning] Stripe customer provisioning failed (non-blocking):', (err as any)?.message);
  }

  try {
    await db.insert(orgFinanceSettings).values({
      workspaceId,
      updatedBy: ownerId,
    }).onConflictDoNothing();
  } catch (err: unknown) {
    log.warn('[WorkspaceProvisioning] Finance settings init failed (non-blocking):', (err as any)?.message);
  }

  try {
    const [workspace] = await db.select({
      billingSettingsBlob: workspaces.billingSettingsBlob,
      payrollSchedule: workspaces.payrollSchedule,
      payrollCycle: workspaces.payrollCycle,
    }).from(workspaces).where(eq(workspaces.id, workspaceId)).limit(1);

    if (workspace) {
      const currentSettings = (workspace.billingSettingsBlob as Record<string, any>) || {};
      if (!currentSettings.payrollCycle) {
        const payrollCycle = workspace.payrollSchedule || workspace.payrollCycle || 'biweekly';
        await db.update(workspaces).set({
          billingSettingsBlob: { ...currentSettings, payrollCycle },
          updatedAt: new Date(),
        }).where(eq(workspaces.id, workspaceId));
      }
    }
  } catch (err: unknown) {
    log.warn('[WorkspaceProvisioning] Workspace settings init failed (non-blocking):', (err as any)?.message);
  }
}
