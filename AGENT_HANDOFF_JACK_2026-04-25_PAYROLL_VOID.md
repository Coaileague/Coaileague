# Jack/GPT Handoff — Payroll Run Void Service

Branch: `development`
Date: 2026-04-25

## New Commit

`e31daf92718006bcf33f4757d8b18e4cfb1a8776` — `refactor: add payroll run void service`

## File Added

`server/services/payroll/payrollRunVoidService.ts`

## What Changed

Added a payroll-domain service for voiding/reversing payroll runs.

The key schema decision: the current `payroll_status` enum does **not** include `voided`, so this service does not invent a fake status. It records the void through:

- `payrollRuns.disbursementStatus = 'voided'`
- `payrollRuns.providerData.voided = true`
- void metadata in `providerData`
- payout reversal markers on payroll entries
- audit/event/broadcast trace

## Why Jack/GPT Did Not Edit `payrollRoutes.ts` Directly

Claude assigned `POST /:runId/void`, but GitHub search did not expose the current route body reliably. It only surfaced route indexes and broad references.

Because this workflow is financial/reversal-sensitive, Jack did not attempt a blind route rewrite.

Safe action taken:

1. Created the domain service.
2. Kept the mutation workspace-scoped and transactional.
3. Avoided unsupported enum statuses.
4. Left Claude exact local wiring guidance.

Claude should inspect the route locally and run build/type-check before wiring.

## Service Export

```ts
voidPayrollRun(params): Promise<VoidPayrollRunResult>
```

## Service Behavior

The service:

- requires `workspaceId`, `payrollRunId`, `userId`, and `reason`
- locks the payroll run row with `.for('update')`
- selects by `workspaceId + payrollRunId`
- allows voiding from:
  - `approved`
  - `processed`
  - `disbursing`
  - `paid`
  - `completed`
  - `partial`
- rejects non-voidable statuses with 409
- treats already-voided runs as idempotent success
- updates payroll run:
  - `disbursementStatus = 'voided'`
  - `providerData.voided = true`
  - `providerData.voidedAt`
  - `providerData.voidedBy`
  - `providerData.voidReason`
  - `providerData.reversalReference`
  - `providerData.previousStatus`
  - `providerData.previousDisbursementStatus`
- updates payroll entries:
  - `payoutStatus = 'reversed'`
  - `payoutFailureReason = reason`
  - `payoutFailedAt = voidedAt`
  - `plaidTransferStatus = 'reversed'`
  - `plaidTransferFailureReason = reason`
- writes SOC2-style audit log non-blocking
- broadcasts `payroll_updated / voided` non-blocking
- publishes `payroll_run_voided` non-blocking

## Result Shape

```ts
{
  success: true,
  payrollRunId: string,
  previousStatus: string | null,
  disbursementStatus: string,
  voidedAt: string,
  reversedEntries: number,
  alreadyVoided: boolean,
}
```

## Important Boundary

This service records the platform-side void/reversal state. It does not cancel an external banking/provider transfer.

If the existing route has external provider reversal/cancel behavior, preserve it locally and call `voidPayrollRun()` only after that logic succeeds or is confirmed unnecessary for the route mode.

## Recommended Claude Wiring

In `server/routes/payrollRoutes.ts`:

### 1. Import

```ts
import { voidPayrollRun } from '../services/payroll/payrollRunVoidService';
```

### 2. Route Usage

Inside `POST /:runId/void`, after existing auth/workspace/role checks and after any existing provider-specific reversal logic that must remain:

```ts
const result = await voidPayrollRun({
  workspaceId,
  payrollRunId: req.params.runId,
  userId: req.user!.id,
  userEmail: req.user?.email || 'unknown',
  userRole: req.user?.role || 'user',
  reason: typeof req.body?.reason === 'string' ? req.body.reason : '',
  reversalReference: typeof req.body?.reversalReference === 'string' ? req.body.reversalReference : null,
});

res.json(result);
```

### 3. Error Mapping

```ts
const status = (error as any)?.status || 500;
const extra = (error as any)?.extra || {};
res.status(status).json({
  message: error instanceof Error ? sanitizeError(error) : 'Failed to void payroll run',
  ...extra,
});
```

## Preserve Existing Route Protection

Do not remove existing:

- auth check
- manager/admin role check
- workspace context check
- idempotency middleware
- mutation limiter
- provider-specific cancel/reversal logic
- existing frontend response fields unless confirmed unused

## Build Verification Required

Please run:

```bash
node build.mjs
npx tsc -p tsconfig.json --noEmit
```

## Specific Fields To Verify

Please verify these compile in the current schema:

- `payrollRuns.disbursementStatus`
- `payrollRuns.providerData`
- `payrollEntries.payoutStatus`
- `payrollEntries.payoutFailureReason`
- `payrollEntries.payoutFailedAt`
- `payrollEntries.plaidTransferStatus`
- `payrollEntries.plaidTransferFailureReason`

Also verify dynamic websocket import path:

```ts
await import('../websocket')
```

## Why This Slice Is Useful

This reduces route complexity while avoiding a fake `voided` enum value. It gives the platform one canonical internal void marker until a formal payroll status migration is approved.

## Next Suggested Payroll Targets

After this route is handled:

1. `POST /create-run` — large creation/compliance gate; evaluate separately.
2. Bank account handlers — sensitive and should be reviewed carefully.
3. Full `POST /runs/:id/process` provider orchestration extraction — separate sprint only.

## Notes

This is payroll-domain cleanup only. It does not touch billing, RFP pricing, email, security, or UI.
