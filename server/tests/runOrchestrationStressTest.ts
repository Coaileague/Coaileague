import { runOrchestrationStressTest } from './orchestrationStressTest';

runOrchestrationStressTest()
  .then(r => {
    console.log(`\nFinal: ${r.passed}/${r.total} passed (${r.failed} failed)`);
    process.exit(r.failed > 0 ? 1 : 0);
  })
  .catch(err => {
    console.error('Test runner error:', err);
    process.exit(1);
  });
