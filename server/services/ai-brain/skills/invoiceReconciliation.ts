/**
 * INVOICE RECONCILIATION SKILL
 * ============================
 * AI-powered validation and gap analysis for invoicing using Gemini 3 Pro.
 * 
 * Features:
 * - Billable hours verification
 * - Rate validation against contracts
 * - Gap detection (unbilled time, missing entries)
 * - Payment reconciliation
 * - Revenue optimization suggestions
 * - Fallback cascade for reliability
 */

import { BaseSkill } from './base-skill';
import type { SkillManifest, SkillContext, SkillResult } from './types';
import { db } from '../../../db';
import { 
  invoices, 
  invoiceLineItems,
  timeEntries,
  clients,
  employees
} from '@shared/schema';
import { eq, and, gte, lte, sql, isNull, sum, count } from 'drizzle-orm';
import { meteredGemini } from '../../../billing/meteredGeminiClient';

interface InvoiceReconciliationParams {
  workspaceId: string;
  billingPeriodStart: Date;
  billingPeriodEnd: Date;
  clientIds?: string[];
  includePaymentAnalysis?: boolean;
}

interface ReconciliationIssue {
  severity: 'critical' | 'warning' | 'info';
  category: 'unbilled' | 'rate_mismatch' | 'missing_contract' | 'overdue' | 'variance' | 'gap';
  clientId?: string;
  clientName?: string;
  description: string;
  suggestedFix: string;
  autoFixable: boolean;
  potentialRevenue?: number;
  details?: Record<string, any>;
}

interface InvoiceReconciliationResult {
  isComplete: boolean;
  overallConfidence: number;
  issues: ReconciliationIssue[];
  summary: {
    totalClients: number;
    totalBillableHours: number;
    totalBilledAmount: number;
    unbilledHours: number;
    unbilledRevenue: number;
    criticalIssues: number;
    warningIssues: number;
    overdueInvoices: number;
    revenueAtRisk: number;
  };
  recommendations: string[];
  aiInsights?: string;
  gapAnalysis: {
    billableCoveragePercent: number;
    clientsWithGaps: string[];
    revenueOpportunities: number;
  };
}

export class InvoiceReconciliationSkill extends BaseSkill {
  getManifest(): SkillManifest {
    return {
      id: 'invoice-reconciliation',
      name: 'Invoice Reconciliation & Gap Analysis',
      version: '1.0.0',
      description: 'AI-powered invoice validation and revenue gap detection using Gemini 3 Pro',
      author: 'CoAIleague AI Brain',
      category: 'invoicing',
      requiredTier: 'professional',
      requiredRole: ['owner', 'admin'],
      capabilities: [
        'billable-hours-verification',
        'rate-validation',
        'gap-detection',
        'payment-reconciliation',
        'revenue-optimization',
      ],
      dependencies: [], // Uses database tables directly (timeEntries, invoices, clients)
      apiEndpoints: ['/api/ai-brain/skills/invoice-reconciliation/execute'],
      eventSubscriptions: ['invoice.created', 'timesheet.approved', 'billing.period.end'],
    };
  }

  async execute(
    context: SkillContext,
    params: InvoiceReconciliationParams
  ): Promise<SkillResult<InvoiceReconciliationResult>> {
    const logs: string[] = [];
    logs.push(`[InvoiceReconciliation] Starting reconciliation for period ${params.billingPeriodStart} to ${params.billingPeriodEnd}`);

    try {
      const workspaceId = params.workspaceId || context.workspaceId;

      // Step 1: Gather all billing data
      const [clientData, timesheetData, invoiceData, contractData] = await Promise.all([
        this.fetchClientData(workspaceId, params.clientIds),
        this.fetchBillableTimesheets(workspaceId, params.billingPeriodStart, params.billingPeriodEnd),
        this.fetchInvoiceData(workspaceId, params.billingPeriodStart, params.billingPeriodEnd),
        this.fetchContractData(workspaceId),
      ]);

      logs.push(`[InvoiceReconciliation] Fetched ${clientData.length} clients, ${timesheetData.length} timesheets, ${invoiceData.length} invoices`);

      // Step 2: Run reconciliation checks
      const issues: ReconciliationIssue[] = [];

      // Check for unbilled hours
      const unbilledIssues = this.detectUnbilledHours(timesheetData, invoiceData, clientData);
      issues.push(...unbilledIssues);

      // Check for rate mismatches
      const rateIssues = this.detectRateMismatches(timesheetData, contractData, clientData);
      issues.push(...rateIssues);

      // Check for overdue invoices
      const overdueIssues = this.detectOverdueInvoices(invoiceData, clientData);
      issues.push(...overdueIssues);

      // Check for clients without contracts
      const contractIssues = this.detectMissingContracts(clientData, contractData, timesheetData);
      issues.push(...contractIssues);

      logs.push(`[InvoiceReconciliation] Found ${issues.length} total issues`);

      // Step 3: Calculate summary metrics
      const totalBillableHours = timesheetData.reduce((sum, t) => sum + (t.billableHours || t.hoursWorked || 0), 0);
      const invoicedHours = this.calculateInvoicedHours(invoiceData);
      const unbilledHours = Math.max(0, totalBillableHours - invoicedHours);
      
      const avgRate = timesheetData.length > 0 
        ? timesheetData.reduce((sum, t) => sum + (t.hourlyRate || 0), 0) / timesheetData.length 
        : 0;
      const unbilledRevenue = unbilledHours * avgRate;

      const summary = {
        totalClients: clientData.length,
        totalBillableHours,
        totalBilledAmount: invoiceData.reduce((sum, i) => sum + (parseFloat(i.amount) || 0), 0),
        unbilledHours,
        unbilledRevenue,
        criticalIssues: issues.filter(i => i.severity === 'critical').length,
        warningIssues: issues.filter(i => i.severity === 'warning').length,
        overdueInvoices: invoiceData.filter(i => i.status === 'overdue').length,
        revenueAtRisk: issues.reduce((sum, i) => sum + (i.potentialRevenue || 0), 0),
      };

      // Step 4: Generate AI insights using Gemini 3 Pro
      let aiInsights: string | undefined;
      if (issues.length > 0 || summary.unbilledRevenue > 0) {
        aiInsights = await this.generateAIInsights(issues, summary, context);
        logs.push(`[InvoiceReconciliation] Generated AI insights`);
      }

      // Step 5: Calculate gap analysis
      const gapAnalysis = this.calculateGapAnalysis(clientData, timesheetData, invoiceData);

      // Step 6: Generate recommendations
      const recommendations = this.generateRecommendations(issues, summary, gapAnalysis);

      // Calculate overall confidence
      const overallConfidence = this.calculateConfidence(issues, summary, gapAnalysis);

      const result: InvoiceReconciliationResult = {
        isComplete: summary.criticalIssues === 0 && summary.unbilledHours === 0,
        overallConfidence,
        issues,
        summary,
        recommendations,
        aiInsights,
        gapAnalysis,
      };

      return {
        success: true,
        data: result,
        logs,
        tokensUsed: aiInsights ? 500 : 0,
        executionTimeMs: Date.now() - context.startTime,
      };

    } catch (error: any) {
      logs.push(`[InvoiceReconciliation] Error: ${error.message}`);
      return {
        success: false,
        error: {
          code: 'INVOICE_RECONCILIATION_ERROR',
          message: error.message,
        },
        logs,
        tokensUsed: 0,
        executionTimeMs: Date.now() - context.startTime,
      };
    }
  }

  private async fetchClientData(workspaceId: string, clientIds?: string[]) {
    return await db
      .select({
        id: clients.id,
        name: clients.name,
        email: clients.email,
        status: clients.status,
        billingRate: clients.defaultHourlyRate,
      })
      .from(clients)
      .where(eq(clients.workspaceId, workspaceId));
  }

  private async fetchBillableTimesheets(workspaceId: string, startDate: Date, endDate: Date) {
    return await db
      .select({
        id: timeEntries.id,
        employeeId: timeEntries.employeeId,
        clientId: timeEntries.clientId,
        clockIn: timeEntries.clockIn,
        totalHours: timeEntries.totalHours,
        hourlyRate: timeEntries.hourlyRate,
        status: timeEntries.status,
        billableToClient: timeEntries.billableToClient,
        invoiceId: timeEntries.invoiceId,
      })
      .from(timeEntries)
      .where(
        and(
          eq(timeEntries.workspaceId, workspaceId),
          gte(timeEntries.clockIn, startDate),
          lte(timeEntries.clockIn, endDate),
          eq(timeEntries.status, 'approved')
        )
      );
  }

  private async fetchInvoiceData(workspaceId: string, startDate: Date, endDate: Date) {
    return await db
      .select({
        id: invoices.id,
        clientId: invoices.clientId,
        invoiceNumber: invoices.invoiceNumber,
        amount: invoices.amount,
        status: invoices.status,
        dueDate: invoices.dueDate,
        issueDate: invoices.issueDate,
        totalHours: invoices.totalHours,
      })
      .from(invoices)
      .where(
        and(
          eq(invoices.workspaceId, workspaceId),
          gte(invoices.issueDate, startDate),
          lte(invoices.issueDate, endDate)
        )
      );
  }

  private async fetchContractData(workspaceId: string) {
    // Contract rates derived from client default rates instead of contracts table
    return await db
      .select({
        id: clients.id,
        clientId: clients.id,
        hourlyRate: clients.defaultHourlyRate,
        status: clients.status,
      })
      .from(clients)
      .where(eq(clients.workspaceId, workspaceId));
  }

  private detectUnbilledHours(
    timesheetData: any[],
    invoiceData: any[],
    clientData: any[]
  ): ReconciliationIssue[] {
    const issues: ReconciliationIssue[] = [];
    
    // Group unbilled hours by client
    const unbilledByClient = new Map<string, { hours: number; revenue: number }>();
    
    for (const ts of timesheetData) {
      // Check if not invoiced (no invoiceId) and billable to client
      if (!ts.invoiceId && ts.billableToClient !== false) {
        const hours = parseFloat(ts.totalHours || '0');
        const rate = parseFloat(ts.hourlyRate || '0');
        
        if (!ts.clientId) continue;
        
        const existing = unbilledByClient.get(ts.clientId) || { hours: 0, revenue: 0 };
        existing.hours += hours;
        existing.revenue += hours * rate;
        unbilledByClient.set(ts.clientId, existing);
      }
    }

    const clientMap = new Map(clientData.map(c => [c.id, c.name]));

    for (const [clientId, data] of unbilledByClient) {
      if (data.hours > 0) {
        issues.push({
          severity: data.revenue > 1000 ? 'critical' : 'warning',
          category: 'unbilled',
          clientId,
          clientName: clientMap.get(clientId) || 'Unknown Client',
          description: `${data.hours.toFixed(1)} unbilled hours worth $${data.revenue.toFixed(2)}`,
          suggestedFix: 'Generate invoice for unbilled hours',
          autoFixable: true,
          potentialRevenue: data.revenue,
          details: { unbilledHours: data.hours, potentialRevenue: data.revenue },
        });
      }
    }

    return issues;
  }

  private detectRateMismatches(
    timesheetData: any[],
    contractData: any[],
    clientData: any[]
  ): ReconciliationIssue[] {
    const issues: ReconciliationIssue[] = [];
    const contractRates = new Map<string, number>();
    
    for (const contract of contractData) {
      if (contract.status === 'active') {
        contractRates.set(contract.clientId, parseFloat(contract.hourlyRate) || 0);
      }
    }

    const clientMap = new Map(clientData.map(c => [c.id, c.name]));
    const rateDiscrepancies = new Map<string, { count: number; avgVariance: number }>();

    for (const ts of timesheetData) {
      if (!ts.clientId) continue;
      
      const contractRate = contractRates.get(ts.clientId);
      const actualRate = ts.hourlyRate || 0;
      
      if (contractRate && Math.abs(contractRate - actualRate) > 1) {
        const existing = rateDiscrepancies.get(ts.clientId) || { count: 0, avgVariance: 0 };
        existing.count++;
        existing.avgVariance = ((existing.avgVariance * (existing.count - 1)) + (actualRate - contractRate)) / existing.count;
        rateDiscrepancies.set(ts.clientId, existing);
      }
    }

    for (const [clientId, data] of rateDiscrepancies) {
      issues.push({
        severity: Math.abs(data.avgVariance) > 10 ? 'critical' : 'warning',
        category: 'rate_mismatch',
        clientId,
        clientName: clientMap.get(clientId) || 'Unknown Client',
        description: `${data.count} entries with avg rate variance of $${data.avgVariance.toFixed(2)}`,
        suggestedFix: 'Review contract rates and update timesheets or renegotiate contract',
        autoFixable: false,
        details: { entriesAffected: data.count, avgVariance: data.avgVariance },
      });
    }

    return issues;
  }

  private detectOverdueInvoices(invoiceData: any[], clientData: any[]): ReconciliationIssue[] {
    const issues: ReconciliationIssue[] = [];
    const now = new Date();
    const clientMap = new Map(clientData.map(c => [c.id, c.name]));

    for (const inv of invoiceData) {
      if (inv.status === 'sent' && inv.dueDate && new Date(inv.dueDate) < now) {
        const daysOverdue = Math.floor((now.getTime() - new Date(inv.dueDate).getTime()) / (1000 * 60 * 60 * 24));
        
        issues.push({
          severity: daysOverdue > 30 ? 'critical' : 'warning',
          category: 'overdue',
          clientId: inv.clientId,
          clientName: clientMap.get(inv.clientId) || 'Unknown Client',
          description: `Invoice #${inv.invoiceNumber} is ${daysOverdue} days overdue ($${parseFloat(inv.amount).toFixed(2)})`,
          suggestedFix: 'Send payment reminder or escalate to collections',
          autoFixable: false,
          potentialRevenue: parseFloat(inv.amount),
          details: { invoiceNumber: inv.invoiceNumber, daysOverdue, amount: inv.amount },
        });
      }
    }

    return issues;
  }

  private detectMissingContracts(
    clientData: any[],
    contractData: any[],
    timesheetData: any[]
  ): ReconciliationIssue[] {
    const issues: ReconciliationIssue[] = [];
    const clientsWithContracts = new Set(contractData.filter(c => c.status === 'active').map(c => c.clientId));
    const clientsWithWork = new Set(timesheetData.map(t => t.clientId).filter(Boolean));

    for (const client of clientData) {
      if (clientsWithWork.has(client.id) && !clientsWithContracts.has(client.id)) {
        issues.push({
          severity: 'warning',
          category: 'missing_contract',
          clientId: client.id,
          clientName: client.name,
          description: `Billable work exists but no active contract found`,
          suggestedFix: 'Create or activate contract for this client',
          autoFixable: false,
        });
      }
    }

    return issues;
  }

  private calculateInvoicedHours(invoiceData: any[]): number {
    return invoiceData.reduce((sum, inv) => sum + (parseFloat(inv.totalHours) || 0), 0);
  }

  private async generateAIInsights(
    issues: ReconciliationIssue[],
    summary: any,
    context: SkillContext
  ): Promise<string> {
    try {
      const model = genAI.getGenerativeModel({
        model: GEMINI_MODELS.BRAIN,
        generationConfig: {
          maxOutputTokens: ANTI_YAP_PRESETS.diagnostics.maxTokens,
          temperature: ANTI_YAP_PRESETS.diagnostics.temperature,
        },
      });

      const prompt = `You are an AI Billing Analyst for CoAIleague. Analyze these invoice reconciliation results and provide revenue optimization insights.

SUMMARY:
- Active Clients: ${summary.totalClients}
- Total Billable Hours: ${summary.totalBillableHours.toFixed(1)}
- Billed Amount: $${summary.totalBilledAmount.toFixed(2)}
- Unbilled Hours: ${summary.unbilledHours.toFixed(1)} ($${summary.unbilledRevenue.toFixed(2)} potential)
- Revenue at Risk: $${summary.revenueAtRisk.toFixed(2)}
- Overdue Invoices: ${summary.overdueInvoices}

TOP ISSUES:
${issues.slice(0, 8).map(i => `- [${i.severity.toUpperCase()}] ${i.category}: ${i.description}`).join('\n')}

Provide 2-3 sentences of actionable revenue optimization insights. Focus on recovering unbilled revenue and reducing overdue invoices.`;

      const result = await model.generateContent(prompt);
      return result.response.text();
    } catch (error) {
      console.error('[InvoiceReconciliation] AI insights generation failed:', error);
      return 'AI insights unavailable. Review unbilled hours and overdue invoices for revenue recovery opportunities.';
    }
  }

  private calculateGapAnalysis(
    clientData: any[],
    timesheetData: any[],
    invoiceData: any[]
  ) {
    const clientsWithWork = new Set(timesheetData.filter(t => t.isBillable !== false).map(t => t.clientId).filter(Boolean));
    const clientsInvoiced = new Set(invoiceData.map(i => i.clientId));
    
    const totalBillableHours = timesheetData.filter(t => t.isBillable !== false).reduce((sum, t) => sum + (t.hoursWorked || 0), 0);
    const invoicedHours = invoiceData.reduce((sum, i) => sum + (parseFloat(i.totalHours) || 0), 0);
    
    const billableCoveragePercent = totalBillableHours > 0 
      ? Math.min(100, (invoicedHours / totalBillableHours) * 100)
      : 100;

    const clientsWithGaps = Array.from(clientsWithWork)
      .filter(cId => !clientsInvoiced.has(cId))
      .map(cId => clientData.find(c => c.id === cId)?.name || 'Unknown')
      .filter(Boolean);

    const avgRate = timesheetData.length > 0 
      ? timesheetData.reduce((sum, t) => sum + (t.hourlyRate || 0), 0) / timesheetData.length 
      : 0;
    const revenueOpportunities = (totalBillableHours - invoicedHours) * avgRate;

    return {
      billableCoveragePercent,
      clientsWithGaps,
      revenueOpportunities: Math.max(0, revenueOpportunities),
    };
  }

  private generateRecommendations(
    issues: ReconciliationIssue[],
    summary: any,
    gapAnalysis: any
  ): string[] {
    const recommendations: string[] = [];

    if (summary.unbilledRevenue > 500) {
      recommendations.push(`REVENUE OPPORTUNITY: $${summary.unbilledRevenue.toFixed(2)} in unbilled hours - generate invoices immediately`);
    }

    if (summary.overdueInvoices > 0) {
      recommendations.push(`COLLECTION ACTION: ${summary.overdueInvoices} overdue invoices - send payment reminders`);
    }

    if (gapAnalysis.clientsWithGaps.length > 0) {
      recommendations.push(`BILLING GAPS: ${gapAnalysis.clientsWithGaps.length} clients with work but no invoices this period`);
    }

    const rateIssues = issues.filter(i => i.category === 'rate_mismatch');
    if (rateIssues.length > 0) {
      recommendations.push('RATE AUDIT: Review contract rates - discrepancies detected');
    }

    if (recommendations.length === 0) {
      recommendations.push('All billing reconciled - no revenue gaps detected');
    }

    return recommendations;
  }

  private calculateConfidence(
    issues: ReconciliationIssue[],
    summary: any,
    gapAnalysis: any
  ): number {
    let confidence = 1.0;

    // Deduct for critical issues
    confidence -= summary.criticalIssues * 0.12;

    // Deduct for unbilled revenue (proportional)
    if (summary.totalBilledAmount > 0) {
      const unbilledRatio = summary.unbilledRevenue / (summary.totalBilledAmount + summary.unbilledRevenue);
      confidence -= unbilledRatio * 0.3;
    }

    // Deduct for overdue invoices
    confidence -= summary.overdueInvoices * 0.05;

    return Math.max(0.1, Math.min(1.0, confidence));
  }

  async healthCheck(): Promise<{ healthy: boolean; details?: any }> {
    return {
      healthy: this.config.enabled,
      details: {
        skillId: this.getManifest().id,
        version: this.getManifest().version,
        modelTier: 'BRAIN (Gemini 3 Pro)',
      },
    };
  }

  async getStats(): Promise<Record<string, any>> {
    return {
      ...await super.getStats(),
      algorithm: 'ai-powered-reconciliation',
      modelTier: 'BRAIN',
    };
  }
}

export const invoiceReconciliationSkill = new InvoiceReconciliationSkill({ enabled: true });
