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

**UI/UX Decisions:** The platform features a Fortune 500-caliber professional interface with Deep Charcoal (#1F2937), Platinum neutrals, and Crimson (#DC2626) accents for a Power & Authority aesthetic. The animated logo features a geometric "A" with orbiting workforce network nodes in the Charcoal-to-Crimson gradient, representing autonomous team management with enterprise command center styling. Logos are 50% larger for better visibility. It prioritizes mobile-first design with responsive layouts, accessible touch targets, and optimized navigation patterns. Specific UI components include tab-based navigation, collapsible sections, enhanced empty states, and a universal transition system. Navigation is designed to be intuitive, with clear back/home buttons and a Sling-style mobile dashboard layout for quick access. The sidebar is branded, scrollable, and features a clear typography hierarchy.

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

## Recent Changes (November 2025)
### ✅ RecordOS™ & InsightOS™ AI Platform Upgrade (COMPLETED - November 4, 2025)
**Status**: Production-ready AI-powered features with tiered pricing model
- **Logo Redesign**: Replaced generic network nodes with AI work-replacement icons
  - Central white human silhouette with 8 orbiting AI automation icons (calendar, chart, bot, document, money, clock, email, team)
  - 20-second smooth rotation animation showing AI agents replacing human tasks
  - Adaptive color switching for light/dark backgrounds
- **Wordmark Branding**: Created AutoForce™ wordmark component with 3 style variations
  - Stability Mark: Bold, authoritative (used on auth pages, sidebar)
  - Integrated Mark: High-tech badge style with "™" in blue box
  - Efficiency Mark: Light, modern, wide spacing
  - Theme-aware: Uses `text-foreground` with dark variants for light/dark compatibility
  - Deployed across: App sidebar (clickable to dashboard), login page, register page
  - All branding updated to "AutoForce™" with tagline "Autonomous Workforce Management Solutions"
- **RecordOS™ - Natural Language Search** (`/search`):
  - AI-powered search across employees, clients, invoices, time entries, shifts
  - Natural language queries: "Show me employees hired this month" or "Find invoices over $5000"
  - Real-time search with performance tracking (execution time displayed)
  - Search history with quick re-run capability
  - Backend: PostgreSQL full-text search with query logging
- **InsightOS™ - Autonomous AI Analytics** (`/insights`):
  - AI-generated insights for cost savings, productivity, anomalies, predictions
  - Autonomous insight generation with confidence scores
  - Priority-based dashboard (critical, high, normal, low)
  - Actionable recommendations with estimated impact
  - Insight dismissal with reason tracking for ML feedback loop
  - Backend: Metrics snapshots for trend analysis (daily, weekly, monthly)
- **Pricing Update**: Value-based tiered model with clear automation segmentation
  - **Basic ($299/mo)**: Up to 25 employees, manual tools only (no automation), $20/employee overage
  - **Starter ($599/mo)**: Up to 50 employees, FULL AUTOMATION (auto-billing, auto-payroll weekly/bi-weekly), $15/employee overage
  - **Professional ($999/mo)**: Up to 150 employees, AI features (RecordOS™ + InsightOS™), $150/mo AI credits, $12/employee overage
  - **Enterprise ($2,999/mo)**: Unlimited employees, premium AI + white-label, $500/mo AI credits, $10/employee overage
  - Customer-pays overage model: No loss on additional usage, automation costs covered by customer
  - Key insight: $599 Starter tier justified by weekly payroll/billing automation saving $15k/month

### ✅ Time Tracking & Billing System (COMPLETED - November 4, 2025)
**Status**: Core time tracking → invoicing → payroll flow is fully operational
- **Dual Authentication System**: Fixed demo login to support BOTH Replit Auth (OIDC) and Custom Auth
  - Demo login now sets complete session with `expires_at` and `refresh_token` fields for full OIDC compatibility
  - All API endpoints (`/api/time-entries`, `/api/invoices`, `/api/employees`, etc.) now accessible via demo account
  - Routes work with both `isAuthenticated` middleware (Replit Auth) and `requireAuth` middleware (Custom Auth)
- **Time Tracking Flow**: 
  - Employees clock in/out (manual or GPS-enabled)
  - Hours automatically calculated (regular + overtime at 1.5x)
  - Managers approve entries (pending → approved)
- **Invoice Generation (BillOS™)**:
  - Auto-generates invoices from approved time entries
  - Groups by client with configurable billing rates
  - Supports custom line items and tax calculations
- **Payroll Processing (PayrollOS™)**:
  - Calculates employee pay from same time entries
  - Applies employee rates (separate from client billing rates)
  - Overtime calculation (1.5x after 40 hours)
  - Tax withholding and deductions
- **Business Model**: Single time entry used for both client invoicing and employee payroll
  - Example: Employee paid $25/hr, client billed $50/hr = $25/hr gross margin (50% profit!)
- **Demo Account**: `demo@shiftsync.app` (via "Try Demo Account" button) with pre-populated sample data

### Mobile Responsive Updates
- **Grid Layouts**: Implemented mobile-first responsive grids across all major pages using pattern `grid-cols-2 sm:grid-cols-3 md:grid-cols-6`
  - Root Admin Portal: Stats grid responsive
  - Employee/Auditor Portals: Grid layouts optimized for mobile
  - Integration Marketplace: Tabs and cards responsive
- **Navigation**: Desktop chat sidebar (w-64) hidden on mobile with `hidden md:flex`
- **Pricing Page**: AI token usage pricing detailed with customer-pays model, fully responsive with no overflow
- **Known Issue**: Landing page hero section has horizontal overflow on small mobile viewports (scrollWidth ~536px on 375px viewport) - requires deeper investigation into responsive CSS utilities. All other pages display correctly.

### ✅ Navigation & Sidebar Menu Audit (COMPLETED - November 5, 2025)
**Status**: All 42 sidebar menu links verified working
- **Audit Results**: Fixed 5 missing user menu routes that were causing broken navigation
  - `/profile` - Redirects to employee profile page
  - `/unavailability` - Time off request management with calendar interface
  - `/create-org` - Organization creation form for multi-tenant workspaces
  - `/updates` - Product changelog showing latest features & improvements
  - `/help` - Help Center with searchable documentation and quick links
- **Animated Logo Integration**: Deployed AutoForceLogoFull animated SVG across landing, login, register pages with theme-aware gradients
- **Navigation Structure**: 4 OS Families (Communication, Operations, Growth & AI, Platform) + Quick Access section all fully functional

### ✅ Logo Visibility Fixes (COMPLETED - November 5, 2025)
**Status**: All logo display issues resolved
- **Sidebar Logo**: Replaced small icon+wordmark with full AutoForceLogoFull (md size) with gradient background
- **Loading Screens**: Fixed outdated WorkforceOS logo → AutoForceLogoFull with theme-aware backgrounds
- **Landing Page**: Increased navigation logo size (sm → md) for better visibility
- **Contrast Improvements**: Added gradient backgrounds and primary border accents throughout
- All logos now highly visible on both light and dark backgrounds