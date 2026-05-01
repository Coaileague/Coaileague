/**
 * Trinity Resilient Reasoning Gateway — backend-path failover
 *
 * Trinity is one unified agent with one personality. Under the hood her
 * reasoning runs on multiple interchangeable model backends; this gateway
 * handles the internal routing so a single backend outage never takes
 * Trinity offline.
 *
 * Backend reasoning paths (priority order, lowest-cost first):
 * - operations backend     — fast orchestration reasoning
 * - specialist backend     — deep legal/compliance/drafting reasoning
 * - support backend        — customer support and synthesis
 * - rule-based fallback    — deterministic logic when every AI backend is down
 *
 * Callers never pick a backend directly — they call Trinity. This file
 * transparently routes, fails over, and reports back as Trinity.
 *
 * Features:
 * - Circuit-breaker pattern to prevent cascading backend failures
 * - Health monitoring with automatic recovery
 * - Audit logging for every internal backend switch
 * - Graceful degradation to rule-based output when all AI paths are down
 */

import { db } from '../../../db';
import { auditLogs } from '@shared/schema';
import { TOKEN_COSTS, isUnlimitedTokenUser, tokenManager } from '../../billing/tokenManager';
import { aiTokenGateway } from '../../billing/aiTokenGateway';
import { platformEventBus } from '../../platformEventBus';
import { createLogger } from '../../../lib/logger';

const log = createLogger('ResilientAIGateway');

export type AIProvider = 'gemini' | 'claude' | 'openai' | 'rule_based';

export interface ProviderHealth {
  provider: AIProvider;
  isHealthy: boolean;
  lastCheck: Date;
  lastError?: string;
  consecutiveFailures: number;
  totalRequests: number;
  totalFailures: number;
  avgLatencyMs: number;
  circuitOpen: boolean;
  circuitOpenUntil?: Date;
}

export interface AIRequest {
  prompt: string;
  context?: Record<string, unknown>;
  domain?: string;
  maxTokens?: number;
  temperature?: number;
  workspaceId?: string;
  userId?: string;
  operationType?: 'critical' | 'standard' | 'simple';
  isHealthCheck?: boolean;
  preferredProvider?: AIProvider;
}

export interface AIResponse {
  content: string;
  provider: AIProvider;
  latencyMs: number;
  fallbackUsed: boolean;
  originalProvider: AIProvider;
}

export interface SystemStatus {
  primaryProvider: AIProvider;
  activeProvider: AIProvider;
  mode: 'normal' | 'degraded' | 'emergency';
  lastHealthCheck: Date;
  providerHealth: Record<AIProvider, ProviderHealth>;
}

import { SCHEDULING } from '../../../config/platformConfig';
const CIRCUIT_BREAKER_THRESHOLD = SCHEDULING.circuitBreakerThreshold;
const CIRCUIT_RESET_TIME_MS = 5 * 60 * 1000;
const HEALTH_CHECK_INTERVAL_MS = 5 * 60 * 1000;

class ResilientAIGateway {
  private providerHealth: Map<AIProvider, ProviderHealth> = new Map();
  private systemStatus: SystemStatus;
  private healthCheckInterval: NodeJS.Timeout | null = null;

  constructor() {
    this.initializeProviderHealth();
    this.systemStatus = {
      primaryProvider: 'gemini',
      activeProvider: 'gemini',
      mode: 'normal',
      lastHealthCheck: new Date(),
      providerHealth: {} as Record<AIProvider, ProviderHealth>,
    };
    this.startHealthMonitoring();
  }

  private initializeProviderHealth() {
    const providers: AIProvider[] = ['gemini', 'claude', 'openai', 'rule_based'];
    providers.forEach(provider => {
      this.providerHealth.set(provider, {
        provider,
        isHealthy: provider === 'rule_based' ? true : this.isProviderConfigured(provider),
        lastCheck: new Date(),
        consecutiveFailures: 0,
        totalRequests: 0,
        totalFailures: 0,
        avgLatencyMs: 0,
        circuitOpen: false,
      });
    });
  }

  private isProviderConfigured(provider: AIProvider): boolean {
    switch (provider) {
      case 'gemini':
        return !!process.env.GEMINI_API_KEY;
      case 'claude':
        return !!process.env.CLAUDE_API_KEY || !!process.env.ANTHROPIC_API_KEY;
      case 'openai':
        return !!process.env.OPENAI_API_KEY;
      case 'rule_based':
        return true;
      default:
        return false;
    }
  }

  private getProviderPriority(): AIProvider[] {
    const priority: AIProvider[] = ['gemini'];
    
    if (this.isProviderConfigured('claude')) {
      priority.push('claude');
    }
    if (this.isProviderConfigured('openai')) {
      priority.push('openai');
    }
    priority.push('rule_based');
    
    return priority;
  }

  private isCircuitOpen(provider: AIProvider): boolean {
    const health = this.providerHealth.get(provider);
    if (!health) return true;
    
    if (health.circuitOpen && health.circuitOpenUntil) {
      if (new Date() > health.circuitOpenUntil) {
        health.circuitOpen = false;
        health.consecutiveFailures = 0;
        log.info(`🔌 Circuit breaker reset for ${provider}`);
        return false;
      }
      return true;
    }
    return false;
  }

  private openCircuit(provider: AIProvider, error: string) {
    const health = this.providerHealth.get(provider);
    if (!health) return;

    health.consecutiveFailures++;
    health.totalFailures++;
    health.lastError = error;

    if (health.consecutiveFailures >= CIRCUIT_BREAKER_THRESHOLD) {
      health.circuitOpen = true;
      health.circuitOpenUntil = new Date(Date.now() + CIRCUIT_RESET_TIME_MS);
      health.isHealthy = false;
      log.info(`⚡ Circuit breaker OPEN for ${provider} - will retry after ${CIRCUIT_RESET_TIME_MS / 1000}s`);
    }
  }

  private recordSuccess(provider: AIProvider, latencyMs: number) {
    const health = this.providerHealth.get(provider);
    if (!health) return;

    health.consecutiveFailures = 0;
    health.totalRequests++;
    health.isHealthy = true;
    health.avgLatencyMs = (health.avgLatencyMs * (health.totalRequests - 1) + latencyMs) / health.totalRequests;
    health.lastCheck = new Date();

    // Alert if Trinity's primary reasoning path (operations backend) falls
    // back to a secondary path more than 30% of the time.
    if (provider === 'gemini' && health.totalRequests >= 50) {
      const fallbackRate = (health.totalFailures / health.totalRequests) * 100;
      if (fallbackRate > 30) {
        log.error(`[Trinity:gateway] CRITICAL ALERT: operations-reasoning fallback rate exceeded 30% (${fallbackRate.toFixed(1)}%)`);
      }
    }
  }

  private async logProviderSwitch(
    originalProvider: AIProvider,
    usedProvider: AIProvider,
    reason: string,
    request: AIRequest
  ) {
    try {
      if (request.userId) {
        await db.insert(auditLogs).values({
          userId: request.userId,
          userEmail: 'system@coaileague.ai',
          userRole: 'system',
          action: 'update',
          entityType: 'ai_provider_switch',
          entityId: `${originalProvider}_to_${usedProvider}`,
          workspaceId: request.workspaceId || null,
          changes: { before: { provider: originalProvider }, after: { provider: usedProvider } },
          metadata: { reason, domain: request.domain },
        });
      }
      log.info(`📋 Provider switch logged: ${originalProvider} → ${usedProvider} (${reason})`);
    } catch (err) {
      log.error('Failed to log provider switch:', err);
    }
  }

  async callWithFallback(request: AIRequest): Promise<AIResponse> {
    let providers = this.getProviderPriority();
    
    if (request.preferredProvider && providers.includes(request.preferredProvider)) {
      providers = [request.preferredProvider, ...providers.filter(p => p !== request.preferredProvider)];
      log.info(`🎯 [Trinity:routing] Preferred provider: ${request.preferredProvider} for domain: ${request.domain || 'general'}`);
    }
    
    let lastError: Error | null = null;
    const originalProvider = providers[0];

    for (const provider of providers) {
      if (this.isCircuitOpen(provider)) {
        log.info(`⏭️ Skipping ${provider} - circuit open`);
        continue;
      }

      try {
        const startTime = Date.now();
        const content = await this.callProvider(provider, request);
        const latencyMs = Date.now() - startTime;

        this.recordSuccess(provider, latencyMs);

        const fallbackUsed = provider !== originalProvider;
        if (fallbackUsed) {
          log.info(`🔄 Fallback to ${provider} successful`);
          await this.logProviderSwitch(originalProvider, provider, lastError?.message || 'Primary unavailable', request);
          this.updateSystemMode(provider);
        } else {
          // Primary provider succeeded - reset to normal mode if we were in degraded/emergency
          if (this.systemStatus.mode !== 'normal') {
            log.info(`✅ Primary provider ${provider} recovered - resetting to normal mode`);
            this.systemStatus.mode = 'normal';
            this.systemStatus.activeProvider = provider;
          }
        }

        return {
          content,
          provider,
          latencyMs,
          fallbackUsed,
          originalProvider,
        };
      } catch (error: any) {
        lastError = error;
        log.error(`❌ ${provider} failed:`, (error instanceof Error ? error.message : String(error)));
        this.openCircuit(provider, (error instanceof Error ? error.message : String(error)));
      }
    }

    this.updateSystemMode('rule_based');
    throw new Error(`All AI providers unavailable. Last error: ${lastError?.message}`);
  }

  private async callProvider(provider: AIProvider, request: AIRequest): Promise<string> {
    switch (provider) {
      case 'gemini':
        return this.callGemini(request);
      case 'claude':
        return this.callClaude(request);
      case 'openai':
        return this.callOpenAI(request);
      case 'rule_based':
        return this.callRuleBased(request);
      default:
        throw new Error(`Unknown provider: ${provider}`);
    }
  }

  private async callGemini(request: AIRequest): Promise<string> {
    const { geminiClient } = await import('./geminiClient');
    
    const result = await Promise.race([
      geminiClient.generate({
        userMessage: request.prompt,
        systemPrompt: 'You are Trinity, an AI assistant.',
        workspaceId: request.isHealthCheck ? undefined : request.workspaceId,
        userId: request.isHealthCheck ? undefined : request.userId,
        featureKey: request.isHealthCheck ? 'health_check' : (request.domain ? `ai_${request.domain}` : 'ai_general'),
      }),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error('Gemini API timeout after 30000ms')), 30000)
      )
    ]);
    
    return result.text || '';
  }

  /**
   * Get the appropriate Claude feature key based on operation type
   * Maps to TOKEN_COSTS for accurate billing
   */
  private getClaudeFeatureKey(operationType?: string, domain?: string): string {
    // Map operation types to specific Claude feature keys
    if (operationType === 'critical' || domain?.includes('executive') || domain?.includes('board')) {
      return 'trinity_executive'; // 35 credits - highest tier
    }
    if (operationType === 'standard' || domain?.includes('strategic') || domain?.includes('analysis')) {
      return 'trinity_strategic'; // 30 credits - mid tier
    }
    if (domain?.includes('rfp')) {
      return 'trinity_rfp_response'; // 35 credits - high-value
    }
    if (domain?.includes('capability') || domain?.includes('proposal')) {
      return 'trinity_capability_statement'; // 30 credits
    }
    // Default to standard analysis
    return 'trinity_analysis'; // 25 credits - base tier
  }

  /**
   * RUNTIME ENFORCEMENT: Check Claude Premium guardrails before API call
   * Implements hard stops, alerts, and throttling per billingConfig
   * 
   * @param workspaceId - Workspace to check credits for
   * @param userId - Optional user ID
   * @param featureKey - The specific Claude feature key for accurate billing
   * @param estimatedCredits - Estimated credits needed for this operation
   */
  private async enforceClaudeGuardrails(
    workspaceId: string,
    userId: string | undefined,
    featureKey: string,
    estimatedCredits: number = 25
  ): Promise<{ allowed: boolean; reason?: string; alert?: string }> {
    // Check if user has unlimited access (enterprise tier or platform staff)
    const hasUnlimited = await isUnlimitedTokenUser(userId || '', workspaceId);
    if (hasUnlimited) {
      return { allowed: true };
    }

    // Check credit balance BEFORE making the call using the SAME feature key
    // that will be used for billing to ensure consistent enforcement
    const creditAuth = await aiTokenGateway.preAuthorize(
      workspaceId,
      userId,
      featureKey
    );

    if (!creditAuth.authorized) {
      log.info(`🚫 [Trinity:specialist-guardrail] BLOCKED - ${creditAuth.reason} for workspace: ${workspaceId} (feature: ${featureKey})`);
      return {
        allowed: false,
        reason: creditAuth.reason || `Insufficient credits for ${featureKey}. Please upgrade or purchase more credits.`,
      };
    }

    const balance = await tokenManager.getBalance(workspaceId);
    const creditCost = creditAuth.classification.tokenCost;

    if (balance > 0 && creditCost > 0) {
      const creditsAfterCall = balance - creditCost;
      const lowBalanceThreshold90 = creditCost * 2;
      const lowBalanceThreshold75 = creditCost * 5;

      if (creditsAfterCall <= lowBalanceThreshold90) {
        platformEventBus.publish({
          type: 'ai_brain_action',
          category: 'ai_brain',
          title: 'Claude AI Credits Nearly Exhausted',
          description: `Credits critically low after this operation. Remaining: ${creditsAfterCall} credits`,
          workspaceId,
          metadata: { billingCategory: 'credit_warning_critical', userId, severity: 'high', balance: creditsAfterCall, creditCost },
        }).catch((err) => log.warn('[Trinity:gateway] Fire-and-forget failed:', err));
        return { allowed: true, alert: `Warning: Credits critically low. ${creditsAfterCall} remaining after this call.` };
      }
      if (creditsAfterCall <= lowBalanceThreshold75) {
        platformEventBus.publish({
          type: 'ai_brain_action',
          category: 'ai_brain',
          title: 'Claude AI Credits Running Low',
          description: `Credits running low. Remaining: ${creditsAfterCall} credits`,
          workspaceId,
          metadata: { billingCategory: 'credit_warning', userId, severity: 'medium', balance: creditsAfterCall, creditCost },
        }).catch((err) => log.warn('[Trinity:gateway] Fire-and-forget failed:', err));
        return { allowed: true, alert: `Warning: Credits running low. ${creditsAfterCall} remaining after this call.` };
      }
    }

    return { allowed: true };
  }

  private async callClaude(request: AIRequest): Promise<string> {
    // Trinity's specialist-reasoning backend — one of her interchangeable
    // compute paths. The method name and SDK identifiers below are
    // backend wiring only; Trinity speaks as one agent to every caller.
    const apiKey = process.env.CLAUDE_API_KEY || process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      log.warn('[Trinity:specialist] backend key not configured, falling back to next reasoning path');
      throw new Error('Trinity specialist-reasoning backend key not configured — routing to fallback');
    }

    // Get the appropriate feature key for this operation
    const featureKey = this.getClaudeFeatureKey(request.operationType, request.domain);
    const estimatedCredits = TOKEN_COSTS[featureKey as keyof typeof TOKEN_COSTS] || 25;

    // RUNTIME ENFORCEMENT: Check guardrails BEFORE making API call
    // Uses the same feature key for both enforcement and billing
    if (!request.workspaceId && !request.isHealthCheck) {
      log.warn('[Trinity:specialist] invocation without workspaceId — billing will be skipped', {
        operationType: request.operationType,
        domain: request.domain,
        featureKey,
      });
    }
    if (request.workspaceId) {
      const guardrailCheck = await this.enforceClaudeGuardrails(
        request.workspaceId,
        request.userId,
        featureKey,  // Pass the operation-specific feature key for consistent enforcement
        estimatedCredits
      );

      if (!guardrailCheck.allowed) {
        // HARD STOP - Return error message instead of making API call
        throw new Error(`Trinity specialist reasoning blocked: ${guardrailCheck.reason}`);
      }

      if (guardrailCheck.alert) {
        log.info(`⚠️ [Trinity:specialist-guardrail] ${guardrailCheck.alert}`);
      }
    }

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      signal: AbortSignal.timeout(30000),
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-6',
        max_tokens: request.maxTokens || 1024,
        messages: [{ role: 'user', content: request.prompt }],
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Trinity specialist backend error: ${response.status} - ${error}`);
    }

    const data = await response.json();
    const textContent = data.content?.[0]?.text || '';

    // Track specialist-path usage for billing with the correct feature key
    if (request.workspaceId && data.usage) {
      const inputTokens = data.usage.input_tokens || 0;
      const outputTokens = data.usage.output_tokens || 0;
      const totalTokens = inputTokens + outputTokens;

      if (totalTokens > 0) {
        await aiTokenGateway.finalizeBilling(
          request.workspaceId,
          request.userId,
          featureKey,
          totalTokens,
          { inputTokens, outputTokens, model: 'claude' },
        );
        // Mirror Gemini path — record to the primary metering ledger with
        // real input/output tokens so tenant usage, overage, and tier caps
        // reflect actual Claude consumption.
        import('../../billing/aiMeteringService').then(({ aiMeteringService }) => {
          aiMeteringService.recordAiCall({
            workspaceId: request.workspaceId!,
            modelName: 'claude',
            callType: featureKey,
            inputTokens,
            outputTokens,
            triggeredByUserId: request.userId,
          });
        }).catch((err: any) => log.warn('[AIMeter] claude recordAiCall failed (non-blocking):', err?.message));
        log.info(`[BillingGate] Trinity specialist [${featureKey}] - ${totalTokens} tokens (${estimatedCredits} credits) billed to workspace: ${request.workspaceId}`);
      }
    }

    return textContent;
  }

  private async callOpenAI(request: AIRequest): Promise<string> {
    const { getMeteredOpenAICompletion } = await import('../../billing/universalAIBillingInterceptor');
    
    const result = await getMeteredOpenAICompletion({
      messages: [{ role: 'user' as const, content: request.prompt }],
      model: 'gpt-4o',
      maxTokens: request.maxTokens || 1024,
      workspaceId: request.workspaceId,
      userId: request.userId,
      featureKey: 'ai_general',
    });

    if (!result.success) {
      throw new Error(result.error || 'OpenAI call failed through billing interceptor');
    }

    return result.content;
  }

  private callRuleBased(request: AIRequest): string {
    const domain = request.domain?.toLowerCase() || '';
    
    if (domain.includes('payroll')) {
      return JSON.stringify({
        mode: 'rule_based',
        message: 'AI temporarily unavailable. Payroll calculations using standard formulas.',
        action: 'use_standard_calculation',
        formula: 'hours * rate - standard_deductions',
      });
    }
    
    if (domain.includes('scheduling')) {
      return JSON.stringify({
        mode: 'rule_based',
        message: 'AI temporarily unavailable. Using template-based scheduling.',
        action: 'use_template_schedule',
        template: 'default_weekly',
      });
    }
    
    if (domain.includes('invoice')) {
      return JSON.stringify({
        mode: 'rule_based',
        message: 'AI temporarily unavailable. Using standard invoice generation.',
        action: 'use_standard_invoice',
      });
    }
    
    return JSON.stringify({
      mode: 'rule_based',
      message: 'AI features temporarily unavailable. Core operations continue with standard logic.',
      action: 'fallback_mode',
    });
  }

  private updateSystemMode(activeProvider: AIProvider) {
    const oldMode = this.systemStatus.mode;
    if (activeProvider === 'gemini') {
      this.systemStatus.mode = 'normal';
    } else if (activeProvider === 'rule_based') {
      this.systemStatus.mode = 'emergency';
    } else {
      this.systemStatus.mode = 'degraded';
    }
    this.systemStatus.activeProvider = activeProvider;

    // Trigger alert on mode escalation
    if (this.systemStatus.mode !== oldMode && this.systemStatus.mode !== 'normal') {
      platformEventBus.publish({
        type: 'ai_brain_action',
        category: 'ai_brain',
        title: `AI System ${this.systemStatus.mode.toUpperCase()}`,
        description: `AI system has entered ${this.systemStatus.mode} mode. Active provider: ${activeProvider}.`,
        metadata: {
          mode: this.systemStatus.mode,
          activeProvider,
          previousMode: oldMode,
          severity: this.systemStatus.mode === 'emergency' ? 'critical' : 'high'
        }
      }).catch(err => log.error('Failed to publish AI mode alert:', err));
    }
  }

  private startHealthMonitoring() {
    if (this.healthCheckInterval) {
      clearInterval(this.healthCheckInterval);
    }

    this.healthCheckInterval = setInterval(async () => {
      try {
        await this.performHealthCheck();
      } catch (error: any) {
        log.warn('[Trinity:gateway] Health check failed (will retry):', error?.message || 'unknown');
      }
    }, HEALTH_CHECK_INTERVAL_MS);

    this.performHealthCheck();
  }

  private async performHealthCheck() {
    log.info('🏥 Running AI provider health check...');
    this.systemStatus.lastHealthCheck = new Date();

    for (const [provider, health] of this.providerHealth) {
      if (provider === 'rule_based') continue;
      if (!this.isProviderConfigured(provider)) continue;

      try {
        const startTime = Date.now();
        await this.callProvider(provider, {
          prompt: 'Health check: respond with OK',
          maxTokens: 10,
          isHealthCheck: true,
        });
        const latencyMs = Date.now() - startTime;
        
        health.isHealthy = true;
        health.consecutiveFailures = 0;
        health.avgLatencyMs = latencyMs;
        health.lastCheck = new Date();
        
        log.info(`✅ ${provider} healthy (${latencyMs}ms)`);
      } catch (error: any) {
        health.isHealthy = false;
        health.lastError = (error instanceof Error ? error.message : String(error));
        health.lastCheck = new Date();
        log.info(`❌ ${provider} unhealthy: ${(error instanceof Error ? error.message : String(error))}`);
      }
    }

    this.systemStatus.providerHealth = Object.fromEntries(this.providerHealth) as Record<AIProvider, ProviderHealth>;
  }

  getSystemStatus(): SystemStatus {
    this.systemStatus.providerHealth = Object.fromEntries(this.providerHealth) as Record<AIProvider, ProviderHealth>;
    return { ...this.systemStatus };
  }

  getProviderHealth(provider: AIProvider): ProviderHealth | undefined {
    return this.providerHealth.get(provider);
  }

  isSystemHealthy(): boolean {
    return this.systemStatus.mode !== 'emergency';
  }

  shutdown() {
    if (this.healthCheckInterval) {
      clearInterval(this.healthCheckInterval);
      this.healthCheckInterval = null;
    }
  }
}

export const resilientAIGateway = new ResilientAIGateway();

export async function callAIWithFallback(
  prompt: string,
  context?: Record<string, unknown>,
  options?: Partial<AIRequest>
): Promise<AIResponse> {
  return resilientAIGateway.callWithFallback({
    prompt,
    context,
    ...options,
  });
}

export function getAISystemStatus(): SystemStatus {
  return resilientAIGateway.getSystemStatus();
}
