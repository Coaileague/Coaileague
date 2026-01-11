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

**Trinity Chat Interface (/trinity):**
The Trinity Chat Interface provides direct conversational access to Trinity with three distinct modes and metacognition capabilities.

*Modes:*
- **Business Mode (Blue):** Data-driven business advisor with real-time access to schedules, payroll, invoices, overtime, and QuickBooks financials. Answers questions with specific numbers and actionable insights.
- **Personal Mode / BUDDY (Green):** Personal accountability partner and life coach. Three spiritual guidance options: None (secular), General (universal values), or Christian (biblical wisdom). Configurable accountability levels: Gentle, Balanced, or Challenging.
- **Integrated Mode (Purple):** Full context of both business data AND personal conversations. Reveals connections between personal struggles and business performance.

*Key Features:*
- **RBAC Access:** org_owner, co_owner, manager only (supervisors and employees excluded)
- **Metacognition Layer:** Pattern recognition, insight accumulation, consciousness continuity across sessions
- **Real-Time Business Metrics:** Monthly revenue, invoice status, overtime hours, QuickBooks connection status
- **Conversation History:** Persistent history with date grouping and session replay
- **Proactive Insights:** Trinity notices patterns and brings up observations naturally
- **Memory Profile Integration:** Recalls past conversations and user preferences

*Spiritual Guidance (BUDDY Mode):*
- **None:** Secular life coaching with evidence-based behavioral strategies
- **General:** Universal values, purpose, meaning, gratitude - no religious specificity
- **Christian:** Scripture references, prayer offerings, biblical wisdom with grace

*Accountability Levels:*
- **Gentle:** Supportive encouragement, soft nudges
- **Balanced:** Encouragement with honest challenge
- **Challenging:** Direct tough love, no sugarcoating

**Roadmap Features (Not Yet Active):**
- Business Pro Mode (Revenue Intelligence Engine)
- Guru Mode (Strategic Advisory)
- Dynamic Pricing Optimization
- Self-Evolving Cognitive Architectures

## Recent Changes (January 2026)
- **Trinity Celtic Knot Animation System:** 10 emotion states (idle, thinking, success, speaking, listening, warning, error, loading, happy, focused) with 4 speed tiers (slow, normal, fast, instant) for responsive UI feedback
- **Universal Trinity Loader:** ALL loading animations now use Trinity Celtic knot exclusively - replaced LoadingScreen, PageLoader, CoAIleague loader, and chatrooms loading states
- **Mobile Header Fix:** Removed wordmark text on mobile to prevent cutoff - shows only Trinity icon for clean responsive design
- **Trinity CSS Animations:** Added keyframes for spinSlow, shake, trinityMorph, trinitySpeaking, trinityLoading with corresponding utility classes
- **Trinity Humanized Notifications:** All "What's New" notifications now use Trinity's conversational senior engineer voice instead of formal corporate language ("Just shipped..." instead of "We have updated...")
- **Trinity Chat Interface Complete:** 3-mode conversational interface (Business/Personal/Integrated) with BUDDY accountability coaching, spiritual guidance options (none/general/christian), and metacognition layer for pattern recognition and consciousness continuity
- **Business Mode with Live Data:** Real-time QuickBooks connection status, monthly revenue, invoice stats, overtime hours injected into AI prompts
- **RBAC Enforcement:** Trinity Chat restricted to org_owner, co_owner, manager roles only
- **Employee Onboarding Pipeline Fixed:** Invite role/workspaceRole now flows through to employee creation, with getOnboardingInvite storage method and employee_created event emission
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
- `docs/PLATFORM_WORKFLOW_AUDIT.md` - 15-category platform workflow diagnostic
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