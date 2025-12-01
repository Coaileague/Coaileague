# CoAIleague - AI-Powered Workforce Intelligence Platform

### Overview
CoAIleague is a Fortune 500-grade multi-tenant autonomous workforce management platform. It eliminates hardcoded values through centralized dynamic configuration, integrating financials with real Stripe payments. Key capabilities include dynamic configuration, advanced AI-powered automation (scheduling, sentiment analysis, onboarding, health monitoring, dispute resolution), integrated financials, robust real-time notifications, and comprehensive error handling. It features a HelpAI Integration, providing a multi-tenant AI orchestration layer for autonomous invoicing, payroll, notifications, and workflow automation. The project aims to deliver a production-ready solution with strong market potential for efficient workforce management.

### User Preferences
- I prefer simple language
- I want iterative development
- Ask before making major changes
- I prefer detailed explanations

### System Architecture
The system employs a multi-tenant architecture with robust RBAC security and multi-tenant isolation, managing all application settings dynamically through centralized configuration files.

**UI/UX Decisions:**
- **Mobile & Responsive Design:** Centralized mobile configuration with breakpoints, WCAG-compliant touch targets, typography scaling, and a `ResponsiveScaleWrapper` component.
- **Unified Pages:** Consolidated sales pages (`workspace-sales.tsx`) and marketing/pricing pages (`universal-marketing.tsx`) driven by centralized configuration.
- **Notification Widgets:** `WhatsNewBadge` (spinning star with color cycling) and `NotificationBell` (glow-only animation).
- **Universal Animation System:** Canvas-based visual effects with 6 animation modes and auto-detected seasonal themes.

**Technical Implementations:**
- **AI Brain Services:** Fully implemented for document extraction, issue detection, autonomous scheduling, and HelpAI orchestration, leveraging Gemini 2.0 Flash. This includes advanced FAQ knowledge governance, intelligent learning, and gap detection.
- **Financials:** Real Stripe integration for payment processing, payroll, invoicing, deductions, and tax calculations.
- **Email Automation:** Full Resend integration with per-email billing and pre-built templates.
- **Notifications:** WebSocket infrastructure for real-time notifications and Resend for email delivery.
- **Compliance:** Daily certification checks, HR alerts, and a dispute resolution system.
- **Gamification:** Employee engagement system with achievements, points/XP, leaderboards, and streak tracking (feature-flagged). Integrated with onboarding (25pts/step, 200 bonus), tutorials (10pts/step, 50 bonus), org migration (scaled rewards up to 350pts), and org setup (50/30/500pts). Emits milestone events for real-time celebration.
- **Data Management:** PostgreSQL database with 150+ indexed and optimized tables.
- **Error Handling:** Global error boundaries and configurable error messages.
- **Workspace Configuration:** Customizable settings per workspace.
- **System Health:** A `/health` endpoint for monitoring database, Stripe, Gemini, WebSocket, and session health.
- **HelpAI Orchestration:** Multi-tenant AI brain for autonomous operations with encrypted credential storage (AES-256-GCM), SHA-256 integrity checksums, API registry, and per-org credential management.
- **Session Management:** Explicit session saves with PostgreSQL-backed session storage.
- **Time Tracking:** Clock-in/out, timesheet reports, AI anomaly detection, and approval workflow.
- **Client Billing:** Invoice generation from tracked hours, PDF export, email sending.
- **Advanced Scheduling:** Recurring shifts, shift swapping, one-click duplication.
- **Employee Availability:** CRUD module, team view, availability exceptions, conflict detection.
- **Calendar Sync:** iCal export/import, calendar subscriptions.
- **Analytics Dashboard:** 6 metrics endpoints (time, revenue, scheduling, performance) and AI insights.
- **Heat Map Visualization:** 7x24 grid staffing intensity, AI staffing analysis and optimization.
- **Break Compliance:** 50-state labor law configuration, auto-scheduling, compliance checking.
- **AI Brain Platform Awareness:** 100+ features registry across 4 feature families, natural language feature discovery, diagnostic endpoints.
- **Automation Jobs:** 12 scheduled jobs (billing, scheduling, payroll, reminders, compliance, email, platform change monitoring).
- **AI Brain Platform Change Monitor:** Autonomous service that scans codebase, schema, services, and health every 15 minutes. Uses Gemini AI to generate intelligent change summaries, classifies by severity, and notifies all users via notifications table and WebSocket broadcasts. Support console endpoints for manual triggering and history viewing.
- **Notification System:** Platform updates from AI brain, support staff maintenance alerts, real-time WebSocket delivery, user notification history tracking.
- **Support Command Console:** Force-push updates system for support staff with 6 command endpoints and real-time WebSocket broadcast.
- **AI Brain Code Editor:** Staged code editing system with approval workflow, integrated with HelpAI orchestrator, and automatic What's New notifications.
- **AI Brain Master Orchestrator:** Central orchestration hub coordinating 28 actions across various categories, connecting Gemini AI to all platform services, and executing workflow chains with authorization validation and audit logging.
- **AI Brain Authorization Service:** Role-based permission model with a 9-level role hierarchy and category-specific permission matrix, validating support staff credentials and logging all authorization checks.
- **AI Brain Platform Change Monitor:** Autonomous service scanning the platform for changes, generating AI-summarized notifications with severity classification, and broadcasting them to users.

**System Design Choices:**
- **Modularity:** Composed of 87 backend service modules and 220+ frontend routes.
- **Type Safety:** 100% LSP clean with zero compilation warnings.
- **Automation:** Features 10 scheduled autonomous jobs.
- **Audit Logging:** Comprehensive audit logging with a 365-day retention policy.
- **Security:** AES-256-GCM encryption, PBKDF2-SHA256 key derivation, RBAC, per-org credential isolation, and credential expiry warnings.
- **Unified Config Registry:** Single source of truth at `shared/config/registry.ts` with Zod validation.

### External Dependencies
- **Stripe**: Payment processing, payroll, and financial integrations.
- **Resend**: Email delivery and notification workflows.
- **Gemini 2.0 Flash**: AI-driven features (document extraction, sentiment analysis, intelligent scheduling, HelpAI orchestration, business insights, FAQ learning).
- **WebSocket**: Real-time notifications.
- **Google Cloud Storage (GCS)**: File management.
- **PostgreSQL**: Primary relational database.
- **Twilio**: SMS notifications (requires TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_PHONE_NUMBER secrets).