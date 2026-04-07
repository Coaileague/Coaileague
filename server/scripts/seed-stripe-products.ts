/**
 * Stripe Product Seeding Script — COMPLETE CATALOG
 * ==================================================
 * Creates ALL CoAIleague products and prices in Stripe:
 *   1. Subscription Tiers (Starter, Professional, Enterprise)
 *   2. Per-Seat Overages (tiered rates per plan)
 *   3. Enterprise Per-Seat Pricing
 *   4. Add-On Products (Claude Premium, AI CFO, Multi-Location, Fleet)
 *   5. Trinity AI Credit Bundles
 *   6. Middleware Fee Products (Payroll, Invoice, ACH, Payout)
 *   7. One-Time Setup Fees
 *
 * Idempotent: safe to re-run — finds existing products/prices before creating.
 *
 * Usage: npx tsx server/scripts/seed-stripe-products.ts
 */

import Stripe from 'stripe';
import { BILLING } from '../../shared/billingConfig';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: '2025-09-30.clover',
});

interface CreatedProduct {
  productId: string;
  priceId: string;
  yearlyPriceId?: string;
  name: string;
}

async function findOrCreateProduct(name: string, description: string, metadata: Record<string, string> = {}): Promise<string> {
  const existingProducts = await stripe.products.search({
    query: `name:'${name.replace(/'/g, "\\'")}'`,
  });

  if (existingProducts.data.length > 0) {
    console.log(`  [exists] ${name}`);
    return existingProducts.data[0].id;
  }

  const product = await stripe.products.create({
    name,
    description,
    metadata: {
      platform: 'coaileague',
      ...metadata,
    },
  });

  console.log(`  [created] ${name} (${product.id})`);
  return product.id;
}

async function findOrCreatePrice(
  productId: string,
  unitAmount: number,
  interval: 'month' | 'year',
  nickname: string,
  usageType: 'licensed' | 'metered' = 'licensed'
): Promise<string> {
  const existingPrices = await stripe.prices.list({
    product: productId,
    active: true,
  });

  const existing = existingPrices.data.find(p =>
    p.unit_amount === unitAmount &&
    p.recurring?.interval === interval &&
    p.recurring?.usage_type === usageType
  );

  if (existing) {
    console.log(`    [exists] ${nickname} ($${unitAmount / 100}/${interval})`);
    return existing.id;
  }

  const price = await stripe.prices.create({
    product: productId,
    unit_amount: unitAmount,
    currency: 'usd',
    recurring: {
      interval,
      usage_type: usageType,
    },
    nickname,
    metadata: {
      platform: 'coaileague',
    },
  });

  console.log(`    [created] ${nickname} - $${unitAmount / 100}/${interval} (${price.id})`);
  return price.id;
}

async function createOneTimePrice(
  productId: string,
  unitAmount: number,
  nickname: string
): Promise<string> {
  const existingPrices = await stripe.prices.list({
    product: productId,
    active: true,
  });

  const existing = existingPrices.data.find(p =>
    p.unit_amount === unitAmount &&
    !p.recurring
  );

  if (existing) {
    console.log(`    [exists] ${nickname} ($${unitAmount / 100})`);
    return existing.id;
  }

  const price = await stripe.prices.create({
    product: productId,
    unit_amount: unitAmount,
    currency: 'usd',
    nickname,
    metadata: {
      platform: 'coaileague',
    },
  });

  console.log(`    [created] ${nickname} - $${unitAmount / 100} one-time (${price.id})`);
  return price.id;
}

async function seedProducts() {
  console.log('\nCoAIleague Stripe Product Catalog Sync\n');
  console.log('='.repeat(60));

  const envVars: Record<string, string> = {};

  // ==========================================================================
  // 1. SUBSCRIPTION TIERS
  // ==========================================================================
  console.log('\n--- SUBSCRIPTION TIERS ---\n');

  // Starter Plan — $899/mo, $8,988/yr
  if (BILLING.tiers.starter.monthlyPrice > 0) {
    const starterProductId = await findOrCreateProduct(
      'CoAIleague Starter',
      BILLING.tiers.starter.description,
      { tier: 'starter', maxEmployees: String(BILLING.tiers.starter.maxEmployees) }
    );

    const starterMonthlyPriceId = await findOrCreatePrice(
      starterProductId,
      BILLING.tiers.starter.monthlyPrice,
      'month',
      'Starter Monthly'
    );
    envVars['STRIPE_STARTER_MONTHLY_PRICE_ID'] = starterMonthlyPriceId;

    if (BILLING.tiers.starter.yearlyPrice > 0) {
      const starterYearlyPriceId = await findOrCreatePrice(
        starterProductId,
        BILLING.tiers.starter.yearlyPrice,
        'year',
        'Starter Yearly (17% savings)'
      );
      envVars['STRIPE_STARTER_YEARLY_PRICE_ID'] = starterYearlyPriceId;
    }
  }

  // Professional Plan — $1,999/mo, $19,988/yr
  if (BILLING.tiers.professional.monthlyPrice > 0) {
    const proProductId = await findOrCreateProduct(
      'CoAIleague Professional',
      BILLING.tiers.professional.description,
      { tier: 'professional', maxEmployees: String(BILLING.tiers.professional.maxEmployees) }
    );

    const proMonthlyPriceId = await findOrCreatePrice(
      proProductId,
      BILLING.tiers.professional.monthlyPrice,
      'month',
      'Professional Monthly'
    );
    envVars['STRIPE_PROFESSIONAL_MONTHLY_PRICE_ID'] = proMonthlyPriceId;

    if (BILLING.tiers.professional.yearlyPrice > 0) {
      const proYearlyPriceId = await findOrCreatePrice(
        proProductId,
        BILLING.tiers.professional.yearlyPrice,
        'year',
        'Professional Yearly (17% savings)'
      );
      envVars['STRIPE_PROFESSIONAL_YEARLY_PRICE_ID'] = proYearlyPriceId;
    }
  }

  // Enterprise Plan — $9,999/mo base + $15/seat
  const enterpriseProductId = await findOrCreateProduct(
    'CoAIleague Enterprise',
    BILLING.tiers.enterprise.description,
    { tier: 'enterprise', pricingModel: 'base_plus_per_seat' }
  );

  const enterpriseMonthlyPriceId = await findOrCreatePrice(
    enterpriseProductId,
    BILLING.tiers.enterprise.monthlyPrice,
    'month',
    'Enterprise Monthly Base ($9,999)'
  );
  envVars['STRIPE_ENTERPRISE_MONTHLY_PRICE_ID'] = enterpriseMonthlyPriceId;

  // Enterprise per-seat ($15/employee — separate line item on subscription)
  const enterpriseSeatProductId = await findOrCreateProduct(
    'CoAIleague Enterprise Per-Seat',
    'Per-employee seat for Enterprise plan - $15/employee/month',
    { tier: 'enterprise', type: 'per_seat' }
  );

  const enterpriseSeatPriceId = await findOrCreatePrice(
    enterpriseSeatProductId,
    BILLING.tiers.enterprise.perEmployeePrice,
    'month',
    'Enterprise Seat ($15/employee/mo)'
  );
  envVars['STRIPE_ENTERPRISE_SEAT_PRICE_ID'] = enterpriseSeatPriceId;

  // ==========================================================================
  // 2. TIERED EMPLOYEE OVERAGES
  // ==========================================================================
  console.log('\n--- EMPLOYEE OVERAGES (Tiered) ---\n');

  // Starter overage: $10/employee after 15
  const starterOverageProductId = await findOrCreateProduct(
    'CoAIleague Starter Employee Overage',
    `Additional employee beyond ${BILLING.tiers.starter.maxEmployees}-employee Starter limit`,
    { type: 'overage', tier: 'starter' }
  );

  const starterOveragePriceId = await findOrCreatePrice(
    starterOverageProductId,
    BILLING.overages.starter,
    'month',
    `Starter Overage ($${BILLING.overages.starter / 100}/employee/mo)`
  );
  envVars['STRIPE_STARTER_OVERAGE_PRICE_ID'] = starterOveragePriceId;

  // Professional overage: $8/employee after 50
  const proOverageProductId = await findOrCreateProduct(
    'CoAIleague Professional Employee Overage',
    `Additional employee beyond ${BILLING.tiers.professional.maxEmployees}-employee Professional limit`,
    { type: 'overage', tier: 'professional' }
  );

  const proOveragePriceId = await findOrCreatePrice(
    proOverageProductId,
    BILLING.overages.professional,
    'month',
    `Professional Overage ($${BILLING.overages.professional / 100}/employee/mo)`
  );
  envVars['STRIPE_PROFESSIONAL_OVERAGE_PRICE_ID'] = proOveragePriceId;

  // Legacy overage (backwards compat — maps to professional rate)
  envVars['STRIPE_EMPLOYEE_OVERAGE_PRICE_ID'] = proOveragePriceId;

  // Per-seat add-ons (generic)
  const employeeSeatProductId = await findOrCreateProduct(
    'Additional Employee Seat',
    BILLING.seatPricing.employee.description,
    { type: 'seat', seatType: 'employee' }
  );
  const employeeSeatPriceId = await findOrCreatePrice(
    employeeSeatProductId,
    BILLING.seatPricing.employee.pricePerMonth,
    'month',
    'Employee Seat Monthly'
  );
  envVars['STRIPE_EMPLOYEE_SEAT_PRICE_ID'] = employeeSeatPriceId;

  const managerSeatProductId = await findOrCreateProduct(
    'Additional Manager Seat',
    BILLING.seatPricing.manager.description,
    { type: 'seat', seatType: 'manager' }
  );
  const managerSeatPriceId = await findOrCreatePrice(
    managerSeatProductId,
    BILLING.seatPricing.manager.pricePerMonth,
    'month',
    'Manager Seat Monthly'
  );
  envVars['STRIPE_MANAGER_SEAT_PRICE_ID'] = managerSeatPriceId;

  // ==========================================================================
  // 3. ADD-ON PRODUCTS (Professional tier)
  // ==========================================================================
  console.log('\n--- ADD-ON PRODUCTS ---\n');

  // Trinity Premium Unlimited — $699/mo
  const claudeProductId = await findOrCreateProduct(
    'Trinity Premium Unlimited',
    BILLING.addons.claude_premium_unlimited.description,
    { type: 'addon', addon_id: 'claude_premium_unlimited' }
  );
  const claudePriceId = await findOrCreatePrice(
    claudeProductId,
    BILLING.addons.claude_premium_unlimited.monthlyPrice,
    'month',
    'Trinity Premium Unlimited ($699/mo)'
  );
  envVars['STRIPE_ADDON_CLAUDE_PREMIUM_PRICE_ID'] = claudePriceId;

  // AI CFO Insights — $799/mo
  const cfoProductId = await findOrCreateProduct(
    'AI CFO Insights',
    BILLING.addons.ai_cfo_insights.description,
    { type: 'addon', addon_id: 'ai_cfo_insights' }
  );
  const cfoPriceId = await findOrCreatePrice(
    cfoProductId,
    BILLING.addons.ai_cfo_insights.monthlyPrice,
    'month',
    'AI CFO Insights ($799/mo)'
  );
  envVars['STRIPE_ADDON_AI_CFO_PRICE_ID'] = cfoPriceId;

  // Multi-Location Management — $399/mo per location
  const locationProductId = await findOrCreateProduct(
    'Multi-Location Management',
    BILLING.addons.multi_location.description,
    { type: 'addon', addon_id: 'multi_location', metered: 'true' }
  );
  const locationPriceId = await findOrCreatePrice(
    locationProductId,
    BILLING.addons.multi_location.monthlyPrice,
    'month',
    'Multi-Location ($399/location/mo)'
  );
  envVars['STRIPE_ADDON_LOCATION_PRICE_ID'] = locationPriceId;

  // Fleet Management — $399/mo (20 vehicles included)
  const fleetProductId = await findOrCreateProduct(
    'Fleet Management',
    BILLING.addons.fleet_management.description,
    { type: 'addon', addon_id: 'fleet_management' }
  );
  const fleetPriceId = await findOrCreatePrice(
    fleetProductId,
    BILLING.addons.fleet_management.monthlyPrice,
    'month',
    'Fleet Management ($399/mo, 20 vehicles)'
  );
  envVars['STRIPE_ADDON_FLEET_PRICE_ID'] = fleetPriceId;

  // Fleet per-vehicle overage — $20/vehicle/mo
  const fleetOveragePriceId = await findOrCreatePrice(
    fleetProductId,
    BILLING.addons.fleet_management.perVehicleOverage,
    'month',
    'Fleet Vehicle Overage ($20/vehicle/mo)'
  );
  envVars['STRIPE_ADDON_FLEET_OVERAGE_PRICE_ID'] = fleetOveragePriceId;

  // ==========================================================================
  // 4. TRINITY AI CREDIT BUNDLES
  // ==========================================================================
  console.log('\n--- TRINITY AI CREDIT BUNDLES ---\n');

  const creditProductId = await findOrCreateProduct(
    'Trinity AI Credits',
    'AI automation credits for scheduling, payroll, invoicing, and more',
    { type: 'credits' }
  );

  for (const [key, pack] of Object.entries(BILLING.creditPacks)) {
    const priceId = await createOneTimePrice(
      creditProductId,
      pack.price,
      `${pack.name} (${pack.credits.toLocaleString()} credits)`
    );
    envVars[`STRIPE_CREDITS_${key.toUpperCase()}_PRICE_ID`] = priceId;
  }
  envVars['STRIPE_ADDON_CREDITS_PRICE_ID'] = envVars['STRIPE_CREDITS_STANDARD_PRICE_ID'];

  // One-time add-on credit packs
  if (BILLING.addons.ai_credits) {
    const aiCreditsPackPriceId = await createOneTimePrice(
      creditProductId,
      BILLING.addons.ai_credits.price,
      `AI Credits Pack (${BILLING.addons.ai_credits.credits.toLocaleString()} credits)`
    );
    envVars['STRIPE_ADDON_AI_CREDITS_PRICE_ID'] = aiCreditsPackPriceId;
  }

  // ==========================================================================
  // 5. MIDDLEWARE FEE PRODUCTS — Platform Revenue
  // ==========================================================================
  console.log('\n--- MIDDLEWARE FEE PRODUCTS (Platform Revenue) ---\n');

  const mwFees = BILLING.middlewareFees;

  // Payroll Middleware — $2.50/employee/month (recurring per-seat)
  const payrollMwProductId = await findOrCreateProduct(
    'CoAIleague Payroll Middleware',
    `${mwFees.payrollMiddleware.description} - $${mwFees.payrollMiddleware.perEmployeeCents / 100}/employee/month`,
    { type: 'middleware', fee_type: 'payroll' }
  );
  const payrollMwPriceId = await findOrCreatePrice(
    payrollMwProductId,
    mwFees.payrollMiddleware.perEmployeeCents,
    'month',
    `Payroll Middleware ($${mwFees.payrollMiddleware.perEmployeeCents / 100}/emp/mo)`
  );
  envVars['STRIPE_MIDDLEWARE_PAYROLL_PRICE_ID'] = payrollMwPriceId;

  // Invoice Processing — 2.9% + $0.25 (application fee on Stripe Connect)
  // This is collected as a Stripe Connect application_fee, not a subscription line item.
  // We create the product for catalog/reporting purposes.
  const invoiceMwProductId = await findOrCreateProduct(
    'CoAIleague Invoice Processing Fee',
    `${mwFees.invoiceProcessing.description} - ${mwFees.invoiceProcessing.ratePercent}% + $${mwFees.invoiceProcessing.flatFeeCents / 100} per transaction`,
    { type: 'middleware', fee_type: 'invoice_processing', rate: String(mwFees.invoiceProcessing.ratePercent), flat_fee_cents: String(mwFees.invoiceProcessing.flatFeeCents) }
  );
  // Create a nominal $0.25 price for the flat fee component (percentage is applied dynamically)
  const invoiceFlatPriceId = await createOneTimePrice(
    invoiceMwProductId,
    mwFees.invoiceProcessing.flatFeeCents,
    `Invoice Flat Fee ($${mwFees.invoiceProcessing.flatFeeCents / 100}/txn)`
  );
  envVars['STRIPE_MIDDLEWARE_INVOICE_PRICE_ID'] = invoiceFlatPriceId;

  // ACH Payment Processing — 1.0% capped at $10
  const achMwProductId = await findOrCreateProduct(
    'CoAIleague ACH Processing Fee',
    `${mwFees.achPayments.description} - ${mwFees.achPayments.ratePercent}% capped at $${mwFees.achPayments.capCents / 100}`,
    { type: 'middleware', fee_type: 'ach', rate: String(mwFees.achPayments.ratePercent), cap_cents: String(mwFees.achPayments.capCents) }
  );
  const achCapPriceId = await createOneTimePrice(
    achMwProductId,
    mwFees.achPayments.capCents,
    `ACH Cap ($${mwFees.achPayments.capCents / 100} max)`
  );
  envVars['STRIPE_MIDDLEWARE_ACH_PRICE_ID'] = achCapPriceId;

  // Stripe Connect Payout — 0.25%
  const payoutMwProductId = await findOrCreateProduct(
    'CoAIleague Payout Fee',
    `${mwFees.stripePayouts.description} - ${mwFees.stripePayouts.ratePercent}%`,
    { type: 'middleware', fee_type: 'payout', rate: String(mwFees.stripePayouts.ratePercent) }
  );
  envVars['STRIPE_MIDDLEWARE_PAYOUT_PRODUCT_ID'] = payoutMwProductId;

  // ==========================================================================
  // 6. ONE-TIME SETUP FEES
  // ==========================================================================
  console.log('\n--- SETUP FEES ---\n');

  for (const [key, setup] of Object.entries(BILLING.setupFees)) {
    if (setup.price <= 0) {
      console.log(`  [skip] ${setup.name} (custom/contact sales)`);
      continue;
    }

    const setupProductId = await findOrCreateProduct(
      setup.name,
      setup.description,
      { type: 'setup_fee', setup_id: setup.id, category: 'onboarding' }
    );
    const setupPriceId = await createOneTimePrice(
      setupProductId,
      setup.price,
      `${setup.name} ($${setup.price / 100})`
    );
    envVars[`STRIPE_SETUP_${key.toUpperCase()}_PRICE_ID`] = setupPriceId;
  }

  // ==========================================================================
  // OUTPUT — ENV VARS + PRICING SUMMARY
  // ==========================================================================
  console.log('\n' + '='.repeat(60));
  console.log('\nStripe catalog synced successfully!\n');
  console.log('Environment variables to set:\n');
  console.log('-'.repeat(60));

  for (const [key, value] of Object.entries(envVars)) {
    console.log(`${key}=${value}`);
  }

  console.log('-'.repeat(60));
  console.log('\nPricing Summary:');
  console.log(`  Starter:      $${BILLING.tiers.starter.monthlyPrice / 100}/mo | ${BILLING.tiers.starter.maxEmployees} employees | +$${BILLING.overages.starter / 100}/emp overage`);
  console.log(`  Professional: $${BILLING.tiers.professional.monthlyPrice / 100}/mo | ${BILLING.tiers.professional.maxEmployees} employees | +$${BILLING.overages.professional / 100}/emp overage`);
  console.log(`  Enterprise:   $${BILLING.tiers.enterprise.monthlyPrice / 100}/mo base + $${BILLING.tiers.enterprise.perEmployeePrice / 100}/seat`);
  console.log('');
  console.log('Middleware Fees (platform passive income):');
  console.log(`  Invoice:  ${mwFees.invoiceProcessing.ratePercent}% + $${mwFees.invoiceProcessing.flatFeeCents / 100}/txn`);
  console.log(`  ACH:      ${mwFees.achPayments.ratePercent}% (capped $${mwFees.achPayments.capCents / 100})`);
  console.log(`  Payroll:  $${mwFees.payrollMiddleware.perEmployeeCents / 100}/employee/mo`);
  console.log(`  Payouts:  ${mwFees.stripePayouts.ratePercent}%`);
  console.log('');
  console.log('Add-ons:');
  console.log(`  Trinity Premium: $${BILLING.addons.claude_premium_unlimited.monthlyPrice / 100}/mo`);
  console.log(`  AI CFO:          $${BILLING.addons.ai_cfo_insights.monthlyPrice / 100}/mo`);
  console.log(`  Multi-Location:  $${BILLING.addons.multi_location.monthlyPrice / 100}/location/mo`);
  console.log(`  Fleet:           $${BILLING.addons.fleet_management.monthlyPrice / 100}/mo (${BILLING.addons.fleet_management.includedVehicles} vehicles)`);
  console.log('');
  console.log(`Credit Bundles: $${BILLING.creditPacks.starter.price / 100} - $${BILLING.creditPacks.enterprise.price / 100}`);

  return envVars;
}

seedProducts()
  .then(() => {
    console.log('\nDone! Stripe catalog is live-ready.\n');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\nError seeding products:', error);
    process.exit(1);
  });
