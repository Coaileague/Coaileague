import { pool } from '../db';
import { createLogger } from '../lib/logger';

const log = createLogger('EmployeeOnboardingPipeline');

export const EMPLOYEE_ONBOARDING_STEPS = [
  { id: 'offer_generated', title: 'Offer Letter Generated', type: 'document', tier: 0, blocking: false },
  { id: 'offer_accepted', title: 'Offer Letter Signed', type: 'signature', tier: 0, blocking: false },
  { id: 'w4_completed', title: 'W-4 Tax Form', type: 'form', tier: 1, blocking: true },
  { id: 'i9_section1', title: 'I-9 Section 1 (Employment Eligibility)', type: 'form', tier: 1, blocking: true },
  { id: 'direct_deposit', title: 'Direct Deposit Authorization', type: 'form', tier: 1, blocking: true },
  { id: 'handbook_signed', title: 'Employee Handbook Acknowledgment', type: 'signature', tier: 1, blocking: true },
  { id: 'background_consent', title: 'Background Check Authorization', type: 'form', tier: 1, blocking: true },
  { id: 'license_uploaded', title: 'Security License Upload', type: 'upload', tier: 2, blocking: false },
  { id: 'id_uploaded', title: 'Government ID Upload', type: 'upload', tier: 2, blocking: false },
  { id: 'certifications_uploaded', title: 'Certifications Upload', type: 'upload', tier: 2, blocking: false },
  { id: 'pin_set', title: 'Clock-In PIN Created', type: 'action', tier: 3, blocking: false },
  { id: 'profile_completed', title: 'Profile Photo and Info', type: 'form', tier: 3, blocking: false },
  { id: 'notification_prefs', title: 'Notification Preferences', type: 'form', tier: 3, blocking: false },
  { id: 'trinity_consent', title: 'Trinity AI Communication Consent', type: 'consent', tier: 3, blocking: false },
];

export class EmployeeOnboardingPipelineService {
  private static instance: EmployeeOnboardingPipelineService;

  static getInstance(): EmployeeOnboardingPipelineService {
    if (!EmployeeOnboardingPipelineService.instance) {
      EmployeeOnboardingPipelineService.instance = new EmployeeOnboardingPipelineService();
    }
    return EmployeeOnboardingPipelineService.instance;
  }

  async createPipeline(params: {
    workspaceId: string;
    entityType: 'employee' | 'candidate' | 'client';
    entityId: string;
    pipelineType?: string;
    assignedToUserId?: string;
  }): Promise<any> {
    const steps = EMPLOYEE_ONBOARDING_STEPS.map((s, idx) => ({
      ...s,
      status: 'pending',
      order: idx,
      completedAt: null,
    }));

    const result = await pool.query(
      `INSERT INTO onboarding_pipelines
       (workspace_id, pipeline_type, entity_type, entity_id,
        total_steps, steps, status, assigned_to_user_id, trinity_monitoring)
       VALUES ($1, $2, $3, $4, $5, $6, 'in_progress', $7, true)
       RETURNING *`,
      [
        params.workspaceId,
        params.pipelineType || 'new_employee',
        params.entityType,
        params.entityId,
        EMPLOYEE_ONBOARDING_STEPS.length,
        JSON.stringify(steps),
        params.assignedToUserId || null,
      ]
    );
    log.info(`Pipeline created id=${result.rows[0].id} entity=${params.entityId}`);
    return result.rows[0];
  }

  async getPipeline(pipelineId: string): Promise<any | null> {
    const result = await pool.query(
      `SELECT * FROM onboarding_pipelines WHERE id = $1`,
      [pipelineId]
    );
    return result.rows[0] || null;
  }

  async getPipelineByEntity(entityId: string, workspaceId: string): Promise<any | null> {
    const result = await pool.query(
      `SELECT * FROM onboarding_pipelines
       WHERE entity_id = $1 AND workspace_id = $2
       ORDER BY created_at DESC LIMIT 1`,
      [entityId, workspaceId]
    );
    return result.rows[0] || null;
  }

  async completeStep(pipelineId: string, stepId: string, data?: any): Promise<any> {
    const pipeline = await this.getPipeline(pipelineId);
    if (!pipeline) throw new Error('Pipeline not found');

    const steps = pipeline.steps as any[];
    const stepIdx = steps.findIndex((s: any) => s.id === stepId);
    if (stepIdx === -1) throw new Error(`Step ${stepId} not found in pipeline`);

    steps[stepIdx] = {
      ...steps[stepIdx],
      status: 'completed',
      completedAt: new Date().toISOString(),
      data: data || null,
    };

    const completedCount = steps.filter((s: any) => s.status === 'completed').length;
    const currentStep = completedCount;
    const allDone = completedCount === steps.length;

    const result = await pool.query(
      `UPDATE onboarding_pipelines SET
         steps = $1,
         current_step = $2,
         status = $3,
         completed_at = $4,
         updated_at = NOW()
       WHERE id = $5
       RETURNING *`,
      [
        JSON.stringify(steps),
        currentStep,
        allDone ? 'complete' : 'in_progress',
        allDone ? new Date().toISOString() : null,
        pipelineId,
      ]
    );

    // Emit platform event for step completion
    const { platformEventBus } = await import('./platformEventBus');
    platformEventBus.publish({
      type: 'employee_onboarding_step_completed',
      category: 'automation',
      title: `Onboarding Step Complete: ${steps[stepIdx].title}`,
      description: `Step '${steps[stepIdx].title}' completed for ${pipeline.entity_type} ${pipeline.entity_id}.`,
      workspaceId: pipeline.workspace_id,
      metadata: {
        pipelineId,
        stepId,
        entityType: pipeline.entity_type,
        entityId: pipeline.entity_id,
        isPipelineComplete: allDone
      },
      visibility: 'all'
    }).catch((err) => log.warn('[employeeOnboardingPipelineService] Fire-and-forget failed:', err));

    // Check if all Tier 1 blocking steps are complete → trigger activation
    const tier1Blocking = steps.filter((s: any) => s.tier === 1 && s.blocking);
    const tier1Done = tier1Blocking.every((s: any) => s.status === 'completed');

    if (tier1Done && pipeline.entity_type === 'employee') {
      await this.triggerActivationIfReady(pipeline);
    }

    return result.rows[0];
  }

  private async triggerActivationIfReady(pipeline: any): Promise<void> {
    const existing = await pool.query(
      `SELECT status FROM employees WHERE id = $1`,
      [pipeline.entity_id]
    ).catch(() => ({ rows: [] }));

    if (existing.rows[0]?.status === 'pending') {
      await this.activateEmployee(pipeline.entity_id, pipeline.workspace_id);
    }
  }

  async activateEmployee(employeeId: string, workspaceId: string): Promise<void> {
    log.info(`Activating employee ${employeeId}`);

    await pool.query(
      `UPDATE employees SET status = 'active', activated_at = NOW() WHERE id = $1`,
      [employeeId]
    ).catch((err) => log.warn('[employeeOnboardingPipelineService] Fire-and-forget failed:', err));

    await pool.query(
      `UPDATE users SET status = 'active' WHERE employee_id = $1`,
      [employeeId]
    ).catch((err) => log.warn('[employeeOnboardingPipelineService] Fire-and-forget failed:', err));

    await pool.query(
      `UPDATE workspaces SET current_seat_count = current_seat_count + 1 WHERE id = $1`,
      [workspaceId]
    ).catch((err) => log.warn('[employeeOnboardingPipelineService] Fire-and-forget failed:', err));

    // Emit platform event for activation
    const { platformEventBus } = await import('./platformEventBus');
    platformEventBus.publish({
      type: 'employee_activated',
      category: 'automation',
      title: 'Employee Activated',
      description: `Employee ${employeeId} has been activated after completing required onboarding steps.`,
      workspaceId,
      metadata: { employeeId },
      visibility: 'all'
    }).catch((err) => log.warn('[employeeOnboardingPipelineService] Fire-and-forget failed:', err));

    log.info(`Employee ${employeeId} activated successfully`);
  }

  async getProgress(pipelineId: string): Promise<{
    totalSteps: number;
    completedSteps: number;
    percentComplete: number;
    currentTier: number;
    steps: any[];
    status: string;
    blockers: string[];
  }> {
    const pipeline = await this.getPipeline(pipelineId);
    if (!pipeline) throw new Error('Pipeline not found');

    const steps = pipeline.steps as any[];
    const completed = steps.filter((s: any) => s.status === 'completed').length;
    const percent = Math.round((completed / steps.length) * 100);

    // Determine current tier
    const pendingBlocking = steps.find((s: any) => s.status === 'pending' && s.blocking);
    const currentTier = pendingBlocking?.tier ?? 3;

    const blockers = steps
      .filter((s: any) => s.blocking && s.status === 'pending' && s.tier <= currentTier)
      .map((s: any) => s.title);

    return {
      totalSteps: steps.length,
      completedSteps: completed,
      percentComplete: percent,
      currentTier,
      steps,
      status: pipeline.status,
      blockers,
    };
  }
}

export const employeeOnboardingPipeline = EmployeeOnboardingPipelineService.getInstance();
