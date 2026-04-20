/**
 * UNIFIED GEMINI CLIENT - Complete 8-Step Function Calling Workflow
 * 
 * This is the ONE Gemini interface used by the entire platform.
 * All AI operations flow through here for consistency and observability.
 * 
 * Features:
 * - Complete Gemini Function Calling with 8-step workflow:
 *   1. User prompt received
 *   2. App sends prompt + tools to Gemini
 *   3. Gemini returns function calls
 *   4. App executes the tools
 *   5. App sends tool results back to Gemini
 *   6. Gemini processes results
 *   7. Gemini returns final response
 *   8. App returns response to user
 * - Tool execution handlers for all platform operations
 * - Retry/validation pipeline for malformed responses
 * - Business insights generation
 * - FAQ learning and updates
 * - Self-selling platform promotion
 */

import crypto from 'crypto';
import { GoogleGenerativeAI, GenerativeModel, FunctionDeclarationsTool, FunctionDeclaration, SchemaType, Content, Part } from "@google/generative-ai";
import { aiGuardRails, type AIRequestContext } from '../../aiGuardRails';
import { tokenManager, TOKEN_COSTS, TOKEN_FREE_FEATURES } from '../../billing/tokenManager';
import { db } from '../../../db';
import {
  employeeCertifications,
  helposFaqs,
  supportTickets,
  workspaces,
  employees,
  shifts,
  invoices,
  payrollRuns,
  timeEntries,
  clients,
  securityIncidents,
  complianceScores,
  guardTours,
  equipmentItems,
  equipmentAssignments,
  systemAuditLogs
} from '@shared/schema';
import { eq, ilike, or, desc, sql, and, gte, lte, count, isNotNull, sum } from 'drizzle-orm';
import { 
  PERSONA_SYSTEM_INSTRUCTION, 
  HUMANIZED_GENERATION_CONFIG,
  buildPersonaPrompt,
  formatTrinityResponse,
  checkHumanParity
} from '../trinityPersona';
import { trinityCrossDomainIntelligence } from '../trinityCrossDomainIntelligence';
import { createLogger } from '../../../lib/logger';
import { PLATFORM } from '../../../config/platformConfig';

const log = createLogger('AIBrain');

const apiKey = process.env.GEMINI_API_KEY;

if (!apiKey) {
  log.warn("⚠️ GEMINI_API_KEY not found - AI Brain features will be disabled");
}

const genAI = apiKey ? new GoogleGenerativeAI(apiKey) : null;

// ============================================================================
// TIERED MODEL ARCHITECTURE - Right Intelligence for Right Task
// ============================================================================

/**
 * GEMINI MODEL TIERS - Gemini 3 Pro Preview Configuration
 * 
 * Tier 0 (Brain): Gemini 3 Pro Preview - Ultimate intelligence for AI Brain orchestration
 * Tier 1 (Pro): Complex reasoning, diagnostics, orchestration, code analysis
 * Tier 2 (Flash): Conversational agents, Trinity thoughts, supervisors  
 * Tier 3 (Lite): Simple status checks, quick lookups, routine tasks
 * 
 * Model selection rationale:
 * - gemini-3-pro-preview: Ultimate AI Brain intelligence with 1M context, Deep Think
 * - gemini-2.5-pro: Fallback pro model for rate limits
 * - gemini-2.5-flash: Fast flash model for conversational AI and supervisors
 * - gemini-2.0-flash: Lightweight for simple/fast tasks (notifications, lookups)
 * 
 * Gemini 3 Pro Features:
 * - 1M token context window
 * - thinking_level parameter (low/high) for reasoning depth
 * - Multimodal: text, images, video, audio, code, PDFs
 * - Advanced agentic capabilities
 */
export const GEMINI_MODELS = {
  // Tier 0: AI Brain - Ultimate intelligence (Gemini 3 Pro Preview)
  BRAIN: 'gemini-3-pro-preview',        // AI Brain master intelligence
  ORCHESTRATOR: 'gemini-3-pro-preview', // Master orchestration, function calling
  ARCHITECT: 'gemini-3-pro-preview',    // Deep code analysis and diagnostics  
  DIAGNOSTICS: 'gemini-3-pro-preview',  // System health and debugging
  
  // Tier 1: Pro-level reasoning (fallback/specialized tasks)
  PRO_FALLBACK: 'gemini-2.5-pro',       // Fallback for Gemini 3 rate limits
  COMPLIANCE: 'gemini-2.5-pro',         // Compliance and legal analysis
  
  // Tier 2: Balanced speed + intelligence for conversational use
  CONVERSATIONAL: 'gemini-2.5-flash',      // Trinity mascot thoughts (fast + intelligent)
  SUPERVISOR: 'gemini-2.5-flash',          // Subagent supervisors (needs reasoning)
  HELLOS: 'gemini-2.5-flash',              // HelpAI chat responses
  ONBOARDING: 'gemini-2.5-flash',          // Onboarding assistance
  
  // Tier 3: Fast and efficient for simple tasks
  SIMPLE: 'gemini-2.5-flash-lite',      // Quick status checks (ultra-fast)
  NOTIFICATION: 'gemini-2.5-flash-lite', // Notification generation
  LOOKUP: 'gemini-2.5-flash-lite',      // FAQ and data lookups
} as const;

export type GeminiModelTier = keyof typeof GEMINI_MODELS;

/**
 * THINKING LEVEL CONTROLS
 * 
 * Controls how much "deep thinking" the model does:
 * - 'high': Full reasoning chain, best for complex analysis (costs more, slower)
 * - 'medium': Balanced thinking for moderate complexity
 * - 'low': Minimal thinking, prioritizes speed (best for quick responses)
 * - 'none': No extended thinking, fastest response
 */
export type ThinkingLevel = 'high' | 'medium' | 'low' | 'none';

/**
 * ANTI-YAPPING PRESETS
 * 
 * Pre-configured settings to prevent verbose AI responses.
 * Each preset optimizes for specific use cases.
 */
export const ANTI_YAP_PRESETS = {
  // Trinity mascot thoughts: Brief, personality-driven, under 150 tokens
  // Uses humanized topP for vocabulary variety
  mascot: {
    maxTokens: 150,
    temperature: 1.0,
    topP: 0.96,
    thinkingLevel: 'low' as ThinkingLevel,
    systemPromptSuffix: 'Be concise and direct. Maximum 1-2 sentences. Use natural language.',
    humanized: true,
  },
  
  // Supervisor responses: Moderate detail, action-oriented
  supervisor: {
    maxTokens: 300,
    temperature: 1.0,
    topP: 0.95,
    thinkingLevel: 'low' as ThinkingLevel,
    systemPromptSuffix: 'Be actionable and focused. Use bullet points when listing.',
    humanized: true,
  },
  
  // HelpAI chat: Conversational but efficient - HUMANIZED
  helpai: {
    maxTokens: 500,
    temperature: 1.0,
    topP: 0.96,
    thinkingLevel: 'low' as ThinkingLevel,
    systemPromptSuffix: 'Be helpful but concise. Answer directly, then offer to elaborate if needed.',
    humanized: true,
  },
  
  // Orchestrator: Complex reasoning, allow more depth - HUMANIZED
  orchestrator: {
    maxTokens: 1000,
    temperature: 1.0,
    topP: 0.95,
    thinkingLevel: 'high' as ThinkingLevel,
    systemPromptSuffix: 'Analyze thoroughly. Provide structured reasoning when complex.',
    humanized: true,
  },
  
  // Diagnostics: Detailed analysis, full reasoning (precision mode)
  diagnostics: {
    maxTokens: 2000,
    temperature: 0.8,
    topP: 0.85,
    thinkingLevel: 'high' as ThinkingLevel,
    systemPromptSuffix: 'Provide detailed technical analysis with root cause identification.',
    humanized: false,
  },
  
  // Simple responses: Ultra-brief, status-oriented
  simple: {
    maxTokens: 100,
    temperature: 0.5,
    topP: 0.9,
    thinkingLevel: 'none' as ThinkingLevel,
    systemPromptSuffix: 'One sentence maximum. Facts only.',
    humanized: false,
  },
  
  // Notification generation: Brief but informative - HUMANIZED
  notification: {
    maxTokens: 200,
    temperature: 1.0,
    topP: 0.95,
    thinkingLevel: 'none' as ThinkingLevel,
    systemPromptSuffix: 'Create a brief, clear notification message. 2-3 sentences max. Use natural language.',
    humanized: true,
  },
  
  // Search/Lookup: Quick, factual summaries
  lookup: {
    maxTokens: 150,
    temperature: 0.5,
    topP: 0.9,
    thinkingLevel: 'none' as ThinkingLevel,
    systemPromptSuffix: 'Summarize findings briefly. Focus on the most relevant result.',
    humanized: false,
  },
} as const;

export type AntiYapPreset = keyof typeof ANTI_YAP_PRESETS;

/**
 * Get the appropriate model for a given tier
 */
export function getModelForTier(tier: GeminiModelTier): string {
  return GEMINI_MODELS[tier];
}

/**
 * Get anti-yapping configuration for a preset
 */
export function getAntiYapConfig(preset: AntiYapPreset) {
  return ANTI_YAP_PRESETS[preset];
}

/**
 * Build generation config with anti-yapping controls + humanization
 * Converts preset configuration into Gemini API-compatible format
 * 
 * Humanization parameters:
 * - topP: 0.95-0.98 for vocabulary variety (wider word choice)
 * - temperature: 1.0 for natural flow while maintaining accuracy
 */
export function buildGenerationConfig(preset: AntiYapPreset) {
  const config = ANTI_YAP_PRESETS[preset];
  
  // Map thinking level to Gemini's think parameter budget
  // Higher thinking = more internal reasoning tokens allowed
  const thinkingBudgets: Record<ThinkingLevel, number | undefined> = {
    high: 8192,    // Full reasoning chain
    medium: 2048,  // Moderate thinking
    low: 512,      // Minimal thinking
    none: undefined // No extended thinking
  };
  
  return {
    maxOutputTokens: config.maxTokens,
    temperature: config.temperature,
    topP: config.topP || HUMANIZED_GENERATION_CONFIG.topP,
    topK: HUMANIZED_GENERATION_CONFIG.topK,
    // Thinking budget helps control verbosity by limiting internal reasoning
    thinkingBudget: thinkingBudgets[config.thinkingLevel],
    systemPromptSuffix: config.systemPromptSuffix,
    humanized: config.humanized,
  };
}

/**
 * Create a configured model instance with anti-yapping + humanization settings
 */
export function createConfiguredModel(
  tier: GeminiModelTier, 
  preset: AntiYapPreset,
  additionalConfig?: Partial<{ responseMimeType: string; tools: FunctionDeclarationsTool[] }>
) {
  if (!genAI) return null;
  
  const config = buildGenerationConfig(preset);
  
  return genAI.getGenerativeModel({
    model: GEMINI_MODELS[tier],
    generationConfig: {
      maxOutputTokens: config.maxOutputTokens,
      temperature: config.temperature,
      topP: config.topP,
      topK: config.topK,
      ...(additionalConfig?.responseMimeType && { responseMimeType: additionalConfig.responseMimeType }),
    },
    // Inject humanized system instruction for user-facing presets
    ...(config.humanized && { systemInstruction: PERSONA_SYSTEM_INSTRUCTION }),
    ...(additionalConfig?.tools && { tools: additionalConfig.tools }),
  });
}

export interface GeminiRequest {
  workspaceId?: string;
  userId?: string;
  featureKey: string;
  systemPrompt: string;
  userMessage: string;
  conversationHistory?: Array<{ role: 'user' | 'model'; content: string }>;
  temperature?: number;
  maxTokens?: number;
  tools?: FunctionDeclarationsTool[];
  enableToolCalling?: boolean;
  modelTier?: GeminiModelTier;
  antiYapPreset?: AntiYapPreset;
}

/**
 * Lightweight request for quick AI-generated content (mascot thoughts, summaries)
 */
export interface QuickThoughtRequest {
  context: string;
  persona?: string;
  displayName?: string;
  workspaceId?: string;
  mode?: 'demo' | 'business' | 'guru';
}

export interface GeminiResponse {
  text: string;
  tokensUsed: number;
  confidenceScore?: number;
  metadata?: any;
  functionCalls?: Array<{ name: string; args: any }>;
  structuredOutput?: any;
}

// Define available AI Brain tools for Gemini
const AI_BRAIN_TOOLS: FunctionDeclaration[] = [
  {
    name: "search_faqs",
    description: "Search the FAQ database for relevant answers to user questions",
    parameters: {
      type: SchemaType.OBJECT,
      properties: {
        query: { type: SchemaType.STRING, description: "The search query" },
        category: { type: SchemaType.STRING, description: "Optional category filter" },
        limit: { type: SchemaType.NUMBER, description: "Max results to return" }
      },
      required: ["query"]
    }
  },
  {
    name: "create_support_ticket",
    description: "Create a new support ticket for the user",
    parameters: {
      type: SchemaType.OBJECT,
      properties: {
        subject: { type: SchemaType.STRING, description: "Ticket subject" },
        description: { type: SchemaType.STRING, description: "Detailed description" },
        priority: { type: SchemaType.STRING, description: "low, normal, high, or urgent" },
        category: { type: SchemaType.STRING, description: "Ticket category" }
      },
      required: ["subject", "description"]
    }
  },
  {
    name: "get_business_insights",
    description: "Generate business insights and recommendations for the organization",
    parameters: {
      type: SchemaType.OBJECT,
      properties: {
        insightType: { 
          type: SchemaType.STRING, 
          description: "Type of insight: sales, finance, operations, automation, growth" 
        },
        timeframe: { type: SchemaType.STRING, description: "weekly, monthly, quarterly" },
        focusArea: { type: SchemaType.STRING, description: "Specific area to analyze" }
      },
      required: ["insightType"]
    }
  },
  {
    name: "suggest_automation",
    description: "Suggest automation opportunities to save time and money",
    parameters: {
      type: SchemaType.OBJECT,
      properties: {
        currentProcess: { type: SchemaType.STRING, description: "Description of current manual process" },
        painPoints: { type: SchemaType.STRING, description: "What's causing friction" }
      },
      required: ["currentProcess"]
    }
  },
  {
    name: "recommend_platform_feature",
    description: "Recommend platform features that could help the user",
    parameters: {
      type: SchemaType.OBJECT,
      properties: {
        userNeed: { type: SchemaType.STRING, description: "What the user is trying to accomplish" },
        currentPlan: { type: SchemaType.STRING, description: "User's current subscription tier" }
      },
      required: ["userNeed"]
    }
  },
  {
    name: "update_faq",
    description: "Update or create a new FAQ entry based on successful resolution",
    parameters: {
      type: SchemaType.OBJECT,
      properties: {
        question: { type: SchemaType.STRING, description: "The question that was asked" },
        answer: { type: SchemaType.STRING, description: "The answer that helped" },
        category: { type: SchemaType.STRING, description: "FAQ category" },
        tags: { type: SchemaType.STRING, description: "Comma-separated tags" }
      },
      required: ["question", "answer"]
    }
  },
  {
    name: "lookup_employee_schedule",
    description: "Look up upcoming shifts and schedule for a specific employee or the entire workspace. Use when users ask about their schedule, upcoming shifts, who is working, or coverage gaps.",
    parameters: {
      type: SchemaType.OBJECT,
      properties: {
        employeeId: { type: SchemaType.STRING, description: "Specific employee ID (optional - omit for all employees)" },
        daysAhead: { type: SchemaType.NUMBER, description: "How many days ahead to look (default 7)" },
        includeOpenShifts: { type: SchemaType.BOOLEAN, description: "Include unassigned/open shifts" }
      },
      required: []
    }
  },
  {
    name: "lookup_timesheet_summary",
    description: "Get timesheet and hours worked summary for employees. Use when users ask about hours, overtime, clock-in/out records, or attendance.",
    parameters: {
      type: SchemaType.OBJECT,
      properties: {
        employeeId: { type: SchemaType.STRING, description: "Specific employee ID (optional)" },
        periodDays: { type: SchemaType.NUMBER, description: "How many days back to summarize (default 7)" }
      },
      required: []
    }
  },
  {
    name: "lookup_payroll_status",
    description: "Check payroll run status, pending approvals, and payment information. Use when users ask about payroll, pay, or payment processing.",
    parameters: {
      type: SchemaType.OBJECT,
      properties: {
        payrollRunId: { type: SchemaType.STRING, description: "Specific payroll run ID (optional)" },
        status: { type: SchemaType.STRING, description: "Filter by status: draft, pending, approved, processing, completed" }
      },
      required: []
    }
  },
  {
    name: "lookup_invoice_status",
    description: "Check invoice status, amounts, and payment tracking. Understands agency/subcontract invoicing with external reference numbers. Use when users ask about invoicing, billing, client payments, or agency invoice references.",
    parameters: {
      type: SchemaType.OBJECT,
      properties: {
        invoiceId: { type: SchemaType.STRING, description: "Specific invoice ID (optional)" },
        status: { type: SchemaType.STRING, description: "Filter by status: draft, sent, paid, overdue, cancelled" },
        clientId: { type: SchemaType.STRING, description: "Filter by client ID" },
        clientName: { type: SchemaType.STRING, description: "Search by client or agency name" },
        externalNumber: { type: SchemaType.STRING, description: "Search by agency/external invoice number" }
      },
      required: []
    }
  },
  {
    name: "lookup_employee_info",
    description: "Look up employee details, certifications, and status. Use when users ask about team members, roles, or employee records.",
    parameters: {
      type: SchemaType.OBJECT,
      properties: {
        employeeId: { type: SchemaType.STRING, description: "Specific employee ID (optional)" },
        searchName: { type: SchemaType.STRING, description: "Search by employee name" },
        includeStats: { type: SchemaType.BOOLEAN, description: "Include performance and attendance stats" }
      },
      required: []
    }
  },
  {
    name: "detect_scheduling_conflicts",
    description: "Analyze the schedule for conflicts: double-bookings, overtime violations, uncovered shifts, certification gaps. Use when users ask about scheduling problems or coverage issues.",
    parameters: {
      type: SchemaType.OBJECT,
      properties: {
        daysAhead: { type: SchemaType.NUMBER, description: "How many days ahead to analyze (default 7)" },
        includeRecommendations: { type: SchemaType.BOOLEAN, description: "Include AI fix recommendations" }
      },
      required: []
    }
  },
  {
    name: "analyze_sentiment",
    description: "Analyze the emotional tone and urgency of a message to determine if escalation is needed. Use internally when processing support conversations.",
    parameters: {
      type: SchemaType.OBJECT,
      properties: {
        message: { type: SchemaType.STRING, description: "The message to analyze" },
        context: { type: SchemaType.STRING, description: "Additional context about the conversation" }
      },
      required: ["message"]
    }
  },
  {
    name: "lookup_incidents",
    description: "Look up security incidents, reports, and RMS records. Use when users ask about incidents, reports, security events, or what happened at a site.",
    parameters: {
      type: SchemaType.OBJECT,
      properties: {
        siteId: { type: SchemaType.STRING, description: "Filter by site/location ID" },
        status: { type: SchemaType.STRING, description: "Filter by status: open, in_progress, resolved, closed" },
        daysBack: { type: SchemaType.NUMBER, description: "How many days back to search (default 30)" },
        severity: { type: SchemaType.STRING, description: "Filter by severity: low, medium, high, critical" }
      },
      required: []
    }
  },
  {
    name: "lookup_certifications",
    description: "Look up employee certifications, licenses, training status, and expiration dates. Use when users ask about guard licenses, certifications, compliance training, or qualification status.",
    parameters: {
      type: SchemaType.OBJECT,
      properties: {
        employeeId: { type: SchemaType.STRING, description: "Specific employee ID" },
        certificationType: { type: SchemaType.STRING, description: "Type of certification to look up" },
        includeExpired: { type: SchemaType.BOOLEAN, description: "Include expired certifications" },
        expiringWithinDays: { type: SchemaType.NUMBER, description: "Find certs expiring within N days" }
      },
      required: []
    }
  },
  {
    name: "lookup_clients",
    description: "Look up client/customer information, contracts, and site details. Use when users ask about clients, customer accounts, sites, or client-specific data.",
    parameters: {
      type: SchemaType.OBJECT,
      properties: {
        clientName: { type: SchemaType.STRING, description: "Search by client name" },
        clientId: { type: SchemaType.STRING, description: "Specific client ID" },
        includeContracts: { type: SchemaType.BOOLEAN, description: "Include contract details" }
      },
      required: []
    }
  },
  {
    name: "lookup_compliance_score",
    description: "Check organization compliance scores, audit status, and regulatory standing. Use when users ask about compliance, audit findings, or regulatory status.",
    parameters: {
      type: SchemaType.OBJECT,
      properties: {
        state: { type: SchemaType.STRING, description: "Filter by state for state-specific compliance" },
        includeHistory: { type: SchemaType.BOOLEAN, description: "Include historical compliance scores" }
      },
      required: []
    }
  },
  {
    name: "lookup_guard_tours",
    description: "Look up guard tour records, checkpoint scans, and patrol status. Use when users ask about tours, patrols, checkpoint completions, or guard rounds.",
    parameters: {
      type: SchemaType.OBJECT,
      properties: {
        guardId: { type: SchemaType.STRING, description: "Specific guard/employee ID" },
        siteId: { type: SchemaType.STRING, description: "Filter by site" },
        status: { type: SchemaType.STRING, description: "Filter: active, completed, missed, incomplete" },
        daysBack: { type: SchemaType.NUMBER, description: "How many days back (default 7)" }
      },
      required: []
    }
  },
  {
    name: "lookup_equipment",
    description: "Look up equipment inventory, checkout status, and maintenance schedules. Use when users ask about equipment, radios, vehicles, gear, or supplies.",
    parameters: {
      type: SchemaType.OBJECT,
      properties: {
        category: { type: SchemaType.STRING, description: "Equipment category: radio, vehicle, weapon, uniform, tech" },
        status: { type: SchemaType.STRING, description: "Filter: available, checked_out, maintenance, retired" },
        assignedTo: { type: SchemaType.STRING, description: "Employee ID who has the equipment" }
      },
      required: []
    }
  },
  {
    name: "list_available_actions",
    description: "List all platform actions currently registered in the Action Hub that you can execute. Call this before execute_platform_action when you are unsure of the exact actionId. Returns actionId, description, category, and required parameters for every registered action.",
    parameters: {
      type: SchemaType.OBJECT,
      properties: {
        category: { type: SchemaType.STRING, description: "Optional: filter by category (e.g. 'scheduling', 'payroll', 'compliance', 'quickbooks'). Omit to get all actions." }
      },
      required: []
    }
  },
  {
    name: "execute_platform_action",
    description: "Execute a registered platform action through the Action Hub. Use for operations like creating shifts, running payroll, syncing QuickBooks, dispatching units, or any action registered in the Platform Action Hub. Call list_available_actions first if you are unsure of the exact actionId.",
    parameters: {
      type: SchemaType.OBJECT,
      properties: {
        actionId: { type: SchemaType.STRING, description: "The action ID (e.g., 'scheduling.generate_ai_schedule', 'quickbooks.push_invoice', 'rms.create_incident')" },
        payload: { type: SchemaType.STRING, description: "JSON string of action parameters" }
      },
      required: ["actionId"]
    }
  },
  {
    name: "get_financial_analysis",
    description: "Get detailed financial analysis including P&L summary, labor cost ratios, revenue trends, and forecasting. Use when users ask about profitability, costs, margins, financial health, or business performance.",
    parameters: {
      type: SchemaType.OBJECT,
      properties: {
        analysisType: {
          type: SchemaType.STRING,
          description: "Type: pnl_summary, labor_cost_ratio, revenue_trend, cashflow_forecast, overtime_analysis"
        },
        timeframe: { type: SchemaType.STRING, description: "weekly, monthly, quarterly, yearly" },
        compareToLast: { type: SchemaType.BOOLEAN, description: "Compare to previous period" }
      },
      required: ["analysisType"]
    }
  },
  {
    name: "analyze_cross_domain",
    description: "Chain queries across financial, scheduling, and compliance domains to produce correlated insights. Use when users ask about cross-functional analysis, overall business health, or how different areas affect each other (e.g. how overtime affects profitability, or how compliance gaps impact scheduling).",
    parameters: {
      type: SchemaType.OBJECT,
      properties: {
        domains: { type: SchemaType.STRING, description: "Comma-separated domains to analyze: profitability, overtime, compliance, labor_forecast, trends. Omit for full analysis." },
        focusArea: { type: SchemaType.STRING, description: "Optional focus area to emphasize in the analysis" }
      },
      required: []
    }
  },
  {
    name: "detect_anomalies_on_demand",
    description: "Run anomaly detection for the workspace on demand. Scans for overtime spikes, attendance issues, profitability declines, compliance gaps, and scheduling coverage holes. Use when users ask to check for problems, anomalies, or issues across the organization.",
    parameters: {
      type: SchemaType.OBJECT,
      properties: {
        anomalyTypes: { type: SchemaType.STRING, description: "Comma-separated types: overtime, compliance, profitability, all. Defaults to all." },
        severityThreshold: { type: SchemaType.STRING, description: "Minimum severity to report: info, warning, critical. Defaults to info." }
      },
      required: []
    }
  },
  {
    name: "explain_reasoning",
    description: "Provide transparent step-by-step reasoning for any Trinity analysis or decision. Use when users ask 'why' or 'how did you determine that' or want to understand the logic behind a recommendation.",
    parameters: {
      type: SchemaType.OBJECT,
      properties: {
        analysisType: { type: SchemaType.STRING, description: "Which analysis to explain: profitability, overtime, compliance, labor_forecast, trends, full" },
        detailLevel: { type: SchemaType.STRING, description: "Level of detail: summary, detailed, technical. Defaults to detailed." }
      },
      required: ["analysisType"]
    }
  },
  {
    name: "forecast_trends",
    description: "Project labor costs, revenue, and compliance status forward in time. Use when users ask about future projections, forecasting, what to expect next month, or planning ahead.",
    parameters: {
      type: SchemaType.OBJECT,
      properties: {
        forecastType: { type: SchemaType.STRING, description: "What to forecast: labor_costs, revenue, compliance, all" },
        weeksAhead: { type: SchemaType.NUMBER, description: "How many weeks to project forward (default 4, max 12)" }
      },
      required: ["forecastType"]
    }
  },
  {
    name: "get_temporal_trends",
    description: "Get week-over-week and month-over-month comparisons for key metrics including hours worked, revenue, and employee activity. Use when users ask about trends, changes over time, or period comparisons.",
    parameters: {
      type: SchemaType.OBJECT,
      properties: {
        includeDetails: { type: SchemaType.BOOLEAN, description: "Include detailed breakdown of each metric" }
      },
      required: []
    }
  }
];

// ============================================================================
// TOOL EXECUTION HANDLERS - Step 4 of 8-Step Workflow
// These handlers execute the actual platform operations when Gemini calls tools
// ============================================================================

interface ToolResult {
  success: boolean;
  data: any;
  error?: string;
}

interface ToolExecutionContext {
  workspaceId?: string;
  userId?: string;
}

const TOOL_REQUIRED_FIELDS: Record<string, string[]> = {
  search_faqs: ['query'],
  create_support_ticket: ['subject', 'description'],
  get_business_insights: ['insightType'],
  suggest_automation: ['currentProcess'],
  recommend_platform_feature: ['userNeed'],
  update_faq: ['question', 'answer'],
  analyze_sentiment: ['message'],
  list_available_actions: [],
  execute_platform_action: ['actionId'],
  get_financial_analysis: ['analysisType'],
  explain_reasoning: ['analysisType'],
  forecast_trends: ['forecastType'],
};

function sanitizeToolArgs(args: Record<string, any>): Record<string, any> {
  const sanitized: Record<string, any> = {};
  for (const [key, value] of Object.entries(args)) {
    if (typeof value === 'string' && value.length > 500) {
      sanitized[key] = value.substring(0, 500) + '...[truncated]';
    } else {
      sanitized[key] = value;
    }
  }
  return sanitized;
}

function validateToolArgs(toolName: string, args: Record<string, any>): string | null {
  const required = TOOL_REQUIRED_FIELDS[toolName];
  if (!required || required.length === 0) return null;
  const missing = required.filter(field => args[field] === undefined || args[field] === null || args[field] === '');
  if (missing.length > 0) {
    return `Missing required fields for ${toolName}: ${missing.join(', ')}`;
  }
  return null;
}

async function logToolCallFailure(
  toolName: string,
  args: Record<string, any>,
  errorMessage: string,
  context: ToolExecutionContext
): Promise<void> {
  try {
    await db.insert(systemAuditLogs).values({
      userId: context.userId || null,
      action: 'ai_tool_call_failed',
      entityType: 'ai_tool',
      entityId: toolName,
      workspaceId: context.workspaceId || null,
      changes: null,
      metadata: {
        toolName,
        args: sanitizeToolArgs(args),
        error: errorMessage,
        timestamp: new Date().toISOString(),
      },
    });
  } catch (logErr) {
    log.error(`⚠️ [AI Brain] Failed to log tool failure to audit log:`, logErr);
  }
}

async function executeToolCall(
  toolName: string,
  args: Record<string, any>,
  context: ToolExecutionContext
): Promise<ToolResult> {
  log.info(`🔧 [AI Brain] Executing tool: ${toolName}`, args);
  
  const validationError = validateToolArgs(toolName, args);
  if (validationError) {
    log.error(`❌ [AI Brain] Tool validation failed for ${toolName}: ${validationError}`);
    await logToolCallFailure(toolName, args, validationError, context);
    return {
      success: false,
      data: null,
      error: validationError,
    };
  }

  const TOOL_TIMEOUT_MS = 30_000;
  
  const toolExecution = async (): Promise<ToolResult> => {
    switch (toolName) {
      case 'search_faqs':
        return await executeSearchFaqs(args as { query: string; category?: string; limit?: number }, context);
      
      case 'create_support_ticket':
        return await executeCreateSupportTicket(args as { subject: string; description: string; priority?: string; category?: string }, context);
      
      case 'get_business_insights':
        return await executeGetBusinessInsights(args as { insightType: string; timeframe?: string; focusArea?: string }, context);
      
      case 'suggest_automation':
        return await executeSuggestAutomation(args as { currentProcess: string; painPoints?: string }, context);
      
      case 'recommend_platform_feature':
        return await executeRecommendPlatformFeature(args as { userNeed: string; currentPlan?: string }, context);
      
      case 'update_faq':
        return await executeUpdateFaq(args as { question: string; answer: string; category?: string; tags?: string }, context);
      
      case 'lookup_employee_schedule':
        return await executeLookupSchedule(args, context);
      
      case 'lookup_timesheet_summary':
        return await executeLookupTimesheets(args, context);
      
      case 'lookup_payroll_status':
        return await executeLookupPayroll(args, context);
      
      case 'lookup_invoice_status':
        return await executeLookupInvoices(args, context);
      
      case 'lookup_employee_info':
        return await executeLookupEmployees(args, context);
      
      case 'detect_scheduling_conflicts':
        return await executeDetectSchedulingConflicts(args, context);
      
      case 'analyze_sentiment':
        // @ts-expect-error — TS migration: fix in refactoring sprint
        return await executeAnalyzeSentiment(args, context);
      
      case 'lookup_incidents':
        return await executeLookupIncidents(args, context);
      
      case 'lookup_certifications':
        return await executeLookupCertifications(args, context);
      
      case 'lookup_clients':
        return await executeLookupClients(args, context);
      
      case 'lookup_compliance_score':
        return await executeLookupComplianceScore(args, context);
      
      case 'lookup_guard_tours':
        return await executeLookupGuardTours(args, context);
      
      case 'lookup_equipment':
        return await executeLookupEquipment(args, context);
      
      case 'list_available_actions':
        return await executeListAvailableActions(args, context);
      
      case 'execute_platform_action':
        // @ts-expect-error — TS migration: fix in refactoring sprint
        return await executePlatformAction(args, context);
      
      case 'get_financial_analysis':
        // @ts-expect-error — TS migration: fix in refactoring sprint
        return await executeFinancialAnalysis(args, context);
      
      case 'analyze_cross_domain':
        return await executeAnalyzeCrossDomain(args, context);
      
      case 'detect_anomalies_on_demand':
        return await executeDetectAnomaliesOnDemand(args, context);
      
      case 'explain_reasoning':
        // @ts-expect-error — TS migration: fix in refactoring sprint
        return await executeExplainReasoning(args, context);
      
      case 'forecast_trends':
        // @ts-expect-error — TS migration: fix in refactoring sprint
        return await executeForecastTrends(args, context);
      
      case 'get_temporal_trends':
        return await executeGetTemporalTrends(args, context);
      
      default:
        return {
          success: false,
          data: null,
          error: `Unknown tool: ${toolName}`
        };
    }
  };

  try {
    const timeoutPromise = new Promise<ToolResult>((_, reject) => {
      setTimeout(() => reject(new Error(`Tool '${toolName}' timed out after ${TOOL_TIMEOUT_MS / 1000}s`)), TOOL_TIMEOUT_MS);
    });
    return await Promise.race([toolExecution(), timeoutPromise]);
  } catch (error: any) {
    const errorMessage = (error instanceof Error ? error.message : String(error)) || 'Tool execution failed';
    log.error(`❌ [AI Brain] Tool execution failed for ${toolName}:`, error);
    await logToolCallFailure(toolName, args, errorMessage, context);
    return {
      success: false,
      data: null,
      error: errorMessage,
    };
  }
}

/**
 * Search FAQs in the database
 */
async function executeSearchFaqs(
  args: { query: string; category?: string; limit?: number },
  context: ToolExecutionContext
): Promise<ToolResult> {
  try {
    const searchQuery = args.query.toLowerCase();
    const limit = args.limit || 5;
    
    const results = await db.select({
      id: helposFaqs.id,
      question: helposFaqs.question,
      answer: helposFaqs.answer,
      category: helposFaqs.category,
      viewCount: helposFaqs.viewCount,
    })
    .from(helposFaqs)
    .where(
      and(
        eq(helposFaqs.isPublished, true),
        or(
          ilike(helposFaqs.question, `%${searchQuery}%`),
          ilike(helposFaqs.answer, `%${searchQuery}%`),
          ilike(helposFaqs.searchKeywords, `%${searchQuery}%`),
          sql`EXISTS (SELECT 1 FROM unnest(${helposFaqs.tags}) AS tag WHERE tag ILIKE ${'%' + searchQuery + '%'})`
        )
      )
    )
    .orderBy(desc(helposFaqs.viewCount))
    .limit(limit);
    
    log.info(`✅ [AI Brain] Found ${results.length} FAQs for query: "${args.query}"`);
    
    return {
      success: true,
      data: {
        faqs: results,
        totalFound: results.length,
        query: args.query
      }
    };
  } catch (error: any) {
    return {
      success: false,
      data: null,
      error: `FAQ search failed: ${(error instanceof Error ? error.message : String(error))}`
    };
  }
}

/**
 * Create a support ticket in the database
 */
async function executeCreateSupportTicket(
  args: { subject: string; description: string; priority?: string; category?: string },
  context: ToolExecutionContext
): Promise<ToolResult> {
  try {
    if (!context.workspaceId) {
      return {
        success: false,
        data: null,
        error: 'Workspace ID required to create support ticket'
      };
    }
    
    const ticketNumber = `TKT-${Date.now().toString(36).toUpperCase()}-${crypto.randomBytes(3).toString('hex').toUpperCase()}`;
    
    const [ticket] = await db.insert(supportTickets).values({
      workspaceId: context.workspaceId,
      ticketNumber,
      type: 'support',
      subject: args.subject,
      description: args.description,
      priority: (args.priority as 'low' | 'normal' | 'high' | 'urgent') || 'normal',
      status: 'open',
      employeeId: context.userId,
    }).returning();
    
    log.info(`✅ [AI Brain] Created support ticket: ${ticketNumber}`);
    
    return {
      success: true,
      data: {
        ticketId: ticket.id,
        ticketNumber: ticket.ticketNumber,
        status: ticket.status,
        message: `Support ticket ${ticketNumber} has been created and assigned to our support team.`
      }
    };
  } catch (error: any) {
    return {
      success: false,
      data: null,
      error: `Failed to create support ticket: ${(error instanceof Error ? error.message : String(error))}`
    };
  }
}

/**
 * Generate business insights from platform data
 */
async function executeGetBusinessInsights(
  args: { insightType: string; timeframe?: string; focusArea?: string },
  context: ToolExecutionContext
): Promise<ToolResult> {
  try {
    const timeframe = args.timeframe || 'monthly';
    const now = new Date();
    let startDate: Date;
    
    switch (timeframe) {
      case 'weekly':
        startDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
        break;
      case 'quarterly':
        startDate = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);
        break;
      default: // monthly
        startDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    }
    
    let insights: any = {};
    
    switch (args.insightType) {
      case 'sales':
      case 'finance':
        if (context.workspaceId) {
          const [invoiceStats] = await db.select({
            totalInvoices: count(),
            totalRevenue: sql<number>`COALESCE(SUM(CAST(total AS DECIMAL)), 0)`,
          }).from(invoices).where(
            and(
              eq(invoices.workspaceId, context.workspaceId),
              gte(invoices.createdAt, startDate)
            )
          );
          
          insights = {
            type: args.insightType,
            timeframe,
            metrics: {
              totalInvoices: invoiceStats?.totalInvoices || 0,
              totalRevenue: invoiceStats?.totalRevenue || 0,
            },
            recommendations: [
              'Review outstanding invoices for follow-up',
              'Analyze top-performing client relationships',
              'Consider automating recurring invoice generation'
            ]
          };
        }
        break;
        
      case 'operations':
        if (context.workspaceId) {
          const [shiftStats] = await db.select({
            totalShifts: count(),
          }).from(shifts).where(
            and(
              eq(shifts.workspaceId, context.workspaceId),
              gte(shifts.startTime, startDate)
            )
          );
          
          const [employeeStats] = await db.select({
            totalEmployees: count(),
          }).from(employees).where(
            eq(employees.workspaceId, context.workspaceId)
          );
          
          insights = {
            type: args.insightType,
            timeframe,
            metrics: {
              totalShifts: shiftStats?.totalShifts || 0,
              totalEmployees: employeeStats?.totalEmployees || 0,
            },
            recommendations: [
              'Use AI-powered scheduling to optimize shift coverage',
              'Review employee availability patterns',
              'Consider automated shift swap approvals'
            ]
          };
        }
        break;
        
      case 'automation':
        insights = {
          type: 'automation',
          timeframe,
          opportunities: [
            { area: 'Scheduling', potential: 'High', description: 'AI can auto-generate weekly schedules' },
            { area: 'Invoicing', potential: 'High', description: 'Automate recurring client invoices' },
            { area: 'Payroll', potential: 'Medium', description: 'Streamline payroll with automated calculations' },
            { area: 'Compliance', potential: 'Medium', description: 'Auto-check certification expirations' },
          ],
          recommendations: [
            'Enable autonomous scheduling in AI Brain settings',
            'Set up automated invoice generation rules',
            'Configure compliance alert automation'
          ]
        };
        break;
        
      case 'growth':
        insights = {
          type: 'growth',
          timeframe,
          recommendations: [
            'Expand service offerings using existing workforce capacity',
            'Leverage analytics to identify growth opportunities',
            'Use client feedback to improve retention'
          ]
        };
        break;
        
      default:
        insights = {
          type: args.insightType,
          message: 'No specific insights available for this type'
        };
    }
    
    log.info(`✅ [AI Brain] Generated ${args.insightType} insights`);
    
    return {
      success: true,
      data: insights
    };
  } catch (error: any) {
    return {
      success: false,
      data: null,
      error: `Failed to generate insights: ${(error instanceof Error ? error.message : String(error))}`
    };
  }
}

/**
 * Suggest automation opportunities
 */
async function executeSuggestAutomation(
  args: { currentProcess: string; painPoints?: string },
  context: ToolExecutionContext
): Promise<ToolResult> {
  const processLower = args.currentProcess.toLowerCase();
  
  const automationSuggestions = [];
  
  if (processLower.includes('schedule') || processLower.includes('shift')) {
    automationSuggestions.push({
      area: 'AI Scheduling',
      description: 'Let AI Brain generate optimal schedules based on employee availability, skills, and preferences',
      estimatedTimeSaved: '4-6 hours per week',
      implementation: 'Enable in AI Brain → Scheduling → Autonomous Mode'
    });
  }
  
  if (processLower.includes('invoice') || processLower.includes('billing')) {
    automationSuggestions.push({
      area: 'Automated Invoicing',
      description: 'Automatically generate and send invoices based on tracked time and service agreements',
      estimatedTimeSaved: '2-3 hours per week',
      implementation: 'Enable in Billing Platform → Automation Rules'
    });
  }
  
  if (processLower.includes('payroll') || processLower.includes('pay')) {
    automationSuggestions.push({
      area: 'Smart Payroll',
      description: 'Automate payroll calculations, deductions, and processing',
      estimatedTimeSaved: '3-5 hours per pay period',
      implementation: 'Enable in Billing Platform → Payroll → Auto-Run'
    });
  }
  
  if (processLower.includes('reminder') || processLower.includes('notification')) {
    automationSuggestions.push({
      area: 'Smart Notifications',
      description: 'Automated shift reminders, compliance alerts, and status updates',
      estimatedTimeSaved: '1-2 hours per day',
      implementation: 'Enable in AI Communications → Automation'
    });
  }
  
  if (automationSuggestions.length === 0) {
    automationSuggestions.push({
      area: 'General Automation Assessment',
      description: 'Our AI Brain can analyze your workflow and suggest specific automation opportunities',
      estimatedTimeSaved: 'Varies by process',
      implementation: 'Contact support for a custom automation assessment'
    });
  }
  
  return {
    success: true,
    data: {
      currentProcess: args.currentProcess,
      painPoints: args.painPoints,
      suggestions: automationSuggestions,
      totalPotentialSavings: 'Up to 15+ hours per week'
    }
  };
}

/**
 * Recommend platform features based on user needs
 */
async function executeRecommendPlatformFeature(
  args: { userNeed: string; currentPlan?: string },
  context: ToolExecutionContext
): Promise<ToolResult> {
  const needLower = args.userNeed.toLowerCase();
  
  const recommendations = [];
  
  if (needLower.includes('schedule') || needLower.includes('shift') || needLower.includes('calendar')) {
    recommendations.push({
      feature: 'Trinity AI Smart Scheduling',
      description: 'AI-powered scheduling with conflict detection, employee preferences, and one-click optimization',
      tier: 'Professional',
      benefit: 'Save 6+ hours per week on scheduling'
    });
  }
  
  if (needLower.includes('track') || needLower.includes('time') || needLower.includes('hours')) {
    recommendations.push({
      feature: 'Time Tracking & Timesheets',
      description: 'GPS-enabled clock-in/out, break compliance, and automated timesheet approvals',
      tier: 'Starter',
      benefit: 'Accurate payroll and labor law compliance'
    });
  }
  
  if (needLower.includes('invoice') || needLower.includes('billing') || needLower.includes('payment')) {
    recommendations.push({
      feature: 'Billing Platform™',
      description: 'Automated invoicing, Stripe payment processing, and client billing management',
      tier: 'Professional',
      benefit: 'Get paid faster with automated invoicing'
    });
  }
  
  if (needLower.includes('report') || needLower.includes('analytics') || needLower.includes('data')) {
    recommendations.push({
      feature: 'IntelligenceOS™ Analytics',
      description: 'Real-time dashboards, AI insights, and exportable reports',
      tier: 'Professional',
      benefit: 'Make data-driven decisions'
    });
  }
  
  if (needLower.includes('ai') || needLower.includes('automat') || needLower.includes('smart')) {
    recommendations.push({
      feature: 'AI Brain Control Console',
      description: 'Full AI orchestration with autonomous scheduling, payroll, and compliance monitoring',
      tier: 'Enterprise',
      benefit: 'Hands-off workforce management'
    });
  }
  
  if (recommendations.length === 0) {
    recommendations.push({
      feature: PLATFORM.name + " Platform",
      description: 'Comprehensive workforce management with AI-powered features',
      tier: 'Contact Sales',
      benefit: 'Custom solution for your specific needs'
    });
  }
  
  return {
    success: true,
    data: {
      userNeed: args.userNeed,
      currentPlan: args.currentPlan,
      recommendations,
      upgradeInfo: 'Contact our sales team for a personalized demo and pricing'
    }
  };
}

/**
 * Update or create a new FAQ entry
 */
async function executeUpdateFaq(
  args: { question: string; answer: string; category?: string; tags?: string },
  context: ToolExecutionContext
): Promise<ToolResult> {
  try {
    const existingFaq = await db.select()
      .from(helposFaqs)
      .where(ilike(helposFaqs.question, args.question))
      .limit(1);
    
    if (existingFaq.length > 0) {
      await db.update(helposFaqs)
        .set({
          answer: args.answer,
          updatedAt: new Date(),
          viewCount: sql`${helposFaqs.viewCount} + 1`
        })
        .where(eq(helposFaqs.id, existingFaq[0].id));
      
      log.info(`✅ [AI Brain] Updated existing FAQ: ${existingFaq[0].id}`);
      
      return {
        success: true,
        data: {
          action: 'updated',
          faqId: existingFaq[0].id,
          message: 'FAQ has been updated with improved answer'
        }
      };
    } else {
      const tagsArray = args.tags ? args.tags.split(',').map(t => t.trim()) : [];
      const [newFaq] = await db.insert(helposFaqs).values({
        workspaceId: 'system',
        question: args.question,
        answer: args.answer,
        category: args.category || 'general',
        tags: tagsArray,
        isPublished: false,
        viewCount: 0,
        helpfulCount: 0,
        notHelpfulCount: 0,
      }).returning();
      
      log.info(`✅ [AI Brain] Created new FAQ: ${newFaq.id}`);
      
      return {
        success: true,
        data: {
          action: 'created',
          faqId: newFaq.id,
          message: 'New FAQ has been created and pending review'
        }
      };
    }
  } catch (error: any) {
    return {
      success: false,
      data: null,
      error: `Failed to update FAQ: ${(error instanceof Error ? error.message : String(error))}`
    };
  }
}

// ============================================================================
// DOMAIN DATA LOOKUP HANDLERS - Real Intelligence Data Access
// These give Trinity the ability to look up actual platform data
// ============================================================================

async function executeLookupSchedule(
  args: { employeeId?: string; daysAhead?: number; includeOpenShifts?: boolean },
  context: ToolExecutionContext
): Promise<ToolResult> {
  try {
    if (!context.workspaceId) {
      return { success: false, data: null, error: 'Workspace context required' };
    }
    const daysAhead = args.daysAhead || 7;
    const now = new Date();
    const endDate = new Date(now.getTime() + daysAhead * 24 * 60 * 60 * 1000);

    const conditions = [
      eq(shifts.workspaceId, context.workspaceId),
      gte(shifts.startTime, now),
      lte(shifts.startTime, endDate),
    ];

    if (args.employeeId) {
      conditions.push(eq(shifts.employeeId, args.employeeId));
    }
    if (!args.includeOpenShifts) {
      conditions.push(isNotNull(shifts.employeeId));
    }

    const results = await db.select({
      id: shifts.id,
      title: shifts.title,
      employeeId: shifts.employeeId,
      clientId: shifts.clientId,
      startTime: shifts.startTime,
      endTime: shifts.endTime,
      status: shifts.status,
      billRate: shifts.billRate,
      payRate: shifts.payRate,
    })
    .from(shifts)
    .where(and(...conditions))
    .orderBy(shifts.startTime)
    .limit(50);

    const openShifts = results.filter(s => !s.employeeId).length;
    const assignedShifts = results.filter(s => s.employeeId).length;

    return {
      success: true,
      data: {
        shifts: results,
        summary: {
          totalShifts: results.length,
          assignedShifts,
          openShifts,
          periodDays: daysAhead,
          periodStart: now.toISOString(),
          periodEnd: endDate.toISOString(),
        }
      }
    };
  } catch (error: any) {
    return { success: false, data: null, error: `Schedule lookup failed: ${(error instanceof Error ? error.message : String(error))}` };
  }
}

async function executeLookupTimesheets(
  args: { employeeId?: string; periodDays?: number },
  context: ToolExecutionContext
): Promise<ToolResult> {
  try {
    if (!context.workspaceId) {
      return { success: false, data: null, error: 'Workspace context required' };
    }
    const periodDays = args.periodDays || 7;
    const startDate = new Date(Date.now() - periodDays * 24 * 60 * 60 * 1000);

    const conditions: any[] = [
      eq(timeEntries.workspaceId, context.workspaceId),
      gte(timeEntries.clockIn, startDate),
    ];

    if (args.employeeId) {
      conditions.push(eq(timeEntries.employeeId, args.employeeId));
    }

    const results = await db.select({
      employeeId: timeEntries.employeeId,
      totalEntries: count(),
      totalHours: sql<number>`COALESCE(SUM(EXTRACT(EPOCH FROM (${timeEntries.clockOut} - ${timeEntries.clockIn})) / 3600.0), 0)`,
    })
    .from(timeEntries)
    .where(and(...conditions))
    .groupBy(timeEntries.employeeId)
    .limit(100);

    const totalHoursAll = results.reduce((sum, r) => sum + Number(r.totalHours || 0), 0);
    const overtimeEmployees = results.filter(r => Number(r.totalHours || 0) > 40);

    return {
      success: true,
      data: {
        employeeSummaries: results.map(r => ({
          employeeId: r.employeeId,
          totalEntries: r.totalEntries,
          totalHours: Math.round(Number(r.totalHours) * 100) / 100,
          overtime: Number(r.totalHours) > 40,
          overtimeHours: Math.max(0, Math.round((Number(r.totalHours) - 40) * 100) / 100),
        })),
        summary: {
          totalEmployeesTracked: results.length,
          totalHours: Math.round(totalHoursAll * 100) / 100,
          employeesInOvertime: overtimeEmployees.length,
          periodDays,
        }
      }
    };
  } catch (error: any) {
    return { success: false, data: null, error: `Timesheet lookup failed: ${(error instanceof Error ? error.message : String(error))}` };
  }
}

async function executeLookupPayroll(
  args: { payrollRunId?: string; status?: string },
  context: ToolExecutionContext
): Promise<ToolResult> {
  try {
    if (!context.workspaceId) {
      return { success: false, data: null, error: 'Workspace context required' };
    }

    const conditions: any[] = [eq(payrollRuns.workspaceId, context.workspaceId)];

    if (args.payrollRunId) {
      conditions.push(eq(payrollRuns.id, args.payrollRunId));
    }
    if (args.status) {
      conditions.push(eq(payrollRuns.status, args.status as any));
    }

    const results = await db.select({
      id: payrollRuns.id,
      periodStart: payrollRuns.periodStart,
      periodEnd: payrollRuns.periodEnd,
      status: payrollRuns.status,
      totalGrossPay: payrollRuns.totalGrossPay,
      totalTaxes: payrollRuns.totalTaxes,
      createdAt: payrollRuns.createdAt,
    })
    .from(payrollRuns)
    .where(and(...conditions))
    .orderBy(desc(payrollRuns.createdAt))
    .limit(10);

    const pendingRuns = results.filter(r => r.status === 'pending' || r.status === 'draft');
    const totalGross = results.reduce((sum, r) => sum + Number(r.totalGrossPay || 0), 0);

    return {
      success: true,
      data: {
        payrollRuns: results,
        summary: {
          totalRuns: results.length,
          pendingApproval: pendingRuns.length,
          totalGrossPay: Math.round(totalGross * 100) / 100,
        }
      }
    };
  } catch (error: any) {
    return { success: false, data: null, error: `Payroll lookup failed: ${(error instanceof Error ? error.message : String(error))}` };
  }
}

async function executeLookupInvoices(
  args: { invoiceId?: string; status?: string; clientId?: string; clientName?: string; externalNumber?: string },
  context: ToolExecutionContext
): Promise<ToolResult> {
  try {
    if (!context.workspaceId) {
      return { success: false, data: null, error: 'Workspace context required' };
    }

    if (args.clientName || args.externalNumber) {
      try {
        const { trinityBusinessIntelligence } = await import('../trinityBusinessIntelligence');
        const biResult = await trinityBusinessIntelligence.searchInvoices(context.workspaceId, {
          clientName: args.clientName,
          externalNumber: args.externalNumber,
          status: args.status,
          limit: 20,
        });
        return {
          success: true,
          data: {
            invoices: biResult.invoices.map((inv: any) => ({
              id: inv.id,
              invoiceNumber: inv.invoiceNumber,
              externalInvoiceNumber: inv.externalInvoiceNumber,
              client: inv.client,
              status: inv.status,
              total: inv.total,
              dueDate: inv.dueDate,
              lineItemCount: inv.lineItems?.length || 0,
            })),
            summary: {
              totalInvoices: biResult.total,
              confidence: biResult.metacognition.confidence,
            }
          }
        };
      } catch (biError: any) {
        log.warn('[AI Brain] BI search fallback to standard query:', biError.message);
      }
    }

    const conditions: any[] = [eq(invoices.workspaceId, context.workspaceId)];

    if (args.invoiceId) {
      conditions.push(eq(invoices.id, args.invoiceId));
    }
    if (args.status) {
      conditions.push(eq(invoices.status, args.status as any));
    }
    if (args.clientId) {
      conditions.push(eq(invoices.clientId, args.clientId));
    }

    const results = await db.select({
      id: invoices.id,
      invoiceNumber: invoices.invoiceNumber,
      clientId: invoices.clientId,
      status: invoices.status,
      total: invoices.total,
      dueDate: invoices.dueDate,
      paidAt: invoices.paidAt,
      createdAt: invoices.createdAt,
    })
    .from(invoices)
    .where(and(...conditions))
    .orderBy(desc(invoices.createdAt))
    .limit(20);

    const totalOutstanding = results
      .filter(r => r.status === 'sent' || r.status === 'overdue')
      .reduce((sum, r) => sum + Number(r.total || 0), 0);
    const overdueCount = results.filter(r => r.status === 'overdue').length;

    return {
      success: true,
      data: {
        invoices: results,
        summary: {
          totalInvoices: results.length,
          totalOutstanding: Math.round(totalOutstanding * 100) / 100,
          overdueCount,
          paidCount: results.filter(r => r.status === 'paid').length,
        }
      }
    };
  } catch (error: any) {
    return { success: false, data: null, error: `Invoice lookup failed: ${(error instanceof Error ? error.message : String(error))}` };
  }
}

async function executeLookupEmployees(
  args: { employeeId?: string; searchName?: string; includeStats?: boolean },
  context: ToolExecutionContext
): Promise<ToolResult> {
  try {
    if (!context.workspaceId) {
      return { success: false, data: null, error: 'Workspace context required' };
    }

    const conditions: any[] = [eq(employees.workspaceId, context.workspaceId)];

    if (args.employeeId) {
      conditions.push(eq(employees.id, args.employeeId));
    }
    if (args.searchName) {
      conditions.push(
        or(
          ilike(employees.firstName, `%${args.searchName}%`),
          ilike(employees.lastName, `%${args.searchName}%`)
        )
      );
    }

    const results = await db.select({
      id: employees.id,
      firstName: employees.firstName,
      lastName: employees.lastName,
      email: employees.email,
      phone: employees.phone,
      role: employees.role,
      isActive: employees.isActive,
      hireDate: employees.hireDate,
    })
    .from(employees)
    .where(and(...conditions))
    .limit(25);

    const activeCount = results.filter(r => r.isActive).length;

    return {
      success: true,
      data: {
        employees: results.map(e => ({
          id: e.id,
          name: `${e.firstName} ${e.lastName}`,
          email: e.email,
          phone: e.phone,
          role: e.role,
          isActive: e.isActive,
          hireDate: e.hireDate,
        })),
        summary: {
          totalEmployees: results.length,
          activeEmployees: activeCount,
          inactiveEmployees: results.length - activeCount,
        }
      }
    };
  } catch (error: any) {
    return { success: false, data: null, error: `Employee lookup failed: ${(error instanceof Error ? error.message : String(error))}` };
  }
}

async function executeDetectSchedulingConflicts(
  args: { daysAhead?: number; includeRecommendations?: boolean },
  context: ToolExecutionContext
): Promise<ToolResult> {
  try {
    if (!context.workspaceId) {
      return { success: false, data: null, error: 'Workspace context required' };
    }
    const daysAhead = args.daysAhead || 7;
    const now = new Date();
    const endDate = new Date(now.getTime() + daysAhead * 24 * 60 * 60 * 1000);

    const upcomingShifts = await db.select({
      id: shifts.id,
      employeeId: shifts.employeeId,
      startTime: shifts.startTime,
      endTime: shifts.endTime,
      title: shifts.title,
      status: shifts.status,
    })
    .from(shifts)
    .where(and(
      eq(shifts.workspaceId, context.workspaceId),
      gte(shifts.startTime, now),
      lte(shifts.startTime, endDate),
    ))
    .orderBy(shifts.startTime)
    .limit(200);

    const conflicts: Array<{ type: string; severity: string; description: string; shiftIds: string[]; recommendation?: string }> = [];

    const employeeShifts = new Map<string, typeof upcomingShifts>();
    for (const shift of upcomingShifts) {
      if (!shift.employeeId) continue;
      const existing = employeeShifts.get(shift.employeeId) || [];
      existing.push(shift);
      employeeShifts.set(shift.employeeId, existing);
    }

    for (const [empId, empShifts] of employeeShifts) {
      for (let i = 0; i < empShifts.length; i++) {
        for (let j = i + 1; j < empShifts.length; j++) {
          const a = empShifts[i];
          const b = empShifts[j];
          if (a.startTime && b.startTime && a.endTime && b.endTime) {
            if (a.startTime < b.endTime && b.startTime < a.endTime) {
              conflicts.push({
                type: 'double_booking',
                severity: 'critical',
                description: `Employee ${empId} is double-booked: "${a.title || 'Shift'}" overlaps with "${b.title || 'Shift'}"`,
                shiftIds: [a.id, b.id],
                recommendation: args.includeRecommendations ? 'Reassign one of the overlapping shifts to another available employee' : undefined,
              });
            }
          }
        }

        const dailyHours = empShifts
          .filter(s => s.startTime && s.endTime && s.startTime.toDateString() === empShifts[i].startTime?.toDateString())
          .reduce((sum, s) => sum + ((s.endTime!.getTime() - s.startTime!.getTime()) / 3600000), 0);
        
        if (dailyHours > 12 && i === 0) {
          conflicts.push({
            type: 'overtime_risk',
            severity: 'warning',
            description: `Employee ${empId} has ${Math.round(dailyHours)}+ hours scheduled on ${empShifts[i].startTime?.toDateString()}`,
            shiftIds: empShifts.filter(s => s.startTime?.toDateString() === empShifts[i].startTime?.toDateString()).map(s => s.id),
            recommendation: args.includeRecommendations ? 'Consider splitting shifts across multiple employees to avoid overtime' : undefined,
          });
        }
      }
    }

    const openShifts = upcomingShifts.filter(s => !s.employeeId);
    if (openShifts.length > 0) {
      conflicts.push({
        type: 'uncovered_shifts',
        severity: openShifts.length > 3 ? 'critical' : 'warning',
        description: `${openShifts.length} shift(s) have no employee assigned`,
        shiftIds: openShifts.map(s => s.id),
        recommendation: args.includeRecommendations ? 'Use AI Smart Scheduling to auto-assign available employees based on skills and proximity' : undefined,
      });
    }

    return {
      success: true,
      data: {
        conflicts,
        summary: {
          totalConflicts: conflicts.length,
          criticalConflicts: conflicts.filter(c => c.severity === 'critical').length,
          warningConflicts: conflicts.filter(c => c.severity === 'warning').length,
          totalShiftsAnalyzed: upcomingShifts.length,
          uncoveredShifts: openShifts.length,
          periodDays: daysAhead,
        }
      }
    };
  } catch (error: any) {
    return { success: false, data: null, error: `Conflict detection failed: ${(error instanceof Error ? error.message : String(error))}` };
  }
}

async function executeAnalyzeSentiment(
  args: { message: string; context?: string },
  _context: ToolExecutionContext
): Promise<ToolResult> {
  const message = args.message.toLowerCase();
  
  const frustrationKeywords = ['frustrated', 'angry', 'furious', 'terrible', 'horrible', 'worst', 'unacceptable', 'ridiculous', 'waste', 'broken', 'useless', 'hate', 'awful', 'disgusted'];
  const urgencyKeywords = ['urgent', 'asap', 'emergency', 'immediately', 'critical', 'deadline', 'now', 'help!', 'right now', 'can\'t wait'];
  const positiveKeywords = ['thanks', 'great', 'awesome', 'perfect', 'love', 'excellent', 'wonderful', 'appreciate', 'helpful'];
  const confusionKeywords = ['confused', 'don\'t understand', 'how do i', 'where is', 'can\'t find', 'lost', 'stuck', 'help me'];
  
  let frustrationScore = 0;
  let urgencyScore = 0;
  let positiveScore = 0;
  let confusionScore = 0;
  
  for (const kw of frustrationKeywords) { if (message.includes(kw)) frustrationScore += 1; }
  for (const kw of urgencyKeywords) { if (message.includes(kw)) urgencyScore += 1; }
  for (const kw of positiveKeywords) { if (message.includes(kw)) positiveScore += 1; }
  for (const kw of confusionKeywords) { if (message.includes(kw)) confusionScore += 1; }
  
  const hasExclamation = (message.match(/!/g) || []).length;
  const hasAllCaps = (args.message.match(/[A-Z]{3,}/g) || []).length;
  frustrationScore += hasAllCaps * 0.5;
  urgencyScore += hasExclamation * 0.2;
  
  let sentiment: 'positive' | 'neutral' | 'negative' | 'frustrated' = 'neutral';
  if (frustrationScore >= 2) sentiment = 'frustrated';
  else if (frustrationScore >= 1) sentiment = 'negative';
  else if (positiveScore >= 1) sentiment = 'positive';
  
  const shouldEscalate = frustrationScore >= 2 || urgencyScore >= 2;
  
  return {
    success: true,
    data: {
      sentiment,
      scores: {
        frustration: Math.min(frustrationScore / 3, 1),
        urgency: Math.min(urgencyScore / 2, 1),
        positivity: Math.min(positiveScore / 2, 1),
        confusion: Math.min(confusionScore / 2, 1),
      },
      shouldEscalate,
      escalationReason: shouldEscalate
        ? (frustrationScore >= 2 ? 'High frustration detected' : 'High urgency detected')
        : null,
      suggestedTone: sentiment === 'frustrated'
        ? 'empathetic_and_action_oriented'
        : sentiment === 'negative'
        ? 'reassuring_and_helpful'
        : 'friendly_and_professional',
    }
  };
}

// ============================================================================
// T002: EXPANDED TOOL HANDLERS — Incidents, Certs, Clients, Compliance,
//       Guard Tours, Equipment, Platform Actions, Financial Analysis
// ============================================================================

async function executeLookupIncidents(
  args: { siteId?: string; status?: string; daysBack?: number; severity?: string },
  context: ToolExecutionContext
): Promise<ToolResult> {
  try {
    const daysBack = args.daysBack || 30;
    const cutoff = new Date(Date.now() - daysBack * 24 * 60 * 60 * 1000);
    const conditions: any[] = [gte(securityIncidents.reportedAt, cutoff)];
    if (context.workspaceId) conditions.push(eq(securityIncidents.workspaceId, context.workspaceId));
    if (args.status) conditions.push(eq(securityIncidents.status, args.status as any));
    if (args.severity) conditions.push(eq(securityIncidents.severity, args.severity as any));
    if (args.siteId) conditions.push(eq(securityIncidents.clientId, args.siteId));

    const incidents = await db
      .select({
        id: securityIncidents.id,
        type: securityIncidents.type,
        severity: securityIncidents.severity,
        status: securityIncidents.status,
        description: securityIncidents.description,
        location: securityIncidents.location,
        reportedAt: securityIncidents.reportedAt,
        resolvedAt: securityIncidents.resolvedAt,
      })
      .from(securityIncidents)
      .where(and(...conditions))
      .orderBy(desc(securityIncidents.reportedAt))
      .limit(25);

    return { success: true, data: { incidents, total: incidents.length, daysBack } };
  } catch (error: any) {
    return { success: false, data: null, error: (error instanceof Error ? error.message : String(error)) };
  }
}

async function executeLookupCertifications(
  args: { employeeId?: string; certificationType?: string; includeExpired?: boolean; expiringWithinDays?: number },
  context: ToolExecutionContext
): Promise<ToolResult> {
  try {
    const conditions: any[] = [];
    if (context.workspaceId) conditions.push(eq(employeeCertifications.workspaceId, context.workspaceId));
    if (args.employeeId) conditions.push(eq(employeeCertifications.employeeId, args.employeeId));
    if (args.certificationType) conditions.push(eq(employeeCertifications.certificationType, args.certificationType));
    if (!args.includeExpired) {
      conditions.push(or(
        gte(employeeCertifications.expirationDate, new Date()),
        sql`${employeeCertifications.expirationDate} IS NULL`
      ));
    }
    if (args.expiringWithinDays) {
      const expiryWindow = new Date(Date.now() + args.expiringWithinDays * 24 * 60 * 60 * 1000);
      conditions.push(lte(employeeCertifications.expirationDate, expiryWindow));
      conditions.push(gte(employeeCertifications.expirationDate, new Date()));
    }

    const certs = await db
      .select({
        id: employeeCertifications.id,
        employeeId: employeeCertifications.employeeId,
        certificationType: employeeCertifications.certificationType,
        certificationName: employeeCertifications.certificationName,
        certificationNumber: employeeCertifications.certificationNumber,
        issuingAuthority: employeeCertifications.issuingAuthority,
        issuedDate: employeeCertifications.issuedDate,
        expirationDate: employeeCertifications.expirationDate,
        status: employeeCertifications.status,
        isRequired: employeeCertifications.isRequired,
      })
      .from(employeeCertifications)
      .where(conditions.length > 0 ? and(...conditions) : undefined)
      .orderBy(employeeCertifications.expirationDate)
      .limit(50);

    const expiringSoon = certs.filter(c => {
      if (!c.expirationDate) return false;
      const daysUntil = (new Date(c.expirationDate).getTime() - Date.now()) / (1000 * 60 * 60 * 24);
      return daysUntil > 0 && daysUntil <= 30;
    });

    return { success: true, data: { certifications: certs, total: certs.length, expiringSoon: expiringSoon.length } };
  } catch (error: any) {
    return { success: false, data: null, error: (error instanceof Error ? error.message : String(error)) };
  }
}

async function executeLookupClients(
  args: { clientName?: string; clientId?: string; includeContracts?: boolean },
  context: ToolExecutionContext
): Promise<ToolResult> {
  try {
    const conditions: any[] = [];
    if (context.workspaceId) conditions.push(eq(clients.workspaceId, context.workspaceId));
    if (args.clientId) conditions.push(eq(clients.id, args.clientId));
    if (args.clientName) {
      conditions.push(or(
        ilike(clients.companyName, `%${args.clientName}%`),
        ilike(clients.firstName, `%${args.clientName}%`),
        ilike(clients.lastName, `%${args.clientName}%`)
      ));
    }

    const clientList = await db
      .select({
        id: clients.id,
        firstName: clients.firstName,
        lastName: clients.lastName,
        companyName: clients.companyName,
        email: clients.email,
        phone: clients.phone,
        city: clients.city,
        state: clients.state,
        clientCode: clients.clientCode,
      })
      .from(clients)
      .where(conditions.length > 0 ? and(...conditions) : undefined)
      .limit(25);

    return { success: true, data: { clients: clientList, total: clientList.length } };
  } catch (error: any) {
    return { success: false, data: null, error: (error instanceof Error ? error.message : String(error)) };
  }
}

async function executeLookupComplianceScore(
  args: { state?: string; includeHistory?: boolean },
  context: ToolExecutionContext
): Promise<ToolResult> {
  try {
    const conditions: any[] = [];
    if (context.workspaceId) conditions.push(eq(complianceScores.workspaceId, context.workspaceId));
    if (args.state) conditions.push(eq(complianceScores.stateId, args.state));

    const scores = await db
      .select({
        id: complianceScores.id,
        scoreType: complianceScores.scoreType,
        overallScore: complianceScores.overallScore,
        documentScore: complianceScores.documentScore,
        expirationScore: complianceScores.expirationScore,
        auditReadinessScore: complianceScores.auditReadinessScore,
        trainingScore: complianceScores.trainingScore,
        totalRequirements: complianceScores.totalRequirements,
        completedRequirements: complianceScores.completedRequirements,
        expiredItems: complianceScores.expiredItems,
      })
      .from(complianceScores)
      .where(conditions.length > 0 ? and(...conditions) : undefined)
      .orderBy(desc(complianceScores.id))
      .limit(args.includeHistory ? 50 : 5);

    const avgScore = scores.length > 0
      ? Math.round(scores.reduce((s, c) => s + (c.overallScore || 0), 0) / scores.length)
      : 0;

    return { success: true, data: { scores, total: scores.length, averageScore: avgScore } };
  } catch (error: any) {
    return { success: false, data: null, error: (error instanceof Error ? error.message : String(error)) };
  }
}

async function executeLookupGuardTours(
  args: { guardId?: string; siteId?: string; status?: string; daysBack?: number },
  context: ToolExecutionContext
): Promise<ToolResult> {
  try {
    const conditions: any[] = [];
    if (context.workspaceId) conditions.push(eq(guardTours.workspaceId, context.workspaceId));
    if (args.guardId) conditions.push(eq(guardTours.assignedEmployeeId, args.guardId));
    if (args.siteId) conditions.push(eq(guardTours.clientId, args.siteId));
    if (args.status) conditions.push(eq(guardTours.status, args.status as any));

    const tours = await db
      .select({
        id: guardTours.id,
        name: guardTours.name,
        description: guardTours.description,
        assignedEmployeeId: guardTours.assignedEmployeeId,
        status: guardTours.status,
        intervalMinutes: guardTours.intervalMinutes,
        startTime: guardTours.startTime,
        endTime: guardTours.endTime,
        siteAddress: guardTours.siteAddress,
      })
      .from(guardTours)
      .where(conditions.length > 0 ? and(...conditions) : undefined)
      .limit(25);

    return { success: true, data: { tours, total: tours.length } };
  } catch (error: any) {
    return { success: false, data: null, error: (error instanceof Error ? error.message : String(error)) };
  }
}

async function executeLookupEquipment(
  args: { category?: string; status?: string; assignedTo?: string },
  context: ToolExecutionContext
): Promise<ToolResult> {
  try {
    const conditions: any[] = [];
    if (context.workspaceId) conditions.push(eq(equipmentItems.workspaceId, context.workspaceId));
    if (args.category) conditions.push(eq(equipmentItems.category, args.category as any));
    if (args.status) conditions.push(eq(equipmentItems.status, args.status as any));

    const items = await db
      .select({
        id: equipmentItems.id,
        name: equipmentItems.name,
        serialNumber: equipmentItems.serialNumber,
        category: equipmentItems.category,
        status: equipmentItems.status,
        description: equipmentItems.description,
      })
      .from(equipmentItems)
      .where(conditions.length > 0 ? and(...conditions) : undefined)
      .limit(50);

    const statusSummary: Record<string, number> = {};
    items.forEach(item => {
      const s = item.status || 'unknown';
      statusSummary[s] = (statusSummary[s] || 0) + 1;
    });

    return { success: true, data: { equipment: items, total: items.length, statusSummary } };
  } catch (error: any) {
    return { success: false, data: null, error: (error instanceof Error ? error.message : String(error)) };
  }
}

async function executeListAvailableActions(
  args: { category?: string },
  context: ToolExecutionContext
): Promise<ToolResult> {
  try {
    const { platformActionHub } = await import('../../helpai/platformActionHub');
    const userRole = (context as any).userRole || 'system';
    const allActions = platformActionHub.getAvailableActions(userRole);
    const filtered = args.category
      ? allActions.filter((a) => a.category === args.category || a.actionId.startsWith(args.category + '.'))
      : allActions;
    const summary = filtered.map((a) => ({
      actionId: a.actionId,
      category: a.category,
      name: a.name,
      description: a.description,
      requiredRoles: a.requiredRoles,
    }));
    return {
      success: true,
      data: {
        totalActions: summary.length,
        actions: summary,
        usage: 'Pass the actionId to execute_platform_action to invoke an action.',
      },
    };
  } catch (error: any) {
    return { success: false, data: null, error: (error instanceof Error ? error.message : String(error)) };
  }
}

async function executePlatformAction(
  args: { actionId: string; payload?: string },
  context: ToolExecutionContext
): Promise<ToolResult> {
  try {
    const { platformActionHub } = await import('../../helpai/platformActionHub');
    const payload = args.payload ? JSON.parse(args.payload) : {};
    const parts = args.actionId.split('.');
    const category = parts[0] || 'system';
    const name = parts.slice(1).join('.') || args.actionId;
    if (!context.workspaceId) {
      return { success: false, data: null, error: 'Missing workspaceId — cannot execute action without workspace context' };
    }
    const result = await platformActionHub.executeAction({
      actionId: args.actionId,
      category: category as any,
      name,
      payload,
      workspaceId: context.workspaceId,
      userId: context.userId || 'trinity-ai',
      userRole: 'system',
    });
    return { success: result.success, data: result.data || result, error: result.error };
  } catch (error: any) {
    return { success: false, data: null, error: (error instanceof Error ? error.message : String(error)) };
  }
}

async function executeFinancialAnalysis(
  args: { analysisType: string; timeframe?: string; compareToLast?: boolean },
  context: ToolExecutionContext
): Promise<ToolResult> {
  try {
    const wsId = context.workspaceId;
    if (!wsId) return { success: false, data: null, error: 'No workspace context for financial analysis' };

    const timeframe = args.timeframe || 'monthly';
    const now = new Date();
    let periodStart: Date;
    let prevStart: Date;
    let prevEnd: Date;

    switch (timeframe) {
      case 'weekly':
        periodStart = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
        prevStart = new Date(periodStart.getTime() - 7 * 24 * 60 * 60 * 1000);
        prevEnd = periodStart;
        break;
      case 'quarterly':
        periodStart = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);
        prevStart = new Date(periodStart.getTime() - 90 * 24 * 60 * 60 * 1000);
        prevEnd = periodStart;
        break;
      case 'yearly':
        periodStart = new Date(now.getTime() - 365 * 24 * 60 * 60 * 1000);
        prevStart = new Date(periodStart.getTime() - 365 * 24 * 60 * 60 * 1000);
        prevEnd = periodStart;
        break;
      default:
        periodStart = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
        prevStart = new Date(periodStart.getTime() - 30 * 24 * 60 * 60 * 1000);
        prevEnd = periodStart;
    }

    const [currentRevenue] = await db
      .select({ total: sql<string>`COALESCE(SUM(CAST(${invoices.total} AS DECIMAL)), 0)` })
      .from(invoices)
      .where(and(
        eq(invoices.workspaceId, wsId),
        gte(invoices.createdAt, periodStart),
        eq(invoices.status, 'paid')
      ));

    const [prevRevenue] = args.compareToLast ? await db
      .select({ total: sql<string>`COALESCE(SUM(CAST(${invoices.total} AS DECIMAL)), 0)` })
      .from(invoices)
      .where(and(
        eq(invoices.workspaceId, wsId),
        gte(invoices.createdAt, prevStart),
        lte(invoices.createdAt, prevEnd),
        eq(invoices.status, 'paid')
      )) : [{ total: '0' }];

    const [laborCost] = await db
      .select({ total: sql<string>`COALESCE(SUM(CAST(${payrollRuns.totalGrossPay} AS DECIMAL)), 0)` })
      .from(payrollRuns)
      .where(and(
        eq(payrollRuns.workspaceId, wsId),
        gte(payrollRuns.createdAt, periodStart)
      ));

    const [invoiceCounts] = await db
      .select({
        total: count(),
        paid: sql<number>`COUNT(*) FILTER (WHERE ${invoices.status} = 'paid')`,
        overdue: sql<number>`COUNT(*) FILTER (WHERE ${invoices.status} = 'overdue')`,
        pending: sql<number>`COUNT(*) FILTER (WHERE ${invoices.status} = 'pending')`,
      })
      .from(invoices)
      .where(and(
        eq(invoices.workspaceId, wsId),
        gte(invoices.createdAt, periodStart)
      ));

    const revenue = parseFloat(currentRevenue?.total || '0');
    const labor = parseFloat(laborCost?.total || '0');
    const prevRev = parseFloat(prevRevenue?.total || '0');
    const profit = revenue - labor;
    const margin = revenue > 0 ? ((profit / revenue) * 100).toFixed(1) : '0';
    const laborRatio = revenue > 0 ? ((labor / revenue) * 100).toFixed(1) : '0';
    const revenueChange = prevRev > 0 ? (((revenue - prevRev) / prevRev) * 100).toFixed(1) : 'N/A';

    const analysis: any = {
      timeframe,
      period: { start: periodStart.toISOString(), end: now.toISOString() },
      revenue: { current: revenue, previous: prevRev, changePercent: revenueChange },
      laborCost: { total: labor, ratio: `${laborRatio}%` },
      profitAndLoss: { grossProfit: profit, margin: `${margin}%` },
      invoices: invoiceCounts,
    };

    if (args.analysisType === 'overtime_analysis') {
      const [overtime] = await db
        .select({
          totalEntries: count(),
          totalHours: sql<string>`COALESCE(SUM(CAST(${timeEntries.totalHours} AS DECIMAL)), 0)`,
        })
        .from(timeEntries)
        .where(and(
          eq(timeEntries.workspaceId, wsId),
          gte(timeEntries.clockIn, periodStart),
          sql`CAST(${timeEntries.totalHours} AS DECIMAL) > 8`
        ));

      analysis.overtime = {
        entries: overtime?.totalEntries || 0,
        totalOvertimeHours: parseFloat(overtime?.totalHours || '0'),
      };
    }

    return { success: true, data: analysis };
  } catch (error: any) {
    return { success: false, data: null, error: (error instanceof Error ? error.message : String(error)) };
  }
}

async function executeAnalyzeCrossDomain(
  args: { domains?: string; focusArea?: string },
  context: ToolExecutionContext
): Promise<ToolResult> {
  try {
    const wsId = context.workspaceId;
    if (!wsId) return { success: false, data: null, error: 'No workspace context for cross-domain analysis' };

    const requestedDomains = args.domains ? args.domains.split(',').map(d => d.trim()) : ['all'];
    const runAll = requestedDomains.includes('all');

    const results: any = { domains: requestedDomains, focusArea: args.focusArea };
    const allInsights: any[] = [];

    if (runAll || requestedDomains.includes('profitability')) {
      const insights = await trinityCrossDomainIntelligence.analyzeClientProfitability(wsId);
      allInsights.push(...insights);
      results.profitability = { insightCount: insights.length, insights: insights.slice(0, 5) };
    }
    if (runAll || requestedDomains.includes('overtime')) {
      const insights = await trinityCrossDomainIntelligence.detectOvertimeTrends(wsId);
      allInsights.push(...insights);
      results.overtime = { insightCount: insights.length, insights: insights.slice(0, 5) };
    }
    if (runAll || requestedDomains.includes('compliance')) {
      const insights = await trinityCrossDomainIntelligence.identifyComplianceRisks(wsId);
      allInsights.push(...insights);
      results.compliance = { insightCount: insights.length, insights: insights.slice(0, 5) };
    }
    if (runAll || requestedDomains.includes('labor_forecast')) {
      const insights = await trinityCrossDomainIntelligence.forecastLaborCosts(wsId);
      allInsights.push(...insights);
      results.laborForecast = { insightCount: insights.length, insights: insights.slice(0, 5) };
    }
    if (runAll || requestedDomains.includes('trends')) {
      const insights = await trinityCrossDomainIntelligence.getTemporalTrends(wsId);
      allInsights.push(...insights);
      results.trends = { insightCount: insights.length, insights: insights.slice(0, 5) };
    }

    const criticalCount = allInsights.filter(i => i.severity === 'critical').length;
    const warningCount = allInsights.filter(i => i.severity === 'warning').length;
    results.summary = {
      totalInsights: allInsights.length,
      critical: criticalCount,
      warnings: warningCount,
      overallHealth: criticalCount > 0 ? 'critical' : warningCount >= 3 ? 'attention_needed' : 'healthy',
    };

    return { success: true, data: results };
  } catch (error: any) {
    return { success: false, data: null, error: (error instanceof Error ? error.message : String(error)) };
  }
}

async function executeDetectAnomaliesOnDemand(
  args: { anomalyTypes?: string; severityThreshold?: string },
  context: ToolExecutionContext
): Promise<ToolResult> {
  try {
    const wsId = context.workspaceId;
    if (!wsId) return { success: false, data: null, error: 'No workspace context for anomaly detection' };

    const types = args.anomalyTypes ? args.anomalyTypes.split(',').map(t => t.trim()) : ['all'];
    const threshold = args.severityThreshold || 'info';
    const runAll = types.includes('all');

    const allInsights: any[] = [];

    if (runAll || types.includes('overtime')) {
      allInsights.push(...await trinityCrossDomainIntelligence.detectOvertimeTrends(wsId));
    }
    if (runAll || types.includes('compliance')) {
      allInsights.push(...await trinityCrossDomainIntelligence.identifyComplianceRisks(wsId));
    }
    if (runAll || types.includes('profitability')) {
      allInsights.push(...await trinityCrossDomainIntelligence.analyzeClientProfitability(wsId));
    }

    const severityOrder = { info: 0, warning: 1, critical: 2 };
    const thresholdLevel = severityOrder[threshold as keyof typeof severityOrder] ?? 0;
    const filtered = allInsights.filter(i => (severityOrder[i.severity as keyof typeof severityOrder] ?? 0) >= thresholdLevel);

    return {
      success: true,
      data: {
        anomaliesDetected: filtered.length,
        severityThreshold: threshold,
        anomalies: filtered.map(i => ({
          type: i.type,
          severity: i.severity,
          confidence: i.confidence,
          title: i.title,
          summary: i.summary,
          recommendedActions: i.recommendedActions,
        })),
      },
    };
  } catch (error: any) {
    return { success: false, data: null, error: (error instanceof Error ? error.message : String(error)) };
  }
}

async function executeExplainReasoning(
  args: { analysisType: string; detailLevel?: string },
  context: ToolExecutionContext
): Promise<ToolResult> {
  try {
    const wsId = context.workspaceId;
    if (!wsId) return { success: false, data: null, error: 'No workspace context for reasoning explanation' };

    const detailLevel = args.detailLevel || 'detailed';
    let insights: any[] = [];

    switch (args.analysisType) {
      case 'profitability':
        insights = await trinityCrossDomainIntelligence.analyzeClientProfitability(wsId);
        break;
      case 'overtime':
        insights = await trinityCrossDomainIntelligence.detectOvertimeTrends(wsId);
        break;
      case 'compliance':
        insights = await trinityCrossDomainIntelligence.identifyComplianceRisks(wsId);
        break;
      case 'labor_forecast':
        insights = await trinityCrossDomainIntelligence.forecastLaborCosts(wsId);
        break;
      case 'trends':
        insights = await trinityCrossDomainIntelligence.getTemporalTrends(wsId);
        break;
      case 'full':
        const fullResult = await trinityCrossDomainIntelligence.generateFullAnalysis(wsId);
        insights = fullResult.insights;
        break;
      default:
        return { success: false, data: null, error: `Unknown analysis type: ${args.analysisType}` };
    }

    const explanations = insights.map(insight => {
      const explanation = trinityCrossDomainIntelligence.explainReasoning(insight);
      if (detailLevel === 'summary') {
        return { title: insight.title, confidence: insight.confidence, severity: insight.severity, summary: insight.summary };
      }
      if (detailLevel === 'technical') {
        return { title: insight.title, fullExplanation: explanation, dataPoints: insight.dataPoints, reasoningChain: insight.reasoningChain };
      }
      return { title: insight.title, confidence: insight.confidence, severity: insight.severity, explanation };
    });

    return { success: true, data: { analysisType: args.analysisType, detailLevel, explanations } };
  } catch (error: any) {
    return { success: false, data: null, error: (error instanceof Error ? error.message : String(error)) };
  }
}

async function executeForecastTrends(
  args: { forecastType: string; weeksAhead?: number },
  context: ToolExecutionContext
): Promise<ToolResult> {
  try {
    const wsId = context.workspaceId;
    if (!wsId) return { success: false, data: null, error: 'No workspace context for forecasting' };

    const weeksAhead = Math.min(Math.max(args.weeksAhead || 4, 1), 12);
    const forecastType = args.forecastType || 'all';
    const results: any = { forecastType, weeksAhead };

    if (forecastType === 'labor_costs' || forecastType === 'all') {
      const laborInsights = await trinityCrossDomainIntelligence.forecastLaborCosts(wsId, weeksAhead);
      results.laborCosts = laborInsights.map(i => ({ title: i.title, summary: i.summary, dataPoints: i.dataPoints, confidence: i.confidence }));
    }

    if (forecastType === 'compliance' || forecastType === 'all') {
      const complianceInsights = await trinityCrossDomainIntelligence.identifyComplianceRisks(wsId);
      results.compliance = complianceInsights.map(i => ({ title: i.title, summary: i.summary, severity: i.severity, confidence: i.confidence }));
    }

    if (forecastType === 'revenue' || forecastType === 'all') {
      const trendInsights = await trinityCrossDomainIntelligence.getTemporalTrends(wsId);
      results.revenue = trendInsights.map(i => ({ title: i.title, summary: i.summary, dataPoints: i.dataPoints, confidence: i.confidence }));
    }

    return { success: true, data: results };
  } catch (error: any) {
    return { success: false, data: null, error: (error instanceof Error ? error.message : String(error)) };
  }
}

async function executeGetTemporalTrends(
  args: { includeDetails?: boolean },
  context: ToolExecutionContext
): Promise<ToolResult> {
  try {
    const wsId = context.workspaceId;
    if (!wsId) return { success: false, data: null, error: 'No workspace context for temporal trends' };

    const insights = await trinityCrossDomainIntelligence.getTemporalTrends(wsId);

    const data = insights.map(i => {
      const base: any = { title: i.title, summary: i.summary, severity: i.severity, confidence: i.confidence };
      if (args.includeDetails) {
        base.dataPoints = i.dataPoints;
        base.reasoningChain = i.reasoningChain;
        base.recommendedActions = i.recommendedActions;
      }
      return base;
    });

    return { success: true, data: { trends: data, count: data.length } };
  } catch (error: any) {
    return { success: false, data: null, error: (error instanceof Error ? error.message : String(error)) };
  }
}

// ============================================================================
// UNIFIED GEMINI CLIENT CLASS
// ============================================================================

export class UnifiedGeminiClient {
  private model: GenerativeModel | null;
  private toolsModel: GenerativeModel | null;
  private jsonModel: GenerativeModel | null;

  constructor() {
    // Use HELLOS tier for general chat/conversation - HUMANIZED
    this.model = genAI ? genAI.getGenerativeModel({ 
      model: GEMINI_MODELS.HELLOS,
      systemInstruction: PERSONA_SYSTEM_INSTRUCTION,
      generationConfig: {
        maxOutputTokens: ANTI_YAP_PRESETS.helpai.maxTokens,
        temperature: ANTI_YAP_PRESETS.helpai.temperature,
        topP: ANTI_YAP_PRESETS.helpai.topP,
        topK: HUMANIZED_GENERATION_CONFIG.topK,
      }
    }) : null;
    
    // Use ORCHESTRATOR tier for tool-calling (complex reasoning) - HUMANIZED
    this.toolsModel = genAI ? genAI.getGenerativeModel({
      model: GEMINI_MODELS.ORCHESTRATOR,
      systemInstruction: PERSONA_SYSTEM_INSTRUCTION,
      tools: [{ functionDeclarations: AI_BRAIN_TOOLS }],
      generationConfig: {
        maxOutputTokens: ANTI_YAP_PRESETS.orchestrator.maxTokens,
        temperature: ANTI_YAP_PRESETS.orchestrator.temperature,
        topP: ANTI_YAP_PRESETS.orchestrator.topP,
        topK: HUMANIZED_GENERATION_CONFIG.topK,
      }
    }) : null;

    // Use SUPERVISOR tier for JSON Mode structured output - HUMANIZED
    this.jsonModel = genAI ? genAI.getGenerativeModel({
      model: GEMINI_MODELS.SUPERVISOR,
      systemInstruction: PERSONA_SYSTEM_INSTRUCTION,
      generationConfig: {
        responseMimeType: "application/json",
        maxOutputTokens: ANTI_YAP_PRESETS.supervisor.maxTokens,
        temperature: ANTI_YAP_PRESETS.supervisor.temperature,
        topP: ANTI_YAP_PRESETS.supervisor.topP,
        topK: HUMANIZED_GENERATION_CONFIG.topK,
      }
    }) : null;
    
    log.info('[AI Brain] UnifiedGeminiClient initialized with tiered architecture + humanized persona');
  }

  /**
   * UNIVERSAL CREDIT ENFORCEMENT - Pre-check before any AI operation
   * Returns true if the operation can proceed, false if credits insufficient
   * 
   * ZERO TOKEN LOSS POLICY (Feb 2026):
   * - Missing workspaceId: Log warning + track as unbilled usage (allowed for system operations)
   * - Unknown featureKey: Use default 'ai_general' cost instead of silently allowing free usage
   * - Every AI call is tracked even if billing check fails
   */
  private async enforceCreditPreCheck(
    workspaceId: string | undefined,
    userId: string | undefined,
    featureKey: string
  ): Promise<{ allowed: boolean; errorMessage?: string }> {
    try {
      const safeFeatureKey = featureKey || 'ai_general';
      const { aiTokenGateway } = await import('../../billing/aiTokenGateway');
      // @ts-expect-error — TS migration: fix in refactoring sprint
      const result = await aiTokenGateway.preAuthorize(workspaceId, userId, safeFeatureKey);
      if (!result.authorized) {
        return { allowed: false, errorMessage: result.reason };
      }
      return { allowed: true };
    } catch (err: any) {
      log.error(`[BillingGate] Pre-check FAILED for ${featureKey}: ${(err instanceof Error ? err.message : String(err))} - BLOCKING`);
      return { allowed: false, errorMessage: `Billing system error: ${(err instanceof Error ? err.message : String(err))}` };
    }
  }

  /**
   * UNIVERSAL CREDIT ENFORCEMENT - Post-deduction after successful AI operation
   * Routes through the single aiTokenGateway.finalizeBilling() gate.
   * No silent failures - all errors logged as BILLING_LEAK.
   */
  private async enforceCreditDeduction(
    workspaceId: string | undefined,
    userId: string | undefined,
    featureKey: string,
    tokenData?: { inputTokens?: number; outputTokens?: number; model?: string }
  ): Promise<void> {
    try {
      const { aiTokenGateway } = await import('../../billing/aiTokenGateway');
      const tokensTotal = (tokenData?.inputTokens || 0) + (tokenData?.outputTokens || 0);
      // @ts-expect-error — TS migration: fix in refactoring sprint
      await aiTokenGateway.finalizeBilling(workspaceId, userId, featureKey, tokensTotal, {
        inputTokens: tokenData?.inputTokens || 0,
        outputTokens: tokenData?.outputTokens || 0,
        model: tokenData?.model || 'gemini',
      });
    } catch (err: any) {
      log.error(`[BillingGate] BILLING_LEAK: Deduction crashed for ${featureKey} workspace=${workspaceId}: ${(err instanceof Error ? err.message : String(err))}`);
    }
  }

  private async _legacyEnforceCreditDeduction_UNUSED(
    workspaceId: string | undefined,
    userId: string | undefined,
    featureKey: string
  ): Promise<void> {
    if (!workspaceId) return;

    if (TOKEN_FREE_FEATURES.has(featureKey)) return;

    const creditKey = (featureKey in TOKEN_COSTS) 
      ? featureKey as keyof typeof TOKEN_COSTS 
      : 'ai_general' as keyof typeof TOKEN_COSTS;

    try {
      const result = await tokenManager.recordUsage({
        workspaceId,
        userId: userId || 'system-gemini',
        featureKey: creditKey,
        // @ts-expect-error — TS migration: fix in refactoring sprint
        featureName: featureKey,
        description: `AI operation: ${featureKey}`,
      });

      if (result.success) {
        log.info(`[CreditEnforcer] Deducted credits for ${featureKey} → balance: ${result.newBalance}`);
      } else {
        log.warn(`[CreditEnforcer] Deduction failed for ${featureKey}: ${result.errorMessage}`);
      }
    } catch (err: any) {
      log.error(`[CreditEnforcer] Post-deduction error for ${featureKey}:`, (err instanceof Error ? err.message : String(err)));
    }
  }

  /**
   * Generate structured JSON output for agent tasks
   * Use this for agents that need to return data for database updates
   */
  async generateJSON<T = any>(request: GeminiRequest & { jsonSchema?: string }): Promise<{ data: T | null; tokensUsed: number; error?: string }> {
    if (!this.jsonModel) {
      return { data: null, tokensUsed: 0, error: "JSON model not available" };
    }

    const creditCheck = await this.enforceCreditPreCheck(request.workspaceId, request.userId, request.featureKey);
    if (!creditCheck.allowed) {
      return { data: null, tokensUsed: 0, error: creditCheck.errorMessage };
    }

    const requestContext: AIRequestContext = {
      workspaceId: request.workspaceId || 'platform-unattributed',
      userId: request.userId || 'system',
      organizationId: 'platform',
      requestId: crypto.randomBytes(6).toString('hex'),
      timestamp: new Date(),
      operation: request.featureKey
    };

    try {
      const schemaInstruction = request.jsonSchema 
        ? `\n\nRespond with valid JSON matching this schema: ${request.jsonSchema}` 
        : '\n\nRespond with valid JSON only.';
      
      const result = await this.jsonModel.generateContent(request.systemPrompt + schemaInstruction + "\n\nUser: " + request.userMessage); // withGemini
      const response = result.response;
      const text = response.text();
      const inputTokens = response.usageMetadata?.promptTokenCount || 0;
      const outputTokens = response.usageMetadata?.candidatesTokenCount || 0;
      const tokensUsed = inputTokens + outputTokens;

      if (request.workspaceId && (inputTokens > 0 || outputTokens > 0)) {
        import('../../billing/aiMeteringService').then(({ aiMeteringService }) => {
          aiMeteringService.recordAiCall({
            workspaceId: request.workspaceId!,
            modelName: GEMINI_MODELS.SUPERVISOR,
            callType: request.featureKey || 'gemini_json',
            inputTokens,
            outputTokens,
            triggeredByUserId: request.userId,
          });
         }).catch((err: any) => log.warn('[AIMeter] recordAiCall failed (non-blocking):', err?.message));
      }

      try {
        const data = JSON.parse(text) as T;
        await this.enforceCreditDeduction(request.workspaceId, request.userId, request.featureKey);
        return { data, tokensUsed };
      } catch {
        await this.enforceCreditDeduction(request.workspaceId, request.userId, request.featureKey);
        return { data: null, tokensUsed, error: "Failed to parse JSON response" };
      }
    } catch (error: any) {
      return { data: null, tokensUsed: 0, error: (error instanceof Error ? error.message : String(error)) };
    }
  }

  /**
   * Generate AI response - COMPLETE 8-STEP FUNCTION CALLING WORKFLOW
   * 
   * Steps:
   * 1. User prompt received
   * 2. App sends prompt + tools to Gemini
   * 3. Gemini returns function calls
   * 4. App executes the tools
   * 5. App sends tool results back to Gemini
   * 6. Gemini processes results
   * 7. Gemini returns final response
   * 8. App returns response to user
   */
  async generate(request: GeminiRequest): Promise<GeminiResponse> {
    if (!this.model) {
      throw new Error("Gemini API not configured - AI Brain disabled");
    }

    const creditCheck = await this.enforceCreditPreCheck(request.workspaceId, request.userId, request.featureKey);
    if (!creditCheck.allowed) {
      return {
        text: creditCheck.errorMessage || 'Insufficient credits',
        tokensUsed: 0,
        metadata: { creditBlocked: true }
      };
    }

    const requestContext: AIRequestContext = {
      workspaceId: request.workspaceId || 'platform-unattributed',
      userId: request.userId || 'system',
      organizationId: 'platform',
      requestId: crypto.randomBytes(6).toString('hex'),
      timestamp: new Date(),
      operation: request.featureKey
    };

    const validation = aiGuardRails.validateRequest(request.userMessage, requestContext, request.featureKey);
    if (!validation.isValid) {
      return {
        text: 'Input validation failed. Please check your message and try again.',
        tokensUsed: 0
      };
    }

    try {
      log.info(`🧠 [AI Brain] Processing ${request.featureKey || 'health_check'} request with 8-step workflow`);
      
      const history = (request.conversationHistory || []).map(msg => ({
        role: msg.role === 'user' ? 'user' as const : 'model' as const,
        parts: [{ text: msg.content }]
      }));

      // STEP 2: Use tools model if tool calling enabled
      const modelToUse = request.enableToolCalling ? this.toolsModel : this.model;
      const activeModelName = request.enableToolCalling ? GEMINI_MODELS.ORCHESTRATOR : GEMINI_MODELS.HELLOS;
      if (!modelToUse) throw new Error("Model not available");

      const chat = modelToUse.startChat({
        history: history,
        generationConfig: {
          maxOutputTokens: request.maxTokens || 2048,
          temperature: request.temperature || 0.7,
        },
      });

      let totalTokensUsed = 0;
      let totalInputTokens = 0;
      let totalOutputTokens = 0;
      let attempts = 0;
      const maxAttempts = 3;
      const maxToolIterations = 5; // Prevent infinite loops
      let lastError: Error | null = null;

      while (attempts < maxAttempts) {
        try {
          // STEP 2: Send initial message to Gemini with tools
          let result = await chat.sendMessage(validation.sanitizedInput);
          let response = result.response;
          
          // Track tokens (separately for accurate cost calculation)
          const initialUsage = response.usageMetadata;
          const initialInput = initialUsage?.promptTokenCount || 0;
          const initialOutput = initialUsage?.candidatesTokenCount || 0;
          totalInputTokens += initialInput;
          totalOutputTokens += initialOutput;
          totalTokensUsed += initialInput + initialOutput;

          // STEP 3: Extract function calls if present
          let functionCalls: Array<{ name: string; args: any }> = [];
          let candidates = response.candidates;
          
          if (candidates && candidates[0]?.content?.parts) {
            for (const part of candidates[0].content.parts) {
              if ('functionCall' in part && part.functionCall) {
                functionCalls.push({
                  name: part.functionCall.name,
                  args: part.functionCall.args
                });
              }
            }
          }

          // MULTI-TURN LOOP: Execute tools and get final response (Steps 4-7)
          let toolIterations = 0;
          const allFunctionCalls: Array<{ name: string; args: any; result: any }> = [];
          
          while (functionCalls.length > 0 && toolIterations < maxToolIterations) {
            toolIterations++;
            log.info(`🔄 [AI Brain] Tool iteration ${toolIterations}: ${functionCalls.length} function call(s) to execute`);

            // STEP 4: Execute each tool and collect results
            const toolResults: Array<{ name: string; response: any }> = [];
            
            for (const fc of functionCalls) {
              log.info(`🔧 [AI Brain] Executing tool: ${fc.name}`);
              
              const toolResult = await executeToolCall(fc.name, fc.args, {
                workspaceId: request.workspaceId,
                userId: request.userId
              });
              
              toolResults.push({
                name: fc.name,
                response: toolResult
              });
              
              allFunctionCalls.push({
                name: fc.name,
                args: fc.args,
                result: toolResult
              });
              
              log.info(`✅ [AI Brain] Tool ${fc.name} completed:`, toolResult.success ? 'success' : 'failed');
            }

            // STEP 5: Send tool results back to Gemini
            // Build the function response parts
            const functionResponseParts: Part[] = toolResults.map(tr => ({
              functionResponse: {
                name: tr.name,
                response: tr.response
              }
            }));

            log.info(`📤 [AI Brain] Sending ${toolResults.length} tool result(s) back to Gemini`);
            
            // STEP 6: Send results and get next response
            result = await chat.sendMessage(functionResponseParts);
            response = result.response;
            
            // Track additional tokens (separately for accurate cost calculation)
            const iterationUsage = response.usageMetadata;
            const iterInput = iterationUsage?.promptTokenCount || 0;
            const iterOutput = iterationUsage?.candidatesTokenCount || 0;
            totalInputTokens += iterInput;
            totalOutputTokens += iterOutput;
            totalTokensUsed += iterInput + iterOutput;

            // STEP 7: Check if Gemini needs more tools or has final response
            functionCalls = [];
            candidates = response.candidates;
            
            if (candidates && candidates[0]?.content?.parts) {
              for (const part of candidates[0].content.parts) {
                if ('functionCall' in part && part.functionCall) {
                  functionCalls.push({
                    name: part.functionCall.name,
                    args: part.functionCall.args
                  });
                }
              }
            }
            
            if (functionCalls.length === 0) {
              log.info(`✨ [AI Brain] Multi-turn loop complete after ${toolIterations} iteration(s)`);
            } else if (toolIterations >= maxToolIterations) {
              log.warn(`⚠️ [AI Brain] Max tool iterations (${maxToolIterations}) reached, forcing final response`);
              functionCalls = []; // Clear remaining calls to exit loop
            }
          }

          // STEP 8: Extract final text response with robust multi-part handling
          let responseText = '';
          
          // Try to extract text from all parts of all candidates
          try {
            const allCandidates = response.candidates || [];
            const textParts: string[] = [];
            
            for (const candidate of allCandidates) {
              if (candidate.content?.parts) {
                for (const part of candidate.content.parts) {
                  if ('text' in part && part.text) {
                    textParts.push(part.text);
                  }
                }
              }
            }
            
            if (textParts.length > 0) {
              responseText = textParts.join('\n');
            }
          } catch {
            // response.text() fallback
            try {
              responseText = response.text();
            } catch {
              // No text available
            }
          }
          
          // If still no text, construct from tool results (best-effort response)
          if (!responseText && allFunctionCalls.length > 0) {
            const successfulTools = allFunctionCalls.filter(fc => fc.result.success);
            const failedTools = allFunctionCalls.filter(fc => !fc.result.success);
            
            if (successfulTools.length > 0) {
              const resultMessages = successfulTools.map(fc => {
                if (fc.result.data?.message) {
                  return fc.result.data.message;
                }
                if (fc.name === 'search_faqs' && fc.result.data?.faqs) {
                  const faqs = fc.result.data.faqs;
                  if (faqs.length > 0) {
                    return `Found ${faqs.length} relevant FAQ(s):\n${faqs.map((f: any) => `- **${f.question}**\n  ${f.answer}`).join('\n\n')}`;
                  }
                  return 'No matching FAQs found for your query.';
                }
                if (fc.name === 'get_business_insights' && fc.result.data) {
                  const insights = fc.result.data;
                  return `Here are your ${insights.type} insights:\n${JSON.stringify(insights.recommendations || insights.metrics, null, 2)}`;
                }
                if (fc.name === 'suggest_automation' && fc.result.data?.suggestions) {
                  return `Automation suggestions:\n${fc.result.data.suggestions.map((s: any) => `- **${s.area}**: ${s.description}`).join('\n')}`;
                }
                if (fc.name === 'recommend_platform_feature' && fc.result.data?.recommendations) {
                  return `Recommended features:\n${fc.result.data.recommendations.map((r: any) => `- **${r.feature}** (${r.tier}): ${r.description}`).join('\n')}`;
                }
                return `${fc.name} completed successfully.`;
              });
              
              responseText = resultMessages.join('\n\n');
              
              if (failedTools.length > 0) {
                responseText += `\n\nNote: Some operations encountered issues and may need to be retried.`;
              }
            } else {
              responseText = 'I encountered issues while processing your request. Please try again or contact support for assistance.';
            }
          }
          
          // Final fallback for empty response
          if (!responseText) {
            if (toolIterations >= maxToolIterations) {
              responseText = 'I processed your request but reached the complexity limit. The tools executed successfully. Please let me know if you need more specific information.';
            } else {
              responseText = 'I processed your request. Is there anything specific you would like to know?';
            }
          }
          
          // Validate response
          const responseValidation = aiGuardRails.validateResponse(responseText, 0, request.featureKey);
          if (!responseValidation.isValid && !allFunctionCalls.length) {
            attempts++;
            lastError = new Error('Response validation failed');
            continue;
          }

          log.info(`[AI Brain] ${request.featureKey} - ${totalTokensUsed} tokens (${allFunctionCalls.length} tools executed)`);

          // Log operation
          aiGuardRails.logAIOperation(requestContext, validation.sanitizedInput, responseText, {
            success: true,
            creditsUsed: validation.estimatedCredits,
            tokensUsed: totalTokensUsed,
            duration: Date.now() - requestContext.timestamp.getTime()
          });

          await this.enforceCreditDeduction(request.workspaceId, request.userId, request.featureKey);

          if (request.workspaceId) {
            import('../../billing/aiMeteringService').then(({ aiMeteringService }) => {
              aiMeteringService.recordAiCall({
                workspaceId: request.workspaceId!,
                modelName: activeModelName,
                callType: request.featureKey || 'gemini_generate',
                inputTokens: totalInputTokens,
                outputTokens: totalOutputTokens,
                triggeredByUserId: request.userId,
                trinityActionId: undefined,
              });
             }).catch((err: any) => log.warn('[AIMeter] recordAiCall failed (non-blocking):', err?.message));
          }

          return {
            text: responseText,
            tokensUsed: totalTokensUsed,
            functionCalls: allFunctionCalls.length > 0 ? allFunctionCalls : undefined,
            structuredOutput: allFunctionCalls.length > 0 ? {
              toolsExecuted: allFunctionCalls.map(fc => ({
                tool: fc.name,
                args: fc.args,
                result: fc.result
              }))
            } : undefined,
            metadata: {
              model: 'gemini-2.5-flash',
              timestamp: new Date().toISOString(),
              attempts: attempts + 1,
              toolIterations: toolIterations,
              workflowComplete: true
            }
          };

        } catch (error: any) {
          attempts++;
          lastError = error;
          log.warn(`⚠️ [AI Brain] Attempt ${attempts}/${maxAttempts} failed:`, (error instanceof Error ? error.message : String(error)));
          
          if (attempts >= maxAttempts) break;
          
          // Wait before retry
          await new Promise(resolve => setTimeout(resolve, 1000 * attempts));
        }
      }

      throw lastError || new Error('All retry attempts failed');

    } catch (error: any) {
      log.error(`❌ [AI Brain] Gemini error for ${request.featureKey}:`, error);
      throw new Error(`AI Brain inference failed: ${(error instanceof Error ? error.message : String(error)) || 'Unknown error'}`);
    }
  }

  /**
   * Generate with structured tool calling for business insights
   */
  async generateWithTools(request: GeminiRequest): Promise<GeminiResponse> {
    return this.generate({
      ...request,
      enableToolCalling: true
    });
  }

  /**
   * UNIVERSAL GATE: generateContent - metered wrapper for all content generation
   * Routes through credit enforcement so no AI tokens leak unbilled.
   * Accepts either { prompt, purpose } or raw Google SDK { contents, generationConfig } format.
   */
  async generateContent(
    requestOrPrompt: string | { prompt?: string; purpose?: string; featureKey?: string; contents?: any[]; generationConfig?: any; workspaceId?: string; userId?: string },
    options?: { temperature?: number; maxTokens?: number; workspaceId?: string; userId?: string; featureKey?: string }
  ): Promise<{ text?: string; response?: { text: () => string }; tokensUsed?: number }> {
    let prompt: string;
    let workspaceId: string | undefined;
    let userId: string | undefined;
    let featureKey = 'ai_general';
    let temperature = 0.7;
    let maxTokens = 1024;

    if (typeof requestOrPrompt === 'string') {
      prompt = requestOrPrompt;
      workspaceId = options?.workspaceId;
      userId = options?.userId;
      if (options?.featureKey) featureKey = options.featureKey;
      if (options?.temperature) temperature = options.temperature;
      if (options?.maxTokens) maxTokens = options.maxTokens;
    } else {
      if (requestOrPrompt.contents) {
        prompt = requestOrPrompt.contents
          .map((c: any) => c.parts?.map((p: any) => p.text).join(' ') || '')
          .join('\n');
      } else {
        prompt = requestOrPrompt.prompt || '';
      }
      workspaceId = requestOrPrompt.workspaceId || options?.workspaceId;
      userId = requestOrPrompt.userId || options?.userId;
      featureKey = requestOrPrompt.featureKey || requestOrPrompt.purpose || 'ai_general';
      if (requestOrPrompt.generationConfig?.temperature) temperature = requestOrPrompt.generationConfig.temperature;
    }

    // @ts-expect-error — TS migration: fix in refactoring sprint
    const response = await this.generate({
      userMessage: prompt,
      workspaceId,
      userId,
      featureKey,
      temperature,
      maxTokens,
    });

    const responseText = response.text || '';
    return {
      text: responseText,
      response: { text: () => responseText },
      tokensUsed: response.tokensUsed,
    };
  }

  /**
   * UNIVERSAL GATE: generateDecision - metered wrapper for AI decision-making
   * Routes through credit enforcement so no AI tokens leak unbilled.
   */
  async generateDecision(
    prompt: string,
    context: { workspaceId?: string; userId?: string; purpose?: string } = {}
  ): Promise<{ text: string; tokensUsed: number }> {
    // @ts-expect-error — TS migration: fix in refactoring sprint
    const response = await this.generate({
      userMessage: prompt,
      workspaceId: context.workspaceId,
      userId: context.userId,
      featureKey: context.purpose || 'ai_decision',
      temperature: 0.3,
      maxTokens: 500,
    });

    return {
      text: response.text || '',
      tokensUsed: response.tokensUsed || 0,
    };
  }

  /**
   * Generate business insights with structured output
   */
  async generateBusinessInsight(params: {
    workspaceId: string;
    userId?: string;
    insightType: 'sales' | 'finance' | 'operations' | 'automation' | 'growth';
    context: any;
  }): Promise<GeminiResponse> {
    const systemPrompt = `You are CoAIleague Business Intelligence AI, an expert business analyst.
    
Your role is to provide actionable business insights that help organizations:
- Increase revenue and sales effectiveness
- Optimize financial operations and cash flow
- Improve workforce productivity and scheduling
- Identify automation opportunities to save time and money
- Accelerate business growth

Always provide:
1. Key metrics and trends
2. Specific, actionable recommendations
3. Estimated ROI or time savings
4. Priority ranking (high/medium/low)

Be data-driven, specific, and focus on measurable outcomes.
When relevant, suggest CoAIleague platform features that can help.`;

    const userMessage = `Generate ${params.insightType} insights based on this context:
${JSON.stringify(params.context, null, 2)}

Provide actionable recommendations with estimated impact.`;

    return this.generate({
      workspaceId: params.workspaceId,
      userId: params.userId,
      featureKey: `business_insight_${params.insightType}`,
      systemPrompt,
      userMessage,
      temperature: 0.5,
      enableToolCalling: true
    });
  }

  /**
   * Self-selling: Recommend platform features based on user needs
   */
  async generatePlatformRecommendation(params: {
    workspaceId: string;
    userId?: string;
    userNeed: string;
    currentPlan?: string;
    currentUsage?: any;
  }): Promise<GeminiResponse> {
    const systemPrompt = `You are CoAIleague Platform Advisor, helping users get the most from the platform.

CoAIleague Features by Tier:
- STARTER ($29/mo): Time tracking, basic scheduling, 5 employees, basic reports
- PROFESSIONAL ($79/mo): AI scheduling, payroll automation, invoicing, 25 employees, advanced analytics
- ENTERPRISE ($199/mo): Full AI Brain, predictive analytics, unlimited employees, custom integrations, dedicated support

Your role:
1. Understand what the user is trying to accomplish
2. Recommend the most relevant CoAIleague features
3. Explain how these features solve their specific problems
4. Suggest upgrade paths if current plan limits apply
5. Highlight ROI and time savings

Be helpful, not pushy. Focus on genuine value.`;

    const userMessage = `User need: ${params.userNeed}
Current plan: ${params.currentPlan || 'Unknown'}
Current usage: ${JSON.stringify(params.currentUsage || {}, null, 2)}

Recommend the best platform features to help this user.`;

    return this.generate({
      workspaceId: params.workspaceId,
      userId: params.userId,
      featureKey: 'platform_recommendation',
      systemPrompt,
      userMessage,
      temperature: 0.6
    });
  }

  /**
   * Generate FAQ answer and optionally update the FAQ database
   */
  async generateFAQResponse(params: {
    workspaceId?: string;
    userId?: string;
    question: string;
    existingFaqs?: Array<{ question: string; answer: string; score: number }>;
    shouldLearn?: boolean;
  }): Promise<GeminiResponse & { suggestedFAQ?: { question: string; answer: string; category: string } }> {
    const systemPrompt = `You are CoAIleague Support AI, providing helpful answers to user questions.

Available FAQs (use these first if relevant):
${params.existingFaqs?.map(f => `Q: ${f.question}\nA: ${f.answer}`).join('\n\n') || 'No FAQs available'}

Guidelines:
1. If an FAQ matches, use that answer (with personalization)
2. If no FAQ matches, provide a helpful, accurate answer
3. Be concise but complete
4. If you're unsure, suggest contacting human support
5. Always be friendly and professional`;

    const response = await this.generate({
      workspaceId: params.workspaceId,
      userId: params.userId,
      featureKey: 'faq_response',
      systemPrompt,
      userMessage: params.question,
      temperature: 0.5
    });

    // If learning is enabled and we generated a good answer, suggest FAQ entry
    let suggestedFAQ: { question: string; answer: string; category: string } | undefined;
    
    if (params.shouldLearn && response.text.length > 50) {
      suggestedFAQ = {
        question: params.question,
        answer: response.text,
        category: 'general' // Could be AI-categorized
      };
    }

    return {
      ...response,
      suggestedFAQ
    };
  }

  /**
   * Check if AI Brain is available
   */
  isAvailable(): boolean {
    return !!this.model;
  }

  /**
   * Generate vision response (for schedule migration, etc.)
   * Uses DIAGNOSTICS tier for image analysis (complex reasoning)
   */
  async generateVision(request: GeminiRequest & { imageData: string }): Promise<GeminiResponse> {
    if (!this.model) {
      throw new Error("Gemini API not configured");
    }

    const creditCheck = await this.enforceCreditPreCheck(request.workspaceId, request.userId, request.featureKey);
    if (!creditCheck.allowed) {
      return {
        text: creditCheck.errorMessage || 'Insufficient credits',
        tokensUsed: 0,
        metadata: { creditBlocked: true }
      };
    }

    try {
      const visionModel = genAI!.getGenerativeModel({ 
        model: GEMINI_MODELS.DIAGNOSTICS,
        generationConfig: {
          maxOutputTokens: ANTI_YAP_PRESETS.diagnostics.maxTokens,
          temperature: ANTI_YAP_PRESETS.diagnostics.temperature,
        }
      });
      
      const result = await visionModel.generateContent([ // withGemini
        request.systemPrompt + "\n\n" + request.userMessage,
        {
          inlineData: {
            data: request.imageData,
            mimeType: "image/png"
          }
        }
      ]);

      const response = result.response;
      const responseText = response.text();
      const usage = response.usageMetadata;
      const tokensUsed = (usage?.promptTokenCount || 0) + (usage?.candidatesTokenCount || 0);

      await this.enforceCreditDeduction(request.workspaceId, request.userId, request.featureKey);

      if (request.workspaceId && tokensUsed > 0) {
        import('../../billing/aiMeteringService').then(({ aiMeteringService }) => {
          aiMeteringService.recordAiCall({
            workspaceId: request.workspaceId!,
            modelName: GEMINI_MODELS.DIAGNOSTICS,
            callType: request.featureKey || 'gemini_vision',
            inputTokens: usage?.promptTokenCount ?? 0,
            outputTokens: usage?.candidatesTokenCount ?? 0,
            triggeredByUserId: request.userId,
          });
         }).catch((err: any) => log.warn('[AIMeter] recordAiCall failed (non-blocking):', err?.message));
      }

      return {
        text: responseText,
        tokensUsed
      };

    } catch (error: any) {
      log.error(`❌ [AI Brain] Vision error:`, error);
      throw new Error(`AI Brain vision failed: ${(error instanceof Error ? error.message : String(error))}`);
    }
  }

  /**
   * Get available AI Brain tools for client reference
   */
  getAvailableTools(): string[] {
    return AI_BRAIN_TOOLS.map(t => t.name);
  }

  // ============================================================================
  // TRINITY AI THOUGHT GENERATION - Real Gemini-Powered Mascot Thoughts
  // ============================================================================

  /**
   * Generate a quick AI thought for Trinity mascot
   * Uses anti-yapping preset for concise, personality-driven responses
   * 
   * @param request - Context for thought generation
   * @returns AI-generated thought string or null if unavailable
   */
  async generateTrinityThought(request: QuickThoughtRequest): Promise<string | null> {
    if (!genAI) {
      log.warn('[Trinity AI] Gemini not available for thought generation');
      return null;
    }

    const creditCheck = await this.enforceCreditPreCheck(request.workspaceId, undefined, 'trinity_thought');
    if (!creditCheck.allowed) {
      log.warn(`[Trinity AI] Credit check failed: ${creditCheck.errorMessage}`);
      return null;
    }

    try {
      // MODE-SPECIFIC TOKEN LIMITS: Lower for chit-chat, higher for technical modes
      // This reduces costs for casual conversations while maintaining quality for business/guru modes
      const modeTokenLimits: Record<string, number> = {
        demo: 80,      // Ultra-brief for demo/chit-chat - just friendly hellos
        business: 120, // Slightly more for business advice  
        guru: 200,     // More detailed for technical diagnostics
      };
      const modeTemperatures: Record<string, number> = {
        demo: 0.5,     // More predictable for chit-chat
        business: 0.6, // Balanced for business advice
        guru: 0.4,     // More precise for technical info
      };
      
      const maxTokens = modeTokenLimits[request.mode || 'demo'] || 80;
      const temperature = modeTemperatures[request.mode || 'demo'] || 0.5;
      
      const model = genAI.getGenerativeModel({ 
        model: GEMINI_MODELS.CONVERSATIONAL 
      });

      // Build persona-aware system prompt - CONCISE for each mode
      const modePrompts: Record<string, { role: string; style: string }> = {
        demo: {
          role: 'friendly platform guide giving a quick tip',
          style: 'One SHORT sentence. Be warm and welcoming. Focus on one helpful suggestion.',
        },
        business: {
          role: 'business advisor helping with workforce management',
          style: 'One to two brief sentences. Be actionable and data-focused. Mention specific metrics when available.',
        },
        guru: {
          role: 'technical expert assisting platform staff with diagnostics',
          style: 'Two sentences max. Be precise and technical. Include system status when relevant.',
        },
      };
      
      const modeConfig = modePrompts[request.mode || 'demo'];
      const greeting = request.displayName ? `${request.displayName}` : 'there';

      // STREAMLINED PROMPT - reduced token usage
      const systemPrompt = `You are Trinity, CoAIleague's AI assistant. Role: ${modeConfig.role}.

RULES:
- ${modeConfig.style}
- Address ${greeting} directly
- Never use emojis
- Never start with "I"
- Be concise - every word counts`;

      const userPrompt = `Context: ${request.context}

Generate ONE thought for ${greeting}:`;

      const result = await model.generateContent({ // withGemini
        contents: [{ role: 'user', parts: [{ text: userPrompt }] }],
        systemInstruction: systemPrompt,
        generationConfig: {
          maxOutputTokens: maxTokens,
          temperature: temperature,
        },
      });

      const response = result.response;
      const text = response.text().trim();
      const usage = response.usageMetadata;
      const tokensUsed = (usage?.promptTokenCount || 0) + (usage?.candidatesTokenCount || 0);

      log.info(`[Trinity AI] Generated thought (${tokensUsed} tokens): ${text.substring(0, 50)}...`);

      await this.enforceCreditDeduction(request.workspaceId, undefined, 'trinity_thought');

      if (request.workspaceId && tokensUsed > 0) {
        import('../../billing/aiMeteringService').then(({ aiMeteringService }) => {
          aiMeteringService.recordAiCall({
            workspaceId: request.workspaceId!,
            modelName: GEMINI_MODELS.CONVERSATIONAL,
            callType: 'trinity_thought',
            inputTokens: usage?.promptTokenCount ?? 0,
            outputTokens: usage?.candidatesTokenCount ?? 0,
          });
         }).catch((err: any) => log.warn('[AIMeter] recordAiCall failed (non-blocking):', err?.message));
      }

      return text || null;
    } catch (error: any) {
      log.error('[Trinity AI] Thought generation failed:', (error instanceof Error ? error.message : String(error)));
      return null;
    }
  }

  /**
   * Generate a quick status insight for dashboards
   * Uses simple preset for ultra-brief responses
   */
  async generateQuickInsight(topic: string, data: string, workspaceId?: string): Promise<string | null> {
    if (!genAI) return null;

    const creditCheck = await this.enforceCreditPreCheck(workspaceId, undefined, 'trinity_insight');
    if (!creditCheck.allowed) {
      return null;
    }

    try {
      const config = ANTI_YAP_PRESETS.simple;
      const model = genAI.getGenerativeModel({ 
        model: GEMINI_MODELS.SIMPLE 
      });

      const result = await model.generateContent({ // withGemini
        contents: [{ 
          role: 'user', 
          parts: [{ text: `One sentence insight about ${topic}: ${data}` }] 
        }],
        generationConfig: {
          maxOutputTokens: config.maxTokens,
          temperature: config.temperature,
        },
      });

      const insightUsage = result.response.usageMetadata;
      await this.enforceCreditDeduction(workspaceId, undefined, 'trinity_insight');

      if (workspaceId && ((insightUsage?.promptTokenCount ?? 0) + (insightUsage?.candidatesTokenCount ?? 0)) > 0) {
        import('../../billing/aiMeteringService').then(({ aiMeteringService }) => {
          aiMeteringService.recordAiCall({
            workspaceId: workspaceId!,
            modelName: GEMINI_MODELS.SIMPLE,
            callType: 'trinity_insight',
            inputTokens: insightUsage?.promptTokenCount ?? 0,
            outputTokens: insightUsage?.candidatesTokenCount ?? 0,
          });
         }).catch((err: any) => log.warn('[AIMeter] recordAiCall failed (non-blocking):', err?.message));
      }

      return result.response.text().trim() || null;
    } catch (error: any) {
      log.error('[AI Brain] Quick insight failed:', (error instanceof Error ? error.message : String(error)));
      return null;
    }
  }
}

// Export singleton instance - ONE brain for all features
export const geminiClient = new UnifiedGeminiClient();
