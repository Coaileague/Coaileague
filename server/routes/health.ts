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
  const router = express.Router();

  // ============================================================================
  // HEALTH CHECK ENDPOINTS
  // ============================================================================

  // Get overall health summary (all services)
  router.get('/summary', async (req: Request, res: Response) => {
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
  router.get('/:service', async (req: Request, res: Response) => {
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

  // ============================================================================
  // SERVICE INCIDENT REPORTING
  // ============================================================================

  // Create service incident report with optional screenshot
  // Note: This is mounted under /api, so full path is /api/support/service-incidents
  router.post(
    '/support/service-incidents',
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
          // TODO: Implement object storage upload
          // For now, we'll skip screenshot storage until object storage integration is ready
          console.log('Screenshot upload received but storage not yet implemented:', req.file.originalname);
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

        // TODO: Auto-create support ticket and HelpOS queue entry
        // This will be implemented in a future iteration

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

  // Mount the router at /api
  // This makes:
  // - GET /api/health/summary
  // - GET /api/health/:service
  // - POST /api/support/service-incidents
  app.use('/api', router);
}
