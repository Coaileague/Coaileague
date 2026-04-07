import { Request, Response, NextFunction } from 'express';
import crypto from 'crypto';
import { db } from '../db';
import { idempotencyKeys } from '@shared/schema';
import { and, eq } from 'drizzle-orm';
import { sql } from 'drizzle-orm';
import { typedExec } from '../lib/typedSql';

type OperationType = 'invoice_generation' | 'payroll_run' | 'timesheet_ingest' |
  'schedule_generation' | 'payment_processing' | 'shift_reminder' |
  'cert_expiry_notify' | 'daily_digest' | 'coverage_pipeline';

const ROUTE_TO_OPERATION: Record<string, OperationType> = {
  'POST:/api/payroll/create-run': 'payroll_run',
  'POST:/api/invoices': 'invoice_generation',
  'POST:/api/onboarding/invite': 'payment_processing',
};

// Include userId so DB scope matches L1 scope — prevents cross-user replay within a workspace
function buildFingerprint(key: string, route: string, body: any, userId: string): string {
  try {
    const str = `${key}:${route}:${userId}:${JSON.stringify(body ?? {})}`;
    return crypto.createHash('sha256').update(str).digest('hex').slice(0, 64);
  } catch {
    return crypto.createHash('sha256').update(`${key}:${route}:${userId}`).digest('hex').slice(0, 64);
  }
}

const inMemory = new Map<string, { status: 'in_progress' | 'completed'; body?: any; statusCode?: number; expiresAt: number }>();

setInterval(() => {
  const now = Date.now();
  for (const [k, v] of inMemory.entries()) {
    if (now > v.expiresAt) inMemory.delete(k);
  }
}, 60 * 60 * 1000);

const TTL_MS = 24 * 60 * 60 * 1000;

export const idempotencyMiddleware = (req: Request, res: Response, next: NextFunction) => {
  const idempotencyKey = req.header('Idempotency-Key');
  if (!idempotencyKey) return next();

  // Both userId and workspaceId MUST come from server-trusted context only
  const userId: string | null = req.session?.userId || req.user?.id || null;
  const workspaceId: string | null =
    req.workspaceId ||
    req.session?.workspaceId ||
    null;

  // Fail closed: require a stable, authenticated principal — prevents cross-caller collision
  if (!userId || !workspaceId) {
    return res.status(401).json({
      error: 'Idempotency-Key requires an authenticated session with a resolved workspace. Ensure you are logged in.',
    });
  }

  const routeKey = `${req.method}:${req.path}`;
  const operationType: OperationType = ROUTE_TO_OPERATION[routeKey] || 'payment_processing';
  const fingerprint = buildFingerprint(idempotencyKey, routeKey, req.body, userId);
  // L1 key includes workspaceId + userId + routeKey + fingerprint — no cross-route or cross-tenant collision
  const memKey = `${workspaceId}:${userId}:${routeKey}:${fingerprint}`;
  const expiresAt = new Date(Date.now() + TTL_MS);

  // L1: in-memory fast-path (same-process concurrent requests)
  const memRecord = inMemory.get(memKey);
  if (memRecord && Date.now() < memRecord.expiresAt) {
    if (memRecord.status === 'in_progress') {
      return res.status(409).json({
        error: 'A request with this Idempotency-Key is already being processed.',
        retryAfterMs: 2000,
      });
    }
    if (memRecord.status === 'completed') {
      res.setHeader('X-Idempotency-Cache', 'HIT');
      return res.status(memRecord.statusCode!).json(memRecord.body);
    }
  }

  // Reserve in-memory BEFORE async DB work
  inMemory.set(memKey, { status: 'in_progress', expiresAt: Date.now() + TTL_MS });

  // Helper to finalize the DB record (used by both json and finish paths)
  const finalizeRecord = (sc: number, body: any) => {
    const isFinal = sc >= 200 && sc < 500;
    const isRetryable = sc >= 500;

    if (isFinal) {
      // 2xx and 4xx: cache as completed (deterministic responses that should not re-execute)
      inMemory.set(memKey, { status: 'completed', statusCode: sc, body, expiresAt: Date.now() + TTL_MS });
      // CATEGORY C — Raw SQL retained: ::jsonb | Tables: idempotency_keys | Verified: 2026-03-23
      typedExec(
        sql`UPDATE idempotency_keys
            SET status = 'completed',
                result_metadata = ${JSON.stringify({ statusCode: sc, body })}::jsonb,
                completed_at = NOW()
            WHERE workspace_id = ${workspaceId} AND operation_type = ${operationType} AND request_fingerprint = ${fingerprint}
              AND status = 'processing'`
      ).catch(() => { /* best-effort */ });
    } else if (isRetryable) {
      // 5xx: clear for retry
      inMemory.delete(memKey);
      // CATEGORY C — Raw SQL retained: Middleware best-effort status UPDATE | Tables: idempotency_keys | Verified: 2026-03-23
      typedExec(
        sql`UPDATE idempotency_keys SET status = 'failed', error_message = ${'Server error ' + sc}
            WHERE workspace_id = ${workspaceId} AND operation_type = ${operationType} AND request_fingerprint = ${fingerprint}
              AND status = 'processing'`
      ).catch(() => { /* best-effort */ });
    }
  };

  // L2: DB-atomic reservation
  const reserveAndCheck = async (): Promise<
    { action: 'proceed' } |
    { action: 'conflict' } |
    { action: 'replay'; statusCode: number; body: any }
  > => {
    try {
      // Converted to Drizzle ORM: ON CONFLICT
      const insertResult = await db.insert(idempotencyKeys).values({
        workspaceId,
        operationType: operationType as any,
        requestFingerprint: fingerprint,
        status: 'processing' as any,
        expiresAt,
      }).onConflictDoNothing({
        target: [idempotencyKeys.workspaceId, idempotencyKeys.operationType, idempotencyKeys.requestFingerprint],
      }).returning({ id: idempotencyKeys.id });

      const inserted = insertResult.length > 0;
      if (inserted) {
        // We created the record — this is the first request, proceed
        return { action: 'proceed' };
      }

      // A pre-existing record exists — inspect its state
      const [existing] = await db
        .select()
        .from(idempotencyKeys)
        .where(
          and(
            eq(idempotencyKeys.workspaceId, workspaceId),
            eq(idempotencyKeys.operationType, operationType),
            eq(idempotencyKeys.requestFingerprint, fingerprint)
          )
        )
        .limit(1);

      if (!existing) {
        // Race: deleted between check and select — safe to proceed
        return { action: 'proceed' };
      }

      if (existing.status === 'processing') {
        const ageMs = Date.now() - new Date(existing.createdAt).getTime();
        if (ageMs < 30000) {
          // Actively processing on another instance
          return { action: 'conflict' };
        }

        // ATOMIC CLAIM: refresh created_at (heartbeat) so we own this slot for another 30s
        // Status stays 'processing' — other servers won't re-claim for 30s and finalizeRecord()
        // (which uses AND status='processing') can still persist completion metadata normally.
        // Converted to Drizzle ORM: reserveAndCheck → INTERVAL
        const claimed = await db.update(idempotencyKeys)
          .set({ createdAt: sql`now()` })
          .where(and(
            eq(idempotencyKeys.workspaceId, workspaceId),
            eq(idempotencyKeys.operationType, operationType as any),
            eq(idempotencyKeys.requestFingerprint, fingerprint),
            eq(idempotencyKeys.status, 'processing' as any),
            sql`${idempotencyKeys.createdAt} < now() - interval '30 seconds'`
          ))
          .returning({ id: idempotencyKeys.id });

        const didClaim = claimed.length > 0;
        if (didClaim) {
          return { action: 'proceed' };
        }
        // Another server already claimed (refreshed created_at) first — treat as active
        return { action: 'conflict' };
      }

      if (existing.status === 'completed' && existing.resultMetadata) {
        const cached = existing.resultMetadata as { statusCode: number; body: any } | null;
        if (cached?.statusCode && cached?.body !== undefined) {
          return { action: 'replay', statusCode: cached.statusCode, body: cached.body };
        }
      }

      // 'failed' or unknown status — allow retry
      return { action: 'proceed' };
    } catch {
      // DB error — clear in-memory reservation and fail open (allow handler to proceed)
      inMemory.delete(memKey);
      return { action: 'proceed' };
    }
  };

  reserveAndCheck()
    .then((result) => {
      if (result.action === 'conflict') {
        inMemory.delete(memKey);
        return res.status(409).json({
          error: 'A request with this Idempotency-Key is already being processed by another server.',
          retryAfterMs: 3000,
        });
      }

      if (result.action === 'replay') {
        inMemory.set(memKey, { status: 'completed', statusCode: result.statusCode, body: result.body, expiresAt: Date.now() + TTL_MS });
        res.setHeader('X-Idempotency-Cache', 'HIT');
        return res.status(result.statusCode).json(result.body);
      }

      // action === 'proceed' — capture response via ALL terminal paths
      let finalized = false;
      let capturedBody: any;
      let capturedSc: number;

      // Primary capture: res.json (covers all JSON responses from these routes)
      const originalJson = res.json.bind(res);
      res.json = function (body: any) {
        if (!finalized) {
          finalized = true;
          capturedBody = body;
          capturedSc = res.statusCode;
          finalizeRecord(capturedSc, capturedBody);
        }
        return originalJson(body);
      };

      // Fallback capture: res.on('finish') handles res.sendStatus / res.end / res.send non-JSON paths
      res.on('finish', () => {
        if (!finalized) {
          finalized = true;
          const sc = res.statusCode;
          // Body may not be available on non-JSON paths — store status-only metadata
          const body = capturedBody ?? { _finishedWithoutJson: true, statusCode: sc };
          finalizeRecord(sc, body);
        }
      });

      next();
    })
    .catch(() => {
      // Unexpected failure — clear in-memory reservation, fail open
      inMemory.delete(memKey);
      next();
    });
};
