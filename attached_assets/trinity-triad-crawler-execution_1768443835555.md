# Trinity Triad Crawler - Full Platform Verification

## Overview

Now that the authentication system is in place with test mode bypass, run the Trinity Triad Crawlers in **PARALLEL MODE** to verify 100% of platform functionality.

**Auth Header for All Requests:**
```javascript
headers: { 'x-test-key': process.env.TEST_SECRET }
```

**Goal:** 100% coverage. Every button. Every link. Every CRUD operation. Every setting. Zero bugs.

---

## Crawler Architecture

### Run All Three Agents in Parallel

```javascript
await Promise.all([
  runUICrawler(),      // Agent 1: UI/Visual/Interaction
  runAPICrawler(),     // Agent 2: API/Endpoint/Data
  runIntegrationCrawler() // Agent 3: Workflows/E2E/Business Logic
]);
```

### Shared Test User

Create/use this test user for all crawlers:
```javascript
const TEST_USER = {
  email: 'trinity-test@coaileague.com',
  password: 'TrinityTest123!',
  role: 'admin',
  workspaceId: '<test-workspace-id>'
};
```

---

## AGENT 1: UI CRAWLER

### Every Page - Visual & Interaction Tests

For EACH of the 72+ routes:

```javascript
async function testPage(url) {
  await page.goto(url, { waitUntil: 'networkidle0' });
  
  // 1. Page loads without error
  const consoleErrors = [];
  page.on('console', msg => { if (msg.type() === 'error') consoleErrors.push(msg.text()); });
  
  // 2. No broken images
  const brokenImages = await page.$$eval('img', imgs => 
    imgs.filter(img => !img.complete || img.naturalWidth === 0).map(img => img.src)
  );
  
  // 3. No broken links
  const brokenLinks = await checkAllLinks(page);
  
  // 4. All buttons clickable
  const buttons = await page.$$('button, [role="button"], a.btn');
  for (const btn of buttons) {
    const isClickable = await btn.isIntersectingViewport();
    const isDisabled = await btn.evaluate(el => el.disabled);
    // Log any non-clickable non-disabled buttons
  }
  
  // 5. All forms have proper labels
  const unlabeledInputs = await page.$$eval('input, select, textarea', inputs =>
    inputs.filter(i => !i.labels?.length && !i.getAttribute('aria-label')).map(i => i.name || i.id)
  );
  
  // 6. Mobile responsive
  await page.setViewport({ width: 375, height: 667 }); // iPhone SE
  const mobileOverflow = await page.evaluate(() => document.body.scrollWidth > window.innerWidth);
  
  // 7. Tablet responsive
  await page.setViewport({ width: 768, height: 1024 }); // iPad
  
  // 8. Desktop
  await page.setViewport({ width: 1920, height: 1080 });
  
  return { url, consoleErrors, brokenImages, brokenLinks, unlabeledInputs, mobileOverflow };
}
```

### All Interactive Elements to Test

```javascript
const UI_TESTS = {
  // BUTTONS - Click every single one
  buttons: [
    'button',
    '[role="button"]',
    'a.btn',
    '.btn',
    '[data-testid*="button"]',
    '[data-testid*="btn"]'
  ],
  
  // DROPDOWNS - Open and select options
  dropdowns: [
    'select',
    '[role="listbox"]',
    '[role="combobox"]',
    '.dropdown',
    '[data-testid*="select"]',
    '[data-testid*="dropdown"]'
  ],
  
  // MODALS - Open and close
  modalTriggers: [
    '[data-testid*="modal"]',
    '[data-toggle="modal"]',
    'button:contains("Add")',
    'button:contains("Create")',
    'button:contains("New")',
    'button:contains("Edit")',
    'button:contains("Delete")'
  ],
  
  // TABS - Click each tab
  tabs: [
    '[role="tab"]',
    '.tab',
    '[data-testid*="tab"]'
  ],
  
  // TOGGLES - Switch on/off
  toggles: [
    'input[type="checkbox"]',
    'input[type="radio"]',
    '[role="switch"]',
    '.toggle',
    '[data-testid*="toggle"]'
  ],
  
  // ACCORDIONS - Expand/collapse
  accordions: [
    '[role="button"][aria-expanded]',
    '.accordion',
    '[data-testid*="accordion"]',
    '[data-testid*="expand"]',
    '[data-testid*="collapse"]'
  ],
  
  // DATE PICKERS
  datePickers: [
    'input[type="date"]',
    'input[type="datetime-local"]',
    '.date-picker',
    '[data-testid*="date"]'
  ],
  
  // FILE UPLOADS
  fileUploads: [
    'input[type="file"]',
    '[data-testid*="upload"]',
    '.file-upload'
  ],
  
  // SEARCH
  search: [
    'input[type="search"]',
    '[data-testid*="search"]',
    '.search-input'
  ]
};
```

---

## AGENT 2: API CRAWLER

### Every Endpoint - Full CRUD Testing

```javascript
const API_TESTS = {
  // AUTH
  auth: [
    { method: 'POST', path: '/api/auth/register', body: { email: 'new@test.com', password: 'Test123!' } },
    { method: 'POST', path: '/api/auth/login', body: { email: 'test@test.com', password: 'Test123!' } },
    { method: 'GET', path: '/api/auth/session' },
    { method: 'POST', path: '/api/auth/logout' },
    { method: 'POST', path: '/api/auth/magic-link', body: { email: 'test@test.com' } },
    { method: 'POST', path: '/api/auth/forgot-password', body: { email: 'test@test.com' } },
  ],

  // EMPLOYEES - Full CRUD
  employees: [
    { method: 'GET', path: '/api/employees', expect: 'array' },
    { method: 'GET', path: '/api/employees/:id', expect: 'object' },
    { method: 'POST', path: '/api/employees', body: {
      email: `test-${Date.now()}@test.com`,
      firstName: 'Test',
      lastName: 'Employee',
      role: 'guard'
    }},
    { method: 'PUT', path: '/api/employees/:id', body: { firstName: 'Updated' } },
    { method: 'DELETE', path: '/api/employees/:id' },
    { method: 'POST', path: '/api/employees/invite', body: { email: `invite-${Date.now()}@test.com` } },
    { method: 'GET', path: '/api/employees/pending-invites' },
  ],

  // SCHEDULES - Full CRUD
  schedules: [
    { method: 'GET', path: '/api/schedules' },
    { method: 'GET', path: '/api/schedules/:id' },
    { method: 'POST', path: '/api/schedules', body: {
      title: 'Test Shift',
      date: new Date().toISOString().split('T')[0],
      startTime: '09:00',
      endTime: '17:00',
      siteId: ':siteId'
    }},
    { method: 'PUT', path: '/api/schedules/:id', body: { title: 'Updated Shift' } },
    { method: 'DELETE', path: '/api/schedules/:id' },
    { method: 'POST', path: '/api/schedules/:id/assign', body: { employeeId: ':employeeId' } },
    { method: 'POST', path: '/api/schedules/:id/unassign', body: { employeeId: ':employeeId' } },
    { method: 'GET', path: '/api/schedules/by-employee/:employeeId' },
    { method: 'GET', path: '/api/schedules/by-site/:siteId' },
    { method: 'GET', path: '/api/schedules/by-date-range', query: { start: '2026-01-01', end: '2026-01-31' } },
  ],

  // TIME TRACKING - Full CRUD
  timeTracking: [
    { method: 'GET', path: '/api/time-entries' },
    { method: 'GET', path: '/api/time-entries/:id' },
    { method: 'POST', path: '/api/time/clock-in', body: {
      shiftId: ':shiftId',
      location: { lat: 29.5785, lng: -98.6196 }
    }},
    { method: 'POST', path: '/api/time/clock-out', body: {
      timeEntryId: ':timeEntryId',
      location: { lat: 29.5785, lng: -98.6196 }
    }},
    { method: 'POST', path: '/api/time/break-start', body: { timeEntryId: ':timeEntryId' } },
    { method: 'POST', path: '/api/time/break-end', body: { timeEntryId: ':timeEntryId' } },
    { method: 'PUT', path: '/api/time-entries/:id', body: { notes: 'Updated entry' } },
    { method: 'GET', path: '/api/timesheets' },
    { method: 'POST', path: '/api/timesheets/:id/submit' },
    { method: 'POST', path: '/api/timesheets/:id/approve' },
    { method: 'POST', path: '/api/timesheets/:id/reject', body: { reason: 'Test rejection' } },
  ],

  // CLIENTS - Full CRUD
  clients: [
    { method: 'GET', path: '/api/clients' },
    { method: 'GET', path: '/api/clients/:id' },
    { method: 'POST', path: '/api/clients', body: {
      name: 'Test Client',
      email: `client-${Date.now()}@test.com`,
      phone: '555-0100'
    }},
    { method: 'PUT', path: '/api/clients/:id', body: { name: 'Updated Client' } },
    { method: 'DELETE', path: '/api/clients/:id' },
  ],

  // SITES - Full CRUD
  sites: [
    { method: 'GET', path: '/api/sites' },
    { method: 'GET', path: '/api/sites/:id' },
    { method: 'POST', path: '/api/sites', body: {
      name: 'Test Site',
      address: '123 Test St',
      clientId: ':clientId',
      geofence: { lat: 29.5785, lng: -98.6196, radius: 100 }
    }},
    { method: 'PUT', path: '/api/sites/:id', body: { name: 'Updated Site' } },
    { method: 'DELETE', path: '/api/sites/:id' },
  ],

  // INVOICES - Full CRUD
  invoices: [
    { method: 'GET', path: '/api/invoices' },
    { method: 'GET', path: '/api/invoices/:id' },
    { method: 'POST', path: '/api/invoices', body: {
      clientId: ':clientId',
      lineItems: [{ description: 'Security Services', quantity: 40, rate: 25 }]
    }},
    { method: 'PUT', path: '/api/invoices/:id', body: { status: 'sent' } },
    { method: 'DELETE', path: '/api/invoices/:id' },
    { method: 'POST', path: '/api/invoices/:id/send' },
    { method: 'POST', path: '/api/invoices/:id/mark-paid', body: { amount: 1000, method: 'check' } },
    { method: 'GET', path: '/api/invoices/:id/pdf' },
  ],

  // PAYROLL - Full CRUD
  payroll: [
    { method: 'GET', path: '/api/payroll/runs' },
    { method: 'GET', path: '/api/payroll/runs/:id' },
    { method: 'POST', path: '/api/payroll/runs', body: {
      periodStart: '2026-01-01',
      periodEnd: '2026-01-07'
    }},
    { method: 'POST', path: '/api/payroll/runs/:id/calculate' },
    { method: 'POST', path: '/api/payroll/runs/:id/approve' },
    { method: 'POST', path: '/api/payroll/runs/:id/process' },
    { method: 'GET', path: '/api/payroll/employee/:employeeId/pay-stubs' },
  ],

  // REPORTS - Full CRUD
  reports: [
    { method: 'GET', path: '/api/reports' },
    { method: 'GET', path: '/api/reports/:id' },
    { method: 'POST', path: '/api/reports', body: {
      type: 'incident',
      title: 'Test Incident Report',
      description: 'Automated test report',
      siteId: ':siteId'
    }},
    { method: 'PUT', path: '/api/reports/:id', body: { status: 'submitted' } },
    { method: 'DELETE', path: '/api/reports/:id' },
    { method: 'POST', path: '/api/reports/:id/submit' },
    { method: 'POST', path: '/api/reports/:id/approve' },
    { method: 'POST', path: '/api/reports/:id/reject', body: { reason: 'Needs more detail' } },
    { method: 'POST', path: '/api/reports/:id/send-to-client' },
  ],

  // NOTIFICATIONS - Full CRUD
  notifications: [
    { method: 'GET', path: '/api/notifications' },
    { method: 'GET', path: '/api/notifications/unread-count' },
    { method: 'PUT', path: '/api/notifications/:id/read' },
    { method: 'PUT', path: '/api/notifications/mark-all-read' },
    { method: 'DELETE', path: '/api/notifications/:id' },
    { method: 'DELETE', path: '/api/notifications/clear-all' },
    { method: 'GET', path: '/api/notifications/preferences' },
    { method: 'PUT', path: '/api/notifications/preferences', body: { email: true, push: true, sms: false } },
  ],

  // SETTINGS - All Options
  settings: [
    { method: 'GET', path: '/api/settings' },
    { method: 'GET', path: '/api/settings/workspace' },
    { method: 'PUT', path: '/api/settings/workspace', body: { name: 'Updated Workspace' } },
    { method: 'GET', path: '/api/settings/billing' },
    { method: 'GET', path: '/api/settings/integrations' },
    { method: 'GET', path: '/api/settings/notifications' },
    { method: 'PUT', path: '/api/settings/notifications', body: { emailDigest: 'daily' } },
    { method: 'GET', path: '/api/settings/payroll' },
    { method: 'PUT', path: '/api/settings/payroll', body: { overtimeThreshold: 40 } },
    { method: 'GET', path: '/api/settings/scheduling' },
    { method: 'PUT', path: '/api/settings/scheduling', body: { minRestHours: 8 } },
  ],

  // TRINITY AI
  trinity: [
    { method: 'GET', path: '/api/trinity/status' },
    { method: 'POST', path: '/api/trinity/chat', body: { message: 'Hello Trinity' } },
    { method: 'GET', path: '/api/trinity/suggestions' },
    { method: 'GET', path: '/api/ai-brain/actions' },
    { method: 'GET', path: '/api/ai-brain/registry' },
    { method: 'POST', path: '/api/trinity/command', body: { command: 'status_check' } },
  ],

  // QUICKBOOKS
  quickbooks: [
    { method: 'GET', path: '/api/quickbooks/status' },
    { method: 'POST', path: '/api/quickbooks/sync' },
    { method: 'GET', path: '/api/quickbooks/sync-history' },
    { method: 'POST', path: '/api/quickbooks/refresh-token' },
  ],

  // WEBHOOKS
  webhooks: [
    { method: 'GET', path: '/api/webhooks' },
    { method: 'POST', path: '/api/webhooks', body: { url: 'https://test.com/webhook', events: ['invoice.created'] } },
    { method: 'DELETE', path: '/api/webhooks/:id' },
  ],

  // AUDIT LOG
  audit: [
    { method: 'GET', path: '/api/audit-log' },
    { method: 'GET', path: '/api/audit-log', query: { action: 'login' } },
    { method: 'GET', path: '/api/audit-log', query: { userId: ':userId' } },
  ],

  // HEALTH
  health: [
    { method: 'GET', path: '/api/health' },
    { method: 'GET', path: '/api/health/detailed' },
    { method: 'GET', path: '/api/health/services' },
  ]
};
```

### API Test Runner

```javascript
async function runAPITests() {
  const results = [];
  
  for (const [category, tests] of Object.entries(API_TESTS)) {
    console.log(`\n📋 Testing ${category.toUpperCase()}...`);
    
    for (const test of tests) {
      const result = await executeAPITest(test);
      results.push({ category, ...test, ...result });
      
      const icon = result.success ? '✅' : '❌';
      console.log(`  ${icon} ${test.method} ${test.path}`);
      
      if (!result.success) {
        console.log(`     Error: ${result.error}`);
      }
    }
  }
  
  return results;
}

async function executeAPITest(test) {
  const startTime = Date.now();
  
  try {
    const response = await fetch(`${BASE_URL}${resolvePath(test.path)}`, {
      method: test.method,
      headers: {
        'Content-Type': 'application/json',
        'x-test-key': process.env.TEST_SECRET
      },
      body: test.body ? JSON.stringify(resolveBody(test.body)) : undefined
    });
    
    const data = await response.json().catch(() => null);
    const duration = Date.now() - startTime;
    
    // Validate response
    const success = response.ok || (test.expectStatus && response.status === test.expectStatus);
    
    // Validate response shape
    if (success && test.expect) {
      if (test.expect === 'array' && !Array.isArray(data)) {
        return { success: false, error: 'Expected array response', duration };
      }
      if (test.expect === 'object' && (typeof data !== 'object' || Array.isArray(data))) {
        return { success: false, error: 'Expected object response', duration };
      }
    }
    
    return { 
      success, 
      status: response.status, 
      data,
      duration 
    };
    
  } catch (error) {
    return { 
      success: false, 
      error: error.message,
      duration: Date.now() - startTime 
    };
  }
}
```

---

## AGENT 3: INTEGRATION CRAWLER

### End-to-End Workflow Tests

```javascript
const WORKFLOW_TESTS = [
  
  // ====== EMPLOYEE LIFECYCLE ======
  {
    id: 'wf-emp-001',
    name: 'Complete Employee Onboarding',
    steps: [
      { action: 'POST', path: '/api/employees/invite', body: { email: 'new@test.com' } },
      { action: 'VERIFY_DB', table: 'invitations', where: { email: 'new@test.com' } },
      { action: 'VERIFY_EMAIL', to: 'new@test.com', subject: 'Invitation' },
      { action: 'POST', path: '/api/auth/register', body: { token: ':inviteToken', password: 'Test123!' } },
      { action: 'VERIFY_DB', table: 'users', where: { email: 'new@test.com', status: 'active' } },
    ]
  },
  {
    id: 'wf-emp-002',
    name: 'Employee Termination',
    steps: [
      { action: 'POST', path: '/api/employees/:id/terminate', body: { reason: 'Test', effectiveDate: 'today' } },
      { action: 'VERIFY_DB', table: 'users', where: { id: ':employeeId', status: 'terminated' } },
      { action: 'VERIFY', condition: 'employee cannot login' },
      { action: 'VERIFY', condition: 'employee removed from future schedules' },
    ]
  },

  // ====== SCHEDULING LIFECYCLE ======
  {
    id: 'wf-sched-001',
    name: 'Create and Assign Shift',
    steps: [
      { action: 'POST', path: '/api/schedules', body: { title: 'Night Watch', date: 'tomorrow', startTime: '22:00', endTime: '06:00' } },
      { action: 'STORE', as: 'shiftId', from: 'response.id' },
      { action: 'POST', path: '/api/schedules/:shiftId/assign', body: { employeeId: ':employeeId' } },
      { action: 'VERIFY_DB', table: 'shifts', where: { id: ':shiftId', assignedTo: ':employeeId' } },
      { action: 'VERIFY_NOTIFICATION', to: ':employeeId', type: 'shift_assigned' },
    ]
  },
  {
    id: 'wf-sched-002',
    name: 'Shift Conflict Detection',
    steps: [
      { action: 'POST', path: '/api/schedules', body: { employeeId: ':emp1', date: 'tomorrow', startTime: '09:00', endTime: '17:00' } },
      { action: 'POST', path: '/api/schedules', body: { employeeId: ':emp1', date: 'tomorrow', startTime: '14:00', endTime: '22:00' }, expectError: true },
      { action: 'VERIFY', condition: 'conflict error returned' },
    ]
  },
  {
    id: 'wf-sched-003',
    name: 'Recurring Shift Creation',
    steps: [
      { action: 'POST', path: '/api/schedules/recurring', body: { 
        title: 'Weekly Patrol', 
        pattern: 'weekly', 
        daysOfWeek: [1, 3, 5], 
        startTime: '08:00', 
        endTime: '16:00',
        repeatUntil: '2026-03-01'
      }},
      { action: 'VERIFY_DB', table: 'shifts', count: '>=10' },
    ]
  },

  // ====== TIME TRACKING LIFECYCLE ======
  {
    id: 'wf-time-001',
    name: 'Complete Clock In/Out Cycle',
    steps: [
      { action: 'POST', path: '/api/time/clock-in', body: { shiftId: ':shiftId', location: { lat: 29.5785, lng: -98.6196 } } },
      { action: 'STORE', as: 'timeEntryId', from: 'response.id' },
      { action: 'VERIFY_DB', table: 'time_entries', where: { id: ':timeEntryId', status: 'active' } },
      { action: 'WAIT', duration: 2000 },
      { action: 'POST', path: '/api/time/clock-out', body: { timeEntryId: ':timeEntryId', location: { lat: 29.5785, lng: -98.6196 } } },
      { action: 'VERIFY_DB', table: 'time_entries', where: { id: ':timeEntryId', status: 'completed', hoursWorked: '>0' } },
    ]
  },
  {
    id: 'wf-time-002',
    name: 'GPS Geofence Rejection',
    steps: [
      { action: 'POST', path: '/api/time/clock-in', body: { 
        shiftId: ':shiftId', 
        location: { lat: 40.7128, lng: -74.0060 } // NYC - far from site
      }, expectError: true },
      { action: 'VERIFY', condition: 'geofence error returned' },
    ]
  },
  {
    id: 'wf-time-003',
    name: 'Timesheet Submission and Approval',
    steps: [
      { action: 'GET', path: '/api/timesheets/current' },
      { action: 'STORE', as: 'timesheetId', from: 'response.id' },
      { action: 'POST', path: '/api/timesheets/:timesheetId/submit' },
      { action: 'VERIFY_DB', table: 'timesheets', where: { id: ':timesheetId', status: 'submitted' } },
      { action: 'SWITCH_USER', role: 'supervisor' },
      { action: 'POST', path: '/api/timesheets/:timesheetId/approve' },
      { action: 'VERIFY_DB', table: 'timesheets', where: { id: ':timesheetId', status: 'approved' } },
      { action: 'VERIFY_NOTIFICATION', to: ':employeeId', type: 'timesheet_approved' },
    ]
  },

  // ====== PAYROLL LIFECYCLE ======
  {
    id: 'wf-pay-001',
    name: 'Complete Payroll Run',
    steps: [
      { action: 'POST', path: '/api/payroll/runs', body: { periodStart: '2026-01-01', periodEnd: '2026-01-07' } },
      { action: 'STORE', as: 'payrollRunId', from: 'response.id' },
      { action: 'POST', path: '/api/payroll/runs/:payrollRunId/calculate' },
      { action: 'VERIFY_DB', table: 'payroll_runs', where: { id: ':payrollRunId', status: 'calculated' } },
      { action: 'VERIFY', condition: 'regular hours calculated correctly' },
      { action: 'VERIFY', condition: 'overtime calculated correctly (hours > 40)' },
      { action: 'POST', path: '/api/payroll/runs/:payrollRunId/approve' },
      { action: 'POST', path: '/api/payroll/runs/:payrollRunId/process' },
      { action: 'VERIFY_DB', table: 'payroll_runs', where: { id: ':payrollRunId', status: 'processed' } },
    ]
  },

  // ====== INVOICING LIFECYCLE ======
  {
    id: 'wf-inv-001',
    name: 'Create Invoice from Timesheet',
    steps: [
      { action: 'POST', path: '/api/invoices/generate', body: { clientId: ':clientId', periodStart: '2026-01-01', periodEnd: '2026-01-07' } },
      { action: 'STORE', as: 'invoiceId', from: 'response.id' },
      { action: 'VERIFY_DB', table: 'invoices', where: { id: ':invoiceId' } },
      { action: 'VERIFY', condition: 'line items match timesheet hours' },
      { action: 'VERIFY', condition: 'total calculated correctly' },
    ]
  },
  {
    id: 'wf-inv-002',
    name: 'Invoice to Payment Cycle',
    steps: [
      { action: 'POST', path: '/api/invoices/:invoiceId/send' },
      { action: 'VERIFY_EMAIL', to: ':clientEmail', subject: 'Invoice' },
      { action: 'VERIFY_DB', table: 'invoices', where: { id: ':invoiceId', status: 'sent' } },
      { action: 'POST', path: '/api/invoices/:invoiceId/mark-paid', body: { amount: ':invoiceTotal', method: 'check' } },
      { action: 'VERIFY_DB', table: 'invoices', where: { id: ':invoiceId', status: 'paid' } },
    ]
  },

  // ====== QUICKBOOKS SYNC ======
  {
    id: 'wf-qb-001',
    name: 'QuickBooks Invoice Sync',
    steps: [
      { action: 'POST', path: '/api/invoices', body: { clientId: ':clientId', amount: 1000 } },
      { action: 'STORE', as: 'invoiceId', from: 'response.id' },
      { action: 'POST', path: '/api/quickbooks/sync' },
      { action: 'VERIFY_DB', table: 'invoices', where: { id: ':invoiceId', qbSyncedAt: 'NOT NULL' } },
    ]
  },

  // ====== REPORTS LIFECYCLE ======
  {
    id: 'wf-rpt-001',
    name: 'Incident Report Workflow',
    steps: [
      { action: 'POST', path: '/api/reports', body: { type: 'incident', title: 'Test Incident', description: 'Details here', siteId: ':siteId' } },
      { action: 'STORE', as: 'reportId', from: 'response.id' },
      { action: 'POST', path: '/api/reports/:reportId/submit' },
      { action: 'VERIFY_NOTIFICATION', to: ':supervisorId', type: 'report_submitted' },
      { action: 'SWITCH_USER', role: 'supervisor' },
      { action: 'POST', path: '/api/reports/:reportId/approve' },
      { action: 'VERIFY_NOTIFICATION', to: ':guardId', type: 'report_approved' },
      { action: 'SWITCH_USER', role: 'manager' },
      { action: 'POST', path: '/api/reports/:reportId/send-to-client' },
      { action: 'VERIFY_EMAIL', to: ':clientEmail', subject: 'Report' },
    ]
  },

  // ====== NOTIFICATIONS ======
  {
    id: 'wf-notif-001',
    name: 'Notification CRUD',
    steps: [
      { action: 'GET', path: '/api/notifications' },
      { action: 'STORE', as: 'initialCount', from: 'response.length' },
      { action: 'TRIGGER', event: 'shift_assigned' }, // This creates a notification
      { action: 'GET', path: '/api/notifications' },
      { action: 'VERIFY', condition: 'count increased by 1' },
      { action: 'GET', path: '/api/notifications/unread-count' },
      { action: 'VERIFY', condition: 'unread count >= 1' },
      { action: 'PUT', path: '/api/notifications/:notificationId/read' },
      { action: 'GET', path: '/api/notifications/unread-count' },
      { action: 'VERIFY', condition: 'unread count decreased' },
      { action: 'DELETE', path: '/api/notifications/:notificationId' },
      { action: 'VERIFY_DB', table: 'notifications', where: { id: ':notificationId' }, exists: false },
    ]
  },
  {
    id: 'wf-notif-002',
    name: 'Clear All Notifications',
    steps: [
      { action: 'DELETE', path: '/api/notifications/clear-all' },
      { action: 'GET', path: '/api/notifications' },
      { action: 'VERIFY', condition: 'count is 0' },
    ]
  },
  {
    id: 'wf-notif-003',
    name: 'Mark All Read',
    steps: [
      { action: 'PUT', path: '/api/notifications/mark-all-read' },
      { action: 'GET', path: '/api/notifications/unread-count' },
      { action: 'VERIFY', condition: 'unread count is 0' },
    ]
  },

  // ====== SETTINGS ======
  {
    id: 'wf-set-001',
    name: 'Update All Settings',
    steps: [
      { action: 'GET', path: '/api/settings/workspace' },
      { action: 'STORE', as: 'originalSettings', from: 'response' },
      { action: 'PUT', path: '/api/settings/workspace', body: { name: 'Test Update' } },
      { action: 'GET', path: '/api/settings/workspace' },
      { action: 'VERIFY', condition: 'name equals "Test Update"' },
      { action: 'PUT', path: '/api/settings/workspace', body: ':originalSettings' }, // Restore
    ]
  },

  // ====== TRINITY AI ======
  {
    id: 'wf-ai-001',
    name: 'Trinity Chat Interaction',
    steps: [
      { action: 'POST', path: '/api/trinity/chat', body: { message: 'How many employees are scheduled today?' } },
      { action: 'VERIFY', condition: 'response contains schedule information' },
    ]
  },
  {
    id: 'wf-ai-002',
    name: 'Trinity Hotpatch Workflow',
    steps: [
      { action: 'POST', path: '/api/trinity/diagnose' },
      { action: 'GET', path: '/api/trinity/suggestions' },
      { action: 'STORE', as: 'suggestion', from: 'response[0]' },
      { action: 'POST', path: '/api/trinity/apply-fix', body: { suggestionId: ':suggestion.id' } },
      { action: 'VERIFY', condition: 'fix applied or approval requested' },
    ]
  },

  // ====== PERMISSION TESTS ======
  {
    id: 'wf-perm-001',
    name: 'Guard Cannot Access Admin Routes',
    steps: [
      { action: 'SWITCH_USER', role: 'guard' },
      { action: 'GET', path: '/api/payroll/runs', expectStatus: 403 },
      { action: 'GET', path: '/api/settings/billing', expectStatus: 403 },
      { action: 'DELETE', path: '/api/employees/:id', expectStatus: 403 },
    ]
  },
  {
    id: 'wf-perm-002',
    name: 'Supervisor Limited Access',
    steps: [
      { action: 'SWITCH_USER', role: 'supervisor' },
      { action: 'GET', path: '/api/employees', expectStatus: 200 }, // Can view
      { action: 'POST', path: '/api/employees', expectStatus: 403 }, // Cannot create
      { action: 'POST', path: '/api/timesheets/:id/approve', expectStatus: 200 }, // Can approve
      { action: 'POST', path: '/api/payroll/runs', expectStatus: 403 }, // Cannot run payroll
    ]
  },
];
```

---

## Parallel Execution Runner

```javascript
async function runTrinityTriadCrawlers() {
  console.log('═══════════════════════════════════════════════════════════════');
  console.log('   TRINITY TRIAD CRAWLER - FULL PLATFORM VERIFICATION');
  console.log('   Running in PARALLEL MODE');
  console.log('═══════════════════════════════════════════════════════════════\n');
  
  const startTime = Date.now();
  
  // Run all three agents in parallel
  const [uiResults, apiResults, integrationResults] = await Promise.all([
    runUICrawler(),
    runAPICrawler(),
    runIntegrationCrawler()
  ]);
  
  const duration = Date.now() - startTime;
  
  // Generate combined report
  const report = {
    timestamp: new Date().toISOString(),
    duration,
    
    ui: {
      total: uiResults.length,
      passed: uiResults.filter(r => r.success).length,
      failed: uiResults.filter(r => !r.success).length,
      issues: uiResults.filter(r => !r.success)
    },
    
    api: {
      total: apiResults.length,
      passed: apiResults.filter(r => r.success).length,
      failed: apiResults.filter(r => !r.success).length,
      issues: apiResults.filter(r => !r.success)
    },
    
    integration: {
      total: integrationResults.length,
      passed: integrationResults.filter(r => r.success).length,
      failed: integrationResults.filter(r => !r.success).length,
      issues: integrationResults.filter(r => !r.success)
    },
    
    overall: {
      totalTests: uiResults.length + apiResults.length + integrationResults.length,
      totalPassed: uiResults.filter(r => r.success).length + 
                   apiResults.filter(r => r.success).length + 
                   integrationResults.filter(r => r.success).length,
      healthScore: 0 // Calculated below
    }
  };
  
  report.overall.healthScore = Math.round(
    (report.overall.totalPassed / report.overall.totalTests) * 100
  );
  
  // Print summary
  console.log('\n═══════════════════════════════════════════════════════════════');
  console.log('                    TRINITY TRIAD RESULTS');
  console.log('═══════════════════════════════════════════════════════════════\n');
  
  console.log(`  🎨 UI Crawler:          ${report.ui.passed}/${report.ui.total} passed`);
  console.log(`  🔌 API Crawler:         ${report.api.passed}/${report.api.total} passed`);
  console.log(`  🔄 Integration Crawler: ${report.integration.passed}/${report.integration.total} passed`);
  console.log('');
  console.log(`  📊 HEALTH SCORE: ${report.overall.healthScore}%`);
  console.log(`  ⏱️  Duration: ${(duration / 1000).toFixed(2)}s`);
  console.log('');
  
  if (report.overall.healthScore >= 95) {
    console.log('  ✅ STATUS: LAUNCH READY');
  } else if (report.overall.healthScore >= 80) {
    console.log('  ⚠️  STATUS: NEEDS ATTENTION');
  } else {
    console.log('  ❌ STATUS: CRITICAL ISSUES');
  }
  
  console.log('\n═══════════════════════════════════════════════════════════════\n');
  
  // Save detailed report
  require('fs').writeFileSync(
    'trinity-triad-report.json', 
    JSON.stringify(report, null, 2)
  );
  
  return report;
}

// Run it
runTrinityTriadCrawlers();
```

---

## Success Criteria

| Metric | Target |
|--------|--------|
| UI Tests | 100% pages load, 0 broken links, 0 console errors |
| API Tests | 100% endpoints respond correctly |
| Integration Tests | 100% workflows complete |
| Health Score | 95%+ |

---

## After Crawl Completes

1. **Review `trinity-triad-report.json`** for all failures
2. **Fix each issue** in priority order (critical → high → medium → low)
3. **Re-run crawlers** until 95%+ health score
4. **Document any known issues** that are acceptable for launch

---

## Tell Replit

Copy this message to Replit Agent:

```
The auth system is now in place. Run the Trinity Triad Crawlers in PARALLEL MODE using this specification.

Use the x-test-key header for all authenticated requests.

Test EVERYTHING:
- Every page (72+ routes)
- Every API endpoint (full CRUD)
- Every workflow (end-to-end)
- Every button, link, dropdown, toggle, modal
- Every setting
- Every notification action
- Every permission level

Do not stop until health score reaches 95%+.

Iterate: Run crawlers → Fix issues → Run again → Repeat until done.

Report format: trinity-triad-report.json with all pass/fail details.
```
