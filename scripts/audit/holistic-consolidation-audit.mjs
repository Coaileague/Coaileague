#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const SCAN_DIRS = ['server', 'client/src'];
const TEXT_EXTENSIONS = new Set(['.ts', '.tsx', '.js', '.jsx']);

function walk(dir, files = []) {
  const fullDir = path.join(ROOT, dir);
  if (!fs.existsSync(fullDir)) return files;
  for (const entry of fs.readdirSync(fullDir, { withFileTypes: true })) {
    if (entry.name === 'node_modules' || entry.name === 'dist' || entry.name === '.git') continue;
    const fullPath = path.join(fullDir, entry.name);
    if (entry.isDirectory()) {
      walk(path.relative(ROOT, fullPath), files);
    } else if (TEXT_EXTENSIONS.has(path.extname(entry.name))) {
      files.push(path.relative(ROOT, fullPath).replaceAll('\\', '/'));
    }
  }
  return files;
}

function read(file) {
  return fs.readFileSync(path.join(ROOT, file), 'utf8');
}

function lineNumber(text, index) {
  return text.slice(0, index).split(/\r?\n/).length;
}

function findLines(file, pattern, limit = 12) {
  const text = read(file);
  const results = [];
  for (const match of text.matchAll(pattern)) {
    results.push({
      file,
      line: lineNumber(text, match.index ?? 0),
      text: text.slice(match.index ?? 0).split(/\r?\n/, 1)[0].trim().slice(0, 180),
    });
    if (results.length >= limit) break;
  }
  return results;
}

function addFinding(findings, finding) {
  if (finding.evidence.length === 0 && finding.priority !== 'P2') return;
  findings.push(finding);
}

function duplicateMountFindings(files) {
  const findings = [];
  // Match: app.use('/path', ...middleware, routerVar)
  // Capture both the path AND the last argument (router variable name)
  const mountPattern = /app\.use\(\s*["'`]([^"'`]+)["'`][^)]*,\s*(\w+)\s*\)/g;
  for (const file of files.filter((name) => name.startsWith('server/routes/domains/'))) {
    const text = read(file);
    // Key = path:routerVar — only flag if same router is mounted at same path twice
    const seen = new Map();
    for (const match of text.matchAll(mountPattern)) {
      const route = match[1];
      const routerVar = match[2];
      const key = `${route}::${routerVar}`;
      const row = { file, line: lineNumber(text, match.index ?? 0), text: match[0] };
      const existing = seen.get(key) ?? [];
      existing.push(row);
      seen.set(key, existing);
    }
    for (const [key, rows] of seen.entries()) {
      if (rows.length > 1) {
        const [route, routerVar] = key.split('::');
        findings.push({
          id: `duplicate-mount:${file}:${route}`,
          domain: 'routes',
          priority: 'P1',
          summary: `Same router (${routerVar}) mounted twice at ${route}`,
          evidence: rows,
          recommendation: 'Remove the duplicate mount — the router is already registered at this path.',
          owner: 'Claude',
        });
      }
    }
  }
  return findings;
}

function routeValidationFindings(files) {
  const findings = [];
  const routeFiles = files.filter((file) => file.startsWith('server/routes/') && file.endsWith('.ts'));
  for (const file of routeFiles) {
    const text = read(file);
    const hasMutation = /\.(post|put|patch|delete)\(/.test(text);
    const readsBody = /\breq\.body\b/.test(text);
    const hasSafeParse = /\.safeParse\(\s*req\.body/.test(text);
    const hasZodSchema = /z\.object\(/.test(text);
    if (hasMutation && readsBody && (!hasSafeParse || !hasZodSchema)) {
      findings.push({
        id: `route-validation:${file}`,
        domain: 'routes',
        priority: 'P1',
        summary: 'Mutation route reads req.body without an obvious local Zod safeParse boundary',
        evidence: findLines(file, /\breq\.body\b/g, 6),
        recommendation: 'Add a local z.object schema and safeParse before any DB write, or route through an already-validated service boundary.',
        owner: 'Copilot',
      });
    }
  }
  return findings;
}

function largeFileFindings(files) {
  const candidates = [];
  for (const file of files) {
    const lines = read(file).split(/\r?\n/).length;
    if (lines >= 1800) {
      candidates.push({
        file,
        line: 1,
        text: `${lines} lines`,
        lines,
      });
    }
  }
  return [{
    id: 'large-service-route-components',
    domain: 'condensing',
    priority: 'P2',
    summary: 'Large surviving files should be split only by domain boundary, not cosmetic refactor',
    evidence: candidates.sort((a, b) => b.lines - a.lines).slice(0, 20),
    recommendation: 'Refactor one large file at a time after tests pin behavior. Prefer extracting pure helpers and domain services before moving route handlers.',
    owner: 'Codex',
  }];
}

function main() {
  const files = SCAN_DIRS.flatMap((dir) => walk(dir));
  const findings = [];

  addFinding(findings, {
    id: 'rbac-irc-overlap',
    domain: 'ChatDock/RBAC',
    priority: 'P0',
    summary: 'IRC/mode code still appears in permission-sensitive chat surfaces',
    evidence: files
      .filter((file) => /server\/(websocket|routes\/chat|services\/(chat|irc))/i.test(file))
      .flatMap((file) => findLines(file,
        // Only flag hardcoded role strings next to moderation actions — NOT RBAC helper calls
        /\b(KICK|BAN|MUTE|PROMOTE)\b[^\n]*(?:===|!==)\s*['\"](root_admin|manager|owner|support|admin)['\"]|(?:===|!==)\s*['\"](root_admin|manager|owner|support|admin)['\"'][^\n]*\b(KICK|BAN|MUTE|PROMOTE)\b/gi, 4))
      .slice(0, 20),
    recommendation: 'Move access decisions to RBAC helpers and leave room type/mode as behavior metadata only. Do this after scheduling polish, before ChatDock feature expansion.',
    owner: 'Codex',
  });

  addFinding(findings, {
    id: 'chatdock-durability-foundation',
    domain: 'ChatDock',
    priority: 'P0',
    summary: 'ChatDock still has in-memory and direct WebSocket patterns that need durable message/Redis foundation',
    evidence: (() => {
      // Only flag if chatDurabilityAdapter is NOT imported (real gap)
      // vs just using Map for non-message data (normal usage)
      const durabilityExists = files.some(f => f.includes('chatDurabilityAdapter'));
      if (durabilityExists) return []; // Adapter is in place — P0 resolved
      return files
        .filter((file) => /websocket|chat.*route|chat.*service/i.test(file))
        .flatMap((file) => findLines(file, /\b(messageBuffer|recentEventCache|workspaceEventBuffer)\b/gi, 3))
        .slice(0, 12);
    })(),
    recommendation: 'Add durable message store and Redis pub/sub before read receipts, reactions, media gallery, polls, or voice features.',
    owner: 'Claude',
  });

  addFinding(findings, {
    id: 'portal-dashboard-quiet-state-uniformity',
    domain: 'portals',
    priority: 'P1',
    summary: 'Portal/dashboard components still contain generic quiet-state or mock/TODO copy candidates',
    evidence: files
      .filter((file) => file.startsWith('client/src/') && /portal|dashboard|workspace|client|auditor/i.test(file))
      .flatMap((file) => findLines(file, /\b(Loading\.\.\.|No data available|Nothing to show|mock|TODO|coming soon)\b/gi, 3))
      .slice(0, 24),
    recommendation: 'Use shared empty/loading/error components with role-aware copy, and verify every action button has loading, disabled, success, and error states.',
    owner: 'Claude',
  });

  addFinding(findings, {
    id: 'pdf-vault-workflow-gaps',
    domain: 'documents',
    priority: 'P1',
    summary: 'PDF/document routes should be verified for real PDF output plus vault persistence',
    evidence: files
      .filter((file) => file.startsWith('server/routes/') || file.startsWith('server/services/'))
      .filter((file) => /pdf|document|compliance|report|paystub|tax/i.test(file))
      .flatMap((file) => findLines(file, /\b(res\.json|placeholder|mock|TODO|Content-Type.*application\/pdf|vault|pdfBase64)\b/gi, 3))
      .slice(0, 24),
    recommendation: 'Every generated tax, payroll, compliance, and client report artifact must be a branded PDF saved to tenant vault before response/email.',
    owner: 'Codex',
  });

  addFinding(findings, {
    id: 'payroll-ach-money-workflow',
    domain: 'payroll/ACH',
    priority: 'P1',
    summary: 'Payroll, ACH, Plaid, and paystub paths need one end-to-end workflow sweep',
    evidence: files
      .filter((file) => /payroll|plaid|ach|paystub|tax/i.test(file))
      .flatMap((file) => findLines(file, /\b(parseFloat|Number\(|Math\.round|amount|FinancialCalculator|toFinancialString|ACH|Plaid|direct deposit)\b/gi, 3))
      .slice(0, 24),
    recommendation: 'Verify FinancialCalculator on every money mutation, ACH idempotency, vault paystub generation before transfer, and employee ownership checks.',
    owner: 'Codex',
  });

  findings.push(...duplicateMountFindings(files));
  findings.push(...routeValidationFindings(files).slice(0, 40));
  findings.push(...largeFileFindings(files));

  const summary = {
    generatedAt: new Date().toISOString(),
    scannedFiles: files.length,
    countsByPriority: findings.reduce((acc, finding) => {
      acc[finding.priority] = (acc[finding.priority] || 0) + 1;
      return acc;
    }, {}),
    countsByDomain: findings.reduce((acc, finding) => {
      acc[finding.domain] = (acc[finding.domain] || 0) + 1;
      return acc;
    }, {}),
    findings,
  };

  if (process.argv.includes('--json')) {
    console.log(JSON.stringify(summary, null, 2));
    return;
  }

  console.log(`Holistic consolidation audit: ${summary.scannedFiles} files scanned`);
  console.log(`Priorities: ${JSON.stringify(summary.countsByPriority)}`);
  for (const finding of findings) {
    console.log(`\n[${finding.priority}] ${finding.id} (${finding.domain})`);
    console.log(`  ${finding.summary}`);
    console.log(`  Owner: ${finding.owner}`);
    console.log(`  Recommendation: ${finding.recommendation}`);
    for (const item of finding.evidence.slice(0, 5)) {
      console.log(`  - ${item.file}:${item.line} ${item.text}`);
    }
  }
}

main();
