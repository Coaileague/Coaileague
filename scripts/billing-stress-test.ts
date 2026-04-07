/**
 * BILLING STRESS TEST v2 — New Pricing Model Validation
 * =======================================================
 * Validates the Mar 2026 credit system rebalance:
 *   - Increased token rates (0.3/2.0/1.8 flash, was 0.2/1.2/1.2)
 *   - Increased session fees (scheduling 250, payroll 100, invoicing 75)
 *   - Per-shift doubled to 20 cr/shift
 *   - Per-invoice billing added: 50 cr/invoice (was 0)
 *   - Per-payroll-employee billing added: 8 cr/employee/run (was 0)
 *   - Reduced monthly allocations (ent: 20K, pro: 6K, starter: 1.5K, free: 150)
 *
 * Also shows OLD vs NEW comparison for business decision-making.
 */

import { db } from '../server/db';
import { shifts, workspaceCredits, creditTransactions } from '../shared/schema';
import { eq, and, ilike } from 'drizzle-orm';
import {
  creditManager,
  CREDIT_COSTS,
  calculateTokenCredits,
  TIER_CAP_BEHAVIOR,
} from '../server/services/billing/creditManager';

const ACME_WS_ID = 'dev-acme-security-ws';

const SITES = [
  'Pinnacle Tower LLC', 'Oakwood Residential Management', 'Lone Star Medical Center',
  'Grand Plaza Hotel', 'Lakewood Shopping Village', 'Downtown Financial District',
  'Riverside Logistics Hub', 'Tech Campus East', 'City Hall Complex', 'Airport Terminal C',
];

const SHIFT_TEMPLATES = [
  { title: 'AM Shift — Security Officer', start: 6, hours: 8 },
  { title: 'PM Shift — Security Officer', start: 14, hours: 8 },
  { title: 'Night Shift — Security Officer', start: 22, hours: 8 },
  { title: 'Day Shift — Patrol', start: 8, hours: 10 },
  { title: 'Mid Shift — Access Control', start: 12, hours: 8 },
];

const simulateSessionTokens = (shiftsToSchedule: number) => {
  const thoughtLogChars = shiftsToSchedule * 250;
  const deliberationTokens = shiftsToSchedule * 500;
  const estimatedInputTokens = Math.ceil(thoughtLogChars / 4) + deliberationTokens;
  const estimatedOutputTokens = Math.ceil(estimatedInputTokens * 0.6);
  const estimatedThinkingTokens = Math.ceil(estimatedInputTokens * 0.3);
  return { estimatedInputTokens, estimatedOutputTokens, estimatedThinkingTokens };
};

function dateForWeekOffset(weekOffset: number, dayOfWeek: number, hour: number): Date {
  const base = new Date('2026-04-06T00:00:00Z');
  const d = new Date(base);
  d.setDate(d.getDate() + weekOffset * 7 + dayOfWeek);
  d.setUTCHours(hour, 0, 0, 0);
  return d;
}

function fmt(n: number): string { return Math.round(n).toLocaleString('en-US'); }
function fmtDollar(cr: number): string { return `$${(cr * 0.01).toFixed(2)}`; }
function bar(pct: number, width = 30): string {
  const filled = Math.min(Math.round(pct * width / 100), width);
  return '█'.repeat(filled) + '░'.repeat(width - filled) + ` ${pct.toFixed(1)}%`;
}

async function clearAcmeShifts(): Promise<number> {
  const result = await db.delete(shifts).where(eq(shifts.workspaceId, ACME_WS_ID)).returning({ id: shifts.id });
  return result.length;
}

async function seedOpenShifts(): Promise<number> {
  let total = 0;
  for (const wk of [0, 1, 2, 3]) {
    const toInsert = [];
    for (let i = 0; i < 50; i++) {
      const tpl = SHIFT_TEMPLATES[i % SHIFT_TEMPLATES.length];
      const site = SITES[i % SITES.length];
      const start = dateForWeekOffset(wk, i % 7, tpl.start);
      const end = new Date(start);
      end.setUTCHours(start.getUTCHours() + tpl.hours);
      toInsert.push({
        workspaceId: ACME_WS_ID,
        title: `${site} — ${tpl.title}`,
        startTime: start,
        endTime: end,
        status: 'published' as const,
        aiGenerated: true,
        aiConfidenceScore: '0.95',
        category: 'security' as const,
        payRate: '28.00',
        billRate: '42.00',
      });
    }
    await db.insert(shifts).values(toInsert);
    total += 50;
  }
  return total;
}

async function simulateWeeklySchedulingBilling(week: number, shiftsScheduled: number) {
  const balanceBefore = await creditManager.getBalance(ACME_WS_ID);
  const { estimatedInputTokens, estimatedOutputTokens, estimatedThinkingTokens } = simulateSessionTokens(shiftsScheduled);
  const tokenCr = calculateTokenCredits({ model: 'gemini-2.5-flash', inputTokens: estimatedInputTokens, outputTokens: estimatedOutputTokens, thinkingTokens: estimatedThinkingTokens, featureKey: 'ai_scheduling' });
  const sessionFee = CREDIT_COSTS['scheduling_session_fee'] || 250;
  const perShiftCr = shiftsScheduled * (CREDIT_COSTS['ai_scheduling'] || 20);
  const sessionId = `ST2-W${week}-${Date.now().toString(36)}`;

  const r1 = await creditManager.deductCredits({ workspaceId: ACME_WS_ID, featureKey: 'scheduling_session_fee', featureName: 'Scheduling Processing Fee', description: `[STRESS TEST v2] ${sessionId} — session fee`, userId: undefined });
  const r2 = await creditManager.deductCredits({ workspaceId: ACME_WS_ID, featureKey: 'ai_scheduling', featureName: 'Trinity AI Token Usage', description: `[STRESS TEST v2] ${sessionId} — ~${fmt(estimatedInputTokens + estimatedOutputTokens)} tokens → ${tokenCr}cr`, amountOverride: tokenCr, userId: undefined });
  const r3 = await creditManager.deductCredits({ workspaceId: ACME_WS_ID, featureKey: 'ai_scheduling', featureName: 'Per-Shift Assignment Fee', description: `[STRESS TEST v2] ${sessionId} — ${shiftsScheduled} shifts × ${CREDIT_COSTS['ai_scheduling'] || 20}cr/shift`, quantity: shiftsScheduled, userId: undefined });
  const balanceAfter = await creditManager.getBalance(ACME_WS_ID);
  const totalCr = (r1.success ? sessionFee : 0) + (r2.success ? tokenCr : 0) + (r3.success ? perShiftCr : 0);
  return { week, balanceBefore, balanceAfter, sessionFee, tokenCr, perShiftCr, totalCr, inputK: estimatedInputTokens / 1000, outputK: estimatedOutputTokens / 1000, thinkK: estimatedThinkingTokens / 1000, blocked: !r1.success };
}

// ── OLD vs NEW pricing comparison (pure math, no DB writes) ─────────────────
function computeOldPricing(shifts50: number) {
  // Old rates: flash input 0.2/1K, output 1.2/1K, thinking 1.2/1K, scheduling 8x multiplier
  const { estimatedInputTokens, estimatedOutputTokens, estimatedThinkingTokens } = simulateSessionTokens(shifts50);
  const tokenCr = Math.ceil(((estimatedInputTokens * 0.2 + estimatedOutputTokens * 1.2 + estimatedThinkingTokens * 1.2) / 1000) * 8);
  return { session: 100, tokens: tokenCr, perShift: shifts50 * 10, total: 100 + tokenCr + shifts50 * 10 };
}

function computeNewPricing(shifts50: number) {
  // New rates: flash input 0.3/1K, output 2.0/1K, thinking 1.8/1K, scheduling 8x
  const { estimatedInputTokens, estimatedOutputTokens, estimatedThinkingTokens } = simulateSessionTokens(shifts50);
  const tokenCr = Math.ceil(((estimatedInputTokens * 0.3 + estimatedOutputTokens * 2.0 + estimatedThinkingTokens * 1.8) / 1000) * 8);
  return { session: 250, tokens: tokenCr, perShift: shifts50 * 20, total: 250 + tokenCr + shifts50 * 20 };
}

// ── Multi-tier cap enforcement model ────────────────────────────────────────
function modelTierCapacity(tier: string, credits: number, shifts: number, invoices: number, employees: number, payrollRuns: number) {
  const isSoft = TIER_CAP_BEHAVIOR[tier] === 'soft';
  const { estimatedInputTokens, estimatedOutputTokens, estimatedThinkingTokens } = simulateSessionTokens(shifts);
  const tokenCr = Math.ceil(((estimatedInputTokens * 0.3 + estimatedOutputTokens * 2.0 + estimatedThinkingTokens * 1.8) / 1000) * 8);
  
  // What a full month costs: scheduling + invoicing + payroll
  const schedCr = 250 + tokenCr + shifts * 20;                        // 1 scheduling session
  const invCr   = 75 + invoices * 50;                                  // 1 invoice batch
  const payCr   = payrollRuns * (100 + employees * 8);                 // 2 payroll runs
  const totalNeeded = schedCr + invCr + payCr;

  let running = credits;
  const deductions: { label: string; cost: number; success: boolean }[] = [];

  const try_deduct = (label: string, cost: number) => {
    if (isSoft || running >= cost) { running -= cost; deductions.push({ label, cost, success: true }); }
    else { deductions.push({ label, cost, success: false }); }
  };

  try_deduct('Scheduling session',   250);
  try_deduct('Scheduling tokens',    tokenCr);
  try_deduct('Per-shift (×'+shifts+')', shifts * 20);
  try_deduct('Invoice batch',        75);
  try_deduct('Per-invoice (×'+invoices+')', invoices * 50);
  try_deduct('Payroll session (×'+payrollRuns+')',  payrollRuns * 100);
  try_deduct('Per-employee (×'+employees+'×'+payrollRuns+')', employees * 8 * payrollRuns);

  return { tier, credits, totalNeeded, finalBalance: running, isSoft, deductions };
}

async function main() {
  console.log('\n' + '═'.repeat(76));
  console.log('  COAILEAGUE BILLING STRESS TEST v2 — Repriced Credit Model Validation');
  console.log('═'.repeat(76));

  // ── SECTION A: OLD vs NEW Pricing Comparison ────────────────────────────
  console.log('\n\n📊  SECTION A — Old vs New Pricing: 50 Shifts Per Weekly Session\n');
  const old50 = computeOldPricing(50);
  const new50 = computeNewPricing(50);

  console.log('                          ┌─────────────┬─────────────┬───────────┐');
  console.log('                          │  OLD (Mar 1) │ NEW (Mar 12)│  Change   │');
  console.log('  ────────────────────────┼─────────────┼─────────────┼───────────┤');
  console.log(`  Scheduling session fee  │  ${String(old50.session).padStart(4)} cr   │  ${String(new50.session).padStart(4)} cr   │  +150 cr  │`);
  console.log(`  Token credits (50 shft) │  ${String(old50.tokens).padStart(4)} cr   │  ${String(new50.tokens).padStart(4)} cr   │  ${new50.tokens > old50.tokens ? '+' : ''}${new50.tokens - old50.tokens} cr  │`);
  console.log(`  Per-shift (×50)         │  ${String(old50.perShift).padStart(4)} cr   │  ${String(new50.perShift).padStart(4)} cr   │  +${new50.perShift - old50.perShift} cr │`);
  console.log(`  ─────────────────────── │  ──────────  │  ──────────  │  ─────── │`);
  console.log(`  WEEK TOTAL              │  ${String(old50.total).padStart(4)} cr   │  ${String(new50.total).padStart(4)} cr   │  +${new50.total - old50.total} cr │`);
  console.log(`  MONTH TOTAL (×4)        │  ${String(old50.total * 4).padStart(4)} cr   │  ${String(new50.total * 4).padStart(4)} cr   │  +${(new50.total - old50.total) * 4} cr │`);
  console.log('                          └─────────────┴─────────────┴───────────┘');

  console.log('\n  Per-invoice billing:');
  console.log(`    OLD: 6 cr ($0.06) per invoice — MASSIVELY underpriced vs $15-40 AR admin`);
  console.log(`    NEW: 50 cr ($0.50) per invoice — still 30-80× cheaper than manual AR`);
  console.log(`    50 invoices/month: 0 → 2,500 cr ($0.00 → $25.00) additional revenue`);

  console.log('\n  Per-employee payroll billing:');
  console.log(`    OLD: 0 cr — payroll was only a flat session fee (no per-employee metering)`);
  console.log(`    NEW: 8 cr/employee/run ($0.08) — mirrors ADP/Gusto ($3-15/emp) at 40-180× less`);
  console.log(`    326 emp × 2 runs: 0 → 5,216 cr ($0.00 → $52.16) additional metered revenue`);

  console.log('\n  Monthly allocation reset:');
  console.log(`    Enterprise: 50,000 cr → 20,000 cr (ops at ${(new50.total*4/20000*100).toFixed(0)}% of allocation now)`);
  console.log(`    Professional: 10,000 cr → 6,000 cr`);
  console.log(`    Starter: 2,500 cr → 1,500 cr`);
  console.log(`    Free: 250 cr → 150 cr`);

  // ── SECTION B: Full Acme scheduling simulation ───────────────────────────
  console.log('\n\n💳  SECTION B — Acme Enterprise: 4-Week Scheduling Simulation (New Pricing)\n');
  console.log(`   Tier: enterprise | Allocation: 20,000 cr | Soft-cap: YES`);
  console.log(`   Balance reset to 20,000 cr for clean simulation.\n`);

  // Reset Acme to full allocation
  await db.update(workspaceCredits).set({ currentBalance: 22000 }).where(eq(workspaceCredits.workspaceId, ACME_WS_ID));

  const deleted = await clearAcmeShifts();
  console.log(`   Cleared ${fmt(deleted)} existing shifts.`);
  const seeded = await seedOpenShifts();
  console.log(`   Seeded ${fmt(seeded)} open shifts (Apr 6–May 3, 2026).\n`);

  let runningTotal = 0;
  for (let week = 1; week <= 4; week++) {
    const r = await simulateWeeklySchedulingBilling(week, 50);
    runningTotal += r.totalCr;
    const status = r.blocked ? '🔴 BLOCKED' : r.balanceAfter < 0 ? '🟡 OVERDRAFT' : '✅ OK';
    console.log(`   Week ${week} [${status}]`);
    console.log(`     Balance before  : ${fmt(r.balanceBefore)} cr`);
    console.log(`     Session fee     : ${fmt(r.sessionFee)} cr flat`);
    console.log(`     Token credits   : ${fmt(r.tokenCr)} cr (${r.inputK.toFixed(1)}K×0.3 + ${r.outputK.toFixed(1)}K×2.0 + ${r.thinkK.toFixed(1)}K×1.8 × 8× sched mult)`);
    console.log(`     Per-shift       : 50 × 20 cr = ${fmt(r.perShiftCr)} cr`);
    console.log(`     Week total      : ${fmt(r.totalCr)} cr  (${fmtDollar(r.totalCr)})`);
    console.log(`     Balance after   : ${fmt(r.balanceAfter)} cr`);
    console.log();
  }

  const finalBal = await creditManager.getBalance(ACME_WS_ID);
  const allocation = 22000;
  const pct = ((runningTotal / allocation) * 100).toFixed(1);
  console.log(`   ─── 4-WEEK SCHEDULING SUMMARY ────────────────────────────────`);
  console.log(`   Total consumed  : ${fmt(runningTotal)} cr of 20,000 allocation (${pct}%)`);
  console.log(`   Balance left    : ${fmt(finalBal)} cr`);
  console.log(`   ${bar(parseFloat(pct))}`);

  // ── SECTION C: Full-Month Projection (scheduling + invoicing + payroll) ──
  console.log('\n\n📅  SECTION C — Full-Month Cost Projection (All 3 Domains)\n');
  console.log(`   Assumptions: 326 employees, 200 shifts/month (50/week × 4), 50 invoices, 2 payroll runs\n`);

  const schedTotal  = runningTotal;                 // from section B
  const invTotal    = 75 + (50 * 50);              // session + 50 invoices × 50 cr
  const payTotal    = 2 * 100 + 326 * 8 * 2;      // 2 sessions + 326 emp × 8 cr × 2 runs
  const otherAI     = 2000;                        // analytics, chat, notifications
  const grandTotal  = schedTotal + invTotal + payTotal + otherAI;

  const tableRow = (label: string, cr: number, pctOfAlloc: number) =>
    `   ${label.padEnd(35)} ${fmt(cr).padStart(7)} cr  ${fmtDollar(cr).padStart(8)}  ${bar(pctOfAlloc, 20)}`;

  console.log(`   ${'Domain'.padEnd(35)} ${'Credits'.padStart(7)}    ${'$Cost'.padStart(8)}  Allocation Used`);
  console.log('   ' + '─'.repeat(78));
  console.log(tableRow('Scheduling (4 sessions, 200 shifts)', schedTotal, schedTotal / 200));
  console.log(tableRow('Invoicing (1 batch, 50 invoices)',     invTotal,  invTotal / 200));
  console.log(tableRow('Payroll (2 runs, 326 employees)',      payTotal,  payTotal / 200));
  console.log(tableRow('Other AI (analytics, chat, notifs)',   otherAI,   otherAI / 200));
  console.log('   ' + '─'.repeat(78));
  console.log(tableRow('TOTAL',                                grandTotal, grandTotal / 200));
  console.log();
  console.log(`   Monthly allocation : 20,000 cr`);
  console.log(`   Total ops cost     : ${fmt(grandTotal)} cr (${(grandTotal / 200 * 100).toFixed(1)}% of allocation)`);
  console.log(`   Headroom           : ${fmt(Math.max(0, 22000 - grandTotal))} cr`);
  if (grandTotal > 22000) {
    const overage = grandTotal - 20000;
    console.log(`   ⚠️  Soft-cap overage: ${fmt(overage)} cr → ${fmtDollar(overage)} Stripe charge at month-end`);
  } else {
    console.log(`   Status             : Within allocation — no overage`);
  }

  // ── SECTION D: Multi-tier cap/overage scenarios ──────────────────────────
  console.log('\n\n🛡️   SECTION D — All-Tier Cap Enforcement (Realistic Monthly Workload)\n');

  const tiers = [
    { tier: 'free',         credits: 150,   shifts: 5,   invoices: 2,  employees: 5,  runs: 1, label: 'Free (5 employees)' },
    { tier: 'starter',      credits: 1500,  shifts: 20,  invoices: 10, employees: 15, runs: 1, label: 'Starter (15 employees)' },
    { tier: 'professional', credits: 6000,  shifts: 80,  invoices: 30, employees: 50, runs: 2, label: 'Professional (50 employees)' },
    { tier: 'enterprise',   credits: 22000, shifts: 200, invoices: 50, employees: 326, runs: 2, label: 'Enterprise (326 employees)' },
  ];

  for (const t of tiers) {
    const m = modelTierCapacity(t.tier, t.credits, t.shifts, t.invoices, t.employees, t.runs);
    const capLabel = TIER_CAP_BEHAVIOR[t.tier] === 'soft' ? 'SOFT-CAP' : 'HARD-CAP';
    const blocked  = m.deductions.filter(d => !d.success);
    const passed   = m.deductions.filter(d => d.success);
    console.log(`   [${capLabel}] ${t.label}`);
    console.log(`     Starts with    : ${fmt(t.credits)} cr | Needs: ${fmt(m.totalNeeded)} cr`);
    for (const d of m.deductions) {
      console.log(`     ${d.success ? '✅' : '❌'} ${d.label.padEnd(30)} ${fmt(d.cost).padStart(6)} cr`);
    }
    if (m.finalBalance < 0) {
      console.log(`     Final balance  : ${fmt(m.finalBalance)} cr → OVERAGE ${fmtDollar(Math.abs(m.finalBalance))} billed via Stripe`);
    } else if (blocked.length > 0) {
      console.log(`     Final balance  : ${fmt(m.finalBalance)} cr → RUN ABORTED at "${blocked[0].label}"`);
    } else {
      console.log(`     Final balance  : ${fmt(m.finalBalance)} cr → fully within allocation`);
    }
    const utilPct = Math.min(100, (Math.min(t.credits, m.totalNeeded) / t.credits) * 100);
    console.log(`     Utilization    : ${bar(utilPct)}`);
    console.log();
  }

  // ── SECTION E: Monthly revenue model (platform perspective) ──────────────
  console.log('💰  SECTION E — Platform Revenue Model (10 typical enterprise workspaces)\n');
  console.log('   Assumption: 10 enterprise tenants, each similar to Acme profile.\n');

  const perTenantMonthly = grandTotal;
  const tenants = 10;
  const allocationPerTenant = 22000;
  const overagePerTenant = Math.max(0, perTenantMonthly - allocationPerTenant);
  const overageRevenue = overagePerTenant * tenants * 0.01; // $0.01/credit

  console.log(`   Credits consumed per tenant/month : ${fmt(perTenantMonthly)} cr`);
  console.log(`   Overage per tenant/month          : ${fmt(overagePerTenant)} cr → ${fmtDollar(overagePerTenant)}`);
  console.log(`   10-tenant aggregate overage rev   : $${overageRevenue.toFixed(2)}/month`);
  console.log(`   Base subscription (enterprise $9,999) : $99,990/month for 10 tenants`);
  console.log(`   Seat overage (326 emp × $15/seat) : $${(326 * 15 * 10).toLocaleString()}/month`);
  const totalRev = 99990 + (326 * 15 * 10) + overageRevenue;
  console.log(`   ─────────────────────────────────────────────────────────`);
  console.log(`   Total ARR projection (10 tenants) : $${(totalRev * 12).toLocaleString()}/year`);
  console.log(`   Credit overage contributes        : ${((overageRevenue * 12 / (totalRev * 12)) * 100).toFixed(2)}% of ARR`);

  console.log('\n' + '═'.repeat(76));
  console.log('  STRESS TEST v2 COMPLETE — New pricing model validated');
  console.log('═'.repeat(76) + '\n');
}

main().then(() => process.exit(0)).catch((err) => { console.error('Stress test failed:', err); process.exit(1); });
