// Health Check Types - Shared between frontend and backend
// Derived from schema enums to ensure type safety

export type ServiceStatus = 'operational' | 'degraded' | 'down';
export type ServiceKey = 'database' | 'chat_websocket' | 'gemini_ai' | 'object_storage' | 'stripe' | 'email' | 'quickbooks' | 'gusto';
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
