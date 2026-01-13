/**
 * CoAIleague Comprehensive Site Crawler & Diagnostic System
 * =========================================================
 * Complete type definitions for the Trinity Debug Triad crawlers
 * with 200+ test scenarios across 25 diagnostic domains.
 * 
 * Includes Trinity metacognition testing for thought engine,
 * learning capabilities, scoring, and mode validation.
 */

// ============================================================================
// DIAGNOSTIC DOMAINS (25 total)
// ============================================================================

export type DiagnosticDomain =
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
  | 'performance_memory'   // Memory leaks, usage
  
  // Trinity AI (NEW)
  | 'trinity_metacognition' // Thought engine, reasoning
  | 'trinity_learning'      // Learning capabilities, memory
  | 'trinity_scoring'       // Confidence, accuracy scores
  | 'trinity_modes';        // Guru mode, Business mode, Personal mode

// ============================================================================
// ISSUE CATEGORIES
// ============================================================================

export type IssueCategory =
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
  | 'data_exposure'        // Sensitive data exposed
  
  // Trinity AI
  | 'trinity_thought_failure'   // Thought engine issues
  | 'trinity_learning_failure'  // Learning/memory issues
  | 'trinity_mode_failure'      // Mode switching issues
  | 'trinity_action_failure';   // Action execution issues

// ============================================================================
// USER ROLES
// ============================================================================

export type UserRole = 
  | 'super_admin'          // Full system access
  | 'root_admin'           // Platform-level admin
  | 'co_admin'             // Co-administrator
  | 'sysops'               // System operations
  | 'company_admin'        // Company owner
  | 'manager'              // Operations manager
  | 'supervisor'           // Field supervisor
  | 'guard'                // Security guard
  | 'contractor'           // Contract worker
  | 'client'               // Client portal user
  | 'unauthenticated';     // Not logged in

// ============================================================================
// CONTEXT INTERFACES
// ============================================================================

export interface DeviceContext {
  type: 'desktop' | 'tablet' | 'mobile';
  os?: 'windows' | 'macos' | 'linux' | 'ios' | 'android';
  screenWidth: number;
  screenHeight: number;
  pixelRatio: number;
  touchEnabled: boolean;
}

export interface BrowserContext {
  name: 'chrome' | 'firefox' | 'safari' | 'edge' | 'mobile-safari' | 'mobile-chrome';
  version: string;
  userAgent: string;
  cookiesEnabled: boolean;
  javascriptEnabled: boolean;
}

export interface NetworkLogEntry {
  url: string;
  method: string;
  status: number;
  duration: number;
  requestHeaders?: Record<string, string>;
  responseHeaders?: Record<string, string>;
  requestBody?: any;
  responseBody?: any;
  error?: string;
}

export interface ConsoleError {
  level: 'log' | 'warn' | 'error';
  message: string;
  source?: string;
  lineNumber?: number;
  timestamp: Date;
}

// ============================================================================
// MASTER DIAGNOSTIC REPORT
// ============================================================================

export interface DiagnosticReport {
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
  
  // Trinity Metacognition Results (NEW)
  trinityMetacognitionReport?: TrinityMetacognitionReport;
}

export interface PerformanceReport {
  averagePageLoadTime: number;
  averageApiResponseTime: number;
  p95PageLoadTime: number;
  p95ApiResponseTime: number;
  slowestPages: { url: string; loadTime: number }[];
  slowestEndpoints: { endpoint: string; responseTime: number }[];
  memoryUsage?: number;
  cpuUsage?: number;
}

export interface CoverageReport {
  totalRoutes: number;
  coveredRoutes: number;
  totalEndpoints: number;
  coveredEndpoints: number;
  totalTestScenarios: number;
  passedTests: number;
  failedTests: number;
  skippedTests: number;
  coveragePercentage: number;
}

export interface PendingFix {
  id: string;
  issueId: string;
  suggestedFix: HotpatchSuggestion;
  requestedAt: Date;
  expiresAt?: Date;
  approvers: string[];
}

export interface ActionItem {
  priority: 1 | 2 | 3 | 4 | 5;
  title: string;
  description: string;
  estimatedTime: string;
  affectedAreas: string[];
  issueIds: string[];
}

export interface RiskAssessment {
  overallRisk: 'low' | 'medium' | 'high' | 'critical';
  businessImpact: string;
  securityRisk: 'none' | 'low' | 'medium' | 'high';
  dataIntegrityRisk: 'none' | 'low' | 'medium' | 'high';
  uptime: number;
  recommendations: string[];
}

// ============================================================================
// ENHANCED DIAGNOSTIC ISSUE
// ============================================================================

export interface DiagnosticIssue {
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

export interface PastIssueReference {
  issueId: string;
  title: string;
  resolvedAt?: Date;
  fixApplied?: string;
  similarity: number;
}

// ============================================================================
// HOTPATCH SUGGESTION
// ============================================================================

export type HotpatchType = 
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

export interface HotpatchSuggestion {
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

export interface FileChange {
  file: string;
  operation: 'modify' | 'create' | 'delete';
  searchReplace?: { search: string; replace: string };
  fullContent?: string;
  diff?: string;
}

export interface TestCase {
  id: string;
  name: string;
  type: 'unit' | 'integration' | 'e2e';
  steps: string[];
  expectedOutcome: string;
}

// ============================================================================
// TRINITY METACOGNITION TESTING (NEW)
// ============================================================================

export interface TrinityMetacognitionReport {
  // Overall Assessment
  overallScore: number;                    // 0-100
  thoughtEngineHealth: 'healthy' | 'degraded' | 'failing';
  learningCapabilityScore: number;         // 0-100
  modeIntegrity: 'verified' | 'partial' | 'broken';
  
  // Thought Engine Tests
  thoughtEngineTests: TrinityThoughtTest[];
  
  // Learning Tests
  learningTests: TrinityLearningTest[];
  
  // Scoring Tests
  scoringTests: TrinityScoringTest[];
  
  // Mode Tests
  modeTests: TrinityModeTest[];
  
  // Action Tests
  actionTests: TrinityActionTest[];
  
  // Summary
  passedTests: number;
  failedTests: number;
  recommendations: string[];
}

export interface TrinityThoughtTest {
  id: string;
  name: string;
  description: string;
  
  // Test execution
  promptUsed: string;
  responseReceived?: string;
  thoughtChainGenerated?: string[];
  iterationsUsed?: number;
  maxIterations?: number;
  
  // Results
  passed: boolean;
  score?: number;
  latency?: number;
  
  // Evidence
  reasoningQuality?: 'excellent' | 'good' | 'fair' | 'poor';
  coherence?: number;
  relevance?: number;
  
  // Issues
  issues?: string[];
}

export interface TrinityLearningTest {
  id: string;
  name: string;
  description: string;
  
  // Test execution
  inputProvided: any;
  expectedLearning: string;
  actualLearning?: string;
  
  // Memory verification
  memoryPersisted: boolean;
  memoryRetrievable: boolean;
  memoryAccurate: boolean;
  
  // Results
  passed: boolean;
  retentionScore?: number;
  
  // Issues
  issues?: string[];
}

export interface TrinityScoringTest {
  id: string;
  name: string;
  description: string;
  
  // Test execution
  scenarioType: 'confidence' | 'accuracy' | 'self_assessment';
  inputContext: any;
  expectedScoreRange?: { min: number; max: number };
  actualScore?: number;
  
  // Calibration
  scoreCalibrated: boolean;
  overconfident: boolean;
  underconfident: boolean;
  
  // Results
  passed: boolean;
  
  // Issues
  issues?: string[];
}

export interface TrinityModeTest {
  id: string;
  name: string;
  description: string;
  
  // Mode testing
  modeType: 'guru' | 'business' | 'personal' | 'fast' | 'enhanced';
  modeActivated: boolean;
  modeCorrectBehavior: boolean;
  modeSwitchingWorks: boolean;
  
  // Specific checks
  responseStyle?: string;
  contextAwareness?: boolean;
  featureSetCorrect?: boolean;
  
  // Results
  passed: boolean;
  
  // Issues
  issues?: string[];
}

export interface TrinityActionTest {
  id: string;
  name: string;
  description: string;
  
  // Action testing
  actionType: string;
  actionCategory: string;
  actionExecuted: boolean;
  actionSucceeded: boolean;
  
  // Execution details
  executionTime?: number;
  resultReturned?: any;
  sideEffectsObserved?: string[];
  
  // Results
  passed: boolean;
  
  // Issues
  issues?: string[];
}

// ============================================================================
// TEST SCENARIOS (200+)
// ============================================================================

export interface TestScenario {
  id: string;
  name: string;
  category: string;
  priority: 1 | 2 | 3;
  domain: DiagnosticDomain;
  description?: string;
  steps?: string[];
  expectedOutcome?: string;
  roles?: UserRole[];
  devices?: ('desktop' | 'tablet' | 'mobile')[];
}

export const TEST_SCENARIOS: TestScenario[] = [
  // ============ AUTHENTICATION (12 tests) ============
  { id: 'auth-001', name: 'Valid login with email/password', category: 'auth', priority: 1, domain: 'authentication' },
  { id: 'auth-002', name: 'Invalid password rejection', category: 'auth', priority: 1, domain: 'authentication' },
  { id: 'auth-003', name: 'Invalid email format rejection', category: 'auth', priority: 2, domain: 'authentication' },
  { id: 'auth-004', name: 'Account lockout after X failures', category: 'auth', priority: 2, domain: 'authentication' },
  { id: 'auth-005', name: 'Password reset flow', category: 'auth', priority: 1, domain: 'authentication' },
  { id: 'auth-006', name: 'Email verification flow', category: 'auth', priority: 2, domain: 'authentication' },
  { id: 'auth-007', name: 'Session persistence across refresh', category: 'auth', priority: 1, domain: 'authentication' },
  { id: 'auth-008', name: 'Session timeout handling', category: 'auth', priority: 2, domain: 'authentication' },
  { id: 'auth-009', name: 'Logout clears all session data', category: 'auth', priority: 1, domain: 'authentication' },
  { id: 'auth-010', name: 'Remember me functionality', category: 'auth', priority: 3, domain: 'authentication' },
  { id: 'auth-011', name: 'Multi-device session management', category: 'auth', priority: 2, domain: 'authentication' },
  { id: 'auth-012', name: 'Force logout from other devices', category: 'auth', priority: 3, domain: 'authentication' },

  // ============ SCHEDULING (44 tests) ============
  { id: 'sched-001', name: 'Create single shift', category: 'scheduling', priority: 1, domain: 'scheduling' },
  { id: 'sched-002', name: 'Create recurring shift', category: 'scheduling', priority: 1, domain: 'scheduling' },
  { id: 'sched-003', name: 'Edit existing shift', category: 'scheduling', priority: 1, domain: 'scheduling' },
  { id: 'sched-004', name: 'Delete shift', category: 'scheduling', priority: 1, domain: 'scheduling' },
  { id: 'sched-005', name: 'Cancel shift with notification', category: 'scheduling', priority: 2, domain: 'scheduling' },
  { id: 'sched-010', name: 'Assign guard to shift', category: 'scheduling', priority: 1, domain: 'scheduling' },
  { id: 'sched-011', name: 'Unassign guard from shift', category: 'scheduling', priority: 1, domain: 'scheduling' },
  { id: 'sched-012', name: 'Reassign shift to different guard', category: 'scheduling', priority: 1, domain: 'scheduling' },
  { id: 'sched-013', name: 'Bulk assign multiple guards', category: 'scheduling', priority: 2, domain: 'scheduling' },
  { id: 'sched-014', name: 'Auto-assign based on availability', category: 'scheduling', priority: 2, domain: 'scheduling' },
  { id: 'sched-020', name: 'Prevent double-booking guard', category: 'scheduling', priority: 1, domain: 'scheduling' },
  { id: 'sched-021', name: 'Prevent overlapping shifts', category: 'scheduling', priority: 1, domain: 'scheduling' },
  { id: 'sched-022', name: 'Respect guard availability', category: 'scheduling', priority: 1, domain: 'scheduling' },
  { id: 'sched-023', name: 'Enforce minimum rest between shifts', category: 'scheduling', priority: 2, domain: 'scheduling' },
  { id: 'sched-024', name: 'Overtime warning threshold', category: 'scheduling', priority: 2, domain: 'scheduling' },
  { id: 'sched-030', name: 'Shift crossing midnight', category: 'scheduling', priority: 1, domain: 'scheduling' },
  { id: 'sched-031', name: 'Shift crossing DST boundary', category: 'scheduling', priority: 2, domain: 'scheduling' },
  { id: 'sched-032', name: 'Multi-day shift (24+ hours)', category: 'scheduling', priority: 2, domain: 'scheduling' },
  { id: 'sched-033', name: 'Split shift (same day, gap)', category: 'scheduling', priority: 2, domain: 'scheduling' },
  { id: 'sched-034', name: 'Shift in different timezone', category: 'scheduling', priority: 2, domain: 'scheduling' },
  { id: 'sched-040', name: 'Daily view displays correctly', category: 'scheduling', priority: 1, domain: 'scheduling' },
  { id: 'sched-041', name: 'Weekly view displays correctly', category: 'scheduling', priority: 1, domain: 'scheduling' },
  { id: 'sched-042', name: 'Monthly view displays correctly', category: 'scheduling', priority: 1, domain: 'scheduling' },
  { id: 'sched-043', name: 'Guard-centric view', category: 'scheduling', priority: 2, domain: 'scheduling' },
  { id: 'sched-044', name: 'Site-centric view', category: 'scheduling', priority: 2, domain: 'scheduling' },

  // ============ TIME TRACKING (24 tests) ============
  { id: 'time-001', name: 'Clock in with GPS verification', category: 'time_tracking', priority: 1, domain: 'time_tracking' },
  { id: 'time-002', name: 'Clock out with GPS verification', category: 'time_tracking', priority: 1, domain: 'time_tracking' },
  { id: 'time-003', name: 'Clock in rejected outside geofence', category: 'time_tracking', priority: 1, domain: 'time_tracking' },
  { id: 'time-004', name: 'Clock in with photo verification', category: 'time_tracking', priority: 2, domain: 'time_tracking' },
  { id: 'time-005', name: 'Break start/end tracking', category: 'time_tracking', priority: 2, domain: 'time_tracking' },
  { id: 'time-010', name: 'Regular hours calculated correctly', category: 'time_tracking', priority: 1, domain: 'time_tracking' },
  { id: 'time-011', name: 'Overtime calculated correctly', category: 'time_tracking', priority: 1, domain: 'time_tracking' },
  { id: 'time-012', name: 'Double-time calculated correctly', category: 'time_tracking', priority: 1, domain: 'time_tracking' },
  { id: 'time-013', name: 'Break time deducted properly', category: 'time_tracking', priority: 1, domain: 'time_tracking' },
  { id: 'time-014', name: 'Midnight crossover calculation', category: 'time_tracking', priority: 1, domain: 'time_tracking' },
  { id: 'time-020', name: 'Forgot to clock out handling', category: 'time_tracking', priority: 1, domain: 'time_tracking' },
  { id: 'time-021', name: 'Manual time entry by supervisor', category: 'time_tracking', priority: 2, domain: 'time_tracking' },
  { id: 'time-022', name: 'Time entry dispute workflow', category: 'time_tracking', priority: 2, domain: 'time_tracking' },
  { id: 'time-023', name: 'GPS failure fallback', category: 'time_tracking', priority: 2, domain: 'time_tracking' },
  { id: 'time-024', name: 'Offline clock in sync', category: 'time_tracking', priority: 1, domain: 'time_tracking' },
  { id: 'time-030', name: 'Timesheet submission', category: 'time_tracking', priority: 1, domain: 'time_tracking' },
  { id: 'time-031', name: 'Supervisor approval workflow', category: 'time_tracking', priority: 1, domain: 'time_tracking' },
  { id: 'time-032', name: 'Timesheet rejection with reason', category: 'time_tracking', priority: 2, domain: 'time_tracking' },
  { id: 'time-033', name: 'Bulk timesheet approval', category: 'time_tracking', priority: 2, domain: 'time_tracking' },

  // ============ PAYROLL (43 tests) ============
  { id: 'pay-001', name: 'Regular pay calculation', category: 'payroll', priority: 1, domain: 'payroll' },
  { id: 'pay-002', name: 'Overtime pay (1.5x)', category: 'payroll', priority: 1, domain: 'payroll' },
  { id: 'pay-003', name: 'Double-time pay (2x)', category: 'payroll', priority: 1, domain: 'payroll' },
  { id: 'pay-004', name: 'Holiday pay calculation', category: 'payroll', priority: 1, domain: 'payroll' },
  { id: 'pay-005', name: 'Different pay rates per site', category: 'payroll', priority: 1, domain: 'payroll' },
  { id: 'pay-006', name: 'Different pay rates per shift type', category: 'payroll', priority: 2, domain: 'payroll' },
  { id: 'pay-010', name: 'Tax withholding calculation', category: 'payroll', priority: 1, domain: 'payroll' },
  { id: 'pay-011', name: 'Benefits deduction', category: 'payroll', priority: 2, domain: 'payroll' },
  { id: 'pay-012', name: 'Garnishment handling', category: 'payroll', priority: 2, domain: 'payroll' },
  { id: 'pay-013', name: 'Advance deduction', category: 'payroll', priority: 2, domain: 'payroll' },
  { id: 'pay-020', name: 'Weekly pay period processing', category: 'payroll', priority: 1, domain: 'payroll' },
  { id: 'pay-021', name: 'Bi-weekly pay period processing', category: 'payroll', priority: 1, domain: 'payroll' },
  { id: 'pay-022', name: 'Semi-monthly pay period processing', category: 'payroll', priority: 2, domain: 'payroll' },
  { id: 'pay-023', name: 'Pay period boundary handling', category: 'payroll', priority: 1, domain: 'payroll' },
  { id: 'pay-030', name: 'Retroactive pay adjustment', category: 'payroll', priority: 2, domain: 'payroll' },
  { id: 'pay-031', name: 'Mid-period rate change', category: 'payroll', priority: 2, domain: 'payroll' },
  { id: 'pay-032', name: 'Negative balance handling', category: 'payroll', priority: 2, domain: 'payroll' },
  { id: 'pay-033', name: 'Rounding rules compliance', category: 'payroll', priority: 2, domain: 'payroll' },
  { id: 'pay-040', name: 'Pay stub generation', category: 'payroll', priority: 1, domain: 'payroll' },
  { id: 'pay-041', name: 'Payroll summary report', category: 'payroll', priority: 1, domain: 'payroll' },
  { id: 'pay-042', name: 'Export to QuickBooks', category: 'payroll', priority: 1, domain: 'payroll' },
  { id: 'pay-043', name: 'Year-end tax documents', category: 'payroll', priority: 2, domain: 'payroll' },

  // ============ INVOICING (42 tests) ============
  { id: 'inv-001', name: 'Generate invoice from timesheet', category: 'invoicing', priority: 1, domain: 'invoicing' },
  { id: 'inv-002', name: 'Manual invoice creation', category: 'invoicing', priority: 1, domain: 'invoicing' },
  { id: 'inv-003', name: 'Recurring invoice generation', category: 'invoicing', priority: 2, domain: 'invoicing' },
  { id: 'inv-004', name: 'Invoice from multiple timesheets', category: 'invoicing', priority: 1, domain: 'invoicing' },
  { id: 'inv-010', name: 'Hourly rate calculation', category: 'invoicing', priority: 1, domain: 'invoicing' },
  { id: 'inv-011', name: 'Overtime billing rate', category: 'invoicing', priority: 1, domain: 'invoicing' },
  { id: 'inv-012', name: 'Holiday billing rate', category: 'invoicing', priority: 1, domain: 'invoicing' },
  { id: 'inv-013', name: 'Tax calculation', category: 'invoicing', priority: 1, domain: 'invoicing' },
  { id: 'inv-014', name: 'Discount application', category: 'invoicing', priority: 2, domain: 'invoicing' },
  { id: 'inv-020', name: 'Invoice approval workflow', category: 'invoicing', priority: 1, domain: 'invoicing' },
  { id: 'inv-021', name: 'Send invoice to client', category: 'invoicing', priority: 1, domain: 'invoicing' },
  { id: 'inv-022', name: 'Payment recording', category: 'invoicing', priority: 1, domain: 'invoicing' },
  { id: 'inv-023', name: 'Partial payment handling', category: 'invoicing', priority: 2, domain: 'invoicing' },
  { id: 'inv-024', name: 'Invoice dispute handling', category: 'invoicing', priority: 2, domain: 'invoicing' },
  { id: 'inv-030', name: 'Credit memo creation', category: 'invoicing', priority: 2, domain: 'invoicing' },
  { id: 'inv-031', name: 'Invoice voiding', category: 'invoicing', priority: 2, domain: 'invoicing' },
  { id: 'inv-032', name: 'Late fee calculation', category: 'invoicing', priority: 3, domain: 'invoicing' },
  { id: 'inv-040', name: 'QuickBooks sync', category: 'invoicing', priority: 1, domain: 'quickbooks' },
  { id: 'inv-041', name: 'PDF generation', category: 'invoicing', priority: 1, domain: 'invoicing' },
  { id: 'inv-042', name: 'Email delivery', category: 'invoicing', priority: 1, domain: 'invoicing' },

  // ============ INCIDENT REPORTING (42 tests) ============
  { id: 'inc-001', name: 'Daily Activity Report (DAR) creation', category: 'incident', priority: 1, domain: 'incident_reporting' },
  { id: 'inc-002', name: 'Incident Report creation', category: 'incident', priority: 1, domain: 'incident_reporting' },
  { id: 'inc-003', name: 'Contact Report creation', category: 'incident', priority: 1, domain: 'incident_reporting' },
  { id: 'inc-004', name: 'Maintenance Request creation', category: 'incident', priority: 2, domain: 'incident_reporting' },
  { id: 'inc-005', name: 'Custom report type', category: 'incident', priority: 3, domain: 'incident_reporting' },
  { id: 'inc-010', name: 'Report submission', category: 'incident', priority: 1, domain: 'incident_reporting' },
  { id: 'inc-011', name: 'Supervisor review', category: 'incident', priority: 1, domain: 'incident_reporting' },
  { id: 'inc-012', name: 'Manager approval', category: 'incident', priority: 1, domain: 'incident_reporting' },
  { id: 'inc-013', name: 'Client delivery', category: 'incident', priority: 1, domain: 'incident_reporting' },
  { id: 'inc-014', name: 'Report rejection with feedback', category: 'incident', priority: 2, domain: 'incident_reporting' },
  { id: 'inc-020', name: 'Trinity AI grammar correction', category: 'incident', priority: 1, domain: 'trinity_ai' },
  { id: 'inc-021', name: 'Trinity AI legal articulation', category: 'incident', priority: 1, domain: 'trinity_ai' },
  { id: 'inc-022', name: 'Trinity AI template suggestions', category: 'incident', priority: 2, domain: 'trinity_ai' },
  { id: 'inc-030', name: 'Photo attachment upload', category: 'incident', priority: 1, domain: 'incident_reporting' },
  { id: 'inc-031', name: 'Multiple photo upload', category: 'incident', priority: 2, domain: 'incident_reporting' },
  { id: 'inc-032', name: 'Video attachment', category: 'incident', priority: 3, domain: 'incident_reporting' },
  { id: 'inc-033', name: 'Document attachment', category: 'incident', priority: 2, domain: 'incident_reporting' },
  { id: 'inc-040', name: 'Mobile report creation', category: 'incident', priority: 1, domain: 'mobile_app' },
  { id: 'inc-041', name: 'Offline report creation', category: 'incident', priority: 1, domain: 'offline_mode' },
  { id: 'inc-042', name: 'Offline sync when connected', category: 'incident', priority: 1, domain: 'offline_mode' },

  // ============ PERMISSIONS & ROLES (42 tests) ============
  { id: 'perm-001', name: 'Guard can view own schedule', category: 'permissions', priority: 1, domain: 'authorization' },
  { id: 'perm-002', name: 'Guard cannot view other schedules', category: 'permissions', priority: 1, domain: 'authorization' },
  { id: 'perm-003', name: 'Guard can clock in/out', category: 'permissions', priority: 1, domain: 'authorization' },
  { id: 'perm-004', name: 'Guard can submit reports', category: 'permissions', priority: 1, domain: 'authorization' },
  { id: 'perm-005', name: 'Guard cannot approve timesheets', category: 'permissions', priority: 1, domain: 'authorization' },
  { id: 'perm-006', name: 'Guard cannot access payroll', category: 'permissions', priority: 1, domain: 'authorization' },
  { id: 'perm-010', name: 'Supervisor can view team schedules', category: 'permissions', priority: 1, domain: 'authorization' },
  { id: 'perm-011', name: 'Supervisor can approve timesheets', category: 'permissions', priority: 1, domain: 'authorization' },
  { id: 'perm-012', name: 'Supervisor can review reports', category: 'permissions', priority: 1, domain: 'authorization' },
  { id: 'perm-013', name: 'Supervisor cannot access financials', category: 'permissions', priority: 1, domain: 'authorization' },
  { id: 'perm-020', name: 'Manager can create schedules', category: 'permissions', priority: 1, domain: 'authorization' },
  { id: 'perm-021', name: 'Manager can run payroll', category: 'permissions', priority: 1, domain: 'authorization' },
  { id: 'perm-022', name: 'Manager can generate invoices', category: 'permissions', priority: 1, domain: 'authorization' },
  { id: 'perm-023', name: 'Manager can view all reports', category: 'permissions', priority: 1, domain: 'authorization' },
  { id: 'perm-030', name: 'Admin can manage users', category: 'permissions', priority: 1, domain: 'authorization' },
  { id: 'perm-031', name: 'Admin can change settings', category: 'permissions', priority: 1, domain: 'authorization' },
  { id: 'perm-032', name: 'Admin can access all data', category: 'permissions', priority: 1, domain: 'authorization' },
  { id: 'perm-040', name: 'Role escalation prevention', category: 'permissions', priority: 1, domain: 'security_auth' },
  { id: 'perm-041', name: 'API permission enforcement', category: 'permissions', priority: 1, domain: 'security_auth' },
  { id: 'perm-042', name: 'URL direct access prevention', category: 'permissions', priority: 1, domain: 'security_auth' },

  // ============ MOBILE & GPS (42 tests) ============
  { id: 'mob-001', name: 'Login page mobile layout', category: 'mobile', priority: 1, domain: 'mobile_app' },
  { id: 'mob-002', name: 'Dashboard mobile layout', category: 'mobile', priority: 1, domain: 'mobile_app' },
  { id: 'mob-003', name: 'Schedule view mobile layout', category: 'mobile', priority: 1, domain: 'mobile_app' },
  { id: 'mob-004', name: 'Time clock mobile layout', category: 'mobile', priority: 1, domain: 'mobile_app' },
  { id: 'mob-005', name: 'Report form mobile layout', category: 'mobile', priority: 1, domain: 'mobile_app' },
  { id: 'mob-010', name: 'Touch targets minimum 44px', category: 'mobile', priority: 1, domain: 'mobile_app' },
  { id: 'mob-011', name: 'Swipe gestures work', category: 'mobile', priority: 2, domain: 'mobile_app' },
  { id: 'mob-012', name: 'Pull to refresh', category: 'mobile', priority: 2, domain: 'mobile_app' },
  { id: 'mob-013', name: 'Long press actions', category: 'mobile', priority: 3, domain: 'mobile_app' },
  { id: 'mob-020', name: 'GPS permission request', category: 'mobile', priority: 1, domain: 'gps_location' },
  { id: 'mob-021', name: 'Location accuracy verification', category: 'mobile', priority: 1, domain: 'gps_location' },
  { id: 'mob-022', name: 'Geofence boundary detection', category: 'mobile', priority: 1, domain: 'gps_location' },
  { id: 'mob-023', name: 'GPS failure graceful handling', category: 'mobile', priority: 1, domain: 'gps_location' },
  { id: 'mob-024', name: 'Background location tracking', category: 'mobile', priority: 2, domain: 'gps_location' },
  { id: 'mob-030', name: 'Offline mode activation', category: 'mobile', priority: 1, domain: 'offline_mode' },
  { id: 'mob-031', name: 'Data queuing when offline', category: 'mobile', priority: 1, domain: 'offline_mode' },
  { id: 'mob-032', name: 'Sync when connection restored', category: 'mobile', priority: 1, domain: 'offline_mode' },
  { id: 'mob-033', name: 'Conflict resolution after sync', category: 'mobile', priority: 2, domain: 'offline_mode' },
  { id: 'mob-034', name: 'Offline indicator displayed', category: 'mobile', priority: 1, domain: 'offline_mode' },
  { id: 'mob-040', name: 'App load time under 3s on 3G', category: 'mobile', priority: 1, domain: 'performance_load' },
  { id: 'mob-041', name: 'Smooth scrolling (60fps)', category: 'mobile', priority: 2, domain: 'performance_load' },
  { id: 'mob-042', name: 'Memory usage stays stable', category: 'mobile', priority: 2, domain: 'performance_memory' },

  // ============ INTEGRATIONS (QuickBooks, Email, SMS) ============
  { id: 'qb-001', name: 'QuickBooks initial connection', category: 'integration', priority: 1, domain: 'quickbooks' },
  { id: 'qb-002', name: 'Employee sync to QB', category: 'integration', priority: 1, domain: 'quickbooks' },
  { id: 'qb-003', name: 'Client sync to QB', category: 'integration', priority: 1, domain: 'quickbooks' },
  { id: 'qb-004', name: 'Invoice sync to QB', category: 'integration', priority: 1, domain: 'quickbooks' },
  { id: 'qb-005', name: 'Payment sync from QB', category: 'integration', priority: 1, domain: 'quickbooks' },
  { id: 'qb-006', name: 'Payroll export to QB', category: 'integration', priority: 1, domain: 'quickbooks' },
  { id: 'qb-007', name: 'QB token refresh', category: 'integration', priority: 1, domain: 'quickbooks' },
  { id: 'qb-008', name: 'QB sync conflict resolution', category: 'integration', priority: 2, domain: 'quickbooks' },
  { id: 'qb-009', name: 'QB disconnection handling', category: 'integration', priority: 2, domain: 'quickbooks' },
  { id: 'qb-010', name: 'QB data validation before sync', category: 'integration', priority: 1, domain: 'quickbooks' },
  { id: 'email-001', name: 'Welcome email delivery', category: 'integration', priority: 1, domain: 'notifications' },
  { id: 'email-002', name: 'Password reset email', category: 'integration', priority: 1, domain: 'notifications' },
  { id: 'email-003', name: 'Invoice email delivery', category: 'integration', priority: 1, domain: 'notifications' },
  { id: 'email-004', name: 'Report email delivery', category: 'integration', priority: 1, domain: 'notifications' },
  { id: 'email-005', name: 'Notification email delivery', category: 'integration', priority: 2, domain: 'notifications' },
  { id: 'sms-001', name: 'Shift reminder SMS', category: 'integration', priority: 2, domain: 'notifications' },
  { id: 'sms-002', name: 'Emergency alert SMS', category: 'integration', priority: 1, domain: 'notifications' },
  { id: 'sms-003', name: 'Two-factor auth SMS', category: 'integration', priority: 1, domain: 'notifications' },

  // ============ SECURITY (34 tests) ============
  { id: 'sec-001', name: 'SQL injection in login', category: 'security', priority: 1, domain: 'security_input' },
  { id: 'sec-002', name: 'Brute force protection', category: 'security', priority: 1, domain: 'security_auth' },
  { id: 'sec-003', name: 'Session fixation prevention', category: 'security', priority: 1, domain: 'security_auth' },
  { id: 'sec-004', name: 'CSRF token validation', category: 'security', priority: 1, domain: 'security_auth' },
  { id: 'sec-005', name: 'JWT token validation', category: 'security', priority: 1, domain: 'security_auth' },
  { id: 'sec-006', name: 'Password complexity enforcement', category: 'security', priority: 2, domain: 'security_auth' },
  { id: 'sec-010', name: 'Horizontal privilege escalation', category: 'security', priority: 1, domain: 'security_auth' },
  { id: 'sec-011', name: 'Vertical privilege escalation', category: 'security', priority: 1, domain: 'security_auth' },
  { id: 'sec-012', name: 'IDOR (Insecure Direct Object Reference)', category: 'security', priority: 1, domain: 'security_auth' },
  { id: 'sec-013', name: 'API key exposure check', category: 'security', priority: 1, domain: 'security_data' },
  { id: 'sec-020', name: 'XSS in text fields', category: 'security', priority: 1, domain: 'security_input' },
  { id: 'sec-021', name: 'XSS in URL parameters', category: 'security', priority: 1, domain: 'security_input' },
  { id: 'sec-022', name: 'SQL injection in search', category: 'security', priority: 1, domain: 'security_input' },
  { id: 'sec-023', name: 'File upload validation', category: 'security', priority: 1, domain: 'security_input' },
  { id: 'sec-024', name: 'Path traversal prevention', category: 'security', priority: 1, domain: 'security_input' },
  { id: 'sec-030', name: 'Sensitive data in logs', category: 'security', priority: 1, domain: 'security_data' },
  { id: 'sec-031', name: 'Sensitive data in URL', category: 'security', priority: 1, domain: 'security_data' },
  { id: 'sec-032', name: 'PII exposure in API responses', category: 'security', priority: 1, domain: 'security_data' },
  { id: 'sec-033', name: 'Encryption at rest', category: 'security', priority: 2, domain: 'security_data' },
  { id: 'sec-034', name: 'HTTPS enforcement', category: 'security', priority: 1, domain: 'security_data' },

  // ============ PERFORMANCE (32 tests) ============
  { id: 'perf-001', name: 'Homepage load < 2s', category: 'performance', priority: 1, domain: 'performance_load' },
  { id: 'perf-002', name: 'Dashboard load < 3s', category: 'performance', priority: 1, domain: 'performance_load' },
  { id: 'perf-003', name: 'Schedule page load < 2s', category: 'performance', priority: 1, domain: 'performance_load' },
  { id: 'perf-004', name: 'Report page load < 2s', category: 'performance', priority: 1, domain: 'performance_load' },
  { id: 'perf-010', name: 'API GET requests < 500ms', category: 'performance', priority: 1, domain: 'performance_api' },
  { id: 'perf-011', name: 'API POST requests < 1s', category: 'performance', priority: 1, domain: 'performance_api' },
  { id: 'perf-012', name: 'Report generation < 5s', category: 'performance', priority: 2, domain: 'performance_api' },
  { id: 'perf-013', name: 'Payroll calculation < 10s', category: 'performance', priority: 2, domain: 'performance_api' },
  { id: 'perf-020', name: 'Schedule query < 100ms', category: 'performance', priority: 1, domain: 'performance_database' },
  { id: 'perf-021', name: 'Employee list query < 200ms', category: 'performance', priority: 1, domain: 'performance_database' },
  { id: 'perf-022', name: 'Report search < 500ms', category: 'performance', priority: 2, domain: 'performance_database' },
  { id: 'perf-023', name: 'No N+1 query issues', category: 'performance', priority: 1, domain: 'performance_database' },
  { id: 'perf-030', name: 'Handle 50 concurrent users', category: 'performance', priority: 2, domain: 'performance_load' },
  { id: 'perf-031', name: 'Handle 100 concurrent users', category: 'performance', priority: 3, domain: 'performance_load' },
  { id: 'perf-032', name: 'No deadlocks under load', category: 'performance', priority: 1, domain: 'performance_database' },

  // ============ CONCURRENCY (8 tests) ============
  { id: 'conc-001', name: 'Two managers edit same shift', category: 'concurrency', priority: 1, domain: 'scheduling' },
  { id: 'conc-002', name: 'Simultaneous clock-ins', category: 'concurrency', priority: 1, domain: 'time_tracking' },
  { id: 'conc-003', name: 'Concurrent timesheet approvals', category: 'concurrency', priority: 2, domain: 'time_tracking' },
  { id: 'conc-004', name: 'Parallel invoice generation', category: 'concurrency', priority: 2, domain: 'invoicing' },
  { id: 'conc-005', name: 'Race condition in QB sync', category: 'concurrency', priority: 1, domain: 'quickbooks' },
  { id: 'conc-006', name: 'Concurrent report submissions', category: 'concurrency', priority: 2, domain: 'incident_reporting' },
  { id: 'conc-007', name: 'Parallel payroll processing', category: 'concurrency', priority: 1, domain: 'payroll' },
  { id: 'conc-008', name: 'Optimistic locking enforcement', category: 'concurrency', priority: 1, domain: 'database' },

  // ============ EDGE CASES (34 tests) ============
  { id: 'edge-001', name: 'Dashboard with no data', category: 'edge', priority: 1, domain: 'ui_render' },
  { id: 'edge-002', name: 'Schedule with no shifts', category: 'edge', priority: 1, domain: 'ui_render' },
  { id: 'edge-003', name: 'First-time user experience', category: 'edge', priority: 1, domain: 'onboarding' },
  { id: 'edge-004', name: 'Company with no employees', category: 'edge', priority: 2, domain: 'user_management' },
  { id: 'edge-010', name: 'Maximum employees (999+)', category: 'edge', priority: 2, domain: 'performance_load' },
  { id: 'edge-011', name: 'Maximum shifts per day', category: 'edge', priority: 2, domain: 'scheduling' },
  { id: 'edge-012', name: 'Very long report text', category: 'edge', priority: 2, domain: 'incident_reporting' },
  { id: 'edge-013', name: 'Large file upload', category: 'edge', priority: 2, domain: 'file_storage' },
  { id: 'edge-020', name: 'Daylight saving time transition', category: 'edge', priority: 1, domain: 'time_tracking' },
  { id: 'edge-021', name: 'Leap year date handling', category: 'edge', priority: 3, domain: 'time_tracking' },
  { id: 'edge-022', name: 'Year boundary (Dec 31 - Jan 1)', category: 'edge', priority: 1, domain: 'time_tracking' },
  { id: 'edge-023', name: 'Month boundary shifts', category: 'edge', priority: 1, domain: 'scheduling' },
  { id: 'edge-030', name: 'Unicode characters in names', category: 'edge', priority: 2, domain: 'ui_interaction' },
  { id: 'edge-031', name: 'Special characters in passwords', category: 'edge', priority: 1, domain: 'authentication' },
  { id: 'edge-032', name: 'Very long names', category: 'edge', priority: 2, domain: 'ui_render' },
  { id: 'edge-033', name: 'Empty string submissions', category: 'edge', priority: 1, domain: 'ui_interaction' },
  { id: 'edge-034', name: 'Null value handling', category: 'edge', priority: 1, domain: 'api_internal' },

  // ============ TRINITY METACOGNITION (25 tests) ============
  { id: 'trinity-001', name: 'Thought engine generates coherent reasoning', category: 'trinity', priority: 1, domain: 'trinity_metacognition' },
  { id: 'trinity-002', name: 'Iteration loop continues until success', category: 'trinity', priority: 1, domain: 'trinity_metacognition' },
  { id: 'trinity-003', name: 'Self-reflection identifies errors', category: 'trinity', priority: 1, domain: 'trinity_metacognition' },
  { id: 'trinity-004', name: 'Thought chain maintains context', category: 'trinity', priority: 1, domain: 'trinity_metacognition' },
  { id: 'trinity-005', name: 'Max iteration limit respected', category: 'trinity', priority: 2, domain: 'trinity_metacognition' },
  { id: 'trinity-010', name: 'Memory persists across sessions', category: 'trinity', priority: 1, domain: 'trinity_learning' },
  { id: 'trinity-011', name: 'Learning from user feedback', category: 'trinity', priority: 1, domain: 'trinity_learning' },
  { id: 'trinity-012', name: 'Pattern recognition from history', category: 'trinity', priority: 1, domain: 'trinity_learning' },
  { id: 'trinity-013', name: 'Knowledge retrieval accuracy', category: 'trinity', priority: 1, domain: 'trinity_learning' },
  { id: 'trinity-014', name: 'Memory consolidation works', category: 'trinity', priority: 2, domain: 'trinity_learning' },
  { id: 'trinity-020', name: 'Confidence scoring calibrated', category: 'trinity', priority: 1, domain: 'trinity_scoring' },
  { id: 'trinity-021', name: 'Self-assessment accuracy', category: 'trinity', priority: 1, domain: 'trinity_scoring' },
  { id: 'trinity-022', name: 'Uncertainty expressed when appropriate', category: 'trinity', priority: 1, domain: 'trinity_scoring' },
  { id: 'trinity-023', name: 'Score improves with correct actions', category: 'trinity', priority: 2, domain: 'trinity_scoring' },
  { id: 'trinity-030', name: 'Guru mode activates correctly', category: 'trinity', priority: 1, domain: 'trinity_modes' },
  { id: 'trinity-031', name: 'Business mode behavior correct', category: 'trinity', priority: 1, domain: 'trinity_modes' },
  { id: 'trinity-032', name: 'Personal/Buddy mode works', category: 'trinity', priority: 1, domain: 'trinity_modes' },
  { id: 'trinity-033', name: 'Fast mode executes quickly', category: 'trinity', priority: 1, domain: 'trinity_modes' },
  { id: 'trinity-034', name: 'Mode switching preserves context', category: 'trinity', priority: 2, domain: 'trinity_modes' },
  { id: 'trinity-040', name: 'Action execution completes', category: 'trinity', priority: 1, domain: 'trinity_ai' },
  { id: 'trinity-041', name: 'Action result returned correctly', category: 'trinity', priority: 1, domain: 'trinity_ai' },
  { id: 'trinity-042', name: 'Action rollback on failure', category: 'trinity', priority: 2, domain: 'trinity_ai' },
  { id: 'trinity-043', name: 'Hotpatch suggestion quality', category: 'trinity', priority: 1, domain: 'trinity_ai' },
  { id: 'trinity-044', name: 'Autonomous scheduling works', category: 'trinity', priority: 1, domain: 'trinity_ai' },
  { id: 'trinity-045', name: 'Platform health monitoring active', category: 'trinity', priority: 1, domain: 'trinity_ai' },
];

// ============================================================================
// REPLIT AGENT REPORT FORMAT
// ============================================================================

export interface ReplitAgentReport {
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
  
  trinityHealth?: TrinityMetacognitionReport;
  
  nextSteps: string[];                     // Prioritized action items
}

// ============================================================================
// COMMAND CENTER DISPLAY
// ============================================================================

export interface CommandCenterView {
  // Health dashboard
  overallHealth: {
    score: number;
    trend: 'up' | 'down' | 'stable';
    lastScan: Date;
  };
  
  // Issue breakdown
  issuesByDomain: Record<DiagnosticDomain, number>;
  issuesBySeverity: Record<string, number>;
  issuesByCategory: Record<string, number>;
  
  // Recent activity
  recentIssues: DiagnosticIssue[];
  recentFixes: HotpatchSuggestion[];
  pendingApprovals: PendingFix[];
  
  // Trends
  issuesTrend: TrendData[];
  performanceTrend: TrendData[];
  
  // Quick actions
  availableActions: QuickAction[];
  
  // Trinity Status
  trinityStatus?: {
    mode: string;
    readiness: number;
    lastThought?: string;
    activeActions: number;
  };
}

export interface TrendData {
  timestamp: Date;
  value: number;
  label?: string;
}

export interface QuickAction {
  id: string;
  label: string;
  icon: string;
  action: string;
  requiresConfirmation: boolean;
}

// ============================================================================
// CRAWLER CONFIGURATION
// ============================================================================

export interface CrawlerConfig {
  // Scope
  baseUrl: string;
  includedPaths: string[];
  excludedPaths: string[];
  maxDepth: number;
  
  // Authentication
  testAccounts: TestAccount[];
  
  // Timing
  requestDelay: number;
  timeout: number;
  maxRetries: number;
  
  // Parallel execution
  parallelAgents: number;
  
  // Reporting
  reportingEndpoint: string;
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
  enableTrinityMetacognition: boolean;
}

export interface TestAccount {
  role: UserRole;
  email: string;
  password: string;
}

export interface PerformanceThresholds {
  pageLoadTime: number;
  apiResponseTime: number;
  timeToInteractive: number;
  largestContentfulPaint: number;
  cumulativeLayoutShift: number;
  firstInputDelay: number;
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

export function getTestsByDomain(domain: DiagnosticDomain): TestScenario[] {
  return TEST_SCENARIOS.filter(t => t.domain === domain);
}

export function getTestsByCategory(category: string): TestScenario[] {
  return TEST_SCENARIOS.filter(t => t.category === category);
}

export function getTestsByPriority(priority: 1 | 2 | 3): TestScenario[] {
  return TEST_SCENARIOS.filter(t => t.priority === priority);
}

export function getTrinityTests(): TestScenario[] {
  return TEST_SCENARIOS.filter(t => t.category === 'trinity');
}

export function getCriticalTests(): TestScenario[] {
  return TEST_SCENARIOS.filter(t => t.priority === 1);
}

export const TOTAL_TEST_COUNT = TEST_SCENARIOS.length;
export const DOMAIN_COUNT = 25 + 4; // 25 original + 4 trinity domains
