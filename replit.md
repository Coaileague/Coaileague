# CoAIleague - AI-Powered Workforce Intelligence Platform

## Overview
CoAIleague is a Fortune 500-grade multi-tenant autonomous workforce management platform. Its core purpose is to centralize dynamic configuration, eliminate hardcoded values, and integrate financial management with real Stripe payments. The platform leverages AI for advanced automation across various workforce management functions, including scheduling, sentiment analysis, onboarding, health monitoring, and dispute resolution. CoAIleague aims to deliver an efficient, comprehensive, and AI-driven workforce management solution with significant market potential, offering profit-optimized scheduling, strategic business intelligence, and comprehensive compliance.

## User Preferences
- I prefer simple language
- I want iterative development
- Ask before making major changes
- I prefer detailed explanations

## System Architecture
CoAIleague features a multi-tenant architecture with RBAC security and isolation, managing application settings through centralized dynamic configuration.

**UI/UX Decisions:**
- **Responsive Design:** WCAG compliant mobile design with typography scaling.
- **Unified Pages:** Consolidated sales, marketing, and pricing pages driven by configuration.
- **Universal Animation System:** Canvas-based visual effects with multiple modes and seasonal themes.
- **Trinity AI Mascot:** An AI-powered interactive mascot providing global AI-driven insights.
- **Animated Word Logo:** A Google Doodle-style seasonal animated word logo system.

**Technical Implementations:**
- **Trinity AI Brain Services:** Utilizes a 4-tier Gemini architecture for document extraction, issue detection, autonomous scheduling, and platform orchestration.
- **Platform Action Hub (Trinity):** Central registry for 350+ AI Brain actions, including 8 strategic optimization actions for profit-first scheduling and business intelligence.
- **Universal Diagnostic Orchestrator:** Seven specialized domain subagents for root cause analysis and hotpatch suggestions.
- **HelpAI:** Support staff copilot exclusively for helpdesk chatrooms, focusing on escalation handling and ticket summarization.
- **Financials:** Real-time Stripe integration for payments, payroll, invoicing, and tax.
- **Email Automation:** Resend integration for email delivery.
- **Notifications:** WebSocket for real-time notifications and Resend for email.
- **Compliance:** Daily certification, HR alerts, and dispute resolution.
- **Time Tracking:** GPS-verified clock-in/out, timesheet reports, and AI anomaly detection.
- **Client Billing:** Invoice generation from tracked hours, PDF export, and email.
- **Advanced Scheduling:** Recurring shifts, swapping, and one-click duplication.
- **Analytics Dashboard:** Metrics endpoints with AI insights and heat map visualizations.
- **Break Compliance:** 50-state labor law configuration, auto-scheduling, and compliance checking.
- **Cognitive Onboarding Service:** Third-party API integrations for automatic data extraction during organization setup, with OAuth2 and AI-powered field mapping.
- **HRIS Integration Service:** Unified 8-provider HRIS integration with OAuth2, bidirectional data sync, AI-powered field mapping, conflict resolution, and AI Brain orchestration.

**Notification Architecture:**
- **Trinity-Exclusive Updates:** Trinity is the sole writer for "What's New" updates, preventing duplicate notifications
- **UNS Fallback:** Universal Notification Service acts as fallback only, with 24-hour duplicate detection
- **Feature Registry Sync:** Platform feature registry tracks sync version/timestamps for Trinity orchestration awareness

**System Design Choices:**
- **Modularity:** Extensive backend service modules and frontend routes.
- **Type Safety:** 100% LSP clean.
- **Automation:** Scheduled autonomous jobs including database maintenance.
- **Audit Logging:** Comprehensive SOX-compliant logging.
- **Infrastructure Services:** Includes Durable Job Queue, Backups, Error Tracking, Distributed Tracing, Rate Limiting, Health Checks, Metrics Dashboard, Circuit Breakers, SLA Monitoring, Disaster Recovery, Log Aggregation, Security Hardening, CDN/Edge Caching, and Audit Trail Export.
- **Automated Regression Tests:** Infrastructure validation suite runs on every startup.
- **Security:** AES-256-GCM encryption, PBKDF2-SHA256, RBAC, per-org credential isolation, and expiry warnings.
- **Unified Config Registry:** Single source of truth with Zod validation.
- **AI/Automation Bypass Pattern:** Elevated session bypass for AI features and automation services using HMAC-signed elevation tokens.
- **ChatServerHub Architecture:** Unified gateway connecting chat rooms to AI Brain, notifications, tickets, and analytics.
- **Trinity Command Center RBAC:** Chat interface restricted to support staff roles, org owners see Quick Actions.
- **Spec-Driven Development:** Component registry with tier-based AI editing rules.
- **Trinity Humanized Persona System:** Human-like AI communication patterns with a senior engineer persona.
- **Platform Support Infrastructure:** 3-tier support hierarchy (root_admin, co_admin, sysops) with cross-org access via support sessions, org freeze capability, and immutable audit logging with severity levels.

**Trinity Elite (Verified Capabilities):**
- **Strategic Optimization Engine:** Employee scoring (0-100), client tiering, profit-first scheduling
- **Go-Live Confidence Check:** GREEN/YELLOW/RED automation health status
- **Resolution Inbox:** Exception management UI for operational visibility
- **QuickBooks 99% Automation:** Invoice sync, identity mapping, exception triage
- **Financial Watchdog:** Platform Hours vs Invoice Hours reconciliation with Trinity Verified badges, widget toggles for Simple/Full views, and automatic discrepancy alerts (>5% variance)
- **Capability Evidence Matrix:** See `TRINITY_CAPABILITY_MATRIX.md` for verified vs roadmap features

**Roadmap Features (Not Yet Active):**
- Business Pro Mode (Revenue Intelligence Engine)
- Guru Mode (Strategic Advisory)
- Dynamic Pricing Optimization
- Self-Evolving Cognitive Architectures

## Recent Changes (January 2026)
- **QuickBooks Bidirectional Sync Complete:** Webhook service + polling fallback for real-time sync across mobile/desktop
- **Rate Limiter Enforcement:** All QB API calls now use try/finally pattern with proper slot management (500 req/min)
- **Pay Rate Validation UI:** Blocking warning with "Proceed Anyway" override requiring explicit acknowledgment
- **Browser Resumption:** Onboarding wizard state persisted to localStorage with 24h TTL
- **Sync Status Schema:** Added quickbooksSyncStatus and quickbooksLastSync columns to employees and clients
- **Platform Support Infrastructure:** 3-tier support hierarchy with cross-org access, org freeze capability, and immutable audit logging
- **5-Tier Org RBAC Complete:** org_owner, co_owner, manager, supervisor, employee with EmployeeEditDialog role management
- **Financial Watchdog Complete:** Platform Hours vs Invoice Hours reconciliation tab with Trinity Verified badges
- **Widget Toggle System:** Simple/Full view modes for less technical users
- **Notification Deduplication Fixed:** Trinity is exclusive writer for What's New, UNS is fallback only
- **Feature Registry Sync:** Auto-bumps sync version on every live patch deployment
- **Integration Tests Added:** 4 tests for notification deduplication enforcement
- **Capability Matrix Audit:** Full audit of 367+ actions, 7 domain subagents, QuickBooks integration
- **TRINITY_FINANCIAL_CORE_V1 LOCKED:** Production sign-off artifacts created

## Compliance Documentation
- `docs/TRINITY_FINANCIAL_CORE_V1_SIGNOFF.md` - Internal sign-off with scope and approvals
- `docs/INTUIT_REVIEWER_SUMMARY.md` - Intuit-safe summary for production key review
- `docs/TRINITY_ENTERPRISE_ONEPAGER.md` - Enterprise sales positioning document
- `docs/QUICKBOOKS_ONBOARDING_AUDIT.md` - Comprehensive QuickBooks integration audit
- `TRINITY_CAPABILITY_MATRIX.md` - Full capability evidence matrix

## External Dependencies
- **Stripe**: Payment processing, payroll, and financial integrations.
- **Resend**: Email delivery and notification workflows.
- **Google Gemini (3 Pro Preview, 2.5 Pro/Flash, 1.5 Flash 8B)**: Primary AI Brain intelligence across multiple tiers.
- **WebSocket**: Real-time notifications.
- **Google Cloud Storage (GCS)**: File management.
- **PostgreSQL**: Primary relational database.
- **Twilio**: SMS notifications.
- **QuickBooks, Gusto, ADP, Paychex, Zenefits, Rippling, BambooHR, Workday**: Third-party API integrations for HRIS and onboarding.