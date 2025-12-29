import express, { type Request, Response, NextFunction } from "express";
import { registerRoutes } from "./routes";
import { setupVite, serveStatic, log } from "./vite";
import { pool } from "./db"; // Assuming 'pool' is your PostgreSQL client connection pool
import { monitoringService } from "./monitoring";
import { startAutonomousScheduler } from "./services/autonomousScheduler";
import { initializeChatServerHub } from "./services/ChatServerHub";
import { GamificationEventTracker } from "./services/gamification/eventTracker";
import { AiBrainNotifier } from "./services/gamification/aiBrainNotifier";
import { WhatsNewGamificationBridge } from "./services/gamification/whatsNewIntegration";
import { initializeNotifications } from "./services/notificationInit";
import { aiBrainMasterOrchestrator } from "./services/ai-brain/aiBrainMasterOrchestrator";
import { platformEventBus } from "./services/platformEventBus";
import { handlePlatformChangeEvent } from "./services/aiNotificationService";
import { startNotificationCleanupScheduler } from "./services/notificationCleanupService";
import { initializeOrchestrationServices, setOrchestrationWebSocketBroadcaster } from "./services/ai-brain/orchestrationBridge";
import { broadcastToWorkspace } from "./websocket";
import { initializeSkillsSystem } from "./services/ai-brain/skills/skill-loader";
import "./services/scheduleLiveNotifier";
import { tracingMiddleware } from "./services/infrastructure/distributedTracing";
import { rateLimitMiddleware } from "./services/infrastructure/rateLimiting";

const app = express();

// CRITICAL: Register lightweight health endpoints FIRST, before ANY middleware
// This ensures they respond immediately without being slowed by middleware chains
app.get('/', (req, res) => {
  res.setHeader('Content-Type', 'application/json');
  return res.status(200).send(JSON.stringify({ status: 'ok', timestamp: new Date().toISOString() }));
});

app.get('/health', (req, res) => {
  res.setHeader('Content-Type', 'application/json');
  return res.status(200).send(JSON.stringify({ status: 'ok', timestamp: new Date().toISOString() }));
});

// Capture raw body for webhook signature verification
app.use((req, res, next) => {
  if (req.path === '/api/webhooks/quickbooks') {
    let data = '';
    req.setEncoding('utf8');
    req.on('data', (chunk) => { data += chunk; });
    req.on('end', () => {
      (req as any).rawBody = data;
      try {
        req.body = data ? JSON.parse(data) : {};
      } catch (e) {
        req.body = {};
      }
      next();
    });
  } else {
    next();
  }
});

app.use(express.json());
app.use(express.urlencoded({ extended: false }));

// Trust proxy for accurate IP detection behind load balancers
app.set('trust proxy', 1);

// Distributed tracing middleware - adds trace IDs to all requests (skip health endpoints)
app.use((req, res, next) => {
  if (req.path === '/' || req.path === '/health') {
    return next();
  }
  tracingMiddleware(req, res, next);
});

// Rate limiting middleware - applies per-tenant quotas on API routes
app.use('/api', rateLimitMiddleware);

// Performance monitoring middleware - tracks all requests
app.use((req, res, next) => {
  const start = Date.now();
  const path = req.path;
  let capturedJsonResponse: Record<string, any> | undefined = undefined;

  const originalResJson = res.json;
  res.json = function (bodyJson, ...args) {
    capturedJsonResponse = bodyJson;
    return originalResJson.apply(res, [bodyJson, ...args]);
  };

  res.on("finish", () => {
    const duration = Date.now() - start;
    
    // Track metrics in monitoring service
    const userId = (req as any).session?.userId;
    const workspaceId = (req as any).session?.currentWorkspaceId;
    
    monitoringService.trackRequest(
      path,
      req.method,
      duration,
      res.statusCode,
      { userId, workspaceId }
    );
    
    // Keep existing console logging for development
    if (path.startsWith("/api")) {
      let logLine = `${req.method} ${path} ${res.statusCode} in ${duration}ms`;
      if (capturedJsonResponse) {
        logLine += ` :: ${JSON.stringify(capturedJsonResponse)}`;
      }

      if (logLine.length > 80) {
        logLine = logLine.slice(0, 79) + "…";
      }

      log(logLine);
    }
  });

  next();
});

// Session middleware and authentication will be set up by registerRoutes/setupAuth
// DO NOT set up session middleware here - it's handled in routes.ts via setupAuth

// Graceful session cleanup on server shutdown
process.on('SIGTERM', () => {
  console.log('SIGTERM received, cleaning up sessions...');
  pool.end(() => {
    console.log('Session pool closed');
    process.exit(0);
  });
});

// ============================================================================
// STARTUP TIMING UTILITY
// ============================================================================
function timedInit(name: string, fn: () => Promise<void>): Promise<{ name: string; duration: number; success: boolean; error?: string }> {
  const start = Date.now();
  return fn()
    .then(() => ({ name, duration: Date.now() - start, success: true }))
    .catch((err) => ({ name, duration: Date.now() - start, success: false, error: err.message }));
}

// ============================================================================
// PHASE 1: CRITICAL SERVICES (must run before server listens)
// ============================================================================
async function initializeCriticalServices() {
  // ChatServerHub Gateway - needed for WebSocket connections
  try {
    await initializeChatServerHub();
    console.log('[Server] ChatServerHub Gateway initialized successfully');
  } catch (error) {
    console.error('[Server] Warning: Failed to initialize ChatServerHub Gateway:', error);
  }

  // Gamification Event System - lightweight event listeners
  try {
    GamificationEventTracker.initializeEventListeners();
    AiBrainNotifier.initializeListeners();
    WhatsNewGamificationBridge.initializeListeners();
    
    // Subscribe to platform changes to create What's New notifications
    platformEventBus.subscribe('announcement', {
      name: 'PlatformChangeNotificationListener',
      handler: handlePlatformChangeEvent,
    });
    platformEventBus.subscribe('feature_released', {
      name: 'PlatformChangeNotificationListener',
      handler: handlePlatformChangeEvent,
    });
    platformEventBus.subscribe('feature_updated', {
      name: 'PlatformChangeNotificationListener',
      handler: handlePlatformChangeEvent,
    });
    platformEventBus.subscribe('bugfix_deployed', {
      name: 'PlatformChangeNotificationListener',
      handler: handlePlatformChangeEvent,
    });
    platformEventBus.subscribe('security_patch', {
      name: 'PlatformChangeNotificationListener',
      handler: handlePlatformChangeEvent,
    });
    
    console.log('[Server] Gamification event system initialized');
  } catch (error) {
    console.error('[Server] Warning: Failed to initialize gamification events:', error);
  }
}

// ============================================================================
// PHASE 2: AI BRAIN CORE (runs in parallel after server listens)
// ============================================================================
async function initializeAIBrainCore(): Promise<void> {
  const results = await Promise.allSettled([
    timedInit('AI Brain Master Orchestrator', async () => {
      await aiBrainMasterOrchestrator.initialize();
      const actionSummary = aiBrainMasterOrchestrator.getActionSummary();
      const totalActions = Object.values(actionSummary).reduce((a, b) => a + b, 0);
      console.log(`[Server] AI Brain Master Orchestrator initialized - ${totalActions} actions registered`);
      console.log('[Server] Action categories:', JSON.stringify(actionSummary));
    }),
    
    timedInit('AI Notification System', async () => {
      await initializeNotifications();
      console.log('[Server] AI notification system initialized');
    }),
    
    timedInit('Orchestration Services', async () => {
      setOrchestrationWebSocketBroadcaster(broadcastToWorkspace);
      initializeOrchestrationServices();
      console.log('[Server] AI Brain Orchestration services initialized');
    }),
  ]);
  
  // Log timing results
  results.forEach((result) => {
    if (result.status === 'fulfilled') {
      const { name, duration, success } = result.value;
      if (success) {
        console.log(`[Startup] ${name}: ${duration}ms`);
      } else {
        console.warn(`[Startup] ${name}: FAILED in ${duration}ms`);
      }
    }
  });
}

// ============================================================================
// PHASE 3: EXTENDED SERVICES (runs in parallel, deferred)
// ============================================================================
async function initializeExtendedServices(): Promise<void> {
  const results = await Promise.allSettled([
    timedInit('Universal Diagnostic Orchestrator', async () => {
      const { registerUniversalDiagnosticActions } = await import("./services/ai-brain/universalDiagnosticOrchestrator");
      const { helpaiOrchestrator } = await import("./services/helpai/helpaiActionOrchestrator");
      await registerUniversalDiagnosticActions(helpaiOrchestrator);
      console.log("[Server] Universal Diagnostic Orchestrator initialized");
    }),
    
    timedInit('Unified Lifecycle Manager', async () => {
      const { unifiedLifecycleManager } = await import('./services/ai-brain/unifiedLifecycleManager');
      await unifiedLifecycleManager.initialize();
      console.log('[Server] Unified Lifecycle Manager initialized - lifecycle hooks active');
    }),
    
    timedInit('Trinity Platform Connector', async () => {
      const { trinityPlatformConnector } = await import('./services/ai-brain/trinityPlatformConnector');
      await trinityPlatformConnector.initialize();
      console.log('[Server] Trinity Platform Connector initialized - service connections active');
    }),
    
    timedInit('AI Brain Skills System', async () => {
      await initializeSkillsSystem();
      console.log('[Server] AI Brain Skills System initialized');
    }),
    
    timedInit('Seasonal Subagent', async () => {
      const { initializeSeasonalSubagent } = await import('./services/ai-brain/seasonalSubagent');
      await initializeSeasonalSubagent();
      console.log('[Server] Seasonal Subagent initialized - Holiday theming active');
    }),
    
    timedInit('UI Control Subagent', async () => {
      const { uiControlSubagent } = await import('./services/ai-brain/uiControlSubagent');
      uiControlSubagent.registerActions();
      console.log('[Server] UI Control Subagent initialized - Trinity can manage UI layers');
    }),
  ]);
  
  // Log timing for extended services
  results.forEach((result) => {
    if (result.status === 'fulfilled' && !result.value.success) {
      console.warn(`[Startup] ${result.value.name}: FAILED - ${result.value.error}`);
    }
  });
}

// ============================================================================
// PHASE 4: BACKGROUND SERVICES (runs async, non-blocking)
// ============================================================================
async function initializeBackgroundServices(): Promise<void> {
  // These run in the background without blocking
  const backgroundTasks = [
    timedInit('Service Watchdog', async () => {
      const { initializeServiceWatchdog } = await import('./services/ai-brain/serviceOrchestrationWatchdog');
      await initializeServiceWatchdog();
      console.log('[Server] Service Orchestration Watchdog initialized');
    }),
    
    timedInit('Cleanup Agent Subagent', async () => {
      const { registerCleanupAgentActions } = await import('./services/ai-brain/cleanupAgentSubagent');
      registerCleanupAgentActions();
      console.log('[Server] Cleanup Agent Subagent initialized - spec-index.json active');
    }),
    
    timedInit('Q1 2026 Infrastructure Services', async () => {
      const { initializeInfrastructureServices } = await import('./services/infrastructure/index');
      await initializeInfrastructureServices();
      console.log('[Server] Q1 2026 Infrastructure Services initialized - job queue, backups, error tracking, key rotation');
    }),
    
    timedInit('Billing Orchestration', async () => {
      const { registerBillingOrchestrationActions } = await import('./services/partners/billingOrchestrationService');
      registerBillingOrchestrationActions();
      console.log('[Server] Billing Orchestration Service initialized - 99% automation / 1% oversight active');
    }),
    
    timedInit('Orchestration Governance', async () => {
      const { registerOrchestrationGovernanceActions } = await import('./services/ai-brain/trinityOrchestrationGovernance');
      registerOrchestrationGovernanceActions();
      console.log('[Server] Trinity Orchestration Governance initialized - 99/1 pattern + hotpatch cadence active');
    }),
    
    timedInit('Thought Engine', async () => {
      const { registerThoughtEngineActions } = await import('./services/ai-brain/trinityThoughtEngine');
      registerThoughtEngineActions();
      console.log('[Server] Trinity Thought Engine initialized - metacognition active');
    }),
    
    timedInit('Approval Resume Orchestrator', async () => {
      const { approvalResumeOrchestrator, registerApprovalResumeActions } = await import('./services/ai-brain/approvalResumeOrchestrator');
      registerApprovalResumeActions();
      approvalResumeOrchestrator.start();
      console.log('[Server] Approval Resume Orchestrator initialized - email escalations active');
    }),
    
    timedInit('Agent Parity Layer', async () => {
      const { trinityAgentParityLayer } = await import('./services/ai-brain/trinityAgentParityLayer');
      const capabilities = trinityAgentParityLayer.getCapabilities();
      console.log(`[Server] Trinity Agent Parity Layer initialized - ${capabilities.length} agent capabilities active`);
    }),
    
    timedInit('Trinity Autonomous Ops', async () => {
      const { initializeTrinityAutonomousOps } = await import('./services/ai-brain/trinityAutonomousOps');
      await initializeTrinityAutonomousOps();
      console.log('[Server] Trinity Autonomous Operations initialized - proactive monitoring active');
    }),
    
    timedInit('Domain Ops Subagents', async () => {
      const { initializeDomainOpsSubagents } = await import('./services/ai-brain/subagents/domainOpsSubagents');
      await initializeDomainOpsSubagents();
      console.log('[Server] Domain Ops Subagents initialized - SchemaOps, LogOps, HandlerOps, HookOps active');
    }),
    
    timedInit('Trinity Self-Awareness', async () => {
      const { initializeTrinitySelfAwareness } = await import('./services/ai-brain/trinitySelfAwarenessService');
      await initializeTrinitySelfAwareness();
      console.log('[Server] Trinity Self-Awareness Service initialized');
    }),
    
    timedInit('Gap Intelligence', async () => {
      const { initializeGapIntelligence } = await import('./services/ai-brain/gapIntelligenceService');
      await initializeGapIntelligence();
      console.log('[Server] Gap Intelligence Service initialized - scheduled scans active');
    }),
    
    timedInit('Workflow Approval', async () => {
      const { initializeWorkflowApproval } = await import('./services/ai-brain/workflowApprovalService');
      await initializeWorkflowApproval();
      console.log('[Server] Workflow Approval Service initialized - UNS prompts active');
    }),
    
    timedInit('Trial Conversion', async () => {
      const { initializeTrialConversionOrchestrator } = await import('./services/billing/trialConversionOrchestrator');
      await initializeTrialConversionOrchestrator();
      console.log('[Server] Trial Conversion Orchestrator initialized');
    }),
    
    timedInit('Stripe Event Bridge', async () => {
      const { initializeStripeEventBridge } = await import('./services/billing/stripeEventBridge');
      await initializeStripeEventBridge();
      console.log('[Server] Stripe Event Bridge initialized');
    }),
    
    timedInit('Exception Queue Processor', async () => {
      const { initializeExceptionQueueProcessor } = await import('./services/billing/exceptionQueueProcessor');
      await initializeExceptionQueueProcessor();
      console.log('[Server] Exception Queue Processor initialized');
    }),
    
    timedInit('Weekly Billing Run', async () => {
      const { initializeWeeklyBillingRunService } = await import('./services/billing/weeklyBillingRunService');
      initializeWeeklyBillingRunService();
      console.log('[Server] Weekly Billing Run Service initialized - 4 actions registered');
    }),
    
    timedInit('Autonomous Fix Pipeline', async () => {
      const { initializeAutonomousFixPipeline } = await import('./services/ai-brain/autonomousFixPipeline');
      await initializeAutonomousFixPipeline();
      console.log('[Server] Autonomous Fix Pipeline initialized - self-healing active');
    }),
    
    timedInit('Workflow Orchestration', async () => {
      const { initializeOrchestrationServices: initWorkflowOrchestration } = await import('./services/orchestration/index');
      await initWorkflowOrchestration();
      console.log('[Server] Workflow Orchestration Services initialized - 33 actions registered');
    }),
    
    timedInit('HRIS Integration Service', async () => {
      const { hrisIntegrationService } = await import('./services/hris/hrisIntegrationService');
      const { helpaiOrchestrator } = await import('./services/helpai/helpaiActionOrchestrator');
      const actions = hrisIntegrationService.getAIBrainActions();
      for (const action of actions) {
        helpaiOrchestrator.registerAction({
          actionId: action.name,
          name: action.name.replace('hris.', '').replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase()),
          category: 'integrations' as const,
          description: action.description,
          requiredRoles: ['root_admin', 'superadmin', 'owner', 'admin'],
          handler: async (request: any) => {
            const startTime = Date.now();
            try {
              const result = await action.handler(request.payload || {});
              return {
                success: result.success,
                actionId: request.actionId,
                message: result.success ? `HRIS action ${action.name} completed` : 'HRIS action failed',
                data: result,
                executionTimeMs: Date.now() - startTime,
              };
            } catch (error: any) {
              return {
                success: false,
                actionId: request.actionId,
                message: error.message,
                executionTimeMs: Date.now() - startTime,
              };
            }
          },
        });
      }
      console.log(`[Server] HRIS Integration Service initialized - ${actions.length} actions registered`);
    }),
    
    timedInit('Notification Cleanup Scheduler', async () => {
      startNotificationCleanupScheduler();
      console.log('[Server] Notification cleanup scheduler started');
    }),
  ];
  
  // Run all background tasks in parallel
  const results = await Promise.allSettled(backgroundTasks);
  
  // Log summary
  const successful = results.filter(r => r.status === 'fulfilled' && r.value.success).length;
  const failed = results.filter(r => r.status === 'fulfilled' && !r.value.success).length;
  const totalTime = results
    .filter(r => r.status === 'fulfilled')
    .reduce((sum, r) => sum + (r as PromiseFulfilledResult<any>).value.duration, 0);
  
  console.log(`\n╔════════════════════════════════════════════════╗`);
  console.log(`║  ✅ BACKGROUND SERVICES: ${successful}/${backgroundTasks.length} INITIALIZED  ║`);
  if (failed > 0) {
    console.log(`║  ⚠️  FAILED: ${failed} services                         ║`);
  }
  console.log(`║  ⏱️  PARALLEL TIME: ${Math.max(...results.filter(r => r.status === 'fulfilled').map(r => (r as PromiseFulfilledResult<any>).value.duration))}ms (max)  ║`);
  console.log(`╚════════════════════════════════════════════════╝\n`);
}

// ============================================================================
// MAIN STARTUP SEQUENCE
// ============================================================================
(async () => {
  const startupStart = Date.now();
  let server;
  
  // PHASE 0: Register routes (required before anything else)
  try {
    console.log('[Startup] Phase 0: Registering routes...');
    server = await registerRoutes(app);
  } catch (error) {
    console.error('CRITICAL: Failed to register routes:', error);
    console.error('Application cannot start without platform workspace. Exiting...');
    process.exit(1);
  }

  // PHASE 1: Initialize critical services (fast, synchronous)
  console.log('[Startup] Phase 1: Critical services...');
  await initializeCriticalServices();

  // Error handler middleware
  app.use((err: any, req: Request, res: Response, _next: NextFunction) => {
    const status = err.status || err.statusCode || 500;
    const message = err.message || "Internal Server Error";

    // Log error to monitoring service
    const userId = (req as any).session?.userId;
    const workspaceId = (req as any).session?.currentWorkspaceId;
    const requestId = (req as any).id;
    
    monitoringService.logError(err, {
      userId,
      workspaceId,
      requestId,
      additionalData: {
        method: req.method,
        path: req.path,
        statusCode: status,
      }
    });

    res.status(status).json({ message });
  });

  // Setup Vite in development
  if (app.get("env") === "development") {
    await setupVite(app, server);
  } else {
    serveStatic(app);
  }

  // START SERVER IMMEDIATELY - don't wait for heavy services
  const port = parseInt(process.env.PORT || '5000', 10);
  server.listen({
    port,
    host: "0.0.0.0",
    reusePort: true,
  }, async () => {
    const listenTime = Date.now() - startupStart;
    console.log(`\n╔════════════════════════════════════════════════╗`);
    console.log(`║  🚀 SERVER LISTENING ON PORT ${port}              ║`);
    console.log(`║  ⏱️  TIME TO LISTEN: ${listenTime}ms                    ║`);
    console.log(`╚════════════════════════════════════════════════╝\n`);
    
    log(`serving on port ${port}`);
    
    // PHASE 2: Initialize AI Brain core (parallel, after listen)
    console.log('[Startup] Phase 2: AI Brain core services (parallel)...');
    await initializeAIBrainCore();
    
    // PHASE 3: Initialize extended services (parallel)
    console.log('[Startup] Phase 3: Extended services (parallel)...');
    await initializeExtendedServices();
    
    // PHASE 4: Background services (parallel, non-blocking feel)
    console.log('[Startup] Phase 4: Background services (parallel)...');
    await initializeBackgroundServices();
    
    // PHASE 5: Start autonomous scheduler
    console.log('[Startup] Phase 5: Autonomous scheduler...');
    try {
      startAutonomousScheduler();
      console.log('[Server] Autonomous scheduler started successfully');
    } catch (error) {
      console.error('[Server] CRITICAL: Failed to start autonomous scheduler:', error);
    }
    
    const totalTime = Date.now() - startupStart;
    console.log(`\n╔════════════════════════════════════════════════╗`);
    console.log(`║  ✅ FULL STARTUP COMPLETE                      ║`);
    console.log(`║  ⏱️  TOTAL TIME: ${totalTime}ms                       ║`);
    console.log(`║  🎯 USER ACCESS: ${listenTime}ms (${Math.round(listenTime/totalTime*100)}% of total)        ║`);
    console.log(`╚════════════════════════════════════════════════╝\n`);
  });
})();
