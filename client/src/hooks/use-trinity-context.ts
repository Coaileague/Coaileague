/**
 * useTrinityContext Hook
 * 
 * Fetches and provides Trinity AI context including:
 * - User role awareness (root admin, support, org owner, etc.)
 * - Subscription and add-on status
 * - Contextual persona selection
 * - Role-appropriate greeting and initial thoughts
 */

import { useQuery } from '@tanstack/react-query';
import { useAuth } from './useAuth';

export interface TrinityContext {
  userId: string;
  username: string;
  displayName: string;
  
  platformRole: string;
  isPlatformStaff: boolean;
  isRootAdmin: boolean;
  isSupportRole: boolean;
  
  workspaceId?: string;
  workspaceName?: string;
  workspaceRole?: string;
  isOrgOwner: boolean;
  isManager: boolean;
  
  subscriptionTier: 'free' | 'starter' | 'professional' | 'enterprise';
  subscriptionStatus: 'trial' | 'active' | 'past_due' | 'cancelled' | 'suspended';
  
  hasTrinityPro: boolean;
  hasBusinessBuddy: boolean;
  activeAddons: string[];
  
  orgStats?: {
    employeeCount: number;
    departmentCount: number;
    isNewOrg: boolean;
  };
  
  trinityAccessReason: 'platform_staff' | 'org_owner' | 'addon_subscriber' | 'trial' | 'none';
  trinityAccessLevel: 'full' | 'basic' | 'none';
  
  greeting: string;
  persona: 'executive_advisor' | 'support_partner' | 'business_buddy' | 'onboarding_guide' | 'standard';
}

interface TrinityContextResponse {
  success: boolean;
  context: TrinityContext;
  initialThought: string | null;
}

interface TrinityAccessResponse {
  hasAccess: boolean;
  accessLevel: 'full' | 'basic' | 'none';
  reason: string;
  hasTrinityPro: boolean;
  hasBusinessBuddy: boolean;
  persona: string;
  isPlatformStaff: boolean;
  isRootAdmin: boolean;
}

export function useTrinityContext(workspaceId?: string) {
  const { user, isLoading: authLoading } = useAuth();
  
  const query = useQuery<TrinityContextResponse>({
    queryKey: ['/api/trinity/context', workspaceId],
    enabled: !!user && !authLoading,
    staleTime: 5 * 60 * 1000,
    refetchOnWindowFocus: false,
  });
  
  return {
    context: query.data?.context,
    initialThought: query.data?.initialThought,
    isLoading: authLoading || query.isLoading,
    error: query.error,
    refetch: query.refetch,
  };
}

export function useTrinityAccess(workspaceId?: string) {
  const { user, isLoading: authLoading } = useAuth();
  
  const query = useQuery<TrinityAccessResponse>({
    queryKey: ['/api/trinity/access', workspaceId],
    enabled: !!user && !authLoading,
    staleTime: 5 * 60 * 1000,
    refetchOnWindowFocus: false,
  });
  
  const hasAccess = query.data?.hasAccess ?? false;
  const accessLevel = query.data?.accessLevel ?? 'none';
  
  return {
    hasAccess,
    accessLevel,
    hasTrinityPro: query.data?.hasTrinityPro ?? false,
    hasBusinessBuddy: query.data?.hasBusinessBuddy ?? false,
    isPlatformStaff: query.data?.isPlatformStaff ?? false,
    isRootAdmin: query.data?.isRootAdmin ?? false,
    persona: query.data?.persona ?? 'standard',
    reason: query.data?.reason,
    isLoading: authLoading || query.isLoading,
  };
}

export function getRoleDisplayName(context: TrinityContext | undefined): string {
  if (!context) return 'User';
  
  if (context.isRootAdmin) return 'Root Administrator';
  if (context.isPlatformStaff) {
    if (context.platformRole === 'deputy_admin') return 'Deputy Administrator';
    if (context.platformRole === 'sysop') return 'System Operator';
    if (context.platformRole === 'support_manager') return 'Support Manager';
    if (context.platformRole === 'support_agent') return 'Support Agent';
    return 'Platform Staff';
  }
  if (context.isOrgOwner) return 'Organization Owner';
  if (context.workspaceRole === 'org_admin') return 'Organization Admin';
  if (context.workspaceRole === 'department_manager') return 'Department Manager';
  if (context.workspaceRole === 'supervisor') return 'Supervisor';
  if (context.workspaceRole === 'staff') return 'Team Member';
  
  return context.displayName || 'User';
}

export function getPersonaDescription(persona: string): string {
  switch (persona) {
    case 'executive_advisor':
      return 'Executive-level strategic advisor for platform oversight';
    case 'support_partner':
      return 'Support operations assistant for platform staff';
    case 'business_buddy':
      return 'Business growth partner and workforce advisor';
    case 'onboarding_guide':
      return 'New organization setup assistant';
    default:
      return 'AI assistant';
  }
}
