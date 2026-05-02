/**
 * Quick test script to manually trigger invoice generation
 * Run with: tsx test-invoice.ts
 */

import { manualTriggers } from './server/services/autonomousScheduler';

async function main() {
  console.log('🧪 Testing invoice generation...\n');
  
  try {
    const result = await manualTriggers.invoicing();
    console.log('\n✅ Invoice generation completed!');
    console.log('Result:', JSON.stringify(result, null, 2));
  } catch (error : unknown) {
    console.error('\n❌ Invoice generation failed:', error instanceof Error ? error.message : String(error));
    console.error(error instanceof Error ? error.stack : null);
  }
  
  process.exit(0);
}

main();
