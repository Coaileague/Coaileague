# CoAIleague - AI-Powered Workforce Intelligence Platform

## Overview
CoAIleague is a Fortune 500-grade multi-tenant autonomous workforce management platform. Its core purpose is to centralize dynamic configuration, eliminate hardcoded values, and integrate financial management with real Stripe payments. The platform leverages AI for advanced automation across various workforce management functions, including scheduling, sentiment analysis, onboarding, health monitoring, and dispute resolution, all orchestrated through a multi-tenant AI system called HelpAI. CoAIleague aims to deliver an efficient, comprehensive, and AI-driven workforce management solution with significant market potential.

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
- **Trinity AI:** An AI-powered interactive mascot providing global AI-driven insights.
- **Animated Word Logo:** A Google Doodle-style seasonal animated word logo system.

**Technical Implementations:**
- **AI Brain Services:** Utilizes a 4-tier Gemini architecture for document extraction, issue detection, autonomous scheduling, and HelpAI orchestration.
- **Universal Diagnostic Orchestrator:** Seven specialized domain subagents for root cause analysis and hotpatch suggestions.
- **Universal Chat (HelpAI):** A unified AI chatbot for routing interactions.
- **Financials:** Real-time Stripe integration for payments, payroll, invoicing, and tax.
- **Email Automation:** Resend integration with per-email billing and templates.
- **Notifications:** WebSocket for real-time notifications and Resend for email.
- **Compliance:** Daily certification, HR alerts, and dispute resolution.
- **Gamification:** Employee engagement system.
- **Data Management:** PostgreSQL database with extensive indexing.
- **Platform-Wide RBAC:** Centralized role management across platform and workspace levels.
- **Time Tracking:** Clock-in/out, timesheet reports, AI anomaly detection, and approvals.
- **Client Billing:** Invoice generation from tracked hours, PDF export, and email.
- **Advanced Scheduling:** Recurring shifts, swapping, and one-click duplication.
- **Analytics Dashboard:** Metrics endpoints with AI insights and heat map visualizations.
- **Break Compliance:** 50-state labor law configuration, auto-scheduling, and compliance checking.
- **AI Brain Platform Awareness:** Registry of features, natural language feature discovery, and diagnostic endpoints.
- **Automation Jobs:** Scheduled jobs for billing, scheduling, payroll, reminders, and maintenance.
- **Interactive Onboarding Tour:** Step-by-step guided tour component.
- **Web Push Notifications:** Browser push notification system for specialized alerts.
- **AI Brain Master Orchestrator:** Central hub coordinating actions across categories, connecting Gemini AI to platform services.
- **SubagentSupervisor:** Manages specialized domain subagents with diagnostic workflow, RBAC, and escalation policies.
- **AI Expense Categorization:** Receipt OCR via Gemini Vision, intelligent categorization, and spending pattern analysis.
- **AI Dynamic Pricing:** Client-specific pricing analysis and bulk rate adjustment simulations.
- **AI Brain Authorization Service:** Role-based permission model with a 9-level hierarchy.
- **AI Brain Orchestration Infrastructure:** Durable workflow execution with persistence and multi-agent coordination.
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
- **AICreditGateway:** Centralized billing enforcement for all AI operations.
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
- **Trinity Command Center (TCC):** Universal cognitive command center with RBAC-gated quick actions, natural language & voice command interface, real-time AI output panels, and full orchestration hierarchy integration.
- **Visual QA Subagent (Trinity's Eyes):** AI-powered visual inspection system using Puppeteer for screenshots and Gemini Vision for anomaly detection.
- **Universal Access Control Panel (UACP):** Dynamic Attribute-Based Access Control (ABAC) system layered on RBAC.
- **Fortune 500-Grade Core Subagents:** Enterprise-grade business operation subagents with circuit breaker patterns, distributed tracing, and idempotency protection (Scheduling, Payroll, Invoice, Notification).
- **Trinity Work Order System:** Full parity with autonomous AI agents for understanding and executing user requests, including Intake, Task Decomposition, Solution Discovery, Confident Commit, Clarification, and Work Summary Engines.
- **Schedule Live Notifier:** Real-time push notifications for all schedule changes via AI Brain orchestration.
- **Cognitive Onboarding Service:** Third-party API integrations (QuickBooks, Gusto, ADP, Paychex, Zenefits, Rippling, BambooHR, Workday) for automatic data extraction during organization setup, with OAuth2 and AI-powered field mapping.
- **Shared Knowledge Graph:** Persistent agent-to-agent learning system with semantic knowledge nodes, entity relationships, business rule encoding, and cross-domain reasoning.
- **Agent-to-Agent (A2A) Communication Protocol:** Direct subagent messaging, collaboration team formation, trust frameworks, and negotiation protocols.
- **Reinforcement Learning Loop:** Continuous self-improvement system tracking success/failure, confidence calibration, strategy adaptation, and reward-based learning to reduce human escalations.
- **Domain Lead Supervisors:** Specialized supervisors with escalation policies for RevenueOps, SecurityOps, OnboardingOps, DataOps, and CommunicationOps.
- **Cognitive Database Persistence:** Write-through cache pattern for all cognitive services with dedicated tables and automatic state restoration.
- **Integration Management System:** Workspace-level API key management with encrypted credential storage, Trinity AI-powered outage analysis, and platform support role partner catalog management.
- **Trinity Root Access System:** Trinity AI has root-level platform control equivalent to root_admin user, implemented via dual-layer authorization with Trinity bypass logic and an emergency kill-switch.

**System Design Choices:**
- **Modularity:** Extensive backend service modules and frontend routes.
- **Type Safety:** 100% LSP clean.
- **Automation:** Scheduled autonomous jobs including database maintenance.
- **Audit Logging:** Comprehensive logging with retention and archival.
- **Security:** AES-256-GCM encryption, PBKDF2-SHA256, RBAC, per-org credential isolation, and expiry warnings.
- **Unified Config Registry:** Single source of truth with Zod validation.
- **AI/Automation Bypass Pattern:** Elevated session bypass for AI features and automation services using HMAC-signed elevation tokens.
- **ChatServerHub Architecture:** Unified gateway connecting chat rooms to AI Brain, notifications, tickets, and analytics.
- **Spec-Driven Development:** Component registry with tier-based AI editing rules (Critical, Core, Feature, Utility).
- **Cleanup Agent Subagent (CAS):** Autonomous code cleanup with LLM-as-Judge integration, unused file discovery, and human-approved deletion proposals.
- **Trinity Agent Parity Layer:** Replit Agent-equivalent autonomous coding capabilities (Plan-Execute-Reflect, Verification Loops, Confidence Scoring, Context Integration, Self-Correction) with a comprehensive workflow including planning, pre-flight verification, execution, post-validation, self-reflection, and auto-correction.
- **Trinity Humanized Persona System:** Human-like AI communication patterns with senior engineer persona, conversational transitions, cognitive pauses, empathy expressions, and natural uncertainty acknowledgment. Uses optimized generation parameters (topP: 0.95-0.98, temperature: 1.0) for vocabulary variety while maintaining logical accuracy.

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
- **QuickBooks, Gusto, ADP, Paychex, Zenefits, Rippling, BambooHR, Workday**: Third-party API integrations for Cognitive Onboarding Service.