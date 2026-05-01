import {
  LayoutDashboard,
  Calendar,
  Clock,
  FileText,
  DollarSign,
  Users,
  Building2,
  BarChart3,
  Settings,
  Shield,
  MessageSquare,
  Briefcase,
  type LucideIcon,
} from "lucide-react";

export type WorkspaceRole = 
  | 'org_owner' 
  | 'co_owner' 
  | 'department_manager' 
  | 'supervisor' 
  | 'staff' 
  | 'auditor' 
  | 'contractor';

export type PlatformRole = 
  | 'root_admin' 
  | 'deputy_admin' 
  | 'sysop' 
  | 'support_manager' 
  | 'support_agent' 
  | 'compliance_officer' 
  | 'none';

export type SubscriptionTier = 'free' | 'trial' | 'starter' | 'professional' | 'business' | 'enterprise' | 'strategic';

export interface NavItem {
  label: string;
  href: string;
  icon: LucideIcon;
  requiredRoles?: WorkspaceRole[];
  requiredTier?: SubscriptionTier;
  badge?: string;
  description?: string;
}

export interface NavSection {
  title: string;
  items: NavItem[];
}

export const roleHierarchy: Record<WorkspaceRole, number> = {
  org_owner: 100,
  co_owner: 90,
  department_manager: 80,
  supervisor: 60,
  staff: 40,
  auditor: 50,
  contractor: 30,
};

export const tierHierarchy: Record<SubscriptionTier, number> = {
  strategic: 7,
  enterprise: 6,
  business: 5,
  professional: 4,
  starter: 3,
  trial: 2,
  free: 1,
};

export function hasAccess(
  userRole: WorkspaceRole,
  requiredRoles?: WorkspaceRole[]
): boolean {
  if (!requiredRoles || requiredRoles.length === 0) return true;
  
  const userLevel = roleHierarchy[userRole];
  return requiredRoles.some(role => {
    const requiredLevel = roleHierarchy[role];
    return userLevel >= requiredLevel;
  });
}

export function hasTierAccess(
  currentTier: SubscriptionTier,
  requiredTier?: SubscriptionTier
): boolean {
  if (!requiredTier) return true;
  
  const currentLevel = tierHierarchy[currentTier];
  const requiredLevel = tierHierarchy[requiredTier];
  return currentLevel >= requiredLevel;
}

export const mainNavigation: NavSection[] = [
  {
    title: "Overview",
    items: [
      {
        label: "Dashboard",
        href: "/dashboard",
        icon: LayoutDashboard,
        description: "Your personalized overview",
      },
    ],
  },
  {
    title: "Operations",
    items: [
      {
        label: "Schedules",
        href: "/schedule",
        icon: Calendar,
        description: "View and manage work schedules",
      },
      {
        label: "Timesheets",
        href: "/timesheets/pending",
        icon: Clock,
        description: "Track and approve hours",
      },
      {
        label: "Pending Approvals",
        href: "/timesheets/pending",
        icon: Clock,
        requiredRoles: ['org_owner', 'department_manager', 'supervisor'],
        badge: "Manager",
        description: "Review and approve submitted hours",
      },
    ],
  },
  {
    title: "Billing & Payroll",
    items: [
      {
        label: "Invoices",
        href: "/invoices",
        icon: FileText,
        requiredRoles: ['org_owner', 'co_owner', 'department_manager'],
        description: "Client billing and invoices",
      },
      {
        label: "Payroll",
        href: "/payroll",
        icon: DollarSign,
        requiredRoles: ['org_owner', 'co_owner'],
        requiredTier: 'professional',
        description: "Employee payroll processing",
      },
    ],
  },
  {
    title: "Management",
    items: [
      {
        label: "Employees",
        href: "/employees",
        icon: Users,
        requiredRoles: ['org_owner', 'co_owner', 'department_manager'],
        description: "Manage workforce",
      },
      {
        label: "Clients",
        href: "/clients",
        icon: Building2,
        requiredRoles: ['org_owner', 'co_owner', 'department_manager'],
        description: "Manage client relationships",
      },
    ],
  },
  {
    title: "Analytics",
    items: [
      {
        label: "Reports",
        href: "/reports",
        icon: BarChart3,
        requiredRoles: ['org_owner', 'co_owner', 'department_manager'],
        description: "Analytics and insights",
      },
      {
        label: "Advanced Analytics",
        href: "/analytics",
        icon: BarChart3,
        requiredRoles: ['org_owner', 'co_owner'],
        requiredTier: 'enterprise',
        badge: "Enterprise",
        description: "AI-powered predictive analytics",
      },
    ],
  },
  {
    title: "Communications",
    items: [
      {
        label: "Messages",
        href: "/messages",
        icon: MessageSquare,
        description: "Team communications",
      },
    ],
  },
  {
    title: "Compliance",
    items: [
      {
        label: "Audit Logs",
        href: "/audit-logs",
        icon: Shield,
        requiredRoles: ['org_owner', 'co_owner', 'auditor'],
        description: "Compliance and activity tracking",
      },
    ],
  },
  {
    title: "Settings",
    items: [
      {
        label: "Workspace Settings",
        href: "/settings",
        icon: Settings,
        requiredRoles: ['org_owner', 'co_owner'],
        description: "Configure workspace preferences",
      },
      {
        label: "My Profile",
        href: "/profile",
        icon: Users,
        description: "Personal settings and preferences",
      },
    ],
  },
];

export const platformNavigation: NavSection[] = [
  {
    title: "Platform Support",
    items: [
      {
        label: "Support Dashboard",
        href: "/support",
        icon: Shield,
        description: "Multi-tenant support view",
      },
      {
        label: "All Workspaces",
        href: "/org-management",
        icon: Building2,
        description: "Browse all organizations",
      },
      {
        label: "System Monitoring",
        href: "/system-health",
        icon: BarChart3,
        description: "Platform health and metrics",
      },
    ],
  },
];

export function getNavigationForRole(
  role: WorkspaceRole,
  tier: SubscriptionTier,
  isPlatformStaff: boolean = false
): NavSection[] {
  if (isPlatformStaff) {
    return [...platformNavigation, ...mainNavigation];
  }

  return mainNavigation.map(section => ({
    ...section,
    items: section.items.filter(item => {
      const roleAccess = hasAccess(role, item.requiredRoles);
      const tierAccess = hasTierAccess(tier, item.requiredTier);
      return roleAccess && tierAccess;
    }),
  })).filter(section => section.items.length > 0);
}

export function getLockedFeatures(
  role: WorkspaceRole,
  tier: SubscriptionTier
): NavItem[] {
  const locked: NavItem[] = [];

  mainNavigation.forEach(section => {
    section.items.forEach(item => {
      const roleAccess = hasAccess(role, item.requiredRoles);
      const tierAccess = hasTierAccess(tier, item.requiredTier);
      
      if (roleAccess && !tierAccess && item.requiredTier) {
        locked.push({
          ...item,
          badge: item.requiredTier.charAt(0).toUpperCase() + item.requiredTier.slice(1),
        });
      }
    });
  });

  return locked;
}

export function getTierUpgradePath(currentTier: SubscriptionTier): {
  nextTier: SubscriptionTier | null;
  newFeatures: string[];
  estimatedPrice: string;
} {
  const upgradePaths: Record<SubscriptionTier, {
    nextTier: SubscriptionTier | null;
    newFeatures: string[];
    estimatedPrice: string;
  }> = {
    free: {
      nextTier: 'starter',
      newFeatures: [
        'Unlimited employees and clients',
        'Automated invoice generation',
        'Smart shift scheduling',
        'Advanced time tracking',
      ],
      estimatedPrice: '$199/month',
    },
    trial: {
      nextTier: 'starter',
      newFeatures: [
        'Full platform access beyond trial',
        'Unlimited AI interactions',
        'Automated payroll and invoicing',
      ],
      estimatedPrice: '$199/month',
    },
    starter: {
      nextTier: 'professional',
      newFeatures: [
        'Automated payroll processing',
        'AI-powered support bot',
        'Advanced reporting',
        'Custom branding',
      ],
      estimatedPrice: '$749/month',
    },
    professional: {
      nextTier: 'business',
      newFeatures: [
        'Up to 75 officers',
        '60K AI interactions/month',
        'Priority support',
        'Advanced analytics',
      ],
      estimatedPrice: '$2,249/month',
    },
    business: {
      nextTier: 'enterprise',
      newFeatures: [
        'Up to 200 officers',
        '120K AI interactions/month',
        'White-label customization',
        'Dedicated account manager',
        'SLA guarantees',
      ],
      estimatedPrice: '$6,999/month',
    },
    enterprise: {
      nextTier: 'strategic',
      newFeatures: [
        '300+ officers',
        '500K+ AI interactions/month',
        'Custom integrations',
        'Dedicated infrastructure',
      ],
      estimatedPrice: 'Contact sales',
    },
    strategic: {
      nextTier: null,
      newFeatures: [],
      estimatedPrice: '',
    },
  };

  return upgradePaths[currentTier];
}
