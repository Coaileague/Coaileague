/**
 * Workspace Feature Configuration
 * Defines which features/tools are available to each role type
 */

export type PlatformRole = 'root_admin' | 'support_manager' | 'support_agent' | 'none';
export type WorkspaceRole = 'org_owner' | 'department_manager' | 'staff' | 'auditor';

export interface WorkspaceFeature {
  id: string;
  label: string;
  icon: string;
  path: string;
  description?: string;
  platformRoles?: PlatformRole[];
  workspaceRoles?: WorkspaceRole[];
}

/**
 * All available workspace features
 * Each feature specifies which roles can access it
 */
export const WORKSPACE_FEATURES: WorkspaceFeature[] = [
  // Platform Support Features
  {
    id: 'platform-admin',
    label: 'Platform Admin',
    icon: 'Shield',
    path: '/admin',
    description: 'Platform administration and organization management',
    platformRoles: ['root_admin'],
  },
  {
    id: 'support-queue',
    label: 'Support Queue',
    icon: 'Headphones',
    path: '/admin-support',
    description: 'Manage support tickets and help requests',
    platformRoles: ['root_admin', 'support_manager', 'support_agent'],
  },
  {
    id: 'sales-portal',
    label: 'Sales',
    icon: 'TrendingUp',
    path: '/platform/sales',
    description: 'Lead management and sales tracking',
    platformRoles: ['root_admin'],
  },
  
  // Organization Management Features
  {
    id: 'analytics',
    label: 'Analytics',
    icon: 'BarChart3',
    path: '/analytics',
    description: 'Workspace metrics and insights',
    workspaceRoles: ['org_owner', 'department_manager'],
  },
  {
    id: 'employees',
    label: 'Employees',
    icon: 'Users',
    path: '/employees',
    description: 'Employee management and onboarding',
    workspaceRoles: ['org_owner', 'department_manager'],
  },
  {
    id: 'clients',
    label: 'Clients',
    icon: 'Building2',
    path: '/clients',
    description: 'Client relationship management',
    workspaceRoles: ['org_owner', 'department_manager'],
  },
  {
    id: 'scheduling',
    label: 'Scheduling',
    icon: 'Calendar',
    path: '/schedule',
    description: 'Shift scheduling and calendar',
    workspaceRoles: ['org_owner', 'department_manager'],
  },
  {
    id: 'time-tracking',
    label: 'Time Tracking',
    icon: 'Clock',
    path: '/time-tracking',
    description: 'GPS-verified clock in/out',
    workspaceRoles: ['org_owner', 'department_manager', 'staff'],
  },
  {
    id: 'approvals',
    label: 'Approvals',
    icon: 'CheckCircle',
    path: '/timesheets/pending',
    description: 'Review and approve time entries',
    workspaceRoles: ['org_owner', 'department_manager'],
  },
  {
    id: 'invoices',
    label: 'Invoices',
    icon: 'FileText',
    path: '/invoices',
    description: 'Client billing and invoices',
    workspaceRoles: ['org_owner', 'department_manager', 'auditor'],
  },
  {
    id: 'payroll',
    label: 'Payroll',
    icon: 'DollarSign',
    path: '/payroll',
    description: 'Employee payroll management',
    workspaceRoles: ['org_owner', 'department_manager', 'auditor'],
  },
  {
    id: 'expenses',
    label: 'Expenses',
    icon: 'Receipt',
    path: '/expenses',
    description: 'Expense tracking and reimbursement',
    workspaceRoles: ['org_owner', 'department_manager', 'staff'],
  },
  {
    id: 'compliance',
    label: 'Compliance',
    icon: 'ShieldCheck',
    path: '/i9-records',
    description: 'I-9 verification and compliance',
    workspaceRoles: ['org_owner', 'department_manager', 'auditor'],
  },
  {
    id: 'policies',
    label: 'Policies',
    icon: 'Book',
    path: '/policies',
    description: 'Policy management and acknowledgments',
    workspaceRoles: ['org_owner', 'department_manager'],
  },
  {
    id: 'communication',
    label: 'Communication',
    icon: 'MessageSquare',
    path: '/communication-rooms',
    description: 'Team chat and collaboration',
    workspaceRoles: ['org_owner', 'department_manager', 'staff'],
  },
  {
    id: 'assets',
    label: 'Assets',
    icon: 'Truck',
    path: '/assets',
    description: 'Vehicle and equipment tracking',
    workspaceRoles: ['org_owner', 'department_manager'],
  },
  
  // Employee Self-Service Features
  {
    id: 'my-schedule',
    label: 'My Schedule',
    icon: 'Calendar',
    path: '/my-schedule',
    description: 'View your upcoming shifts',
    workspaceRoles: ['staff'],
  },
  {
    id: 'my-time',
    label: 'My Time',
    icon: 'Clock',
    path: '/time-tracking',
    description: 'Track your hours',
    workspaceRoles: ['staff'],
  },
  {
    id: 'my-expenses',
    label: 'My Expenses',
    icon: 'Receipt',
    path: '/expenses',
    description: 'Submit expense reports',
    workspaceRoles: ['staff'],
  },
  
  // Universal Features (all authenticated users)
  {
    id: 'help',
    label: 'Help & Support',
    icon: 'HelpCircle',
    path: '/chat',
    description: 'Get help and support',
  },
];

/**
 * Get features available to a specific role combination
 */
export function getFeaturesForRole(
  platformRole: PlatformRole | null,
  workspaceRole: WorkspaceRole | null
): WorkspaceFeature[] {
  return WORKSPACE_FEATURES.filter(feature => {
    // Universal features (no role restrictions)
    if (!feature.platformRoles && !feature.workspaceRoles) {
      return true;
    }
    
    // Check platform role access
    if (feature.platformRoles && platformRole) {
      if (feature.platformRoles.includes(platformRole)) {
        return true;
      }
    }
    
    // Check workspace role access
    if (feature.workspaceRoles && workspaceRole) {
      if (feature.workspaceRoles.includes(workspaceRole)) {
        return true;
      }
    }
    
    return false;
  });
}

/**
 * Check if a user has access to a specific feature
 */
export function hasFeatureAccess(
  featureId: string,
  platformRole: PlatformRole | null,
  workspaceRole: WorkspaceRole | null
): boolean {
  const features = getFeaturesForRole(platformRole, workspaceRole);
  return features.some(f => f.id === featureId);
}
