/**
 * ACTION WIRING GAP CHECKER
 * =========================
 *
 * Reads `action-wiring-manifest.json` (produced by
 * `generate-action-wiring-manifest.ts`) and prints a focused gap report.
 *
 * Exit code is non-zero when blocking conditions are met (any UI_ONLY,
 * MISSING_RBAC on a mutating route, REGISTERED_NOT_EXECUTABLE Trinity
 * action). This makes the script CI-friendly when the team is ready to
 * gate merges.
 *
 * Usage:
 *   npx tsx scripts/audit/check-action-wiring-gaps.ts [--strict]
 *
 *   --strict   exit non-zero on any gap (default: only on hard blockers)
 */

import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, '..', '..');
const MANIFEST = path.join(ROOT, 'action-wiring-manifest.json');

interface Manifest {
  generatedAt: string;
  counts: Record<string, number>;
  records: any[];
  duplicates: Array<{ actionId: string; count: number; locations: string[] }>;
  trinity: any[];
  websocket: any[];
  automation: any[];
}

const STRICT = process.argv.includes('--strict');

function load(): Manifest {
  if (!fs.existsSync(MANIFEST)) {
    console.error('action-wiring-manifest.json not found.');
    console.error('Run `npx tsx scripts/audit/generate-action-wiring-manifest.ts` first.');
    process.exit(2);
  }
  return JSON.parse(fs.readFileSync(MANIFEST, 'utf8'));
}

function table(rows: string[][], headers: string[]): string {
  const widths = headers.map((h, i) =>
    Math.max(h.length, ...rows.map((r) => (r[i] || '').length)),
  );
  const fmtRow = (r: string[]) =>
    r.map((c, i) => (c || '').padEnd(widths[i])).join('  ');
  return [fmtRow(headers), widths.map((w) => '-'.repeat(w)).join('  '), ...rows.map(fmtRow)].join('\n');
}

function group(records: any[], statusFilter: string): any[] {
  return records.filter((r) => Array.isArray(r.status) && r.status.includes(statusFilter));
}

function fmtRecord(r: any): string[] {
  const where = r.backend
    ? `${r.backend.routeFile}:${r.backend.line}`
    : (r.frontend?.files?.[0] || r.trinity?.actionRegistryFile || '-');
  return [r.actionId, r.sourceType, r.domain, r.mutationType, where, (r.status || []).join(',')];
}

function section(title: string, records: any[], limit = 25): { lines: string[]; count: number } {
  const lines: string[] = [];
  lines.push('');
  lines.push(`### ${title} (${records.length})`);
  lines.push('');
  if (records.length === 0) {
    lines.push('  (none)');
    return { lines, count: 0 };
  }
  lines.push(table(
    records.slice(0, limit).map(fmtRecord),
    ['actionId', 'src', 'domain', 'mutation', 'where', 'flags'],
  ));
  if (records.length > limit) lines.push(`  … +${records.length - limit} more`);
  return { lines, count: records.length };
}

function main(): void {
  const m = load();
  const out: string[] = [];
  out.push(`# CoAIleague — Action Wiring Gap Report`);
  out.push(`Generated from manifest: ${m.generatedAt}`);
  out.push('');
  out.push('## Counts');
  out.push('');
  for (const [k, v] of Object.entries(m.counts)) out.push(`- ${k}: ${v}`);

  const records = m.records;
  const sections: Array<{ title: string; status: string; blocker: boolean }> = [
    { title: 'PARTIAL — wired but flagged',     status: 'PARTIAL',                    blocker: false },
    { title: 'UI_ONLY — frontend with no route', status: 'UI_ONLY',                    blocker: true  },
    { title: 'BACKEND_ONLY — no UI binding',    status: 'BACKEND_ONLY',                blocker: false },
    { title: 'REGISTERED_NOT_EXECUTABLE',       status: 'REGISTERED_NOT_EXECUTABLE',   blocker: true  },
    { title: 'SILENT_FAILURE_RISK',             status: 'SILENT_FAILURE_RISK',         blocker: false },
    { title: 'MISSING_RBAC',                    status: 'MISSING_RBAC',                blocker: true  },
    { title: 'MISSING_ZOD',                     status: 'MISSING_ZOD',                 blocker: false },
    { title: 'MISSING_WORKSPACE_SCOPE',         status: 'MISSING_WORKSPACE_SCOPE',     blocker: true  },
    { title: 'MISSING_AUDIT',                   status: 'MISSING_AUDIT',               blocker: false },
    { title: 'MISSING_TRANSACTION',             status: 'MISSING_TRANSACTION',         blocker: false },
    { title: 'MUTATES_WITHOUT_NOTIFICATION',    status: 'MUTATES_WITHOUT_NOTIFICATION',blocker: false },
    { title: 'DUPLICATE_ACTION',                status: 'DUPLICATE_ACTION',            blocker: false },
    { title: 'DEAD_OR_LEGACY',                  status: 'DEAD_OR_LEGACY',              blocker: false },
  ];

  let blockerCount = 0;
  let totalGapCount = 0;
  for (const s of sections) {
    const recs = group(records, s.status);
    totalGapCount += recs.length;
    if (s.blocker) blockerCount += recs.length;
    const { lines } = section(s.title, recs);
    out.push(...lines);
  }

  // Domain hot-spots — count statuses per domain
  out.push('');
  out.push('## Domain hot-spots (count of flagged records per domain)');
  out.push('');
  const byDomain = new Map<string, number>();
  for (const r of records) {
    if (!r.status || r.status.length === 0) continue;
    if (r.status.length === 1 && r.status[0] === 'WIRED') continue;
    byDomain.set(r.domain, (byDomain.get(r.domain) || 0) + 1);
  }
  const sorted = Array.from(byDomain.entries()).sort((a, b) => b[1] - a[1]);
  out.push(table(sorted.map(([d, c]) => [d, String(c)]), ['domain', 'flagged']));

  // Duplicates summary
  out.push('');
  out.push(`## Duplicate actionIds (${m.duplicates.length})`);
  out.push('');
  if (m.duplicates.length === 0) {
    out.push('  (none)');
  } else {
    out.push(table(
      m.duplicates.slice(0, 50).map((d: { actionId: string; count: number; locations: string[] }) =>
        [d.actionId, String(d.count), d.locations.join(' / ')]
      ),
      ['actionId', 'count', 'locations'],
    ));
    if (m.duplicates.length > 50) out.push(`  … +${m.duplicates.length - 50} more`);
  }

  // Trinity registry health
  out.push('');
  out.push(`## Trinity action registry — ${m.trinity.length} actionIds`);
  out.push('');
  const unregistered = m.trinity.filter((t: any) => !t.registered);
  const noAuditWrap = m.trinity.filter((t: any) => !t.auditWrapped);
  out.push(`- Unregistered (literal exists but registerAction not detected): ${unregistered.length}`);
  out.push(`- Without audit wrap detected: ${noAuditWrap.length}`);
  if (unregistered.length) {
    out.push('');
    out.push(table(
      unregistered.slice(0, 25).map((t: any) => [t.actionId, t.file + ':' + t.line]),
      ['actionId', 'where'],
    ));
  }

  out.push('');
  out.push('## Summary');
  out.push(`- Total flagged records: ${totalGapCount}`);
  out.push(`- Blocker-class gaps: ${blockerCount}`);
  out.push(`- Strict mode: ${STRICT ? 'on' : 'off'}`);

  process.stdout.write(out.join('\n') + '\n');

  if (STRICT && totalGapCount > 0) process.exit(1);
  if (!STRICT && blockerCount > 0) process.exit(1);
}

main();
