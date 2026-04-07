/**
 * Sandbox Testing Environment Configuration
 * 
 * IMPORTANT: This is the primary sandbox environment used for all testing and debugging.
 * Always use these values when testing features locally or debugging issues.
 * 
 * Login: sandbox-owner@sandbox.local
 * Workspace: Sandbox Protective Services
 */

export const sandboxConfig = {
  /** Primary test user account */
  testUser: {
    id: 'sandbox-test-user-00000001',
    email: 'sandbox-owner@sandbox.local',
    firstName: 'Sandbox',
    lastName: 'Owner',
    fullName: 'Sandbox Owner',
  },

  /** Primary test workspace */
  testWorkspace: {
    id: 'sandbox-workspace-00000001',
    name: 'Sandbox Protective Services',
  },

  /** Internal email mailbox for test user */
  testMailbox: {
    id: 'sandbox-mailbox-00000001',
    emailAddress: 'sandbox-owner-00000001@coaileague.internal',
    type: 'personal' as const,
  },

  /** API testing endpoints */
  apiEndpoints: {
    inbox: '/api/internal-email/inbox',
    mailboxAutoCreate: '/api/internal-email/mailbox/auto-create',
    seedEmails: '/api/dev/seed-emails',
    authMe: '/api/auth/me',
    workspaceAccess: '/api/workspace/access',
  },

  /** Feature flags for sandbox testing */
  features: {
    emailSeeding: true,
    trinityAI: true,
    chatSystem: true,
    notifications: true,
  },
} as const;

/** Type for the sandbox config */
export type SandboxConfig = typeof sandboxConfig;

/** Helper to get sandbox user ID */
export const getSandboxUserId = () => sandboxConfig.testUser.id;

/** Helper to get sandbox workspace ID */
export const getSandboxWorkspaceId = () => sandboxConfig.testWorkspace.id;

/** Helper to get sandbox mailbox ID */
export const getSandboxMailboxId = () => sandboxConfig.testMailbox.id;

/** Check if a user ID matches the sandbox test user */
export const isSandboxUser = (userId: string) => userId === sandboxConfig.testUser.id;

/** Check if a workspace ID matches the sandbox workspace */
export const isSandboxWorkspace = (workspaceId: string) => workspaceId === sandboxConfig.testWorkspace.id;

export default sandboxConfig;
