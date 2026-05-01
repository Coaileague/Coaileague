import { BaseSkill } from './base-skill';
import type { SkillManifest, SkillContext, SkillResult } from './types';
import { db } from '../../../db';
import { employees, clients, workspaces, sites } from '@shared/schema';
import { eq, and } from 'drizzle-orm';

import { createLogger } from '../../../lib/logger';
import { PLATFORM } from '../../../config/platformConfig';
const log = createLogger('documentGeneratorSkill');

interface DocumentGenerationParams {
  documentType: 'report' | 'summary' | 'analysis' | 'presentation' | 'template' | 'memo' | 'policy' | 'checklist';
  title: string;
  workspaceId: string;
  dataScope?: {
    entityType?: 'employee' | 'client' | 'site' | 'workspace';
    entityId?: string;
    dateRange?: { start: string; end: string };
  };
  sections?: string[];
  format?: 'structured_json' | 'markdown' | 'html';
  includeCharts?: boolean;
  includeRawData?: boolean;
}

interface DocumentSection {
  title: string;
  content: string;
  type: 'text' | 'table' | 'chart_data' | 'key_value' | 'list';
  data?: any;
}

interface GeneratedDocument {
  title: string;
  generatedAt: string;
  sections: DocumentSection[];
  metadata: {
    documentType: string;
    dataPointsUsed: number;
    workspaceId: string;
    generationTimeMs: number;
  };
}

class DocumentGeneratorSkill extends BaseSkill {
  getManifest(): SkillManifest {
    return {
      id: 'document-generator',
      name: 'Document Generator',
      version: '1.0.0',
      description: 'Creates structured documents, reports, summaries, and data presentations from platform data. Supports PDF-ready output with tables, charts, and formatted sections.',
      author: PLATFORM.name,
      category: 'document-processing',
      requiredTier: 'starter',
      capabilities: [
        'generate_report',
        'create_summary',
        'build_analysis',
        'format_presentation',
        'create_template',
        'generate_memo',
        'create_policy_document',
        'build_checklist',
      ],
      eventSubscriptions: ['document_requested', 'report_needed'],
    };
  }

  async execute(context: SkillContext, params: DocumentGenerationParams): Promise<SkillResult<GeneratedDocument>> {
    const startTime = Date.now();
    const logs: string[] = [];

    try {
      logs.push(`Starting document generation: ${params.documentType} - "${params.title}"`);

      const rawData = await this.gatherData(params, logs);

      const sections = await this.buildSections(params, rawData, logs);

      const document: GeneratedDocument = {
        title: params.title,
        generatedAt: new Date().toISOString(),
        sections,
        metadata: {
          documentType: params.documentType,
          dataPointsUsed: this.countDataPoints(rawData),
          workspaceId: params.workspaceId,
          generationTimeMs: Date.now() - startTime,
        },
      };

      logs.push(`Document generated: ${sections.length} sections, ${document.metadata.dataPointsUsed} data points`);

      return {
        success: true,
        data: document,
        logs,
        metadata: {
          creditsUsed: this.estimateCredits(params.documentType),
          generationTimeMs: Date.now() - startTime,
        },
      };
    } catch (error: unknown) {
      logs.push(`Document generation failed: ${(error instanceof Error ? error.message : String(error))}`);
      return {
        success: false,
        error: (error instanceof Error ? error.message : String(error)),
        logs,
      };
    }
  }

  private async gatherData(params: DocumentGenerationParams, logs: string[]): Promise<Record<string, any>> {
    const data: Record<string, unknown> = {};
    const wsId = params.workspaceId;

    try {
      const [ws] = await db.select().from(workspaces).where(eq(workspaces.id, wsId)).limit(1);
      if (ws) data.workspace = { name: ws.name, tier: ws.subscriptionTier };
    } catch { /* best-effort */ }

    if (params.dataScope?.entityType === 'employee' && params.dataScope.entityId) {
      try {
        const [emp] = await db.select().from(employees)
          .where(and(eq(employees.id, params.dataScope.entityId), eq(employees.workspaceId, wsId))).limit(1);
        if (emp) {
          data.employee = emp;
          logs.push(`Gathered employee data: ${emp?.firstName} ${emp?.lastName}`);
        } else {
          logs.push(`Employee ${params.dataScope.entityId} not found in workspace ${wsId}`);
        }
      } catch { /* best-effort */ }
    }

    if (params.dataScope?.entityType === 'client' && params.dataScope.entityId) {
      try {
        const [client] = await db.select().from(clients)
          .where(and(eq(clients.id, params.dataScope.entityId), eq(clients.workspaceId, wsId))).limit(1);
        if (client) {
          data.client = client;
          logs.push(`Gathered client data: ${client?.companyName}`);
        } else {
          logs.push(`Client ${params.dataScope.entityId} not found in workspace ${wsId}`);
        }
      } catch { /* best-effort */ }
    }

    if (['report', 'analysis', 'summary'].includes(params.documentType)) {
      try {
        const empList = await db.select({
          id: employees.id,
          firstName: employees.firstName,
          lastName: employees.lastName,
          position: employees.position,
          payRate: (employees as any).payRate,
          isActive: employees.isActive,
        }).from(employees).where(eq(employees.workspaceId, wsId)).limit(200);
        data.employees = empList;
        logs.push(`Gathered ${empList.length} employees for workspace`);
      } catch { /* best-effort */ }

      try {
        const clientList = await db.select({
          id: clients.id,
          companyName: clients.companyName,
          isActive: clients.isActive,
        }).from(clients).where(eq(clients.workspaceId, wsId)).limit(100);
        data.clients = clientList;
        logs.push(`Gathered ${clientList.length} clients for workspace`);
      } catch { /* best-effort */ }

      try {
        const siteList = await db.select({
          id: sites.id,
          name: sites.name,
          address: (sites as any).address,
          isActive: (sites as any).isActive,
        }).from(sites).where(eq(sites.workspaceId, wsId)).limit(100);
        data.sites = siteList;
        logs.push(`Gathered ${siteList.length} sites for workspace`);
      } catch { /* best-effort */ }
    }

    return data;
  }

  private async buildSections(
    params: DocumentGenerationParams,
    rawData: Record<string, unknown>,
    logs: string[]
  ): Promise<DocumentSection[]> {
    const sections: DocumentSection[] = [];

    sections.push({
      title: 'Executive Summary',
      type: 'text',
      content: this.buildExecutiveSummary(params, rawData),
    });

    if (params.documentType === 'report' || params.documentType === 'analysis') {
      if (rawData.employees?.length > 0) {
        const activeCount = rawData.employees.filter((e: any) => e.isActive).length;
        const avgPayRate = rawData.employees.reduce((sum: number, e: any) => sum + (parseFloat(e.payRate) || 0), 0) / (rawData.employees.length || 1);

        sections.push({
          title: 'Workforce Overview',
          type: 'key_value',
          content: `Total: ${rawData.employees.length}, Active: ${activeCount}, Avg Rate: $${avgPayRate.toFixed(2)}/hr`,
          data: {
            totalEmployees: rawData.employees.length,
            activeEmployees: activeCount,
            inactiveEmployees: rawData.employees.length - activeCount,
            averagePayRate: Math.round(avgPayRate * 100) / 100,
            positionBreakdown: this.groupBy(rawData.employees, 'position'),
          },
        });
      }

      if (rawData.clients?.length > 0) {
        sections.push({
          title: 'Client Portfolio',
          type: 'table',
          content: `${rawData.clients.length} clients across portfolio`,
          data: {
            totalClients: rawData.clients.length,
            byStatus: this.groupBy(rawData.clients, 'isActive'),
            clients: rawData.clients.map((c: any) => ({
              name: c.companyName,
              isActive: c.isActive,
            })),
          },
        });
      }

      if (rawData.sites?.length > 0) {
        const activeSites = rawData.sites.filter((s: any) => s.isActive).length;
        sections.push({
          title: 'Site Operations',
          type: 'key_value',
          content: `${rawData.sites.length} total sites, ${activeSites} active`,
          data: {
            totalSites: rawData.sites.length,
            activeSites,
            inactiveSites: rawData.sites.length - activeSites,
          },
        });
      }
    }

    if (params.documentType === 'checklist') {
      sections.push({
        title: 'Checklist Items',
        type: 'list',
        content: (params.sections || ['Item 1', 'Item 2', 'Item 3']).join('\n'),
        data: {
          items: (params.sections || []).map((s, i) => ({ id: i + 1, label: s, checked: false })),
        },
      });
    }

    if (params.documentType === 'memo' || params.documentType === 'policy') {
      const generatedSections = await Promise.all(
        (params.sections || ['Details']).map(async (sectionTitle, i) => {
          await new Promise(r => setTimeout(r, i * 200));
          const content = await this.generateSectionContent(
            sectionTitle,
            params.documentType,
            rawData,
            params.workspaceId,
          );
          return { title: sectionTitle, type: 'text' as const, content, order: i };
        })
      );
      sections.push(...generatedSections);
    }

    if (params.includeRawData) {
      sections.push({
        title: 'Raw Data Appendix',
        type: 'table',
        content: 'Complete data set used for this document',
        data: rawData,
      });
    }

    logs.push(`Built ${sections.length} document sections`);
    return sections;
  }

  private async generateSectionContent(
    sectionTitle: string,
    documentType: string,
    context: Record<string, unknown>,
    workspaceId: string,
  ): Promise<string> {
    try {
      const { unifiedGeminiClient } = await import('../unifiedGeminiClient');

      const orgContext = [
        context.workspace?.name ? `Organization: ${context.workspace.name}` : '',
        context.client?.companyName ? `Client: ${context.client.companyName}` : '',
        context.employee ? `Employee: ${context.employee.firstName} ${context.employee.lastName}` : '',
      ].filter(Boolean).join('\n');

      const result = await unifiedGeminiClient.generate({
        workspaceId,
        featureKey: 'trinity_document_generation',
        systemPrompt: `You are Trinity, an expert assistant for security companies. Write professional document content.`,
        userMessage: `Write compelling, professional content for the "${sectionTitle}" section of a ${documentType} document.

${orgContext ? `Context:\n${orgContext}\n` : ''}
Requirements:
- 150-300 words, specific and concrete
- First-person plural ("we", "our") where appropriate
- No placeholder text or bracket notation
- Write actual content, not instructions`,
        temperature: 0.7,
        maxTokens: 500,
      });

      return result.text || `${sectionTitle}: Please edit this section with your specific content.`;
    } catch (e: unknown) {
      log.warn(`[DocumentGenerator] Section generation failed for "${sectionTitle}": ${e?.message}`);
      return `${sectionTitle}: Please edit this section with your specific content.`;
    }
  }

  private buildExecutiveSummary(params: DocumentGenerationParams, data: Record<string, unknown>): string {
    const parts: string[] = [];
    parts.push(`${params.documentType.charAt(0).toUpperCase() + params.documentType.slice(1)}: ${params.title}`);

    if (data.workspace) {
      parts.push(`Organization: ${data.workspace.name} (${data.workspace.tier} tier)`);
    }

    if (data.employees) {
      const active = data.employees.filter((e: any) => e.isActive).length;
      parts.push(`Workforce: ${data.employees.length} total employees, ${active} active`);
    }

    if (data.clients) {
      parts.push(`Client portfolio: ${data.clients.length} clients`);
    }

    if (data.sites) {
      const active = data.sites.filter((s: any) => s.isActive).length;
      parts.push(`Operations: ${data.sites.length} sites, ${active} active`);
    }

    parts.push(`Generated: ${new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}`);

    return parts.join('\n');
  }

  private groupBy(items: any[], key: string): Record<string, number> {
    const groups: Record<string, number> = {};
    for (const item of items) {
      const val = item[key] || 'unspecified';
      groups[val] = (groups[val] || 0) + 1;
    }
    return groups;
  }

  private countDataPoints(data: Record<string, unknown>): number {
    let count = 0;
    for (const value of Object.values(data)) {
      if (Array.isArray(value)) count += value.length;
      else if (value && typeof value === 'object') count += Object.keys(value).length;
      else count++;
    }
    return count;
  }

  private estimateCredits(docType: string): number {
    const costs: Record<string, number> = {
      report: 10,
      analysis: 15,
      summary: 5,
      presentation: 12,
      template: 3,
      memo: 5,
      policy: 8,
      checklist: 2,
    };
    return costs[docType] || 5;
  }
}

export const documentGeneratorSkill = new DocumentGeneratorSkill();
export default DocumentGeneratorSkill;
