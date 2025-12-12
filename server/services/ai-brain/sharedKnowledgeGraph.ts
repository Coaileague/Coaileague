/**
 * SHARED KNOWLEDGE GRAPH - PERSISTENT AGENT LEARNING
 * ====================================================
 * Fortune 500-grade knowledge graph enabling agent-to-agent learning.
 * Subagents store generalizable facts, entity relationships, and
 * operational findings that other agents can query and learn from.
 * 
 * Key Capabilities:
 * - Persistent storage for cross-agent knowledge sharing
 * - Semantic reasoning through graph relationships
 * - Experience-based learning from success/failure patterns
 * - Business rule encoding as traversable relationships
 */

import { db } from '../../db';
import { systemAuditLogs } from '@shared/schema';
import { platformEventBus } from '../platformEventBus';
import { aiBrainService } from './aiBrainService';
import { knowledgeGraphRepository } from './cognitiveRepositories';
import crypto from 'crypto';

// ============================================================================
// TYPES - KNOWLEDGE GRAPH
// ============================================================================

export interface KnowledgeEntity {
  id: string;
  type: EntityType;
  name: string;
  description: string;
  domain: KnowledgeDomain;
  attributes: Record<string, any>;
  createdAt: Date;
  updatedAt: Date;
  createdBy: string;
  confidence: number;
  usageCount: number;
  lastAccessedAt?: Date;
}

export type EntityType = 
  | 'concept'
  | 'rule'
  | 'pattern'
  | 'fact'
  | 'procedure'
  | 'constraint'
  | 'insight'
  | 'error_pattern'
  | 'success_pattern';

export type KnowledgeDomain = 
  | 'scheduling'
  | 'payroll'
  | 'compliance'
  | 'invoicing'
  | 'employees'
  | 'clients'
  | 'automation'
  | 'security'
  | 'performance'
  | 'general';

export interface KnowledgeRelationship {
  id: string;
  sourceId: string;
  targetId: string;
  type: RelationshipType;
  strength: number;
  metadata?: Record<string, any>;
  createdAt: Date;
  createdBy: string;
}

export type RelationshipType = 
  | 'depends_on'
  | 'implies'
  | 'contradicts'
  | 'similar_to'
  | 'derived_from'
  | 'applies_to'
  | 'causes'
  | 'prevents'
  | 'requires'
  | 'enables';

export interface LearningEntry {
  id: string;
  domain: KnowledgeDomain;
  agentId: string;
  action: string;
  context: Record<string, any>;
  outcome: 'success' | 'failure' | 'partial';
  reward: number;
  insights: string[];
  timestamp: Date;
  workspaceId?: string;
}

export interface SemanticQuery {
  question: string;
  domain?: KnowledgeDomain;
  entityTypes?: EntityType[];
  maxResults?: number;
  includeRelated?: boolean;
}

export interface QueryResult {
  entities: KnowledgeEntity[];
  relationships: KnowledgeRelationship[];
  reasoning?: string;
  confidence: number;
}

// ============================================================================
// SHARED KNOWLEDGE GRAPH SERVICE
// ============================================================================

class SharedKnowledgeGraph {
  private static instance: SharedKnowledgeGraph;
  
  private entities: Map<string, KnowledgeEntity> = new Map();
  private relationships: Map<string, KnowledgeRelationship> = new Map();
  private learningHistory: LearningEntry[] = [];
  private entityIndex: Map<string, Set<string>> = new Map(); // domain -> entity IDs
  private patternCache: Map<string, any> = new Map();

  private dbInitialized = false;

  static getInstance(): SharedKnowledgeGraph {
    if (!this.instance) {
      this.instance = new SharedKnowledgeGraph();
      this.instance.initializeBaseKnowledge();
      this.instance.loadFromDatabase().catch(err => {
        console.error('[SharedKnowledgeGraph] Failed to load from database:', err.message);
      });
    }
    return this.instance;
  }

  /**
   * Load entities and relationships from database on startup
   */
  private async loadFromDatabase(): Promise<void> {
    if (this.dbInitialized) return;
    
    try {
      const dbEntities = await knowledgeGraphRepository.getAllEntities(500);
      const dbRelationships = await knowledgeGraphRepository.getAllRelationships(500);

      for (const dbEntity of dbEntities) {
        const entity: KnowledgeEntity = {
          id: dbEntity.id,
          type: dbEntity.entityType as EntityType,
          name: dbEntity.name,
          description: dbEntity.content,
          domain: dbEntity.domain as KnowledgeDomain,
          attributes: dbEntity.metadata || {},
          createdAt: dbEntity.createdAt,
          updatedAt: dbEntity.updatedAt || dbEntity.createdAt,
          createdBy: dbEntity.sourceAgent || 'system',
          confidence: parseFloat(dbEntity.confidence || '0.5'),
          usageCount: dbEntity.accessCount || 0,
          lastAccessedAt: dbEntity.lastAccessed || undefined,
        };
        this.entities.set(entity.id, entity);
        
        const domainSet = this.entityIndex.get(entity.domain) || new Set();
        domainSet.add(entity.id);
        this.entityIndex.set(entity.domain, domainSet);
      }

      for (const dbRel of dbRelationships) {
        const rel: KnowledgeRelationship = {
          id: dbRel.id,
          sourceId: dbRel.sourceId,
          targetId: dbRel.targetId,
          type: dbRel.relationship as RelationshipType,
          strength: parseFloat(dbRel.strength || '0.5'),
          metadata: {},
          createdAt: dbRel.createdAt,
          createdBy: dbRel.createdBy || 'system',
        };
        this.relationships.set(rel.id, rel);
      }

      this.dbInitialized = true;
      console.log(`[SharedKnowledgeGraph] Loaded ${dbEntities.length} entities and ${dbRelationships.length} relationships from database`);
    } catch (error: any) {
      console.error('[SharedKnowledgeGraph] Database load error:', error.message);
    }
  }

  // ============================================================================
  // KNOWLEDGE MANAGEMENT
  // ============================================================================

  /**
   * Add a new knowledge entity to the graph
   */
  addEntity(entity: Omit<KnowledgeEntity, 'id' | 'createdAt' | 'updatedAt' | 'usageCount'>): KnowledgeEntity {
    const newEntity: KnowledgeEntity = {
      ...entity,
      id: crypto.randomUUID(),
      createdAt: new Date(),
      updatedAt: new Date(),
      usageCount: 0,
    };

    this.entities.set(newEntity.id, newEntity);
    
    // Update domain index
    const domainSet = this.entityIndex.get(entity.domain) || new Set();
    domainSet.add(newEntity.id);
    this.entityIndex.set(entity.domain, domainSet);

    // Persist to database (async, non-blocking)
    knowledgeGraphRepository.createEntity({
      id: newEntity.id,
      entityType: newEntity.type,
      domain: newEntity.domain,
      name: newEntity.name,
      content: newEntity.description,
      confidence: newEntity.confidence,
      sourceAgent: newEntity.createdBy,
      metadata: newEntity.attributes,
    }).catch(err => console.error('[SharedKnowledgeGraph] DB persist error:', err.message));

    // Emit event
    platformEventBus.publish({
      type: 'knowledge_entity_added',
      category: 'feature',
      title: 'Knowledge Entity Added',
      description: `Added ${newEntity.type}: ${newEntity.name}`,
      metadata: {
        entityId: newEntity.id,
        entityType: newEntity.type,
        domain: newEntity.domain,
        name: newEntity.name,
      },
    });

    console.log(`[SharedKnowledgeGraph] Added entity: ${newEntity.name} (${newEntity.type})`);
    return newEntity;
  }

  /**
   * Create a relationship between entities
   */
  addRelationship(params: {
    sourceId: string;
    targetId: string;
    type: RelationshipType;
    strength?: number;
    createdBy: string;
    metadata?: Record<string, any>;
  }): KnowledgeRelationship | null {
    const source = this.entities.get(params.sourceId);
    const target = this.entities.get(params.targetId);

    if (!source || !target) {
      console.warn('[SharedKnowledgeGraph] Cannot create relationship: entity not found');
      return null;
    }

    const relationship: KnowledgeRelationship = {
      id: crypto.randomUUID(),
      sourceId: params.sourceId,
      targetId: params.targetId,
      type: params.type,
      strength: params.strength || 0.8,
      metadata: params.metadata,
      createdAt: new Date(),
      createdBy: params.createdBy,
    };

    this.relationships.set(relationship.id, relationship);

    // Persist to database (async, non-blocking)
    knowledgeGraphRepository.createRelationship({
      id: relationship.id,
      sourceId: relationship.sourceId,
      targetId: relationship.targetId,
      relationship: relationship.type,
      strength: relationship.strength,
      createdBy: relationship.createdBy,
    }).catch(err => console.error('[SharedKnowledgeGraph] DB persist error:', err.message));

    console.log(`[SharedKnowledgeGraph] Added relationship: ${source.name} --${params.type}--> ${target.name}`);
    return relationship;
  }

  /**
   * Query the knowledge graph semantically
   */
  async semanticQuery(query: SemanticQuery): Promise<QueryResult> {
    const startTime = Date.now();
    const { question, domain, entityTypes, maxResults = 10, includeRelated = true } = query;

    // Filter entities by domain and type
    let candidates = Array.from(this.entities.values());
    
    if (domain) {
      candidates = candidates.filter(e => e.domain === domain);
    }
    
    if (entityTypes && entityTypes.length > 0) {
      candidates = candidates.filter(e => entityTypes.includes(e.type));
    }

    // Use AI for semantic matching
    const rankedEntities = await this.aiRankEntities(question, candidates, maxResults);
    
    // Get related relationships
    const relatedRelationships: KnowledgeRelationship[] = [];
    if (includeRelated) {
      const entityIds = new Set(rankedEntities.map(e => e.id));
      for (const rel of this.relationships.values()) {
        if (entityIds.has(rel.sourceId) || entityIds.has(rel.targetId)) {
          relatedRelationships.push(rel);
        }
      }
    }

    // Update usage counts
    for (const entity of rankedEntities) {
      entity.usageCount++;
      entity.lastAccessedAt = new Date();
    }

    console.log(`[SharedKnowledgeGraph] Semantic query completed in ${Date.now() - startTime}ms, found ${rankedEntities.length} entities`);

    return {
      entities: rankedEntities,
      relationships: relatedRelationships,
      confidence: rankedEntities.length > 0 ? 0.8 : 0.3,
    };
  }

  /**
   * Use AI to rank entities by relevance to query
   */
  private async aiRankEntities(
    question: string,
    candidates: KnowledgeEntity[],
    maxResults: number
  ): Promise<KnowledgeEntity[]> {
    if (candidates.length === 0) return [];
    if (candidates.length <= maxResults) return candidates;

    const prompt = `Rank these knowledge entities by relevance to the question.

QUESTION: "${question}"

ENTITIES:
${candidates.slice(0, 50).map((e, i) => `${i}. [${e.type}] ${e.name}: ${e.description}`).join('\n')}

Return JSON array of indices in order of relevance (most relevant first):
{"rankedIndices": [0, 3, 1, ...], "reasoning": "brief explanation"}`;

    try {
      const response = await aiBrainService.processRequest({
        type: 'knowledge_ranking',
        userId: 'system',
        workspaceId: 'system',
        messages: [{ role: 'user', content: prompt }],
        contextLevel: 'minimal',
      });

      const result = this.extractJSON(response.response);
      const indices = result.rankedIndices || [];
      
      return indices
        .slice(0, maxResults)
        .map((i: number) => candidates[i])
        .filter(Boolean);
    } catch (error) {
      // Fallback to basic relevance scoring
      return candidates
        .filter(e => 
          e.name.toLowerCase().includes(question.toLowerCase()) ||
          e.description.toLowerCase().includes(question.toLowerCase())
        )
        .slice(0, maxResults);
    }
  }

  // ============================================================================
  // AGENT LEARNING
  // ============================================================================

  /**
   * Record a learning experience from an agent
   */
  recordLearning(entry: Omit<LearningEntry, 'id' | 'timestamp'>): void {
    const learning: LearningEntry = {
      ...entry,
      id: crypto.randomUUID(),
      timestamp: new Date(),
    };

    this.learningHistory.push(learning);

    // If successful, consider creating a pattern entity
    if (entry.outcome === 'success' && entry.reward > 0.7) {
      this.maybeCreatePattern(learning);
    }

    // If failed, record error pattern
    if (entry.outcome === 'failure') {
      this.recordErrorPattern(learning);
    }

    // Emit learning event for other agents
    platformEventBus.publish({
      type: 'agent_learning',
      category: 'feature',
      title: 'Agent Learning Recorded',
      description: `${entry.agentId} learned from ${entry.action}: ${entry.outcome}`,
      metadata: {
        agentId: entry.agentId,
        domain: entry.domain,
        outcome: entry.outcome,
        insights: entry.insights,
      },
    });

    console.log(`[SharedKnowledgeGraph] Recorded learning: ${entry.agentId} - ${entry.action} - ${entry.outcome}`);
  }

  /**
   * Get learnings for a specific domain/action
   */
  getLearnings(params: {
    domain?: KnowledgeDomain;
    agentId?: string;
    outcome?: 'success' | 'failure' | 'partial';
    limit?: number;
  }): LearningEntry[] {
    let results = [...this.learningHistory];

    if (params.domain) {
      results = results.filter(l => l.domain === params.domain);
    }
    if (params.agentId) {
      results = results.filter(l => l.agentId === params.agentId);
    }
    if (params.outcome) {
      results = results.filter(l => l.outcome === params.outcome);
    }

    // Sort by timestamp descending
    results.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());

    return results.slice(0, params.limit || 100);
  }

  /**
   * Create a reusable pattern from successful learning
   */
  private maybeCreatePattern(learning: LearningEntry): void {
    // Check if we have enough similar successes
    const similarSuccesses = this.learningHistory.filter(l =>
      l.domain === learning.domain &&
      l.action === learning.action &&
      l.outcome === 'success' &&
      l.reward > 0.7
    );

    if (similarSuccesses.length >= 3) {
      // Create a success pattern entity
      const patternKey = `${learning.domain}-${learning.action}-success`;
      
      if (!this.patternCache.has(patternKey)) {
        this.addEntity({
          type: 'success_pattern',
          name: `Successful ${learning.action} in ${learning.domain}`,
          description: `Pattern for successful ${learning.action} operations. Insights: ${learning.insights.join('; ')}`,
          domain: learning.domain,
          attributes: {
            action: learning.action,
            successCount: similarSuccesses.length,
            avgReward: similarSuccesses.reduce((sum, l) => sum + l.reward, 0) / similarSuccesses.length,
            insights: [...new Set(similarSuccesses.flatMap(l => l.insights))],
          },
          createdBy: 'learning_system',
          confidence: 0.9,
        });
        
        this.patternCache.set(patternKey, true);
      }
    }
  }

  /**
   * Record an error pattern for future avoidance
   */
  private recordErrorPattern(learning: LearningEntry): void {
    const errorKey = `${learning.domain}-${learning.action}-error`;
    
    // Update existing error pattern or create new
    const existingPattern = Array.from(this.entities.values())
      .find(e => e.type === 'error_pattern' && e.attributes.key === errorKey);

    if (existingPattern) {
      existingPattern.attributes.occurrences = (existingPattern.attributes.occurrences || 0) + 1;
      existingPattern.attributes.lastOccurred = new Date();
      existingPattern.updatedAt = new Date();
    } else {
      this.addEntity({
        type: 'error_pattern',
        name: `Error in ${learning.action} (${learning.domain})`,
        description: `Known error pattern. Context: ${JSON.stringify(learning.context).substring(0, 200)}`,
        domain: learning.domain,
        attributes: {
          key: errorKey,
          action: learning.action,
          occurrences: 1,
          context: learning.context,
        },
        createdBy: 'learning_system',
        confidence: 0.7,
      });
    }
  }

  // ============================================================================
  // SEMANTIC REASONING
  // ============================================================================

  /**
   * Traverse graph to find implications
   */
  traverseImplications(entityId: string, depth: number = 3): KnowledgeEntity[] {
    const visited = new Set<string>();
    const result: KnowledgeEntity[] = [];

    const traverse = (currentId: string, currentDepth: number) => {
      if (currentDepth === 0 || visited.has(currentId)) return;
      visited.add(currentId);

      const entity = this.entities.get(currentId);
      if (entity) result.push(entity);

      // Find outgoing relationships
      for (const rel of this.relationships.values()) {
        if (rel.sourceId === currentId && ['implies', 'causes', 'enables'].includes(rel.type)) {
          traverse(rel.targetId, currentDepth - 1);
        }
      }
    };

    traverse(entityId, depth);
    return result;
  }

  /**
   * Check if an action is allowed based on rules
   */
  checkRules(params: {
    action: string;
    domain: KnowledgeDomain;
    context: Record<string, any>;
  }): { allowed: boolean; reason?: string; applicableRules: KnowledgeEntity[] } {
    const rules = Array.from(this.entities.values())
      .filter(e => e.type === 'rule' && e.domain === params.domain);

    const applicableRules: KnowledgeEntity[] = [];
    let blocked = false;
    let blockReason: string | undefined;

    for (const rule of rules) {
      const conditions = rule.attributes.conditions || {};
      const applies = Object.entries(conditions).every(([key, value]) => 
        params.context[key] === value || value === '*'
      );

      if (applies) {
        applicableRules.push(rule);
        
        if (rule.attributes.effect === 'deny') {
          blocked = true;
          blockReason = rule.description;
        }
      }
    }

    return {
      allowed: !blocked,
      reason: blockReason,
      applicableRules,
    };
  }

  // ============================================================================
  // INITIALIZATION
  // ============================================================================

  private initializeBaseKnowledge(): void {
    // Add core business rules
    this.addEntity({
      type: 'rule',
      name: 'Contractor Benefits Denial',
      description: 'Contractors do not have access to benefits module',
      domain: 'compliance',
      attributes: {
        conditions: { employmentType: 'contractor' },
        effect: 'deny',
        target: 'benefits_module',
      },
      createdBy: 'system',
      confidence: 1.0,
    });

    this.addEntity({
      type: 'rule',
      name: 'Overtime Approval Required',
      description: 'Any overtime exceeding 10 hours requires manager approval',
      domain: 'payroll',
      attributes: {
        conditions: { overtimeHours: { gt: 10 } },
        effect: 'require_approval',
        approverRole: 'manager',
      },
      createdBy: 'system',
      confidence: 1.0,
    });

    this.addEntity({
      type: 'concept',
      name: 'Financial Data Integrity',
      description: 'All financial operations must maintain audit trails and use idempotency keys',
      domain: 'invoicing',
      attributes: {
        requirements: ['audit_log', 'idempotency_key', 'double_entry'],
      },
      createdBy: 'system',
      confidence: 1.0,
    });

    this.addEntity({
      type: 'procedure',
      name: 'Payroll Processing Flow',
      description: 'Standard procedure for payroll: Calculate -> Validate -> Approve -> Process -> Audit',
      domain: 'payroll',
      attributes: {
        steps: ['calculate', 'validate', 'approve', 'process', 'audit'],
        requiredApprovals: ['manager', 'finance'],
      },
      createdBy: 'system',
      confidence: 1.0,
    });

    this.addEntity({
      type: 'constraint',
      name: 'Shift Overlap Prevention',
      description: 'No employee can be scheduled for overlapping shifts',
      domain: 'scheduling',
      attributes: {
        checkType: 'temporal_overlap',
        scope: 'per_employee',
        severity: 'error',
      },
      createdBy: 'system',
      confidence: 1.0,
    });

    console.log(`[SharedKnowledgeGraph] Initialized with ${this.entities.size} base knowledge entities`);
  }

  // ============================================================================
  // UTILITY
  // ============================================================================

  private extractJSON(text: string): any {
    const match = text.match(/\{[\s\S]*\}/);
    if (match) {
      try {
        return JSON.parse(match[0]);
      } catch {
        return {};
      }
    }
    return {};
  }

  getStats(): {
    entityCount: number;
    relationshipCount: number;
    learningCount: number;
    domainBreakdown: Record<string, number>;
  } {
    const domainBreakdown: Record<string, number> = {};
    for (const [domain, ids] of this.entityIndex) {
      domainBreakdown[domain] = ids.size;
    }

    return {
      entityCount: this.entities.size,
      relationshipCount: this.relationships.size,
      learningCount: this.learningHistory.length,
      domainBreakdown,
    };
  }

  getEntity(id: string): KnowledgeEntity | undefined {
    return this.entities.get(id);
  }

  getEntitiesByDomain(domain: KnowledgeDomain): KnowledgeEntity[] {
    const ids = this.entityIndex.get(domain) || new Set();
    return Array.from(ids).map(id => this.entities.get(id)!).filter(Boolean);
  }
}

// ============================================================================
// EXPORTS
// ============================================================================

export const sharedKnowledgeGraph = SharedKnowledgeGraph.getInstance();

console.log('[SharedKnowledgeGraph] Persistent agent learning system initialized');
