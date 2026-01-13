# CoAIleague Comprehensive Site Crawler & Diagnostic System

## Overview

This specification defines a complete live site testing system using a parallel triad of diagnostic agents (UI, API, Integration) that crawl the entire CoAIleague platform, identify all bugs/issues, and report them for Trinity AI hotpatching or Replit Agent fixes.

---

## Enhanced Interface Specifications

### Master Diagnostic Report

```typescript
interface DiagnosticReport {
  // Identification
  id: string;                              // Unique scan ID (UUID)
  runAt: Date;                             // Scan start time
  completedAt: Date;                       // Scan end time
  duration: number;                        // Total duration (ms)
  
  // Scope
  crawlerType: 'full' | 'targeted' | 'regression' | 'smoke';
  domainsScanned: DiagnosticDomain[];      // Which areas were checked
  pagesVisited: number;                    // Total pages crawled
  endpointsHit: number;                    // Total API endpoints tested
  totalTestsRun: number;                   // Total assertions executed
  
  // Results
  issuesFound: DiagnosticIssue[];          // All detected problems
  performanceMetrics: PerformanceReport;   // Site-wide performance
  coverageReport: CoverageReport;          // What was/wasn't tested
  
  // Actions
  hotpatchesSuggested: number;
  autoFixesApplied: number;
  pendingApprovals: PendingFix[];          // Awaiting user approval
  
  // Health
  overallHealth: 'healthy' | 'degraded' | 'critical';
  healthScore: number;                     // 0-100 score
  previousHealthScore?: number;            // Last scan's score
  healthTrend: 'improving' | 'stable' | 'declining';
  
  // AI Analysis
  geminiSummary: string;                   // Executive summary
  prioritizedActionItems: ActionItem[];    // What to fix first
  riskAssessment: RiskAssessment;          // Business impact analysis
}
```

### Enhanced Diagnostic Issue

```typescript
interface DiagnosticIssue {
  // Identification
  id: string;
  fingerprint: string;                     // Hash for deduplication
  
  // Classification
  domain: DiagnosticDomain;
  category: IssueCategory;
  severity: 'info' | 'warning' | 'error' | 'critical';
  priority: 1 | 2 | 3 | 4 | 5;            // 1 = highest
  
  // Description
  title: string;
  description: string;
  rootCause?: string;                      // AI root cause analysis
  businessImpact?: string;                 // Why this matters
  
  // Context
  url?: string;                            // Where it occurred
  endpoint?: string;                       // API endpoint if applicable
  component?: string;                      // React/UI component name
  pageRoute?: string;                      // App route
  
  // Reproduction
  stepsToReproduce: string[];              // How to recreate
  testDataUsed?: object;                   // Input that triggered it
  userRole?: UserRole;                     // Which role experienced it
  deviceContext?: DeviceContext;
  browserContext?: BrowserContext;
  networkCondition?: 'online' | 'offline' | 'slow-3g' | 'fast-3g';
  
  // Evidence
  expected?: string;                       // What SHOULD happen
  actual?: string;                         // What DID happen
  screenshotUrl?: string;                  // Visual evidence
  videoClipUrl?: string;                   // Recording if available
  networkLog?: NetworkLogEntry[];          // Request/response data
  consoleErrors?: ConsoleError[];          // Browser console output
  stackTrace?: string;                     // Error stack
  
  // Technical Details
  errorCode?: string;
  errorMessage?: string;
  httpStatus?: number;
  responseTime?: number;                   // ms
  databaseQueryTime?: number;              // ms if DB involved
  memoryUsage?: number;                    // bytes
  
  // Impact Assessment
  affectedUsers?: number;                  // Estimated impact scope
  affectedRoles?: UserRole[];              // Which user types
  affectedFeatures?: string[];             // Related features
  dataIntegrity?: boolean;                 // Is data at risk?
  securityImplication?: boolean;           // Security concern?
  
  // Tracking
  detectedAt: Date;
  isRegression: boolean;                   // Did this used to work?
  firstDetected?: Date;                    // When first seen
  occurrenceCount: number;                 // How many times
  trending: 'new' | 'recurring' | 'worsening' | 'improving' | 'resolved';
  relatedIssues?: string[];                // Linked issue IDs
  
  // Fix Information
  suggestedFix?: HotpatchSuggestion;
  autoFixable: boolean;
  fixComplexity: 'trivial' | 'simple' | 'moderate' | 'complex' | 'architectural';
  estimatedFixTime?: string;               // "5 minutes", "1 hour", etc.
  
  // AI Analysis
  geminiAnalysis?: string;                 // Deep reasoning
  similarPastIssues?: PastIssueReference[];
}
```

### Hotpatch Suggestion

```typescript
interface HotpatchSuggestion {
  id: string;
  
  // Classification
  type: HotpatchType;
  approach: 'surgical' | 'workaround' | 'full_fix';
  
  // Description
  title: string;
  description: string;
  rationale: string;                       // Why this fix works
  
  // Implementation
  code?: string;                           // The actual fix code
  targetFile?: string;                     // Which file to patch
  targetFunction?: string;                 // Specific function
  lineNumbers?: { start: number; end: number };
  
  // Multiple file changes
  changes?: FileChange[];
  
  // Risk Assessment
  estimatedImpact: 'low' | 'medium' | 'high';
  riskLevel: 'safe' | 'moderate' | 'risky';
  potentialSideEffects?: string[];
  rollbackPlan?: string;
  
  // Execution
  canAutoExecute: boolean;
  requiresApproval: boolean;
  requiresTwoPersonApproval: boolean;      // Destructive ops
  requiresRestart: boolean;
  requiresDeployment: boolean;
  
  // Testing
  verificationSteps?: string[];            // How to verify fix worked
  testCases?: TestCase[];                  // Automated verification
  
  // Metadata
  confidence: number;                      // 0-100 AI confidence
  generatedBy: 'trinity' | 'gemini' | 'rule-based';
  generatedAt: Date;
}

type HotpatchType = 
  | 'config_update'
  | 'cache_clear'
  | 'service_restart'
  | 'code_edit'
  | 'query_fix'
  | 'data_migration'
  | 'permission_fix'
  | 'env_variable'
  | 'dependency_update'
  | 'database_index'
  | 'api_retry_logic'
  | 'validation_fix'
  | 'null_check'
  | 'error_handling';

interface FileChange {
  file: string;
  operation: 'modify' | 'create' | 'delete';
  searchReplace?: { search: string; replace: string };
  fullContent?: string;
  diff?: string;
}
```

---

## Diagnostic Domains

```typescript
type DiagnosticDomain =
  // Core Business
  | 'scheduling'           // Shift management, calendar, assignments
  | 'payroll'              // Pay calculations, overtime, deductions
  | 'invoicing'            // Client billing, invoice generation
  | 'time_tracking'        // Clock in/out, GPS verification, timesheets
  | 'incident_reporting'   // DAR, incident reports, contact reports
  
  // User Management
  | 'authentication'       // Login, logout, session management
  | 'authorization'        // Permissions, role-based access
  | 'user_management'      // CRUD for employees, contractors, clients
  | 'onboarding'           // New user flows, setup wizards
  
  // Communication
  | 'notifications'        // Push, email, SMS, in-app
  | 'messaging'            // Internal chat, announcements
  | 'trinity_ai'           // AI assistant functionality
  
  // Integration
  | 'quickbooks'           // QB sync, financial data
  | 'api_external'         // Third-party integrations
  | 'webhooks'             // Inbound/outbound hooks
  
  // Technical
  | 'api_internal'         // Internal API endpoints
  | 'database'             // Data integrity, queries
  | 'caching'              // Redis, memory cache
  | 'file_storage'         // Uploads, documents
  | 'background_jobs'      // Queues, scheduled tasks
  
  // Frontend
  | 'ui_render'            // Component rendering
  | 'ui_interaction'       // Click handlers, forms
  | 'ui_navigation'        // Routing, page transitions
  | 'ui_responsive'        // Mobile/tablet layouts
  
  // Mobile Specific
  | 'mobile_app'           // Native app features
  | 'gps_location'         // Geolocation, geofencing
  | 'offline_mode'         // Offline functionality
  | 'push_notifications'   // Mobile push
  
  // Security
  | 'security_auth'        // Auth vulnerabilities
  | 'security_input'       // Input sanitization, XSS
  | 'security_data'        // Data exposure, encryption
  
  // Performance
  | 'performance_load'     // Page load times
  | 'performance_api'      // API response times
  | 'performance_database' // Query performance
  | 'performance_memory';  // Memory leaks, usage
```

---

## Issue Categories

```typescript
type IssueCategory =
  // Functional
  | 'broken_feature'       // Feature doesn't work
  | 'incorrect_calculation'// Math/logic errors
  | 'data_not_saving'      // Save operations fail
  | 'data_not_loading'     // Fetch operations fail
  | 'wrong_data_displayed' // Shows incorrect info
  | 'missing_data'         // Data should exist but doesn't
  | 'duplicate_data'       // Unwanted duplicates
  
  // UI/UX
  | 'ui_broken'            // Visual breakage
  | 'ui_misaligned'        // Layout issues
  | 'ui_unresponsive'      // Doesn't respond to input
  | 'ui_missing_element'   // Expected element gone
  | 'ui_wrong_state'       // Incorrect visual state
  | 'accessibility'        // A11y violations
  | 'mobile_layout'        // Mobile-specific UI issues
  
  // Navigation
  | 'broken_link'          // 404, dead links
  | 'wrong_redirect'       // Goes to wrong place
  | 'infinite_loop'        // Redirect loops
  | 'back_button_broken'   // Browser nav issues
  
  // Forms
  | 'form_validation'      // Validation not working
  | 'form_submission'      // Submit fails
  | 'form_prefill'         // Wrong default values
  | 'form_clearing'        // Doesn't reset properly
  
  // API
  | 'api_500_error'        // Server errors
  | 'api_400_error'        // Bad request errors
  | 'api_timeout'          // Request timeouts
  | 'api_wrong_response'   // Incorrect response data
  | 'api_missing_endpoint' // Endpoint doesn't exist
  | 'api_cors'             // CORS issues
  
  // Auth
  | 'login_failure'        // Can't log in
  | 'session_expired'      // Unexpected session end
  | 'permission_denied'    // Unauthorized access blocked
  | 'permission_leak'      // Unauthorized access allowed
  
  // Data Integrity
  | 'data_corruption'      // Data is corrupted
  | 'data_loss'            // Data disappeared
  | 'sync_failure'         // Systems out of sync
  | 'race_condition'       // Concurrent access issues
  
  // Performance
  | 'slow_load'            // Takes too long
  | 'memory_leak'          // Growing memory usage
  | 'cpu_spike'            // High CPU usage
  | 'database_slow'        // Slow queries
  
  // Integration
  | 'quickbooks_sync'      // QB sync issues
  | 'external_api'         // Third-party failures
  | 'webhook_failure'      // Webhook issues
  
  // Security
  | 'xss_vulnerability'    // Cross-site scripting
  | 'injection_risk'       // SQL/NoSQL injection
  | 'auth_bypass'          // Authentication bypass
  | 'data_exposure';       // Sensitive data exposed
```

---

## User Roles for Testing

```typescript
type UserRole = 
  | 'super_admin'          // Full system access
  | 'company_admin'        // Company owner
  | 'manager'              // Operations manager
  | 'supervisor'           // Field supervisor
  | 'guard'                // Security guard
  | 'contractor'           // Contract worker
  | 'client'               // Client portal user
  | 'unauthenticated';     // Not logged in

interface RoleTestMatrix {
  role: UserRole;
  canAccess: string[];     // Routes they should access
  cannotAccess: string[];  // Routes they shouldn't access
  actions: RoleAction[];   // What they can do
}

interface RoleAction {
  action: string;
  allowed: boolean;
  testEndpoint?: string;
  testMethod?: 'GET' | 'POST' | 'PUT' | 'DELETE';
}
```

---

## Device & Browser Context

```typescript
interface DeviceContext {
  type: 'desktop' | 'tablet' | 'mobile';
  os?: 'windows' | 'macos' | 'linux' | 'ios' | 'android';
  screenWidth: number;
  screenHeight: number;
  pixelRatio: number;
  touchEnabled: boolean;
}

interface BrowserContext {
  name: 'chrome' | 'firefox' | 'safari' | 'edge' | 'mobile-safari' | 'mobile-chrome';
  version: string;
  userAgent: string;
  cookiesEnabled: boolean;
  javascriptEnabled: boolean;
}
```

---

## Test Scenario Specifications

### 1. Authentication Tests

```typescript
const authTests: TestScenario[] = [
  // Login flows
  { id: 'auth-001', name: 'Valid login with email/password', priority: 1 },
  { id: 'auth-002', name: 'Invalid password rejection', priority: 1 },
  { id: 'auth-003', name: 'Invalid email format rejection', priority: 2 },
  { id: 'auth-004', name: 'Account lockout after X failures', priority: 2 },
  { id: 'auth-005', name: 'Password reset flow', priority: 1 },
  { id: 'auth-006', name: 'Email verification flow', priority: 2 },
  { id: 'auth-007', name: 'Session persistence across refresh', priority: 1 },
  { id: 'auth-008', name: 'Session timeout handling', priority: 2 },
  { id: 'auth-009', name: 'Logout clears all session data', priority: 1 },
  { id: 'auth-010', name: 'Remember me functionality', priority: 3 },
  { id: 'auth-011', name: 'Multi-device session management', priority: 2 },
  { id: 'auth-012', name: 'Force logout from other devices', priority: 3 },
];
```

### 2. Scheduling Tests

```typescript
const schedulingTests: TestScenario[] = [
  // Basic CRUD
  { id: 'sched-001', name: 'Create single shift', priority: 1 },
  { id: 'sched-002', name: 'Create recurring shift', priority: 1 },
  { id: 'sched-003', name: 'Edit existing shift', priority: 1 },
  { id: 'sched-004', name: 'Delete shift', priority: 1 },
  { id: 'sched-005', name: 'Cancel shift with notification', priority: 2 },
  
  // Assignment
  { id: 'sched-010', name: 'Assign guard to shift', priority: 1 },
  { id: 'sched-011', name: 'Unassign guard from shift', priority: 1 },
  { id: 'sched-012', name: 'Reassign shift to different guard', priority: 1 },
  { id: 'sched-013', name: 'Bulk assign multiple guards', priority: 2 },
  { id: 'sched-014', name: 'Auto-assign based on availability', priority: 2 },
  
  // Conflicts & Validation
  { id: 'sched-020', name: 'Prevent double-booking guard', priority: 1 },
  { id: 'sched-021', name: 'Prevent overlapping shifts', priority: 1 },
  { id: 'sched-022', name: 'Respect guard availability', priority: 1 },
  { id: 'sched-023', name: 'Enforce minimum rest between shifts', priority: 2 },
  { id: 'sched-024', name: 'Overtime warning threshold', priority: 2 },
  
  // Edge Cases
  { id: 'sched-030', name: 'Shift crossing midnight', priority: 1 },
  { id: 'sched-031', name: 'Shift crossing DST boundary', priority: 2 },
  { id: 'sched-032', name: 'Multi-day shift (24+ hours)', priority: 2 },
  { id: 'sched-033', name: 'Split shift (same day, gap)', priority: 2 },
  { id: 'sched-034', name: 'Shift in different timezone', priority: 2 },
  
  // Views
  { id: 'sched-040', name: 'Daily view displays correctly', priority: 1 },
  { id: 'sched-041', name: 'Weekly view displays correctly', priority: 1 },
  { id: 'sched-042', name: 'Monthly view displays correctly', priority: 1 },
  { id: 'sched-043', name: 'Guard-centric view', priority: 2 },
  { id: 'sched-044', name: 'Site-centric view', priority: 2 },
];
```

### 3. Time Tracking Tests

```typescript
const timeTrackingTests: TestScenario[] = [
  // Clock operations
  { id: 'time-001', name: 'Clock in with GPS verification', priority: 1 },
  { id: 'time-002', name: 'Clock out with GPS verification', priority: 1 },
  { id: 'time-003', name: 'Clock in rejected outside geofence', priority: 1 },
  { id: 'time-004', name: 'Clock in with photo verification', priority: 2 },
  { id: 'time-005', name: 'Break start/end tracking', priority: 2 },
  
  // Time calculations
  { id: 'time-010', name: 'Regular hours calculated correctly', priority: 1 },
  { id: 'time-011', name: 'Overtime calculated correctly', priority: 1 },
  { id: 'time-012', name: 'Double-time calculated correctly', priority: 1 },
  { id: 'time-013', name: 'Break time deducted properly', priority: 1 },
  { id: 'time-014', name: 'Midnight crossover calculation', priority: 1 },
  
  // Edge cases
  { id: 'time-020', name: 'Forgot to clock out handling', priority: 1 },
  { id: 'time-021', name: 'Manual time entry by supervisor', priority: 2 },
  { id: 'time-022', name: 'Time entry dispute workflow', priority: 2 },
  { id: 'time-023', name: 'GPS failure fallback', priority: 2 },
  { id: 'time-024', name: 'Offline clock in sync', priority: 1 },
  
  // Approvals
  { id: 'time-030', name: 'Timesheet submission', priority: 1 },
  { id: 'time-031', name: 'Supervisor approval workflow', priority: 1 },
  { id: 'time-032', name: 'Timesheet rejection with reason', priority: 2 },
  { id: 'time-033', name: 'Bulk timesheet approval', priority: 2 },
];
```

### 4. Payroll Tests

```typescript
const payrollTests: TestScenario[] = [
  // Calculations
  { id: 'pay-001', name: 'Regular pay calculation', priority: 1 },
  { id: 'pay-002', name: 'Overtime pay (1.5x)', priority: 1 },
  { id: 'pay-003', name: 'Double-time pay (2x)', priority: 1 },
  { id: 'pay-004', name: 'Holiday pay calculation', priority: 1 },
  { id: 'pay-005', name: 'Different pay rates per site', priority: 1 },
  { id: 'pay-006', name: 'Different pay rates per shift type', priority: 2 },
  
  // Deductions
  { id: 'pay-010', name: 'Tax withholding calculation', priority: 1 },
  { id: 'pay-011', name: 'Benefits deduction', priority: 2 },
  { id: 'pay-012', name: 'Garnishment handling', priority: 2 },
  { id: 'pay-013', name: 'Advance deduction', priority: 2 },
  
  // Pay periods
  { id: 'pay-020', name: 'Weekly pay period processing', priority: 1 },
  { id: 'pay-021', name: 'Bi-weekly pay period processing', priority: 1 },
  { id: 'pay-022', name: 'Semi-monthly pay period processing', priority: 2 },
  { id: 'pay-023', name: 'Pay period boundary handling', priority: 1 },
  
  // Edge cases
  { id: 'pay-030', name: 'Retroactive pay adjustment', priority: 2 },
  { id: 'pay-031', name: 'Mid-period rate change', priority: 2 },
  { id: 'pay-032', name: 'Negative balance handling', priority: 2 },
  { id: 'pay-033', name: 'Rounding rules compliance', priority: 2 },
  
  // Reporting
  { id: 'pay-040', name: 'Pay stub generation', priority: 1 },
  { id: 'pay-041', name: 'Payroll summary report', priority: 1 },
  { id: 'pay-042', name: 'Export to QuickBooks', priority: 1 },
  { id: 'pay-043', name: 'Year-end tax documents', priority: 2 },
];
```

### 5. Invoicing Tests

```typescript
const invoicingTests: TestScenario[] = [
  // Generation
  { id: 'inv-001', name: 'Generate invoice from timesheet', priority: 1 },
  { id: 'inv-002', name: 'Manual invoice creation', priority: 1 },
  { id: 'inv-003', name: 'Recurring invoice generation', priority: 2 },
  { id: 'inv-004', name: 'Invoice from multiple timesheets', priority: 1 },
  
  // Calculations
  { id: 'inv-010', name: 'Hourly rate calculation', priority: 1 },
  { id: 'inv-011', name: 'Overtime billing rate', priority: 1 },
  { id: 'inv-012', name: 'Holiday billing rate', priority: 1 },
  { id: 'inv-013', name: 'Tax calculation', priority: 1 },
  { id: 'inv-014', name: 'Discount application', priority: 2 },
  
  // Workflow
  { id: 'inv-020', name: 'Invoice approval workflow', priority: 1 },
  { id: 'inv-021', name: 'Send invoice to client', priority: 1 },
  { id: 'inv-022', name: 'Payment recording', priority: 1 },
  { id: 'inv-023', name: 'Partial payment handling', priority: 2 },
  { id: 'inv-024', name: 'Invoice dispute handling', priority: 2 },
  
  // Edge cases
  { id: 'inv-030', name: 'Credit memo creation', priority: 2 },
  { id: 'inv-031', name: 'Invoice voiding', priority: 2 },
  { id: 'inv-032', name: 'Late fee calculation', priority: 3 },
  
  // Integration
  { id: 'inv-040', name: 'QuickBooks sync', priority: 1 },
  { id: 'inv-041', name: 'PDF generation', priority: 1 },
  { id: 'inv-042', name: 'Email delivery', priority: 1 },
];
```

### 6. Incident Reporting Tests

```typescript
const incidentTests: TestScenario[] = [
  // Report types
  { id: 'inc-001', name: 'Daily Activity Report (DAR) creation', priority: 1 },
  { id: 'inc-002', name: 'Incident Report creation', priority: 1 },
  { id: 'inc-003', name: 'Contact Report creation', priority: 1 },
  { id: 'inc-004', name: 'Maintenance Request creation', priority: 2 },
  { id: 'inc-005', name: 'Custom report type', priority: 3 },
  
  // Workflow
  { id: 'inc-010', name: 'Report submission', priority: 1 },
  { id: 'inc-011', name: 'Supervisor review', priority: 1 },
  { id: 'inc-012', name: 'Manager approval', priority: 1 },
  { id: 'inc-013', name: 'Client delivery', priority: 1 },
  { id: 'inc-014', name: 'Report rejection with feedback', priority: 2 },
  
  // AI Enhancement
  { id: 'inc-020', name: 'Trinity AI grammar correction', priority: 1 },
  { id: 'inc-021', name: 'Trinity AI legal articulation', priority: 1 },
  { id: 'inc-022', name: 'Trinity AI template suggestions', priority: 2 },
  
  // Attachments
  { id: 'inc-030', name: 'Photo attachment upload', priority: 1 },
  { id: 'inc-031', name: 'Multiple photo upload', priority: 2 },
  { id: 'inc-032', name: 'Video attachment', priority: 3 },
  { id: 'inc-033', name: 'Document attachment', priority: 2 },
  
  // Mobile
  { id: 'inc-040', name: 'Mobile report creation', priority: 1 },
  { id: 'inc-041', name: 'Offline report creation', priority: 1 },
  { id: 'inc-042', name: 'Offline sync when connected', priority: 1 },
];
```

### 7. Permission & Role Tests

```typescript
const permissionTests: TestScenario[] = [
  // Guard permissions
  { id: 'perm-001', name: 'Guard can view own schedule', priority: 1 },
  { id: 'perm-002', name: 'Guard cannot view other schedules', priority: 1 },
  { id: 'perm-003', name: 'Guard can clock in/out', priority: 1 },
  { id: 'perm-004', name: 'Guard can submit reports', priority: 1 },
  { id: 'perm-005', name: 'Guard cannot approve timesheets', priority: 1 },
  { id: 'perm-006', name: 'Guard cannot access payroll', priority: 1 },
  
  // Supervisor permissions
  { id: 'perm-010', name: 'Supervisor can view team schedules', priority: 1 },
  { id: 'perm-011', name: 'Supervisor can approve timesheets', priority: 1 },
  { id: 'perm-012', name: 'Supervisor can review reports', priority: 1 },
  { id: 'perm-013', name: 'Supervisor cannot access financials', priority: 1 },
  
  // Manager permissions
  { id: 'perm-020', name: 'Manager can create schedules', priority: 1 },
  { id: 'perm-021', name: 'Manager can run payroll', priority: 1 },
  { id: 'perm-022', name: 'Manager can generate invoices', priority: 1 },
  { id: 'perm-023', name: 'Manager can view all reports', priority: 1 },
  
  // Admin permissions
  { id: 'perm-030', name: 'Admin can manage users', priority: 1 },
  { id: 'perm-031', name: 'Admin can change settings', priority: 1 },
  { id: 'perm-032', name: 'Admin can access all data', priority: 1 },
  
  // Cross-role
  { id: 'perm-040', name: 'Role escalation prevention', priority: 1 },
  { id: 'perm-041', name: 'API permission enforcement', priority: 1 },
  { id: 'perm-042', name: 'URL direct access prevention', priority: 1 },
];
```

### 8. Mobile & GPS Tests

```typescript
const mobileTests: TestScenario[] = [
  // Responsive UI
  { id: 'mob-001', name: 'Login page mobile layout', priority: 1 },
  { id: 'mob-002', name: 'Dashboard mobile layout', priority: 1 },
  { id: 'mob-003', name: 'Schedule view mobile layout', priority: 1 },
  { id: 'mob-004', name: 'Time clock mobile layout', priority: 1 },
  { id: 'mob-005', name: 'Report form mobile layout', priority: 1 },
  
  // Touch interactions
  { id: 'mob-010', name: 'Touch targets minimum 44px', priority: 1 },
  { id: 'mob-011', name: 'Swipe gestures work', priority: 2 },
  { id: 'mob-012', name: 'Pull to refresh', priority: 2 },
  { id: 'mob-013', name: 'Long press actions', priority: 3 },
  
  // GPS functionality
  { id: 'mob-020', name: 'GPS permission request', priority: 1 },
  { id: 'mob-021', name: 'Location accuracy verification', priority: 1 },
  { id: 'mob-022', name: 'Geofence boundary detection', priority: 1 },
  { id: 'mob-023', name: 'GPS failure graceful handling', priority: 1 },
  { id: 'mob-024', name: 'Background location tracking', priority: 2 },
  
  // Offline
  { id: 'mob-030', name: 'Offline mode activation', priority: 1 },
  { id: 'mob-031', name: 'Data queuing when offline', priority: 1 },
  { id: 'mob-032', name: 'Sync when connection restored', priority: 1 },
  { id: 'mob-033', name: 'Conflict resolution after sync', priority: 2 },
  { id: 'mob-034', name: 'Offline indicator displayed', priority: 1 },
  
  // Performance
  { id: 'mob-040', name: 'App load time under 3s on 3G', priority: 1 },
  { id: 'mob-041', name: 'Smooth scrolling (60fps)', priority: 2 },
  { id: 'mob-042', name: 'Memory usage stays stable', priority: 2 },
];
```

### 9. Integration Tests

```typescript
const integrationTests: TestScenario[] = [
  // QuickBooks
  { id: 'qb-001', name: 'QuickBooks initial connection', priority: 1 },
  { id: 'qb-002', name: 'Employee sync to QB', priority: 1 },
  { id: 'qb-003', name: 'Client sync to QB', priority: 1 },
  { id: 'qb-004', name: 'Invoice sync to QB', priority: 1 },
  { id: 'qb-005', name: 'Payment sync from QB', priority: 1 },
  { id: 'qb-006', name: 'Payroll export to QB', priority: 1 },
  { id: 'qb-007', name: 'QB token refresh', priority: 1 },
  { id: 'qb-008', name: 'QB sync conflict resolution', priority: 2 },
  { id: 'qb-009', name: 'QB disconnection handling', priority: 2 },
  { id: 'qb-010', name: 'QB data validation before sync', priority: 1 },
  
  // Email
  { id: 'email-001', name: 'Welcome email delivery', priority: 1 },
  { id: 'email-002', name: 'Password reset email', priority: 1 },
  { id: 'email-003', name: 'Invoice email delivery', priority: 1 },
  { id: 'email-004', name: 'Report email delivery', priority: 1 },
  { id: 'email-005', name: 'Notification email delivery', priority: 2 },
  
  // SMS
  { id: 'sms-001', name: 'Shift reminder SMS', priority: 2 },
  { id: 'sms-002', name: 'Emergency alert SMS', priority: 1 },
  { id: 'sms-003', name: 'Two-factor auth SMS', priority: 1 },
];
```

### 10. Security Tests

```typescript
const securityTests: TestScenario[] = [
  // Authentication
  { id: 'sec-001', name: 'SQL injection in login', priority: 1 },
  { id: 'sec-002', name: 'Brute force protection', priority: 1 },
  { id: 'sec-003', name: 'Session fixation prevention', priority: 1 },
  { id: 'sec-004', name: 'CSRF token validation', priority: 1 },
  { id: 'sec-005', name: 'JWT token validation', priority: 1 },
  { id: 'sec-006', name: 'Password complexity enforcement', priority: 2 },
  
  // Authorization
  { id: 'sec-010', name: 'Horizontal privilege escalation', priority: 1 },
  { id: 'sec-011', name: 'Vertical privilege escalation', priority: 1 },
  { id: 'sec-012', name: 'IDOR (Insecure Direct Object Reference)', priority: 1 },
  { id: 'sec-013', name: 'API key exposure check', priority: 1 },
  
  // Input validation
  { id: 'sec-020', name: 'XSS in text fields', priority: 1 },
  { id: 'sec-021', name: 'XSS in URL parameters', priority: 1 },
  { id: 'sec-022', name: 'SQL injection in search', priority: 1 },
  { id: 'sec-023', name: 'File upload validation', priority: 1 },
  { id: 'sec-024', name: 'Path traversal prevention', priority: 1 },
  
  // Data protection
  { id: 'sec-030', name: 'Sensitive data in logs', priority: 1 },
  { id: 'sec-031', name: 'Sensitive data in URL', priority: 1 },
  { id: 'sec-032', name: 'PII exposure in API responses', priority: 1 },
  { id: 'sec-033', name: 'Encryption at rest', priority: 2 },
  { id: 'sec-034', name: 'HTTPS enforcement', priority: 1 },
];
```

### 11. Performance Tests

```typescript
const performanceTests: TestScenario[] = [
  // Page load
  { id: 'perf-001', name: 'Homepage load < 2s', priority: 1 },
  { id: 'perf-002', name: 'Dashboard load < 3s', priority: 1 },
  { id: 'perf-003', name: 'Schedule page load < 2s', priority: 1 },
  { id: 'perf-004', name: 'Report page load < 2s', priority: 1 },
  
  // API response
  { id: 'perf-010', name: 'API GET requests < 500ms', priority: 1 },
  { id: 'perf-011', name: 'API POST requests < 1s', priority: 1 },
  { id: 'perf-012', name: 'Report generation < 5s', priority: 2 },
  { id: 'perf-013', name: 'Payroll calculation < 10s', priority: 2 },
  
  // Database
  { id: 'perf-020', name: 'Schedule query < 100ms', priority: 1 },
  { id: 'perf-021', name: 'Employee list query < 200ms', priority: 1 },
  { id: 'perf-022', name: 'Report search < 500ms', priority: 2 },
  { id: 'perf-023', name: 'No N+1 query issues', priority: 1 },
  
  // Concurrent users
  { id: 'perf-030', name: 'Handle 50 concurrent users', priority: 2 },
  { id: 'perf-031', name: 'Handle 100 concurrent users', priority: 3 },
  { id: 'perf-032', name: 'No deadlocks under load', priority: 1 },
];
```

### 12. Concurrency Tests

```typescript
const concurrencyTests: TestScenario[] = [
  { id: 'conc-001', name: 'Two managers edit same shift', priority: 1 },
  { id: 'conc-002', name: 'Simultaneous clock-ins', priority: 1 },
  { id: 'conc-003', name: 'Concurrent timesheet approvals', priority: 2 },
  { id: 'conc-004', name: 'Parallel invoice generation', priority: 2 },
  { id: 'conc-005', name: 'Race condition in QB sync', priority: 1 },
  { id: 'conc-006', name: 'Concurrent report submissions', priority: 2 },
  { id: 'conc-007', name: 'Parallel payroll processing', priority: 1 },
  { id: 'conc-008', name: 'Optimistic locking enforcement', priority: 1 },
];
```

### 13. Edge Case Tests

```typescript
const edgeCaseTests: TestScenario[] = [
  // Empty states
  { id: 'edge-001', name: 'Dashboard with no data', priority: 1 },
  { id: 'edge-002', name: 'Schedule with no shifts', priority: 1 },
  { id: 'edge-003', name: 'First-time user experience', priority: 1 },
  { id: 'edge-004', name: 'Company with no employees', priority: 2 },
  
  // Limits
  { id: 'edge-010', name: 'Maximum employees (999+)', priority: 2 },
  { id: 'edge-011', name: 'Maximum shifts per day', priority: 2 },
  { id: 'edge-012', name: 'Very long report text', priority: 2 },
  { id: 'edge-013', name: 'Large file upload', priority: 2 },
  
  // Time edge cases
  { id: 'edge-020', name: 'Daylight saving time transition', priority: 1 },
  { id: 'edge-021', name: 'Leap year date handling', priority: 3 },
  { id: 'edge-022', name: 'Year boundary (Dec 31 - Jan 1)', priority: 1 },
  { id: 'edge-023', name: 'Month boundary shifts', priority: 1 },
  
  // Input edge cases
  { id: 'edge-030', name: 'Unicode characters in names', priority: 2 },
  { id: 'edge-031', name: 'Special characters in passwords', priority: 1 },
  { id: 'edge-032', name: 'Very long names', priority: 2 },
  { id: 'edge-033', name: 'Empty string submissions', priority: 1 },
  { id: 'edge-034', name: 'Null value handling', priority: 1 },
];
```

---

## Crawler Configuration

```typescript
interface CrawlerConfig {
  // Scope
  baseUrl: string;
  includedPaths: string[];                 // Paths to crawl
  excludedPaths: string[];                 // Paths to skip
  maxDepth: number;                        // Link following depth
  
  // Authentication
  testAccounts: TestAccount[];             // One per role
  
  // Timing
  requestDelay: number;                    // ms between requests
  timeout: number;                         // Request timeout
  maxRetries: number;
  
  // Parallel execution
  parallelAgents: number;                  // Default: 3 (UI, API, Integration)
  
  // Reporting
  reportingEndpoint: string;               // Where to send results
  screenshotOnFailure: boolean;
  videoRecording: boolean;
  saveNetworkLogs: boolean;
  
  // Thresholds
  performanceThresholds: PerformanceThresholds;
  
  // Features
  enableSecurityScans: boolean;
  enableAccessibilityScans: boolean;
  enablePerformanceScans: boolean;
  enableVisualRegression: boolean;
}

interface TestAccount {
  role: UserRole;
  email: string;
  password: string;
}

interface PerformanceThresholds {
  pageLoadTime: number;                    // ms
  apiResponseTime: number;                 // ms
  timeToInteractive: number;               // ms
  largestContentfulPaint: number;          // ms
  cumulativeLayoutShift: number;           // score
  firstInputDelay: number;                 // ms
}
```

---

## Triad Agent Architecture

### Agent 1: UI Crawler

```typescript
interface UICrawlerAgent {
  name: 'ui-crawler';
  responsibilities: [
    'Page rendering verification',
    'Component visibility',
    'Layout responsiveness',
    'Form functionality',
    'Navigation flows',
    'Visual regression',
    'Accessibility compliance',
    'Mobile responsiveness'
  ];
  
  tools: [
    'Puppeteer/Playwright for browser automation',
    'Axe-core for accessibility',
    'Percy/Chromatic for visual regression'
  ];
  
  outputs: {
    screenshotsPerPage: boolean;
    domSnapshots: boolean;
    accessibilityReports: boolean;
    consoleErrors: boolean;
    networkRequests: boolean;
  };
}
```

### Agent 2: API Crawler

```typescript
interface APICrawlerAgent {
  name: 'api-crawler';
  responsibilities: [
    'Endpoint availability',
    'Response validation',
    'Error handling',
    'Authentication enforcement',
    'Authorization checks',
    'Rate limiting verification',
    'Payload validation',
    'Performance measurement'
  ];
  
  tools: [
    'Axios/Fetch for requests',
    'JSON Schema validation',
    'Custom assertion library'
  ];
  
  outputs: {
    responseSnapshots: boolean;
    latencyMetrics: boolean;
    errorResponses: boolean;
    schemaValidation: boolean;
  };
}
```

### Agent 3: Integration Crawler

```typescript
interface IntegrationCrawlerAgent {
  name: 'integration-crawler';
  responsibilities: [
    'End-to-end workflow testing',
    'Cross-system data flow',
    'QuickBooks sync verification',
    'Email/SMS delivery',
    'Notification pipeline',
    'Background job execution',
    'Data consistency checks',
    'Business logic validation'
  ];
  
  tools: [
    'Custom workflow orchestrator',
    'Database query tools',
    'Message queue inspection'
  ];
  
  outputs: {
    workflowTraces: boolean;
    dataConsistencyReports: boolean;
    integrationHealthChecks: boolean;
    businessMetricValidation: boolean;
  };
}
```

---

## Trinity Hotpatch Workflow

```typescript
interface HotpatchWorkflow {
  // Detection
  step1_detect: {
    source: 'crawler' | 'user_report' | 'monitoring' | 'trinity_observation';
    issue: DiagnosticIssue;
  };
  
  // Analysis
  step2_analyze: {
    rootCauseAnalysis: string;
    impactAssessment: string;
    fixOptions: HotpatchSuggestion[];
  };
  
  // Decision
  step3_decide: {
    selectedFix: HotpatchSuggestion;
    executionPath: 'auto' | 'approval_required' | 'manual_only';
  };
  
  // Execution
  step4_execute: {
    autoExecute?: {
      condition: 'canAutoExecute === true && riskLevel === "safe"';
      actions: string[];
    };
    requestApproval?: {
      condition: 'requiresApproval === true';
      notificationChannel: 'in_app' | 'email' | 'sms';
      approvers: UserRole[];
      timeout: number;                     // Auto-escalate after X minutes
    };
  };
  
  // Verification
  step5_verify: {
    rerunTests: string[];                  // Test IDs to re-execute
    successCriteria: string[];
    rollbackTrigger: string[];             // Conditions to rollback
  };
  
  // Reporting
  step6_report: {
    updateIssueStatus: boolean;
    notifyStakeholders: boolean;
    logToAuditTrail: boolean;
  };
}
```

---

## Notification System Integration

```typescript
interface DiagnosticNotification {
  id: string;
  type: 'hotpatch_approval' | 'critical_issue' | 'scan_complete' | 'fix_applied';
  
  // Content
  title: string;
  message: string;
  severity: 'info' | 'warning' | 'error' | 'critical';
  
  // Related issue
  issueId?: string;
  hotpatchId?: string;
  
  // Actions
  actions?: NotificationAction[];
  
  // Delivery
  channels: ('in_app' | 'email' | 'sms' | 'push')[];
  recipients: string[];                    // User IDs or role names
  
  // Tracking
  sentAt: Date;
  readAt?: Date;
  actionedAt?: Date;
  actionTaken?: string;
}

interface NotificationAction {
  id: string;
  label: string;
  type: 'approve' | 'reject' | 'defer' | 'view_details' | 'execute';
  endpoint: string;
  method: 'POST' | 'PUT';
  payload?: object;
  requiresConfirmation: boolean;
}
```

---

## Report Output Formats

### JSON Report (for Replit Agent)

```typescript
interface ReplitAgentReport {
  metadata: {
    scanId: string;
    timestamp: Date;
    duration: number;
    healthScore: number;
  };
  
  criticalIssues: DiagnosticIssue[];       // Must fix immediately
  highPriorityIssues: DiagnosticIssue[];   // Fix this sprint
  mediumPriorityIssues: DiagnosticIssue[]; // Fix when possible
  lowPriorityIssues: DiagnosticIssue[];    // Nice to have
  
  suggestedFixes: {
    autoApplied: HotpatchSuggestion[];
    pendingApproval: HotpatchSuggestion[];
    manualRequired: HotpatchSuggestion[];
  };
  
  fileChangesNeeded: FileChange[];
  
  testCoverage: {
    passed: number;
    failed: number;
    skipped: number;
    coverage: number;
  };
  
  nextSteps: string[];                     // Prioritized action items
}
```

### Trinity Command Center Display

```typescript
interface CommandCenterView {
  // Health dashboard
  overallHealth: {
    score: number;
    trend: 'up' | 'down' | 'stable';
    lastScan: Date;
  };
  
  // Issue breakdown
  issuesByDomain: Record<DiagnosticDomain, number>;
  issuesBySeverity: Record<string, number>;
  issuesByCategory: Record<IssueCategory, number>;
  
  // Recent activity
  recentIssues: DiagnosticIssue[];
  recentFixes: HotpatchSuggestion[];
  pendingApprovals: NotificationAction[];
  
  // Trends
  issuesTrend: TrendData[];
  performanceTrend: TrendData[];
  
  // Quick actions
  availableActions: QuickAction[];
}
```

---

## Implementation Checklist for Replit Agent

1. [ ] Implement enhanced interfaces (DiagnosticReport, DiagnosticIssue, HotpatchSuggestion)
2. [ ] Add new domains to crawler scope
3. [ ] Implement all test scenarios by category
4. [ ] Add reproduction context to issues
5. [ ] Implement visual evidence capture (screenshots, videos)
6. [ ] Add performance metrics collection
7. [ ] Implement regression tracking
8. [ ] Add expected vs actual assertions
9. [ ] Implement role-based testing matrix
10. [ ] Add mobile/GPS specific tests
11. [ ] Implement security scanning
12. [ ] Add concurrency tests
13. [ ] Implement edge case tests
14. [ ] Add QuickBooks integration tests
15. [ ] Implement notification system hooks
16. [ ] Add Trinity hotpatch workflow integration
17. [ ] Implement Replit Agent report format
18. [ ] Add Command Center display components

---

## Success Criteria

The crawler system is complete when:

1. **100% route coverage** - Every page/endpoint is visited
2. **All roles tested** - Each user role's permissions verified
3. **All devices covered** - Desktop, tablet, mobile tested
4. **All business workflows validated** - Schedule → Time → Payroll → Invoice
5. **Zero false positives** - Issues are real, reproducible bugs
6. **Actionable fixes** - Every issue has a suggested fix
7. **Self-healing capability** - Trinity can auto-fix safe issues
8. **Full audit trail** - Every scan, issue, fix is logged
