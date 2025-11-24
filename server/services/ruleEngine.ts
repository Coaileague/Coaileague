/**
 * CUSTOM WORKFLOW RULES ENGINE (Monopolistic Feature #2)
 * Drag-and-drop automation for AI Payroll™ and AI Scheduling™
 * 
 * Allows workspace owners to create custom IF/THEN rules like:
 * - IF employee works > 40 hours => THEN apply 1.5x overtime
 * - IF schedule has < 3 staff => THEN alert manager
 * - IF employee late > 3 times => THEN send warning email
 */

import { db } from "../db";
import { eq, and, desc } from "drizzle-orm";
import {
  customRules,
  ruleExecutionLogs,
} from "../../shared/schema";
import { emailService } from "./emailService";

export type RuleCondition = {
  field: string; // e.g., "hours_worked", "staffing_count", "tardiness_count"
  operator: "gt" | "lt" | "eq" | "gte" | "lte" | "contains";
  value: number | string;
};

export type RuleAction = {
  type: "multiply_rate" | "send_alert" | "send_email" | "block_action" | "auto_approve";
  params: Record<string, any>;
};

export type RuleDefinition = {
  trigger: "payroll_calculation" | "schedule_validation" | "time_entry" | "invoice_generation";
  conditions: RuleCondition[];
  conditionOperator: "AND" | "OR"; // How to combine multiple conditions
  actions: RuleAction[];
};

export class RuleEngine {
  /**
   * Execute all active rules for a specific trigger
   */
  static async executeRules(
    workspaceId: string,
    trigger: RuleDefinition['trigger'],
    context: Record<string, any>
  ): Promise<{
    applied: number;
    blocked: boolean;
    modifications: Record<string, any>;
    alerts: string[];
  }> {
    // Fetch all active rules for this trigger (check status = 'active')
    const rules = await db
      .select()
      .from(customRules)
      .where(and(
        eq(customRules.workspaceId, workspaceId),
        eq(customRules.status, 'active'),
        eq(customRules.trigger, trigger as string)
      ))
      .orderBy(desc(customRules.priority));

    const result = {
      applied: 0,
      blocked: false,
      modifications: {},
      alerts: [] as string[],
    };

    // Execute each rule in priority order
    for (const rule of rules) {
      // Parse conditions and actions from JSONB
      const ruleConditions = (rule.conditions || []) as RuleCondition[];
      const ruleActions = (rule.actions || []) as RuleAction[];
      
      // Get condition operator from rule (stored in conditionLogic field)
      const conditionOperator: "AND" | "OR" = (rule.conditionLogic as "AND" | "OR") || "AND";
      
      // Evaluate conditions
      const conditionsMet = this.evaluateConditions(
        ruleConditions,
        conditionOperator,
        context
      );

      if (conditionsMet) {
        // Log execution start
        const executionId = await this.logExecution(
          rule.id,
          workspaceId,
          trigger,
          context,
          true
        );

        try {
          // Execute actions
          const actionResults = await this.executeActions(
            ruleActions,
            context,
            result
          );

          result.applied++;
          result.modifications = { ...result.modifications, ...actionResults.modifications };
          result.alerts.push(...actionResults.alerts);
          
          if (actionResults.blocked) {
            result.blocked = true;
          }

          // Log success
          await this.updateExecutionLog(
            executionId,
            true,
            actionResults
          );
        } catch (error: any) {
          console.error(`Rule ${rule.name} execution failed:`, error);
          
          // Log failure (conditions met but execution failed)
          await this.updateExecutionLog(
            executionId,
            false,
            { error: error.message }
          );
        }
      }
    }

    return result;
  }

  /**
   * Evaluate rule conditions against context data
   */
  private static evaluateConditions(
    conditions: RuleCondition[],
    operator: "AND" | "OR",
    context: Record<string, any>
  ): boolean {
    if (conditions.length === 0) return true;

    const results = conditions.map(condition => {
      const contextValue = this.getNestedValue(context, condition.field);
      return this.evaluateCondition(contextValue, condition.operator, condition.value);
    });

    return operator === "AND"
      ? results.every(r => r)
      : results.some(r => r);
  }

  /**
   * Evaluate a single condition
   */
  private static evaluateCondition(
    contextValue: any,
    operator: RuleCondition['operator'],
    ruleValue: number | string
  ): boolean {
    switch (operator) {
      case "gt":
        return Number(contextValue) > Number(ruleValue);
      case "lt":
        return Number(contextValue) < Number(ruleValue);
      case "eq":
        return contextValue == ruleValue; // Loose equality for flexibility
      case "gte":
        return Number(contextValue) >= Number(ruleValue);
      case "lte":
        return Number(contextValue) <= Number(ruleValue);
      case "contains":
        return String(contextValue).includes(String(ruleValue));
      default:
        return false;
    }
  }

  /**
   * Execute rule actions
   */
  private static async executeActions(
    actions: RuleAction[],
    context: Record<string, any>,
    currentResult: any
  ): Promise<{
    modifications: Record<string, any>;
    alerts: string[];
    blocked: boolean;
  }> {
    const result = {
      modifications: {},
      alerts: [] as string[],
      blocked: false,
    };

    for (const action of actions) {
      switch (action.type) {
        case "multiply_rate":
          // Apply overtime multiplier
          const multiplier = parseFloat(action.params.multiplier || '1.5');
          result.modifications = {
            ...result.modifications,
            hourlyRateMultiplier: multiplier,
            overtimeApplied: true
          };
          break;

        case "send_alert":
          // Add alert message
          const alertMessage = action.params.message || "Rule condition met";
          result.alerts.push(alertMessage);
          break;

        case "send_email":
          // Send email via EmailService
          try {
            const emailResult = await emailService.sendCustomEmail(
              action.params.to || action.params.recipientEmail,
              action.params.subject || 'Rule Alert',
              action.params.html || `<p>${action.params.message || 'An automated alert from your business rules'}</p>`,
              action.params.emailType || 'rule_alert',
              context.workspaceId,
              context.userId
            );

            if (emailResult.success) {
              result.alerts.push(`✓ Email sent: ${action.params.subject || 'Rule Alert'}`);
            } else {
              result.alerts.push(`✗ Email failed: ${emailResult.error}`);
            }
          } catch (error: any) {
            console.error('Rule engine email action failed:', error.message);
            result.alerts.push(`Email error: ${error.message}`);
          }
          break;

        case "block_action":
          // Prevent the action from proceeding
          result.blocked = true;
          result.alerts.push(action.params.reason || "Action blocked by automation rule");
          break;

        case "auto_approve":
          // Auto-approve something
          result.modifications = {
            ...result.modifications,
            autoApproved: true
          };
          result.alerts.push("Auto-approved by automation rule");
          break;

        default:
          console.warn(`Unknown action type: ${action.type}`);
      }
    }

    return result;
  }

  /**
   * Get nested value from object using dot notation
   * e.g., "employee.hours_worked" => context.employee.hours_worked
   */
  private static getNestedValue(obj: Record<string, any>, path: string): any {
    return path.split('.').reduce((current, key) => current?.[key], obj);
  }

  /**
   * Log rule execution
   */
  private static async logExecution(
    ruleId: string,
    workspaceId: string,
    triggerEvent: string,
    inputData: Record<string, any>,
    conditionsMet: boolean
  ): Promise<string> {
    const logData = {
      ruleId,
      workspaceId,
      triggerEvent,
      conditionsMet,
      actionsExecuted: null,
      success: conditionsMet,
    };

    const result = await db.insert(ruleExecutionLogs).values(logData).returning();
    return result[0].id;
  }

  /**
   * Update execution log with results
   */
  private static async updateExecutionLog(
    logId: string,
    success: boolean,
    actionsExecuted: any
  ): Promise<void> {
    await db
      .update(ruleExecutionLogs)
      .set({
        success,
        actionsExecuted,
      })
      .where(eq(ruleExecutionLogs.id, logId));
  }

  /**
   * Validate rule definition before saving
   */
  static validateRuleDefinition(ruleDefinition: RuleDefinition): {
    valid: boolean;
    errors: string[];
  } {
    const errors: string[] = [];

    // Validate trigger
    const validTriggers = ["payroll_calculation", "schedule_validation", "time_entry", "invoice_generation"];
    if (!validTriggers.includes(ruleDefinition.trigger)) {
      errors.push(`Invalid trigger: ${ruleDefinition.trigger}`);
    }

    // Validate conditions
    if (!Array.isArray(ruleDefinition.conditions)) {
      errors.push("Conditions must be an array");
    } else {
      ruleDefinition.conditions.forEach((condition, i) => {
        if (!condition.field || !condition.operator) {
          errors.push(`Condition ${i} missing required fields`);
        }
        
        const validOperators = ["gt", "lt", "eq", "gte", "lte", "contains"];
        if (!validOperators.includes(condition.operator)) {
          errors.push(`Condition ${i} has invalid operator: ${condition.operator}`);
        }
      });
    }

    // Validate actions
    if (!Array.isArray(ruleDefinition.actions) || ruleDefinition.actions.length === 0) {
      errors.push("At least one action is required");
    } else {
      ruleDefinition.actions.forEach((action, i) => {
        const validActions = ["multiply_rate", "send_alert", "send_email", "block_action", "auto_approve"];
        if (!validActions.includes(action.type)) {
          errors.push(`Action ${i} has invalid type: ${action.type}`);
        }
      });
    }

    return {
      valid: errors.length === 0,
      errors,
    };
  }

  /**
   * Helper: Create a simple overtime rule
   */
  static createOvertimeRule(
    multiplier: number = 1.5,
    hourThreshold: number = 40
  ): RuleDefinition {
    return {
      trigger: "payroll_calculation",
      conditions: [
        {
          field: "hours_worked",
          operator: "gt",
          value: hourThreshold,
        },
      ],
      conditionOperator: "AND",
      actions: [
        {
          type: "multiply_rate",
          params: { multiplier: multiplier.toString() },
        },
        {
          type: "send_alert",
          params: { message: `Overtime applied: ${multiplier}x for hours over ${hourThreshold}` },
        },
      ],
    };
  }

  /**
   * Helper: Create a minimum staffing rule
   */
  static createMinimumStaffingRule(
    minStaff: number = 3
  ): RuleDefinition {
    return {
      trigger: "schedule_validation",
      conditions: [
        {
          field: "staffing_count",
          operator: "lt",
          value: minStaff,
        },
      ],
      conditionOperator: "AND",
      actions: [
        {
          type: "block_action",
          params: { 
            reason: `Schedule requires at least ${minStaff} staff members`,
          },
        },
        {
          type: "send_alert",
          params: { 
            message: `⚠️ Insufficient staffing: ${minStaff} minimum required`,
          },
        },
      ],
    };
  }
}
