import { runGoLiveReadinessStressTest } from './goLiveReadinessStressTest';

async function main() {
  try {
    const { passed, failed, criticalFails } = await runGoLiveReadinessStressTest();
    process.exit(failed > 0 ? 1 : 0);
  } catch (error) {
    console.error('Test runner failed:', error);
    process.exit(1);
  }
}

main();
