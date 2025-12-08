import { db } from "../../db";
import { aiApprovalRequests, aiWorkboardTasks, users } from "@shared/schema";
import { eq, and, sql, desc, or, inArray, lt } from "drizzle-orm";

export type ApprovalDecision = 'pending' | 'approved' | 'rejected' | 'expired' | 'cancelled';
export type SourceSystem = 'ai_brain' | 'trinity' | 'subagent';
export type RequestPriority = 'low' | 'normal' | 'high' | 'urgent';

interface CreateApprovalRequest {
  workspaceId: string;
  requesterId: string;
  sourceTaskId?: string;
  sourceSystem: SourceSystem;
  sourceAgentId?: string;
  requestType: string;
  title: string;
  description?: string;
  requestPayload?: Record<string, any>;
  priority?: RequestPriority;
  expiresAt?: Date;
  estimatedTokens?: number;
}

interface ApprovalListOptions {
  decision?: ApprovalDecision[];
  limit?: number;
  offset?: number;
  scope?: 'admin' | 'manager' | 'employee';
}

class ApprovalRequestService {
  async createApprovalRequest(request: CreateApprovalRequest): Promise<string> {
    const [approval] = await db.insert(aiApprovalRequests).values({
      workspaceId: request.workspaceId,
      requesterId: request.requesterId,
      sourceTaskId: request.sourceTaskId,
      sourceSystem: request.sourceSystem,
      sourceAgentId: request.sourceAgentId,
      requestType: request.requestType,
      title: request.title,
      description: request.description,
      requestPayload: request.requestPayload || {},
      priority: request.priority || 'normal',
      expiresAt: request.expiresAt,
      estimatedTokens: request.estimatedTokens || 0,
      statusHistory: [{
        decision: 'pending',
        timestamp: new Date().toISOString(),
        actor: 'system',
      }],
    }).returning({ id: aiApprovalRequests.id });

    console.log('[ApprovalRequestService] Created approval request:', approval.id);

    if (request.sourceTaskId) {
      await db.update(aiWorkboardTasks)
        .set({
          status: 'awaiting_approval',
          statusHistory: sql`${aiWorkboardTasks.statusHistory} || ${JSON.stringify([{
            status: 'awaiting_approval',
            timestamp: new Date().toISOString(),
            actor: 'system',
            details: { approvalId: approval.id }
          }])}::jsonb`,
          updatedAt: new Date()
        })
        .where(eq(aiWorkboardTasks.id, request.sourceTaskId));
    }

    return approval.id;
  }

  async getApprovalRequests(
    userId: string,
    workspaceId: string,
    options: ApprovalListOptions = {}
  ) {
    const { decision, limit = 50, offset = 0, scope = 'employee' } = options;

    let query = db.select({
      id: aiApprovalRequests.id,
      workspaceId: aiApprovalRequests.workspaceId,
      requesterId: aiApprovalRequests.requesterId,
      approverId: aiApprovalRequests.approverId,
      sourceTaskId: aiApprovalRequests.sourceTaskId,
      sourceSystem: aiApprovalRequests.sourceSystem,
      sourceAgentId: aiApprovalRequests.sourceAgentId,
      requestType: aiApprovalRequests.requestType,
      title: aiApprovalRequests.title,
      description: aiApprovalRequests.description,
      requestPayload: aiApprovalRequests.requestPayload,
      decision: aiApprovalRequests.decision,
      decisionAt: aiApprovalRequests.decisionAt,
      decisionNote: aiApprovalRequests.decisionNote,
      priority: aiApprovalRequests.priority,
      expiresAt: aiApprovalRequests.expiresAt,
      estimatedTokens: aiApprovalRequests.estimatedTokens,
      createdAt: aiApprovalRequests.createdAt,
      requesterName: users.displayName,
    })
    .from(aiApprovalRequests)
    .leftJoin(users, eq(aiApprovalRequests.requesterId, users.id))
    .where(eq(aiApprovalRequests.workspaceId, workspaceId))
    .orderBy(desc(aiApprovalRequests.createdAt))
    .limit(limit)
    .offset(offset);

    const results = await query;

    if (scope === 'employee') {
      return results.filter(r => r.requesterId === userId);
    }

    return results;
  }

  async getPendingCount(userId: string, workspaceId: string, scope: 'admin' | 'manager' | 'employee' = 'employee'): Promise<number> {
    const results = await db.select({ count: sql<number>`count(*)` })
      .from(aiApprovalRequests)
      .where(and(
        eq(aiApprovalRequests.workspaceId, workspaceId),
        eq(aiApprovalRequests.decision, 'pending')
      ));

    return Number(results[0]?.count || 0);
  }

  async resolveApproval(
    approvalId: string,
    decision: 'approved' | 'rejected',
    approverId: string,
    note?: string
  ): Promise<boolean> {
    const [approval] = await db.select()
      .from(aiApprovalRequests)
      .where(eq(aiApprovalRequests.id, approvalId))
      .limit(1);

    if (!approval || approval.decision !== 'pending') {
      console.log('[ApprovalRequestService] Cannot resolve - not pending:', approvalId, approval?.decision);
      return false;
    }

    await db.update(aiApprovalRequests)
      .set({
        decision,
        approverId,
        decisionAt: new Date(),
        decisionNote: note,
        statusHistory: sql`${aiApprovalRequests.statusHistory} || ${JSON.stringify([{
          decision,
          timestamp: new Date().toISOString(),
          actor: approverId,
          note: note || null,
        }])}::jsonb`,
        updatedAt: new Date(),
      })
      .where(eq(aiApprovalRequests.id, approvalId));

    console.log('[ApprovalRequestService] Approval resolved:', approvalId, decision);

    if (approval.sourceTaskId) {
      const newStatus = decision === 'approved' ? 'pending' : 'cancelled';
      await db.update(aiWorkboardTasks)
        .set({
          status: newStatus,
          statusHistory: sql`${aiWorkboardTasks.statusHistory} || ${JSON.stringify([{
            status: newStatus,
            timestamp: new Date().toISOString(),
            actor: approverId,
            details: { 
              approvalDecision: decision,
              approvalNote: note || null
            }
          }])}::jsonb`,
          updatedAt: new Date()
        })
        .where(eq(aiWorkboardTasks.id, approval.sourceTaskId));

      console.log('[ApprovalRequestService] Updated source task status:', approval.sourceTaskId, newStatus);
    }

    return true;
  }

  async expireOldApprovals(): Promise<number> {
    const now = new Date();
    const expired = await db.update(aiApprovalRequests)
      .set({
        decision: 'expired',
        statusHistory: sql`${aiApprovalRequests.statusHistory} || ${JSON.stringify([{
          decision: 'expired',
          timestamp: now.toISOString(),
          actor: 'system',
        }])}::jsonb`,
        updatedAt: now,
      })
      .where(and(
        eq(aiApprovalRequests.decision, 'pending'),
        lt(aiApprovalRequests.expiresAt, now)
      ))
      .returning({ id: aiApprovalRequests.id });

    if (expired.length > 0) {
      console.log('[ApprovalRequestService] Expired approvals:', expired.length);
    }

    return expired.length;
  }

  async getApprovalById(approvalId: string) {
    const [approval] = await db.select()
      .from(aiApprovalRequests)
      .where(eq(aiApprovalRequests.id, approvalId))
      .limit(1);
    return approval;
  }

  async cancelApproval(approvalId: string, userId: string, reason?: string): Promise<boolean> {
    const [approval] = await db.select()
      .from(aiApprovalRequests)
      .where(eq(aiApprovalRequests.id, approvalId))
      .limit(1);

    if (!approval || approval.decision !== 'pending') {
      return false;
    }

    await db.update(aiApprovalRequests)
      .set({
        decision: 'cancelled',
        decisionNote: reason || 'Cancelled by user',
        statusHistory: sql`${aiApprovalRequests.statusHistory} || ${JSON.stringify([{
          decision: 'cancelled',
          timestamp: new Date().toISOString(),
          actor: userId,
          note: reason || 'Cancelled by user',
        }])}::jsonb`,
        updatedAt: new Date(),
      })
      .where(eq(aiApprovalRequests.id, approvalId));

    return true;
  }
}

export const approvalRequestService = new ApprovalRequestService();
