/**
 * Pricing & Subscription Tiers Configuration
 * CoAIleague — Texas Security Workforce Management Platform
 *
 * MASTER PRICE LIST — Single source of truth.
 * Every price in every system must match this exactly.
 *
 * Tiers:
 *  Trial:        $0 / 14 days / 10 seats / 500 interactions total
 *  Starter:      $299/mo  / 10 seats  / 3 sites  / 5K interactions
 *  Professional: $999/mo  / 100 seats / 10 sites / 20K interactions (MOST POPULAR)
 *  Business:     $2,999/mo / 300 seats / 25 sites / 60K interactions
 *  Enterprise:   $7,999/mo / 1,000 seats / 75 sites / 200K interactions
 *  Strategic:    $15,000+ min / 300+ officers / custom / contact required
 *
 * Seats terminology: every person (owner, manager, supervisor, officer) = 1 seat.
 * Site overages apply to sites above included count.
 * Payroll and invoicing fees available on Professional and above.
 * No credit system. Flat monthly + metered overages.
 */

// ─── Tier type ───────────────────────────────────────────────────────────────

export type SubscriptionTier =
  | "trial"
  | "starter"
  | "professional"
  | "business"
  | "enterprise"
  | "strategic";

// ─── Payroll fees per tier ────────────────────────────────────────────────────

export interface PayrollFees {
  perEmployeePerRun: number;
  directDeposit: number;
  quarterlyTaxFiling: number;
  yearEndForm: number;
}

// ─── Invoicing fees per tier ─────────────────────────────────────────────────

export interface InvoicingFees {
  cardRatePct: number;      // e.g. 0.024 = 2.4%
  cardFlatCents: number;    // e.g. 25 = $0.25
  achPerTransaction: number;
}

// ─── Tier definition ─────────────────────────────────────────────────────────

export interface PricingTier {
  name: string;
  displayName: string;
  tagline: string;
  description: string;

  // Base price
  monthlyPrice: number | null;      // null = contact required
  annualPrice: number | null;       // full year price (= 10 months)
  annualMonthlyEquivalent: number | null;

  // Seats (every person = 1 seat)
  seatsIncluded: number | null;
  seatOverageMonthly: number | null;

  // Sites
  sitesIncluded: number | null;
  siteOverageMonthly: number | null;

  // Clients
  clientsIncluded: number | "unlimited" | null;

  // AI Interactions
  interactionsMonthly: number | null;
  hardCapMonthly: number | null;
  interactionOveragePer: number | null;

  // Misc
  emergencyEventFee: number | null;  // Enterprise+ only
  popular?: boolean;
  contactRequired?: boolean;
  trialDays?: number;

  // Payroll and invoicing (Professional+)
  payrollFees: PayrollFees | null;
  invoicingFees: InvoicingFees | null;

  // Feature lists
  features: string[];
  notIncluded: string[];
  supportLevel: string;
}

// ─── THE MASTER PRICE LIST ────────────────────────────────────────────────────

export const PRICING_TIERS: Record<SubscriptionTier, PricingTier> = {

  // ── Trial ────────────────────────────────────────────────────────────────────
  trial: {
    name: "Trial",
    displayName: "Free Trial",
    tagline: "Try everything. No credit card.",
    description: "14 days of full platform access for up to 10 seats. No credit card required.",
    monthlyPrice: 0,
    annualPrice: null,
    annualMonthlyEquivalent: null,
    seatsIncluded: 10,
    seatOverageMonthly: null,
    sitesIncluded: 2,
    siteOverageMonthly: null,
    clientsIncluded: 3,
    interactionsMonthly: null,
    hardCapMonthly: 500,            // 500 total for entire trial period
    interactionOveragePer: null,
    emergencyEventFee: null,
    contactRequired: false,
    trialDays: 14,
    payrollFees: null,
    invoicingFees: null,
    features: [
      "Full platform access for 14 days",
      "Up to 10 seats",
      "Up to 2 sites and 3 clients",
      "500 AI interactions total",
      "Trinity full biological AI brain",
      "Scheduling, GPS timekeeping, incident reporting",
      "HelpAI for every seat",
      "No credit card required — no auto-charge",
    ],
    notIncluded: [
      "Payroll processing",
      "Invoice generation",
      "Voice system",
    ],
    supportLevel: "email",
  },

  // ── Starter ──────────────────────────────────────────────────────────────────
  starter: {
    name: "Starter",
    displayName: "Starter",
    tagline: "For small companies getting organized",
    description: "AI-powered workforce management for security companies up to 10 seats.",
    monthlyPrice: 299,
    annualPrice: 2870,
    annualMonthlyEquivalent: 239,
    seatsIncluded: 10,
    seatOverageMonthly: 25,
    sitesIncluded: 3,
    siteOverageMonthly: 49,
    clientsIncluded: 5,
    interactionsMonthly: 5000,
    hardCapMonthly: 8000,
    interactionOveragePer: 0.15,
    emergencyEventFee: null,
    payrollFees: null,
    invoicingFees: null,
    features: [
      "10 seats included",
      "$25/seat/month above 10",
      "3 sites included · $49/site above 3",
      "5 clients included",
      "5,000 AI interactions/month",
      "Hard cap: 8,000/month · $0.15/interaction above cap",
      "Trinity AI brain — full biological intelligence",
      "Scheduling and shift management",
      "GPS clock in/out",
      "Incident reporting (HelpAI)",
      "HelpAI for every officer 24/7",
      "ChatDock messaging (rooms and DMs)",
      "Employee management and onboarding",
      "8 standard compliance documents",
      "Home state compliance monitoring",
      "Daily morning briefings",
      "Officer performance scoring",
      "Milestone recognition",
      "Basic analytics dashboard",
      "Mobile full access",
      "Email support",
    ],
    notIncluded: [
      "Payroll processing",
      "Invoice generation",
      "Voice system",
      "Multi-state compliance",
      "Client portal",
      "Auditor portal",
      "Advanced analytics and forecasting",
      "Predictive brain",
      "API access",
    ],
    supportLevel: "email_48hr",
  },

  // ── Professional ─────────────────────────────────────────────────────────────
  professional: {
    name: "Professional",
    displayName: "Professional",
    tagline: "For growing companies ready to automate",
    description: "Full AI operations platform for security companies up to 100 seats.",
    monthlyPrice: 999,
    annualPrice: 9590,
    annualMonthlyEquivalent: 799,
    seatsIncluded: 100,
    seatOverageMonthly: 25,
    sitesIncluded: 10,
    siteOverageMonthly: 49,
    clientsIncluded: "unlimited",
    interactionsMonthly: 20000,
    hardCapMonthly: 35000,
    interactionOveragePer: 0.12,
    emergencyEventFee: null,
    popular: true,
    payrollFees: {
      perEmployeePerRun: 4.95,
      directDeposit: 0.25,
      quarterlyTaxFiling: 49.00,
      yearEndForm: 5.00,
    },
    invoicingFees: {
      cardRatePct: 0.024,
      cardFlatCents: 25,
      achPerTransaction: 0.50,
    },
    features: [
      "100 seats included",
      "$25/seat/month above 100",
      "10 sites included · $49/site above 10",
      "Unlimited clients",
      "20,000 AI interactions/month",
      "Hard cap: 35,000/month · $0.12/interaction above cap",
      "Everything in Starter, plus:",
      "Internal payroll processing",
      "Internal invoicing and payment collection",
      "Voice system — Trinity speaks and listens",
      "All 50 states compliance monitoring",
      "Disciplinary pattern analyzer",
      "Client portal",
      "State regulatory auditor portal",
      "Advanced DAR pipeline with legal narratives",
      "RFP generation assistance",
      "Advanced analytics and forecasting",
      "Predictive brain (calloffs, overtime, churn)",
      "Financial intelligence — margin per site",
      "Contract health monitoring",
      "Priority support (4-hour response)",
    ],
    notIncluded: [
      "Multi-workspace management",
      "P&L forecasting",
      "Social graph intelligence",
      "API access",
      "White-label options",
    ],
    supportLevel: "priority_4hr",
  },

  // ── Business ─────────────────────────────────────────────────────────────────
  business: {
    name: "Business",
    displayName: "Business",
    tagline: "For established companies scaling fast",
    description: "Advanced AI operations for established security companies up to 300 seats.",
    monthlyPrice: 2999,
    annualPrice: 28790,
    annualMonthlyEquivalent: 2399,
    seatsIncluded: 300,
    seatOverageMonthly: 25,
    sitesIncluded: 25,
    siteOverageMonthly: 39,
    clientsIncluded: "unlimited",
    interactionsMonthly: 60000,
    hardCapMonthly: 120000,
    interactionOveragePer: 0.10,
    emergencyEventFee: null,
    payrollFees: {
      perEmployeePerRun: 3.95,
      directDeposit: 0.20,
      quarterlyTaxFiling: 39.00,
      yearEndForm: 4.00,
    },
    invoicingFees: {
      cardRatePct: 0.022,
      cardFlatCents: 20,
      achPerTransaction: 0.40,
    },
    features: [
      "300 seats included",
      "$25/seat/month above 300",
      "25 sites included · $39/site above 25",
      "Unlimited clients",
      "60,000 AI interactions/month",
      "Hard cap: 120,000/month · $0.10/interaction above cap",
      "Everything in Professional, plus:",
      "Multi-workspace management",
      "Full financial intelligence suite",
      "P&L forecasting per site and contract",
      "Social graph — team dynamics intelligence",
      "Full regulatory knowledge base with statute citations",
      "Advanced autonomous task queue",
      "Custom officer recognition programs",
      "Field Training Officer program management",
      "Custom reporting and dashboards",
      "Full API access",
      "Dedicated onboarding specialist",
    ],
    notIncluded: [
      "White-label options",
      "Custom integration development",
      "Emergency event support",
      "Dedicated account manager",
      "On-site implementation",
    ],
    supportLevel: "dedicated_onboarding",
  },

  // ── Enterprise ───────────────────────────────────────────────────────────────
  enterprise: {
    name: "Enterprise",
    displayName: "Enterprise",
    tagline: "For large operations across multiple states",
    description: "Maximum Trinity AI for large security operations up to 1,000 seats.",
    monthlyPrice: 7999,
    annualPrice: 79990,
    annualMonthlyEquivalent: 6399,
    seatsIncluded: 1000,
    seatOverageMonthly: 25,
    sitesIncluded: 75,
    siteOverageMonthly: 29,
    clientsIncluded: "unlimited",
    interactionsMonthly: 200000,
    hardCapMonthly: 400000,
    interactionOveragePer: 0.08,
    emergencyEventFee: 1000,
    payrollFees: {
      perEmployeePerRun: 3.50,
      directDeposit: 0.15,
      quarterlyTaxFiling: 29.00,
      yearEndForm: 3.00,
    },
    invoicingFees: {
      cardRatePct: 0.020,
      cardFlatCents: 15,
      achPerTransaction: 0.30,
    },
    features: [
      "1,000 seats included",
      "$25/seat/month above 1,000",
      "75 sites included · $29/site above 75",
      "Unlimited everything",
      "200,000 AI interactions/month",
      "Hard cap: 400,000/month · $0.08/interaction above cap",
      "Emergency event support: $1,000 flat/event",
      "Everything in Business, plus:",
      "Unlimited workspaces",
      "White-label options available",
      "Custom integration development",
      "99.9% uptime SLA with service credits",
      "Dedicated account manager",
      "Quarterly business reviews with Trinity intelligence reports",
      "Federal and government contract compliance",
      "Advanced multi-agent task spawning",
      "Executive reporting suite",
      "Custom regulatory rule sets",
      "Priority phone support 24/7",
      "Custom contract terms and MSA",
      "Emergency event support included",
    ],
    notIncluded: [
      "Custom AI model fine-tuning (Strategic only)",
      "On-site implementation team (Strategic only)",
      "Predictive scheduling law compliance (Strategic only)",
    ],
    supportLevel: "dedicated_24_7",
  },

  // ── Strategic ────────────────────────────────────────────────────────────────
  strategic: {
    name: "Strategic",
    displayName: "Strategic",
    tagline: "For national and regional security operations at scale",
    description: "Custom enterprise solution for organizations with 300+ officers operating across multiple states.",
    monthlyPrice: null,      // contact required — minimum $15,000/month
    annualPrice: null,
    annualMonthlyEquivalent: null,
    seatsIncluded: null,     // custom per contract — 300 minimum
    seatOverageMonthly: null,
    sitesIncluded: null,
    siteOverageMonthly: null,
    clientsIncluded: "unlimited",
    interactionsMonthly: null,
    hardCapMonthly: null,
    interactionOveragePer: null,
    emergencyEventFee: 2500,
    contactRequired: true,
    payrollFees: null,       // custom per contract
    invoicingFees: null,     // custom per contract
    features: [
      "Everything in Enterprise",
      "300+ officers across multiple states",
      "Unlimited officers and workspaces",
      "Custom AI model fine-tuning on your data",
      "Union contract rule enforcement",
      "Predictive scheduling law compliance (CA, NY, IL, WA, OR and all applicable states)",
      "Dedicated implementation team",
      "On-site deployment support",
      "Custom SLA with financial penalties",
      "Emergency event support: $2,500 flat/event",
      "Annual contract with custom terms",
      "Executive dashboard for C-suite reporting",
    ],
    notIncluded: [],
    supportLevel: "dedicated_strategic",
  },
};

// ─── Strategic per-seat pricing tiers ────────────────────────────────────────

export const STRATEGIC_SEAT_PRICING = {
  tier1: { minOfficers: 300,   maxOfficers: 1000,  perSeatMonthly: 45 },
  tier2: { minOfficers: 1001,  maxOfficers: 5000,  perSeatMonthly: 55 },
  tier3: { minOfficers: 5001,  maxOfficers: null,  perSeatMonthly: 65 },
  minimumMonthly: 15000,
};

// ─── Tier limits lookup (for middleware and feature gating) ──────────────────

export const TIER_LIMITS: Record<SubscriptionTier, {
  seatsIncluded: number | null;
  sitesIncluded: number | null;
  interactionsMonthly: number | null;
  hardCap: number | null;
  interactionOverageRate: number | null;
  seatOverageMonthly: number | null;
  siteOverageMonthly: number | null;
}> = {
  trial:        { seatsIncluded: 5,    sitesIncluded: 2,  interactionsMonthly: null,   hardCap: 500,    interactionOverageRate: null, seatOverageMonthly: null, siteOverageMonthly: null },
  starter:      { seatsIncluded: 10,   sitesIncluded: 3,  interactionsMonthly: 5000,   hardCap: 8000,   interactionOverageRate: 0.15, seatOverageMonthly: 25,   siteOverageMonthly: 49   },
  professional: { seatsIncluded: 100,  sitesIncluded: 10, interactionsMonthly: 20000,  hardCap: 35000,  interactionOverageRate: 0.12, seatOverageMonthly: 25,   siteOverageMonthly: 49   },
  business:     { seatsIncluded: 300,  sitesIncluded: 25, interactionsMonthly: 60000,  hardCap: 120000, interactionOverageRate: 0.10, seatOverageMonthly: 25,   siteOverageMonthly: 39   },
  enterprise:   { seatsIncluded: 1000, sitesIncluded: 75, interactionsMonthly: 200000, hardCap: 400000, interactionOverageRate: 0.08, seatOverageMonthly: 25,   siteOverageMonthly: 29   },
  strategic:    { seatsIncluded: null, sitesIncluded: null,interactionsMonthly: null,  hardCap: null,   interactionOverageRate: null, seatOverageMonthly: null, siteOverageMonthly: null  },
};

// ─── Recommend tier by total seat count (officers + admin) ───────────────────

export function recommendTier(totalSeats: number): SubscriptionTier {
  if (totalSeats <= 5)    return "trial";
  if (totalSeats <= 10)   return "starter";
  if (totalSeats <= 100)  return "professional";
  if (totalSeats <= 300)  return "business";
  if (totalSeats <= 1000) return "enterprise";
  return "strategic";
}

// ─── Format helpers ──────────────────────────────────────────────────────────

export function formatTierPrice(tier: SubscriptionTier, annual = false): string {
  const t = PRICING_TIERS[tier];
  if (t.monthlyPrice === null) return "Contact Us";
  const price = annual && t.annualMonthlyEquivalent ? t.annualMonthlyEquivalent : t.monthlyPrice;
  return `$${price.toLocaleString()}`;
}

export function getAnnualSavings(tier: SubscriptionTier): string {
  const t = PRICING_TIERS[tier];
  if (!t.monthlyPrice || !t.annualPrice) return "";
  const monthlyCost = t.monthlyPrice * 12;
  const saved = monthlyCost - t.annualPrice;
  return `Save $${saved.toLocaleString()} (2 months free)`;
}

// ─── Backward-compat shim for code that still reads old field names ───────────
// Remove once all backend references to includedOfficers / perOfficerOverage
// have been migrated to seatsIncluded / seatOverageMonthly.

export function getTierSeats(tier: SubscriptionTier): number | null {
  return TIER_LIMITS[tier].seatsIncluded;
}

export function getTierSeatOverage(tier: SubscriptionTier): number | null {
  return TIER_LIMITS[tier].seatOverageMonthly;
}

// ─── Calculate seat overage for a given tier and actual seat count ────────────

export function calculateOverage(
  tier: SubscriptionTier,
  actualSeats: number
): { overageEmployees: number; overageCharge: number } {
  const limits = TIER_LIMITS[tier];
  const included = limits.seatsIncluded ?? 0;
  const rate     = limits.seatOverageMonthly ?? 0;
  const overageEmployees = Math.max(0, actualSeats - included);
  const overageCharge    = overageEmployees * rate;
  return { overageEmployees, overageCharge };
}
