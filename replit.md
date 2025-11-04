# AutoForce™

## Overview
AutoForce™ (Autonomous Workforce Management Solutions) is a comprehensive workforce management operating system designed to automate HR functions for businesses. It offers features such as time tracking, automated invoice generation, smart hiring, compliance audit trails, and real-time analytics. The platform aims to provide significant cost savings by integrating various HR functions into a single system, providing complete employee lifecycle management, granular role-based access control, and platform-level troubleshooting.

## User Preferences
I prefer detailed explanations.
Do not make changes to the folder `Z`.
Do not make changes to the file `Y`.
All branding must be 100% AutoForce™ (not WorkforceOS).

## System Architecture
AutoForce™ features a modular "OS" design (e.g., BillOS™, PayrollOS™, TrackOS™, TrainingOS™, HelpOS™), emphasizing extension over rebuilding, clean code, and a single source of truth for each feature domain. The platform's revenue model combines subscription fees with usage-based AI pricing in a customer-pays model, ensuring transparent pricing as the platform scales.

**UI/UX Decisions:** The platform features a CAD-style professional interface with a dark mode theme, corporate blue gradient accents, and a neon-style "W" with glowing "OS" logo. It prioritizes mobile-first design with responsive layouts, accessible touch targets, and optimized navigation patterns. Specific UI components include tab-based navigation, collapsible sections, enhanced empty states, and a universal transition system. Navigation is designed to be intuitive, with clear back/home buttons and a Sling-style mobile dashboard layout for quick access. The sidebar is branded, scrollable, and features a clear typography hierarchy.

**Technical Implementations:**
- **Frontend**: React, Vite, TypeScript, Wouter, TanStack Query, shadcn/ui, `react-hook-form`, `zod`.
- **Backend**: Express.js, TypeScript, with Zod for validation.
- **Database**: PostgreSQL with Drizzle ORM.
- **Authentication**: Custom session-based authentication with bcrypt, account locking, and password reset (8+ characters, uppercase, lowercase, number, special character).
- **Multi-Tenancy**: Workspace-based data isolation.
- **Role-Based Access Control (RBAC)**: Supports hierarchical roles and API protection.
- **IRC-Style Command/Response Architecture**: WebSocket commands with server-side validation, permission checks, and broadcasting.
- **AuditOS™**: Comprehensive audit logging for compliance.
- **Key Feature Areas**: Client Management, Billing & Payroll (PayrollOS™, PTO), Time & Expense Tracking, Learning & Development (TrainingOS™), Financial Planning (BudgetOS™), Employee Engagement (EngagementOS™), HR Automation, Integrations (IntegrationOS™), Sales Operations (DealOS™ + BidOS™ with AI RFP summarization), Scheduling (ScheduleOS™ with drag-and-drop, shift acknowledgment), and Platform Administration (ROOT Admin Dashboard).

## External Dependencies
- **Database**: Neon (PostgreSQL)
- **ORM**: Drizzle ORM
- **Payment Processing**: Stripe Connect
- **Email**: Resend
- **AI**: OpenAI GPT-4 (`gpt-4o-mini`)