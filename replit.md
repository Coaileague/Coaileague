# WorkforceOS

## Overview
WorkforceOS is a comprehensive workforce management operating system designed to automate HR functions for businesses. It offers features such as time tracking, automated invoice generation, smart hiring, compliance audit trails, and real-time analytics. The platform aims to provide significant cost savings by integrating various HR functions into a single system, envisioning branded features for a unified product identity. The project also focuses on monopolistic features to provide complete employee lifecycle management, granular role-based access control, and platform-level troubleshooting, justifying a premium pricing model.

## Recent Changes

### November 4, 2025 - Platform-Wide Fixes Complete

**Critical Settings Page Bug Fixed:**
- ✅ **Root Cause**: Workspace endpoints used OAuth middleware (`isAuthenticated`) but root admins use session-based auth
- ✅ **Solution**: Changed `/api/workspace` routes to use `requireAuth` (session-based) instead of `isAuthenticated` (OAuth)
- ✅ **Field Mapping Fixed**: Added proper mapping between frontend field names (phone, website) and backend schema (companyPhone, companyWebsite)
- ✅ **New Fields Supported**: Now allows updating companyName, taxId, and address fields
- ✅ **Impact**: ALL users (including root admins and regular workspace owners) can now update organization settings

**UI Enhancement:**
- ✅ **All scrollbars hidden**: Global CSS fix removes scrollbars across entire app while maintaining scroll functionality

### November 4, 2025 - Sales MVP Launch Ready
**Sales & Procurement System (DealOS™ + BidOS™) - Production Ready:**
- ✅ **Database Schema**: 7 tables created (deals, rfps, proposals, contacts, email_sequences, sequence_sends, deal_tasks) with proper multi-tenant workspace isolation
- ✅ **Sales Dashboard UI**: Unified command center at `/sales` showing pipeline value, active RFPs, hot leads with tabbed views (Pipeline, RFPs, Leads)
- ✅ **Secure Backend API**: Manager-level RBAC enforcement on all POST routes, Zod validation on request bodies, workspace isolation on all queries
- ✅ **Navigation Integration**: "DealOS™ Sales" added to Growth Family in sidebar with Target icon
- ✅ **Security Hardening**: Fixed critical vulnerability - only managers/owners can create/modify sales data, regular employees can view only

**ScheduleOS™ Critical UX Fix:**
- ✅ **Interactive Grid**: Now ALWAYS shows clickable time slots (employee columns × time rows) even with zero employees/shifts - matching Sling UX
- ✅ **Empty State**: Added placeholder employee column with "Add Employee" button and clickable empty cells with "+ Add Shift" hover hints
- ✅ **Maintained Functionality**: Drag-and-drop, shift creation, and all existing features still work perfectly

**Architecture Review:** All changes architect-approved with no critical security, reliability, or quality issues. System ready for immediate sales operations.

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
The platform features a CAD-style professional interface with a dark mode theme, emphasizing precision. It includes an application frame with a menu, toolbar, and status bar. The design is modern, professional, mobile-first, and utilizes corporate blue gradient accents. The official logo is a realistic neon-style "W" with glowing "OS" superscript. A universal transition system provides smooth visual feedback. Key UI components include tab-based navigation, collapsible sections, and mobile-optimized design elements. All acceptance forms have both accept and decline options.

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
    - **Scheduling**: ScheduleOS™ grid with drag-and-drop functionality for efficient workforce scheduling, supporting draft, published, and open shifts.
    - **Platform Administration**: ROOT Admin Dashboard for comprehensive user and platform role management, restricted by RBAC.

## External Dependencies
- **Database**: Neon (PostgreSQL)
- **ORM**: Drizzle ORM
- **Payment Processing**: Stripe Connect
- **Email**: Resend
- **AI**: OpenAI GPT-4 (specifically `gpt-4o-mini` for cost efficiency in HelpOS™ and other smart features)