/**
 * useTrinityPersona Hook
 * 
 * Bridges TrinityContext data from the server to ThoughtManager
 * for role-aware persona selection and greetings.
 * 
 * Handles:
 * - Context refresh on workspace/user changes
 * - Clearing stale context on logout/error
 * - Detecting persona changes for re-greeting
 */

import { useEffect, useRef } from 'react';
import { useTrinityContext, type TrinityContext } from './use-trinity-context';
import { useAuth } from './useAuth';
import { thoughtManager, type TrinityPersonaContext } from '@/lib/mascot/ThoughtManager';

function buildPersonaContext(context: TrinityContext): TrinityPersonaContext {
  return {
    platformRole: context.platformRole,
    isPlatformStaff: context.isPlatformStaff,
    isRootAdmin: context.isRootAdmin,
    isSupportRole: context.isSupportRole,
    workspaceId: context.workspaceId,
    workspaceName: context.workspaceName,
    workspaceRole: context.workspaceRole,
    isOrgOwner: context.isOrgOwner,
    isManager: context.isManager,
    subscriptionTier: context.subscriptionTier,
    hasTrinityPro: context.hasTrinityPro,
    trinityMode: context.trinityMode,
    orgStats: context.orgStats,
    orgIntelligence: context.orgIntelligence,
    persona: context.persona,
    greeting: context.greeting,
  };
}

function contextIdentityChanged(prev: TrinityContext | null, next: TrinityContext | null): boolean {
  if (!prev && !next) return false;
  if (!prev || !next) return true;
  return (
    prev.userId !== next.userId ||
    prev.workspaceId !== next.workspaceId ||
    prev.persona !== next.persona ||
    prev.platformRole !== next.platformRole ||
    prev.subscriptionTier !== next.subscriptionTier ||
    prev.trinityAccessLevel !== next.trinityAccessLevel ||
    prev.trinityMode !== next.trinityMode ||
    prev.hasTrinityPro !== next.hasTrinityPro ||
    prev.isRootAdmin !== next.isRootAdmin ||
    prev.isPlatformStaff !== next.isPlatformStaff
  );
}

export function useTrinityPersona(workspaceId?: string) {
  const { context, isLoading, error, refetch } = useTrinityContext(workspaceId);
  const { user } = useAuth();
  const lastContextRef = useRef<TrinityContext | null>(null);
  const lastUserIdRef = useRef<string | null>(null);
  const lastWorkspaceIdRef = useRef<string | undefined>(undefined);
  
  // Detect workspace changes and trigger refetch
  useEffect(() => {
    if (workspaceId !== lastWorkspaceIdRef.current && user) {
      lastWorkspaceIdRef.current = workspaceId;
      refetch();
    }
  }, [workspaceId, user, refetch]);
  
  useEffect(() => {
    // Clear context when user logs out
    if (!user) {
      if (lastContextRef.current !== null) {
        thoughtManager.setTrinityContext(null);
        lastContextRef.current = null;
      }
      lastUserIdRef.current = null;
      return;
    }
    
    // Detect user change
    if (user.id !== lastUserIdRef.current) {
      lastUserIdRef.current = user.id;
      // Clear stale context from previous user
      if (lastContextRef.current !== null) {
        thoughtManager.setTrinityContext(null);
        lastContextRef.current = null;
      }
    }
    
    // Clear context on error
    if (error) {
      if (lastContextRef.current !== null) {
        thoughtManager.setTrinityContext(null);
        lastContextRef.current = null;
      }
      return;
    }
    
    // Wait for loading to complete
    if (isLoading || !context) {
      return;
    }
    
    // Check if context identity changed (user, workspace, or persona)
    const identityChanged = contextIdentityChanged(lastContextRef.current, context);
    
    // Build and set new persona context
    const personaContext = buildPersonaContext(context);
    thoughtManager.setTrinityContext(personaContext);
    lastContextRef.current = context;
    
    // Trigger new greeting if identity changed significantly
    if (identityChanged && user) {
      thoughtManager.triggerRoleAwareGreeting();
    }
  }, [context, isLoading, error, user]);
  
  // Cleanup on unmount
  useEffect(() => {
    return () => {
      thoughtManager.setTrinityContext(null);
      lastContextRef.current = null;
      lastUserIdRef.current = null;
    };
  }, []);
  
  return {
    context,
    isLoading,
    error,
    refetch,
    persona: context?.persona ?? 'standard',
    hasAccess: context?.trinityAccessLevel !== 'none',
    accessLevel: context?.trinityAccessLevel ?? 'none',
    trinityMode: context?.trinityMode ?? 'standard',
  };
}
