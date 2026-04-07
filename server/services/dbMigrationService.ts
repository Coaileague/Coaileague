/**
 * Database Migration Service
 * 
 * Uses SchemaParityService for dynamic schema validation
 * NO HARDCODED TABLE/COLUMN CHECKS - all validation is automatic
 */

import { runSchemaParityCheck } from './schemaParityService';
import { createLogger } from '../lib/logger';
const log = createLogger('dbMigrationService');


/**
 * Run schema parity check and optionally auto-fix issues
 * Called at startup to ensure database matches Drizzle schema
 */
export async function ensureRequiredTables(): Promise<void> {
  log.info('[DbMigration] Running dynamic schema parity check...');
  
  try {
    // Run parity check with auto-fix enabled for safe issues
    const report = await runSchemaParityCheck(true);
    
    if (report.totalIssues === 0) {
      log.info('[DbMigration] ✅ All schema parity checks passed');
    } else {
      const remaining = report.issues.filter(i => !i.autoFixable);
      if (remaining.length > 0) {
        log.warn(`[DbMigration] ⚠️  ${remaining.length} issues could not be auto-fixed:`);
        remaining.forEach(issue => {
          log.warn(`[DbMigration]    - ${issue.type}: ${issue.table || issue.enumName}${issue.column ? '.' + issue.column : ''}`);
        });
      } else {
        log.info(`[DbMigration] ✅ All ${report.totalIssues} issues were auto-fixed`);
      }
    }
  } catch (error) {
    log.error('[DbMigration] Error during schema parity check:', error);
    // Don't throw - allow server to continue starting
  }
}
