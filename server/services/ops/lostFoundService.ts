/**
 * Lost & Found Service
 * =====================
 * Officers log found items with description, location, photo, date/time.
 * Each item gets a tracking number. Client notified if site-specific.
 * Unclaimed items flagged after configured duration.
 * All records are workspace_id isolated and visible to client portal.
 *
 * Domain: ops
 * Tables: lost_found_items
 */

import { pool, db } from '../../db';
import { randomUUID } from 'crypto';
import { platformEventBus } from '../platformEventBus';
import { broadcastToWorkspace } from '../../websocket';
import { createLogger } from '../../lib/logger';
import { platformActionHub } from '../helpai/platformActionHub';
import { typedPool, typedPoolExec } from '../../lib/typedSql';
import { lostFoundItems } from '@shared/schema';
import { eq, sql, and } from 'drizzle-orm';

const log = createLogger('LostFoundService');

export interface LostFoundItem {
  id: string;
  workspaceId: string;
  itemNumber: string;
  siteId: string | null;
  siteName: string | null;
  foundByEmployeeId: string | null;
  foundByName: string | null;
  foundAt: Date;
  foundLocation: string | null;
  itemDescription: string;
  category: string | null;
  status: 'found' | 'claimed' | 'disposed' | 'transferred';
  claimedBy: string | null;
  claimedAt: Date | null;
  storedLocation: string | null;
  notes: string | null;
  createdAt: Date;
  updatedAt: Date;
}

class LostFoundService {
  private static instance: LostFoundService;

  static getInstance(): LostFoundService {
    if (!LostFoundService.instance) LostFoundService.instance = new LostFoundService();
    return LostFoundService.instance;
  }

  initialize() {
    this.registerTrinityActions();
    log.info('Lost & Found Service initialized');
  }

  async logItem(data: {
    workspaceId: string;
    siteId?: string | null;
    siteName?: string | null;
    foundByEmployeeId?: string | null;
    foundByName?: string | null;
    foundAt?: Date;
    foundLocation?: string | null;
    itemDescription: string;
    category?: string | null;
    storedLocation?: string | null;
    notes?: string | null;
    metadata?: Record<string, any>;
  }): Promise<LostFoundItem> {
    const id = randomUUID();
    const itemNumber = `LF-${Date.now().toString(36).toUpperCase()}`;
    const foundAt = data.foundAt || new Date();

    // Converted to Drizzle ORM
    await db.insert(lostFoundItems).values({
      id,
      workspaceId: data.workspaceId,
      itemNumber,
      siteId: data.siteId || null,
      siteName: data.siteName || null,
      foundByEmployeeId: data.foundByEmployeeId || null,
      foundByName: data.foundByName || null,
      foundAt: foundAt,
      foundLocation: data.foundLocation || null,
      itemDescription: data.itemDescription,
      category: data.category || 'other',
      status: 'found',
      storedLocation: data.storedLocation || null,
      notes: data.notes || null,
      metadata: data.metadata || {},
      createdAt: sql`now()`,
      updatedAt: sql`now()`,
    });

    const rows = await db.select().from(lostFoundItems).where(eq(lostFoundItems.id, id));
    const item = (rows as any).rows[0] as LostFoundItem;

    await platformEventBus.publish({
      type: 'lost_found_item_logged',
      category: 'automation',
      title: `Lost & Found — ${itemNumber}`,
      description: `${data.foundByName || 'Officer'} logged found item: ${data.itemDescription}${data.siteName ? ` at ${data.siteName}` : ''}`,
      workspaceId: data.workspaceId,
      metadata: { itemId: id, itemNumber, itemDescription: data.itemDescription, siteId: data.siteId, siteName: data.siteName },
    });

    log.info(`Lost & Found item logged: ${itemNumber}`);
    return item;
  }

  async claimItem(data: {
    itemId: string;
    workspaceId: string;
    claimantName: string;
    claimantId?: string | null;
    relationship: string;
    releasedByOfficerId?: string | null;
    releasedByName?: string | null;
    notes?: string | null;
  }): Promise<LostFoundItem> {
    // Converted to Drizzle ORM
    await db.update(lostFoundItems).set({
      status: 'claimed',
      claimedBy: data.claimantName,
      claimedAt: sql`now()`,
      notes: data.notes || null,
      updatedAt: sql`now()`,
    }).where(and(eq(lostFoundItems.id, data.itemId), eq(lostFoundItems.workspaceId, data.workspaceId)));

    const rows = await db.select().from(lostFoundItems).where(eq(lostFoundItems.id, data.itemId));
    const item = (rows as any).rows[0] as LostFoundItem;

    await platformEventBus.publish({
      type: 'lost_found_item_claimed',
      category: 'automation',
      title: `Lost & Found Claimed — ${item.itemNumber}`,
      description: `${data.claimantName} claimed ${item.itemDescription}`,
      workspaceId: data.workspaceId,
      metadata: { itemId: data.itemId, itemNumber: item.itemNumber, claimantName: data.claimantName, relationship: data.relationship },
    });

    return item;
  }

  async listItems(workspaceId: string, status?: string, siteId?: string, limit = 50): Promise<LostFoundItem[]> {
    const { and, eq, desc } = await import('drizzle-orm');
    const conditions = [eq(lostFoundItems.workspaceId, workspaceId)];
    if (status) conditions.push(eq(lostFoundItems.status, status as any));
    if (siteId) conditions.push(eq(lostFoundItems.siteId, siteId));

    const result = await db
      .select()
      .from(lostFoundItems)
      .where(and(...conditions))
      .orderBy(desc(lostFoundItems.foundAt))
      .limit(limit);

    return result as LostFoundItem[];
  }

  async getUnclaimedItems(workspaceId: string, olderThanDays = 30): Promise<LostFoundItem[]> {
    // Converted to Drizzle ORM: getUnclaimedItems → INTERVAL
    const { lt, and } = await import('drizzle-orm');
    const result = await db
      .select()
      .from(lostFoundItems)
      .where(and(
        eq(lostFoundItems.workspaceId, workspaceId),
        eq(lostFoundItems.status, 'found'),
        lt(lostFoundItems.foundAt, sql`NOW() - (${sql.raw(olderThanDays.toString())} || ' days')::interval`),
      ))
      .orderBy(lostFoundItems.foundAt);

    return result as LostFoundItem[];
  }

  private registerTrinityActions() {
    platformActionHub.registerAction({
      actionId: 'safety.lost_found.list',
      name: 'List Lost & Found Items',
      category: 'safety',
      description: 'List lost and found items for the workspace. Optionally filter by status (found, claimed, disposed).',
      requiredRoles: ['employee', 'manager', 'supervisor', 'owner'],
      handler: async (request) => {
        const { status, siteId, limit = 20 } = request.payload || {};
        const items = await this.listItems(request.workspaceId!, status, siteId, limit);
        return { success: true, actionId: request.actionId, message: `${items.length} lost & found item(s)`, data: { items } };
      },
    });

    platformActionHub.registerAction({
      actionId: 'postorders.lost_found.log',
      name: 'Log Found Item',
      category: 'postorders',
      description: 'Log a newly found item into the lost and found system with description and location.',
      requiredRoles: ['employee', 'manager', 'supervisor', 'owner'],
      handler: async (request) => {
        const { itemDescription, foundLocation, siteName, foundByName, category } = request.payload || {};
        if (!itemDescription) return { success: false, actionId: request.actionId, message: 'itemDescription required', data: null };
        const item = await this.logItem({ workspaceId: request.workspaceId!, itemDescription, foundLocation, siteName, foundByName, category });
        return { success: true, actionId: request.actionId, message: `Item logged as ${item.itemNumber}`, data: item };
      },
    });

    platformActionHub.registerAction({
      actionId: 'external.lost_found.unclaimed_report',
      name: 'Unclaimed Items Report',
      category: 'external',
      description: 'Get all lost and found items that remain unclaimed after a specified number of days.',
      requiredRoles: ['manager', 'supervisor', 'owner'],
      handler: async (request) => {
        const { olderThanDays = 30 } = request.payload || {};
        const items = await this.getUnclaimedItems(request.workspaceId!, olderThanDays);
        return { success: true, actionId: request.actionId, message: `${items.length} item(s) unclaimed for ${olderThanDays}+ days`, data: { items, olderThanDays } };
      },
    });
  }
}

export const lostFoundService = LostFoundService.getInstance();
