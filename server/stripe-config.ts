/**
 * Stripe Product & Price Configuration
 * Generated from Stripe Dashboard
 */

export const STRIPE_PRODUCTS = {
  STARTER: {
    name: 'WorkforceOS Starter',
    priceId: 'price_1SPWR18XHrr8nNEqIZKR7NHt',
    amount: 29900, // $299.00/month
    employeeLimit: 25,
    features: [
      'AI Scheduling™ - Smart Scheduling',
      'Time Platform - Time Tracking',  
      'Billing Platform - Automated Invoicing',
      'Basic Payroll',
      'Client Portal',
      'Mobile App Access',
      'Email Support'
    ]
  },
  
  PROFESSIONAL: {
    name: 'WorkforceOS Professional',
    priceId: 'price_1SPWR28XHrr8nNEqB4Y9ZzJi',
    amount: 99900, // $999.00/month
    employeeLimit: 100,
    features: [
      'Everything in Starter',
      'AI Payroll™ - Full Payroll Automation',
      'AI Training™ - LMS & Certifications',
      'Performance Reviews & PTO',
      'Benefits Management',
      'Custom Forms & Reports',
      'AI Integrations™',
      'Priority Support',
      'Advanced Analytics'
    ]
  },
  
  ENTERPRISE: {
    name: 'WorkforceOS Enterprise',
    priceId: null, // Custom pricing - contact sales
    amount: null,
    employeeLimit: null, // Unlimited
    features: [
      'Everything in Professional',
      'Unlimited Employees',
      'Advanced Analytics Dashboards',
      'API Access & Webhooks',
      'Custom Reporting & Exports',
      'Dedicated Account Manager',
      'Priority Email & Chat Support',
      'Custom Integration Assistance',
      'Flexible Billing & Payment Terms'
    ]
  },
  
  OVERAGES: {
    EMPLOYEE: {
      priceId: 'price_1SPWR28XHrr8nNEqXWlwGxgU',
      amount: 1500, // $15.00 per employee/month
      description: 'Additional employee beyond plan limit'
    }
  }
} as const;

export type SubscriptionTier = 'starter' | 'professional' | 'enterprise';

export function getTierConfig(tier: SubscriptionTier) {
  const configs = {
    starter: STRIPE_PRODUCTS.STARTER,
    professional: STRIPE_PRODUCTS.PROFESSIONAL,
    enterprise: STRIPE_PRODUCTS.ENTERPRISE
  };
  return configs[tier];
}

export function calculateOverageCharges(employeeCount: number, tier: SubscriptionTier): number {
  const config = getTierConfig(tier);
  if (!config.employeeLimit) return 0; // Unlimited
  
  const overage = Math.max(0, employeeCount - config.employeeLimit);
  return overage * STRIPE_PRODUCTS.OVERAGES.EMPLOYEE.amount;
}
