/**
 * Cleanup Agent Subagent (CAS)
 * 
 * Autonomous code cleanup with LLM-as-Judge integration
 * - Discovery: Find unreferenced files and assets
 * - Verification: LLM-as-Judge review before any deletion
 * - Action: Create deletion proposals for human approval
 * 
 * Integrates with existing SubagentSupervisor and spec-index.json
 */

import { db } from '../../db';
import { helpaiOrchestrator, type ActionRequest, type ActionResult } from '../helpai/helpaiActionOrchestrator';
import specIndex from '../../../spec-index.json';
import * as fs from 'fs';
import * as path from 'path';

interface UnusedFile {
  path: string;
  reason: string;
  lastModified: Date;
  size: number;
  riskLevel: 'low' | 'medium' | 'high';
}

interface CleanupProposal {
  id: string;
  files: UnusedFile[];
  totalSize: number;
  createdAt: Date;
  status: 'pending' | 'approved' | 'rejected';
  justification: string;
  llmJudgeScore?: number;
  llmJudgeReasoning?: string;
}

interface DiscoveryResult {
  unusedFiles: UnusedFile[];
  protectedFiles: string[];
  specIndexedFiles: string[];
  scanDuration: number;
}

class CleanupAgentSubagent {
  private specIndexedFiles: Set<string>;
  private protectedPatterns: RegExp[];

  constructor() {
    this.specIndexedFiles = new Set();
    this.protectedPatterns = [
      /node_modules/,
      /\.git/,
      /dist\//,
      /build\//,
      /\.replit/,
      /replit\.nix/,
      /package\.json/,
      /package-lock\.json/,
      /tsconfig\.json/,
      /drizzle\.config\.ts/,
      /vite\.config\.ts/,
      /\.env/,
      /spec-index\.json/,
      /design_guidelines\.md/,
      /replit\.md/,
    ];

    this.loadSpecIndex();
  }

  private loadSpecIndex(): void {
    try {
      const components = (specIndex as any).components || {};
      for (const componentId of Object.keys(components)) {
        const component = components[componentId];
        if (component.files) {
          component.files.forEach((file: string) => this.specIndexedFiles.add(file));
        }
      }
      console.log(`[CAS] Loaded ${this.specIndexedFiles.size} files from spec-index.json`);
    } catch (error) {
      console.error('[CAS] Failed to load spec-index.json:', error);
    }
  }

  private isProtected(filePath: string): boolean {
    return this.protectedPatterns.some(pattern => pattern.test(filePath));
  }

  private isSpecIndexed(filePath: string): boolean {
    return this.specIndexedFiles.has(filePath);
  }

  private validatePath(directory: string): boolean {
    const allowedRoots = ['attached_assets', 'client/src', 'server', 'shared'];
    const normalizedDir = path.normalize(directory);
    if (normalizedDir.includes('..') || path.isAbsolute(normalizedDir)) {
      console.error('[CAS] Path traversal attempt blocked:', directory);
      return false;
    }
    const isAllowed = allowedRoots.some(root => normalizedDir.startsWith(root));
    if (!isAllowed) {
      console.error('[CAS] Directory not in allowed roots:', directory);
      return false;
    }
    return true;
  }

  async discoverUnusedAssets(directory: string = 'attached_assets'): Promise<DiscoveryResult> {
    const startTime = Date.now();
    const unusedFiles: UnusedFile[] = [];
    const protectedFiles: string[] = [];

    try {
      if (!this.validatePath(directory)) {
        return {
          unusedFiles: [],
          protectedFiles: [],
          specIndexedFiles: Array.from(this.specIndexedFiles),
          scanDuration: Date.now() - startTime
        };
      }

      if (!fs.existsSync(directory)) {
        return {
          unusedFiles: [],
          protectedFiles: [],
          specIndexedFiles: Array.from(this.specIndexedFiles),
          scanDuration: Date.now() - startTime
        };
      }

      const files = this.getAllFiles(directory);

      for (const file of files) {
        if (this.isProtected(file)) {
          protectedFiles.push(file);
          continue;
        }

        const isReferenced = await this.isFileReferenced(file);
        if (!isReferenced) {
          const stats = fs.statSync(file);
          unusedFiles.push({
            path: file,
            reason: 'No imports or references found in codebase',
            lastModified: stats.mtime,
            size: stats.size,
            riskLevel: this.assessRisk(file)
          });
        }
      }

      return {
        unusedFiles,
        protectedFiles,
        specIndexedFiles: Array.from(this.specIndexedFiles),
        scanDuration: Date.now() - startTime
      };
    } catch (error) {
      console.error('[CAS] Discovery error:', error);
      return {
        unusedFiles: [],
        protectedFiles: [],
        specIndexedFiles: Array.from(this.specIndexedFiles),
        scanDuration: Date.now() - startTime
      };
    }
  }

  private getAllFiles(dir: string): string[] {
    const files: string[] = [];
    try {
      const items = fs.readdirSync(dir, { withFileTypes: true });
      for (const item of items) {
        const fullPath = path.join(dir, item.name);
        if (item.isDirectory()) {
          files.push(...this.getAllFiles(fullPath));
        } else {
          files.push(fullPath);
        }
      }
    } catch (error) {
      console.error(`[CAS] Error reading directory ${dir}:`, error);
    }
    return files;
  }

  private async isFileReferenced(filePath: string): Promise<boolean> {
    const fileName = path.basename(filePath);
    const searchDirs = ['client/src', 'server', 'shared'];

    for (const dir of searchDirs) {
      if (!fs.existsSync(dir)) continue;

      const searchResult = this.searchForReference(dir, fileName);
      if (searchResult) return true;
    }

    return false;
  }

  private searchForReference(dir: string, searchTerm: string): boolean {
    try {
      const files = this.getAllFiles(dir);
      for (const file of files) {
        if (file.endsWith('.ts') || file.endsWith('.tsx') || file.endsWith('.js') || file.endsWith('.jsx')) {
          const content = fs.readFileSync(file, 'utf-8');
          if (content.includes(searchTerm)) {
            return true;
          }
        }
      }
    } catch (error) {
      console.error(`[CAS] Error searching ${dir}:`, error);
    }
    return false;
  }

  private assessRisk(filePath: string): 'low' | 'medium' | 'high' {
    if (this.isSpecIndexed(filePath)) return 'high';
    if (filePath.includes('config') || filePath.includes('schema')) return 'high';
    if (filePath.includes('service') || filePath.includes('route')) return 'medium';
    if (filePath.includes('attached_assets') || filePath.includes('screenshot')) return 'low';
    return 'medium';
  }

  async createCleanupProposal(unusedFiles: UnusedFile[]): Promise<CleanupProposal> {
    const proposal: CleanupProposal = {
      id: `cleanup-${Date.now()}`,
      files: unusedFiles,
      totalSize: unusedFiles.reduce((sum, f) => sum + f.size, 0),
      createdAt: new Date(),
      status: 'pending',
      justification: this.generateJustification(unusedFiles)
    };

    const judgeResult = await this.requestLLMJudgeReview(proposal);
    proposal.llmJudgeScore = judgeResult.score;
    proposal.llmJudgeReasoning = judgeResult.reasoning;

    if (judgeResult.score < 0.7) {
      proposal.status = 'rejected';
    }

    return proposal;
  }

  private generateJustification(files: UnusedFile[]): string {
    const lowRisk = files.filter(f => f.riskLevel === 'low').length;
    const mediumRisk = files.filter(f => f.riskLevel === 'medium').length;
    const highRisk = files.filter(f => f.riskLevel === 'high').length;
    const totalSize = files.reduce((sum, f) => sum + f.size, 0);

    return `Cleanup proposal: ${files.length} unused files (${(totalSize / 1024).toFixed(1)} KB). ` +
           `Risk breakdown: ${lowRisk} low, ${mediumRisk} medium, ${highRisk} high. ` +
           `No references found in codebase for any of these files.`;
  }

  private async requestLLMJudgeReview(proposal: CleanupProposal): Promise<{ score: number; reasoning: string }> {
    try {
      const result = await helpaiOrchestrator.executeAction({
        actionId: 'judge.evaluate_risk',
        category: 'automation',
        name: 'Evaluate Cleanup Risk',
        userId: 'system',
        userRole: 'root_admin',
        payload: {
          proposalType: 'file_cleanup',
          files: proposal.files.map(f => ({
            path: f.path,
            riskLevel: f.riskLevel,
            size: f.size
          })),
          justification: proposal.justification
        }
      });

      const score = result?.data?.score;
      const reasoning = result?.data?.reasoning;

      if (typeof score !== 'number' || score < 0 || score > 1) {
        console.warn('[CAS] Invalid LLM Judge score, failing closed:', score);
        return {
          score: 0.3,
          reasoning: 'Invalid score from LLM Judge - manual review required'
        };
      }

      if (typeof reasoning !== 'string' || reasoning.length < 10) {
        console.warn('[CAS] Missing LLM Judge reasoning, failing closed');
        return {
          score: 0.3,
          reasoning: 'Missing reasoning from LLM Judge - manual review required'
        };
      }

      return { score, reasoning };
    } catch (error) {
      console.error('[CAS] LLM Judge review failed:', error);
      return {
        score: 0.3,
        reasoning: 'LLM Judge unavailable - manual review required'
      };
    }
  }

  async getComponentBySpecId(specId: string): Promise<any> {
    const components = (specIndex as any).components || {};
    return components[specId] || null;
  }

  async findComponentByName(searchTerm: string): Promise<any[]> {
    const components = (specIndex as any).components || {};
    const matches: any[] = [];

    for (const [id, component] of Object.entries(components)) {
      const comp = component as any;
      if (
        id.toLowerCase().includes(searchTerm.toLowerCase()) ||
        comp.name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        comp.intent?.toLowerCase().includes(searchTerm.toLowerCase())
      ) {
        matches.push({ id, ...comp });
      }
    }

    return matches;
  }

  async getEditingRulesForComponent(specId: string): Promise<any> {
    const component = await this.getComponentBySpecId(specId);
    if (!component) return null;

    const rules = (specIndex as any).aiEditingRules || {};
    return {
      component,
      editingRules: rules[component.tier] || rules.tier2
    };
  }

  getStats(): { totalComponents: number; byTier: Record<string, number>; totalFiles: number } {
    const components = (specIndex as any).components || {};
    const byTier: Record<string, number> = { tier0: 0, tier1: 0, tier2: 0, tier3: 0 };
    let totalFiles = 0;

    for (const component of Object.values(components)) {
      const comp = component as any;
      if (comp.tier && byTier[comp.tier] !== undefined) {
        byTier[comp.tier]++;
      }
      if (comp.files) {
        totalFiles += comp.files.length;
      }
    }

    return {
      totalComponents: Object.keys(components).length,
      byTier,
      totalFiles
    };
  }
}

export const cleanupAgentSubagent = new CleanupAgentSubagent();

export function registerCleanupAgentActions(): void {
  helpaiOrchestrator.registerAction({
    actionId: 'cleanup.discover_unused',
    name: 'Discover Unused Files',
    category: 'automation',
    description: 'Scan for unused files and assets in the codebase',
    requiredRoles: ['root_admin', 'coo', 'cto', 'support_lead'],
    handler: async (request: ActionRequest): Promise<ActionResult> => {
      const startTime = Date.now();
      const result = await cleanupAgentSubagent.discoverUnusedAssets(request.payload?.directory || 'attached_assets');
      return {
        success: true,
        actionId: request.actionId,
        message: `Found ${result.unusedFiles.length} unused files`,
        data: {
          unusedCount: result.unusedFiles.length,
          protectedCount: result.protectedFiles.length,
          scanDuration: result.scanDuration,
          files: result.unusedFiles
        },
        executionTimeMs: Date.now() - startTime
      };
    }
  });

  helpaiOrchestrator.registerAction({
    actionId: 'cleanup.create_proposal',
    name: 'Create Cleanup Proposal',
    category: 'automation',
    description: 'Create a cleanup proposal for unused files with LLM-as-Judge review',
    requiredRoles: ['root_admin', 'coo', 'cto', 'support_lead'],
    handler: async (request: ActionRequest): Promise<ActionResult> => {
      const startTime = Date.now();
      if (!request.payload?.files || !Array.isArray(request.payload.files)) {
        return {
          success: false,
          actionId: request.actionId,
          message: 'No files provided',
          executionTimeMs: Date.now() - startTime
        };
      }
      const proposal = await cleanupAgentSubagent.createCleanupProposal(request.payload.files);
      return {
        success: true,
        actionId: request.actionId,
        message: `Cleanup proposal created: ${proposal.status}`,
        data: { proposal },
        executionTimeMs: Date.now() - startTime
      };
    }
  });

  helpaiOrchestrator.registerAction({
    actionId: 'spec.get_component',
    name: 'Get Component by Spec ID',
    category: 'system',
    description: 'Retrieve component details from spec-index.json by ID',
    requiredRoles: ['root_admin', 'coo', 'cto', 'support_lead', 'support_agent'],
    handler: async (request: ActionRequest): Promise<ActionResult> => {
      const startTime = Date.now();
      const component = await cleanupAgentSubagent.getComponentBySpecId(request.payload?.specId);
      return {
        success: !!component,
        actionId: request.actionId,
        message: component ? `Found component: ${component.name}` : 'Component not found',
        data: { component },
        executionTimeMs: Date.now() - startTime
      };
    }
  });

  helpaiOrchestrator.registerAction({
    actionId: 'spec.find_components',
    name: 'Search Components',
    category: 'system',
    description: 'Search for components by name or intent in spec-index.json',
    requiredRoles: ['root_admin', 'coo', 'cto', 'support_lead', 'support_agent'],
    handler: async (request: ActionRequest): Promise<ActionResult> => {
      const startTime = Date.now();
      const matches = await cleanupAgentSubagent.findComponentByName(request.payload?.searchTerm || '');
      return {
        success: true,
        actionId: request.actionId,
        message: `Found ${matches.length} matching components`,
        data: { matches, count: matches.length },
        executionTimeMs: Date.now() - startTime
      };
    }
  });

  helpaiOrchestrator.registerAction({
    actionId: 'spec.get_editing_rules',
    name: 'Get Editing Rules',
    category: 'system',
    description: 'Get AI editing rules for a component based on its tier',
    requiredRoles: ['root_admin', 'coo', 'cto', 'support_lead', 'support_agent'],
    handler: async (request: ActionRequest): Promise<ActionResult> => {
      const startTime = Date.now();
      const rules = await cleanupAgentSubagent.getEditingRulesForComponent(request.payload?.specId);
      return {
        success: !!rules,
        actionId: request.actionId,
        message: rules ? `Rules for tier ${rules.component?.tier}` : 'Component not found',
        data: rules,
        executionTimeMs: Date.now() - startTime
      };
    }
  });

  helpaiOrchestrator.registerAction({
    actionId: 'spec.get_stats',
    name: 'Get Spec Index Stats',
    category: 'system',
    description: 'Get statistics about the spec-index.json registry',
    requiredRoles: ['root_admin', 'coo', 'cto', 'support_lead', 'support_agent'],
    handler: async (request: ActionRequest): Promise<ActionResult> => {
      const startTime = Date.now();
      const stats = cleanupAgentSubagent.getStats();
      return {
        success: true,
        actionId: request.actionId,
        message: `${stats.totalComponents} components, ${stats.totalFiles} files indexed`,
        data: stats,
        executionTimeMs: Date.now() - startTime
      };
    }
  });

  console.log('[CAS] Registered 6 Cleanup Agent Subagent actions');
}
