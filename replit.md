# CoAIleague - AI-Powered Workforce Intelligence Platform

### Overview
CoAIleague is a Fortune 500-grade multi-tenant autonomous workforce management platform designed to eliminate hardcoded values through centralized dynamic configuration. It integrates financials with real Stripe payments and offers advanced AI-powered automation for scheduling, sentiment analysis, onboarding, health monitoring, and dispute resolution. The platform includes a HelpAI Integration for multi-tenant AI orchestration across invoicing, payroll, notifications, and workflow automation, aiming to deliver a production-ready solution with strong market potential for efficient workforce management.

### User Preferences
- I prefer simple language
- I want iterative development
- Ask before making major changes
- I prefer detailed explanations

### System Architecture
The system employs a multi-tenant architecture with RBAC security and isolation, managing all application settings dynamically through centralized configuration files.

**UI/UX Decisions:**
- **Mobile & Responsive Design:** Centralized mobile configuration with WCAG compliance, typography scaling, and a `ResponsiveScaleWrapper` component.
- **Unified Pages:** Consolidated sales, marketing, and pricing pages driven by centralized configuration.
- **Notification Widgets:** `WhatsNewBadge` and `NotificationBell` with distinct visual animations.
- **Universal Animation System:** Canvas-based visual effects with 6 animation modes and seasonal theme detection.
- **CoAI Twin Mascot:** An AI-powered interactive twin-star mascot globally visible on all pages, providing AI-driven insights and contextual reactions, featuring autonomous roaming with UI avoidance and transparent glassmorphism thought bubbles.
- **Animated Word Logo:** A Google Doodle-style seasonal animated word logo system with 11 themed variations, SVG-based letter animations, and canvas decoration overlays.

**Technical Implementations:**
- **AI Brain Services:** Comprehensive AI capabilities for document extraction, issue detection, autonomous scheduling, and HelpAI orchestration, leveraging Gemini 2.0 Flash for advanced knowledge governance and gap detection.
- **Universal Chat (HelpAI):** A single, unified AI chatbot for the platform, routing all chat interactions through HelpAI Orchestration.
- **Gemini Function Calling:** An 8-step workflow with multi-turn conversation support, integrating tools for FAQ search, support ticket creation, business insights, automation suggestions, feature recommendations, and FAQ updates.
- **Financials:** Real Stripe integration for payment processing, payroll, invoicing, deductions, and tax calculations.
- **Email Automation:** Full Resend integration with per-email billing and pre-built templates.
- **Notifications:** WebSocket infrastructure for real-time notifications and Resend for email delivery.
- **Compliance:** Daily certification checks, HR alerts, and a dispute resolution system.
- **Gamification:** Employee engagement system with achievements, points, leaderboards, and streak tracking, integrated with onboarding and tutorials.
- **Data Management:** PostgreSQL database with 150+ indexed and optimized tables.
- **Error Handling:** Global error boundaries and configurable error messages.
- **Workspace Configuration:** Customizable settings per workspace.
- **System Health:** A `/health` endpoint for monitoring key services.
- **HelpAI Orchestration:** Multi-tenant AI brain with encrypted credential storage, SHA-256 integrity checksums, and per-org credential management.
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
- **Support Command Console:** Force-push updates system for support staff with command endpoints and real-time WebSocket broadcast, including mascot orchestration.
- **AI Brain Code Editor:** Staged code editing system with approval workflow and HelpAI integration.
- **AI Brain Master Orchestrator:** Central hub coordinating 61 actions across 12 categories, connecting Gemini AI to platform services and executing workflow chains.
- **AI Brain File System Tools:** Comprehensive and secure file access with read, write, edit, delete, list, search, diff, and metadata retrieval.
- **AI Brain Code Editor API:** Full staged code editing workflow with endpoints for staging, approval, application, and rollback.
- **AI Brain Authorization Service:** Role-based permission model with a 9-level hierarchy and category-specific matrix, validating credentials and logging checks.

**System Design Choices:**
- **Modularity:** Composed of 87 backend service modules and 220+ frontend routes.
- **Type Safety:** 100% LSP clean with zero compilation warnings.
- **Automation:** Features 13 scheduled autonomous jobs including weekly database maintenance.
- **Audit Logging:** Comprehensive audit logging with 90-day retention; automated weekly archival.
- **Database Maintenance:** Weekly cleanup automation for audit logs (90d), chat messages (180d), notifications (30d).
- **Security:** AES-256-GCM encryption, PBKDF2-SHA256 key derivation, RBAC, per-org credential isolation, and credential expiry warnings.
- **Unified Config Registry:** Single source of truth at `shared/config/registry.ts` with Zod validation.

**RBAC Role Hierarchy:**
- **Platform Roles (8 levels):** root_admin, deputy_admin, sysop, support_manager, support_agent, compliance_officer, Bot, none
- **Workspace Roles (7 levels):** org_owner, org_admin, department_manager, supervisor, staff, auditor, contractor
- **Guards Available:** requireOwner, requireManager, requireHRManager, requireSupervisor, requireEmployee, requireLeader, requireAuditor, requireContractor, requirePlatformAdmin, requirePlatformStaff, requireManagerOrPlatformStaff, attachWorkspaceId

### External Dependencies
- **Stripe**: Payment processing, payroll, and financial integrations.
- **Resend**: Email delivery and notification workflows.
- **Gemini 2.0 Flash**: AI-driven features (document extraction, sentiment analysis, intelligent scheduling, HelpAI orchestration, business insights, FAQ learning).
- **WebSocket**: Real-time notifications.
- **Google Cloud Storage (GCS)**: File management.
- **PostgreSQL**: Primary relational database.
- **Twilio**: SMS notifications.