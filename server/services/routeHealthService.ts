/**
 * Route Health Service for Trinity Platform Monitoring
 * 
 * Provides smoke tests for critical RBAC-protected routes to detect
 * parity issues (e.g., routes missing from desktop vs mobile views)
 */
import { createLogger } from '../lib/logger';
const log = createLogger('routeHealthService');

export interface RouteHealthCheck {
  path: string;
  name: string;
  requiredRole: string | null;
  category: 'dashboard' | 'admin' | 'owner' | 'employee' | 'public';
  expectedStatus: number;
  lastChecked?: Date;
  status?: 'healthy' | 'degraded' | 'error' | 'unchecked';
  errorMessage?: string;
}

// Critical RBAC-protected routes that must remain accessible
export const CRITICAL_ROUTES: RouteHealthCheck[] = [
  // Public routes
  { path: '/', name: 'Landing Page', requiredRole: null, category: 'public', expectedStatus: 200 },
  { path: '/login', name: 'Login', requiredRole: null, category: 'public', expectedStatus: 200 },
  { path: '/register', name: 'Register', requiredRole: null, category: 'public', expectedStatus: 200 },
  { path: '/pricing', name: 'Pricing', requiredRole: null, category: 'public', expectedStatus: 200 },
  
  // Dashboard routes (authenticated)
  { path: '/dashboard', name: 'Dashboard', requiredRole: 'employee', category: 'dashboard', expectedStatus: 200 },
  { path: '/schedule', name: 'Schedule', requiredRole: 'employee', category: 'dashboard', expectedStatus: 200 },
  { path: '/time-tracking', name: 'Time Tracking', requiredRole: 'employee', category: 'dashboard', expectedStatus: 200 },
  { path: '/payroll', name: 'Payroll', requiredRole: 'employee', category: 'dashboard', expectedStatus: 200 },
  
  // Owner routes
  { path: '/owner-analytics', name: 'Owner Analytics', requiredRole: 'owner', category: 'owner', expectedStatus: 200 },
  { path: '/owner-financials', name: 'Owner Financials', requiredRole: 'owner', category: 'owner', expectedStatus: 200 },
  { path: '/owner-reports', name: 'Owner Reports', requiredRole: 'owner', category: 'owner', expectedStatus: 200 },
  { path: '/team', name: 'Team Management', requiredRole: 'owner', category: 'owner', expectedStatus: 200 },
  { path: '/clients', name: 'Clients', requiredRole: 'owner', category: 'owner', expectedStatus: 200 },
  
  // Admin routes
  { path: '/admin', name: 'Admin Dashboard', requiredRole: 'platform-admin', category: 'admin', expectedStatus: 200 },
  { path: '/admin/users', name: 'User Management', requiredRole: 'platform-admin', category: 'admin', expectedStatus: 200 },
  { path: '/admin/compliance', name: 'Compliance', requiredRole: 'platform-admin', category: 'admin', expectedStatus: 200 },
  { path: '/admin/integrations', name: 'Integrations', requiredRole: 'platform-admin', category: 'admin', expectedStatus: 200 },
  
  // Employee routes
  { path: '/profile', name: 'Profile', requiredRole: 'employee', category: 'employee', expectedStatus: 200 },
  { path: '/settings', name: 'Settings', requiredRole: 'employee', category: 'employee', expectedStatus: 200 },
  { path: '/notifications', name: 'Notifications', requiredRole: 'employee', category: 'employee', expectedStatus: 200 },
];

// API endpoints that should always respond
export const CRITICAL_API_ENDPOINTS = [
  '/api/auth/session',
  '/api/notifications/combined',
  '/api/health',
  '/api/config/public',
];

/**
 * Check if a route is registered in the frontend router
 * This is used by Trinity to detect route parity issues
 */
export async function checkRouteParity(): Promise<{
  healthy: RouteHealthCheck[];
  missing: RouteHealthCheck[];
  summary: string;
}> {
  const results = {
    healthy: [] as RouteHealthCheck[],
    missing: [] as RouteHealthCheck[],
    summary: '',
  };
  
  // In a real implementation, this would use Puppeteer to check each route
  // For now, we return the list of routes that should be monitored
  results.healthy = CRITICAL_ROUTES.map(r => ({ ...r, status: 'unchecked' as const }));
  results.summary = `${CRITICAL_ROUTES.length} critical routes registered for monitoring`;
  
  return results;
}

/**
 * Get route health status for Trinity dashboard
 */
export function getRouteHealthSummary(): {
  totalRoutes: number;
  byCategory: Record<string, number>;
  byRole: Record<string, number>;
} {
  const byCategory: Record<string, number> = {};
  const byRole: Record<string, number> = {};
  
  for (const route of CRITICAL_ROUTES) {
    byCategory[route.category] = (byCategory[route.category] || 0) + 1;
    const role = route.requiredRole || 'public';
    byRole[role] = (byRole[role] || 0) + 1;
  }
  
  return {
    totalRoutes: CRITICAL_ROUTES.length,
    byCategory,
    byRole,
  };
}

/**
 * Record a route health check result (no-op for now, can be extended later)
 * Note: Database table for persistent logging not yet created
 */
export async function recordRouteHealthCheck(
  path: string,
  status: 'healthy' | 'degraded' | 'error',
  responseTime?: number,
  errorMessage?: string
): Promise<void> {
  // Log to console for now - database table can be added later if needed
  if (status === 'error') {
    log.error(`[RouteHealth] ${path} is ${status}`, { responseTime, errorMessage });
  } else if (status === 'degraded') {
    log.warn(`[RouteHealth] ${path} is ${status}`, { responseTime });
  }
  // Info level logs are silent to avoid noise
}

export default {
  CRITICAL_ROUTES,
  CRITICAL_API_ENDPOINTS,
  checkRouteParity,
  getRouteHealthSummary,
  recordRouteHealthCheck,
};
