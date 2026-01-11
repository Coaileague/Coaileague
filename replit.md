# CoAIleague - AI-Powered Workforce Intelligence Platform

## Overview
CoAIleague is a Fortune 500-grade multi-tenant autonomous workforce management platform. Its core purpose is to centralize dynamic configuration, eliminate hardcoded values, and integrate financial management with real Stripe payments. The platform leverages AI for advanced automation across various workforce management functions, including scheduling, sentiment analysis, onboarding, health monitoring, and dispute resolution. CoAIleague aims to deliver an efficient, comprehensive, and AI-driven workforce management solution with significant market potential, offering profit-optimized scheduling, strategic business intelligence, and comprehensive compliance.

## User Preferences
- I prefer simple language
- I want iterative development
- Ask before making major changes
- I prefer detailed explanations

## Architecture Rules (MANDATORY)
1. **Use Existing Infrastructure** - Always use current services, features, and patterns. Do NOT create new ones to avoid confusion. Only create if absolutely needed to keep platform organized.
2. **Follow Established Patterns** - Use the defined colors, Trinity model, animations, WebSockets, and broadcasting buses already in the codebase.
3. **File Index for Easy Editing** - Maintain organized file structure enabling parallel or single quick edits and design changes.
4. **No Hardcoded Values** - All values must be dynamic configuration for easy editing. Reference billingConfig.ts, platformConfig.ts, and similar centralized configs.
5. **Auto-Fix Modals/UI** - All modals and UI components must resize properly for desktop and mobile automatically.
6. **ColorfulCelticKnot Logo** - Trinity uses ONLY the 3-ribbon Celtic triquetra (purple/teal/gold) as the universal logo. Never use 5-pointed knot.

## System Architecture
CoAIleague features a multi-tenant architecture with RBAC security and isolation, managing application settings through centralized dynamic configuration.

**UI/UX Decisions:**
- **Responsive Design:** WCAG compliant mobile design with typography scaling.
- **Unified Pages:** Consolidated sales, marketing, and pricing pages driven by configuration.
- **Universal Animation System:** Canvas-based visual effects with multiple modes and seasonal themes.
- **Trinity AI Mascot:** An AI-powered interactive mascot providing global AI-driven insights.
- **Animated Word Logo:** A Google Doodle-style seasonal animated word logo system.

**Technical Implementations:**
- **Trinity AI Brain Services:** Utilizes a 4-tier Gemini architecture for document extraction, issue detection, autonomous scheduling, and platform orchestration. Includes a central registry for over 350 AI actions, with 8 strategic optimization actions for profit-first scheduling and business intelligence.
- **Universal Diagnostic Orchestrator:** Seven specialized domain subagents for root cause analysis and hotpatch suggestions.
- **HelpAI:** Support staff copilot for helpdesk chatrooms, focusing on escalation and ticket summarization.
- **Financials:** Real-time Stripe integration for payments, payroll, invoicing, and tax.
- **Email & Notifications:** Resend integration for email delivery and WebSocket for real-time notifications.
- **Compliance:** Daily certification, HR alerts, and dispute resolution, including 50-state labor law configuration for break compliance.
- **Time Tracking:** GPS-verified clock-in/out, timesheet reports, and AI anomaly detection.
- **Client Billing:** Invoice generation from tracked hours, PDF export, and email capabilities.
- **Advanced Scheduling:** Features recurring shifts, swapping, and one-click duplication.
- **Analytics Dashboard:** Metrics endpoints with AI insights and heat map visualizations.
- **Cognitive Onboarding Service:** Third-party API integrations with OAuth2 and AI-powered field mapping for organization setup.
- **HRIS Integration Service:** Unified integration with 8 providers, featuring OAuth2, bidirectional data sync, AI-powered field mapping, conflict resolution, and AI Brain orchestration.
- **Trinity Chat Interface:** Provides direct conversational access to Trinity with Business, Personal (BUDDY), and Integrated modes, featuring metacognition, real-time business metrics, conversation history, and proactive insights. Includes spiritual guidance options and configurable accountability levels.
- **Trinity Autonomous Notifier:** Real-time alert system for support staff with WebSocket broadcasts, auto-ticket creation, and a low-risk hotpatch system.

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
- **Trinity Command Center RBAC:** Chat interface restricted to support staff roles; org owners see Quick Actions.
- **Spec-Driven Development:** Component registry with tier-based AI editing rules.
- **Trinity Humanized Persona System:** Human-like AI communication patterns with a senior engineer persona.
- **Platform Support Infrastructure:** 3-tier support hierarchy (root_admin, co_admin, sysops) with cross-org access via support sessions, org freeze capability, and immutable audit logging with severity levels.
- **Trinity Elite:** Features like Strategic Optimization Engine (employee scoring, client tiering, profit-first scheduling), Go-Live Confidence Check, Resolution Inbox, QuickBooks 99% Automation, and Financial Watchdog for reconciliation with discrepancy alerts.

## External Dependencies
- **Stripe**: Payment processing, payroll, and financial integrations.
- **Resend**: Email delivery and notification workflows.
- **Google Gemini (3 Pro Preview, 2.5 Pro/Flash, 1.5 Flash 8B)**: Primary AI Brain intelligence.
- **WebSocket**: Real-time notifications.
- **Google Cloud Storage (GCS)**: File management.
- **PostgreSQL**: Primary relational database.
- **Twilio**: SMS notifications.
- **QuickBooks, Gusto, ADP, Paychex, Zenefits, Rippling, BambooHR, Workday**: Third-party API integrations for HRIS and onboarding.