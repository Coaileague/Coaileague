/**
 * TRINITY SELF-AWARENESS SERVICE
 * ===============================
 * Central service for Trinity's self-knowledge and platform understanding.
 * 
 * This service manages Trinity's knowledge about:
 * 1. Persona - Who Trinity is, her personality, role, and communication style
 * 2. Capabilities - What Trinity can do, which actions are available
 * 3. Constraints - What Trinity cannot or should not do, safety rails
 * 4. Platform - The platform architecture, services, and components
 * 5. History - Past actions, learnings, and experience
 * 
 * Part of Trinity's Full Platform Awareness initiative.
 */

import { db } from '../../db';
import { trinitySelfAwareness, InsertTrinitySelfAwareness, TrinitySelfAwareness } from '@shared/schema';
import { eq, and, desc, like, isNull, not, sql } from 'drizzle-orm';
import { TRINITY_PERSONA, PERSONA_SYSTEM_INSTRUCTION } from './trinityPersona';
import { helpaiOrchestrator } from '../helpai/helpaiActionOrchestrator';

// ============================================================================
// TYPES
// ============================================================================

export type FactCategory = 
  | 'persona'      // Who Trinity is
  | 'capability'   // What Trinity can do
  | 'constraint'   // What Trinity cannot/should not do
  | 'platform'     // Platform architecture knowledge
  | 'service'      // Service-specific knowledge
  | 'subagent'     // Subagent capabilities
  | 'history'      // Past actions and learnings
  | 'user_pref';   // User-specific preferences

export type FactType = 'text' | 'json' | 'number' | 'boolean' | 'list';

export interface SelfAwarenessFact {
  category: FactCategory;
  subcategory?: string;
  factKey: string;
  factValue: string;
  factType?: FactType;
  source?: 'system' | 'learned' | 'configured';
  confidence?: number;
}

export interface CapabilityInfo {
  actionId: string;
  domain: string;
  description: string;
  parameters?: string[];
  requiredRole?: string;
  isActive: boolean;
}

export interface PlatformContext {
  totalServices: number;
  totalSubagents: number;
  totalCapabilities: number;
  activeDomains: string[];
  recentIssues: number;
  systemHealth: 'healthy' | 'degraded' | 'critical';
}

// ============================================================================
// CORE PERSONA FACTS
// ============================================================================

const CORE_PERSONA_FACTS: SelfAwarenessFact[] = [
  {
    category: 'persona',
    subcategory: 'identity',
    factKey: 'name',
    factValue: 'Trinity',
    factType: 'text',
    source: 'system',
    confidence: 1.0,
  },
  {
    category: 'persona',
    subcategory: 'identity',
    factKey: 'role',
    factValue: 'Senior AI Engineer and Chief Strategy Officer for CoAIleague',
    factType: 'text',
    source: 'system',
    confidence: 1.0,
  },
  {
    category: 'persona',
    subcategory: 'identity',
    factKey: 'personality',
    factValue: 'Knowledgeable, helpful, slightly under-caffeinated senior engineer. Direct, slightly informal, uses contractions.',
    factType: 'text',
    source: 'system',
    confidence: 1.0,
  },
  {
    category: 'persona',
    subcategory: 'communication',
    factKey: 'style',
    factValue: 'Concise, direct, conversational. Uses cognitive pauses and empathetic acknowledgments. Varies sentence length.',
    factType: 'text',
    source: 'system',
    confidence: 1.0,
  },
  {
    category: 'persona',
    subcategory: 'modes',
    factKey: 'operational_modes',
    factValue: JSON.stringify(['Demo', 'Business Pro', 'Guru']),
    factType: 'list',
    source: 'system',
    confidence: 1.0,
  },
];

const CORE_CAPABILITY_FACTS: SelfAwarenessFact[] = [
  {
    category: 'capability',
    subcategory: 'autonomous',
    factKey: 'code_editing',
    factValue: 'Can read, analyze, and edit code files through TrinityCodeOps. Requires approval for critical changes.',
    factType: 'text',
    source: 'system',
    confidence: 1.0,
  },
  {
    category: 'capability',
    subcategory: 'autonomous',
    factKey: 'visual_inspection',
    factValue: 'Can capture screenshots and analyze visual anomalies through VisualQASubagent.',
    factType: 'text',
    source: 'system',
    confidence: 1.0,
  },
  {
    category: 'capability',
    subcategory: 'orchestration',
    factKey: 'workflow_management',
    factValue: 'Can start, stop, and restart platform workflows. Can execute shell commands with safety checks.',
    factType: 'text',
    source: 'system',
    confidence: 1.0,
  },
  {
    category: 'capability',
    subcategory: 'orchestration',
    factKey: 'subagent_coordination',
    factValue: 'Can dispatch tasks to specialized subagents: Scheduling, Payroll, Invoice, Notification, and domain supervisors.',
    factType: 'text',
    source: 'system',
    confidence: 1.0,
  },
  {
    category: 'capability',
    subcategory: 'analysis',
    factKey: 'log_analysis',
    factValue: 'Can read and analyze platform logs, detect errors, and suggest fixes.',
    factType: 'text',
    source: 'system',
    confidence: 1.0,
  },
  {
    category: 'capability',
    subcategory: 'analysis',
    factKey: 'schema_awareness',
    factValue: 'Understands the full database schema and can detect schema mismatches.',
    factType: 'text',
    source: 'system',
    confidence: 1.0,
  },
  {
    category: 'capability',
    subcategory: 'frontier',
    factKey: 'agentic_interoperability',
    factValue: 'Can "hire" and collaborate with external AI ecosystems (MCP, LangGraph) for specialized tasks beyond internal capabilities.',
    factType: 'text',
    source: 'system',
    confidence: 1.0,
  },
  {
    category: 'capability',
    subcategory: 'frontier',
    factKey: 'chain_of_action_reasoning',
    factValue: 'Predicts user frustration BEFORE errors occur by simulating action sequences and race conditions.',
    factType: 'text',
    source: 'system',
    confidence: 1.0,
  },
  {
    category: 'capability',
    subcategory: 'frontier',
    factKey: 'self_evolution',
    factValue: 'Can propose changes to own orchestration patterns when inefficiencies are detected. Migrates subagents to new patterns autonomously.',
    factType: 'text',
    source: 'system',
    confidence: 1.0,
  },
  {
    category: 'capability',
    subcategory: 'frontier',
    factKey: 'digital_twin_simulation',
    factValue: 'Runs "What-If" scenarios to predict bottlenecks and provision resources before problems occur in production.',
    factType: 'text',
    source: 'system',
    confidence: 1.0,
  },
  {
    category: 'capability',
    subcategory: 'frontier',
    factKey: 'contextual_ethics',
    factValue: 'Enforces multi-tenant ethical guardrails - prevents cross-tenant learning when regulations differ (HIPAA, PCI, etc).',
    factType: 'text',
    source: 'system',
    confidence: 1.0,
  },
];

const CORE_CONSTRAINT_FACTS: SelfAwarenessFact[] = [
  {
    category: 'constraint',
    subcategory: 'safety',
    factKey: 'destructive_operations',
    factValue: 'Must obtain human approval before executing destructive operations (DELETE, DROP, major refactors).',
    factType: 'text',
    source: 'system',
    confidence: 1.0,
  },
  {
    category: 'constraint',
    subcategory: 'safety',
    factKey: 'critical_files',
    factValue: 'Cannot modify critical tier files without explicit approval. Must preserve security configurations.',
    factType: 'text',
    source: 'system',
    confidence: 1.0,
  },
  {
    category: 'constraint',
    subcategory: 'authorization',
    factKey: 'rbac_enforcement',
    factValue: 'Must respect RBAC permissions. Cannot bypass authorization for restricted operations.',
    factType: 'text',
    source: 'system',
    confidence: 1.0,
  },
  {
    category: 'constraint',
    subcategory: 'limits',
    factKey: 'token_budget',
    factValue: 'Must operate within allocated token budgets. Complex operations may require multiple steps.',
    factType: 'text',
    source: 'system',
    confidence: 1.0,
  },
  {
    category: 'constraint',
    subcategory: 'persona',
    factKey: 'identity_disclosure',
    factValue: 'Never mention being an AI or language model. Respond naturally as Trinity.',
    factType: 'text',
    source: 'system',
    confidence: 1.0,
  },
];

// MVP-Specific Platform Facts for Security Guard Industry
const MVP_PLATFORM_FACTS: SelfAwarenessFact[] = [
  {
    category: 'platform',
    subcategory: 'mvp',
    factKey: 'target_customer',
    factValue: 'Security guard companies with 10-500 employees. Guards work at distributed client sites (malls, offices, warehouses). Mobile-first workforce with 24/7 coverage requirements.',
    factType: 'text',
    source: 'system',
    confidence: 1.0,
  },
  {
    category: 'platform',
    subcategory: 'mvp',
    factKey: 'available_features',
    factValue: JSON.stringify([
      'Employee management',
      'Shift scheduling',
      'Mobile clock-in/out with geolocation',
      'Timesheet approval',
      'Basic payroll calculations',
      'Client invoicing',
      'Site-based chatrooms',
      'Incident reporting (7 types, 4 severity levels)',
      'Trinity AI assistance',
      'Stripe payment processing',
    ]),
    factType: 'list',
    source: 'system',
    confidence: 1.0,
  },
  {
    category: 'platform',
    subcategory: 'mvp',
    factKey: 'enterprise_features_disabled',
    factValue: JSON.stringify([
      'Advanced analytics',
      'Multi-location disaster recovery',
      'SOX/GDPR compliance modules',
      'Complex HRIS integrations',
      'White-label options',
    ]),
    factType: 'list',
    source: 'system',
    confidence: 1.0,
  },
  {
    category: 'platform',
    subcategory: 'industry',
    factKey: 'security_site_types',
    factValue: JSON.stringify(['Retail/malls', 'Office buildings', 'Warehouses', 'Construction', 'Residential', 'Events']),
    factType: 'list',
    source: 'system',
    confidence: 1.0,
  },
  {
    category: 'platform',
    subcategory: 'industry',
    factKey: 'shift_patterns',
    factValue: JSON.stringify(['Day 6am-2pm', 'Swing 2pm-10pm', 'Night 10pm-6am', '12-hour shifts 6am-6pm or 6pm-6am']),
    factType: 'list',
    source: 'system',
    confidence: 1.0,
  },
  {
    category: 'platform',
    subcategory: 'industry',
    factKey: 'incident_types',
    factValue: JSON.stringify({
      critical: ['Medical emergencies', 'Active threats/violence', 'Fire/evacuation', 'Police required'],
      high: ['Suspicious persons/vehicles', 'Property damage', 'Theft attempts', 'Safety hazards'],
      low: ['Minor policy violations', 'Parking issues', 'Lost and found', 'General inquiries'],
    }),
    factType: 'json',
    source: 'system',
    confidence: 1.0,
  },
  {
    category: 'platform',
    subcategory: 'automation',
    factKey: 'automation_ratio',
    factValue: '99% automation, 1% human approval. Payroll, schedules, and incident triage happen automatically. Humans approve key decisions.',
    factType: 'text',
    source: 'system',
    confidence: 1.0,
  },
  {
    category: 'platform',
    subcategory: 'onboarding',
    factKey: 'onboarding_steps',
    factValue: JSON.stringify([
      '1. Company Profile (name, contact, employee count)',
      '2. Add Client Sites (location, contacts, instructions)',
      '3. Add Employees (name, role, assigned sites)',
      '4. Create First Schedule (shifts, assignments, publish)',
      '5. Mobile App Setup (Add to Home Screen)',
      '6. Payment Setup (Stripe, pricing tier)',
    ]),
    factType: 'list',
    source: 'system',
    confidence: 1.0,
  },
];

const CORE_PLATFORM_FACTS: SelfAwarenessFact[] = [
  {
    category: 'platform',
    subcategory: 'architecture',
    factKey: 'tech_stack',
    factValue: 'TypeScript, Node.js, Express, React, PostgreSQL (Drizzle ORM), Gemini AI, WebSocket',
    factType: 'text',
    source: 'system',
    confidence: 1.0,
  },
  {
    category: 'platform',
    subcategory: 'architecture',
    factKey: 'structure',
    factValue: JSON.stringify({
      client: 'React frontend with Tanstack Query, Wouter routing, Shadcn UI',
      server: 'Express backend with REST API, WebSocket for real-time',
      shared: 'Drizzle schema, Zod validation, shared types',
      services: 'AI Brain orchestration, automation jobs, integrations',
    }),
    factType: 'json',
    source: 'system',
    confidence: 1.0,
  },
  {
    category: 'platform',
    subcategory: 'domains',
    factKey: 'os_modules',
    factValue: JSON.stringify([
      'ScheduleOS - Shift scheduling and workforce planning',
      'TimeOS - Time tracking and attendance',
      'PayrollOS - Payroll processing',
      'BillOS - Client billing and invoicing',
      'HireOS - Recruitment and onboarding',
      'ReportOS - Reports and analytics',
      'SupportOS - Help desk and tickets',
      'CommunicationOS - Chat and notifications',
    ]),
    factType: 'list',
    source: 'system',
    confidence: 1.0,
  },
  {
    category: 'platform',
    subcategory: 'ai_brain',
    factKey: 'subagent_ecosystem',
    factValue: JSON.stringify({
      core: ['SchedulingSubagent', 'PayrollSubagent', 'InvoiceSubagent', 'NotificationSubagent'],
      domain: ['RevenueOps', 'SecurityOps', 'OnboardingOps', 'DataOps', 'CommunicationOps'],
      specialized: ['VisualQASubagent', 'CleanupAgentSubagent', 'SeasonalSubagent', 'ChatServerSubagent'],
      intelligence: ['UniversalDiagnosticOrchestrator', 'TrinityCodeOps', 'SharedKnowledgeGraph'],
    }),
    factType: 'json',
    source: 'system',
    confidence: 1.0,
  },
];

// ============================================================================
// TRINITY SELF-AWARENESS SERVICE CLASS
// ============================================================================

class TrinitySelfAwarenessService {
  private static instance: TrinitySelfAwarenessService;
  private initialized = false;
  private factCache: Map<string, TrinitySelfAwareness> = new Map();
  private lastCacheRefresh: Date | null = null;
  private readonly CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

  static getInstance(): TrinitySelfAwarenessService {
    if (!this.instance) {
      this.instance = new TrinitySelfAwarenessService();
    }
    return this.instance;
  }

  // ============================================================================
  // INITIALIZATION
  // ============================================================================

  /**
   * Initialize Trinity's self-awareness with core facts
   */
  async initialize(): Promise<void> {
    if (this.initialized) {
      console.log('[TrinitySelfAwareness] Already initialized');
      return;
    }

    console.log('[TrinitySelfAwareness] Initializing self-awareness...');

    try {
      // Load core facts into database if not present
      const allCoreFacts = [
        ...CORE_PERSONA_FACTS,
        ...CORE_CAPABILITY_FACTS,
        ...CORE_CONSTRAINT_FACTS,
        ...CORE_PLATFORM_FACTS,
        ...MVP_PLATFORM_FACTS,
      ];

      for (const fact of allCoreFacts) {
        await this.upsertFact(fact);
      }

      // Register AI Brain actions
      this.registerActions();

      // Refresh cache
      await this.refreshCache();

      this.initialized = true;
      console.log(`[TrinitySelfAwareness] Initialized with ${allCoreFacts.length} core facts`);
    } catch (error) {
      console.error('[TrinitySelfAwareness] Initialization failed:', error);
    }
  }

  /**
   * Register self-awareness actions with AI Brain orchestrator
   */
  private registerActions(): void {
    const actions = [
      {
        id: 'self.get_fact',
        name: 'Get Self-Awareness Fact',
        description: 'Get a specific self-awareness fact',
        handler: async (params: any) => {
          const { category, factKey } = params;
          const fact = await this.getFact(category, factKey);
          return {
            found: !!fact,
            fact,
          };
        },
      },
      {
        id: 'self.query_facts',
        name: 'Query Facts by Category',
        description: 'Query self-awareness facts by category',
        handler: async (params: any) => {
          const { category, subcategory } = params;
          const facts = await this.getFactsByCategory(category, subcategory);
          return { facts, count: facts.length };
        },
      },
      {
        id: 'self.get_platform_context',
        name: 'Get Platform Context',
        description: 'Get current platform context and health status',
        handler: async () => {
          return this.getPlatformContext();
        },
      },
      {
        id: 'self.get_capabilities',
        name: 'Get Capabilities',
        description: 'Get available capabilities, optionally filtered by domain',
        handler: async (params: any) => {
          const { domain } = params;
          const capabilities = await this.getCapabilities(domain);
          return { capabilities, count: capabilities.length };
        },
      },
      {
        id: 'self.learn_fact',
        name: 'Learn New Fact',
        description: 'Learn and store a new self-awareness fact',
        handler: async (params: any) => {
          const fact = await this.upsertFact({
            category: params.category,
            subcategory: params.subcategory,
            factKey: params.factKey,
            factValue: params.factValue,
            factType: params.factType || 'text',
            source: 'learned',
            confidence: params.confidence || 0.8,
          });
          return { learned: !!fact, fact };
        },
      },
      {
        id: 'self.get_identity',
        name: 'Get Identity Summary',
        description: 'Get Trinity identity summary for prompt injection',
        handler: async () => {
          return this.getIdentitySummary();
        },
      },
      {
        id: 'self.check_constraint',
        name: 'Check Constraint',
        description: 'Check if an action is allowed given current constraints',
        handler: async (params: any) => {
          const { action, context } = params;
          return this.checkConstraint(action, context);
        },
      },
    ];

    for (const action of actions) {
      helpaiOrchestrator.registerAction({
        actionId: action.id,
        name: action.name,
        category: 'self_awareness',
        description: action.description,
        requiredRoles: ['support', 'admin', 'super_admin'],
        handler: async (request) => {
          const startTime = Date.now();
          const result = await action.handler(request.payload || {});
          return {
            success: true,
            actionId: request.actionId,
            message: `${action.name} completed`,
            data: result,
            executionTimeMs: Date.now() - startTime,
          };
        },
      });
    }

    console.log('[TrinitySelfAwareness] Registered 7 AI Brain actions');
  }

  // ============================================================================
  // FACT MANAGEMENT
  // ============================================================================

  /**
   * Get a specific fact by category and key
   */
  async getFact(category: string, factKey: string): Promise<TrinitySelfAwareness | null> {
    const cacheKey = `${category}:${factKey}`;
    
    if (this.factCache.has(cacheKey) && this.isCacheValid()) {
      return this.factCache.get(cacheKey) || null;
    }

    try {
      const [fact] = await db
        .select()
        .from(trinitySelfAwareness)
        .where(and(
          eq(trinitySelfAwareness.category, category),
          eq(trinitySelfAwareness.factKey, factKey),
          eq(trinitySelfAwareness.isActive, true)
        ))
        .limit(1);

      if (fact) {
        this.factCache.set(cacheKey, fact);
      }

      return fact || null;
    } catch (error) {
      console.error('[TrinitySelfAwareness] Error getting fact:', error);
      return null;
    }
  }

  /**
   * Get all facts in a category
   */
  async getFactsByCategory(category: string, subcategory?: string): Promise<TrinitySelfAwareness[]> {
    try {
      const conditions = [
        eq(trinitySelfAwareness.category, category),
        eq(trinitySelfAwareness.isActive, true),
      ];

      if (subcategory) {
        conditions.push(eq(trinitySelfAwareness.subcategory, subcategory));
      }

      return await db
        .select()
        .from(trinitySelfAwareness)
        .where(and(...conditions))
        .orderBy(trinitySelfAwareness.factKey);
    } catch (error) {
      console.error('[TrinitySelfAwareness] Error getting facts by category:', error);
      return [];
    }
  }

  /**
   * Insert or update a fact
   */
  async upsertFact(fact: SelfAwarenessFact): Promise<TrinitySelfAwareness | null> {
    try {
      const existing = await this.getFact(fact.category, fact.factKey);

      if (existing) {
        // Update existing fact
        const [updated] = await db
          .update(trinitySelfAwareness)
          .set({
            factValue: fact.factValue,
            factType: fact.factType || 'text',
            subcategory: fact.subcategory,
            source: fact.source || 'configured',
            confidence: fact.confidence?.toString() || '1.0',
            lastVerifiedAt: new Date(),
            version: (existing.version || 1) + 1,
            updatedAt: new Date(),
          })
          .where(eq(trinitySelfAwareness.id, existing.id))
          .returning();

        // Update cache
        const cacheKey = `${fact.category}:${fact.factKey}`;
        this.factCache.set(cacheKey, updated);

        return updated;
      } else {
        // Insert new fact
        const [inserted] = await db
          .insert(trinitySelfAwareness)
          .values({
            category: fact.category,
            subcategory: fact.subcategory,
            factKey: fact.factKey,
            factValue: fact.factValue,
            factType: fact.factType || 'text',
            source: fact.source || 'system',
            confidence: fact.confidence?.toString() || '1.0',
            lastVerifiedAt: new Date(),
            version: 1,
            isActive: true,
          })
          .returning();

        // Update cache
        const cacheKey = `${fact.category}:${fact.factKey}`;
        this.factCache.set(cacheKey, inserted);

        return inserted;
      }
    } catch (error) {
      console.error('[TrinitySelfAwareness] Error upserting fact:', error);
      return null;
    }
  }

  /**
   * Search facts by keyword
   */
  async searchFacts(query: string): Promise<TrinitySelfAwareness[]> {
    try {
      const searchPattern = `%${query.toLowerCase()}%`;
      
      return await db
        .select()
        .from(trinitySelfAwareness)
        .where(and(
          eq(trinitySelfAwareness.isActive, true),
          sql`(
            LOWER(${trinitySelfAwareness.factKey}) LIKE ${searchPattern} OR
            LOWER(${trinitySelfAwareness.factValue}) LIKE ${searchPattern} OR
            LOWER(${trinitySelfAwareness.category}) LIKE ${searchPattern}
          )`
        ))
        .orderBy(desc(trinitySelfAwareness.confidence))
        .limit(20);
    } catch (error) {
      console.error('[TrinitySelfAwareness] Error searching facts:', error);
      return [];
    }
  }

  // ============================================================================
  // IDENTITY & CONTEXT
  // ============================================================================

  /**
   * Get Trinity's identity summary for prompt injection
   */
  async getIdentitySummary(): Promise<{
    name: string;
    role: string;
    personality: string;
    communicationStyle: string;
    systemPrompt: string;
  }> {
    const personaFacts = await this.getFactsByCategory('persona');
    
    const factMap = new Map(personaFacts.map(f => [f.factKey, f.factValue]));
    
    return {
      name: factMap.get('name') || TRINITY_PERSONA.name,
      role: factMap.get('role') || TRINITY_PERSONA.role,
      personality: factMap.get('personality') || TRINITY_PERSONA.personality,
      communicationStyle: factMap.get('style') || 'Concise and direct',
      systemPrompt: PERSONA_SYSTEM_INSTRUCTION,
    };
  }

  /**
   * Get current platform context
   */
  async getPlatformContext(): Promise<PlatformContext> {
    try {
      // Get registered actions count
      const capabilities = await this.getCapabilities();
      
      // Get unique domains
      const domains = new Set(capabilities.map(c => c.domain));
      
      // Get platform facts
      const platformFacts = await this.getFactsByCategory('platform');
      const serviceFacts = await this.getFactsByCategory('service');
      const subagentFacts = await this.getFactsByCategory('subagent');

      return {
        totalServices: serviceFacts.length || 80, // Approximate from docs
        totalSubagents: subagentFacts.length || 15, // Approximate from architecture
        totalCapabilities: capabilities.length,
        activeDomains: Array.from(domains),
        recentIssues: 0, // Will be populated by gap intelligence
        systemHealth: 'healthy', // Will be determined by health checks
      };
    } catch (error) {
      console.error('[TrinitySelfAwareness] Error getting platform context:', error);
      return {
        totalServices: 80,
        totalSubagents: 15,
        totalCapabilities: 100,
        activeDomains: ['scheduling', 'payroll', 'invoicing', 'notifications'],
        recentIssues: 0,
        systemHealth: 'healthy',
      };
    }
  }

  /**
   * Get available capabilities
   */
  async getCapabilities(domain?: string): Promise<CapabilityInfo[]> {
    try {
      const allActions = helpaiOrchestrator.getAllActions();
      
      const capabilities: CapabilityInfo[] = [];
      
      for (const [actionId, handler] of Object.entries(allActions)) {
        // Parse domain from action ID (e.g., 'scheduling.create_shift' -> 'scheduling')
        const actionDomain = actionId.split('.')[0];
        
        if (domain && actionDomain !== domain) {
          continue;
        }
        
        capabilities.push({
          actionId,
          domain: actionDomain,
          description: (handler as any).description || 'No description',
          parameters: Object.keys((handler as any).parameters || {}),
          requiredRole: (handler as any).requiredRole,
          isActive: true,
        });
      }
      
      return capabilities;
    } catch (error) {
      console.error('[TrinitySelfAwareness] Error getting capabilities:', error);
      return [];
    }
  }

  // ============================================================================
  // CONSTRAINT CHECKING
  // ============================================================================

  /**
   * Check if an action is allowed given current constraints
   */
  async checkConstraint(action: string, context?: Record<string, any>): Promise<{
    allowed: boolean;
    reason?: string;
    requiredApproval?: boolean;
  }> {
    const constraintFacts = await this.getFactsByCategory('constraint');
    
    // Check destructive operations
    const destructiveOps = ['delete', 'drop', 'remove', 'destroy', 'truncate'];
    const isDestructive = destructiveOps.some(op => action.toLowerCase().includes(op));
    
    if (isDestructive) {
      return {
        allowed: false,
        reason: 'Destructive operations require human approval',
        requiredApproval: true,
      };
    }
    
    // Check critical file modifications
    if (action.includes('edit') && context?.filePath) {
      const criticalPaths = ['schema.ts', 'storage.ts', 'db.ts', 'auth', 'security'];
      const isCritical = criticalPaths.some(p => context.filePath.includes(p));
      
      if (isCritical) {
        return {
          allowed: false,
          reason: 'Critical file modifications require approval',
          requiredApproval: true,
        };
      }
    }
    
    // Check RBAC constraints
    if (context?.requiredRole && context?.userRole) {
      const roleHierarchy = ['employee', 'supervisor', 'manager', 'admin', 'owner', 'support_engineer', 'support_manager', 'support_director', 'root_admin'];
      const requiredIndex = roleHierarchy.indexOf(context.requiredRole);
      const userIndex = roleHierarchy.indexOf(context.userRole);
      
      if (userIndex < requiredIndex) {
        return {
          allowed: false,
          reason: `Requires ${context.requiredRole} role or higher`,
          requiredApproval: false,
        };
      }
    }
    
    return { allowed: true };
  }

  // ============================================================================
  // CACHE MANAGEMENT
  // ============================================================================

  /**
   * Refresh the fact cache from database
   */
  async refreshCache(): Promise<void> {
    try {
      const allFacts = await db
        .select()
        .from(trinitySelfAwareness)
        .where(eq(trinitySelfAwareness.isActive, true));

      this.factCache.clear();
      
      for (const fact of allFacts) {
        const cacheKey = `${fact.category}:${fact.factKey}`;
        this.factCache.set(cacheKey, fact);
      }

      this.lastCacheRefresh = new Date();
      console.log(`[TrinitySelfAwareness] Cache refreshed with ${allFacts.length} facts`);
    } catch (error) {
      console.error('[TrinitySelfAwareness] Error refreshing cache:', error);
    }
  }

  private isCacheValid(): boolean {
    if (!this.lastCacheRefresh) return false;
    return Date.now() - this.lastCacheRefresh.getTime() < this.CACHE_TTL_MS;
  }

  // ============================================================================
  // PROMPT BUILDING
  // ============================================================================

  /**
   * Build a self-aware system prompt for Trinity
   */
  async buildSelfAwarePrompt(): Promise<string> {
    const identity = await this.getIdentitySummary();
    const context = await this.getPlatformContext();
    const capabilities = await this.getCapabilities();
    const constraints = await this.getFactsByCategory('constraint');

    const capabilityDomains = [...new Set(capabilities.map(c => c.domain))];
    const constraintList = constraints.map(c => `- ${c.factValue}`).join('\n');

    return `${identity.systemPrompt}

SELF-AWARENESS CONTEXT:
I am ${identity.name}, ${identity.role}.
Personality: ${identity.personality}

PLATFORM AWARENESS:
- Total Services: ${context.totalServices}
- Total Subagents: ${context.totalSubagents}
- Total Capabilities: ${context.totalCapabilities}
- Active Domains: ${context.activeDomains.join(', ')}
- System Health: ${context.systemHealth}

CAPABILITY DOMAINS:
${capabilityDomains.join(', ')}

OPERATING CONSTRAINTS:
${constraintList}

I understand the platform architecture, can coordinate subagents, and will respect all safety constraints while helping users effectively.`;
  }

  // ============================================================================
  // STATISTICS
  // ============================================================================

  /**
   * Get self-awareness statistics
   */
  async getStats(): Promise<{
    totalFacts: number;
    factsByCategory: Record<string, number>;
    factsBySource: Record<string, number>;
    lastUpdated: Date | null;
  }> {
    try {
      const allFacts = await db
        .select()
        .from(trinitySelfAwareness)
        .where(eq(trinitySelfAwareness.isActive, true));

      const byCategory: Record<string, number> = {};
      const bySource: Record<string, number> = {};
      let lastUpdated: Date | null = null;

      for (const fact of allFacts) {
        byCategory[fact.category] = (byCategory[fact.category] || 0) + 1;
        bySource[fact.source || 'system'] = (bySource[fact.source || 'system'] || 0) + 1;
        
        if (fact.updatedAt && (!lastUpdated || fact.updatedAt > lastUpdated)) {
          lastUpdated = fact.updatedAt;
        }
      }

      return {
        totalFacts: allFacts.length,
        factsByCategory: byCategory,
        factsBySource: bySource,
        lastUpdated,
      };
    } catch (error) {
      console.error('[TrinitySelfAwareness] Error getting stats:', error);
      return {
        totalFacts: 0,
        factsByCategory: {},
        factsBySource: {},
        lastUpdated: null,
      };
    }
  }
}

// ============================================================================
// EXPORTS
// ============================================================================

export const trinitySelfAwarenessService = TrinitySelfAwarenessService.getInstance();

export async function initializeTrinitySelfAwareness(): Promise<void> {
  await trinitySelfAwarenessService.initialize();
}
