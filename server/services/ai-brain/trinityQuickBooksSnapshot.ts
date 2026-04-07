/**
 * TRINITY QUICKBOOKS FINANCIAL SNAPSHOT SERVICE
 * ==============================================
 * Provides real-time financial intelligence to Trinity for business diagnostics
 * and recommendations. Aggregates QuickBooks data, platform metrics, and sync
 * status into actionable insights.
 * 
 * Features:
 * - AR aging buckets (0-30, 31-60, 61-90, 90+ days)
 * - Overdue invoice tracking with client details
 * - Platform Hours vs Invoice Hours reconciliation
 * - Revenue trends and forecasting signals
 * - QuickBooks sync health monitoring
 * - Employee/contractor sync status
 */

import { db } from '../../db';
import { eq, and, gte, lte, desc, sql, isNotNull, lt } from 'drizzle-orm';
import {
  invoices,
  clients,
  employees,
  timeEntries,
  partnerConnections,
  quickbooksSyncReceipts,
} from '@shared/schema';
import { TTLCache } from './cacheUtils';
import { createLogger } from '../../lib/logger';
const log = createLogger('trinityQuickBooksSnapshot');

export interface ARAgingBucket {
  bucket: '0-30' | '31-60' | '61-90' | '90+';
  invoiceCount: number;
  totalAmount: number;
  percentage: number;
}

export interface OverdueInvoice {
  invoiceId: string;
  clientName: string;
  amount: number;
  dueDate: Date;
  daysOverdue: number;
  lastContactDate?: Date;
}

export interface HoursReconciliation {
  platformHours: number;
  invoicedHours: number;
  variance: number;
  variancePercentage: number;
  status: 'OK' | 'ALERT' | 'CRITICAL';
  trinityVerified: boolean;
}

export interface SyncHealthSummary {
  lastSuccessfulSync?: Date;
  connectionStatus: 'connected' | 'disconnected' | 'expired' | 'error';
  pendingSyncCount: number;
  errorCount: number;
  recentErrors: string[];
}

export interface RevenueSignals {
  monthlyRevenue: number;
  monthlyTarget?: number;
  percentToTarget?: number;
  yearToDateRevenue: number;
  paidThisMonth: number;
  outstandingTotal: number;
  averagePaymentDays: number;
}

export interface EmployeeSyncStatus {
  totalEmployees: number;
  syncedToQB: number;
  pendingSync: number;
  syncErrors: number;
  lastSyncTime?: Date;
}

export interface QuickBooksFinancialSnapshot {
  timestamp: Date;
  workspaceId: string;
  connectionStatus: 'connected' | 'disconnected' | 'expired' | 'error' | 'not_configured';
  
  arAging: ARAgingBucket[];
  overdueInvoices: OverdueInvoice[];
  hoursReconciliation: HoursReconciliation;
  revenueSignals: RevenueSignals;
  syncHealth: SyncHealthSummary;
  employeeSync: EmployeeSyncStatus;
  
  trinityInsights: string[];
  alerts: TrinityFinancialAlert[];
}

export interface TrinityFinancialAlert {
  severity: 'info' | 'warning' | 'critical';
  category: 'ar_aging' | 'sync' | 'reconciliation' | 'revenue' | 'compliance';
  message: string;
  actionSuggestion?: string;
}

class TrinityQuickBooksSnapshotService {
  private snapshotCache = new TTLCache<string, QuickBooksFinancialSnapshot>(5 * 60 * 1000, 100); // 5 minute cache
  
  shutdown(): void {
    this.snapshotCache.shutdown();
  }
  
  async getFinancialSnapshot(workspaceId: string): Promise<QuickBooksFinancialSnapshot> {
    const cached = this.snapshotCache.get(workspaceId);
    if (cached) {
      return cached;
    }
    
    const snapshot = await this.buildSnapshot(workspaceId);
    this.snapshotCache.set(workspaceId, snapshot);
    return snapshot;
  }
  
  private async buildSnapshot(workspaceId: string): Promise<QuickBooksFinancialSnapshot> {
    const now = new Date();
    
    const [
      connectionStatus,
      arAging,
      overdueInvoices,
      hoursReconciliation,
      revenueSignals,
      syncHealth,
      employeeSync,
    ] = await Promise.all([
      this.getConnectionStatus(workspaceId),
      this.getARAgingBuckets(workspaceId),
      this.getOverdueInvoices(workspaceId),
      this.getHoursReconciliation(workspaceId),
      this.getRevenueSignals(workspaceId),
      this.getSyncHealth(workspaceId),
      this.getEmployeeSyncStatus(workspaceId),
    ]);
    
    const alerts = this.generateAlerts(arAging, overdueInvoices, hoursReconciliation, syncHealth);
    const insights = this.generateInsights(arAging, revenueSignals, hoursReconciliation, connectionStatus);
    
    return {
      timestamp: now,
      workspaceId,
      connectionStatus,
      arAging,
      overdueInvoices,
      hoursReconciliation,
      revenueSignals,
      syncHealth,
      employeeSync,
      trinityInsights: insights,
      alerts,
    };
  }
  
  private async getConnectionStatus(workspaceId: string): Promise<QuickBooksFinancialSnapshot['connectionStatus']> {
    try {
      const [connection] = await db
        .select({ status: partnerConnections.status })
        .from(partnerConnections)
        .where(and(
          eq(partnerConnections.workspaceId, workspaceId),
          eq(partnerConnections.partnerType, 'quickbooks')
        ))
        .limit(1);
      
      if (!connection) return 'not_configured';
      return connection.status as QuickBooksFinancialSnapshot['connectionStatus'];
    } catch {
      return 'not_configured';
    }
  }
  
  private async getARAgingBuckets(workspaceId: string): Promise<ARAgingBucket[]> {
    try {
      const now = new Date();
      const buckets: ARAgingBucket[] = [];
      
      const arData = await db
        .select({
          dueDate: invoices.dueDate,
          amount: invoices.total,
        })
        .from(invoices)
        .where(and(
          eq(invoices.workspaceId, workspaceId),
          sql`status IN ('sent', 'pending', 'overdue')`,
          isNotNull(invoices.dueDate)
        ));
      
      const bucket0_30 = { bucket: '0-30' as const, invoiceCount: 0, totalAmount: 0, percentage: 0 };
      const bucket31_60 = { bucket: '31-60' as const, invoiceCount: 0, totalAmount: 0, percentage: 0 };
      const bucket61_90 = { bucket: '61-90' as const, invoiceCount: 0, totalAmount: 0, percentage: 0 };
      const bucket90Plus = { bucket: '90+' as const, invoiceCount: 0, totalAmount: 0, percentage: 0 };
      
      let totalAR = 0;
      
      for (const invoice of arData) {
        if (!invoice.dueDate) continue;
        const daysOverdue = Math.floor((now.getTime() - new Date(invoice.dueDate).getTime()) / (1000 * 60 * 60 * 24));
        const amount = Number(invoice.amount) || 0;
        totalAR += amount;
        
        if (daysOverdue <= 30) {
          bucket0_30.invoiceCount++;
          bucket0_30.totalAmount += amount;
        } else if (daysOverdue <= 60) {
          bucket31_60.invoiceCount++;
          bucket31_60.totalAmount += amount;
        } else if (daysOverdue <= 90) {
          bucket61_90.invoiceCount++;
          bucket61_90.totalAmount += amount;
        } else {
          bucket90Plus.invoiceCount++;
          bucket90Plus.totalAmount += amount;
        }
      }
      
      if (totalAR > 0) {
        bucket0_30.percentage = (bucket0_30.totalAmount / totalAR) * 100;
        bucket31_60.percentage = (bucket31_60.totalAmount / totalAR) * 100;
        bucket61_90.percentage = (bucket61_90.totalAmount / totalAR) * 100;
        bucket90Plus.percentage = (bucket90Plus.totalAmount / totalAR) * 100;
      }
      
      return [bucket0_30, bucket31_60, bucket61_90, bucket90Plus];
    } catch (error) {
      log.error('[TrinityQBSnapshot] AR aging error:', error);
      return [];
    }
  }
  
  private async getOverdueInvoices(workspaceId: string): Promise<OverdueInvoice[]> {
    try {
      const now = new Date();
      
      const overdueData = await db
        .select({
          invoiceId: invoices.id,
          amount: invoices.total,
          dueDate: invoices.dueDate,
          clientId: invoices.clientId,
        })
        .from(invoices)
        .where(and(
          eq(invoices.workspaceId, workspaceId),
          eq(invoices.status, 'overdue'),
          lt(invoices.dueDate, now)
        ))
        .orderBy(invoices.dueDate)
        .limit(10);
      
      const result: OverdueInvoice[] = [];
      
      for (const inv of overdueData) {
        let clientName = 'Unknown Client';
        if (inv.clientId) {
          const [client] = await db
            .select({ name: clients.companyName })
            .from(clients)
            .where(eq(clients.id, inv.clientId))
            .limit(1);
          if (client) clientName = client.companyName || `${client.firstName || ""} ${client.lastName || ""}`.trim() || "Unknown";
        }
        
        const daysOverdue = inv.dueDate 
          ? Math.floor((now.getTime() - new Date(inv.dueDate).getTime()) / (1000 * 60 * 60 * 24))
          : 0;
        
        result.push({
          invoiceId: inv.invoiceId,
          clientName,
          amount: Number(inv.amount) || 0,
          dueDate: inv.dueDate!,
          daysOverdue,
        });
      }
      
      return result;
    } catch (error) {
      log.error('[TrinityQBSnapshot] Overdue invoices error:', error);
      return [];
    }
  }
  
  private async getHoursReconciliation(workspaceId: string): Promise<HoursReconciliation> {
    try {
      const now = new Date();
      const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
      
      const [platformHoursResult] = await db
        .select({
          totalHours: sql<number>`COALESCE(SUM(CAST(total_hours AS DECIMAL)), 0)`,
        })
        .from(timeEntries)
        .where(and(
          eq(timeEntries.workspaceId, workspaceId),
          gte(timeEntries.clockIn, startOfMonth),
          eq(timeEntries.status, 'approved')
        ));
      
      const [invoicedHoursResult] = await db
        .select({
          totalHours: sql<number>`COALESCE(SUM(CAST(total_hours AS DECIMAL)), 0)`,
        })
        .from(timeEntries)
        .where(and(
          eq(timeEntries.workspaceId, workspaceId),
          gte(timeEntries.clockIn, startOfMonth),
          isNotNull(timeEntries.invoiceId)
        ));
      
      const platformHours = Number(platformHoursResult?.totalHours) || 0;
      const invoicedHours = Number(invoicedHoursResult?.totalHours) || 0;
      const variance = platformHours - invoicedHours;
      const variancePercentage = platformHours > 0 ? (variance / platformHours) * 100 : 0;
      
      let status: HoursReconciliation['status'] = 'OK';
      if (Math.abs(variancePercentage) > 10) {
        status = 'CRITICAL';
      } else if (Math.abs(variancePercentage) > 5) {
        status = 'ALERT';
      }
      
      return {
        platformHours,
        invoicedHours,
        variance,
        variancePercentage,
        status,
        trinityVerified: status === 'OK',
      };
    } catch (error) {
      log.error('[TrinityQBSnapshot] Hours reconciliation error:', error);
      return {
        platformHours: 0,
        invoicedHours: 0,
        variance: 0,
        variancePercentage: 0,
        status: 'OK',
        trinityVerified: false,
      };
    }
  }
  
  private async getRevenueSignals(workspaceId: string): Promise<RevenueSignals> {
    try {
      const now = new Date();
      const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
      const startOfYear = new Date(now.getFullYear(), 0, 1);
      
      const [monthlyStats] = await db
        .select({
          totalRevenue: sql<number>`COALESCE(SUM(CAST(total AS DECIMAL)), 0)`,
          paidAmount: sql<number>`COALESCE(SUM(CASE WHEN status = 'paid' THEN CAST(total AS DECIMAL) ELSE 0 END), 0)`,
        })
        .from(invoices)
        .where(and(
          eq(invoices.workspaceId, workspaceId),
          gte(invoices.issueDate, startOfMonth)
        ));
      
      const [ytdStats] = await db
        .select({
          totalRevenue: sql<number>`COALESCE(SUM(CAST(total AS DECIMAL)), 0)`,
        })
        .from(invoices)
        .where(and(
          eq(invoices.workspaceId, workspaceId),
          gte(invoices.issueDate, startOfYear),
          eq(invoices.status, 'paid')
        ));
      
      const [outstandingStats] = await db
        .select({
          total: sql<number>`COALESCE(SUM(CAST(total AS DECIMAL)), 0)`,
        })
        .from(invoices)
        .where(and(
          eq(invoices.workspaceId, workspaceId),
          sql`status IN ('sent', 'pending', 'overdue')`
        ));
      
      return {
        monthlyRevenue: Number(monthlyStats?.totalRevenue) || 0,
        yearToDateRevenue: Number(ytdStats?.totalRevenue) || 0,
        paidThisMonth: Number(monthlyStats?.paidAmount) || 0,
        outstandingTotal: Number(outstandingStats?.total) || 0,
        averagePaymentDays: 0, // Would need payment history to calculate
      };
    } catch (error) {
      log.error('[TrinityQBSnapshot] Revenue signals error:', error);
      return {
        monthlyRevenue: 0,
        yearToDateRevenue: 0,
        paidThisMonth: 0,
        outstandingTotal: 0,
        averagePaymentDays: 0,
      };
    }
  }
  
  private async getSyncHealth(workspaceId: string): Promise<SyncHealthSummary> {
    try {
      const [connection] = await db
        .select({
          status: partnerConnections.status,
          lastSyncAt: partnerConnections.lastSyncAt,
          lastError: partnerConnections.lastError,
          lastErrorAt: partnerConnections.lastErrorAt,
        })
        .from(partnerConnections)
        .where(and(
          eq(partnerConnections.workspaceId, workspaceId),
          eq(partnerConnections.partnerType, 'quickbooks')
        ))
        .limit(1);
      
      if (!connection) {
        return {
          connectionStatus: 'disconnected',
          pendingSyncCount: 0,
          errorCount: 0,
          recentErrors: [],
        };
      }
      
      const recentLogs = await db
        .select({
          status: partnerSyncLogs.status,
          errorMessage: partnerSyncLogs.errorMessage,
        })
        .from(partnerSyncLogs)
        .where(eq(partnerSyncLogs.workspaceId, workspaceId))
        .orderBy(desc(partnerSyncLogs.createdAt))
        .limit(10);
      
      const recentErrors = recentLogs
        .filter(log => log.status === 'error' && log.errorMessage)
        .map(log => log.errorMessage!)
        .slice(0, 3);
      
      return {
        lastSuccessfulSync: connection.lastSyncAt || undefined,
        connectionStatus: connection.status as SyncHealthSummary['connectionStatus'],
        pendingSyncCount: 0, // Would need to count pending sync items
        errorCount: recentLogs.filter(log => log.status === 'error').length,
        recentErrors,
      };
    } catch (error) {
      log.error('[TrinityQBSnapshot] Sync health error:', error);
      return {
        connectionStatus: 'error',
        pendingSyncCount: 0,
        errorCount: 0,
        recentErrors: [],
      };
    }
  }
  
  private async getEmployeeSyncStatus(workspaceId: string): Promise<EmployeeSyncStatus> {
    try {
      const stats = await db
        .select({
          total: sql<number>`COUNT(*)`,
          synced: sql<number>`COUNT(CASE WHEN quickbooks_employee_id IS NOT NULL THEN 1 END)`,
          pending: sql<number>`COUNT(CASE WHEN quickbooks_sync_status = 'pending' THEN 1 END)`,
          errors: sql<number>`COUNT(CASE WHEN quickbooks_sync_status = 'error' THEN 1 END)`,
          lastSync: sql<Date>`MAX(quickbooks_last_sync)`,
        })
        .from(employees)
        .where(eq(employees.workspaceId, workspaceId));
      
      return {
        totalEmployees: Number(stats[0]?.total) || 0,
        syncedToQB: Number(stats[0]?.synced) || 0,
        pendingSync: Number(stats[0]?.pending) || 0,
        syncErrors: Number(stats[0]?.errors) || 0,
        lastSyncTime: stats[0]?.lastSync || undefined,
      };
    } catch (error) {
      log.error('[TrinityQBSnapshot] Employee sync status error:', error);
      return {
        totalEmployees: 0,
        syncedToQB: 0,
        pendingSync: 0,
        syncErrors: 0,
      };
    }
  }
  
  private generateAlerts(
    arAging: ARAgingBucket[],
    overdueInvoices: OverdueInvoice[],
    hoursReconciliation: HoursReconciliation,
    syncHealth: SyncHealthSummary
  ): TrinityFinancialAlert[] {
    const alerts: TrinityFinancialAlert[] = [];
    
    const bucket90Plus = arAging.find(b => b.bucket === '90+');
    if (bucket90Plus && bucket90Plus.totalAmount > 0) {
      alerts.push({
        severity: 'critical',
        category: 'ar_aging',
        message: `${this.formatCurrency(bucket90Plus.totalAmount)} in invoices are 90+ days overdue across ${bucket90Plus.invoiceCount} invoices`,
        actionSuggestion: 'Consider escalating collection efforts or reviewing client payment terms',
      });
    }
    
    const bucket61_90 = arAging.find(b => b.bucket === '61-90');
    if (bucket61_90 && bucket61_90.totalAmount > 1000) {
      alerts.push({
        severity: 'warning',
        category: 'ar_aging',
        message: `${this.formatCurrency(bucket61_90.totalAmount)} in invoices are 61-90 days overdue`,
        actionSuggestion: 'Send reminder notices to prevent further aging',
      });
    }
    
    if (hoursReconciliation.status === 'CRITICAL') {
      alerts.push({
        severity: 'critical',
        category: 'reconciliation',
        message: `Hours variance of ${hoursReconciliation.variancePercentage.toFixed(1)}% detected (${hoursReconciliation.platformHours.toFixed(1)} platform hours vs ${hoursReconciliation.invoicedHours.toFixed(1)} invoiced)`,
        actionSuggestion: 'Review unbilled time entries and ensure all billable hours are invoiced',
      });
    } else if (hoursReconciliation.status === 'ALERT') {
      alerts.push({
        severity: 'warning',
        category: 'reconciliation',
        message: `Hours variance of ${hoursReconciliation.variancePercentage.toFixed(1)}% detected`,
        actionSuggestion: 'Check for time entries that may not have been billed',
      });
    }
    
    if (syncHealth.connectionStatus === 'expired') {
      alerts.push({
        severity: 'critical',
        category: 'sync',
        message: 'QuickBooks connection has expired',
        actionSuggestion: 'Reauthorize QuickBooks to restore sync functionality',
      });
    } else if (syncHealth.connectionStatus === 'error') {
      alerts.push({
        severity: 'warning',
        category: 'sync',
        message: 'QuickBooks sync is experiencing errors',
        actionSuggestion: 'Check sync logs and retry failed operations',
      });
    }
    
    if (syncHealth.errorCount >= 5) {
      alerts.push({
        severity: 'warning',
        category: 'sync',
        message: `${syncHealth.errorCount} sync errors in recent operations`,
        actionSuggestion: 'Review sync logs to identify recurring issues',
      });
    }
    
    return alerts;
  }
  
  private generateInsights(
    arAging: ARAgingBucket[],
    revenueSignals: RevenueSignals,
    hoursReconciliation: HoursReconciliation,
    connectionStatus: QuickBooksFinancialSnapshot['connectionStatus']
  ): string[] {
    const insights: string[] = [];
    
    if (connectionStatus === 'connected') {
      insights.push('QuickBooks is connected and syncing data in real-time');
    }
    
    const totalAR = arAging.reduce((sum, b) => sum + b.totalAmount, 0);
    if (totalAR > 0) {
      const current = arAging.find(b => b.bucket === '0-30');
      if (current && current.percentage > 70) {
        insights.push(`Strong AR health: ${current.percentage.toFixed(0)}% of receivables are current (under 30 days)`);
      }
    }
    
    if (revenueSignals.monthlyRevenue > 0 && revenueSignals.paidThisMonth > 0) {
      const collectionRate = (revenueSignals.paidThisMonth / revenueSignals.monthlyRevenue) * 100;
      if (collectionRate > 80) {
        insights.push(`Excellent collection rate this month: ${collectionRate.toFixed(0)}%`);
      }
    }
    
    if (hoursReconciliation.trinityVerified) {
      insights.push('Platform hours match invoiced hours - billing is accurate');
    }
    
    if (revenueSignals.yearToDateRevenue > 0) {
      insights.push(`Year-to-date revenue: ${this.formatCurrency(revenueSignals.yearToDateRevenue)}`);
    }
    
    return insights;
  }
  
  private formatCurrency(amount: number): string {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
    }).format(amount);
  }
  
  /**
   * Format snapshot for Trinity with optional character limit to prevent
   * exceeding Gemini's system prompt size limits (~30K tokens).
   * Default limit is 4000 characters for safety.
   */
  formatSnapshotForTrinity(snapshot: QuickBooksFinancialSnapshot, maxChars: number = 4000): string {
    const lines: string[] = [];
    
    lines.push(`## QuickBooks Financial Snapshot (${snapshot.timestamp.toLocaleString()})`);
    lines.push(`**Connection Status:** ${snapshot.connectionStatus}`);
    lines.push('');
    
    // Alerts are highest priority - always include critical/warning
    if (snapshot.alerts.length > 0) {
      lines.push('### Alerts');
      const criticalAlerts = snapshot.alerts.filter(a => a.severity === 'critical' || a.severity === 'warning');
      for (const alert of criticalAlerts.slice(0, 3)) {
        const icon = alert.severity === 'critical' ? '[CRITICAL]' : '[WARNING]';
        lines.push(`${icon} ${alert.message}`);
      }
      lines.push('');
    }
    
    // Revenue summary - concise format
    lines.push('### Revenue');
    lines.push(`Monthly: ${this.formatCurrency(snapshot.revenueSignals.monthlyRevenue)} | Paid: ${this.formatCurrency(snapshot.revenueSignals.paidThisMonth)} | Outstanding: ${this.formatCurrency(snapshot.revenueSignals.outstandingTotal)}`);
    lines.push(`YTD: ${this.formatCurrency(snapshot.revenueSignals.yearToDateRevenue)}`);
    lines.push('');
    
    // AR aging - single line summary
    lines.push('### AR Aging');
    const arSummary = snapshot.arAging.map(b => `${b.bucket}: ${this.formatCurrency(b.totalAmount)}`).join(' | ');
    lines.push(arSummary);
    lines.push('');
    
    // Hours reconciliation - highlight issues
    lines.push('### Hours Reconciliation');
    lines.push(`Platform: ${snapshot.hoursReconciliation.platformHours.toFixed(1)}h | Invoiced: ${snapshot.hoursReconciliation.invoicedHours.toFixed(1)}h | Variance: ${snapshot.hoursReconciliation.variancePercentage.toFixed(1)}% [${snapshot.hoursReconciliation.status}]`);
    lines.push('');
    
    // Overdue invoices - limit to top 3
    if (snapshot.overdueInvoices.length > 0) {
      lines.push(`### Overdue (${snapshot.overdueInvoices.length} total)`);
      for (const inv of snapshot.overdueInvoices.slice(0, 3)) {
        lines.push(`- ${inv.clientName}: ${this.formatCurrency(inv.amount)} (${inv.daysOverdue}d)`);
      }
      lines.push('');
    }
    
    // Employee sync - single line
    lines.push(`### Sync: ${snapshot.employeeSync.syncedToQB}/${snapshot.employeeSync.totalEmployees} synced, ${snapshot.employeeSync.syncErrors} errors`);
    
    let result = lines.join('\n');
    
    // Truncate if exceeding limit
    if (result.length > maxChars) {
      result = result.substring(0, maxChars - 50) + '\n\n[Snapshot truncated for brevity]';
    }
    
    return result;
  }
}

export const trinityQuickBooksSnapshot = new TrinityQuickBooksSnapshotService();
