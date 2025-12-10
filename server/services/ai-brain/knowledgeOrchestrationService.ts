/**
 * AI BRAIN KNOWLEDGE ORCHESTRATION SERVICE - Gemini 3 Pro Powered
 * ================================================================
 * 
 * Advanced knowledge management and intelligent routing for AI Brain operations.
 * Implements real Gemini 3 Pro reasoning capabilities for:
 * 
 * - Knowledge Graph Management: Maintains relationships between platform entities
 * - Intelligent Query Routing: AI-powered routing to optimal model tier
 * - Context Enrichment: Gemini-enhanced context before AI processing
 * - Learning Pipeline: Captures successful interactions for improvement
 * - Cross-Domain Reasoning: Connects insights across different platform areas
 * - Deep Think Mode: Complex reasoning chains with step-by-step analysis
 * 
 * This service is the "thinking layer" between user requests and AI execution.
 */

import { GoogleGenerativeAI, GenerativeModel, SchemaType } from "@google/generative-ai";
import { GEMINI_MODELS, ANTI_YAP_PRESETS, createConfiguredModel, GeminiModelTier } from './providers/geminiClient';
import { modelRoutingEngine, RoutingContext as ModelRoutingContext, RoutingDecision as ModelRoutingDecision, recordModelResult } from './modelRoutingEngine';
import { db } from '../../db';
import { eq, and, desc, gte, sql } from 'drizzle-orm';

// ============================================================================
// TYPES
// ============================================================================

export interface KnowledgeNode {
  id: string;
  type: 'entity' | 'concept' | 'action' | 'relationship' | 'insight';
  domain: KnowledgeDomain;
  name: string;
  description: string;
  attributes: Record<string, any>;
  connections: string[];
  confidence: number;
  lastUpdated: Date;
  source: 'user_interaction' | 'system_learning' | 'explicit_definition' | 'ai_generated';
}

export type KnowledgeDomain = 
  | 'scheduling'
  | 'payroll'
  | 'employees'
  | 'clients'
  | 'compliance'
  | 'analytics'
  | 'automation'
  | 'gamification'
  | 'billing'
  | 'onboarding'
  | 'platform';

export interface QueryContext {
  userId: string;
  workspaceId?: string;
  userRole: string;
  conversationId?: string;
  previousQueries?: string[];
  currentPage?: string;
  recentActions?: string[];
}

export interface RoutingDecision {
  targetModel: string;
  modelTier: GeminiModelTier;
  preset: keyof typeof ANTI_YAP_PRESETS;
  enrichedContext: string;
  suggestedTools: string[];
  confidenceScore: number;
  reasoning: string;
  aiGenerated: boolean;
  contextBudget: number;
  fallbackChain: GeminiModelTier[];
}

export interface LearningEntry {
  id: string;
  queryType: string;
  userIntent: string;
  selectedRoute: string;
  wasSuccessful: boolean;
  executionTimeMs: number;
  userFeedback?: 'positive' | 'negative' | 'neutral';
  timestamp: Date;
  metadata: Record<string, any>;
}

export interface ReasoningChain {
  steps: ReasoningStep[];
  conclusion: string;
  confidence: number;
  supportingEvidence: string[];
  aiGenerated: boolean;
  modelUsed: string;
  tokensUsed: number;
}

export interface ReasoningStep {
  stepNumber: number;
  thought: string;
  observation: string;
  action?: string;
}

interface AIRoutingAnalysis {
  intent: string;
  domain: string;
  complexity: 'simple' | 'moderate' | 'complex';
  suggestedModel: string;
  suggestedTools: string[];
  reasoning: string;
  confidence: number;
}

// ============================================================================
// KNOWLEDGE ORCHESTRATION SERVICE - Gemini 3 Pro Powered
// ============================================================================

class KnowledgeOrchestrationService {
  private static instance: KnowledgeOrchestrationService;
  private knowledgeGraph: Map<string, KnowledgeNode> = new Map();
  private learningEntries: LearningEntry[] = [];
  private routingPatterns: Map<string, RoutingDecision> = new Map();
  private domainExperts: Map<KnowledgeDomain, string[]> = new Map();
  private genAI: GoogleGenerativeAI | null = null;
  private brainModel: GenerativeModel | null = null;
  private routingModel: GenerativeModel | null = null;

  static getInstance(): KnowledgeOrchestrationService {
    if (!this.instance) {
      this.instance = new KnowledgeOrchestrationService();
    }
    return this.instance;
  }

  constructor() {
    this.initializeGemini();
    this.initializeDomainExperts();
    this.initializeBaseKnowledge();
  }

  // ============================================================================
  // GEMINI INITIALIZATION
  // ============================================================================

  private initializeGemini(): void {
    const apiKey = process.env.GEMINI_API_KEY;
    
    if (!apiKey) {
      console.warn("[KnowledgeOrchestration] GEMINI_API_KEY not found - AI features disabled");
      return;
    }

    this.genAI = new GoogleGenerativeAI(apiKey);
    
    // Brain model for complex reasoning (Gemini 3 Pro)
    this.brainModel = this.genAI.getGenerativeModel({
      model: GEMINI_MODELS.BRAIN,
      generationConfig: {
        maxOutputTokens: ANTI_YAP_PRESETS.orchestrator.maxTokens,
        temperature: 0.7,
        responseMimeType: "application/json",
      }
    });

    // Routing model for quick decisions (Gemini 2.5 Flash)
    this.routingModel = this.genAI.getGenerativeModel({
      model: GEMINI_MODELS.CONVERSATIONAL,
      generationConfig: {
        maxOutputTokens: 500,
        temperature: 0.3,
        responseMimeType: "application/json",
      }
    });

    console.log("[KnowledgeOrchestration] Gemini 3 Pro AI Brain initialized");
  }

  private initializeDomainExperts(): void {
    this.domainExperts.set('scheduling', [
      'scheduling.create_shift', 'scheduling.view_schedule', 'scheduling.assign_employees',
      'scheduling.check_conflicts', 'scheduling.auto_generate', 'scheduling.swap_shifts'
    ]);
    this.domainExperts.set('payroll', [
      'payroll.calculate', 'payroll.preview', 'payroll.process',
      'payroll.view_history', 'payroll.export_report', 'payroll.tax_summary'
    ]);
    this.domainExperts.set('employees', [
      'employees.list', 'employees.get_details', 'employees.update_profile',
      'employees.assign_role', 'employees.view_performance', 'employees.invite'
    ]);
    this.domainExperts.set('compliance', [
      'compliance.check_status', 'compliance.view_certifications',
      'compliance.generate_report', 'compliance.alert_expiring', 'compliance.breaks'
    ]);
    this.domainExperts.set('analytics', [
      'analytics.dashboard_summary', 'analytics.generate_report',
      'analytics.trend_analysis', 'analytics.kpi_metrics', 'analytics.heatmap'
    ]);
    this.domainExperts.set('automation', [
      'automation.list_rules', 'automation.create_workflow', 'automation.execute',
      'automation.view_history', 'automation.toggle', 'automation.configure'
    ]);
    this.domainExperts.set('billing', [
      'billing.create_invoice', 'billing.process_payment', 'billing.view_balance',
      'billing.subscription_status', 'billing.credits'
    ]);
    this.domainExperts.set('onboarding', [
      'onboarding.start_wizard', 'onboarding.import_data', 'onboarding.configure_workspace',
      'onboarding.invite_team', 'onboarding.tutorial'
    ]);

    console.log(`[KnowledgeOrchestration] Initialized ${this.domainExperts.size} domain experts`);
  }

  private initializeBaseKnowledge(): void {
    const coreNodes: KnowledgeNode[] = [
      {
        id: 'platform-core',
        type: 'concept',
        domain: 'platform',
        name: 'CoAIleague Platform',
        description: 'AI-powered workforce management platform with multi-tenant architecture, RBAC security, and autonomous AI Brain orchestration',
        attributes: { version: '2.0', tier: 'enterprise', aiEnabled: true },
        connections: ['scheduling', 'payroll', 'employees', 'analytics', 'trinity-ai'],
        confidence: 1.0,
        lastUpdated: new Date(),
        source: 'explicit_definition',
      },
      {
        id: 'trinity-ai',
        type: 'entity',
        domain: 'platform',
        name: 'Trinity AI',
        description: 'AI mascot providing workspace-isolated intelligent assistance with persona-based interactions',
        attributes: { 
          personas: ['onboarding_guide', 'business_buddy', 'support_partner', 'executive_advisor'],
          modes: ['demo', 'business', 'guru']
        },
        connections: ['platform-core', 'automation', 'gemini-brain'],
        confidence: 1.0,
        lastUpdated: new Date(),
        source: 'explicit_definition',
      },
      {
        id: 'gemini-brain',
        type: 'entity',
        domain: 'platform',
        name: 'AI Brain (Gemini 3 Pro)',
        description: 'Gemini 3 Pro powered orchestration engine with native tool use, 1M context window, and Deep Think mode',
        attributes: { 
          tiers: ['BRAIN', 'ORCHESTRATOR', 'CONVERSATIONAL', 'SIMPLE'],
          capabilities: ['function_calling', 'deep_reasoning', 'planning', 'tool_use', 'code_analysis'],
          features: ['1M_context', 'native_tools', 'multi_turn', 'structured_output']
        },
        connections: ['trinity-ai', 'platform-core', 'knowledge-orchestration'],
        confidence: 1.0,
        lastUpdated: new Date(),
        source: 'explicit_definition',
      },
      {
        id: 'knowledge-orchestration',
        type: 'concept',
        domain: 'platform',
        name: 'Knowledge Orchestration',
        description: 'Intelligent routing and reasoning layer that connects user queries to optimal AI processing paths',
        attributes: { 
          routing: ['intent_classification', 'domain_detection', 'complexity_analysis'],
          learning: ['success_tracking', 'pattern_recognition', 'feedback_loop']
        },
        connections: ['gemini-brain', 'trinity-ai'],
        confidence: 1.0,
        lastUpdated: new Date(),
        source: 'explicit_definition',
      }
    ];

    for (const node of coreNodes) {
      this.knowledgeGraph.set(node.id, node);
    }

    console.log(`[KnowledgeOrchestration] Initialized ${this.knowledgeGraph.size} base knowledge nodes`);
  }

  // ============================================================================
  // AI-POWERED INTELLIGENT QUERY ROUTING
  // ============================================================================

  /**
   * Analyze query and determine optimal routing using Gemini AI
   */
  async routeQuery(
    query: string,
    context: QueryContext
  ): Promise<RoutingDecision> {
    const startTime = Date.now();

    // Try AI-powered routing first
    if (this.routingModel) {
      try {
        const aiDecision = await this.aiPoweredRouting(query, context);
        console.log(`[KnowledgeOrchestration] AI-powered routing completed in ${Date.now() - startTime}ms`);
        return aiDecision;
      } catch (error) {
        console.warn(`[KnowledgeOrchestration] AI routing failed, falling back to rule-based:`, error);
      }
    }

    // Fallback to rule-based routing
    return this.ruleBasedRouting(query, context, startTime);
  }

  /**
   * Use Gemini AI for intelligent query routing
   */
  private async aiPoweredRouting(
    query: string,
    context: QueryContext
  ): Promise<RoutingDecision> {
    const prompt = `You are an AI routing expert for the CoAIleague workforce management platform.
Analyze this user query and determine the optimal processing path.

USER QUERY: "${query}"

USER CONTEXT:
- Role: ${context.userRole}
- Workspace: ${context.workspaceId || 'not specified'}
- Current Page: ${context.currentPage || 'unknown'}
- Previous Queries: ${context.previousQueries?.slice(-2).join(' -> ') || 'none'}

AVAILABLE DOMAINS: scheduling, payroll, employees, clients, compliance, analytics, automation, gamification, billing, onboarding, platform

AVAILABLE MODEL TIERS:
- BRAIN (gemini-3-pro): Complex reasoning, diagnostics, multi-step planning
- ORCHESTRATOR (gemini-3-pro): Workflow automation, function calling
- CONVERSATIONAL (gemini-2.5-flash): Chat, quick responses, Trinity thoughts
- SIMPLE (gemini-1.5-flash-8b): Quick lookups, status checks

Respond with JSON:
{
  "intent": "creation|retrieval|modification|deletion|analysis|diagnostic|conversational|instructional",
  "domain": "scheduling|payroll|employees|etc",
  "complexity": "simple|moderate|complex",
  "suggestedModel": "BRAIN|ORCHESTRATOR|CONVERSATIONAL|SIMPLE",
  "suggestedTools": ["tool1", "tool2"],
  "reasoning": "Brief explanation of routing decision",
  "confidence": 0.0-1.0
}`;

    const result = await this.routingModel!.generateContent(prompt);
    const text = result.response.text();
    const tokensUsed = (result.response.usageMetadata?.totalTokenCount || 0);
    
    try {
      const analysis: AIRoutingAnalysis = JSON.parse(text);
      
      const targetModel = GEMINI_MODELS[analysis.suggestedModel as keyof typeof GEMINI_MODELS] || GEMINI_MODELS.CONVERSATIONAL;
      const preset = this.mapModelToPreset(analysis.suggestedModel, analysis.complexity);
      const enrichedContext = await this.enrichContext(query, analysis.domain as KnowledgeDomain, context);

      // Use ModelRoutingEngine for tier selection and fallback chain
      const routingContext: ModelRoutingContext = {
        domain: analysis.domain,
        action: analysis.intent,
        complexity: analysis.complexity === 'complex' ? 'critical' : analysis.complexity === 'moderate' ? 'high' : 'low',
        toolsRequired: analysis.suggestedTools,
        workspaceId: context.workspaceId,
        userId: context.userId,
      };

      const engineDecision = modelRoutingEngine.route(routingContext);

      const decision: RoutingDecision = {
        targetModel,
        modelTier: engineDecision.selectedTier,
        preset,
        enrichedContext,
        suggestedTools: analysis.suggestedTools || [],
        confidenceScore: analysis.confidence,
        reasoning: `AI Analysis: ${analysis.reasoning} | ${engineDecision.reason}`,
        aiGenerated: true,
        contextBudget: engineDecision.contextBudget,
        fallbackChain: engineDecision.fallbackChain,
      };

      // Cache successful routing
      const patternKey = `${analysis.intent}-${analysis.domain}-${analysis.complexity}`;
      this.routingPatterns.set(patternKey, decision);

      return decision;
    } catch (parseError) {
      throw new Error(`Failed to parse AI routing response: ${parseError}`);
    }
  }

  private mapModelToPreset(model: string, complexity: string): keyof typeof ANTI_YAP_PRESETS {
    if (model === 'BRAIN' || model === 'DIAGNOSTICS') return 'diagnostics';
    if (model === 'ORCHESTRATOR') return 'orchestrator';
    if (complexity === 'simple') return 'simple';
    return 'helpai';
  }

  /**
   * Rule-based fallback routing - now integrates with ModelRoutingEngine
   */
  private ruleBasedRouting(
    query: string,
    context: QueryContext,
    startTime: number
  ): RoutingDecision {
    const intent = this.classifyIntent(query);
    const domain = this.identifyDomain(query, intent);
    const complexity = this.calculateComplexity(query, context);
    const suggestedTools = this.suggestTools(domain, intent);
    const confidence = this.calculateRoutingConfidence(intent, domain, complexity);

    // Use ModelRoutingEngine for intelligent tier selection
    const routingContext: ModelRoutingContext = {
      domain,
      action: intent,
      complexity: complexity === 'complex' ? 'critical' : complexity === 'moderate' ? 'high' : 'low',
      toolsRequired: suggestedTools,
      workspaceId: context.workspaceId,
      userId: context.userId,
    };

    const engineDecision = modelRoutingEngine.route(routingContext);

    const decision: RoutingDecision = {
      targetModel: engineDecision.selectedModel,
      modelTier: engineDecision.selectedTier,
      preset: engineDecision.antiYapPreset,
      enrichedContext: `User Role: ${context.userRole}, Domain: ${domain}, Intent: ${intent}`,
      suggestedTools,
      confidenceScore: confidence,
      reasoning: `ModelRoutingEngine: ${engineDecision.reason}`,
      aiGenerated: false,
      contextBudget: engineDecision.contextBudget,
      fallbackChain: engineDecision.fallbackChain,
    };

    console.log(`[KnowledgeOrchestration] Rule-based routing via ModelRoutingEngine in ${Date.now() - startTime}ms`);
    return decision;
  }

  private classifyIntent(query: string): string {
    const lowerQuery = query.toLowerCase();
    if (lowerQuery.match(/^(what|who|where|when|how|why|can|could|would|should|is|are|do|does)/)) {
      if (lowerQuery.includes('how to') || lowerQuery.includes('how do')) return 'instructional';
      if (lowerQuery.includes('why')) return 'explanatory';
      return 'informational';
    }
    if (lowerQuery.match(/^(create|make|add|generate|build|setup|configure)/)) return 'creation';
    if (lowerQuery.match(/^(update|change|modify|edit|fix|adjust)/)) return 'modification';
    if (lowerQuery.match(/^(delete|remove|cancel|stop|disable)/)) return 'deletion';
    if (lowerQuery.match(/^(show|display|list|view|get|find|search|look)/)) return 'retrieval';
    if (lowerQuery.match(/^(analyze|calculate|compute|compare|measure)/)) return 'analysis';
    if (lowerQuery.match(/^(schedule|assign|allocate|distribute)/)) return 'scheduling';
    if (lowerQuery.match(/^(approve|reject|review|validate)/)) return 'approval';
    if (lowerQuery.includes('error') || lowerQuery.includes('problem') || lowerQuery.includes('issue')) return 'diagnostic';
    return 'conversational';
  }

  private identifyDomain(query: string, intent: string): KnowledgeDomain {
    const lowerQuery = query.toLowerCase();
    if (lowerQuery.match(/schedule|shift|calendar|roster|assign|availability|time.?off|pto/)) return 'scheduling';
    if (lowerQuery.match(/payroll|salary|wage|pay|compensation|tax|deduction|overtime|bonus/)) return 'payroll';
    if (lowerQuery.match(/employee|staff|worker|team|member|hire|onboard|profile|performance/)) return 'employees';
    if (lowerQuery.match(/client|customer|account|contract|invoice|billing/)) return 'clients';
    if (lowerQuery.match(/compliance|certification|license|regulation|audit|requirement|document|expir/)) return 'compliance';
    if (lowerQuery.match(/report|analytic|metric|dashboard|trend|kpi|insight|data|chart|graph/)) return 'analytics';
    if (lowerQuery.match(/automat|workflow|rule|trigger|action|bot|ai|intelligent/)) return 'automation';
    if (lowerQuery.match(/gamif|badge|achievement|point|leaderboard|reward|challenge|engagement/)) return 'gamification';
    if (lowerQuery.match(/bill|subscription|plan|upgrade|credit|charge|payment/)) return 'billing';
    if (lowerQuery.match(/onboard|setup|start|begin|welcome|new.*org|import|migrat/)) return 'onboarding';
    return 'platform';
  }

  private calculateComplexity(query: string, context: QueryContext): 'simple' | 'moderate' | 'complex' {
    let score = 0;
    if (query.length > 200) score += 2;
    else if (query.length > 100) score += 1;
    if (query.includes(' and ') || query.includes(' then ') || query.includes(' also ')) score += 2;
    if (query.includes('if ') || query.includes('when ') || query.includes('unless ')) score += 1;
    const domains = ['schedule', 'payroll', 'employee', 'client', 'compliance', 'report'];
    const domainMentions = domains.filter(d => query.toLowerCase().includes(d)).length;
    score += Math.min(domainMentions, 3);
    if (context.previousQueries && context.previousQueries.length > 2) score += 1;
    if (query.match(/compare|trend|pattern|correlation|forecast|predict|optimize/i)) score += 2;
    if (score >= 5) return 'complex';
    if (score >= 2) return 'moderate';
    return 'simple';
  }

  private selectModel(intent: string, complexity: string, domain: KnowledgeDomain): string {
    if (complexity === 'complex' || intent === 'diagnostic' || intent === 'analysis') return GEMINI_MODELS.BRAIN;
    if (intent === 'creation' || intent === 'scheduling' || domain === 'automation') return GEMINI_MODELS.ORCHESTRATOR;
    if (intent === 'conversational' || intent === 'informational') return GEMINI_MODELS.CONVERSATIONAL;
    if (complexity === 'simple' && (intent === 'retrieval' || intent === 'informational')) return GEMINI_MODELS.SIMPLE;
    return GEMINI_MODELS.CONVERSATIONAL;
  }

  private selectPreset(intent: string, complexity: string): keyof typeof ANTI_YAP_PRESETS {
    if (intent === 'diagnostic') return 'diagnostics';
    if (intent === 'analysis' && complexity === 'complex') return 'orchestrator';
    if (intent === 'creation' || intent === 'scheduling') return 'orchestrator';
    if (complexity === 'simple') return 'simple';
    if (intent === 'informational' || intent === 'retrieval') return 'lookup';
    return 'helpai';
  }

  private async enrichContext(query: string, domain: KnowledgeDomain, context: QueryContext): Promise<string> {
    const contextParts: string[] = [];
    contextParts.push(`User Role: ${context.userRole}`);
    if (context.workspaceId) contextParts.push(`Workspace: ${context.workspaceId}`);
    if (context.currentPage) contextParts.push(`Current Page: ${context.currentPage}`);
    const domainNode = Array.from(this.knowledgeGraph.values()).find(n => n.domain === domain && n.type === 'concept');
    if (domainNode) contextParts.push(`Domain Context: ${domainNode.description}`);
    if (context.recentActions?.length) contextParts.push(`Recent Actions: ${context.recentActions.slice(0, 3).join(', ')}`);
    if (context.previousQueries?.length) contextParts.push(`Previous Queries: ${context.previousQueries.slice(-2).join(' -> ')}`);
    return contextParts.join('\n');
  }

  private suggestTools(domain: KnowledgeDomain, intent: string): string[] {
    const domainTools = this.domainExperts.get(domain) || [];
    if (intent === 'retrieval' || intent === 'informational') {
      return domainTools.filter(t => t.includes('list') || t.includes('get') || t.includes('view'));
    }
    if (intent === 'creation') {
      return domainTools.filter(t => t.includes('create') || t.includes('generate') || t.includes('add'));
    }
    if (intent === 'modification') {
      return domainTools.filter(t => t.includes('update') || t.includes('modify') || t.includes('edit'));
    }
    return domainTools.slice(0, 5);
  }

  private calculateRoutingConfidence(intent: string, domain: KnowledgeDomain, complexity: string): number {
    let confidence = 0.5;
    if (['creation', 'retrieval', 'modification', 'deletion', 'analysis'].includes(intent)) confidence += 0.2;
    if (domain !== 'platform') confidence += 0.15;
    if (complexity === 'simple') confidence += 0.1;
    else if (complexity === 'complex') confidence -= 0.1;
    return Math.min(Math.max(confidence, 0), 1);
  }

  // ============================================================================
  // AI-POWERED REASONING CHAIN (Deep Think Mode)
  // ============================================================================

  /**
   * Build a reasoning chain using Gemini 3 Pro Deep Think capabilities
   */
  async buildReasoningChain(
    query: string,
    context: QueryContext,
    observations: string[]
  ): Promise<ReasoningChain> {
    const startTime = Date.now();

    // Try AI-powered reasoning first
    if (this.brainModel) {
      try {
        return await this.aiPoweredReasoning(query, context, observations);
      } catch (error) {
        console.warn(`[KnowledgeOrchestration] AI reasoning failed, falling back to rule-based:`, error);
      }
    }

    // Fallback to template-based reasoning
    return this.templateBasedReasoning(query, context, observations);
  }

  /**
   * Use Gemini 3 Pro for deep reasoning with step-by-step analysis
   */
  private async aiPoweredReasoning(
    query: string,
    context: QueryContext,
    observations: string[]
  ): Promise<ReasoningChain> {
    const prompt = `You are an AI Brain orchestrator for CoAIleague workforce management platform.
Perform deep step-by-step reasoning to analyze this query and determine the best action plan.

USER QUERY: "${query}"

CONTEXT:
- User Role: ${context.userRole}
- Workspace: ${context.workspaceId || 'not specified'}
- Previous Queries: ${context.previousQueries?.slice(-3).join(' -> ') || 'none'}

OBSERVATIONS FROM SYSTEM:
${observations.length > 0 ? observations.map((o, i) => `${i + 1}. ${o}`).join('\n') : 'None yet'}

AVAILABLE CAPABILITIES:
- Scheduling: Create/view/modify shifts, check conflicts, auto-generate schedules
- Payroll: Calculate, preview, process, export reports
- Employees: List, view details, update profiles, assign roles
- Compliance: Check status, view certifications, generate reports
- Analytics: Dashboard summaries, trend analysis, KPI metrics
- Automation: Create workflows, execute rules, view history
- Billing: Create invoices, process payments, view balance

Think step-by-step and respond with JSON:
{
  "steps": [
    {
      "stepNumber": 1,
      "thought": "What I'm analyzing at this step",
      "observation": "What I discovered",
      "action": "Optional action to take"
    }
  ],
  "conclusion": "Final recommendation or answer",
  "confidence": 0.0-1.0,
  "supportingEvidence": ["evidence1", "evidence2"]
}`;

    const result = await this.brainModel!.generateContent(prompt);
    const text = result.response.text();
    const tokensUsed = result.response.usageMetadata?.totalTokenCount || 0;

    try {
      const parsed = JSON.parse(text);
      return {
        steps: parsed.steps || [],
        conclusion: parsed.conclusion || 'Analysis complete',
        confidence: parsed.confidence || 0.7,
        supportingEvidence: parsed.supportingEvidence || [],
        aiGenerated: true,
        modelUsed: GEMINI_MODELS.BRAIN,
        tokensUsed,
      };
    } catch (parseError) {
      throw new Error(`Failed to parse reasoning response: ${parseError}`);
    }
  }

  private templateBasedReasoning(
    query: string,
    context: QueryContext,
    observations: string[]
  ): ReasoningChain {
    const intent = this.classifyIntent(query);
    const domain = this.identifyDomain(query, intent);
    const suggestedTools = this.suggestTools(domain, intent);

    const steps: ReasoningStep[] = [
      { stepNumber: 1, thought: 'Analyzing user query intent', observation: `Classified intent: ${intent}`, action: 'classify_intent' },
      { stepNumber: 2, thought: 'Identifying primary domain', observation: `Domain: ${domain}, Tools available: ${suggestedTools.length}`, action: 'identify_domain' },
      { stepNumber: 3, thought: 'Enriching with context', observation: `User role: ${context.userRole}`, action: 'enrich_context' },
      { stepNumber: 4, thought: 'Planning execution', observation: `Suggested tools: ${suggestedTools.slice(0, 3).join(', ')}`, action: 'select_tools' },
    ];

    observations.forEach((obs, i) => {
      steps.push({ stepNumber: steps.length + 1, thought: 'Processing observation', observation: obs, action: 'process' });
    });

    return {
      steps,
      conclusion: `Query can be addressed through ${domain} domain with ${suggestedTools.length} available tools`,
      confidence: 0.6,
      supportingEvidence: observations,
      aiGenerated: false,
      modelUsed: 'rule-based',
      tokensUsed: 0,
    };
  }

  // ============================================================================
  // KNOWLEDGE GRAPH OPERATIONS
  // ============================================================================

  addKnowledgeNode(node: KnowledgeNode): void {
    this.knowledgeGraph.set(node.id, node);
    console.log(`[KnowledgeOrchestration] Added/updated node: ${node.id}`);
  }

  queryKnowledge(domain: KnowledgeDomain, nodeType?: KnowledgeNode['type']): KnowledgeNode[] {
    return Array.from(this.knowledgeGraph.values()).filter(node => {
      const matchesDomain = node.domain === domain;
      const matchesType = !nodeType || node.type === nodeType;
      return matchesDomain && matchesType;
    });
  }

  findConnections(nodeId: string, depth: number = 2): KnowledgeNode[] {
    const visited = new Set<string>();
    const result: KnowledgeNode[] = [];
    const traverse = (id: string, currentDepth: number) => {
      if (currentDepth > depth || visited.has(id)) return;
      visited.add(id);
      const node = this.knowledgeGraph.get(id);
      if (node) {
        result.push(node);
        for (const connectionId of node.connections) {
          traverse(connectionId, currentDepth + 1);
        }
      }
    };
    traverse(nodeId, 0);
    return result;
  }

  // ============================================================================
  // LEARNING PIPELINE
  // ============================================================================

  recordLearning(entry: Omit<LearningEntry, 'id' | 'timestamp'>): void {
    const learningEntry: LearningEntry = {
      ...entry,
      id: `learn-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      timestamp: new Date(),
    };
    this.learningEntries.push(learningEntry);
    if (this.learningEntries.length > 1000) {
      this.learningEntries = this.learningEntries.slice(-1000);
    }
    console.log(`[KnowledgeOrchestration] Recorded learning entry: ${learningEntry.id}`);
  }

  getLearningInsights(queryType: string): {
    successRate: number;
    avgExecutionTime: number;
    commonRoutes: string[];
    recommendations: string[];
  } {
    const relevantEntries = this.learningEntries.filter(e => e.queryType === queryType);
    if (relevantEntries.length === 0) {
      return { successRate: 0, avgExecutionTime: 0, commonRoutes: [], recommendations: ['No learning data available'] };
    }
    const successCount = relevantEntries.filter(e => e.wasSuccessful).length;
    const successRate = successCount / relevantEntries.length;
    const avgExecutionTime = relevantEntries.reduce((sum, e) => sum + e.executionTimeMs, 0) / relevantEntries.length;
    const routeCounts = new Map<string, number>();
    for (const entry of relevantEntries) {
      routeCounts.set(entry.selectedRoute, (routeCounts.get(entry.selectedRoute) || 0) + 1);
    }
    const commonRoutes = Array.from(routeCounts.entries()).sort((a, b) => b[1] - a[1]).slice(0, 3).map(([route]) => route);
    const recommendations: string[] = [];
    if (successRate < 0.7) recommendations.push('Consider using a more capable model tier');
    if (avgExecutionTime > 5000) recommendations.push('Query optimization may improve response times');
    return { successRate, avgExecutionTime, commonRoutes, recommendations };
  }

  // ============================================================================
  // DIAGNOSTICS
  // ============================================================================

  getDiagnostics(): {
    knowledgeNodeCount: number;
    domainCoverage: Record<string, number>;
    learningEntryCount: number;
    routingPatternCount: number;
    recentSuccessRate: number;
    geminiEnabled: boolean;
    modelTiers: typeof GEMINI_MODELS;
  } {
    const domainCoverage: Record<string, number> = {};
    for (const node of this.knowledgeGraph.values()) {
      domainCoverage[node.domain] = (domainCoverage[node.domain] || 0) + 1;
    }
    const recentEntries = this.learningEntries.slice(-100);
    const recentSuccessRate = recentEntries.length > 0
      ? recentEntries.filter(e => e.wasSuccessful).length / recentEntries.length
      : 0;

    return {
      knowledgeNodeCount: this.knowledgeGraph.size,
      domainCoverage,
      learningEntryCount: this.learningEntries.length,
      routingPatternCount: this.routingPatterns.size,
      recentSuccessRate,
      geminiEnabled: !!this.brainModel,
      modelTiers: GEMINI_MODELS,
    };
  }
}

export const knowledgeOrchestrationService = KnowledgeOrchestrationService.getInstance();
