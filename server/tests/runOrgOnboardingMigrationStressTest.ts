/**
 * Run Org Onboarding + Migration Stress Test
 */
import { runOrgOnboardingMigrationStressTest } from './orgOnboardingMigrationStressTest';

runOrgOnboardingMigrationStressTest()
  .then(({ passed, failed, total }) => {
    console.log(`\nFinal: ${passed}/${total} passed (${failed} failed)`);
    process.exit(failed > 0 ? 1 : 0);
  })
  .catch(err => {
    console.error('Org onboarding stress test crashed:', err);
    process.exit(1);
  });
