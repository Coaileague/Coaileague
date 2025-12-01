# CoAIleague - AI-Powered Workforce Intelligence Platform

### Overview
CoAIleague is a Fortune 500-grade multi-tenant autonomous workforce management platform. Its core purpose is to eliminate hardcoded values through centralized dynamic configuration, integrating financials with real Stripe payments. The platform features dynamic configuration, advanced AI-powered automation (scheduling, sentiment analysis, onboarding, health monitoring, dispute resolution), integrated financials, robust real-time notifications, and comprehensive error handling. It includes a HelpAI Integration, providing a multi-tenant AI orchestration layer for autonomous invoicing, payroll, notifications, and workflow automation. The project aims to deliver a production-ready solution with strong market potential for efficient workforce management.

### Current Phase: ChatServer Hub & Chatrooms Visual Enhancements (Complete)
**Status: HelpDesk room always visible with platform ownership indicators and compact grid layout**

Recently completed:
- **HelpDesk Room Seeding:** Idempotent initialization with HelpAI bot as active participant, visible in "All Organizations View"
- **Chatrooms Page Enhancements:** 
  - Platform/support-created rooms show unique Crown logo icon badge for ownership visibility
  - User-created rooms show standard message icon
  - Support bot status indicator (green "Bot" badge) on platform rooms
  - Open status always displayed for support rooms with green badge
  - Compact grid layout: 2-5 columns (mobile to desktop) vs previous 1-3, allowing 2x more rooms visible
  - Smaller card padding and text sizing for space efficiency
  - Real participant counts and live status (persistent database data)

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
- **Support Command Console (NEW):** Force-push updates system for support staff with 6 command endpoints (force-whats-new, force-notification, force-sync, broadcast-message, maintenance-mode, invalidate-cache), real-time WebSocket broadcast to all clients, React Query cache invalidation via ForceRefreshProvider, AI Brain audit logging, and SupportCommandPanel UI in chatrooms page.

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
