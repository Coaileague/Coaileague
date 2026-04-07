/**
 * replitAuth.ts — Minimal compatibility shim
 *
 * Replit OIDC has been fully removed. All authentication uses the custom
 * Trinity auth system (server/auth.ts). This shim exists only so any
 * remaining external references don't cause import errors.
 *
 * DO NOT ADD NEW CODE HERE. Import directly from "./auth" instead.
 */

export { requireAuth as isAuthenticated, setupAuth, getSession } from "./auth";
