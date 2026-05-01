#!/usr/bin/env node
/**
 * Deep Layer Audit — Orphaned Code & Dead Wiring Scanner
 * ──────────────────────────────────────────────────────
 * Scans the CoAIleague codebase for the classes of bugs the master handoff
 * explicitly forbids: orphaned routes, missing lazy targets, no-op buttons,
 * placeholder stubs, server routes never registered, frontend API calls
 * with no matching backend handler.
 *
 * Each finding is categorised:
 *   FATAL   — code path 500s or 404s in production. Must fix.
 *   WARN    — feature half-wired or dead code. Fix or document.
 *   INFO    — naming / hygiene. Optional.
 *
 * Output: console + sim_output/deep-audit.json (machine-readable receipt).
 */
import fs from "node:fs";
import path from "node:path";
import url from "node:url";

const ROOT = path.resolve(path.dirname(url.fileURLToPath(import.meta.url)), "..", "..");
const findings = [];

function rec(severity, group, name, detail) {
  findings.push({ severity, group, name, detail });
}

function readUtf8(rel) {
  return fs.readFileSync(path.join(ROOT, rel), "utf8");
}

function fileExists(rel) {
  try { fs.accessSync(path.join(ROOT, rel)); return true; }
  catch { return false; }
}

function walk(dir, exts = [".ts", ".tsx", ".mjs"], out = []) {
  const abs = path.join(ROOT, dir);
  if (!fs.existsSync(abs)) return out;
  for (const entry of fs.readdirSync(abs, { withFileTypes: true })) {
    if (entry.name === "node_modules" || entry.name === "dist" || entry.name === ".git") continue;
    const sub = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(sub, exts, out);
    else if (exts.some(e => entry.name.endsWith(e))) out.push(sub);
  }
  return out;
}

// ─────────────────────────────────────────────────────────────────────────
// 1. Lazy imports with missing target files (broken page routes)
// ─────────────────────────────────────────────────────────────────────────
console.log("[1] Lazy-import targets (App.tsx + main.tsx)");
const LAZY_RE = /lazy\(\s*\(\s*\)\s*=>\s*import\(\s*["']([^"']+)["']\s*\)/g;
for (const rel of ["client/src/App.tsx", "client/src/main.tsx"]) {
  if (!fileExists(rel)) continue;
  const src = readUtf8(rel);
  let m;
  while ((m = LAZY_RE.exec(src))) {
    const importPath = m[1];
    const resolved = importPath.startsWith("@/")
      ? "client/src/" + importPath.slice(2)
      : path.posix.join(path.dirname(rel), importPath);
    const candidates = [
      resolved + ".tsx",
      resolved + ".ts",
      resolved + "/index.tsx",
      resolved + "/index.ts",
    ];
    if (!candidates.some(fileExists)) {
      rec("FATAL", "lazy-import", `${rel}: lazy("${importPath}") target missing`,
        `Tried: ${candidates.join(", ")}`);
    }
  }
}

// ─────────────────────────────────────────────────────────────────────────
// 2. Frontend API calls that don't map to a backend route
//
// Uses the actual mount table — parses `import xRouter from "./yRoutes"`
// PLUS `app.use("/api/prefix", ..., xRouter)` so a route declared as
//   router.get("/dm/create")
// inside chat-management.ts mounted at "/api/chat/manage" is correctly
// recognised as POST /api/chat/manage/dm/create. Without this, the naive
// scanner produced 800+ false positives.
// ─────────────────────────────────────────────────────────────────────────
console.log("[2] Frontend API calls vs backend route registry");
const SERVER_FILES = walk("server");
const ROUTE_RE = /\b(?:[a-zA-Z]+)?\.(get|post|put|patch|delete)\(\s*[`'"]([^`'"]+)[`'"]/g;

// Build (router-symbol → file path) map from imports across the registration
// files (server/routes.ts and server/routes/domains/*.ts).
const REGISTRATION_FILES = ["server/routes.ts", ...walk("server/routes/domains")];
const symbolToFile = new Map(); // routerSymbol -> server/routes/X.ts
for (const rel of REGISTRATION_FILES) {
  if (!fileExists(rel)) continue;
  const src = readUtf8(rel);
  // Default import:   import fooRouter from "../fooRoutes"
  // Named import:     import { fooRouter, barRouter } from "../foo"
  const defaultImportRe = /import\s+(\w+)\s+from\s+["']([^"']+)["']/g;
  const namedImportRe = /import\s+\{([^}]+)\}\s+from\s+["']([^"']+)["']/g;
  let m;
  function recordSymbol(sym, importPath) {
    if (!importPath.startsWith("./") && !importPath.startsWith("../")) return;
    const resolved = path.posix.normalize(path.posix.join(path.dirname(rel), importPath));
    for (const ext of [".ts", "/index.ts"]) {
      if (fileExists(resolved + ext)) { symbolToFile.set(sym, resolved + ext); return; }
    }
  }
  while ((m = defaultImportRe.exec(src))) recordSymbol(m[1], m[2]);
  while ((m = namedImportRe.exec(src))) {
    const importPath = m[2];
    for (const sym of m[1].split(",").map(s => s.trim().replace(/\s+as\s+\w+/, "").trim()).filter(Boolean)) {
      recordSymbol(sym, importPath);
    }
  }
}

// Extract `app.use("/api/...", ..., routerSymbol)` mounts.
const mountMap = new Map(); // routerSymbol -> "/api/prefix"
for (const rel of REGISTRATION_FILES) {
  if (!fileExists(rel)) continue;
  const src = readUtf8(rel);
  const useRe = /app\.use\(\s*[`'"]([^`'"]+)[`'"][^)]*?,\s*(\w+)\s*\)/g;
  let m;
  while ((m = useRe.exec(src))) {
    if (m[1].startsWith("/api/")) mountMap.set(m[2], m[1]);
  }
  // Also: `app.use(routerSymbol)` — router defines its own /api/* paths inline.
  const bareRe = /app\.use\(\s*(\w+Router|router\w+|chatroomCommandRouter|notificationsRouter)\s*\)/g;
  while ((m = bareRe.exec(src))) {
    mountMap.set(m[1], "");
  }
}

// Build the registered-route table.
const registered = new Set(); // METHOD\tnormalized path
for (const [sym, file] of symbolToFile) {
  const prefix = mountMap.get(sym);
  if (prefix === undefined) continue;
  let src;
  try { src = readUtf8(file); } catch { continue; }
  let m;
  ROUTE_RE.lastIndex = 0;
  while ((m = ROUTE_RE.exec(src))) {
    const method = m[1].toUpperCase();
    const sub = m[2];
    if (!sub.startsWith("/")) continue;
    const full = sub.startsWith("/api/") ? sub : prefix + (sub === "/" ? "" : sub);
    if (!full.startsWith("/api/")) continue;
    registered.add(`${method}\t${full.replace(/:[a-zA-Z]+/g, ":p").replace(/\/$/, "")}`);
  }
}
// Plus all routes registered directly in server/routes.ts via app.METHOD(...)
{
  const src = readUtf8("server/routes.ts");
  let m;
  const directRe = /\bapp\.(get|post|put|patch|delete)\(\s*[`'"]([^`'"]+)[`'"]/g;
  while ((m = directRe.exec(src))) {
    if (!m[2].startsWith("/api/")) continue;
    registered.add(`${m[1].toUpperCase()}\t${m[2].replace(/:[a-zA-Z]+/g, ":p").replace(/\/$/, "")}`);
  }
}

const APIREQUEST_RE = /apiRequest\(\s*["'](GET|POST|PUT|PATCH|DELETE)["']\s*,\s*[`'"]([^`'"]+)[`'"]/g;
const APIFETCH_RE   = /apiFetch\(\s*[`'"]([^`'"]+)[`'"]/g;
const FETCH_BLOCK_RE = /fetch\(\s*[`'"]([^`'"]+)[`'"]\s*,\s*\{([^}]*)\}/gs;
const METHOD_OPTS_RE = /method\s*:\s*[`'"]([A-Z]+)[`'"]/;

const clientCalls = new Map();
const CLIENT_FILES = walk("client/src");
for (const rel of CLIENT_FILES) {
  let src;
  try { src = readUtf8(rel); } catch { continue; }

  function pushCall(method, raw, idx) {
    if (!raw.startsWith("/api/")) return;
    const normalized = raw
      .split("?")[0]
      .replace(/\$\{[^}]+\}/g, ":p")
      .replace(/:[a-zA-Z]+/g, ":p")
      .replace(/\/$/, "");
    const key = `${method}\t${normalized}`;
    if (clientCalls.has(key)) return;
    const line = src.slice(0, idx).split("\n").length;
    clientCalls.set(key, { raw, source: rel, line });
  }

  let m;
  APIREQUEST_RE.lastIndex = 0;
  while ((m = APIREQUEST_RE.exec(src))) pushCall(m[1], m[2], m.index);
  APIFETCH_RE.lastIndex = 0;
  while ((m = APIFETCH_RE.exec(src))) pushCall("GET", m[1], m.index);
  FETCH_BLOCK_RE.lastIndex = 0;
  while ((m = FETCH_BLOCK_RE.exec(src))) {
    const opt = METHOD_OPTS_RE.exec(m[2]);
    pushCall(opt ? opt[1] : "GET", m[1], m.index);
  }
}

for (const [key, info] of clientCalls) {
  const candidates = [key, key.replace(/\/:p$/, "")];
  // Also try with trailing param-on-segment removed (e.g., /foo/:p/bar → /foo/bar)
  let matched = candidates.some(c => registered.has(c));
  if (!matched) {
    rec("FATAL", "ghost-endpoint", `${info.source}:${info.line} → ${key.replace("\t", " ")}`,
      `Frontend calls but no server route matches.`);
  }
}

// ─────────────────────────────────────────────────────────────────────────
// 3. Empty / no-op onClick handlers
// ─────────────────────────────────────────────────────────────────────────
console.log("[3] No-op button handlers");
const NOOP_PATTERNS = [
  /onClick=\{\s*\(\s*\)\s*=>\s*\{\s*\}\s*\}/g,
  /onClick=\{\s*\(\s*\)\s*=>\s*null\s*\}/g,
  /onClick=\{\s*\(\s*\)\s*=>\s*undefined\s*\}/g,
  /onClick=\{\s*\(\s*\)\s*=>\s*void\s+0\s*\}/g,
  /onClick=\{\s*noop\s*\}/g,
];
for (const rel of CLIENT_FILES.filter(p => p.endsWith(".tsx"))) {
  let src;
  try { src = readUtf8(rel); } catch { continue; }
  for (const re of NOOP_PATTERNS) {
    re.lastIndex = 0;
    let m;
    while ((m = re.exec(src))) {
      const line = src.slice(0, m.index).split("\n").length;
      rec("FATAL", "noop-onclick", `${rel}:${line}`, `Button has no-op onClick: ${m[0].slice(0, 80)}`);
    }
  }
}

// ─────────────────────────────────────────────────────────────────────────
// 4. TODO / FIXME / placeholder markers in user-facing components
// ─────────────────────────────────────────────────────────────────────────
console.log("[4] Stub / placeholder markers");
const STUB_RE = /(?:\/\/\s*(TODO|FIXME|XXX|HACK|STUB|PLACEHOLDER)|throw\s+new\s+Error\s*\(\s*["']not\s+implemented)/gi;
for (const rel of CLIENT_FILES.filter(p => p.endsWith(".tsx") && !p.includes("__tests__"))) {
  let src;
  try { src = readUtf8(rel); } catch { continue; }
  let m;
  STUB_RE.lastIndex = 0;
  let count = 0;
  while ((m = STUB_RE.exec(src))) count++;
  if (count > 0) rec("INFO", "stub-marker", rel, `${count} TODO/FIXME/STUB markers`);
}

// ─────────────────────────────────────────────────────────────────────────
// 5. Server route files that exist but are never registered
// ─────────────────────────────────────────────────────────────────────────
console.log("[5] Unmounted server route files");
const ROUTE_FILES = walk("server/routes").filter(p => p.endsWith(".ts"));
const ROUTE_REGISTRATION_FILES = [
  "server/routes.ts",
  "server/routes/domains/comms.ts",
  ...walk("server/routes/domains"),
];
const allRegistrationSrc = ROUTE_REGISTRATION_FILES
  .filter(fileExists)
  .map(readUtf8)
  .join("\n");

for (const rel of ROUTE_FILES) {
  const fname = path.basename(rel, ".ts");
  // Skip helper files / non-router files
  if (!/Router|Routes|router/i.test(fname)) continue;
  // The file must be imported AND mounted somewhere in the registration files.
  // We accept "import dockChatRouter from '../dockChatRoutes'" as a registration signal.
  const importNeedle = `from "../${fname}"`;
  const importNeedle2 = `from '../${fname}'`;
  const importNeedle3 = `from "./${fname}"`;
  const importNeedle4 = `from '../routes/${fname}'`;
  const importNeedle5 = `from './routes/${fname}'`;
  const found =
    allRegistrationSrc.includes(importNeedle) ||
    allRegistrationSrc.includes(importNeedle2) ||
    allRegistrationSrc.includes(importNeedle3) ||
    allRegistrationSrc.includes(importNeedle4) ||
    allRegistrationSrc.includes(importNeedle5);
  if (!found) {
    rec("WARN", "unmounted-router", rel, `File looks like a router but no domain mount imports it.`);
  }
}

// ─────────────────────────────────────────────────────────────────────────
// 6. Imports that point to missing local files
// ─────────────────────────────────────────────────────────────────────────
console.log("[6] Local imports with missing targets");
const IMPORT_RE = /^import\s+(?:[^"']+from\s+)?["']([^"']+)["']/gm;
for (const rel of [...CLIENT_FILES, ...SERVER_FILES]) {
  let src;
  try { src = readUtf8(rel); } catch { continue; }
  IMPORT_RE.lastIndex = 0;
  let m;
  while ((m = IMPORT_RE.exec(src))) {
    const importPath = m[1];
    if (!importPath.startsWith(".") && !importPath.startsWith("@/") && !importPath.startsWith("@shared/")) continue;

    let resolved;
    if (importPath.startsWith("@/")) {
      resolved = "client/src/" + importPath.slice(2);
    } else if (importPath.startsWith("@shared/")) {
      resolved = "shared/" + importPath.slice(8);
    } else {
      resolved = path.posix.join(path.dirname(rel), importPath);
    }
    const candidates = [
      resolved,
      resolved + ".ts",
      resolved + ".tsx",
      resolved + ".js",
      resolved + ".mjs",
      resolved + "/index.ts",
      resolved + "/index.tsx",
      resolved + "/index.js",
    ];
    if (!candidates.some(fileExists)) {
      const line = src.slice(0, m.index).split("\n").length;
      rec("FATAL", "missing-import", `${rel}:${line}`, `import "${importPath}" — none of: ${candidates.slice(0, 4).join(", ")}`);
    }
  }
}

// ─────────────────────────────────────────────────────────────────────────
// Summary + receipt
// ─────────────────────────────────────────────────────────────────────────
const bySev = { FATAL: 0, WARN: 0, INFO: 0 };
for (const f of findings) bySev[f.severity]++;

console.log("\n═══════════════════════════════════════════════════════════════");
console.log(`  Deep Audit:  FATAL=${bySev.FATAL}  WARN=${bySev.WARN}  INFO=${bySev.INFO}`);
console.log("═══════════════════════════════════════════════════════════════");

const groups = [...new Set(findings.map(f => f.group))];
for (const g of groups) {
  const items = findings.filter(f => f.group === g);
  const fatals = items.filter(f => f.severity === "FATAL").length;
  console.log(`\n[${g}]  total=${items.length}  fatal=${fatals}`);
  for (const f of items.slice(0, 12)) {
    console.log(`  ${f.severity}  ${f.name}`);
    if (f.detail) console.log(`         ${f.detail}`);
  }
  if (items.length > 12) console.log(`  ... ${items.length - 12} more`);
}

const outDir = path.resolve(ROOT, "sim_output");
fs.mkdirSync(outDir, { recursive: true });
fs.writeFileSync(path.join(outDir, "deep-audit.json"), JSON.stringify({
  ranAt: new Date().toISOString(),
  summary: bySev,
  findings,
}, null, 2));
fs.writeFileSync(path.join(outDir, "deep-audit.txt"),
  findings.map(f => `${f.severity}\t${f.group}\t${f.name}\t${f.detail || ""}`).join("\n"));

if (bySev.FATAL > 0) process.exit(1);
