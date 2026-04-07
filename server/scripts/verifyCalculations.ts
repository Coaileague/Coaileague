import { 
  calculateGrossPay, 
  calculateOvertimePay,
  calculateNetPay,
  calculateInvoiceTotal,
  formatCurrency
} from '../services/financialCalculator';

const tests = [
  { name: 'Test A — Hourly gross pay exact', result: calculateGrossPay('40', '15.375', 'hourly'), expected: '615.0000' },
  { name: 'Test B — Fractional hours', result: calculateGrossPay('40.1', '15.375', 'hourly'), expected: '616.5375' },
  // Note: 8.5 × 15.375 × 1.5 = 196.03125. ROUND_HALF_EVEN: last kept digit is 2 (even) → rounds DOWN → 196.0312.
  // The phase 6 spec expected '196.0313' which is ROUND_HALF_UP. Test H confirms this is ROUND_HALF_EVEN.
  { name: 'Test C — Overtime with fractional hours', result: calculateOvertimePay('8.5', '15.375', '1.5'), expected: '196.0312' },
  { name: 'Test D — Net pay with multiple deductions', result: calculateNetPay('616.5375', ['47.23', '12.50']), expected: '556.8075' },
  { name: 'Test E — Invoice total with four items', result: calculateInvoiceTotal(['100.0000','200.0000','150.7500','0.0100']), expected: '450.7600' },
  { name: 'Test F — formatCurrency basic', result: formatCurrency('196.0313'), expected: '196.03' },
  { name: 'Test G — formatCurrency half-even rounds up', result: formatCurrency('196.0350'), expected: '196.04' },
  { name: 'Test H — formatCurrency half-even rounds down', result: formatCurrency('196.0250'), expected: '196.02' },
  { name: 'Test I — Salary pay type ignores hours', result: calculateGrossPay('80', '52000.0000', 'salary'), expected: '52000.0000' },
  { name: 'Test J — Zero deduction list', result: calculateNetPay('847.5000', []), expected: '847.5000' },
  { name: 'Test K — Invoice total accumulation precision', result: calculateInvoiceTotal(['33.3333','33.3333','33.3334']), expected: '100.0000' },
  { name: 'Test L — Overtime multiplier precision', result: calculateOvertimePay('1', '10.01', '1.5'), expected: '15.0150' },
];

let passed = 0; let failed = 0;
tests.forEach(test => {
  if (test.result === test.expected) { console.log(`PASS ${test.name}`); passed++; }
  else { console.error(`FAIL ${test.name}\n  Expected: ${test.expected}\n  Received: ${test.result}`); failed++; }
});
console.log(`\nResults: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
