# ACME Sandbox Simulation

Operational hardening harness that drives the canonical "ACME month"
end-to-end against sandbox keys, then hands you a regulatory auditor
login so you can sign in and confirm the world looks right.

The simulation **persists** every record (workspace, employees, clients,
shifts, invoices, payroll runs, fake artifacts, webhook payloads,
telemetry) so a fresh login surfaces the same view the harness built.

## What it does

1. Re-runs `seedAcmeFullDemo()` — 10 officers, 5 clients, 90 days of
   shifts, 3 bi-weekly payroll runs, plus the policies and document set
   the existing ACME seed produces.
2. Generates clearly-marked **fake artifacts** under
   `artifacts/acme-sandbox/` — IDs, post-photos, master service contract,
   monthly financial snapshot. Every artifact is plastered with a
   `⚠ FAKE — SIMULATION ONLY ⚠` watermark.
3. Provisions a **regulatory auditor account** (default
   `inspector.demo@tdlr.texas.gov`) with the NDA pre-accepted and a
   30-day audit window already open against the demo workspace.
4. Synthesises **Stripe + Plaid sandbox webhook payloads** and routes
   them through the existing in-process handlers, recording the full
   payload, before/after invoice state, and any state-drift.
5. Runs the four **chaos tests** the spec asks for (Arrears Math,
   Compliance Kill-Switch, Stripe Webhook Race, Trinity Semantic Triage)
   and emits the **Holistic Telemetry Log** with the canonical
   `[FINANCE] [PAYROLL] [COMPLIANCE] [TAX] [NETWORK]` headers.

Outbound email + SMS go through the platform's existing simulation
modes — `EMAIL_SIMULATION_MODE=true` is forced inside the runner.

## How to run

### CLI (local)

```bash
npx tsx scripts/runAcmeSandboxMonth.ts
```

The script writes telemetry to `artifacts/acme-sandbox/telemetry/` and
prints the full report (including the auditor credentials) to stdout.
Exit code 2 means a chaos test surfaced a gap; 0 means the verdict is
`PRODUCTION_READY`.

### HTTP (with the dev server up)

```bash
# Run the full simulation
curl -X POST http://localhost:5000/api/sandbox/acme/run

# Read the telemetry the run produced
curl http://localhost:5000/api/sandbox/acme/telemetry

# List the fake artifacts
curl http://localhost:5000/api/sandbox/acme/artifacts

# View one fake artifact (renders the SVG / Markdown / JSON inline)
curl http://localhost:5000/api/sandbox/acme/artifacts/<id>

# Replay the sandbox webhook payload journal
curl http://localhost:5000/api/sandbox/acme/webhook-log
```

All write endpoints refuse to run in production — they short-circuit
with `403` once `isProduction()` returns true.

## Logging in as the regulatory auditor

After the run prints `REGULATORY AUDITOR LOGIN`, hit
`/api/auditor/login` with the email + password it surfaced (default
shown below). The auditor lands in the existing `/api/auditor/me/*`
read-only flow with the NDA already accepted and an active audit row
on the demo workspace.

```
email     : inspector.demo@tdlr.texas.gov
password  : AcmeSandbox!Auditor#2026
loginUrl  : http://localhost:5000/auditor-portal
```

Override the credentials via `SANDBOX_AUDITOR_EMAIL` /
`SANDBOX_AUDITOR_PASSWORD`.

## Architecture

```
scripts/runAcmeSandboxMonth.ts          ← CLI entrypoint
  └─ server/services/sandbox/
       ├─ acmeMonthOrchestrator.ts      ← top-level runner
       ├─ acmeChaosRunner.ts            ← 4 chaos tests + telemetry
       ├─ fakeArtifactGenerator.ts      ← clearly-fake doc generator
       ├─ regulatoryAuditorSeeder.ts    ← provisions auditor login
       └─ sandboxWebhookSynthesizer.ts  ← Stripe/Plaid sandbox webhooks
server/routes/acmeSandboxRoutes.ts      ← /api/sandbox/acme/*
```

Persistence is split across:

- existing demo tables (`employees`, `clients`, `shifts`, `invoices`,
  `payroll_runs`, `payroll_entries`)
- `auditor_accounts` / `auditor_audits` / `auditor_nda_acceptances`
- new `sandbox_fake_artifacts` and `sandbox_webhook_log` tables
  (created on first run via `CREATE TABLE IF NOT EXISTS`).

## Verdict semantics

- `PRODUCTION_READY`  — every chaos row passed, no webhook drift.
- `GAPS_FOUND`        — at least one chaos row reported `gapFound = true`
                        or a webhook handler did not flip Synapse state.
- `INSUFFICIENT_DATA` — seed missing the rows the chaos tests need
                        (typically because the run was aborted before
                        the seed completed).
