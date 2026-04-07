import { sanitizeError } from '../middleware/errorHandler';
import { Router } from 'express';
import { ensureWorkspaceAccess } from '../middleware/workspaceScope';
import { trinityRegulatoryService } from '../services/ai-brain/trinityRegulatoryService';
import { trinityFinancialIntelligenceEngine } from '../services/ai-brain/trinityFinancialIntelligenceEngine';
import { trinityAutonomousTaskQueue } from '../services/ai-brain/trinityAutonomousTaskQueue';

const router = Router();

router.use(ensureWorkspaceAccess);

// ─── Phase A: Regulatory Knowledge Base ─────────────────────────────────────

router.get('/regulatory/rules', async (req, res) => {
  try {
    const state = (req.query.state as string) || 'TX';
    const category = req.query.category as string | undefined;
    const rules = await trinityRegulatoryService.getRulesForState(state, category);
    res.json({ rules, count: rules.length });
  } catch (err: unknown) {
    res.status(500).json({ error: sanitizeError(err) });
  }
});

router.get('/regulatory/upcoming-reviews', async (req, res) => {
  try {
    const days = Math.min(Math.max(1, parseInt(req.query.days as string) || 90), 365);
    const rules = await trinityRegulatoryService.getUpcomingRuleReviews(days);
    res.json({ rules, count: rules.length });
  } catch (err: unknown) {
    res.status(500).json({ error: sanitizeError(err) });
  }
});

router.get('/regulatory/citation/:ruleId', async (req, res) => {
  try {
    const citation = await trinityRegulatoryService.citedRule(req.params.ruleId);
    res.json({ citation });
  } catch (err: unknown) {
    res.status(500).json({ error: sanitizeError(err) });
  }
});

router.post('/regulatory/check-compliance', async (req, res) => {
  try {
    const { employeeData, state } = req.body;
    if (!employeeData || !state) {
      return res.status(400).json({ error: 'employeeData and state are required' });
    }
    const results = await trinityRegulatoryService.checkComplianceAgainstRules(employeeData, state);
    const passed = results.filter(r => r.status === 'pass').length;
    const failed = results.filter(r => r.status === 'fail').length;
    const warnings = results.filter(r => r.status === 'warning').length;
    res.json({ results, summary: { passed, failed, warnings, total: results.length } });
  } catch (err: unknown) {
    res.status(500).json({ error: sanitizeError(err) });
  }
});

router.get('/regulatory/briefing', async (req, res) => {
  try {
    const briefing = await trinityRegulatoryService.getRulesForMorningBriefing();
    res.json(briefing);
  } catch (err: unknown) {
    res.status(500).json({ error: sanitizeError(err) });
  }
});

// ─── Phase B: Financial Intelligence Engine ──────────────────────────────────

router.get('/financial/briefing', async (req, res) => {
  try {
    const workspaceId = req.workspaceId;
    if (!workspaceId) return res.status(400).json({ error: 'Workspace required' });
    const briefing = await trinityFinancialIntelligenceEngine.generateMorningBriefingData(workspaceId);
    res.json(briefing);
  } catch (err: unknown) {
    res.status(500).json({ error: sanitizeError(err) });
  }
});

router.get('/financial/site-margins', async (req, res) => {
  try {
    const workspaceId = req.workspaceId;
    if (!workspaceId) return res.status(400).json({ error: 'Workspace required' });
    const scores = await trinityFinancialIntelligenceEngine.computeSiteMarginScores(workspaceId);
    res.json({ scores, count: scores.length });
  } catch (err: unknown) {
    res.status(500).json({ error: sanitizeError(err) });
  }
});

router.get('/financial/contract-health', async (req, res) => {
  try {
    const workspaceId = req.workspaceId;
    if (!workspaceId) return res.status(400).json({ error: 'Workspace required' });
    const scores = await trinityFinancialIntelligenceEngine.computeContractHealthScores(workspaceId);
    const atRisk = scores.filter(s => s.atRisk);
    res.json({ scores, atRisk, atRiskCount: atRisk.length });
  } catch (err: unknown) {
    res.status(500).json({ error: sanitizeError(err) });
  }
});

router.get('/financial/labor-forecast', async (req, res) => {
  try {
    const workspaceId = req.workspaceId;
    if (!workspaceId) return res.status(400).json({ error: 'Workspace required' });
    const forecasts = await trinityFinancialIntelligenceEngine.generateLaborCostForecast(workspaceId);
    res.json({ forecasts });
  } catch (err: unknown) {
    res.status(500).json({ error: sanitizeError(err) });
  }
});

router.get('/financial/alerts', async (req, res) => {
  try {
    const workspaceId = req.workspaceId;
    if (!workspaceId) return res.status(400).json({ error: 'Workspace required' });
    const alerts = await trinityFinancialIntelligenceEngine.detectProactiveAlerts(workspaceId);
    const critical = alerts.filter(a => a.severity === 'critical');
    const warnings = alerts.filter(a => a.severity === 'warning');
    res.json({ alerts, critical, warnings, criticalCount: critical.length });
  } catch (err: unknown) {
    res.status(500).json({ error: sanitizeError(err) });
  }
});

// ─── Phase C: Autonomous Task Queue ─────────────────────────────────────────

router.get('/autonomous/tasks', async (req, res) => {
  try {
    const workspaceId = req.workspaceId;
    if (!workspaceId) return res.status(400).json({ error: 'Workspace required' });
    const { tasks, summary } = await trinityAutonomousTaskQueue.getActiveTasksForBriefing(workspaceId);
    res.json({ tasks, summary, count: tasks.length });
  } catch (err: unknown) {
    res.status(500).json({ error: sanitizeError(err) });
  }
});

router.get('/autonomous/tasks/completed', async (req, res) => {
  try {
    const workspaceId = req.workspaceId;
    if (!workspaceId) return res.status(400).json({ error: 'Workspace required' });
    const limit = Math.min(Math.max(1, parseInt(req.query.limit as string) || 10), 500);
    const tasks = await trinityAutonomousTaskQueue.getRecentCompletedTasks(workspaceId, limit);
    res.json({ tasks, count: tasks.length });
  } catch (err: unknown) {
    res.status(500).json({ error: sanitizeError(err) });
  }
});

router.post('/autonomous/scan', async (req, res) => {
  try {
    const workspaceId = req.workspaceId;
    if (!workspaceId) return res.status(400).json({ error: 'Workspace required' });
    const newTasks = await trinityAutonomousTaskQueue.scanForNewTasks(workspaceId);
    res.json({
      newTasks,
      newTaskCount: newTasks.length,
      message: newTasks.length > 0
        ? `Trinity identified ${newTasks.length} new task(s) that need attention.`
        : 'No new tasks identified. All systems nominal.',
    });
  } catch (err: unknown) {
    res.status(500).json({ error: sanitizeError(err) });
  }
});

router.post('/autonomous/tasks/:taskId/approve', async (req, res) => {
  try {
    const { taskId } = req.params;
    const userId = req.user?.id || 'unknown';
    await trinityAutonomousTaskQueue.approveTask(taskId, userId);
    res.json({ success: true, message: 'Task approved. Trinity will execute within the next scan cycle.' });
  } catch (err: unknown) {
    res.status(500).json({ error: sanitizeError(err) });
  }
});

router.post('/autonomous/tasks', async (req, res) => {
  try {
    const workspaceId = req.workspaceId;
    if (!workspaceId) return res.status(400).json({ error: 'Workspace required' });
    const { taskType, description, requiresHumanApproval, approvalThresholdReason } = req.body;
    if (!taskType || !description) {
      return res.status(400).json({ error: 'taskType and description are required' });
    }
    const task = await trinityAutonomousTaskQueue.createTask(
      workspaceId, taskType, description,
      requiresHumanApproval || false,
      approvalThresholdReason
    );
    res.json({ task });
  } catch (err: unknown) {
    res.status(500).json({ error: sanitizeError(err) });
  }
});

// ─── Phase D: Officer Command Registry ──────────────────────────────────────

router.post('/officer/command', async (req, res) => {
  try {
    const { input, employeeId } = req.body;
    const workspaceId = req.workspaceId;
    if (!input || !employeeId || !workspaceId) {
      return res.status(400).json({ error: 'input, employeeId, and workspaceId are required' });
    }

    const { officerCommandRegistry } = await import('../services/helpai/officerCommandRegistry');
    const match = officerCommandRegistry.classifyInput(input);

    if (!match) {
      return res.json({
        tier: null,
        intent: 'unrecognized',
        requiresTrinityCall: true,
        contextForTrinity: `Officer ${employeeId} typed: "${input}". Classify intent and respond with officer-scoped data only. Max 3 sentences.`,
        response: null,
      });
    }

    const { command, confidence } = match;

    if (command.tier === 'T0') {
      const result = await officerCommandRegistry.handleTier0Command(
        command, employeeId, workspaceId, match.extractedParams
      );
      return res.json({ ...result, confidence });
    }

    if (command.tier === 'T2' || command.tier === 'T3') {
      const result = officerCommandRegistry.buildEscalationResponse(command);
      return res.json({ ...result, confidence });
    }

    const contextForTrinity = officerCommandRegistry.buildTrinityContext(command, employeeId, input);
    return res.json({
      tier: command.tier,
      intent: command.intent,
      requiresTrinityCall: true,
      contextForTrinity,
      confidence,
      response: null,
    });
  } catch (err: unknown) {
    res.status(500).json({ error: sanitizeError(err) });
  }
});

router.get('/officer/commands', async (req, res) => {
  try {
    const { officerCommandRegistry } = await import('../services/helpai/officerCommandRegistry');
    const tier = req.query.tier as string;
    const validTiers = ['T0', 'T1', 'T2', 'T3'] as const;
    type Tier = typeof validTiers[number];
    if (tier && validTiers.includes(tier as Tier)) {
      const commands = officerCommandRegistry.getCommandsByTier(tier as Tier);
      return res.json({ commands, tier });
    }
    const allCommands = ['T0', 'T1', 'T2', 'T3'].flatMap(t =>
      officerCommandRegistry.getCommandsByTier(t as Tier)
    );
    res.json({ commands: allCommands, total: allCommands.length });
  } catch (err: unknown) {
    res.status(500).json({ error: sanitizeError(err) });
  }
});

export default router;
