import { Router, Request, Response, NextFunction } from 'express';
import { sandboxSimulationService } from '../services/sandbox/sandboxSimulationService';
import { trinityAutomationTestRunner } from '../services/sandbox/trinityAutomationTestRunner';
import { requirePlatformRole } from '../rbac';

const router = Router();

const sandboxDevBypass = (req: Request, res: Response, next: NextFunction) => {
  if (process.env.NODE_ENV === 'development') {
    (req as any).user = { 
      id: 'sandbox-dev-user', 
      platformRole: 'root_admin',
      email: 'sandbox@dev.local'
    };
    return next();
  }
  return requirePlatformRole(['root_admin', 'co_admin', 'sysops'])(req, res, next);
};

router.get('/status', async (req: Request, res: Response) => {
  try {
    const status = await sandboxSimulationService.getSandboxStatus();
    res.json({
      success: true,
      sandbox: status,
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

router.post('/seed', sandboxDevBypass, async (req: Request, res: Response) => {
  try {
    const config = req.body;
    
    console.log('[Sandbox API] Starting sandbox simulation...');
    
    const result = await sandboxSimulationService.runFullSimulation({
      employeeCount: config.employeeCount || 100,
      clientCount: config.clientCount || 10,
      weeksOfHistory: config.weeksOfHistory || 4,
      includeTimeEntries: config.includeTimeEntries !== false,
      includeSchedules: config.includeSchedules !== false,
      includeInvoices: config.includeInvoices !== false,
      includePayroll: config.includePayroll !== false,
    });

    res.json({
      success: true,
      result,
    });
  } catch (error: any) {
    console.error('[Sandbox API] Seed error:', error);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

router.post('/clear', sandboxDevBypass, async (req: Request, res: Response) => {
  try {
    await sandboxSimulationService.clearSandboxData();
    
    res.json({
      success: true,
      message: 'Sandbox data cleared successfully',
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

router.post('/run-automation-tests', sandboxDevBypass, async (req: Request, res: Response) => {
  try {
    console.log('[Sandbox API] Running automation tests...');
    
    const report = await trinityAutomationTestRunner.runFullAutomationTest();

    res.json({
      success: true,
      report,
    });
  } catch (error: any) {
    console.error('[Sandbox API] Automation test error:', error);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

router.post('/full-test-cycle', sandboxDevBypass, async (req: Request, res: Response) => {
  try {
    const config = req.body;
    
    console.log('[Sandbox API] Running full test cycle (seed + test)...');
    
    const seedResult = await sandboxSimulationService.runFullSimulation({
      employeeCount: config.employeeCount || 100,
      clientCount: config.clientCount || 10,
      weeksOfHistory: config.weeksOfHistory || 4,
    });

    const testReport = await trinityAutomationTestRunner.runFullAutomationTest();

    res.json({
      success: true,
      seedResult,
      testReport,
      summary: {
        dataSeeded: seedResult.summary,
        testsRun: testReport.summary,
        overallSuccess: testReport.failed === 0,
      },
    });
  } catch (error: any) {
    console.error('[Sandbox API] Full test cycle error:', error);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

export default router;
