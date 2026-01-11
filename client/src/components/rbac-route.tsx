/**
 * Unified RBACRoute Component
 * ============================
 * A consolidated route guard that replaces scattered ProtectedRoute, PlatformAdminRoute,
 * LeaderRoute, and OwnerRoute components with a single capability-driven system.
 * 
 * Usage:
 * <RBACRoute require="authenticated">...</RBACRoute>
 * <RBACRoute require="platform_admin">...</RBACRoute>
 * <RBACRoute require="leader" fallbackPath="/dashboard">...</RBACRoute>
 * <RBACRoute require={["owner", "platform_staff"]}>...</RBACRoute>
 */

import { useAuth } from "@/hooks/useAuth";
import { useWorkspaceAccess } from "@/hooks/useWorkspaceAccess";
import { useUniversalLoadingGate } from "@/contexts/universal-loading-gate";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ShieldAlert, Lock, ArrowLeft, Home } from "lucide-react";
import { Link, useLocation } from "wouter";
import { navConfig } from "@/config/navigationConfig";
import { ColorfulCelticKnot } from "@/components/ui/colorful-celtic-knot";

export type RBACCapability = 
  | 'authenticated'      
  | 'platform_admin'     
  | 'platform_staff'     
  | 'owner'              
  | 'admin'              
  | 'leader'             
  | 'supervisor'         
  | 'employee'           
  | 'auditor'            
  | 'contractor';        

interface RoleCheckResult {
  hasAccess: boolean;
  reason?: string;
  missingCapability?: RBACCapability;
}

const PLATFORM_ADMIN_ROLES = ['root_admin', 'deputy_admin'];
const PLATFORM_STAFF_ROLES = ['root_admin', 'deputy_admin', 'sysop', 'support_manager', 'support_agent'];
const OWNER_ROLES = ['org_owner', 'org_admin'];
const LEADER_ROLES = ['org_owner', 'department_manager'];
const SUPERVISOR_ROLES = ['org_owner', 'org_admin', 'department_manager', 'supervisor'];

function checkCapability(
  capability: RBACCapability,
  user: any,
  isAuthenticated: boolean
): boolean {
  if (!isAuthenticated || !user) return false;
  
  const platformRole = user.platformRole || '';
  const workspaceRole = user.workspaceRole || '';
  
  const isPlatformAdmin = PLATFORM_ADMIN_ROLES.includes(platformRole);
  const isPlatformStaff = PLATFORM_STAFF_ROLES.includes(platformRole);
  
  switch (capability) {
    case 'authenticated':
      return isAuthenticated;
      
    case 'platform_admin':
      return isPlatformAdmin;
      
    case 'platform_staff':
      return isPlatformStaff;
      
    case 'owner':
      return OWNER_ROLES.includes(workspaceRole) || isPlatformStaff;
      
    case 'admin':
      return ['org_owner', 'org_admin'].includes(workspaceRole) || isPlatformStaff;
      
    case 'leader':
      return LEADER_ROLES.includes(workspaceRole) || isPlatformStaff;
      
    case 'supervisor':
      return SUPERVISOR_ROLES.includes(workspaceRole) || isPlatformStaff;
      
    case 'employee':
      return !!workspaceRole || isPlatformStaff;
      
    case 'auditor':
      return workspaceRole === 'auditor' || isPlatformStaff;
      
    case 'contractor':
      return workspaceRole === 'contractor' || isPlatformStaff;
      
    default:
      return false;
  }
}

function checkAccess(
  require: RBACCapability | RBACCapability[],
  user: any,
  isAuthenticated: boolean
): RoleCheckResult {
  if (!isAuthenticated) {
    return {
      hasAccess: false,
      reason: 'Authentication required',
      missingCapability: 'authenticated'
    };
  }
  
  const capabilities = Array.isArray(require) ? require : [require];
  
  for (const capability of capabilities) {
    if (checkCapability(capability, user, isAuthenticated)) {
      return { hasAccess: true };
    }
  }
  
  return {
    hasAccess: false,
    reason: `Requires one of: ${capabilities.join(', ')}`,
    missingCapability: capabilities[0]
  };
}

const CAPABILITY_MESSAGES: Record<RBACCapability, { title: string; description: string; message: string }> = {
  authenticated: {
    title: 'Authentication Required',
    description: 'Protected Area',
    message: 'Please log in to access this page.'
  },
  platform_admin: {
    title: 'Platform Admin Access Required',
    description: 'Restricted Area',
    message: 'This area is restricted to platform administrators only. You need root_admin or deputy_admin privileges.'
  },
  platform_staff: {
    title: 'Platform Staff Access Required',
    description: 'Restricted Area',
    message: 'This area is restricted to platform staff members only.'
  },
  owner: {
    title: 'Owner Access Required',
    description: 'Business Owner Area',
    message: 'This area is restricted to workspace Owners and Admins only.'
  },
  admin: {
    title: 'Admin Access Required',
    description: 'Admin Area',
    message: 'This area is restricted to workspace administrators only.'
  },
  leader: {
    title: 'Leader Access Required',
    description: 'Leaders Hub',
    message: 'This area is restricted to workspace Owners and Managers only.'
  },
  supervisor: {
    title: 'Supervisor Access Required',
    description: 'Supervisory Area',
    message: 'This area is restricted to supervisors and above.'
  },
  employee: {
    title: 'Employee Access Required',
    description: 'Employee Area',
    message: 'This area requires an active workspace membership.'
  },
  auditor: {
    title: 'Auditor Access Required',
    description: 'Audit Area',
    message: 'This area is restricted to auditors only.'
  },
  contractor: {
    title: 'Contractor Access Required',
    description: 'Contractor Area',
    message: 'This area is restricted to contractors only.'
  }
};

interface RBACRouteProps {
  children: React.ReactNode;
  require: RBACCapability | RBACCapability[];
  fallbackPath?: string;
  showDeniedCard?: boolean;
  loadingComponent?: React.ReactNode;
}

export function RBACRoute({
  children,
  require,
  fallbackPath = '/dashboard',
  showDeniedCard = true,
  loadingComponent
}: RBACRouteProps) {
  const { user, isAuthenticated, isLoading: authLoading } = useAuth();
  const { workspaceRole, platformRole, isLoading: workspaceLoading } = useWorkspaceAccess();
  const { isLoadingBlocked } = useUniversalLoadingGate();
  const [, navigate] = useLocation();
  
  const isLoading = authLoading || workspaceLoading;
  
  // CRITICAL FIX: On public routes (isLoadingBlocked=true), always render children
  // This allows unauthenticated users to see the homepage and other public pages
  if (isLoadingBlocked) {
    return <>{children}</>;
  }
  
  if (isLoading) {
    if (loadingComponent) {
      return <>{loadingComponent}</>;
    }
    return (
      <div className="h-screen flex flex-col items-center justify-center bg-background gap-3">
        <ColorfulCelticKnot size="lg" state="thinking" animated={true} animationSpeed="fast" />
        <span className="text-sm text-muted-foreground">Loading...</span>
      </div>
    );
  }
  
  // Merge workspace access roles with user object for role checking
  const userWithRoles = {
    ...user,
    workspaceRole: workspaceRole || (user as any)?.workspaceRole,
    platformRole: platformRole || (user as any)?.platformRole,
  };
  
  const result = checkAccess(require, userWithRoles, isAuthenticated);
  
  if (!result.hasAccess) {
    // Not authenticated - redirect to login
    if (!isAuthenticated) {
      if (typeof window !== 'undefined') {
        window.location.href = navConfig.auth.login;
      }
      return (
        <div className="h-screen flex flex-col items-center justify-center bg-background gap-3">
          <ColorfulCelticKnot size="lg" state="warning" animated={true} animationSpeed="normal" />
          <span className="text-sm text-muted-foreground">Redirecting...</span>
        </div>
      );
    }
    
    if (!showDeniedCard) {
      if (typeof window !== 'undefined') {
        navigate(fallbackPath);
      }
      return null;
    }
    
    const capability = result.missingCapability || 'authenticated';
    const messages = CAPABILITY_MESSAGES[capability];
    const Icon = capability === 'authenticated' ? Lock : ShieldAlert;
    
    return (
      <div className="h-screen flex items-center justify-center bg-background p-6">
        <Card className="max-w-md w-full">
          <CardHeader>
            <div className="flex items-center gap-3">
              <div className="h-12 w-12 rounded-xl bg-destructive/10 flex items-center justify-center">
                <Icon className="h-6 w-6 text-destructive" />
              </div>
              <div>
                <CardTitle data-testid="text-access-denied-title">{messages.title}</CardTitle>
                <CardDescription>{messages.description}</CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-sm text-muted-foreground" data-testid="text-access-denied-message">
              {messages.message}
            </p>
            <p className="text-sm text-muted-foreground">
              If you believe you should have access, please contact your administrator.
            </p>
            <div className="flex gap-2">
              <Link href={fallbackPath}>
                <Button variant="outline" className="gap-2" data-testid="button-back">
                  <ArrowLeft className="w-4 h-4" />
                  Go Back
                </Button>
              </Link>
              <Link href="/dashboard">
                <Button className="gap-2" data-testid="button-dashboard">
                  <Home className="w-4 h-4" />
                  Dashboard
                </Button>
              </Link>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }
  
  return <>{children}</>;
}

export function useRBAC() {
  const { user, isAuthenticated } = useAuth();
  
  return {
    hasCapability: (capability: RBACCapability) => 
      checkCapability(capability, user, isAuthenticated),
    
    hasAnyCapability: (capabilities: RBACCapability[]) =>
      capabilities.some(c => checkCapability(c, user, isAuthenticated)),
    
    hasAllCapabilities: (capabilities: RBACCapability[]) =>
      capabilities.every(c => checkCapability(c, user, isAuthenticated)),
    
    checkAccess: (require: RBACCapability | RBACCapability[]) =>
      checkAccess(require, user, isAuthenticated),
      
    isPlatformAdmin: checkCapability('platform_admin', user, isAuthenticated),
    isPlatformStaff: checkCapability('platform_staff', user, isAuthenticated),
    isOwner: checkCapability('owner', user, isAuthenticated),
    isLeader: checkCapability('leader', user, isAuthenticated),
    isSupervisor: checkCapability('supervisor', user, isAuthenticated),
  };
}

export type { RoleCheckResult };
