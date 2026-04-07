/**
 * Run Staffing Pipeline Stress Test (T009)
 */
import { runStaffingPipelineStressTest } from './staffingPipelineStressTest';

runStaffingPipelineStressTest()
  .then(({ passed, failed, total }) => {
    console.log(`\nFinal: ${passed}/${total} passed (${failed} failed)`);
    process.exit(failed > 0 ? 1 : 0);
  })
  .catch(err => {
    console.error('Staffing pipeline stress test crashed:', err);
    process.exit(1);
  });
