/**
 * AI Brain Code Editor Service
 * 
 * Enables AI Brain and HelpAI to propose code changes that are staged for user approval.
 * Features:
 * - File read/write operations with diff generation
 * - Staged changes with approval workflow
 * - Integration with What's New for end-user notifications
 * - Rollback support for applied changes
 */

import { db } from '../../db';
import { 
  stagedCodeChanges, 
  codeChangeBatches, 
  batchCodeChangeLinks,
  platformUpdates,
  type InsertStagedCodeChange,
  type StagedCodeChange,
  type InsertCodeChangeBatch,
  type CodeChangeBatch
} from '@shared/schema';
import { eq, and, desc, inArray } from 'drizzle-orm';
import { promises as fs } from 'fs';
import * as path from 'path';
import { publishPlatformUpdate } from '../platformEventBus';
import { broadcastToAllClients } from '../../websocket';
import { featureGateService } from '../billing/featureGateService';

const WORKSPACE_ROOT = process.cwd();
const ALLOWED_EXTENSIONS = ['.ts', '.tsx', '.js', '.jsx', '.json', '.css', '.html', '.md'];
const PROTECTED_PATHS = ['node_modules', '.git', 'dist', 'build', '.env', 'package-lock.json'];

export interface CodeChangeRequest {
  filePath: string;
  changeType: 'create' | 'modify' | 'delete' | 'rename';
  proposedContent?: string;
  newFilePath?: string;
  title: string;
  description: string;
  requestReason?: string;
  conversationId?: string;
  ticketId?: string;
  category?: string;
  affectedModule?: string;
  priority?: number;
}

export interface BatchChangeRequest {
  title: string;
  description: string;
  changes: CodeChangeRequest[];
  conversationId?: string;
  whatsNewTitle?: string;
  whatsNewDescription?: string;
}

export interface ApprovalResult {
  success: boolean;
  message: string;
  changeId?: string;
  appliedAt?: Date;
}

export class AIBrainCodeEditorService {
  private static instance: AIBrainCodeEditorService;

  static getInstance(): AIBrainCodeEditorService {
    if (!this.instance) {
      this.instance = new AIBrainCodeEditorService();
    }
    return this.instance;
  }

  private validateFilePath(filePath: string): { valid: boolean; error?: string } {
    const normalizedPath = path.normalize(filePath);
    
    if (normalizedPath.includes('..')) {
      return { valid: false, error: 'Path traversal not allowed' };
    }

    for (const protectedPath of PROTECTED_PATHS) {
      if (normalizedPath.includes(protectedPath)) {
        return { valid: false, error: `Cannot modify protected path: ${protectedPath}` };
      }
    }

    const ext = path.extname(filePath).toLowerCase();
    if (ext && !ALLOWED_EXTENSIONS.includes(ext)) {
      return { valid: false, error: `File extension not allowed: ${ext}` };
    }

    return { valid: true };
  }

  private async readFileContent(filePath: string): Promise<string | null> {
    try {
      const fullPath = path.join(WORKSPACE_ROOT, filePath);
      const content = await fs.readFile(fullPath, 'utf-8');
      return content;
    } catch (error) {
      return null;
    }
  }

  private generateUnifiedDiff(original: string | null, proposed: string | null, filePath: string): string {
    if (!original && proposed) {
      return `--- /dev/null\n+++ ${filePath}\n@@ -0,0 +1,${proposed.split('\n').length} @@\n${proposed.split('\n').map(line => `+${line}`).join('\n')}`;
    }
    
    if (original && !proposed) {
      return `--- ${filePath}\n+++ /dev/null\n@@ -1,${original.split('\n').length} +0,0 @@\n${original.split('\n').map(line => `-${line}`).join('\n')}`;
    }

    if (original && proposed) {
      const origLines = original.split('\n');
      const propLines = proposed.split('\n');
      
      let diff = `--- ${filePath}\n+++ ${filePath}\n`;
      let contextLines: string[] = [];
      let changes: string[] = [];
      let lineNum = 1;
      
      const maxLen = Math.max(origLines.length, propLines.length);
      for (let i = 0; i < maxLen; i++) {
        const origLine = origLines[i] ?? '';
        const propLine = propLines[i] ?? '';
        
        if (origLine === propLine) {
          if (changes.length > 0) {
            diff += changes.join('\n') + '\n';
            changes = [];
          }
          contextLines.push(` ${origLine}`);
          if (contextLines.length > 3) contextLines.shift();
        } else {
          if (contextLines.length > 0 && changes.length === 0) {
            diff += `@@ -${lineNum},${origLines.length - lineNum + 1} +${lineNum},${propLines.length - lineNum + 1} @@\n`;
            diff += contextLines.join('\n') + '\n';
            contextLines = [];
          }
          if (origLines[i] !== undefined) {
            changes.push(`-${origLine}`);
          }
          if (propLines[i] !== undefined) {
            changes.push(`+${propLine}`);
          }
        }
        lineNum++;
      }
      
      if (changes.length > 0) {
        diff += changes.join('\n') + '\n';
      }
      
      return diff;
    }

    return '';
  }

  async stageCodeChange(
    request: CodeChangeRequest,
    requestedBy: string
  ): Promise<{ success: boolean; changeId?: string; error?: string }> {
    try {
      const validation = this.validateFilePath(request.filePath);
      if (!validation.valid) {
        return { success: false, error: validation.error };
      }

      if (request.newFilePath) {
        const newPathValidation = this.validateFilePath(request.newFilePath);
        if (!newPathValidation.valid) {
          return { success: false, error: newPathValidation.error };
        }
      }

      let originalContent: string | null = null;
      
      if (request.changeType === 'modify' || request.changeType === 'delete' || request.changeType === 'rename') {
        originalContent = await this.readFileContent(request.filePath);
        if (originalContent === null) {
          return { success: false, error: `File not found: ${request.filePath}` };
        }
      }

      if (request.changeType === 'create') {
        const existingContent = await this.readFileContent(request.filePath);
        if (existingContent !== null) {
          return { success: false, error: `File already exists: ${request.filePath}` };
        }
      }

      const diffPatch = this.generateUnifiedDiff(
        originalContent,
        request.proposedContent || null,
        request.filePath
      );

      const expiresAt = new Date();
      expiresAt.setDate(expiresAt.getDate() + 7);

      const [change] = await db.insert(stagedCodeChanges).values({
        title: request.title,
        description: request.description,
        changeType: request.changeType,
        filePath: request.filePath,
        originalContent,
        proposedContent: request.proposedContent,
        diffPatch,
        newFilePath: request.newFilePath,
        requestedBy,
        requestReason: request.requestReason,
        conversationId: request.conversationId,
        ticketId: request.ticketId,
        status: 'pending',
        priority: request.priority || 2,
        category: request.category,
        affectedModule: request.affectedModule,
        expiresAt,
      }).returning();

      broadcastToAllClients({
        type: 'code_change:staged',
        changeId: change.id,
        title: request.title,
        filePath: request.filePath,
        changeType: request.changeType,
        requestedBy,
      });

      console.log(`[AIBrainCodeEditor] Staged change: ${change.id} for ${request.filePath}`);

      return { success: true, changeId: change.id };
    } catch (error) {
      console.error('[AIBrainCodeEditor] Error staging change:', error);
      return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
    }
  }

  async stageBatchChanges(
    request: BatchChangeRequest,
    requestedBy: string
  ): Promise<{ success: boolean; batchId?: string; changeIds?: string[]; errors?: string[] }> {
    try {
      const [batch] = await db.insert(codeChangeBatches).values({
        title: request.title,
        description: request.description,
        requestedBy,
        conversationId: request.conversationId,
        status: 'pending',
        whatsNewTitle: request.whatsNewTitle,
        whatsNewDescription: request.whatsNewDescription,
      }).returning();

      const changeIds: string[] = [];
      const errors: string[] = [];

      for (let i = 0; i < request.changes.length; i++) {
        const changeReq = request.changes[i];
        const result = await this.stageCodeChange({
          ...changeReq,
          conversationId: request.conversationId,
        }, requestedBy);

        if (result.success && result.changeId) {
          changeIds.push(result.changeId);
          
          await db.insert(batchCodeChangeLinks).values({
            batchId: batch.id,
            changeId: result.changeId,
            order: i,
          });
        } else {
          errors.push(`${changeReq.filePath}: ${result.error}`);
        }
      }

      await db.update(codeChangeBatches)
        .set({ totalChanges: changeIds.length })
        .where(eq(codeChangeBatches.id, batch.id));

      broadcastToAllClients({
        type: 'code_change:batch_staged',
        batchId: batch.id,
        title: request.title,
        totalChanges: changeIds.length,
        requestedBy,
      });

      console.log(`[AIBrainCodeEditor] Staged batch: ${batch.id} with ${changeIds.length} changes`);

      return { 
        success: errors.length === 0, 
        batchId: batch.id, 
        changeIds,
        errors: errors.length > 0 ? errors : undefined 
      };
    } catch (error) {
      console.error('[AIBrainCodeEditor] Error staging batch:', error);
      return { success: false, errors: [error instanceof Error ? error.message : 'Unknown error'] };
    }
  }

  async getPendingChanges(): Promise<StagedCodeChange[]> {
    return await db.select()
      .from(stagedCodeChanges)
      .where(eq(stagedCodeChanges.status, 'pending'))
      .orderBy(desc(stagedCodeChanges.priority), desc(stagedCodeChanges.createdAt));
  }

  async getChangeById(changeId: string): Promise<StagedCodeChange | null> {
    const [change] = await db.select()
      .from(stagedCodeChanges)
      .where(eq(stagedCodeChanges.id, changeId));
    return change || null;
  }

  async approveChange(
    changeId: string,
    reviewerId: string,
    reviewNotes?: string
  ): Promise<ApprovalResult> {
    try {
      const change = await this.getChangeById(changeId);
      if (!change) {
        return { success: false, message: 'Change not found' };
      }

      if (change.status !== 'pending') {
        return { success: false, message: `Change is not pending (current status: ${change.status})` };
      }

      await db.update(stagedCodeChanges)
        .set({
          status: 'approved',
          reviewedBy: reviewerId,
          reviewedAt: new Date(),
          reviewNotes,
          updatedAt: new Date(),
        })
        .where(eq(stagedCodeChanges.id, changeId));

      broadcastToAllClients({
        type: 'code_change:approved',
        changeId,
        reviewerId,
      });

      console.log(`[AIBrainCodeEditor] Approved change: ${changeId}`);

      return { success: true, message: 'Change approved', changeId };
    } catch (error) {
      console.error('[AIBrainCodeEditor] Error approving change:', error);
      return { success: false, message: error instanceof Error ? error.message : 'Unknown error' };
    }
  }

  async rejectChange(
    changeId: string,
    reviewerId: string,
    reviewNotes?: string
  ): Promise<ApprovalResult> {
    try {
      const change = await this.getChangeById(changeId);
      if (!change) {
        return { success: false, message: 'Change not found' };
      }

      await db.update(stagedCodeChanges)
        .set({
          status: 'rejected',
          reviewedBy: reviewerId,
          reviewedAt: new Date(),
          reviewNotes,
          updatedAt: new Date(),
        })
        .where(eq(stagedCodeChanges.id, changeId));

      broadcastToAllClients({
        type: 'code_change:rejected',
        changeId,
        reviewerId,
      });

      console.log(`[AIBrainCodeEditor] Rejected change: ${changeId}`);

      return { success: true, message: 'Change rejected', changeId };
    } catch (error) {
      console.error('[AIBrainCodeEditor] Error rejecting change:', error);
      return { success: false, message: error instanceof Error ? error.message : 'Unknown error' };
    }
  }

  async applyChange(
    changeId: string,
    appliedById: string,
    sendWhatsNew: boolean = true,
    workspaceId?: string,
    sessionId?: string
  ): Promise<ApprovalResult> {
    try {
      const change = await this.getChangeById(changeId);
      if (!change) {
        return { success: false, message: 'Change not found' };
      }

      if (change.status !== 'approved') {
        return { success: false, message: `Change must be approved first (current status: ${change.status})` };
      }

      // Consume credits for staged code publish (3 credits per publish)
      if (workspaceId) {
        const creditResult = await featureGateService.consumeCreditsForFeature(
          'staged_code_publish',
          workspaceId,
          appliedById,
          sessionId,
          changeId
        );

        if (!creditResult.success) {
          console.log(`[AIBrainCodeEditor] Credit check failed: ${creditResult.error}`);
          return { 
            success: false, 
            message: `Insufficient credits to publish. ${creditResult.error}` 
          };
        }

        console.log(`[AIBrainCodeEditor] Consumed ${creditResult.creditsUsed} credits for code publish`);
      }

      const appliedAt = new Date();

      const updateResult = await db.update(stagedCodeChanges)
        .set({
          status: 'applied',
          appliedAt,
          appliedBy: appliedById,
          updatedAt: new Date(),
        })
        .where(and(
          eq(stagedCodeChanges.id, changeId),
          eq(stagedCodeChanges.status, 'approved')
        ))
        .returning({ id: stagedCodeChanges.id });

      if (updateResult.length === 0) {
        const freshChange = await this.getChangeById(changeId);
        const currentStatus = freshChange?.status || 'unknown';
        console.log(`[AIBrainCodeEditor] Race condition detected - change ${changeId} status is now ${currentStatus}`);
        return { 
          success: false, 
          message: `Change is no longer in approved state (current status: ${currentStatus}). Another process may have modified it.` 
        };
      }

      const fullPath = path.join(WORKSPACE_ROOT, change.filePath);

      try {
        switch (change.changeType) {
          case 'create':
          case 'modify':
            if (!change.proposedContent) {
              await this.revertToApproved(changeId);
              return { success: false, message: 'No proposed content for create/modify operation' };
            }
            await fs.mkdir(path.dirname(fullPath), { recursive: true });
            await fs.writeFile(fullPath, change.proposedContent, 'utf-8');
            break;

          case 'delete':
            await fs.unlink(fullPath);
            break;

          case 'rename':
            if (!change.newFilePath) {
              await this.revertToApproved(changeId);
              return { success: false, message: 'No new file path for rename operation' };
            }
            const newFullPath = path.join(WORKSPACE_ROOT, change.newFilePath);
            await fs.mkdir(path.dirname(newFullPath), { recursive: true });
            await fs.rename(fullPath, newFullPath);
            break;
        }
      } catch (fileError) {
        await this.revertToApproved(changeId);
        throw fileError;
      }

      if (sendWhatsNew) {
        await this.sendWhatsNewNotification(change, appliedById);
      }

      // Notify all support roles about the applied code change
      try {
        const { platformRoles, notifications } = await import('@shared/schema');
        const { inArray } = await import('drizzle-orm');
        
        const supportRoles = await db.query.platformRoles.findMany({
          where: inArray(platformRoles.role, ['support_agent', 'support_manager', 'sysop', 'deputy_admin', 'root_admin']),
          columns: { userId: true },
        });

        for (const role of supportRoles) {
          await db.insert(notifications).values({
            userId: role.userId,
            type: 'ai_action_completed',
            title: `Code Change Applied: ${change.title}`,
            message: `Platform code change "${change.title}" has been applied. File: ${change.filePath}`,
            scope: 'user',
            category: 'system',
            actionUrl: '/dashboard',
            relatedEntityType: 'code_change',
            relatedEntityId: changeId,
            metadata: { 
              changeId,
              filePath: change.filePath, 
              changeType: change.changeType,
              appliedBy: appliedById
            },
            isRead: false,
          });
        }

        console.log(`[AIBrainCodeEditor] Notified ${supportRoles.length} support roles about change: ${changeId}`);
      } catch (notifyError) {
        console.warn('[AIBrainCodeEditor] Warning: Failed to notify support roles:', notifyError);
      }

      broadcastToAllClients({
        type: 'code_change:applied',
        changeId,
        filePath: change.filePath,
        changeType: change.changeType,
        appliedBy: appliedById,
        timestamp: new Date().toISOString(),
      });

      console.log(`[AIBrainCodeEditor] Applied change: ${changeId} to ${change.filePath}`);

      return { success: true, message: 'Change applied successfully', changeId, appliedAt };
    } catch (error) {
      console.error('[AIBrainCodeEditor] Error applying change:', error);
      
      await db.update(stagedCodeChanges)
        .set({ status: 'failed', updatedAt: new Date() })
        .where(eq(stagedCodeChanges.id, changeId));

      return { success: false, message: error instanceof Error ? error.message : 'Unknown error' };
    }
  }

  async rollbackChange(changeId: string): Promise<ApprovalResult> {
    try {
      const change = await this.getChangeById(changeId);
      if (!change) {
        return { success: false, message: 'Change not found' };
      }

      if (change.status !== 'applied') {
        return { success: false, message: 'Can only rollback applied changes' };
      }

      if (!change.rollbackAvailable) {
        return { success: false, message: 'Rollback not available for this change' };
      }

      // Proceed with rollback - change is still in applied state

      const fullPath = path.join(WORKSPACE_ROOT, change.filePath);

      try {
        switch (change.changeType) {
          case 'create':
            await fs.unlink(fullPath);
            break;

          case 'modify':
            if (change.originalContent !== null) {
              await fs.writeFile(fullPath, change.originalContent, 'utf-8');
            }
            break;

          case 'delete':
            if (change.originalContent !== null) {
              await fs.writeFile(fullPath, change.originalContent, 'utf-8');
            }
            break;

          case 'rename':
            if (change.newFilePath) {
              const newFullPath = path.join(WORKSPACE_ROOT, change.newFilePath);
              await fs.rename(newFullPath, fullPath);
            }
            break;
        }
      } catch (fileError) {
        await db.update(stagedCodeChanges)
          .set({ status: 'applied', updatedAt: new Date() })
          .where(eq(stagedCodeChanges.id, changeId));
        throw fileError;
      }

      await db.update(stagedCodeChanges)
        .set({
          status: 'pending',
          appliedAt: null,
          appliedBy: null,
          rollbackAvailable: false,
          updatedAt: new Date(),
        })
        .where(eq(stagedCodeChanges.id, changeId));

      broadcastToAllClients({
        type: 'code_change:rolled_back',
        changeId,
        filePath: change.filePath,
      });

      console.log(`[AIBrainCodeEditor] Rolled back change: ${changeId}`);

      return { success: true, message: 'Change rolled back successfully', changeId };
    } catch (error) {
      console.error('[AIBrainCodeEditor] Error rolling back change:', error);
      return { success: false, message: error instanceof Error ? error.message : 'Unknown error' };
    }
  }

  private async revertToApproved(changeId: string): Promise<void> {
    try {
      await db.update(stagedCodeChanges)
        .set({
          status: 'approved',
          appliedAt: null,
          appliedBy: null,
          updatedAt: new Date(),
        })
        .where(eq(stagedCodeChanges.id, changeId));
      console.log(`[AIBrainCodeEditor] Reverted change ${changeId} to approved status after file operation failure`);
    } catch (error) {
      console.error(`[AIBrainCodeEditor] Failed to revert change ${changeId} to approved:`, error);
    }
  }

  private async sendWhatsNewNotification(change: StagedCodeChange, appliedById: string): Promise<void> {
    try {
      const categoryMap: Record<string, 'feature' | 'improvement' | 'bugfix' | 'security' | 'announcement'> = {
        'feature': 'feature',
        'enhancement': 'improvement',
        'bugfix': 'bugfix',
        'security': 'security',
        'hotfix': 'bugfix',
      };

      const category = categoryMap[change.category || ''] || 'improvement';

      await publishPlatformUpdate({
        type: 'feature_released',
        category,
        title: `Platform Update: ${change.title}`,
        description: change.description,
        metadata: {
          changeId: change.id,
          filePath: change.filePath,
          changeType: change.changeType,
          affectedModule: change.affectedModule,
          requestedBy: change.requestedBy,
          appliedBy: appliedById,
        },
        priority: change.priority || 2,
        visibility: 'all',
      });

      await db.update(stagedCodeChanges)
        .set({ whatsNewSent: true, updatedAt: new Date() })
        .where(eq(stagedCodeChanges.id, change.id));

      console.log(`[AIBrainCodeEditor] Sent What's New notification for change: ${change.id}`);
    } catch (error) {
      console.error('[AIBrainCodeEditor] Error sending What\'s New notification:', error);
    }
  }

  async readFile(filePath: string): Promise<{ success: boolean; content?: string; error?: string }> {
    const validation = this.validateFilePath(filePath);
    if (!validation.valid) {
      return { success: false, error: validation.error };
    }

    const content = await this.readFileContent(filePath);
    if (content === null) {
      return { success: false, error: 'File not found' };
    }

    return { success: true, content };
  }

  async listFiles(directory: string = ''): Promise<{ success: boolean; files?: string[]; error?: string }> {
    try {
      const validation = this.validateFilePath(directory || '.');
      if (!validation.valid) {
        return { success: false, error: validation.error };
      }

      const fullPath = path.join(WORKSPACE_ROOT, directory);
      const entries = await fs.readdir(fullPath, { withFileTypes: true });
      
      const files: string[] = [];
      for (const entry of entries) {
        const entryPath = path.join(directory, entry.name);
        
        const isProtected = PROTECTED_PATHS.some(p => entryPath.includes(p));
        if (isProtected) continue;

        if (entry.isDirectory()) {
          files.push(`${entryPath}/`);
        } else {
          const ext = path.extname(entry.name).toLowerCase();
          if (ALLOWED_EXTENSIONS.includes(ext)) {
            files.push(entryPath);
          }
        }
      }

      return { success: true, files };
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
    }
  }
}

export const aiBrainCodeEditor = AIBrainCodeEditorService.getInstance();
