/**
 * TRINITY COGNITIVE LOAD MONITOR
 * ================================
 * Trinity knows her own limits. She doesn't collapse silently under pressure.
 *
 * Like a skilled human colleague managing a heavy workload, she assesses her
 * current operational load, communicates it transparently, throttles non-critical
 * autonomous work when needed, and recovers systematically through dream state.
 *
 * Load thresholds:
 *   Light   (0-39):  Normal operation
 *   Normal  (40-59): Deprioritize curiosity queue
 *   Elevated (40-59): Route non-urgent items to dream state
 *   Heavy   (60-79): Pause new autonomous task self-assignment
 *   Overloaded (80+): Halt all non-critical, notify owner
 */

import { pool, db } from '../../db';
import { platformEventBus } from '../platformEventBus';
import { createNotification } from '../../notifications';
import { typedPool, typedPoolExec } from '../../lib/typedSql';
import { trinityCognitiveState } from '@shared/schema';
import { sql, count, and, eq, isNull } from 'drizzle-orm';

import { createLogger } from '../../lib/logger';
const log = createLogger('trinityCognitiveLoadMonitor');

export type LoadStatus = 'light' | 'normal' | 'elevated' | 'heavy' | 'overloaded';

export interface CognitiveState {
  workspaceId: string;
  activeAutonomousTasks: number;
  pendingAutonomousTasks: number;
  openInvestigations: number;
  openCuriosityItems: number;
  incubationQueueSize: number;
  activeCriticalEscalations: number;
  currentLoadScore: number;
  loadStatus: LoadStatus;
  autonomousTaskThrottled: boolean;
  lastAssessedAt: Date;
}

class TrinityCognitiveLoadMonitor {

  /** Assess and persist current cognitive state for a workspace */
  async assessWorkspace(workspaceId: string): Promise<CognitiveState> {
    const [
      atqCounts,
      curiosityCount,
      incubationCount,
      escalationCount
    ] = await Promise.all([
      this.getATQCounts(workspaceId),
      this.getCuriosityCount(workspaceId),
      this.getIncubationCount(workspaceId),
      this.getEscalationCount(workspaceId)
    ]);

    const activeTasks = atqCounts.active;
    const pendingTasks = atqCounts.pending;

    const loadScore = Math.min(100,
      activeCriticalEscalations(escalationCount) * 20 +
      activeTasks * 5 +
      pendingTasks * 2 +
      curiosityCount * 1 +
      incubationCount * 3 +
      escalationCount * 8
    );

    const loadStatus: LoadStatus =
      loadScore >= 80 ? 'overloaded' :
      loadScore >= 60 ? 'heavy' :
      loadScore >= 40 ? 'elevated' :
      loadScore >= 20 ? 'normal' : 'light';

    const throttled = loadScore >= 60;

    const state: CognitiveState = {
      workspaceId,
      activeAutonomousTasks: activeTasks,
      pendingAutonomousTasks: pendingTasks,
      openInvestigations: 0,
      openCuriosityItems: curiosityCount,
      incubationQueueSize: incubationCount,
      activeCriticalEscalations: escalationCount,
      currentLoadScore: loadScore,
      loadStatus,
      autonomousTaskThrottled: throttled,
      lastAssessedAt: new Date()
    };

    // Converted to Drizzle ORM: ON CONFLICT → onConflictDoUpdate
    await db.insert(trinityCognitiveState).values({
      workspaceId,
      activeAutonomousTasks: activeTasks,
      pendingAutonomousTasks: pendingTasks,
      openInvestigations: 0,
      openCuriosityItems: curiosityCount,
      incubationQueueSize: incubationCount,
      activeCriticalEscalations: escalationCount,
      currentLoadScore: loadScore,
      loadStatus,
      autonomousTaskThrottled: throttled,
      lastAssessedAt: sql`now()`,
    }).onConflictDoUpdate({
      target: trinityCognitiveState.workspaceId,
      set: {
        activeAutonomousTasks: activeTasks,
        pendingAutonomousTasks: pendingTasks,
        openCuriosityItems: curiosityCount,
        incubationQueueSize: incubationCount,
        activeCriticalEscalations: escalationCount,
        currentLoadScore: loadScore,
        loadStatus,
        autonomousTaskThrottled: throttled,
        lastAssessedAt: sql`now()`,
      },
    }).catch(() => null);

    if (loadStatus === 'overloaded') {
      await this.notifyOwnerOfOverload(workspaceId, state).catch(() => null);
    }

    if (loadStatus === 'heavy' || loadStatus === 'overloaded') {
      platformEventBus.publish({
        eventType: 'cognitive_load_elevated',
        title: `Trinity Cognitive Load: ${loadStatus.toUpperCase()}`,
        description: `Load score: ${loadScore}/100. Autonomous task throttling: ${throttled ? 'ACTIVE' : 'OFF'}.`,
        data: { workspaceId, loadScore, loadStatus, throttled }
      }).catch(() => null);
    }

    return state;
  }

  /** Check if autonomous tasks should be throttled for a workspace */
  async isThrottled(workspaceId: string): Promise<boolean> {
    // CATEGORY C — Raw SQL retained: LIMIT | Tables: trinity_cognitive_state | Verified: 2026-03-23
    const { rows } = await typedPool(`
      SELECT autonomous_task_throttled FROM trinity_cognitive_state
      WHERE workspace_id = $1 LIMIT 1
    `, [workspaceId]).catch(() => ({ rows: [] }));
    // @ts-expect-error — TS migration: fix in refactoring sprint
    return rows[0]?.autonomous_task_throttled || false;
  }

  /** Get current state (from cache) */
  async getCurrentState(workspaceId: string): Promise<CognitiveState | null> {
    // CATEGORY C — Raw SQL retained: LIMIT | Tables: trinity_cognitive_state | Verified: 2026-03-23
    const { rows } = await typedPool(`
      SELECT * FROM trinity_cognitive_state WHERE workspace_id = $1 LIMIT 1
    `, [workspaceId]).catch(() => ({ rows: [] }));
    if (!rows[0]) return null;
    const r = rows[0];
    return {
      // @ts-expect-error — TS migration: fix in refactoring sprint
      workspaceId: r.workspace_id,
      // @ts-expect-error — TS migration: fix in refactoring sprint
      activeAutonomousTasks: r.active_autonomous_tasks,
      // @ts-expect-error — TS migration: fix in refactoring sprint
      pendingAutonomousTasks: r.pending_autonomous_tasks,
      // @ts-expect-error — TS migration: fix in refactoring sprint
      openInvestigations: r.open_investigations,
      // @ts-expect-error — TS migration: fix in refactoring sprint
      openCuriosityItems: r.open_curiosity_items,
      // @ts-expect-error — TS migration: fix in refactoring sprint
      incubationQueueSize: r.incubation_queue_size,
      // @ts-expect-error — TS migration: fix in refactoring sprint
      activeCriticalEscalations: r.active_critical_escalations,
      // @ts-expect-error — TS migration: fix in refactoring sprint
      currentLoadScore: r.current_load_score,
      // @ts-expect-error — TS migration: fix in refactoring sprint
      loadStatus: r.load_status,
      // @ts-expect-error — TS migration: fix in refactoring sprint
      autonomousTaskThrottled: r.autonomous_task_throttled,
      // @ts-expect-error — TS migration: fix in refactoring sprint
      lastAssessedAt: new Date(r.last_assessed_at)
    };
  }

  /** Build context string for injection into Trinity's system prompt */
  async buildLoadContextBlock(workspaceId: string): Promise<string> {
    const state = await this.getCurrentState(workspaceId);
    if (!state || state.loadStatus === 'light' || state.loadStatus === 'normal') return '';

    if (state.loadStatus === 'overloaded') {
      return '\n[COGNITIVE LOAD: OVERLOADED] Trinity is at maximum operational capacity. Prioritize only critical items. Communicate this transparently if the user asks about delays in autonomous work.\n';
    }
    if (state.loadStatus === 'heavy') {
      return '\n[COGNITIVE LOAD: ELEVATED] Trinity is managing significant operational volume. Non-urgent autonomous tasks are queued for dream state processing.\n';
    }
    return '';
  }

  private async getATQCounts(workspaceId: string): Promise<{ active: number; pending: number }> {
    // CATEGORY C — Raw SQL retained: FILTER (WHERE | Tables: trinity_autonomous_tasks | Verified: 2026-03-23
    const { rows } = await typedPool(`
      SELECT
        COUNT(*) FILTER (WHERE status = 'in_progress') as active,
        COUNT(*) FILTER (WHERE status = 'pending') as pending
      FROM trinity_autonomous_tasks
      WHERE workspace_id = $1
    `, [workspaceId]).catch(() => ({ rows: [{ active: 0, pending: 0 }] }));
    return {
      // @ts-expect-error — TS migration: fix in refactoring sprint
      active: parseInt(rows[0]?.active || '0', 10),
      // @ts-expect-error — TS migration: fix in refactoring sprint
      pending: parseInt(rows[0]?.pending || '0', 10)
    };
  }

  private async getCuriosityCount(workspaceId: string): Promise<number> {
    // CATEGORY C — Raw SQL retained: COUNT( | Tables: curiosity_queue | Verified: 2026-03-23
    const { rows } = await typedPool(`
      SELECT COUNT(*) as count FROM curiosity_queue
      WHERE workspace_id = $1 AND status = 'queued'
    `, [workspaceId]).catch(() => ({ rows: [{ count: 0 }] }));
    // @ts-expect-error — TS migration: fix in refactoring sprint
    return parseInt(rows[0]?.count || '0', 10);
  }

  private async getIncubationCount(workspaceId: string): Promise<number> {
    // CATEGORY C — Raw SQL retained: COUNT( | Tables: incubation_queue | Verified: 2026-03-23
    const { rows } = await typedPool(`
      SELECT COUNT(*) as count FROM incubation_queue
      WHERE workspace_id = $1 AND status = 'incubating'
    `, [workspaceId]).catch(() => ({ rows: [{ count: 0 }] }));
    // @ts-expect-error — TS migration: fix in refactoring sprint
    return parseInt(rows[0]?.count || '0', 10);
  }

  private async getEscalationCount(workspaceId: string): Promise<number> {
    // Converted to Drizzle ORM: INTERVAL → sql fragment
    const rows = await db.select({ count: count() })
      .from((await import('@shared/schema')).notifications)
      .where(and(
        eq((await import('@shared/schema')).notifications.workspaceId, workspaceId),
        // @ts-expect-error — TS migration: fix in refactoring sprint
        eq((await import('@shared/schema')).notifications.priority, 'critical'),
        isNull((await import('@shared/schema')).notifications.readAt),
        sql`${(await import('@shared/schema')).notifications.createdAt} >= NOW() - INTERVAL '24 hours'`
      ))
      .catch(() => []);

    // @ts-expect-error — TS migration: fix in refactoring sprint
    return parseInt(rows[0]?.count || '0', 10);
  }

  private async notifyOwnerOfOverload(workspaceId: string, state: CognitiveState): Promise<void> {
    // CATEGORY C — Raw SQL retained: LIMIT | Tables: workspace_members | Verified: 2026-03-23
    const { rows: ownerRows } = await typedPool(`
      SELECT DISTINCT wm.user_id FROM workspace_members wm
      WHERE wm.workspace_id = $1 AND wm.role = 'owner' LIMIT 1
    `, [workspaceId]).catch(() => ({ rows: [] }));
    if (!ownerRows[0]?.user_id) return;

    // CATEGORY C — Raw SQL retained: INTERVAL | Tables: notifications | Verified: 2026-03-23
    const recentNotify = await typedPool(`
      SELECT 1 FROM notifications WHERE workspace_id = $1 AND type = 'cognitive_overload'
        AND created_at >= NOW() - INTERVAL '4 hours' LIMIT 1
    `, [workspaceId]).catch(() => ([]));
    // @ts-expect-error — TS migration: fix in refactoring sprint
    if (recentNotify.length > 0) return;

    await createNotification({
      workspaceId,
      userId: ownerRows[0].user_id,
      type: 'cognitive_overload',
      title: 'Trinity: High Operational Capacity',
      message: `Trinity is at high operational capacity (load score: ${state.currentLoadScore}/100). Critical items are being prioritized. Non-urgent autonomous work resumes in tonight's processing cycle. Active tasks: ${state.activeAutonomousTasks}, Pending: ${state.pendingAutonomousTasks}, Critical escalations: ${state.activeCriticalEscalations}.`,
      priority: 'high'
    } as any).catch(() => null);
  }
}

function activeCriticalEscalations(count: number): number {
  return count;
}

export const trinityCognitiveLoadMonitor = new TrinityCognitiveLoadMonitor();
