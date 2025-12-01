# CoAIleague - AI-Powered Workforce Intelligence Platform

### Overview
CoAIleague is a Fortune 500-grade multi-tenant autonomous workforce management platform. Its core purpose is to eliminate hardcoded values through centralized dynamic configuration, integrating financials with real Stripe payments. The platform features dynamic configuration, advanced AI-powered automation (scheduling, sentiment analysis, onboarding, health monitoring, dispute resolution), integrated financials, robust real-time notifications, and comprehensive error handling. It includes a HelpAI Integration, providing a multi-tenant AI orchestration layer for autonomous invoicing, payroll, notifications, and workflow automation. The project aims to deliver a production-ready solution with strong market potential for efficient workforce management.

### Current Phase: AI Brain Authorization & Master Orchestrator (Completed)
**Status: Complete role-based authorization system enabling support staff to command AI Brain with full audit trails**

Recently completed:
- **AI Brain Master Orchestrator:** Central hub connecting ALL 80+ platform services with 28 registered actions across 8 categories (scheduling, payroll, invoicing, analytics, compliance, notifications, automation, user_assistance)
- **AI Brain Authorization Service:** Role-based access control with 9-level hierarchy (employee → root_admin), category-specific permission matrix, authorization validation at action and workflow execution levels
- **Workflow Chains:** Cross-service coordination with step-by-step authorization checks, comprehensive audit logging, and error handling
- **Support Command Authority:** Only properly authenticated support roles (support_agent, support_manager, sysop, deputy_admin, root_admin) can trigger AI actions; all commands logged with audit trail
- **Action Registry:** HelpAI Orchestrator manages 28 actions including scheduling generation, payroll calculations, analytics insights, platform updates, diagnostics, and user assistance

Previous phase (AI Brain Code Editor):
- **AI Brain Code Editor Service:** Full-featured code editing service at `server/services/ai-brain/aiBrainCodeEditor.ts` with file validation, diff generation, staging workflow, and rollback support
- **Database Schema:** Three new tables (`staged_code_changes`, `code_change_batches`, `batch_code_change_links`) for tracking code changes with approval workflow
- **HelpAI Orchestrator Integration:** 7 code actions registered (code.stage_change, code.stage_batch, code.get_pending, code.approve, code.reject, code.apply, code.rollback)
- **Support Console Endpoints:** 8 new REST endpoints at `/api/support/command/code/*` for staging, reviewing, approving, rejecting, applying, and rolling back code changes
- **Defense-in-Depth Validation:** Triple-layer status validation (route → orchestrator → service) to ensure code changes follow proper approval workflow
- **What's New Integration:** Applied code changes automatically generate platform update notifications to end users
- **Admin UI Panel:** CodeChangeReviewPanel component at `client/src/components/code-change-review-panel.tsx` with tabbed views (Pending/Approved/Applied/Rejected), diff viewer, approve/reject actions with review notes, apply dialog with What's New toggle, and rollback capability

Recently completed (prior):
- **AI Brain Code Editor Service:** Full-featured code editing service at `server/services/ai-brain/aiBrainCodeEditor.ts` with file validation, diff generation, staging workflow, and rollback support
- **Database Schema:** Three new tables (`staged_code_changes`, `code_change_batches`, `batch_code_change_links`) for tracking code changes with approval workflow
- **HelpAI Orchestrator Integration:** 7 new actions registered (code.stage_change, code.stage_batch, code.get_pending, code.approve, code.reject, code.apply, code.rollback)
- **Support Console Endpoints:** 8 new REST endpoints at `/api/support/command/code/*` for staging, reviewing, approving, rejecting, applying, and rolling back code changes
- **Defense-in-Depth Validation:** Triple-layer status validation (route → orchestrator → service) to ensure code changes follow proper approval workflow
- **What's New Integration:** Applied code changes automatically generate platform update notifications to end users
- **Admin UI Panel:** CodeChangeReviewPanel component at `client/src/components/code-change-review-panel.tsx` with tabbed views (Pending/Approved/Applied/Rejected), diff viewer, approve/reject actions with review notes, apply dialog with What's New toggle, and rollback capability

Previous phase (Universal Animation System):
- **Universal Animation Engine:** Canvas-based visual effects system with 6 animation modes (search/radar, analyze/neural network, voice/waveform, warp/tunnel, success/checkmark, error/glitch)
- **Animation Control Service:** Backend service for AI Brain and Support Console to dynamically control animations via WebSocket broadcasts
- **Seasonal Theme System:** Auto-detected seasonal themes (winter, spring, summer, autumn, holiday, halloween, valentines) with unique color palettes
- **Support Console Integration:** Animation control endpoints at `/api/support/command/animation`, `/api/support/command/animation/state`, `/api/support/command/animation/seasonal`
- **WebSocket Real-time Control:** Animation commands broadcast to all connected clients via existing WebSocket infrastructure
- **Frontend Context:** UniversalAnimationProvider integrated in App.tsx with navigation transition support

Previous phase (ChatServer Hub & Chatrooms Visual Enhancements):
- **HelpDesk Room Seeding:** Idempotent initialization with HelpAI bot as active participant
- **Chatrooms Page Enhancements:** Crown icon badge for platform rooms, Bot status badges, compact grid layout (2-5 columns)

### Route Mapping
| Old Route | New Route |
|-----------|-----------|
| /comm-os | /communications |
| /query-os | /diagnostics |
| /training-os | /training |
| /budget-os | /budgeting |
| /record-os | /records |
| /insight-os | /insights |
| /os-family/communication | /category/communication |
| /os-family/operations | /category/operations |
| /os-family/growth | /category/growth |
| /os-family/platform | /category/platform |

### User Preferences
- I prefer simple language
- I want iterative development
- Ask before making major changes
- I prefer detailed explanations

### System Architecture
The system employs a multi-tenant architecture with robust RBAC security and multi-tenant isolation, managing all application settings dynamically through centralized configuration files.

**UI/UX Decisions:**
- **Mobile & Responsive Design:** Centralized mobile configuration with breakpoints, WCAG-compliant touch targets, typography scaling, and a `ResponsiveScaleWrapper` component for accessibility, featuring a CoAIleague AI gradient.
- **Unified Pages:** Consolidated sales pages into `workspace-sales.tsx` and marketing/pricing pages into `universal-marketing.tsx`, driven by centralized configuration.
- **Notification Widgets:** 
  - WhatsNewBadge: Spinning star with color cycling (cyan → purple → pink → teal, 2.5s cycle) + number badge
  - NotificationBell: Glow-only animation (no spinning) + number badge, animation stops on interaction

**Technical Implementations:**
- **AI Brain Services:** Fully implemented for document extraction, issue detection, autonomous scheduling, and HelpAI orchestration, leveraging Gemini 2.0 Flash. Includes advanced FAQ knowledge governance, intelligent learning with deduplication, and gap detection systems.
- **Financials:** Real Stripe integration for payment processing, payroll, invoicing, deductions, and tax calculations.
- **Email Automation:** Full Resend integration with per-email billing and pre-built templates.
- **Notifications:** WebSocket infrastructure for real-time notifications and Resend for email delivery.
- **Compliance:** Daily certification checks, HR alerts, and a dispute resolution system.
- **Gamification:** Employee engagement system with achievements, points/XP, leaderboards, and streak tracking (feature-flagged).
- **Data Management:** PostgreSQL database with 150+ indexed and optimized tables.
- **Error Handling:** Global error boundaries and configurable error messages.
- **Workspace Configuration:** Customizable settings per workspace (bot toggles, tax rates, jurisdiction, industry, company size).
- **System Health:** A `/health` endpoint for database, Stripe, Gemini, WebSocket, and session health checks.
- **HelpAI Orchestration:** Multi-tenant AI brain for autonomous operations with encrypted credential storage (AES-256-GCM), SHA-256 integrity checksums, API registry, and per-org credential management.
- **Session Management:** Explicit session saves with PostgreSQL-backed session storage.
- **Time Tracking:** Clock-in/out, timesheet reports, CSV/PDF exports, AI anomaly detection, approval workflow, billing tracking, audit trail.
- **Client Billing:** Invoice generation from tracked hours, PDF export, email sending via Resend.
- **Advanced Scheduling:** Recurring shifts (patterns), shift swapping, one-click duplication.
- **Employee Availability:** CRUD module, team view, availability exceptions, conflict detection.
- **Calendar Sync:** iCal export/import, calendar subscriptions with tokens, Google Calendar stubs.
- **Analytics Dashboard:** 6 metrics endpoints (time, revenue, scheduling, performance), AI insights.
- **Heat Map Visualization:** 7x24 grid staffing intensity, AI staffing analysis and optimization.
- **Break Compliance:** 50-state labor law configuration, auto-scheduling, compliance checking.
- **AI Brain Platform Awareness:** 100+ features registry across 4 feature families (Communication, Operations, Growth, Platform), natural language feature discovery, diagnostic endpoints for support agents.
- **Automation Jobs:** 11 scheduled jobs (billing, scheduling, payroll, reminders, compliance, email).
- **Notification System:** Platform updates from AI brain, support staff maintenance alerts, real-time WebSocket delivery, user notification history tracking.
- **Support Command Console:** Force-push updates system for support staff with 6 command endpoints (force-whats-new, force-notification, force-sync, broadcast-message, maintenance-mode, invalidate-cache), real-time WebSocket broadcast to all clients, React Query cache invalidation via ForceRefreshProvider, AI Brain audit logging, and SupportCommandPanel UI in chatrooms page.
- **Universal Animation System:** Canvas-based animation engine with 6 modes (search, analyze, voice, warp, success, error), seasonal themes (8 themes with auto-detection), AI Brain/Support Console control via WebSocket, and UniversalAnimationProvider context integration.
- **AI Brain Code Editor:** Staged code editing system with approval workflow at `/api/support/command/code/*` (stage, stage-batch, pending, approve, reject, apply, rollback), integrated with HelpAI orchestrator (7 code.* actions), automatic What's New notifications on applied changes, triple-layer status validation for security.
- **AI Brain Master Orchestrator:** Central orchestration hub at `server/services/ai-brain/aiBrainMasterOrchestrator.ts` coordinating 28 actions across scheduling, payroll, analytics, notifications, automation, and user assistance. Connects Gemini AI to ALL 80+ platform services. Executes workflow chains with step-by-step authorization validation, comprehensive audit logging, and error handling for enterprise-grade reliability.
- **AI Brain Authorization Service:** Role-based permission model at `server/services/ai-brain/aiBrainAuthorizationService.ts` with 9-level role hierarchy and category-specific permission matrix. Validates support staff credentials, logs all authorization checks and command executions to audit trail, provides permission summary queries for security compliance.

**System Design Choices:**
- **Modularity:** Composed of 87 backend service modules and 220+ frontend routes.
- **Type Safety:** 100% LSP clean with zero compilation warnings.
- **Automation:** Features 10 scheduled autonomous jobs for payroll, invoicing, scheduling, compliance, trial expiry warnings, and email automation.
- **Audit Logging:** Comprehensive audit logging with 365-day retention policy.
- **Security:** AES-256-GCM encryption, PBKDF2-SHA256 key derivation, RBAC, per-org credential isolation, and credential expiry warnings.
- **Unified Config Registry:** Single source of truth at `shared/config/registry.ts` with Zod validation for branding, navigation, copy, services, and features.

### External Dependencies
- **Stripe**: Payment processing, payroll, and financial integrations.
- **Resend**: Email delivery and notification workflows.
- **Gemini 2.0 Flash**: AI-driven features (document extraction, sentiment analysis, intelligent scheduling, HelpAI orchestration, business insights, FAQ learning).
- **WebSocket**: Real-time notifications.
- **Google Cloud Storage (GCS)**: File management.
- **PostgreSQL**: Primary relational database.
- **Twilio**: SMS notifications (requires setup).
