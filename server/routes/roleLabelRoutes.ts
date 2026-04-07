/**
 * Role Label Routes
 * =================
 * Allows org_owners and co_owners to set custom display names for canonical
 * workspace roles. The canonical role identifier never changes — only the
 * label shown to end users is customised.
 *
 * GET  /api/role-labels             — get all labels for the current workspace
 * PUT  /api/role-labels/:role       — set a custom label for a specific role
 * DELETE /api/role-labels/:role     — reset a role label to platform default
 */

import { sanitizeError } from '../middleware/errorHandler';
import { Router, Request, Response } from 'express';
import { db } from '../db';
import { workspaceRoleLabels } from '@shared/schema';
import { eq, and } from 'drizzle-orm';
import { ensureWorkspaceAccess } from '../middleware/workspaceScope';
import { z } from 'zod';

const router = Router();

// Platform defaults — used when no custom label is set for a role
export const DEFAULT_ROLE_LABELS: Record<string, string> = {
  org_owner:         'Owner',
  co_owner:          'Deputy Chief',
  org_admin:         'Office Administrator',
  org_manager:       'Operations Manager',
  manager:           'Shift Supervisor',
  department_manager:'Department Manager',
  supervisor:        'Supervisor',
  staff:             'Staff',
  employee:          'Security Officer',
  auditor:           'Regulatory Auditor',
  contractor:        'Contract Officer',
};

function requireOwnerRole(req: Request, res: Response, next: Function) {
  const role = req.workspaceRole as string | undefined;
  const platform = req.platformRole as string | undefined;
  const isOwner = role === 'org_owner' || role === 'co_owner';
  const isPlatform = platform === 'root_admin' || platform === 'sysop' || platform === 'deputy_admin';
  if (!isOwner && !isPlatform) {
    return res.status(403).json({
      success: false,
      error: 'Only org owners can customise role display names.',
    });
  }
  next();
}

// GET /api/role-labels — all labels merged with defaults for the workspace
router.get('/', ensureWorkspaceAccess, async (req: Request, res: Response) => {
  try {
    const workspaceId = req.workspaceId as string;
    const custom = await db
      .select()
      .from(workspaceRoleLabels)
      .where(eq(workspaceRoleLabels.workspaceId, workspaceId));

    const customMap: Record<string, string> = {};
    for (const row of custom) {
      customMap[row.role] = row.displayName;
    }

    const merged = Object.entries(DEFAULT_ROLE_LABELS).map(([role, defaultLabel]) => ({
      role,
      displayName: customMap[role] ?? defaultLabel,
      defaultLabel,
      isCustom: role in customMap,
    }));

    return res.json({ success: true, labels: merged });
  } catch (err: unknown) {
    return res.status(500).json({ success: false, error: sanitizeError(err) });
  }
});

const upsertSchema = z.object({
  displayName: z.string().min(1).max(100),
});

// PUT /api/role-labels/:role — set a custom label
router.put('/:role', ensureWorkspaceAccess, requireOwnerRole, async (req: Request, res: Response) => {
  try {
    const workspaceId = req.workspaceId as string;
    const userId = (req.user as any)?.id;
    const role = req.params.role;

    if (!(role in DEFAULT_ROLE_LABELS)) {
      return res.status(400).json({ success: false, error: `Unknown role: ${role}` });
    }

    const parsed = upsertSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ success: false, error: 'displayName is required (1–100 chars)' });
    }

    const { displayName } = parsed.data;

    await db
      .insert(workspaceRoleLabels)
      .values({
        workspaceId,
        role: role as any,
        displayName,
        updatedBy: userId,
        updatedAt: new Date(),
      })
      .onConflictDoUpdate({
        target: [workspaceRoleLabels.workspaceId, workspaceRoleLabels.role],
        set: { displayName, updatedBy: userId, updatedAt: new Date() },
      });

    return res.json({ success: true, role, displayName });
  } catch (err: unknown) {
    return res.status(500).json({ success: false, error: sanitizeError(err) });
  }
});

// DELETE /api/role-labels/:role — reset to platform default
router.delete('/:role', ensureWorkspaceAccess, requireOwnerRole, async (req: Request, res: Response) => {
  try {
    const workspaceId = req.workspaceId as string;
    const role = req.params.role;

    if (!(role in DEFAULT_ROLE_LABELS)) {
      return res.status(400).json({ success: false, error: `Unknown role: ${role}` });
    }

    await db
      .delete(workspaceRoleLabels)
      .where(
        and(
          eq(workspaceRoleLabels.workspaceId, workspaceId),
          eq(workspaceRoleLabels.role, role as any),
        ),
      );

    return res.json({ success: true, role, displayName: DEFAULT_ROLE_LABELS[role] });
  } catch (err: unknown) {
    return res.status(500).json({ success: false, error: sanitizeError(err) });
  }
});

export default router;
