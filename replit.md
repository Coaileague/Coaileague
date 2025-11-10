# AutoForce™

## Overview
AutoForce™ (Autonomous Workforce Management Solutions) is a comprehensive workforce management platform designed for emergency services and other service-related industries. Its primary goal is to streamline operations, reduce administrative burdens, and serve as a single source of truth for workforce management. Key features include time tracking with advanced verification, automated invoice generation, smart hiring, compliance audit trails, and real-time analytics. The platform employs an "OS" design philosophy for extensibility and aims for a hybrid subscription and usage-based AI revenue model.

### HelpDesk Chat System
**Intelligent device-aware chat routing with NO entry barriers:**
- **Desktop Chat**: `client/src/pages/HelpDeskCab.tsx` → Route: `/chat` 
  - Full-featured IRC-style 3-column desktop chat
  - Gemini AI support, staff controls, queue management, user diagnostics
  - Auto-redirects mobile/small screens (≤768px) to `/mobile-chat`
  - Removed all authentication dialogs (Nov 10, 2025)
  
- **Mobile Chat**: `client/src/pages/modern-mobile-chat.tsx` → Route: `/mobile-chat`
  - Mobile-optimized responsive interface  
  - Touch-friendly FAB buttons, quick actions, slide-out panels
  - Auto-redirects desktop/large screens (>768px) to `/chat`
  - Removed ChatAgreementModal barrier (Nov 10, 2025)

**Smart Routing (Nov 10, 2025):**
- Automatic device detection via user agent + screen width
- Mobile users → `/mobile-chat` (optimized touch UI with FABs)
- Desktop users → `/chat` (full desktop experience)
- Both chats allow immediate access without popups, forms, or authentication requirements

## User Preferences
I prefer detailed explanations.
Do not make changes to the folder `Z`.
Do not make changes to the file `Y`.
All branding must be 100% AutoForce™ (not WorkforceOS).
FTC COMPLIANCE: All marketing claims must be factual and verifiable. Avoid monopolistic language.
  - **Latest Audit (Nov 9, 2025)**: ✅ FULLY COMPLIANT - All 8 OS modules verified against marketing claims. See `FTC_COMPLIANCE_VERIFICATION.md` for detailed evidence.
  - **Key Verified Features**: GPS + photo time tracking, automated payroll/billing, AI search/analytics, intelligent scheduling, onboarding workflows.
DESIGN: Professional Fortune 500 aesthetic - NO bright glowing colors (green-500, blue-500, amber-500, etc.). Use muted professional tones from design_guidelines.md only.
No Refresh Buttons.
Universal Back Navigation: Every page, modal, dialog needs clear exit/cancel/back buttons.
Unsaved Changes Protection: Forms and pages with editable content must warn users before navigation/close.
MOBILE-FIRST: All UI components must be fully responsive with proper text wrapping, scroll behavior, and touch-friendly tap targets.

## System Architecture
AutoForce™ is built on a modular "OS" design philosophy with **6 major autonomous systems** to ensure clean code, eliminate redundancy, and maximize automation.

### Role-Based Access Control (RBAC) & Tier Gating System
**Production-ready as of Nov 10, 2025** - Comprehensive role and subscription tier-based feature gating infrastructure:

**Backend Infrastructure:**
- **server/tierGuards.ts**: Middleware guards (requireStarter/requireProfessional/requireEnterprise) return HTTP 402 for tier upgrades
- **server/rbac.ts**: Role-based guards (requireSupervisor/requireManager/requireOrgAdmin/requireOrgOwner)
- **server/services/reportService.ts**: 5 major report functions with workspace scoping and RBAC validation
- **/api/workspace/access**: Endpoint returning { workspaceRole, subscriptionTier, isPlatformStaff } for current user
- **/api/reports/\***: Backend reporting routes with combined RBAC + tier guards

**Frontend Infrastructure:**
- **client/src/lib/osModules.ts**: Single source of truth registry with 38+ routes across 6 OS families (operations, billing, communications, intelligence, audit, admin)
- **client/src/hooks/useWorkspaceAccess.ts**: React hook for role/tier/platform staff status with loading states
- **client/src/components/app-sidebar.tsx**: Dynamically filtered sidebar using osModules, shows locked routes with Lock icon + tier badges + tooltips
- **client/src/pages/dashboard.tsx**: Role-aware dashboard with dynamic quick actions (6-8 cards), upgrade prompts for locked features, loading fallbacks

**Key Features:**
- **Hierarchical tier system**: Free → Starter → Professional → Enterprise with consistent HTTP 402 upgrade flow
- **Two-tier role hierarchy**: Platform staff (support/root admin) + workspace roles (staff → supervisor → dept manager → org admin → org owner)
- **Platform staff override**: Support/root admin bypass workspace tier restrictions for multi-tenant access
- **Loading resilience**: Dashboard uses employee-derived role fallback during workspace access query
- **Upgrade UX**: Locked features show Lock icon, amber tier badge, and tooltip with plan requirements
- **Comprehensive data-testid**: All interactive elements tagged for e2e testing

### The 6 Major OS Systems

**1. BillOS™** - Administrative Billing & Financial Management
- Automated invoice generation from approved billable hours
- Payroll processing with FLSA-compliant overtime and tax calculations
- Payment tracking and Stripe Connect integration
- Expense reimbursement management
- Timezone-aware holiday pay detection (2x multipliers)
- Usage-based billing for AI features

**2. OperationsOS™** - Field Operations Management
- Intelligent shift scheduling (hybrid constraint solver + GPT-4 validation)
- GPS-verified time tracking with photo verification
- Computer-aided dispatch with real-time incident management
- Asset tracking for vehicles and equipment
- Mobile-optimized shift calendars
- Real-time WebSocket updates

**3. CommOS™** - Unified Communications Platform
- Organization-specific chatrooms with role-based access
- Private messaging with AES-256-GCM encryption
- Automated email notifications and templates
- Support chat with Gemini AI integration (HelpDesk)
  - **Public Access**: HelpDesk chatroom (/chat) accessible without authentication barriers
  - **Mobile-First Responsive Design (Nov 10, 2025)**:
    - Navigation buttons with z-50 layering and pointer-events isolation for reliable tap detection
    - Responsive layout: stacked vertical (mobile) vs 3-column IRC-style (desktop)
    - ScrollArea with flex-1 min-h-0 for proper mobile scrolling
    - Text wrapping: break-words + overflow-wrap-anywhere + hyphens-auto in chat bubbles
    - Touch-friendly buttons: h-8 (32px) on mobile, h-7 (28px) on desktop
    - All dialogs: max-w-[95vw] with max-h-[calc(100vh-2rem)] for tiny viewports
    - Right sidebar hidden on mobile (hidden md:flex)
- File uploads, @mentions, read receipts
- Message reactions, threading, rich text formatting
- WebRTC-powered voice/video calling

**4. AuditOS™** - Compliance & Audit Trail Management
- Comprehensive activity logging for all user actions
- Automation lifecycle tracking (job start/complete/error events)
- SOC2/GDPR-compliant immutable audit trails
- System user attribution for automated actions
- Security monitoring and access control logs
- Compliance reporting and data export

**5. IntelligenceOS™** - AI-Powered Automation & Analytics
- Natural language search across all records (GPT-3.5-turbo)
- Real-time autonomous analytics with actionable insights (GPT-4o)
- AI support bot with sentiment detection and auto-resolution
- FAQ system with semantic search and auto-generation
- Document intelligence and policy management
- Predictive workforce analytics
- Usage tracking and AI billing

**6. MarketingOS™** - Automated Sales & Business Development *(COMING SOON)*
- AI-powered RFP hunting and contract generation
- Automated sales pipeline management
- Intelligent email campaign templates
- Deal closing automation with AI assistance
- Lead qualification and nurturing
- Client acquisition workflow automation
- Revenue forecasting and opportunity tracking

### UI/UX Decisions
The platform features a professional aesthetic using Deep Charcoal, Platinum neutrals, and Evergreen/Steel Blue/Professional Teal accents as defined in `design_guidelines.md`. It prioritizes a mobile-first approach with responsive layouts, accessible touch targets, and PWA capabilities. Branding includes an "AF" lightning bolt logo within a circular green gradient badge. Key navigation elements include a floating header, visible labels for navigation buttons, and contextual breadcrumb navigation.

### Technical Implementations
- **Frontend**: React, Vite, TypeScript, Wouter, TanStack Query, shadcn/ui, `react-hook-form`, `zod`.
- **Backend**: Express.js, TypeScript, with Zod for validation.
- **Database**: PostgreSQL with Drizzle ORM.
- **Authentication**: Custom session-based authentication supporting Replit Auth (OIDC) and Custom Auth, including features like account locking and password reset.
- **Multi-Tenancy**: Data isolation is managed on a workspace basis.
- **Role-Based Access Control (RBAC)**: A comprehensive two-tier hierarchical role system separates platform support roles from organization/tenant management roles, enforced via TypeScript and guard middleware.
- **Autonomous Automation System**: Production-ready anchor-based biweekly automation eliminates month-boundary drift for all major OS systems:
    - **Anchor-Based Biweekly Scheduling**: Seeded 14 days before recent occurrence to ensure first run happens on next scheduled day (no 2-week delay). Anchors advance every 14 days when schedule matches, maintaining consistent cadence even with zero work output.
    - **Daily Cron Execution**: All three jobs (BillOS™ invoicing 2 AM, OperationsOS™ scheduling 11 PM, BillOS™ payroll 3 AM) run daily, supporting weekly, biweekly, monthly, and semi-monthly cadences.
    - **Transaction Safety**: All anchor seeding and advancement operations wrapped in isolated row-scoped transactions for atomicity.
    - **Cadence Preservation**: Anchors advance on schedule match (not conditional on work output), preventing 4-week gaps when no invoices/schedules/payroll items are generated.
    - **Drift Detection**: Warns if anchor >30 days behind current date, enabling proactive monitoring.
    - **Backfill Support**: Standalone script seeds anchors for existing workspaces, ensuring smooth transition to anchor-based system.
    - **Automated Data Collection**: Production-ready billable and payroll hours aggregation services automatically collect, validate, and aggregate approved time entries with workspace-configured OT rules, FLSA-compliant weekly resets, employee-first grouping for deterministic OT, chronological sorting, batch-loaded rates, and N+1 query elimination. Services output structured summaries ready for invoice/payroll generation.
    - **Automation Audit Tracking**: All automation jobs emit comprehensive AuditOS™ lifecycle logs (job start, completion, error) per workspace with duration metrics and result metadata. System user context (`system-autoforce`) enables traceability. Logs queryable via audit action types: `automation_job_start`, `automation_job_complete`, `automation_job_error`, `automation_artifact_generated`.
- **BillOS™ Features**:
    - Invoice generation fully integrated with billable hours aggregator. Generates draft invoices with employee-grouped line items showing regular/OT/holiday hour breakdowns.
    - Payroll generation fully integrated with payroll hours aggregator. Generates pending payroll runs with FLSA-compliant tax calculations. Extended schema with `holidayHours` field for complete audit trail.
    - Handles mixed-rate scenarios, surfaces warnings for manager review, maintains backward-compatible approval workflow.
- **Security**: Includes Stripe webhook signature validation, payroll data protection, strict Zod validation, workspace scoping, and audit trails.
- **Production Monitoring**: Comprehensive observability infrastructure with error logging, performance metrics tracking, health checks, slow request detection, and graceful shutdown handling.

## External Dependencies
- **Database**: Neon (PostgreSQL)
- **ORM**: Drizzle ORM
- **Payment Processing**: Stripe Connect
- **Email**: Resend
- **AI**:
    - OpenAI GPT-3.5-turbo (HelpOS support bot, RecordOS search)
    - Gemini 2.0 Flash Exp (HelpDesk chat)
    - GPT-4 (ScheduleOS validation & explanation - greedy solver does optimization)
    - GPT-4-turbo (DisputeAI grievance analysis)
    - GPT-4o (PredictionOS predictions, InsightOS analytics)
    (All AI integrations include comprehensive usage tracking and billing in the aiUsage table.)
    - **Constraint Solving**: TypeScript greedy constraint solver for ScheduleOS™ intelligent shift assignments (enforces hard constraints, optimizes soft constraints like reliability/distance/performance)