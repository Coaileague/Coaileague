/**
 * MASTER BILLING CONFIGURATION
 * =============================
 * Single source of truth for ALL billing, pricing, and subscription settings.
 * This file follows the same pattern as platformConfig.ts
 * 
 * NO HARDCODED VALUES - All pricing flows from this centralized config.
 * Edit values here to change billing behavior everywhere instantly.
 * 
 * VALUE-BASED PRICING: Captures 40-50% of $250K-$430K administrative salary replacement
 */

// ============================================================================
// PLATFORM IDENTITY (Billing Context)
// ============================================================================
import { PLATFORM } from "../server/config/platformConfig";

export const BILLING = {
  platform: {
    name: PLATFORM.name,
    currency: "USD",
    currencySymbol: "$",
    locale: "en-US",
  },

  // ==========================================================================
  // SUBSCRIPTION TIERS - PREMIUM VALUE-BASED PRICING (Jan 2026 Restructure)
  // Trinity AI replaces 3-5 admin positions. Pricing reflects 40-50% of value.
  // Updated: New tier pricing, employee limits, AI credits, and overage rates
  // ==========================================================================
  tiers: {
    free: {
      id: "free",
      name: "Free Trial",
      description: "14-day trial to experience Trinity AI automation",
      monthlyPrice: 0,
      yearlyPrice: 0,
      maxEmployees: 5,
      maxManagers: 1,
      monthlyCredits: 500, // Trial credits — enough to genuinely experience Trinity before converting (was 150)
      trialDays: 14,
      adminReplacementValue: 0,
      allowCreditOverage: false, // Must upgrade to continue
      features: [
        "Up to 5 employees, 1 manager",
        "Basic scheduling (manual, no AI optimization)",
        "Basic time tracking (no GPS)",
        "Dashboard access",
        "500 AI credits for trial",
        "Email support only",
      ],
      limitations: [
        "No GPS time tracking",
        "No mobile app",
        "No automation",
        "No integrations",
        "No compliance features",
        "No contract pipeline",
      ],
    },
    
    starter: {
      id: "starter",
      name: "Starter",
      description: "Replaces part-time scheduler + admin for small companies (up to 10 employees)",
      monthlyPrice: 29900, // $299/month in cents
      yearlyPrice: 287040, // $2,870.40/year ($239.20/mo - 20% savings)
      maxEmployees: 10,
      maxManagers: 2,
      monthlyCredits: 5000, // 5,000 AI interactions/month; hard cap at 8,000
      adminReplacementValue: 32600, // Saves ~$2,716/mo = $32,592/year in admin replacement
      overagePerEmployee: 2500, // $25/employee after 10
      allowCreditOverage: false, // Must upgrade or purchase add-on
      roiMetrics: {
        humansReplaced: "Part-time scheduler ($2,166/mo) + Admin ($400/mo) + Payroll ($150/mo)",
        monthlyLaborSaved: 2716, // $2,716/month in labor costs replaced
        netMonthlySavings: 2417, // After $299 subscription = $2,417/mo net savings
        roiPercent: 1264, // 1,264% ROI
        paybackPeriod: "Immediate",
      },
      features: [
        "Up to 10 employees included",
        "+$25/employee after 10",
        "REPLACES 50% OF SCHEDULER:",
        "Trinity AI scheduling (basic optimization)",
        "GPS time tracking (prevents $6K/year in time theft)",
        "Mobile app for guards",
        "Shift swapping with approvals",
        "Basic compliance alerts (single state)",
        "Email/SMS notifications",
        "Basic equipment checkout (50 items - prevents $4K/year losses)",
        "QuickBooks export (for payroll)",
        "Basic invoicing",
        "5,000 AI credits/month (hard cap — covers full monthly ops)",
        "Email support (48hr response)",
      ],
      excludedFeatures: [
        "Full Trinity AI automation",
        "Profit-first scheduling",
        "Payroll automation",
        "Billing/invoice automation",
        "P&L Financial Dashboard",
        "Contract Pipeline",
        "Locked document vault (WORM)",
        "E-signatures",
        "Advanced compliance (SOX)",
        "Incident management",
        "Trinity Premium AI features",
      ],
      popular: false,
    },
    
    professional: {
      id: "professional",
      name: "Professional",
      description: "Replaces scheduler + admin + compliance + equipment manager for growing companies (up to 100 employees)",
      monthlyPrice: 99900, // $999/month in cents
      yearlyPrice: 959040, // $9,590.40/year ($799.20/mo - 20% savings)
      maxEmployees: 100,
      maxManagers: 5,
      monthlyCredits: 20000, // 20,000 AI interactions/month; hard cap at 35,000; overage at $0.12/interaction
      adminReplacementValue: 184200, // Saves ~$15,351/mo = $184,212/year in labor replacement
      overagePerEmployee: 2500, // $25/employee after 100
      allowCreditOverage: true, // Auto-charge $29/2,000 credits
      creditOveragePackPrice: 2900, // $29 per 2,000 additional credits
      creditOveragePackAmount: 2000, // 2,000 credits per pack
      roiMetrics: {
        humansReplaced: "Full scheduler ($5,000) + Admin ($3,000) + Compliance ($3,500) + Equipment mgr ($3,000) + Payroll ($600)",
        monthlyLaborSaved: 17350, // $17,350/month in labor costs replaced
        netMonthlySavings: 16351, // After $999 subscription = $16,351/mo net savings
        roiPercent: 2216, // 2,216% ROI
        paybackPeriod: "Immediate",
      },
      features: [
        "Up to 100 employees included",
        "+$25/employee after 100",
        "REPLACES FULL SCHEDULER (100%):",
        "FULL Trinity AI automation",
        "Profit-first scheduling (maximize margins)",
        "Automated call-out coverage",
        "Officer reliability scoring",
        "Overtime prevention alerts",
        "REPLACES ADMIN STAFF (80%):",
        "Automated payroll processing",
        "QuickBooks full auto-sync",
        "Client billing automation",
        "Invoice generation & management",
        "P&L Financial Dashboard",
        "REPLACES COMPLIANCE OFFICER (100%):",
        "Multi-state compliance (TX, CA, FL, NY, etc.)",
        "Locked document vault (WORM - audit-proof)",
        "One-click audit export (PDF)",
        "Background check integration",
        "REPLACES EQUIPMENT COORDINATOR (100%):",
        "UNLIMITED equipment tracking",
        "Digital signatures + photos at checkout",
        "Automatic payroll deductions for losses",
        "CLIENT MANAGEMENT:",
        "Client portal (real-time GPS, incidents)",
        "Contract pipeline + E-signatures",
        "TRINITY PREMIUM AI (uses 2x credits):",
        "RFP responses, proposals, capability statements",
        "10,000 AI credits/month (soft cap — overages at $0.01/credit)",
        "Priority support (24hr response)",
      ],
      addonsAvailable: [
        "claude_premium_unlimited",
        "ai_cfo_insights",
        "multi_location",
        "fleet_management",
        "ai_credits",
      ],
      popular: true,
    },

    business: {
      id: "business",
      name: "Business",
      description: "Full back-office replacement for mid-market security companies (up to 300 employees)",
      monthlyPrice: 299900, // $2,999/month in cents
      yearlyPrice: 2879040, // $28,790.40/year ($2,399.20/mo - 20% savings)
      maxEmployees: 300,
      maxManagers: 15,
      monthlyCredits: 60000, // 60,000 AI interactions/month; hard cap at 120,000; overage at $0.10/interaction
      adminReplacementValue: 360000, // Saves ~$30,000/mo in labor
      overagePerEmployee: 2500, // $25/employee after 300
      allowCreditOverage: true,
      creditOveragePackPrice: 2900,
      creditOveragePackAmount: 2000,
      roiMetrics: {
        humansReplaced: "2× Schedulers ($10,000) + Ops Manager ($7,000) + Compliance ($6,000) + Finance ($4,500) + Payroll ($3,000)",
        monthlyLaborSaved: 30500,
        netMonthlySavings: 27501, // After $2,999 subscription
        roiPercent: 1257,
        paybackPeriod: "Immediate",
      },
      features: [
        "Up to 300 employees included",
        "+$25/employee after 300",
        "EVERYTHING in Professional, PLUS:",
        "Multi-workspace management",
        "Full P&L Financial Intelligence dashboard",
        "Social graph (client relationship intelligence)",
        "Full API access for custom integrations",
        "60,000 AI interactions/month (hard cap 120K)",
        "Priority support (12hr response)",
      ],
      popular: false,
    },

    enterprise: {
      id: "enterprise",
      name: "Enterprise",
      description: "Replaces entire back-office team for large security companies (up to 1,000 employees)",
      monthlyPrice: 799900, // $7,999/month in cents
      yearlyPrice: 7679040, // $76,790.40/year ($6,399.20/mo - 20% savings)
      maxEmployees: 1000, // Enterprise base cap — designed for Securitas/Allied/GuardWorld scale
      maxManagers: 100,
      monthlyCredits: 200000, // 200,000 AI interactions/month; hard cap 400,000; overage $0.08/interaction
      adminReplacementValue: 500000, // Saves ~$50,250/mo = $603,000/year in labor replacement
      isContactSales: false,
      startsAt: 799900, // Starts at $7,999/month base
      perEmployeePrice: 2500, // $25/employee after 1,000
      overagePerEmployee: 2500,
      allowCreditOverage: true,
      roiMetrics: {
        humansReplaced: "2× Schedulers ($10,000) + Ops Director ($8,000) + 2× Admin ($6,000) + Compliance ($6,000) + Equipment/Fleet ($5,000) + HR ($4,500) + Payroll Mgr ($5,000)",
        monthlyLaborSaved: 50250,
        netMonthlySavings: 42251, // After $7,999 subscription
        roiPercent: 618,
        paybackPeriod: "Immediate",
      },
      features: [
        "Up to 1,000 employees included",
        "+$25/employee after 1,000",
        "EVERYTHING in Business, PLUS:",
        "REPLACES OPERATIONS DIRECTOR:",
        "Trinity AI CFO insights (deep financial analysis)",
        "Per-client profitability analysis",
        "Cash flow forecasting (90 days)",
        "Predictive analytics & what-if scenarios",
        "REGULATORY ADVANTAGE:",
        "Regulator portal (state auditors access remotely)",
        "15-minute audit prep (always ready)",
        "SOX-compliant audit trails",
        "REPLACES FLEET MANAGER:",
        "Vehicle assignment & tracking",
        "Mileage logging & fuel tracking",
        "Maintenance scheduling",
        "REPLACES HR COORDINATOR:",
        "Armory/weapon management",
        "Advanced onboarding workflows",
        "Custom integrations (ADP, Workday, Paychex)",
        "ENTERPRISE AI (200,000 interactions/month):",
        "200,000 AI interactions monthly (hard cap 400K — overages at $0.08/interaction)",
        "ENTERPRISE FEATURES:",
        "White-label options",
        "Full API access",
        "SSO (Single Sign-On)",
        "99.9% uptime SLA",
        "Dedicated account manager",
        "Custom contract terms",
        "On-demand support (phone + video)",
      ],
      popular: false,
    },

    strategic: {
      id: "strategic",
      name: "Strategic",
      description: "Custom AI deployment for enterprise security organizations (300+ officers)",
      monthlyPrice: 0, // Custom — $15,000+ minimum
      yearlyPrice: 0, // Custom
      isContactSales: true,
      startsAt: 1500000, // $15,000/month minimum in cents
      maxEmployees: 0, // Custom — 300+ officers
      maxManagers: 0, // Custom
      monthlyCredits: 0, // Custom AI allocation
      adminReplacementValue: 0, // Custom ROI analysis provided
      allowCreditOverage: true,
      roiMetrics: {
        humansReplaced: "Custom analysis provided by dedicated implementation team",
        monthlyLaborSaved: 0,
        netMonthlySavings: 0,
        roiPercent: 0,
        paybackPeriod: "Custom analysis",
      },
      features: [
        "300+ officer minimum deployment",
        "Custom AI model fine-tuning for your org",
        "Union enforcement & collective bargaining support",
        "Predictive scheduling law compliance engine",
        "Multi-jurisdiction regulatory compliance",
        "On-site implementation team",
        "White-glove migration from existing systems",
        "Custom SLA with financial penalties",
        "Dedicated engineering support",
        "$15,000/month minimum commitment",
      ],
      popular: false,
    },
  },

  // ==========================================================================
  // ADD-ON PRODUCTS (Available to Professional tier only)
  // Separate Stripe products for premium features
  // ==========================================================================
  addons: {
    claude_premium_unlimited: {
      id: "addon_claude_unlimited",
      name: "Trinity Premium Unlimited",
      description: "High-volume Trinity Premium credits for RFPs, proposals, and contract reviews",
      monthlyPrice: 69900, // $699/month - VALUE-BASED: Replaces $20K+/mo consultants
      isRecurring: true,
      availableTiers: ["professional"],
      // COST PROTECTION GUARDRAILS (Jan 2026)
      // Prevents runaway API costs while maintaining value proposition
      monthlyClaudeCredits: 2000, // 2,000 premium credits/month (~65-80 operations)
      softCap: 1500, // Alert admin at 75% usage
      hardCap: 2500, // Hard stop at 2,500 (allows some buffer)
      costAlertThreshold: 50000, // Alert admin if actual API cost exceeds $500/month
      throttleThreshold: 100000, // Auto-throttle at $1,000/month actual API cost
      roiMetrics: {
        replacesConsultantCost: 20000, // RFP consultants charge $2,500+ each
        exampleUsage: "Generate 65+ RFPs/month = $162,500 value for $699",
        roiPercent: 23247, // 23,247% ROI even with limits
      },
      features: [
        "2,000 Trinity Premium credits/month (High-Volume)",
        "~65-80 RFP responses, proposals, or contract reviews",
        "Priority processing (faster API response)",
        "Advanced reasoning for complex documents",
        "Additional credits available at $59/5,000 pack",
      ],
    },
    ai_cfo_insights: {
      id: "addon_ai_cfo",
      name: "AI CFO Insights",
      description: "Enterprise-level financial intelligence - replaces $8K/mo fractional CFO",
      monthlyPrice: 79900, // $799/month - VALUE-BASED: Replaces $8K/mo fractional CFO
      isRecurring: true,
      availableTiers: ["professional"],
      roiMetrics: {
        replacesFractionalCFO: 8000, // Fractional CFO costs $8K+/mo
        typicalSavingsFound: 60000, // Typical clients find $40K-80K/year in savings
        roiPercent: 7500, // Pays for itself in month 1
      },
      features: [
        "QuickBooks deep analysis",
        "Per-client profitability (real-time margin tracking)",
        "Cash flow forecasting (90 days out)",
        "What-if scenario modeling",
        "Pricing optimization recommendations",
        "Cost-cutting opportunity detection",
        "Seasonal trend alerts",
      ],
    },
    multi_location: {
      id: "addon_multi_location",
      name: "Multi-Location Management",
      description: "Per-location analytics & scheduling - replaces $3K/mo regional coordinator",
      monthlyPrice: 39900, // $399/month per location - VALUE-BASED
      isRecurring: true,
      isMetered: true, // Per-location billing
      availableTiers: ["professional"],
      roiMetrics: {
        replacesRegionalCoordinator: 3000, // Regional coordinators cost $3K+/mo
        savingsPercent: 87, // 87% savings vs hiring coordinator
      },
      features: [
        "Separate scheduling per site",
        "Per-location analytics & P&L",
        "Regional manager dashboard",
        "Consolidated reporting",
        "Cross-location resource sharing",
      ],
    },
    fleet_management: {
      id: "addon_fleet",
      name: "Fleet Management",
      description: "Vehicle tracking & management - prevents $10K/year in losses",
      monthlyPrice: 39900, // $399/month (up to 20 vehicles)
      isRecurring: true,
      availableTiers: ["professional"],
      includedVehicles: 20,
      perVehicleOverage: 2000, // $20/vehicle after 20
      roiMetrics: {
        preventsFuelTheft: 3000, // $3K/year
        preventsBreakdowns: 5000, // $5K/year
        lowersInsurance: 2000, // $2K/year
        totalSavings: 10000, // $10K/year for $4,788 cost
      },
      features: [
        "Vehicle assignment tracking",
        "Mileage logging (automatic from GPS)",
        "Maintenance scheduling & alerts",
        "Fuel receipt tracking",
        "Insurance compliance documentation",
        "Cost per vehicle analytics",
      ],
    },
    ai_credits: {
      id: "addon_ai_credits_5000",
      name: "Additional AI Credits Pack",
      description: "5,000 credits added immediately to account balance",
      price: 5900, // $59 one-time
      credits: 5000,
      isRecurring: false, // One-time purchase
      availableTiers: ["starter", "professional"],
    },
    claude_credits_pack: {
      id: "addon_claude_credits_25",
      name: "Trinity Premium Credits Pack (25)",
      description: "25 Trinity Premium credits for RFPs, proposals, contract reviews",
      price: 69900, // $699 one-time
      credits: 25,
      isRecurring: false, // One-time purchase
      availableTiers: ["professional"],
      valuePerCredit: 500, // Each credit worth ~$500 in consultant fees
    },
  },

  // ==========================================================================
  // SUB-ORGANIZATION (BRANCH) BILLING
  // Org owners operating in multiple states can add sub-orgs under their main org.
  // Sub-orgs share the parent's subscription tier, credit pool, and caps.
  // Each sub-org is billed as a recurring addon to the parent's invoice.
  // ==========================================================================
  subOrgBilling: {
    perSubOrgMonthlyPrice: 19900, // $199/month per sub-org addon in cents
    perSubOrgYearlyPrice: 199000, // $1,990/year per sub-org ($166/mo, 17% savings)
    includedSubOrgs: 0, // No sub-orgs included by default (all are addons)
    maxSubOrgs: 50, // Maximum sub-orgs per parent org
    creditPoolModel: 'shared', // 'shared' = sub-orgs draw from parent pool | 'split' = each gets allocation
    overageModel: 'parent', // 'parent' = all overages billed to parent invoice
    availableTiers: ['professional', 'enterprise'], // Tiers that can create sub-orgs
    tierDiscounts: {
      professional: 0, // No discount
      enterprise: 20, // 20% discount on per-sub-org price ($159.20/mo)
    },
    invoiceLineItemPrefix: 'SUB_ORG', // Prefix for itemized invoice lines
    features: [
      'Separate scheduling per branch',
      'Per-branch employee/client management',
      'State-specific compliance settings',
      'Consolidated billing to parent org',
      'Shared credit pool (draws from parent)',
      'Cross-branch resource visibility for owners',
    ],
  },

  // ==========================================================================
  // STATE-BY-STATE BILLING
  // For orgs operating across multiple states, compliance and licensing
  // fees may vary. This config tracks per-state billing adjustments.
  // ==========================================================================
  stateComplianceFees: {
    enabled: true,
    perStateLicenseVerification: 2500, // $25 one-time per state license verification
    perStateComplianceMonitoring: 4900, // $49/month per active state for ongoing compliance
    includedStates: 1, // First state included in base subscription
    description: 'Multi-state operations require per-state compliance monitoring',
  },

  // ==========================================================================
  // PER-SEAT ADD-ON PRICING (Beyond included users)
  // ==========================================================================
  seatPricing: {
    employee: {
      id: "seat_employee",
      name: "Additional Employee",
      pricePerMonth: 2500, // $25/employee/month in cents — uniform across all tiers
      description: "Additional employees beyond plan included seats",
    },
    manager: {
      id: "seat_manager", 
      name: "Additional Manager",
      pricePerMonth: 2500, // $25/manager/month in cents
      description: "Managers use approvals, reports, advanced automation",
    },
  },

  // ==========================================================================
  // STORAGE QUOTAS — Option B: Category-based sub-limits per tier
  // All values in bytes. audit_reserve is a protected floor — always allowed,
  // never counted against other categories, never auto-deleted, never blocked.
  // ==========================================================================
  storageQuotas: {
    trial: {
      email:         314572800,    // 300 MB
      documents:     838860800,    // 800 MB
      media:         838860800,    // 800 MB
      audit_reserve: 104857600,    // 100 MB — protected floor
      total:         2147483648,   // 2 GB
    },
    starter: {
      email:         3221225472,   // 3 GB
      documents:     5368709120,   // 5 GB
      media:         6442450944,   // 6 GB
      audit_reserve: 1073741824,   // 1 GB — protected floor
      total:         16106127360,  // 15 GB
    },
    professional: {
      email:         12884901888,  // 12 GB
      documents:     21474836480,  // 20 GB
      media:         26843545600,  // 25 GB
      audit_reserve: 3221225472,   // 3 GB — protected floor
      total:         64424509440,  // 60 GB
    },
    business: {
      email:         37580963840,  // 35 GB
      documents:     75161927680,  // 70 GB
      media:         85899345920,  // 80 GB
      audit_reserve: 16106127360,  // 15 GB — protected floor
      total:         214748364800, // 200 GB
    },
    enterprise: {
      email:         128849018880, // 120 GB
      documents:     236223201280, // 220 GB
      media:         247010304000, // 230 GB
      audit_reserve: 32212254720,  // 30 GB — protected floor
      total:         644245094400, // 600 GB
    },
    strategic: {
      email:         429496729600, // 400 GB
      documents:     751619276800, // 700 GB
      media:         858993459200, // 800 GB
      audit_reserve: 107374182400, // 100 GB — protected floor
      total:         2199023255552, // 2 TB
    },
    // Overage rate per byte over category limit — $0.10/GB pro-rated to cents
    overageRatePerGB: 10, // $0.10/GB in cents
    overageMinChargeGB: 1, // Only bill when > 1 GB over (noise floor)
  },

  // ==========================================================================
  // STORAGE ADD-ON SKUs (recurring monthly, billed to workspace subscription)
  // ==========================================================================
  storageAddons: {
    documents_10gb: {
      id: "addon_storage_docs_10gb",
      name: "+10 GB Document Storage",
      description: "Additional 10 GB for document vault, contracts, and pay stubs",
      monthlyPrice: 500,           // $5/month in cents
      bytes: 10737418240,          // 10 GB
      category: "documents",
      availableTiers: ["starter", "professional", "business", "enterprise", "strategic"],
    },
    media_25gb: {
      id: "addon_storage_media_25gb",
      name: "+25 GB Media Storage",
      description: "Additional 25 GB for photos, videos, and chat attachments",
      monthlyPrice: 800,           // $8/month in cents
      bytes: 26843545600,          // 25 GB
      category: "media",
      availableTiers: ["starter", "professional", "business", "enterprise", "strategic"],
    },
    email_archive_50gb: {
      id: "addon_storage_email_50gb",
      name: "+50 GB Email Archive",
      description: "Additional 50 GB dedicated email attachment archiving",
      monthlyPrice: 1200,          // $12/month in cents
      bytes: 53687091200,          // 50 GB
      category: "email",
      availableTiers: ["professional", "business", "enterprise", "strategic"],
    },
    everything_100gb: {
      id: "addon_storage_bundle_100gb",
      name: "+100 GB Everything Bundle",
      description: "Additional 100 GB distributed across all categories (34/33/33 split)",
      monthlyPrice: 2200,          // $22/month in cents
      bytes: 107374182400,         // 100 GB total
      category: "all",
      splitBytes: {
        email:     34359738368,    // 32 GB
        documents: 37580963840,    // 35 GB
        media:     35433480192,    // 33 GB
      },
      availableTiers: ["business", "enterprise", "strategic"],
    },
  },

  // ==========================================================================
  // TIERED OVERAGE PRICING (Per-tier employee overage rates - Jan 2026)
  // ==========================================================================
  overages: {
    starter: 2500,      // $25/employee after included seats — uniform rate
    professional: 2500, // $25/employee after included seats — uniform rate
    business: 2500,     // $25/employee after included seats — uniform rate
    enterprise: 2500,   // $25/employee after included seats — uniform rate
    description: "Additional employees beyond included seats — flat $25/seat/month across all tiers",
    billingCycle: "monthly",
  },

  // ==========================================================================
  // FEATURE MATRIX BY TIER - Comprehensive tier-based feature gating
  // ==========================================================================
  featureMatrix: {
    // Core scheduling
    basic_scheduling: { free: true, starter: true, professional: true, enterprise: true },
    ai_scheduling: { free: false, starter: true, professional: true, enterprise: true },
    profit_first_scheduling: { free: false, starter: false, professional: true, enterprise: true },
    
    // Time tracking
    basic_time_tracking: { free: true, starter: true, professional: true, enterprise: true },
    gps_time_tracking: { free: false, starter: true, professional: true, enterprise: true },
    
    // Mobile & Apps
    mobile_app: { free: false, starter: true, professional: true, enterprise: true },
    shift_swapping: { free: false, starter: true, professional: true, enterprise: true },
    shift_marketplace: { free: false, starter: false, professional: true, enterprise: true },
    
    // Compliance
    basic_compliance: { free: false, starter: true, professional: true, enterprise: true },
    advanced_compliance_sox: { free: false, starter: false, professional: true, enterprise: true },
    
    // Notifications
    email_notifications: { free: true, starter: true, professional: true, enterprise: true },
    sms_notifications: { free: false, starter: true, professional: true, enterprise: true },
    
    // Reporting
    basic_reporting: { free: false, starter: true, professional: true, enterprise: true },
    advanced_analytics: { free: false, starter: false, professional: true, enterprise: true },
    strategic_insights: { free: false, starter: false, professional: true, enterprise: true },
    
    // Payroll & Billing
    payroll_automation: { free: false, starter: false, professional: true, enterprise: true },
    client_billing: { free: false, starter: false, professional: true, enterprise: true },
    invoice_generation: { free: false, starter: false, professional: true, enterprise: true },
    
    // Integrations
    quickbooks_integration: { free: false, starter: false, professional: true, enterprise: true },
    api_access: { free: false, starter: false, professional: false, enterprise: true },
    custom_integrations: { free: false, starter: false, professional: false, enterprise: true },
    
    // Financial Dashboard
    pl_financial_dashboard: { free: false, starter: false, professional: true, enterprise: true },
    cash_flow_forecasting: { free: false, starter: false, professional: false, enterprise: true },
    
    // Contract Pipeline
    contract_pipeline: { free: false, starter: false, professional: true, enterprise: true },
    e_signatures: { free: false, starter: false, professional: true, enterprise: true },
    document_vault: { free: false, starter: false, professional: true, enterprise: true },
    bulk_contracts: { free: false, starter: false, professional: false, enterprise: true },
    custom_templates: { free: false, starter: false, professional: false, enterprise: true },
    
    // Premium Add-ons (included in Enterprise, add-on for Professional)
    client_profitability: { free: false, starter: false, professional: "addon", enterprise: true },
    predictive_insights: { free: false, starter: false, professional: "addon", enterprise: true },
    multi_location: { free: false, starter: false, professional: "addon", enterprise: true },
    claude_premium_ai: { free: false, starter: false, professional: "addon", enterprise: true },
    
    // Enterprise-only
    white_label: { free: false, starter: false, professional: false, enterprise: true },
    dedicated_account_manager: { free: false, starter: false, professional: false, enterprise: true },
    custom_slas: { free: false, starter: false, professional: false, enterprise: true },
    fleet_management: { free: false, starter: false, professional: false, enterprise: true },
    armory_management: { free: false, starter: false, professional: false, enterprise: true },
    sso_configuration: { free: false, starter: false, professional: false, enterprise: true },
    background_checks: { free: false, starter: false, professional: false, enterprise: true },
    
    // Incident Management
    incident_management: { free: false, starter: false, professional: true, enterprise: true },
    
    // Onboarding
    employee_onboarding: { free: false, starter: true, professional: true, enterprise: true },

    // Guard Tour & Operations
    guard_tour_tracking: { free: false, starter: true, professional: true, enterprise: true },
    equipment_tracking: { free: false, starter: true, professional: true, enterprise: true },
    post_orders: { free: false, starter: true, professional: true, enterprise: true },
    document_signing: { free: false, starter: false, professional: true, enterprise: true },

    // Communication
    push_notifications: { free: false, starter: true, professional: true, enterprise: true },
    chatrooms: { free: false, starter: true, professional: true, enterprise: true },
    helpdesk: { free: false, starter: true, professional: true, enterprise: true },

    // AI Premium
    employee_behavior_scoring: { free: false, starter: false, professional: true, enterprise: true },
    bot_ecosystem: { free: false, starter: false, professional: true, enterprise: true },
    client_portal: { free: false, starter: false, professional: true, enterprise: true },
    client_portal_helpai: { free: false, starter: false, professional: true, enterprise: true },

    // Trinity Staffing Pipeline
    trinity_staffing: { free: false, starter: false, professional: true, enterprise: true },
    inbound_staffing_pipeline: { free: false, starter: false, professional: false, enterprise: true },
    sms_officer_offers: { free: false, starter: false, professional: true, enterprise: true },

    // AI Contract & Document Analysis
    contract_analysis: { free: false, starter: false, professional: true, enterprise: true },
    ai_document_extraction: { free: false, starter: false, professional: true, enterprise: true },
  },

  // ==========================================================================
  // TRINITY AI CREDIT BUNDLES (Metered billing for AI usage)
  // Credits cover: scheduling optimization, invoice generation, payroll processing, etc.
  // ==========================================================================
  creditPacks: {
    // =========================================================================
    // CANONICAL AI CREDITS PACK (March 2026)
    // $59 per pack, 5,000 credits, never expire.
    // Intentionally priced at $0.0118/credit — above the $0.01 overage rate
    // to incentivize tier upgrades over repeated pack purchases.
    // =========================================================================
    ai_credits: {
      id: "credits_ai_5000",
      name: "AI Credits Pack",
      credits: 5000,
      price: 5900, // $59 in cents
      pricePerCredit: 1.18, // cents per credit ($0.0118)
      popular: true,
      neverExpire: true,
      description: "5,000 AI credits — never expire. Use for scheduling, invoicing, and payroll automation.",
    },
    starter: {
      id: "credits_5000",
      name: "5,000 Credits",
      credits: 5000,
      price: 4900, // $49 in cents
      pricePerCredit: 0.98, // cents per credit
      popular: false,
      description: "Light automation use",
    },
    standard: {
      id: "credits_25000",
      name: "25,000 Credits",
      credits: 25000,
      price: 19900, // $199 in cents
      pricePerCredit: 0.80,
      popular: true,
      description: "Standard business operations",
    },
    professional: {
      id: "credits_100000",
      name: "100,000 Credits",
      credits: 100000,
      price: 64900, // $649 in cents
      pricePerCredit: 0.65,
      popular: false,
      description: "Heavy AI usage for larger teams",
    },
    enterprise: {
      id: "credits_500000",
      name: "500,000 Credits",
      credits: 500000,
      price: 249900, // $2,499 in cents
      pricePerCredit: 0.50,
      popular: false,
      description: "Enterprise-scale automation",
    },
  },

  // ==========================================================================
  // AUTO TOP-UP SETTINGS (Prevents service interruption)
  // ==========================================================================
  autoTopUp: {
    thresholdPercent: 20, // Trigger when 20% credits remaining
    defaultPackId: "credits_25000",
    enabled: true,
  },

  // ==========================================================================
  // CREDIT COSTS PER FEATURE (Synced with creditManager.ts - Jan 2026)
  // 1 credit = $0.01 | Gemini 3 Pro vs Flash model usage with 4x margin
  // ==========================================================================
  creditCosts: {
    // =========================================================================
    // SESSION FEES — one-time credit charge per AI domain invocation
    // payroll_session_fee and invoicing_session_fee are still active.
    // scheduling_session_fee was ELIMINATED Mar 2026 (T1 fix) — folded into
    // schedule_generation flat 300 cr charge. DO NOT add it back.
    // =========================================================================
    payroll_session_fee: 100,      // Per payroll run session (validation + audit setup)
    invoicing_session_fee: 75,     // Per invoice batch session (billing analysis + rate verification)

    // =========================================================================
    // AI Scheduling — PER-SHIFT BILLING (Mar 2026 Rebalance)
    // Cost is per shift scheduled/optimized by Trinity AI. Multiplied by quantity in creditManager.
    // $0.20/shift is 1-3% of typical shift revenue — massive value for automation.
    // =========================================================================
    ai_scheduling: 20,             // 20 credits ($0.20) per shift scheduled — replaces $150-250/week scheduling labor
    ai_schedule_optimization: 20,  // 20 credits per shift optimized (same rate as scheduling)
    ai_shift_matching: 5,          // 5 credits per open shift auto-matched
    ai_open_shift_fill: 5,         // 5 credits per shift auto-filled from marketplace
    // AI Invoicing (Flash) — Mar 2026 Rebalance
    // VALUE-BASED PRICING: Each AI invoice replaces $15-40/invoice of AR admin labor.
    // 50 cr ($0.50) = 30-80× cheaper than manual AR processing.
    ai_invoice_full_workflow: 50,  // Full lifecycle: generate + review + send (per invoice)
    ai_invoice_generation: 50,     // Per-invoice occurrence fee (was 6 → 50 cr — value-based)
    ai_invoice_review: 2,          // Standalone review/edit only (not charged in auto-workflow)
    invoice_gap_analysis: 5,       // AI gap analysis (separate analytics action)
    // AI Payroll — Mar 2026 Rebalance (added per-employee occurrence billing)
    // VALUE-BASED PRICING: ADP/Gusto/Paychex charge $3-15/employee/run.
    // 8 cr ($0.08) = 40-180× cheaper than traditional payroll bureaus.
    ai_payroll_processing: 2,      // 2 credits per employee processed (sub-step)
    ai_payroll_verification: 2,    // 2 credits per employee verified (sub-step)
    payroll_anomaly_insights: 2,   // 2 credits per employee anomaly check (sub-step)
    per_payroll_employee: 8,       // NEW — per-employee per payroll run occurrence fee (was MISSING)
    // AI Communications (Flash)
    ai_chat_query: 3,
    ai_email_generation: 4,
    // AI Analytics (Pro - complex reasoning)
    ai_analytics_report: 15,
    ai_predictions: 12,
    // AI Migration (Pro Vision)
    ai_migration: 25,
    // QuickBooks (Flash)
    quickbooks_error_analysis: 5,
    // Financial Intelligence (Pro - complex P&L analysis)
    financial_pl_summary: 12,
    financial_insights: 15,
    financial_client_profitability: 10,
    financial_trend_analysis: 8,
    // Scheduling - PER-SHIFT BILLING (Feb 2026 Update)
    schedule_optimization: 3,              // 3 credits per shift optimized
    strategic_schedule_optimization: 5,    // 5 credits per shift (profit-first premium)
    // Domain/General (Flash)
    log_analysis: 3,
    ai_general: 3,
    // Trinity Premium AI (Advanced reasoning tier)
    claude_analysis: 25, // Premium AI for complex document analysis
    claude_strategic: 30, // Premium AI for strategic insights
    claude_executive: 35, // Premium AI for executive-level analysis
    // Guard Tour & Operations
    guard_tour_scan: 1,        // Per checkpoint scan (GPS/QR/NFC verification)
    equipment_checkout: 1,     // Per equipment checkout
    equipment_return: 1,       // Per equipment return
    equipment_maintenance: 1,  // Per maintenance log entry
    post_order_creation: 1,    // Per post order created (overage)
    document_signing_send: 3,  // Per document sent for signature
    document_signing_verify: 1, // Per signature verification
    // Employee Intelligence - PER-SEAT BILLING (Feb 2026 Update)
    employee_behavior_scoring: 2,      // 2 credits per employee scored
    employee_performance_report: 2,    // 2 credits per employee report
    // Bot Ecosystem
    bot_interaction: 2,        // Per bot interaction (HelpAI, MeetingBot, etc.)
    // Push Notifications
    push_notification: 1,      // Per notification (overage beyond tier cap)
    // Advanced Analytics & Reporting
    advanced_analytics: 15,    // Per analytics report (Pro - complex analysis)
    incident_management: 2,    // Per incident report (overage)
    client_billing: 3,         // Per billing cycle (overage)
    // Core Features - Overage Credits (deducted after tier cap hit)
    basic_scheduling: 1,       // Per shift created (overage)
    basic_time_tracking: 1,    // Per clock-in/out (overage)
    employee_onboarding: 2,    // Per onboarding workflow (overage)
    shift_marketplace: 1,      // Per marketplace posting (overage)
    shift_swapping: 1,         // Per swap request (overage)
    helpdesk_support: 1,       // Per support ticket (overage)
    chatrooms: 1,              // Per chatroom created (overage)
    client_portal: 2,          // Per client portal access (overage)
    client_portal_helpai_session: 10, // Per client DockChat session (AI sentiment + summary)
    // Elite Features - Overage Credits
    security_compliance_vault: 3, // Per vault operation (overage)
    trinity_staffing: 5,       // Per staffing request (overage)
    multi_state_compliance: 2, // Per additional state (overage)
  },

  // ==========================================================================
  // BILLING SETTINGS
  // ==========================================================================
  settings: {
    trialWarningDays: 5, // Days before trial ends to show warning
    gracePeriodDays: 7, // Days after failed payment before suspension
    maxRetryAttempts: 3, // Payment retry attempts
    retryIntervalDays: 3, // Days between retry attempts
    invoiceDueDays: 30, // Days until invoice is due
    taxCalculation: "stripe_tax", // Use Stripe Tax for automatic calculation
    refundPolicy: "prorated", // Prorated refunds for downgrades
    upgradeBehavior: "immediate_prorate", // Immediate upgrade with proration
    downgradeBehavior: "end_of_period", // Downgrade at end of billing period
  },

  // ==========================================================================
  // EMAIL BILLING COSTS (for Resend integration)
  // ==========================================================================
  emailCosts: {
    transactional: 0.001, // $0.001 per email
    marketing: 0.002, // $0.002 per email
    bulk: 0.0008, // $0.0008 per email for bulk
    minimumCharge: 0.10, // Minimum charge per batch
  },

  // ==========================================================================
  // TRINITY ONE-TIME SETUP FEES (Business Ready-to-Work Configuration)
  // Trinity AI configures the entire platform for the business
  // ==========================================================================
  setupFees: {
    starter: {
      id: "setup_starter",
      name: "Trinity Starter Setup",
      price: 49900, // $499 one-time
      description: "Trinity configures basic scheduling, time tracking, and employee onboarding",
      includes: [
        "Organization setup & branding",
        "Employee roster import (up to 15)",
        "Basic schedule templates",
        "Time tracking configuration",
        "Mobile app setup for team",
        "1-hour training session",
      ],
      estimatedHours: 4,
    },
    professional: {
      id: "setup_professional",
      name: "Trinity Professional Setup",
      price: 149900, // $1,499 one-time
      description: "Full platform configuration with QuickBooks, payroll, and compliance",
      includes: [
        "Everything in Starter Setup",
        "QuickBooks integration & sync",
        "Payroll automation configuration",
        "Client billing setup",
        "Compliance rules for your state",
        "Custom schedule optimization",
        "Advanced reporting dashboards",
        "2-hour training session",
      ],
      estimatedHours: 12,
      popular: true,
    },
    enterprise: {
      id: "setup_enterprise",
      name: "Trinity Enterprise Setup",
      price: 0, // Custom pricing - contact sales
      isContactSales: true,
      startsAt: 999900, // Starts at $9,999/mo base + $15/employee
      description: "White-glove setup with custom integrations and dedicated support",
      includes: [
        "Everything in Professional Setup",
        "Multi-location configuration",
        "Custom integrations (ADP, Workday, etc.)",
        "Data migration from legacy systems",
        "White-label branding setup",
        "API configuration",
        "Dedicated onboarding specialist",
        "Team training sessions (up to 10 hours)",
        "30-day post-launch support",
      ],
      estimatedHours: 40,
    },
  },

  // ==========================================================================
  // CONTRACT PIPELINE - Premium Feature Quotas & Credits
  // Tier-based monthly quota with credit overage for extra contracts
  // ==========================================================================
  contractPipeline: {
    // Monthly contract quotas per tier (proposals + contracts count against quota)
    tierQuotas: {
      free: 0,           // No contract pipeline access
      starter: 10,       // 10 contracts/month included
      professional: 50,  // 50 contracts/month included
      business: 150,     // 150 contracts/month included
      enterprise: 250,   // 250 contracts/month included
      strategic: 500,    // 500 contracts/month included
    },
    // Credit cost per contract after quota exhausted
    overageCreditsPerContract: 25, // 25 credits = ~$0.25 per extra contract
    // Feature flags
    features: {
      templates: { free: false, starter: true, professional: true, business: true, enterprise: true, strategic: true },
      customTemplates: { free: false, starter: false, professional: true, business: true, enterprise: true, strategic: true },
      digitalSignatures: { free: false, starter: true, professional: true, business: true, enterprise: true, strategic: true },
      drawnSignatures: { free: false, starter: false, professional: true, business: true, enterprise: true, strategic: true },
      auditTrail: { free: false, starter: true, professional: true, business: true, enterprise: true, strategic: true },
      evidenceExport: { free: false, starter: false, professional: true, business: true, enterprise: true, strategic: true },
      amendments: { free: false, starter: true, professional: true, business: true, enterprise: true, strategic: true },
      attachments: { free: false, starter: true, professional: true, business: true, enterprise: true, strategic: true },
      trinityQueries: { free: false, starter: true, professional: true, business: true, enterprise: true, strategic: true },
      autoReminders: { free: false, starter: true, professional: true, business: true, enterprise: true, strategic: true },
    },
    // Document retention (days)
    retentionDays: {
      free: 0,
      starter: 365 * 3,     // 3 years
      professional: 365 * 7, // 7 years (default legal standard)
      business: 365 * 7,     // 7 years
      enterprise: 365 * 10,  // 10 years
      strategic: 365 * 15,   // 15 years
    },
    description: "Legal-grade contract management with digital signatures and audit trails",
  },

  // ==========================================================================
  // STRIPE ENVIRONMENT VARIABLE MAPPING
  // ==========================================================================
  stripeEnvVars: {
    starterMonthly: "STRIPE_STARTER_MONTHLY_PRICE_ID",
    starterYearly: "STRIPE_STARTER_YEARLY_PRICE_ID",
    professionalMonthly: "STRIPE_PROFESSIONAL_MONTHLY_PRICE_ID",
    professionalYearly: "STRIPE_PROFESSIONAL_YEARLY_PRICE_ID",
    enterpriseMonthly: "STRIPE_ENTERPRISE_MONTHLY_PRICE_ID",
    enterpriseYearly: "STRIPE_ENTERPRISE_YEARLY_PRICE_ID",
    enterpriseSeat: "STRIPE_ENTERPRISE_SEAT_PRICE_ID",
    starterOverage: "STRIPE_STARTER_OVERAGE_PRICE_ID",
    professionalOverage: "STRIPE_PROFESSIONAL_OVERAGE_PRICE_ID",
    employeeOverage: "STRIPE_EMPLOYEE_OVERAGE_PRICE_ID",
    employeeSeat: "STRIPE_EMPLOYEE_SEAT_PRICE_ID",
    managerSeat: "STRIPE_MANAGER_SEAT_PRICE_ID",
    addonCredits: "STRIPE_ADDON_CREDITS_PRICE_ID",
    addonClaudePremium: "STRIPE_ADDON_CLAUDE_PREMIUM_PRICE_ID",
    addonAiCfo: "STRIPE_ADDON_AI_CFO_PRICE_ID",
    addonLocation: "STRIPE_ADDON_LOCATION_PRICE_ID",
    addonFleet: "STRIPE_ADDON_FLEET_PRICE_ID",
    addonFleetOverage: "STRIPE_ADDON_FLEET_OVERAGE_PRICE_ID",
    middlewarePayroll: "STRIPE_MIDDLEWARE_PAYROLL_PRICE_ID",
    middlewareInvoice: "STRIPE_MIDDLEWARE_INVOICE_PRICE_ID",
    middlewareAch: "STRIPE_MIDDLEWARE_ACH_PRICE_ID",
    middlewarePayoutProduct: "STRIPE_MIDDLEWARE_PAYOUT_PRODUCT_ID",
    aiCreditOverage: "STRIPE_AI_CREDIT_OVERAGE_PRICE_ID",
    subOrg: "STRIPE_SUB_ORG_PRICE_ID",
    setupStarter: "STRIPE_SETUP_STARTER_PRICE_ID",
    setupProfessional: "STRIPE_SETUP_PROFESSIONAL_PRICE_ID",
    setupEnterprise: "STRIPE_SETUP_ENTERPRISE_PRICE_ID",
    webhookSecret: "STRIPE_WEBHOOK_SECRET",
  },

  // ==========================================================================
  // MIDDLEWARE FEES — CoAIleague as Financial Middleware
  // Platform charges these fees for processing payments/payroll through the system.
  // Designed to undercut QB, Gusto, Patriot, and Square on every line item.
  // ==========================================================================
  middlewareFees: {
    // INVOICE PAYMENT PROCESSING
    // Our cost: Stripe 2.9% + $0.30 per card / 0.8% max $5 ACH
    // We charge: 3.4% + $0.50 card / 1.2% max $8 ACH
    // Margin:    ~0.5% + $0.20 card / ~0.4% + $3 ACH
    invoiceProcessing: {
      ratePercent: 3.4,
      flatFeeCents: 50,
      description: "Invoice payment processing — card",
    },
    achPayments: {
      ratePercent: 1.2,
      capCents: 800,
      description: "Invoice payment processing — ACH bank transfer",
    },

    // PAYROLL PROCESSING
    // Our cost: Plaid ~$0.50–$1.00 per employee transfer
    // We charge: $3.50 starter / $2.95 professional / $2.50 business (post-discount)
    // Margin:    $2.50–$3.00 per employee per run
    payrollMiddleware: {
      baseMonthly: 0,
      perEmployeeCents: 350,
      description: "Payroll processing — per employee per run",
    },

    // DIRECT DEPOSIT / STRIPE CONNECT PAYOUTS
    // Our cost: Stripe Connect 0.25%
    // We charge: 0.50% — double, covers cost + margin
    stripePayouts: {
      ratePercent: 0.50,
      description: "Direct-to-bank payout processing",
    },

    // TAX FORM FEES
    // Our cost: ~$0 (we generate them internally)
    // We charge per form at year-end
    taxForms: {
      w2PerForm: 500,         // $5.00 per W-2 generated + delivered
      form1099PerForm: 300,   // $3.00 per 1099-NEC generated + delivered
      form941Quarterly: 0,    // Included in payroll processing fee
      description: "Year-end tax form generation and delivery",
    },

    // TIER DISCOUNTS — loyal customers pay less
    tierDiscounts: {
      free: 0,
      trial: 0,
      starter: 0,
      professional: 15,
      business: 20,
      enterprise: 25,
      strategic: 30,
    } as Record<string, number>,
  },

  competitorPricing: {
    quickbooks: {
      name: "QuickBooks Payments",
      invoiceRate: 2.9,
      invoiceFlatCents: 25,
      achRate: 1.0,
      achCapCents: 1000,
      payrollBase: 4500,
      payrollPerEmployee: 600,
      payrollProviderName: "QuickBooks Payroll",
    },
    gusto: {
      name: "Gusto",
      invoiceRate: null,
      invoiceFlatCents: null,
      achRate: null,
      achCapCents: null,
      payrollBase: 4000,
      payrollPerEmployee: 600,
      payrollProviderName: "Gusto Payroll",
    },
    patriot: {
      name: "Patriot Software",
      invoiceRate: null,
      invoiceFlatCents: null,
      achRate: null,
      achCapCents: null,
      payrollBase: 1700,
      payrollPerEmployee: 400,
      payrollProviderName: "Patriot Payroll",
    },
    square: {
      name: "Square Invoices",
      invoiceRate: 3.3,
      invoiceFlatCents: 30,
      achRate: 1.0,
      achCapCents: null,
      payrollBase: 3500,
      payrollPerEmployee: 600,
      payrollProviderName: "Square Payroll",
    },
  },
} as const;

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

export type TierKey = keyof typeof BILLING.tiers;
export type BillingCycle = "monthly" | "yearly";

export function getTierById(tierId: TierKey) {
  return BILLING.tiers[tierId];
}

export function formatPrice(amountInCents: number): string {
  return `${BILLING.platform.currencySymbol}${(amountInCents / 100).toLocaleString(BILLING.platform.locale, { 
    minimumFractionDigits: 0, 
    maximumFractionDigits: 0 
  })}`;
}

export function formatPriceWithDecimals(amountInCents: number): string {
  return `${BILLING.platform.currencySymbol}${(amountInCents / 100).toLocaleString(BILLING.platform.locale, { 
    minimumFractionDigits: 2, 
    maximumFractionDigits: 2 
  })}`;
}

export function getMonthlyEquivalent(yearlyPrice: number): number {
  return Math.round(yearlyPrice / 12);
}

export function getYearlySavings(tierId: TierKey): number {
  const tier = getTierById(tierId);
  if (!tier.monthlyPrice) return 0;
  const monthlyTotal = tier.monthlyPrice * 12;
  const yearlyPrice = tier.yearlyPrice || 0;
  return monthlyTotal - yearlyPrice;
}

export function getYearlySavingsPercent(tierId: TierKey): number {
  const tier = getTierById(tierId);
  if (!tier.monthlyPrice) return 0;
  const monthlyTotal = tier.monthlyPrice * 12;
  const savings = getYearlySavings(tierId);
  return Math.round((savings / monthlyTotal) * 100);
}

export function calculateOverageAmount(employeeCount: number, tierId: TierKey): number {
  const tier = getTierById(tierId);
  if (employeeCount <= tier.maxEmployees) return 0;
  const overage = Math.max(0, employeeCount - tier.maxEmployees);
  const overageRate = BILLING.overages[tierId as keyof typeof BILLING.overages] || 0;
  if (typeof overageRate === 'number') {
    return overage * overageRate;
  }
  return 0;
}

export function getCreditPackById(packId: string) {
  return Object.values(BILLING.creditPacks).find(pack => pack.id === packId);
}

export function getCreditCost(feature: keyof typeof BILLING.creditCosts): number {
  return BILLING.creditCosts[feature] || BILLING.creditCosts.ai_general;
}

export function getAllTiers() {
  return Object.values(BILLING.tiers);
}

export function getPaidTiers() {
  return Object.values(BILLING.tiers).filter(tier => tier.monthlyPrice > 0);
}

export function isEnterpriseUnlimited(tierId: TierKey): boolean {
  return false; // No tier is unlimited - all have caps with per-seat overages
}

export function getTrialDaysRemaining(trialStartDate: Date): number {
  const trialDays = BILLING.tiers.free.trialDays;
  const now = new Date();
  const trialEnd = new Date(trialStartDate);
  trialEnd.setDate(trialEnd.getDate() + trialDays);
  const remaining = Math.ceil((trialEnd.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
  return Math.max(0, remaining);
}

export function shouldShowTrialWarning(trialStartDate: Date): boolean {
  const remaining = getTrialDaysRemaining(trialStartDate);
  return remaining <= BILLING.settings.trialWarningDays && remaining > 0;
}

export type SetupFeeKey = keyof typeof BILLING.setupFees;

export function getSetupFeeById(setupId: SetupFeeKey) {
  return BILLING.setupFees[setupId];
}

export function getAllSetupFees() {
  return Object.values(BILLING.setupFees);
}

export function getRecommendedSetupFee(tierId: TierKey): SetupFeeKey {
  const tierToSetup: Record<TierKey, SetupFeeKey> = {
    free: "starter",
    starter: "starter",
    professional: "professional",
    business: "professional",
    enterprise: "enterprise",
    strategic: "enterprise",
  };
  return tierToSetup[tierId];
}

// ============================================================================
// CONTRACT PIPELINE HELPER FUNCTIONS
// ============================================================================

export function getContractPipelineQuota(tierId: TierKey): number {
  return BILLING.contractPipeline.tierQuotas[tierId] ?? 0;
}

export function hasContractPipelineAccess(tierId: TierKey): boolean {
  return getContractPipelineQuota(tierId) !== 0;
}

export function isContractPipelineUnlimited(tierId: TierKey): boolean {
  return false; // No tier has unlimited contracts - all have caps with credit overages
}

export function getContractPipelineOverageCredits(): number {
  return BILLING.contractPipeline.overageCreditsPerContract;
}

export function canUseContractFeature(
  tierId: TierKey, 
  feature: keyof typeof BILLING.contractPipeline.features
): boolean {
  return BILLING.contractPipeline.features[feature]?.[tierId] ?? false;
}

export function getContractRetentionDays(tierId: TierKey): number {
  return BILLING.contractPipeline.retentionDays[tierId] ?? 0;
}

// ============================================================================
// MIDDLEWARE FEE HELPER FUNCTIONS
// ============================================================================

export function getMiddlewareFees(tierId: TierKey) {
  const discount = BILLING.middlewareFees.tierDiscounts[tierId] ?? 0;
  const inv = BILLING.middlewareFees.invoiceProcessing;
  const ach = BILLING.middlewareFees.achPayments;
  const payroll = BILLING.middlewareFees.payrollMiddleware;
  const payout = BILLING.middlewareFees.stripePayouts;
  const taxForms = BILLING.middlewareFees.taxForms;

  return {
    invoiceProcessing: {
      ratePercent: +(inv.ratePercent * (1 - discount / 100)).toFixed(2),
      flatFeeCents: inv.flatFeeCents,
      description: inv.description,
    },
    achPayments: {
      ratePercent: +(ach.ratePercent * (1 - discount / 100)).toFixed(2),
      capCents: ach.capCents,
      description: ach.description,
    },
    payrollMiddleware: {
      baseMonthly: payroll.baseMonthly,
      perEmployeeCents: Math.round(payroll.perEmployeeCents * (1 - discount / 100)),
      description: payroll.description,
    },
    stripePayouts: {
      ratePercent: +(payout.ratePercent * (1 - discount / 100)).toFixed(2),
      description: payout.description,
    },
    taxForms: {
      w2PerForm: Math.round(taxForms.w2PerForm * (1 - discount / 100)),
      form1099PerForm: Math.round(taxForms.form1099PerForm * (1 - discount / 100)),
      form941Quarterly: taxForms.form941Quarterly,
      description: taxForms.description,
    },
    tierDiscount: discount,
  };
}

export function getCompetitorPricing() {
  return BILLING.competitorPricing;
}

// ============================================================================
// TOKEN ALLOWANCES — MONTHLY TOKEN ALLOWANCE PER SUBSCRIPTION TIER
// This is the single source of truth for token limits per tier.
// These are NOT credit purchases — tokens are metered and overages are billed
// at the end of the billing month at $2.00 per 100,000 tokens over limit.
// Statewide (grandfathered tenant): unlimited — tracked but NEVER billed for overage.
// Strategic: unlimited — tracked, reviewed monthly by Bryan.
// IMPORTANT: These values MUST match AI_TIER_LIMITS.monthlyTokenBudgetK * 1000
// so that NDS threshold alerts fire at the same thresholds as the billing system.
// ============================================================================
export const TOKEN_ALLOWANCES: Record<string, number | null> = {
  free_trial:   5_000_000,      // Free trial: 5M tokens/month  (hard cap enforced)
  free:         5_000_000,      // Free tier: 5M tokens/month  (hard cap enforced)
  trial:        5_000_000,      // Trial alias
  starter:      40_000_000,     // Starter: 40M tokens/month   (soft cap, overage billed)
  professional: 100_000_000,    // Professional: 100M tokens/month
  business:     250_000_000,    // Business: 250M tokens/month
  enterprise:   800_000_000,    // Enterprise: 800M tokens/month
  strategic:    null,           // Unlimited — tracked, reviewed monthly
  grandfathered: null,          // Unlimited — tracked, NEVER billed (founder exempt)
};

export const TOKEN_OVERAGE_RATE_CENTS_PER_100K = 200; // $2.00 per 100,000 tokens over allowance

export const TOKEN_ALERT_THRESHOLDS = {
  warningPercent:  80,   // NDS warning to org owner at 80% of allowance
  hardLimitPercent: 100, // Overage tracking begins — NEVER block execution
  adminFlagPercent: 200, // Flag for admin review at 200% — still do NOT block
};

// ============================================================================
// AI MODEL COST BASIS — WHAT WE PAY PROVIDERS
// All values in microcents (1 microcent = $0.000001) for precision on small token costs.
// Update these when provider pricing changes.
// ============================================================================
export const AI_MODEL_COSTS = {

  // ============================================================
  // GEMINI — Primary Cortex
  // Real April 2026 pricing from ai.google.dev
  // Gemini 2.0 Flash deprecated June 1 2026 — do not use
  // ============================================================

  'gemini-2.5-flash-lite': {
    role: 'primary_cortex_lite' as const,
    description: 'Simple lookups reads FAQ answers — cheapest model',
    inputPer1kTokensMicrocents: 100,   // $0.10 per 1M input tokens
    outputPer1kTokensMicrocents: 400,  // $0.40 per 1M output tokens
    avgOutputInputRatio: 0.3,
    useFor: [
      'simple_lookup', 'faq_answer', 'schedule_check',
      'who_is_on_shift', 'status_check', 'read_only_query',
    ],
  },

  'gemini-2.5-flash': {
    role: 'primary_cortex' as const,
    description: 'Standard reasoning — primary model for most tasks',
    inputPer1kTokensMicrocents: 300,   // $0.30 per 1M input tokens
    outputPer1kTokensMicrocents: 2500, // $2.50 per 1M output tokens
    avgOutputInputRatio: 0.3,
    useFor: [
      'schedule_generation', 'compliance_scan', 'cascade_management',
      'trinity_chat', 'proactive_insight', 'calloff_processing',
      'lead_scoring', 'onboarding_task', 'email_classification',
    ],
  },

  'gemini-2.5-pro': {
    role: 'primary_cortex_deep' as const,
    description: 'Complex multi-step reasoning — use sparingly',
    inputPer1kTokensMicrocents: 1250,  // $1.25 per 1M input tokens
    outputPer1kTokensMicrocents: 10000, // $10.00 per 1M output tokens
    avgOutputInputRatio: 0.3,
    useFor: [
      'payroll_dispute', 'complex_financial_analysis',
      'multi_site_optimization', 'strategic_scheduling',
      'complex_compliance_analysis',
    ],
  },

  // ============================================================
  // CLAUDE — Consciousness and Judge
  // Real April 2026 pricing from docs.anthropic.com
  // Claude Haiku 4.5 for fast validation
  // Claude Sonnet 4.6 for deep validation only
  // Skip Claude entirely for read-only queries
  // ============================================================

  'claude-haiku-4-5': {
    role: 'consciousness_judge_fast' as const,
    description: 'Fast validation — fact check tone hallucination detection',
    inputPer1kTokensMicrocents: 1000,  // $1.00 per 1M input tokens
    outputPer1kTokensMicrocents: 5000, // $5.00 per 1M output tokens
    avgOutputInputRatio: 0.25,
    useFor: [
      'claude_validation_standard', 'tone_check',
      'numeric_verification', 'hallucination_detection',
      'policy_boundary_check',
    ],
    skipFor: [
      'simple_lookup', 'faq_answer', 'read_only_query',
      'schedule_check', 'status_check',
    ],
  },

  'claude-sonnet-4-6': {
    role: 'consciousness_judge_deep' as const,
    description: 'Deep validation — financial ethical complex reasoning only',
    inputPer1kTokensMicrocents: 3000,  // $3.00 per 1M input tokens
    outputPer1kTokensMicrocents: 15000, // $15.00 per 1M output tokens
    avgOutputInputRatio: 0.25,
    useFor: [
      'claude_validation_financial', 'ethical_boundary_check',
      'payroll_validation', 'legal_document_review',
      'compliance_certification',
    ],
  },

  // ============================================================
  // GPT — Backbone Workhorse
  // Real April 2026 pricing from openai.com/api/pricing
  // GPT-4o-mini for most document generation
  // GPT-4o for complex documents only
  // ============================================================

  'gpt-4o-mini': {
    role: 'backbone_workhorse_fast' as const,
    description: 'Fast document generation structured extraction',
    inputPer1kTokensMicrocents: 150,   // $0.15 per 1M input tokens
    outputPer1kTokensMicrocents: 600,  // $0.60 per 1M output tokens
    avgOutputInputRatio: 0.4,
    useFor: [
      'pay_stub_generation', 'email_drafting', 'form_processing',
      'structured_extraction', 'dar_summary', 'simple_report',
      'notification_drafting', 'batch_processing',
    ],
  },

  'gpt-4o': {
    role: 'backbone_workhorse' as const,
    description: 'High quality document generation for important documents',
    inputPer1kTokensMicrocents: 2500,  // $2.50 per 1M input tokens
    outputPer1kTokensMicrocents: 10000, // $10.00 per 1M output tokens
    avgOutputInputRatio: 0.5,
    useFor: [
      'proposal_generation', 'compliance_report',
      'legal_document', 'complex_form_processing',
      'detailed_contract', 'client_facing_document',
    ],
  },

} as const;

// ============================================================================
// AI USAGE TOKEN BUDGETS PER SUBSCRIPTION TIER
// Soft cap = warn + bill overage. Hard cap = block (free trial only).
// All token values in thousands (K). Updated April 2026 with real AI pricing.
// ============================================================================
export const AI_TIER_LIMITS = {
  free_trial: {
    monthlyTokenBudgetK: 5000,         // 5M tokens
    softCapK: 4000,                    // warn at 4M
    hardCapK: 5000 as null | number,   // hard block at 5M — upgrade required
    overagePer100kTokensCents: null as null,
  },
  free: {
    monthlyTokenBudgetK: 5000,
    softCapK: 4000,
    hardCapK: 5000 as null | number,
    overagePer100kTokensCents: null as null,
  },
  starter: {
    monthlyTokenBudgetK: 40000,        // 40M tokens
    softCapK: 32000,                   // warn at 32M (80%)
    hardCapK: null as null,            // no hard cap — bill overage
    overagePer100kTokensCents: 80,     // $0.80/100k = 85% margin
  },
  professional: {
    monthlyTokenBudgetK: 100000,       // 100M tokens
    softCapK: 80000,                   // warn at 80M (80%)
    hardCapK: null as null,
    overagePer100kTokensCents: 70,     // $0.70/100k = 82.9% margin
  },
  business: {
    monthlyTokenBudgetK: 250000,       // 250M tokens
    softCapK: 200000,                  // warn at 200M (80%)
    hardCapK: null as null,
    overagePer100kTokensCents: 60,     // $0.60/100k = 80% margin
  },
  enterprise: {
    monthlyTokenBudgetK: 800000,       // 800M tokens
    softCapK: 640000,                  // warn at 640M (80%)
    hardCapK: null as null,
    overagePer100kTokensCents: 50,     // $0.50/100k = 76% margin
  },
  strategic: {
    monthlyTokenBudgetK: null as null, // custom per contract
    softCapK: null as null,
    hardCapK: null as null,
    overagePer100kTokensCents: 40,     // $0.40/100k = 70% margin
  },
} as const;

// ============================================================================
// COST REDUCTION STRATEGIES — applied automatically by wrappers
// ============================================================================
export const AI_COST_OPTIMIZATIONS = {
  // Prompt caching: Trinity system prompt + workspace context
  // ~5,000 tokens cached per call
  // 85%+ cache hit rate after warmup
  // Cache hit = 10% of base input price
  // Effective input cost reduction: ~35-45%
  promptCachingEnabled: true,
  estimatedCacheHitRate: 0.85,
  cacheSavingsMultiplier: 0.10, // cache hit costs 10% of base

  // Batch API: 50% off for non-real-time processing
  // Nightly bots, compliance scans, report generation
  // ~40% of all Trinity token usage qualifies
  batchApiEnabled: true,
  batchApiDiscount: 0.50,
  estimatedBatchEligiblePct: 0.40,

  // Smart model routing:
  // 20% of calls → Flash-Lite (simple lookups)
  // 50% of calls → Flash (standard reasoning)
  // 10% of calls → Pro (complex reasoning)
  // 15% of validations → Haiku (fast validation)
  // 5% of validations → Sonnet (deep validation)
  // 40% of calls → skip Claude entirely (read-only)
  // 8% of calls → GPT-4o-mini (most documents)
  // 2% of calls → GPT-4o (important documents)

  // Real blended cost after all optimizations:
  realBlendedCostPer100kTokensCents: 12, // $0.12 per 100k tokens
  conservativeEstimatePer100kCents: 15,  // $0.15 per 100k (safety buffer)
} as const;

// ============================================================================
// REAL COST BASELINES PER WORKSPACE PER MONTH
// Used for internal margin calculation only — never exposed to tenants
// ============================================================================
export const AI_REAL_COSTS = {
  officerSeatMonthlyCents: 18,           // $0.18/officer/month
  supervisorSeatMonthlyCents: 60,        // $0.60/supervisor/month
  orgOwnerSeatMonthlyCents: 180,         // $1.80/org owner/month
  backgroundBotsStarterCents: 1710,      // $17.10/month fixed for Starter workspace
  backgroundBotsProfessionalCents: 1400, // $14.00/month for Professional
  backgroundBotsBusinessCents: 1800,     // $18.00/month for Business
  backgroundBotsEnterpriseCents: 3000,   // $30.00/month for Enterprise
} as const;

// ============================================================================
// SEAT OVERAGE COST DEFENSE — $25/seat always profitable
// ============================================================================
export const SEAT_OVERAGE_COST_ANALYSIS = {
  supervisorSeatAiCostCents: 1200,
  infrastructureCostPerSeatCents: 58,
  twilioSmsAbsorbedCents: 30,
  totalWorstCaseCostCents: 1288,
  revenuePerOverageSeatCents: 2500,
  worstCaseMarginPercent: 48.5,
  officerSeatAiCostCents: 82,
  officerTotalCostCents: 170,
  officerMarginPercent: 93.2,
  blendedMarginPercent: 78,
} as const;

export type AiModelKey = keyof typeof AI_MODEL_COSTS;

// ============================================================================
// PLATFORM_TIERS — canonical tier constants for new billing system
// Single source of truth for token budgets, seat limits, and pricing
// Imported by aiMeteringService, aiCallWrapper, and billing routes
// ============================================================================
export const PLATFORM_TIERS = {
  free_trial: {
    name: 'Free Trial',
    displayName: 'Free Trial',
    stripePriceId: process.env.STRIPE_PRICE_FREE_TRIAL ?? '',
    monthlyPriceCents: 0,
    annualPriceCents: 0,
    trialDays: 14,
    seatsIncluded: 5,
    managersIncluded: 1,
    seatOverageCents: 0,
    trinityTokenBudgetK: 5000,
    trinityTokenSoftCapK: 4000,
    trinityTokenHardCapK: 5000,
    trinityTokenOveragePer100kCents: 0,
    features: ['basic_scheduling', 'basic_trinity'],
    isPublic: true,
    isTrialOnly: true,
  },
  starter: {
    name: 'Starter',
    displayName: 'Starter',
    stripePriceMonthlyId: process.env.STRIPE_PRICE_STARTER_MONTHLY ?? '',
    stripePriceAnnualId: process.env.STRIPE_PRICE_STARTER_ANNUAL ?? '',
    stripeSeatOveragePriceId: process.env.STRIPE_PRICE_STARTER_SEAT_OVERAGE ?? '',
    stripeTokenOveragePriceId: process.env.STRIPE_PRICE_STARTER_TOKEN_OVERAGE ?? '',
    monthlyPriceCents: 29900,
    annualPriceCents: 287040,
    annualMonthlyEquivalentCents: 23920,
    annualDiscountPercent: 20,
    seatsIncluded: 10,
    managersIncluded: 2,
    seatOverageCents: 2500,
    trinityTokenBudgetK: 40000,
    trinityTokenSoftCapK: 32000,
    trinityTokenHardCapK: null as number | null,
    trinityTokenOveragePer100kCents: 80,
    perInvoiceProcessedCents: 350,
    perPayrollEmployeeCents: 600,
    quickbooksSyncCents: 0,
    perDirectDepositCents: 25,
    perACHCents: 50,
    cardRateBasisPoints: 240,
    cardFlatCents: 25,
    features: [
      'scheduling', 'payroll', 'invoicing', 'compliance_basic',
      'trinity_chat', 'helpai', 'mobile_app', 'onboarding_forms',
      'document_generation_basic', 'nds_notifications',
      'time_attendance', 'client_management_basic',
    ],
    isPublic: true,
  },
  professional: {
    name: 'Professional',
    displayName: 'Professional',
    stripePriceMonthlyId: process.env.STRIPE_PRICE_PROFESSIONAL_MONTHLY ?? '',
    stripePriceAnnualId: process.env.STRIPE_PRICE_PROFESSIONAL_ANNUAL ?? '',
    stripeSeatOveragePriceId: process.env.STRIPE_PRICE_PROFESSIONAL_SEAT_OVERAGE ?? '',
    stripeTokenOveragePriceId: process.env.STRIPE_PRICE_PROFESSIONAL_TOKEN_OVERAGE ?? '',
    monthlyPriceCents: 99900,
    annualPriceCents: 959040,
    annualMonthlyEquivalentCents: 79920,
    annualDiscountPercent: 20,
    seatsIncluded: 100,
    managersIncluded: 5,
    seatOverageCents: 2500,
    trinityTokenBudgetK: 100000,
    trinityTokenSoftCapK: 80000,
    trinityTokenHardCapK: null as number | null,
    trinityTokenOveragePer100kCents: 70,
    perInvoiceProcessedCents: 250,
    perPayrollEmployeeCents: 450,
    quickbooksSyncCents: 150,
    perDirectDepositCents: 20,
    perACHCents: 40,
    cardRateBasisPoints: 220,
    cardFlatCents: 20,
    features: [
      'scheduling', 'payroll', 'invoicing', 'compliance_full',
      'trinity_chat', 'trinity_autonomous', 'helpai', 'mobile_app',
      'onboarding_forms', 'document_generation_full',
      'nds_notifications', 'time_attendance',
      'client_management_full', 'analytics_bi',
      'quickbooks_sync', 'sales_pipeline', 'custom_forms',
      'training_certification', 'multi_client',
    ],
    isPublic: true,
  },
  business: {
    name: 'Business',
    displayName: 'Business',
    stripePriceMonthlyId: process.env.STRIPE_PRICE_BUSINESS_MONTHLY ?? '',
    stripePriceAnnualId: process.env.STRIPE_PRICE_BUSINESS_ANNUAL ?? '',
    stripeSeatOveragePriceId: process.env.STRIPE_PRICE_BUSINESS_SEAT_OVERAGE ?? '',
    stripeTokenOveragePriceId: process.env.STRIPE_PRICE_BUSINESS_TOKEN_OVERAGE ?? '',
    monthlyPriceCents: 299900,
    annualPriceCents: 2879040,
    annualMonthlyEquivalentCents: 239920,
    annualDiscountPercent: 20,
    seatsIncluded: 300,
    managersIncluded: 15,
    seatOverageCents: 2500,
    trinityTokenBudgetK: 250000,
    trinityTokenSoftCapK: 200000,
    trinityTokenHardCapK: null as number | null,
    trinityTokenOveragePer100kCents: 60,
    perInvoiceProcessedCents: 175,
    perPayrollEmployeeCents: 350,
    quickbooksSyncCents: 100,
    perDirectDepositCents: 15,
    perACHCents: 30,
    cardRateBasisPoints: 200,
    cardFlatCents: 15,
    features: [
      'all_professional_features', 'multi_location',
      'vendor_management', 'workflow_automation_builder',
      'bulk_import', 'advanced_export', 'sla_tracking',
      'sub_organizations_2', 'custom_api_webhooks',
    ],
    isPublic: true,
  },
  enterprise: {
    name: 'Enterprise',
    displayName: 'Enterprise',
    stripePriceMonthlyId: process.env.STRIPE_PRICE_ENTERPRISE_MONTHLY ?? '',
    stripePriceAnnualId: process.env.STRIPE_PRICE_ENTERPRISE_ANNUAL ?? '',
    stripeSeatOveragePriceId: process.env.STRIPE_PRICE_ENTERPRISE_SEAT_OVERAGE ?? '',
    stripeTokenOveragePriceId: process.env.STRIPE_PRICE_ENTERPRISE_TOKEN_OVERAGE ?? '',
    monthlyPriceCents: 799900,
    annualPriceCents: 7679040,
    annualMonthlyEquivalentCents: 639920,
    annualDiscountPercent: 20,
    seatsIncluded: 1000,
    managersIncluded: 100,
    seatOverageCents: 2500,
    trinityTokenBudgetK: 800000,
    trinityTokenSoftCapK: 640000,
    trinityTokenHardCapK: null as number | null,
    trinityTokenOveragePer100kCents: 50,
    perInvoiceProcessedCents: 100,
    perPayrollEmployeeCents: 250,
    quickbooksSyncCents: 0,
    perDirectDepositCents: 10,
    perACHCents: 20,
    cardRateBasisPoints: 190,
    cardFlatCents: 10,
    features: [
      'all_business_features', 'multi_state_compliance',
      'sra_regulatory_audit', 'sso', 'custom_trinity_configuration',
      'emergency_event_management', 'sub_organizations_unlimited',
      'dedicated_support', 'uptime_sla_999', 'platform_api_full',
    ],
    isPublic: true,
  },
  strategic: {
    name: 'Strategic',
    displayName: 'Strategic',
    monthlyPriceCents: null as number | null,
    minimumMonthlyCents: 1500000,
    seatsIncluded: 1000,
    seatOverageCents: 2500,
    trinityTokenBudgetK: null as number | null,
    trinityTokenSoftCapK: null as number | null,
    trinityTokenHardCapK: null as number | null,
    trinityTokenOveragePer100kCents: 40,
    requiresSalesCall: true,
    isPublic: false,
  },
} as const;

export const VOICE_PLATINUM_TIERS = {
  platinum_starter: {
    name: 'Platinum Starter',
    displayName: 'Trinity Voice Platinum Starter',
    stripePriceMonthlyId: process.env.STRIPE_PRICE_VOICE_PLATINUM_STARTER ?? '',
    monthlyPriceCents: 9900,
    includedMinutes: 500,
    includedSmsMessages: 2000,
    includedTollFreeNumbers: 1,
    includedRecordingMinutes: 0,
    voiceOveragePerMinuteCents: 7,
    smsOveragePerMessageCents: 3,
    recordingOveragePerMinuteCents: 5,
    softCapMinutes: 800,
    softCapSmsMessages: 1800,
  },
  platinum_professional: {
    name: 'Platinum Professional',
    displayName: 'Trinity Voice Platinum Professional',
    stripePriceMonthlyId: process.env.STRIPE_PRICE_VOICE_PLATINUM_PROFESSIONAL ?? '',
    monthlyPriceCents: 29900,
    includedMinutes: 2000,
    includedSmsMessages: 8000,
    includedTollFreeNumbers: 1,
    includedRecordingMinutes: 60,
    voiceOveragePerMinuteCents: 6,
    smsOveragePerMessageCents: 3,
    recordingOveragePerMinuteCents: 5,
    softCapMinutes: 3000,
    softCapSmsMessages: 7000,
  },
  platinum_business: {
    name: 'Platinum Business',
    displayName: 'Trinity Voice Platinum Business',
    stripePriceMonthlyId: process.env.STRIPE_PRICE_VOICE_PLATINUM_BUSINESS ?? '',
    monthlyPriceCents: 79900,
    includedMinutes: 7500,
    includedSmsMessages: 20000,
    includedTollFreeNumbers: 2,
    includedRecordingMinutes: 200,
    voiceOveragePerMinuteCents: 5,
    smsOveragePerMessageCents: 3,
    recordingOveragePerMinuteCents: 4,
    softCapMinutes: 10000,
    softCapSmsMessages: 18000,
  },
  platinum_enterprise: {
    name: 'Platinum Enterprise',
    displayName: 'Trinity Voice Platinum Enterprise',
    stripePriceMonthlyId: process.env.STRIPE_PRICE_VOICE_PLATINUM_ENTERPRISE ?? '',
    monthlyPriceCents: 199900,
    includedMinutes: 25000,
    includedSmsMessages: 40000,
    includedTollFreeNumbers: 3,
    includedRecordingMinutes: 500,
    voiceOveragePerMinuteCents: 5,
    smsOveragePerMessageCents: 2,
    recordingOveragePerMinuteCents: 3,
    softCapMinutes: 35000,
    softCapSmsMessages: 38000,
  },
} as const;

export const TWILIO_COST_BASIS = {
  inboundVoicePerMinuteCents: 0.85,
  outboundVoicePerMinuteCents: 1.30,
  speechRecognitionPerMinuteCents: 0.60,
  ttsElevenLabsPerMinuteCents: 0.20,
  totalVoicePerMinuteCents: 2.20,
  smsOutboundCents: 0.79,
  tollFreeSurchargeCents: 0.25,
  totalSmsPerMessageCents: 1.04,
  tollFreeNumberMonthlyRentCents: 200,
} as const;

export const EMAIL_PRICING = {
  perSeatMonthlyCents: 300,
  fairUseEmailsPerSeatMonthly: 500,
  overagePerEmailCents: 0.1,
  resendMonthlyCostCents: 2000,
  resendBusinessCostCents: 9000,
  resendEmailsIncludedPro: 50000,
} as const;

export type PlatformTierKey = keyof typeof PLATFORM_TIERS;
export type VoicePlatinumTierKey = keyof typeof VOICE_PLATINUM_TIERS;
export type AiTierLimitKey = keyof typeof AI_TIER_LIMITS;
