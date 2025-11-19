# AutoForce™

## Overview
AutoForce™ (Autonomous Workforce Management Solutions) is a comprehensive platform powered by a unified AI Brain that autonomously manages workforce operations end-to-end. The platform emphasizes complete automation—from intelligent scheduling and payroll to compliance monitoring and billing—with minimal human intervention (99% AI completion rate). Key capabilities include AI-powered scheduling, automated invoice and payroll generation, smart hiring, compliance auditing, and real-time analytics. AutoForce™ targets emergency services and service-related industries with a hybrid subscription and usage-based revenue model.

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
AutoForce™ is powered by a **Unified AI Brain** that orchestrates autonomous operations across all platform features. The platform integrates intelligent scheduling, automated billing, payroll processing, communications, compliance monitoring, and analytics—all managed by Google Gemini 2.0 Flash Exp. User-facing branding emphasizes **AI Brain automation** over modular "OS" naming (e.g., "AI Scheduling" instead of "ScheduleOS™"). The platform features comprehensive Role-Based Access Control (RBAC) and Tier Gating across Free, Starter, Professional, and Enterprise levels, with a two-tier role hierarchy.

### UI/UX Decisions
The platform features a professional aesthetic with **AutoForce Blue** (#2563eb) as the primary brand color, Deep Charcoal backgrounds, and Platinum neutrals. The unified color system ensures consistent branding across all public pages, workspace interfaces, dialogs, modals, and loading screens. It prioritizes a mobile-first, responsive approach with PWA capabilities, an "AF" lightning bolt logo, and contextual breadcrumbs. **Unified Navigation System:** Desktop uses left AppSidebar with collapsible peek rail (SidebarTrigger + WorkspaceSwitcher in top header). Mobile uses UniversalNavHeader with blue gradient top bar, hamburger menu, and Sheet/Drawer navigation. No duplicate menus - clean single-source navigation on each platform. Responsive typography and table frameworks are used throughout.

### Technical Implementations
-   **Frontend**: React, Vite, TypeScript, Wouter, TanStack Query, shadcn/ui, `react-hook-form`, `zod`.
-   **Backend**: Express.js, TypeScript, Zod for validation.
-   **Database**: PostgreSQL with Drizzle ORM.
-   **Authentication**: Custom session-based authentication supporting Replit Auth (OIDC) and Custom Auth, including account locking and password reset.
-   **Multi-Tenancy**: Data isolation managed on a workspace basis.
-   **Security**: Stripe webhook validation, strict Zod validation, workspace scoping, audit trails, XSS protection (DOMPurify), IPv6-compliant rate limiting, and DB transaction safety.
-   **External Identifier System**: Human-readable IDs (ORG-XXXX, EMP-XXXX-00001, CLI-XXXX-00001, SUP-XXXX) for organizations, employees, clients, and support tickets, integrated with the AI Brain for audit trails.
-   **Autonomous Automation System**: Complete end-to-end autonomous operation (99% AI, 1% human governance) with anchor-based biweekly scheduling. Features three-phase execution: (1) AI Brain schedule generation via Gemini with auto-approval for high-confidence schedules (≥0.95) and human review queue for low-confidence proposals; (2) Automatic Stripe invoice creation, finalization, and email delivery to clients; (3) Gusto payroll processing with safety mode (defaults to manual approval via autoSubmitPayroll=false). All actions logged to aiEventStream for complete audit trail. Database columns: workspaces.auto_submit_payroll, clients.stripe_customer_id, invoices.stripe_invoice_id, invoices.sent_at.
-   **Workroom System**: Shift-linked room creation, multi-file upload, automated room lifecycle, participant management, and comprehensive audit trail.
-   **Premium Chat Features**: Real-time WebSocket chat with typing indicators, read receipts, participant tracking, and quick-insert macros.
-   **Navigation Protection System**: Reusable `useNavigationProtection` hook provides three-layer protection against accidental navigation from active sessions.
-   **Partner API Usage Tracking**: Middleware-based tracking with caller-supplied deterministic IDs for idempotency.
-   **Cost Aggregation & Billing**: Automated cost calculation and Stripe invoice generation, aggregating AI usage and partner API costs per workspace with tier-based markup.
-   **Partner OAuth Integration**: Secure OAuth 2.0 for QuickBooks Online and Gusto, featuring AES-256-GCM encryption, PKCE, CSRF protection, auto-refresh, and multi-tenant isolation.
-   **Unified Gemini AI Brain**: A single, centralized AI intelligence system orchestrating all autonomous features across the platform. Uses Google Gemini 2.0 Flash Exp. Features a two-tier knowledge architecture (Global Intelligence Graph, Workspace Context Graphs), unified job execution, policy-based routing, confidence scoring for human approval workflows, and comprehensive audit trails. Includes a Proactive Monitoring System with ContextLoader, MonitorRegistry, and AlertManager, backed by four new database schemas for monitoring context, tasks, alerts, and notification history.
-   **3-Tier Support Chat System**: Multi-level support system with FloatingSupportChat, Guest Escalation Flow, and Universal HelpDesk.
-   **AI Scheduling with Smart Approval Workflow**: Autonomous scheduling (99% AI, 1% human governance) via Gemini, analyzing availability, skills, and workload, with human review for low-confidence schedules.
-   **Schedule Migration via Gemini Vision**: Multimodal AI for schedule extraction from external apps (PDFs/screenshots) using Gemini Vision API for OCR and table extraction.
-   **Enhanced Constraint System**: Weighted constraint optimization distinguishing hard from soft constraints, integrated with predictive metrics.
-   **AI-Powered Employee Scoring System**: Comprehensive weighted scoring algorithm for intelligent shift matching.
-   **Fill Request Marketplace**: External contractor matching system for shifts.
-   **Universal Responsive Schedule with Drag-and-Drop**: Full-featured scheduling with desktop drag-and-drop and touch-optimized mobile interface.
-   **Universal Time Tracking System**: Consolidated time tracking with GPS verification, photo capture, and three-view navigation (Clock, Timesheet, Approvals) with manager approval workflows.
-   **Comprehensive Data Integrity System**: Event sourcing architecture with immutable audit trails, SHA-256 verification for AI actions, ID registry to prevent reuse, and Write-Ahead Logging (WAL) for transaction safety. Actor type tracking (END_USER, SUPPORT_STAFF, AI_AGENT, SYSTEM) ensures complete accountability. Features deterministic hash generation, row-count verification for all writes, and composite indexes for high-volume queries.
-   **User Identity Display & RBAC Mobile Menu**: Comprehensive user identification system displaying employee ID (EMP-XXXX-00001), organization ID (ORG-XXXX), workspace role, and subscription tier across desktop and mobile interfaces. Mobile user menu (MobileUserMenu.tsx) features Sheet/Drawer component with RBAC-filtered navigation, role caching via useRef to prevent privilege leakage during query refetches, nullish coalescing (??) for boolean role flags to handle demotions correctly, and secure sign-out flow. Desktop dashboard displays identity badges below welcome message. Uses useIdentity and useWorkspaceAccess hooks for real-time role synchronization. Tested via playwright e2e tests validating authentication, RBAC filtering, session termination, and protected route access control.
-   **Universal Labeled Navigation Menu**: All navigation buttons (Tutorial, Search, Help, Feedback, What's New) display both icons and text labels universally across desktop AppSidebar and mobile UniversalNavHeader. Components updated: HelpDropdown, FeedbackWidget, WhatsNewBadge changed from icon-only (`size="icon"`) to labeled buttons (`size="sm"` with `justify-start gap-2 h-9 w-full`). Layout uses grid (cols-2) for Tutorial/Search and Help/Feedback pairs, full width for What's New with badge count positioned via ml-auto. Quick Tools section added to mobile UniversalNavHeader Sheet menu with PlanBadge, Tutorial, Search, Help, Feedback, and What's New buttons (guarded by `user && !isLoading` to prevent auth timing issues). AppSidebar collapsed state includes icon-only versions of all Quick Tools buttons to prevent layout overflow. Desktop and mobile now feature identical labeled navigation controls for consistent UX.
-   **Atomic Organization Registration Flow**: Truly atomic transaction-safe registration using db.transaction(). Pre-generates organization identifiers (before transaction), then creates User → Workspace → Expense Categories → Employee in a single atomic transaction. All core operations use `tx` client for true atomicity. Expense category seeding only catches duplicate key violations (code='23505') and re-throws other errors to abort transaction. Post-transaction external ID provisioning (ensureOrgIdentifiers, attachEmployeeExternalId) executes outside transaction for safe retry without jeopardizing main commit. If any core step fails, entire registration rolls back. External IDs can be attached later via retry mechanism if provisioning fails. Architect verified: PASS.
-   **Autonomous Scheduler Payroll Fix**: Fixed gustoService.processPayroll parameter mismatch - now correctly passes 3 arguments: (workspaceId, periodStartDate, periodEndDate). Previously missing workspaceId parameter caused LSP errors and would break payroll automation when auto-submit enabled.
-   **Complete OS Branding Removal**: Removed ALL "OS" terminology across 476 files - replaced with "AI Brain" feature naming (ScheduleOS™→AI Scheduling, PayrollOS™→AI Payroll, HireOS™→AI Hiring, QueryOS™→AI Diagnostics, etc.). Fixed syntax errors from branding replacement in autonomousScheduler.ts, routes.ts, storage.ts, and App.tsx where "AI [ClassName]" typos occurred in import/export statements.
-   **Universal Migration System Database Schema**: Added comprehensive migration tracking tables for onboarding from external platforms: (1) migrationJobs - Track overall migration sessions with AI Brain sync; (2) migrationDocuments - Track individual uploaded files with confidence scoring; (3) migrationRecords - Track extracted records with accessibleByRoles array for all workspace roles (org_owner, org_admin, org_manager, employee, support_staff) ensuring persistent data access across the platform. Database includes enums for migration_document_type (employees, payroll, schedules, invoices, timesheets, clients, other) and migration_job_status (uploaded, analyzing, reviewed, importing, completed, failed, cancelled). Existing schedule migration at server/services/scheduleMigration.ts and client/src/components/schedule-migration-dialog.tsx updated with proper API routes (/api/ai-scheduling/).

## External Dependencies
-   **Database**: Neon (PostgreSQL)
-   **ORM**: Drizzle ORM
-   **Payment Processing**: Stripe Connect
-   **Email**: Resend
-   **AI**: Google Gemini (2.0 Flash Exp)
-   **Constraint Solving**: TypeScript greedy constraint solver
-   **Financial Integrations**: QuickBooks Online (QBO), Gusto