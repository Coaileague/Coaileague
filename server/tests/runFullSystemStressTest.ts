import { runFullSystemStressTest } from './fullSystemStressTest';

(async () => {
  try {
    const results = await runFullSystemStressTest();
    const failed = results.filter(r => !r.passed).length;
    process.exit(failed > 0 ? 1 : 0);
  } catch (e: any) {
    console.error('Test runner crashed:', e.message);
    process.exit(1);
  }
})();
