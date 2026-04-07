import { runStressTests } from './stressTest';

(async () => {
  try {
    const results = await runStressTests();
    process.exit(results.some(r => !r.passed && r.severity === 'critical') ? 1 : 0);
  } catch (error) {
    console.error('Stress test runner failed:', error);
    process.exit(1);
  }
})();
