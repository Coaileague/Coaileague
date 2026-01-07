/**
 * Trinity Module - Domain aggregator for Trinity AI Brain functionality
 * 
 * This module provides a unified entry point for AI automation,
 * orchestration, and intelligence services.
 * 
 * Services:
 * - AI Brain: Core Trinity intelligence and skills
 * - Automation Toggle: Feature-level automation control
 * - Platform Action Hub: 350+ registered Trinity actions
 * - Event Subscriptions: Real-time sync and notifications
 * 
 * Routes: server/routes/trinity.ts, server/routes/automation.ts
 */

// Re-export platform event bus (commonly needed)
export * from '../../services/platformEventBus';

// Module documentation for IDE navigation
export const TRINITY_MODULE = {
  services: {
    aiBrain: '../../services/ai-brain',
    automationToggle: '../../services/automation/trinityAutomationToggle',
    platformActionHub: '../../services/ai-brain/platformActionHub',
    eventSubscriptions: '../../services/trinityEventSubscriptions',
    platformEventBus: '../../services/platformEventBus',
    diagnosticOrchestrator: '../../services/ai-brain/universalDiagnosticOrchestrator',
  },
  skills: {
    intelligentScheduler: '../../services/ai-brain/skills/intelligentScheduler',
    timeAnomalyDetection: '../../services/ai-brain/skills/timeAnomalyDetection',
    payrollValidation: '../../services/ai-brain/skills/payrollValidation',
    invoiceReconciliation: '../../services/ai-brain/skills/invoiceReconciliation',
  },
  subagents: '../../services/ai-brain/subagents',
  routes: {
    trinity: '../../routes/trinity',
    automation: '../../routes/automation',
    aiBrainControl: '../../routes/aiBrainControlRoutes',
  },
} as const;
