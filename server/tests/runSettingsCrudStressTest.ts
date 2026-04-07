import { runSettingsCrudStressTest } from './settingsCrudStressTest';

runSettingsCrudStressTest()
  .then(({ passed, failed }) => {
    process.exit(failed > 0 ? 1 : 0);
  })
  .catch((err) => {
    console.error('Test runner error:', err);
    process.exit(1);
  });
