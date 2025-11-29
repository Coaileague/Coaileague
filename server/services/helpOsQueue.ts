/**
 * HelpAI Queue Management System
 * Manages support queue with smart prioritization and automated announcements
 */

import { db } from "../db";
import { helpOsQueue, users, workspaces, chatMessages, chatConversations } from "@shared/schema";
import { eq, and, sql, desc } from "drizzle-orm";
import type { HelpOsQueueEntry, InsertHelpOsQueue } from "@shared/schema";

// Priority weights for scoring algorithm
const PRIORITY_WEIGHTS = {
  waitTime: 2.0,      // 2 points per minute waiting
  tier: {
    free: 0,
    starter: 10,
    professional: 20,
    enterprise: 30,
  },
  specialNeeds: 50,   // ADA/accessibility gets high priority
  ownership: 25,      // Organization owner/POC
};

export class HelpOsQueueManager {
  /**
   * Add user to support queue
   */
  async enqueue(params: {
    conversationId: string;
    userId?: string;
    ticketNumber: string;
    userName: string;
    workspaceId?: string;
  }): Promise<HelpOsQueueEntry> {
    // Fetch user/workspace data for prioritization
    let subscriptionTier = "free";
    let isOwner = false;
    let isPOC = false;
    let hasSpecialNeeds = false;

    if (params.workspaceId) {
      const workspace = await db.query.workspaces.findFirst({
        where: eq(workspaces.id, params.workspaceId),
      });
      
      if (workspace) {
        subscriptionTier = workspace.subscriptionTier || "free";
        isOwner = workspace.ownerId === params.userId;
      }
    }

    // Calculate initial priority score
    const priorityScore = this.calculatePriorityScore({
      waitTimeMinutes: 0,
      subscriptionTier,
      hasSpecialNeeds,
      isOwner,
      isPOC,
    });

    // Insert into queue
    const [entry] = await db.insert(helpOsQueue).values({
      conversationId: params.conversationId,
      userId: params.userId,
      ticketNumber: params.ticketNumber,
      userName: params.userName,
      workspaceId: params.workspaceId,
      subscriptionTier,
      hasSpecialNeeds,
      isOwner,
      isPOC,
      priorityScore,
      status: "waiting",
    }).returning();

    // Recalculate all queue positions
    await this.updateQueuePositions();

    return entry;
  }

  /**
   * Remove user from queue (helped or left)
   */
  async dequeue(conversationId: string, status: "resolved" | "abandoned" = "resolved"): Promise<void> {
    await db.update(helpOsQueue)
      .set({
        status,
        resolvedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(helpOsQueue.conversationId, conversationId));

    // Recalculate positions for remaining users
    await this.updateQueuePositions();
  }

  /**
   * Assign user to staff member
   */
  async assignToStaff(conversationId: string, staffId: string): Promise<void> {
    await db.update(helpOsQueue)
      .set({
        status: "being_helped",
        assignedStaffId: staffId,
        assignedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(helpOsQueue.conversationId, conversationId));
  }

  /**
   * Calculate priority score based on multiple factors
   */
  calculatePriorityScore(params: {
    waitTimeMinutes: number;
    subscriptionTier: string;
    hasSpecialNeeds: boolean;
    isOwner: boolean;
    isPOC: boolean;
  }): number {
    let score = 0;

    // Wait time (linear increase)
    score += params.waitTimeMinutes * PRIORITY_WEIGHTS.waitTime;

    // Subscription tier bonus
    const tierKey = params.subscriptionTier as keyof typeof PRIORITY_WEIGHTS.tier;
    score += PRIORITY_WEIGHTS.tier[tierKey] || 0;

    // Special needs (ADA)
    if (params.hasSpecialNeeds) {
      score += PRIORITY_WEIGHTS.specialNeeds;
    }

    // Organization ownership/POC
    if (params.isOwner || params.isPOC) {
      score += PRIORITY_WEIGHTS.ownership;
    }

    return Math.round(score);
  }

  /**
   * Update all priority scores and queue positions
   */
  async updateQueuePositions(): Promise<void> {
    // Get all waiting users
    const waitingUsers = await db.query.helpOsQueue.findMany({
      where: eq(helpOsQueue.status, "waiting"),
    });

    // Recalculate priority scores based on wait time
    const now = new Date();
    const updates = waitingUsers.map((entry: HelpOsQueueEntry) => {
      const waitTimeMinutes = Math.floor((now.getTime() - new Date(entry.joinedAt).getTime()) / 60000);
      
      const newScore = this.calculatePriorityScore({
        waitTimeMinutes,
        subscriptionTier: entry.subscriptionTier || "free",
        hasSpecialNeeds: entry.hasSpecialNeeds || false,
        isOwner: entry.isOwner || false,
        isPOC: entry.isPOC || false,
      });

      return {
        id: entry.id,
        priorityScore: newScore,
        waitTimeScore: waitTimeMinutes * PRIORITY_WEIGHTS.waitTime,
      };
    });

    // Sort by priority score (highest first)
    updates.sort((a: { priorityScore: number }, b: { priorityScore: number }) => b.priorityScore - a.priorityScore);

    // Update database with new scores and positions
    for (let i = 0; i < updates.length; i++) {
      await db.update(helpOsQueue)
        .set({
          priorityScore: updates[i].priorityScore,
          waitTimeScore: updates[i].waitTimeScore,
          queuePosition: i + 1,
          estimatedWaitMinutes: (i + 1) * 5, // Rough estimate: 5 min per person
          updatedAt: new Date(),
        })
        .where(eq(helpOsQueue.id, updates[i].id));
    }
  }

  /**
   * Get current queue status
   */
  async getQueueStatus(): Promise<{
    waitingCount: number;
    beingHelpedCount: number;
    averageWaitMinutes: number;
  }> {
    const waiting = await db.query.helpOsQueue.findMany({
      where: eq(helpOsQueue.status, "waiting"),
    });

    const beingHelped = await db.query.helpOsQueue.findMany({
      where: eq(helpOsQueue.status, "being_helped"),
    });

    const avgWait = waiting.length > 0
      ? waiting.reduce((sum: number, entry: HelpOsQueueEntry) => sum + (entry.estimatedWaitMinutes || 0), 0) / waiting.length
      : 0;

    return {
      waitingCount: waiting.length,
      beingHelpedCount: beingHelped.length,
      averageWaitMinutes: Math.round(avgWait),
    };
  }

  /**
   * Get queue entry for conversation
   */
  async getQueueEntry(conversationId: string): Promise<HelpOsQueueEntry | null> {
    const entry = await db.query.helpOsQueue.findFirst({
      where: eq(helpOsQueue.conversationId, conversationId),
    });

    return entry || null;
  }

  /**
   * Get queue position for conversation (formatted for customer display)
   */
  async getPosition(conversationId: string): Promise<{
    position: number;
    priorityScore: number;
    waitTimeMinutes: number;
  } | null> {
    const entry = await this.getQueueEntry(conversationId);
    
    if (!entry || entry.status !== "waiting") {
      return null;
    }

    const waitTimeMinutes = Math.floor(
      (Date.now() - new Date(entry.joinedAt).getTime()) / 60000
    );

    return {
      position: entry.queuePosition || 0,
      priorityScore: entry.priorityScore || 0,
      waitTimeMinutes,
    };
  }

  /**
   * Get users needing reminder announcement (5+ min since last)
   */
  async getUsersNeedingReminder(): Promise<HelpOsQueueEntry[]> {
    const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000);

    const users = await db.query.helpOsQueue.findMany({
      where: and(
        eq(helpOsQueue.status, "waiting"),
        sql`${helpOsQueue.lastAnnouncementAt} IS NULL OR ${helpOsQueue.lastAnnouncementAt} < ${fiveMinutesAgo}`
      ),
    });

    return users;
  }

  /**
   * Mark announcement sent
   */
  async markAnnouncementSent(queueId: string): Promise<void> {
    await db.update(helpOsQueue)
      .set({
        lastAnnouncementAt: new Date(),
        announcementCount: sql`${helpOsQueue.announcementCount} + 1`,
        updatedAt: new Date(),
      })
      .where(eq(helpOsQueue.id, queueId));
  }

  /**
   * Mark welcome message sent
   */
  async markWelcomeSent(queueId: string): Promise<void> {
    await db.update(helpOsQueue)
      .set({
        hasReceivedWelcome: true,
        lastAnnouncementAt: new Date(),
        announcementCount: 1,
        updatedAt: new Date(),
      })
      .where(eq(helpOsQueue.id, queueId));
  }
}

// Singleton instance
export const queueManager = new HelpOsQueueManager();
