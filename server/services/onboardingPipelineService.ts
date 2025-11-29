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
import { geminiClient } from './ai-brain/providers/geminiClient';

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
    validationRule: 'billing_configured',
    systemEvent: 'billing.configured',
    requiredForReward: true,
  },
  {
    title: 'Invite a team member',
    description: 'Add another admin or manager to help run your workforce.',
    category: 'engagement',
    points: 15,
    displayOrder: 5,
    validationRule: 'team_member_invited',
    systemEvent: 'user.invited',
    requiredForReward: false,
  },
  {
    title: 'Explore the AI scheduling assistant',
    description: 'Try the AI-powered auto-scheduling feature to optimize your workforce.',
    category: 'engagement',
    points: 10,
    displayOrder: 6,
    validationRule: 'ai_scheduler_used',
    systemEvent: 'ai.scheduler.used',
    requiredForReward: false,
  },
];

class OnboardingPipelineService {
  /**
   * Initialize onboarding for a new workspace
   */
  async initializeOnboarding(workspaceId: string): Promise<OnboardingProgress> {
    const existingTasks = await db.query.orgOnboardingTasks.findMany({
      where: eq(orgOnboardingTasks.workspaceId, workspaceId),
    });

    if (existingTasks.length === 0) {
      const tasksToInsert = DEFAULT_ONBOARDING_TASKS.map(task => ({
        ...task,
        workspaceId,
        status: 'pending' as const,
      }));

      await db.insert(orgOnboardingTasks).values(tasksToInsert);
      
      if (isFeatureEnabled('enableAutonomousScheduling')) {
        await this.generateDynamicTasks(workspaceId);
      }
    }

    return this.getProgress(workspaceId);
  }

  /**
   * Get complete onboarding progress for a workspace
   */
  async getProgress(workspaceId: string): Promise<OnboardingProgress> {
    const workspace = await db.query.workspaces.findFirst({
      where: eq(workspaces.id, workspaceId),
    });

    if (!workspace) {
      throw new Error('Workspace not found');
    }

    const tasks = await db.query.orgOnboardingTasks.findMany({
      where: eq(orgOnboardingTasks.workspaceId, workspaceId),
      orderBy: [orgOnboardingTasks.displayOrder],
    });

    const reward = await db.query.orgRewards.findFirst({
      where: and(
        eq(orgRewards.workspaceId, workspaceId),
        eq(orgRewards.type, 'onboarding_discount_10')
      ),
    });

    const completedTasks = tasks.filter(t => t.status === 'completed').length;
    const inProgressTasks = tasks.filter(t => t.status === 'in_progress').length;
    const totalPoints = tasks.reduce((sum, t) => sum + (t.points || 0), 0);
    const earnedPoints = tasks
      .filter(t => t.status === 'completed')
      .reduce((sum, t) => sum + (t.points || 0), 0);

    const requiredTasks = tasks.filter(t => t.requiredForReward);
    const requiredCompleted = requiredTasks.filter(t => t.status === 'completed').length;
    const isRewardUnlocked = requiredTasks.length > 0 && requiredCompleted === requiredTasks.length;

    let daysUntilTrialExpires: number | null = null;
    if (workspace.trialEndsAt) {
      const now = new Date();
      const trialEnd = new Date(workspace.trialEndsAt);
      daysUntilTrialExpires = Math.max(0, Math.ceil((trialEnd.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)));
    }

    return {
      workspaceId,
      pipelineStatus: workspace.pipelineStatus || 'invited',
      totalTasks: tasks.length,
      completedTasks,
      inProgressTasks,
      totalPoints,
      earnedPoints,
      completionPercent: tasks.length > 0 ? Math.round((completedTasks / tasks.length) * 100) : 0,
      tasks,
      reward: reward || null,
      isRewardUnlocked,
      daysUntilTrialExpires,
    };
  }

  /**
   * Complete an onboarding task
   */
  async completeTask(workspaceId: string, taskId: string, completedBy?: string): Promise<OnboardingProgress> {
    const task = await db.query.orgOnboardingTasks.findFirst({
      where: and(
        eq(orgOnboardingTasks.id, taskId),
        eq(orgOnboardingTasks.workspaceId, workspaceId)
      ),
    });

    if (!task) {
      throw new Error('Task not found');
    }

    if (task.status === 'completed') {
      return this.getProgress(workspaceId);
    }

    await db.update(orgOnboardingTasks)
      .set({
        status: 'completed',
        completedAt: new Date(),
        completedBy: completedBy || null,
        currentProgress: task.targetProgress || 1,
        updatedAt: new Date(),
      })
      .where(eq(orgOnboardingTasks.id, taskId));

    const progress = await this.getProgress(workspaceId);

    if (progress.isRewardUnlocked) {
      await this.unlockReward(workspaceId);
    }

    return progress;
  }

  /**
   * Update task progress
   */
  async updateTaskProgress(workspaceId: string, taskId: string, progressAmount: number): Promise<OrgOnboardingTask> {
    const task = await db.query.orgOnboardingTasks.findFirst({
      where: and(
        eq(orgOnboardingTasks.id, taskId),
        eq(orgOnboardingTasks.workspaceId, workspaceId)
      ),
    });

    if (!task) {
      throw new Error('Task not found');
    }

    const newProgress = Math.min((task.currentProgress || 0) + progressAmount, task.targetProgress || 1);
    const isComplete = task.targetProgress && newProgress >= task.targetProgress;

    const [updated] = await db.update(orgOnboardingTasks)
      .set({
        status: isComplete ? 'completed' : 'in_progress',
        currentProgress: newProgress,
        completedAt: isComplete ? new Date() : null,
        updatedAt: new Date(),
      })
      .where(eq(orgOnboardingTasks.id, taskId))
      .returning();

    if (isComplete) {
      const progress = await this.getProgress(workspaceId);
      if (progress.isRewardUnlocked) {
        await this.unlockReward(workspaceId);
      }
    }

    return updated;
  }

  /**
   * Update pipeline status
   */
  async updatePipelineStatus(workspaceId: string, status: PipelineStatus, reason?: string): Promise<Workspace> {
    const updates: any = {
      pipelineStatus: status,
      pipelineStatusUpdatedAt: new Date(),
      updatedAt: new Date(),
    };

    if (status === 'trial_started') {
      const trialDays = ONBOARDING.TRIAL.DAYS;
      const now = new Date();
      const trialEnd = new Date(now.getTime() + trialDays * 24 * 60 * 60 * 1000);
      
      updates.trialStartedAt = now;
      updates.trialEndsAt = trialEnd;
      updates.trialDays = trialDays;
    }

    if (status === 'accepted') {
      updates.acceptedAt = new Date();
    }

    const [updated] = await db.update(workspaces)
      .set(updates)
      .where(eq(workspaces.id, workspaceId))
      .returning();

    return updated;
  }

  /**
   * Unlock the 10% discount reward
   */
  private async unlockReward(workspaceId: string): Promise<OrgReward> {
    const existing = await db.query.orgRewards.findFirst({
      where: and(
        eq(orgRewards.workspaceId, workspaceId),
        eq(orgRewards.type, 'onboarding_discount_10')
      ),
    });

    if (existing) {
      return existing;
    }

    let stripePromotionCode: string | null = null;
    let stripeCouponId: string | null = null;

    if (stripe && isFeatureEnabled('enableAutonomousBilling')) {
      try {
        const coupon = await stripe.coupons.create({
          percent_off: 10,
          duration: 'once',
          name: `Welcome Discount - ${workspaceId}`,
          metadata: { workspaceId },
        });

        stripeCouponId = coupon.id;

        const promoCode = await (stripe.promotionCodes.create as any)({
          coupon: coupon.id,
          code: `WELCOME10-${workspaceId.substring(0, 8).toUpperCase()}`,
          metadata: { workspaceId },
        });

        stripePromotionCode = promoCode.code;
        console.log(`[Onboarding] Created Stripe promo code: ${stripePromotionCode}`);
      } catch (error: any) {
        console.error('[Onboarding] Failed to create Stripe coupon:', error.message);
      }
    }

    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + ONBOARDING.REWARD.EXPIRY_DAYS);

    const [reward] = await db.insert(orgRewards).values({
      workspaceId,
      type: 'onboarding_discount_10',
      discountPercent: 10,
      status: 'unlocked',
      unlockedAt: new Date(),
      expiresAt,
      stripePromotionCode,
      stripeCouponId,
    }).returning();

    return reward;
  }

  /**
   * Apply a reward
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

  /**
   * AI Brain - Generate dynamic onboarding tasks based on org profile
   * Uses Gemini to analyze the organization and create personalized tasks
   */
  async generateDynamicTasks(workspaceId: string): Promise<OrgOnboardingTask[]> {
    if (!geminiClient.isAvailable()) {
      console.log('[Onboarding] AI Brain not available, using default tasks');
      return [];
    }

    try {
      const workspace = await db.query.workspaces.findFirst({
        where: eq(workspaces.id, workspaceId),
      });

      if (!workspace) {
        throw new Error('Workspace not found');
      }

      const existingTasks = await this.getTasks(workspaceId);
      const existingTitles = existingTasks.map(t => t.title.toLowerCase());

      const systemPrompt = `You are an AI assistant specialized in workforce management onboarding. 
Your task is to generate personalized onboarding tasks for a new organization.

Guidelines:
- Generate 3-5 additional tasks tailored to the organization's profile
- Each task should be actionable and specific
- Focus on tasks that help the organization get the most value from the platform
- Consider the industry, company size, and any configuration already in place
- Do NOT duplicate these existing tasks: ${existingTitles.join(', ')}

Respond with a JSON array of tasks. Each task must have:
- title: Brief, action-oriented title (max 60 chars)
- description: Clear explanation of what to do and why (max 200 chars)
- category: One of 'setup', 'configuration', 'engagement', 'billing'
- points: Number between 10-30 based on task difficulty
- requiredForReward: Boolean - true for essential tasks, false for optional`;

      const userMessage = `Organization Profile:
- Name: ${workspace.name || 'New Organization'}
- Industry: ${workspace.industry || 'Not specified'}
- Company Size: ${workspace.companySize || 'Unknown'}
- Timezone: ${workspace.timezone || 'UTC'}
- Current Features: Multi-tenant workforce management with scheduling, time tracking, and payroll
- Trial Status: ${workspace.pipelineStatus || 'invited'}

Generate personalized onboarding tasks for this organization.`;

      const response = await geminiClient.generate({
        workspaceId,
        featureKey: 'onboarding_task_generation',
        systemPrompt,
        userMessage,
        temperature: 0.7,
        maxTokens: 1024,
      });

      let aiTasks: any[] = [];
      try {
        const jsonMatch = response.text.match(/\[[\s\S]*\]/);
        if (jsonMatch) {
          aiTasks = JSON.parse(jsonMatch[0]);
        }
      } catch (parseError) {
        console.error('[Onboarding] Failed to parse AI response:', parseError);
        return [];
      }

      const insertedTasks: OrgOnboardingTask[] = [];
      const baseOrder = existingTasks.length + 1;

      for (let i = 0; i < Math.min(aiTasks.length, 5); i++) {
        const aiTask = aiTasks[i];
        
        if (!aiTask.title || !aiTask.description || !aiTask.category) {
          continue;
        }

        const titleLower = aiTask.title.toLowerCase();
        if (existingTitles.some(t => t.includes(titleLower) || titleLower.includes(t))) {
          continue;
        }

        const validCategories = ['setup', 'configuration', 'engagement', 'billing'];
        const category = validCategories.includes(aiTask.category) ? aiTask.category : 'engagement';

        const [inserted] = await db.insert(orgOnboardingTasks).values({
          workspaceId,
          title: aiTask.title.substring(0, 100),
          description: aiTask.description.substring(0, 500),
          category: category as TaskCategory,
          points: Math.min(30, Math.max(10, aiTask.points || 15)),
          displayOrder: baseOrder + i,
          requiredForReward: aiTask.requiredForReward || false,
          status: 'pending',
          createdBy: 'ai',
        }).returning();

        insertedTasks.push(inserted);
      }

      console.log(`[Onboarding] AI Brain generated ${insertedTasks.length} personalized tasks for workspace ${workspaceId}`);
      return insertedTasks;

    } catch (error: any) {
      console.error('[Onboarding] AI Brain task generation failed:', error.message);
      return [];
    }
  }

  /**
   * Process system events that may auto-complete onboarding tasks
   */
  async processSystemEvent(workspaceId: string, eventType: string, eventData?: any): Promise<void> {
    const tasks = await db.query.orgOnboardingTasks.findMany({
      where: and(
        eq(orgOnboardingTasks.workspaceId, workspaceId),
        eq(orgOnboardingTasks.systemEvent, eventType),
        eq(orgOnboardingTasks.status, 'pending')
      ),
    });

    for (const task of tasks) {
      if (task.validationRule && !this.validateRule(task.validationRule, eventData)) {
        continue;
      }
      await this.completeTask(workspaceId, task.id);
      console.log(`[Onboarding] Auto-completed task "${task.title}" from event ${eventType}`);
    }
  }

  private validateRule(rule: string, data?: any): boolean {
    if (!rule || !data) return true;

    const match = rule.match(/(\w+)\s*(>=|<=|==|>|<)\s*(\d+)/);
    if (match) {
      const [, field, operator, value] = match;
      const fieldValue = data[field] ?? 0;
      const numValue = parseInt(value);

      switch (operator) {
        case '>=':
          return fieldValue >= numValue;
        case '<=':
          return fieldValue <= numValue;
        case '>':
          return fieldValue > numValue;
        case '<':
          return fieldValue < numValue;
        case '==':
          return fieldValue === numValue;
      }
    }

    if (typeof data[rule] === 'boolean') {
      return data[rule];
    }

    return true;
  }
}

export const onboardingPipelineService = new OnboardingPipelineService();
