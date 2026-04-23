import express from 'express';
import { requireAuth } from '../auth';
import { pool } from '../db';
import { TRINITY_INTAKE_FLOWS, detectIntakeFlow } from '../services/trinityIntakeFlows';
import { broadcastToWorkspace } from '../websocket';
import { universalAudit as universalAuditService } from '../services/universalAuditService';
import { logger as log } from '../lib/logger';

const router = express.Router();

router.post('/intake/start', requireAuth, async (req, res, next) => {
  try {
    const workspaceId = req.workspaceId || (req.user)?.workspaceId;
    const userId = req.user?.id;
    const { flowType, chatRoomId, triggerMessage } = req.body;

    if (!workspaceId) return res.status(400).json({ error: 'Workspace context required' });

    const resolvedFlowType = flowType ||
      detectIntakeFlow(triggerMessage || '') ||
      'support_triage';

    const flow = TRINITY_INTAKE_FLOWS[resolvedFlowType];
    if (!flow) return res.status(404).json({ error: 'Flow not found' });

    const session = await pool.query(`
      INSERT INTO trinity_intake_sessions
        (workspace_id, chat_room_id, user_id, session_type,
         flow_definition, current_step_index, status)
      VALUES ($1, $2, $3, $4, $5, 0, 'active')
      RETURNING *
    `, [workspaceId, chatRoomId || null, userId || null,
        resolvedFlowType, JSON.stringify(flow.steps)]);

    const sessionData = session.rows[0];
    const firstStep = flow.steps[0];

    broadcastToWorkspace(workspaceId, {
      type: 'trinity_intake_widget',
      data: {
        sessionId: sessionData.id,
        chatRoomId: chatRoomId || null,
        messageType: 'intake_greeting',
        greeting: flow.greeting,
        step: firstStep,
        stepIndex: 0,
        totalSteps: flow.steps.length,
        flowTitle: flow.title
      }
    });

    res.json({
      sessionId: sessionData.id,
      flowType: resolvedFlowType,
      firstStep,
      greeting: flow.greeting,
      totalSteps: flow.steps.length,
      flowTitle: flow.title
    });
  } catch (err) {
    next(err);
  }
});

router.post('/intake/:sessionId/respond', requireAuth, async (req, res, next) => {
  try {
    const workspaceId = req.workspaceId || (req.user)?.workspaceId;
    const { sessionId } = req.params;
    const { fieldId, value, stepIndex } = req.body;

    if (!workspaceId) return res.status(400).json({ error: 'Workspace context required' });

    const sessionResult = await pool.query(
      'SELECT * FROM trinity_intake_sessions WHERE id = $1 AND workspace_id = $2',
      [sessionId, workspaceId]
    );

    if (!sessionResult.rows[0]) {
      return res.status(404).json({ error: 'Session not found' });
    }

    const session = sessionResult.rows[0];
    const flow = TRINITY_INTAKE_FLOWS[session.session_type];
    if (!flow) return res.status(404).json({ error: 'Flow definition not found' });

    await pool.query(`
      INSERT INTO trinity_intake_responses
        (session_id, workspace_id, step_index, field_id,
         field_label, field_type, raw_value, parsed_value)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
    `, [
      sessionId, workspaceId, stepIndex, fieldId,
      flow.steps[stepIndex]?.question ?? '',
      flow.steps[stepIndex]?.widgetType ?? 'text',
      String(value),
      JSON.stringify(value)
    ]);

    const updatedData = {
      ...(session.collected_data || {}),
      [fieldId]: value
    };

    await pool.query(
      'UPDATE trinity_intake_sessions SET collected_data = $1, current_step_index = $2 WHERE id = $3',
      [JSON.stringify(updatedData), stepIndex, sessionId]
    );

    let nextStepIndex = stepIndex + 1;
    while (nextStepIndex < flow.steps.length) {
      const nextStep = flow.steps[nextStepIndex];
      if (nextStep.skipIf) {
        const skipFieldValue = updatedData[nextStep.skipIf.fieldId];
        if (skipFieldValue === nextStep.skipIf.value) {
          nextStepIndex++;
          continue;
        }
      }
      break;
    }

    if (nextStepIndex >= flow.steps.length) {
      await pool.query(`
        UPDATE trinity_intake_sessions
        SET status = 'completed',
            current_step_index = $1,
            completed_at = NOW()
        WHERE id = $2
      `, [nextStepIndex, sessionId]);

      broadcastToWorkspace(workspaceId, {
        type: 'trinity_intake_widget',
        data: {
          sessionId,
          chatRoomId: session.chat_room_id,
          messageType: 'intake_complete',
          completionMessage: flow.completionMessage,
          collectedData: updatedData
        }
      });

      processTrinityIntakeAction(
        sessionId, workspaceId, req.user?.id || 'unknown',
        flow.trinityAction, updatedData
      ).catch((err: unknown) => {
        log.error('[TrinityIntake] Async action processing failed:', (err as any)?.message);
      });

      return res.json({ complete: true, completionMessage: flow.completionMessage });
    }

    const nextStep = flow.steps[nextStepIndex];

    broadcastToWorkspace(workspaceId, {
      type: 'trinity_intake_widget',
      data: {
        sessionId,
        chatRoomId: session.chat_room_id,
        messageType: 'intake_next_step',
        step: nextStep,
        stepIndex: nextStepIndex,
        totalSteps: flow.steps.length,
        previousAnswer: value
      }
    });

    res.json({ complete: false, nextStep, nextStepIndex });
  } catch (err) {
    next(err);
  }
});

router.post('/intake/:sessionId/abandon', requireAuth, async (req, res, next) => {
  try {
    const workspaceId = req.workspaceId || (req.user)?.workspaceId;
    if (!workspaceId) return res.status(400).json({ error: 'Workspace context required' });
    await pool.query(
      "UPDATE trinity_intake_sessions SET status = 'abandoned' WHERE id = $1 AND workspace_id = $2",
      [req.params.sessionId, workspaceId]
    );
    res.json({ success: true });
  } catch (err) {
    next(err);
  }
});

router.get('/intake/sessions', requireAuth, async (req, res, next) => {
  try {
    const workspaceId = req.workspaceId || (req.user)?.workspaceId;
    if (!workspaceId) return res.status(400).json({ error: 'Workspace context required' });
    const limit = parseInt(String(req.query.limit || '20'));
    const sessions = await pool.query(
      `SELECT id, session_type, status, current_step_index,
              collected_data, trinity_action_taken,
              started_at, completed_at
       FROM trinity_intake_sessions
       WHERE workspace_id = $1
       ORDER BY created_at DESC
       LIMIT $2`,
      [workspaceId, limit]
    );
    res.json({ sessions: sessions.rows });
  } catch (err) {
    next(err);
  }
});

async function processTrinityIntakeAction(
  sessionId: string,
  workspaceId: string,
  userId: string,
  actionType: string,
  collectedData: Record<string, unknown>
): Promise<void> {
  try {
    // @ts-expect-error — TS migration: fix in refactoring sprint
    await universalAuditService.log({
      workspaceId,
      actorId: 'trinity-system-actor-000000000000',
      entityType: 'trinity_intake_session',
      entityId: sessionId,
      action: actionType,
      data: { collectedData, actionType }
    });

    await pool.query(
      'UPDATE trinity_intake_sessions SET trinity_action_taken = $1 WHERE id = $2',
      [actionType, sessionId]
    );

    log.info(`[TrinityIntake] Action processed: ${actionType} for session ${sessionId}`);
  } catch (err: unknown) {
    log.error('[TrinityIntake] Action processing error:', (err as any)?.message);
  }
}

export default router;
