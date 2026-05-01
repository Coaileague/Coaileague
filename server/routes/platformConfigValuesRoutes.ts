/**
 * Canonical Configuration Values — CRUD Routes
 * =============================================
 * Manages platform_config_groups and platform_config_values.
 *
 * Access rules:
 *  - READ:   any authenticated user (groups + active values)
 *  - WRITE system values (is_system=true, workspace_id=null):
 *      root_admin, deputy_admin, sysop only
 *  - WRITE workspace-scoped values (workspace_id=<own>):
 *      org_owner, co_owner of that workspace, + platform admins
 *  - DELETE: root_admin only for system values; owner for workspace values
 */

import { Router, type Request, type Response } from 'express';
import { pool } from '../db';
import { requireAuth } from '../auth';
import { requirePlatformRole } from '../rbac';
import { ensureWorkspaceAccess } from '../middleware/workspaceScope';
import type { AuthenticatedRequest } from '../rbac';
import { z } from 'zod';

export const platformConfigValuesRouter = Router();

const PLATFORM_ADMINS = ['root_admin', 'deputy_admin', 'sysop'];
const WORKSPACE_OWNERS = ['org_owner', 'co_owner'];

function isPlatformAdmin(req: Request): boolean {
  const r = req as AuthenticatedRequest;
  const role = (r as any).platformRole || '';
  return PLATFORM_ADMINS.includes(role);
}

function isWorkspaceOwner(req: Request): boolean {
  const r = req as AuthenticatedRequest;
  const role = (r as any).workspaceRole || r.workspaceRole || '';
  return WORKSPACE_OWNERS.includes(role);
}

// ─── GET /groups ───────────────────────────────────────────────────────────────
// List all config groups (optionally filter by domain)
platformConfigValuesRouter.get('/groups', requireAuth, async (req: Request, res: Response) => {
  try {
    const { domain } = req.query;
    let query = `
      SELECT g.*, COUNT(v.id) FILTER (WHERE v.is_active = true) AS active_value_count
      FROM platform_config_groups g
      LEFT JOIN platform_config_values v ON v.group_key = g.group_key
        AND (v.workspace_id IS NULL OR v.workspace_id = $1)
      ${domain ? `WHERE g.domain = $2` : ''}
      GROUP BY g.id
      ORDER BY g.sort_order ASC, g.label ASC
    `;
    const params: any[] = [(req.workspaceId) || null];
    if (domain) params.push(domain as string);

    const result = await pool.query(query, params);
    res.json({ groups: result.rows });
  } catch (err: unknown) {
    res.status(500).json({ error: 'Failed to load config groups' });
  }
});

// ─── GET /groups/:groupKey ─────────────────────────────────────────────────────
// Single group with its values
platformConfigValuesRouter.get('/groups/:groupKey', requireAuth, async (req: Request, res: Response) => {
  try {
    const { groupKey } = req.params;
    const workspaceId = req.workspaceId || null;

    const [groupResult, valuesResult] = await Promise.all([
      pool.query(`SELECT * FROM platform_config_groups WHERE group_key = $1 LIMIT 1`, [groupKey]),
      pool.query(`
        SELECT * FROM platform_config_values
        WHERE group_key = $1
          AND (workspace_id IS NULL OR workspace_id = $2)
        ORDER BY sort_order ASC, label ASC
      `, [groupKey, workspaceId]),
    ]);

    if (!groupResult.rows[0]) {
      return res.status(404).json({ error: 'Config group not found' });
    }

    res.json({ group: groupResult.rows[0], values: valuesResult.rows });
  } catch (err: unknown) {
    res.status(500).json({ error: 'Failed to load config group' });
  }
});

// ─── GET /values ───────────────────────────────────────────────────────────────
// List values (with optional ?group=, ?workspaceId=, ?includeInactive=true)
platformConfigValuesRouter.get('/values', requireAuth, async (req: Request, res: Response) => {
  try {
    const { group, includeInactive } = req.query;
    const workspaceId = req.workspaceId || null;
    const showInactive = includeInactive === 'true';

    const conditions: string[] = ['(v.workspace_id IS NULL OR v.workspace_id = $1)'];
    const params: any[] = [workspaceId];
    let idx = 2;

    if (group) {
      conditions.push(`v.group_key = $${idx++}`);
      params.push(group as string);
    }
    if (!showInactive) {
      conditions.push(`v.is_active = true`);
    }

    const query = `
      SELECT v.*, g.label AS group_label, g.domain
      FROM platform_config_values v
      JOIN platform_config_groups g ON g.group_key = v.group_key
      WHERE ${conditions.join(' AND ')}
      ORDER BY v.group_key ASC, v.sort_order ASC, v.label ASC
    `;

    const result = await pool.query(query, params);
    res.json({ values: result.rows });
  } catch (err: unknown) {
    res.status(500).json({ error: 'Failed to load config values' });
  }
});

// ─── POST /groups ──────────────────────────────────────────────────────────────
// Create a new config group (platform admins only)
platformConfigValuesRouter.post('/groups', requireAuth, async (req: Request, res: Response) => {
  if (!isPlatformAdmin(req)) {
    return res.status(403).json({ error: 'Platform admin role required to create config groups' });
  }
  try {
    const { groupKey, label, description, domain, tableName, columnName, isExtendable, sortOrder } = req.body;
    if (!groupKey || !label) {
      return res.status(400).json({ error: 'groupKey and label are required' });
    }

    const result = await pool.query(`
      INSERT INTO platform_config_groups
        (group_key, label, description, domain, table_name, column_name, is_extendable, is_system, sort_order)
      VALUES ($1,$2,$3,$4,$5,$6,$7,true,$8)
      ON CONFLICT (group_key) DO UPDATE SET
        label = EXCLUDED.label,
        description = EXCLUDED.description,
        domain = EXCLUDED.domain,
        table_name = EXCLUDED.table_name,
        column_name = EXCLUDED.column_name,
        is_extendable = EXCLUDED.is_extendable,
        sort_order = EXCLUDED.sort_order
      RETURNING *
    `, [groupKey, label, description || null, domain || null, tableName || null, columnName || null,
        isExtendable !== false, sortOrder ?? 0]);

    res.status(201).json({ group: result.rows[0] });
  } catch (err: unknown) {
    res.status(500).json({ error: 'Failed to create config group' });
  }
});

// ─── POST /values ──────────────────────────────────────────────────────────────
// Create a new config value
platformConfigValuesRouter.post('/values', requireAuth, async (req: Request, res: Response) => {
  try {
    const {
      groupKey, value, label, description, color, icon,
      sortOrder, workspaceId: bodyWorkspaceId, metadata,
    } = req.body;

    if (!groupKey || !value || !label) {
      return res.status(400).json({ error: 'groupKey, value, and label are required' });
    }

    // Workspace-scoped values: must be own workspace + owner role
    const targetWorkspaceId = bodyWorkspaceId || null;
    const isSystemValue = !targetWorkspaceId;

    if (isSystemValue && !isPlatformAdmin(req)) {
      return res.status(403).json({ error: 'Platform admin role required to create system-level config values' });
    }

    if (!isSystemValue) {
      const reqWsId = req.workspaceId;
      if (reqWsId !== targetWorkspaceId) {
        return res.status(403).json({ error: 'Can only create values for your own workspace' });
      }
      if (!isPlatformAdmin(req) && !isWorkspaceOwner(req)) {
        return res.status(403).json({ error: 'Workspace owner role required' });
      }
    }

    // Verify group exists and is_extendable for workspace values
    const group = await pool.query(
      `SELECT is_extendable FROM platform_config_groups WHERE group_key = $1`, [groupKey]
    );
    if (!group.rows[0]) return res.status(404).json({ error: 'Config group not found' });
    if (!isSystemValue && !group.rows[0].is_extendable) {
      return res.status(400).json({ error: 'This config group does not allow workspace-level extensions' });
    }

    const result = await pool.query(`
      INSERT INTO platform_config_values
        (group_key, value, label, description, color, icon, sort_order, is_active, is_system, workspace_id, metadata)
      VALUES ($1,$2,$3,$4,$5,$6,$7,true,$8,$9,$10)
      RETURNING *
    `, [groupKey, value, label, description || null, color || null, icon || null,
        sortOrder ?? 0, isSystemValue, targetWorkspaceId,
        metadata ? JSON.stringify(metadata) : null]);

    res.status(201).json({ value: result.rows[0] });
  } catch (err: unknown) {
    if (err.code === '23505') {
      return res.status(409).json({ error: 'A value with that key already exists in this group' });
    }
    res.status(500).json({ error: 'Failed to create config value' });
  }
});

// ─── PATCH /values/:id ─────────────────────────────────────────────────────────
// Update a config value (label, description, color, icon, sort_order, is_active)
platformConfigValuesRouter.patch('/values/:id', requireAuth, async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const existing = await pool.query(`SELECT * FROM platform_config_values WHERE id = $1`, [id]);
    if (!existing.rows[0]) return res.status(404).json({ error: 'Config value not found' });

    const row = existing.rows[0];
    const isSystemValue = !row.workspace_id;

    // Permission check
    if (isSystemValue && !isPlatformAdmin(req)) {
      return res.status(403).json({ error: 'Platform admin role required to edit system config values' });
    }
    if (!isSystemValue) {
      const reqWsId = req.workspaceId;
      if (reqWsId !== row.workspace_id) {
        return res.status(403).json({ error: 'Can only edit values for your own workspace' });
      }
      if (!isPlatformAdmin(req) && !isWorkspaceOwner(req)) {
        return res.status(403).json({ error: 'Workspace owner role required' });
      }
    }

    const { label, description, color, icon, sortOrder, isActive, metadata } = req.body;

    const updates: string[] = [];
    const params: any[] = [];
    let idx = 1;

    if (label !== undefined)       { updates.push(`label = $${idx++}`);       params.push(label); }
    if (description !== undefined) { updates.push(`description = $${idx++}`); params.push(description); }
    if (color !== undefined)       { updates.push(`color = $${idx++}`);       params.push(color); }
    if (icon !== undefined)        { updates.push(`icon = $${idx++}`);        params.push(icon); }
    if (sortOrder !== undefined)   { updates.push(`sort_order = $${idx++}`);  params.push(sortOrder); }
    if (isActive !== undefined)    { updates.push(`is_active = $${idx++}`);   params.push(isActive); }
    if (metadata !== undefined)    { updates.push(`metadata = $${idx++}`);    params.push(JSON.stringify(metadata)); }

    if (!updates.length) return res.status(400).json({ error: 'No update fields provided' });
    updates.push(`updated_at = NOW()`);
    params.push(id);

    const result = await pool.query(
      `UPDATE platform_config_values SET ${updates.join(', ')} WHERE id = $${idx} RETURNING *`,
      params
    );

    res.json({ value: result.rows[0] });
  } catch (err: unknown) {
    res.status(500).json({ error: 'Failed to update config value' });
  }
});

// ─── DELETE /values/:id ────────────────────────────────────────────────────────
// Delete a config value (system values: root_admin only; workspace values: owner)
platformConfigValuesRouter.delete('/values/:id', requireAuth, async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const existing = await pool.query(`SELECT * FROM platform_config_values WHERE id = $1`, [id]);
    if (!existing.rows[0]) return res.status(404).json({ error: 'Config value not found' });

    const row = existing.rows[0];
    const isSystemValue = !row.workspace_id;

    if (isSystemValue) {
      // System values: only root_admin can hard-delete; others can only deactivate
      const platformRole = req.platformRole || '';
      if (platformRole !== 'root_admin') {
        // Soft-deactivate instead
        await pool.query(`UPDATE platform_config_values SET is_active = false, updated_at = NOW() WHERE id = $1`, [id]);
        return res.json({ deactivated: true, message: 'System value deactivated (root_admin required to delete)' });
      }
      await pool.query(`DELETE FROM platform_config_values WHERE id = $1`, [id]);
    } else {
      const reqWsId = req.workspaceId;
      if (reqWsId !== row.workspace_id) {
        return res.status(403).json({ error: 'Can only delete values for your own workspace' });
      }
      if (!isPlatformAdmin(req) && !isWorkspaceOwner(req)) {
        return res.status(403).json({ error: 'Workspace owner role required' });
      }
      await pool.query(`DELETE FROM platform_config_values WHERE id = $1`, [id]);
    }

    res.json({ deleted: true });
  } catch (err: unknown) {
    res.status(500).json({ error: 'Failed to delete config value' });
  }
});

// ─── GET /domains ──────────────────────────────────────────────────────────────
// Distinct list of domains for filtering
platformConfigValuesRouter.get('/domains', requireAuth, async (_req: Request, res: Response) => {
  try {
    const result = await pool.query(`
      SELECT DISTINCT domain FROM platform_config_groups
      WHERE domain IS NOT NULL
      ORDER BY domain ASC
    `);
    res.json({ domains: result.rows.map((r: any) => r.domain) });
  } catch (err: unknown) {
    res.status(500).json({ error: 'Failed to load domains' });
  }
});
