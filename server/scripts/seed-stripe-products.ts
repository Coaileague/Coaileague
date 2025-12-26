/**
 * Stripe Product Seeding Script
 * ==============================
 * Creates all CoAIleague products and prices in Stripe.
 * Run this script to set up the complete billing catalog.
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
    query: `name:'${name}'`,
  });

  if (existingProducts.data.length > 0) {
    console.log(`  Found existing product: ${name}`);
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

  console.log(`  Created product: ${name} (${product.id})`);
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
    console.log(`    Found existing price: ${nickname} ($${unitAmount / 100}/${interval})`);
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

  console.log(`    Created price: ${nickname} - $${unitAmount / 100}/${interval} (${price.id})`);
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
    console.log(`    Found existing price: ${nickname} ($${unitAmount / 100})`);
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

  console.log(`    Created price: ${nickname} - $${unitAmount / 100} one-time (${price.id})`);
  return price.id;
}

async function seedProducts() {
  console.log('🚀 CoAIleague Stripe Product Seeding\n');
  console.log('=' .repeat(60));

  const envVars: Record<string, string> = {};

  // ==========================================================================
  // 1. SUBSCRIPTION TIERS
  // ==========================================================================
  console.log('\n📦 Creating Subscription Tiers...\n');

  // Starter Plan
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

    const starterYearlyPriceId = await findOrCreatePrice(
      starterProductId,
      BILLING.tiers.starter.yearlyPrice,
      'year',
      'Starter Yearly (2 months free)'
    );
    envVars['STRIPE_STARTER_YEARLY_PRICE_ID'] = starterYearlyPriceId;
  }

  // Professional Plan
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

    const proYearlyPriceId = await findOrCreatePrice(
      proProductId,
      BILLING.tiers.professional.yearlyPrice,
      'year',
      'Professional Yearly (2 months free)'
    );
    envVars['STRIPE_PROFESSIONAL_YEARLY_PRICE_ID'] = proYearlyPriceId;
  }

  // Enterprise (Contact Sales - no automatic pricing)
  const enterpriseProductId = await findOrCreateProduct(
    'CoAIleague Enterprise',
    BILLING.tiers.enterprise.description,
    { tier: 'enterprise', contactSales: 'true' }
  );
  console.log(`    Enterprise product created (pricing handled via sales)`);

  // ==========================================================================
  // 2. PER-SEAT ADD-ONS
  // ==========================================================================
  console.log('\n👥 Creating Per-Seat Add-ons...\n');

  // Additional Employee Seats
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

  // Additional Manager Seats
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

  // Legacy overage price (for backwards compatibility)
  envVars['STRIPE_EMPLOYEE_OVERAGE_PRICE_ID'] = employeeSeatPriceId;

  // ==========================================================================
  // 3. TRINITY AI CREDIT BUNDLES
  // ==========================================================================
  console.log('\n🤖 Creating Trinity AI Credit Bundles...\n');

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

  // Default addon credits price
  envVars['STRIPE_ADDON_CREDITS_PRICE_ID'] = envVars['STRIPE_CREDITS_STANDARD_PRICE_ID'];

  // ==========================================================================
  // 4. METERED USAGE - SKIPPED (Stripe API 2025+ requires Billing Meters)
  // For now, we use prepaid credit bundles with auto top-up instead
  // ==========================================================================
  console.log('\n📊 Metered Usage: Using prepaid credit bundle model instead\n');
  console.log('   (Auto top-up will purchase new credit packs when balance is low)');

  // ==========================================================================
  // OUTPUT ENVIRONMENT VARIABLES
  // ==========================================================================
  console.log('\n' + '=' .repeat(60));
  console.log('\n✅ Stripe products created successfully!\n');
  console.log('📋 Add these environment variables to your Replit secrets:\n');
  console.log('-'.repeat(60));

  for (const [key, value] of Object.entries(envVars)) {
    console.log(`${key}=${value}`);
  }

  console.log('-'.repeat(60));
  console.log('\n💡 Pricing Summary:');
  console.log(`   Starter: $${BILLING.tiers.starter.monthlyPrice / 100}/mo (${BILLING.tiers.starter.maxEmployees} employees, ${BILLING.tiers.starter.maxManagers} managers)`);
  console.log(`   Professional: $${BILLING.tiers.professional.monthlyPrice / 100}/mo (${BILLING.tiers.professional.maxEmployees} employees, ${BILLING.tiers.professional.maxManagers} managers)`);
  console.log(`   Additional Employee: $${BILLING.seatPricing.employee.pricePerMonth / 100}/user/mo`);
  console.log(`   Additional Manager: $${BILLING.seatPricing.manager.pricePerMonth / 100}/user/mo`);
  console.log(`   Credit Bundles: $${BILLING.creditPacks.starter.price / 100} - $${BILLING.creditPacks.enterprise.price / 100}`);

  return envVars;
}

// Run the seeding
seedProducts()
  .then(() => {
    console.log('\n🎉 Done! Your Stripe catalog is ready.');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\n❌ Error seeding products:', error);
    process.exit(1);
  });
