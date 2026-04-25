# Jack/GPT Handoff — Payroll Proposal Approval Service

Branch: `development`
Date: 2026-04-25

## New Commit

`1b3d1cd39bc086b9a1e84a96b55a22c6810ec7ac` — `refactor: add payroll proposal approval service`

## File Added

`server/services/payroll/payrollProposalApprovalService.ts`

## Why Jack/GPT did not edit `payrollRoutes.ts` directly

Claude asked Jack to inspect `POST /runs/:id/approve`, but the visible route handler in `payrollRoutes.ts` is actually `PATCH /proposals/:id/approve`.

The handler is complex and sensitive. It includes:

- manager role check
- workspace membership lookup
- `SELECT FOR UPDATE` row lock
- pending-status race guard
- four-eyes/self-approval guard
- stale proposal guard
- anomaly warning logic
- SOC2 audit log
- webhook emission
- websocket broadcast
- platform event publish
- universal notification
- status-specific error responses

Jack/GPT could inspect the handler through the connector, but route-file wiring is still risky because `payrollRoutes.ts` is large and Claude has recent local build context. A wrong import cleanup or missed route middleware could break payroll.

So Jack did the safe part directly:

1. Created the payroll-domain approval service.
2. Preserved the row-lock transaction and side-effect behavior.
3. Left exact local wiring instructions for Claude.

Claude should do the route replacement locally, preserve middleware/auth checks, and run:

```bash
node build.mjs
npx tsc -p tsconfig.json --noEmit
```

## What the service does

`approvePayrollProposal(params)`:

- requires `proposalId`
- requires `workspaceId`
- requires `userId`
- locks proposal row with `.for('update')`
- scopes proposal by `workspaceId + proposalId`
- rejects missing proposal with 404
- rejects non-pending proposal with 409
- rejects self-approval with 403 and code `SELF_APPROVAL_FORBIDDEN`
- rejects stale proposals older than 30 days with 409 and code `PROPOSAL_EXPIRED`
- updates proposal to `approved` inside the transaction
- repeats pending-status guard in the `UPDATE` where clause
- computes non-blocking anomaly warning from proposal totals
- writes SOC2 audit log non-blocking
- emits payroll approval webhook non-blocking
- broadcasts `payroll_updated / proposal_approved` non-blocking
- publishes `payroll_run_approved` event non-blocking
- sends universal notification non-blocking
- returns:

```ts
{
  success: true,
  proposalId,
  message: 'Payroll proposal approved. Payroll will be processed.',
  anomalyWarning?: string,
}
```

## Behavior intentionally preserved from route

- Row-lock transaction stays in the business operation.
- Four-eyes approval rule stays inside the transaction.
- 30-day stale proposal guard stays inside the transaction.
- Financial anomaly warning remains warning-only, not blocking.
- Audit/webhook/websocket/event/notification side effects remain after successful approval.
- Existing response shape is preserved.

## Recommended Claude/local-build wiring

In `server/routes/payrollRoutes.ts`:

1. Import:

```ts
import { approvePayrollProposal } from '../services/payroll/payrollProposalApprovalService';
```

2. Replace the body of `router.patch('/proposals/:id/approve', async (req, res) => { ... })` after role/user/workspace checks with:

```ts
const { id } = req.params;
const userId = req.user?.id;
const userWorkspace = await storage.getWorkspaceMemberByUserId(userId!);
if (!userWorkspace) return res.status(404).json({ message: 'Workspace not found' });

const result = await approvePayrollProposal({
  proposalId: id,
  workspaceId: userWorkspace.workspaceId,
  userId: userId!,
  userEmail: req.user?.email || 'unknown',
  userRole: req.user?.role || 'user',
});

res.json(result);
```

3. Preserve the existing manager role check at the top of the route.

4. Replace the route catch block with status-aware mapping:

```ts
const status = (error as any)?.status || 500;
const extra = (error as any)?.extra || {};
log.error('OperationsOS™ Payroll Approval Error:', error);
res.status(status).json({
  message: error instanceof Error ? sanitizeError(error) : 'Failed to approve payroll',
  ...extra,
});
```

5. Remove old inline approval imports only if compiler confirms they are unused. Do not remove imports blindly.

6. Build/type-check:

```bash
node build.mjs
npx tsc -p tsconfig.json --noEmit
```

## Important verification for Claude

Please verify import paths:

- `storage` import from `server/storage` inside service
- `deliverWebhookEvent` import from `../webhookDeliveryService`
- `broadcastToWorkspace` import from `../websocketService`
- `universalNotificationEngine` import from `../universalNotificationEngine`

If any relative paths are off, adjust locally.

## Notes

This continues the payroll-domain route extraction order. It does not touch billing, RFP pricing, email, security, or UI.

If this builds and wires cleanly, payroll route extraction has handled the last major proposal approval/rejection pair. Remaining payroll route work should mostly be smaller handlers/import cleanup.
