// Health Check Types - Shared between frontend and backend
// Derived from schema enums to ensure type safety

export type ServiceStatus = 'operational' | 'degraded' | 'down';

// Core services (original)
export type CoreServiceKey = 'database' | 'chat_websocket' | 'gemini_ai' | 'object_storage' | 'stripe' | 'email' | 'quickbooks' | 'gusto';

// Extended services for comprehensive diagnostics
export type ExtendedServiceKey = 
  // Infrastructure
  | 'session_store' | 'websocket_server' | 'rate_limiter' | 'cache_layer'
  // AI Brain
  | 'ai_orchestrator' | 'trinity_ai' | 'helpai' | 'subagent_supervisor' | 'knowledge_service' | 'fast_mode' | 'execution_fabric'
  // Communication
  | 'email_service' | 'sms_service' | 'chat_hub' | 'notification_ws'
  // Scheduling
  | 'scheduling_engine' | 'autonomous_scheduler' | 'calendar_sync' | 'availability_service' | 'breaks_service'
  // Billing
  | 'payroll_service' | 'invoicing' | 'credit_system'
  // Analytics
  | 'analytics_engine' | 'ai_analytics' | 'usage_analytics'
  // Compliance
  | 'compliance_monitor' | 'audit_logger' | 'dispute_resolution'
  // Automation
  | 'automation_engine' | 'automation_governance' | 'platform_monitor'
  // Storage
  | 'file_upload'
  // Notifications
  | 'notification_service' | 'whats_new' | 'event_bus'
  // Security
  | 'rbac_service' | 'session_elevation' | 'encryption'
  // Gamification
  | 'gamification' | 'seasonal_themes';

// Combined service key type for all diagnostics
export type ServiceKey = CoreServiceKey | ExtendedServiceKey;

export type ErrorType = 'connection_failed' | 'timeout' | 'server_error' | 'unknown';
export type IncidentStatus = 'submitted' | 'triaged' | 'resolved' | 'dismissed';

export interface ServiceHealth {
  service: ServiceKey;
  status: ServiceStatus;
  isCritical: boolean; // If false, won't mark overall platform as "down"
  message?: string;
  lastChecked: string; // ISO timestamp
  latencyMs?: number;
  metadata?: Record<string, any>;
}

export interface HealthSummary {
  overall: ServiceStatus; // Calculated based on critical services only
  services: ServiceHealth[];
  timestamp: string; // ISO timestamp
  criticalServicesCount: number;
  operationalServicesCount: number;
}

export interface ServiceIncidentReportPayload {
  serviceKey: ServiceKey;
  errorType: ErrorType;
  userMessage?: string;
  errorMessage?: string;
  stackTrace?: string;
  metadata?: {
    url?: string;
    userAgent?: string;
    viewport?: { width: number; height: number };
    [key: string]: any;
  };
}
