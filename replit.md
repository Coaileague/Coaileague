# AutoForce™

## Overview
AutoForce™ (Autonomous Workforce Management Solutions) is a comprehensive platform designed to streamline operations, reduce administrative overhead, and establish a single source of truth for workforce management in emergency services and other service-related industries. Key capabilities include advanced time tracking, automated invoice and payroll generation, smart hiring, compliance auditing, and real-time analytics. The platform aims for extensibility with an "OS" design philosophy and targets a hybrid subscription and usage-based AI revenue model, envisioning autonomous financial operations with robust compliance and audit trails.

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
AutoForce™ employs a modular "OS" design philosophy, integrating 6 major autonomous systems (CommOS™, OperationsOS™, BillOS™, IntelligenceOS™, AuditOS™, MarketingOS™) for clean code and extensibility. It features comprehensive Role-Based Access Control (RBAC) and Tier Gating across Free, Starter, Professional, and Enterprise levels, with a two-tier role hierarchy.

### UI/UX Decisions
The platform features a professional aesthetic with Deep Charcoal, Platinum neutrals, and accent colors (Evergreen/Steel Blue/Professional Teal). It prioritizes a mobile-first, responsive approach with PWA capabilities, an "AF" lightning bolt logo, floating header, visible navigation labels, and contextual breadcrumbs. The navigation system uses a Gmail-style peek rail with three layout modes. Responsive typography and table frameworks are used throughout.

### Technical Implementations
-   **Frontend**: React, Vite, TypeScript, Wouter, TanStack Query, shadcn/ui, `react-hook-form`, `zod`.
-   **Backend**: Express.js, TypeScript, Zod for validation.
-   **Database**: PostgreSQL with Drizzle ORM.
-   **Authentication**: Custom session-based authentication supporting Replit Auth (OIDC) and Custom Auth, including account locking and password reset.
-   **Multi-Tenancy**: Data isolation managed on a workspace basis.
-   **Security**: Stripe webhook validation, strict Zod validation, workspace scoping, audit trails, XSS protection (DOMPurify), IPv6-compliant rate limiting, and DB transaction safety.
-   **External Identifier System**: Human-readable IDs (e.g., ORG-XXXX) for various entities.
-   **RBAC Employee Tracking**: Unified employee data access via `useEmployee` hook for consistent RBAC enforcement.
-   **Autonomous Automation System**: Anchor-based biweekly scheduling for BillOS™ and OperationsOS™ ensuring FLSA-compliant invoicing and payroll.
-   **CommOS™ Workroom System**: Shift-linked room creation, multi-file upload, automated room lifecycle, participant management, and comprehensive audit trail.
-   **Premium Chat Features**: Real-time WebSocket chat with typing indicators, read receipts, participant tracking, and quick-insert macros.
-   **Mobile Experience**: Fully responsive mobile interface with auto-detection, dedicated mobile pages, and a static HTML loading screen.
-   **Responsive Loading System**: Viewport-aware loading screens (`ResponsiveLoading` wrapper) with distinct desktop (`UniversalLoading`) and mobile (`MobileLoading`) experiences, branded with AutoForce™ elements.
-   **Navigation Protection System**: Reusable `useNavigationProtection` hook provides three-layer protection against accidental navigation from active sessions.
-   **Partner API Usage Tracking**: Middleware-based tracking with caller-supplied deterministic IDs for idempotency.
-   **Cost Aggregation & Billing**: Automated cost calculation and Stripe invoice generation, aggregating AI usage and partner API costs per workspace with tier-based markup.
-   **Partner OAuth Integration**: Secure OAuth 2.0 for QuickBooks Online and Gusto, featuring AES-256-GCM encryption, PKCE, CSRF protection, auto-refresh, and multi-tenant isolation.
-   **Unified Gemini AI Brain**: Utilizes Google Gemini 2.0 Flash Exp for all autonomous features, including **HelpOS™** (customer support AI) and **ScheduleOS™ Smart AI** (auto-scheduling engine). Includes a fix for conversation history to always start with 'user' role. Usage is metered via `usageMeteringService`.
-   **HelpOS™ 3-Tier Chat System**: Multi-level support system with FloatingSupportChat (anonymous guest chat), Guest Escalation Flow (captures user info, generates secure tokens), and Universal HelpDesk (authenticated user chat with RBAC). Features stable anonymous user IDs, strict session ownership validation, and a 4-layer FK defense for anonymous escalations.
-   **ScheduleOS™ Smart AI Approval Workflow**: Autonomous scheduling (99% AI, 1% human governance) via Gemini, analyzing availability, skills, and workload. Auto-approves schedules ≥95% confidence; otherwise, human review via UI. Includes legal disclaimers and a full audit trail.
-   **Schedule Migration via Gemini Vision**: Multimodal AI for schedule extraction from external apps (PDFs/screenshots) using Gemini Vision API for OCR and table extraction. AI learns scheduling patterns, provides previews, and offers one-click import with pattern recognition.
-   **Enhanced Constraint System**: Weighted constraint optimization distinguishing hard (legal compliance, availability) from soft (preferences, workload balance) constraints, integrated with predictive metrics.
-   **AI-Powered Employee Scoring System**: Comprehensive weighted scoring algorithm (8 factors) for intelligent shift matching, including hard filters (availability, credentials, OT thresholds).
-   **Fill Request Marketplace**: External contractor matching system for shifts, creating `shift_request` records, searching a `contractor_pool`, scoring contractors, and sending `shift_offers` with expiry.
-   **Universal Responsive Schedule with Drag-and-Drop**: Full-featured scheduling with desktop drag-and-drop via `@dnd-kit/core` and touch-optimized mobile interface. Uses a single `/schedule` route serving desktop or mobile components based on device detection.
-   **Mobile Schedule Integration**: Complete mobile-first scheduling experience with shared data architecture, including `useScheduleData` and `useShiftActions` hooks. The `MobileSchedule` component offers list-based views, manager tools, approvals, reports, and team drawers with RBAC. Week navigation uses `getTime()` for stable query keys.
-   **Universal Time Tracking System**: Consolidated time tracking with GPS verification, photo capture, and three-view navigation (Clock, Timesheet, Approvals). Features blue/cyan gradient branding (from-blue-600 to-indigo-600), RBAC-enforced operations, and manager approval workflows. Frontend aligned with backend schema using `clockIn`/`clockOut` fields for consistent data contracts. Auto-selection persists staff identity across clock cycles while managers retain employee dropdown access.

## Recent Changes (November 2025)
-   **TimeTracker System Enhancements**: Fixed 38 LSP type errors by aligning frontend property names with backend schema (`clockIn`/`clockOut` instead of `clockInTime`/`clockOutTime`). Implemented missing Approvals view with dedicated pending entry filtering, approve/reject controls, and empty state UI. All three navigation tabs (Clock, Timesheet, Approvals) now fully functional and tested end-to-end.
-   **Boot Overlay Fix**: Resolved blocking interaction issue by simplifying dismissal logic to remove race condition with HTML loader check. Overlay now reliably dismisses after 800ms when progress reaches 100%.

## External Dependencies
-   **Database**: Neon (PostgreSQL)
-   **ORM**: Drizzle ORM
-   **Payment Processing**: Stripe Connect
-   **Email**: Resend
-   **AI**: Google Gemini (2.0 Flash Exp)
-   **Constraint Solving**: TypeScript greedy constraint solver
-   **Financial Integrations**: QuickBooks Online (QBO), Gusto