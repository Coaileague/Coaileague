import { Zap, DollarSign, Palette, FileText, Users, Calendar, TrendingUp, Shield, Briefcase } from "lucide-react";

export interface PremiumFeature {
  id: string;
  name: string;
  description: string;
  icon: any;
  tier: 'professional' | 'enterprise';
  price: number; // Monthly price
  savings: {
    label: string;
    value: number; // Annual savings in dollars
  };
  benefits: string[];
  roi: {
    timesSaved?: number; // Hours saved per week
    costsSaved?: number; // Annual cost savings
    revenueGenerated?: number; // Potential annual revenue
  };
  status?: 'available' | 'coming_soon';
}

export const PREMIUM_FEATURES: PremiumFeature[] = [
  {
    id: 'smart-schedule-ai',
    name: 'Smart Schedule AI',
    description: 'AI-powered scheduling that eliminates conflicts and optimizes coverage automatically',
    icon: Zap,
    tier: 'professional',
    price: 199,
    savings: {
      label: 'Save 20 hours/week on scheduling',
      value: 52000, // 20 hrs/week × $50/hr × 52 weeks
    },
    benefits: [
      '1-click auto-fill for entire week',
      'Conflict detection & resolution',
      'Learning algorithm improves over time',
      'Respects employee preferences',
      'Overtime & compliance warnings',
    ],
    roi: {
      timesSaved: 20, // hours per week
      costsSaved: 52000,
    },
    status: 'coming_soon',
  },
  {
    id: 'auto-payroll',
    name: 'Auto-Payroll',
    description: 'Automatic payroll processing with tax calculations and direct deposit',
    icon: DollarSign,
    tier: 'professional',
    price: 299,
    savings: {
      label: 'Eliminates $45k/year payroll admin salary',
      value: 41412, // $45k salary - $3,588/year subscription
    },
    benefits: [
      'Sync with ADP, Gusto, Paychex',
      'Automatic tax calculations',
      'Direct deposit processing',
      'W-2 & 1099 generation',
      'YTD tracking & reporting',
    ],
    roi: {
      costsSaved: 41412,
    },
    status: 'coming_soon',
  },
  {
    id: 'white-label-branding',
    name: 'White-Label Branding',
    description: 'Complete customization with your brand colors, logo, and domain',
    icon: Palette,
    tier: 'enterprise',
    price: 0, // Included in Enterprise plan
    savings: {
      label: 'Charge clients your own markup',
      value: 84012, // ($50/employee × 200 employees × 12 months) - $2,999/mo
    },
    benefits: [
      'Custom color palette (5+ colors)',
      'Your logo everywhere',
      'Custom domain (schedule.yourcompany.com)',
      'Branded emails & invoices',
      'Remove all WorkforceOS branding',
      'White-labeled mobile app',
    ],
    roi: {
      revenueGenerated: 84012,
    },
    status: 'available',
  },
  {
    id: 'auto-invoicing',
    name: 'Auto-Invoicing',
    description: 'Automatically generate and send invoices based on completed work',
    icon: FileText,
    tier: 'professional',
    price: 149,
    savings: {
      label: 'Save 10 hours/week on billing',
      value: 25212, // (10 hrs/week × $50/hr × 52 weeks) - $1,788/year
    },
    benefits: [
      'Auto-generate from time entries',
      'Send invoices automatically',
      'Payment reminders',
      'Client payment portal',
      'QuickBooks integration',
    ],
    roi: {
      timesSaved: 10,
      costsSaved: 25212,
    },
    status: 'coming_soon',
  },
  {
    id: 'recruiting-ats',
    name: 'Recruiting & ATS',
    description: 'Applicant tracking system with job posting and candidate management',
    icon: Users,
    tier: 'professional',
    price: 299,
    savings: {
      label: 'Eliminate $30k/year recruiting costs',
      value: 26412, // $30k agency fees - $3,588/year subscription
    },
    benefits: [
      'Post to Indeed, LinkedIn, ZipRecruiter',
      'Applicant tracking & scoring',
      'Interview scheduling',
      'Background checks',
      'Onboarding integration',
      '$50 per successful hire',
    ],
    roi: {
      costsSaved: 26412,
    },
    status: 'coming_soon',
  },
  {
    id: 'advanced-analytics',
    name: 'Advanced Analytics',
    description: 'Deep insights into labor costs, productivity, and profitability',
    icon: TrendingUp,
    tier: 'professional',
    price: 199,
    savings: {
      label: 'Identify 15% cost savings opportunities',
      value: 50000, // Typical 15% reduction in labor costs
    },
    benefits: [
      'Labor cost optimization',
      'Productivity tracking',
      'Profitability by client/project',
      'Custom reports & exports',
      'Predictive forecasting',
    ],
    roi: {
      costsSaved: 50000,
    },
    status: 'coming_soon',
  },
  {
    id: 'benefits-admin',
    name: 'Benefits Administration',
    description: 'Manage health insurance, 401(k), PTO, and other employee benefits',
    icon: Shield,
    tier: 'professional',
    price: 299,
    savings: {
      label: 'Save 5 hours/week on benefits admin',
      value: 9412, // (5 hrs/week × $40/hr × 52 weeks) - $3,588/year
    },
    benefits: [
      'Health insurance enrollment',
      '401(k) management',
      'PTO tracking & accrual',
      'COBRA administration',
      'Benefits carrier integrations',
    ],
    roi: {
      timesSaved: 5,
      costsSaved: 9412,
    },
    status: 'coming_soon',
  },
  {
    id: 'multi-location',
    name: 'Multi-Location Management',
    description: 'Manage multiple locations with centralized control and local autonomy',
    icon: Briefcase,
    tier: 'enterprise',
    price: 999,
    savings: {
      label: 'Manage 10+ locations from one dashboard',
      value: 120000, // Typical enterprise efficiency gains
    },
    benefits: [
      'Unlimited locations',
      'Location-specific branding',
      'Cross-location reporting',
      'Centralized payroll',
      'Franchise management tools',
    ],
    roi: {
      costsSaved: 120000,
    },
    status: 'coming_soon',
  },
  {
    id: 'learning-management',
    name: 'Learning Management System',
    description: 'Training courses, certifications, and compliance tracking',
    icon: Calendar,
    tier: 'professional',
    price: 199,
    savings: {
      label: 'Eliminate $12k/year training costs',
      value: 9812, // $12k LMS costs - $2,388/year subscription
    },
    benefits: [
      'Course creation & delivery',
      'Certification tracking',
      'Compliance training',
      'Quiz & assessment tools',
      'Training history reports',
    ],
    roi: {
      costsSaved: 9812,
    },
    status: 'coming_soon',
  },
];

export function getFeaturesByTier(tier: 'professional' | 'enterprise') {
  return PREMIUM_FEATURES.filter(f => f.tier === tier);
}

export function getAvailableFeatures() {
  return PREMIUM_FEATURES.filter(f => f.status === 'available');
}

export function getComingSoonFeatures() {
  return PREMIUM_FEATURES.filter(f => f.status === 'coming_soon');
}
