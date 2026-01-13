/**
 * Maintenance Mode API Routes
 * ============================
 * Public and admin endpoints for maintenance mode management.
 */

import { Router } from 'express';
import { z } from 'zod';
import { maintenanceModeService } from '../services/maintenanceModeService';
import { trinityMaintenanceOrchestrator, DiagnosticsReport } from '../services/trinityMaintenanceOrchestrator';

const router = Router();

const activateSchema = z.object({
  reason: z.string().min(1),
  estimatedDurationMinutes: z.number().min(1).max(480).default(30),
  statusMessage: z.string().optional(),
  triadReportId: z.string().optional()
});

const updateProgressSchema = z.object({
  progressPercent: z.number().min(0).max(100),
  statusMessage: z.string().optional()
});

router.get('/api/maintenance/status', async (req, res) => {
  try {
    const status = await maintenanceModeService.getPublicStatus();
    res.json({ success: true, ...status });
  } catch (error: any) {
    console.error('[Maintenance] Status error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

router.get('/api/maintenance/window', async (req, res) => {
  try {
    const window = await maintenanceModeService.getMaintenanceWindow();
    res.json({ success: true, window });
  } catch (error: any) {
    console.error('[Maintenance] Window error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

router.post('/api/maintenance/activate', async (req, res) => {
  try {
    const user = req.user as any;
    
    if (!user) {
      return res.status(401).json({ success: false, error: 'Authentication required' });
    }

    const allowedRoles = ['root_admin', 'co_admin', 'sysops'];
    const platformRole = user.platformRole || 'none';
    const orgRole = user.role || 'employee';
    
    const isAuthorized = allowedRoles.includes(platformRole) || orgRole === 'org_owner';
    
    if (!isAuthorized) {
      return res.status(403).json({ 
        success: false, 
        error: 'Insufficient permissions to activate maintenance mode' 
      });
    }

    const data = activateSchema.parse(req.body);
    
    const result = await maintenanceModeService.activateMaintenance({
      reason: data.reason,
      estimatedDurationMinutes: data.estimatedDurationMinutes,
      activatedBy: {
        type: 'admin',
        id: user.id,
        name: user.email || user.username
      },
      statusMessage: data.statusMessage,
      triadReportId: data.triadReportId
    });

    res.json(result);
    
  } catch (error: any) {
    console.error('[Maintenance] Activate error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

router.post('/api/maintenance/activate-trinity', async (req, res) => {
  try {
    const trinityHeader = req.headers['x-trinity-actor'];
    const bypassSecret = req.headers['x-diagnostics-runner'];
    
    if (trinityHeader !== 'trinity' && bypassSecret !== process.env.DIAG_BYPASS_SECRET) {
      return res.status(403).json({ success: false, error: 'Trinity authorization required' });
    }

    const data = activateSchema.parse(req.body);
    
    const result = await maintenanceModeService.activateMaintenance({
      reason: data.reason,
      estimatedDurationMinutes: data.estimatedDurationMinutes,
      activatedBy: {
        type: 'trinity',
        id: 'trinity-brain',
        name: 'Trinity AI'
      },
      statusMessage: data.statusMessage,
      triadReportId: data.triadReportId
    });

    res.json(result);
    
  } catch (error: any) {
    console.error('[Maintenance] Trinity activate error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

router.post('/api/maintenance/deactivate', async (req, res) => {
  try {
    const user = req.user as any;
    const trinityHeader = req.headers['x-trinity-actor'];
    
    let deactivatedBy: { type: 'admin' | 'trinity' | 'system'; id?: string; name?: string };
    
    if (trinityHeader === 'trinity') {
      deactivatedBy = { type: 'trinity', id: 'trinity-brain', name: 'Trinity AI' };
    } else if (user) {
      deactivatedBy = { type: 'admin', id: user.id, name: user.email };
    } else {
      return res.status(401).json({ success: false, error: 'Authentication required' });
    }

    const result = await maintenanceModeService.deactivateMaintenance(deactivatedBy);
    res.json(result);
    
  } catch (error: any) {
    console.error('[Maintenance] Deactivate error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

router.post('/api/maintenance/progress', async (req, res) => {
  try {
    const data = updateProgressSchema.parse(req.body);
    
    await maintenanceModeService.updateProgress(data.progressPercent, data.statusMessage);
    
    res.json({ success: true });
  } catch (error: any) {
    console.error('[Maintenance] Progress error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

router.get('/api/maintenance/can-auto-activate', async (req, res) => {
  try {
    const canActivate = await maintenanceModeService.shouldAutoActivate();
    const window = await maintenanceModeService.getMaintenanceWindow();
    
    res.json({ 
      success: true, 
      canAutoActivate: canActivate,
      currentlyActive: window.isActive,
      lowTrafficWindow: canActivate
    });
  } catch (error: any) {
    console.error('[Maintenance] Auto-activate check error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

const diagnosticsReportSchema = z.object({
  runId: z.string(),
  criticalIssues: z.number().min(0),
  highIssues: z.number().min(0),
  mediumIssues: z.number().min(0),
  lowIssues: z.number().min(0),
  totalIssues: z.number().min(0),
  estimatedFixTimeMinutes: z.number().min(0),
  requiresDowntime: z.boolean(),
  affectedSystems: z.array(z.string())
});

router.post('/api/maintenance/orchestrator/trigger', async (req, res) => {
  try {
    const trinityHeader = req.headers['x-trinity-actor'];
    const diagHeader = req.headers['x-diagnostics-runner'];
    
    if (trinityHeader !== 'trinity' && diagHeader !== process.env.DIAG_BYPASS_SECRET) {
      return res.status(403).json({ success: false, error: 'Trinity or diagnostics authorization required' });
    }

    const report = diagnosticsReportSchema.parse(req.body.report);
    const immediate = req.body.immediate === true;

    const result = await trinityMaintenanceOrchestrator.triggerMaintenance({
      report,
      immediate
    });

    res.json({ success: true, ...result });
    
  } catch (error: any) {
    console.error('[Maintenance] Orchestrator trigger error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

router.post('/api/maintenance/orchestrator/complete', async (req, res) => {
  try {
    const trinityHeader = req.headers['x-trinity-actor'];
    const diagHeader = req.headers['x-diagnostics-runner'];
    
    if (trinityHeader !== 'trinity' && diagHeader !== process.env.DIAG_BYPASS_SECRET) {
      return res.status(403).json({ success: false, error: 'Trinity or diagnostics authorization required' });
    }

    const result = await trinityMaintenanceOrchestrator.completeMaintenance();
    res.json({ success: true, ...result });
    
  } catch (error: any) {
    console.error('[Maintenance] Orchestrator complete error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

router.get('/api/maintenance/orchestrator/status', async (req, res) => {
  try {
    const status = await trinityMaintenanceOrchestrator.getStatus();
    res.json({ success: true, ...status });
  } catch (error: any) {
    console.error('[Maintenance] Orchestrator status error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

router.get('/api/maintenance/orchestrator/next-window', async (req, res) => {
  try {
    const nextWindow = trinityMaintenanceOrchestrator.getNextMaintenanceWindow();
    const isWithinWindow = trinityMaintenanceOrchestrator.isWithinMaintenanceWindow();
    
    res.json({ 
      success: true, 
      nextWindow: nextWindow.toISOString(),
      isWithinWindow,
      formattedTime: nextWindow.toLocaleString()
    });
  } catch (error: any) {
    console.error('[Maintenance] Next window error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

export default router;
