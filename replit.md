# AutoForce™

## Overview
AutoForce™ (Autonomous Workforce Management Solutions) is a comprehensive workforce management platform designed for emergency services and other service-related industries. Its primary purpose is to streamline operations and reduce administrative burdens through features such as time tracking, automated invoice generation, smart hiring, compliance audit trails, and real-time analytics. The platform adopts an "OS" design philosophy for extensibility, aiming to be a single source of truth for workforce management, and revolutionizing the industry with a subscription and usage-based AI revenue model.

## User Preferences
I prefer detailed explanations.
Do not make changes to the folder `Z`.
Do not make changes to the file `Y`.
All branding must be 100% AutoForce™ (not WorkforceOS).
FTC COMPLIANCE: All marketing claims must be factual and verifiable. Avoid monopolistic language.

## System Architecture
AutoForce™ is built on a modular "OS" design philosophy (e.g., BillOS™, PayrollOS™, TrackOS™) to ensure clean code and extensibility.

### Advanced Billing & Usage-Based Pricing
The platform utilizes a hybrid pricing model for AI-powered OS modules, combining subscriptions with overage charges based on token usage. Non-AI modules operate on a flat subscription model. Monthly token allowances are tracked per workspace, with overage usage billed at a profitable rate.

### UI/UX Decisions
The platform features a professional aesthetic with Deep Charcoal, Platinum neutrals, and Emergency Green accents. It prioritizes a mobile-first approach with responsive layouts and accessible touch targets. The branding uses an "AF" lightning bolt logo within a circular green gradient badge. All user-facing pages consistently use emerald/green/teal colors for brand identity, with a uniform dark gradient background and emerald accents.

### Technical Implementations
- **Frontend**: React, Vite, TypeScript, Wouter, TanStack Query, shadcn/ui, `react-hook-form`, `zod`.
- **Backend**: Express.js, TypeScript, with Zod for validation.
- **Database**: PostgreSQL with Drizzle ORM.
- **Authentication**: Custom session-based authentication supporting Replit Auth (OIDC) and Custom Auth, including bcrypt, account locking, and password reset.
- **Multi-Tenancy**: Data isolation is managed on a workspace basis.
- **Role-Based Access Control (RBAC)**: Implements hierarchical roles and API protection.
- **Communication**: Utilizes an IRC-style WebSocket command/response architecture for real-time interactions. The chat system includes:
    - **HelpDesk5/LiveChat**: Mobile and desktop optimized support chat for organizations to interact with AutoForce™ support.
    - **CommOS™**: Organization-specific chatrooms with role-based access, supporting regular users, organization leaders, and platform support staff with specialized functionalities. Inactive rooms are automatically archived.
    - WebSocket protocol issues, specifically with `wss://` URLs, have been resolved across all related hooks.
- **Audit Logging**: Comprehensive audit trails provided by AuditOS™.
- **Core Feature Areas**:
    - **Financials**: Client Management, Billing & Payroll (BillOS™, PayrollOS™), automated invoice generation, payment processing.
    - **Employee Lifecycle**: Onboarding, contract management, shift management, timesheet and time-off requests.
    - **Compliance & Policy**: I-9 re-verification tracking, Policy Management (PolicIOS™) with version control.
    - **Communication**: Team Communication (CommOS™) with multi-room chat and AES-256-GCM encrypted private messages.
    - **Expense Management**: ExpenseOS™ for reimbursement, tracking, mileage calculation.
    - **Scheduling**: ScheduleOS™ with mobile-optimized shift calendars and AI-powered generation.
    - **Asset Management**: AssetOS™ for tracking vehicles and equipment.
    - **AI & Analytics**: RecordOS™ and InsightOS™ for natural language search, autonomous analytics, and predictive insights.
    - **Platform Administration**: ROOT Admin Dashboard, organization onboarding, and HelpDesk queue management.
- **Security**: Features Stripe webhook signature validation, payroll data protection, strict Zod validation, workspace scoping, and audit trails.

## External Dependencies
- **Database**: Neon (PostgreSQL)
- **ORM**: Drizzle ORM
- **Payment Processing**: Stripe Connect
- **Email**: Resend
- **AI**: OpenAI GPT-3.5-turbo (for HelpOS support bot), GPT-4o-mini (for advanced features)