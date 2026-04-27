# COAILEAGUE REFACTOR — MASTER HANDOFF
# ONE FILE ONLY. Update in place. Never create new handoff files.
# Last updated: 2026-04-27 by Jack/GPT — STORE/TYPES CONNECTOR AUDIT

---

## ACTIVE BRANCH
```
refactor/service-layer  →  tip before Jack audit: 40c35c263
```
Both agents work here. Never push directly to development without a passing boot test.

## DEVELOPMENT (Railway)
```
origin/development  →  4ab16ec08  (STABLE ✅ GREEN — deployed successfully)
```
Do NOT merge origin/development into refactor/service-layer — histories diverged.
Only merge refactor/service-layer → development (one direction, after passing all checks below).

---

## ⚠️ CRITICAL LESSON — READ BEFORE ANY DELETION ⚠️

**10 Railway build failures occurred after Phase 3 client cleanup.**
Every single one was caused by an incomplete deletion. Here is the exact failure taxonomy
so it never happens again.

---

## THE 6 FAILURE PATTERNS (all discovered the hard way)

### PATTERN 1 — Broken static import
File still has `from './DeletedComponent'` after the component file was removed.
```
notifications-popover.tsx → import { AnimatedNotificationBell } from "./animated-notification-bell"
```
**Why missed:** Scanner only checked if deleted file had callers. Didn't check if callers were also components (not pages).

### PATTERN 2 — Broken dynamic import
`lazy(() => import('./DeletedComponent'))` — Rollup resolves these at build time same as static imports. grep for `from` misses them entirely.
```
SeasonalEffectsLayer.tsx → const SnowfallEngine = lazy(() => import('./SnowfallEngine'))
```
**Why missed:** Scanner used `from './X'` pattern only. Dynamic `import('./X')` is a different syntax.

### PATTERN 3 — Barrel export pointing at deleted file
`index.ts` still had `export { X } from './DeletedFile'` after the file was removed.
```
canvas-hub/index.ts → export { MobileResponsiveSheet } from './MobileResponsiveSheet'  // file deleted
schedule/index.ts   → export { DayTabs } from './DayTabs'  // file deleted
ui/index.ts         → export { hover-card } from './hover-card'  // file deleted
```
**Why missed:** Barrel files weren't scanned as import sources — only as targets.

### PATTERN 4 — Named import from barrel where export was removed
Consumer file imports `{ X }` from a barrel. The barrel's index.ts was cleaned (export removed)
but the consuming file still has the import. Rollup traces the full chain and fails.
```
trinity-chat-modal.tsx  → import { TrinityAgentPanel } from '@/components/trinity'
notifications-popover   → import { MobileResponsiveSheet } from '@/components/canvas-hub'
universal-header.tsx    → import { MobileResponsiveSheet, NavigationSheetSection } from '@/components/canvas-hub'
chatdock/ChatDock.tsx   → import { MobileResponsiveSheet } from '@/components/canvas-hub'
helpai-orchestration    → import { HelpAIIntegrationPanel } from '@/components/helpai'
payroll-dashboard       → import { OrgPlaidBankCard } from '@/components/plaid'
calendar-heatmap        → import { ScrollAreaViewport } from '@/components/ui/scroll-area'
```
**Why missed:** Previous scanner only checked relative imports (`./X`), not `@/` aliased barrel imports. Rollup fully resolves both.

### PATTERN 5 — Orphaned JSX body (import removed, JSX tag left behind)
Import line deleted but `<Component prop={x} />` still in the render body.
```
notifications-popover  → <AnimatedNotificationBell notificationCount={...} onClick={...} />
universal-header.tsx   → <MobileResponsiveSheet subtitle="..." side="right" className="...">
ProgressiveHeader.tsx  → <NavigationOverlay isOpen={...} animationState={...} />
BroadcastCard.tsx      → open={showFeedbackForm} onOpenChange={...} broadcastId={...} />
```
**Why missed:** Scanner checked import lines only. JSX usage in render bodies is a separate grep.

### PATTERN 6 — Orphaned JSX props block (opening tag removed, props+close left)
Opening `<Component` tag removed but the props and closing `/>` remain as free-floating text.
Creates invalid syntax because JSX attributes outside a component are not valid.
```
universal-header.tsx line 379:  </Button>}
                                  subtitle="Navigate the platform"   ← orphaned props
                                  side="right"
                                  className="px-3 py-3 pb-6"
                                >
ProgressiveHeader.tsx:  const { isOpen, ... onOpen: () => { ... }, onClose: () => { ... } });
                        ← entire hook destructure with no RHS (hook call removed, destructure left)
ChatDock.tsx line 199:  return (
                        );   ← entire JSX return body was deleted, empty return remained
```
**Why missed:** These require reading the surrounding context, not just line-by-line pattern matching.

---

## MANDATORY PRE-COMMIT CHECKLIST (client file deletions)

**Step 1 — Run the verification script. No exceptions.**
```bash
python3 scripts/verify-client-deletions.py
# Must print: ✅ ZERO issues — platform clean, build will pass
```

**Step 2 — After deleting any component file, manually check:**
```bash
COMPONENT="DeletedComponentName"

# a) Static callers
grep -rn "from.*${COMPONENT}\|import.*${COMPONENT}" client/src --include="*.tsx" --include="*.ts"

# b) Dynamic callers
grep -rn "import(.*${COMPONENT})" client/src --include="*.tsx" --include="*.ts"

# c) JSX usage (even if import line is gone)
grep -rn "<${COMPONENT}[\s/>]" client/src --include="*.tsx"

# d) Barrel file in same directory
grep -n "${COMPONENT}" client/src/components/SUBDIR/index.ts

# e) Named imports from barrel in consuming files
grep -rn "from '@/components/SUBDIR'" client/src --include="*.tsx" --include="*.ts"
# Then verify every named import in those files still exists in the barrel
```

**Step 3 — esbuild check on every file you touched:**
```bash
node_modules/.bin/esbuild PATH/TO/MODIFIED_FILE.tsx --bundle=false 2>&1 | grep "✘"
# Must return nothing
```

**Step 4 — Boot test before pushing to development:**
```bash
export DATABASE_URL="postgresql://postgres:MmUbhSxdkRGFLhBGGXGaWQeBceaqNmlj@metro.proxy.rlwy.net:40051/railway"
export SESSION_SECRET="coaileague-dev-test-session-secret-32chars"
node build.mjs
node dist/index.js > /tmp/boot.txt 2>&1 &
sleep 18
curl -s http://localhost:5000/api/workspace/health   # must → {"message":"Unauthorized"}
grep -cE "ReferenceError|is not defined|CRITICAL.*Failed" /tmp/boot.txt  # must → 0
kill %1
```

---

## SCANNER UPGRADE — verify-client-deletions.py

Script: `scripts/verify-client-deletions.py`
Catches: all 6 patterns above including named barrel imports and esbuild syntax.
Run: before EVERY client commit that involves deletions.

**Known false positives** (safe to ignore, confirmed commented-out code):
- `getPricingTier`, `getTierFeatures`, `isFeatureInTier` in `useConfig.ts` — commented import
- `CHART_PALETTE` in `designSystem.ts` — appears in JSDoc comment only

---

## BRANCH RULES (permanent)

- Jack audits on `refactor/service-layer`, Claude executes and merges to `development`
- Never push directly to `development` without passing all 4 checklist steps
- Never merge `origin/development` INTO `refactor/service-layer` — it will restore deleted files
- Only direction: `refactor/service-layer` → `development`
- Claude runs the verification script before every merge. Jack runs it before every audit commit.

---

## CURRENT STATUS

**Phase 1 (routes):** ✅ Complete — ~24,335L removed
**Phase 2 (services):** ✅ Complete — ~22,931L removed
**Phase 3 (client):** ✅ Complete — ~43,663L removed
**Total removed:** ~90,929L

**Platform:** GREEN ✅ on `4ab16ec08`

---

## NEXT TARGETS

Current Jack audit pass: `client/src/store/` and `client/src/types/`

Same methodology — but now with the upgraded scanner and all 6 patterns in mind.
Jack cannot safely delete through connector-only evidence. Claude must verify locally with `python3 scripts/verify-client-deletions.py` before any deletion.

---

## JACK FINDINGS — client/src/store and client/src/types connector audit

### Scope

```text
client/src/store/
client/src/types/
```

### Branch checked first

```text
refactor/service-layer
```

Latest tip observed before audit:

```text
40c35c2634eb3c4566f9c6842e6b4a460fa37837
```

### Connector searches performed

```text
"client/src/store/" OR "store/" "client/src"        → 0 results
"zustand" OR "createStore" OR "useStore"            → 0 results
"client/src/types/" OR "types/" "client/src"        → 0 results
"@/types/" OR "../types/" OR "./types/"             → 0 results
"client/src/data" / "client/src/config" broad check  → 0 useful results
```

### Connector-only verdict

```text
No live caller evidence surfaced for client/src/store/ or client/src/types/.
They may already be absent, empty, or unused.
```

### Important limitation

```text
This is not deletion authority. GitHub connector search cannot prove local directory contents or run the verification scanner.
```

### Claude local verification commands

```bash
# 1) Confirm whether directories exist and inventory files
for dir in client/src/store client/src/types; do
  echo "===== $dir ====="
  find "$dir" -maxdepth 1 -type f \( -name "*.ts" -o -name "*.tsx" \) -print 2>/dev/null | sort
  echo
done

# 2) For any files found, scan by FILE PATH, not export name
for dir in client/src/store client/src/types; do
  find "$dir" -maxdepth 1 -type f \( -name "*.ts" -o -name "*.tsx" \) -print 2>/dev/null | sort | while read -r file; do
    rel="${file#client/src/}"
    noext="${rel%.*}"
    echo "--- $file"
    grep -rn "$noext" client/src --include="*.ts" --include="*.tsx" | grep -v "^${file}:" || true
  done
done

# 3) Mandatory scanner before deletion commit
python3 scripts/verify-client-deletions.py
```

### Execution recommendation

```text
If find returns no files: mark store/types clean, no-op.
If files exist and path scan has 0 non-self callers: git rm those files, run scanner, run Vite/build.
If files exist with callers: keep them.
```

Validation after any deletion:

```bash
python3 scripts/verify-client-deletions.py
npx vite build 2>&1 | grep -E "ENOENT|error during|built in"
node build.mjs
```

### Claude goes next

```text
Execute local store/types inventory.
Delete only confirmed 0-caller files, if any.
Run verify-client-deletions.py and build checks.
Update AGENT_HANDOFF.md with results and next target.
```

---

## PROCESS RULES

- Read this file at the start of every turn
- Update it at the end of every turn
- Never create separate handoff files
- One file, updated in place
