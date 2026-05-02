import { runFullSystemStressTest } from './fullSystemStressTest';

(async () => {
  try {
    const results = await runFullSystemStressTest();
    const failed = results.filter(r => !r.passed).length;
    process.exit(failed > 0 ? 1 : 0);
  } catch (e: unknown) {
    console.error('Test runner crashed:', e instanceof Error ? e.message : String(e));
    process.exit(1);
  }
})();
