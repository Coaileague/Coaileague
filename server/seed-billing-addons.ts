/**
 * Seed Billing Add-ons
 * 
 * Seeds the billing_addons table with Trinity Pro and Business Buddy add-ons
 * Run with: npx tsx server/seed-billing-addons.ts
 */

import { db } from './db';
import { billingAddons } from '@shared/schema';
import { eq } from 'drizzle-orm';

const ADDONS = [
  {
    addonKey: 'trinity_pro',
    name: 'Trinity Pro',
    description: 'Advanced AI mascot with executive-level insights, proactive notifications, business intelligence, and priority support access',
    category: 'ai_feature',
    pricingType: 'hybrid',
    basePrice: '29.99',
    monthlyTokenAllowance: '100000',
    overageRatePer1kTokens: '0.0050',
    requiresBaseTier: 'starter',
    isAIFeature: true,
    isActive: true,
  },
  // DEPRECATED: Business Buddy addon removed — superseded by COO Mode (trinityMode: 'coo')
  // Keeping the DB row with isActive:false to avoid FK violations on existing subscriptions
  {
    addonKey: 'business_buddy',
    name: 'Business Buddy (Deprecated)',
    description: '[DEPRECATED] Superseded by COO Mode. AI-powered business advisor for organization owners.',
    category: 'ai_feature',
    pricingType: 'hybrid',
    basePrice: '19.99',
    monthlyTokenAllowance: '50000',
    overageRatePer1kTokens: '0.0075',
    requiresBaseTier: 'starter',
    isAIFeature: true,
    isActive: false,
  },
  {
    addonKey: 'scheduleos_ai',
    name: 'CoAIleague Smart Scheduling',
    description: 'Intelligent auto-scheduling with shift optimization, coverage prediction, and employee preference learning',
    category: 'ai_feature',
    pricingType: 'hybrid',
    basePrice: '49.99',
    monthlyTokenAllowance: '200000',
    overageRatePer1kTokens: '0.0040',
    requiresBaseTier: 'professional',
    isAIFeature: true,
    isActive: true,
  },
  {
    addonKey: 'insightos',
    name: 'InsightOS Analytics',
    description: 'Advanced workforce analytics with predictive modeling, trend analysis, and custom report generation',
    category: 'ai_feature',
    pricingType: 'subscription',
    basePrice: '39.99',
    monthlyTokenAllowance: '150000',
    overageRatePer1kTokens: '0.0060',
    requiresBaseTier: 'professional',
    isAIFeature: true,
    isActive: true,
  },
  {
    addonKey: 'compliance_guardian',
    name: 'Compliance Guardian',
    description: 'Automated compliance monitoring, certification tracking, and regulatory alert system',
    category: 'os_module',
    pricingType: 'subscription',
    basePrice: '24.99',
    requiresBaseTier: 'starter',
    isAIFeature: false,
    isActive: true,
  },
];

async function seedBillingAddons() {
  console.log('Seeding billing add-ons...');
  
  for (const addon of ADDONS) {
    const existing = await db.select()
      .from(billingAddons)
      .where(eq(billingAddons.addonKey, addon.addonKey))
      .limit(1);
    
    if (existing.length > 0) {
      console.log(`  - ${addon.name} already exists, updating...`);
      await db.update(billingAddons)
        .set({
          name: addon.name,
          description: addon.description,
          category: addon.category,
          pricingType: addon.pricingType,
          basePrice: addon.basePrice,
          monthlyTokenAllowance: addon.monthlyTokenAllowance,
          overageRatePer1kTokens: addon.overageRatePer1kTokens,
          requiresBaseTier: addon.requiresBaseTier,
          isAIFeature: addon.isAIFeature,
          isActive: addon.isActive,
          updatedAt: new Date(),
        })
        .where(eq(billingAddons.addonKey, addon.addonKey));
    } else {
      console.log(`  - Creating ${addon.name}...`);
      await db.insert(billingAddons).values(addon);
    }
  }
  
  console.log('Billing add-ons seeded successfully!');
  process.exit(0);
}

seedBillingAddons().catch((err) => {
  console.error('Failed to seed billing add-ons:', err);
  process.exit(1);
});
