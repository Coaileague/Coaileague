/**
 * CoAIleague Data Migration API Routes
 * 
 * Endpoints for importing data from external platforms:
 * - POST /upload - Upload document for analysis
 * - POST /analyze/:documentId - Extract data using Gemini Vision
 * - POST /import/:jobId - Import selected records
 * - GET /jobs - List migration jobs
 * - GET /records/:jobId - Get extracted records for review
 */

import { Router, type Response } from 'express';
import { migrationService } from '../services/migration';
import { z } from 'zod';
import { fromZodError } from 'zod-validation-error';

export const migrationRouter = Router();

// ============================================================================
// REQUEST VALIDATION SCHEMAS
// ============================================================================

const uploadSchema = z.object({
  documentType: z.enum(['employees', 'payroll', 'schedules', 'invoices', 'timesheets', 'clients', 'other']),
  fileName: z.string().min(1),
  fileData: z.string().min(1), // base64
  mimeType: z.string().min(1),
});

const importSchema = z.object({
  recordIds: z.array(z.string().min(1)),
});

// ============================================================================
// MIGRATION ENDPOINTS
// ============================================================================

/**
 * POST /api/migration/upload
 * Upload document and create migration job
 */
migrationRouter.post('/upload', async (req: any, res: Response) => {
  try {
    const validationResult = uploadSchema.safeParse(req.body);
    if (!validationResult.success) {
      return res.status(400).json({
        error: 'Invalid request body',
        details: fromZodError(validationResult.error).toString(),
      });
    }

    const { documentType, fileName, fileData, mimeType } = validationResult.data;

    if (!req.user || !req.workspace) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    // Create migration job
    const result = await migrationService.createMigrationJob({
      workspaceId: req.workspace.id,
      userId: req.user.id,
      documentType,
      fileName,
      fileData,
      mimeType,
    });

    return res.json({
      success: true,
      job: result.job,
      document: result.document,
    });

  } catch (error) {
    console.error('Migration upload error:', error);
    return res.status(500).json({
      error: 'Failed to upload document',
      message: error instanceof Error ? error.message : String(error),
    });
  }
});

/**
 * POST /api/migration/analyze/:documentId
 * Analyze document using Gemini Vision
 */
migrationRouter.post('/analyze/:documentId', async (req: any, res: Response) => {
  try {
    const { documentId } = req.params;

    if (!req.user || !req.workspace) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    // Analyze document (workspace-scoped for security)
    const result = await migrationService.analyzeDocument(documentId, req.workspace.id);

    return res.json({
      success: true,
      document: result.document,
      records: result.records,
      overallConfidence: result.overallConfidence,
    });

  } catch (error) {
    console.error('Migration analysis error:', error);
    return res.status(500).json({
      error: 'Failed to analyze document',
      message: error instanceof Error ? error.message : String(error),
    });
  }
});

/**
 * POST /api/migration/import/:jobId
 * Import selected records into CoAIleague
 */
migrationRouter.post('/import/:jobId', async (req: any, res: Response) => {
  try {
    const { jobId } = req.params;
    
    const validationResult = importSchema.safeParse(req.body);
    if (!validationResult.success) {
      return res.status(400).json({
        error: 'Invalid request body',
        details: fromZodError(validationResult.error).toString(),
      });
    }

    const { recordIds } = validationResult.data;

    if (!req.user || !req.workspace) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    // Import records (workspace-scoped for security)
    const result = await migrationService.importRecords(jobId, recordIds, req.workspace.id);

    return res.json({
      success: true,
      job: result.job,
      importedCount: result.importedCount,
      totalAttempted: result.totalAttempted,
      results: result.results,
    });

  } catch (error) {
    console.error('Migration import error:', error);
    return res.status(500).json({
      error: 'Failed to import records',
      message: error instanceof Error ? error.message : String(error),
    });
  }
});

/**
 * GET /api/migration/jobs
 * List all migration jobs for workspace
 */
migrationRouter.get('/jobs', async (req: any, res: Response) => {
  try {
    if (!req.user || !req.workspace) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const jobs = await migrationService.getMigrationJobs(req.workspace.id);

    return res.json({
      success: true,
      jobs,
    });

  } catch (error) {
    console.error('Migration jobs error:', error);
    return res.status(500).json({
      error: 'Failed to fetch migration jobs',
      message: error instanceof Error ? error.message : String(error),
    });
  }
});

/**
 * GET /api/migration/records/:jobId
 * Get extracted records for review
 */
migrationRouter.get('/records/:jobId', async (req: any, res: Response) => {
  try {
    const { jobId } = req.params;

    if (!req.user || !req.workspace) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    // Get records (workspace-scoped for security)
    const records = await migrationService.getMigrationRecords(jobId, req.workspace.id);

    return res.json({
      success: true,
      records,
    });

  } catch (error) {
    console.error('Migration records error:', error);
    return res.status(500).json({
      error: 'Failed to fetch migration records',
      message: error instanceof Error ? error.message : String(error),
    });
  }
});
