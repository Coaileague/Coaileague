/**
 * ACME Sandbox Simulation Routes
 * ==============================
 * Exposes the ACME month orchestrator so a developer (or the regulatory
 * auditor login it provisions) can exercise the simulation and inspect
 * the artifacts / telemetry without leaving the platform.
 *
 *   POST /api/sandbox/acme/run            → orchestrate the full month
 *   GET  /api/sandbox/acme/telemetry      → latest holistic telemetry
 *   GET  /api/sandbox/acme/artifacts      → list clearly-fake artifacts
 *   GET  /api/sandbox/acme/artifacts/:id  → fetch one fake artifact (raw)
 *   POST /api/sandbox/acme/auditor/seed   → provision/refresh auditor login
 *   GET  /api/sandbox/acme/webhook-log    → sandbox webhook payload journal
 *
 * All write endpoints refuse to run in production.
 */

import { Router, type Request, type Response } from 'express';
import { promises as fs } from 'fs';
import path from 'path';
import { isProduction } from '../lib/isProduction';
import { createLogger } from '../lib/logger';
import { runAcmeMonthSimulation } from '../services/sandbox/acmeMonthOrchestrator';
import {
  listFakeArtifacts,
  getFakeArtifact,
  ARTIFACT_ROOT,
} from '../services/sandbox/fakeArtifactGenerator';
import { seedRegulatoryAuditor } from '../services/sandbox/regulatoryAuditorSeeder';
import { listWebhookLog } from '../services/sandbox/sandboxWebhookSynthesizer';

const log = createLogger('AcmeSandboxRoutes');
export const acmeSandboxRouter = Router();

const refuseInProd = (_req: Request, res: Response, next: () => void) => {
  if (isProduction()) {
    res.status(403).json({ ok: false, error: 'ACME sandbox simulation is disabled in production' });
    return;
  }
  next();
};

acmeSandboxRouter.post('/run', refuseInProd, async (req: Request, res: Response) => {
  try {
    const baseUrl = (req.body?.baseUrl as string | undefined)
      || `${req.protocol}://${req.get('host')}`;
    const result = await runAcmeMonthSimulation({ baseUrl });
    res.json({
      ok: true,
      verdict: result.telemetry.verdict,
      workspaceId: result.workspaceId,
      runStamp: result.runStamp,
      durationMs: result.durationMs,
      seedSummary: result.seedSummary,
      auditor: {
        email: result.auditor.email,
        password: result.auditor.password,
        loginUrl: result.auditor.loginUrl,
        auditId: result.auditor.auditId,
      },
      artifactCount: result.artifacts.length,
      telemetry: result.telemetry,
      telemetryFiles: result.telemetryFiles,
    });
  } catch (err: any) {
    log.error('[ACME-Sandbox] /run failed', err);
    res.status(500).json({ ok: false, error: err?.message ?? String(err) });
  }
});

acmeSandboxRouter.get('/telemetry', async (_req: Request, res: Response) => {
  try {
    const file = path.join(ARTIFACT_ROOT, 'telemetry', 'latest.json');
    const body = await fs.readFile(file, 'utf8');
    res.type('application/json').send(body);
  } catch (err: any) {
    res.status(404).json({ ok: false, error: 'No telemetry yet — run POST /api/sandbox/acme/run first' });
  }
});

acmeSandboxRouter.get('/artifacts', async (req: Request, res: Response) => {
  try {
    const wsId = (req.query.workspaceId as string) || 'demo-workspace-00000000';
    const items = await listFakeArtifacts(wsId);
    res.json({ ok: true, count: items.length, items });
  } catch (err: any) {
    res.status(500).json({ ok: false, error: err?.message });
  }
});

acmeSandboxRouter.get('/artifacts/:id', async (req: Request, res: Response) => {
  try {
    const a = await getFakeArtifact(req.params.id);
    if (!a) {
      res.status(404).json({ ok: false, error: 'artifact not found' });
      return;
    }
    const body = await fs.readFile(a.diskPath);
    res.type(a.mimeType).send(body);
  } catch (err: any) {
    res.status(500).json({ ok: false, error: err?.message });
  }
});

acmeSandboxRouter.post('/auditor/seed', refuseInProd, async (req: Request, res: Response) => {
  try {
    const workspaceId = (req.body?.workspaceId as string) || 'demo-workspace-00000000';
    const baseUrl = (req.body?.baseUrl as string | undefined)
      || `${req.protocol}://${req.get('host')}`;
    const seed = await seedRegulatoryAuditor({ workspaceId, baseUrl });
    res.json({ ok: true, auditor: seed });
  } catch (err: any) {
    res.status(500).json({ ok: false, error: err?.message });
  }
});

acmeSandboxRouter.get('/webhook-log', async (req: Request, res: Response) => {
  try {
    const wsId = (req.query.workspaceId as string) || 'demo-workspace-00000000';
    const limit = Math.min(parseInt(String(req.query.limit ?? '50'), 10) || 50, 200);
    const rows = await listWebhookLog(wsId, limit);
    res.json({ ok: true, count: rows.length, rows });
  } catch (err: any) {
    res.status(500).json({ ok: false, error: err?.message });
  }
});

export default acmeSandboxRouter;
