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
- **Role-Based Access Control (RBAC)**: Supports Owner, Manager, Employee, and platform-level roles with hierarchical management and API protection.
- **Key Features**:
    - **Time Tracking**: Clock-in/out, real-time timers, automated calculations.
    - **Invoice Generation**: Automated from unbilled time, multi-client, tax/fee calculation.
    - **Analytics Dashboard**: Tracks revenue, hours, active users, invoice statistics.
    - **Advanced Scheduling System (SmartScheduleOS™)**: Professional calendar interface with drag-and-drop, real-time conflict detection, and optional AI auto-scheduling.
    - **Employee Onboarding (HireOS™)**: Multi-step process including personal info, tax, availability, documents, and e-signature.
    - **Report Management System (ReportOS™)**: Template management, dynamic submissions, supervisor approval, and automated email delivery. Includes automated compliance reporting (e.g., Labor Law Violation, Tax Remittance Proof), real-time KPI alerts, AI executive summaries (GPT-4), and a universal report workflow engine with industry templates, configurable approval workflows, and status tracking. Reports are timestamped, digitally locked, and saved as immutable PDFs.
    - **HR Management Suite**: Employee Benefits, Performance Reviews, PTO Management, and Employee Terminations.
    - **Custom Forms System**: Production-ready system for organization-specific forms with e-signature and document upload, including an admin form builder UI.
    - **AI Sales CRM**: AI-powered lead generation, sales pipeline tracking, and email campaigns.
    - **PayrollOS™**: Automated payroll processing with intelligent tax calculations, overtime logic, and data integration.
    - **BillOS™ (Financial Automation Suite)**: Unified invoicing and payroll automation with client billing rates, zero-touch usage-based invoicing, delinquency automation, and ExpenseOS™ for employee expenses.
    - **Employee Self-Service (ESS)**: W-4 submission, bank account management, and paystub access.
    - **Live HelpDesk (SupportOS™)**: IRC/MSN-style instant chat with WebSocket messaging, ticket-based authentication, real-time status indicators, staff toggle controls, audit logging, and a comprehensive slash command system. Features include AI queue management, mobile support staff menu, post-ticket review system, and secure request dialogs.
    - **Chat System Routes**: Dedicated routes for Desktop Chat (`/live-chat`) and Mobile Chat (`/mobile-chat`).
    - **Admin Dashboards**: Usage, Support, and Command Center.
    - **Portals**: Employee, Auditor/Bookkeeper, and Client/Subscriber portals.
    - **Billing & Monetization**: Transaction-based platform fee (3-10%) via Stripe Connect, tier-based pricing with feature flags, and a subscriber-pays-all model for AI features.
    - **Support & Communication**: Live HelpDesk chatroom with instant WebSocket messaging, ticket verification, staff controls, and email notifications.
    - **Security & Reliability**: Enterprise audit logging, IP-based rate limiting, global React error boundary, health monitoring, platform RBAC, workspace isolation, and field whitelisting.
    - **Escalation System**: Production-ready structured ticket system for leaders to escalate issues.
    - **Monopolistic Premium Features ($500/month tier)**:
        - **PredictionOS™ (AI Workforce Analytics)**: GPT-4 powered turnover risk prediction and cost variance analysis.
        - **Custom Logic Workflow Builder**: Visual drag-and-drop rule engine for automating workflows.
        - **Real-Time Geo-Compliance & Audit Trail**: GPS/IP tracking for time entries with mandatory 7-year retention.

## External Dependencies
- **Database**: Neon (PostgreSQL)
- **ORM**: Drizzle ORM
- **Payment Processing**: Stripe Connect
- **Email**: Resend
- **AI**: OpenAI GPT-4