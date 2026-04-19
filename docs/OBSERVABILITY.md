# Observability Baseline — Readiness Section 5

This document is the starting point for operating CoAIleague in production.
It defines SLO targets, severity levels, and the on-call skeleton. Teams
should treat numbers here as targets to measure against, not promises to
users — promises belong in the DPA/MSA with each tenant.

Companion code:
- `server/lib/errorTracker.ts` — pluggable external error sink
- `server/monitoring.ts` — in-process buffer + forwarder
- `server/middleware/errorHandler.ts` — global handler that feeds both

---

## 1. Service Level Objectives

### 1.1 Core API

| SLI | Target | Window | Error budget |
|-----|-------:|:------:|-------------:|
| Availability (non-5xx on `/api/*`) | 99.5% | 30 days | 3h 36m |
| p95 latency (non-mutation `/api/*`) | < 500 ms | 30 days | — |
| p99 latency (non-mutation `/api/*`) | < 1500 ms | 30 days | — |

Mutations (POST/PUT/PATCH/DELETE) have a looser p95 of < 1500 ms because
they often hand off to Trinity or third-party providers.

### 1.2 Trinity Actions

| SLI | Target | Window |
|-----|-------:|:------:|
| Action success rate (non-error) | 98% | 30 days |
| Action p95 latency (CLASS 1) | < 3 s | 7 days |
| Action p95 latency (CLASS 2) | < 10 s | 7 days |
| Action p95 latency (CLASS 3) | < 30 s | 7 days |
| Audit-log write success (per action) | 99.9% | 30 days |

### 1.3 Voice & SMS

| SLI | Target | Window |
|-----|-------:|:------:|
| Inbound voice call answer rate | 99.5% | 30 days |
| SMS delivery rate (non-carrier-filtered) | 97% | 30 days |
| Twilio signature-validation success | 99.9% | 30 days |

### 1.4 Mobile Field App

| SLI | Target | Window |
|-----|-------:|:------:|
| Clock-in success rate (geofenced) | 99% | 30 days |
| Offline-queued event delivery | 99.9% | 30 days |
| Push-notification delivery | 98% | 7 days |

Mobile targets are aspirational until Section 4's reality-check bugs are
closed.

---

## 2. Severity Levels

| Sev | Definition | Response | Paging |
|----:|-----------|----------|--------|
| 1 | Production down OR data loss OR tenant isolation breach | Immediate, all-hands | Page 24/7 |
| 2 | Major feature broken for >1 tenant OR security anomaly | Within 1 hour | Page business hours |
| 3 | Single-tenant degradation OR high error volume | Within 4 hours | Ticket |
| 4 | Cosmetic, low-impact bug | Next sprint | Ticket |

**Sev-1 triggers (non-exhaustive):**
- `/api/health` fails for > 5 minutes
- > 1% of mutations error for > 15 minutes
- Any cross-tenant read/write confirmed
- Trinity action autonomy disabled by kill-switch
- Voice IVR down > 5 minutes
- Payroll run halted mid-execution

---

## 3. Error Tracker Configuration

The pluggable adapter in `server/lib/errorTracker.ts` selects a backend
from env vars at boot:

```
ERROR_TRACKING_WEBHOOK_URL=<https endpoint that accepts JSON>
ERROR_TRACKING_AUTH_HEADER=<optional authorization header value>
```

When unset, the adapter is a no-op — errors still buffer to
`audit_logs` / `error_logs` via `monitoringService`. In production this
should always be set. Recommended providers: Sentry (via their webhook
relay), Datadog, BetterStack, or a simple S3 receiver.

**Swap-in for real Sentry SDK** (future):
1. `npm i @sentry/node`
2. Replace the `HttpWebhookAdapter` class with a `SentryAdapter` that
   calls `Sentry.captureException`. All callers use `captureError()` so
   there is one file to touch.

---

## 4. On-Call Runbook Skeleton

### 4.1 Who is on call?

Populate a rotation in your paging provider. Minimum: one engineer
per week, 24/7 for Sev-1, business hours for Sev-2+.

### 4.2 What do you look at first?

1. **`/api/health`** — is it returning 200?
2. **Error tracker dashboard** — recent spikes?
3. **Database** — connection count, slow queries, replication lag
4. **Trinity kill-switch** — is it on? (see `trinityRuntimeFlags`)
5. **Twilio + Resend status pages** — third-party outage?

### 4.3 Kill switches

| Capability | How to disable |
|-----------|----------------|
| Trinity autonomous mutations | `UPDATE trinity_runtime_flags SET value=false WHERE key='autonomous_mutations_enabled'` |
| Outbound SMS | Revoke Twilio API key (Section F lazy factory re-fetches next call) |
| New tenant signups | Feature flag `allow_new_tenant_signup=false` |

### 4.4 Cross-tenant breach response

1. Kill the offending workflow immediately (deploy hotfix or disable flag)
2. Snapshot the `audit_logs` rows for forensics
3. Contact the affected tenants (both directions) within 24h
4. Write a post-incident review (Section 5.2)
5. Add a regression test to the tenant-isolation fuzz suite

### 4.5 Post-incident review template

For every Sev-1 and Sev-2:

```
Incident ID:
Date/Time detected:
Date/Time resolved:
Severity:
Affected tenants / users:
Timeline (UTC):
  - hh:mm — trigger event
  - hh:mm — detection
  - hh:mm — mitigation
  - hh:mm — resolution
Root cause:
Contributing factors:
What went well:
What didn't:
Action items (owner + due date):
CLAUDE.md law changes (if any):
```

---

## 5. What This Doc Does NOT Provide

- A real paging rotation (use PagerDuty / Opsgenie / BetterStack)
- APM / tracing (Datadog / Honeycomb / OpenTelemetry SDK)
- RUM (Real User Monitoring) — the frontend has no perf telemetry yet
- Synthetic uptime checks — needs external probe (Pingdom, BetterStack)
- Load-test harness — Section 7 will scaffold this

These are next steps; this doc is the minimum viable observability baseline
to make Sev-1 triage possible on launch day.
