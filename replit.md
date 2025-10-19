# WorkforceOS

## Overview
WorkforceOS is a comprehensive workforce management operating system designed to automate HR functions for businesses. It offers features such as time tracking, automated invoice generation, smart hiring, compliance audit trails, and real-time analytics. The platform aims to provide significant cost savings by integrating various HR functions into a single system, envisioning branded features like BillOS™, PayrollOS™, ScheduleOS™, HireOS™, TrackOS™, ReportOS™, and AnalyticsOS™ for a unified product identity. The project also focuses on monopolistic features to provide complete employee lifecycle management, granular role-based access control, and platform-level troubleshooting, justifying a premium pricing model.

## User Preferences
I prefer detailed explanations.
Do not make changes to the folder `Z`.
Do not make changes to the file `Y`.

## System Architecture
### Organization Principles
- **Modular OS Design**: Features are organized into branded "OS" modules.
- **Extend, Don't Rebuild**: Emphasizes building on existing systems.
- **Clean Code**: Code is organized by category/version for independent upgrades.
- **Single Source of Truth**: Each feature domain has a single authoritative system.

### UI/UX Decisions
The platform features a CAD-style professional interface with a dark mode theme, emphasizing precision. It includes an application frame with a menu, toolbar, and status bar. The design is modern, professional, mobile-first, and utilizes corporate blue gradient accents. The official logo is a realistic neon-style "W" with glowing "OS" superscript. A universal transition system provides smooth visual feedback. Key UI components include tab-based navigation, collapsible sections, and mobile-optimized design elements like touch-optimized buttons and fluid layouts.

**Mobile-First Optimization** (Production-Ready):
- **Touch Targets**: All interactive controls meet 44px minimum height via `touch-target` class or default Shadcn Button sizing
- **Responsive Dialogs**: Full-screen mobile dialogs (`w-full h-full sm:h-auto sm:w-auto`) with inner scrollable wrapper (`h-full overflow-y-auto p-4 sm:p-0`)
- **Safe Area Support**: Pages implement `safe-top` and `safe-bottom` classes to clear device notches/home indicators
- **Responsive Grids**: Stats cards use `grid-cols-2 md:grid-cols-4` pattern for optimal mobile/desktop layouts
- **Text Scaling**: Typography scales via `text-xs sm:text-sm`, `text-xl sm:text-2xl md:text-3xl` for readability across devices
- **Loading States**: Branded `MobileLoading` component with animated WorkforceOS logo for all async operations
- **Touch Gestures**: Swipe navigation on ScheduleOS via `use-touch-swipe` hook for natural mobile interactions
- **Mobile Animations**: Custom CSS classes (`mobile-card-enter`, `hover-elevate`, `active-elevate-2`) provide smooth transitions
- **Optimized Pages**: Disputes, Reports, Engagement Dashboard, and ScheduleOS fully mobile-responsive

**Role Badge Display** (Desktop Chat Only):
- HARDCODED superscript role badges displayed inline like mathematical notation (text-[9px] with ml-1 spacing)
- Staff roles show bright indigo-500 superscript badges: (Admin), (Deputy), (Assistant), (Sysop)
- HelpOS bot shows bright amber-500 superscript badge: (Bot)
- Backend returns clean names only - frontend exclusively handles role badge rendering
- All system messages and bot messages parse role badges through `parseSystemMessage()` for consistent superscript display

### Technical Implementations
- **Frontend**: React, Vite, TypeScript, Wouter, TanStack Query, shadcn/ui, `react-hook-form`, `zod`.
- **Backend**: Express.js, TypeScript, with Zod for request body validation.
- **Database**: PostgreSQL with Drizzle ORM.
- **Authentication**: Custom session-based authentication with bcrypt, account locking, and password reset.
- **Multi-Tenancy**: Workspace-based data isolation.
- **Role-Based Access Control (RBAC)**: Supports Owner, Manager, Employee, Supervisor, HR Manager, and platform-level roles with hierarchical management and API protection.
- **IRC-Style Command/Response Architecture**: WebSocket commands use unique command IDs for request/response matching. Server validates all commands, checks permissions, executes actions, broadcasts to all clients, then sends acknowledgment to originating client with success/failure status.
- **AuditOS™**: Comprehensive audit logging system that tracks ALL actions (moderation, account management, data operations) with actor information, target tracking, command payloads, IP addresses, success/failure status, and immutable audit trails for compliance, transparency, and abuse detection.
- **Key Feature Areas**:
    - **Financial & Time Management**: Time Tracking, Automated Invoice Generation (BillOS™), PayrollOS™, and Analytics Dashboard.
    - **Workforce Planning**: Advanced Scheduling System (SmartScheduleOS™), Employee Onboarding (HireOS™), and TalentOS™.
    - **HR & Compliance**: Report Management System (ReportOS™), HR Management Suite, Custom Forms System, Real-Time Geo-Compliance & Audit Trail, and Employee Self-Service (ESS).
    - **Communication & Engagement**: Live HelpDesk (SupportOS™) with a modern mobile chat interface, and EngagementOS™ (Bidirectional Employee-Employer Intelligence) for pulse surveys, feedback, and recognition.
    - **AI & Analytics**: AI Sales CRM, PredictionOS™ (AI Workforce Analytics), and features within EngagementOS™ for turnover risk prediction and employer benchmarking.
    - **Intelligent Automation (NEW)**: 
        - **KnowledgeOS™**: AI-powered knowledge base retrieval using OpenAI GPT-4. Employees can ask questions about policies, procedures, and benefits via `/ask` chat command or dedicated UI. Supports public knowledge articles accessible to all users.
        - **Predictive Scheduling Alerts**: Detects over-allocation before it happens by analyzing upcoming schedules against available capacity. Generates alerts for managers with suggested actions.
        - **Automated Status Reports**: One-click weekly status report generation using AI to summarize time tracking data, task completions, and accomplishments.
    - **Asset Management**: AssetOS™ for physical resource allocation and billing.
    - **Platform & Security**: Admin Dashboards, various Portals (Employee, Auditor, Client), Billing & Monetization, Security & Reliability features (audit logging, rate limiting, error handling), and an Escalation System.
    - **Workflow Automation**: Custom Logic Workflow Builder.

## External Dependencies
- **Database**: Neon (PostgreSQL)
- **ORM**: Drizzle ORM
- **Payment Processing**: Stripe Connect
- **Email**: Resend
- **AI**: OpenAI GPT-4