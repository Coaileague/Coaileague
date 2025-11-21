# AutoForce™

## Overview
AutoForce™ (Autonomous Workforce Management Solutions) is a comprehensive platform powered by a unified AI Brain that autonomously manages end-to-end workforce operations. Its core purpose is to achieve complete automation—from intelligent scheduling and payroll to compliance monitoring and billing—with a 99% AI completion rate, minimizing human intervention. Key capabilities include AI-powered scheduling, automated invoice and payroll generation, smart hiring, compliance auditing, and real-time analytics. AutoForce™ targets emergency services and service-related industries with a hybrid subscription and usage-based revenue model, aiming for significant market potential through its autonomous capabilities.

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
AutoForce™ is powered by a **Unified AI Brain** that orchestrates autonomous operations across all platform features, primarily using Google Gemini 2.0 Flash Exp. The platform integrates intelligent scheduling, automated billing, payroll processing, communications, compliance monitoring, and analytics. User-facing branding emphasizes **AI Brain automation** over modular "OS" naming. The system features comprehensive Role-Based Access Control (RBAC) and Tier Gating across Free, Starter, Professional, and Enterprise levels with a two-tier role hierarchy.

**UI/UX Decisions:** The platform uses a professional aesthetic with **AutoForce Blue** (#2563eb) as the primary brand color, Deep Charcoal backgrounds, and Platinum neutrals, ensuring a unified color system. It prioritizes a mobile-first, responsive approach with PWA capabilities, an "AF" lightning bolt logo, and contextual breadcrumbs. A **Unified Navigation System** is implemented, with a left AppSidebar (collapsible peek rail) for desktop and a UniversalNavHeader (blue gradient top bar, hamburger menu, Sheet/Drawer navigation) for mobile, preventing duplicate menus. Responsive typography and table frameworks are used throughout.

**Technical Implementations:**
-   **Frontend**: React, Vite, TypeScript, Wouter, TanStack Query, shadcn/ui, `react-hook-form`, `zod`.
-   **Backend**: Express.js, TypeScript, Zod for validation.
-   **Database**: PostgreSQL with Drizzle ORM.
-   **Authentication**: Custom session-based authentication supporting Replit Auth (OIDC) and Custom Auth, including account locking and password reset.
-   **Multi-Tenancy**: Data isolation managed on a workspace basis.
-   **Security**: Stripe webhook validation, strict Zod validation, workspace scoping, audit trails, XSS protection (DOMPurify), IPv6-compliant rate limiting, and DB transaction safety.
-   **External Identifier System**: Human-readable IDs (ORG-XXXX, EMP-XXXX-00001, CLI-XXXX-00001, SUP-XXXX) for various entities, integrated with the AI Brain for audit trails.
-   **Autonomous Automation System**: Achieves 99% AI completion with 1% human governance for core operations like scheduling, invoice creation (Stripe), and payroll processing (Gusto). All actions are logged to an `aiEventStream` for auditing.
-   **Unified Gemini AI Brain**: Centralized AI intelligence system using Google Gemini 2.0 Flash Exp with a two-tier knowledge architecture (Global Intelligence Graph, Workspace Context Graphs), policy-based routing, confidence scoring for human approval workflows, and comprehensive audit trails. Includes a Proactive Monitoring System.
-   **AI Scheduling with Smart Approval Workflow**: Autonomous scheduling via Gemini, analyzing availability, skills, and workload, with human review for low-confidence schedules.
-   **Schedule Migration via Gemini Vision**: Multimodal AI for schedule extraction from external apps (PDFs/screenshots) using Gemini Vision API.
-   **Data Integrity System**: Event sourcing architecture with immutable audit trails, SHA-256 verification for AI actions, ID registry to prevent reuse, and Write-Ahead Logging (WAL) for transaction safety. Actor type tracking ensures accountability.
-   **Atomic Organization Registration Flow**: Transaction-safe registration process ensuring atomicity for User → Workspace → Expense Categories → Employee creation.
-   **Universal Migration System**: Provides comprehensive migration tracking for onboarding from external platforms, including `migrationJobs`, `migrationDocuments`, and `migrationRecords` tables, supporting various document types and AI Brain synchronization.

## External Dependencies
-   **Database**: Neon (PostgreSQL)
-   **ORM**: Drizzle ORM
-   **Payment Processing**: Stripe Connect
-   **Email**: Resend
-   **AI**: Google Gemini (2.0 Flash Exp)
-   **Constraint Solving**: TypeScript greedy constraint solver
-   **Financial Integrations**: QuickBooks Online (QBO), Gusto