import { db } from '../db';
import {
  orgFinanceSettings,
  workspaces,
  workspaceMembers,
  sites,
  universalAuditTrail,
} from '@shared/schema';
import { eq } from 'drizzle-orm';
import { createLogger } from '../lib/logger';
import { SubscriptionManager } from './billing/subscriptionManager';
import { isStripeConfigured } from './billing/stripeClient';

const log = createLogger('workspaceProvisioningService');

/**
 * Day-0 workspace provisioning.
 * Called once when a workspace is first created.
 * Each step is non-blocking — a failure in one step does NOT abort the rest.
 */
export async function provisionWorkspace(params: {
  workspaceId: string;
  ownerId: string;
  workspaceName?: string;
}): Promise<void> {
  const { workspaceId, ownerId, workspaceName } = params;

  // ── Step 1: Stripe customer ─────────────────────────────────────────────
  try {
    if (isStripeConfigured()) {
      const subscriptionManager = new SubscriptionManager();
      await subscriptionManager.ensureStripeCustomer(workspaceId);
    }
  } catch (err: unknown) {
    log.warn('[WorkspaceProvisioning] Stripe customer provisioning failed (non-blocking):', (err as any)?.message);
  }

  // ── Step 2: Finance settings ────────────────────────────────────────────
  try {
    await db.insert(orgFinanceSettings).values({
      workspaceId,
      updatedBy: ownerId,
    }).onConflictDoNothing();
  } catch (err: unknown) {
    log.warn('[WorkspaceProvisioning] Finance settings init failed (non-blocking):', (err as any)?.message);
  }

  // ── Step 3: Payroll cycle default ───────────────────────────────────────
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

  // ── Step 4: Owner workspace membership record ───────────────────────────
  // Ensures the owner appears in workspace_members so permission checks work
  try {
    await db.insert(workspaceMembers).values({
      userId: ownerId,
      workspaceId,
      role: 'org_owner',
      status: 'active',
    } as any).onConflictDoNothing();
  } catch (err: unknown) {
    log.warn('[WorkspaceProvisioning] Owner membership init failed (non-blocking):', (err as any)?.message);
  }

  // ── Step 5: Default HQ site ─────────────────────────────────────────────
  // Every workspace needs at least one site so scheduling can start immediately
  try {
    await db.insert(sites).values({
      workspaceId,
      name: 'HQ',
      status: 'active',
    } as any).onConflictDoNothing();
  } catch (err: unknown) {
    log.warn('[WorkspaceProvisioning] Default HQ site init failed (non-blocking):', (err as any)?.message);
  }

  // ── Step 6: Audit trail — workspace created ─────────────────────────────
  try {
    await db.insert(universalAuditTrail).values({
      workspaceId,
      actorId: ownerId,
      actorType: 'user',
      actorRole: 'org_owner',
      action: 'workspace.created',
      entityType: 'workspace',
      entityId: workspaceId,
      entityName: workspaceName || workspaceId,
      changeType: 'action',
      metadata: {
        provisionedAt: new Date().toISOString(),
        steps: ['stripe', 'finance_settings', 'payroll_cycle', 'owner_membership', 'default_site'],
      },
      sourceRoute: '/api/workspace',
    } as any);
  } catch (err: unknown) {
    log.warn('[WorkspaceProvisioning] Audit trail write failed (non-blocking):', (err as any)?.message);
  }

  log.info('[WorkspaceProvisioning] Day-0 provisioning complete', { workspaceId, ownerId });
}
