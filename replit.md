# AutoForce™

## Overview
AutoForce™ (Autonomous Workforce Management Solutions) is a comprehensive platform designed for emergency services and other service-related industries. Its primary goal is to streamline operations, reduce administrative overhead, and serve as a single source of truth for workforce management. Key capabilities include advanced time tracking, automated invoice and payroll generation, smart hiring, compliance auditing, and real-time analytics. The platform operates on an "OS" design philosophy for extensibility and aims for a hybrid subscription and usage-based AI revenue model, where users cover operational costs plus a profit margin. The business vision is to provide autonomous financial operations while ensuring compliance and maintaining audit trails.

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

## Recent Changes
-   **Premium Mobile Chat Complete** (November 2025): Launched comprehensive premium mobile chat at `/premium-chat` with real-time messaging, typing indicators, read receipts, participant management, and quick-insert macros for support agents. Backend infrastructure includes automated WebSocket cleanup (5-minute cron), secure typing indicator APIs with conversation participation validation, and workspace-scoped chat macros. Enhanced `use-chatroom-websocket` hook with Map-based state for read receipts and participants. Four reusable chat components (MessageBubble, TypingIndicator, ParticipantDrawer, MacrosDrawer) built with AutoForce emerald theme. Mobile-first design with sticky quick actions, connection status banners, auto-scroll, and RBAC-gated macro access.
-   **AutoForce Design System - Public Pages Complete** (November 2025): Fully migrated Homepage, Pricing, Contact, and Support pages to uniform AutoForce Design System. ALL pages now use exact color specifications: emerald/green gradient CTAs (`from-emerald-600 to-green-600`), hero backgrounds (`from-slate-50 via-blue-50 to-cyan-50`), professional light theme with `bg-white` cards, `border-2 border-gray-200`, and `shadow-md`. Headers unified with `bg-white shadow-md border-b border-gray-200`. Removed ALL 24+ legacy HSL variables, replaced with Tailwind classes. Colored backgrounds limited to internal elements (icon wrappers, badges) only. Fortune 500 professional aesthetic achieved across all public-facing pages.

## System Architecture
AutoForce™ is built on a modular "OS" design philosophy, incorporating 6 major autonomous systems to promote clean code, automation, and extensibility. It features a comprehensive Role-Based Access Control (RBAC) and Tier Gating System across Free, Starter, Professional, and Enterprise tiers, with a two-tier role hierarchy for platform staff and workspace users.

### UI/UX Decisions
The platform features a professional aesthetic using Deep Charcoal, Platinum neutrals, and accent colors (Evergreen/Steel Blue/Professional Teal). It prioritizes a mobile-first approach with responsive layouts, accessible touch targets, and PWA capabilities. Branding includes an "AF" lightning bolt logo. Navigation includes a floating header, visible labels, and contextual breadcrumbs. Responsive typography using `clamp()` and a responsive table framework for mobile (transforming tables into progressive disclosure cards) are key UI features. The navigation system uses a Gmail-style peek rail with three layout modes (Collapsed, Expanded, Mobile Overlay) and a 6-family organization (CommOS™, OperationsOS™, BillOS™, IntelligenceOS™, AuditOS™, MarketingOS™) for structured menu navigation.

### The 6 Major OS Systems
1.  **BillOS™**: Administrative Billing & Financial Management (automated invoicing, payroll, expense management, usage-based AI billing).
2.  **OperationsOS™**: Field Operations Management (intelligent scheduling, GPS-verified time tracking, dispatch, asset tracking).
3.  **CommOS™**: Unified Communications Platform (organization chat, private messaging, automated notifications, HelpDesk with Gemini AI, shift-linked workrooms with file uploads, automated room lifecycle management, comprehensive audit trails, WebRTC voice chat).
4.  **AuditOS™**: Compliance & Audit Trail Management (activity logging, automation lifecycle tracking, SOC2/GDPR compliance).
5.  **IntelligenceOS™**: AI-Powered Automation & Analytics (natural language search, real-time analytics, AI support bot, predictive analytics).
6.  **MarketingOS™**: Automated Sales & Business Development (AI-powered RFP hunting, sales pipeline management).

### Technical Implementations
-   **Frontend**: React, Vite, TypeScript, Wouter, TanStack Query, shadcn/ui, `react-hook-form`, `zod`.
-   **Backend**: Express.js, TypeScript, Zod for validation.
-   **Database**: PostgreSQL with Drizzle ORM.
-   **Authentication**: Custom session-based authentication supporting Replit Auth (OIDC) and Custom Auth, with account locking and password reset. Dual-auth middleware pattern ensures API endpoints work with both auth systems seamlessly.
-   **Multi-Tenancy**: Data isolation managed on a workspace basis.
-   **External Identifier System**: Human-readable IDs (e.g., ORG-XXXX, EMP-XXXX-00001) for organizations, employees, clients, and support agents, auto-generated with collision-resistant logic and per-organization sequences.
-   **RBAC Employee Tracking**: Unified employee data access via `useEmployee` hook across mobile and desktop, providing employee IDs, workspace roles, and comprehensive employee records for audit trails and access control. Mobile pages fully synchronized with desktop for consistent RBAC enforcement.
-   **Autonomous Automation System**: Anchor-based biweekly scheduling for BillOS™ and OperationsOS™ ensuring consistent cadence for invoicing and payroll, with FLSA-compliant calculations and audit tracking.
-   **Security**: Stripe webhook validation, payroll data protection, strict Zod validation, workspace scoping, audit trails, comprehensive XSS protection via DOMPurify sanitization across all messaging surfaces, IPv6-compliant rate limiting (100 requests/15min per IP), and conversation-level access control for file uploads.
-   **CommOS™ Workroom System**: Shift-linked room creation for field operations coordination, multi-file upload system with MIME type validation and filename sanitization, automated room lifecycle management via cron (5-minute cadence), participant management with isActive enforcement, comprehensive audit trail via roomEvents and AuditOS integration, and workspace-scoped access control.
-   **Premium Chat Features**: Real-time WebSocket chat with typing indicators, read receipts, participant tracking, and quick-insert macros. Automated WebSocket connection cleanup service prevents orphaned connections. Secure typing indicator API validates conversation participation and workspace alignment. Chat macros support workspace-scoped and global templates accessible via `/api/chat/macros`. Enhanced WebSocket hook with Map-based state management for O(1) lookups. Four reusable components (MessageBubble, TypingIndicator, ParticipantDrawer, MacrosDrawer) with AutoForce emerald theme. Mobile-optimized UI at `/premium-chat` with RBAC-gated features.
-   **Mobile Experience**: Fully responsive mobile interface with auto-detection and dedicated mobile pages. Static HTML loading screen with green shiny gradient bar, rotating messages, and percentage display (4.5-5s duration). Mobile chat and dashboard fully integrated with RBAC tracking, displaying employee IDs and roles matching desktop functionality.
-   **Partner API Usage Tracking**: Middleware-based tracking system with caller-supplied deterministic IDs for idempotency, database deduplication, and non-blocking asynchronous architecture.
-   **Cost Aggregation & Billing**: Automated cost calculation and Stripe invoice generation, aggregating AI usage and partner API costs per workspace with tier-based markup rates.
-   **Partner OAuth Integration**: Secure OAuth 2.0 implementation for QuickBooks Online and Gusto, featuring AES-256-GCM encryption for tokens, PKCE, CSRF protection, auto-refresh logic, and multi-tenant isolation.

## External Dependencies
-   **Database**: Neon (PostgreSQL)
-   **ORM**: Drizzle ORM
-   **Payment Processing**: Stripe Connect
-   **Email**: Resend
-   **AI**: OpenAI GPT-3.5-turbo, Gemini 2.0 Flash Exp, GPT-4, GPT-4-turbo, GPT-4o.
-   **Constraint Solving**: TypeScript greedy constraint solver for ScheduleOS™.
-   **Financial Integrations**: QuickBooks Online (QBO) for invoicing, Gusto for payroll. These integrations include services for customer/employee sync, invoice creation, payment recording, payroll run creation, and time activity submission, all with comprehensive usage tracking and data mapping.