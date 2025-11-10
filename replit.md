# AutoForce™

## Overview
AutoForce™ (Autonomous Workforce Management Solutions) is a comprehensive platform for emergency services and other service-related industries. Its core purpose is to streamline operations, reduce administrative burden, and act as a single source of truth for workforce management. Key capabilities include advanced time tracking, automated invoice and payroll generation, smart hiring, compliance auditing, and real-time analytics. The platform utilizes an "OS" design philosophy for extensibility and aims for a hybrid subscription and usage-based AI revenue model, where users pay for operational costs plus a profit margin. The business vision is to provide autonomous financial operations while maintaining compliance and audit trails.

## User Preferences
I prefer detailed explanations.
Do not make changes to the folder `Z`.
Do not make changes to the file `Y`.
All branding must be 100% AutoForce™ (not WorkforceOS).
FTC COMPLIANCE: All marketing claims must be factual and verifiable. Avoid monopolistic language.
DESIGN: Professional Fortune 500 aesthetic - NO bright glowing colors (green-500, blue-500, amber-500, etc.). Use muted professional tones from design_guidelines.md only.
No Refresh Buttons.
Universal Back Navigation: Every page, modal, dialog needs clear exit/cancel/back buttons.
Unsaved Changes Protection: Forms and pages with editable content must warn users before navigation/close.
MOBILE-FIRST: All UI components must be fully responsive with proper text wrapping, scroll behavior, and touch-friendly tap targets.

## System Architecture
AutoForce™ is built on a modular "OS" design philosophy with 6 major autonomous systems, emphasizing clean code, automation, and extensibility. It features a comprehensive Role-Based Access Control (RBAC) and Tier Gating System across Free, Starter, Professional, and Enterprise tiers, with two-tier role hierarchy for platform staff and workspace users.

### The 6 Major OS Systems
1.  **BillOS™**: Administrative Billing & Financial Management (automated invoicing, payroll, expense management, usage-based AI billing).
2.  **OperationsOS™**: Field Operations Management (intelligent scheduling, GPS-verified time tracking, dispatch, asset tracking).
3.  **CommOS™**: Unified Communications Platform (organization chat, private messaging, automated notifications, HelpDesk with Gemini AI, WebRTC).
4.  **AuditOS™**: Compliance & Audit Trail Management (activity logging, automation lifecycle tracking, SOC2/GDPR compliance).
5.  **IntelligenceOS™**: AI-Powered Automation & Analytics (natural language search, real-time analytics, AI support bot, predictive analytics).
6.  **MarketingOS™**: Automated Sales & Business Development (AI-powered RFP hunting, sales pipeline management, *COMING SOON*).

### UI/UX Decisions
The platform features a professional aesthetic using Deep Charcoal, Platinum neutrals, and accent colors (Evergreen/Steel Blue/Professional Teal). It prioritizes a mobile-first approach with responsive layouts, accessible touch targets, and PWA capabilities. Branding includes an "AF" lightning bolt logo. Navigation includes a floating header, visible labels, and contextual breadcrumbs. Responsive typography using `clamp()` and a responsive table framework for mobile (transforming tables into progressive disclosure cards) are key UI features.

### Technical Implementations
-   **Frontend**: React, Vite, TypeScript, Wouter, TanStack Query, shadcn/ui, `react-hook-form`, `zod`.
-   **Backend**: Express.js, TypeScript, Zod for validation.
-   **Database**: PostgreSQL with Drizzle ORM.
-   **Authentication**: Custom session-based authentication supporting Replit Auth (OIDC) and Custom Auth, with account locking and password reset.
-   **Multi-Tenancy**: Data isolation managed on a workspace basis.
-   **Autonomous Automation System**: Anchor-based biweekly scheduling for BillOS™ and OperationsOS™ ensuring consistent cadence for invoicing and payroll, with FLSA-compliant calculations and audit tracking.
-   **Security**: Stripe webhook validation, payroll data protection, strict Zod validation, workspace scoping, and audit trails.
-   **Production Monitoring**: Comprehensive observability with error logging, performance metrics, health checks.
-   **Partner API Usage Tracking**: Comprehensive middleware-based tracking system with:
    - Mandatory caller-supplied deterministic IDs for idempotency (prevents double-billing on retries)
    - Database deduplication checks before inserting usage events
    - Non-blocking async architecture (usage tracking never blocks partner operations)
    - Three tracking wrappers: `withUsageTracking()` (single API calls), `withBatchUsageTracking()` (bulk operations), `trackWebhookEvent()` (partner webhooks)
    - Detailed metrics: request/response payload sizes, response times, error tracking, success rates
-   **Cost Aggregation & Billing**: Automated cost calculation and Stripe invoice generation:
    - Monthly cost rollup aggregating AI usage + partner API costs per workspace
    - Tier-based markup rates: Free 50%, Starter 30%, Professional 20%, Enterprise 10%
    - Users pay ALL operational costs (AI tokens, QuickBooks API calls, Gusto API calls) + AutoForce™ markup
    - Stripe invoice line item generation with detailed breakdowns
    - Amortized pricing model: Partner subscription costs ($50/mo QuickBooks, $39/mo Gusto) divided by monthly API call volume
-   **Partner OAuth Integration**: Secure OAuth 2.0 implementation for QuickBooks Online and Gusto:
    - AES-256-GCM encryption at rest for access/refresh tokens (dedicated tokenEncryption module)
    - PKCE (Proof Key for Code Exchange) for authorization code flow (QuickBooks)
    - CSRF protection via state tokens with 10-minute TTL stored in oauth_states table
    - Auto-refresh logic with 5-minute expiry buffer
    - Encrypted token storage with backward-compatible legacy plaintext handling
    - Exponential backoff retry logic with status tracking (connected/expired/disconnected/error)
    - Clean separation: dedicated `server/security/tokenEncryption.ts` for OAuth tokens vs `server/encryption.ts` for message encryption
    - Multi-tenant isolation: workspace membership validation on all integration endpoints
    - Graceful degradation: Works in development without ENCRYPTION_KEY (with warnings), requires it in production
    - **PRODUCTION SETUP REQUIRED**: Generate encryption key with `openssl rand -hex 32` and set as ENCRYPTION_KEY environment variable

## External Dependencies
-   **Database**: Neon (PostgreSQL)
-   **ORM**: Drizzle ORM
-   **Payment Processing**: Stripe Connect
-   **Email**: Resend
-   **AI**: OpenAI GPT-3.5-turbo, Gemini 2.0 Flash Exp, GPT-4, GPT-4-turbo, GPT-4o.
-   **Constraint Solving**: TypeScript greedy constraint solver for ScheduleOS™.
-   **Financial Integrations (Phase 1: Partner-Native)**: QuickBooks Online (QBO) for invoicing, Gusto for payroll.