/**
 * GEMINI TOOL EXECUTION BRIDGE
 * ============================
 * 
 * Routes Gemini function calls to Platform Action Hub actions.
 * This completes the 8-step function calling loop:
 * 
 * Steps 1-3: User prompt → Gemini → Function calls (handled by geminiClient.ts)
 * Step 4: THIS BRIDGE - Execute actions through Platform Action Hub
 * Steps 5-8: Results back to Gemini → Final response (handled by geminiClient.ts)
 */

import { helpaiOrchestrator, type ActionRequest, type ActionResult } from '../helpai/helpaiActionOrchestrator';
import { geminiToolSchemaGenerator } from './geminiToolSchemaGenerator';

export interface ToolExecutionContext {
  workspaceId?: string;
  userId: string;
  userRole: string;
  conversationId?: string;
  sessionId?: string;
}

export interface ToolExecutionResult {
  success: boolean;
  toolName: string;
  actionId: string;
  result: any;
  error?: string;
  executionTimeMs: number;
  conversationId?: string;
}

/**
 * Validate and transform Gemini args to match action's expected schema
 */
function transformArgsForAction(
  actionId: string,
  args: Record<string, any>,
  context: ToolExecutionContext
): Record<string, any> {
  // Inject standard context fields that actions expect
  const transformedArgs: Record<string, any> = {
    ...args,
    workspaceId: args.workspaceId || context.workspaceId,
    userId: context.userId,
    userRole: context.userRole,
  };

  // Add conversation context for tracing
  if (context.conversationId) {
    transformedArgs.conversationId = context.conversationId;
  }
  if (context.sessionId) {
    transformedArgs.sessionId = context.sessionId;
  }

  // Handle action-specific transformations
  const actionCategory = actionId.split('.')[0];
  
  switch (actionCategory) {
    case 'scheduling':
      // Ensure date fields are properly formatted
      if (transformedArgs.startDate && typeof transformedArgs.startDate === 'string') {
        transformedArgs.startDate = new Date(transformedArgs.startDate);
      }
      if (transformedArgs.endDate && typeof transformedArgs.endDate === 'string') {
        transformedArgs.endDate = new Date(transformedArgs.endDate);
      }
      break;
      
    case 'payroll':
      // Ensure payrollRunId is present for payroll operations
      if (!transformedArgs.payrollRunId && actionId !== 'payroll.bulk_process') {
        console.warn(`[Tool Bridge] Payroll action ${actionId} may require payrollRunId`);
      }
      break;
      
    case 'compliance':
      // Compliance actions typically need workspace context
      if (!transformedArgs.workspaceId) {
        console.warn(`[Tool Bridge] Compliance action ${actionId} requires workspaceId`);
      }
      break;
      
    case 'filesystem':
      // File system actions need path validation
      if (transformedArgs.path && typeof transformedArgs.path === 'string') {
        // Sanitize path to prevent directory traversal
        transformedArgs.path = transformedArgs.path.replace(/\.\./g, '');
      }
      break;
  }

  return transformedArgs;
}

/**
 * Execute a Gemini function call by routing to the appropriate HelpAI action
 */
export async function executeGeminiToolCall(
  toolName: string,
  args: Record<string, any>,
  context: ToolExecutionContext
): Promise<ToolExecutionResult> {
  const startTime = Date.now();
  
  // Convert Gemini tool name back to action ID (underscores to dots)
  const actionId = toolName.replace(/_/g, '.');
  
  try {
    console.log(`[Tool Bridge] Executing: ${actionId}`, { 
      args, 
      context: { ...context, conversationId: context.conversationId } 
    });

    // Check if action exists and get its definition
    const action = helpaiOrchestrator.getAction(actionId);
    if (!action) {
      console.warn(`[Tool Bridge] Action not found: ${actionId}`);
      // Get first 5 action IDs for helpful error message
      const availableActionIds = helpaiOrchestrator.getRegisteredActions()
        .slice(0, 5)
        .map(a => a.actionId)
        .join(', ');
      return {
        success: false,
        toolName,
        actionId,
        result: null,
        error: `Action "${actionId}" not found in registry. Available actions: ${availableActionIds}...`,
        executionTimeMs: Date.now() - startTime,
        conversationId: context.conversationId,
      };
    }

    // Transform and validate arguments for the specific action
    const transformedArgs = transformArgsForAction(actionId, args, context);

    // Build the action request with full context
    const actionRequest: ActionRequest = {
      actionId: `gemini-${context.conversationId || 'direct'}-${Date.now()}`,
      category: action.category,
      name: action.name,
      payload: transformedArgs,
      workspaceId: transformedArgs.workspaceId,
      userId: context.userId,
      userRole: context.userRole,
      priority: 'normal',
      metadata: {
        source: 'gemini-function-call',
        conversationId: context.conversationId,
        sessionId: context.sessionId,
        originalToolName: toolName,
      },
    };

    // Execute through orchestrator with error propagation
    const result = await helpaiOrchestrator.executeAction(actionRequest);

    // Log execution for analytics/tracing
    console.log(`[Tool Bridge] Action ${actionId} completed:`, {
      success: result.success,
      executionMs: Date.now() - startTime,
      conversationId: context.conversationId,
    });

    return {
      success: result.success,
      toolName,
      actionId,
      result: result.data || result.message,
      error: result.success ? undefined : result.message,
      executionTimeMs: Date.now() - startTime,
      conversationId: context.conversationId,
    };

  } catch (error: any) {
    console.error(`[Tool Bridge] Execution error for ${actionId}:`, error);
    
    // Propagate detailed error information back to Gemini
    const errorMessage = error.message || 'Unknown execution error';
    const errorDetails = error.stack ? `\n${error.stack.split('\n').slice(0, 3).join('\n')}` : '';
    
    return {
      success: false,
      toolName,
      actionId,
      result: null,
      error: `${errorMessage}${errorDetails}`,
      executionTimeMs: Date.now() - startTime,
      conversationId: context.conversationId,
    };
  }
}

/**
 * Execute multiple Gemini function calls in parallel
 */
export async function executeGeminiToolCalls(
  calls: Array<{ name: string; args: Record<string, any> }>,
  context: ToolExecutionContext
): Promise<ToolExecutionResult[]> {
  console.log(`[Tool Bridge] Executing ${calls.length} tool calls`, {
    conversationId: context.conversationId,
    tools: calls.map(c => c.name),
  });
  
  const results = await Promise.all(
    calls.map(call => executeGeminiToolCall(call.name, call.args, context))
  );

  const successCount = results.filter(r => r.success).length;
  console.log(`[Tool Bridge] Completed: ${successCount}/${calls.length} successful`);

  return results;
}

/**
 * Format tool execution results for Gemini's context (steps 5-8)
 */
export function formatToolResultsForGemini(results: ToolExecutionResult[]): string {
  if (results.length === 0) {
    return 'No tool calls were executed.';
  }

  const formatted = results.map(r => {
    const resultData = typeof r.result === 'object' 
      ? JSON.stringify(r.result, null, 2) 
      : String(r.result);
      
    if (r.success) {
      return `[SUCCESS] ${r.actionId}:\n${resultData}`;
    } else {
      return `[FAILED] ${r.actionId}:\nError: ${r.error}`;
    }
  });

  return formatted.join('\n\n---\n\n');
}

/**
 * Get available tools summary for Gemini system prompt
 */
export function getAvailableToolsSummary(): string {
  const actions = helpaiOrchestrator.getRegisteredActions();
  const categories: Record<string, string[]> = {};
  
  for (const action of actions) {
    const [category] = action.actionId.split('.');
    if (!categories[category]) {
      categories[category] = [];
    }
    categories[category].push(action.actionId);
  }

  const summary = Object.entries(categories)
    .map(([cat, ids]) => `${cat}: ${ids.length} actions`)
    .join(', ');

  return `Available tools: ${actions.length} total (${summary})`;
}

/**
 * Initialize the tool execution bridge
 */
export async function initializeToolBridge(): Promise<void> {
  console.log('[Tool Bridge] Initializing...');
  
  // Generate schemas from registered actions
  await geminiToolSchemaGenerator.generateSchemas();
  
  const schemaCount = geminiToolSchemaGenerator.getSchemaCount();
  const summary = getAvailableToolsSummary();
  
  console.log(`[Tool Bridge] Ready - ${schemaCount} tool schemas`);
  console.log(`[Tool Bridge] ${summary}`);
}

export {
  geminiToolSchemaGenerator,
};
