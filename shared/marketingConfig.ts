/**
 * UNIVERSAL MARKETING CONFIGURATION
 * ==================================
 * Single source of truth for ALL marketing, sales, and landing page content.
 * NO HARDCODED VALUES - All content flows from this centralized config.
 * Edit values here to update landing, pricing, sales pages instantly.
 */

import { BILLING } from './billingConfig';

// ============================================================================
// PLATFORM IDENTITY & MARKETING
// ============================================================================
export const MARKETING = {
  // Brand & Platform
  platform: {
    name: 'CoAIleague',
    tagline: 'AI-Powered Workforce Intelligence Platform',
    taglineShort: 'Replace $250K-$430K in Administrative Salaries',
    description: 'Fortune 500-grade autonomous workforce management powered by Gemini 2.0 Flash AI',
    mission: 'Eliminate administrative overhead through AI automation',
  },

  // ============================================================================
  // LANDING PAGE SECTIONS
  // ============================================================================
  landing: {
    hero: {
      headline: 'Replace $250K-$430K in Administrative Salaries',
      subheadline: 'Pay once per month. Save $192K-$216K annually. CoAIleague replaces 3-5 high-end administrative positions with AI automation.',
      badge: 'Enterprise-Grade ROI',
      cta: {
        primary: 'Start Free Trial',
        secondary: 'View Demo',
      },
      trustSignals: [
        { icon: 'Shield', text: 'SOC 2 Compliant' },
        { icon: 'Lock', text: '256-bit Encryption' },
        { icon: 'Award', text: '99.9% Uptime' },
      ],
    },

    stats: [
      { number: '99%', label: 'Tasks Completed by AI', context: 'Autonomous operations' },
      { number: '24/7', label: 'Autonomous Operations', context: 'Zero manual intervention' },
      { number: '0', label: 'Manual Intervention', context: 'Fully autonomous' },
    ],

    features: [
      {
        title: 'AI Scheduling',
        description: 'Gemini 2.0 Flash generates optimal schedules in milliseconds. Reduces scheduling time by 95%.',
        icon: 'Calendar',
        benefits: ['Smart shift optimization', 'Conflict resolution', 'Cost minimization'],
      },
      {
        title: 'Smart Billing',
        description: 'Automated invoice generation, Stripe integration, and revenue recognition. Replaces billing staff.',
        icon: 'DollarSign',
        benefits: ['Auto-invoicing', 'Stripe integration', 'Revenue tracking'],
      },
      {
        title: 'Payroll Automation',
        description: 'Autonomous payroll processing with Gusto & QuickBooks. Handles tax calculations automatically.',
        icon: 'Users',
        benefits: ['Auto-payroll', 'Tax calculations', 'Compliance alerts'],
      },
      {
        title: 'AI Analytics',
        description: 'Predictive analytics, cost optimization, and workforce insights powered by Gemini.',
        icon: 'TrendingUp',
        benefits: ['Predictive insights', 'Cost optimization', 'Performance trends'],
      },
      {
        title: 'HelpAI Integration',
        description: 'Multi-tenant AI brain for autonomous invoicing, payroll, notifications, and workflow automation.',
        icon: 'Brain',
        benefits: ['AI orchestration', 'Multi-tenant', 'Encrypted credentials'],
      },
      {
        title: 'Real-time Notifications',
        description: 'WebSocket-powered notifications and Resend email automation for instant team updates.',
        icon: 'Zap',
        benefits: ['Real-time alerts', 'Email automation', 'Team notifications'],
      },
    ],

    socialProof: [
      {
        name: 'Alex Rodriguez',
        title: 'CFO, TechCorp',
        quote: 'CoAIleague cut our administrative costs by 70%. Worth every penny.',
        avatar: '👨‍💼',
      },
      {
        name: 'Sarah Chen',
        title: 'HR Director, HealthCo',
        quote: 'The AI scheduling alone saves us 20 hours per week. Game changer.',
        avatar: '👩‍💼',
      },
      {
        name: 'Marcus Johnson',
        title: 'CEO, LogisticsPro',
        quote: 'Enterprise-grade automation that actually works. Best investment in 2025.',
        avatar: '👨‍💼',
      },
    ],

    faq: [
      {
        question: 'How much can we save?',
        answer: 'CoAIleague replaces 3-5 administrative positions ($250K-$430K annually). Most customers see net savings of $192K-$216K/year after subscription costs.',
      },
      {
        question: 'Is it secure?',
        answer: 'Yes. SOC 2 certified, 256-bit encryption, AES-256-GCM credential storage, and immutable audit logging. Enterprise-grade security.',
      },
      {
        question: 'Can we integrate with our tools?',
        answer: 'Yes. Native integrations with Stripe, Gusto, QuickBooks, Gemini AI, and WebSocket for real-time notifications.',
      },
      {
        question: 'How long is the free trial?',
        answer: '30 days. Full access to all features. No credit card required. Migrate seamlessly to paid plans.',
      },
    ],
  },

  // ============================================================================
  // PRICING SECTIONS (uses BILLING.tiers)
  // ============================================================================
  pricing: {
    headline: 'Built for Security Companies',
    subheadline: 'Scale from 25 to 500+ guards. Pay for what you use. Save 15-20 hours/week of admin work.',
    badge: 'Security Industry Pricing',
    
    // Pricing tiers imported from BILLING config - using real prices
    getTiers: () => [
      {
        name: BILLING.tiers.free.name,
        id: BILLING.tiers.free.id,
        price: '$0',
        priceSubtext: '14-day free trial',
        savings: 'No credit card required',
        roi: 'Risk-free trial',
        description: BILLING.tiers.free.description,
        cta: 'Start Free Trial',
        monthlyPrice: BILLING.tiers.free.monthlyPrice,
        features: BILLING.tiers.free.features,
      },
      {
        name: BILLING.tiers.starter.name,
        id: BILLING.tiers.starter.id,
        price: `$${(BILLING.tiers.starter.monthlyPrice / 100).toLocaleString()}`,
        priceSubtext: '/month',
        savings: `Saves ~$${(BILLING.tiers.starter.adminReplacementValue / 1000).toFixed(0)}K/year in admin time`,
        roi: 'Best for small teams',
        description: BILLING.tiers.starter.description,
        cta: 'Start Free Trial',
        monthlyPrice: BILLING.tiers.starter.monthlyPrice,
        features: BILLING.tiers.starter.features,
        popular: false,
      },
      {
        name: BILLING.tiers.professional.name,
        id: BILLING.tiers.professional.id,
        price: `$${(BILLING.tiers.professional.monthlyPrice / 100).toLocaleString()}`,
        priceSubtext: '/month',
        savings: `Saves ~$${(BILLING.tiers.professional.adminReplacementValue / 1000).toFixed(0)}K/year in admin time`,
        roi: 'Most popular choice',
        description: BILLING.tiers.professional.description,
        cta: 'Start Free Trial',
        monthlyPrice: BILLING.tiers.professional.monthlyPrice,
        features: BILLING.tiers.professional.features,
        popular: true,
      },
      {
        name: BILLING.tiers.enterprise.name,
        id: BILLING.tiers.enterprise.id,
        price: 'Custom',
        priceSubtext: 'Contact for pricing',
        savings: `Saves ~$${(BILLING.tiers.enterprise.adminReplacementValue / 1000).toFixed(0)}K+/year in admin time`,
        roi: 'For large organizations',
        description: BILLING.tiers.enterprise.description,
        cta: 'Contact Sales',
        monthlyPrice: BILLING.tiers.enterprise.monthlyPrice,
        features: BILLING.tiers.enterprise.features,
        popular: false,
      },
    ],
  },

  // ============================================================================
  // SALES PIPELINE CONFIGURATION (for RFP, AI analysis, etc.)
  // ============================================================================
  sales: {
    pipelineStages: [
      { id: 'new', label: 'New RFP', icon: '📥', color: '#6366f1' },
      { id: 'ai_review', label: 'AI Analysis', icon: '🧠', color: '#8b5cf6' },
      { id: 'human_review', label: 'Review', icon: '👤', color: '#f59e0b' },
      { id: 'outreach', label: 'Outreach', icon: '📧', color: '#10b981' },
      { id: 'negotiation', label: 'Negotiation', icon: '🤝', color: '#3b82f6' },
      { id: 'onboarding', label: 'Onboarding', icon: '🚀', color: '#22c55e' },
    ],

    aiLogicRules: [
      { id: 'autoQualify', name: 'Auto-Qualify', desc: 'Score ≥80 → Advance', color: '#22c55e' },
      { id: 'autoReject', name: 'Auto-Reject', desc: 'Score <50 → Reject', color: '#ef4444' },
      { id: 'escalate', name: 'Escalate', desc: '50-79 → Human Review', color: '#f59e0b' },
      { id: 'fastTrack', name: 'Fast-Track', desc: 'Referral → Priority', color: '#6366f1' },
    ],
  },

  // ============================================================================
  // NAVIGATION & ROUTING
  // ============================================================================
  navigation: {
    publicRoutes: [
      { path: '/', label: 'Home', icon: 'Home' },
      { path: '/pricing', label: 'Pricing', icon: 'CreditCard' },
      { path: '/sales', label: 'Sales', icon: 'TrendingUp' },
    ],
  },
};

/**
 * Helper: Get formatted pricing tier display
 */
export function getFormattedPrice(priceInCents: number): string {
  return `$${(priceInCents / 100).toLocaleString()}`;
}

/**
 * Helper: Format savings amount from config
 */
export function formatSavings(annualSavings: number): string {
  return `$${(annualSavings / 1000).toFixed(0)}K`;
}
