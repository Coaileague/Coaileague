/**
 * GEMINI TOOL SCHEMA GENERATOR
 * ============================
 * 
 * Bridges the gap between Platform Action Hub actions and Gemini Function Calling.
 * Automatically generates FunctionDeclaration schemas from registered actions,
 * enabling Gemini to orchestrate the ENTIRE platform.
 * 
 * This is the missing link that connects:
 * - 61+ Platform Action Hub actions
 * - Gemini's function calling capability
 * - End-user natural language requests
 */

import { FunctionDeclaration, SchemaType, FunctionDeclarationsTool } from "@google/generative-ai";
import { helpaiOrchestrator, type ActionHandler, type ActionCategory } from '../helpai/platformActionHub';
import { createLogger } from '../../lib/logger';
const log = createLogger('geminiToolSchemaGenerator');

// ============================================================================
// TOOL CATEGORY DEFINITIONS
// ============================================================================

export type ToolMode = 'ANY' | 'AUTO' | 'NONE';

export interface ToolSelectionConfig {
  mode: ToolMode;
  allowedCategories?: ActionCategory[];
  maxTools?: number;
}

// Parameter schemas for common action types
const COMMON_PARAMETER_SCHEMAS: Record<string, any> = {
  workspaceId: { type: SchemaType.STRING, description: "Workspace ID for the operation" },
  userId: { type: SchemaType.STRING, description: "User ID performing the action" },
  employeeId: { type: SchemaType.STRING, description: "Target employee ID" },
  shiftId: { type: SchemaType.STRING, description: "Shift ID" },
  invoiceId: { type: SchemaType.STRING, description: "Invoice ID" },
  startDate: { type: SchemaType.STRING, description: "Start date (ISO format)" },
  endDate: { type: SchemaType.STRING, description: "End date (ISO format)" },
  limit: { type: SchemaType.NUMBER, description: "Maximum number of results" },
  status: { type: SchemaType.STRING, description: "Status filter" },
  priority: { type: SchemaType.STRING, description: "Priority level (low, normal, high, critical)" },
  message: { type: SchemaType.STRING, description: "Message content" },
  reason: { type: SchemaType.STRING, description: "Reason for the action" },
};

// Category-specific parameter mappings
// @ts-expect-error — TS migration: fix in refactoring sprint
const CATEGORY_PARAMETER_SCHEMAS: Record<ActionCategory, Record<string, any>> = {
  scheduling: {
    shiftId: COMMON_PARAMETER_SCHEMAS.shiftId,
    employeeId: COMMON_PARAMETER_SCHEMAS.employeeId,
    startDate: COMMON_PARAMETER_SCHEMAS.startDate,
    endDate: COMMON_PARAMETER_SCHEMAS.endDate,
    shiftType: { type: SchemaType.STRING, description: "Type of shift" },
    location: { type: SchemaType.STRING, description: "Work location" },
  },
  payroll: {
    employeeId: COMMON_PARAMETER_SCHEMAS.employeeId,
    periodStart: { type: SchemaType.STRING, description: "Payroll period start date" },
    periodEnd: { type: SchemaType.STRING, description: "Payroll period end date" },
    amount: { type: SchemaType.NUMBER, description: "Payment amount" },
    payrollRunId: { type: SchemaType.STRING, description: "Payroll run ID" },
  },
  invoicing: {
    invoiceId: COMMON_PARAMETER_SCHEMAS.invoiceId,
    clientId: { type: SchemaType.STRING, description: "Client ID" },
    amount: { type: SchemaType.NUMBER, description: "Invoice amount" },
    dueDate: { type: SchemaType.STRING, description: "Payment due date" },
  },
  notifications: {
    recipientId: { type: SchemaType.STRING, description: "Notification recipient user ID" },
    title: { type: SchemaType.STRING, description: "Notification title" },
    message: COMMON_PARAMETER_SCHEMAS.message,
    type: { type: SchemaType.STRING, description: "Notification type" },
  },
  health_check: {
    serviceName: { type: SchemaType.STRING, description: "Service name to check" },
    includeDetails: { type: SchemaType.BOOLEAN, description: "Include detailed metrics" },
  },
  system: {
    serviceName: { type: SchemaType.STRING, description: "Target service name" },
    featurePath: { type: SchemaType.STRING, description: "Feature toggle path" },
    enabled: { type: SchemaType.BOOLEAN, description: "Enable or disable" },
    reason: COMMON_PARAMETER_SCHEMAS.reason,
  },
  support: {
    ticketId: { type: SchemaType.STRING, description: "Support ticket ID" },
    subject: { type: SchemaType.STRING, description: "Ticket subject" },
    description: { type: SchemaType.STRING, description: "Issue description" },
    priority: COMMON_PARAMETER_SCHEMAS.priority,
  },
  analytics: {
    metric: { type: SchemaType.STRING, description: "Metric to analyze" },
    timeframe: { type: SchemaType.STRING, description: "Analysis timeframe (day, week, month)" },
    groupBy: { type: SchemaType.STRING, description: "Grouping dimension" },
  },
  integration: {
    integrationName: { type: SchemaType.STRING, description: "Integration name" },
    credentials: { type: SchemaType.STRING, description: "Credential identifier" },
  },
  test: {
    testName: { type: SchemaType.STRING, description: "Test name to run" },
    testCategory: { type: SchemaType.STRING, description: "Test category" },
  },
  compliance: {
    employeeId: COMMON_PARAMETER_SCHEMAS.employeeId,
    certificationType: { type: SchemaType.STRING, description: "Certification type" },
    expiryDate: { type: SchemaType.STRING, description: "Certification expiry date" },
  },
  gamification: {
    userId: COMMON_PARAMETER_SCHEMAS.userId,
    achievementId: { type: SchemaType.STRING, description: "Achievement ID" },
    points: { type: SchemaType.NUMBER, description: "Points to award" },
  },
  automation: {
    jobName: { type: SchemaType.STRING, description: "Automation job name" },
    schedule: { type: SchemaType.STRING, description: "Cron schedule expression" },
    enabled: { type: SchemaType.BOOLEAN, description: "Enable or disable job" },
  },
  communication: {
    roomId: { type: SchemaType.STRING, description: "Chat room ID" },
    message: COMMON_PARAMETER_SCHEMAS.message,
    recipientIds: { type: SchemaType.STRING, description: "Comma-separated recipient IDs" },
  },
  health: {
    checkType: { type: SchemaType.STRING, description: "Health check type" },
    threshold: { type: SchemaType.NUMBER, description: "Alert threshold" },
  },
  user_assistance: {
    query: { type: SchemaType.STRING, description: "User's question or request" },
    context: { type: SchemaType.STRING, description: "Current page or context" },
  },
  lifecycle: {
    employeeId: COMMON_PARAMETER_SCHEMAS.employeeId,
    eventType: { type: SchemaType.STRING, description: "Lifecycle event type" },
    effectiveDate: { type: SchemaType.STRING, description: "Event effective date" },
  },
  escalation: {
    issueId: { type: SchemaType.STRING, description: "Issue ID to escalate" },
    severity: { type: SchemaType.STRING, description: "Escalation severity" },
    assignTo: { type: SchemaType.STRING, description: "Assign to user or team" },
  },
};

// ============================================================================
// SCHEMA GENERATOR CLASS
// ============================================================================

class GeminiToolSchemaGenerator {
  private static instance: GeminiToolSchemaGenerator;
  private generatedSchemas: Map<string, FunctionDeclaration> = new Map();
  private initialized = false;

  static getInstance(): GeminiToolSchemaGenerator {
    if (!this.instance) {
      this.instance = new GeminiToolSchemaGenerator();
    }
    return this.instance;
  }

  /**
   * Generate FunctionDeclaration schemas from all registered HelpAI actions
   */
  async generateSchemas(): Promise<FunctionDeclaration[]> {
    if (this.initialized && this.generatedSchemas.size > 0) {
      return Array.from(this.generatedSchemas.values());
    }

    const registeredActions = helpaiOrchestrator.getRegisteredActions();
    log.info(`[Gemini Tool Schema] Generating schemas for ${registeredActions.length} actions`);

    for (const action of registeredActions) {
      const schema = this.actionToFunctionDeclaration(action);
      if (schema) {
        this.generatedSchemas.set(action.actionId, schema);
      }
    }

    this.initialized = true;
    log.info(`[Gemini Tool Schema] Generated ${this.generatedSchemas.size} function declarations`);
    
    return Array.from(this.generatedSchemas.values());
  }

  /**
   * Get schemas filtered by category
   */
  getSchemasByCategory(categories: ActionCategory[]): FunctionDeclaration[] {
    const allSchemas = Array.from(this.generatedSchemas.values());
    
    if (!categories || categories.length === 0) {
      return allSchemas;
    }

    return allSchemas.filter(schema => {
      const actionId = schema.name;
      const action = helpaiOrchestrator.getAction(actionId);
      return action && categories.includes(action.category);
    });
  }

  /**
   * Build a FunctionDeclarationsTool for Gemini
   */
  buildToolset(config?: ToolSelectionConfig): FunctionDeclarationsTool {
    let schemas: FunctionDeclaration[];

    if (config?.allowedCategories) {
      schemas = this.getSchemasByCategory(config.allowedCategories);
    } else {
      schemas = Array.from(this.generatedSchemas.values());
    }

    if (config?.maxTools && schemas.length > config.maxTools) {
      schemas = schemas.slice(0, config.maxTools);
    }

    return {
      functionDeclarations: schemas,
    };
  }

  /**
   * Convert a single ActionHandler to a Gemini FunctionDeclaration
   */
  private actionToFunctionDeclaration(action: ActionHandler): FunctionDeclaration | null {
    try {
      const categoryParams = CATEGORY_PARAMETER_SCHEMAS[action.category] || {};
      
      // Build parameter schema based on action category and name
      const properties: Record<string, any> = {
        workspaceId: {
          type: SchemaType.STRING,
          description: "Workspace ID (optional, uses current context if not provided)",
        },
      };

      // Add category-specific parameters
      Object.entries(categoryParams).forEach(([key, schema]) => {
        properties[key] = schema;
      });

      // Infer additional parameters from action name
      const additionalParams = this.inferParametersFromActionName(action.actionId, action.name);
      Object.entries(additionalParams).forEach(([key, schema]) => {
        if (!properties[key]) {
          properties[key] = schema;
        }
      });

      // Determine required fields
      const required = this.inferRequiredFields(action.actionId, action.category);

      const declaration: FunctionDeclaration = {
        name: action.actionId.replace(/\./g, '_'), // Gemini doesn't like dots in function names
        description: action.description || `Execute ${action.name}`,
        parameters: {
          type: SchemaType.OBJECT,
          properties,
          required: required.length > 0 ? required : undefined,
        },
      };

      return declaration;
    } catch (error) {
      log.error(`[Gemini Tool Schema] Failed to generate schema for ${action.actionId}:`, error);
      return null;
    }
  }

  /**
   * Infer parameters based on action name patterns
   */
  private inferParametersFromActionName(actionId: string, actionName: string): Record<string, any> {
    const params: Record<string, any> = {};
    const lowerName = actionName.toLowerCase();
    const lowerId = actionId.toLowerCase();

    // Employee-related actions
    if (lowerName.includes('employee') || lowerId.includes('employee')) {
      params.employeeId = COMMON_PARAMETER_SCHEMAS.employeeId;
    }

    // Shift-related actions
    if (lowerName.includes('shift') || lowerName.includes('schedule')) {
      params.shiftId = COMMON_PARAMETER_SCHEMAS.shiftId;
      params.startDate = COMMON_PARAMETER_SCHEMAS.startDate;
      params.endDate = COMMON_PARAMETER_SCHEMAS.endDate;
    }

    // Invoice-related actions
    if (lowerName.includes('invoice') || lowerName.includes('billing')) {
      params.invoiceId = COMMON_PARAMETER_SCHEMAS.invoiceId;
    }

    // Date range actions
    if (lowerName.includes('report') || lowerName.includes('summary') || lowerName.includes('analytics')) {
      params.startDate = COMMON_PARAMETER_SCHEMAS.startDate;
      params.endDate = COMMON_PARAMETER_SCHEMAS.endDate;
    }

    // List/search actions
    if (lowerName.includes('list') || lowerName.includes('search') || lowerName.includes('get all')) {
      params.limit = COMMON_PARAMETER_SCHEMAS.limit;
      params.status = COMMON_PARAMETER_SCHEMAS.status;
    }

    // Notification actions
    if (lowerName.includes('notify') || lowerName.includes('alert') || lowerName.includes('send')) {
      params.message = COMMON_PARAMETER_SCHEMAS.message;
    }

    return params;
  }

  /**
   * Infer required fields based on action category and type
   */
  private inferRequiredFields(actionId: string, category: ActionCategory): string[] {
    const required: string[] = [];
    const lowerId = actionId.toLowerCase();

    // Actions targeting specific entities need IDs
    if (lowerId.includes('update') || lowerId.includes('delete') || lowerId.includes('get_')) {
      if (lowerId.includes('employee')) required.push('employeeId');
      if (lowerId.includes('shift')) required.push('shiftId');
      if (lowerId.includes('invoice')) required.push('invoiceId');
      if (lowerId.includes('payroll_run')) required.push('payrollRunId');
    }

    // Create actions need core fields
    if (lowerId.includes('create')) {
      if (category === 'scheduling') {
        required.push('employeeId', 'startDate');
      }
      if (category === 'notifications') {
        required.push('message');
      }
    }

    return required;
  }

  /**
   * Get a specific schema by action ID
   */
  getSchema(actionId: string): FunctionDeclaration | undefined {
    const normalizedId = actionId.replace(/\./g, '_');
    return this.generatedSchemas.get(actionId) || 
           Array.from(this.generatedSchemas.values()).find(s => s.name === normalizedId);
  }

  /**
   * Check if schemas have been generated
   */
  isReady(): boolean {
    return this.initialized && this.generatedSchemas.size > 0;
  }

  /**
   * Get count of generated schemas
   */
  getSchemaCount(): number {
    return this.generatedSchemas.size;
  }
}

// ============================================================================
// EXPORTS
// ============================================================================

export const geminiToolSchemaGenerator = GeminiToolSchemaGenerator.getInstance();

export {
  GeminiToolSchemaGenerator,
  COMMON_PARAMETER_SCHEMAS,
  CATEGORY_PARAMETER_SCHEMAS,
};
