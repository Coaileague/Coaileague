import type { ServiceHealth, ServiceStatus, HealthSummary } from '../../shared/healthTypes';
import { 
  checkDatabase, 
  checkChatWebSocket, 
  checkGeminiAI, 
  checkObjectStorage, 
  checkStripe, 
  checkEmail,
  getHealthSummary as getBasicHealthSummary 
} from './healthCheck';
import {
  DIAGNOSTIC_SERVICE_REGISTRY,
  runComprehensiveDiagnostics,
  runFastModeBatchDiagnostics,
  runParallelDiagnostics,
  getServicesByDomain,
  getServicesByTier,
  getCriticalServices,
  getAllDomains,
  DOMAIN_LABELS,
  type ComprehensiveDiagnosticResult,
  type DiagnosticDomain,
} from './diagnosticServiceRegistry';
import { createLogger } from '../lib/logger';
const log = createLogger('healthService');


export interface SystemMetrics {
  memory: {
    heapUsed: number;
    heapTotal: number;
    external: number;
    rss: number;
    heapUsedPercent: number;
  };
  cpu: {
    user: number;
    system: number;
    totalPercent: number;
  };
  uptime: number;
  timestamp: string;
}

export interface ResponseTimeMetric {
  service: string;
  latencyMs: number;
  timestamp: string;
}

export interface ServiceUptimeRecord {
  service: string;
  status: ServiceStatus;
  uptimePercent: number;
  lastDowntime: string | null;
  checksTotal: number;
  checksSuccessful: number;
}

export interface ErrorLogEntry {
  id: string;
  service: string;
  message: string;
  timestamp: string;
  severity: 'warning' | 'error' | 'critical';
}

export interface DetailedHealthReport {
  success: boolean;
  data: {
    overall: ServiceStatus;
    systemMetrics: SystemMetrics;
    services: ServiceHealth[];
    responseTimeHistory: ResponseTimeMetric[];
    uptimeRecords: ServiceUptimeRecord[];
    errorLogs: ErrorLogEntry[];
    platformReadiness: 'ready' | 'degraded' | 'critical';
    timestamp: string;
  };
}

const MAX_RESPONSE_TIME_HISTORY = 100;
const MAX_ERROR_LOGS = 50;

const responseTimeHistory: ResponseTimeMetric[] = [];
const errorLogs: ErrorLogEntry[] = [];
const serviceUptimeData: Map<string, { 
  checksTotal: number; 
  checksSuccessful: number; 
  lastDowntime: string | null;
}> = new Map();

let lastCpuUsage = process.cpuUsage();
let lastCpuTime = Date.now();
let startTime = Date.now();

export function getSystemMetrics(): SystemMetrics {
  const memoryUsage = process.memoryUsage();
  
  const currentCpuUsage = process.cpuUsage(lastCpuUsage);
  const currentTime = Date.now();
  const elapsedTime = (currentTime - lastCpuTime) * 1000;
  
  const userCpuPercent = (currentCpuUsage.user / elapsedTime) * 100;
  const systemCpuPercent = (currentCpuUsage.system / elapsedTime) * 100;
  
  lastCpuUsage = process.cpuUsage();
  lastCpuTime = currentTime;
  
  return {
    memory: {
      heapUsed: Math.round(memoryUsage.heapUsed / 1024 / 1024),
      heapTotal: Math.round(memoryUsage.heapTotal / 1024 / 1024),
      external: Math.round(memoryUsage.external / 1024 / 1024),
      rss: Math.round(memoryUsage.rss / 1024 / 1024),
      heapUsedPercent: Math.round((memoryUsage.heapUsed / memoryUsage.heapTotal) * 100),
    },
    cpu: {
      user: Math.round(userCpuPercent * 100) / 100,
      system: Math.round(systemCpuPercent * 100) / 100,
      totalPercent: Math.min(100, Math.round((userCpuPercent + systemCpuPercent) * 100) / 100),
    },
    uptime: Math.round((Date.now() - startTime) / 1000),
    timestamp: new Date().toISOString(),
  };
}

function recordResponseTime(service: string, latencyMs: number): void {
  responseTimeHistory.push({
    service,
    latencyMs,
    timestamp: new Date().toISOString(),
  });
  
  if (responseTimeHistory.length > MAX_RESPONSE_TIME_HISTORY) {
    responseTimeHistory.shift();
  }
}

function updateUptimeRecord(service: string, isHealthy: boolean): void {
  const existing = serviceUptimeData.get(service) || {
    checksTotal: 0,
    checksSuccessful: 0,
    lastDowntime: null,
  };
  
  existing.checksTotal++;
  if (isHealthy) {
    existing.checksSuccessful++;
  } else {
    existing.lastDowntime = new Date().toISOString();
  }
  
  serviceUptimeData.set(service, existing);
}

export function logError(service: string, message: string, severity: 'warning' | 'error' | 'critical'): void {
  const entry: ErrorLogEntry = {
    id: `err-${Date.now()}-${crypto.randomUUID().slice(0, 9)}`,
    service,
    message,
    timestamp: new Date().toISOString(),
    severity,
  };
  
  errorLogs.unshift(entry);
  
  if (errorLogs.length > MAX_ERROR_LOGS) {
    errorLogs.pop();
  }
}

function getUptimeRecords(): ServiceUptimeRecord[] {
  const services = ['database', 'chat_websocket', 'gemini_ai', 'object_storage', 'stripe', 'email'];
  
  return services.map(service => {
    const data = serviceUptimeData.get(service);
    if (!data || data.checksTotal === 0) {
      return {
        service,
        status: 'operational' as ServiceStatus,
        uptimePercent: 100,
        lastDowntime: null,
        checksTotal: 0,
        checksSuccessful: 0,
      };
    }
    
    const uptimePercent = Math.round((data.checksSuccessful / data.checksTotal) * 10000) / 100;
    const status: ServiceStatus = uptimePercent >= 99 ? 'operational' : uptimePercent >= 95 ? 'degraded' : 'down';
    
    return {
      service,
      status,
      uptimePercent,
      lastDowntime: data.lastDowntime,
      checksTotal: data.checksTotal,
      checksSuccessful: data.checksSuccessful,
    };
  });
}

export async function getDetailedHealthReport(): Promise<DetailedHealthReport> {
  const startMs = Date.now();
  
  const [
    dbHealth,
    wsHealth,
    geminiHealth,
    storageHealth,
    stripeHealth,
    emailHealth,
  ] = await Promise.all([
    checkDatabase(),
    checkChatWebSocket(),
    checkGeminiAI(),
    checkObjectStorage(),
    checkStripe(),
    checkEmail(),
  ]);
  
  const services = [dbHealth, wsHealth, geminiHealth, storageHealth, stripeHealth, emailHealth];
  
  services.forEach(service => {
    if (service.latencyMs !== undefined) {
      recordResponseTime(service.service, service.latencyMs);
    }
    updateUptimeRecord(service.service, service.status === 'operational');
    
    if (service.status === 'down') {
      logError(service.service, service.message || 'Service is down', 'critical');
    } else if (service.status === 'degraded') {
      logError(service.service, service.message || 'Service is degraded', 'warning');
    }
  });
  
  const totalCheckTime = Date.now() - startMs;
  recordResponseTime('health_check_total', totalCheckTime);
  
  const criticalServices = services.filter(s => s.isCritical);
  const hasCriticalDown = criticalServices.some(s => s.status === 'down');
  const hasCriticalDegraded = criticalServices.some(s => s.status === 'degraded');
  
  const overall: ServiceStatus = hasCriticalDown ? 'down' : hasCriticalDegraded ? 'degraded' : 'operational';
  const platformReadiness: 'ready' | 'degraded' | 'critical' = 
    hasCriticalDown ? 'critical' : hasCriticalDegraded ? 'degraded' : 'ready';
  
  return {
    success: true,
    data: {
      overall,
      systemMetrics: getSystemMetrics(),
      services,
      responseTimeHistory: responseTimeHistory.slice(-50),
      uptimeRecords: getUptimeRecords(),
      errorLogs: errorLogs.slice(0, 20),
      platformReadiness,
      timestamp: new Date().toISOString(),
    },
  };
}

export function getResponseTimeHistory(service?: string, limit: number = 50): ResponseTimeMetric[] {
  let history = responseTimeHistory;
  
  if (service) {
    history = history.filter(r => r.service === service);
  }
  
  return history.slice(-limit);
}

export function getErrorLogs(limit: number = 20): ErrorLogEntry[] {
  return errorLogs.slice(0, limit);
}

export function clearErrorLogs(): void {
  errorLogs.length = 0;
}

export function resetStartTime(): void {
  startTime = Date.now();
}

export function getServiceUptime(service: string): ServiceUptimeRecord | null {
  const records = getUptimeRecords();
  return records.find(r => r.service === service) || null;
}

export async function runHealthCheck(): Promise<HealthSummary> {
  const report = await getDetailedHealthReport();
  return {
    overall: report.data.overall,
    services: report.data.services,
    timestamp: report.data.timestamp,
    criticalServicesCount: report.data.services.filter(s => s.isCritical).length,
    operationalServicesCount: report.data.services.filter(s => s.status === 'operational').length,
  };
}

// COMPREHENSIVE DIAGNOSTICS - For Trinity FAST Mode
// Exposes all 45+ platform service checks for parallel execution

export {
  DIAGNOSTIC_SERVICE_REGISTRY,
  runComprehensiveDiagnostics,
  runFastModeBatchDiagnostics,
  runParallelDiagnostics,
  getServicesByDomain,
  getServicesByTier,
  getCriticalServices,
  getAllDomains,
  DOMAIN_LABELS,
};

export type { ComprehensiveDiagnosticResult, DiagnosticDomain };

export async function runTrinityFastDiagnostics(mode: 'quick' | 'full' = 'full'): Promise<ComprehensiveDiagnosticResult> {
  log.info(`[HealthService] Running Trinity FAST diagnostics (${mode} mode)...`);
  const startTime = Date.now();
  
  if (mode === 'quick') {
    // Quick mode: Only critical + essential services (~20 checks)
    const criticalAndEssential = DIAGNOSTIC_SERVICE_REGISTRY.filter(
      s => s.tier === 'core' || s.tier === 'essential'
    );
    const results = await runParallelDiagnostics(criticalAndEssential);
    
    const byDomain: Record<DiagnosticDomain, { status: ServiceStatus; services: ServiceHealth[] }> = {} as any;
    const domains = getAllDomains();
    
    for (const domain of domains) {
      const domainServices = results.filter(r => {
        const service = criticalAndEssential.find(s => s.id === r.service);
        return service?.domain === domain;
      });
      
      if (domainServices.length === 0) {
        byDomain[domain] = { status: 'operational', services: [] };
        continue;
      }
      
      const hasDown = domainServices.some(s => s.status === 'down');
      const hasDegraded = domainServices.some(s => s.status === 'degraded');
      
      byDomain[domain] = {
        status: hasDown ? 'down' : hasDegraded ? 'degraded' : 'operational',
        services: domainServices,
      };
    }
    
    const downCount = results.filter(r => r.status === 'down').length;
    const degradedCount = results.filter(r => r.status === 'degraded').length;
    const operationalCount = results.filter(r => r.status === 'operational').length;
    
    const criticalDown = results.some(r => r.status === 'down' && r.isCritical);
    const criticalDegraded = results.some(r => r.status === 'degraded' && r.isCritical);
    
    log.info(`[HealthService] Quick diagnostics complete: ${results.length} services in ${Date.now() - startTime}ms`);
    
    return {
      overall: criticalDown ? 'down' : criticalDegraded ? 'degraded' : 'operational',
      totalServices: results.length,
      operationalCount,
      degradedCount,
      downCount,
      byDomain,
      executionTimeMs: Date.now() - startTime,
      timestamp: new Date().toISOString(),
    };
  }
  
  // Full mode: All services with FAST parallel batch execution
  const result = await runFastModeBatchDiagnostics(15); // 15 services per batch
  log.info(`[HealthService] Full diagnostics complete: ${result.totalServices} services in ${result.executionTimeMs}ms`);
  return result;
}
