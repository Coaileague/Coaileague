# WorkforceOS

## Overview
WorkforceOS is a comprehensive workforce management operating system designed to automate HR functions for businesses. It offers features such as time tracking, automated invoice generation, smart hiring, compliance audit trails, and real-time analytics. The platform aims to provide significant cost savings by integrating various HR functions into a single system, envisioning branded features like BillOS™, PayrollOS™, ScheduleOS™, HireOS™, TrackOS™, ReportOS™, and AnalyticsOS™ for a unified product identity.

## Recent Changes

### October 18, 2025 - SmartScheduleOS™ Complete Integration
**Comprehensive Intelligent Auto-Scheduling with Auto-Replacement & BillOS™ Integration**

**Key Achievement**: Connected all existing tracking systems without duplication - ScheduleOS™ AI reads from existing `timeEntries` and `shifts` tables to calculate reliability scores.

1. **ScheduleOS™ AI Engine** (`server/ai/scheduleos.ts`):
   - **ClockOS™ Integration**: Reads `timeEntries` table to get actual clock-in times, compares with `shifts` scheduled times to calculate tardiness (>15 min late), no-call-no-shows
   - **TalentOS™ Integration**: Pulls performance scores, composite scores, attendance rates from `performanceReviews` table
   - **Geo-Compliance**: GPS violations from `timeEntryDiscrepancies` table
   - **Availability System**: Day-of-week availability, preferred shift times from `onboardingApplications` table
   - **Location-Based Assignment**: Employee address for distance-based optimization
   - **Penalty Queue**: Tracks denied shifts (30 days), sorts employees by denial count
   - **Reliability Scoring**: Performance (30%), Attendance (25%), Punctuality (20%), violations penalties, seniority bonuses
   - **Risk Forecasting**: 0-100 risk scores with detailed factors array

2. **Auto-Replacement Workflow** (`server/routes.ts`):
   - **POST `/api/shifts/:id/acknowledge`**: Employee acknowledges AI shift
   - **POST `/api/shifts/:id/deny`**: Triggers auto-replacement - finds backup employee, creates new shift, penalty queue system deprioritizes denying employee

3. **BillOS™ Integration** (POST `/api/scheduleos/generate`):
   - Auto-creates/updates client invoices from generated shifts
   - Groups shifts by client/month into single draft invoice
   - Real-time total calculation (subtotal, tax, total)
   - Returns `billosIntegration` summary with billable hours and revenue

4. **Code Cleanup**:
   - Removed empty stub route `/api/leaders/pending-tasks`
   - Verified all 210 routes are active and implemented
   - Confirmed no duplicate time tracking - proper integration only

5. **Mobile UI Fixes** (`client/src/index.css`):
   - Fixed flex container min-width (text truncation)
   - Prevented horizontal scrolling
   - Fixed card/badge/button overflow
   - Scoped to `@media (max-width: 768px)`

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
        - **TalentOS™ (Internal Talent Marketplace & Performance-to-Pay)**:
            - **Internal Talent Marketplace**: Employees bid on internal role openings with intelligent matching based on skills, certifications, and performance scores. High-risk employees (PredictionOS™ turnover score >70%) trigger automatic manager alerts for retention interventions.
            - **Performance-to-Pay Loop**: Auto-calculates performance metrics from Unified Data Nexus (attendance rate, shift completion, report quality, compliance violations, overtime hours) and generates data-justified pay increase recommendations with transparent formulas. Managers can override with justification. Replaces subjective annual reviews with objective, continuous performance measurement.
            - **Career Pathing System**: Role templates define progression paths with required skills, certifications, and minimum performance thresholds. Skill gap analysis identifies training needs and generates personalized development plans linked to LearnOS™.
            - **Unified Data Nexus Integration**: Performance reviews pull metrics from ClockOS™ (time tracking), ScheduleOS™ (shifts), ReportOS™ (submission quality), and compliance systems to create composite performance scores (0-100%) with performance tiers (exceptional/exceeds/meets/needs improvement/unsatisfactory).
        - **AssetOS™ (Physical Resource Allocation & Billing)**:
            - **Dual-Layer Resource Scheduling**: Extends ScheduleOS™ to schedule both employees AND physical assets (vehicles, equipment, machinery) on the same timeline. Real-time conflict detection prevents double-booking expensive equipment.
            - **Operator Certification Verification**: Automatically validates employees have required certifications before allowing asset assignment (e.g., forklift license for heavy machinery).
            - **Asset-Time Reporting**: Tracks usage periods, odometer readings, fuel consumption, and billable hours for each asset deployment. Pre/post-inspection checklists with damage reporting automatically flag assets for maintenance.
            - **BillOS™ Auto-Billing Integration**: Asset usage charges automatically appear on client invoices. Zero-touch revenue generation from equipment rentals with cost center tracking for client accounting departments.
            - **Maintenance Scheduling**: Tracks maintenance intervals, schedules preventive maintenance, and blocks asset availability during service periods. Automated alerts for overdue maintenance.
            - **Utilization Analytics**: Calculates asset utilization rates, revenue per asset, and identifies underperforming equipment for ROI optimization.

## External Dependencies
- **Database**: Neon (PostgreSQL)
- **ORM**: Drizzle ORM
- **Payment Processing**: Stripe Connect
- **Email**: Resend
- **AI**: OpenAI GPT-4