# AutoForce™

## Overview
AutoForce™ (Autonomous Workforce Management Solutions) is a comprehensive workforce management platform designed for emergency services and other service-related industries. Its primary purpose is to streamline operations and reduce administrative burden through features like time tracking, automated invoice generation, smart hiring, compliance audit trails, and real-time analytics. The platform embodies an "OS" design philosophy, focusing on extensibility and acting as a single source of truth for workforce management. AutoForce™ aims to revolutionize the industry with a revenue model based on subscription fees combined with usage-based AI pricing.

## User Preferences
I prefer detailed explanations.
Do not make changes to the folder `Z`.
Do not make changes to the file `Y`.
All branding must be 100% AutoForce™ (not WorkforceOS).
FTC COMPLIANCE: All marketing claims must be factual and verifiable. Avoid monopolistic language.

## Recent Changes (Nov 6, 2025)
### Header Redesign - Compact, Clean, and Personalized UI ✅
**Streamlined Platform Headers** with reduced padding, personalized greetings, and responsive design:
- **Problem**: Headers were too thick with excessive padding (p-6 sm:p-8), displayed impersonal timer/clock, and theme toggle overlapped with other controls on smaller screens
- **Solution**: Reduced padding, replaced timer with personalized greeting, added notifications dropdown, and implemented responsive button hiding to prevent overlap
- **Header Changes**:
  - **Padding Reduction**: Changed from `p-6 sm:p-8` to `p-3 sm:p-4` across admin-command-center.tsx and root-admin-dashboard.tsx for thinner, cleaner appearance
  - **Timer Removal**: Removed real-time clock/timer display and related state management from all admin dashboards
  - **Personalized Greeting**: Created TimeGreeting component displaying "Good morning/afternoon/evening" with user's name and role
  - **Logo Consistency**: Using AutoForceLogo with icon variant (white figure with AI branches) across all admin pages
- **Notifications Integration**:
  - **Desktop Dropdown**: Added Bell icon button with badge showing task counts in admin dashboard headers
  - **Conditional Rendering**: Shows task list or "No new tasks" message
  - **Safe Zero-Count Handling**: Menu opens successfully even with zero pending tasks
- **Responsive Header** (`client/src/App.tsx`):
  - **Flex-wrap Layout**: Prevents button overflow on smaller screens
  - **Progressive Hiding**: Low-priority controls hide on smaller breakpoints to prevent overlap
    - Hidden on lg: Status Indicators, Feedback Widget
    - Hidden on md: Plan Badge, Help Dropdown
    - Hidden on sm: What's New Badge, Tutorial Button
    - Always visible: Search, Notifications, Theme Toggle
  - **Fixed Button Sizing**: All icon buttons constrained to h-9 w-9 with shrink-0 to prevent squishing
- **TimeGreeting Component** (`client/src/components/time-greeting.tsx`):
  - **Time-based Salutation**: "Good morning" (5am-12pm), "Good afternoon" (12pm-5pm), "Good evening" (5pm-5am)
  - **User Context**: Displays first name and role/title if available
  - **Auto-update**: Updates every minute via setInterval
  - **Data-testid**: "text-time-greeting" for e2e testing
- **Testing**: E2e tests verified compact headers, personalized greetings, notifications dropdown, and responsive layout on both desktop (1200px) and mobile (375px) viewports
- **Production Status**: Architect-approved, all changes tested with no functional regressions

### ScheduleOS™ - Complete SmartSchedule AI Features ✅
**Implemented ALL Missing Features** for AI-powered scheduling system with usage-based billing:
- **Problem**: SmartSchedule AI features were referenced in UI but backend APIs were missing; no AI toggle, generate schedule, request service coverage, or publish schedule functionality
- **Solution**: Implemented complete AI system with 5 new backend endpoints, 2 database tables, AI billing integration, and full UI controls
- **New Backend APIs** (`server/routes.ts`):
  - **AI Toggle**: `POST /api/scheduleos/ai/toggle` with body `{enabled, workspaceId}` - managers/admins only
  - **AI Status**: `GET /api/scheduleos/ai/status?workspaceId=<id>` returns `{enabled, workspaceId, workspaceName}`
  - **Generate Schedule**: `POST /api/scheduleos/generate-schedule` with AI billing tracking via `workspaceAiUsage` table
  - **Request Service**: `POST /api/scheduleos/request-service` for on-demand staffing with AI employee matching
  - **Publish Schedule**: `POST /api/schedules/publish` makes schedules live for all employees with real-time notifications
- **New Database Tables** (`shared/schema.ts`):
  - **serviceCoverageRequests**: Tracks on-demand staffing requests with AI suggestions, job site locations, skill requirements, status workflow ('pending' → 'processing' → 'matched' → 'assigned')
  - **publishedSchedules**: Version control for schedule publications with employee counts, shift tracking, notification status
- **AI Billing Integration**:
  - **300% Markup Model**: OpenAI cost × 4 = client charge (tracks provider cost, markup %, final charge)
  - **Token Tracking**: Estimates 2000 base tokens + 50 per shift for generate, 1500 + 40 per shift for coverage
  - **Billing Period**: Monthly billing cycle (YYYY-MM format) with status tracking (pending → invoiced → paid)
  - **Invoice Integration**: `aiUsageLogId` links to invoices for consolidated billing
- **Frontend UI** (`client/src/pages/schedule-smart.tsx`):
  - **AI Toggle Switch**: Workspace-scoped enable/disable with real-time status indicator (Bot icon changes color)
  - **Generate Schedule Button**: Primary button (only visible when AI enabled) with Sparkles icon
  - **Request Service Button**: Outline button for coverage requests (only visible when AI enabled) with Send icon
  - **Publish Schedule Button**: Green button with CloudUpload icon for making schedules live
  - **Responsive Design**: All buttons mobile-optimized with touch-friendly min-h-9, whitespace-nowrap, flex-shrink-0
- **AI Engine** (`server/ai/scheduleos.ts`):
  - Already comprehensive with TalentOS™, ClockOS™, geo-compliance integration
  - Calculates reliability scores, risk scores, distance from home, availability matching
  - Penalty queue system for shift denials (recent denials → back of queue)
  - Auto-replacement logic for denied shifts
- **Security**:
  - All endpoints require `isAuthenticated` and `requireManager` middleware
  - Workspace scoping prevents cross-workspace data access
  - AI state stored in-memory Map per workspace ID
- **Workflow**:
  1. Manager toggles AI on → AI status stored per workspace
  2. Generate Schedule → AI analyzes employee pool → Creates shifts → Tracks billing
  3. Request Service → AI finds best matches → Assigns based on skills/location/availability
  4. Publish Schedule → Shifts go from 'draft' to 'scheduled' → Employees notified via WebSocket
- **Production Status**: All features implemented, backend APIs functional, UI complete, schema migrated

### HelpOS Cost Optimization & Branding Cleanup ✅
**Optimized AI Costs and Removed External Branding** for HelpOS support bot:
- **Problem**: HelpOS was using expensive AI model (gpt-5-nano) for basic support tasks; external platform branding (Replit) appeared in login page and code comments
- **Solution**: Switched to cheaper AI model and removed all external branding references
- **AI Model Changes** (`server/helpos-ai.ts`):
  - **Cost Savings**: Changed from `gpt-5-nano` to `gpt-3.5-turbo` (~10x cheaper)
  - **Model Options**: Now supports `'gpt-3.5-turbo' | 'gpt-4o-mini'` for basic chat support
  - **Rationale**: HelpOS is just a support bot, not for deep technical work or coding
  - **Branding**: Updated AI prompt from "WorkforceOS" to "AutoForce™"
  - **Token Limits**: Maintained 500 max tokens for concise, cost-effective responses
- **Navigation Cleanup** (`client/src/components/app-sidebar.tsx`):
  - **Removed**: "Mobile Chat" option from sidebar (redundant with CommOS™)
  - **Simplified**: Communication section now has 3 focused items instead of 4
- **Branding Removal**:
  - **Login Page**: Removed "Login with Replit" button from `client/src/pages/login.tsx`
  - **Code Comments**: Removed blueprint reference comments from `client/src/App.tsx` and `client/src/lib/authUtils.ts`
  - **AI Prompts**: Removed external service mentions from `server/helpos-ai.ts`
- **Production Status**: Architect-approved, all changes tested with no functional regressions

### SupportOS/HelpDesk - Complete Queue & AI Management System ✅
**Added Missing API Endpoints and Staff Controls** for HelpOS queue and AI management:
- **Problem**: HelpDesk UI referenced `/api/helpdesk/queue` and AI toggle APIs that didn't exist, causing crashes and broken features
- **Solution**: Implemented complete queue API, AI toggle endpoints with workspace scoping, and integrated UI controls
- **Backend Changes** (`server/routes.ts`):
  - **Queue API**: `GET /api/helpdesk/queue` returns array of queue entries with `{id, userId, userName, position, estimatedWaitMinutes, priority, userType, waitTimeMinutes}`
  - **AI Toggle**: `POST /api/helpdesk/ai/toggle` with body `{enabled, workspaceId}` - platform staff only
  - **AI Status**: `GET /api/helpdesk/ai/status?workspaceId=<id>` returns `{enabled, workspaceId, workspaceName}`
  - **Security**: All endpoints require platform staff roles (root, deputy_admin, deputy_assistant, sysop)
  - **Workspace Scoping**: Each workspace maintains independent AI state with validation
- **Frontend Changes** (`client/src/pages/HelpDesk5.tsx`):
  - Added AI toggle Switch component in staff controls panel (data-testid="switch-ai-toggle")
  - Purple-styled card with real-time status display
  - Custom TanStack Query `queryFn` properly sends workspaceId as query parameter
  - Toast notifications confirm toggle success/failure
  - Proper state synchronization via `useEffect` and mutation invalidation
- **Bug Fixes**:
  - Queue API now returns array instead of statistics object, preventing TypeError in frontend
  - AI status query includes mandatory workspaceId parameter via custom queryFn
  - Proper error handling for missing workspace IDs
- **Production Status**: Architect-approved, all endpoints functional with proper workspace scoping and security

### Mobile Bottom Navigation Cleanup - Simplified Navigation ✅
**Streamlined Mobile Bottom Nav** removing redundant communication option:
- **Problem**: Mobile bottom nav had "Chat" option pointing to /messages, which was redundant since CommOS™ already handles all team chatrooms
- **Solution**: Removed Chat navigation item from mobile menu
- **Changes**:
  - Removed `{ icon: MessageSquare, label: "Chat", path: "/messages" }` from navItems array
  - Cleaned up unused icon imports (MessageSquare, Users, FileText, Settings)
  - Mobile nav now has 4 focused items instead of 5
- **New Mobile Navigation Items**:
  - Home (/) - Dashboard with notifications
  - Schedule (/schedule) - ScheduleOS™ shift calendar
  - Time (/time-tracking) - TrackOS™ time tracking
  - Analytics (/analytics) - InsightOS™ analytics dashboard
- **Rationale**: CommOS™ provides comprehensive team chatroom functionality, eliminating need for duplicate messaging path
- **Production Status**: Architect-approved, navigation functions correctly with active route highlighting

## System Architecture
AutoForce™ is built upon a modular "OS" design philosophy (e.g., BillOS™, PayrollOS™, TrackOS™) to ensure clean code and extensibility.

**UI/UX Decisions:** The platform features a professional aesthetic with Deep Charcoal, Platinum neutrals, and Emergency Green accents. It prioritizes a mobile-first approach, offering responsive layouts and accessible touch targets. The branding includes an "AF" lightning bolt logo within a circular green gradient badge, symbolizing rapid response and reliability.

**Technical Implementations:**
- **Frontend**: React, Vite, TypeScript, Wouter, TanStack Query, shadcn/ui, `react-hook-form`, `zod`.
- **Backend**: Express.js, TypeScript, with Zod for validation.
- **Database**: PostgreSQL with Drizzle ORM.
- **Authentication**: Custom session-based authentication supporting Replit Auth (OIDC) and Custom Auth, featuring bcrypt, account locking, and password reset.
- **Multi-Tenancy**: Data isolation is managed on a workspace basis.
- **Role-Based Access Control (RBAC)**: Implements hierarchical roles and API protection.
- **Communication**: Utilizes an IRC-style WebSocket command/response architecture for real-time interactions, including server-side validation and permissions.
- **Audit Logging**: Comprehensive audit trails provided by AuditOS™.
- **Core Feature Areas**:
    - **Financials**: Client Management, Billing & Payroll (BillOS™, PayrollOS™), automated invoice generation, payment processing.
    - **Employee Lifecycle**: Onboarding, contract management (I9, W9, W4) with e-signature, shift management with approval workflows, timesheet and time-off requests.
    - **Compliance & Policy**: I-9 re-verification tracking, Policy Management (PolicIOS™) with version control and e-signature acknowledgments.
    - **Communication**: Team Communication (CommOS™) with multi-room chat, and Private Messages with AES-256-GCM server-side encryption and an audit access system.
    - **Expense Management**: ExpenseOS™ for reimbursement, tracking, mileage calculation, and approval workflows.
    - **Scheduling**: ScheduleOS™ with mobile-optimized shift calendars and shift action menus.
    - **Asset Management**: AssetOS™ for tracking vehicles and equipment.
    - **AI & Analytics**: RecordOS™ and InsightOS™ for natural language search, autonomous analytics, and predictive insights.
    - **Platform Administration**: ROOT Admin Dashboard, organization onboarding.
- **Security**: Features Stripe webhook signature validation, payroll data protection, strict Zod validation, workspace scoping, and audit trails.

## External Dependencies
- **Database**: Neon (PostgreSQL)
- **ORM**: Drizzle ORM
- **Payment Processing**: Stripe Connect
- **Email**: Resend
- **AI**: OpenAI GPT-3.5-turbo for HelpOS support bot (cost-effective), GPT-4o-mini for advanced features