import { db } from "../db";
import { 
  platformUpdates, 
  userPlatformUpdateViews,
  notifications,
  maintenanceAlerts,
  maintenanceAcknowledgments
} from "@shared/schema";
import { eq, and, or, desc, isNull, sql, lt, gte } from "drizzle-orm";
import { meteredGemini } from './billing/meteredGeminiClient';
import { PLATFORM_WORKSPACE_ID } from '../seed-platform-workspace';
import { ANTI_YAP_PRESETS } from './ai-brain/providers/geminiClient';
import { broadcastPlatformUpdateGlobal } from '../websocket';
import { humanizeTitle, containsTechnicalJargon } from '@shared/utils/humanFriendlyCopy';

type UpdateCategory = "feature" | "improvement" | "bugfix" | "security" | "announcement";
type AlertSeverity = "info" | "warning" | "critical";

// Valid platform_update_category enum values
const VALID_CATEGORIES: UpdateCategory[] = ['feature', 'improvement', 'bugfix', 'security', 'announcement'];

// Sanitizes any category string to a valid enum value
function sanitizeCategory(category: string | undefined): UpdateCategory {
  if (!category) return 'announcement';
  
  // Direct match to valid enum value
  if (VALID_CATEGORIES.includes(category as UpdateCategory)) {
    return category as UpdateCategory;
  }
  
  // Map detailed/invalid categories to valid enum values
  // Extended to support platformEventBus categories (maintenance, diagnostic, ai_brain, error, support)
  const categoryMapping: Record<string, UpdateCategory> = {
    'hotpatch': 'bugfix',
    'service': 'feature',
    'bot_automation': 'feature',
    'deprecation': 'announcement',
    'integration': 'feature',
    'ui_update': 'improvement',
    'backend_update': 'improvement',
    'performance': 'improvement',
    'documentation': 'announcement',
    // platformEventBus extended categories
    'maintenance': 'announcement',
    'diagnostic': 'improvement',
    'ai_brain': 'feature',
    'error': 'bugfix',
    'support': 'announcement',
  };
  
  return categoryMapping[category] || 'announcement';
}

interface AIInsightData {
  title: string;
  description: string;
  category?: UpdateCategory;
  workspaceId?: string;
  priority?: number;
  learnMoreUrl?: string;
  metadata?: Record<string, unknown>;
  skipBroadcast?: boolean; // Set by platformEventBus to prevent double WebSocket broadcast
  skipInsert?: boolean; // TRINITY-EXCLUSIVE: Skip DB insert when only enriching content
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

// Extended return type when skipBroadcast is true - includes enriched data for caller to broadcast
export interface PlatformUpdateResult {
  id: string;
  enrichedTitle?: string;
  enrichedDescription?: string;
  category?: string;
  isDuplicate?: boolean; // True if this was an existing record, caller should skip broadcast
}

export async function generatePlatformUpdate(data: AIInsightData): Promise<PlatformUpdateResult | null> {
  const workspaceKey = data.workspaceId || "global";
  
  if (!checkRateLimit(workspaceKey)) {
    console.log(`[AINotification] Rate limit exceeded for ${workspaceKey}`);
    return null;
  }
  
  // Humanize title if it contains technical jargon for better end-user readability
  const humanizedTitle = containsTechnicalJargon(data.title) 
    ? humanizeTitle(data.title)
    : data.title;
  
  // Check for executionId in metadata - if present, use UUID to make idempotency key unique
  // BUT always check for title duplicates first to prevent repeated system messages
  const executionId = data.metadata?.executionId as string | undefined;
  const hasUniqueMarker = executionId || data.metadata?.sourceAIBrain;
  
  // ALWAYS check for title-based duplicates first (within last 24 hours)
  // This prevents repeated system messages like "Seasonal Theming Disabled"
  // Check BOTH original and humanized titles to catch duplicates regardless of format
  // Also check metadata->>originalTitle for robust matching across humanization changes
  const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const existingByTitle = await db.select({ id: platformUpdates.id })
    .from(platformUpdates)
    .where(
      and(
        or(
          eq(platformUpdates.title, data.title),
          eq(platformUpdates.title, humanizedTitle),
          sql`${platformUpdates.metadata}->>'originalTitle' = ${data.title}`
        ),
        data.workspaceId 
          ? eq(platformUpdates.workspaceId, data.workspaceId)
          : isNull(platformUpdates.workspaceId),
        gte(platformUpdates.date, oneDayAgo)
      )
    )
    .limit(1);
  
  if (existingByTitle.length > 0) {
    console.log(`[AINotification] Duplicate update detected (title match within 24h), skipping: ${humanizedTitle}`);
    return { id: existingByTitle[0].id, isDuplicate: true };
  }
  
  // For Trinity events with unique executionId, generate unique key
  // For regular updates, use content-based idempotency
  const idempotencyKey = hasUniqueMarker && executionId
    ? `ai-update-${data.workspaceId || "global"}-trinity-${crypto.randomUUID()}`
    : generateIdempotencyKey("update", data.workspaceId || null, JSON.stringify(data));
  
  let enhancedDescription = data.description;
  
  try {
    const prompt = `You are Trinity, the AI brain behind CoAIleague. Write platform update notifications in your humanized senior engineer voice.

TRINITY'S VOICE RULES:
1. Speak naturally like a helpful senior engineer, NOT corporate PR
2. Use conversational language: "Just pushed...", "Quick update:", "Got a fix for..."
3. Keep it SHORT (1-2 sentences, max 180 chars)
4. Focus on WHAT changed and WHY it matters to users
5. Use contractions (we've, it's, you'll) - sound human
6. NEVER say "We have updated" or "We've completed" - that's boring corporate speak
7. Show personality: "Heads up:", "Nice one:", "Fixed!", "Boosted the..."

GOOD EXAMPLES:
- "Just improved how your dashboard loads - should feel snappier now."
- "Heads up: seasonal themes are off for now. Keeps things clean."
- "Fixed a hiccup with daily digest emails. You'll get 'em now."
- "Boosted the API routing to handle more at once. Smoother performance ahead."

BAD EXAMPLES (NEVER write like this):
- "We have updated our internal system guidelines..."
- "We've completed data storage maintenance..."
- "This update ensures a smoother transition..."

INPUT TITLE: ${data.title || 'Platform Update'}
INPUT DESCRIPTION: ${data.description || 'A platform improvement was made'}
CATEGORY: ${data.category || 'improvement'}

Write Trinity's notification (short, human, helpful):
SUMMARY:`;
    
    const result = await meteredGemini.generate({
      workspaceId: data.workspaceId || PLATFORM_WORKSPACE_ID,
      featureKey: 'ai_notification',
      prompt,
      model: 'gemini-2.5-flash',
      temperature: ANTI_YAP_PRESETS.notification.temperature,
      maxOutputTokens: ANTI_YAP_PRESETS.notification.maxTokens,
    });
    if (result.success && result.text && result.text.length < 500) {
      enhancedDescription = result.text.trim();
    }
  } catch (error) {
    console.log("[AINotification] Gemini enhancement skipped:", error);
  }
  
  // TRINITY-EXCLUSIVE ARCHITECTURE: Skip DB insert if this is just for enrichment
  // Trinity Notification Bridge handles all What's New inserts - we only enrich content here
  if (data.skipInsert) {
    console.log(`[AINotification] Returning enriched content only (skipInsert=true): ${humanizedTitle}`);
    return {
      id: idempotencyKey,
      enrichedTitle: humanizedTitle,
      enrichedDescription: enhancedDescription,
      category: (data.category || "announcement") as string,
    };
  }
  
  const updateId = idempotencyKey;
  const [update] = await db.insert(platformUpdates).values({
    id: updateId,
    title: humanizedTitle,
    description: enhancedDescription,
    category: data.category || "announcement",
    workspaceId: data.workspaceId,
    priority: data.priority || 1,
    isNew: true,
    visibility: "all",
    learnMoreUrl: data.learnMoreUrl,
    metadata: { ...data.metadata, idempotencyKey, generatedAt: new Date().toISOString(), originalTitle: data.title },
    date: new Date(),
  }).returning({ id: platformUpdates.id });
  
  console.log(`[AINotification] Platform update created for: ${humanizedTitle}`);
  
  // Broadcast via WebSocket for real-time UNS updates
  // SKIP if called from platformEventBus (it handles its own broadcast with enriched data)
  if (!data.skipBroadcast) {
    broadcastPlatformUpdateGlobal({
      id: update.id,
      title: humanizedTitle,
      description: enhancedDescription,
      category: data.category || "announcement",
      priority: data.priority || 1,
      learnMoreUrl: data.learnMoreUrl,
      metadata: data.metadata,
      workspaceId: data.workspaceId,
      visibility: "all",
    });
  }
  
  // Return enriched data when skipBroadcast is true so caller can broadcast with AI-enhanced content
  return {
    id: update.id,
    enrichedTitle: humanizedTitle,
    enrichedDescription: enhancedDescription,
    category: (data.category || "announcement") as string,
  };
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

export async function getActiveMaintenanceAlerts(workspaceId?: string, userId?: string): Promise<Array<{
  id: string;
  title: string;
  description: string;
  severity: string;
  status: string;
  scheduledStartTime: Date;
  scheduledEndTime: Date;
  affectedServices: string[];
  isAcknowledged: boolean;
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
  
  // Get acknowledgments for this user if userId provided
  const userAcks = userId ? await db.select({ alertId: maintenanceAcknowledgments.alertId })
    .from(maintenanceAcknowledgments)
    .where(eq(maintenanceAcknowledgments.userId, userId)) : [];
  
  const ackedAlertIds = new Set(userAcks.map(a => a.alertId));
  
  return alerts.map(a => ({
    id: a.id,
    title: a.title,
    description: a.description,
    severity: a.severity || "info",
    status: a.status || "scheduled",
    scheduledStartTime: a.scheduledStartTime,
    scheduledEndTime: a.scheduledEndTime,
    affectedServices: (a.affectedServices as string[]) || [],
    isAcknowledged: ackedAlertIds.has(a.id),
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

// Acknowledge ALL maintenance alerts for a user (used by clear-all in System tab)
export async function acknowledgeAllMaintenanceAlerts(
  userId: string,
  workspaceId?: string
): Promise<number> {
  try {
    // Get ALL alerts regardless of status - user wants to clear everything in System tab
    // This includes scheduled, in_progress, completed, and cancelled alerts
    const allAlerts = await db.select({ id: maintenanceAlerts.id })
      .from(maintenanceAlerts);
    
    console.log(`[AINotification] acknowledgeAllMaintenanceAlerts: Found ${allAlerts.length} total alerts to acknowledge for user ${userId}`);
    
    if (allAlerts.length === 0) {
      return 0;
    }
    
    let acknowledged = 0;
    for (const alert of allAlerts) {
      // Check if already acknowledged
      const existing = await db.select()
        .from(maintenanceAcknowledgments)
        .where(
          and(
            eq(maintenanceAcknowledgments.alertId, alert.id),
            eq(maintenanceAcknowledgments.userId, userId)
          )
        )
        .limit(1);
      
      if (existing.length === 0) {
        await db.insert(maintenanceAcknowledgments).values({
          alertId: alert.id,
          userId,
        });
        
        await db.update(maintenanceAlerts)
          .set({ 
            acknowledgedByCount: sql`${maintenanceAlerts.acknowledgedByCount} + 1`
          })
          .where(eq(maintenanceAlerts.id, alert.id));
        
        acknowledged++;
      }
    }
    
    return acknowledged;
  } catch (error) {
    console.error("[AINotification] Failed to acknowledge all alerts:", error);
    return 0;
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

/**
 * Event listener for platform changes - converts AI Brain events into What's New notifications
 */
export async function handlePlatformChangeEvent(event: any): Promise<void> {
  try {
    const eventType = event.type;
    const title = event.title;
    const description = event.description;
    // Sanitize category to ensure it's a valid enum value
    const category = sanitizeCategory(event.category);
    
    // Only create updates for actual platform changes
    if (!title || !['feature_released', 'feature_updated', 'bugfix_deployed', 'security_patch', 'announcement'].includes(eventType)) {
      return;
    }
    
    // Generate platform update which creates a What's New record
    const result = await generatePlatformUpdate({
      title,
      description,
      category,
      workspaceId: event.workspaceId,
      priority: event.priority || 2,
      learnMoreUrl: event.learnMoreUrl,
      metadata: {
        ...event.metadata,
        eventType,
        sourceAIBrain: true,
        detectedAt: new Date().toISOString(),
      },
    });
    
    if (result) {
      console.log(`[AINotification] Platform update created for: ${title}`);
    }
  } catch (error) {
    console.error('[AINotification] Failed to handle platform change event:', error);
  }
}

/**
 * Get welcome summary for new users - shows top 3 platform updates with AI summary
 */
export async function getNewUserWelcomeSummary(
  userId: string,
  workspaceId?: string
): Promise<{
  updates: Array<{
    id: string;
    title: string;
    description: string;
    category: string;
    learnMoreUrl?: string;
  }>;
  aiSummary: string;
  welcomeMessage: string;
}> {
  try {
    // Get top 3 most important updates (by priority, then date)
    const updates = await db.select({
      id: platformUpdates.id,
      title: platformUpdates.title,
      description: platformUpdates.description,
      category: platformUpdates.category,
      priority: platformUpdates.priority,
      learnMoreUrl: platformUpdates.learnMoreUrl,
    })
    .from(platformUpdates)
    .where(
      or(
        eq(platformUpdates.visibility, "all"),
        workspaceId ? eq(platformUpdates.workspaceId, workspaceId) : sql`false`
      )
    )
    .orderBy(desc(platformUpdates.priority), desc(platformUpdates.date))
    .limit(3);

    // Format updates for return
    const formattedUpdates = updates.map(u => ({
      id: u.id,
      title: u.title,
      description: u.description || '',
      category: u.category || 'announcement',
      learnMoreUrl: u.learnMoreUrl || undefined,
    }));

    // Generate AI summary
    let aiSummary = "Welcome to CoAIleague! Here are the latest platform highlights.";
    let welcomeMessage = "We're excited to have you on board!";
    
    try {
      const updateTitles = updates.map(u => u.title).join(", ");
      
      const prompt = `You are CoAIleague's friendly AI assistant. Create a brief, warm welcome message (max 2 sentences) for a new user, mentioning these platform highlights: ${updateTitles}. Be encouraging and helpful.`;
      
      const result = await meteredGemini.generate({
        workspaceId: workspaceId || PLATFORM_WORKSPACE_ID,
        featureKey: 'ai_notification',
        prompt,
        model: 'gemini-2.5-flash',
        temperature: ANTI_YAP_PRESETS.notification.temperature,
        maxOutputTokens: ANTI_YAP_PRESETS.notification.maxTokens,
      });
      if (result.success && result.text && result.text.length < 300) {
        welcomeMessage = result.text.trim();
      }
    } catch (error) {
      console.log("[AINotification] Welcome summary AI enhancement skipped:", error);
    }

    return {
      updates: formattedUpdates,
      aiSummary,
      welcomeMessage,
    };
  } catch (error) {
    console.error("[AINotification] Failed to get new user welcome summary:", error);
    return {
      updates: [],
      aiSummary: "Welcome to CoAIleague!",
      welcomeMessage: "Explore our workforce management features to get started.",
    };
  }
}

/**
 * Mark updates as viewed for a new user after showing welcome summary
 */
export async function markWelcomeUpdatesViewed(
  userId: string,
  updateIds: string[]
): Promise<void> {
  for (const updateId of updateIds) {
    await markUpdateViewed(userId, updateId);
  }
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
  acknowledgeAllMaintenanceAlerts,
  notifyAutomationComplete,
  notifySystemIssue,
  handlePlatformChangeEvent,
  getNewUserWelcomeSummary,
  markWelcomeUpdatesViewed,
};

export default aiNotificationService;
