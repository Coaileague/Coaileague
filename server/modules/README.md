# Server Modules

Domain-based architecture for CoAIleague server components. Each module provides a unified entry point for related services, routes, and types.

## Modules

### Schedule (`/schedule`)
Shift scheduling, templates, AI optimization, and time tracking.

**Key Services:**
- `intelligentScheduler` - AI-powered scheduling optimization
- `shiftMonitoring` - Real-time shift monitoring and alerts
- `schedulingUtils` - Date/time utilities

**Routes:** `schedule`, `advancedScheduling`, `aiScheduling`

### Finance (`/finance`)
Billing, invoicing, payroll, and QuickBooks integration.

**Key Services:**
- `billing` - Credit management, subscriptions, feature gates
- `quickbooks` - OAuth + bidirectional sync
- `billableHours` / `payrollHours` - Hour aggregation for billing/payroll

**Routes:** `invoice`, `payroll`, `quickbooks`, `stripe`

### Trinity (`/trinity`)
AI Brain, automation, platform orchestration, and intelligence services.

**Key Services:**
- `aiBrain` - Core Trinity intelligence (4-tier Gemini architecture)
- `platformActionHub` - 350+ registered Trinity actions
- `automationToggle` - Feature-level automation control
- `eventSubscriptions` - Real-time sync and notifications
- `diagnosticOrchestrator` - 7 specialized domain subagents

**Skills:**
- `intelligentScheduler`, `timeAnomalyDetection`, `payrollValidation`, `invoiceReconciliation`

**Routes:** `trinity`, `automation`, `aiBrainControl`

### Support (`/support`)
Help desk, ticketing, chat, and platform support hierarchy.

**Key Services:**
- `helpBot` / `helpos` - AI-powered support assistance
- `chatServerHub` - Unified chat gateway
- `ticketService` - Support ticket management
- `platformSupport` - 3-tier support hierarchy (root_admin, co_admin, sysops)

**Routes:** `helpDesk`, `tickets`, `chatRooms`, `chatUploads`

## Usage

```typescript
// Import module constants for IDE navigation
import { TRINITY_MODULE, FINANCE_MODULE } from './modules';

// Find service paths
const actionHubPath = TRINITY_MODULE.services.platformActionHub;
const billingPath = FINANCE_MODULE.services.billing;

// Re-exported services can be imported directly
import { platformEventBus } from './modules/trinity';
```

## Architecture Notes

- Modules are **facades** - they document and re-export existing services
- Original file locations preserved for backward compatibility
- Use module imports for new code, existing imports still work
- Each module exports a `*_MODULE` constant with path documentation
