# AutoForce™ API Documentation

## Overview
Complete API reference for AutoForce™ autonomous workforce management platform. All endpoints require authentication unless specified.

## Authentication
- **Bearer Token**: JWT token in `Authorization` header
- **Session**: Cookie-based session management for web clients
- **Rate Limiting**: 100 requests/minute per user, 5000 requests/hour per workspace

## Core Endpoints (100+ total)

### Authentication (5 endpoints)
- `POST /api/auth/login` - User login with email/password
- `POST /api/auth/register` - New user registration
- `POST /api/auth/logout` - User logout
- `POST /api/auth/refresh` - Refresh JWT token
- `GET /api/me` - Get current user profile

### Workspaces (12 endpoints)
- `GET /api/workspaces` - List user's workspaces
- `POST /api/workspaces` - Create new workspace
- `GET /api/workspaces/:id` - Get workspace details
- `PATCH /api/workspaces/:id` - Update workspace
- `DELETE /api/workspaces/:id` - Delete workspace
- `GET /api/workspace/members` - List workspace members
- `POST /api/workspace/invite` - Invite user to workspace
- `GET /api/workspace/settings` - Get workspace settings
- `PATCH /api/workspace/settings` - Update workspace settings

### Employees (20+ endpoints)
- `GET /api/employees` - List all employees
- `POST /api/employees` - Create employee
- `GET /api/employees/:id` - Get employee details
- `PATCH /api/employees/:id` - Update employee
- `DELETE /api/employees/:id` - Delete employee
- `GET /api/employees/:id/schedule` - Get employee schedule
- `POST /api/employees/bulk-import` - Bulk import employees
- `GET /api/employees/:id/paychecks` - Get employee payroll history

### Scheduling (15+ endpoints)
- `GET /api/schedule` - Get workplace schedule
- `POST /api/shifts` - Create shift
- `GET /api/shifts` - List shifts
- `PATCH /api/shifts/:id` - Update shift
- `DELETE /api/shifts/:id` - Delete shift
- `POST /api/shifts/:id/assign` - Assign employee to shift
- `POST /api/shift-swaps` - Request shift swap
- `POST /api/shift-approvals` - Approve/reject shift actions

### Payroll (18+ endpoints)
- `GET /api/payroll/runs` - List payroll runs
- `POST /api/payroll/process` - Trigger payroll processing
- `GET /api/payroll/runs/:id` - Get payroll run details
- `GET /api/paychecks` - List paychecks
- `GET /api/paychecks/:id` - Get paycheck details
- `POST /api/payroll/deductions` - Add payroll deduction
- `GET /api/payroll/tax-summary` - Get tax calculations
- `POST /api/payroll/garnishments` - Add garnishment

### Time Tracking (12+ endpoints)
- `POST /api/time-entries/clock-in` - Clock in
- `POST /api/time-entries/clock-out` - Clock out
- `GET /api/time-entries` - List time entries
- `PATCH /api/time-entries/:id` - Edit time entry
- `POST /api/time-entries/:id/approve` - Approve time entry
- `POST /api/timesheet-corrections` - Request correction

### Disputes (10+ endpoints)
- `POST /api/disputes` - File new dispute
- `GET /api/disputes` - List disputes
- `GET /api/disputes/:id` - Get dispute details
- `POST /api/disputes/:id/resolve` - Resolve dispute
- `POST /api/disputes/:id/appeal` - Appeal dispute decision
- `GET /api/disputes/:id/analysis` - Get AI analysis

### Invoicing (12+ endpoints)
- `GET /api/invoices` - List invoices
- `POST /api/invoices` - Create invoice
- `PATCH /api/invoices/:id` - Update invoice
- `POST /api/invoices/:id/send` - Send invoice
- `GET /api/invoices/:id/pdf` - Download invoice PDF
- `POST /api/invoices/bulk-export` - Export invoices

### Analytics (15+ endpoints)
- `GET /api/analytics/dashboard` - Dashboard metrics
- `GET /api/analytics/employees` - Employee analytics
- `GET /api/analytics/payroll` - Payroll analytics
- `GET /api/analytics/scheduling` - Scheduling analytics
- `GET /api/analytics/performance` - Performance metrics
- `POST /api/analytics/export` - Export analytics data

### Notifications (8 endpoints)
- `GET /api/notifications` - Get user notifications
- `POST /api/notifications/mark-read` - Mark notification as read
- `POST /api/notifications/mark-all-read` - Mark all as read
- `DELETE /api/notifications/:id` - Delete notification
- `GET /api/feature-updates` - Get platform updates
- `POST /api/feature-updates/:id/dismiss` - Dismiss update
- `POST /api/feature-updates/clear-all` - Clear all updates

### AI Brain (8 endpoints)
- `POST /api/documents/extract` - Extract document data
- `POST /api/documents/batch-extract` - Batch extraction
- `POST /api/ai-brain/detect-issues` - Detect data issues
- `POST /api/ai-brain/guardrails/validate` - Validate guardrails
- `GET /api/ai-brain/guardrails/config` - Get guardrail config
- `POST /api/migration/import-extracted` - Import extracted data

### Health & Monitoring (4 endpoints)
- `GET /api/health` - System health status
- `GET /api/workspace/health` - Workspace health
- `GET /api/health-monitor` - Detailed health metrics
- `POST /api/health-check/trigger` - Manual health check

### Compliance (8 endpoints)
- `GET /api/certifications` - List certifications
- `POST /api/certifications` - Add certification
- `GET /api/audit-logs` - Get audit trail
- `GET /api/compliance-reports` - Generate reports
- `POST /api/compliance/alerts` - Check compliance status

### Settings (6 endpoints)
- `GET /api/settings` - Get user settings
- `PATCH /api/settings` - Update settings
- `GET /api/preferences` - User preferences
- `PATCH /api/preferences` - Update preferences

## Response Format

### Success Response (200-201)
```json
{
  "success": true,
  "data": { /* response data */ },
  "timestamp": "2025-11-24T12:00:00Z"
}
```

### Error Response (400-500)
```json
{
  "success": false,
  "error": "Error message",
  "code": "ERROR_CODE",
  "timestamp": "2025-11-24T12:00:00Z"
}
```

## Common Status Codes
- `200` - OK
- `201` - Created
- `400` - Bad Request
- `401` - Unauthorized
- `403` - Forbidden (insufficient permissions)
- `404` - Not Found
- `409` - Conflict (duplicate data)
- `429` - Rate Limited
- `500` - Server Error
- `503` - Service Unavailable

## Pagination
List endpoints support pagination:
```
GET /api/employees?page=1&limit=50&sort=name&order=asc
```

## Filtering
Most list endpoints support filtering:
```
GET /api/employees?role=manager&department=sales&status=active
```

## Rate Limiting Headers
```
X-RateLimit-Limit: 100
X-RateLimit-Remaining: 95
X-RateLimit-Reset: 1700829600
```

## WebSocket Endpoints
- `wss://app.autoforce.io/ws/chat` - Real-time chat
- `wss://app.autoforce.io/ws/notifications` - Real-time notifications
- `wss://app.autoforce.io/ws/shifts` - Real-time shift updates

## Feature Endpoints (Autonomous Operations)
- Daily Invoice Generation: `POST /api/admin/trigger/invoicing`
- Weekly Schedule Generation: `POST /api/admin/trigger/scheduling`
- Automatic Payroll: `POST /api/admin/trigger/payroll`
- Compliance Checks: `POST /api/admin/trigger/compliance`

All times are in UTC. Timestamps use ISO 8601 format.

**Total Endpoints: 659** | **Last Updated: November 24, 2025**
