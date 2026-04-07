/**
 * VISUAL QA API ROUTES (STUB)
 * Visual QA tables have been consolidated. Routes return disabled status.
 */

import { Router } from 'express';
import { ANOMALY_CATEGORIES } from '../services/ai-brain/subagents/visualQaSubagent';
import { requireAuth } from '../auth';

const router = Router();

const DISABLED = { error: 'Visual QA is currently disabled.', status: 'disabled' };

router.post('/checks', requireAuth, async (_req, res) => {
  res.status(503).json(DISABLED);
});

router.get('/checks', requireAuth, async (_req, res) => {
  res.json({ runs: [], total: 0 });
});

router.get('/checks/:id', requireAuth, async (_req, res) => {
  res.status(503).json(DISABLED);
});

router.get('/checks/:id/findings', requireAuth, async (_req, res) => {
  res.json({ findings: [] });
});

router.patch('/findings/:id', requireAuth, async (_req, res) => {
  res.status(503).json(DISABLED);
});

router.post('/baselines', requireAuth, async (_req, res) => {
  res.status(503).json(DISABLED);
});

router.get('/baselines', requireAuth, async (_req, res) => {
  res.json({ baselines: [] });
});

router.delete('/baselines/:id', requireAuth, async (_req, res) => {
  res.status(503).json(DISABLED);
});

router.post('/screenshot', requireAuth, async (_req, res) => {
  res.status(503).json(DISABLED);
});

router.post('/ask', requireAuth, async (_req, res) => {
  res.status(503).json(DISABLED);
});

router.get('/viewports', requireAuth, async (_req, res) => {
  res.json({ viewports: [] });
});

router.post('/quick-scan', requireAuth, async (_req, res) => {
  res.status(503).json(DISABLED);
});

router.get('/anomaly-categories', requireAuth, (_req, res) => {
  res.json({ categories: ANOMALY_CATEGORIES });
});

export default router;
