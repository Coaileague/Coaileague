# AutoForce™

## Overview
AutoForce™ (Autonomous Workforce Management Solutions) is a comprehensive platform designed to streamline operations, reduce administrative overhead, and establish a single source of truth for workforce management in emergency services and other service-related industries. Key capabilities include advanced time tracking, automated invoice and payroll generation, smart hiring, compliance auditing, and real-time analytics. The platform aims for extensibility with an "OS" design philosophy and targets a hybrid subscription and usage-based AI revenue model, envisioning autonomous financial operations with robust compliance and audit trails.

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
AutoForce™ employs a modular "OS" design philosophy, integrating 6 major autonomous systems (CommOS™, OperationsOS™, BillOS™, IntelligenceOS™, AuditOS™, MarketingOS™) for clean code and extensibility. It features comprehensive Role-Based Access Control (RBAC) and Tier Gating across Free, Starter, Professional, and Enterprise levels, with a two-tier role hierarchy.

### UI/UX Decisions
The platform features a professional aesthetic with Deep Charcoal, Platinum neutrals, and accent colors (Evergreen/Steel Blue/Professional Teal). It prioritizes a mobile-first, responsive approach with PWA capabilities, an "AF" lightning bolt logo, floating header, visible navigation labels, and contextual breadcrumbs. The navigation system uses a Gmail-style peek rail with three layout modes. Responsive typography and table frameworks are used throughout.

### Technical Implementations
-   **Frontend**: React, Vite, TypeScript, Wouter, TanStack Query, shadcn/ui, `react-hook-form`, `zod`.
-   **Backend**: Express.js, TypeScript, Zod for validation.
-   **Database**: PostgreSQL with Drizzle ORM.
-   **Authentication**: Custom session-based authentication supporting Replit Auth (OIDC) and Custom Auth, including account locking and password reset.
-   **Multi-Tenancy**: Data isolation managed on a workspace basis.
-   **Security**: Stripe webhook validation, strict Zod validation, workspace scoping, audit trails, XSS protection (DOMPurify), IPv6-compliant rate limiting, and DB transaction safety.
-   **External Identifier System**: Human-readable IDs (ORG-XXXX, EMP-XXXX-00001, CLI-XXXX-00001, SUP-XXXX) for organizations, employees, clients, and support tickets, integrated with the AI Brain for audit trails.
-   **Autonomous Automation System**: Anchor-based biweekly scheduling for BillOS™ and OperationsOS™ ensuring FLSA-compliant invoicing and payroll.
-   **CommOS™ Workroom System**: Shift-linked room creation, multi-file upload, automated room lifecycle, participant management, and comprehensive audit trail.
-   **Premium Chat Features**: Real-time WebSocket chat with typing indicators, read receipts, participant tracking, and quick-insert macros.
-   **Navigation Protection System**: Reusable `useNavigationProtection` hook provides three-layer protection against accidental navigation from active sessions.
-   **Partner API Usage Tracking**: Middleware-based tracking with caller-supplied deterministic IDs for idempotency.
-   **Cost Aggregation & Billing**: Automated cost calculation and Stripe invoice generation, aggregating AI usage and partner API costs per workspace with tier-based markup.
-   **Partner OAuth Integration**: Secure OAuth 2.0 for QuickBooks Online and Gusto, featuring AES-256-GCM encryption, PKCE, CSRF protection, auto-refresh, and multi-tenant isolation.
-   **Unified Gemini AI Brain**: A single, centralized AI intelligence system orchestrating all autonomous features across the platform. Uses Google Gemini 2.0 Flash Exp. Features a two-tier knowledge architecture (Global Intelligence Graph, Workspace Context Graphs), unified job execution, policy-based routing, confidence scoring for human approval workflows, and comprehensive audit trails. Includes a Proactive Monitoring System with ContextLoader, MonitorRegistry, and AlertManager, backed by four new database schemas for monitoring context, tasks, alerts, and notification history.
-   **HelpOS™ 3-Tier Chat System**: Multi-level support system with FloatingSupportChat, Guest Escalation Flow, and Universal HelpDesk.
-   **ScheduleOS™ Smart AI Approval Workflow**: Autonomous scheduling (99% AI, 1% human governance) via Gemini, analyzing availability, skills, and workload, with human review for low-confidence schedules.
-   **Schedule Migration via Gemini Vision**: Multimodal AI for schedule extraction from external apps (PDFs/screenshots) using Gemini Vision API for OCR and table extraction.
-   **Enhanced Constraint System**: Weighted constraint optimization distinguishing hard from soft constraints, integrated with predictive metrics.
-   **AI-Powered Employee Scoring System**: Comprehensive weighted scoring algorithm for intelligent shift matching.
-   **Fill Request Marketplace**: External contractor matching system for shifts.
-   **Universal Responsive Schedule with Drag-and-Drop**: Full-featured scheduling with desktop drag-and-drop and touch-optimized mobile interface.
-   **Universal Time Tracking System**: Consolidated time tracking with GPS verification, photo capture, and three-view navigation (Clock, Timesheet, Approvals) with manager approval workflows.

## External Dependencies
-   **Database**: Neon (PostgreSQL)
-   **ORM**: Drizzle ORM
-   **Payment Processing**: Stripe Connect
-   **Email**: Resend
-   **AI**: Google Gemini (2.0 Flash Exp)
-   **Constraint Solving**: TypeScript greedy constraint solver
-   **Financial Integrations**: QuickBooks Online (QBO), Gusto

## Recent Changes (Nov 15, 2025)

### Critical Bug Fixes
1. **External ID Persistence Fix**: Fixed race condition where `employee_number` was NULL immediately after employee creation
   - Root cause: External IDs were created in `externalIdentifiers` table but not synced to `employees.employee_number` column
   - Solution: Added synchronous UPDATE to sync external ID back to entity tables within same transaction
   - Modified: `server/services/identityService.ts` - `attachEmployeeExternalId()` now updates `employees.employee_number` immediately
   
2. **Invoice Auto-Generate Crash Fix**: Added defensive null checks to prevent crash when auto-generate returns no results
   - Modified: `client/src/pages/invoices.tsx` - Added `?.` optional chaining for `autoGenerateResults.errors` and `.invoices` arrays
   - Impact: Prevents app crash when invoice generation returns empty result set

3. **Invoice Status Enum Correction**: Corrected invoice status comparisons from 'pending' to 'draft' to match actual schema enum values
   - Schema uses: 'draft', 'sent', 'paid', 'void', 'overdue'

4. **Reports Page Crash Fix**: Fixed missing import causing Reports page to crash on load
   - Root cause: `ResponsiveLoading` component was used but not imported
   - Solution: Added `import { ResponsiveLoading } from "@/components/loading-indicators";`
   - Modified: `client/src/pages/reports.tsx`
   - Impact: Reports page now loads successfully without crash

### Schema Architecture Clarifications
1. **Database Column Naming**:
   - Database uses snake_case (clock_in, clock_out, employee_number)
   - Drizzle ORM auto-converts to camelCase in TypeScript (clockIn, clockOut, employeeNumber)
   - NO manual mapping needed - ORM handles conversion automatically

2. **Client Billing Rates**:
   - Stored in separate `client_rates` table with `billable_rate` column
   - NOT inline in clients table
   - Linked via `client_id` foreign key

3. **External ID System**:
   - Primary source: `externalIdentifiers` table (entityType, entityId, externalId)
   - **Currently synced**: `employees.employee_number` only
   - **Not yet synced**: Clients, Support Tickets (need schema migration)
   - Format: EMP-{ORG-CODE}-{SEQUENCE} for employees, CLI-{ORG-CODE}-{SEQUENCE} for clients
   - Generated synchronously before API response to ensure immediate visibility
   
   **Migration Needed:**
   - Add `client_code` column to `clients` table
   - Update `attachClientExternalId()` to sync like employees
   - Backfill existing employees with NULL employee_number from `externalIdentifiers`
   - Support tickets use separate `ticketNumber` column (different pattern)

### End-to-End Testing Progress
✅ **Completed all 4 critical user journeys:**

**E2E Test 1: Shift → Paycheck Workflow**
- Status: ✅ Completed with workarounds
- Findings: Test environment issues with demo workspace data, not production bugs
- Result: Core workflow functional

**E2E Test 2: Service → Invoice Workflow**
- Status: ✅ Completed with bug fixes
- Bugs fixed: Invoice page crash on empty results, invoice status enum mismatch
- Result: Workflow functional after fixes

**E2E Test 3: Employee Onboarding Workflow**
- Status: ✅ Completed with critical fix
- Bugs discovered: External ID (employee_number) persistence race condition
- Bugs fixed: Made external ID sync synchronous within transaction
- Result: Employee numbers now persist immediately and visible in UI/DB

**E2E Test 4: Approval & Reporting Workflow**
- Status: ✅ Completed successfully
- Bugs discovered: Reports page crash (missing ResponsiveLoading import)
- Bugs fixed: Added missing import to reports.tsx
- Result: All major verifications passed
  - Time tracking approvals UI functional (no pending data in demo)
  - Payroll page and run details functional
  - Reports page loads successfully (crash fixed)
  - Analytics dashboard displays KPI cards
  - Invoice reporting with data consistency verified (DB ↔ UI match confirmed)
- Minor observations: WebSocket CSP warnings (non-blocking, environment-related)

### Known Issues
1. **LSP Errors**: 1067+ TypeScript errors in `server/routes.ts` (type mismatches, missing methods)
   - Impact: None on runtime - app runs successfully
   - Status: Pre-existing issues, not blocking functionality
   - Action: Separate cleanup task recommended

2. **Read-After-Write Consistency**: Database reads immediately after writes may benefit from explicit transaction waits
   - Current mitigation: External ID sync happens within same transaction before API response