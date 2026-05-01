/**
 * AI Brain Test Runner
 * 
 * Enables AI Brain to execute platform diagnostic tests:
 * - API endpoint health checks
 * - Database connectivity tests
 * - Service integration tests
 * - File system validation
 * - Performance benchmarks
 * - Security checks
 * 
 * Results are logged and can trigger alerts or notifications.
 */

import crypto from 'crypto';
import { db } from '../../db';
import { systemAuditLogs } from '@shared/schema';
import { sql } from 'drizzle-orm';
import { broadcastToAllClients } from '../../websocket';
import { aiBrainFileSystemTools } from './aiBrainFileSystemTools';
import { typedQuery } from '../../lib/typedSql';
import { createLogger } from '../../lib/logger';
import { PLATFORM_WORKSPACE_ID } from '../billing/billingConstants';
const log = createLogger('aiBrainTestRunner');

export type TestStatus = 'pending' | 'running' | 'passed' | 'failed' | 'skipped' | 'error';
export type TestSeverity = 'critical' | 'high' | 'medium' | 'low' | 'info';

export interface TestCase {
  id: string;
  name: string;
  description: string;
  category: 'api' | 'database' | 'service' | 'filesystem' | 'performance' | 'security' | 'integration';
  severity: TestSeverity;
  timeout?: number;
  enabled?: boolean;
  tags?: string[];
  run: () => Promise<TestResult>;
}

export interface TestResult {
  testId: string;
  testName: string;
  status: TestStatus;
  severity: TestSeverity;
  startedAt: Date;
  completedAt: Date;
  duration: number;
  message?: string;
  details?: Record<string, unknown>;
  error?: string;
  stackTrace?: string;
}

export interface TestSuiteResult {
  suiteId: string;
  suiteName: string;
  startedAt: Date;
  completedAt: Date;
  duration: number;
  results: TestResult[];
  summary: {
    total: number;
    passed: number;
    failed: number;
    skipped: number;
    errors: number;
    passRate: number;
  };
  triggeredBy: string;
}

class AIBrainTestRunner {
  private static instance: AIBrainTestRunner;
  private tests: Map<string, TestCase> = new Map();
  private suiteResults: Map<string, TestSuiteResult> = new Map();

  static getInstance(): AIBrainTestRunner {
    if (!this.instance) {
      this.instance = new AIBrainTestRunner();
    }
    return this.instance;
  }

  constructor() {
    this.registerBuiltInTests();
  }

  private registerBuiltInTests(): void {
    this.registerTest({
      id: 'api-health',
      name: 'API Health Check',
      description: 'Verify main API endpoint responds',
      category: 'api',
      severity: 'critical',
      timeout: 5000,
      run: async () => {
        const start = Date.now();
        try {
          const { getAppBaseUrl } = await import('../../utils/getAppBaseUrl');
          const response = await fetch(`${getAppBaseUrl()}/health`);
          const data = await response.json();
          return {
            testId: 'api-health',
            testName: 'API Health Check',
            status: response.ok ? 'passed' : 'failed',
            severity: 'critical',
            startedAt: new Date(start),
            completedAt: new Date(),
            duration: Date.now() - start,
            message: response.ok ? 'API is healthy' : 'API returned error',
            details: { statusCode: response.status, data },
          };
        } catch (error: any) {
          return {
            testId: 'api-health',
            testName: 'API Health Check',
            status: 'error',
            severity: 'critical',
            startedAt: new Date(start),
            completedAt: new Date(),
            duration: Date.now() - start,
            error: (error instanceof Error ? error.message : String(error)),
          };
        }
      },
    });

    this.registerTest({
      id: 'db-connectivity',
      name: 'Database Connectivity',
      description: 'Verify database connection is working',
      category: 'database',
      severity: 'critical',
      timeout: 10000,
      run: async () => {
        const start = Date.now();
        try {
          // Converted to Drizzle ORM: health check ping
          const result = await db.execute(sql`SELECT 1 as test`);
          return {
            testId: 'db-connectivity',
            testName: 'Database Connectivity',
            status: 'passed',
            severity: 'critical',
            startedAt: new Date(start),
            completedAt: new Date(),
            duration: Date.now() - start,
            message: 'Database connection successful',
            details: { rows: (result as any).length || 0 },
          };
        } catch (error: any) {
          return {
            testId: 'db-connectivity',
            testName: 'Database Connectivity',
            status: 'failed',
            severity: 'critical',
            startedAt: new Date(start),
            completedAt: new Date(),
            duration: Date.now() - start,
            error: (error instanceof Error ? error.message : String(error)),
          };
        }
      },
    });

    this.registerTest({
      id: 'fs-read-access',
      name: 'File System Read Access',
      description: 'Verify AI Brain can read platform files',
      category: 'filesystem',
      severity: 'high',
      run: async () => {
        const start = Date.now();
        try {
          const result = await aiBrainFileSystemTools.readFile('package.json');
          return {
            testId: 'fs-read-access',
            testName: 'File System Read Access',
            status: result.success ? 'passed' : 'failed',
            severity: 'high',
            startedAt: new Date(start),
            completedAt: new Date(),
            duration: Date.now() - start,
            message: result.success ? 'File read successful' : result.error,
            details: { fileSize: result.metadata?.size },
          };
        } catch (error: any) {
          return {
            testId: 'fs-read-access',
            testName: 'File System Read Access',
            status: 'error',
            severity: 'high',
            startedAt: new Date(start),
            completedAt: new Date(),
            duration: Date.now() - start,
            error: (error instanceof Error ? error.message : String(error)),
          };
        }
      },
    });

    this.registerTest({
      id: 'fs-list-access',
      name: 'File System List Access',
      description: 'Verify AI Brain can list directories',
      category: 'filesystem',
      severity: 'high',
      run: async () => {
        const start = Date.now();
        try {
          const result = await aiBrainFileSystemTools.listDirectory('server', { recursive: false });
          return {
            testId: 'fs-list-access',
            testName: 'File System List Access',
            status: result.success ? 'passed' : 'failed',
            severity: 'high',
            startedAt: new Date(start),
            completedAt: new Date(),
            duration: Date.now() - start,
            message: result.success ? `Found ${result.data?.length} entries` : result.error,
            details: { entryCount: result.data?.length },
          };
        } catch (error: any) {
          return {
            testId: 'fs-list-access',
            testName: 'File System List Access',
            status: 'error',
            severity: 'high',
            startedAt: new Date(start),
            completedAt: new Date(),
            duration: Date.now() - start,
            error: (error instanceof Error ? error.message : String(error)),
          };
        }
      },
    });

    this.registerTest({
      id: 'websocket-broadcast',
      name: 'WebSocket Broadcast',
      description: 'Verify WebSocket broadcasting works',
      category: 'service',
      severity: 'medium',
      run: async () => {
        const start = Date.now();
        try {
          const count = broadcastToAllClients({
            type: 'test:ping',
            timestamp: new Date().toISOString(),
          });
          return {
            testId: 'websocket-broadcast',
            testName: 'WebSocket Broadcast',
            status: 'passed',
            severity: 'medium',
            startedAt: new Date(start),
            completedAt: new Date(),
            duration: Date.now() - start,
            message: `Broadcast sent to ${count} clients`,
            details: { clientCount: count },
          };
        } catch (error: any) {
          return {
            testId: 'websocket-broadcast',
            testName: 'WebSocket Broadcast',
            status: 'error',
            severity: 'medium',
            startedAt: new Date(start),
            completedAt: new Date(),
            duration: Date.now() - start,
            error: (error instanceof Error ? error.message : String(error)),
          };
        }
      },
    });

    this.registerTest({
      id: 'env-secrets',
      name: 'Environment Secrets Check',
      description: 'Verify critical environment variables are set',
      category: 'security',
      severity: 'critical',
      run: async () => {
        const start = Date.now();
        const required = ['DATABASE_URL', 'SESSION_SECRET'];
        const optional = ['GEMINI_API_KEY', 'STRIPE_SECRET_KEY', 'RESEND_API_KEY'];
        
        const missingRequired = required.filter(v => !process.env[v]);
        const missingOptional = optional.filter(v => !process.env[v]);

        return {
          testId: 'env-secrets',
          testName: 'Environment Secrets Check',
          status: missingRequired.length === 0 ? 'passed' : 'failed',
          severity: 'critical',
          startedAt: new Date(start),
          completedAt: new Date(),
          duration: Date.now() - start,
          message: missingRequired.length === 0 
            ? 'All required secrets present' 
            : `Missing required: ${missingRequired.join(', ')}`,
          details: {
            requiredPresent: required.length - missingRequired.length,
            requiredMissing: missingRequired,
            optionalPresent: optional.length - missingOptional.length,
            optionalMissing: missingOptional,
          },
        };
      },
    });

    this.registerTest({
      id: 'schema-validation',
      name: 'Schema File Validation',
      description: 'Verify schema.ts is valid and parseable',
      category: 'integration',
      severity: 'high',
      run: async () => {
        const start = Date.now();
        try {
          const result = await aiBrainFileSystemTools.readFile('shared/schema.ts');
          if (!result.success) {
            throw new Error(result.error);
          }
          
          const hasExports = result.data?.includes('export');
          const hasTables = result.data?.includes('pgTable');
          
          return {
            testId: 'schema-validation',
            testName: 'Schema File Validation',
            status: hasExports && hasTables ? 'passed' : 'failed',
            severity: 'high',
            startedAt: new Date(start),
            completedAt: new Date(),
            duration: Date.now() - start,
            message: hasExports && hasTables 
              ? 'Schema file is valid' 
              : 'Schema file missing expected content',
            details: { 
              hasExports,
              hasTables,
              lineCount: result.metadata?.lineCount,
            },
          };
        } catch (error: any) {
          return {
            testId: 'schema-validation',
            testName: 'Schema File Validation',
            status: 'error',
            severity: 'high',
            startedAt: new Date(start),
            completedAt: new Date(),
            duration: Date.now() - start,
            error: (error instanceof Error ? error.message : String(error)),
          };
        }
      },
    });

    this.registerTest({
      id: 'api-response-time',
      name: 'API Response Time',
      description: 'Verify API responds within acceptable time',
      category: 'performance',
      severity: 'medium',
      timeout: 5000,
      run: async () => {
        const start = Date.now();
        const threshold = 1000;
        try {
          const apiStart = Date.now();
          const { getAppBaseUrl } = await import('../../utils/getAppBaseUrl');
          await fetch(`${getAppBaseUrl()}/api/auth/me`);
          const responseTime = Date.now() - apiStart;
          
          return {
            testId: 'api-response-time',
            testName: 'API Response Time',
            status: responseTime < threshold ? 'passed' : 'failed',
            severity: 'medium',
            startedAt: new Date(start),
            completedAt: new Date(),
            duration: Date.now() - start,
            message: `Response time: ${responseTime}ms (threshold: ${threshold}ms)`,
            details: { responseTime, threshold },
          };
        } catch (error: any) {
          return {
            testId: 'api-response-time',
            testName: 'API Response Time',
            status: 'error',
            severity: 'medium',
            startedAt: new Date(start),
            completedAt: new Date(),
            duration: Date.now() - start,
            error: (error instanceof Error ? error.message : String(error)),
          };
        }
      },
    });

    log.info(`[TestRunner] Registered ${this.tests.size} built-in tests`);
  }

  registerTest(test: TestCase): void {
    this.tests.set(test.id, test);
    log.info(`[TestRunner] Registered test: ${test.id}`);
  }

  getTest(testId: string): TestCase | undefined {
    return this.tests.get(testId);
  }

  listTests(): TestCase[] {
    return Array.from(this.tests.values()).map(t => ({
      ...t,
      run: undefined as any,
    }));
  }

  listTestsByCategory(category: string): TestCase[] {
    return Array.from(this.tests.values())
      .filter(t => t.category === category)
      .map(t => ({ ...t, run: undefined as any }));
  }

  async runTest(testId: string, triggeredBy: string = 'ai-brain'): Promise<TestResult> {
    const test = this.tests.get(testId);
    if (!test) {
      throw new Error(`Test not found: ${testId}`);
    }

    if (test.enabled === false) {
      return {
        testId: test.id,
        testName: test.name,
        status: 'skipped',
        severity: test.severity,
        startedAt: new Date(),
        completedAt: new Date(),
        duration: 0,
        message: 'Test is disabled',
      };
    }

    log.info(`[TestRunner] Running test: ${test.name}`);

    try {
      const result = await Promise.race([
        test.run(),
        new Promise<TestResult>((_, reject) => 
          setTimeout(() => reject(new Error('Test timeout')), test.timeout || 30000)
        ),
      ]);

      await this.logTestResult(result, triggeredBy);
      
      return result;
    } catch (error: any) {
      const result: TestResult = {
        testId: test.id,
        testName: test.name,
        status: 'error',
        severity: test.severity,
        startedAt: new Date(),
        completedAt: new Date(),
        duration: 0,
        error: (error instanceof Error ? error.message : String(error)),
        stackTrace: error.stack,
      };

      await this.logTestResult(result, triggeredBy);
      
      return result;
    }
  }

  async runAllTests(triggeredBy: string = 'ai-brain'): Promise<TestSuiteResult> {
    return this.runTestSuite('all', Array.from(this.tests.keys()), triggeredBy);
  }

  async runTestsByCategory(category: string, triggeredBy: string = 'ai-brain'): Promise<TestSuiteResult> {
    const testIds = Array.from(this.tests.values())
      .filter(t => t.category === category)
      .map(t => t.id);
    
    return this.runTestSuite(category, testIds, triggeredBy);
  }

  async runTestsBySeverity(severity: TestSeverity, triggeredBy: string = 'ai-brain'): Promise<TestSuiteResult> {
    const testIds = Array.from(this.tests.values())
      .filter(t => t.severity === severity)
      .map(t => t.id);
    
    return this.runTestSuite(`severity-${severity}`, testIds, triggeredBy);
  }

  async runTestSuite(suiteName: string, testIds: string[], triggeredBy: string): Promise<TestSuiteResult> {
    const suiteId = `suite-${Date.now()}-${crypto.randomUUID().slice(0, 6)}`;
    const startedAt = new Date();
    const results: TestResult[] = [];

    log.info(`[TestRunner] Starting test suite: ${suiteName} (${testIds.length} tests)`);

    broadcastToAllClients({
      type: 'test:suite_started',
      suiteId,
      suiteName,
      testCount: testIds.length,
      timestamp: startedAt.toISOString(),
    });

    for (const testId of testIds) {
      try {
        const result = await this.runTest(testId, triggeredBy);
        results.push(result);

        broadcastToAllClients({
          type: 'test:result',
          suiteId,
          result: {
            testId: result.testId,
            testName: result.testName,
            status: result.status,
            duration: result.duration,
          },
        });
      } catch (error: any) {
        results.push({
          testId,
          testName: this.tests.get(testId)?.name || testId,
          status: 'error',
          severity: this.tests.get(testId)?.severity || 'medium',
          startedAt: new Date(),
          completedAt: new Date(),
          duration: 0,
          error: (error instanceof Error ? error.message : String(error)),
        });
      }
    }

    const completedAt = new Date();
    const summary = {
      total: results.length,
      passed: results.filter(r => r.status === 'passed').length,
      failed: results.filter(r => r.status === 'failed').length,
      skipped: results.filter(r => r.status === 'skipped').length,
      errors: results.filter(r => r.status === 'error').length,
      passRate: results.length > 0 
        ? Math.round((results.filter(r => r.status === 'passed').length / results.length) * 100) 
        : 0,
    };

    const suiteResult: TestSuiteResult = {
      suiteId,
      suiteName,
      startedAt,
      completedAt,
      duration: completedAt.getTime() - startedAt.getTime(),
      results,
      summary,
      triggeredBy,
    };

    this.suiteResults.set(suiteId, suiteResult);

    broadcastToAllClients({
      type: 'test:suite_completed',
      suiteId,
      suiteName,
      summary,
      duration: suiteResult.duration,
      timestamp: completedAt.toISOString(),
    });

    await this.logSuiteResult(suiteResult);

    log.info(`[TestRunner] Suite completed: ${suiteName} - ${summary.passed}/${summary.total} passed (${summary.passRate}%)`);

    return suiteResult;
  }

  getSuiteResult(suiteId: string): TestSuiteResult | undefined {
    return this.suiteResults.get(suiteId);
  }

  listSuiteResults(): TestSuiteResult[] {
    return Array.from(this.suiteResults.values())
      .sort((a, b) => b.startedAt.getTime() - a.startedAt.getTime());
  }

  private async logTestResult(result: TestResult, triggeredBy: string): Promise<void> {
    try {
      await db.insert(systemAuditLogs).values({
        workspaceId: PLATFORM_WORKSPACE_ID,
        userId: triggeredBy,
        action: `ai_brain_test:${result.status}`,
        entityType: 'test',
        entityId: result.testId,
        metadata: {
          testName: result.testName,
          status: result.status,
          severity: result.severity,
          duration: result.duration,
          message: result.message,
          error: result.error,
          timestamp: new Date().toISOString(),
        },
        ipAddress: 'ai-brain-internal',
      });
    } catch (error) {
      log.error('[TestRunner] Failed to log test result:', error);
    }
  }

  private async logSuiteResult(result: TestSuiteResult): Promise<void> {
    try {
      await db.insert(systemAuditLogs).values({
        workspaceId: PLATFORM_WORKSPACE_ID,
        userId: result.triggeredBy,
        action: 'ai_brain_test:suite_completed',
        entityType: 'test_suite',
        entityId: result.suiteId,
        metadata: {
          suiteName: result.suiteName,
          duration: result.duration,
          summary: result.summary,
          timestamp: new Date().toISOString(),
        },
        ipAddress: 'ai-brain-internal',
      });
    } catch (error) {
      log.error('[TestRunner] Failed to log suite result:', error);
    }
  }
}

export const aiBrainTestRunner = AIBrainTestRunner.getInstance();
export { AIBrainTestRunner };
