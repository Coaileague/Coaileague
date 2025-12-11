# CoAIleague - AI-Powered Workforce Intelligence Platform

## Overview
CoAIleague is a Fortune 500-grade multi-tenant autonomous workforce management platform. Its core purpose is to centralize dynamic configuration, eliminate hardcoded values, and integrate financial management with real Stripe payments. The platform leverages AI for advanced automation in scheduling, sentiment analysis, onboarding, health monitoring, and dispute resolution, including multi-tenant AI orchestration through HelpAI. CoAIleague aims to provide an efficient workforce management solution with significant market potential.

## User Preferences
- I prefer simple language
- I want iterative development
- Ask before making major changes
- I prefer detailed explanations

## System Architecture
The system features a multi-tenant architecture with RBAC security and isolation, managing application settings through centralized dynamic configuration.

**UI/UX Decisions:**
- **Responsive Design:** WCAG compliant mobile design with typography scaling.
- **Unified Pages:** Consolidated sales, marketing, and pricing pages driven by configuration.
- **Universal Animation System:** Canvas-based visual effects with 6 modes and seasonal themes.
- **Trinity AI:** An AI-powered interactive mascot providing global AI-driven insights.
- **Animated Word Logo:** A Google Doodle-style seasonal animated word logo system with 11 variations.

**Technical Implementations:**
- **AI Brain Services:** AI capabilities for document extraction, issue detection, autonomous scheduling, and HelpAI orchestration, utilizing a 4-tier Gemini architecture.
- **Universal Diagnostic Orchestrator:** 7 specialized domain subagents for root cause analysis and hotpatch suggestions.
- **Universal Chat (HelpAI):** A unified AI chatbot routing interactions.
- **Financials:** Real Stripe integration for payments, payroll, invoicing, and tax.
- **Email Automation:** Resend integration with per-email billing and templates.
- **Notifications:** WebSocket for real-time notifications and Resend for email.
- **Compliance:** Daily certification, HR alerts, and dispute resolution.
- **Gamification:** Employee engagement system.
- **Data Management:** PostgreSQL database with 150+ indexed tables.
- **Platform-Wide RBAC:** Centralized role management with 8 platform and 7 workspace levels.
- **Time Tracking:** Clock-in/out, timesheet reports, AI anomaly detection, and approvals.
- **Client Billing:** Invoice generation from tracked hours, PDF export, and email.
- **Advanced Scheduling:** Recurring shifts, swapping, and one-click duplication.
- **Analytics Dashboard:** Metrics endpoints with AI insights and heat map visualizations.
- **Break Compliance:** 50-state labor law configuration, auto-scheduling, and compliance checking.
- **AI Brain Platform Awareness:** Registry of 100+ features, natural language feature discovery, and diagnostic endpoints.
- **Automation Jobs:** 14 scheduled jobs for billing, scheduling, payroll, reminders, daily digest emails, and maintenance.
- **Interactive Onboarding Tour:** Step-by-step guided tour component.
- **Feedback Form with Screenshot Capture:** User feedback submission system with bug reports, feature requests, and screen capture.
- **Web Push Notifications:** Browser push notification system for specialized alerts.
- **AI Brain Master Orchestrator:** Central hub coordinating 136+ actions across 16 categories, connecting Gemini AI to platform services.
- **SubagentSupervisor:** Manages 23 specialized domain subagents with diagnostic workflow, RBAC, and escalation policies.
- **Trinity Fast Mode v2:** Premium parallel execution with three tiers for faster SLA and ROI analytics.
- **AI Expense Categorization:** Receipt OCR via Gemini Vision, intelligent categorization, and spending pattern analysis.
- **AI Dynamic Pricing:** Client-specific pricing analysis and bulk rate adjustment simulations.
- **AI Brain Authorization Service:** Role-based permission model with a 9-level hierarchy.
- **AI Brain Orchestration Infrastructure:** Durable workflow execution with persistence and multi-agent coordination.
- **Elevated Session Authentication:** HMAC-signed session elevation for support roles and AI services.
- **Automation Governance System:** Confidence-driven execution gates across three tiers with consent tracking and audit trails.
- **TrinityContextManager:** Multi-turn conversation memory with context building and human escalation.
- **TrinityMemoryService:** Long-term memory persistence for AI learning and user/workspace profiles.
- **SessionSyncService:** Real-time multi-device synchronization using WebSocket and TanStack Query.
- **ToolCapabilityRegistry:** Centralized registry for AI Brain subagent tools with health checking and usage analytics.
- **Trinity Org Intelligence:** Real-time organizational awareness system.
- **Trinity 3-Mode System:** Explicit operational modes: Demo, Business Pro, and Guru.
- **Swarm Commander Service:** "God Mode" control center for AI agent orchestration.
- **Crisis Management Protocol:** Fortune 500-grade incident response system.
- **Empire Mode (Trinity Pro CSO Upgrade):** Transforms Trinity to Chief Strategy Officer.
- **AI Tool Capability Catalog:** Workspace-scoped tool registry with metrics and usage statistics.
- **Cross-Bot Knowledge Sharing:** Shared insights system enabling AI components to learn from each other.
- **Experience Feedback Loop:** Automation outcomes feed back into confidence models and agent learning.
- **AI Brain Workboard:** Central job queue system for AI orchestration, routing user requests, and managing Trinity credits.
- **AI Brain Knowledge Orchestration Service:** Advanced knowledge management and intelligent routing using Gemini 3 Pro.
- **Onboarding Orchestrator (Enhanced):** Coordinates data migration and gamification during new org creation.
- **AICreditGateway:** Centralized billing enforcement for all AI operations.
- **Advanced Credit Analytics Dashboard:** Executive-level analytics for business owners.
- **SeasonalSubagent:** Autonomous AI-powered holiday theming orchestrator.
- **ServiceOrchestrationWatchdog:** Platform service orchestration monitor detecting unmanaged and stopped services.
- **TrinityExecutionFabric:** Architect-grade execution engine for autonomous platform operations.
- **PlatformIntentRouter:** Intelligent routing system directing all platform operations through AI Brain orchestration.
- **TrinitySentinel:** Continuous self-healing monitoring service.
- **Self-Reflection Engine:** Trinity self-critique system enabling LLM introspection on execution results.
- **LLM-as-Judge Evaluator:** Internal evaluation subagent system for quality assessment.
- **Planning Framework Service:** Structured reasoning frameworks for autonomous planning (Chain-of-Thought, ReAct, Tree-of-Thought).
- **Adaptive Supervision Router:** Smart routing based on task complexity and risk assessment.
- **Behavioral Monitoring Service:** Model drift detection and anomaly tracking system.
- **Trinity Command Center (TCC):** Universal cognitive command center at `/trinity/command-center` with RBAC-gated quick actions, natural language & voice command interface, real-time AI output panels, subagent testing, hotfix deployment, mobile-first design, and full orchestration hierarchy integration.
- **Visual QA Subagent (Trinity's Eyes):** AI-powered visual inspection system using Puppeteer for screenshots and Gemini Vision for anomaly detection.
- **Universal Access Control Panel (UACP):** Fortune 500-grade Dynamic Attribute-Based Access Control (ABAC) system layered on RBAC.
- **Fortune 500-Grade Core Subagents:** Enterprise-grade business operation subagents with circuit breaker patterns, distributed tracing, and idempotency protection, including:
    - **Scheduling Subagent:** Predictive staffing forecasts, intelligent conflict resolution, compliance guardrails, self-service shift swapping, and AI-optimized schedule generation.
    - **Payroll Subagent:** Circuit breaker for fault tolerance, distributed tracing, idempotency keys, exponential backoff retry, AI anomaly detection.
    - **Invoice Subagent:** Idempotent invoice generation, payment gateway circuit breaker, batch invoice generation, payment reconciliation, revenue gap detection.
    - **Notification Subagent (UNS):** Tiered priority system, smart bundling, role-based personalization, frequency management, quiet hours support.
- **Core Subagent Orchestration Actions:** 17 registered actions with the AI Brain Master Orchestrator.
- **Trinity Work Order System:** Full parity with autonomous AI agents for understanding and executing user requests, including Work Order Intake, Task Decomposition Engine, Solution Discovery Loop, Confident Commit Protocol, Clarification Protocol, and Work Summary Engine.
- **Schedule Live Notifier:** Real-time push notifications for all schedule changes via AI Brain orchestration.
- **Cognitive Onboarding Service:** Third-party API integrations (QuickBooks, Gusto, ADP, Paychex, Zenefits, Rippling, BambooHR, Workday) for automatic employee/payroll/financial data extraction during org setup. OAuth2 flows with AI-powered field mapping.
- **Shared Knowledge Graph:** Persistent agent-to-agent learning system with semantic knowledge nodes, entity relationships, business rule encoding, and cross-domain reasoning. Enables agents to learn from each other's successes and failures.
- **Agent-to-Agent (A2A) Communication Protocol:** Direct subagent messaging without orchestrator overhead, collaboration team formation, trust frameworks with condition-based validation, and negotiation protocols.
- **Reinforcement Learning Loop:** Continuous self-improvement system tracking success/failure outcomes, confidence calibration, strategy adaptation, and reward-based learning to reduce human escalations.

**System Design Choices:**
- **Modularity:** 87 backend service modules and 220+ frontend routes.
- **Type Safety:** 100% LSP clean.
- **Automation:** 13 scheduled autonomous jobs including database maintenance.
- **Audit Logging:** Comprehensive logging with 90-day retention and archival.
- **Security:** AES-256-GCM encryption, PBKDF2-SHA256, RBAC, per-org credential isolation, and expiry warnings.
- **Unified Config Registry:** Single source of truth with Zod validation.
- **AI/Automation Bypass Pattern:** Elevated session bypass for AI features and automation services using HMAC-signed elevation tokens.
- **ChatServerHub Architecture:** Unified gateway connecting chat rooms to AI Brain, notifications, tickets, and analytics.

## External Dependencies
- **Stripe**: Payment processing, payroll, and financial integrations.
- **Resend**: Email delivery and notification workflows.
- **Gemini 3 Pro Preview**: Primary AI Brain intelligence.
- **Gemini 2.5 Pro/Flash**: Secondary tiers for compliance and conversational AI.
- **Gemini 1.5 Flash 8B**: Lightweight tier for notifications, lookups, and simple status checks.
- **WebSocket**: Real-time notifications.
- **Google Cloud Storage (GCS)**: File management.
- **PostgreSQL**: Primary relational database.
- **Twilio**: SMS notifications.