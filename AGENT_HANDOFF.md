# COAILEAGUE REFACTOR — MASTER HANDOFF
# ONE FILE ONLY. Update in place. Never create new handoff files.
# Last updated: 2026-04-26 by Claude

---

## ACTIVE BRANCH
```
refactor/service-layer  →  tip: 8751d8e7e
```
Both agents work here. Never push directly to development without a passing boot test.

## DEVELOPMENT (Railway)
```
origin/development  →  ce59a6c22  (STABLE ✅)
```
NOTE: origin/development has diverged from our branch with independent Copilot fixes.
Do NOT merge origin/development into refactor/service-layer — it will restore deleted files.
Only merge refactor/service-layer → development (one direction).

---

## HOW TURNS WORK

**Jack's turn:** Audit a domain. Write findings into this file under JACK'S FINDINGS below.
Commit: `git add AGENT_HANDOFF.md && git commit -m "audit: <domain>"` → push to refactor/service-layer.

**Claude's turn:** Read JACK'S FINDINGS. Execute deletions locally. Run boot test. Commit. Push. Merge to development. Update this file. Jack goes next.

No separate handoff files. One file, updated in place every turn.

---

## BOOT TEST (mandatory before every push)
```bash
export DATABASE_URL="postgresql://postgres:MmUbhSxdkRGFLhBGGXGaWQeBceaqNmlj@metro.proxy.rlwy.net:40051/railway"
export SESSION_SECRET="coaileague-dev-test-session-secret-32chars"
node build.mjs
node dist/index.js > /tmp/boot.txt 2>&1 & sleep 18
curl -s http://localhost:5000/api/workspace/health   # must → {"message":"Unauthorized"}
grep -cE "ReferenceError|is not defined|CRITICAL.*Failed" /tmp/boot.txt | grep -v GEMINI  # must → 0
kill %1
```

## CLIENT FILE DELETION (Crash Rule 4)
Always scan by FILE PATH, not component/hook name:
```bash
# Hooks:
grep -rn "hooks/FILENAME" client/src --include="*.ts" --include="*.tsx" | grep -v "FILENAME\."

# Components:
grep -rn "components/SUBDIR/FILENAME" client/src --include="*.ts" --include="*.tsx" | grep -v "FILENAME\."

# 0 results = dead. Also check App.tsx for lazy(() => import(...)) patterns.
```

---

## REFACTOR TOTALS
| Phase | Domain | Lines Removed | Status |
|---|---|---|---|
| 1 | Route layer | ~24,335L | ✅ merged |
| 2 | Service layer | ~22,931L | ✅ merged |
| 3 | Client (hooks/components/lib) | ~43,663L | ✅ merged |
| **Total** | | **~90,929L** | |

---

## WHAT'S DONE IN PHASE 3
- ✅ Hooks: 24 dead files deleted
- ✅ Top-level components: 112 dead files deleted
- ✅ Component subdirectories: 85 dead files deleted
- ✅ Barrel stubs: 2 dead index files deleted
- ✅ lib/: 8 dead files deleted
- ✅ Railway build fix: tailwindcss/postcss/autoprefixer promoted to dependencies

---

## NEXT TARGETS (Jack audits, Claude executes)

### Priority 1 — client/src/store/
```bash
for f in client/src/store/*.ts client/src/store/*.tsx; do
  [ -f "$f" ] || continue
  base=$(basename "$f" | sed 's/\.tsx\?$//')
  count=$(grep -rn "store/${base}" client/src --include="*.ts" --include="*.tsx" | grep -v "${base}\." | wc -l)
  echo "${count} callers | ${base}"
done
```

### Priority 2 — client/src/types/
```bash
for f in client/src/types/*.ts client/src/types/*.tsx; do
  [ -f "$f" ] || continue
  base=$(basename "$f" | sed 's/\.tsx\?$//')
  count=$(grep -rn "types/${base}" client/src --include="*.ts" --include="*.tsx" | grep -v "${base}\." | wc -l)
  echo "${count} callers | ${base}"
done
```

### Priority 3 — Any component subdirs added by Copilot since our pass
Scan every subdir, 0-caller files by path:
```bash
for d in client/src/components/*/; do
  base=$(basename "$d")
  for f in "$d"*.tsx "$d"*.ts; do
    [ -f "$f" ] || continue
    b=$(basename "$f" | sed 's/\.tsx\?$//')
    c=$(grep -rn "components/${base}/${b}" client/src --include="*.ts" --include="*.tsx" | grep -v "${b}\." | wc -l)
    [ "$c" -eq 0 ] && echo "DEAD $f"
  done
done
```

---

## JACK'S FINDINGS
*(Jack writes audit results here — file paths, line counts, dead/alive verdict)*
*(Claude reads this section and executes)*

**Status: Waiting for Jack's audit of client/src/store/ and client/src/types/**

