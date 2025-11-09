/**
 * Backfill Biweekly Anchor Dates
 * 
 * Seeds biweekly anchors for all existing workspaces with biweekly automation enabled.
 * This ensures smooth transition to anchor-based biweekly calculations without month-boundary drift.
 * 
 * Run with: tsx server/scripts/backfill-biweekly-anchors.ts
 */

import { db } from '../db';
import { workspaces } from '@shared/schema';
import { eq } from 'drizzle-orm';
import { seedAnchor } from '../services/utils/scheduling';

async function backfillBiweeklyAnchors() {
  console.log('╔══════════════════════════════════════════════════╗');
  console.log('║  BIWEEKLY ANCHOR BACKFILL SCRIPT                ║');
  console.log('╚══════════════════════════════════════════════════╝\n');

  try {
    // Get all workspaces
    const allWorkspaces = await db.select().from(workspaces);
    console.log(`Found ${allWorkspaces.length} total workspaces\n`);

    let invoiceAnchorsSet = 0;
    let scheduleAnchorsSet = 0;
    let payrollAnchorsSet = 0;
    let skipped = 0;

    for (const workspace of allWorkspaces) {
      console.log(`\n📊 Processing workspace: ${workspace.name} (${workspace.id})`);
      
      const updates: any = {};
      let hasUpdates = false;

      // Check invoice automation
      if (workspace.invoiceSchedule === 'biweekly' && !workspace.invoiceBiweeklyAnchor) {
        const dayOfWeek = workspace.invoiceDayOfWeek ?? 1; // Default Monday
        const anchor = seedAnchor(dayOfWeek, new Date());
        updates.invoiceBiweeklyAnchor = anchor;
        hasUpdates = true;
        invoiceAnchorsSet++;
        console.log(`   ✅ Seeded invoice biweekly anchor (day ${dayOfWeek})`);
      }

      // Check schedule automation
      if (workspace.scheduleGenerationInterval === 'biweekly' && !workspace.scheduleBiweeklyAnchor) {
        const dayOfWeek = workspace.scheduleDayOfWeek ?? 0; // Default Sunday
        const anchor = seedAnchor(dayOfWeek, new Date());
        updates.scheduleBiweeklyAnchor = anchor;
        hasUpdates = true;
        scheduleAnchorsSet++;
        console.log(`   ✅ Seeded schedule biweekly anchor (day ${dayOfWeek})`);
      }

      // Check payroll automation
      if (workspace.payrollSchedule === 'biweekly' && !workspace.payrollBiweeklyAnchor) {
        const dayOfWeek = workspace.payrollDayOfWeek ?? 1; // Default Monday
        const anchor = seedAnchor(dayOfWeek, new Date());
        updates.payrollBiweeklyAnchor = anchor;
        hasUpdates = true;
        payrollAnchorsSet++;
        console.log(`   ✅ Seeded payroll biweekly anchor (day ${dayOfWeek})`);
      }

      // Apply updates transactionally
      if (hasUpdates) {
        await db.transaction(async (tx) => {
          await tx.update(workspaces)
            .set(updates)
            .where(eq(workspaces.id, workspace.id));
        });
        console.log(`   💾 Updates saved`);
      } else {
        console.log(`   ⏭️  No biweekly anchors needed`);
        skipped++;
      }
    }

    console.log('\n╔══════════════════════════════════════════════════╗');
    console.log('║  BACKFILL COMPLETE                               ║');
    console.log('╚══════════════════════════════════════════════════╝\n');
    console.log(`Total Workspaces: ${allWorkspaces.length}`);
    console.log(`Invoice Anchors Set: ${invoiceAnchorsSet}`);
    console.log(`Schedule Anchors Set: ${scheduleAnchorsSet}`);
    console.log(`Payroll Anchors Set: ${payrollAnchorsSet}`);
    console.log(`Skipped (no biweekly enabled): ${skipped}\n`);

  } catch (error) {
    console.error('❌ Backfill failed:', error);
    process.exit(1);
  }

  process.exit(0);
}

// Run backfill
backfillBiweeklyAnchors();
