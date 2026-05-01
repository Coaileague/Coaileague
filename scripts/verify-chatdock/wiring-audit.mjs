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

// ─────────────────────────────────────────────────────────────────────────
// Universality check — every platform must hit the SAME /ws/chat endpoint
// on the SAME server. Capacitor (iOS + Android) wraps the same SPA, so the
// WebSocket URL must be derived from window.location and not hard-coded.
// ─────────────────────────────────────────────────────────────────────────
console.log('\n---- Universal chat-server checks ----');

const wsProvider = readUtf8('client/src/providers/WebSocketProvider.tsx');
const wsServer   = readUtf8('server/websocket.ts');
const capCfg     = readUtf8('capacitor.config.ts');

const checks = [];

checks.push({
  name: 'Server listens on exactly one WS path: /ws/chat',
  pass: /path:\s*['"]\/ws\/chat['"]/.test(wsServer),
});
checks.push({
  name: 'Client builds wsUrl from window.location.host (no hard-coded host)',
  pass: /window\.location\.host\s*\}\/ws\/chat/.test(wsProvider),
});
checks.push({
  name: 'Client picks ws/wss based on document protocol (PWA + native parity)',
  pass: /window\.location\.protocol === ['"]https:['"]\s*\?\s*['"]wss:['"]/.test(wsProvider),
});
checks.push({
  name: 'Capacitor config does NOT override server.url (mobile uses same origin)',
  // server.url override is the only way to point the WebView at a different
  // host than the bundled app. If it's absent, both iOS and Android open the
  // bundled SPA which then connects to its own /ws/chat — i.e. universal.
  pass: !/^\s*url:\s*['"]/m.test(capCfg.split('server:')[1]?.split('}')[0] || ''),
});
checks.push({
  name: 'ChatServerHub registered as the WS broadcaster (single orchestrator)',
  pass: /ChatServerHub\.setWebSocketBroadcaster/.test(wsServer),
});

let universalPass = true;
for (const c of checks) {
  console.log(`  ${c.pass ? '✓' : '✗'} ${c.name}`);
  if (!c.pass) universalPass = false;
}

// ─────────────────────────────────────────────────────────────────────────
// HelpAI orchestrator wiring
// ─────────────────────────────────────────────────────────────────────────
console.log('\n---- HelpAI orchestrator wiring ----');

const hub = readUtf8('server/services/ChatServerHub.ts');
const summon = readUtf8('server/services/botSummonService.ts');
const chatMgmt = readUtf8('server/routes/chat-management.ts');
const helpaiRoutes = readUtf8('server/routes/helpai-routes.ts');

const helpAIChecks = [
  {
    name: 'HelpAI bot user is seeded into the platform-wide HelpDesk room',
    pass: /helpai-bot/.test(hub) && /Seeding HelpDesk room with HelpAI bot/i.test(hub),
  },
  {
    name: 'HelpAI gets auto-summoned into new conversations (botSummonService)',
    pass: /summonHelpAIForConversation/.test(summon) && /addHelpAIParticipant/.test(summon),
  },
  {
    name: 'ChatDock-created DMs auto-summon HelpAI',
    pass: /summonHelpAIForConversation\([^)]*"dm_bot"/.test(chatMgmt),
  },
  {
    name: 'ChatDock-created group rooms auto-summon HelpAI',
    pass: /summonHelpAIForConversation\([^)]*"open_chat"/.test(chatMgmt),
  },
  {
    name: 'ChatServerHub.emitMessagePosted intercepts /helpai slash command',
    pass: /message\.startsWith\('\/helpai'\)/.test(hub),
  },
  {
    name: 'ChatServerHub.emitMessagePosted detects @HelpAI plain-text mention (any client)',
    pass: /@HelpAI\\b/i.test(hub) || /helpaiMentionMatch/.test(hub),
  },
  {
    name: 'POST /api/helpai/message HTTP path exists for ChatDock summon button',
    pass: /helpaiRouter\.post\(['"]\/message['"]/.test(helpaiRoutes),
  },
  {
    name: 'HelpAI persona prompt describes a manager-style assistant',
    pass: /co-pilot|assistant|help desk/i.test(summon),
  },
];

let helpAIPass = true;
for (const c of helpAIChecks) {
  console.log(`  ${c.pass ? '✓' : '✗'} ${c.name}`);
  if (!c.pass) helpAIPass = false;
}

console.log('\n═══════════════════════════════════════════════════════════════');
const overallOk = summary.missing.length === 0 && universalPass && helpAIPass;
if (overallOk) {
  console.log('  All universal-chat & HelpAI orchestrator checks passed. ✓');
} else {
  console.log('  Some checks failed — see ✗ markers above.');
}
console.log('═══════════════════════════════════════════════════════════════');

if (summary.missing.length || !universalPass || !helpAIPass) process.exit(1);
