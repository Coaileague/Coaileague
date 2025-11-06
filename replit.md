# AutoForce™

## Overview
AutoForce™ (Autonomous Workforce Management Solutions) is a comprehensive workforce management platform for emergency services and service-related industries. It streamlines operations and reduces administrative burden by offering time tracking, automated invoice generation, smart hiring, compliance audit trails, and real-time analytics. The platform aims to revolutionize workforce management with an "OS" design philosophy, emphasizing extensibility and a single source of truth, supported by a revenue model combining subscription fees with usage-based AI pricing.

## User Preferences
I prefer detailed explanations.
Do not make changes to the folder `Z`.
Do not make changes to the file `Y`.
All branding must be 100% AutoForce™ (not WorkforceOS).
FTC COMPLIANCE: All marketing claims must be factual and verifiable. Avoid monopolistic language.

## Recent Changes (Nov 6, 2025)
### Real-Time User Notification System - Instant Alerts & Updates ✅
**Production-Ready Notification System** with instant user-specific delivery:
- **Backend Infrastructure**:
  - Notifications table in database schema with user/workspace scoping
  - WebSocket broadcast infrastructure via `/ws/chat` endpoint with `join_notifications` message type
  - Broadcast events: `notification_new`, `notification_read`, `notification_count_updated`
  - Notification helper functions for all event types (shift assignment, PTO approval, profile updates, document changes, etc.)
  - Real API endpoints: `GET /api/notifications`, `PATCH /api/notifications/:id/read`, `POST /api/notifications/mark-all-read`
  - Workspace membership validation before WebSocket subscription
- **Frontend Real-Time Updates**:
  - `useNotificationWebSocket` hook with exponential backoff reconnection (mirrors shift WebSocket pattern)
  - Real-time unread count tracking displayed in NotificationsCenter badge
  - Automatic cache invalidation via TanStack Query on all notification events
  - Color-coded toast notifications (info variant) for new notifications
  - Connection rate limiting to prevent excessive reconnects
- **Security & Isolation**:
  - User-specific notification delivery (only affected users see notifications)
  - Workspace-scoped data isolation
  - Full audit logging for every notification created (AuditOS™ integration)
- **Notification Event Types**:
  - Shift assigned/changed/removed
  - PTO approved/denied
  - Profile updated
  - Document/form assigned
  - Policy acknowledgment required
  - System announcements
- **User Experience**:
  - Live badge updates without page refresh
  - Toast notifications appear instantly when data changes
  - Mark as read updates unread count in real-time across all devices
  - Mark all as read broadcasts count update to all connected clients
- **Production Status**: Architect-approved, fully functional end-to-end with WebSocket delivery

### Real-Time Shift Synchronization - Live Updates Across All Devices ✅
**WebSocket-Based Live Sync** for instantaneous schedule updates:
- **Backend WebSocket Infrastructure**: Extended `/ws/chat` endpoint with shift-specific message types (`shift_created`, `shift_updated`, `shift_deleted`)
  - Workspace-scoped broadcast channels for data isolation
  - Automatic subscription management with reconnection logic
  - Client cleanup on disconnection
- **Frontend Real-Time Hook**: `useShiftWebSocket` hook with intelligent reconnection
  - Exponential backoff reconnection strategy (max 30s)
  - Connection rate limiting to prevent excessive reconnects
  - Automatic cache invalidation on shift updates via TanStack Query
  - Color-coded toast notifications for all shift events (info variant)
- **Universal Integration**: Both mobile and desktop interfaces connected
  - Mobile Shift Calendar: Live updates without manual refresh
  - Desktop Schedule Grid: Instant synchronization with mobile changes
  - **Real-Time Workflow**: Desktop creates shift → Mobile sees it immediately (like MSN chatrooms with separate live-updating frames)
- **Backend Broadcasting**: All shift mutations trigger WebSocket broadcasts
  - `POST /api/shifts` → broadcasts `shift_created`
  - `PATCH /api/shifts/:id` → broadcasts `shift_updated`
  - `DELETE /api/shifts/:id` → broadcasts `shift_deleted`

### Mobile UX Enhancement - Native App Experience ✅
**Polished Mobile Interface** with APK-style user experience:
- **Enhanced Toast Notifications**: Color-coded success (Emergency Green), warning (Amber), error (Red), and info (Blue) toasts with icons
  - Larger, more visible notifications (rounded-2xl with shadow-2xl)
  - Animated icons (CheckCircle, AlertTriangle, XCircle, Info, Zap)
  - Better mobile positioning and padding
  - All shift actions now provide clear visual feedback via colored toasts
- **Loading States**: Professional AutoForce™-branded spinner with Emergency Green (#10b981) pulsing animation
- **Mobile-First Design**: Seamless transitions, larger touch targets, native app feel

### Mobile Shift Calendar - ScheduleOS™ (PRODUCTION-READY) ✅
**Comprehensive Mobile Shift Management** with complete operational workflow:
- **Core Features**: Weekly agenda view, color-coded shifts, week navigation, FAB creation, real-time API data
- **Shift Actions Panel** (Mobile-Optimized): Large Clock In/Out button (Emergency Green #10b981), quick-action grid with Start Chat, Audit Trail, Post Orders, and More options
- **Post Orders Acknowledgment**: Automatic detection, amber alerts, enforcement workflow preventing clock-in until acknowledged
- **Backend Integration** (Complete):
  - Clock In: `POST /api/time-entries/clock-in`
  - Clock Out: `PATCH /api/time-entries/:id/clock-out`
  - Acknowledgments: `PATCH /api/acknowledgments/:id/acknowledge`
  - Start Chat: `POST /api/chat/rooms` (creates CommOS™ room and navigates)
  - Audit Trail: `GET /api/audit/entity/shift/:id` (fetches AuditOS™ records)
- **Manager Override Workflow** (Fully Functional):
  - Role detection via `/api/auth/me`
  - Bypasses acknowledgment requirements when managing employee shifts
  - Shows "Manager Override" badge and helper text
  - Provides override notifications during clock in/out
  - Backend RBAC enforcement with automatic audit logging
- **Branding**: Emergency Green (#10b981 / emerald-500) uniformly applied to all shift cards, status labels, buttons, borders, and icons
- **Desktop Compatibility**: Mobile view < 768px, desktop grid ≥ 768px
- **Production Status**: Architect-approved, ready for end-to-end testing and deployment

## System Architecture
AutoForce™ is built on a modular "OS" design (e.g., BillOS™, PayrollOS™, TrackOS™), promoting clean code and extensibility.

**UI/UX Decisions:** The platform features a professional interface with Deep Charcoal, Platinum neutrals, and Emergency Green accents. It prioritizes mobile-first design with responsive layouts and accessible touch targets. The logo, an "AF" lightning bolt in a circular green gradient badge, symbolizes rapid response and reliability.

**Technical Implementations:**
- **Frontend**: React, Vite, TypeScript, Wouter, TanStack Query, shadcn/ui, `react-hook-form`, `zod`.
- **Backend**: Express.js, TypeScript, with Zod for validation.
- **Database**: PostgreSQL with Drizzle ORM.
- **Authentication**: Custom session-based authentication supporting both Replit Auth (OIDC) and Custom Auth, including bcrypt, account locking, and password reset.
- **Multi-Tenancy**: Workspace-based data isolation.
- **Role-Based Access Control (RBAC)**: Hierarchical roles and API protection.
- **Communication**: IRC-style WebSocket command/response architecture for real-time interactions, with server-side validation and permissions.
- **Audit Logging**: Comprehensive audit trails via AuditOS™.
- **Core Feature Areas**:
    - **Financials**: Client Management, Billing & Payroll (BillOS™, PayrollOS™) with automated invoice generation and payment processing.
    - **Employee Lifecycle**: Onboarding, contract management (I9, W9, W4) with e-signature, shift management with approval workflows, timesheet and time-off requests.
    - **Compliance & Policy**: I-9 re-verification tracking, Policy Management (PolicIOS™) with version control and e-signature acknowledgments.
    - **Communication**: Team Communication (CommOS™) with multi-room chat, and Private Messages with AES-256-GCM server-side encryption and an audit access system.
    - **Expense Management**: ExpenseOS™ for expense reimbursement, category tracking, mileage calculation, and approval workflows.
    - **Scheduling**: ScheduleOS™ with mobile-optimized shift calendars and shift action menus including chat creation and audit trail viewing.
    - **Asset Management**: AssetOS™ for tracking vehicles and equipment.
    - **AI & Analytics**: RecordOS™ and InsightOS™ for natural language search, autonomous analytics, and predictive insights.
    - **Learning & Development**: TrainingOS™.
    - **Financial Planning**: BudgetOS™.
    - **Employee Engagement**: EngagementOS™.
    - **HR Automation**.
    - **Integrations**: IntegrationOS™.
    - **Sales Operations**: DealOS™ + BidOS™.
    - **Platform Administration**: ROOT Admin Dashboard, organization onboarding.
- **Security**: Stripe webhook signature validation, payroll data protection, strict Zod validation, workspace scoping, and audit trails.

## External Dependencies
- **Database**: Neon (PostgreSQL)
- **ORM**: Drizzle ORM
- **Payment Processing**: Stripe Connect
- **Email**: Resend
- **AI**: OpenAI GPT-4 (`gpt-4o-mini`)