import { db } from '../../server/db';
import { users, workspaces, workspaceMembers, employees, clients, shifts } from '../../shared/schema';
import { eq, and, like } from 'drizzle-orm';
import { v4 as uuidv4 } from 'uuid';
import bcrypt from 'bcryptjs';

const TEST_PREFIX = 'TEST_E2E_';

interface TestDataSet {
  testWorkspaceId: string;
  testUserId: string;
  testEmployeeIds: string[];
  testClientIds: string[];
  testShiftIds: string[];
}

export class TestDataManager {
  private createdData: TestDataSet = {
    testWorkspaceId: '',
    testUserId: '',
    testEmployeeIds: [],
    testClientIds: [],
    testShiftIds: [],
  };

  async seedTestData(): Promise<TestDataSet> {
    console.log('[TestDataManager] Seeding test data...');

    const testWorkspaceId = `${TEST_PREFIX}ws_${uuidv4().slice(0, 8)}`;
    const testUserId = `${TEST_PREFIX}user_${uuidv4().slice(0, 8)}`;

    const hashedPassword = await bcrypt.hash('TestPassword123!', 10);

    const [testUser] = await db.insert(users).values({
      id: testUserId,
      username: `${TEST_PREFIX}owner`,
      email: `${TEST_PREFIX}owner@coaileague.com`,
      password: hashedPassword,
      firstName: 'Test',
      lastName: 'Owner',
      role: 'org_owner',
      emailVerified: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    }).returning();

    const [testWorkspace] = await db.insert(workspaces).values({
      id: testWorkspaceId,
      name: `${TEST_PREFIX}Workspace`,
      slug: `${TEST_PREFIX.toLowerCase()}workspace`,
      ownerId: testUserId,
      subscriptionTier: 'professional',
      subscriptionStatus: 'active',
      createdAt: new Date(),
      updatedAt: new Date(),
    }).returning();

    await db.insert(workspaceMembers).values({
      id: uuidv4(),
      workspaceId: testWorkspaceId,
      userId: testUserId,
      role: 'org_owner',
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    const testEmployeeIds: string[] = [];
    for (let i = 0; i < 5; i++) {
      const empId = `${TEST_PREFIX}emp_${i}_${uuidv4().slice(0, 8)}`;
      await db.insert(employees).values({
        id: empId,
        workspaceId: testWorkspaceId,
        firstName: `TestEmp${i}`,
        lastName: `LastName${i}`,
        email: `${TEST_PREFIX}emp${i}@coaileague.com`,
        phone: `555-000-${String(i).padStart(4, '0')}`,
        status: 'active',
        payType: 'hourly',
        payRate: '25.00',
        createdAt: new Date(),
        updatedAt: new Date(),
      });
      testEmployeeIds.push(empId);
    }

    const testClientIds: string[] = [];
    for (let i = 0; i < 3; i++) {
      const clientId = `${TEST_PREFIX}client_${i}_${uuidv4().slice(0, 8)}`;
      await db.insert(clients).values({
        id: clientId,
        workspaceId: testWorkspaceId,
        name: `${TEST_PREFIX}Client${i}`,
        email: `${TEST_PREFIX}client${i}@example.com`,
        phone: `555-100-${String(i).padStart(4, '0')}`,
        address: `${100 + i} Test Street`,
        city: 'Test City',
        state: 'CA',
        zipCode: '90210',
        status: 'active',
        billingRate: '35.00',
        createdAt: new Date(),
        updatedAt: new Date(),
      });
      testClientIds.push(clientId);
    }

    const testShiftIds: string[] = [];
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    
    for (let i = 0; i < 10; i++) {
      const shiftId = `${TEST_PREFIX}shift_${i}_${uuidv4().slice(0, 8)}`;
      const shiftDate = new Date(tomorrow);
      shiftDate.setDate(shiftDate.getDate() + Math.floor(i / 2));
      
      const startTime = new Date(shiftDate);
      startTime.setHours(8 + (i % 3) * 4, 0, 0, 0);
      
      const endTime = new Date(startTime);
      endTime.setHours(endTime.getHours() + 8);

      await db.insert(shifts).values({
        id: shiftId,
        workspaceId: testWorkspaceId,
        employeeId: testEmployeeIds[i % testEmployeeIds.length],
        clientId: testClientIds[i % testClientIds.length],
        date: shiftDate,
        startTime,
        endTime,
        status: 'scheduled',
        serviceType: i % 2 === 0 ? 'armed' : 'unarmed',
        createdAt: new Date(),
        updatedAt: new Date(),
      });
      testShiftIds.push(shiftId);
    }

    this.createdData = {
      testWorkspaceId,
      testUserId,
      testEmployeeIds,
      testClientIds,
      testShiftIds,
    };

    console.log('[TestDataManager] Test data seeded successfully');
    console.log(`  - Workspace: ${testWorkspaceId}`);
    console.log(`  - User: ${testUserId}`);
    console.log(`  - Employees: ${testEmployeeIds.length}`);
    console.log(`  - Clients: ${testClientIds.length}`);
    console.log(`  - Shifts: ${testShiftIds.length}`);

    return this.createdData;
  }

  async cleanupTestData(): Promise<void> {
    console.log('[TestDataManager] Cleaning up test data...');

    await db.delete(shifts).where(like(shifts.id, `${TEST_PREFIX}%`));
    console.log('  - Deleted test shifts');

    await db.delete(employees).where(like(employees.id, `${TEST_PREFIX}%`));
    console.log('  - Deleted test employees');

    await db.delete(clients).where(like(clients.id, `${TEST_PREFIX}%`));
    console.log('  - Deleted test clients');

    await db.delete(workspaceMembers).where(like(workspaceMembers.workspaceId, `${TEST_PREFIX}%`));
    console.log('  - Deleted test workspace members');

    await db.delete(workspaces).where(like(workspaces.id, `${TEST_PREFIX}%`));
    console.log('  - Deleted test workspaces');

    await db.delete(users).where(like(users.id, `${TEST_PREFIX}%`));
    console.log('  - Deleted test users');

    console.log('[TestDataManager] Test data cleanup complete');
  }

  getCreatedData(): TestDataSet {
    return this.createdData;
  }
}

export const testDataManager = new TestDataManager();
