/**
 * TRINITY CONFIGURATION
 * ====================
 * Centralized configuration for Trinity Chat interface.
 * Eliminates hardcoded values and enables dynamic updates.
 */

import { Briefcase, Heart, Shield, type LucideIcon } from 'lucide-react';

/**
 * TRINITY CONVERSATION MODES
 * ==========================
 * 
 * Business Mode: Standard operational mode for all users
 * - Data-driven insights, metrics, scheduling, invoicing
 * - Uses Gemini Flash for efficiency on routine queries
 * 
 * Personal/Buddy Mode: Human element with intelligent multi-AI routing
 * - Personal development, coaching, accountability
 * - Routes to best AI: Gemini for simple, GPT for balanced, Claude for meta-cognitive
 * - Org pays for token usage - gets best AI when thought is truly needed
 * 
 * Guru Mode: Reserved for authenticated support agents ONLY
 * - Deep platform expertise, troubleshooting, diagnostics
 * - Only responds after verifying support agent authentication
 * - Uses Claude for complex analysis and recommendations
 */

/** @deprecated Trinity mode toggle removed — kept for DB schema compat only */
export type ConversationMode = 'business';
// SpiritualGuidance removed
// ModeConfig removed

// SpiritualConfig removed

// AccountabilityConfig removed

// TRINITY_MODES removed — Trinity decides internally, no mode toggle

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
  // Match actual workspace roles from useWorkspaceAccess
  orgRoles: ['org_owner', 'co_owner', 'manager', 'department_manager'] as const,
  // Match ALL platform staff roles from useWorkspaceAccess
  platformRoles: ['root_admin', 'co_admin', 'deputy_admin', 'sysops', 'sysop', 'support_manager', 'support_agent', 'compliance_officer'] as const,
};

export const TRINITY_FEATURE_FLAGS = {
  personalDevelopmentEnabled: true,
  weeklyCheckInsEnabled: true,
  proactiveInsightsEnabled: true,
  metacognitionEnabled: true,
};

/**
 * TRINITY BRANDING - Dynamic display names and labels
 * Centralized so there are no hardcoded strings in components
 */
export const TRINITY_BRANDING = {
  name: 'Trinity',
  version: '2.0',
  displayName: 'Trinity',
  fullDisplayName: 'Trinity AI',
  tagline: 'Your AI-Powered Business Partner',
  mobilePlaceholder: 'Quick question...',
  desktopPlaceholder: 'Ask Trinity anything...',
} as const;

/**
 * MOBILE UI CONFIGURATION - Dynamic sizing and gestures
 */
export const TRINITY_MOBILE_CONFIG = {
  // Height modes for bottom sheet (use larger values for better mobile UX)
  heights: {
    peek: '25vh',       // Minimized - show greeting + recent context chip
    split: '50vh',      // Default - full conversation, scrollable
    immersive: '85vh',  // Expanded - near-fullscreen, keyboard-aware
  } as const,
  // Swipe gesture configuration
  swipe: {
    threshold: 50,        // Pixels needed to trigger mode change
    velocityThreshold: 0.5, // Velocity needed for quick swipes
  },
  // Touch feedback
  haptics: true,
} as const;

export type MobileHeightMode = keyof typeof TRINITY_MOBILE_CONFIG.heights;

/**
 * PUBLIC ROUTES - Trinity modal should NOT appear on these paths
 * These are marketing, auth, and publicly accessible pages
 */
export const TRINITY_PUBLIC_ROUTES = [
  '/',
  '/login',
  '/register',
  '/signup',
  '/pricing',
  '/features',
  '/about',
  '/contact',
  '/compare',
  '/landing',
  '/onboarding',
  '/onboarding-start',
  '/forgot-password',
  '/reset-password',
  '/privacy-policy',
  '/terms-of-service',
  '/roi-calculator',
  '/universal-marketing',
  '/category-platform',
  '/category-growth',
  '/category-operations',
  '/category-communication',
  '/pay-invoice',
  '/client-portal',
  '/custom-login',
  '/custom-register',
] as const;

/**
 * Check if the current route is a public/marketing route
 * where Trinity should NOT appear
 */
export function isPublicRoute(path: string): boolean {
  // Normalize path: remove query string and hash, trim trailing slashes
  const normalizedPath = path.split('?')[0].split('#')[0].replace(/\/+$/, '') || '/';
  
  // Exact matches
  if (TRINITY_PUBLIC_ROUTES.includes(normalizedPath as typeof TRINITY_PUBLIC_ROUTES[number])) {
    return true;
  }
  
  // Prefix matches for dynamic public routes
  const publicPrefixes = [
    '/onboarding',
    '/pay-invoice',
    '/client-portal',
    '/custom-login',
    '/custom-register',
    '/reset-password',
    '/forgot-password',
  ];
  
  return publicPrefixes.some(prefix => normalizedPath.startsWith(prefix));
}

/**
 * Check if Trinity should be available on the current route
 * Requires authenticated user on a non-public platform page
 */
export function isTrinityRouteAllowed(path: string, isAuthenticated: boolean): boolean {
  if (!isAuthenticated) return false;
  if (isPublicRoute(path)) return false;
  return true;
}

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
