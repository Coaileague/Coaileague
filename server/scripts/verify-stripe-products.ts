import Stripe from 'stripe';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, { apiVersion: '2025-09-30.clover' });

async function main() {
  const products = await stripe.products.list({ limit: 50, active: true });
  const coa = products.data.filter(p => p.name.includes('CoAIleague'));

  console.log(`\nCoAIleague products in Stripe: ${coa.length}\n`);

  const EXPECTED_TIERS = ['trial', 'starter', 'professional', 'business', 'enterprise', 'strategic'];
  const foundTiers = new Set<string>();

  for (const p of coa) {
    const tier = p.metadata?.tier || 'unknown';
    foundTiers.add(tier);
    const prices = await stripe.prices.list({ product: p.id, active: true, limit: 30 });
    const licensed = prices.data.filter(pr => pr.recurring?.usage_type === 'licensed');
    const metered = prices.data.filter(pr => pr.recurring?.usage_type === 'metered');

    console.log(`📦 ${p.name}`);
    console.log(`   ID:   ${p.id}   tier=${tier}`);
    licensed.forEach(pr => {
      const amt = pr.unit_amount !== null ? `$${(pr.unit_amount / 100).toFixed(2)}` : '$0.00';
      console.log(`   [licensed] ${(pr.nickname || pr.id).padEnd(38)} ${amt}/${pr.recurring?.interval}`);
    });
    metered.forEach(pr => {
      const amt = pr.unit_amount !== null ? `$${(pr.unit_amount / 100).toFixed(4)}` : 'custom';
      console.log(`   [metered]  ${(pr.nickname || pr.id).padEnd(38)} ${amt}/unit`);
    });
    console.log('');
  }

  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('TIER CHECK:');
  for (const t of EXPECTED_TIERS) {
    const ok = foundTiers.has(t);
    console.log(`  ${ok ? '✓' : '✗'} ${t}`);
  }

  const EXPECTED_PRICES: Record<string, { monthly?: number; annual?: number }> = {
    starter:      { monthly: 19900,   annual: 199000  },
    professional: { monthly: 74900,   annual: 749000  },
    business:     { monthly: 224900,  annual: 2249000 },
    enterprise:   { monthly: 699900,  annual: 6999000 },
  };

  console.log('\nPRICE CHECK:');
  for (const p of coa) {
    const tier = p.metadata?.tier;
    if (!tier || !EXPECTED_PRICES[tier]) continue;
    const prices = await stripe.prices.list({ product: p.id, active: true, limit: 30 });
    const expected = EXPECTED_PRICES[tier];
    const hasMonthly = prices.data.some(pr => pr.unit_amount === expected.monthly && pr.recurring?.interval === 'month' && pr.recurring?.usage_type === 'licensed');
    const hasAnnual  = prices.data.some(pr => pr.unit_amount === expected.annual  && pr.recurring?.interval === 'year'  && pr.recurring?.usage_type === 'licensed');
    console.log(`  ${tier.padEnd(14)} monthly: ${hasMonthly ? '✓' : '✗ MISMATCH'} ($${(expected.monthly!/100).toFixed(2)})   annual: ${hasAnnual ? '✓' : '✗ MISMATCH'} ($${(expected.annual!/100).toFixed(2)})`);
  }

  // ==========================================================================
  // SERVICE CHARGE + METERED ENV VARS
  // Confirms the per-use transactional billing products are wired into Railway
  // ==========================================================================
  const SERVICE_CHARGE_ENV_VARS = [
    'STRIPE_EMPLOYMENT_VERIFY_PRICE_ID',
    'STRIPE_TAC_DOCUMENT_PRICE_ID',
    'STRIPE_TOPS_VERIFY_PRICE_ID',
    'STRIPE_GUEST_VOICE_PRICE_ID',
    'STRIPE_W2_FORM_PRICE_ID',
    'STRIPE_1099_NEC_PRICE_ID',
    'STRIPE_BACKGROUND_CHECK_PRICE_ID',
    'STRIPE_MIDDLEWARE_PAYROLL_PRICE_ID',
    'STRIPE_AI_VOICE_AUTH_METERED_PRICE_ID',
    'STRIPE_AI_SMS_AUTH_METERED_PRICE_ID',
  ];

  console.log('\nSERVICE CHARGE PRICE IDs:');
  for (const envVar of SERVICE_CHARGE_ENV_VARS) {
    const val = process.env[envVar];
    console.log(`  ${val ? '✓' : '✗ MISSING'} ${envVar}${val ? ` = ${val}` : ''}`);
  }

  console.log('\n✅ Verification complete');
}

main().catch(err => { console.error(err); process.exit(1); });
