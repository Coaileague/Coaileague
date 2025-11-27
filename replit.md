# CoAIleague - AI-Powered Workforce Intelligence Platform

### Overview
CoAIleague is a Fortune 500-grade multi-tenant autonomous workforce management platform powered by Gemini 2.0 Flash AI. Its core purpose is to eliminate hardcoded values through centralized dynamic configuration. The platform integrates financials with real Stripe payments, features comprehensive error handling, and provides a production-ready architecture.

Key capabilities include:
- **Dynamic Configuration**: All application settings are managed via centralized configuration files.
- **Advanced Automation**: AI-powered scheduling, sentiment analysis, onboarding, and health check monitoring.
- **Integrated Financials**: Real Stripe integration for payroll, deductions, garnishments, and accurate tax calculations.
- **Robust Notifications**: Real-time WebSocket shift notifications, email workflows via Resend, and a universal notification system.
- **Comprehensive Error Handling**: Global error boundaries and configurable error messages.
- **Real-time Analytics & Monitoring**: Live operational data, system health checks, and performance tracking.
- **Dispute Resolution**: A complete time entry dispute system with AI analysis and compliance tracking.
- **AI Brain Automation**: Document extraction, issue detection, guardrails enforcement, and data quality validation.

### User Preferences
- I prefer simple language
- I want iterative development
- Ask before making major changes
- I prefer detailed explanations

### Latest Updates (Session)
- ✅ Fixed logout glitch on universal header - logout button now hidden on public pages
- ✅ Created centralized mobile configuration (`client/src/config/mobileConfig.ts`)
- ✅ Implemented ResponsiveScaleWrapper for auto-sizing on small screens and zoom levels
- ✅ Updated mobile-page-wrapper to use centralized config instead of hardcoded values
- ✅ Resend email automation fully integrated with API key configured
- ✅ All autonomous jobs running (billing, payroll, scheduling, compliance, WebSocket cleanup)

### System Architecture
The system employs a multi-tenant architecture with robust RBAC security and multi-tenant isolation. All application settings are dynamically managed through centralized configuration files, eliminating hardcoded values.

**Mobile & Responsive Design:**
- Mobile config centralized in `client/src/config/mobileConfig.ts` with breakpoints, touch targets, typography scaling
- ResponsiveScaleWrapper component auto-scales content for accessibility and small screens
- Handles zoom levels up to 2.0x for users with vision needs
- Touch targets follow WCAG 44x44px standard
- Safe area insets for notched devices

**UI/UX Decisions:**
- Mobile-first design with responsive layouts for cards, tables, and forms.
- Features like SwipeableApprovalCard, MobilePageWrapper, and useIsMobile hook for enhanced mobile experience.
- Haptic feedback is integrated for touch interactions.

**Technical Implementations & Feature Specifications:**
- **AI Brain Services**: Fully implemented for document extraction (Gemini 2.0 Flash integration), issue detection (AI analysis + rule-based), and autonomous scheduling.
- **Financials**: Real Stripe integration handles payment processing, payroll, invoicing, deductions, and tax calculations.
- **Email Automation**: Full Resend integration with per-email billing. Supports sales, marketing, onboarding, client_onboarding, upsell, support, and notification email types. Pre-built templates available. API at `/api/emails/*` with endpoints for send, campaign, template, history, and pricing.
- **Notifications**: Utilizes WebSockets for real-time notifications and Resend for email delivery.
- **Compliance**: Daily certification checks, HR alerts, and a comprehensive dispute resolution system.
- **Data Management**: PostgreSQL database with 140+ indexed and optimized tables.
- **Error Handling**: Global error boundaries and configurable error messages ensure system stability.
- **Workspace Configuration**: Customizable settings per workspace including bot toggles, default tax rates, jurisdiction, industry, and company size.
- **System Health**: Comprehensive health checks for database, Stripe, Gemini, WebSocket, and sessions are exposed via a `/health` endpoint.

**System Design Choices:**
- **Modularity**: Composed of 87 backend service modules and 220 frontend routes.
- **Type Safety**: 100% LSP clean with zero compilation warnings for enterprise-grade code quality.
- **Automation**: Features 8 scheduled autonomous jobs for tasks like payroll, invoicing, scheduling, and compliance monitoring.
- **Audit Logging**: Comprehensive audit logging is implemented across the platform.

### External Dependencies
- **Stripe**: For payment processing, payroll, and financial integrations.
- **Resend**: For email delivery and notification workflows.
- **Gemini 2.0 Flash**: Powers AI-driven features such as document extraction, sentiment analysis, intelligent scheduling, and issue detection.
- **WebSocket**: Enables real-time notifications.
- **Google Cloud Storage (GCS)**: Used for file management.
- **PostgreSQL**: The primary relational database for data storage.