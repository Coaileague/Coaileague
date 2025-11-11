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

### Navigation System
**Gmail-Style Peek Rail Navigation** (replaced Shadcn Sidebar):
- **Three Layout Modes**: Collapsed (56px icons only), Expanded (240px with labels), Mobile Overlay (slide-in with backdrop)
- **6-Family Organization**: Menu structured around 6 major OS families to avoid long scrolling menus
  - **CommOS™**: Communication hub, Messages, SupportOS™ HelpDesk
  - **OperationsOS™**: ScheduleOS™, TimeOS™, Pending Approvals, TrainingOS™
  - **BillOS™**: PayrollOS™, Invoices, Integrations (QuickBooks/Gusto)
  - **IntelligenceOS™**: AnalyticsOS™, ReportOS™, InsightOS™ Reports
  - **AuditOS™**: Audit logs, Compliance tracking
  - **MarketingOS™**: DealOS™ Sales, TalentOS™, EngagementOS™
  - **Platform**: Dashboard, Employees, Clients, Settings (Platform staff see additional admin tools)
- **Smart State Management**: localStorage persistence for pin state, debounced hover interactions (100ms expand, 200ms collapse), proper cleanup on unmount
- **RBAC Integration**: Reuses `selectSidebarFamilies()` for role-based menu filtering, each family shows 3-4 high-value routes
- **Responsive Design**: Viewport detection at 768px (md breakpoint), mobile overlay with dismiss-on-backdrop-click
- **Accessibility**: ARIA labels, keyboard navigation (Enter/Space to expand, Escape to collapse), aria-current for active routes
- **Custom Logo**: Inline "AUTOFORCE™" logo optimized for 240px width (prevents text wrapping), gradient AF badge matching brand colors (primary/accent)
- **Profile Dropdown**: Positioned to the right with proper sideOffset to avoid breaking nav border, includes user avatar, name, email, and quick actions
- **Technical Details**: Framer Motion spring animations (stiffness: 300, damping: 30), useRef-based hover debouncing to prevent glitching, AnimatePresence for smooth transitions
- **Layering Architecture**: Peek rail at z-50, header at z-[40] starting at left-14, main content with ml-14 (56px) offset; harmonious coordination eliminates visual conflicts
- **Professional Header System**: Clean centered page titles using PageHeader component with align="center" prop (three-column grid for true optical centering), single foreground color for Fortune-500 aesthetic; WorkspaceSwitcher clearly displays current workspace name

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
-   **Partner API Services**: Complete implementation for QuickBooks Online and Gusto integrations:
    - **QuickBooks Service** (`server/services/partners/quickbooks.ts`):
      - Customer sync (create/update AutoForce clients as QuickBooks customers)
      - Invoice creation from AutoForce invoices with automatic customer mapping
      - Payment recording with linked invoice tracking
      - All operations use v3 API endpoints with usage tracking integration
    - **Gusto Service** (`server/services/partners/gusto.ts`):
      - Employee sync (create/update AutoForce employees in Gusto)
      - Payroll run creation based on AutoForce pay periods
      - Time activity submission for accurate payroll processing
      - Payroll processing (calculate and submit)
      - All operations tracked for usage-based billing
    - **Data Mapping System** (`partnerDataMappings` table):
      - Automatic sync tracking between AutoForce entities and partner entities
      - Bi-directional mapping (client↔customer, employee↔employee, invoice↔invoice, payroll↔payroll)
      - Sync status tracking (synced/pending/error) with timestamps
      - Supports both auto and manual mapping sources
    - **Integration API Routes** (`server/integrationRoutes.ts`):
      - POST `/api/integrations/quickbooks/sync-client` - Sync client to QuickBooks
      - POST `/api/integrations/quickbooks/create-invoice` - Create invoice in QuickBooks
      - POST `/api/integrations/quickbooks/record-payment` - Record payment
      - POST `/api/integrations/gusto/sync-employee` - Sync employee to Gusto
      - POST `/api/integrations/gusto/create-payroll` - Create payroll run
      - POST `/api/integrations/gusto/submit-time` - Submit time activities
      - POST `/api/integrations/gusto/process-payroll` - Process payroll
      - All routes require authentication and workspace membership validation
    - **Integration Management UI** (`/integrations` page):
      - OAuth connection status for QuickBooks and Gusto
      - Connect/disconnect functionality with confirmation dialogs
      - Token refresh capability for expired connections
      - Connection details display (company ID, last sync, token expiry)
      - Status badges (connected/expired/error/disconnected)
      - Integrated into BillOS™ sidebar navigation
      - Production setup instructions and documentation links
    - **Usage Tracking Integration**: All partner API calls wrapped with `withUsageTracking()` or `withBatchUsageTracking()` for accurate billing