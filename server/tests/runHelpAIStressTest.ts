/**
 * Run HelpAI Stress Test
 */
import { runHelpAIStressTest } from './helpAIStressTest';

runHelpAIStressTest()
  .then(({ passed, failed, total }) => {
    console.log(`\nFinal: ${passed}/${total} passed (${failed} failed)`);
    process.exit(failed > 0 ? 1 : 0);
  })
  .catch(err => {
    console.error('HelpAI stress test crashed:', err);
    process.exit(1);
  });
