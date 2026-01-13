/**
 * TRINITY DIAGNOSTICS AGENT
 * =========================
 * Super debugging agent with Gemini 3 metacognition integration.
 * Uses Trinity's thought engine for intelligent issue analysis
 * and provides AI-powered fix recommendations.
 * 
 * Features:
 * - Deep analysis of each discovered issue
 * - AI-generated fix recommendations
 * - Severity assessment with reasoning
 * - Root cause identification
 * - Connection to Trinity's thought pipeline
 */

import { GoogleGenerativeAI } from "@google/generative-ai";
import { DiagnosticIssue, DiagnosticSummary, PageAuditResult, WorkflowResult } from '../config/types';

const apiKey = process.env.GEMINI_API_KEY;
const genAI = apiKey ? new GoogleGenerativeAI(apiKey) : null;

export interface AIAnalysis {
  rootCause: string;
  fixRecommendation: string;
  codeSnippet?: string;
  filesLikelyAffected: string[];
  estimatedEffort: 'trivial' | 'easy' | 'medium' | 'complex';
  confidence: number;
  relatedIssues?: string[];
}

export interface TrinityThought {
  phase: 'perception' | 'deliberation' | 'planning' | 'execution' | 'reflection';
  content: string;
  confidence: number;
  timestamp: string;
}

export class TrinityDiagnosticsAgent {
  private thoughts: TrinityThought[] = [];
  private model = 'gemini-2.5-flash';
  
  constructor() {
    console.log('[TrinityDiagnosticsAgent] Initializing super debugging agent...');
  }
  
  private async recordThought(
    phase: TrinityThought['phase'],
    content: string,
    confidence: number = 0.8
  ): Promise<void> {
    const thought: TrinityThought = {
      phase,
      content,
      confidence,
      timestamp: new Date().toISOString()
    };
    
    this.thoughts.push(thought);
    console.log(`[Trinity:${phase}] ${content} (confidence: ${confidence})`);
  }
  
  async analyzeIssue(issue: DiagnosticIssue): Promise<AIAnalysis> {
    if (!genAI) {
      console.warn('[TrinityDiagnosticsAgent] No Gemini API key, using basic analysis');
      return this.basicAnalysis(issue);
    }
    
    await this.recordThought('perception', `Analyzing issue: ${issue.category} - ${issue.message}`, 0.9);
    
    try {
      const model = genAI.getGenerativeModel({ model: this.model });
      
      const prompt = `You are Trinity, an AI debugging expert for the CoAIleague workforce management platform.
Analyze this diagnostic issue and provide a structured fix recommendation.

ISSUE DETAILS:
- Category: ${issue.category}
- Severity: ${issue.severity}
- URL: ${issue.url}
- Message: ${issue.message}
- Details: ${issue.details || 'N/A'}
- Request URL: ${issue.requestUrl || 'N/A'}
- Status Code: ${issue.statusCode || 'N/A'}

CoAIleague is a workforce management platform with:
- Express.js backend (server/)
- React frontend with Vite (client/)
- PostgreSQL database with Drizzle ORM
- Core features: Scheduling, Payroll, Invoicing, Time Tracking
- AI features powered by Gemini

Respond in this exact JSON format:
{
  "rootCause": "Brief explanation of what's causing this issue",
  "fixRecommendation": "Step-by-step instructions to fix this",
  "codeSnippet": "Optional: relevant code fix if applicable",
  "filesLikelyAffected": ["list", "of", "file", "paths"],
  "estimatedEffort": "trivial|easy|medium|complex",
  "confidence": 0.0 to 1.0,
  "relatedIssues": ["other", "issues", "that", "may", "relate"]
}`;

      const result = await model.generateContent(prompt);
      const text = result.response.text();
      
      const jsonMatch = text.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);
        
        const analysis: AIAnalysis = {
          rootCause: String(parsed.rootCause || ''),
          fixRecommendation: Array.isArray(parsed.fixRecommendation) 
            ? parsed.fixRecommendation.join('\n') 
            : String(parsed.fixRecommendation || ''),
          codeSnippet: parsed.codeSnippet,
          filesLikelyAffected: Array.isArray(parsed.filesLikelyAffected) 
            ? parsed.filesLikelyAffected 
            : [],
          estimatedEffort: parsed.estimatedEffort || 'medium',
          confidence: typeof parsed.confidence === 'number' ? parsed.confidence : 0.5,
          relatedIssues: Array.isArray(parsed.relatedIssues) ? parsed.relatedIssues : undefined
        };
        
        await this.recordThought(
          'deliberation',
          `Root cause identified: ${analysis.rootCause}`,
          analysis.confidence
        );
        
        const fixPreview = analysis.fixRecommendation.substring(0, 100);
        await this.recordThought(
          'planning',
          `Fix strategy: ${fixPreview}...`,
          analysis.confidence
        );
        
        return analysis;
      }
      
      return this.basicAnalysis(issue);
    } catch (error) {
      console.error('[TrinityDiagnosticsAgent] AI analysis failed:', error);
      await this.recordThought('reflection', `Analysis failed, falling back to basic: ${error}`, 0.3);
      return this.basicAnalysis(issue);
    }
  }
  
  private basicAnalysis(issue: DiagnosticIssue): AIAnalysis {
    const filesMap: Record<string, string[]> = {
      'console_error': ['client/src/', 'shared/'],
      'network_failure': ['server/routes/', 'server/services/'],
      'broken_image': ['client/src/components/', 'client/src/assets/'],
      'broken_link': ['client/src/pages/', 'client/src/components/'],
      'captcha_blocker': ['server/middleware/', 'client/src/components/auth/'],
      'workflow_failure': ['server/routes/', 'client/src/pages/'],
      'ui_error': ['client/src/components/', 'client/src/pages/'],
      'timeout': ['server/services/', 'server/routes/'],
      'page_error': ['server/', 'client/src/']
    };
    
    const effortMap: Record<string, AIAnalysis['estimatedEffort']> = {
      'broken_image': 'trivial',
      'broken_link': 'easy',
      'console_error': 'easy',
      'ui_error': 'easy',
      'network_failure': 'medium',
      'timeout': 'medium',
      'workflow_failure': 'complex',
      'captcha_blocker': 'complex',
      'page_error': 'complex'
    };
    
    return {
      rootCause: `${issue.category} detected at ${issue.url}`,
      fixRecommendation: issue.recommendedFix || 'Review and fix the underlying issue',
      filesLikelyAffected: filesMap[issue.category] || ['server/', 'client/src/'],
      estimatedEffort: effortMap[issue.category] || 'medium',
      confidence: 0.5
    };
  }
  
  async analyzeSummary(summary: DiagnosticSummary): Promise<{
    overallHealth: number;
    criticalPath: string[];
    prioritizedFixes: Array<{ issue: DiagnosticIssue; analysis: AIAnalysis }>;
    estimatedTotalEffort: string;
    recommendations: string[];
  }> {
    await this.recordThought(
      'perception',
      `Analyzing full diagnostic summary: ${summary.totals.issuesFound} issues across ${summary.totals.pagesVisited} pages`,
      0.95
    );
    
    const criticalIssues = summary.issues.filter(i => i.severity === 'critical');
    const highIssues = summary.issues.filter(i => i.severity === 'high');
    const allPriorityIssues = [...criticalIssues, ...highIssues];
    
    await this.recordThought(
      'deliberation',
      `Found ${criticalIssues.length} critical and ${highIssues.length} high priority issues`,
      0.9
    );
    
    const prioritizedFixes: Array<{ issue: DiagnosticIssue; analysis: AIAnalysis }> = [];
    
    for (const issue of allPriorityIssues.slice(0, 10)) {
      const analysis = await this.analyzeIssue(issue);
      prioritizedFixes.push({ issue, analysis });
    }
    
    const healthScore = this.calculateHealthScore(summary);
    
    await this.recordThought(
      'reflection',
      `Overall platform health: ${(healthScore * 100).toFixed(1)}%`,
      0.85
    );
    
    const criticalPath = this.determineCriticalPath(prioritizedFixes);
    
    return {
      overallHealth: healthScore,
      criticalPath,
      prioritizedFixes,
      estimatedTotalEffort: this.estimateTotalEffort(prioritizedFixes),
      recommendations: this.generateRecommendations(summary, prioritizedFixes)
    };
  }
  
  private calculateHealthScore(summary: DiagnosticSummary): number {
    const weights = {
      critical: 25,
      high: 10,
      medium: 3,
      low: 1,
      info: 0
    };
    
    const totalPenalty = 
      summary.severityCounts.critical * weights.critical +
      summary.severityCounts.high * weights.high +
      summary.severityCounts.medium * weights.medium +
      summary.severityCounts.low * weights.low;
    
    const maxScore = 100;
    const score = Math.max(0, maxScore - totalPenalty);
    return score / maxScore;
  }
  
  private determineCriticalPath(fixes: Array<{ issue: DiagnosticIssue; analysis: AIAnalysis }>): string[] {
    return fixes
      .filter(f => f.issue.severity === 'critical' || f.issue.severity === 'high')
      .slice(0, 5)
      .map(f => `[${f.issue.severity.toUpperCase()}] ${f.issue.category}: ${f.analysis.fixRecommendation.substring(0, 80)}...`);
  }
  
  private estimateTotalEffort(fixes: Array<{ issue: DiagnosticIssue; analysis: AIAnalysis }>): string {
    const effortHours: Record<AIAnalysis['estimatedEffort'], number> = {
      'trivial': 0.25,
      'easy': 0.5,
      'medium': 2,
      'complex': 4
    };
    
    const totalHours = fixes.reduce((sum, f) => sum + effortHours[f.analysis.estimatedEffort], 0);
    
    if (totalHours < 1) return 'Under 1 hour';
    if (totalHours < 4) return `${totalHours.toFixed(1)} hours`;
    if (totalHours < 8) return 'Half day';
    if (totalHours < 16) return '1-2 days';
    return `${Math.ceil(totalHours / 8)} days`;
  }
  
  private generateRecommendations(
    summary: DiagnosticSummary, 
    fixes: Array<{ issue: DiagnosticIssue; analysis: AIAnalysis }>
  ): string[] {
    const recommendations: string[] = [];
    
    if (summary.severityCounts.critical > 0) {
      recommendations.push(`URGENT: Fix ${summary.severityCounts.critical} critical issues before launch`);
    }
    
    if (summary.totals.captchaBlockers > 0) {
      recommendations.push('Enable diagnostics bypass for testing (DIAG_BYPASS_CAPTCHA=true)');
    }
    
    if (summary.categoryCounts.network_failure > 3) {
      recommendations.push('Multiple API failures detected - check server logs and database connections');
    }
    
    if (summary.categoryCounts.console_error > 5) {
      recommendations.push('High JavaScript error count - run ESLint and fix warnings');
    }
    
    if (summary.severityCounts.high > 5) {
      recommendations.push('Consider running diagnostics nightly to catch regressions early');
    }
    
    return recommendations;
  }
  
  getThoughts(): TrinityThought[] {
    return [...this.thoughts];
  }
  
  exportThoughtsToJson(): string {
    return JSON.stringify(this.thoughts, null, 2);
  }
}

export const trinityDiagnosticsAgent = new TrinityDiagnosticsAgent();
