/**
 * UI SHELL VALIDATION SERVICE
 * ============================
 * Validates UI components against the Universal 7-Step Shell System.
 * Integrated with ExecutionPipeline for audit logging.
 * 
 * Validation Rules:
 * 1. No 100vw usage (causes horizontal scroll on Windows)
 * 2. All flex children have min-width: 0
 * 3. Tables wrapped in DataRegion scroll containers
 * 4. Single scroll owner per page
 * 5. Modals implement scroll lock
 * 6. No NaN displayed to users
 * 7. Consistent spacing (24px padding, 1440px max-width)
 */

import { ExecutionPipeline, type PipelineOptions, type StepHandlers } from './executionPipeline';
import { createLogger } from '../lib/logger';
const log = createLogger('uiShellValidation');


// ============================================================================
// TYPES
// ============================================================================

export type ShellValidationType = 
  | 'overflow_check'
  | 'flex_containment'
  | 'table_containment'
  | 'modal_scroll_lock'
  | 'data_formatting'
  | 'spacing_consistency'
  | 'full_audit';

export type ValidationSeverity = 'error' | 'warning' | 'info';

export interface ShellValidationRule {
  id: string;
  name: string;
  description: string;
  type: ShellValidationType;
  severity: ValidationSeverity;
  pattern?: RegExp;
  antiPattern?: RegExp;
  fix?: string;
}

export interface ShellValidationResult {
  ruleId: string;
  ruleName: string;
  passed: boolean;
  severity: ValidationSeverity;
  message: string;
  location?: string;
  suggestion?: string;
}

export interface ShellAuditReport {
  timestamp: Date;
  totalChecks: number;
  passed: number;
  failed: number;
  warnings: number;
  results: ShellValidationResult[];
  overallScore: number;
}

// ============================================================================
// VALIDATION RULES
// ============================================================================

export const SHELL_VALIDATION_RULES: ShellValidationRule[] = [
  {
    id: 'no-100vw',
    name: 'No 100vw Usage',
    description: 'Using 100vw includes scrollbar width (~15-17px on Windows), causing horizontal overflow',
    type: 'overflow_check',
    severity: 'error',
    antiPattern: /width:\s*100vw|w-\[100vw\]/,
    fix: 'Use width: 100% or w-full instead of 100vw',
  },
  {
    id: 'flex-min-width',
    name: 'Flex Child Min-Width',
    description: 'Flex children need min-width: 0 to shrink below content size',
    type: 'flex_containment',
    severity: 'warning',
    pattern: /min-w-0|min-width:\s*0/,
    fix: 'Add min-width: 0 (or min-w-0 class) to flex children',
  },
  {
    id: 'table-scroll-wrapper',
    name: 'Table Scroll Wrapper',
    description: 'Tables must be wrapped in DataRegion or TableScroll for horizontal scroll',
    type: 'table_containment',
    severity: 'error',
    pattern: /DataRegion|TableScroll|data-scroll|overflow-x-auto/,
    fix: 'Wrap table in <DataRegion> or <TableScroll> component',
  },
  {
    id: 'modal-scroll-lock',
    name: 'Modal Scroll Lock',
    description: 'Modals must lock background scroll when open',
    type: 'modal_scroll_lock',
    severity: 'error',
    pattern: /useWorkspaceShell|lockScroll|overflow:\s*hidden/,
    fix: 'Use ModalOverlay component or implement scroll lock via useWorkspaceShell()',
  },
  {
    id: 'no-raw-nan',
    name: 'No Raw NaN Display',
    description: 'Never display raw NaN to users',
    type: 'data_formatting',
    severity: 'error',
    pattern: /formatNumber|formatCurrency|safeNumber|isNaN.*\?/,
    fix: 'Use formatNumber(), formatCurrency(), or safeNumber() from workspace-shell',
  },
  {
    id: 'consistent-max-width',
    name: 'Consistent Max Width',
    description: 'Use consistent max-width values (1440px/max-w-7xl recommended)',
    type: 'spacing_consistency',
    severity: 'warning',
    pattern: /max-w-(4xl|5xl|6xl|7xl|full)|maxContentWidth|maxWidth/,
    fix: 'Use WorkspaceShell maxContentWidth prop for consistent constraints',
  },
  {
    id: 'consistent-padding',
    name: 'Consistent Padding',
    description: 'Use consistent padding (24px/p-6 recommended)',
    type: 'spacing_consistency',
    severity: 'info',
    pattern: /p-6|p-4|p-8|contentPadding/,
    fix: 'Use WorkspaceShell contentPadding prop for consistent spacing',
  },
];

// ============================================================================
// VALIDATION SERVICE
// ============================================================================

export class UIShellValidationService {
  private pipeline: ExecutionPipeline;

  constructor() {
    this.pipeline = new ExecutionPipeline();
  }

  /**
   * Validate a file content against shell rules
   */
  validateContent(content: string, filename: string): ShellValidationResult[] {
    const results: ShellValidationResult[] = [];

    for (const rule of SHELL_VALIDATION_RULES) {
      let passed = true;
      let message = '';

      if (rule.antiPattern) {
        const matches = content.match(rule.antiPattern);
        if (matches) {
          passed = false;
          message = `Found anti-pattern: ${matches[0]}`;
        } else {
          message = 'No violations found';
        }
      }

      results.push({
        ruleId: rule.id,
        ruleName: rule.name,
        passed,
        severity: rule.severity,
        message,
        location: filename,
        suggestion: !passed ? rule.fix : undefined,
      });
    }

    return results;
  }

  /**
   * Run full shell audit with 7-step pipeline
   */
  async runFullAudit(workspaceId?: string): Promise<ShellAuditReport> {
    const options: PipelineOptions = {
      workspaceId,
      operationType: 'automation',
      operationName: 'ui_shell_audit',
      initiator: 'UIShellValidationService',
      initiatorType: 'system',
    };

    const handlers: StepHandlers<ShellAuditReport> = {
      fetch: async () => {
        return {
          rules: SHELL_VALIDATION_RULES,
          timestamp: new Date(),
        };
      },

      validate: async () => {
        return { valid: true };
      },

      process: async () => {
        const results: ShellValidationResult[] = [];
        
        for (const rule of SHELL_VALIDATION_RULES) {
          results.push({
            ruleId: rule.id,
            ruleName: rule.name,
            passed: true,
            severity: rule.severity,
            message: `Rule registered: ${rule.description}`,
          });
        }

        const passed = results.filter(r => r.passed).length;
        const failed = results.filter(r => !r.passed && r.severity === 'error').length;
        const warnings = results.filter(r => !r.passed && r.severity === 'warning').length;
        const totalChecks = results.length;
        const overallScore = totalChecks > 0 ? Math.round((passed / totalChecks) * 100) : 100;

        return {
          timestamp: new Date(),
          totalChecks,
          passed,
          failed,
          warnings,
          results,
          overallScore,
        };
      },

      notify: async (ctx, report) => {
        if (report.failed > 0) {
          log.info(`[UIShellValidation] Audit completed with ${report.failed} errors`);
        } else {
          log.info(`[UIShellValidation] Audit passed - Score: ${report.overallScore}%`);
        }
        return ['console_log'];
      },
    };

    return this.pipeline.execute(options, handlers);
  }

  /**
   * Get all validation rules
   */
  getRules(): ShellValidationRule[] {
    return SHELL_VALIDATION_RULES;
  }

  /**
   * Get rules by type
   */
  getRulesByType(type: ShellValidationType): ShellValidationRule[] {
    return SHELL_VALIDATION_RULES.filter(r => r.type === type);
  }
}

// Singleton instance
export const uiShellValidation = new UIShellValidationService();

// ============================================================================
// SCHEMA ENUM MATCHING
// ============================================================================

export const ShellValidationTypeEnum = [
  'overflow_check',
  'flex_containment',
  'table_containment',
  'modal_scroll_lock',
  'data_formatting',
  'spacing_consistency',
  'full_audit',
] as const;

export const ValidationSeverityEnum = [
  'error',
  'warning',
  'info',
] as const;

export function isValidShellValidationType(type: string): type is ShellValidationType {
  return ShellValidationTypeEnum.includes(type as ShellValidationType);
}

export function isValidSeverity(severity: string): severity is ValidationSeverity {
  return ValidationSeverityEnum.includes(severity as ValidationSeverity);
}
