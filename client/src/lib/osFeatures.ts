/**
 * WorkForceOS - Feature Branding with OS Suffix Style
 * Each feature is branded as a standalone "OS" component
 */

export interface OSFeature {
  name: string;
  displayName: string;
  tagline: string;
  description: string;
  icon: string;
  tier: 'starter' | 'professional' | 'enterprise' | 'elite';
  pricing?: string;
}

export const OS_FEATURES: Record<string, OSFeature> = {
  // Core Features
  trackOS: {
    name: 'TrackOS',
    displayName: 'TrackOS™',
    tagline: 'GPS-Verified Time Tracking',
    description: 'Precision time tracking with GPS verification, photo clock-in, and automated hourly calculations',
    icon: 'Clock',
    tier: 'starter',
  },
  
  scheduleOS: {
    name: 'ScheduleOS',
    displayName: 'ScheduleOS™',
    tagline: 'AI-Powered Auto-Scheduling',
    description: 'Let AI schedule your entire workforce in 30 seconds. Learns employee patterns, detects conflicts, optimizes coverage',
    icon: 'Calendar',
    tier: 'enterprise',
    pricing: '$199/mo add-on or included in Enterprise+',
  },
  
  billOS: {
    name: 'BillOS',
    displayName: 'BillOS™',
    tagline: 'Automated Invoice Generation',
    description: 'Generate professional invoices from time entries automatically. Multi-client billing, tax calculations, Stripe integration',
    icon: 'FileText',
    tier: 'professional',
  },
  
  payrollOS: {
    name: 'PayrollOS',
    displayName: 'PayrollOS™',
    tagline: 'Intelligent Payroll Automation',
    description: 'Automated payroll processing with tax calculations, deductions, and direct deposit management',
    icon: 'DollarSign',
    tier: 'professional',
  },
  
  hireOS: {
    name: 'HireOS',
    displayName: 'HireOS™',
    tagline: 'Smart Hiring & Onboarding',
    description: 'AI-powered candidate screening, digital onboarding workflows, e-signature documents, compliance tracking',
    icon: 'UserPlus',
    tier: 'professional',
  },
  
  reportOS: {
    name: 'ReportOS',
    displayName: 'ReportOS™',
    tagline: 'Compliance Report Management',
    description: 'Industry-specific report templates, photo requirements, supervisor approval, automated client delivery with tracking',
    icon: 'FileCheck',
    tier: 'professional',
  },
  
  analyticsOS: {
    name: 'AnalyticsOS',
    displayName: 'AnalyticsOS™',
    tagline: 'Real-Time Business Intelligence',
    description: 'Live dashboards tracking revenue, labor costs, productivity, forecasting, and ROI analysis',
    icon: 'BarChart3',
    tier: 'professional',
  },
  
  supportOS: {
    name: 'SupportOS',
    displayName: 'SupportOS™',
    tagline: 'AI-Powered Customer Support',
    description: 'Live chat with AI assistance, ticket management, knowledge base, CSAT ratings',
    icon: 'MessageSquare',
    tier: 'professional',
  },
  
  salesOS: {
    name: 'SalesOS',
    displayName: 'SalesOS™',
    tagline: 'AI Lead Generation & CRM',
    description: 'GPT-4 powered lead discovery, intelligent pipeline management, automated email campaigns, conversion tracking',
    icon: 'TrendingUp',
    tier: 'professional',
  },
};

export const getOSFeatureName = (feature: keyof typeof OS_FEATURES): string => {
  return OS_FEATURES[feature]?.displayName || feature;
};

export const getOSFeaturesByTier = (tier: string): OSFeature[] => {
  const tierOrder = ['starter', 'professional', 'enterprise', 'elite'];
  const tierIndex = tierOrder.indexOf(tier as any);
  
  return Object.values(OS_FEATURES).filter(feature => {
    const featureTierIndex = tierOrder.indexOf(feature.tier);
    return featureTierIndex <= tierIndex;
  });
};
