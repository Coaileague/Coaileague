/**
 * Notification Deduplication Integration Test
 * 
 * Validates that Trinity's pushWhatsNew and deliverLivePatch methods
 * create exactly ONE notification entry per event (not duplicates).
 * 
 * Key invariants tested:
 * 1. pushWhatsNew inserts one platformUpdates row
 * 2. deliverLivePatch triggers one notification delivery
 * 3. Duplicate detection blocks repeated submissions within 24h
 */

import { db } from '../../db';
import { platformUpdates } from '@shared/schema';
import { eq, and, gte, desc } from 'drizzle-orm';
import { trinityNotificationBridge } from '../../services/ai-brain/trinityNotificationBridge';
import { platformFeatureRegistry } from '../../services/ai-brain/platformFeatureRegistry';

interface TestResult {
  name: string;
  passed: boolean;
  message: string;
  duration: number;
}

export async function runNotificationDeduplicationTests(): Promise<{
  passed: number;
  failed: number;
  results: TestResult[];
}> {
  const results: TestResult[] = [];
  let passed = 0;
  let failed = 0;

  console.log('[NotificationDeduplicationTest] Starting integration tests...');

  // Test 1: Verify pushWhatsNew creates exactly one entry
  try {
    const start = Date.now();
    const testTitle = `Test Update ${Date.now()}`;
    
    // Count existing updates with this title
    const beforeCount = await db.select()
      .from(platformUpdates)
      .where(eq(platformUpdates.title, testTitle));
    
    // Push a What's New update
    const result = await trinityNotificationBridge.pushWhatsNew({
      title: testTitle,
      description: 'Integration test - should create exactly one entry',
      category: 'announcement',
      priority: 5,
      visibility: 'all',
    });
    
    // Count after
    const afterCount = await db.select()
      .from(platformUpdates)
      .where(eq(platformUpdates.title, testTitle));
    
    const entriesCreated = afterCount.length - beforeCount.length;
    const testPassed = entriesCreated === 1;
    
    results.push({
      name: 'pushWhatsNew creates exactly one entry',
      passed: testPassed,
      message: testPassed 
        ? `Created ${entriesCreated} entry as expected` 
        : `Expected 1 entry, got ${entriesCreated}`,
      duration: Date.now() - start,
    });
    
    if (testPassed) passed++; else failed++;
  } catch (error: any) {
    results.push({
      name: 'pushWhatsNew creates exactly one entry',
      passed: false,
      message: `Error: ${error.message}`,
      duration: 0,
    });
    failed++;
  }

  // Test 2: Verify duplicate detection blocks repeated submissions (strict enforcement)
  try {
    const start = Date.now();
    const duplicateTitle = `Duplicate Test ${Date.now()}`;
    
    // First submission
    await trinityNotificationBridge.pushWhatsNew({
      title: duplicateTitle,
      description: 'First submission',
      category: 'announcement',
    });
    
    const afterFirst = await db.select()
      .from(platformUpdates)
      .where(eq(platformUpdates.title, duplicateTitle));
    
    const firstCount = afterFirst.length;
    
    // Second submission with same title (should be blocked - NO additional rows)
    try {
      await trinityNotificationBridge.pushWhatsNew({
        title: duplicateTitle,
        description: 'Second submission - should be blocked',
        category: 'announcement',
      });
    } catch (dupError: any) {
      // Constraint error is expected - this is correct behavior
    }
    
    const afterSecond = await db.select()
      .from(platformUpdates)
      .where(eq(platformUpdates.title, duplicateTitle));
    
    // STRICT: Second submission must NOT create additional rows
    const testPassed = afterSecond.length === firstCount;
    
    results.push({
      name: 'Duplicate detection blocks repeated submissions',
      passed: testPassed,
      message: testPassed
        ? `No duplicate created (${firstCount} entries, still ${afterSecond.length})`
        : `DUPLICATE DETECTED: ${firstCount} -> ${afterSecond.length} entries`,
      duration: Date.now() - start,
    });
    
    if (testPassed) passed++; else failed++;
  } catch (error: any) {
    results.push({
      name: 'Duplicate detection blocks repeated submissions',
      passed: false,
      message: `Unexpected error: ${error.message}`,
      duration: 0,
    });
    failed++;
  }

  // Test 3: deliverLivePatch creates exactly one update and bumps sync version
  try {
    const start = Date.now();
    const patchTitle = `Live Patch Test ${Date.now()}`;
    const beforeSync = platformFeatureRegistry.getSyncStatus();
    
    // Count existing updates
    const beforeCount = await db.select()
      .from(platformUpdates)
      .where(eq(platformUpdates.title, patchTitle));
    
    // Deliver a live patch
    await trinityNotificationBridge.deliverLivePatch({
      patchId: `test-patch-${Date.now()}`,
      version: '0.0.1-test',
      title: patchTitle,
      description: 'Integration test live patch',
      severity: 'low',
      affectedSystems: ['test'],
      deployedAt: new Date().toISOString(),
      requiresRefresh: false,
    });
    
    // Count after
    const afterCount = await db.select()
      .from(platformUpdates)
      .where(eq(platformUpdates.title, patchTitle));
    
    const afterSync = platformFeatureRegistry.getSyncStatus();
    
    const entriesCreated = afterCount.length - beforeCount.length;
    const syncBumped = afterSync.syncVersion > beforeSync.syncVersion;
    const testPassed = entriesCreated === 1 && syncBumped;
    
    results.push({
      name: 'deliverLivePatch creates one update and bumps sync',
      passed: testPassed,
      message: testPassed
        ? `Created ${entriesCreated} entry, sync v${beforeSync.syncVersion} -> v${afterSync.syncVersion}`
        : `Expected 1 entry (got ${entriesCreated}), sync bumped: ${syncBumped}`,
      duration: Date.now() - start,
    });
    
    if (testPassed) passed++; else failed++;
  } catch (error: any) {
    results.push({
      name: 'deliverLivePatch creates one update and bumps sync',
      passed: false,
      message: `Error: ${error.message}`,
      duration: 0,
    });
    failed++;
  }

  // Test 4: Feature registry sync version increments (direct call)
  try {
    const start = Date.now();
    const beforeSync = platformFeatureRegistry.getSyncStatus();
    const afterSync = platformFeatureRegistry.refreshSync();
    
    const testPassed = afterSync.syncVersion === beforeSync.syncVersion + 1;
    
    results.push({
      name: 'Feature registry sync version increments',
      passed: testPassed,
      message: testPassed
        ? `Version incremented from ${beforeSync.syncVersion} to ${afterSync.syncVersion}`
        : `Expected ${beforeSync.syncVersion + 1}, got ${afterSync.syncVersion}`,
      duration: Date.now() - start,
    });
    
    if (testPassed) passed++; else failed++;
  } catch (error: any) {
    results.push({
      name: 'Feature registry sync version increments',
      passed: false,
      message: `Error: ${error.message}`,
      duration: 0,
    });
    failed++;
  }

  // Summary
  console.log(`[NotificationDeduplicationTest] Complete: ${passed}/${passed + failed} tests passed`);
  results.forEach(r => {
    console.log(`  ${r.passed ? '✓' : '✗'} ${r.name}: ${r.message} (${r.duration}ms)`);
  });

  return { passed, failed, results };
}

// Export for startup validation
export const notificationDeduplicationTest = {
  name: 'Notification Deduplication',
  run: runNotificationDeduplicationTests,
};
