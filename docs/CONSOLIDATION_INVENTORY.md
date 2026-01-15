# CoAIleague Consolidation Inventory
Generated: January 2026

## Analytics Services Consolidation

### Current State: 8 Overlapping Services

| Service | Size | Lines | Purpose | Overlap |
|---------|------|-------|---------|---------|
| analyticsDataService.ts | 2.5KB | 92 | Basic summary (employees, shifts, hours) | HIGH - subset of advancedAnalytics |
| analyticsAIService.ts | 13.9KB | 422 | AI-powered insights, anomalies, forecasts | MEDIUM - uses advancedAnalytics |
| advancedAnalyticsService.ts | 24.3KB | 726 | Core metrics (dashboard, time, scheduling, revenue) | PRIMARY - most comprehensive |
| businessOwnerAnalyticsService.ts | 24.6KB | 758 | Executive usage, feature adoption, costs | LOW - different domain (usage vs ops) |
| advancedUsageAnalyticsService.ts | 14.4KB | ~400 | Usage analytics, AI task tracking | MEDIUM - overlaps with businessOwner |
| analyticsStats.ts | 9.2KB | 258 | Stats calculations, cache management | HIGH - utility functions |
| roomAnalyticsService.ts | 24.5KB | 714 | Chat room analytics, engagement | LOW - separate domain |
| aiAnalyticsEngine.ts | ~30KB | 868 | AI brain analytics, model routing | LOW - AI brain specific |

### Consolidation Plan

**Phase 1: Merge High-Overlap Services**
1. ✅ Merge `analyticsDataService` → `advancedAnalyticsService` (subset functionality)
2. ✅ Integrate `analyticsStats` → utility module within advancedAnalytics
3. ✅ Keep `analyticsAIService` but make it a thin wrapper calling unified service

**Phase 2: Create Unified Modules**
- **CoreAnalyticsService** - Operational analytics (scheduling, time, revenue, performance)
- **UsageAnalyticsService** - Platform usage analytics (feature adoption, AI usage, costs)
- **DomainAnalyticsServices** - Keep domain-specific (rooms, ai-brain) separate

### Result: 8 → 4 Analytics Modules
1. `coreAnalyticsService.ts` - Merged operational analytics
2. `usageAnalyticsService.ts` - Merged usage analytics  
3. `roomAnalyticsService.ts` - Unchanged (domain-specific)
4. `aiAnalyticsEngine.ts` - Unchanged (ai-brain specific)

---

## Schema Optimization

### Current State: 180 Enums, 483 Tables

**Duplicate Status Enum Patterns:**
Many enums share identical values: `['pending', 'active', 'completed', 'cancelled']`

| Pattern | Duplicate Enums | Values |
|---------|----------------|--------|
| Generic Status | 15+ enums | pending, active, completed, cancelled |
| Document Status | 8+ enums | draft, sent, paid, overdue, cancelled |
| Request Status | 10+ enums | pending, approved, rejected, cancelled, expired |
| Type Enums | 20+ enums | Domain-specific but could share base |

**Sample Duplicates Found:**
- `benefitStatusEnum`: pending, active, expired, cancelled
- `ptoStatusEnum`: pending, approved, denied, cancelled
- `terminationStatusEnum`: pending, in_progress, completed
- `shiftStatusEnum`: draft, published, scheduled, in_progress, completed, cancelled
- `invoiceStatusEnum`: draft, sent, paid, overdue, cancelled
- `swapRequestStatusEnum`: pending, approved, rejected, cancelled, expired

### Schema Optimization Plan

**Phase 1: Create Shared Base Enums** ✅ COMPLETED
Created `shared/schemaEnums.ts` with:
1. `sharedGenericStatusEnum` - universal: pending, active, completed, cancelled
2. `sharedApprovalStatusEnum` - workflows: pending, approved, rejected, cancelled, expired
3. `sharedDocumentStatusEnum` - documents: draft, sent, viewed, signed, expired, cancelled
4. `sharedPaymentStatusEnum` - payments: pending, processing, paid, failed, refunded, cancelled
5. `sharedTaskStatusEnum` - tasks: queued, in_progress, completed, failed, cancelled, retrying
6. `sharedPriorityEnum` - priority: low, medium, high, urgent, critical
7. `sharedSeverityEnum` - severity: info, warning, error, critical

**Phase 2: Gradual Migration (Non-Breaking)**
- ✅ Added shared enums for NEW tables (see schemaEnums.ts)
- ✅ Documented which existing enums could migrate later
- ✅ DO NOT change existing tables (avoid migrations)

### Risk Assessment
- ⚠️ HIGH RISK: Changing existing enum types breaks migrations
- ✅ LOW RISK: Adding new shared enums for future tables ✅ DONE
- ✅ LOW RISK: Documenting for future refactor ✅ DONE

---

## Consolidation Safety Rules

1. **Never change existing table column types** - Breaks migrations
2. **Never drop existing enums in use** - Breaks data integrity
3. **Add new code, deprecate old** - Gradual migration pattern
4. **Re-export from consolidated modules** - Maintains backwards compatibility
5. **Test health after each change** - Verify 8/8 services operational
