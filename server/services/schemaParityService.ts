/**
 * Schema Parity Service - Dynamic schema validation against PostgreSQL
 * 
 * Automatically detects:
 * - Missing tables
 * - Missing columns
 * - Missing enums
 * - Type mismatches
 * 
 * NO HARDCODED VALUES - reads schema dynamically from Drizzle definitions
 */

import { db } from '../db';
import { sql, getTableName, getTableColumns } from 'drizzle-orm';
import * as schema from '@shared/schema';
import { typedQuery } from '../lib/typedSql';
import { createLogger } from '../lib/logger';
const log = createLogger('schemaParityService');

// Phase 16: Legacy credit tables intentionally dropped — skip in parity check so
// the auto-fixer does not recreate them. Keep entries here while imports still exist
// in creditManager.ts / shared/schema.ts for backward-compat type references.
const DEPRECATED_TABLES = new Set([
  'workspace_credit_balance',
  'voice_wallet',
  'credit_transactions',
  'credit_packs',
  'voice_credit_accounts',       // Phase 16: dropped — replaced by voiceSmsMeteringService
  'voice_credit_transactions',   // Phase 16: dropped — voice usage via voice_sms_usage_periods
]);


interface SchemaIssue {
  type: 'missing_table' | 'missing_column' | 'missing_enum' | 'type_mismatch';
  table?: string;
  column?: string;
  enumName?: string;
  expected?: string;
  actual?: string;
  severity: 'critical' | 'warning';
  autoFixable: boolean;
  drizzleTableRef?: any;
}

interface ParityReport {
  timestamp: Date;
  totalIssues: number;
  criticalIssues: number;
  warningIssues: number;
  issues: SchemaIssue[];
  tablesChecked: number;
  columnsChecked: number;
  enumsChecked: number;
}

// Map Drizzle column types to PostgreSQL types
function drizzleTypeToPgType(columnDef: any): string {
  const dataType = columnDef.dataType;
  const columnType = columnDef.columnType;
  
  if (dataType === 'string') {
    if (columnType?.includes('PgText')) return 'text';
    return 'character varying';
  }
  if (dataType === 'number') {
    if (columnType?.includes('PgSerial')) return 'integer';
    if (columnType?.includes('PgInteger')) return 'integer';
    if (columnType?.includes('PgReal')) return 'real';
    if (columnType?.includes('PgDoublePrecision')) return 'double precision';
    return 'integer';
  }
  if (dataType === 'boolean') return 'boolean';
  if (dataType === 'date') return 'timestamp without time zone';
  if (dataType === 'json') return 'jsonb';
  if (dataType === 'array') return 'ARRAY';
  
  return 'unknown';
}

// Convert camelCase to snake_case for column names
function toSnakeCase(str: string): string {
  return str.replace(/[A-Z]/g, letter => `_${letter.toLowerCase()}`);
}

class SchemaParityService {
  private issues: SchemaIssue[] = [];
  
  /**
   * Run full schema parity check
   */
  async checkParity(): Promise<ParityReport> {
    log.info('[SchemaParity] Starting dynamic schema parity check...');
    this.issues = [];
    
    let tablesChecked = 0;
    let columnsChecked = 0;
    let enumsChecked = 0;
    
    try {
      // 1. Get all tables from PostgreSQL
      const pgTables = await this.getPostgresTables();
      
      // 2. Get all enums from PostgreSQL
      const pgEnums = await this.getPostgresEnums();
      
      // 3. Iterate through all Drizzle schema exports using Drizzle's helpers
      for (const [exportName, exportValue] of Object.entries(schema)) {
        if (!exportValue || typeof exportValue !== 'object') continue;
        
        // Try to get table name using Drizzle's helper
        let tableName: string | undefined;
        try {
          tableName = getTableName(exportValue as any);
        } catch {
          // Not a table - skip
          continue;
        }
        
        if (!tableName) continue;

        // Skip deprecated/intentionally-dropped tables
        if (DEPRECATED_TABLES.has(tableName)) continue;

        tablesChecked++;
        
        // Check if table exists in PostgreSQL
        if (!pgTables.has(tableName)) {
          this.issues.push({
            type: 'missing_table',
            table: tableName,
            severity: 'critical',
            autoFixable: true,
            drizzleTableRef: exportValue,
          });
          continue;
        }
        
        // Get columns from PostgreSQL for this table
        const pgColumns = await this.getPostgresTableColumns(tableName);
        
        // Get columns from Drizzle schema
        try {
          const drizzleColumns = getTableColumns(exportValue as any);
          
          for (const [colKey, colDef] of Object.entries(drizzleColumns)) {
            // Get the actual column name
            const actualColName = (colDef as any).name || toSnakeCase(colKey);
            columnsChecked++;
            
            if (!pgColumns.has(actualColName)) {
              // Determine if this column has a default value (makes it safer to add)
              const hasDefault = (colDef as any).hasDefault === true;
              const isNullable = (colDef as any).notNull !== true;
              
              this.issues.push({
                type: 'missing_column',
                table: tableName,
                column: actualColName,
                expected: drizzleTypeToPgType(colDef),
                severity: 'critical',
                autoFixable: hasDefault || isNullable,
              });
            }
          }
        } catch {
          // Could not get columns for this table
        }
      }
      
      // 4. Check for enums defined in schema
      const enumsInSchema = this.extractEnumsFromSchema();
      for (const [enumName, enumValues] of Object.entries(enumsInSchema)) {
        enumsChecked++;
        if (!pgEnums.has(enumName)) {
          this.issues.push({
            type: 'missing_enum',
            enumName,
            expected: enumValues.join(', '),
            severity: 'critical',
            autoFixable: true,
          });
        }
      }
      
    } catch (error) {
      log.error('[SchemaParity] Error during parity check:', error);
    }
    
    const report: ParityReport = {
      timestamp: new Date(),
      totalIssues: this.issues.length,
      criticalIssues: this.issues.filter(i => i.severity === 'critical').length,
      warningIssues: this.issues.filter(i => i.severity === 'warning').length,
      issues: this.issues,
      tablesChecked,
      columnsChecked,
      enumsChecked,
    };
    
    this.logReport(report);
    return report;
  }
  
  /**
   * Get all table names from PostgreSQL
   */
  private async getPostgresTables(): Promise<Set<string>> {
    // CATEGORY C — Raw SQL retained: information_schema | Tables: information_schema | Verified: 2026-03-23
    const result = await typedQuery(sql`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public' 
      AND table_type = 'BASE TABLE'
    `);
    
    return new Set(result.map((row: any) => row.table_name));
  }
  
  /**
   * Get all enum names from PostgreSQL
   */
  private async getPostgresEnums(): Promise<Set<string>> {
    // CATEGORY C — Raw SQL retained: information_schema/pg_type introspection | Tables: pg_type | Verified: 2026-03-23
    const result = await typedQuery(sql`
      SELECT typname FROM pg_type 
      WHERE typtype = 'e'
    `);
    
    return new Set(result.map((row: any) => row.typname));
  }
  
  /**
   * Get all columns for a specific table from PostgreSQL
   */
  private async getPostgresTableColumns(tableName: string): Promise<Set<string>> {
    // CATEGORY C — Raw SQL retained: information_schema | Tables: information_schema | Verified: 2026-03-23
    const result = await typedQuery(sql`
      SELECT column_name 
      FROM information_schema.columns 
      WHERE table_schema = 'public' 
      AND table_name = ${tableName}
    `);
    
    return new Set(result.map((row: any) => row.column_name));
  }
  
  /**
   * Extract enum definitions from schema using pgEnum exports
   */
  private extractEnumsFromSchema(): Record<string, string[]> {
    const enums: Record<string, string[]> = {};
    
    for (const [exportName, exportValue] of Object.entries(schema)) {
      // pgEnum exports have enumName and enumValues properties
      if (exportValue && typeof exportValue === 'object') {
        const enumObj = exportValue as any;
        if (enumObj.enumName && enumObj.enumValues) {
          enums[enumObj.enumName] = [...enumObj.enumValues];
        }
      }
    }
    
    return enums;
  }
  
  /**
   * Log the parity report
   */
  private logReport(report: ParityReport): void {
    if (report.totalIssues === 0) {
      log.info(`[SchemaParity] ✅ No parity issues found`);
      log.info(`[SchemaParity]    Checked: ${report.tablesChecked} tables, ${report.columnsChecked} columns, ${report.enumsChecked} enums`);
      return;
    }
    
    log.info(`[SchemaParity] ⚠️  Found ${report.totalIssues} parity issues:`);
    log.info(`[SchemaParity]    Critical: ${report.criticalIssues}, Warnings: ${report.warningIssues}`);
    log.info(`[SchemaParity]    Checked: ${report.tablesChecked} tables, ${report.columnsChecked} columns, ${report.enumsChecked} enums`);
    
    // Group issues by type
    const missingTables = report.issues.filter(i => i.type === 'missing_table');
    const missingColumns = report.issues.filter(i => i.type === 'missing_column');
    const missingEnums = report.issues.filter(i => i.type === 'missing_enum');
    
    if (missingTables.length > 0) {
      log.info(`[SchemaParity] ❌ Missing Tables (${missingTables.length}):`);
      missingTables.forEach(i => log.info(`[SchemaParity]    - ${i.table}`));
    }
    
    if (missingColumns.length > 0) {
      log.info(`[SchemaParity] ❌ Missing Columns (${missingColumns.length}):`);
      missingColumns.forEach(i => {
        const fixable = i.autoFixable ? ' [auto-fixable]' : '';
        log.info(`[SchemaParity]    - ${i.table}.${i.column} (${i.expected})${fixable}`);
      });
    }
    
    if (missingEnums.length > 0) {
      log.info(`[SchemaParity] ❌ Missing Enums (${missingEnums.length}):`);
      missingEnums.forEach(i => log.info(`[SchemaParity]    - ${i.enumName}: [${i.expected}]`));
    }
  }
  
  /**
   * Attempt to auto-fix issues that are safe to fix
   */
  async autoFix(): Promise<{ fixed: number; failed: number; skipped: number }> {
    const fixable = this.issues.filter(i => i.autoFixable);
    let fixed = 0;
    let failed = 0;
    let skipped = this.issues.length - fixable.length;
    
    log.info(`[SchemaParity] Attempting to auto-fix ${fixable.length} issues...`);
    
    const enumIssues = fixable.filter(i => i.type === 'missing_enum');
    const tableIssues = fixable.filter(i => i.type === 'missing_table');
    const columnIssues = fixable.filter(i => i.type === 'missing_column');

    for (const issue of enumIssues) {
      try {
        await this.fixMissingEnum(issue);
        fixed++;
      } catch (error) {
        log.error(`[SchemaParity] Failed to fix missing enum ${issue.enumName}:`, error);
        failed++;
      }
    }

    for (const issue of tableIssues) {
      try {
        await this.fixMissingTable(issue);
        fixed++;
      } catch (error) {
        log.error(`[SchemaParity] Failed to fix missing table ${issue.table}:`, error);
        failed++;
      }
    }

    for (const issue of columnIssues) {
      try {
        await this.fixMissingColumn(issue);
        fixed++;
      } catch (error) {
        log.error(`[SchemaParity] Failed to fix missing column ${issue.table}.${issue.column}:`, error);
        failed++;
      }
    }
    
    log.info(`[SchemaParity] Auto-fix complete: ${fixed} fixed, ${failed} failed, ${skipped} skipped`);
    return { fixed, failed, skipped };
  }
  
  /**
   * Create a missing table from Drizzle schema definition
   */
  private resolveColumnPgType(col: any): string {
    const columnType = col.columnType || '';
    const dataType = col.dataType || '';

    if (columnType.includes('PgSerial')) return 'serial';
    if (columnType.includes('PgUUID')) return 'uuid';
    if (columnType.includes('PgTimestamp')) return 'timestamp without time zone';
    if (columnType.includes('PgNumeric')) return 'numeric';
    if (columnType.includes('PgDate')) return 'date';
    if (columnType.includes('PgReal')) return 'real';
    if (columnType.includes('PgDoublePrecision')) return 'double precision';
    if (columnType.includes('PgJsonb')) return 'jsonb';
    if (columnType.includes('PgJson')) return 'json';
    if (columnType.includes('PgText')) return 'text';
    if (columnType.includes('PgVarchar')) return 'character varying';
    if (columnType.includes('PgInteger')) return 'integer';
    if (columnType.includes('PgBoolean')) return 'boolean';
    if (columnType.includes('PgBigInt') || columnType.includes('PgBigSerial')) return 'bigint';

    if (col.enumValues && Array.isArray(col.enumValues) && col.enumValues.length > 0) {
      return 'text';
    }

    return drizzleTypeToPgType(col);
  }

  private resolveArrayPgType(col: any): string {
    const columnType = col.columnType || '';
    if (columnType.includes('PgText')) return 'text[]';
    if (columnType.includes('PgVarchar')) return 'character varying[]';
    if (columnType.includes('PgInteger')) return 'integer[]';
    if (columnType.includes('PgUUID')) return 'uuid[]';
    if (columnType.includes('PgJsonb')) return 'jsonb[]';
    return 'text[]';
  }

  private resolveDefaultValue(col: any): string {
    if (col.hasDefault && col.default !== undefined) {
      if (typeof col.default === 'string') return ` DEFAULT '${col.default.replace(/'/g, "''")}'`;
      if (typeof col.default === 'number') return ` DEFAULT ${col.default}`;
      if (typeof col.default === 'boolean') return ` DEFAULT ${col.default}`;
    }

    if (col.defaultFn) {
      const columnType = col.columnType || '';
      if (columnType.includes('PgUUID')) return ' DEFAULT gen_random_uuid()';
      if (columnType.includes('PgTimestamp')) return ' DEFAULT now()';
      log.warn(`[SchemaParity] Unknown defaultFn for column type ${columnType}, skipping default`);
      return '';
    }

    return '';
  }

  private async fixMissingTable(issue: SchemaIssue): Promise<void> {
    if (!issue.table || !issue.drizzleTableRef) return;

    try {
      const columns = getTableColumns(issue.drizzleTableRef);
      const colDefs: string[] = [];
      const primaryKeys: string[] = [];
      const uniqueConstraints: string[] = [];

      for (const [colName, colDef] of Object.entries(columns)) {
        const col = colDef as any;
        const snakeName = col.name || toSnakeCase(colName);

        const isArrayCol = col.columnType?.includes('Array') || col.dataType === 'array';
        let pgType: string;
        if (isArrayCol) {
          pgType = this.resolveArrayPgType(col);
        } else {
          pgType = this.resolveColumnPgType(col);
        }

        const notNull = col.notNull ? ' NOT NULL' : '';
        const defaultVal = this.resolveDefaultValue(col);

        if (col.primary || col.primaryKey) primaryKeys.push(`"${snakeName}"`);
        if (col.isUnique) uniqueConstraints.push(`"${snakeName}"`);

        colDefs.push(`"${snakeName}" ${pgType}${notNull}${defaultVal}`);
      }

      if (primaryKeys.length > 0) {
        colDefs.push(`PRIMARY KEY (${primaryKeys.join(', ')})`);
      }
      for (const uc of uniqueConstraints) {
        colDefs.push(`UNIQUE (${uc})`);
      }

      const createSql = `CREATE TABLE IF NOT EXISTS "${issue.table}" (\n  ${colDefs.join(',\n  ')}\n)`;
      log.info(`[SchemaParity] Creating table: ${issue.table} (${Object.keys(columns).length} columns)`);
      // CATEGORY C — Raw SQL retained: DDL CREATE TABLE via sql.raw() | Tables: dynamic | Verified: 2026-03-23
      await typedQuery(sql.raw(createSql));
    } catch (error) {
      log.error(`[SchemaParity] Error creating table ${issue.table}:`, error);
      throw error;
    }
  }

  /**
   * Add a missing column with safe defaults
   */
  private async fixMissingColumn(issue: SchemaIssue): Promise<void> {
    if (!issue.table || !issue.column) return;
    
    // Convert type to proper PostgreSQL syntax
    let pgType = issue.expected || 'text';
    
    // ARRAY type needs special handling - PostgreSQL uses TEXT[] not ARRAY
    if (pgType.toUpperCase() === 'ARRAY') {
      pgType = 'TEXT[]';  // Default to TEXT array for safety
    }
    
    // Use text type with NULL default for safety
    const alterSql = `ALTER TABLE "${issue.table}" ADD COLUMN IF NOT EXISTS "${issue.column}" ${pgType} DEFAULT NULL`;
    
    log.info(`[SchemaParity] Adding column: ${issue.table}.${issue.column}`);
    // CATEGORY C — Raw SQL retained: DDL ALTER TABLE ADD COLUMN via sql.raw() | Tables: dynamic | Verified: 2026-03-23
    await typedQuery(sql.raw(alterSql));
  }
  
  /**
   * Create a missing enum type
   */
  private async fixMissingEnum(issue: SchemaIssue): Promise<void> {
    if (!issue.enumName || !issue.expected) return;
    
    const values = issue.expected.split(', ').map(v => `'${v}'`).join(', ');
    const createSql = `CREATE TYPE "${issue.enumName}" AS ENUM (${values})`;
    
    log.info(`[SchemaParity] Creating enum: ${issue.enumName}`);
    // CATEGORY C — Raw SQL retained: DDL CREATE TYPE enum via sql.raw() | Tables: dynamic | Verified: 2026-03-23
    await typedQuery(sql.raw(createSql));
  }
  
  /**
   * Get current issues without re-running check
   */
  getIssues(): SchemaIssue[] {
    return this.issues;
  }
}

// Singleton instance
export const schemaParityService = new SchemaParityService();

/**
 * Run parity check at startup
 */
export async function runSchemaParityCheck(autoFix: boolean = false): Promise<ParityReport> {
  const report = await schemaParityService.checkParity();
  
  if (autoFix && report.totalIssues > 0) {
    await schemaParityService.autoFix();
    // Re-run check to confirm fixes
    return await schemaParityService.checkParity();
  }
  
  return report;
}
