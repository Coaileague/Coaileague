# AutoForce™

## Overview
AutoForce™ (Autonomous Workforce Management Solutions) is a comprehensive workforce management platform for emergency services and other service-related industries. It aims to streamline operations, reduce administrative burdens, and act as a single source of truth for workforce management. Key capabilities include time tracking, automated invoice generation, smart hiring, compliance audit trails, and real-time analytics. The platform utilizes an "OS" design philosophy for extensibility and aims for a subscription and usage-based AI revenue model.

## User Preferences
I prefer detailed explanations.
Do not make changes to the folder `Z`.
Do not make changes to the file `Y`.
All branding must be 100% AutoForce™ (not WorkforceOS).
FTC COMPLIANCE: All marketing claims must be factual and verifiable. Avoid monopolistic language.

## FTC Compliance Status (November 8-9, 2025)
**GPS TRACKING FULLY IMPLEMENTED**: Built complete GPS verification and photo verification features to make marketing claims 100% truthful.
- ✅ **GPS Time Tracking**: IMPLEMENTED - Frontend captures GPS using navigator.geolocation, validates accuracy, stores in database
- ✅ **Photo Verification**: IMPLEMENTED - Camera access, photo capture, base64 storage with time entries
- ✅ **Real-time Location**: GPS captured on every clock-in with lat/long/accuracy displayed to user
- ⚠️ **Geofencing**: Planned - Will validate employee is within designated work areas
- ❌ **DispatchOS™ GPS Map**: Backend complete (494 lines), frontend visualization needed
- ✅ **Contact Info**: Using real emails only (info@getdc360.com, support@getdc360.com). No fake phone/addresses.

**Implementation Details:**
- GPS capture: `navigator.geolocation.getCurrentPosition()` with 10s timeout, high accuracy mode
- Photo capture: `navigator.mediaDevices.getUserMedia()` with canvas-based JPEG compression
- Validation: GPS accuracy must be captured, photo required before clock-in allowed
- Backend: Existing endpoints already accept gpsLatitude, gpsLongitude, gpsAccuracy, photoUrl
- UI: Professional verification panels with status badges, retry buttons, real-time feedback
No Refresh Buttons.
Role-Aware Settings Gear:
  - Regular users → Organization settings (`/settings`)
  - Support roles (leaders, deputy admins) → Admin tools (`/admin-command-center`)
  - ROOT/SYSOP admins → Platform management (`/platform-admin`)
Universal Back Navigation: Every page, modal, dialog needs clear exit/cancel/back buttons.
Unsaved Changes Protection: Forms and pages with editable content must warn users before navigation/close.

## Test Credentials
Root Admin Account:
- Email: root@getdc360.com
- Password: admin123@*

## System Architecture
AutoForce™ is built on a modular "OS" design philosophy (e.g., BillOS™, PayrollOS™, TrackOS™) for clean code and extensibility.

### Advanced Billing & Usage-Based Pricing
A hybrid pricing model combines subscriptions with overage charges for AI-powered modules based on token usage. Non-AI modules use a flat subscription. Monthly token allowances are tracked per workspace, with overage usage billed profitably.

### UI/UX Decisions
The platform features a professional aesthetic using Deep Charcoal, Platinum neutrals, and Emergency Green accents. It prioritizes a mobile-first approach with responsive layouts and accessible touch targets. Branding includes an "AF" lightning bolt logo within a circular green gradient badge. User-facing pages consistently use emerald/green/teal colors, a uniform dark gradient background, and emerald accents.

**Navigation Improvements (November 2025)**:
- **Floating Header**: Sticky header (`position: sticky`) floats over content when scrolling without overlapping sidebar or demo banner. Semi-transparent with backdrop blur for modern aesthetic.
- **Visible Labels**: All navigation buttons include text labels on larger screens (Menu, Search, Tutorial, Settings/Admin) plus tooltips for clarity. Users know what each button does.
- **Breadcrumb Navigation**: Contextual breadcrumbs (Home > Section > Page) help users understand their location and navigate back easily. Automatically hidden on dashboard/home where not needed.

Key mobile-first PWA features include:
- Comprehensive mobile-first CSS variables for breakpoints, touch targets (48px minimum), spacing, typography, and safe areas.
- Complete Progressive Web App setup with manifest.json and a service worker for offline support and caching.
- A `ResponsiveAppFrame` provider with a `useMobile()` hook for device detection and PWA install prompts.
- CSS utility classes for mobile-specific elements like touch targets, safe areas, and navigation.
- Adaptive navigation that transforms the desktop sidebar into a bottom navigation bar on mobile.
- Mobile layout primitives such as `MobilePageWrapper`, `MobilePageHeader`, `MobileGrid`, and `MobileBottomSheet`.
- Touch gestures like pull-to-refresh and swipeable gestures.
- Performance optimizations including lazy loading for images and asset caching via the service worker.

### Technical Implementations
- **Frontend**: React, Vite, TypeScript, Wouter, TanStack Query, shadcn/ui, `react-hook-form`, `zod`.
- **Backend**: Express.js, TypeScript, with Zod for validation.
- **Database**: PostgreSQL with Drizzle ORM.
- **Authentication**: Custom session-based authentication supporting Replit Auth (OIDC) and Custom Auth, including bcrypt, account locking, and password reset.
- **Multi-Tenancy**: Data isolation is managed on a workspace basis.
- **Role-Based Access Control (RBAC)**: A comprehensive two-tier hierarchical role system separates platform support (e.g., `root_admin`, `support_agent`) from organization/tenant management (e.g., `org_owner`, `staff`). Platform roles are managed centrally, while workspace roles are assigned per-employee. Type safety is enforced via TypeScript, and authorization uses guard middleware with new role names.
- **Communication**: Utilizes an IRC-style WebSocket command/response architecture.
    - **HelpDesk (Consolidated Chat System)**: **UPDATED November 2025** - Features a unified `/chat` experience with AI integration and usage-based billing:
        - **Desktop/Tablet**: `/chat` → HelpDesk5 with Gemini AI, connection error handling, professional UI
        - **Mobile**: `/mobile-chat` → Mobile-optimized experience
        - **Legacy Redirects**: `/live-chat`, `/helpdesk5`, `/support/chat` redirect to `/chat`
        - **Public Access**: Open to all users including guests (no authentication required). Guests can chat for support but AI features are disabled. Ticket holders prioritized.
        - **Gemini AI Integration**: User-provided API key (gemini-2.0-flash-exp), context-aware responses, toggle + "Ask AI" button, graceful degradation
        - **AI Access Control**: AI features (Gemini, Help Bot) require workspace membership for billing. Guests get human support only with friendly "AI unavailable" messages.
        - **Connection Error Handling**: MAX_RETRIES=5 with exponential backoff, error dialog with Report Bug/Retry/Go Home options
        - **Usage-Based Billing** (**CRITICAL**): All AI token usage (Gemini + HelpOS bot) is automatically tracked and billed to workspace customers via `usageMeteringService`. Feature keys: `helpdesk_gemini_chat`, `helpdesk_ai_greeting`, `helpdesk_ai_response`, `helpdesk_ai_analysis`. Zero-cost AI for guests (disabled), full billing for workspace users. This ensures platform profitability on AI features.
    - **CommOS™**: Organization-specific chatrooms with role-based access, supporting private messages (AES-256-GCM encrypted), message reactions, threading, file uploads, @mentions, read receipts, rich text formatting, live room browser, and full-text search. Also includes WebRTC-powered voice/video calling.
- **Audit Logging**: Comprehensive audit trails provided by AuditOS™.
- **Core Feature Areas**:
    - **Financials**: Client Management, Billing & Payroll (BillOS™, PayrollOS™), automated invoice generation, payment processing.
    - **Employee Lifecycle**: Onboarding, contract management, shift management, timesheet and time-off requests.
    - **Compliance & Policy**: I-9 re-verification tracking, Policy Management (PolicIOS™) with version control.
    - **Expense Management**: ExpenseOS™ for reimbursement, tracking, mileage calculation.
    - **Scheduling**: ScheduleOS™ with mobile-optimized shift calendars and AI-powered generation.
    - **Asset Management**: AssetOS™ for tracking vehicles and equipment.
    - **AI & Analytics**: RecordOS™ and InsightOS™ for natural language search, autonomous analytics, and predictive insights.
    - **Platform Administration**: ROOT Admin Dashboard, organization onboarding, and HelpDesk queue management.
    - **Organization Support System**: Internal support ticket escalation workflow from organization leaders to platform support staff, including ticket creation, escalation, platform queue management, assignment, and resolution.
    - **HelpOS™ FAQ System**: AI-powered knowledge base with semantic search (OpenAI embedding-based), auto-generation from resolved tickets (GPT-3.5), conversation refinement, bulk import, and a draft-first workflow.
    - **HelpOS™ Autonomous Bot**: **UPDATED November 2025** - An intelligent support agent with usage-based billing. Provides bot-first assistance with human escalation via state machine, FAQ-powered responses with confidence scoring, sentiment detection, auto-resolution, and smart escalation with context preservation. Dual notification systems (chat announcements and database notifications). **All AI token usage (greetings, responses, sentiment analysis) is automatically tracked and billed to customer workspaces** via `usageMeteringService` to ensure platform profitability.
    - **DispatchOS™ - Computer-Aided Dispatch**: **BACKEND ONLY (November 2025)** - Backend implementation complete with 494-line service layer (`server/services/dispatch.ts`), 303-line REST API routes (`server/routes/dispatch.ts`), and 77 lines of WebSocket broadcasts (`server/websocket.ts`). Features: GPS tracking with 10-second updates, unit status management (available/en_route/on_scene/offline), incident queue with priority-based assignment (emergency/urgent/routine), dispatcher command center, and comprehensive audit logging. Database tables: dispatch_incidents, unit_statuses, dispatch_assignments, dispatch_logs, enhanced gps_locations. All types aligned (VARCHAR UUIDs, doublePrecision for coordinates). Zero LSP errors. 10 API endpoints: POST /api/dispatch/gps (GPS location), GET /api/dispatch/units (active units), GET /api/dispatch/units/:id/trail (GPS trail), POST /api/dispatch/units/status (update status), POST /api/dispatch/incidents (create incident), GET /api/dispatch/incidents (list incidents), PATCH /api/dispatch/incidents/:id/status (update status), POST /api/dispatch/assignments (assign unit), PATCH /api/dispatch/assignments/:id/respond (unit response), POST /api/dispatch/logs (dispatch log). WebSocket events for real-time dispatcher updates. Integrates with ScheduleOS™, TimeOS™, and BillOS™. **Frontend NOT built yet** - needs live GPS map visualization (Leaflet/Mapbox). Not marketed until frontend complete.
- **Security**: Features Stripe webhook signature validation, payroll data protection, strict Zod validation, workspace scoping, and audit trails.
- **Production Monitoring**: **NEW November 2025** - Comprehensive observability infrastructure via `server/monitoring.ts`. Includes error logging with context (userId, workspaceId, requestId), performance metrics tracking (endpoint duration, status codes), health check capabilities, auto-flush buffers (every 10s), slow request detection (>1000ms warnings), and graceful shutdown handling. Ready for external service integration (Datadog, Sentry, CloudWatch).

## External Dependencies
- **Database**: Neon (PostgreSQL)
- **ORM**: Drizzle ORM
- **Payment Processing**: Stripe Connect
- **Email**: Resend
- **AI**: OpenAI GPT-3.5-turbo (for HelpOS support bot with usage tracking), Gemini 2.0 Flash Exp (for HelpDesk chat with usage tracking), GPT-4 (for ScheduleOS auto-scheduling with usage tracking), GPT-4-turbo (for DisputeAI grievance analysis with usage tracking), GPT-4o (for PredictionOS predictions with usage tracking)
  - **AI Usage Billing Coverage** (**100% COMPLETE**):
    - ✅ **HelpDesk/CommOS** - Fully tracked (Gemini chat, HelpOS AI, Help Bot, FAQ embeddings)
    - ✅ **ScheduleOS™** - Fully tracked (GPT-4 auto-scheduling via `scheduleos_ai_generation` feature key)
    - ✅ **DisputeAI** - Fully tracked (GPT-4-turbo grievance analysis via `disputeai_analysis` feature key)
    - ✅ **PredictionOS™** - Fully tracked (GPT-4o turnover/cost predictions via `predictionos_turnover_analysis` and `predictionos_cost_variance` feature keys)