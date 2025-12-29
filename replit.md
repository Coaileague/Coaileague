# CoAIleague - AI-Powered Workforce Intelligence Platform

## Overview
CoAIleague is a Fortune 500-grade multi-tenant autonomous workforce management platform. Its purpose is to centralize dynamic configuration, eliminate hardcoded values, and integrate financial management with real Stripe payments. The platform leverages AI for advanced automation across various workforce management functions, including scheduling, sentiment analysis, onboarding, health monitoring, and dispute resolution, all orchestrated through a multi-tenant AI system called HelpAI. CoAIleague aims to deliver an efficient, comprehensive, and AI-driven workforce management solution with significant market potential.

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
- **Time Tracking:** Clock-in/out, timesheet reports, AI anomaly detection, and approvals.
- **Client Billing:** Invoice generation from tracked hours, PDF export, and email.
- **Advanced Scheduling:** Recurring shifts, swapping, and one-click duplication.
- **Analytics Dashboard:** Metrics endpoints with AI insights and heat map visualizations.
- **Break Compliance:** 50-state labor law configuration, auto-scheduling, and compliance checking.
- **Cognitive Onboarding Service:** Third-party API integrations for automatic data extraction during organization setup, with OAuth2 and AI-powered field mapping.
- **HRIS Integration Service:** Unified 8-provider HRIS integration with OAuth2, bidirectional data sync, AI-powered field mapping, conflict resolution, and AI Brain orchestration.

**System Design Choices:**
- **Modularity:** Extensive backend service modules and frontend routes.
- **Type Safety:** 100% LSP clean.
- **Automation:** Scheduled autonomous jobs including database maintenance.
- **Audit Logging:** Comprehensive SOX-compliant logging with retention and archival.
- **Infrastructure Services (21 total):**
  - **Q1:** Durable Job Queue, Backups, Error Tracking, API Key Rotation
  - **Q2:** Distributed Tracing, Connection Pooling, Rate Limiting, Health Checks, Metrics Dashboard
  - **Q3:** Circuit Breaker (6 circuits: Stripe, Gemini, Resend, Twilio, Database, WebSocket), SLA Monitoring (Platinum/Gold/Silver tiers)
  - **Q4:** Disaster Recovery (RPO 15min, RTO 4hr, automated failover), Log Aggregation (centralized search, 5 retention policies), Security Hardening (5 threat patterns, auto-blocking, vulnerability scanning), CDN/Edge Caching (4 edge locations, LRU eviction), Audit Trail Export (7-year SOX retention, integrity verification, compliance reporting)
  - **Launch Hardening:** Launch Readiness (36 readiness checks, 6 launch gates), Chaos Testing (6 experiment types with automated drills), Operations Runbook (6 incident response runbooks), Compliance Sign-off (18 compliance requirements across SOX/GDPR/PCI-DSS/SOC2), Launch Rehearsal (full/partial/targeted simulation scenarios)
- **Automated Regression Tests:** Infrastructure validation suite runs on every startup (4 tests verifying audit schema compliance).
- **Security:** AES-256-GCM encryption, PBKDF2-SHA256, RBAC, per-org credential isolation, and expiry warnings.
- **Unified Config Registry:** Single source of truth with Zod validation.
- **AI/Automation Bypass Pattern:** Elevated session bypass for AI features and automation services using HMAC-signed elevation tokens.
- **ChatServerHub Architecture:** Unified gateway connecting chat rooms to AI Brain, notifications, tickets, and analytics.
- **Trinity Command Center RBAC:** Chat interface is restricted to support staff roles only (root_admin, deputy_admin, sysop, support_manager, support_agent, compliance_officer). Org owners see Quick Actions based on their business category without chat access.
- **Trinity Command Center Frontier UI:** Diagnostic/Strategic Guru mode toggle, System Issues panel with auto-refresh diagnostics, real-time frontier capability metadata display (Digital Twin simulations, collaborator badges, compliance verification, evolution logs).
- **Spec-Driven Development:** Component registry with tier-based AI editing rules.
- **Trinity Agent Parity Layer:** Replit Agent-equivalent autonomous coding capabilities (Plan-Execute-Reflect, Verification Loops, Confidence Scoring, Context Integration, Self-Correction).
- **Trinity Humanized Persona System:** Human-like AI communication patterns with a senior engineer persona.
- **Trinity 2025 Frontier Capabilities:** Five advanced AI capabilities elevating Trinity from "General AI" to a "Living Organism":
  1. **Agentic Interoperability Protocols (AIP):** Universal agent language for "hiring" external AI ecosystems (MCP, LangGraph).
  2. **Chain-of-Action (CoA) Physical Reasoning:** Predicts user frustration BEFORE errors occur by simulating action sequences.
  3. **Self-Evolving Cognitive Architectures:** Trinity can propose and migrate to new orchestration patterns autonomously.
  4. **Preemptive "What-If" Scenario Modeling:** Digital Twin simulations to predict bottlenecks and provision resources.
  5. **Multi-Tenant Contextual Ethics:** Cross-tenant learning guardrails for HIPAA, PCI-DSS, and industry-specific regulations.

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
- **QuickBooks, Gusto, ADP, Paychex, Zenefits, Rippling, BambooHR, Workday**: Third-party API integrations for HRIS and onboarding.