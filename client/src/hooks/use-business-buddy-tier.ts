/**
 * useBusinessBuddyTier - Resolves user's Business Buddy subscription tier
 * 
 * Tiers:
 * - PUBLIC_DEMO: Not logged in, free demo mode on public pages
 * - LOGGED_IN_FREE: Logged in but no Business Buddy purchase
 * - BUSINESS_BUDDY: Full Business Buddy subscription active
 * 
 * Features by tier:
 * - PUBLIC_DEMO: Demo animations, limited interactions, promo messages
 * - LOGGED_IN_FREE: Same as demo + reminder nudges to upgrade
 * - BUSINESS_BUDDY: Full AI assistant, all modes, personalized insights
 */

import { useMemo } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { useQuery } from '@tanstack/react-query';

export type BusinessBuddyTier = 'PUBLIC_DEMO' | 'LOGGED_IN_FREE' | 'BUSINESS_BUDDY';

interface BusinessBuddyTierResult {
  tier: BusinessBuddyTier;
  isDemo: boolean;
  hasFullAccess: boolean;
  shouldShowUpgradeNudge: boolean;
  tierLabel: string;
  tierDescription: string;
}

// Demo modes allowed for non-subscribers
const DEMO_MODES = ['IDLE', 'HOLIDAY', 'GREETING', 'CELEBRATING'] as const;

// All modes available for Business Buddy subscribers
const FULL_MODES = [
  'IDLE', 'SEARCHING', 'THINKING', 'ANALYZING', 'CODING',
  'UPLOADING', 'LISTENING', 'SUCCESS', 'ERROR', 'ADVISING',
  'HOLIDAY', 'CELEBRATING', 'GREETING'
] as const;

export function useBusinessBuddyTier(): BusinessBuddyTierResult {
  const { user, isAuthenticated, isLoading: authLoading } = useAuth();
  
  // Check if user has Business Buddy subscription
  // Uses staleTime to reduce redundant fetches during rapid auth changes
  const { data: subscriptionData } = useQuery<{ hasBusinessBuddy?: boolean }>({
    queryKey: ['/api/subscription/business-buddy'],
    enabled: isAuthenticated && !authLoading,
    staleTime: 60000, // Cache for 1 minute
    gcTime: 300000,   // Keep in cache for 5 minutes
  });
  
  const tier = useMemo((): BusinessBuddyTier => {
    if (authLoading) return 'PUBLIC_DEMO';
    
    if (!isAuthenticated || !user) {
      return 'PUBLIC_DEMO';
    }
    
    // Check for Business Buddy subscription
    // This checks both workspace subscription and individual add-on
    const userAny = user as Record<string, any>;
    const hasBusinessBuddy = 
      subscriptionData?.hasBusinessBuddy ||
      userAny?.hasBusinessBuddy ||
      userAny?.workspace?.hasBusinessBuddy;
    
    if (hasBusinessBuddy) {
      return 'BUSINESS_BUDDY';
    }
    
    return 'LOGGED_IN_FREE';
  }, [authLoading, isAuthenticated, user, subscriptionData]);
  
  const result = useMemo((): BusinessBuddyTierResult => {
    switch (tier) {
      case 'BUSINESS_BUDDY':
        return {
          tier,
          isDemo: false,
          hasFullAccess: true,
          shouldShowUpgradeNudge: false,
          tierLabel: 'Business Buddy',
          tierDescription: 'Your AI-powered business expert partner',
        };
      case 'LOGGED_IN_FREE':
        return {
          tier,
          isDemo: true,
          hasFullAccess: false,
          shouldShowUpgradeNudge: true,
          tierLabel: 'Demo Mode',
          tierDescription: 'Upgrade to Business Buddy for full AI assistance',
        };
      case 'PUBLIC_DEMO':
      default:
        return {
          tier,
          isDemo: true,
          hasFullAccess: false,
          shouldShowUpgradeNudge: false, // Don't show upgrade nudge on public pages
          tierLabel: 'Try Trinity',
          tierDescription: 'Sign up to unlock your AI business partner',
        };
    }
  }, [tier]);
  
  return result;
}

// Helper to filter allowed modes based on tier
export function getAllowedModes(tier: BusinessBuddyTier): readonly string[] {
  return tier === 'BUSINESS_BUDDY' ? FULL_MODES : DEMO_MODES;
}

// Helper to check if a mode is allowed for a tier
export function isModeAllowed(tier: BusinessBuddyTier, mode: string): boolean {
  const allowedModes = getAllowedModes(tier);
  return allowedModes.includes(mode as any);
}

// Upgrade nudge messages for different contexts
export const UPGRADE_NUDGE_MESSAGES = {
  general: [
    "Want me to help with your business tasks? Upgrade to Business Buddy!",
    "I could analyze your data if you unlock Business Buddy mode...",
    "Business Buddy gives you full AI-powered insights. Ready to upgrade?",
    "Unlock your personal AI business expert with Business Buddy!",
  ],
  scheduling: [
    "I can optimize your schedules with Business Buddy AI!",
    "Smart scheduling awaits with Business Buddy mode!",
  ],
  analytics: [
    "Want deep analytics insights? Upgrade to Business Buddy!",
    "Business Buddy can help you understand your metrics better!",
  ],
  coding: [
    "I can help with code tasks in Business Buddy mode!",
    "Unlock coding assistance with Business Buddy!",
  ],
};

// Get a random upgrade nudge message
export function getUpgradeNudgeMessage(context: keyof typeof UPGRADE_NUDGE_MESSAGES = 'general'): string {
  const messages = UPGRADE_NUDGE_MESSAGES[context] || UPGRADE_NUDGE_MESSAGES.general;
  return messages[Math.floor(Math.random() * messages.length)];
}
