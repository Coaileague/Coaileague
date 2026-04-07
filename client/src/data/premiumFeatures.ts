import { Zap, DollarSign, Palette, FileText, Users, Calendar, TrendingUp, Shield, Briefcase, ArrowRightLeft } from "lucide-react";

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
      label: 'Reduces scheduling coordination workload — actual savings vary by organization',
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
      label: 'Reduces payroll processing time — actual savings vary by organization',
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
      value: 84012, // ($50/employee × 200 employees × 12 months) - $4,999/mo base
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
      label: 'Reduces billing administration workload — actual savings vary by organization',
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
      label: 'Streamlines HR recruiting workflows — actual savings vary by organization',
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
      label: 'Reduces manual reporting effort — actual savings vary by organization',
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
      label: 'Streamlines benefits management workflows — actual savings vary by organization',
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
      label: 'Reduces regional admin overhead — actual savings vary by organization',
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
      label: 'Streamlines training management workflows — actual savings vary by organization',
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
  {
    id: 'pass-down-intelligence',
    name: 'Pass-Down Intelligence',
    description: 'AI-powered keyword scanning and severity assignment for shift-to-shift handoff notes, ensuring critical information is never lost between shifts',
    icon: ArrowRightLeft,
    tier: 'professional',
    price: 0,
    savings: {
      label: 'Reduces information gaps between shifts — actual savings vary by organization',
      value: 35000,
    },
    benefits: [
      'AI keyword scanning for critical issues',
      'Auto-severity assignment on pass-down notes',
      'Smart categorization of handoff items',
      'Priority escalation for safety concerns',
      'Searchable pass-down history with AI tags',
    ],
    roi: {
      timesSaved: 5,
      costsSaved: 35000,
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
