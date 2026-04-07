import { runCrossPlatformSyncStressTest } from './crossPlatformSyncStressTest';

async function main() {
  try {
    const result = await runCrossPlatformSyncStressTest();
    process.exit(result.criticalFails > 0 ? 1 : 0);
  } catch (error) {
    console.error('Cross-platform sync stress test failed:', error);
    process.exit(1);
  }
}

main();
