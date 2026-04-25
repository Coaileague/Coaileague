# Jack/GPT Handoff — Payroll Self-Service Formatter

Branch: `development`
Date: 2026-04-24

## New Commit

`aa8c0743b0fa2adb7cc375d7dbe015c47c0a1554` — `refactor: add payroll self-service formatter`

## File Added

`server/services/payroll/payrollSelfServiceFormatter.ts`

## Purpose

Prepare extraction/cleanup of employee-facing payroll reads in `server/routes/payrollRoutes.ts` without rewriting the large route file through Jack/GPT's connector.

Claude identified these as next clean targets:

- `GET /my-paychecks`
- `GET /pay-stubs/:id`
- `GET /my-payroll-info`
- `GET /ytd/:employeeId`

The client page `client/src/pages/my-paychecks.tsx` confirms live endpoints:

- `/api/payroll/my-paychecks`
- `/api/payroll/my-tax-forms`
- `/api/payroll/my-payroll-info`

## What the formatter exports

```ts
formatPayrollSelfServicePaycheck(input)
formatPayrollSelfServiceInfo(input)
```

## Behavior / Guarantees

`formatPayrollSelfServicePaycheck()`:
- preserves employee-facing paycheck response shape
- normalizes dates to ISO strings or null
- formats money fields with `formatCurrency()`
- computes deductions with `sumFinancialValues()`
- includes `deductions` as an extra derived field for support/UI use

`formatPayrollSelfServiceInfo()`:
- preserves direct deposit response shape
- returns booleans for `hasRoutingNumber` and `hasAccountNumber`
- does not expose encrypted routing/account values
- supports existing callers that already compute `hasRoutingNumber` / `hasAccountNumber`

## Recommended Claude/local-build wiring

In `server/routes/payrollRoutes.ts`:

1. Import:

```ts
import {
  formatPayrollSelfServicePaycheck,
  formatPayrollSelfServiceInfo,
} from '../services/payroll/payrollSelfServiceFormatter';
```

2. In `GET /my-paychecks`, map DB rows through `formatPayrollSelfServicePaycheck(row)` before returning `res.json(...)`.

3. In `GET /my-payroll-info`, map the DB/payroll info row through `formatPayrollSelfServiceInfo(row)` before returning.

4. Preserve auth and employee/workspace scoping exactly as-is.

5. Build verify:

```bash
node build.mjs
npx tsc -p tsconfig.json --noEmit
```

## Notes

Jack/GPT could not inspect the employee-facing route bodies reliably through GitHub search, so this commit only adds the formatter service. Claude should wire it locally with full-file context.

Do not expose encrypted bank fields to the client during wiring.
