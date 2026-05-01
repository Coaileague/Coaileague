/**
 * ACTION WIRING MANIFEST GENERATOR
 * ================================
 *
 * Bryan's rule: every action in the platform must be fully traceable from
 * intent to actual effect. This script does a *first-pass* audit of the
 * action surface and emits two artifacts:
 *
 *   - ACTION_WIRING_MANIFEST.md            (human review)
 *   - action-wiring-manifest.json          (machine consumable)
 *
 * It covers six action source types:
 *
 *   ui          frontend buttons/forms/menus that call apiRequest/fetch
 *   api         backend HTTP routes (router.{get,post,put,patch,delete})
 *   trinity     entries in server/services/ai-brain/actionRegistry.ts
 *   websocket   server/websocket.ts socket.on / emit handlers
 *   automation  workflow / automation service entries
 *   webhook     inbound webhook routes (twilio, resend, stripe, github, etc.)
 *
 * IMPORTANT — this is a *first-pass*. We use regex, not full TypeScript AST.
 * The output is a starting truth-table, not a verdict. Each record carries
 * enough source citations (file + line) that a human or follow-up tool can
 * verify the chain. Where the regex cannot prove a property (e.g. RBAC),
 * the field is marked `unknown` rather than `false` so downstream tooling
 * does not produce false confidence.
 *
 * Usage:
 *   npx tsx scripts/audit/generate-action-wiring-manifest.ts
 *
 * Outputs are written to repo root.
 */

import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, '..', '..');
const OUT_JSON = path.join(ROOT, 'action-wiring-manifest.json');
const OUT_MD = path.join(ROOT, 'ACTION_WIRING_MANIFEST.md');

// --------------------------------------------------------------------------
// Generic file walker (skip heavy / generated dirs)
// --------------------------------------------------------------------------

const SKIP_DIRS = new Set([
  'node_modules', '.git', 'dist', 'build', 'coverage', 'public',
  'attached_assets', 'phase-17d-reports', 'sim_output', 'test-results',
  'audit_reports', 'android', 'migrations',
]);

function walk(dir: string, exts: string[]): string[] {
  const out: string[] = [];
  if (!fs.existsSync(dir)) return out;
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const e of entries) {
    if (SKIP_DIRS.has(e.name)) continue;
    if (e.name.startsWith('.')) continue;
    const full = path.join(dir, e.name);
    if (e.isDirectory()) {
      out.push(...walk(full, exts));
    } else if (e.isFile()) {
      if (exts.some((x) => e.name.endsWith(x))) out.push(full);
    }
  }
  return out;
}

function relRoot(p: string): string {
  return path.relative(ROOT, p).replace(/\\/g, '/');
}

function readSafe(file: string): string {
  try { return fs.readFileSync(file, 'utf8'); } catch { return ''; }
}

function lineOf(text: string, idx: number): number {
  let line = 1;
  for (let i = 0; i < idx && i < text.length; i++) if (text[i] === '\n') line++;
  return line;
}

// --------------------------------------------------------------------------
// Action record shape
// --------------------------------------------------------------------------

type Status =
  | 'WIRED'
  | 'PARTIAL'
  | 'UI_ONLY'
  | 'BACKEND_ONLY'
  | 'REGISTERED_NOT_EXECUTABLE'
  | 'MUTATES_WITHOUT_NOTIFICATION'
  | 'MISSING_RBAC'
  | 'MISSING_ZOD'
  | 'MISSING_WORKSPACE_SCOPE'
  | 'MISSING_AUDIT'
  | 'MISSING_TRANSACTION'
  | 'SILENT_FAILURE_RISK'
  | 'DUPLICATE_ACTION'
  | 'DEAD_OR_LEGACY';

type SourceType = 'ui' | 'api' | 'trinity' | 'automation' | 'websocket' | 'sms' | 'email' | 'voice' | 'webhook' | 'cron';

type MutationKind =
  | 'create' | 'read' | 'update' | 'delete'
  | 'publish' | 'send' | 'approve' | 'reject'
  | 'generate' | 'export' | 'import' | 'retry'
  | 'unknown';

interface ActionRecord {
  actionId: string;
  domain: string;
  sourceType: SourceType;
  label: string;
  description: string;

  frontend?: {
    files: string[];
    handler?: string;
    hook?: string;             // useMutation | useQuery | none
    method?: string;           // GET POST PATCH PUT DELETE
    endpoint?: string;
  };

  backend?: {
    method: string;
    endpoint: string;          // best-effort full mounted path
    routeFile: string;
    line: number;
    mountPrefix: string | null;
    middleware: string[];      // requireAuth, ensureWorkspaceAccess, etc.
    rbac: string[];            // requireRole, requirePlatformStaff, etc.
    workspaceScoped: boolean | 'unknown';
    zodValidated: boolean | 'unknown';
    services: string[];        // imported service modules referenced
    dbWrites: string[];        // table identifiers (best-effort)
    dbReads: string[];         // table identifiers (best-effort)
    notificationCalls: string[]; // sendSMS, sendCanSpamCompliantEmail, broadcast..., NotificationDeliveryService
    auditCalls: string[];      // logActionAudit, auditLogger, audit_logs
    transactional: boolean;    // db.transaction wrap
  };

  trinity?: {
    actionRegistryFile: string;
    line: number;
    auditWrapped: boolean;
    requiresApproval: boolean; // requireDeliberationConsensus / requiresFinancialApproval
    serviceCalls: string[];
  };

  mutationType: MutationKind;
  notificationSent: boolean | 'unknown';
  auditWritten: boolean | 'unknown';
  eventEmitted: boolean | 'unknown';
  legalGate: boolean;

  status: Status[];
  notes: string[];
}

// --------------------------------------------------------------------------
// Heuristics — keep regexes conservative and well-commented
// --------------------------------------------------------------------------

const HTTP_METHODS = ['get', 'post', 'put', 'patch', 'delete', 'options'] as const;

// Backend route definition, e.g. router.post('/employees', requireAuth, handler)
const ROUTE_RE = new RegExp(
  '\\b(?:router|app)\\s*\\.\\s*(' + HTTP_METHODS.join('|') + ')\\s*\\(\\s*[\'"`]([^\'"`]+)[\'"`]([^)]{0,2000}?)\\)',
  'g',
);

// Mount declarations, e.g. app.use("/api/employees", requireAuth, ensureWorkspaceAccess, employeeRouter)
const MOUNT_RE = /\bapp\s*\.\s*use\s*\(\s*['"`]([^'"`]+)['"`]\s*,([^)]{0,1000})\)/g;

// Frontend API calls — apiRequest('POST', '/api/...') and fetch('/api/...', { method: 'POST' })
const API_REQUEST_RE = /\bapiRequest\s*\(\s*['"`]([A-Z]+)['"`]\s*,\s*['"`]([^'"`]+)['"`]/g;
const FETCH_RE = /\bfetch\s*\(\s*['"`](\/api\/[^'"`]+)['"`](?:\s*,\s*\{([^}]{0,300})\})?/g;
// useQuery({ queryKey: ['/api/foo', ...] }) — the first element is the URL.
// We treat these as implicit GET calls (TanStack default fetcher).
const USE_QUERY_RE = /\buseQuery\b\s*[<({][^)]{0,400}?queryKey\s*:\s*\[\s*['"`](\/api\/[^'"`]+)['"`]/g;
const QC_INVALIDATE_RE = /queryClient\s*\.\s*(?:invalidateQueries|setQueryData|prefetchQuery)\s*\(\s*\{?\s*queryKey?\s*:?\s*\[\s*['"`]([^'"`]+)['"`]/g;

// Trinity action registry
const ACTION_ID_RE = /actionId\s*:\s*['"`]([a-zA-Z0-9_.\-:/]+)['"`]/g;
const REGISTER_ACTION_RE = /helpaiOrchestrator\s*\.\s*registerAction\s*\(\s*([^)]{0,200})\)/g;

// Websocket
// Match: ws.on('msg'), socket.on('msg'), wss.on('connection'),
// platformEventBus.on('event'), ChatServerHub.on('event'), etc.
const WS_ON_RE = /\b(?:ws|wss|socket|io|platformEventBus|ChatServerHub|chatServerHub|MessageBridge|messageBridge|eventBus|trinityEventBus)\s*\.\s*on\s*\(\s*['"`]([^'"`]+)['"`]/g;
// Match: socket.emit('e'), io.emit('e'), io.to(x).emit('e'), wss.broadcast.emit('e'),
// ChatServerHub.emit({ ... }) — for object-form, capture is left blank.
// Also match platformEventBus.emit('e', ...).
const WS_EMIT_RE = /\b(?:ws|wss|socket|io|platformEventBus|ChatServerHub|chatServerHub|MessageBridge|messageBridge|eventBus|trinityEventBus)\s*\.\s*(?:emit|broadcast\s*\.\s*emit)\s*\(\s*['"`]([^'"`]+)['"`]/g;
// Named ChatServerHub helpers (emitMessagePosted, emitUserJoinedRoom, etc.)
const WS_EMIT_NAMED_RE = /\b(?:ChatServerHub|chatServerHub|platformEventBus)\s*\.\s*(emit[A-Z]\w+)\s*\(/g;

// Auth / RBAC middleware names — anything in the route arg list that matches
const AUTH_MIDDLEWARE_NAMES = [
  'requireAuth', 'requireAuthenticated', 'isAuthenticated',
  'ensureWorkspaceAccess', 'ensureWorkspaceMember', 'verifyWorkspaceAccess',
  'requireWorkspaceMember',
  'requireOrgOwner', 'requireOrgAdmin', 'requireManager', 'requireDepartmentManager',
  'requireSupervisor', 'requirePlatformStaff', 'requirePlatformAdmin',
  'requireAuditor', 'requireRole', 'requireOneOfRoles',
  'requireLegalAcceptance', 'requireOnboardingComplete',
  'requireFinanceManager', 'requirePayrollAccess',
  'csrfProtection', 'rateLimitMiddleware',
];
const AUTH_RE = new RegExp('\\b(' + AUTH_MIDDLEWARE_NAMES.join('|') + ')\\b', 'g');

// Zod usage — schema.parse / safeParse
const ZOD_RE = /\b(?:[a-zA-Z_][a-zA-Z0-9_]*Schema|insert[A-Z]\w+|z\.object\([^)]+\))\s*\.\s*(?:parse|safeParse)\s*\(/;

// Notification primitives (bound to NotificationDeliveryService discipline)
const NOTIF_NAMES = [
  'NotificationDeliveryService', 'universalNotificationEngine',
  'sendCanSpamCompliantEmail', 'emailCore.send', 'sendSMS', 'smsService.send',
  'sendPushToUser', 'pushNotificationService', 'aiNotificationService',
  'notificationDeliveryService', 'notifyUser', 'notifyManager',
  'broadcastShiftUpdate', 'broadcastToWorkspace', 'broadcastToRoom',
  'io.to(', 'io.emit(', 'wss.clients',
];
const NOTIF_RE = new RegExp('(' + NOTIF_NAMES.map((n) => n.replace(/[.()]/g, '\\$&')).join('|') + ')');

// Audit primitives
const AUDIT_NAMES = [
  'logActionAudit', 'auditLogger', 'auditLog', 'audit_logs',
  'AuditService', 'recordAudit', 'recordDeliberation',
  'logAdminEvent', 'platformStaffAudit',
];
const AUDIT_RE = new RegExp('(' + AUDIT_NAMES.join('|') + ')');

// DB writes — db.insert / db.update / db.delete
const DB_INSERT_RE = /\bdb\s*\.\s*insert\s*\(\s*([a-zA-Z_][a-zA-Z0-9_]*)\s*\)/g;
const DB_UPDATE_RE = /\bdb\s*\.\s*update\s*\(\s*([a-zA-Z_][a-zA-Z0-9_]*)\s*\)/g;
const DB_DELETE_RE = /\bdb\s*\.\s*delete\s*\(\s*([a-zA-Z_][a-zA-Z0-9_]*)\s*\)/g;
const DB_SELECT_FROM_RE = /\bdb\s*\.\s*select\s*\([^)]*\)\s*\.\s*from\s*\(\s*([a-zA-Z_][a-zA-Z0-9_]*)\s*\)/g;
const DB_TX_RE = /\bdb\s*\.\s*transaction\s*\(/;

// Service module imports — anything imported from ../services/*
const SERVICE_IMPORT_RE = /from\s+['"`]([^'"`]*services\/[^'"`]+)['"`]/g;

// Mutation kind classifier
function inferMutationKind(method: string, endpoint: string, handlerSrc: string): MutationKind {
  const m = method.toUpperCase();
  const ep = endpoint.toLowerCase();
  if (m === 'GET') {
    if (/\bexport|\bdownload|\bpdf|\btoken|\bsigned-url/.test(ep)) return 'export';
    return 'read';
  }
  if (m === 'DELETE') return 'delete';
  if (m === 'PUT' || m === 'PATCH') return 'update';
  if (m === 'POST') {
    if (/\bpublish/.test(ep)) return 'publish';
    if (/\bsend/.test(ep)) return 'send';
    if (/\bapprov/.test(ep)) return 'approve';
    if (/\breject|deny/.test(ep)) return 'reject';
    if (/\bgenerate/.test(ep)) return 'generate';
    if (/\bimport/.test(ep)) return 'import';
    if (/\bretry|\brerun/.test(ep)) return 'retry';
    if (/\b(create|new|add)\b/.test(ep)) return 'create';
    if (/\b(update|edit)\b/.test(ep)) return 'update';
    return 'create';
  }
  return 'unknown';
}

function inferDomain(endpoint: string, file: string): string {
  const ep = endpoint.toLowerCase();
  const f = file.toLowerCase();
  const pairs: Array<[RegExp, string]> = [
    [/schedul|\bshift|\bcoverage|trinity-staffing|post-orders/, 'scheduling'],
    [/chat|broadcast|chatdock|message|chatroom/, 'chat'],
    [/notification|notify/, 'notifications'],
    [/payroll|paystub|paycheck/, 'payroll'],
    [/invoice|billing|payment|subscription|stripe/, 'billing'],
    [/employee|contractor|hr\b/, 'employees'],
    [/client\b|customer/, 'clients'],
    [/document|vault|pdf|file-upload|signed-url/, 'documents'],
    [/email|inbox|inbound|outbound/, 'email'],
    [/sms|text/, 'sms'],
    [/voice|twilio|trinity-voice/, 'voice'],
    [/webhook/, 'webhooks'],
    [/auth|login|session|password|onboarding/, 'auth'],
    [/admin|platform|workspace-detail|security/, 'admin'],
    [/automation|workflow|pipeline/, 'automation'],
    [/audit/, 'audit'],
    [/compliance|legal|consent/, 'compliance'],
    [/ats|applicant|interview|hiring/, 'hiring'],
    [/training|certification/, 'training'],
    [/sales|crm|lead/, 'sales'],
    [/support|helpdesk|ticket|helpai/, 'support'],
    [/finance|tax|expense|reimburs/, 'finance'],
    [/ai-brain|ai\/|trinity\b/, 'trinity'],
  ];
  for (const [re, dom] of pairs) {
    if (re.test(ep) || re.test(f)) return dom;
  }
  return 'other';
}

// --------------------------------------------------------------------------
// 1) Backend: build a (file -> mountPrefix) lookup by scanning routes.ts and
//    server/routes/domains/*.ts for `app.use('/api/x', ..., importedRouter)`
// --------------------------------------------------------------------------

interface MountInfo {
  prefix: string;
  middleware: string[];
}

function buildMountTable(): Map<string, MountInfo[]> {
  // Map from imported router *symbol name* -> list of mount declarations.
  const symbolToMounts = new Map<string, MountInfo[]>();
  // Map from absolute route file path -> list of mounts that pull it in.
  const fileToMounts = new Map<string, MountInfo[]>();

  const allRouteFiles = walk(path.join(ROOT, 'server', 'routes'), ['.ts']);

  // Build a fallback index from filename -> list of identifiers that file
  // exports (default + named). Used when a mount uses a symbol that only
  // appears via `await import(...)` (dynamic import) or some other indirect
  // binding the static import scanner can't see.
  //   key = identifier name (e.g. `securityAdminRouter`)
  //   val = absolute file path that exports it
  const exportSymbolToFile = new Map<string, string>();
  for (const f of allRouteFiles) {
    const src = readSafe(f);
    if (!src) continue;
    const exDefault = src.match(/export\s+default\s+(?:function\s+)?([a-zA-Z_][a-zA-Z0-9_]*)/);
    if (exDefault) exportSymbolToFile.set(exDefault[1], f);
    // export const Foo / export function Foo / export { Foo }
    const reA = /export\s+(?:const|let|var|function|class)\s+([a-zA-Z_][a-zA-Z0-9_]*)/g;
    let m: RegExpExecArray | null;
    while ((m = reA.exec(src)) !== null) exportSymbolToFile.set(m[1], f);
    const reB = /export\s*\{([^}]+)\}/g;
    while ((m = reB.exec(src)) !== null) {
      for (const part of m[1].split(',')) {
        const t = part.trim().split(/\s+as\s+/);
        const id = (t[1] || t[0]).trim();
        if (/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(id)) exportSymbolToFile.set(id, f);
      }
    }
  }

  const mounters = [
    path.join(ROOT, 'server', 'routes.ts'),
    ...walk(path.join(ROOT, 'server', 'routes', 'domains'), ['.ts']),
    ...allRouteFiles,
  ];
  const seen = new Set<string>();
  for (const f of mounters) {
    if (seen.has(f)) continue;
    seen.add(f);
    const src = readSafe(f);
    if (!src) continue;

    // Build import-symbol -> resolved file path for this mounter (static imports)
    const importToFile = new Map<string, string>();
    const importLineRe = /import\s+(?:([a-zA-Z_][a-zA-Z0-9_]*)|\{([^}]+)\})\s+from\s+['"`]([^'"`]+)['"`]/g;
    let im: RegExpExecArray | null;
    while ((im = importLineRe.exec(src)) !== null) {
      const importSpec = im[3];
      const def = im[1];
      const named = im[2];
      const resolved = resolveImportPath(f, importSpec);
      if (!resolved) continue;
      if (def) importToFile.set(def, resolved);
      if (named) {
        for (const part of named.split(',')) {
          const m = part.trim().match(/^(\w+)(?:\s+as\s+(\w+))?$/);
          if (!m) continue;
          const local = m[2] || m[1];
          importToFile.set(local, resolved);
        }
      }
    }

    // Also pick up dynamic imports inside this file:
    //   const { securityAdminRouter } = await import('./routes/securityAdminRoutes');
    //   const fooRouter = (await import('./fooRoutes')).default;
    const dynRe = /(?:const|let|var)\s+(?:\{\s*([^}]+)\s*\}|([a-zA-Z_][a-zA-Z0-9_]*))\s*=\s*\(?\s*await\s+import\s*\(\s*['"`]([^'"`]+)['"`]/g;
    while ((im = dynRe.exec(src)) !== null) {
      const named = im[1];
      const def = im[2];
      const importSpec = im[3];
      const resolved = resolveImportPath(f, importSpec);
      if (!resolved) continue;
      if (def) importToFile.set(def, resolved);
      if (named) {
        for (const part of named.split(',')) {
          const m = part.trim().match(/^(\w+)(?:\s*:\s*(\w+))?$/);
          if (!m) continue;
          const local = m[2] || m[1];
          importToFile.set(local, resolved);
        }
      }
    }

    let mm: RegExpExecArray | null;
    MOUNT_RE.lastIndex = 0;
    while ((mm = MOUNT_RE.exec(src)) !== null) {
      const prefix = mm[1];
      const args = mm[2];
      const argTokens = args.split(',').map((s) => s.trim()).filter(Boolean);
      if (argTokens.length === 0) continue;
      const last = argTokens[argTokens.length - 1].replace(/[^A-Za-z0-9_]/g, '');
      const mw = argTokens.slice(0, -1).map((s) => s.replace(/[^A-Za-z0-9_]/g, '')).filter(Boolean);
      const info: MountInfo = { prefix, middleware: mw };
      const existing = symbolToMounts.get(last) || [];
      existing.push(info);
      symbolToMounts.set(last, existing);

      // Resolve symbol -> file: prefer this file's own static/dynamic imports,
      // fall back to global export index.
      const target = importToFile.get(last) || exportSymbolToFile.get(last);
      if (target) {
        const existing2 = fileToMounts.get(target) || [];
        existing2.push(info);
        fileToMounts.set(target, existing2);
      }
    }
  }

  return fileToMounts;
}

function resolveImportPath(fromFile: string, spec: string): string | null {
  if (!spec.startsWith('.')) return null;
  const base = path.resolve(path.dirname(fromFile), spec);
  const cands = [base, base + '.ts', base + '.tsx', path.join(base, 'index.ts')];
  for (const c of cands) {
    if (fs.existsSync(c) && fs.statSync(c).isFile()) return c;
  }
  return null;
}

// --------------------------------------------------------------------------
// 2) Backend: scan every route file for router.METHOD(...) declarations.
// --------------------------------------------------------------------------

function scanBackendRoutes(mountTable: Map<string, MountInfo[]>): ActionRecord[] {
  const records: ActionRecord[] = [];
  const routeFiles = [
    ...walk(path.join(ROOT, 'server', 'routes'), ['.ts']),
    path.join(ROOT, 'server', 'routes.ts'),
  ];
  const seen = new Set<string>();
  for (const file of routeFiles) {
    if (seen.has(file)) continue;
    seen.add(file);
    const src = readSafe(file);
    if (!src) continue;
    const fileHasZod = ZOD_RE.test(src);
    const fileHasNotif = NOTIF_RE.test(src);
    const fileHasAudit = AUDIT_RE.test(src);
    const fileHasTx = DB_TX_RE.test(src);
    const fileHasWorkspace = /\bworkspaceId\b/.test(src);
    const services = extractServices(src);

    const dbWrites = collectAll(src, DB_INSERT_RE, DB_UPDATE_RE, DB_DELETE_RE);
    const dbReads = collectAll(src, DB_SELECT_FROM_RE);

    const mounts = mountTable.get(file) || [];
    let routeMatch: RegExpExecArray | null;
    ROUTE_RE.lastIndex = 0;
    while ((routeMatch = ROUTE_RE.exec(src)) !== null) {
      const method = routeMatch[1].toUpperCase();
      const endpoint = routeMatch[2];
      const argsTail = routeMatch[3] || '';
      const idx = routeMatch.index;
      const line = lineOf(src, idx);

      // Determine middleware on this route call (between path and handler)
      const middleware: string[] = [];
      let mAuth: RegExpExecArray | null;
      AUTH_RE.lastIndex = 0;
      while ((mAuth = AUTH_RE.exec(argsTail)) !== null) middleware.push(mAuth[1]);

      // Mount-level middleware comes from the mount table; combine.
      for (const mt of mounts) middleware.push(...mt.middleware);

      const fullPath = mounts.length > 0
        ? mounts.map((m) => normalizeJoin(m.prefix, endpoint)).join(' | ')
        : endpoint;

      const mountPrefix = mounts.length > 0 ? mounts.map((m) => m.prefix).join(' | ') : null;

      const dedupedMW = Array.from(new Set(middleware));
      const rbac = dedupedMW.filter((m) => /role|manager|admin|owner|platform|auditor|finance|payroll/i.test(m));
      const workspaceScoped = dedupedMW.some((m) => /workspace/i.test(m)) || /\bworkspaceId\b/.test(argsTail);

      const status: Status[] = [];
      if (method !== 'GET' && rbac.length === 0 && !dedupedMW.includes('requireAuth')) {
        status.push('MISSING_RBAC');
      }
      if (method !== 'GET' && !fileHasZod) status.push('MISSING_ZOD');
      if (method !== 'GET' && !workspaceScoped && !fileHasWorkspace) status.push('MISSING_WORKSPACE_SCOPE');
      if (method !== 'GET' && !fileHasAudit) status.push('MISSING_AUDIT');
      if (method !== 'GET' && (dbWrites.size > 1) && !fileHasTx) status.push('MISSING_TRANSACTION');

      const mutationType = inferMutationKind(method, endpoint, argsTail);
      const domain = inferDomain(endpoint, file);

      const actionId = `api:${method.toLowerCase()}:${normalizeJoin(mountPrefix?.split(' | ')[0] || '', endpoint)}`;

      records.push({
        actionId,
        domain,
        sourceType: file.toLowerCase().includes('webhook') ? 'webhook' : 'api',
        label: `${method} ${normalizeJoin(mountPrefix?.split(' | ')[0] || '', endpoint)}`,
        description: `Backend route ${method} ${endpoint} declared in ${relRoot(file)}:${line}`,
        backend: {
          method,
          endpoint: normalizeJoin(mountPrefix?.split(' | ')[0] || '', endpoint),
          routeFile: relRoot(file),
          line,
          mountPrefix,
          middleware: dedupedMW,
          rbac,
          workspaceScoped: workspaceScoped || (mounts.length === 0 ? 'unknown' : false),
          zodValidated: fileHasZod ? true : 'unknown',
          services,
          dbWrites: Array.from(dbWrites),
          dbReads: Array.from(dbReads),
          notificationCalls: fileHasNotif ? scanCalls(src, NOTIF_RE) : [],
          auditCalls: fileHasAudit ? scanCalls(src, AUDIT_RE) : [],
          transactional: fileHasTx,
        },
        mutationType,
        notificationSent: fileHasNotif ? true : 'unknown',
        auditWritten: fileHasAudit ? true : 'unknown',
        eventEmitted: 'unknown',
        legalGate: /requireLegalAcceptance|legalGate|dutyOfCare/.test(src),
        status,
        notes: mounts.length === 0
          ? ['Route file not detected in mount table — full mount path is approximate.']
          : [],
      });
    }
  }
  return records;
}

function normalizeJoin(prefix: string, endpoint: string): string {
  const p = prefix.replace(/\/$/, '');
  const e = endpoint.startsWith('/') ? endpoint : '/' + endpoint;
  return p + e;
}

function collectAll(src: string, ...regexes: RegExp[]): Set<string> {
  const out = new Set<string>();
  for (const re of regexes) {
    const r = new RegExp(re.source, re.flags.includes('g') ? re.flags : re.flags + 'g');
    let m: RegExpExecArray | null;
    while ((m = r.exec(src)) !== null) out.add(m[1]);
  }
  return out;
}

function scanCalls(src: string, re: RegExp): string[] {
  const r = new RegExp(re.source, 'g');
  const out = new Set<string>();
  let m: RegExpExecArray | null;
  while ((m = r.exec(src)) !== null) out.add(m[1]);
  return Array.from(out);
}

function extractServices(src: string): string[] {
  const out = new Set<string>();
  let m: RegExpExecArray | null;
  SERVICE_IMPORT_RE.lastIndex = 0;
  while ((m = SERVICE_IMPORT_RE.exec(src)) !== null) {
    out.add(m[1]);
  }
  return Array.from(out);
}

// --------------------------------------------------------------------------
// 3) Frontend scan — apiRequest / fetch / mutation callsites
// --------------------------------------------------------------------------

interface FrontendCall {
  file: string;
  line: number;
  method: string;
  endpoint: string;
  hook: 'useMutation' | 'useQuery' | 'inline';
  context: string; // surrounding function name or component name (best-effort)
}

function scanFrontend(): FrontendCall[] {
  const out: FrontendCall[] = [];
  const dirs = [
    path.join(ROOT, 'client', 'src', 'pages'),
    path.join(ROOT, 'client', 'src', 'components'),
    path.join(ROOT, 'client', 'src', 'hooks'),
    path.join(ROOT, 'client', 'src', 'lib'),
  ];
  const files = dirs.flatMap((d) => walk(d, ['.ts', '.tsx']));
  for (const f of files) {
    const src = readSafe(f);
    if (!src) continue;

    // apiRequest('METHOD', '/api/...')
    let m: RegExpExecArray | null;
    API_REQUEST_RE.lastIndex = 0;
    while ((m = API_REQUEST_RE.exec(src)) !== null) {
      const idx = m.index;
      out.push({
        file: relRoot(f),
        line: lineOf(src, idx),
        method: m[1].toUpperCase(),
        endpoint: m[2],
        hook: detectHook(src, idx),
        context: detectEnclosingName(src, idx),
      });
    }

    // fetch('/api/...', { method: 'POST' })
    FETCH_RE.lastIndex = 0;
    while ((m = FETCH_RE.exec(src)) !== null) {
      const idx = m.index;
      const url = m[1];
      const opts = m[2] || '';
      const methodMatch = opts.match(/method\s*:\s*['"`]([A-Z]+)['"`]/);
      out.push({
        file: relRoot(f),
        line: lineOf(src, idx),
        method: (methodMatch?.[1] || 'GET').toUpperCase(),
        endpoint: url,
        hook: detectHook(src, idx),
        context: detectEnclosingName(src, idx),
      });
    }

    // useQuery({ queryKey: ['/api/foo'] }) — implicit GET
    USE_QUERY_RE.lastIndex = 0;
    while ((m = USE_QUERY_RE.exec(src)) !== null) {
      out.push({
        file: relRoot(f),
        line: lineOf(src, m.index),
        method: 'GET',
        endpoint: m[1],
        hook: 'useQuery',
        context: detectEnclosingName(src, m.index),
      });
    }
  }
  return out;
}

function detectHook(src: string, idx: number): 'useMutation' | 'useQuery' | 'inline' {
  // Look back a few hundred chars for the nearest hook keyword
  const start = Math.max(0, idx - 600);
  const window = src.slice(start, idx);
  const lastMut = window.lastIndexOf('useMutation');
  const lastQ = window.lastIndexOf('useQuery');
  if (lastMut === -1 && lastQ === -1) return 'inline';
  return lastMut > lastQ ? 'useMutation' : 'useQuery';
}

function detectEnclosingName(src: string, idx: number): string {
  // Look back for nearest `const Foo = ...`, `function Foo(`, or `Foo: useMutation({`
  const start = Math.max(0, idx - 800);
  const window = src.slice(start, idx);
  const re = /\b(?:const|function|let|var)\s+([A-Z][A-Za-z0-9_]+|[a-z][A-Za-z0-9_]+Mutation|[a-z][A-Za-z0-9_]+Query|[a-z][A-Za-z0-9_]+Handler)\b/g;
  let last = '';
  let m: RegExpExecArray | null;
  while ((m = re.exec(window)) !== null) last = m[1];
  return last;
}

// --------------------------------------------------------------------------
// 4) Trinity action registry scan
// --------------------------------------------------------------------------

interface TrinityAction {
  actionId: string;
  file: string;
  line: number;
  registered: boolean;
  auditWrapped: boolean;
  requiresApproval: boolean;
  domain: string;
  serviceCalls: string[];
}

function scanTrinityActions(): TrinityAction[] {
  // Primary registry + any sub-registries like trinityTrainingSessionActions
  const candidates: string[] = [];
  candidates.push(path.join(ROOT, 'server', 'services', 'ai-brain', 'actionRegistry.ts'));
  for (const f of walk(path.join(ROOT, 'server', 'services', 'ai-brain'), ['.ts'])) {
    if (/Actions?\.ts$/.test(f) || /actionRegistry/.test(f)) candidates.push(f);
  }
  // Also pick up shiftTradingRoutes.registerShiftTradingActions style
  for (const f of walk(path.join(ROOT, 'server', 'routes'), ['.ts'])) {
    const src = readSafe(f);
    if (/registerAction\(/.test(src) && /actionId\s*:/.test(src)) candidates.push(f);
  }
  const out: TrinityAction[] = [];
  const seen = new Set<string>();
  for (const file of candidates) {
    if (seen.has(file)) continue;
    seen.add(file);
    const src = readSafe(file);
    if (!src) continue;

    // Find all registerAction(...) blocks; for each, capture the var name and
    // search for the actionId near its definition.
    const idLines: Array<{ id: string; idx: number }> = [];
    let m: RegExpExecArray | null;
    ACTION_ID_RE.lastIndex = 0;
    while ((m = ACTION_ID_RE.exec(src)) !== null) {
      idLines.push({ id: m[1], idx: m.index });
    }

    // Look for registerAction wrappers. We treat any actionId literal as a
    // candidate, then check whether its enclosing `const X: ActionHandler` is
    // referenced in a registerAction call somewhere in the file.
    const regCalls = new Set<string>();
    REGISTER_ACTION_RE.lastIndex = 0;
    while ((m = REGISTER_ACTION_RE.exec(src)) !== null) {
      // Capture identifier inside the call
      const arg = m[1];
      const idMatch = arg.match(/(?:withAuditWrap\s*\(\s*)?([a-zA-Z_][a-zA-Z0-9_]*)/);
      if (idMatch) regCalls.add(idMatch[1]);
    }

    for (const il of idLines) {
      // Find enclosing const/var name
      const before = src.slice(Math.max(0, il.idx - 600), il.idx);
      const nm = before.match(/(?:const|let|var)\s+([a-zA-Z_][a-zA-Z0-9_]*)\s*:/g);
      let varName = '';
      if (nm && nm.length > 0) {
        const last = nm[nm.length - 1];
        varName = last.replace(/^(?:const|let|var)\s+/, '').replace(/\s*:.*/, '');
      }
      // Audit wrap detection — withAuditWrap on this var, or the file declares
      // explicit audit inside (registerAction(createShift); // explicit audit ...)
      const wrapRe = new RegExp(`withAuditWrap\\(\\s*${varName}\\b|registerAction\\(\\s*${varName}\\)\\s*;\\s*//\\s*explicit audit`);
      const auditWrapped = !!varName && wrapRe.test(src);
      const registered = !!varName && regCalls.has(varName);
      const requiresApproval = /requireDeliberationConsensus|requiresFinancialApproval|approvalRequestService/.test(src);

      out.push({
        actionId: il.id,
        file: relRoot(file),
        line: lineOf(src, il.idx),
        registered,
        auditWrapped,
        requiresApproval,
        domain: il.id.split('.')[0] || 'trinity',
        serviceCalls: extractServices(src).slice(0, 12),
      });
    }
  }
  return out;
}

// --------------------------------------------------------------------------
// 5) Websocket & automation
// --------------------------------------------------------------------------

interface WsAction {
  event: string;
  file: string;
  line: number;
  kind: 'on' | 'emit';
}

function scanWebsocket(): WsAction[] {
  const out: WsAction[] = [];
  const files = [
    path.join(ROOT, 'server', 'websocket.ts'),
    ...walk(path.join(ROOT, 'server', 'services'), ['.ts']).filter((f) =>
      /websocket|chatServer|chatServerHub|broadcast|ChatHub|MessageBridge|eventBus/i.test(f),
    ),
    ...walk(path.join(ROOT, 'server', 'routes'), ['.ts']).filter((f) =>
      /broadcast|chat|websocket/i.test(f),
    ),
  ];
  const seen = new Set<string>();
  for (const f of files) {
    if (seen.has(f)) continue;
    seen.add(f);
    const src = readSafe(f);
    if (!src) continue;
    let m: RegExpExecArray | null;
    WS_ON_RE.lastIndex = 0;
    while ((m = WS_ON_RE.exec(src)) !== null) {
      out.push({ event: m[1], file: relRoot(f), line: lineOf(src, m.index), kind: 'on' });
    }
    WS_EMIT_RE.lastIndex = 0;
    while ((m = WS_EMIT_RE.exec(src)) !== null) {
      out.push({ event: m[1], file: relRoot(f), line: lineOf(src, m.index), kind: 'emit' });
    }
    WS_EMIT_NAMED_RE.lastIndex = 0;
    while ((m = WS_EMIT_NAMED_RE.exec(src)) !== null) {
      // Named helpers (emitMessagePosted etc.) — record the helper name as event.
      out.push({ event: m[1], file: relRoot(f), line: lineOf(src, m.index), kind: 'emit' });
    }
  }
  return out;
}

interface AutomationAction {
  source: string;
  file: string;
  line: number;
  kind: string;
}

function scanAutomation(): AutomationAction[] {
  const out: AutomationAction[] = [];
  const candidates = [
    'server/services/automationEventsService.ts',
    'server/services/automation/automationExecutionTracker.ts',
    'server/services/automation/workflowLedger.ts',
    'server/services/automation-engine.ts',
    'server/services/autonomousScheduler.ts',
    'server/services/autonomousWorkflowService.ts',
    'server/services/automationGovernanceService.ts',
  ].map((p) => path.join(ROOT, p));

  // Add any cron registrations
  for (const f of walk(path.join(ROOT, 'server'), ['.ts'])) {
    const src = readSafe(f);
    if (!src) continue;
    if (/(node-cron|cron\.schedule|setInterval\(.*60.*1000)/.test(src)) candidates.push(f);
  }
  const seen = new Set<string>();
  for (const file of candidates) {
    if (seen.has(file) || !fs.existsSync(file)) continue;
    seen.add(file);
    const src = readSafe(file);
    let m: RegExpExecArray | null;

    // emit / publish / dispatch event
    const eventRe = /\.(emit|publish|dispatch|trigger|fire)\s*\(\s*['"`]([^'"`]+)['"`]/g;
    while ((m = eventRe.exec(src)) !== null) {
      out.push({ source: m[2], file: relRoot(file), line: lineOf(src, m.index), kind: `automation.${m[1]}` });
    }

    // cron.schedule('* * * * *', ...)
    const cronRe = /cron\.schedule\s*\(\s*['"`]([^'"`]+)['"`]/g;
    while ((m = cronRe.exec(src)) !== null) {
      out.push({ source: m[1], file: relRoot(file), line: lineOf(src, m.index), kind: 'cron' });
    }
  }
  return out;
}

// --------------------------------------------------------------------------
// 6) Cross-link UI -> backend
// --------------------------------------------------------------------------

function crossLink(
  ui: FrontendCall[],
  backend: ActionRecord[],
): { records: ActionRecord[]; uiOnly: FrontendCall[]; backendOnly: ActionRecord[] } {
  // Index backend by (METHOD, endpoint pattern) for naive matching.
  const records: ActionRecord[] = [];
  const usedBackend = new Set<number>();
  const uiOnly: FrontendCall[] = [];

  for (const u of ui) {
    const ep = u.endpoint;
    const matches: number[] = [];
    backend.forEach((r, idx) => {
      if (!r.backend) return;
      if (r.backend.method !== u.method) return;
      if (matchesPath(ep, r.backend.endpoint)) matches.push(idx);
    });
    if (matches.length === 0) {
      uiOnly.push(u);
      const status: Status[] = ['UI_ONLY', 'SILENT_FAILURE_RISK'];
      records.push({
        actionId: `ui:${u.method.toLowerCase()}:${u.endpoint}`,
        domain: inferDomain(u.endpoint, u.file),
        sourceType: 'ui',
        label: `${u.method} ${u.endpoint}`,
        description: `Frontend call from ${u.file}:${u.line} (${u.context || u.hook}) — no matching backend route detected.`,
        frontend: {
          files: [u.file],
          handler: u.context,
          hook: u.hook,
          method: u.method,
          endpoint: u.endpoint,
        },
        mutationType: inferMutationKind(u.method, u.endpoint, ''),
        notificationSent: 'unknown',
        auditWritten: 'unknown',
        eventEmitted: 'unknown',
        legalGate: false,
        status,
        notes: ['No backend route matched this UI call. Could be a 404 silent-failure risk.'],
      });
      continue;
    }
    for (const idx of matches) usedBackend.add(idx);
    const r = backend[matches[0]];
    records.push({
      ...r,
      sourceType: 'ui',
      actionId: `wired:${r.backend!.method.toLowerCase()}:${r.backend!.endpoint}`,
      frontend: {
        files: [u.file],
        handler: u.context,
        hook: u.hook,
        method: u.method,
        endpoint: u.endpoint,
      },
      status: r.status.length > 0 ? ['PARTIAL', ...r.status] : ['WIRED'],
      notes: [
        `UI in ${u.file}:${u.line} -> backend ${r.backend!.routeFile}:${r.backend!.line}`,
        ...r.notes,
      ],
    });
  }
  const backendOnly = backend
    .map((r, i) => ({ r, i }))
    .filter(({ i }) => !usedBackend.has(i))
    .map(({ r }) => ({
      ...r,
      status: r.status.length > 0 ? ['BACKEND_ONLY', ...r.status] : ['BACKEND_ONLY'],
    } as ActionRecord));
  return { records: [...records, ...backendOnly], uiOnly, backendOnly };
}

function matchesPath(uiPath: string, backendPath: string): boolean {
  // backendPath uses :param and uiPath may use ${var}
  // Try several normalizations of the UI path; ANY match wins.
  const bareUi = uiPath.split('?')[0];
  const bareBe = backendPath.split('?')[0];
  // Variant 1: ${var} -> __P__ (treats interpolation as a path segment)
  const uA = bareUi.replace(/\$\{[^}]+\}/g, '__P__');
  // Variant 2: ${var} -> '' (treats interpolation as inline string concat,
  //                         e.g. `/api/foo${params}` where params is a query string)
  const uB = bareUi.replace(/\$\{[^}]+\}/g, '');
  // Variant 3: trailing `${var}` stripped along with any preceding `/`
  const uC = bareUi.replace(/\/?\$\{[^}]+\}\/?$/g, '');
  const b = bareBe.replace(/:[a-zA-Z_][a-zA-Z0-9_]*/g, '__P__');
  for (const u of [uA, uB, uC, bareUi]) {
    if (u === b || u === bareBe) return true;
    const us = u.split('/').filter(Boolean);
    const bs = b.split('/').filter(Boolean);
    if (us.length !== bs.length) continue;
    let ok = true;
    for (let i = 0; i < us.length; i++) {
      if (us[i] === bs[i]) continue;
      if (us[i] === '__P__' || bs[i] === '__P__') continue;
      ok = false;
      break;
    }
    if (ok) return true;
  }
  return false;
}

// --------------------------------------------------------------------------
// 7) Dedupe / risk roll-up
// --------------------------------------------------------------------------

function dedupeAndScore(records: ActionRecord[]): {
  records: ActionRecord[];
  duplicates: Array<{ actionId: string; count: number; locations: string[] }>;
} {
  const buckets = new Map<string, ActionRecord[]>();
  for (const r of records) {
    const key = `${r.sourceType}|${r.actionId}`;
    const b = buckets.get(key) || [];
    b.push(r);
    buckets.set(key, b);
  }
  const duplicates: Array<{ actionId: string; count: number; locations: string[] }> = [];
  const merged: ActionRecord[] = [];
  for (const [key, list] of buckets) {
    if (list.length === 1) {
      merged.push(list[0]);
      continue;
    }
    duplicates.push({
      actionId: key,
      count: list.length,
      locations: list.map((r) =>
        r.backend
          ? `${r.backend.routeFile}:${r.backend.line}`
          : r.frontend?.files.join(',') || '?'
      ),
    });
    const head: ActionRecord = {
      ...list[0],
      status: Array.from(new Set([...(list[0].status as Status[]), 'DUPLICATE_ACTION'])) as Status[],
      notes: [...list[0].notes, `Duplicate (${list.length} occurrences)`],
    };
    merged.push(head);
  }
  return { records: merged, duplicates };
}

// --------------------------------------------------------------------------
// 8) Markdown writer
// --------------------------------------------------------------------------

function asTable(headers: string[], rows: string[][]): string {
  const head = '| ' + headers.join(' | ') + ' |';
  const sep = '| ' + headers.map(() => '---').join(' | ') + ' |';
  const body = rows.map((r) => '| ' + r.map(escapeCell).join(' | ') + ' |').join('\n');
  return [head, sep, body].join('\n');
}

function escapeCell(s: string): string {
  return String(s ?? '').replace(/\|/g, '\\|').replace(/\n/g, ' ');
}

function buildMarkdown(
  records: ActionRecord[],
  trinity: TrinityAction[],
  ws: WsAction[],
  automation: AutomationAction[],
  duplicates: Array<{ actionId: string; count: number; locations: string[] }>,
): string {
  const total = records.length;
  const byStatus = new Map<string, number>();
  for (const r of records) for (const s of r.status) byStatus.set(s, (byStatus.get(s) || 0) + 1);

  const partial = records.filter((r) => r.status.includes('PARTIAL'));
  const uiOnly = records.filter((r) => r.status.includes('UI_ONLY'));
  const backendOnly = records.filter((r) => r.status.includes('BACKEND_ONLY'));
  const silent = records.filter((r) => r.status.includes('SILENT_FAILURE_RISK'));
  const noRbac = records.filter((r) => r.status.includes('MISSING_RBAC'));
  const noZod = records.filter((r) => r.status.includes('MISSING_ZOD'));
  const noWs = records.filter((r) => r.status.includes('MISSING_WORKSPACE_SCOPE'));
  const noAudit = records.filter((r) => r.status.includes('MISSING_AUDIT'));
  const noTx = records.filter((r) => r.status.includes('MISSING_TRANSACTION'));

  const fmtTop = (rs: ActionRecord[], n = 25) =>
    asTable(
      ['actionId', 'sourceType', 'domain', 'mutation', 'where', 'flags'],
      rs.slice(0, n).map((r) => [
        r.actionId,
        r.sourceType,
        r.domain,
        r.mutationType,
        r.backend
          ? `${r.backend.routeFile}:${r.backend.line}`
          : (r.frontend?.files[0] || '-'),
        r.status.join(','),
      ]),
    );

  const lines: string[] = [];
  lines.push('# CoAIleague — Action Wiring Manifest');
  lines.push('');
  lines.push('> **Generated:** ' + new Date().toISOString());
  lines.push('> **Generator:** `scripts/audit/generate-action-wiring-manifest.ts`');
  lines.push('> **Scope:** UI calls + backend routes + Trinity actionRegistry + websocket + automation/cron + webhooks');
  lines.push('');
  lines.push('## Method');
  lines.push('');
  lines.push('This is a **first-pass regex + import-graph** scan. It is _not_ a full AST');
  lines.push('audit — it produces enough citations (file + line) to verify each action');
  lines.push('chain by hand or with a follow-up tool. Where the scanner cannot prove a');
  lines.push('property, the field is `unknown`, never silently `false`. No silent passes.');
  lines.push('');
  lines.push('Action source types: ui · api · trinity · websocket · automation · webhook · cron');
  lines.push('');
  lines.push('## Scope counts');
  lines.push('');
  lines.push('- Total action records: **' + total + '**');
  lines.push('- Trinity registry actionId literals: **' + trinity.length + '**');
  lines.push('- WebSocket events (on + emit): **' + ws.length + '**');
  lines.push('- Automation/cron entries: **' + automation.length + '**');
  lines.push('- Duplicate actionIds: **' + duplicates.length + '**');
  lines.push('');
  lines.push('## Status roll-up');
  lines.push('');
  lines.push(asTable(['Status', 'Count'], Array.from(byStatus.entries()).sort((a, b) => b[1] - a[1]).map(([k, v]) => [k, String(v)])));
  lines.push('');

  lines.push('## Top 25 PARTIAL actions');
  lines.push('');
  lines.push(fmtTop(partial));
  lines.push('');

  lines.push('## Top 25 UI_ONLY (frontend calls without backend route)');
  lines.push('');
  lines.push(fmtTop(uiOnly));
  lines.push('');

  lines.push('## Top 25 BACKEND_ONLY (registered routes with no UI binding detected)');
  lines.push('');
  lines.push(fmtTop(backendOnly));
  lines.push('');

  lines.push('## Top 25 SILENT_FAILURE_RISK');
  lines.push('');
  lines.push(fmtTop(silent));
  lines.push('');

  lines.push('## Mutating actions missing RBAC');
  lines.push('');
  lines.push(fmtTop(noRbac));
  lines.push('');

  lines.push('## Mutating actions missing Zod');
  lines.push('');
  lines.push(fmtTop(noZod));
  lines.push('');

  lines.push('## Mutating actions missing workspace scope');
  lines.push('');
  lines.push(fmtTop(noWs));
  lines.push('');

  lines.push('## Mutating actions missing audit log');
  lines.push('');
  lines.push(fmtTop(noAudit));
  lines.push('');

  lines.push('## DB mutations outside transaction (multi-write routes)');
  lines.push('');
  lines.push(fmtTop(noTx));
  lines.push('');

  lines.push('## Duplicate actionIds');
  lines.push('');
  lines.push(asTable(['actionId', 'count', 'locations'], duplicates.slice(0, 50).map((d) => [d.actionId, String(d.count), d.locations.join(' / ')])));
  lines.push('');

  lines.push('## Trinity actionRegistry — actionIds detected');
  lines.push('');
  lines.push(asTable(
    ['actionId', 'registered', 'auditWrap', 'approvalGate', 'where'],
    trinity.slice(0, 100).map((t) => [t.actionId, String(t.registered), String(t.auditWrapped), String(t.requiresApproval), `${t.file}:${t.line}`]),
  ));
  if (trinity.length > 100) lines.push('\n_+ ' + (trinity.length - 100) + ' more actionIds — see `action-wiring-manifest.json`._');
  lines.push('');

  lines.push('## WebSocket events (sample)');
  lines.push('');
  lines.push(asTable(
    ['kind', 'event', 'where'],
    ws.slice(0, 100).map((w) => [w.kind, w.event, `${w.file}:${w.line}`]),
  ));
  if (ws.length > 100) lines.push('\n_+ ' + (ws.length - 100) + ' more — see JSON._');
  lines.push('');

  lines.push('## Automation / cron entries (sample)');
  lines.push('');
  lines.push(asTable(
    ['kind', 'source', 'where'],
    automation.slice(0, 100).map((a) => [a.kind, a.source, `${a.file}:${a.line}`]),
  ));
  if (automation.length > 100) lines.push('\n_+ ' + (automation.length - 100) + ' more — see JSON._');
  lines.push('');

  lines.push('## Caveats');
  lines.push('');
  lines.push('- Mount-path resolution uses an import-graph lookup. Routers mounted via dynamic dispatch or destructured re-exports may show `unknown` mount.');
  lines.push('- Auth/RBAC detection scans only the literal middleware names listed in the generator. Custom guards must be added to `AUTH_MIDDLEWARE_NAMES`.');
  lines.push('- Zod detection is per-file: a file with _any_ Zod parse passes the check. Per-route Zod proof requires AST.');
  lines.push('- DB writes are extracted from `db.insert/update/delete` literals only. ORM helpers and raw SQL templates may be missed.');
  lines.push('- Notification/audit/event emission is per-file presence, not per-route. Use the citations to confirm the call lives in the relevant handler.');
  lines.push('');
  lines.push('## Next steps');
  lines.push('');
  lines.push('1. Run `npx tsx scripts/audit/check-action-wiring-gaps.ts` for a focused gap report.');
  lines.push('2. Walk the highest-risk lists in this file; verify each citation by hand.');
  lines.push('3. For each PARTIAL/UI_ONLY/BACKEND_ONLY entry, decide: wire it, delete it, or document why it must remain partial.');
  lines.push('4. Domain priority: Trinity Schedule → Trinity actions → ChatDock → Notifications → Employee/Client CRUD → Document Vault → Automation Workflows.');
  lines.push('');
  lines.push('---');
  lines.push('_This is not a dead-code audit. This is an **action truth audit**: what the platform says it can do vs. what is actually wired, guarded, executed, persisted, notified, and shown to the user._');
  lines.push('');
  return lines.join('\n');
}

// --------------------------------------------------------------------------
// MAIN
// --------------------------------------------------------------------------

function main() {
  const startedAt = Date.now();
  const log = (msg: string) => process.stdout.write(`[${((Date.now() - startedAt) / 1000).toFixed(1)}s] ${msg}\n`);

  log('Building mount table…');
  const mounts = buildMountTable();
  log(`  resolved ${mounts.size} route file -> mount mappings`);

  log('Scanning backend routes…');
  const backend = scanBackendRoutes(mounts);
  log(`  ${backend.length} backend route declarations`);

  log('Scanning frontend callsites…');
  const ui = scanFrontend();
  log(`  ${ui.length} frontend API calls`);

  log('Cross-linking UI ↔ backend…');
  const linked = crossLink(ui, backend);
  log(`  records=${linked.records.length}  uiOnly=${linked.uiOnly.length}  backendOnly=${linked.backendOnly.length}`);

  log('Scanning Trinity actionRegistry…');
  const trinity = scanTrinityActions();
  log(`  ${trinity.length} actionId literals`);

  log('Scanning websocket / automation…');
  const ws = scanWebsocket();
  const automation = scanAutomation();
  log(`  ws=${ws.length}  automation=${automation.length}`);

  // Append trinity records as their own action records
  const trinityRecords: ActionRecord[] = trinity.map((t) => ({
    actionId: `trinity:${t.actionId}`,
    domain: t.domain,
    sourceType: 'trinity',
    label: t.actionId,
    description: `Trinity action ${t.actionId} declared at ${t.file}:${t.line}`,
    trinity: {
      actionRegistryFile: t.file,
      line: t.line,
      auditWrapped: t.auditWrapped,
      requiresApproval: t.requiresApproval,
      serviceCalls: t.serviceCalls,
    },
    mutationType: 'unknown',
    notificationSent: 'unknown',
    auditWritten: t.auditWrapped,
    eventEmitted: 'unknown',
    legalGate: t.requiresApproval,
    status: t.registered ? [] : ['REGISTERED_NOT_EXECUTABLE'],
    notes: t.registered ? [] : ['actionId literal exists but no helpaiOrchestrator.registerAction(name) found'],
  }));

  const wsRecords: ActionRecord[] = ws.map((w) => ({
    actionId: `ws:${w.kind}:${w.event}`,
    domain: 'realtime',
    sourceType: 'websocket',
    label: `${w.kind} ${w.event}`,
    description: `WebSocket ${w.kind} ${w.event} at ${w.file}:${w.line}`,
    mutationType: 'unknown',
    notificationSent: 'unknown',
    auditWritten: 'unknown',
    eventEmitted: w.kind === 'emit',
    legalGate: false,
    status: [],
    notes: [],
  }));

  const automationRecords: ActionRecord[] = automation.map((a) => ({
    actionId: `automation:${a.kind}:${a.source}`,
    domain: 'automation',
    sourceType: a.kind === 'cron' ? 'cron' : 'automation',
    label: `${a.kind} ${a.source}`,
    description: `${a.kind} ${a.source} at ${a.file}:${a.line}`,
    mutationType: 'unknown',
    notificationSent: 'unknown',
    auditWritten: 'unknown',
    eventEmitted: a.kind !== 'cron',
    legalGate: false,
    status: [],
    notes: [],
  }));

  const allRaw = [...linked.records, ...trinityRecords, ...wsRecords, ...automationRecords];
  log(`Deduping ${allRaw.length} records…`);
  const { records, duplicates } = dedupeAndScore(allRaw);
  log(`  ${records.length} unique records  (${duplicates.length} dup keys)`);

  const json = {
    generatedAt: new Date().toISOString(),
    counts: {
      total: records.length,
      backend: backend.length,
      ui: ui.length,
      trinity: trinity.length,
      websocket: ws.length,
      automation: automation.length,
      duplicates: duplicates.length,
    },
    records,
    duplicates,
    trinity,
    websocket: ws,
    automation,
  };
  fs.writeFileSync(OUT_JSON, JSON.stringify(json, null, 2));
  log(`Wrote ${OUT_JSON}`);

  const md = buildMarkdown(records, trinity, ws, automation, duplicates);
  fs.writeFileSync(OUT_MD, md);
  log(`Wrote ${OUT_MD}`);

  log('Done.');
}

main();
