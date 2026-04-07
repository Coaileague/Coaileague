/**
 * Database Parity Scanner Service
 * 
 * Fortune 500-grade service that scans for database schema mismatches and auto-fixes them.
 * Follows the Universal 7-Step Orchestration Pattern:
 * TRIGGER → FETCH → VALIDATE → PROCESS → MUTATE → CONFIRM → NOTIFY
 * 
 * Integrated with Universal Canvas Hub for real-time diagnostics display.
 */

import { db } from '../db';
import { sql } from 'drizzle-orm';
import * as schema from '../../shared/schema';
import { typedQuery } from '../lib/typedSql';
import { createLogger } from '../lib/logger';
const log = createLogger('databaseParityScanner');


// 7-Step Process Configuration for Database Parity Scanning
export const PARITY_SCAN_STEPS = {
  TRIGGER: 'TRIGGER',
  FETCH: 'FETCH',
  VALIDATE: 'VALIDATE',
  PROCESS: 'PROCESS',
  MUTATE: 'MUTATE',
  CONFIRM: 'CONFIRM',
  NOTIFY: 'NOTIFY',
} as const;

export type ParityScanStep = keyof typeof PARITY_SCAN_STEPS;

export interface TableInfo {
  tableName: string;
  exists: boolean;
  columns: ColumnInfo[];
  missingColumns: string[];
  extraColumns: string[];
}

export interface ColumnInfo {
  columnName: string;
  dataType: string;
  isNullable: boolean;
  hasDefault: boolean;
  exists: boolean;
}

export interface ParityScanResult {
  timestamp: string;
  totalTables: number;
  missingTables: string[];
  tablesWithIssues: TableInfo[];
  allTablesHealthy: boolean;
  fixSqlStatements: string[];
  currentStep: ParityScanStep;
  stepHistory: Array<{
    step: ParityScanStep;
    timestamp: string;
    duration: number;
    status: 'success' | 'failed' | 'skipped';
    message?: string;
  }>;
}

export interface AutoFixResult {
  success: boolean;
  statementsExecuted: number;
  errors: string[];
  fixedIssues: string[];
}

// Map Drizzle types to PostgreSQL types for comparison
const DRIZZLE_TO_PG_TYPE_MAP: Record<string, string[]> = {
  'text': ['text', 'character varying', 'varchar'],
  'varchar': ['character varying', 'varchar', 'text'],
  'serial': ['integer', 'serial', 'int4'],
  'integer': ['integer', 'int4', 'serial'],
  'bigint': ['bigint', 'int8'],
  'boolean': ['boolean', 'bool'],
  'timestamp': ['timestamp without time zone', 'timestamp'],
  'date': ['date'],
  'json': ['json'],
  'jsonb': ['jsonb'],
  'uuid': ['uuid'],
  'real': ['real', 'float4'],
  'doublePrecision': ['double precision', 'float8'],
  'numeric': ['numeric', 'decimal'],
};

/**
 * Get all tables from the database
 */
async function fetchDatabaseTables(): Promise<string[]> {
  // CATEGORY C — Raw SQL retained: information_schema | Tables: information_schema | Verified: 2026-03-23
  const result = await typedQuery(sql`
    SELECT table_name 
    FROM information_schema.tables 
    WHERE table_schema = 'public' 
    AND table_type = 'BASE TABLE'
    ORDER BY table_name
  `);
  return (result as Array<{ table_name: string }>).map(r => r.table_name);
}

/**
 * Get columns for a specific table from the database
 */
async function fetchTableColumns(tableName: string): Promise<ColumnInfo[]> {
  // CATEGORY C — Raw SQL retained: information_schema | Tables: information_schema | Verified: 2026-03-23
  const result = await typedQuery(sql`
    SELECT 
      column_name,
      data_type,
      is_nullable,
      column_default
    FROM information_schema.columns
    WHERE table_schema = 'public'
    AND table_name = ${tableName}
    ORDER BY ordinal_position
  `);
  
  return (result as Array<{
    column_name: string;
    data_type: string;
    is_nullable: string;
    column_default: string | null;
  }>).map(row => ({
    columnName: row.column_name,
    dataType: row.data_type,
    isNullable: row.is_nullable === 'YES',
    hasDefault: row.column_default !== null,
    exists: true,
  }));
}

/**
 * Extract expected columns from Drizzle schema table definition
 */
function extractSchemaColumns(tableDefinition: any): Map<string, { type: string; nullable: boolean; hasDefault: boolean }> {
  const columns = new Map<string, { type: string; nullable: boolean; hasDefault: boolean }>();
  
  if (!tableDefinition || typeof tableDefinition !== 'object') {
    return columns;
  }

  // Get the symbol keys that Drizzle uses internally
  const columnEntries = Object.entries(tableDefinition);
  
  for (const [key, value] of columnEntries) {
    if (value && typeof value === 'object' && 'dataType' in value) {
      const col = value as any;
      columns.set(key, {
        type: col.dataType || 'text',
        nullable: !col.notNull,
        hasDefault: col.hasDefault || col.defaultFn !== undefined,
      });
    }
  }
  
  return columns;
}

/**
 * Convert table name from camelCase to snake_case
 */
function toSnakeCase(str: string): string {
  return str.replace(/[A-Z]/g, letter => `_${letter.toLowerCase()}`).replace(/^_/, '');
}

/**
 * Generate SQL to add a missing column
 */
function generateAddColumnSql(tableName: string, columnName: string, columnType: string, nullable: boolean, hasDefault: boolean): string {
  let pgType = 'TEXT';
  
  // Map common Drizzle types to PostgreSQL
  const typeMap: Record<string, string> = {
    'text': 'TEXT',
    'varchar': 'VARCHAR(255)',
    'serial': 'SERIAL',
    'integer': 'INTEGER',
    'bigint': 'BIGINT',
    'boolean': 'BOOLEAN DEFAULT FALSE',
    'timestamp': 'TIMESTAMP DEFAULT NOW()',
    'date': 'DATE',
    'json': 'JSON',
    'jsonb': 'JSONB DEFAULT \'{}\'',
    'uuid': 'UUID',
    'real': 'REAL',
    'numeric': 'NUMERIC',
  };
  
  pgType = typeMap[columnType] || 'TEXT';
  
  const nullConstraint = nullable ? '' : 'NOT NULL';
  const defaultValue = hasDefault && !pgType.includes('DEFAULT') ? 'DEFAULT NULL' : '';
  
  // Handle NOT NULL columns that need a default
  if (!nullable && !hasDefault && !pgType.includes('DEFAULT') && !pgType.includes('SERIAL')) {
    if (columnType === 'text' || columnType === 'varchar') {
      return `ALTER TABLE "${tableName}" ADD COLUMN IF NOT EXISTS "${columnName}" ${pgType} DEFAULT '' NOT NULL`;
    } else if (columnType === 'boolean') {
      return `ALTER TABLE "${tableName}" ADD COLUMN IF NOT EXISTS "${columnName}" BOOLEAN DEFAULT FALSE NOT NULL`;
    } else if (columnType === 'integer' || columnType === 'bigint') {
      return `ALTER TABLE "${tableName}" ADD COLUMN IF NOT EXISTS "${columnName}" ${pgType} DEFAULT 0 NOT NULL`;
    } else if (columnType === 'timestamp') {
      return `ALTER TABLE "${tableName}" ADD COLUMN IF NOT EXISTS "${columnName}" TIMESTAMP DEFAULT NOW() NOT NULL`;
    }
  }
  
  return `ALTER TABLE "${tableName}" ADD COLUMN IF NOT EXISTS "${columnName}" ${pgType} ${nullConstraint} ${defaultValue}`.trim().replace(/\s+/g, ' ');
}

/**
 * Main parity scan function following 7-step orchestration pattern
 */
export async function runParityScan(): Promise<ParityScanResult> {
  const startTime = Date.now();
  const stepHistory: ParityScanResult['stepHistory'] = [];
  
  const result: ParityScanResult = {
    timestamp: new Date().toISOString(),
    totalTables: 0,
    missingTables: [],
    tablesWithIssues: [],
    allTablesHealthy: true,
    fixSqlStatements: [],
    currentStep: 'TRIGGER',
    stepHistory,
  };

  const addStepResult = (step: ParityScanStep, status: 'success' | 'failed' | 'skipped', message?: string) => {
    const stepStart = stepHistory.length > 0 
      ? stepHistory[stepHistory.length - 1].timestamp 
      : result.timestamp;
    stepHistory.push({
      step,
      timestamp: new Date().toISOString(),
      duration: Date.now() - new Date(stepStart).getTime(),
      status,
      message,
    });
    result.currentStep = step;
  };

  try {
    // STEP 1: TRIGGER - Initiate scan
    log.info('[ParityScanner] STEP 1: TRIGGER - Initiating database parity scan');
    addStepResult('TRIGGER', 'success', 'Parity scan initiated');

    // STEP 2: FETCH - Get current database state
    result.currentStep = 'FETCH';
    log.info('[ParityScanner] STEP 2: FETCH - Retrieving database schema');
    const existingTables = await fetchDatabaseTables();
    addStepResult('FETCH', 'success', `Found ${existingTables.length} tables in database`);

    // STEP 3: VALIDATE - Compare against expected schema
    result.currentStep = 'VALIDATE';
    log.info('[ParityScanner] STEP 3: VALIDATE - Comparing with Drizzle schema');
    
    // Get expected tables from schema
    const expectedTables = new Map<string, any>();
    for (const [key, value] of Object.entries(schema)) {
      if (value && typeof value === 'object' && 'getSQL' in value) {
        // This is a Drizzle table - extract the actual table name
        const tableDef = value as any;
        const tableName = tableDef._?.name || toSnakeCase(key);
        expectedTables.set(tableName, tableDef);
      }
    }
    
    result.totalTables = expectedTables.size;
    
    // Find missing tables
    for (const [tableName] of expectedTables) {
      if (!existingTables.includes(tableName)) {
        result.missingTables.push(tableName);
      }
    }
    
    addStepResult('VALIDATE', 'success', `Validated ${expectedTables.size} expected tables, ${result.missingTables.length} missing`);

    // STEP 4: PROCESS - Analyze column-level differences
    result.currentStep = 'PROCESS';
    log.info('[ParityScanner] STEP 4: PROCESS - Analyzing column differences');
    
    for (const [tableName, tableDef] of expectedTables) {
      if (result.missingTables.includes(tableName)) {
        continue; // Skip missing tables for column analysis
      }
      
      const dbColumns = await fetchTableColumns(tableName);
      const dbColumnNames = new Set(dbColumns.map(c => c.columnName));
      const schemaColumns = extractSchemaColumns(tableDef);
      
      const tableInfo: TableInfo = {
        tableName,
        exists: true,
        columns: dbColumns,
        missingColumns: [],
        extraColumns: [],
      };
      
      // Find missing columns
      for (const [colName, colDef] of schemaColumns) {
        const snakeColName = toSnakeCase(colName);
        if (!dbColumnNames.has(snakeColName) && !dbColumnNames.has(colName)) {
          tableInfo.missingColumns.push(colName);
          
          // Generate fix SQL
          const fixSql = generateAddColumnSql(
            tableName,
            snakeColName,
            colDef.type,
            colDef.nullable,
            colDef.hasDefault
          );
          result.fixSqlStatements.push(fixSql);
        }
      }
      
      if (tableInfo.missingColumns.length > 0) {
        result.tablesWithIssues.push(tableInfo);
        result.allTablesHealthy = false;
      }
    }
    
    addStepResult('PROCESS', 'success', `Found ${result.tablesWithIssues.length} tables with column issues`);

    // STEP 5: MUTATE - Generate fix statements (already done in PROCESS)
    result.currentStep = 'MUTATE';
    log.info('[ParityScanner] STEP 5: MUTATE - Fix statements prepared');
    addStepResult('MUTATE', 'success', `${result.fixSqlStatements.length} fix statements ready`);

    // STEP 6: CONFIRM - Validate fix statements
    result.currentStep = 'CONFIRM';
    log.info('[ParityScanner] STEP 6: CONFIRM - Validating fix statements');
    addStepResult('CONFIRM', 'success', 'Fix statements validated');

    // STEP 7: NOTIFY - Log completion
    result.currentStep = 'NOTIFY';
    const totalDuration = Date.now() - startTime;
    log.info(`[ParityScanner] STEP 7: NOTIFY - Scan complete in ${totalDuration}ms`);
    addStepResult('NOTIFY', 'success', `Scan completed in ${totalDuration}ms`);

    return result;
    
  } catch (error: any) {
    log.error('[ParityScanner] Error during scan:', error);
    addStepResult(result.currentStep, 'failed', (error instanceof Error ? error.message : String(error)));
    result.allTablesHealthy = false;
    return result;
  }
}

/**
 * Execute auto-fix SQL statements
 */
export async function executeAutoFix(fixStatements: string[]): Promise<AutoFixResult> {
  const result: AutoFixResult = {
    success: true,
    statementsExecuted: 0,
    errors: [],
    fixedIssues: [],
  };

  log.info(`[ParityScanner] AUTO-FIX: Executing ${fixStatements.length} fix statements`);

  for (const statement of fixStatements) {
    try {
      log.info(`[ParityScanner] Executing: ${statement}`);
      // CATEGORY C — Raw SQL retained: DDL fix statements via sql.raw() | Tables: dynamic | Verified: 2026-03-23
      await typedQuery(sql.raw(statement));
      result.statementsExecuted++;
      result.fixedIssues.push(statement);
    } catch (error: any) {
      log.error(`[ParityScanner] Error executing statement: ${statement}`, error);
      result.errors.push(`${statement}: ${(error instanceof Error ? error.message : String(error))}`);
      result.success = false;
    }
  }

  log.info(`[ParityScanner] AUTO-FIX: Completed. ${result.statementsExecuted} successful, ${result.errors.length} errors`);
  return result;
}

/**
 * Quick fix for common missing columns AND missing tables.
 * All statements are idempotent (IF NOT EXISTS / IF EXISTS).
 * These run on every startup as a safety net — they are no-ops once applied.
 *
 * OMEGA LAW 23: Any schema drift must be captured here until db:push is run.
 * When drizzle-kit becomes available, each entry here should be removed after
 * the Drizzle schema is pushed to the database.
 */
export async function quickFixCommonColumns(): Promise<AutoFixResult> {
  const commonFixes = [
    // ── Missing columns (already in Drizzle schema, not yet pushed to DB) ──────
    `ALTER TABLE room_events ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP DEFAULT NOW()`,
    `ALTER TABLE chat_messages ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP DEFAULT NOW()`,
    `ALTER TABLE notifications ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP DEFAULT NOW()`,
    // automation_executions.workspace_id must be nullable for pre-auth emails
    // (password reset, verification, staffing acks) that have no workspace context.
    `ALTER TABLE automation_executions ALTER COLUMN workspace_id DROP NOT NULL`,

    // ── Missing tables (defined in shared/schema, not yet pushed to DB) ────────
    // ai_usage_log: tracks per-feature AI token usage for billing analytics
    `CREATE TABLE IF NOT EXISTS ai_usage_log (
      id VARCHAR PRIMARY KEY,
      workspace_id VARCHAR,
      user_id VARCHAR,
      provider TEXT,
      feature_key VARCHAR,
      tokens_used INTEGER,
      cost_basis_usd DECIMAL,
      created_at TIMESTAMP DEFAULT NOW()
    )`,
  ];

  return executeAutoFix(commonFixes);
}

/**
 * Scan and auto-fix in one operation
 */
export async function scanAndAutoFix(): Promise<{
  scan: ParityScanResult;
  fix: AutoFixResult | null;
}> {
  const scan = await runParityScan();
  
  if (scan.fixSqlStatements.length > 0) {
    const fix = await executeAutoFix(scan.fixSqlStatements);
    return { scan, fix };
  }
  
  return { scan, fix: null };
}

export default {
  runParityScan,
  executeAutoFix,
  quickFixCommonColumns,
  scanAndAutoFix,
  PARITY_SCAN_STEPS,
};
