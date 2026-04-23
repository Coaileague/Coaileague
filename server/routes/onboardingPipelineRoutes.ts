import { Router } from 'express';
import type { Request, Response } from 'express';
import { pool } from '../db';
import { requireAuth } from '../auth';
import { createLogger } from '../lib/logger';
import { employeeOnboardingPipeline } from '../services/employeeOnboardingPipelineService';

const log = createLogger('OnboardingPipelineRoutes');
const router = Router();

function requireWorkspaceUser(req: Request, res: Response): (NonNullable<Request['user']> & { workspaceId: string }) | null {
  const user = req.user;
  const workspaceId = user?.workspaceId || req.workspaceId;
  if (!user || !workspaceId) {
    res.status(401).json({ error: 'Unauthorized' });
    return null;
  }
  return { ...user, workspaceId };
}

// POST /api/onboarding-pipeline — create a pipeline for an employee
router.post('/', requireAuth, async (req: Request, res: Response) => {
  try {
    const user = requireWorkspaceUser(req, res);
    if (!user) return;
    const { entityId, entityType = 'employee', pipelineType, assignedToUserId } = req.body;

    if (!entityId) return res.status(400).json({ error: 'entityId required' });

    const pipeline = await employeeOnboardingPipeline.createPipeline({
      workspaceId: user.workspaceId,
      entityType,
      entityId,
      pipelineType,
      assignedToUserId,
    });
    res.status(201).json(pipeline);
  } catch (err: any) {
    log.error('Failed to create pipeline:', err?.message);
    res.status(500).json({ error: 'Failed to create pipeline' });
  }
});

// GET /api/onboarding-pipeline — list all pipelines for workspace
router.get('/', requireAuth, async (req: Request, res: Response) => {
  try {
    const user = requireWorkspaceUser(req, res);
    if (!user) return;
    const result = await pool.query(
      `SELECT op.id, op.pipeline_type, op.entity_type, op.entity_id,
              op.status, op.current_step, op.total_steps, op.created_at, op.updated_at,
              op.completed_at, op.trinity_monitoring,
              e.first_name || ' ' || e.last_name AS employee_name,
              e.email AS employee_email
       FROM onboarding_pipelines op
       LEFT JOIN employees e ON e.id = op.entity_id
       WHERE op.workspace_id = $1
       ORDER BY op.created_at DESC
       LIMIT 200`,
      [user.workspaceId]
    );
    res.json(result.rows);
  } catch (err: any) {
    log.error('Failed to list pipelines:', err?.message);
    res.status(500).json({ error: 'Failed to list pipelines' });
  }
});

// GET /api/onboarding-pipeline/:id — get pipeline with full step detail
router.get('/:id', requireAuth, async (req: Request, res: Response) => {
  try {
    const user = requireWorkspaceUser(req, res);
    if (!user) return;
    const pipeline = await employeeOnboardingPipeline.getPipeline(req.params.id);
    if (!pipeline || pipeline.workspace_id !== user.workspaceId) {
      return res.status(404).json({ error: 'Pipeline not found' });
    }
    const progress = await employeeOnboardingPipeline.getProgress(req.params.id);
    res.json({ ...pipeline, progress });
  } catch (err: any) {
    log.error('Failed to get pipeline:', err?.message);
    res.status(500).json({ error: 'Failed to get pipeline' });
  }
});

// GET /api/onboarding-pipeline/public/:id — public pipeline progress (no auth — for employee self-service)
router.get('/public/:id', async (req: Request, res: Response) => {
  try {
    const pipeline = await employeeOnboardingPipeline.getPipeline(req.params.id);
    if (!pipeline) return res.status(404).json({ error: 'Onboarding pipeline not found' });

    const progress = await employeeOnboardingPipeline.getProgress(req.params.id);

    // Return only safe fields (no internal workspace data)
    res.json({
      id: pipeline.id,
      pipelineType: pipeline.pipeline_type,
      status: pipeline.status,
      progress,
      createdAt: pipeline.created_at,
    });
  } catch (err: any) {
    log.error('Failed to get public pipeline:', err?.message);
    res.status(500).json({ error: 'Failed to get pipeline' });
  }
});

// PATCH /api/onboarding-pipeline/:id/steps/:stepId/complete — mark a step complete
router.patch('/:id/steps/:stepId/complete', requireAuth, async (req: Request, res: Response) => {
  try {
    const user = requireWorkspaceUser(req, res);
    if (!user) return;
    const pipeline = await employeeOnboardingPipeline.getPipeline(req.params.id);
    if (!pipeline || pipeline.workspace_id !== user.workspaceId) {
      return res.status(404).json({ error: 'Pipeline not found' });
    }

    const updated = await employeeOnboardingPipeline.completeStep(
      req.params.id,
      req.params.stepId,
      req.body.data
    );
    res.json(updated);
  } catch (err: any) {
    log.error('Failed to complete step:', err?.message);
    res.status(500).json({ error: 'Failed to complete step' });
  }
});

// PATCH /api/onboarding-pipeline/:id/steps/:stepId/complete (public — for token-based self-service)
// POST /api/onboarding-pipeline/public/:id/steps/:stepId/complete
router.post('/public/:id/steps/:stepId/complete', async (req: Request, res: Response) => {
  try {
    const pipeline = await employeeOnboardingPipeline.getPipeline(req.params.id);
    if (!pipeline) return res.status(404).json({ error: 'Pipeline not found' });

    const updated = await employeeOnboardingPipeline.completeStep(
      req.params.id,
      req.params.stepId,
      req.body.data
    );
    const progress = await employeeOnboardingPipeline.getProgress(req.params.id);
    res.json({ pipeline: updated, progress });
  } catch (err: any) {
    log.error('Failed to complete step (public):', err?.message);
    res.status(500).json({ error: 'Failed to complete step' });
  }
});

// GET /api/onboarding-pipeline/by-employee/:employeeId
router.get('/by-employee/:employeeId', requireAuth, async (req: Request, res: Response) => {
  try {
    const user = requireWorkspaceUser(req, res);
    if (!user) return;
    const pipeline = await employeeOnboardingPipeline.getPipelineByEntity(
      req.params.employeeId,
      user.workspaceId
    );
    if (!pipeline) return res.status(404).json({ error: 'No pipeline found for this employee' });

    const progress = await employeeOnboardingPipeline.getProgress(pipeline.id);
    res.json({ ...pipeline, progress });
  } catch (err: any) {
    log.error('Failed to get employee pipeline:', err?.message);
    res.status(500).json({ error: 'Failed to get pipeline' });
  }
});

// POST /api/onboarding-pipeline/:id/activate — manually trigger activation
router.post('/:id/activate', requireAuth, async (req: Request, res: Response) => {
  try {
    const user = requireWorkspaceUser(req, res);
    if (!user) return;
    const pipeline = await employeeOnboardingPipeline.getPipeline(req.params.id);
    if (!pipeline || pipeline.workspace_id !== user.workspaceId) {
      return res.status(404).json({ error: 'Pipeline not found' });
    }
    if (pipeline.entity_type !== 'employee') {
      return res.status(400).json({ error: 'Activation only supported for employee pipelines' });
    }

    await employeeOnboardingPipeline.activateEmployee(pipeline.entity_id, pipeline.workspace_id);
    res.json({ success: true, message: 'Employee activated successfully' });
  } catch (err: any) {
    log.error('Failed to activate employee:', err?.message);
    res.status(500).json({ error: 'Failed to activate employee' });
  }
});

export default router;
