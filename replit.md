# AutoForce™

## Overview
AutoForce™ (Autonomous Workforce Management Solutions) is a comprehensive workforce management platform for emergency services and other service-related industries. It aims to streamline operations and reduce administrative burden through features like time tracking, automated invoice generation, smart hiring, compliance audit trails, and real-time analytics. The platform utilizes an "OS" design philosophy for extensibility and serves as a single source of truth for workforce management, aspiring to revolutionize the industry with a subscription and usage-based AI revenue model.

## Recent Updates (November 7, 2025)

### UI/UX Improvements
- **Button Text Overflow Fix**: Added `whitespace-normal text-center` to specific marketing CTA buttons on landing page to allow wrapping on mobile without affecting other buttons globally
- **Table Responsiveness**: Updated table component with `border border-border rounded-md` wrapper and `min-w-full border-collapse` for visible borders and horizontal scroll on mobile
- **Loading Screen**: Replaced green lightning bolt `MobileLoading` with minimal spinner (spinning border + "Loading..." text) during authentication
- **Chat Bubble X Button**: Made close button always visible on mobile (`md:opacity-0 md:group-hover:opacity-100`) so users can close without hovering
- **Mobile Auth Buttons**: Changed login to `variant="outline"` and signup to explicit `bg-primary` for better visibility and separation on landing page

### CommOS Support Staff View (Fixed)
- **Platform Role Detection**: Fixed CommOS to properly detect support staff using `platformRole` field instead of workspace `role`
  - Support staff roles: `root`, `deputy_admin`, `deputy_assistant`, `sysop`, `support`
  - Added `platformRole` to `AuthUser` type in useAuth hook
- **Support Command Center**: Support staff now see dedicated platform-wide chatroom table showing:
  - All open public rooms across all organizations
  - Org-specific rooms with ownership badges
  - System rooms (HelpDesk, platform channels)
  - Live stats: Active Rooms, Total Participants, Unread Messages
  - Search & filter tools with auto-refresh every 5 seconds
  - Join/Export actions for each room
  - **Create Room** button for creating new platform/org chatrooms
- **Regular Users**: Continue to see org-specific chatroom view with max 10 active rooms

### HelpOS Enhancement (In Progress)
- **Database Schema Updates** (Ready to push - needs confirmation):
  - Added `helpos_faqs` table for FAQ knowledge base (category, question, answer, tags, embedding, view/helpful counts)
  - Updated `supportTickets` with `resolutionSummary`, `closedAt`, and `closedBy` columns for better ticket closure tracking
  - Added `associatedTicketId` to `chatConversations` to link conversations to support tickets for automated updates
  - Enhanced `chatParticipants` with bubble UI state fields: `isMinimized`, `bubblePosition`, `lastReadAt`, `isMuted`

**Next Steps for HelpOS**:
1. Confirm database migration (`npm run db:push` - select "create column" for any prompts)
2. Enhance HelpOS AI with FAQ retrieval and OpenAI integration
3. Build multi-bubble chat interface components (ChatBubbleTray, DMChatWindow)
4. Implement ticket closure workflow (user vs support close logic)

### Previous Updates
- **ROOT Admin Dashboard Enhancement**: Redesigned Quick Access toolbar with 23+ comprehensive support and platform maintenance tools organized into 4 categories:
  - **Support & Helpdesk** (4 tools): Support Tickets (/admin-command-center), Live Chat (/mobile-chat), Help Desk (/helpdesk5), Support Email (/contact)
  - **Platform Management** (6 tools): Users (#user-section), Workspaces (#workspace-section), Audit Logs (/audit-trail), DB Admin, API Keys, Feature Flags (/settings)
  - **Operations & Monitoring** (5 tools): System Health (#system-stats), Error Logs (#recent-activity), Performance, Webhooks, API Status
  - **Core Features** (8 tools): Schedule, Time Clock, Invoices, Payroll, Hiring, Training, Analytics, All Features
- **Scroll Navigation**: Added functional scroll anchors (user-section, workspace-section, system-stats, recent-activity) for seamless in-page navigation
- **Database Fixes**: Added missing `billing_cycle_day`, `starts_at`, `billing_preferences`, `monthly_employee_overages`, and `last_overage_check_at` columns to workspaces/workspace_addons tables
- **Brand Consistency**: Complete Emergency Green (emerald) color standardization across ROOT admin dashboard - replaced ALL blue/cyan/indigo/purple/violet colors (verified 0 matches)
- **Toast/Notification Styling**: Updated all toast notifications to use dark slate backgrounds (bg-slate-900) instead of white, matching the platform's dark theme. Changed info variant from blue to teal for Emergency Green brand consistency.
- **WebSocket Chat Fix**: Fixed critical WebSocket connection bug - corrected double colon typo in protocol string (`wss:://` → `wss://`) by changing protocol variable from `'wss:'` to `'wss'` (and `'ws:'` to `'ws'`) in ALL three WebSocket hooks:
  - `use-chatroom-websocket.ts` (main chat)
  - `use-notification-websocket.ts` (notifications)
  - `use-shift-websocket.ts` (shift updates)
  - Chat WebSocket now connects properly to `wss://{host}/ws/chat`
- **Code Quality**: Fixed React duplicate key warnings by using unique testid values instead of links
- **User Display Name Formatting**: Implemented user-friendly display name system for all chatrooms:
  - **Support Staff**: Show "Title FirstName" format (e.g., "Admin Brigido", "Deputy Sarah", "SysOp Mike", "Assistant Emily")
    - Titles derived from platform roles: root→Admin, deputy_admin→Deputy, deputy_assistant→Assistant, sysop→SysOp
  - **Regular Users**: Show "FirstName LastName" format (e.g., "Jennifer Lopez", "Test User")
  - Applied across user lists, join/leave messages, and chat interface
  - Server-side formatting via `formatUserDisplayNameForChat()` utility in `server/utils/formatUserDisplayName.ts`
  - Fixed boolean conversion bug in HelpDesk5.tsx (`isStaff` and `isAuthenticated` now explicitly Boolean)

## User Preferences
I prefer detailed explanations.
Do not make changes to the folder `Z`.
Do not make changes to the file `Y`.
All branding must be 100% AutoForce™ (not WorkforceOS).
FTC COMPLIANCE: All marketing claims must be factual and verifiable. Avoid monopolistic language.

## System Architecture
AutoForce™ is built on a modular "OS" design philosophy (e.g., BillOS™, PayrollOS™, TrackOS™) for clean code and extensibility.

### Advanced Billing & Usage-Based Pricing
**Hybrid Pricing Model** - AI-powered OS modules use subscription + overage pricing:
- **RecordOS™**: $49/mo includes 500k tokens (cost: $10, 390% markup), overage $0.03/1k tokens (50% markup)
- **InsightOS™**: $79/mo includes 1M tokens (cost: $20, 295% markup), overage $0.03/1k tokens
- **ScheduleOS™**: $59/mo includes 750k tokens (cost: $15, 293% markup), overage $0.03/1k tokens
- **Non-AI modules** (ExpenseOS™ $39/mo, PolicIOS™ $29/mo): Flat subscription, unlimited usage

**Billing Mechanics:**
- Monthly token allowances automatically tracked per workspace addon
- Usage within allowance: $0 charge (covered by subscription)
- Overage usage: Billed at $0.03 per 1k tokens (50% profit margin over $0.02 base cost)
- Monthly usage resets every 30 days automatically
- All overage charges added to weekly aggregated invoices

**UI/UX Decisions:** The platform features a professional aesthetic with Deep Charcoal, Platinum neutrals, and Emergency Green accents. It prioritizes a mobile-first approach with responsive layouts and accessible touch targets. The branding uses an "AF" lightning bolt logo within a circular green gradient badge, symbolizing rapid response and reliability.

**Brand Color Standardization (November 2025):** All user-facing pages (dashboard, landing, pricing, login, register, contact, support, chat, etc.) now use consistent emerald/green/teal colors exclusively for the Emergency Green brand identity. Purple/indigo/violet colors have been completely replaced to ensure professional, polished consistency throughout the platform. All pages feature a uniform dark gradient background (`bg-slate-gradient` or `bg-gradient-to-br from-slate-950 via-emerald-950 to-slate-950`) with emerald accents for brand cohesion. The color palette includes:
- Primary brand: emerald-500, emerald-600 (Emergency Green)
- Secondary accents: teal-500, green-500
- Supporting colors: amber (warnings), rose (costs), slate (neutrals)
- Logo "AUTO" text: slate-900 (light mode), white (dark mode) - high contrast for maximum visibility
- Logo "FORCE" text: emerald-600 (light mode), emerald-400 (dark mode)

**Technical Implementations:**
- **Frontend**: React, Vite, TypeScript, Wouter, TanStack Query, shadcn/ui, `react-hook-form`, `zod`.
- **Backend**: Express.js, TypeScript, with Zod for validation.
- **Database**: PostgreSQL with Drizzle ORM.
- **Authentication**: Custom session-based authentication supporting Replit Auth (OIDC) and Custom Auth, including bcrypt, account locking, and password reset.
- **Multi-Tenancy**: Data isolation is managed on a workspace basis.
- **Role-Based Access Control (RBAC)**: Implements hierarchical roles and API protection.
- **Communication**: Utilizes an IRC-style WebSocket command/response architecture for real-time interactions, including server-side validation and permissions.
  - **Chat System Architecture**: Three distinct chat implementations serve different use cases:
    - **HelpDesk5** (`/helpdesk5`): Mobile-optimized support chat for organizations to get help from AutoForce™ support team
      - Platform-owned channel belonging to WFMS Support workspace
      - IRC-style chatroom (`main-chatroom-workforceos`)
    - **LiveChat** (`/live-chat`): Desktop support chat interface for organizations seeking assistance
      - Same platform-owned HelpDesk channel as HelpDesk5
    - **CommOS™** (`/comm-os`): Organization chatrooms with role-based access:
      - **Regular users**: See rooms in their own workspace (max 10 active rooms per organization)
      - **Organization leaders**: Can create/close/reopen rooms within 10-room limit
      - **Support staff**: See polished table of ALL open chatrooms across all organizations
        - Automatically granted owner role when joining any org room
        - Can suspend/close rooms platform-wide
        - System announcement broadcasts when support joins: "AutoForce™ Support Staff (email) has joined the room with admin access"
      - **Auto-cleanup**: Inactive rooms (no activity for 1 week) automatically archived with audit logs
  - **WebSocket Protocol**: Fixed critical bug where protocol string `'wss:'` was causing invalid `wss:://` URLs; corrected to `'wss'` for proper `wss://` connections in all hooks
  - **WFMS Support Workspace**: Platform-owned workspace (`wfms-support`) for root and support team; all HelpDesk channels and support staff-created channels are owned by this workspace
- **Audit Logging**: Comprehensive audit trails provided by AuditOS™.
- **Core Feature Areas**:
    - **Financials**: Client Management, Billing & Payroll (BillOS™, PayrollOS™), automated invoice generation, payment processing.
    - **Employee Lifecycle**: Onboarding, contract management (I9, W9, W4) with e-signature, shift management with approval workflows, timesheet and time-off requests.
    - **Compliance & Policy**: I-9 re-verification tracking, Policy Management (PolicIOS™) with version control and e-signature acknowledgments.
    - **Communication**: Team Communication (CommOS™) with multi-room chat, and Private Messages with AES-256-GCM server-side encryption.
    - **Expense Management**: ExpenseOS™ for reimbursement, tracking, mileage calculation, and approval workflows.
    - **Scheduling**: ScheduleOS™ with mobile-optimized shift calendars, AI-powered generation, and on-demand staffing.
    - **Asset Management**: AssetOS™ for tracking vehicles and equipment.
    - **AI & Analytics**: RecordOS™ and InsightOS™ for natural language search, autonomous analytics, and predictive insights.
    - **Platform Administration**: ROOT Admin Dashboard, organization onboarding, and HelpDesk queue management with AI integration.
- **Security**: Features Stripe webhook signature validation, payroll data protection, strict Zod validation, workspace scoping, and audit trails.

## External Dependencies
- **Database**: Neon (PostgreSQL)
- **ORM**: Drizzle ORM
- **Payment Processing**: Stripe Connect
- **Email**: Resend
- **AI**: OpenAI GPT-3.5-turbo (for HelpOS support bot), GPT-4o-mini (for advanced features)