/**
 * DOMAIN OPERATIONS SUBAGENTS - Trinity Platform Intelligence
 * ============================================================
 * Specialized subagents for platform-wide code and log analysis:
 * - SchemaOps: Database schema understanding and mismatch detection
 * - LogOps: Log analysis, error detection, and pattern recognition
 * - HandlerOps: Route/handler gap detection and analysis
 * - HookOps: React hook analysis and issue detection
 * 
 * Part of Trinity's Full Platform Awareness initiative.
 */

import { db } from '../../../db';
import { createLogger } from '../../../lib/logger';
import { 
  aiGapFindings,
  InsertAiGapFinding,
} from '@shared/schema';

const log = createLogger('DomainOps');
import { eq, and, like, desc, sql, inArray } from 'drizzle-orm';
import { meteredGemini } from '../../billing/meteredGeminiClient';
import { helpaiOrchestrator } from '../../helpai/platformActionHub';
import * as fs from 'fs';
import * as path from 'path';
import { typedQuery } from '../../../lib/typedSql';

// ============================================================================
// SHARED TYPES
// ============================================================================

interface GapFinding {
  filePath: string;
  lineNumber?: number;
  columnNumber?: number;
  gapType: string;
  severity: 'info' | 'warning' | 'error' | 'critical' | 'blocker';
  title: string;
  description: string;
  technicalDetails?: string;
  suggestedFix?: string;
  detectionMethod: string;
  confidence: number;
  workspaceId?: string;
}

interface ComponentAnalysis {
  filePath: string;
  componentName: string;
  domain: string;
  exports: string[];
  dependencies: string[];
  description?: string;
}

interface LogPattern {
  pattern: RegExp;
  severity: 'info' | 'warning' | 'error' | 'critical';
  category: string;
}

// ============================================================================
// PERSISTENCE HELPERS
// ============================================================================

/**
 * Persist a gap finding to the database
 */
async function persistGapFinding(finding: GapFinding, detectedBy: string): Promise<string | null> {
  try {
    const existing = await db
      .select()
      .from(aiGapFindings)
      .where(and(
        eq(aiGapFindings.filePath, finding.filePath),
        eq(aiGapFindings.gapType, finding.gapType),
        eq(aiGapFindings.title, finding.title),
        eq(aiGapFindings.status, 'open')
      ))
      .limit(1);

    if (existing.length > 0) {
      await db
        .update(aiGapFindings)
        .set({
          updatedAt: new Date(),
        })
        .where(eq(aiGapFindings.id, existing[0].id));
      return existing[0].id;
    }

    const [inserted] = await db
      .insert(aiGapFindings)
      .values({
        filePath: finding.filePath,
        lineNumber: finding.lineNumber,
        columnNumber: finding.columnNumber,
        gapType: finding.gapType,
        severity: finding.severity,
        title: finding.title,
        description: finding.description,
        technicalDetails: finding.technicalDetails,
        suggestedFix: finding.suggestedFix,
        detectionMethod: finding.detectionMethod,
        detectionConfidence: finding.confidence?.toString() || '0.8',
        status: 'open',
        detectedBy,
        workspaceId: finding.workspaceId || 'system',
      } as InsertAiGapFinding)
      .returning();

    log.info(`Persisted gap finding: ${finding.title}`);
    return inserted.id;
  } catch (error) {
    log.error('Error persisting gap finding:', error);
    return null;
  }
}

/**
 * Persist multiple gap findings in batch
 */
async function persistGapFindings(findings: GapFinding[], detectedBy: string): Promise<string[]> {
  const persistedIds: string[] = [];
  
  for (const finding of findings) {
    const id = await persistGapFinding(finding, detectedBy);
    if (id !== null) {
      persistedIds.push(id);
    }
  }
  
  log.info(`Persisted ${persistedIds.length}/${findings.length} gap findings`);
  return persistedIds;
}

/**
 * Persist a component to the registry
 */
async function persistComponent(component: ComponentAnalysis, registeredBy: string): Promise<number | null> {
  try {
    // Check if component already exists
    const existing = await db
      .select()
      .from(aiComponentRegistry)
      .where(and(
        eq(aiComponentRegistry.filePath, component.filePath),
        eq(aiComponentRegistry.componentName, component.componentName)
      ))
      .limit(1);

    if (existing.length > 0) {
      // Update existing component
      await db
        .update(aiComponentRegistry)
        .set({
          exports: component.exports,
          dependencies: component.dependencies,
          description: component.description,
          lastScannedAt: new Date(),
          updatedAt: new Date(),
        })
        .where(eq(aiComponentRegistry.id, existing[0].id));
      return existing[0].id;
    }

    // Insert new component
    const [inserted] = await db
      .insert(aiComponentRegistry)
      .values({
        workspaceId: 'system',
        filePath: component.filePath,
        componentName: component.componentName,
        domain: component.domain,
        exports: component.exports,
        dependencies: component.dependencies,
        description: component.description,
        registeredBy,
        lastScannedAt: new Date(),
        isActive: true,
      } as InsertAiComponentRegistry)
      .returning();

    log.info(`Registered component: ${component.componentName}`);
    return inserted.id;
  } catch (error) {
    log.error('Error registering component:', error);
    return null;
  }
}

/**
 * Persist multiple components in batch
 */
async function persistComponents(components: ComponentAnalysis[], registeredBy: string): Promise<number[]> {
  const persistedIds: number[] = [];
  
  for (const component of components) {
    const id = await persistComponent(component, registeredBy);
    if (id !== null) {
      persistedIds.push(id);
    }
  }
  
  log.info(`Registered ${persistedIds.length}/${components.length} components`);
  return persistedIds;
}

// ============================================================================
// SCHEMA OPS SUBAGENT
// ============================================================================

class SchemaOpsSubagent {
  private static instance: SchemaOpsSubagent;
  private readonly log = createLogger('SchemaOps');

  static getInstance(): SchemaOpsSubagent {
    if (!this.instance) {
      this.instance = new SchemaOpsSubagent();
    }
    return this.instance;
  }

  /**
   * Scan the schema file to understand all tables and relationships
   */
  async scanSchemaFile(): Promise<ComponentAnalysis[]> {
    this.log.info('Scanning schema file...');
    
    const schemaPath = 'shared/schema.ts';
    const components: ComponentAnalysis[] = [];
    
    try {
      const content = fs.readFileSync(schemaPath, 'utf-8');
      
      // Extract table definitions
      const tableRegex = /export const (\w+) = pgTable\("([^"]+)"/g;
      let match;
      
      while ((match = tableRegex.exec(content)) !== null) {
        const [, varName, tableName] = match;
        
        components.push({
          filePath: schemaPath,
          componentName: varName,
          domain: 'shared_schema',
          exports: [varName, `insert${this.pascalCase(varName)}Schema`, `Insert${this.pascalCase(varName)}`, this.pascalCase(varName)],
          dependencies: ['drizzle-orm', 'drizzle-zod'],
          description: `Database table: ${tableName}`,
        });
      }

      // Extract enum definitions
      const enumRegex = /export const (\w+) = pgEnum\('([^']+)'/g;
      while ((match = enumRegex.exec(content)) !== null) {
        const [, varName, enumName] = match;
        
        components.push({
          filePath: schemaPath,
          componentName: varName,
          domain: 'shared_schema',
          exports: [varName],
          dependencies: ['drizzle-orm/pg-core'],
          description: `PostgreSQL enum: ${enumName}`,
        });
      }

      this.log.info(`Found ${components.length} schema components`);
      return components;
    } catch (error) {
      this.log.error('Error scanning schema:', error);
      return [];
    }
  }

  /**
   * Detect schema mismatches between code and database
   */
  async detectSchemaMismatches(): Promise<GapFinding[]> {
    this.log.info('Detecting schema mismatches...');
    
    const findings: GapFinding[] = [];
    
    try {
      // Get tables from database
      // CATEGORY C — Raw SQL retained: information_schema | Tables: information_schema | Verified: 2026-03-23
      const dbTables = await typedQuery(sql`
        SELECT table_name FROM information_schema.tables 
        WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
      `);
      
      const dbTableNames = new Set((dbTables as any[]).map(r => r.table_name));
      
      // Get tables from schema file
      const schemaComponents = await this.scanSchemaFile();
      const schemaTableNames = new Set(
        schemaComponents
          .filter(c => c.description?.startsWith('Database table:'))
          .map(c => c.description?.replace('Database table: ', '') || '')
      );
      
      // Find tables in schema but not in DB
      const missingTables: string[] = [];
      for (const tableName of schemaTableNames) {
        if (!dbTableNames.has(tableName)) {
          missingTables.push(tableName);
        }
      }
      
      if (missingTables.length > 0) {
        // Report as a single summary finding instead of one per table to reduce noise
        const sampleTables = missingTables.slice(0, 10).join(', ');
        const remaining = missingTables.length > 10 ? ` and ${missingTables.length - 10} more` : '';
        findings.push({
          filePath: 'shared/schema.ts',
          gapType: 'schema_mismatch',
          severity: 'warning',
          title: `${missingTables.length} table(s) defined in schema but not in database`,
          description: `Tables not yet pushed to database: ${sampleTables}${remaining}. Run db:push to sync if these tables are needed.`,
          technicalDetails: `${missingTables.length} tables need database sync`,
          suggestedFix: 'Execute database migration or push schema for needed tables',
          detectionMethod: 'schema_db_comparison',
          confidence: 0.7,
        });
      }
      
      this.log.info(`Found ${missingTables.length} unpushed tables (reported as 1 summary finding)`);
      return findings;
    } catch (error) {
      this.log.error('Error detecting mismatches:', error);
      return [];
    }
  }

  /**
   * Analyze table relationships and find orphaned references
   */
  async analyzeRelationships(): Promise<GapFinding[]> {
    this.log.info('Analyzing schema relationships...');
    
    const findings: GapFinding[] = [];
    
    try {
      // Get foreign key constraints from database
      // CATEGORY C — Raw SQL retained: information_schema | Tables: information_schema | Verified: 2026-03-23
      const fkQuery = await typedQuery(sql`
        SELECT
          tc.constraint_name,
          tc.table_name,
          kcu.column_name,
          ccu.table_name AS foreign_table_name,
          ccu.column_name AS foreign_column_name
        FROM information_schema.table_constraints AS tc
        JOIN information_schema.key_column_usage AS kcu
          ON tc.constraint_name = kcu.constraint_name
        JOIN information_schema.constraint_column_usage AS ccu
          ON ccu.constraint_name = tc.constraint_name
        WHERE constraint_type = 'FOREIGN KEY'
      `);
      
      // Get all existing indexes in one query for efficient comparison
      // CATEGORY C — Raw SQL retained: pg_indexes system catalog introspection | Tables: pg_indexes | Verified: 2026-03-23
      const allIndexes = await typedQuery(sql`
        SELECT tablename, indexdef FROM pg_indexes WHERE schemaname = 'public'
      `);
      const indexMap = new Map<string, string[]>();
      for (const row of (allIndexes as any[])) {
        const existing = indexMap.get(row.tablename) || [];
        existing.push(row.indexdef);
        indexMap.set(row.tablename, existing);
      }
      
      // Check for missing indexes on FK columns
      const missingIndexFKs: string[] = [];
      for (const row of (fkQuery as any[])) {
        const { table_name, column_name } = row;
        const tableIndexes = indexMap.get(table_name) || [];
        const hasIndex = tableIndexes.some(def => def.includes(column_name));
        if (!hasIndex) {
          missingIndexFKs.push(`${table_name}.${column_name}`);
        }
      }
      
      if (missingIndexFKs.length > 0) {
        const sampleFKs = missingIndexFKs.slice(0, 10).join(', ');
        const remaining = missingIndexFKs.length > 10 ? ` and ${missingIndexFKs.length - 10} more` : '';
        findings.push({
          filePath: 'shared/schema.ts',
          gapType: 'performance_issue',
          severity: 'info',
          title: `${missingIndexFKs.length} foreign key column(s) without indexes`,
          description: `Foreign key columns without indexes: ${sampleFKs}${remaining}. Consider adding indexes for frequently queried tables.`,
          suggestedFix: 'Add indexes on high-traffic FK columns',
          detectionMethod: 'fk_index_analysis',
          confidence: 0.7,
        });
      }
      
      return findings;
    } catch (error) {
      this.log.error('Error analyzing relationships:', error);
      return [];
    }
  }

  private pascalCase(str: string): string {
    return str.replace(/(^|_)(\w)/g, (_, __, c) => c.toUpperCase());
  }

  /**
   * Register SchemaOps actions with AI Brain
   */
  registerActions(): void {
    const self = this;
    const actions = [
      { id: 'schema.scan_definitions', name: 'Scan Schema Definitions', desc: 'Scan schema file for table/enum definitions', 
        fn: async (p: any) => { const c = await self.scanSchemaFile(); if (p?.persist !== false) await persistComponents(c, 'SchemaOps'); return c; } },
      { id: 'schema.detect_mismatches', name: 'Detect Schema Mismatches', desc: 'Detect mismatches between schema and database', 
        fn: async (p: any) => { const f = await self.detectSchemaMismatches(); if (p?.persist !== false && f.length > 0) await persistGapFindings(f, 'SchemaOps'); return f; } },
      { id: 'schema.analyze_relationships', name: 'Analyze Relationships', desc: 'Analyze table relationships and find issues', 
        fn: async (p: any) => { const f = await self.analyzeRelationships(); if (p?.persist !== false && f.length > 0) await persistGapFindings(f, 'SchemaOps'); return f; } },
    ];

    for (const action of actions) {
      helpaiOrchestrator.registerAction({
        actionId: action.id,
        name: action.name,
        category: 'schema_ops',
        description: action.desc,
        requiredRoles: ['support_agent', 'support_manager', 'sysop', 'deputy_admin', 'root_admin'],
        handler: async (request) => {
          const startTime = Date.now();
          const result = await action.fn(request.payload || {});
          return { success: true, actionId: request.actionId, message: `${action.name} completed`, data: result, executionTimeMs: Date.now() - startTime };
        },
      });
    }

    this.log.info('Registered 3 AI Brain actions');
  }
}

// ============================================================================
// LOG OPS SUBAGENT
// ============================================================================

class LogOpsSubagent {
  private static instance: LogOpsSubagent;
  private readonly log = createLogger('LogOps');
  
  private readonly errorPatterns: LogPattern[] = [
    { pattern: /ERROR/i, severity: 'error', category: 'general_error' },
    { pattern: /FATAL/i, severity: 'critical', category: 'fatal_error' },
    { pattern: /uncaught exception/i, severity: 'critical', category: 'uncaught_exception' },
    { pattern: /TypeError|ReferenceError|SyntaxError/i, severity: 'error', category: 'js_error' },
    { pattern: /ECONNREFUSED|ENOTFOUND|ETIMEDOUT/i, severity: 'error', category: 'network_error' },
    { pattern: /database.*error|sql.*error/i, severity: 'error', category: 'db_error' },
    { pattern: /out of memory|heap/i, severity: 'critical', category: 'memory_error' },
    { pattern: /permission denied|unauthorized|403|401/i, severity: 'warning', category: 'auth_error' },
    { pattern: /deprecated/i, severity: 'info', category: 'deprecation' },
    { pattern: /warning/i, severity: 'warning', category: 'warning' },
  ];

  static getInstance(): LogOpsSubagent {
    if (!this.instance) {
      this.instance = new LogOpsSubagent();
    }
    return this.instance;
  }

  /**
   * Analyze log content for errors and issues
   */
  async analyzeLogContent(logContent: string, source: string = 'unknown'): Promise<GapFinding[]> {
    this.log.info(`Analyzing log content from ${source}...`);
    
    const findings: GapFinding[] = [];
    const lines = logContent.split('\n');
    
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      
      for (const pattern of this.errorPatterns) {
        if (pattern.pattern.test(line)) {
          // Get context (surrounding lines)
          const contextStart = Math.max(0, i - 2);
          const contextEnd = Math.min(lines.length, i + 3);
          const context = lines.slice(contextStart, contextEnd).join('\n');
          
          findings.push({
            filePath: source,
            lineNumber: i + 1,
            gapType: 'log_error',
            severity: pattern.severity,
            title: `${pattern.category}: ${line.substring(0, 100)}`,
            description: `${pattern.severity.toUpperCase()} detected in logs`,
            technicalDetails: context,
            detectionMethod: 'log_pattern_matching',
            confidence: 0.85,
          });
          
          break;
        }
      }
    }
    
    this.log.info(`Found ${findings.length} log issues`);
    return findings;
  }

  /**
   * Extract stack traces from logs
   */
  extractStackTraces(logContent: string): Array<{ error: string; stack: string; location?: string }> {
    const traces: Array<{ error: string; stack: string; location?: string }> = [];
    
    // Match common stack trace patterns
    const stackRegex = /(?:Error|TypeError|ReferenceError|SyntaxError)[^\n]*\n(?:\s+at\s+[^\n]+\n)+/g;
    
    let match;
    while ((match = stackRegex.exec(logContent)) !== null) {
      const stackText = match[0];
      const lines = stackText.split('\n');
      const errorLine = lines[0];
      
      // Extract location from first "at" line
      const atMatch = lines[1]?.match(/at\s+(?:.*?\s+)?[\(\[]?([^:\(\)\[\]]+:\d+:\d+)/);
      const location = atMatch?.[1];
      
      traces.push({
        error: errorLine,
        stack: stackText,
        location,
      });
    }
    
    return traces;
  }

  /**
   * Use AI to analyze log patterns
   */
  async aiAnalyzeLogs(logContent: string, workspaceId: string = 'platform'): Promise<{
    summary: string;
    criticalIssues: string[];
    recommendations: string[];
  }> {
    this.log.info('AI analyzing logs...');
    
    try {
      const prompt = `Analyze these application logs and identify:
1. Critical issues that need immediate attention
2. Patterns that suggest problems
3. Recommendations for fixing

LOGS:
${logContent.substring(0, 10000)}

Respond in JSON format:
{
  "summary": "Brief overview of log health",
  "criticalIssues": ["issue1", "issue2"],
  "recommendations": ["rec1", "rec2"]
}`;

      const result = await meteredGemini.generate({
        workspaceId,
        featureKey: 'log_analysis',
        prompt,
        model: 'gemini-2.5-flash',
        temperature: 0.3,
        maxOutputTokens: 1024,
        metadata: { logLength: logContent.length }
      });
      
      if (result.success) {
        // Parse JSON response
        const jsonMatch = result.text.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          return JSON.parse(jsonMatch[0]);
        }
      }
      
      return {
        summary: 'Unable to analyze logs',
        criticalIssues: [],
        recommendations: [],
      };
    } catch (error) {
      this.log.error('AI analysis error:', error);
      return {
        summary: 'Analysis failed',
        criticalIssues: [],
        recommendations: [],
      };
    }
  }

  /**
   * Register LogOps actions with AI Brain
   */
  registerActions(): void {
    const self = this;
    const actions = [
      { id: 'logs.analyze_content', name: 'Analyze Log Content', desc: 'Analyze log content for errors and issues', 
        fn: async (p: any) => { const f = await self.analyzeLogContent(p.content, p.source); if (p.persist !== false && f.length > 0) await persistGapFindings(f, 'LogOps'); return f; } },
      { id: 'logs.extract_stack_traces', name: 'Extract Stack Traces', desc: 'Extract stack traces from log content', fn: (p: any) => self.extractStackTraces(p.content) },
      { id: 'logs.ai_analyze', name: 'AI Analyze Logs', desc: 'Use AI to analyze log patterns', fn: (p: any) => self.aiAnalyzeLogs(p.content, p.workspaceId) },
    ];

    for (const action of actions) {
      helpaiOrchestrator.registerAction({
        actionId: action.id,
        name: action.name,
        category: 'log_ops',
        description: action.desc,
        requiredRoles: ['support_agent', 'support_manager', 'sysop', 'deputy_admin', 'root_admin'],
        handler: async (request) => {
          const startTime = Date.now();
          const result = await action.fn(request.payload || {});
          return { success: true, actionId: request.actionId, message: `${action.name} completed`, data: result, executionTimeMs: Date.now() - startTime };
        },
      });
    }

    this.log.info('Registered 3 AI Brain actions');
  }
}

// ============================================================================
// HANDLER OPS SUBAGENT
// ============================================================================

class HandlerOpsSubagent {
  private static instance: HandlerOpsSubagent;

  static getInstance(): HandlerOpsSubagent {
    if (!this.instance) {
      this.instance = new HandlerOpsSubagent();
    }
    return this.instance;
  }

  /**
   * Scan routes directory for all API handlers
   */
  async scanRouteHandlers(): Promise<ComponentAnalysis[]> {
    log.info('[HandlerOps] Scanning route handlers...');
    
    const components: ComponentAnalysis[] = [];
    const routesPath = 'server/routes.ts';
    
    try {
      if (!fs.existsSync(routesPath)) {
        log.warn('[HandlerOps] Routes file not found');
        return [];
      }
      
      const content = fs.readFileSync(routesPath, 'utf-8');
      
      // Extract route definitions
      const routeRegex = /app\.(get|post|put|patch|delete)\s*\(\s*['"`]([^'"`]+)['"`]/gi;
      let match;
      
      while ((match = routeRegex.exec(content)) !== null) {
        const [, method, path] = match;
        
        components.push({
          filePath: routesPath,
          componentName: `${method.toUpperCase()} ${path}`,
          domain: 'backend_route',
          exports: [],
          dependencies: ['express'],
          description: `API Route: ${method.toUpperCase()} ${path}`,
        });
      }

      log.info(`[HandlerOps] Found ${components.length} route handlers`);
      return components;
    } catch (error) {
      log.error('[HandlerOps] Error scanning routes:', error);
      return [];
    }
  }

  /**
   * Detect missing handlers (routes referenced but not implemented)
   */
  async detectMissingHandlers(): Promise<GapFinding[]> {
    log.info('[HandlerOps] Detecting missing handlers...');
    
    const findings: GapFinding[] = [];
    
    try {
      // Scan frontend for API calls
      const frontendApiCalls = await this.scanFrontendApiCalls();
      
      // Get implemented routes
      const handlers = await this.scanRouteHandlers();
      const implementedPaths = new Set(handlers.map(h => h.componentName));
      
      // Find frontend calls without backend handlers
      for (const apiCall of frontendApiCalls) {
        let found = false;
        
        for (const impl of implementedPaths) {
          // Simple path matching (could be more sophisticated)
          if (impl.includes(apiCall.path) || this.pathsMatch(impl, apiCall.path)) {
            found = true;
            break;
          }
        }
        
        if (!found) {
          findings.push({
            filePath: apiCall.sourceFile,
            lineNumber: apiCall.line,
            gapType: 'missing_handler',
            severity: 'error',
            title: `Missing API handler: ${apiCall.method} ${apiCall.path}`,
            description: `Frontend calls ${apiCall.method} ${apiCall.path} but no handler found`,
            suggestedFix: `Add route handler in server/routes.ts`,
            detectionMethod: 'frontend_backend_comparison',
            confidence: 0.8,
          });
        }
      }
      
      log.info(`[HandlerOps] Found ${findings.length} missing handlers`);
      return findings;
    } catch (error) {
      log.error('[HandlerOps] Error detecting missing handlers:', error);
      return [];
    }
  }

  /**
   * Scan frontend for API calls
   */
  private async scanFrontendApiCalls(): Promise<Array<{ method: string; path: string; sourceFile: string; line: number }>> {
    const apiCalls: Array<{ method: string; path: string; sourceFile: string; line: number }> = [];
    
    // Scan client directory for API calls
    const clientDir = 'client/src';
    
    if (!fs.existsSync(clientDir)) {
      return apiCalls;
    }
    
    const scanDir = (dir: string) => {
      const entries = fs.readdirSync(dir, { withFileTypes: true });
      
      for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);
        
        if (entry.isDirectory()) {
          scanDir(fullPath);
        } else if (entry.name.endsWith('.tsx') || entry.name.endsWith('.ts')) {
          try {
            const content = fs.readFileSync(fullPath, 'utf-8');
            const lines = content.split('\n');
            
            // Look for fetch, apiRequest, or queryKey patterns
            for (let i = 0; i < lines.length; i++) {
              const line = lines[i];
              
              // queryKey pattern: queryKey: ['/api/...']
              const queryKeyMatch = line.match(/queryKey:\s*\[['"`]([^'"`]+)['"`]/);
              if (queryKeyMatch) {
                apiCalls.push({
                  method: 'GET',
                  path: queryKeyMatch[1],
                  sourceFile: fullPath,
                  line: i + 1,
                });
              }
              
              // apiRequest pattern
              const apiRequestMatch = line.match(/apiRequest\(['"`](GET|POST|PUT|PATCH|DELETE)['"`],\s*['"`]([^'"`]+)['"`]/i);
              if (apiRequestMatch) {
                apiCalls.push({
                  method: apiRequestMatch[1].toUpperCase(),
                  path: apiRequestMatch[2],
                  sourceFile: fullPath,
                  line: i + 1,
                });
              }
            }
          } catch (e) {
            // Ignore read errors
          }
        }
      }
    };
    
    scanDir(clientDir);
    return apiCalls;
  }

  private pathsMatch(routePath: string, callPath: string): boolean {
    // Convert route pattern to regex
    const pattern = routePath.replace(/:\w+/g, '[^/]+').replace(/\*/g, '.*');
    const regex = new RegExp(`^${pattern}$`);
    return regex.test(callPath);
  }

  /**
   * Register HandlerOps actions with AI Brain
   */
  registerActions(): void {
    const self = this;
    const actions = [
      { id: 'handlers.scan_routes', name: 'Scan Routes', desc: 'Scan for all API route handlers', 
        fn: async (p: any) => { const c = await self.scanRouteHandlers(); if (p?.persist !== false) await persistComponents(c, 'HandlerOps'); return c; } },
      { id: 'handlers.detect_missing', name: 'Detect Missing', desc: 'Detect frontend API calls without backend handlers', 
        fn: async (p: any) => { const f = await self.detectMissingHandlers(); if (p?.persist !== false && f.length > 0) await persistGapFindings(f, 'HandlerOps'); return f; } },
    ];

    for (const action of actions) {
      helpaiOrchestrator.registerAction({
        actionId: action.id,
        name: action.name,
        category: 'handler_ops',
        description: action.desc,
        requiredRoles: ['support_agent', 'support_manager', 'sysop', 'deputy_admin', 'root_admin'],
        handler: async (request) => {
          const startTime = Date.now();
          const result = await action.fn(request.payload || {});
          return { success: true, actionId: request.actionId, message: `${action.name} completed`, data: result, executionTimeMs: Date.now() - startTime };
        },
      });
    }

    log.info('[HandlerOps] Registered 2 AI Brain actions');
  }
}

// ============================================================================
// HOOK OPS SUBAGENT
// ============================================================================

class HookOpsSubagent {
  private static instance: HookOpsSubagent;

  static getInstance(): HookOpsSubagent {
    if (!this.instance) {
      this.instance = new HookOpsSubagent();
    }
    return this.instance;
  }

  /**
   * Scan for all custom hooks
   */
  async scanHooks(): Promise<ComponentAnalysis[]> {
    log.info('[HookOps] Scanning for React hooks...');
    
    const components: ComponentAnalysis[] = [];
    const hooksDir = 'client/src/hooks';
    
    try {
      if (!fs.existsSync(hooksDir)) {
        log.warn('[HookOps] Hooks directory not found');
        return [];
      }
      
      const files = fs.readdirSync(hooksDir);
      
      for (const file of files) {
        if (file.endsWith('.ts') || file.endsWith('.tsx')) {
          const filePath = path.join(hooksDir, file);
          const content = fs.readFileSync(filePath, 'utf-8');
          
          // Extract hook exports
          const hookRegex = /export\s+(?:const|function)\s+(use\w+)/g;
          let match;
          
          while ((match = hookRegex.exec(content)) !== null) {
            const hookName = match[1];
            
            // Find dependencies
            const deps = this.extractDependencies(content);
            
            components.push({
              filePath,
              componentName: hookName,
              domain: 'frontend_hook',
              exports: [hookName],
              dependencies: deps,
              description: `React hook: ${hookName}`,
            });
          }
        }
      }

      log.info(`[HookOps] Found ${components.length} hooks`);
      return components;
    } catch (error) {
      log.error('[HookOps] Error scanning hooks:', error);
      return [];
    }
  }

  /**
   * Detect common hook issues
   */
  async detectHookIssues(): Promise<GapFinding[]> {
    log.info('[HookOps] Detecting hook issues...');
    
    const findings: GapFinding[] = [];
    const clientDir = 'client/src';
    
    try {
      const scanFile = (filePath: string) => {
        if (!filePath.endsWith('.tsx') && !filePath.endsWith('.ts')) return;
        
        const content = fs.readFileSync(filePath, 'utf-8');
        const lines = content.split('\n');
        
        for (let i = 0; i < lines.length; i++) {
          const line = lines[i];
          
          // Check for hooks inside conditions
          if (/if\s*\(.*\)\s*\{/.test(lines.slice(Math.max(0, i - 5), i).join('\n'))) {
            if (/\buse[A-Z]\w+\s*\(/.test(line) && !line.includes('//')) {
              findings.push({
                filePath,
                lineNumber: i + 1,
                gapType: 'code_quality',
                severity: 'error',
                title: 'Hook inside conditional',
                description: 'React hooks should not be called conditionally',
                suggestedFix: 'Move hook call to top level of component',
                detectionMethod: 'hook_rules_analysis',
                confidence: 0.7,
              });
            }
          }
          
          // Check for missing dependencies in useEffect
          if (/useEffect\s*\(\s*\(\)\s*=>\s*\{/.test(line)) {
            // Look for closing of useEffect
            let bracketCount = 0;
            let foundDeps = false;
            
            for (let j = i; j < Math.min(i + 50, lines.length); j++) {
              bracketCount += (lines[j].match(/\{/g) || []).length;
              bracketCount -= (lines[j].match(/\}/g) || []).length;
              
              if (bracketCount === 0 && lines[j].includes(']')) {
                foundDeps = true;
                break;
              }
            }
            
            if (!foundDeps) {
              findings.push({
                filePath,
                lineNumber: i + 1,
                gapType: 'code_quality',
                severity: 'warning',
                title: 'useEffect missing dependency array',
                description: 'useEffect should have a dependency array to prevent infinite loops',
                suggestedFix: 'Add dependency array as second argument to useEffect',
                detectionMethod: 'hook_rules_analysis',
                confidence: 0.6,
              });
            }
          }
        }
      };
      
      const walkDir = (dir: string) => {
        if (!fs.existsSync(dir)) return;
        
        const entries = fs.readdirSync(dir, { withFileTypes: true });
        for (const entry of entries) {
          const fullPath = path.join(dir, entry.name);
          if (entry.isDirectory() && !entry.name.startsWith('.')) {
            walkDir(fullPath);
          } else if (entry.isFile()) {
            try {
              scanFile(fullPath);
            } catch (e) {
              // Ignore scan errors
            }
          }
        }
      };
      
      walkDir(clientDir);
      
      log.info(`[HookOps] Found ${findings.length} hook issues`);
      return findings;
    } catch (error) {
      log.error('[HookOps] Error detecting hook issues:', error);
      return [];
    }
  }

  private extractDependencies(content: string): string[] {
    const deps: string[] = [];
    const importRegex = /import\s+.*?\s+from\s+['"]([^'"]+)['"]/g;
    let match;
    
    while ((match = importRegex.exec(content)) !== null) {
      deps.push(match[1]);
    }
    
    return deps;
  }

  /**
   * Register HookOps actions with AI Brain
   */
  registerActions(): void {
    const self = this;
    const actions = [
      { id: 'hooks.scan', name: 'Scan Hooks', desc: 'Scan for all React hooks in the codebase', 
        fn: async (p: any) => { const c = await self.scanHooks(); if (p?.persist !== false) await persistComponents(c, 'HookOps'); return c; } },
      { id: 'hooks.detect_issues', name: 'Detect Hook Issues', desc: 'Detect common React hook issues', 
        fn: async (p: any) => { const f = await self.detectHookIssues(); if (p?.persist !== false && f.length > 0) await persistGapFindings(f, 'HookOps'); return f; } },
    ];

    for (const action of actions) {
      helpaiOrchestrator.registerAction({
        actionId: action.id,
        name: action.name,
        category: 'hook_ops',
        description: action.desc,
        requiredRoles: ['support_agent', 'support_manager', 'sysop', 'deputy_admin', 'root_admin'],
        handler: async (request) => {
          const startTime = Date.now();
          const result = await action.fn(request.payload || {});
          return { success: true, actionId: request.actionId, message: `${action.name} completed`, data: result, executionTimeMs: Date.now() - startTime };
        },
      });
    }

    log.info('[HookOps] Registered 2 AI Brain actions');
  }
}

// ============================================================================
// EXPORTS & INITIALIZATION
// ============================================================================

export const schemaOpsSubagent = SchemaOpsSubagent.getInstance();
export const logOpsSubagent = LogOpsSubagent.getInstance();
export const handlerOpsSubagent = HandlerOpsSubagent.getInstance();
export const hookOpsSubagent = HookOpsSubagent.getInstance();

/**
 * Initialize all domain ops subagents
 */
export async function initializeDomainOpsSubagents(): Promise<void> {
  log.info('[DomainOps] Initializing domain operations subagents...');
  
  schemaOpsSubagent.registerActions();
  logOpsSubagent.registerActions();
  handlerOpsSubagent.registerActions();
  hookOpsSubagent.registerActions();
  
  log.info('[DomainOps] All domain ops subagents initialized');
}

export {
  SchemaOpsSubagent,
  LogOpsSubagent,
  HandlerOpsSubagent,
  HookOpsSubagent,
  GapFinding,
  ComponentAnalysis,
  persistGapFinding,
  persistGapFindings,
  persistComponent,
  persistComponents,
};
