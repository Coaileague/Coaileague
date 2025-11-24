// Service Health & Incident Reporting Routes
// Dedicated module for health monitoring and error handling

import type { Express, Request, Response } from 'express';
import type { User } from '@shared/schema';
import { z } from 'zod';
import express from 'express';
import multer from 'multer';
import rateLimit from 'express-rate-limit';
import { getHealthSummary, getServiceHealth } from '../services/healthCheck';
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
