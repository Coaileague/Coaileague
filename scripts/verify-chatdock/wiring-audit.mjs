#!/usr/bin/env node
/**
 * ChatDock Wiring Audit
 * ─────────────────────
 * Static check: every API path the ChatDock UI calls must resolve to a real
 * registered route on the server. Catches ghost-endpoint silent failures
 * (the "button does nothing" class of bug) before runtime.
 *
 * Sources scanned (frontend):
 *   client/src/components/chatdock/ChatDock.tsx
 *   client/src/services/chatConnectionManager.ts
 *   client/src/hooks/useChatManager.ts
 *   client/src/hooks/use-chatroom-websocket.ts
 *
 * Sources scanned (backend):
 *   server/routes/chat-management.ts          mount: /api/chat/manage
 *   server/routes/chat-rooms.ts               mount: /api/chat/rooms
 *   server/routes/chat-uploads.ts             mount: /api/chat/upload
 *   server/routes/chatPollRoutes.ts           mount: /api/chat
 *   server/routes/chatSearchRoutes.ts         mount: /api/chat
 *   server/routes/chatInlineRoutes.ts         mount: /api/chat
 *   server/routes/chat.ts                     defines full /api/chat/* paths
 *   server/routes/dockChatRoutes.ts           mount: /api/chat/dock
 *   server/routes/helpai-routes.ts            mount: /api/helpai
 *   server/routes/trinityChatRoutes.ts        defines full /api/* paths
 *
 * NOTE: queryKey arrays in React Query are CACHE keys — they're prefixes used
 * to invalidate cached results, not actual fetch URLs. We deliberately skip
 * them so we only report calls that actually hit the network.
 */
import fs from 'node:fs';
import path from 'node:path';
import url from 'node:url';

const ROOT = path.resolve(path.dirname(url.fileURLToPath(import.meta.url)), '..', '..');

const CLIENT_FILES = [
  'client/src/components/chatdock/ChatDock.tsx',
  'client/src/services/chatConnectionManager.ts',
  'client/src/hooks/useChatManager.ts',
  'client/src/hooks/use-chatroom-websocket.ts',
];

const ROUTE_FILES = [
  { prefix: '/api/chat/upload', file: 'server/routes/chat-uploads.ts' },
  { prefix: '/api/chat/rooms',  file: 'server/routes/chat-rooms.ts' },
  { prefix: '/api/chat/manage', file: 'server/routes/chat-management.ts' },
  { prefix: '/api/chat/dock',   file: 'server/routes/dockChatRoutes.ts' },
  { prefix: '/api/chat',        file: 'server/routes/chatPollRoutes.ts' },
  { prefix: '/api/chat',        file: 'server/routes/chatSearchRoutes.ts' },
  { prefix: '/api/chat',        file: 'server/routes/chatInlineRoutes.ts' },
  { prefix: '',                 file: 'server/routes/chat.ts' },
  { prefix: '/api/helpai',      file: 'server/routes/helpai-routes.ts' },
  { prefix: '',                 file: 'server/routes/trinityChatRoutes.ts' },
];

const ROUTE_RE = /(?:router|helpaiRouter)\.(get|post|put|patch|delete)\(\s*[`'"]([^`'"]+)[`'"]/g;

function readUtf8(rel) {
  return fs.readFileSync(path.join(ROOT, rel), 'utf8');
}

// 1. Build the registered-route table
const registered = [];
for (const { prefix, file } of ROUTE_FILES) {
  let src;
  try { src = readUtf8(file); }
  catch { continue; }
  let m;
  ROUTE_RE.lastIndex = 0;
  while ((m = ROUTE_RE.exec(src))) {
    const method = m[1].toUpperCase();
    const subPath = m[2];
    const fullPath = subPath.startsWith('/api/') ? subPath : prefix + (subPath === '/' ? '' : subPath);
    registered.push({ method, path: fullPath, source: file });
  }
}

// 2. Extract calls from the client.
//    apiRequest("METHOD", "/api/...")          — RPC helper, method explicit
//    apiFetch("/api/...")                       — typed GET helper
//    fetch("/api/...", { method: "POST", ... }) — raw fetch, method may be in opts
const APIREQUEST_RE = /apiRequest\(\s*["'](GET|POST|PUT|PATCH|DELETE)["']\s*,\s*[`'"]([^`'"]+)[`'"]/g;
const APIFETCH_RE   = /apiFetch\(\s*[`'"]([^`'"]+)[`'"]/g;
const FETCH_BLOCK_RE = /fetch\(\s*[`'"]([^`'"]+)[`'"]\s*,\s*\{([^}]*)\}/gs;
const FETCH_BARE_RE  = /fetch\(\s*[`'"]([^`'"]+)[`'"]\s*[\),]/g;
const METHOD_IN_OPTS_RE = /method\s*:\s*[`'"]([A-Z]+)[`'"]/;

function lineOf(src, idx) {
  return src.slice(0, idx).split('\n').length;
}

const chatPrefixes = ['/api/chat', '/api/helpai', '/api/trinity'];
const matchesChat = p => chatPrefixes.some(pref => p.startsWith(pref));

const clientCalls = [];
for (const rel of CLIENT_FILES) {
  const src = readUtf8(rel);
  // Track byte offsets we've already accounted for so the bare-fetch regex
  // doesn't double-count a call already matched with explicit options.
  const claimed = new Set();
  let m;

  APIREQUEST_RE.lastIndex = 0;
  while ((m = APIREQUEST_RE.exec(src))) {
    if (matchesChat(m[2])) {
      clientCalls.push({ method: m[1], raw: m[2], source: rel, line: lineOf(src, m.index) });
      claimed.add(m.index);
    }
  }

  APIFETCH_RE.lastIndex = 0;
  while ((m = APIFETCH_RE.exec(src))) {
    if (matchesChat(m[1])) {
      clientCalls.push({ method: 'GET', raw: m[1], source: rel, line: lineOf(src, m.index) });
      claimed.add(m.index);
    }
  }

  // fetch("...", { method: "POST", ... })
  FETCH_BLOCK_RE.lastIndex = 0;
  while ((m = FETCH_BLOCK_RE.exec(src))) {
    if (!matchesChat(m[1])) continue;
    const opt = METHOD_IN_OPTS_RE.exec(m[2]);
    const method = opt ? opt[1] : 'GET';
    clientCalls.push({ method, raw: m[1], source: rel, line: lineOf(src, m.index) });
    claimed.add(m.index);
  }

  // fetch("...")  — only fire when the same offset wasn't already matched above
  FETCH_BARE_RE.lastIndex = 0;
  while ((m = FETCH_BARE_RE.exec(src))) {
    if (!matchesChat(m[1])) continue;
    if (claimed.has(m.index)) continue;
    clientCalls.push({ method: 'GET', raw: m[1], source: rel, line: lineOf(src, m.index) });
  }
}

function normalizeClient(p) {
  p = p.split('?')[0];
  if (p.endsWith('/') && p.length > 1) p = p.slice(0, -1);
  p = p.replace(/\$\{[^}]+\}/g, ':p').replace(/:[a-zA-Z]+/g, ':p');
  return p;
}
function normalizeRegistered(p) {
  if (p.endsWith('/') && p.length > 1) p = p.slice(0, -1);
  return p.replace(/:[a-zA-Z]+/g, ':p');
}

const regSet = new Map();
for (const r of registered) {
  regSet.set(`${r.method}\t${normalizeRegistered(r.path)}`, r.source);
}

const summary = { matched: 0, missing: [], unique: new Map() };
for (const c of clientCalls) {
  const np = normalizeClient(c.raw);
  const key = `${c.method}\t${np}`;
  if (summary.unique.has(key)) continue;
  summary.unique.set(key, { ...c, normalized: np });
  if (regSet.has(key) || regSet.has(key.replace(/\/:p$/, ''))) {
    summary.matched += 1;
    continue;
  }
  summary.missing.push({ ...c, normalized: np });
}

console.log('═══════════════════════════════════════════════════════════════');
console.log('  ChatDock Wiring Audit  —  static frontend ↔ backend match    ');
console.log('═══════════════════════════════════════════════════════════════');
console.log(`Registered routes scanned: ${registered.length}`);
console.log(`Distinct ChatDock calls:   ${summary.unique.size}`);
console.log(`Resolved to real route:    ${summary.matched}`);
console.log(`Unresolved (ghosts):       ${summary.missing.length}`);
console.log();

if (summary.missing.length) {
  console.log('GHOST ENDPOINTS (frontend calls that match no backend route):');
  for (const m of summary.missing) {
    console.log(`  ✗ [${m.method}] ${m.raw}`);
    console.log(`       normalized → ${m.normalized}`);
    console.log(`       called from ${m.source}:${m.line}`);
  }
  console.log();
}

console.log('---- Resolved ChatDock endpoint inventory ----');
const sorted = [...summary.unique.entries()].sort();
for (const [k, v] of sorted) {
  const [method, p] = k.split('\t');
  const ok = regSet.has(k) || regSet.has(k.replace(/\/:p$/, ''));
  console.log(`  ${ok ? '✓' : '✗'} ${method.padEnd(6)} ${p.padEnd(60)}  ${ok ? '' : '(GHOST)'}`);
}

if (summary.missing.length) process.exit(1);
console.log('\nAll ChatDock endpoints resolve to a registered backend route. ✓');
