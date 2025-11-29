// Seed script to create CoAIleague Platform workspace for anonymous HelpAI users
import { db } from './db';
import { users, workspaces } from '@shared/schema';
import { eq } from 'drizzle-orm';

export const PLATFORM_WORKSPACE_ID = 'coaileague-platform-workspace';
export const ROOT_USER_ID = 'root-user-00000000';
export const PLATFORM_NAME = 'CoAIleague';

export async function seedPlatformWorkspace() {
  console.log(`Creating ${PLATFORM_NAME} Platform workspace for anonymous HelpAI users...`);

  // Ensure root user exists (CRITICAL: Throw if missing to fail-fast)
  const rootUser = await db.select().from(users).where(eq(users.id, ROOT_USER_ID)).limit(1);
  
  if (!rootUser.length) {
    throw new Error('CRITICAL: Root user not found. Cannot create platform workspace without root user. Run seedRootUser() first.');
  }

  // Create Platform workspace for anonymous users
  const existingWorkspace = await db.select().from(workspaces).where(eq(workspaces.id, PLATFORM_WORKSPACE_ID)).limit(1);
  
  if (!existingWorkspace.length) {
    await db.insert(workspaces).values({
      id: PLATFORM_WORKSPACE_ID,
      name: `${PLATFORM_NAME} Platform`,
      ownerId: ROOT_USER_ID,
      companyName: `${PLATFORM_NAME} Platform Support`,
      subscriptionTier: 'enterprise',
      subscriptionStatus: 'active',
      maxEmployees: 99999,
      maxClients: 99999,
      platformFeePercentage: '0.00', // Platform workspace doesn't pay fees
    });
    console.log(`✅ ${PLATFORM_NAME} Platform workspace created (ID:`, PLATFORM_WORKSPACE_ID, ')');
  } else {
    console.log(`${PLATFORM_NAME} Platform workspace already exists`);
  }

  console.log('\n🎉 Platform workspace setup complete!');
  console.log('Workspace ID:', PLATFORM_WORKSPACE_ID);
  return { success: true, workspaceId: PLATFORM_WORKSPACE_ID };
}
