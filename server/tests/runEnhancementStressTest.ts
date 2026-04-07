import { runEnhancementStressTest } from './enhancementStressTest';

async function main() {
  try {
    const result = await runEnhancementStressTest();
    process.exit(result.criticalFails > 0 ? 1 : 0);
  } catch (error) {
    console.error('Enhancement stress test failed:', error);
    process.exit(1);
  }
}

main();
