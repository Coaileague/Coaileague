import { createLogger } from '../lib/logger';
const log = createLogger('envValidation');
export function validateEnvironment() {
  const required = [
    'DATABASE_URL',
    'SESSION_SECRET',
    'ENCRYPTION_KEY',
    'GEMINI_API_KEY',
    'RESEND_API_KEY',
    'TWILIO_ACCOUNT_SID',
    'TWILIO_AUTH_TOKEN',
    'STRIPE_SECRET_KEY',
    'STRIPE_WEBHOOK_SECRET',
    'BASE_URL',
    'ANTHROPIC_API_KEY',
    'OPENAI_API_KEY',
    'GRANDFATHERED_TENANT_ID',
  ];
  const optional = [
    'MONITORING_WEBHOOK_URL',
    'STRIPE_PRICE_STARTER_MONTHLY',
    'STRIPE_PRICE_STARTER_ANNUAL',
    'STRIPE_PRICE_PROFESSIONAL_MONTHLY',
    'STRIPE_PRICE_PROFESSIONAL_ANNUAL',
    'STRIPE_PRICE_BUSINESS_MONTHLY',
    'STRIPE_PRICE_BUSINESS_ANNUAL',
    'STRIPE_PRICE_ENTERPRISE_MONTHLY',
    'STRIPE_PRICE_ENTERPRISE_ANNUAL'
  ];
  
  const errors: string[] = [];
  const warnings: string[] = [];

  for (const varName of required) {
    if (!process.env[varName]) {
      errors.push(`Missing required environment variable: ${varName}`);
    }
  }

  for (const varName of optional) {
    if (!process.env[varName]) {
      warnings.push(`Missing optional environment variable: ${varName}`);
    }
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings
  };
}

export function assertEnvironment() {
  const { valid, errors, warnings } = validateEnvironment();

  for (const warning of warnings) {
    log.warn(`[Config Warning] ${warning}`);
  }

  if (!valid) {
    log.error('[FATAL] Environment validation failed:');
    for (const error of errors) {
      log.error(`  - ${error}`);
    }
    process.exit(1);
  }
}

// ── Compatibility wrapper (Copilot handoff) ────────────────────────────────
// Re-exports getEnvironmentValidationReport from the canonical startup validator.
// This preserves the older API shape while routing to the single source of truth.
export { getEnvironmentValidationReport } from '../startup/validateEnvironment';
