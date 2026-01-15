/**
 * Notification Service - Automated notification creation and delivery
 * Creates and sends notifications to users for various platform events
 * 
 * Enhanced with:
 * - Trinity AI welcome messages for new users
 * - Auto-cleanup: System messages limited to 3 max to avoid screen overload
 * - Onboarding digest: Last 3 What's New + system updates summarized
 */

import { db } from '../db';
import { notifications, users, platformUpdates } from '@shared/schema';
import { eq, and, desc, isNull, inArray, sql } from 'drizzle-orm';
import { broadcastNotificationToUser } from '../websocket';

interface CreateNotificationParams {
  workspaceId: string;
  userId: string;
  type: string;
  title: string;
  message: string;
  actionUrl?: string;
  relatedEntityType?: string;
  relatedEntityId?: string;
  metadata?: Record<string, any>;
  createdBy?: string;
}

/**
 * Create and send a notification to a user
 * Note: WebSocket broadcasting is handled automatically by the notification routes
 */
export async function createNotification(params: CreateNotificationParams) {
  try {
    const [notification] = await db
      .insert(notifications)
      .values({
        workspaceId: params.workspaceId,
        userId: params.userId,
        type: params.type as any,
        title: params.title,
        message: params.message,
        actionUrl: params.actionUrl,
        relatedEntityType: params.relatedEntityType,
        relatedEntityId: params.relatedEntityId,
        metadata: params.metadata,
        createdBy: params.createdBy,
        isRead: false,
      })
      .returning();

    console.log(`[Notifications] Created notification for user ${params.userId}: ${params.title}`);

    // CRITICAL: Broadcast via WebSocket for real-time delivery
    try {
      broadcastNotificationToUser(params.workspaceId, params.userId, {
        id: notification.id,
        type: params.type,
        title: params.title,
        message: params.message,
        isRead: false,
        actionUrl: params.actionUrl,
        createdAt: notification.createdAt,
        metadata: params.metadata,
      });
      console.log(`[Notifications] WebSocket broadcast sent for user ${params.userId}`);
    } catch (wsError) {
      console.warn('[Notifications] WebSocket broadcast failed (non-fatal):', wsError);
    }

    // CRITICAL: Send email to user
    try {
      const user = await db.query.users.findFirst({
        where: eq(users.id, params.userId),
      });
      
      if (user?.email) {
        const { Resend } = await import('resend');
        const resend = new Resend(process.env.RESEND_API_KEY);
        
        await resend.emails.send({
          from: 'notifications@coaileague.platform',
          to: user.email,
          subject: params.title,
          html: `
            <p>${params.message}</p>
            ${params.actionUrl ? `<a href="${process.env.APP_URL || 'https://coaileague.platform'}${params.actionUrl}">View Details</a>` : ''}
          `,
        });
        
        console.log(`[Email] Sent notification email to ${user.email}: ${params.title}`);
      }
    } catch (emailError) {
      console.error('[Email] Failed to send email:', emailError);
      // Don't fail notification if email fails
    }

    return notification;
  } catch (error) {
    console.error('[Notifications] Error creating notification:', error);
    throw error;
  }
}

/**
 * CURATED WELCOME NOTIFICATION SYSTEM
 * 
 * Creates exactly 3 welcome notifications for new users:
 * 1. Platform Welcome - What's new and platform overview
 * 2. Org Welcome - Organization-specific welcome and role info
 * 3. Trinity AI Guide - How to use Trinity for assistance
 * 
 * These notifications are designed to onboard users effectively
 * without overwhelming them with information.
 */

const WELCOME_NOTIFICATIONS = {
  platform: {
    title: 'Welcome to CoAIleague - Your AI-Powered Workforce Platform',
    message: `We're excited to have you! CoAIleague is an AI-powered workforce management platform that automates 99% of scheduling, timekeeping, and compliance tasks. Here's what you can do:

• View and manage your schedule in real-time
• Clock in/out with GPS verification  
• Request time off and swap shifts
• Access documents and certifications
• Track your earnings and timesheets

Our AI Brain works 24/7 to optimize operations, predict staffing needs, and ensure compliance. You're in good hands!`,
    actionUrl: '/dashboard',
    type: 'welcome_org',
  },
  
  orgWelcome: {
    titleTemplate: (orgName: string) => `Welcome to ${orgName}!`,
    messageTemplate: (orgName: string, isOwner: boolean) => isOwner 
      ? `Your organization "${orgName}" is now active! As the org owner, you have full control over employees, schedules, billing, and AI automation settings.

Quick start guide:
1. Add employees from the Team section
2. Set up locations and job roles
3. Create your first AI-powered schedule
4. Configure payroll and invoicing

Need help? Trinity AI is available 24/7 to assist you with any task.`
      : `You've been added to ${orgName}! Your manager has assigned you access to view schedules, clock in/out, and manage your profile.

Get started:
1. Check your upcoming shifts in the Schedule tab
2. Set up your profile and preferences
3. Review any assigned documents or training
4. Explore the Employee Portal for all self-service features

Questions? Ask Trinity AI in the chat - she knows everything about the platform!`,
    actionUrl: '/dashboard',
    type: 'welcome_employee',
  },
  
  trinityGuide: {
    title: 'Meet Trinity - Your AI Assistant',
    message: `Trinity is CoAIleague's AI Brain, powered by Google Gemini. Think of her as a brilliant colleague who's always available to help.

What Trinity can do for you:
• Answer questions about your schedule, pay, or policies
• Help navigate the platform and find features
• Generate reports and analytics on demand
• Troubleshoot issues and suggest solutions
• Automate repetitive tasks with AI workflows

How to use Trinity:
1. Click the Trinity icon (Celtic knot) in the bottom corner
2. Type your question or request naturally
3. Trinity understands context and remembers your preferences

Trinity has two modes:
• Business Mode - Your helpful business partner for scheduling, analytics, invoicing, and day-to-day operations. She's warm, supportive, and data-driven.
• Guru Mode - Tech expert mode for troubleshooting, integrations, and platform configuration. Like having a senior engineer on call.

Try saying "Hey Trinity, what's on my schedule this week?" or "Help me understand my overtime costs."

Trinity learns from every conversation and gets better at helping you over time!`,
    actionUrl: '/chat',
    type: 'system',
  },
};

/**
 * Send complete welcome notification package for new org owners
 * Creates all 3 curated notifications in sequence
 */
export async function sendWelcomeOrgNotification(workspaceId: string, ownerId: string, orgName: string) {
  const results = [];
  
  // 1. Platform Welcome
  results.push(await createNotification({
    workspaceId,
    userId: ownerId,
    type: WELCOME_NOTIFICATIONS.platform.type as any,
    title: WELCOME_NOTIFICATIONS.platform.title,
    message: WELCOME_NOTIFICATIONS.platform.message,
    actionUrl: WELCOME_NOTIFICATIONS.platform.actionUrl,
    relatedEntityType: 'platform',
    relatedEntityId: 'onboarding',
    metadata: { notificationType: 'platform_welcome', orgName },
  }));
  
  // 2. Org-Specific Welcome (owner version)
  results.push(await createNotification({
    workspaceId,
    userId: ownerId,
    type: WELCOME_NOTIFICATIONS.orgWelcome.type as any,
    title: WELCOME_NOTIFICATIONS.orgWelcome.titleTemplate(orgName),
    message: WELCOME_NOTIFICATIONS.orgWelcome.messageTemplate(orgName, true),
    actionUrl: WELCOME_NOTIFICATIONS.orgWelcome.actionUrl,
    relatedEntityType: 'workspace',
    relatedEntityId: workspaceId,
    metadata: { notificationType: 'org_welcome', orgName, role: 'owner' },
  }));
  
  // 3. Trinity AI Guide
  results.push(await createNotification({
    workspaceId,
    userId: ownerId,
    type: WELCOME_NOTIFICATIONS.trinityGuide.type as any,
    title: WELCOME_NOTIFICATIONS.trinityGuide.title,
    message: WELCOME_NOTIFICATIONS.trinityGuide.message,
    actionUrl: WELCOME_NOTIFICATIONS.trinityGuide.actionUrl,
    relatedEntityType: 'trinity',
    relatedEntityId: 'onboarding',
    metadata: { notificationType: 'trinity_guide', orgName },
  }));
  
  console.log(`[Notifications] Sent 3 welcome notifications to org owner ${ownerId}`);
  return results;
}

/**
 * Send complete welcome notification package for new employees
 * Creates all 3 curated notifications in sequence
 */
export async function sendWelcomeEmployeeNotification(
  workspaceId: string,
  userId: string,
  employeeName: string,
  orgName: string
) {
  const results = [];
  
  // 1. Platform Welcome
  results.push(await createNotification({
    workspaceId,
    userId,
    type: WELCOME_NOTIFICATIONS.platform.type as any,
    title: WELCOME_NOTIFICATIONS.platform.title,
    message: WELCOME_NOTIFICATIONS.platform.message,
    actionUrl: WELCOME_NOTIFICATIONS.platform.actionUrl,
    relatedEntityType: 'platform',
    relatedEntityId: 'onboarding',
    metadata: { notificationType: 'platform_welcome', employeeName, orgName },
  }));
  
  // 2. Org-Specific Welcome (employee version)
  results.push(await createNotification({
    workspaceId,
    userId,
    type: WELCOME_NOTIFICATIONS.orgWelcome.type as any,
    title: WELCOME_NOTIFICATIONS.orgWelcome.titleTemplate(orgName),
    message: WELCOME_NOTIFICATIONS.orgWelcome.messageTemplate(orgName, false),
    actionUrl: '/employee-portal',
    relatedEntityType: 'employee',
    relatedEntityId: userId,
    metadata: { notificationType: 'org_welcome', employeeName, orgName, role: 'employee' },
  }));
  
  // 3. Trinity AI Guide
  results.push(await createNotification({
    workspaceId,
    userId,
    type: WELCOME_NOTIFICATIONS.trinityGuide.type as any,
    title: WELCOME_NOTIFICATIONS.trinityGuide.title,
    message: WELCOME_NOTIFICATIONS.trinityGuide.message,
    actionUrl: WELCOME_NOTIFICATIONS.trinityGuide.actionUrl,
    relatedEntityType: 'trinity',
    relatedEntityId: 'onboarding',
    metadata: { notificationType: 'trinity_guide', employeeName, orgName },
  }));
  
  console.log(`[Notifications] Sent 3 welcome notifications to employee ${userId}`);
  return results;
}

/**
 * Send notification when AI Brain needs approval for a workflow
 */
export async function sendAIApprovalNeededNotification(
  workspaceId: string,
  userId: string,
  actionType: string,
  deadline: Date,
  details: string,
  actionUrl?: string
) {
  const daysUntilDeadline = Math.ceil((deadline.getTime() - Date.now()) / (1000 * 60 * 60 * 24));
  
  return createNotification({
    workspaceId,
    userId,
    type: 'ai_approval_needed',
    title: 'AI Brain Approval Required',
    message: `${details} Please review and approve within ${daysUntilDeadline} days to avoid business disruption.`,
    actionUrl: actionUrl || '/dashboard',
    relatedEntityType: 'ai_workflow',
    relatedEntityId: workspaceId,
    metadata: { actionType, deadline: deadline.toISOString(), daysUntilDeadline },
  });
}

/**
 * Send notification when AI-generated schedule is ready for approval
 */
export async function sendAIScheduleReadyNotification(
  workspaceId: string,
  userId: string,
  scheduleId: string,
  period: string
) {
  return createNotification({
    workspaceId,
    userId,
    type: 'ai_schedule_ready',
    title: 'AI Schedule Ready for Approval',
    message: `Your AI-generated schedule for ${period} is ready for review. Approve it to publish to your team.`,
    actionUrl: `/schedule/${scheduleId}`,
    relatedEntityType: 'schedule',
    relatedEntityId: scheduleId,
    metadata: { period },
  });
}

/**
 * Send notification when invoice is generated
 */
export async function sendInvoiceGeneratedNotification(
  workspaceId: string,
  userId: string,
  invoiceId: string,
  clientName: string,
  amount: number
) {
  return createNotification({
    workspaceId,
    userId,
    type: 'invoice_generated',
    title: 'Invoice Generated',
    message: `Invoice for ${clientName} has been automatically generated by AI Brain. Amount: $${amount.toFixed(2)}`,
    actionUrl: `/invoices/${invoiceId}`,
    relatedEntityType: 'invoice',
    relatedEntityId: invoiceId,
    metadata: { clientName, amount },
  });
}

/**
 * Send notification when payment is received
 */
export async function sendPaymentReceivedNotification(
  workspaceId: string,
  userId: string,
  invoiceId: string,
  clientName: string,
  amount: number
) {
  return createNotification({
    workspaceId,
    userId,
    type: 'payment_received',
    title: 'Payment Received',
    message: `Payment of $${amount.toFixed(2)} received from ${clientName}.`,
    actionUrl: `/invoices/${invoiceId}`,
    relatedEntityType: 'payment',
    relatedEntityId: invoiceId,
    metadata: { clientName, amount },
  });
}

/**
 * Send notification when deadline is approaching
 */
export async function sendDeadlineApproachingNotification(
  workspaceId: string,
  userId: string,
  actionType: string,
  deadline: Date,
  actionUrl?: string
) {
  const hoursUntilDeadline = Math.ceil((deadline.getTime() - Date.now()) / (1000 * 60 * 60));
  
  return createNotification({
    workspaceId,
    userId,
    type: 'deadline_approaching',
    title: 'Deadline Approaching',
    message: `${actionType} deadline is approaching in ${hoursUntilDeadline} hours. Please take action to avoid business disruption.`,
    actionUrl: actionUrl || '/dashboard',
    relatedEntityType: 'deadline',
    relatedEntityId: workspaceId,
    metadata: { actionType, deadline: deadline.toISOString(), hoursUntilDeadline },
  });
}

/**
 * Send notification when AI Brain completes an automated action
 */
export async function sendAIActionCompletedNotification(
  workspaceId: string,
  userId: string,
  actionType: string,
  details: string,
  actionUrl?: string
) {
  return createNotification({
    workspaceId,
    userId,
    type: 'ai_action_completed',
    title: 'AI Brain Action Completed',
    message: `${details}`,
    actionUrl: actionUrl || '/dashboard',
    relatedEntityType: 'ai_action',
    relatedEntityId: workspaceId,
    metadata: { actionType },
  });
}

/**
 * Send notification for schedule changes
 */
export async function sendScheduleChangeNotification(
  workspaceId: string,
  userId: string,
  details: string,
  scheduleId?: string
) {
  return createNotification({
    workspaceId,
    userId,
    type: 'schedule_change',
    title: 'Schedule Updated',
    message: details,
    actionUrl: scheduleId ? `/schedule/${scheduleId}` : '/schedule',
    relatedEntityType: 'schedule',
    relatedEntityId: scheduleId,
    metadata: { details },
  });
}

/**
 * Send notification for payroll processing
 */
export async function sendPayrollProcessedNotification(
  workspaceId: string,
  userId: string,
  period: string,
  amount: number
) {
  return createNotification({
    workspaceId,
    userId,
    type: 'payroll_processed',
    title: 'Payroll Processed',
    message: `Your payroll for ${period} has been processed. Amount: $${amount.toFixed(2)}`,
    actionUrl: '/employee-portal',
    relatedEntityType: 'payroll',
    relatedEntityId: userId,
    metadata: { period, amount },
  });
}

// ============================================================================
// TRINITY WELCOME & ONBOARDING SYSTEM
// ============================================================================

/**
 * Trinity welcome message templates - AI-generated feel without API cost
 * Each message is crafted to feel personal and helpful
 */
const TRINITY_WELCOME_MESSAGES = [
  {
    greeting: "Welcome aboard!",
    message: "I'm Trinity, your AI assistant here at CoAIleague. I've been looking forward to meeting you! Together, we'll make managing your workforce feel effortless. I can help with scheduling, approvals, analytics, and so much more. Just look for my mascot in the corner whenever you need guidance!",
    tip: "Pro tip: Try clicking on me anytime to ask questions or get quick insights about your dashboard.",
  },
  {
    greeting: "Hello, new friend!",
    message: "I'm Trinity, your dedicated AI companion at CoAIleague. Think of me as your intelligent co-pilot for workforce management. I learn from your preferences and can automate repetitive tasks, catch scheduling conflicts, and even predict potential issues before they happen.",
    tip: "Getting started: Head to your Dashboard to see an overview of your workspace, or explore the Schedule page to set up your first shifts.",
  },
  {
    greeting: "Welcome to CoAIleague!",
    message: "Hi there! I'm Trinity, the AI brain powering your workforce experience. My job is to make your job easier. From intelligent scheduling to real-time insights, I'm here to help you work smarter, not harder. The best teams use AI to amplify their capabilities - and that's exactly what we'll do together!",
    tip: "Quick start: Check out the Onboarding Wizard in the sidebar to set up your team step-by-step.",
  },
];

/**
 * Get a random Trinity welcome message for variety
 */
function getTrinityWelcomeContent() {
  const index = Math.floor(Math.random() * TRINITY_WELCOME_MESSAGES.length);
  return TRINITY_WELCOME_MESSAGES[index];
}

/**
 * Send personalized Trinity welcome notification to new users
 * This creates a warm, AI-driven welcome experience
 */
export async function sendTrinityWelcomeNotification(
  workspaceId: string,
  userId: string,
  userName?: string
) {
  const content = getTrinityWelcomeContent();
  const personalGreeting = userName ? `${content.greeting} ${userName}!` : `${content.greeting}`;
  
  return createNotification({
    workspaceId,
    userId,
    type: 'trinity_welcome',
    title: personalGreeting,
    message: content.message,
    actionUrl: '/dashboard',
    relatedEntityType: 'onboarding',
    relatedEntityId: 'trinity_welcome',
    metadata: { 
      isTrinityMessage: true,
      tip: content.tip,
      userName,
      welcomeType: 'new_user',
    },
  });
}

/**
 * Get onboarding digest for new users
 * Returns last 3 What's New items + last 3 system updates summarized
 */
export async function getOnboardingDigest(userId: string): Promise<{
  trinityWelcome: {
    greeting: string;
    message: string;
    tip: string;
  };
  recentWhatsNew: Array<{
    id: string;
    title: string;
    description: string;
    category: string;
    createdAt: Date | null;
  }>;
  recentSystemUpdates: Array<{
    id: string;
    title: string;
    description: string;
    category: string;
    createdAt: Date | null;
  }>;
  isFirstLogin: boolean;
}> {
  // Get Trinity welcome content
  const trinityWelcome = getTrinityWelcomeContent();
  
  // Get last 3 What's New items (features, improvements)
  // Using valid enum values: feature, improvement
  const whatsNewCategories = ['feature', 'improvement'] as const;
  const recentWhatsNew = await db
    .select({
      id: platformUpdates.id,
      title: platformUpdates.title,
      description: platformUpdates.description,
      category: platformUpdates.category,
      createdAt: platformUpdates.createdAt,
    })
    .from(platformUpdates)
    .where(inArray(platformUpdates.category, [...whatsNewCategories]))
    .orderBy(desc(platformUpdates.createdAt))
    .limit(3);
  
  // Get last 3 system updates (security, bugfix, maintenance)
  // Using valid enum values: security, bugfix, maintenance
  const systemCategories = ['security', 'bugfix', 'maintenance'] as const;
  const recentSystemUpdates = await db
    .select({
      id: platformUpdates.id,
      title: platformUpdates.title,
      description: platformUpdates.description,
      category: platformUpdates.category,
      createdAt: platformUpdates.createdAt,
    })
    .from(platformUpdates)
    .where(inArray(platformUpdates.category, [...systemCategories]))
    .orderBy(desc(platformUpdates.createdAt))
    .limit(3);
  
  // Check if this is user's first login (no read notifications)
  const existingNotifications = await db
    .select({ id: notifications.id })
    .from(notifications)
    .where(eq(notifications.userId, userId))
    .limit(1);
  
  const isFirstLogin = existingNotifications.length === 0;
  
  return {
    trinityWelcome,
    recentWhatsNew,
    recentSystemUpdates,
    isFirstLogin,
  };
}

/**
 * Auto-cleanup system notifications
 * Limits visible system messages to 3 per user to avoid screen overload
 * Marks excess as cleared (auto-dismissed)
 */
export async function autoCleanupSystemNotifications(userId: string, maxVisible: number = 3): Promise<number> {
  try {
    // Get all uncleared system-type notifications for user, ordered by newest first
    const systemTypes = ['system_update', 'platform_update', 'maintenance', 'security_patch'];
    
    const allSystemNotifications = await db
      .select({ id: notifications.id, createdAt: notifications.createdAt })
      .from(notifications)
      .where(
        and(
          eq(notifications.userId, userId),
          isNull(notifications.clearedAt)
        )
      )
      .orderBy(desc(notifications.createdAt));
    
    // If more than maxVisible, mark older ones as cleared
    if (allSystemNotifications.length > maxVisible) {
      const toClean = allSystemNotifications.slice(maxVisible);
      const idsToClean = toClean.map(n => n.id);
      
      await db
        .update(notifications)
        .set({ clearedAt: new Date() })
        .where(inArray(notifications.id, idsToClean));
      
      console.log(`[NotificationCleanup] Auto-cleared ${idsToClean.length} old notifications for user ${userId}`);
      return idsToClean.length;
    }
    
    return 0;
  } catch (error) {
    console.error('[NotificationCleanup] Error during auto-cleanup:', error);
    return 0;
  }
}

/**
 * Clear old system notifications for all users (scheduled job)
 * Keeps only last 3 system notifications per user
 */
export async function cleanupAllUsersSystemNotifications(maxVisiblePerUser: number = 3): Promise<number> {
  try {
    // Get distinct user IDs with uncleared notifications
    const usersWithNotifications = await db
      .selectDistinct({ userId: notifications.userId })
      .from(notifications)
      .where(isNull(notifications.clearedAt));
    
    let totalCleaned = 0;
    for (const { userId } of usersWithNotifications) {
      const cleaned = await autoCleanupSystemNotifications(userId, maxVisiblePerUser);
      totalCleaned += cleaned;
    }
    
    if (totalCleaned > 0) {
      console.log(`[NotificationCleanup] Scheduled cleanup: cleared ${totalCleaned} notifications across ${usersWithNotifications.length} users`);
    }
    
    return totalCleaned;
  } catch (error) {
    console.error('[NotificationCleanup] Scheduled cleanup error:', error);
    return 0;
  }
}
