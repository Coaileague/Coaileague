# COAILEAGUE REFACTOR — MASTER HANDOFF
# ONE FILE. Updated every turn. All agents read this first.
# Branch: refactor/service-layer | Updated: 2026-04-26

## BRANCH STATE
- development:          ce59a6c22  STABLE ✅ Railway deploying now
- refactor/service-layer: 2cd724e73  active work branch

## WHAT WAS JUST FIXED
Railway build was failing: tailwindcss/postcss/autoprefixer were in devDeps.
Railway runs npm ci (no devDeps) → Vite can't find tailwindcss → build fails.
Fix: promoted all three to dependencies + added postcss.config.js.
Tested locally with real DB before pushing. ✅

---

## CRASH RULES (mandatory before every commit)

### 1 — Boot test with real DB (catches runtime crashes esbuild misses)
```bash
export DATABASE_URL="postgresql://postgres:MmUbhSxdkRGFLhBGGXGaWQeBceaqNmlj@metro.proxy.rlwy.net:40051/railway"
export SESSION_SECRET="coaileague-dev-test-session-secret-32chars"
node dist/index.js > /tmp/boot.txt 2>&1 &
sleep 18
curl -s http://localhost:5000/api/workspace/health   # must → {"message":"Unauthorized"}
grep -cE "ReferenceError|is not defined|CRITICAL.*Failed" /tmp/boot.txt | grep -v GEMINI  # must → 0
kill %1
```

### 2 — ESM require() scan
```bash
grep -rn "require(" server/ --include="*.ts" | grep -v "node_modules|.d.ts|//|build.mjs"
# must → 0 lines
```

### 3 — Router prefix scan (catches truncated variable names)
```python
import re, os
for root, dirs, files in os.walk('server/routes'):
  dirs[:] = [d for d in dirs if 'node_modules' not in d]
  for f in files:
    if not f.endswith('.ts'): continue
    c = open(os.path.join(root, f)).read()
    declared = set(re.findall(r'const (\w+Router)\s*=', c))
    declared |= set(re.findall(r'export const (\w+Router)', c))
    declared.add('router')
    used = set(re.findall(r'^([a-z]\w+Router)\.(get|post|put|patch|delete)', c, re.MULTILINE))
    diff = {v for v,_ in used} - declared
    if diff: print(f'BROKEN: {f}: {diff}')
# must → no output
```

### 4 — Client file deletion: check by FILE PATH not export name
```bash
base="component-or-hook-name"
grep -rn "components/SUBDIR/${base}\|hooks/${base}" client/src --include="*.ts" --include="*.tsx" \
  | grep -v "${base}\."
# 0 results = safe. Also cross-check App.tsx lazy imports.
```

### 5 — Server build
```bash
node build.mjs  # must → Server build complete
```

---

## REFACTOR TOTALS
- Phase 1 (routes):   ~24,335L removed  ✅ merged
- Phase 2 (services): ~22,931L removed  ✅ merged
- Phase 3 (client):   ~43,663L removed  ✅ merged
- Grand total:        ~90,929L removed

---

## NEXT DOMAIN: WHAT REMAINS

Phase 3 client cleanup is substantially complete. Remaining targets:

### A — client/src/store/ (state management)
```bash
for f in client/src/store/*.ts client/src/store/*.tsx; do
  base=$(basename "$f" | sed 's/\.tsx\?$//');
  count=$(grep -rn "store/${base}" client/src --include="*.ts" --include="*.tsx" | grep -v "${base}\." | wc -l)
  echo "${count} callers | ${base}"
done
```

### B — client/src/types/ (type definitions)
Check each file — types imported elsewhere are alive, unused types can be deleted.

### C — remaining component subdirs not yet scanned
Any subdirs added by Copilot/other work since our pass. Run:
```bash
for d in client/src/components/*/; do
  base=$(basename "$d")
  dead=$(for f in "$d"*.tsx "$d"*.ts; do
    [ -f "$f" ] || continue
    b=$(basename "$f" | sed 's/\.tsx\?$//')
    grep -rn "components/${base}/${b}" client/src --include="*.ts" --include="*.tsx" | grep -v "${b}\." > /dev/null || echo "$b"
  done)
  [ -n "$dead" ] && echo "=== ${base} === $dead"
done
```

---

## PROCESS RULES
1. All work on refactor/service-layer branch
2. Test with real DB before EVERY push
3. Only ONE handoff file: AGENT_HANDOFF.md (this file)
4. Jack audits → Claude executes → boot test → commit → push → merge development
5. Do NOT merge development into service-layer (histories have diverged)

---

## FOR JACK
Next audit targets: client/src/store/, client/src/types/
Same file-path methodology. No guessing from component names.
