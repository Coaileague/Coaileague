import pg from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import { sql } from "drizzle-orm";
import * as schema from "@shared/schema";
import { RETRIES } from './config/platformConfig';
import { createLogger } from './lib/logger';

const log = createLogger('Database');

const databaseUrl = process.env.DATABASE_URL;

if (!databaseUrl) {
  throw new Error(
    "DATABASE_URL must be set. Did you forget to provision a database?",
  );
}

// ============================================================================
// POOL-LEVEL CIRCUIT BREAKER  (three-state: CLOSED → OPEN → HALF-OPEN)
//
// DESIGN:
//  - Opens only after 5 failures within a 60-second sliding window
//    (startup pool warm-up glitches of 1-3 failures will not open it)
//  - Probes every 10 seconds instead of 30 (faster recovery UX)
//  - Server starts in HALF_OPEN so the very first probe warms the pool
//    correctly instead of being counted as a failure that opens the circuit
//  - Failures are counted in a time-windowed bucket, not consecutively
// ============================================================================
const CIRCUIT_CONFIG = {
  failureThreshold: 5,        // open after 5 failures…
  failureWindowMs:  60_000,   // …within a 60-second window
  probeIntervalMs:  10_000,   // probe every 10 seconds when open
  successThreshold: 2,        // close after 2 consecutive successes in half-open
};

type CircuitState = 'CLOSED' | 'OPEN' | 'HALF_OPEN';

let _state: CircuitState = 'HALF_OPEN'; // start half-open so first probe closes it
let _openAt = 0;
let _halfOpenSuccesses = 0;
let _failureTimestamps: number[] = [];   // sliding window of failure timestamps
let _lastFailureReason = '';

export function getCircuitState(): {
  state: CircuitState;
  openAt: number;
  failuresInWindow: number;
  nextProbeAt: number;
  lastFailureReason: string;
} {
  const now = Date.now();
  const failures = _failureTimestamps.filter(t => now - t < CIRCUIT_CONFIG.failureWindowMs);
  return {
    state: _state,
    openAt: _openAt,
    failuresInWindow: failures.length,
    nextProbeAt: _state === 'OPEN' ? _openAt + CIRCUIT_CONFIG.probeIntervalMs : 0,
    lastFailureReason: _lastFailureReason,
  };
}

export function isDbCircuitOpen(): boolean {
  if (_state === 'CLOSED') return false;
  if (_state === 'HALF_OPEN') return false; // allow probe through

  // OPEN state — check if probe interval has elapsed
  if (Date.now() - _openAt >= CIRCUIT_CONFIG.probeIntervalMs) {
    _state = 'HALF_OPEN';
    _halfOpenSuccesses = 0;
    log.info('DB circuit breaker: half-open — allowing probe connection');
    return false;
  }
  return true;
}

export function recordDbSuccess(): void {
  if (_state === 'HALF_OPEN') {
    _halfOpenSuccesses++;
    if (_halfOpenSuccesses >= CIRCUIT_CONFIG.successThreshold) {
      log.info('DB circuit breaker: closed — connection restored');
      _state = 'CLOSED';
      _halfOpenSuccesses = 0;
      _failureTimestamps = [];
    }
    return;
  }
  if (_state === 'OPEN') return; // shouldn't happen but be safe
  // CLOSED — clear failure window on success
  _failureTimestamps = [];
}

export function recordDbFailure(reason?: string): void {
  if (reason) _lastFailureReason = reason;
  const now = Date.now();
  _failureTimestamps.push(now);
  // Trim old timestamps outside window
  _failureTimestamps = _failureTimestamps.filter(t => now - t < CIRCUIT_CONFIG.failureWindowMs);

  if (_state === 'HALF_OPEN') {
    // Probe failed — back to OPEN
    _state = 'OPEN';
    _openAt = now;
    _halfOpenSuccesses = 0;
    log.warn('DB circuit breaker: probe failed — staying OPEN', { nextProbeMs: CIRCUIT_CONFIG.probeIntervalMs });
    return;
  }

  if (_state === 'CLOSED' && _failureTimestamps.length >= CIRCUIT_CONFIG.failureThreshold) {
    _state = 'OPEN';
    _openAt = now;
    log.warn(`DB circuit breaker: OPEN — ${_failureTimestamps.length} failures in ${CIRCUIT_CONFIG.failureWindowMs / 1000}s window. Probing in ${CIRCUIT_CONFIG.probeIntervalMs / 1000}s.`);
  }
}

// ============================================================================
// CONNECTION POOL — Railway + Neon production configuration
//
// max:10   — supports ~50 concurrent requests; stays well under Neon's per-compute
//            connection limit. Each Railway replica gets its own pool, so total
//            connections = max × replica count.
// min:0    — don't hold open connections during idle periods (saves Neon slots).
// idleTimeoutMillis:30000 — 30s before releasing idle connections. 10s was too
//            aggressive: burst → idle → reconnect latency on the next burst.
//            30s amortises the ~150ms Neon TCP reconnect cost.
// connectionTimeoutMillis:4000 — fast failure so the circuit breaker opens quickly.
// keepAlive:true — sends TCP keepalive probes to prevent NAT tables (Railway's
//            internal LB, Neon's proxy) from silently dropping idle connections.
//            Without this, a connection idle for >30s may appear open on our
//            side but be dead on Neon's side, causing "connection terminated
//            unexpectedly" on the next query.
// allowExitOnIdle:false — MUST be false for a long-running server. true is only
//            safe for one-shot scripts. With true, if all pool clients drain
//            simultaneously (e.g. during a quiet period) and nothing else holds
//            the event loop open, Node can exit the process on Railway.
// ============================================================================
export const pool = new pg.Pool({
  connectionString: databaseUrl,
  max: 10,
  min: 0,
  idleTimeoutMillis: 30_000,
  connectionTimeoutMillis: 4_000,
  allowExitOnIdle: false,
  keepAlive: true,
  keepAliveInitialDelayMillis: 10_000, // first probe after 10s idle
});

pool.on('error', (err) => {
  recordDbFailure();
  log.error('Unexpected pool error (connection will be recycled)', { error: err.message });
});

// Set a statement_timeout on every new connection so hanging queries are
// automatically killed by PostgreSQL — this prevents connection slot leaks
// when callers give up (Promise.race timeout) but the query is still running.
// Phase 39 — also instruments query timing for slow query detection at 500ms threshold.
pool.on('connect', (client) => {
  // SC1: health-check-style SET — must use client.query() here, not db.execute(),
  // because db is not yet fully initialized when pool fires 'connect'.
  // CATEGORY B — kept as pool client.query per DB-connection lifecycle constraint.
  client.query('SET statement_timeout = 7000').catch(() => {});

  // Phase 39 — Slow query detection: wrap client.query to log queries over 500ms
  const _origQuery = client.query.bind(client);
  (client as any).query = function slowQueryWrapper(...args: any[]) {
    const start = Date.now();
    // @ts-expect-error — TS migration: fix in refactoring sprint
    const result = _origQuery(...args);
    const captureSlowQuery = (duration: number) => {
      if (duration >= 500) {
        const queryText = typeof args[0] === 'string' ? args[0].substring(0, 200) : '[prepared]';
        log.warn(`[SlowQuery] ${duration}ms — ${queryText}`);
      }
    };
    if (result && typeof result.then === 'function') {
      result.then(
        () => captureSlowQuery(Date.now() - start),
        () => captureSlowQuery(Date.now() - start),
      ).catch(() => {});
    }
    return result;
  };
});

// Intercept ALL pool.connect() calls (including internal Drizzle ORM calls)
// so the circuit breaker applies to every DB operation, not just withRetry().
// Note: recordDbSuccess() is NOT called here — only query-level success matters.
const _originalConnect = pool.connect.bind(pool);
(pool as any).connect = async function circuitBreakerConnect(...args: any[]) {
  if (isDbCircuitOpen()) {
    throw new Error('[CircuitBreaker] DB circuit is open — skipping connection attempt');
  }
  try {
    // @ts-expect-error — TS migration: fix in refactoring sprint
    const client = await _originalConnect(...args);
    return client;
  } catch (err: any) {
    recordDbFailure(err?.message);
    throw err;
  }
};

export const db = drizzle({ client: pool, schema });

/**
 * Probe the DB directly — BYPASSES the circuit breaker by using
 * _originalConnect instead of the intercepted pool.connect.
 * Use ONLY in the startup wake-up loop or health-check logic.
 * Records success/failure to update circuit breaker state.
 */
export async function probeDbConnection(): Promise<boolean> {
  try {
    const client = await _originalConnect();
    try {
      await client.query('SELECT 1');
      recordDbSuccess();
      return true;
    } finally {
      client.release();
    }
  } catch (err: any) {
    recordDbFailure(err?.message);
    return false;
  }
}

export async function withRetry<T>(
  operation: () => Promise<T>,
  options: {
    maxRetries?: number;
    baseDelayMs?: number;
    maxDelayMs?: number;
    operationName?: string;
  } = {}
): Promise<T> {
  const {
    maxRetries = RETRIES.dbMaxRetries,
    baseDelayMs = 500,
    maxDelayMs = 5000,
    operationName = 'database operation'
  } = options;

  // Respect the circuit breaker — don't even try if circuit is open
  if (isDbCircuitOpen()) {
    throw new Error(`[CircuitBreaker] DB is unavailable — circuit open, skipping ${operationName}`);
  }

  let lastError: Error | null = null;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const result = await operation();
      recordDbSuccess();
      return result;
    } catch (error: any) {
      lastError = error;
      recordDbFailure();
      
      const isRetryable = 
        error.message?.includes('timeout') ||
        error.message?.includes('connection') ||
        error.message?.includes('ECONNRESET') ||
        error.message?.includes('ECONNREFUSED') ||
        error.code === 'ECONNRESET' ||
        error.code === 'ETIMEDOUT';

      if (!isRetryable || attempt >= maxRetries) {
        throw error;
      }

      // If circuit just opened, abort immediately
      if (isDbCircuitOpen()) {
        throw new Error(`[CircuitBreaker] DB circuit opened during retry — aborting ${operationName}`);
      }

      const delay = Math.min(
        baseDelayMs * Math.pow(2, attempt) + Math.random() * 100,
        maxDelayMs
      );

      log.warn(`${operationName} failed, retrying`, { attempt: attempt + 1, maxAttempts: maxRetries + 1, delayMs: Math.round(delay) });
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }

  throw lastError;
}

export async function checkDatabaseHealth(): Promise<boolean> {
  if (isDbCircuitOpen()) return false;
  try {
    // Converted to Drizzle ORM: health check ping
    await db.execute(sql`SELECT 1`);
    recordDbSuccess();
    return true;
  } catch (error: any) {
    recordDbFailure();
    log.error('Database health check failed', { error: error?.message });
    return false;
  }
}

process.on('SIGTERM', async () => {
  log.info('SIGTERM received, closing pool');
  try {
    await pool.end();
    log.info('Pool closed gracefully');
  } catch (err: any) {
    log.error('Error closing pool', { error: err?.message });
  }
});

process.on('SIGINT', async () => {
  log.info('SIGINT received, closing pool');
  try {
    await pool.end();
    log.info('Pool closed gracefully');
  } catch (err: any) {
    log.error('Error closing pool', { error: err?.message });
  }
});
