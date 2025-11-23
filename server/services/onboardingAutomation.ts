/**
 * Employee Onboarding Automation Service
 * Implements automated onboarding workflows with email notifications and task tracking
 */

import { db } from "../db";
import { users, userOnboarding, workspaces } from "@shared/schema";
import { eq, and } from "drizzle-orm";
import { Resend } from "resend";

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
      })
      .returning();

    // Send welcome email to employee
    const resend = getResend();
    if (resend && employee.email) {
      await resend.emails.send({
        from: 'onboarding@autoforce.ai',
        to: employee.email,
        subject: `Welcome to ${workspace.name}! 🚀`,
        html: `
          <h1>Welcome to ${workspace.name}</h1>
          <p>Hi ${employee.firstName || 'there'},</p>
          <p>We're excited to have you on board! Here's what you need to do to get started:</p>
          <ol>
            <li>Complete your profile</li>
            <li>Review company policies</li>
            <li>Set up two-factor authentication</li>
            <li>Join team channels</li>
            <li>Schedule 1-on-1 with your manager</li>
          </ol>
          <p>You'll receive a notification as each step is completed.</p>
          <p>Questions? Contact your manager or support@autoforce.ai</p>
        `,
      });
    }

    // Notify manager if assigned
    if (managerId) {
      const manager = await db
        .select()
        .from(users)
        .where(eq(users.id, managerId))
        .then(r => r[0]);

      if (manager && manager.email && resend) {
        await resend.emails.send({
          from: 'onboarding@autoforce.ai',
          to: manager.email,
          subject: `New Team Member: ${employee.firstName} ${employee.lastName}`,
          html: `
            <h1>New Team Member Onboarding</h1>
            <p>${employee.firstName} ${employee.lastName} has joined your team.</p>
            <p>Onboarding checklist has been initiated. You can track progress in the admin dashboard.</p>
          `,
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
    const totalSteps = onboarding.totalSteps || 20;
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

    // Send completion milestone email
    if (isComplete) {
      const employee = await db
        .select()
        .from(users)
        .where(eq(users.id, employeeId))
        .then(r => r[0]);

      if (employee?.email) {
        const resend = getResend();
        if (resend) {
          await resend.emails.send({
            from: 'onboarding@autoforce.ai',
            to: employee.email,
            subject: '🎉 Onboarding Complete!',
            html: `
              <h1>Welcome to the Team!</h1>
              <p>You've completed all onboarding steps. You're all set to get started!</p>
              <p>If you have any questions, don't hesitate to reach out to your manager.</p>
            `,
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
