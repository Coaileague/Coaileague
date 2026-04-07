/**
 * Universal Dynamic Module Configuration
 * Replaces all OS-specific branding with dynamic, configurable modules
 * Enables runtime module enable/disable without hardcoding
 */

export interface ModuleDefinition {
  id: string;
  name: string;
  title: string;
  description: string;
  icon: string;
  route: string;
  enabled: boolean;
  category: 'core' | 'advanced' | 'integration' | 'admin';
  requiredTier: 'free' | 'trial' | 'starter' | 'professional' | 'business' | 'enterprise' | 'strategic';
  features: string[];
}

/**
 * Master module registry - All modules defined once, used everywhere
 * No hardcoded "OS" branding, pure functional configuration
 */
export const moduleRegistry: Record<string, ModuleDefinition> = {
  financial_management: {
    id: 'financial_management',
    name: 'Financial Management',
    title: 'Financial Dashboard',
    description: 'Budget planning, forecasting, and financial analysis',
    icon: 'DollarSign',
    route: '/financial-management',
    enabled: true,
    category: 'core',
    requiredTier: 'professional',
    features: ['budgets', 'forecasts', 'variance_analysis', 'financial_reports'],
  },
  learning_management: {
    id: 'learning_management',
    name: 'Learning Management',
    title: 'Learning & Development',
    description: 'Employee training, certifications, and skill development',
    icon: 'GraduationCap',
    route: '/learning-management',
    enabled: true,
    category: 'core',
    requiredTier: 'professional',
    features: ['courses', 'enrollments', 'certifications', 'analytics'],
  },
  diagnostics: {
    id: 'diagnostics',
    name: 'System Diagnostics',
    title: 'Admin Diagnostics',
    description: 'User diagnostics, audit logs, and session management',
    icon: 'Database',
    route: '/diagnostics',
    enabled: true,
    category: 'admin',
    requiredTier: 'enterprise',
    features: ['user_search', 'audit_logs', 'session_viewer', 'system_health'],
  },
  scheduling: {
    id: 'scheduling',
    name: 'Workforce Scheduling',
    title: 'Schedule Management',
    description: 'Create, manage, and optimize work schedules',
    icon: 'Calendar',
    route: '/scheduling',
    enabled: true,
    category: 'core',
    requiredTier: 'starter',
    features: ['schedule_creation', 'shift_management', 'approvals', 'analytics'],
  },
  payroll: {
    id: 'payroll',
    name: 'Payroll Management',
    title: 'Payroll Processing',
    description: 'Time tracking, payroll processing, and tax calculations',
    icon: 'CreditCard',
    route: '/payroll',
    enabled: true,
    category: 'core',
    requiredTier: 'starter',
    features: ['time_tracking', 'payroll_processing', 'tax_calculations', 'reports'],
  },
  engagement: {
    id: 'engagement',
    name: 'Employee Engagement',
    title: 'Engagement Suite',
    description: 'Surveys, ratings, suggestions, and employee recognition',
    icon: 'Users',
    route: '/engagement',
    enabled: true,
    category: 'core',
    requiredTier: 'professional',
    features: ['surveys', 'ratings', 'suggestions', 'recognition', 'analytics'],
  },
  communications: {
    id: 'communications',
    name: 'Communications Hub',
    title: 'Communications',
    description: 'Internal messaging, announcements, and team communication',
    icon: 'MessageSquare',
    route: '/communications',
    enabled: true,
    category: 'core',
    requiredTier: 'starter',
    features: ['messaging', 'announcements', 'broadcasts', 'channels'],
  },
  records: {
    id: 'records',
    name: 'Records Management',
    title: 'Records & Documents',
    description: 'Employee records, documents, and compliance documentation',
    icon: 'FileText',
    route: '/records',
    enabled: true,
    category: 'core',
    requiredTier: 'starter',
    features: ['employee_records', 'documents', 'compliance', 'storage'],
  },
  insights: {
    id: 'insights',
    name: 'Business Insights',
    title: 'Analytics & Insights',
    description: 'Business intelligence, analytics, and performance metrics',
    icon: 'BarChart3',
    route: '/insights',
    enabled: true,
    category: 'core',
    requiredTier: 'professional',
    features: ['analytics', 'dashboards', 'metrics', 'reports', 'forecasting'],
  },
};

/**
 * Get a specific module definition
 */
export function getModule(moduleId: string): ModuleDefinition | undefined {
  return moduleRegistry[moduleId];
}

/**
 * Get all enabled modules for a subscription tier
 */
export function getModulesByTier(tier: 'free' | 'trial' | 'starter' | 'professional' | 'business' | 'enterprise' | 'strategic'): ModuleDefinition[] {
  const tierRanks = { free: 0, trial: 0, starter: 1, professional: 2, business: 3, enterprise: 4, strategic: 5 };
  const userRank = tierRanks[tier];
  
  return Object.values(moduleRegistry).filter(
    module => module.enabled && tierRanks[module.requiredTier] <= userRank
  );
}

/**
 * Get all modules in a category
 */
export function getModulesByCategory(category: 'core' | 'advanced' | 'integration' | 'admin'): ModuleDefinition[] {
  return Object.values(moduleRegistry).filter(module => module.category === category && module.enabled);
}

/**
 * Check if a module is available for a user's tier
 */
export function isModuleAvailable(moduleId: string, userTier: 'free' | 'trial' | 'starter' | 'professional' | 'business' | 'enterprise' | 'strategic'): boolean {
  const module = getModule(moduleId);
  if (!module || !module.enabled) return false;
  
  const tierRanks = { free: 0, trial: 0, starter: 1, professional: 2, business: 3, enterprise: 4, strategic: 5 };
  return tierRanks[module.requiredTier] <= tierRanks[userTier];
}

/**
 * Export helper for React components
 */
export const useModules = () => {
  return {
    getModule,
    getModulesByTier,
    getModulesByCategory,
    isModuleAvailable,
    all: Object.values(moduleRegistry),
    enabled: Object.values(moduleRegistry).filter(m => m.enabled),
  };
};
