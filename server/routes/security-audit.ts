/**
 * Security Audit Routes
 * =====================
 * API endpoints for viewing virus scan logs and security statistics.
 * Restricted to admin/owner users only.
 */

import { Router, Request, Response } from 'express';
import { requireAuth } from '../auth';
import type { AuthenticatedRequest } from '../rbac';
import { getScanLogs, getThreatStats, type ScanStatus } from '../services/virusScanService';
import { createLogger } from '../lib/logger';
const log = createLogger('SecurityAudit');


const router = Router();

/**
 * GET /api/security/scan-logs
 * Get virus scan logs for audit purposes
 * Query params:
 *   - status: Filter by scan status (clean, infected, suspicious, error)
 *   - limit: Number of results (default 100, max 1000)
 *   - offset: Pagination offset
 */
router.get('/scan-logs', requireAuth, async (req: Request, res: Response) => {
  try {
    const authReq = req as AuthenticatedRequest;
    const workspaceId = authReq.workspaceId || authReq.user?.workspaceId || authReq.user?.currentWorkspaceId;
    const userRole = authReq.workspaceRole || authReq.user?.role;

    // Only admin/owner can view scan logs
    if (!['org_admin', 'co_owner', 'org_owner'].includes(userRole || '')) {
      return res.status(403).json({ error: 'Access denied. Admin privileges required.' });
    }

    if (!workspaceId) {
      return res.status(400).json({ error: 'No workspace context' });
    }

    const status = req.query.status as ScanStatus | undefined;
    const limit = Math.min(parseInt(req.query.limit as string) || 100, 1000);
    const offset = parseInt(req.query.offset as string) || 0;

    const logs = getScanLogs({
      workspaceId,
      status,
      limit,
      offset,
    });

    res.json({
      logs,
      pagination: {
        limit,
        offset,
        returned: logs.length,
      },
    });
  } catch (error) {
    log.error('[SecurityAudit] Error fetching scan logs:', error);
    res.status(500).json({ error: 'Failed to fetch scan logs' });
  }
});

/**
 * GET /api/security/scan-stats
 * Get virus scan statistics
 */
router.get('/scan-stats', requireAuth, async (req: Request, res: Response) => {
  try {
    const authReq = req as AuthenticatedRequest;
    const workspaceId = authReq.workspaceId || authReq.user?.workspaceId || authReq.user?.currentWorkspaceId;
    const userRole = authReq.workspaceRole || authReq.user?.role;

    // Only admin/owner can view stats
    if (!['org_admin', 'co_owner', 'org_owner'].includes(userRole || '')) {
      return res.status(403).json({ error: 'Access denied. Admin privileges required.' });
    }

    if (!workspaceId) {
      return res.status(400).json({ error: 'No workspace context' });
    }

    const stats = getThreatStats(workspaceId);

    res.json({
      workspace: workspaceId,
      stats,
      scanningEnabled: process.env.VIRUS_SCAN_ENABLED !== 'false',
      cloudScanEnabled: !!process.env.VIRUSTOTAL_API_KEY,
    });
  } catch (error) {
    log.error('[SecurityAudit] Error fetching scan stats:', error);
    res.status(500).json({ error: 'Failed to fetch scan statistics' });
  }
});

/**
 * GET /api/security/threats
 * Get recent threat detections across workspace
 */
router.get('/threats', requireAuth, async (req: Request, res: Response) => {
  try {
    const authReq = req as AuthenticatedRequest;
    const workspaceId = authReq.workspaceId || authReq.user?.workspaceId || authReq.user?.currentWorkspaceId;
    const userRole = authReq.workspaceRole || authReq.user?.role;

    // Only admin/owner can view threats
    if (!['org_admin', 'co_owner', 'org_owner'].includes(userRole || '')) {
      return res.status(403).json({ error: 'Access denied. Admin privileges required.' });
    }

    if (!workspaceId) {
      return res.status(400).json({ error: 'No workspace context' });
    }

    // Get infected and suspicious files
    const threats = getScanLogs({
      workspaceId,
      limit: 50,
    }).filter(log =>
      log.scanResult.status === 'infected' ||
      log.scanResult.status === 'suspicious'
    );

    res.json({
      threats: threats.map(t => ({
        filename: t.filename,
        fileSize: t.fileSize,
        mimeType: t.mimeType,
        uploaderId: t.uploaderId,
        status: t.scanResult.status,
        threatName: t.scanResult.threatName,
        confidence: t.scanResult.confidence,
        timestamp: t.scanResult.timestamp,
        ipAddress: t.ipAddress,
      })),
      total: threats.length,
    });
  } catch (error) {
    log.error('[SecurityAudit] Error fetching threats:', error);
    res.status(500).json({ error: 'Failed to fetch threat data' });
  }
});

/**
 * GET /api/security/config
 * Get current security configuration (no secrets)
 */
router.get('/config', requireAuth, async (req: Request, res: Response) => {
  try {
    const authReq = req as AuthenticatedRequest;
    const userRole = authReq.workspaceRole || authReq.user?.role;

    // Only admin/owner can view config
    if (!['org_admin', 'co_owner', 'org_owner'].includes(userRole || '')) {
      return res.status(403).json({ error: 'Access denied. Admin privileges required.' });
    }

    res.json({
      virusScanning: {
        enabled: process.env.VIRUS_SCAN_ENABLED !== 'false',
        mode: process.env.VIRUS_SCAN_MODE || 'standard',
        cloudScanEnabled: !!process.env.VIRUSTOTAL_API_KEY,
        provider: process.env.VIRUSTOTAL_API_KEY ? 'VirusTotal' : 'Local Only',
      },
      fileUploadLimits: {
        chatUploads: '25MB',
        emailAttachments: '10MB',
        screenshots: '5MB',
        bulkImports: 'Unlimited (CSV only)',
      },
      allowedFileTypes: {
        images: ['jpeg', 'png', 'gif', 'webp', 'svg'],
        documents: ['pdf', 'doc', 'docx', 'xls', 'xlsx'],
        text: ['txt', 'csv'],
        archives: ['zip'],
      },
    });
  } catch (error) {
    log.error('[SecurityAudit] Error fetching config:', error);
    res.status(500).json({ error: 'Failed to fetch security config' });
  }
});

export default router;
