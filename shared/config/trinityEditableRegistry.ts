/**
 * Trinity Editable Registry
 * 
 * This file defines what Trinity AI can and cannot edit.
 * Components marked as editable are safe for Trinity to modify.
 * Components marked as protected must NEVER be modified by automation.
 * 
 * TRINITY-EDITABLE: registry
 */

export interface EditableModule {
  id: string;
  name: string;
  description: string;
  category: 'ui' | 'config' | 'content' | 'layout' | 'theme';
  files: string[];
  dataAttribute: string;
  safeToEdit: boolean;
}

export interface ProtectedModule {
  id: string;
  name: string;
  reason: string;
  files: string[];
  neverModify: true;
}

// ============================================================================
// EDITABLE MODULES - Trinity can safely modify these
// ============================================================================
export const TRINITY_EDITABLE_MODULES: EditableModule[] = [
  {
    id: 'theme-colors',
    name: 'Theme Colors',
    description: 'Application color palette and theming',
    category: 'theme',
    files: ['client/src/index.css', 'tailwind.config.ts'],
    dataAttribute: 'data-trinity-surface="theme"',
    safeToEdit: true,
  },
  {
    id: 'layout-config',
    name: 'Layout Configuration',
    description: 'Dashboard layouts, sidebar width, spacing',
    category: 'layout',
    files: ['client/src/components/app-sidebar.tsx', 'client/src/components/dashboard-shell.tsx'],
    dataAttribute: 'data-trinity-surface="layout"',
    safeToEdit: true,
  },
  {
    id: 'navigation',
    name: 'Navigation Config',
    description: 'Menu items, route labels, icons',
    category: 'config',
    files: ['client/src/config/navigationConfig.ts'],
    dataAttribute: 'data-trinity-surface="navigation"',
    safeToEdit: true,
  },
  {
    id: 'notifications-ui',
    name: 'Notifications UI',
    description: 'Notification popover styling and layout',
    category: 'ui',
    files: ['client/src/components/notifications-popover.tsx'],
    dataAttribute: 'data-trinity-surface="notifications"',
    safeToEdit: true,
  },
  {
    id: 'landing-content',
    name: 'Landing Page Content',
    description: 'Marketing copy, hero text, feature descriptions',
    category: 'content',
    files: ['client/src/pages/landing.tsx', 'client/src/pages/pricing.tsx'],
    dataAttribute: 'data-trinity-surface="content"',
    safeToEdit: true,
  },
  {
    id: 'dashboard-widgets',
    name: 'Dashboard Widgets',
    description: 'Widget layout, order, visibility',
    category: 'ui',
    files: ['client/src/components/dashboard/*.tsx'],
    dataAttribute: 'data-trinity-surface="widgets"',
    safeToEdit: true,
  },
  {
    id: 'form-labels',
    name: 'Form Labels & Messages',
    description: 'Form field labels, validation messages, tooltips',
    category: 'content',
    files: ['client/src/config/messages.ts'],
    dataAttribute: 'data-trinity-surface="forms"',
    safeToEdit: true,
  },
  {
    id: 'animation-config',
    name: 'Animation Settings',
    description: 'Animation timing, effects, transitions',
    category: 'ui',
    files: ['client/src/components/animation-layer.tsx'],
    dataAttribute: 'data-trinity-surface="animation"',
    safeToEdit: true,
  },
];

// ============================================================================
// PROTECTED MODULES - Trinity must NEVER modify these
// ============================================================================
export const TRINITY_PROTECTED_MODULES: ProtectedModule[] = [
  {
    id: 'auth',
    name: 'Authentication System',
    reason: 'Handles passwords, sessions, MFA - security critical',
    files: [
      'server/auth.ts',
      'server/middleware.ts',
      'server/routes/auth-routes.ts',
      'client/src/hooks/useAuth.ts',
    ],
    neverModify: true,
  },
  {
    id: 'payments',
    name: 'Payment Processing',
    reason: 'Handles real money via Stripe - financial critical',
    files: [
      'server/routes/billing-routes.ts',
      'server/services/stripeService.ts',
      'server/services/payrollService.ts',
    ],
    neverModify: true,
  },
  {
    id: 'encryption',
    name: 'Encryption & Secrets',
    reason: 'Manages API keys, credentials, encryption',
    files: [
      'server/services/encryptionService.ts',
      'server/services/credentialManager.ts',
    ],
    neverModify: true,
  },
  {
    id: 'rbac',
    name: 'Role-Based Access Control',
    reason: 'Enforces permissions and data isolation',
    files: [
      'server/services/rbacService.ts',
      'server/middleware.ts',
      'shared/rbac.ts',
    ],
    neverModify: true,
  },
  {
    id: 'database-schema',
    name: 'Database Schema',
    reason: 'Core data structure - requires migrations',
    files: [
      'shared/schema.ts',
      'migrations/*',
      'drizzle.config.ts',
    ],
    neverModify: true,
  },
  {
    id: 'audit-logging',
    name: 'Audit Logging',
    reason: 'Compliance and security audit trail',
    files: [
      'server/services/auditService.ts',
    ],
    neverModify: true,
  },
];

// ============================================================================
// GUARD RAIL SIMPLIFICATION NOTES
// ============================================================================
// The platform has been audited for redundant validation. Remaining guard rails are:
//
// KEPT (Essential):
// - Auth/session validation → security critical
// - Payment processing checks → financial protection  
// - RBAC permission checks → access control
// - Audit logging → compliance requirement
// - AI rate limits → cost control (env-configurable)
//
// REMOVED/SIMPLIFIED:
// - Theme/UI restrictions → now fully editable via themeConfig.ts
// - Layout constraints → now centralized in registry.ts
// - Component tier restrictions → simplified to single registry
// - Hardcoded values → replaced with environment variables
//
// All non-security configuration is now editable through:
// - shared/config/themeConfig.ts (colors, spacing, typography)
// - shared/config/registry.ts (branding, navigation, copy)
// - shared/config/aiBrainGuardrails.ts (AI limits via env vars)
// ============================================================================

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Check if a file path is safe for Trinity to edit
 */
export function isTrinityEditable(filePath: string): boolean {
  const normalizedPath = filePath.replace(/\\/g, '/');
  
  // Check if it's in a protected module
  for (const module of TRINITY_PROTECTED_MODULES) {
    for (const file of module.files) {
      if (file.includes('*')) {
        const pattern = file.replace('*', '');
        if (normalizedPath.includes(pattern)) return false;
      } else if (normalizedPath.includes(file)) {
        return false;
      }
    }
  }
  
  return true;
}

/**
 * Get the data attribute for a file
 */
export function getTrinityDataAttribute(filePath: string): string | null {
  const normalizedPath = filePath.replace(/\\/g, '/');
  
  for (const module of TRINITY_EDITABLE_MODULES) {
    for (const file of module.files) {
      if (file.includes('*')) {
        const pattern = file.replace('*', '');
        if (normalizedPath.includes(pattern)) return module.dataAttribute;
      } else if (normalizedPath.includes(file)) {
        return module.dataAttribute;
      }
    }
  }
  
  return null;
}

/**
 * Get all editable modules for Trinity dashboard
 */
export function getEditableModulesForTrinity(): EditableModule[] {
  return TRINITY_EDITABLE_MODULES.filter(m => m.safeToEdit);
}

/**
 * Get protected modules list (for documentation)
 */
export function getProtectedModules(): ProtectedModule[] {
  return TRINITY_PROTECTED_MODULES;
}

export default {
  TRINITY_EDITABLE_MODULES,
  TRINITY_PROTECTED_MODULES,
  isTrinityEditable,
  getTrinityDataAttribute,
  getEditableModulesForTrinity,
  getProtectedModules,
};
