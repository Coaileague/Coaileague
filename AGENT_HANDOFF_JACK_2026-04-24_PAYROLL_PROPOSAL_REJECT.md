# Jack/GPT Handoff — Payroll Proposal Rejection Service

Branch: `development`
Date: 2026-04-24

## New Commit

`cb7df95d8f4a2d70da7daf68406542e31b2617b6` — `refactor: add payroll proposal rejection service`

## File Added

`server/services/payroll/payrollProposalRejectionService.ts`

## Purpose

Prepare extraction of `PATCH /proposals/:id/reject` from `server/routes/payrollRoutes.ts`.

This is the simpler side of the proposal approval/rejection pair and is a good route-domain consolidation target because the route body was visible through the connector.

## What the service exports

```ts
rejectPayrollProposal(params: RejectPayrollProposalParams): Promise<RejectPayrollProposalResult>
```

Params:
- `proposalId`
- `reason?`
- `userId`
- `workspaceId`
- `userEmail?`
- `userRole?`

## Behavior Preserved / Strengthened

The service mirrors the existing reject route behavior:

- requires `proposalId`, `userId`, and `workspaceId`
- selects only pending proposals scoped by `workspaceId`
- updates status to `rejected`
- records `rejectedBy`, `rejectedAt`, `rejectionReason`, `updatedAt`
- writes SOC2 sensitive-data audit log non-blocking
- broadcasts `payroll_updated` / `proposal_rejected` non-blocking
- returns `{ success, proposalId, message }`

Additional strengthening:
- event bus publish added for `payroll_proposal_rejected` with trace metadata
- websocket failure is now caught/logged as non-blocking instead of relying on route-level import comments
- errors carry `status` for thin route wrapper handling

## Recommended Claude/local-build route replacement

In `server/routes/payrollRoutes.ts`:

1. Import:

```ts
import { rejectPayrollProposal } from '../services/payroll/payrollProposalRejectionService';
```

2. Replace the body of `router.patch('/proposals/:id/reject', async (req, res) => { ... })` after role/user/workspace checks with:

```ts
const { id } = req.params;
const { reason } = req.body;
const userId = req.user?.id;
const userWorkspace = await storage.getWorkspaceMemberByUserId(userId!);
if (!userWorkspace) return res.status(404).json({ message: 'Workspace not found' });

const result = await rejectPayrollProposal({
  proposalId: id,
  reason,
  userId: userId!,
  workspaceId: userWorkspace.workspaceId,
  userEmail: req.user?.email || 'unknown',
  userRole: req.user?.role || 'user',
});

res.json(result);
```

3. Preserve the existing manager role check at the top of the route.

4. In route catch block, map service thrown `status` if practical:

```ts
const status = (error as any)?.status || 500;
res.status(status).json({ message: error instanceof Error ? sanitizeError(error) : 'Failed to reject payroll' });
```

5. Remove route-local inline reject logic and unused imports only if compiler confirms.

6. Build verify:

```bash
node build.mjs
npx tsc -p tsconfig.json --noEmit
```

## Notes

This intentionally does not touch `PATCH /proposals/:id/approve`, which is more complex and transaction-heavy. Keep approve route intact until separately extracted.
