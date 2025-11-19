/**
 * Monthly Credit Reset Cron Job
 * Automatically refills credits on the 1st of each month based on subscription tier
 */

import { db } from '../../db';
import { workspaceCredits, workspaces } from '@shared/schema';
import { eq, sql } from 'drizzle-orm';
import { creditManager } from './creditManager';

/**
 * Monthly credit allocation by tier
 */
const TIER_ALLOCATIONS = {
  free: 100,
  starter: 500,
  professional: 2000,
  enterprise: 10000,
} as const;

/**
 * Reset credits for all workspaces on the 1st of the month
 * Should be called via cron job at: 0 0 1 * * (midnight on 1st of month)
 */
export async function resetMonthlyCredits() {
  console.log('=================================================');
  console.log('🔄 MONTHLY CREDIT RESET - START');
  console.log(`Timestamp: ${new Date().toISOString()}`);
  console.log('=================================================');

  try {
    // Get all active workspaces
    const allWorkspaces = await db
      .select({
        id: workspaces.id,
        subscriptionTier: workspaces.subscriptionTier,
      })
      .from(workspaces);

    let resetCount = 0;
    let errorCount = 0;

    for (const workspace of allWorkspaces) {
      try {
        const tier = (workspace.subscriptionTier || 'free').toLowerCase() as keyof typeof TIER_ALLOCATIONS;
        const monthlyAllocation = TIER_ALLOCATIONS[tier] || TIER_ALLOCATIONS.free;

        // Get current credit record
        const [creditRecord] = await db
          .select()
          .from(workspaceCredits)
          .where(eq(workspaceCredits.workspaceId, workspace.id))
          .limit(1);

        if (!creditRecord) {
          console.log(`⚠️  No credit record found for workspace ${workspace.id}, skipping`);
          continue;
        }

        // Calculate new balance (current + monthly allocation, capped)
        const newBalance = creditRecord.currentBalance + monthlyAllocation;

        // Update credit record
        await db
          .update(workspaceCredits)
          .set({
            currentBalance: newBalance,
            monthlyAllocation,
            lastResetAt: new Date(),
            nextResetAt: getNextResetDate(),
            totalCreditsEarned: sql`${workspaceCredits.totalCreditsEarned} + ${monthlyAllocation}`,
          })
          .where(eq(workspaceCredits.workspaceId, workspace.id));

        // Transaction already logged in DB update (via sql update)

        console.log(`✅ Reset credits for workspace ${workspace.id} (${tier}): +${monthlyAllocation} credits`);
        resetCount++;

      } catch (error) {
        console.error(`❌ Error resetting credits for workspace ${workspace.id}:`, error);
        errorCount++;
      }
    }

    console.log('\n=================================================');
    console.log('📊 MONTHLY CREDIT RESET - SUMMARY');
    console.log(`Total Workspaces: ${allWorkspaces.length}`);
    console.log(`Successfully Reset: ${resetCount}`);
    console.log(`Errors: ${errorCount}`);
    console.log('=================================================\n');

  } catch (error) {
    console.error('💥 Critical error in monthly credit reset:', error);
    throw error;
  }
}

/**
 * Calculate the next reset date (1st of next month at midnight UTC)
 */
function getNextResetDate(): Date {
  const now = new Date();
  const nextMonth = new Date(now.getFullYear(), now.getMonth() + 1, 1, 0, 0, 0, 0);
  return nextMonth;
}

/**
 * One-time credit reset for testing (resets immediately)
 * WARNING: Only use in development/testing
 */
export async function resetCreditsNow(workspaceId: string) {
  const [workspace] = await db
    .select()
    .from(workspaces)
    .where(eq(workspaces.id, workspaceId))
    .limit(1);

  if (!workspace) {
    throw new Error('Workspace not found');
  }

  const tier = (workspace.subscriptionTier || 'free').toLowerCase() as keyof typeof TIER_ALLOCATIONS;
  const monthlyAllocation = TIER_ALLOCATIONS[tier] || TIER_ALLOCATIONS.free;

  const [creditRecord] = await db
    .select()
    .from(workspaceCredits)
    .where(eq(workspaceCredits.workspaceId, workspaceId))
    .limit(1);

  if (!creditRecord) {
    throw new Error('Credit record not found');
  }

  const newBalance = creditRecord.currentBalance + monthlyAllocation;

  await db
    .update(workspaceCredits)
    .set({
      currentBalance: newBalance,
      lastResetAt: new Date(),
      nextResetAt: getNextResetDate(),
      totalCreditsEarned: sql`${workspaceCredits.totalCreditsEarned} + ${monthlyAllocation}`,
    })
    .where(eq(workspaceCredits.workspaceId, workspaceId));

  console.log(`✅ Manual reset: Added ${monthlyAllocation} credits to workspace ${workspaceId}`);
  return { success: true, creditsAdded: monthlyAllocation, newBalance };
}
