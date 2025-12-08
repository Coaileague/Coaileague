# CoAIleague - AI-Powered Workforce Intelligence Platform

### Overview
CoAIleague is a Fortune 500-grade multi-tenant autonomous workforce management platform. Its purpose is to eliminate hardcoded values through centralized dynamic configuration. It integrates financials with real Stripe payments and offers advanced AI-powered automation for scheduling, sentiment analysis, onboarding, health monitoring, and dispute resolution. The platform includes a HelpAI Integration for multi-tenant AI orchestration across invoicing, payroll, notifications, and workflow automation, aiming to deliver a production-ready solution with strong market potential for efficient workforce management.

### User Preferences
- I prefer simple language
- I want iterative development
- Ask before making major changes
- I prefer detailed explanations

### System Architecture
The system employs a multi-tenant architecture with RBAC security and isolation, managing all application settings dynamically through centralized configuration files.

**UI/UX Decisions:**
- **Mobile & Responsive Design:** Centralized mobile configuration with WCAG compliance and typography scaling.
- **Unified Pages:** Consolidated sales, marketing, and pricing pages driven by centralized configuration.
- **Notification Widgets:** `WhatsNewBadge` and `NotificationBell` with distinct visual animations.
- **Universal Animation System:** Canvas-based visual effects with 6 animation modes and seasonal theme detection.
- **CoAI Twin Mascot:** An AI-powered interactive twin-star mascot globally visible on all pages, providing AI-driven insights and contextual reactions.
- **Animated Word Logo:** A Google Doodle-style seasonal animated word logo system with 11 themed variations.

**Technical Implementations:**
- **AI Brain Services:** Comprehensive AI capabilities for document extraction, issue detection, autonomous scheduling, and HelpAI orchestration, leveraging Gemini 2.0 Flash for advanced knowledge governance.
- **Universal Chat (HelpAI):** A single, unified AI chatbot for the platform, routing all chat interactions through HelpAI Orchestration.
- **Gemini Function Calling:** An 8-step workflow with multi-turn conversation support, integrating tools for FAQ search, support ticket creation, business insights, and more.
- **Financials:** Real Stripe integration for payment processing, payroll, invoicing, deductions, and tax calculations.
- **Email Automation:** Full Resend integration with per-email billing and pre-built templates.
- **Notifications:** WebSocket infrastructure for real-time notifications and Resend for email delivery.
- **Compliance:** Daily certification checks, HR alerts, and a dispute resolution system.
- **Gamification:** Employee engagement system with achievements, points, leaderboards, and streak tracking.
- **Data Management:** PostgreSQL database with 150+ indexed and optimized tables.
- **Error Handling:** Global error boundaries and configurable error messages.
- **Workspace Configuration:** Customizable settings per workspace.
- **System Health:** A `/health` endpoint for monitoring key services.
- **HelpAI Orchestration:** Multi-tenant AI brain with encrypted credential storage and per-org credential management.
- **Session Management:** Explicit session saves with PostgreSQL-backed storage.
- **WebSocket Security:** Session-based authentication and workspace validation for tenant isolation.
- **Platform-Wide RBAC:** Centralized role management for platform-level roles without workspace dependency.
- **Time Tracking:** Clock-in/out, timesheet reports, AI anomaly detection, and approval workflows.
- **Client Billing:** Invoice generation from tracked hours, PDF export, and email sending.
- **Advanced Scheduling:** Recurring shifts, shift swapping, and one-click duplication.
- **Employee Availability:** CRUD module, team view, availability exceptions, and conflict detection.
- **Calendar Sync:** iCal export/import, and calendar subscriptions.
- **Analytics Dashboard:** Metrics endpoints for time, revenue, scheduling, and performance, coupled with AI insights.
- **Heat Map Visualization:** 7x24 grid for staffing intensity, with AI analysis and optimization.
- **Break Compliance:** 50-state labor law configuration, auto-scheduling, and compliance checking.
- **AI Brain Platform Awareness:** Registry of 100+ features across 4 families, natural language feature discovery, and diagnostic endpoints.
- **Automation Jobs:** 13 scheduled jobs for billing, scheduling, payroll, reminders, compliance, email, platform change monitoring, and database maintenance.
- **AI Brain Platform Change Monitor:** Autonomous service scanning codebase and services to generate and broadcast AI-summarized change notifications.
- **Notification System:** Platform updates, support staff alerts, real-time WebSocket delivery, and user notification history.
- **Support Command Console:** Force-push updates system for support staff with command endpoints and real-time WebSocket broadcast.
- **AI Brain Code Editor:** Staged code editing system with approval workflow and HelpAI integration.
- **AI Brain Master Orchestrator:** Central hub coordinating 88 actions across 15 categories (including security), connecting Gemini AI to platform services and executing workflow chains.
- **AI Expense Categorization:** Receipt OCR extraction via Gemini Vision, intelligent category suggestions, batch categorization, receipt-to-expense matching, and spending pattern analysis.
- **AI Dynamic Pricing:** Client-specific pricing analysis, comprehensive pricing reports, market competitiveness checks, and bulk rate adjustment simulations for profitability optimization.
- **AI Brain File System Tools:** Comprehensive and secure file access with read, write, edit, delete, list, search, diff, and metadata retrieval.
- **AI Brain Code Editor API:** Full staged code editing workflow with endpoints for staging, approval, application, and rollback.
- **AI Brain Authorization Service:** Role-based permission model with a 9-level hierarchy and category-specific matrix.
- **AI Brain Orchestration Infrastructure:** Durable workflow execution with persistence, commitments, and multi-agent coordination including WorkflowLedger, CommitmentManager, SupervisoryAgent, and SchedulerCoordinator.
- **Elevated Session Authentication:** HMAC-signed session elevation for support roles and AI services (Trinity, HelpAI, subagents, bots) with TTL expiry (4h idle, 12h absolute), automatic revocation on account lock, and audit logging. Regular org users rely on standard RBAC/subscription tier controls.
- **ElevatedSessionGuardian Subagent:** AI-powered security subagent with Dr. Holmes-style diagnostics for session anomaly detection (HMAC mismatches, locked accounts, idle timeouts, elevation rate limits), self-healing capabilities, telemetry emissions, and Trinity escalation. Maps 10 anomaly patterns to risk levels with dynamic severity for support tickets.
- **Automation Governance System:** Confidence-driven execution gates across three tiers (HAND_HELD, GRADUATED, FULL_AUTOMATION) with comprehensive consent/acknowledgment tracking for org owners and end-users. All automation actions flow through evaluateAction() with confidence scoring (0-100), policy evaluation, and persistent audit trail via automation_action_ledger linked to systemAuditLogs.
- **TrinityContextManager:** Multi-turn conversation memory with context building, confidence annotation, knowledge gap detection, and human escalation bridge. Enables Trinity to approach ChatGPT/Gemini levels for user assistance with persistent session tracking.
- **TrinityMemoryService:** Long-term memory persistence for AI learning across sessions. Features user/workspace profiles, interaction pattern detection, tool usage analytics, issue history tracking, and learning insights generation. Aggregates data from conversation sessions, automation ledger, and knowledge gaps into actionable AI context.
- **AI Tool Capability Catalog:** Workspace-scoped tool registry with success metrics, health signals, and usage statistics. Queries automation_action_ledger directly with workspace filter for complete tenant isolation. No global cache - all tool data is fetched fresh per-workspace to prevent cross-tenant data leakage.
- **Cross-Bot Knowledge Sharing:** Shared insights system enabling Trinity, HelpAI, subagents, and automation services to learn from each other. Insights include resolutions, patterns, optimizations, and warnings with effectiveness scoring and usage tracking.
- **Experience Feedback Loop:** Automation outcomes feed back into confidence models. Success/failure of actions adjusts tool confidence scores, generates lessons learned, and shares insights across agents for collective learning.

**Automation Governance Tiers:**
- **HAND_HELD:** Requires approval every time - for low-confidence or high-risk actions
- **GRADUATED:** Pre-approved for routine tasks after org owner consent
- **FULL_AUTOMATION:** Executes autonomously within policy boundaries at high confidence

**Consent Flow:**
- Org owner accepts liability waiver at org creation (tracked in workspace_automation_policies)
- End-users grant tool-specific consent (tracked in user_automation_consents)
- All consents persisted with version tracking and audit timestamps

**Automation Governance API Security:**
- **Workspace Isolation:** All governance routes validate workspace membership via checkWorkspaceAccess helper
- **RBAC Enforcement:** Policy updates and org consent require org_owner or org_admin role
- **Input Validation:** Allowedfields whitelist and string length limits prevent privilege escalation
- **Data Sanitization:** TrinityContextManager.sanitizeForStorage() redacts passwords, tokens, API keys, SSNs, credit cards before persistence
- **Bot Bypass Constraints:** Automation jobs require org owner consent and waiver acceptance even with elevated bypass

**System Design Choices:**
- **Modularity:** Composed of 87 backend service modules and 220+ frontend routes.
- **Type Safety:** 100% LSP clean with zero compilation warnings.
- **Automation:** Features 13 scheduled autonomous jobs including weekly database maintenance.
- **Audit Logging:** Comprehensive audit logging with 90-day retention and automated weekly archival.
- **Database Maintenance:** Weekly cleanup automation for audit logs, chat messages, and notifications.
- **Security:** AES-256-GCM encryption, PBKDF2-SHA256 key derivation, RBAC, per-org credential isolation, and credential expiry warnings.
- **Unified Config Registry:** Single source of truth at `shared/config/registry.ts` with Zod validation.

**RBAC Role Hierarchy:**
- **Platform Roles (8 levels):** root_admin, deputy_admin, sysop, support_manager, support_agent, compliance_officer, Bot, none
- **Workspace Roles (7 levels):** org_owner, org_admin, department_manager, supervisor, staff, auditor, contractor

**AI/Automation Bypass Pattern:**
- **Principle:** All AI features (Trinity, HelpAI, subagents, bots, automation services) receive elevated session bypass once authenticated to avoid auth issues and workflow interruptions.
- **Implementation:** `elevatedSessionService.ts` issues HMAC-signed elevation tokens for Bot role and AI services.
- **Eligible Services:** Trinity, HelpAI, subagents, automation jobs, scheduled cron tasks, AI Brain orchestrator.
- **Bypass Scope:** Standard RBAC checks, rate limits on internal actions, repeated auth verification during automated workflows.
- **Regular Users:** Org users do NOT receive bypass - they use standard RBAC and subscription tier controls.
- **Tracking:** AI Brain Master Orchestrator tracks all elevated actions for subscriber-agent reporting and audit compliance.

**ChatServerHub Architecture:**
- **Unified Gateway:** Central hub (`ChatServerHub.ts`) connecting all chat rooms to AI Brain, notifications, tickets, analytics.
- **Room Types:** Support rooms, work rooms, meeting rooms, organization rooms - all with elevated service access.
- **WebSocket Integration:** Real-time broadcast to universal (platform-wide) and workspace-scoped clients on desktop/mobile.
- **Quick Tools/Actions:** Support roles have quick action execution that persists to database via RBAC-gated endpoints.
- **AI Brain Connection:** All chat events emit to AI Brain for intelligent responses, escalation detection, and sentiment analysis.
- **Trinity Integration:** Trinity receives chat context and can inject insights directly into chat streams.
- **HelpAI Bot:** Platform-wide HelpDesk room with HelpAI bot as permanent participant for automated support.
- **Elevated Access:** Bot role and support roles receive elevated bypass within chatroom context for uninterrupted workflow execution.

**Trinity Mobile Configuration:**
- **Mobile Size:** 130px default (highly visible, easy to tap)
- **Chat Bubble Timing:** Human-paced with 1.5s typing delay, 20 chars/sec on mobile
- **Visual Config:** Glassmorphism, border glow, 85vw max width on mobile
- **AI Brain Tracking:** All Trinity interactions logged via AI Brain for subscriber agent analysis

### External Dependencies
- **Stripe**: Payment processing, payroll, and financial integrations.
- **Resend**: Email delivery and notification workflows.
- **Gemini 2.0 Flash**: AI-driven features (document extraction, sentiment analysis, intelligent scheduling, HelpAI orchestration, business insights, FAQ learning).
- **WebSocket**: Real-time notifications.
- **Google Cloud Storage (GCS)**: File management.
- **PostgreSQL**: Primary relational database.
- **Twilio**: SMS notifications.