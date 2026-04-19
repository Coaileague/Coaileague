# Testing Strategy — Readiness Section 7

Complements `STATEWIDE_READINESS_AUDIT.md` category N3 (Testing, score 19%).
This doc defines what testing should exist before Statewide goes live, what
exists today, and how to close the gap.

---

## 1. What Exists Today

- **Stress tests** under `server/tests/*.ts` — hand-rolled scripts
  (`orchestrationStressTest.ts`, `fullSystemStressTest.ts`,
  `goLiveReadinessStressTest.ts`, etc.). They run via `tsx` and exercise
  end-to-end paths at high volume.
- **TypeScript Law** — `npx tsc --noEmit` is the floor. `CLAUDE.md` makes
  any change that introduces TS errors a 🔴 Critical issue.
- **Build Integrity Law** — `npm run build` must pass before any commit.

What is **missing:**

- No unit test framework (`vitest` / `jest`) is configured in `package.json`.
- No `npm test` script.
- No E2E framework (`playwright` / `cypress`).
- No CI gate that runs stress tests on PRs.
- No tenant-isolation fuzzer (Section G is a law with no enforcement test).
- No migration rollback drill.

---

## 2. Testing Pyramid Targets (pre-Statewide)

```
          E2E smoke (Playwright, ~5 critical flows)
        ─────────────────────────────────────────
       Integration tests  (supertest + real Postgres in container)
     ─────────────────────────────────────────────
    Unit tests (vitest; pure functions: RBAC, scoring, calc, parsers)
   ──────────────────────────────────────────────────────
  Static checks: tsc --noEmit, npm audit, lint
```

Ladder of "enough":

| Level | Before Statewide | Why |
|-------|:----------------:|-----|
| tsc   | ✅ required      | TypeScript Law |
| unit tests on RBAC + scoring + rate calc | ✅ required | These are the places a bug becomes a billing error |
| integration tests on tenant isolation | ✅ required | CLAUDE.md §G has no enforcement fuzzer |
| E2E smoke on clock-in + incident + invoice-send | ✅ required | Day-one Statewide flows |
| Unit coverage target | not required | Coverage is a vanity metric pre-PMF |

---

## 3. Tenant Isolation Smoke Harness — Proposed Shape

CLAUDE.md §G says every query must filter by `workspace_id`. Today the
only enforcement is code review. A real fuzzer would:

1. Seed two workspaces (A and B) with a known row each (`employee`,
   `shift`, `invoice`, …).
2. Authenticate as a user in workspace A.
3. For every mutating route in `server/routes/*`, attempt to reach
   workspace B's row ID in the request (param, body, or query).
4. Assert a 404 or 403 on every attempt.

Sketch:

```ts
// server/tests/tenantIsolationFuzz.ts  (not yet committed)
for (const route of MUTATING_ROUTES) {
  const body = { ...defaultBodyFor(route), id: B_ROW_ID };
  const res = await supertest(app)
    .post(route.path)
    .set('cookie', AS_WORKSPACE_A)
    .send(body);
  assert([403, 404].includes(res.status),
    `${route.path} leaked: returned ${res.status}`);
}
```

Effort: M (1–2 days including the route inventory script).

---

## 4. Migration Rollback Drill

Today: `ensureRequiredTables()` is idempotent on the way in. There is no
rehearsed rollback path. Drill once:

1. Snapshot staging Postgres.
2. Run the next pending migration.
3. Roll back via the snapshot.
4. Verify `ensureRequiredTables()` is still idempotent on re-apply.
5. Document the exact sequence.

This is 2–4 hours for a first drill. Repeat quarterly.

---

## 5. Concrete Minimum Scripts to Add (follow-up branches)

### Branch 1 — unit test framework
```
npm i -D vitest @types/node
```
Add to `package.json`:
```json
"scripts": {
  "test": "vitest",
  "test:watch": "vitest --watch"
}
```
Seed with 10 unit tests:
- 3 on `server/lib/rbac/roleDefinitions.ts` (role ladder, guard arrays)
- 3 on scoring (`officerScore`, `talentOsScore`)
- 2 on rate calculation (`overtime`, `holiday`)
- 2 on tenant-scoping helpers (`isAllowedCrossWorkspace`)

### Branch 2 — integration tests
```
npm i -D supertest @types/supertest testcontainers
```
Spin up a real Postgres container per test run. Reuse the
`ensureRequiredTables()` + `criticalConstraintsBootstrap` path so tests see
the same schema as prod.

### Branch 3 — tenant isolation fuzzer
The sketch in §3 above, implemented as `server/tests/tenantIsolationFuzz.ts`.
Run in CI on every PR.

### Branch 4 — Playwright E2E smoke
Five flows:
1. Worker clocks in → shift is active
2. Worker submits incident → manager receives notification
3. Manager creates invoice → client receives email
4. Trinity schedule action → audit_logs entry exists
5. Auditor NDA acceptance + compliance score request

---

## 6. What This Doc Intentionally Does NOT Prescribe

- Code coverage % targets (vanity pre-PMF)
- Mutation testing
- Contract testing between client/server
- Performance regression suite (post-GA)

These become relevant after the pyramid has a first layer. Don't build
them before unit tests exist.

---

## 7. Statewide Launch Pre-Flight Test Checklist

Before any Statewide-visible deploy:

- [ ] `npx tsc --noEmit` exit 0
- [ ] `npm run build` green
- [ ] `npm audit --audit-level=high` clean
- [ ] Tenant isolation fuzz suite green (after it exists)
- [ ] E2E smoke green (after it exists)
- [ ] Manual walk-through of the 5 E2E flows in §5 Branch 4
- [ ] Backup restore drill in staging succeeded in last 30 days
- [ ] Error tracker adapter configured (verified via `/api/_diag/errorTest`)

Where an item says "after it exists," that's follow-up branch work.
Pre-Statewide-launch scope is: items 1, 2, 3, 6, 7, 8.
