/**
 * PREMIUM FEATURES CONFIGURATION
 * ==============================
 * Defines premium features that require subscription tier access or credits to use.
 * 
 * Feature Types:
 * - CORE: Included in all tiers (no additional cost)
 * - PREMIUM: Requires specific tier OR credits to use
 * - ELITE: Requires enterprise tier OR premium add-on OR credits
 * 
 * Credit System:
 * - Credits are consumed per use for premium features
 * - Even enterprise accounts have credit limits
 * - Credits can be purchased as add-ons
 * - Unused credits expire at billing cycle end
 */

export type FeatureType = 'core' | 'premium' | 'elite';
export type BillingMode = 'included' | 'per_use' | 'per_minute' | 'per_document' | 'per_shift' | 'per_seat' | 'per_action';
export type SubscriptionTier = 'free' | 'trial' | 'starter' | 'professional' | 'business' | 'enterprise' | 'strategic';

export interface PremiumFeatureDefinition {
  id: string;
  name: string;
  description: string;
  category: string;
  featureType: FeatureType;
  
  // Tier Requirements
  minimumTier: SubscriptionTier;
  includedInTiers: SubscriptionTier[];
  
  // Credit System
  creditCost: number;
  billingMode: BillingMode;
  creditCostUnit?: string; // e.g., "per recording minute", "per document"
  
  // Limits
  monthlyLimits: {
    free: number;
    starter: number;
    professional: number;
    business?: number;
    enterprise: number;
  };

  // Elite per-tier USD surcharge (cents) — charged per additional use after the tier's
  // monthly included quota is exhausted. See Section: Elite Feature Pricing (April 2026).
  // A value of 0 on enterprise signals "included / unlimited".
  eliteSurchargeCents?: {
    starter?: number;
    professional?: number;
    business?: number;
    enterprise?: number;
  };

  // Add-on Support
  availableAsAddon: boolean;
  addonPricePerMonth?: number;
  addonUnlimitedCredits?: boolean;
  
  // Display
  badgeLabel: string;
  badgeColor: 'gold' | 'purple' | 'blue' | 'gradient';
  icon: string;
  
  // Feature Flags
  enabled: boolean;
  betaOnly: boolean;
  requiresSetup: boolean;
}

export interface CreditPackage {
  id: string;
  name: string;
  credits: number;
  price: number;
  bonusCredits: number;
  popular: boolean;
  stripeProductId: string;
  stripePriceId: string;
}

// ============================================================================
// PREMIUM FEATURES REGISTRY
// ============================================================================

export const PREMIUM_FEATURES: Record<string, PremiumFeatureDefinition> = {
  // =========================================================================
  // PLATFORM / ENTERPRISE FEATURES
  // =========================================================================

  "white_label": {
    id: "white_label",
    name: "White-Label Branding",
    description: "Remove CoAIleague branding and replace with your company logo, colors, and custom domain across the entire platform",
    category: "platform",
    featureType: "elite",
    minimumTier: "enterprise",
    includedInTiers: ["enterprise"],
    creditCost: 0,
    billingMode: "included",
    creditCostUnit: "included with enterprise",
    monthlyLimits: {
      free: 0,
      starter: 0,
      professional: 0,
      enterprise: -1,
    },
    availableAsAddon: false,
    badgeLabel: "Elite",
    badgeColor: "gradient",
    icon: "Palette",
    enabled: true,
    betaOnly: false,
    requiresSetup: true,
  },

  // =========================================================================
  // SHIFT MANAGEMENT PREMIUM FEATURES
  // =========================================================================
  
  "trinity_meeting_recording": {
    id: "trinity_meeting_recording",
    name: "Trinity Meeting Room Recording",
    description: "AI-powered transcription and summarization of shift chatroom conversations with action items extraction",
    category: "communication",
    featureType: "premium",
    minimumTier: "professional",
    includedInTiers: ["enterprise"],
    creditCost: 5, // 5 credits per minute of recording
    billingMode: "per_minute",
    creditCostUnit: "per minute of recording",
    monthlyLimits: {
      free: 0,
      starter: 0,
      professional: 30, // 30 minutes included
      enterprise: 120,  // 120 minutes included
    },
    availableAsAddon: true,
    addonPricePerMonth: 49,
    addonUnlimitedCredits: false,
    badgeLabel: "Premium",
    badgeColor: "gold",
    icon: "Video",
    enabled: true,
    betaOnly: false,
    requiresSetup: false,
  },

  "ai_dar_generation": {
    id: "ai_dar_generation",
    name: "AI Daily Activity Report",
    description: "Automatic generation of professional daily activity reports from shift data and chat transcripts",
    category: "reporting",
    featureType: "premium",
    minimumTier: "starter",
    includedInTiers: ["professional", "enterprise"],
    creditCost: 2, // 2 credits per DAR
    billingMode: "per_document",
    creditCostUnit: "per report generated",
    monthlyLimits: {
      free: 0,
      starter: 10,
      professional: 100,
      enterprise: 500,
    },
    availableAsAddon: true,
    addonPricePerMonth: 29,
    addonUnlimitedCredits: false,
    badgeLabel: "Premium",
    badgeColor: "purple",
    icon: "FileText",
    enabled: true,
    betaOnly: false,
    requiresSetup: false,
  },

  "gps_photo_verification": {
    id: "gps_photo_verification",
    name: "GPS Photo Verification",
    description: "Verify employee clock-in/out with geotagged photos and location tracking",
    category: "time_tracking",
    featureType: "premium",
    minimumTier: "starter",
    includedInTiers: ["professional", "enterprise"],
    creditCost: 1, // 1 credit per verification
    billingMode: "per_use",
    creditCostUnit: "per verification",
    monthlyLimits: {
      free: 0,
      starter: 50,
      professional: 500,
      enterprise: 2000,
    },
    availableAsAddon: true,
    addonPricePerMonth: 19,
    addonUnlimitedCredits: false,
    badgeLabel: "Premium",
    badgeColor: "blue",
    icon: "MapPin",
    enabled: true,
    betaOnly: false,
    requiresSetup: false,
  },

  // =========================================================================
  // AI AUTOMATION PREMIUM FEATURES
  // =========================================================================

  "trinity_strategic_optimization": {
    id: "trinity_strategic_optimization",
    name: "Strategic Multi-Site Scheduling",
    description: "Profit-first multi-agent scheduling across ALL sites — certifications, overtime exposure, travel time, guard preferences, client requirements, profitability targets. Standard scheduling is included in every tier; this is the strategic + profit-optimized tier.",
    category: "ai_automation",
    featureType: "elite",
    minimumTier: "professional",
    includedInTiers: ["enterprise"],
    creditCost: 5, // fallback per-shift credit cost for below-tier access
    billingMode: "per_shift",
    creditCostUnit: "per shift scheduled",
    monthlyLimits: {
      free: 0,
      starter: 0,
      professional: 300,   // 300 strategic shifts/month included
      business: 1000,      // 1,000 strategic shifts/month included
      enterprise: -1,      // Unlimited — included in Enterprise
    },
    // Per-shift USD surcharge when monthly quota is exceeded
    eliteSurchargeCents: {
      professional: 25,    // $0.25/shift over 300
      business: 15,        // $0.15/shift over 1,000
      enterprise: 0,       // Included, unlimited
    },
    availableAsAddon: true,
    addonPricePerMonth: 99,
    addonUnlimitedCredits: false,
    badgeLabel: "Elite",
    badgeColor: "gradient",
    icon: "Sparkles",
    enabled: true,
    betaOnly: false,
    requiresSetup: false,
  },

  "claude_contract_analysis": {
    id: "claude_contract_analysis",
    name: "Trinity Contract Analysis",
    description: "Trinity reads full contracts, flags liability clauses, unfavorable terms, missing protections, and ambiguous language. She compares against Texas PSB and target-state requirements and produces line-by-line redlines. Trinity's legal-reasoning path handles the interpretation; her compliance cross-check path verifies against regulation — one agent, multiple reasoning passes.",
    category: "contracts",
    featureType: "elite",
    minimumTier: "starter",
    includedInTiers: ["enterprise"],
    creditCost: 20, // fallback per-document credit cost for below-tier access
    billingMode: "per_document",
    creditCostUnit: "per contract analyzed",
    monthlyLimits: {
      free: 0,
      starter: 0,          // pay per use at $89
      professional: 2,     // 2 free/month
      business: 5,         // 5 free/month
      enterprise: -1,      // unlimited
    },
    // Human attorney: $1,750–$3,500/contract. Trinity: 5% of attorney fee.
    eliteSurchargeCents: {
      starter: 8900,       // $89 per additional
      professional: 12900, // $129 per additional
      business: 18900,     // $189 per additional
      enterprise: 0,       // Included, unlimited
    },
    availableAsAddon: true,
    addonPricePerMonth: 149,
    addonUnlimitedCredits: false,
    badgeLabel: "Elite",
    badgeColor: "gradient",
    icon: "FileSearch",
    enabled: true,
    betaOnly: false,
    requiresSetup: false,
  },

  // =========================================================================
  // ELITE FEATURES — April 2026 pricing anchored to human/firm cost
  // 1 credit = $0.01. eliteSurchargeCents holds per-tier USD cents per additional use
  // after the tier's monthly included quota is exhausted. creditCost is retained
  // as a fallback for below-minimum-tier credit-based access.
  // =========================================================================

  "trinity_rfp_generation": {
    id: "trinity_rfp_generation",
    name: "Trinity RFP & Proposal Generation",
    description: "Trinity reads the RFP document, researches the client/project, pulls your company's past performance data, and generates executive summary, scope response, staffing plan, compliance section, pricing narrative, tech section, and why-choose-us — all tailored to this specific bid. Multi-phase workflow: research → draft → validate → refine, all executed by Trinity. Full PDF-ready proposal.",
    category: "contracts",
    featureType: "elite",
    minimumTier: "starter",
    includedInTiers: ["enterprise"],
    creditCost: 30, // fallback per-proposal credit cost for below-tier access
    billingMode: "per_document",
    creditCostUnit: "per proposal generated",
    monthlyLimits: {
      free: 0,
      starter: 0,
      professional: 2,   // 2 free/month
      business: 5,       // 5 free/month
      enterprise: -1,    // unlimited
    },
    // Human firm: $3,500–$7,500/proposal. Trinity: 4.3–6.6% of firm fee.
    eliteSurchargeCents: {
      starter: 14900,      // $149 per additional
      professional: 29900, // $299 per additional
      business: 49900,     // $499 per additional
      enterprise: 0,       // Included, unlimited
    },
    availableAsAddon: true,
    addonPricePerMonth: 249,
    addonUnlimitedCredits: false,
    badgeLabel: "Elite",
    badgeColor: "gradient",
    icon: "FileText",
    enabled: true,
    betaOnly: false,
    requiresSetup: false,
  },

  "trinity_compliance_audit_report": {
    id: "trinity_compliance_audit_report",
    name: "Trinity Compliance Audit Report",
    description: "Scans all officers' licenses, certs, training records, and incident history. Cross-references against Texas PSB and any additional state requirements. Produces a full audit-readiness report with compliance score, findings, corrective action plan, and auditor-ready exhibit index.",
    category: "compliance",
    featureType: "elite",
    minimumTier: "starter",
    includedInTiers: ["enterprise"],
    creditCost: 20,
    billingMode: "per_document",
    creditCostUnit: "per audit report generated",
    monthlyLimits: {
      free: 0,
      starter: 0,
      professional: 1,
      business: 2,
      enterprise: -1,
    },
    // Compliance consultant: $2,000–$10,000. Trinity: 1.5–10% of consultant fee.
    eliteSurchargeCents: {
      starter: 19900,      // $199 per additional
      professional: 14900, // $149 per additional
      business: 12900,     // $129 per additional
      enterprise: 0,
    },
    availableAsAddon: true,
    addonPricePerMonth: 199,
    addonUnlimitedCredits: false,
    badgeLabel: "Elite",
    badgeColor: "gradient",
    icon: "ClipboardCheck",
    enabled: true,
    betaOnly: false,
    requiresSetup: false,
  },

  "trinity_regulatory_filing_packet": {
    id: "trinity_regulatory_filing_packet",
    name: "Trinity Regulatory Filing Packet",
    description: "Compiles the complete evidence package for a PSB/TCOLE/state regulatory audit. Organizes licenses, certs, post orders, incident reports, and training records. Generates cover memo, table of contents, and compliance narrative. Highest-value output — one violation avoided pays for this 100× over.",
    category: "compliance",
    featureType: "elite",
    minimumTier: "professional",
    includedInTiers: ["enterprise"],
    creditCost: 40,
    billingMode: "per_document",
    creditCostUnit: "per regulatory packet generated",
    monthlyLimits: {
      free: 0,
      starter: 0,
      professional: 0,
      business: 1,
      enterprise: 3,
    },
    // Consultant: $5,000–$10,000. Trinity: 1.5–7% of consultant fee.
    eliteSurchargeCents: {
      professional: 34900, // $349 per packet
      business: 24900,     // $249 per additional
      enterprise: 14900,   // $149 per additional after 3 free
    },
    availableAsAddon: true,
    addonPricePerMonth: 349,
    addonUnlimitedCredits: false,
    badgeLabel: "Elite",
    badgeColor: "gradient",
    icon: "FolderLock",
    enabled: true,
    betaOnly: false,
    requiresSetup: false,
  },

  "trinity_incident_investigation_report": {
    id: "trinity_incident_investigation_report",
    name: "Trinity Incident Investigation Report",
    description: "Reads the incident record, officer notes, witness statements, GPS data, and camera timestamps. Writes a professionally structured narrative in the correct legal format — timeline, root cause, officer conduct assessment, recommendations. Used for insurance claims, litigation, and client disputes.",
    category: "operations",
    featureType: "elite",
    minimumTier: "starter",
    includedInTiers: ["business", "enterprise"],
    creditCost: 8,
    billingMode: "per_document",
    creditCostUnit: "per investigation report generated",
    monthlyLimits: {
      free: 0,
      starter: 2,
      professional: 10,
      business: -1,
      enterprise: -1,
    },
    // Attorney-drafted: $500–$2,500. Trinity: 1.2–7.8% of attorney cost.
    eliteSurchargeCents: {
      starter: 3900,       // $39 per additional
      professional: 2900,  // $29 per additional
      business: 0,         // Unlimited
      enterprise: 0,       // Unlimited
    },
    availableAsAddon: true,
    addonPricePerMonth: 79,
    addonUnlimitedCredits: false,
    badgeLabel: "Elite",
    badgeColor: "gradient",
    icon: "AlertOctagon",
    enabled: true,
    betaOnly: false,
    requiresSetup: false,
  },

  "trinity_employment_verification_letter": {
    id: "trinity_employment_verification_letter",
    // IMPORTANT (TRINITY.md §P): Employment verification is a legally regulated
    // disclosure channel. This premium-feature definition is the BILLING
    // surface — monthly quotas + per-letter USD surcharges — and must NEVER
    // block or gate the FCRA approve/deny workflow itself. The canonical
    // workflow lives in server/routes/employmentVerifyRoutes.ts and
    // server/services/trinity/employmentVerificationService.ts; it does not
    // call premiumFeatureGating.checkAccess and must not start doing so in
    // a way that could deny a legally-mandated disclosure.
    name: "Trinity Employment Verification Letter",
    description: "Generates an FCRA-compliant employment verification letter with correct disclosures, FCRA-allowed data only, and an employer signature block. Routes to management for approve/deny. Delivers a formatted PDF. See TRINITY.md §P for the bounded disclosure contract.",
    category: "hr",
    featureType: "elite",
    minimumTier: "starter",
    includedInTiers: ["enterprise"],
    creditCost: 3,
    billingMode: "per_document",
    creditCostUnit: "per verification letter",
    monthlyLimits: {
      free: 0,
      starter: 3,
      professional: 10,
      business: 50,
      enterprise: -1,
    },
    // Attorney-drafted: $50–$200. Trinity: 1.5–10% of attorney cost.
    eliteSurchargeCents: {
      starter: 500,        // $5 per additional
      professional: 400,   // $4 per additional
      business: 300,       // $3 per additional
      enterprise: 0,
    },
    availableAsAddon: false,
    badgeLabel: "Elite",
    badgeColor: "gradient",
    icon: "Mail",
    enabled: true,
    betaOnly: false,
    requiresSetup: false,
  },

  "trinity_officer_performance_review": {
    id: "trinity_officer_performance_review",
    name: "Trinity Officer Performance Review",
    description: "Analyzes 12 months of shift data, attendance, incident involvement, compliance record, supervisor notes, and client feedback. Produces a structured annual/quarterly review narrative with development recommendations.",
    category: "hr",
    featureType: "elite",
    minimumTier: "starter",
    includedInTiers: ["enterprise"],
    creditCost: 3,
    billingMode: "per_document",
    creditCostUnit: "per performance review",
    monthlyLimits: {
      free: 0,
      starter: 0,
      professional: 5,
      business: 25,
      enterprise: -1,
    },
    // HR writer: $150–$400 per review. Trinity: 3.5–13% of HR cost.
    eliteSurchargeCents: {
      starter: 1900,       // $19 per additional
      professional: 1400,  // $14 per additional
      business: 900,       // $9 per additional
      enterprise: 0,
    },
    availableAsAddon: false,
    badgeLabel: "Elite",
    badgeColor: "gradient",
    icon: "Award",
    enabled: true,
    betaOnly: false,
    requiresSetup: false,
  },

  "trinity_document_deep_analysis": {
    id: "trinity_document_deep_analysis",
    name: "Trinity Document Deep Analysis",
    description: "Reads any uploaded document (contract, insurance cert, license, inspection report), extracts key data, flags issues, and produces a structured summary with action items.",
    category: "contracts",
    featureType: "elite",
    minimumTier: "starter",
    includedInTiers: ["enterprise"],
    creditCost: 5,
    billingMode: "per_document",
    creditCostUnit: "per document analyzed",
    monthlyLimits: {
      free: 0,
      starter: 3,
      professional: 10,
      business: 50,
      enterprise: -1,
    },
    // Manual review: $50–$150. Trinity: 4.7–18% of manual cost.
    eliteSurchargeCents: {
      starter: 900,        // $9 per additional
      professional: 700,   // $7 per additional
      business: 500,       // $5 per additional
      enterprise: 0,
    },
    availableAsAddon: false,
    badgeLabel: "Elite",
    badgeColor: "gradient",
    icon: "FileSearch",
    enabled: true,
    betaOnly: false,
    requiresSetup: false,
  },

  "trinity_client_profitability_analysis": {
    id: "trinity_client_profitability_analysis",
    name: "Trinity Client Profitability Analysis",
    description: "Calculates true per-client profitability including guard cost, overhead allocation, overtime, travel, equipment, and invoice collection rate. Produces recommendations on contract repricing, scope adjustment, or exit.",
    category: "financial",
    featureType: "elite",
    minimumTier: "professional",
    includedInTiers: ["enterprise"],
    creditCost: 10,
    billingMode: "per_document",
    creditCostUnit: "per client profitability analysis",
    monthlyLimits: {
      free: 0,
      starter: 0,
      professional: 2,
      business: 5,
      enterprise: -1,
    },
    // CFO/consultant: $500–$2,000. Trinity: 2.5–10% of consultant cost.
    eliteSurchargeCents: {
      professional: 4900,  // $49 per additional
      business: 3900,      // $39 per additional
      enterprise: 0,
    },
    availableAsAddon: true,
    addonPricePerMonth: 99,
    addonUnlimitedCredits: false,
    badgeLabel: "Elite",
    badgeColor: "gradient",
    icon: "TrendingUp",
    enabled: true,
    betaOnly: false,
    requiresSetup: false,
  },

  "trinity_predictive_analytics": {
    id: "trinity_predictive_analytics",
    name: "Trinity Predictive Analytics",
    description: "AI-powered predictions for turnover, demand, revenue, and operational efficiency",
    category: "reporting",
    featureType: "premium",
    minimumTier: "professional",
    includedInTiers: ["enterprise"],
    creditCost: 5, // 5 credits per forecast
    billingMode: "per_use",
    creditCostUnit: "per forecast generated",
    monthlyLimits: {
      free: 0,
      starter: 0,
      professional: 20,
      enterprise: 100,
    },
    availableAsAddon: true,
    addonPricePerMonth: 79,
    addonUnlimitedCredits: false,
    badgeLabel: "Premium",
    badgeColor: "purple",
    icon: "TrendingUp",
    enabled: true,
    betaOnly: false,
    requiresSetup: false,
  },

  // =========================================================================
  // COMPLIANCE PREMIUM FEATURES
  // =========================================================================

  "multi_state_compliance": {
    id: "multi_state_compliance",
    name: "Multi-State Compliance",
    description: "Automatic compliance with labor laws across all 50 states with real-time updates",
    category: "compliance",
    featureType: "premium",
    minimumTier: "professional",
    includedInTiers: ["enterprise"],
    creditCost: 2,
    billingMode: "per_action",
    creditCostUnit: "per additional state (overage)",
    monthlyLimits: {
      free: 0,
      starter: 0,
      professional: 10,
      enterprise: 50,
    },
    availableAsAddon: true,
    addonPricePerMonth: 59,
    addonUnlimitedCredits: false,
    badgeLabel: "Premium",
    badgeColor: "blue",
    icon: "Scale",
    enabled: true,
    betaOnly: false,
    requiresSetup: false,
  },

  "security_compliance_vault": {
    id: "security_compliance_vault",
    name: "Security Compliance Vault",
    description: "Locked document vault with SHA-256 hashing, WORM protection, and regulator portal access",
    category: "compliance",
    featureType: "elite",
    minimumTier: "enterprise",
    includedInTiers: ["enterprise"],
    creditCost: 3,
    billingMode: "per_action",
    creditCostUnit: "per vault operation (overage)",
    monthlyLimits: {
      free: 0,
      starter: 0,
      professional: 0,
      enterprise: 3000,
    },
    availableAsAddon: true,
    addonPricePerMonth: 199,
    addonUnlimitedCredits: false,
    badgeLabel: "Elite",
    badgeColor: "gradient",
    icon: "Shield",
    enabled: true,
    betaOnly: false,
    requiresSetup: true,
  },

  // =========================================================================
  // TRINITY STAFFING - PREMIER AUTOMATED SCHEDULING
  // =========================================================================
  
  "trinity_staffing": {
    id: "trinity_staffing",
    name: "Trinity Staffing",
    description: "AI-powered automated staffing from email work requests. Trinity monitors your inbox, parses requests, creates shifts, assigns employees, and confirms with clients automatically.",
    category: "automation",
    featureType: "elite",
    minimumTier: "professional",
    includedInTiers: ["enterprise"],
    creditCost: 5,
    billingMode: "per_action",
    creditCostUnit: "per staffing request (overage)",
    monthlyLimits: {
      free: 0,
      starter: 0,
      professional: 0,
      enterprise: 500,
    },
    availableAsAddon: true,
    addonPricePerMonth: 299,
    addonUnlimitedCredits: false,
    badgeLabel: "Premier",
    badgeColor: "gradient",
    icon: "Bot",
    enabled: true,
    betaOnly: false,
    requiresSetup: true,
  },

  "trinity_staffing_email_scan": {
    id: "trinity_staffing_email_scan",
    name: "Trinity Staffing Email Scanning",
    description: "Continuous email inbox monitoring for work requests",
    category: "automation",
    featureType: "elite",
    minimumTier: "professional",
    includedInTiers: ["enterprise"],
    creditCost: 5, // 5 credits per hour of active scanning
    billingMode: "per_use",
    creditCostUnit: "per hour of scanning",
    monthlyLimits: {
      free: 0,
      starter: 0,
      professional: 0,
      enterprise: 720,
    },
    availableAsAddon: false,
    badgeLabel: "Premier",
    badgeColor: "gradient",
    icon: "Mail",
    enabled: true,
    betaOnly: false,
    requiresSetup: false,
  },

  "trinity_staffing_request_parse": {
    id: "trinity_staffing_request_parse",
    name: "Trinity Staffing Request Parsing",
    description: "AI extraction of shift details from work request emails",
    category: "automation",
    featureType: "elite",
    minimumTier: "professional",
    includedInTiers: ["enterprise"],
    creditCost: 8, // 8 credits per request parsed
    billingMode: "per_use",
    creditCostUnit: "per request parsed",
    monthlyLimits: {
      free: 0,
      starter: 0,
      professional: 0,
      enterprise: 500,
    },
    availableAsAddon: false,
    badgeLabel: "Premier",
    badgeColor: "gradient",
    icon: "FileSearch",
    enabled: true,
    betaOnly: false,
    requiresSetup: false,
  },

  "trinity_staffing_auto_assign": {
    id: "trinity_staffing_auto_assign",
    name: "Trinity Staffing Auto-Assignment",
    description: "AI-powered employee matching based on qualifications, availability, proximity, and reliability",
    category: "automation",
    featureType: "elite",
    minimumTier: "professional",
    includedInTiers: ["enterprise"],
    creditCost: 4, // 4 credits per shift auto-assigned (per-shift billing)
    billingMode: "per_shift",
    creditCostUnit: "per shift assigned",
    monthlyLimits: {
      free: 0,
      starter: 0,
      professional: 0,
      enterprise: 500,
    },
    availableAsAddon: false,
    badgeLabel: "Premier",
    badgeColor: "gradient",
    icon: "UserCheck",
    enabled: true,
    betaOnly: false,
    requiresSetup: false,
  },

  "trinity_staffing_confirmation": {
    id: "trinity_staffing_confirmation",
    name: "Trinity Staffing Client Confirmation",
    description: "AI-generated human-like confirmation emails to clients with officer details",
    category: "communication",
    featureType: "elite",
    minimumTier: "professional",
    includedInTiers: ["enterprise"],
    creditCost: 4,
    billingMode: "per_use",
    creditCostUnit: "per confirmation sent",
    monthlyLimits: {
      free: 0,
      starter: 0,
      professional: 0,
      enterprise: 500,
    },
    availableAsAddon: false,
    badgeLabel: "Premier",
    badgeColor: "gradient",
    icon: "MailCheck",
    enabled: true,
    betaOnly: false,
    requiresSetup: false,
  },

  "guard_tour_tracking": {
    id: "guard_tour_tracking",
    name: "Guard Tour Tracking",
    description: "Complete guard tour management with GPS/QR/NFC checkpoint scanning, configurable patrol intervals, and real-time completion tracking",
    category: "operations",
    featureType: "premium",
    minimumTier: "starter",
    includedInTiers: ["professional", "enterprise"],
    creditCost: 1,
    billingMode: "per_use",
    creditCostUnit: "per checkpoint scan",
    monthlyLimits: {
      free: 0,
      starter: 100,
      professional: 1000,
      enterprise: 10000,
    },
    availableAsAddon: true,
    addonPricePerMonth: 39,
    addonUnlimitedCredits: false,
    badgeLabel: "Premium",
    badgeColor: "blue",
    icon: "Navigation",
    enabled: true,
    betaOnly: false,
    requiresSetup: false,
  },

  "equipment_tracking": {
    id: "equipment_tracking",
    name: "Equipment Tracking",
    description: "Full equipment lifecycle management with checkout/return workflows, maintenance scheduling, and loss prevention across radios, vehicles, weapons, and tools",
    category: "operations",
    featureType: "premium",
    minimumTier: "starter",
    includedInTiers: ["professional", "enterprise"],
    creditCost: 1,
    billingMode: "per_use",
    creditCostUnit: "per checkout/return",
    monthlyLimits: {
      free: 0,
      starter: 50,
      professional: 500,
      enterprise: 5000,
    },
    availableAsAddon: true,
    addonPricePerMonth: 29,
    addonUnlimitedCredits: false,
    badgeLabel: "Premium",
    badgeColor: "blue",
    icon: "Package",
    enabled: true,
    betaOnly: false,
    requiresSetup: false,
  },

  "post_orders_management": {
    id: "post_orders_management",
    name: "Post Orders Management",
    description: "Create, manage, and assign post order templates to shifts with priority levels, acknowledgment requirements, and photo documentation",
    category: "operations",
    featureType: "premium",
    minimumTier: "starter",
    includedInTiers: ["professional", "enterprise"],
    creditCost: 1,
    billingMode: "per_action",
    creditCostUnit: "per post order created (overage)",
    monthlyLimits: {
      free: 0,
      starter: 20,
      professional: 200,
      enterprise: 1000,
    },
    availableAsAddon: false,
    badgeLabel: "Premium",
    badgeColor: "blue",
    icon: "ClipboardList",
    enabled: true,
    betaOnly: false,
    requiresSetup: false,
  },

  "document_signing": {
    id: "document_signing",
    name: "Internal Document Signing",
    description: "Full internal signing service with verification tokens, internal/external recipient support, reminder automation, and CAN-SPAM compliant email delivery",
    category: "contracts",
    featureType: "premium",
    minimumTier: "professional",
    includedInTiers: ["professional", "enterprise"],
    creditCost: 3,
    billingMode: "per_document",
    creditCostUnit: "per document sent for signature",
    monthlyLimits: {
      free: 0,
      starter: 0,
      professional: 50,
      enterprise: 500,
    },
    availableAsAddon: true,
    addonPricePerMonth: 49,
    addonUnlimitedCredits: false,
    badgeLabel: "Premium",
    badgeColor: "purple",
    icon: "PenTool",
    enabled: true,
    betaOnly: false,
    requiresSetup: false,
  },

  "employee_onboarding": {
    id: "employee_onboarding",
    name: "Employee Onboarding",
    description: "Automated employee onboarding workflows with document collection, training assignment, credential verification, and progress tracking",
    category: "hr",
    featureType: "core",
    minimumTier: "starter",
    includedInTiers: ["starter", "professional", "enterprise"],
    creditCost: 2,
    billingMode: "per_action",
    creditCostUnit: "per onboarding workflow (overage)",
    monthlyLimits: {
      free: 0,
      starter: 15,
      professional: 50,
      enterprise: 200,
    },
    availableAsAddon: false,
    badgeLabel: "Core",
    badgeColor: "blue",
    icon: "UserPlus",
    enabled: true,
    betaOnly: false,
    requiresSetup: false,
  },

  "shift_marketplace": {
    id: "shift_marketplace",
    name: "Shift Marketplace",
    description: "Open shift posting marketplace where qualified employees can claim available shifts with automatic eligibility checking",
    category: "scheduling",
    featureType: "core",
    minimumTier: "starter",
    includedInTiers: ["starter", "professional", "enterprise"],
    creditCost: 1,
    billingMode: "per_action",
    creditCostUnit: "per marketplace posting (overage)",
    monthlyLimits: {
      free: 0,
      starter: 200,
      professional: 1000,
      enterprise: 3000,
    },
    availableAsAddon: false,
    badgeLabel: "Core",
    badgeColor: "blue",
    icon: "Store",
    enabled: true,
    betaOnly: false,
    requiresSetup: false,
  },

  "shift_swapping": {
    id: "shift_swapping",
    name: "Shift Swapping",
    description: "Employee-initiated shift swap requests with manager approval workflows and automatic eligibility validation",
    category: "scheduling",
    featureType: "core",
    minimumTier: "starter",
    includedInTiers: ["starter", "professional", "enterprise"],
    creditCost: 1,
    billingMode: "per_action",
    creditCostUnit: "per swap request (overage)",
    monthlyLimits: {
      free: 0,
      starter: 100,
      professional: 500,
      enterprise: 2000,
    },
    availableAsAddon: false,
    badgeLabel: "Core",
    badgeColor: "blue",
    icon: "ArrowLeftRight",
    enabled: true,
    betaOnly: false,
    requiresSetup: false,
  },

  "payroll_automation": {
    id: "payroll_automation",
    name: "Payroll Automation",
    description: "Automated payroll processing with overtime calculations, tax withholdings, direct deposit integration, and QuickBooks sync",
    category: "financial",
    featureType: "premium",
    minimumTier: "professional",
    includedInTiers: ["professional", "enterprise"],
    creditCost: 2, // 2 credits per employee processed (per-seat billing)
    billingMode: "per_seat",
    creditCostUnit: "per employee processed",
    monthlyLimits: {
      free: 0,
      starter: 0,
      professional: 250,  // Up to 250 employee payroll entries/month (~50 emp × 5 runs)
      enterprise: 2500,   // Up to 2,500 employee payroll entries/month (~500 emp × 5 runs)
    },
    availableAsAddon: false,
    badgeLabel: "Premium",
    badgeColor: "gold",
    icon: "Banknote",
    enabled: true,
    betaOnly: false,
    requiresSetup: true,
  },

  "invoice_generation": {
    id: "invoice_generation",
    name: "AI Invoice Generation",
    description: "Automated invoice creation from time entries with client billing rates, tax calculations, and delivery scheduling",
    category: "financial",
    featureType: "premium",
    minimumTier: "professional",
    includedInTiers: ["professional", "enterprise"],
    creditCost: 6,
    billingMode: "per_document",
    creditCostUnit: "per invoice generated",
    monthlyLimits: {
      free: 0,
      starter: 0,
      professional: 50,
      enterprise: 500,
    },
    availableAsAddon: false,
    badgeLabel: "Premium",
    badgeColor: "gold",
    icon: "Receipt",
    enabled: true,
    betaOnly: false,
    requiresSetup: false,
  },

  "quickbooks_sync": {
    id: "quickbooks_sync",
    name: "QuickBooks Integration",
    description: "Full bidirectional QuickBooks sync for invoices, payments, expenses, and chart of accounts with extensive automation",
    category: "financial",
    featureType: "premium",
    minimumTier: "professional",
    includedInTiers: ["professional", "enterprise"],
    creditCost: 5,
    billingMode: "per_use",
    creditCostUnit: "per sync operation",
    monthlyLimits: {
      free: 0,
      starter: 0,
      professional: 100,
      enterprise: 1000,
    },
    availableAsAddon: false,
    badgeLabel: "Premium",
    badgeColor: "gold",
    icon: "RefreshCw",
    enabled: true,
    betaOnly: false,
    requiresSetup: true,
  },

  "push_notifications": {
    id: "push_notifications",
    name: "Push Notifications",
    description: "Web Push notifications for shift assignments, schedule changes, certification expiry alerts, and urgent communications",
    category: "communication",
    featureType: "core",
    minimumTier: "starter",
    includedInTiers: ["starter", "professional", "enterprise"],
    creditCost: 1,
    billingMode: "per_action",
    creditCostUnit: "per notification (overage)",
    monthlyLimits: {
      free: 0,
      starter: 500,
      professional: 5000,
      enterprise: 15000,
    },
    availableAsAddon: false,
    badgeLabel: "Core",
    badgeColor: "blue",
    icon: "Bell",
    enabled: true,
    betaOnly: false,
    requiresSetup: false,
  },

  "employee_behavior_scoring": {
    id: "employee_behavior_scoring",
    name: "Employee Behavior Scoring",
    description: "AI-driven reliability, engagement, and performance scoring based on clock-in patterns, shift completions, and peer feedback. Billed per employee scored.",
    category: "ai_automation",
    featureType: "premium",
    minimumTier: "professional",
    includedInTiers: ["professional", "enterprise"],
    creditCost: 2, // 2 credits per employee scored (per-seat billing)
    billingMode: "per_seat",
    creditCostUnit: "per employee scored",
    monthlyLimits: {
      free: 0,
      starter: 0,
      professional: 250,  // Up to 250 employee scores/month (~50 emp × 5 scoring runs)
      enterprise: 2500,   // Up to 2,500 employee scores/month (~500 emp × 5 scoring runs)
    },
    availableAsAddon: false,
    badgeLabel: "Premium",
    badgeColor: "purple",
    icon: "Award",
    enabled: true,
    betaOnly: false,
    requiresSetup: false,
  },

  "client_portal": {
    id: "client_portal",
    name: "Client Portal",
    description: "Real-time client dashboard with GPS tracking, incident reports, officer profiles, and service quality metrics",
    category: "operations",
    featureType: "premium",
    minimumTier: "professional",
    includedInTiers: ["professional", "enterprise"],
    creditCost: 2,
    billingMode: "per_action",
    creditCostUnit: "per client portal access (overage)",
    monthlyLimits: {
      free: 0,
      starter: 0,
      professional: 25,
      enterprise: 100,
    },
    availableAsAddon: false,
    badgeLabel: "Premium",
    badgeColor: "purple",
    icon: "Monitor",
    enabled: true,
    betaOnly: false,
    requiresSetup: false,
  },

  "client_portal_helpai": {
    id: "client_portal_helpai",
    name: "Client Portal DockChat",
    description: "AI-powered floating chat widget in the client portal. Clients submit billing discrepancies, staff issues, complaints, and violations. HelpAI performs sentiment analysis and generates a structured summary with recommended actions for the org to resolve issues — no phone calls needed.",
    category: "ai_automation",
    featureType: "premium",
    minimumTier: "professional",
    includedInTiers: ["professional", "enterprise"],
    creditCost: 10,
    billingMode: "per_use",
    creditCostUnit: "per client chat session (AI sentiment analysis + summary)",
    monthlyLimits: {
      free: 0,
      starter: 0,
      professional: 50,
      enterprise: 500,
    },
    availableAsAddon: false,
    badgeLabel: "Premium",
    badgeColor: "purple",
    icon: "MessageSquare",
    enabled: true,
    betaOnly: false,
    requiresSetup: false,
  },

  "bot_ecosystem": {
    id: "bot_ecosystem",
    name: "Trinity Bot Ecosystem",
    description: "5 specialized AI bots - HelpAI for support, MeetingBot for transcription, ReportBot for incidents, ClockBot for time tracking, CleanupBot for maintenance",
    category: "ai_automation",
    featureType: "premium",
    minimumTier: "professional",
    includedInTiers: ["professional", "enterprise"],
    creditCost: 2,
    billingMode: "per_use",
    creditCostUnit: "per bot interaction",
    monthlyLimits: {
      free: 0,
      starter: 0,
      professional: 500,
      enterprise: 5000,
    },
    availableAsAddon: false,
    badgeLabel: "Premium",
    badgeColor: "gold",
    icon: "Bot",
    enabled: true,
    betaOnly: false,
    requiresSetup: false,
  },

  "basic_scheduling": {
    id: "basic_scheduling",
    name: "Basic Scheduling",
    description: "Core shift scheduling with drag-and-drop calendar, recurring shifts, employee availability management, and overtime alerts",
    category: "scheduling",
    featureType: "core",
    minimumTier: "free",
    includedInTiers: ["free", "starter", "professional", "enterprise"],
    creditCost: 1,
    billingMode: "per_action",
    creditCostUnit: "per shift created (overage)",
    monthlyLimits: {
      free: 50,
      starter: 500,
      professional: 2500,
      enterprise: 10000,
    },
    availableAsAddon: false,
    badgeLabel: "Core",
    badgeColor: "blue",
    icon: "Calendar",
    enabled: true,
    betaOnly: false,
    requiresSetup: false,
  },

  "basic_time_tracking": {
    id: "basic_time_tracking",
    name: "Basic Time Tracking",
    description: "Employee clock-in/out with timesheet management, break tracking, and basic reporting",
    category: "time_tracking",
    featureType: "core",
    minimumTier: "free",
    includedInTiers: ["free", "starter", "professional", "enterprise"],
    creditCost: 1,
    billingMode: "per_action",
    creditCostUnit: "per clock-in/out (overage)",
    monthlyLimits: {
      free: 100,
      starter: 1000,
      professional: 5000,
      enterprise: 20000,
    },
    availableAsAddon: false,
    badgeLabel: "Core",
    badgeColor: "blue",
    icon: "Clock",
    enabled: true,
    betaOnly: false,
    requiresSetup: false,
  },

  "helpdesk_support": {
    id: "helpdesk_support",
    name: "Helpdesk & Support",
    description: "Built-in helpdesk with ticket management, priority routing, and AI-powered response suggestions",
    category: "communication",
    featureType: "core",
    minimumTier: "starter",
    includedInTiers: ["starter", "professional", "enterprise"],
    creditCost: 1,
    billingMode: "per_action",
    creditCostUnit: "per support ticket (overage)",
    monthlyLimits: {
      free: 0,
      starter: 100,
      professional: 500,
      enterprise: 2000,
    },
    availableAsAddon: false,
    badgeLabel: "Core",
    badgeColor: "blue",
    icon: "LifeBuoy",
    enabled: true,
    betaOnly: false,
    requiresSetup: false,
  },

  "chatrooms": {
    id: "chatrooms",
    name: "Team Chatrooms",
    description: "Real-time shift chatrooms with WebSocket messaging, file sharing, and AI-powered conversation management",
    category: "communication",
    featureType: "core",
    minimumTier: "starter",
    includedInTiers: ["starter", "professional", "enterprise"],
    creditCost: 1,
    billingMode: "per_action",
    creditCostUnit: "per chatroom created (overage)",
    monthlyLimits: {
      free: 0,
      starter: 50,
      professional: 200,
      enterprise: 750,
    },
    availableAsAddon: false,
    badgeLabel: "Core",
    badgeColor: "blue",
    icon: "MessageSquare",
    enabled: true,
    betaOnly: false,
    requiresSetup: false,
  },

  "advanced_analytics": {
    id: "advanced_analytics",
    name: "Advanced Analytics",
    description: "Deep workforce intelligence with labor cost optimization, productivity tracking, profitability analysis, and predictive forecasting",
    category: "reporting",
    featureType: "premium",
    minimumTier: "professional",
    includedInTiers: ["professional", "enterprise"],
    creditCost: 15,
    billingMode: "per_use",
    creditCostUnit: "per report generated",
    monthlyLimits: {
      free: 0,
      starter: 0,
      professional: 30,
      enterprise: 200,
    },
    availableAsAddon: true,
    addonPricePerMonth: 79,
    addonUnlimitedCredits: false,
    badgeLabel: "Premium",
    badgeColor: "purple",
    icon: "BarChart3",
    enabled: true,
    betaOnly: false,
    requiresSetup: false,
  },

  "incident_management": {
    id: "incident_management",
    name: "Incident Management",
    description: "Complete incident reporting, tracking, and resolution workflow with severity levels, photo evidence, and regulatory compliance documentation",
    category: "operations",
    featureType: "premium",
    minimumTier: "professional",
    includedInTiers: ["professional", "enterprise"],
    creditCost: 2,
    billingMode: "per_action",
    creditCostUnit: "per incident report (overage)",
    monthlyLimits: {
      free: 0,
      starter: 0,
      professional: 100,
      enterprise: 750,
    },
    availableAsAddon: false,
    badgeLabel: "Premium",
    badgeColor: "purple",
    icon: "AlertTriangle",
    enabled: true,
    betaOnly: false,
    requiresSetup: false,
  },

  "client_billing": {
    id: "client_billing",
    name: "Client Billing",
    description: "Automated client billing with configurable rates, billing schedules, and online invoice payment portal for clients",
    category: "financial",
    featureType: "premium",
    minimumTier: "professional",
    includedInTiers: ["professional", "enterprise"],
    creditCost: 3,
    billingMode: "per_action",
    creditCostUnit: "per billing cycle (overage)",
    monthlyLimits: {
      free: 0,
      starter: 0,
      professional: 50,
      enterprise: 300,
    },
    availableAsAddon: false,
    badgeLabel: "Premium",
    badgeColor: "gold",
    icon: "CreditCard",
    enabled: true,
    betaOnly: false,
    requiresSetup: false,
  },

  // ── Trinity Voice Phone System ──────────────────────────────────────────────
  "trinity_voice": {
    id: "trinity_voice",
    name: "Trinity Voice Phone System",
    description: "AI-powered IVR phone system for security company clients — 6 extensions (Sales, Client Support, Employment Verification, Staff, Emergencies, Careers), voice clock-in with PIN auth, and per-call credit billing",
    category: "communication",
    featureType: "premium",
    minimumTier: "professional",
    includedInTiers: ["professional", "business", "enterprise", "strategic"],
    creditCost: 0,
    billingMode: "included",
    creditCostUnit: "per month",
    monthlyLimits: {
      free: 0,
      starter: 0,
      professional: 500,
      enterprise: 2000,
    },
    availableAsAddon: true,
    badgeLabel: "Professional+",
    badgeColor: "blue",
    icon: "Phone",
    enabled: true,
    betaOnly: false,
    requiresSetup: true,
  },
};

// ============================================================================
// ADDON KEY TO FEATURE ID MAPPING
// Maps billingAddons.addonKey to PREMIUM_FEATURES keys for entitlement checking
// ============================================================================

export const ADDON_KEY_TO_FEATURE_MAP: Record<string, string> = {
  // Direct matches (addon key equals feature ID)
  'trinity_meeting_recording': 'trinity_meeting_recording',
  'ai_dar_generation': 'ai_dar_generation',
  'gps_photo_verification': 'gps_photo_verification',
  'trinity_strategic_optimization': 'trinity_strategic_optimization',
  'claude_contract_analysis': 'claude_contract_analysis',
  'trinity_predictive_analytics': 'trinity_predictive_analytics',
  'multi_state_compliance': 'multi_state_compliance',
  'security_compliance_vault': 'security_compliance_vault',
  'trinity_staffing': 'trinity_staffing',
  
  // Legacy/alternate addon key mappings
  'recordos': 'trinity_meeting_recording',           // RecordOS addon maps to recording feature
  'dar_ai': 'ai_dar_generation',                    // DAR AI addon maps to DAR feature
  'gps_verify': 'gps_photo_verification',           // GPS verify addon maps to GPS feature
  'scheduleos_ai': 'trinity_strategic_optimization', // ScheduleOS AI maps to strategic optimization
  'contractos': 'claude_contract_analysis',          // ContractOS maps to contract analysis
  'insightos': 'trinity_predictive_analytics',       // InsightOS maps to predictive analytics
  'compliance_multi_state': 'multi_state_compliance', // Compliance addon maps to multi-state
  'vault_security': 'security_compliance_vault',     // Vault addon maps to security vault
  'staffingos': 'trinity_staffing',                  // StaffingOS addon maps to Trinity Staffing
  'trinity_voice': 'trinity_voice',                  // Trinity Voice Phone System

  // Elite Features (April 2026 pricing matrix) — direct addon entitlement mapping
  'trinity_rfp_generation': 'trinity_rfp_generation',
  'trinity_compliance_audit_report': 'trinity_compliance_audit_report',
  'trinity_regulatory_filing_packet': 'trinity_regulatory_filing_packet',
  'trinity_incident_investigation_report': 'trinity_incident_investigation_report',
  'trinity_employment_verification_letter': 'trinity_employment_verification_letter',
  'trinity_officer_performance_review': 'trinity_officer_performance_review',
  'trinity_document_deep_analysis': 'trinity_document_deep_analysis',
  'trinity_client_profitability_analysis': 'trinity_client_profitability_analysis',
  // Legacy / alternate addon key aliases
  'rfp_os': 'trinity_rfp_generation',
  'complianceos': 'trinity_compliance_audit_report',
  'regulatoryos': 'trinity_regulatory_filing_packet',
  'incidentos': 'trinity_incident_investigation_report',
  'verifyos': 'trinity_employment_verification_letter',
  'reviewos': 'trinity_officer_performance_review',
  'docos': 'trinity_document_deep_analysis',
  'profitos': 'trinity_client_profitability_analysis',
};

/**
 * Map addon keys to premium feature IDs
 */
export function mapAddonKeyToFeatureId(addonKey: string): string | null {
  return ADDON_KEY_TO_FEATURE_MAP[addonKey] || null;
}

// ============================================================================
// CREDIT PACKAGES
// ============================================================================

export const CREDIT_PACKAGES: CreditPackage[] = [
  {
    id: "credits_50",
    name: "Starter Pack",
    credits: 50,
    price: 9.99,
    bonusCredits: 0,
    popular: false,
    stripeProductId: "prod_credits_50",
    stripePriceId: "price_credits_50",
  },
  {
    id: "credits_200",
    name: "Growth Pack",
    credits: 200,
    price: 29.99,
    bonusCredits: 20,
    popular: true,
    stripeProductId: "prod_credits_200",
    stripePriceId: "price_credits_200",
  },
  {
    id: "credits_500",
    name: "Professional Pack",
    credits: 500,
    price: 59.99,
    bonusCredits: 75,
    popular: false,
    stripeProductId: "prod_credits_500",
    stripePriceId: "price_credits_500",
  },
  {
    id: "credits_1000",
    name: "Enterprise Pack",
    credits: 1000,
    price: 99.99,
    bonusCredits: 200,
    popular: false,
    stripeProductId: "prod_credits_1000",
    stripePriceId: "price_credits_1000",
  },
];

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

export function isPremiumFeature(featureId: string): boolean {
  const feature = PREMIUM_FEATURES[featureId];
  return feature?.featureType === 'premium' || feature?.featureType === 'elite';
}

export function isEliteFeature(featureId: string): boolean {
  return PREMIUM_FEATURES[featureId]?.featureType === 'elite';
}

export function getFeatureTokenCost(featureId: string): number {
  return PREMIUM_FEATURES[featureId]?.creditCost ?? 0;
}

export function isFeatureIncludedInTier(featureId: string, tier: SubscriptionTier): boolean {
  const feature = PREMIUM_FEATURES[featureId];
  if (!feature) return true; // Unknown features default to included
  return feature.includedInTiers.includes(tier);
}

export function getMonthlyLimit(featureId: string, tier: SubscriptionTier): number {
  const feature = PREMIUM_FEATURES[featureId];
  if (!feature) return 0; // Unknown features default to 0 - must be registered
  // @ts-expect-error — TS migration: fix in refactoring sprint
  return feature.monthlyLimits[tier];
}

export function canAccessFeature(
  featureId: string,
  tier: SubscriptionTier,
  currentUsage: number,
  availableCredits: number,
  requestedUnits: number = 1,
  purchasedAddons: string[] = []  // List of addon feature IDs that user has purchased
): { allowed: boolean; reason?: string; creditsRequired?: number; tierEligible?: boolean; requiresAddon?: boolean } {
  const feature = PREMIUM_FEATURES[featureId];
  
  if (!feature) {
    return { allowed: true, tierEligible: true }; // Unknown features are allowed
  }
  
  if (!feature.enabled) {
    return { allowed: false, reason: 'Feature is currently disabled', tierEligible: false };
  }
  
  // STEP 1: Check minimum tier requirement FIRST
  const tierOrder: SubscriptionTier[] = ['free', 'trial', 'starter', 'professional', 'business', 'enterprise', 'strategic'];
  const currentTierIndex = tierOrder.indexOf(tier);
  const requiredTierIndex = tierOrder.indexOf(feature.minimumTier);
  
  const tierMeetsMinimum = currentTierIndex >= requiredTierIndex;
  const tierIncludesFeature = feature.includedInTiers.includes(tier);
  const hasAddonPurchased = purchasedAddons.includes(featureId);
  
  // STEP 2: If tier includes feature, check monthly limits
  if (tierIncludesFeature) {
    // @ts-expect-error — TS migration: fix in refactoring sprint
    const limit = feature.monthlyLimits[tier];
    if (currentUsage + requestedUnits <= limit) {
      return { allowed: true, tierEligible: true }; // Within limit
    }
    // Over limit - need credits even if tier includes feature
    const creditsNeeded = feature.creditCost * requestedUnits;
    if (creditsNeeded > 0 && availableCredits >= creditsNeeded) {
      return { allowed: true, creditsRequired: creditsNeeded, tierEligible: true };
    }
    const unitLabel = feature.billingMode === 'per_minute' ? 'minutes' : 
                       feature.billingMode === 'per_shift' ? 'shifts' :
                       feature.billingMode === 'per_seat' ? 'seats' :
                       feature.billingMode === 'per_action' ? 'actions' :
                       feature.billingMode === 'per_document' ? 'documents' : 'uses';
    return { 
      allowed: false, 
      reason: `Monthly limit of ${limit} ${unitLabel} reached. ${creditsNeeded > 0 ? 'Purchase credits to continue.' : 'Upgrade your tier for higher limits.'}`,
      creditsRequired: creditsNeeded,
      tierEligible: true
    };
  }
  
  // STEP 3: If user has purchased the add-on, allow access
  if (hasAddonPurchased) {
    if (feature.addonUnlimitedCredits) {
      return { allowed: true, tierEligible: true };
    }
    if (feature.creditCost === 0) {
      return { allowed: true, tierEligible: true };
    }
    // @ts-expect-error — TS migration: fix in refactoring sprint
    const limit = feature.monthlyLimits[tier] || feature.monthlyLimits.professional;
    if (currentUsage + requestedUnits <= limit) {
      return { allowed: true, tierEligible: true };
    }
    const creditsNeeded = feature.creditCost * requestedUnits;
    if (creditsNeeded > 0 && availableCredits >= creditsNeeded) {
      return { allowed: true, creditsRequired: creditsNeeded, tierEligible: true };
    }
    return { 
      allowed: false, 
      reason: `Monthly add-on limit reached. ${creditsNeeded > 0 ? 'Purchase credits to continue.' : 'Contact support for higher limits.'}`,
      creditsRequired: creditsNeeded,
      tierEligible: true
    };
  }
  
  // STEP 4: Tier meets minimum - allow credit-based access (for features with credits)
  if (tierMeetsMinimum) {
    const creditsNeeded = feature.creditCost * requestedUnits;
    // For zero-credit features at minimum tier, require addon purchase
    if (creditsNeeded === 0 && feature.billingMode === 'included') {
      return {
        allowed: false,
        reason: `This feature requires ${feature.minimumTier} tier with feature included, or purchase the ${feature.name} add-on.`,
        creditsRequired: 0,
        tierEligible: true,
        requiresAddon: true
      };
    }
    if (availableCredits >= creditsNeeded) {
      return { allowed: true, creditsRequired: creditsNeeded, tierEligible: true };
    }
    return {
      allowed: false,
      reason: `Insufficient credits. Need ${creditsNeeded} credits for ${requestedUnits} ${feature.billingMode.replace('per_', '')}(s).`,
      creditsRequired: creditsNeeded,
      tierEligible: true
    };
  }
  
  // STEP 5: Tier below minimum - check if add-on is available for credit-based access
  // Elite features require minimum tier OR purchased addon — no credit-only bypass for below-tier users
  if (feature.availableAsAddon && feature.creditCost > 0 && feature.featureType !== 'elite') {
    const creditsNeeded = feature.creditCost * requestedUnits;
    if (availableCredits >= creditsNeeded) {
      return { allowed: true, creditsRequired: creditsNeeded, tierEligible: false };
    }
    return {
      allowed: false,
      reason: `Insufficient credits. Need ${creditsNeeded} credits for ${requestedUnits} ${feature.billingMode.replace('per_', '')}(s), or upgrade to ${feature.minimumTier} tier.`,
      creditsRequired: creditsNeeded,
      tierEligible: false,
      requiresAddon: true
    };
  }
  
  // Tier below minimum and no credit-based access available
  return {
    allowed: false,
    reason: `Requires ${feature.minimumTier} tier or higher. ${feature.availableAsAddon ? `Or purchase the ${feature.name} add-on.` : 'Upgrade your subscription.'}`,
    creditsRequired: feature.creditCost * requestedUnits,
    tierEligible: false,
    requiresAddon: feature.availableAsAddon
  };
}

export function getPremiumBadgeProps(featureId: string): { label: string; color: string; icon: string } | null {
  const feature = PREMIUM_FEATURES[featureId];
  if (!feature || feature.featureType === 'core') {
    return null;
  }
  return {
    label: feature.badgeLabel,
    color: feature.badgeColor,
    icon: feature.icon,
  };
}
