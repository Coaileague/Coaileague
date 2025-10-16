# WorkforceOS

## Overview
WorkforceOS is an elite-grade operating system for comprehensive workforce management, designed to automate HR functions for businesses of all sizes. It offers features like time tracking, automated invoice generation, smart hiring, compliance audit trails, and real-time analytics. The platform aims to deliver significant annual cost savings by replacing multiple HR staff positions with a single, integrated automated system. Key capabilities include drag-and-drop scheduling, multi-tenant security, and robust role-based access control. The project vision includes offering branded features like BillOS™, PayrollOS™, ScheduleOS™, HireOS™, TrackOS™, ReportOS™, and AnalyticsOS™ to unify product identity and enhance market potential.

## User Preferences
I prefer detailed explanations.
Do not make changes to the folder `Z`.
Do not make changes to the file `Y`.

## System Architecture
### UI/UX Decisions
The platform features a CAD-style professional interface with a dark mode theme, emphasizing precision and control. It includes an application frame (menu, toolbar, status bar) and real-time indicators. The design is modern, professional, and mobile-first, utilizing indigo/purple gradient accents for brand consistency. Logout functionality is accessible across all layouts.

### Technical Implementations
- **Frontend**: React, Vite, TypeScript, Wouter, TanStack Query, shadcn/ui, `react-hook-form`, `zod`.
- **Backend**: Express.js, TypeScript, with Zod for request body validation.
- **Database**: PostgreSQL with Drizzle ORM.
- **Authentication**: Custom session-based authentication with bcrypt, account locking, and password reset.
- **Multi-Tenancy**: Workspace-based data isolation enforced at API and database levels.
- **Role-Based Access Control (RBAC)**: Supports Owner, Manager, and Employee roles with hierarchical management and API protection middleware. Includes platform-level roles (platform_admin, deputy_admin, deputy_assistant, sysop) for system administration.
- **Key Features**:
    - **Time Tracking**: Clock-in/out, real-time timers, automated calculations.
    - **Invoice Generation**: Automated from unbilled time, multi-client, tax/fee calculation.
    - **Analytics Dashboard**: Tracks revenue, hours, active users, invoice statistics.
    - **Advanced Scheduling System (ScheduleOS™)**: Professional grid interface, drag-and-drop, real-time statistics, conflict detection, AI auto-scheduling (optional, GPT-4 powered, subscriber-pays-all model with free trial).
    - **Employee Onboarding (HireOS™)**: Email invitation, multi-step process (personal info, tax, availability, documents, e-signature), compliance features.
    - **Report Management System (ReportOS™)**: Template management, dynamic submissions, supervisor approval, mandatory photo requirements, automated email delivery with tracking.
    - **Industry-Specific Business Categories**: Vertical SaaS approach with tailored form templates.
    - **Shift Orders/Post Orders**: Special instructions attached to shifts requiring employee acknowledgment.
    - **HR Management Suite**: Employee Benefits, Performance Reviews, PTO Management, Employee Terminations with comprehensive CRUD and workflow management.
    - **Custom Forms System**: Production-ready system for organization-specific forms with e-signature and document upload, including an admin form builder UI.
    - **AI Sales CRM**: AI-powered lead generation (GPT-4), 7-stage sales pipeline tracking, CRM features, email campaigns with AI personalization.
- **Admin Dashboards**: Usage, Support, and Command Center for platform monitoring and customer management.
- **Portals**: Employee, Auditor/Bookkeeper, and Client/Subscriber portals.
- **Billing & Monetization**: Transaction-based platform fee (3-10%) via Stripe Connect. Tier-based pricing (Professional, Enterprise, Elite) with feature flags. AI features follow a subscriber-pays-all model.
- **Support & Communication**: Live Chat System (REST API) with conversation management, MSN/IRC style helpdesk chat for staff, and email notifications via Resend.
- **Security & Reliability**: Enterprise audit logging, IP-based rate limiting, global React error boundary, health monitoring, platform RBAC, workspace isolation, and field whitelisting.

## External Dependencies
- **Database**: Neon (PostgreSQL)
- **ORM**: Drizzle ORM
- **Payment Processing**: Stripe Connect
- **Email**: Resend
- **AI**: OpenAI GPT-4