# AutoForce™

## Overview
AutoForce™ (Autonomous Workforce Management Solutions) is a comprehensive workforce management platform designed for emergency services and other service-related industries. Its primary purpose is to streamline operations and reduce administrative burden through features like time tracking, automated invoice generation, smart hiring, compliance audit trails, and real-time analytics. The platform embodies an "OS" design philosophy, focusing on extensibility and acting as a single source of truth for workforce management. AutoForce™ aims to revolutionize the industry with a revenue model based on subscription fees combined with usage-based AI pricing.

## User Preferences
I prefer detailed explanations.
Do not make changes to the folder `Z`.
Do not make changes to the file `Y`.
All branding must be 100% AutoForce™ (not WorkforceOS).
FTC COMPLIANCE: All marketing claims must be factual and verifiable. Avoid monopolistic language.

## Recent Changes (Nov 6, 2025)
### Mobile Bottom Navigation Cleanup - Simplified Navigation ✅
**Streamlined Mobile Bottom Nav** removing redundant communication option:
- **Problem**: Mobile bottom nav had "Chat" option pointing to /messages, which was redundant since CommOS™ already handles all team chatrooms
- **Solution**: Removed Chat navigation item from mobile menu
- **Changes**:
  - Removed `{ icon: MessageSquare, label: "Chat", path: "/messages" }` from navItems array
  - Cleaned up unused icon imports (MessageSquare, Users, FileText, Settings)
  - Mobile nav now has 4 focused items instead of 5
- **New Mobile Navigation Items**:
  - Home (/) - Dashboard with notifications
  - Schedule (/schedule) - ScheduleOS™ shift calendar
  - Time (/time-tracking) - TrackOS™ time tracking
  - Analytics (/analytics) - InsightOS™ analytics dashboard
- **Rationale**: CommOS™ provides comprehensive team chatroom functionality, eliminating need for duplicate messaging path
- **Production Status**: Architect-approved, navigation functions correctly with active route highlighting

## System Architecture
AutoForce™ is built upon a modular "OS" design philosophy (e.g., BillOS™, PayrollOS™, TrackOS™) to ensure clean code and extensibility.

**UI/UX Decisions:** The platform features a professional aesthetic with Deep Charcoal, Platinum neutrals, and Emergency Green accents. It prioritizes a mobile-first approach, offering responsive layouts and accessible touch targets. The branding includes an "AF" lightning bolt logo within a circular green gradient badge, symbolizing rapid response and reliability.

**Technical Implementations:**
- **Frontend**: React, Vite, TypeScript, Wouter, TanStack Query, shadcn/ui, `react-hook-form`, `zod`.
- **Backend**: Express.js, TypeScript, with Zod for validation.
- **Database**: PostgreSQL with Drizzle ORM.
- **Authentication**: Custom session-based authentication supporting Replit Auth (OIDC) and Custom Auth, featuring bcrypt, account locking, and password reset.
- **Multi-Tenancy**: Data isolation is managed on a workspace basis.
- **Role-Based Access Control (RBAC)**: Implements hierarchical roles and API protection.
- **Communication**: Utilizes an IRC-style WebSocket command/response architecture for real-time interactions, including server-side validation and permissions.
- **Audit Logging**: Comprehensive audit trails provided by AuditOS™.
- **Core Feature Areas**:
    - **Financials**: Client Management, Billing & Payroll (BillOS™, PayrollOS™), automated invoice generation, payment processing.
    - **Employee Lifecycle**: Onboarding, contract management (I9, W9, W4) with e-signature, shift management with approval workflows, timesheet and time-off requests.
    - **Compliance & Policy**: I-9 re-verification tracking, Policy Management (PolicIOS™) with version control and e-signature acknowledgments.
    - **Communication**: Team Communication (CommOS™) with multi-room chat, and Private Messages with AES-256-GCM server-side encryption and an audit access system.
    - **Expense Management**: ExpenseOS™ for reimbursement, tracking, mileage calculation, and approval workflows.
    - **Scheduling**: ScheduleOS™ with mobile-optimized shift calendars and shift action menus.
    - **Asset Management**: AssetOS™ for tracking vehicles and equipment.
    - **AI & Analytics**: RecordOS™ and InsightOS™ for natural language search, autonomous analytics, and predictive insights.
    - **Platform Administration**: ROOT Admin Dashboard, organization onboarding.
- **Security**: Features Stripe webhook signature validation, payroll data protection, strict Zod validation, workspace scoping, and audit trails.

## External Dependencies
- **Database**: Neon (PostgreSQL)
- **ORM**: Drizzle ORM
- **Payment Processing**: Stripe Connect
- **Email**: Resend
- **AI**: OpenAI GPT-4 (`gpt-4o-mini`)