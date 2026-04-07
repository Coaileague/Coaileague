// Domain Auth & Identity — Route Mounts
// THE LAW: No new routes without Bryan's approval.
// Canonical prefixes: /api/auth/*, /api/tos/*, /api/session-checkpoints, /api/admin/end-users, /api/dev
import type { Express } from "express";
import { requireAuth } from "../../auth";
import { ensureWorkspaceAccess } from "../../middleware/workspaceScope";
import authRoutesFromRoot from "../authCoreRoutes";
import authRouter from "../authRoutes";
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

  app.use("/api/session-checkpoints", requireAuth, ensureWorkspaceAccess, sessionCheckpointRouter);
  app.use("/api/admin/end-users", requireAuth, endUserControlRouter);
  if (process.env.NODE_ENV !== 'production' && process.env.REPLIT_DEPLOYMENT !== '1') {
    app.use("/api/dev", devRouter);
  }
}
