/**
 * Bot Command Executor - Authority enforcement and audit tracking
 * 
 * AUTHORITY MODEL:
 * - System bots operate at Deputy Root authority level
 * - They CANNOT override root_admin actions or delete root_admin roles
 * - They can ONLY soft-delete (set status/flags, never hard-delete records)
 * - All bot-executed commands must be tracked: who ordered it, when, and why
 * 
 * TRACKING:
 * - Every command issued to a bot is logged in audit_logs
 * - Logs include: commanding user, bot identity, timestamp, action, reason, result
 * - This creates full transparency for all bot operations
 */

import { createLogger } from '../lib/logger';
const log = createLogger('botCommandExecutor');
import { storage } from '../storage';
import { getUserPlatformRole, getPlatformRoleLevel } from '../rbac';
import { pool } from '../db';

const BOT_AUTHORITY_LEVEL = 5; // deputy_admin level (cannot override root_admin = 6)
const ROOT_ADMIN_LEVEL = 6;

const FINANCIAL_ACTIONS: BotCommandAction[] = [
  'refund_credits', 'issue_discount', 'process_refund', 'adjust_billing',
  'update_subscription',
];

const FINANCIAL_APPROVAL_MIN_LEVEL = 5;

export type BotCommandAction =
  | 'edit_employee'
  | 'edit_org_info'
  | 'suspend_user'
  | 'unsuspend_user'
  | 'soft_delete_record'
  | 'update_workspace'
  | 'close_ticket'
  | 'reset_password'
  | 'update_subscription'
  | 'sync_data'
  | 'archive_record'
  | 'flag_anomaly'
  | 'refund_credits'
  | 'issue_discount'
  | 'process_refund'
  | 'adjust_billing'
  | 'freeze_user'
  | 'unfreeze_user'
  | 'suspend_employee'
  | 'reactivate_employee';

export interface BotCommandRequest {
  botId: string;
  commandedBy: string; // userId of the human who issued the command
  action: BotCommandAction;
  reason: string;
  targetEntityType: string; // 'employee', 'workspace', 'user', 'ticket', etc.
  targetEntityId: string;
  targetWorkspaceId?: string;
  data?: Record<string, unknown>; // the actual changes to apply
  approvedBy?: string; // userId of the supervisor who approved (for financial actions)
  approvalId?: string; // reference to the approval record
}

export interface BotCommandResult {
  success: boolean;
  message: string;
  auditLogId?: string;
  blockedReason?: string;
  executedAt: string;
}

class BotCommandExecutorService {
  
  /**
   * Execute a bot command with full authority checks and audit trail
   */
  async executeCommand(request: BotCommandRequest): Promise<BotCommandResult> {
    const { botId, commandedBy, action, reason, targetEntityType, targetEntityId, targetWorkspaceId, data } = request;
    const executedAt = new Date().toISOString();

    if (!reason || reason.trim().length < 3) {
      return {
        success: false,
        message: 'A reason is required for all bot commands (minimum 3 characters)',
        executedAt,
      };
    }

    const authorityCheck = await this.checkAuthority(commandedBy, action, targetEntityType, targetEntityId);
    if (!authorityCheck.allowed) {
      await this.logCommand(request, false, authorityCheck.reason, executedAt);
      return {
        success: false,
        message: authorityCheck.reason,
        blockedReason: authorityCheck.reason,
        executedAt,
      };
    }

    if (action === 'soft_delete_record' || action === 'archive_record') {
      const hardDeleteCheck = this.enforceNoHardDelete(data);
      if (!hardDeleteCheck.allowed) {
        await this.logCommand(request, false, hardDeleteCheck.reason, executedAt);
        return {
          success: false,
          message: hardDeleteCheck.reason,
          blockedReason: hardDeleteCheck.reason,
          executedAt,
        };
      }
    }

    if (FINANCIAL_ACTIONS.includes(action)) {
      const financialCheck = await this.checkFinancialApproval(request);
      if (!financialCheck.allowed) {
        await this.logCommand(request, false, financialCheck.reason, executedAt);
        return {
          success: false,
          message: financialCheck.reason,
          blockedReason: financialCheck.reason,
          executedAt,
        };
      }
    }

    const auditLogId = await this.logCommand(request, true, 'Command executed successfully', executedAt);

    // Phase 47: write to bot_execution_logs for observability
    const execStart = Date.now();
    pool.query(
      `INSERT INTO bot_execution_logs
         (bot_id, workspace_id, status, records_reviewed, records_affected, execution_time_ms, metadata)
       VALUES ($1, $2, 'success', 1, 1, $3, $4)`,
      [
        botId,
        request.targetWorkspaceId || null,
        Date.now() - execStart,
        JSON.stringify({ action, targetEntityType, targetEntityId, commandedBy, auditLogId }),
      ]
    ).catch((err: Error) => log.error('[BotCommandExecutor] Failed to write bot_execution_log:', err.message));

    return {
      success: true,
      message: `Bot ${botId} executed ${action} on ${targetEntityType}:${targetEntityId}`,
      auditLogId,
      executedAt,
    };
  }

  /**
   * Check if the bot has authority to perform the action on the target
   */
  private async checkAuthority(
    commandedBy: string,
    action: BotCommandAction,
    targetEntityType: string,
    targetEntityId: string
  ): Promise<{ allowed: boolean; reason: string }> {
    
    const commanderRole = await getUserPlatformRole(commandedBy);
    const commanderLevel = getPlatformRoleLevel(commanderRole);

    if (commanderLevel < 2) {
      return {
        allowed: false,
        reason: `User lacks sufficient platform authority to command bots. Current role: ${commanderRole}`,
      };
    }

    if (targetEntityType === 'user' || targetEntityType === 'platform_role') {
      const targetRole = await getUserPlatformRole(targetEntityId);
      const targetLevel = getPlatformRoleLevel(targetRole);

      if (targetLevel >= ROOT_ADMIN_LEVEL) {
        return {
          allowed: false,
          reason: `Bot authority (Deputy Root) cannot modify root_admin users. Target has role: ${targetRole}`,
        };
      }

      if (targetLevel >= BOT_AUTHORITY_LEVEL) {
        return {
          allowed: false,
          reason: `Bot authority cannot modify users at or above deputy_admin level. Target has role: ${targetRole}`,
        };
      }
    }

    const destructiveActions: BotCommandAction[] = ['soft_delete_record', 'suspend_user', 'reset_password'];
    if (destructiveActions.includes(action) && commanderLevel < 4) {
      return {
        allowed: false,
        reason: `Destructive bot commands require manager-level (4+) platform authority. Current level: ${commanderLevel}`,
      };
    }

    return { allowed: true, reason: 'Authority check passed' };
  }

  private async checkFinancialApproval(request: BotCommandRequest): Promise<{ allowed: boolean; reason: string }> {
    const commanderRole = await getUserPlatformRole(request.commandedBy);
    const commanderLevel = getPlatformRoleLevel(commanderRole);

    if (commanderLevel >= FINANCIAL_APPROVAL_MIN_LEVEL) {
      return { allowed: true, reason: 'Commander has sufficient authority for financial actions' };
    }

    if (request.approvedBy) {
      const approverRole = await getUserPlatformRole(request.approvedBy);
      const approverLevel = getPlatformRoleLevel(approverRole);
      if (approverLevel >= FINANCIAL_APPROVAL_MIN_LEVEL) {
        return { allowed: true, reason: `Financial action approved by ${approverRole} (${request.approvedBy})` };
      }
      return {
        allowed: false,
        reason: `Approver ${request.approvedBy} (${approverRole}, level ${approverLevel}) lacks authority to approve financial actions. Requires level ${FINANCIAL_APPROVAL_MIN_LEVEL}+.`,
      };
    }

    return {
      allowed: false,
      reason: `Financial actions (${request.action}) require approval from sysop+ (level ${FINANCIAL_APPROVAL_MIN_LEVEL}+). Commander ${commanderRole} (level ${commanderLevel}) must request supervisor approval. Set approvedBy in command request.`,
    };
  }

  /**
   * Enforce soft-delete only - bots cannot hard-delete records
   */
  private enforceNoHardDelete(data?: Record<string, unknown>): { allowed: boolean; reason: string } {
    if (data) {
      const hardDeleteIndicators = ['DROP', 'DELETE FROM', 'TRUNCATE', 'hardDelete', 'permanentDelete', 'destroy'];
      const dataStr = JSON.stringify(data).toLowerCase();
      for (const indicator of hardDeleteIndicators) {
        if (dataStr.includes(indicator.toLowerCase())) {
          return {
            allowed: false,
            reason: `Bots can only soft-delete records. Hard-delete operation detected: ${indicator}`,
          };
        }
      }
    }
    
    return { allowed: true, reason: 'Soft-delete check passed' };
  }

  /**
   * Log every bot command to audit_logs for full transparency
   */
  private async logCommand(
    request: BotCommandRequest,
    success: boolean,
    resultMessage: string,
    executedAt: string
  ): Promise<string | undefined> {
    try {
      const log = await storage.createAuditLog({
        userId: request.commandedBy,
        workspaceId: request.targetWorkspaceId || null,
        action: `bot_command_${request.action}`,
        entityType: request.targetEntityType,
        entityId: request.targetEntityId,
        // @ts-expect-error — TS migration: fix in refactoring sprint
        details: {
          botId: request.botId,
          commandedBy: request.commandedBy,
          approvedBy: request.approvedBy || null,
          approvalId: request.approvalId || null,
          action: request.action,
          reason: request.reason,
          targetAgainst: `${request.targetEntityType}:${request.targetEntityId}`,
          success,
          resultMessage,
          executedAt,
          authorityLevel: 'deputy_root',
          isFinancialAction: FINANCIAL_ACTIONS.includes(request.action),
          dataPayload: request.data ? Object.keys(request.data) : [],
        },
        ipAddress: 'system-bot',
      });
      return log?.id?.toString();
    } catch (error) {
      log.error('[BotCommandExecutor] Failed to log command:', error);
      return undefined;
    }
  }

  /**
   * Get command history for a specific bot (queries across all workspaces)
   */
  async getCommandHistory(botId: string, limit: number = 50): Promise<any[]> {
    try {
      const { db } = await import('../db');
      const { auditLogs } = await import('../../shared/schema');
      const { like, desc } = await import('drizzle-orm');
      const logs = await db.select().from(auditLogs)
        .where(like(auditLogs.action, 'bot_command_%'))
        .orderBy(desc(auditLogs.createdAt))
        .limit(limit);
      return logs.filter((log: any) => {
        const details = typeof log.details === 'string' ? JSON.parse(log.details) : log.details;
        return details?.botId === botId;
      });
    } catch (error) {
      log.error('[BotCommandExecutor] Failed to get command history:', error);
      return [];
    }
  }

  /**
   * Get all commands issued by a specific user to any bot
   */
  async getCommandsByUser(userId: string, limit: number = 50): Promise<any[]> {
    try {
      const { db } = await import('../db');
      const { auditLogs } = await import('../../shared/schema');
      const { and, eq, like, desc } = await import('drizzle-orm');
      const logs = await db.select().from(auditLogs)
        .where(and(
          eq(auditLogs.userId, userId),
          like(auditLogs.action, 'bot_command_%')
        ))
        .orderBy(desc(auditLogs.createdAt))
        .limit(limit);
      return logs;
    } catch (error) {
      log.error('[BotCommandExecutor] Failed to get user commands:', error);
      return [];
    }
  }
}

export const botCommandExecutor = new BotCommandExecutorService();
log.info('[BotCommandExecutor] Bot command executor initialized with Deputy Root authority enforcement');
