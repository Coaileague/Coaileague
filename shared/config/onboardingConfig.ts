/**
 * Onboarding Configuration - Universal & Dynamic
 * Eliminates hardcoded email addresses, templates, and workflow steps
 * Centralized configuration for employee onboarding workflows
 */

export const onboardingConfig = {
  // Email Configuration
  email: {
    fromAddress: process.env.VITE_ONBOARDING_FROM_EMAIL || 'onboarding@coaileague.ai',
    supportEmail: process.env.VITE_ONBOARDING_SUPPORT_EMAIL || 'support@coaileague.ai',
  },

  // Onboarding Workflow Steps
  onboardingSteps: [
    {
      id: 'profile_completion',
      name: 'Complete Your Profile',
      description: 'Update personal information and preferences',
      order: 1,
    },
    {
      id: 'policy_review',
      name: 'Review Company Policies',
      description: 'Read and acknowledge company policies',
      order: 2,
    },
    {
      id: 'security_setup',
      name: 'Set Up Two-Factor Authentication',
      description: 'Enable 2FA for account security',
      order: 3,
    },
    {
      id: 'team_channels',
      name: 'Join Team Channels',
      description: 'Connect with your team in communication channels',
      order: 4,
    },
    {
      id: 'manager_meeting',
      name: 'Schedule 1-on-1 with Manager',
      description: 'Set up initial meeting with your manager',
      order: 5,
    },
  ],

  // Total Onboarding Steps (Dynamic - computed from steps array)
  getTotalSteps: function() {
    return this.onboardingSteps.length;
  },

  // Email Templates
  emailTemplates: {
    welcome: {
      subject: (workspaceName: string) => `Welcome to ${workspaceName}! 🚀`,
      body: (firstName: string, workspaceName: string, steps: typeof onboardingConfig.onboardingSteps) => {
        const stepsHtml = steps
          .map((step) => `<li>${step.name}</li>`)
          .join('');
        return `
          <h1>Welcome to ${workspaceName}</h1>
          <p>Hi ${firstName || 'there'},</p>
          <p>We're excited to have you on board! Here's what you need to do to get started:</p>
          <ol>
            ${stepsHtml}
          </ol>
          <p>You'll receive a notification as each step is completed.</p>
          <p>Questions? Contact your manager or ${onboardingConfig.email.supportEmail}</p>
        `;
      },
    },
    managerNotification: {
      subject: (firstName: string, lastName: string) => `New Team Member: ${firstName} ${lastName}`,
      body: (firstName: string, lastName: string) => `
        <h1>New Team Member Onboarding</h1>
        <p>${firstName} ${lastName} has joined your team.</p>
        <p>Onboarding checklist has been initiated. You can track progress in the admin dashboard.</p>
      `,
    },
    completionMilestone: {
      subject: () => '🎉 Onboarding Complete!',
      body: () => `
        <h1>Welcome to the Team!</h1>
        <p>You've completed all onboarding steps. You're all set to get started!</p>
        <p>If you have any questions, don't hesitate to reach out to your manager.</p>
      `,
    },
  },

  // Notifications & Behavior
  notifications: {
    notifyManagerOnboarding: process.env.VITE_ONBOARDING_NOTIFY_MANAGER === 'true' || true,
    sendWelcomeEmail: process.env.VITE_ONBOARDING_SEND_WELCOME === 'true' || true,
    sendCompletionEmail: process.env.VITE_ONBOARDING_SEND_COMPLETION === 'true' || true,
    completionCelebration: process.env.VITE_ONBOARDING_CELEBRATION === 'true' || true,
  },

  // Workflow Timeline
  timeline: {
    expectedCompletionDays: parseInt(process.env.VITE_ONBOARDING_DAYS || '14', 10),
    reminderIntervalDays: parseInt(process.env.VITE_ONBOARDING_REMINDER_DAYS || '3', 10),
    enableAutomaticReminders: process.env.VITE_ONBOARDING_AUTO_REMINDERS === 'true' || true,
  },

  // Module-Specific Onboarding (4 OS Families)
  modules: {
    communication: {
      name: 'Communication OS',
      steps: ['profile_completion', 'team_channels', 'security_setup'],
    },
    operations: {
      name: 'Platform Operations',
      steps: ['profile_completion', 'policy_review', 'security_setup'],
    },
    growth: {
      name: 'Growth OS',
      steps: ['profile_completion', 'manager_meeting', 'security_setup'],
    },
    platform: {
      name: 'Platform',
      steps: ['profile_completion', 'security_setup'],
    },
  },
};

export default onboardingConfig;
