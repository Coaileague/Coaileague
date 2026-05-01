/**
 * Broadcast Service
 * Handles creation, delivery, and tracking of broadcasts
 * Integrates with Universal Notification Engine and Trinity
 */

import { db } from '../db';
import { broadcasts, broadcastRecipients, broadcastFeedback, employees, shifts } from '@shared/schema';
import { eq, and, inArray, gte, lte, isNull, desc, sql } from 'drizzle-orm';
import { platformEventBus } from './platformEventBus';
import { createNotification } from './notificationService';
import { geminiClient } from './ai-brain/providers/geminiClient';
import { shiftHandoffService } from './fieldOperations/shiftHandoffService';
import type {
  Broadcast,
  BroadcastRecipient,
  BroadcastFeedback,
  CreateBroadcastRequest,
  UpdateBroadcastRequest,
  ListBroadcastsParams,
  SubmitFeedbackRequest,
  BroadcastStatsResponse,
  TargetConfig,
  BroadcastType,
  BroadcastCreatorType,
} from '@shared/types/broadcasts';
import { createLogger } from '../lib/logger';
const log = createLogger('broadcastService');


class BroadcastService {
  
  // ============================================
  // CREATE BROADCAST
  // ============================================
  
  async createBroadcast(
    request: CreateBroadcastRequest,
    createdBy: string,
    createdByType: BroadcastCreatorType,
    workspaceId?: string
  ): Promise<Broadcast> {
    log.info(`[BroadcastService] Creating broadcast: ${request.title}`);
    
    // Create the broadcast record
    const [broadcast] = await db.insert(broadcasts).values({
      workspaceId: workspaceId || null,
      createdBy,
      createdByType,
      type: request.type,
      priority: request.priority || 'normal',
      title: request.title,
      message: request.message,
      richContent: request.richContent || null,
      targetType: request.targetType,
      targetConfig: request.targetConfig,
      actionType: request.actionType || 'none',
      actionConfig: request.actionConfig || { type: 'none' },
      passDownData: request.passDownData || null,
      scheduledFor: request.scheduledFor ? new Date(request.scheduledFor) : null,
      expiresAt: request.expiresAt ? new Date(request.expiresAt) : null,
      isDraft: request.isDraft || false,
      isActive: true,
    }).returning();

    if (request.type === 'pass_down' && request.message) {
      const scanResult = shiftHandoffService.scanKeywords(request.message);
      if (scanResult.flaggedKeywords.length > 0) {
        log.info(`[BroadcastService] Pass-down keyword scan: severity=${scanResult.severity}, categories=${scanResult.categories.join(',')}, keywords=${scanResult.flaggedKeywords.join(',')}`);
        
        if (scanResult.requiresEscalation) {
          await db.update(broadcasts)
            .set({
              priority: scanResult.severity === 'critical' ? 'critical' : 'high',
              passDownData: {
                ...(broadcast.passDownData as Record<string, unknown> || {}),
                keywordScan: scanResult,
              },
            })
            .where(eq(broadcasts.id, broadcast.id));
          
          log.info(`[BroadcastService] Pass-down auto-escalated to ${scanResult.severity} priority`);
        }
      }
    }

    if (!request.isDraft && !request.scheduledFor) {
      await this.deliverBroadcast(broadcast.id, workspaceId);
    }

    platformEventBus.publish({
      type: 'broadcast_created',
      category: 'automation',
      title: `Broadcast Created — ${request.type}`,
      description: `${request.type} broadcast created by ${createdBy} targeting ${request.targetType}`,
      workspaceId,
      metadata: { broadcastId: broadcast.id, broadcastType: request.type, createdBy, createdByType, targetType: request.targetType },
    }).catch((err: any) => log.warn('[BroadcastService] publish broadcast_created failed:', err.message));

    log.info(`[BroadcastService] Broadcast created: ${broadcast.id}`);
    return broadcast as unknown as Broadcast;
  }

  // ============================================
  // DELIVER BROADCAST TO RECIPIENTS
  // ============================================
  
  async deliverBroadcast(broadcastId: string, workspaceId?: string): Promise<number> {
    log.info(`[BroadcastService] Delivering broadcast: ${broadcastId}`);
    
    // Get the broadcast
    const broadcast = await db.query.broadcasts.findFirst({
      where: eq(broadcasts.id, broadcastId),
    });

    if (!broadcast) {
      throw new Error(`Broadcast not found: ${broadcastId}`);
    }

    // Resolve target list
    const targetEmployeeIds = await this.resolveTargetList(
      broadcast.targetType,
      broadcast.targetConfig as TargetConfig,
      workspaceId || broadcast.workspaceId
    );

    log.info(`[BroadcastService] Resolved ${targetEmployeeIds.length} recipients`);

    // Create recipient records and send notifications
    let deliveredCount = 0;
    
    for (const employeeId of targetEmployeeIds) {
      try {
        const emp = await db.query.employees.findFirst({
          where: eq(employees.id, employeeId),
          columns: { userId: true, workspaceId: true },
        });

        if (!emp?.userId) {
          log.warn(`[BroadcastService] No userId for employee ${employeeId}, skipping`);
          continue;
        }

        const notification = await createNotification({
          workspaceId: workspaceId || broadcast.workspaceId || emp.workspaceId,
          userId: emp.userId,
          type: 'system',
          title: broadcast.title,
          message: broadcast.message,
          relatedEntityType: 'broadcast',
          relatedEntityId: broadcast.id,
          metadata: {
            broadcastId: broadcast.id,
            broadcastType: broadcast.type,
            priority: broadcast.priority,
            actionType: broadcast.actionType,
            actionConfig: broadcast.actionConfig,
            passDownData: broadcast.passDownData,
          },
          createdBy: broadcast.createdBy,
          idempotencyKey: `system-${broadcast.id}-${emp.userId}`
        });

        await db.insert(broadcastRecipients).values({
          broadcastId: broadcast.id,
          employeeId,
          workspaceId: workspaceId || broadcast.workspaceId || null,
          notificationId: notification?.id,
          deliveredAt: new Date(),
        });

        deliveredCount++;
      } catch (error) {
        log.error(`[BroadcastService] Failed to deliver to ${employeeId}:`, error);
      }
    }

    log.info(`[BroadcastService] Delivered to ${deliveredCount}/${targetEmployeeIds.length} recipients`);
    return deliveredCount;
  }

  // ============================================
  // RESOLVE TARGET LIST
  // ============================================
  
  async resolveTargetList(
    targetType: string,
    targetConfig: TargetConfig,
    workspaceId?: string | null
  ): Promise<string[]> {
    switch (targetType) {
      case 'all_org':
        if (!workspaceId) throw new Error('workspaceId required for all_org target');
        return this.getOrgEmployeeIds(workspaceId);

      case 'all_platform':
        return this.getAllEmployeeIds();

      case 'individuals': {
        if (targetConfig.type !== 'individuals') throw new Error('Invalid target config');
        if (!workspaceId) return targetConfig.employeeIds;
        const orgEmployees = await db.query.employees.findMany({
          where: and(
            eq(employees.workspaceId, workspaceId),
            eq(employees.isActive, true)
          ),
          columns: { id: true },
        });
        const validIdSet = new Set(orgEmployees.map((e: { id: string }) => e.id));
        const filtered = targetConfig.employeeIds.filter((eid: string) => validIdSet.has(eid));
        if (filtered.length !== targetConfig.employeeIds.length) {
          log.warn(`[BroadcastService] individuals target: filtered ${targetConfig.employeeIds.length - filtered.length} out-of-workspace employeeIds for workspace ${workspaceId}`);
        }
        return filtered;
      }

      case 'team':
        if (targetConfig.type !== 'team') throw new Error('Invalid target config');
        return this.getTeamEmployeeIds(targetConfig.teamId);

      case 'department':
        if (targetConfig.type !== 'department') throw new Error('Invalid target config');
        return this.getDepartmentEmployeeIds(targetConfig.departmentId);

      case 'role':
        if (targetConfig.type !== 'role') throw new Error('Invalid target config');
        return this.getRoleEmployeeIds(targetConfig.roles, workspaceId);

      case 'site':
        if (targetConfig.type !== 'site') throw new Error('Invalid target config');
        return this.getSiteEmployeeIds(targetConfig.siteId);

      case 'site_shift':
        if (targetConfig.type !== 'site_shift') throw new Error('Invalid target config');
        return this.getSiteShiftEmployeeIds(targetConfig.siteId, targetConfig.shiftDate);

      default:
        throw new Error(`Unknown target type: ${targetType}`);
    }
  }

  private async getOrgEmployeeIds(workspaceId: string): Promise<string[]> {
    const result = await db.query.employees.findMany({
      where: and(
        eq(employees.workspaceId, workspaceId),
        eq(employees.isActive, true)
      ),
      columns: { id: true },
    });
    return result.map(e => e.id);
  }

  private async getAllEmployeeIds(): Promise<string[]> {
    const result = await db.query.employees.findMany({
      where: eq(employees.isActive, true),
      columns: { id: true },
    });
    return result.map(e => e.id);
  }

  private async getTeamEmployeeIds(teamId: string): Promise<string[]> {
    const result = await db.query.employees.findMany({
      where: and(
        eq(employees.teamId, teamId),
        eq(employees.isActive, true)
      ),
      columns: { id: true },
    });
    return result.map(e => e.id);
  }

  private async getDepartmentEmployeeIds(departmentId: string): Promise<string[]> {
    const result = await db.query.employees.findMany({
      where: and(
        eq(employees.departmentId, departmentId),
        eq(employees.isActive, true)
      ),
      columns: { id: true },
    });
    return result.map(e => e.id);
  }

  private async getRoleEmployeeIds(roles: string[], workspaceId?: string | null): Promise<string[]> {
    const conditions = [
      eq(employees.isActive, true),
      inArray(employees.role, roles),
    ];
    if (workspaceId) {
      conditions.push(eq(employees.workspaceId, workspaceId));
    }
    
    const result = await db.query.employees.findMany({
      where: and(...conditions),
      columns: { id: true },
    });
    return result.map(e => e.id);
  }

  private async getSiteEmployeeIds(siteId: string): Promise<string[]> {
    // Get employees who have shifts at this site
    const shiftResults = await db.query.shifts.findMany({
      where: eq(shifts.siteId, siteId),
      columns: { employeeId: true },
    });
    
    const uniqueIds = [...new Set(shiftResults.map(s => s.employeeId).filter(Boolean))];
    return uniqueIds as string[];
  }

  private async getSiteShiftEmployeeIds(siteId: string, shiftDate: string): Promise<string[]> {
    const date = new Date(shiftDate);
    const startOfDay = new Date(date.setHours(0, 0, 0, 0));
    const endOfDay = new Date(date.setHours(23, 59, 59, 999));

    const shiftResults = await db.query.shifts.findMany({
      where: and(
        eq(shifts.siteId, siteId),
        gte(shifts.startTime, startOfDay),
        lte(shifts.startTime, endOfDay)
      ),
      columns: { employeeId: true },
    });
    
    const uniqueIds = [...new Set(shiftResults.map(s => s.employeeId).filter(Boolean))];
    return uniqueIds as string[];
  }

  // ============================================
  // ACKNOWLEDGMENT
  // ============================================
  
  async acknowledgeBroadcast(
    broadcastId: string,
    employeeId: string,
    note?: string
  ): Promise<void> {
    log.info(`[BroadcastService] Acknowledging broadcast ${broadcastId} by ${employeeId}`);
    
    await db.update(broadcastRecipients)
      .set({
        acknowledgedAt: new Date(),
        responseData: note ? { acknowledgmentNote: note } : undefined,
      })
      .where(and(
        eq(broadcastRecipients.broadcastId, broadcastId),
        eq(broadcastRecipients.employeeId, employeeId)
      ));

    // Emit event
    platformEventBus.emit('broadcast_acknowledged', {
      broadcastId,
      employeeId,
      timestamp: new Date().toISOString(),
    });
  }

  // ============================================
  // MARK AS READ
  // ============================================
  
  async markAsRead(broadcastId: string, employeeId: string): Promise<void> {
    await db.update(broadcastRecipients)
      .set({ readAt: new Date() })
      .where(and(
        eq(broadcastRecipients.broadcastId, broadcastId),
        eq(broadcastRecipients.employeeId, employeeId),
        isNull(broadcastRecipients.readAt)
      ));
  }

  // ============================================
  // DISMISS BROADCAST
  // ============================================
  
  async dismissBroadcast(broadcastId: string, employeeId: string): Promise<void> {
    // Check if broadcast is critical (can't dismiss)
    const broadcast = await db.query.broadcasts.findFirst({
      where: eq(broadcasts.id, broadcastId),
      columns: { priority: true },
    });

    if (broadcast?.priority === 'critical') {
      throw new Error('Critical broadcasts cannot be dismissed');
    }

    await db.update(broadcastRecipients)
      .set({ dismissedAt: new Date() })
      .where(and(
        eq(broadcastRecipients.broadcastId, broadcastId),
        eq(broadcastRecipients.employeeId, employeeId)
      ));
  }

  // ============================================
  // SUBMIT FEEDBACK
  // ============================================
  
  async submitFeedback(
    request: SubmitFeedbackRequest,
    employeeId: string,
    workspaceId?: string
  ): Promise<BroadcastFeedback> {
    log.info(`[BroadcastService] Submitting feedback for broadcast ${request.broadcastId}`);
    
    // Create feedback record
    const [feedback] = await db.insert(broadcastFeedback).values({
      broadcastId: request.broadcastId,
      employeeId,
      workspaceId,
      feedbackType: request.feedbackType,
      subject: request.subject,
      content: request.content,
      category: request.category,
      allowFollowup: request.allowFollowup ?? true,
      contactMethod: request.contactMethod,
      status: 'new',
    }).returning();

    // Update recipient record
    await db.update(broadcastRecipients)
      .set({ 
        actionTakenAt: new Date(),
        responseData: { feedbackId: feedback.id },
      })
      .where(and(
        eq(broadcastRecipients.broadcastId, request.broadcastId),
        eq(broadcastRecipients.employeeId, employeeId)
      ));

    // Emit event
    platformEventBus.emit('broadcast_feedback_received', {
      broadcastId: request.broadcastId,
      feedbackId: feedback.id,
      employeeId,
      feedbackType: request.feedbackType,
    });

    // Trigger AI analysis in background
    this.analyzeFeedbackAsync(feedback.id, request.content, workspaceId);

    return feedback as unknown as BroadcastFeedback;
  }

  // ============================================
  // AI FEEDBACK ANALYSIS
  // ============================================
  
  private async analyzeFeedbackAsync(feedbackId: string, content: string, workspaceId?: string): Promise<void> {
    try {
      const prompt = `Analyze this user feedback and provide:
1. A brief 1-sentence summary
2. Sentiment (positive, negative, neutral, or mixed)
3. Priority score 1-10 (10 = urgent)
4. Categories (array of relevant tags like: feature_request, bug, ux_issue, performance, documentation, billing, etc.)
5. Suggested action items (if any)

Respond in JSON format:
{
  "summary": "...",
  "sentiment": "...",
  "priorityScore": 5,
  "categories": ["...", "..."],
  "actionItems": ["...", "..."]
}

Feedback:
${content}`;

      const effectiveWorkspaceId = workspaceId || 'PLATFORM_COST_CENTER';
      if (!workspaceId) {
        log.warn('[BroadcastService] feedback_analysis AI call without workspaceId — attributing to PLATFORM_COST_CENTER');
      }
      const result = await geminiClient.generateContent({ // withGemini
        prompt,
        featureKey: 'feedback_analysis',
        workspaceId: effectiveWorkspaceId,
      });

      // Parse AI response
      const analysis = JSON.parse(result.text || '{}');

      // Update feedback with AI analysis
      await db.update(broadcastFeedback)
        .set({
          aiSummary: analysis.summary,
          aiSentiment: analysis.sentiment,
          aiPriorityScore: analysis.priorityScore,
          aiCategories: analysis.categories,
          aiActionItems: analysis.actionItems,
          updatedAt: new Date(),
        })
        .where(eq(broadcastFeedback.id, feedbackId));

      log.info(`[BroadcastService] AI analysis complete for feedback ${feedbackId}`);
    } catch (error) {
      log.error(`[BroadcastService] AI analysis failed for feedback ${feedbackId}:`, error);
    }
  }

  // ============================================
  // GET BROADCASTS
  // ============================================
  
  async getBroadcasts(params: ListBroadcastsParams): Promise<Broadcast[]> {
    const conditions = [];

    if (params.workspaceId) {
      conditions.push(eq(broadcasts.workspaceId, params.workspaceId));
    }
    if (params.type) {
      conditions.push(eq(broadcasts.type, params.type));
    }
    if (params.priority) {
      conditions.push(eq(broadcasts.priority, params.priority));
    }
    if (params.isActive !== undefined) {
      conditions.push(eq(broadcasts.isActive, params.isActive));
    }
    if (!params.includeDrafts) {
      conditions.push(eq(broadcasts.isDraft, false));
    }
    if (!params.includeExpired) {
      conditions.push(
        sql`(${broadcasts.expiresAt} IS NULL OR ${broadcasts.expiresAt} > NOW())`
      );
    }

    const result = await db.query.broadcasts.findMany({
      where: conditions.length > 0 ? and(...conditions) : undefined,
      orderBy: [desc(broadcasts.createdAt)],
      limit: params.limit || 50,
      offset: params.offset || 0,
    });

    return result as unknown as Broadcast[];
  }

  // ============================================
  // GET BROADCAST BY ID
  // ============================================
  
  async getBroadcastById(broadcastId: string): Promise<Broadcast | null> {
    const broadcast = await db.query.broadcasts.findFirst({
      where: eq(broadcasts.id, broadcastId),
    });

    if (!broadcast) return null;

    // Get stats
    const stats = await this.getBroadcastStats(broadcastId);
    
    return {
      ...broadcast,
      stats,
    } as Broadcast;
  }

  // ============================================
  // GET RECIPIENT STATUS
  // ============================================

  async getRecipientStatus(broadcastId: string, userId: string): Promise<BroadcastRecipient | null> {
    const recipient = await db.query.broadcastRecipients.findFirst({
      where: and(
        eq(broadcastRecipients.broadcastId, broadcastId),
        eq(broadcastRecipients.userId, userId)
      ),
    });
    
    return recipient || null;
  }

  // ============================================
  // GET BROADCAST STATS
  // ============================================
  
  async getBroadcastStats(broadcastId: string): Promise<BroadcastStatsResponse> {
    const recipients = await db.query.broadcastRecipients.findMany({
      where: eq(broadcastRecipients.broadcastId, broadcastId),
    });

    const feedbackCount = await db.query.broadcastFeedback.findMany({
      where: eq(broadcastFeedback.broadcastId, broadcastId),
      columns: { id: true },
    });

    const total = recipients.length;
    const delivered = recipients.filter(r => r.deliveredAt).length;
    const read = recipients.filter(r => r.readAt).length;
    const acknowledged = recipients.filter(r => r.acknowledgedAt).length;
    const dismissed = recipients.filter(r => r.dismissedAt).length;

    return {
      broadcastId,
      totalRecipients: total,
      delivered,
      read,
      acknowledged,
      dismissed,
      feedbackCount: feedbackCount.length,
      acknowledgmentRate: total > 0 ? Math.round((acknowledged / total) * 100) : 0,
      readRate: total > 0 ? Math.round((read / total) * 100) : 0,
    };
  }

  // ============================================
  // GET BROADCASTS FOR EMPLOYEE
  // ============================================
  
  async getBroadcastsForEmployee(
    employeeId: string,
    options?: { unreadOnly?: boolean; limit?: number }
  ): Promise<Array<Broadcast & { recipient: BroadcastRecipient }>> {
    const conditions = [
      eq(broadcastRecipients.employeeId, employeeId),
      isNull(broadcastRecipients.dismissedAt),
    ];

    if (options?.unreadOnly) {
      conditions.push(isNull(broadcastRecipients.readAt));
    }

    const recipientRecords = await db.query.broadcastRecipients.findMany({
      where: and(...conditions),
      orderBy: [desc(broadcastRecipients.deliveredAt)],
      limit: options?.limit || 20,
    });

    if (recipientRecords.length === 0) return [];

    const broadcastIds = recipientRecords.map(r => r.broadcastId);
    
    const broadcastRecords = await db.query.broadcasts.findMany({
      where: and(
        inArray(broadcasts.id, broadcastIds),
        eq(broadcasts.isActive, true)
      ),
    });

    // Combine broadcasts with recipient data
    return broadcastRecords.map(broadcast => {
      const recipient = recipientRecords.find(r => r.broadcastId === broadcast.id);
      return {
        ...broadcast,
        recipient: recipient!,
      };
    }) as Array<Broadcast & { recipient: BroadcastRecipient }>;
  }

  // ============================================
  // GET FEEDBACK FOR BROADCAST
  // ============================================

  async getFeedbackForBroadcast(
    broadcastId: string,
    options?: { limit?: number; offset?: number }
  ): Promise<{ feedbacks: BroadcastFeedback[]; total: number }> {
    const allFeedback = await db.query.broadcastFeedback.findMany({
      where: eq(broadcastFeedback.broadcastId, broadcastId),
      orderBy: [desc(broadcastFeedback.createdAt)],
      limit: options?.limit || 50,
      offset: options?.offset || 0,
    });

    const countResult = await db.query.broadcastFeedback.findMany({
      where: eq(broadcastFeedback.broadcastId, broadcastId),
      columns: { id: true },
    });

    return {
      feedbacks: allFeedback as unknown as BroadcastFeedback[],
      total: countResult.length,
    };
  }

  // ============================================
  // UPDATE BROADCAST
  // ============================================
  
  async updateBroadcast(
    broadcastId: string,
    updates: UpdateBroadcastRequest
  ): Promise<Broadcast> {
    const [updated] = await db.update(broadcasts)
      .set({
        ...updates,
        updatedAt: new Date(),
      })
      .where(eq(broadcasts.id, broadcastId))
      .returning();

    return updated as unknown as Broadcast;
  }

  // ============================================
  // DELETE/DEACTIVATE BROADCAST
  // ============================================
  
  async deactivateBroadcast(broadcastId: string): Promise<void> {
    await db.update(broadcasts)
      .set({ isActive: false, updatedAt: new Date() })
      .where(eq(broadcasts.id, broadcastId));
  }

  // ============================================
  // HELPERS
  // ============================================
  
  private mapPriorityToNotification(priority: string): number {
    switch (priority) {
      case 'critical': return 1;
      case 'high': return 2;
      case 'normal': return 3;
      case 'low': return 4;
      default: return 3;
    }
  }
}

export const broadcastService = new BroadcastService();
