/**
 * AI Brain Console API
 * 
 * Provides interactive chat and control interface for support staff to:
 * - Have conversations with AI Brain (Gemini)
 * - Execute platform actions via natural language
 * - View AI Brain capabilities and status
 * - Access file system tools
 * - Run diagnostic tests
 * - Execute workflows
 * 
 * All operations are authenticated and authorized for support staff only.
 */

import { sanitizeError } from '../middleware/errorHandler';
import { Router, Response, NextFunction } from 'express';
import { type AuthenticatedRequest } from '../rbac';
import { helpaiOrchestrator } from '../services/helpai/platformActionHub';
import { aiBrainMasterOrchestrator } from '../services/ai-brain/aiBrainMasterOrchestrator';
import { aiBrainFileSystemTools } from '../services/ai-brain/aiBrainFileSystemTools';
import { aiBrainWorkflowExecutor } from '../services/ai-brain/aiBrainWorkflowExecutor';
import { aiBrainTestRunner } from '../services/ai-brain/aiBrainTestRunner';
import { aiBrainService } from '../services/ai-brain/aiBrainService';
import { trinitySelfAssessment } from '../services/ai-brain/trinitySelfAssessment';
import { db } from '../db';
import { auditLogs } from '@shared/schema';
import { broadcastToAllClients } from '../websocket';
import { createLogger } from '../lib/logger';
import { PLATFORM_WORKSPACE_ID } from '../services/billing/billingConstants';
import { z } from 'zod';
const log = createLogger('AiBrainConsole');


export const aiBrainConsoleRouter = Router();

const SUPPORT_ROLES = ['root_admin', 'deputy_admin', 'sysop', 'support_manager', 'support_agent'];

function requireSupportRole(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  const userRole = req.platformRole || 'none';
  if (!SUPPORT_ROLES.includes(userRole)) {
    return res.status(403).json({ 
      error: 'Support staff access required',
      requiredRoles: SUPPORT_ROLES,
    });
  }
  next();
}

interface ConversationMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: Date;
  actionExecuted?: {
    actionId: string;
    success: boolean;
    result?: any;
  };
}

const conversations: Map<string, ConversationMessage[]> = new Map();

/**
 * POST /api/ai-brain/console/chat
 * Send a message to AI Brain and get a response
 * AI can understand natural language and execute actions
 */
aiBrainConsoleRouter.post('/chat', requireSupportRole, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { message, conversationId, executeActions } = req.body;
    const userId = req.user?.id || 'support';
    const userRole = req.platformRole || 'support_agent';
    
    if (!message) {
      return res.status(400).json({ error: 'Message is required' });
    }

    const convId = conversationId || `conv-${Date.now()}-${crypto.randomUUID().slice(0, 6)}`;
    
    if (!conversations.has(convId)) {
      conversations.set(convId, [{
        role: 'system',
        content: `You are the AI Brain for CoAIleague platform. You are assisting support staff member ${userId} with role ${userRole}. You can help with:
- Platform diagnostics and health checks
- File system operations (read, write, edit, delete, list, search)
- Workflow execution and management
- Running diagnostic tests
- Answering questions about platform features
- Executing platform actions

When asked to perform an action, you should identify the correct action and its parameters, then confirm before execution.
Always be helpful, precise, and safety-conscious.`,
        timestamp: new Date()
      }]);
    }

    const conv = conversations.get(convId)!;
    
    conv.push({
      role: 'user',
      content: message,
      timestamp: new Date()
    });

    const aiBrain = aiBrainService;
    
    const contextMessages = conv.slice(-10).map(m => ({
      role: m.role as 'user' | 'assistant' | 'system',
      content: m.content
    }));

    const availableActions = helpaiOrchestrator.getAvailableActions(userRole);
    
    const actionContext = `
Available actions you can suggest or execute:
${availableActions.slice(0, 50).map(a => `- ${a.actionId}: ${a.description}`).join('\n')}

To execute an action, respond with JSON in format:
{"action": "actionId", "params": {...}}
`;

    const systemPrompt = `${conv[0].content}\n\n${actionContext}`;

    try {
      const response = await (aiBrain as any).chat(message, {
        contextMessages,
        systemPrompt,
        temperature: 0.7,
        maxTokens: 2048
      });

      let assistantMessage = response;
      let actionExecuted: ConversationMessage['actionExecuted'] | undefined;

      if (executeActions) {
        const actionMatch = response.match(/\{"action":\s*"([^"]+)",\s*"params":\s*(\{[^}]*\})\}/);
        if (actionMatch) {
          const actionId = actionMatch[1];
          const params = JSON.parse(actionMatch[2]);
          
          try {
            const result = await aiBrainMasterOrchestrator.executeActionWithNotification(
              actionId,
              params,
              userId,
              userRole,
              // @ts-expect-error — TS migration: fix in refactoring sprint
              req.user?.currentWorkspaceId
            );
            
            actionExecuted = {
              actionId,
              success: result.success,
              result: result.data
            };
            
            assistantMessage = response.replace(actionMatch[0], '') + 
              `\n\n✅ Action executed: ${actionId}\nResult: ${result.message}`;
          } catch (error: unknown) {
            actionExecuted = {
              actionId,
              success: false,
              result: { error: sanitizeError(error) }
            };
            
            assistantMessage = response.replace(actionMatch[0], '') + 
              `\n\n❌ Action failed: ${actionId}\nError: ${sanitizeError(error)}`;
          }
        }
      }

      conv.push({
        role: 'assistant',
        content: assistantMessage,
        timestamp: new Date(),
        actionExecuted
      });

      await logConsoleAction(userId, 'chat', { 
        conversationId: convId, 
        messageLength: message.length,
        actionExecuted: actionExecuted?.actionId
      });

      res.json({
        conversationId: convId,
        response: assistantMessage,
        actionExecuted,
        messageCount: conv.length
      });
    } catch (error: unknown) {
      log.error('[AIBrainConsole] Chat error:', error);
      res.status(500).json({ error: 'Failed to get AI response', details: sanitizeError(error) });
    }
  } catch (error: unknown) {
    log.error('[AIBrainConsole] Chat error:', error);
    res.status(500).json({ error: sanitizeError(error) });
  }
});

/**
 * GET /api/ai-brain/console/capabilities
 * Get all available AI Brain capabilities and actions
 */
aiBrainConsoleRouter.get('/capabilities', requireSupportRole, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userRole = req.platformRole || 'support_agent';
    
    const actions = helpaiOrchestrator.getAvailableActions(userRole);
    const workflows = aiBrainWorkflowExecutor.listWorkflows();
    const tests = aiBrainTestRunner.listTests();
    
    const categories = actions.reduce((acc: Record<string, number>, action: any) => {
      const category = action.category || 'other';
      acc[category] = (acc[category] || 0) + 1;
      return acc;
    }, {});

    res.json({
      actions: {
        total: actions.length,
        byCategory: categories,
        list: actions.map((a: any) => ({
          id: a.actionId,
          name: a.name,
          category: a.category,
          description: a.description,
          requiredRoles: a.requiredRoles
        }))
      },
      workflows: {
        total: workflows.length,
        list: workflows.map(w => ({
          id: w.id,
          name: w.name,
          description: w.description,
          stepCount: w.steps.length
        }))
      },
      tests: {
        total: tests.length,
        byCategory: tests.reduce((acc: Record<string, number>, t: any) => {
          acc[t.category] = (acc[t.category] || 0) + 1;
          return acc;
        }, {}),
        list: tests.map((t: any) => ({
          id: t.id,
          name: t.name,
          category: t.category,
          severity: t.severity
        }))
      },
      fileSystem: {
        operations: ['read', 'write', 'edit', 'delete', 'list', 'search', 'diff', 'copy', 'move']
      }
    });
  } catch (error: unknown) {
    log.error('[AIBrainConsole] Capabilities error:', error);
    res.status(500).json({ error: sanitizeError(error) });
  }
});

/**
 * POST /api/ai-brain/console/execute
 * Execute a specific AI Brain action
 */
aiBrainConsoleRouter.post('/execute', requireSupportRole, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { actionId, params } = req.body;
    const userId = req.user?.id || 'support';
    const userRole = req.platformRole || 'support_agent';
    
    if (!actionId) {
      return res.status(400).json({ error: 'actionId is required' });
    }

    const result = await aiBrainMasterOrchestrator.executeActionWithNotification(
      actionId,
      params || {},
      userId,
      userRole,
      // @ts-expect-error — TS migration: fix in refactoring sprint
      req.user?.currentWorkspaceId
    );

    await logConsoleAction(userId, 'execute_action', { actionId, success: result.success });

    res.json(result);
  } catch (error: unknown) {
    log.error('[AIBrainConsole] Execute error:', error);
    res.status(500).json({ error: sanitizeError(error) });
  }
});

/**
 * POST /api/ai-brain/console/file
 * Direct file system operations
 */
aiBrainConsoleRouter.post('/file', requireSupportRole, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { operation, path, content, options } = req.body;
    const userId = req.user?.id || 'support';
    
    if (!operation) {
      return res.status(400).json({ error: 'operation is required' });
    }

    let result;
    
    switch (operation) {
      case 'read':
        result = await aiBrainFileSystemTools.readFile(path, options || {}, userId);
        break;
      case 'write':
        if (!content) {
          return res.status(400).json({ error: 'content is required for write operation' });
        }
        result = await aiBrainFileSystemTools.writeFile(path, content, options || {}, userId);
        break;
      case 'list':
        result = await aiBrainFileSystemTools.listDirectory(path || '.', options || {}, userId);
        break;
      case 'search':
        if (!options?.pattern) {
          return res.status(400).json({ error: 'options.pattern is required for search operation' });
        }
        result = await aiBrainFileSystemTools.searchFiles(path || '.', options, userId);
        break;
      case 'stats':
        result = await aiBrainFileSystemTools.getStats(path, userId);
        break;
      case 'exists':
        const exists = await aiBrainFileSystemTools.exists(path);
        result = { success: true, data: { exists } };
        break;
      default:
        return res.status(400).json({ error: `Unknown operation: ${operation}` });
    }

    await logConsoleAction(userId, `file_${operation}`, { path, success: result.success });

    res.json(result);
  } catch (error: unknown) {
    log.error('[AIBrainConsole] File operation error:', error);
    res.status(500).json({ error: sanitizeError(error) });
  }
});

/**
 * POST /api/ai-brain/console/workflow
 * Workflow operations
 */
aiBrainConsoleRouter.post('/workflow', requireSupportRole, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { operation, workflowId, workflow, context } = req.body;
    const userId = req.user?.id || 'support';
    
    if (!operation) {
      return res.status(400).json({ error: 'operation is required' });
    }

    let result;
    
    switch (operation) {
      case 'list':
        const workflows = aiBrainWorkflowExecutor.listWorkflows();
        result = { success: true, data: workflows };
        break;
      case 'register':
        if (!workflow) {
          return res.status(400).json({ error: 'workflow definition is required' });
        }
        aiBrainWorkflowExecutor.registerWorkflow(workflow);
        result = { success: true, data: { workflowId: workflow.id } };
        break;
      case 'execute':
        if (!workflowId) {
          return res.status(400).json({ error: 'workflowId is required' });
        }
        const execution = await aiBrainWorkflowExecutor.executeWorkflow(workflowId, userId, context || {});
        result = { success: execution.status === 'completed', data: execution };
        break;
      case 'executions':
        const executions = aiBrainWorkflowExecutor.listExecutions();
        result = { success: true, data: executions };
        break;
      default:
        return res.status(400).json({ error: `Unknown operation: ${operation}` });
    }

    await logConsoleAction(userId, `workflow_${operation}`, { workflowId, success: result.success });

    res.json(result);
  } catch (error: unknown) {
    log.error('[AIBrainConsole] Workflow operation error:', error);
    res.status(500).json({ error: sanitizeError(error) });
  }
});

/**
 * POST /api/ai-brain/console/test
 * Run diagnostic tests
 */
aiBrainConsoleRouter.post('/test', requireSupportRole, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { operation, testId, category, severity } = req.body;
    const userId = req.user?.id || 'support';
    
    if (!operation) {
      return res.status(400).json({ error: 'operation is required' });
    }

    let result;
    
    switch (operation) {
      case 'list':
        const tests = aiBrainTestRunner.listTests();
        result = { success: true, data: tests };
        break;
      case 'run':
        if (!testId) {
          return res.status(400).json({ error: 'testId is required' });
        }
        const testResult = await aiBrainTestRunner.runTest(testId, userId);
        result = { success: testResult.status === 'passed', data: testResult };
        break;
      case 'run_all':
        const allResults = await aiBrainTestRunner.runAllTests(userId);
        result = { success: allResults.summary.failed === 0, data: allResults };
        break;
      case 'run_category':
        if (!category) {
          return res.status(400).json({ error: 'category is required' });
        }
        const categoryResults = await aiBrainTestRunner.runTestsByCategory(category, userId);
        result = { success: categoryResults.summary.failed === 0, data: categoryResults };
        break;
      case 'results':
        const suites = aiBrainTestRunner.listSuiteResults();
        result = { success: true, data: suites };
        break;
      default:
        return res.status(400).json({ error: `Unknown operation: ${operation}` });
    }

    await logConsoleAction(userId, `test_${operation}`, { testId, category, success: result.success });

    res.json(result);
  } catch (error: unknown) {
    log.error('[AIBrainConsole] Test operation error:', error);
    res.status(500).json({ error: sanitizeError(error) });
  }
});

/**
 * GET /api/ai-brain/console/status
 * Get AI Brain system status
 */
aiBrainConsoleRouter.get('/status', requireSupportRole, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const aiBrain = aiBrainService;
    const actions = helpaiOrchestrator.getAvailableActions('root_admin');
    const workflows = aiBrainWorkflowExecutor.listWorkflows();
    const tests = aiBrainTestRunner.listTests();
    const executions = aiBrainWorkflowExecutor.listExecutions();
    const suiteResults = aiBrainTestRunner.listSuiteResults();

    res.json({
      status: 'operational',
      timestamp: new Date().toISOString(),
      capabilities: {
        actions: actions.length,
        workflows: workflows.length,
        tests: tests.length,
        fileSystemTools: 9
      },
      recentActivity: {
        workflowExecutions: executions.slice(0, 5).map(e => ({
          id: e.executionId,
          workflow: e.workflowId,
          status: e.status,
          startedAt: e.startedAt
        })),
        testSuites: suiteResults.slice(0, 5).map(s => ({
          id: s.suiteId,
          name: s.suiteName,
          passRate: s.summary.passRate,
          startedAt: s.startedAt
        }))
      },
      memory: {
        activeConversations: conversations.size
      }
    });
  } catch (error: unknown) {
    log.error('[AIBrainConsole] Status error:', error);
    res.status(500).json({ error: sanitizeError(error) });
  }
});

/**
 * GET /api/ai-brain/console/self-assessment
 * Trinity performs comprehensive self-assessment of capabilities and gaps
 */
aiBrainConsoleRouter.get('/self-assessment', requireSupportRole, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.user?.id || 'support';
    const workspaceId = req.workspaceId || (req.user)?.workspaceId || (req.user)?.currentWorkspaceId;
        if (!workspaceId) return res.status(403).json({ error: 'Workspace context required' });
    
    log.info(`[AIBrainConsole] Self-assessment requested by ${userId}`);
    
    const result = await trinitySelfAssessment.performAssessment(workspaceId);
    
    await logConsoleAction(userId, 'self_assessment', { 
      assessmentId: result.assessmentId,
      readiness: result.overallReadiness,
      criticalGaps: result.criticalGaps
    });

    res.json({
      success: true,
      data: result
    });
  } catch (error: unknown) {
    log.error('[AIBrainConsole] Self-assessment error:', error);
    res.status(500).json({ error: sanitizeError(error) });
  }
});

/**
 * DELETE /api/ai-brain/console/conversation/:id
 * Clear a conversation
 */
aiBrainConsoleRouter.delete('/conversation/:id', requireSupportRole, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { id } = req.params;
    
    if (conversations.has(id)) {
      conversations.delete(id);
      res.json({ success: true, message: 'Conversation cleared' });
    } else {
      res.status(404).json({ error: 'Conversation not found' });
    }
  } catch (error: unknown) {
    res.status(500).json({ error: sanitizeError(error) });
  }
});

/**
 * GET /api/ai-brain/console/conversation/:id
 * Get conversation history
 */
aiBrainConsoleRouter.get('/conversation/:id', requireSupportRole, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { id } = req.params;
    
    const conv = conversations.get(id);
    if (conv) {
      res.json({
        conversationId: id,
        messages: conv.filter(m => m.role !== 'system'),
        messageCount: conv.length
      });
    } else {
      res.status(404).json({ error: 'Conversation not found' });
    }
  } catch (error: unknown) {
    res.status(500).json({ error: sanitizeError(error) });
  }
});

aiBrainConsoleRouter.get('/files', requireSupportRole, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const dirPath = (req.query.path as string) || (req.query['0'] as string) || '.';
    const userId = req.user?.id || 'support';
    const result = await aiBrainFileSystemTools.listDirectory(dirPath, {}, userId);
    res.json({ files: (result as any).data?.files || result.data?.entries || [], path: dirPath });
  } catch (error: unknown) {
    log.error('[AIBrainConsole] Files list error:', error);
    res.status(500).json({ error: sanitizeError(error) });
  }
});

aiBrainConsoleRouter.post('/files/read', requireSupportRole, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { filePath } = req.body;
    const userId = req.user?.id || 'support';
    if (!filePath) return res.status(400).json({ error: 'filePath is required' });
    const result = await aiBrainFileSystemTools.readFile(filePath, {}, userId);
    res.json({ content: (result as any).data?.content || '', path: filePath });
  } catch (error: unknown) {
    log.error('[AIBrainConsole] File read error:', error);
    res.status(500).json({ error: sanitizeError(error) });
  }
});

aiBrainConsoleRouter.post('/files/write', requireSupportRole, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { filePath, content } = req.body;
    const userId = req.user?.id || 'support';
    if (!filePath) return res.status(400).json({ error: 'filePath is required' });
    const result = await aiBrainFileSystemTools.writeFile(filePath, content || '', {}, userId);
    await logConsoleAction(userId, 'file_write', { path: filePath, success: result.success });
    res.json(result);
  } catch (error: unknown) {
    log.error('[AIBrainConsole] File write error:', error);
    res.status(500).json({ error: sanitizeError(error) });
  }
});

aiBrainConsoleRouter.post('/files/search', requireSupportRole, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { pattern, path: searchPath } = req.body;
    const userId = req.user?.id || 'support';
    if (!pattern) return res.status(400).json({ error: 'pattern is required' });
    const result = await aiBrainFileSystemTools.searchFiles(searchPath || '.', { pattern }, userId);
    res.json({ matches: (result as any).data?.matches || [], pattern });
  } catch (error: unknown) {
    log.error('[AIBrainConsole] File search error:', error);
    res.status(500).json({ error: sanitizeError(error) });
  }
});

aiBrainConsoleRouter.post('/tests/run', requireSupportRole, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { category, testNames } = req.body;
    const userId = req.user?.id || 'support';
    let results;
    if (category && category !== 'all') {
      results = await aiBrainTestRunner.runTestsByCategory(category, userId);
    } else {
      results = await aiBrainTestRunner.runAllTests(userId);
    }
    await logConsoleAction(userId, 'test_run', { category, success: results.summary.failed === 0 });
    res.json({
      total: results.summary.total,
      passed: results.summary.passed,
      failed: results.summary.failed,
      results: results.results,
    });
  } catch (error: unknown) {
    log.error('[AIBrainConsole] Test run error:', error);
    res.status(500).json({ error: sanitizeError(error) });
  }
});

aiBrainConsoleRouter.get('/history', requireSupportRole, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { desc: descOrder, like } = await import('drizzle-orm');
    const logs = await db.select()
      .from(auditLogs)
      .where(
        like(auditLogs.action, 'ai_brain_console:%')
      )
      .orderBy(descOrder(auditLogs.createdAt))
      .limit(50);
    
    const actions = logs.map(log => ({
      actionId: log.action?.replace('ai_brain_console:', '') || '',
      category: log.targetType || 'console',
      success: (log as any).metadata?.success ?? true,
      message: (log as any).metadata?.message || '',
      timestamp: log.createdAt?.toISOString() || new Date().toISOString(),
    }));
    
    res.json({ actions });
  } catch (error: unknown) {
    log.error('[AIBrainConsole] History error:', error);
    res.status(500).json({ error: sanitizeError(error), actions: [] });
  }
});

async function logConsoleAction(
  userId: string,
  action: string,
  details: Record<string, any>
): Promise<void> {
  try {
    await db.insert(auditLogs).values({
      workspaceId: PLATFORM_WORKSPACE_ID,
      userId,
      action: `ai_brain_console:${action}`,
      targetType: 'ai_brain',
      targetId: 'console',
      metadata: {
        ...details,
        timestamp: new Date().toISOString(),
      },
      ipAddress: 'support-console',
    });
  } catch (error) {
    log.error('[AIBrainConsole] Failed to log action:', error);
  }
}
