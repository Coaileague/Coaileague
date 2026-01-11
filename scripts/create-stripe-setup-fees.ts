import Stripe from 'stripe';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: '2024-12-18.acacia',
});

async function createSetupFeeProducts() {
  console.log('Creating Trinity Setup Fee products in Stripe...\n');
  
  const setupFees = [
    {
      id: 'setup_starter',
      name: 'Trinity Starter Setup',
      description: 'Trinity configures basic scheduling, time tracking, and employee onboarding. Includes organization setup, employee roster import (up to 15), schedule templates, mobile app setup, and 1-hour training session.',
      price: 49900,
      envVar: 'STRIPE_SETUP_STARTER_PRICE_ID',
    },
    {
      id: 'setup_professional', 
      name: 'Trinity Professional Setup',
      description: 'Full platform configuration with QuickBooks integration, payroll automation, client billing setup, state compliance rules, custom schedule optimization, advanced dashboards, and 2-hour training session.',
      price: 149900,
      envVar: 'STRIPE_SETUP_PROFESSIONAL_PRICE_ID',
    },
    {
      id: 'setup_enterprise',
      name: 'Trinity Enterprise Setup',
      description: 'White-glove setup with multi-location configuration, custom integrations (ADP, Workday, etc.), data migration, white-label branding, API configuration, dedicated onboarding specialist, team training (up to 10 hours), and 30-day post-launch support.',
      price: 499900,
      envVar: 'STRIPE_SETUP_ENTERPRISE_PRICE_ID',
    },
  ];

  const results: { name: string; productId: string; priceId: string; envVar: string }[] = [];

  for (const fee of setupFees) {
    try {
      const product = await stripe.products.create({
        name: fee.name,
        description: fee.description,
        metadata: {
          setup_fee_id: fee.id,
          category: 'setup_fee',
          platform: 'coaileague',
        },
      });
      console.log(`Created product: ${fee.name} (${product.id})`);

      const price = await stripe.prices.create({
        product: product.id,
        unit_amount: fee.price,
        currency: 'usd',
        metadata: {
          setup_fee_id: fee.id,
          env_var: fee.envVar,
        },
      });
      console.log(`   Created price: $${fee.price / 100} (${price.id})`);

      results.push({
        name: fee.name,
        productId: product.id,
        priceId: price.id,
        envVar: fee.envVar,
      });
    } catch (error: any) {
      console.error(`Error creating ${fee.name}:`, error.message);
    }
  }

  console.log('\n========================================');
  console.log('STRIPE SETUP FEE PRODUCTS CREATED');
  console.log('========================================\n');
  
  console.log('Environment variables to set:\n');
  for (const result of results) {
    console.log(`${result.envVar}=${result.priceId}`);
  }
  
  return results;
}

createSetupFeeProducts().catch(console.error);
