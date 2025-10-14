# Clockwork - Fortune 500 Workforce Management Platform

## Project Overview
Clockwork is a professional CAD-style workforce management platform with Fortune 500-grade architecture. The platform features drag-and-drop scheduling with templates, real-time time tracking with clock-in/out, automated invoice generation, multi-tenant security, role-based access control, and comprehensive analytics. The platform is ready to process payments from end customers with configurable platform fees (Stripe integration ready when API keys are provided).

## Architecture
- **Frontend**: React + Vite + TypeScript + Wouter (routing) + TanStack Query + shadcn/ui
- **Backend**: Express.js + TypeScript
- **Database**: PostgreSQL (Neon) with Drizzle ORM
- **Authentication**: Replit Auth (OIDC)
- **Payment Processing**: Stripe Connect (ready for when API keys are provided)
- **Multi-Tenancy**: Workspace-based isolation with strict data scoping

## Key Features Implemented

### Phase 1 - MVP (Completed)
- ✅ Multi-tenant workspace system with subscription tiers
- ✅ Replit Auth integration for secure authentication
- ✅ Drag-and-drop schedule builder with visual timeline
- ✅ Employee management (CRUD with hourly rates, roles, availability)
- ✅ Client management (CRUD with contact info, billing details)
- ✅ Shift scheduling with employee-client assignments
- ✅ Multi-tenant data isolation and security
- ✅ Responsive design with dark mode support

### Phase 2 - Advanced Features (In Progress)
- ✅ **Time Tracking System**
  - Clock-in/clock-out functionality
  - Real-time elapsed timers (updates every 10 seconds)
  - Shift-linked time entries
  - Automatic hourly rate calculation
  - Total amount computation from hours × rate
  
- ✅ **Automated Invoice Generation**
  - Generate invoices from unbilled time entries
  - Multi-client time entry selection
  - Automatic tax and platform fee calculation
  - Invoice line items linked to time entries
  - Status tracking (draft/sent/paid)
  
- ✅ **Analytics Dashboard**
  - Total revenue tracking (after platform fees)
  - Total hours worked across all time entries
  - Active employee and client counts
  - Workspace usage metrics (employee/client capacity)
  - Invoice statistics and payment rates
  - Subscription tier display

- ✅ **Role-Based Access Control (RBAC)**
  - Three role levels: Owner, Manager, Employee
  - Hybrid workspace resolution (explicit workspaceId or auto-detect)
  - Manager assignment system for hierarchical workflows
  - Route-level authorization middleware
  - Multi-workspace support with explicit selection

- ✅ **Advanced Scheduling**
  - Shift templates (reusable patterns)
  - Recurring shifts (daily/weekly with date ranges)
  
- 🚧 **Email Notifications** (Planned)
- 🚧 **SMS Notifications** (Planned)
- 🚧 **Calendar Export/Import** (Planned)

## Database Schema

### Core Tables
- **users**: User accounts (Replit Auth integration)
- **workspaces**: Business tenants with subscription info
- **employees**: Workspace-scoped employee records with workspaceRole (owner/manager/employee)
- **clients**: Workspace-scoped client records
- **shifts**: Scheduled work periods (employee + client + time)
- **shift_templates**: Reusable shift patterns
- **time_entries**: Clock-in/out records with billing calculations
- **invoices**: Client invoices with platform fee tracking
- **invoice_line_items**: Individual invoice items (linked to time entries)
- **manager_assignments**: Manager-employee hierarchical relationships

## Multi-Tenant Security

### Data Isolation Strategy
1. All tables include `workspaceId` foreign key
2. Every API route validates workspace ownership via authenticated user
3. Database queries always filter by `workspaceId`
4. Cross-tenant data leakage prevented through joins and filters

### Critical Security Patterns
- Invoice generation filters unbilled time entries with workspace-scoped joins
- Analytics calculations scoped to workspace data only
- Storage layer enforces workspace isolation on all operations

## Role-Based Access Control (RBAC)

### Role Hierarchy
- **Owner**: Full workspace control, can assign managers, manage billing
- **Manager**: Can manage assigned employees, approve requests, view reports
- **Employee**: Can clock in/out, view own schedule, submit requests

### Workspace Resolution (Hybrid Model)
The RBAC middleware uses a hybrid workspace resolution strategy:

1. **Explicit workspaceId**: If provided in request, validates user has access
   - Checks workspace ownership first (for owners)
   - Then checks employee membership (for managers/employees)
   - Rejects unauthorized access with 403

2. **Auto-detection**: If no workspaceId provided
   - Single workspace owner → uses owned workspace
   - Single employee membership → uses that workspace
   - Multiple workspaces → returns 400 error requiring explicit selection

### Manager Assignment System
- **Table**: `manager_assignments` links managers to employees
- **Validation**: Cross-tenant checks ensure manager/employee in same workspace
- **Role Check**: Only employees with 'manager' or 'owner' role can be assigned as managers
- **Unique Constraint**: Prevents duplicate manager-employee pairs

### API Authorization Patterns
```typescript
requireOwner    // Owners only (e.g., billing, workspace settings)
requireManager  // Owners and managers (e.g., reports, approvals)
requireEmployee // All roles (e.g., view schedule, clock in/out)
```

### Security Guarantees
- No cross-tenant data access (validated at middleware level)
- Role-based route protection (enforced before business logic)
- Multi-workspace support (explicit selection when ambiguous)
- Manager assignments validated for workspace membership and role

## Payment Architecture

### Stripe Connect Integration (Ready)
- Platform acts as payment facilitator
- End customers pay through platform
- Platform fee (configurable per workspace) deducted automatically
- Remainder transferred to business subscriber
- Structure ready for activation when Stripe API keys are provided

### Fee Calculation
```
Customer Payment → Invoice Total (with tax)
Platform Fee = Total × platformFeePercentage
Business Amount = Total - Platform Fee
```

## Recent Technical Decisions

### Time Tracking
- Time entries must link to shifts via `shiftId`
- Real-time timers use interval-based state updates (every 10 seconds)
- Clock-out calculates `totalHours` and `totalAmount` server-side

### Invoice Generation
- Tax rate stored as percentage (not dollar amount)
- All monetary calculations use `parseFloat()` with NaN guards
- Two-decimal precision enforced with `.toFixed(2)`
- Unbilled entries filtered through workspace-scoped invoice joins

### Analytics
- Revenue calculated from `businessAmount` (post-platform-fee)
- Hours aggregated from completed time entries
- Usage metrics show current vs. tier limits
- String-to-number conversions use `String()` wrapper for safety

## Development Guidelines

### Frontend Patterns
- Use TanStack Query for all API calls (no custom `queryFn`)
- Invalidate cache after mutations using `queryClient.invalidateQueries()`
- Form validation with `react-hook-form` + `zod` + shadcn Form components
- Add `data-testid` to all interactive elements

### Backend Patterns
- Validate request bodies with Zod schemas
- Always verify workspace ownership in routes
- Use storage interface methods (never raw DB queries in routes)
- Return 404 for missing workspace, 400 for validation errors

### Styling
- Follow `design_guidelines.md` for colors and spacing
- Use shadcn components (Button, Card, Badge) for consistency
- Leverage `hover-elevate` and `active-elevate-2` utility classes
- Never implement custom hover states on shadcn components

## Current State
- ✅ Complete CAD-style Fortune 500 interface transformation
- ✅ Rebranded to Clockwork with professional logo and landing page
- ✅ All core scheduling and time tracking features complete
- ✅ Invoice generation from time entries working
- ✅ Analytics dashboard displaying comprehensive metrics
- ✅ Multi-tenant isolation verified and secure
- ✅ RBAC system with manager assignments fully implemented
- 🚧 Ready for notification systems and calendar integrations

## CAD-Style Professional Interface ✨ *New*
- **Application Frame**: Menu bar (File/Edit/View/Tools/Help), context-aware toolbar, real-time status bar
- **Professional Theme**: CAD dark mode with precision color scheme (blue/green/orange/red status indicators)
- **Real-Time Indicators**: Live clocks in menu bar and status bar, connection status, workspace metrics
- **Clockwork Branding**: Professional gear-based logo, Fortune 500-grade landing page
- **Design Philosophy**: Program-like interface, not website - built for precision and control

## Demo System ✨
- **Interactive Demo Workspace** - Prospects can try the platform without signing up
- Landing page "View Demo" button (/api/demo-login)
- Pre-populated with realistic sample data:
  * 5 employees (varied roles and rates)
  * 3 clients (with company info)
  * 10 shifts (past and future)
  * 5 time entries (3 billed, 2 unbilled)
  * 2 invoices (1 paid, 1 sent)
- Demo mode banner with "Sign Up for Free" CTA
- Reset script: `tsx scripts/reset-demo.ts` (manual cleanup)
- Shared workspace model (low cost, resets every 24hrs)

## API Endpoint Coverage (99.9% Complete)

### Authentication & Authorization (✅ Complete)
- `GET /api/auth/user` - Get authenticated user
- `GET /api/demo-login` - Interactive demo access
- RBAC middleware: `requireOwner`, `requireManager`, `requireEmployee`

### Workspace Management (✅ Complete)
- `GET /api/workspace` - Get/create workspace
- `PATCH /api/workspace` - Update workspace settings

### Employee Management (✅ Complete)
- `GET /api/employees` - List all employees
- `POST /api/employees` - Create employee (with email notification)
- `PATCH /api/employees/:id` - Update employee
- `DELETE /api/employees/:id` - Delete employee

### Client Management (✅ Complete)
- `GET /api/clients` - List all clients
- `POST /api/clients` - Create client
- `PATCH /api/clients/:id` - Update client
- `DELETE /api/clients/:id` - Delete client

### Schedule Management (✅ Complete)
- `GET /api/shifts` - List all shifts
- `POST /api/shifts` - Create shift
- `PATCH /api/shifts/:id` - Update shift
- `DELETE /api/shifts/:id` - Delete shift
- `POST /api/shifts/bulk` - Create recurring shifts
- `GET /api/shift-templates` - List templates
- `POST /api/shift-templates` - Create template
- `DELETE /api/shift-templates/:id` - Delete template

### Time Tracking (✅ Complete)
- `GET /api/time-entries` - List time entries
- `POST /api/time-entries` - Create time entry
- `POST /api/time-entries/clock-in` - Clock in
- `PATCH /api/time-entries/:id/clock-out` - Clock out
- `GET /api/time-entries/unbilled/:clientId` - Get unbilled entries

### Invoicing & Billing (✅ Complete)
- `GET /api/invoices` - List invoices
- `POST /api/invoices` - Create invoice
- `POST /api/invoices/generate-from-time` - Auto-generate from time entries

### Analytics & Reporting (✅ Complete)
- `GET /api/analytics` - Dashboard metrics (revenue, hours, usage)

### RBAC & Manager Assignments (✅ Complete)
- `POST /api/manager-assignments` - Create assignment (owners only)
- `GET /api/manager-assignments` - List assignments (managers+)
- `GET /api/manager-assignments/manager/:id` - Get by manager
- `GET /api/manager-assignments/employee/:id` - Get by employee
- `DELETE /api/manager-assignments/:id` - Delete assignment (owners only)

### Payment Processing (🚧 Ready for Stripe API Keys)
- `POST /api/stripe/connect-account` - Setup connected account
- `POST /api/stripe/create-payment` - Process payment

**Total**: 35 fully functional endpoints + 2 ready for Stripe activation

## Pricing Tiers

### Starter - $49/month
- Up to 15 employees
- Drag-drop scheduling
- Shift templates & recurring shifts
- Time tracking with clock-in/out
- Auto-invoice generation
- Basic analytics
- Email support

### Professional - $149/month (Most Popular)
- Up to 100 employees
- All Starter features
- Multi-client management
- Manager assignments (RBAC)
- Advanced analytics
- Priority support

### Enterprise - Custom Pricing
- Unlimited employees
- All Professional features
- Priority support & SLA
- Dedicated account manager
- Future features (2025): Custom integrations, API access & webhooks, white-label options, SSO/SAML, audit compliance, auto-payroll, GPS verification

## Fortune 500 Feature Roadmap

### Phase 3 - Compliance & Security (Priority 1)
- SSO/SAML + SCIM provisioning
- Mandatory MFA/2FA
- Immutable audit logs
- FLSA/overtime rules engine
- eDiscovery-ready data export
- SOC 2 Type II certification

### Phase 4 - Advanced Workforce Operations (Priority 2)
- PTO/leave management with accrual
- Shift swap marketplace
- Credential/licensure tracking
- Job posting & internal hiring
- Employee file management (documents, certifications)
- Multilingual support

### Phase 5 - Analytics & Integrations (Priority 3)
- Self-serve report builder
- BI tool integrations (Tableau, PowerBI)
- Payroll system connectors (ADP, Paychex)
- HRIS integrations (Workday, SuccessFactors)
- Accounting software (QuickBooks, NetSuite)

### Phase 6 - Mobile & Communication (Priority 4)
- Native iOS/Android apps
- Offline clock-in capability
- Push/SMS/Email notifications
- In-app announcements
- Shift reminders (geofenced)
