# CoAIleague - AI-Powered Workforce Intelligence Platform

### Overview
CoAIleague is a Fortune 500-grade multi-tenant autonomous workforce management platform designed to centralize dynamic configuration and eliminate hardcoded values. It integrates financial management with real Stripe payments and leverages AI for advanced automation in scheduling, sentiment analysis, onboarding, health monitoring, and dispute resolution. The platform incorporates HelpAI for multi-tenant AI orchestration across various functions, aiming to deliver a robust solution for efficient workforce management with significant market potential.

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
- **CoAI Twin Mascot:** An AI-powered interactive mascot visible globally, providing AI-driven insights.
- **Animated Word Logo:** A Google Doodle-style seasonal animated word logo system with 11 variations.

**Technical Implementations:**
- **AI Brain Services:** AI capabilities for document extraction, issue detection, autonomous scheduling, and HelpAI orchestration, powered by Gemini 2.0 Flash for knowledge governance.
- **Universal Chat (HelpAI):** A unified AI chatbot routing all interactions through HelpAI Orchestration.
- **Gemini Function Calling:** An 8-step workflow with multi-turn conversation support for FAQ, support tickets, and business insights.
- **Financials:** Real Stripe integration for payments, payroll, invoicing, and tax.
- **Email Automation:** Resend integration with per-email billing and templates.
- **Notifications:** WebSocket for real-time notifications and Resend for email.
- **Compliance:** Daily certification, HR alerts, and dispute resolution.
- **Gamification:** Employee engagement system with achievements, points, and leaderboards.
- **Data Management:** PostgreSQL database with 150+ indexed tables.
- **Error Handling:** Global error boundaries and configurable messages.
- **Workspace Configuration:** Customizable settings per workspace.
- **HelpAI Orchestration:** Multi-tenant AI brain with encrypted credential storage.
- **Session Management:** PostgreSQL-backed explicit session saves.
- **WebSocket Security:** Session-based authentication and workspace validation.
- **Platform-Wide RBAC:** Centralized role management.
- **Time Tracking:** Clock-in/out, timesheet reports, AI anomaly detection, and approvals.
- **Client Billing:** Invoice generation from tracked hours, PDF export, and email.
- **Advanced Scheduling:** Recurring shifts, swapping, and one-click duplication.
- **Employee Availability:** CRUD module, team view, exceptions, and conflict detection.
- **Calendar Sync:** iCal export/import, and subscriptions.
- **Analytics Dashboard:** Metrics endpoints for time, revenue, scheduling, and performance with AI insights.
- **Heat Map Visualization:** 7x24 grid for staffing intensity with AI analysis.
- **Break Compliance:** 50-state labor law configuration, auto-scheduling, and compliance checking.
- **AI Brain Platform Awareness:** Registry of 100+ features, natural language feature discovery, and diagnostic endpoints.
- **Automation Jobs:** 13 scheduled jobs for billing, scheduling, payroll, reminders, and maintenance.
- **AI Brain Platform Change Monitor:** Autonomous service scanning for AI-summarized change notifications.
- **Notification System:** Platform updates, support alerts, real-time WebSocket, and user history. Configuration-driven tab routing via `TAB_ROUTING` in `notificationConfig.ts` with intelligent categorization (What's New for features/AI upgrades, Alerts for user-specific, System for maintenance).
- **Support Command Console:** Force-push updates system for support staff.
- **AI Brain Code Editor:** Staged code editing with approval workflow and HelpAI integration.
- **AI Brain Master Orchestrator:** Central hub coordinating 93 actions across 16 categories, connecting Gemini AI to platform services.
- **SubagentSupervisor:** Manages 23 specialized domain subagents with diagnostic workflow, RBAC, and escalation policies. Uses consolidated `shared/config/orchestration.ts` for tiered agent definitions (strategy, router, executor).
- **Trinity Fast Mode v2:** Premium parallel execution with three tiers: Fast (1.5x credits, 4 agents, 15s SLA), Turbo (2x credits, 6 agents, 8s SLA), and Instant (3x credits, 8 agents, 3s SLA). Features include: Credit Governor with pre-execution cost estimation and budget warnings, SLA Breach Remediation with automatic 25-100% credit refunds based on tier, ROI Analytics Dashboard showing time saved and money value, Smart Agent Selection, Circuit Breaker pattern with retry logic, and Post-Run Success Digest with quality scores and actionable insights. Map-Reduce parallel orchestration with Promise.allSettled, LRU caching, and streaming hooks. UI components: `FastModeTierSelector`, `FastModeROIDashboard`, `FastModeSuccessDigest`, `FastModeToggle`. Metrics tracked via `executionMode` column in workboard tasks table.
- **Unified RBAC System:** Centralized role-based access control via `shared/config/rbac.ts` with `resolveAccessContext()` helper, capability matrix, and role groups (PLATFORM_ADMINS, SUPPORT_TEAM, AI_SERVICES, WORKSPACE_MANAGERS).
- **AI Expense Categorization:** Receipt OCR via Gemini Vision, intelligent categorization, and spending pattern analysis.
- **AI Dynamic Pricing:** Client-specific pricing analysis, reports, and bulk rate adjustment simulations.
- **AI Brain File System Tools:** Comprehensive and secure file access with read, write, edit, delete, list, search, diff, and metadata retrieval.
- **AI Brain Code Editor API:** Staged code editing workflow with staging, approval, application, and rollback.
- **AI Brain Authorization Service:** Role-based permission model with a 9-level hierarchy.
- **AI Brain Orchestration Infrastructure:** Durable workflow execution with persistence and multi-agent coordination.
- **Elevated Session Authentication:** HMAC-signed session elevation for support roles and AI services with TTL expiry and audit logging.
- **ElevatedSessionGuardian Subagent:** AI-powered security subagent for session anomaly detection and self-healing.
- **Automation Governance System:** Confidence-driven execution gates across three tiers (HAND_HELD, GRADUATED, FULL_AUTOMATION) with consent tracking and audit trails.
- **TrinityContextManager:** Multi-turn conversation memory with context building, knowledge gap detection, and human escalation.
- **TrinityMemoryService:** Long-term memory persistence for AI learning, user/workspace profiles, and interaction pattern detection.
- **AI Tool Capability Catalog:** Workspace-scoped tool registry with success metrics, health signals, and usage statistics.
- **Cross-Bot Knowledge Sharing:** Shared insights system enabling AI components to learn from each other.
- **Experience Feedback Loop:** Automation outcomes feed back into confidence models and agent learning.
- **AI Brain Workboard:** Central job queue system for AI orchestration that receives user requests (voice, chat, API, automation), routes through SubagentSupervisor to 8 specialized agents (Scheduling, Payroll, Billing, HR, Analytics, Support, Compliance, TimeTracking), tracks task lifecycle (pending → analyzing → assigned → in_progress → completed/failed), deducts Trinity credits, and sends completion notifications via Trinity, email, or WebSocket. REST API with submit, list, get, cancel, retry, and stats endpoints.
- **Onboarding Data Migration Subagent:** Specialized AI agent for new org setup that extracts data from PDFs (via Gemini Vision), Excel/CSV spreadsheets, and manual/bulk text entry. Uses intelligent column mapping, schema validation, and bulk import for employees, teams, and schedules. Enables orgs to work out-of-box with migrated data.
- **Gamification Activation Subagent:** Universal activation agent for gamification during org onboarding. Sets up default achievements, starter badges (Welcome Aboard, First Steps, Data Pioneer), employee points, and leaderboards. Manages 6 automation gates (basic_scheduling, shift_swap, payroll_automation, compliance_alerts, analytics_insights, full_automation) unlocked based on org level progression.
- **Onboarding Orchestrator:** Coordinates parallel execution of DataMigrationAgent and GamificationActivationAgent during new org creation. Triggers on signup, invite, or subscription with automatic gamification activation and optional data import. REST API: `/api/onboarding/ai/start`, `/ai/extract`, `/ai/import`, `/ai/status`, `/ai/gamification/activate`, `/ai/automation-gates`.

**System Design Choices:**
- **Modularity:** 87 backend service modules and 220+ frontend routes.
- **Type Safety:** 100% LSP clean.
- **Automation:** 13 scheduled autonomous jobs including database maintenance.
- **Audit Logging:** Comprehensive logging with 90-day retention and archival.
- **Database Maintenance:** Weekly cleanup for audit logs, chat messages, and notifications.
- **Security:** AES-256-GCM encryption, PBKDF2-SHA256, RBAC, per-org credential isolation, and expiry warnings.
- **Unified Config Registry:** Single source of truth at `shared/config/registry.ts` with Zod validation.

**RBAC Role Hierarchy:**
- **Platform Roles (8 levels):** root_admin to none.
- **Workspace Roles (7 levels):** org_owner to contractor.

**AI/Automation Bypass Pattern:**
- AI features (Trinity, HelpAI, subagents, bots, automation services) receive elevated session bypass once authenticated to avoid auth issues.
- Implemented via `elevatedSessionService.ts` issuing HMAC-signed elevation tokens.
- Scope includes standard RBAC checks, rate limits, and repeated auth verification during automated workflows.
- Regular users do NOT receive bypass.
- AI Brain Master Orchestrator tracks all elevated actions for reporting and audit compliance.

**ChatServerHub Architecture:**
- **Unified Gateway:** Central hub connecting all chat rooms to AI Brain, notifications, tickets, analytics.
- **Room Types:** Support, work, meeting, organization rooms with elevated service access.
- **WebSocket Integration:** Real-time broadcast to universal and workspace-scoped clients.
- **Quick Tools/Actions:** Support roles have RBAC-gated quick action execution.
- **AI Brain Connection:** All chat events emit to AI Brain for intelligent responses and sentiment analysis.
- **Trinity Integration:** Trinity receives chat context and injects insights.
- **HelpAI Bot:** Platform-wide HelpDesk room with HelpAI bot as permanent participant.
- **Elevated Access:** Bot role and support roles receive elevated bypass within chatroom.

### External Dependencies
- **Stripe**: Payment processing, payroll, and financial integrations.
- **Resend**: Email delivery and notification workflows.
- **Gemini 2.0 Flash**: AI-driven features including document extraction, sentiment analysis, intelligent scheduling, and HelpAI orchestration.
- **WebSocket**: Real-time notifications.
- **Google Cloud Storage (GCS)**: File management.
- **PostgreSQL**: Primary relational database.
- **Twilio**: SMS notifications.