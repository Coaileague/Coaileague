# Claude → Jack Handoff — Phase 3 Client-Side In Progress
Date: 2026-04-26

## Branch Tips
- development:            c5714f15e  STABLE ✅ (Railway green, Phase 3 merged)
- refactor/service-layer: 8d3b32fc1  Phase 3 continuing

## How Jack Syncs
```bash
git fetch origin refactor/service-layer
git reset --hard origin/refactor/service-layer
# Should show: 8d3b32fc1 at top
```

---

## What Claude Did This Session

| Pass | What | Lines |
|---|---|---|
| Phase 2 merged | Service layer — full cleanup | ~22,931L |
| Phase 3 hooks | 24 dead hooks deleted | -3,850L |
| Phase 3 components | 112 dead top-level components | -21,643L |
| **Phase 3 total** | | **-25,493L** |

**Grand total all phases: ~72,759L removed**

---

## CRITICAL METHODOLOGY — Client Files

### Hooks: scan by FILE PATH (not export name)
```bash
base="use-hook-name"
grep -rn "hooks/${base}" client/src --include="*.ts" --include="*.tsx" \
  | grep -v "^client/src/hooks/${base}\."
# 0 results = dead
```

### Components: scan by FILE PATH  
```bash
base="component-name"
grep -rn "components/${base}" client/src --include="*.ts" --include="*.tsx" \
  | grep -v "components/${base}\."
# 0 results = dead. Also cross-check App.tsx for lazy imports by name.
```

### Pages: App.tsx uses lazy(() => import(...)) for almost all pages
```bash
# Extract all routed pages from App.tsx first:
grep -o "import(\"@/pages/[^\"]*\")" client/src/App.tsx | grep -o "pages/[^\"]*"
# Then check if page is in that list. If not in App.tsx AND 0 grep refs = dead.
```

### VITE BUILD (mandatory before merge)
```bash
npx vite build 2>&1 | grep -E "ENOENT|error during|built in"
# Must show "built in X.XXs" — no ENOENT
```

---

## Jack's Next Audit Targets

### 1. Component subdirectories (highest value)
```
client/src/components/admin/
client/src/components/ai-brain/
client/src/components/workboard/
client/src/components/scheduling/
client/src/components/payroll/
client/src/components/chat/
client/src/components/mascot/
```
For each file: grep -rn "components/SUBDIR/FILENAME" client/src | grep -v "FILENAME\."
0 results = dead.

### 2. client/src/lib/ and client/src/utils/
Utility files — check each by file path. Many may be barrel-exported.

### 3. client/src/config/
Check apiEndpoints.ts (already trimmed 34 entries). Any other config files?

---

## What to SKIP (already clean)
- client/src/hooks/ — 24 deleted, remaining 67 all alive
- client/src/pages/ — all 289 pages are live in App.tsx lazy routes
- client/src/components/ (top-level .tsx files) — 112 deleted, remaining 109 alive

---

## Pre-Merge Checklist
1. node build.mjs                     → Server build complete
2. npx vite build                     → built in X.XXs (no ENOENT)
3. Boot test with real DB + curl      → 401 + 0 errors

DB:
  DATABASE_URL=postgresql://postgres:MmUbhSxdkRGFLhBGGXGaWQeBceaqNmlj@metro.proxy.rlwy.net:40051/railway
  SESSION_SECRET=coaileague-dev-test-session-secret-32chars
