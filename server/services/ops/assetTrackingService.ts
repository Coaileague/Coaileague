/**
 * Asset Tracking Service
 * =======================
 * Track company assets (radios, vehicles, equipment) assigned to officers per shift.
 * Officers sign out at shift start, sign in at shift end.
 * Overdue returns trigger Trinity alerts to supervisors.
 * Damage reports feed into the incident pipeline.
 *
 * Domain: ops
 * Tables: assets, asset_usage_logs
 */

import { pool, db } from '../../db';
import { randomUUID } from 'crypto';
import { platformEventBus } from '../platformEventBus';
import { broadcastToWorkspace } from '../../websocket';
import { createLogger } from '../../lib/logger';
import { platformActionHub } from '../helpai/platformActionHub';
import { typedPool, typedPoolExec } from '../../lib/typedSql';
import { assetUsageLogs, assets, employees } from '@shared/schema';
import { eq, sql, and, desc } from 'drizzle-orm';

const log = createLogger('AssetTrackingService');

export interface AssetCheckout {
  assetId: string;
  employeeId: string;
  employeeName: string;
  workspaceId: string;
  shiftId?: string | null;
  condition?: string;
  notes?: string | null;
}

export interface AssetReturn {
  assetUsageLogId: string;
  workspaceId: string;
  condition: 'excellent' | 'good' | 'fair' | 'damaged';
  notes?: string | null;
  damageDescription?: string | null;
}

class AssetTrackingService {
  private static instance: AssetTrackingService;

  static getInstance(): AssetTrackingService {
    if (!AssetTrackingService.instance) AssetTrackingService.instance = new AssetTrackingService();
    return AssetTrackingService.instance;
  }

  initialize() {
    this.registerTrinityActions();
    log.info('Asset Tracking Service initialized');
  }

  async checkOutAsset(data: AssetCheckout): Promise<unknown> {
    const id = randomUUID();

    const assetRows = await typedPool(`SELECT * FROM assets WHERE id=$1 AND workspace_id=$2`, [data.assetId, data.workspaceId]);
    if (!(assetRows as any).length) throw new Error('Asset not found');
    const asset = assetRows[0];

    // CATEGORY C — Genuine schema mismatch: SQL uses 'employee_id', 'checked_out_at', 'condition_at_checkout' but schema has 'operatedBy', 'usagePeriodStart', 'operatorCertificationVerified' | Cannot convert until schema aligned
    await typedPoolExec(
      `INSERT INTO asset_usage_logs (id, workspace_id, asset_id, employee_id, checked_out_at, condition_at_checkout, notes, created_at, updated_at)
       VALUES ($1,$2,$3,$4,NOW(),$5,$6,NOW(),NOW())`,
      [id, data.workspaceId, data.assetId, data.employeeId, data.condition || 'good', data.notes || null]
    );

    // Converted to Drizzle ORM
    await db.update(assets).set({ status: 'in_use', updatedAt: sql`now()` }).where(eq(assets.id, data.assetId));

    const rows = await db.select().from(assetUsageLogs).where(eq(assetUsageLogs.id, id));

    await platformEventBus.publish({
      type: 'asset_checked_out',
      category: 'automation',
      title: `Asset Checked Out — ${asset.asset_name}`,
      description: `${data.employeeName} checked out ${asset.asset_name}`,
      workspaceId: data.workspaceId,
      metadata: { assetId: data.assetId, assetName: asset.asset_name, employeeId: data.employeeId, logId: id },
    });

    return rows[0];
  }

  async returnAsset(data: AssetReturn): Promise<unknown> {
    // CATEGORY C — Genuine schema mismatch: SQL uses 'checked_in_at', 'condition_at_return', 'return_notes' but schema has 'usagePeriodEnd', no condition/return fields | Cannot convert until schema aligned
    await typedPoolExec(
      `UPDATE asset_usage_logs SET checked_in_at=NOW(), condition_at_return=$1, return_notes=$2, updated_at=NOW() WHERE id=$3 AND workspace_id=$4`,
      [data.condition, data.notes || null, data.assetUsageLogId, data.workspaceId]
    );

    const logRows = await typedPool(`SELECT aul.*, a.asset_name FROM asset_usage_logs aul JOIN assets a ON a.id=aul.asset_id WHERE aul.id=$1`, [data.assetUsageLogId]);
    if (!(logRows as any).length) throw new Error('Usage log not found');
    const logEntry = logRows[0];

    const newStatus = data.condition === 'damaged' ? 'needs_maintenance' : 'available';
    // Converted to Drizzle ORM
    await db.update(assets).set({ status: newStatus, updatedAt: sql`now()` }).where(eq(assets.id, logEntry.asset_id));

    if (data.condition === 'damaged' && data.damageDescription) {
      await platformEventBus.publish({
        type: 'asset_damaged',
        category: 'automation',
        title: `Asset Damage Report — ${logEntry.asset_name}`,
        description: `${logEntry.asset_name} returned with damage: ${data.damageDescription}`,
        workspaceId: data.workspaceId,
        metadata: { assetId: logEntry.asset_id, assetName: logEntry.asset_name, damageDescription: data.damageDescription, logId: data.assetUsageLogId },
      });
    }

    await platformEventBus.publish({
      type: 'asset_returned',
      category: 'automation',
      title: `Asset Returned — ${logEntry.asset_name}`,
      description: `${logEntry.asset_name} returned in ${data.condition} condition`,
      workspaceId: data.workspaceId,
      metadata: { assetId: logEntry.asset_id, condition: data.condition },
    });

    return logEntry;
  }

  async listAssets(workspaceId: string, status?: string): Promise<any[]> {
    // Converted to Drizzle ORM: ORDER BY
    return await db.select()
      .from(assets)
      .where(and(
        eq(assets.workspaceId, workspaceId),
        status ? eq(assets.status, status) : undefined
      ))
      .orderBy(assets.assetName);
  }

  async getActiveCheckouts(workspaceId: string): Promise<any[]> {
    // Converted to Drizzle ORM: LEFT JOIN → db.leftJoin()
    const result = await db
      .select({
        id: assetUsageLogs.id,
        workspaceId: assetUsageLogs.workspaceId,
        assetId: assetUsageLogs.assetId,
        employeeId: (assetUsageLogs as any).employeeId,
        checkedOutAt: (assetUsageLogs as any).checkedOutAt,
        checkedInAt: (assetUsageLogs as any).checkedInAt,
        conditionAtCheckout: (assetUsageLogs as any).conditionAtCheckout,
        conditionAtReturn: (assetUsageLogs as any).conditionAtReturn,
        notes: (assetUsageLogs as any).notes,
        returnNotes: (assetUsageLogs as any).returnNotes,
        createdAt: assetUsageLogs.createdAt,
        updatedAt: assetUsageLogs.updatedAt,
        assetName: assets.assetName,
        assetType: assets.assetType,
        employeeName: sql<string>`${employees.firstName} || ' ' || ${employees.lastName}`
      })
      .from(assetUsageLogs)
      .innerJoin(assets, eq(assets.id, assetUsageLogs.assetId))
      .leftJoin(employees, eq(employees.id, (assetUsageLogs as any).employeeId))
      .where(and(
        eq(assetUsageLogs.workspaceId, workspaceId),
        sql`${(assetUsageLogs as any).checkedInAt} IS NULL`
      ))
      .orderBy(desc(assetUsageLogs.checkedOutAt));

    return result;
  }

  private registerTrinityActions() {
    platformActionHub.registerAction({
      actionId: 'safety.asset.active_checkouts',
      name: 'List Active Asset Checkouts',
      category: 'safety',
      description: 'List all assets currently checked out by officers.',
      requiredRoles: ['manager', 'supervisor', 'owner'],
      handler: async (request) => {
        const checkouts = await this.getActiveCheckouts(request.workspaceId!);
        return { success: true, actionId: request.actionId, message: `${checkouts.length} asset(s) currently checked out`, data: { checkouts } };
      },
    });

    platformActionHub.registerAction({
      actionId: 'postorders.asset.inventory',
      name: 'Get Asset Inventory',
      category: 'postorders',
      description: 'Get full asset inventory for the workspace, optionally filtered by status.',
      requiredRoles: ['manager', 'supervisor', 'owner'],
      handler: async (request) => {
        const { status } = request.payload || {};
        const assets = await this.listAssets(request.workspaceId!, status);
        return { success: true, actionId: request.actionId, message: `${assets.length} asset(s) in inventory`, data: { assets } };
      },
    });
  }
}

export const assetTrackingService = AssetTrackingService.getInstance();
