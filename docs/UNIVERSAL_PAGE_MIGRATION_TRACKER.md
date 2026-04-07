# Universal Page Migration Tracker

## Goal: 100% Universal Page Coverage for Android Capacitor Mobile App

**Last Updated:** January 17, 2026  
**Total Pages:** 148  
**Migrated:** 144 (97%)  
**Remaining:** 4 (3%) - specialized layouts preserved intentionally

---

## Migration Tiers

| Tier | Description | Priority | Count |
|------|-------------|----------|-------|
| **T1 - Essential** | Field worker daily operations - full mobile UI | HIGH | 25 |
| **T2 - Important** | Manager/HR/Payroll functions - simplified mobile | MEDIUM | 45 |
| **T3 - Admin** | Admin/analytics/settings - responsive fallback | LOW | 78 |

---

## Status Legend

- ✅ **DONE** - Fully universal with MobilePageWrapper/UniversalPageWrapper
- 🔄 **PARTIAL** - Has useIsMobile but custom layout
- ⏳ **PENDING** - Needs migration
- 🚫 **DESKTOP-ONLY** - Will show mobile notice/redirect

---

## TIER 1: ESSENTIAL (Field Worker Daily Ops)

| Page | File | Status | Notes |
|------|------|--------|-------|
| Dashboard | dashboard.tsx | ✅ DONE | UniversalPageWrapper with mobile layout |
| Field Reports | field-reports.tsx | ✅ DONE | MobilePageWrapper |
| My Team | my-team.tsx | ✅ DONE | MobilePageWrapper |
| Time Tracking | time-tracking.tsx | ✅ DONE | UniversalPageWrapper with mobile layout |
| Safety Check | safety-check.tsx | ✅ DONE | MobilePageWrapper |
| Worker Dashboard | worker-dashboard.tsx | ✅ DONE | MobilePageWrapper |
| Worker Incidents | worker-incidents.tsx | ✅ DONE | MobilePageWrapper |
| Schedule Mobile | schedule-mobile-first.tsx | ✅ DONE | UniversalPageWrapper |
| Availability | availability.tsx | ✅ DONE | UniversalPageWrapper |
| Unavailability | unavailability.tsx | ✅ DONE | UniversalPageWrapper |
| Employee Profile | employee-profile.tsx | ✅ DONE | UniversalPageWrapper |
| My Paychecks | my-paychecks.tsx | ✅ DONE | UniversalPageWrapper |
| My Tickets | my-tickets.tsx | ✅ DONE | UniversalPageWrapper |
| Inbox | inbox.tsx | ✅ DONE | UniversalPageWrapper with mobile layout |
| Private Messages | private-messages.tsx | ✅ DONE | UniversalPageWrapper |
| Chatrooms | chatrooms.tsx | ✅ DONE | UniversalPageWrapper with mobile layout |
| Expenses | expenses.tsx | ✅ DONE | UniversalPageWrapper |
| Employee Portal | employee-portal.tsx | ✅ DONE | UniversalPageWrapper |
| Mobile Hub | mobile-hub.tsx | ✅ DONE | UniversalPageWrapper |
| HR PTO | hr-pto.tsx | ✅ DONE | MobilePageWrapper |
| Approvals Hub | approvals-hub.tsx | ✅ DONE | MobilePageWrapper |
| Expense Approvals | expense-approvals.tsx | ✅ DONE | MobilePageWrapper |
| Workflow Approvals | workflow-approvals.tsx | ✅ DONE | UniversalPageWrapper |
| Unified Inbox | unified-inbox.tsx | ✅ DONE | UniversalPageWrapper |
| Help | help.tsx | ✅ DONE | UniversalPageWrapper |

---

## TIER 2: IMPORTANT (Manager/HR/Payroll)

| Page | File | Status | Notes |
|------|------|--------|-------|
| Employees | employees.tsx | ✅ DONE | UniversalPageWrapper |
| Settings | settings.tsx | ✅ DONE | UniversalPageWrapper |
| Team Schedule | team-schedule.tsx | ✅ DONE | Redirect only |
| Universal Schedule | universal-schedule.tsx | ✅ DONE | UniversalPageWrapper |
| Timesheet Approvals | timesheet-approvals.tsx | ✅ DONE | UniversalPageWrapper |
| Pending Time Entries | pending-time-entries.tsx | ✅ DONE | UniversalPageWrapper |
| Manager Dashboard | manager-dashboard.tsx | ✅ DONE | UniversalPageWrapper |
| Leaders Hub | leaders-hub.tsx | ✅ DONE | UniversalPageWrapper |
| Payroll Dashboard | payroll-dashboard.tsx | ✅ DONE | UniversalPageWrapper |
| Payroll Deductions | payroll-deductions.tsx | ✅ DONE | UniversalPageWrapper |
| Payroll Garnishments | payroll-garnishments.tsx | ✅ DONE | UniversalPageWrapper |
| HR Benefits | hr-benefits.tsx | ✅ DONE | UniversalPageWrapper |
| HR Reviews | hr-reviews.tsx | ✅ DONE | UniversalPageWrapper |
| HR Terminations | hr-terminations.tsx | ✅ DONE | UniversalPageWrapper |
| Invoices | invoices.tsx | ✅ DONE | UniversalPageWrapper |
| Clients | clients.tsx | ✅ DONE | UniversalPageWrapper |
| Disputes | disputes.tsx | ✅ DONE | UniversalPageWrapper |
| Review Disputes | review-disputes.tsx | ✅ DONE | UniversalPageWrapper |
| File Grievance | file-grievance.tsx | ✅ DONE | UniversalPageWrapper |
| Document Library | document-library.tsx | ✅ DONE | UniversalPageWrapper |
| Employee File Cabinet | employee-file-cabinet.tsx | ✅ DONE | UniversalPageWrapper |
| Records | records.tsx | ✅ DONE | UniversalPageWrapper |
| Reports | reports.tsx | ✅ DONE | UniversalPageWrapper |
| Company Reports | company-reports.tsx | ✅ DONE | UniversalPageWrapper |
| Compliance Reports | compliance-reports.tsx | ✅ DONE | UniversalPageWrapper |
| Analytics Reports | analytics-reports.tsx | ✅ DONE | UniversalPageWrapper |
| Onboarding | onboarding.tsx | ✅ DONE | UniversalPageWrapper |
| Onboarding Start | onboarding-start.tsx | ✅ DONE | UniversalPageWrapper |
| Workspace Onboarding | workspace-onboarding.tsx | ✅ DONE | UniversalPageWrapper |
| Assisted Onboarding | assisted-onboarding.tsx | ✅ DONE | UniversalPageWrapper |
| Training OS | training-os.tsx | ✅ DONE | UniversalPageWrapper |
| Employee Recognition | employee-recognition.tsx | ✅ DONE | UniversalPageWrapper |
| Engagement Dashboard | engagement-dashboard.tsx | ✅ DONE | UniversalPageWrapper |
| Engagement Employee | engagement-employee.tsx | ✅ DONE | UniversalPageWrapper |
| Insights | insights.tsx | ✅ DONE | UniversalPageWrapper |
| Owner Analytics | owner-analytics.tsx | ✅ DONE | UniversalPageWrapper |
| I9 Compliance | i9-compliance.tsx | ✅ DONE | UniversalPageWrapper |
| Billing | billing.tsx | ✅ DONE | UniversalPageWrapper |
| Budgeting | budgeting.tsx | ✅ DONE | UniversalPageWrapper |
| Policies | policies.tsx | ✅ DONE | UniversalPageWrapper |
| Templates | templates.tsx | ✅ DONE | UniversalPageWrapper |
| Flex Staffing | flex-staffing.tsx | ✅ DONE | UniversalPageWrapper |
| Client Portal | client-portal.tsx | ✅ DONE | UniversalPageWrapper |
| Pay Invoice | pay-invoice.tsx | ✅ DONE | UniversalPageWrapper |
| Accept Handoff | accept-handoff.tsx | ✅ DONE | UniversalPageWrapper |

---

## TIER 3: ADMIN/ANALYTICS (Lower Priority)

| Page | File | Status | Notes |
|------|------|--------|-------|
| Command Center | command-center.tsx | ✅ DONE | UniversalPageWrapper |
| HelpDesk | HelpDesk.tsx | 🚫 SPECIALIZED | Custom chat layout preserved |
| Analytics | analytics.tsx | ✅ DONE | UniversalPageWrapper |
| AI Brain Dashboard | ai-brain-dashboard.tsx | ✅ DONE | UniversalPageWrapper |
| AI Command Center | ai-command-center.tsx | ✅ DONE | UniversalPageWrapper |
| AI Integrations | ai-integrations.tsx | ✅ DONE | UniversalPageWrapper |
| AI Audit Log Viewer | ai-audit-log-viewer.tsx | ✅ DONE | UniversalPageWrapper |
| Trinity Chat | trinity-chat.tsx | ✅ DONE | UniversalPageWrapper |
| Trinity Command Center | trinity-command-center.tsx | ✅ DONE | UniversalPageWrapper |
| Trinity Features | trinity-features.tsx | ✅ DONE | UniversalPageWrapper |
| Trinity Insights | trinity-insights.tsx | ✅ DONE | UniversalPageWrapper |
| Trinity Self Edit | trinity-self-edit-governance.tsx | ✅ DONE | UniversalPageWrapper |
| Diagnostics | diagnostics.tsx | ✅ DONE | UniversalPageWrapper |
| System Health | system-health.tsx | ✅ DONE | UniversalPageWrapper |
| Infrastructure | infrastructure.tsx | ✅ DONE | UniversalPageWrapper |
| Alert Configuration | alert-configuration.tsx | ✅ DONE | UniversalPageWrapper |
| Alert Settings | alert-settings.tsx | ✅ DONE | UniversalPageWrapper |
| Automation Control | automation-control.tsx | ✅ DONE | UniversalPageWrapper |
| Automation Settings | automation-settings.tsx | ✅ DONE | UniversalPageWrapper |
| Automation Audit Log | automation-audit-log.tsx | ✅ DONE | UniversalPageWrapper |
| Platform Admin | platform-admin.tsx | ✅ DONE | UniversalPageWrapper |
| Platform Users | platform-users.tsx | ✅ DONE | UniversalPageWrapper |
| Org Management | org-management.tsx | ✅ DONE | UniversalPageWrapper |
| Role Management | role-management.tsx | ✅ DONE | UniversalPageWrapper |
| Audit Logs | audit-logs.tsx | ✅ DONE | UniversalPageWrapper |
| My Audit Record | my-audit-record.tsx | ✅ DONE | UniversalPageWrapper |
| Auditor Portal | auditor-portal.tsx | ✅ DONE | UniversalPageWrapper |
| Oversight Hub | oversight-hub.tsx | ✅ DONE | UniversalPageWrapper |
| Resolution Inbox | resolution-inbox.tsx | ✅ DONE | UniversalPageWrapper |
| Admin Banners | admin-banners.tsx | ✅ DONE | UniversalPageWrapper |
| Admin Custom Forms | admin-custom-forms.tsx | ✅ DONE | UniversalPageWrapper |
| Admin Ticket Reviews | admin-ticket-reviews.tsx | ✅ DONE | UniversalPageWrapper |
| Admin Usage | admin-usage.tsx | ✅ DONE | UniversalPageWrapper |
| Usage Dashboard | usage-dashboard.tsx | ✅ DONE | UniversalPageWrapper |
| Credit Analytics | credit-analytics-dashboard.tsx | ✅ DONE | UniversalPageWrapper |
| Integrations Page | integrations-page.tsx | ✅ DONE | UniversalPageWrapper |
| Accounting Integrations | accounting-integrations.tsx | ✅ DONE | UniversalPageWrapper |
| QuickBooks Import | quickbooks-import.tsx | ✅ DONE | UniversalPageWrapper |
| Orchestration Dashboard | orchestration-dashboard.tsx | ✅ DONE | UniversalPageWrapper |
| HelpAI Orchestration | helpai-orchestration.tsx | ✅ DONE | UniversalPageWrapper |
| HireOS Workflow Builder | hireos-workflow-builder.tsx | ✅ DONE | UniversalPageWrapper |
| Financial Intelligence | financial-intelligence.tsx | ✅ DONE | UniversalPageWrapper |
| Sales CRM | sales-crm.tsx | ✅ DONE | UniversalPageWrapper |
| Workspace Sales | workspace-sales.tsx | ✅ DONE | UniversalPageWrapper |
| Workspace | workspace.tsx | ✅ DONE | UniversalPageWrapper |
| Create Org | create-org.tsx | ✅ DONE | UniversalPageWrapper |
| Communications Onboarding | communications-onboarding.tsx | ✅ DONE | UniversalPageWrapper |
| Support | support.tsx | ✅ DONE | UniversalPageWrapper |
| Support Queue | support-queue.tsx | ✅ DONE | UniversalPageWrapper |
| Support Chatrooms | support-chatrooms.tsx | ✅ DONE | UniversalPageWrapper |
| Support AI Console | support-ai-console.tsx | ✅ DONE | UniversalPageWrapper |
| Support Bug Dashboard | support-bug-dashboard.tsx | ✅ DONE | UniversalPageWrapper |
| Support Command Console | support-command-console.tsx | ✅ DONE | UniversalPageWrapper |
| Root Admin Dashboard | root-admin-dashboard.tsx | ✅ DONE | UniversalPageWrapper |
| End User Controls | end-user-controls.tsx | ✅ DONE | UniversalPageWrapper |
| External Email | external-email.tsx | ✅ DONE | UniversalPageWrapper |
| Updates | updates.tsx | ✅ DONE | UniversalPageWrapper |
| Status | status.tsx | ✅ DONE | UniversalPageWrapper |

---

## PUBLIC/AUTH PAGES (Already Responsive)

| Page | File | Status | Notes |
|------|------|--------|-------|
| Homepage | homepage.tsx | ✅ DONE | Already responsive |
| Login | custom-login.tsx | ✅ DONE | Already responsive |
| Register | custom-register.tsx | ✅ DONE | Already responsive |
| Forgot Password | forgot-password.tsx | ✅ DONE | Already responsive |
| Reset Password | reset-password.tsx | ✅ DONE | Already responsive |
| Contact | contact.tsx | ✅ DONE | Already responsive |
| Compare | compare.tsx | ✅ DONE | Already responsive |
| Universal Marketing | universal-marketing.tsx | ✅ DONE | Already responsive |
| ROI Calculator | roi-calculator.tsx | ✅ DONE | Already responsive |
| Privacy Policy | privacy-policy.tsx | ✅ DONE | Already responsive |
| Terms of Service | terms-of-service.tsx | ✅ DONE | Already responsive |
| Profile (redirect) | profile.tsx | ✅ DONE | Just a redirect |
| Not Found | not-found.tsx | ✅ DONE | Error page |
| Error 403 | error-403.tsx | ✅ DONE | Error page |
| Error 404 | error-404.tsx | ✅ DONE | Error page |
| Error 500 | error-500.tsx | ✅ DONE | Error page |

---

## CATEGORY PAGES (Navigation Helpers)

| Page | File | Status | Notes |
|------|------|--------|-------|
| Category Communication | category-communication.tsx | ✅ DONE | UniversalPageWrapper |
| Category Growth | category-growth.tsx | ✅ DONE | UniversalPageWrapper |
| Category Operations | category-operations.tsx | ✅ DONE | UniversalPageWrapper |
| Category Platform | category-platform.tsx | ✅ DONE | UniversalPageWrapper |

---

## Migration Strategy

### Phase 1: T1 Essential Pages (Week 1)
Convert all 25 T1 pages to use UniversalPageWrapper

### Phase 2: T2 Important Pages (Week 2-3)
Convert 45 T2 pages with simplified mobile layouts

### Phase 3: T3 Admin Pages (Week 4+)
Add responsive fallback to remaining pages

---

## Commands

```bash
# Check migration progress
grep -l "UniversalPageWrapper\|MobilePageWrapper" client/src/pages/*.tsx | wc -l

# Find pages still needing migration
grep -L "useIsMobile\|MobilePageWrapper\|UniversalPageWrapper" client/src/pages/*.tsx
```
