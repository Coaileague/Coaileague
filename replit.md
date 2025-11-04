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

### Platform Revenue Model: Service Middleman Fee System
**Data Flow**: Time Tracking → Payroll Calculation → Invoice Generation → Platform Fee Collection

1. **Time Tracking** (`/time-tracking`, `timeEntries` table):
   - Employees clock in/out via TIME CLOCK tab
   - Records stored in `timeEntries` table with GPS coordinates, IP address, clock in/out timestamps
   - Status tracked as 'active' (clocked in) or 'completed' (clocked out)
   - Billing status tracked as 'unbilled', 'billed', or 'paid'

2. **Payroll Automation** (`server/services/payrollAutomation.ts`):
   - Service queries all unbilled time entries for payroll processing
   - Calculates hours worked from clock in/out timestamps
   - Multiplies hours × employee wage rate = gross pay
   - Applies deductions (taxes, benefits) for net pay calculation
   - Creates payroll records tied to specific time entries
   - Marks time entries as 'billed' when payroll runs

3. **Invoice Generation** (`server/routes.ts`, `invoices` & `invoiceLineItems` tables):
   - For clients with `billingCycle: 'auto'`, system auto-generates invoices
   - Each invoice line item references the source time entry via `timeEntryId`
   - Line item includes: description, hours worked, rate, subtotal
   - Invoice totals calculated from all line items for that billing period
   - **Platform fee calculated as percentage of invoice total**

4. **Platform Fee Revenue**:
   - AutoForce™ acts as middleman between workforce provider (client) and employees
   - Client pays invoice total (employee wages + platform fee)
   - Platform retains fee percentage, passes remainder to workforce provider
   - Fee structure supports SaaS business model as transaction-based revenue
   - All fees tracked in invoice records for financial reporting

**Key Tables:**
- `timeEntries`: Raw clock in/out data with GPS/IP tracking
- `payrollRecords`: Calculated payroll from time entries
- `invoices`: Auto-generated bills for clients with billing automation
- `invoiceLineItems`: Individual charges tied to specific time entries (via `timeEntryId`)
- `clients`: Stores billing preferences (`billingCycle: 'auto' | 'manual'`)

**User Journey:**
1. Manager creates shifts in ScheduleOS™ (schedule-grid.tsx)
2. Employee clocks in/out via TIME CLOCK tab → /time-tracking page
3. Payroll automation runs (scheduled job) → processes unbilled time entries
4. Invoice generation creates bills for auto-billing clients
5. Platform collects fees as percentage of invoice total
6. Financial reports show platform revenue from transaction fees

### UI/UX Decisions
The platform features a CAD-style professional interface with a dark mode theme, emphasizing precision. It includes an application frame with a menu, toolbar, and status bar. The design is modern, professional, mobile-first, and utilizes corporate blue gradient accents. The official logo is a realistic neon-style "W" with glowing "OS" superscript. A universal transition system provides smooth visual feedback. Key UI components include tab-based navigation, collapsible sections, and mobile-optimized design elements. All acceptance forms have both accept and decline options. Enhanced empty states utilize animated gradient backgrounds, layered icon containers, and decorative spinning rings.

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
    - **Sales Operations**: DealOS™ + BidOS™ for RFP tracking, pipeline management, and proposal building, including AI-powered RFP summarization and template-based proposal generation.
    - **Scheduling**: ScheduleOS™ grid with drag-and-drop functionality for efficient workforce scheduling, supporting draft, published, open shifts, and a multi-day view (Sling-style). Includes shift acknowledgment system for post orders, special orders, safety notices, and site instructions. Features functional navigation tabs (ALL SCHEDULE active, MY SCHEDULE coming soon, GRID VIEW alternate layout, TIME CLOCK links to /time-tracking). Toolbar includes Export (CSV download), Print (browser print), Today (reset to current week), and Add Shift buttons—all with tooltips for guidance. Bug reporting and Help buttons in top bar for user support.
    - **Platform Administration**: ROOT Admin Dashboard for comprehensive user and platform role management, restricted by RBAC.

## External Dependencies
- **Database**: Neon (PostgreSQL)
- **ORM**: Drizzle ORM
- **Payment Processing**: Stripe Connect
- **Email**: Resend
- **AI**: OpenAI GPT-4 (`gpt-4o-mini`)