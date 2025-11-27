/**
 * AI Brain Configuration
 * Control ALL AI behavior from one place
 * Edit settings per feature, model, temperature, prompts
 */

export const AI_CONFIG = {
  // Global AI Settings
  global: {
    provider: "gemini" as const, // "gemini" | "openai" | "anthropic"
    defaultModel: "gemini-2.0-flash-exp",
    defaultTemperature: 0.7,
    maxTokens: 2048,
    timeout: 30000, // ms
    retryAttempts: 3,
    retryDelay: 1000, // ms
  },

  // Auto-Scheduling AI
  scheduling: {
    enabled: true,
    model: "gemini-2.0-flash-exp",
    temperature: 0.5, // Lower = more deterministic, consistent
    maxTokens: 2048,
    prompt: `You are an expert workforce scheduling AI. Analyze employee availability, shift requirements, and constraints to create optimal schedules. Consider:
- Employee preferences and availability
- Skill requirements for each shift
- Labor laws and rest period requirements
- Fair distribution of shifts
- Cost minimization

Provide schedules in JSON format.`,
    systemPrompt: "You are an intelligent scheduling assistant optimized for workforce management.",
    examples: [
      {
        input: "Schedule 5 employees for next week with 3 shifts per day",
        output: "JSON formatted schedule with optimal assignments",
      },
    ],
  },

  // Sentiment Analysis AI
  sentiment: {
    enabled: true,
    model: "gemini-2.0-flash-exp",
    temperature: 0.3, // Low temperature for consistency
    maxTokens: 100,
    prompt: `Analyze the sentiment of the following text on a scale of -1 (very negative) to 1 (very positive).
Respond with ONLY a JSON object: { "sentiment": <number>, "label": "<positive|neutral|negative>", "confidence": <0-1>, "reasoning": "<brief explanation>" }`,
    threshold: {
      positive: 0.3,
      negative: -0.3,
    },
  },

  // Predictive Analytics AI
  analytics: {
    enabled: false,
    model: "gemini-2.0-flash-exp",
    temperature: 0.6,
    maxTokens: 1024,
    prompt: `Analyze the provided workforce data and predict trends for:
- Employee turnover risk
- Payroll costs
- Scheduling efficiency
- Performance metrics

Provide insights and recommendations.`,
  },

  // Smart Matching AI (Employees to Shifts)
  matching: {
    enabled: true,
    model: "gemini-2.0-flash-exp",
    temperature: 0.4,
    maxTokens: 512,
    prompt: `Match employees to available shifts based on:
- Skill requirements
- Experience level
- Availability
- Preferences
- Distance/location

Return matches ranked by quality score (0-1).`,
    minScoreThreshold: 0.6,
  },

  // AI Copilot (Chat Assistant)
  copilot: {
    enabled: true,
    model: "gemini-2.0-flash-exp",
    temperature: 0.7,
    maxTokens: 2048,
    systemPrompt: `You are CoAIleague AI Copilot, a helpful assistant for workforce management.
You help with:
- Scheduling advice
- Employee management
- Payroll questions
- Analytics interpretation
- Best practices

Be professional, concise, and actionable.`,
    contextWindow: 10, // Number of previous messages to include
  },

  // Payroll Processing AI
  payroll: {
    enabled: false,
    model: "gemini-2.0-flash-exp",
    temperature: 0.2, // Very low for accuracy
    maxTokens: 1024,
    prompt: `Process payroll data with calculations for:
- Gross pay
- Tax withholding
- Deductions
- Overtime pay
- Bonuses

Return structured payroll report.`,
  },

  // Error Handling
  errorHandling: {
    fallbackBehavior: "graceful" as const, // "graceful" | "strict" | "silent"
    logErrors: true,
    sendErrorAlerts: true,
    retryFailed: true,
    maxRetries: 3,
  },

  // Rate Limiting
  rateLimit: {
    enabled: true,
    requestsPerMinute: 60,
    requestsPerHour: 1000,
    requestsPerDay: 10000,
  },

  // Safety & Validation
  safety: {
    validateInput: true,
    validateOutput: true,
    maxInputTokens: 4000,
    blockedKeywords: ["delete", "drop", "truncate"],
    requireApprovalFor: ["payroll", "financial"],
  },

  // Logging & Monitoring
  logging: {
    enabled: true,
    logLevel: "info" as const, // "debug" | "info" | "warn" | "error"
    trackUsage: true,
    trackCosts: true,
    trackLatency: true,
  },

  // Cost Tracking
  costs: {
    gemini: {
      input: 0.075, // per 1M tokens
      output: 0.3, // per 1M tokens
    },
    openai: {
      input: 0.5,
      output: 1.5,
    },
  },

  // Models Available
  models: {
    gemini: ["gemini-2.0-flash-exp", "gemini-1.5-pro", "gemini-1.5-flash"],
    openai: ["gpt-4", "gpt-3.5-turbo"],
    anthropic: ["claude-3-opus", "claude-3-sonnet"],
  },
};

/**
 * Get AI configuration for a feature
 * Usage: getAIConfig('scheduling')
 */
export function getAIConfig(feature: string): any {
  const config = (AI_CONFIG as any)[feature];
  return config ? { ...AI_CONFIG.global, ...config } : AI_CONFIG.global;
}

/**
 * Get prompt for a feature
 */
export function getAIPrompt(feature: string): string {
  const config = (AI_CONFIG as any)[feature];
  return config?.prompt || "";
}

/**
 * Get system prompt for a feature
 */
export function getAISystemPrompt(feature: string): string {
  const config = (AI_CONFIG as any)[feature];
  return config?.systemPrompt || AI_CONFIG.global;
}

/**
 * Check if AI feature is enabled
 */
export function isAIFeatureEnabled(feature: string): boolean {
  const config = (AI_CONFIG as any)[feature];
  return config?.enabled === true;
}

/**
 * Get cost estimate for API calls
 */
export function estimateCost(
  model: string,
  inputTokens: number,
  outputTokens: number
): number {
  let costPerMInput = 0;
  let costPerMOutput = 0;

  if (model.includes("gemini")) {
    costPerMInput = AI_CONFIG.costs.gemini.input;
    costPerMOutput = AI_CONFIG.costs.gemini.output;
  } else if (model.includes("gpt")) {
    costPerMInput = AI_CONFIG.costs.openai.input;
    costPerMOutput = AI_CONFIG.costs.openai.output;
  }

  return (inputTokens * costPerMInput + outputTokens * costPerMOutput) / 1_000_000;
}
