# Phase 3: Universal Config & Registry System Design

**Document Version**: 1.0  
**Date**: November 30, 2025  
**Status**: Design Document (No Implementation)  
**Authors**: CoAIleague Architecture Team

---

## Executive Summary

This design document specifies a comprehensive architecture for centralizing **ALL** hardcoded configuration across the CoAIleague platform. Currently, configuration is fragmented across **37+ files** in three locations:
- `client/src/config/` (25 files)
- `server/config/` (1 file)  
- `shared/config/` (11 files)

The Universal Config & Registry System consolidates this into **one unified registry** with clear integration patterns, making the platform configurable without code changes and enabling rapid feature rollouts, A/B testing, and multi-tenant customization.

---

## Part 1: Architecture Overview

### 1.1 Current State Analysis

**Problems:**
1. **Fragmentation**: Config scattered across files with inconsistent naming/structure
2. **Duplication**: Same values defined in multiple files (e.g., API endpoints in client AND server)
3. **Type Unsafety**: Hardcoded strings throughout codebase, no validation
4. **Environment Handling**: No clear dev/production separation
5. **Discoverability**: Hard to find where a config value is used
6. **Scalability**: Adding new config requires changes in multiple files

**Current Config Files Inventory**:

```
CLIENT-SIDE (client/src/config/)
├── apiEndpoints.ts (336 lines) - API route definitions
├── appConfig.ts (60 lines) - App identity, UI behavior
├── messages.ts (167 lines) - User-facing messages
├── featureToggles.ts (200 lines) - Feature flags
├── navigationConfig.ts (213 lines) - Router paths
├── pricing.ts (235 lines) - Subscription tier definitions
├── theme.ts - Design tokens, colors
├── errorConfig.ts - Error messages and codes
├── mobileConfig.ts - Mobile-specific settings
├── chatBubble.ts, chatroomsConfig.ts, defaults.ts
├── [16 more config files] - Various features/modules

SERVER-SIDE (server/config/)
├── chatServer.ts (454 lines) - Chat system configuration

SHARED (shared/config/)
├── registry.ts (400+ lines) - Existing basic registry (Zod validated)
├── featureToggles.ts - Shared feature flags
├── moduleConfig.ts (149 lines) - Module registry
├── platformConfig.ts (867 lines) - Master platform config
├── [6 more config files] - Feature-specific config
```

### 1.2 Design Principles

1. **Single Source of Truth**: One registry, referenced everywhere
2. **Type Safety**: 100% Zod validation, no unvalidated config
3. **Zero Hardcoding**: No magic strings/numbers outside registry
4. **Environment Aware**: Different configs for dev/production/staging
5. **Composition Over Duplication**: Reuse sections across features
6. **Versioning Support**: Safely evolve schema without breaking changes
7. **Performance**: Lazy-loaded, memoized, cached where needed
8. **Developer Experience**: Clear naming, auto-completion in IDEs, easy discoverability

---

## Part 2: Unified Registry Structure

### 2.1 Master Registry Location & Organization

**File Structure**:
```
shared/config/
├── registry.ts                   # Master registry (extended)
├── schemas/
│   ├── core.ts                   # Core/branding schema
│   ├── api.ts                    # API endpoints schema
│   ├── ui.ts                     # UI constants schema
│   ├── features.ts               # Feature flags schema
│   ├── business-rules.ts         # Business logic (compliance, pricing, etc)
│   ├── messages.ts               # User-facing messages schema
│   ├── integrations.ts           # External integrations schema
│   └── index.ts                  # Export all schemas
├── data/
│   ├── dev.ts                    # Development config
│   ├── staging.ts                # Staging config
│   ├── production.ts             # Production config
│   └── index.ts                  # Load by env
└── index.ts                      # Public exports
```

### 2.2 Master Registry Schema Structure

```typescript
/**
 * shared/config/registry.ts (EXTENDED)
 * 
 * Master unified configuration registry with all platform settings
 * Organized into logical sections with Zod validation
 */

import { z } from "zod";
import { loadConfigByEnvironment } from "./data";

// ============================================================================
// SCHEMA DEFINITIONS
// ============================================================================

// 1. CORE BRANDING & IDENTITY
const CoreBrandingSchema = z.object({
  platform: z.object({
    name: z.string().describe("Platform name"),
    shortName: z.string().describe("Short name for UI"),
    tagline: z.string(),
    description: z.string(),
    version: z.string(),
    copyright: z.string(),
    supportEmail: z.string().email(),
    website: z.string().url(),
  }),
  
  branding: z.object({
    colors: z.object({
      primary: z.string(),
      secondary: z.string(),
      accent: z.string(),
      success: z.string(),
      warning: z.string(),
      error: z.string(),
      gradients: z.record(z.string()),
    }),
    logo: z.object({
      svg: z.string(),
      icon192: z.string(),
      icon512: z.string(),
      favicon: z.string(),
    }),
    fonts: z.object({
      heading: z.string(),
      body: z.string(),
      mono: z.string(),
    }),
  }),
  
  layout: z.object({
    breakpoints: z.object({
      mobile: z.number(),
      tablet: z.number(),
      desktop: z.number(),
      wide: z.number(),
    }),
    touchTargetMin: z.number(),
    sidebarWidth: z.object({
      collapsed: z.number(),
      expanded: z.number(),
    }),
  }),
});

// 2. API ENDPOINTS
const ApiEndpointsSchema = z.object({
  baseUrl: z.string().url(),
  
  auth: z.object({
    login: z.string(),
    logout: z.string(),
    register: z.string(),
    me: z.string(),
    mfa: z.object({
      setup: z.string(),
      verify: z.string(),
      enable: z.string(),
      disable: z.string(),
    }),
  }),
  
  // [Dozens more endpoint groups organized by feature]
  employees: z.object({
    list: z.string(),
    create: z.string(),
    get: z.string(),
    update: z.string(),
    delete: z.string(),
  }),
  
  // ... followed by shifts, time-entries, payroll, invoices, etc
});

// 3. UI CONSTANTS
const UiConstantsSchema = z.object({
  defaults: z.object({
    theme: z.enum(["light", "dark", "system"]),
    language: z.string(),
    timezone: z.string(),
    dateFormat: z.string(),
    timeFormat: z.string(),
  }),
  
  timing: z.object({
    animationDuration: z.number(),
    transitionDuration: z.number(),
    toastDuration: z.number(),
    debounceMs: z.number(),
    requestTimeout: z.number(),
  }),
  
  pagination: z.object({
    defaultPageSize: z.number(),
    maxPageSize: z.number(),
    pageSizeOptions: z.array(z.number()),
  }),
  
  validation: z.object({
    minPasswordLength: z.number(),
    maxNameLength: z.number(),
    emailRegex: z.string(),
  }),
});

// 4. BUSINESS RULES
const BusinessRulesSchema = z.object({
  compliance: z.object({
    overtime: z.object({
      dailyThresholdHours: z.number(),
      weeklyThresholdHours: z.number(),
      overtimeMultiplier: z.number(),
      doubleTimeMultiplier: z.number(),
    }),
    breaks: z.object({
      minBreakAfterHours: z.number(),
      minBreakDuration: z.number(),
      mealBreakDuration: z.number(),
    }),
    shifts: z.object({
      maxDailyHours: z.number(),
      minRestBetweenShifts: z.number(),
      maxConsecutiveDays: z.number(),
    }),
  }),
  
  billing: z.object({
    tiers: z.record(z.object({
      name: z.string(),
      price: z.number().nullable(),
      currency: z.string(),
      limits: z.object({
        employees: z.number().nullable(),
        monthlyApiCalls: z.number().nullable(),
      }),
    })),
    
    gracePeriodDays: z.number(),
    trialPeriodDays: z.number(),
  }),
  
  features: z.object({
    enabledFlags: z.record(z.boolean()),
    tierGates: z.record(z.enum(["free", "starter", "professional", "enterprise"])),
    betaFeatures: z.array(z.string()),
  }),
});

// 5. MESSAGES (All user-facing text)
const MessagesSchema = z.object({
  ui: z.record(z.string()),
  errors: z.record(z.string()),
  success: z.record(z.string()),
  validation: z.record(z.string()),
  notifications: z.record(z.string()),
});

// 6. INTEGRATIONS
const IntegrationsSchema = z.object({
  stripe: z.object({
    publishableKey: z.string().optional(),
    // secretKey is environment variable, never in config
  }),
  
  gemini: z.object({
    model: z.string(),
    maxTokens: z.number(),
    // apiKey is environment variable
  }),
  
  // ... other integrations
});

// 7. MODULES & NAVIGATION
const ModulesSchema = z.object({
  enabled: z.array(z.string()),
  registry: z.record(z.object({
    id: z.string(),
    name: z.string(),
    route: z.string(),
    icon: z.string(),
    tier: z.enum(["free", "starter", "professional", "enterprise"]),
    category: z.string(),
  })),
});

// MASTER SCHEMA
export const ConfigRegistrySchema = z.object({
  core: CoreBrandingSchema,
  api: ApiEndpointsSchema,
  ui: UiConstantsSchema,
  businessRules: BusinessRulesSchema,
  messages: MessagesSchema,
  integrations: IntegrationsSchema,
  modules: ModulesSchema,
  
  // Metadata
  metadata: z.object({
    environment: z.enum(["development", "staging", "production"]),
    version: z.string(),
    lastUpdated: z.string().datetime(),
  }),
});

export type ConfigRegistry = z.infer<typeof ConfigRegistrySchema>;

// ============================================================================
// VALIDATION & LOADING
// ============================================================================

let cachedConfig: ConfigRegistry | null = null;

export function loadConfig(): ConfigRegistry {
  if (cachedConfig) return cachedConfig;
  
  const env = process.env.NODE_ENV || "development";
  const rawConfig = loadConfigByEnvironment(env);
  
  try {
    cachedConfig = ConfigRegistrySchema.parse(rawConfig);
    return cachedConfig;
  } catch (error) {
    console.error("Config validation failed:", error);
    throw new Error("Invalid configuration");
  }
}

export const CONFIG = loadConfig();

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Deep-get config value by dot-notation path
 * config.get('api.auth.login') => '/api/auth/login'
 */
export function get<T = any>(path: string, fallback?: T): T {
  const keys = path.split(".");
  let value: any = CONFIG;
  
  for (const key of keys) {
    if (value === null || value === undefined) {
      return fallback as T;
    }
    value = value[key];
  }
  
  return value ?? fallback;
}

/**
 * Get config value or throw
 */
export function getRequired<T = any>(path: string): T {
  const value = get<T>(path);
  if (value === undefined) {
    throw new Error(`Required config not found: ${path}`);
  }
  return value;
}

/**
 * Check if feature is enabled
 */
export function isFeatureEnabled(featureId: string): boolean {
  return get<boolean>(`businessRules.features.enabledFlags.${featureId}`, false);
}

/**
 * Get feature tier gate
 */
export function getFeatureTier(featureId: string): string {
  return get<string>(`businessRules.features.tierGates.${featureId}`, "enterprise");
}

/**
 * Get module by ID
 */
export function getModule(moduleId: string) {
  return get(`modules.registry.${moduleId}`);
}

/**
 * Get all modules for a tier
 */
export function getModulesForTier(tier: string) {
  const allModules = Object.values(get("modules.registry", {}));
  return allModules.filter((m: any) => m.tier === tier || tierRank(m.tier) >= tierRank(tier));
}

function tierRank(tier: string): number {
  const ranks = { free: 0, starter: 1, professional: 2, enterprise: 3 };
  return ranks[tier as keyof typeof ranks] || 0;
}

// ============================================================================
// TYPING & EXPORTS
// ============================================================================

export default CONFIG;
export type { ConfigRegistry };
```

### 2.3 Environment-Specific Config Data

```typescript
/**
 * shared/config/data/dev.ts
 * Development configuration (loose rules, all features enabled)
 */

export const DEV_CONFIG = {
  core: {
    platform: {
      name: "CoAIleague (DEV)",
      version: "2.0.0-dev",
      // ...
    },
  },
  
  api: {
    baseUrl: "http://localhost:5173",
    auth: {
      login: "/api/auth/login",
      // ...
    },
  },
  
  ui: {
    defaults: {
      theme: "dark",
      debugMode: true,
    },
    timing: {
      animationDuration: 200,
      toastDuration: 5000,
    },
  },
  
  businessRules: {
    features: {
      enabledFlags: {
        // ALL features enabled in dev
        "*": true,
      },
    },
    billing: {
      trialPeriodDays: 999, // Infinite trial in dev
    },
  },
};

/**
 * shared/config/data/production.ts
 * Production configuration (locked down, feature gates enforced)
 */

export const PROD_CONFIG = {
  core: {
    platform: {
      name: "CoAIleague",
      version: "2.0.0",
      // ...
    },
  },
  
  api: {
    baseUrl: "https://api.coaileague.com",
    // ...
  },
  
  ui: {
    timing: {
      requestTimeout: 15000,
      animationDuration: 300,
    },
  },
  
  businessRules: {
    features: {
      enabledFlags: {
        // Selective feature flags
        "ai.scheduling": true,
        "beta.newDashboard": false,
        "security.sso": false,
      },
      
      tierGates: {
        "ai.scheduling": "starter",
        "payroll.advanced": "enterprise",
        "integrations.sso": "enterprise",
      },
    },
    
    billing: {
      gracePeriodDays: 7,
      trialPeriodDays: 14,
    },
  },
};
```

---

## Part 3: Integration Points

### 3.1 Frontend Component Integration

**Pattern: Direct Config Reference**

```typescript
/**
 * client/src/components/Dashboard.tsx
 * Components reference config directly via helpers
 */

import { CONFIG } from "@shared/config";
import { isFeatureEnabled, get } from "@shared/config";

export function Dashboard() {
  const animationDuration = get("ui.timing.animationDuration", 200);
  const primaryColor = get("core.branding.colors.primary");
  
  // Gate features behind config
  const showAIScheduling = isFeatureEnabled("ai.scheduling");
  
  return (
    <div
      className={showAIScheduling ? "with-ai-badge" : ""}
      style={{
        "--animation-duration": `${animationDuration}ms`,
      } as React.CSSProperties}
    >
      {showAIScheduling && <AISchedulingWidget />}
    </div>
  );
}
```

**Pattern: API Endpoints via Config**

```typescript
/**
 * client/src/lib/apiClient.ts
 */

import { CONFIG, get } from "@shared/config";

export const apiClient = {
  auth: {
    login: async (email: string, password: string) => {
      const endpoint = get("api.auth.login");
      return fetch(endpoint, {
        method: "POST",
        body: JSON.stringify({ email, password }),
      });
    },
  },
  
  employees: {
    list: async (workspaceId: string) => {
      const endpoint = get("api.employees.list");
      return fetch(`${endpoint}?workspace=${workspaceId}`);
    },
  },
};
```

**Pattern: Validation & Form Defaults**

```typescript
/**
 * client/src/pages/Register.tsx
 */

import { get } from "@shared/config";
import { useForm } from "react-hook-form";
import { z } from "zod";

const minLength = get("ui.validation.minPasswordLength", 8);
const maxNameLength = get("ui.validation.maxNameLength", 100);

const registerSchema = z.object({
  name: z.string().max(maxNameLength),
  password: z.string().min(minLength),
});
```

### 3.2 Backend Routes Integration

**Pattern: Config Validation for Requests**

```typescript
/**
 * server/routes.ts
 */

import { CONFIG, get, isFeatureEnabled } from "@shared/config";

export async function registerRoutes(app: Express) {
  // Use config-driven rate limiting
  const rateLimitConfig = get("api.rateLimit");
  app.use(rateLimiter({
    windowMs: rateLimitConfig.windowMs,
    max: rateLimitConfig.maxRequests,
  }));
  
  // Feature-gated endpoints
  if (isFeatureEnabled("payroll.advanced")) {
    app.post("/api/payroll/advanced", advancedPayrollHandler);
  }
  
  // Use config for validation rules
  app.post("/api/auth/register", async (req, res) => {
    const minLength = get("ui.validation.minPasswordLength");
    
    if (req.body.password.length < minLength) {
      return res.status(400).json({
        error: `Password must be at least ${minLength} characters`,
      });
    }
    
    // Process registration
  });
}
```

### 3.3 Services Integration

**Pattern: Business Rules Applied via Config**

```typescript
/**
 * server/services/payrollAutomation.ts
 */

import { CONFIG, get } from "@shared/config";

export function calculateOvertime(hoursWorked: number, rate: number): number {
  const dailyThreshold = get("businessRules.compliance.overtime.dailyThresholdHours");
  const multiplier = get("businessRules.compliance.overtime.overtimeMultiplier");
  
  if (hoursWorked > dailyThreshold) {
    const overtimeHours = hoursWorked - dailyThreshold;
    return overtimeHours * rate * multiplier;
  }
  
  return 0;
}

export function validateShiftLength(hours: number): boolean {
  const maxDailyHours = get("businessRules.compliance.shifts.maxDailyHours");
  return hours <= maxDailyHours;
}

export function validateBreakRequirement(hoursWorked: number): boolean {
  const minBreakAfter = get("businessRules.compliance.breaks.minBreakAfterHours");
  return hoursWorked <= minBreakAfter;
}
```

### 3.4 Database Schema Defaults

**Pattern: Schema Defaults from Config**

```typescript
/**
 * shared/schema.ts
 */

import { get } from "@shared/config";

export const workspaces = pgTable("workspaces", {
  id: text("id").primaryKey(),
  
  // Default timezone from config
  timezone: text("timezone").default(get("ui.defaults.timezone", "America/New_York")),
  
  // Default currency from config
  currency: text("currency").default(get("ui.defaults.timezone", "USD")),
  
  // Max employees from config
  maxEmployees: integer("max_employees").default(
    get("businessRules.billing.limits.employees.starter", 50)
  ),
  
  // Created/updated timestamps
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const shifts = pgTable("shifts", {
  id: text("id").primaryKey(),
  workspaceId: text("workspace_id"),
  
  // Max hours from config
  maxHours: integer("max_hours").default(
    get("businessRules.compliance.shifts.maxDailyHours", 12)
  ),
  
  startTime: timestamp("start_time").notNull(),
  endTime: timestamp("end_time").notNull(),
});
```

### 3.5 Chat & Messaging Integration

**Pattern: Dynamic Message Templates**

```typescript
/**
 * server/services/ChatServerHub.ts
 */

import { get } from "@shared/config";

export function getWelcomeMessage(userName: string): string {
  const greeting = get("messages.notifications.welcome", "Welcome!");
  const platformName = get("core.platform.name");
  
  return `${greeting} ${userName}! Welcome to ${platformName} Support. How can we help you today?`;
}

export function getTicketCreatedMessage(ticketNumber: string, position: number): string {
  const template = get("messages.support.ticketCreated");
  return template
    .replace("{ticketId}", ticketNumber)
    .replace("{position}", String(position));
}
```

### 3.6 Email Templates Integration

**Pattern: Email Subject/Body from Config**

```typescript
/**
 * server/services/emailService.ts
 */

import { get } from "@shared/config";

export function getShiftAssignmentEmail(
  employeeName: string,
  shiftDate: string
): { subject: string; body: string } {
  const platformName = get("core.platform.name");
  const supportEmail = get("core.platform.supportEmail");
  
  return {
    subject: `You've been assigned a shift - ${platformName}`,
    body: `
Hi ${employeeName},

You've been assigned a shift for ${shiftDate}.

Questions? Contact us at ${supportEmail}

- ${platformName} Team
    `,
  };
}
```

---

## Part 4: Developer Guidelines

### 4.1 Naming Conventions

**Config Keys Follow This Pattern**:

```
{section}.{feature}.{aspect}

Examples:
- core.platform.name           # Platform identity
- core.branding.colors.primary # Design colors
- api.auth.login               # API endpoints
- api.employees.list
- ui.timing.animationDuration  # UI constants
- ui.validation.minPasswordLength
- businessRules.compliance.overtime.dailyThresholdHours
- businessRules.billing.gracePeriodDays
- businessRules.features.enabledFlags.ai.scheduling
- messages.errors.unauthorized # User messages
- modules.registry.payroll     # Module definitions
- integrations.stripe.publishableKey
```

**Naming Rules**:

1. **CamelCase** for keys (lowerCamelCase)
2. **Dots** separate hierarchy levels (not underscores or dashes)
3. **Plural** for collections (e.g., `breakpoints`, `limits`, `tiers`)
4. **Singular** for singular values (e.g., `name`, `price`, `description`)
5. **Boolean prefixes**: Use `is`, `enable`, `allow`, `require` for booleans
   - `isFeatureEnabled` not `featureEnabled`
   - `requireMfa` not `mfaRequired`
6. **Verb-nouns** for functions/handlers (e.g., `onClick`, `onSubmit`)
7. **Describe units** in names (e.g., `timeoutMs`, `delaySeconds`, `thresholdHours`)

### 4.2 Categorization Rules

**When to Add to Each Section**:

| Section | Purpose | Examples |
|---------|---------|----------|
| **core** | Platform identity & branding | name, version, logo, colors, fonts |
| **api** | All endpoint URLs | `/api/auth/login`, `/api/employees` |
| **ui** | Visual & interaction constants | timeout, animation, validation rules |
| **businessRules** | Domain logic & compliance | overtime calc, shift limits, billing tiers |
| **messages** | User-facing text | errors, confirmations, notifications |
| **integrations** | External service config | Stripe keys, Gemini settings |
| **modules** | Feature modules & navigation | module registry, enabled features |

### 4.3 How to Add New Config

**Step-by-step process for developers**:

```
1. Identify which section (core, api, ui, businessRules, messages, integrations, modules)

2. Add to appropriate schema (shared/config/schemas/{section}.ts)
   - Define Zod schema for validation
   - Add JSDoc description
   - Consider environment variations

3. Add data to config files (shared/config/data/{env}.ts)
   - dev.ts: Loose/testing values
   - staging.ts: Staging values  
   - production.ts: Locked down production values

4. Export new value from registry.ts
   - Add to ConfigRegistry type
   - Add helper if complex

5. Use in code:
   - Frontend: import { CONFIG, get } from "@shared/config"
   - Backend: import { CONFIG, get } from "@shared/config"
   - Validate early, use late

6. Test across environments
   - Verify dev values work
   - Verify production values locked down
   - Test feature gates work
```

### 4.4 Code Examples for Developers

**Example 1: Adding a new API endpoint**

```typescript
/**
 * shared/config/schemas/api.ts
 * 
 * (Before)
 */
export const ApiSchema = z.object({
  auth: z.object({
    login: z.string(),
    logout: z.string(),
  }),
});

/**
 * (After - adding new expense endpoints)
 */
export const ApiSchema = z.object({
  auth: z.object({
    login: z.string(),
    logout: z.string(),
  }),
  
  // NEW: Expense management endpoints
  expenses: z.object({
    list: z.string().describe("List expenses: GET /api/expenses"),
    create: z.string().describe("Create expense: POST /api/expenses"),
    get: z.string().describe("Get expense: GET /api/expenses/:id"),
    update: z.string().describe("Update expense: PATCH /api/expenses/:id"),
    delete: z.string().describe("Delete expense: DELETE /api/expenses/:id"),
    export: z.string().describe("Export expenses: GET /api/expenses/export"),
  }),
});

/**
 * shared/config/data/production.ts
 * 
 * Add to PROD_CONFIG
 */
const PROD_CONFIG = {
  api: {
    expenses: {
      list: "/api/expenses",
      create: "/api/expenses",
      get: "/api/expenses/:id",
      update: "/api/expenses/:id",
      delete: "/api/expenses/:id",
      export: "/api/expenses/export",
    },
  },
};

/**
 * shared/config/data/dev.ts
 * 
 * Add to DEV_CONFIG (same, or with debugging)
 */
const DEV_CONFIG = {
  api: {
    expenses: {
      list: "/api/expenses?debug=true",
      // ... rest same as prod
    },
  },
};

/**
 * Usage in client code
 */
import { get } from "@shared/config";

export async function fetchExpenses() {
  const endpoint = get("api.expenses.list");
  return fetch(endpoint);
}
```

**Example 2: Adding a new feature flag**

```typescript
/**
 * shared/config/schemas/business-rules.ts
 */
export const BusinessRulesSchema = z.object({
  features: z.object({
    enabledFlags: z.object({
      // Existing
      "ai.scheduling": z.boolean(),
      
      // NEW: Expense tracking feature
      "expenses.tracking": z.boolean().describe("Enable expense tracking module"),
      "expenses.receipts": z.boolean().describe("Enable receipt uploads"),
      "expenses.mileage": z.boolean().describe("Enable mileage tracking"),
    }),
  }),
});

/**
 * shared/config/data/production.ts
 */
const PROD_CONFIG = {
  businessRules: {
    features: {
      enabledFlags: {
        "expenses.tracking": true,  // Enabled for all
        "expenses.receipts": false, // Beta - disabled
        "expenses.mileage": false,  // Future feature
      },
      
      tierGates: {
        "expenses.receipts": "professional", // Only pro+ can use
      },
    },
  },
};

/**
 * Usage in components
 */
import { isFeatureEnabled } from "@shared/config";

function ExpensesPage() {
  if (!isFeatureEnabled("expenses.tracking")) {
    return <FeatureComingSoon />;
  }
  
  return (
    <>
      <ExpensesList />
      
      {isFeatureEnabled("expenses.receipts") && <ReceiptUploader />}
      {isFeatureEnabled("expenses.mileage") && <MileageTracker />}
    </>
  );
}
```

**Example 3: Adding a new business rule**

```typescript
/**
 * shared/config/schemas/business-rules.ts
 */
export const BusinessRulesSchema = z.object({
  compliance: z.object({
    overtime: z.object({
      dailyThresholdHours: z.number(),
      // NEW: Monthly overtime threshold
      monthlyThresholdHours: z.number().describe("Hours before monthly OT kicks in"),
      monthlyMultiplier: z.number().describe("OT multiplier for monthly excess"),
    }),
  }),
});

/**
 * shared/config/data/production.ts
 */
const PROD_CONFIG = {
  businessRules: {
    compliance: {
      overtime: {
        dailyThresholdHours: 8,
        monthlyThresholdHours: 160,
        monthlyMultiplier: 1.25,
      },
    },
  },
};

/**
 * server/services/payrollAutomation.ts
 * Usage to calculate monthly OT
 */
import { get } from "@shared/config";

function calculateMonthlyOvertime(
  totalMonthlyHours: number,
  rate: number
): number {
  const threshold = get("businessRules.compliance.overtime.monthlyThresholdHours");
  const multiplier = get("businessRules.compliance.overtime.monthlyMultiplier");
  
  if (totalMonthlyHours > threshold) {
    const excess = totalMonthlyHours - threshold;
    return excess * rate * (multiplier - 1);
  }
  
  return 0;
}
```

### 4.5 Testing Strategy for New Config

```typescript
/**
 * tests/config.test.ts
 * 
 * When adding new config, ensure tests:
 */

import { loadConfig, isFeatureEnabled, get } from "@shared/config";

describe("Config Registry", () => {
  describe("New Feature: Expense Tracking", () => {
    it("should validate expense config schema", () => {
      const config = loadConfig();
      expect(config.api.expenses).toBeDefined();
      expect(config.api.expenses.list).toMatch(/^\/api/);
    });
    
    it("should gate receipt feature to professional tier", () => {
      const tier = get("businessRules.features.tierGates.expenses.receipts");
      expect(tier).toBe("professional");
    });
    
    it("should enable expense tracking in production", () => {
      const enabled = isFeatureEnabled("expenses.tracking");
      expect(enabled).toBe(true);
    });
    
    it("should disable beta features in production", () => {
      const enabled = isFeatureEnabled("expenses.mileage");
      expect(enabled).toBe(false);
    });
  });
});
```

---

## Part 5: Migration Path & Rollout Strategy

### 5.1 Migration Priority (Highest to Lowest Impact)

**Phase 1: Core Infrastructure (Week 1)**
```
Priority Score = (Files Affected) × (Frequency of Change) × (Fragmentation)

1. API Endpoints       [Score: 95] - Used in 30+ files, hardcoded everywhere
   Files: apiEndpoints.ts (client), routes.ts (server)
   → Consolidate to shared/config/api.ts
   
2. Feature Flags       [Score: 88] - Duplicated in client AND shared
   Files: featureToggles.ts (client), featureToggles.ts (shared), registry.ts
   → Single source in shared/config
   
3. Messages & Strings  [Score: 82] - Used in UI, emails, notifications, errors
   Files: messages.ts, errorConfig.ts, loading-messages.ts, etc.
   → Consolidate to shared/config/messages.ts
   
4. Business Rules      [Score: 78] - Overtime, breaks, shifts, compliance
   Files: platformConfig.ts (partial), individual service files
   → Centralize in shared/config/businessRules.ts
```

**Phase 2: UI Integration (Week 2-3)**
```
5. Navigation & Routes [Score: 72] - navigationConfig.ts in client
6. Pricing Tiers       [Score: 68] - pricing.ts in client, business logic scattered
7. Theme & Branding    [Score: 65] - theme.ts, logoConfig.ts in client
8. UI Constants        [Score: 60] - mobileConfig.ts, defaults.ts
```

**Phase 3: Cleanup & Polish (Week 4)**
```
9. Module Registry     [Score: 55] - moduleConfig.ts already fairly clean
10. Chat Server Config [Score: 48] - Already in server/config
11. Integration Config [Score: 35] - External APIs (Stripe, Gemini)
```

### 5.2 Migration Pseudocode by Phase

**Phase 1a: Consolidate API Endpoints**

```typescript
/**
 * BEFORE: Fragmented across files
 * 
 * client/src/config/apiEndpoints.ts - 336 lines
 * server/routes.ts - hardcoded paths throughout
 */

// Pseudocode for migration
FUNCTION migrateApiEndpoints():
  1. Read all API routes from:
     - client/src/config/apiEndpoints.ts (336 lines)
     - grep server/routes.ts for hardcoded "/api/*" paths
     - grep server/routes/*.ts for hardcoded paths
  
  2. Create shared/config/schemas/api.ts:
     - Define ApiEndpointsSchema with Zod
     - Add all routes as z.string() fields
     - Add descriptions for each endpoint
  
  3. Create shared/config/data/{dev,staging,prod}.ts:
     - For dev: baseUrl = "http://localhost:5173"
     - For staging: baseUrl = "https://staging-api.coaileague.com"
     - For prod: baseUrl = "https://api.coaileague.com"
     - Add all endpoint paths
  
  4. Update shared/config/registry.ts:
     - Import ApiEndpointsSchema
     - Add api: ApiEndpointsSchema to ConfigRegistry
     - Add get("api.auth.login") helper
  
  5. Replace in client:
     FIND: import { API_ENDPOINTS } from "@/config/apiEndpoints"
     REPLACE: import { get } from "@shared/config"
     FIND: API_ENDPOINTS.auth.login
     REPLACE: get("api.auth.login")
  
  6. Replace in server:
     FIND: "/api/auth/login"
     REPLACE: get("api.auth.login")
     Throughout all route handlers
  
  7. Deprecate old files:
     - Leave client/src/config/apiEndpoints.ts with:
       export { default } from "@shared/config" (re-export)
     - Keep for 1 release for backwards compatibility
  
  8. Test:
     - All routes still work
     - API calls successful
     - Feature gates work
     - Environment switching works
END

/**
 * AFTER: Unified in registry
 */
import { get } from "@shared/config";

// Client usage
export async function login(email, password) {
  const endpoint = get("api.auth.login");
  return fetch(endpoint, { /* ... */ });
}

// Server usage
app.post(get("api.auth.login"), (req, res) => {
  // handler
});
```

**Phase 1b: Consolidate Feature Flags**

```typescript
/**
 * BEFORE: Duplicated in multiple places
 * 
 * client/src/config/featureToggles.ts (200 lines)
 * shared/config/featureToggles.ts (96 lines)
 * shared/config/registry.ts (partial)
 */

FUNCTION migrateFeatureFlags():
  1. Audit current flags:
     - Extract from client/src/config/featureToggles.ts
     - Extract from shared/config/featureToggles.ts
     - Extract from shared/config/registry.ts
     - Merge into single canonical list
  
  2. Define FeaturesSchema in shared/config/schemas/features.ts:
     z.object({
       enabledFlags: z.record(z.boolean()),
       tierGates: z.record(z.enum(["free", "starter", "professional", "enterprise"])),
       abTests: z.record(z.object({
         enabled: z.boolean(),
         percentageUsers: z.number(), // 0-100
         controlGroup: z.string().optional(),
       })),
     })
  
  3. Add to shared/config/data/{env}.ts:
     DEV: all flags = true
     STAGING: flags matching prod (for testing)
     PROD: selective flags with tier gates
  
  4. Replace in code:
     FIND: import { isFeatureEnabled } from "@/config/featureToggles"
     REPLACE: import { isFeatureEnabled } from "@shared/config"
     FIND: featureToggles.ai.autoScheduling
     REPLACE: isFeatureEnabled("ai.autoScheduling")
  
  5. Remove duplication:
     - Keep shared/config/featureToggles.ts for backwards compat
     - Actually import from registry internally
  
  6. Test:
     - Feature gates work in components
     - Tier gates prevent access
     - Dev has all features
     - Prod has selective features
END
```

**Phase 1c: Consolidate Business Rules**

```typescript
/**
 * BEFORE: Scattered in multiple services
 */

FUNCTION migrateBusinessRules():
  1. Audit all business logic constants:
     - grep server/services for hardcoded numbers (8, 40, 1.5, etc.)
     - Identify: overtime thresholds, break requirements, shift limits
     - Compliance rules, billing tiers, grace periods
  
  2. Create shared/config/schemas/business-rules.ts:
     z.object({
       compliance: z.object({
         overtime: z.object({
           dailyThresholdHours,
           weeklyThresholdHours,
           overtimeMultiplier,
           doubleTimeMultiplier,
         }),
         breaks: z.object({
           minBreakAfterHours,
           minBreakDuration,
           mealBreakDuration,
           restBreakDuration,
         }),
         shifts: z.object({
           maxDailyHours,
           minRestBetweenShifts,
           maxConsecutiveDays,
         }),
       }),
       billing: z.object({
         tiers: z.record(...),
         gracePeriodDays: z.number(),
         trialPeriodDays: z.number(),
       }),
     })
  
  3. Move to shared/config/data/{env}.ts:
     - Consistent values across all environments
     - Comments explaining each rule
  
  4. Replace in services:
     FIND: const dailyThreshold = 8
     REPLACE: const dailyThreshold = get("businessRules.compliance.overtime.dailyThresholdHours")
     
     FIND: if (hours > 8)
     REPLACE: const max = get("businessRules.compliance.shifts.maxDailyHours")
              if (hours > max)
  
  5. Test:
     - Payroll calculations correct
     - Shift validation works
     - Break requirements enforced
     - Billing limits applied
END
```

### 5.3 Backwards Compatibility Strategy

**Deprecation Warning Flow**:

```typescript
/**
 * shared/config/deprecation.ts
 * 
 * For Phase 1a, maintain backwards compat
 */

import { CONFIG, get } from "./registry";

/**
 * Re-export for backwards compatibility
 * Removes in v3.0.0
 * 
 * @deprecated Use import { get } from "@shared/config" instead
 */
export const API_ENDPOINTS = {
  auth: {
    login: get("api.auth.login"),
    logout: get("api.auth.logout"),
    // ... etc
  },
  employees: {
    list: get("api.employees.list"),
    // ... etc
  },
};

// Usage in old code during transition period
export function deprecate(oldImport: string, newUsage: string) {
  console.warn(
    `[DEPRECATED] Importing from ${oldImport} ` +
    `is deprecated. Use: ${newUsage}`
  );
}

// In old files during transition:
// client/src/config/apiEndpoints.ts
deprecate(
  "client/src/config/apiEndpoints",
  'import { get } from "@shared/config"; const endpoint = get("api.auth.login")'
);
export { API_ENDPOINTS } from "@shared/config/deprecation";
```

### 5.4 Testing Strategy

**Test Plan Pseudocode**:

```typescript
/**
 * tests/config-migration.test.ts
 * 
 * Comprehensive tests for config system
 */

describe("Config Registry Migration Tests", () => {
  
  // 1. Schema Validation
  describe("Schema Validation", () => {
    test("API endpoints schema is valid", () => {
      const config = loadConfig();
      expect(config.api).toBeDefined();
      Object.entries(config.api).forEach(([key, value]) => {
        if (typeof value === "object") {
          Object.entries(value).forEach(([_, v]) => {
            expect(typeof v).toBe("string");
            expect(v).toMatch(/^\/api/);
          });
        }
      });
    });
    
    test("Business rules are valid numbers", () => {
      const config = loadConfig();
      expect(config.businessRules.compliance.overtime.dailyThresholdHours)
        .toBeGreaterThan(0);
      expect(config.businessRules.compliance.overtime.overtimeMultiplier)
        .toBeGreaterThan(1);
    });
  });
  
  // 2. Environment Switching
  describe("Environment Switching", () => {
    test("dev config has all features enabled", () => {
      process.env.NODE_ENV = "development";
      const config = loadConfig();
      const flags = config.businessRules.features.enabledFlags;
      Object.values(flags).forEach(enabled => {
        if (typeof enabled === "boolean") {
          expect(enabled).toBe(true);
        }
      });
    });
    
    test("prod config has selective features", () => {
      process.env.NODE_ENV = "production";
      const config = loadConfig();
      const flags = config.businessRules.features.enabledFlags;
      const hasFalse = Object.values(flags).some(v => v === false);
      expect(hasFalse).toBe(true); // At least one disabled
    });
  });
  
  // 3. Helper Functions
  describe("Helper Functions", () => {
    test("get() returns correct values", () => {
      const result = get("core.platform.name");
      expect(result).toBe("CoAIleague");
    });
    
    test("get() returns fallback for missing keys", () => {
      const result = get("nonexistent.key.path", "default");
      expect(result).toBe("default");
    });
    
    test("isFeatureEnabled() works correctly", () => {
      const enabled = isFeatureEnabled("ai.scheduling");
      expect(typeof enabled).toBe("boolean");
    });
    
    test("getModulesForTier() filters by tier", () => {
      const modules = getModulesForTier("starter");
      modules.forEach(m => {
        const tierRank = getTierRank(m.tier);
        expect(tierRank).toBeLessThanOrEqual(getTierRank("starter"));
      });
    });
  });
  
  // 4. Integration Tests
  describe("Integration with Components", () => {
    test("API endpoints work with fetch", async () => {
      const endpoint = get("api.auth.login");
      expect(endpoint).toBeDefined();
      expect(() => {
        new URL(endpoint, "http://localhost");
      }).not.toThrow();
    });
    
    test("Messages are used in notifications", () => {
      const msg = get("messages.errors.unauthorized");
      expect(msg).toBeTruthy();
      expect(typeof msg).toBe("string");
    });
  });
  
  // 5. Performance Tests
  describe("Performance", () => {
    test("loadConfig() is memoized", () => {
      const t1 = performance.now();
      const config1 = loadConfig();
      const t2 = performance.now();
      
      const t3 = performance.now();
      const config2 = loadConfig();
      const t4 = performance.now();
      
      // Second call should be faster (memoized)
      expect(t4 - t3).toBeLessThan(t2 - t1);
      expect(config1).toBe(config2); // Same reference
    });
    
    test("get() is fast for deeply nested values", () => {
      const t1 = performance.now();
      for (let i = 0; i < 1000; i++) {
        get("businessRules.compliance.overtime.dailyThresholdHours");
      }
      const t2 = performance.now();
      
      // Should complete in < 10ms
      expect(t2 - t1).toBeLessThan(10);
    });
  });
});
```

### 5.5 Rollout Timeline

```
Week 1: Foundation & Core APIs
├─ Mon-Tue: Create registry schema, environment loading
├─ Wed: Migrate API endpoints
├─ Thu: Migrate feature flags
├─ Fri: Integration testing, QA sign-off

Week 2-3: UI Integration
├─ Mon: Migrate navigation & routes
├─ Tue-Wed: Migrate pricing, themes, UI constants
├─ Thu: Migrate messages & strings
├─ Fri: End-to-end testing

Week 4: Polish & Documentation
├─ Mon-Tue: Migrate remaining config
├─ Wed: Deprecation warnings, backwards compat
├─ Thu: Final testing, production dry-run
├─ Fri: Release + monitoring

Week 5: Post-Release
├─ Monitor for config-related issues
├─ Gather developer feedback
├─ Document lessons learned
├─ Plan v2 improvements
```

### 5.6 Rollback Strategy

If issues occur:

```typescript
/**
 * Immediate Rollback (if critical issues)
 */

1. Identify failing endpoint/feature
2. Revert config change in shared/config/data/{env}.ts
3. Redeploy (< 2 minutes, no code change needed)
4. Monitor for recovery

/**
 * Example: API endpoint failed
 */

// Before rollback
shared/config/data/production.ts:
  api.employees.list: "/api/v2/employees" // NEW (broken)

// After rollback
shared/config/data/production.ts:
  api.employees.list: "/api/employees"    // OLD (works)

// No code deployment needed!
// Just update config, rebuild, deploy.
```

---

## Part 6: Success Criteria & Monitoring

### 6.1 Success Metrics

```
✅ Phase 1 Success:
  - 0 hardcoded API endpoints in routes.ts
  - 1 source of truth for feature flags (no duplication)
  - All business rules in one place
  - All tests passing
  - No performance degradation

✅ Phase 2 Success:
  - 95%+ of configuration in registry
  - Zero references to old config files
  - Feature flags working end-to-end
  - Navigation fully dynamic

✅ Phase 3 Success:
  - 100% config centralized
  - All old files deprecated
  - Developer productivity improved
  - Config changes don't require deploys
```

### 6.2 Monitoring & Alerts

```typescript
/**
 * server/monitoring.ts
 * 
 * Monitor config-related issues
 */

export const configMonitoring = {
  // Alert if config validation fails
  configValidationFailures: {
    threshold: 1,
    action: "Page + alert engineering",
  },
  
  // Alert if config load takes > 100ms
  configLoadTime: {
    threshold: 100, // ms
    action: "Investigate memoization",
  },
  
  // Alert if feature gate prevents access
  featureGateDenials: {
    threshold: 100, // per minute
    action: "Check tier gates, not intentional blocks",
  },
  
  // Alert if deprecated config files still imported
  deprecatedImports: {
    threshold: 1,
    action: "Update imports to use new registry",
  },
};
```

---

## Part 7: Future Enhancements (Post-Phase 3)

### 7.1 Runtime Config Updates (Phase 4)

```typescript
/**
 * Future: Update config without redeploy
 * 
 * Pseudocode for runtime config endpoint
 */

// Admin endpoint to update config
POST /api/admin/config
{
  "key": "businessRules.billing.gracePeriodDays",
  "value": 14,
  "environment": "production"
}

// Response: Config reloaded, no redeploy
{
  "status": "success",
  "changedKeys": 1,
  "previousValue": 7,
  "newValue": 14,
  "timestamp": "2024-01-15T10:30:00Z"
}

// Broadcast to all servers via event bus
ConfigUpdatedEvent {
  key: "businessRules.billing.gracePeriodDays",
  newValue: 14,
  previousValue: 7,
  timestamp: "2024-01-15T10:30:00Z"
}
```

### 7.2 Per-Workspace Config Overrides (Phase 5)

```typescript
/**
 * Future: Workspace-specific config
 * 
 * Override defaults for specific workspaces
 */

// Database table
workspace_config_overrides {
  id: uuid,
  workspaceId: uuid,
  configKey: string,         // "businessRules.compliance.overtime.dailyThresholdHours"
  configValue: any,          // 10 (custom for this workspace)
  effectiveFrom: timestamp,
  effectiveUntil: timestamp,
  createdBy: userId,
  createdAt: timestamp,
}

// Usage
const getWorkspaceConfig = (workspaceId, key) => {
  const override = db.query(
    "SELECT * FROM workspace_config_overrides WHERE workspaceId = ? AND configKey = ?"
  );
  if (override) return override.configValue;
  return get(key); // Fall back to global config
};

// Override daily threshold for one workspace
INSERT INTO workspace_config_overrides
VALUES (
  uuid(),
  "workspace-123",
  "businessRules.compliance.overtime.dailyThresholdHours",
  9, // This workspace uses 9 hours instead of default 8
  "2024-01-15T00:00:00Z",
  "2024-12-31T23:59:59Z",
  "user-admin-1",
  NOW()
);
```

### 7.3 A/B Testing Framework (Phase 6)

```typescript
/**
 * Future: A/B testing with config
 */

// Config with A/B variants
businessRules.features.abTests: {
  "newDashboard": {
    enabled: true,
    percentageUsers: 25, // 25% see new dashboard
    controlGroup: "oldDashboard",
    startDate: "2024-01-15",
    endDate: "2024-02-15",
    metrics: ["timeOnPage", "conversionRate"],
  }
}

// Usage in component
if (shouldShowVariant(userId, "newDashboard")) {
  return <NewDashboard />;
} else {
  return <OldDashboard />;
}

// Results after 2 weeks
{
  "variant": "newDashboard",
  "control": "oldDashboard",
  "users": {
    "variant": 2500,
    "control": 7500
  },
  "metrics": {
    "timeOnPage": {
      "variant": "4:30 minutes",
      "control": "3:20 minutes",
      "improvement": "+35%"
    },
    "conversionRate": {
      "variant": "12.5%",
      "control": "8.3%",
      "improvement": "+50.6%",
      "pValue": 0.001  // Statistically significant
    }
  },
  "recommendation": "Roll out to 100%"
}
```

---

## Appendix: Implementation Checklists

### Pre-Implementation Checklist

- [ ] All stakeholders reviewed this document
- [ ] Buy-in from backend, frontend, and DevOps teams
- [ ] Decide on timeline (1 month, phased rollout)
- [ ] Assign owner for each migration phase
- [ ] Create JIRA tickets for each phase
- [ ] Set up feature branch naming convention (`config/phase-1-api-endpoints`)
- [ ] Establish code review process
- [ ] Create rollback procedures
- [ ] Set up monitoring/alerts

### Phase 1 Implementation Checklist

**Week 1: Foundation**
- [ ] Create shared/config/schemas/ directory
- [ ] Create shared/config/data/ directory
- [ ] Write ApiEndpointsSchema
- [ ] Write FeaturesSchema
- [ ] Write BusinessRulesSchema
- [ ] Update ConfigRegistrySchema to include all new schemas
- [ ] Create dev/staging/production config data files
- [ ] Write comprehensive tests

**Week 2: Integration**
- [ ] Replace API_ENDPOINTS imports in client
- [ ] Replace featureToggles imports in client
- [ ] Replace hardcoded endpoints in server/routes.ts
- [ ] Replace hardcoded values in services
- [ ] Deprecate old config files
- [ ] Integration testing
- [ ] Performance testing

**Week 3: QA & Rollout**
- [ ] Staging deployment & testing
- [ ] Production deployment
- [ ] Monitor for issues
- [ ] Gather feedback

### Code Review Checklist for PRs

During migration PRs, reviewers should verify:

- [ ] All config values come from `get()` or `isFeatureEnabled()`
- [ ] No hardcoded strings/numbers outside config
- [ ] Config keys follow naming convention
- [ ] Zod schema is valid and documented
- [ ] Tests included for new config
- [ ] Backwards compatibility maintained
- [ ] Performance not degraded
- [ ] No secrets in config files
- [ ] Environment variables used for sensitive data

---

## Appendix: Code Templates for Developers

### Template 1: Adding a New Config Section

```typescript
/**
 * shared/config/schemas/new-feature.ts
 */

import { z } from "zod";

export const NewFeatureSchema = z.object({
  enabled: z.boolean().describe("Enable new feature"),
  
  settings: z.object({
    defaultValue: z.string(),
    maxRetries: z.number(),
    timeoutMs: z.number(),
  }),
  
  messages: z.object({
    success: z.string(),
    error: z.string(),
    loading: z.string(),
  }),
});

/**
 * shared/config/data/production.ts
 */

const PROD_CONFIG = {
  newFeature: {
    enabled: true,
    settings: {
      defaultValue: "production-default",
      maxRetries: 3,
      timeoutMs: 5000,
    },
    messages: {
      success: "Operation completed",
      error: "Operation failed",
      loading: "Processing...",
    },
  },
};
```

### Template 2: Using Config in React Component

```typescript
/**
 * client/src/components/MyFeature.tsx
 */

import { CONFIG, get, isFeatureEnabled } from "@shared/config";
import { useEffect, useState } from "react";

export function MyFeature() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  
  // Get config values
  const isEnabled = isFeatureEnabled("newFeature.enabled");
  const defaultValue = get("newFeature.settings.defaultValue");
  const timeoutMs = get("newFeature.settings.timeoutMs");
  const messages = get("newFeature.messages");
  const endpoint = get("api.newFeature.list");
  
  useEffect(() => {
    if (!isEnabled) return;
    
    const controller = new AbortController();
    const timeout = setTimeout(
      () => controller.abort(),
      timeoutMs
    );
    
    setLoading(true);
    
    fetch(endpoint, { signal: controller.signal })
      .then(r => r.json())
      .then(data => {
        setData(data);
        setError(null);
      })
      .catch(err => {
        setError(messages.error);
      })
      .finally(() => {
        setLoading(false);
        clearTimeout(timeout);
      });
    
    return () => controller.abort();
  }, [isEnabled, endpoint, timeoutMs, messages.error]);
  
  if (!isEnabled) {
    return <div>Feature disabled</div>;
  }
  
  if (loading) {
    return <div>{messages.loading}</div>;
  }
  
  if (error) {
    return <div>{error}</div>;
  }
  
  return <div>{JSON.stringify(data)}</div>;
}
```

### Template 3: Using Config in Backend Service

```typescript
/**
 * server/services/myFeatureService.ts
 */

import { get, isFeatureEnabled } from "@shared/config";

export class MyFeatureService {
  
  async process(input: string): Promise<Result> {
    // Check if feature is enabled
    if (!isFeatureEnabled("newFeature.enabled")) {
      throw new Error("Feature disabled");
    }
    
    // Get config values
    const defaultValue = get("newFeature.settings.defaultValue");
    const maxRetries = get("newFeature.settings.maxRetries");
    const timeoutMs = get("newFeature.settings.timeoutMs");
    
    // Get messages for logging/responses
    const messages = get("newFeature.messages");
    
    // Use config in business logic
    let attempts = 0;
    let lastError;
    
    while (attempts < maxRetries) {
      try {
        return await this.execute(input, timeoutMs);
      } catch (err) {
        lastError = err;
        attempts++;
      }
    }
    
    // Log failure with config message
    logger.error(messages.error, { lastError, attempts });
    throw lastError;
  }
  
  private async execute(input: string, timeoutMs: number): Promise<Result> {
    // Implementation
  }
}
```

---

## Summary

This design document provides a comprehensive blueprint for implementing the Universal Config & Registry System. Key highlights:

1. **Structure**: Single unified registry in `shared/config/registry.ts` with environment-aware data files
2. **Sections**: Core branding, API endpoints, UI constants, business rules, messages, integrations, modules
3. **Type Safety**: 100% Zod validation, full IDE auto-completion
4. **Integration**: Clear patterns for components, routes, services, database
5. **Developer Experience**: Naming conventions, easy additions, comprehensive testing
6. **Migration Path**: Phased approach prioritizing high-impact items (APIs, flags, rules)
7. **Backwards Compatibility**: Deprecation warnings, gradual migration
8. **Future**: Runtime updates, workspace overrides, A/B testing

**Implementation begins once this design is approved.**

