# CoAIleague - AI-Powered Workforce Intelligence Platform

### Overview
CoAIleague is a Fortune 500-grade multi-tenant autonomous workforce management platform. Its core purpose is to centralize dynamic configuration, eliminate hardcoded values, and integrate financial management with real Stripe payments. The platform leverages AI for advanced automation in scheduling, sentiment analysis, onboarding, health monitoring, and dispute resolution, including multi-tenant AI orchestration through HelpAI. CoAIleague aims to provide an efficient workforce management solution with significant market potential.

### User Preferences
- I prefer simple language
- I want iterative development
- Ask before making major changes
- I prefer detailed explanations

### System Architecture
The system features a multi-tenant architecture with RBAC security and isolation, managing application settings through centralized dynamic configuration.

**UI/UX Decisions:**
- **Responsive Design:** WCAG compliant mobile design with typography scaling.
- **Unified Pages:** Consolidated sales, marketing, and pricing pages driven by configuration.
- **Notification Widgets:** `WhatsNewBadge` and `NotificationBell` with distinct animations.
- **Universal Animation System:** Canvas-based visual effects with 6 modes and seasonal themes.
- **CoAI Twin Mascot:** An AI-powered interactive mascot providing global AI-driven insights.
- **Animated Word Logo:** A Google Doodle-style seasonal animated word logo system with 11 variations.

**Technical Implementations:**
- **AI Brain Services:** AI capabilities for document extraction, issue detection, autonomous scheduling, and HelpAI orchestration, powered by Gemini 2.0 Flash for knowledge governance.
- **Universal Chat (HelpAI):** A unified AI chatbot routing all interactions through HelpAI Orchestration.
- **Gemini Function Calling:** 8-step workflow with multi-turn conversation support for FAQ, support tickets, and business insights.
- **Financials:** Real Stripe integration for payments, payroll, invoicing, and tax.
- **Email Automation:** Resend integration with per-email billing and templates.
- **Notifications:** WebSocket for real-time notifications and Resend for email.
- **Compliance:** Daily certification, HR alerts, and dispute resolution.
- **Gamification:** Employee engagement system with achievements, points, and leaderboards.
- **Data Management:** PostgreSQL database with 150+ indexed tables.
- **Platform-Wide RBAC:** Centralized role management with 8 platform and 7 workspace levels.
- **Time Tracking:** Clock-in/out, timesheet reports, AI anomaly detection, and approvals.
- **Client Billing:** Invoice generation from tracked hours, PDF export, and email.
- **Advanced Scheduling:** Recurring shifts, swapping, and one-click duplication.
- **Analytics Dashboard:** Metrics endpoints for time, revenue, scheduling, and performance with AI insights and heat map visualizations.
- **Break Compliance:** 50-state labor law configuration, auto-scheduling, and compliance checking.
- **AI Brain Platform Awareness:** Registry of 100+ features, natural language feature discovery, and diagnostic endpoints.
- **Automation Jobs:** 13 scheduled jobs for billing, scheduling, payroll, reminders, and maintenance.
- **AI Brain Platform Change Monitor:** Autonomous service scanning for AI-summarized change notifications.
- **Notification System:** Configuration-driven notifications for platform updates, support alerts, and real-time user history.
- **Support Command Console:** Force-push updates system for support staff.
- **AI Brain Code Editor:** Staged code editing with approval workflow and HelpAI integration.
- **AI Brain Master Orchestrator:** Central hub coordinating 93 actions across 16 categories, connecting Gemini AI to platform services.
- **SubagentSupervisor:** Manages 23 specialized domain subagents with diagnostic workflow, RBAC, and escalation policies. Uses consolidated configuration for tiered agent definitions.
- **SubagentConfidenceMonitor:** Trinity AI Brain service that monitors subagent performance, maintains persistent confidence scores, and calculates org-level automation readiness for graduation from HAND_HELD → GRADUATED → FULL_AUTOMATION modes.
- **Trinity Fast Mode v2:** Premium parallel execution with three tiers (Fast, Turbo, Instant) offering faster SLA, credit governance, SLA breach remediation, and ROI analytics.
- **AI Expense Categorization:** Receipt OCR via Gemini Vision, intelligent categorization, and spending pattern analysis.
- **AI Dynamic Pricing:** Client-specific pricing analysis, reports, and bulk rate adjustment simulations.
- **AI Brain File System Tools:** Comprehensive and secure file access with read, write, edit, delete, list, search, diff, and metadata retrieval.
- **AI Brain Authorization Service:** Role-based permission model with a 9-level hierarchy.
- **AI Brain Orchestration Infrastructure:** Durable workflow execution with persistence and multi-agent coordination.
- **Elevated Session Authentication:** HMAC-signed session elevation for support roles and AI services with TTL expiry and audit logging.
- **ElevatedSessionGuardian Subagent:** AI-powered security subagent for session anomaly detection and self-healing.
- **Automation Governance System:** Confidence-driven execution gates across three tiers with consent tracking and audit trails.
- **TrinityContextManager:** Multi-turn conversation memory with context building, knowledge gap detection, and human escalation.
- **TrinityMemoryService:** Long-term memory persistence for AI learning, user/workspace profiles, and interaction pattern detection.
- **Trinity Org Intelligence:** Real-time org awareness system providing Trinity with live business metrics, aggregating automation readiness, workboard stats, notification summaries, and invoice status.
- **ThoughtManager Automation Integration:** Real-time WebSocket subscription for automation events, including job completion, FAST mode SLA tracking, graduation milestones, and priority insight injection.
- **Trinity 3-Mode System:** Explicit operational modes: (1) Demo mode for public guests with limited showcase, (2) Business Pro mode for Business Buddy/Trinity Pro subscribers with org intelligence awareness, (3) Guru mode for platform staff (support_agent, support_manager, sysop, deputy_admin, root_admin) with platform diagnostics. Enhanced `PlatformDiagnostics` includes: overallHealth, activeWorkspaces, totalUsers, recentErrors, subagentHealth, fastModeStats (real task duration/SLA metrics), upgradeOpportunities, engagementAlerts, supportTicketBacklog, trialExpirations, churnRiskCount, and pendingNotificationSuggestions. Uses 5-minute caching.
- **Guru Mode Notification Workflow:** Trinity Guru can propose platform notifications via `createNotificationSuggestion()`. Pending suggestions stored in `aiSuggestions` table with type='platform_notification' and source='trinity_guru'. System tab can list via `getPendingNotificationSuggestions()` and approve/reject via `handleNotificationSuggestion()`.
- **Swarm Commander Service:** "God Mode" control center for AI agent orchestration. Features: (1) War Room - live agent topology visualization with interaction edges, (2) Loop Detector - infinite argument detection and intervention, (3) Agent Court - conflict resolution with human judge for resolving agent disagreements, (4) Budget Watchdog - predictive token economics with cost estimation before execution, (5) Forensic Replay - state snapshots for time-travel debugging, (6) ROI Dashboard - real-time dollar value calculator showing human hours saved vs API costs. Available via `/api/trinity/swarm/*` endpoints for Guru mode users.
- **Crisis Management Protocol:** Fortune 500-grade incident response system with four protocols: (1) RED-SHIELD/Lockdown - immediately terminates sessions, revokes API keys, and freezes compromised accounts with biometric verification for release, (2) BLACKOUT - system outage handling with ETA updates, auto-scaling, and automatic billing pause, (3) Make It Right - automated dispute resolution with forensic log analysis, refund processing, and 25% goodwill bonus credits, (4) NUCLEAR - root-level organization purge with dual-key authentication (`CONFIRM DELETION {orgId}`) and comprehensive audit trails. Trinity transforms from "Helpful Mascot" to "Tactical Incident Commander" during crises. Available via `/api/trinity/crisis/*` endpoints.
- **Empire Mode (Trinity Pro CSO Upgrade):** Transforms Trinity from COO to Chief Strategy Officer with three autonomous engines: (1) **GrowthStrategist** - 4 Pillars scanning: Cashflow Optimization (overdue invoice recovery), B2B Matchmaker (complementary business networking), Sales Velocity (lead conversion optimization), Tool Expansion (manual friction detection). Produces Strategy Cards with priority levels, ROI estimates, and actionable proposals. (2) **Blue Dot Protocol** - Precision maintenance system with cryptographic SHA256 signatures, AI-calculated countdown timers, and transparent "God Mode" messaging ("I am performing open-heart surgery on the code"). (3) **Holistic Growth Engine** - CEO-level cross-data synthesis analyzing Goals + Income + Spending + Manpower to provide executive summaries, health scores, and growth strategies. Available via `/api/trinity/empire/*` and `/api/trinity/bluedot/*` endpoints for Trinity Pro subscribers.
- **AI Tool Capability Catalog:** Workspace-scoped tool registry with success metrics, health signals, and usage statistics.
- **Cross-Bot Knowledge Sharing:** Shared insights system enabling AI components to learn from each other.
- **Experience Feedback Loop:** Automation outcomes feed back into confidence models and agent learning.
- **AI Brain Workboard:** Central job queue system for AI orchestration, routing user requests to specialized agents, tracking task lifecycle, and managing Trinity credits.
- **Onboarding Data Migration Subagent:** Specialized AI agent for new org setup, extracting data from various sources for bulk import of employees, teams, and schedules.
- **Gamification Activation Subagent:** Universal activation agent for gamification during org onboarding, setting up achievements, points, and leaderboards, and managing automation gates.
- **Onboarding Orchestrator:** Coordinates parallel execution of DataMigrationAgent and GamificationActivationAgent during new org creation.
- **SubagentBanker:** AI Brain credit pre-authorization and ledger management system implementing subscriber-pays-all model. Features: (1) **Workload Simulation** - estimates credits before execution based on task complexity, token count, and execution mode, (2) **Credit Quoting** - generates time-limited quotes requiring user agreement before proceeding, (3) **Credit Reservation** - atomic reservation with 10-minute TTL preventing double-spend, (4) **Consumption Finalization** - deducts actual credits used with full ledger tracking, (5) **Credit Refill** - handles purchases, bonuses, promos, and refunds, (6) **Ledger Management** - complete transaction history with debits/credits and balance tracking. Complexity multipliers: Simple (1x), Standard (1.5x), Complex (2.5x), Enterprise (4x). Fast Mode multipliers: Normal (1x), Fast (1.5x), Turbo (2x), Instant (3x).

**System Design Choices:**
- **Modularity:** 87 backend service modules and 220+ frontend routes.
- **Type Safety:** 100% LSP clean.
- **Automation:** 13 scheduled autonomous jobs including database maintenance.
- **Audit Logging:** Comprehensive logging with 90-day retention and archival.
- **Security:** AES-256-GCM encryption, PBKDF2-SHA256, RBAC, per-org credential isolation, and expiry warnings.
- **Unified Config Registry:** Single source of truth with Zod validation.
- **AI/Automation Bypass Pattern:** Elevated session bypass for AI features and automation services using HMAC-signed elevation tokens for authenticated operations, with audit logging.
- **ChatServerHub Architecture:** Unified gateway connecting chat rooms to AI Brain, notifications, tickets, and analytics, supporting various room types, WebSocket integration, and elevated access for bots and support roles.

### External Dependencies
- **Stripe**: Payment processing, payroll, and financial integrations.
- **Resend**: Email delivery and notification workflows.
- **Gemini 2.0 Flash**: AI-driven features including document extraction, sentiment analysis, intelligent scheduling, and HelpAI orchestration.
- **WebSocket**: Real-time notifications.
- **Google Cloud Storage (GCS)**: File management.
- **PostgreSQL**: Primary relational database.
- **Twilio**: SMS notifications.