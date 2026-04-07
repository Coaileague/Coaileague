const CRITICAL_VARS = [
  'DATABASE_URL',
  'SESSION_SECRET',          // express-session secret (auth.ts asserts at startup)
  'ENCRYPTION_KEY',          // AES-256-GCM master key (encryption.ts)
  'RESEND_API_KEY',
  'TWILIO_ACCOUNT_SID',
  'TWILIO_AUTH_TOKEN',
  'STRIPE_SECRET_KEY',
  'STRIPE_WEBHOOK_SECRET',
  'BASE_URL',
  'GEMINI_API_KEY',
  'ANTHROPIC_API_KEY',
  'OPENAI_API_KEY',
  'GRANDFATHERED_TENANT_ID',
];

const BILLING_VARS = [
  'STRIPE_PRICE_STARTER_MONTHLY',
  'STRIPE_PRICE_STARTER_ANNUAL',
  'STRIPE_PRICE_PROFESSIONAL_MONTHLY',
  'STRIPE_PRICE_PROFESSIONAL_ANNUAL',
  'STRIPE_PRICE_BUSINESS_MONTHLY',
  'STRIPE_PRICE_BUSINESS_ANNUAL',
  'STRIPE_PRICE_ENTERPRISE_MONTHLY',
  'STRIPE_PRICE_ENTERPRISE_ANNUAL',
  'STRIPE_PRICE_VOICE_PLATINUM_STARTER',
  'STRIPE_PRICE_VOICE_PLATINUM_PROFESSIONAL',
  'STRIPE_PRICE_VOICE_PLATINUM_BUSINESS',
  'STRIPE_PRICE_VOICE_PLATINUM_ENTERPRISE',
];

const SEAT_OVERAGE_TIER_VARS = [
  'STRIPE_PRICE_STARTER_SEAT_OVERAGE',
  'STRIPE_PRICE_PROFESSIONAL_SEAT_OVERAGE',
  'STRIPE_PRICE_BUSINESS_SEAT_OVERAGE',
  'STRIPE_PRICE_ENTERPRISE_SEAT_OVERAGE',
];

export function validateEnvironment(): void {
  const missing: string[] = [];
  const warned: string[] = [];

  for (const v of CRITICAL_VARS) {
    if (!process.env[v]) missing.push(v);
  }

  for (const v of BILLING_VARS) {
    if (!process.env[v]) warned.push(v);
  }

  const genericSeatOverage = process.env.STRIPE_PRICE_SEAT_OVERAGE;
  const missingSeatOverageTiers = SEAT_OVERAGE_TIER_VARS.filter((v) => !process.env[v]);
  if (missingSeatOverageTiers.length > 0) {
    if (genericSeatOverage) {
      console.info(
        `[INFO] Tier-specific seat overage prices not set (${missingSeatOverageTiers.join(', ')}). ` +
        `Falling back to generic STRIPE_PRICE_SEAT_OVERAGE for all tiers.`
      );
      for (const v of missingSeatOverageTiers) {
        process.env[v] = genericSeatOverage;
      }
    } else {
      missingSeatOverageTiers.forEach((v) => warned.push(v));
    }
  }

  if (missing.length > 0) {
    console.error('FATAL: Missing critical environment variables:');
    missing.forEach((v) => console.error(`  MISSING: ${v}`));
    if (process.env.NODE_ENV === 'production') {
      process.exit(1);
    } else {
      console.warn(
        `WARNING: ${missing.length} critical env vars missing. ` +
        `In development, continuing with reduced functionality.`
      );
    }
  }

  if (warned.length > 0) {
    console.warn('WARNING: Missing billing environment variables:');
    warned.forEach((v) => console.warn(`  MISSING: ${v}`));
    console.warn('Billing features may not work correctly.');
  }

  if (missing.length === 0) {
    console.log('Environment validation passed');
  }
}
