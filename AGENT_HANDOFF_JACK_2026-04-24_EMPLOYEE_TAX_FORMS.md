# Jack/GPT Handoff — Employee Tax Forms Self-Service

Branch: `development`
Date: 2026-04-24

## New Commit

`36ccdaa07e7c5900742e4fac7b17591e100ad0bf` — `refactor: add payroll employee tax forms service`

## File Added

`server/services/payroll/payrollEmployeeTaxFormsService.ts`

## Purpose

Prepare extraction of employee-facing tax form routes from `server/routes/payrollRoutes.ts`:

- `GET /my-tax-forms`
- `GET /my-tax-forms/:formId/download`

This does not duplicate tax generation. It uses the existing `employeeTaxForms` schema and leaves generation/PDF creation with the existing `TaxFormGeneratorService`.

## What the service exports

```ts
getMyEmployeeTaxForms({ userId, workspaceId })
getMyEmployeeTaxForm({ userId, workspaceId, formId })
```

## Behavior

`getMyEmployeeTaxForms()`:
- resolves the signed-in user's employee profile by `employees.userId + workspaceId`
- returns only active forms for that employee/workspace
- orders by newest tax year/generated date
- returns `{ employeeId, employeeName, forms }`

`getMyEmployeeTaxForm()`:
- resolves the signed-in user's employee profile by `employees.userId + workspaceId`
- requires `formId`
- selects only active forms matching `formId + workspaceId + employeeId`
- throws `404` if not found
- returns `{ employeeId, employeeName, form }`

## Why

Employee tax document access is sensitive. Ownership checks should not stay duplicated inside a giant route file. This service creates one canonical ownership gate for employee-facing tax form listing and download access.

## Recommended Claude/local-build wiring

In `server/routes/payrollRoutes.ts`:

1. Import:

```ts
import {
  getMyEmployeeTaxForms,
  getMyEmployeeTaxForm,
} from '../services/payroll/payrollEmployeeTaxFormsService';
```

2. Replace `GET /my-tax-forms` body after auth/workspace checks with:

```ts
const result = await getMyEmployeeTaxForms({
  userId: req.user!.id,
  workspaceId: req.workspaceId!,
});
res.json(result);
```

3. In `GET /my-tax-forms/:formId/download`, call `getMyEmployeeTaxForm()` first to enforce ownership before streaming/regenerating/downloading the PDF:

```ts
const access = await getMyEmployeeTaxForm({
  userId: req.user!.id,
  workspaceId: req.workspaceId!,
  formId: req.params.formId,
});
```

Then preserve the existing PDF/download behavior using `access.form` as the authorized form metadata.

4. Map thrown service statuses:

```ts
const status = (error as any)?.status || 500;
res.status(status).json({ message: error instanceof Error ? sanitizeError(error) : 'Failed to fetch tax forms' });
```

5. Build verify:

```bash
node build.mjs
npx tsc -p tsconfig.json --noEmit
```

## Notes

The client page `client/src/pages/my-paychecks.tsx` confirms active endpoints:
- `/api/payroll/my-tax-forms`
- `/api/payroll/my-tax-forms/:formId/download`

Do not expose SSN/TIN or encrypted payroll fields in the employee-facing response.
