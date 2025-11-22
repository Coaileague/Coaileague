# AutoForce™

## Overview
AutoForce™ (Autonomous Workforce Management Solutions) is a comprehensive platform powered by a unified AI Brain that autonomously manages end-to-end workforce operations. Its core purpose is to achieve complete automation—from intelligent scheduling and payroll to compliance monitoring and billing—with a 99% AI completion rate, minimizing human intervention. Key capabilities include AI-powered scheduling, automated invoice and payroll generation, smart hiring, compliance auditing, and real-time analytics. AutoForce™ targets emergency services and service-related industries with an aggressive value-based pricing model that captures 40-50% of the $250K-$430K in administrative salary savings customers achieve.

## Pricing Model
**Value-Based Subscription Pricing** (Updated 2025-11-22):
- **Free**: $0/mo (30-day trial, 5 employees max, view-only features)
- **Starter**: $4,999/mo ($59,988/yr) - Replaces 2-3 positions ($252.5K value) → $192K net savings/yr (3.2x return)
- **Professional**: $9,999/mo ($119,988/yr) - Replaces 3-4 positions ($335K value) → $215K net savings/yr (1.8x return)
- **Enterprise**: $17,999/mo ($215,988/yr) - Replaces 5 positions ($432.5K value) → $216K net savings/yr (1.0x return)

**Position Replacement Values** (based on senior-level salary benchmarks):
- Senior Payroll Specialist: $90K/yr
- Senior Billing Specialist: $85K/yr
- Workforce Scheduler: $77.5K/yr
- HR Operations Analyst: $82.5K/yr
- Admin Operations Manager: $97.5K/yr

**Pricing Philosophy**: All features are bundled into tiers (no individual add-ons). Pricing captures ~23-50% of customer savings depending on tier. All ROI claims are mathematically verified and FTC-compliant. AI usage features use customer-pays model at $0.002-$0.10 per interaction with monthly credits included in each tier.

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
AutoForce™ is powered by a **Unified AI Brain** that orchestrates autonomous operations across all platform features, primarily using Google Gemini 2.0 Flash Exp. The platform integrates intelligent scheduling, automated billing, payroll processing, communications, compliance monitoring, and analytics. User-facing branding emphasizes **AI Brain automation**. The system features comprehensive Role-Based Access Control (RBAC) and Tier Gating across Free, Starter, Professional, and Enterprise levels with a two-tier role hierarchy and complete multi-tenancy isolation.

**Support Organization Architecture**: The platform maintains a single canonical support workspace (`ops-workspace-00000000`) branded as "AutoForce Support" with organization code ORG-SUPT. All support staff (root_admin, sysop, support_manager, support_agent) belong exclusively to this workspace. HelpOS AI uses this workspace for authenticated staff interactions, while anonymous users are routed through the `autoforce-platform-workspace`. Database cleanup completed 2025-11-22: removed duplicate support workspaces (platform-external, wfms-support) to ensure single source of truth for support operations.

**UI/UX Decisions:** The platform uses a professional aesthetic with **AutoForce Blue** (#2563eb), Deep Charcoal backgrounds, and Platinum neutrals. It prioritizes a mobile-first, responsive approach with PWA capabilities, an "AF" lightning bolt logo, and contextual breadcrumbs. A **Unified Navigation System** is implemented, with a left AppSidebar for desktop and a UniversalNavHeader for mobile.

**Technical Implementations:**
-   **Frontend**: React, Vite, TypeScript, Wouter, TanStack Query, shadcn/ui, `react-hook-form`, `zod`.
-   **Backend**: Express.js, TypeScript, Zod for validation.
-   **Database**: PostgreSQL with Drizzle ORM.
-   **Authentication**: Custom session-based authentication supporting Replit Auth (OIDC) and Custom Auth.
-   **Security**: Stripe webhook validation, strict Zod validation, workspace scoping, audit trails, XSS protection (DOMPurify), IPv6-compliant rate limiting, and DB transaction safety.
-   **External Identifier System**: Human-readable IDs (ORG-XXXX, EMP-XXXX-00001, CLI-XXXX-00001, SUP-XXXX) for various entities.
-   **Autonomous Automation System**: Achieves 99% AI completion with 1% human governance for core operations like scheduling, invoice creation, and payroll processing. All actions are logged to an `aiEventStream` for auditing.
-   **Unified Gemini AI Brain**: Centralized AI intelligence system using Google Gemini 2.0 Flash Exp with a two-tier knowledge architecture, policy-based routing, confidence scoring for human approval workflows, and comprehensive audit trails. Includes a Proactive Monitoring System and powers features like the Q&A bot and notification digest.
-   **AI Scheduling with Smart Approval Workflow**: Autonomous scheduling via Gemini, analyzing availability, skills, and workload, with human review for low-confidence schedules. Schedule migration from external apps (PDFs/screenshots) via Gemini Vision API.
-   **Data Integrity System**: Event sourcing architecture with immutable audit trails, SHA-256 verification for AI actions, ID registry to prevent reuse, and Write-Ahead Logging (WAL) for transaction safety.
-   **Atomic Organization Registration Flow**: Transaction-safe registration process for User → Workspace → Expense Categories → Employee creation.
-   **Universal Migration System**: Provides comprehensive migration tracking for onboarding from external platforms.
-   **HelpDesk Chat System**: Universal support chat system with mobile/desktop support, WebSocket backend, auto-ticket creation, HelpOS AI assistant, and targeted support tools.
-   **HelpOS Multi-Workspace Architecture**: Intelligent workspace selection system for HelpOS tester - auto-selects sole workspace for single-workspace users, provides manual selector for multi-workspace owners (like root), uses `invalidateQueries` with await to ensure cache refresh completes before tests run, and displays response state correctly without disappearing text bugs.
-   **Platform-Wide Analytics for Support Staff**: Support team members with platform roles (root_admin, sysop, support_manager, support_agent) automatically receive aggregated analytics across ALL workspaces when accessing `/api/analytics/stats`. This provides complete visibility into platform health, client counts, employee totals, and operational metrics across all tenant organizations. Standard users see only their workspace data, while platform staff see the full picture to effectively troubleshoot and support all clients.

## External Dependencies
-   **Database**: Neon (PostgreSQL)
-   **ORM**: Drizzle ORM
-   **Payment Processing**: Stripe Connect
-   **Email**: Resend
-   **AI**: Google Gemini (2.0 Flash Exp)
-   **Constraint Solving**: TypeScript greedy constraint solver
-   **Financial Integrations**: QuickBooks Online (QBO), Gusto