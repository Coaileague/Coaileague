/**
 * Maintenance Mode Service
 * =========================
 * Trinity-orchestrated maintenance mode for platform operations.
 * 
 * Features:
 * - Manual activation by authorized staff (root_admin, co_admin, sysops)
 * - Automatic activation by Trinity during pre-set downtime windows
 * - Blocks login/auth while keeping public pages available
 * - Shows estimated downtime and progress
 * - Integrates with Trinity Triad diagnostics
 */

import { trinityRuntimeFlagsService } from './featureFlagsService';
import { db } from '../db';
import { trinityRuntimeFlags } from '@shared/schema';
import { eq } from 'drizzle-orm';
import { createLogger } from '../lib/logger';
const log = createLogger('maintenanceModeService');


export interface MaintenanceWindow {
  isActive: boolean;
  activatedAt: string | null;
  activatedBy: {
    type: 'trinity' | 'admin' | 'system' | 'diagnostics';
    id?: string;
    name?: string;
  } | null;
  reason: string;
  estimatedDurationMinutes: number;
  estimatedEndTime: string | null;
  allowedRoutes: string[];
  statusMessage: string;
  progressPercent: number;
  triadReportId?: string;
}

const MAINTENANCE_FLAG_KEY = 'platform.maintenance_mode';
const MAINTENANCE_WINDOW_KEY = 'platform.maintenance_window';

const DEFAULT_ALLOWED_ROUTES = [
  '/',
  '/login',
  '/register', 
  '/pricing',
  '/trinity-features',
  '/features',
  '/contact',
  '/support',
  '/terms',
  '/privacy',
  '/status',
  '/api/health',
  '/api/health/summary',
  '/api/status',
  '/api/maintenance/status'
];

const DEFAULT_MAINTENANCE_WINDOW: MaintenanceWindow = {
  isActive: false,
  activatedAt: null,
  activatedBy: null,
  reason: '',
  estimatedDurationMinutes: 30,
  estimatedEndTime: null,
  allowedRoutes: DEFAULT_ALLOWED_ROUTES,
  statusMessage: 'The platform is currently undergoing scheduled maintenance.',
  progressPercent: 0,
  triadReportId: undefined
};

export const maintenanceModeService = {
  /**
   * Check if maintenance mode is currently active
   */
  async isMaintenanceActive(): Promise<boolean> {
    return trinityRuntimeFlagsService.getFlagBoolean(MAINTENANCE_FLAG_KEY, false);
  },

  /**
   * Get full maintenance window details
   */
  async getMaintenanceWindow(): Promise<MaintenanceWindow> {
    const windowData = await trinityRuntimeFlagsService.getFlagValue<MaintenanceWindow>(
      MAINTENANCE_WINDOW_KEY,
      DEFAULT_MAINTENANCE_WINDOW
    );
    
    const isActive = await this.isMaintenanceActive();
    
    return {
      ...windowData,
      isActive
    };
  },

  /**
   * Activate maintenance mode
   */
  async activateMaintenance(params: {
    reason: string;
    estimatedDurationMinutes: number;
    activatedBy: MaintenanceWindow['activatedBy'];
    statusMessage?: string;
    triadReportId?: string;
  }): Promise<{ success: boolean; window: MaintenanceWindow }> {
    const now = new Date();
    const estimatedEnd = new Date(now.getTime() + params.estimatedDurationMinutes * 60 * 1000);
    
    const window: MaintenanceWindow = {
      isActive: true,
      activatedAt: now.toISOString(),
      activatedBy: params.activatedBy,
      reason: params.reason,
      estimatedDurationMinutes: params.estimatedDurationMinutes,
      estimatedEndTime: estimatedEnd.toISOString(),
      allowedRoutes: DEFAULT_ALLOWED_ROUTES,
      statusMessage: params.statusMessage || DEFAULT_MAINTENANCE_WINDOW.statusMessage,
      progressPercent: 0,
      triadReportId: params.triadReportId
    };

    await this.ensureFlagsExist();

    await trinityRuntimeFlagsService.updateFlagValue(
      MAINTENANCE_WINDOW_KEY,
      window,
      params.activatedBy!,
      params.reason,
      'maintenance_mode'
    );

    await trinityRuntimeFlagsService.updateFlagValue(
      MAINTENANCE_FLAG_KEY,
      true,
      params.activatedBy!,
      `Maintenance activated: ${params.reason}`,
      'maintenance_mode'
    );

    log.info(`[MaintenanceMode] ACTIVATED by ${params.activatedBy?.type}:${params.activatedBy?.id} - ${params.reason}`);
    
    return { success: true, window };
  },

  /**
   * Deactivate maintenance mode
   */
  async deactivateMaintenance(deactivatedBy: MaintenanceWindow['activatedBy']): Promise<{ success: boolean }> {
    await this.ensureFlagsExist();

    const currentWindow = await this.getMaintenanceWindow();
    
    const updatedWindow: MaintenanceWindow = {
      ...currentWindow,
      isActive: false,
      progressPercent: 100
    };

    await trinityRuntimeFlagsService.updateFlagValue(
      MAINTENANCE_WINDOW_KEY,
      updatedWindow,
      deactivatedBy!,
      'Maintenance completed',
      'maintenance_mode'
    );

    await trinityRuntimeFlagsService.updateFlagValue(
      MAINTENANCE_FLAG_KEY,
      false,
      deactivatedBy!,
      'Maintenance completed',
      'maintenance_mode'
    );

    log.info(`[MaintenanceMode] DEACTIVATED by ${deactivatedBy?.type}:${deactivatedBy?.id}`);
    
    return { success: true };
  },

  /**
   * Update maintenance progress
   */
  async updateProgress(progressPercent: number, statusMessage?: string): Promise<void> {
    const currentWindow = await this.getMaintenanceWindow();
    
    if (!currentWindow.isActive) return;

    const updatedWindow: MaintenanceWindow = {
      ...currentWindow,
      progressPercent: Math.min(100, Math.max(0, progressPercent)),
      statusMessage: statusMessage || currentWindow.statusMessage
    };

    await trinityRuntimeFlagsService.updateFlagValue(
      MAINTENANCE_WINDOW_KEY,
      updatedWindow,
      { type: 'system' },
      `Progress update: ${progressPercent}%`,
      'maintenance_mode'
    );
  },

  /**
   * Check if a route is allowed during maintenance
   */
  async isRouteAllowed(path: string): Promise<boolean> {
    const window = await this.getMaintenanceWindow();
    
    if (!window.isActive) return true;
    
    return window.allowedRoutes.some(route => {
      if (route.endsWith('*')) {
        return path.startsWith(route.slice(0, -1));
      }
      return path === route || path.startsWith(route + '/');
    });
  },

  /**
   * Get public status for display
   */
  async getPublicStatus(): Promise<{
    isUnderMaintenance: boolean;
    message: string;
    estimatedEndTime: string | null;
    progressPercent: number;
  }> {
    const window = await this.getMaintenanceWindow();
    
    return {
      isUnderMaintenance: window.isActive,
      message: window.statusMessage,
      estimatedEndTime: window.estimatedEndTime,
      progressPercent: window.progressPercent
    };
  },

  /**
   * Trinity autonomous activation based on low-traffic windows
   */
  async shouldAutoActivate(): Promise<boolean> {
    const now = new Date();
    const hour = now.getUTCHours();
    
    const lowTrafficHours = [2, 3, 4, 5];
    return lowTrafficHours.includes(hour);
  },

  /**
   * Ensure maintenance flags exist in database
   */
  async ensureFlagsExist(): Promise<void> {
    const maintenanceFlag = await trinityRuntimeFlagsService.getFlagByKey(MAINTENANCE_FLAG_KEY);
    
    if (!maintenanceFlag) {
      // @ts-expect-error — TS migration: fix in refactoring sprint
      await db.insert(trinityRuntimeFlags).values({
        key: MAINTENANCE_FLAG_KEY,
        description: 'Platform maintenance mode - blocks auth and API writes when active',
        category: 'platform',
        flagType: 'toggle',
        valueType: 'boolean',
        currentValue: JSON.stringify(false),
        defaultValue: JSON.stringify(false),
        safetyLevel: 'high_risk',
        isEnabled: true,
        workspaceId: null,
        createdAt: new Date(),
        updatedAt: new Date()
      }).onConflictDoNothing();
    }

    const windowFlag = await trinityRuntimeFlagsService.getFlagByKey(MAINTENANCE_WINDOW_KEY);
    
    if (!windowFlag) {
      // @ts-expect-error — TS migration: fix in refactoring sprint
      await db.insert(trinityRuntimeFlags).values({
        key: MAINTENANCE_WINDOW_KEY,
        description: 'Maintenance window configuration and status',
        category: 'platform',
        flagType: 'config',
        valueType: 'json',
        currentValue: JSON.stringify(DEFAULT_MAINTENANCE_WINDOW),
        defaultValue: JSON.stringify(DEFAULT_MAINTENANCE_WINDOW),
        safetyLevel: 'high_risk',
        isEnabled: true,
        workspaceId: null,
        createdAt: new Date(),
        updatedAt: new Date()
      }).onConflictDoNothing();
    }
  }
};

export default maintenanceModeService;
