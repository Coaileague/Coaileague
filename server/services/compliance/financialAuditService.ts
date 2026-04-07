/**
 * SOX-Compliant Financial Audit Service
 * Fortune 500-Grade Audit Trail for Financial Operations
 * 
 * Features:
 * - Immutable audit trail for all financial transactions
 * - Before/After snapshots for every change
 * - Segregation of duties tracking
 * - Automated compliance reports
 * - Tamper-evident logging with checksums
 */

import crypto from 'crypto';
import { db } from '../../db';
import { auditLogs, invoices, payrollRuns } from '@shared/schema';
import { eq, and, gte, lte, desc } from 'drizzle-orm';
import { auditLogger } from '../audit-logger';
import { createLogger } from '../../lib/logger';
const log = createLogger('financialAuditService');


export type FinancialEventType = 
  | 'INVOICE_CREATED'
  | 'INVOICE_MODIFIED'
  | 'INVOICE_VOIDED'
  | 'INVOICE_PAID'
  | 'PAYROLL_CREATED'
  | 'PAYROLL_APPROVED'
  | 'PAYROLL_PROCESSED'
  | 'PAYROLL_MODIFIED'
  | 'PAYMENT_RECEIVED'
  | 'PAYMENT_REFUNDED'
  | 'RATE_CHANGED'
  | 'CREDIT_ADJUSTMENT'
  | 'TAX_CALCULATED'
  | 'QUICKBOOKS_SYNC';

export interface FinancialAuditEntry {
  id: string;
  eventType: FinancialEventType;
  entityType: 'INVOICE' | 'PAYROLL' | 'PAYMENT' | 'CREDIT' | 'TAX';
  entityId: string;
  workspaceId: string;
  actorId: string;
  actorType: 'USER' | 'SYSTEM' | 'AI' | 'INTEGRATION';
  actorName: string;
  before: Record<string, any> | null;
  after: Record<string, any>;
  monetaryImpact: {
    amount: number;
    currency: string;
    direction: 'credit' | 'debit' | 'neutral';
  };
  approvals: Array<{
    approverId: string;
    approverName: string;
    approvedAt: Date;
    level: number;
  }>;
  checksum: string;
  previousChecksum: string | null;
  createdAt: Date;
  metadata: Record<string, any>;
}

interface ComplianceReport {
  reportId: string;
  reportType: 'daily' | 'weekly' | 'monthly' | 'quarterly';
  periodStart: Date;
  periodEnd: Date;
  workspaceId: string;
  generatedAt: Date;
  generatedBy: string;
  summary: {
    totalTransactions: number;
    totalInvoiced: number;
    totalPaid: number;
    totalPayrollProcessed: number;
    anomaliesDetected: number;
    segregationViolations: number;
  };
  details: FinancialAuditEntry[];
  checksum: string;
}

class FinancialAuditService {
  private lastChecksum: Map<string, string> = new Map();
  private initialized: boolean = false;

  constructor() {
    log.info('[FinancialAudit] SOX-compliant audit service initialized');
  }

  private async loadLastChecksum(chainKey: string): Promise<string | null> {
    const [workspaceId, entityType] = chainKey.split(':');
    
    try {
      const latestEvents = await db.select()
        .from(auditLogs)
        .where(
          and(
            eq(auditLogs.workspaceId, workspaceId),
            eq(auditLogs.entityType, entityType),
            gte(auditLogs.createdAt, new Date(Date.now() - 365 * 24 * 60 * 60 * 1000))
          )
        )
        .orderBy(desc(auditLogs.createdAt))
        .limit(1);

      if (latestEvents.length > 0) {
        const payload = latestEvents[0].payload as any;
        return payload?.checksum || latestEvents[0].actionHash || null;
      }
    } catch (error) {
      log.error('[FinancialAudit] Error loading last checksum:', error);
    }
    
    return null;
  }

  private generateChecksum(entry: Partial<FinancialAuditEntry>, previousChecksum: string | null): string {
    const hashInput = JSON.stringify({
      eventType: entry.eventType,
      entityId: entry.entityId,
      actorId: entry.actorId,
      before: entry.before,
      after: entry.after,
      monetaryImpact: entry.monetaryImpact,
      previousChecksum,
      timestamp: entry.createdAt?.toISOString(),
    });
    
    return crypto.createHash('sha256').update(hashInput).digest('hex');
  }

  async logFinancialEvent(
    event: {
      eventType: FinancialEventType;
      entityType: FinancialAuditEntry['entityType'];
      entityId: string;
      workspaceId: string;
      actorId: string;
      actorType: FinancialAuditEntry['actorType'];
      actorName: string;
      before?: Record<string, any> | null;
      after: Record<string, any>;
      monetaryImpact: FinancialAuditEntry['monetaryImpact'];
      metadata?: Record<string, any>;
    }
  ): Promise<string> {
    const chainKey = `${event.workspaceId}:${event.entityType}`;
    
    let previousChecksum = this.lastChecksum.get(chainKey);
    if (previousChecksum === undefined) {
      previousChecksum = await this.loadLastChecksum(chainKey) || null;
      if (previousChecksum) {
        this.lastChecksum.set(chainKey, previousChecksum);
      }
    }
    
    const entryData: Partial<FinancialAuditEntry> = {
      ...event,
      before: event.before || null,
      approvals: [],
      createdAt: new Date(),
      metadata: event.metadata || {},
    };

    const checksum = this.generateChecksum(entryData, previousChecksum);

    const eventId = await auditLogger.logEvent(
      {
        actorId: event.actorId,
        actorType: event.actorType === 'USER' ? 'END_USER' : 
                   event.actorType === 'AI' ? 'AI_AGENT' : 'SYSTEM',
        actorName: event.actorName,
        workspaceId: event.workspaceId,
      },
      {
        eventType: `FINANCIAL_${event.eventType}`,
        aggregateId: event.entityId,
        aggregateType: event.entityType,
        payload: {
          before: event.before,
          after: event.after,
          monetaryImpact: event.monetaryImpact,
          checksum,
          previousChecksum,
          ...event.metadata,
        },
        changes: event.before ? { before: event.before, after: event.after } : undefined,
      },
      { generateHash: true, autoCommit: true }
    );

    this.lastChecksum.set(chainKey, checksum);

    log.info(`[FinancialAudit] Logged ${event.eventType} for ${event.entityType}:${event.entityId}`);

    return eventId;
  }

  async logInvoiceEvent(
    invoice: any,
    eventType: 'INVOICE_CREATED' | 'INVOICE_MODIFIED' | 'INVOICE_VOIDED' | 'INVOICE_PAID',
    actor: { id: string; name: string; type: FinancialAuditEntry['actorType'] },
    before?: any
  ): Promise<string> {
    return this.logFinancialEvent({
      eventType,
      entityType: 'INVOICE',
      entityId: invoice.id,
      workspaceId: invoice.workspaceId,
      actorId: actor.id,
      actorType: actor.type,
      actorName: actor.name,
      before,
      after: {
        invoiceNumber: invoice.invoiceNumber,
        clientId: invoice.clientId,
        totalAmount: invoice.totalAmount ?? invoice.total,
        status: invoice.status,
        dueDate: invoice.dueDate,
      },
      monetaryImpact: {
        amount: parseFloat(invoice.totalAmount ?? invoice.total ?? '0'),
        currency: invoice.currency || 'USD',
        direction: eventType === 'INVOICE_VOIDED' ? 'debit' : 
                   eventType === 'INVOICE_PAID' ? 'credit' : 'neutral',
      },
      metadata: {
        lineItemCount: invoice.lineItems?.length || 0,
      },
    });
  }

  async logPayrollEvent(
    payroll: any,
    eventType: 'PAYROLL_CREATED' | 'PAYROLL_APPROVED' | 'PAYROLL_PROCESSED' | 'PAYROLL_MODIFIED',
    actor: { id: string; name: string; type: FinancialAuditEntry['actorType'] },
    before?: any
  ): Promise<string> {
    return this.logFinancialEvent({
      eventType,
      entityType: 'PAYROLL',
      entityId: payroll.id,
      workspaceId: payroll.workspaceId,
      actorId: actor.id,
      actorType: actor.type,
      actorName: actor.name,
      before,
      after: {
        payPeriodStart: payroll.payPeriodStart,
        payPeriodEnd: payroll.payPeriodEnd,
        grossPay: payroll.grossPay,
        netPay: payroll.netPay,
        employeeCount: payroll.employeeCount,
        status: payroll.status,
      },
      monetaryImpact: {
        amount: parseFloat(payroll.grossPay || '0'),
        currency: payroll.currency || 'USD',
        direction: 'debit',
      },
      metadata: {
        employeeCount: payroll.employeeCount,
        deductionsTotal: payroll.deductionsTotal,
        taxesTotal: payroll.taxesTotal,
      },
    });
  }

  async logQuickBooksSyncEvent(
    syncResult: {
      workspaceId: string;
      entityType: 'INVOICE' | 'PAYMENT' | 'CUSTOMER';
      syncedCount: number;
      failedCount: number;
      details: any;
    },
    actor: { id: string; name: string; type: FinancialAuditEntry['actorType'] }
  ): Promise<string> {
    return this.logFinancialEvent({
      eventType: 'QUICKBOOKS_SYNC',
      entityType: 'INVOICE',
      entityId: `sync-${Date.now()}`,
      workspaceId: syncResult.workspaceId,
      actorId: actor.id,
      actorType: actor.type,
      actorName: actor.name,
      after: {
        entityType: syncResult.entityType,
        syncedCount: syncResult.syncedCount,
        failedCount: syncResult.failedCount,
        syncedAt: new Date().toISOString(),
      },
      monetaryImpact: {
        amount: 0,
        currency: 'USD',
        direction: 'neutral',
      },
      metadata: syncResult.details,
    });
  }

  async checkSegregationOfDuties(
    workspaceId: string,
    entityId: string,
    actorId: string,
    actionType: 'create' | 'approve' | 'process'
  ): Promise<{ allowed: boolean; violations: string[] }> {
    const violations: string[] = [];

    try {
      const recentEvents = await db.select()
        .from(auditLogs)
        .where(
          and(
            eq(auditLogs.workspaceId, workspaceId),
            eq(auditLogs.entityId, entityId),
            gte(auditLogs.createdAt, new Date(Date.now() - 30 * 24 * 60 * 60 * 1000))
          )
        )
        .orderBy(desc(auditLogs.createdAt))
        .limit(50);

      const creatorId = recentEvents.find(e => 
        e.eventType.includes('CREATED')
      )?.actorId;

      const approverId = recentEvents.find(e => 
        e.eventType.includes('APPROVED')
      )?.actorId;

      if (actionType === 'approve' && creatorId === actorId) {
        violations.push('SOD-001: Cannot approve own creation');
      }

      if (actionType === 'process' && (creatorId === actorId || approverId === actorId)) {
        violations.push('SOD-002: Processor must be different from creator and approver');
      }

      if (actionType === 'approve' && recentEvents.filter(e => 
        e.eventType.includes('APPROVED') && e.actorId === actorId
      ).length >= 10) {
        violations.push('SOD-003: Approval concentration detected - consider rotation');
      }

    } catch (error) {
      log.error('[FinancialAudit] Segregation check error:', error);
    }

    return {
      allowed: violations.length === 0,
      violations,
    };
  }

  async generateComplianceReport(
    workspaceId: string,
    periodStart: Date,
    periodEnd: Date,
    generatedBy: string
  ): Promise<ComplianceReport> {
    const events = await db.select()
      .from(auditLogs)
      .where(
        and(
          eq(auditLogs.workspaceId, workspaceId),
          gte(auditLogs.createdAt, periodStart),
          lte(auditLogs.createdAt, periodEnd)
        )
      )
      .orderBy(auditLogs.createdAt);

    const financialEvents = events.filter(e => 
      e.eventType.startsWith('FINANCIAL_')
    );

    let totalInvoiced = 0;
    let totalPaid = 0;
    let totalPayrollProcessed = 0;
    let anomaliesDetected = 0;
    let segregationViolations = 0;

    for (const event of financialEvents) {
      const payload = event.payload as any;
      const amount = payload?.monetaryImpact?.amount || 0;

      if (event.eventType.includes('INVOICE_CREATED')) {
        totalInvoiced += amount;
      } else if (event.eventType.includes('INVOICE_PAID')) {
        totalPaid += amount;
      } else if (event.eventType.includes('PAYROLL_PROCESSED')) {
        totalPayrollProcessed += amount;
      }

      if (payload?.anomaly) {
        anomaliesDetected++;
      }
      if (payload?.segregationViolation) {
        segregationViolations++;
      }
    }

    const reportId = `compliance-${workspaceId}-${Date.now()}`;
    const report: ComplianceReport = {
      reportId,
      reportType: this.determineReportType(periodStart, periodEnd),
      periodStart,
      periodEnd,
      workspaceId,
      generatedAt: new Date(),
      generatedBy,
      summary: {
        totalTransactions: financialEvents.length,
        totalInvoiced,
        totalPaid,
        totalPayrollProcessed,
        anomaliesDetected,
        segregationViolations,
      },
      details: financialEvents.map(e => ({
        id: e.id,
        eventType: e.eventType.replace('FINANCIAL_', '') as FinancialEventType,
        entityType: e.aggregateType as any,
        entityId: e.aggregateId,
        workspaceId: e.workspaceId || '',
        actorId: e.actorId,
        actorType: e.actorType as any,
        actorName: e.actorName || 'Unknown',
        before: (e.changes as any)?.before || null,
        after: e.payload as any,
        monetaryImpact: (e.payload as any)?.monetaryImpact || { amount: 0, currency: 'USD', direction: 'neutral' },
        approvals: [],
        checksum: e.actionHash || '',
        previousChecksum: null,
        createdAt: e.createdAt,
        metadata: {},
      })),
      checksum: '',
    };

    report.checksum = crypto
      .createHash('sha256')
      .update(JSON.stringify(report.summary) + JSON.stringify(report.details.map(d => d.checksum)))
      .digest('hex');

    await auditLogger.logSystemAction({
      actionType: 'COMPLIANCE_REPORT_GENERATED',
      targetEntityType: 'COMPLIANCE_REPORT',
      targetEntityId: reportId,
      payload: {
        reportType: report.reportType,
        periodStart: periodStart.toISOString(),
        periodEnd: periodEnd.toISOString(),
        transactionCount: report.summary.totalTransactions,
        generatedBy,
      },
      workspaceId,
    });

    return report;
  }

  private determineReportType(start: Date, end: Date): ComplianceReport['reportType'] {
    const days = (end.getTime() - start.getTime()) / (24 * 60 * 60 * 1000);
    
    if (days <= 1) return 'daily';
    if (days <= 7) return 'weekly';
    if (days <= 31) return 'monthly';
    return 'quarterly';
  }

  async verifyAuditChainIntegrity(
    workspaceId: string,
    entityType: string,
    startDate?: Date
  ): Promise<{ valid: boolean; brokenLinks: string[] }> {
    const brokenLinks: string[] = [];

    try {
      const events = await db.select()
        .from(auditLogs)
        .where(
          and(
            eq(auditLogs.workspaceId, workspaceId),
            eq(auditLogs.entityType, entityType),
            startDate ? gte(auditLogs.createdAt, startDate) : undefined
          )
        )
        .orderBy(auditLogs.createdAt);

      let previousChecksum: string | null = null;

      for (const event of events) {
        const payload = event.payload as any;
        const storedPreviousChecksum = payload?.previousChecksum;

        if (storedPreviousChecksum !== previousChecksum) {
          brokenLinks.push(event.id);
        }

        previousChecksum = payload?.checksum || event.actionHash;
      }
    } catch (error) {
      log.error('[FinancialAudit] Chain verification error:', error);
    }

    return {
      valid: brokenLinks.length === 0,
      brokenLinks,
    };
  }
}

export const financialAuditService = new FinancialAuditService();
