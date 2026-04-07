/**
 * UNIFIED PLATFORM CONFIGURATION REGISTRY
 * ========================================
 * Single source of truth for ALL platform configuration.
 * 
 * ARCHITECTURE:
 * - branding: Platform identity, colors, logos, fonts
 * - navigation: Routes, modules, menus, mobile/desktop layouts
 * - copy: UI text, labels, messages, error messages
 * - services: API endpoints, external integrations
 * - features: Feature flags, tier gates, capabilities
 * 
 * BENEFITS:
 * - Edit once, update everywhere
 * - Type-safe with Zod validation
 * - Easy for non-technical editors (JSON export possible)
 * - No duplication across files
 * - Safe for end users (validation prevents bad config)
 */

import { z } from "zod";

// ============================================================================
// SCHEMA DEFINITIONS (Zod for runtime validation)
// ============================================================================

const BrandingSchema = z.object({
  platform: z.object({
    name: z.string(),
    shortName: z.string(),
    tagline: z.string(),
    description: z.string(),
    version: z.string(),
    copyright: z.string(),
    supportEmail: z.string().email(),
    website: z.string().url(),
  }),
  colors: z.object({
    primary: z.string(),
    secondary: z.string(),
    accent: z.string(),
    gradient: z.string(),
    success: z.string(),
    warning: z.string(),
    error: z.string(),
  }),
  logos: z.object({
    icon: z.string(),
    wordmark: z.string(),
    favicon: z.string(),
  }),
  fonts: z.object({
    heading: z.string(),
    body: z.string(),
    mono: z.string(),
  }),
});

const BreakpointSchema = z.object({
  mobile: z.number(),
  tablet: z.number(),
  desktop: z.number(),
  wide: z.number(),
});

const LayoutSchema = z.object({
  breakpoints: BreakpointSchema,
  touchTargetMin: z.number(),
  headerHeight: z.object({
    mobile: z.number(),
    desktop: z.number(),
  }),
  sidebarWidth: z.object({
    collapsed: z.number(),
    expanded: z.number(),
  }),
});

const ModuleSchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string(),
  icon: z.string(),
  href: z.string(),
  mobileHref: z.string().optional(),
  minimumTier: z.enum(["free", "starter", "professional", "enterprise"]).optional(),
  capabilities: z.array(z.string()).optional(),
  order: z.number(),
  visible: z.boolean().optional(),
});

const NavigationSchema = z.object({
  families: z.array(z.object({
    id: z.string(),
    label: z.string(),
    order: z.number(),
    modules: z.array(ModuleSchema),
  })),
});

// Centralized Routes Schema - Single Source of Truth for ALL paths
const RoutesSchema = z.object({
  // Core platform routes
  core: z.object({
    dashboard: z.string(),
    settings: z.string(),
    profile: z.string(),
    help: z.string(),
    chat: z.string(),
    updates: z.string(),
    contact: z.string(),
  }),
  // Authentication routes
  auth: z.object({
    login: z.string(),
    register: z.string(),
    forgotPassword: z.string(),
    resetPassword: z.string(),
    logout: z.string(),
  }),
  // People management routes
  people: z.object({
    employees: z.string(),
    employeeDetails: z.string(),
    clients: z.string(),
    clientDetails: z.string(),
  }),
  // Operations routes
  operations: z.object({
    schedule: z.string(),
    dailySchedule: z.string(),
    timeTracking: z.string(),
    workflowApprovals: z.string(),
  }),
  // Financial routes
  financials: z.object({
    payroll: z.string(),
    invoices: z.string(),
    billing: z.string(),
  }),
  // Admin routes
  admin: z.object({
    platformAdmin: z.string(),
    rootAdmin: z.string(),
    automationControl: z.string(),
    automationAuditLog: z.string(),
    automationSettings: z.string(),
  }),
  // Integration routes
  integrations: z.object({
    main: z.string(),
    quickbooks: z.string(),
    slack: z.string(),
  }),
});

const CopySchema = z.object({
  ui: z.object({
    loading: z.string(),
    error: z.string(),
    noData: z.string(),
    save: z.string(),
    cancel: z.string(),
    confirm: z.string(),
    delete: z.string(),
    edit: z.string(),
    create: z.string(),
    search: z.string(),
  }),
  errors: z.object({
    network: z.string(),
    unauthorized: z.string(),
    notFound: z.string(),
    serverError: z.string(),
    validation: z.string(),
  }),
  success: z.object({
    saved: z.string(),
    created: z.string(),
    deleted: z.string(),
    updated: z.string(),
  }),
});

const ServiceSchema = z.object({
  id: z.string(),
  name: z.string(),
  baseUrl: z.string(),
  healthEndpoint: z.string().optional(),
});

const ServicesSchema = z.object({
  internal: z.array(ServiceSchema),
  external: z.array(ServiceSchema),
});

const FeatureFlagSchema = z.object({
  id: z.string(),
  name: z.string(),
  enabled: z.boolean(),
  minimumTier: z.enum(["free", "starter", "professional", "enterprise"]).optional(),
});

const FeaturesSchema = z.object({
  flags: z.array(FeatureFlagSchema),
});

const BillingTierSchema = z.object({
  id: z.enum(["free", "starter", "professional", "enterprise"]),
  name: z.string(),
  description: z.string(),
  monthlyPrice: z.number(),
  annualPrice: z.number(),
  features: z.array(z.string()),
  stripeProductId: z.string(),
  stripePriceIdMonthly: z.string(),
  stripePriceIdAnnual: z.string(),
});

const BillingAddonSchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string(),
  price: z.number(),
  unit: z.string(),
  stripeProductId: z.string(),
  stripePriceId: z.string(),
});

const BillingSchema = z.object({
  currency: z.string(),
  trialDays: z.number(),
  tiers: z.array(BillingTierSchema),
  addons: z.array(BillingAddonSchema),
});

const ConfigRegistrySchema = z.object({
  branding: BrandingSchema,
  layout: LayoutSchema,
  navigation: NavigationSchema,
  routes: RoutesSchema,
  copy: CopySchema,
  services: ServicesSchema,
  features: FeaturesSchema,
  billing: BillingSchema,
});

// ============================================================================
// TYPE EXPORTS
// ============================================================================

export type Branding = z.infer<typeof BrandingSchema>;
export type Layout = z.infer<typeof LayoutSchema>;
export type Module = z.infer<typeof ModuleSchema>;
export type Navigation = z.infer<typeof NavigationSchema>;
export type Routes = z.infer<typeof RoutesSchema>;
export type Copy = z.infer<typeof CopySchema>;
export type Services = z.infer<typeof ServicesSchema>;
export type Features = z.infer<typeof FeaturesSchema>;
export type ConfigRegistry = z.infer<typeof ConfigRegistrySchema>;

// ============================================================================
// DEFAULT CONFIGURATION
// ============================================================================

export const CONFIG: ConfigRegistry = {
  branding: {
    platform: {
      name: "CoAIleague",
      shortName: "CA",
      tagline: "AI-Powered Workforce Intelligence",
      description: "Fortune 500-grade multi-tenant autonomous workforce management platform powered by Gemini 2.0 Flash AI",
      version: "2.0.0",
      copyright: `© ${new Date().getFullYear()} CoAIleague. All rights reserved.`,
      supportEmail: "support@coaileague.com",
      website: "https://coaileague.com",
    },
    colors: {
      primary: "#3b82f6",
      secondary: "#10b981",
      accent: "#06b6d4",
      gradient: "from-blue-500 via-green-500 to-cyan-500",
      success: "#22c55e",
      warning: "#f59e0b",
      error: "#ef4444",
    },
    logos: {
      icon: "/logo.svg",
      wordmark: "/wordmark.svg",
      favicon: "/favicon.ico",
    },
    fonts: {
      heading: "Inter, system-ui, sans-serif",
      body: "Inter, system-ui, sans-serif",
      mono: "JetBrains Mono, monospace",
    },
  },

  layout: {
    breakpoints: {
      mobile: 480,
      tablet: 768,
      desktop: 1024,
      wide: 1280,
    },
    touchTargetMin: 44,
    headerHeight: {
      mobile: 56,
      desktop: 64,
    },
    sidebarWidth: {
      collapsed: 64,
      expanded: 280,
    },
  },

  navigation: {
    families: [
      {
        id: "platform",
        label: "Platform",
        order: 1,
        modules: [
          { id: "dashboard", name: "Control Center", description: "Platform overview and metrics", icon: "LayoutDashboard", href: "/dashboard", order: 1 },
          { id: "usage", name: "Usage & Costs", description: "Track platform usage and billing", icon: "BarChart3", href: "/usage", order: 2 },
          { id: "settings", name: "Settings", description: "Configure workspace settings", icon: "Settings", href: "/settings", order: 3 },
        ],
      },
      {
        id: "executive",
        label: "Executive Control",
        order: 2,
        modules: [
          { id: "payroll", name: "AI Payroll", description: "Autonomous payroll processing", icon: "DollarSign", href: "/payroll", order: 1, minimumTier: "starter" },
          { id: "invoices", name: "Billing Platform", description: "Invoice management and billing", icon: "FileText", href: "/invoices", order: 2 },
          { id: "integrations", name: "Integrations", description: "Connect external services", icon: "Zap", href: "/integrations", order: 3, minimumTier: "professional" },
        ],
      },
      {
        id: "operations",
        label: "Operations Hub",
        order: 3,
        modules: [
          { id: "schedule", name: "AI Scheduling", description: "Smart workforce scheduling", icon: "Calendar", href: "/schedule", mobileHref: "/daily-schedule", order: 1 },
          { id: "time", name: "Time Platform", description: "Time tracking and management", icon: "Clock", href: "/time-tracking", order: 2 },
          { id: "workflow", name: "Workflow Approvals", description: "Manage approval workflows", icon: "CheckCircle", href: "/workflow-approvals", order: 3 },
        ],
      },
      {
        id: "people",
        label: "People Hub",
        order: 4,
        modules: [
          { id: "employees", name: "Team Directory", description: "Manage your workforce", icon: "Users", href: "/employees", order: 1 },
          { id: "clients", name: "Client Portal", description: "Client relationship management", icon: "Building2", href: "/clients", order: 2 },
          { id: "communications", name: "Communications", description: "Team messaging and collaboration", icon: "MessageSquare", href: "/chatrooms", order: 3 },
        ],
      },
      {
        id: "intelligence",
        label: "Intelligence",
        order: 5,
        modules: [
          { id: "analytics", name: "Analytics", description: "Business intelligence and insights", icon: "TrendingUp", href: "/analytics", order: 1 },
          { id: "reports", name: "Reports", description: "Generate custom reports", icon: "FileBarChart", href: "/reports", order: 2 },
          { id: "ai-brain", name: "AI Brain", description: "AI-powered automation", icon: "Sparkles", href: "/helpai-orchestration", order: 3, minimumTier: "professional" },
        ],
      },
    ],
  },

  routes: {
    core: {
      dashboard: "/dashboard",
      settings: "/settings",
      profile: "/profile",
      help: "/help",
      chat: "/chat",
      updates: "/updates",
      contact: "/contact",
    },
    auth: {
      login: "/login",
      register: "/register",
      forgotPassword: "/forgot-password",
      resetPassword: "/reset-password",
      logout: "/logout",
    },
    people: {
      employees: "/employees",
      employeeDetails: "/employees/:id",
      clients: "/clients",
      clientDetails: "/clients/:id",
    },
    operations: {
      schedule: "/schedule",
      dailySchedule: "/daily-schedule",
      timeTracking: "/time-tracking",
      workflowApprovals: "/workflow-approvals",
    },
    financials: {
      payroll: "/payroll",
      invoices: "/invoices",
      billing: "/billing",
    },
    admin: {
      platformAdmin: "/platform-admin",
      rootAdmin: "/root-admin",
      automationControl: "/automation-control",
      automationAuditLog: "/automation/audit-log",
      automationSettings: "/automation/settings",
    },
    integrations: {
      main: "/integrations",
      quickbooks: "/integrations/quickbooks",
      slack: "/integrations/slack",
    },
  },

  copy: {
    ui: {
      loading: "Loading...",
      error: "Something went wrong",
      noData: "No data available",
      save: "Save",
      cancel: "Cancel",
      confirm: "Confirm",
      delete: "Delete",
      edit: "Edit",
      create: "Create",
      search: "Search...",
    },
    errors: {
      network: "Unable to connect. Please check your internet connection.",
      unauthorized: "You don't have permission to access this resource.",
      notFound: "The requested resource was not found.",
      serverError: "An unexpected error occurred. Please try again later.",
      validation: "Please check your input and try again.",
    },
    success: {
      saved: "Changes saved successfully",
      created: "Created successfully",
      deleted: "Deleted successfully",
      updated: "Updated successfully",
    },
  },

  services: {
    internal: [
      { id: "api", name: "Core API", baseUrl: "/api", healthEndpoint: "/health" },
      { id: "ws", name: "WebSocket", baseUrl: "/ws/chat", healthEndpoint: "/health" },
      { id: "chat", name: "Chat Server", baseUrl: "/api/chat", healthEndpoint: "/health" },
    ],
    external: [
      { id: "stripe", name: "Stripe Payments", baseUrl: "https://api.stripe.com" },
      { id: "resend", name: "Resend Email", baseUrl: "https://api.resend.com" },
      { id: "gemini", name: "Google Gemini AI", baseUrl: "https://generativelanguage.googleapis.com" },
    ],
  },

  features: {
    flags: [
      { id: "gamification", name: "Gamification System", enabled: true, minimumTier: "starter" },
      { id: "ai-scheduling", name: "AI-Powered Scheduling", enabled: true, minimumTier: "starter" },
      { id: "ai-payroll", name: "AI-Powered Payroll", enabled: true, minimumTier: "professional" },
      { id: "helpai", name: "HelpAI Orchestration", enabled: true, minimumTier: "professional" },
      { id: "multi-currency", name: "Multi-Currency Support", enabled: true, minimumTier: "enterprise" },
      { id: "sso", name: "Single Sign-On", enabled: true, minimumTier: "enterprise" },
    ],
  },

  billing: {
    currency: "usd",
    trialDays: 14,
    tiers: [
      {
        id: "free",
        name: "Free",
        description: "For small teams getting started",
        monthlyPrice: 0,
        annualPrice: 0,
        features: ["Up to 5 employees", "Basic scheduling", "Time tracking"],
        stripeProductId: process.env.STRIPE_FREE_PRODUCT_ID || "",
        stripePriceIdMonthly: process.env.STRIPE_FREE_PRICE_MONTHLY || "",
        stripePriceIdAnnual: process.env.STRIPE_FREE_PRICE_ANNUAL || "",
      },
      {
        id: "starter",
        name: "Starter",
        description: "For growing businesses",
        monthlyPrice: 29,
        annualPrice: 290,
        features: ["Up to 25 employees", "AI scheduling", "Gamification", "Email notifications"],
        stripeProductId: process.env.STRIPE_STARTER_PRODUCT_ID || "",
        stripePriceIdMonthly: process.env.STRIPE_STARTER_PRICE_MONTHLY || "",
        stripePriceIdAnnual: process.env.STRIPE_STARTER_PRICE_ANNUAL || "",
      },
      {
        id: "professional",
        name: "Professional",
        description: "For established organizations",
        monthlyPrice: 79,
        annualPrice: 790,
        features: ["Up to 100 employees", "AI payroll", "HelpAI orchestration", "Advanced analytics", "Integrations"],
        stripeProductId: process.env.STRIPE_PROFESSIONAL_PRODUCT_ID || "",
        stripePriceIdMonthly: process.env.STRIPE_PROFESSIONAL_PRICE_MONTHLY || "",
        stripePriceIdAnnual: process.env.STRIPE_PROFESSIONAL_PRICE_ANNUAL || "",
      },
      {
        id: "enterprise",
        name: "Enterprise",
        description: "For large organizations",
        monthlyPrice: 199,
        annualPrice: 1990,
        features: ["Unlimited employees", "Multi-currency", "SSO", "Dedicated support", "Custom integrations", "SLA"],
        stripeProductId: process.env.STRIPE_ENTERPRISE_PRODUCT_ID || "",
        stripePriceIdMonthly: process.env.STRIPE_ENTERPRISE_PRICE_MONTHLY || "",
        stripePriceIdAnnual: process.env.STRIPE_ENTERPRISE_PRICE_ANNUAL || "",
      },
    ],
    addons: [
      {
        id: "ai-tokens",
        name: "AI Token Pack",
        description: "Additional AI processing tokens",
        price: 10,
        unit: "1000 tokens",
        stripeProductId: process.env.STRIPE_AI_TOKENS_PRODUCT_ID || "",
        stripePriceId: process.env.STRIPE_AI_TOKENS_PRICE_ID || "",
      },
      {
        id: "extra-emails",
        name: "Email Credits",
        description: "Additional email sending credits",
        price: 5,
        unit: "500 emails",
        stripeProductId: process.env.STRIPE_EMAIL_CREDITS_PRODUCT_ID || "",
        stripePriceId: process.env.STRIPE_EMAIL_CREDITS_PRICE_ID || "",
      },
    ],
  },
};

// ============================================================================
// VALIDATION & HELPERS
// ============================================================================

/**
 * Validate configuration at runtime
 * @throws ZodError if config is invalid
 */
export function validateConfig(config: unknown): ConfigRegistry {
  return ConfigRegistrySchema.parse(config);
}

/**
 * Safely get a config value with fallback
 */
export function getConfigValue<T>(
  path: string,
  fallback: T
): T {
  try {
    const keys = path.split(".");
    let value: unknown = CONFIG;
    for (const key of keys) {
      value = (value as Record<string, unknown>)[key];
      if (value === undefined) return fallback;
    }
    return value as T;
  } catch {
    return fallback;
  }
}

/**
 * Get module by ID
 */
export function getModule(moduleId: string): Module | undefined {
  for (const family of CONFIG.navigation.families) {
    const module = family.modules.find(m => m.id === moduleId);
    if (module) return module;
  }
  return undefined;
}

/**
 * Get all modules for a tier
 */
export function getModulesForTier(tier: "free" | "trial" | "starter" | "professional" | "business" | "enterprise" | "strategic"): Module[] {
  const tierOrder = { free: 0, trial: 0, starter: 1, professional: 2, business: 3, enterprise: 4, strategic: 5 };
  const modules: Module[] = [];
  
  for (const family of CONFIG.navigation.families) {
    for (const module of family.modules) {
      const minTier = module.minimumTier || "free";
      if (tierOrder[tier] >= tierOrder[minTier]) {
        modules.push(module);
      }
    }
  }
  
  return modules;
}

/**
 * Check if feature is enabled for tier
 */
export function isFeatureEnabled(
  featureId: string,
  userTier: "free" | "trial" | "starter" | "professional" | "business" | "enterprise" | "strategic"
): boolean {
  const tierOrder = { free: 0, trial: 0, starter: 1, professional: 2, business: 3, enterprise: 4, strategic: 5 };
  const feature = CONFIG.features.flags.find(f => f.id === featureId);
  
  if (!feature || !feature.enabled) return false;
  
  const minTier = feature.minimumTier || "free";
  return tierOrder[userTier] >= tierOrder[minTier];
}

/**
 * Get responsive href (mobile or desktop)
 */
export function getResponsiveHref(moduleId: string, isMobile: boolean): string {
  const module = getModule(moduleId);
  if (!module) return "/";
  return isMobile && module.mobileHref ? module.mobileHref : module.href;
}

/**
 * Get route path from centralized registry
 * @param category - Route category (core, auth, people, operations, financials, admin, integrations)
 * @param route - Specific route within category
 * @param params - Optional params for dynamic routes (e.g., { id: "123" })
 */
export function getRoute(
  category: keyof Routes,
  route: string,
  params?: Record<string, string>
): string {
  const routes = CONFIG.routes[category] as Record<string, string>;
  let path = routes[route] || "/";
  
  if (params) {
    Object.entries(params).forEach(([key, value]) => {
      path = path.replace(`:${key}`, value);
    });
  }
  
  return path;
}

/**
 * Get all routes as flat object for backward compatibility
 */
export function getAllRoutes(): Record<string, string> {
  const allRoutes: Record<string, string> = {};
  
  for (const [category, routes] of Object.entries(CONFIG.routes)) {
    for (const [name, path] of Object.entries(routes as Record<string, string>)) {
      allRoutes[`${category}.${name}`] = path;
    }
  }
  
  return allRoutes;
}

// Export for use across platform
export default CONFIG;
