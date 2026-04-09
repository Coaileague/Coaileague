/**
 * Financial Integration Seed — Acme (QuickBooks) & Anvil (Stripe-Local)
 *
 * Acme Security Services  → QuickBooks sandbox mode
 *   - billingSettingsBlob set to QB provider
 *   - partner_connections QB connection set to connected (sandbox simulation)
 *   - clients.quickbooks_client_id / invoices.quickbooks_invoice_id populated
 *   - quickbooks_sync_receipts shows every push attempt (real or simulated)
 *
 * Anvil Security Group    → Stripe-local mode
 *   - billingSettingsBlob set to Stripe provider
 *   - Real Stripe test Customers created for each client (clients.stripe_customer_id)
 *   - Stripe Connect accounts for employees (employee_payroll_info.stripe_connect_account_id)
 *   - Stripe PaymentIntents for Anvil invoices (invoices.payment_intent_id)
 *   - payroll_entries.disbursement_method = 'stripe_connect' for processed runs
 *
 * Idempotent: sentinel checks QB partner_connection status.
 */

import { db } from '../db';
import { and, desc, eq, or, sql } from 'drizzle-orm';
import Stripe from 'stripe';
import { typedExec, typedQuery } from '../lib/typedSql';
import { clients, invoices, payrollRuns, quickbooksSyncReceipts, employees, employeePayrollInfo, payrollEntries } from '@shared/schema';

const ACME = 'dev-acme-security-ws';
const ANVIL = 'dev-anvil-security-ws';
const QB_SANDBOX_REALM = '9341456086062919';
const QB_SANDBOX_BASE = 'https://sandbox-quickbooks.api.intuit.com/v3/company';

const stripe = process.env.STRIPE_SECRET_KEY
  ? new Stripe(process.env.STRIPE_SECRET_KEY, { apiVersion: '2025-01-27.acacia' as any })
  : null;

// ─── Sentinel ─────────────────────────────────────────────────────────────────
async function alreadySeeded(): Promise<boolean> {
  // Require BOTH Acme QB invoices AND Anvil Stripe clients to be seeded
  // Converted to Drizzle ORM: IS NOT NULL
  const acmeInvCheckRows = await db.select({ id: invoices.id })
    .from(invoices)
    .where(and(
      eq(invoices.workspaceId, ACME),
      sql`${invoices.quickbooksInvoiceId} IS NOT NULL`
    ))
    .limit(1);

  // Converted to Drizzle ORM: IS NOT NULL
  const anvilClientCheckRows = await db.select({ id: clients.id })
    .from(clients)
    .where(and(
      eq(clients.workspaceId, ANVIL),
      sql`${clients.stripeCustomerId} IS NOT NULL`
    ))
    .limit(1);

  return acmeInvCheckRows.length > 0 && anvilClientCheckRows.length > 0;
}

// ─── QB payload builders ──────────────────────────────────────────────────────
function buildQBInvoicePayload(inv: any, qbCustomerId: string): object {
  const amount = Number(inv.total ?? 0);
  return {
    CustomerRef: { value: qbCustomerId },
    Line: [{
      Amount: amount,
      DetailType: 'SalesItemLineDetail',
      SalesItemLineDetail: {
        ItemRef: { value: '1', name: 'Security Services' },
        Qty: 1,
        UnitPrice: amount,
        Description: `Security Services — Invoice ${inv.invoice_number ?? inv.id?.slice(0, 8)}`,
      },
    }],
    DocNumber: `COai-${inv.invoice_number ?? inv.id?.slice(0, 8)}`,
    DueDate: inv.due_date ? new Date(inv.due_date).toISOString().slice(0, 10) : undefined,
    TxnDate: inv.created_at ? new Date(inv.created_at).toISOString().slice(0, 10) : new Date().toISOString().slice(0, 10),
    PrivateNote: `CoAIleague | WS: ${ACME} | InvID: ${inv.id}`,
  };
}

function buildQBTimeActivityPayload(entry: any): object {
  return {
    NameOf: 'Employee',
    EmployeeRef: { value: entry.qb_employee_ref ?? '1', name: `${entry.first_name} ${entry.last_name}` },
    Hours: Number(entry.regular_hours ?? 0),
    Minutes: 0,
    HourlyRate: Number(entry.hourly_rate ?? 0),
    BillableStatus: 'NotBillable',
    Description: `Payroll — ${entry.first_name} ${entry.last_name} — Period ${
      entry.period_start ? new Date(entry.period_start).toISOString().slice(0, 10) : ''
    } to ${entry.period_end ? new Date(entry.period_end).toISOString().slice(0, 10) : ''}`,
    TransactionDate: entry.period_end ? new Date(entry.period_end).toISOString().slice(0, 10) : new Date().toISOString().slice(0, 10),
  };
}

// ─── QB sandbox push ──────────────────────────────────────────────────────────
async function qbPush(
  entityType: string,
  localId: string,
  endpoint: string,
  payload: object,
  amount: number,
  accessToken: string,
  isSim: boolean
): Promise<{ qbId: string | null; success: boolean }> {
  const receiptId = `qbr-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;

  if (isSim) {
    const qbSimId = `QB-SIM-${entityType.toUpperCase()}-${Date.now()}`;
    // Converted to Drizzle ORM: ON CONFLICT
    await db.insert(quickbooksSyncReceipts).values({
      id: receiptId,
      workspaceId: ACME,
      syncType: 'sandbox_simulation',
      direction: 'push',
      localEntityId: localId,
      localEntityType: entityType,
      quickbooksEntityId: qbSimId,
      quickbooksEntityType: entityType,
      success: true,
      amount: String(amount),
      description: '[SIM] ' + JSON.stringify(payload).slice(0, 400),
      quickbooksUrl: `${QB_SANDBOX_BASE}/${QB_SANDBOX_REALM}/${endpoint}`,
      trinityVerified: false,
      syncedAt: sql`now()`,
      createdAt: sql`now()`,
    }).onConflictDoNothing().catch(() => {});
    return { qbId: qbSimId, success: true };
  }

  try {
    const url = `${QB_SANDBOX_BASE}/${QB_SANDBOX_REALM}/${endpoint}?minorversion=70`;
    const resp = await fetch(url, {
      method: 'POST',
      headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify(payload),
    });
    const text = await resp.text();
    let qbId: string | null = null;
    if (resp.ok) {
      const data = JSON.parse(text).catch?.(() => ({})) ?? JSON.parse(text);
      qbId = data?.Invoice?.Id ?? data?.TimeActivity?.Id ?? null;
    }
    // Converted to Drizzle ORM: ON CONFLICT
    await db.insert(quickbooksSyncReceipts).values({
      id: receiptId,
      workspaceId: ACME,
      syncType: 'sandbox_live',
      direction: 'push',
      localEntityId: localId,
      localEntityType: entityType,
      quickbooksEntityId: qbId ?? 'unknown',
      quickbooksEntityType: entityType,
      success: resp.ok,
      amount: String(amount),
      description: JSON.stringify(payload).slice(0, 400),
      quickbooksUrl: `${QB_SANDBOX_BASE}/${QB_SANDBOX_REALM}/${endpoint}`,
      errorMessage: resp.ok ? null : text.slice(0, 300),
      trinityVerified: resp.ok,
      syncedAt: sql`now()`,
      createdAt: sql`now()`,
    }).onConflictDoNothing().catch(() => {});
    return { qbId, success: resp.ok };
  } catch (err: any) {
    return { qbId: null, success: false };
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// SECTION 1 — ACME: QuickBooks Sandbox
// ═══════════════════════════════════════════════════════════════════════════════
async function seedAcmeQBMode() {
  console.log('[FinancialSeed] Acme: Setting up QuickBooks sandbox mode...');

  // 1a. Set billing provider to QB
  // CATEGORY C — Raw SQL retained: jsonb_build_object | Tables: workspaces | Verified: 2026-03-23
  await typedExec(sql`
    UPDATE workspaces SET
      billing_settings_blob = jsonb_build_object(
        'invoiceProvider', 'quickbooks'::text,
        'payrollProvider', 'quickbooks'::text,
        'qbAutoSync', true,
        'qbSandbox', true,
        'stripeMode', 'none'::text
      )
    WHERE id = ${ACME}
  `);
  console.log('[FinancialSeed] Acme: billing_settings_blob → QB mode');

  // 1b. Update QB partner_connection to connected + simulation mode
  const qbApiBase = `${QB_SANDBOX_BASE}/${QB_SANDBOX_REALM}`;
  // CATEGORY C — Raw SQL retained: jsonb_build_object | Tables: partner_connections | Verified: 2026-03-23
  await typedExec(sql`
    UPDATE partner_connections SET
      partner_name = 'QuickBooks Sandbox',
      token_type = 'Bearer',
      expires_at = '2026-12-31 23:59:59'::timestamptz,
      refresh_token_expires_at = '2027-12-31 23:59:59'::timestamptz,
      scopes = ARRAY['com.intuit.quickbooks.accounting', 'com.intuit.quickbooks.payroll']::text[],
      status = 'connected',
      realm_id = ${QB_SANDBOX_REALM},
      company_id = ${QB_SANDBOX_REALM},
      metadata = jsonb_build_object(
        'sandbox', true,
        'environment', 'sandbox'::text,
        'companyName', 'Acme Security Services Inc'::text,
        'realmId', ${QB_SANDBOX_REALM}::text,
        'apiBase', ${qbApiBase}::text,
        'syncMode', 'simulation'::text,
        'note', 'Set QB_SANDBOX_ACCESS_TOKEN env var for live pushes.'::text
      ),
      updated_at = NOW()
    WHERE workspace_id = ${ACME} AND partner_type = 'quickbooks'
  `);
  console.log('[FinancialSeed] Acme: QB partner_connection → connected (realm ' + QB_SANDBOX_REALM + ')');

  // 1c. Assign QB Customer IDs to Acme clients (using quickbooks_client_id column)
  // Converted to Drizzle ORM: IS NULL
  const acmeClientsRows = await db.select({ id: clients.id, companyName: clients.companyName })
    .from(clients)
    .where(and(
      eq(clients.workspaceId, ACME),
      sql`${clients.quickbooksClientId} IS NULL`
    ));

  let qbCustIdx = 100;
  for (const c of acmeClientsRows) {
    const qbId = `QB-CUST-${qbCustIdx++}`;
    // Converted to Drizzle ORM
    await db.update(clients).set({
      quickbooksClientId: qbId,
      quickbooksSyncStatus: 'synced',
      quickbooksLastSync: sql`now()`,
    }).where(eq(clients.id, c.id));
  }
  console.log(`[FinancialSeed] Acme: ${acmeClientsRows.length} clients assigned QB Customer IDs`);

  // 1d. Assign QB Employee refs to Acme employees via employee_payroll_info bank_details
  // Converted to Drizzle ORM: LEFT JOIN → db.leftJoin()
  const acmeEmployeesRows = await db.select({
    id: employees.id,
    firstName: employees.firstName,
    lastName: employees.lastName,
    hourlyRate: employees.hourlyRate,
    piId: employeePayrollInfo.id
  })
    .from(employees)
    .leftJoin(employeePayrollInfo, eq(employeePayrollInfo.employeeId, employees.id))
    .where(eq(employees.workspaceId, ACME))
    .limit(15);

  let qbEmpIdx = 200;
  for (const e of acmeEmployeesRows) {
    const qbEmpRef = `QB-EMP-${qbEmpIdx++}`;
    if (e.piId) {
      // CATEGORY C — Raw SQL retained: jsonb_build_object | Tables: employee_payroll_info | Verified: 2026-03-23
      await typedExec(sql`
        UPDATE employee_payroll_info SET
          bank_details = COALESCE(bank_details, '{}'::jsonb) || jsonb_build_object(
            'qbEmployeeId', ${qbEmpRef}::text,
            'qbSyncedAt', NOW()::text,
            'qbEnvironment', 'sandbox'::text
          )
        WHERE id = ${e.piId}
      `).catch(() => {});
    }
  }
  console.log(`[FinancialSeed] Acme: ${acmeEmployeesRows.length} employees assigned QB IDs via payroll_info`);

  // 1e. Push Acme invoices to QB sandbox (real or simulated)
  const liveToken = process.env.QB_SANDBOX_ACCESS_TOKEN ?? null;
  const isSim = !liveToken;
  if (isSim) {
    console.log('[FinancialSeed] Acme QB: No QB_SANDBOX_ACCESS_TOKEN — simulation mode (payloads stored as receipts)');
  } else {
    console.log('[FinancialSeed] Acme QB: QB_SANDBOX_ACCESS_TOKEN found — pushing LIVE to QB sandbox');
  }

  // Converted to Drizzle ORM: IS NULL
  const acmeInvoicesRows = await db.select({
    id: invoices.id,
    invoiceNumber: invoices.invoiceNumber,
    total: invoices.total,
    status: invoices.status,
    dueDate: invoices.dueDate,
    createdAt: invoices.createdAt,
    qbCustomerId: clients.quickbooksClientId,
    companyName: clients.companyName
  })
    .from(invoices)
    .innerJoin(clients, eq(clients.id, invoices.clientId))
    .where(and(
      eq(invoices.workspaceId, ACME),
      sql`${invoices.status} IN ('sent', 'paid', 'overdue')`,
      sql`${invoices.quickbooksInvoiceId} IS NULL`
    ))
    .orderBy(desc(invoices.createdAt))
    .limit(5);

  let invPushed = 0;
  for (const inv of acmeInvoicesRows) {
    const qbCustId = inv.qbCustomerId ?? '1';
    const payload = buildQBInvoicePayload(inv, qbCustId);
    const { qbId, success } = await qbPush('invoice', inv.id, 'invoice', payload, Number(inv.total ?? 0), liveToken ?? 'sim', isSim);
    if (success && qbId) {
      // Converted to Drizzle ORM
      await db.update(invoices).set({
        quickbooksInvoiceId: qbId,
        quickbooksSyncStatus: isSim ? 'simulated' : 'synced',
        quickbooksLastSync: sql`now()`,
      }).where(eq(invoices.id, inv.id));
      invPushed++;
    }
  }
  console.log(`[FinancialSeed] Acme: ${invPushed}/${acmeInvoicesRows.length} invoices pushed to QB sandbox`);

  // 1f. Push Acme payroll entries to QB as TimeActivities
  // Converted to Drizzle ORM: LEFT JOIN → db.leftJoin()
  const acmePayrollEntriesRows = await db.select({
    id: payrollEntries.id,
    employeeId: payrollEntries.employeeId,
    grossPay: payrollEntries.grossPay,
    regularHours: payrollEntries.regularHours,
    firstName: employees.firstName,
    lastName: employees.lastName,
    hourlyRate: employees.hourlyRate,
    qbEmployeeRef: sql<string>`${employeePayrollInfo.bankDetails}->>'qbEmployeeId'`,
    periodStart: payrollRuns.periodStart,
    periodEnd: payrollRuns.periodEnd
  })
    .from(payrollEntries)
    .innerJoin(payrollRuns, eq(payrollRuns.id, payrollEntries.payrollRunId))
    .innerJoin(employees, eq(employees.id, payrollEntries.employeeId))
    .leftJoin(employeePayrollInfo, eq(employeePayrollInfo.employeeId, payrollEntries.employeeId))
    .where(and(
      eq(payrollRuns.workspaceId, ACME),
      eq(payrollRuns.status, 'completed')
    ))
    .limit(8);

  let payPushed = 0;
  for (const entry of acmePayrollEntriesRows) {
    const payload = buildQBTimeActivityPayload(entry);
    const { qbId, success } = await qbPush('payroll_entry', entry.id, 'timeactivity', payload, Number(entry.grossPay ?? 0), liveToken ?? 'sim', isSim);
    if (success && qbId) {
      // CATEGORY C — Raw SQL retained: Seed data UPDATE with COALESCE + string concatenation | Tables: payroll_entries | Verified: 2026-03-23
      await typedExec(sql`
        UPDATE payroll_entries SET
          disbursement_method = 'quickbooks_payroll',
          notes = COALESCE(notes || ' | ', '') || ${`QB TimeActivity: ${qbId}`}
        WHERE id = ${entry.id}
      `).catch(() => {});
      payPushed++;
    }
  }
  console.log(`[FinancialSeed] Acme: ${payPushed}/${acmePayrollEntriesRows.length} payroll entries pushed to QB`);

  console.log('[FinancialSeed] Acme: QuickBooks sandbox mode seeding complete');
}

// ═══════════════════════════════════════════════════════════════════════════════
// SECTION 2 — ANVIL: Stripe-Local
// ═══════════════════════════════════════════════════════════════════════════════
async function seedAnvilStripeMode() {
  console.log('[FinancialSeed] Anvil: Setting up Stripe-local mode...');

  // 2a. Set billing provider to Stripe
  // CATEGORY C — Raw SQL retained: jsonb_build_object | Tables: workspaces | Verified: 2026-03-23
  await typedExec(sql`
    UPDATE workspaces SET
      billing_settings_blob = jsonb_build_object(
        'invoiceProvider', 'stripe'::text,
        'payrollProvider', 'local'::text,
        'qbAutoSync', false,
        'stripeMode', 'test'::text,
        'payoutMethod', 'stripe_connect'::text
      )
    WHERE id = ${ANVIL}
  `);
  console.log('[FinancialSeed] Anvil: billing_settings_blob → Stripe-local mode');

  if (!stripe) {
    console.warn('[FinancialSeed] Anvil: STRIPE_SECRET_KEY not set — seeding simulated Stripe IDs only');
    await seedAnvilStripeFallback();
    return;
  }

  // 2b. Create Stripe test Customers for Anvil clients
  // Converted to Drizzle ORM: LIKE
  const anvilClientsRows = await db.select({
    id: clients.id,
    companyName: clients.companyName,
    email: clients.email,
    phone: clients.phone
  })
    .from(clients)
    .where(and(
      eq(clients.workspaceId, ANVIL),
      or(
        sql`${clients.stripeCustomerId} IS NULL`,
        sql`${clients.stripeCustomerId} NOT LIKE 'cus_%'`
      )
    ));

  let stripeCustomersCreated = 0;
  for (const c of anvilClientsRows) {
    try {
      const customer = await stripe!.customers.create({
        name: c.companyName,
        email: c.email ?? `billing+${c.id}@anvilsecurity.test`,
        phone: c.phone ?? undefined,
        description: `Anvil Security Group — CoAIleague test (workspace: ${ANVIL})`,
        metadata: { coaileague_client_id: c.id, coaileague_workspace_id: ANVIL, environment: 'test' },
      });
      await db.update(clients).set({ stripeCustomerId: customer.id }).where(eq(clients.id, c.id));
      console.log(`[FinancialSeed] Anvil: Stripe customer ${customer.id} → ${c.company_name}`);
      stripeCustomersCreated++;
    } catch (err: any) {
      console.warn(`[FinancialSeed] Anvil: Customer creation failed for ${c.company_name}: ${(err instanceof Error ? err.message : String(err))}`);
      const simId = `cus_SIM_${c.id.slice(0, 10)}`;
      await db.update(clients).set({ stripeCustomerId: simId }).where(eq(clients.id, c.id)).catch(() => {});
    }
  }
  console.log(`[FinancialSeed] Anvil: ${stripeCustomersCreated} Stripe customers created`);

  // 2c. Create Stripe Connect accounts for Anvil employees
  // Converted to Drizzle ORM: LEFT JOIN → db.leftJoin()
  const anvilEmployeesRows = await db.select({
    id: employees.id,
    firstName: employees.firstName,
    lastName: employees.lastName,
    email: employees.email,
    piId: employeePayrollInfo.id,
    stripeConnectAccountId: employeePayrollInfo.stripeConnectAccountId
  })
    .from(employees)
    .leftJoin(employeePayrollInfo, eq(employeePayrollInfo.employeeId, employees.id))
    .where(eq(employees.workspaceId, ANVIL))
    .limit(12);

  let connectsCreated = 0;
  for (const emp of anvilEmployeesRows) {
    if (emp.stripeConnectAccountId?.startsWith('acct_')) {
      console.log(`[FinancialSeed] Anvil: ${emp.firstName} already has Connect acct ${emp.stripeConnectAccountId}`);
      continue;
    }
    if (!emp.piId) continue; // No payroll_info record

    try {
      const account = await stripe!.accounts.create({
        type: 'custom',
        country: 'US',
        email: emp.email ?? `${emp.id}@anvilsecurity.test`,
        capabilities: { transfers: { requested: true } },
        business_type: 'individual',
        individual: { first_name: emp.firstName, last_name: emp.lastName },
        metadata: { coaileague_employee_id: emp.id, coaileague_workspace_id: ANVIL, environment: 'test' },
        settings: { payouts: { schedule: { interval: 'manual' } } },
        tos_acceptance: { date: Math.floor(Date.now() / 1000), ip: '127.0.0.1' },
      });
      // CATEGORY C — Raw SQL retained: Seed data UPDATE | Tables: employee_payroll_info | Verified: 2026-03-23
      await typedExec(sql`
        UPDATE employee_payroll_info SET
          stripe_connect_account_id = ${account.id},
          stripe_connect_payouts_enabled = false,
          stripe_connect_onboarding_complete = false
        WHERE id = ${emp.piId}
      `);
      console.log(`[FinancialSeed] Anvil: Connect account ${account.id} → ${emp.firstName} ${emp.lastName}`);
      connectsCreated++;
    } catch (err: any) {
      console.warn(`[FinancialSeed] Anvil: Connect account failed for ${emp.firstName}: ${(err instanceof Error ? err.message : String(err))}`);
      const simId = `acct_SIM_${emp.id.slice(0, 8)}`;
      // CATEGORY C — Raw SQL retained: Seed data UPDATE (fallback simulation) | Tables: employee_payroll_info | Verified: 2026-03-23
      await typedExec(sql`
        UPDATE employee_payroll_info SET
          stripe_connect_account_id = ${simId},
          stripe_connect_payouts_enabled = false,
          stripe_connect_onboarding_complete = false,
          preferred_payout_method = 'stripe_connect'
        WHERE id = ${emp.piId}
      `).catch(() => {});
    }
  }
  console.log(`[FinancialSeed] Anvil: ${connectsCreated} Stripe Connect accounts created`);

  // 2d. Create Stripe PaymentIntents for Anvil invoices
  await seedAnvilInvoicePaymentIntents();

  // 2e. Mark Anvil payroll runs as Stripe-disbursed
  await seedAnvilPayrollStripeRecords();

  console.log('[FinancialSeed] Anvil: Stripe-local mode seeding complete');
}

async function seedAnvilInvoicePaymentIntents() {
  if (!stripe) return;

  // Converted to Drizzle ORM: LIKE
  const anvilInvoicesRows = await db.select({
    id: invoices.id,
    invoiceNumber: invoices.invoiceNumber,
    total: invoices.total,
    status: invoices.status,
    stripeCustomerId: clients.stripeCustomerId,
    companyName: clients.companyName
  })
    .from(invoices)
    .innerJoin(clients, eq(clients.id, invoices.clientId))
    .where(and(
      eq(invoices.workspaceId, ANVIL),
      sql`${invoices.status} IN ('sent', 'draft')`,
      or(
        sql`${invoices.paymentIntentId} IS NULL`,
        sql`${invoices.paymentIntentId} NOT LIKE 'pi_%'`
      )
    ))
    .orderBy(desc(invoices.total))
    .limit(8);

  let pisCreated = 0;
  for (const inv of anvilInvoicesRows) {
    const amountCents = Math.round(Number(inv.total ?? 0) * 100);
    if (amountCents < 50) continue;

    try {
      const piParams: Stripe.PaymentIntentCreateParams = {
        amount: amountCents,
        currency: 'usd',
        payment_method_types: ['card'],
        description: `Invoice ${inv.invoiceNumber} — ${inv.companyName}`,
        metadata: {
          coaileague_invoice_id: inv.id,
          coaileague_workspace_id: ANVIL,
          invoice_number: inv.invoiceNumber ?? '',
          environment: 'test',
        },
      };
      if (inv.stripeCustomerId?.startsWith('cus_')) {
        piParams.customer = inv.stripeCustomerId;
      }

      const pi = await stripe!.paymentIntents.create(piParams);
      await db.update(invoices).set({ paymentIntentId: pi.id, stripeInvoiceId: pi.id }).where(eq(invoices.id, inv.id));
      console.log(`[FinancialSeed] Anvil: PaymentIntent ${pi.id} ($${(amountCents / 100).toFixed(2)}) for invoice ${inv.invoiceNumber}`);
      pisCreated++;
    } catch (err: any) {
      console.warn(`[FinancialSeed] Anvil: PI failed for invoice ${inv.invoiceNumber}: ${(err instanceof Error ? err.message : String(err))}`);
    }
  }
  console.log(`[FinancialSeed] Anvil: ${pisCreated} PaymentIntents created for invoices`);
}

async function seedAnvilPayrollStripeRecords() {
  // Get processed Anvil payroll runs + entries — mark with Stripe disbursement info
  // Converted to Drizzle ORM
  const processedRunsRows = await db.select({
    id: payrollRuns.id,
    status: payrollRuns.status,
    totalNetPay: payrollRuns.totalNetPay
  })
    .from(payrollRuns)
    .where(and(
      eq(payrollRuns.workspaceId, ANVIL),
      eq(payrollRuns.status, 'processed')
    ));

  for (const run of processedRunsRows) {
    // Converted to Drizzle ORM
    await db.update(payrollRuns).set({
      disbursementStatus: 'disbursed',
      disbursementDate: sql`now()`,
    }).where(eq(payrollRuns.id, run.id)).catch(() => {});

    // Converted to Drizzle ORM: LEFT JOIN → db.leftJoin()
    const entriesRows = await db.select({
      id: payrollEntries.id,
      netPay: payrollEntries.netPay,
      stripeConnectAccountId: employeePayrollInfo.stripeConnectAccountId
    })
      .from(payrollEntries)
      .leftJoin(employeePayrollInfo, eq(employeePayrollInfo.employeeId, payrollEntries.employeeId))
      .where(eq(payrollEntries.payrollRunId, run.id));

    for (const entry of entriesRows) {
      const connectId = entry.stripeConnectAccountId;
      const netCents = Math.round(Number(entry.netPay ?? 0) * 100);

      let transferId: string | null = null;
      if (stripe && connectId?.startsWith('acct_') && !connectId.includes('SIM') && netCents >= 100) {
        try {
          const transfer = await stripe!.transfers.create({
            amount: netCents,
            currency: 'usd',
            destination: connectId,
            description: `Payroll payout — ${ANVIL} — run ${run.id.slice(0, 8)}`,
            metadata: {
              coaileague_payroll_entry_id: entry.id,
              coaileague_payroll_run_id: run.id,
              coaileague_workspace_id: ANVIL,
              environment: 'test',
            },
          });
          transferId = transfer.id;
          console.log(`[FinancialSeed] Anvil: Stripe transfer ${transfer.id} ($${(netCents / 100).toFixed(2)}) → ${connectId}`);
        } catch (err: any) {
          transferId = `tr_SIM_${entry.id.slice(0, 8)}`;
          console.warn(`[FinancialSeed] Anvil: Transfer failed (${(err instanceof Error ? err.message : String(err))}) — sim ID ${transferId}`);
        }
      } else {
        transferId = connectId ? `tr_SIM_${entry.id.slice(0, 8)}` : null;
      }

      // CATEGORY C — Genuine complex: COALESCE string concat on notes column | Tables: payroll_entries
      await typedExec(sql`
        UPDATE payroll_entries SET
          disbursement_method = 'stripe_connect',
          disbursed_at = NOW(),
          notes = COALESCE(notes || ' | ', '') || ${`Stripe: ${transferId ?? 'sim'}`}
        WHERE id = ${entry.id}
      `).catch(() => {});
    }

    console.log(`[FinancialSeed] Anvil: Payroll run ${run.id.slice(0, 8)} → Stripe disbursement recorded`);
  }
}

async function seedAnvilStripeFallback() {
  // No Stripe SDK — seed simulated IDs
  // Converted to Drizzle ORM: IS NULL
  const anvilClientsRows = await db.select({ id: clients.id })
    .from(clients)
    .where(and(
      eq(clients.workspaceId, ANVIL),
      sql`${clients.stripeCustomerId} IS NULL`
    ));

  let idx = 0;
  for (const c of anvilClientsRows) {
    await db.update(clients).set({ stripeCustomerId: 'cus_SIM_' + c.id.slice(0, 10) }).where(eq(clients.id, c.id)).catch(() => {});
    idx++;
  }

  // Converted to Drizzle ORM: IS NULL
  const empInfosRows = await db.select({ id: employeePayrollInfo.id })
    .from(employeePayrollInfo)
    .innerJoin(employees, eq(employees.id, employeePayrollInfo.employeeId))
    .where(and(
      eq(employees.workspaceId, ANVIL),
      sql`${employeePayrollInfo.stripeConnectAccountId} IS NULL`
    ));

  for (const pi of empInfosRows) {
    // CATEGORY C — Raw SQL retained: Seed data fallback simulation UPDATE | Tables: employee_payroll_info | Verified: 2026-03-23
    await typedExec(sql`
      UPDATE employee_payroll_info SET
        stripe_connect_account_id = ${'acct_SIM_' + pi.id.slice(0, 8)},
        preferred_payout_method = 'stripe_connect'
      WHERE id = ${pi.id}
    `).catch(() => {});
  }
  console.log(`[FinancialSeed] Anvil fallback: ${idx} clients, ${empInfosRows.length} employees — simulated Stripe IDs`);
}

// ═══════════════════════════════════════════════════════════════════════════════
// MAIN EXPORT
// ═══════════════════════════════════════════════════════════════════════════════
export async function runFinancialIntegrationsSeed(): Promise<{ message: string }> {
  try {
    if (await alreadySeeded()) {
      return { message: '[FinancialSeed] Already seeded — skipping' };
    }

    console.log('[FinancialSeed] Starting financial integrations seed (Acme=QB, Anvil=Stripe)...');

    await seedAcmeQBMode();
    await seedAnvilStripeMode();

    console.log('[FinancialSeed] Financial integrations seed complete');
    return { message: 'Financial integrations seed complete (Acme→QB sandbox, Anvil→Stripe-local)' };
  } catch (err: any) {
    console.error('[FinancialSeed] Seed failed:', (err instanceof Error ? err.message : String(err)));
    return { message: `Financial integrations seed failed: ${(err instanceof Error ? err.message : String(err))}` };
  }
}
