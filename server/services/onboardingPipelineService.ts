/**
 * Onboarding Pipeline Service - Sales & Gamification System
 * Tracks org journey from invite to paid subscriber with gamified onboarding tasks
 * 
 * Features:
 * - Pipeline status tracking (invited → accepted)
 * - Gamified onboarding tasks with points
 * - 10% discount reward for completing all tasks
 * - AI-generated dynamic tasks based on org profile
 * - Stripe coupon integration for discount application
 */

import { db } from '../db';
import { eq, and, desc, sql } from 'drizzle-orm';
import { 
  workspaces, 
  orgOnboardingTasks, 
  orgRewards, 
  userOnboardingProgress,
  type Workspace,
  type OrgOnboardingTask,
  type OrgReward,
  type InsertOrgOnboardingTask,
  type InsertOrgReward,
} from '@shared/schema';
import { isFeatureEnabled, PLATFORM, ONBOARDING } from '@shared/platformConfig';
import Stripe from 'stripe';

const stripe = process.env.STRIPE_SECRET_KEY 
  ? new Stripe(process.env.STRIPE_SECRET_KEY, { apiVersion: '2025-09-30.clover' })
  : null;

export interface OnboardingProgress {
  workspaceId: string;
  pipelineStatus: string;
  totalTasks: number;
  completedTasks: number;
  inProgressTasks: number;
  totalPoints: number;
  earnedPoints: number;
  completionPercent: number;
  tasks: OrgOnboardingTask[];
  reward: OrgReward | null;
  isRewardUnlocked: boolean;
  daysUntilTrialExpires: number | null;
}

export interface PipelineStatusUpdate {
  workspaceId: string;
  newStatus: string;
  reason?: string;
}

export type PipelineStatus = 
  | 'invited'
  | 'email_opened'
  | 'trial_started'
  | 'trial_active'
  | 'trial_expired'
  | 'accepted'
  | 'rejected'
  | 'churned';

export type TaskCategory = 'setup' | 'configuration' | 'engagement' | 'billing';

const DEFAULT_ONBOARDING_TASKS: Omit<InsertOrgOnboardingTask, 'workspaceId'>[] = [
  {
    title: 'Complete your company profile',
    description: 'Add your company name, address, and business information to personalize your workspace.',
    category: 'setup',
    points: 15,
    displayOrder: 1,
    validationRule: 'company_profile_complete',
    systemEvent: 'workspace.profile.updated',
    requiredForReward: true,
  },
  {
    title: 'Add your first employee',
    description: 'Create at least one employee record to start building your workforce.',
    category: 'setup',
    points: 20,
    displayOrder: 2,
    targetProgress: 1,
    progressUnit: 'employees',
    validationRule: 'employee_count >= 1',
    systemEvent: 'employee.created',
    requiredForReward: true,
  },
  {
    title: 'Create your first shift',
    description: 'Schedule a shift to see how the scheduling system works.',
    category: 'setup',
    points: 15,
    displayOrder: 3,
    validationRule: 'shift_count >= 1',
    systemEvent: 'shift.created',
    requiredForReward: true,
  },
  {
    title: 'Set up billing preferences',
    description: 'Configure your payment method for uninterrupted service after trial.',
    category: 'billing',
    points: 25,
    displayOrder: 4,
    validationRule: 'payment_method_configured',
    systemEvent: 'billing.payment_method.added',
    requiredForReward: true,
  },
  {
    title: 'Invite a team member',
    description: 'Add another user to help manage your workforce.',
    category: 'engagement',
    points: 20,
    displayOrder: 5,
    targetProgress: 1,
    progressUnit: 'users',
    validationRule: 'workspace_user_count >= 2',
    systemEvent: 'workspace.member.invited',
    requiredForReward: false,
  },
  {
    title: 'Explore the analytics dashboard',
    description: 'View your workforce analytics to understand key metrics.',
    category: 'engagement',
    points: 10,
    displayOrder: 6,
    validationRule: 'analytics_viewed',
    systemEvent: 'analytics.dashboard.viewed',
    requiredForReward: false,
  },
];

export class OnboardingPipelineService {
  
  /**
   * Initialize onboarding for a new workspace
   * Creates default tasks and the 10% discount reward
   */
  async initializeOnboarding(workspaceId: string): Promise<OnboardingProgress> {
    if (!isFeatureEnabled('enableOnboardingPipeline')) {
      throw new Error('Onboarding pipeline feature is not enabled');
    }

    const workspace = await db.query.workspaces.findFirst({
      where: eq(workspaces.id, workspaceId),
    });

    if (!workspace) {
      throw new Error(`Workspace not found: ${workspaceId}`);
    }

    const existingTasks = await db.query.orgOnboardingTasks.findMany({
      where: eq(orgOnboardingTasks.workspaceId, workspaceId),
    });

    if (existingTasks.length > 0) {
      return this.getProgress(workspaceId);
    }

    const tasksToCreate: InsertOrgOnboardingTask[] = DEFAULT_ONBOARDING_TASKS.map(task => ({
      ...task,
      workspaceId,
      createdBy: 'system' as const,
    }));

    await db.insert(orgOnboardingTasks).values(tasksToCreate);

    const rewardData: InsertOrgReward = {
      workspaceId,
      type: 'onboarding_discount_10',
      title: '10% Off Your First Month',
      description: 'Complete all required onboarding tasks to unlock a 10% discount on your first subscription payment.',
      discountPercent: '10.00',
      status: 'locked',
      unlockCondition: 'all_required_tasks_completed',
    };

    await db.insert(orgRewards).values(rewardData);

    await db.update(workspaces)
      .set({
        pipelineStatus: 'invited',
        invitedAt: new Date(),
        pipelineStatusUpdatedAt: new Date(),
        onboardingCompletionPercent: 0,
        updatedAt: new Date(),
      })
      .where(eq(workspaces.id, workspaceId));

    return this.getProgress(workspaceId);
  }

  /**
   * Get full onboarding progress for a workspace
   */
  async getProgress(workspaceId: string): Promise<OnboardingProgress> {
    const [workspace, tasks, rewards] = await Promise.all([
      db.query.workspaces.findFirst({
        where: eq(workspaces.id, workspaceId),
      }),
      db.query.orgOnboardingTasks.findMany({
        where: eq(orgOnboardingTasks.workspaceId, workspaceId),
        orderBy: [orgOnboardingTasks.displayOrder],
      }),
      db.query.orgRewards.findMany({
        where: and(
          eq(orgRewards.workspaceId, workspaceId),
          eq(orgRewards.type, 'onboarding_discount_10')
        ),
      }),
    ]);

    if (!workspace) {
      throw new Error(`Workspace not found: ${workspaceId}`);
    }

    const completedTasks = tasks.filter(t => t.status === 'completed').length;
    const inProgressTasks = tasks.filter(t => t.status === 'in_progress').length;
    const totalPoints = tasks.reduce((sum, t) => sum + (t.points || 0), 0);
    const earnedPoints = tasks
      .filter(t => t.status === 'completed')
      .reduce((sum, t) => sum + (t.points || 0), 0);
    
    const completionPercent = tasks.length > 0 
      ? Math.round((completedTasks / tasks.length) * 100) 
      : 0;

    const reward = rewards[0] || null;
    const isRewardUnlocked = reward?.status === 'unlocked' || reward?.status === 'applied';

    let daysUntilTrialExpires: number | null = null;
    if (workspace.trialEndsAt) {
      const now = new Date();
      const trialEnd = new Date(workspace.trialEndsAt);
      const diffTime = trialEnd.getTime() - now.getTime();
      daysUntilTrialExpires = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    }

    return {
      workspaceId,
      pipelineStatus: workspace.pipelineStatus || 'invited',
      totalTasks: tasks.length,
      completedTasks,
      inProgressTasks,
      totalPoints,
      earnedPoints,
      completionPercent,
      tasks,
      reward,
      isRewardUnlocked,
      daysUntilTrialExpires,
    };
  }

  /**
   * Mark a task as completed
   */
  async completeTask(
    workspaceId: string, 
    taskId: string, 
    completedBy?: string
  ): Promise<OnboardingProgress> {
    const task = await db.query.orgOnboardingTasks.findFirst({
      where: and(
        eq(orgOnboardingTasks.id, taskId),
        eq(orgOnboardingTasks.workspaceId, workspaceId)
      ),
    });

    if (!task) {
      throw new Error(`Task not found: ${taskId}`);
    }

    if (task.status === 'completed') {
      return this.getProgress(workspaceId);
    }

    await db.update(orgOnboardingTasks)
      .set({
        status: 'completed',
        completedAt: new Date(),
        completedBy,
        currentProgress: task.targetProgress || 1,
        updatedAt: new Date(),
      })
      .where(eq(orgOnboardingTasks.id, taskId));

    await this.updateWorkspaceProgress(workspaceId);
    
    await this.checkAndUnlockReward(workspaceId);

    return this.getProgress(workspaceId);
  }

  /**
   * Update task progress (for multi-step tasks)
   */
  async updateTaskProgress(
    workspaceId: string,
    taskId: string,
    progress: number
  ): Promise<OrgOnboardingTask> {
    const task = await db.query.orgOnboardingTasks.findFirst({
      where: and(
        eq(orgOnboardingTasks.id, taskId),
        eq(orgOnboardingTasks.workspaceId, workspaceId)
      ),
    });

    if (!task) {
      throw new Error(`Task not found: ${taskId}`);
    }

    const newStatus = progress >= (task.targetProgress || 1) 
      ? 'completed' as const
      : 'in_progress' as const;

    const [updated] = await db.update(orgOnboardingTasks)
      .set({
        currentProgress: progress,
        status: newStatus,
        completedAt: newStatus === 'completed' ? new Date() : null,
        updatedAt: new Date(),
      })
      .where(eq(orgOnboardingTasks.id, taskId))
      .returning();

    if (newStatus === 'completed') {
      await this.updateWorkspaceProgress(workspaceId);
      await this.checkAndUnlockReward(workspaceId);
    }

    return updated;
  }

  /**
   * Check system event and auto-complete relevant tasks
   */
  async processSystemEvent(
    workspaceId: string,
    eventType: string,
    eventData?: Record<string, any>
  ): Promise<void> {
    const tasks = await db.query.orgOnboardingTasks.findMany({
      where: and(
        eq(orgOnboardingTasks.workspaceId, workspaceId),
        eq(orgOnboardingTasks.systemEvent, eventType),
      ),
    });

    for (const task of tasks) {
      if (task.status !== 'completed') {
        const shouldComplete = await this.evaluateValidationRule(
          workspaceId, 
          task.validationRule || '',
          eventData
        );
        
        if (shouldComplete) {
          await this.completeTask(workspaceId, task.id);
        }
      }
    }
  }

  /**
   * Evaluate a validation rule to check if a task should be completed
   */
  private async evaluateValidationRule(
    workspaceId: string,
    rule: string,
    eventData?: Record<string, any>
  ): Promise<boolean> {
    if (!rule) return true;

    const counts = await this.getWorkspaceCounts(workspaceId);

    switch (rule) {
      case 'company_profile_complete':
        const workspace = await db.query.workspaces.findFirst({
          where: eq(workspaces.id, workspaceId),
        });
        return !!(workspace?.companyName && workspace?.address);

      case 'employee_count >= 1':
        return counts.employees >= 1;

      case 'shift_count >= 1':
        return counts.shifts >= 1;

      case 'payment_method_configured':
        const ws = await db.query.workspaces.findFirst({
          where: eq(workspaces.id, workspaceId),
        });
        return !!(ws?.stripeCustomerId);

      case 'workspace_user_count >= 2':
        return counts.users >= 2;

      case 'analytics_viewed':
        return eventData?.['viewed'] === true;

      default:
        return false;
    }
  }

  /**
   * Get workspace counts for validation
   */
  private async getWorkspaceCounts(workspaceId: string): Promise<{
    employees: number;
    shifts: number;
    users: number;
  }> {
    const [employeeResult, shiftResult, userResult] = await Promise.all([
      db.execute(sql`SELECT COUNT(*) as count FROM employees WHERE workspace_id = ${workspaceId}`),
      db.execute(sql`SELECT COUNT(*) as count FROM shifts WHERE workspace_id = ${workspaceId}`),
      db.execute(sql`SELECT COUNT(*) as count FROM workspace_members WHERE workspace_id = ${workspaceId}`),
    ]);

    return {
      employees: parseInt(employeeResult.rows[0]?.count as string || '0'),
      shifts: parseInt(shiftResult.rows[0]?.count as string || '0'),
      users: parseInt(userResult.rows[0]?.count as string || '0'),
    };
  }

  /**
   * Update workspace onboarding progress
   */
  private async updateWorkspaceProgress(workspaceId: string): Promise<void> {
    const tasks = await db.query.orgOnboardingTasks.findMany({
      where: eq(orgOnboardingTasks.workspaceId, workspaceId),
    });

    const completedTasks = tasks.filter(t => t.status === 'completed').length;
    const completionPercent = tasks.length > 0 
      ? Math.round((completedTasks / tasks.length) * 100) 
      : 0;
    
    const earnedPoints = tasks
      .filter(t => t.status === 'completed')
      .reduce((sum, t) => sum + (t.points || 0), 0);

    await db.update(workspaces)
      .set({
        onboardingCompletionPercent: completionPercent,
        totalOnboardingPoints: earnedPoints,
        onboardingCompletedAt: completionPercent === 100 ? new Date() : null,
        updatedAt: new Date(),
      })
      .where(eq(workspaces.id, workspaceId));
  }

  /**
   * Check if all required tasks are complete and unlock the reward
   */
  private async checkAndUnlockReward(workspaceId: string): Promise<void> {
    const tasks = await db.query.orgOnboardingTasks.findMany({
      where: and(
        eq(orgOnboardingTasks.workspaceId, workspaceId),
        eq(orgOnboardingTasks.requiredForReward, true)
      ),
    });

    const allRequiredComplete = tasks.every(t => t.status === 'completed');

    if (!allRequiredComplete) return;

    const reward = await db.query.orgRewards.findFirst({
      where: and(
        eq(orgRewards.workspaceId, workspaceId),
        eq(orgRewards.type, 'onboarding_discount_10'),
        eq(orgRewards.status, 'locked')
      ),
    });

    if (!reward) return;

    let stripeCouponId: string | undefined;
    let stripePromoCodeId: string | undefined;
    let promoCode: string | undefined;

    if (stripe) {
      try {
        const coupon = await stripe.coupons.create({
          percent_off: 10,
          duration: 'once',
          name: `Onboarding Discount - ${workspaceId}`,
          metadata: {
            workspaceId,
            rewardId: reward.id,
            type: 'onboarding_discount_10',
          },
        });
        
        stripeCouponId = coupon.id;

        const promotionCode = await stripe.promotionCodes.create({
          coupon: coupon.id,
          code: `WELCOME10-${workspaceId.substring(0, 8).toUpperCase()}`,
          max_redemptions: 1,
          metadata: {
            workspaceId,
            rewardId: reward.id,
          },
        });

        stripePromoCodeId = promotionCode.id;
        promoCode = promotionCode.code;
      } catch (error) {
        console.error('Failed to create Stripe coupon:', error);
      }
    }

    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 30);

    await db.update(orgRewards)
      .set({
        status: 'unlocked',
        unlockedAt: new Date(),
        stripeCouponId,
        stripePromotionCodeId: stripePromoCodeId,
        promoCode,
        expiresAt,
        updatedAt: new Date(),
      })
      .where(eq(orgRewards.id, reward.id));

    console.log(`[OnboardingPipeline] Reward unlocked for workspace ${workspaceId}`);
  }

  /**
   * Update pipeline status
   */
  async updatePipelineStatus(
    workspaceId: string,
    newStatus: PipelineStatus,
    reason?: string
  ): Promise<Workspace> {
    const updateData: Partial<typeof workspaces.$inferInsert> = {
      pipelineStatus: newStatus,
      pipelineStatusUpdatedAt: new Date(),
      updatedAt: new Date(),
    };

    switch (newStatus) {
      case 'email_opened':
        updateData.inviteEmailOpenedAt = new Date();
        break;
      case 'trial_started':
        updateData.trialStartedAt = new Date();
        const trialDays = ONBOARDING?.TRIAL?.DAYS || 14;
        const trialEnd = new Date();
        trialEnd.setDate(trialEnd.getDate() + trialDays);
        updateData.trialEndsAt = trialEnd;
        updateData.trialDays = trialDays;
        break;
      case 'accepted':
        updateData.acceptedAt = new Date();
        break;
      case 'rejected':
        updateData.rejectedAt = new Date();
        updateData.rejectionReason = reason;
        break;
    }

    const [updated] = await db.update(workspaces)
      .set(updateData)
      .where(eq(workspaces.id, workspaceId))
      .returning();

    return updated;
  }

  /**
   * Apply the reward discount at checkout
   */
  async applyReward(workspaceId: string, invoiceId?: string): Promise<OrgReward> {
    const reward = await db.query.orgRewards.findFirst({
      where: and(
        eq(orgRewards.workspaceId, workspaceId),
        eq(orgRewards.type, 'onboarding_discount_10'),
        eq(orgRewards.status, 'unlocked')
      ),
    });

    if (!reward) {
      throw new Error('No unlocked reward found for this workspace');
    }

    if (reward.expiresAt && new Date(reward.expiresAt) < new Date()) {
      await db.update(orgRewards)
        .set({ status: 'expired', updatedAt: new Date() })
        .where(eq(orgRewards.id, reward.id));
      throw new Error('Reward has expired');
    }

    const [updated] = await db.update(orgRewards)
      .set({
        status: 'applied',
        appliedAt: new Date(),
        appliedToInvoiceId: invoiceId || null,
        updatedAt: new Date(),
      })
      .where(eq(orgRewards.id, reward.id))
      .returning();

    return updated;
  }

  /**
   * Get available rewards for a workspace
   */
  async getAvailableRewards(workspaceId: string): Promise<OrgReward[]> {
    return db.query.orgRewards.findMany({
      where: and(
        eq(orgRewards.workspaceId, workspaceId),
        eq(orgRewards.status, 'unlocked')
      ),
    });
  }

  /**
   * Start trial for a workspace
   */
  async startTrial(workspaceId: string): Promise<Workspace> {
    await this.initializeOnboarding(workspaceId);
    return this.updatePipelineStatus(workspaceId, 'trial_started');
  }

  /**
   * Check and expire old trials
   */
  async expireTrials(): Promise<number> {
    const now = new Date();
    
    const result = await db.update(workspaces)
      .set({
        pipelineStatus: 'trial_expired',
        pipelineStatusUpdatedAt: now,
        updatedAt: now,
      })
      .where(and(
        eq(workspaces.pipelineStatus, 'trial_active'),
        sql`${workspaces.trialEndsAt} < ${now}`
      ))
      .returning();

    return result.length;
  }

  /**
   * Get tasks for a workspace
   */
  async getTasks(workspaceId: string): Promise<OrgOnboardingTask[]> {
    return db.query.orgOnboardingTasks.findMany({
      where: eq(orgOnboardingTasks.workspaceId, workspaceId),
      orderBy: [orgOnboardingTasks.displayOrder],
    });
  }

  /**
   * Skip a task (marks as skipped, doesn't count toward completion)
   */
  async skipTask(workspaceId: string, taskId: string): Promise<OrgOnboardingTask> {
    const [updated] = await db.update(orgOnboardingTasks)
      .set({
        status: 'skipped',
        updatedAt: new Date(),
      })
      .where(and(
        eq(orgOnboardingTasks.id, taskId),
        eq(orgOnboardingTasks.workspaceId, workspaceId)
      ))
      .returning();

    return updated;
  }
}

export const onboardingPipelineService = new OnboardingPipelineService();
