/**
 * Stripe Product & Price Configuration - UPDATED FOR COAILEAGUE
 * Generated from CoAIleague pricing tiers
 * 
 * Current Stripe Account Setup Status:
 * ✅ Account connected and configured
 * ⚠️  Price IDs need to be created in Stripe Dashboard for each tier/billing cycle
 */

export const STRIPE_PRODUCTS = {
  FREE: {
    name: 'CoAIleague Free',
    priceId: null, // No Stripe needed - internal trial
    amount: 0,
    employeeLimit: 5,
    creditAllocation: 0,
    features: [
      'Up to 5 employees',
      'GPS clock-in/out + time tracking',
      'Smart scheduling (view-only)',
      'Basic reporting & analytics',
      'No credit card required',
    ]
  },

  STARTER_MONTHLY: {
    name: 'CoAIleague Starter (Monthly)',
    priceId: process.env.STRIPE_STARTER_MONTHLY_PRICE_ID || 'price_starter_monthly',
    amount: 499900, // $4,999.00/month
    employeeLimit: 50,
    creditAllocation: 5000,
    features: [
      'Up to 50 employees',
      'AI-powered scheduling automation',
      'Auto-billing & invoicing',
      'Auto-payroll processing',
      'GPS + photo verification',
      'Client portal access',
      '$50/mo AI credits',
    ]
  },

  STARTER_YEARLY: {
    name: 'CoAIleague Starter (Yearly)',
    priceId: process.env.STRIPE_STARTER_YEARLY_PRICE_ID || 'price_starter_yearly',
    amount: 5998800, // $59,988/year (~$4,999/month)
    employeeLimit: 50,
    creditAllocation: 60000, // Annual credits
    features: [
      'Same as Starter Monthly',
      'Save $1,200/year vs monthly',
    ]
  },

  PROFESSIONAL_MONTHLY: {
    name: 'CoAIleague Professional (Monthly)',
    priceId: process.env.STRIPE_PROFESSIONAL_MONTHLY_PRICE_ID || 'price_professional_monthly',
    amount: 999900, // $9,999.00/month
    employeeLimit: 150,
    creditAllocation: 20000,
    features: [
      'Up to 150 employees',
      'Everything in Starter',
      'QuickBooks & Gusto integrations',
      'AI-Powered Natural Language Search',
      'Autonomous AI Analytics & Predictions',
      'Predictive scheduling & cost optimization',
      'Learning Management & Certifications',
      'Performance Reviews & PTO Management',
      '$200/mo AI credits',
    ]
  },

  PROFESSIONAL_YEARLY: {
    name: 'CoAIleague Professional (Yearly)',
    priceId: process.env.STRIPE_PROFESSIONAL_YEARLY_PRICE_ID || 'price_professional_yearly',
    amount: 11998800, // $119,988/year (~$9,999/month)
    employeeLimit: 150,
    creditAllocation: 240000, // Annual credits
    features: [
      'Same as Professional Monthly',
      'Save $1,200/year vs monthly',
    ]
  },

  ENTERPRISE_MONTHLY: {
    name: 'CoAIleague Enterprise (Monthly)',
    priceId: process.env.STRIPE_ENTERPRISE_MONTHLY_PRICE_ID || 'price_enterprise_monthly',
    amount: 1799900, // $17,999.00/month
    employeeLimit: null, // Unlimited
    creditAllocation: 100000,
    features: [
      'Unlimited employees',
      'Everything in Professional',
      'Advanced AI Search with Custom Data Sources',
      'AI Premium: Predictive Analytics & Forecasting',
      'SOC2-Ready Compliance & Audit Trails',
      'White-Label Branding Options',
      'API Access & Custom Webhooks',
      '$1,000/mo AI credits',
      'Dedicated Account Manager',
      'Priority Support (1hr SLA)',
    ]
  },

  ENTERPRISE_YEARLY: {
    name: 'CoAIleague Enterprise (Yearly)',
    priceId: process.env.STRIPE_ENTERPRISE_YEARLY_PRICE_ID || 'price_enterprise_yearly',
    amount: 21598800, // $215,988/year (~$17,999/month)
    employeeLimit: null, // Unlimited
    creditAllocation: 1200000, // Annual credits
    features: [
      'Same as Enterprise Monthly',
      'Save $2,400/year vs monthly',
    ]
  },

  EMPLOYEE_OVERAGE: {
    priceId: process.env.STRIPE_EMPLOYEE_OVERAGE_PRICE_ID || 'price_employee_overage',
    amount: 5000, // $50.00 per employee/month
    description: 'Additional employee beyond plan limit'
  },

  ADDON_CREDITS: {
    priceId: process.env.STRIPE_ADDON_CREDITS_PRICE_ID || 'price_addon_credits',
    amount: 10000, // $100.00 per 1,000 credits
    description: 'Additional AI credits beyond tier allocation'
  }
} as const;

export type SubscriptionTier = 'free' | 'starter' | 'professional' | 'enterprise';

export function getTierConfig(tier: SubscriptionTier, billingCycle: 'monthly' | 'yearly' = 'monthly') {
  const configs = {
    free: STRIPE_PRODUCTS.FREE,
    starter: billingCycle === 'yearly' ? STRIPE_PRODUCTS.STARTER_YEARLY : STRIPE_PRODUCTS.STARTER_MONTHLY,
    professional: billingCycle === 'yearly' ? STRIPE_PRODUCTS.PROFESSIONAL_YEARLY : STRIPE_PRODUCTS.PROFESSIONAL_MONTHLY,
    enterprise: billingCycle === 'yearly' ? STRIPE_PRODUCTS.ENTERPRISE_YEARLY : STRIPE_PRODUCTS.ENTERPRISE_MONTHLY
  };
  return configs[tier];
}

export function calculateOverageCharges(employeeCount: number, tier: SubscriptionTier): number {
  const config = getTierConfig(tier);
  if (!config.employeeLimit) return 0; // Unlimited
  
  const overage = Math.max(0, employeeCount - config.employeeLimit);
  return overage * STRIPE_PRODUCTS.EMPLOYEE_OVERAGE.amount;
}
