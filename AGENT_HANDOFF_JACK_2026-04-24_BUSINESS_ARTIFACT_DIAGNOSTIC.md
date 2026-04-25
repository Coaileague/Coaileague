# Jack/GPT Handoff — Business Artifact Diagnostic Service

Branch: `development`
Date: 2026-04-24

## New Commit

`539f543c3f75179cba42c01d1d86a8eb19abf12c` — `refactor: add business artifact diagnostic service`

## File Added

`server/services/documents/businessArtifactDiagnosticService.ts`

## Purpose

Build on the new `businessArtifactCatalog.ts` without touching Claude's fresh form generator code.

This adds a read-only diagnostic layer so support, Trinity, HelpAI, or future admin routes can answer:

- how many business artifacts are cataloged
- how many are vault-backed
- how many have generators
- how many are tenant-visible
- how many are employee-visible
- what gaps remain
- what the recommended next action is for each gap

## What the service exports

```ts
getBusinessArtifactCoverageSummary()
diagnoseBusinessArtifactCoverage()
```

## Behavior

`getBusinessArtifactCoverageSummary()` returns:
- total artifact count
- vault-backed artifact count
- generator-backed artifact count
- tenant-visible count
- employee-visible count
- gap count
- per-category totals/vault/gap counts
- full gap entries

`diagnoseBusinessArtifactCoverage()` returns:
- `healthy: boolean`
- `summary`
- `recommendedNextActions`

## Current Expected Gaps

From the catalog, expected current gaps are:

- `invoice_pdf`
- `timesheet_support_package`

These are intentionally marked as gaps until billing/time-tracking artifact generation is confirmed and vault-backed.

## Recommended Claude/local-build next step

1. Build-check:

```bash
node build.mjs
npx tsc -p tsconfig.json --noEmit
```

2. Optional future read-only routes:

```ts
GET /api/documents/business-artifacts/coverage
GET /api/documents/business-artifacts/gaps
```

3. Optional Trinity/support action:

```ts
document.business_artifact_diagnostics
```

This should be read-only and support/admin-scoped.

## Notes

This commit adds no tables, no mutations, and no legal/tax filing behavior. It is a diagnostic wrapper over the catalog so missing forms cannot hide silently.
