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
- **Gemini Function Calling (Dec 2025):** Complete 8-step workflow with multi-turn conversation loop. Tools: `search_faqs` (TEXT[] array handling via EXISTS+UNNEST), `create_support_ticket`, `get_business_insights`, `suggest_automation`, `recommend_platform_feature`, `update_faq`. Features max iteration guard (3), multi-part candidate response extraction, and best-effort tool result fallbacks when Gemini returns no text.
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
- **WebSocket Security (Dec 2025):** Session-based authentication for all WebSocket handlers. Identity derived from HTTP session cookies at connection time (`ws.serverAuth`), preventing client-supplied ID spoofing. Workspace validation enforces tenant isolation - non-staff users can only access conversations/notifications in their workspace. Guests isolated to helpdesk room without workspace context. Staff access audited for platform-wide operations.
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
- **AI Brain Master Orchestrator:** Central orchestration hub coordinating 61 actions across 12 categories (scheduling, payroll, compliance, escalation, analytics, notifications, automation, employee lifecycle, health checks, user assistance, file system, workflows, test runner), connecting Gemini AI to all platform services, and executing workflow chains with authorization validation and audit logging.
- **AI Brain File System Tools:** Comprehensive file access with read (line ranges), write/create, edit (search/replace), delete, list (recursive), search (regex), diff generation, and metadata retrieval. Protected paths (node_modules, .git, .env), allowed extensions only, and path traversal prevention.
- **AI Brain Code Editor API:** Full staged code editing workflow with 11 endpoints: stage, stage-batch, pending, change details, approve, reject, apply, rollback, read file, list files, and AI-request. Integrated with What's New notifications and WebSocket broadcasts.
- **AI Brain Authorization Service:** Role-based permission model with a 9-level role hierarchy and category-specific permission matrix, validating support staff credentials and logging all authorization checks.
- **AI Brain Platform Change Monitor:** Autonomous service scanning the platform for changes, generating AI-summarized notifications with severity classification, and broadcasting them to users.

**System Design Choices:**
- **Modularity:** Composed of 87 backend service modules and 220+ frontend routes.
- **Type Safety:** 100% LSP clean with zero compilation warnings.
- **Automation:** Features 10 scheduled autonomous jobs.
- **Audit Logging:** Comprehensive audit logging with a 365-day retention policy.
- **Security:** AES-256-GCM encryption, PBKDF2-SHA256 key derivation, RBAC, per-org credential isolation, and credential expiry warnings.
- **Unified Config Registry:** Single source of truth at `shared/config/registry.ts` with Zod validation.

### Consolidation Report (Dec 2025 Audit)
**Identified Dead Code:**
- `server/services/sentimentAnalysis.ts` - Exports `analyzeReviewSentiment` but never imported. Uses Gemini for review sentiment with persistence but redundant with `sentimentAnalyzer.ts`.

**Consolidation Candidates (Future Work):**
- **AI Bot Services:** `aiBot.ts` (OpenAI, minimal usage in queueReminderJob) and `helpai/helpAIBotService.ts` (Gemini, comprehensive) - Could merge into single unified service.
- **Sentiment Analysis:** `sentimentAnalysis.ts` and `sentimentAnalyzer.ts` - Similar functionality, different AI backends.
- **Notification Services:** 4 services with overlapping concerns (notificationService, aiNotificationService, universalNotificationEngine, notificationDigestService) - Could benefit from facade pattern.

**Properly Separated (Not Duplicates):**
- `oauth/gusto.ts` vs `partners/gusto.ts` - Correct separation (OAuth flow vs API operations)
- `oauth/quickbooks.ts` vs `partners/quickbooks.ts` - Correct separation
- Analytics services serve different purposes (data, AI insights, stats, owner analytics)

**Files with LSP Warnings (Non-Blocking):**
- `server/routes/ownerAnalytics.ts` - 6 type annotation warnings (runtime works)
- `server/services/partners/gusto.ts` - 20 diagnostics (requires Gusto API keys)
- `server/services/analyticsStats.ts` - 1 diagnostic

### External Dependencies
- **Stripe**: Payment processing, payroll, and financial integrations.
- **Resend**: Email delivery and notification workflows.
- **Gemini 2.0 Flash**: AI-driven features (document extraction, sentiment analysis, intelligent scheduling, HelpAI orchestration, business insights, FAQ learning).
- **WebSocket**: Real-time notifications.
- **Google Cloud Storage (GCS)**: File management.
- **PostgreSQL**: Primary relational database.
- **Twilio**: SMS notifications (requires TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_PHONE_NUMBER secrets).