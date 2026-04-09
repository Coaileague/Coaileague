import { db } from '../../db';
import { sanitizeError } from '../../middleware/errorHandler';
import {
  invoices, invoiceLineItems, clients, subClients, employees,
  shifts, timeEntries, payrollRuns, payrollEntries, sites,
} from '@shared/schema';
import { eq, and, gte, lte, desc, asc, sql, isNotNull, count, sum, between, like, or, ilike } from 'drizzle-orm';
import { meteredGemini } from '../billing/meteredGeminiClient';
import { sharedKnowledgeGraph, type KnowledgeDomain } from './sharedKnowledgeGraph';
import { reinforcementLearningLoop } from './reinforcementLearningLoop';
import { helpaiOrchestrator, type ActionRequest, type ActionResult } from '../helpai/platformActionHub';
import { createLogger } from '../../lib/logger';
const log = createLogger('trinityBusinessIntelligence');

interface InvoicePattern {
  clientId: string;
  clientName: string;
  isAgency: boolean;
  avgLineItemsPerInvoice: number;
  avgRate: number;
  typicalDescriptionFormat: string;
  commonSites: string[];
  commonEmployees: string[];
  billingFrequency: string;
  externalNumberFormat: string | null;
  agencyEndClient: string | null;
  totalInvoices: number;
  totalRevenue: number;
}

interface PayrollPattern {
  avgGrossPay: number;
  avgEmployeesPerRun: number;
  typicalPeriodDays: number;
  overtimeRatio: number;
  topEarners: { name: string; avgPay: number }[];
  costByClient: { clientName: string; laborCost: number; revenue: number; margin: number }[];
  anomalies: string[];
}

interface SchedulePattern {
  peakDays: string[];
  avgShiftsPerDay: number;
  avgShiftDurationHours: number;
  employeeUtilization: { name: string; hoursPerWeek: number; utilization: number }[];
  siteStaffingPatterns: { siteName: string; typicalStaff: number; shiftTypes: string[] }[];
  gapRisks: string[];
}

interface MetacognitionResult {
  confidence: number;
  reasoning: string;
  knowledgeGaps: string[];
  suggestedActions: string[];
  learningApplied: string[];
}

class TrinityBusinessIntelligence {
  private patternCache = new Map<string, { data: any; expiry: number }>();
  private activeAnalysis = new Map<string, Promise<any>>();
  private CACHE_TTL = 5 * 60 * 1000;

  private getCached<T>(key: string): T | null {
    const entry = this.patternCache.get(key);
    if (entry && entry.expiry > Date.now()) return entry.data as T;
    this.patternCache.delete(key);
    return null;
  }

  private setCache(key: string, data: any): void {
    this.patternCache.set(key, { data, expiry: Date.now() + this.CACHE_TTL });
  }

  private async deduplicatedAnalysis<T>(key: string, fn: () => Promise<T>): Promise<T> {
    const existing = this.activeAnalysis.get(key);
    if (existing) return existing as Promise<T>;

    const promise = fn().finally(() => this.activeAnalysis.delete(key));
    this.activeAnalysis.set(key, promise);
    return promise;
  }

  async searchInvoices(workspaceId: string, query: {
    clientName?: string;
    externalNumber?: string;
    invoiceNumber?: string;
    dateFrom?: string;
    dateTo?: string;
    status?: string;
    minAmount?: number;
    maxAmount?: number;
    employeeName?: string;
    siteName?: string;
    agencyName?: string;
    limit?: number;
  }): Promise<{ invoices: any[]; total: number; metacognition: MetacognitionResult }> {
    const startTime = Date.now();
    const limit = Math.min(query.limit || 25, 100);
    const knowledgeGaps: string[] = [];
    const learningApplied: string[] = [];

    let baseQuery = db
      .select({
        invoice: invoices,
        clientFirstName: clients.firstName,
        clientLastName: clients.lastName,
        clientCompany: clients.companyName,
        isAgency: clients.isAgency,
        agencyEndClientName: clients.agencyEndClientName,
      })
      .from(invoices)
      .innerJoin(clients, eq(invoices.clientId, clients.id))
      .where(eq(invoices.workspaceId, workspaceId))
      .$dynamic();

    const conditions: any[] = [eq(invoices.workspaceId, workspaceId)];

    if (query.clientName) {
      conditions.push(
        or(
          ilike(clients.companyName, `%${query.clientName}%`),
          ilike(clients.firstName, `%${query.clientName}%`),
          ilike(clients.lastName, `%${query.clientName}%`),
          ilike(clients.agencyEndClientName, `%${query.clientName}%`)
        )
      );
      learningApplied.push(`Searching across company name, contact name, and agency end-client for "${query.clientName}"`);
    }

    if (query.externalNumber) {
      conditions.push(ilike(invoices.externalInvoiceNumber, `%${query.externalNumber}%`));
      learningApplied.push(`Searching by agency/external invoice number: ${query.externalNumber}`);
    }

    if (query.invoiceNumber) {
      conditions.push(ilike(invoices.invoiceNumber, `%${query.invoiceNumber}%`));
    }

    if (query.dateFrom) {
      conditions.push(gte(invoices.issueDate, new Date(query.dateFrom)));
    }

    if (query.dateTo) {
      conditions.push(lte(invoices.issueDate, new Date(query.dateTo)));
    }

    if (query.status) {
      conditions.push(eq(invoices.status, query.status as any));
    }

    if (query.minAmount) {
      conditions.push(gte(invoices.total, String(query.minAmount)));
    }

    if (query.maxAmount) {
      conditions.push(lte(invoices.total, String(query.maxAmount)));
    }

    const results = await db
      .select({
        invoice: invoices,
        clientFirstName: clients.firstName,
        clientLastName: clients.lastName,
        clientCompany: clients.companyName,
        isAgency: clients.isAgency,
        agencyEndClientName: clients.agencyEndClientName,
      })
      .from(invoices)
      .innerJoin(clients, eq(invoices.clientId, clients.id))
      .where(and(...conditions))
      .orderBy(desc(invoices.issueDate))
      .limit(limit);

    const enrichedInvoices = await Promise.all(results.map(async (r) => {
      const lineItems = await db.select().from(invoiceLineItems)
        .where(eq(invoiceLineItems.invoiceId, r.invoice.id))
        .orderBy(asc(invoiceLineItems.lineNumber));

      return {
        ...r.invoice,
        client: {
          name: r.clientCompany || `${r.clientFirstName} ${r.clientLastName}`,
          isAgency: r.isAgency,
          agencyEndClient: r.agencyEndClientName,
        },
        lineItems: lineItems.map(li => ({
          description: li.description,
          quantity: li.quantity,
          rate: li.unitPrice,
          amount: li.amount,
          serviceDate: li.serviceDate,
          employeeId: li.employeeId,
          descriptionData: li.descriptionData,
        })),
      };
    }));

    if (query.employeeName) {
      const filtered = enrichedInvoices.filter(inv =>
        inv.lineItems.some((li: any) =>
          li.description?.toLowerCase().includes(query.employeeName!.toLowerCase()) ||
          (li.descriptionData?.officers || []).some((o: string) =>
            o.toLowerCase().includes(query.employeeName!.toLowerCase())
          )
        )
      );
      if (filtered.length < enrichedInvoices.length) {
        learningApplied.push(`Filtered ${enrichedInvoices.length} invoices to ${filtered.length} containing employee "${query.employeeName}" in line item descriptions`);
      }
      return {
        invoices: filtered,
        total: filtered.length,
        metacognition: this.buildMetacognition(startTime, knowledgeGaps, learningApplied, filtered.length > 0 ? 0.9 : 0.4),
      };
    }

    if (query.agencyName) {
      knowledgeGaps.push('Agency search covers agencyEndClientName field — if the agency relationship is stored differently, results may be incomplete');
    }

    return {
      invoices: enrichedInvoices,
      total: enrichedInvoices.length,
      metacognition: this.buildMetacognition(startTime, knowledgeGaps, learningApplied, enrichedInvoices.length > 0 ? 0.92 : 0.5),
    };
  }

  async learnInvoicePatterns(workspaceId: string): Promise<{
    patterns: InvoicePattern[];
    insights: string[];
    metacognition: MetacognitionResult;
  }> {
    const cacheKey = `invoice-patterns-${workspaceId}`;
    const cached = this.getCached<{ patterns: InvoicePattern[]; insights: string[]; metacognition: MetacognitionResult }>(cacheKey);
    if (cached) return cached;

    return this.deduplicatedAnalysis(cacheKey, async () => {
      const result = await this._learnInvoicePatternsInner(workspaceId);
      this.setCache(cacheKey, result);
      return result;
    });
  }

  private async _learnInvoicePatternsInner(workspaceId: string): Promise<{
    patterns: InvoicePattern[];
    insights: string[];
    metacognition: MetacognitionResult;
  }> {
    const startTime = Date.now();
    const knowledgeGaps: string[] = [];
    const learningApplied: string[] = [];

    const clientInvoices = await db
      .select({
        clientId: invoices.clientId,
        clientCompany: clients.companyName,
        clientFirstName: clients.firstName,
        clientLastName: clients.lastName,
        isAgency: clients.isAgency,
        agencyEndClientName: clients.agencyEndClientName,
        invoiceCount: count(invoices.id),
        totalRevenue: sum(invoices.total),
        avgTotal: sql<number>`AVG(CAST(${invoices.total} AS DECIMAL))`,
        hasExternal: sql<number>`COUNT(${invoices.externalInvoiceNumber})`,
      })
      .from(invoices)
      .innerJoin(clients, eq(invoices.clientId, clients.id))
      .where(eq(invoices.workspaceId, workspaceId))
      .groupBy(invoices.clientId, clients.companyName, clients.firstName, clients.lastName, clients.isAgency, clients.agencyEndClientName);

    const patterns: InvoicePattern[] = [];

    for (const ci of clientInvoices) {
      const recentInvoices = await db.select().from(invoices)
        .where(and(eq(invoices.workspaceId, workspaceId), eq(invoices.clientId, ci.clientId)))
        .orderBy(desc(invoices.issueDate))
        .limit(5);

      let sampleDescriptions: string[] = [];
      let allSites = new Set<string>();
      let allEmployees = new Set<string>();
      let totalRate = 0;
      let rateCount = 0;
      let totalLines = 0;

      for (const inv of recentInvoices) {
        const lineItems = await db.select().from(invoiceLineItems)
          .where(eq(invoiceLineItems.invoiceId, inv.id));
        totalLines += lineItems.length;

        for (const li of lineItems) {
          if (li.description) sampleDescriptions.push(li.description);
          if (li.unitPrice) { totalRate += Number(li.unitPrice); rateCount++; }
          if (li.descriptionData) {
            const dd = li.descriptionData as any;
            if (dd.location) allSites.add(dd.location);
            if (dd.sub_client_name) allSites.add(dd.sub_client_name);
            if (dd.officers) dd.officers.forEach((o: string) => allEmployees.add(o));
          }
          if (li.employeeId) allEmployees.add(li.employeeId);
        }
      }

      let billingFrequency = 'unknown';
      if (recentInvoices.length >= 2) {
        const dates = recentInvoices.map(i => new Date(i.issueDate!).getTime()).sort();
        const avgGapDays = dates.length > 1
          ? (dates[dates.length - 1] - dates[0]) / ((dates.length - 1) * 86400000)
          : 0;
        if (avgGapDays <= 8) billingFrequency = 'weekly';
        else if (avgGapDays <= 16) billingFrequency = 'bi-weekly';
        else if (avgGapDays <= 35) billingFrequency = 'monthly';
        else billingFrequency = 'irregular';
      }

      let externalFormat: string | null = null;
      const externals = recentInvoices.filter(i => i.externalInvoiceNumber).map(i => i.externalInvoiceNumber!);
      if (externals.length > 0) {
        externalFormat = externals[0].replace(/\d+/g, '#');
        learningApplied.push(`Detected external invoice number format for ${ci.clientCompany}: ${externalFormat}`);
      }

      const descFormat = sampleDescriptions.length > 0
        ? this.detectDescriptionFormat(sampleDescriptions)
        : 'No description pattern detected';

      patterns.push({
        clientId: ci.clientId,
        clientName: ci.clientCompany || `${ci.clientFirstName} ${ci.clientLastName}`,
        isAgency: ci.isAgency || false,
        avgLineItemsPerInvoice: recentInvoices.length > 0 ? totalLines / recentInvoices.length : 0,
        avgRate: rateCount > 0 ? totalRate / rateCount : 0,
        typicalDescriptionFormat: descFormat,
        commonSites: Array.from(allSites).slice(0, 10),
        commonEmployees: Array.from(allEmployees).slice(0, 20),
        billingFrequency,
        externalNumberFormat: externalFormat,
        agencyEndClient: ci.agencyEndClientName || null,
        totalInvoices: Number(ci.invoiceCount),
        totalRevenue: Number(ci.totalRevenue || 0),
      });
    }

    const agencyPatterns = patterns.filter(p => p.isAgency);
    const directPatterns = patterns.filter(p => !p.isAgency);

    const insights: string[] = [];
    if (agencyPatterns.length > 0) {
      insights.push(`${agencyPatterns.length} agency/subcontract clients detected — these require external invoice numbers and end-client references`);
      for (const ap of agencyPatterns) {
        insights.push(`Agency "${ap.clientName}" → end-client "${ap.agencyEndClient || 'unknown'}": ${ap.totalInvoices} invoices, format: ${ap.externalNumberFormat || 'no external # detected'}`);
      }
    }
    if (directPatterns.length > 0) {
      insights.push(`${directPatterns.length} direct clients: billing frequency breakdown: ${this.summarizeFrequencies(directPatterns)}`);
    }

    const topClients = [...patterns].sort((a, b) => b.totalRevenue - a.totalRevenue).slice(0, 5);
    if (topClients.length > 0) {
      insights.push(`Top revenue clients: ${topClients.map(c => `${c.clientName} ($${c.totalRevenue.toFixed(2)})`).join(', ')}`);
    }

    for (const p of patterns) {
      try {
        (sharedKnowledgeGraph as any).storeEntity({
          id: `invoice-pattern-${p.clientId}`,
          type: 'insight',
          domain: 'invoicing',
          name: `Invoice Pattern: ${p.clientName}`,
          metadata: {
            isAgency: p.isAgency,
            billingFrequency: p.billingFrequency,
            avgRate: p.avgRate,
            externalNumberFormat: p.externalNumberFormat,
            descriptionFormat: p.typicalDescriptionFormat,
          },
          confidence: 0.85,
          workspaceId,
        });
      } catch (memErr) {
        log.warn('[Trinity BI] Failed to store invoice pattern memory:', memErr instanceof Error ? memErr.message : String(memErr));
      }
    }

    return {
      patterns,
      insights,
      metacognition: this.buildMetacognition(startTime, knowledgeGaps, learningApplied, patterns.length > 0 ? 0.88 : 0.3),
    };
  }

  async analyzeInvoiceForQB(workspaceId: string, invoiceId: string): Promise<{
    qbReadyPayload: any;
    formatDecisions: string[];
    metacognition: MetacognitionResult;
  }> {
    const startTime = Date.now();
    const knowledgeGaps: string[] = [];
    const learningApplied: string[] = [];

    const [invoice] = await db.select().from(invoices)
      .where(and(eq(invoices.id, invoiceId), eq(invoices.workspaceId, workspaceId)))
      .limit(1);

    if (!invoice) {
      return {
        qbReadyPayload: null,
        formatDecisions: ['Invoice not found'],
        metacognition: this.buildMetacognition(startTime, ['Invoice does not exist'], [], 0),
      };
    }

    const [client] = await db.select().from(clients)
      .where(eq(clients.id, invoice.clientId))
      .limit(1);

    const lineItems = await db.select({
      li: invoiceLineItems,
      empFirst: employees.firstName,
      empLast: employees.lastName,
    }).from(invoiceLineItems)
      .leftJoin(employees, eq(invoiceLineItems.employeeId, employees.id))
      .where(eq(invoiceLineItems.invoiceId, invoiceId))
      .orderBy(asc(invoiceLineItems.lineNumber));

    const formatDecisions: string[] = [];

    let docNumber = invoice.invoiceNumber;
    if (client?.isAgency && invoice.externalInvoiceNumber) {
      docNumber = invoice.externalInvoiceNumber;
      formatDecisions.push(`Using agency's external invoice number "${docNumber}" instead of internal number "${invoice.invoiceNumber}"`);
      learningApplied.push('Applied agency billing pattern: external invoice number takes priority');
    }

    let privateNote = `CoAIleague Invoice ${invoice.invoiceNumber}`;
    if (client?.isAgency && client.agencyEndClientName) {
      privateNote += ` | End Client: ${client.agencyEndClientName}`;
      formatDecisions.push(`Added end-client reference "${client.agencyEndClientName}" to private note for agency tracking`);
    }

    if (client?.agencyBillingInstructions) {
      privateNote += ` | Agency Instructions: ${client.agencyBillingInstructions}`;
      formatDecisions.push(`Embedded agency billing instructions in QB memo`);
      learningApplied.push('Applied stored agency billing instructions');
    }

    const qbLines = lineItems.map((item, idx) => {
      let description = item.li.description;
      const dd = item.li.descriptionData as any;

      if (dd && (dd.officers || dd.location || dd.schedule_description)) {
        const parts: string[] = [];
        if (dd.sub_client_name || dd.location) {
          parts.push(dd.sub_client_name || dd.location);
        }
        if (dd.officers && dd.officers.length > 0) {
          parts.push(dd.officers.join(', '));
        }
        if (dd.schedule_description) {
          parts.push(dd.schedule_description);
        }
        if (dd.service_dates && dd.service_dates.length > 0) {
          parts.push(dd.service_dates.map((d: any) => `${d.date} ${d.time}`).join('; '));
        }
        if (parts.length > 0) {
          description = parts.join(' | ');
          formatDecisions.push(`Line ${idx + 1}: Built structured description from descriptionData (site, officers, schedule)`);
        }
      } else if (item.empFirst && item.empLast) {
        const empName = `${item.empFirst} ${item.empLast}`;
        if (!description.includes(empName)) {
          description = `${empName} - ${description}`;
          formatDecisions.push(`Line ${idx + 1}: Prepended employee name "${empName}" to description`);
        }
      }

      return {
        DetailType: 'SalesItemLineDetail',
        Amount: Number(item.li.amount),
        Description: description,
        SalesItemLineDetail: {
          ItemRef: { value: '1', name: 'Services' },
          Qty: Number(item.li.quantity),
          UnitPrice: Number(item.li.unitPrice),
        },
      };
    });

    const qbReadyPayload = {
      DocNumber: docNumber,
      TxnDate: invoice.issueDate ? new Date(invoice.issueDate).toISOString().split('T')[0] : new Date().toISOString().split('T')[0],
      DueDate: invoice.dueDate ? new Date(invoice.dueDate).toISOString().split('T')[0] : undefined,
      CustomerRef: { value: client?.quickbooksClientId || 'UNMAPPED' },
      PrivateNote: privateNote,
      Line: qbLines,
      TotalAmt: Number(invoice.total),
      TxnTaxDetail: invoice.taxAmount && Number(invoice.taxAmount) > 0
        ? { TotalTax: Number(invoice.taxAmount) }
        : undefined,
    };

    if (!client?.quickbooksClientId) {
      knowledgeGaps.push('Client not mapped to QuickBooks — CustomerRef will be "UNMAPPED". Sync client first.');
    }

    return {
      qbReadyPayload,
      formatDecisions,
      metacognition: this.buildMetacognition(startTime, knowledgeGaps, learningApplied, knowledgeGaps.length === 0 ? 0.95 : 0.6),
    };
  }

  async scanPayrollPatterns(workspaceId: string, periodMonths: number = 3): Promise<{
    pattern: PayrollPattern;
    insights: string[];
    metacognition: MetacognitionResult;
  }> {
    const cacheKey = `payroll-patterns-${workspaceId}-${periodMonths}`;
    const cached = this.getCached<{ pattern: PayrollPattern; insights: string[]; metacognition: MetacognitionResult }>(cacheKey);
    if (cached) return cached;

    return this.deduplicatedAnalysis(cacheKey, async () => {
      const result = await this._scanPayrollPatternsInner(workspaceId, periodMonths);
      this.setCache(cacheKey, result);
      return result;
    });
  }

  private async _scanPayrollPatternsInner(workspaceId: string, periodMonths: number): Promise<{
    pattern: PayrollPattern;
    insights: string[];
    metacognition: MetacognitionResult;
  }> {
    const startTime = Date.now();
    const knowledgeGaps: string[] = [];
    const learningApplied: string[] = [];
    const cutoff = new Date();
    cutoff.setMonth(cutoff.getMonth() - periodMonths);

    const runs = await db.select().from(payrollRuns)
      .where(and(eq(payrollRuns.workspaceId, workspaceId), gte(payrollRuns.periodStart, cutoff)))
      .orderBy(desc(payrollRuns.periodStart));

    if (runs.length === 0) {
      knowledgeGaps.push('No payroll runs found — cannot establish patterns yet');
      return {
        pattern: { avgGrossPay: 0, avgEmployeesPerRun: 0, typicalPeriodDays: 0, overtimeRatio: 0, topEarners: [], costByClient: [], anomalies: [] },
        insights: ['No payroll history available to analyze'],
        metacognition: this.buildMetacognition(startTime, knowledgeGaps, learningApplied, 0.2),
      };
    }

    const avgGross = runs.reduce((s, r) => s + Number(r.totalGrossPay || 0), 0) / runs.length;

    let totalPeriodDays = 0;
    for (const r of runs) {
      const days = (new Date(r.periodEnd).getTime() - new Date(r.periodStart).getTime()) / 86400000;
      totalPeriodDays += days;
    }
    const typicalPeriodDays = Math.round(totalPeriodDays / runs.length);

    const employeePay = await db
      .select({
        empId: timeEntries.employeeId,
        empFirst: employees.firstName,
        empLast: employees.lastName,
        totalPay: sum(timeEntries.payableAmount),
        totalRegHours: sum(timeEntries.regularHours),
        totalOTHours: sum(timeEntries.overtimeHours),
        totalBillable: sum(timeEntries.billableAmount),
      })
      .from(timeEntries)
      .innerJoin(employees, eq(timeEntries.employeeId, employees.id))
      .where(and(eq(timeEntries.workspaceId, workspaceId), gte(timeEntries.clockIn, cutoff)))
      .groupBy(timeEntries.employeeId, employees.firstName, employees.lastName);

    const totalRegHours = employeePay.reduce((s, e) => s + Number(e.totalRegHours || 0), 0);
    const totalOTHours = employeePay.reduce((s, e) => s + Number(e.totalOTHours || 0), 0);
    const overtimeRatio = totalRegHours > 0 ? totalOTHours / (totalRegHours + totalOTHours) : 0;

    const topEarners = [...employeePay]
      .sort((a, b) => Number(b.totalPay || 0) - Number(a.totalPay || 0))
      .slice(0, 5)
      .map(e => ({ name: `${e.empFirst} ${e.empLast}`, avgPay: Number(e.totalPay || 0) / runs.length }));

    const clientCosts = await db
      .select({
        clientId: timeEntries.clientId,
        clientCompany: clients.companyName,
        clientFirst: clients.firstName,
        clientLast: clients.lastName,
        laborCost: sum(timeEntries.payableAmount),
        revenue: sum(timeEntries.billableAmount),
      })
      .from(timeEntries)
      .innerJoin(clients, eq(timeEntries.clientId, clients.id))
      .where(and(eq(timeEntries.workspaceId, workspaceId), gte(timeEntries.clockIn, cutoff), isNotNull(timeEntries.clientId)))
      .groupBy(timeEntries.clientId, clients.companyName, clients.firstName, clients.lastName);

    const costByClient = clientCosts.map(cc => {
      const labor = Number(cc.laborCost || 0);
      const rev = Number(cc.revenue || 0);
      return {
        clientName: cc.clientCompany || `${cc.clientFirst} ${cc.clientLast}`,
        laborCost: labor,
        revenue: rev,
        margin: rev > 0 ? ((rev - labor) / rev) * 100 : 0,
      };
    }).sort((a, b) => b.revenue - a.revenue);

    const anomalies: string[] = [];
    if (overtimeRatio > 0.15) {
      anomalies.push(`High overtime ratio: ${(overtimeRatio * 100).toFixed(1)}% — review scheduling to reduce OT costs`);
    }
    const lowMarginClients = costByClient.filter(c => c.margin < 20 && c.revenue > 0);
    if (lowMarginClients.length > 0) {
      anomalies.push(`Low margin clients (<20%): ${lowMarginClients.map(c => `${c.clientName} (${c.margin.toFixed(1)}%)`).join(', ')}`);
    }

    const insights: string[] = [];
    insights.push(`${runs.length} payroll runs analyzed over ${periodMonths} months`);
    insights.push(`Average gross payroll: $${avgGross.toFixed(2)} per run, ${typicalPeriodDays}-day periods`);
    insights.push(`Overtime ratio: ${(overtimeRatio * 100).toFixed(1)}% of total hours`);
    if (topEarners.length > 0) {
      insights.push(`Top earner: ${topEarners[0].name} at $${topEarners[0].avgPay.toFixed(2)} avg per period`);
    }
    if (costByClient.length > 0) {
      const bestMargin = costByClient.reduce((best, c) => c.margin > best.margin ? c : best, costByClient[0]);
      insights.push(`Best margin client: ${bestMargin.clientName} at ${bestMargin.margin.toFixed(1)}%`);
    }
    learningApplied.push('Correlated time entries with payroll runs for employee-level cost analysis');
    learningApplied.push('Calculated per-client labor cost vs revenue margins');

    try {
      (sharedKnowledgeGraph as any).storeEntity({
        id: `payroll-pattern-${workspaceId}`,
        type: 'insight',
        domain: 'payroll',
        name: `Payroll Intelligence: ${runs.length} runs analyzed`,
        metadata: { avgGross: avgGross, overtimeRatio, topEarnerCount: topEarners.length, clientCount: costByClient.length },
        confidence: 0.85,
        workspaceId,
      });
    } catch (memErr) {
      log.warn('[Trinity BI] Failed to store payroll pattern memory:', memErr instanceof Error ? memErr.message : String(memErr));
    }

    return {
      pattern: { avgGrossPay: avgGross, avgEmployeesPerRun: employeePay.length, typicalPeriodDays, overtimeRatio, topEarners, costByClient, anomalies },
      insights,
      metacognition: this.buildMetacognition(startTime, knowledgeGaps, learningApplied, runs.length >= 3 ? 0.9 : 0.6),
    };
  }

  async scanSchedulePatterns(workspaceId: string, weeksBack: number = 4): Promise<{
    pattern: SchedulePattern;
    insights: string[];
    metacognition: MetacognitionResult;
  }> {
    const cacheKey = `schedule-patterns-${workspaceId}-${weeksBack}`;
    const cached = this.getCached<{ pattern: SchedulePattern; insights: string[]; metacognition: MetacognitionResult }>(cacheKey);
    if (cached) return cached;

    return this.deduplicatedAnalysis(cacheKey, async () => {
      const result = await this._scanSchedulePatternsInner(workspaceId, weeksBack);
      this.setCache(cacheKey, result);
      return result;
    });
  }

  private async _scanSchedulePatternsInner(workspaceId: string, weeksBack: number): Promise<{
    pattern: SchedulePattern;
    insights: string[];
    metacognition: MetacognitionResult;
  }> {
    const startTime = Date.now();
    const knowledgeGaps: string[] = [];
    const learningApplied: string[] = [];
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - (weeksBack * 7));

    const allShifts = await db
      .select({
        shift: shifts,
        empFirst: employees.firstName,
        empLast: employees.lastName,
        clientCompany: clients.companyName,
        siteName: sites.name,
      })
      .from(shifts)
      .leftJoin(employees, eq(shifts.employeeId, employees.id))
      .leftJoin(clients, eq(shifts.clientId, clients.id))
      .leftJoin(sites, eq(shifts.siteId, sites.id))
      .where(and(eq(shifts.workspaceId, workspaceId), gte(shifts.startTime, cutoff)));

    if (allShifts.length === 0) {
      knowledgeGaps.push('No shifts found in the analysis period — cannot establish patterns');
      return {
        pattern: { peakDays: [], avgShiftsPerDay: 0, avgShiftDurationHours: 0, employeeUtilization: [], siteStaffingPatterns: [], gapRisks: [] },
        insights: ['No shift history available to analyze'],
        metacognition: this.buildMetacognition(startTime, knowledgeGaps, learningApplied, 0.2),
      };
    }

    const dayCount: Record<string, number> = {};
    const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    let totalDurationHours = 0;

    for (const s of allShifts) {
      const day = dayNames[new Date(s.shift.startTime).getDay()];
      dayCount[day] = (dayCount[day] || 0) + 1;
      const dur = (new Date(s.shift.endTime).getTime() - new Date(s.shift.startTime).getTime()) / 3600000;
      totalDurationHours += Math.max(0, dur);
    }

    const peakDays = Object.entries(dayCount).sort((a, b) => b[1] - a[1]).slice(0, 3).map(([d]) => d);
    const totalDays = weeksBack * 7;
    const avgShiftsPerDay = totalDays > 0 ? allShifts.length / totalDays : 0;
    const avgShiftDurationHours = allShifts.length > 0 ? totalDurationHours / allShifts.length : 0;

    const empHours: Record<string, { name: string; hours: number }> = {};
    for (const s of allShifts) {
      if (!s.shift.employeeId) continue;
      const key = s.shift.employeeId;
      if (!empHours[key]) empHours[key] = { name: `${s.empFirst || ''} ${s.empLast || ''}`.trim() || 'Unknown', hours: 0 };
      const dur = (new Date(s.shift.endTime).getTime() - new Date(s.shift.startTime).getTime()) / 3600000;
      empHours[key].hours += Math.max(0, dur);
    }

    const employeeUtilization = Object.values(empHours).map(e => ({
      name: e.name,
      hoursPerWeek: e.hours / weeksBack,
      utilization: Math.min(100, (e.hours / weeksBack / 40) * 100),
    })).sort((a, b) => b.hoursPerWeek - a.hoursPerWeek);

    const siteShifts: Record<string, { shifts: typeof allShifts; name: string }> = {};
    for (const s of allShifts) {
      const siteKey = s.siteName || s.clientCompany || 'Unassigned';
      if (!siteShifts[siteKey]) siteShifts[siteKey] = { shifts: [], name: siteKey };
      siteShifts[siteKey].shifts.push(s);
    }

    const siteStaffingPatterns = Object.values(siteShifts).map(ss => {
      const uniqueDates = new Set(ss.shifts.map(s => s.shift.date || new Date(s.shift.startTime).toISOString().split('T')[0]));
      const typicalStaff = Math.round(ss.shifts.length / uniqueDates.size);
      const shiftDurations = ss.shifts.map(s => {
        const dur = (new Date(s.shift.endTime).getTime() - new Date(s.shift.startTime).getTime()) / 3600000;
        if (dur <= 4) return 'short (≤4h)';
        if (dur <= 8) return 'standard (4-8h)';
        if (dur <= 12) return 'extended (8-12h)';
        return 'overnight (12h+)';
      });
      const uniqueTypes = [...new Set(shiftDurations)];
      return { siteName: ss.name, typicalStaff, shiftTypes: uniqueTypes };
    }).sort((a, b) => b.typicalStaff - a.typicalStaff);

    const gapRisks: string[] = [];
    const unassigned = allShifts.filter(s => !s.shift.employeeId);
    if (unassigned.length > 0) {
      gapRisks.push(`${unassigned.length} unassigned shifts in the period — potential coverage gaps`);
    }
    const overworked = employeeUtilization.filter(e => e.hoursPerWeek > 50);
    if (overworked.length > 0) {
      gapRisks.push(`${overworked.length} employees averaging 50+ hours/week: ${overworked.map(e => `${e.name} (${e.hoursPerWeek.toFixed(1)}h)`).join(', ')}`);
    }
    const underutilized = employeeUtilization.filter(e => e.utilization < 25 && e.hoursPerWeek > 0);
    if (underutilized.length > 0) {
      gapRisks.push(`${underutilized.length} underutilized employees (<25%): consider assigning more shifts`);
    }

    const insights: string[] = [];
    insights.push(`${allShifts.length} shifts analyzed over ${weeksBack} weeks (${avgShiftsPerDay.toFixed(1)} shifts/day avg)`);
    insights.push(`Peak days: ${peakDays.join(', ')}`);
    insights.push(`Average shift duration: ${avgShiftDurationHours.toFixed(1)} hours`);
    insights.push(`${employeeUtilization.length} active employees, ${siteStaffingPatterns.length} sites staffed`);
    if (siteStaffingPatterns.length > 0) {
      insights.push(`Busiest site: ${siteStaffingPatterns[0].siteName} (${siteStaffingPatterns[0].typicalStaff} staff/day typical)`);
    }
    learningApplied.push('Calculated employee utilization rates against 40h/week baseline');
    learningApplied.push('Detected shift duration categories per site for pattern matching');

    try {
      (sharedKnowledgeGraph as any).storeEntity({
        id: `schedule-pattern-${workspaceId}`,
        type: 'insight',
        domain: 'scheduling',
        name: `Schedule Intelligence: ${allShifts.length} shifts analyzed`,
        metadata: { peakDays, avgShiftsPerDay, avgDuration: avgShiftDurationHours, siteCount: siteStaffingPatterns.length },
        confidence: 0.87,
        workspaceId,
      });
    } catch (memErr) {
      log.warn('[Trinity BI] Failed to store schedule pattern memory:', memErr instanceof Error ? memErr.message : String(memErr));
    }

    return {
      pattern: { peakDays, avgShiftsPerDay, avgShiftDurationHours, employeeUtilization, siteStaffingPatterns, gapRisks },
      insights,
      metacognition: this.buildMetacognition(startTime, knowledgeGaps, learningApplied, allShifts.length >= 20 ? 0.9 : 0.5),
    };
  }

  async deepAnalysis(workspaceId: string, domain: 'invoicing' | 'payroll' | 'scheduling' | 'all', question?: string): Promise<{
    analysis: string;
    recommendations: string[];
    metacognition: MetacognitionResult;
  }> {
    const dedupeKey = `deep-analysis-${workspaceId}-${domain}-${question || 'general'}`;
    return this.deduplicatedAnalysis(dedupeKey, () => this._deepAnalysisInner(workspaceId, domain, question));
  }

  private async _deepAnalysisInner(workspaceId: string, domain: 'invoicing' | 'payroll' | 'scheduling' | 'all', question?: string): Promise<{
    analysis: string;
    recommendations: string[];
    metacognition: MetacognitionResult;
  }> {
    const startTime = Date.now();
    const knowledgeGaps: string[] = [];
    const learningApplied: string[] = [];

    const contextParts: string[] = [];

    if (domain === 'invoicing' || domain === 'all') {
      const invoiceData = await this.learnInvoicePatterns(workspaceId);
      contextParts.push(`INVOICE INTELLIGENCE:\n${invoiceData.insights.join('\n')}\nPatterns: ${JSON.stringify(invoiceData.patterns.slice(0, 5).map(p => ({
        client: p.clientName, isAgency: p.isAgency, freq: p.billingFrequency, avgRate: p.avgRate.toFixed(2),
        invoices: p.totalInvoices, revenue: p.totalRevenue.toFixed(2), endClient: p.agencyEndClient
      })))}`);
    }

    if (domain === 'payroll' || domain === 'all') {
      const payrollData = await this.scanPayrollPatterns(workspaceId);
      contextParts.push(`PAYROLL INTELLIGENCE:\n${payrollData.insights.join('\n')}\nAnomalies: ${payrollData.pattern.anomalies.join('; ') || 'None'}\nTop earners: ${JSON.stringify(payrollData.pattern.topEarners)}\nClient margins: ${JSON.stringify(payrollData.pattern.costByClient.slice(0, 5).map(c => ({ client: c.clientName, margin: c.margin.toFixed(1) + '%', revenue: c.revenue.toFixed(2) })))}`);
    }

    if (domain === 'scheduling' || domain === 'all') {
      const scheduleData = await this.scanSchedulePatterns(workspaceId);
      contextParts.push(`SCHEDULING INTELLIGENCE:\n${scheduleData.insights.join('\n')}\nGap risks: ${scheduleData.pattern.gapRisks.join('; ') || 'None'}\nSite patterns: ${JSON.stringify(scheduleData.pattern.siteStaffingPatterns.slice(0, 5))}\nEmployee utilization: ${JSON.stringify(scheduleData.pattern.employeeUtilization.slice(0, 5).map(e => ({ name: e.name, hrs: e.hoursPerWeek.toFixed(1), util: e.utilization.toFixed(0) + '%' })))}`);
    }

    const userQuestion = question || `Provide a comprehensive ${domain} analysis with actionable recommendations.`;

    const prompt = `You are Trinity, an elite AI workforce intelligence analyst for a security staffing company.
You have access to real operational data. Analyze it deeply and provide actionable insights.

${contextParts.join('\n\n')}

QUESTION: ${userQuestion}

Respond with:
1. ANALYSIS: A concise but thorough analysis of the data patterns
2. RECOMMENDATIONS: Specific, actionable recommendations (numbered list)
3. CONFIDENCE: Rate your confidence in each recommendation (high/medium/low)

Focus on profit optimization, labor cost reduction, overtime management, billing accuracy, and scheduling efficiency.
For agency/subcontract clients, pay special attention to external reference number compliance and end-client tracking.`;

    try {
      const geminiResult = await meteredGemini.generate({
        prompt,
        workspaceId,
        featureKey: 'business_health_scan',
        maxOutputTokens: 2000,
      });

      if (geminiResult.success && geminiResult.text) {
        learningApplied.push('Applied Gemini 3 deep analysis with metacognitive reasoning');

        const recommendations = this.extractRecommendations(geminiResult.text);

        try {
          reinforcementLearningLoop.recordExperience({
            agentId: 'trinity-business-intelligence',
            domain: domain === 'all' ? 'invoicing' : domain as KnowledgeDomain,
            action: `deep_analysis_${domain}`,
            outcome: 'success',
            reward: 1.0,
            context: { domain, questionProvided: !!question, dataPointsAnalyzed: contextParts.length },
            workspaceId,
          });
        } catch (memErr) {
          log.warn('[Trinity BI] Failed to store deep analysis memory:', memErr instanceof Error ? memErr.message : String(memErr));
        }

        return {
          analysis: geminiResult.text,
          recommendations,
          metacognition: this.buildMetacognition(startTime, knowledgeGaps,
            [...learningApplied, `Consumed ${geminiResult.tokensUsed || 0} AI tokens for analysis`],
            0.92),
        };
      }

      knowledgeGaps.push('Gemini analysis returned empty — falling back to pattern-based insights');
    } catch (err: any) {
      knowledgeGaps.push(`Gemini analysis failed: ${(err instanceof Error ? err.message : String(err))} — using pattern-based insights only`);
    }

    return {
      analysis: contextParts.join('\n\n'),
      recommendations: ['Review the pattern data above for manual analysis'],
      metacognition: this.buildMetacognition(startTime, knowledgeGaps, learningApplied, 0.5),
    };
  }

  private detectDescriptionFormat(descriptions: string[]): string {
    if (descriptions.length === 0) return 'unknown';
    const hasEmployeeNames = descriptions.some(d => /[A-Z][a-z]+ \d+[apm]+/i.test(d));
    const hasSiteNames = descriptions.some(d => /house|office|building|tower|center|mall/i.test(d));
    const hasTimeRanges = descriptions.some(d => /\d+[apm]+-\d+[apm]+/i.test(d));
    const hasDates = descriptions.some(d => /\d{2}\/\d{2}/i.test(d));

    const parts: string[] = [];
    if (hasSiteNames) parts.push('site-name');
    if (hasEmployeeNames) parts.push('employee-names');
    if (hasTimeRanges) parts.push('shift-times');
    if (hasDates) parts.push('dates');

    return parts.length > 0 ? parts.join(' + ') : `freeform (sample: "${descriptions[0].substring(0, 60)}...")`;
  }

  private summarizeFrequencies(patterns: InvoicePattern[]): string {
    const freq: Record<string, number> = {};
    for (const p of patterns) {
      freq[p.billingFrequency] = (freq[p.billingFrequency] || 0) + 1;
    }
    return Object.entries(freq).map(([k, v]) => `${k}: ${v}`).join(', ');
  }

  private extractRecommendations(text: string): string[] {
    const lines = text.split('\n');
    const recommendations: string[] = [];
    for (const line of lines) {
      const trimmed = line.trim();
      if (/^\d+[\.\)]\s/.test(trimmed) && trimmed.length > 20) {
        recommendations.push(trimmed.replace(/^\d+[\.\)]\s*/, ''));
      }
    }
    return recommendations.length > 0 ? recommendations : ['See analysis above for detailed insights'];
  }

  private buildMetacognition(startTime: number, knowledgeGaps: string[], learningApplied: string[], confidence: number): MetacognitionResult {
    const executionMs = Date.now() - startTime;

    const suggestedActions: string[] = [];
    if (confidence < 0.5) {
      suggestedActions.push('Insufficient data — add more historical records to improve analysis accuracy');
    }
    if (knowledgeGaps.length > 0) {
      suggestedActions.push('Address knowledge gaps listed below to increase confidence');
    }
    if (confidence >= 0.8) {
      suggestedActions.push('High confidence — safe to use these insights for automation decisions');
    }

    return {
      confidence,
      reasoning: `Analysis completed in ${executionMs}ms. Confidence: ${(confidence * 100).toFixed(0)}%. ${learningApplied.length} learning patterns applied, ${knowledgeGaps.length} knowledge gaps identified.`,
      knowledgeGaps,
      suggestedActions,
      learningApplied,
    };
  }
}

export const trinityBusinessIntelligence = new TrinityBusinessIntelligence();

export function registerBusinessIntelligenceActions(): void {
  log.info('[Trinity BI] Registering business intelligence actions...');

  // billing.analyze — consolidated from all bi_* actions
  // Dispatch via payload.type: "deep" | "invoice_patterns" | "payroll_patterns" | "schedule_patterns" | "search" | "preference"
  // Default (no type): runs deep analysis
  helpaiOrchestrator.registerAction({
    actionId: 'billing.analyze',
    name: 'Business Intelligence Analysis',
    category: 'analytics',
    description: 'Consolidated BI analysis action. Use payload.type: "deep" for Gemini-powered analysis, "invoice_patterns" to learn invoice patterns, "payroll_patterns" for payroll analysis, "schedule_patterns" for scheduling analysis, "search" to search invoices (pass search params in payload), "preference" to learn a billing preference. Defaults to deep analysis.',
    requiredRoles: ['org_owner', 'co_owner', 'manager', 'supervisor'],
    handler: async (request: ActionRequest): Promise<ActionResult> => {
      const startTime = Date.now();
      if (!request.workspaceId) {
        return { success: false, actionId: request.actionId, message: 'Workspace context required for analysis', executionTimeMs: Date.now() - startTime };
      }
      const analysisType = request.payload?.type || (request as any).params?.type;

      try {
        // type=search → search invoices
        if (analysisType === 'search') {
          const result = await trinityBusinessIntelligence.searchInvoices(
            request.workspaceId,
            request.payload || (request as any).params || {}
          );
          return {
            success: true, actionId: request.actionId, data: result,
            message: `Found ${result.total} invoices. Confidence: ${(result.metacognition.confidence * 100).toFixed(0)}%`,
            executionTimeMs: Date.now() - startTime,
          };
        }

        // type=invoice_patterns → learn invoice patterns
        if (analysisType === 'invoice_patterns') {
          const result = await trinityBusinessIntelligence.learnInvoicePatterns(request.workspaceId);
          return {
            success: true, actionId: request.actionId, data: result,
            message: `Learned patterns from ${result.patterns.length} clients. ${result.insights.length} insights generated. Confidence: ${(result.metacognition.confidence * 100).toFixed(0)}%`,
            executionTimeMs: Date.now() - startTime,
          };
        }

        // type=payroll_patterns → scan payroll patterns
        if (analysisType === 'payroll_patterns') {
          const result = await trinityBusinessIntelligence.scanPayrollPatterns(
            request.workspaceId,
            request.payload?.periodMonths || (request as any).params?.periodMonths || 3
          );
          return {
            success: true, actionId: request.actionId, data: result,
            message: `Payroll analysis complete. ${result.insights.length} insights, ${result.pattern.anomalies.length} anomalies detected. Confidence: ${(result.metacognition.confidence * 100).toFixed(0)}%`,
            executionTimeMs: Date.now() - startTime,
          };
        }

        // type=schedule_patterns → scan schedule patterns
        if (analysisType === 'schedule_patterns') {
          const result = await trinityBusinessIntelligence.scanSchedulePatterns(
            request.workspaceId,
            request.payload?.weeksBack || (request as any).params?.weeksBack || 4
          );
          return {
            success: true, actionId: request.actionId, data: result,
            message: `Schedule analysis complete. ${result.insights.length} insights, ${result.pattern.gapRisks.length} gap risks identified. Confidence: ${(result.metacognition.confidence * 100).toFixed(0)}%`,
            executionTimeMs: Date.now() - startTime,
          };
        }

        // type=preference → forward to billing.settings with action=learn
        if (analysisType === 'preference') {
          const settingsResult = await helpaiOrchestrator.executeAction({
            actionId: 'billing.settings',
            workspaceId: request.workspaceId,
            userId: request.userId,
            payload: { ...request.payload, action: 'learn' },
          } as any);
          return settingsResult || { success: true, actionId: request.actionId, message: 'Preference forwarded to billing.settings', executionTimeMs: Date.now() - startTime };
        }

        // Default: type=deep (or no type) → deep analysis
        const result = await trinityBusinessIntelligence.deepAnalysis(
          request.workspaceId,
          request.payload?.domain || (request as any).params?.domain || 'all',
          request.payload?.question || (request as any).params?.question
        );
        return {
          success: true, actionId: request.actionId, data: result,
          message: `Deep analysis complete. ${result.recommendations.length} recommendations generated. Confidence: ${(result.metacognition.confidence * 100).toFixed(0)}%`,
          executionTimeMs: Date.now() - startTime,
        };
      } catch (error: any) {
        return { success: false, actionId: request.actionId, message: sanitizeError(error), executionTimeMs: Date.now() - startTime };
      }
    },
  });

  // Individual bi_* actions below are kept for reference but NOT registered —
  // all functionality is available through billing.analyze with the appropriate payload.type.
  // billing.bi_prepare_for_qb is now billing.sync_qb with action=prepare in trinityFinanceOrchestrator.ts.

  /*
  // NOT REGISTERED — consolidated into billing.analyze
  helpaiOrchestrator.registerAction({ actionId: 'billing.bi_search_invoices', ... });
  helpaiOrchestrator.registerAction({ actionId: 'billing.bi_learn_invoice_patterns', ... });
  helpaiOrchestrator.registerAction({ actionId: 'billing.bi_scan_payroll_patterns', ... });
  helpaiOrchestrator.registerAction({ actionId: 'billing.bi_scan_schedule_patterns', ... });
  // NOT REGISTERED — consolidated into billing.sync_qb (action=prepare)
  helpaiOrchestrator.registerAction({ actionId: 'billing.bi_prepare_for_qb', ... });
  */

  log.info('[Trinity BI] Registered 1 consolidated business intelligence action (billing.analyze)');
}
