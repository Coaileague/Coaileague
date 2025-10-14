# WorkforceOS - Replace Your Entire HR Department

## Overview
WorkforceOS is a Fortune 500-grade operating system for workforce management. It's a complete office work automation platform for any business, featuring time tracking, automated invoice generation, smart hiring, compliance audit trails, and real-time analytics. The platform replaces multiple HR staff positions with one automated system, delivering $130K-$250K in annual cost savings through drag-and-drop scheduling, multi-tenant security, role-based access control, and comprehensive analytics.

**Note**: GPS clock-in and automated payroll have database schemas ready but require UI implementation. Stripe Connect and email notifications are configured but require API key activation.

## Brand Identity
- **Name**: WorkforceOS
- **Tagline**: "Replace Your Entire Workforce Department"
- **Value Proposition**: Fortune 500-grade platform with time tracking, automated invoicing, hiring, and compliance (GPS clock-in and payroll processing schemas ready for implementation)
- **Primary Color**: Indigo (#6366f1 / #4f46e5) - Modern, professional, enterprise-ready
- **Logo**: Gradient "Zap" icon in indigo square
- **Design System**: Modern dark theme with clean organization, mobile-first responsive design, indigo accents, and clear visual hierarchy
- **Target Savings**: $130K-$250K per year by replacing HR staff with automation
- **Recent Update**: Transformed entire platform to modern, organized dark UI (October 2025) with mobile hamburger menu, responsive grids, and consistent design pattern across all pages

## User Preferences
I prefer detailed explanations.
Do not make changes to the folder `Z`.
Do not make changes to the file `Y`.

## System Architecture
### UI/UX Decisions
The platform features a CAD-style professional interface with an application frame (menu bar, toolbar, status bar) and a dark mode theme with precision color schemes. It prioritizes a program-like interface for precision and control, rather than a typical website. It includes real-time indicators such as live clocks and connection status.

### Technical Implementations
- **Frontend**: React, Vite, TypeScript, Wouter (routing), TanStack Query, shadcn/ui. Form validation uses `react-hook-form` and `zod`.
- **Backend**: Express.js, TypeScript. Request bodies are validated with Zod schemas.
- **Database**: PostgreSQL (Neon) with Drizzle ORM.
- **Authentication**: Replit Auth (OIDC).
- **Multi-Tenancy**: Workspace-based isolation with `workspaceId` foreign keys on all core tables and strict data scoping enforced at the API and database levels.
- **Role-Based Access Control (RBAC)**: Supports Owner, Manager, and Employee roles with a hybrid workspace resolution strategy. Manager assignments (`manager_assignments` table) define hierarchical relationships. API routes are protected by `requireOwner`, `requireManager`, and `requireEmployee` middleware.
- **Time Tracking**: Clock-in/out functionality with real-time timers, automatic hourly rate calculation, and server-side calculation of total hours and amounts.
- **Invoice Generation**: Automated generation from unbilled time entries, including multi-client selection, tax and platform fee calculation, and status tracking (draft/sent/paid).
- **Analytics Dashboard**: Tracks total revenue (post-platform-fee), total hours worked, active employee/client counts, workspace usage metrics, and invoice statistics.
- **Advanced Scheduling**: Includes shift templates and recurring shifts (daily/weekly).
- **Employee Onboarding System**: Features an email invitation workflow with secure, single-use tokens, a multi-step onboarding flow (personal info, tax classification, availability, document upload, e-signature capture), legal compliance features (W-4/W-9 tracking, contract signatures, SOP acknowledgements), and automatic employee number generation.
- **Demo System**: An interactive demo workspace pre-populated with sample data is available, resetting every 24 hours.

### Feature Specifications
- **Core Features**: Employee management (CRUD), client management (CRUD), shift scheduling, multi-tenant data isolation, responsive design, dark mode, demo system with 24-hour reset.
- **Advanced Features**: Time tracking (clock-in/out, real-time timers, linked to shifts), automated invoice generation (from time entries, tax/fee calculation), comprehensive analytics dashboard, RBAC (Owner, Manager, Employee roles, manager assignments), advanced scheduling (templates, recurring shifts), employee onboarding (invitations, multi-step flow, e-signatures, document upload, tax classification, status tracking), **Report Management System (RMS)** (template management, dynamic submissions, supervisor approval workflows).
- **Implemented but Requires Activation**: Email notifications (Resend integration ready), Stripe Connect payment processing.
- **Database Schema Ready (Needs UI)**: GPS location tracking for clock-ins, automated payroll processing, customer portal for RMS, support ticket system.
- **Planned Features**: SMS notifications, calendar export/import, full GPS tracking UI, payroll processing UI, RMS customer portal, RMS help desk.

### Security & Reliability (October 2025)

**✅ Implemented**:
1. **Enterprise Audit Logging** (`server/middleware/audit.ts`):
   - Immutable audit trail for all data mutations
   - Tracks user actions, IP addresses, timestamps for SOC2/GDPR compliance
   - Integrated with all authenticated API routes

2. **Rate Limiting & DDoS Protection** (`server/middleware/rateLimiter.ts`):
   - IP-based rate limiting: 1000 requests per 15 minutes
   - Trust proxy configured for accurate IP detection
   - Health check endpoint excluded from rate limiting
   - **Note**: Basic protection only - no per-workspace/user rate limiting yet

3. **Error Handling** (`client/src/components/ErrorBoundary.tsx`):
   - Global React error boundary for graceful degradation
   - User-friendly fallback UI with recovery options
   - Development error details for debugging

4. **Health Monitoring** (`/api/health` endpoint):
   - Database connection verification
   - Uptime tracking for SLA monitoring
   - Version reporting for deployment tracking

5. **Documentation**:
   - `docs/SECURITY.md` - Comprehensive security controls and compliance roadmap
   - `docs/RUNBOOK.md` - Operational procedures, incident response, disaster recovery

**⚠️ Security Gaps (SOC2 Critical)**:
- ❌ **Per-workspace/user rate limiting** (requires Redis or similar)
- ❌ **Route-specific rate limits** for auth/mutations
- ❌ **MFA/2FA** for sensitive operations
- ❌ **Penetration testing** external audit
- ❌ **Vulnerability scanning** (SAST/DAST)
- ❌ **Disaster recovery** tested backup/restore
- ❌ **Secrets rotation** automated policy
- ❌ **API key management** per-workspace

### Enterprise Security Roadmap (Planned)
**Critical Security Enhancements for Full Fortune 500/SOC2 Compliance:**
1. **Per-Workspace Rate Limiting**: Redis-backed sliding window with workspace/user keys
2. **Multi-Factor Authentication (MFA/2FA)**: For sensitive operations and role changes
3. **SSO Integration**: Enterprise clients (SAML/OAuth)
4. **Encryption at Rest**: Column-level encryption for SSN, bank details, documents
5. **API Key Management**: Per-workspace API keys for third-party integrations
6. **Vulnerability Scanning**: Automated SAST/DAST in CI/CD pipeline
7. **Penetration Testing**: External security audit and remediation
8. **Disaster Recovery**: Tested backup/restore procedures with RTO/RPO SLAs
9. **Centralized Logging**: OpenTelemetry integration with real-time alerts
10. **WAF Integration**: Web Application Firewall for advanced threat protection

### Monetization Strategy & Feature Tiers
**Pricing Architecture (Cost-Plus Model):**
- **Basic Tier** ($49/month): Core employee/client management, basic scheduling, time tracking
- **Professional Tier** ($149/month): + Invoice generation, analytics dashboard, employee onboarding
- **Premium Tier** ($299/month): + RMS, GPS tracking, advanced RBAC, compliance tools
- **Enterprise Tier** ($599/month): + White-label RMS, custom branding, API access, SSO, dedicated support
- **Add-Ons**: Automated payroll (+$99/month), SMS notifications (+$29/month), Advanced analytics (+$79/month)

**White-Label RMS Capability** (Enterprise Add-On +$199/month):
- Custom branding per workspace (logo, colors, domain)
- Branded report generation with client logos
- Custom email templates for report notifications
- Tenant-specific report templates
- Custom domain with SSL (clientname.workforceos.com or custom CNAME)
- White-label customer portal access

**Feature Flag System**:
- Database-backed feature flags per workspace
- Billing tier integration with Stripe metadata
- Graceful degradation for locked features
- Upgrade prompts with ROI messaging
- Feature usage analytics for monetization insights

## External Dependencies
- **Authentication**: Replit Auth
- **Database**: Neon (PostgreSQL)
- **ORM**: Drizzle ORM
- **Payment Processing**: Stripe Connect (ready for activation with API keys)