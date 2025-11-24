# Dynamic Configuration Management API

## Overview
The `/api/config/apply-changes` endpoint allows platform administrators to update feature toggles at runtime without restarting the server.

## Authentication
**Required Role:** Platform Admin (root_admin)

## Endpoints

### POST /api/config/apply-changes
Apply configuration changes dynamically.

**Rate Limited:** Yes (mutation limiter)  
**Audit Logged:** Yes (console + database)

#### Request Body
```json
{
  "changes": [
    {
      "scope": "featureToggles",
      "key": "ai.autoScheduling",
      "value": true
    },
    {
      "scope": "featureToggles",
      "key": "analytics.dashboards",
      "value": false
    }
  ]
}
```

#### Success Response (200 OK)
```json
{
  "success": true,
  "message": "Successfully applied 2 configuration change(s)",
  "changes": [
    {
      "scope": "featureToggles",
      "key": "ai.autoScheduling",
      "value": true,
      "applied": true
    },
    {
      "scope": "featureToggles",
      "key": "analytics.dashboards",
      "value": false,
      "applied": true
    }
  ],
  "timestamp": "2025-11-24T02:00:00.000Z"
}
```

#### Error Responses

**400 Bad Request - Invalid Format**
```json
{
  "success": false,
  "message": "Invalid request body. Expected { changes: Array<{ scope, key, value }> }"
}
```

**400 Bad Request - Validation Failed**
```json
{
  "success": false,
  "message": "Validation failed",
  "errors": [
    "Change 0 (featureToggles.invalidKey): Invalid category: invalidCategory. Must be one of: ai, workspace, core, communications, analytics, integrations, security, development, automation, phase4"
  ]
}
```

**403 Forbidden - Not Admin**
```json
{
  "message": "Forbidden: Requires platform role root_admin"
}
```

**500 Internal Server Error**
```json
{
  "success": false,
  "message": "Failed to apply configuration changes",
  "error": "..."
}
```

### GET /api/config/current
Get current configuration values.

**Rate Limited:** Yes (read limiter)  
**Query Parameters:** `scope` (required)

#### Request
```
GET /api/config/current?scope=featureToggles
```

#### Success Response (200 OK)
```json
{
  "success": true,
  "scope": "featureToggles",
  "config": {
    "ai": {
      "autoScheduling": true,
      "sentimentAnalysis": true,
      "predictiveAnalytics": true,
      "smartMatching": true,
      "aiCopilot": true
    },
    "workspace": {
      "multiWorkspace": true,
      "customBranding": false,
      "advancedReporting": true,
      "customFields": true,
      "apiAccess": false
    },
    "core": { ... },
    "communications": { ... },
    "analytics": { ... },
    "integrations": { ... },
    "security": { ... },
    "development": { ... },
    "automation": { ... },
    "phase4": { ... }
  },
  "availableKeys": [
    "ai.autoScheduling",
    "ai.sentimentAnalysis",
    "ai.predictiveAnalytics",
    "ai.smartMatching",
    "ai.aiCopilot",
    "workspace.multiWorkspace",
    "workspace.customBranding",
    ...
  ],
  "timestamp": "2025-11-24T02:00:00.000Z"
}
```

## Available Configuration Keys

All feature toggle keys follow the format: `{category}.{toggle}`

### Categories
- **ai** - AI-powered features (autoScheduling, sentimentAnalysis, predictiveAnalytics, smartMatching, aiCopilot)
- **workspace** - Workspace features (multiWorkspace, customBranding, advancedReporting, customFields, apiAccess)
- **core** - Core platform features (scheduling, timeTracking, payroll, billing, invoicing, employees, clients, shifts)
- **communications** - Communication features (emailNotifications, smsNotifications, inAppNotifications, chatSupport, webhooks)
- **analytics** - Analytics features (basicReports, advancedAnalytics, customReports, dataExport, dashboards)
- **integrations** - Third-party integrations (quickbooks, gusto, slack, zapier, stripe)
- **security** - Security features (mfa, sso, apiKeys, auditLogs, dataEncryption)
- **development** - Development features (debugMode, testDataGeneration, errorTracking, performanceMonitoring)
- **automation** - Automation features (autoTicketCreation)
- **phase4** - Phase 4 features (disputeResolution, payrollDeductions, payrollGarnishments, realTimeShiftNotifications, customSchedulerTracking, aiDisputeAnalysis)

## Example Usage (cURL)

### Apply Changes
```bash
curl -X POST https://your-domain.com/api/config/apply-changes \
  -H "Content-Type: application/json" \
  -H "Cookie: connect.sid=your-session-cookie" \
  -d '{
    "changes": [
      {
        "scope": "featureToggles",
        "key": "ai.autoScheduling",
        "value": false
      },
      {
        "scope": "featureToggles",
        "key": "automation.autoTicketCreation",
        "value": true
      }
    ]
  }'
```

### Get Current Config
```bash
curl -X GET "https://your-domain.com/api/config/current?scope=featureToggles" \
  -H "Cookie: connect.sid=your-session-cookie"
```

## Audit Logging

All configuration changes are logged:

**Console Log:**
```
[ConfigChange] Admin user-123 changed featureToggles.ai.autoScheduling to false
```

**Database (audit_trail table):**
```json
{
  "workspaceId": "platform-admin",
  "userId": "user-123",
  "action": "config.update",
  "resourceType": "configuration",
  "resourceId": "featureToggles.ai.autoScheduling",
  "details": {
    "scope": "featureToggles",
    "key": "ai.autoScheduling",
    "value": false,
    "timestamp": "2025-11-24T02:00:00.000Z"
  }
}
```

## Persistence

Changes are persisted to `shared/config/featureToggles.ts` and will survive server restarts.

## Cache Invalidation

After applying changes:
1. In-memory cache is cleared
2. Next import will reload the updated configuration
3. All dependent modules will use the new configuration

## Security Features

✅ **Admin-only access** - Requires `root_admin` platform role  
✅ **Rate limiting** - Mutation limiter prevents abuse  
✅ **Schema validation** - Zod schemas ensure type safety  
✅ **Audit logging** - All changes tracked for compliance  
✅ **Atomic updates** - All changes validated before applying  
✅ **Error handling** - Comprehensive error messages  

## Limitations (MVP)

- ❌ No MFA verification (admin role is sufficient)
- ❌ No WebSocket broadcasting (manual page refresh required)
- ❌ No dry-run support (cannot preview changes)
- ❌ No per-domain permissions (all changes require admin)
- ❌ Only supports `featureToggles` scope (more scopes coming)

## Future Enhancements

- [ ] Support for pricing configuration
- [ ] Support for app configuration
- [ ] WebSocket broadcasting for real-time updates
- [ ] Dry-run mode for previewing changes
- [ ] Change history and rollback
- [ ] Per-domain permissions
- [ ] MFA verification for critical changes
