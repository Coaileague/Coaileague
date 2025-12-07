/**
 * useTrinityDiagnostics - Connects Trinity to platform diagnostics and Quick Fix suggestions
 * 
 * For support/root roles only:
 * - Listens for platform health updates via WebSocket
 * - Fetches and displays Quick Fix AI suggestions
 * - Shows workflow issue notifications through Trinity
 */

import { useEffect, useRef, useCallback } from 'react';
import { useQuery } from '@tanstack/react-query';
import { thoughtManager } from '@/lib/mascot/ThoughtManager';
import { useTrinityContext } from './use-trinity-context';

interface QuickFixSuggestion {
  id: string;
  title: string;
  description: string;
  actionCode: string;
  confidence: number;
  riskLevel: 'low' | 'medium' | 'high';
  category: string;
  reasoning?: string;
}

interface PlatformHealthStatus {
  overallStatus: 'healthy' | 'degraded' | 'critical';
  services: Array<{
    service: string;
    status: 'healthy' | 'degraded' | 'unhealthy' | 'unknown';
    message?: string;
  }>;
  activeIssues: Array<{
    id: string;
    severity: 'low' | 'medium' | 'high' | 'critical';
    title: string;
    description: string;
  }>;
}

export function useTrinityDiagnostics(workspaceId?: string) {
  const { context } = useTrinityContext(workspaceId);
  const lastHealthStatusRef = useRef<string | null>(null);
  const lastSuggestionsCountRef = useRef<number>(0);
  
  const isDiagnosticMode = 
    context?.isRootAdmin || 
    context?.isPlatformStaff || 
    context?.isSupportRole;
  
  // Fetch Quick Fix suggestions for support roles
  const { data: suggestionsData } = useQuery<{ success: boolean; suggestions: QuickFixSuggestion[] }>({
    queryKey: ['/api/quick-fixes/suggestions'],
    enabled: isDiagnosticMode === true,
    staleTime: 60000, // Refresh every minute
    refetchInterval: 120000, // Check every 2 minutes
  });
  
  // Fetch platform health for support roles
  const { data: healthData } = useQuery<{ success: boolean; data: PlatformHealthStatus }>({
    queryKey: ['/api/trinity/maintenance/health'],
    enabled: isDiagnosticMode === true,
    staleTime: 30000, // Refresh every 30 seconds
    refetchInterval: 60000, // Check every minute
  });
  
  // Notify Trinity when new suggestions are available
  const notifySuggestions = useCallback((suggestions: QuickFixSuggestion[]) => {
    if (!isDiagnosticMode || suggestions.length === 0) return;
    
    // Only notify if count changed (new suggestions)
    if (suggestions.length === lastSuggestionsCountRef.current) return;
    lastSuggestionsCountRef.current = suggestions.length;
    
    // Show the highest confidence suggestion
    const topSuggestion = suggestions.reduce((best, current) => 
      current.confidence > best.confidence ? current : best
    );
    
    if (topSuggestion.confidence >= 0.7) {
      thoughtManager.triggerHotfixSuggestion({
        id: topSuggestion.id,
        title: topSuggestion.title,
        description: topSuggestion.description,
        actionCode: topSuggestion.actionCode,
        confidence: topSuggestion.confidence,
        riskLevel: topSuggestion.riskLevel,
      });
    }
  }, [isDiagnosticMode]);
  
  // Notify Trinity of health status changes
  const notifyHealthStatus = useCallback((health: PlatformHealthStatus) => {
    if (!isDiagnosticMode) return;
    
    const statusKey = `${health.overallStatus}-${health.activeIssues.length}`;
    if (statusKey === lastHealthStatusRef.current) return;
    lastHealthStatusRef.current = statusKey;
    
    // Summarize degraded services
    const degradedServices = health.services.filter(s => s.status !== 'healthy');
    const message = degradedServices.length > 0
      ? degradedServices.map(s => `${s.service}: ${s.message || s.status}`).join(', ')
      : 'All systems operational';
    
    thoughtManager.triggerPlatformHealthUpdate(health.overallStatus, message);
    
    // Show critical issues
    const criticalIssues = health.activeIssues.filter(i => i.severity === 'critical' || i.severity === 'high');
    if (criticalIssues.length > 0) {
      const issue = criticalIssues[0];
      thoughtManager.triggerDiagnosticAlert({
        severity: issue.severity === 'critical' ? 'critical' : 'error',
        title: issue.title,
        description: issue.description,
        suggestedAction: 'View Issue',
        actionLink: '/support-console?tab=fixes',
      });
    }
  }, [isDiagnosticMode]);
  
  // React to suggestions data changes
  useEffect(() => {
    if (suggestionsData?.success && suggestionsData.suggestions) {
      notifySuggestions(suggestionsData.suggestions);
    }
  }, [suggestionsData, notifySuggestions]);
  
  // React to health data changes
  useEffect(() => {
    if (healthData?.success && healthData.data) {
      notifyHealthStatus(healthData.data);
    }
  }, [healthData, notifyHealthStatus]);
  
  return {
    isDiagnosticMode,
    suggestions: suggestionsData?.suggestions || [],
    health: healthData?.data || null,
  };
}
