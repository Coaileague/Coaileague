/**
 * Canonical production-environment detection.
 *
 * CoAIleague has been deployed across multiple hosting environments
 * (Replit, Cloud Run, Railway). The legacy guard `REPLIT_DEPLOYMENT === '1'`
 * fired only on Replit and silently returned false on Railway, causing
 * dev seeds (Acme, Anvil) to run inside the Railway production database
 * — a CLAUDE.md §12 violation.
 *
 * This helper unifies all known production signals:
 *   - NODE_ENV === 'production' (the Node.js convention)
 *   - REPLIT_DEPLOYMENT === '1'  (Replit deploy)
 *   - RAILWAY_ENVIRONMENT === 'production' (Railway production)
 *   - K_SERVICE / K_REVISION present (Google Cloud Run)
 *
 * Use isProduction() instead of any inline env check. New hosting
 * environments only need to be added here.
 */

export function isProduction(): boolean {
  if (process.env.NODE_ENV === 'production') return true;
  if (process.env.REPLIT_DEPLOYMENT === '1') return true;
  if (process.env.RAILWAY_ENVIRONMENT === 'production') return true;
  if (process.env.K_SERVICE || process.env.K_REVISION) return true;
  return false;
}

/** Inverse of isProduction — readability helper. */
export function isDevelopment(): boolean {
  return !isProduction();
}

/**
 * Returns true only when running on a real customer-facing deploy.
 * Use this for the strictest gates (writes to production tenants,
 * destructive cleanup, dev-data seeding refusal).
 */
export function isProductionDeploy(): boolean {
  return isProduction();
}
