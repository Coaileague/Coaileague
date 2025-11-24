/**
 * Employee Onboarding Automation Service
 * Implements automated onboarding workflows with email notifications and task tracking
 */

import { db } from "../db";
import { users, userOnboarding, workspaces } from "@shared/schema";
import { eq, and } from "drizzle-orm";
import { Resend } from "resend";
import onboardingConfig from "@shared/config/onboardingConfig";

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
    const resend = getResend();
    if (resend && employee.email && onboardingConfig.notifications.sendWelcomeEmail) {
      await resend.emails.send({
        from: onboardingConfig.email.fromAddress,
        to: employee.email,
        subject: onboardingConfig.emailTemplates.welcome.subject(workspace.name),
        html: onboardingConfig.emailTemplates.welcome.body(
          employee.firstName || 'there',
          workspace.name,
          onboardingConfig.onboardingSteps
        ),
      });
    }

    // Notify manager if assigned (if enabled)
    if (managerId && onboardingConfig.notifications.notifyManagerOnboarding) {
      const manager = await db
        .select()
        .from(users)
        .where(eq(users.id, managerId))
        .then(r => r[0]);

      if (manager && manager.email && resend) {
        await resend.emails.send({
          from: onboardingConfig.email.fromAddress,
          to: manager.email,
          subject: onboardingConfig.emailTemplates.managerNotification.subject(
            employee.firstName || 'Unknown',
            employee.lastName || 'Employee'
          ),
          html: onboardingConfig.emailTemplates.managerNotification.body(
            employee.firstName || 'Unknown',
            employee.lastName || 'Employee'
          ),
        });
      }
    }

    return onboarding;
  } catch (error) {
    console.error('[OnboardingAutomation] Error initiating onboarding:', error);
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
        const resend = getResend();
        if (resend) {
          await resend.emails.send({
            from: onboardingConfig.email.fromAddress,
            to: employee.email,
            subject: onboardingConfig.emailTemplates.completionMilestone.subject(),
            html: onboardingConfig.emailTemplates.completionMilestone.body(),
          });
        }
      }
    }

    return { completedSteps, progressPercentage, isComplete };
  } catch (error) {
    console.error('[OnboardingAutomation] Error completing step:', error);
    return null;
  }
}

// Lazy load Resend
let resend: any = null;
function getResend() {
  if (!resend && process.env.RESEND_API_KEY) {
    const { Resend } = require('resend');
    resend = new Resend(process.env.RESEND_API_KEY);
  }
  return resend;
}
