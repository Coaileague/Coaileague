# CoAIleague - AI-Powered Workforce Intelligence Platform

## Overview
CoAIleague is a Fortune 500-grade multi-tenant autonomous workforce management platform. Its purpose is to centralize dynamic configuration, eliminate hardcoded values, and integrate financial management with real Stripe payments. The platform leverages AI for advanced automation across various workforce management functions, including scheduling, sentiment analysis, onboarding, health monitoring, and dispute resolution. CoAIleague aims to deliver an efficient, comprehensive, and AI-driven workforce management solution with significant market potential.

## What Trinity AI Can Do (Jan 2026)

### Fully Automated (End-to-End)
| Capability | Status | Details |
|------------|--------|---------|
| **AI Scheduling** | ✅ FULL | Profit-optimized schedules using client data, contract rates, employee scores |
| **GPS Geofence Validation** | ✅ FULL | Haversine distance calculation, 100m radius, manager alerts, fraud prevention |
| **Platform Action Hub** | ✅ FULL | 33+ registered actions for scheduling, payroll, employees, clients |
| **Strategic Optimization** | ✅ FULL | Employee 0-100 scoring, client tiering, profit-first scheduling |
| **QuickBooks Migration** | ✅ FULL | 7-step wizard with AI recommendations, bidirectional ID mapping |
| **QuickBooks Invoice Sync** | ✅ FULL | Auto-syncs client invoices to QuickBooks after generation |
| **Trinity Event Bus** | ✅ FULL | All 12 services connected to Trinity for awareness and learning |
| **SMS Notifications** | ✅ FULL | Schedule published → employees notified, incidents → manager alerts |
| **Compliance Engine** | ✅ FULL | 50-state labor law, break scheduling, certification expiry alerts |
| **Gap Intelligence** | ✅ FULL | Auto-scans for code issues, schema mismatches, LSP errors |
| **Self-Assessment** | ✅ FULL | Capability inventory, gap analysis, readiness scoring |

### Services Connected to Trinity via Event Bus
1. **Payroll Automation** → Trinity tracks processing, exceptions, auto-resolve rates
2. **Email Automation** → Trinity personalizes content, tracks delivery rates
3. **Dispute Resolution** → Trinity provides context for smarter resolutions
4. **Compliance Monitoring** → Trinity receives violation alerts in real-time
5. **Employee Patterns** → Trinity learns from behavior for better scheduling
6. **Report Workflow** → Trinity can add AI-enhanced insights to reports
7. **PTO Accrual** → Trinity tracks usage patterns for scheduling
8. **Breaks Service** → Trinity ensures compliance with state laws
9. **Heatmap Analytics** → Trinity uses for resource allocation decisions
10. **Daily Digest** → Trinity personalizes digest content per user
11. **Shift Reminders** → Trinity optimizes timing based on employee patterns
12. **Performance Metrics** → Trinity feeds into employee scoring

### Autonomous Operations
- **GPS Time Tracking**: Verifies employee location at clock-in/out with 100m geofence
- **Automated Payroll**: Processes payroll with QuickBooks sync, detects anomalies, auto-resolves 99%
- **Client Billing**: Generates invoices from tracked hours, syncs to QuickBooks, sends via email
- **Incident Management**: GPS-verified reports with photo upload and real-time SMS notifications

### Strategic Business Intelligence
- Employee scoring (0-100 composite): Reliability 40%, Satisfaction 30%, Experience 15%, Attendance 15%
- Client tiering (enterprise/premium/standard/trial): Revenue, Loyalty, Satisfaction, Profitability, Retention
- Profit-first scheduling: Assigns best employees to highest-value clients, risk-adjusted calculations
- At-risk client protection: 90+ score employees assigned regardless of cost
- Legacy client retention: 2+ year clients get top performers

### Integrations
- **QuickBooks**: 7-step migration wizard + bidirectional sync (employees, clients, invoices)
- **Stripe**: Real payments, subscriptions, invoicing, metered billing for overages
- **Twilio SMS**: Schedule notifications, incident alerts, payroll confirmations
- **Resend**: Email automation with per-email billing and templates
- **VAPID**: Push notifications for mobile app
- **HRIS**: 8-provider integration (Gusto, ADP, Paychex, Zenefits, Rippling, BambooHR, Workday)

## Pricing Tiers (Jan 2026)
- **Free Trial**: $0 for 14 days (5 employees, 500 AI credits)
- **Starter**: $499/month (15 employees included, +$15/employee overage, 2,000 AI credits)
- **Professional**: $1,499/month (50 employees included, +$12/employee overage, 10,000 AI credits) - MOST POPULAR
- **Enterprise**: Custom (starts at $3,500/month, 150+ employees, unlimited AI credits)

## AI Architecture (Critical Distinction)
**Trinity AI** is the AI Brain orchestrator - handles ALL end user/org automations:
- Autonomous scheduling using client data (addresses, contract rates, post orders)
- Platform Action Hub: Central registry for 33+ AI Brain actions (including 8 strategic optimization actions)
- Multi-tenant AI orchestration for workforce management
- Universal Diagnostic Orchestrator with 7 specialized domain subagents
- QuickBooks integration for client enrichment
- **Strategic Business Optimization System:**
  - Employee scoring (0-100 composite): Reliability 40%, Satisfaction 30%, Experience 15%, Attendance 15%
  - Client tiering (enterprise/premium/standard/trial): Revenue 30%, Loyalty 25%, Satisfaction 20%, Profitability 15%, Retention 10%
  - Profit-first scheduling with risk-adjusted calculations
  - At-risk client protection (90+ score employees regardless of cost)
  - Legacy client retention (2+ years get top performers)

**HelpAI** is ONLY for helpdesk chatroom support:
- Staff copilot for support agents in helpdesk chatrooms
- Escalation handling and ticket summarization
- NOT for general user automations (that's Trinity's domain)

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
- **Trinity AI Brain Services:** Utilizes a 4-tier Gemini architecture for document extraction, issue detection, autonomous scheduling, and platform orchestration.
- **Platform Action Hub (Trinity):** Central registry for 33+ AI Brain actions, formerly named helpaiActionOrchestrator. This is Trinity's infrastructure - NOT related to HelpAI despite legacy naming. Includes 8 strategic optimization actions for profit-first scheduling and business intelligence.
- **Universal Diagnostic Orchestrator:** Seven specialized domain subagents for root cause analysis and hotpatch suggestions.
- **HelpAI (Helpdesk Only):** Support staff copilot for helpdesk chatrooms - escalation handling and ticket summarization. NOT for general user automations.
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

## Deployment Instructions
**Important: Before publishing to production, you MUST build the frontend:**
```bash
npm run build  # Builds client and server, copies output to server/public
```
This command:
1. Builds the React frontend with Vite → outputs to `dist/public`
2. Copies build to `server/public` (where production expects it)
3. Bundles the server code for production

Then click the **Publish** button to deploy.

**Development:** Use `npm run dev` to run locally with hot reload.

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