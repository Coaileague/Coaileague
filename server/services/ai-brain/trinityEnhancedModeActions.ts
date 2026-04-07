/**
 * TRINITY ENHANCED MODE ACTIONS - AI Brain Registration
 * ======================================================
 * 
 * Registers Trinity's Enhanced Guru Mode and Business Pro Mode
 * actions with the AI Brain orchestrator.
 * 
 * Enhanced Guru Mode:
 * - Agent Marketplace (3-tier trust)
 * - Frustration Detection
 * - Safe Self-Evolution
 * - Scenario Engine
 * - Ethics Engine
 * - Intelligence Systems
 * 
 * Business Pro Mode:
 * - 8 Specialized Agents
 * - 4 Money Discovery Modes
 * - Industry Playbooks
 * - ROI Calculator
 */

import { trinityGuruMode } from './trinityGuruMode';
import { trinityBusinessProMode } from './trinityBusinessProMode';
import type { ActionRequest, ActionResult } from '../helpai/platformActionHub';
import { createLogger } from '../../lib/logger';
const log = createLogger('trinityEnhancedModeActions');

export function registerTrinityEnhancedModeActions(orchestrator: any): void {
  log.info('[TrinityEnhanced] Registering Enhanced Guru Mode + Business Pro Mode actions...');

  // -------------------------------------------------------------------------
  // GURU MODE ACTIONS
  // -------------------------------------------------------------------------

  orchestrator.registerAction({
    actionId: 'guru.select_agent',
    name: 'Select Best Agent',
    category: 'guru',
    description: 'Select the best agent using 3-tier trust model (Internal → Verified → Experimental)',
    requiredRoles: ['root_admin', 'deputy_admin', 'sysop'],
    handler: async (request: ActionRequest): Promise<ActionResult> => {
      const startTime = Date.now();
      const { task, requiredCapabilities } = request.payload || {};

      const result = trinityGuruMode.selectAgent(task || 'general', requiredCapabilities || []);
      const costStatus = trinityGuruMode.getCostStatus();

      return {
        success: !!result.agent,
        actionId: request.actionId,
        message: result.agent 
          ? `Selected ${result.agent.name} (${result.tier} tier, cost: $${result.cost.toFixed(2)}) [Audit: ${result.auditId}]`
          : `No suitable agent available (Daily spend: $${costStatus.currentDailySpend.toFixed(2)}/$${costStatus.dailyCap})`,
        data: { ...result, costStatus },
        executionTimeMs: Date.now() - startTime
      };
    }
  });

  orchestrator.registerAction({
    actionId: 'guru.detect_frustration',
    name: 'Detect User Frustration',
    category: 'guru',
    description: 'Pattern-based frustration detection with business impact analysis',
    requiredRoles: ['root_admin', 'deputy_admin', 'sysop', 'support_manager'],
    handler: async (request: ActionRequest): Promise<ActionResult> => {
      const startTime = Date.now();
      const { abandonRate, supportTicketsVsBaseline, avgSessionTime, doubleClickRate } = request.payload || {};

      const result = trinityGuruMode.detectFrustration({
        abandonRate,
        supportTicketsVsBaseline,
        avgSessionTime,
        doubleClickRate
      });

      return {
        success: true,
        actionId: request.actionId,
        message: result.detected 
          ? `Frustration detected: ${result.issue} (Est. loss: $${result.estimatedRevenueLoss})`
          : 'No frustration patterns detected',
        data: result,
        executionTimeMs: Date.now() - startTime
      };
    }
  });

  orchestrator.registerAction({
    actionId: 'guru.propose_evolution',
    name: 'Propose Self-Evolution',
    category: 'guru',
    description: 'Propose safe self-evolution with sandbox testing and A/B validation',
    requiredRoles: ['root_admin', 'deputy_admin'],
    /* DEFERRED — requires real org data integration before production use */
    isDeferred: true,
    handler: async (request: ActionRequest): Promise<ActionResult> => {
      const startTime = Date.now();
      const { parameter, currentValue, proposedValue } = request.payload || {};

      if (!parameter) {
        return {
          success: false,
          actionId: request.actionId,
          message: 'Missing required field: parameter',
          executionTimeMs: Date.now() - startTime
        };
      }

      const result = await trinityGuruMode.proposeEvolution(parameter, currentValue, proposedValue);

      return {
        success: !!result,
        actionId: request.actionId,
        message: result 
          ? `Evolution ${result.id}: ${result.status} (${result.expectedImprovementPercent}% improvement)`
          : 'Evolution proposal failed',
        data: result,
        executionTimeMs: Date.now() - startTime
      };
    }
  });

  orchestrator.registerAction({
    actionId: 'guru.run_scenario',
    name: 'Run Scenario Simulation',
    category: 'guru',
    description: 'Run intelligent scenario simulation with ROI-based auto-execution',
    requiredRoles: ['root_admin', 'deputy_admin', 'sysop'],
    /* DEFERRED — requires real org data integration before production use */
    isDeferred: true,
    handler: async (request: ActionRequest): Promise<ActionResult> => {
      const startTime = Date.now();
      const { scenarioId } = request.payload || {};

      if (!scenarioId) {
        const scenarios = trinityGuruMode.getCriticalScenarios();
        return {
          success: true,
          actionId: request.actionId,
          message: `${scenarios.length} critical scenarios available`,
          data: { scenarios },
          executionTimeMs: Date.now() - startTime
        };
      }

      try {
        const result = await trinityGuruMode.runScenarioSimulation(scenarioId);
        return {
          success: true,
          actionId: request.actionId,
          message: result.autoExecuted 
            ? `Scenario simulated, mitigation auto-executed (ROI: ${result.roi}x)`
            : `Scenario simulated: $${result.revenueAtRisk} at risk, ${result.mitigation || 'needs approval'}`,
          data: result,
          executionTimeMs: Date.now() - startTime
        };
      } catch (e: any) {
        return {
          success: false,
          actionId: request.actionId,
          message: e.message,
          executionTimeMs: Date.now() - startTime
        };
      }
    }
  });

  orchestrator.registerAction({
    actionId: 'guru.check_ethics',
    name: 'Check Cross-Tenant Ethics',
    category: 'guru',
    description: 'Verify cross-tenant learning with industry-specific compliance (HIPAA, OSHA, PCI)',
    requiredRoles: ['root_admin', 'deputy_admin', 'compliance_officer'],
    handler: async (request: ActionRequest): Promise<ActionResult> => {
      const startTime = Date.now();
      const { practice, principle, fromIndustry, toIndustry } = request.payload || {};

      if (!practice || !fromIndustry || !toIndustry) {
        return {
          success: false,
          actionId: request.actionId,
          message: 'Missing required fields: practice, fromIndustry, toIndustry',
          executionTimeMs: Date.now() - startTime
        };
      }

      const result = await trinityGuruMode.checkCrossTenantLearning({
        practice,
        principle: principle || practice,
        fromIndustry,
        toIndustry
      });

      return {
        success: true,
        actionId: request.actionId,
        message: result.allowed 
          ? `Learning approved. Adapted practice: ${result.adaptedPractice}`
          : `Learning blocked: ${result.reason}`,
        data: result,
        executionTimeMs: Date.now() - startTime
      };
    }
  });

  orchestrator.registerAction({
    actionId: 'guru.get_summary',
    name: 'Get Guru Mode Summary',
    category: 'guru',
    description: 'Get complete Guru Mode status and capabilities',
    requiredRoles: ['root_admin', 'deputy_admin', 'sysop', 'support_manager'],
    handler: async (request: ActionRequest): Promise<ActionResult> => {
      const startTime = Date.now();
      const summary = trinityGuruMode.getGuruModeSummary();

      return {
        success: true,
        actionId: request.actionId,
        message: `Guru Mode: ${summary.capabilities.length} capabilities, ${summary.agentMarketplace.internal} internal agents`,
        data: summary,
        executionTimeMs: Date.now() - startTime
      };
    }
  });

  // -------------------------------------------------------------------------
  // BUSINESS PRO MODE ACTIONS
  // -------------------------------------------------------------------------

  orchestrator.registerAction({
    actionId: 'business_pro.get_playbook',
    name: 'Get Industry Playbook',
    category: 'business_pro',
    description: 'Get revenue optimization playbook for specific industry vertical',
    requiredRoles: ['root_admin', 'deputy_admin', 'org_owner', 'co_owner'],
    /* DEFERRED — requires real org data integration before production use */
    isDeferred: true,
    handler: async (request: ActionRequest): Promise<ActionResult> => {
      const startTime = Date.now();
      const { vertical } = request.payload || {};

      if (!vertical) {
        const playbooks = trinityBusinessProMode.getAllPlaybooks();
        return {
          success: true,
          actionId: request.actionId,
          message: `${playbooks.length} industry playbooks available`,
          data: { playbooks: playbooks.map(p => ({ vertical: p.vertical, name: p.name })) },
          executionTimeMs: Date.now() - startTime
        };
      }

      const playbook = trinityBusinessProMode.getPlaybook(vertical);
      if (!playbook) {
        return {
          success: false,
          actionId: request.actionId,
          message: `Playbook not found for: ${vertical}`,
          executionTimeMs: Date.now() - startTime
        };
      }

      return {
        success: true,
        actionId: request.actionId,
        message: `${playbook.name}: ${playbook.revenueLevers.length} revenue levers, ${playbook.operationalAutomations.length} automations`,
        data: playbook,
        executionTimeMs: Date.now() - startTime
      };
    }
  });

  orchestrator.registerAction({
    actionId: 'business_pro.discover_money',
    name: 'Discover Hidden Money',
    category: 'business_pro',
    description: 'Run 4-mode money discovery (Recovery, Protection, Growth, Multiplication)',
    requiredRoles: ['root_admin', 'deputy_admin', 'org_owner', 'co_owner'],
    /* DEFERRED — requires real org data integration before production use */
    isDeferred: true,
    handler: async (request: ActionRequest): Promise<ActionResult> => {
      const startTime = Date.now();
      const { mode, vertical, businessData } = request.payload || {};

      if (!mode || !vertical) {
        return {
          success: false,
          actionId: request.actionId,
          message: 'Missing required fields: mode (recovery|protection|growth|multiplication), vertical',
          executionTimeMs: Date.now() - startTime
        };
      }

      const discoveries = await trinityBusinessProMode.discoverMoney(mode, vertical, businessData || {});
      const totalValue = discoveries.reduce((sum, d) => sum + d.estimatedValue, 0);

      return {
        success: true,
        actionId: request.actionId,
        message: `Found ${discoveries.length} opportunities worth $${totalValue.toLocaleString()}`,
        data: discoveries,
        executionTimeMs: Date.now() - startTime
      };
    }
  });

  orchestrator.registerAction({
    actionId: 'business_pro.run_benchmark',
    name: 'Run Benchmark Analysis',
    category: 'business_pro',
    description: 'Compare performance against industry standards or top quartile',
    requiredRoles: ['root_admin', 'deputy_admin', 'org_owner', 'co_owner'],
    /* DEFERRED — requires real org data integration before production use */
    isDeferred: true,
    handler: async (request: ActionRequest): Promise<ActionResult> => {
      const startTime = Date.now();
      const { vertical, currentMetrics, tier } = request.payload || {};

      if (!vertical || !currentMetrics) {
        return {
          success: false,
          actionId: request.actionId,
          message: 'Missing required fields: vertical, currentMetrics',
          executionTimeMs: Date.now() - startTime
        };
      }

      const analyses = trinityBusinessProMode.runBenchmarkAnalysis(
        vertical, 
        currentMetrics, 
        tier || 'industry_standards'
      );

      const gapsFound = analyses.filter(a => a.gapPercent > 10).length;

      return {
        success: true,
        actionId: request.actionId,
        message: `${gapsFound} improvement opportunities identified across ${analyses.length} benchmarks`,
        data: analyses,
        executionTimeMs: Date.now() - startTime
      };
    }
  });

  orchestrator.registerAction({
    actionId: 'business_pro.calculate_roi',
    name: 'Calculate Total ROI',
    category: 'business_pro',
    description: 'Calculate 3-year ROI projection across all money discovery modes',
    requiredRoles: ['root_admin', 'deputy_admin', 'org_owner', 'co_owner'],
    /* DEFERRED — requires real org data integration before production use */
    isDeferred: true,
    handler: async (request: ActionRequest): Promise<ActionResult> => {
      const startTime = Date.now();
      const { recoveryData, protectionData, growthData, multiplicationData, investmentCost } = request.payload || {};

      const recovery = recoveryData 
        ? trinityBusinessProMode.calculateRecoveryROI(recoveryData)
        : { unbilledHours: 0, pricingErrors: 0, wasteReduction: 0, processFixes: 0, total: 0, timeToValue: '0-30 days' as const, confidence: 0.95 as const };

      const protection = protectionData
        ? trinityBusinessProMode.calculateProtectionROI(protectionData)
        : { churnPrevented: 0, fraudStopped: 0, marginProtected: 0, complianceSaved: 0, total: 0, timeToValue: '30-90 days' as const, confidence: 0.85 as const };

      const growth = growthData
        ? trinityBusinessProMode.calculateGrowthROI(growthData)
        : { upsellRevenue: 0, crossSellRevenue: 0, pricingOptimization: 0, marketExpansion: 0, total: 0, timeToValue: '90-180 days' as const, confidence: 0.75 as const };

      const multiplication = multiplicationData
        ? trinityBusinessProMode.calculateMultiplicationROI(multiplicationData)
        : { referrals: 0, retention: 0, efficiency: 0, premium: 0, total: 0, timeToValue: '180-365 days' as const, confidence: 0.65 as const };

      const totalValue = trinityBusinessProMode.calculateTotalValue(
        recovery,
        protection,
        growth,
        multiplication,
        investmentCost || 10000
      );

      return {
        success: true,
        actionId: request.actionId,
        message: `3-Year ROI: ${totalValue.threeYearROI}x, Payback: ${totalValue.paybackPeriod}`,
        data: { recovery, protection, growth, multiplication, totalValue },
        executionTimeMs: Date.now() - startTime
      };
    }
  });

  orchestrator.registerAction({
    actionId: 'business_pro.get_agents',
    name: 'Get Business Pro Agents',
    category: 'business_pro',
    description: 'List all 8 Business Pro specialized agents',
    requiredRoles: ['root_admin', 'deputy_admin', 'org_owner', 'co_owner', 'support_manager'],
    /* DEFERRED — requires real org data integration before production use */
    isDeferred: true,
    handler: async (request: ActionRequest): Promise<ActionResult> => {
      const startTime = Date.now();
      const agents = trinityBusinessProMode.getBusinessProAgents();

      return {
        success: true,
        actionId: request.actionId,
        message: `${agents.length} Business Pro agents available`,
        data: agents,
        executionTimeMs: Date.now() - startTime
      };
    }
  });

  orchestrator.registerAction({
    actionId: 'business_pro.get_summary',
    name: 'Get Business Pro Summary',
    category: 'business_pro',
    description: 'Get complete Business Pro Mode status and capabilities',
    requiredRoles: ['root_admin', 'deputy_admin', 'org_owner', 'co_owner'],
    /* DEFERRED — requires real org data integration before production use */
    isDeferred: true,
    handler: async (request: ActionRequest): Promise<ActionResult> => {
      const startTime = Date.now();
      const summary = trinityBusinessProMode.getBusinessProSummary();

      return {
        success: true,
        actionId: request.actionId,
        message: `Business Pro: ${summary.agents} agents, ${summary.playbooks} playbooks, $${summary.moneyDiscovered.toLocaleString()} discovered`,
        data: summary,
        executionTimeMs: Date.now() - startTime
      };
    }
  });

  // -------------------------------------------------------------------------
  // TRINITY KNOWLEDGE ACTION
  // -------------------------------------------------------------------------

  orchestrator.registerAction({
    actionId: 'trinity.get_knowledge',
    name: 'Get Trinity Knowledge',
    category: 'trinity',
    description: 'Get complete Trinity knowledge about Guru Mode and Business Pro Mode capabilities',
    requiredRoles: ['root_admin', 'deputy_admin', 'sysop', 'support_manager', 'org_owner'],
    handler: async (request: ActionRequest): Promise<ActionResult> => {
      const startTime = Date.now();
      
      const knowledge = trinityBusinessProMode.getTrinityKnowledge();
      const guruSummary = trinityGuruMode.getGuruModeSummary();
      const businessProSummary = trinityBusinessProMode.getBusinessProSummary();

      return {
        success: true,
        actionId: request.actionId,
        message: 'Trinity knowledge retrieved: Enhanced Guru Mode + Business Pro Mode',
        data: {
          knowledge,
          guruMode: guruSummary,
          businessProMode: businessProSummary,
          trinityAwareness: {
            lastUpdated: new Date().toISOString(),
            version: '2.0.0',
            enhancements: [
              'Enhanced Guru Mode with 6 intelligence systems',
              'Business Pro Mode with Revenue Intelligence Engine',
              '8 industry vertical playbooks',
              '4 money discovery modes with ROI calculator',
              '3-tier agent trust marketplace',
              'Industry-specific compliance frameworks',
            ]
          }
        },
        executionTimeMs: Date.now() - startTime
      };
    }
  });

  log.info('[TrinityEnhanced] Registered 12 enhanced mode actions (6 Guru + 5 BusinessPro + 1 Knowledge)');
}
