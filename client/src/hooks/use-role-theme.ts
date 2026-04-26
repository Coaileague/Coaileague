/**
 * Dynamic Role-Based Theming Hook
 * 
 * Provides theme customization based on user's platform role.
 * Integrates with AI Brain orchestration for theme recommendations.
 */

import { useState, useEffect, useMemo, useCallback } from 'react';
import { useAuth } from './useAuth';

export type RoleTheme = {
  name: string;
  primary: string;
  secondary: string;
  accent: string;
  background: string;
  surface: string;
  text: string;
  muted: string;
  border: string;
  gradient: string;
  icon: string;
};

const ROLE_THEMES: Record<string, RoleTheme> = {
  root_admin: {
    name: 'Executive',
    primary: 'hsl(262, 83%, 58%)',
    secondary: 'hsl(280, 65%, 60%)',
    accent: 'hsl(300, 60%, 65%)',
    background: 'hsl(260, 20%, 8%)',
    surface: 'hsl(260, 15%, 12%)',
    text: 'hsl(0, 0%, 98%)',
    muted: 'hsl(260, 10%, 60%)',
    border: 'hsl(262, 30%, 25%)',
    gradient: 'from-violet-600 via-purple-600 to-fuchsia-600',
    icon: 'Shield',
  },
  deputy_admin: {
    name: 'Command',
    primary: 'hsl(220, 90%, 56%)',
    secondary: 'hsl(200, 85%, 55%)',
    accent: 'hsl(180, 80%, 50%)',
    background: 'hsl(220, 20%, 8%)',
    surface: 'hsl(220, 15%, 12%)',
    text: 'hsl(0, 0%, 98%)',
    muted: 'hsl(220, 10%, 60%)',
    border: 'hsl(220, 30%, 25%)',
    gradient: 'from-blue-600 via-sky-500 to-cyan-500',
    icon: 'Crown',
  },
  sysop: {
    name: 'Systems',
    primary: 'hsl(142, 76%, 36%)',
    secondary: 'hsl(160, 70%, 40%)',
    accent: 'hsl(180, 65%, 45%)',
    background: 'hsl(142, 20%, 8%)',
    surface: 'hsl(142, 15%, 12%)',
    text: 'hsl(0, 0%, 98%)',
    muted: 'hsl(142, 10%, 60%)',
    border: 'hsl(142, 30%, 25%)',
    gradient: 'from-green-600 via-emerald-500 to-teal-500',
    icon: 'Terminal',
  },
  support_manager: {
    name: 'Support Lead',
    primary: 'hsl(25, 95%, 53%)',
    secondary: 'hsl(35, 90%, 55%)',
    accent: 'hsl(45, 85%, 60%)',
    background: 'hsl(25, 20%, 8%)',
    surface: 'hsl(25, 15%, 12%)',
    text: 'hsl(0, 0%, 98%)',
    muted: 'hsl(25, 10%, 60%)',
    border: 'hsl(25, 30%, 25%)',
    gradient: 'from-orange-600 via-amber-500 to-yellow-500',
    icon: 'Headset',
  },
  compliance_officer: {
    name: 'Compliance',
    primary: 'hsl(350, 89%, 60%)',
    secondary: 'hsl(330, 85%, 55%)',
    accent: 'hsl(310, 80%, 60%)',
    background: 'hsl(350, 20%, 8%)',
    surface: 'hsl(350, 15%, 12%)',
    text: 'hsl(0, 0%, 98%)',
    muted: 'hsl(350, 10%, 60%)',
    border: 'hsl(350, 30%, 25%)',
    gradient: 'from-rose-600 via-pink-500 to-fuchsia-500',
    icon: 'Scale',
  },
  org_owner: {
    name: 'Organization',
    primary: 'hsl(200, 95%, 48%)',
    secondary: 'hsl(210, 90%, 52%)',
    accent: 'hsl(220, 85%, 56%)',
    background: 'hsl(210, 25%, 8%)',
    surface: 'hsl(210, 20%, 12%)',
    text: 'hsl(0, 0%, 98%)',
    muted: 'hsl(210, 10%, 60%)',
    border: 'hsl(210, 30%, 25%)',
    gradient: 'from-sky-600 via-blue-500 to-indigo-500',
    icon: 'Building',
  },
  manager: {
    name: 'Manager',
    primary: 'hsl(190, 90%, 45%)',
    secondary: 'hsl(175, 85%, 48%)',
    accent: 'hsl(160, 80%, 50%)',
    background: 'hsl(190, 20%, 8%)',
    surface: 'hsl(190, 15%, 12%)',
    text: 'hsl(0, 0%, 98%)',
    muted: 'hsl(190, 10%, 60%)',
    border: 'hsl(190, 30%, 25%)',
    gradient: 'from-cyan-600 via-teal-500 to-emerald-500',
    icon: 'Users',
  },
  employee: {
    name: 'Standard',
    primary: 'hsl(215, 25%, 45%)',
    secondary: 'hsl(220, 20%, 50%)',
    accent: 'hsl(225, 15%, 55%)',
    background: 'hsl(215, 15%, 8%)',
    surface: 'hsl(215, 12%, 12%)',
    text: 'hsl(0, 0%, 98%)',
    muted: 'hsl(215, 8%, 60%)',
    border: 'hsl(215, 15%, 25%)',
    gradient: 'from-slate-600 via-gray-500 to-zinc-500',
    icon: 'User',
  },
};

const DEFAULT_THEME = ROLE_THEMES.employee;

export interface UseRoleThemeReturn {
  theme: RoleTheme;
  roleName: string;
  applyTheme: () => void;
  resetToDefault: () => void;
  isCustomized: boolean;
  gradientClass: string;
}

export function useRoleTheme(): UseRoleThemeReturn {
  const { user } = useAuth();
  const [isCustomized, setIsCustomized] = useState(false);

  const platformRole = user?.platformRole || 'employee';
  const workspaceRole = user?.role || 'employee';
  
  const effectiveRole = platformRole !== 'none' ? platformRole : workspaceRole;

  const theme = useMemo(() => {
    return ROLE_THEMES[effectiveRole] || DEFAULT_THEME;
  }, [effectiveRole]);

  const applyTheme = useCallback(() => {
    if (typeof document === 'undefined') return;
    
    const root = document.documentElement;
    root.style.setProperty('--role-primary', theme.primary);
    root.style.setProperty('--role-secondary', theme.secondary);
    root.style.setProperty('--role-accent', theme.accent);
    root.style.setProperty('--role-gradient', theme.gradient);
    root.style.setProperty('--role-background', theme.background);
    root.style.setProperty('--role-surface', theme.surface);
    root.style.setProperty('--role-text', theme.text);
    root.style.setProperty('--role-muted', theme.muted);
    root.style.setProperty('--role-border', theme.border);
    localStorage.setItem('roleThemeEnabled', 'true');
    setIsCustomized(true);
  }, [theme]);

  const resetToDefault = useCallback(() => {
    if (typeof document === 'undefined') return;
    
    const root = document.documentElement;
    root.style.removeProperty('--role-primary');
    root.style.removeProperty('--role-secondary');
    root.style.removeProperty('--role-accent');
    root.style.removeProperty('--role-gradient');
    root.style.removeProperty('--role-background');
    root.style.removeProperty('--role-surface');
    root.style.removeProperty('--role-text');
    root.style.removeProperty('--role-muted');
    root.style.removeProperty('--role-border');
    localStorage.setItem('roleThemeEnabled', 'false');
    setIsCustomized(false);
  }, []);

  useEffect(() => {
    const savedPref = localStorage.getItem('roleThemeEnabled');
    if (savedPref === 'true') {
      applyTheme();
    }
  }, [applyTheme]);

  useEffect(() => {
    if (isCustomized && effectiveRole) {
      applyTheme();
    }
  }, [effectiveRole, isCustomized, applyTheme]);

  return {
    theme,
    roleName: theme.name,
    applyTheme,
    resetToDefault,
    isCustomized,
    gradientClass: `bg-gradient-to-r ${theme.gradient}`,
  };
}

export { ROLE_THEMES };
