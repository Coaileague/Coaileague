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

const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: false }));

// Trust proxy for accurate IP detection behind load balancers
app.set('trust proxy', 1);

// Production health check endpoint with monitoring service
app.get('/health', async (req, res) => {
  try {
    const healthStatus = await monitoringService.getHealthStatus();
    const httpStatus = healthStatus.status === 'healthy' ? 200 : 
                       healthStatus.status === 'degraded' ? 503 : 503;
    res.status(httpStatus).json(healthStatus);
  } catch (error) {
    monitoringService.logError(error as Error, { 
      additionalData: { endpoint: '/health' } 
    });
    res.status(503).json({ 
      status: 'down', 
      checks: {}, 
      timestamp: new Date() 
    });
  }
});

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

(async () => {
  let server;
  try {
    server = await registerRoutes(app);
  } catch (error) {
    console.error('CRITICAL: Failed to register routes:', error);
    console.error('Application cannot start without platform workspace. Exiting...');
    process.exit(1);
  }

  // Initialize ChatServerHub Gateway after routes are registered
  try {
    await initializeChatServerHub();
    console.log('[Server] ChatServerHub Gateway initialized successfully');
  } catch (error) {
    console.error('[Server] Warning: Failed to initialize ChatServerHub Gateway:', error);
    // Log warning but continue - gateway initialization is not critical for server startup
  }

  // Initialize Gamification Event System
  try {
    GamificationEventTracker.initializeEventListeners();
    AiBrainNotifier.initializeListeners();
    WhatsNewGamificationBridge.initializeListeners();
    console.log('[Server] Gamification event system initialized');
  } catch (error) {
    console.error('[Server] Warning: Failed to initialize gamification events:', error);
  }

  // Initialize AI Notification System - seeds platform updates
  try {
    await initializeNotifications();
    console.log('[Server] AI notification system initialized');
  } catch (error) {
    console.error('[Server] Warning: Failed to initialize notifications:', error);
  }

  // Initialize AI Brain Master Orchestrator - connects Gemini to ALL services
  try {
    await aiBrainMasterOrchestrator.initialize();
    const actionSummary = aiBrainMasterOrchestrator.getActionSummary();
    const totalActions = Object.values(actionSummary).reduce((a, b) => a + b, 0);
    console.log(`[Server] AI Brain Master Orchestrator initialized - ${totalActions} actions registered`);
    console.log('[Server] Action categories:', JSON.stringify(actionSummary));
  } catch (error) {
    console.error('[Server] Warning: Failed to initialize AI Brain Master Orchestrator:', error);
  }

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

  // importantly only setup vite in development and after
  // setting up all the other routes so the catch-all route
  // doesn't interfere with the other routes
  if (app.get("env") === "development") {
    await setupVite(app, server);
  } else {
    serveStatic(app);
  }

  // ALWAYS serve the app on the port specified in the environment variable PORT
  // Other ports are firewalled. Default to 5000 if not specified.
  // this serves both the API and the client.
  // It is the only port that is not firewalled.
  const port = parseInt(process.env.PORT || '5000', 10);
  server.listen({
    port,
    host: "0.0.0.0",
    reusePort: true,
  }, () => {
    log(`serving on port ${port}`);
    
    // Start autonomous scheduler for automated jobs
    startAutonomousScheduler();
  });
})();