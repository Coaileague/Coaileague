# CoAIleague — Action Wiring Manifest

> **Generated:** 2026-05-01T07:46:40.215Z
> **Generator:** `scripts/audit/generate-action-wiring-manifest.ts`
> **Scope:** UI calls + backend routes + Trinity actionRegistry + websocket + automation/cron + webhooks

## Method

This is a **first-pass regex + import-graph** scan. It is _not_ a full AST
audit — it produces enough citations (file + line) to verify each action
chain by hand or with a follow-up tool. Where the scanner cannot prove a
property, the field is `unknown`, never silently `false`. No silent passes.

Action source types: ui · api · trinity · websocket · automation · webhook · cron

## Scope counts

- Total action records: **3688**
- Trinity registry actionId literals: **420**
- WebSocket events (on + emit): **34**
- Automation/cron entries: **44**
- Duplicate actionIds: **328**

## Status roll-up

| Status | Count |
| --- | --- |
| BACKEND_ONLY | 1850 |
| MISSING_AUDIT | 1062 |
| MISSING_ZOD | 691 |
| UI_ONLY | 562 |
| SILENT_FAILURE_RISK | 562 |
| WIRED | 487 |
| PARTIAL | 382 |
| DUPLICATE_ACTION | 328 |
| MISSING_TRANSACTION | 314 |
| MISSING_RBAC | 296 |
| REGISTERED_NOT_EXECUTABLE | 189 |
| MISSING_WORKSPACE_SCOPE | 28 |

## Top 25 PARTIAL actions

| actionId | sourceType | domain | mutation | where | flags |
| --- | --- | --- | --- | --- | --- |
| wired:post:/api/chat/manage/messages/:id/reactions | ui | chat | create | server/routes/chat-management.ts:1334 | PARTIAL,MISSING_ZOD,MISSING_AUDIT,MISSING_TRANSACTION,DUPLICATE_ACTION |
| wired:post:/api/promotional-banners/ | ui | other | create | server/routes/promotionalBannerRoutes.ts:60 | PARTIAL,MISSING_ZOD,MISSING_AUDIT,DUPLICATE_ACTION |
| wired:patch:/api/promotional-banners/:id | ui | other | update | server/routes/promotionalBannerRoutes.ts:115 | PARTIAL,MISSING_ZOD,MISSING_AUDIT,DUPLICATE_ACTION |
| wired:delete:/api/promotional-banners/:id | ui | other | delete | server/routes/promotionalBannerRoutes.ts:161 | PARTIAL,MISSING_ZOD,MISSING_AUDIT,DUPLICATE_ACTION |
| wired:post:/api/helpdesk/motd/acknowledge | ui | support | create | server/routes/helpdeskRoutes.ts:992 | PARTIAL,MISSING_RBAC,MISSING_ZOD,MISSING_AUDIT,MISSING_TRANSACTION |
| wired:post:/api/helpdesk/room/:slug/status | ui | support | create | server/routes/helpdeskRoutes.ts:359 | PARTIAL,MISSING_RBAC,MISSING_ZOD,MISSING_AUDIT,MISSING_TRANSACTION |
| wired:post:/api/chat/rooms/:roomId/close | ui | chat | create | server/routes/chat-rooms.ts:2280 | PARTIAL,MISSING_ZOD,MISSING_AUDIT |
| wired:post:/api/chat/rooms/:roomId/reopen | ui | chat | create | server/routes/chat-rooms.ts:2367 | PARTIAL,MISSING_ZOD,MISSING_AUDIT |
| wired:patch:/api/chat/manage/messages/:id/edit | ui | chat | update | server/routes/chat-management.ts:1504 | PARTIAL,MISSING_ZOD,MISSING_AUDIT,MISSING_TRANSACTION,DUPLICATE_ACTION |
| wired:post:/api/chat/manage/messages/:id/pin | ui | chat | create | server/routes/chat-management.ts:1692 | PARTIAL,MISSING_ZOD,MISSING_AUDIT,MISSING_TRANSACTION,DUPLICATE_ACTION |
| wired:post:/api/chat/manage/messages/:id/forward | ui | chat | create | server/routes/chat-management.ts:1561 | PARTIAL,MISSING_ZOD,MISSING_AUDIT,MISSING_TRANSACTION,DUPLICATE_ACTION |
| wired:post:/api/support/create-ticket | ui | support | create | server/routes/supportRoutes.ts:62 | PARTIAL,MISSING_RBAC,MISSING_AUDIT |
| wired:post:/api/enterprise/public/offer/:offerId/accept | ui | auth | create | server/routes/enterpriseOnboardingRoutes.ts:118 | PARTIAL,MISSING_RBAC,MISSING_ZOD,MISSING_AUDIT |
| wired:post:/api/enterprise/public/offer/:offerId/decline | ui | auth | create | server/routes/enterpriseOnboardingRoutes.ts:160 | PARTIAL,MISSING_RBAC,MISSING_ZOD,MISSING_AUDIT |
| wired:post:/api/support/actions/execute | ui | support | create | server/routes/supportActionRoutes.ts:309 | PARTIAL,MISSING_AUDIT,DUPLICATE_ACTION |
| wired:post:/api/trinity/org-state/:workspaceId/refresh | ui | other | create | server/routes/trinityOrgStateRoutes.ts:78 | PARTIAL,MISSING_ZOD,MISSING_AUDIT |
| wired:post:/api/form-builder/forms/:formId/submissions/:submissionId/approve | ui | other | approve | server/routes/formBuilderRoutes.ts:620 | PARTIAL,MISSING_TRANSACTION |
| wired:patch:/api/form-builder/submissions/:id | ui | other | update | server/routes/formBuilderRoutes.ts:418 | PARTIAL,MISSING_TRANSACTION |
| wired:post:/api/form-builder/forms | ui | other | create | server/routes/formBuilderRoutes.ts:128 | PARTIAL,MISSING_TRANSACTION |
| wired:patch:/api/form-builder/forms/:id | ui | other | update | server/routes/formBuilderRoutes.ts:156 | PARTIAL,MISSING_TRANSACTION |
| wired:delete:/api/form-builder/forms/:id | ui | other | delete | server/routes/formBuilderRoutes.ts:214 | PARTIAL,MISSING_TRANSACTION |
| wired:patch:/api/admin/permissions/workspaces/:wsId/matrix | ui | admin | update | server/routes/adminPermissionRoutes.ts:92 | PARTIAL,MISSING_ZOD |
| wired:delete:/api/admin/permissions/workspaces/:wsId/matrix | ui | admin | delete | server/routes/adminPermissionRoutes.ts:143 | PARTIAL,MISSING_ZOD |
| wired:patch:/api/admin/permissions/workspaces/:wsId/users/:userId/role | ui | admin | update | server/routes/adminPermissionRoutes.ts:220 | PARTIAL,MISSING_ZOD |
| wired:post:/api/ai/audit-logs/:id/review | ui | audit | create | server/routes/aiRoutes.ts:344 | PARTIAL,MISSING_AUDIT |

## Top 25 UI_ONLY (frontend calls without backend route)

| actionId | sourceType | domain | mutation | where | flags |
| --- | --- | --- | --- | --- | --- |
| ui:post:/api/helpai/session/start | ui | clients | create | client/src/pages/HelpDesk.tsx | UI_ONLY,SILENT_FAILURE_RISK,DUPLICATE_ACTION |
| ui:post:/api/helpai/session/${helpaiSessionId}/rate | ui | clients | create | client/src/pages/HelpDesk.tsx | UI_ONLY,SILENT_FAILURE_RISK |
| ui:get:/api/helpdesk/user-context | ui | clients | read | client/src/pages/HelpDesk.tsx | UI_ONLY,SILENT_FAILURE_RISK,DUPLICATE_ACTION |
| ui:get:/api/chat/manage/conversations | ui | chat | read | client/src/pages/HelpDesk.tsx | UI_ONLY,SILENT_FAILURE_RISK,DUPLICATE_ACTION |
| ui:post:/api/accept-handoff/${token}/complete | ui | clients | create | client/src/pages/accept-handoff.tsx | UI_ONLY,SILENT_FAILURE_RISK |
| ui:get:/api/accept-handoff | ui | clients | read | client/src/pages/accept-handoff.tsx | UI_ONLY,SILENT_FAILURE_RISK |
| ui:get:/api/enterprise/public/offer | ui | clients | read | client/src/pages/accept-offer.tsx | UI_ONLY,SILENT_FAILURE_RISK |
| ui:post:/api/enterprise-features/account-manager | ui | clients | create | client/src/pages/account-manager.tsx | UI_ONLY,SILENT_FAILURE_RISK |
| ui:get:/api/enterprise-features/account-manager | ui | clients | read | client/src/pages/account-manager.tsx | UI_ONLY,SILENT_FAILURE_RISK |
| ui:post:/api/integrations/connection-request | ui | clients | create | client/src/pages/accounting-integrations.tsx | UI_ONLY,SILENT_FAILURE_RISK,DUPLICATE_ACTION |
| ui:get:/api/admin/workspaces | ui | clients | read | client/src/pages/admin/support-console-workspace.tsx | UI_ONLY,SILENT_FAILURE_RISK,DUPLICATE_ACTION |
| ui:get:/api/trinity/org-state | ui | clients | read | client/src/pages/admin/support-console-workspace.tsx | UI_ONLY,SILENT_FAILURE_RISK |
| ui:post:/api/helpai/v2/proactive-alerts/${alertId}/acknowledge | ui | clients | create | client/src/pages/admin-helpai.tsx | UI_ONLY,SILENT_FAILURE_RISK |
| ui:post:/api/helpai/session/${sessionId}/close | ui | clients | create | client/src/pages/admin-helpai.tsx | UI_ONLY,SILENT_FAILURE_RISK |
| ui:post:/api/clients/dockchat/reports/${selectedReport.id}/acknowledge | ui | chat | create | client/src/pages/admin-helpai.tsx | UI_ONLY,SILENT_FAILURE_RISK |
| ui:post:/api/clients/dockchat/reports/${selectedReport.id}/resolve | ui | chat | create | client/src/pages/admin-helpai.tsx | UI_ONLY,SILENT_FAILURE_RISK |
| ui:get:/api/helpai/admin/stats | ui | clients | read | client/src/pages/admin-helpai.tsx | UI_ONLY,SILENT_FAILURE_RISK |
| ui:get:/api/helpai/admin/sessions | ui | clients | read | client/src/pages/admin-helpai.tsx | UI_ONLY,SILENT_FAILURE_RISK |
| ui:get:/api/helpai/admin/action-log | ui | clients | read | client/src/pages/admin-helpai.tsx | UI_ONLY,SILENT_FAILURE_RISK |
| ui:get:/api/helpai/v2/activity | ui | clients | read | client/src/pages/admin-helpai.tsx | UI_ONLY,SILENT_FAILURE_RISK |
| ui:get:/api/security-admin/overrides | ui | clients | read | client/src/pages/admin-security.tsx | UI_ONLY,SILENT_FAILURE_RISK |
| ui:get:/api/security-admin/auditor-allowlist | ui | clients | read | client/src/pages/admin-security.tsx | UI_ONLY,SILENT_FAILURE_RISK |
| ui:post:/api/security-admin/overrides | ui | clients | create | client/src/pages/admin-security.tsx | UI_ONLY,SILENT_FAILURE_RISK |
| ui:delete:/api/security-admin/overrides/${id} | ui | clients | delete | client/src/pages/admin-security.tsx | UI_ONLY,SILENT_FAILURE_RISK |
| ui:post:/api/security-admin/auditor-allowlist | ui | clients | create | client/src/pages/admin-security.tsx | UI_ONLY,SILENT_FAILURE_RISK |

## Top 25 BACKEND_ONLY (registered routes with no UI binding detected)

| actionId | sourceType | domain | mutation | where | flags |
| --- | --- | --- | --- | --- | --- |
| api:get:/api/admin/ai-costs/health | api | admin | read | server/routes/admin/aiCosts.ts:16 | BACKEND_ONLY |
| api:get:/api/admin/ai-costs/by-operation | api | admin | read | server/routes/admin/aiCosts.ts:32 | BACKEND_ONLY |
| api:get:/api/admin/ai-costs/unprofitable-companies | api | admin | read | server/routes/admin/aiCosts.ts:50 | BACKEND_ONLY |
| api:get:/api/admin/ai-costs/recommendations | api | admin | read | server/routes/admin/aiCosts.ts:72 | BACKEND_ONLY |
| api:get:/api/admin/ai-costs/alerts | api | admin | read | server/routes/admin/aiCosts.ts:94 | BACKEND_ONLY |
| api:post:/api/admin/ai-costs/preflight | api | admin | create | server/routes/admin/aiCosts.ts:116 | BACKEND_ONLY,MISSING_ZOD,MISSING_AUDIT |
| api:get:/api/admin/ai-costs/token-limits | api | admin | export | server/routes/admin/aiCosts.ts:148 | BACKEND_ONLY |
| api:get:/api/admin/ai-costs/pricing | api | admin | read | server/routes/admin/aiCosts.ts:182 | BACKEND_ONLY |
| api:post:/api/admin/dev-execute | api | admin | create | server/routes/adminDevExecuteRoute.ts:92 | BACKEND_ONLY,MISSING_RBAC,MISSING_ZOD,MISSING_WORKSPACE_SCOPE,MISSING_AUDIT,DUPLICATE_ACTION |
| api:patch:/api/admin/workspace/:workspaceId | api | admin | update | server/routes/adminRoutes.ts:108 | BACKEND_ONLY,MISSING_RBAC,MISSING_TRANSACTION |
| api:get:/api/admin/support/workspace/:id | api | admin | read | server/routes/adminRoutes.ts:149 | BACKEND_ONLY |
| api:get:/api/admin/identity/resolve | api | admin | read | server/routes/adminRoutes.ts:183 | BACKEND_ONLY |
| api:post:/api/admin/identity/rewrite | api | admin | create | server/routes/adminRoutes.ts:260 | BACKEND_ONLY,MISSING_RBAC,MISSING_TRANSACTION |
| api:get:/api/admin/platform/activities | api | admin | read | server/routes/adminRoutes.ts:326 | BACKEND_ONLY |
| api:get:/api/admin/admin/metrics | api | admin | read | server/routes/adminRoutes.ts:561 | BACKEND_ONLY |
| api:get:/api/admin/platform/invitations | api | admin | read | server/routes/adminRoutes.ts:593 | BACKEND_ONLY |
| api:get:/api/admin/support/lookup | api | admin | read | server/routes/adminRoutes.ts:640 | BACKEND_ONLY |
| api:post:/api/admin/support/change-role | api | admin | create | server/routes/adminRoutes.ts:658 | BACKEND_ONLY,MISSING_RBAC,MISSING_TRANSACTION |
| api:get:/api/admin/support/sessions/current | api | auth | read | server/routes/adminRoutes.ts:824 | BACKEND_ONLY |
| api:post:/api/admin/support/freeze-account | api | admin | create | server/routes/adminRoutes.ts:961 | BACKEND_ONLY,MISSING_RBAC,MISSING_TRANSACTION |
| api:post:/api/admin/support/unfreeze-account | api | admin | create | server/routes/adminRoutes.ts:979 | BACKEND_ONLY,MISSING_RBAC,MISSING_TRANSACTION |
| api:post:/api/admin/support/delete-user | api | admin | create | server/routes/adminRoutes.ts:1031 | BACKEND_ONLY,MISSING_RBAC,MISSING_TRANSACTION |
| api:post:/api/admin/support/create-client | api | clients | create | server/routes/adminRoutes.ts:1095 | BACKEND_ONLY,MISSING_RBAC,MISSING_TRANSACTION |
| api:post:/api/admin/support/delete-client | api | clients | create | server/routes/adminRoutes.ts:1138 | BACKEND_ONLY,MISSING_RBAC,MISSING_TRANSACTION |
| api:post:/api/admin/support/process-payment | api | billing | create | server/routes/adminRoutes.ts:1172 | BACKEND_ONLY,MISSING_RBAC,MISSING_TRANSACTION |

## Top 25 SILENT_FAILURE_RISK

| actionId | sourceType | domain | mutation | where | flags |
| --- | --- | --- | --- | --- | --- |
| ui:post:/api/helpai/session/start | ui | clients | create | client/src/pages/HelpDesk.tsx | UI_ONLY,SILENT_FAILURE_RISK,DUPLICATE_ACTION |
| ui:post:/api/helpai/session/${helpaiSessionId}/rate | ui | clients | create | client/src/pages/HelpDesk.tsx | UI_ONLY,SILENT_FAILURE_RISK |
| ui:get:/api/helpdesk/user-context | ui | clients | read | client/src/pages/HelpDesk.tsx | UI_ONLY,SILENT_FAILURE_RISK,DUPLICATE_ACTION |
| ui:get:/api/chat/manage/conversations | ui | chat | read | client/src/pages/HelpDesk.tsx | UI_ONLY,SILENT_FAILURE_RISK,DUPLICATE_ACTION |
| ui:post:/api/accept-handoff/${token}/complete | ui | clients | create | client/src/pages/accept-handoff.tsx | UI_ONLY,SILENT_FAILURE_RISK |
| ui:get:/api/accept-handoff | ui | clients | read | client/src/pages/accept-handoff.tsx | UI_ONLY,SILENT_FAILURE_RISK |
| ui:get:/api/enterprise/public/offer | ui | clients | read | client/src/pages/accept-offer.tsx | UI_ONLY,SILENT_FAILURE_RISK |
| ui:post:/api/enterprise-features/account-manager | ui | clients | create | client/src/pages/account-manager.tsx | UI_ONLY,SILENT_FAILURE_RISK |
| ui:get:/api/enterprise-features/account-manager | ui | clients | read | client/src/pages/account-manager.tsx | UI_ONLY,SILENT_FAILURE_RISK |
| ui:post:/api/integrations/connection-request | ui | clients | create | client/src/pages/accounting-integrations.tsx | UI_ONLY,SILENT_FAILURE_RISK,DUPLICATE_ACTION |
| ui:get:/api/admin/workspaces | ui | clients | read | client/src/pages/admin/support-console-workspace.tsx | UI_ONLY,SILENT_FAILURE_RISK,DUPLICATE_ACTION |
| ui:get:/api/trinity/org-state | ui | clients | read | client/src/pages/admin/support-console-workspace.tsx | UI_ONLY,SILENT_FAILURE_RISK |
| ui:post:/api/helpai/v2/proactive-alerts/${alertId}/acknowledge | ui | clients | create | client/src/pages/admin-helpai.tsx | UI_ONLY,SILENT_FAILURE_RISK |
| ui:post:/api/helpai/session/${sessionId}/close | ui | clients | create | client/src/pages/admin-helpai.tsx | UI_ONLY,SILENT_FAILURE_RISK |
| ui:post:/api/clients/dockchat/reports/${selectedReport.id}/acknowledge | ui | chat | create | client/src/pages/admin-helpai.tsx | UI_ONLY,SILENT_FAILURE_RISK |
| ui:post:/api/clients/dockchat/reports/${selectedReport.id}/resolve | ui | chat | create | client/src/pages/admin-helpai.tsx | UI_ONLY,SILENT_FAILURE_RISK |
| ui:get:/api/helpai/admin/stats | ui | clients | read | client/src/pages/admin-helpai.tsx | UI_ONLY,SILENT_FAILURE_RISK |
| ui:get:/api/helpai/admin/sessions | ui | clients | read | client/src/pages/admin-helpai.tsx | UI_ONLY,SILENT_FAILURE_RISK |
| ui:get:/api/helpai/admin/action-log | ui | clients | read | client/src/pages/admin-helpai.tsx | UI_ONLY,SILENT_FAILURE_RISK |
| ui:get:/api/helpai/v2/activity | ui | clients | read | client/src/pages/admin-helpai.tsx | UI_ONLY,SILENT_FAILURE_RISK |
| ui:get:/api/security-admin/overrides | ui | clients | read | client/src/pages/admin-security.tsx | UI_ONLY,SILENT_FAILURE_RISK |
| ui:get:/api/security-admin/auditor-allowlist | ui | clients | read | client/src/pages/admin-security.tsx | UI_ONLY,SILENT_FAILURE_RISK |
| ui:post:/api/security-admin/overrides | ui | clients | create | client/src/pages/admin-security.tsx | UI_ONLY,SILENT_FAILURE_RISK |
| ui:delete:/api/security-admin/overrides/${id} | ui | clients | delete | client/src/pages/admin-security.tsx | UI_ONLY,SILENT_FAILURE_RISK |
| ui:post:/api/security-admin/auditor-allowlist | ui | clients | create | client/src/pages/admin-security.tsx | UI_ONLY,SILENT_FAILURE_RISK |

## Mutating actions missing RBAC

| actionId | sourceType | domain | mutation | where | flags |
| --- | --- | --- | --- | --- | --- |
| wired:post:/api/helpdesk/motd/acknowledge | ui | support | create | server/routes/helpdeskRoutes.ts:992 | PARTIAL,MISSING_RBAC,MISSING_ZOD,MISSING_AUDIT,MISSING_TRANSACTION |
| wired:post:/api/helpdesk/room/:slug/status | ui | support | create | server/routes/helpdeskRoutes.ts:359 | PARTIAL,MISSING_RBAC,MISSING_ZOD,MISSING_AUDIT,MISSING_TRANSACTION |
| wired:post:/api/support/create-ticket | ui | support | create | server/routes/supportRoutes.ts:62 | PARTIAL,MISSING_RBAC,MISSING_AUDIT |
| wired:post:/api/enterprise/public/offer/:offerId/accept | ui | auth | create | server/routes/enterpriseOnboardingRoutes.ts:118 | PARTIAL,MISSING_RBAC,MISSING_ZOD,MISSING_AUDIT |
| wired:post:/api/enterprise/public/offer/:offerId/decline | ui | auth | create | server/routes/enterpriseOnboardingRoutes.ts:160 | PARTIAL,MISSING_RBAC,MISSING_ZOD,MISSING_AUDIT |
| wired:post:/api/analytics/bi/scheduled-report | ui | scheduling | create | server/routes/biAnalyticsRoutes.ts:512 | PARTIAL,MISSING_RBAC,MISSING_ZOD |
| wired:post:/api/admin/breach-response/incidents | ui | admin | create | server/routes/adminRoutes.ts:2301 | PARTIAL,MISSING_RBAC,MISSING_TRANSACTION |
| wired:post:/api/clients/portal/setup/:token | ui | other | create | server/routes/clientPortalInviteRoutes.ts:95 | PARTIAL,MISSING_RBAC,MISSING_ZOD |
| wired:patch:/api/auth/profile | ui | auth | update | server/routes/authRoutes.ts:294 | PARTIAL,MISSING_RBAC,MISSING_ZOD,MISSING_AUDIT,DUPLICATE_ACTION |
| wired:post:/api/client-signup | ui | clients | create | server/routes/miscRoutes.ts:1560 | PARTIAL,MISSING_RBAC,MISSING_AUDIT |
| wired:post:/api/contact | ui | other | create | server/routes/miscRoutes.ts:901 | PARTIAL,MISSING_RBAC,MISSING_AUDIT |
| wired:post:/api/onboarding/create-org/progress | ui | auth | create | server/routes/onboardingInlineRoutes.ts:129 | PARTIAL,MISSING_RBAC,MISSING_ZOD,MISSING_AUDIT,MISSING_TRANSACTION |
| wired:delete:/api/onboarding/create-org/progress | ui | auth | delete | server/routes/onboardingInlineRoutes.ts:152 | PARTIAL,MISSING_RBAC,MISSING_ZOD,MISSING_AUDIT,MISSING_TRANSACTION |
| wired:post:/api/dev/quick-login | ui | auth | create | server/routes.ts:495 | PARTIAL,MISSING_RBAC,MISSING_ZOD,DUPLICATE_ACTION |
| wired:post:/api/admin/unlock-user | ui | admin | create | server/routes/adminRoutes.ts:2020 | PARTIAL,MISSING_RBAC,MISSING_TRANSACTION |
| wired:post:/api/admin/reset-password | ui | auth | create | server/routes/adminRoutes.ts:2036 | PARTIAL,MISSING_RBAC,MISSING_TRANSACTION |
| wired:post:/api/sales/rfps/:id/generate | ui | sales | generate | server/routes/salesInlineRoutes.ts:536 | PARTIAL,MISSING_RBAC,MISSING_AUDIT |
| wired:post:/api/onboarding/plaid/link-token | ui | auth | create | server/routes/publicOnboardingRoutes.ts:1075 | PARTIAL,MISSING_RBAC |
| wired:post:/api/onboarding/plaid/exchange | ui | auth | create | server/routes/publicOnboardingRoutes.ts:1100 | PARTIAL,MISSING_RBAC |
| wired:post:/api/onboarding/invite/:token/opened | ui | auth | create | server/routes/publicOnboardingRoutes.ts:43 | PARTIAL,MISSING_RBAC |
| wired:post:/api/onboarding/application | ui | auth | create | server/routes/onboardingInlineRoutes.ts:50 | PARTIAL,MISSING_RBAC,MISSING_ZOD,MISSING_AUDIT,MISSING_TRANSACTION |
| wired:patch:/api/onboarding/application/:id | ui | auth | update | server/routes/publicOnboardingRoutes.ts:175 | PARTIAL,MISSING_RBAC |
| wired:post:/api/onboarding/contracts/:contractId/sign | ui | auth | create | server/routes/publicOnboardingRoutes.ts:409 | PARTIAL,MISSING_RBAC |
| wired:post:/api/onboarding/submit/:applicationId | ui | auth | create | server/routes/publicOnboardingRoutes.ts:471 | PARTIAL,MISSING_RBAC |
| wired:post:/api/onboarding/certifications | ui | auth | create | server/routes/onboardingInlineRoutes.ts:102 | PARTIAL,MISSING_RBAC,MISSING_ZOD,MISSING_AUDIT,MISSING_TRANSACTION |

## Mutating actions missing Zod

| actionId | sourceType | domain | mutation | where | flags |
| --- | --- | --- | --- | --- | --- |
| wired:post:/api/chat/manage/messages/:id/reactions | ui | chat | create | server/routes/chat-management.ts:1334 | PARTIAL,MISSING_ZOD,MISSING_AUDIT,MISSING_TRANSACTION,DUPLICATE_ACTION |
| wired:post:/api/promotional-banners/ | ui | other | create | server/routes/promotionalBannerRoutes.ts:60 | PARTIAL,MISSING_ZOD,MISSING_AUDIT,DUPLICATE_ACTION |
| wired:patch:/api/promotional-banners/:id | ui | other | update | server/routes/promotionalBannerRoutes.ts:115 | PARTIAL,MISSING_ZOD,MISSING_AUDIT,DUPLICATE_ACTION |
| wired:delete:/api/promotional-banners/:id | ui | other | delete | server/routes/promotionalBannerRoutes.ts:161 | PARTIAL,MISSING_ZOD,MISSING_AUDIT,DUPLICATE_ACTION |
| wired:post:/api/helpdesk/motd/acknowledge | ui | support | create | server/routes/helpdeskRoutes.ts:992 | PARTIAL,MISSING_RBAC,MISSING_ZOD,MISSING_AUDIT,MISSING_TRANSACTION |
| wired:post:/api/helpdesk/room/:slug/status | ui | support | create | server/routes/helpdeskRoutes.ts:359 | PARTIAL,MISSING_RBAC,MISSING_ZOD,MISSING_AUDIT,MISSING_TRANSACTION |
| wired:post:/api/chat/rooms/:roomId/close | ui | chat | create | server/routes/chat-rooms.ts:2280 | PARTIAL,MISSING_ZOD,MISSING_AUDIT |
| wired:post:/api/chat/rooms/:roomId/reopen | ui | chat | create | server/routes/chat-rooms.ts:2367 | PARTIAL,MISSING_ZOD,MISSING_AUDIT |
| wired:patch:/api/chat/manage/messages/:id/edit | ui | chat | update | server/routes/chat-management.ts:1504 | PARTIAL,MISSING_ZOD,MISSING_AUDIT,MISSING_TRANSACTION,DUPLICATE_ACTION |
| wired:post:/api/chat/manage/messages/:id/pin | ui | chat | create | server/routes/chat-management.ts:1692 | PARTIAL,MISSING_ZOD,MISSING_AUDIT,MISSING_TRANSACTION,DUPLICATE_ACTION |
| wired:post:/api/chat/manage/messages/:id/forward | ui | chat | create | server/routes/chat-management.ts:1561 | PARTIAL,MISSING_ZOD,MISSING_AUDIT,MISSING_TRANSACTION,DUPLICATE_ACTION |
| wired:post:/api/enterprise/public/offer/:offerId/accept | ui | auth | create | server/routes/enterpriseOnboardingRoutes.ts:118 | PARTIAL,MISSING_RBAC,MISSING_ZOD,MISSING_AUDIT |
| wired:post:/api/enterprise/public/offer/:offerId/decline | ui | auth | create | server/routes/enterpriseOnboardingRoutes.ts:160 | PARTIAL,MISSING_RBAC,MISSING_ZOD,MISSING_AUDIT |
| wired:post:/api/trinity/org-state/:workspaceId/refresh | ui | other | create | server/routes/trinityOrgStateRoutes.ts:78 | PARTIAL,MISSING_ZOD,MISSING_AUDIT |
| wired:patch:/api/admin/permissions/workspaces/:wsId/matrix | ui | admin | update | server/routes/adminPermissionRoutes.ts:92 | PARTIAL,MISSING_ZOD |
| wired:delete:/api/admin/permissions/workspaces/:wsId/matrix | ui | admin | delete | server/routes/adminPermissionRoutes.ts:143 | PARTIAL,MISSING_ZOD |
| wired:patch:/api/admin/permissions/workspaces/:wsId/users/:userId/role | ui | admin | update | server/routes/adminPermissionRoutes.ts:220 | PARTIAL,MISSING_ZOD |
| wired:post:/api/agent-activity/escalations/:taskId/approve | ui | other | approve | server/routes/agentActivityRoutes.ts:264 | PARTIAL,MISSING_ZOD,MISSING_AUDIT,MISSING_TRANSACTION |
| wired:post:/api/agent-activity/escalations/:taskId/dismiss | ui | other | create | server/routes/agentActivityRoutes.ts:296 | PARTIAL,MISSING_ZOD,MISSING_AUDIT,MISSING_TRANSACTION |
| wired:post:/api/agent-activity/escalations/:taskId/retask | ui | other | create | server/routes/agentActivityRoutes.ts:328 | PARTIAL,MISSING_ZOD,MISSING_AUDIT,MISSING_TRANSACTION |
| wired:patch:/api/agent-activity/registry/:agentKey/toggle | ui | other | update | server/routes/agentActivityRoutes.ts:458 | PARTIAL,MISSING_ZOD,MISSING_AUDIT,MISSING_TRANSACTION |
| wired:post:/api/integrations/connections | ui | other | create | server/routes/integrationsInlineRoutes.ts:90 | PARTIAL,MISSING_ZOD,MISSING_AUDIT,MISSING_TRANSACTION |
| wired:post:/api/integrations/api-keys | ui | other | create | server/routes/integrationsInlineRoutes.ts:201 | PARTIAL,MISSING_ZOD,MISSING_AUDIT,MISSING_TRANSACTION |
| wired:post:/api/integrations/webhooks | ui | webhooks | create | server/routes/integrationsInlineRoutes.ts:286 | PARTIAL,MISSING_ZOD,MISSING_AUDIT,MISSING_TRANSACTION |
| wired:delete:/api/integrations/connections/:id | ui | other | delete | server/routes/integrationsInlineRoutes.ts:145 | PARTIAL,MISSING_ZOD,MISSING_AUDIT,MISSING_TRANSACTION |

## Mutating actions missing workspace scope

| actionId | sourceType | domain | mutation | where | flags |
| --- | --- | --- | --- | --- | --- |
| wired:post:/api/ethics/report | ui | sales | create | server/routes/domains/sales.ts:23 | PARTIAL,MISSING_RBAC,MISSING_ZOD,MISSING_WORKSPACE_SCOPE,MISSING_AUDIT |
| wired:post:/api/admin/financial/provider-topoff | ui | admin | create | server/routes/financialAdminRoutes.ts:170 | PARTIAL,MISSING_WORKSPACE_SCOPE,MISSING_AUDIT |
| api:post:/api/admin/dev-execute | api | admin | create | server/routes/adminDevExecuteRoute.ts:92 | BACKEND_ONLY,MISSING_RBAC,MISSING_ZOD,MISSING_WORKSPACE_SCOPE,MISSING_AUDIT,DUPLICATE_ACTION |
| api:post:/api/bootstrap/dev-seed | api | other | create | server/routes/bootstrapRoutes.ts:16 | BACKEND_ONLY,MISSING_RBAC,MISSING_ZOD,MISSING_WORKSPACE_SCOPE,MISSING_AUDIT |
| api:post:/api/code-editor/stage | api | other | create | server/routes/code-editor.ts:48 | BACKEND_ONLY,MISSING_WORKSPACE_SCOPE,MISSING_AUDIT |
| api:post:/api/code-editor/stage-batch | api | other | create | server/routes/code-editor.ts:71 | BACKEND_ONLY,MISSING_WORKSPACE_SCOPE,MISSING_AUDIT |
| api:post:/api/code-editor/change/:id/approve | api | other | approve | server/routes/code-editor.ts:124 | BACKEND_ONLY,MISSING_WORKSPACE_SCOPE,MISSING_AUDIT |
| api:post:/api/code-editor/change/:id/reject | api | other | reject | server/routes/code-editor.ts:147 | BACKEND_ONLY,MISSING_WORKSPACE_SCOPE,MISSING_AUDIT |
| api:post:/api/code-editor/change/:id/apply | api | other | create | server/routes/code-editor.ts:170 | BACKEND_ONLY,MISSING_WORKSPACE_SCOPE,MISSING_AUDIT |
| api:post:/api/code-editor/change/:id/rollback | api | other | create | server/routes/code-editor.ts:198 | BACKEND_ONLY,MISSING_WORKSPACE_SCOPE,MISSING_AUDIT |
| api:post:/api/code-editor/ai-request | api | other | create | server/routes/code-editor.ts:250 | BACKEND_ONLY,MISSING_WORKSPACE_SCOPE,MISSING_AUDIT |
| api:post:/api/admin/database-parity/auto-fix | api | other | create | server/routes/database-parity.ts:102 | BACKEND_ONLY,MISSING_ZOD,MISSING_WORKSPACE_SCOPE,MISSING_AUDIT |
| api:post:/api/admin/database-parity/quick-fix | api | other | create | server/routes/database-parity.ts:160 | BACKEND_ONLY,MISSING_ZOD,MISSING_WORKSPACE_SCOPE,MISSING_AUDIT |
| api:post:/api/admin/database-parity/scan-and-fix | api | other | create | server/routes/database-parity.ts:192 | BACKEND_ONLY,MISSING_ZOD,MISSING_WORKSPACE_SCOPE,MISSING_AUDIT |
| api:post:/api/device/profile | api | other | create | server/routes/deviceLoaderRoutes.ts:58 | BACKEND_ONLY,MISSING_RBAC,MISSING_WORKSPACE_SCOPE,MISSING_AUDIT |
| api:delete:/api/device/cache | api | other | delete | server/routes/deviceLoaderRoutes.ts:112 | BACKEND_ONLY,MISSING_RBAC,MISSING_WORKSPACE_SCOPE,MISSING_AUDIT |
| api:post:/api/email/unsubscribe | api | email | create | server/routes/emailUnsubscribe.ts:102 | BACKEND_ONLY,MISSING_RBAC,MISSING_WORKSPACE_SCOPE,MISSING_AUDIT |
| api:put:/api/email/unsubscribe/preferences | api | email | update | server/routes/emailUnsubscribe.ts:246 | BACKEND_ONLY,MISSING_RBAC,MISSING_WORKSPACE_SCOPE,MISSING_AUDIT |
| api:post:/api/email/resubscribe | api | email | create | server/routes/emailUnsubscribe.ts:336 | BACKEND_ONLY,MISSING_RBAC,MISSING_WORKSPACE_SCOPE,MISSING_AUDIT |
| api:patch:/api/admin/financial/provider-budgets/:provider | api | admin | update | server/routes/financialAdminRoutes.ts:122 | BACKEND_ONLY,MISSING_WORKSPACE_SCOPE,MISSING_AUDIT |
| api:post:/api/maintenance/activate | api | other | create | server/routes/maintenanceRoutes.ts:106 | BACKEND_ONLY,MISSING_WORKSPACE_SCOPE,MISSING_AUDIT |
| api:post:/api/maintenance/activate-trinity | api | trinity | create | server/routes/maintenanceRoutes.ts:132 | BACKEND_ONLY,MISSING_RBAC,MISSING_WORKSPACE_SCOPE,MISSING_AUDIT |
| api:post:/api/maintenance/deactivate | api | other | create | server/routes/maintenanceRoutes.ts:155 | BACKEND_ONLY,MISSING_WORKSPACE_SCOPE,MISSING_AUDIT |
| api:post:/api/maintenance/progress | api | other | create | server/routes/maintenanceRoutes.ts:177 | BACKEND_ONLY,MISSING_WORKSPACE_SCOPE,MISSING_AUDIT |
| api:post:/api/maintenance/orchestrator/trigger | api | other | create | server/routes/maintenanceRoutes.ts:209 | BACKEND_ONLY,MISSING_RBAC,MISSING_WORKSPACE_SCOPE,MISSING_AUDIT |

## Mutating actions missing audit log

| actionId | sourceType | domain | mutation | where | flags |
| --- | --- | --- | --- | --- | --- |
| wired:post:/api/chat/manage/messages/:id/reactions | ui | chat | create | server/routes/chat-management.ts:1334 | PARTIAL,MISSING_ZOD,MISSING_AUDIT,MISSING_TRANSACTION,DUPLICATE_ACTION |
| wired:post:/api/promotional-banners/ | ui | other | create | server/routes/promotionalBannerRoutes.ts:60 | PARTIAL,MISSING_ZOD,MISSING_AUDIT,DUPLICATE_ACTION |
| wired:patch:/api/promotional-banners/:id | ui | other | update | server/routes/promotionalBannerRoutes.ts:115 | PARTIAL,MISSING_ZOD,MISSING_AUDIT,DUPLICATE_ACTION |
| wired:delete:/api/promotional-banners/:id | ui | other | delete | server/routes/promotionalBannerRoutes.ts:161 | PARTIAL,MISSING_ZOD,MISSING_AUDIT,DUPLICATE_ACTION |
| wired:post:/api/helpdesk/motd/acknowledge | ui | support | create | server/routes/helpdeskRoutes.ts:992 | PARTIAL,MISSING_RBAC,MISSING_ZOD,MISSING_AUDIT,MISSING_TRANSACTION |
| wired:post:/api/helpdesk/room/:slug/status | ui | support | create | server/routes/helpdeskRoutes.ts:359 | PARTIAL,MISSING_RBAC,MISSING_ZOD,MISSING_AUDIT,MISSING_TRANSACTION |
| wired:post:/api/chat/rooms/:roomId/close | ui | chat | create | server/routes/chat-rooms.ts:2280 | PARTIAL,MISSING_ZOD,MISSING_AUDIT |
| wired:post:/api/chat/rooms/:roomId/reopen | ui | chat | create | server/routes/chat-rooms.ts:2367 | PARTIAL,MISSING_ZOD,MISSING_AUDIT |
| wired:patch:/api/chat/manage/messages/:id/edit | ui | chat | update | server/routes/chat-management.ts:1504 | PARTIAL,MISSING_ZOD,MISSING_AUDIT,MISSING_TRANSACTION,DUPLICATE_ACTION |
| wired:post:/api/chat/manage/messages/:id/pin | ui | chat | create | server/routes/chat-management.ts:1692 | PARTIAL,MISSING_ZOD,MISSING_AUDIT,MISSING_TRANSACTION,DUPLICATE_ACTION |
| wired:post:/api/chat/manage/messages/:id/forward | ui | chat | create | server/routes/chat-management.ts:1561 | PARTIAL,MISSING_ZOD,MISSING_AUDIT,MISSING_TRANSACTION,DUPLICATE_ACTION |
| wired:post:/api/support/create-ticket | ui | support | create | server/routes/supportRoutes.ts:62 | PARTIAL,MISSING_RBAC,MISSING_AUDIT |
| wired:post:/api/enterprise/public/offer/:offerId/accept | ui | auth | create | server/routes/enterpriseOnboardingRoutes.ts:118 | PARTIAL,MISSING_RBAC,MISSING_ZOD,MISSING_AUDIT |
| wired:post:/api/enterprise/public/offer/:offerId/decline | ui | auth | create | server/routes/enterpriseOnboardingRoutes.ts:160 | PARTIAL,MISSING_RBAC,MISSING_ZOD,MISSING_AUDIT |
| wired:post:/api/support/actions/execute | ui | support | create | server/routes/supportActionRoutes.ts:309 | PARTIAL,MISSING_AUDIT,DUPLICATE_ACTION |
| wired:post:/api/trinity/org-state/:workspaceId/refresh | ui | other | create | server/routes/trinityOrgStateRoutes.ts:78 | PARTIAL,MISSING_ZOD,MISSING_AUDIT |
| wired:post:/api/ai/audit-logs/:id/review | ui | audit | create | server/routes/aiRoutes.ts:344 | PARTIAL,MISSING_AUDIT |
| wired:post:/api/agent-activity/escalations/:taskId/approve | ui | other | approve | server/routes/agentActivityRoutes.ts:264 | PARTIAL,MISSING_ZOD,MISSING_AUDIT,MISSING_TRANSACTION |
| wired:post:/api/agent-activity/escalations/:taskId/dismiss | ui | other | create | server/routes/agentActivityRoutes.ts:296 | PARTIAL,MISSING_ZOD,MISSING_AUDIT,MISSING_TRANSACTION |
| wired:post:/api/agent-activity/escalations/:taskId/retask | ui | other | create | server/routes/agentActivityRoutes.ts:328 | PARTIAL,MISSING_ZOD,MISSING_AUDIT,MISSING_TRANSACTION |
| wired:patch:/api/agent-activity/registry/:agentKey/toggle | ui | other | update | server/routes/agentActivityRoutes.ts:458 | PARTIAL,MISSING_ZOD,MISSING_AUDIT,MISSING_TRANSACTION |
| wired:post:/api/integrations/connections | ui | other | create | server/routes/integrationsInlineRoutes.ts:90 | PARTIAL,MISSING_ZOD,MISSING_AUDIT,MISSING_TRANSACTION |
| wired:post:/api/integrations/api-keys | ui | other | create | server/routes/integrationsInlineRoutes.ts:201 | PARTIAL,MISSING_ZOD,MISSING_AUDIT,MISSING_TRANSACTION |
| wired:post:/api/integrations/webhooks | ui | webhooks | create | server/routes/integrationsInlineRoutes.ts:286 | PARTIAL,MISSING_ZOD,MISSING_AUDIT,MISSING_TRANSACTION |
| wired:delete:/api/integrations/connections/:id | ui | other | delete | server/routes/integrationsInlineRoutes.ts:145 | PARTIAL,MISSING_ZOD,MISSING_AUDIT,MISSING_TRANSACTION |

## DB mutations outside transaction (multi-write routes)

| actionId | sourceType | domain | mutation | where | flags |
| --- | --- | --- | --- | --- | --- |
| wired:post:/api/chat/manage/messages/:id/reactions | ui | chat | create | server/routes/chat-management.ts:1334 | PARTIAL,MISSING_ZOD,MISSING_AUDIT,MISSING_TRANSACTION,DUPLICATE_ACTION |
| wired:post:/api/helpdesk/motd/acknowledge | ui | support | create | server/routes/helpdeskRoutes.ts:992 | PARTIAL,MISSING_RBAC,MISSING_ZOD,MISSING_AUDIT,MISSING_TRANSACTION |
| wired:post:/api/helpdesk/room/:slug/status | ui | support | create | server/routes/helpdeskRoutes.ts:359 | PARTIAL,MISSING_RBAC,MISSING_ZOD,MISSING_AUDIT,MISSING_TRANSACTION |
| wired:patch:/api/chat/manage/messages/:id/edit | ui | chat | update | server/routes/chat-management.ts:1504 | PARTIAL,MISSING_ZOD,MISSING_AUDIT,MISSING_TRANSACTION,DUPLICATE_ACTION |
| wired:post:/api/chat/manage/messages/:id/pin | ui | chat | create | server/routes/chat-management.ts:1692 | PARTIAL,MISSING_ZOD,MISSING_AUDIT,MISSING_TRANSACTION,DUPLICATE_ACTION |
| wired:post:/api/chat/manage/messages/:id/forward | ui | chat | create | server/routes/chat-management.ts:1561 | PARTIAL,MISSING_ZOD,MISSING_AUDIT,MISSING_TRANSACTION,DUPLICATE_ACTION |
| wired:post:/api/form-builder/forms/:formId/submissions/:submissionId/approve | ui | other | approve | server/routes/formBuilderRoutes.ts:620 | PARTIAL,MISSING_TRANSACTION |
| wired:patch:/api/form-builder/submissions/:id | ui | other | update | server/routes/formBuilderRoutes.ts:418 | PARTIAL,MISSING_TRANSACTION |
| wired:post:/api/form-builder/forms | ui | other | create | server/routes/formBuilderRoutes.ts:128 | PARTIAL,MISSING_TRANSACTION |
| wired:patch:/api/form-builder/forms/:id | ui | other | update | server/routes/formBuilderRoutes.ts:156 | PARTIAL,MISSING_TRANSACTION |
| wired:delete:/api/form-builder/forms/:id | ui | other | delete | server/routes/formBuilderRoutes.ts:214 | PARTIAL,MISSING_TRANSACTION |
| wired:post:/api/agent-activity/escalations/:taskId/approve | ui | other | approve | server/routes/agentActivityRoutes.ts:264 | PARTIAL,MISSING_ZOD,MISSING_AUDIT,MISSING_TRANSACTION |
| wired:post:/api/agent-activity/escalations/:taskId/dismiss | ui | other | create | server/routes/agentActivityRoutes.ts:296 | PARTIAL,MISSING_ZOD,MISSING_AUDIT,MISSING_TRANSACTION |
| wired:post:/api/agent-activity/escalations/:taskId/retask | ui | other | create | server/routes/agentActivityRoutes.ts:328 | PARTIAL,MISSING_ZOD,MISSING_AUDIT,MISSING_TRANSACTION |
| wired:patch:/api/agent-activity/registry/:agentKey/toggle | ui | other | update | server/routes/agentActivityRoutes.ts:458 | PARTIAL,MISSING_ZOD,MISSING_AUDIT,MISSING_TRANSACTION |
| wired:post:/api/integrations/connections | ui | other | create | server/routes/integrationsInlineRoutes.ts:90 | PARTIAL,MISSING_ZOD,MISSING_AUDIT,MISSING_TRANSACTION |
| wired:post:/api/integrations/api-keys | ui | other | create | server/routes/integrationsInlineRoutes.ts:201 | PARTIAL,MISSING_ZOD,MISSING_AUDIT,MISSING_TRANSACTION |
| wired:post:/api/integrations/webhooks | ui | webhooks | create | server/routes/integrationsInlineRoutes.ts:286 | PARTIAL,MISSING_ZOD,MISSING_AUDIT,MISSING_TRANSACTION |
| wired:delete:/api/integrations/connections/:id | ui | other | delete | server/routes/integrationsInlineRoutes.ts:145 | PARTIAL,MISSING_ZOD,MISSING_AUDIT,MISSING_TRANSACTION |
| wired:post:/api/admin/breach-response/incidents | ui | admin | create | server/routes/adminRoutes.ts:2301 | PARTIAL,MISSING_RBAC,MISSING_TRANSACTION |
| wired:post:/api/recruitment/candidates/:id/screen | ui | other | create | server/routes/recruitmentRoutes.ts:157 | PARTIAL,MISSING_AUDIT,MISSING_TRANSACTION,DUPLICATE_ACTION |
| wired:post:/api/recruitment/candidates/:id/send-questions | ui | other | send | server/routes/recruitmentRoutes.ts:202 | PARTIAL,MISSING_AUDIT,MISSING_TRANSACTION,DUPLICATE_ACTION |
| wired:post:/api/recruitment/candidates/:id/scorecard | ui | other | create | server/routes/recruitmentRoutes.ts:316 | PARTIAL,MISSING_AUDIT,MISSING_TRANSACTION,DUPLICATE_ACTION |
| wired:patch:/api/recruitment/candidates/:id/stage | ui | other | update | server/routes/recruitmentRoutes.ts:259 | PARTIAL,MISSING_AUDIT,MISSING_TRANSACTION,DUPLICATE_ACTION |
| wired:patch:/api/recruitment/candidates/:id/decision | ui | other | update | server/routes/recruitmentRoutes.ts:280 | PARTIAL,MISSING_AUDIT,MISSING_TRANSACTION,DUPLICATE_ACTION |

## Duplicate actionIds

| actionId | count | locations |
| --- | --- | --- |
| ui\|wired:post:/api/chat/manage/messages/:id/reactions | 7 | server/routes/chat-management.ts:1334 / server/routes/chat-management.ts:1334 / server/routes/chat-management.ts:1334 / server/routes/chat-management.ts:1334 / server/routes/chat-management.ts:1334 / server/routes/chat-management.ts:1334 / server/routes/chat-management.ts:1334 |
| ui\|wired:post:/api/promotional-banners/ | 2 | server/routes/promotionalBannerRoutes.ts:60 / server/routes/promotionalBannerRoutes.ts:60 |
| ui\|wired:patch:/api/promotional-banners/:id | 2 | server/routes/promotionalBannerRoutes.ts:115 / server/routes/promotionalBannerRoutes.ts:115 |
| ui\|wired:delete:/api/promotional-banners/:id | 2 | server/routes/promotionalBannerRoutes.ts:161 / server/routes/promotionalBannerRoutes.ts:161 |
| ui\|wired:patch:/api/chat/manage/messages/:id/edit | 2 | server/routes/chat-management.ts:1504 / server/routes/chat-management.ts:1504 |
| ui\|wired:post:/api/chat/manage/messages/:id/pin | 2 | server/routes/chat-management.ts:1692 / server/routes/chat-management.ts:1692 |
| ui\|wired:post:/api/chat/manage/messages/:id/forward | 2 | server/routes/chat-management.ts:1561 / server/routes/chat-management.ts:1561 |
| ui\|ui:post:/api/helpai/session/start | 2 | client/src/pages/HelpDesk.tsx / client/src/pages/help.tsx |
| ui\|ui:get:/api/helpdesk/user-context | 2 | client/src/pages/HelpDesk.tsx / client/src/components/user-diagnostics-panel.tsx |
| ui\|ui:get:/api/chat/manage/conversations | 4 | client/src/pages/HelpDesk.tsx / client/src/pages/HelpDesk.tsx / client/src/components/chatdock/ChatDock.tsx / client/src/components/chatdock/ChatDock.tsx |
| ui\|wired:get:/api/chat/manage/conversations/:id/search | 2 | server/routes/chat-management.ts:1642 / server/routes/chat-management.ts:1642 |
| ui\|ui:post:/api/integrations/connection-request | 2 | client/src/pages/accounting-integrations.tsx / client/src/pages/accounting-integrations.tsx |
| ui\|wired:get:/api/support/escalated | 2 | server/routes/supportRoutes.ts:522 / server/routes/supportRoutes.ts:522 |
| ui\|wired:get:/api/support/priority-queue | 3 | server/routes/supportRoutes.ts:543 / server/routes/supportRoutes.ts:543 / server/routes/supportRoutes.ts:543 |
| ui\|wired:get:/api/admin/workspaces/:id/details | 2 | server/routes/adminWorkspaceDetailsRoutes.ts:23 / server/routes/adminWorkspaceDetailsRoutes.ts:23 |
| ui\|wired:post:/api/support/actions/execute | 2 | server/routes/supportActionRoutes.ts:309 / server/routes/supportActionRoutes.ts:309 |
| ui\|ui:get:/api/admin/workspaces | 2 | client/src/pages/admin/support-console-workspace.tsx / client/src/pages/admin/support-console.tsx |
| ui\|wired:get:/api/support/actions/registry | 2 | server/routes/supportActionRoutes.ts:345 / server/routes/supportActionRoutes.ts:345 |
| ui\|wired:get:/api/admin/search | 2 | server/routes/adminWorkspaceDetailsRoutes.ts:146 / server/routes/adminWorkspaceDetailsRoutes.ts:146 |
| ui\|wired:get:/api/form-builder/forms | 2 | server/routes/formBuilderRoutes.ts:66 / server/routes/formBuilderRoutes.ts:66 |
| ui\|wired:get:/api/admin/permissions/workspaces | 4 | server/routes/adminPermissionRoutes.ts:41 / server/routes/adminPermissionRoutes.ts:41 / server/routes/adminPermissionRoutes.ts:41 / server/routes/adminPermissionRoutes.ts:41 |
| ui\|ui:get:/api/usage/tokens | 3 | client/src/pages/admin-usage.tsx / client/src/pages/usage-dashboard.tsx / client/src/hooks/use-token-monitor.ts |
| ui\|ui:get:/api/usage/token-breakdown | 2 | client/src/pages/admin-usage.tsx / client/src/pages/usage-dashboard.tsx |
| ui\|ui:get:/api/usage/token-log | 2 | client/src/pages/admin-usage.tsx / client/src/pages/usage-dashboard.tsx |
| ui\|wired:get:/api/integrations/connections | 3 | server/routes/integrationsInlineRoutes.ts:73 / server/routes/integrationsInlineRoutes.ts:73 / server/routes/integrationsInlineRoutes.ts:73 |
| ui\|wired:get:/api/trinity/ai-usage/summary | 2 | server/routes/trinityInsightsRoutes.ts:1095 / server/routes/trinityInsightsRoutes.ts:1095 |
| ui\|wired:put:/api/alerts/config/:alertType | 2 | server/routes/commInlineRoutes.ts:48 / server/routes/commInlineRoutes.ts:48 |
| ui\|wired:patch:/api/alerts/config/:alertType/toggle | 2 | server/routes/commInlineRoutes.ts:78 / server/routes/commInlineRoutes.ts:78 |
| ui\|wired:post:/api/alerts/:id/acknowledge | 2 | server/routes/commInlineRoutes.ts:147 / server/routes/commInlineRoutes.ts:147 |
| ui\|wired:post:/api/alerts/test | 2 | server/routes/commInlineRoutes.ts:206 / server/routes/commInlineRoutes.ts:206 |
| ui\|wired:get:/api/alerts/config | 2 | server/routes/commInlineRoutes.ts:12 / server/routes/commInlineRoutes.ts:12 |
| ui\|wired:get:/api/alerts/history | 2 | server/routes/commInlineRoutes.ts:105 / server/routes/commInlineRoutes.ts:105 |
| ui\|ui:get:/api/enterprise-features/api-keys | 2 | client/src/pages/api-access.tsx / client/src/pages/api-access.tsx |
| ui\|wired:get:/api/ats/applicants | 2 | server/routes/atsRoutes.ts:132 / server/routes/atsRoutes.ts:132 |
| ui\|ui:get:/api/audit-suite/visual-compliance/slots | 2 | client/src/pages/applicant-visual-compliance.tsx / client/src/pages/applicant-visual-compliance.tsx |
| ui\|ui:get:/api/audit-suite/visual-compliance | 2 | client/src/pages/applicant-visual-compliance.tsx / client/src/pages/applicant-visual-compliance.tsx |
| ui\|wired:get:/api/scheduleos/proposals | 2 | server/routes/scheduleosRoutes.ts:239 / server/routes/scheduleosRoutes.ts:239 |
| ui\|wired:get:/api/expenses/pending-approval | 3 | server/routes/expenseRoutes.ts:162 / server/routes/expenseRoutes.ts:162 / server/routes/expenseRoutes.ts:162 |
| ui\|wired:get:/api/employees/ | 29 | server/routes/employeeRoutes.ts:91 / server/routes/employeeRoutes.ts:91 / server/routes/employeeRoutes.ts:91 / server/routes/employeeRoutes.ts:91 / server/routes/employeeRoutes.ts:91 / server/routes/employeeRoutes.ts:91 / server/routes/employeeRoutes.ts:91 / server/routes/employeeRoutes.ts:91 / server/routes/employeeRoutes.ts:91 / server/routes/employeeRoutes.ts:91 / server/routes/employeeRoutes.ts:91 / server/routes/employeeRoutes.ts:91 / server/routes/employeeRoutes.ts:91 / server/routes/employeeRoutes.ts:91 / server/routes/employeeRoutes.ts:91 / server/routes/employeeRoutes.ts:91 / server/routes/employeeRoutes.ts:91 / server/routes/employeeRoutes.ts:91 / server/routes/employeeRoutes.ts:91 / server/routes/employeeRoutes.ts:91 / server/routes/employeeRoutes.ts:91 / server/routes/employeeRoutes.ts:91 / server/routes/employeeRoutes.ts:91 / server/routes/employeeRoutes.ts:91 / server/routes/employeeRoutes.ts:91 / server/routes/employeeRoutes.ts:91 / server/routes/employeeRoutes.ts:91 / server/routes/employeeRoutes.ts:91 / server/routes/employeeRoutes.ts:91 |
| ui\|ui:get:/api/audit-suite/audits/${auditId}/safe-status?workspaceId=${workspaceId} | 2 | client/src/pages/audit-chatdock.tsx / client/src/pages/auditor-verification-portal.tsx |
| ui\|ui:get:/api/audit-suite/audits | 4 | client/src/pages/audit-chatdock.tsx / client/src/pages/audit-chatdock.tsx / client/src/pages/auditor-verification-portal.tsx / client/src/pages/auditor-verification-portal.tsx |
| ui\|wired:get:/api/invoices/ | 5 | server/routes/invoiceRoutes.ts:785 / server/routes/invoiceRoutes.ts:785 / server/routes/invoiceRoutes.ts:785 / server/routes/invoiceRoutes.ts:785 / server/routes/invoiceRoutes.ts:785 |
| ui\|wired:get:/api/time-entries/ | 3 | server/routes/timeEntryRoutes.ts:76 / server/routes/timeEntryRoutes.ts:76 / server/routes/timeEntryRoutes.ts:76 |
| ui\|wired:get:/api/analytics/bi/financial-summary | 2 | server/routes/biAnalyticsRoutes.ts:373 / server/routes/biAnalyticsRoutes.ts:373 |
| ui\|wired:get:/api/analytics/bi/calloff-rates | 2 | server/routes/biAnalyticsRoutes.ts:66 / server/routes/biAnalyticsRoutes.ts:66 |
| ui\|wired:get:/api/analytics/bi/retention | 2 | server/routes/biAnalyticsRoutes.ts:241 / server/routes/biAnalyticsRoutes.ts:241 |
| ui\|wired:get:/api/analytics/bi/license-expiry | 2 | server/routes/biAnalyticsRoutes.ts:128 / server/routes/biAnalyticsRoutes.ts:128 |
| ui\|wired:get:/api/analytics/bi/client-health | 2 | server/routes/biAnalyticsRoutes.ts:193 / server/routes/biAnalyticsRoutes.ts:193 |
| ui\|wired:get:/api/analytics/bi/realtime | 2 | server/routes/biAnalyticsRoutes.ts:311 / server/routes/biAnalyticsRoutes.ts:311 |
| ui\|wired:get:/api/analytics/bi/scheduled-report | 2 | server/routes/biAnalyticsRoutes.ts:490 / server/routes/biAnalyticsRoutes.ts:490 |

## Trinity actionRegistry — actionIds detected

| actionId | registered | auditWrap | approvalGate | where |
| --- | --- | --- | --- | --- |
| services.get_status | true | true | true | server/services/ai-brain/actionRegistry.ts:285 |
| services.get_all_status | true | true | true | server/services/ai-brain/actionRegistry.ts:299 |
| services.restart | true | true | true | server/services/ai-brain/actionRegistry.ts:312 |
| features.get | true | true | true | server/services/ai-brain/actionRegistry.ts:363 |
| features.set | true | true | true | server/services/ai-brain/actionRegistry.ts:377 |
| features.list | true | true | true | server/services/ai-brain/actionRegistry.ts:424 |
| scheduling.create_shift | true | true | true | server/services/ai-brain/actionRegistry.ts:447 |
| scheduling.get_shifts | true | true | true | server/services/ai-brain/actionRegistry.ts:497 |
| scheduling.create_open_shift_fill | true | true | true | server/services/ai-brain/actionRegistry.ts:517 |
| scheduling.update_shift | true | true | true | server/services/ai-brain/actionRegistry.ts:732 |
| scheduling.delete_shift | true | true | true | server/services/ai-brain/actionRegistry.ts:822 |
| scheduling.cancel_shift | true | true | true | server/services/ai-brain/actionRegistry.ts:860 |
| scheduling.publish_shift | true | true | true | server/services/ai-brain/actionRegistry.ts:887 |
| scheduling.bulk_publish | true | true | true | server/services/ai-brain/actionRegistry.ts:954 |
| scheduling.reassign_shift | true | true | true | server/services/ai-brain/actionRegistry.ts:1053 |
| payroll.get_runs | true | true | true | server/services/ai-brain/actionRegistry.ts:1108 |
| employees.list | true | true | true | server/services/ai-brain/actionRegistry.ts:1133 |
| employees.get | true | true | true | server/services/ai-brain/actionRegistry.ts:1148 |
| employees.activate | true | true | true | server/services/ai-brain/actionRegistry.ts:1167 |
| employees.deactivate | true | true | true | server/services/ai-brain/actionRegistry.ts:1208 |
| employees.update | true | true | true | server/services/ai-brain/actionRegistry.ts:1249 |
| employees.create | true | true | true | server/services/ai-brain/actionRegistry.ts:1306 |
| employee.lifecycle.history | true | true | true | server/services/ai-brain/actionRegistry.ts:1381 |
| client.lifecycle.history | true | true | true | server/services/ai-brain/actionRegistry.ts:1403 |
| clients.list | true | true | true | server/services/ai-brain/actionRegistry.ts:1437 |
| clients.create | true | true | true | server/services/ai-brain/actionRegistry.ts:1454 |
| clients.create_portal_invite | true | true | true | server/services/ai-brain/actionRegistry.ts:1504 |
| scheduling.scan_open_shifts | true | true | true | server/services/ai-brain/actionRegistry.ts:1537 |
| scheduling.detect_demand_change | true | true | true | server/services/ai-brain/actionRegistry.ts:1588 |
| time_tracking.get_entries | true | true | true | server/services/ai-brain/actionRegistry.ts:1660 |
| time_tracking.edit_entry | true | true | true | server/services/ai-brain/actionRegistry.ts:1680 |
| notify.send | true | true | true | server/services/ai-brain/actionRegistry.ts:1755 |
| notify.manage | true | true | true | server/services/ai-brain/actionRegistry.ts:1815 |
| notify.stats | false | false | true | server/services/ai-brain/actionRegistry.ts:1878 |
| notify.mark_all_read | true | false | true | server/services/ai-brain/actionRegistry.ts:1895 |
| notify.delivery_stats | true | true | true | server/services/ai-brain/actionRegistry.ts:1900 |
| scheduling.fill_open_shift | true | true | true | server/services/ai-brain/actionRegistry.ts:1981 |
| payroll.approve_timesheet | true | true | true | server/services/ai-brain/actionRegistry.ts:2131 |
| billing.invoice_create | true | true | true | server/services/ai-brain/actionRegistry.ts:2212 |
| billing.invoice_send | true | false | true | server/services/ai-brain/actionRegistry.ts:2316 |
| time_tracking.clock_out_officer | true | true | true | server/services/ai-brain/actionRegistry.ts:2350 |
| compliance.escalate | true | true | true | server/services/ai-brain/actionRegistry.ts:2408 |
| billing.invoice_add_line_items | true | true | true | server/services/ai-brain/actionRegistry.ts:2481 |
| billing.invoice_update | true | true | true | server/services/ai-brain/actionRegistry.ts:2614 |
| billing.invoice_void | true | true | true | server/services/ai-brain/actionRegistry.ts:2659 |
| billing.invoice_cancel | true | true | true | server/services/ai-brain/actionRegistry.ts:2767 |
| billing.invoice_duplicate | true | true | true | server/services/ai-brain/actionRegistry.ts:2801 |
| billing.apply_payment | true | true | true | server/services/ai-brain/actionRegistry.ts:2866 |
| onboarding.get_checklist | true | false | true | server/services/ai-brain/actionRegistry.ts:2980 |
| onboarding.invite | true | true | true | server/services/ai-brain/actionRegistry.ts:2995 |
| onboarding.resend_invitation | true | false | true | server/services/ai-brain/actionRegistry.ts:3128 |
| onboarding.revoke_invitation | true | false | true | server/services/ai-brain/actionRegistry.ts:3173 |
| onboarding.send_client_welcome | true | false | true | server/services/ai-brain/actionRegistry.ts:3198 |
| platform_roles.assign | true | true | true | server/services/ai-brain/actionRegistry.ts:3223 |
| onboarding.get_platform_status | true | false | true | server/services/ai-brain/actionRegistry.ts:3271 |
| onboarding.gather_billing_preferences | true | false | true | server/services/ai-brain/actionRegistry.ts:3303 |
| employees.import | true | true | true | server/services/ai-brain/actionRegistry.ts:3386 |
| employees.export | true | true | true | server/services/ai-brain/actionRegistry.ts:3440 |
| integrations.get_status | true | true | true | server/services/ai-brain/actionRegistry.ts:3463 |
| integrations.list | true | true | true | server/services/ai-brain/actionRegistry.ts:3482 |
| strategic.generate_schedule | true | true | true | server/services/ai-brain/actionRegistry.ts:3510 |
| strategic.get_employee_metrics | true | true | true | server/services/ai-brain/actionRegistry.ts:3527 |
| strategic.get_client_metrics | true | true | true | server/services/ai-brain/actionRegistry.ts:3541 |
| strategic.get_context | true | true | true | server/services/ai-brain/actionRegistry.ts:3555 |
| strategic.calculate_shift_profit | true | true | true | server/services/ai-brain/actionRegistry.ts:3569 |
| strategic.get_at_risk_clients | true | true | true | server/services/ai-brain/actionRegistry.ts:3593 |
| strategic.get_top_performers | true | true | true | server/services/ai-brain/actionRegistry.ts:3608 |
| strategic.get_problematic_employees | true | true | true | server/services/ai-brain/actionRegistry.ts:3623 |
| contracts.get_stats | true | true | true | server/services/ai-brain/actionRegistry.ts:3653 |
| contracts.get_pending_signatures | true | true | true | server/services/ai-brain/actionRegistry.ts:3667 |
| contracts.get_expiring | true | true | true | server/services/ai-brain/actionRegistry.ts:3681 |
| contracts.get_usage | true | true | true | server/services/ai-brain/actionRegistry.ts:3698 |
| contracts.get_templates | true | true | true | server/services/ai-brain/actionRegistry.ts:3713 |
| contracts.search | true | true | true | server/services/ai-brain/actionRegistry.ts:3727 |
| contracts.get_audit_trail | true | true | true | server/services/ai-brain/actionRegistry.ts:3745 |
| memory.get_health | true | true | true | server/services/ai-brain/actionRegistry.ts:3777 |
| memory.optimize | true | true | true | server/services/ai-brain/actionRegistry.ts:3795 |
| memory.optimize_dry_run | true | true | true | server/services/ai-brain/actionRegistry.ts:3832 |
| memory.get_policies | true | true | true | server/services/ai-brain/actionRegistry.ts:3853 |
| memory.get_history | true | true | true | server/services/ai-brain/actionRegistry.ts:3871 |
| billing.settings | true | true | true | server/services/ai-brain/actionRegistry.ts:3901 |
| billing.set_workspace_settings | true | false | true | server/services/ai-brain/actionRegistry.ts:4079 |
| billing.get_client_settings | true | false | true | server/services/ai-brain/actionRegistry.ts:4103 |
| billing.set_client_settings | true | false | true | server/services/ai-brain/actionRegistry.ts:4135 |
| billing.list_client_settings | true | false | true | server/services/ai-brain/actionRegistry.ts:4178 |
| billing.learn_preference | true | false | true | server/services/ai-brain/actionRegistry.ts:4205 |
| workspace.tier.status | true | true | true | server/services/ai-brain/actionRegistry.ts:4267 |
| billing.invoice | true | true | true | server/services/ai-brain/actionRegistry.ts:4339 |
| billing.invoices_get | true | false | true | server/services/ai-brain/actionRegistry.ts:4383 |
| billing.invoice_summary | true | true | true | server/services/ai-brain/actionRegistry.ts:4407 |
| finance.stage_billing_run | true | true | true | server/services/ai-brain/actionRegistry.ts:4446 |
| finance.stage_payroll_batch | true | true | true | server/services/ai-brain/actionRegistry.ts:4472 |
| finance.finalize_financial_batch | true | true | true | server/services/ai-brain/actionRegistry.ts:4494 |
| finance.finalize_financial_batch | false | false | true | server/services/ai-brain/actionRegistry.ts:4505 |
| finance.generate_margin_report | true | true | true | server/services/ai-brain/actionRegistry.ts:4534 |
| time.auto_approve_by_variance | true | true | true | server/services/ai-brain/actionRegistry.ts:4557 |
| finance.add_payroll_adjustment | true | true | true | server/services/ai-brain/actionRegistry.ts:4580 |
| hr.initiate_disciplinary | true | true | true | server/services/ai-brain/actionRegistry.ts:4623 |
| scheduling.execute_autonomous | true | true | true | server/services/ai-brain/actionRegistry.ts:4732 |
| scheduling.get_autonomous_status | true | true | true | server/services/ai-brain/actionRegistry.ts:4773 |

_+ 320 more actionIds — see `action-wiring-manifest.json`._

## WebSocket events (sample)

| kind | event | where |
| --- | --- | --- |
| on | connection | server/websocket.ts:1395 |
| on | message | server/websocket.ts:7945 |
| on | pong | server/websocket.ts:7961 |
| on | close | server/websocket.ts:8032 |
| on | error | server/websocket.ts:8223 |
| on | trinity:stream | server/websocket.ts:8607 |
| on | trinity_scheduling_started | server/websocket.ts:8619 |
| on | trinity_scheduling_progress | server/websocket.ts:8629 |
| on | trinity_scheduling_completed | server/websocket.ts:8638 |
| on | support_session_resolved | server/websocket.ts:8650 |
| on | support_ticket_resolved | server/websocket.ts:8691 |
| on | RBAC_ROLE_CHANGED | server/websocket.ts:8720 |
| on | TRINITY_ACCESS_CHANGED | server/websocket.ts:8769 |
| on | officer_clocked_in | server/websocket.ts:8813 |
| on | officer_clocked_out | server/websocket.ts:8838 |
| on | dar_submitted | server/websocket.ts:8864 |
| on | dar_generated | server/websocket.ts:8876 |
| on | dar_verified | server/websocket.ts:8892 |
| on | dar_sent_to_client | server/websocket.ts:8903 |
| on | visitor_never_left | server/websocket.ts:8913 |
| on | trinity_thought | server/websocket.ts:8926 |
| emit | chat:participant_joined | server/websocket.ts:1983 |
| emit | chat:participant_left | server/websocket.ts:8175 |
| emit | emitUserJoinedRoom | server/websocket.ts:2017 |
| emit | emitSentimentAlert | server/websocket.ts:5936 |
| emit | emitMessagePosted | server/websocket.ts:6029 |
| emit | emitSupportEscalation | server/websocket.ts:6146 |
| emit | emitBatchedEvent | server/services/MessageBridgeService.ts:359 |
| emit | emitBatchedEvent | server/services/MessageBridgeService.ts:536 |
| emit | broadcast_acknowledged | server/services/broadcastService.ts:358 |
| emit | broadcast_feedback_received | server/services/broadcastService.ts:440 |
| emit | broadcast.created | server/routes/broadcasts.ts:230 |
| emit | broadcast.updated | server/routes/broadcasts.ts:414 |
| emit | broadcast.deleted | server/routes/broadcasts.ts:440 |

## Automation / cron entries (sample)

| kind | source | where |
| --- | --- | --- |
| cron | 0 6 * * * | server/services/autonomousScheduler.ts:2727 |
| cron | 30 4 * * * | server/services/autonomousScheduler.ts:2743 |
| cron | 0 10 * * * | server/services/autonomousScheduler.ts:2804 |
| cron | 0 9 * * * | server/services/autonomousScheduler.ts:2839 |
| cron | */15 * * * * | server/services/autonomousScheduler.ts:2879 |
| cron | * * * * * | server/services/autonomousScheduler.ts:2925 |
| cron | 0 7 * * 1-5 | server/services/autonomousScheduler.ts:2941 |
| cron | 0 7 * * * | server/services/autonomousScheduler.ts:3151 |
| cron | */10 * * * * | server/services/autonomousScheduler.ts:3169 |
| cron | */15 * * * * | server/services/autonomousScheduler.ts:3441 |
| cron | 0 */6 * * * | server/services/autonomousScheduler.ts:3494 |
| cron | 0 1 * * * | server/services/autonomousScheduler.ts:3510 |
| cron | 0 5 * * * | server/services/autonomousScheduler.ts:3526 |
| cron | 0 3 * * * | server/services/autonomousScheduler.ts:3578 |
| cron | 0 6 * * 1 | server/services/autonomousScheduler.ts:3651 |
| cron | 0 6 * * * | server/services/autonomousScheduler.ts:4096 |
| cron | 0 7 * * 1 | server/services/autonomousScheduler.ts:4111 |
| cron | 0 2 * * * | server/services/autonomousScheduler.ts:4153 |
| cron | 30 2 * * * | server/services/autonomousScheduler.ts:4174 |
| cron | 0 3 * * * | server/services/autonomousScheduler.ts:4198 |
| cron | 30 3 * * * | server/services/autonomousScheduler.ts:4222 |
| cron | 0 5 * * * | server/services/autonomousScheduler.ts:4243 |
| cron | 0 6 25 * * | server/services/autonomousScheduler.ts:4259 |
| cron | 0 20 * * * | server/services/autonomousScheduler.ts:4273 |
| cron | */15 * * * * | server/services/autonomousScheduler.ts:4289 |
| cron | */30 * * * * | server/services/autonomousScheduler.ts:4321 |
| cron | */5 * * * * | server/services/autonomousScheduler.ts:4397 |
| cron | */5 * * * * | server/services/autonomousScheduler.ts:4407 |
| cron | 0 0,2,4 * * * | server/services/autonomousScheduler.ts:4417 |
| cron | 0 * * * * | server/services/autonomousScheduler.ts:4426 |
| cron | 30 7 * * 1 | server/services/autonomousScheduler.ts:4435 |
| cron | */5 * * * * | server/services/autonomousScheduler.ts:4474 |
| cron | */5 * * * * | server/services/autonomousScheduler.ts:4497 |
| cron | */5 * * * * | server/services/autonomousScheduler.ts:4520 |
| cron | 0 6 * * * | server/services/autonomousScheduler.ts:4543 |
| cron | 0 6 1 1 * | server/services/autonomousScheduler.ts:4567 |
| cron | 0 7 * * * | server/services/autonomousScheduler.ts:4591 |
| cron | 0 * * * * | server/services/autonomousScheduler.ts:4614 |
| cron | 0 6 1 1 * | server/services/autonomousScheduler.ts:4662 |
| cron | 30 6 * * * | server/services/autonomousScheduler.ts:4699 |
| cron | 45 * * * * | server/services/ai-brain/autonomousFixPipeline.ts:1335 |
| cron | 45 * * * * | server/services/ai-brain/tools/autonomousFixPipeline.ts:1335 |
| cron | 0 2 * * * | server/services/notificationCleanupService.ts:157 |
| cron | 0 3 * * * | server/services/tokenCleanupService.ts:197 |

## Caveats

- Mount-path resolution uses an import-graph lookup. Routers mounted via dynamic dispatch or destructured re-exports may show `unknown` mount.
- Auth/RBAC detection scans only the literal middleware names listed in the generator. Custom guards must be added to `AUTH_MIDDLEWARE_NAMES`.
- Zod detection is per-file: a file with _any_ Zod parse passes the check. Per-route Zod proof requires AST.
- DB writes are extracted from `db.insert/update/delete` literals only. ORM helpers and raw SQL templates may be missed.
- Notification/audit/event emission is per-file presence, not per-route. Use the citations to confirm the call lives in the relevant handler.

## Next steps

1. Run `npx tsx scripts/audit/check-action-wiring-gaps.ts` for a focused gap report.
2. Walk the highest-risk lists in this file; verify each citation by hand.
3. For each PARTIAL/UI_ONLY/BACKEND_ONLY entry, decide: wire it, delete it, or document why it must remain partial.
4. Domain priority: Trinity Schedule → Trinity actions → ChatDock → Notifications → Employee/Client CRUD → Document Vault → Automation Workflows.

---
_This is not a dead-code audit. This is an **action truth audit**: what the platform says it can do vs. what is actually wired, guarded, executed, persisted, notified, and shown to the user._
