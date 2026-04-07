import { runEndToEndBillingStressTest } from './endToEndBillingStressTest';

async function main() {
  try {
    const { passed, failed, criticalFails } = await runEndToEndBillingStressTest();
    process.exit(failed > 0 ? 1 : 0);
  } catch (error) {
    console.error('Test runner failed:', error);
    process.exit(1);
  }
}

main();
