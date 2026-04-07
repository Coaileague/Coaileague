import { sql } from 'drizzle-orm';
import { db } from '../db';
import { 
  calculateGrossPay, calculateOvertimePay,
  calculateInvoiceTotal, addFinancialValues,
  toFinancialString, formatCurrency
} from '../services/financialCalculator';

async function run() {
  // ── GAP 2: PAYROLL E2E ────────────────────────────────────────────────
  // calculateGrossPay(hours, rate, payType) handles regular hours only
  // calculateOvertimePay(hours, rate, multiplier) handles OT hours
  // gross = regularPay + overtimePay
  console.log('=== GAP 2: PAYROLL E2E — ACME sandbox ===');

  const empRows = await db.execute(sql`
    SELECT pe.employee_id, e.first_name, e.last_name, e.pay_type,
           pe.hourly_rate::text, pe.regular_hours::text, pe.overtime_hours::text,
           pe.gross_pay::text as stored_gross
    FROM payroll_entries pe
    JOIN employees e ON e.id = pe.employee_id
    WHERE pe.workspace_id = 'dev-acme-security-ws'
    AND pe.hourly_rate > 0
    AND (pe.regular_hours > 0 OR pe.overtime_hours > 0)
    ORDER BY pe.employee_id
    LIMIT 8
  `);

  let payrollPass = 0, payrollFail = 0;
  for (const row of empRows.rows as any[]) {
    const regularPay = calculateGrossPay(
      toFinancialString(row.regular_hours),
      toFinancialString(row.hourly_rate),
      'hourly'
    );
    const overtimePay = calculateOvertimePay(
      toFinancialString(row.overtime_hours),
      toFinancialString(row.hourly_rate),
      '1.5'
    );
    const totalGross4dp = addFinancialValues(regularPay, overtimePay);
    const expected = formatCurrency(totalGross4dp);
    const stored = parseFloat(row.stored_gross).toFixed(2);
    const match = expected === stored;
    if (match) payrollPass++; else payrollFail++;
    const otLabel = parseFloat(row.overtime_hours) > 0 ? ` OT=${row.overtime_hours}h` : '';
    console.log(`${match?'PASS':'FAIL'} | ${row.first_name} ${row.last_name} (${row.pay_type}) | $${row.hourly_rate}/h reg=${row.regular_hours}h${otLabel} | calc=$${expected} stored=$${stored}`);
  }
  console.log(`Payroll: ${payrollPass} PASS, ${payrollFail} FAIL\n`);

  // ── GAP 3: INVOICE E2E ────────────────────────────────────────────────
  // Test A: SUM(line_items.amount) === invoice.subtotal
  // Test B: invoice.subtotal + invoice.tax_amount === invoice.total (internal consistency)
  console.log('=== GAP 3: INVOICE E2E — ACME sandbox ===');

  const invRows = await db.execute(sql`
    SELECT i.id, i.total::text, i.subtotal::text, i.tax_amount::text
    FROM invoices i
    WHERE i.workspace_id = 'dev-acme-security-ws'
    AND i.subtotal > 0
    ORDER BY i.subtotal DESC
    LIMIT 3
  `);

  let invPass = 0, invFail = 0;
  for (const inv of invRows.rows as any[]) {
    const lineRows = await db.execute(sql`
      SELECT amount::text 
      FROM invoice_line_items 
      WHERE invoice_id = ${inv.id}
    `);
    const amounts = (lineRows.rows as any[]).map((l: any) => toFinancialString(l.amount));
    const computedSubtotal = formatCurrency(calculateInvoiceTotal(amounts));
    const storedSubtotal = parseFloat(inv.subtotal).toFixed(2);
    const storedTax = parseFloat(inv.tax_amount).toFixed(2);
    const storedTotal = parseFloat(inv.total).toFixed(2);
    const internalTotal = (parseFloat(storedSubtotal) + parseFloat(storedTax)).toFixed(2);

    const subtotalMatch = computedSubtotal === storedSubtotal;
    const totalConsistent = internalTotal === storedTotal;
    const match = subtotalMatch && totalConsistent;
    if (match) invPass++; else invFail++;

    const subLabel = subtotalMatch ? 'subtotal=MATCH' : `subtotal MISMATCH calc=$${computedSubtotal} stored=$${storedSubtotal}`;
    const totLabel = totalConsistent ? 'total=CONSISTENT' : `total INCONSISTENT ${storedSubtotal}+${storedTax}=${internalTotal}≠${storedTotal}`;
    console.log(`${match?'PASS':'FAIL'} | ${inv.id.slice(0,8)} | ${lineRows.rows.length} lines | ${subLabel} | ${totLabel}`);
  }
  console.log(`Invoice: ${invPass} PASS, ${invFail} FAIL\n`);

  // ── AUDIT TRAIL STATUS ────────────────────────────────────────────────
  console.log('=== CALCULATION_INPUTS AUDIT TRAIL ===');
  const auditRows = await db.execute(sql`
    SELECT COUNT(*) as total, COUNT(calculation_inputs) as with_inputs
    FROM payroll_entries WHERE workspace_id = 'dev-acme-security-ws'
  `);
  const a = auditRows.rows[0] as any;
  console.log(`Payroll entries: total=${a.total} | with calculation_inputs=${a.with_inputs}`);
  console.log('Pre-Phase-6 seed data has NULL calculation_inputs (expected). New payroll runs will populate the audit trail.');

  process.exit(0);
}

run().catch(e => { console.error('ERROR:', e.message); process.exit(1); });
