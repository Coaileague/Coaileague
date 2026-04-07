import { runFinalBillingStressTest } from './finalBillingStressTest';

async function main() {
  try {
    const result = await runFinalBillingStressTest();
    process.exit(result.criticalFails > 0 ? 1 : 0);
  } catch (error) {
    console.error('Final billing stress test failed:', error);
    process.exit(1);
  }
}

main();
