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
- **Platform Action Hub (Trinity):** Central registry for 33+ AI Brain actions, including 8 strategic optimization actions for profit-first scheduling and business intelligence.
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
- **Trinity Command Center Frontier UI:** Diagnostic/Strategic Guru mode toggle, System Issues panel, real-time frontier capability metadata display.
- **Spec-Driven Development:** Component registry with tier-based AI editing rules.
- **Trinity Agent Parity Layer:** Replit Agent-equivalent autonomous coding capabilities.
- **Trinity Humanized Persona System:** Human-like AI communication patterns with a senior engineer persona.
- **Trinity 2025 Frontier Capabilities:** Advanced AI capabilities including Agentic Interoperability Protocols (AIP), Chain-of-Action (CoA) Physical Reasoning, Self-Evolving Cognitive Architectures, Preemptive "What-If" Scenario Modeling, and Multi-Tenant Contextual Ethics.

## External Dependencies
- **Stripe**: Payment processing, payroll, and financial integrations.
- **Resend**: Email delivery and notification workflows.
- **Google Gemini (3 Pro Preview, 2.5 Pro/Flash, 1.5 Flash 8B)**: Primary AI Brain intelligence across multiple tiers.
- **WebSocket**: Real-time notifications.
- **Google Cloud Storage (GCS)**: File management.
- **PostgreSQL**: Primary relational database.
- **Twilio**: SMS notifications.
- **QuickBooks, Gusto, ADP, Paychex, Zenefits, Rippling, BambooHR, Workday**: Third-party API integrations for HRIS and onboarding.