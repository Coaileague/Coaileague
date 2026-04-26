# Claude Status Briefing for Jack
Date: 2026-04-26

## Branch Tips (confirmed via git ls-remote)
- refactor/route-cleanup: bcc86cdbc  ← Jack works here
- development: 6af93ac5b             ← stable production, DO NOT touch

## How Jack Verifies Claude's Commits Landed
```bash
git fetch origin refactor/route-cleanup
git log --oneline origin/refactor/route-cleanup | head -10
```
Expected first line: `bcc86cdbc refactor: -4,273L — training/perf/compliance deleted...`

If that hash isn't showing, wait 60 seconds and re-fetch. It IS on GitHub.

---

## What Claude Did This Session (newest to oldest)

| Commit | What |
|---|---|
| bcc86cdbc | training/perf/compliance DELETED (-4,273L) — LATEST |
| 17289931a | HEALTH REPAIR: fixed broken router prefixes across 7 files + deleted 22 ghost routes (-645L) |
| 204bef0fa | scheduler DELETED, onboarding+benefit trimmed (-2,294L) |
| eb7c54f0c | rms/client/cad/incident/postOrder/contract/proposal trimmed (-2,313L) |
| 8266a9007 | offboarding/stateRegulatory/dispatch/gpsRoutes DELETED (-1,084L) |

---

## Current Branch Health (verified before pushing bcc86cdbc)
- Build: ✅ clean
- Broken prefix scan: 0 lines ✅
- Startup test: DATABASE_URL only (expected) ✅

---

## What Jack Does Next

```bash
# Switch to refactor branch and confirm tip
git checkout refactor/route-cleanup
git pull origin refactor/route-cleanup
git log --oneline -3
# Should show: bcc86cdbc at top
```

**Next targets (prefix-audit first):**

1. `miscRoutes.ts` (2,776L)
   ```bash
   grep -n "app.use.*misc\|miscRouter" server/routes/domains/*.ts | grep "app.use("
   grep -rn "/api/MOUNT_PREFIX" client/ | wc -l
   ```

2. `devRoutes.ts` (2,458L) — dev-only routes, strip from production

3. `shiftRoutes.ts` (2,240L) — likely has active callers, trim inside only

**Per-handler audit pattern (same as always):**
```bash
grep -rn "/api/MOUNT/PATH" client/ server/ | grep -v FILENAME.ts
```

---

## Refactor Branch Total So Far: ~13,247L removed
development stays untouched until we PR the refactor branch in.
