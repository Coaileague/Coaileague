# WorkforceOS

## Overview
WorkforceOS is a comprehensive workforce management operating system designed to automate HR functions for businesses. It offers features such as time tracking, automated invoice generation, smart hiring, compliance audit trails, and real-time analytics. The platform aims to provide significant cost savings by integrating various HR functions into a single system, envisioning branded features for a unified product identity. The project also focuses on monopolistic features to provide complete employee lifecycle management, granular role-based access control, and platform-level troubleshooting, justifying a premium pricing model.

## User Preferences
I prefer detailed explanations.
Do not make changes to the folder `Z`.
Do not make changes to the file `Y`.

## System Architecture
### Organization Principles
- **Modular OS Design**: Features are organized into branded "OS" modules (e.g., BillOS™, PayrollOS™, TrackOS™, TrainingOS™, BudgetOS™, EngagementOS™, IntegrationOS™).
- **Extend, Don't Rebuild**: Emphasizes building on existing systems.
- **Clean Code**: Code is organized by category/version for independent upgrades.
- **Single Source of Truth**: Each feature domain has a single authoritative system.

### UI/UX Decisions
The platform features a CAD-style professional interface with a dark mode theme, emphasizing precision. It includes an application frame with a menu, toolbar, and status bar. The design is modern, professional, mobile-first, and utilizes corporate blue gradient accents. The official logo is a realistic neon-style "W" with glowing "OS" superscript. A universal transition system provides smooth visual feedback. Key UI components include tab-based navigation, collapsible sections, and mobile-optimized design elements like touch-optimized buttons and fluid layouts. All acceptance forms have both accept and decline options.

### Technical Implementations
- **Frontend**: React, Vite, TypeScript, Wouter, TanStack Query, shadcn/ui, `react-hook-form`, `zod`.
- **Backend**: Express.js, TypeScript, with Zod for request body validation.
- **Database**: PostgreSQL with Drizzle ORM.
- **Authentication**: Custom session-based authentication with bcrypt, account locking, and password reset.
- **Multi-Tenancy**: Workspace-based data isolation.
- **Role-Based Access Control (RBAC)**: Supports various roles with hierarchical management and API protection.
- **IRC-Style Command/Response Architecture**: WebSocket commands use unique command IDs for request/response matching, with server-side validation, permission checks, and broadcasting.
- **AuditOS™**: Comprehensive audit logging system tracking all actions for compliance and abuse detection.
- **Key Feature Areas**:
    - **Client Management**: Client Onboarding, Client Portal.
    - **Billing & Payroll**: Invoice Review UI, Billing Cycle Automation, Email Notifications, PayrollOS™, PTO Accrual & Balance Tracking.
    - **Time & Expense Tracking**: Time Tracker Integration.
    - **Learning & Development**: TrainingOS™ (LMS) for course management, enrollments, and certifications.
    - **Financial Planning**: BudgetOS™ for fiscal year budget management, line items, and variance tracking.
    - **Employee Engagement**: EngagementOS™ for turnover risk prediction, satisfaction trends, pulse surveys, and automated distribution.
    - **HR Automation**: Performance Review Reminders, PTO Accrual, Automated Pulse Surveys.
    - **Integrations**: IntegrationOS™ for external service ecosystem.

## Recent Feature Additions (October 29, 2025)

### HR Automation - PTO Accrual & Balance Tracking
**Purpose**: Automates paid time off calculations and tracks employee balances in real-time.

**Implementation**:
- Service: `server/services/ptoAccrual.ts`
- Calculates accrued PTO hours based on `ptoHoursPerYear` from `employeeBenefits` table
- Pro-rates accrual for partial years and new hires based on hire date
- Tracks used vs. remaining balances per employee
- Designed for weekly automated execution via cron job

**API Endpoints**:
- `POST /api/hr/pto/calculate` - Calculate PTO for specific employee (Manager/Owner only)
- `GET /api/hr/pto/balances` - Get all employee PTO balances (Manager/Owner only)
- `POST /api/hr/pto/run-weekly` - Run weekly accrual for all active employees (Manager/Owner only)
- `POST /api/hr/pto/deduct` - Deduct PTO hours for approved time-off (Manager/Owner only)

**Data Model**: Uses existing `employeeBenefits` schema fields:
- `ptoHoursAccrued` - Total hours accrued to date
- `ptoHoursUsed` - Total hours used/deducted
- `ptoHoursPerYear` - Annual PTO entitlement

### HR Automation - Performance Review Reminders
**Purpose**: Identifies overdue and upcoming performance reviews to keep managers on schedule.

**Implementation**:
- Service: `server/services/performanceReviewReminders.ts`
- Detects reviews overdue by 30+ days
- Identifies reviews due within next 14 days
- Provides summary dashboard for manager visibility
- Uses existing `performanceReviews` table with `reviewDate` field

**API Endpoints**:
- `GET /api/hr/reviews/reminders/summary` - Get reminder summary with counts (Manager/Owner only)
- `GET /api/hr/reviews/reminders/overdue` - List all overdue reviews (Manager/Owner only)
- `GET /api/hr/reviews/reminders/upcoming` - List reviews due soon (Manager/Owner only)

**Output Structure**:
- Overdue: Employee name, review date, days overdue, urgency level
- Upcoming: Employee name, scheduled date, days until due
- Summary: Total overdue count, upcoming count

### EngagementOS™ - Automated Pulse Survey Distribution
**Purpose**: Automates employee survey assignment based on configurable frequency schedules.

**Implementation**:
- Service: `server/services/pulseSurveyAutomation.ts`
- Supports frequencies: weekly (7d), biweekly (14d), monthly (30d), quarterly (90d), annual (365d), one-time
- Tracks last response date per employee per survey
- Calculates who should receive surveys today based on frequency thresholds
- Prevents duplicate assignments and respects response history
- Provides response rate analytics with engagement/sentiment scoring

**API Endpoints**:
- `GET /api/engagement/pulse-surveys/distribution/summary` - Distribution dashboard (Manager/Owner only)
- `GET /api/engagement/pulse-surveys/distribution` - All employees due for surveys today (Manager/Owner only)
- `GET /api/engagement/pulse-surveys/distribution/employee/:employeeId` - Pending surveys for specific employee (All authenticated)
- `GET /api/engagement/pulse-surveys/analytics/:surveyId?periodDays=30` - Response rate analytics (Manager/Owner only)

**Analytics Metrics**:
- Total employees vs. responses received
- Response rate percentage
- Average engagement score (0-100)
- Average sentiment score (-100 to +100)
- Employees due today vs. upcoming this week (frequency-aware)

## External Dependencies
- **Database**: Neon (PostgreSQL)
- **ORM**: Drizzle ORM
- **Payment Processing**: Stripe Connect
- **Email**: Resend
- **AI**: OpenAI GPT-4