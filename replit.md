# AutoForce™

## Overview
AutoForce™ (Autonomous Workforce Management Solutions) is a comprehensive platform powered by a unified AI Brain that autonomously manages end-to-end workforce operations. Its core purpose is to achieve complete automation—from intelligent scheduling and payroll to compliance monitoring and billing—with a 99% AI completion rate, minimizing human intervention. Key capabilities include AI-powered scheduling, automated invoice and payroll generation, smart hiring, compliance auditing, and real-time analytics. AutoForce™ targets emergency services and service-related industries with a hybrid subscription and usage-based revenue model, aiming for significant market potential through its autonomous capabilities.

## Recent Updates (Nov 21, 2025)
**HELPDESK INTAKE SYSTEM + TOOL TARGETING (Latest):**

**HelpOS Bot Auto-Ticket Creation:**
- **Feature**: Bot automatically creates support tickets for users who join HelpDesk without active tickets
- **Intake Flow**: Multi-step conversational gathering of subject → description → priority → ticket creation
- **Bot States Added**: `INTAKE_SUBJECT`, `INTAKE_DESCRIPTION`, `INTAKE_PRIORITY`, `CREATING_TICKET`
- **Ticket Generation**: Auto-generates `TKT-YYYY-NNNN` format ticket numbers (e.g., TKT-2025-0001)
- **Files Modified**: `server/helpos-bot.ts` (added intake state machine), `server/websocket.ts` (trigger on join), `server/storage.ts` (added `getActiveSupportTicket()`)
- **User Experience**: Users without tickets get guided through intake, users with tickets get normal queue welcome
- **Database**: Tickets stored in `supportTickets` table with full context for staff escalation

**Support Tool Context Targeting Fixed:**
- **Issue**: When staff right-clicked users, only "kick" targeted the selected user; macros, file requests, and KB links broadcasted to everyone
- **Fix**: Added `selectedUserId` and `selectedUserName` props to `AgentToolbelt`, updated all callbacks to accept `targetUserId` parameter
- **Implementation**: Tools now prefix targeted messages with `@UserName:` to clearly indicate recipient
- **Files Modified**: `client/src/components/agent-toolbelt.tsx`, `client/src/pages/HelpDesk.tsx`
- **Result**: All support tools (macros, file requests, KB links) now properly target the right-clicked user

**Chat History Disabled for Main HelpDesk:**
- **Change**: Main HelpDesk room (`/helpdesk`) now starts fresh each session - no old messages loaded
- **Rationale**: Users get individual help, don't need to see previous sessions from other people
- **Exception**: Escalated ticket rooms preserve full history for staff context
- **Files Modified**: `server/websocket.ts` (conditional history based on `isMainRoom`)

**Previous RBAC + CHAT SYSTEM FIXES:**

**System-Wide RBAC Bug Fixed (14 instances):**
- **Root Cause**: Permission checks throughout codebase were looking for role `'root'` (which doesn't exist in schema) instead of `'root_admin'`
- **Impact**: Platform owner couldn't kick users, access admin features, or use platform-level permissions
- **Files Fixed**: `server/websocket.ts`, `server/routes.ts`, `server/helpos-bot.ts`, `client/src/data/quickActions.ts`, `client/src/pages/comm-os.tsx`, `client/src/components/clean-context-menu.tsx`, `client/src/hooks/useFeatureFlags.ts`
- **Scope**: Kick user, ban user, escalation tickets, AI scheduling, role grants, HelpDesk access, MOTD creation, quick actions, feature flags, support staff queries

**WebSocket User List Sync Fixed:**
- **Root Cause**: `user_list_update` event used cached `client.userName` (platformRole title like "Admin Root") instead of real name from database
- **Fix**: Both `user_list_update` and `participants_update` now use `formatUserDisplayNameForChat()` for consistency
- **Result**: Chat messages and user sidebar now show identical names (e.g., "Brigido Guiton" everywhere, not "Admin Root")

**Message Display Race Condition Fixed:**
- **Root Cause**: Message filter used async state `resolvedConversationId` instead of synchronous ref, causing 0/36 messages accepted
- **Fix**: Changed to `resolvedConversationIdRef.current` for synchronous security checks
- **Result**: All 36/36 historical messages now load correctly on join

**UI/UX Chat Improvements:**
- Chat background changed from dark to white for readability
- Bot messages: `bg-blue-50` + `text-black` for maximum contrast
- User's own messages: light background + dark text (same as bot)
- All names now use `text-blue-900` (dark) for visibility on light backgrounds

**WebSocket Event Order Fixed:**
- Server now sends `conversation_joined` BEFORE `conversation_history` ensuring client has UUID before filtering
- Added `conversationId` to `conversation_history` payload for proper message filtering

**Progress Header Fixed:**
- Only shows for escalated tickets with real ticket IDs (not general /helpdesk chat)
- Eliminates "Loading ticket information..." blocking message for non-ticket conversations

## User Preferences
I prefer detailed explanations.
Do not make changes to the folder `Z`.
Do not make changes to the file `Y`.
All branding must be 100% AutoForce™ (not WorkforceOS).
FTC COMPLIANCE: All marketing claims must be factual and verifiable. Avoid monopolistic language.
DESIGN: Professional Fortune 500 aesthetic - NO bright glowing colors (green-500, blue-500, amber-500, etc.). Use muted professional tones from design_guidelines.md only.
No Refresh Buttons.
Universal Back Navigation: Every page, modal, dialog needs clear exit/cancel/back buttons.
Unsaved Changes Protection: Forms and pages with editable content must warn users before navigation/close.
MOBILE-FIRST: All UI components must be fully responsive with proper text wrapping, scroll behavior, and touch-friendly tap targets.

## System Architecture
AutoForce™ is powered by a **Unified AI Brain** that orchestrates autonomous operations across all platform features, primarily using Google Gemini 2.0 Flash Exp. The platform integrates intelligent scheduling, automated billing, payroll processing, communications, compliance monitoring, and analytics. User-facing branding emphasizes **AI Brain automation** over modular "OS" naming. The system features comprehensive Role-Based Access Control (RBAC) and Tier Gating across Free, Starter, Professional, and Enterprise levels with a two-tier role hierarchy.

**UI/UX Decisions:** The platform uses a professional aesthetic with **AutoForce Blue** (#2563eb) as the primary brand color, Deep Charcoal backgrounds, and Platinum neutrals, ensuring a unified color system. It prioritizes a mobile-first, responsive approach with PWA capabilities, an "AF" lightning bolt logo, and contextual breadcrumbs. A **Unified Navigation System** is implemented, with a left AppSidebar (collapsible peek rail) for desktop and a UniversalNavHeader (blue gradient top bar, hamburger menu, Sheet/Drawer navigation) for mobile, preventing duplicate menus. Responsive typography and table frameworks are used throughout.

**Technical Implementations:**
-   **Frontend**: React, Vite, TypeScript, Wouter, TanStack Query, shadcn/ui, `react-hook-form`, `zod`.
-   **Backend**: Express.js, TypeScript, Zod for validation.
-   **Database**: PostgreSQL with Drizzle ORM.
-   **Authentication**: Custom session-based authentication supporting Replit Auth (OIDC) and Custom Auth, including account locking and password reset.
-   **Multi-Tenancy**: Data isolation managed on a workspace basis.
-   **Security**: Stripe webhook validation, strict Zod validation, workspace scoping, audit trails, XSS protection (DOMPurify), IPv6-compliant rate limiting, and DB transaction safety.
-   **External Identifier System**: Human-readable IDs (ORG-XXXX, EMP-XXXX-00001, CLI-XXXX-00001, SUP-XXXX) for various entities, integrated with the AI Brain for audit trails.
-   **Autonomous Automation System**: Achieves 99% AI completion with 1% human governance for core operations like scheduling, invoice creation (Stripe), and payroll processing (Gusto). All actions are logged to an `aiEventStream` for auditing.
-   **Unified Gemini AI Brain**: Centralized AI intelligence system using Google Gemini 2.0 Flash Exp with a two-tier knowledge architecture (Global Intelligence Graph, Workspace Context Graphs), policy-based routing, confidence scoring for human approval workflows, and comprehensive audit trails. Includes a Proactive Monitoring System.
-   **AI Scheduling with Smart Approval Workflow**: Autonomous scheduling via Gemini, analyzing availability, skills, and workload, with human review for low-confidence schedules.
-   **Schedule Migration via Gemini Vision**: Multimodal AI for schedule extraction from external apps (PDFs/screenshots) using Gemini Vision API.
-   **Data Integrity System**: Event sourcing architecture with immutable audit trails, SHA-256 verification for AI actions, ID registry to prevent reuse, and Write-Ahead Logging (WAL) for transaction safety. Actor type tracking ensures accountability.
-   **Atomic Organization Registration Flow**: Transaction-safe registration process ensuring atomicity for User → Workspace → Expense Categories → Employee creation.
-   **Universal Migration System**: Provides comprehensive migration tracking for onboarding from external platforms, including `migrationJobs`, `migrationDocuments`, and `migrationRecords` tables, supporting various document types and AI Brain synchronization.
-   **HelpDesk Chat System**: Universal support chat system with mobile and desktop support. WebSocket backend automatically resolves support room slugs (e.g., 'helpdesk') to conversation UUIDs, auto-creates backing conversations on first join, and persists linkage via `updateSupportRoomConversation()`. Includes platform-wide fallback workspace for anonymous users, HelpOS AI assistant, role-based welcome messages, and auto-voice grants for guests.

## External Dependencies
-   **Database**: Neon (PostgreSQL)
-   **ORM**: Drizzle ORM
-   **Payment Processing**: Stripe Connect
-   **Email**: Resend
-   **AI**: Google Gemini (2.0 Flash Exp)
-   **Constraint Solving**: TypeScript greedy constraint solver
-   **Financial Integrations**: QuickBooks Online (QBO), Gusto