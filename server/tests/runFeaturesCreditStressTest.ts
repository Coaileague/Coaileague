import { runFeaturesCreditStressTest } from './featuresCreditStressTest';

async function main() {
  try {
    const result = await runFeaturesCreditStressTest();
    process.exit(result.criticalFails > 0 ? 1 : 0);
  } catch (error) {
    console.error('Features/Credit stress test failed:', error);
    process.exit(1);
  }
}

main();
