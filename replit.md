# CoAIleague - AI-Powered Workforce Intelligence Platform

## Overview
CoAIleague is a Fortune 500-grade multi-tenant autonomous workforce management platform. Its core purpose is to eliminate hardcoded values through centralized dynamic configuration, integrating financials with real Stripe payments. The platform features dynamic configuration, advanced AI-powered automation (scheduling, sentiment analysis, onboarding, health monitoring, dispute resolution), integrated financials, robust real-time notifications, and comprehensive error handling. It includes a HelpAI Integration, providing a multi-tenant AI orchestration layer for autonomous invoicing, payroll, notifications, and workflow automation. The project aims to deliver a production-ready solution with strong market potential for efficient workforce management.

## User Preferences
- I prefer simple language
- I want iterative development
- Ask before making major changes
- I prefer detailed explanations

## System Architecture
The system employs a multi-tenant architecture with robust RBAC security and multi-tenant isolation, managing all application settings dynamically through centralized configuration files.

**UI/UX Decisions:**
- **Mobile & Responsive Design:** Centralized mobile configuration with breakpoints, WCAG-compliant touch targets, typography scaling, and a `ResponsiveScaleWrapper` component for accessibility, featuring a CoAIleague AI gradient.

**Technical Implementations:**
- **AI Brain Services:** Fully implemented for document extraction, issue detection, autonomous scheduling, and HelpAI orchestration, leveraging Gemini 2.0 Flash. Includes advanced FAQ knowledge governance, intelligent learning with deduplication, and gap detection systems.
- **Financials:** Real Stripe integration for payment processing, payroll, invoicing, deductions, and tax calculations.
- **Email Automation:** Full Resend integration with per-email billing and pre-built templates.
- **Notifications:** Utilizes WebSockets for real-time notifications and Resend for email delivery.
- **Compliance:** Daily certification checks, HR alerts, and a dispute resolution system.
- **Gamification:** Employee engagement system with achievements, points/XP, leaderboards, and streak tracking (feature-flagged).
- **Data Management:** PostgreSQL database with 145+ indexed and optimized tables.
- **Error Handling:** Global error boundaries and configurable error messages.
- **Workspace Configuration:** Customizable settings per workspace (bot toggles, tax rates, jurisdiction, industry, company size).
- **System Health:** A `/health` endpoint for database, Stripe, Gemini, WebSocket, and session health checks.
- **HelpAI Orchestration:** Multi-tenant AI brain for autonomous operations with encrypted credential storage (AES-256-GCM), SHA-256 integrity checksums, API registry, and per-org credential management.
- **Session Management:** Explicit session saves with PostgreSQL-backed session storage.

**System Design Choices:**
- **Modularity:** Composed of 87 backend service modules and 220+ frontend routes.
- **Type Safety:** 100% LSP clean with zero compilation warnings.
- **Automation:** Features 10 scheduled autonomous jobs for payroll, invoicing, scheduling, compliance, trial expiry warnings, and email automation.
- **Audit Logging:** Comprehensive audit logging with 365-day retention policy.
- **Security:** AES-256-GCM encryption, PBKDF2-SHA256 key derivation, RBAC, per-org credential isolation, and credential expiry warnings.
- **Unified Pages:** Consolidated sales pages into `workspace-sales.tsx` and marketing/pricing pages into `universal-marketing.tsx`, driven by centralized configuration.

## External Dependencies
- **Stripe**: Payment processing, payroll, and financial integrations.
- **Resend**: Email delivery and notification workflows.
- **Gemini 2.0 Flash**: AI-driven features (document extraction, sentiment analysis, intelligent scheduling, HelpAI orchestration, business insights, FAQ learning).
- **WebSocket**: Real-time notifications.
- **Google Cloud Storage (GCS)**: File management.
- **PostgreSQL**: Primary relational database.

## Recent Changes
- **Chat Server Dynamic Configuration (Nov 2025):** Major cleanup to eliminate hardcoded values:
  - Removed ALL simulated/fake users (14 staff/customer users deleted from websocket.ts)
  - Removed entire chat simulation function and all `isSimulatedUser` references
  - User display names now fetched dynamically from database via `storage.getUserDisplayInfo()` and `formatUserDisplayNameForChat()`
  - HelpAI bot configuration centralized in `CHAT_SERVER_CONFIG` (name, userId, greetings, message templates)
  - Cleaned up moderation command messages: removed emojis and "simulated/test user" language
  - System now uses only real database users plus HelpAI bot from config
- **HelpOS to HelpAI Renaming (Nov 2025):** Completed full renaming of all user-facing "HelpOS" references to "HelpAI" across the codebase including:
  - Backend services: helpos-ai.ts (HelpAIService class), helposService/index.ts (HelpAIServiceImpl), aiBrainService.ts, alertManager.ts, aiBot.ts, geminiQABot.ts
  - Frontend components: mobile-chat-layout.tsx, chat-tutorial-slides.tsx, support-mobile-menu.tsx, floating-support-chat.tsx, chat-announcement-banner.tsx
  - Routes and configurations: routes.ts, websocket.ts, chatServer.ts, platformConfig.ts
  - Log messages updated to use [HelpAI] prefix for consistency
  - Note: File names (helpos-*.ts) and database column names (enable_helpos_bot) retained for backward compatibility
- **Comprehensive Gap Analysis (Nov 29, 2025):** Created detailed GAP_ANALYSIS.md documenting:
  - **P0 Critical Gaps (Payroll Compliance)**: YTD wage base tracking, state tax tables (50 states), SUTA/FUTA, Additional Medicare Tax (>$200k), local withholding, pre-tax deductions, tax jurisdiction handling, FLSA weighted overtime
  - **P1 High Priority (Finance/Integration Blockers)**: Multi-currency support, QuickBooks OAuth, Gusto OAuth, email retry mechanism, employer ratings, composite scores, historical trends
  - **P2 Medium Priority**: WebSocket commands, automation metrics, mock data replacement
  - **Analysis Scope**: 87 backend services, 220+ frontend routes, 145+ database tables, 14,079-line schema
  - **Effort Estimate**: P0 = 4-6 weeks, P1 = 3-4 weeks (1-2 developers)
  - See `docs/GAP_ANALYSIS.md` for full remediation roadmap with ownership and exit criteria

## Known Gaps & Technical Debt
- **Payroll Compliance (P0)**: ALL COMPLETE - Full state/SUTA/FUTA tax tables, YTD wage tracking, Additional Medicare Tax, FLSA weighted OT
- **Integrations (P1)**: QuickBooks and Gusto OAuth stubs created - require API credentials (QUICKBOOKS_CLIENT_ID, GUSTO_CLIENT_ID, etc.)
- **Multi-Currency (P1)**: COMPLETE - exchange_rates table, currencyService with conversion APIs
- **Historical Trends (P1)**: COMPLETE - Alert system for engagement score thresholds, time-series analytics
- **Automation Metrics (P2)**: COMPLETE - Job telemetry with recordJobStart/recordJobComplete, real-time tracking
- **Platform Metrics (P2)**: COMPLETE - Real calculations from supportTickets and satisfactionSurveys tables
- **WebSocket Commands (P2)**: COMPLETE - /welcome, /assign, /broadcast, /suspend, /reactivate, /staffstatus