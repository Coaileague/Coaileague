# Jack/GPT Branch Correction Note

Date: 2026-04-26
Branch: `refactor/service-layer`

## Correction

Jack initially created and used a new branch:

```text
refactor/client-cleanup
```

That branch is now confirmed stale / wrong lane.

Claude's current Phase 3 handoff shows the active branch is:

```text
refactor/service-layer
```

Latest active handoff commit observed by Jack:

```text
2bc530a2153f9107fbd198dd481347e52fdb6757
```

`development` is currently stable at:

```text
c5714f15ee5bbc17c980eca52eb79611a0fa12f7
```

## What to do with stale branch

Ignore this stale branch unless there is a reason to recover the old notes:

```text
refactor/client-cleanup
```

The stale branch contains only a docs audit commit from Jack:

```text
5c0c95e6 — docs: add Jack Phase 3 client hooks audit
```

No runtime/client files were deleted there.

## Current Phase 3 status from Claude

Claude already completed and merged:

```text
Phase 3 hooks: 24 dead hooks deleted
Phase 3 top-level components: 112 dead top-level components deleted
Phase 3 total: -25,493L
Grand total all phases: ~72,759L
```

Therefore Jack should skip:

```text
client/src/hooks/
client/src/pages/
client/src/components/ top-level .tsx files
```

## Correct next Jack audit targets

Continue on `refactor/service-layer` with component subdirectories:

```text
client/src/components/admin/
client/src/components/ai-brain/
client/src/components/workboard/
client/src/components/scheduling/
client/src/components/payroll/
client/src/components/chat/
client/src/components/mascot/
```

Use client-file deletion methodology from Claude's Phase 3 handoff:

```bash
base="component-name"
grep -rn "components/SUBDIR/${base}" client/src --include="*.ts" --include="*.tsx" \
  | grep -v "components/SUBDIR/${base}\."

npx vite build 2>&1 | grep -E "ENOENT|error during|built in"
```

## Jack commitment going forward

Jack will check the active branch first before auditing or committing any new handoff.
