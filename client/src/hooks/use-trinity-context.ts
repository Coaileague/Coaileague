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
import { useEffect } from 'react';
import { useAuth } from './useAuth';
import { thoughtManager } from '@/lib/mascot/ThoughtManager';

interface OrgIntelligence {
  automationReadiness: {
    score: number;
    level: 'hand_held' | 'graduated' | 'full_automation';
    canGraduate: boolean;
    topIssues: string[];
    recommendations: string[];
  } | null;
  workboardStats: {
    pendingTasks: number;
    completedToday: number;
    failedToday: number;
    avgCompletionTimeMs: number;
  } | null;
  notificationSummary: {
    unreadCount: number;
    urgentCount: number;
    categories: { type: string; count: number }[];
  } | null;
  businessMetrics: {
    invoicesPendingCount: number;
    invoicesOverdueCount: number;
    recentActivityScore: number;
  } | null;
  priorityInsights: string[];
}

interface PlatformDiagnostics {
  overallHealth: 'healthy' | 'degraded' | 'critical';
  activeWorkspaces: number;
  totalUsers: number;
  recentErrors: number;
  subagentHealth: { healthy: number; degraded: number; critical: number };
  fastModeStats: { successRate: number; avgDuration: number; slaBreeches: number; totalExecutions: number };
  upgradeOpportunities: { workspaceId: string; workspaceName: string; reason: string }[];
  engagementAlerts: { type: string; message: string; priority: 'low' | 'medium' | 'high' }[];
  pendingNotificationSuggestions: number;
  supportTicketBacklog: { open: number; urgent: number; avgAgeHours: number };
  trialExpirations: { workspaceId: string; workspaceName: string; daysLeft: number }[];
  churnRiskCount: number;
}

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
  
  subscriptionTier: 'free' | 'trial' | 'starter' | 'professional' | 'business' | 'enterprise' | 'strategic';
  subscriptionStatus: 'trial' | 'active' | 'past_due' | 'cancelled' | 'suspended';
  
  hasTrinityPro: boolean;
  activeAddons: string[];
  
  orgStats?: {
    employeeCount: number;
    departmentCount: number;
    isNewOrg: boolean;
  };
  
  orgIntelligence?: OrgIntelligence;
  platformDiagnostics?: PlatformDiagnostics;
  
  trinityAccessReason: 'platform_staff' | 'org_owner' | 'addon_subscriber' | 'trial' | 'none';
  trinityAccessLevel: 'full' | 'basic' | 'none';
  /**
   * Trinity operational mode:
   * - 'coo'    — COO mode for org owners/managers at security companies
   * - 'guru'   — Tech Guru mode for platform support agents
   * - 'standard' — Standard mode for all other users
   */
  trinityMode: 'coo' | 'guru' | 'standard';
  
  greeting: string;
  persona: 'executive_advisor' | 'support_partner' | 'coo_advisor' | 'onboarding_guide' | 'platform_guru' | 'standard';
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
  trinityMode: 'coo' | 'guru' | 'standard';
  persona: string;
  isPlatformStaff: boolean;
  isRootAdmin: boolean;
}

export function useTrinityContext(workspaceId?: string) {
  const { user, isLoading: authLoading } = useAuth();
  
  const query = useQuery<TrinityContextResponse>({
    queryKey: ['/api/trinity/context', workspaceId],
    enabled: !!user && !authLoading,
    staleTime: 15 * 1000, // 15 seconds - server-side cached for fast response
    refetchOnWindowFocus: true, // Sync when user returns to tab
    refetchInterval: 30 * 1000, // Refetch every 30 seconds (server caches for 15s)
    refetchOnMount: 'always', // Always get fresh data on mount
  });
  
  // Wire automation events to ThoughtManager
  useEffect(() => {
    const handleAutomationEvent = (e: CustomEvent) => {
      thoughtManager.ingestAutomationEvent(e.detail);
    };
    const handleFastModeResult = (e: CustomEvent) => {
      thoughtManager.ingestFastModeResult(e.detail);
    };
    const handleGraduationMilestone = (e: CustomEvent) => {
      thoughtManager.ingestGraduationMilestone(e.detail);
    };
    
    window.addEventListener('automation_event', handleAutomationEvent as EventListener);
    window.addEventListener('fast_mode_result', handleFastModeResult as EventListener);
    window.addEventListener('graduation_milestone', handleGraduationMilestone as EventListener);
    
    return () => {
      window.removeEventListener('automation_event', handleAutomationEvent as EventListener);
      window.removeEventListener('fast_mode_result', handleFastModeResult as EventListener);
      window.removeEventListener('graduation_milestone', handleGraduationMilestone as EventListener);
    };
  }, []);
  
  // Ingest org intelligence priority insights when context updates
  useEffect(() => {
    const insights = query.data?.context?.orgIntelligence?.priorityInsights;
    if (insights && insights.length > 0) {
      thoughtManager.ingestOrgInsights(insights);
    }
  }, [query.data?.context?.orgIntelligence?.priorityInsights]);
  
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
    trinityMode: query.data?.trinityMode ?? 'standard',
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
  if (context.workspaceRole === 'co_owner') return 'Co-Owner';
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
    case 'coo_advisor':
      return 'AI COO — business intelligence and workforce operations advisor';
    case 'onboarding_guide':
      return 'New organization setup assistant';
    default:
      return 'AI assistant';
  }
}
