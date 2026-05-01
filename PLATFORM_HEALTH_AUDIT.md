# CoAIleague — Platform Health Audit (rescan)

> **Generated:** 2026-05-01T16:54:37.653Z
> **Generator:** `scripts/audit/scan-platform-health.ts`
> **Inputs:** `action-wiring-manifest.json` + filesystem rescan

## Method

Reuses the canonical route map from `action-wiring-manifest.json` to
avoid re-deriving what the wiring scan already established. Adds new
regex sweeps for route conflicts, mount overlaps, race-condition
patterns, Trinity-law violations (§A, §B, §F, §G, §I), and direct
provider-SDK calls that bypass NotificationDeliveryService.

Each finding carries a `file:line` citation. Where a regex cannot
prove a property the row is omitted, never silently green-lit.

## Counts by category

| Category | Count |
| --- | --- |
| race_missing_transaction | 391 |
| race_fire_and_forget | 168 |
| route_conflict | 114 |
| race_read_then_write_no_lock | 112 |
| trinity_law_raw_sql_no_workspace | 55 |
| mount_overlap | 42 |
| race_set_immediate | 30 |
| trinity_law_module_load_assert | 4 |
| trinity_law_hardcoded_workspace | 3 |

## Counts by severity

| Severity | Count |
| --- | --- |
| medium | 505 |
| high | 359 |
| blocker | 55 |

## TypeScript snapshot

- `tsc --noEmit` errors: **381**

Top 25 files by error count:

| file | errors |
| --- | --- |
| server/services/ai-brain/trinityDocumentActions.ts | 28 |
| server/services/ai-brain/trinityChatService.ts | 21 |
| client/src/components/email/EmailHubCanvas.tsx | 13 |
| client/src/pages/settings/HiringSettings.tsx | 13 |
| server/routes/authCoreRoutes.ts | 13 |
| server/routes/engagementRoutes.ts | 13 |
| server/routes/chat-rooms.ts | 12 |
| server/services/ai-brain/subagents/onboardingOrchestrator.ts | 11 |
| server/services/documents/businessArtifactDiagnosticService.ts | 10 |
| server/storage.ts | 9 |
| server/services/ai-brain/actionRegistry.ts | 8 |
| server/routes/salesRoutes.ts | 7 |
| server/services/paystubService.ts | 7 |
| client/src/components/trinity-chat-modal.tsx | 6 |
| server/routes/calendarRoutes.ts | 6 |
| server/routes/mascot-routes.ts | 6 |
| server/routes/platformRoutes.ts | 6 |
| server/routes/reviewRoutes.ts | 6 |
| server/routes/trinitySchedulingRoutes.ts | 6 |
| server/routes/twilioWebhooks.ts | 6 |
| server/services/trinity/trinityInboundEmailProcessor.ts | 6 |
| client/src/components/universal-chat-layout.tsx | 5 |
| server/routes/chat-management.ts | 5 |
| server/routes/complianceReportsRoutes.ts | 5 |
| server/routes/incidentPipelineRoutes.ts | 5 |

## Route conflicts (same METHOD+path declared twice)

| severity | file:line | category | detail |
| --- | --- | --- | --- |
| high | server/routes/adminDevExecuteRoute.ts:92 | route_conflict | Duplicate route declaration "POST /api/admin/dev-execute" — also declared at server/routes/adminRoutes.ts:60 |
| high | server/routes/adminRoutes.ts:60 | route_conflict | Duplicate route declaration "POST /api/admin/dev-execute" — also declared at server/routes/adminDevExecuteRoute.ts:92 |
| high | server/routes/aiBrainInlineRoutes.ts:81 | route_conflict | Duplicate route declaration "GET /api/ai-brain/fast-mode/tiers" — also declared at server/routes/workboardRoutes.ts:470 |
| high | server/routes/workboardRoutes.ts:470 | route_conflict | Duplicate route declaration "GET /api/ai-brain/fast-mode/tiers" — also declared at server/routes/aiBrainInlineRoutes.ts:81 |
| high | server/routes/authCoreRoutes.ts:824 | route_conflict | Duplicate route declaration "POST /api/auth/mfa/verify" — also declared at server/routes/authRoutes.ts:517 |
| high | server/routes/authRoutes.ts:517 | route_conflict | Duplicate route declaration "POST /api/auth/mfa/verify" — also declared at server/routes/authCoreRoutes.ts:824 |
| high | server/routes/chat.ts:39 | route_conflict | Duplicate route declaration "GET /api/chat/conversations" — also declared at server/routes/chatInlineRoutes.ts:28 |
| high | server/routes/chatInlineRoutes.ts:28 | route_conflict | Duplicate route declaration "GET /api/chat/conversations" — also declared at server/routes/chat.ts:39 |
| high | server/routes/chat.ts:78 | route_conflict | Duplicate route declaration "POST /api/chat/conversations" — also declared at server/routes/chatInlineRoutes.ts:61 |
| high | server/routes/chatInlineRoutes.ts:61 | route_conflict | Duplicate route declaration "POST /api/chat/conversations" — also declared at server/routes/chat.ts:78 |
| high | server/routes/chat.ts:115 | route_conflict | Duplicate route declaration "GET /api/chat/conversations/:id/messages" — also declared at server/routes/chatInlineRoutes.ts:141 |
| high | server/routes/chatInlineRoutes.ts:141 | route_conflict | Duplicate route declaration "GET /api/chat/conversations/:id/messages" — also declared at server/routes/chat.ts:115 |
| high | server/routes/chat.ts:206 | route_conflict | Duplicate route declaration "PATCH /api/chat/conversations/:id" — also declared at server/routes/chatInlineRoutes.ts:212 |
| high | server/routes/chatInlineRoutes.ts:212 | route_conflict | Duplicate route declaration "PATCH /api/chat/conversations/:id" — also declared at server/routes/chat.ts:206 |
| high | server/routes/chat.ts:243 | route_conflict | Duplicate route declaration "POST /api/chat/conversations/:id/close" — also declared at server/routes/chatInlineRoutes.ts:246 |
| high | server/routes/chatInlineRoutes.ts:246 | route_conflict | Duplicate route declaration "POST /api/chat/conversations/:id/close" — also declared at server/routes/chat.ts:243 |
| high | server/routes/chat.ts:302 | route_conflict | Duplicate route declaration "GET /api/chat/main-room" — also declared at server/routes/chatInlineRoutes.ts:297 |
| high | server/routes/chatInlineRoutes.ts:297 | route_conflict | Duplicate route declaration "GET /api/chat/main-room" — also declared at server/routes/chat.ts:302 |
| high | server/routes/chat.ts:330 | route_conflict | Duplicate route declaration "GET /api/chat/main-room/messages" — also declared at server/routes/chatInlineRoutes.ts:323 |
| high | server/routes/chatInlineRoutes.ts:323 | route_conflict | Duplicate route declaration "GET /api/chat/main-room/messages" — also declared at server/routes/chat.ts:330 |
| high | server/routes/chat.ts:359 | route_conflict | Duplicate route declaration "POST /api/chat/main-room/messages" — also declared at server/routes/chatInlineRoutes.ts:364 |
| high | server/routes/chatInlineRoutes.ts:364 | route_conflict | Duplicate route declaration "POST /api/chat/main-room/messages" — also declared at server/routes/chat.ts:359 |
| high | server/routes/chat.ts:428 | route_conflict | Duplicate route declaration "POST /api/chat/conversations/:id/grant-voice" — also declared at server/routes/chatInlineRoutes.ts:431 |
| high | server/routes/chatInlineRoutes.ts:431 | route_conflict | Duplicate route declaration "POST /api/chat/conversations/:id/grant-voice" — also declared at server/routes/chat.ts:428 |
| high | server/routes/chat.ts:480 | route_conflict | Duplicate route declaration "POST /api/chat/help-bot/respond" — also declared at server/routes/chatInlineRoutes.ts:477 |
| high | server/routes/chatInlineRoutes.ts:477 | route_conflict | Duplicate route declaration "POST /api/chat/help-bot/respond" — also declared at server/routes/chat.ts:480 |
| high | server/routes/chat.ts:525 | route_conflict | Duplicate route declaration "POST /api/chat/gemini" — also declared at server/routes/chatInlineRoutes.ts:518 |
| high | server/routes/chatInlineRoutes.ts:518 | route_conflict | Duplicate route declaration "POST /api/chat/gemini" — also declared at server/routes/chat.ts:525 |
| high | server/routes/chat.ts:580 | route_conflict | Duplicate route declaration "GET /api/chat/gemini/status" — also declared at server/routes/chatInlineRoutes.ts:721 |
| high | server/routes/chatInlineRoutes.ts:721 | route_conflict | Duplicate route declaration "GET /api/chat/gemini/status" — also declared at server/routes/chat.ts:580 |
| high | server/routes/chat.ts:604 | route_conflict | Duplicate route declaration "GET /api/chat/macros" — also declared at server/routes/chatInlineRoutes.ts:739 |
| high | server/routes/chatInlineRoutes.ts:739 | route_conflict | Duplicate route declaration "GET /api/chat/macros" — also declared at server/routes/chat.ts:604 |
| high | server/routes/chat.ts:655 | route_conflict | Duplicate route declaration "POST /api/chat/macros" — also declared at server/routes/chatInlineRoutes.ts:783 |
| high | server/routes/chatInlineRoutes.ts:783 | route_conflict | Duplicate route declaration "POST /api/chat/macros" — also declared at server/routes/chat.ts:655 |
| high | server/routes/chat.ts:733 | route_conflict | Duplicate route declaration "DELETE /api/chat/macros/:id" — also declared at server/routes/chatInlineRoutes.ts:854 |
| high | server/routes/chatInlineRoutes.ts:854 | route_conflict | Duplicate route declaration "DELETE /api/chat/macros/:id" — also declared at server/routes/chat.ts:733 |
| high | server/routes/chat.ts:781 | route_conflict | Duplicate route declaration "POST /api/chat/conversations/:id/typing" — also declared at server/routes/chatInlineRoutes.ts:895 |
| high | server/routes/chatInlineRoutes.ts:895 | route_conflict | Duplicate route declaration "POST /api/chat/conversations/:id/typing" — also declared at server/routes/chat.ts:781 |
| high | server/routes/chat.ts:853 | route_conflict | Duplicate route declaration "DELETE /api/chat/conversations/:id/typing" — also declared at server/routes/chatInlineRoutes.ts:961 |
| high | server/routes/chatInlineRoutes.ts:961 | route_conflict | Duplicate route declaration "DELETE /api/chat/conversations/:id/typing" — also declared at server/routes/chat.ts:853 |
| high | server/routes/chat.ts:1282 | route_conflict | Duplicate route declaration "GET /api/chat/unread-count" — also declared at server/routes/chatInlineRoutes.ts:1136 |
| high | server/routes/chatInlineRoutes.ts:1136 | route_conflict | Duplicate route declaration "GET /api/chat/unread-count" — also declared at server/routes/chat.ts:1282 |
| high | server/routes/chat.ts:1308 | route_conflict | Duplicate route declaration "POST /api/chat/mark-as-read" — also declared at server/routes/chatInlineRoutes.ts:1159 |
| high | server/routes/chatInlineRoutes.ts:1159 | route_conflict | Duplicate route declaration "POST /api/chat/mark-as-read" — also declared at server/routes/chat.ts:1308 |
| high | server/routes/chat.ts:1336 | route_conflict | Duplicate route declaration "GET /api/chatserver/presence" — also declared at server/routes/commInlineRoutes.ts:326 |
| high | server/routes/commInlineRoutes.ts:326 | route_conflict | Duplicate route declaration "GET /api/chatserver/presence" — also declared at server/routes/chat.ts:1336 |
| high | server/routes/chat.ts:1364 | route_conflict | Duplicate route declaration "GET /api/chatserver/self-awareness" — also declared at server/routes/commInlineRoutes.ts:348 |
| high | server/routes/commInlineRoutes.ts:348 | route_conflict | Duplicate route declaration "GET /api/chatserver/self-awareness" — also declared at server/routes/chat.ts:1364 |
| high | server/routes/chat.ts:1377 | route_conflict | Duplicate route declaration "GET /api/chatserver/ux-suggestions" — also declared at server/routes/commInlineRoutes.ts:358 |
| high | server/routes/commInlineRoutes.ts:358 | route_conflict | Duplicate route declaration "GET /api/chatserver/ux-suggestions" — also declared at server/routes/chat.ts:1377 |

_+ 64 more — see `platform-health-audit.json`._

## Mount overlaps (same prefix, conflicting middleware)

| severity | file:line | category | detail |
| --- | --- | --- | --- |
| high | server/routes.ts:887 | mount_overlap | Mount prefix "/api/onboarding" registered with 3 sites and 2 distinct middleware stacks — first match wins, hidden bypass risk |
| high | server/routes/domains/orgs.ts:47 | mount_overlap | Mount prefix "/api/onboarding" registered with 3 sites and 2 distinct middleware stacks — first match wins, hidden bypass risk |
| high | server/routes/domains/orgs.ts:49 | mount_overlap | Mount prefix "/api/onboarding" registered with 3 sites and 2 distinct middleware stacks — first match wins, hidden bypass risk |
| high | server/routes.ts:977 | mount_overlap | Mount prefix "/api/form-builder" registered with 2 sites and 2 distinct middleware stacks — first match wins, hidden bypass risk |
| high | server/routes/domains/compliance.ts:58 | mount_overlap | Mount prefix "/api/form-builder" registered with 2 sites and 2 distinct middleware stacks — first match wins, hidden bypass risk |
| high | server/routes.ts:982 | mount_overlap | Mount prefix "/api/onboarding-pipeline" registered with 2 sites and 2 distinct middleware stacks — first match wins, hidden bypass risk |
| high | server/routes/domains/ops.ts:36 | mount_overlap | Mount prefix "/api/onboarding-pipeline" registered with 2 sites and 2 distinct middleware stacks — first match wins, hidden bypass risk |
| high | server/routes.ts:1038 | mount_overlap | Mount prefix "/api/trinity" registered with 9 sites and 5 distinct middleware stacks — first match wins, hidden bypass risk |
| high | server/routes/domains/support.ts:34 | mount_overlap | Mount prefix "/api/trinity" registered with 9 sites and 5 distinct middleware stacks — first match wins, hidden bypass risk |
| high | server/routes/domains/trinity.ts:143 | mount_overlap | Mount prefix "/api/trinity" registered with 9 sites and 5 distinct middleware stacks — first match wins, hidden bypass risk |
| high | server/routes/domains/trinity.ts:168 | mount_overlap | Mount prefix "/api/trinity" registered with 9 sites and 5 distinct middleware stacks — first match wins, hidden bypass risk |
| high | server/routes/domains/trinity.ts:171 | mount_overlap | Mount prefix "/api/trinity" registered with 9 sites and 5 distinct middleware stacks — first match wins, hidden bypass risk |
| high | server/routes/domains/trinity.ts:189 | mount_overlap | Mount prefix "/api/trinity" registered with 9 sites and 5 distinct middleware stacks — first match wins, hidden bypass risk |
| high | server/routes/domains/trinity.ts:190 | mount_overlap | Mount prefix "/api/trinity" registered with 9 sites and 5 distinct middleware stacks — first match wins, hidden bypass risk |
| high | server/routes/domains/trinity.ts:191 | mount_overlap | Mount prefix "/api/trinity" registered with 9 sites and 5 distinct middleware stacks — first match wins, hidden bypass risk |
| high | server/routes/domains/trinity.ts:195 | mount_overlap | Mount prefix "/api/trinity" registered with 9 sites and 5 distinct middleware stacks — first match wins, hidden bypass risk |
| high | server/routes.ts:1079 | mount_overlap | Mount prefix "/api/surveys" registered with 3 sites and 3 distinct middleware stacks — first match wins, hidden bypass risk |
| high | server/routes.ts:1080 | mount_overlap | Mount prefix "/api/surveys" registered with 3 sites and 3 distinct middleware stacks — first match wins, hidden bypass risk |
| high | server/routes/domains/clients.ts:24 | mount_overlap | Mount prefix "/api/surveys" registered with 3 sites and 3 distinct middleware stacks — first match wins, hidden bypass risk |
| high | server/routes.ts:1081 | mount_overlap | Mount prefix "/api/wellness" registered with 2 sites and 2 distinct middleware stacks — first match wins, hidden bypass risk |
| high | server/routes/domains/workforce.ts:53 | mount_overlap | Mount prefix "/api/wellness" registered with 2 sites and 2 distinct middleware stacks — first match wins, hidden bypass risk |
| high | server/routes/domains/clients.ts:28 | mount_overlap | Mount prefix "/api/clients" registered with 2 sites and 2 distinct middleware stacks — first match wins, hidden bypass risk |
| high | server/routes/domains/clients.ts:41 | mount_overlap | Mount prefix "/api/clients" registered with 2 sites and 2 distinct middleware stacks — first match wins, hidden bypass risk |
| high | server/routes/domains/comms.ts:64 | mount_overlap | Mount prefix "/api/chat" registered with 3 sites and 2 distinct middleware stacks — first match wins, hidden bypass risk |
| high | server/routes/domains/comms.ts:65 | mount_overlap | Mount prefix "/api/chat" registered with 3 sites and 2 distinct middleware stacks — first match wins, hidden bypass risk |
| high | server/routes/domains/comms.ts:70 | mount_overlap | Mount prefix "/api/chat" registered with 3 sites and 2 distinct middleware stacks — first match wins, hidden bypass risk |
| high | server/routes/domains/compliance.ts:68 | mount_overlap | Mount prefix "/api/sps/forms" registered with 2 sites and 2 distinct middleware stacks — first match wins, hidden bypass risk |
| high | server/routes/domains/compliance.ts:97 | mount_overlap | Mount prefix "/api/sps/forms" registered with 2 sites and 2 distinct middleware stacks — first match wins, hidden bypass risk |
| high | server/routes/domains/compliance.ts:89 | mount_overlap | Mount prefix "/api/compliance" registered with 2 sites and 2 distinct middleware stacks — first match wins, hidden bypass risk |
| high | server/routes/domains/compliance.ts:91 | mount_overlap | Mount prefix "/api/compliance" registered with 2 sites and 2 distinct middleware stacks — first match wins, hidden bypass risk |
| high | server/routes/domains/orgs.ts:43 | mount_overlap | Mount prefix "/api/integrations" registered with 3 sites and 3 distinct middleware stacks — first match wins, hidden bypass risk |
| high | server/routes/domains/orgs.ts:59 | mount_overlap | Mount prefix "/api/integrations" registered with 3 sites and 3 distinct middleware stacks — first match wins, hidden bypass risk |
| high | server/routes/domains/orgs.ts:69 | mount_overlap | Mount prefix "/api/integrations" registered with 3 sites and 3 distinct middleware stacks — first match wins, hidden bypass risk |
| high | server/routes/domains/sales.ts:30 | mount_overlap | Mount prefix "/api/sales" registered with 2 sites and 2 distinct middleware stacks — first match wins, hidden bypass risk |
| high | server/routes/salesRoutes.ts:173 | mount_overlap | Mount prefix "/api/sales" registered with 2 sites and 2 distinct middleware stacks — first match wins, hidden bypass risk |
| high | server/routes/domains/time.ts:20 | mount_overlap | Mount prefix "/api/time-entries" registered with 2 sites and 2 distinct middleware stacks — first match wins, hidden bypass risk |
| high | server/routes/domains/time.ts:21 | mount_overlap | Mount prefix "/api/time-entries" registered with 2 sites and 2 distinct middleware stacks — first match wins, hidden bypass risk |
| high | server/routes/domains/trinity.ts:136 | mount_overlap | Mount prefix "/api/ai-brain" registered with 3 sites and 3 distinct middleware stacks — first match wins, hidden bypass risk |
| high | server/routes/domains/trinity.ts:137 | mount_overlap | Mount prefix "/api/ai-brain" registered with 3 sites and 3 distinct middleware stacks — first match wins, hidden bypass risk |
| high | server/routes/domains/trinity.ts:225 | mount_overlap | Mount prefix "/api/ai-brain" registered with 3 sites and 3 distinct middleware stacks — first match wins, hidden bypass risk |
| high | server/routes/domains/trinity.ts:201 | mount_overlap | Mount prefix "/api/automation" registered with 2 sites and 2 distinct middleware stacks — first match wins, hidden bypass risk |
| high | server/routes/domains/trinity.ts:202 | mount_overlap | Mount prefix "/api/automation" registered with 2 sites and 2 distinct middleware stacks — first match wins, hidden bypass risk |

## Race conditions — fire-and-forget

| severity | file:line | category | detail |
| --- | --- | --- | --- |
| high | server/routes/adminWorkspaceDetailsRoutes.ts:48 | race_fire_and_forget | Promise.catch attached without await/return — fire-and-forget violates TRINITY.md §B |
| high | server/routes/adminWorkspaceDetailsRoutes.ts:67 | race_fire_and_forget | Promise.catch attached without await/return — fire-and-forget violates TRINITY.md §B |
| high | server/routes/adminWorkspaceDetailsRoutes.ts:74 | race_fire_and_forget | Promise.catch attached without await/return — fire-and-forget violates TRINITY.md §B |
| high | server/routes/adminWorkspaceDetailsRoutes.ts:81 | race_fire_and_forget | Promise.catch attached without await/return — fire-and-forget violates TRINITY.md §B |
| high | server/routes/adminWorkspaceDetailsRoutes.ts:86 | race_fire_and_forget | Promise.catch attached without await/return — fire-and-forget violates TRINITY.md §B |
| high | server/routes/adminWorkspaceDetailsRoutes.ts:94 | race_fire_and_forget | Promise.catch attached without await/return — fire-and-forget violates TRINITY.md §B |
| high | server/routes/adminWorkspaceDetailsRoutes.ts:108 | race_fire_and_forget | Promise.catch attached without await/return — fire-and-forget violates TRINITY.md §B |
| high | server/routes/biAnalyticsRoutes.ts:100 | race_fire_and_forget | Promise.catch attached without await/return — fire-and-forget violates TRINITY.md §B |
| high | server/routes/biAnalyticsRoutes.ts:156 | race_fire_and_forget | Promise.catch attached without await/return — fire-and-forget violates TRINITY.md §B |
| high | server/routes/biAnalyticsRoutes.ts:261 | race_fire_and_forget | Promise.catch attached without await/return — fire-and-forget violates TRINITY.md §B |
| high | server/routes/biAnalyticsRoutes.ts:278 | race_fire_and_forget | Promise.catch attached without await/return — fire-and-forget violates TRINITY.md §B |
| high | server/routes/biAnalyticsRoutes.ts:387 | race_fire_and_forget | Promise.catch attached without await/return — fire-and-forget violates TRINITY.md §B |
| high | server/routes/biAnalyticsRoutes.ts:401 | race_fire_and_forget | Promise.catch attached without await/return — fire-and-forget violates TRINITY.md §B |
| high | server/routes/chat-uploads.ts:233 | race_fire_and_forget | Promise.catch attached without await/return — fire-and-forget violates TRINITY.md §B |
| high | server/routes/clientRoutes.ts:319 | race_fire_and_forget | Promise.catch attached without await/return — fire-and-forget violates TRINITY.md §B |
| high | server/routes/clientRoutes.ts:722 | race_fire_and_forget | Promise.catch attached without await/return — fire-and-forget violates TRINITY.md §B |
| high | server/routes/compliance/regulatoryPortal.ts:964 | race_fire_and_forget | Promise.catch attached without await/return — fire-and-forget violates TRINITY.md §B |
| high | server/routes/employeeRoutes.ts:385 | race_fire_and_forget | Promise.catch attached without await/return — fire-and-forget violates TRINITY.md §B |
| high | server/routes/helpAITriageRoutes.ts:701 | race_fire_and_forget | Promise.catch attached without await/return — fire-and-forget violates TRINITY.md §B |
| high | server/routes/helpai-routes.ts:49 | race_fire_and_forget | Promise.catch attached without await/return — fire-and-forget violates TRINITY.md §B |
| high | server/routes/incidentPipelineRoutes.ts:124 | race_set_immediate | setImmediate(async ...) — TRINITY.md §B forbids this fire-and-forget pattern |
| high | server/routes/oauthIntegrationRoutes.ts:2098 | race_fire_and_forget | Promise.catch attached without await/return — fire-and-forget violates TRINITY.md §B |
| high | server/routes/oauthIntegrationRoutes.ts:2118 | race_fire_and_forget | Promise.catch attached without await/return — fire-and-forget violates TRINITY.md §B |
| high | server/routes/payrollRoutes.ts:969 | race_fire_and_forget | Promise.catch attached without await/return — fire-and-forget violates TRINITY.md §B |
| high | server/routes/platformFeedbackRoutes.ts:103 | race_fire_and_forget | Promise.catch attached without await/return — fire-and-forget violates TRINITY.md §B |
| high | server/routes/postOrderVersionRoutes.ts:293 | race_set_immediate | setImmediate(async ...) — TRINITY.md §B forbids this fire-and-forget pattern |
| high | server/routes/privateMessageRoutes.ts:131 | race_fire_and_forget | Promise.catch attached without await/return — fire-and-forget violates TRINITY.md §B |
| high | server/routes/resendWebhooks.ts:679 | race_fire_and_forget | Promise.catch attached without await/return — fire-and-forget violates TRINITY.md §B |
| high | server/routes/resendWebhooks.ts:751 | race_fire_and_forget | Promise.catch attached without await/return — fire-and-forget violates TRINITY.md §B |
| high | server/routes/rmsRoutes.ts:813 | race_fire_and_forget | Promise.catch attached without await/return — fire-and-forget violates TRINITY.md §B |
| high | server/routes/rmsRoutes.ts:951 | race_fire_and_forget | Promise.catch attached without await/return — fire-and-forget violates TRINITY.md §B |
| high | server/routes/statusRoutes.ts:170 | race_fire_and_forget | Promise.catch attached without await/return — fire-and-forget violates TRINITY.md §B |
| high | server/routes/time-entry-routes.ts:635 | race_fire_and_forget | Promise.catch attached without await/return — fire-and-forget violates TRINITY.md §B |
| high | server/routes/time-entry-routes.ts:1187 | race_fire_and_forget | Promise.catch attached without await/return — fire-and-forget violates TRINITY.md §B |
| high | server/routes/time-entry-routes.ts:1191 | race_fire_and_forget | Promise.catch attached without await/return — fire-and-forget violates TRINITY.md §B |
| high | server/routes/time-entry-routes.ts:881 | race_set_immediate | setTimeout(async ...) — TRINITY.md §B forbids this fire-and-forget pattern |
| high | server/routes/timeEntryRoutes.ts:664 | race_fire_and_forget | Promise.catch attached without await/return — fire-and-forget violates TRINITY.md §B |
| high | server/routes/trinityIntakeRoutes.ts:140 | race_fire_and_forget | Promise.catch attached without await/return — fire-and-forget violates TRINITY.md §B |
| high | server/routes/trinityStaffingRoutes.ts:352 | race_fire_and_forget | Promise.catch attached without await/return — fire-and-forget violates TRINITY.md §B |
| high | server/routes/twilioWebhooks.ts:621 | race_fire_and_forget | Promise.catch attached without await/return — fire-and-forget violates TRINITY.md §B |
| high | server/routes/visitorManagementRoutes.ts:622 | race_fire_and_forget | Promise.catch attached without await/return — fire-and-forget violates TRINITY.md §B |
| high | server/routes/voiceRoutes.ts:4128 | race_fire_and_forget | Promise.catch attached without await/return — fire-and-forget violates TRINITY.md §B |
| high | server/routes/whatsNewRoutes.ts:27 | race_set_immediate | setTimeout(async ...) — TRINITY.md §B forbids this fire-and-forget pattern |
| high | server/routes/workspace.ts:612 | race_fire_and_forget | Promise.catch attached without await/return — fire-and-forget violates TRINITY.md §B |
| high | server/services/ai-brain/agentToAgentProtocol.ts:158 | race_fire_and_forget | Promise.catch attached without await/return — fire-and-forget violates TRINITY.md §B |
| high | server/services/ai-brain/aiBrainAuthorizationService.ts:950 | race_set_immediate | setTimeout(async ...) — TRINITY.md §B forbids this fire-and-forget pattern |
| high | server/services/ai-brain/approvalResumeOrchestrator.ts:411 | race_fire_and_forget | Promise.catch attached without await/return — fire-and-forget violates TRINITY.md §B |
| high | server/services/ai-brain/bugReportOrchestrator.ts:127 | race_fire_and_forget | Promise.catch attached without await/return — fire-and-forget violates TRINITY.md §B |
| high | server/services/ai-brain/hebbianLearningService.ts:218 | race_fire_and_forget | Promise.catch attached without await/return — fire-and-forget violates TRINITY.md §B |
| high | server/services/ai-brain/platformChangeMonitor.ts:114 | race_set_immediate | setTimeout(async ...) — TRINITY.md §B forbids this fire-and-forget pattern |

_+ 148 more — see `platform-health-audit.json`._

## Race conditions — forEach with await

_(none)_

## Race conditions — multi-write without transaction

| severity | file:line | category | detail |
| --- | --- | --- | --- |
| medium | server/routes/adminRoutes.ts:399 | race_missing_transaction | 5 db.{insert\|update\|delete} calls in this file with no db.transaction wrap |
| medium | server/routes/advancedSchedulingRoutes.ts:191 | race_missing_transaction | 4 db.{insert\|update\|delete} calls in this file with no db.transaction wrap |
| medium | server/routes/agentActivityRoutes.ts:272 | race_missing_transaction | 9 db.{insert\|update\|delete} calls in this file with no db.transaction wrap |
| medium | server/routes/ai-brain-routes.ts:360 | race_missing_transaction | 3 db.{insert\|update\|delete} calls in this file with no db.transaction wrap |
| medium | server/routes/alertConfigRoutes.ts:43 | race_missing_transaction | 5 db.{insert\|update\|delete} calls in this file with no db.transaction wrap |
| medium | server/routes/auditRoutes.ts:106 | race_missing_transaction | 2 db.{insert\|update\|delete} calls in this file with no db.transaction wrap |
| medium | server/routes/billing-api.ts:875 | race_missing_transaction | 2 db.{insert\|update\|delete} calls in this file with no db.transaction wrap |
| medium | server/routes/budgetRoutes.ts:85 | race_missing_transaction | 6 db.{insert\|update\|delete} calls in this file with no db.transaction wrap |
| medium | server/routes/bulk-operations.ts:101 | race_missing_transaction | 3 db.{insert\|update\|delete} calls in this file with no db.transaction wrap |
| medium | server/routes/chat-management.ts:95 | race_missing_transaction | 31 db.{insert\|update\|delete} calls in this file with no db.transaction wrap |
| medium | server/routes/chat-uploads.ts:245 | race_missing_transaction | 3 db.{insert\|update\|delete} calls in this file with no db.transaction wrap |
| medium | server/routes/chat.ts:714 | race_missing_transaction | 4 db.{insert\|update\|delete} calls in this file with no db.transaction wrap |
| medium | server/routes/chatInlineRoutes.ts:834 | race_missing_transaction | 4 db.{insert\|update\|delete} calls in this file with no db.transaction wrap |
| medium | server/routes/commOsRoutes.ts:340 | race_missing_transaction | 3 db.{insert\|update\|delete} calls in this file with no db.transaction wrap |
| medium | server/routes/command-documentation.ts:410 | race_missing_transaction | 2 db.{insert\|update\|delete} calls in this file with no db.transaction wrap |
| medium | server/routes/compliance/packets.ts:139 | race_missing_transaction | 3 db.{insert\|update\|delete} calls in this file with no db.transaction wrap |
| medium | server/routes/compliance/regulator.ts:158 | race_missing_transaction | 6 db.{insert\|update\|delete} calls in this file with no db.transaction wrap |
| medium | server/routes/compliance/regulatoryEnrollment.ts:199 | race_missing_transaction | 3 db.{insert\|update\|delete} calls in this file with no db.transaction wrap |
| medium | server/routes/compliance/regulatoryPortal.ts:278 | race_missing_transaction | 8 db.{insert\|update\|delete} calls in this file with no db.transaction wrap |
| medium | server/routes/complianceInlineRoutes.ts:44 | race_missing_transaction | 3 db.{insert\|update\|delete} calls in this file with no db.transaction wrap |
| medium | server/routes/complianceScenarioRoutes.ts:145 | race_missing_transaction | 2 db.{insert\|update\|delete} calls in this file with no db.transaction wrap |
| medium | server/routes/contentInlineRoutes.ts:300 | race_missing_transaction | 7 db.{insert\|update\|delete} calls in this file with no db.transaction wrap |
| medium | server/routes/credentialRoutes.ts:172 | race_missing_transaction | 3 db.{insert\|update\|delete} calls in this file with no db.transaction wrap |
| medium | server/routes/disciplinaryRecordRoutes.ts:63 | race_missing_transaction | 4 db.{insert\|update\|delete} calls in this file with no db.transaction wrap |
| medium | server/routes/documentFormRoutes.ts:145 | race_missing_transaction | 4 db.{insert\|update\|delete} calls in this file with no db.transaction wrap |
| medium | server/routes/documentTemplateRoutes.ts:133 | race_missing_transaction | 5 db.{insert\|update\|delete} calls in this file with no db.transaction wrap |
| medium | server/routes/documentVaultRoutes.ts:260 | race_missing_transaction | 3 db.{insert\|update\|delete} calls in this file with no db.transaction wrap |
| medium | server/routes/emailUnsubscribe.ts:197 | race_missing_transaction | 3 db.{insert\|update\|delete} calls in this file with no db.transaction wrap |
| medium | server/routes/employeePacketRoutes.ts:42 | race_missing_transaction | 5 db.{insert\|update\|delete} calls in this file with no db.transaction wrap |
| medium | server/routes/engagementRoutes.ts:91 | race_missing_transaction | 10 db.{insert\|update\|delete} calls in this file with no db.transaction wrap |
| medium | server/routes/equipmentRoutes.ts:103 | race_missing_transaction | 7 db.{insert\|update\|delete} calls in this file with no db.transaction wrap |
| medium | server/routes/experienceRoutes.ts:245 | race_missing_transaction | 4 db.{insert\|update\|delete} calls in this file with no db.transaction wrap |
| medium | server/routes/externalEmailRoutes.ts:94 | race_missing_transaction | 8 db.{insert\|update\|delete} calls in this file with no db.transaction wrap |
| medium | server/routes/financeSettingsRoutes.ts:36 | race_missing_transaction | 7 db.{insert\|update\|delete} calls in this file with no db.transaction wrap |
| medium | server/routes/formBuilderRoutes.ts:144 | race_missing_transaction | 9 db.{insert\|update\|delete} calls in this file with no db.transaction wrap |
| medium | server/routes/guardTourRoutes.ts:77 | race_missing_transaction | 7 db.{insert\|update\|delete} calls in this file with no db.transaction wrap |
| medium | server/routes/helpai-routes.ts:28 | race_missing_transaction | 2 db.{insert\|update\|delete} calls in this file with no db.transaction wrap |
| medium | server/routes/helpdeskRoutes.ts:58 | race_missing_transaction | 7 db.{insert\|update\|delete} calls in this file with no db.transaction wrap |
| medium | server/routes/hr/documentRequestRoutes.ts:356 | race_missing_transaction | 2 db.{insert\|update\|delete} calls in this file with no db.transaction wrap |
| medium | server/routes/importRoutes.ts:359 | race_missing_transaction | 3 db.{insert\|update\|delete} calls in this file with no db.transaction wrap |
| medium | server/routes/insightsRoutes.ts:52 | race_missing_transaction | 4 db.{insert\|update\|delete} calls in this file with no db.transaction wrap |
| medium | server/routes/integrationManagementRoutes.ts:319 | race_missing_transaction | 2 db.{insert\|update\|delete} calls in this file with no db.transaction wrap |
| medium | server/routes/integrationRoutes.ts:251 | race_missing_transaction | 3 db.{insert\|update\|delete} calls in this file with no db.transaction wrap |
| medium | server/routes/integrationsInlineRoutes.ts:115 | race_missing_transaction | 8 db.{insert\|update\|delete} calls in this file with no db.transaction wrap |
| medium | server/routes/internalResetRoutes.ts:172 | race_missing_transaction | 2 db.{insert\|update\|delete} calls in this file with no db.transaction wrap |
| medium | server/routes/leaderRoutes.ts:247 | race_missing_transaction | 2 db.{insert\|update\|delete} calls in this file with no db.transaction wrap |
| medium | server/routes/mascot-routes.ts:1261 | race_missing_transaction | 10 db.{insert\|update\|delete} calls in this file with no db.transaction wrap |
| medium | server/routes/messageBridgeRoutes.ts:170 | race_missing_transaction | 5 db.{insert\|update\|delete} calls in this file with no db.transaction wrap |
| medium | server/routes/migration.ts:264 | race_missing_transaction | 3 db.{insert\|update\|delete} calls in this file with no db.transaction wrap |
| medium | server/routes/officerScoreRoutes.ts:283 | race_missing_transaction | 2 db.{insert\|update\|delete} calls in this file with no db.transaction wrap |

_+ 341 more — see `platform-health-audit.json`._

## Race conditions — read-then-write without lock

| severity | file:line | category | detail |
| --- | --- | --- | --- |
| medium | server/routes/advancedSchedulingRoutes.ts:405 | race_read_then_write_no_lock | read-then-write on `shifts` without db.transaction or .forUpdate() — race window |
| medium | server/routes/approvalRoutes.ts:299 | race_read_then_write_no_lock | read-then-write on `timesheetEditRequests` without db.transaction or .forUpdate() — race window |
| medium | server/routes/chat.ts:755 | race_read_then_write_no_lock | read-then-write on `chatMacros` without db.transaction or .forUpdate() — race window |
| medium | server/routes/chatInlineRoutes.ts:872 | race_read_then_write_no_lock | read-then-write on `chatMacros` without db.transaction or .forUpdate() — race window |
| medium | server/routes/compliance/regulatoryPortal.ts:360 | race_read_then_write_no_lock | read-then-write on `auditorVerificationRequests` without db.transaction or .forUpdate() — race window |
| medium | server/routes/contentInlineRoutes.ts:451 | race_read_then_write_no_lock | read-then-write on `customRules` without db.transaction or .forUpdate() — race window |
| medium | server/routes/emailUnsubscribe.ts:348 | race_read_then_write_no_lock | read-then-write on `emailUnsubscribes` without db.transaction or .forUpdate() — race window |
| medium | server/routes/employeePacketRoutes.ts:104 | race_read_then_write_no_lock | read-then-write on `documentSignatures` without db.transaction or .forUpdate() — race window |
| medium | server/routes/externalEmailRoutes.ts:125 | race_read_then_write_no_lock | read-then-write on `externalEmailsSent` without db.transaction or .forUpdate() — race window |
| medium | server/routes/financeSettingsRoutes.ts:33 | race_read_then_write_no_lock | read-then-write on `orgFinanceSettings` without db.transaction or .forUpdate() — race window |
| medium | server/routes/formBuilderRoutes.ts:220 | race_read_then_write_no_lock | read-then-write on `customForms` without db.transaction or .forUpdate() — race window |
| medium | server/routes/importRoutes.ts:343 | race_read_then_write_no_lock | read-then-write on `employees` without db.transaction or .forUpdate() — race window |
| medium | server/routes/integrationRoutes.ts:237 | race_read_then_write_no_lock | read-then-write on `exceptionTriageQueue` without db.transaction or .forUpdate() — race window |
| medium | server/routes/messageBridgeRoutes.ts:216 | race_read_then_write_no_lock | read-then-write on `channelBridges` without db.transaction or .forUpdate() — race window |
| medium | server/routes/onboardingInlineRoutes.ts:292 | race_read_then_write_no_lock | read-then-write on `userOnboarding` without db.transaction or .forUpdate() — race window |
| medium | server/routes/platformFeedbackRoutes.ts:77 | race_read_then_write_no_lock | read-then-write on `pulseSurveyTemplates` without db.transaction or .forUpdate() — race window |
| medium | server/routes/proposalRoutes.ts:75 | race_read_then_write_no_lock | read-then-write on `proposals` without db.transaction or .forUpdate() — race window |
| medium | server/routes/recruitmentRoutes.ts:161 | race_read_then_write_no_lock | read-then-write on `interviewCandidates` without db.transaction or .forUpdate() — race window |
| medium | server/routes/salesRoutes.ts:24 | race_read_then_write_no_lock | read-then-write on `orgInvitations` without db.transaction or .forUpdate() — race window |
| medium | server/routes/spsDocumentRoutes.ts:269 | race_read_then_write_no_lock | read-then-write on `spsDocuments` without db.transaction or .forUpdate() — race window |
| medium | server/routes/spsFormsRoutes.ts:320 | race_read_then_write_no_lock | read-then-write on `table` without db.transaction or .forUpdate() — race window |
| medium | server/routes/sra/sraTrinityRoutes.ts:255 | race_read_then_write_no_lock | read-then-write on `sraAuditSessions` without db.transaction or .forUpdate() — race window |
| medium | server/routes/vehicleRoutes.ts:28 | race_read_then_write_no_lock | read-then-write on `vehicles` without db.transaction or .forUpdate() — race window |
| medium | server/services/ChatServerHub.ts:727 | race_read_then_write_no_lock | read-then-write on `supportRooms` without db.transaction or .forUpdate() — race window |
| medium | server/services/ai-brain/aiBrainAuthorizationService.ts:653 | race_read_then_write_no_lock | read-then-write on `governanceApprovals` without db.transaction or .forUpdate() — race window |
| medium | server/services/ai-brain/aiBrainCodeEditor.ts:318 | race_read_then_write_no_lock | read-then-write on `stagedCodeChanges` without db.transaction or .forUpdate() — race window |
| medium | server/services/ai-brain/aiBrainMasterOrchestrator.ts:534 | race_read_then_write_no_lock | read-then-write on `timeEntries` without db.transaction or .forUpdate() — race window |
| medium | server/services/ai-brain/aiOrchestraService.ts:604 | race_read_then_write_no_lock | read-then-write on `aiModelHealth` without db.transaction or .forUpdate() — race window |
| medium | server/services/ai-brain/approvalRequestService.ts:241 | race_read_then_write_no_lock | read-then-write on `aiApprovalRequests` without db.transaction or .forUpdate() — race window |
| medium | server/services/ai-brain/approvalResumeOrchestrator.ts:102 | race_read_then_write_no_lock | read-then-write on `aiWorkflowApprovals` without db.transaction or .forUpdate() — race window |
| medium | server/services/ai-brain/automationGovernanceService.ts:308 | race_read_then_write_no_lock | read-then-write on `workspaces` without db.transaction or .forUpdate() — race window |
| medium | server/services/ai-brain/cognitiveRepositories.ts:80 | race_read_then_write_no_lock | read-then-write on `knowledgeEntities` without db.transaction or .forUpdate() — race window |
| medium | server/services/ai-brain/commitmentManager.ts:109 | race_read_then_write_no_lock | read-then-write on `commitmentLedger` without db.transaction or .forUpdate() — race window |
| medium | server/services/ai-brain/elevatedSessionGuardian.ts:570 | race_read_then_write_no_lock | read-then-write on `supportSessionElevations` without db.transaction or .forUpdate() — race window |
| medium | server/services/ai-brain/integrationManagementService.ts:157 | race_read_then_write_no_lock | read-then-write on `integrationConnections` without db.transaction or .forUpdate() — race window |
| medium | server/services/ai-brain/integrationPartnerService.ts:174 | race_read_then_write_no_lock | read-then-write on `integrationMarketplace` without db.transaction or .forUpdate() — race window |
| medium | server/services/ai-brain/orgOnboardingAssistant.ts:573 | race_read_then_write_no_lock | read-then-write on `workspaces` without db.transaction or .forUpdate() — race window |
| medium | server/services/ai-brain/providers/geminiClient.ts:1285 | race_read_then_write_no_lock | read-then-write on `helposFaqs` without db.transaction or .forUpdate() — race window |
| medium | server/services/ai-brain/subagentSupervisor.ts:2079 | race_read_then_write_no_lock | read-then-write on `aiSubagentDefinitions` without db.transaction or .forUpdate() — race window |
| medium | server/services/ai-brain/subagents/dataMigrationAgent.ts:422 | race_read_then_write_no_lock | read-then-write on `employees` without db.transaction or .forUpdate() — race window |
| medium | server/services/ai-brain/taskStateMachine.ts:542 | race_read_then_write_no_lock | read-then-write on `aiBrainTasks` without db.transaction or .forUpdate() — race window |
| medium | server/services/ai-brain/tools/trinitySelfEditGovernance.ts:671 | race_read_then_write_no_lock | read-then-write on `automationActionLedger` without db.transaction or .forUpdate() — race window |
| medium | server/services/ai-brain/trinityAutonomousTaskQueue.ts:130 | race_read_then_write_no_lock | read-then-write on `trinityAutonomousTasks` without db.transaction or .forUpdate() — race window |
| medium | server/services/ai-brain/trinityComplianceIncidentActions.ts:110 | race_read_then_write_no_lock | read-then-write on `shifts` without db.transaction or .forUpdate() — race window |
| medium | server/services/ai-brain/trinityDelegationTrackerActions.ts:187 | race_read_then_write_no_lock | read-then-write on `orchestrationRuns` without db.transaction or .forUpdate() — race window |
| medium | server/services/ai-brain/trinityDrugTestingActions.ts:119 | race_read_then_write_no_lock | read-then-write on `orchestrationRuns` without db.transaction or .forUpdate() — race window |
| medium | server/services/ai-brain/trinityEpisodicMemoryService.ts:233 | race_read_then_write_no_lock | read-then-write on `trinityEpisodicMemory` without db.transaction or .forUpdate() — race window |
| medium | server/services/ai-brain/trinityHelpdeskActions.ts:98 | race_read_then_write_no_lock | read-then-write on `helposFaqs` without db.transaction or .forUpdate() — race window |
| medium | server/services/ai-brain/trinityLegalResearch.ts:169 | race_read_then_write_no_lock | read-then-write on `regulatoryRules` without db.transaction or .forUpdate() — race window |
| medium | server/services/ai-brain/trinityPostOrdersSafetyActions.ts:119 | race_read_then_write_no_lock | read-then-write on `shiftOrderAcknowledgments` without db.transaction or .forUpdate() — race window |

_+ 62 more — see `platform-health-audit.json`._

## Trinity §A — direct REPLIT_DEPLOYMENT

_(none)_

## Trinity §F — module-load SDK assertion

| severity | file:line | category | detail |
| --- | --- | --- | --- |
| high | server/routes/integrations-status.ts:274 | trinity_law_module_load_assert | `new Stripe(process.env.X!)` at module load — TRINITY.md §F requires lazy factory + Proxy |
| high | server/scripts/seed-stripe-products.ts:21 | trinity_law_module_load_assert | `new Stripe(process.env.X!)` at module load — TRINITY.md §F requires lazy factory + Proxy |
| high | server/scripts/setup-new-pricing-products.ts:31 | trinity_law_module_load_assert | `new Stripe(process.env.X!)` at module load — TRINITY.md §F requires lazy factory + Proxy |
| high | server/scripts/verify-stripe-products.ts:3 | trinity_law_module_load_assert | `new Stripe(process.env.X!)` at module load — TRINITY.md §F requires lazy factory + Proxy |

## Trinity §G — raw SQL UPDATE/DELETE without workspace_id

| severity | file:line | category | detail |
| --- | --- | --- | --- |
| blocker | server/routes/authCoreRoutes.ts:979 | trinity_law_raw_sql_no_workspace | Raw SQL DELETE FROM `user_sessions` without workspace_id in WHERE — TRINITY.md §G tenant-isolation violation |
| blocker | server/routes/chatInlineRoutes.ts:284 | trinity_law_raw_sql_no_workspace | Raw SQL UPDATE on `chat_messages` without workspace_id in WHERE — TRINITY.md §G tenant-isolation violation |
| blocker | server/routes/clockinPinRoutes.ts:68 | trinity_law_raw_sql_no_workspace | Raw SQL UPDATE on `employees` without workspace_id in WHERE — TRINITY.md §G tenant-isolation violation |
| blocker | server/routes/clockinPinRoutes.ts:183 | trinity_law_raw_sql_no_workspace | Raw SQL UPDATE on `employees` without workspace_id in WHERE — TRINITY.md §G tenant-isolation violation |
| blocker | server/routes/clockinPinRoutes.ts:246 | trinity_law_raw_sql_no_workspace | Raw SQL UPDATE on `employees` without workspace_id in WHERE — TRINITY.md §G tenant-isolation violation |
| blocker | server/routes/email/emailRoutes.ts:281 | trinity_law_raw_sql_no_workspace | Raw SQL UPDATE on `platform_email_addresses` without workspace_id in WHERE — TRINITY.md §G tenant-isolation violation |
| blocker | server/routes/equipmentRoutes.ts:489 | trinity_law_raw_sql_no_workspace | Raw SQL UPDATE on `equipment_assignments` without workspace_id in WHERE — TRINITY.md §G tenant-isolation violation |
| blocker | server/routes/equipmentRoutes.ts:568 | trinity_law_raw_sql_no_workspace | Raw SQL UPDATE on `equipment_assignments` without workspace_id in WHERE — TRINITY.md §G tenant-isolation violation |
| blocker | server/routes/equipmentRoutes.ts:845 | trinity_law_raw_sql_no_workspace | Raw SQL UPDATE on `equipment_assignments` without workspace_id in WHERE — TRINITY.md §G tenant-isolation violation |
| blocker | server/routes/interviewChatroomRoutes.ts:136 | trinity_law_raw_sql_no_workspace | Raw SQL UPDATE on `interview_chatrooms` without workspace_id in WHERE — TRINITY.md §G tenant-isolation violation |
| blocker | server/routes/mascot-routes.ts:2380 | trinity_law_raw_sql_no_workspace | Raw SQL UPDATE on `mascot_sessions` without workspace_id in WHERE — TRINITY.md §G tenant-isolation violation |
| blocker | server/routes/mascot-routes.ts:2472 | trinity_law_raw_sql_no_workspace | Raw SQL UPDATE on `mascot_sessions` without workspace_id in WHERE — TRINITY.md §G tenant-isolation violation |
| blocker | server/routes/onboardingTaskRoutes.ts:122 | trinity_law_raw_sql_no_workspace | Raw SQL UPDATE on `SET` without workspace_id in WHERE — TRINITY.md §G tenant-isolation violation |
| blocker | server/routes/privacyRoutes.ts:349 | trinity_law_raw_sql_no_workspace | Raw SQL UPDATE on `data_subject_requests` without workspace_id in WHERE — TRINITY.md §G tenant-isolation violation |
| blocker | server/routes/rfpEthicsRoutes.ts:99 | trinity_law_raw_sql_no_workspace | Raw SQL UPDATE on `anonymous_reports` without workspace_id in WHERE — TRINITY.md §G tenant-isolation violation |
| blocker | server/routes/rfpEthicsRoutes.ts:152 | trinity_law_raw_sql_no_workspace | Raw SQL UPDATE on `rfp_documents` without workspace_id in WHERE — TRINITY.md §G tenant-isolation violation |
| blocker | server/routes/rfpEthicsRoutes.ts:212 | trinity_law_raw_sql_no_workspace | Raw SQL UPDATE on `shift_coverage_claims` without workspace_id in WHERE — TRINITY.md §G tenant-isolation violation |
| blocker | server/routes/rmsRoutes.ts:150 | trinity_law_raw_sql_no_workspace | Raw SQL UPDATE on `daily_activity_reports` without workspace_id in WHERE — TRINITY.md §G tenant-isolation violation |
| blocker | server/routes/rmsRoutes.ts:217 | trinity_law_raw_sql_no_workspace | Raw SQL UPDATE on `daily_activity_reports` without workspace_id in WHERE — TRINITY.md §G tenant-isolation violation |
| blocker | server/routes/rmsRoutes.ts:231 | trinity_law_raw_sql_no_workspace | Raw SQL UPDATE on `dar_reports` without workspace_id in WHERE — TRINITY.md §G tenant-isolation violation |
| blocker | server/routes/rmsRoutes.ts:311 | trinity_law_raw_sql_no_workspace | Raw SQL UPDATE on `dar_reports` without workspace_id in WHERE — TRINITY.md §G tenant-isolation violation |
| blocker | server/routes/rmsRoutes.ts:328 | trinity_law_raw_sql_no_workspace | Raw SQL UPDATE on `dar_reports` without workspace_id in WHERE — TRINITY.md §G tenant-isolation violation |
| blocker | server/routes/safetyRoutes.ts:320 | trinity_law_raw_sql_no_workspace | Raw SQL UPDATE on `sla_contracts` without workspace_id in WHERE — TRINITY.md §G tenant-isolation violation |
| blocker | server/routes/salesPipelineRoutes.ts:320 | trinity_law_raw_sql_no_workspace | Raw SQL UPDATE on `sales_leads` without workspace_id in WHERE — TRINITY.md §G tenant-isolation violation |
| blocker | server/routes/trinityAgentDashboardRoutes.ts:350 | trinity_law_raw_sql_no_workspace | Raw SQL UPDATE on `governance_approvals` without workspace_id in WHERE — TRINITY.md §G tenant-isolation violation |
| blocker | server/routes/visitorManagementRoutes.ts:342 | trinity_law_raw_sql_no_workspace | Raw SQL UPDATE on `visitor_logs` without workspace_id in WHERE — TRINITY.md §G tenant-isolation violation |
| blocker | server/routes/voiceRoutes.ts:2771 | trinity_law_raw_sql_no_workspace | Raw SQL UPDATE on `voice_call_sessions` without workspace_id in WHERE — TRINITY.md §G tenant-isolation violation |
| blocker | server/routes/voiceRoutes.ts:4033 | trinity_law_raw_sql_no_workspace | Raw SQL UPDATE on `voice_call_sessions` without workspace_id in WHERE — TRINITY.md §G tenant-isolation violation |
| blocker | server/routes/voiceRoutes.ts:4126 | trinity_law_raw_sql_no_workspace | Raw SQL UPDATE on `voice_call_sessions` without workspace_id in WHERE — TRINITY.md §G tenant-isolation violation |
| blocker | server/services/ai-brain/domainLeadSupervisors.ts:601 | trinity_law_raw_sql_no_workspace | Raw SQL UPDATE on `employees` without workspace_id in WHERE — TRINITY.md §G tenant-isolation violation |
| blocker | server/services/ai-brain/domainLeadSupervisors.ts:625 | trinity_law_raw_sql_no_workspace | Raw SQL UPDATE on `employees` without workspace_id in WHERE — TRINITY.md §G tenant-isolation violation |
| blocker | server/services/auditor/auditorAccessService.ts:570 | trinity_law_raw_sql_no_workspace | Raw SQL UPDATE on `auditor_accounts` without workspace_id in WHERE — TRINITY.md §G tenant-isolation violation |
| blocker | server/services/auditor/curePeriodTrackerService.ts:421 | trinity_law_raw_sql_no_workspace | Raw SQL UPDATE on `audit_condition_timers` without workspace_id in WHERE — TRINITY.md §G tenant-isolation violation |
| blocker | server/services/autonomousScheduler.ts:2767 | trinity_law_raw_sql_no_workspace | Raw SQL DELETE FROM `sessions` without workspace_id in WHERE — TRINITY.md §G tenant-isolation violation |
| blocker | server/services/billing/guestSessionService.ts:96 | trinity_law_raw_sql_no_workspace | Raw SQL UPDATE on `SET` without workspace_id in WHERE — TRINITY.md §G tenant-isolation violation |
| blocker | server/services/developmentSeed.ts:119 | trinity_law_raw_sql_no_workspace | Raw SQL UPDATE on `users` without workspace_id in WHERE — TRINITY.md §G tenant-isolation violation |
| blocker | server/services/developmentSeedFinancialIntegrations.ts:621 | trinity_law_raw_sql_no_workspace | Raw SQL UPDATE on `payroll_entries` without workspace_id in WHERE — TRINITY.md §G tenant-isolation violation |
| blocker | server/services/email/emailProvisioningService.ts:252 | trinity_law_raw_sql_no_workspace | Raw SQL UPDATE on `clients` without workspace_id in WHERE — TRINITY.md §G tenant-isolation violation |
| blocker | server/services/employeeOnboardingPipelineService.ts:166 | trinity_law_raw_sql_no_workspace | Raw SQL UPDATE on `employees` without workspace_id in WHERE — TRINITY.md §G tenant-isolation violation |
| blocker | server/services/helpai/faqLearningService.ts:94 | trinity_law_raw_sql_no_workspace | Raw SQL DELETE FROM `faq_candidates` without workspace_id in WHERE — TRINITY.md §G tenant-isolation violation |
| blocker | server/services/helpai/supportActionRegistry.ts:442 | trinity_law_raw_sql_no_workspace | Raw SQL UPDATE on `form_invitations` without workspace_id in WHERE — TRINITY.md §G tenant-isolation violation |
| blocker | server/services/infrastructure/durableJobQueue.ts:490 | trinity_law_raw_sql_no_workspace | Raw SQL UPDATE on `durable_job_queue` without workspace_id in WHERE — TRINITY.md §G tenant-isolation violation |
| blocker | server/services/notificationInit.ts:97 | trinity_law_raw_sql_no_workspace | Raw SQL DELETE FROM `platform_updates` without workspace_id in WHERE — TRINITY.md §G tenant-isolation violation |
| blocker | server/services/oauth/googleCalendar.ts:46 | trinity_law_raw_sql_no_workspace | Raw SQL UPDATE on `SET` without workspace_id in WHERE — TRINITY.md §G tenant-isolation violation |
| blocker | server/services/productionSeed.ts:1134 | trinity_law_raw_sql_no_workspace | Raw SQL UPDATE on `SET` without workspace_id in WHERE — TRINITY.md §G tenant-isolation violation |
| blocker | server/services/shiftChatroomWorkflowService.ts:580 | trinity_law_raw_sql_no_workspace | Raw SQL UPDATE on `dar_reports` without workspace_id in WHERE — TRINITY.md §G tenant-isolation violation |
| blocker | server/services/sms/smsQueueService.ts:122 | trinity_law_raw_sql_no_workspace | Raw SQL UPDATE on `sms_outbox` without workspace_id in WHERE — TRINITY.md §G tenant-isolation violation |
| blocker | server/services/trinity/proactive/officerWellness.ts:166 | trinity_law_raw_sql_no_workspace | Raw SQL UPDATE on `audit_logs` without workspace_id in WHERE — TRINITY.md §G tenant-isolation violation |
| blocker | server/services/trinity/proactive/officerWellness.ts:229 | trinity_law_raw_sql_no_workspace | Raw SQL UPDATE on `audit_logs` without workspace_id in WHERE — TRINITY.md §G tenant-isolation violation |
| blocker | server/services/trinity/workflows/missedClockInWorkflow.ts:382 | trinity_law_raw_sql_no_workspace | Raw SQL UPDATE on `failed` without workspace_id in WHERE — TRINITY.md §G tenant-isolation violation |

_+ 5 more — see `platform-health-audit.json`._

## Trinity §I — hardcoded workspace UUIDs

| severity | file:line | category | detail |
| --- | --- | --- | --- |
| high | server/services/productionSeed.ts:862 | trinity_law_hardcoded_workspace | Hardcoded UUID literal "8d31a497-e9fe-48d9-b819-9c6869948c39" — TRINITY.md §I forbids hardcoded workspace/user IDs in production code |
| high | server/services/productionSeed.ts:1112 | trinity_law_hardcoded_workspace | Hardcoded UUID literal "e2d402f8-fb44-4129-a0f2-703f0dc91aaa" — TRINITY.md §I forbids hardcoded workspace/user IDs in production code |
| high | server/services/productionSeed.ts:1148 | trinity_law_hardcoded_workspace | Hardcoded UUID literal "8d31a497-e9fe-48d9-b819-9c6869948c39" — TRINITY.md §I forbids hardcoded workspace/user IDs in production code |

## Direct provider SDK calls outside NDS

_(none)_

## Dead/unused router exports

_(none)_

## Top route files by flagged-finding count

| file | routes | flagged |
| --- | --- | --- |
| server/routes/adminWorkspaceDetailsRoutes.ts | 2 | 7 |
| server/routes/rmsRoutes.ts | 0 | 7 |
| server/routes/biAnalyticsRoutes.ts | 10 | 6 |
| server/routes/equipmentRoutes.ts | 22 | 4 |
| server/routes/time-entry-routes.ts | 0 | 4 |
| server/routes/voiceRoutes.ts | 0 | 4 |
| server/routes/chatInlineRoutes.ts | 25 | 3 |
| server/routes/clockinPinRoutes.ts | 0 | 3 |
| server/routes/compliance/regulatoryPortal.ts | 27 | 3 |
| server/routes/mascot-routes.ts | 44 | 3 |
| server/routes/platformFeedbackRoutes.ts | 6 | 3 |
| server/routes/rfpEthicsRoutes.ts | 0 | 3 |
| server/routes/advancedSchedulingRoutes.ts | 0 | 2 |
| server/routes/chat-uploads.ts | 3 | 2 |
| server/routes/chat.ts | 33 | 2 |
| server/routes/clientRoutes.ts | 17 | 2 |
| server/routes/contentInlineRoutes.ts | 13 | 2 |
| server/routes/emailUnsubscribe.ts | 5 | 2 |
| server/routes/employeePacketRoutes.ts | 0 | 2 |
| server/routes/externalEmailRoutes.ts | 16 | 2 |
| server/routes/financeSettingsRoutes.ts | 6 | 2 |
| server/routes/formBuilderRoutes.ts | 14 | 2 |
| server/routes/helpai-routes.ts | 0 | 2 |
| server/routes/importRoutes.ts | 4 | 2 |
| server/routes/integrationRoutes.ts | 8 | 2 |
| server/routes/messageBridgeRoutes.ts | 7 | 2 |
| server/routes/oauthIntegrationRoutes.ts | 30 | 2 |
| server/routes/onboardingInlineRoutes.ts | 10 | 2 |
| server/routes/recruitmentRoutes.ts | 20 | 2 |
| server/routes/resendWebhooks.ts | 7 | 2 |

## How to use this report

1. Walk the `blocker` and `high` rows first; verify each citation.
2. For each true-positive, claim the file in `AGENT_HANDOFF.md` ACTIVE CLAIMS, fix it, leave a SESSION LOG entry citing the finding.
3. Re-run `npx tsx scripts/audit/scan-platform-health.ts` after each batch — the count delta is the audit trail.
