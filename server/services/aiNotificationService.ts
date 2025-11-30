import { db } from "../db";
import { 
  platformUpdates, 
  userPlatformUpdateViews,
  notifications,
  maintenanceAlerts,
  maintenanceAcknowledgments
} from "@shared/schema";
import { eq, and, or, desc, isNull, sql, lt } from "drizzle-orm";
import { GoogleGenerativeAI } from "@google/generative-ai";

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || "");

type UpdateCategory = "feature" | "improvement" | "bugfix" | "security" | "announcement";
type AlertSeverity = "info" | "warning" | "critical";

interface AIInsightData {
  title: string;
  description: string;
  category?: UpdateCategory;
  workspaceId?: string;
  priority?: number;
  learnMoreUrl?: string;
  metadata?: Record<string, unknown>;
}

interface MaintenanceAlertData {
  title: string;
  description: string;
  severity: AlertSeverity;
  scheduledStartTime: Date;
  scheduledEndTime: Date;
  affectedServices: string[];
  estimatedImpactMinutes?: number;
  workspaceId?: string;
  isBroadcast?: boolean;
}

const rateLimitMap = new Map<string, { count: number; resetAt: number }>();
const RATE_LIMIT_WINDOW = 60 * 60 * 1000;
const RATE_LIMIT_MAX = 20;

function checkRateLimit(workspaceId: string): boolean {
  const now = Date.now();
  const key = workspaceId || "global";
  const limit = rateLimitMap.get(key);
  
  if (!limit || now > limit.resetAt) {
    rateLimitMap.set(key, { count: 1, resetAt: now + RATE_LIMIT_WINDOW });
    return true;
  }
  
  if (limit.count >= RATE_LIMIT_MAX) {
    return false;
  }
  
  limit.count++;
  return true;
}

function generateIdempotencyKey(type: string, workspaceId: string | null, data: string): string {
  const datePrefix = new Date().toISOString().split("T")[0];
  const hash = Buffer.from(data).toString("base64").slice(0, 16);
  return `ai-${type}-${workspaceId || "global"}-${datePrefix}-${hash}`;
}

export async function generatePlatformUpdate(data: AIInsightData): Promise<{ id: string } | null> {
  const workspaceKey = data.workspaceId || "global";
  
  if (!checkRateLimit(workspaceKey)) {
    console.log(`[AINotification] Rate limit exceeded for ${workspaceKey}`);
    return null;
  }
  
  const idempotencyKey = generateIdempotencyKey("update", data.workspaceId || null, JSON.stringify(data));
  
  const existing = await db.select({ id: platformUpdates.id })
    .from(platformUpdates)
    .where(
      and(
        eq(platformUpdates.title, data.title),
        data.workspaceId 
          ? eq(platformUpdates.workspaceId, data.workspaceId)
          : isNull(platformUpdates.workspaceId)
      )
    )
    .limit(1);
  
  if (existing.length > 0) {
    console.log(`[AINotification] Duplicate update detected, skipping: ${data.title}`);
    return { id: existing[0].id };
  }
  
  let enhancedDescription = data.description;
  
  try {
    const model = genAI.getGenerativeModel({ model: "gemini-2.0-flash-exp" });
    const prompt = `You are CoAIleague's AI brain. Rewrite this platform update description to be engaging, clear, and professional for end users. Keep it under 200 characters.

Original: ${data.description}

Enhanced description:`;
    
    const result = await model.generateContent(prompt);
    const response = result.response.text().trim();
    if (response && response.length < 500) {
      enhancedDescription = response;
    }
  } catch (error) {
    console.log("[AINotification] Gemini enhancement skipped:", error);
  }
  
  const updateId = idempotencyKey;
  const [update] = await db.insert(platformUpdates).values({
    id: updateId,
    title: data.title,
    description: enhancedDescription,
    category: data.category || "announcement",
    workspaceId: data.workspaceId,
    priority: data.priority || 1,
    isNew: true,
    learnMoreUrl: data.learnMoreUrl,
    metadata: { ...data.metadata, idempotencyKey, generatedAt: new Date().toISOString() },
    date: new Date(),
  }).returning({ id: platformUpdates.id });
  
  console.log(`[AINotification] Created platform update: ${update.id} - ${data.title}`);
  return update;
}

export async function pushAIInsight(
  type: "scheduling" | "performance" | "compliance" | "automation" | "system",
  data: AIInsightData
): Promise<{ id: string } | null> {
  const categoryMap: Record<string, UpdateCategory> = {
    scheduling: "feature",
    performance: "improvement",
    compliance: "security",
    automation: "feature",
    system: "announcement",
  };
  
  return generatePlatformUpdate({
    ...data,
    category: data.category || categoryMap[type],
    metadata: { ...data.metadata, insightType: type },
  });
}

export async function getRecentUpdatesForUser(
  userId: string,
  workspaceId?: string,
  limit: number = 20
): Promise<Array<{
  id: string;
  title: string;
  description: string;
  category: string;
  priority: number;
  isNew: boolean;
  isViewed: boolean;
  createdAt: Date;
  learnMoreUrl?: string;
}>> {
  const updates = await db.select({
    id: platformUpdates.id,
    title: platformUpdates.title,
    description: platformUpdates.description,
    category: platformUpdates.category,
    priority: platformUpdates.priority,
    isNew: platformUpdates.isNew,
    createdAt: platformUpdates.createdAt,
    learnMoreUrl: platformUpdates.learnMoreUrl,
  })
  .from(platformUpdates)
  .where(
    and(
      or(
        eq(platformUpdates.visibility, "all"),
        workspaceId ? eq(platformUpdates.workspaceId, workspaceId) : sql`false`
      ),
      or(
        isNull(platformUpdates.workspaceId),
        workspaceId ? eq(platformUpdates.workspaceId, workspaceId) : sql`false`
      )
    )
  )
  .orderBy(desc(platformUpdates.priority), desc(platformUpdates.createdAt))
  .limit(limit);
  
  const viewedUpdates = await db.select({ updateId: userPlatformUpdateViews.updateId })
    .from(userPlatformUpdateViews)
    .where(eq(userPlatformUpdateViews.userId, userId));
  
  const viewedIds = new Set(viewedUpdates.map(v => v.updateId));
  
  return updates.map(u => ({
    id: u.id,
    title: u.title,
    description: u.description,
    category: u.category || "announcement",
    priority: u.priority || 1,
    isNew: u.isNew ?? true,
    isViewed: viewedIds.has(u.id),
    createdAt: u.createdAt || new Date(),
    learnMoreUrl: u.learnMoreUrl || undefined,
  }));
}

export async function markUpdateViewed(userId: string, updateId: string): Promise<void> {
  await db.insert(userPlatformUpdateViews)
    .values({
      userId,
      updateId,
      viewSource: "popover",
    })
    .onConflictDoNothing();
}

export async function getUnviewedUpdateCount(userId: string, workspaceId?: string): Promise<number> {
  const updates = await getRecentUpdatesForUser(userId, workspaceId);
  return updates.filter(u => !u.isViewed && u.isNew).length;
}

export async function createMaintenanceAlert(
  createdById: string,
  data: MaintenanceAlertData
): Promise<{ id: string } | null> {
  try {
    const [alert] = await db.insert(maintenanceAlerts).values({
      createdById,
      title: data.title,
      description: data.description,
      severity: data.severity,
      scheduledStartTime: data.scheduledStartTime,
      scheduledEndTime: data.scheduledEndTime,
      affectedServices: data.affectedServices,
      estimatedImpactMinutes: data.estimatedImpactMinutes,
      workspaceId: data.workspaceId,
      isBroadcast: data.isBroadcast ?? true,
      status: "scheduled",
    }).returning({ id: maintenanceAlerts.id });
    
    console.log(`[AINotification] Created maintenance alert: ${alert.id} - ${data.title}`);
    return alert;
  } catch (error) {
    console.error("[AINotification] Failed to create maintenance alert:", error);
    return null;
  }
}

export async function getActiveMaintenanceAlerts(workspaceId?: string): Promise<Array<{
  id: string;
  title: string;
  description: string;
  severity: string;
  status: string;
  scheduledStartTime: Date;
  scheduledEndTime: Date;
  affectedServices: string[];
}>> {
  const alerts = await db.select()
    .from(maintenanceAlerts)
    .where(
      and(
        or(
          eq(maintenanceAlerts.status, "scheduled"),
          eq(maintenanceAlerts.status, "in_progress")
        ),
        or(
          isNull(maintenanceAlerts.workspaceId),
          workspaceId ? eq(maintenanceAlerts.workspaceId, workspaceId) : sql`true`
        )
      )
    )
    .orderBy(desc(maintenanceAlerts.scheduledStartTime))
    .limit(10);
  
  return alerts.map(a => ({
    id: a.id,
    title: a.title,
    description: a.description,
    severity: a.severity || "info",
    status: a.status || "scheduled",
    scheduledStartTime: a.scheduledStartTime,
    scheduledEndTime: a.scheduledEndTime,
    affectedServices: (a.affectedServices as string[]) || [],
  }));
}

export async function acknowledgeMaintenanceAlert(
  alertId: string,
  userId: string
): Promise<boolean> {
  try {
    const existing = await db.select()
      .from(maintenanceAcknowledgments)
      .where(
        and(
          eq(maintenanceAcknowledgments.alertId, alertId),
          eq(maintenanceAcknowledgments.userId, userId)
        )
      )
      .limit(1);
    
    if (existing.length > 0) {
      return true;
    }
    
    await db.insert(maintenanceAcknowledgments).values({
      alertId,
      userId,
    });
    
    await db.update(maintenanceAlerts)
      .set({ 
        acknowledgedByCount: sql`${maintenanceAlerts.acknowledgedByCount} + 1`
      })
      .where(eq(maintenanceAlerts.id, alertId));
    
    return true;
  } catch (error) {
    console.error("[AINotification] Failed to acknowledge alert:", error);
    return false;
  }
}

export async function notifyAutomationComplete(
  type: "scheduling" | "invoicing" | "payroll",
  workspaceId: string,
  details: Record<string, unknown>
): Promise<void> {
  const messages: Record<string, { title: string; description: string }> = {
    scheduling: {
      title: "AI Schedule Generated",
      description: `Your AI-optimized schedule is ready for review. ${details.shiftsCreated || 0} shifts created.`,
    },
    invoicing: {
      title: "Invoices Processed",
      description: `${details.invoicesGenerated || 0} invoices have been automatically generated and are ready to send.`,
    },
    payroll: {
      title: "Payroll Processed",
      description: `Payroll for ${details.employeesProcessed || 0} employees has been calculated and is ready for approval.`,
    },
  };
  
  const msg = messages[type];
  if (msg) {
    await pushAIInsight("automation", {
      title: msg.title,
      description: msg.description,
      workspaceId,
      category: "feature",
      priority: 2,
      metadata: { automationType: type, ...details },
    });
  }
}

export async function notifySystemIssue(
  issue: string,
  suggestion: string,
  workspaceId?: string
): Promise<void> {
  await pushAIInsight("system", {
    title: "System Health Notice",
    description: `${issue}. Suggestion: ${suggestion}`,
    workspaceId,
    category: "security",
    priority: 3,
    metadata: { issue, suggestion, detectedAt: new Date().toISOString() },
  });
}

export const aiNotificationService = {
  generatePlatformUpdate,
  pushAIInsight,
  getRecentUpdatesForUser,
  markUpdateViewed,
  getUnviewedUpdateCount,
  createMaintenanceAlert,
  getActiveMaintenanceAlerts,
  acknowledgeMaintenanceAlert,
  notifyAutomationComplete,
  notifySystemIssue,
};

export default aiNotificationService;
