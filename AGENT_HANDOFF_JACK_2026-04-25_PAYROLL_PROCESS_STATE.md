# Jack/GPT Handoff — Payroll Run Process-State Service

Branch: `development`
Date: 2026-04-25

## New Commit

`8e2dea3b6821845da53f4d454ada1ee95dcb8495` — `refactor: add payroll run process state service`

## File Added

`server/services/payroll/payrollRunProcessStateService.ts`

## What Changed

Added a payroll-domain service for the **state transition portion** of payroll processing.

This service centralizes:

- row-locked payroll run state update
- workspace scoping
- payroll entry payout-pending stamps
- SOC2 audit log
- billing audit log
- websocket update
- platform event trace

## Why Jack/GPT Did Not Edit `payrollRoutes.ts` Directly

Claude assigned `POST /runs/:id/process`, which is high-risk because it appears to mix state transition, provider orchestration, notifications, audit, tier checks, and idempotency.

Jack tried to inspect the route body through the GitHub connector, but search did not expose a reliable current handler body. Because this route affects payroll execution, Jack did not attempt a blind route rewrite.

Safe action taken:

1. Created the domain service.
2. Kept the service limited to the state transition.
3. Left Claude local wiring guidance.

Claude should inspect the route locally and run build/type-check before wiring.

## Service Export

```ts
processPayrollRunState(params): Promise<ProcessPayrollRunStateResult>
```

## Service Behavior

The service:

- requires `workspaceId`, `payrollRunId`, and `userId`
- locks the payroll run row with `.for('update')`
- selects by `workspaceId + payrollRunId`
- allows transition from `approved` or `processing`
- treats `processed` and `disbursing` as idempotent success states
- rejects not-ready statuses with 409
- updates the payroll run to `processed`
- stamps payroll entries as payout-pending
- writes audit/event/broadcast traces as non-blocking side effects

## Result Shape

```ts
{
  success: true,
  payrollRunId: string,
  previousStatus: string | null,
  status: 'processed',
  processedAt: string,
  updatedEntries: number,
  alreadyProcessed: boolean,
}
```

## Important Boundary

This service is **not** a replacement for the full route. It should be wired only around the state transition portion of `POST /runs/:id/process`.

Do not remove existing route protections or provider-specific logic until inspected locally.

## Recommended Claude Wiring

In `server/routes/payrollRoutes.ts`:

1. Import:

```ts
import { processPayrollRunState } from '../services/payroll/payrollRunProcessStateService';
```

2. After the existing route has completed its current prechecks and provider-specific work, call:

```ts
const processState = await processPayrollRunState({
  workspaceId,
  payrollRunId: req.params.id,
  userId: req.user!.id,
  userEmail: req.user?.email || 'unknown',
  userRole: req.user?.role || 'user',
  ipAddress: req.ip || null,
  userAgent: req.get('user-agent') || null,
  disbursementMethod,
  providerBatchId,
  reason: typeof req.body?.reason === 'string' ? req.body.reason : null,
});
```

3. Preserve the existing response shape expected by the frontend. If needed, merge the old response fields with `processState`.

4. Use status-aware error mapping:

```ts
const status = (error as any)?.status || 500;
const extra = (error as any)?.extra || {};
res.status(status).json({
  message: error instanceof Error ? sanitizeError(error) : 'Failed to process payroll run',
  ...extra,
});
```

## Preserve Existing Route Protection

Do not remove existing:

- auth check
- manager/admin role check
- workspace context check
- tier guard
- mutation limiter
- idempotency middleware
- existing provider-specific validation
- existing frontend response fields

## Build Verification Required

Please run:

```bash
node build.mjs
npx tsc -p tsconfig.json --noEmit
```

## Specific Fields To Verify

Please verify these compile in the current schema:

- `payrollRuns.providerData`
- `payrollRuns.disbursementStatus`
- `payrollRuns.disbursementDate`
- `payrollEntries.payoutStatus`
- `payrollEntries.payoutInitiatedAt`
- `payrollEntries.disbursementMethod`
- `billingAuditLog.oldState`
- `billingAuditLog.newState`

Also verify the dynamic websocket import path in the service:

```ts
await import('../websocket')
```

## Why This Slice Is Useful

`POST /runs/:id/process` is too risky to extract all at once without local route context. This service separates the safe canonical state mutation from the remaining route orchestration.

That reduces confusion without creating a second payroll execution engine.

## Next Suggested Payroll Targets

After this route is handled:

1. `POST /:runId/void` — reversal workflow; should likely become its own service.
2. `POST /create-run` — large creation/compliance gate; evaluate separately.
3. Bank account handlers — sensitive and should be reviewed carefully.

## Notes

This is payroll-domain cleanup only. It does not touch billing, RFP pricing, email, security, or UI.
