import { runCommunicationStressTests } from './communicationStressTest';

(async () => {
  try {
    await runCommunicationStressTests();
    process.exit(0);
  } catch (error) {
    console.error('Test runner failed:', error);
    process.exit(1);
  }
})();
