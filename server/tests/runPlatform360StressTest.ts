import { runPlatform360StressTest } from './platform360StressTest';

async function main() {
  try {
    const result = await runPlatform360StressTest();
    process.exit(result.criticalFails > 0 ? 1 : 0);
  } catch (error) {
    console.error('Platform 360 stress test failed:', error);
    process.exit(1);
  }
}

main();
