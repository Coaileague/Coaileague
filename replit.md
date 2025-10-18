# WorkforceOS

## Overview
WorkforceOS is a comprehensive workforce management operating system designed to automate HR functions for businesses. It offers features such as time tracking, automated invoice generation, smart hiring, compliance audit trails, and real-time analytics. The platform aims to provide significant cost savings by integrating various HR functions into a single system, envisioning branded features like BillOS™, PayrollOS™, ScheduleOS™, HireOS™, TrackOS™, ReportOS™, and AnalyticsOS™ for a unified product identity.

## User Preferences
I prefer detailed explanations.
Do not make changes to the folder `Z`.
Do not make changes to the file `Y`.

## System Architecture
### Organization Principles
- **Modular OS Design**: Features organized into branded "OS" modules.
- **Extend, Don't Rebuild**: Build on existing systems.
- **Clean Code**: Organized by category/version for independent upgrades.
- **Single Source of Truth**: One system per feature domain.

### UI/UX Decisions
The platform features a CAD-style professional interface with a dark mode theme, emphasizing precision, and includes an application frame with a menu, toolbar, and status bar. The design is modern, professional, mobile-first, and utilizes corporate blue gradient accents. The official logo is a realistic neon-style "W" with glowing "OS" superscript. A universal transition system provides smooth visual feedback.

### Technical Implementations
- **Frontend**: React, Vite, TypeScript, Wouter, TanStack Query, shadcn/ui, `react-hook-form`, `zod`.
- **Backend**: Express.js, TypeScript, with Zod for request body validation.
- **Database**: PostgreSQL with Drizzle ORM.
- **Authentication**: Custom session-based authentication with bcrypt, account locking, and password reset.
- **Multi-Tenancy**: Workspace-based data isolation.
- **Role-Based Access Control (RBAC)**: Supports Owner, Manager, Employee, Supervisor, HR Manager and platform-level roles with hierarchical management and API protection.
- **Key Features**:
    - **Time Tracking**: Clock-in/out, real-time timers, automated calculations.
    - **Invoice Generation (BillOS™)**: Automated from unbilled time, multi-client, tax/fee calculation, zero-touch usage-based invoicing.
    - **Analytics Dashboard**: Tracks revenue, hours, active users, invoice statistics.
    - **Advanced Scheduling System (SmartScheduleOS™)**: Professional calendar interface with drag-and-drop, real-time conflict detection, AI auto-scheduling with auto-replacement, reliability scoring, and BillOS™ integration.
    - **Employee Onboarding (HireOS™)**: Multi-step process including personal info, tax, availability, documents, e-signature, digital file cabinet, auditable compliance workflow, and 7-year retention.
    - **Report Management System (ReportOS™)**: Template management, dynamic submissions, supervisor approval, automated email delivery, compliance reporting, KPI alerts, AI executive summaries, and a universal report workflow engine.
    - **HR Management Suite**: Employee Benefits, Performance Reviews, PTO Management, Employee Terminations. Includes a designated HR Manager role with granular document permissions for onboarding and compliance.
    - **Custom Forms System**: Production-ready system for organization-specific forms with e-signature and document upload, including an admin form builder UI.
    - **AI Sales CRM**: AI-powered lead generation, sales pipeline tracking, and email campaigns.
    - **PayrollOS™**: Automated payroll processing with intelligent tax calculations, overtime logic, and data integration.
    - **Employee Self-Service (ESS)**: W-4 submission, bank account management, paystub access, and editable contact information with locked legal documents.
    - **Live HelpDesk (SupportOS™)**: IRC/MSN-style instant chat with WebSocket messaging, ticket-based authentication, real-time status indicators, staff toggle controls, audit logging, and a comprehensive slash command system.
    - **Admin Dashboards**: Usage, Support, and Command Center.
    - **Portals**: Employee, Auditor/Bookkeeper, and Client/Subscriber portals.
    - **Billing & Monetization**: Transaction-based platform fee, tier-based pricing with feature flags, and a subscriber-pays-all model for AI features.
    - **Security & Reliability**: Enterprise audit logging, IP-based rate limiting, global React error boundary, health monitoring, platform RBAC, workspace isolation, and field whitelisting.
    - **Escalation System**: Production-ready structured ticket system for leaders to escalate issues.
    - **Monopolistic Premium Features**:
        - **PredictionOS™ (AI Workforce Analytics)**: GPT-4 powered turnover risk prediction and cost variance analysis.
        - **Custom Logic Workflow Builder**: Visual drag-and-drop rule engine for automating workflows.
        - **Real-Time Geo-Compliance & Audit Trail**: GPS/IP tracking for time entries with mandatory 7-year retention.
        - **TalentOS™ (Internal Talent Marketplace & Performance-to-Pay)**: Internal marketplace for roles, performance-to-pay loop, career pathing, and unified data nexus integration.
        - **AssetOS™ (Physical Resource Allocation & Billing)**: Dual-layer resource scheduling (employees + assets), operator certification verification, asset-time reporting, BillOS™ integration, maintenance scheduling, and utilization analytics.

## External Dependencies
- **Database**: Neon (PostgreSQL)
- **ORM**: Drizzle ORM
- **Payment Processing**: Stripe Connect
- **Email**: Resend
- **AI**: OpenAI GPT-4