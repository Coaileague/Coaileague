// Service Health & Incident Reporting Routes
// Dedicated module for health monitoring and error handling

import type { Express, Request, Response } from 'express';
import type { User } from '@shared/schema';
import { z } from 'zod';
import express from 'express';
import multer from 'multer';
import rateLimit from 'express-rate-limit';
import { getHealthSummary, getServiceHealth, getGatewayHealth } from '../services/healthCheck';
import { getDetailedHealthReport, getSystemMetrics, getResponseTimeHistory, getErrorLogs, runTrinityFastDiagnostics, DIAGNOSTIC_SERVICE_REGISTRY, DOMAIN_LABELS, getAllDomains } from '../services/healthService';
import { storage } from '../storage';
import type { ServiceIncidentReportPayload } from '../../shared/healthTypes';
import { objectStorageClient } from '../objectStorage';

// Authenticated request type
interface AuthenticatedRequest extends Request {
  user?: User;
  workspaceId?: string;
}

// Rate limiter for incident reporting (stricter than general API)
const incidentReportLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5, // Max 5 incident reports per 15 minutes per IP
  message: 'Too many incident reports from this IP. Please try again later.',
  standardHeaders: true,
  legacyHeaders: false,
});

// Multer configuration for screenshot uploads
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 5 * 1024 * 1024, // 5MB limit for screenshots
    files: 1, // Only one screenshot per report
  },
  fileFilter: (req, file, cb) => {
    // Only allow image files
    const allowedMimes = ['image/png', 'image/jpeg', 'image/jpg', 'image/webp'];
    if (allowedMimes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Only image files (PNG, JPG, JPEG, WEBP) are allowed'));
    }
  },
});

// Zod schema for incident report validation
const serviceIncidentReportSchema = z.object({
  serviceKey: z.enum(['database', 'chat_websocket', 'gemini_ai', 'object_storage', 'stripe', 'email']),
  errorType: z.enum(['connection_failed', 'timeout', 'server_error', 'unknown']),
  userMessage: z.string().max(1000).optional(),
  errorMessage: z.string().max(2000).optional(),
  stackTrace: z.string().max(5000).optional(),
  metadata: z.object({
    url: z.string().optional(),
    userAgent: z.string().optional(),
    viewport: z.object({
      width: z.number(),
      height: z.number(),
    }).optional(),
  }).passthrough().optional(),
});

// Register health routes
export function registerHealthRoutes(app: Express, requireAuth: any) {
  // ============================================================================
  // HEALTH CHECK ROUTER (/api/health/*)
  // ============================================================================
  const healthRouter = express.Router();

  // Get ChatServerHub gateway health check
  // GET /api/health/gateway
  // Returns comprehensive gateway status, connected systems health, active rooms, event processing stats
  healthRouter.get('/gateway', async (req: Request, res: Response) => {
    try {
      const gatewayHealth = await getGatewayHealth();
      res.json(gatewayHealth);
    } catch (error: any) {
      console.error('Error fetching gateway health:', error);
      res.status(500).json({
        gateway: {
          status: 'down',
          isInitialized: false,
          version: 'unknown',
          lastChecked: new Date().toISOString(),
        },
        systems: {},
        rooms: {
          totalCount: 0,
          byType: { support: 0, work: 0, meeting: 0, org: 0 },
          totalParticipants: 0,
        },
        eventProcessing: {
          activeConnections: 0,
          averageConnectionDuration: 0,
          averageMessageCount: 0,
        },
        platformReadiness: 'critical' as const,
        timestamp: new Date().toISOString(),
        error: 'Failed to fetch gateway health',
      });
    }
  });

  // Get overall health summary (all services)
  // GET /api/health/summary
  healthRouter.get('/summary', async (req: Request, res: Response) => {
    try {
      const summary = await getHealthSummary();
      res.json(summary);
    } catch (error: any) {
      console.error('Error fetching health summary:', error);
      res.status(500).json({
        overall: 'down',
        services: [],
        timestamp: new Date().toISOString(),
        criticalServicesCount: 0,
        operationalServicesCount: 0,
        error: 'Failed to fetch health summary',
      });
    }
  });

  // Get detailed health report with system metrics, uptime, and error logs
  // GET /api/health/detailed
  healthRouter.get('/detailed', async (req: Request, res: Response) => {
    try {
      const report = await getDetailedHealthReport();
      res.json(report);
    } catch (error: any) {
      console.error('Error fetching detailed health report:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to fetch detailed health report',
        timestamp: new Date().toISOString(),
      });
    }
  });

  // Get current system metrics (memory, CPU, uptime)
  // GET /api/health/metrics
  healthRouter.get('/metrics', async (req: Request, res: Response) => {
    try {
      const metrics = getSystemMetrics();
      res.json({ success: true, data: metrics });
    } catch (error: any) {
      console.error('Error fetching system metrics:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to fetch system metrics',
      });
    }
  });

  // Get response time history
  // GET /api/health/response-times?service=xxx&limit=50
  healthRouter.get('/response-times', async (req: Request, res: Response) => {
    try {
      const service = req.query.service as string | undefined;
      const limit = parseInt(req.query.limit as string) || 50;
      const history = getResponseTimeHistory(service, limit);
      res.json({ success: true, data: history });
    } catch (error: any) {
      console.error('Error fetching response time history:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to fetch response time history',
      });
    }
  });

  // Get error logs
  // GET /api/health/errors?limit=20
  healthRouter.get('/errors', async (req: Request, res: Response) => {
    try {
      const limit = parseInt(req.query.limit as string) || 20;
      const logs = getErrorLogs(limit);
      res.json({ success: true, data: logs });
    } catch (error: any) {
      console.error('Error fetching error logs:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to fetch error logs',
      });
    }
  });

  // Get comprehensive platform diagnostics (Trinity FAST mode)
  // GET /api/health/comprehensive?mode=quick|full
  healthRouter.get('/comprehensive', requireAuth, async (req: Request, res: Response) => {
    try {
      const authReq = req as AuthenticatedRequest;
      const mode = (req.query.mode as string) === 'quick' ? 'quick' : 'full';
      console.log(`[Health] Running comprehensive diagnostics (${mode} mode) for user ${authReq.user?.id}`);
      
      const result = await runTrinityFastDiagnostics(mode);
      
      res.json({
        success: true,
        ...result,
        registeredServices: DIAGNOSTIC_SERVICE_REGISTRY.length,
        domains: getAllDomains().map(d => ({
          id: d,
          label: DOMAIN_LABELS[d],
          status: result.byDomain[d]?.status || 'operational',
          serviceCount: result.byDomain[d]?.services?.length || 0,
        })),
      });
    } catch (error: any) {
      console.error('[Health] Comprehensive diagnostics failed:', error.message);
      res.status(500).json({
        success: false,
        error: 'Comprehensive diagnostics failed',
        message: error.message,
      });
    }
  });

  // Get individual service health
  // GET /api/health/:service
  healthRouter.get('/:service', async (req: Request, res: Response) => {
    try {
      const { service } = req.params;
      
      // Validate service key
      const validServices = ['database', 'chat_websocket', 'gemini_ai', 'object_storage', 'stripe', 'email'];
      if (!validServices.includes(service)) {
        return res.status(400).json({ error: 'Invalid service key' });
      }

      const health = await getServiceHealth(service);
      
      if (!health) {
        return res.status(404).json({ error: 'Service not found' });
      }

      res.json(health);
    } catch (error: any) {
      console.error(`Error fetching health for service ${req.params.service}:`, error);
      res.status(500).json({ error: 'Failed to fetch service health' });
    }
  });

  // Mount health router
  app.use('/api/health', healthRouter);

  // ============================================================================
  // SERVICE INCIDENT REPORTING ROUTER (/api/support/*)
  // ============================================================================
  const supportRouter = express.Router();

  // Create service incident report with optional screenshot
  // POST /api/support/service-incidents
  supportRouter.post(
    '/service-incidents',
    requireAuth,
    incidentReportLimiter,
    upload.single('screenshot'),
    async (req: Request, res: Response) => {
      try {
        const authReq = req as AuthenticatedRequest;
        const userId = authReq.user!.id;
        const user = await storage.getUser(userId);

        if (!user?.currentWorkspaceId) {
          return res.status(403).json({ error: 'No workspace selected' });
        }

        const workspaceId = user.currentWorkspaceId;

        // Parse and validate request body
        let reportData: ServiceIncidentReportPayload;
        try {
          // If multipart, data will be in req.body as strings
          const parsedBody = {
            ...req.body,
            metadata: req.body.metadata ? JSON.parse(req.body.metadata) : undefined,
          };
          reportData = serviceIncidentReportSchema.parse(parsedBody);
        } catch (validationError: any) {
          return res.status(400).json({
            error: 'Invalid report data',
            details: validationError.errors || validationError.message,
          });
        }

        // Determine if service is critical
        const criticalServices = new Set(['database', 'chat_websocket', 'gemini_ai']);
        const isCriticalService = criticalServices.has(reportData.serviceKey);

        // Handle screenshot upload if provided
        let screenshotUrl: string | undefined;
        let screenshotKey: string | undefined;

        if (req.file) {
          try {
            // Upload screenshot to object storage
            const bucketId = process.env.DEFAULT_OBJECT_STORAGE_BUCKET_ID;
            
            if (!bucketId) {
              console.warn('Object storage not configured - screenshot will not be saved');
            } else {
              // Use shared objectStorageClient with sidecar credentials
              const bucket = objectStorageClient.bucket(bucketId);
              
              // Generate unique filename (guard against empty post-sanitization)
              const timestamp = Date.now();
              const sanitizedFilename = req.file.originalname.replace(/[^a-zA-Z0-9._-]/g, '_') || 'screenshot';
              
              // Entity ID is the path relative to PRIVATE_OBJECT_DIR
              const entityId = `service-incidents/${workspaceId}/${timestamp}_${sanitizedFilename}`;
              
              // Object name for bucket.file() is just the object segment (.private/...)
              const objectName = `.private/${entityId}`;
              
              // Upload to object storage
              const blob = bucket.file(objectName);
              const blobStream = blob.createWriteStream({
                resumable: false,
                metadata: {
                  contentType: req.file.mimetype,
                  metadata: {
                    uploadedBy: userId,
                    workspace: workspaceId,
                    serviceKey: reportData.serviceKey,
                    timestamp: new Date().toISOString(),
                  },
                },
              });
              
              await new Promise<void>((resolve, reject) => {
                blobStream.on('error', reject);
                blobStream.on('finish', resolve);
                blobStream.end(req.file!.buffer);
              });
              
              // Store canonical object path for access-controlled retrieval via ObjectStorageService
              screenshotUrl = `/objects/${entityId}`;
              screenshotKey = entityId;
              
              console.log(`Screenshot uploaded successfully: ${screenshotUrl}`);
            }
          } catch (uploadError: any) {
            console.error('Failed to upload screenshot:', uploadError);
            // Continue without screenshot - don't fail the entire incident report
          }
        }

        // Create incident report in database
        const incident = await storage.createServiceIncidentReport({
          workspaceId,
          userId,
          serviceKey: reportData.serviceKey,
          errorType: reportData.errorType,
          isCriticalService,
          userMessage: reportData.userMessage,
          errorMessage: reportData.errorMessage,
          stackTrace: reportData.stackTrace,
          metadata: reportData.metadata || {},
          screenshotUrl,
          screenshotKey,
          status: 'submitted',
        });

        // Auto-create support ticket for critical services
        if (isCriticalService) {
          try {
            const supportTicket = await storage.createSupportTicket({
              workspaceId,
              userId,
              title: `[CRITICAL] ${reportData.serviceKey} failure - ${reportData.errorType}`,
              description: `Auto-generated from incident report:\n\nService: ${reportData.serviceKey}\nError: ${reportData.errorMessage}\n\nUser Message: ${reportData.userMessage}`,
              priority: 'high',
              status: 'open',
              category: 'technical',
              screenshotKey,
              incidentId: incident.id,
              assignedTo: undefined, // Will be assigned by support routing
            });
            console.log(`[AUTO-TICKET] Support ticket created: ${supportTicket.id} for incident ${incident.id}`);
          } catch (ticketError: any) {
            console.error(`[AUTO-TICKET] Failed to create support ticket:`, ticketError);
            // Don't fail the incident report if ticket creation fails
          }
        }

        res.status(201).json({
          success: true,
          incidentId: incident.id,
          message: 'Incident report submitted successfully',
        });
      } catch (error: any) {
        console.error('Error creating service incident report:', error);
        res.status(500).json({ error: 'Failed to submit incident report' });
      }
    }
  );

  // Mount support router
  app.use('/api/support', supportRouter);
}
