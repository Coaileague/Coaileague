# AutoForce™

## Overview
AutoForce™ (Autonomous Workforce Management Solutions) is a comprehensive operating system designed to automate HR functions for businesses. It offers features such as time tracking, automated invoice generation, smart hiring, compliance audit trails, and real-time analytics. The platform aims to provide significant cost savings by integrating various HR functions into a single system, providing complete employee lifecycle management, granular role-based access control, and platform-level troubleshooting.

## User Preferences
I prefer detailed explanations.
Do not make changes to the folder `Z`.
Do not make changes to the file `Y`.
All branding must be 100% AutoForce™ (not WorkforceOS).

## System Architecture
AutoForce™ features a modular "OS" design (e.g., BillOS™, PayrollOS™, TrackOS™, TrainingOS™, HelpOS™), emphasizing extension over rebuilding, clean code, and a single source of truth for each feature domain. The revenue model combines subscription fees with usage-based AI pricing.

**UI/UX Decisions:** The platform features a Fortune 500-caliber professional interface with Deep Charcoal (#1F2937), Platinum neutrals, and Crimson (#DC2626) accents. The animated logo features a geometric "A" with orbiting workforce network nodes, representing autonomous team management. Logos are 50% larger for better visibility. It prioritizes mobile-first design with responsive layouts, accessible touch targets, and optimized navigation patterns, including tab-based navigation, collapsible sections, and a Sling-style mobile dashboard.

**Technical Implementations:**
- **Frontend**: React, Vite, TypeScript, Wouter, TanStack Query, shadcn/ui, `react-hook-form`, `zod`.
- **Backend**: Express.js, TypeScript, with Zod for validation.
- **Database**: PostgreSQL with Drizzle ORM.
- **Authentication**: Custom session-based authentication with bcrypt, account locking, and password reset. Supports both Replit Auth (OIDC) and Custom Auth.
- **Multi-Tenancy**: Workspace-based data isolation.
- **Role-Based Access Control (RBAC)**: Supports hierarchical roles and API protection (`requireManager`, `requireOwner`).
- **IRC-Style Command/Response Architecture**: WebSocket commands with server-side validation and permission checks.
- **AuditOS™**: Comprehensive audit logging.
- **Key Feature Areas**:
    - **Client Management, Billing & Payroll (BillOS™, PayrollOS™)**: Automated invoice generation, payment processing (Stripe), time tracking, payroll calculation.
    - **Employee Lifecycle Management**: 
      - Onboarding (payroll info, documents, certifications, availability)
      - Contract management (I9, W9, W4) with e-signature workflow
      - Shift management with approval workflows (accept/deny/switch requests)
      - Timesheet edit requests with manager approval
      - Time-off requests with manager approval
    - **Manager Approval Dashboards**:
      - Shift action approvals (accept/deny/switch with notes)
      - Timesheet edit approvals (clock in/out changes with before/after comparison)
      - Time-off approvals (vacation/sick/personal/unpaid with duration calculation)
    - **ExpenseOS™ - Expense Reimbursement (Implementation Status: 100% COMPLETE)**:
      - ✅ Schema: Complete (expenses, expenseCategories, expenseReceipts tables)
      - ✅ API: Complete (submit, approve, reject, mark-paid, receipt upload endpoints)
      - ✅ Employee submission UI: Expense form with mileage calculator and file upload
      - ✅ Manager approval dashboard: Review, view receipts, approve/deny with notes
      - ✅ Receipt upload: Multi-file upload with object storage integration
      - ✅ Receipt display: Download/view receipts in approval dialog
      - Features: Category tracking, mileage IRS rate calculation, multi-receipt support, approval workflow
    - **I-9 Re-verification (Implementation Status: 100% COMPLETE)**:
      - ✅ Schema: Complete (employeeI9Records table with expiration tracking)
      - ✅ Storage methods: getI9RecordsByWorkspace, getI9RecordByEmployee, getExpiringI9Authorizations
      - ✅ API routes: GET /api/i9-records, GET /api/i9-records/expiring, GET /api/i9-records/:employeeId
      - ✅ I-9 compliance dashboard UI: Expiring authorization alerts (30/7 day warnings), compliance tracking
      - Features: Work authorization tracking, expiration alerts (30/7 days), re-verification workflow, document type tracking
    - **PolicIOS™ - Policy Management (Implementation Status: 100% COMPLETE)**:
      - ✅ Schema: Complete (companyPolicies, policyAcknowledgments tables)
      - ✅ Storage methods: createCompanyPolicy, getCompanyPolicies, publishPolicy, createPolicyAcknowledgment
      - ✅ API routes: POST /api/policies, GET /api/policies, PATCH /api/policies/:id/publish, POST /api/policies/:id/acknowledge
      - ✅ Policy management UI: Create/publish policies, version control, acknowledgment tracking
      - Features: Handbook version control, e-signature acknowledgment, compliance tracking, draft/published workflow
    - **AssetOS™ (EXISTING - Verified)**:
      - Vehicle and equipment tracking
      - Billing rates and maintenance schedules
      - Asset assignment and availability tracking
    - **AI Features (RecordOS™, InsightOS™)**: Natural language search, autonomous AI analytics with insights for cost savings, productivity, anomalies, and predictions.
    - **Learning & Development (TrainingOS™)**
    - **Financial Planning (BudgetOS™)**
    - **Employee Engagement (EngagementOS™)**
    - **HR Automation**
    - **Integrations (IntegrationOS™)**
    - **Sales Operations (DealOS™ + BidOS™)**
    - **Scheduling (ScheduleOS™)**: Drag-and-drop, shift acknowledgment.
    - **Platform Administration**: ROOT Admin Dashboard, organization onboarding.
- **Security Hardening**: Stripe webhook signature validation, payroll data protection, strict Zod validation, workspace scoping, and audit trails.

## External Dependencies
- **Database**: Neon (PostgreSQL)
- **ORM**: Drizzle ORM
- **Payment Processing**: Stripe Connect
- **Email**: Resend
- **AI**: OpenAI GPT-4 (`gpt-4o-mini`)