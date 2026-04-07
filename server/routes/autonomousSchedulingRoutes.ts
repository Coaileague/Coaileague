/**
 * AUTONOMOUS SCHEDULING API ROUTES
 * =================================
 * 
 * Endpoints for Trinity's autonomous scheduling features:
 * - Execute autonomous scheduling (day/week/month modes)
 * - Import historical schedules
 * - Manage recurring templates
 * - Control the scheduling daemon
 */

import { sanitizeError } from '../middleware/errorHandler';
import { Express, Request, Response } from 'express';
import { z } from 'zod';
import { trinityAutonomousScheduler } from '../services/scheduling/trinityAutonomousScheduler';
import { historicalScheduleImporter } from '../services/scheduling/historicalScheduleImporter';
import { recurringScheduleTemplates } from '../services/scheduling/recurringScheduleTemplates';
import { autonomousSchedulingDaemon } from '../services/scheduling/autonomousSchedulingDaemon';
import { requireAuth } from '../auth';
import { requireManager } from '../rbac';
import { storage } from '../storage';
import { platformEventBus } from '../services/platformEventBus';
import multer from 'multer';
import { localVirusScan } from '../middleware/virusScan';
import { createLogger } from '../lib/logger';
const log = createLogger('AutonomousSchedulingRoutes');


const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const allowed = ['text/csv', 'application/vnd.ms-excel', 'text/plain', 'application/octet-stream'];
    if (allowed.includes(file.mimetype) || file.originalname.toLowerCase().endsWith('.csv')) {
      cb(null, true);
    } else {
      cb(new Error('Only CSV files are allowed for schedule import'));
    }
  },
});

export function registerAutonomousSchedulingRoutes(app: Express) {
  
  // ============================================================================
  // AUTONOMOUS SCHEDULING
  // ============================================================================

  /**
   * Execute autonomous scheduling for current workspace
   * POST /api/trinity/autonomous-schedule
   */
  app.post('/api/trinity/autonomous-schedule', requireAuth, async (req: any, res: Response) => {
    try {
      const userId = req.user?.id || req.user?.claims?.sub;
      const userWorkspace = await storage.getWorkspaceMemberByUserId(userId);
      
      if (!userWorkspace) {
        return res.status(404).json({ message: 'Workspace not found' });
      }

      const schema = z.object({
        mode: z.enum(['current_day', 'current_week', 'next_week', 'full_month']).default('current_day'),
        prioritizeBy: z.enum(['urgency', 'value', 'chronological']).default('urgency'),
        useContractorFallback: z.boolean().default(true),
        maxShiftsPerEmployee: z.number().min(0).max(50).default(0),
        respectAvailability: z.boolean().default(true),
      });

      const config = schema.parse(req.body);

      log.info(`[AutonomousScheduling] Starting ${config.mode} scheduling for workspace ${userWorkspace.workspaceId}`);

      const result = await trinityAutonomousScheduler.executeAutonomousScheduling({
        workspaceId: userWorkspace.workspaceId,
        userId,
        ...config,
      });

      res.json({
        success: true,
        message: `I processed ${result.summary.totalProcessed} shifts and assigned ${result.summary.totalAssigned}`,
        summary: result.summary,
        sessionId: result.session.sessionId,
      });

    } catch (error: unknown) {
      log.error('[AutonomousScheduling] Error:', error);
      res.status(500).json({ 
        success: false,
        message: sanitizeError(error) || 'Autonomous scheduling failed' 
      });
    }
  });

  /**
   * Get scheduling session status
   * GET /api/trinity/autonomous-schedule/status/:sessionId
   */
  app.get('/api/trinity/autonomous-schedule/status/:sessionId', requireAuth, async (req: any, res: Response) => {
    try {
      const { sessionId } = req.params;
      const session = trinityAutonomousScheduler.getActiveSession(sessionId);

      if (!session) {
        return res.status(404).json({ message: 'Session not found or completed' });
      }

      res.json({
        sessionId: session.sessionId,
        status: session.status,
        progress: session.progress,
        startTime: session.startTime,
      });

    } catch (error: unknown) {
      res.status(500).json({ message: sanitizeError(error) });
    }
  });

  // ============================================================================
  // HISTORICAL SCHEDULE IMPORT
  // ============================================================================

  /**
   * Import historical schedule from CSV
   * POST /api/trinity/import-schedule
   */
  app.post('/api/trinity/import-schedule', requireAuth, upload.single('file'), localVirusScan, async (req: any, res: Response) => {
    try {
      const userId = req.user?.id || req.user?.claims?.sub;
      const userWorkspace = await storage.getWorkspaceMemberByUserId(userId);
      
      if (!userWorkspace) {
        return res.status(404).json({ message: 'Workspace not found' });
      }

      if (!req.file) {
        return res.status(400).json({ message: 'No file uploaded' });
      }

      const csvContent = req.file.buffer.toString('utf-8');
      
      const options = {
        createShifts: req.body.createShifts === 'true',
        learnPatterns: req.body.learnPatterns !== 'false',
        dateFormat: (req.body.dateFormat || 'MM/DD/YYYY') as 'MM/DD/YYYY' | 'YYYY-MM-DD' | 'DD/MM/YYYY',
        timeFormat: (req.body.timeFormat || '12h') as '12h' | '24h',
      };

      log.info(`[HistoricalImport] Importing schedule for workspace ${userWorkspace.workspaceId}`);

      const result = await historicalScheduleImporter.importFromCSV(
        userWorkspace.workspaceId,
        csvContent,
        options
      );

      if (result.success && result.shiftsImported > 0) {
        const importMeta = {
          importedCount: result.shiftsImported,
          patternsLearned: result.patternsLearned,
          triggerPreBuild: options.createShifts,
        };
        platformEventBus.publish({
          type: 'prior_schedules_imported',
          category: 'automation',
          title: `Historical Schedule Imported — ${result.shiftsImported} Shifts`,
          description: `Imported ${result.shiftsImported} historical shifts, learned ${result.patternsLearned} scheduling patterns`,
          workspaceId: userWorkspace.workspaceId,
          metadata: importMeta,
        }).catch((err: Error) => log.error('[HistoricalImport] prior_schedules_imported publish failed:', err.message));

        platformEventBus.publish({
          type: 'schedule_analysis_requested',
          category: 'automation',
          title: 'Schedule Pattern Analysis Queued',
          description: `Analyzing ${result.shiftsImported} imported shifts to build scheduling intelligence`,
          workspaceId: userWorkspace.workspaceId,
          metadata: { shiftCount: result.shiftsImported, source: 'historical_import', ...importMeta },
        }).catch((err: Error) => log.error('[HistoricalImport] schedule_analysis_requested publish failed:', err.message));
      }

      res.json({
        success: result.success,
        message: `Imported ${result.shiftsImported} shifts, learned ${result.patternsLearned} patterns`,
        shiftsImported: result.shiftsImported,
        patternsLearned: result.patternsLearned,
        patterns: result.patterns,
        errors: result.errors,
      });

    } catch (error: unknown) {
      log.error('[HistoricalImport] Error:', error);
      res.status(500).json({ 
        success: false,
        message: sanitizeError(error) || 'Import failed' 
      });
    }
  });

  // ============================================================================
  // RECURRING TEMPLATES
  // ============================================================================

  /**
   * Get all templates for workspace
   * GET /api/trinity/templates
   */
  app.get('/api/trinity/templates', requireAuth, async (req: any, res: Response) => {
    try {
      const userId = req.user?.id || req.user?.claims?.sub;
      const userWorkspace = await storage.getWorkspaceMemberByUserId(userId);
      
      if (!userWorkspace) {
        return res.status(404).json({ message: 'Workspace not found' });
      }

      const templates = recurringScheduleTemplates.getWorkspaceTemplates(userWorkspace.workspaceId);

      res.json({
        success: true,
        templates,
      });

    } catch (error: unknown) {
      res.status(500).json({ message: sanitizeError(error) });
    }
  });

  /**
   * Create template from current week
   * POST /api/trinity/templates/from-week
   */
  app.post('/api/trinity/templates/from-week', requireAuth, async (req: any, res: Response) => {
    try {
      const userId = req.user?.id || req.user?.claims?.sub;
      const userWorkspace = await storage.getWorkspaceMemberByUserId(userId);
      
      if (!userWorkspace) {
        return res.status(404).json({ message: 'Workspace not found' });
      }

      const { weekStartDate, templateName } = req.body;

      if (!weekStartDate || !templateName) {
        return res.status(400).json({ message: 'weekStartDate and templateName are required' });
      }

      const template = await recurringScheduleTemplates.createTemplateFromWeek(
        userWorkspace.workspaceId,
        new Date(weekStartDate),
        templateName
      );

      res.json({
        success: true,
        message: `Template "${templateName}" created with ${template.shifts.length} shifts`,
        template,
      });

    } catch (error: unknown) {
      log.error('[Templates] Error:', error);
      res.status(500).json({ message: sanitizeError(error) });
    }
  });

  /**
   * Apply template to a week
   * POST /api/trinity/templates/:templateId/apply
   */
  app.post('/api/trinity/templates/:templateId/apply', requireAuth, async (req: any, res: Response) => {
    try {
      const userId = req.user?.id || req.user?.claims?.sub;
      const userWorkspace = await storage.getWorkspaceMemberByUserId(userId);
      
      if (!userWorkspace) {
        return res.status(404).json({ message: 'Workspace not found' });
      }

      const { templateId } = req.params;
      const { weekStartDate, overwriteExisting, assignEmployees } = req.body;

      if (!weekStartDate) {
        return res.status(400).json({ message: 'weekStartDate is required' });
      }

      const result = await recurringScheduleTemplates.applyTemplate(
        templateId,
        new Date(weekStartDate),
        {
          overwriteExisting: overwriteExisting === true,
          assignEmployees: assignEmployees === true,
        }
      );

      res.json({
        success: result.success,
        message: result.success 
          ? `Created ${result.shiftsCreated} shifts for week of ${result.weekStart.toLocaleDateString()}`
          : result.errors.join(', '),
        shiftsCreated: result.shiftsCreated,
        errors: result.errors,
      });

    } catch (error: unknown) {
      log.error('[Templates] Error:', error);
      res.status(500).json({ message: sanitizeError(error) });
    }
  });

  /**
   * Delete template
   * DELETE /api/trinity/templates/:templateId
   */
  app.delete('/api/trinity/templates/:templateId', requireAuth, async (req: any, res: Response) => {
    try {
      const userId = req.user?.id || req.user?.claims?.sub;
      const userWorkspace = await storage.getWorkspaceMemberByUserId(userId);
      
      if (!userWorkspace) {
        return res.status(404).json({ message: 'Workspace not found' });
      }

      const { templateId } = req.params;
      const deleted = recurringScheduleTemplates.deleteTemplate(templateId);

      res.json({
        success: deleted,
        message: deleted ? 'Template deleted' : 'Template not found',
      });

    } catch (error: unknown) {
      res.status(500).json({ message: sanitizeError(error) });
    }
  });

  // ============================================================================
  // DAEMON CONTROL
  // ============================================================================

  /**
   * Get daemon status
   * GET /api/trinity/daemon/status
   */
  app.get('/api/trinity/daemon/status', requireManager, async (req: any, res: Response) => {
    try {
      const status = autonomousSchedulingDaemon.getStatus();
      res.json({
        success: true,
        ...status,
      });
    } catch (error: unknown) {
      res.status(500).json({ message: sanitizeError(error) });
    }
  });

  /**
   * Start the daemon
   * POST /api/trinity/daemon/start
   */
  app.post('/api/trinity/daemon/start', requireManager, async (req: any, res: Response) => {
    try {
      const config = req.body || {};
      autonomousSchedulingDaemon.start(config);
      
      res.json({
        success: true,
        message: 'Autonomous scheduling daemon started',
      });
    } catch (error: unknown) {
      res.status(500).json({ message: sanitizeError(error) });
    }
  });

  /**
   * Stop the daemon
   * POST /api/trinity/daemon/stop
   */
  app.post('/api/trinity/daemon/stop', requireManager, async (req: any, res: Response) => {
    try {
      autonomousSchedulingDaemon.stop();
      
      res.json({
        success: true,
        message: 'Autonomous scheduling daemon stopped',
      });
    } catch (error: unknown) {
      res.status(500).json({ message: sanitizeError(error) });
    }
  });

  /**
   * Trigger manual scheduling run
   * POST /api/trinity/daemon/trigger
   */
  app.post('/api/trinity/daemon/trigger', requireManager, async (req: any, res: Response) => {
    try {
      const userId = req.user?.id || req.user?.claims?.sub;
      const userWorkspace = await storage.getWorkspaceMemberByUserId(userId);
      
      if (!userWorkspace) {
        return res.status(404).json({ message: 'Workspace not found' });
      }

      const { mode } = req.body;
      const result = await autonomousSchedulingDaemon.triggerManualRun(
        userWorkspace.workspaceId,
        mode || 'current_day'
      );

      res.json(result);

    } catch (error: unknown) {
      res.status(500).json({ 
        success: false,
        message: sanitizeError(error) 
      });
    }
  });

  log.info('[Routes] Autonomous scheduling routes registered');
}
