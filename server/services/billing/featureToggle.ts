import { db } from '../../db';
import {
  workspaceAddons,
  billingAddons,
  workspaces,
  billingAuditLog,
  type WorkspaceAddon,
  type BillingAddon,
} from '@shared/schema';
import { eq, and } from 'drizzle-orm';

export interface FeatureAccess {
  featureKey: string;
  enabled: boolean;
  reason?: string;
  requiresAddon?: boolean;
  addonId?: string;
  addonName?: string;
}

export class FeatureToggleService {
  /**
   * Check if workspace has access to a specific feature
   */
  async hasFeatureAccess(
    workspaceId: string,
    featureKey: string
  ): Promise<FeatureAccess> {
    // Check account state first
    const [workspace] = await db.select()
      .from(workspaces)
      .where(eq(workspaces.id, workspaceId))
      .limit(1);

    if (!workspace) {
      return {
        featureKey,
        enabled: false,
        reason: 'Workspace not found',
      };
    }

    // Check if account is active
    if (workspace.accountState !== 'active') {
      return {
        featureKey,
        enabled: false,
        reason: `Account is ${workspace.accountState}`,
      };
    }

    // Check if feature requires an add-on
    const addon = await this.getAddonForFeature(featureKey);

    if (!addon) {
      // Feature doesn't require add-on (base subscription feature)
      return {
        featureKey,
        enabled: true,
        requiresAddon: false,
      };
    }

    // Check if workspace has the required add-on
    const workspaceAddon = await this.getWorkspaceAddon(workspaceId, addon.id);

    if (!workspaceAddon || workspaceAddon.status !== 'active') {
      return {
        featureKey,
        enabled: false,
        reason: `Requires ${addon.name} add-on`,
        requiresAddon: true,
        addonId: addon.id,
        addonName: addon.name,
      };
    }

    return {
      featureKey,
      enabled: true,
      requiresAddon: true,
      addonId: addon.id,
      addonName: addon.name,
    };
  }

  /**
   * Check multiple features at once
   */
  async hasFeatureAccessBatch(
    workspaceId: string,
    featureKeys: string[]
  ): Promise<Record<string, FeatureAccess>> {
    const results: Record<string, FeatureAccess> = {};

    for (const featureKey of featureKeys) {
      results[featureKey] = await this.hasFeatureAccess(workspaceId, featureKey);
    }

    return results;
  }

  /**
   * Get all enabled features for workspace
   */
  async getEnabledFeatures(workspaceId: string): Promise<string[]> {
    // Get workspace state
    const [workspace] = await db.select()
      .from(workspaces)
      .where(eq(workspaces.id, workspaceId))
      .limit(1);

    if (!workspace || workspace.accountState !== 'active') {
      return [];
    }

    // Get all active add-ons
    const activeAddons = await db.select({
      featureKey: billingAddons.featureKey,
    })
      .from(workspaceAddons)
      .innerJoin(billingAddons, eq(workspaceAddons.addonId, billingAddons.id))
      .where(
        and(
          eq(workspaceAddons.workspaceId, workspaceId),
          eq(workspaceAddons.status, 'active')
        )
      );

    // Extract feature keys, filtering out nulls
    const features = activeAddons
      .map(a => a.featureKey)
      .filter((key): key is string => key !== null);

    return features;
  }

  /**
   * Toggle feature on/off (for org admins)
   * Note: This doesn't purchase add-ons, just enables/disables already purchased ones
   */
  async toggleFeature(
    workspaceId: string,
    addonId: string,
    enabled: boolean,
    actorId: string
  ): Promise<WorkspaceAddon> {
    // Check if workspace has this add-on
    const [workspaceAddon] = await db.select()
      .from(workspaceAddons)
      .where(
        and(
          eq(workspaceAddons.workspaceId, workspaceId),
          eq(workspaceAddons.addonId, addonId)
        )
      )
      .limit(1);

    if (!workspaceAddon) {
      throw new Error('Add-on not found for workspace');
    }

    const newStatus = enabled ? 'active' : 'paused';

    const [updated] = await db.update(workspaceAddons)
      .set({
        status: newStatus,
        updatedAt: new Date(),
      })
      .where(eq(workspaceAddons.id, workspaceAddon.id))
      .returning();

    // Get addon details for audit log
    const [addon] = await db.select()
      .from(billingAddons)
      .where(eq(billingAddons.id, addonId))
      .limit(1);

    // Log audit event
    await db.insert(billingAuditLog).values({
      workspaceId,
      eventType: 'feature_toggled',
      eventCategory: 'feature',
      actorType: 'user',
      actorId,
      description: `${enabled ? 'Enabled' : 'Disabled'} ${addon?.name || addonId}`,
      relatedEntityType: 'addon',
      relatedEntityId: addonId,
      previousState: { status: workspaceAddon.status },
      newState: { status: newStatus },
    });

    return updated;
  }

  /**
   * Purchase add-on for workspace
   */
  async purchaseAddon(
    workspaceId: string,
    addonId: string,
    actorId: string
  ): Promise<WorkspaceAddon> {
    // Check if add-on exists
    const [addon] = await db.select()
      .from(billingAddons)
      .where(eq(billingAddons.id, addonId))
      .limit(1);

    if (!addon) {
      throw new Error('Add-on not found');
    }

    // Check if already purchased
    const existing = await db.select()
      .from(workspaceAddons)
      .where(
        and(
          eq(workspaceAddons.workspaceId, workspaceId),
          eq(workspaceAddons.addonId, addonId)
        )
      )
      .limit(1);

    if (existing.length > 0) {
      // Already purchased, just activate it
      const [updated] = await db.update(workspaceAddons)
        .set({
          status: 'active',
          updatedAt: new Date(),
        })
        .where(eq(workspaceAddons.id, existing[0].id))
        .returning();

      return updated;
    }

    // Create new add-on purchase
    const [workspaceAddon] = await db.insert(workspaceAddons)
      .values({
        workspaceId,
        addonId,
        status: 'active',
        purchasedAt: new Date(),
        purchasedBy: actorId,
      })
      .returning();

    // Log audit event
    await db.insert(billingAuditLog).values({
      workspaceId,
      eventType: 'addon_purchased',
      eventCategory: 'subscription',
      actorType: 'user',
      actorId,
      description: `Purchased ${addon.name}`,
      relatedEntityType: 'addon',
      relatedEntityId: addonId,
      newState: {
        status: 'active',
        price: addon.basePrice,
      },
    });

    return workspaceAddon;
  }

  /**
   * Cancel add-on subscription
   */
  async cancelAddon(
    workspaceId: string,
    addonId: string,
    actorId: string,
    reason?: string
  ): Promise<WorkspaceAddon> {
    const [workspaceAddon] = await db.select()
      .from(workspaceAddons)
      .where(
        and(
          eq(workspaceAddons.workspaceId, workspaceId),
          eq(workspaceAddons.addonId, addonId)
        )
      )
      .limit(1);

    if (!workspaceAddon) {
      throw new Error('Add-on not found for workspace');
    }

    const [updated] = await db.update(workspaceAddons)
      .set({
        status: 'cancelled',
        cancelledAt: new Date(),
        cancelledBy: actorId,
        cancellationReason: reason,
        updatedAt: new Date(),
      })
      .where(eq(workspaceAddons.id, workspaceAddon.id))
      .returning();

    // Get addon details
    const [addon] = await db.select()
      .from(billingAddons)
      .where(eq(billingAddons.id, addonId))
      .limit(1);

    // Log audit event
    await db.insert(billingAuditLog).values({
      workspaceId,
      eventType: 'addon_cancelled',
      eventCategory: 'subscription',
      actorType: 'user',
      actorId,
      description: `Cancelled ${addon?.name || addonId}${reason ? `: ${reason}` : ''}`,
      relatedEntityType: 'addon',
      relatedEntityId: addonId,
      previousState: { status: workspaceAddon.status },
      newState: { status: 'cancelled', reason },
    });

    return updated;
  }

  /**
   * Get workspace's add-ons
   */
  async getWorkspaceAddons(workspaceId: string): Promise<Array<{
    workspaceAddon: WorkspaceAddon;
    addon: BillingAddon;
  }>> {
    const results = await db.select()
      .from(workspaceAddons)
      .innerJoin(billingAddons, eq(workspaceAddons.addonId, billingAddons.id))
      .where(eq(workspaceAddons.workspaceId, workspaceId));

    return results.map(r => ({
      workspaceAddon: r.workspace_addons,
      addon: r.billing_addons,
    }));
  }

  /**
   * Get available add-ons (marketplace)
   */
  async getAvailableAddons(): Promise<BillingAddon[]> {
    return db.select()
      .from(billingAddons)
      .where(eq(billingAddons.isActive, true))
      .orderBy(billingAddons.name);
  }

  /**
   * Get add-on for a specific feature
   */
  private async getAddonForFeature(featureKey: string): Promise<BillingAddon | null> {
    const [addon] = await db.select()
      .from(billingAddons)
      .where(
        and(
          eq(billingAddons.featureKey, featureKey),
          eq(billingAddons.isActive, true)
        )
      )
      .limit(1);

    return addon || null;
  }

  /**
   * Get workspace's specific add-on
   */
  private async getWorkspaceAddon(
    workspaceId: string,
    addonId: string
  ): Promise<WorkspaceAddon | null> {
    const [addon] = await db.select()
      .from(workspaceAddons)
      .where(
        and(
          eq(workspaceAddons.workspaceId, workspaceId),
          eq(workspaceAddons.addonId, addonId)
        )
      )
      .limit(1);

    return addon || null;
  }
}

// Singleton instance
export const featureToggleService = new FeatureToggleService();
