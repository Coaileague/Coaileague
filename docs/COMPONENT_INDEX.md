# CoAIleague Platform - Component Index

**Last Updated:** 2026-01-11  
**Platform Version:** Trinity 2.0  
**Total Components:** ~400+

---

## Quick Reference

| Category | Count | Location |
|----------|-------|----------|
| UI Primitives | 55 | `client/src/components/ui/` |
| Feature Components | 200+ | `client/src/components/` |
| Pages | 136 | `client/src/pages/` |
| Backend Services | 150+ | `server/services/` |

---

## UI Components (55 total)
**Location:** `client/src/components/ui/`  
**Manifest:** `client/src/components/manifest.json`

### Layout & Container
- `accordion.tsx` - Collapsible content panels
- `card.tsx` - Container with header, content, footer
- `collapsible.tsx` - Simple show/hide container
- `resizable.tsx` - Resizable panel layouts
- `scroll-area.tsx` - Custom scrollable container
- `separator.tsx` - Visual divider
- `sidebar.tsx` - Navigation sidebar (Shadcn)
- `tabs.tsx` - Tab navigation

### Input & Form
- `button.tsx` - All button variants (default, outline, ghost, destructive)
- `calendar.tsx` - Date picker calendar
- `checkbox.tsx` - Checkbox input
- `form.tsx` - Form wrapper with react-hook-form
- `input.tsx` - Text input
- `input-otp.tsx` - OTP verification input
- `label.tsx` - Form label
- `radio-group.tsx` - Radio button group
- `select.tsx` - Dropdown select
- `slider.tsx` - Range slider
- `switch.tsx` - Toggle switch
- `textarea.tsx` - Multi-line text input
- `toggle.tsx` - Toggle button
- `toggle-group.tsx` - Toggle button group

### Overlay & Modal
- `alert-dialog.tsx` - Confirmation dialogs
- `command.tsx` - Command palette (Cmd+K)
- `context-menu.tsx` - Right-click menu
- `dialog.tsx` - Modal dialog (sizes: sm, md, lg, xl, full)
- `drawer.tsx` - Mobile bottom drawer
- `dropdown-menu.tsx` - Dropdown menu
- `hover-card.tsx` - Hover tooltip card
- `popover.tsx` - Floating popover
- `sheet.tsx` - Side panel overlay
- `tooltip.tsx` - Simple tooltip

### Display & Feedback
- `alert.tsx` - Alert messages
- `avatar.tsx` - User avatar with fallback
- `badge.tsx` - Status/tag badges
- `progress.tsx` - Progress bar
- `skeleton.tsx` - Loading placeholder
- `table.tsx` - Data table
- `toast.tsx` / `toaster.tsx` - Toast notifications

### Navigation
- `breadcrumb.tsx` - Breadcrumb navigation
- `menubar.tsx` - Menu bar
- `navigation-menu.tsx` - Top navigation
- `pagination.tsx` - Page navigation

### Branding
- `trinity-arrow-spinner.tsx` - **Trinity Logo** (animated Trinity three-arrow spinner)
- `trinity-animated-logo.tsx` - Animated Trinity logo
- `logo-mark.tsx` - Platform logo mark

---

## Schedule Components (15 total)
**Location:** `client/src/components/schedule/`

| Component | Purpose | Tags |
|-----------|---------|------|
| `CalendarSyncDialog.tsx` | Google/Outlook calendar sync | modal, sync |
| `ConflictAlerts.tsx` | Scheduling conflict warnings | feedback |
| `DayTabs.tsx` | Day navigation tabs | navigation |
| `EmployeeShiftCard.tsx` | Individual shift display | display |
| `ScheduleFilters.tsx` | Filter by client/employee/role | filter |
| `ScheduleGrid.tsx` | Main schedule grid view | layout |
| `ScheduleTemplates.tsx` | Save/load schedule templates | templates |
| `ScheduleToolbar.tsx` | Toolbar with publish, auto-schedule | toolbar |
| `ShiftBottomSheet.tsx` | Mobile shift details | modal, mobile |
| `ShiftDetailModal.tsx` | Desktop shift editor | modal |
| `ShiftDetailSheet.tsx` | Mobile shift editor | modal, mobile |
| `ShiftSwapDrawer.tsx` | Shift swap requests | modal |
| `TrinityInsightsPanel.tsx` | AI scheduling insights | ai |
| `UnassignedShiftsPanel.tsx` | Unassigned shift queue | action |
| `WeekHeader.tsx` | Week date display | display |
| `WeekStatsBar.tsx` | Weekly statistics | stats |

---

## AI Brain Components (10 total)
**Location:** `client/src/components/ai-brain/`

| Component | Purpose |
|-----------|---------|
| `document-extraction-upload.tsx` | AI document parsing upload |
| `FastModeROIDashboard.tsx` | Fast Mode ROI analytics |
| `FastModeStatusWidget.tsx` | Fast Mode status indicator |
| `FastModeSuccessDigest.tsx` | AI success reports |
| `FastModeTierSelector.tsx` | Tier selection (Startup→Enterprise) |
| `FastModeToggle.tsx` | Enable/disable Fast Mode |
| `guardrails-dashboard.tsx` | AI safety guardrails config |
| `issue-detection-viewer.tsx` | AI issue monitoring |
| `migration-review.tsx` | Data migration review |

---

## Chat Components (4 total)
**Location:** `client/src/components/chat/`

- `MacrosDrawer.tsx` - Quick reply templates
- `MessageBubble.tsx` - Chat message display
- `ParticipantDrawer.tsx` - Chat participant list
- `TypingIndicator.tsx` - Real-time typing feedback

---

## Mobile Components (7 total)
**Location:** `client/src/components/mobile/`

- `MobileBottomNav.tsx` - Bottom navigation bar
- `MobileQuickActionsFAB.tsx` - Floating action button menu
- `MobileVoiceCommandOverlay.tsx` - Voice command UI
- `MobileWorkerLayout.tsx` - Worker portal layout
- `PWAInstallPrompt.tsx` - PWA install banner
- `schedule/ApprovalsDrawer.tsx` - Approval requests drawer
- `schedule/ReportsSheet.tsx` - Reports bottom sheet

---

## Pages by Category (136 total)
**Location:** `client/src/pages/`

### Dashboard & Home
- `dashboard.tsx` - Main dashboard
- `manager-dashboard.tsx` - Manager view
- `worker-dashboard.tsx` - Employee view
- `root-admin-dashboard.tsx` - Platform admin

### Scheduling
- `universal-schedule.tsx` - Full schedule view
- `schedule-mobile-first.tsx` - Mobile schedule
- `availability.tsx` - Employee availability
- `unavailability.tsx` - Time off management
- `timesheet-approvals.tsx` - Timesheet review

### Payroll & Finance
- `payroll-dashboard.tsx` - Payroll overview
- `payroll-deductions.tsx` - Deduction management
- `payroll-garnishments.tsx` - Garnishment tracking
- `my-paychecks.tsx` - Employee pay stubs
- `invoices.tsx` - Client invoicing
- `expenses.tsx` - Expense tracking
- `budgeting.tsx` - Budget management

### HR & Employees
- `employees.tsx` - Employee directory
- `hr-benefits.tsx` - Benefits admin
- `hr-pto.tsx` - PTO management
- `hr-reviews.tsx` - Performance reviews
- `hr-terminations.tsx` - Offboarding
- `employee-recognition.tsx` - Recognition program

### AI & Trinity
- `trinity-chat.tsx` - Trinity AI chat interface
- `trinity-command-center.tsx` - AI command center
- `trinity-features.tsx` - Feature management
- `trinity-insights.tsx` - AI insights
- `ai-brain-dashboard.tsx` - AI Brain admin
- `ai-command-center.tsx` - AI orchestration

### Support
- `support.tsx` - Support page with HelpAI
- `support-queue.tsx` - Staff support queue
- `support-chatrooms.tsx` - All chatrooms
- `my-tickets.tsx` - User ticket history
- `support-bug-dashboard.tsx` - Bug tracking

---

## Backend Services (150+ total)
**Location:** `server/services/`

### AI Brain Services
**Location:** `server/services/ai-brain/`
- `aiBrainService.ts` - Core AI orchestration
- `aiBrainMasterOrchestrator.ts` - Multi-agent coordination
- `actionRegistry.ts` - 350+ registered actions
- `platformFeatureRegistry.ts` - Feature tracking
- `cognitiveOnboardingService.ts` - AI onboarding assistant

### Core Services
- `authService.ts` - Authentication
- `payrollService.ts` - Payroll processing
- `emailService.ts` - Resend email integration
- `smsService.ts` - Twilio SMS
- `pushNotificationService.ts` - Push notifications

### Integration Services
- `quickbooksService.ts` - QuickBooks sync
- `hrisIntegrationService.ts` - HRIS providers
- `stripePaymentService.ts` - Stripe payments

### Support Services
- `supportSessionService.ts` - 1-on-1 support chat
- `helpAIOrchestrator.ts` - HelpAI routing
- `whatsNewService.ts` - Feature announcements

---

## Naming Conventions

| Type | Convention | Example |
|------|------------|---------|
| Components | PascalCase + Type | `ShiftModal.tsx`, `ScheduleTable.tsx` |
| Pages | kebab-case | `schedule-mobile-first.tsx` |
| Services | camelCase + Service | `payrollService.ts` |
| Hooks | use + camelCase | `useSchedule.ts` |

---

## Dialog Size Guide

```tsx
<DialogContent size="sm">  // 22rem - Simple confirmations
<DialogContent size="md">  // 26rem - Forms, settings
<DialogContent size="lg">  // 32rem - Multi-step forms
<DialogContent size="xl">  // 42rem - Complex editors
<DialogContent size="full"> // 56rem - Full dashboards
```

---

## Trinity Branding

**Official Logo:** `TrinityArrowSpinner` (animated Trinity three-arrow spinner)  
**Location:** `client/src/components/ui/trinity-arrow-spinner.tsx`  
**Colors:** Purple (#a855f7), Teal (#14b8a6), Gold (#f59e0b)

**Usage:**
```tsx
import { TrinityArrowSpinner } from "@/components/ui/trinity-arrow-spinner";
<TrinityArrowSpinner size="lg" animated state="thinking" />
```

---

## Related Documentation

- `TRINITY_CAPABILITY_MATRIX.md` - AI capabilities
- `TRINITY_FINANCIAL_CORE_V1_SIGNOFF.md` - Financial features
- `QUICKBOOKS_ONBOARDING_AUDIT.md` - QuickBooks integration
- `replit.md` - Platform architecture overview
