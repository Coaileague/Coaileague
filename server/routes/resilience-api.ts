/**
 * Resilience API Routes
 * Exposes Fortune 500-grade resilience infrastructure
 */

import { Router, RequestHandler } from 'express';
import { circuitBreaker } from '../services/resilience/circuitBreaker';
import { rateLimitQueue } from '../services/resilience/rateLimitQueue';
import { webhookVerifier } from '../services/integrations/webhookVerifier';
import { exchangeRateService } from '../services/currency/exchangeRateService';
import { financialAuditService } from '../services/compliance/financialAuditService';
import { requireAuth } from '../auth';

const router = Router();

const requireRole = (allowedRoles: string[]): RequestHandler => {
  return (req, res, next) => {
    const user = req.user as any;
    if (!user) {
      return res.status(401).json({ success: false, error: 'Authentication required' });
    }
    const userRole = user.platformRole || user.role || '';
    if (!allowedRoles.includes(userRole)) {
      return res.status(403).json({ success: false, error: 'Insufficient permissions' });
    }
    next();
  };
};

router.get('/circuit-breaker/status', requireAuth, requireRole(['root_admin', 'deputy_admin', 'sysop']), (req, res) => {
  const statuses = circuitBreaker.getAllStatuses();
  res.json({
    success: true,
    circuits: statuses,
    timestamp: new Date().toISOString(),
  });
});

router.post('/circuit-breaker/:service/reset', requireAuth, requireRole(['root_admin', 'sysop']), (req, res) => {
  const { service } = req.params;
  circuitBreaker.reset(service);
  res.json({
    success: true,
    message: `Circuit breaker for ${service} has been reset`,
  });
});

router.get('/rate-limit/status', requireAuth, requireRole(['root_admin', 'deputy_admin', 'sysop']), (req, res) => {
  const statuses = rateLimitQueue.getAllStatuses();
  res.json({
    success: true,
    queues: statuses,
    timestamp: new Date().toISOString(),
  });
});

router.post('/rate-limit/:service/clear', requireAuth, requireRole(['root_admin', 'sysop']), (req, res) => {
  const { service } = req.params;
  const cleared = rateLimitQueue.clearQueue(service);
  res.json({
    success: true,
    message: `Cleared ${cleared} pending requests for ${service}`,
  });
});

router.get('/exchange-rates/supported', requireAuth, (req, res) => {
  res.json({
    success: true,
    currencies: exchangeRateService.getSupportedCurrencies(),
    baseCurrency: 'USD',
  });
});

router.get('/exchange-rates/:from/:to', requireAuth, async (req, res) => {
  try {
    const { from, to } = req.params;
    const rate = await exchangeRateService.getRate(from, to);
    res.json({
      success: true,
      rate: rate.rate,
      source: rate.source,
      fetchedAt: rate.fetchedAt,
      validUntil: rate.validUntil,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: (error as Error).message,
    });
  }
});

router.post('/exchange-rates/convert', requireAuth, async (req, res) => {
  try {
    const { amount, from, to, precision } = req.body;
    
    if (!amount || !from || !to) {
      return res.status(400).json({
        success: false,
        error: 'Missing required fields: amount, from, to',
      });
    }

    const result = await exchangeRateService.convert(
      parseFloat(amount),
      from,
      to,
      { precision: precision || 2 }
    );

    res.json({
      success: true,
      ...result,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: (error as Error).message,
    });
  }
});

router.post('/exchange-rates/refresh', requireAuth, requireRole(['root_admin', 'sysop']), async (req, res) => {
  try {
    const result = await exchangeRateService.refreshAllRates();
    res.json({
      success: true,
      ...result,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: (error as Error).message,
    });
  }
});

router.get('/exchange-rates/cache', requireAuth, requireRole(['root_admin', 'deputy_admin', 'sysop']), (req, res) => {
  res.json({
    success: true,
    cache: exchangeRateService.getCacheStats(),
  });
});

router.get('/webhooks/stats', requireAuth, requireRole(['root_admin', 'deputy_admin', 'sysop']), (req, res) => {
  res.json({
    success: true,
    stats: webhookVerifier.getStats(),
  });
});

router.post('/financial-audit/report', requireAuth, requireRole(['root_admin', 'deputy_admin', 'owner', 'auditor']), async (req, res) => {
  try {
    const { workspaceId, periodStart, periodEnd } = req.body;
    const user = req.user as any;

    if (!workspaceId || !periodStart || !periodEnd) {
      return res.status(400).json({
        success: false,
        error: 'Missing required fields: workspaceId, periodStart, periodEnd',
      });
    }

    const report = await financialAuditService.generateComplianceReport(
      workspaceId,
      new Date(periodStart),
      new Date(periodEnd),
      user.id
    );

    res.json({
      success: true,
      report,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: (error as Error).message,
    });
  }
});

router.post('/financial-audit/verify-chain', requireAuth, requireRole(['root_admin', 'sysop', 'auditor']), async (req, res) => {
  try {
    const { workspaceId, entityType, startDate } = req.body;

    if (!workspaceId || !entityType) {
      return res.status(400).json({
        success: false,
        error: 'Missing required fields: workspaceId, entityType',
      });
    }

    const result = await financialAuditService.verifyAuditChainIntegrity(
      workspaceId,
      entityType,
      startDate ? new Date(startDate) : undefined
    );

    res.json({
      success: true,
      ...result,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: (error as Error).message,
    });
  }
});

router.post('/financial-audit/check-segregation', requireAuth, requireRole(['root_admin', 'deputy_admin', 'owner']), async (req, res) => {
  try {
    const { workspaceId, entityId, actorId, actionType } = req.body;

    if (!workspaceId || !entityId || !actorId || !actionType) {
      return res.status(400).json({
        success: false,
        error: 'Missing required fields',
      });
    }

    const result = await financialAuditService.checkSegregationOfDuties(
      workspaceId,
      entityId,
      actorId,
      actionType
    );

    res.json({
      success: true,
      ...result,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: (error as Error).message,
    });
  }
});

router.get('/health', (req, res) => {
  const circuitStatuses = circuitBreaker.getAllStatuses();
  const queueStatuses = rateLimitQueue.getAllStatuses();
  
  const hasOpenCircuits = Object.values(circuitStatuses).some(c => c.state === 'open');
  const hasFullQueues = Object.values(queueStatuses).some(q => q.state === 'near-limit');

  res.json({
    success: true,
    status: hasOpenCircuits ? 'degraded' : hasFullQueues ? 'warning' : 'healthy',
    circuits: circuitStatuses,
    queues: queueStatuses,
    timestamp: new Date().toISOString(),
  });
});

export default router;
