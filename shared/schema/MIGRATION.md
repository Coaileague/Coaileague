# Schema Modularization Migration Guide

## Overview
The main schema.ts file has grown to 27,176 lines with 546 tables, causing publishing issues. This migration splits it into domain-specific modules.

## Domain Modules
- `auth.ts` - Authentication, sessions, users, tokens
- `core.ts` - Workspaces, employees, base configuration
- `scheduling.ts` - Shifts, schedules, time tracking, availability
- `clients.ts` - Clients, jobs, assignments, locations
- `finance.ts` - Payroll, invoices, payments, billing, credits
- `onboarding.ts` - User onboarding, enterprise onboarding
- `compliance.ts` - Certifications, labor law, document vaults
- `integrations.ts` - QuickBooks, HRIS, webhooks, OAuth
- `notifications.ts` - Email, notifications, broadcasts, mailboxes
- `ai.ts` - Trinity AI, brain actions, metering
- `chat.ts` - Chat rooms, messages, bots, workrooms

## Migration Strategy

### Phase 1: Scaffolding (COMPLETED)
- Created domain module files with common imports
- Created barrel index.ts with backwards compatibility
- No tables moved yet - all still in schema.ts

### Phase 2: Incremental Migration
For each domain:
1. **CUT** tables from `schema.ts` (not copy!)
2. **PASTE** into the appropriate domain module
3. **Update relations** to import table references from correct modules
4. **Test** that Drizzle ORM still works
5. **Uncomment** the export line in index.ts for that module

### Phase 3: Finalization
1. Update all imports across codebase to use `@shared/schema` or `@shared/schema/index`
2. Remove empty `schema.ts` or make it a simple re-export file
3. Verify publishing works with smaller module sizes

## Critical Rules
1. **Never duplicate** - A table/enum exists in exactly ONE place
2. **Cut, don't copy** - Remove from schema.ts when adding to module
3. **Handle cross-domain relations** - Import table objects from other modules
4. **Avoid circular imports** - Use common.ts for shared utilities

## Table Count by Domain (Estimated)
- auth: ~15 tables
- core: ~40 tables
- scheduling: ~35 tables
- clients: ~25 tables
- finance: ~60 tables
- onboarding: ~20 tables
- compliance: ~30 tables
- integrations: ~45 tables
- notifications: ~35 tables
- ai: ~50 tables
- chat: ~25 tables

## Migration Progress

### Completed Migrations
| Module | Tables Migrated | Lines | Status |
|--------|-----------------|-------|--------|
| auth.ts | users, sessions, tokenTypeEnum, authTokens, authSessions | 150 | Done |
| core.ts | businessCategoryEnum, workspaces, workspaceRoleEnum, employees, workspaceThemes, workspaceInvites | 650 | Done |

### Schema Size Reduction
- **Original**: 27,179 lines
- **Current**: 26,468 lines
- **Reduction**: 711 lines (2.6%)

### Import Pattern Used
To maintain backwards compatibility while enabling local usage in relations:
```typescript
// In schema.ts
import { workspaces as _workspaces } from './schema/core';
export const workspaces = _workspaces;  // Re-export for local usage AND backwards compatibility
```

### Architect Review (Feb 5, 2026)
- Pattern verified: alias-import + re-export is sound and safe
- Cross-module references resolved correctly
- Server operational with AI Brain scan confirming changes
- Recommendation: Target biggest domains (finance, scheduling, notifications/ai) for maximum impact

### Next Priority Tables (High Impact)
1. Finance domain - payroll, invoices, payments, billing (~60 tables)
2. Scheduling domain - shifts, schedules, timesheets (~35 tables)
3. AI/Notifications domain - Trinity AI, brain actions (~50+ tables)

## Testing Checklist
- [x] Server starts without errors
- [x] AI Brain scan completes successfully
- [ ] Database migrations work (`npm run db:push`)
- [x] All API routes function correctly
- [x] No duplicate export warnings
