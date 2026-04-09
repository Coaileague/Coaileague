/**
 * UNIFIED ANALYTICS MODULE
 * ========================
 * Consolidates all analytics services into a single organized module.
 * 
 * This module provides:
 * - Core Analytics: Operational metrics (scheduling, time, revenue, performance)
 * - Usage Analytics: Platform usage (credits, AI tasks, feature adoption)
 * - AI Analytics: AI-powered insights and predictions
 * - Stats Analytics: Platform-level statistics with caching
 * 
 * BACKWARDS COMPATIBILITY:
 * All existing imports continue to work. This module re-exports for convenience.
 */

// Re-export existing services for backwards compatibility
export { analyticsDataService, getAnalyticsSummary, type AnalyticsSummary } from '../analyticsDataService';
export { advancedAnalyticsService, type DashboardMetrics, type TimeUsageMetrics, type SchedulingMetrics, type RevenueMetrics, type EmployeePerformanceMetrics } from '../advancedAnalyticsService';
export { analyticsAIService, type AnalyticsInsights, type Anomaly, type Forecast } from '../analyticsAIService';
export { advancedUsageAnalyticsService, type AdvancedUsageReport, type CreditUsageSummary, type AITaskAnalytics, type ROIMetrics } from '../advancedUsageAnalyticsService';
export { businessOwnerAnalyticsService, type OwnerDashboardOverview, type FeatureAdoption, type TeamEngagementReport } from '../businessOwnerAnalyticsService';
export { getAnalyticsStats, clearAnalyticsCache } from '../analyticsStats';
export { roomAnalyticsService } from '../roomAnalyticsService';

/**
 * Unified Analytics Service
 * Provides a single entry point for all analytics functionality
 */
export const unifiedAnalytics = {
  // Core operational analytics
  core: {
    getDashboardMetrics: async (workspaceId: string, period: string) => {
      const { advancedAnalyticsService } = await import('../advancedAnalyticsService');
      return advancedAnalyticsService.getDashboardMetrics(workspaceId, period);
    },
    getTimeUsageMetrics: async (workspaceId: string, period: string) => {
      const { advancedAnalyticsService } = await import('../advancedAnalyticsService');
      return advancedAnalyticsService.getTimeUsageMetrics(workspaceId, period);
    },
    getSchedulingMetrics: async (workspaceId: string, period: string) => {
      const { advancedAnalyticsService } = await import('../advancedAnalyticsService');
      return advancedAnalyticsService.getSchedulingMetrics(workspaceId, period);
    },
    getRevenueMetrics: async (workspaceId: string, period: string) => {
      const { advancedAnalyticsService } = await import('../advancedAnalyticsService');
      return advancedAnalyticsService.getRevenueMetrics(workspaceId, period);
    },
    getEmployeePerformanceMetrics: async (workspaceId: string, period: string) => {
      const { advancedAnalyticsService } = await import('../advancedAnalyticsService');
      return advancedAnalyticsService.getEmployeePerformanceMetrics(workspaceId, period);
    },
    getSummary: async (workspaceId: string, startDate?: Date, endDate?: Date) => {
      const { getAnalyticsSummary } = await import('../analyticsDataService');
      return getAnalyticsSummary(workspaceId, startDate, endDate);
    },
  },

  // AI-powered insights
  ai: {
    generateInsights: async (workspaceId: string, period: string) => {
      const { analyticsAIService } = await import('../analyticsAIService');
      return analyticsAIService.generateInsights(workspaceId, period);
    },
  },

  // Usage and credit analytics
  usage: {
    getReport: async (workspaceId: string, period: string) => {
      const { advancedUsageAnalyticsService } = await import('../advancedUsageAnalyticsService');
      return advancedUsageAnalyticsService.getAdvancedUsageReport(workspaceId, period);
    },
    getCreditSummary: async (workspaceId: string) => {
      const { advancedUsageAnalyticsService } = await import('../advancedUsageAnalyticsService');
      return advancedUsageAnalyticsService.getCreditSummary(workspaceId);
    },
  },

  // Business owner dashboard
  owner: {
    getDashboard: async (workspaceId: string, period: string) => {
      const { businessOwnerAnalyticsService } = await import('../businessOwnerAnalyticsService');
      return businessOwnerAnalyticsService.getOwnerDashboard(workspaceId, period);
    },
    getFeatureUsageReport: async (workspaceId: string, period: string) => {
      const { businessOwnerAnalyticsService } = await import('../businessOwnerAnalyticsService');
      return businessOwnerAnalyticsService.getFeatureUsageReport(workspaceId, period);
    },
    getTeamEngagementReport: async (workspaceId: string, period: string) => {
      const { businessOwnerAnalyticsService } = await import('../businessOwnerAnalyticsService');
      return businessOwnerAnalyticsService.getTeamEngagementReport(workspaceId, period);
    },
  },

  // Platform-level stats
  platform: {
    getStats: async (workspaceId: string | null, bustCache: boolean = false) => {
      const { getAnalyticsStats } = await import('../analyticsStats');
      return getAnalyticsStats(workspaceId, bustCache);
    },
    clearCache: async () => {
      const { clearAnalyticsCache } = await import('../analyticsStats');
      clearAnalyticsCache();
    },
  },

  // Room/chat analytics
  rooms: {
    getAnalytics: async (workspaceId: string, roomId?: string, period?: string) => {
      const { roomAnalyticsService } = await import('../roomAnalyticsService');
      return roomAnalyticsService.getRoomsAnalytics(workspaceId, roomId, period);
    },
  },
};

export default unifiedAnalytics;
