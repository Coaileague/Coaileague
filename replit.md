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
- **Automation Jobs:** 14 scheduled jobs for billing, scheduling, payroll, reminders, daily digest emails, and maintenance.
- **Daily Digest Email Service:** Automated morning digest emails sent at 7 AM with personalized content including upcoming shifts, pending approvals, compliance alerts, and weekly hours summary per employee.
- **Interactive Onboarding Tour:** Step-by-step guided tour component with 11 steps covering dashboard, scheduling, time tracking, employees, invoicing, analytics, Trinity AI, notifications, and settings. Progress tracked via localStorage with ability to restart.
- **Feedback Form with Screenshot Capture:** User feedback submission system with bug reports, feature requests, and questions. Supports screen capture via browser API and image upload alternatives.
- **Web Push Notifications:** Browser push notification system with VAPID key support, subscription management API, service worker handling, and specialized alerts for shifts, approvals, and compliance expiration.
- **AI Brain Platform Change Monitor:** Autonomous service scanning for AI-summarized change notifications.
- **Notification System:** Configuration-driven notifications for platform updates, support alerts, and real-time user history.
- **Support Command Console:** Force-push updates system for support staff.
- **AI Brain Code Editor:** Staged code editing with approval workflow and HelpAI integration.
- **AI Brain Master Orchestrator:** Central hub coordinating 114 actions across 16 categories, connecting Gemini AI to platform services with architect-grade execution capabilities.
- **SubagentSupervisor:** Manages 23 specialized domain subagents with diagnostic workflow, RBAC, and escalation policies. Uses consolidated configuration for tiered agent definitions.
- **SubagentConfidenceMonitor:** Monitors subagent performance, maintains persistent confidence scores, and calculates org-level automation readiness.
- **Trinity Fast Mode v2:** Premium parallel execution with three tiers offering faster SLA, credit governance, and ROI analytics.
- **AI Expense Categorization:** Receipt OCR via Gemini Vision, intelligent categorization, and spending pattern analysis.
- **AI Dynamic Pricing:** Client-specific pricing analysis, reports, and bulk rate adjustment simulations.
- **AI Brain File System Tools:** Comprehensive and secure file access with various operations.
- **AI Brain Authorization Service:** Role-based permission model with a 9-level hierarchy.
- **AI Brain Orchestration Infrastructure:** Durable workflow execution with persistence and multi-agent coordination.
- **Elevated Session Authentication:** HMAC-signed session elevation for support roles and AI services with TTL expiry and audit logging.
- **ElevatedSessionGuardian Subagent:** AI-powered security subagent for session anomaly detection and self-healing.
- **Automation Governance System:** Confidence-driven execution gates across three tiers with consent tracking and audit trails.
- **TrinityContextManager:** Multi-turn conversation memory with context building, knowledge gap detection, and human escalation.
- **TrinityMemoryService:** Long-term memory persistence for AI learning, user/workspace profiles, interaction pattern detection, and memory optimization with token-aware context window management.
- **SessionSyncService:** Real-time multi-device synchronization ensuring mobile and desktop clients see the same data. Features user connection tracking, workspace-scoped event broadcasting, and TanStack Query cache invalidation.
- **ToolCapabilityRegistry:** Centralized registry for AI Brain subagent tools with health checking, permission validation, usage analytics, and telemetry integration.
- **Trinity Org Intelligence:** Real-time org awareness system providing Trinity with live business metrics.
- **ThoughtManager Automation Integration:** Real-time WebSocket subscription for automation events.
- **Trinity 3-Mode System:** Explicit operational modes: Demo, Business Pro, and Guru, with enhanced `PlatformDiagnostics` for Guru mode.
- **Guru Mode Notification Workflow:** Trinity Guru can propose and manage platform notifications.
- **Swarm Commander Service:** "God Mode" control center for AI agent orchestration with visualization, loop detection, conflict resolution, budget monitoring, forensic replay, and ROI dashboard.
- **Crisis Management Protocol:** Fortune 500-grade incident response system with four protocols: RED-SHIELD/Lockdown, BLACKOUT, Make It Right, and NUCLEAR.
- **Empire Mode (Trinity Pro CSO Upgrade):** Transforms Trinity to Chief Strategy Officer with GrowthStrategist, Blue Dot Protocol, and Holistic Growth Engine.
- **AI Tool Capability Catalog:** Workspace-scoped tool registry with metrics and usage statistics.
- **Cross-Bot Knowledge Sharing:** Shared insights system enabling AI components to learn from each other.
- **Experience Feedback Loop:** Automation outcomes feed back into confidence models and agent learning.
- **AI Brain Workboard:** Central job queue system for AI orchestration, routing user requests to specialized agents, tracking task lifecycle, and managing Trinity credits.
- **AI Brain Knowledge Orchestration Service:** Advanced knowledge management and intelligent routing using Gemini 3 Pro. Features knowledge graph management, intelligent query routing to optimal model tiers, context enrichment, learning pipeline for continuous improvement, cross-domain reasoning chains, domain expert mapping, and integration with HelpAI Action Orchestrator for automated learning from all platform actions.
- **Data Migration Subagent (Enhanced):** Enterprise-grade AI agent for new org onboarding with a 5-step workflow.
- **Gamification Activation Subagent:** Universal activation agent for gamification during org onboarding.
- **Onboarding Orchestrator (Enhanced):** Coordinates parallel execution of DataMigrationAgent and GamificationActivationAgent during new org creation. Now includes workspace-isolated Trinity AI initialization with tier-based personas (onboarding_guide, business_buddy, support_partner, executive_advisor) and capabilities, Trinity welcome notifications, end-to-end testing workflows, and workflow diagnostics.
- **SubagentBanker:** AI Brain credit pre-authorization and ledger management system implementing subscriber-pays-all model.
- **Advanced Credit Analytics Dashboard:** Executive-level analytics for business owners with credit summaries, usage breakdowns, trends, AI task analytics, ROI metrics, and transaction history.
- **SeasonalSubagent:** Autonomous AI-powered holiday theming orchestrator. Monitors calendar for 7 holidays (Christmas, New Year, Valentine's, Easter, Independence Day, Halloween, Thanksgiving), generates creative themes using Gemini AI, applies CSS hotswaps without restart, auto-rollback after expiry, and hit detection for safe zones.
- **ServiceOrchestrationWatchdog:** Platform service orchestration monitor detecting "rebel" (unmanaged) and "orphan" (stopped heartbeating) services. Tracks 31+ expected services, publishes alerts via event bus, proposes hotpatch/hotswap remediation, and uses AI analysis for recommendations.
- **TrinityExecutionFabric:** Architect-grade execution engine with 4-layer pipeline (Plan→Prepare→Execute→Validate), reasoning chain support, test runner integration, file operations, and commit validation for autonomous platform operations.
- **PlatformIntentRouter:** Intelligent routing system directing all platform operations through AI Brain orchestration. Features priority/risk assessment, handler selection (execution_fabric/subagent/direct/queued), telemetry collection, and retry logic.
- **TrinitySentinel:** Continuous self-healing monitoring service with health scoring, automated anomaly detection, alert management, and remediation workflows for model routing, subagents, credit usage, and execution pipelines.
- **SeasonalDecorator Component:** Frontend React component consuming seasonal theme API, injecting CSS variables, rendering snow/confetti/banner decorations with AnimatePresence, pointer-events-none for click-through, and forced dark mode during holidays.

**System Design Choices:**
- **Modularity:** 87 backend service modules and 220+ frontend routes.
- **Type Safety:** 100% LSP clean.
- **Automation:** 13 scheduled autonomous jobs including database maintenance.
- **Audit Logging:** Comprehensive logging with 90-day retention and archival.
- **Security:** AES-256-GCM encryption, PBKDF2-SHA256, RBAC, per-org credential isolation, and expiry warnings.
- **Unified Config Registry:** Single source of truth with Zod validation.
- **AI/Automation Bypass Pattern:** Elevated session bypass for AI features and automation services using HMAC-signed elevation tokens.
- **ChatServerHub Architecture:** Unified gateway connecting chat rooms to AI Brain, notifications, tickets, and analytics.

### External Dependencies
- **Stripe**: Payment processing, payroll, and financial integrations.
- **Resend**: Email delivery and notification workflows.
- **Gemini 2.0 Flash**: AI-driven features including document extraction, sentiment analysis, intelligent scheduling, and HelpAI orchestration.
- **WebSocket**: Real-time notifications.
- **Google Cloud Storage (GCS)**: File management.
- **PostgreSQL**: Primary relational database.
- **Twilio**: SMS notifications.