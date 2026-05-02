/**
 * Settings Sync Broadcaster
 * =========================
 * Single fan-out helper for settings mutations. Closes the wiring gap where
 * settings PATCH endpoints persisted to the DB but never told connected
 * clients (or sub-tenant workspaces that inherit) to refetch — co-admins
 * editing in parallel had to manually refresh to see each other's writes.
 *
 * Two channels:
 *   1. WebSocket broadcast → react-query clients subscribed to the workspace
 *      receive a `settings_updated` event and invalidate their cache.
 *   2. platformEventBus publish → server-side services (Trinity, automation)
 *      can react to settings changes without polling the DB.
 *
 * Sub-tenant fan-out: any workspace whose parent_workspace_id equals the
 * mutated workspace also receives the event so inherited reads refresh.
 */

import { db } from '../db';
import { workspaces } from '@shared/schema';
import { eq, inArray } from 'drizzle-orm';
import { broadcastToWorkspace } from '../websocket';
import { platformEventBus } from './platformEventBus';
import { createLogger } from '../lib/logger';

const log = createLogger('SettingsSyncBroadcaster');

export async function broadcastSettingsUpdated(
  workspaceId: string,
  scope: string,
  changedFields: string[],
): Promise<void> {
  const updatedAt = new Date().toISOString();
  const payload = {
    type: 'settings_updated',
    scope,
    workspaceId,
    changedFields,
    updatedAt,
  };

  // 1. Tell every WS client in the parent workspace to invalidate.
  try {
    broadcastToWorkspace(workspaceId, payload);
  } catch (err: unknown) {
    log.warn(`[SettingsSync] websocket broadcast failed for ${workspaceId}: ${(err instanceof Error ? err.message : String(err))}`);
  }

  // 2. Fan out to ALL descendants (recursive — not just direct children).
  //    A 3-level tree (grandparent → parent → child) needs the grandchild
  //    to refresh too; the previous direct-children-only loop missed it.
  //    Bounded BFS with depth 5 + 200-node visit cap as a safety guard
  //    against accidental cycles or pathological trees.
  try {
    const visited = new Set<string>([workspaceId]);
    let frontier = [workspaceId];
    for (let depth = 0; depth < 5 && frontier.length > 0; depth++) {
      const children = await db
        .select({ id: workspaces.id })
        .from(workspaces)
        .where(inArray(workspaces.parentWorkspaceId, frontier));

      const next: string[] = [];
      for (const child of children) {
        if (visited.has(child.id)) continue;
        if (visited.size >= 200) break;
        visited.add(child.id);
        next.push(child.id);
        try {
          broadcastToWorkspace(child.id, { ...payload, inheritedFrom: workspaceId });
        } catch (_) { /* per-sub failures are non-fatal */ }
      }
      frontier = next;
    }
  } catch (err: unknown) {
    log.warn(`[SettingsSync] sub-tenant fan-out failed for ${workspaceId}: ${(err instanceof Error ? err.message : String(err))}`);
  }

  // 3. Publish to the platform event bus so server-side services can react.
  try {
    await platformEventBus.publish({
      type: 'settings_updated',
      category: 'platform',
      title: `${scope} updated`,
      description: `Workspace ${workspaceId} ${scope} mutated (${changedFields.length} field(s))`,
      workspaceId,
      metadata: { scope, changedFields, updatedAt },
    });
  } catch (err: unknown) {
    log.warn(`[SettingsSync] event bus publish failed for ${workspaceId}: ${(err instanceof Error ? err.message : String(err))}`);
  }
}
