# WorkforceOS

## Overview
WorkforceOS is a Fortune 500-grade operating system for comprehensive workforce management, designed to automate HR functions for businesses of all sizes. It offers features like time tracking, automated invoice generation, smart hiring, compliance audit trails, and real-time analytics. The platform aims to deliver significant annual cost savings by replacing multiple HR staff positions with a single, integrated automated system. Key capabilities include drag-and-drop scheduling, multi-tenant security, and robust role-based access control.

## User Preferences
I prefer detailed explanations.
Do not make changes to the folder `Z`.
Do not make changes to the file `Y`.

## System Architecture
### UI/UX Decisions
The platform features a CAD-style professional interface with a dark mode theme, emphasizing precision and control. It includes an application frame (menu, toolbar, status bar) and real-time indicators. The design is modern, professional, and mobile-first, utilizing indigo/purple gradient accents for brand consistency. Logout functionality is accessible across all layouts (sidebar, command palette, ModernLayout header).

### Technical Implementations
- **Frontend**: React, Vite, TypeScript, Wouter, TanStack Query, shadcn/ui. Form validation with `react-hook-form` and `zod`.
- **Backend**: Express.js, TypeScript, with Zod for request body validation.
- **Database**: PostgreSQL (Neon) with Drizzle ORM.
- **Authentication**: Custom session-based authentication with bcrypt password hashing, account locking, and password reset functionality (portable, no external dependencies).
- **Multi-Tenancy**: Workspace-based data isolation enforced at API and database levels.
- **Role-Based Access Control (RBAC)**: Supports Owner, Manager, and Employee roles with hierarchical management assignments and API route protection middleware.
- **Key Features**:
    - **Time Tracking**: Clock-in/out, real-time timers, automatic hourly rate and total amount calculation.
    - **Invoice Generation**: Automated generation from unbilled time entries, multi-client selection, tax/fee calculation, and status tracking.
    - **Analytics Dashboard**: Tracks revenue, hours worked, active users, and invoice statistics.
    - **Advanced Scheduling System**: Professional grid interface with drag-and-drop, real-time week statistics (hours, labor cost), bulk operations, shift conflict detection, and quick actions.
    - **Employee Onboarding**: Email invitation workflow, multi-step onboarding (personal info, tax, availability, documents, e-signature), legal compliance features, and automatic employee number generation.
    - **Report Management System (RMS)**: Template management, dynamic submissions, supervisor approval, mandatory photo requirements with timestamping for compliance reports, automated email delivery to clients with unique tracking IDs.
    - **Industry-Specific Business Categories**: Vertical SaaS approach providing tailored form templates based on selected business category (e.g., Security, Healthcare, Construction).
    - **Shift Orders/Post Orders**: Special instructions attached to shifts requiring employee acknowledgment.
- **Admin Dashboards**: Admin Usage, Support, and Command Center for platform monitoring, customer management, and system health.
- **Portals**: Employee, Auditor/Bookkeeper (read-only financial), and Client/Subscriber portals for self-service access.
- **Revenue Model**: Transaction-based platform fee (3-10%) on all processed transactions, utilizing Stripe Connect for automated payment splitting.
- **Security & Reliability**: Enterprise audit logging, IP-based rate limiting, global React error boundary, health monitoring endpoint, and comprehensive security documentation.

### Feature Specifications
- **Core**: Employee/client management, scheduling, multi-tenancy, responsive design, dark mode, 24-hour resetting demo system.
- **Advanced**: Time tracking, automated invoicing, analytics, RBAC, advanced scheduling, employee onboarding, RMS with photo requirements, industry-specific forms, shift orders.
- **HR Management Suite (Full Stack Complete)**:
    - **Employee Benefits**: Health insurance, 401(k), PTO accrual tracking, benefit enrollment management with full CRUD operations. Dashboard UI with enrollment tracking, cost analytics, and provider management.
    - **Performance Reviews**: Multi-dimensional ratings (communication, teamwork, quality, etc.), goal setting/tracking, salary adjustment recommendations, review type support (annual, probation, mid-year). Dashboard UI with star ratings visualization and salary recommendation tracking.
    - **PTO Management**: Vacation/sick leave requests with approval workflows, accrual tracking, manager approval/denial with reason tracking. Dashboard UI with request management, approval actions, and usage analytics.
    - **Employee Terminations**: Offboarding workflows with reason tracking (voluntary/involuntary), exit interview notes, asset recovery checklists, final pay tracking, status management (initiated/processing/completed). Dashboard UI with status workflow and exit documentation.
- **Billing & Monetization**:
    - **White-Label Upgrade System**: Tier-based pricing UI with feature comparison (Professional/Enterprise/Fortune 500), API endpoint for subscription tier upgrades, automatic UI refresh on tier changes.
    - **Transaction-Based Revenue**: Platform fee system (3-10%) with automated Stripe Connect payment splitting (ready for activation).
    - **Feature Flags**: Database-backed tier-based feature visibility system with LockedFeature component.
- **Support & Communication**:
    - **Live Chat System (REST API)**: Production-ready chat support with conversation management, message history, workspace isolation, status tracking (open/resolved/closed), priority levels, and CSAT ratings. Implements secure polling pattern for real-time-like experience. WebSocket disabled pending authentication implementation.
    - **MSN/IRC Style Helpdesk Chat**: Classic 3-column chat interface for support staff and admins. Features user list with role badges (admin/support/customer) and online status indicators, IRC-style message display with timestamps and color-coded usernames, conversation info panel, and retro dark theme aesthetic.
    - **Email Notifications**: Fully activated Resend integration with templates for HR workflows, shift assignments, invoicing, onboarding, and report delivery to clients.
- **Implemented but Requires Activation**: Stripe Connect payment processing.
- **Database Schema Ready (Needs UI)**: GPS clock-in, automated payroll processing.
- **Custom Forms System (Production Ready)**:
    - **Components Built**: E-signature component (checkbox + name input), document upload with validation, dynamic form renderer
    - **Database Schema**: customForms (organization-specific templates), customFormSubmissions (with e-signatures and documents)
    - **API Layer**: CRUD endpoints for forms and submissions with workspace isolation, platform role-based access control, Zod validation, and field whitelisting
    - **Admin Interface**: Form builder UI for creating organization-specific forms
    - **Security**: Platform staff role requirements, validated payloads, organizationId tampering prevention
    - **Status**: Ready for production use by platform administrators

### Monetization Strategy
The platform offers Professional, Enterprise, and Fortune 500 tiers with increasing features and cost savings. Additional offerings include a White-Label RMS capability for custom branding and a database-backed feature flag system for granular control over feature availability based on billing tiers.

## Security Hardening (Launch Ready - October 2025)
### Platform Role-Based Access Control (RBAC)
- **Implementation Complete**: All critical security vulnerabilities resolved and architect-approved for production launch
- **Platform Roles System**: Separate `platform_roles` table with revocation tracking (platform_admin, deputy_admin, deputy_assistant, sysop)
- **Middleware Protection**: `requirePlatformStaff` and `requirePlatformAdmin` middleware on ALL sensitive endpoints
- **Secured Endpoints** (21+ endpoints protected):
  - ALL `/api/admin/support/*` routes → requirePlatformStaff
  - ALL `/api/platform/*` routes → requirePlatformStaff or requirePlatformAdmin
  - Custom forms CRUD (POST/PATCH/DELETE) → requirePlatformStaff
  - Admin workspace updates → requirePlatformStaff (full control)

### Workspace Security
- **Dual Update System**: 
  - Regular users: PATCH `/api/workspace` (restricted to name, companyWebsite, companyPhone, logoUrl only)
  - Platform staff: PATCH `/api/admin/workspace/:workspaceId` (full organizational control)
- **Prevented Tampering**: Users cannot modify organizationId, subscriptionTier, platformFeePercentage, or billing settings

### Custom Forms Security
- **Platform Staff Only**: All CRUD operations require platform role verification
- **Zod Validation**: Request body validation with field whitelisting on all form endpoints
- **Submission Security**: Form submissions validate workspace access, verify form ownership, enforce workspace scoping
- **Data Integrity**: OrganizationId tampering prevention, validated payloads only

### Documentation Cleanup
- **Removed Competitive References**: Eliminated all competitor company mentions (e.g., "Sling-style" → "Professional grid interface")
- **Updated Status**: Custom Forms marked as "Production Ready" with complete security implementation

### Launch Status
- ✅ **ARCHITECT APPROVED**: All critical security fixes reviewed and approved for production
- ✅ **API Security**: Platform role guards on all admin/platform endpoints
- ✅ **Data Protection**: Workspace isolation, field whitelisting, tampering prevention
- ✅ **RBAC Complete**: Platform staff vs regular user access properly segregated
- ⏳ **Pending**: Stripe test keys for final E2E validation (user will provide before marketing launch)

## External Dependencies
- **Database**: Neon (PostgreSQL)
- **ORM**: Drizzle ORM
- **Payment Processing**: Stripe Connect (ready for activation - requires test keys for final validation)
- **Email**: Resend (for notifications and password reset)