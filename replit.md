# CoAIleague - AI-Powered Workforce Intelligence Platform

## Overview
CoAIleague is a Fortune 500-grade multi-tenant autonomous workforce management platform. Its core purpose is to centralize dynamic configuration, eliminate hardcoded values, and integrate financial management with real Stripe payments. The platform leverages AI for advanced automation across various workforce management functions, including scheduling, sentiment analysis, onboarding, health monitoring, and dispute resolution. CoAIleague aims to deliver an efficient, comprehensive, and AI-driven workforce management solution with significant market potential, offering profit-optimized scheduling, strategic business intelligence, and comprehensive compliance.

## User Preferences
- I prefer simple language
- I want iterative development
- Ask before making major changes
- I prefer detailed explanations

## Architecture Rules (MANDATORY)
1. **Use Existing Infrastructure** - Always use current services, features, and patterns. Do NOT create new ones to avoid confusion. Only create if absolutely needed to keep platform organized.
2. **Follow Established Patterns** - Use the defined colors, Trinity model, animations, WebSockets, and broadcasting buses already in the codebase.
3. **File Index for Easy Editing** - Maintain organized file structure enabling parallel or single quick edits and design changes.
4. **No Hardcoded Values** - All values must be dynamic configuration for easy editing. Reference billingConfig.ts, platformConfig.ts, and similar centralized configs.
5. **Auto-Fix Modals/UI** - All modals and UI components must resize properly for desktop and mobile automatically.
6. **ColorfulCelticKnot Logo** - Trinity uses ONLY the 3-ribbon Celtic triquetra (purple/teal/gold) as the universal logo. Never use 5-pointed knot.

## System Architecture
CoAIleague features a multi-tenant architecture with RBAC security and isolation, managing application settings through centralized dynamic configuration.

**UI/UX Decisions:**
- **Responsive Design:** WCAG compliant mobile design with typography scaling.
- **Unified Pages:** Consolidated sales, marketing, and pricing pages driven by configuration.
- **Universal Animation System:** Canvas-based visual effects with multiple modes and seasonal themes.
- **Trinity AI Mascot:** An AI-powered interactive mascot providing global AI-driven insights.
- **Animated Word Logo:** A Google Doodle-style seasonal animated word logo system.

**Technical Implementations:**
- **Trinity AI Brain Services:** Utilizes a 4-tier Gemini architecture for document extraction, issue detection, autonomous scheduling, and platform orchestration. Includes a central registry for over 350 AI actions, with 8 strategic optimization actions for profit-first scheduling and business intelligence.
- **Universal Diagnostic Orchestrator:** Seven specialized domain subagents for root cause analysis and hotpatch suggestions.
- **HelpAI:** Support staff copilot for helpdesk chatrooms, focusing on escalation and ticket summarization.
- **Financials:** Real-time Stripe integration for payments, payroll, invoicing, and tax.
- **Email & Notifications:** Resend integration for email delivery and WebSocket for real-time notifications.
- **Compliance:** Daily certification, HR alerts, and dispute resolution, including 50-state labor law configuration for break compliance.
- **Time Tracking:** GPS-verified clock-in/out, timesheet reports, and AI anomaly detection.
- **Client Billing:** Invoice generation from tracked hours, PDF export, and email capabilities.
- **Advanced Scheduling:** Features recurring shifts, swapping, and one-click duplication.
- **Analytics Dashboard:** Metrics endpoints with AI insights and heat map visualizations.
- **Cognitive Onboarding Service:** Third-party API integrations with OAuth2 and AI-powered field mapping for organization setup.
- **HRIS Integration Service:** Unified integration with 8 providers, featuring OAuth2, bidirectional data sync, AI-powered field mapping, conflict resolution, and AI Brain orchestration.
- **Trinity Chat Interface:** Provides direct conversational access to Trinity with Business, Personal (BUDDY), and Integrated modes, featuring metacognition, real-time business metrics, conversation history, and proactive insights. Includes spiritual guidance options and configurable accountability levels.
- **Trinity Autonomous Notifier:** Real-time alert system for support staff with WebSocket broadcasts, auto-ticket creation, and a low-risk hotpatch system.

**System Design Choices:**
- **Modularity:** Extensive backend service modules and frontend routes.
- **Type Safety:** 100% LSP clean.
- **Automation:** Scheduled autonomous jobs including database maintenance.
- **Audit Logging:** Comprehensive SOX-compliant logging.
- **Infrastructure Services:** Includes Durable Job Queue, Backups, Error Tracking, Distributed Tracing, Rate Limiting, Health Checks, Metrics Dashboard, Circuit Breakers, SLA Monitoring, Disaster Recovery, Log Aggregation, Security Hardening, CDN/Edge Caching, and Audit Trail Export.
- **Automated Regression Tests:** Infrastructure validation suite runs on every startup.
- **Security:** AES-256-GCM encryption, PBKDF2-SHA256, RBAC, per-org credential isolation, and expiry warnings.
- **Unified Config Registry:** Single source of truth with Zod validation.
- **AI/Automation Bypass Pattern:** Elevated session bypass for AI features and automation services using HMAC-signed elevation tokens.
- **ChatServerHub Architecture:** Unified gateway connecting chat rooms to AI Brain, notifications, tickets, and analytics.
- **Trinity Command Center RBAC:** Chat interface restricted to support staff roles; org owners see Quick Actions.
- **Spec-Driven Development:** Component registry with tier-based AI editing rules.
- **Trinity Humanized Persona System:** Human-like AI communication patterns with a senior engineer persona.
- **Platform Support Infrastructure:** 3-tier support hierarchy (root_admin, co_admin, sysops) with cross-org access via support sessions, org freeze capability, and immutable audit logging with severity levels.
- **Trinity Elite:** Features like Strategic Optimization Engine (employee scoring, client tiering, profit-first scheduling), Go-Live Confidence Check, Resolution Inbox, QuickBooks 99% Automation, and Financial Watchdog for reconciliation with discrepancy alerts.
- **Diagnostics Subagent:** Playwright-based E2E site auditor for pre-launch bug detection. Crawls up to 300 pages, tests user workflows, detects console errors, broken images/links, network failures, and CAPTCHAs. Generates HTML report and summary.json for agent-driven bug fixing.

## Custom Authentication & Testing

**Authentication System:**
- Custom session-based auth using express-session + PostgreSQL (NOT Replit Auth)
- Password hashing with PBKDF2-SHA256
- Account lockout protection after failed attempts
- Session cookies with secure flags

**Diagnostic Crawler Bypass (for testing):**
- Header: `x-test-key` with value from `DIAG_BYPASS_SECRET` environment variable
- Uses REAL user ID (`48003611`) and workspace ID (`37a04d24-51bd-4856-9faa-d26a2fe82094`)
- Grants `org_owner` workspace role and `root_admin` platform role
- All `/api/` routes are accessible in test mode
- Optional: Use `x-test-workspace` header to override workspace ID

**Testing with curl:**
```bash
curl -H "x-test-key: $DIAG_BYPASS_SECRET" http://localhost:5000/api/employees
```

## QuickBooks Automation Roadmap (All Service Industries)

**Target Industries:** Security, Cleaning, Home Health, HVAC, Plumbing, Painting, Landscaping, Electrical, and all service businesses.

### Phase 1: Core Cash Flow (MVP Priority)
- **Estimate → Invoice Flow**: Auto-convert approved estimates to invoices
- **Time-to-Invoice**: Tracked hours → billable line items automatically
- **Recurring Billing**: Service contracts auto-invoice monthly/weekly
- **Payment Reminders**: Automated collection emails with payment links
- **Job Costing**: Profit/loss per job, client, location

### Phase 2: Cost Control & Operations
- **Materials/PO Sync**: Auto-create purchase orders from job materials
- **Expense Categorization**: Trinity AI auto-categorizes receipts to QBO accounts
- **Payroll Sync**: Timesheets → payroll with job codes
- **Vendor Payment Scheduling**: Smart bill pay with cash flow optimization
- **Inventory Tracking**: Supplies/parts usage per job

### Phase 3: Intelligence & Compliance
- **1099/W-2 Prep**: Auto-flag contractors vs employees for tax time
- **Multi-Location Rollups**: Franchise/branch P&L reporting
- **Industry Templates**: Pre-built service catalogs per industry
- **Home Health EVV**: Electronic Visit Verification billing codes
- **Financial Watchdog**: AI reconciliation with discrepancy alerts

**Migration Note:** CloudEvents webhook format migration required by May 15, 2026.

## AI Credit Billing (Subscriber-Pays-All Model)

**Architecture:** All AI token usage is tracked and billed to workspaces via centralized metered client.
- **meteredGeminiClient.ts**: Central gateway for all Gemini API calls
- **aiCreditGateway.ts**: Pre-authorization and credit deduction
- **creditManager.ts**: Balance management and tier allocations

**Pricing Model (Jan 2026):**
- 1 credit = $0.01
- Based on Gemini 3 API costs with 4x margin
- Gemini 3 Pro: $2/1M input, $12/1M output (thinking tokens billed at output rate)
- Gemini 3 Flash: $0.50/1M input, $3/1M output

**Credit Costs per Feature:**
| Feature | Credits | Model |
|---------|---------|-------|
| ai_scheduling | 8 | Flash |
| ai_analytics_report | 15 | Pro |
| ai_migration (Vision) | 25 | Pro |
| strategic_schedule_optimization | 20 | Pro |
| ai_chat_query | 3 | Flash |

**Tier Allocations (Monthly):**
- Free: 150 credits (~18 schedules)
- Trial: 500 credits (~62 schedules)
- Starter: 2,000 credits (~250 schedules)
- Professional: 10,000 credits
- Enterprise: 50,000 credits

**Credit-Exempt Features:** Trinity conversations, mascot interactions, guest demos (FREE - tokens used but not charged to encourage engagement).

## Contract Lifecycle Pipeline (Premium Feature)

**Purpose:** End-to-end proposal-to-signature-to-storage system with digital signatures, client portals, document vault, and full audit trails. E-SIGN Act & UETA compliant for court-admissible electronic signatures.

**Database Tables:**
- `client_contract_templates`: Reusable contract templates with field mappings
- `client_contracts`: Proposals, contracts, amendments with full lifecycle tracking
- `client_contract_signatures`: E-signatures with forensic metadata (IP, user agent, geolocation)
- `client_contract_audit_log`: Immutable audit trail for compliance
- `client_contract_access_tokens`: Secure portal access tokens
- `client_contract_attachments`: File attachments for contracts
- `client_contract_pipeline_usage`: Monthly quota tracking per workspace

**API Routes:**
- `GET/POST /api/contracts/templates` - Template CRUD
- `GET/POST /api/contracts` - Contract lifecycle management  
- `GET/POST /api/contracts/:id/signatures` - Signature collection
- `GET /api/contracts/:id/audit-trail` - Audit trail export
- `GET /api/contracts/usage` - Quota usage stats
- `GET /api/contracts/portal/:token` - Public portal access (no auth required)

**Tier-Based Quotas (Monthly):**
| Tier | Quota | Overage Cost |
|------|-------|-------------|
| Starter | 10 contracts | 25 credits each |
| Professional | 50 contracts | 20 credits each |
| Enterprise | Unlimited | N/A |

**Trinity AI Actions (7 new actions):**
- `contracts.get_stats` - Pipeline statistics
- `contracts.get_pending_signatures` - Awaiting signatures
- `contracts.get_expiring` - Expiring within 30 days
- `contracts.get_usage` - Quota status
- `contracts.get_templates` - Available templates
- `contracts.search` - Search by client/title
- `contracts.get_audit_trail` - Audit trail for contract

**Implementation Files:**
- `shared/schema.ts`: Database table definitions
- `shared/billingConfig.ts`: Quota and credit configuration
- `server/services/contracts/contractPipelineService.ts`: Core service
- `server/routes/contractPipelineRoutes.ts`: API endpoints
- `server/services/ai-brain/actionRegistry.ts`: Trinity AI integration

## External Dependencies
- **Stripe**: Payment processing, payroll, and financial integrations.
- **Resend**: Email delivery and notification workflows.
- **Google Gemini (3 Pro Preview, 2.5 Pro/Flash, 1.5 Flash 8B)**: Primary AI Brain intelligence.
- **WebSocket**: Real-time notifications.
- **Google Cloud Storage (GCS)**: File management.
- **PostgreSQL**: Primary relational database.
- **Twilio**: SMS notifications.
- **QuickBooks, Gusto, ADP, Paychex, Zenefits, Rippling, BambooHR, Workday**: Third-party API integrations for HRIS and onboarding.