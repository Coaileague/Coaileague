# CoAIleague - AI-Powered Workforce Intelligence Platform

### Overview
CoAIleague is a Fortune 500-grade multi-tenant autonomous workforce management platform powered by Gemini 2.0 Flash AI. Its core purpose is to eliminate hardcoded values through centralized dynamic configuration. The platform integrates financials with real Stripe payments, features comprehensive error handling, and provides a production-ready architecture. It offers dynamic configuration, advanced AI-powered automation (scheduling, sentiment analysis, onboarding, health monitoring, dispute resolution with AI analysis), integrated financials, robust real-time notifications, and comprehensive error handling. A key capability is the HelpAI Integration, providing a multi-tenant AI orchestration layer for autonomous invoicing, payroll, notifications, and workflow automation.

### User Preferences
- I prefer simple language
- I want iterative development
- Ask before making major changes
- I prefer detailed explanations

### System Architecture
The system employs a multi-tenant architecture with robust RBAC security and multi-tenant isolation. All application settings are dynamically managed through centralized configuration files.

**UI/UX Decisions:**
- **Mobile & Responsive Design:** Centralized mobile configuration (`client/src/config/mobileConfig.ts`) with breakpoints, touch targets (WCAG 44x44px standard), typography scaling, and a `ResponsiveScaleWrapper` component for accessibility and small screens, including safe area insets for notched devices. The design incorporates a CoAIleague AI gradient.

**Technical Implementations:**
- **AI Brain Services:** Fully implemented for document extraction, issue detection, autonomous scheduling, and HelpAI orchestration, leveraging Gemini 2.0 Flash.
- **Financials:** Real Stripe integration for payment processing, payroll, invoicing, deductions, and tax calculations.
- **Email Automation:** Full Resend integration for sales, marketing, onboarding, upsell, support, and notification emails, with per-email billing and pre-built templates.
- **Notifications:** Utilizes WebSockets for real-time notifications and Resend for email delivery.
- **Compliance:** Daily certification checks, HR alerts, and a dispute resolution system.
- **Gamification:** Employee engagement system with achievements, points/XP, leaderboards, and streak tracking, feature-flagged.
- **Data Management:** PostgreSQL database with 145+ indexed and optimized tables, including those for gamification, HelpAI registry, integrations, and audit logs.
- **Error Handling:** Global error boundaries and configurable error messages.
- **Workspace Configuration:** Customizable settings per workspace (bot toggles, tax rates, jurisdiction, industry, company size).
- **System Health:** A `/health` endpoint exposes health checks for database, Stripe, Gemini, WebSocket, and sessions.
- **HelpAI Orchestration:** A complete multi-tenant AI brain for autonomous operations with encrypted credential storage (AES-256-GCM) and comprehensive audit trails (SHA-256 integrity checksums). It includes an API registry, per-org credential management, and an audit logging service.

**System Design Choices:**
- **Modularity:** Composed of 87 backend service modules and 220+ frontend routes.
- **Type Safety:** 100% LSP clean with zero compilation warnings.
- **Automation:** Features 8 scheduled autonomous jobs for payroll, invoicing, scheduling, and compliance monitoring.
- **Audit Logging:** Comprehensive audit logging is implemented across the platform, including for HelpAI operations, with a 365-day retention policy.
- **Security:** AES-256-GCM encryption for credentials at rest, PBKDF2-SHA256 key derivation, role-based access control, per-org credential isolation, and credential expiry warnings.

### External Dependencies
- **Stripe**: For payment processing, payroll, and financial integrations.
- **Resend**: For email delivery and notification workflows.
- **Gemini 2.0 Flash**: Powers AI-driven features (document extraction, sentiment analysis, intelligent scheduling, issue detection, HelpAI orchestration).
- **WebSocket**: Enables real-time notifications.
- **Google Cloud Storage (GCS)**: Used for file management.
- **PostgreSQL**: The primary relational database for data storage.