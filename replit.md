# AutoForce™

## Overview
AutoForce™ (Autonomous Workforce Management Solutions) is a comprehensive workforce management platform for emergency services and other service-related industries. It aims to streamline operations, reduce administrative burdens, and act as a single source of truth for workforce management. Key capabilities include time tracking, automated invoice generation, smart hiring, compliance audit trails, and real-time analytics. The platform utilizes an "OS" design philosophy for extensibility and aims for a subscription and usage-based AI revenue model.

## User Preferences
I prefer detailed explanations.
Do not make changes to the folder `Z`.
Do not make changes to the file `Y`.
All branding must be 100% AutoForce™ (not WorkforceOS).
FTC COMPLIANCE: All marketing claims must be factual and verifiable. Avoid monopolistic language.
No Refresh Buttons.
Role-Aware Settings Gear:
  - Regular users → Organization settings (`/settings`)
  - Support roles (leaders, deputy admins) → Admin tools (`/admin-command-center`)
  - ROOT/SYSOP admins → Platform management (`/platform-admin`)
Universal Back Navigation: Every page, modal, dialog needs clear exit/cancel/back buttons.
Unsaved Changes Protection: Forms and pages with editable content must warn users before navigation/close.

## System Architecture
AutoForce™ is built on a modular "OS" design philosophy (e.g., BillOS™, PayrollOS™, TrackOS™) for clean code and extensibility.

### Advanced Billing & Usage-Based Pricing
A hybrid pricing model combines subscriptions with overage charges for AI-powered modules based on token usage. Non-AI modules use a flat subscription. Monthly token allowances are tracked per workspace, with overage usage billed profitably.

### UI/UX Decisions
The platform features a professional aesthetic using Deep Charcoal, Platinum neutrals, and Emergency Green accents. It prioritizes a mobile-first approach with responsive layouts and accessible touch targets. Branding includes an "AF" lightning bolt logo within a circular green gradient badge. User-facing pages consistently use emerald/green/teal colors, a uniform dark gradient background, and emerald accents.

Key mobile-first PWA features include:
- Comprehensive mobile-first CSS variables for breakpoints, touch targets (48px minimum), spacing, typography, and safe areas.
- Complete Progressive Web App setup with manifest.json and a service worker for offline support and caching.
- A `ResponsiveAppFrame` provider with a `useMobile()` hook for device detection and PWA install prompts.
- CSS utility classes for mobile-specific elements like touch targets, safe areas, and navigation.
- Adaptive navigation that transforms the desktop sidebar into a bottom navigation bar on mobile.
- Mobile layout primitives such as `MobilePageWrapper`, `MobilePageHeader`, `MobileGrid`, and `MobileBottomSheet`.
- Touch gestures like pull-to-refresh and swipeable gestures.
- Performance optimizations including lazy loading for images and asset caching via the service worker.

### Technical Implementations
- **Frontend**: React, Vite, TypeScript, Wouter, TanStack Query, shadcn/ui, `react-hook-form`, `zod`.
- **Backend**: Express.js, TypeScript, with Zod for validation.
- **Database**: PostgreSQL with Drizzle ORM.
- **Authentication**: Custom session-based authentication supporting Replit Auth (OIDC) and Custom Auth, including bcrypt, account locking, and password reset.
- **Multi-Tenancy**: Data isolation is managed on a workspace basis.
- **Role-Based Access Control (RBAC)**: A comprehensive two-tier hierarchical role system separates platform support (e.g., `root_admin`, `support_agent`) from organization/tenant management (e.g., `org_owner`, `staff`). Platform roles are managed centrally, while workspace roles are assigned per-employee. Type safety is enforced via TypeScript, and authorization uses guard middleware with new role names.
- **Communication**: Utilizes an IRC-style WebSocket command/response architecture.
    - **HelpDesk (Consolidated Chat System)**: Features a unified `/chat` experience with Gemini AI integration, context-aware responses, and robust connection error handling. Mobile access is optimized via `/mobile-chat`.
    - **CommOS™**: Organization-specific chatrooms with role-based access, supporting private messages (AES-256-GCM encrypted), message reactions, threading, file uploads, @mentions, read receipts, rich text formatting, live room browser, and full-text search. Also includes WebRTC-powered voice/video calling.
- **Audit Logging**: Comprehensive audit trails provided by AuditOS™.
- **Core Feature Areas**:
    - **Financials**: Client Management, Billing & Payroll (BillOS™, PayrollOS™), automated invoice generation, payment processing.
    - **Employee Lifecycle**: Onboarding, contract management, shift management, timesheet and time-off requests.
    - **Compliance & Policy**: I-9 re-verification tracking, Policy Management (PolicIOS™) with version control.
    - **Expense Management**: ExpenseOS™ for reimbursement, tracking, mileage calculation.
    - **Scheduling**: ScheduleOS™ with mobile-optimized shift calendars and AI-powered generation.
    - **Asset Management**: AssetOS™ for tracking vehicles and equipment.
    - **AI & Analytics**: RecordOS™ and InsightOS™ for natural language search, autonomous analytics, and predictive insights.
    - **Platform Administration**: ROOT Admin Dashboard, organization onboarding, and HelpDesk queue management.
    - **Organization Support System**: Internal support ticket escalation workflow from organization leaders to platform support staff, including ticket creation, escalation, platform queue management, assignment, and resolution.
    - **HelpOS™ FAQ System**: AI-powered knowledge base with semantic search (OpenAI embedding-based), auto-generation from resolved tickets (GPT-3.5), conversation refinement, bulk import, and a draft-first workflow.
    - **HelpOS™ Autonomous Bot**: An intelligent support agent providing bot-first assistance with human escalation. It uses a state machine, FAQ-powered responses with confidence scoring, sentiment detection, auto-resolution, and smart escalation with context preservation. It includes dual notification systems (chat announcements and database notifications) and continuously learns from successful conversations.
- **Security**: Features Stripe webhook signature validation, payroll data protection, strict Zod validation, workspace scoping, and audit trails.

## External Dependencies
- **Database**: Neon (PostgreSQL)
- **ORM**: Drizzle ORM
- **Payment Processing**: Stripe Connect
- **Email**: Resend
- **AI**: OpenAI GPT-3.5-turbo (for HelpOS support bot), GPT-4o-mini (for advanced features)