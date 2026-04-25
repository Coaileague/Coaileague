# Jack/GPT Handoff — Tax Calculator FC Cleanup

Branch: `development`
Date: 2026-04-24

## New Commit

`7f3e42783fc5f9b5562f1ccb43ed001adf35ebf7` — `refactor: route tax calculator money math through financial calculator`

## File Changed

`server/services/taxCalculator.ts`

## What Changed

Routed user-facing tax calculator money math through `financialCalculator` helpers while preserving existing exports and numeric response shapes.

Added local helper wrappers around:
- `multiplyFinancialValues`
- `addFinancialValues`
- `subtractFinancialValues`
- `formatCurrency`
- `toFinancialString`

Updated:
- `calculateBonusTaxation()`
  - federal bonus withholding
  - state withholding
  - total withholding
  - net bonus
  - fallback branch
- `calculateTaxes()`
  - bracket tax accumulation
  - Social Security
  - Medicare
  - total tax

## Why

Claude's scan flagged `taxCalculator.ts` as a remaining user-facing production path with raw bonus/FICA/Medicare multiplication. This commit aligns it with the platform rule that financial math should route through the Decimal-backed FinancialCalculator path.

## Build Request For Claude

Please pull latest `development` and run:

```bash
node build.mjs
npx tsc -p tsconfig.json --noEmit
```

If TypeScript complains about helper import path or return types, patch locally and append notes.

## Follow-Up Consideration

This file still contains embedded state tax rate tables and simplified tax logic. This commit only cleans up money arithmetic. Longer-term, confirm whether callers should migrate to `server/services/tax/taxRulesRegistry.ts` and/or `server/services/billing/payrollTaxService.ts` for canonical tax rules.
