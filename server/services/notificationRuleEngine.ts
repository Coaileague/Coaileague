import { db } from "@db";
import { notificationRules, notifications, notificationActivity } from "@shared/schema";
import { eq, and, desc, sql } from "drizzle-orm";
import type { UNSNotification } from "../../client/src/components/notifications-popover";

interface RuleMatch {
  ruleId: string;
  ruleName: string;
  action: string;
  actionConfig?: {
    targetCategory?: string;
    priorityLevel?: string;
    throttleMinutes?: number;
    customLabel?: string;
  };
}

interface EvaluationResult {
  notification: UNSNotification;
  matchedRules: RuleMatch[];
  finalPriority: string;
  finalCategory: string;
  shouldThrottle: boolean;
  shouldDismiss: boolean;
  shouldAutoRead: boolean;
  smartReplyEnabled: boolean;
  customLabels: string[];
}

export class NotificationRuleEngine {
  private static instance: NotificationRuleEngine;
  private rulesCache: Map<string, any[]> = new Map();
  private cacheExpiry: Map<string, number> = new Map();
  private readonly CACHE_TTL = 60000; // 1 minute cache

  static getInstance(): NotificationRuleEngine {
    if (!NotificationRuleEngine.instance) {
      NotificationRuleEngine.instance = new NotificationRuleEngine();
    }
    return NotificationRuleEngine.instance;
  }

  async getUserRules(userId: string, workspaceId?: string | null): Promise<any[]> {
    const cacheKey = `${userId}-${workspaceId || 'global'}`;
    const now = Date.now();

    if (this.rulesCache.has(cacheKey) && 
        this.cacheExpiry.get(cacheKey)! > now) {
      return this.rulesCache.get(cacheKey)!;
    }

    const rules = await db
      .select()
      .from(notificationRules)
      .where(
        and(
          eq(notificationRules.userId, userId),
          eq(notificationRules.isActive, true),
          workspaceId 
            ? eq(notificationRules.workspaceId, workspaceId)
            : sql`${notificationRules.workspaceId} IS NULL`
        )
      )
      .orderBy(desc(notificationRules.priority));

    this.rulesCache.set(cacheKey, rules);
    this.cacheExpiry.set(cacheKey, now + this.CACHE_TTL);

    return rules;
  }

  evaluateConditions(notification: UNSNotification, conditions: any): boolean {
    if (conditions.type && conditions.type.length > 0) {
      if (!conditions.type.includes(notification.subCategory)) {
        return false;
      }
    }

    if (conditions.category && conditions.category.length > 0) {
      if (!conditions.category.includes(notification.category)) {
        return false;
      }
    }

    if (conditions.titleContains && conditions.titleContains.length > 0) {
      const titleLower = notification.title.toLowerCase();
      const hasMatch = conditions.titleContains.some((keyword: string) => 
        titleLower.includes(keyword.toLowerCase())
      );
      if (!hasMatch) return false;
    }

    if (conditions.messageContains && conditions.messageContains.length > 0) {
      const msgLower = (notification.message || '').toLowerCase();
      const hasMatch = conditions.messageContains.some((keyword: string) => 
        msgLower.includes(keyword.toLowerCase())
      );
      if (!hasMatch) return false;
    }

    if (conditions.senderContains && conditions.senderContains.length > 0) {
      const senderLower = (notification.serviceSource || '').toLowerCase();
      const hasMatch = conditions.senderContains.some((keyword: string) => 
        senderLower.includes(keyword.toLowerCase())
      );
      if (!hasMatch) return false;
    }

    if (conditions.priority && conditions.priority.length > 0) {
      if (!conditions.priority.includes(notification.priority)) {
        return false;
      }
    }

    if (conditions.timeRange) {
      const now = new Date();
      const currentTime = `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}`;
      if (currentTime < conditions.timeRange.start || currentTime > conditions.timeRange.end) {
        return false;
      }
    }

    return true;
  }

  async evaluateNotification(
    notification: UNSNotification,
    userId: string,
    workspaceId?: string | null
  ): Promise<EvaluationResult> {
    const rules = await this.getUserRules(userId, workspaceId);
    const matchedRules: RuleMatch[] = [];
    
    let finalPriority = notification.priority;
    let finalCategory = notification.category;
    let shouldThrottle = false;
    let shouldDismiss = false;
    let shouldAutoRead = false;
    let smartReplyEnabled = false;
    const customLabels: string[] = [];

    for (const rule of rules) {
      if (this.evaluateConditions(notification, rule.conditions)) {
        matchedRules.push({
          ruleId: rule.id,
          ruleName: rule.name,
          action: rule.action,
          actionConfig: rule.actionConfig,
        });

        switch (rule.action) {
          case 'categorize':
            if (rule.actionConfig?.targetCategory) {
              finalCategory = rule.actionConfig.targetCategory;
            }
            break;

          case 'priority_boost':
            const boostMap: Record<string, string> = {
              'info': 'medium',
              'medium': 'high',
              'high': 'critical',
            };
            finalPriority = boostMap[finalPriority] || finalPriority;
            break;

          case 'priority_lower':
            const lowerMap: Record<string, string> = {
              'critical': 'high',
              'high': 'medium',
              'medium': 'info',
            };
            finalPriority = lowerMap[finalPriority] || finalPriority;
            break;

          case 'auto_read':
            shouldAutoRead = true;
            break;

          case 'auto_dismiss':
            shouldDismiss = true;
            break;

          case 'highlight':
            if (rule.actionConfig?.customLabel) {
              customLabels.push(rule.actionConfig.customLabel);
            }
            break;

          case 'throttle':
            shouldThrottle = true;
            break;

          case 'smart_reply':
            smartReplyEnabled = true;
            break;
        }

        await this.recordRuleMatch(rule.id);
      }
    }

    return {
      notification: {
        ...notification,
        priority: finalPriority as any,
        category: finalCategory as any,
      },
      matchedRules,
      finalPriority,
      finalCategory,
      shouldThrottle,
      shouldDismiss,
      shouldAutoRead,
      smartReplyEnabled,
      customLabels,
    };
  }

  private async recordRuleMatch(ruleId: string): Promise<void> {
    try {
      await db
        .update(notificationRules)
        .set({
          matchCount: sql`${notificationRules.matchCount} + 1`,
          lastMatchedAt: new Date(),
          updatedAt: new Date(),
        })
        .where(eq(notificationRules.id, ruleId));
    } catch (error) {
      console.error('[RuleEngine] Failed to record rule match:', error);
    }
  }

  async evaluateBatch(
    notifications: UNSNotification[],
    userId: string,
    workspaceId?: string | null
  ): Promise<EvaluationResult[]> {
    const results: EvaluationResult[] = [];
    
    for (const notification of notifications) {
      const result = await this.evaluateNotification(notification, userId, workspaceId);
      if (!result.shouldDismiss) {
        results.push(result);
      }
    }

    return results;
  }

  async createRule(
    userId: string,
    data: {
      name: string;
      description?: string;
      conditions: any;
      action: string;
      actionConfig?: any;
      priority?: number;
      workspaceId?: string;
    }
  ): Promise<any> {
    const [rule] = await db
      .insert(notificationRules)
      .values({
        userId,
        workspaceId: data.workspaceId,
        name: data.name,
        description: data.description,
        conditions: data.conditions,
        action: data.action as any,
        actionConfig: data.actionConfig,
        priority: data.priority || 0,
      })
      .returning();

    this.invalidateCache(userId, data.workspaceId);
    return rule;
  }

  async updateRule(
    ruleId: string,
    userId: string,
    updates: Partial<{
      name: string;
      description: string;
      conditions: any;
      action: string;
      actionConfig: any;
      priority: number;
      isActive: boolean;
    }>
  ): Promise<any> {
    const [rule] = await db
      .update(notificationRules)
      .set({
        ...updates,
        action: updates.action as any,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(notificationRules.id, ruleId),
          eq(notificationRules.userId, userId)
        )
      )
      .returning();

    if (rule) {
      this.invalidateCache(userId, rule.workspaceId);
    }
    return rule;
  }

  async deleteRule(ruleId: string, userId: string): Promise<boolean> {
    const [deleted] = await db
      .delete(notificationRules)
      .where(
        and(
          eq(notificationRules.id, ruleId),
          eq(notificationRules.userId, userId)
        )
      )
      .returning();

    if (deleted) {
      this.invalidateCache(userId, deleted.workspaceId);
    }
    return !!deleted;
  }

  private invalidateCache(userId: string, workspaceId?: string | null): void {
    const cacheKey = `${userId}-${workspaceId || 'global'}`;
    this.rulesCache.delete(cacheKey);
    this.cacheExpiry.delete(cacheKey);
  }

  clearAllCache(): void {
    this.rulesCache.clear();
    this.cacheExpiry.clear();
  }
}

export const notificationRuleEngine = NotificationRuleEngine.getInstance();
