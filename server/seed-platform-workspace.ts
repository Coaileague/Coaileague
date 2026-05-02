// Seed script to create CoAIleague Support workspace for platform support operations
import { db } from './db';
import { users, workspaces } from '@shared/schema';
import { eq, sql } from 'drizzle-orm';
import { PLATFORM_WORKSPACE_ID } from './services/billing/billingConstants';

export const ROOT_USER_ID = 'root-user-00000000';
export const PLATFORM_NAME = 'CoAIleague';

// Module-level seeding lock — prevents concurrent runtime callers from racing
// (routes.ts startup, ChatServerHub.seedHelpDeskRoom, supportRoutes HelpAI escalation)
// from each running the workspace_members INSERT in parallel and violating the
// (user_id, workspace_id) UNIQUE constraint between SELECT/INSERT or hammering
// the row with redundant ON CONFLICT updates.
let _platformWorkspaceSeedInFlight: Promise<{ success: true; workspaceId: string }> | null = null;

export function seedPlatformWorkspace(): Promise<{ success: true; workspaceId: string }> {
  if (_platformWorkspaceSeedInFlight) return _platformWorkspaceSeedInFlight;
  _platformWorkspaceSeedInFlight = _seedPlatformWorkspaceImpl().finally(() => {
    _platformWorkspaceSeedInFlight = null;
  });
  return _platformWorkspaceSeedInFlight;
}

async function _seedPlatformWorkspaceImpl() {
  console.log(`Creating ${PLATFORM_NAME} Support workspace for platform support operations...`);

  // Ensure root user exists (CRITICAL: Throw if missing to fail-fast)
  const rootUser = await db.select().from(users).where(eq(users.id, ROOT_USER_ID)).limit(1);
  
  if (!rootUser.length) {
    throw new Error('CRITICAL: Root user not found. Cannot create platform workspace without root user. Run seedRootUser() first.');
  }

  // Create Platform workspace for support operations
  const existingWorkspace = await db.select().from(workspaces).where(eq(workspaces.id, PLATFORM_WORKSPACE_ID)).limit(1);
  
  if (!existingWorkspace.length) {
    await db.insert(workspaces).values({
      id: PLATFORM_WORKSPACE_ID,
      name: `${PLATFORM_NAME} Support`,
      ownerId: ROOT_USER_ID,
      companyName: `${PLATFORM_NAME} Support Operations`,
      subscriptionTier: 'enterprise',
      subscriptionStatus: 'active',
      maxEmployees: 99999,
      maxClients: 99999,
      platformFeePercentage: '0.00', // Platform workspace doesn't pay fees
      workspaceType: 'platform_support',
      isPlatformSupport: true,
    });
    console.log(`✅ ${PLATFORM_NAME} Support workspace created (ID:`, PLATFORM_WORKSPACE_ID, ')');
  } else {
    // Idempotently correct the workspace name and support flags
    await db.update(workspaces)
      .set({
        name: `${PLATFORM_NAME} Support`,
        companyName: `${PLATFORM_NAME} Support Operations`,
        workspaceType: 'platform_support',
        isPlatformSupport: true,
      })
      .where(eq(workspaces.id, PLATFORM_WORKSPACE_ID));
    console.log(`${PLATFORM_NAME} Support workspace already exists — name and flags updated`);
  }

  // Ensure root user is a workspace member (org_owner) — idempotent
  await db.execute(sql`
    INSERT INTO workspace_members (id, user_id, workspace_id, role, status, joined_at, created_at, updated_at)
    VALUES (
      gen_random_uuid(),
      ${ROOT_USER_ID},
      ${PLATFORM_WORKSPACE_ID},
      'org_owner',
      'active',
      NOW(), NOW(), NOW()
    )
    ON CONFLICT (user_id, workspace_id) DO NOTHING
  `);
  console.log('✅ Root user workspace membership ensured (org_owner)');

  console.log('\n🎉 Platform workspace setup complete!');
  console.log('Workspace ID:', PLATFORM_WORKSPACE_ID);
  return { success: true, workspaceId: PLATFORM_WORKSPACE_ID };
}
