/**
 * UI SHELL BRAIN ACTIONS
 * =======================
 * Registers UI Shell validation and audit capabilities with the AI Brain Master Orchestrator.
 * 
 * Follows the 7-Step Execution Pattern:
 * 1. TRIGGER - Register audit operation
 * 2. FETCH - Get validation rules and current state
 * 3. VALIDATE - Check inputs and permissions
 * 4. PROCESS - Execute the validation scan
 * 5. MUTATE - Log results to audit trail
 * 6. CONFIRM - Verify logging succeeded
 * 7. NOTIFY - Dispatch notifications based on outcome
 */

import { helpaiOrchestrator, type ActionRequest, type ActionResult } from '../helpai/platformActionHub';
import { 
  uiShellValidation, 
  SHELL_VALIDATION_RULES,
  type ShellValidationType,
  isValidShellValidationType
} from '../uiShellValidation';
import { createLogger } from '../../lib/logger';
const log = createLogger('uiShellBrainActions');

export function registerUIShellBrainActions(): void {
  log.info('[UIShell Brain] Registering UI shell validation actions...');

  helpaiOrchestrator.registerAction({
    actionId: 'ui_shell.get_rules',
    name: 'Get UI Shell Validation Rules',
    category: 'system',
    description: 'Get all UI shell validation rules for the 7-step containment system',
    requiredRoles: ['root_admin', 'deputy_admin', 'sysop'],
    handler: async (request: ActionRequest): Promise<ActionResult> => {
      const startTime = Date.now();
      
      try {
        const rules = uiShellValidation.getRules();
        
        return {
          success: true,
          actionId: request.actionId,
          data: {
            rules,
            count: rules.length,
            categories: [...new Set(rules.map(r => r.type))],
          },
          message: `Found ${rules.length} UI shell validation rules`,
          executionTimeMs: Date.now() - startTime
        };
      } catch (error: any) {
        return {
          success: false,
          actionId: request.actionId,
          message: `Failed to get rules: ${(error instanceof Error ? error.message : String(error))}`,
          executionTimeMs: Date.now() - startTime
        };
      }
    }
  });

  helpaiOrchestrator.registerAction({
    actionId: 'ui_shell.get_rules_by_type',
    name: 'Get UI Shell Rules By Type',
    category: 'system',
    description: 'Get UI shell validation rules filtered by type',
    requiredRoles: ['root_admin', 'deputy_admin', 'sysop'],
    handler: async (request: ActionRequest): Promise<ActionResult> => {
      const startTime = Date.now();
      
      try {
        const type = request.payload?.type as string;
        
        if (!type || !isValidShellValidationType(type)) {
          return {
            success: false,
            actionId: request.actionId,
            message: `Invalid type. Valid types: overflow_check, flex_containment, table_containment, modal_scroll_lock, data_formatting, spacing_consistency, full_audit`,
            executionTimeMs: Date.now() - startTime
          };
        }
        
        const rules = uiShellValidation.getRulesByType(type);
        
        return {
          success: true,
          actionId: request.actionId,
          data: {
            rules,
            count: rules.length,
            type,
          },
          message: `Found ${rules.length} rules for type: ${type}`,
          executionTimeMs: Date.now() - startTime
        };
      } catch (error: any) {
        return {
          success: false,
          actionId: request.actionId,
          message: `Failed to get rules: ${(error instanceof Error ? error.message : String(error))}`,
          executionTimeMs: Date.now() - startTime
        };
      }
    }
  });

  helpaiOrchestrator.registerAction({
    actionId: 'ui_shell.run_audit',
    name: 'Run UI Shell Audit',
    category: 'system',
    description: 'Run full UI shell audit with 7-step pipeline (validates overflow, flex, tables, modals, data formatting)',
    requiredRoles: ['root_admin', 'deputy_admin', 'sysop'],
    handler: async (request: ActionRequest): Promise<ActionResult> => {
      const startTime = Date.now();
      
      try {
        const report = await uiShellValidation.runFullAudit(request.workspaceId);
        
        return {
          success: true,
          actionId: request.actionId,
          data: report,
          message: `Audit complete - Score: ${report.overallScore}% (${report.passed}/${report.totalChecks} passed)`,
          executionTimeMs: Date.now() - startTime
        };
      } catch (error: any) {
        return {
          success: false,
          actionId: request.actionId,
          message: `Audit failed: ${(error instanceof Error ? error.message : String(error))}`,
          executionTimeMs: Date.now() - startTime
        };
      }
    }
  });

  helpaiOrchestrator.registerAction({
    actionId: 'ui_shell.validate_content',
    name: 'Validate Content Against Shell Rules',
    category: 'system',
    description: 'Validate file content against UI shell rules (pass content and filename)',
    requiredRoles: ['root_admin', 'deputy_admin', 'sysop'],
    handler: async (request: ActionRequest): Promise<ActionResult> => {
      const startTime = Date.now();
      
      try {
        const { content, filename } = request.payload || {};
        
        if (!content || !filename) {
          return {
            success: false,
            actionId: request.actionId,
            message: 'Missing required payload: content and filename',
            executionTimeMs: Date.now() - startTime
          };
        }
        
        const results = uiShellValidation.validateContent(content, filename);
        const passed = results.filter(r => r.passed).length;
        const failed = results.filter(r => !r.passed).length;
        
        return {
          success: true,
          actionId: request.actionId,
          data: {
            results,
            summary: {
              passed,
              failed,
              total: results.length,
              score: results.length > 0 ? Math.round((passed / results.length) * 100) : 100,
            },
          },
          message: `Validation complete: ${passed}/${results.length} rules passed`,
          executionTimeMs: Date.now() - startTime
        };
      } catch (error: any) {
        return {
          success: false,
          actionId: request.actionId,
          message: `Validation failed: ${(error instanceof Error ? error.message : String(error))}`,
          executionTimeMs: Date.now() - startTime
        };
      }
    }
  });

  helpaiOrchestrator.registerAction({
    actionId: 'ui_shell.get_shell_spec',
    name: 'Get UI Shell Specification',
    category: 'system',
    description: 'Get the complete UI shell specification including CSS rules, component patterns, and best practices',
    requiredRoles: ['employee', 'manager', 'org_admin', 'root_admin'],
    handler: async (request: ActionRequest): Promise<ActionResult> => {
      const startTime = Date.now();
      
      const spec = {
        name: 'Universal 7-Step Shell System',
        version: '1.0.0',
        components: {
          WorkspaceShell: {
            description: 'Primary layout component with proper containment',
            props: ['sidebar', 'header', 'sidebarWidth', 'headerHeight', 'maxContentWidth', 'contentPadding'],
          },
          DataRegion: {
            description: 'Table/grid containment wrapper for horizontal scroll',
            props: ['minWidth', 'className'],
          },
          TableScroll: {
            description: 'Specialized DataRegion for tables',
            props: ['minWidth', 'className'],
          },
          ModalOverlay: {
            description: 'Modal with proper scroll lock and overlay',
            props: ['isOpen', 'onClose', 'maxWidth', 'maxHeight'],
          },
        },
        utilities: {
          formatNumber: 'Defensive number formatting (handles NaN)',
          formatCurrency: 'Currency formatting with fallback',
          formatPercent: 'Percentage formatting with fallback',
          safeNumber: 'Safe number conversion with fallback',
        },
        cssClasses: {
          'workspace-shell': 'Primary shell container',
          'shell-sidebar': 'Sidebar with proper containment',
          'shell-main-area': 'Main content area with min-width: 0',
          'shell-header': 'Fixed header',
          'shell-page-container': 'Scroll owner (single per page)',
          'shell-page-content': 'Max-width constrained content',
          'data-region': 'Table containment wrapper',
          'data-scroll': 'Horizontal scroll container',
          'modal-overlay': 'Fixed overlay with scroll lock',
          'modal-content': 'Constrained modal content',
          'flex-shrink-fix': 'min-width: 0 / min-height: 0',
          'table-contained': 'Table containment helper',
        },
        criticalRules: [
          'Never use 100vw (includes scrollbar width ~15-17px on Windows)',
          'Always use min-width: 0 on flex children',
          'Tables must scroll inside their region only',
          'Only ONE scroll owner per page',
          'Modals must lock background scroll',
          'Never display raw NaN to users',
          'Consistent spacing: 24px padding, 1440px max-width',
        ],
      };
      
      return {
        success: true,
        actionId: request.actionId,
        data: spec,
        message: 'UI Shell specification retrieved',
        executionTimeMs: Date.now() - startTime
      };
    }
  });

  log.info('[UIShell Brain] Registered 5 UI shell validation actions');
}
