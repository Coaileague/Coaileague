/**
 * Trinity Autonomous Shift Filler
 * Run with: npx tsx scripts/trinity-fill-shifts.ts
 *
 * Queries all unassigned published shifts for the Acme dev workspace,
 * batches them through scheduleSmartAI (Gemini), and applies DB assignments.
 */

import { db } from '../server/db';
import { shifts, employees } from '../shared/schema';
import { eq, and, isNull } from 'drizzle-orm';
import { scheduleSmartAI } from '../server/services/scheduleSmartAI';

const WORKSPACE_ID = 'dev-acme-security-ws';
const BATCH_SIZE = 50;

async function main() {
  console.log('[Trinity:FillShifts] ============================================');
  console.log('[Trinity:FillShifts] Autonomous Shift Fill — Acme Dev Sandbox');
  console.log('[Trinity:FillShifts] ============================================');
  console.log(`[Trinity:FillShifts] Workspace: ${WORKSPACE_ID}`);
  console.log(`[Trinity:FillShifts] Batch size: ${BATCH_SIZE}`);
  console.log();

  // 1. Fetch all unassigned published shifts
  const openShifts = await db
    .select()
    .from(shifts)
    .where(and(
      eq(shifts.workspaceId, WORKSPACE_ID),
      isNull(shifts.employeeId),
      eq(shifts.status, 'published'),
    ));

  console.log(`[Trinity:FillShifts] Found ${openShifts.length} unassigned published shifts`);

  if (openShifts.length === 0) {
    console.log('[Trinity:FillShifts] Nothing to fill. Exiting.');
    process.exit(0);
  }

  // 2. Fetch all active employees
  const availableEmployees = await db
    .select()
    .from(employees)
    .where(and(
      eq(employees.workspaceId, WORKSPACE_ID),
      eq(employees.isActive, true),
    ));

  console.log(`[Trinity:FillShifts] Found ${availableEmployees.length} active employees`);
  console.log();

  const allAssignments: Array<{ shiftId: string; employeeId: string; confidence: number; reasoning: string }> = [];
  const unresolved: string[] = [];
  const totalBatches = Math.ceil(openShifts.length / BATCH_SIZE);

  // 3. Process batches
  for (let i = 0; i < totalBatches; i++) {
    const batchShifts = openShifts.slice(i * BATCH_SIZE, (i + 1) * BATCH_SIZE);
    const batchNum = i + 1;
    process.stdout.write(`[Trinity:FillShifts] Batch ${batchNum}/${totalBatches} (${batchShifts.length} shifts) ... `);

    try {
      const result = await scheduleSmartAI({
        openShifts: batchShifts as any[],
        availableEmployees: availableEmployees as any[],
        workspaceId: WORKSPACE_ID,
        userId: 'dev-owner-001',
        constraints: {
          balanceWorkload: true,
          preferExperience: true,
          hardConstraints: {
            preventDoubleBooking: true,
            enforceRestPeriods: true,
          },
          softConstraints: {
            balanceWorkload: true,
            avoidClopening: true,
          },
        },
      });

      allAssignments.push(...result.assignments);
      unresolved.push(...result.unassignedShifts);
      console.log(`OK — ${result.assignments.length} assigned (${result.overallConfidence}% confidence)`);

      if (result.summary) {
        console.log(`[Trinity:FillShifts]   AI Summary: ${result.summary.substring(0, 120)}`);
      }
    } catch (err: any) {
      console.log(`ERROR — ${err.message}`);
      unresolved.push(...batchShifts.map((s: any) => s.id));
    }
  }

  console.log();
  console.log(`[Trinity:FillShifts] AI generated ${allAssignments.length} assignments, ${unresolved.length} unresolved`);
  console.log('[Trinity:FillShifts] Applying assignments to database...');

  // 4. Apply to DB
  let dbAssigned = 0;
  let dbSkipped = 0;
  let dbErrors = 0;

  for (const assignment of allAssignments) {
    try {
      const updated = await db
        .update(shifts)
        .set({
          employeeId: assignment.employeeId,
          status: 'scheduled',
          updatedAt: new Date(),
        })
        .where(and(
          eq(shifts.id, assignment.shiftId),
          eq(shifts.workspaceId, WORKSPACE_ID),
          isNull(shifts.employeeId),
        ))
        .returning({ id: shifts.id });

      if (updated.length > 0) {
        dbAssigned++;
      } else {
        dbSkipped++;
      }
    } catch (err: any) {
      dbErrors++;
      console.error(`[Trinity:FillShifts] DB error for shift ${assignment.shiftId}: ${err.message}`);
    }
  }

  // 5. Verify final state
  const remaining = await db
    .select({ count: isNull(shifts.employeeId) })
    .from(shifts)
    .where(and(
      eq(shifts.workspaceId, WORKSPACE_ID),
      isNull(shifts.employeeId),
      eq(shifts.status, 'published'),
    ));

  console.log();
  console.log('[Trinity:FillShifts] ============================================');
  console.log('[Trinity:FillShifts] AUTONOMOUS FILL COMPLETE');
  console.log('[Trinity:FillShifts] ============================================');
  console.log(`  Total open shifts scanned : ${openShifts.length}`);
  console.log(`  Active employees available: ${availableEmployees.length}`);
  console.log(`  AI batches processed      : ${totalBatches}`);
  console.log(`  AI assignments generated  : ${allAssignments.length}`);
  console.log(`  DB assignments applied    : ${dbAssigned}`);
  console.log(`  DB skipped (race/conflict): ${dbSkipped}`);
  console.log(`  DB errors                 : ${dbErrors}`);
  console.log(`  AI unresolved shifts      : ${unresolved.length}`);
  console.log(`  Remaining unassigned      : ${remaining.length}`);

  if (allAssignments.length > 0) {
    console.log();
    console.log('[Trinity:FillShifts] Sample assignments (first 5):');
    allAssignments.slice(0, 5).forEach((a, idx) => {
      console.log(`  ${idx + 1}. Shift ${a.shiftId.slice(-8)} → Employee ${a.employeeId.slice(-8)} (${Math.round(a.confidence * 100)}% confidence)`);
      console.log(`     Reason: ${a.reasoning.substring(0, 100)}`);
    });
  }

  process.exit(0);
}

main().catch((err) => {
  console.error('[Trinity:FillShifts] Fatal error:', err);
  process.exit(1);
});
