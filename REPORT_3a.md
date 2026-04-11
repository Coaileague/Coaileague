# Audit Report 3a — Startup / Database / Health / Middleware
**Branch:** `audit/backend-core-check`  
**Files audited:** `server/index.ts`, `server/startup/validateEnvironment.ts`, `server/db.ts`, `server/middleware/errorHandler.ts`

---

## Summary

10 audit checks performed. 4 issues found and fixed, 6 checks passed cleanly.

---

## Findings

### ✅ PASS — 1. Env vars validated at startup
`validateEnvironment()` in `server/startup/validateEnvironment.ts` validates 14 critical variables + billing variables before the server starts. Missing critical vars crash in production, warn in development.

**FIXED (see §A violation below)** — production detection now uses the canonical `isProductionEnv()` helper.

---

### ✅ PASS — 2. Database connection properly initialised
`server/db.ts` throws immediately (module-load) if `DATABASE_URL` is missing. The `pg.Pool` is configured with circuit breaker interception on `pool.connect()`. Boot sequence probes DB up to 10× at 2 s intervals before loading phase-1 services.

---

### ✅ PASS — 3. Connection pool properly configured
Pool settings (`max:10`, `idleTimeoutMillis:10000`, `connectionTimeoutMillis:4000`, `keepAlive:false`, `allowExitOnIdle:true`) are appropriate for the 300-officer target load. Statement timeout (7 s) is set on every new connection via the `connect` event. Slow-query wrapper logs queries >500 ms.

---

### ✅ PASS — 4. CORS policy
CORS is locked to `coaileague.com` patterns + localhost in development. In production with `ALLOWED_ORIGINS` set, it allows only the explicit origin list. No wildcard `*` allowed. `credentials: true` is correctly set.

**FIXED (see §middleware-order below)** — CORS middleware is now registered before body parsers.

---

### ✅ PASS — 5. Body parser present and configured
`express.json({ limit: '10mb' })` + `express.urlencoded({ extended: true, limit: '10mb' })` are registered. A JSON depth-bomb guard (max 10 levels) and a `trimStrings` sanitiser run after parsing.

---

### ✅ PASS — 6. Raw body captured for webhook routes
`express.json`'s `verify` callback captures `req.rawBody` for all paths in `webhookPathsNeedingRawBody`:
- `/api/stripe/webhook`
- `/api/webhooks/quickbooks`
- `/api/webhooks/resend/inbound`
- `/api/webhooks/twilio/*`
- `/api/inbound/email`

Form-encoded Twilio paths are in a separate exemption list.

---

### ✅ PASS — 7. Global error handler present and complete
`globalErrorHandler` from `server/middleware/errorHandler.ts` handles:
- Zod validation errors → 400
- Workspace isolation errors → 403/404
- DB circuit-breaker errors → 503
- DB constraint violations → 409
- Rate limiting → 429
- Timeouts → 408
- Generic 4xx/5xx with production message sanitisation

`notFoundHandler` provides 404 JSON for unknown `/api` routes.

---

### ✅ PASS — 8. 404 handler present
`app.use('/api', notFoundHandler)` is registered after all route handlers and before `globalErrorHandler`.

---

### ✅ PASS — 9. Health endpoint working
`GET /health` is registered first (before all heavy middleware), performs a live `SELECT 1` DB probe, returns JSON with `status`, `database.connected`, `database.latencyMs`, and `uptime`. Returns 503 when monitoring detects `down`, 200 otherwise.

`GET /api/platform/readiness` provides a detailed readiness check for platform staff (sensitive details gated behind `isPlatformStaff`).

---

## Issues Found & Fixed

### 🔴 FIX 1 — Section A violation: `isProduction` variable shadow in `server/index.ts`

**File:** `server/index.ts` line 404 (before fix)

**Bug:**
```ts
// BEFORE — directly reads NODE_ENV, violates CLAUDE.md §A
const isProduction = process.env.NODE_ENV === 'production';
```
This shadowed the correctly-imported `isProductionEnv` alias and would return `false` on Railway (where `NODE_ENV` may not be `'production'` but `RAILWAY_ENVIRONMENT` is). The variable was referenced in the now-removed duplicate error handler.

**Fix:** Removed the shadow variable entirely. All production detection in this file uses `isProductionEnv()` (imported as `isProductionEnv` at the top).

---

### 🔴 FIX 2 — Section A violation: `process.env.NODE_ENV === 'production'` in `validateEnvironment.ts`

**File:** `server/startup/validateEnvironment.ts` line 70 (before fix)

**Bug:**
```ts
// BEFORE — would NOT exit on Railway where NODE_ENV may differ
if (process.env.NODE_ENV === 'production') {
  process.exit(1);
}
```
On Railway (`RAILWAY_ENVIRONMENT=production`), missing critical env vars would only warn rather than crash — the exact opposite of the intended behaviour.

**Fix:**
```ts
// AFTER — canonical production helper covers all hosting environments
import { isProduction } from '../lib/isProduction';
// ...
if (isProduction()) {
  process.exit(1);
}
```

---

### 🟡 FIX 3 — Duplicate dead inline error handler in `server/index.ts`

**File:** `server/index.ts` lines 1715–1782 (before fix)

**Bug:** A second `app.use((err, req, res, _next) => {...})` was registered *after* `app.use(globalErrorHandler)`. Since `globalErrorHandler` always sends a response (it never calls `next(err)`), the second handler was **unreachable dead code**. It also referenced the now-removed `isProduction` variable shadow.

**Fix:** Removed the entire duplicate handler. `globalErrorHandler` from `server/middleware/errorHandler.ts` is the sole error-handling middleware.

---

### 🟡 FIX 4 — Middleware ordering: `trust proxy` and CORS registered after body parsers

**File:** `server/index.ts`

**Bug:**
- `app.set('trust proxy', 1)` was set after `cors()`, after `helmet()`, and after all body parsers. While `app.set()` is a global setting, placing it late is misleading and non-canonical. Rate limiting at line ~572 uses `req.ip`, which depends on `trust proxy`.
- `cors()` was registered after `helmet()` and after body parsers (line ~537 vs body parsers at ~384). For CORS-rejected cross-origin requests, the request body was fully parsed before the rejection was sent — unnecessary work and a minor DoS surface.

**Fix:**
1. `app.set('trust proxy', 1)` moved to the very top, before `app.disable('x-powered-by')` — first thing configured on the Express app.
2. The entire CORS block (setup vars + `app.use(cors(...))`) moved to before the webhook-path declarations and body parsers.

**Corrected middleware order (top-level):**
```
app.set('trust proxy', 1)         ← IP resolution — must be first
app.disable('x-powered-by')
manual security headers            ← X-Content-Type-Options etc.
/health endpoint                   ← lightweight, before all heavy middleware
/api/platform/readiness
CORS                               ← before body parsers (moved)
webhook path declarations
content-type gate
content-length gate
express.json + rawBody capture
JSON depth guard + trimStrings
express.urlencoded
requestIdMiddleware
statewideWriteGuard
Cache-Control header
helmet (full CSP)
X-Frame-Options removal
startup config validation
static asset caching
distributed tracing
maintenanceMiddleware
rateLimitMiddleware
compression
monitoring/logging
registerRoutes (session + auth inside)
notFoundHandler
globalErrorHandler
```

---

## Boot Order Verification (CLAUDE.md §C/D)

```
validateEnvironment()                 ✅ runs first in the IIFE
registerRoutes(app)                   ✅ phase 0
  → setupAuth (session + passport)    ✅ inside registerRoutes
initializeCriticalServices():
  ensureRequiredTables()              ✅
  runLegacyBootstraps()               ✅ after ensureRequiredTables
  ensureCriticalConstraints()         ✅ after legacyBootstraps
  ensureWorkspaceIndexes()            ✅ after constraints
  ensureStorageTables()               ✅
  ensureFounderExemption()            ✅
  dev seeds (guarded by isProduction) ✅
notFoundHandler + globalErrorHandler  ✅ registered after routes
```

Boot order matches `§C` (criticalConstraints after ensureRequiredTables) and `§D` (workspaceIndexes after constraints). ✅

---

## Files Changed

| File | Change |
|---|---|
| `server/index.ts` | Removed `isProduction` variable shadow; moved `trust proxy` to top; moved CORS before body parsers; removed dead duplicate error handler |
| `server/startup/validateEnvironment.ts` | Added `isProduction` import; replaced `process.env.NODE_ENV === 'production'` with `isProduction()` |
