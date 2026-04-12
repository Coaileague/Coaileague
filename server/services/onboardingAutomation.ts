/**
 * Employee Onboarding Automation Service
 * Implements automated onboarding workflows with email notifications and task tracking
 */

import { NotificationDeliveryService } from './notificationDeliveryService';
import { db } from "../db";
import { users, userOnboarding, workspaces } from "@shared/schema";
import { eq, and } from "drizzle-orm";
import { emailService } from "./emailService";
import onboardingConfig from "@shared/config/onboardingConfig";
import { createLogger } from '../lib/logger';
const log = createLogger('onboardingAutomation');


/**
 * Initialize onboarding workflow for new employee
 * Sends welcome email and creates onboarding checklist
 */
export async function initiateEmployeeOnboarding(
  employeeId: string,
  workspaceId: string,
  managerId?: string
) {
  try {
    // Get employee and workspace info
    const employee = await db
      .select()
      .from(users)
      .where(eq(users.id, employeeId))
      .then(r => r[0]);

    const workspace = await db
      .select()
      .from(workspaces)
      .where(eq(workspaces.id, workspaceId))
      .then(r => r[0]);

    if (!employee || !workspace) return;

    // Create onboarding record
    const [onboarding] = await db
      .insert(userOnboarding)
      .values({
        userId: employeeId,
        completedSteps: [],
        currentStep: 'welcome',
        progressPercentage: 0,
        totalSteps: onboardingConfig.getTotalSteps(),
      })
      .returning();

    // Send welcome email to employee (if enabled)
    if (employee.email && onboardingConfig.notifications.sendWelcomeEmail) {
      NotificationDeliveryService.send({ type: 'onboarding_notification', workspaceId: workspaceId || 'system', recipientUserId: employeeId, channel: 'email', body: { to: employee.email, subject: onboardingConfig.emailTemplates.welcome.subject(workspace.name), html: onboardingConfig.emailTemplates.welcome.body(employee.firstName || 'there', workspace.name, onboardingConfig.onboardingSteps) } }).catch((err: Error) => log.warn('[OnboardingAutomation] Welcome email failed (non-blocking):', err.message));
    }

    // Send Trinity-branded welcome email to employee
    if (employee.email) {
      try {
        const { sendTrinityWelcomeEmail } = await import('./trinityWelcomeService');
        await sendTrinityWelcomeEmail({
          workspaceId,
          userId: employeeId,
          userEmail: employee.email,
          userType: 'employee',
          workspaceName: workspace.name || 'Your Organization',
          userName: employee.firstName || 'there',
        });
      } catch (trinityErr) {
        log.warn('[OnboardingAutomation] Trinity welcome email failed (non-blocking):', (trinityErr as Error).message);
      }
    }

    // Notify manager if assigned (if enabled)
    if (managerId && onboardingConfig.notifications.notifyManagerOnboarding) {
      const manager = await db
        .select()
        .from(users)
        .where(eq(users.id, managerId))
        .then(r => r[0]);

      if (manager?.email) {
        NotificationDeliveryService.send({ type: 'onboarding_notification', workspaceId: workspaceId || 'system', recipientUserId: managerId || manager.email, channel: 'email', body: { to: manager.email, subject: onboardingConfig.emailTemplates.managerNotification.subject(employee.firstName || 'Unknown', employee.lastName || 'Employee'), html: onboardingConfig.emailTemplates.managerNotification.body(employee.firstName || 'Unknown', employee.lastName || 'Employee') } }).catch((err: Error) => log.warn('[OnboardingAutomation] Manager notification email failed (non-blocking):', err.message));
      }
    }

    return onboarding;
  } catch (error) {
    log.error('[OnboardingAutomation] Error initiating onboarding:', error);
    return null;
  }
}

/**
 * Mark onboarding step as complete
 * Updates progress and sends notifications
 */
export async function completeOnboardingStep(
  employeeId: string,
  stepId: string
) {
  try {
    const onboarding = await db
      .select()
      .from(userOnboarding)
      .where(eq(userOnboarding.userId, employeeId))
      .then(r => r[0]);

    if (!onboarding) return;

    const completedSteps = [...(onboarding.completedSteps || []), stepId];
    const totalSteps = onboarding.totalSteps || onboardingConfig.getTotalSteps();
    const progressPercentage = Math.round((completedSteps.length / totalSteps) * 100);
    const isComplete = progressPercentage === 100;

    await db
      .update(userOnboarding)
      .set({
        completedSteps,
        progressPercentage,
        hasCompleted: isComplete,
      })
      .where(eq(userOnboarding.userId, employeeId));

    // Send completion milestone email (if enabled)
    if (isComplete && onboardingConfig.notifications.sendCompletionEmail) {
      const employee = await db
        .select()
        .from(users)
        .where(eq(users.id, employeeId))
        .then(r => r[0]);

      if (employee?.email) {
        NotificationDeliveryService.send({ type: 'onboarding_notification', workspaceId: 'system', recipientUserId: employeeId, channel: 'email', body: { to: employee.email, subject: onboardingConfig.emailTemplates.completionMilestone.subject(), html: onboardingConfig.emailTemplates.completionMilestone.body() } }).catch((err: Error) => log.warn('[OnboardingAutomation] Completion email failed (non-blocking):', err.message));
      }
    }

    return { completedSteps, progressPercentage, isComplete };
  } catch (error) {
    log.error('[OnboardingAutomation] Error completing step:', error);
    return null;
  }
}
