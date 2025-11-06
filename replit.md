# AutoForce™

## Overview
AutoForce™ (Autonomous Workforce Management Solutions) is a comprehensive workforce management platform for emergency services and service-related industries. It streamlines operations and reduces administrative burden by offering time tracking, automated invoice generation, smart hiring, compliance audit trails, and real-time analytics. The platform aims to revolutionize workforce management with an "OS" design philosophy, emphasizing extensibility and a single source of truth, supported by a revenue model combining subscription fees with usage-based AI pricing.

## User Preferences
I prefer detailed explanations.
Do not make changes to the folder `Z`.
Do not make changes to the file `Y`.
All branding must be 100% AutoForce™ (not WorkforceOS).
FTC COMPLIANCE: All marketing claims must be factual and verifiable. Avoid monopolistic language.

## Recent Changes (Nov 6, 2025)
### Mobile Shift Calendar Enhancement - ScheduleOS™ ✅
**Comprehensive Mobile Shift Management** with full operational workflow:
- **Core Features**: Weekly agenda view, color-coded shifts, week navigation, FAB creation, real-time API data
- **Shift Actions Panel** (Mobile-Optimized): Large Clock In/Out button, quick-action grid (Start Chat, Audit Trail, Post Orders, More)
- **Post Orders Acknowledgment**: Automatic detection, amber alerts, enforcement workflow preventing clock-in until acknowledged
- **Backend Integration**: Connected to `/api/time-entries/clock-in`, `/api/time-entries/:id/clock-out`, `/api/shifts/:shiftId/acknowledgments`, `/api/acknowledgments/:id/acknowledge`
- **Management Access**: Ops/managers can help employees via same interface with RBAC enforcement and automatic audit logging
- **Branding**: Emergency Green (#10b981) throughout, AutoForce™ styling, touch-optimized mobile-first design
- **Desktop Compatibility**: Mobile view < 768px, desktop grid ≥ 768px

## System Architecture
AutoForce™ is built on a modular "OS" design (e.g., BillOS™, PayrollOS™, TrackOS™), promoting clean code and extensibility.

**UI/UX Decisions:** The platform features a professional interface with Deep Charcoal, Platinum neutrals, and Emergency Green accents. It prioritizes mobile-first design with responsive layouts and accessible touch targets. The logo, an "AF" lightning bolt in a circular green gradient badge, symbolizes rapid response and reliability.

**Technical Implementations:**
- **Frontend**: React, Vite, TypeScript, Wouter, TanStack Query, shadcn/ui, `react-hook-form`, `zod`.
- **Backend**: Express.js, TypeScript, with Zod for validation.
- **Database**: PostgreSQL with Drizzle ORM.
- **Authentication**: Custom session-based authentication supporting both Replit Auth (OIDC) and Custom Auth, including bcrypt, account locking, and password reset.
- **Multi-Tenancy**: Workspace-based data isolation.
- **Role-Based Access Control (RBAC)**: Hierarchical roles and API protection.
- **Communication**: IRC-style WebSocket command/response architecture for real-time interactions, with server-side validation and permissions.
- **Audit Logging**: Comprehensive audit trails via AuditOS™.
- **Core Feature Areas**:
    - **Financials**: Client Management, Billing & Payroll (BillOS™, PayrollOS™) with automated invoice generation and payment processing.
    - **Employee Lifecycle**: Onboarding, contract management (I9, W9, W4) with e-signature, shift management with approval workflows, timesheet and time-off requests.
    - **Compliance & Policy**: I-9 re-verification tracking, Policy Management (PolicIOS™) with version control and e-signature acknowledgments.
    - **Communication**: Team Communication (CommOS™) with multi-room chat, and Private Messages with AES-256-GCM server-side encryption and an audit access system.
    - **Expense Management**: ExpenseOS™ for expense reimbursement, category tracking, mileage calculation, and approval workflows.
    - **Scheduling**: ScheduleOS™ with mobile-optimized shift calendars and shift action menus including chat creation and audit trail viewing.
    - **Asset Management**: AssetOS™ for tracking vehicles and equipment.
    - **AI & Analytics**: RecordOS™ and InsightOS™ for natural language search, autonomous analytics, and predictive insights.
    - **Learning & Development**: TrainingOS™.
    - **Financial Planning**: BudgetOS™.
    - **Employee Engagement**: EngagementOS™.
    - **HR Automation**.
    - **Integrations**: IntegrationOS™.
    - **Sales Operations**: DealOS™ + BidOS™.
    - **Platform Administration**: ROOT Admin Dashboard, organization onboarding.
- **Security**: Stripe webhook signature validation, payroll data protection, strict Zod validation, workspace scoping, and audit trails.

## External Dependencies
- **Database**: Neon (PostgreSQL)
- **ORM**: Drizzle ORM
- **Payment Processing**: Stripe Connect
- **Email**: Resend
- **AI**: OpenAI GPT-4 (`gpt-4o-mini`)