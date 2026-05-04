// Domain Auth & Identity — Route Mounts
// THE LAW: No new routes without Bryan's approval.
// Canonical prefixes: /api/auth/*, /api/tos/*, /api/session-checkpoints, /api/admin/end-users, /api/dev
import type { Express } from "express";
import { requireAuth } from '../../auth';
// requireAuth loaded lazily to prevent circular module initialization crash.
// When esbuild bundles auth.ts + authRoutes.ts, eager top-level imports of
// requireAuth can resolve to undefined if the auth module hasn't finished
// initializing. Lazy resolution (inside function body) is always safe.
// See SYSTEM_MAP: DEPLOYMENT CRASH LAW — requireAuth circular init.
import type { RequestHandler } from "express";
let _requireAuth: RequestHandler | null = null;
async function getRequireAuth(): Promise<RequestHandler> {
  if (!_requireAuth) {
    const { requireAuth } = await import("../../auth");
    _requireAuth = requireAuth;
  }
  return _requireAuth;
}
import { ensureWorkspaceAccess } from "../../middleware/workspaceScope";
// Merged: authCoreRoutes → authRoutes (Wave 2)
import authRouter from "../authRoutes";
const authRoutesFromRoot = authRouter;
import { sessionCheckpointRouter } from "../sessionCheckpointRoutes";
import endUserControlRouter from "../endUserControlRoutes";
import devRouter from "../devRoutes";
import wellKnownRouter from "../wellKnown";
import tosRouter from "../tosRoutes";
import { authLimiter, passwordResetLimiter } from "../../middleware/rateLimiter";

export function mountAuthRoutes(app: Express): void {
  app.use(wellKnownRouter);

  // G24-01 fix: Use the canonical authLimiter from rateLimiter.ts (max: 5 per 15 min)
  // instead of the prior inline limiter which was max: 20 (4× too permissive).
  // passwordResetLimiter (max: 3 per hour) applied to reset/magic-link endpoints.
  app.use("/api/auth/login", authLimiter);
  app.use("/api/auth/register", authLimiter);
  app.use("/api/auth/request-password-reset", passwordResetLimiter);
  app.use("/api/helpdesk/authenticate-ticket", authLimiter);
  app.use("/api/helpdesk/authenticate-workid", authLimiter);
  app.use("/api/auth/forgot-password", passwordResetLimiter);
  app.use("/api/auth/magic-link", passwordResetLimiter);
  app.use("/api/auth/reset-password", passwordResetLimiter);
  app.use("/api/auth/reset-password-request", passwordResetLimiter);
  app.use("/api/auth/reset-password-confirm", passwordResetLimiter);
  app.use("/api/auth/resend-verification", authLimiter);

  app.use(authRoutesFromRoot);
  app.use("/api/auth", authRouter);

  // TOS — public (no auth) — called during org registration and employee onboarding
  app.use("/api/tos", tosRouter);

  // requireAuth applied via lazy loader — safe against circular module init
  getRequireAuth().then(ra => {
    app.use("/api/session-checkpoints", ra, ensureWorkspaceAccess, sessionCheckpointRouter);
    app.use("/api/admin/end-users", ra, endUserControlRouter);
  }).catch(console.error);
  // handled in getRequireAuth().then() block above
  if (process.env.NODE_ENV !== 'production') {
    app.use("/api/dev", devRouter);
  }
}
