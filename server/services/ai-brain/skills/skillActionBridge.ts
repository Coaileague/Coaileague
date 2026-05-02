/**
 * Skill ↔ Action Bridge
 * =====================
 * Exposes the AI-Brain skill registry through Trinity's action surface so
 * Trinity (and HelpAI, contractors, scheduled jobs) can invoke any registered
 * skill via the same `helpaiOrchestrator.executeAction()` path used for every
 * other capability — with the registry's RBAC + audit + dependency-check
 * guarantees firing automatically.
 *
 * Before this bridge existed, `skillRegistry.executeSkill()` was loaded with
 * 7 skills (payroll-validation, invoice-reconciliation, intelligent-scheduler,
 * trinity-staffing, document-generator, data-research, financial-math-verifier)
 * but had ZERO callers anywhere in the codebase — Trinity could load the
 * skills but had no way to invoke them.
 *
 * This file installs three discovery actions and one execution action:
 *   skills.list              — list available skills for the caller's context
 *   skills.get_manifest      — fetch a skill manifest by id
 *   skills.health            — registry health check (total / healthy / unhealthy)
 *   skill.execute            — execute any skill by id with RBAC + audit
 */

import { helpaiOrchestrator } from '../../helpai/platformActionHub';
import type { ActionHandler, ActionRequest, ActionResult } from '../../helpai/platformActionHub';
import { skillRegistry } from './skill-registry';
import type { SkillContext } from './types';
import { createLogger } from '../../../lib/logger';
const log = createLogger('skillActionBridge');

function buildSkillContext(req: ActionRequest): SkillContext {
  return {
    userId: (req as Record<string,unknown>).userId || (req.payload as Record<string,unknown>)?.userId || 'system',
    workspaceId: req.workspaceId || (req.payload as Record<string,unknown>)?.workspaceId || '',
    employeeId: (req.payload as Record<string,unknown>)?.employeeId,
    workspaceRole: (req as Record<string,unknown>).workspaceRole || (req.payload as Record<string,unknown>)?.workspaceRole,
    platformRole: (req as Record<string,unknown>).platformRole || (req.payload as Record<string,unknown>)?.platformRole,
    subscriptionTier: (req.payload as Record<string,unknown>)?.subscriptionTier,
  };
}

export function registerSkillBridgeActions(): void {
  const listSkills: ActionHandler = {
    actionId: 'skills.list',
    name: 'List Available Skills',
    category: 'intelligence' as unknown,
    description:
      'Returns the manifests of every skill the caller is authorized to execute, after RBAC + tier checks. Used by Trinity to decide which skill to delegate work to.',
    requiredRoles: [],
    handler: async (request: ActionRequest): Promise<ActionResult> => {
      const start = Date.now();
      try {
        const context = buildSkillContext(request);
        const manifests = await skillRegistry.getAvailableSkills(context);
        return {
          success: true,
          actionId: request.actionId,
          message: `${manifests.length} skill(s) available`,
          data: { skills: manifests, count: manifests.length },
          executionTimeMs: Date.now() - start,
        };
      } catch (err: unknown) {
        return {
          success: false,
          actionId: request.actionId,
          message: `skills.list error: ${(err instanceof Error ? err.message : String(err)) || String(err)}`,
          executionTimeMs: Date.now() - start,
        };
      }
    },
  };
  helpaiOrchestrator.registerAction(listSkills);

  const getManifest: ActionHandler = {
    actionId: 'skills.get_manifest',
    name: 'Get Skill Manifest',
    category: 'intelligence' as unknown,
    description:
      'Returns the manifest for a single skill by id (capabilities, requiredTier, requiredRole, dependencies).',
    requiredRoles: [],
    handler: async (request: ActionRequest): Promise<ActionResult> => {
      const start = Date.now();
      const skillId = (request.payload as unknown)?.skillId || (request.payload as unknown)?.id;
      if (!skillId) {
        return {
          success: false,
          actionId: request.actionId,
          message: 'skills.get_manifest requires payload.skillId',
          executionTimeMs: Date.now() - start,
        };
      }
      const skill = skillRegistry.getSkill(skillId);
      if (!skill) {
        return {
          success: false,
          actionId: request.actionId,
          message: `Skill not found: ${skillId}`,
          executionTimeMs: Date.now() - start,
        };
      }
      return {
        success: true,
        actionId: request.actionId,
        message: 'OK',
        data: { manifest: skill.getManifest() },
        executionTimeMs: Date.now() - start,
      };
    },
  };
  helpaiOrchestrator.registerAction(getManifest);

  const skillHealth: ActionHandler = {
    actionId: 'skills.health',
    name: 'Skill Registry Health',
    category: 'intelligence' as unknown,
    description:
      'Returns total / healthy / unhealthy skill counts so Trinity can route around skills that are degraded.',
    requiredRoles: [],
    handler: async (request: ActionRequest): Promise<ActionResult> => {
      const start = Date.now();
      try {
        const health = await skillRegistry.getHealth();
        return {
          success: true,
          actionId: request.actionId,
          message: `${health.healthySkills}/${health.totalSkills} skills healthy`,
          data: health,
          executionTimeMs: Date.now() - start,
        };
      } catch (err: unknown) {
        return {
          success: false,
          actionId: request.actionId,
          message: `skills.health error: ${(err instanceof Error ? err.message : String(err)) || String(err)}`,
          executionTimeMs: Date.now() - start,
        };
      }
    },
  };
  helpaiOrchestrator.registerAction(skillHealth);

  const skillExecute: ActionHandler = {
    actionId: 'skill.execute',
    name: 'Execute Skill',
    category: 'intelligence' as unknown,
    description:
      'Executes a registered skill by id. Routes through skillRegistry.executeSkill() so RBAC, tier gating, dependency checks, and audit logging fire automatically. Inputs: skillId, params (skill-specific).',
    requiredRoles: [],
    handler: async (request: ActionRequest): Promise<ActionResult> => {
      const start = Date.now();
      const skillId = (request.payload as unknown)?.skillId || (request.payload as unknown)?.id;
      const params = (request.payload as unknown)?.params ?? (request.payload as unknown) ?? {};
      if (!skillId) {
        return {
          success: false,
          actionId: request.actionId,
          message: 'skill.execute requires payload.skillId',
          executionTimeMs: Date.now() - start,
        };
      }
      const context = buildSkillContext(request);
      const result = await skillRegistry.executeSkill(skillId, context, params);
      return {
        success: result.success,
        actionId: request.actionId,
        message: result.success ? 'Skill executed' : (result.error || 'Skill execution failed'),
        data: result.data ?? result.metadata,
        executionTimeMs: Date.now() - start,
      };
    },
  };
  helpaiOrchestrator.registerAction(skillExecute);

  log.info('[skillActionBridge] Registered 4 skill-bridge actions: skills.list, skills.get_manifest, skills.health, skill.execute');
}
