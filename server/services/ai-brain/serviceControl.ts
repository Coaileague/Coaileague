import { aiBrainEvents } from './internalEventEmitter';
import { db } from '../../db';
import { serviceControlStates } from '@shared/schema';
import { eq } from 'drizzle-orm';

export type OrchestrationServiceName = 
  | 'supervisory_agent'
  | 'scheduler_coordinator'
  | 'workflow_ledger'
  | 'commitment_manager'
  | 'realtime_bridge'
  | 'context_resolver'
  | 'master_orchestrator'
  | 'platform_change_monitor';

export type ServiceStatus = 'running' | 'paused' | 'stopped' | 'error' | 'starting';

interface ServiceState {
  name: OrchestrationServiceName;
  status: ServiceStatus;
  lastStarted: Date | null;
  lastPaused: Date | null;
  pausedBy: string | null;
  pauseReason: string | null;
  errorMessage: string | null;
  metrics: {
    tasksProcessed: number;
    errorsCount: number;
    lastActivityAt: Date | null;
  };
}

const ALL_SERVICES: OrchestrationServiceName[] = [
  'supervisory_agent',
  'scheduler_coordinator',
  'workflow_ledger',
  'commitment_manager',
  'realtime_bridge',
  'context_resolver',
  'master_orchestrator',
  'platform_change_monitor',
];

class ServiceControlManager {
  private serviceStates: Map<OrchestrationServiceName, ServiceState> = new Map();
  private pauseCallbacks: Map<OrchestrationServiceName, () => void> = new Map();
  private resumeCallbacks: Map<OrchestrationServiceName, () => void> = new Map();
  private persistenceReady = false;

  constructor() {
    this.initializeServices();
  }

  private initializeServices() {
    for (const name of ALL_SERVICES) {
      this.serviceStates.set(name, {
        name,
        status: 'running',
        lastStarted: new Date(),
        lastPaused: null,
        pausedBy: null,
        pauseReason: null,
        errorMessage: null,
        metrics: {
          tasksProcessed: 0,
          errorsCount: 0,
          lastActivityAt: null,
        },
      });
    }
  }

  async loadPersistedStates(): Promise<OrchestrationServiceName[]> {
    const pausedServices: OrchestrationServiceName[] = [];
    
    try {
      const rows = await db.select().from(serviceControlStates);
      
      for (const row of rows) {
        const serviceName = row.serviceName as OrchestrationServiceName;
        const state = this.serviceStates.get(serviceName);
        
        if (state && row.status === 'paused') {
          state.status = 'paused';
          state.pausedBy = row.pausedBy;
          state.pauseReason = row.pauseReason;
          state.lastPaused = row.pausedAt;
          state.lastStarted = row.lastStartedAt;
          pausedServices.push(serviceName);
          
          console.log(`[ServiceControl] Restored persisted pause state for ${serviceName} (paused by ${row.pausedBy})`);
        }
      }
      
      this.persistenceReady = true;
      
      if (pausedServices.length > 0) {
        console.log(`[ServiceControl] Persistence layer initialized - ${pausedServices.length} services remain paused from previous session`);
      } else {
        console.log('[ServiceControl] Persistence layer initialized - all services starting fresh');
      }
      
      return pausedServices;
    } catch (error) {
      console.error('[ServiceControl] Failed to load persisted states:', error);
      this.persistenceReady = true;
      return [];
    }
  }

  private async persistState(service: OrchestrationServiceName): Promise<void> {
    if (!this.persistenceReady) return;
    
    const state = this.serviceStates.get(service);
    if (!state) return;

    try {
      await db.insert(serviceControlStates)
        .values({
          serviceName: service,
          status: state.status,
          pausedBy: state.pausedBy,
          pauseReason: state.pauseReason,
          pausedAt: state.lastPaused,
          lastStartedAt: state.lastStarted,
          updatedAt: new Date(),
        })
        .onConflictDoUpdate({
          target: serviceControlStates.serviceName,
          set: {
            status: state.status,
            pausedBy: state.pausedBy,
            pauseReason: state.pauseReason,
            pausedAt: state.lastPaused,
            lastStartedAt: state.lastStarted,
            updatedAt: new Date(),
          },
        });
    } catch (error) {
      console.error(`[ServiceControl] Failed to persist state for ${service}:`, error);
    }
  }

  registerPauseCallback(service: OrchestrationServiceName, callback: () => void) {
    this.pauseCallbacks.set(service, callback);
  }

  registerResumeCallback(service: OrchestrationServiceName, callback: () => void) {
    this.resumeCallbacks.set(service, callback);
  }

  async pauseService(
    service: OrchestrationServiceName,
    userId: string,
    reason?: string
  ): Promise<{ success: boolean; message: string }> {
    const state = this.serviceStates.get(service);
    if (!state) {
      return { success: false, message: `Unknown service: ${service}` };
    }

    if (state.status === 'paused') {
      return { success: false, message: `Service ${service} is already paused` };
    }

    const pauseCallback = this.pauseCallbacks.get(service);
    if (pauseCallback) {
      try {
        pauseCallback();
      } catch (error) {
        console.error(`[ServiceControl] Error pausing ${service}:`, error);
        return { success: false, message: `Failed to pause ${service}: ${error}` };
      }
    }

    state.status = 'paused';
    state.lastPaused = new Date();
    state.pausedBy = userId;
    state.pauseReason = reason || null;

    await this.persistState(service);

    aiBrainEvents.emit('service_state_changed', {
      service,
      status: 'paused',
      userId,
      reason,
      timestamp: new Date().toISOString(),
    });

    console.log(`[ServiceControl] Service ${service} paused by ${userId}${reason ? `: ${reason}` : ''}`);
    return { success: true, message: `Service ${service} paused successfully` };
  }

  async resumeService(
    service: OrchestrationServiceName,
    userId: string
  ): Promise<{ success: boolean; message: string }> {
    const state = this.serviceStates.get(service);
    if (!state) {
      return { success: false, message: `Unknown service: ${service}` };
    }

    if (state.status === 'running') {
      return { success: false, message: `Service ${service} is already running` };
    }

    const resumeCallback = this.resumeCallbacks.get(service);
    if (resumeCallback) {
      try {
        resumeCallback();
      } catch (error) {
        console.error(`[ServiceControl] Error resuming ${service}:`, error);
        return { success: false, message: `Failed to resume ${service}: ${error}` };
      }
    }

    state.status = 'running';
    state.lastStarted = new Date();
    state.pausedBy = null;
    state.pauseReason = null;

    await this.persistState(service);

    aiBrainEvents.emit('service_state_changed', {
      service,
      status: 'running',
      userId,
      timestamp: new Date().toISOString(),
    });

    console.log(`[ServiceControl] Service ${service} resumed by ${userId}`);
    return { success: true, message: `Service ${service} resumed successfully` };
  }

  getServiceStatus(service: OrchestrationServiceName): ServiceState | null {
    return this.serviceStates.get(service) || null;
  }

  getAllServicesStatus(): ServiceState[] {
    return Array.from(this.serviceStates.values());
  }

  updateServiceMetrics(
    service: OrchestrationServiceName,
    metrics: Partial<ServiceState['metrics']>
  ) {
    const state = this.serviceStates.get(service);
    if (state) {
      state.metrics = { ...state.metrics, ...metrics };
    }
  }

  setServiceError(service: OrchestrationServiceName, error: string) {
    const state = this.serviceStates.get(service);
    if (state) {
      state.status = 'error';
      state.errorMessage = error;
      state.metrics.errorsCount++;

      aiBrainEvents.emit('service_error', {
        service,
        error,
        timestamp: new Date().toISOString(),
      });
    }
  }

  clearServiceError(service: OrchestrationServiceName) {
    const state = this.serviceStates.get(service);
    if (state && state.status === 'error') {
      state.status = 'running';
      state.errorMessage = null;
    }
  }

  isServiceRunning(service: OrchestrationServiceName): boolean {
    const state = this.serviceStates.get(service);
    return state?.status === 'running';
  }

  getHealthSummary(): {
    overall: 'healthy' | 'degraded' | 'unhealthy';
    services: ServiceState[];
    runningCount: number;
    pausedCount: number;
    errorCount: number;
  } {
    const services = this.getAllServicesStatus();
    const runningCount = services.filter(s => s.status === 'running').length;
    const pausedCount = services.filter(s => s.status === 'paused').length;
    const errorCount = services.filter(s => s.status === 'error').length;

    let overall: 'healthy' | 'degraded' | 'unhealthy' = 'healthy';
    if (errorCount > 0) {
      overall = errorCount > services.length / 2 ? 'unhealthy' : 'degraded';
    } else if (pausedCount > services.length / 2) {
      overall = 'degraded';
    }

    return {
      overall,
      services,
      runningCount,
      pausedCount,
      errorCount,
    };
  }

  getPersistedServicesToRestore(): OrchestrationServiceName[] {
    return Array.from(this.serviceStates.entries())
      .filter(([_, state]) => state.status === 'paused')
      .map(([name, _]) => name);
  }
}

export const serviceControlManager = new ServiceControlManager();
