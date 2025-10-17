# WorkforceOS

## Overview
WorkforceOS is an elite-grade operating system for comprehensive workforce management, designed to automate HR functions for businesses of all sizes. It offers features like time tracking, automated invoice generation, smart hiring, compliance audit trails, and real-time analytics. The platform aims to deliver significant annual cost savings by replacing multiple HR staff positions with a single, integrated automated system. Key capabilities include drag-and-drop scheduling, multi-tenant security, and robust role-based access control. The project vision includes offering branded features like BillOS™, PayrollOS™, ScheduleOS™, HireOS™, TrackOS™, ReportOS™, and AnalyticsOS™ to unify product identity and enhance market potential.

## User Preferences
I prefer detailed explanations.
Do not make changes to the folder `Z`.
Do not make changes to the file `Y`.

## Chat System Routes
### Desktop vs Mobile Chat Separation  
- **Desktop Chat (DC360)**: `/helpdesk-cab` or `/live-chat` - Full IRC/MSN-style interface with 3-column layout, right-click context menus, and rich command toolbar. Branded as **DC360**.
- **Mobile Chat (DC360.5)**: `/mobilechat` or `/mobile-chat` - Dedicated mobile-optimized route with touch-first UX, hamburger menu, and simplified controls. Branded as **DC360.5**.
- **Version Naming**: DC360 (desktop) and DC360.5 (mobile) clearly distinguish the platform versions, loading automatically based on how users access the site.
- **Route Distinction**: Both routes are clearly separated for analytics and version-specific features. DC360 is the primary desktop interface, DC360.5 is the mobile-optimized version.

## System Architecture
### UI/UX Decisions
The platform features a CAD-style professional interface with a dark mode theme, emphasizing precision and control. It includes an application frame (menu, toolbar, status bar) and real-time indicators. The design is modern, professional, and mobile-first, utilizing **corporate blue** gradient accents (navy blue #1e3a8a to deep slate) for Fortune-500 brand consistency. The official logo is a realistic neon-style **"W"** with glowing **"OS"** superscript - designed like a lit advertisement with multi-layer glows, 3D depth, and electric blue highlights. Logout functionality is accessible across all layouts.

### Technical Implementations
- **Frontend**: React, Vite, TypeScript, Wouter, TanStack Query, shadcn/ui, `react-hook-form`, `zod`.
- **Backend**: Express.js, TypeScript, with Zod for request body validation.
- **Database**: PostgreSQL with Drizzle ORM.
- **Authentication**: Custom session-based authentication with bcrypt, account locking, and password reset.
- **Multi-Tenancy**: Workspace-based data isolation enforced at API and database levels.
- **Role-Based Access Control (RBAC)**: Supports Owner, Manager, and Employee roles with hierarchical management and API protection middleware. Includes platform-level roles (root, deputy_admin, deputy_assistant, sysop, bot) for system administration and support operations.
    - **Granular Leader Capabilities**: Capability-based permissions for organization leaders (Owner/Manager) including: view_reports, manage_employees_basic (reset passwords, unlock accounts), manage_schedules (approve swaps, adjust time entries), escalate_support (create platform support tickets), view_audit_logs, and manage_security_flags.
    - **Leader Action Tracking**: Specialized audit logging for self-service admin actions with before/after snapshots, IP tracking, and optional approval workflows. All leader actions (password resets, account unlocks, contact updates, escalations) are logged to the leader_actions table with full compliance tracking.
    - **Escalation System**: Production-ready structured ticket system (ESC-XXXXXX format) for leaders to escalate issues to platform support. Features include:
        - **Race-Safe Ticket Generation**: Unique ticket numbers with retry logic on database constraint violations (max 10 attempts)
        - **State Transition Enforcement**: Strict workflow - open → [in_progress, resolved], in_progress → [resolved, open], resolved → [] (terminal)
        - **Mandatory Resolution**: Resolution field required when closing tickets for compliance documentation
        - **Category Classification**: Billing, compliance, technical, security, employee_issue, system_error, feature_request, other
        - **Priority Levels**: Low, normal, high, urgent with intelligent routing
        - **Platform Staff Authorization**: Only platform roles (root, deputy_admin, deputy_assistant, sysop) can update ticket status
        - **Comprehensive Audit Trail**: All status updates logged to leader_actions with before/after snapshots, IP tracking, user agent capture
        - **Workspace Isolation**: All queries enforce workspace boundaries for multi-tenant security
        - **API Endpoints**: POST /api/leaders/escalate (create), GET /api/leaders/escalations (list), PATCH /api/leaders/escalations/:id/status (update - staff only)
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
    - **PayrollOS™ (99% Automation + 1% QC)**: Fully automated payroll processing with intelligent tax calculations, overtime logic, and payment distribution. Features include:
        - **Auto-Detection**: Automatic pay period detection (weekly, bi-weekly, monthly) based on workspace settings
        - **Tax Calculations**: Federal withholding (progressive brackets with correct annualization per pay period), State tax (5% flat), Social Security (6.2%), Medicare (1.45%)
        - **Overtime Logic**: Automatic 1.5x rate after 40 hours per period
        - **Data Integration**: Pulls time entries from TrackOS™, excludes billed entries
        - **QC Workflow**: 1% human quality control approval before processing
        - **Dashboard**: Owner/Manager interface for payroll run management, approval, and processing
        - **Employee Portal**: Self-service paycheck viewing with detailed tax breakdown and pay history
        - **Security**: RBAC protection - payroll creation/approval requires Owner role
    - **Live HelpDesk (SupportOS™)**: IRC/MSN-style instant chat with WebSocket messaging, ticket-based authentication for guests, real-time status indicators (open/closed/maintenance), staff toggle controls for room management, platform staff bypass for admin monitoring, audit logging, graceful degraded mode for reliability, **comprehensive slash command system** (/intro, /auth, /verify, /resetpass, /close, /help), **mobile-first support drawer** with interactive macro buttons and input prompts, chat notification sounds (send/receive/join/leave), and **realistic neon logo** (white WF with electric blue OS superscript) displayed before support staff messages.
        - **HelpOS™ AI Queue Management**: Smart support queue with priority-based positioning, automated announcements (queue position, wait times, reminders every 5 minutes), staff alerts, and intelligent prioritization based on wait time, subscription tier, ADA/special needs claims, and organization ownership status. Distinguishes between System announcements (IRC-style server messages) and HelpOS™ messages (AI bot).
        - **Mobile Support Staff Menu**: Hamburger-style mobile command center with 3 organized categories: (1) Support Queue - live user queue with priority ranking, wait times, quick actions; (2) Chat Commands - all slash commands with usage instructions; (3) System Dashboard - room status, staff controls, audit logging. Real-time queue updates every 5 seconds, badge notifications for waiting users.
        - **Post-Ticket Review System**: Complete feedback collection infrastructure with `/close` command triggering feedback requests, API endpoints for rating/feedback submission, admin review dashboard for closed tickets (quality assurance and training), and testimonial showcase for 4-5 star reviews with feedback (publicity and marketing). Backend fully implemented with database schema supporting rating (1-5 stars) and text feedback fields.
        - **Customer Access**: Submit contact form → Receive unique ticket number (TKT-XXXXXX) → Authenticate with ticket# + email → Access chat as guest
        - **Support Staff Access**: Two methods - (1) Login normally with platform credentials (bypasses all restrictions), or (2) Authenticate as guest using work ID + email
        - **Guest Sessions**: Temporary user accounts created on-the-fly for ticket holders, tied to platform-external workspace
        - **Security**: Email validation against ticket owner, rate limiting, session management
        - **Future Scalability Idea**: International Work ID structure for global expansion - `Firstname-##-###-##-####` format where first 2 digits = country code, next 3 digits = state (even=USA, odd=foreign), last 4 = SSN/DL last 4. Organization ID shared across staff (e.g., "DC360Root"). This enables regional tracking, compliance, and human-readable yet structured identification for worldwide operations.
        - **Smart Context Menu Actions**: Right-click users (desktop) or tap users (mobile) to access targeted support actions - all actions automatically apply to selected user without typing usernames. Includes "Release Hold & Welcome" (removes spectator mode + personalized greeting), secure information requests, user transfers, and issue resolution.
        - **Mobile User Actions Sheet**: Touch-optimized slide-up drawer with same powerful features as desktop context menu - tap any user to access support actions, secure requests, transfers, and resolution options. Full feature parity with desktop experience.
        - **Secure Request Dialog System**: Professional modal dialogs for sensitive information collection with 5 request types: Authentication (email/account ID), Document Upload (PDF/DOC/images), Photo Upload (camera/gallery), E-Signature (legal name + agreement), and Info Request (open response). All submissions encrypted and sent via WebSocket to support staff. WorkforceOS blue branding with security indicators.
- **Admin Dashboards**: Usage, Support, and Command Center for platform monitoring and customer management.
- **Portals**: Employee, Auditor/Bookkeeper, and Client/Subscriber portals.
- **Billing & Monetization**: Transaction-based platform fee (3-10%) via Stripe Connect. Tier-based pricing (Professional, Enterprise, Elite) with feature flags. AI features follow a subscriber-pays-all model.
- **Support & Communication**: Live HelpDesk chatroom with instant WebSocket messaging (IRC/MSN style), ticket verification system, staff controls for room status management, and email notifications via Resend.
- **Security & Reliability**: Enterprise audit logging, IP-based rate limiting, global React error boundary, health monitoring, platform RBAC, workspace isolation, and field whitelisting.

## External Dependencies
- **Database**: Neon (PostgreSQL)
- **ORM**: Drizzle ORM
- **Payment Processing**: Stripe Connect
- **Email**: Resend
- **AI**: OpenAI GPT-4