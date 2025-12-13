/**
 * CoAIleague Platform Features
 * Each feature is branded as a standalone product component
 */

export interface Feature {
  name: string;
  displayName: string;
  tagline: string;
  description: string;
  icon: string;
  tier: 'starter' | 'professional' | 'enterprise' | 'elite';
  pricing?: string;
}

export const FEATURES: Record<string, Feature> = {
  tracking: {
    name: 'Time Tracking',
    displayName: 'Time Tracking',
    tagline: 'GPS-Verified Time Tracking',
    description: 'Precision time tracking with GPS verification, photo clock-in, and automated hourly calculations',
    icon: 'Clock',
    tier: 'starter',
  },
  
  scheduling: {
    name: 'AI Scheduling',
    displayName: 'AI Scheduling',
    tagline: 'AI-Powered Auto-Scheduling',
    description: 'Let AI schedule your entire workforce in 30 seconds. Learns employee patterns, detects conflicts, optimizes coverage',
    icon: 'Calendar',
    tier: 'enterprise',
    pricing: '$199/mo add-on or included in Enterprise+',
  },
  
  billing: {
    name: 'Billing',
    displayName: 'Billing Platform',
    tagline: 'Automated Invoice Generation',
    description: 'Generate professional invoices from time entries automatically. Multi-client billing, tax calculations, Stripe integration',
    icon: 'FileText',
    tier: 'professional',
  },
  
  payroll: {
    name: 'AI Payroll',
    displayName: 'AI Payroll',
    tagline: 'Intelligent Payroll Automation',
    description: 'Automated payroll processing with tax calculations, deductions, and direct deposit management',
    icon: 'DollarSign',
    tier: 'professional',
  },
  
  hiring: {
    name: 'AI Hiring',
    displayName: 'AI Hiring',
    tagline: 'Smart Hiring & Onboarding',
    description: 'AI-powered candidate screening, digital onboarding workflows, e-signature documents, compliance tracking',
    icon: 'UserPlus',
    tier: 'professional',
  },
  
  reports: {
    name: 'Reports',
    displayName: 'Reports',
    tagline: 'Compliance Report Management',
    description: 'Industry-specific report templates, photo requirements, supervisor approval, automated client delivery with tracking',
    icon: 'FileCheck',
    tier: 'professional',
  },
  
  analytics: {
    name: 'Analytics',
    displayName: 'Analytics',
    tagline: 'Real-Time Business Intelligence',
    description: 'Live dashboards tracking revenue, labor costs, productivity, forecasting, and ROI analysis',
    icon: 'BarChart3',
    tier: 'professional',
  },
  
  support: {
    name: 'Support',
    displayName: 'Support',
    tagline: 'AI-Powered Customer Support',
    description: 'Live chat with AI assistance, ticket management, knowledge base, CSAT ratings',
    icon: 'MessageSquare',
    tier: 'professional',
  },
  
  sales: {
    name: 'Sales',
    displayName: 'Sales',
    tagline: 'AI Lead Generation & CRM',
    description: 'AI-powered lead discovery, intelligent pipeline management, automated email campaigns, conversion tracking',
    icon: 'TrendingUp',
    tier: 'professional',
  },
};

export const getFeatureName = (feature: keyof typeof FEATURES): string => {
  return FEATURES[feature]?.displayName || feature;
};

export const getFeaturesByTier = (tier: string): Feature[] => {
  const tierOrder = ['starter', 'professional', 'enterprise', 'elite'];
  const tierIndex = tierOrder.indexOf(tier as any);
  
  return Object.values(FEATURES).filter(feature => {
    const featureTierIndex = tierOrder.indexOf(feature.tier);
    return featureTierIndex <= tierIndex;
  });
};
