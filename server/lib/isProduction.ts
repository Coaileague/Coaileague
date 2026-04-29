/**
 * Canonical production-environment detection.
 *
 * ROOT CAUSE OF BUG (fixed here):
 *   Railway ALWAYS sets NODE_ENV=production — even for development deployments
 *   like coaileague-development.up.railway.app. When RAILWAY_ENVIRONMENT_NAME
 *   is not set in Railway variables, the old code fell through to the
 *   NODE_ENV check and returned true (production) for dev deployments.
 *   This caused: bypass buttons hidden, dev accounts skipped, login 500s.
 *
 * FIX: On Railway (RAILWAY_SERVICE_ID is set), default to NON-production
 * unless RAILWAY_ENVIRONMENT_NAME is explicitly "production".
 */

export function isProduction(): boolean {
  // RAILWAY_ENVIRONMENT_NAME is the authoritative Railway signal.
  const railwayEnv = process.env.RAILWAY_ENVIRONMENT_NAME?.toLowerCase();
  if (railwayEnv === 'production') return true;
  if (railwayEnv && railwayEnv !== 'production') return false;

  // Older Railway signal
  if (process.env.RAILWAY_ENVIRONMENT === 'production') return true;

  // Google Cloud Run
  if (process.env.K_SERVICE || process.env.K_REVISION) return true;

  // Railway always sets NODE_ENV=production — even for dev deployments.
  // If RAILWAY_SERVICE_ID is present and RAILWAY_ENVIRONMENT_NAME isn't
  // explicitly "production", this is a dev/staging Railway deployment.
  if (process.env.RAILWAY_SERVICE_ID) return false;

  // Non-Railway local deploy: trust NODE_ENV
  if (process.env.NODE_ENV === 'production') return true;

  return false;
}

export function isDevelopment(): boolean {
  return !isProduction();
}

export function isProductionDeploy(): boolean {
  return isProduction();
}
