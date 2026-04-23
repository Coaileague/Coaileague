// Seed script to create initial Root user for the Operations organization
import { db } from './db';
import { users, workspaces, platformRoles, employees } from '@shared/schema';
import { eq } from 'drizzle-orm';
import { PLATFORM_WORKSPACE_ID } from './services/billing/billingConstants';

export async function seedRootUser() {
  console.log('Creating root user for CoAIleague Platform organization...');

  // Create root user
  // ⚠️ SECURITY WARNING: Change default credentials immediately after first login!
  const ROOT_USER_ID = 'root-user-00000000';
  const DEFAULT_ROOT_PASSWORD = process.env.ROOT_INITIAL_PASSWORD || 'change-me-on-first-login';
  let rootUser = await db.select().from(users).where(eq(users.id, ROOT_USER_ID)).limit(1);
  
  if (!rootUser.length) {
    const bcrypt = await import('bcryptjs');
    const hashedPassword = await bcrypt.hash(DEFAULT_ROOT_PASSWORD, 10);
    
    await db.insert(users).values({
      id: ROOT_USER_ID,
      email: process.env.ROOT_ADMIN_EMAIL || 'root@coaileague.local',
      passwordHash: hashedPassword,
      firstName: 'Root',
      lastName: 'Administrator',
      role: 'root_admin',
    });
    console.log('✅ Root user created with email:', process.env.ROOT_ADMIN_EMAIL || 'root@coaileague.local');
    console.log('⚠️  WARNING: Change password before going live!');
  } else {
    console.log('Root user already exists');
  }

  // Create CoAIleague Platform workspace
  const OPS_WORKSPACE_ID = PLATFORM_WORKSPACE_ID;
  let opsWorkspace = await db.select().from(workspaces).where(eq(workspaces.id, OPS_WORKSPACE_ID)).limit(1);
  
  if (!opsWorkspace.length) {
    await db.insert(workspaces).values({
      id: OPS_WORKSPACE_ID,
      name: 'CoAIleague Support',
      ownerId: ROOT_USER_ID,
      companyName: 'CoAIleague Support',
      subscriptionTier: 'enterprise',
      subscriptionStatus: 'active',
      maxEmployees: 99999,
      maxClients: 99999,
      platformFeePercentage: '0.00', // Operations doesn't pay fees
    });
    console.log('✅ CoAIleague Support workspace created');
  } else {
    console.log('CoAIleague Support workspace already exists');
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

  // Root user workspace access is established via workspaces.owner_id above.
  // workspace_members table is for invitations — not for direct ownership.
  // The resolveWorkspaceForUser() function handles owner access via workspaces.owner_id.
  console.log('Root user workspace membership ensured via owner_id (no workspace_members insert needed)');

  // Create employee record in Operations workspace
  const existingEmployee = await db.select().from(employees)
    .where(eq(employees.userId, ROOT_USER_ID)).limit(1);
  
  let employeeId: string;
  if (!existingEmployee.length) {
    const [newEmployee] = await db.insert(employees).values({
      workspaceId: OPS_WORKSPACE_ID,
      userId: ROOT_USER_ID,
      employeeNumber: 'EMP-COAI-00001',
      firstName: 'Root',
      lastName: 'Administrator',
      email: process.env.ROOT_ADMIN_EMAIL || 'root@coaileague.local',
      workspaceRole: 'org_owner',
      hourlyRate: '0.00',
      onboardingStatus: 'completed',
    }).returning();
    employeeId = newEmployee.id;
    console.log('✅ Root employee record created');
  } else {
    employeeId = existingEmployee[0].id;
    console.log('Root employee record already exists');
  }

  // Generate external identifiers for Operations workspace and root employee
  // Wrapped in try/catch — external_identifiers failures are non-fatal
  try {
  const { externalIdentifiers } = await import('@shared/schema');
  const { and } = await import('drizzle-orm');
  
  // Create CoAIleague Platform workspace external ID (ORG-COAI)
  const existingOrgId = await db.select().from(externalIdentifiers)
    .where(and(
      eq(externalIdentifiers.entityType, 'org'),
      eq(externalIdentifiers.entityId, OPS_WORKSPACE_ID)
    ))
    .limit(1);
  
  if (!existingOrgId.length) {
    await db.insert(externalIdentifiers).values({
      entityType: 'org',
      entityId: OPS_WORKSPACE_ID,
      externalId: 'ORG-COAI',
      isPrimary: true,
    });
    console.log('✅ CoAIleague Platform workspace external ID created: ORG-COAI');
  }
  
  // Create root employee external ID (EMP-COAI-00001)
  const existingEmpId = await db.select().from(externalIdentifiers)
    .where(and(
      eq(externalIdentifiers.entityType, 'employee'),
      eq(externalIdentifiers.entityId, employeeId)
    ))
    .limit(1);
  
  if (!existingEmpId.length) {
    await db.insert(externalIdentifiers).values({
      entityType: 'employee',
      entityId: employeeId,
      externalId: 'EMP-COAI-00001',
      orgId: OPS_WORKSPACE_ID,
      isPrimary: true,
    });
    
    // Update employee number to match external ID
    await db.update(employees)
      .set({ employeeNumber: 'EMP-COAI-00001' })
      .where(eq(employees.id, employeeId));
    
    console.log('✅ Root employee external ID created: EMP-COAI-00001');
  }

  console.log('\n🎉 Root user setup complete!');
  console.log('Login URL: /api/root-login');
  } catch (extIdErr: any) {
    // Non-fatal: external identifier creation failed, core user/workspace/role are already set
    console.warn('[seedRootUser] External identifier setup skipped (non-fatal):', extIdErr?.message);
  }
  return { success: true };
}

// Note: Auto-run removed to prevent process.exit() when imported as a module
// To run this seed script directly, use: tsx server/seed-root-user.ts
