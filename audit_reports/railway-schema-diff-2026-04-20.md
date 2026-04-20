# CoAIleague — Railway DB schema audit

**Run date:** 2026-04-20
**Branch:** `claude/audit-railway-database-28lgR`
**Method:** static diff of (a) pasted `public.*` table list from Railway, (b) every `pgTable(...)` declaration under `shared/**`.
**Live DB queries not executed** (sandbox cannot reach port 52981). For row counts, brain health, seed-data scan, tenant isolation, feature-wiring, index coverage, and Statewide tenant audit (Sections 2–4 and 6–10), run `scripts/prod/audit-railway-db.mjs` from Railway.

---

## Headline

- DB has **863 tables in `public`**.
- Drizzle schema defines **720 tables** under `shared/schema/**`.
- **Schema expects but DB is missing: 2 tables** — both are intentional merges whose dead pgTable declarations were not deleted from the domain file. Safe today because `shared/schema.ts` overrides them with aliases, but a `db:push` will try to recreate them.
- **DB has but schema does not define: 145 tables** — legacy or referenced only via raw SQL; need triage.
- Every table the audit spec flagged as "must exist" (Section 1 of the spec) that does not appear in the DB is also **absent from the codebase**. Those are audit-spec naming errors, not real feature gaps.

---

## Real finding 1 — schema / DB drift (the only hard gap)

These tables are declared in the domain schema but do not exist in the DB:

| Table | Status |
|---|---|
| `compliance_audit_trail` | Declared at `shared/schema/domains/compliance/index.ts:1474` **and** aliased to `auditLogs` at `shared/schema.ts:6250`. Comment says "table dropped, Mar 2026." |
| `compliance_state_requirements` | Declared at `shared/schema/domains/compliance/index.ts:1503` **and** aliased to `complianceRequirements` at `shared/schema.ts:6772`. Comment says "table dropped, Mar 2026." |

Why it matters:
- Runtime writes currently land on the aliased real table because `shared/schema.ts` re-exports AFTER `export * from './schema/domains/compliance'` and last-write-wins at binding time.
- `npm run db:push` (Drizzle kit) reads the **domain file's** pgTable declarations directly and will attempt to `CREATE TABLE compliance_audit_trail` / `compliance_state_requirements` — then fail or silently create ghost tables parallel to the real ones.
- Fix: delete the two `pgTable(...)` blocks from `shared/schema/domains/compliance/index.ts`; the aliases in `shared/schema.ts` remain and nothing else changes.

---

## Real finding 2 — Section 1 of audit spec used wrong table names

Every table the audit spec's Section 1 lists that is missing from the DB is also missing from the schema. These are spec errors, not gaps:

| spec name (wrong) | actual name in DB / schema |
|---|---|
| `payroll_periods` | none — payroll is modelled via `payroll_runs`, `payroll_entries`, `payroll_timesheets`, `off_cycle_payroll_runs` |
| `time_punches` | `time_entries` (plus `time_entry_breaks`, `time_entry_audit_events`) |
| `timesheet_approvals` | `time_entry_approval_audit` |
| `elite_feature_usage` | `feature_usage_events` + `workspace_feature_states` |
| `compliance_checks` | `compliance_checklists`, `compliance_verification_log`, `compliance_evidence` |
| `shift_trades` | `shift_trade_requests`, `shift_swap_requests`, `orchestrated_swap_requests` |
| `availability` | split per persona: `employee_availability`, `officer_availability`, `agent_availability`, `flex_availability` |
| `visitors` | `visitor_logs`, `visitor_pre_registrations` |
| `key_control` | `key_control_logs` |
| `lost_and_found` | `lost_found_items` |
| `ai_rate_limit_windows` | `rate_throttle_logs`, `alert_rate_limits` |
| `rfp_deals` | `rfps`, `rfp_documents`, `deals`, `pipeline_deals` |
| `support_conversations` | `support_rooms`, `support_sessions`, `chat_conversations`, `support_tickets` |

No runtime impact — update the audit spec to use the real names.

---

## Real finding 3 — 145 DB tables not defined in `shared/schema/**`

These live in `public.*` but have no `pgTable(...)` declaration. Two possibilities per table: (a) legacy from a prior iteration, safe to drop; (b) still read/written via raw SQL or `drizzle-orm/sql` and therefore *active and load-bearing but untyped*.

Three clusters deserve immediate attention:

### 3A — obvious duplicates of schema-typed tables (candidates to drop)
- `ai_usage_logs` vs schema `ai_usage_events`
- `audit_events` and `audit_trail` vs schema `audit_logs` / `universal_audit_trail`
- `system_audit_logs` vs schema `audit_logs`
- `internal_email_audit` vs schema `email_events`
- `motd_acknowledgments` duplicates schema `motd_acknowledgment` (singular)
- `platform_emails` vs schema `platform_email_addresses` — but both exist in DB; check code.

Action: grep the codebase for each; if zero refs, drop.

### 3B — Trinity shadow tables (risk: two writers)
- `trinity_thoughts` (DB-only) vs `trinity_thought_signatures` (schema+DB)
- `trinity_credits`, `trinity_credit_transactions`, `trinity_credit_packages`, `trinity_credit_costs` — all DB-only; schema uses `trinity_token_ledger`, `trinity_usage_analytics`, `trinity_execution_costs`
- `trinity_reflections`, `trinity_correction_memory`, `trinity_telemetry`, `trinity_automation_queue`, `trinity_unlock_codes` — DB-only
- Spot check in code: `trinity_thoughts`, `trinity_automation_queue`, `trinity_credits` are imported by `server/routes/trinity*` and `server/services/ai-brain/*`. **They are active.** So schema is the one missing the declaration, not the DB.

Action: add pgTable declarations in `shared/schema/domains/trinity/` so these become typed, otherwise Drizzle relations and type inference silently lose them.

### 3C — plausibly legacy (low usage, candidates to drop after code grep)
- `rl_confidence_models`, `rl_experiences`, `rl_strategy_adaptations` — reinforcement-learning tables from an earlier experiment
- `visual_qa_baselines`, `visual_qa_findings`, `visual_qa_runs` — playwright visual-diff infra
- `credit_packs`, `credit_transactions`, `credit_balances` (one in schema, the others not) — split credit system?
- `gate_personnel_logs`, `gate_shift_reports`, `gate_vehicle_logs` — distinct from `visitor_logs`?

Full list: `audit_reports/railway-schema-diff-2026-04-20.orphans.txt`.

---

## Static analysis I couldn't do (requires live DB)

| spec section | why it needs the DB |
|---|---|
| §2 row counts | aggregate scans |
| §3 brain health | `COUNT(...) FILTER (...)` on recent rows |
| §3B narrative preview | reads `self_assessment` text |
| §3C dream cycle | `MAX(ts)` per table |
| §4 seed / mock data | `WHERE` on workspace names, phones, GPS zeros |
| §6 tenant isolation | cross-table joins |
| §7 feature wiring | status/channel aggregates |
| §8 ops snapshot | live counts |
| §9 index coverage | `pg_stat_user_tables`, `pg_indexes` |
| §10 Statewide tenant | reads `workspaces` row |

The committed `scripts/prod/audit-railway-db.mjs` runs all of them when pointed at the Railway DB. Run it from Railway (or any box that can reach `junction.proxy.rlwy.net:52981`) and paste the resulting `audit_reports/railway-audit-<stamp>.txt` back.

---

## Env var sanity (from the 125 pasted)

Looks complete for the code paths I can see. A couple of notes:
- **Duplicate Stripe price naming schemes.** Three parallel conventions are present: `STRIPE_PRICE_ID_*`, `STRIPE_PRICE_*`, and `STRIPE_*_MONTHLY_PRICE_ID`. The code likely reads one of them; the others are dead weight and drift over time. Grep `process.env.STRIPE_` in `server/` and delete the unused set.
- **`STRIPE_TEST_API_KEY`** alongside a live `STRIPE_SECRET_KEY` on production — confirm `NODE_ENV=production` is in fact selecting the live key, not falling back to test.
- **`ADMIN_SCRIPT_TOKEN`** flagged by Railway as "Found in Development, missing here." Verify no prod admin script requires it.
- **`PLAID_ENV`** — confirm it's `production`, not `sandbox`.
- **`EMAIL_SIMULATION_MODE`** — in production this should be `false` / unset. If it's `true`, outbound customer email is suppressed.
- **`GRANDFATHERED_TENANT_ID`**, **`STATEWIDE_WORKSPACE_ID`**, **`PLATFORM_DEFAULT_WORKSPACE_ID`** — three tenant-pointer env vars. If any point at a seed/dev workspace, Section 10 will fail.
- **`DIAG_BYPASS_SECRET`**, **`MAINTENANCE_BYPASS_SECRET`** — make sure values are long (≥ 32 bytes) and not the literal "changeme" / dev defaults.
- **Missing from the list** (worth confirming):
  - `SENTRY_DSN` / observability
  - `REDIS_URL` or similar — if the codebase uses Redis for queues/rate limits and there's no `redis` addon, it falls back to in-process state.

---

## Prioritized fix list

1. **Delete dead `pgTable` blocks** for `compliance_audit_trail` and `compliance_state_requirements` in `shared/schema/domains/compliance/index.ts`. (Prevents `db:push` from recreating dropped tables.)
2. **Declare the active Trinity shadow tables** (`trinity_thoughts`, `trinity_credits`, `trinity_automation_queue`, etc.) in `shared/schema/domains/trinity/`. (Restores type safety and relations.)
3. **Run `scripts/prod/audit-railway-db.mjs` from Railway** to get sections 2–10. That's where the real operational findings are — seed data in prod, tenant leakage, stuck locks, brain cycle status, Statewide setup.
4. **Triage the 145 DB-only tables** — confirm which are load-bearing (add to schema) and which are legacy (drop with a timestamped migration).
5. **Collapse the three Stripe price env-var schemes** into one and delete the others.
6. **Confirm `EMAIL_SIMULATION_MODE=false` and `PLAID_ENV=production`** in the Railway production env.

---

## Why the connection from this sandbox failed (in case you want it for audit trail)

```
PGPASSWORD=*** psql -h junction.proxy.rlwy.net -U postgres -p 52981 ...
→ Connection timed out
```
Sandbox egress is restricted to TCP 80/443 (`1.1.1.1:443` works; `junction.proxy.rlwy.net:52981` and `:5432` time out). The DB is reachable from any unrestricted host with the credentials.

**Rotate the password you pasted** — it's in the chat transcript.
