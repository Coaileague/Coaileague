/**
 * SWARM COMMANDER SERVICE
 * ========================
 * Trinity's "God Mode" control center for AI agent orchestration.
 * 
 * Features:
 * - War Room: Live agent topology visualization with interaction edges
 * - Loop Detector: Infinite argument detection and intervention
 * - Agent Court: Conflict resolution with human judge
 * - Budget Watchdog: Predictive token economics
 * - Forensic Replay: State snapshots for time-travel debugging
 * - ROI Dashboard: Real-time dollar value calculations
 */

import { db } from '../../db';
import { eq, and, desc, gte, sql, count, inArray } from 'drizzle-orm';
import {
  subagentTelemetry,
  automationActionLedger,
  aiSubagentDefinitions,
  employees,
  workspaces,
  aiSuggestions,
  trinityCreditTransactions,
} from '@shared/schema';
import { TTLCache } from './cacheUtils';
import crypto from 'crypto';
import { createLogger } from '../../lib/logger';
import { aiWorkboardTasks } from '@shared/schema';
const log = createLogger('swarmCommanderService');

// Guru-mode roles that can access Swarm Commander features
export const GURU_MODE_ROLES = ['root_admin', 'deputy_admin', 'sysop', 'support_manager', 'support_agent'] as const;
export type GuruModeRole = typeof GURU_MODE_ROLES[number];

// ============================================================================
// TYPES
// ============================================================================

export interface SwarmNode {
  id: string;
  name: string;
  domain: string;
  status: 'idle' | 'active' | 'busy' | 'error' | 'paused';
  lastActivity: string | null;
  successRate: number;
  taskCount: number;
  currentTask?: string;
}

export interface SwarmEdge {
  id: string;
  from: string;
  to: string;
  label: string;
  timestamp: string;
  intensity: 'low' | 'medium' | 'high';
  isActive: boolean;
}

export interface SwarmTopology {
  nodes: SwarmNode[];
  edges: SwarmEdge[];
  activeInteractions: number;
  totalTasksToday: number;
  healthScore: number;
  timestamp: string;
}

export interface LoopSignature {
  hash: string;
  agent: string;
  action: string;
  timestamp: number;
}

export interface LoopDetection {
  isLoop: boolean;
  loopCount: number;
  signature?: string;
  agents?: string[];
  intervention?: string;
}

export interface ConflictCase {
  id: string;
  workspaceId: string;
  plaintiff: { agent: string; request: string; reason: string };
  defendant: { agent: string; objection: string; rule: string };
  status: 'pending' | 'resolved' | 'overruled' | 'sustained';
  createdAt: string;
  resolution?: { decision: string; authorizedBy: string; expiresAt?: string };
}

export interface BudgetEstimate {
  taskDescription: string;
  estimatedTokens: number;
  estimatedCost: number;
  estimatedDuration: string;
  cheaperAlternative?: {
    description: string;
    estimatedTokens: number;
    estimatedCost: number;
    savings: number;
  };
  recommendation: string;
}

export interface StateSnapshot {
  id: string;
  workflowId: string;
  timestamp: string;
  actor: string;
  action: string;
  inputState: Record<string, any>;
  outputState: Record<string, any>;
  costTokens: number;
  trinityAudit: {
    status: 'ok' | 'warning' | 'error';
    note: string;
  };
}

export interface ForensicReplayResult {
  timeline: StateSnapshot[];
  rootCause?: {
    timestamp: string;
    actor: string;
    diagnosis: string;
    suggestedFix: string;
  };
}

export interface ROIMetrics {
  tasksDone: number;
  apiCost: number;
  humanHoursSaved: number;
  netSavings: number;
  costPerTask: number;
  roiMultiplier: number;
  breakdown: {
    category: string;
    tasks: number;
    cost: number;
    hoursSaved: number;
    savings: number;
  }[];
}

// Human hourly rates by task type (for ROI calculation)
const HUMAN_HOURLY_RATES: Record<string, number> = {
  scheduling: 45.00,
  payroll: 75.00,
  invoicing: 50.00,
  compliance: 85.00,
  analytics: 65.00,
  communication: 35.00,
  data_entry: 25.00,
  coding: 150.00,
  general: 40.00,
};

// Token costs per 1000 tokens (approximate)
const TOKEN_COST_PER_1K = 0.01;

// ============================================================================
// SWARM COMMANDER SERVICE
// ============================================================================

class SwarmCommanderService {
  private static instance: SwarmCommanderService;
  
  // Loop detection state
  private loopHistory: Map<string, LoopSignature[]> = new Map();
  private readonly LOOP_LIMIT = 5;
  private readonly LOOP_WINDOW_MS = 60000; // 1 minute
  
  // Conflict cases
  private pendingConflicts: Map<string, ConflictCase> = new Map();
  
  // State snapshots for forensic replay
  private stateSnapshots: Map<string, StateSnapshot[]> = new Map();
  private readonly MAX_SNAPSHOTS_PER_WORKFLOW = 100;
  
  // Caches
  private topologyCache = new TTLCache<string, SwarmTopology>(30 * 1000, 10); // 30s TTL
  private roiCache = new TTLCache<string, ROIMetrics>(5 * 60 * 1000, 50); // 5min TTL

  private constructor() {
    log.info('[SwarmCommander] Initializing Swarm Commander Service...');
  }

  static getInstance(): SwarmCommanderService {
    if (!SwarmCommanderService.instance) {
      SwarmCommanderService.instance = new SwarmCommanderService();
    }
    return SwarmCommanderService.instance;
  }

  // ============================================================================
  // WAR ROOM: Swarm Topology Visualization
  // ============================================================================

  async getSwarmTopology(workspaceId?: string): Promise<SwarmTopology> {
    const cacheKey = workspaceId || 'global';
    const cached = this.topologyCache.get(cacheKey);
    if (cached) return cached;

    try {
      // Get all active subagents
      const subagents = await db
        .select()
        .from(aiSubagentDefinitions)
        .where(eq(aiSubagentDefinitions.isActive, true));

      // Get recent telemetry for each agent
      const today = new Date();
      today.setHours(0, 0, 0, 0);

      const telemetryData = await db
        .select({
          agentId: subagentTelemetry.subagentId,
          status: subagentTelemetry.status,
          phase: subagentTelemetry.phase,
          startedAt: subagentTelemetry.startedAt,
        })
        .from(subagentTelemetry)
        .where(gte(subagentTelemetry.startedAt, today))
        .orderBy(desc(subagentTelemetry.startedAt))
        .limit(500);

      // Build nodes from subagents
      const nodes: SwarmNode[] = subagents.map(agent => {
        const agentTelemetry = telemetryData.filter(t => t.agentId === agent.id);
        const successCount = agentTelemetry.filter(t => t.status === 'completed').length;
        const totalCount = agentTelemetry.length;
        
        // Determine current status
        const latestEntry = agentTelemetry[0];
        let status: SwarmNode['status'] = 'idle';
        if (latestEntry) {
          if (latestEntry.status === 'executing' || latestEntry.status === 'preparing') {
            status = 'active';
          } else if (latestEntry.status === 'failed' || latestEntry.status === 'derailed') {
            status = 'error';
          } else if (latestEntry.status === 'escalating') {
            status = 'paused';
          }
        }

        return {
          id: agent.id,
          name: agent.name,
          domain: agent.domain,
          status,
          lastActivity: latestEntry?.startedAt?.toISOString() || null,
          successRate: totalCount > 0 ? Math.round((successCount / totalCount) * 100) : 100,
          taskCount: totalCount,
          currentTask: status === 'active' ? latestEntry?.phase || undefined : undefined,
        };
      });

      // Build edges from recent interactions (simplified - based on sequential task patterns)
      const edges: SwarmEdge[] = [];
      const seenPairs = new Set<string>();
      
      for (let i = 0; i < telemetryData.length - 1; i++) {
        const current = telemetryData[i];
        const next = telemetryData[i + 1];
        
        if (current.agentId !== next.agentId) {
          const pairKey = `${current.agentId}-${next.agentId}`;
          if (!seenPairs.has(pairKey)) {
            seenPairs.add(pairKey);
            edges.push({
              id: `edge-${edges.length}`,
              from: current.agentId || 'unknown',
              to: next.agentId || 'unknown',
              label: current.phase || 'handoff',
              timestamp: current.startedAt?.toISOString() || new Date().toISOString(),
              intensity: 'medium',
              isActive: i < 5, // Recent interactions are "active"
            });
          }
        }
      }

      // Calculate health score
      const activeAgents = nodes.filter(n => n.status === 'active' || n.status === 'idle').length;
      const errorAgents = nodes.filter(n => n.status === 'error').length;
      const healthScore = nodes.length > 0 
        ? Math.round(((activeAgents - errorAgents) / nodes.length) * 100) 
        : 100;

      const topology: SwarmTopology = {
        nodes,
        edges: edges.slice(0, 50), // Limit edges for performance
        activeInteractions: edges.filter(e => e.isActive).length,
        totalTasksToday: telemetryData.length,
        healthScore,
        timestamp: new Date().toISOString(),
      };

      this.topologyCache.set(cacheKey, topology);
      return topology;
    } catch (error) {
      log.error('[SwarmCommander] Topology error:', error);
      return {
        nodes: [],
        edges: [],
        activeInteractions: 0,
        totalTasksToday: 0,
        healthScore: 0,
        timestamp: new Date().toISOString(),
      };
    }
  }

  // ============================================================================
  // LOOP DETECTOR: Infinite Argument Detection
  // ============================================================================

  checkForLoop(workspaceId: string, agent: string, action: string, context?: string): LoopDetection {
    const now = Date.now();
    const signature = this.hashSignature(agent, action, context);
    
    // Get or create history for this workspace
    if (!this.loopHistory.has(workspaceId)) {
      this.loopHistory.set(workspaceId, []);
    }
    
    const history = this.loopHistory.get(workspaceId)!;
    
    // Clean old entries
    const validEntries = history.filter(h => now - h.timestamp < this.LOOP_WINDOW_MS);
    
    // Add new signature
    validEntries.push({
      hash: signature,
      agent,
      action,
      timestamp: now,
    });
    
    this.loopHistory.set(workspaceId, validEntries);
    
    // Count occurrences of this signature
    const matchingEntries = validEntries.filter(h => h.hash === signature);
    const isLoop = matchingEntries.length >= this.LOOP_LIMIT;
    
    if (isLoop) {
      // Identify agents involved in the loop
      const involvedAgents = [...new Set(matchingEntries.map(e => e.agent))];
      
      return {
        isLoop: true,
        loopCount: matchingEntries.length,
        signature,
        agents: involvedAgents,
        intervention: `Infinite argument detected! ${involvedAgents.join(' and ')} appear stuck in a loop on "${action}". Pausing execution for human review.`,
      };
    }
    
    return { isLoop: false, loopCount: matchingEntries.length };
  }

  private hashSignature(agent: string, action: string, context?: string): string {
    const data = `${agent}:${action}:${context || ''}`;
    return crypto.createHash('md5').update(data).digest('hex').slice(0, 12);
  }

  clearLoopHistory(workspaceId: string): void {
    this.loopHistory.delete(workspaceId);
  }

  // ============================================================================
  // AGENT COURT: Conflict Resolution (Database-Persisted)
  // ============================================================================

  async createConflict(params: {
    workspaceId: string;
    plaintiff: { agent: string; request: string; reason: string };
    defendant: { agent: string; objection: string; rule: string };
  }): Promise<ConflictCase> {
    const conflictId = `conflict-${Date.now()}-${crypto.randomUUID().slice(0, 8)}`;
    
    const conflict: ConflictCase = {
      id: conflictId,
      workspaceId: params.workspaceId,
      plaintiff: params.plaintiff,
      defendant: params.defendant,
      status: 'pending',
      createdAt: new Date().toISOString(),
    };
    
    // Persist to database using aiSuggestions table
    try {
      await db.insert(aiSuggestions).values({
        id: conflictId,
        workspaceId: params.workspaceId,
        suggestionType: 'agent_conflict',
        sourceSystem: 'swarm_commander',
        title: `Agent Conflict: ${params.plaintiff.agent} vs ${params.defendant.agent}`,
        description: JSON.stringify(conflict),
        suggestedAction: 'Resolve conflict in Agent Court',
        priority: 'high',
        status: 'pending',
        confidenceScore: 100,
      });
      log.info('[SwarmCommander] Agent Court: Conflict filed to database', conflictId);
    } catch (err) {
      log.error('[SwarmCommander] Failed to persist conflict:', err);
      // Still keep in memory as fallback
      this.pendingConflicts.set(conflictId, conflict);
    }
    
    return conflict;
  }

  async getPendingConflicts(workspaceId?: string): Promise<ConflictCase[]> {
    try {
      // Fetch from database
      let query = db
        .select({
          id: aiSuggestions.id,
          description: aiSuggestions.description,
        })
        .from(aiSuggestions)
        .where(and(
          eq(aiSuggestions.suggestionType, 'agent_conflict'),
          eq(aiSuggestions.sourceSystem, 'swarm_commander'),
          eq(aiSuggestions.status, 'pending')
        ))
        .orderBy(desc(aiSuggestions.createdAt))
        .limit(50);
      
      const results = await query;
      
      // Parse stored conflicts
      const conflicts: ConflictCase[] = [];
      for (const row of results) {
        try {
          const conflict = JSON.parse(row.description || '{}') as ConflictCase;
          if (workspaceId && conflict.workspaceId !== workspaceId) continue;
          conflicts.push(conflict);
        } catch {
          // Skip malformed conflict entries
        }
      }
      
      // Also include in-memory conflicts
      const memoryConflicts = Array.from(this.pendingConflicts.values())
        .filter(c => c.status === 'pending' && (!workspaceId || c.workspaceId === workspaceId));
      
      return [...conflicts, ...memoryConflicts];
    } catch (err) {
      log.error('[SwarmCommander] Failed to fetch conflicts:', err);
      const conflicts = Array.from(this.pendingConflicts.values());
      if (workspaceId) {
        return conflicts.filter(c => c.workspaceId === workspaceId && c.status === 'pending');
      }
      return conflicts.filter(c => c.status === 'pending');
    }
  }

  async resolveConflict(conflictId: string, decision: 'overrule' | 'sustain', authorizedBy: string, expiresInHours?: number): Promise<ConflictCase | null> {
    // First try to get from database
    try {
      const [row] = await db
        .select({ description: aiSuggestions.description })
        .from(aiSuggestions)
        .where(and(
          eq(aiSuggestions.id, conflictId),
          eq(aiSuggestions.suggestionType, 'agent_conflict')
        ))
        .limit(1);
      
      if (row) {
        const conflict = JSON.parse(row.description || '{}') as ConflictCase;
        conflict.status = decision === 'overrule' ? 'overruled' : 'sustained';
        conflict.resolution = {
          decision: decision === 'overrule' 
            ? `Executive Order: ${conflict.plaintiff.agent}'s request is authorized despite ${conflict.defendant.agent}'s objection.`
            : `${conflict.defendant.agent}'s objection is sustained. ${conflict.plaintiff.agent} must find an alternative.`,
          authorizedBy,
          expiresAt: expiresInHours 
            ? new Date(Date.now() + expiresInHours * 60 * 60 * 1000).toISOString()
            : undefined,
        };
        
        // Update in database
        await db.update(aiSuggestions)
          .set({
            status: decision === 'overrule' ? 'accepted' : 'rejected',
            description: JSON.stringify(conflict),
            updatedAt: new Date(),
          })
          .where(eq(aiSuggestions.id, conflictId));
        
        log.info('[SwarmCommander] Agent Court: Conflict resolved in database', conflictId, decision);
        return conflict;
      }
    } catch (err) {
      log.error('[SwarmCommander] Failed to resolve conflict in database:', err);
    }
    
    // Fallback to in-memory
    const conflict = this.pendingConflicts.get(conflictId);
    if (!conflict) return null;
    
    conflict.status = decision === 'overrule' ? 'overruled' : 'sustained';
    conflict.resolution = {
      decision: decision === 'overrule' 
        ? `Executive Order: ${conflict.plaintiff.agent}'s request is authorized despite ${conflict.defendant.agent}'s objection.`
        : `${conflict.defendant.agent}'s objection is sustained. ${conflict.plaintiff.agent} must find an alternative.`,
      authorizedBy,
      expiresAt: expiresInHours 
        ? new Date(Date.now() + expiresInHours * 60 * 60 * 1000).toISOString()
        : undefined,
    };
    
    this.pendingConflicts.set(conflictId, conflict);
    log.info('[SwarmCommander] Agent Court: Conflict resolved in memory', conflictId, decision);
    
    return conflict;
  }

  // ============================================================================
  // BUDGET WATCHDOG: Predictive Token Economics
  // ============================================================================

  async estimateTaskCost(params: {
    taskDescription: string;
    complexity: 'simple' | 'moderate' | 'complex' | 'intensive';
    dataSize?: 'small' | 'medium' | 'large';
    domain?: string;
  }): Promise<BudgetEstimate> {
    // Base token estimates by complexity
    const complexityTokens: Record<string, number> = {
      simple: 500,
      moderate: 2000,
      complex: 8000,
      intensive: 25000,
    };
    
    // Data size multipliers
    const dataSizeMultiplier: Record<string, number> = {
      small: 1,
      medium: 2,
      large: 5,
    };
    
    const baseTokens = complexityTokens[params.complexity] || 2000;
    const sizeMultiplier = dataSizeMultiplier[params.dataSize || 'small'] || 1;
    const estimatedTokens = baseTokens * sizeMultiplier;
    const estimatedCost = (estimatedTokens / 1000) * TOKEN_COST_PER_1K;
    
    // Estimate duration (rough: 100 tokens/second for generation)
    const durationSeconds = Math.ceil(estimatedTokens / 100);
    const estimatedDuration = durationSeconds < 60 
      ? `${durationSeconds} seconds`
      : `${Math.ceil(durationSeconds / 60)} minute(s)`;
    
    // Generate cheaper alternative for intensive tasks
    let cheaperAlternative: BudgetEstimate['cheaperAlternative'] | undefined;
    if (params.complexity === 'intensive' || params.complexity === 'complex') {
      const alternativeTokens = Math.ceil(estimatedTokens * 0.15);
      const alternativeCost = (alternativeTokens / 1000) * TOKEN_COST_PER_1K;
      cheaperAlternative = {
        description: `Summarize data first, then analyze the summary instead of raw data`,
        estimatedTokens: alternativeTokens,
        estimatedCost: alternativeCost,
        savings: Math.round((1 - alternativeCost / estimatedCost) * 100),
      };
    }
    
    const recommendation = cheaperAlternative && cheaperAlternative.savings > 70
      ? `Consider the cheaper alternative to save ${cheaperAlternative.savings}% in costs.`
      : estimatedCost > 1 
        ? `This is a resource-intensive task. Proceed with caution.`
        : `Cost is within normal range. Proceed when ready.`;
    
    return {
      taskDescription: params.taskDescription,
      estimatedTokens,
      estimatedCost: Math.round(estimatedCost * 100) / 100,
      estimatedDuration,
      cheaperAlternative,
      recommendation,
    };
  }

  // ============================================================================
  // FORENSIC REPLAY: Time-Travel Debugging
  // ============================================================================

  recordStateSnapshot(snapshot: Omit<StateSnapshot, 'id'>): string {
    const snapshotId = `snap-${Date.now()}-${crypto.randomUUID().slice(0, 8)}`;
    
    const fullSnapshot: StateSnapshot = {
      id: snapshotId,
      ...snapshot,
    };
    
    // Get or create workflow history
    if (!this.stateSnapshots.has(snapshot.workflowId)) {
      this.stateSnapshots.set(snapshot.workflowId, []);
    }
    
    const history = this.stateSnapshots.get(snapshot.workflowId)!;
    history.push(fullSnapshot);
    
    // Limit history size
    if (history.length > this.MAX_SNAPSHOTS_PER_WORKFLOW) {
      history.shift();
    }
    
    this.stateSnapshots.set(snapshot.workflowId, history);
    
    return snapshotId;
  }

  getForensicReplay(workflowId: string, question?: string): ForensicReplayResult {
    const timeline = this.stateSnapshots.get(workflowId) || [];
    
    // Find potential root cause (first warning or error)
    const problematicSnapshot = timeline.find(s => 
      s.trinityAudit.status === 'error' || s.trinityAudit.status === 'warning'
    );
    
    let rootCause: ForensicReplayResult['rootCause'] | undefined;
    if (problematicSnapshot) {
      rootCause = {
        timestamp: problematicSnapshot.timestamp,
        actor: problematicSnapshot.actor,
        diagnosis: problematicSnapshot.trinityAudit.note,
        suggestedFix: this.generateFixSuggestion(problematicSnapshot),
      };
    }
    
    return { timeline, rootCause };
  }

  private generateFixSuggestion(snapshot: StateSnapshot): string {
    const auditNote = snapshot.trinityAudit.note.toLowerCase();
    
    if (auditNote.includes('token') || auditNote.includes('usage')) {
      return 'Consider batching requests or using summarization to reduce token usage.';
    }
    if (auditNote.includes('timeout') || auditNote.includes('slow')) {
      return 'Task may need to be broken into smaller chunks or run during off-peak hours.';
    }
    if (auditNote.includes('error') || auditNote.includes('failed')) {
      return 'Review input data quality and retry with validated parameters.';
    }
    if (auditNote.includes('conflict') || auditNote.includes('loop')) {
      return 'Manual intervention may be required to resolve conflicting agent goals.';
    }
    
    return 'Review the snapshot details and consider adjusting agent parameters.';
  }

  clearWorkflowSnapshots(workflowId: string): void {
    this.stateSnapshots.delete(workflowId);
  }

  // ============================================================================
  // ROI DASHBOARD: Real-time Dollar Value Calculator
  // ============================================================================

  async calculateROI(workspaceId: string, periodDays: number = 7): Promise<ROIMetrics> {
    const cacheKey = `${workspaceId}-${periodDays}`;
    const cached = this.roiCache.get(cacheKey);
    if (cached) return cached;

    try {
      const startDate = new Date();
      startDate.setDate(startDate.getDate() - periodDays);

      // Get completed tasks for the period
      const tasks = await db
        .select({
          id: aiWorkboardTasks.id,
          category: aiWorkboardTasks.category,
          actualTokens: aiWorkboardTasks.actualTokens,
          status: aiWorkboardTasks.status,
          completedAt: aiWorkboardTasks.completedAt,
          createdAt: aiWorkboardTasks.createdAt,
        })
        .from(aiWorkboardTasks)
        .where(and(
          eq(aiWorkboardTasks.workspaceId, workspaceId),
          eq(aiWorkboardTasks.status, 'completed'),
          gte(aiWorkboardTasks.createdAt, startDate)
        ));
      
      // Get real API costs from credit transactions for accurate ROI
      let realApiCost = 0;
      try {
        const [creditSum] = await db
          .select({
            total: sql<number>`COALESCE(SUM(ABS(${trinityCreditTransactions.amount})), 0)`,
          })
          .from(trinityCreditTransactions)
          .where(and(
            eq(trinityCreditTransactions.workspaceId, workspaceId),
            eq(trinityCreditTransactions.transactionType, 'debit'),
            gte(trinityCreditTransactions.createdAt, startDate)
          ));
        realApiCost = (creditSum?.total || 0) * 0.01; // Convert credits to dollars
      } catch {
        // Credit query failed - continue with zero cost
      }

      // Calculate metrics per category
      const categoryBreakdown = new Map<string, {
        tasks: number;
        tokens: number;
      }>();

      for (const task of tasks) {
        const category = task.category || 'general';
        const existing = categoryBreakdown.get(category) || { tasks: 0, tokens: 0 };
        existing.tasks++;
        existing.tokens += task.actualTokens || 0;
        categoryBreakdown.set(category, existing);
      }

      // Calculate ROI
      let totalApiCost = 0;
      let totalHumanHours = 0;
      let totalSavings = 0;
      const breakdown: ROIMetrics['breakdown'] = [];

      for (const [category, data] of categoryBreakdown) {
        const hourlyRate = HUMAN_HOURLY_RATES[category] || HUMAN_HOURLY_RATES.general;
        
        // Estimate human time: Each AI task saves roughly 15-30 minutes of human work
        const estimatedHumanMinutes = data.tasks * 20; // Average 20 min per task
        const humanHours = estimatedHumanMinutes / 60;
        
        const apiCost = (data.tokens / 1000) * TOKEN_COST_PER_1K;
        const humanCost = humanHours * hourlyRate;
        const savings = humanCost - apiCost;

        totalApiCost += apiCost;
        totalHumanHours += humanHours;
        totalSavings += savings;

        breakdown.push({
          category,
          tasks: data.tasks,
          cost: Math.round(apiCost * 100) / 100,
          hoursSaved: Math.round(humanHours * 10) / 10,
          savings: Math.round(savings * 100) / 100,
        });
      }

      const tasksDone = tasks.length;
      
      // Use real API cost from credit transactions if available, otherwise use token-based estimate
      const finalApiCost = realApiCost > 0 ? realApiCost : totalApiCost;
      const finalSavings = (totalHumanHours * HUMAN_HOURLY_RATES.general) - finalApiCost;
      
      // Log which cost source was used for debugging
      if (realApiCost > 0) {
        log.info(`[SwarmCommander] ROI using real credit data: $${realApiCost.toFixed(2)}`);
      }
      
      const costPerTask = tasksDone > 0 ? finalApiCost / tasksDone : 0;
      const roiMultiplier = finalApiCost > 0 ? (finalSavings + finalApiCost) / finalApiCost : 0;

      const metrics: ROIMetrics = {
        tasksDone,
        apiCost: Math.round(finalApiCost * 100) / 100,
        humanHoursSaved: Math.round(totalHumanHours * 10) / 10,
        netSavings: Math.round(finalSavings * 100) / 100,
        costPerTask: Math.round(costPerTask * 100) / 100,
        roiMultiplier: Math.round(roiMultiplier * 10) / 10,
        breakdown: breakdown.sort((a, b) => b.savings - a.savings),
      };

      this.roiCache.set(cacheKey, metrics);
      return metrics;
    } catch (error) {
      log.error('[SwarmCommander] ROI calculation error:', error);
      return {
        tasksDone: 0,
        apiCost: 0,
        humanHoursSaved: 0,
        netSavings: 0,
        costPerTask: 0,
        roiMultiplier: 0,
        breakdown: [],
      };
    }
  }

  // ============================================================================
  // GURU MODE SUMMARY
  // ============================================================================

  async getGuruModeSummary(workspaceId?: string): Promise<{
    swarm: SwarmTopology;
    pendingConflicts: ConflictCase[];
    loopWarnings: number;
    roi?: ROIMetrics;
    alerts: string[];
  }> {
    const [swarm, conflicts] = await Promise.all([
      this.getSwarmTopology(workspaceId),
      this.getPendingConflicts(workspaceId),
    ]);

    let roi: ROIMetrics | undefined;
    if (workspaceId) {
      roi = await this.calculateROI(workspaceId, 7);
    }

    // Count recent loop warnings
    let loopWarnings = 0;
    if (workspaceId && this.loopHistory.has(workspaceId)) {
      const history = this.loopHistory.get(workspaceId)!;
      const recentEntries = history.filter(h => Date.now() - h.timestamp < this.LOOP_WINDOW_MS);
      const signatureCounts = new Map<string, number>();
      for (const entry of recentEntries) {
        signatureCounts.set(entry.hash, (signatureCounts.get(entry.hash) || 0) + 1);
      }
      loopWarnings = Array.from(signatureCounts.values()).filter(c => c >= 3).length;
    }

    // Generate alerts
    const alerts: string[] = [];
    
    if (conflicts.length > 0) {
      alerts.push(`${conflicts.length} agent conflict(s) awaiting your judgment in Agent Court.`);
    }
    
    if (swarm.healthScore < 70) {
      alerts.push(`Swarm health is at ${swarm.healthScore}%. Some agents may need attention.`);
    }
    
    const errorAgents = swarm.nodes.filter(n => n.status === 'error');
    if (errorAgents.length > 0) {
      alerts.push(`${errorAgents.length} agent(s) in error state: ${errorAgents.map(a => a.name).join(', ')}`);
    }
    
    if (loopWarnings > 0) {
      alerts.push(`${loopWarnings} potential loop pattern(s) detected. Monitor closely.`);
    }
    
    if (roi && roi.roiMultiplier < 2) {
      alerts.push(`ROI multiplier is ${roi.roiMultiplier}x. Consider optimizing high-cost tasks.`);
    }

    return {
      swarm,
      pendingConflicts: conflicts,
      loopWarnings,
      roi,
      alerts,
    };
  }

  shutdown(): void {
    this.topologyCache.shutdown();
    this.roiCache.shutdown();
    this.loopHistory.clear();
    this.pendingConflicts.clear();
    this.stateSnapshots.clear();
  }
}

export const swarmCommanderService = SwarmCommanderService.getInstance();
