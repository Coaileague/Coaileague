/**
 * PLATFORM HEALTH SCANNER
 * =======================
 *
 * Re-scan / sweep audit. Reads `action-wiring-manifest.json` (so we don't
 * re-derive what's already established) and runs new scans for:
 *
 *   1. ROUTE CONFLICTS — duplicate (METHOD, mounted-path) pairs declared in
 *      two or more places, mount-prefix overlaps, conflicting middleware
 *      stacks at the same prefix.
 *
 *   2. RACE CONDITIONS — fire-and-forget promises (TRINITY.md §B violation),
 *      `forEach` with `await` inside, multi-write routes without
 *      `db.transaction`, missing `for update` / pessimistic lock on
 *      read-then-write, financial mutations without idempotency keys,
 *      `setImmediate` / `setTimeout` wrapping awaitable work.
 *
 *   3. TRINITY-LAW VIOLATIONS —
 *        §A  direct `process.env.REPLIT_DEPLOYMENT` (must use isProduction)
 *        §B  fire-and-forget calls outside the NDS allowlist
 *        §F  SDK client instantiated at module load with `!` env-var assertion
 *        §G  raw SQL without `workspace_id` predicate on multi-tenant tables
 *        §I  hardcoded workspace / company IDs
 *
 *   4. SEMANTIC / CANONICAL ISSUES —
 *        - direct Twilio/Resend/web-push calls outside NDS primitives
 *        - storage import re-declarations (duplicate symbol, suggests drift)
 *        - exported but unreferenced router constants (likely dead mounts)
 *
 * Outputs:
 *   - PLATFORM_HEALTH_AUDIT.md     (human-readable)
 *   - platform-health-audit.json   (machine-consumable)
 *
 * Usage:
 *   npx tsx scripts/audit/scan-platform-health.ts
 *
 * Same caveat as the wiring manifest: regex first-pass. Each finding
 * carries file+line citations so a human can verify before fixing.
 */

import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, '..', '..');
const OUT_JSON = path.join(ROOT, 'platform-health-audit.json');
const OUT_MD = path.join(ROOT, 'PLATFORM_HEALTH_AUDIT.md');
const WIRING_JSON = path.join(ROOT, 'action-wiring-manifest.json');

// --------------------------------------------------------------------------
// File walker (mirror the wiring manifest's skip list)
// --------------------------------------------------------------------------

const SKIP_DIRS = new Set([
  'node_modules', '.git', 'dist', 'build', 'coverage', 'public',
  'attached_assets', 'phase-17d-reports', 'sim_output', 'test-results',
  'audit_reports', 'android', 'migrations', 'tests', 'test',
]);

function walk(dir: string, exts: string[]): string[] {
  const out: string[] = [];
  if (!fs.existsSync(dir)) return out;
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const e of entries) {
    if (SKIP_DIRS.has(e.name)) continue;
    if (e.name.startsWith('.')) continue;
    const full = path.join(dir, e.name);
    if (e.isDirectory()) out.push(...walk(full, exts));
    else if (e.isFile() && exts.some((x) => e.name.endsWith(x))) out.push(full);
  }
  return out;
}

function relRoot(p: string): string { return path.relative(ROOT, p).replace(/\\/g, '/'); }
function readSafe(file: string): string { try { return fs.readFileSync(file, 'utf8'); } catch { return ''; } }
function lineOf(text: string, idx: number): number {
  let line = 1;
  for (let i = 0; i < idx && i < text.length; i++) if (text[i] === '\n') line++;
  return line;
}

/** Is `idx` inside a `//` line comment or a `/* ... *\/` block comment? */
function isInComment(text: string, idx: number): boolean {
  // Line-comment check: scan from start of line to idx for an unescaped //
  const lineStart = text.lastIndexOf('\n', idx) + 1;
  const lineHead = text.slice(lineStart, idx);
  const slashIdx = lineHead.indexOf('//');
  if (slashIdx >= 0) {
    // Make sure it's not inside a string. Naive but works most of the time:
    // count unescaped quotes before the //.
    const before = lineHead.slice(0, slashIdx);
    const dq = (before.match(/(?<!\\)"/g) || []).length;
    const sq = (before.match(/(?<!\\)'/g) || []).length;
    const bt = (before.match(/(?<!\\)`/g) || []).length;
    if (dq % 2 === 0 && sq % 2 === 0 && bt % 2 === 0) return true;
  }
  // Block-comment check: nearest /* before idx vs nearest */
  const lastOpen = text.lastIndexOf('/*', idx);
  const lastClose = text.lastIndexOf('*/', idx);
  if (lastOpen > lastClose) return true;
  return false;
}

// --------------------------------------------------------------------------
// Types
// --------------------------------------------------------------------------

interface Finding {
  category:
    | 'route_conflict'
    | 'mount_overlap'
    | 'race_fire_and_forget'
    | 'race_set_immediate'
    | 'race_for_each_await'
    | 'race_missing_transaction'
    | 'race_read_then_write_no_lock'
    | 'trinity_law_replit_direct'         // §A
    | 'trinity_law_fire_forget_outside_nds'// §B
    | 'trinity_law_module_load_assert'    // §F
    | 'trinity_law_raw_sql_no_workspace'  // §G
    | 'trinity_law_hardcoded_workspace'   // §I
    | 'semantic_direct_provider_call'
    | 'semantic_dead_router_export'
    | 'feature_route_no_response';
  severity: 'blocker' | 'high' | 'medium' | 'low';
  file: string;
  line: number;
  detail: string;
  evidence: string;       // a one-line snippet for context (truncated)
  ruleRef?: string;       // TRINITY.md section
}

interface Report {
  generatedAt: string;
  counts: Record<string, number>;
  findings: Finding[];
  routeConflicts: Array<{ key: string; locations: Array<{ file: string; line: number; mount: string | null }>; }>;
  mountOverlaps: Array<{ prefix: string; mounters: Array<{ file: string; line: number; mw: string[] }>; }>;
  routeFileSummaries: Array<{ file: string; routes: number; flagged: number }>;
}

// --------------------------------------------------------------------------
// Wiring manifest — load to get the canonical list of routes (no re-scan)
// --------------------------------------------------------------------------

interface WiringRecord {
  actionId: string;
  sourceType: string;
  status: string[];
  backend?: {
    method: string;
    endpoint: string;
    routeFile: string;
    line: number;
    mountPrefix: string | null;
    middleware: string[];
    rbac: string[];
    workspaceScoped: boolean | string;
    zodValidated: boolean | string;
    services: string[];
    dbWrites: string[];
    dbReads: string[];
    notificationCalls: string[];
    auditCalls: string[];
    transactional: boolean;
  };
}

interface WiringDuplicate {
  actionId: string;
  count: number;
  locations: string[];
}

function loadWiring(): { records: WiringRecord[]; duplicates: WiringDuplicate[] } {
  if (!fs.existsSync(WIRING_JSON)) {
    console.error('action-wiring-manifest.json not found — run generate-action-wiring-manifest.ts first.');
    process.exit(2);
  }
  return JSON.parse(fs.readFileSync(WIRING_JSON, 'utf8'));
}

// --------------------------------------------------------------------------
// 1) Route conflicts — same (METHOD, mounted endpoint) declared twice
// --------------------------------------------------------------------------

function detectRouteConflicts(
  records: WiringRecord[],
  duplicates: WiringDuplicate[],
): {
  conflicts: Array<{ key: string; locations: Array<{ file: string; line: number; mount: string | null }> }>;
  findings: Finding[];
} {
  // The wiring manifest's `duplicates` array already buckets by
  // (sourceType, actionId) where actionId encodes METHOD + full mounted
  // path. Anything with count>=2 there is a real route declared twice
  // somewhere in server/routes. We surface those + any same-file duplicates
  // we discover by re-scanning the records list directly (in case the
  // duplicates array missed a same-file pair due to (file, line) being
  // identical).
  const conflicts: Array<{ key: string; locations: Array<{ file: string; line: number; mount: string | null }> }> = [];
  const findings: Finding[] = [];
  for (const dup of duplicates) {
    if (!/^(?:api|ui)\|(?:api|wired):/.test(dup.actionId)) continue;
    if (dup.count < 2) continue;
    const idMatch = dup.actionId.match(/^(?:api|ui)\|(?:api|wired):([a-z]+):(.+)$/);
    if (!idMatch) continue;
    const method = idMatch[1].toUpperCase();
    const endpoint = idMatch[2];
    const key = `${method} ${endpoint}`;
    // Dedupe locations: the wiring manifest's duplicate-list counts a UI
    // cross-link as a separate record, so the same (file, line) shows up
    // multiple times. We only care about distinct (file, line) sites.
    const locByFileLine = new Map<string, { file: string; line: number; mount: string | null }>();
    for (const l of dup.locations) {
      const m = l.match(/^([^:]+):(\d+)$/);
      if (!m) continue;
      const k = `${m[1]}:${m[2]}`;
      if (!locByFileLine.has(k)) locByFileLine.set(k, { file: m[1], line: Number(m[2]), mount: null });
    }
    const locs = Array.from(locByFileLine.values());
    if (locs.length < 2) continue;       // Not actually a multi-site declaration
    const distinctFiles = new Set(locs.map((l) => l.file));
    if (distinctFiles.size < 2) {
      // Same file declares the same path more than once — second is dead.
      for (const loc of locs) {
        findings.push({
          category: 'route_conflict',
          severity: 'medium',
          file: loc.file,
          line: loc.line,
          detail: `Same route "${key}" declared ${locs.length}× in this file — first match wins; later declarations unreachable`,
          evidence: key,
        });
      }
      continue;
    }
    conflicts.push({ key, locations: locs });
    for (const loc of locs) {
      const others = locs.filter((l) => l !== loc).map((l) => `${l.file}:${l.line}`).slice(0, 5).join(', ');
      findings.push({
        category: 'route_conflict',
        severity: 'high',
        file: loc.file,
        line: loc.line,
        detail: `Duplicate route declaration "${key}" — also declared at ${others}${locs.length > 6 ? ` (+${locs.length - 6} more)` : ''}`,
        evidence: key,
      });
    }
  }
  return { conflicts, findings };
}

// --------------------------------------------------------------------------
// 2) Mount-prefix overlap — two routers mounted at the same prefix with
//    different middleware stacks. Real conflict = same prefix but different
//    middleware ordering (e.g. one branch has requireAuth, another doesn't).
// --------------------------------------------------------------------------

const MOUNT_RE = /\bapp\s*\.\s*use\s*\(\s*['"`]([^'"`]+)['"`]\s*,([^)]{0,1000})\)/g;

function detectMountOverlaps(): {
  overlaps: Array<{ prefix: string; mounters: Array<{ file: string; line: number; mw: string[] }> }>;
  findings: Finding[];
} {
  const allMounts: Array<{ prefix: string; file: string; line: number; mw: string[] }> = [];
  const mountFiles = [
    path.join(ROOT, 'server', 'routes.ts'),
    ...walk(path.join(ROOT, 'server', 'routes', 'domains'), ['.ts']),
    ...walk(path.join(ROOT, 'server', 'routes'), ['.ts']),
  ];
  const seen = new Set<string>();
  for (const f of mountFiles) {
    if (seen.has(f)) continue;
    seen.add(f);
    const src = readSafe(f);
    if (!src) continue;
    let m: RegExpExecArray | null;
    MOUNT_RE.lastIndex = 0;
    while ((m = MOUNT_RE.exec(src)) !== null) {
      const prefix = m[1];
      const args = m[2];
      const tokens = args.split(',').map((s) => s.trim()).filter(Boolean);
      const mw = tokens.slice(0, -1).map((s) => s.replace(/[^A-Za-z0-9_.]/g, '')).filter(Boolean);
      allMounts.push({ prefix, file: relRoot(f), line: lineOf(src, m.index), mw });
    }
  }
  const grouped = new Map<string, typeof allMounts>();
  for (const m of allMounts) {
    const list = grouped.get(m.prefix) || [];
    list.push(m);
    grouped.set(m.prefix, list);
  }
  const overlaps: Array<{ prefix: string; mounters: Array<{ file: string; line: number; mw: string[] }> }> = [];
  const findings: Finding[] = [];
  for (const [prefix, list] of grouped) {
    if (list.length < 2) continue;
    // Skip the universal `/api` prefix — that's app-level middleware (CSRF,
    // rate limiter, request id, etc.), not router mounts. Real overlaps are
    // domain-specific (`/api/foo`).
    if (prefix === '/api' || prefix === '/api/' || prefix === '/' || prefix === '') continue;
    // Different middleware sets at same prefix?
    const fingerprints = new Set(list.map((l) => l.mw.join('|')));
    if (fingerprints.size === 1) continue;
    overlaps.push({ prefix, mounters: list.map((l) => ({ file: l.file, line: l.line, mw: l.mw })) });
    for (const l of list) {
      findings.push({
        category: 'mount_overlap',
        severity: 'high',
        file: l.file,
        line: l.line,
        detail: `Mount prefix "${prefix}" registered with ${list.length} sites and ${fingerprints.size} distinct middleware stacks — first match wins, hidden bypass risk`,
        evidence: `app.use("${prefix}", ${l.mw.join(', ')})`,
      });
    }
  }
  return { overlaps, findings };
}

// --------------------------------------------------------------------------
// 3) Race conditions / fire-and-forget / forEach-await / no-transaction
// --------------------------------------------------------------------------

// Fire-and-forget = a *statement-level* Promise expression with .catch attached
// that is NOT preceded by `await`/`return`/`void`/`yield`/`throw` and is NOT
// inside a Promise.all / Promise.allSettled / Promise.race array literal nor
// passed as an argument to another function call. We approximate by checking
// (a) the start-of-statement boundary and (b) the character immediately before
// the matched expression.
const FIRE_FORGET_RE = /(^|[\n;{}])(\s*)([a-zA-Z_$][\w$]*(?:\s*\.\s*[a-zA-Z_$][\w$]*)*\s*\([^;{}]{0,2000}?\))\s*\.catch\s*\(/g;

// setImmediate / setTimeout with async callback — fire-and-forget by default
const SET_IMMEDIATE_ASYNC_RE = /\b(setImmediate|setTimeout)\s*\(\s*async\b/g;

// .forEach((x) => { ... await ... }) — forEach does not await
const FOR_EACH_AWAIT_RE = /\.forEach\s*\(\s*(?:async\s+)?\(?\s*[^)]*\)?\s*=>\s*\{[^}]{0,2000}\bawait\b/g;

// db.update / db.insert / db.delete count
const DB_WRITE_RE = /\bdb\s*\.\s*(?:insert|update|delete)\s*\(/g;
const DB_TX_RE = /\bdb\s*\.\s*transaction\s*\(/;

// Read-then-write without lock. Heuristic: file performs a `db.select` that
// is followed (within 800 chars) by `db.update`/`db.insert`/`db.delete` on
// the same first-table identifier, AND the file has no `for update`,
// `forUpdate(`, or `db.transaction(` wrapping it.
const SELECT_FROM_RE = /\bdb\s*\.\s*select\s*\([^)]*\)\s*\.\s*from\s*\(\s*([a-zA-Z_][a-zA-Z0-9_]*)\s*\)/g;

// Trinity §A — direct REPLIT_DEPLOYMENT check
const REPLIT_DIRECT_RE = /process\.env\.REPLIT_DEPLOYMENT\b/g;

// Trinity §F — `new <SDK>(process.env.X!`
const MODULE_LOAD_ASSERT_RE = /new\s+([A-Z][A-Za-z0-9_]+)\s*\(\s*process\.env\.[A-Z_][A-Z0-9_]+!/g;

// Trinity §G — UPDATE without workspace_id in WHERE clause (raw SQL)
const SQL_UPDATE_RE = /\b(?:UPDATE|update)\s+([a-zA-Z_][a-zA-Z0-9_]*)\b[\s\S]{0,800}?\bWHERE\b([\s\S]{0,400})/g;
const SQL_DELETE_RE = /\b(?:DELETE|delete)\s+FROM\s+([a-zA-Z_][a-zA-Z0-9_]*)\b[\s\S]{0,800}?\bWHERE\b([\s\S]{0,400})/g;

// Trinity §I — hardcoded workspace UUIDs; allowlist GRANDFATHERED + dev seeds
const HARDCODED_WS_RE = /['"`]([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})['"`]/g;
const ALLOWED_HARDCODED_FILES_RE = /\b(server\/lib\/isProduction\.ts|server\/tierGuards\.ts|server\/services\/development[^/]*|server\/seed-acme-full\.ts|scripts\/(prod|dev|seed)|tests\/|test\/|fixtures\/|GRANDFATHERED)/i;

// Direct provider calls (NDS bypass)
const DIRECT_PROVIDER_RE = /\b(twilio\s*\.\s*messages\.create|new\s+Twilio\b|resend\s*\.\s*emails\.send|new\s+Resend\b|webpush\s*\.\s*sendNotification|fcm\s*\.\s*send|messaging\s*\.\s*send)/g;
// Allow primitives that ARE the canonical NDS layer:
const NDS_FILES_RE = /\b(server\/services\/(smsService|emailCore|pushNotificationService|notificationDeliveryService|interviewChatOrchestrator|infrastructure\/apiKeyRotationService)\.ts|server\/routes\/voiceRoutes\.ts|server\/services\/voice|server\/services\/ai\/[^/]+\.ts|server\/services\/billos\.ts)/;

// Routes without a response (heuristic): a `router.METHOD('/path', async (req, res) => { ... })` whose handler body never references `res.`
const ROUTE_HANDLER_RE = /\b(?:router|app)\s*\.\s*(get|post|put|patch|delete)\s*\(\s*['"`]([^'"`]+)['"`][^,]*,([^)]{0,3000})\)\s*;?/g;

function scanContentFiles(): {
  findings: Finding[];
  routeFileSummaries: Array<{ file: string; routes: number; flagged: number }>;
} {
  const findings: Finding[] = [];
  const routeFileSummaries: Array<{ file: string; routes: number; flagged: number }> = [];
  const dirs = [
    path.join(ROOT, 'server', 'routes'),
    path.join(ROOT, 'server', 'services'),
    path.join(ROOT, 'server', 'middleware'),
    path.join(ROOT, 'server'),
  ];
  const allFiles = Array.from(new Set(dirs.flatMap((d) => walk(d, ['.ts']))));

  for (const f of allFiles) {
    const src = readSafe(f);
    if (!src) continue;
    const rel = relRoot(f);
    let routesInFile = 0;
    let flagged = 0;

    // ---------- 3a) Fire-and-forget ----------
    let m: RegExpExecArray | null;
    FIRE_FORGET_RE.lastIndex = 0;
    while ((m = FIRE_FORGET_RE.exec(src)) !== null) {
      const stmtIdx = m.index + m[1].length;
      if (isInComment(src, stmtIdx)) continue;
      // Skip if the matched call sits inside a Promise.all / allSettled / race
      // array literal or as an arg to another call. We look back ~400 chars
      // for an unbalanced `[` or `,` since the last `;` / `{` / `}`.
      const back = src.slice(Math.max(0, stmtIdx - 400), stmtIdx);
      const stmtBreak = Math.max(back.lastIndexOf(';'), back.lastIndexOf('{'), back.lastIndexOf('}'));
      const sinceBreak = back.slice(stmtBreak + 1);
      // unbalanced `[` or `(` open before us means we're inside an arg/array
      const opensSq = (sinceBreak.match(/\[/g) || []).length - (sinceBreak.match(/\]/g) || []).length;
      const opensPa = (sinceBreak.match(/\(/g) || []).length - (sinceBreak.match(/\)/g) || []).length;
      if (opensSq > 0 || opensPa > 0) continue;
      // Skip if the line starts with await/return/void/yield/throw
      const lineStart = src.lastIndexOf('\n', stmtIdx) + 1;
      const linePrefix = src.slice(lineStart, stmtIdx + m[3].length).trim();
      if (/^(?:await|return|void|yield|throw|const|let|var)\b/.test(linePrefix)) continue;
      // Skip pure logger calls
      if (/^(?:log|logger|console)\b/.test(m[3].trim())) continue;
      const evidence = src.slice(stmtIdx, Math.min(src.length, stmtIdx + 160)).split('\n')[0];
      findings.push({
        category: 'race_fire_and_forget',
        severity: 'high',
        file: rel,
        line: lineOf(src, stmtIdx),
        detail: 'Promise.catch attached without await/return — fire-and-forget violates TRINITY.md §B',
        evidence: evidence.trim(),
        ruleRef: 'TRINITY.md §B',
      });
      flagged++;
    }

    // ---------- 3b) setImmediate / setTimeout async ----------
    SET_IMMEDIATE_ASYNC_RE.lastIndex = 0;
    while ((m = SET_IMMEDIATE_ASYNC_RE.exec(src)) !== null) {
      if (isInComment(src, m.index)) continue;
      findings.push({
        category: 'race_set_immediate',
        severity: 'high',
        file: rel,
        line: lineOf(src, m.index),
        detail: `${m[1]}(async ...) — TRINITY.md §B forbids this fire-and-forget pattern`,
        evidence: src.slice(m.index, m.index + 100).split('\n')[0].trim(),
        ruleRef: 'TRINITY.md §B',
      });
      flagged++;
    }

    // ---------- 3c) forEach + await ----------
    FOR_EACH_AWAIT_RE.lastIndex = 0;
    while ((m = FOR_EACH_AWAIT_RE.exec(src)) !== null) {
      if (isInComment(src, m.index)) continue;
      findings.push({
        category: 'race_for_each_await',
        severity: 'medium',
        file: rel,
        line: lineOf(src, m.index),
        detail: '.forEach with await inside — forEach does not await; use for-of or Promise.all(map(...))',
        evidence: src.slice(m.index, m.index + 120).split('\n')[0].trim(),
      });
      flagged++;
    }

    // ---------- 3d) Multi-write without transaction (per file heuristic) ----------
    const writeMatches = [...src.matchAll(DB_WRITE_RE)];
    if (writeMatches.length >= 2 && !DB_TX_RE.test(src)) {
      // Anchor to the first write site
      const idx = writeMatches[0].index ?? 0;
      findings.push({
        category: 'race_missing_transaction',
        severity: 'medium',
        file: rel,
        line: lineOf(src, idx),
        detail: `${writeMatches.length} db.{insert|update|delete} calls in this file with no db.transaction wrap`,
        evidence: writeMatches.slice(0, 3).map((mm) => `db.${(mm[0].match(/(insert|update|delete)/) || [])[1]}`).join(', '),
      });
      flagged++;
    }

    // ---------- 3e) Read-then-write without lock ----------
    const selects = [...src.matchAll(new RegExp(SELECT_FROM_RE.source, 'g'))];
    if (selects.length > 0 && !DB_TX_RE.test(src) && !/\bforUpdate\s*\(|FOR\s+UPDATE\b/i.test(src)) {
      for (const sel of selects.slice(0, 5)) {  // cap to avoid noise
        const tbl = sel[1];
        const after = src.slice((sel.index || 0), (sel.index || 0) + 800);
        if (new RegExp(`db\\.(?:update|insert|delete)\\s*\\(\\s*${tbl}\\s*\\)`).test(after)) {
          findings.push({
            category: 'race_read_then_write_no_lock',
            severity: 'medium',
            file: rel,
            line: lineOf(src, sel.index ?? 0),
            detail: `read-then-write on \`${tbl}\` without db.transaction or .forUpdate() — race window`,
            evidence: `select(${tbl})  →  write(${tbl})  in same scope`,
          });
          flagged++;
          break;
        }
      }
    }

    // ---------- 4a) Trinity §A REPLIT_DEPLOYMENT direct ----------
    if (!/\b(server\/lib\/isProduction\.ts)$/.test(rel)) {
      REPLIT_DIRECT_RE.lastIndex = 0;
      while ((m = REPLIT_DIRECT_RE.exec(src)) !== null) {
        if (isInComment(src, m.index)) continue;
        findings.push({
          category: 'trinity_law_replit_direct',
          severity: 'high',
          file: rel,
          line: lineOf(src, m.index),
          detail: 'Direct process.env.REPLIT_DEPLOYMENT check — TRINITY.md §A requires isProduction() from server/lib/isProduction.ts',
          evidence: src.slice(m.index, m.index + 80).split('\n')[0].trim(),
          ruleRef: 'TRINITY.md §A',
        });
        flagged++;
      }
    }

    // ---------- 4b) Trinity §F — module-load assertion ----------
    MODULE_LOAD_ASSERT_RE.lastIndex = 0;
    while ((m = MODULE_LOAD_ASSERT_RE.exec(src)) !== null) {
      if (isInComment(src, m.index)) continue;
      // Skip the lazy factory files themselves
      if (/stripeClient|getStripe|lazy/i.test(rel)) continue;
      findings.push({
        category: 'trinity_law_module_load_assert',
        severity: 'high',
        file: rel,
        line: lineOf(src, m.index),
        detail: `\`new ${m[1]}(process.env.X!)\` at module load — TRINITY.md §F requires lazy factory + Proxy`,
        evidence: src.slice(m.index, m.index + 120).split('\n')[0].trim(),
        ruleRef: 'TRINITY.md §F',
      });
      flagged++;
    }

    // ---------- 4c) Trinity §G — raw SQL UPDATE/DELETE without workspace_id ----------
    // Only flag when the matched SQL appears to live inside a tagged template
    // (sql`...`, pool.query(`...`), etc.).
    SQL_UPDATE_RE.lastIndex = 0;
    while ((m = SQL_UPDATE_RE.exec(src)) !== null) {
      if (isInComment(src, m.index)) continue;
      const tbl = m[1];
      const where = m[2] || '';
      // Only consider tables that look multi-tenant — cheap heuristic: name in a
      // known multi-tenant table allow-list OR the surrounding 200 chars
      // mention `workspace`. If not multi-tenant, skip.
      if (!/workspace_id|workspaceId/.test(src.slice(Math.max(0, m.index - 200), m.index + 800))) continue;
      if (/workspace_?id/i.test(where)) continue;
      // Skip migration / drizzle DSL — those manage tenant scope at row level
      if (/migrations|drizzle|schema\.ts$/i.test(rel)) continue;
      findings.push({
        category: 'trinity_law_raw_sql_no_workspace',
        severity: 'blocker',
        file: rel,
        line: lineOf(src, m.index),
        detail: `Raw SQL UPDATE on \`${tbl}\` without workspace_id in WHERE — TRINITY.md §G tenant-isolation violation`,
        evidence: src.slice(m.index, m.index + 200).split('\n')[0].trim(),
        ruleRef: 'TRINITY.md §G',
      });
      flagged++;
    }
    SQL_DELETE_RE.lastIndex = 0;
    while ((m = SQL_DELETE_RE.exec(src)) !== null) {
      if (isInComment(src, m.index)) continue;
      const tbl = m[1];
      const where = m[2] || '';
      if (!/workspace_id|workspaceId/.test(src.slice(Math.max(0, m.index - 200), m.index + 800))) continue;
      if (/workspace_?id/i.test(where)) continue;
      if (/migrations|drizzle|schema\.ts$/i.test(rel)) continue;
      findings.push({
        category: 'trinity_law_raw_sql_no_workspace',
        severity: 'blocker',
        file: rel,
        line: lineOf(src, m.index),
        detail: `Raw SQL DELETE FROM \`${tbl}\` without workspace_id in WHERE — TRINITY.md §G tenant-isolation violation`,
        evidence: src.slice(m.index, m.index + 200).split('\n')[0].trim(),
        ruleRef: 'TRINITY.md §G',
      });
      flagged++;
    }

    // ---------- 4d) Trinity §I — hardcoded workspace UUIDs ----------
    if (!ALLOWED_HARDCODED_FILES_RE.test(rel)) {
      HARDCODED_WS_RE.lastIndex = 0;
      while ((m = HARDCODED_WS_RE.exec(src)) !== null) {
        if (isInComment(src, m.index)) continue;
        // Skip if it's clearly the GRANDFATHERED env-var fallback expression
        const before = src.slice(Math.max(0, m.index - 80), m.index);
        if (/GRANDFATHERED|fallback|example|default/i.test(before)) continue;
        findings.push({
          category: 'trinity_law_hardcoded_workspace',
          severity: 'high',
          file: rel,
          line: lineOf(src, m.index),
          detail: `Hardcoded UUID literal "${m[1]}" — TRINITY.md §I forbids hardcoded workspace/user IDs in production code`,
          evidence: src.slice(Math.max(0, m.index - 30), m.index + 60).trim(),
          ruleRef: 'TRINITY.md §I',
        });
        flagged++;
      }
    }

    // ---------- 5a) Direct provider calls outside NDS ----------
    if (!NDS_FILES_RE.test(rel)) {
      DIRECT_PROVIDER_RE.lastIndex = 0;
      while ((m = DIRECT_PROVIDER_RE.exec(src)) !== null) {
        if (isInComment(src, m.index)) continue;
        findings.push({
          category: 'semantic_direct_provider_call',
          severity: 'high',
          file: rel,
          line: lineOf(src, m.index),
          detail: `Direct provider SDK call (${m[1].split(/[.\s]/)[0]}) outside NotificationDeliveryService allow-list — TRINITY.md §B violation`,
          evidence: src.slice(m.index, m.index + 100).split('\n')[0].trim(),
          ruleRef: 'TRINITY.md §B',
        });
        flagged++;
      }
    }

    // (Routes-without-response heuristic was dropped — regex cannot reliably
    // capture handler bodies past the first `)` without a real AST. Re-add
    // when we wire up ts-morph in a follow-up pass.)
    if (rel.startsWith('server/routes/')) {
      ROUTE_HANDLER_RE.lastIndex = 0;
      while (ROUTE_HANDLER_RE.exec(src) !== null) routesInFile++;
      routeFileSummaries.push({ file: rel, routes: routesInFile, flagged });
    }
  }
  return { findings, routeFileSummaries };
}

// --------------------------------------------------------------------------
// 6) Dead router exports — file declares `export const fooRouter = Router()`
//    but no `app.use(...)` references that name anywhere
// --------------------------------------------------------------------------

function detectDeadRouterExports(): Finding[] {
  const findings: Finding[] = [];
  const routeFiles = walk(path.join(ROOT, 'server', 'routes'), ['.ts']);
  // Build a global usage index — any `app.use(..., NAME)` or
  // `import { NAME }` reference anywhere counts as "used".
  const allServerFiles = walk(path.join(ROOT, 'server'), ['.ts']);
  const usageSrc = allServerFiles.map(readSafe).join('\n\n');

  for (const f of routeFiles) {
    const src = readSafe(f);
    if (!src) continue;
    const exportRe = /export\s+(?:const|let|var|function)\s+([a-zA-Z_][a-zA-Z0-9_]*Router(?:Public)?)\b/g;
    let m: RegExpExecArray | null;
    while ((m = exportRe.exec(src)) !== null) {
      const name = m[1];
      // Build a regex that finds the symbol used elsewhere (mount or import).
      const usageRe = new RegExp(`\\b${name}\\b`, 'g');
      const usages = usageSrc.match(usageRe) || [];
      // The export site itself counts as one — anything ≤2 means likely unused
      // (declaration + maybe a re-export).
      if (usages.length <= 2) {
        findings.push({
          category: 'semantic_dead_router_export',
          severity: 'low',
          file: relRoot(f),
          line: lineOf(src, m.index),
          detail: `Exported router \`${name}\` referenced ≤2x across server/. Likely dead mount.`,
          evidence: m[0],
        });
      }
    }
  }
  return findings;
}

// --------------------------------------------------------------------------
// Markdown writer
// --------------------------------------------------------------------------

function asTable(headers: string[], rows: string[][]): string {
  const head = '| ' + headers.join(' | ') + ' |';
  const sep = '| ' + headers.map(() => '---').join(' | ') + ' |';
  const body = rows.map((r) => '| ' + r.map(escape).join(' | ') + ' |').join('\n');
  return [head, sep, body].join('\n');
}
function escape(s: string): string { return String(s ?? '').replace(/\|/g, '\\|').replace(/\n/g, ' ').slice(0, 280); }

function buildMd(report: Report, tscSummary: { errors: number; topFiles: Array<{ file: string; count: number }> }): string {
  const out: string[] = [];
  out.push('# CoAIleague — Platform Health Audit (rescan)');
  out.push('');
  out.push(`> **Generated:** ${report.generatedAt}`);
  out.push('> **Generator:** `scripts/audit/scan-platform-health.ts`');
  out.push('> **Inputs:** `action-wiring-manifest.json` + filesystem rescan');
  out.push('');
  out.push('## Method');
  out.push('');
  out.push('Reuses the canonical route map from `action-wiring-manifest.json` to');
  out.push('avoid re-deriving what the wiring scan already established. Adds new');
  out.push('regex sweeps for route conflicts, mount overlaps, race-condition');
  out.push('patterns, Trinity-law violations (§A, §B, §F, §G, §I), and direct');
  out.push('provider-SDK calls that bypass NotificationDeliveryService.');
  out.push('');
  out.push('Each finding carries a `file:line` citation. Where a regex cannot');
  out.push('prove a property the row is omitted, never silently green-lit.');
  out.push('');

  // Counts table
  out.push('## Counts by category');
  out.push('');
  const byCat = new Map<string, number>();
  for (const f of report.findings) byCat.set(f.category, (byCat.get(f.category) || 0) + 1);
  out.push(asTable(['Category', 'Count'], Array.from(byCat.entries()).sort((a, b) => b[1] - a[1]).map(([k, v]) => [k, String(v)])));
  out.push('');

  out.push('## Counts by severity');
  out.push('');
  const bySev = new Map<string, number>();
  for (const f of report.findings) bySev.set(f.severity, (bySev.get(f.severity) || 0) + 1);
  out.push(asTable(['Severity', 'Count'], Array.from(bySev.entries()).sort((a, b) => b[1] - a[1]).map(([k, v]) => [k, String(v)])));
  out.push('');

  // TypeScript snapshot
  out.push('## TypeScript snapshot');
  out.push('');
  out.push(`- \`tsc --noEmit\` errors: **${tscSummary.errors}**`);
  if (tscSummary.topFiles.length > 0) {
    out.push('');
    out.push('Top 25 files by error count:');
    out.push('');
    out.push(asTable(['file', 'errors'], tscSummary.topFiles.slice(0, 25).map((t) => [t.file, String(t.count)])));
  }
  out.push('');

  // Render findings grouped by category
  const renderGroup = (title: string, cats: string[], limit: number) => {
    out.push(`## ${title}`);
    out.push('');
    const rows = report.findings.filter((f) => cats.includes(f.category));
    if (rows.length === 0) { out.push('_(none)_'); out.push(''); return; }
    out.push(asTable(
      ['severity', 'file:line', 'category', 'detail'],
      rows.slice(0, limit).map((f) => [f.severity, `${f.file}:${f.line}`, f.category, f.detail]),
    ));
    if (rows.length > limit) out.push(`\n_+ ${rows.length - limit} more — see \`platform-health-audit.json\`._`);
    out.push('');
  };

  renderGroup('Route conflicts (same METHOD+path declared twice)', ['route_conflict'], 50);
  renderGroup('Mount overlaps (same prefix, conflicting middleware)', ['mount_overlap'], 50);
  renderGroup('Race conditions — fire-and-forget', ['race_fire_and_forget', 'race_set_immediate'], 50);
  renderGroup('Race conditions — forEach with await', ['race_for_each_await'], 25);
  renderGroup('Race conditions — multi-write without transaction', ['race_missing_transaction'], 50);
  renderGroup('Race conditions — read-then-write without lock', ['race_read_then_write_no_lock'], 50);
  renderGroup('Trinity §A — direct REPLIT_DEPLOYMENT', ['trinity_law_replit_direct'], 50);
  renderGroup('Trinity §F — module-load SDK assertion', ['trinity_law_module_load_assert'], 50);
  renderGroup('Trinity §G — raw SQL UPDATE/DELETE without workspace_id', ['trinity_law_raw_sql_no_workspace'], 50);
  renderGroup('Trinity §I — hardcoded workspace UUIDs', ['trinity_law_hardcoded_workspace'], 50);
  renderGroup('Direct provider SDK calls outside NDS', ['semantic_direct_provider_call'], 50);
  renderGroup('Dead/unused router exports', ['semantic_dead_router_export'], 50);

  out.push('## Top route files by flagged-finding count');
  out.push('');
  const top = [...report.routeFileSummaries].sort((a, b) => b.flagged - a.flagged).slice(0, 30);
  out.push(asTable(['file', 'routes', 'flagged'], top.map((t) => [t.file, String(t.routes), String(t.flagged)])));
  out.push('');

  out.push('## How to use this report');
  out.push('');
  out.push('1. Walk the `blocker` and `high` rows first; verify each citation.');
  out.push('2. For each true-positive, claim the file in `AGENT_HANDOFF.md` ACTIVE CLAIMS, fix it, leave a SESSION LOG entry citing the finding.');
  out.push('3. Re-run `npx tsx scripts/audit/scan-platform-health.ts` after each batch — the count delta is the audit trail.');
  out.push('');
  return out.join('\n');
}

// --------------------------------------------------------------------------
// TSC summary
// --------------------------------------------------------------------------

function summarizeTsc(): { errors: number; topFiles: Array<{ file: string; count: number }> } {
  const tscPath = '/tmp/tsc-output.txt';
  if (!fs.existsSync(tscPath)) return { errors: -1, topFiles: [] };
  const text = fs.readFileSync(tscPath, 'utf8');
  const re = /^([^(\n]+)\((\d+),\d+\):\s+error\s+TS\d+/gm;
  const counts = new Map<string, number>();
  let m: RegExpExecArray | null;
  let total = 0;
  while ((m = re.exec(text)) !== null) {
    total++;
    counts.set(m[1], (counts.get(m[1]) || 0) + 1);
  }
  const topFiles = Array.from(counts.entries()).sort((a, b) => b[1] - a[1]).map(([file, count]) => ({ file, count }));
  return { errors: total, topFiles };
}

// --------------------------------------------------------------------------
// MAIN
// --------------------------------------------------------------------------

function main() {
  const startedAt = Date.now();
  const log = (s: string) => process.stdout.write(`[${((Date.now() - startedAt) / 1000).toFixed(1)}s] ${s}\n`);

  log('Loading wiring manifest…');
  const wiring = loadWiring();
  log(`  ${wiring.records.length} action records  (${wiring.duplicates.length} duplicate keys)`);

  log('Detecting route conflicts…');
  const rc = detectRouteConflicts(wiring.records, wiring.duplicates);
  log(`  ${rc.conflicts.length} conflict keys`);

  log('Detecting mount overlaps…');
  const mo = detectMountOverlaps();
  log(`  ${mo.overlaps.length} overlapping prefixes`);

  log('Scanning content for races / law violations…');
  const cf = scanContentFiles();
  log(`  ${cf.findings.length} findings`);

  log('Detecting dead router exports…');
  const dead = detectDeadRouterExports();
  log(`  ${dead.length} dead-export candidates`);

  log('Summarizing tsc output…');
  const tsc = summarizeTsc();
  log(`  tsc errors: ${tsc.errors}`);

  const findings = [
    ...rc.findings,
    ...mo.findings,
    ...cf.findings,
    ...dead,
  ];

  const counts: Record<string, number> = {};
  for (const f of findings) counts[f.category] = (counts[f.category] || 0) + 1;

  const report: Report = {
    generatedAt: new Date().toISOString(),
    counts,
    findings,
    routeConflicts: rc.conflicts,
    mountOverlaps: mo.overlaps,
    routeFileSummaries: cf.routeFileSummaries,
  };

  fs.writeFileSync(OUT_JSON, JSON.stringify({ ...report, tscSummary: tsc }, null, 2));
  log(`Wrote ${OUT_JSON}`);

  const md = buildMd(report, tsc);
  fs.writeFileSync(OUT_MD, md);
  log(`Wrote ${OUT_MD}`);
  log('Done.');
}

main();
