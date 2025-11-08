// Seed script to create initial Root user for the Operations organization
import { db } from './db';
import { users, workspaces, platformRoles, employees } from '@shared/schema';
import { eq } from 'drizzle-orm';

export async function seedRootUser() {
  console.log('Creating root user for Operations organization...');

  // Create root user
  // ⚠️ SECURITY WARNING: Update credentials before going live!
  // Current temp credentials: root@getdc360.com / admin123@*
  const ROOT_USER_ID = 'root-user-00000000';
  let rootUser = await db.select().from(users).where(eq(users.id, ROOT_USER_ID)).limit(1);
  
  if (!rootUser.length) {
    const bcrypt = await import('bcryptjs');
    const hashedPassword = await bcrypt.hash('admin123@*', 10);
    
    await db.insert(users).values({
      id: ROOT_USER_ID,
      email: 'root@getdc360.com',
      passwordHash: hashedPassword,
      firstName: 'Root',
      lastName: 'Administrator',
      role: 'admin',
    });
    console.log('✅ Root user created with email: root@getdc360.com');
    console.log('⚠️  WARNING: Change password before going live!');
  } else {
    console.log('Root user already exists');
  }

  // Create Operations workspace
  const OPS_WORKSPACE_ID = 'ops-workspace-00000000';
  let opsWorkspace = await db.select().from(workspaces).where(eq(workspaces.id, OPS_WORKSPACE_ID)).limit(1);
  
  if (!opsWorkspace.length) {
    await db.insert(workspaces).values({
      id: OPS_WORKSPACE_ID,
      name: 'Operations',
      ownerId: ROOT_USER_ID,
      companyName: 'WorkforceOS Operations',
      subscriptionTier: 'enterprise',
      subscriptionStatus: 'active',
      maxEmployees: 99999,
      maxClients: 99999,
      platformFeePercentage: '0.00', // Operations doesn't pay fees
    });
    console.log('✅ Operations workspace created');
  } else {
    console.log('Operations workspace already exists');
  }

  // Grant platform Root role
  const existingRole = await db.select().from(platformRoles)
    .where(eq(platformRoles.userId, ROOT_USER_ID)).limit(1);
  
  if (!existingRole.length) {
    await db.insert(platformRoles).values({
      userId: ROOT_USER_ID,
      role: 'root_admin',
      grantedReason: 'System initialization - Primary root administrator',
    });
    console.log('✅ Root platform role granted');
  } else {
    console.log('Root platform role already exists');
  }

  // Create employee record in Operations workspace
  const existingEmployee = await db.select().from(employees)
    .where(eq(employees.userId, ROOT_USER_ID)).limit(1);
  
  if (!existingEmployee.length) {
    await db.insert(employees).values({
      workspaceId: OPS_WORKSPACE_ID,
      userId: ROOT_USER_ID,
      employeeNumber: 'ROOT-001',
      firstName: 'Root',
      lastName: 'Administrator',
      email: 'root@getdc360.com',
      workspaceRole: 'org_owner',
      hourlyRate: '0.00',
      onboardingStatus: 'completed',
    });
    console.log('✅ Root employee record created');
  } else {
    console.log('Root employee record already exists');
  }

  console.log('\n🎉 Root user setup complete!');
  console.log('Login URL: /api/root-login');
  return { success: true };
}

// Run if called directly
seedRootUser()
  .then(() => {
    console.log('Seed completed');
    process.exit(0);
  })
  .catch((error) => {
    console.error('Seed failed:', error);
    process.exit(1);
  });
