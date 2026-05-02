/**
 * Get application base URL for links, callbacks, and redirects.
 *
 * Priority:
 * 1. APP_BASE_URL          (canonical — set this in Railway)
 * 2. APP_URL               (legacy alias — also accepted)
 * 3. BASE_URL              (legacy alias — also accepted)
 * 4. RAILWAY_PUBLIC_DOMAIN (Railway auto-injects this)
 * 5. http://localhost:5000  (dev fallback only)
 *
 * This means all 29 places that call getAppBaseUrl() will produce
 * correct production URLs as long as unknown one of the above is set.
 */
export function getAppBaseUrl(): string {
  if (process.env.APP_BASE_URL) {
    return process.env.APP_BASE_URL.replace(/\/$/, '');
  }
  if (process.env.APP_URL) {
    return process.env.APP_URL.replace(/\/$/, '');
  }
  if (process.env.BASE_URL) {
    return process.env.BASE_URL.replace(/\/$/, '');
  }
  if (process.env.RAILWAY_PUBLIC_DOMAIN) {
    return `https://${process.env.RAILWAY_PUBLIC_DOMAIN}`;
  }
  return 'http://localhost:5000';
}
