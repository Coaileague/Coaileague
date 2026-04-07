/**
 * Virus Scan Middleware
 * =====================
 * CRITICAL SECURITY: Express middleware that scans uploaded files for malware.
 *
 * This middleware should be applied AFTER multer but BEFORE file processing.
 * It will reject requests containing infected files with appropriate error messages.
 *
 * Usage:
 *   import { virusScanMiddleware } from '../middleware/virusScan';
 *
 *   router.post('/upload',
 *     requireAuth,
 *     upload.single('file'),
 *     virusScanMiddleware({ strict: true }),
 *     async (req, res) => { ... }
 *   );
 */

import type { Request, Response, NextFunction, RequestHandler } from 'express';
import { createLogger } from '../lib/logger';
const log = createLogger('virusScan');
import {
  scanFile,
  logScanResult,
  isVirusScanEnabled,
  validateFileForScan,
  type ScanResult,
} from '../services/virusScanService';

export interface VirusScanOptions {
  // Block suspicious files (not just confirmed malware)
  strict?: boolean;
  // Skip cloud scan for faster processing
  skipCloudScan?: boolean;
  // Maximum file size to scan (larger files are rejected)
  maxFileSizeBytes?: number;
  // Custom error handler
  onError?: (error: Error, req: Request, res: Response) => void;
  // Custom threat handler
  onThreatDetected?: (result: ScanResult, filename: string, req: Request) => void;
}

// Extend Express.Multer.File to include scan result
declare global {
  namespace Express {
    interface MulterFile {
      scanResult?: ScanResult;
    }
  }
}

/**
 * Extract user info from request for logging
 */
function extractUserInfo(req: Request): { userId: string; workspaceId: string; ipAddress: string; userAgent: string } {
  const authReq = req as any;
  return {
    userId: authReq.user?.id || authReq.user?.claims?.sub || 'anonymous',
    workspaceId: authReq.workspaceId || authReq.user?.currentWorkspaceId || 'unknown',
    ipAddress: req.ip || req.socket?.remoteAddress || 'unknown',
    userAgent: req.get('user-agent') || 'unknown',
  };
}

/**
 * Scan a single file
 */
async function scanSingleFile(
  file: Express.Multer.File,
  options: VirusScanOptions,
  userInfo: { userId: string; workspaceId: string; ipAddress: string; userAgent: string }
): Promise<{ passed: boolean; result: ScanResult }> {
  // Validate file first
  const validation = validateFileForScan(
    file.buffer,
    file.mimetype,
    options.maxFileSizeBytes
  );

  if (!validation.valid) {
    const errorResult: ScanResult = {
      status: 'error',
      confidence: 0,
      scanDuration: 0,
      scanMethod: 'local',
      details: validation.error || 'File validation failed',
      sha256Hash: '',
      timestamp: new Date(),
    };
    return { passed: false, result: errorResult };
  }

  // Perform virus scan
  const result = await scanFile(file.buffer, file.originalname, file.mimetype, {
    skipCloudScan: options.skipCloudScan,
  });

  // Log the scan result
  logScanResult({
    filename: file.originalname,
    fileSize: file.size,
    mimeType: file.mimetype,
    uploaderId: userInfo.userId,
    workspaceId: userInfo.workspaceId,
    scanResult: result,
    ipAddress: userInfo.ipAddress,
    userAgent: userInfo.userAgent,
  });

  // Determine if file passes scan
  const passed =
    result.status === 'clean' ||
    (result.status === 'suspicious' && !options.strict);

  // Attach scan result to file for downstream access
  (file as any).scanResult = result;

  return { passed, result };
}

/**
 * Create virus scan middleware with options
 */
export function virusScanMiddleware(options: VirusScanOptions = {}): RequestHandler {
  return async (req: Request, res: Response, next: NextFunction) => {
    // Skip if virus scanning is disabled
    if (!isVirusScanEnabled()) {
      log.info('[VirusScan] Scanning disabled - allowing upload');
      return next();
    }

    // Get files from request (supports both single and array uploads)
    const files: Express.Multer.File[] = [];

    if (req.file) {
      files.push(req.file);
    }

    if (req.files) {
      if (Array.isArray(req.files)) {
        files.push(...req.files);
      } else {
        // Handle field-based file uploads
        for (const fieldFiles of Object.values(req.files)) {
          if (Array.isArray(fieldFiles)) {
            files.push(...fieldFiles);
          }
        }
      }
    }

    // If no files, skip scanning
    if (files.length === 0) {
      return next();
    }

    const userInfo = extractUserInfo(req);

    try {
      // Scan all files
      const scanResults = await Promise.all(
        files.map((file) => scanSingleFile(file, options, userInfo))
      );

      // Check for any failures
      const failedScans = scanResults.filter((r) => !r.passed);

      if (failedScans.length > 0) {
        // Get the most severe result
        const mostSevere = failedScans.reduce((prev, curr) => {
          if (curr.result.status === 'infected') return curr;
          if (prev.result.status === 'infected') return prev;
          if (curr.result.status === 'suspicious') return curr;
          return prev;
        });

        // Call custom threat handler if provided
        if (options.onThreatDetected) {
          const failedFile = files.find(
            (f) => (f as any).scanResult?.sha256Hash === mostSevere.result.sha256Hash
          );
          options.onThreatDetected(
            mostSevere.result,
            failedFile?.originalname || 'unknown',
            req
          );
        }

        // Build error message
        const errorMessage =
          mostSevere.result.status === 'infected'
            ? `File rejected: Malware detected (${mostSevere.result.threatName || 'Threat'})`
            : mostSevere.result.status === 'suspicious'
            ? `File rejected: Suspicious content detected (${mostSevere.result.threatName || 'Suspicious pattern'})`
            : `File rejected: ${mostSevere.result.details}`;

        log.error(
          `[VirusScan] BLOCKED UPLOAD from ${userInfo.userId}@${userInfo.workspaceId}: ${errorMessage}`
        );

        return res.status(400).json({
          error: 'File security check failed',
          message: errorMessage,
          status: mostSevere.result.status,
          code: 'VIRUS_SCAN_FAILED',
        });
      }

      // All files passed - continue
      log.info(
        `[VirusScan] ${files.length} file(s) passed security scan for ${userInfo.userId}`
      );
      next();
    } catch (error) {
      log.error('[VirusScan] Scan error:', error);

      if (options.onError) {
        options.onError(error as Error, req, res);
      } else {
        // Default: reject on error (fail-safe)
        return res.status(500).json({
          error: 'File security check failed',
          message: 'Unable to verify file safety. Please try again.',
          code: 'VIRUS_SCAN_ERROR',
        });
      }
    }
  };
}

/**
 * Strict virus scan - blocks both infected and suspicious files
 */
export const strictVirusScan = virusScanMiddleware({ strict: true });

/**
 * Standard virus scan - only blocks confirmed malware
 */
export const standardVirusScan = virusScanMiddleware({ strict: false });

/**
 * Fast local-only scan - no cloud scanning
 */
export const localVirusScan = virusScanMiddleware({
  strict: true,
  skipCloudScan: true,
});
