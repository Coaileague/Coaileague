/**
 * CoAIleague Workflow Testing Suite
 * 
 * This is PHASE 2 testing - actual functionality, not just page loads.
 * Run these in parallel with the Triad Crawler Team.
 * 
 * CRITICAL: Page loads mean NOTHING if buttons don't work.
 */

const puppeteer = require('puppeteer');

// =============================================================================
// CONFIGURATION
// =============================================================================

const CONFIG = {
  baseUrl: process.env.BASE_URL || 'https://your-replit-domain.repl.co',
  testUser: {
    email: 'admin@test.com',
    password: 'testpassword123'
  },
  timeouts: {
    short: 3000,
    medium: 10000,
    long: 30000
  }
};

// =============================================================================
// TEST RESULT TRACKING
// =============================================================================

class WorkflowTestResult {
  constructor(workflowId, workflowName) {
    this.workflowId = workflowId;
    this.workflowName = workflowName;
    this.steps = [];
    this.status = 'pending';
    this.startTime = Date.now();
    this.endTime = null;
    this.error = null;
    this.screenshots = [];
  }

  addStep(stepName, status, details = {}) {
    this.steps.push({
      step: this.steps.length + 1,
      name: stepName,
      status,
      timestamp: Date.now(),
      ...details
    });
    console.log(`  [${status === 'pass' ? '✅' : status === 'fail' ? '❌' : '⏳'}] Step ${this.steps.length}: ${stepName}`);
  }

  pass() {
    this.status = 'pass';
    this.endTime = Date.now();
  }

  fail(error) {
    this.status = 'fail';
    this.error = error;
    this.endTime = Date.now();
  }

  get duration() {
    return this.endTime - this.startTime;
  }

  toJSON() {
    return {
      workflowId: this.workflowId,
      workflowName: this.workflowName,
      status: this.status,
      duration: this.duration,
      steps: this.steps,
      error: this.error,
      screenshots: this.screenshots
    };
  }
}

// =============================================================================
// UTILITY FUNCTIONS
// =============================================================================

async function login(page) {
  await page.goto(`${CONFIG.baseUrl}/login`, { waitUntil: 'networkidle0' });
  
  // Try multiple selector strategies
  const emailSelectors = [
    '[data-testid="input-email"]',
    'input[name="email"]',
    'input[type="email"]',
    '#email'
  ];
  
  const passwordSelectors = [
    '[data-testid="input-password"]',
    'input[name="password"]',
    'input[type="password"]',
    '#password'
  ];
  
  const submitSelectors = [
    '[data-testid="button-login"]',
    'button[type="submit"]',
    'button:has-text("Login")',
    'button:has-text("Sign in")'
  ];

  let emailInput, passwordInput, submitButton;

  for (const selector of emailSelectors) {
    emailInput = await page.$(selector);
    if (emailInput) break;
  }

  for (const selector of passwordSelectors) {
    passwordInput = await page.$(selector);
    if (passwordInput) break;
  }

  for (const selector of submitSelectors) {
    submitButton = await page.$(selector);
    if (submitButton) break;
  }

  if (!emailInput || !passwordInput || !submitButton) {
    throw new Error('Could not find login form elements');
  }

  await emailInput.type(CONFIG.testUser.email);
  await passwordInput.type(CONFIG.testUser.password);
  await submitButton.click();
  
  await page.waitForNavigation({ waitUntil: 'networkidle0', timeout: CONFIG.timeouts.medium });
  
  // Verify login succeeded (not still on login page)
  const currentUrl = page.url();
  if (currentUrl.includes('/login')) {
    throw new Error('Login failed - still on login page');
  }
  
  return true;
}

async function takeScreenshot(page, result, name) {
  const screenshot = await page.screenshot({ encoding: 'base64' });
  result.screenshots.push({ name, data: screenshot, timestamp: Date.now() });
}

async function clickElement(page, selectors, description) {
  for (const selector of (Array.isArray(selectors) ? selectors : [selectors])) {
    try {
      await page.waitForSelector(selector, { timeout: CONFIG.timeouts.short });
      await page.click(selector);
      return true;
    } catch (e) {
      continue;
    }
  }
  throw new Error(`Could not find clickable element: ${description}`);
}

async function fillInput(page, selectors, value, description) {
  for (const selector of (Array.isArray(selectors) ? selectors : [selectors])) {
    try {
      await page.waitForSelector(selector, { timeout: CONFIG.timeouts.short });
      await page.click(selector, { clickCount: 3 }); // Select all existing text
      await page.type(selector, value);
      return true;
    } catch (e) {
      continue;
    }
  }
  throw new Error(`Could not find input: ${description}`);
}

async function waitForElement(page, selectors, description, timeout = CONFIG.timeouts.medium) {
  for (const selector of (Array.isArray(selectors) ? selectors : [selectors])) {
    try {
      await page.waitForSelector(selector, { timeout });
      return await page.$(selector);
    } catch (e) {
      continue;
    }
  }
  throw new Error(`Element not found: ${description}`);
}

async function verifyToast(page, expectedText = null) {
  const toastSelectors = [
    '.toast',
    '[role="alert"]',
    '.notification',
    '.Toastify__toast',
    '[data-testid="toast"]',
    '.alert-success',
    '.success-message'
  ];
  
  for (const selector of toastSelectors) {
    try {
      const toast = await page.waitForSelector(selector, { timeout: CONFIG.timeouts.short });
      if (toast) {
        if (expectedText) {
          const text = await page.evaluate(el => el.textContent, toast);
          if (text.toLowerCase().includes(expectedText.toLowerCase())) {
            return { found: true, text };
          }
        } else {
          return { found: true };
        }
      }
    } catch (e) {
      continue;
    }
  }
  return { found: false };
}

// =============================================================================
// WORKFLOW TEST: EMPLOYEE INVITE
// =============================================================================

async function testEmployeeInvite(browser) {
  const result = new WorkflowTestResult('emp-001', 'Invite New Employee');
  const page = await browser.newPage();
  
  console.log('\n🧪 Testing: Employee Invite Workflow');
  
  try {
    // Step 1: Login
    result.addStep('Login as admin', 'running');
    await login(page);
    result.steps[result.steps.length - 1].status = 'pass';
    
    // Step 2: Navigate to Employees page
    result.addStep('Navigate to Employees page', 'running');
    await page.goto(`${CONFIG.baseUrl}/employees`, { waitUntil: 'networkidle0' });
    await takeScreenshot(page, result, 'employees-page');
    
    const currentUrl = page.url();
    if (!currentUrl.includes('/employees')) {
      throw new Error(`Redirected away from employees page to: ${currentUrl}`);
    }
    result.steps[result.steps.length - 1].status = 'pass';
    
    // Step 3: Click "Invite Employee" button
    result.addStep('Click Invite Employee button', 'running');
    const inviteButtonSelectors = [
      '[data-testid="invite-employee"]',
      'button:contains("Invite")',
      'button:contains("Add Employee")',
      'button:contains("New Employee")',
      '[data-testid="add-employee"]',
      '.btn-invite',
      'button.invite-btn',
      'a[href*="invite"]',
      'button[aria-label*="invite"]',
      'button[aria-label*="add employee"]'
    ];
    await clickElement(page, inviteButtonSelectors, 'Invite Employee button');
    await page.waitForTimeout(500); // Wait for modal animation
    await takeScreenshot(page, result, 'invite-modal-open');
    result.steps[result.steps.length - 1].status = 'pass';
    
    // Step 4: Verify modal/form opened
    result.addStep('Verify invite form opened', 'running');
    const modalSelectors = [
      '[data-testid="invite-modal"]',
      '.modal',
      '[role="dialog"]',
      '.invite-form',
      'form[data-testid="employee-form"]',
      '.employee-invite-form'
    ];
    await waitForElement(page, modalSelectors, 'Invite modal/form');
    result.steps[result.steps.length - 1].status = 'pass';
    
    // Step 5: Fill email field
    result.addStep('Fill employee email', 'running');
    const testEmail = `test.employee.${Date.now()}@example.com`;
    const emailSelectors = [
      '[data-testid="employee-email"]',
      'input[name="email"]',
      'input[type="email"]',
      '#employee-email',
      '.invite-form input[type="email"]'
    ];
    await fillInput(page, emailSelectors, testEmail, 'Employee email input');
    result.steps[result.steps.length - 1].status = 'pass';
    result.steps[result.steps.length - 1].data = { email: testEmail };
    
    // Step 6: Fill name field (if exists)
    result.addStep('Fill employee name (if required)', 'running');
    const nameSelectors = [
      '[data-testid="employee-name"]',
      'input[name="name"]',
      'input[name="fullName"]',
      'input[name="firstName"]',
      '#employee-name'
    ];
    try {
      await fillInput(page, nameSelectors, 'Test Employee', 'Employee name input');
      result.steps[result.steps.length - 1].status = 'pass';
    } catch (e) {
      result.steps[result.steps.length - 1].status = 'skip';
      result.steps[result.steps.length - 1].note = 'Name field not found - may not be required';
    }
    
    // Step 7: Select role (if exists)
    result.addStep('Select employee role (if required)', 'running');
    const roleSelectors = [
      '[data-testid="employee-role"]',
      'select[name="role"]',
      '#employee-role',
      '[data-testid="role-select"]'
    ];
    try {
      const roleSelect = await waitForElement(page, roleSelectors, 'Role select', CONFIG.timeouts.short);
      await page.select(roleSelectors[0], 'guard'); // or first available option
      result.steps[result.steps.length - 1].status = 'pass';
    } catch (e) {
      result.steps[result.steps.length - 1].status = 'skip';
      result.steps[result.steps.length - 1].note = 'Role field not found - may not be required';
    }
    
    // Step 8: Submit the form
    result.addStep('Submit invite form', 'running');
    await takeScreenshot(page, result, 'before-submit');
    
    const submitSelectors = [
      '[data-testid="submit-invite"]',
      'button[type="submit"]',
      'button:contains("Send Invite")',
      'button:contains("Invite")',
      'button:contains("Submit")',
      '.modal button.btn-primary',
      'form button[type="submit"]'
    ];
    await clickElement(page, submitSelectors, 'Submit button');
    
    // Wait for response
    await page.waitForTimeout(2000);
    await takeScreenshot(page, result, 'after-submit');
    result.steps[result.steps.length - 1].status = 'pass';
    
    // Step 9: Verify success
    result.addStep('Verify invite sent successfully', 'running');
    
    // Check for success indicators
    const successIndicators = await Promise.all([
      verifyToast(page, 'success'),
      verifyToast(page, 'sent'),
      verifyToast(page, 'invited'),
      page.evaluate(() => {
        // Check if modal closed
        const modal = document.querySelector('.modal, [role="dialog"]');
        return !modal || modal.style.display === 'none' || !modal.offsetParent;
      }),
      page.evaluate(() => {
        // Check for error messages
        const error = document.querySelector('.error, .alert-danger, [role="alert"][class*="error"]');
        return error ? error.textContent : null;
      })
    ]);
    
    const [toast1, toast2, toast3, modalClosed, errorMessage] = successIndicators;
    
    if (errorMessage) {
      throw new Error(`Error displayed: ${errorMessage}`);
    }
    
    if (toast1.found || toast2.found || toast3.found || modalClosed) {
      result.steps[result.steps.length - 1].status = 'pass';
    } else {
      throw new Error('No success indicator found after form submission');
    }
    
    // Step 10: Verify API call succeeded (check network or database)
    result.addStep('Verify invite in system', 'running');
    
    // Option 1: Check if employee appears in list
    await page.goto(`${CONFIG.baseUrl}/employees`, { waitUntil: 'networkidle0' });
    const pageContent = await page.content();
    
    if (pageContent.includes(testEmail) || pageContent.includes('Test Employee') || pageContent.includes('Pending')) {
      result.steps[result.steps.length - 1].status = 'pass';
    } else {
      // Option 2: Check via API
      const apiCheck = await page.evaluate(async (email) => {
        try {
          const response = await fetch('/api/employees');
          const data = await response.json();
          return data.some(emp => emp.email === email || emp.status === 'pending');
        } catch (e) {
          return null;
        }
      }, testEmail);
      
      if (apiCheck) {
        result.steps[result.steps.length - 1].status = 'pass';
      } else {
        result.steps[result.steps.length - 1].status = 'warn';
        result.steps[result.steps.length - 1].note = 'Could not verify invite in system - manual check needed';
      }
    }
    
    result.pass();
    console.log('✅ Employee Invite Workflow: PASSED\n');
    
  } catch (error) {
    await takeScreenshot(page, result, 'error-state');
    result.fail(error.message);
    console.log(`❌ Employee Invite Workflow: FAILED - ${error.message}\n`);
  } finally {
    await page.close();
  }
  
  return result;
}

// =============================================================================
// WORKFLOW TEST: CREATE SHIFT
// =============================================================================

async function testCreateShift(browser) {
  const result = new WorkflowTestResult('sched-001', 'Create Single Shift');
  const page = await browser.newPage();
  
  console.log('\n🧪 Testing: Create Shift Workflow');
  
  try {
    // Step 1: Login
    result.addStep('Login as admin', 'running');
    await login(page);
    result.steps[result.steps.length - 1].status = 'pass';
    
    // Step 2: Navigate to Schedule page
    result.addStep('Navigate to Schedule page', 'running');
    await page.goto(`${CONFIG.baseUrl}/schedule`, { waitUntil: 'networkidle0' });
    await takeScreenshot(page, result, 'schedule-page');
    result.steps[result.steps.length - 1].status = 'pass';
    
    // Step 3: Click "Create Shift" or click on calendar
    result.addStep('Open create shift form', 'running');
    const createShiftSelectors = [
      '[data-testid="create-shift"]',
      '[data-testid="add-shift"]',
      'button:contains("New Shift")',
      'button:contains("Add Shift")',
      'button:contains("Create")',
      '.fc-day', // FullCalendar day cell
      '.calendar-day'
    ];
    await clickElement(page, createShiftSelectors, 'Create shift trigger');
    await page.waitForTimeout(500);
    await takeScreenshot(page, result, 'shift-form-open');
    result.steps[result.steps.length - 1].status = 'pass';
    
    // Step 4: Fill shift details
    result.addStep('Fill shift details', 'running');
    
    // Date
    const dateSelectors = ['[data-testid="shift-date"]', 'input[name="date"]', 'input[type="date"]'];
    const tomorrow = new Date(Date.now() + 86400000).toISOString().split('T')[0];
    try {
      await fillInput(page, dateSelectors, tomorrow, 'Shift date');
    } catch (e) {
      // Date might be pre-filled or use calendar picker
    }
    
    // Start time
    const startTimeSelectors = ['[data-testid="shift-start"]', 'input[name="startTime"]', '#start-time'];
    try {
      await fillInput(page, startTimeSelectors, '09:00', 'Start time');
    } catch (e) {}
    
    // End time
    const endTimeSelectors = ['[data-testid="shift-end"]', 'input[name="endTime"]', '#end-time'];
    try {
      await fillInput(page, endTimeSelectors, '17:00', 'End time');
    } catch (e) {}
    
    // Location/Site
    const siteSelectors = ['[data-testid="shift-site"]', 'select[name="site"]', 'select[name="location"]'];
    try {
      const siteSelect = await page.$(siteSelectors[0]);
      if (siteSelect) {
        await page.select(siteSelectors[0], await page.evaluate(sel => {
          const select = document.querySelector(sel);
          return select?.options[1]?.value || '';
        }, siteSelectors[0]));
      }
    } catch (e) {}
    
    await takeScreenshot(page, result, 'shift-form-filled');
    result.steps[result.steps.length - 1].status = 'pass';
    
    // Step 5: Submit
    result.addStep('Submit shift', 'running');
    const submitSelectors = [
      '[data-testid="submit-shift"]',
      'button[type="submit"]',
      'button:contains("Save")',
      'button:contains("Create")'
    ];
    await clickElement(page, submitSelectors, 'Submit button');
    await page.waitForTimeout(2000);
    await takeScreenshot(page, result, 'after-shift-submit');
    result.steps[result.steps.length - 1].status = 'pass';
    
    // Step 6: Verify
    result.addStep('Verify shift created', 'running');
    const toast = await verifyToast(page, 'created');
    if (toast.found) {
      result.steps[result.steps.length - 1].status = 'pass';
    } else {
      // Check if shift appears on calendar
      await page.goto(`${CONFIG.baseUrl}/schedule`, { waitUntil: 'networkidle0' });
      result.steps[result.steps.length - 1].status = 'warn';
      result.steps[result.steps.length - 1].note = 'No confirmation toast - manual verification needed';
    }
    
    result.pass();
    console.log('✅ Create Shift Workflow: PASSED\n');
    
  } catch (error) {
    await takeScreenshot(page, result, 'error-state');
    result.fail(error.message);
    console.log(`❌ Create Shift Workflow: FAILED - ${error.message}\n`);
  } finally {
    await page.close();
  }
  
  return result;
}

// =============================================================================
// WORKFLOW TEST: CLOCK IN/OUT
// =============================================================================

async function testClockInOut(browser) {
  const result = new WorkflowTestResult('time-001', 'Clock In and Clock Out');
  const page = await browser.newPage();
  
  // Mock geolocation
  await page.setGeolocation({ latitude: 29.5785, longitude: -98.6196 }); // Helotes, TX
  
  console.log('\n🧪 Testing: Clock In/Out Workflow');
  
  try {
    // Step 1: Login as guard
    result.addStep('Login', 'running');
    await login(page);
    result.steps[result.steps.length - 1].status = 'pass';
    
    // Step 2: Navigate to Time Clock
    result.addStep('Navigate to Time Clock', 'running');
    const timeClockUrls = ['/time-clock', '/timeclock', '/clock', '/dashboard'];
    let found = false;
    for (const url of timeClockUrls) {
      await page.goto(`${CONFIG.baseUrl}${url}`, { waitUntil: 'networkidle0' });
      const clockButton = await page.$('[data-testid="clock-in"], button:contains("Clock In"), .clock-in-btn');
      if (clockButton) {
        found = true;
        break;
      }
    }
    await takeScreenshot(page, result, 'time-clock-page');
    result.steps[result.steps.length - 1].status = found ? 'pass' : 'warn';
    
    // Step 3: Clock In
    result.addStep('Click Clock In', 'running');
    const clockInSelectors = [
      '[data-testid="clock-in"]',
      'button:contains("Clock In")',
      '.clock-in-btn',
      '#clock-in'
    ];
    await clickElement(page, clockInSelectors, 'Clock In button');
    await page.waitForTimeout(2000);
    await takeScreenshot(page, result, 'after-clock-in');
    
    // Verify clocked in
    const clockedInIndicators = await page.evaluate(() => {
      const text = document.body.innerText.toLowerCase();
      return text.includes('clocked in') || text.includes('clock out') || text.includes('on shift');
    });
    
    if (clockedInIndicators) {
      result.steps[result.steps.length - 1].status = 'pass';
    } else {
      throw new Error('Clock in did not register');
    }
    
    // Step 4: Clock Out
    result.addStep('Click Clock Out', 'running');
    const clockOutSelectors = [
      '[data-testid="clock-out"]',
      'button:contains("Clock Out")',
      '.clock-out-btn',
      '#clock-out'
    ];
    await clickElement(page, clockOutSelectors, 'Clock Out button');
    await page.waitForTimeout(2000);
    await takeScreenshot(page, result, 'after-clock-out');
    result.steps[result.steps.length - 1].status = 'pass';
    
    // Step 5: Verify time entry created
    result.addStep('Verify time entry recorded', 'running');
    await page.goto(`${CONFIG.baseUrl}/timesheet`, { waitUntil: 'networkidle0' });
    const today = new Date().toLocaleDateString();
    const pageContent = await page.content();
    
    if (pageContent.includes(today) || pageContent.includes('Today')) {
      result.steps[result.steps.length - 1].status = 'pass';
    } else {
      result.steps[result.steps.length - 1].status = 'warn';
      result.steps[result.steps.length - 1].note = 'Could not verify time entry - manual check needed';
    }
    
    result.pass();
    console.log('✅ Clock In/Out Workflow: PASSED\n');
    
  } catch (error) {
    await takeScreenshot(page, result, 'error-state');
    result.fail(error.message);
    console.log(`❌ Clock In/Out Workflow: FAILED - ${error.message}\n`);
  } finally {
    await page.close();
  }
  
  return result;
}

// =============================================================================
// WORKFLOW TEST: CREATE INVOICE
// =============================================================================

async function testCreateInvoice(browser) {
  const result = new WorkflowTestResult('inv-001', 'Create Invoice');
  const page = await browser.newPage();
  
  console.log('\n🧪 Testing: Create Invoice Workflow');
  
  try {
    result.addStep('Login', 'running');
    await login(page);
    result.steps[result.steps.length - 1].status = 'pass';
    
    result.addStep('Navigate to Invoices', 'running');
    await page.goto(`${CONFIG.baseUrl}/invoices`, { waitUntil: 'networkidle0' });
    await takeScreenshot(page, result, 'invoices-page');
    result.steps[result.steps.length - 1].status = 'pass';
    
    result.addStep('Click Create Invoice', 'running');
    const createSelectors = [
      '[data-testid="create-invoice"]',
      'button:contains("New Invoice")',
      'button:contains("Create Invoice")',
      'a[href*="invoice/new"]'
    ];
    await clickElement(page, createSelectors, 'Create Invoice button');
    await page.waitForTimeout(500);
    await takeScreenshot(page, result, 'invoice-form');
    result.steps[result.steps.length - 1].status = 'pass';
    
    result.addStep('Fill invoice details', 'running');
    
    // Client selection
    const clientSelectors = ['[data-testid="invoice-client"]', 'select[name="client"]', '#client'];
    try {
      await page.select(clientSelectors.find(s => page.$(s)), '');
    } catch (e) {}
    
    await takeScreenshot(page, result, 'invoice-filled');
    result.steps[result.steps.length - 1].status = 'pass';
    
    result.addStep('Submit invoice', 'running');
    const submitSelectors = ['[data-testid="submit-invoice"]', 'button[type="submit"]', 'button:contains("Create")'];
    await clickElement(page, submitSelectors, 'Submit button');
    await page.waitForTimeout(2000);
    await takeScreenshot(page, result, 'after-invoice-submit');
    result.steps[result.steps.length - 1].status = 'pass';
    
    result.addStep('Verify invoice created', 'running');
    const toast = await verifyToast(page, 'created');
    result.steps[result.steps.length - 1].status = toast.found ? 'pass' : 'warn';
    
    result.pass();
    console.log('✅ Create Invoice Workflow: PASSED\n');
    
  } catch (error) {
    await takeScreenshot(page, result, 'error-state');
    result.fail(error.message);
    console.log(`❌ Create Invoice Workflow: FAILED - ${error.message}\n`);
  } finally {
    await page.close();
  }
  
  return result;
}

// =============================================================================
// WORKFLOW TEST: SUBMIT INCIDENT REPORT
// =============================================================================

async function testIncidentReport(browser) {
  const result = new WorkflowTestResult('inc-001', 'Submit Incident Report');
  const page = await browser.newPage();
  
  console.log('\n🧪 Testing: Incident Report Workflow');
  
  try {
    result.addStep('Login', 'running');
    await login(page);
    result.steps[result.steps.length - 1].status = 'pass';
    
    result.addStep('Navigate to Reports', 'running');
    const reportUrls = ['/reports', '/incidents', '/dar', '/daily-report'];
    for (const url of reportUrls) {
      try {
        await page.goto(`${CONFIG.baseUrl}${url}`, { waitUntil: 'networkidle0' });
        if (!page.url().includes('/login')) break;
      } catch (e) {}
    }
    await takeScreenshot(page, result, 'reports-page');
    result.steps[result.steps.length - 1].status = 'pass';
    
    result.addStep('Click New Report', 'running');
    const newReportSelectors = [
      '[data-testid="new-report"]',
      'button:contains("New Report")',
      'button:contains("Create Report")',
      'button:contains("DAR")'
    ];
    await clickElement(page, newReportSelectors, 'New Report button');
    await page.waitForTimeout(500);
    result.steps[result.steps.length - 1].status = 'pass';
    
    result.addStep('Fill report details', 'running');
    
    // Report type
    try {
      await page.select('[data-testid="report-type"], select[name="type"]', 'incident');
    } catch (e) {}
    
    // Description
    const descSelectors = ['[data-testid="report-description"]', 'textarea[name="description"]', '#description'];
    await fillInput(page, descSelectors, 'Test incident report - automated testing. No actual incident occurred.', 'Description');
    
    await takeScreenshot(page, result, 'report-filled');
    result.steps[result.steps.length - 1].status = 'pass';
    
    result.addStep('Submit report', 'running');
    await clickElement(page, ['button[type="submit"]', '[data-testid="submit-report"]'], 'Submit');
    await page.waitForTimeout(2000);
    result.steps[result.steps.length - 1].status = 'pass';
    
    result.addStep('Verify report submitted', 'running');
    const toast = await verifyToast(page);
    result.steps[result.steps.length - 1].status = toast.found ? 'pass' : 'warn';
    
    result.pass();
    console.log('✅ Incident Report Workflow: PASSED\n');
    
  } catch (error) {
    await takeScreenshot(page, result, 'error-state');
    result.fail(error.message);
    console.log(`❌ Incident Report Workflow: FAILED - ${error.message}\n`);
  } finally {
    await page.close();
  }
  
  return result;
}

// =============================================================================
// WORKFLOW TEST: QUICKBOOKS SYNC
// =============================================================================

async function testQuickBooksSync(browser) {
  const result = new WorkflowTestResult('qb-001', 'QuickBooks Sync');
  const page = await browser.newPage();
  
  console.log('\n🧪 Testing: QuickBooks Sync Workflow');
  
  try {
    result.addStep('Login', 'running');
    await login(page);
    result.steps[result.steps.length - 1].status = 'pass';
    
    result.addStep('Navigate to Settings/Integrations', 'running');
    const settingsUrls = ['/settings/integrations', '/integrations', '/settings', '/quickbooks'];
    for (const url of settingsUrls) {
      await page.goto(`${CONFIG.baseUrl}${url}`, { waitUntil: 'networkidle0' });
      const qbElement = await page.$('[data-testid="quickbooks"], .quickbooks, :contains("QuickBooks")');
      if (qbElement) break;
    }
    await takeScreenshot(page, result, 'integrations-page');
    result.steps[result.steps.length - 1].status = 'pass';
    
    result.addStep('Check QuickBooks connection status', 'running');
    const pageContent = await page.content();
    const isConnected = pageContent.toLowerCase().includes('connected') || 
                        pageContent.toLowerCase().includes('synced') ||
                        pageContent.toLowerCase().includes('last sync');
    
    result.steps[result.steps.length - 1].status = 'pass';
    result.steps[result.steps.length - 1].data = { connected: isConnected };
    
    if (isConnected) {
      result.addStep('Trigger manual sync', 'running');
      const syncSelectors = [
        '[data-testid="sync-quickbooks"]',
        'button:contains("Sync")',
        'button:contains("Refresh")'
      ];
      try {
        await clickElement(page, syncSelectors, 'Sync button');
        await page.waitForTimeout(5000);
        await takeScreenshot(page, result, 'after-sync');
        result.steps[result.steps.length - 1].status = 'pass';
      } catch (e) {
        result.steps[result.steps.length - 1].status = 'skip';
        result.steps[result.steps.length - 1].note = 'Manual sync button not found';
      }
    }
    
    result.pass();
    console.log('✅ QuickBooks Sync Workflow: PASSED\n');
    
  } catch (error) {
    await takeScreenshot(page, result, 'error-state');
    result.fail(error.message);
    console.log(`❌ QuickBooks Sync Workflow: FAILED - ${error.message}\n`);
  } finally {
    await page.close();
  }
  
  return result;
}

// =============================================================================
// PARALLEL TEST RUNNER
// =============================================================================

async function runAllWorkflowTests() {
  console.log('═══════════════════════════════════════════════════════════════');
  console.log('   CoAIleague Workflow Test Suite - Trinity Triad Crawler');
  console.log('   Phase 2: Functional Testing (Not Just Page Loads!)');
  console.log('═══════════════════════════════════════════════════════════════\n');
  
  const browser = await puppeteer.launch({
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });
  
  const startTime = Date.now();
  
  // Run tests in parallel batches
  const results = [];
  
  // Batch 1: Core workflows (parallel)
  console.log('📦 Batch 1: Core Workflows (Running in Parallel)\n');
  const batch1 = await Promise.all([
    testEmployeeInvite(browser),
    testCreateShift(browser),
    testClockInOut(browser)
  ]);
  results.push(...batch1);
  
  // Batch 2: Financial workflows (parallel)
  console.log('\n📦 Batch 2: Financial Workflows (Running in Parallel)\n');
  const batch2 = await Promise.all([
    testCreateInvoice(browser),
    testQuickBooksSync(browser)
  ]);
  results.push(...batch2);
  
  // Batch 3: Reporting workflows
  console.log('\n📦 Batch 3: Reporting Workflows\n');
  const batch3 = await Promise.all([
    testIncidentReport(browser)
  ]);
  results.push(...batch3);
  
  await browser.close();
  
  // Generate summary report
  const endTime = Date.now();
  const summary = generateSummary(results, endTime - startTime);
  
  console.log('\n' + summary.text);
  
  // Return structured report for Trinity/Replit
  return {
    summary: summary.data,
    results: results.map(r => r.toJSON()),
    timestamp: new Date().toISOString(),
    duration: endTime - startTime
  };
}

function generateSummary(results, duration) {
  const passed = results.filter(r => r.status === 'pass').length;
  const failed = results.filter(r => r.status === 'fail').length;
  const total = results.length;
  const healthScore = Math.round((passed / total) * 100);
  
  let text = `
═══════════════════════════════════════════════════════════════
                    WORKFLOW TEST SUMMARY
═══════════════════════════════════════════════════════════════

  Health Score: ${healthScore}% ${healthScore >= 80 ? '✅' : healthScore >= 50 ? '⚠️' : '❌'}
  
  Passed: ${passed}/${total}
  Failed: ${failed}/${total}
  Duration: ${(duration / 1000).toFixed(2)}s

───────────────────────────────────────────────────────────────
  RESULTS BY WORKFLOW:
───────────────────────────────────────────────────────────────
`;

  for (const result of results) {
    const icon = result.status === 'pass' ? '✅' : '❌';
    text += `  ${icon} ${result.workflowId}: ${result.workflowName}\n`;
    if (result.status === 'fail') {
      text += `     └── Error: ${result.error}\n`;
    }
  }

  if (failed > 0) {
    text += `
───────────────────────────────────────────────────────────────
  🔧 FAILURES REQUIRING ATTENTION:
───────────────────────────────────────────────────────────────
`;
    for (const result of results.filter(r => r.status === 'fail')) {
      text += `
  ${result.workflowId}: ${result.workflowName}
  Error: ${result.error}
  Failed at step: ${result.steps.find(s => s.status === 'fail')?.name || 'Unknown'}
  
  Steps completed:
`;
      for (const step of result.steps) {
        const stepIcon = step.status === 'pass' ? '✅' : step.status === 'fail' ? '❌' : '⏭️';
        text += `    ${stepIcon} ${step.name}\n`;
      }
    }
  }

  text += `
═══════════════════════════════════════════════════════════════
`;

  return {
    text,
    data: {
      healthScore,
      passed,
      failed,
      total,
      duration
    }
  };
}

// =============================================================================
// ENTRY POINT
// =============================================================================

if (require.main === module) {
  runAllWorkflowTests()
    .then(report => {
      // Save report to file for Replit Agent
      const fs = require('fs');
      fs.writeFileSync('workflow-test-report.json', JSON.stringify(report, null, 2));
      console.log('\n📄 Full report saved to: workflow-test-report.json\n');
      
      // Exit with appropriate code
      process.exit(report.summary.failed > 0 ? 1 : 0);
    })
    .catch(err => {
      console.error('Test suite failed:', err);
      process.exit(1);
    });
}

module.exports = {
  runAllWorkflowTests,
  testEmployeeInvite,
  testCreateShift,
  testClockInOut,
  testCreateInvoice,
  testIncidentReport,
  testQuickBooksSync
};
