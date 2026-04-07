import { runWeeklySimulation } from './weeklySimulation';

async function main() {
  try {
    const report = await runWeeklySimulation();
    console.log('\n\nJSON REPORT:');
    console.log(JSON.stringify(report, null, 2));
    process.exit(0);
  } catch (error) {
    console.error('Simulation failed:', error);
    process.exit(1);
  }
}

main();
