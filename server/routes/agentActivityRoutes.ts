/**
 * Agent Activity Routes
 * ====================
 * Phase 6: API endpoints for the Agent Activity management dashboard.
 * All routes are workspace-scoped with RBAC enforcement.
 *
 * RBAC:
 *   org_owner / co_owner  → full access (all 4 panels)
 *   manager               → active tasks, completions, escalations (no registry)
 *   supervisor            → read-only completions only
 *   guard_officer / dispatcher → 403
 */

import { Router } from 'express';
import { requireAuth, type AuthenticatedRequest } from '../auth';
import { db } from '../db';
import { eq, and, inArray, or, isNull, desc, asc, sql, count } from 'drizzle-orm';
import { agentTasks, agentRegistry, agentTaskLogs } from '@shared/schema/domains/trinity/extended';
import { createLogger } from '../lib/logger';
import { z } from 'zod';
const log = createLogger('AgentActivityRoutes');


const router = Router();

const MANAGEMENT_ROLES = new Set(['org_owner', 'co_owner', 'manager']);
const FULL_ACCESS_ROLES = new Set(['org_owner', 'co_owner']);

function checkRole(req: AuthenticatedRequest, allowedRoles: Set<string>): boolean {
  const role = req.workspaceRole || (req.user)?.role || '';
  return allowedRoles.has(role);
}

// ─── Active Tasks (pending | in_progress | re_tasked) ─────────────────────────

router.get('/active', requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    if (!checkRole(req, MANAGEMENT_ROLES)) {
      return res.status(403).json({ error: 'Insufficient permissions' });
    }
    const wid = req.workspaceId!;
    const result = await db
      .select({
        id: agentTasks.id,
        agentKey: agentTasks.agentKey,
        taskType: agentTasks.taskType,
        status: agentTasks.status,
        retryCount: agentTasks.retryCount,
        maxRetries: agentTasks.maxRetries,
        spawnedAt: agentTasks.spawnedAt,
        relatedEntityType: agentTasks.relatedEntityType,
        relatedEntityId: agentTasks.relatedEntityId,
        spawnedBy: agentTasks.spawnedBy,
        agentName: agentRegistry.agentName,
      })
      .from(agentTasks)
      .leftJoin(
        agentRegistry,
        and(
          eq(agentTasks.agentKey, agentRegistry.agentKey),
          or(eq(agentRegistry.workspaceId, wid), isNull(agentRegistry.workspaceId))
        )
      )
      .where(
        and(
          eq(agentTasks.workspaceId, wid),
          inArray(agentTasks.status, ['pending', 'in_progress', 're_tasked'])
        )
      )
      .orderBy(desc(agentTasks.spawnedAt))
      .limit(100);

    res.json(result);
  } catch (err) {
    log.error('[AgentActivity] /active error:', err);
    res.status(500).json({ error: 'Failed to fetch active tasks' });
  }
});

// ─── Recent Completions (last 20 complete | escalated) ────────────────────────

router.get('/completions', requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const role = req.workspaceRole || (req.user)?.role || '';
    if (!MANAGEMENT_ROLES.has(role) && role !== 'supervisor') {
      return res.status(403).json({ error: 'Insufficient permissions' });
    }
    const wid = req.workspaceId!;
    const result = await db
      .select({
        id: agentTasks.id,
        agentKey: agentTasks.agentKey,
        taskType: agentTasks.taskType,
        status: agentTasks.status,
        completionScore: agentTasks.completionScore,
        confidenceLevel: agentTasks.confidenceLevel,
        evaluationResult: agentTasks.evaluationResult,
        trinityEvaluation: agentTasks.trinityEvaluation,
        flags: agentTasks.flags,
        inputPayload: agentTasks.inputPayload,
        outputPayload: agentTasks.outputPayload,
        spawnedAt: agentTasks.spawnedAt,
        completedAt: agentTasks.completedAt,
        evaluatedAt: agentTasks.evaluatedAt,
        relatedEntityType: agentTasks.relatedEntityType,
        relatedEntityId: agentTasks.relatedEntityId,
        agentName: agentRegistry.agentName,
      })
      .from(agentTasks)
      .leftJoin(
        agentRegistry,
        and(
          eq(agentTasks.agentKey, agentRegistry.agentKey),
          or(eq(agentRegistry.workspaceId, wid), isNull(agentRegistry.workspaceId))
        )
      )
      .where(
        and(
          eq(agentTasks.workspaceId, wid),
          inArray(agentTasks.status, ['complete', 'escalated', 'failed'])
        )
      )
      .orderBy(sql`COALESCE(${agentTasks.completedAt}, ${agentTasks.spawnedAt}) DESC`)
      .limit(20);

    res.json(result);
  } catch (err) {
    log.error('[AgentActivity] /completions error:', err);
    res.status(500).json({ error: 'Failed to fetch completions' });
  }
});

// ─── Single task detail (with full log timeline) ──────────────────────────────

router.get('/tasks/:taskId', requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const role = req.workspaceRole || (req.user)?.role || '';
    if (!MANAGEMENT_ROLES.has(role) && role !== 'supervisor') {
      return res.status(403).json({ error: 'Insufficient permissions' });
    }
    const wid = req.workspaceId!;
    const { taskId } = req.params;

    const taskRows = await db
      .select({
        task: agentTasks,
        agentName: agentRegistry.agentName,
        domain: agentRegistry.domain,
        completionCriteria: agentRegistry.completionCriteria,
      })
      .from(agentTasks)
      .leftJoin(
        agentRegistry,
        and(
          eq(agentTasks.agentKey, agentRegistry.agentKey),
          or(eq(agentRegistry.workspaceId, wid), isNull(agentRegistry.workspaceId))
        )
      )
      .where(and(eq(agentTasks.id, taskId), eq(agentTasks.workspaceId, wid)))
      .limit(1);

    if (taskRows.length === 0) {
      return res.status(404).json({ error: 'Task not found' });
    }

    const logs = await db
      .select({
        id: agentTaskLogs.id,
        logType: agentTaskLogs.logType,
        message: agentTaskLogs.message,
        metadata: agentTaskLogs.metadata,
        loggedAt: agentTaskLogs.loggedAt,
      })
      .from(agentTaskLogs)
      .where(and(eq(agentTaskLogs.agentTaskId, taskId), eq(agentTaskLogs.workspaceId, wid)))
      .orderBy(asc(agentTaskLogs.loggedAt));

    const row = taskRows[0];
    res.json({
      task: { ...row.task, agentName: row.agentName, domain: row.domain, completionCriteria: row.completionCriteria },
      logs,
    });
  } catch (err) {
    log.error('[AgentActivity] /tasks/:taskId error:', err);
    res.status(500).json({ error: 'Failed to fetch task details' });
  }
});

// ─── Escalations (evaluation_result = escalated_to_management) ────────────────

router.get('/escalations', requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    if (!checkRole(req, MANAGEMENT_ROLES)) {
      return res.status(403).json({ error: 'Insufficient permissions' });
    }
    const wid = req.workspaceId!;
    const result = await db
      .select({
        id: agentTasks.id,
        agentKey: agentTasks.agentKey,
        taskType: agentTasks.taskType,
        status: agentTasks.status,
        completionScore: agentTasks.completionScore,
        trinityEvaluation: agentTasks.trinityEvaluation,
        evaluationResult: agentTasks.evaluationResult,
        flags: agentTasks.flags,
        retryCount: agentTasks.retryCount,
        maxRetries: agentTasks.maxRetries,
        spawnedAt: agentTasks.spawnedAt,
        completedAt: agentTasks.completedAt,
        evaluatedAt: agentTasks.evaluatedAt,
        relatedEntityType: agentTasks.relatedEntityType,
        relatedEntityId: agentTasks.relatedEntityId,
        agentName: agentRegistry.agentName,
      })
      .from(agentTasks)
      .leftJoin(
        agentRegistry,
        and(
          eq(agentTasks.agentKey, agentRegistry.agentKey),
          or(eq(agentRegistry.workspaceId, wid), isNull(agentRegistry.workspaceId))
        )
      )
      .where(
        and(
          eq(agentTasks.workspaceId, wid),
          eq(agentTasks.evaluationResult, 'escalated_to_management')
        )
      )
      .orderBy(sql`COALESCE(${agentTasks.evaluatedAt}, ${agentTasks.spawnedAt}) DESC`);

    res.json(result);
  } catch (err) {
    log.error('[AgentActivity] /escalations error:', err);
    res.status(500).json({ error: 'Failed to fetch escalations' });
  }
});

router.get('/escalations/count', requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    if (!checkRole(req, MANAGEMENT_ROLES)) {
      return res.status(403).json({ count: 0 });
    }
    const wid = req.workspaceId!;
    const [row] = await db
      .select({ count: count() })
      .from(agentTasks)
      .where(
        and(
          eq(agentTasks.workspaceId, wid),
          eq(agentTasks.evaluationResult, 'escalated_to_management'),
          eq(agentTasks.status, 'escalated')
        )
      );
    res.json({ count: row?.count ?? 0 });
  } catch (err) {
    res.status(500).json({ count: 0 });
  }
});

// ─── Escalation actions (approve / dismiss / retask) ─────────────────────────

router.post('/escalations/:taskId/approve', requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    if (!checkRole(req, MANAGEMENT_ROLES)) {
      return res.status(403).json({ error: 'Insufficient permissions' });
    }
    const wid = req.workspaceId!;
    const { taskId } = req.params;

    await db
      .update(agentTasks)
      .set({
        evaluationResult: 'approved',
        status: 'complete',
        trinityEvaluation: sql`COALESCE(${agentTasks.trinityEvaluation}, '') || ' [Manually approved by management]'`,
        evaluatedAt: sql`NOW()`,
      })
      .where(and(eq(agentTasks.id, taskId), eq(agentTasks.workspaceId, wid)));

    await db.insert(agentTaskLogs).values({
      agentTaskId: taskId,
      workspaceId: wid,
      logType: 'resolution',
      message: 'Manually approved by management',
    });

    res.json({ success: true });
  } catch (err) {
    log.error('[AgentActivity] approve error:', err);
    res.status(500).json({ error: 'Failed to approve task' });
  }
});

router.post('/escalations/:taskId/dismiss', requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    if (!checkRole(req, MANAGEMENT_ROLES)) {
      return res.status(403).json({ error: 'Insufficient permissions' });
    }
    const wid = req.workspaceId!;
    const { taskId } = req.params;

    await db
      .update(agentTasks)
      .set({
        evaluationResult: 'denied',
        status: 'failed',
        trinityEvaluation: sql`COALESCE(${agentTasks.trinityEvaluation}, '') || ' [Dismissed by management]'`,
        evaluatedAt: sql`NOW()`,
      })
      .where(and(eq(agentTasks.id, taskId), eq(agentTasks.workspaceId, wid)));

    await db.insert(agentTaskLogs).values({
      agentTaskId: taskId,
      workspaceId: wid,
      logType: 'resolution',
      message: 'Dismissed by management',
    });

    res.json({ success: true });
  } catch (err) {
    log.error('[AgentActivity] dismiss error:', err);
    res.status(500).json({ error: 'Failed to dismiss task' });
  }
});

router.post('/escalations/:taskId/retask', requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    if (!checkRole(req, MANAGEMENT_ROLES)) {
      return res.status(403).json({ error: 'Insufficient permissions' });
    }
    const wid = req.workspaceId!;
    const { taskId } = req.params;

    const { spawnAgent } = await import('../services/ai-brain/agentSpawner');
    const taskRows = await db
      .select()
      .from(agentTasks)
      .where(and(eq(agentTasks.id, taskId), eq(agentTasks.workspaceId, wid)));

    if (taskRows.length === 0) {
      return res.status(404).json({ error: 'Task not found' });
    }
    const orig = taskRows[0];
    const inputPayload = typeof orig.inputPayload === 'string'
      ? JSON.parse(orig.inputPayload as string)
      : orig.inputPayload as Record<string, unknown>;

    await db.insert(agentTaskLogs).values({
      agentTaskId: taskId,
      workspaceId: wid,
      logType: 'retry',
      message: 'Manually retasked by management',
    });

    const newTask = await spawnAgent({
      workspaceId: wid,
      agentKey: orig.agentKey,
      taskType: orig.taskType,
      inputPayload,
      relatedEntityType: orig.relatedEntityType ?? undefined,
      relatedEntityId: orig.relatedEntityId ?? undefined,
      spawnedBy: 'management',
    });
    res.json({ success: true, newTaskId: newTask.id });
  } catch (err) {
    log.error('[AgentActivity] retask error:', err);
    res.status(500).json({ error: 'Failed to retask agent' });
  }
});

// ─── Agent Registry (org_owner / co_owner only) ───────────────────────────────

router.get('/registry', requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    if (!checkRole(req, FULL_ACCESS_ROLES)) {
      return res.status(403).json({ error: 'Insufficient permissions — Owner or Co-Owner only' });
    }
    const wid = req.workspaceId!;
    const result = await db
      .select({
        id: agentRegistry.id,
        agentKey: agentRegistry.agentKey,
        agentName: agentRegistry.agentName,
        domain: agentRegistry.domain,
        completionCriteria: agentRegistry.completionCriteria,
        isActive: agentRegistry.isActive,
        isDefault: agentRegistry.isDefault,
        createdAt: agentRegistry.createdAt,
      })
      .from(agentRegistry)
      .where(or(eq(agentRegistry.workspaceId, wid), isNull(agentRegistry.workspaceId)))
      .orderBy(desc(agentRegistry.isDefault), asc(agentRegistry.agentName));

    res.json(result);
  } catch (err) {
    log.error('[AgentActivity] /registry error:', err);
    res.status(500).json({ error: 'Failed to fetch registry' });
  }
});

router.patch('/registry/:agentKey/threshold', requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    if (!checkRole(req, FULL_ACCESS_ROLES)) {
      return res.status(403).json({ error: 'Insufficient permissions' });
    }
    const wid = req.workspaceId!;
    const { agentKey } = req.params;
    const { minScore } = req.body;

    if (typeof minScore !== 'number' || minScore < 0 || minScore > 100) {
      return res.status(400).json({ error: 'minScore must be a number between 0 and 100' });
    }

    const existing = await db
      .select({ id: agentRegistry.id })
      .from(agentRegistry)
      .where(and(eq(agentRegistry.agentKey, agentKey), eq(agentRegistry.workspaceId, wid)));

    if (existing.length > 0) {
      await db
        .update(agentRegistry)
        .set({
          completionCriteria: { min_score: minScore },
          updatedAt: sql`NOW()`,
        })
        .where(and(eq(agentRegistry.agentKey, agentKey), eq(agentRegistry.workspaceId, wid)));
    } else {
      const globalRows = await db
        .select()
        .from(agentRegistry)
        .where(and(eq(agentRegistry.agentKey, agentKey), isNull(agentRegistry.workspaceId)));

      if (globalRows.length > 0) {
        const g = globalRows[0];
        await db.insert(agentRegistry).values({
          workspaceId: wid,
          agentKey: g.agentKey,
          agentName: g.agentName,
          domain: g.domain,
          systemPrompt: g.systemPrompt,
          inputSchema: g.inputSchema || {},
          outputSchema: g.outputSchema || {},
          completionCriteria: { min_score: minScore },
          isDefault: false,
          isActive: true,
        });
      }
    }
    res.json({ success: true, minScore });
  } catch (err) {
    log.error('[AgentActivity] /registry/threshold error:', err);
    res.status(500).json({ error: 'Failed to update threshold' });
  }
});

router.patch('/registry/:agentKey/toggle', requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    if (!checkRole(req, FULL_ACCESS_ROLES)) {
      return res.status(403).json({ error: 'Insufficient permissions' });
    }
    const wid = req.workspaceId!;
    const { agentKey } = req.params;
    const { isActive } = req.body;

    if (typeof isActive !== 'boolean') {
      return res.status(400).json({ error: 'isActive must be boolean' });
    }

    const existing = await db
      .select({ id: agentRegistry.id })
      .from(agentRegistry)
      .where(and(eq(agentRegistry.agentKey, agentKey), eq(agentRegistry.workspaceId, wid)));

    if (existing.length > 0) {
      await db
        .update(agentRegistry)
        .set({
          isActive,
          updatedAt: sql`NOW()`,
        })
        .where(and(eq(agentRegistry.agentKey, agentKey), eq(agentRegistry.workspaceId, wid)));
    } else {
      const globalRows = await db
        .select()
        .from(agentRegistry)
        .where(and(eq(agentRegistry.agentKey, agentKey), isNull(agentRegistry.workspaceId)));

      if (globalRows.length > 0) {
        const g = globalRows[0];
        await db.insert(agentRegistry).values({
          workspaceId: wid,
          agentKey: g.agentKey,
          agentName: g.agentName,
          domain: g.domain,
          systemPrompt: g.systemPrompt,
          inputSchema: g.inputSchema || {},
          outputSchema: g.outputSchema || {},
          completionCriteria: g.completionCriteria || { min_score: 75 },
          isDefault: false,
          isActive,
        });
      }
    }
    res.json({ success: true, isActive });
  } catch (err) {
    log.error('[AgentActivity] /registry/toggle error:', err);
    res.status(500).json({ error: 'Failed to toggle agent' });
  }
});

export default router;
