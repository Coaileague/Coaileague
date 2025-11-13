// Seed script to create AutoForce Platform workspace for anonymous HelpOS users
import { db } from './db';
import { users, workspaces } from '@shared/schema';
import { eq } from 'drizzle-orm';

export const PLATFORM_WORKSPACE_ID = 'autoforce-platform-workspace';
export const ROOT_USER_ID = 'root-user-00000000';

export async function seedPlatformWorkspace() {
  console.log('Creating AutoForce Platform workspace for anonymous HelpOS users...');

  // Ensure root user exists
  const rootUser = await db.select().from(users).where(eq(users.id, ROOT_USER_ID)).limit(1);
  
  if (!rootUser.length) {
    console.log('⚠️  Root user not found. Please run seed-root-user.ts first.');
    return { success: false };
  }

  // Create Platform workspace for anonymous users
  const existingWorkspace = await db.select().from(workspaces).where(eq(workspaces.id, PLATFORM_WORKSPACE_ID)).limit(1);
  
  if (!existingWorkspace.length) {
    await db.insert(workspaces).values({
      id: PLATFORM_WORKSPACE_ID,
      name: 'AutoForce Platform',
      ownerId: ROOT_USER_ID,
      companyName: 'AutoForce™ Platform Support',
      subscriptionTier: 'enterprise',
      subscriptionStatus: 'active',
      maxEmployees: 99999,
      maxClients: 99999,
      platformFeePercentage: '0.00', // Platform workspace doesn't pay fees
    });
    console.log('✅ AutoForce Platform workspace created (ID:', PLATFORM_WORKSPACE_ID, ')');
  } else {
    console.log('AutoForce Platform workspace already exists');
  }

  console.log('\n🎉 Platform workspace setup complete!');
  console.log('Workspace ID:', PLATFORM_WORKSPACE_ID);
  return { success: true, workspaceId: PLATFORM_WORKSPACE_ID };
}
