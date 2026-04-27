Trinity Scheduling / Thought Bar Domain Handoff
Date: 2026-04-23
Branch: development

What was broken
- Trinity auto-fill could report "No unassigned shifts to fill" even when the schedule UI showed open shifts.
- Root cause: orchestrated scheduling routes could fall back to the user's stale session workspace instead of the workspace currently selected in the schedule UI.
- The schedule page already sends workspaceId, but the backend was not consistently treating that as the source of truth.
- The Trinity thought bar was not reflecting autonomous scheduling activity clearly, and the Trinity icon was static/generic instead of behaving like an active assistant surface.
- After validating against the live development app, a second blocker showed up:
  - Trinity could see real open shifts, but scheduling execution failed with `automation_executions.action_type` null constraint errors.
  - Root cause: trinitySchedulingOrchestrator was misusing automationExecutionTracker by calling `createExecution(executionId, ...)` for lifecycle transitions instead of the proper start/complete/fail/verify/reject methods.

What changed
- server/routes/orchestratedScheduleRoutes.ts
  - Added route-level workspace resolution that prefers the requested workspaceId from body/query, then validates access through RBAC.
  - Preserved platform-wide support/system access while enforcing tenant isolation for regular users.
  - Updated these endpoints to use the resolved workspace consistently:
    - GET /status
    - POST /ai/fill-shift
    - POST /ai/trigger-session
    - GET /executions
    - GET /active-operations
    - GET /credit-status
  - Added request logging for AI fill and trigger-session so workspace drift is visible in logs.
  - trigger-session now returns:
    - totalShifts
    - totalOpenShifts
    - totalShiftsAnalyzed

- server/services/orchestration/trinitySchedulingOrchestrator.ts
  - Scheduling session results now include totalShiftsAnalyzed and totalOpenShifts.
  - Added logging for how many open shifts Trinity actually sees in the requested week/workspace.
  - Fixed execution tracker lifecycle calls:
    - `createExecution(...)` only for initial row creation
    - `startExecution(...)` when work begins
    - `completeExecution(...)` for pending verification handoff
    - `failExecution(...)` on scheduling errors
    - `verifyExecution(...)` after applying verified mutations
    - `rejectExecution(...)` when rejecting mutations
  - This removes the bad second insert path that was creating null `action_type` failures in development.

- server/services/orchestration/universalStepLogger.ts
  - Fixed additional tracker API drift where `failExecution(...)` was being called with legacy positional arguments instead of the current object payload.
  - This is a broader orchestration reliability cleanup so timeout/failure paths do not silently diverge from the tracker contract.

- client/src/pages/universal-schedule.tsx
  - Updated the auto-fill success handling so the UI uses backend-analyzed shift counts instead of falling back to an incorrect "none open" path.
  - If orchestration starts without a sessionId but open shifts are still being tracked, the toast now says Trinity scheduling is in progress instead of claiming nothing was open.

- client/src/components/chatdock/TrinityThoughtBar.tsx
  - Added autonomous scheduling activity polling from /api/orchestrated-schedule/active-operations for the current workspace.
  - Thought text now adapts to real scheduling phases:
    - waking systems
    - scanning coverage
    - validating constraints
    - matching officers
    - preparing changes
    - cross-checking
    - broadcasting updates
  - Replaced the generic spinner behavior with animation on the actual Trinity mark:
    - breathe
    - spin
    - bounce
    - halo pulse
  - The bar now stays visually coherent with live Trinity activity even when there is no active chat session.

Before vs after
- Before: schedule page and Trinity scheduler could disagree about which workspace they were looking at.
- After: Trinity scheduling respects the same selected workspace the UI is using.
- Before: users could see 42 open shifts in the grid and still get a "No unassigned shifts to fill" result.
- After: Trinity reports the analyzed open-shift count from the actual scheduling context.
- Before: even when Trinity saw real open shifts, execution tracking could fail silently at the DB layer because the orchestrator was re-calling `createExecution` incorrectly.
- After: the scheduling execution lifecycle uses the correct tracker APIs, so the orchestration can progress instead of dying on `automation_executions`.
- Before: the thought bar felt passive and disconnected from scheduling work.
- After: the thought bar reflects autonomous scheduling steps and the Trinity icon animates as an active assistant state.

Validation run in this clone
- node build.mjs: passed
- vitest run --project unit: passed
- 7 files / 100 tests passed

Notes for sync/push
- This handoff is only for the Trinity scheduling / thought-bar domain slice.
- Safe commit message:
  - fix: align Trinity scheduling workspace context and thought bar activity
