/**
 * ServiceOrchestrationWatchdog - AI Brain Service Discovery & Compliance
 * 
 * Monitors all platform services to ensure they are properly registered
 * with the AI Brain Master Orchestrator. Detects "rebel" or "orphan" services
 * running outside Trinity's control and hooks them into the orchestration brain.
 * 
 * Features:
 * - Service registry scanning
 * - Orphan service detection
 * - Automatic registration with AI Brain
 * - Health monitoring integration
 * - Hotpatch/hotswap capability for service updates
 */

import { platformEventBus, PlatformEventType, PlatformEvent } from '../platformEventBus';
import { UnifiedGeminiClient } from './providers/geminiClient';

// Service registration status
export interface RegisteredService {
  id: string;
  name: string;
  category: ServiceCategory;
  status: 'active' | 'inactive' | 'error' | 'orphan' | 'rebel';
  registeredAt: Date;
  lastHeartbeat: Date;
  orchestratedBy: 'trinity' | 'ai-brain' | 'standalone' | 'unknown';
  capabilities: string[];
  healthScore: number; // 0-100
  issueCount: number;
  metadata: Record<string, any>;
}

export type ServiceCategory = 
  | 'ai-brain'
  | 'subagent'
  | 'scheduling'
  | 'payroll'
  | 'notifications'
  | 'analytics'
  | 'storage'
  | 'authentication'
  | 'billing'
  | 'integration'
  | 'communication'
  | 'compliance'
  | 'automation'
  | 'utility';

// Known services that should be orchestrated
const EXPECTED_SERVICES: Array<{ id: string; name: string; category: ServiceCategory }> = [
  // AI Brain Core
  { id: 'gemini-client', name: 'Unified Gemini Client', category: 'ai-brain' },
  { id: 'model-routing-engine', name: 'Model Routing Engine', category: 'ai-brain' },
  { id: 'trinity-memory', name: 'Trinity Memory Service', category: 'ai-brain' },
  { id: 'tool-capability-registry', name: 'Tool Capability Registry', category: 'ai-brain' },
  { id: 'knowledge-orchestration', name: 'Knowledge Orchestration Service', category: 'ai-brain' },
  { id: 'helpai-orchestrator', name: 'HelpAI Action Orchestrator', category: 'ai-brain' },
  { id: 'trinity-fast-diagnostic', name: 'Trinity FAST Diagnostic', category: 'ai-brain' },
  
  // Subagents
  { id: 'subagent-supervisor', name: 'Subagent Supervisor', category: 'subagent' },
  { id: 'seasonal-subagent', name: 'Seasonal Theme Orchestrator', category: 'subagent' },
  { id: 'data-migration-agent', name: 'Data Migration Subagent', category: 'subagent' },
  { id: 'gamification-agent', name: 'Gamification Activation Agent', category: 'subagent' },
  { id: 'onboarding-orchestrator', name: 'Onboarding Orchestrator', category: 'subagent' },
  { id: 'elevated-session-guardian', name: 'Elevated Session Guardian', category: 'subagent' },
  { id: 'confidence-monitor', name: 'Subagent Confidence Monitor', category: 'subagent' },
  
  // Core Services
  { id: 'notification-service', name: 'Notification Orchestration', category: 'notifications' },
  { id: 'websocket-service', name: 'WebSocket Real-time Service', category: 'communication' },
  { id: 'session-sync', name: 'Session Sync Service', category: 'communication' },
  { id: 'chat-server-hub', name: 'Chat Server Hub', category: 'communication' },
  
  // Business Services
  { id: 'scheduling-service', name: 'Scheduling Engine', category: 'scheduling' },
  { id: 'payroll-service', name: 'Payroll Processing', category: 'payroll' },
  { id: 'billing-service', name: 'Client Billing Service', category: 'billing' },
  { id: 'stripe-integration', name: 'Stripe Payment Integration', category: 'billing' },
  { id: 'email-service', name: 'Resend Email Service', category: 'communication' },
  { id: 'sms-service', name: 'Twilio SMS Service', category: 'communication' },
  
  // Automation
  { id: 'cron-scheduler', name: 'Automation Job Scheduler', category: 'automation' },
  { id: 'workboard-service', name: 'AI Workboard Queue', category: 'automation' },
  { id: 'swarm-commander', name: 'Swarm Commander', category: 'automation' },
  
  // Analytics & Compliance
  { id: 'analytics-service', name: 'Analytics Dashboard Service', category: 'analytics' },
  { id: 'compliance-service', name: 'Compliance Monitoring', category: 'compliance' },
  { id: 'break-compliance', name: 'Break Compliance Engine', category: 'compliance' },
  { id: 'audit-service', name: 'Audit Logging Service', category: 'compliance' },
];

// Singleton instance
let watchdogInstance: ServiceOrchestrationWatchdog | null = null;

export class ServiceOrchestrationWatchdog {
  private registeredServices: Map<string, RegisteredService> = new Map();
  private orphanServices: Map<string, RegisteredService> = new Map();
  private scanInterval: NodeJS.Timeout | null = null;
  private readonly SCAN_INTERVAL_MS = 5 * 60 * 1000; // Scan every 5 minutes
  private geminiClient: UnifiedGeminiClient;

  constructor() {
    this.geminiClient = new UnifiedGeminiClient();
    this.initializeExpectedServices();
    console.log('[ServiceWatchdog] Initialized - Monitoring platform service orchestration');
  }

  /**
   * Initialize expected services in the registry
   * Note: Services start as 'pending' (not 'inactive') to avoid false orphan detection
   * during startup grace period
   */
  private initializeExpectedServices(): void {
    const now = new Date();
    for (const service of EXPECTED_SERVICES) {
      this.registeredServices.set(service.id, {
        id: service.id,
        name: service.name,
        category: service.category,
        status: 'inactive', // Will be updated when service registers
        registeredAt: now,
        lastHeartbeat: now, // Initialize with current time to avoid immediate orphan detection
        orchestratedBy: 'trinity', // Assume Trinity orchestration for expected services
        capabilities: [],
        healthScore: 50, // Start with neutral health
        issueCount: 0,
        metadata: { initialized: true, startupGrace: true },
      });
    }
  }

  private startupTime: Date = new Date();
  private readonly STARTUP_GRACE_PERIOD_MS = 3 * 60 * 1000; // 3 minutes grace period on startup

  /**
   * Start the watchdog monitoring
   */
  async start(): Promise<void> {
    console.log('[ServiceWatchdog] Starting service orchestration monitoring...');
    this.startupTime = new Date();
    
    // Register self FIRST before any scanning
    this.registerService({
      id: 'service-orchestration-watchdog',
      name: 'Service Orchestration Watchdog',
      category: 'ai-brain',
      capabilities: ['service-discovery', 'orphan-detection', 'health-monitoring', 'hotswap'],
      orchestratedBy: 'trinity',
    });

    // Subscribe to AI brain events for service registration
    platformEventBus.subscribe('ai_brain_action', {
      name: 'ServiceWatchdog',
      handler: async (event: PlatformEvent) => {
        if (event.metadata?.subagentId) {
          this.handleServiceRegistration(event.metadata);
        }
      },
    });

    // Delay initial scan to allow services to register during startup
    console.log('[ServiceWatchdog] Waiting for startup grace period before first scan...');
    setTimeout(async () => {
      await this.scanForOrphanServices();
    }, this.STARTUP_GRACE_PERIOD_MS);

    // Set up periodic scanning (after grace period)
    this.scanInterval = setInterval(async () => {
      await this.scanForOrphanServices();
    }, this.SCAN_INTERVAL_MS);

    // Publish registration event
    await platformEventBus.publish({
      type: 'ai_brain_action' as PlatformEventType,
      category: 'ai_brain',
      title: 'Service Watchdog Active',
      description: 'Service orchestration watchdog is now monitoring for orphan and rebel services',
      metadata: {
        serviceId: 'service-orchestration-watchdog',
        capabilities: ['service-discovery', 'orphan-detection', 'health-monitoring', 'hotswap'],
        status: 'active',
      },
    });

    console.log('[ServiceWatchdog] Monitoring active (first scan after 3min grace period)');
  }

  /**
   * Stop the watchdog
   */
  stop(): void {
    if (this.scanInterval) {
      clearInterval(this.scanInterval);
      this.scanInterval = null;
    }
    console.log('[ServiceWatchdog] Stopped monitoring');
  }

  /**
   * Register a service with the orchestration brain
   */
  registerService(config: {
    id: string;
    name: string;
    category: ServiceCategory;
    capabilities: string[];
    orchestratedBy: 'trinity' | 'ai-brain' | 'standalone';
    metadata?: Record<string, any>;
  }): void {
    const existing = this.registeredServices.get(config.id);
    
    const service: RegisteredService = {
      id: config.id,
      name: config.name,
      category: config.category,
      status: 'active',
      registeredAt: existing?.registeredAt || new Date(),
      lastHeartbeat: new Date(),
      orchestratedBy: config.orchestratedBy,
      capabilities: config.capabilities,
      healthScore: 100,
      issueCount: 0,
      metadata: config.metadata || {},
    };

    this.registeredServices.set(config.id, service);
    
    // Remove from orphans if it was there
    this.orphanServices.delete(config.id);

    console.log(`[ServiceWatchdog] Service registered: ${config.name} (${config.id})`);
  }

  /**
   * Handle service registration from events
   */
  private handleServiceRegistration(metadata: Record<string, any>): void {
    const id = metadata.subagentId || metadata.serviceId;
    if (!id) return;
    
    const existing = this.registeredServices.get(id);
    
    if (existing) {
      existing.status = 'active';
      existing.lastHeartbeat = new Date();
      existing.orchestratedBy = 'trinity';
      if (metadata.capabilities) {
        existing.capabilities = metadata.capabilities;
      }
    } else {
      // New service discovered
      this.registerService({
        id,
        name: metadata.name || `Service ${id}`,
        category: metadata.category || 'utility',
        capabilities: metadata.capabilities || [],
        orchestratedBy: 'trinity',
        metadata,
      });
    }
  }

  /**
   * Record heartbeat from a service
   */
  recordHeartbeat(serviceId: string, healthScore?: number): void {
    const service = this.registeredServices.get(serviceId);
    
    if (service) {
      service.lastHeartbeat = new Date();
      service.status = 'active';
      if (healthScore !== undefined) {
        service.healthScore = healthScore;
      }
    }
  }

  /**
   * Handle service errors
   */
  recordServiceError(serviceId: string, error: string): void {
    const service = this.registeredServices.get(serviceId);
    
    if (service) {
      service.status = 'error';
      service.issueCount++;
      service.healthScore = Math.max(0, service.healthScore - 10);
      
      // Notify Trinity about the issue
      this.notifyTrinityOfIssue(service, error);
    }
  }

  /**
   * Services to exclude from orphan/rebel detection
   * These are core system services that don't need heartbeat monitoring
   */
  private readonly EXCLUDED_FROM_ORPHAN_DETECTION = new Set([
    'service-orchestration-watchdog', // Self - always exclude
    'gemini-client', // Stateless utility
    'model-routing-engine', // Stateless utility
  ]);

  /**
   * Scan for orphan/rebel services
   */
  async scanForOrphanServices(): Promise<void> {
    console.log('[ServiceWatchdog] Scanning for orphan/rebel services...');
    
    const now = new Date();
    const staleThreshold = 10 * 60 * 1000; // 10 minutes
    const timeSinceStartup = now.getTime() - this.startupTime.getTime();
    
    // During startup grace period, only check for explicit rebels
    const inGracePeriod = timeSinceStartup < this.STARTUP_GRACE_PERIOD_MS;
    if (inGracePeriod) {
      console.log(`[ServiceWatchdog] Still in startup grace period (${Math.round(timeSinceStartup / 1000)}s elapsed), skipping orphan detection`);
      return;
    }
    
    let orphansFound = 0;
    let rebelsFound = 0;

    for (const [id, service] of this.registeredServices) {
      // Skip excluded services
      if (this.EXCLUDED_FROM_ORPHAN_DETECTION.has(id)) {
        continue;
      }
      
      // Skip services that are still in their initial state (never actually started)
      if (service.metadata?.startupGrace && service.status === 'inactive') {
        continue;
      }
      
      const timeSinceHeartbeat = now.getTime() - service.lastHeartbeat.getTime();
      
      // Only mark as orphan if service was previously active and stopped heartbeating
      if (service.status === 'active' && timeSinceHeartbeat > staleThreshold) {
        service.status = 'orphan';
        this.orphanServices.set(id, service);
        orphansFound++;
        console.log(`[ServiceWatchdog] Orphan detected: ${service.name} (no heartbeat for ${Math.round(timeSinceHeartbeat / 1000)}s)`);
      }
      
      // Only flag as rebel if explicitly marked as standalone
      if (service.orchestratedBy === 'standalone') {
        service.status = 'rebel';
        rebelsFound++;
        console.log(`[ServiceWatchdog] Rebel service detected: ${service.name} (running outside Trinity orchestration)`);
      }
    }

    if (orphansFound > 0 || rebelsFound > 0) {
      // Publish orchestration alert
      await platformEventBus.publish({
        type: 'ai_escalation' as PlatformEventType,
        category: 'diagnostic',
        title: 'Service Orchestration Alert',
        description: `Detected ${orphansFound} orphan and ${rebelsFound} rebel services requiring attention`,
        metadata: {
          alertType: 'service_compliance',
          orphansFound,
          rebelsFound,
          orphanServices: Array.from(this.orphanServices.values()).map(s => ({
            id: s.id,
            name: s.name,
            lastHeartbeat: s.lastHeartbeat.toISOString(),
          })),
          severity: rebelsFound > 0 ? 'high' : 'medium',
        },
      });

      // Use AI to analyze and recommend actions
      await this.analyzeOrchestrationIssues();
    } else {
      console.log('[ServiceWatchdog] All services healthy - no orphans or rebels detected');
    }

    console.log(`[ServiceWatchdog] Scan complete. Orphans: ${orphansFound}, Rebels: ${rebelsFound}`);
  }

  /**
   * Detect a rebel service trying to operate outside orchestration
   */
  private detectRebelService(serviceId: string, payload: Record<string, any>): void {
    console.log(`[ServiceWatchdog] Rebel service detected: ${serviceId}`);
    
    const rebelService: RegisteredService = {
      id: serviceId,
      name: payload.name || `Unknown Service (${serviceId})`,
      category: 'utility',
      status: 'rebel',
      registeredAt: new Date(),
      lastHeartbeat: new Date(),
      orchestratedBy: 'standalone',
      capabilities: [],
      healthScore: 50, // Unknown health
      issueCount: 0,
      metadata: payload,
    };

    this.orphanServices.set(serviceId, rebelService);
    
    // Attempt to hook into orchestration
    this.attemptServiceHooking(rebelService);
  }

  /**
   * Attempt to hook a rebel service into Trinity orchestration
   */
  private async attemptServiceHooking(service: RegisteredService): Promise<boolean> {
    console.log(`[ServiceWatchdog] Attempting to hook service: ${service.name}`);
    
    // Publish hook request
    await platformEventBus.publish({
      type: 'ai_suggestion' as PlatformEventType,
      category: 'ai_brain',
      title: 'Service Integration Request',
      description: `Requesting ${service.name} to integrate with Trinity orchestration`,
      metadata: {
        serviceId: service.id,
        serviceName: service.name,
        requestedBy: 'ServiceOrchestrationWatchdog',
        action: 'integrate_with_trinity',
      },
    });

    // If service responds, it will be registered
    return true;
  }

  /**
   * Use AI to analyze orchestration issues and recommend fixes
   */
  private async analyzeOrchestrationIssues(): Promise<void> {
    const orphans = Array.from(this.orphanServices.values());
    if (orphans.length === 0) return;

    const prompt = `You are the Service Orchestration Watchdog for CoAIleague platform.
Analyze these orphan/rebel services and recommend actions:

${JSON.stringify(orphans, null, 2)}

For each service, provide:
1. Likely cause of orphan/rebel status
2. Recommended action (restart, hook, investigate, ignore)
3. Priority (critical, high, medium, low)
4. Hotpatch possible? (yes/no)

Respond in JSON format:
{
  "analysis": [
    {
      "serviceId": "...",
      "cause": "...",
      "action": "restart|hook|investigate|ignore",
      "priority": "critical|high|medium|low",
      "hotpatchable": true/false,
      "suggestedFix": "..."
    }
  ],
  "overallRisk": "low|medium|high|critical",
  "summary": "..."
}`;

    try {
      const response = await this.geminiClient.generate({
        featureKey: 'orchestration_analysis',
        systemPrompt: 'You are an AI service orchestration analyst.',
        userMessage: prompt,
        modelTier: 'CONVERSATIONAL', // Use Flash for quick analysis
        antiYapPreset: 'supervisor',
      });

      if (response.text) {
        const jsonMatch = response.text.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          const analysis = JSON.parse(jsonMatch[0]);
          
          // Publish analysis results
          await platformEventBus.publish({
            type: 'ai_brain_action' as PlatformEventType,
            category: 'diagnostic',
            title: 'Orchestration Analysis Complete',
            description: analysis.summary || 'AI analysis of orphan/rebel services completed',
            metadata: {
              analysisType: 'orchestration_compliance',
              ...analysis,
            },
          });

          console.log(`[ServiceWatchdog] AI Analysis: ${analysis.summary}`);
        }
      }
    } catch (error) {
      console.error('[ServiceWatchdog] Failed to analyze orchestration issues:', error);
    }
  }

  /**
   * Notify Trinity about a service issue
   */
  private async notifyTrinityOfIssue(service: RegisteredService, error: string): Promise<void> {
    await platformEventBus.publish({
      type: 'ai_error' as PlatformEventType,
      category: 'error',
      title: `Service Issue: ${service.name}`,
      description: error,
      metadata: {
        alertType: 'service_issue',
        serviceId: service.id,
        serviceName: service.name,
        healthScore: service.healthScore,
        issueCount: service.issueCount,
        suggestedAction: service.issueCount > 3 ? 'restart_service' : 'investigate',
        severity: service.issueCount > 3 ? 'high' : 'medium',
      },
    });
  }

  /**
   * Request hotpatch for a service
   */
  async requestHotpatch(serviceId: string, patchConfig: {
    type: 'config' | 'code' | 'restart';
    payload: any;
    requiresApproval: boolean;
  }): Promise<{ success: boolean; message: string }> {
    const service = this.registeredServices.get(serviceId);
    if (!service) {
      return { success: false, message: `Service not found: ${serviceId}` };
    }

    console.log(`[ServiceWatchdog] Hotpatch requested for ${service.name}: ${patchConfig.type}`);

    if (patchConfig.requiresApproval) {
      // Create workflow for approval
      await platformEventBus.publish({
        type: 'ai_suggestion' as PlatformEventType,
        category: 'ai_brain',
        title: 'Hotpatch Approval Required',
        description: `Service ${service.name} requires a ${patchConfig.type} hotpatch`,
        metadata: {
          workflowType: 'service_hotpatch',
          targetService: serviceId,
          serviceName: service.name,
          patchType: patchConfig.type,
          patchPayload: patchConfig.payload,
          requestedBy: 'ServiceOrchestrationWatchdog',
          status: 'pending_approval',
        },
      });

      return { success: true, message: 'Hotpatch queued for approval' };
    }

    // Apply immediately
    await platformEventBus.publish({
      type: 'ai_brain_action' as PlatformEventType,
      category: 'ai_brain',
      title: 'Hotpatch Applied',
      description: `Applied ${patchConfig.type} hotpatch to ${service.name}`,
      metadata: {
        serviceId,
        patchType: patchConfig.type,
        patchPayload: patchConfig.payload,
      },
    });

    return { success: true, message: 'Hotpatch applied' };
  }

  /**
   * Get service registry status
   */
  getServiceRegistry(): {
    total: number;
    active: number;
    inactive: number;
    orphans: number;
    rebels: number;
    services: RegisteredService[];
  } {
    const services = Array.from(this.registeredServices.values());
    
    return {
      total: services.length,
      active: services.filter(s => s.status === 'active').length,
      inactive: services.filter(s => s.status === 'inactive').length,
      orphans: services.filter(s => s.status === 'orphan').length,
      rebels: services.filter(s => s.status === 'rebel').length,
      services,
    };
  }

  /**
   * Get orphan services
   */
  getOrphanServices(): RegisteredService[] {
    return Array.from(this.orphanServices.values());
  }
}

// Factory function for singleton
export function getServiceWatchdog(): ServiceOrchestrationWatchdog {
  if (!watchdogInstance) {
    watchdogInstance = new ServiceOrchestrationWatchdog();
  }
  return watchdogInstance;
}

// Initialize and start
export async function initializeServiceWatchdog(): Promise<ServiceOrchestrationWatchdog> {
  const watchdog = getServiceWatchdog();
  await watchdog.start();
  return watchdog;
}
