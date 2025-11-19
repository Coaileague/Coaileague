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
  } catch (error: any) {
    console.error('\n❌ Invoice generation failed:', error.message);
    console.error(error.stack);
  }
  
  process.exit(0);
}

main();
