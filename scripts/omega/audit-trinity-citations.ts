#!/usr/bin/env tsx
/**
 * OMEGA — TRINITY CITATION AUDIT
 * Reads trinity_decision_log for a workspace and reports the breakdown of Texas Occupations
 * Code § citations that appeared in `reasoning`. Used to verify the Texas Regulatory Gatekeeper
 * actually emits the right § when blocking / downgrading assignments.
 *
 * Run: tsx scripts/omega/audit-trinity-citations.ts --workspace=<id> [--days=30]
 *
 * Read-only. No writes. Safe to run against production.
 */

import { db } from '../../server/db';
import { sql } from 'drizzle-orm';

interface Args {
  workspaceId: string;
  days: number;
}

function parseArgs(): Args {
  const argv = process.argv.slice(2);
  const get = (k: string) => argv.find(a => a.startsWith(`--${k}=`))?.split('=')[1];
  const workspaceId = get('workspace') || process.env.ACME_WORKSPACE_ID || '';
  const days = parseInt(get('days') || '30', 10);
  if (!workspaceId) {
    console.error('Usage: tsx scripts/omega/audit-trinity-citations.ts --workspace=<id> [--days=30]');
    process.exit(1);
  }
  return { workspaceId, days };
}

const EXPECTED_CITATIONS = [
  { code: '§1702.161', label: 'Commissioned Officer License (armed)' },
  { code: '§1702.163', label: 'Firearms qualification / MMPI psych' },
  { code: '§1702.201', label: 'Pocket card / company license' },
  { code: '§1702.221', label: 'Expired license override' },
  { code: '§1702.323', label: 'Plainclothes / PPO endorsement' },
];

async function main(): Promise<void> {
  const { workspaceId, days } = parseArgs();
  console.log('\n═══════════════════════════════════════════════════');
  console.log(' OMEGA — Trinity Citation Audit');
  console.log(` Workspace : ${workspaceId}`);
  console.log(` Window    : last ${days} days`);
  console.log('═══════════════════════════════════════════════════\n');

  const result = await db.execute(sql`
    SELECT id, decision_type, domain, chosen_option, reasoning, created_at
    FROM trinity_decision_log
    WHERE workspace_id = ${workspaceId}
      AND created_at >= NOW() - (${days}::int * INTERVAL '1 day')
    ORDER BY created_at DESC
    LIMIT 5000
  `);

  const rows = ((result as any).rows ?? (result as any)) as Array<{
    id: string;
    decision_type: string;
    domain: string;
    chosen_option: string;
    reasoning: string | null;
    created_at: string;
  }>;

  console.log(`Loaded ${rows.length} decisions.\n`);

  const counts = new Map<string, number>();
  const samples = new Map<string, string>();

  for (const row of rows) {
    const text = `${row.reasoning ?? ''} ${row.chosen_option ?? ''}`;
    for (const c of EXPECTED_CITATIONS) {
      if (text.includes(c.code)) {
        counts.set(c.code, (counts.get(c.code) ?? 0) + 1);
        if (!samples.has(c.code)) {
          samples.set(c.code, (row.reasoning ?? row.chosen_option ?? '').slice(0, 200));
        }
      }
    }
  }

  console.log('Citation breakdown:');
  console.log('───────────────────');
  for (const c of EXPECTED_CITATIONS) {
    const n = counts.get(c.code) ?? 0;
    const flag = n > 0 ? 'OK' : '— ';
    console.log(`${flag}  ${c.code}  (${c.label}): ${n} decisions`);
    if (samples.has(c.code)) {
      console.log(`      sample: ${samples.get(c.code)}`);
    }
  }

  const seen = EXPECTED_CITATIONS.filter(c => (counts.get(c.code) ?? 0) > 0).length;
  console.log(`\n${seen}/${EXPECTED_CITATIONS.length} expected § citations seen in window.`);

  if (seen === 0 && rows.length > 0) {
    console.log('\nWARNING: Trinity made decisions but cited zero Texas OC sections.');
    console.log('If this workspace is in Texas, the gatekeeper may not be wired correctly.');
    process.exit(2);
  }

  process.exit(0);
}

main().catch((err) => {
  console.error('Audit failed:', err);
  process.exit(1);
});
