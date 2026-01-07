/**
 * Schedule Module - Domain aggregator for scheduling functionality
 * 
 * This module provides a unified entry point for schedule-related services.
 * Use these imports for cleaner dependency management.
 * 
 * Services:
 * - intelligentScheduler: AI-powered scheduling optimization
 * - shiftMonitoring: Real-time shift monitoring and alerts
 * - scheduling utils: Date/time utilities for schedule operations
 * 
 * Routes: server/routes/schedule.ts
 * Types: shared/schema.ts (Shift, Schedule)
 */

// Re-export the scheduling utilities
export * from '../../services/utils/scheduling';

// Module documentation for IDE navigation
export const SCHEDULE_MODULE = {
  services: {
    intelligentScheduler: '../../services/ai-brain/skills/intelligentScheduler',
    shiftMonitoring: '../../services/automation/shiftMonitoringService',
    schedulingUtils: '../../services/utils/scheduling',
  },
  routes: {
    schedule: '../../routes/schedule',
    advancedScheduling: '../../routes/advancedSchedulingRoutes',
    aiScheduling: '../../routes/aiSchedulingRoutes',
  },
  schema: {
    types: 'shared/schema.ts',
    entities: ['shifts', 'schedules', 'recurringShiftPatterns'],
  },
} as const;
