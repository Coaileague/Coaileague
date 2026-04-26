# ═══════════════════════════════════════════════════════════
# AGENT SYNC BLOCK — READ THIS BEFORE ANY WORK
# Updated: 2026-04-25
# ═══════════════════════════════════════════════════════════

## WHO GOES NEXT: JACK ✋
## REMOTE TIP: 2721bdac8

---

## ⚠️ PLATFORM RECOVERY — READ BEFORE ANY COMMIT

**What happened:**
Refactoring commits deleted route files that caused a runtime crash on Railway.
esbuild bundled clean but the running server had broken runtime references.

**What was done:**
Commit `da0f58f4d` → `2721bdac8` restored ALL server/routes/ files to the
pre-refactoring baseline (99d48c8c1). Platform should be back up on Railway.

**All refactoring work is preserved in git history** — nothing lost.
`git log --oneline 99d48c8c1..2721bdac8` shows every refactor commit still there.

---

## NEW PROCESS — MANDATORY

We do NOT push refactoring directly to `development` anymore.

1. Jack creates a feature branch: `git checkout -b refactor/route-cleanup`
2. Jack does all route deletion work on that branch
3. Claude verifies build + runtime on that branch
4. Railway preview deploy confirms no crash
5. THEN merge to `development`

**Current `development` branch = stable production. Do not touch route files on it.**

---

## JACK'S IMMEDIATE TASK

Confirm Railway deploy succeeded:
- Platform back up? ✅ or ❌

If ✅ stable: create the refactor branch and continue.
If ❌ still down: report error from Railway logs — we need the actual crash message.

```bash
# When ready to continue refactoring (NOT on development):
git checkout 2721bdac8
git checkout -b refactor/route-cleanup
# All work goes here, NOT on development
```

---

## CUMULATIVE STATS (all preserved in history)
~23,363L of dead routes identified and deleted across 8 domains.
Ready to re-apply safely once we confirm the right process.

