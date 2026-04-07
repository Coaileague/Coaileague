/**
 * scripts/prod/validate-required-env.ts
 *
 * PURPOSE: Verify all required production environment variables are set.
 *          Prints a clear PASS/FAIL for each and a summary of blockers.
 *
 * READ-ONLY — no mutations. Safe to run at any time.
 *
 * Usage:
 *   npx tsx scripts/prod/validate-required-env.ts
 */

const DIVIDER = '═'.repeat(60);

interface EnvCheck {
  key: string;
  required: boolean;
  description: string;
  validator?: (val: string) => string | null; // return error string or null if OK
}

const CHECKS: EnvCheck[] = [
  // === Critical blockers ===
  {
    key: 'GRANDFATHERED_TENANT_ID',
    required: true,
    description: 'Statewide workspace UUID — billing shield',
    validator: (v) => v.length < 10 ? 'looks too short for a UUID' : null,
  },
  {
    key: 'GRANDFATHERED_TENANT_OWNER_ID',
    required: true,
    description: 'Statewide owner user ID — owner reference',
    validator: (v) => v.length < 10 ? 'looks too short for a UUID' : null,
  },
  {
    key: 'ALLOWED_ORIGINS',
    required: true,
    description: 'CORS origin lockdown (e.g. https://coaileague.com)',
    validator: (v) => !v.startsWith('https://') ? 'must start with https://' : null,
  },
  {
    key: 'TWILIO_PHONE_NUMBER_SID',
    required: true,
    description: 'Twilio phone number SID (e.g. PN...)',
    validator: (v) => !v.startsWith('PN') ? 'should start with PN' : null,
  },

  // === Should already be set ===
  {
    key: 'NODE_ENV',
    required: true,
    description: 'Must be "production"',
    validator: (v) => v !== 'production' ? `set to "${v}" — should be "production"` : null,
  },
  {
    key: 'SESSION_SECRET',
    required: true,
    description: 'Session signing secret',
    validator: (v) => v.length < 32 ? 'too short — use at least 32 chars' : null,
  },
  {
    key: 'DATABASE_URL',
    required: true,
    description: 'PostgreSQL connection string',
  },
  {
    key: 'STRIPE_LIVE_SECRET_KEY',
    required: true,
    description: 'Stripe live secret key (sk_live_...)',
    validator: (v) => !v.startsWith('sk_live_') ? 'should start with sk_live_' : null,
  },
  {
    key: 'STRIPE_LIVE_WEBHOOK_SECRET',
    required: true,
    description: 'Stripe live webhook signing secret',
    validator: (v) => !v.startsWith('whsec_') ? 'should start with whsec_' : null,
  },
  {
    key: 'RESEND_API_KEY',
    required: true,
    description: 'Resend email API key',
    validator: (v) => !v.startsWith('re_') ? 'should start with re_' : null,
  },
  {
    key: 'TWILIO_ACCOUNT_SID',
    required: true,
    description: 'Twilio account SID',
    validator: (v) => !v.startsWith('AC') ? 'should start with AC' : null,
  },
  {
    key: 'TWILIO_AUTH_TOKEN',
    required: true,
    description: 'Twilio auth token',
  },
  {
    key: 'TWILIO_PHONE_NUMBER',
    required: true,
    description: 'Twilio phone number (e.g. +1...)',
    validator: (v) => !v.startsWith('+') ? 'should start with +' : null,
  },
  {
    key: 'JWT_SECRET',
    required: true,
    description: 'JWT signing secret',
    validator: (v) => v.length < 20 ? 'too short — use at least 32 chars' : null,
  },

  // === Optional but recommended ===
  {
    key: 'PLAID_CLIENT_ID',
    required: false,
    description: 'Plaid client ID (required if payroll is live)',
  },
  {
    key: 'PLAID_SECRET',
    required: false,
    description: 'Plaid production secret (required if payroll is live)',
  },
  {
    key: 'PLAID_ENV',
    required: false,
    description: 'Plaid environment — should be "production" when live',
    validator: (v) => v !== 'production' ? `set to "${v}" — use "production" for live payroll` : null,
  },
  {
    key: 'COMPANY_NAME',
    required: false,
    description: 'Platform brand name (defaults to CoAIleague if unset)',
  },
];

function main() {
  console.log('\n' + DIVIDER);
  console.log(' VALIDATE REQUIRED ENV VARS');
  console.log(DIVIDER + '\n');

  const blockers: string[] = [];
  const warnings: string[] = [];

  CHECKS.forEach(check => {
    const val = process.env[check.key];
    const label = check.required ? '[REQUIRED]' : '[OPTIONAL]';

    if (!val) {
      if (check.required) {
        console.log(`❌  ${check.key}`);
        console.log(`    ${label} MISSING — ${check.description}\n`);
        blockers.push(check.key);
      } else {
        console.log(`⚠️   ${check.key}`);
        console.log(`    ${label} not set — ${check.description}\n`);
        warnings.push(check.key);
      }
      return;
    }

    // Value exists — run validator if any
    const validationError = check.validator ? check.validator(val) : null;
    if (validationError) {
      const severity = check.required ? '❌ ' : '⚠️ ';
      console.log(`${severity} ${check.key}`);
      console.log(`    ${label} SET but invalid: ${validationError}\n`);
      if (check.required) blockers.push(`${check.key} (invalid value)`);
      else warnings.push(`${check.key} (invalid value)`);
    } else {
      // Redact secrets in output
      const secret = check.key.includes('SECRET') || check.key.includes('KEY') ||
                     check.key.includes('TOKEN') || check.key.includes('PASSWORD') ||
                     check.key.includes('URL');
      const display = secret ? val.substring(0, 8) + '...' : val;
      console.log(`✅  ${check.key} = ${display}`);
      console.log(`    ${check.description}\n`);
    }
  });

  console.log('\n' + DIVIDER);
  console.log(' SUMMARY');
  console.log(DIVIDER);

  if (blockers.length === 0) {
    console.log('\n✅  ALL REQUIRED ENV VARS ARE SET. No blockers.\n');
  } else {
    console.log(`\n❌  ${blockers.length} LAUNCH BLOCKER(S):\n`);
    blockers.forEach(b => console.log(`    • ${b}`));
    console.log('');
  }

  if (warnings.length > 0) {
    console.log(`⚠️   ${warnings.length} optional var(s) not set:\n`);
    warnings.forEach(w => console.log(`    • ${w}`));
    console.log('');
  }

  console.log(DIVIDER + '\n');
  process.exit(blockers.length > 0 ? 1 : 0);
}

main();
