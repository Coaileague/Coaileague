// TRINITY.md §A: always use canonical production helper, never check NODE_ENV directly
import { isProduction } from '../lib/isProduction';
import { createLogger } from '../lib/logger';
const log = createLogger('validateEnvironment');

const REQUIRED_PROD = [
  'DATABASE_URL',
  'SESSION_SECRET',
  'RESEND_API_KEY',
];

const REQUIRED_ALWAYS = [
  'DATABASE_URL',
];

/**
 * Validate that all required environment variables are present.
 * Throws in production if any critical vars are missing.
 * Warns in development.
 */
export function validateEnvironment(): void {
  const missing: string[] = [];

  const required = isProduction() ? REQUIRED_PROD : REQUIRED_ALWAYS;

  for (const key of required) {
    if (!process.env[key]) {
      missing.push(key);
    }
  }

  if (missing.length > 0) {
    const msg = `Missing required environment variables: ${missing.join(', ')}`;
    if (isProduction()) {
      log.error(msg);
      throw new Error(msg);
    } else {
      log.warn(msg + ' — continuing in development mode');
    }
  } else {
    log.info(`Environment validated — ${required.length} required vars present`);
  }
}
