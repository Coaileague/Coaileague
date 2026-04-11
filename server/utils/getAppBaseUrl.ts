/**
 * Get application base URL for links, callbacks, and redirects.
 *
 * Railway-only. The legacy REPLIT_DOMAINS / REPL_SLUG fallbacks have been
 * removed — set `APP_BASE_URL` in Railway env vars (e.g.
 * `https://www.coaileague.com`). Local development falls through to
 * `http://localhost:5000`.
 */
export function getAppBaseUrl(): string {
  if (process.env.APP_BASE_URL) {
    return process.env.APP_BASE_URL;
  }
  return 'http://localhost:5000';
}
