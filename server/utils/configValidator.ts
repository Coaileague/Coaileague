/**
 * CONFIGURATION VALIDATOR
 * =======================
 * Validates critical configuration values at application startup.
 * Prevents deployment of misconfigured applications.
 *
 * Call validateConfiguration() early in server startup to catch
 * configuration errors before they cause runtime failures.
 */

import { AI } from '../config/platformConfig';
import { createLogger } from '../lib/logger';
import { isProduction as isProductionEnv } from '../lib/isProduction';
const log = createLogger('configValidator');


interface ConfigValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
}

interface ConfigValidation {
  name: string;
  required: boolean;
  value: string | undefined;
  validate?: (value: string) => boolean;
  errorMessage?: string;
}

// Critical environment variables that must be set
const REQUIRED_CONFIGS: ConfigValidation[] = [
  {
    name: 'DATABASE_URL',
    required: true,
    value: process.env.DATABASE_URL,
    validate: (v) => v.startsWith('postgres'),
    errorMessage: 'DATABASE_URL must be a PostgreSQL connection string',
  },
  {
    name: 'SESSION_SECRET',
    required: true,
    value: process.env.SESSION_SECRET,
    validate: (v) => v.length >= 32,
    errorMessage: 'SESSION_SECRET must be at least 32 characters',
  },
];

const PRODUCTION_REQUIRED_CONFIGS: ConfigValidation[] = [
  {
    name: 'ENCRYPTION_KEY',
    required: true,
    value: process.env.ENCRYPTION_KEY,
    validate: (v) => /^[0-9a-f]{64}$/i.test(v),
    errorMessage: 'ENCRYPTION_KEY must be a 64-char hex string (generate with: openssl rand -hex 32)',
  },
  {
    name: 'ALLOWED_ORIGINS',
    required: true,
    value: process.env.ALLOWED_ORIGINS,
    validate: (v) => v.split(',').every((o: string) => o.trim().startsWith('https://')),
    errorMessage: 'ALLOWED_ORIGINS must be a comma-separated list of HTTPS origins (e.g. https://app.coaileague.com)',
  },
];

const RECOMMENDED_CONFIGS: ConfigValidation[] = [
  {
    name: 'GEMINI_API_KEY',
    required: false,
    value: process.env.GEMINI_API_KEY,
    validate: (v) => v.length > 10,
    errorMessage: 'GEMINI_API_KEY appears invalid',
  },
  {
    name: 'RESEND_API_KEY',
    required: false,
    value: process.env.RESEND_API_KEY,
    validate: (v) => v.startsWith('re_'),
    errorMessage: 'RESEND_API_KEY should start with "re_"',
  },
  {
    name: 'STRIPE_SECRET_KEY',
    required: false,
    value: process.env.STRIPE_SECRET_KEY,
    validate: (v) => v.startsWith('sk_'),
    errorMessage: 'STRIPE_SECRET_KEY should start with "sk_"',
  },
  {
    name: 'RESEND_WEBHOOK_SECRET',
    required: false,
    value: process.env.RESEND_WEBHOOK_SECRET,
    errorMessage: 'RESEND_WEBHOOK_SECRET not set - webhook signature verification disabled',
  },
  {
    name: 'TWILIO_AUTH_TOKEN',
    required: false,
    value: process.env.TWILIO_AUTH_TOKEN,
    errorMessage: 'TWILIO_AUTH_TOKEN not set - Twilio webhook signature validation is disabled. In production this will cause all Twilio webhooks (SMS opt-out, shift acceptance, voice interviews) to be rejected with 503.',
  },
];

// Numeric values that must be within valid ranges
const NUMERIC_VALIDATIONS: Array<{
  name: string;
  value: number;
  min?: number;
  max?: number;
  errorMessage: string;
}> = [
  {
    name: 'Payroll Default Rate',
    value: parseFloat(process.env.VITE_PAYROLL_DEFAULT_RATE || '15.00'),
    min: 7.25, // Federal minimum wage
    max: 500, // Reasonable upper bound
    errorMessage: 'Payroll default rate must be between $7.25 and $500/hr',
  },
  {
    name: 'Session Timeout',
    value: parseInt(process.env.SESSION_TIMEOUT || '1800000', 10),
    min: 60000, // 1 minute minimum
    max: 86400000, // 24 hours maximum
    errorMessage: 'Session timeout must be between 1 minute and 24 hours',
  },
  {
    name: 'Max Discount Percentage',
    value: AI.maxDiscountPercent,
    min: 0,
    max: 100,
    errorMessage: 'Max discount percentage must be between 0 and 100',
  },
];

/**
 * Validate all critical configuration at startup
 * Returns errors for required configs and warnings for recommended configs
 */
export function validateConfiguration(): ConfigValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  // Check required configurations
  for (const config of REQUIRED_CONFIGS) {
    if (!config.value) {
      errors.push(`[CRITICAL] Missing required config: ${config.name}`);
    } else if (config.validate && !config.validate(config.value)) {
      errors.push(`[CRITICAL] Invalid ${config.name}: ${config.errorMessage}`);
    }
  }

  // Check recommended configurations (warnings only)
  for (const config of RECOMMENDED_CONFIGS) {
    if (!config.value) {
      warnings.push(`[WARNING] Missing recommended config: ${config.name} - ${config.errorMessage || 'Some features may be disabled'}`);
    } else if (config.validate && !config.validate(config.value)) {
      warnings.push(`[WARNING] ${config.name}: ${config.errorMessage}`);
    }
  }

  // Check numeric validations
  for (const validation of NUMERIC_VALIDATIONS) {
    if (isNaN(validation.value)) {
      errors.push(`[CRITICAL] ${validation.name} is not a valid number`);
    } else if (validation.min !== undefined && validation.value < validation.min) {
      errors.push(`[CRITICAL] ${validation.name} (${validation.value}) below minimum (${validation.min}): ${validation.errorMessage}`);
    } else if (validation.max !== undefined && validation.value > validation.max) {
      errors.push(`[CRITICAL] ${validation.name} (${validation.value}) above maximum (${validation.max}): ${validation.errorMessage}`);
    }
  }

  // Use the canonical isProduction helper (Replit, Railway, Cloud Run, NODE_ENV=production)
  const isProduction = isProductionEnv();
  if (isProduction) {
    for (const config of PRODUCTION_REQUIRED_CONFIGS) {
      if (!config.value) {
        errors.push(`[CRITICAL] Missing production-required config: ${config.name}`);
      } else if (config.validate && !config.validate(config.value)) {
        errors.push(`[CRITICAL] Invalid ${config.name}: ${config.errorMessage}`);
      }
    }
  } else {
    for (const config of PRODUCTION_REQUIRED_CONFIGS) {
      if (!config.value) {
        warnings.push(`[WARNING] Missing ${config.name} — required in production. ${config.errorMessage || ''}`);
      }
    }
  }

  // Check for dangerous default values
  if (process.env.VITE_PAYROLL_DEFAULT_RATE === '0.00' || process.env.VITE_PAYROLL_DEFAULT_RATE === '0') {
    errors.push('[CRITICAL] VITE_PAYROLL_DEFAULT_RATE cannot be $0.00 - this would allow zero-pay payroll');
  }

  // Check Stripe configuration completeness
  const stripeKey = process.env.STRIPE_SECRET_KEY;
  const stripeWebhook = process.env.STRIPE_WEBHOOK_SECRET;
  if (stripeKey && !stripeWebhook) {
    warnings.push('[WARNING] STRIPE_SECRET_KEY set but STRIPE_WEBHOOK_SECRET missing - webhooks will fail');
  }

  if (isProduction) {
    if (stripeKey?.includes('_test_')) {
      warnings.push('[WARNING] Using Stripe TEST keys in production environment');
    }
    if (process.env.QUICKBOOKS_ENVIRONMENT === 'sandbox') {
      warnings.push('[WARNING] Using QuickBooks SANDBOX in production environment');
    }
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
  };
}

/**
 * Run validation and log results
 * Call this during server startup
 */
export function validateAndLogConfiguration(): boolean {
  log.info('[ConfigValidator] Running startup configuration validation...');

  const result = validateConfiguration();

  // Log warnings
  for (const warning of result.warnings) {
    log.warn(warning);
  }

  // Log errors
  for (const error of result.errors) {
    log.error(error);
  }

  if (result.valid) {
    log.info(`[ConfigValidator] Configuration valid (${result.warnings.length} warnings)`);
  } else {
    log.error(`[ConfigValidator] CONFIGURATION INVALID - ${result.errors.length} errors, ${result.warnings.length} warnings`);
  }

  return result.valid;
}

/**
 * Parse boolean environment variable consistently
 * Handles 'true', 'false', '1', '0', and undefined
 */
export function parseEnvBoolean(value: string | undefined, defaultValue: boolean): boolean {
  if (value === undefined || value === '') {
    return defaultValue;
  }
  const normalized = value.toLowerCase().trim();
  if (normalized === 'true' || normalized === '1' || normalized === 'yes') {
    return true;
  }
  if (normalized === 'false' || normalized === '0' || normalized === 'no') {
    return false;
  }
  // Invalid value - return default and log warning
  log.warn(`[ConfigValidator] Invalid boolean value "${value}" - using default ${defaultValue}`);
  return defaultValue;
}

/**
 * Parse numeric environment variable with validation
 */
export function parseEnvNumber(
  value: string | undefined,
  defaultValue: number,
  options?: { min?: number; max?: number; name?: string }
): number {
  if (value === undefined || value === '') {
    return defaultValue;
  }

  const parsed = parseFloat(value);
  if (isNaN(parsed)) {
    log.warn(`[ConfigValidator] Invalid number "${value}" for ${options?.name || 'config'} - using default ${defaultValue}`);
    return defaultValue;
  }

  if (options?.min !== undefined && parsed < options.min) {
    log.warn(`[ConfigValidator] ${options?.name || 'Value'} ${parsed} below minimum ${options.min} - using ${options.min}`);
    return options.min;
  }

  if (options?.max !== undefined && parsed > options.max) {
    log.warn(`[ConfigValidator] ${options?.name || 'Value'} ${parsed} above maximum ${options.max} - using ${options.max}`);
    return options.max;
  }

  return parsed;
}
