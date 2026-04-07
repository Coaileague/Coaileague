/**
 * Concurrency Guard — Per-workspace mutex for critical operations
 * Prevents race conditions on payroll runs, invoice generation, credit purchases.
 * Uses an in-memory lock map; safe for single-process deployments.
 */
import { createLogger } from '../lib/logger';

const log = createLogger('ConcurrencyGuard');

// key → Promise that resolves when the lock is released
const locks = new Map<string, Promise<void>>();

// Idempotency cache: key → { result, expiresAt }
const idempotencyCache = new Map<string, { result: any; expiresAt: number }>();
const IDEMPOTENCY_TTL_MS = 5 * 60 * 1000; // 5 minutes

export class WorkspaceLockError extends Error {
  code = 'WORKSPACE_LOCKED';
  status = 409;
  constructor(workspaceId: string, operation: string) {
    super(`Workspace ${workspaceId} is already running a ${operation} operation. Retry after it completes.`);
    this.name = 'WorkspaceLockError';
  }
}

/**
 * Acquire an exclusive lock for a workspace+operation combination.
 * Throws WorkspaceLockError immediately if the lock is already held.
 */
export async function withWorkspaceLock<T>(
  workspaceId: string,
  operation: string,
  fn: () => Promise<T>
): Promise<T> {
  const key = `${workspaceId}:${operation}`;

  if (locks.has(key)) {
    throw new WorkspaceLockError(workspaceId, operation);
  }

  let releaseLock!: () => void;
  const lockPromise = new Promise<void>(resolve => { releaseLock = resolve; });
  locks.set(key, lockPromise);

  log.info('Lock acquired', { workspaceId, operation });

  try {
    return await fn();
  } finally {
    locks.delete(key);
    releaseLock();
    log.info('Lock released', { workspaceId, operation });
  }
}

/**
 * Check if a workspace+operation is currently locked.
 */
export function isLocked(workspaceId: string, operation: string): boolean {
  return locks.has(`${workspaceId}:${operation}`);
}

/**
 * Idempotency key enforcement for mutation endpoints.
 * Returns cached result if the same key was used within TTL.
 */
export function checkIdempotency<T>(
  workspaceId: string,
  idempotencyKey: string
): T | null {
  const cacheKey = `${workspaceId}:${idempotencyKey}`;
  const cached = idempotencyCache.get(cacheKey);
  if (!cached) return null;
  if (Date.now() > cached.expiresAt) {
    idempotencyCache.delete(cacheKey);
    return null;
  }
  return cached.result as T;
}

export function storeIdempotencyResult(
  workspaceId: string,
  idempotencyKey: string,
  result: any
): void {
  const cacheKey = `${workspaceId}:${idempotencyKey}`;
  idempotencyCache.set(cacheKey, {
    result,
    expiresAt: Date.now() + IDEMPOTENCY_TTL_MS,
  });
}

/**
 * Express middleware factory: enforces idempotency key on mutation routes.
 * If X-Idempotency-Key header present and matches a cached result, return 200 immediately.
 */
export function idempotencyMiddleware(workspaceIdExtractor?: (req: any) => string | undefined) {
  return (req: any, res: any, next: any) => {
    const idempotencyKey = req.headers['x-idempotency-key'] as string | undefined;
    if (!idempotencyKey) { next(); return; }

    const workspaceId = workspaceIdExtractor
      ? workspaceIdExtractor(req)
      : (req.workspaceId || req.session?.workspaceId);

    if (!workspaceId) { next(); return; }

    const cached = checkIdempotency(workspaceId, idempotencyKey);
    if (cached) {
      log.info('Idempotent request served from cache', { workspaceId, idempotencyKey });
      res.status(200).json({ ...cached, _idempotent: true });
      return;
    }

    // Wrap res.json to cache the result
    const originalJson = res.json.bind(res);
    res.json = (body: any) => {
      if (res.statusCode >= 200 && res.statusCode < 300) {
        storeIdempotencyResult(workspaceId, idempotencyKey, body);
      }
      return originalJson(body);
    };

    next();
  };
}

// Periodic cleanup of expired idempotency entries
setInterval(() => {
  const now = Date.now();
  for (const [key, val] of idempotencyCache.entries()) {
    if (now > val.expiresAt) idempotencyCache.delete(key);
  }
}, 60_000);
