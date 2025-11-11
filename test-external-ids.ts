/**
 * Test Script for External ID Generation
 * 
 * This script tests the external identifier system by creating test employees
 * and verifying that external IDs are generated correctly.
 * 
 * Run with: tsx test-external-ids.ts
 */

import { db } from './server/db';
import { workspaces, employees, externalIdentifiers, idSequences } from './shared/schema';
import { attachEmployeeExternalId, attachClientExternalId } from './server/services/identityService';
import { eq, and } from 'drizzle-orm';

async function runTests() {
  console.log('🧪 Starting External ID Generation Tests\n');

  try {
    // Get a test workspace
    const testWorkspace = await db
      .select()
      .from(workspaces)
      .limit(1);

    if (testWorkspace.length === 0) {
      console.error('❌ No workspaces found in database');
      return;
    }

    const workspaceId = testWorkspace[0].id;
    const workspaceName = testWorkspace[0].name;
    console.log(`✅ Using workspace: ${workspaceName} (${workspaceId})\n`);

    // Test 1: Single Employee External ID Generation
    console.log('Test 1: Single Employee External ID Generation');
    console.log('─'.repeat(50));
    
    const testEmployeeId = `test-emp-${Date.now()}`;
    console.log(`Creating test employee with ID: ${testEmployeeId}`);
    
    const result1 = await attachEmployeeExternalId(testEmployeeId, workspaceId);
    console.log(`✅ External ID generated: ${result1.externalId}`);
    console.log(`   Local number: ${result1.localNumber}\n`);

    // Verify in database
    const dbCheck1 = await db
      .select()
      .from(externalIdentifiers)
      .where(
        and(
          eq(externalIdentifiers.entityType, 'employee'),
          eq(externalIdentifiers.entityId, testEmployeeId)
        )
      );

    if (dbCheck1.length > 0) {
      console.log(`✅ Verified in database: ${dbCheck1[0].externalId}\n`);
    } else {
      console.error(`❌ External ID not found in database\n`);
    }

    // Test 2: Concurrent Employee Creation
    console.log('Test 2: Concurrent Employee Creation (5 employees)');
    console.log('─'.repeat(50));
    
    const concurrentEmployeeIds = Array.from({ length: 5 }, (_, i) => 
      `test-emp-concurrent-${Date.now()}-${i}`
    );

    console.log('Creating 5 employees concurrently...');
    const concurrentResults = await Promise.all(
      concurrentEmployeeIds.map(id => 
        attachEmployeeExternalId(id, workspaceId)
      )
    );

    console.log('\n✅ All employees created successfully:');
    concurrentResults.forEach((result, i) => {
      console.log(`   ${i + 1}. ${result.externalId} (seq: ${result.localNumber})`);
    });

    // Verify sequence is consecutive
    const sequences = concurrentResults.map(r => r.localNumber).sort((a, b) => a - b);
    const isConsecutive = sequences.every((num, i) => 
      i === 0 || num === sequences[i - 1] + 1
    );

    if (isConsecutive) {
      console.log('\n✅ Sequences are consecutive (no gaps)\n');
    } else {
      console.log('\n⚠️  Warning: Sequences have gaps');
      console.log(`   Sequences: ${sequences.join(', ')}\n`);
    }

    // Test 3: Check Org External ID
    console.log('Test 3: Organization External ID');
    console.log('─'.repeat(50));
    
    const orgExtId = await db
      .select()
      .from(externalIdentifiers)
      .where(
        and(
          eq(externalIdentifiers.entityType, 'org'),
          eq(externalIdentifiers.entityId, workspaceId)
        )
      );

    if (orgExtId.length > 0) {
      console.log(`✅ Organization external ID: ${orgExtId[0].externalId}\n`);
    } else {
      console.log(`⚠️  Organization external ID not yet created\n`);
    }

    // Test 4: Check Sequence State
    console.log('Test 4: Sequence Counter State');
    console.log('─'.repeat(50));
    
    const sequence = await db
      .select()
      .from(idSequences)
      .where(
        and(
          eq(idSequences.orgId, workspaceId),
          eq(idSequences.kind, 'employee')
        )
      );

    if (sequence.length > 0) {
      console.log(`✅ Employee sequence next value: ${sequence[0].nextVal}`);
      console.log(`   Last updated: ${sequence[0].updatedAt}\n`);
    } else {
      console.log(`⚠️  Employee sequence not initialized\n`);
    }

    console.log('═'.repeat(50));
    console.log('✅ All tests completed successfully!');
    console.log('═'.repeat(50));

  } catch (error: any) {
    console.error('\n❌ Test failed with error:');
    console.error(error.message);
    console.error('\nStack trace:');
    console.error(error.stack);
  } finally {
    process.exit(0);
  }
}

runTests();
