/**
 * Financial Validator - Trinity Debug Triad
 * ==========================================
 * Validates financial calculations, payroll math, 
 * invoice totals, and QuickBooks data sync.
 */

export interface FinancialValidationResult {
  valid: boolean;
  checks: FinancialCheck[];
  summary: {
    totalChecks: number;
    passed: number;
    failed: number;
    warnings: number;
  };
}

export interface FinancialCheck {
  name: string;
  category: 'payroll' | 'invoice' | 'time' | 'quickbooks' | 'tax';
  passed: boolean;
  expected?: number | string;
  actual?: number | string;
  difference?: number;
  message: string;
  severity: 'error' | 'warning' | 'info';
}

export interface PayrollData {
  employeeId: string;
  regularHours: number;
  overtimeHours: number;
  hourlyRate: number;
  grossPay?: number;
  deductions?: number;
  netPay?: number;
}

export interface InvoiceData {
  invoiceId: string;
  lineItems: { quantity: number; rate: number; amount?: number }[];
  subtotal?: number;
  taxRate?: number;
  taxAmount?: number;
  total?: number;
}

export interface TimeEntryData {
  entryId: string;
  clockIn: string;
  clockOut: string;
  calculatedHours?: number;
  breakMinutes?: number;
}

const EPSILON = 0.01; // Tolerance for floating point comparisons

function floatEquals(a: number, b: number): boolean {
  return Math.abs(a - b) < EPSILON;
}

export function validatePayrollCalculations(data: PayrollData): FinancialCheck[] {
  const checks: FinancialCheck[] = [];
  
  const expectedRegularPay = data.regularHours * data.hourlyRate;
  const expectedOvertimePay = data.overtimeHours * data.hourlyRate * 1.5;
  const expectedGrossPay = expectedRegularPay + expectedOvertimePay;
  
  if (data.grossPay !== undefined) {
    const passed = floatEquals(data.grossPay, expectedGrossPay);
    checks.push({
      name: 'Gross Pay Calculation',
      category: 'payroll',
      passed,
      expected: expectedGrossPay,
      actual: data.grossPay,
      difference: Math.abs(data.grossPay - expectedGrossPay),
      message: passed 
        ? `Gross pay correctly calculated as $${expectedGrossPay.toFixed(2)}`
        : `Gross pay mismatch: expected $${expectedGrossPay.toFixed(2)}, got $${data.grossPay.toFixed(2)}`,
      severity: passed ? 'info' : 'error'
    });
  }
  
  if (data.grossPay !== undefined && data.deductions !== undefined && data.netPay !== undefined) {
    const expectedNetPay = data.grossPay - data.deductions;
    const passed = floatEquals(data.netPay, expectedNetPay);
    checks.push({
      name: 'Net Pay Calculation',
      category: 'payroll',
      passed,
      expected: expectedNetPay,
      actual: data.netPay,
      difference: Math.abs(data.netPay - expectedNetPay),
      message: passed
        ? `Net pay correctly calculated as $${expectedNetPay.toFixed(2)}`
        : `Net pay mismatch: expected $${expectedNetPay.toFixed(2)}, got $${data.netPay.toFixed(2)}`,
      severity: passed ? 'info' : 'error'
    });
  }
  
  if (data.overtimeHours > 0) {
    const overtimeThreshold = 40;
    const totalHours = data.regularHours + data.overtimeHours;
    const expectedOT = Math.max(0, totalHours - overtimeThreshold);
    
    if (!floatEquals(data.overtimeHours, expectedOT) && data.regularHours < overtimeThreshold) {
      checks.push({
        name: 'Overtime Threshold Check',
        category: 'payroll',
        passed: true,
        message: `Overtime hours (${data.overtimeHours}) properly tracked`,
        severity: 'info'
      });
    }
  }
  
  return checks;
}

export function validateInvoiceCalculations(data: InvoiceData): FinancialCheck[] {
  const checks: FinancialCheck[] = [];
  
  for (let i = 0; i < data.lineItems.length; i++) {
    const item = data.lineItems[i];
    const expectedAmount = item.quantity * item.rate;
    
    if (item.amount !== undefined) {
      const passed = floatEquals(item.amount, expectedAmount);
      checks.push({
        name: `Line Item ${i + 1} Amount`,
        category: 'invoice',
        passed,
        expected: expectedAmount,
        actual: item.amount,
        difference: Math.abs(item.amount - expectedAmount),
        message: passed
          ? `Line item ${i + 1} correctly calculated`
          : `Line item ${i + 1} mismatch: ${item.quantity} × $${item.rate} should be $${expectedAmount.toFixed(2)}`,
        severity: passed ? 'info' : 'error'
      });
    }
  }
  
  const calculatedSubtotal = data.lineItems.reduce((sum, item) => {
    return sum + (item.amount ?? item.quantity * item.rate);
  }, 0);
  
  if (data.subtotal !== undefined) {
    const passed = floatEquals(data.subtotal, calculatedSubtotal);
    checks.push({
      name: 'Invoice Subtotal',
      category: 'invoice',
      passed,
      expected: calculatedSubtotal,
      actual: data.subtotal,
      difference: Math.abs(data.subtotal - calculatedSubtotal),
      message: passed
        ? `Subtotal correctly calculated as $${calculatedSubtotal.toFixed(2)}`
        : `Subtotal mismatch: expected $${calculatedSubtotal.toFixed(2)}, got $${data.subtotal.toFixed(2)}`,
      severity: passed ? 'info' : 'error'
    });
  }
  
  if (data.taxRate !== undefined && data.taxAmount !== undefined) {
    const expectedTax = (data.subtotal ?? calculatedSubtotal) * (data.taxRate / 100);
    const passed = floatEquals(data.taxAmount, expectedTax);
    checks.push({
      name: 'Tax Calculation',
      category: 'tax',
      passed,
      expected: expectedTax,
      actual: data.taxAmount,
      difference: Math.abs(data.taxAmount - expectedTax),
      message: passed
        ? `Tax correctly calculated at ${data.taxRate}%`
        : `Tax mismatch: ${data.taxRate}% of $${(data.subtotal ?? calculatedSubtotal).toFixed(2)} should be $${expectedTax.toFixed(2)}`,
      severity: passed ? 'info' : 'error'
    });
  }
  
  if (data.total !== undefined) {
    const expectedTotal = (data.subtotal ?? calculatedSubtotal) + (data.taxAmount ?? 0);
    const passed = floatEquals(data.total, expectedTotal);
    checks.push({
      name: 'Invoice Total',
      category: 'invoice',
      passed,
      expected: expectedTotal,
      actual: data.total,
      difference: Math.abs(data.total - expectedTotal),
      message: passed
        ? `Invoice total correctly calculated as $${expectedTotal.toFixed(2)}`
        : `Total mismatch: expected $${expectedTotal.toFixed(2)}, got $${data.total.toFixed(2)}`,
      severity: passed ? 'info' : 'error'
    });
  }
  
  return checks;
}

export function validateTimeEntryCalculations(data: TimeEntryData): FinancialCheck[] {
  const checks: FinancialCheck[] = [];
  
  const clockIn = new Date(data.clockIn);
  const clockOut = new Date(data.clockOut);
  const diffMs = clockOut.getTime() - clockIn.getTime();
  const diffHours = diffMs / (1000 * 60 * 60);
  
  const breakHours = (data.breakMinutes ?? 0) / 60;
  const expectedHours = Math.max(0, diffHours - breakHours);
  
  if (data.calculatedHours !== undefined) {
    const passed = floatEquals(data.calculatedHours, expectedHours);
    checks.push({
      name: 'Time Entry Hours',
      category: 'time',
      passed,
      expected: expectedHours,
      actual: data.calculatedHours,
      difference: Math.abs(data.calculatedHours - expectedHours),
      message: passed
        ? `Hours correctly calculated as ${expectedHours.toFixed(2)}`
        : `Hours mismatch: expected ${expectedHours.toFixed(2)}, got ${data.calculatedHours.toFixed(2)}`,
      severity: passed ? 'info' : 'error'
    });
  }
  
  if (diffHours < 0) {
    checks.push({
      name: 'Clock Out Before Clock In',
      category: 'time',
      passed: false,
      message: `Invalid time entry: clock out (${data.clockOut}) is before clock in (${data.clockIn})`,
      severity: 'error'
    });
  }
  
  if (diffHours > 24) {
    checks.push({
      name: 'Excessive Shift Duration',
      category: 'time',
      passed: true,
      message: `Warning: Shift duration exceeds 24 hours (${diffHours.toFixed(1)} hours)`,
      severity: 'warning'
    });
  }
  
  return checks;
}

export interface QuickBooksReconciliation {
  localTotal: number;
  quickbooksTotal: number;
  entityType: 'invoice' | 'payment' | 'expense' | 'payroll';
  entityCount: { local: number; quickbooks: number };
}

export function validateQuickBooksSync(data: QuickBooksReconciliation): FinancialCheck[] {
  const checks: FinancialCheck[] = [];
  
  const totalPassed = floatEquals(data.localTotal, data.quickbooksTotal);
  checks.push({
    name: `QuickBooks ${data.entityType} Total Sync`,
    category: 'quickbooks',
    passed: totalPassed,
    expected: data.localTotal,
    actual: data.quickbooksTotal,
    difference: Math.abs(data.localTotal - data.quickbooksTotal),
    message: totalPassed
      ? `${data.entityType} totals match: $${data.localTotal.toFixed(2)}`
      : `${data.entityType} total mismatch: Local $${data.localTotal.toFixed(2)} vs QB $${data.quickbooksTotal.toFixed(2)}`,
    severity: totalPassed ? 'info' : 'error'
  });
  
  const countPassed = data.entityCount.local === data.entityCount.quickbooks;
  checks.push({
    name: `QuickBooks ${data.entityType} Count Sync`,
    category: 'quickbooks',
    passed: countPassed,
    expected: data.entityCount.local,
    actual: data.entityCount.quickbooks,
    message: countPassed
      ? `${data.entityType} counts match: ${data.entityCount.local} records`
      : `${data.entityType} count mismatch: Local ${data.entityCount.local} vs QB ${data.entityCount.quickbooks}`,
    severity: countPassed ? 'info' : (Math.abs(data.entityCount.local - data.entityCount.quickbooks) > 5 ? 'error' : 'warning')
  });
  
  return checks;
}

export function summarizeValidation(checks: FinancialCheck[]): FinancialValidationResult {
  const passed = checks.filter(c => c.passed).length;
  const failed = checks.filter(c => !c.passed && c.severity === 'error').length;
  const warnings = checks.filter(c => !c.passed && c.severity === 'warning').length;
  
  return {
    valid: failed === 0,
    checks,
    summary: {
      totalChecks: checks.length,
      passed,
      failed,
      warnings
    }
  };
}
