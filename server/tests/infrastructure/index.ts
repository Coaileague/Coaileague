/**
 * Infrastructure Test Suite Index
 * 
 * Exports all infrastructure regression tests for use during startup
 * and scheduled health checks.
 */

export { runAuditSchemaRegressionTests, selfTest } from './auditSchemaRegression.test';

/**
 * Run all infrastructure regression tests
 */
export async function runAllInfrastructureTests(): Promise<{
  suiteName: string;
  totalPassed: number;
  totalFailed: number;
  suiteResults: Array<{
    suite: string;
    passed: number;
    failed: number;
  }>;
}> {
  const { runAuditSchemaRegressionTests } = await import('./auditSchemaRegression.test');
  
  console.log('[InfrastructureTests] Starting infrastructure regression test suite...');
  
  const auditResults = await runAuditSchemaRegressionTests();
  
  const totalPassed = auditResults.passed;
  const totalFailed = auditResults.failed;
  
  console.log(`[InfrastructureTests] All tests complete: ${totalPassed} passed, ${totalFailed} failed`);
  
  return {
    suiteName: 'Infrastructure Regression Tests',
    totalPassed,
    totalFailed,
    suiteResults: [
      {
        suite: 'Audit Schema Regression',
        passed: auditResults.passed,
        failed: auditResults.failed
      }
    ]
  };
}
