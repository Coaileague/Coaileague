/**
 * Standalone simulation runner — bypasses HTTP/CSRF layer.
 * Run with: npx tsx scripts/runBotSimulation.ts
 */

import { runShiftBotSimulation } from '../server/services/bots/shiftBotSimulationRunner';

async function main() {
  console.log('\n========================================');
  console.log('  SHIFT ROOM BOT SIMULATION — T008');
  console.log('  Target: Acme Security Services');
  console.log('========================================\n');

  const result = await runShiftBotSimulation();

  console.log(`\nRESULTS: ${result.passed}/${result.total} passed (${result.failed} failed)`);
  if (result.conversationId) {
    console.log(`Conversation ID: ${result.conversationId}`);
  }
  console.log('');

  for (const r of result.results) {
    const icon = r.passed ? '✓' : '✗';
    console.log(`${icon} ${r.scenario}`);
    console.log(`  ${r.details}`);
  }

  console.log('\n========================================');
  const pct = Math.round((result.passed / result.total) * 100);
  console.log(`  PASS RATE: ${pct}%  (${result.passed}/${result.total})`);
  console.log('========================================\n');

  process.exit(result.failed > 0 ? 1 : 0);
}

main().catch(err => {
  console.error('Simulation fatal error:', err);
  process.exit(1);
});
