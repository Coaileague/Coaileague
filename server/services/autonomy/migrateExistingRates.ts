/**
 * AUTONOMY AUDIT PHASE 1: Rate History Migration Script
 * 
 * One-time script to seed existing rates into history tables
 * Run this after deploying Phase 1 schema changes
 * 
 * Usage: npm run migrate-rates (or call from admin UI)
 */

import { db } from '../../db';
import { 
  employees,
  workspaces,
  employeeRateHistory,
  workspaceRateHistory
} from '../../../shared/schema';
import { eq, isNull } from 'drizzle-orm';
import { createLogger } from '../../lib/logger';
const log = createLogger('migrateExistingRates');


interface MigrationStats {
  employeeRatesMigrated: number;
  workspaceRatesMigrated: number;
  errors: string[];
}

/**
 * Migrate existing employee rates to employee_rate_history
 * 
 * Creates initial rate history entries for all employees with configured rates
 */
async function migrateEmployeeRates(): Promise<{ count: number; errors: string[] }> {
  log.info('\n=== Migrating Employee Rates to History ===');
  
  const errors: string[] = [];
  let count = 0;

  try {
    // Get all employees with hourly rates
    const employeesWithRates = await db
      .select({
        id: employees.id,
        workspaceId: employees.workspaceId,
        hourlyRate: employees.hourlyRate,
        createdAt: employees.createdAt,
      })
      .from(employees);

    log.info(`Found ${employeesWithRates.length} employees to migrate`);

    for (const employee of employeesWithRates) {
      // Skip employees without rates
      if (!employee.hourlyRate) {
        continue;
      }

      try {
        // Check if rate already exists in history
        const [existing] = await db
          .select()
          .from(employeeRateHistory)
          .where(
            eq(employeeRateHistory.employeeId, employee.id)
          )
          .limit(1);

        if (existing) {
          log.info(`  ⏭️  Employee ${employee.id} already has rate history, skipping`);
          continue;
        }

        // Create initial rate history entry
        await db
          .insert(employeeRateHistory)
          .values({
            workspaceId: employee.workspaceId,
            employeeId: employee.id,
            hourlyRate: employee.hourlyRate,
            validFrom: employee.createdAt || new Date(),
            validTo: null, // Active rate
            changedBy: null, // System migration
            changeReason: 'Initial rate migration from existing employee record',
          });

        count++;
        log.info(`  ✅ Migrated employee ${employee.id}: $${employee.hourlyRate}/hr`);
      } catch (error: any) {
        const errorMsg = `Failed to migrate employee ${employee.id}: ${(error instanceof Error ? error.message : String(error))}`;
        log.error(`  ❌ ${errorMsg}`);
        errors.push(errorMsg);
      }
    }

    log.info(`\n✅ Employee rate migration complete: ${count} rates migrated`);
    return { count, errors };
  } catch (error: any) {
    log.error(`❌ Employee rate migration failed: ${(error instanceof Error ? error.message : String(error))}`);
    errors.push(`Migration error: ${(error instanceof Error ? error.message : String(error))}`);
    return { count, errors };
  }
}

/**
 * Migrate existing workspace default rates to workspace_rate_history
 */
async function migrateWorkspaceRates(): Promise<{ count: number; errors: string[] }> {
  log.info('\n=== Migrating Workspace Default Rates to History ===');
  
  const errors: string[] = [];
  let count = 0;

  try {
    // Get all workspaces
    const allWorkspaces = await db
      .select({
        id: workspaces.id,
        defaultBillableRate: workspaces.defaultBillableRate,
        defaultHourlyRate: workspaces.defaultHourlyRate,
        createdAt: workspaces.createdAt,
      })
      .from(workspaces);

    log.info(`Found ${allWorkspaces.length} workspaces to migrate`);

    for (const workspace of allWorkspaces) {
      try {
        // Check if rates already exist in history
        const [existing] = await db
          .select()
          .from(workspaceRateHistory)
          .where(
            eq(workspaceRateHistory.workspaceId, workspace.id)
          )
          .limit(1);

        if (existing) {
          log.info(`  ⏭️  Workspace ${workspace.id} already has rate history, skipping`);
          continue;
        }

        // Only create history entry if workspace has configured rates
        if (!workspace.defaultBillableRate && !workspace.defaultHourlyRate) {
          log.info(`  ⏭️  Workspace ${workspace.id} has no default rates, skipping`);
          continue;
        }

        // Create initial rate history entry
        await db
          .insert(workspaceRateHistory)
          .values({
            workspaceId: workspace.id,
            defaultBillableRate: workspace.defaultBillableRate,
            defaultHourlyRate: workspace.defaultHourlyRate,
            validFrom: workspace.createdAt || new Date(),
            validTo: null, // Active rate
            changedBy: null, // System migration
            changeReason: 'Initial rate migration from existing workspace defaults',
          });

        count++;
        log.info(`  ✅ Migrated workspace ${workspace.id}:`);
        log.info(`      Billable: $${workspace.defaultBillableRate || 'N/A'}/hr`);
        log.info(`      Payroll: $${workspace.defaultHourlyRate || 'N/A'}/hr`);
      } catch (error: any) {
        const errorMsg = `Failed to migrate workspace ${workspace.id}: ${(error instanceof Error ? error.message : String(error))}`;
        log.error(`  ❌ ${errorMsg}`);
        errors.push(errorMsg);
      }
    }

    log.info(`\n✅ Workspace rate migration complete: ${count} workspaces migrated`);
    return { count, errors };
  } catch (error: any) {
    log.error(`❌ Workspace rate migration failed: ${(error instanceof Error ? error.message : String(error))}`);
    errors.push(`Migration error: ${(error instanceof Error ? error.message : String(error))}`);
    return { count, errors };
  }
}

/**
 * Run full rate migration
 */
export async function migrateAllRates(): Promise<MigrationStats> {
  log.info('\n╔════════════════════════════════════════════════════════════╗');
  log.info('║  COAILEAGUE RATE HISTORY MIGRATION                        ║');
  log.info('║  Phase 1: Idempotency & Rate Versioning                   ║');
  log.info('╚════════════════════════════════════════════════════════════╝');
  log.info(`\nTimestamp: ${new Date().toISOString()}\n`);

  const stats: MigrationStats = {
    employeeRatesMigrated: 0,
    workspaceRatesMigrated: 0,
    errors: [],
  };

  // Migrate employee rates
  const employeeResult = await migrateEmployeeRates();
  stats.employeeRatesMigrated = employeeResult.count;
  stats.errors.push(...employeeResult.errors);

  // Migrate workspace rates
  const workspaceResult = await migrateWorkspaceRates();
  stats.workspaceRatesMigrated = workspaceResult.count;
  stats.errors.push(...workspaceResult.errors);

  // Summary
  log.info('\n╔════════════════════════════════════════════════════════════╗');
  log.info('║  MIGRATION SUMMARY                                         ║');
  log.info('╚════════════════════════════════════════════════════════════╝');
  log.info(`\n✅ Employee rates migrated: ${stats.employeeRatesMigrated}`);
  log.info(`✅ Workspace rates migrated: ${stats.workspaceRatesMigrated}`);
  log.info(`⚠️  Errors encountered: ${stats.errors.length}\n`);

  if (stats.errors.length > 0) {
    log.info('Errors:');
    stats.errors.forEach((error, i) => {
      log.info(`  ${i + 1}. ${error}`);
    });
  }

  return stats;
}

// Allow running as standalone script
if (require.main === module) {
  migrateAllRates()
    .then((stats) => {
      log.info('\n✅ Migration complete!');
      process.exit(stats.errors.length > 0 ? 1 : 0);
    })
    .catch((error) => {
      log.error('\n❌ Migration failed:', error);
      process.exit(1);
    });
}
