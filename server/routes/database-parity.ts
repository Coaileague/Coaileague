/**
 * Database Parity Scanner API Routes
 * 
 * Provides endpoints for database schema scanning and auto-fix operations.
 * Integrated with Universal Canvas Hub for real-time diagnostics display.
 * 
 * Follows 7-Step Orchestration Pattern:
 * TRIGGER → FETCH → VALIDATE → PROCESS → MUTATE → CONFIRM → NOTIFY
 */

import { sanitizeError } from '../middleware/errorHandler';
import { Router, Request, Response } from 'express';
import { requireAuth } from '../auth';
import { requirePlatformRole } from '../rbac';
import { createLogger } from '../lib/logger';
const log = createLogger('DatabaseParity');

import { 
  runParityScan, 
  executeAutoFix, 
  quickFixCommonColumns,
  scanAndAutoFix,
  type ParityScanResult,
  type AutoFixResult,
} from '../services/databaseParityScanner';

const router = Router();

/**
 * GET /api/admin/database-parity/scan
 * Scan database for schema parity issues
 * Requires: root_admin, super_admin, or sysop platform role
 */
router.get('/scan', 
  requireAuth, 
  requirePlatformRole(['root_admin', 'deputy_admin', 'sysop']),
  async (req: Request, res: Response) => {
    try {
      log.info('[DatabaseParity] Scan requested by user:', req.user?.id);
      
      const result = await runParityScan();
      
      res.json({
        success: true,
        data: result,
        meta: {
          timestamp: new Date().toISOString(),
          requestedBy: req.user?.id,
        },
      });
    } catch (error: unknown) {
      log.error('[DatabaseParity] Scan error:', error);
      res.status(500).json({
        success: false,
        error: sanitizeError(error),
        meta: {
          timestamp: new Date().toISOString(),
        },
      });
    }
  }
);

/**
 * Validate SQL statement is a safe ALTER TABLE ADD COLUMN IF NOT EXISTS statement
 * SECURITY: Prevents SQL injection by only allowing specific DDL patterns
 */
function validateSafeFixStatement(sql: string): boolean {
  const sanitized = sql.trim().toUpperCase();
  
  // Only allow ALTER TABLE ... ADD COLUMN IF NOT EXISTS statements
  const safePattern = /^ALTER\s+TABLE\s+"?\w+"?\s+ADD\s+COLUMN\s+IF\s+NOT\s+EXISTS\s+/i;
  if (!safePattern.test(sql.trim())) {
    return false;
  }
  
  // Reject any statements with dangerous keywords
  const dangerousKeywords = ['DROP', 'DELETE', 'TRUNCATE', 'UPDATE', 'INSERT', 'GRANT', 'REVOKE', 'CREATE USER', 'ALTER USER'];
  for (const keyword of dangerousKeywords) {
    if (sanitized.includes(keyword) && !sanitized.includes('ADD COLUMN')) {
      return false;
    }
  }
  
  // Reject any SQL injection attempts
  const injectionPatterns = [';', '--', '/*', '*/', 'UNION', 'SELECT', 'EXECUTE'];
  for (const pattern of injectionPatterns) {
    if (sanitized.includes(pattern)) {
      return false;
    }
  }
  
  return true;
}

/**
 * POST /api/admin/database-parity/auto-fix
 * Execute auto-fix SQL statements for detected issues
 * Requires: root_admin platform role only (dangerous operation)
 * SECURITY: Only accepts safe ALTER TABLE ADD COLUMN IF NOT EXISTS statements
 */
router.post('/auto-fix',
  requireAuth,
  requirePlatformRole(['root_admin']),
  async (req: Request, res: Response) => {
    try {
      const { fixStatements } = req.body;
      
      if (!Array.isArray(fixStatements) || fixStatements.length === 0) {
        return res.status(400).json({
          success: false,
          error: 'No fix statements provided',
        });
      }
      
      // SECURITY: Validate all statements are safe DDL operations
      const invalidStatements: string[] = [];
      for (const statement of fixStatements) {
        if (typeof statement !== 'string' || !validateSafeFixStatement(statement)) {
          invalidStatements.push(statement);
        }
      }
      
      if (invalidStatements.length > 0) {
        log.error(`[DatabaseParity] SECURITY: Rejected ${invalidStatements.length} unsafe SQL statements from user ${req.user?.id}`);
        return res.status(400).json({
          success: false,
          error: `Security: ${invalidStatements.length} statement(s) rejected. Only ALTER TABLE ADD COLUMN IF NOT EXISTS statements are allowed.`,
          rejectedCount: invalidStatements.length,
        });
      }
      
      log.info(`[DatabaseParity] Auto-fix requested by user: ${req.user?.id}, ${fixStatements.length} validated statements`);
      
      const result = await executeAutoFix(fixStatements);
      
      res.json({
        success: result.success,
        data: result,
        meta: {
          timestamp: new Date().toISOString(),
          requestedBy: req.user?.id,
        },
      });
    } catch (error: unknown) {
      log.error('[DatabaseParity] Auto-fix error:', error);
      res.status(500).json({
        success: false,
        error: sanitizeError(error),
      });
    }
  }
);

/**
 * POST /api/admin/database-parity/quick-fix
 * Apply common column fixes (updated_at, etc.)
 * Requires: root_admin or super_admin platform role
 */
router.post('/quick-fix',
  requireAuth,
  requirePlatformRole(['root_admin', 'deputy_admin', 'sysop']),
  async (req: Request, res: Response) => {
    try {
      log.info(`[DatabaseParity] Quick-fix requested by user: ${req.user?.id}`);
      
      const result = await quickFixCommonColumns();
      
      res.json({
        success: result.success,
        data: result,
        meta: {
          timestamp: new Date().toISOString(),
          requestedBy: req.user?.id,
        },
      });
    } catch (error: unknown) {
      log.error('[DatabaseParity] Quick-fix error:', error);
      res.status(500).json({
        success: false,
        error: sanitizeError(error),
      });
    }
  }
);

/**
 * POST /api/admin/database-parity/scan-and-fix
 * Scan and auto-fix in one operation
 * Requires: root_admin platform role only
 */
router.post('/scan-and-fix',
  requireAuth,
  requirePlatformRole(['root_admin']),
  async (req: Request, res: Response) => {
    try {
      log.info(`[DatabaseParity] Scan-and-fix requested by user: ${req.user?.id}`);
      
      const result = await scanAndAutoFix();
      
      res.json({
        success: true,
        data: result,
        meta: {
          timestamp: new Date().toISOString(),
          requestedBy: req.user?.id,
        },
      });
    } catch (error: unknown) {
      log.error('[DatabaseParity] Scan-and-fix error:', error);
      res.status(500).json({
        success: false,
        error: sanitizeError(error),
      });
    }
  }
);

export default router;
