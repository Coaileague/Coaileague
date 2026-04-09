/**
 * Business Insights Service
 * ==========================
 * Premium "Business Health Scan" feature for org owners.
 *
 * When an owner asks "my business isn't doing well" or "what's going on" or
 * "give me guidance", Trinity triggers this service which:
 *
 * 1. Scans ALL available org data (invoices, clients, employees, schedules, payroll, QB)
 * 2. Identifies profit problems, coverage gaps, overtime drain, unpaid invoices
 * 3. Generates ranked, specific, actionable recommendations with exact numbers
 * 4. Offers to execute recommended changes for the user (at a credit cost each)
 *
 * This is a PREMIUM ELITE feature: business_health_scan
 * Cost: 25 credits per scan
 * 
 * Data limits are configurable via platformConfig.ts AI_BRAIN section.
 */

import { db } from '../../db';
import {
  employees,
  clients,
  shifts,
  invoices,
  payrollRuns,
  workspaceMembers,
  workspaces,
} from '@shared/schema';
import { eq, desc, sql, and, gte, lte, isNull } from 'drizzle-orm';
import { AI_BRAIN } from '../../config/platformConfig';
import { workspaceContextService } from '../ai-brain/workspaceContextService';
import { createLogger } from '../../lib/logger';
const log = createLogger('businessInsightsService');


export interface BusinessInsightAction {
  actionId: string;
  title: string;
  description: string;
  impact: 'high' | 'medium' | 'low';
  creditCost: number;
  canExecute: boolean;
  executionCommand?: string;
}

export interface BusinessHealthScan {
  orgName: string;
  scanDate: Date;
  overallScore: number;              // 0-100 health score
  overallStatus: 'healthy' | 'caution' | 'at_risk' | 'critical';
  summary: string;                   // 2-3 sentence human summary
  topIssues: string[];               // Bullet-point problems found
  recommendations: BusinessInsightRecommendation[];
  availableActions: BusinessInsightAction[];
  keyMetrics: {
    monthlyRevenue: number;
    monthlyExpenses: number;
    profitMargin: number;
    unpaidInvoiceAmount: number;
    overtimeHours: number;
    openShifts: number;
    activeEmployees: number;
    activeClients: number;
  };
  aiNarrative: string;               // Full Trinity narrative analysis
}

export interface BusinessInsightRecommendation {
  rank: number;
  category: 'revenue' | 'cost' | 'staffing' | 'clients' | 'scheduling' | 'compliance' | 'retention';
  title: string;
  problem: string;
  solution: string;
  estimatedImpact: string;
  priority: 'critical' | 'high' | 'medium' | 'low';
  dataPoints: string[];
}

interface OrgRawData {
  workspace: any;
  context: any;
  employeeList: any[];
  clientList: any[];
  invoiceList: any[];
  openShiftsCount: number;
  recentPayroll: any[];
  overtimeHours: number;
  unpaidTotal: number;
  totalRevenue: number;
}

/**
 * Run a full business health scan for an organization.
 * Returns structured recommendations + narrative.
 */
export async function runBusinessHealthScan(
  workspaceId: string,
  userId: string
): Promise<BusinessHealthScan> {
  const raw = await fetchOrgData(workspaceId);
  const aiNarrative = await generateAINarrative(raw, workspaceId, userId);
  return buildScan(raw, aiNarrative);
}

/**
 * Fetch all org data needed for the scan.
 */
async function fetchOrgData(workspaceId: string): Promise<OrgRawData> {
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

  const [
    context,
    employeeList,
    clientList,
    invoiceList,
    recentPayroll,
    openShiftsResult,
  ] = await Promise.all([
    workspaceContextService.getFullContext(workspaceId).catch(() => null),
    db.select({
      id: employees.id,
      firstName: employees.firstName,
      lastName: employees.lastName,
      hourlyRate: employees.hourlyRate,
      workspaceRole: employees.workspaceRole,
      isActive: employees.isActive,
    }).from(employees).where(eq(employees.workspaceId, workspaceId)).limit(AI_BRAIN.businessInsightsEmployeeLimit),

    db.select({
      id: clients.id,
      companyName: clients.companyName,
      firstName: clients.firstName,
      lastName: clients.lastName,
      billingRate: clients.contractRate,
      isActive: clients.isActive,
      address: clients.address,
    }).from(clients).where(eq(clients.workspaceId, workspaceId)).limit(AI_BRAIN.businessInsightsClientLimit),

    db.select({
      id: invoices.id,
      amount: invoices.total,
      status: invoices.status,
      dueDate: invoices.dueDate,
      createdAt: invoices.createdAt,
      clientId: invoices.clientId,
    }).from(invoices)
      .where(eq(invoices.workspaceId, workspaceId))
      .orderBy(desc(invoices.createdAt))
      .limit(AI_BRAIN.businessInsightsInvoiceLimit),

    db.select({
      id: payrollRuns.id,
      totalGross: payrollRuns.totalGrossPay,
      totalNet: payrollRuns.totalNetPay,
      status: payrollRuns.status,
      createdAt: payrollRuns.createdAt,
    }).from(payrollRuns)
      .where(eq(payrollRuns.workspaceId, workspaceId))
      .orderBy(desc(payrollRuns.createdAt))
      .limit(6),

    db.select({ count: sql<number>`count(*)` })
      .from(shifts)
      .where(
        and(
          eq(shifts.workspaceId, workspaceId),
          sql`(assigned_employee_id IS NULL OR status = 'open')`
        )
      ),
  ]);

  // Calculate financial metrics from invoices
  const paidInvoices = invoiceList.filter(i => i.status === 'paid');
  const unpaidInvoices = invoiceList.filter(i => ['sent', 'overdue', 'pending'].includes(i.status || ''));

  const totalRevenue = paidInvoices.reduce((sum, inv) => sum + parseFloat(inv.amount || '0'), 0);
  const unpaidTotal = unpaidInvoices.reduce((sum, inv) => sum + parseFloat(inv.amount || '0'), 0);

  const overtimeHours = (context as any)?.overtimeHoursThisMonth || 0;
  const openShiftsCount = Number(openShiftsResult[0]?.count || 0);

  return {
    workspace: context,
    context,
    employeeList,
    clientList,
    invoiceList,
    openShiftsCount,
    recentPayroll,
    overtimeHours,
    unpaidTotal,
    totalRevenue,
  };
}

/**
 * Generate AI narrative analysis using Trinity/Gemini.
 */
async function generateAINarrative(
  raw: OrgRawData,
  workspaceId: string,
  userId: string
): Promise<string> {
  try {
    const { meteredGemini } = await import('../billing/meteredGeminiClient');
    const ctx = raw.context || {};

    const dataSnapshot = `
ORGANIZATION DATA SNAPSHOT:
- Employees: ${raw.employeeList.length} total (${raw.employeeList.filter(e => e.isActive).length} active)
- Clients: ${raw.clientList.length} total (${raw.clientList.filter(c => c.isActive).length} active)
- Monthly Revenue Collected: $${raw.totalRevenue.toLocaleString()}
- Outstanding/Unpaid Invoices: $${raw.unpaidTotal.toLocaleString()}
- Open/Unfilled Shifts: ${raw.openShiftsCount}
- Overtime Hours This Month: ${raw.overtimeHours.toFixed(1)} hrs
- Recent Payroll Runs: ${raw.recentPayroll.length}
- Monthly Revenue (from context): $${(ctx.monthlyRevenue || 0).toLocaleString()}
- Outstanding (from context): $${(ctx.outstandingAmount || 0).toLocaleString()}
- Total Hours This Month: ${(ctx.totalHoursThisMonth || 0).toFixed(1)} hrs
${ctx.quickbooksConnected ? '- QuickBooks: Connected' : '- QuickBooks: Not connected'}
${ctx.overdueInvoiceCount > 0 ? `- OVERDUE INVOICES: ${ctx.overdueInvoiceCount}` : ''}

Employee Pay Rates: ${raw.employeeList.slice(0, 5).map(e => `${e.firstName}: $${e.hourlyRate}/hr`).join(', ')}
Client Billing Rates: ${raw.clientList.slice(0, 5).map(c => `${c.companyName || [c.firstName, c.lastName].filter(Boolean).join(' ') || 'Unknown'}: $${c.billingRate}/hr`).join(', ')}
`.trim();

    const prompt = `You are Trinity, a deeply empathetic and expert business advisor for a security guard / staffing company. An owner has asked you to analyze their business because they're struggling or need guidance.

${dataSnapshot}

Write a warm, human, empathetic business health analysis. Structure it as:

1. OPENING (1-2 sentences): Acknowledge what they're going through. Make them feel heard.

2. WHAT I SEE: Honest assessment of the 3-5 most critical issues you can identify from the data. Be specific with numbers. Don't sugarcoat, but be supportive.

3. WHAT TO FIX FIRST: Ranked list of the top 3 priorities, each with:
   - What the problem is (specific)
   - What to do about it (actionable steps)
   - Expected impact if they follow through

4. QUICK WINS: 2-3 things they can do THIS WEEK for immediate improvement

5. CLOSING: Encouraging, realistic, human. "Here's the thing — you reached out for help, and that's exactly the right move."

Write in a warm, direct, human voice. Use real numbers from the data. Avoid generic advice. Make them feel like they have an ally who truly understands their business.`;

    const result = await meteredGemini.generate({
      workspaceId,
      userId,
      featureKey: 'business_health_scan',
      prompt,
      // @ts-expect-error — TS migration: fix in refactoring sprint
      model: 'gemini-3-pro-preview',
      temperature: 0.7,
      maxOutputTokens: 2048,
    });

    if (result.success && result.text) {
      return result.text;
    }
  } catch (err: any) {
    log.warn('[BusinessInsights] AI narrative generation failed:', (err instanceof Error ? err.message : String(err)));
  }

  // Fallback: structured narrative without AI
  return buildFallbackNarrative(raw);
}

function buildFallbackNarrative(raw: OrgRawData): string {
  const issues: string[] = [];

  if (raw.unpaidTotal > 5000) {
    issues.push(`You have $${raw.unpaidTotal.toLocaleString()} in unpaid invoices — collecting on those is your fastest path to immediate cash flow improvement.`);
  }
  if (raw.openShiftsCount > 5) {
    issues.push(`You have ${raw.openShiftsCount} open/unfilled shifts — every unfilled shift is lost revenue.`);
  }
  if (raw.overtimeHours > raw.context?.totalHoursThisMonth * 0.2) {
    issues.push(`Overtime is running at ${((raw.overtimeHours / (raw.context?.totalHoursThisMonth || 1)) * 100).toFixed(0)}% of total hours — that's significantly higher than the 15% industry benchmark.`);
  }
  if (raw.clientList.length < 3) {
    issues.push(`With only ${raw.clientList.length} active clients, your revenue is concentrated and vulnerable — diversifying your client base is important.`);
  }

  return issues.length > 0
    ? `Here's what I see looking at your business right now:\n\n${issues.map((issue, i) => `${i + 1}. ${issue}`).join('\n\n')}\n\nLet's work through these together — each one is addressable.`
    : `Looking at your numbers, your business is in a workable position. Let's dig into the details and find the specific levers to improve things.`;
}

/**
 * Build the structured BusinessHealthScan from raw data + AI narrative.
 */
function buildScan(raw: OrgRawData, aiNarrative: string): BusinessHealthScan {
  const ctx = raw.context || {};
  const monthlyRevenue = ctx.monthlyRevenue || raw.totalRevenue;
  const overtimePct = ctx.totalHoursThisMonth > 0
    ? (raw.overtimeHours / ctx.totalHoursThisMonth) * 100
    : 0;

  // Calculate rough expenses from payroll
  const totalPayrollGross = raw.recentPayroll
    .reduce((sum, p) => sum + parseFloat(p.totalGross || '0'), 0);
  const monthlyExpenses = totalPayrollGross / Math.max(raw.recentPayroll.length, 1);
  const profitMargin = monthlyRevenue > 0
    ? ((monthlyRevenue - monthlyExpenses) / monthlyRevenue) * 100
    : 0;

  // Health scoring
  let score = 100;
  const issues: string[] = [];

  // Unpaid invoices
  if (raw.unpaidTotal > 10000) { score -= 20; issues.push(`$${raw.unpaidTotal.toLocaleString()} in outstanding invoices`); }
  else if (raw.unpaidTotal > 5000) { score -= 10; issues.push(`$${raw.unpaidTotal.toLocaleString()} in outstanding invoices`); }

  // Overtime
  if (overtimePct > 25) { score -= 20; issues.push(`${overtimePct.toFixed(0)}% overtime rate (industry benchmark: 15%)`); }
  else if (overtimePct > 15) { score -= 10; issues.push(`${overtimePct.toFixed(0)}% overtime rate slightly elevated`); }

  // Open shifts
  if (raw.openShiftsCount > 10) { score -= 15; issues.push(`${raw.openShiftsCount} open/unfilled shifts`); }
  else if (raw.openShiftsCount > 5) { score -= 8; issues.push(`${raw.openShiftsCount} open shifts`); }

  // Client concentration
  if (raw.clientList.length < 3) { score -= 15; issues.push('Low client diversification (revenue concentration risk)'); }

  // Low margin
  if (profitMargin < 15) { score -= 20; issues.push(`Low profit margin: ${profitMargin.toFixed(1)}%`); }
  else if (profitMargin < 25) { score -= 8; issues.push(`Profit margin at ${profitMargin.toFixed(1)}% — room to improve`); }

  score = Math.max(0, Math.min(100, score));

  const overallStatus: BusinessHealthScan['overallStatus'] =
    score >= 75 ? 'healthy' :
    score >= 55 ? 'caution' :
    score >= 35 ? 'at_risk' : 'critical';

  const summary = overallStatus === 'healthy'
    ? `Your business is in solid shape with a ${score}/100 health score. A few optimizations could push profitability higher.`
    : overallStatus === 'caution'
    ? `Your business score is ${score}/100 — there are real opportunities to improve profitability. Let's prioritize the top issues.`
    : overallStatus === 'at_risk'
    ? `Your business is at risk with a ${score}/100 score. Immediate action on the key issues below will have the most impact.`
    : `Your business needs urgent attention — score ${score}/100. The recommendations below are ranked by immediate impact.`;

  // Build ranked recommendations
  const recommendations: BusinessInsightRecommendation[] = [];
  let rank = 1;

  if (raw.unpaidTotal > 2000) {
    recommendations.push({
      rank: rank++,
      category: 'revenue',
      title: 'Collect Outstanding Invoices',
      problem: `$${raw.unpaidTotal.toLocaleString()} in invoices is unpaid — this money is owed to you.`,
      solution: 'Send payment reminders for all invoices over 14 days. Set up automatic follow-up sequences. Consider offering a 2% early payment discount for invoices over $2,000.',
      estimatedImpact: `Could recover $${Math.round(raw.unpaidTotal * 0.7).toLocaleString()} within 30 days`,
      priority: raw.unpaidTotal > 10000 ? 'critical' : 'high',
      dataPoints: [
        `Outstanding: $${raw.unpaidTotal.toLocaleString()}`,
        `${ctx.overdueInvoiceCount || 0} overdue invoices`,
      ],
    });
  }

  if (overtimePct > 15) {
    const otCost = raw.overtimeHours * 1.5 * 20; // rough OT cost
    recommendations.push({
      rank: rank++,
      category: 'cost',
      title: 'Reduce Overtime Costs',
      problem: `At ${overtimePct.toFixed(0)}% overtime rate, you're paying 50% premium on ${raw.overtimeHours.toFixed(0)} hours. That's roughly $${otCost.toLocaleString()} in avoidable premium pay.`,
      solution: 'Hire 1-2 part-time employees at straight time to absorb OT hours. Redistribute shifts before they trigger OT. Set OT alerts to notify managers at 35 hours worked.',
      estimatedImpact: `Reducing OT to 10% could save ~$${Math.round(otCost * 0.5).toLocaleString()}/month`,
      priority: 'high',
      dataPoints: [
        `OT hours this month: ${raw.overtimeHours.toFixed(0)}`,
        `${overtimePct.toFixed(0)}% of total hours`,
      ],
    });
  }

  if (raw.openShiftsCount > 3) {
    recommendations.push({
      rank: rank++,
      category: 'scheduling',
      title: 'Fill Open Shifts',
      problem: `${raw.openShiftsCount} shifts are unfilled. Each unfilled shift is lost revenue and potential client dissatisfaction.`,
      solution: 'Enable the shift marketplace so employees can self-assign open shifts. Set up auto-notifications to qualified employees when shifts open. Consider a small incentive for self-assigned fills.',
      estimatedImpact: `Filling ${raw.openShiftsCount} shifts at avg $22/hr × 8hrs = ~$${(raw.openShiftsCount * 22 * 8).toLocaleString()} potential revenue`,
      priority: raw.openShiftsCount > 8 ? 'critical' : 'medium',
      dataPoints: [`${raw.openShiftsCount} open shifts`, 'Shift marketplace available'],
    });
  }

  if (raw.clientList.length < 5 && raw.clientList.length > 0) {
    recommendations.push({
      rank: rank++,
      category: 'clients',
      title: 'Diversify Your Client Base',
      problem: `With ${raw.clientList.length} active client(s), your revenue is concentrated. Losing one client could be devastating.`,
      solution: 'Target 2-3 new client prospects in your area. Consider offering a 30-day trial rate to a new client. Your existing clients can be references — ask for referrals.',
      estimatedImpact: 'Each new client at avg billing rate adds stable recurring revenue',
      priority: 'medium',
      dataPoints: [`${raw.clientList.length} active clients`, 'Industry target: 5+ clients for stability'],
    });
  }

  if (profitMargin > 0 && profitMargin < 20) {
    // Find lowest billing rate client vs employee pay rates
    const avgPayRate = raw.employeeList.length > 0
      ? raw.employeeList.reduce((sum, e) => sum + parseFloat(e.hourlyRate || '0'), 0) / raw.employeeList.length
      : 0;
    const avgBillingRate = raw.clientList.length > 0
      ? raw.clientList.reduce((sum, c) => sum + parseFloat(c.billingRate || '0'), 0) / raw.clientList.length
      : 0;
    const spread = avgBillingRate - avgPayRate;

    recommendations.push({
      rank: rank++,
      category: 'revenue',
      title: 'Review Billing Rates',
      problem: `Your average spread (billing rate vs pay rate) is $${spread.toFixed(2)}/hr. With overhead costs, this may be leaving you with thin margins.`,
      solution: `Consider raising billing rates by $1-2/hr for clients whose contracts are up for renewal. Average billing: $${avgBillingRate.toFixed(2)}/hr. Average pay: $${avgPayRate.toFixed(2)}/hr.`,
      estimatedImpact: `A $1/hr billing increase across ${ctx.totalHoursThisMonth?.toFixed(0) || 0} monthly hours = $${((ctx.totalHoursThisMonth || 0) * 1).toLocaleString()} additional revenue`,
      priority: 'medium',
      dataPoints: [
        `Avg billing rate: $${avgBillingRate.toFixed(2)}/hr`,
        `Avg pay rate: $${avgPayRate.toFixed(2)}/hr`,
        `Spread: $${spread.toFixed(2)}/hr`,
      ],
    });
  }

  // Available execution actions
  // @ts-expect-error — TS migration: fix in refactoring sprint
  const availableActions: BusinessInsightAction[] = [
    {
      actionId: 'send_invoice_reminders',
      title: 'Send Invoice Payment Reminders',
      description: `Auto-send payment reminders for all ${raw.unpaidTotal > 0 ? 'outstanding' : ''} unpaid invoices`,
      impact: 'high',
      creditCost: 5,
      canExecute: raw.unpaidTotal > 0,
    },
    {
      actionId: 'fill_open_shifts',
      title: 'Notify Employees of Open Shifts',
      description: `Broadcast ${raw.openShiftsCount} open shifts to all qualified employees`,
      impact: 'high',
      creditCost: 3,
      canExecute: raw.openShiftsCount > 0,
    },
    {
      actionId: 'optimize_schedule',
      title: 'AI Schedule Optimization',
      description: 'Have Trinity re-optimize next week\'s schedule to minimize overtime and maximize coverage',
      impact: 'high',
      creditCost: 15,
      canExecute: true,
    },
    {
      actionId: 'generate_client_report',
      title: 'Generate Client Profitability Report',
      description: 'Generate a detailed report showing which clients are most/least profitable',
      impact: 'medium',
      creditCost: 8,
      canExecute: raw.clientList.length > 0,
    },
  ].filter(a => a.canExecute);

  return {
    orgName: ctx.organizationName || 'Your Organization',
    scanDate: new Date(),
    overallScore: score,
    overallStatus,
    summary,
    topIssues: issues,
    recommendations,
    availableActions,
    keyMetrics: {
      monthlyRevenue,
      monthlyExpenses,
      profitMargin: Math.max(0, profitMargin),
      unpaidInvoiceAmount: raw.unpaidTotal,
      overtimeHours: raw.overtimeHours,
      openShifts: raw.openShiftsCount,
      activeEmployees: raw.employeeList.filter(e => e.isActive).length,
      activeClients: raw.clientList.filter(c => c.isActive).length,
    },
    aiNarrative,
  };
}

/**
 * Format a BusinessHealthScan as a chat response for Trinity.
 */
export function formatScanAsChat(scan: BusinessHealthScan): string {
  const statusEmoji = {
    healthy: '✅',
    caution: '⚠️',
    at_risk: '🔴',
    critical: '🚨',
  }[scan.overallStatus];

  const lines: string[] = [
    `${statusEmoji} **Business Health Score: ${scan.overallScore}/100** — *${scan.overallStatus.replace('_', ' ').toUpperCase()}*`,
    '',
    scan.aiNarrative,
    '',
  ];

  if (scan.topIssues.length > 0) {
    lines.push('---');
    lines.push('**Key Issues Found:**');
    scan.topIssues.forEach(issue => lines.push(`• ${issue}`));
    lines.push('');
  }

  if (scan.recommendations.length > 0) {
    lines.push('---');
    lines.push('**My Top Recommendations:**');
    scan.recommendations.slice(0, 3).forEach(rec => {
      const priorityLabel = rec.priority === 'critical' ? '🚨' : rec.priority === 'high' ? '⚡' : '💡';
      lines.push(`\n${priorityLabel} **${rec.rank}. ${rec.title}**`);
      lines.push(`${rec.solution}`);
      lines.push(`*Expected impact: ${rec.estimatedImpact}*`);
    });
    lines.push('');
  }

  if (scan.availableActions.length > 0) {
    lines.push('---');
    lines.push('**I Can Do These For You Right Now:**');
    scan.availableActions.forEach(action => {
      lines.push(`• **${action.title}** — ${action.creditCost} credits`);
    });
    lines.push('');
    lines.push('*Reply with an action number or "do it" to execute any of these.*');
  }

  return lines.join('\n');
}

export const businessInsightsService = {
  runBusinessHealthScan,
  formatScanAsChat,
};
