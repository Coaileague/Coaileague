/**
 * ACME Month Orchestrator
 * ========================
 * Runs the full "ACME sandbox month" the user asked for:
 *
 *   1. Re-uses the existing seed (`seedAcmeFullDemo`) so persisted records
 *      live in the canonical demo workspace.
 *   2. Generates clearly-fake artifacts (IDs, photos, contracts, financials).
 *   3. Provisions the regulatory auditor login (with a known sandbox
 *      password) so the user can sign in and walk the workspace.
 *   4. Runs the four chaos scenarios + Stripe / Plaid sandbox webhook
 *      synthesis.
 *   5. Emits the Holistic Telemetry Log to disk under
 *      `artifacts/acme-sandbox/telemetry/`.
 *
 * Every step is idempotent — re-running the orchestrator refreshes the
 * artifacts and telemetry without duplicating database records.
 */

import { isProduction } from '../../lib/isProduction';
import { createLogger } from '../../lib/logger';
import { generateAcmeFakeArtifactSet, type FakeArtifact } from './fakeArtifactGenerator';
import { seedRegulatoryAuditor, type AuditorSeedResult } from './regulatoryAuditorSeeder';
import {
  runAllChaosTests,
  assembleTelemetry,
  persistTelemetry,
  formatTelemetryAsLog,
  type HolisticTelemetry,
} from './acmeChaosRunner';

const log = createLogger('AcmeMonthOrchestrator');

export interface AcmeMonthRunResult {
  workspaceId: string;
  runStamp: string;
  seedSummary: string;
  artifacts: FakeArtifact[];
  auditor: AuditorSeedResult;
  telemetry: HolisticTelemetry;
  telemetryFiles: { jsonPath: string; logPath: string };
  durationMs: number;
}

export async function runAcmeMonthSimulation(opts?: { baseUrl?: string }): Promise<AcmeMonthRunResult> {
  if (isProduction()) {
    throw new Error('ACME month simulation refused: production environment detected');
  }
  const start = Date.now();
  const runStamp = new Date().toISOString();

  // ── 1. Seed (or refresh) ACME demo workspace ──────────────────────────────
  let workspaceId = 'demo-workspace-00000000';
  let seedSummary = 'seed skipped (already present)';
  try {
    const seedMod: any = await import('../../seed-acme-full');
    if (seedMod?.seedAcmeFullDemo) {
      log.info('[ACME] running seedAcmeFullDemo()');
      await seedMod.seedAcmeFullDemo();
      seedSummary = 'seedAcmeFullDemo() completed';
    }
    if (seedMod?.DEMO_WORKSPACE_ID) workspaceId = seedMod.DEMO_WORKSPACE_ID;
  } catch (err: unknown) {
    log.warn(`[ACME] seed step warning: ${err?.message}`);
    seedSummary = `seed warning: ${err?.message ?? String(err)}`;
  }

  // ── 2. Provision the regulatory auditor login ─────────────────────────────
  log.info('[ACME] provisioning sandbox regulatory auditor');
  const auditor = await seedRegulatoryAuditor({ workspaceId, baseUrl: opts?.baseUrl });

  // ── 3. Generate clearly-fake artifacts (IDs / photos / contract / fin) ───
  log.info('[ACME] generating fake artifact set');
  const artifacts = await generateAcmeFakeArtifactSet({ workspaceId, runStamp });

  // ── 4. Run the four chaos tests + sandbox webhook synthesis ──────────────
  log.info('[ACME] running chaos tests + webhook synthesis');
  const { rows, webhookChecks } = await runAllChaosTests(workspaceId);

  // ── 5. Assemble + persist holistic telemetry ─────────────────────────────
  const telemetry = await assembleTelemetry(workspaceId, runStamp, rows, webhookChecks);
  const telemetryFiles = await persistTelemetry(telemetry);

  log.info('\n' + formatTelemetryAsLog(telemetry));
  log.info(`[ACME] simulation complete — verdict=${telemetry.verdict}`);

  return {
    workspaceId,
    runStamp,
    seedSummary,
    artifacts,
    auditor,
    telemetry,
    telemetryFiles,
    durationMs: Date.now() - start,
  };
}
