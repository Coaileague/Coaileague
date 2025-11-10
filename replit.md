# AutoForce™

## Overview
AutoForce™ (Autonomous Workforce Management Solutions) is a comprehensive workforce management platform designed for emergency services and other service-related industries. Its primary goal is to streamline operations, reduce administrative burdens, and serve as a single source of truth for workforce management. Key capabilities include time tracking with advanced verification, automated invoice and payroll generation, smart hiring, compliance audit trails, and real-time analytics. The platform employs an "OS" design philosophy for extensibility and aims for a hybrid subscription and usage-based AI revenue model.

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
AutoForce™ is built on a modular "OS" design philosophy with 6 major autonomous systems to ensure clean code, eliminate redundancy, and maximize automation.

### Role-Based Access Control (RBAC) & Tier Gating System
The system features comprehensive role and subscription tier-based feature gating.
- **Backend**: Middleware for tier upgrades (HTTP 402) and role-based guards (e.g., Supervisor, OrgAdmin).
- **Frontend**: Dynamic UI elements (e.g., sidebar, dashboard) adapt based on user's workspace role, subscription tier, and platform staff status, showing locked features with upgrade prompts.
- **Hierarchical Tier System**: Free → Starter → Professional → Enterprise.
- **Two-tier Role Hierarchy**: Platform staff (support/root admin) and workspace roles (staff → supervisor → dept manager → org admin → org owner).

### The 6 Major OS Systems
1.  **BillOS™**: Administrative Billing & Financial Management (automated invoicing, payroll, expense management, Stripe integration, usage-based AI billing).
2.  **OperationsOS™**: Field Operations Management (intelligent scheduling, GPS-verified time tracking, dispatch, asset tracking, real-time updates).
3.  **CommOS™**: Unified Communications Platform (organization chat, private messaging, automated notifications, HelpDesk with Gemini AI, file uploads, rich text, WebRTC for calls). HelpDesk chat is publicly accessible without authentication and features responsive design for desktop and mobile.
4.  **AuditOS™**: Compliance & Audit Trail Management (activity logging, automation lifecycle tracking, SOC2/GDPR compliance, security monitoring).
5.  **IntelligenceOS™**: AI-Powered Automation & Analytics (natural language search, real-time analytics, AI support bot, FAQ system, document intelligence, predictive analytics).
6.  **MarketingOS™**: Automated Sales & Business Development (AI-powered RFP hunting, sales pipeline management, email campaigns, lead qualification - *COMING SOON*).

### UI/UX Decisions
The platform features a professional aesthetic using Deep Charcoal, Platinum neutrals, and Evergreen/Steel Blue/Professional Teal accents. It prioritizes a mobile-first approach with responsive layouts, accessible touch targets, and PWA capabilities. Branding includes an "AF" lightning bolt logo. Navigation features a floating header, visible labels, and contextual breadcrumbs.
- **Responsive Typography**: Opt-in fluid typography utilities using `clamp()` for smooth text scaling and spacing across all screen sizes.
- **Responsive Table Framework**: A production-ready mobile-first system transforms desktop tables into progressive disclosure cards on mobile to eliminate horizontal scroll and reduce cognitive load. This system is implemented with `ResponsiveTableWrapper`, `DataSummaryCard`, and `MobileCompactLayout` components, supporting P1 (critical), P2 (important), and P3 (optional) field priorities.

### Technical Implementations
-   **Frontend**: React, Vite, TypeScript, Wouter, TanStack Query, shadcn/ui, `react-hook-form`, `zod`.
-   **Backend**: Express.js, TypeScript, Zod for validation.
-   **Database**: PostgreSQL with Drizzle ORM.
-   **Authentication**: Custom session-based authentication supporting Replit Auth (OIDC) and Custom Auth, with features like account locking and password reset.
-   **Multi-Tenancy**: Data isolation managed on a workspace basis.
-   **Role-Based Access Control (RBAC)**: Comprehensive two-tier hierarchical role system with TypeScript and guard middleware.
-   **Autonomous Automation System**: Anchor-based biweekly scheduling system for BillOS™ invoicing, OperationsOS™ scheduling, and BillOS™ payroll, ensuring consistent cadence and preventing drift. Includes automated data collection for billable and payroll hours, with FLSA-compliant calculations and audit tracking.
-   **BillOS™ Features**: Integrated invoice and payroll generation with detailed breakdowns and tax calculations.
-   **Security**: Stripe webhook validation, payroll data protection, strict Zod validation, workspace scoping, and audit trails.
-   **Production Monitoring**: Comprehensive observability with error logging, performance metrics, health checks, and graceful shutdown.

## External Dependencies
-   **Database**: Neon (PostgreSQL)
-   **ORM**: Drizzle ORM
-   **Payment Processing**: Stripe Connect
-   **Email**: Resend
-   **AI**:
    -   OpenAI GPT-3.5-turbo (HelpOS support bot, RecordOS search)
    -   Gemini 2.0 Flash Exp (HelpDesk chat)
    -   GPT-4 (ScheduleOS validation & explanation)
    -   GPT-4-turbo (DisputeAI grievance analysis)
    -   GPT-4o (PredictionOS predictions, InsightOS analytics)
    -   Constraint Solving: TypeScript greedy constraint solver for ScheduleOS™