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
import { createLogger } from '../../lib/logger';
const log = createLogger('toolCapabilityRegistry');

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
    log.info('[ToolRegistry] Capability registry initialized');
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
        id: 'visual_qa_check',
        name: 'Visual QA Check',
        category: 'diagnostic',
        description: 'Capture screenshot and analyze UI for visual anomalies using AI vision. Trinity\'s "eyes" for detecting broken icons, layout issues, and visual regressions.',
        requiredPermissions: ['system:diagnose', 'vqa:execute'],
        requiredConsents: [],
        prerequisites: ['browser_available', 'gemini_configured'],
        timeout: 120000,
        retryable: true,
        maxRetries: 2,
        rateLimit: { requests: 10, windowMs: 60000 },
      },
      {
        id: 'visual_qa_baseline',
        name: 'Create VQA Baseline',
        category: 'diagnostic',
        description: 'Capture and store a baseline screenshot for visual regression testing.',
        requiredPermissions: ['system:diagnose', 'vqa:manage'],
        requiredConsents: [],
        prerequisites: ['browser_available'],
        timeout: 60000,
        retryable: true,
        maxRetries: 2,
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
      // ── Training & Certification Tools ─────────────────────────────────────
      {
        id: 'training.assign_module',
        name: 'Assign Training Module',
        // @ts-expect-error — TS migration: fix in refactoring sprint
        category: 'training',
        description: 'Assign a required training module to one or more officers',
        requiredPermissions: ['training:manage'],
        requiredConsents: [],
        prerequisites: ['employee_exists'],
        timeout: 30000,
        retryable: true,
        maxRetries: 2,
      },
      {
        id: 'training.check_compliance',
        name: 'Check Training Compliance',
        // @ts-expect-error — TS migration: fix in refactoring sprint
        category: 'training',
        description: 'Check officer training compliance status — certificates, expirations, open interventions',
        requiredPermissions: ['training:read', 'compliance:read'],
        requiredConsents: [],
        prerequisites: ['workspace_configured'],
        timeout: 30000,
        retryable: true,
        maxRetries: 2,
      },
      {
        id: 'training.send_reminder',
        name: 'Send Training Reminder',
        // @ts-expect-error — TS migration: fix in refactoring sprint
        category: 'training',
        description: 'Send a training renewal reminder to officers with expiring or expired certificates',
        requiredPermissions: ['training:notify', 'employees:contact'],
        requiredConsents: ['automated_notifications'],
        prerequisites: ['employee_exists', 'training_module_exists'],
        timeout: 30000,
        retryable: true,
        maxRetries: 2,
      },
      {
        id: 'training.flag_intervention',
        name: 'Flag Training Intervention',
        // @ts-expect-error — TS migration: fix in refactoring sprint
        category: 'training',
        description: 'Flag an officer for a remediation session after repeated training failures',
        requiredPermissions: ['training:manage', 'compliance:write'],
        requiredConsents: [],
        prerequisites: ['employee_exists', 'training_attempt_exists'],
        timeout: 30000,
        retryable: false,
        maxRetries: 0,
      },
      {
        id: 'training.generate_compliance_report',
        name: 'Generate Training Compliance Report',
        // @ts-expect-error — TS migration: fix in refactoring sprint
        category: 'training',
        description: 'Generate a workspace-wide officer training compliance report with pass rates, open interventions, and expiring certificates',
        requiredPermissions: ['training:read', 'reports:read'],
        requiredConsents: [],
        prerequisites: ['workspace_configured'],
        timeout: 60000,
        retryable: true,
        maxRetries: 2,
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
      // ── HelpAI Knowledge & Support Tools ────────────────────────────────────
      {
        id: 'helpai.knowledge_search',
        name: 'HelpAI Knowledge Search',
        category: 'data',
        description: 'Search Trinity\'s full knowledge base (regulatory modules, compliance rules, org-specific knowledge) to enrich HelpAI responses with accurate platform and industry information.',
        requiredPermissions: ['helpai:respond'],
        requiredConsents: [],
        prerequisites: [],
        timeout: 10000,
        retryable: true,
        maxRetries: 2,
        rateLimit: { requests: 60, windowMs: 60000 },
      },
      {
        id: 'helpai.faq_search',
        name: 'HelpAI FAQ Search',
        category: 'data',
        description: 'Search platform FAQs with keyword and semantic scoring to surface relevant pre-answered questions during active helpdesk sessions.',
        requiredPermissions: ['helpai:respond'],
        requiredConsents: [],
        prerequisites: [],
        timeout: 5000,
        retryable: true,
        maxRetries: 3,
        rateLimit: { requests: 120, windowMs: 60000 },
      },
      {
        id: 'helpai.cross_channel_context',
        name: 'Cross-Channel Context',
        category: 'data',
        description: 'Retrieve a unified cross-channel snapshot of a user\'s recent email threads, voice calls, and open support tickets to give Trinity and HelpAI full situational awareness before responding.',
        requiredPermissions: ['helpai:respond', 'support:read'],
        requiredConsents: [],
        prerequisites: ['user_exists'],
        timeout: 8000,
        retryable: true,
        maxRetries: 2,
        rateLimit: { requests: 60, windowMs: 60000 },
      },
      {
        id: 'helpai.support_action',
        name: 'HelpAI Support Action',
        // @ts-expect-error — TS migration: fix in refactoring sprint
        category: 'support',
        description: 'Execute one of the 14 corrective support actions (account unlock, PIN reset, 2FA reset, schedule fix, invoice recalculate, etc.) on behalf of a support agent or Trinity with full audit trail.',
        requiredPermissions: ['support:execute', 'helpai:act'],
        requiredConsents: [],
        prerequisites: ['support_role_verified'],
        timeout: 30000,
        retryable: false,
        maxRetries: 0,
      },
      {
        id: 'helpai.voice_context',
        name: 'Voice Call Context',
        category: 'communication',
        description: 'Retrieve recent voice call sessions for a workspace — status, duration, Trinity AI resolution result — to provide cross-channel support context when assisting via chat or email.',
        requiredPermissions: ['helpai:respond', 'voice:read'],
        requiredConsents: [],
        prerequisites: [],
        timeout: 6000,
        retryable: true,
        maxRetries: 2,
        rateLimit: { requests: 60, windowMs: 60000 },
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

    log.info(`[ToolRegistry] Registered tool: ${capability.id} (${capability.category})`);
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

    log.info('[ToolRegistry] Health monitoring started');
  }

  stopHealthMonitoring(): void {
    if (this.healthCheckInterval) {
      clearInterval(this.healthCheckInterval);
      this.healthCheckInterval = null;
    }
  }

  // ============================================================================
  // DETERMINISTIC TOOL SELECTION WITH AUTO-FALLBACK
  // ============================================================================

  /**
   * Select a healthy tool, with automatic fallback to alternatives in same category
   * This solves the "Deterministic Tool Selection" gap
   */
  selectHealthyTool(
    toolId: string,
    options?: {
      requireHealthy?: boolean;
      allowDegraded?: boolean;
      preferredFallbacks?: string[];
    }
  ): {
    selectedToolId: string;
    originalToolId: string;
    fallbackUsed: boolean;
    health: ToolHealth;
    reason?: string;
  } | null {
    const tool = this.tools.get(toolId);
    if (!tool) {
      log.warn(`[ToolRegistry] Tool ${toolId} not found`);
      return null;
    }

    const health = this.healthStatus.get(toolId);
    if (!health) {
      return null;
    }

    const requireHealthy = options?.requireHealthy ?? true;
    const allowDegraded = options?.allowDegraded ?? true;

    // Check if primary tool is healthy enough
    if (health.status === 'healthy') {
      return {
        selectedToolId: toolId,
        originalToolId: toolId,
        fallbackUsed: false,
        health,
      };
    }

    if (health.status === 'degraded' && allowDegraded) {
      return {
        selectedToolId: toolId,
        originalToolId: toolId,
        fallbackUsed: false,
        health,
        reason: 'Primary tool is degraded but acceptable',
      };
    }

    // Primary tool is unhealthy - attempt fallback
    if (!requireHealthy) {
      return {
        selectedToolId: toolId,
        originalToolId: toolId,
        fallbackUsed: false,
        health,
        reason: 'Primary tool unhealthy, but healthy not required',
      };
    }

    // Find healthy alternative in same category
    const alternative = this.findHealthyAlternative(toolId, options?.preferredFallbacks);
    if (alternative) {
      log.info(`[ToolRegistry] Auto-fallback: ${toolId} -> ${alternative.toolId} (${health.status} -> ${alternative.health.status})`);
      return {
        selectedToolId: alternative.toolId,
        originalToolId: toolId,
        fallbackUsed: true,
        health: alternative.health,
        reason: `Fallback from ${toolId} (${health.status}) to ${alternative.toolId}`,
      };
    }

    // No healthy alternative found
    log.warn(`[ToolRegistry] No healthy fallback for ${toolId} (status: ${health.status})`);
    return {
      selectedToolId: toolId,
      originalToolId: toolId,
      fallbackUsed: false,
      health,
      reason: `No healthy alternative found, using unhealthy tool ${toolId}`,
    };
  }

  /**
   * Find a healthy alternative tool in the same category
   */
  findHealthyAlternative(
    toolId: string,
    preferredFallbacks?: string[]
  ): { toolId: string; health: ToolHealth } | null {
    const tool = this.tools.get(toolId);
    if (!tool) return null;

    const categoryTools = this.getToolsByCategory(tool.category);
    
    // Build candidate list: preferred fallbacks first, then category tools
    const candidates: string[] = [];
    
    if (preferredFallbacks) {
      for (const fb of preferredFallbacks) {
        if (this.tools.has(fb) && fb !== toolId) {
          candidates.push(fb);
        }
      }
    }
    
    for (const t of categoryTools) {
      if (t.id !== toolId && !candidates.includes(t.id)) {
        candidates.push(t.id);
      }
    }

    // Find first healthy candidate
    for (const candidateId of candidates) {
      const health = this.healthStatus.get(candidateId);
      if (health && health.status === 'healthy') {
        return { toolId: candidateId, health };
      }
    }

    // If no healthy found, try degraded
    for (const candidateId of candidates) {
      const health = this.healthStatus.get(candidateId);
      if (health && health.status === 'degraded') {
        return { toolId: candidateId, health };
      }
    }

    return null;
  }

  /**
   * Perform active health check on a specific tool
   * Returns updated health status
   */
  async performHealthCheck(toolId: string): Promise<ToolHealth | null> {
    const tool = this.tools.get(toolId);
    if (!tool) return null;

    const health = this.healthStatus.get(toolId);
    if (!health) return null;

    const startTime = Date.now();

    try {
      // If tool has a health endpoint, check it
      if (tool.healthEndpoint) {
        const response = await fetch(tool.healthEndpoint, {
          method: 'GET',
          signal: AbortSignal.timeout(5000),
        });

        const responseTime = Date.now() - startTime;
        health.lastCheck = new Date();
        health.responseTime = responseTime;

        if (response.ok) {
          health.status = 'healthy';
          health.lastSuccess = new Date();
          health.consecutiveFailures = 0;
        } else {
          health.consecutiveFailures++;
          health.lastError = { 
            message: `Health check failed: ${response.status}`, 
            timestamp: new Date() 
          };
          health.status = health.consecutiveFailures >= 3 ? 'offline' : 'degraded';
        }
      } else {
        // No health endpoint - infer from recent usage
        const metrics = this.usageMetrics.get(toolId);
        if (metrics && metrics.totalCalls > 0) {
          const recentSuccessRate = metrics.successfulCalls / metrics.totalCalls;
          health.lastCheck = new Date();
          
          if (recentSuccessRate >= 0.95) {
            health.status = 'healthy';
          } else if (recentSuccessRate >= 0.7) {
            health.status = 'degraded';
          } else if (recentSuccessRate < 0.5 && metrics.totalCalls >= 5) {
            health.status = 'offline';
          }
        }
      }

      log.info(`[ToolRegistry] Health check ${toolId}: ${health.status}`);
      return health;
    } catch (error: any) {
      health.lastCheck = new Date();
      health.consecutiveFailures++;
      health.lastError = { message: (error instanceof Error ? error.message : String(error)), timestamp: new Date() };
      health.status = health.consecutiveFailures >= 3 ? 'offline' : 'degraded';
      
      log.warn(`[ToolRegistry] Health check failed for ${toolId}: ${(error instanceof Error ? error.message : String(error))}`);
      return health;
    }
  }

  /**
   * Perform health checks on all tools
   */
  async performAllHealthChecks(): Promise<{ healthy: number; degraded: number; offline: number }> {
    const results = { healthy: 0, degraded: 0, offline: 0 };
    
    for (const toolId of this.tools.keys()) {
      const health = await this.performHealthCheck(toolId);
      if (health) {
        if (health.status === 'healthy') results.healthy++;
        else if (health.status === 'degraded') results.degraded++;
        else if (health.status === 'offline') results.offline++;
      }
    }

    log.info(`[ToolRegistry] Health check complete: ${results.healthy} healthy, ${results.degraded} degraded, ${results.offline} offline`);
    return results;
  }

  /**
   * Reset tool health status (e.g., after fixing an issue)
   */
  resetToolHealth(toolId: string): boolean {
    const health = this.healthStatus.get(toolId);
    if (!health) return false;

    health.status = 'unknown';
    health.consecutiveFailures = 0;
    health.lastError = undefined;
    health.lastCheck = new Date();
    
    log.info(`[ToolRegistry] Reset health for ${toolId}`);
    return true;
  }

  /**
   * Get tools that are currently available (healthy or degraded)
   */
  getAvailableTools(): ToolCapability[] {
    return Array.from(this.tools.values()).filter(tool => {
      const health = this.healthStatus.get(tool.id);
      return health && (health.status === 'healthy' || health.status === 'degraded');
    });
  }

  /**
   * Get tools that are currently unavailable (offline)
   */
  getUnavailableTools(): ToolCapability[] {
    return Array.from(this.tools.values()).filter(tool => {
      const health = this.healthStatus.get(tool.id);
      return health && health.status === 'offline';
    });
  }
}

export const toolCapabilityRegistry = new ToolCapabilityRegistry();
