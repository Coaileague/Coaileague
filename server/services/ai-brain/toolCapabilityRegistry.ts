/**
 * TOOL CAPABILITY REGISTRY
 * ========================
 * Centralized registry for AI Brain subagent tools with health checking,
 * validation, and telemetry.
 * 
 * Features:
 * - Tool registration with capability metadata
 * - Health status monitoring and auto-recovery
 * - Permission validation before execution
 * - Usage analytics and success metrics
 * - Integration with SubagentConfidenceMonitor
 */

import { TTLCache } from './cacheUtils';

export interface ToolCapability {
  id: string;
  name: string;
  category: 'scheduling' | 'payroll' | 'compliance' | 'analytics' | 'communication' | 'automation' | 'data' | 'integration' | 'diagnostic' | 'gemini-reasoning';
  description: string;
  requiredPermissions: string[];
  requiredConsents: string[];
  prerequisites: string[];
  inputSchema?: Record<string, any>;
  outputSchema?: Record<string, any>;
  timeout: number;
  retryable: boolean;
  maxRetries: number;
  rateLimit?: { requests: number; windowMs: number };
  healthEndpoint?: string;
}

export interface ToolHealth {
  toolId: string;
  status: 'healthy' | 'degraded' | 'offline' | 'unknown';
  lastCheck: Date;
  lastSuccess?: Date;
  lastError?: { message: string; timestamp: Date };
  responseTime: number;
  uptime: number;
  errorRate: number;
  consecutiveFailures: number;
}

export interface ToolUsageMetrics {
  toolId: string;
  totalCalls: number;
  successfulCalls: number;
  failedCalls: number;
  avgExecutionTime: number;
  p95ExecutionTime: number;
  lastUsed: Date;
  userSatisfaction: number;
  bySubagent: Map<string, { calls: number; success: number }>;
}

export interface ToolValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
  healthStatus: 'healthy' | 'degraded' | 'offline' | 'unknown';
  estimatedExecutionTime: number;
}

class ToolCapabilityRegistry {
  private tools: Map<string, ToolCapability> = new Map();
  private healthStatus: Map<string, ToolHealth> = new Map();
  private usageMetrics: Map<string, ToolUsageMetrics> = new Map();
  private executionTimes: Map<string, number[]> = new Map();
  private healthCheckInterval: NodeJS.Timeout | null = null;
  private categoryIndex: Map<string, Set<string>> = new Map();
  private permissionCache: TTLCache<string, boolean>;

  constructor() {
    this.permissionCache = new TTLCache<string, boolean>(60 * 5);
    this.initializeCoreTools();
    console.log('[ToolRegistry] Capability registry initialized');
  }

  private initializeCoreTools(): void {
    const coreTools: ToolCapability[] = [
      {
        id: 'schedule_shift',
        name: 'Schedule Shift',
        category: 'scheduling',
        description: 'Create or modify employee work shifts',
        requiredPermissions: ['shifts:write', 'schedule:manage'],
        requiredConsents: ['scheduling_automation'],
        prerequisites: ['employee_exists', 'workspace_active'],
        timeout: 30000,
        retryable: true,
        maxRetries: 2,
      },
      {
        id: 'approve_timesheet',
        name: 'Approve Timesheet',
        category: 'payroll',
        description: 'Approve employee timesheet entries',
        requiredPermissions: ['timesheets:approve', 'payroll:manage'],
        requiredConsents: ['payroll_automation'],
        prerequisites: ['timesheet_exists', 'manager_role'],
        timeout: 15000,
        retryable: true,
        maxRetries: 1,
      },
      {
        id: 'run_payroll',
        name: 'Run Payroll',
        category: 'payroll',
        description: 'Process payroll run for workspace',
        requiredPermissions: ['payroll:run', 'financial:manage'],
        requiredConsents: ['payroll_automation', 'financial_access'],
        prerequisites: ['stripe_connected', 'employees_exist'],
        timeout: 120000,
        retryable: false,
        maxRetries: 0,
      },
      {
        id: 'send_notification',
        name: 'Send Notification',
        category: 'communication',
        description: 'Send in-app or email notification',
        requiredPermissions: ['notifications:send'],
        requiredConsents: [],
        prerequisites: ['user_exists'],
        timeout: 10000,
        retryable: true,
        maxRetries: 3,
      },
      {
        id: 'generate_report',
        name: 'Generate Report',
        category: 'analytics',
        description: 'Generate analytics or compliance report',
        requiredPermissions: ['reports:read', 'analytics:access'],
        requiredConsents: [],
        prerequisites: ['data_exists'],
        timeout: 60000,
        retryable: true,
        maxRetries: 2,
      },
      {
        id: 'check_compliance',
        name: 'Check Compliance',
        category: 'compliance',
        description: 'Validate labor law compliance',
        requiredPermissions: ['compliance:read'],
        requiredConsents: [],
        prerequisites: ['workspace_configured'],
        timeout: 30000,
        retryable: true,
        maxRetries: 2,
      },
      {
        id: 'create_invoice',
        name: 'Create Invoice',
        category: 'data',
        description: 'Generate client invoice from time entries',
        requiredPermissions: ['invoices:create', 'billing:manage'],
        requiredConsents: ['billing_automation'],
        prerequisites: ['time_entries_exist', 'client_exists'],
        timeout: 45000,
        retryable: true,
        maxRetries: 1,
      },
      {
        id: 'sync_calendar',
        name: 'Sync Calendar',
        category: 'integration',
        description: 'Sync schedule with external calendar',
        requiredPermissions: ['calendar:sync'],
        requiredConsents: ['calendar_integration'],
        prerequisites: ['calendar_connected'],
        timeout: 30000,
        retryable: true,
        maxRetries: 2,
      },
      {
        id: 'diagnose_system',
        name: 'Diagnose System',
        category: 'diagnostic',
        description: 'Run system health diagnostics',
        requiredPermissions: ['system:diagnose'],
        requiredConsents: [],
        prerequisites: [],
        timeout: 60000,
        retryable: true,
        maxRetries: 1,
      },
      {
        id: 'execute_automation',
        name: 'Execute Automation',
        category: 'automation',
        description: 'Run automated workflow or job',
        requiredPermissions: ['automation:execute'],
        requiredConsents: ['automation_enabled'],
        prerequisites: ['automation_configured'],
        timeout: 90000,
        retryable: false,
        maxRetries: 0,
      },
      // Gemini 3 Reasoning Tools
      {
        id: 'deep-think',
        name: 'Deep Think',
        category: 'gemini-reasoning',
        description: 'Gemini 3 deep reasoning for complex multi-step analysis, strategic planning, and critical decision-making. Uses extended thinking time for thorough analysis.',
        requiredPermissions: ['ai:deep-reasoning'],
        requiredConsents: [],
        prerequisites: ['gemini_configured'],
        timeout: 180000,
        retryable: true,
        maxRetries: 1,
        rateLimit: { requests: 10, windowMs: 60000 },
      },
      {
        id: 'generate-ui',
        name: 'Generate UI',
        category: 'gemini-reasoning',
        description: 'AI-powered UI component generation using Gemini 3 vision and code synthesis. Creates React components, layouts, and styling from descriptions.',
        requiredPermissions: ['ai:generate-ui'],
        requiredConsents: ['code_generation'],
        prerequisites: ['gemini_configured'],
        timeout: 120000,
        retryable: true,
        maxRetries: 2,
        rateLimit: { requests: 20, windowMs: 60000 },
      },
      {
        id: 'context-memory',
        name: 'Context Memory',
        category: 'gemini-reasoning',
        description: 'Long-term conversation context and memory management. Stores, retrieves, and synthesizes context across sessions for personalized AI interactions.',
        requiredPermissions: ['ai:memory'],
        requiredConsents: ['memory_storage'],
        prerequisites: ['gemini_configured', 'memory_service_active'],
        timeout: 30000,
        retryable: true,
        maxRetries: 3,
        rateLimit: { requests: 100, windowMs: 60000 },
      },
      {
        id: 'vibe-coding',
        name: 'Vibe Coding',
        category: 'gemini-reasoning',
        description: 'Natural language to code generation with style awareness. Translates user intent into production-ready code following project conventions and patterns.',
        requiredPermissions: ['ai:code-generation'],
        requiredConsents: ['code_generation'],
        prerequisites: ['gemini_configured'],
        timeout: 150000,
        retryable: true,
        maxRetries: 2,
        rateLimit: { requests: 15, windowMs: 60000 },
      },
      {
        id: 'fact-check',
        name: 'Fact Check',
        category: 'gemini-reasoning',
        description: 'AI-powered fact verification and source validation. Validates claims, cross-references data, and provides confidence scores with citations.',
        requiredPermissions: ['ai:fact-check'],
        requiredConsents: [],
        prerequisites: ['gemini_configured'],
        timeout: 60000,
        retryable: true,
        maxRetries: 2,
        rateLimit: { requests: 30, windowMs: 60000 },
      },
    ];

    for (const tool of coreTools) {
      this.registerTool(tool);
    }
  }

  registerTool(capability: ToolCapability): void {
    this.tools.set(capability.id, capability);
    
    if (!this.categoryIndex.has(capability.category)) {
      this.categoryIndex.set(capability.category, new Set());
    }
    this.categoryIndex.get(capability.category)!.add(capability.id);

    this.healthStatus.set(capability.id, {
      toolId: capability.id,
      status: 'unknown',
      lastCheck: new Date(),
      responseTime: 0,
      uptime: 100,
      errorRate: 0,
      consecutiveFailures: 0,
    });

    this.usageMetrics.set(capability.id, {
      toolId: capability.id,
      totalCalls: 0,
      successfulCalls: 0,
      failedCalls: 0,
      avgExecutionTime: 0,
      p95ExecutionTime: 0,
      lastUsed: new Date(0),
      userSatisfaction: 0,
      bySubagent: new Map(),
    });

    console.log(`[ToolRegistry] Registered tool: ${capability.id} (${capability.category})`);
  }

  getTool(toolId: string): ToolCapability | undefined {
    return this.tools.get(toolId);
  }

  getToolsByCategory(category: string): ToolCapability[] {
    const toolIds = this.categoryIndex.get(category);
    if (!toolIds) return [];
    return Array.from(toolIds).map(id => this.tools.get(id)!).filter(Boolean);
  }

  getAllTools(): ToolCapability[] {
    return Array.from(this.tools.values());
  }

  // Model tier to tool complexity mapping
  // Determines which tiers can use which tool categories
  private readonly TIER_TOOL_ACCESS: Record<string, { 
    allowed: string[];
    restricted: string[];
    requiresElevation: string[];
  }> = {
    // Tier 1: Full access for orchestration/diagnostics
    'ORCHESTRATOR': { 
      allowed: ['*'],
      restricted: [],
      requiresElevation: []
    },
    'DIAGNOSTICS': { 
      allowed: ['*'],
      restricted: [],
      requiresElevation: []
    },
    'BRAIN': {
      allowed: ['*'],
      restricted: [],
      requiresElevation: []
    },
    'PRO_FALLBACK': { 
      allowed: ['scheduling', 'payroll', 'compliance', 'analytics', 'communication', 'automation', 'data', 'integration', 'diagnostic', 'gemini-reasoning'],
      restricted: [],
      requiresElevation: []
    },
    'SUPERVISOR': { 
      allowed: ['scheduling', 'payroll', 'compliance', 'analytics', 'communication', 'data'],
      restricted: ['integration'],
      requiresElevation: ['automation']
    },
    'COMPLIANCE': { 
      allowed: ['compliance', 'analytics', 'communication'],
      restricted: ['payroll', 'integration', 'automation'],
      requiresElevation: ['scheduling']
    },
    
    // Tier 2: Medium access for conversational
    'CONVERSATIONAL': { 
      allowed: ['communication', 'analytics', 'data'],
      restricted: ['payroll', 'integration', 'automation', 'diagnostic'],
      requiresElevation: ['scheduling', 'compliance']
    },
    'HELLOS': { 
      allowed: ['communication', 'data'],
      restricted: ['payroll', 'scheduling', 'integration', 'automation', 'diagnostic'],
      requiresElevation: ['compliance', 'analytics']
    },
    'ONBOARDING': { 
      allowed: ['communication', 'data'],
      restricted: ['payroll', 'compliance', 'integration', 'automation', 'diagnostic'],
      requiresElevation: ['scheduling', 'analytics']
    },
    
    // Tier 3: Limited access for simple bots
    'SIMPLE': { 
      allowed: ['communication', 'data'],
      restricted: ['payroll', 'scheduling', 'compliance', 'analytics', 'automation', 'integration', 'diagnostic'],
      requiresElevation: []
    },
    'NOTIFICATION': { 
      allowed: ['communication'],
      restricted: ['*'],
      requiresElevation: []
    },
  };

  /**
   * Validate if a model tier has access to a specific tool
   */
  validateToolAccessForTier(toolId: string, modelTier: string): { 
    allowed: boolean; 
    requiresElevation: boolean; 
    reason?: string;
  } {
    const tool = this.tools.get(toolId);
    if (!tool) {
      return { allowed: false, requiresElevation: false, reason: 'Tool not found' };
    }

    const tierAccess = this.TIER_TOOL_ACCESS[modelTier];
    if (!tierAccess) {
      // Unknown tier - default to restricted access
      return { allowed: false, requiresElevation: false, reason: `Unknown model tier: ${modelTier}` };
    }

    // Check if tier has wildcard access
    if (tierAccess.allowed.includes('*')) {
      return { allowed: true, requiresElevation: false };
    }

    // Check if tool category is explicitly restricted
    if (tierAccess.restricted.includes(tool.category) || tierAccess.restricted.includes('*')) {
      return { allowed: false, requiresElevation: false, reason: `Tool category '${tool.category}' is restricted for tier ${modelTier}` };
    }

    // Check if tool category requires elevation
    if (tierAccess.requiresElevation.includes(tool.category)) {
      return { allowed: true, requiresElevation: true, reason: `Tool category '${tool.category}' requires elevated session for tier ${modelTier}` };
    }

    // Check if tool category is allowed
    if (tierAccess.allowed.includes(tool.category)) {
      return { allowed: true, requiresElevation: false };
    }

    // Default to not allowed if not explicitly listed
    return { allowed: false, requiresElevation: false, reason: `Tool category '${tool.category}' not allowed for tier ${modelTier}` };
  }

  async validateToolExecution(
    toolId: string,
    subagentId: string,
    userPermissions: string[],
    userConsents: string[],
    modelTier?: string
  ): Promise<ToolValidationResult> {
    const tool = this.tools.get(toolId);
    if (!tool) {
      return {
        valid: false,
        errors: [`Tool '${toolId}' not found in registry`],
        warnings: [],
        healthStatus: 'unknown',
        estimatedExecutionTime: 0,
      };
    }

    const errors: string[] = [];
    const warnings: string[] = [];

    // Validate model tier access if provided
    if (modelTier) {
      const tierAccess = this.validateToolAccessForTier(toolId, modelTier);
      if (!tierAccess.allowed) {
        errors.push(tierAccess.reason || `Tool not allowed for model tier ${modelTier}`);
      } else if (tierAccess.requiresElevation) {
        warnings.push(tierAccess.reason || `Tool requires elevated session for tier ${modelTier}`);
      }
    }

    const missingPermissions = tool.requiredPermissions.filter(
      perm => !userPermissions.includes(perm) && !userPermissions.includes('*')
    );
    if (missingPermissions.length > 0) {
      errors.push(`Missing permissions: ${missingPermissions.join(', ')}`);
    }

    const missingConsents = tool.requiredConsents.filter(
      consent => !userConsents.includes(consent)
    );
    if (missingConsents.length > 0) {
      errors.push(`Missing consents: ${missingConsents.join(', ')}`);
    }

    const health = this.healthStatus.get(toolId);
    if (health?.status === 'offline') {
      errors.push('Tool is currently offline');
    } else if (health?.status === 'degraded') {
      warnings.push('Tool is experiencing degraded performance');
    } else if (health?.status === 'unknown') {
      warnings.push('Tool health status unknown - may be unreliable');
    }

    const metrics = this.usageMetrics.get(toolId);
    const estimatedTime = metrics?.avgExecutionTime || tool.timeout / 2;

    return {
      valid: errors.length === 0,
      errors,
      warnings,
      healthStatus: health?.status || 'unknown',
      estimatedExecutionTime: estimatedTime,
    };
  }

  recordExecution(
    toolId: string,
    subagentId: string,
    success: boolean,
    executionTime: number,
    error?: string
  ): void {
    const metrics = this.usageMetrics.get(toolId);
    if (!metrics) return;

    metrics.totalCalls++;
    if (success) {
      metrics.successfulCalls++;
    } else {
      metrics.failedCalls++;
    }
    metrics.lastUsed = new Date();

    let times = this.executionTimes.get(toolId) || [];
    times.push(executionTime);
    if (times.length > 100) {
      times = times.slice(-100);
    }
    this.executionTimes.set(toolId, times);

    metrics.avgExecutionTime = times.reduce((a, b) => a + b, 0) / times.length;
    const sorted = [...times].sort((a, b) => a - b);
    metrics.p95ExecutionTime = sorted[Math.floor(sorted.length * 0.95)] || executionTime;

    const agentStats = metrics.bySubagent.get(subagentId) || { calls: 0, success: 0 };
    agentStats.calls++;
    if (success) agentStats.success++;
    metrics.bySubagent.set(subagentId, agentStats);

    const health = this.healthStatus.get(toolId);
    if (health) {
      health.lastCheck = new Date();
      health.responseTime = executionTime;
      
      if (success) {
        health.lastSuccess = new Date();
        health.consecutiveFailures = 0;
        health.status = 'healthy';
      } else {
        health.consecutiveFailures++;
        health.lastError = { message: error || 'Unknown error', timestamp: new Date() };
        
        if (health.consecutiveFailures >= 5) {
          health.status = 'offline';
        } else if (health.consecutiveFailures >= 2) {
          health.status = 'degraded';
        }
      }

      health.errorRate = metrics.totalCalls > 0 
        ? (metrics.failedCalls / metrics.totalCalls) * 100 
        : 0;
      health.uptime = 100 - health.errorRate;
    }
  }

  getHealthStatus(toolId: string): ToolHealth | undefined {
    return this.healthStatus.get(toolId);
  }

  getUsageMetrics(toolId: string): ToolUsageMetrics | undefined {
    return this.usageMetrics.get(toolId);
  }

  getAllHealthStatuses(): ToolHealth[] {
    return Array.from(this.healthStatus.values());
  }

  getHealthySummary(): { healthy: number; degraded: number; offline: number; unknown: number } {
    const summary = { healthy: 0, degraded: 0, offline: 0, unknown: 0 };
    for (const health of this.healthStatus.values()) {
      summary[health.status]++;
    }
    return summary;
  }

  getToolsForSubagent(subagentType: string): ToolCapability[] {
    const categoryMap: Record<string, string[]> = {
      'scheduling': ['scheduling', 'communication'],
      'payroll': ['payroll', 'data', 'communication'],
      'compliance': ['compliance', 'analytics', 'diagnostic'],
      'analytics': ['analytics', 'data'],
      'support': ['communication', 'diagnostic'],
      'automation': ['automation', 'scheduling', 'payroll'],
      'billing': ['data', 'integration'],
      'hr': ['compliance', 'communication', 'data'],
    };

    const categories = categoryMap[subagentType] || [];
    const tools: ToolCapability[] = [];
    
    for (const cat of categories) {
      tools.push(...this.getToolsByCategory(cat));
    }

    return tools;
  }

  exportDiagnostics(): Record<string, any> {
    return {
      totalTools: this.tools.size,
      byCategory: Object.fromEntries(
        Array.from(this.categoryIndex.entries()).map(([cat, ids]) => [cat, ids.size])
      ),
      healthSummary: this.getHealthySummary(),
      topUsedTools: Array.from(this.usageMetrics.values())
        .sort((a, b) => b.totalCalls - a.totalCalls)
        .slice(0, 10)
        .map(m => ({ toolId: m.toolId, calls: m.totalCalls, successRate: m.successfulCalls / Math.max(m.totalCalls, 1) })),
      degradedTools: Array.from(this.healthStatus.values())
        .filter(h => h.status !== 'healthy')
        .map(h => ({ toolId: h.toolId, status: h.status, consecutiveFailures: h.consecutiveFailures })),
    };
  }

  startHealthMonitoring(intervalMs: number = 60000): void {
    if (this.healthCheckInterval) {
      clearInterval(this.healthCheckInterval);
    }

    this.healthCheckInterval = setInterval(() => {
      for (const [toolId, health] of this.healthStatus) {
        const timeSinceCheck = Date.now() - health.lastCheck.getTime();
        if (timeSinceCheck > intervalMs * 5) {
          health.status = 'unknown';
        }
      }
    }, intervalMs);

    console.log('[ToolRegistry] Health monitoring started');
  }

  stopHealthMonitoring(): void {
    if (this.healthCheckInterval) {
      clearInterval(this.healthCheckInterval);
      this.healthCheckInterval = null;
    }
  }
}

export const toolCapabilityRegistry = new ToolCapabilityRegistry();
