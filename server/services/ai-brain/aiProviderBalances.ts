/**
 * AI PROVIDER BALANCE TRACKER
 * ============================
 * Tracks API key balances for all AI providers.
 * Used in Support Dashboard to monitor and top-off balances.
 * 
 * IMPORTANT: All AI usage is billed to org subscribers via workspace credits.
 * These balances represent YOUR (platform owner's) API credits that get passed through.
 * 
 * Providers tracked:
 * - OpenAI (GPT-4o-mini, GPT-4o, o4-mini)
 * - Google Gemini (2.5 Flash, 2.5 Pro, Gemini 3 exp)
 * - Anthropic Claude (Claude 4.5 Sonnet)
 */

import OpenAI from 'openai';
import { createLogger } from '../../lib/logger';
const log = createLogger('aiProviderBalances');

export interface ProviderBalance {
  provider: string;
  displayName: string;
  models: string[];
  status: 'active' | 'low_balance' | 'inactive' | 'error';
  balance?: {
    available: number;
    used: number;
    limit: number;
    unit: string;
  };
  lastChecked: Date;
  error?: string;
  dashboardUrl?: string;
  warningThreshold?: number;
}

export interface AIProviderBalanceSummary {
  providers: ProviderBalance[];
  totalActive: number;
  totalWithWarnings: number;
  lastUpdated: Date;
}

class AIProviderBalanceService {
  private cache: AIProviderBalanceSummary | null = null;
  private cacheExpiry: Date | null = null;
  private cacheDurationMs = 5 * 60 * 1000; // 5 minutes

  /**
   * Get all AI provider balances for support dashboard
   */
  async getBalances(forceRefresh = false): Promise<AIProviderBalanceSummary> {
    if (!forceRefresh && this.cache && this.cacheExpiry && new Date() < this.cacheExpiry) {
      return this.cache;
    }

    const providers = await Promise.all([
      this.checkOpenAIBalance(),
      this.checkGeminiBalance(),
      this.checkClaudeBalance(),
    ]);

    const summary: AIProviderBalanceSummary = {
      providers,
      totalActive: providers.filter(p => p.status === 'active').length,
      totalWithWarnings: providers.filter(p => p.status === 'low_balance').length,
      lastUpdated: new Date(),
    };

    this.cache = summary;
    this.cacheExpiry = new Date(Date.now() + this.cacheDurationMs);

    return summary;
  }

  /**
   * Check OpenAI account balance
   */
  private async checkOpenAIBalance(): Promise<ProviderBalance> {
    const apiKey = process.env.OPENAI_API_KEY;
    
    if (!apiKey) {
      return {
        provider: 'openai',
        displayName: 'OpenAI (GPT)',
        models: ['gpt-4o-mini', 'gpt-4o', 'o4-mini'],
        status: 'inactive',
        lastChecked: new Date(),
        error: 'OPENAI_API_KEY not configured',
        dashboardUrl: 'https://platform.openai.com/usage',
      };
    }

    try {
      // OpenAI doesn't have a direct balance API, but we can check org info
      const client = new OpenAI({ apiKey });
      
      // Make a minimal API call to verify the key works
      const models = await client.models.list();
      
      return {
        provider: 'openai',
        displayName: 'OpenAI (GPT)',
        models: ['gpt-4o-mini', 'gpt-4o', 'o4-mini'],
        status: 'active',
        balance: {
          available: -1, // OpenAI doesn't expose balance via API
          used: -1,
          limit: -1,
          unit: 'Check dashboard',
        },
        lastChecked: new Date(),
        dashboardUrl: 'https://platform.openai.com/usage',
        warningThreshold: 10, // $10 warning threshold
      };
    } catch (error: any) {
      return {
        provider: 'openai',
        displayName: 'OpenAI (GPT)',
        models: ['gpt-4o-mini', 'gpt-4o', 'o4-mini'],
        status: 'error',
        lastChecked: new Date(),
        error: (error instanceof Error ? error.message : String(error)) || 'Failed to verify OpenAI API key',
        dashboardUrl: 'https://platform.openai.com/usage',
      };
    }
  }

  /**
   * Check Google Gemini balance
   * Note: Gemini via AI Studio doesn't have balance API - it's usage-based billing
   */
  private async checkGeminiBalance(): Promise<ProviderBalance> {
    const apiKey = process.env.GEMINI_API_KEY;
    
    if (!apiKey) {
      return {
        provider: 'gemini',
        displayName: 'Google Gemini',
        models: ['gemini-2.5-flash', 'gemini-2.5-pro', 'gemini-exp-1206'],
        status: 'inactive',
        lastChecked: new Date(),
        error: 'GEMINI_API_KEY not configured',
        dashboardUrl: 'https://aistudio.google.com/app/apikey',
      };
    }

    try {
      // Verify key by checking model availability
      const response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`,
        { method: 'GET', signal: AbortSignal.timeout(15000) }
      );
      
      if (!response.ok) {
        throw new Error(`API returned ${response.status}`);
      }
      
      return {
        provider: 'gemini',
        displayName: 'Google Gemini',
        models: ['gemini-2.5-flash', 'gemini-2.5-pro', 'gemini-exp-1206'],
        status: 'active',
        balance: {
          available: -1, // Gemini billing is via Google Cloud
          used: -1,
          limit: -1,
          unit: 'Check Google Cloud Console',
        },
        lastChecked: new Date(),
        dashboardUrl: 'https://console.cloud.google.com/billing',
        warningThreshold: 50, // $50 warning threshold
      };
    } catch (error: any) {
      return {
        provider: 'gemini',
        displayName: 'Google Gemini',
        models: ['gemini-2.5-flash', 'gemini-2.5-pro', 'gemini-exp-1206'],
        status: 'error',
        lastChecked: new Date(),
        error: (error instanceof Error ? error.message : String(error)) || 'Failed to verify Gemini API key',
        dashboardUrl: 'https://aistudio.google.com/app/apikey',
      };
    }
  }

  /**
   * Check Anthropic Claude balance
   */
  private async checkClaudeBalance(): Promise<ProviderBalance> {
    const apiKey = process.env.CLAUDE_API_KEY || process.env.ANTHROPIC_API_KEY;
    
    if (!apiKey) {
      return {
        provider: 'claude',
        displayName: 'Anthropic Claude 4.5',
        models: ['claude-sonnet-4-6'],
        status: 'inactive',
        lastChecked: new Date(),
        error: 'CLAUDE_API_KEY not configured',
        dashboardUrl: 'https://console.anthropic.com/settings/billing',
      };
    }

    try {
      // Verify key by making a minimal API call
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
          max_tokens: 1,
          messages: [{ role: 'user', content: 'ping' }],
        }),
      });
      
      // Even if we get rate limited, the key is valid
      if (response.status === 429 || response.ok) {
        return {
          provider: 'claude',
          displayName: 'Anthropic Claude 4.5',
          models: ['claude-sonnet-4-6'],
          status: 'active',
          balance: {
            available: -1, // Anthropic doesn't expose balance via API
            used: -1,
            limit: -1,
            unit: 'Check Anthropic Console',
          },
          lastChecked: new Date(),
          dashboardUrl: 'https://console.anthropic.com/settings/billing',
          warningThreshold: 25, // $25 warning threshold
        };
      }
      
      if (response.status === 401) {
        throw new Error('Invalid API key');
      }
      
      throw new Error(`API returned ${response.status}`);
    } catch (error: any) {
      return {
        provider: 'claude',
        displayName: 'Anthropic Claude 4.5',
        models: ['claude-sonnet-4-6'],
        status: 'error',
        lastChecked: new Date(),
        error: (error instanceof Error ? error.message : String(error)) || 'Failed to verify Claude API key',
        dashboardUrl: 'https://console.anthropic.com/settings/billing',
      };
    }
  }

}

// NOTE: Usage statistics are tracked via the UNIFIED usageMeteringService
// which records all AI token usage to aiUsageEvents table.
// Query usage via: GET /api/billing/usage or GET /api/ai-brain/usage-summary
// Do NOT duplicate usage tracking here - single source of truth!

export const aiProviderBalanceService = new AIProviderBalanceService();
