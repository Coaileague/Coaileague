# WorkforceOS

## Overview
WorkforceOS is a comprehensive workforce management operating system designed to automate HR functions for businesses. It offers features such as time tracking, automated invoice generation, smart hiring, compliance audit trails, and real-time analytics. The platform aims to provide significant cost savings by integrating various HR functions into a single system, envisioning branded features like BillOS™, PayrollOS™, ScheduleOS™, HireOS™, TrackOS™, ReportOS™, and AnalyticsOS™ for a unified product identity. The project also focuses on monopolistic features to provide complete employee lifecycle management, granular role-based access control, and platform-level troubleshooting, justifying a premium pricing model.

## Recent Changes (October 21, 2025)
### Critical UX Improvements - User Navigation & Accessibility

**User Requirement**: Users must NEVER be stuck - always have visible exit/navigation options and working accept/decline forms.

**Improvements Made**:
1. ✅ **Chat Agreement Modal** (`chat-agreement-modal.tsx`) - Added "Decline & Exit" button for users who don't want to accept terms
   - Previously only had "I Agree" button, trapping users if they didn't want to proceed
   - Now includes both "Decline & Exit" and "I Agree - Enter Chat" buttons
   - Decline button uses `window.history.back()` to navigate away from blocking state
   - Used in: HelpDeskCab, modern-mobile-chat
2. ✅ **Terms Dialog** (`terms-dialog.tsx`) - Already has "Decline & Exit" and "Accept & Continue" buttons
3. ✅ **Onboarding Wizard** - Uses shadcn Dialog component with X close button in top-right corner
4. ✅ **Signature Step** - Has "Cancel" button when signing individual documents in onboarding flow
5. ✅ **Mobile Navigation** - AppSidebar accessible via hamburger menu (SidebarTrigger) includes:
   - Logout button (`data-testid="button-logout"`)
   - Home/Dashboard navigation
   - All OS Family navigation items
   - Works on both mobile and desktop

**Architecture Decision**: All acceptance forms (terms, agreements, contracts) now have BOTH accept and decline options to prevent users from getting stuck in mandatory flows.

## Recent Changes (October 20, 2025)
### Major Feature Completions - 6 New OS Modules

Successfully implemented 6 complete OS modules with full UI/UX and backend integration:

**1. CommunicationOS™** (`/communication`) - Organization-specific chatrooms with real-time messaging, room creation, member management, and access control. Backend: `/api/communication/*`

**2. QueryOS™** (`/query-os`) - Platform staff diagnostics panel with user search, account management (unlock/reset), impersonation controls, session viewer, and audit logs. Admin-only with RBAC enforcement.

**3. Private Messaging System** (`/messages`) - Direct messaging with purple "whispered" badges, encrypted indicators, conversation list, real-time updates, and staff support channels. Backend: `/api/messages/*`

**4. TrainingOS™** (`/training`) - Learning management system with course catalog, enrollment tracking, progress monitoring, certification downloads, and admin course creation. Backend: `/api/training/courses|enrollments|certifications`

**5. BudgetOS™** (`/budget`) - Budget planning with departmental budgets, variance analysis, utilization tracking, status indicators, forecast dashboard (placeholder), and approval workflows. **Note**: UI-only with mock data (no persistence).

**6. IntegrationOS™** (`/integrations`) - External service ecosystem with integration marketplace (QuickBooks, Salesforce, Slack), connection management, API key administration, and webhook configuration. Backend: `/api/integrations/*` with OAuth2/API key auth support.

### Previous Changes (October 19, 2025)
#### Fortune 500-Style Homepage Redesign
- **Complete homepage redesign** for professional enterprise marketing
- **Key Features**:
  - Hero section with Fortune 500 trust badges (SOC 2, GDPR, ISO 27001)
  - Clear CTAs for "Start Free Trial" and "Login" prominently displayed
  - 8 OS modules showcased (ScheduleOS™, TimeOS™, PayrollOS™, BillOS™, HireOS™, ReportOS™, AnalyticsOS™, SupportOS™)
  - ROI calculator showing $255k annual savings by replacing 5 full-time positions
  - Pricing preview section with Starter ($1,499/mo), Professional ($2,999/mo), and Enterprise (custom) tiers
  - Social proof section with Fortune 500 status
  - Mobile-first responsive design with proper color scheme throughout
- **Auto-redirect removed**: Users can now view the homepage instead of being automatically redirected to mobile chat
- **Navigation**: Sticky header with clear paths to pricing, features, contact, login, and registration

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

**Mobile-First Optimization** (Production-Ready - See MOBILE_FIRST_DOCUMENTATION.md):
WorkforceOS follows a **strict mobile-first philosophy**, optimized primarily for 360px-420px screens before scaling to desktop.

- **Viewport Configuration**: Perfect meta tags with `viewport-fit=cover` for safe area support, PWA-ready
- **Touch Targets**: All interactive controls meet Apple/Google's 44px minimum via `touch-target` class or Shadcn defaults
- **Collapsible Navigation**: `SidebarTrigger` hamburger menu with `defaultOpen={false}` on mobile (< 768px)
- **Responsive Dialogs**: Full-screen on mobile (`w-full h-full`), standard modal on desktop (`sm:h-auto sm:w-auto`)
- **Fluid Layouts**: 100% percentage-based grids, zero horizontal scrolling at any viewport
- **Safe Area Support**: `safe-top` and `safe-bottom` classes clear device notches/home indicators
- **Responsive Grids**: `grid-cols-2 md:grid-cols-4` pattern for optimal mobile/tablet/desktop layouts
- **Text Scaling**: Mobile-first typography (`text-xs sm:text-sm`, `text-xl sm:text-2xl md:text-3xl`)
- **Loading States**: Branded `MobileLoading` component with animated WorkforceOS logo
- **Touch Gestures**: Swipe navigation on ScheduleOS via `use-touch-swipe` hook
- **Touch Optimizations**: Smooth scrolling, momentum, tap highlight removal, font smoothing
- **Mobile Animations**: `mobile-card-enter`, `hover-elevate`, `active-elevate-2` transitions
- **Optimized Pages**: Disputes, Reports, Engagement Dashboard, ScheduleOS fully mobile-responsive
- **Media Queries**: Mobile-first breakpoints at 640px (sm), 768px (md), 1024px (lg)
- **Tested Viewports**: 360px, 375px, 390px, 414px, 420px, 768px, 1024px

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