/**
 * TRINITY CONFIGURATION
 * ====================
 * Centralized configuration for Trinity Chat interface.
 * Eliminates hardcoded values and enables dynamic updates.
 */

import { Briefcase, Heart, Zap, type LucideIcon } from 'lucide-react';

export type ConversationMode = 'business' | 'personal' | 'integrated';
export type SpiritualGuidance = 'none' | 'general' | 'christian';
export type AccountabilityLevel = 'gentle' | 'balanced' | 'challenging';

export interface ModeConfig {
  id: ConversationMode;
  label: string;
  description: string;
  icon: LucideIcon;
  colors: {
    gradient: string;
    badge: string;
    text: string;
  };
}

export interface SpiritualConfig {
  id: SpiritualGuidance;
  label: string;
  description: string;
}

export interface AccountabilityConfig {
  id: AccountabilityLevel;
  label: string;
  description: string;
}

export const TRINITY_MODES: Record<ConversationMode, ModeConfig> = {
  business: {
    id: 'business',
    label: 'Business',
    description: 'Data-driven insights with live metrics',
    icon: Briefcase,
    colors: {
      gradient: 'from-blue-500 to-cyan-500',
      badge: 'bg-blue-500/20 text-blue-400 border-blue-500/30',
      text: 'text-blue-500',
    },
  },
  personal: {
    id: 'personal',
    label: 'Personal',
    description: 'BUDDY personal development coaching',
    icon: Heart,
    colors: {
      gradient: 'from-emerald-500 to-teal-500',
      badge: 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30',
      text: 'text-emerald-500',
    },
  },
  integrated: {
    id: 'integrated',
    label: 'Integrated',
    description: 'Full context across business and personal',
    icon: Zap,
    colors: {
      gradient: 'from-purple-500 to-pink-500',
      badge: 'bg-purple-500/20 text-purple-400 border-purple-500/30',
      text: 'text-purple-500',
    },
  },
};

export const SPIRITUAL_GUIDANCE_OPTIONS: SpiritualConfig[] = [
  {
    id: 'none',
    label: 'None',
    description: 'Secular life coaching with evidence-based strategies',
  },
  {
    id: 'general',
    label: 'General',
    description: 'Universal values, purpose, meaning, gratitude',
  },
  {
    id: 'christian',
    label: 'Christian',
    description: 'Scripture references, prayer offerings, biblical wisdom',
  },
];

export const ACCOUNTABILITY_LEVELS: AccountabilityConfig[] = [
  {
    id: 'gentle',
    label: 'Gentle',
    description: 'Supportive encouragement with soft nudges',
  },
  {
    id: 'balanced',
    label: 'Balanced',
    description: 'Encouragement with honest challenge',
  },
  {
    id: 'challenging',
    label: 'Challenging',
    description: 'Direct tough love, no sugarcoating',
  },
];

export const TRINITY_API_ENDPOINTS = {
  chat: '/api/trinity/chat',
  history: '/api/trinity/history',
  session: (sessionId: string) => `/api/trinity/session/${sessionId}/messages`,
  settings: '/api/trinity/settings',
  newSession: '/api/trinity/session/new',
};

export const TRINITY_ALLOWED_ROLES = {
  orgRoles: ['org_owner', 'co_owner', 'manager'] as const,
  platformRoles: ['root_admin', 'co_admin', 'sysops'] as const,
};

export const TRINITY_FEATURE_FLAGS = {
  personalDevelopmentEnabled: true,
  weeklyCheckInsEnabled: true,
  proactiveInsightsEnabled: true,
  metacognitionEnabled: true,
};

export function isTrinityAccessAllowed(
  orgRole?: string,
  platformRole?: string
): boolean {
  if (!orgRole && !platformRole) return false;
  
  const hasOrgAccess = TRINITY_ALLOWED_ROLES.orgRoles.includes(
    orgRole as typeof TRINITY_ALLOWED_ROLES.orgRoles[number]
  );
  const hasPlatformAccess = TRINITY_ALLOWED_ROLES.platformRoles.includes(
    platformRole as typeof TRINITY_ALLOWED_ROLES.platformRoles[number]
  );
  
  return hasOrgAccess || hasPlatformAccess;
}
