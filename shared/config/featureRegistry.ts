/**
 * TRINITY FEATURE REGISTRY
 * =========================
 * Single source of truth for ALL platform features, their states, and metadata.
 * Trinity uses this registry to:
 * - Validate notification content references real, active features
 * - Detect stale references to deprecated/removed features
 * - Resolve synonyms and old feature names
 * - Enforce structured messaging (Problem→Issue→Solution→Outcome)
 * - Block vague language before reaching UniversalNotificationEngine
 * 
 * NO STALE DATA - Features must be updated here when changed.
 * NO VAGUE LANGUAGE - All notifications must reference concrete features.
 */

// ============================================================================
// FEATURE LIFECYCLE STATES
// ============================================================================
export type FeatureLifecycleState = 
  | "active"           // Currently available and supported
  | "beta"             // In testing, available to select users
  | "deprecated"       // Still works but being phased out
  | "removed"          // No longer available
  | "planned";         // Coming soon, not yet available

// ============================================================================
// FEATURE CATEGORIES
// ============================================================================
export type FeatureCategory =
  | "scheduling"
  | "time_tracking"
  | "payroll"
  | "billing"
  | "compliance"
  | "ai_automation"
  | "integrations"
  | "communication"
  | "reporting"
  | "security"
  | "onboarding"
  | "contracts"
  | "workforce";

// ============================================================================
// TIER AVAILABILITY
// ============================================================================
export type TierAvailability = "free" | "trial" | "starter" | "professional" | "business" | "enterprise" | "strategic" | "all";

// ============================================================================
// FEATURE DEFINITION
// ============================================================================
export interface PlatformFeature {
  id: string;
  name: string;
  description: string;
  category: FeatureCategory;
  state: FeatureLifecycleState;
  availableTiers: TierAvailability[];
  version: string;
  addedDate: string;
  lastUpdated: string;
  deprecatedDate?: string;
  removedDate?: string;
  synonyms: string[];
  relatedFeatures: string[];
  requiredRoles: string[];
  changelog: FeatureChangelogEntry[];
}

export interface FeatureChangelogEntry {
  date: string;
  version: string;
  type: "added" | "updated" | "deprecated" | "removed" | "fixed";
  description: string;
}

// ============================================================================
// MASTER FEATURE REGISTRY
// ============================================================================
export const FEATURE_REGISTRY: Record<string, PlatformFeature> = {
  // =========================================================================
  // SCHEDULING FEATURES
  // =========================================================================
  "shift_scheduling": {
    id: "shift_scheduling",
    name: "Shift Scheduling",
    description: "Create, edit, and manage employee work shifts with drag-and-drop calendar interface",
    category: "scheduling",
    state: "active",
    availableTiers: ["all"],
    version: "2.0.0",
    addedDate: "2024-01-01",
    lastUpdated: "2026-01-15",
    synonyms: ["scheduling", "shifts", "work schedule", "roster", "shift management"],
    relatedFeatures: ["shift_swapping", "recurring_shifts", "ai_scheduling"],
    requiredRoles: ["manager", "org_owner", "admin"],
    changelog: [
      { date: "2026-01-15", version: "2.0.0", type: "updated", description: "Enhanced mobile responsiveness" },
      { date: "2025-06-01", version: "1.5.0", type: "added", description: "Drag-and-drop interface" },
    ],
  },
  
  "ai_scheduling": {
    id: "ai_scheduling",
    name: "Trinity AI Scheduling",
    description: "AI-powered automatic shift optimization for coverage, cost, and employee preferences",
    category: "ai_automation",
    state: "active",
    availableTiers: ["starter", "professional", "enterprise"],
    version: "2.0.0",
    addedDate: "2024-06-01",
    lastUpdated: "2026-01-17",
    synonyms: ["auto scheduling", "smart scheduling", "ai shifts", "automatic scheduling", "trinity scheduling"],
    relatedFeatures: ["shift_scheduling", "profit_optimization", "coverage_analysis"],
    requiredRoles: ["manager", "org_owner"],
    changelog: [
      { date: "2026-01-17", version: "2.0.0", type: "updated", description: "Profit-first optimization algorithm" },
      { date: "2025-09-01", version: "1.8.0", type: "added", description: "Employee preference learning" },
    ],
  },

  "shift_swapping": {
    id: "shift_swapping",
    name: "Shift Swapping",
    description: "Allow employees to request and approve shift swaps with manager oversight",
    category: "scheduling",
    state: "active",
    availableTiers: ["starter", "professional", "enterprise"],
    version: "1.5.0",
    addedDate: "2024-03-01",
    lastUpdated: "2025-11-01",
    synonyms: ["swap shifts", "trade shifts", "shift exchange", "shift trading"],
    relatedFeatures: ["shift_scheduling", "notifications"],
    requiredRoles: ["employee", "manager", "org_owner"],
    changelog: [
      { date: "2025-11-01", version: "1.5.0", type: "updated", description: "Mobile-first swap requests" },
    ],
  },

  "recurring_shifts": {
    id: "recurring_shifts",
    name: "Recurring Shifts",
    description: "Create repeating shift patterns on daily, weekly, or custom schedules",
    category: "scheduling",
    state: "active",
    availableTiers: ["starter", "professional", "enterprise"],
    version: "1.3.0",
    addedDate: "2024-04-01",
    lastUpdated: "2025-08-01",
    synonyms: ["repeat shifts", "shift templates", "schedule patterns", "weekly schedule"],
    relatedFeatures: ["shift_scheduling"],
    requiredRoles: ["manager", "org_owner"],
    changelog: [],
  },

  // =========================================================================
  // TIME TRACKING FEATURES
  // =========================================================================
  "time_tracking": {
    id: "time_tracking",
    name: "Time Tracking",
    description: "Clock in/out functionality with timesheet generation and hour calculations",
    category: "time_tracking",
    state: "active",
    availableTiers: ["all"],
    version: "2.0.0",
    addedDate: "2024-01-01",
    lastUpdated: "2026-01-10",
    synonyms: ["clock in", "clock out", "timesheets", "hours tracking", "punch clock"],
    relatedFeatures: ["gps_tracking", "overtime_tracking", "break_tracking"],
    requiredRoles: ["employee", "manager", "org_owner"],
    changelog: [
      { date: "2026-01-10", version: "2.0.0", type: "updated", description: "Real-time sync improvements" },
    ],
  },

  "gps_tracking": {
    id: "gps_tracking",
    name: "GPS Time Tracking",
    description: "Location-verified clock in/out with geofencing for site compliance",
    category: "time_tracking",
    state: "active",
    availableTiers: ["starter", "professional", "enterprise"],
    version: "1.8.0",
    addedDate: "2024-02-01",
    lastUpdated: "2026-01-12",
    synonyms: ["geofencing", "location tracking", "gps clock", "site verification", "geolocation"],
    relatedFeatures: ["time_tracking", "compliance_alerts"],
    requiredRoles: ["employee", "manager", "org_owner"],
    changelog: [
      { date: "2026-01-12", version: "1.8.0", type: "updated", description: "Improved accuracy and battery optimization" },
    ],
  },

  "overtime_tracking": {
    id: "overtime_tracking",
    name: "Overtime Tracking",
    description: "Automatic overtime calculation based on daily and weekly thresholds",
    category: "time_tracking",
    state: "active",
    availableTiers: ["starter", "professional", "enterprise"],
    version: "1.5.0",
    addedDate: "2024-03-01",
    lastUpdated: "2025-10-01",
    synonyms: ["OT tracking", "overtime hours", "overtime alerts"],
    relatedFeatures: ["time_tracking", "payroll_processing"],
    requiredRoles: ["manager", "org_owner"],
    changelog: [],
  },

  // =========================================================================
  // PAYROLL FEATURES
  // =========================================================================
  "payroll_processing": {
    id: "payroll_processing",
    name: "Payroll Processing",
    description: "Automated payroll calculations with tax deductions and direct deposit",
    category: "payroll",
    state: "active",
    availableTiers: ["professional", "enterprise"],
    version: "2.0.0",
    addedDate: "2024-06-01",
    lastUpdated: "2026-01-14",
    synonyms: ["payroll", "pay processing", "salary processing", "wage calculation"],
    relatedFeatures: ["quickbooks_integration", "time_tracking", "tax_calculations"],
    requiredRoles: ["org_owner", "admin"],
    changelog: [
      { date: "2026-01-14", version: "2.0.0", type: "updated", description: "QuickBooks 99% automation" },
    ],
  },

  "quickbooks_integration": {
    id: "quickbooks_integration",
    name: "QuickBooks Integration",
    description: "Bidirectional sync with QuickBooks for accounting and payroll",
    category: "integrations",
    state: "active",
    availableTiers: ["professional", "enterprise"],
    version: "2.0.0",
    addedDate: "2024-07-01",
    lastUpdated: "2026-01-16",
    synonyms: ["qb integration", "quickbooks sync", "accounting integration"],
    relatedFeatures: ["payroll_processing", "client_billing"],
    requiredRoles: ["org_owner", "admin"],
    changelog: [
      { date: "2026-01-16", version: "2.0.0", type: "updated", description: "99% automation with reconciliation" },
    ],
  },

  // =========================================================================
  // BILLING FEATURES
  // =========================================================================
  "client_billing": {
    id: "client_billing",
    name: "Client Billing",
    description: "Invoice generation from tracked hours with PDF export and email delivery",
    category: "billing",
    state: "active",
    availableTiers: ["professional", "enterprise"],
    version: "1.8.0",
    addedDate: "2024-05-01",
    lastUpdated: "2025-12-01",
    synonyms: ["invoicing", "billing", "invoice management", "client invoices"],
    relatedFeatures: ["stripe_payments", "time_tracking"],
    requiredRoles: ["org_owner", "manager"],
    changelog: [],
  },

  "stripe_payments": {
    id: "stripe_payments",
    name: "Stripe Payment Processing",
    description: "Real-time payment processing with Stripe for subscriptions and invoices",
    category: "billing",
    state: "active",
    availableTiers: ["all"],
    version: "2.0.0",
    addedDate: "2024-01-01",
    lastUpdated: "2026-01-15",
    synonyms: ["payments", "payment processing", "credit card", "subscription billing"],
    relatedFeatures: ["client_billing", "subscription_management"],
    requiredRoles: ["org_owner", "admin"],
    changelog: [
      { date: "2026-01-15", version: "2.0.0", type: "updated", description: "Enhanced webhook processing" },
    ],
  },

  // =========================================================================
  // COMPLIANCE FEATURES
  // =========================================================================
  "compliance_alerts": {
    id: "compliance_alerts",
    name: "Compliance Alerts",
    description: "Real-time alerts for labor law violations, break requirements, and overtime",
    category: "compliance",
    state: "active",
    availableTiers: ["starter", "professional", "enterprise"],
    version: "1.5.0",
    addedDate: "2024-04-01",
    lastUpdated: "2025-11-01",
    synonyms: ["labor law alerts", "compliance warnings", "hr alerts"],
    relatedFeatures: ["break_tracking", "overtime_tracking"],
    requiredRoles: ["manager", "org_owner"],
    changelog: [],
  },

  "security_compliance_vault": {
    id: "security_compliance_vault",
    name: "Security Compliance Vault",
    description: "WORM document storage with SHA-256 verification for state-regulated compliance",
    category: "security",
    state: "active",
    availableTiers: ["professional", "enterprise"],
    version: "1.0.0",
    addedDate: "2026-01-01",
    lastUpdated: "2026-01-17",
    synonyms: ["compliance vault", "document vault", "worm storage", "security documents"],
    relatedFeatures: ["document_management", "regulator_portal"],
    requiredRoles: ["org_owner", "admin"],
    changelog: [
      { date: "2026-01-17", version: "1.0.0", type: "added", description: "Multi-state support with regulator portal" },
    ],
  },

  // =========================================================================
  // AI AUTOMATION FEATURES
  // =========================================================================
  "trinity_ai": {
    id: "trinity_ai",
    name: "Trinity AI",
    description: "Central AI brain orchestrating all platform automation and insights",
    category: "ai_automation",
    state: "active",
    availableTiers: ["starter", "professional", "enterprise"],
    version: "2.0.0",
    addedDate: "2024-06-01",
    lastUpdated: "2026-01-17",
    synonyms: ["trinity", "ai brain", "ai assistant", "automation engine"],
    relatedFeatures: ["ai_scheduling", "trinity_chat", "predictive_insights"],
    requiredRoles: ["manager", "org_owner"],
    changelog: [
      { date: "2026-01-17", version: "2.0.0", type: "updated", description: "4-tier Gemini architecture" },
    ],
  },

  "trinity_chat": {
    id: "trinity_chat",
    name: "Trinity Chat Interface",
    description: "Conversational AI access with Business, Personal, and Integrated modes",
    category: "ai_automation",
    state: "active",
    availableTiers: ["starter", "professional", "enterprise"],
    version: "1.5.0",
    addedDate: "2025-03-01",
    lastUpdated: "2026-01-10",
    synonyms: ["ai chat", "trinity assistant", "chat with trinity", "coo mode", "guru mode"],
    relatedFeatures: ["trinity_ai"],
    requiredRoles: ["employee", "manager", "org_owner"],
    changelog: [],
  },

  "predictive_insights": {
    id: "predictive_insights",
    name: "Predictive Workforce Insights",
    description: "AI-driven forecasting for staffing needs, attrition risk, and demand patterns",
    category: "ai_automation",
    state: "active",
    availableTiers: ["professional", "enterprise"],
    version: "1.0.0",
    addedDate: "2025-09-01",
    lastUpdated: "2026-01-05",
    synonyms: ["workforce predictions", "ai insights", "demand forecasting", "attrition prediction"],
    relatedFeatures: ["trinity_ai", "analytics_dashboard"],
    requiredRoles: ["org_owner"],
    changelog: [],
  },

  "profit_optimization": {
    id: "profit_optimization",
    name: "Profit-First Scheduling Optimization",
    description: "Strategic scheduling that maximizes per-shift profitability and client value",
    category: "ai_automation",
    state: "active",
    availableTiers: ["professional", "enterprise"],
    version: "1.0.0",
    addedDate: "2025-11-01",
    lastUpdated: "2026-01-17",
    synonyms: ["profit optimization", "strategic scheduling", "cost optimization"],
    relatedFeatures: ["ai_scheduling", "client_profitability"],
    requiredRoles: ["org_owner"],
    changelog: [
      { date: "2026-01-17", version: "1.0.0", type: "updated", description: "Employee scoring and client tiering" },
    ],
  },

  // =========================================================================
  // COMMUNICATION FEATURES
  // =========================================================================
  "notifications": {
    id: "notifications",
    name: "Notifications",
    description: "Real-time in-app, email, and SMS notifications for all platform events",
    category: "communication",
    state: "active",
    availableTiers: ["all"],
    version: "2.0.0",
    addedDate: "2024-01-01",
    lastUpdated: "2026-01-17",
    synonyms: ["alerts", "messages", "push notifications"],
    relatedFeatures: ["email_delivery", "sms_notifications"],
    requiredRoles: ["employee", "manager", "org_owner"],
    changelog: [
      { date: "2026-01-17", version: "2.0.0", type: "updated", description: "Universal Notification Engine with Trinity enrichment" },
    ],
  },

  "helpdesk": {
    id: "helpdesk",
    name: "HelpDesk",
    description: "Support ticket management with AI-assisted resolution and chat rooms",
    category: "communication",
    state: "active",
    availableTiers: ["professional", "enterprise"],
    version: "1.5.0",
    addedDate: "2025-01-01",
    lastUpdated: "2025-12-01",
    synonyms: ["support tickets", "help desk", "customer support", "ticket system"],
    relatedFeatures: ["trinity_chat", "notifications"],
    requiredRoles: ["support_staff", "manager", "org_owner"],
    changelog: [],
  },

  // =========================================================================
  // CONTRACTS FEATURES
  // =========================================================================
  "contract_pipeline": {
    id: "contract_pipeline",
    name: "Contract Lifecycle Pipeline",
    description: "End-to-end proposal-to-signature workflow with digital signatures and document vault",
    category: "contracts",
    state: "active",
    availableTiers: ["professional", "enterprise"],
    version: "1.0.0",
    addedDate: "2025-08-01",
    lastUpdated: "2026-01-10",
    synonyms: ["contracts", "proposals", "e-signatures", "document signing"],
    relatedFeatures: ["document_management", "client_portal"],
    requiredRoles: ["org_owner", "manager"],
    changelog: [],
  },

  // =========================================================================
  // REPORTING FEATURES
  // =========================================================================
  "analytics_dashboard": {
    id: "analytics_dashboard",
    name: "Analytics Dashboard",
    description: "Comprehensive metrics with AI insights, heat maps, and performance tracking",
    category: "reporting",
    state: "active",
    availableTiers: ["starter", "professional", "enterprise"],
    version: "1.8.0",
    addedDate: "2024-06-01",
    lastUpdated: "2025-12-01",
    synonyms: ["dashboard", "reports", "metrics", "analytics"],
    relatedFeatures: ["predictive_insights", "client_profitability"],
    requiredRoles: ["manager", "org_owner"],
    changelog: [],
  },

  "client_profitability": {
    id: "client_profitability",
    name: "Client Profitability Analytics",
    description: "Per-client profit/loss analysis with margin tracking and optimization recommendations",
    category: "reporting",
    state: "active",
    availableTiers: ["professional", "enterprise"],
    version: "1.0.0",
    addedDate: "2025-10-01",
    lastUpdated: "2026-01-05",
    synonyms: ["client analytics", "profit analysis", "margin tracking"],
    relatedFeatures: ["analytics_dashboard", "profit_optimization"],
    requiredRoles: ["org_owner"],
    changelog: [],
  },

  // =========================================================================
  // ONBOARDING FEATURES
  // =========================================================================
  "employee_onboarding": {
    id: "employee_onboarding",
    name: "Employee Onboarding",
    description: "Guided new hire setup with document collection and training assignment",
    category: "onboarding",
    state: "active",
    availableTiers: ["starter", "professional", "enterprise"],
    version: "1.5.0",
    addedDate: "2024-08-01",
    lastUpdated: "2025-11-01",
    synonyms: ["new hire onboarding", "employee setup", "hiring workflow"],
    relatedFeatures: ["document_management", "hris_integration"],
    requiredRoles: ["manager", "org_owner"],
    changelog: [],
  },

  "hris_integration": {
    id: "hris_integration",
    name: "HRIS Integration",
    description: "Unified integration with 8 HR providers including Gusto, ADP, and Workday",
    category: "integrations",
    state: "active",
    availableTiers: ["professional", "enterprise"],
    version: "1.0.0",
    addedDate: "2025-06-01",
    lastUpdated: "2026-01-01",
    synonyms: ["hr integration", "gusto integration", "adp integration", "workday sync"],
    relatedFeatures: ["employee_onboarding", "payroll_processing"],
    requiredRoles: ["org_owner", "admin"],
    changelog: [],
  },

  // =========================================================================
  // MOBILE FEATURES
  // =========================================================================
  "mobile_app": {
    id: "mobile_app",
    name: "Mobile App",
    description: "Full-featured mobile experience for employees and managers",
    category: "workforce",
    state: "active",
    availableTiers: ["starter", "professional", "enterprise"],
    version: "2.0.0",
    addedDate: "2024-02-01",
    lastUpdated: "2026-01-15",
    synonyms: ["mobile", "phone app", "mobile access"],
    relatedFeatures: ["time_tracking", "shift_swapping"],
    requiredRoles: ["employee", "manager", "org_owner"],
    changelog: [
      { date: "2026-01-15", version: "2.0.0", type: "updated", description: "Universal page architecture" },
    ],
  },

  // =========================================================================
  // DEPRECATED FEATURES (for reference and validation)
  // =========================================================================
  "legacy_scheduling": {
    id: "legacy_scheduling",
    name: "Legacy Scheduling",
    description: "Old scheduling system without AI optimization",
    category: "scheduling",
    state: "removed",
    availableTiers: [],
    version: "0.9.0",
    addedDate: "2023-01-01",
    lastUpdated: "2024-06-01",
    deprecatedDate: "2024-03-01",
    removedDate: "2024-06-01",
    synonyms: ["old scheduler", "basic scheduler", "v1 scheduling"],
    relatedFeatures: ["shift_scheduling"],
    requiredRoles: [],
    changelog: [
      { date: "2024-06-01", version: "0.9.0", type: "removed", description: "Replaced by AI-powered scheduling" },
    ],
  },

  // ── Phase 56: Trinity Voice Phone System ────────────────────────────────────
  "trinity_voice": {
    id: "trinity_voice",
    name: "Trinity Voice Phone System",
    description: "AI-powered IVR phone system — 6 extensions, voice clock-in with PIN auth, per-call credit billing",
    category: "communication",
    state: "active",
    availableTiers: ["professional", "business", "enterprise", "strategic"],
    version: "56.0.0",
    addedDate: "2026-03-29",
    lastUpdated: "2026-03-29",
    synonyms: ["voice phone", "IVR", "phone system", "voice clock-in", "trinity phone", "voice credits"],
    relatedFeatures: ["time_tracking", "employee_management"],
    requiredRoles: ["org_owner", "co_owner", "org_admin", "org_manager"],
    changelog: [
      { date: "2026-03-29", version: "56.0.0", type: "added", description: "Phase 56 — Trinity Voice Phone System launched with 6 extensions, PIN clock-in, and per-call billing" },
    ],
  },
};

// ============================================================================
// VALIDATION PATTERNS FOR VAGUE LANGUAGE
// ============================================================================
export const VAGUE_LANGUAGE_PATTERNS = {
  genericTitles: [
    "System Update",
    "Platform Update",
    "Important Update",
    "New Feature",
    "Feature Update",
    "Change Notification",
    "Alert",
    "Notice",
    "Information",
    "Update",
  ],
  vagueDescriptions: [
    /^something (was|has been) (changed|updated|modified)/i,
    /^there (is|was|are|were) (a |an )?change/i,
    /^(we|the system) (made|did) (some|a few) (changes|updates)/i,
    /^(changes|updates) (were|have been) made/i,
    /^please (check|see|review) (your|the) (dashboard|account)/i,
    /^(new|updated|changed) (stuff|things|items)/i,
    /^something (important|new)/i,
  ],
  missingContext: [
    /^(a|the) feature/i,
    /^this (feature|update|change)/i,
    /^(some|certain|various) (features|settings|options)/i,
  ],
  staleReferences: [
    "legacy_scheduling",
    "old scheduler",
    "basic scheduler",
    "v1",
    "deprecated",
  ],
  // CRITICAL: Vague issue counts without actionable details
  // These patterns should BLOCK notifications - just saying "Found X issues" is not useful
  vagueIssueCounts: [
    /^Found \d+ issues?/i,                              // "Found 309 issues"
    /\d+ (issues?|errors?|warnings?|problems?)$/i,      // Ends with just a count
    /^(Detected|Discovered|Identified) \d+ /i,          // "Detected 5 errors" without details
    /^(Scan|Check|Analysis) (complete|finished|done)/i, // "Scan complete" without results
    /^\d+ (critical|errors?|warnings?).*\d+ (critical|errors?|warnings?)/i, // "0 critical, 83 errors" style
  ],
  // Minimum actionable content requirements
  actionableMinimums: {
    minExampleCount: 1,        // Must include at least 1 example
    minFileReference: true,    // Should reference specific files
    minActionGuidance: true,   // Should say what to do about it
  },
};

// ============================================================================
// REQUIRED NOTIFICATION STRUCTURE (Problem→Issue→Solution→Outcome)
// ============================================================================
export interface StructuredNotificationContent {
  problem: string;
  issue: string;
  solution: string;
  outcome: string;
}

export const NOTIFICATION_STRUCTURE_REQUIREMENTS = {
  requiredFields: ["problem", "issue", "solution", "outcome"] as const,
  minFieldLength: 10,
  maxFieldLength: 500,
  requiresConcreteFeatureReference: true,
  requiresMeasurableOutcome: true,
};

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================
export function getActiveFeatures(): PlatformFeature[] {
  return Object.values(FEATURE_REGISTRY).filter(f => f.state === "active");
}

export function getFeatureById(id: string): PlatformFeature | undefined {
  return FEATURE_REGISTRY[id];
}

export function getFeatureBySynonym(term: string): PlatformFeature | undefined {
  const lowerTerm = term.toLowerCase();
  return Object.values(FEATURE_REGISTRY).find(f => 
    f.id.toLowerCase() === lowerTerm ||
    f.name.toLowerCase() === lowerTerm ||
    f.synonyms.some(s => s.toLowerCase() === lowerTerm)
  );
}

export function isFeatureActive(id: string): boolean {
  const feature = FEATURE_REGISTRY[id];
  return feature?.state === "active" || feature?.state === "beta";
}

export function isFeatureDeprecatedOrRemoved(id: string): boolean {
  const feature = FEATURE_REGISTRY[id];
  return feature?.state === "deprecated" || feature?.state === "removed";
}

export function getFeaturesByCategory(category: FeatureCategory): PlatformFeature[] {
  return Object.values(FEATURE_REGISTRY).filter(f => f.category === category);
}

export function getFeaturesByTier(tier: TierAvailability): PlatformFeature[] {
  return Object.values(FEATURE_REGISTRY).filter(f => 
    f.availableTiers.includes("all") || f.availableTiers.includes(tier)
  );
}

export function getAllFeatureNames(): string[] {
  const names: string[] = [];
  Object.values(FEATURE_REGISTRY).forEach(f => {
    names.push(f.name);
    names.push(...f.synonyms);
  });
  return names;
}

export function getRecentlyUpdatedFeatures(daysAgo: number = 30): PlatformFeature[] {
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - daysAgo);
  return Object.values(FEATURE_REGISTRY).filter(f => 
    new Date(f.lastUpdated) >= cutoff && f.state === "active"
  );
}
