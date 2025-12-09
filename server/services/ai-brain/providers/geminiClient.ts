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

import { GoogleGenerativeAI, GenerativeModel, FunctionDeclarationsTool, FunctionDeclaration, SchemaType, Content, Part } from "@google/generative-ai";
import { usageMeteringService } from '../../billing/usageMetering';
import { aiGuardRails, type AIRequestContext } from '../../aiGuardRails';
import { db } from '../../../db';
import { helposFaqs, supportTickets, workspaces, employees, shifts, invoices, payrollRuns } from '@shared/schema';
import { eq, ilike, or, desc, sql, and, gte, lte, count } from 'drizzle-orm';

const apiKey = process.env.GEMINI_API_KEY;

if (!apiKey) {
  console.warn("⚠️ GEMINI_API_KEY not found - AI Brain features will be disabled");
}

const genAI = apiKey ? new GoogleGenerativeAI(apiKey) : null;

// ============================================================================
// TIERED MODEL ARCHITECTURE - Right Intelligence for Right Task
// ============================================================================

/**
 * GEMINI MODEL TIERS
 * 
 * Tier 1 (Pro): Complex reasoning, diagnostics, orchestration, code analysis
 * Tier 2 (Flash): Conversational agents, Trinity thoughts, supervisors  
 * Tier 3 (Lite): Simple status checks, quick lookups, routine tasks
 * 
 * Model selection rationale:
 * - gemini-2.5-pro: Full Pro model for complex orchestration and diagnostics
 * - gemini-2.5-flash: Fast flash model for conversational AI and supervisors
 * - gemini-2.0-flash-exp: Experimental flash for creative mascot thoughts
 * - gemini-1.5-flash-8b: Lightweight for simple/fast tasks
 */
export const GEMINI_MODELS = {
  // Tier 1: Maximum intelligence for complex tasks (Pro-level reasoning)
  ORCHESTRATOR: 'gemini-2.5-pro',       // Master orchestration, function calling
  ARCHITECT: 'gemini-2.5-pro',          // Deep code analysis and diagnostics  
  DIAGNOSTICS: 'gemini-2.5-pro',        // System health and debugging
  
  // Tier 2: Balanced speed + intelligence for conversational use
  CONVERSATIONAL: 'gemini-2.0-flash-exp',  // Trinity mascot thoughts (fast + creative)
  SUPERVISOR: 'gemini-2.5-flash',          // Subagent supervisors (needs reasoning)
  HELLOS: 'gemini-2.5-flash',              // HelpAI chat responses
  
  // Tier 3: Fast and efficient for simple tasks
  SIMPLE: 'gemini-1.5-flash-8b',        // Quick status checks (ultra-fast)
  NOTIFICATION: 'gemini-1.5-flash-8b',  // Notification generation
  LOOKUP: 'gemini-1.5-flash-8b',        // FAQ and data lookups
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
  mascot: {
    maxTokens: 150,
    temperature: 0.6,
    thinkingLevel: 'low' as ThinkingLevel,
    systemPromptSuffix: 'Be concise and direct. Maximum 1-2 sentences. No flowery language.',
  },
  
  // Supervisor responses: Moderate detail, action-oriented
  supervisor: {
    maxTokens: 300,
    temperature: 0.5,
    thinkingLevel: 'low' as ThinkingLevel,
    systemPromptSuffix: 'Be actionable and focused. Use bullet points when listing.',
  },
  
  // HelpAI chat: Conversational but efficient
  helpai: {
    maxTokens: 500,
    temperature: 0.7,
    thinkingLevel: 'low' as ThinkingLevel,
    systemPromptSuffix: 'Be helpful but concise. Answer directly, then offer to elaborate if needed.',
  },
  
  // Orchestrator: Complex reasoning, allow more depth
  orchestrator: {
    maxTokens: 1000,
    temperature: 0.7,
    thinkingLevel: 'high' as ThinkingLevel,
    systemPromptSuffix: 'Analyze thoroughly. Provide structured reasoning when complex.',
  },
  
  // Diagnostics: Detailed analysis, full reasoning
  diagnostics: {
    maxTokens: 2000,
    temperature: 0.3,
    thinkingLevel: 'high' as ThinkingLevel,
    systemPromptSuffix: 'Provide detailed technical analysis with root cause identification.',
  },
  
  // Simple responses: Ultra-brief, status-oriented
  simple: {
    maxTokens: 100,
    temperature: 0.3,
    thinkingLevel: 'none' as ThinkingLevel,
    systemPromptSuffix: 'One sentence maximum. Facts only.',
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
 * Build generation config with anti-yapping controls
 * Converts preset configuration into Gemini API-compatible format
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
    // Thinking budget helps control verbosity by limiting internal reasoning
    thinkingBudget: thinkingBudgets[config.thinkingLevel],
    systemPromptSuffix: config.systemPromptSuffix,
  };
}

/**
 * Create a configured model instance with anti-yapping settings
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
      ...(additionalConfig?.responseMimeType && { responseMimeType: additionalConfig.responseMimeType }),
    },
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
  // NEW: Tiered architecture support
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

/**
 * Execute a Gemini function call and return the result
 * This is Step 4 of the 8-step function calling workflow
 */
async function executeToolCall(
  toolName: string,
  args: Record<string, any>,
  context: ToolExecutionContext
): Promise<ToolResult> {
  console.log(`🔧 [AI Brain] Executing tool: ${toolName}`, args);
  
  try {
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
      
      default:
        return {
          success: false,
          data: null,
          error: `Unknown tool: ${toolName}`
        };
    }
  } catch (error: any) {
    console.error(`❌ [AI Brain] Tool execution failed for ${toolName}:`, error);
    return {
      success: false,
      data: null,
      error: error.message || 'Tool execution failed'
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
    
    console.log(`✅ [AI Brain] Found ${results.length} FAQs for query: "${args.query}"`);
    
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
      error: `FAQ search failed: ${error.message}`
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
    
    const ticketNumber = `TKT-${Date.now().toString(36).toUpperCase()}-${Math.random().toString(36).substring(2, 6).toUpperCase()}`;
    
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
    
    console.log(`✅ [AI Brain] Created support ticket: ${ticketNumber}`);
    
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
      error: `Failed to create support ticket: ${error.message}`
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
            totalRevenue: sql<number>`COALESCE(SUM(CAST(total_amount AS DECIMAL)), 0)`,
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
    
    console.log(`✅ [AI Brain] Generated ${args.insightType} insights`);
    
    return {
      success: true,
      data: insights
    };
  } catch (error: any) {
    return {
      success: false,
      data: null,
      error: `Failed to generate insights: ${error.message}`
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
      feature: 'OperationsOS™ Smart Scheduling',
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
      feature: 'CoAIleague Platform',
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
      
      console.log(`✅ [AI Brain] Updated existing FAQ: ${existingFaq[0].id}`);
      
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
        question: args.question,
        answer: args.answer,
        category: args.category || 'general',
        tags: tagsArray,
        isPublished: false,
        viewCount: 0,
        helpfulCount: 0,
        notHelpfulCount: 0,
      }).returning();
      
      console.log(`✅ [AI Brain] Created new FAQ: ${newFaq.id}`);
      
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
      error: `Failed to update FAQ: ${error.message}`
    };
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
    // Use HELLOS tier for general chat/conversation
    this.model = genAI ? genAI.getGenerativeModel({ 
      model: GEMINI_MODELS.HELLOS,
      generationConfig: {
        maxOutputTokens: ANTI_YAP_PRESETS.helpai.maxTokens,
        temperature: ANTI_YAP_PRESETS.helpai.temperature,
      }
    }) : null;
    
    // Use ORCHESTRATOR tier for tool-calling (complex reasoning)
    this.toolsModel = genAI ? genAI.getGenerativeModel({
      model: GEMINI_MODELS.ORCHESTRATOR,
      tools: [{ functionDeclarations: AI_BRAIN_TOOLS }],
      generationConfig: {
        maxOutputTokens: ANTI_YAP_PRESETS.orchestrator.maxTokens,
        temperature: ANTI_YAP_PRESETS.orchestrator.temperature,
      }
    }) : null;

    // Use SUPERVISOR tier for JSON Mode structured output
    this.jsonModel = genAI ? genAI.getGenerativeModel({
      model: GEMINI_MODELS.SUPERVISOR,
      generationConfig: {
        responseMimeType: "application/json",
        maxOutputTokens: ANTI_YAP_PRESETS.supervisor.maxTokens,
        temperature: ANTI_YAP_PRESETS.supervisor.temperature,
      }
    }) : null;
    
    console.log('[AI Brain] UnifiedGeminiClient initialized with tiered architecture');
  }

  /**
   * Generate structured JSON output for agent tasks
   * Use this for agents that need to return data for database updates
   */
  async generateJSON<T = any>(request: GeminiRequest & { jsonSchema?: string }): Promise<{ data: T | null; tokensUsed: number; error?: string }> {
    if (!this.jsonModel) {
      return { data: null, tokensUsed: 0, error: "JSON model not available" };
    }

    const requestContext: AIRequestContext = {
      workspaceId: request.workspaceId || 'unknown',
      userId: request.userId || 'unknown',
      organizationId: 'platform',
      requestId: Math.random().toString(36).substring(7),
      timestamp: new Date(),
      operation: request.featureKey
    };

    try {
      const schemaInstruction = request.jsonSchema 
        ? `\n\nRespond with valid JSON matching this schema: ${request.jsonSchema}` 
        : '\n\nRespond with valid JSON only.';
      
      const result = await this.jsonModel.generateContent(request.systemPrompt + schemaInstruction + "\n\nUser: " + request.userMessage);
      const response = result.response;
      const text = response.text();
      const tokensUsed = (response.usageMetadata?.promptTokenCount || 0) + (response.usageMetadata?.candidatesTokenCount || 0);

      try {
        const data = JSON.parse(text) as T;
        return { data, tokensUsed };
      } catch {
        return { data: null, tokensUsed, error: "Failed to parse JSON response" };
      }
    } catch (error: any) {
      return { data: null, tokensUsed: 0, error: error.message };
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

    const requestContext: AIRequestContext = {
      workspaceId: request.workspaceId || 'unknown',
      userId: request.userId || 'unknown',
      organizationId: 'platform',
      requestId: Math.random().toString(36).substring(7),
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
      console.log(`🧠 [AI Brain] Processing ${request.featureKey} request with 8-step workflow`);
      
      const history = (request.conversationHistory || []).map(msg => ({
        role: msg.role === 'user' ? 'user' as const : 'model' as const,
        parts: [{ text: msg.content }]
      }));

      // STEP 2: Use tools model if tool calling enabled
      const modelToUse = request.enableToolCalling ? this.toolsModel : this.model;
      if (!modelToUse) throw new Error("Model not available");

      const chat = modelToUse.startChat({
        history: history,
        generationConfig: {
          maxOutputTokens: request.maxTokens || 2048,
          temperature: request.temperature || 0.7,
        },
      });

      let totalTokensUsed = 0;
      let attempts = 0;
      const maxAttempts = 3;
      const maxToolIterations = 5; // Prevent infinite loops
      let lastError: Error | null = null;

      while (attempts < maxAttempts) {
        try {
          // STEP 2: Send initial message to Gemini with tools
          let result = await chat.sendMessage(validation.sanitizedInput);
          let response = result.response;
          
          // Track tokens
          const initialUsage = response.usageMetadata;
          totalTokensUsed += (initialUsage?.promptTokenCount || 0) + (initialUsage?.candidatesTokenCount || 0);

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
            console.log(`🔄 [AI Brain] Tool iteration ${toolIterations}: ${functionCalls.length} function call(s) to execute`);

            // STEP 4: Execute each tool and collect results
            const toolResults: Array<{ name: string; response: any }> = [];
            
            for (const fc of functionCalls) {
              console.log(`🔧 [AI Brain] Executing tool: ${fc.name}`);
              
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
              
              console.log(`✅ [AI Brain] Tool ${fc.name} completed:`, toolResult.success ? 'success' : 'failed');
            }

            // STEP 5: Send tool results back to Gemini
            // Build the function response parts
            const functionResponseParts: Part[] = toolResults.map(tr => ({
              functionResponse: {
                name: tr.name,
                response: tr.response
              }
            }));

            console.log(`📤 [AI Brain] Sending ${toolResults.length} tool result(s) back to Gemini`);
            
            // STEP 6: Send results and get next response
            result = await chat.sendMessage(functionResponseParts);
            response = result.response;
            
            // Track additional tokens
            const iterationUsage = response.usageMetadata;
            totalTokensUsed += (iterationUsage?.promptTokenCount || 0) + (iterationUsage?.candidatesTokenCount || 0);

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
              console.log(`✨ [AI Brain] Multi-turn loop complete after ${toolIterations} iteration(s)`);
            } else if (toolIterations >= maxToolIterations) {
              console.warn(`⚠️ [AI Brain] Max tool iterations (${maxToolIterations}) reached, forcing final response`);
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

          // Record usage
          if (totalTokensUsed > 0 && request.workspaceId) {
            await usageMeteringService.recordUsage({
              workspaceId: request.workspaceId,
              userId: request.userId,
              featureKey: request.featureKey,
              usageType: 'token',
              usageAmount: totalTokensUsed,
              usageUnit: 'tokens',
              activityType: 'ai_brain_inference',
              metadata: {
                model: 'gemini-2.0-flash-exp',
                feature: request.featureKey,
                toolsExecuted: allFunctionCalls.length,
                toolIterations: toolIterations,
                hasFunctionCalls: allFunctionCalls.length > 0
              }
            });
            
            console.log(`💰 [AI Brain] ${request.featureKey} - ${totalTokensUsed} tokens billed (${allFunctionCalls.length} tools executed)`);
          }

          // Log operation
          aiGuardRails.logAIOperation(requestContext, validation.sanitizedInput, responseText, {
            success: true,
            creditsUsed: validation.estimatedCredits,
            tokensUsed: totalTokensUsed,
            duration: Date.now() - requestContext.timestamp.getTime()
          });

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
              model: 'gemini-2.0-flash-exp',
              timestamp: new Date().toISOString(),
              attempts: attempts + 1,
              toolIterations: toolIterations,
              workflowComplete: true
            }
          };

        } catch (error: any) {
          attempts++;
          lastError = error;
          console.warn(`⚠️ [AI Brain] Attempt ${attempts}/${maxAttempts} failed:`, error.message);
          
          if (attempts >= maxAttempts) break;
          
          // Wait before retry
          await new Promise(resolve => setTimeout(resolve, 1000 * attempts));
        }
      }

      throw lastError || new Error('All retry attempts failed');

    } catch (error: any) {
      console.error(`❌ [AI Brain] Gemini error for ${request.featureKey}:`, error);
      throw new Error(`AI Brain inference failed: ${error.message || 'Unknown error'}`);
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

    try {
      const visionModel = genAI!.getGenerativeModel({ 
        model: GEMINI_MODELS.DIAGNOSTICS,
        generationConfig: {
          maxOutputTokens: ANTI_YAP_PRESETS.diagnostics.maxTokens,
          temperature: ANTI_YAP_PRESETS.diagnostics.temperature,
        }
      });
      
      const result = await visionModel.generateContent([
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

      if (tokensUsed > 0 && request.workspaceId) {
        await usageMeteringService.recordUsage({
          workspaceId: request.workspaceId,
          userId: request.userId,
          featureKey: request.featureKey,
          usageType: 'token',
          usageAmount: tokensUsed,
          usageUnit: 'tokens',
          activityType: 'ai_brain_vision',
          metadata: {
            model: GEMINI_MODELS.DIAGNOSTICS,
            hasImage: true
          }
        });
      }

      return {
        text: responseText,
        tokensUsed
      };

    } catch (error: any) {
      console.error(`❌ [AI Brain] Vision error:`, error);
      throw new Error(`AI Brain vision failed: ${error.message}`);
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
      console.warn('[Trinity AI] Gemini not available for thought generation');
      return null;
    }

    try {
      const config = ANTI_YAP_PRESETS.mascot;
      const model = genAI.getGenerativeModel({ 
        model: GEMINI_MODELS.CONVERSATIONAL 
      });

      // Build persona-aware system prompt
      const modeDescriptions: Record<string, string> = {
        demo: 'You are showcasing CoAIleague platform capabilities to a potential customer.',
        business: 'You are advising a business owner using the platform for workforce management.',
        guru: 'You are assisting platform staff with system diagnostics and administration.',
      };

      const modeContext = modeDescriptions[request.mode || 'demo'];
      const greeting = request.displayName ? `${request.displayName}` : 'there';

      const systemPrompt = `You are Trinity, the friendly and insightful AI mascot of CoAIleague, an AI-powered workforce management platform.

Your personality:
- Warm, helpful, and genuinely interested in the user's success
- Confident but not arrogant - you're a trusted advisor, not a know-it-all
- Occasionally witty but always professional
- You speak directly to the user by name when provided

Current mode: ${modeContext}

CRITICAL RULES:
- Maximum 1-2 short sentences
- Be specific and actionable when possible
- Never use emojis
- Never start with "I" - address the user directly
- Vary your language - don't repeat the same phrases
- ${config.systemPromptSuffix}`;

      const userPrompt = `Generate a single contextual thought for ${greeting} based on this context:
${request.context}

Your response should feel natural, like a quick aside from a helpful colleague. One thought only.`;

      const result = await model.generateContent({
        contents: [{ role: 'user', parts: [{ text: userPrompt }] }],
        systemInstruction: systemPrompt,
        generationConfig: {
          maxOutputTokens: config.maxTokens,
          temperature: config.temperature,
        },
      });

      const response = result.response;
      const text = response.text().trim();
      const usage = response.usageMetadata;
      const tokensUsed = (usage?.promptTokenCount || 0) + (usage?.candidatesTokenCount || 0);

      console.log(`[Trinity AI] Generated thought (${tokensUsed} tokens): ${text.substring(0, 50)}...`);

      // Record usage for billing
      if (tokensUsed > 0 && request.workspaceId) {
        await usageMeteringService.recordUsage({
          workspaceId: request.workspaceId,
          userId: undefined,
          featureKey: 'trinity_thought',
          usageType: 'token',
          usageAmount: tokensUsed,
          usageUnit: 'tokens',
          activityType: 'ai_brain_thought',
          metadata: {
            model: GEMINI_MODELS.CONVERSATIONAL,
            mode: request.mode || 'demo',
            preset: 'mascot'
          }
        });
      }

      return text || null;
    } catch (error: any) {
      console.error('[Trinity AI] Thought generation failed:', error.message);
      return null;
    }
  }

  /**
   * Generate a quick status insight for dashboards
   * Uses simple preset for ultra-brief responses
   */
  async generateQuickInsight(topic: string, data: string): Promise<string | null> {
    if (!genAI) return null;

    try {
      const config = ANTI_YAP_PRESETS.simple;
      const model = genAI.getGenerativeModel({ 
        model: GEMINI_MODELS.SIMPLE 
      });

      const result = await model.generateContent({
        contents: [{ 
          role: 'user', 
          parts: [{ text: `One sentence insight about ${topic}: ${data}` }] 
        }],
        generationConfig: {
          maxOutputTokens: config.maxTokens,
          temperature: config.temperature,
        },
      });

      return result.response.text().trim() || null;
    } catch (error: any) {
      console.error('[AI Brain] Quick insight failed:', error.message);
      return null;
    }
  }
}

// Export singleton instance - ONE brain for all features
export const geminiClient = new UnifiedGeminiClient();
