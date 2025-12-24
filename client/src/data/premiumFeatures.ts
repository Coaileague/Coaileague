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
    description: 'AI-powered scheduling that reduces conflicts and optimizes coverage automatically',
    icon: Zap,
    tier: 'professional',
    price: 0, // Included in Starter+ plans
    savings: {
      label: 'Automates scheduling coordinator tasks (up to $77.5K potential savings)*',
      value: 77500,
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
      costsSaved: 77500,
    },
    status: 'available',
  },
  {
    id: 'auto-payroll',
    name: 'Auto-Payroll',
    description: 'Automatic payroll processing with tax calculations and direct deposit integration',
    icon: DollarSign,
    tier: 'professional',
    price: 0, // Included in Starter+ plans
    savings: {
      label: 'Automates payroll processing tasks (up to $90K potential savings)*',
      value: 90000,
    },
    benefits: [
      'Sync with ADP, Gusto, Paychex',
      'Automatic tax calculations',
      'Direct deposit processing',
      'W-2 & 1099 generation',
      'YTD tracking & reporting',
    ],
    roi: {
      costsSaved: 90000,
    },
    status: 'available',
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
      'Remove all CoAIleague™ branding',
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
    price: 0, // Included in Starter+ plans
    savings: {
      label: 'Automates billing tasks (up to $85K potential savings)*',
      value: 85000,
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
      costsSaved: 85000,
    },
    status: 'available',
  },
  {
    id: 'recruiting-ats',
    name: 'Recruiting & ATS',
    description: 'Applicant tracking system with job posting and candidate management',
    icon: Users,
    tier: 'professional',
    price: 0, // Included in Professional+ plans
    savings: {
      label: 'Streamlines HR recruiting workflows (up to $30K potential savings)*',
      value: 30000, // Partial value attribution
    },
    benefits: [
      'Post to Indeed, LinkedIn, ZipRecruiter',
      'Applicant tracking & scoring',
      'Interview scheduling',
      'Background checks',
      'Onboarding integration',
    ],
    roi: {
      costsSaved: 30000,
    },
    status: 'available',
  },
  {
    id: 'advanced-analytics',
    name: 'Advanced Analytics',
    description: 'Deep insights into labor costs, productivity, and profitability',
    icon: TrendingUp,
    tier: 'professional',
    price: 0, // Included in Professional+ plans
    savings: {
      label: 'Automates reporting tasks (up to $40K potential savings)*',
      value: 40000, // Partial value attribution
    },
    benefits: [
      'Labor cost optimization',
      'Productivity tracking',
      'Profitability by client/project',
      'Custom reports & exports',
      'Predictive forecasting',
    ],
    roi: {
      costsSaved: 40000,
    },
    status: 'available',
  },
  {
    id: 'benefits-admin',
    name: 'Benefits Administration',
    description: 'Manage health insurance, 401(k), PTO, and other employee benefits',
    icon: Shield,
    tier: 'professional',
    price: 0, // Included in Professional+ plans
    savings: {
      label: 'Streamlines benefits management (up to $30K potential savings)*',
      value: 30000, // Partial value attribution
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
      costsSaved: 30000,
    },
    status: 'available',
  },
  {
    id: 'multi-location',
    name: 'Multi-Location Management',
    description: 'Manage multiple locations with centralized control and local autonomy',
    icon: Briefcase,
    tier: 'enterprise',
    price: 0, // Included in Enterprise plan
    savings: {
      label: 'Reduces regional admin overhead (up to $250K potential savings)*',
      value: 250000, // Typical enterprise efficiency gains
    },
    benefits: [
      'Unlimited locations',
      'Location-specific branding',
      'Cross-location reporting',
      'Centralized payroll',
      'Franchise management tools',
    ],
    roi: {
      costsSaved: 250000,
    },
    status: 'available',
  },
  {
    id: 'learning-management',
    name: 'Learning Management System',
    description: 'Training courses, certifications, and compliance tracking',
    icon: Calendar,
    tier: 'professional',
    price: 0, // Included in Professional+ plans
    savings: {
      label: 'Streamlines training management (up to $22K potential savings)*',
      value: 22000, // Partial value attribution
    },
    benefits: [
      'Course creation & delivery',
      'Certification tracking',
      'Compliance training',
      'Quiz & assessment tools',
      'Training history reports',
    ],
    roi: {
      costsSaved: 22000,
    },
    status: 'available',
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
