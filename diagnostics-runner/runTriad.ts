#!/usr/bin/env npx tsx
/**
 * TRINITY DEBUG TRIAD - CLI Runner
 * =================================
 * Run the 3-crawler parallel diagnostics system.
 * 
 * Usage:
 *   npx tsx diagnostics-runner/runTriad.ts                    # Full triad scan
 *   npx tsx diagnostics-runner/runTriad.ts --mode=ui-only     # UI crawler only
 *   npx tsx diagnostics-runner/runTriad.ts --mode=api-only    # API crawler only
 *   npx tsx diagnostics-runner/runTriad.ts --mode=integration-only  # Integration only
 *   npx tsx diagnostics-runner/runTriad.ts --sequential       # Run one at a time
 *   npx tsx diagnostics-runner/runTriad.ts --url=https://example.com  # Custom URL
 */

import { runTriad } from './triadOrchestrator';
import { TriadOrchestratorConfig } from './config/triadTypes';

async function main() {
  const args = process.argv.slice(2);
  
  const getArg = (name: string): string | undefined => {
    const arg = args.find(a => a.startsWith(`--${name}=`));
    return arg ? arg.split('=')[1] : undefined;
  };
  
  const hasFlag = (name: string): boolean => {
    return args.includes(`--${name}`);
  };
  
  const mode = getArg('mode') as TriadOrchestratorConfig['mode'] || 'full-triad';
  // Always use localhost for dev testing - crawlers run in same environment
  const defaultUrl = 'http://localhost:5000';
  const baseUrl = getArg('url') || process.env.DIAGNOSTICS_BASE_URL || defaultUrl;
  const parallel = !hasFlag('sequential');
  const maxPages = parseInt(getArg('max-pages') || '50', 10);
  const noAI = hasFlag('no-ai');
  
  const bypassSecret = process.env.DIAG_BYPASS_SECRET;
  const testUsername = process.env.TEST_USERNAME;
  const testPassword = process.env.TEST_PASSWORD;
  
  console.log('');
  console.log('🔱 TRINITY DEBUG TRIAD');
  console.log('======================');
  console.log(`Target URL: ${baseUrl}`);
  console.log(`Mode: ${mode}`);
  console.log(`Parallel: ${parallel}`);
  console.log(`Max Pages: ${maxPages}`);
  console.log(`AI Analysis: ${!noAI}`);
  console.log(`Bypass Secret: ${bypassSecret ? 'SET ✓' : 'NOT SET ✗'}`);
  console.log(`Test Credentials: ${testUsername ? 'SET ✓' : 'NOT SET'}`);
  console.log('');
  
  const config: Partial<TriadOrchestratorConfig> = {
    baseUrl,
    mode,
    parallel,
    maxPagesPerCrawler: maxPages,
    enableAIAnalysis: !noAI,
    credentials: bypassSecret ? {
      username: testUsername || '',
      password: testPassword || '',
      bypassSecret
    } : undefined
  };
  
  try {
    const report = await runTriad(config);
    
    console.log('');
    console.log('📊 TRINITY TRIAD SCAN COMPLETE');
    console.log('==============================');
    console.log(`Readiness Score: ${report.summary.readinessScore}%`);
    console.log(`Launch Status: ${report.trinityInsights.launchReadiness.toUpperCase()}`);
    console.log(`Total Issues: ${report.summary.totalIssuesFound}`);
    console.log(`  - Critical: ${report.summary.criticalCount}`);
    console.log(`  - High: ${report.summary.highCount}`);
    console.log(`  - Medium: ${report.summary.mediumCount}`);
    console.log(`  - Low: ${report.summary.lowCount}`);
    console.log('');
    console.log(`Report saved to: ${report.reportPath}`);
    console.log(`HTML Report: ${report.reportPath.replace('.json', '.html')}`);
    
    if (report.summary.criticalCount > 0) {
      console.log('');
      console.log('⚠️  CRITICAL BLOCKERS FOUND:');
      report.summary.blockers.forEach((b, i) => {
        console.log(`   ${i + 1}. ${b}`);
      });
    }
    
    process.exit(report.summary.criticalCount > 0 ? 1 : 0);
    
  } catch (error: any) {
    console.error('');
    console.error('❌ TRINITY TRIAD FAILED');
    console.error('=======================');
    console.error(error.message);
    console.error(error.stack);
    process.exit(1);
  }
}

main();
