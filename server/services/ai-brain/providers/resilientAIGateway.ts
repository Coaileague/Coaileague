/**
 * RESILIENT AI GATEWAY - Multi-Provider Fallback System
 * 
 * Provides automatic failover when AI providers go down:
 * - Primary: Gemini (existing infrastructure)
 * - Fallback 1: Claude (when configured)
 * - Fallback 2: OpenAI GPT-4 (when configured)
 * - Fallback 3: Rule-based logic (no AI required)
 * 
 * Features:
 * - Circuit breaker pattern to prevent cascading failures
 * - Health monitoring with automatic recovery
 * - Audit logging for all provider switches
 * - Graceful degradation to rule-based fallbacks
 */

import { db } from '../../../db';
import { auditLogs } from '@shared/schema';

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
  context?: Record<string, any>;
  domain?: string;
  maxTokens?: number;
  temperature?: number;
  workspaceId?: string;
  userId?: string;
  operationType?: 'critical' | 'standard' | 'simple';
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

const CIRCUIT_BREAKER_THRESHOLD = 3;
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
        console.log(`🔌 Circuit breaker reset for ${provider}`);
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
      console.log(`⚡ Circuit breaker OPEN for ${provider} - will retry after ${CIRCUIT_RESET_TIME_MS / 1000}s`);
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
      console.log(`📋 Provider switch logged: ${originalProvider} → ${usedProvider} (${reason})`);
    } catch (err) {
      console.error('Failed to log provider switch:', err);
    }
  }

  async callWithFallback(request: AIRequest): Promise<AIResponse> {
    const providers = this.getProviderPriority();
    let lastError: Error | null = null;
    const originalProvider = providers[0];

    for (const provider of providers) {
      if (this.isCircuitOpen(provider)) {
        console.log(`⏭️ Skipping ${provider} - circuit open`);
        continue;
      }

      try {
        const startTime = Date.now();
        const content = await this.callProvider(provider, request);
        const latencyMs = Date.now() - startTime;

        this.recordSuccess(provider, latencyMs);

        const fallbackUsed = provider !== originalProvider;
        if (fallbackUsed) {
          console.log(`🔄 Fallback to ${provider} successful`);
          await this.logProviderSwitch(originalProvider, provider, lastError?.message || 'Primary unavailable', request);
          this.updateSystemMode(provider);
        } else {
          // Primary provider succeeded - reset to normal mode if we were in degraded/emergency
          if (this.systemStatus.mode !== 'normal') {
            console.log(`✅ Primary provider ${provider} recovered - resetting to normal mode`);
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
        console.error(`❌ ${provider} failed:`, error.message);
        this.openCircuit(provider, error.message);
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
    
    const result = await geminiClient.generate({
      userMessage: request.prompt,
      systemPrompt: 'You are Trinity, an AI assistant.',
      workspaceId: request.workspaceId,
      userId: request.userId,
    });
    
    return result.text || '';
  }

  private async callClaude(request: AIRequest): Promise<string> {
    const apiKey = process.env.CLAUDE_API_KEY || process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      throw new Error('Claude API key not configured');
    }

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: request.maxTokens || 1024,
        messages: [{ role: 'user', content: request.prompt }],
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Claude API error: ${response.status} - ${error}`);
    }

    const data = await response.json();
    return data.content?.[0]?.text || '';
  }

  private async callOpenAI(request: AIRequest): Promise<string> {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      throw new Error('OpenAI API key not configured');
    }

    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: 'gpt-4o',
        max_tokens: request.maxTokens || 1024,
        messages: [{ role: 'user', content: request.prompt }],
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`OpenAI API error: ${response.status} - ${error}`);
    }

    const data = await response.json();
    return data.choices?.[0]?.message?.content || '';
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
    if (activeProvider === 'gemini') {
      this.systemStatus.mode = 'normal';
    } else if (activeProvider === 'rule_based') {
      this.systemStatus.mode = 'emergency';
    } else {
      this.systemStatus.mode = 'degraded';
    }
    this.systemStatus.activeProvider = activeProvider;
  }

  private startHealthMonitoring() {
    if (this.healthCheckInterval) {
      clearInterval(this.healthCheckInterval);
    }

    this.healthCheckInterval = setInterval(async () => {
      await this.performHealthCheck();
    }, HEALTH_CHECK_INTERVAL_MS);

    this.performHealthCheck();
  }

  private async performHealthCheck() {
    console.log('🏥 Running AI provider health check...');
    this.systemStatus.lastHealthCheck = new Date();

    for (const [provider, health] of this.providerHealth) {
      if (provider === 'rule_based') continue;
      if (!this.isProviderConfigured(provider)) continue;

      try {
        const startTime = Date.now();
        await this.callProvider(provider, {
          prompt: 'Health check: respond with OK',
          maxTokens: 10,
        });
        const latencyMs = Date.now() - startTime;
        
        health.isHealthy = true;
        health.consecutiveFailures = 0;
        health.avgLatencyMs = latencyMs;
        health.lastCheck = new Date();
        
        console.log(`✅ ${provider} healthy (${latencyMs}ms)`);
      } catch (error: any) {
        health.isHealthy = false;
        health.lastError = error.message;
        health.lastCheck = new Date();
        console.log(`❌ ${provider} unhealthy: ${error.message}`);
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
  context?: Record<string, any>,
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
