# 🚀 AutoForce™ Migration Guide - Phase 2: API & Navigation Centralization

## Overview
This guide provides **exact patterns** for migrating the remaining **58+ files** from hardcoded API endpoints and navigation to centralized config system.

**Time Estimate**: ~1-2 hours total (can be parallelized across team)

---

## ✅ COMPLETED IN PHASE 1

### Config System Ready ✓
- `navigationConfig.ts` - 150+ routes centralized
- `queryKeys.ts` - All cache keys centralized  
- `apiClient.ts` - Centralized API request handler
- `configManager.ts` - Type-safe config accessor

### Components Migrated ✓
- setup-2fa.tsx
- demo-banner.tsx
- protected-route.tsx
- help-dropdown.tsx
- ErrorBoundary.tsx
- notifications-center.tsx
- app-sidebar.tsx (feedback, whats-new)

---

## 🔴 REMAINING: 58+ Pages with Hardcoded Endpoints

### List of Files to Migrate
```
client/src/pages/
├── onboarding/
│   ├── document-upload-step.tsx
│   ├── contracts-step.tsx
│   └── index.tsx
├── sales-portal.tsx
├── hr-terminations.tsx
├── hr-pto.tsx
├── hr-benefits.tsx
├── platform-users.tsx
├── hr-reviews.tsx
├── file-grievance.tsx
├── review-disputes.tsx
├── shift-approvals.tsx
├── timesheet-approvals.tsx
├── timeoff-approvals.tsx
├── policies.tsx
├── pay-invoice.tsx
├── custom-register.tsx
├── integrations-page.tsx
├── oversight-hub.tsx
├── company-reports.tsx
└── [20+ more pages]
```

---

## 📋 MIGRATION PATTERN 1: Hardcoded `/api/` Endpoints

### BEFORE (Old Pattern)
```typescript
// ❌ Hardcoded endpoint
const { data: employees } = useQuery({
  queryKey: ['/api/employees'],  // Hardcoded
});

const mutation = useMutation({
  mutationFn: (data) => fetch('/api/employees/create', {
    method: 'POST',
    body: JSON.stringify(data)
  })
});
```

### AFTER (New Pattern)
```typescript
// ✅ Centralized endpoint
import { apiGet, apiPost } from '@/lib/apiClient';
import { queryKeys } from '@/config/queryKeys';

const { data: employees } = useQuery({
  queryKey: queryKeys.employees.all,  // Centralized
  queryFn: () => apiGet('employees.list'),  // Centralized
});

const mutation = useMutation({
  mutationFn: (data) => apiPost('employees.create', data),  // Centralized
  onSuccess: () => {
    queryClient.invalidateQueries({ queryKey: queryKeys.employees.all });
  }
});
```

### HOW TO MIGRATE
1. Find hardcoded `/api/` endpoint in page
2. Identify the action (list, create, update, delete)
3. Check `apiEndpoints.ts` for the mapping (e.g., `employees.list` → `/api/employees`)
4. Check `queryKeys.ts` for the cache key
5. Replace `fetch()` with `apiGet()` or `apiPost()`
6. Replace hardcoded `queryKey` with `queryKeys.*`

---

## 📋 MIGRATION PATTERN 2: Hardcoded `setLocation()` Navigation

### BEFORE (Old Pattern)
```typescript
// ❌ Hardcoded routes
const [, setLocation] = useLocation();

onClick={() => setLocation('/disputes')}
onClick={() => setLocation('/my-audit-record')}
onClick={() => setLocation('/error-403')}
```

### AFTER (New Pattern)
```typescript
// ✅ Centralized routes
import { navConfig } from '@/config/navigationConfig';

onClick={() => setLocation(navConfig.app.disputes)}
onClick={() => setLocation(navConfig.app.myAuditRecord)}
onClick={() => setLocation(navConfig.error.forbidden)}
```

### ROUTES TO ADD TO `navigationConfig.ts`
```typescript
app: {
  myAuditRecord: "/my-audit-record",  // ADD
  // ... existing routes ...
},
error: {
  forbidden: "/error-403",  // ADD
  // ... existing error routes ...
}
```

### HOW TO MIGRATE
1. Find all `setLocation('...')` calls in file
2. Determine if route exists in `navigationConfig.ts`
3. If not, add it to appropriate section
4. Replace hardcoded string with `navConfig.*.*`

---

## 🔑 ADDING MISSING `queryKeys`

### For Support Tickets
```typescript
// client/src/config/queryKeys.ts - ADD TO support SECTION
support: {
  tickets: ["support", "tickets"],
  ticket: (id: string) => ["support", "tickets", id],
  ticketChat: (id: string) => ["support", "tickets", id, "chat"],
},
```

### For Integrations
```typescript
// client/src/config/queryKeys.ts - ADD TO integrations SECTION
integrations: {
  list: ["integrations"],
  status: (integration: string) => ["integrations", "status", integration],
  oauth: (provider: string) => ["integrations", "oauth", provider],
},
```

### For Billing
```typescript
// client/src/config/queryKeys.ts - ADD TO billing SECTION
billing: {
  subscriptions: ["billing", "subscriptions"],
  credits: ["billing", "credits"],
  invoices: ["billing", "invoices"],
},
```

---

## 🛣️ ADDING MISSING ROUTES

### New Routes to Add to `navigationConfig.ts`
```typescript
// Support & Incidents
support: {
  tickets: "/support/tickets",
  ticket: (id: string) => `/support/tickets/${id}`,
  incidents: "/support/incidents",
},

// Integrations (OAuth flows)
integrations: {
  quickbooks: "/integrations/quickbooks",
  gusto: "/integrations/gusto",
  slack: "/integrations/slack",
  oauth: (provider: string) => `/integrations/${provider}/callback`,
},

// AI Workflows (missing)
ai: {
  scheduling: "/ai/scheduling",
  sentiment: "/ai/sentiment",
  analytics: "/ai/analytics",
  matching: "/ai/matching",
},

// Missing app routes
app: {
  myAuditRecord: "/my-audit-record",
  disputes: "/disputes",
},
```

---

## 🎯 BATCH MIGRATION EXAMPLE

### File: `client/src/pages/file-grievance.tsx`

**BEFORE:**
```typescript
const [, setLocation] = useLocation();

// Multiple hardcoded API calls
useQuery({ queryKey: ['/api/grievances'] })
useMutation({ 
  mutationFn: () => fetch('/api/grievances/file', { method: 'POST' })
})

// Hardcoded navigation
onClick={() => setLocation('/disputes')}
onClick={() => setLocation('/my-audit-record')}
```

**AFTER:**
```typescript
import { navConfig } from '@/config/navigationConfig';
import { apiGet, apiPost } from '@/lib/apiClient';
import { queryKeys } from '@/config/queryKeys';

// Centralized API calls
useQuery({ 
  queryKey: queryKeys.grievances.all,
  queryFn: () => apiGet('grievances.list')
})
useMutation({ 
  mutationFn: () => apiPost('grievances.file', data),
  onSuccess: () => {
    queryClient.invalidateQueries({ queryKey: queryKeys.grievances.all });
  }
})

// Centralized navigation
onClick={() => setLocation(navConfig.app.disputes)}
onClick={() => setLocation(navConfig.app.myAuditRecord)}
```

---

## ✔️ MIGRATION CHECKLIST

For each file, verify:
- [ ] All `/api/` endpoints replaced with `apiClient()` functions
- [ ] All hardcoded `queryKey` arrays replaced with `queryKeys.*`
- [ ] All hardcoded `setLocation()` calls replaced with `navConfig.*`
- [ ] All new `queryKey` entries added to `queryKeys.ts`
- [ ] All new routes added to `navigationConfig.ts`
- [ ] Imports added: `apiGet/apiPost`, `queryKeys`, `navConfig`
- [ ] `queryClient.invalidateQueries()` uses `queryKeys.*` (not hardcoded arrays)
- [ ] No `// TODO` comments left in the file

---

## 🚀 PRIORITY ORDER FOR MIGRATION

### TIER 1 (Highest Impact) - 10 Files
1. sales-portal.tsx
2. dashboard.tsx
3. employees.tsx
4. shifts.tsx
5. time-tracking.tsx
6. payroll.tsx
7. invoices.tsx
8. support-tickets.tsx
9. chat.tsx
10. settings.tsx

### TIER 2 (Medium Impact) - 20 Files
- HR modules (pto, benefits, reviews, terminations)
- Approval workflows (shift, timesheet, timeoff)
- Admin pages (platform-users, oversight-hub)

### TIER 3 (Lower Impact) - 28 Files
- Onboarding flows
- Report pages
- Specialty pages (policies, integrations)

---

## 🔧 AUTOMATED MIGRATION SCRIPT

To run a bulk find-replace (test first!):

```bash
# Find all files with hardcoded /api/ endpoints
grep -r "queryKey.*\[.*\/api" client/src/pages --include="*.tsx" -l

# Find all files with hardcoded setLocation strings
grep -r "setLocation.*'\/[a-zA-Z]" client/src/pages --include="*.tsx" -l

# Find all files with hardcoded fetch calls
grep -r "fetch.*'\/api" client/src/pages --include="*.tsx" -l
```

---

## 📚 REFERENCES

### Config Files
- `client/src/config/navigationConfig.ts` - 150+ routes
- `client/src/config/queryKeys.ts` - All cache keys
- `client/src/lib/apiClient.ts` - Centralized API client
- `client/src/lib/configManager.ts` - Config service

### Helpers
- `import { apiGet, apiPost, apiPatch, apiDelete } from '@/lib/apiClient'`
- `import { queryKeys } from '@/config/queryKeys'`
- `import { navConfig } from '@/config/navigationConfig'`
- `import { configManager } from '@/lib/configManager'`

---

## 🎓 CORE PRINCIPLE

> **"Edit ONE config file, propagates everywhere instantly"**

When you need to change:
- A route: Edit `navigationConfig.ts`
- An API endpoint: Edit `apiEndpoints.ts` 
- A cache key: Edit `queryKeys.ts`
- A feature flag: Edit `featureToggles.ts`

That change automatically applies to ALL 58+ pages using the config system.

---

## 📊 PROGRESS TRACKING

**Phase 1 (Complete)**: Core config system + 7 components migrated
**Phase 2 (Ready)**: 58+ pages ready for migration (pattern proven)
**Phase 3 (Future)**: Backend API standardization + error handling

**Estimated Total Time**: 1-2 hours (if parallelized)
**ROI**: Zero hardcoded values = 100% centralized, editable configuration

