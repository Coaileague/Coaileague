# CoAIleague - AI-Powered Workforce Intelligence Platform

### Overview
CoAIleague is a Fortune 500-grade multi-tenant autonomous workforce management platform. Its core purpose is to eliminate hardcoded values through centralized dynamic configuration, integrating financials with real Stripe payments. The platform features dynamic configuration, advanced AI-powered automation (scheduling, sentiment analysis, onboarding, health monitoring, dispute resolution), integrated financials, robust real-time notifications, and comprehensive error handling. It includes a HelpAI Integration, providing a multi-tenant AI orchestration layer for autonomous invoicing, payroll, notifications, and workflow automation. The project aims to deliver a production-ready solution with strong market potential for efficient workforce management.

### Current Phase: AI-Powered Notification System (Foundation Complete)
**Status: Database Schema Added - Ready for Service Implementation**

Successfully added 4 new database tables to support the AI notification system:
1. **platform_updates** - Stores platform updates from AI brain (What's New badge)
2. **maintenance_alerts** - Stores maintenance alerts from support staff (notification bell)
3. **notification_history** - Tracks user engagement with notifications
4. **maintenance_acknowledgments** - Tracks which users have acknowledged maintenance alerts

### Next: Autonomous Multi-Phase Implementation
The notification system requires 5 parallel phases that need Autonomous mode with subagent execution:
1. **AI Notification Service** - AI brain generates and pushes updates
2. **Support Staff System** - Maintenance alert CRUD and broadcasting
3. **WebSocket Integration** - Real-time message delivery to clients
4. **API Endpoints** - REST endpoints for notifications and alerts
5. **Frontend Integration** - Connect What's New badge and notification bell to live updates

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
- **AI Brain Platform Awareness:** 100+ features registry across 4 OS families, natural language feature discovery, diagnostic endpoints for support agents.
- **Automation Jobs:** 11 scheduled jobs (billing, scheduling, payroll, reminders, compliance, email).
- **Notification System (NEW):** Platform updates from AI brain, support staff maintenance alerts, real-time WebSocket delivery, user notification history tracking.

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
