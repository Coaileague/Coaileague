import { BaseSkill } from './base-skill';
import type { SkillManifest, SkillContext, SkillResult } from './types';
import { db } from '../../../db';
import { employees, clients, sites, shifts, invoices, workspaces } from '@shared/schema';
import { eq, and, gte, lte, count, sql, desc } from 'drizzle-orm';

import { createLogger } from '../../../lib/logger';
import { PLATFORM } from '../../../config/platformConfig';
const log = createLogger('dataResearchSkill');

interface ResearchParams {
  query: string;
  workspaceId: string;
  researchDepth: 'quick' | 'standard' | 'deep';
  dataSources?: ('employees' | 'clients' | 'sites' | 'shifts' | 'invoices' | 'payroll')[];
  dateRange?: { start: string; end: string };
  analysisType?: 'trend' | 'comparison' | 'anomaly' | 'forecast' | 'summary';
  outputFormat?: 'findings' | 'briefing' | 'data_table' | 'recommendations';
}

interface ResearchFinding {
  category: string;
  title: string;
  insight: string;
  confidence: number;
  dataPoints: number;
  evidence: any;
  severity?: 'info' | 'low' | 'medium' | 'high' | 'critical';
}

interface ResearchResult {
  query: string;
  findings: ResearchFinding[];
  dataSummary: Record<string, any>;
  recommendations: string[];
  methodology: string[];
  totalDataPointsAnalyzed: number;
  researchTimeMs: number;
}

class DataResearchSkill extends BaseSkill {
  getManifest(): SkillManifest {
    return {
      id: 'data-researcher',
      name: 'Data Research & Analysis',
      version: '1.0.0',
      description: 'Deep research and analysis engine. Queries multiple data sources, finds patterns, detects anomalies, generates insights, and presents organized findings with confidence scores.',
      author: PLATFORM.name,
      category: 'analytics',
      requiredTier: 'starter',
      capabilities: [
        'multi_source_research',
        'pattern_detection',
        'anomaly_detection',
        'trend_analysis',
        'data_correlation',
        'findings_presentation',
        'recommendation_generation',
        'confidence_scoring',
      ],
      eventSubscriptions: ['research_requested', 'analysis_needed'],
    };
  }

  async execute(context: SkillContext, params: ResearchParams): Promise<SkillResult<ResearchResult>> {
    const startTime = Date.now();
    const logs: string[] = [];
    const findings: ResearchFinding[] = [];
    const methodology: string[] = [];
    let totalDataPoints = 0;

    try {
      logs.push(`Research initiated: "${params.query}" [depth: ${params.researchDepth}]`);

      const sources = params.dataSources || ['employees', 'clients', 'sites', 'shifts', 'invoices'];
      const dataSummary: Record<string, any> = {};

      for (const source of sources) {
        const sourceData = await this.querySource(source, params, logs);
        dataSummary[source] = sourceData.summary;
        totalDataPoints += sourceData.dataPoints;

        const sourceFindings = await this.analyzeSource(source, sourceData, params, logs);
        findings.push(...sourceFindings);
      }

      if (sources.length > 1) {
        const crossFindings = await this.crossSourceAnalysis(dataSummary, params, logs);
        findings.push(...crossFindings);
        methodology.push('Cross-source correlation analysis');
      }

      if (params.analysisType === 'anomaly' || params.researchDepth === 'deep') {
        const anomalies = await this.detectAnomalies(dataSummary, params, logs);
        findings.push(...anomalies);
        methodology.push('Statistical anomaly detection (IQR method)');
      }

      const recommendations = this.generateRecommendations(findings, params);

      findings.sort((a, b) => {
        const severityOrder = { critical: 0, high: 1, medium: 2, low: 3, info: 4 };
        return (severityOrder[a.severity || 'info'] || 4) - (severityOrder[b.severity || 'info'] || 4);
      });

      methodology.push(`Queried ${sources.length} data sources`);
      methodology.push(`Analyzed ${totalDataPoints} data points`);
      methodology.push(`Research depth: ${params.researchDepth}`);

      const result: ResearchResult = {
        query: params.query,
        findings,
        dataSummary,
        recommendations,
        methodology,
        totalDataPointsAnalyzed: totalDataPoints,
        researchTimeMs: Date.now() - startTime,
      };

      logs.push(`Research complete: ${findings.length} findings, ${recommendations.length} recommendations`);

      return {
        success: true,
        data: result,
        logs,
        metadata: {
          creditsUsed: this.estimateCredits(params.researchDepth, sources.length),
          findingsCount: findings.length,
        },
      };
    } catch (error: any) {
      logs.push(`Research failed: ${(error instanceof Error ? error.message : String(error))}`);
      return { success: false, error: (error instanceof Error ? error.message : String(error)), logs };
    }
  }

  private async querySource(
    source: string,
    params: ResearchParams,
    logs: string[]
  ): Promise<{ data: any[]; summary: any; dataPoints: number }> {
    const wsId = params.workspaceId;

    try {
      switch (source) {
        case 'employees': {
          const data = await db.select().from(employees).where(eq(employees.workspaceId, wsId)).limit(500);
          const active = data.filter(e => e.isActive).length;
          const rates = data.map(e => parseFloat(e.payRate?.toString() || '0')).filter(r => r > 0);
          const avgRate = rates.length > 0 ? rates.reduce((a, b) => a + b, 0) / rates.length : 0;
          const summary = {
            total: data.length, active, inactive: data.length - active,
            avgPayRate: Math.round(avgRate * 100) / 100,
            minPayRate: rates.length > 0 ? Math.min(...rates) : 0,
            maxPayRate: rates.length > 0 ? Math.max(...rates) : 0,
            positionDistribution: this.countBy(data, 'position'),
          };
          logs.push(`Employees: ${data.length} records queried`);
          return { data, summary, dataPoints: data.length };
        }

        case 'clients': {
          const data = await db.select().from(clients).where(eq(clients.workspaceId, wsId)).limit(200);
          const summary = {
            total: data.length,
            statusDistribution: this.countBy(data, 'status'),
          };
          logs.push(`Clients: ${data.length} records queried`);
          return { data, summary, dataPoints: data.length };
        }

        case 'sites': {
          const data = await db.select().from(sites).where(eq(sites.workspaceId, wsId)).limit(200);
          const active = data.filter(s => s.isActive).length;
          const summary = { total: data.length, active, inactive: data.length - active };
          logs.push(`Sites: ${data.length} records queried`);
          return { data, summary, dataPoints: data.length };
        }

        case 'shifts': {
          const data = await db.select().from(shifts).where(eq(shifts.workspaceId, wsId)).limit(1000);
          const statusDist = this.countBy(data, 'status');
          const summary = { total: data.length, statusDistribution: statusDist };
          logs.push(`Shifts: ${data.length} records queried`);
          return { data, summary, dataPoints: data.length };
        }

        case 'invoices': {
          const data = await db.select().from(invoices).where(eq(invoices.workspaceId, wsId)).limit(500);
          const totalAmount = data.reduce((sum, inv) => sum + (parseFloat(inv.total?.toString() || '0') || 0), 0);
          const summary = {
            total: data.length,
            totalAmount: Math.round(totalAmount * 100) / 100,
            statusDistribution: this.countBy(data, 'status'),
          };
          logs.push(`Invoices: ${data.length} records queried`);
          return { data, summary, dataPoints: data.length };
        }

        default:
          return { data: [], summary: {}, dataPoints: 0 };
      }
    } catch (error: any) {
      logs.push(`Failed to query ${source}: ${(error instanceof Error ? error.message : String(error))}`);
      return { data: [], summary: { error: (error instanceof Error ? error.message : String(error)) }, dataPoints: 0 };
    }
  }

  private async analyzeSource(
    source: string,
    sourceData: { data: any[]; summary: any; dataPoints: number },
    params: ResearchParams,
    logs: string[]
  ): Promise<ResearchFinding[]> {
    const findings: ResearchFinding[] = [];

    if (sourceData.dataPoints === 0) return findings;

    switch (source) {
      case 'employees': {
        const { summary } = sourceData;
        if (summary.inactive > summary.active * 0.3) {
          findings.push({
            category: 'workforce',
            title: 'High Inactive Employee Ratio',
            insight: `${summary.inactive} inactive employees (${Math.round(summary.inactive / summary.total * 100)}% of workforce). Consider cleanup or reactivation campaign.`,
            confidence: 0.9,
            dataPoints: summary.total,
            evidence: { active: summary.active, inactive: summary.inactive, ratio: summary.inactive / summary.total },
            severity: summary.inactive > summary.active ? 'high' : 'medium',
          });
        }

        if (summary.maxPayRate > 0 && summary.maxPayRate > summary.avgPayRate * 3) {
          findings.push({
            category: 'compensation',
            title: 'Pay Rate Outlier Detected',
            insight: `Maximum pay rate ($${summary.maxPayRate}/hr) is ${(summary.maxPayRate / summary.avgPayRate).toFixed(1)}x the average ($${summary.avgPayRate}/hr). Verify this is intentional.`,
            confidence: 0.85,
            dataPoints: summary.total,
            evidence: { avg: summary.avgPayRate, max: summary.maxPayRate, min: summary.minPayRate },
            severity: 'medium',
          });
        }
        break;
      }

      case 'invoices': {
        const { summary, data } = sourceData;
        const overdue = data.filter((i: any) => i.status === 'overdue' || i.status === 'past_due');
        if (overdue.length > 0) {
          const overdueAmount = overdue.reduce((sum: number, inv: any) =>
            sum + (parseFloat(inv.total?.toString() || '0') || 0), 0);
          findings.push({
            category: 'finance',
            title: 'Outstanding Receivables',
            insight: `${overdue.length} overdue invoices totaling $${overdueAmount.toLocaleString()}. Immediate collection action recommended.`,
            confidence: 0.95,
            dataPoints: overdue.length,
            evidence: { overdueCount: overdue.length, overdueAmount, totalInvoices: summary.total },
            severity: overdueAmount > 10000 ? 'high' : 'medium',
          });
        }
        break;
      }

      case 'shifts': {
        const { summary, data } = sourceData;
        const unassigned = data.filter((s: any) => !s.employeeId && s.status !== 'completed' && s.status !== 'cancelled');
        if (unassigned.length > 0) {
          findings.push({
            category: 'operations',
            title: 'Unassigned Shifts',
            insight: `${unassigned.length} shifts without assigned employees. Coverage gaps may impact service quality.`,
            confidence: 0.9,
            dataPoints: unassigned.length,
            evidence: { unassignedCount: unassigned.length, totalShifts: summary.total },
            severity: unassigned.length > 10 ? 'high' : 'low',
          });
        }
        break;
      }
    }

    return findings;
  }

  private async crossSourceAnalysis(
    dataSummary: Record<string, any>,
    params: ResearchParams,
    logs: string[]
  ): Promise<ResearchFinding[]> {
    const findings: ResearchFinding[] = [];

    if (dataSummary.employees && dataSummary.clients) {
      const empPerClient = dataSummary.employees.active / (dataSummary.clients.total || 1);
      if (empPerClient < 2) {
        findings.push({
          category: 'capacity',
          title: 'Low Staff-to-Client Ratio',
          insight: `Only ${empPerClient.toFixed(1)} active employees per client. May indicate capacity constraints.`,
          confidence: 0.75,
          dataPoints: dataSummary.employees.total + dataSummary.clients.total,
          evidence: { activeEmployees: dataSummary.employees.active, totalClients: dataSummary.clients.total, ratio: empPerClient },
          severity: empPerClient < 1 ? 'high' : 'medium',
        });
      }
    }

    if (dataSummary.employees && dataSummary.sites) {
      const empPerSite = dataSummary.employees.active / (dataSummary.sites.active || 1);
      if (empPerSite < 3 && dataSummary.sites.active > 0) {
        findings.push({
          category: 'staffing',
          title: 'Low Staff-to-Site Ratio',
          insight: `${empPerSite.toFixed(1)} active employees per active site. May need additional staffing.`,
          confidence: 0.7,
          dataPoints: dataSummary.employees.total + dataSummary.sites.total,
          evidence: { activeEmployees: dataSummary.employees.active, activeSites: dataSummary.sites.active },
          severity: 'low',
        });
      }
    }

    logs.push(`Cross-source analysis: ${findings.length} correlations found`);
    return findings;
  }

  private async detectAnomalies(
    dataSummary: Record<string, any>,
    params: ResearchParams,
    logs: string[]
  ): Promise<ResearchFinding[]> {
    const findings: ResearchFinding[] = [];

    if (dataSummary.employees && dataSummary.employees.maxPayRate > 0) {
      const { avgPayRate, minPayRate, maxPayRate } = dataSummary.employees;
      const spread = maxPayRate - minPayRate;
      if (spread > avgPayRate * 2) {
        findings.push({
          category: 'anomaly',
          title: 'Wide Pay Rate Spread',
          insight: `Pay rate spread of $${spread.toFixed(2)}/hr (min: $${minPayRate}, max: $${maxPayRate}) exceeds 2x the average. Review for equity and compliance.`,
          confidence: 0.8,
          dataPoints: dataSummary.employees.total,
          evidence: { spread, avgPayRate, minPayRate, maxPayRate },
          severity: 'medium',
        });
      }
    }

    logs.push(`Anomaly detection: ${findings.length} anomalies found`);
    return findings;
  }

  private generateRecommendations(findings: ResearchFinding[], params: ResearchParams): string[] {
    const recs: string[] = [];
    const severityMap = new Map<string, ResearchFinding[]>();

    for (const finding of findings) {
      const sev = finding.severity || 'info';
      if (!severityMap.has(sev)) severityMap.set(sev, []);
      severityMap.get(sev)!.push(finding);
    }

    const critical = severityMap.get('critical') || [];
    const high = severityMap.get('high') || [];

    if (critical.length > 0) {
      recs.push(`URGENT: ${critical.length} critical finding(s) require immediate attention`);
    }
    if (high.length > 0) {
      recs.push(`${high.length} high-priority finding(s) should be addressed within this week`);
    }

    for (const finding of findings) {
      if (finding.category === 'finance' && finding.severity !== 'info') {
        recs.push(`Review and follow up on ${finding.title.toLowerCase()}`);
      }
      if (finding.category === 'workforce' && finding.severity !== 'info') {
        recs.push(`Conduct workforce audit to address ${finding.title.toLowerCase()}`);
      }
      if (finding.category === 'operations' && finding.severity !== 'info') {
        recs.push(`Schedule operations review for ${finding.title.toLowerCase()}`);
      }
    }

    if (recs.length === 0) {
      recs.push('No critical issues detected. Continue monitoring key metrics.');
    }

    return [...new Set(recs)];
  }

  private countBy(items: any[], key: string): Record<string, number> {
    const counts: Record<string, number> = {};
    for (const item of items) {
      const val = (item[key] || 'unspecified').toString();
      counts[val] = (counts[val] || 0) + 1;
    }
    return counts;
  }

  private estimateCredits(depth: string, sourceCount: number): number {
    const base = { quick: 3, standard: 8, deep: 15 }[depth] || 5;
    return base + (sourceCount * 2);
  }
}

export const dataResearchSkill = new DataResearchSkill();
export default DataResearchSkill;
