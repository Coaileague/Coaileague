# AutoForce™

## Overview
AutoForce™ (Autonomous Workforce Management Solutions) is a comprehensive platform for emergency services and other service-related industries. Its core purpose is to streamline operations, reduce administrative overhead, and establish a single source of truth for workforce management. Key capabilities include advanced time tracking, automated invoice and payroll generation, smart hiring, compliance auditing, and real-time analytics. The platform operates on an "OS" design philosophy for extensibility and aims for a hybrid subscription and usage-based AI revenue model. The business vision is to provide autonomous financial operations while ensuring compliance and maintaining audit trails.

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
AutoForce™ is built on a modular "OS" design philosophy, incorporating 6 major autonomous systems to promote clean code, automation, and extensibility. It features comprehensive Role-Based Access Control (RBAC) and Tier Gating across Free, Starter, Professional, and Enterprise tiers, with a two-tier role hierarchy.

### UI/UX Decisions
The platform features a professional aesthetic using Deep Charcoal, Platinum neutrals, and accent colors (Evergreen/Steel Blue/Professional Teal). It prioritizes a mobile-first approach with responsive layouts, accessible touch targets, and PWA capabilities. Branding includes an "AF" lightning bolt logo. Navigation features a floating header, visible labels, and contextual breadcrumbs. Responsive typography and a responsive table framework are key UI features. The navigation system uses a Gmail-style peek rail with three layout modes and a 6-family organization (CommOS™, OperationsOS™, BillOS™, IntelligenceOS™, AuditOS™, MarketingOS™) for structured menu navigation.

### Technical Implementations
-   **Frontend**: React, Vite, TypeScript, Wouter, TanStack Query, shadcn/ui, `react-hook-form`, `zod`.
-   **Backend**: Express.js, TypeScript, Zod for validation.
-   **Database**: PostgreSQL with Drizzle ORM.
-   **Authentication**: Custom session-based authentication supporting Replit Auth (OIDC) and Custom Auth, with account locking and password reset.
-   **Multi-Tenancy**: Data isolation managed on a workspace basis.
-   **External Identifier System**: Human-readable IDs (e.g., ORG-XXXX) for various entities, auto-generated with collision-resistant logic.
-   **RBAC Employee Tracking**: Unified employee data access via `useEmployee` hook across mobile and desktop for consistent RBAC enforcement.
-   **Autonomous Automation System**: Anchor-based biweekly scheduling for BillOS™ and OperationsOS™ ensuring consistent cadence for invoicing and payroll, with FLSA-compliant calculations.
-   **Security**: Stripe webhook validation, payroll data protection, strict Zod validation, workspace scoping, audit trails, comprehensive XSS protection via DOMPurify, IPv6-compliant rate limiting, and conversation-level access control for file uploads.
-   **CommOS™ Workroom System**: Shift-linked room creation, multi-file upload system, automated room lifecycle management, participant management, comprehensive audit trail, and workspace-scoped access control.
-   **Premium Chat Features**: Real-time WebSocket chat with typing indicators, read receipts, participant tracking, and quick-insert macros. Automated WebSocket connection cleanup service. Secure typing indicator API. Enhanced WebSocket hook with Map-based state management.
-   **Mobile Experience**: Fully responsive mobile interface with auto-detection and dedicated mobile pages. Static HTML loading screen. Mobile chat and dashboard fully integrated with RBAC tracking.
-   **Navigation Protection System**: Reusable `useNavigationProtection` hook provides three-layer protection against accidental navigation from active chat sessions (beforeunload warnings, popstate handling, in-app route interception).
-   **Partner API Usage Tracking**: Middleware-based tracking system with caller-supplied deterministic IDs for idempotency.
-   **Cost Aggregation & Billing**: Automated cost calculation and Stripe invoice generation, aggregating AI usage and partner API costs per workspace with tier-based markup rates.
-   **Partner OAuth Integration**: Secure OAuth 2.0 implementation for QuickBooks Online and Gusto, featuring AES-256-GCM encryption, PKCE, CSRF protection, auto-refresh logic, and multi-tenant isolation.
-   **Unified Gemini AI Brain**: AutoForce™ uses Google Gemini 2.0 Flash Exp as the single AI provider for all autonomous features. **HelpOS™** (customer support AI) and **ScheduleOS™ Smart AI** (auto-scheduling engine) both leverage Gemini for cost-effective, intelligent automation. Automatic usage billing via `usageMeteringService` tracks tokens per workspace with feature keys `helpos_gemini_support` and `scheduleos_smart_ai`. Replaces previous OpenAI dependency for better economics and performance.

## External Dependencies
-   **Database**: Neon (PostgreSQL)
-   **ORM**: Drizzle ORM
-   **Payment Processing**: Stripe Connect
-   **Email**: Resend
-   **AI**: Google Gemini (2.0 Flash Exp) - Unified AI brain for HelpOS™ support and ScheduleOS™ smart scheduling.
-   **Constraint Solving**: TypeScript greedy constraint solver for ScheduleOS™ manual scheduling.
-   **Financial Integrations**: QuickBooks Online (QBO) for invoicing, Gusto for payroll.