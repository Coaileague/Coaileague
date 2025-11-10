# AutoForce™ Compact Design Inventory

**Created:** November 10, 2025  
**Purpose:** Identify pages needing compact mobile design and desktop table optimization

## Table-Heavy Pages (Ranked by Complexity)

### High Priority (80+ Table Elements)
1. **analytics-reports.tsx** (82 matches)
   - Multi-tab reporting interface (billable, payroll, client, activity, audit)
   - Date range filters
   - Export functionality (tier-gated)
   - **Redundancy Risk:** Summary stats likely duplicated in first table columns

### Medium-High Priority (40-65 Table Elements)
2. **invoices.tsx** (64 matches) - Invoice listing and management
3. **auditor-portal.tsx** (53 matches) - Audit trail viewing
4. **leaders-hub.tsx** (51 matches) - Leadership dashboard with metrics
5. **payroll-dashboard.tsx** (46 matches) - Payroll processing interface
6. **my-audit-record.tsx** (42 matches) - Personal audit history

### Medium Priority (29-31 Table Elements)
7. **client-portal.tsx** (31 matches) - Client-facing data
8. **my-paychecks.tsx** (29 matches) - Employee paycheck history
9. **review-disputes.tsx** (29 matches) - Dispute resolution interface
10. **comm-os.tsx** (29 matches) - Communications dashboard

## Pages with Summary Cards + Detailed Lists

### Dashboard Pattern (Summary + Notifications/Details)
- **dashboard.tsx** - Summary cards (employees, active, revenue) + notification list
- **employee-portal.tsx** - Summary cards + shifts/time entries
- **sales-portal.tsx** - Summary cards (pipeline, deals, RFPs, leads) + tabbed views
- **hr-benefits.tsx** - Summary cards (enrolled, costs) + enrollment lists
- **hr-terminations.tsx** - Summary cards + termination lists
- **reports.tsx** - Summary cards + detailed report tables

### Identified Redundancy Patterns

**Pattern 1: Status Duplication**
- Status badge + status text column in same table
- Color-coded indicators + text labels repeating same info

**Pattern 2: Calculated Field Duplication**
- Summary card shows total → Table first column shows same total
- Aggregated metrics in cards → Repeated in table footer

**Pattern 3: Desktop-Only Metadata**
- Created/Updated timestamps (low priority on mobile)
- Internal IDs/Reference numbers (staff-only, hide on mobile)
- Audit trail columns (move to accordion on mobile)

**Pattern 4: Multi-Level Grouping**
- Nested category → subcategory → item (flatten on mobile)
- Department → Team → Employee (progressive disclosure needed)

## Architect Recommendations Summary

### Mobile Strategy
1. **Create MobileCompactLayout component**
   - Standardized spacing with `.fluid-*` utilities
   - 48px touch targets enforced
   - Sticky header/bottom CTA slots

2. **Responsive Table Transformer**
   - Desktop: Keep shadcn `<Table>` with column priority metadata
   - Mobile (<1024px): Collapse to `DataSummaryCard` list
   - Low-priority columns move into `<Accordion>` details

3. **Avoid**
   - Native `<details>/<summary>` (use shadcn Accordion)
   - Horizontal carousels for tabular data >3 cards

### Desktop Optimization Strategy
1. **Split page layout:**
   - Summary insight band (cards/charts) at top
   - Compact data grid with column toggle controls
   - Contextual filters in collapsible side drawer

2. **Column Toggle System:**
   - Define column priorities (P1: always visible, P2: default hidden, P3: opt-in)
   - Persona presets (Manager view, Auditor view, Executive view)
   - Remember user preferences per page

3. **Pagination & Virtual Scrolling:**
   - Replace "load more" with proper pagination
   - Consider virtual scrolling for 100+ rows
   - Sticky table headers for long datasets

## Implementation Plan

### Phase 1: Foundation (Current Task)
- ✅ Inventory completed
- 🔄 Create `client/src/lib/responsive-utils.ts`
- 🔄 Add compact CSS utilities to `responsive.css`
- 🔄 Build `MobileCompactLayout` component
- 🔄 Build `ResponsiveTableProvider` + `DataSummaryCard`

### Phase 2: Pilot (2 Pages)
- 🔄 Refactor `dashboard.tsx` - Split summary + compact table
- 🔄 Refactor `payroll-dashboard.tsx` - Responsive table with priority columns
- 🔄 Get architect approval on pilots

### Phase 3: Rollout (Remaining Pages)
- High priority: analytics-reports, invoices, auditor-portal
- Medium priority: leaders-hub, client-portal, my-paychecks
- Low priority: review-disputes, comm-os, my-audit-record

## Metrics to Track
- Mobile scroll depth (target: <3 screens for key info)
- Desktop table scroll (target: reduce by 50%)
- Mobile task completion rates
- Column toggle usage patterns
