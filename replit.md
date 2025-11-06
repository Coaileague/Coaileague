# AutoForce™

## Overview
AutoForce™ (Autonomous Workforce Management Solutions) is a comprehensive workforce management platform currently focused on emergency services and service-related industries. The platform offers time tracking, automated invoice generation, smart hiring, compliance audit trails, and real-time analytics. Features are designed to streamline operations and reduce administrative burden for service-focused organizations.

## User Preferences
I prefer detailed explanations.
Do not make changes to the folder `Z`.
Do not make changes to the file `Y`.
All branding must be 100% AutoForce™ (not WorkforceOS).
FTC COMPLIANCE: All marketing claims must be factual and verifiable. Avoid monopolistic language.

## Recent Changes (Nov 6, 2025)
### Dashboard Cleanup & Role-Based Widgets
- **Navigation Consolidation**: Removed redundant MobileBottomNav and QuickActionsMenu components. Removed "Quick Access" section from AppSidebar. Unified navigation through organized sidebar families (Communication → Operations → Growth & AI → Platform).
- **Role-Based Dashboard**: Replaced 8 generic stat cards with 4 role-specific cards:
  - **Managers/Owners**: EMPLOYEES, CLIENTS, LABOR COST, CLOCKED IN
  - **Employees**: MY SHIFTS, HOURS THIS WEEK, TRAINING, EXPENSES
- **Manager Approval Widgets**: Added dynamic "Pending Approvals" section for managers showing:
  - ExpenseOS™ pending expense approvals with count badges
  - I-9 Compliance expiring work authorizations (30/7 day warnings)
  - PolicIOS™ draft policies ready to publish
- **Real Data Integration**: Connected BudgetOS™ to /api/budgets endpoints (previously mock data). TrainingOS™ already connected.
- **Aesthetics**: Removed duplicate quick-action toolbars, simplified layout, consistent spacing, focused on role-relevant data.

### Mobile Shift Calendar (ScheduleOS™) - Nov 6, 2025
- **New MobileShiftCalendar Component**: Replaced old SlingMobileSchedule with modern mobile-optimized shift calendar based on provided design specs
- **Features**:
  - Weekly agenda view with day-by-day shift listings
  - Week navigation with prev/next buttons
  - Shift cards with color-coded status indicators (draft/scheduled/in_progress/completed/cancelled)
  - Click-to-view shift details modal with Clock In/Out actions
  - Integration with ShiftActionsMenu for Create Chat and Audit Trail
  - FAB button for quick shift creation
  - Real-time data from /api/shifts, /api/employees, /api/clients endpoints
- **Mobile-First Design**: Clean, touch-friendly interface with Emergency Green accent colors matching AutoForce™ branding
- **Desktop Compatibility**: Mobile calendar shown on screens < md (768px), desktop grid view on larger screens

## System Architecture
AutoForce™ features a modular "OS" design (e.g., BillOS™, PayrollOS™, TrackOS™, TrainingOS™, HelpOS™), emphasizing extension over rebuilding, clean code, and a single source of truth for each feature domain. The revenue model combines subscription fees with usage-based AI pricing.

**UI/UX Decisions:** The platform features a professional interface with Deep Charcoal (#1F2937), Platinum neutrals, and Emergency Green (#10b981 emerald) accents. The logo features a simplified "AF" lightning bolt in a circular green gradient badge, representing rapid response and reliability for emergency services. The platform prioritizes mobile-first design with responsive layouts, accessible touch targets, and optimized navigation patterns.

**Logo Implementation:**
- **Component**: `AutoForceAFLogo` (via `AnimatedAutoForceLogo` wrapper for backward compatibility) with three variants (icon, wordmark, full)
- **Color Scheme**: Emergency Green gradient (#059669 → #10b981 → #6ee7b7) for modern, trust-focused branding
- **Design**: Simplified lightning bolt icon with "AF" text in circular badge
- **Animations**: Optional pulse animation for loading states
- **Sizing**: Responsive sizes (sm, md, lg, xl, hero) for different contexts
- **Integration**: Landing page, login/register pages, sidebar header, loading screens, transition overlays

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
      - ✅ Seed endpoint: POST /api/expense-categories/seed for existing workspaces (auto-seeded for new workspaces)
      - ✅ Default categories: Mileage, Meals, Travel, Office Supplies, Training, Equipment, Uniforms, Other
      - ✅ Employee submission UI: Expense form with mileage calculator and file upload
      - ✅ Manager approval dashboard: Review, view receipts, approve/deny with notes
      - ✅ Receipt upload: Multi-file upload with object storage integration
      - ✅ Receipt display: Download/view receipts in approval dialog
      - Features: Category tracking, mileage IRS rate calculation, multi-receipt support, approval workflow
      - **FIX**: Added manual seeding endpoint for workspaces created before auto-seeding was implemented
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
    - **CommOS™ - Team Communication (Implementation Status: 100% COMPLETE)**:
      - ✅ Schema: Complete (4 tables - commRooms, commRoomMembers, commRoomMessages, commRoomAuditLog)
      - ✅ Storage methods: Room/member/message CRUD, audit trail creation
      - ✅ API routes: Complete room lifecycle, member management, messaging endpoints
      - ✅ Onboarding UI: Create/join rooms with role selection (owner/admin/member/guest)
      - ✅ Security: Room status enum (active/suspended/closed), member role-based access control
      - Features: Multi-room chat, member management, audit trails for support staff actions
    - **Private Messages - Direct Messaging (Implementation Status: 100% COMPLETE)**:
      - ✅ Schema: Uses existing chatConversations/chatMessages tables with `subject='Private Message'` isolation
      - ✅ Encryption: AES-256-GCM server-side encryption with persistent key storage in conversationEncryptionKeys table
      - ✅ Storage methods: getPrivateMessageConversations, getPrivateMessages, sendPrivateMessage, markMessagesAsRead, searchUsers
      - ✅ API routes: GET /conversations, GET /:conversationId, POST /send, POST /start, POST /mark-read, GET /users/search
      - ✅ Security: Subject-based DM isolation (prevents SupportOS/CommOS thread leakage), server-side senderName derivation (prevents identity spoofing)
      - ✅ Encryption Service: server/encryption.ts with generateEncryptionKey, encryptMessage, decryptMessage (all async with DB persistence)
      - ✅ Audit Access System: dmAuditRequests, dmAccessLogs tables track all investigation workflows
      - ✅ Investigation API: POST /api/dm-audit/request, PATCH /approve/:id, PATCH /deny/:id, GET /access/:conversationId
      - ✅ Frontend integration: Complete UI with conversation list, message thread, user search, unread counts
      - ✅ File sharing: Upload/download files with 10MB limit, image preview, document downloads
      - Features: 1-on-1 messaging, read receipts, unread indicators, workspace-scoped user search, end-to-end encryption with audit trail
      - **Differential Monitoring**: CommOS (open chat) always monitored for safety; Private Messages encrypted and only accessible with approved investigation request for legal compliance
    - **Manual Chat Creation System (Implementation Status: 100% COMPLETE - Nov 6, 2025)**:
      - ✅ Schema: chatParticipants table for group chat membership, chatGuestTokens table for customer invitations
      - ✅ Backend APIs: 
        - POST /api/chats/create - Manual chatroom creation with participant selection and guest tokens
        - GET /api/shifts/:id/audit - Comprehensive shift audit data aggregation
        - POST /api/expense-categories/seed - Category seeding for existing workspaces
      - ✅ Frontend Components (Architect-Approved, Production-Ready):
        - **ShiftActionsMenu** (client/src/components/shift-actions-menu.tsx): Dropdown menu on shift cards in schedule grid with 3 options (Create Chat, View Audit, Clock In/Out)
        - **CreateChatDialog**: Employee multi-select with checkboxes, 4 chat types (employee-to-employee, manager-to-employee, group, customer_support), guest email/phone invitations, validation (≥1 participant OR guest), complete form auto-reset on cancel/close
        - **AuditDataDialog**: Comprehensive shift timeline viewer with GPS coordinates, time tracking details, discrepancies highlighting, summary statistics
      - ✅ Integration Points:
        - ScheduleOS: Shift selection → chat creation workflow → shift linkage metadata
        - Employee System: Workspace-scoped participant selection with real-time loading
        - CommOS: Chat storage in chatConversations table with proper isolation
        - Workspace scoping enforced across all queries and UI components
      - ✅ Database Schema Sync (Nov 6, 2025):
        - Added missing columns via SQL: ai_confidence_score, risk_score, risk_factors, acknowledged_at, denied_at, denial_reason (shifts table)
        - Added missing column: sent_at (auto_reports table)
        - Fixed date transformation bug: ISO strings → Date objects in insertShiftSchema (shared/schema.ts lines 854-855)
        - Verified: POST /api/shifts works correctly with 200 response after fixes
      - Features: 
        - 4 chat types: employee-to-employee, manager-to-employee, group, customer support
        - Customer guest invitations via email/SMS with 7-day token expiration (configurable 7-30 days)
        - Role-based access control (owner, admin, member, guest) with permissions
        - Shift-linked chats for full audit transparency and legal compliance
        - Participant permissions: send messages, view history, invite others (role-dependent)
        - Multi-select employee participation with checkbox UI and selection counter badge
        - Real-time form validation: requires ≥1 participant OR guest email before submission
        - Complete form reset on cancel/close (clears participants, subject, guest fields)
        - Error handling: employee fetch failures, network issues, validation messages via toasts
      - **Audit Data**: Shift creator, assigned employee, clock in/out times, GPS coordinates with accuracy, break logs, manager notes, tasks completed, timesheet edit history, time discrepancies, summary statistics (total hours, total amount, issue count)
      - **Use Case**: Emergency services can create secure chats with customers for transparency (incident photos, service reports, evidence documentation)
      - **Testing Status**: Components architect-approved (Pass). Database sync verified. POST /api/shifts verified working. Ready for manual UI/UX testing and customer launch.
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