import { db } from "../db";
import { createLogger } from '../lib/logger';
import { 
  platformUpdates, 
  userPlatformUpdateViews,
  notifications,
  maintenanceAlerts,
  maintenanceAcknowledgments,
  workspaces
} from "@shared/schema";
import { eq, and, or, desc, isNull, sql, lt, gte } from "drizzle-orm";
import { SCHEDULING } from '../config/platformConfig';
import { meteredGemini } from './billing/meteredGeminiClient';
import { usageMeteringService } from './billing/usageMetering';
import { ANTI_YAP_PRESETS } from './ai-brain/providers/geminiClient';
import { broadcastPlatformUpdateGlobal } from '../websocket';
import { humanizeTitle, containsTechnicalJargon, sanitizeForEndUser } from '@shared/utils/humanFriendlyCopy';
import { featureRegistryService, ValidationResult } from './featureRegistryService';
import { GoogleGenerativeAI } from "@google/generative-ai";
import { PLATFORM_WORKSPACE_ID } from './billing/billingConstants';

const log = createLogger('AiNotificationService');

// LAZY INIT (TRINITY.md §F): construct GoogleGenerativeAI on first use, not at
// module load. The previous module-load instantiation was guarded by a
// truthy check, but if any future change makes it unconditional it would
// crash boot when GEMINI_API_KEY is unset. Lazy factory + null fallback
// preserves the existing `directGenAI` consumers, returning null when no
// key is present so callers fall through to metered billing as before.
let _directGenAI: GoogleGenerativeAI | null | undefined = undefined;
function getDirectGenAI(): GoogleGenerativeAI | null {
  if (_directGenAI === undefined) {
    const k = process.env.GEMINI_API_KEY;
    _directGenAI = k ? new GoogleGenerativeAI(k) : null;
  }
  return _directGenAI;
}
const directGenAI = new Proxy({} as GoogleGenerativeAI, {
  get(_t, prop) {
    const inst = getDirectGenAI();
    if (!inst) return undefined;
    return (inst as any)[prop];
  },
}) as GoogleGenerativeAI | null;

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
const workspaceTierCache = new Map<string, { tier: string; expiresAt: number }>();
const RATE_LIMIT_WINDOW = 60 * 60 * 1000;
const TIER_CACHE_TTL = 5 * 60 * 1000;

function getRateLimitMax(tier?: string): number {
  const tierKey = (tier || 'professional') as keyof typeof SCHEDULING.notificationRateLimitByTier;
  return SCHEDULING.notificationRateLimitByTier[tierKey] || SCHEDULING.notificationRateLimitByTier.professional;
}

async function resolveWorkspaceTier(workspaceId: string): Promise<string> {
  if (!workspaceId || workspaceId === 'global') return 'professional';
  const now = Date.now();
  const cached = workspaceTierCache.get(workspaceId);
  if (cached && cached.expiresAt > now) return cached.tier;
  try {
    const [row] = await db.select({ tier: workspaces.subscriptionTier }).from(workspaces).where(eq(workspaces.id, workspaceId)).limit(1);
    const tier = row?.tier || 'professional';
    workspaceTierCache.set(workspaceId, { tier, expiresAt: now + TIER_CACHE_TTL });
    return tier;
  } catch {
    return 'professional';
  }
}

function checkRateLimit(workspaceId: string, tier: string): boolean {
  const now = Date.now();
  const key = workspaceId || "global";
  const limit = rateLimitMap.get(key);
  const maxLimit = getRateLimitMax(tier);
  
  if (!limit || now > limit.resetAt) {
    rateLimitMap.set(key, { count: 1, resetAt: now + RATE_LIMIT_WINDOW });
    return true;
  }
  
  if (limit.count >= maxLimit) {
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
  const workspaceTier = await resolveWorkspaceTier(workspaceKey);
  
  if (!checkRateLimit(workspaceKey, workspaceTier)) {
    log.info(`[AINotification] Rate limit exceeded for ${workspaceKey}`);
    return null;
  }
  
  // TRINITY FEATURE VALIDATION: Validate content before processing
  // This catches stale data, vague language, and missing feature references
  const skipFeatureCheck = (data.metadata as Record<string, any>)?.skipFeatureCheck === true;
  const preValidation = featureRegistryService.validateNotificationContent(
    data.title,
    data.description,
    { ...data.metadata as Record<string, any>, skipFeatureCheck }
  );
  
  // Block notifications with critical validation failures (unless skipFeatureCheck is set)
  const blockCheck = featureRegistryService.shouldBlockNotification(data.title, data.description);
  if (blockCheck.block && !skipFeatureCheck) {
    log.info(`[AINotification] BLOCKED - Validation failed: ${blockCheck.reason}`);
    log.info(`[AINotification] Title: "${data.title}", Issues: ${preValidation.issues.map(i => i.type).join(', ')}`);
    // Return null to prevent stale/vague content from reaching users
    return null;
  } else if (blockCheck.block && skipFeatureCheck) {
    log.info(`[AINotification] Bypass active - skipping validation block for: "${data.title}"`);
  }
  
  // Log warnings but allow notification to proceed
  if (preValidation.issues.length > 0) {
    const warnings = preValidation.issues.filter(i => i.severity === 'warning');
    if (warnings.length > 0) {
      log.info(`[AINotification] Validation warnings for "${data.title}":`, 
        warnings.map(w => `${w.type}: ${w.message}`).join('; '));
    }
  }
  
  // Attach feature context to metadata for Trinity enrichment
  const featureContext = preValidation.enrichedContent?.metadata?.featureContext || {};
  const enrichedMetadataBase = {
    ...data.metadata,
    featureReferences: preValidation.enrichedContent?.featureReferences || [],
    featureContext,
    validatedAt: preValidation.enrichedContent?.metadata?.validatedAt,
  };
  
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
        gte(platformUpdates.createdAt, oneDayAgo)
      )
    )
    .limit(1);
  
  if (existingByTitle.length > 0) {
    log.info(`[AINotification] Duplicate update detected (title match within 24h), skipping: ${humanizedTitle}`);
    return { id: existingByTitle[0].id, isDuplicate: true };
  }
  
  // For Trinity events with unique executionId, generate unique key
  // For regular updates, use content-based idempotency
  const idempotencyKey = hasUniqueMarker && executionId
    ? `ai-update-${data.workspaceId || "global"}-trinity-${crypto.randomUUID()}`
    : generateIdempotencyKey("update", data.workspaceId || null, JSON.stringify(data));
  
  let enhancedDescription = data.description;
  let structuredBreakdown: {
    technicalSummary?: string;
    impact?: string;
    resolution?: string;
    endUserSummary?: string;
  } = {};
  
  try {
    // Generate structured breakdown with Problem → Issue → Solution → Outcome
    const structuredPrompt = `You are Trinity, the AI brain behind CoAIleague. Generate a structured notification breakdown for end users.

CONTEXT:
- Title: ${data.title || 'Platform Update'}
- Description: ${data.description || 'A platform improvement was made'}
- Category: ${data.category || 'improvement'}

YOUR TASK: Generate a JSON response with these 5 fields that explain this update to non-technical users:

1. "title": A clear, descriptive title (max 60 chars). Describe WHAT happened, not generic "System Update"
   GOOD: "Dashboard Loading Improved", "Email Delivery Fixed", "New Shift Swap Feature"
   BAD: "System Update", "Maintenance Complete", "Configuration Changed"

2. "technicalSummary": PROBLEM - What was the situation? (1 sentence, max 100 chars)
   Explain what issue/opportunity existed in plain language

3. "impact": ISSUE - Why did this matter? (1 sentence, max 100 chars)  
   Explain what users experienced or what was at stake

4. "resolution": SOLUTION - What did Trinity do? (1 sentence, max 100 chars)
   Describe the action taken in simple terms

5. "endUserSummary": OUTCOME - What's the result for users? (1 sentence, max 100 chars)
   Focus on the user benefit or current state

VOICE: Be conversational, helpful, human. Use contractions. No corporate speak.

CRITICAL RULES - NEVER include:
- File names (e.g. trinityMemoryService.ts, routes.ts, schema.ts)
- Code references, backtick-wrapped code, or variable names
- Service class names (e.g. trinityMemoryService, platformChangeMonitor)
- File paths (e.g. server/services/..., client/src/...)
- Technical jargon like "edge cases", "data persistence", "runtime errors", "pipeline", "context state"
Instead, describe what USERS will notice in plain everyday language.

Respond with ONLY valid JSON, no markdown:`;
    
    const result = await meteredGemini.generate({
      workspaceId: data.workspaceId || PLATFORM_WORKSPACE_ID,
      featureKey: 'ai_notification',
      prompt: structuredPrompt,
      model: 'gemini-2.5-flash',
      temperature: 0.3,
      maxOutputTokens: 400,
    });
    
    if (result.success && result.text) {
      try {
        // Parse the JSON response, handling potential markdown code blocks
        let jsonText = result.text.trim();
        if (jsonText.startsWith('```json')) {
          jsonText = jsonText.replace(/^```json\s*/, '').replace(/\s*```$/, '');
        } else if (jsonText.startsWith('```')) {
          jsonText = jsonText.replace(/^```\s*/, '').replace(/\s*```$/, '');
        }
        
        let parsed: any;
        try {
          parsed = JSON.parse(jsonText);
        } catch (initialErr) {
          const firstBrace = jsonText.indexOf('{');
          if (firstBrace >= 0) {
            let depth = 0, inString = false, escaped = false, lastValidPos = firstBrace;
            for (let i = firstBrace; i < jsonText.length; i++) {
              const ch = jsonText[i];
              if (escaped) { escaped = false; continue; }
              if (ch === '\\') { escaped = true; continue; }
              if (ch === '"') { inString = !inString; continue; }
              if (!inString) {
                if (ch === '{') depth++;
                else if (ch === '}') { depth--; if (depth === 0) { lastValidPos = i; break; } }
              }
              if (!inString && depth === 1 && (ch === ',' || ch === '}')) lastValidPos = i;
            }
            let repaired = jsonText.substring(0, lastValidPos + 1);
            const opens = (repaired.match(/\{/g) || []).length;
            const closes = (repaired.match(/\}/g) || []).length;
            const lastQuoteComma = repaired.lastIndexOf('",');
            const lastQuoteClose = repaired.lastIndexOf('"}');
            const bestCut = Math.max(lastQuoteComma, lastQuoteClose);
            if (bestCut > 0 && (opens > closes || opens === closes)) {
              repaired = repaired.substring(0, bestCut + (repaired[bestCut + 1] === '}' ? 2 : 1));
            }
            const finalOpens = (repaired.match(/\{/g) || []).length;
            const finalCloses = (repaired.match(/\}/g) || []).length;
            for (let i = 0; i < finalOpens - finalCloses; i++) repaired += '}';
            try {
              parsed = JSON.parse(repaired);
              log.info('[AINotification] Repaired truncated JSON in generatePlatformUpdate');
            } catch (_) {
              throw initialErr;
            }
          } else {
            throw initialErr;
          }
        }
        
        if (parsed.technicalSummary) structuredBreakdown.technicalSummary = sanitizeForEndUser(parsed.technicalSummary);
        if (parsed.impact) structuredBreakdown.impact = sanitizeForEndUser(parsed.impact);
        if (parsed.resolution) structuredBreakdown.resolution = sanitizeForEndUser(parsed.resolution);
        if (parsed.endUserSummary) {
          structuredBreakdown.endUserSummary = sanitizeForEndUser(parsed.endUserSummary);
          enhancedDescription = structuredBreakdown.endUserSummary;
        }
        
        // Override humanized title with AI-generated descriptive title if provided
        if (parsed.title && typeof parsed.title === 'string' && parsed.title.length > 5) {
          // Store original for reference, use AI title for display
          structuredBreakdown.technicalSummary = structuredBreakdown.technicalSummary || data.title;
        }
        
        log.info('[AINotification] Generated structured breakdown:', Object.keys(structuredBreakdown));
      } catch (parseError) {
        log.info('[AINotification] JSON parse failed, using original description:', parseError);
        // Never use raw AI text as fallback — it often contains JSON or technical fragments
        // Keep the original description which is already human-readable
      }
    }
  } catch (error) {
    log.info("[AINotification] Gemini enhancement skipped:", error);
  }
  
  // Merge structured breakdown AND feature context into metadata for frontend consumption
  const enrichedMetadata = {
    ...enrichedMetadataBase,
    idempotencyKey,
    generatedAt: new Date().toISOString(),
    originalTitle: data.title,
    // Include Trinity-generated structured breakdown fields
    ...structuredBreakdown,
  };
  
  // TRINITY-EXCLUSIVE ARCHITECTURE: Skip DB insert if this is just for enrichment
  // Trinity Notification Bridge handles all What's New inserts - we only enrich content here
  if (data.skipInsert) {
    log.info(`[AINotification] Returning enriched content only (skipInsert=true): ${humanizedTitle}`);
    return {
      id: idempotencyKey,
      enrichedTitle: humanizedTitle,
      enrichedDescription: enhancedDescription,
      category: (data.category || "announcement") as string,
    };
  }
  
  const updateId = idempotencyKey;
  const finalTitle = sanitizeForEndUser(humanizedTitle);
  const finalDescription = sanitizeForEndUser(enhancedDescription);

  // Use onConflictDoNothing — same idempotency key on the same day means it's a duplicate
  const [update] = await db.insert(platformUpdates).values({
    id: updateId,
    title: finalTitle,
    description: finalDescription,
    category: data.category || "announcement",
    workspaceId: data.workspaceId || PLATFORM_WORKSPACE_ID,
    priority: data.priority || 1,
    isNew: true,
    visibility: "all",
    learnMoreUrl: data.learnMoreUrl,
    metadata: enrichedMetadata,
  }).onConflictDoNothing().returning({ id: platformUpdates.id });

  // If nothing was inserted (id collision = same update already exists today), skip broadcast
  if (!update) {
    log.info(`[AINotification] Skipped duplicate platform update (idempotency key exists): ${finalTitle}`);
    return { id: updateId, isDuplicate: true };
  }
  
  log.info(`[AINotification] Platform update created for: ${humanizedTitle}`);
  
  if (!data.skipBroadcast) {
    broadcastPlatformUpdateGlobal({
      id: update.id,
      title: finalTitle,
      description: finalDescription,
      category: data.category || "announcement",
      priority: data.priority || 1,
      learnMoreUrl: data.learnMoreUrl,
      metadata: enrichedMetadata,
      workspaceId: data.workspaceId,
      visibility: "all",
    });
  }
  
  return {
    id: update.id,
    enrichedTitle: finalTitle,
    enrichedDescription: finalDescription,
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
    
    log.info(`[AINotification] Created maintenance alert: ${alert.id} - ${data.title}`);
    return alert;
  } catch (error) {
    log.error("[AINotification] Failed to create maintenance alert:", error);
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
    log.error("[AINotification] Failed to acknowledge alert:", error);
    return false;
  }
}

// Acknowledge ALL maintenance alerts for a user (used by clear-all in System tab)
export async function acknowledgeAllMaintenanceAlerts(
  userId: string,
  workspaceId?: string
): Promise<number> {
  try {
    const allAlerts = await db.select({ id: maintenanceAlerts.id })
      .from(maintenanceAlerts);

    if (allAlerts.length === 0) return 0;

    // Bulk insert all acknowledgments — onConflictDoNothing handles already-acked alerts
    // and prevents unique constraint violations on double-tap or concurrent requests
    await db.insert(maintenanceAcknowledgments)
      .values(allAlerts.map(alert => ({ alertId: alert.id, userId })))
      .onConflictDoNothing();

    log.info(`[AINotification] acknowledgeAllMaintenanceAlerts: Acknowledged up to ${allAlerts.length} alerts for user ${userId}`);
    return allAlerts.length;
  } catch (error) {
    log.error("[AINotification] Failed to acknowledge all alerts:", error);
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
      log.info(`[AINotification] Platform update created for: ${title}`);
    }
  } catch (error) {
    log.error('[AINotification] Failed to handle platform change event:', error);
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
    .orderBy(desc(platformUpdates.priority), desc(platformUpdates.createdAt))
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
      log.info("[AINotification] Welcome summary AI enhancement skipped:", error);
    }

    return {
      updates: formattedUpdates,
      aiSummary,
      welcomeMessage,
    };
  } catch (error) {
    log.error("[AINotification] Failed to get new user welcome summary:", error);
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

/**
 * Universal AI Enrichment for ANY notification
 * This is the single source of truth for Trinity AI-generated contextual breakdowns.
 * Should be called by ALL notification creation paths to ensure consistent, meaningful content.
 */
export interface NotificationEnrichmentInput {
  title: string;
  message: string;
  type?: string;
  category?: string;
  workspaceId?: string;
  metadata?: Record<string, unknown>;
  // Personalization context — pass these to get role-specific, name-aware messages
  recipientFirstName?: string;
  recipientRole?: string;   // workspace role: org_owner, co_owner, manager, supervisor, staff
  workspaceName?: string;   // company name — fetched from DB if not provided
}

export interface NotificationEnrichmentOutput {
  title: string;
  message: string;
  metadata: {
    technicalSummary?: string;
    impact?: string;
    resolution?: string;
    endUserSummary?: string;
    aiEnriched?: boolean;
    [key: string]: unknown;
  };
}

// Lightweight cache: workspaceId → company name. TTL 5 minutes.
const wsNameCache = new Map<string, { name: string; expiresAt: number }>();

async function resolveWorkspaceName(workspaceId?: string): Promise<string> {
  if (!workspaceId || workspaceId === PLATFORM_WORKSPACE_ID) return process.env.PLATFORM_NAME || 'CoAIleague';
  const now = Date.now();
  const cached = wsNameCache.get(workspaceId);
  if (cached && cached.expiresAt > now) return cached.name;
  try {
    const [row] = await db.select({ name: workspaces.name }).from(workspaces).where(eq(workspaces.id, workspaceId)).limit(1);
    const name = row?.name || 'your organization';
    wsNameCache.set(workspaceId, { name, expiresAt: now + 5 * 60 * 1000 });
    return name;
  } catch {
    return 'your organization';
  }
}

// Role labels and framing instructions Trinity uses when writing for each audience
const ROLE_CONTEXT: Record<string, { label: string; frame: string }> = {
  org_owner:  { label: 'Owner',      frame: 'Frame around profitability, business risk, and strategic decisions. Lead with dollars, percentages, and impact on the bottom line.' },
  co_owner:   { label: 'Co-Owner',   frame: 'Frame around profitability, business risk, and strategic decisions. Lead with dollars, percentages, and impact on the bottom line.' },
  manager:    { label: 'Manager',    frame: 'Frame around team coverage, operational efficiency, and upcoming deadlines. Emphasize what action is needed and by when.' },
  supervisor: { label: 'Supervisor', frame: 'Frame around shift coverage, officer status, and immediate field operations. Be direct and operational — what needs attention right now.' },
  staff:      { label: 'Employee',   frame: 'Frame around what directly affects this person — their shifts, their pay, their documents, their schedule. Keep it personal and clear.' },
};

// Role-aware smart fallback when AI is unavailable
function buildFallbackMessage(
  title: string,
  message: string,
  firstName?: string,
  role?: string
): string {
  const greeting = firstName ? `Hi ${firstName} — ` : '';
  const roleCtx = ROLE_CONTEXT[role || ''];

  // Determine what kind of event this is and give a relevant summary
  const t = title.toLowerCase();
  if (t.includes('shift') || t.includes('schedule') || t.includes('coverage')) {
    if (role === 'org_owner' || role === 'co_owner') {
      return `${greeting}A scheduling change needs your attention. Review coverage and confirm staffing is within budget.`;
    } else if (role === 'supervisor') {
      return `${greeting}There's a shift coverage update — check your schedule and confirm officer assignments are set.`;
    } else {
      return `${greeting}Your schedule has been updated. Check the Schedule tab to see your upcoming shifts.`;
    }
  }
  if (t.includes('payroll') || t.includes('pay') || t.includes('invoice')) {
    if (role === 'org_owner' || role === 'co_owner' || role === 'manager') {
      return `${greeting}A payroll or billing action needs your review. Head to Payroll to see the details and approve or act.`;
    }
    return `${greeting}There's an update related to payroll — check your Payroll tab for details.`;
  }
  if (t.includes('compliance') || t.includes('document') || t.includes('certification') || t.includes('expir')) {
    if (role === 'staff') {
      return `${greeting}One of your compliance documents needs attention — check the Compliance tab to keep your record current.`;
    }
    return `${greeting}A compliance item needs attention. Review the Compliance tab to avoid scheduling conflicts.`;
  }
  if (t.includes('trinity') || t.includes('ai') || t.includes('automat')) {
    return `${greeting}Trinity completed an automated task for your organization. Check the activity log for the full summary.`;
  }
  // Generic smart fallback
  return `${greeting}${message && message.length < 200 ? message : title + ' — review your dashboard for details.'}`;
}

export async function enrichNotificationWithAI(
  input: NotificationEnrichmentInput
): Promise<NotificationEnrichmentOutput> {
  const { title, message, type, category, workspaceId, metadata = {},
    recipientFirstName, recipientRole } = input;

  // Resolve company name for context
  const companyName = input.workspaceName || await resolveWorkspaceName(workspaceId);
  const roleCtx = ROLE_CONTEXT[recipientRole || ''];
  const greeting = recipientFirstName ? `Hi ${recipientFirstName}` : '';

  let enrichedTitle = title;
  let enrichedMessage = message;
  let structuredBreakdown: Record<string, string> = {};

  try {
    // Compact prompt — no inline JSON template to avoid model stopping early
    const recipientLine = [
      recipientFirstName ? `Name: ${recipientFirstName}` : '',
      roleCtx ? `Role: ${roleCtx.label}` : '',
      companyName !== 'CoAIleague' ? `Company: ${companyName}` : '',
      roleCtx ? `Audience framing: ${roleCtx.frame}` : '',
    ].filter(Boolean).join('\n');

    const structuredPrompt = `You are Trinity, the AI brain of CoAIleague workforce platform. Write a clear, friendly notification for the security industry.

RECIPIENT:
${recipientLine || 'Security company team member'}

EVENT TO NOTIFY ABOUT:
Title: ${title}
Details: ${(message || 'No additional details').slice(0, 300)}

OUTPUT: Return only a JSON object with these 5 string fields (no markdown, no code fences):
- title: Specific headline under 55 chars. Never generic (not "System Update" or "Notification").
- summary: 1-2 plain-English sentences. Warm and direct.${recipientFirstName ? ` Start with "Hi ${recipientFirstName}".` : ''} Never mention file names or tech terms.
- actionHint: Shortest possible next step (under 40 chars), or the word null if no action needed.
- impact: One sentence: what happens if ignored.
- resolution: One sentence: what was already done.

JSON:`;
    
    // Try metered billing first, then fallback to direct Gemini for system notifications
    let aiResponseText: string | null = null;
    
    try {
      const result = await meteredGemini.generate({
        workspaceId: workspaceId || PLATFORM_WORKSPACE_ID,
        featureKey: 'ai_notification',
        prompt: structuredPrompt,
        model: 'gemini-2.5-flash',
        temperature: 0.3,
        maxOutputTokens: 700,
      });
      
      if (result.success && result.text) {
        aiResponseText = result.text;
        log.info('[AINotification] Metered billing succeeded for notification enrichment');
      } else if (result.error) {
        log.info('[AINotification] Metered billing failed, using direct Gemini fallback:', result.error);
      }
    } catch (meteredError: any) {
      log.info('[AINotification] Metered billing exception, using direct Gemini fallback:', meteredError.message || meteredError);
    }
    
    // No unbilled fallback — if metered billing fails (insufficient credits), skip AI enrichment
    if (!aiResponseText) {
      log.info('[AINotification] Metered AI unavailable — delivering notification without AI enrichment');
    }
    
    // Parse AI response if we got one
    if (aiResponseText) {
      try {
        // Parse the JSON response, handling potential markdown code blocks
        let jsonText = aiResponseText.trim();
        if (jsonText.startsWith('```json')) {
          jsonText = jsonText.replace(/^```json\s*/, '').replace(/\s*```$/, '');
        } else if (jsonText.startsWith('```')) {
          jsonText = jsonText.replace(/^```\s*/, '').replace(/\s*```$/, '');
        }
        
        // Robust JSON repair for AI responses (handles truncation and malformed output)
        let parsed: any = null;
        
        // Helper: Count unescaped quotes to detect unterminated strings
        const countUnescapedQuotes = (s: string): number => {
          let count = 0;
          let escaped = false;
          for (const char of s) {
            if (escaped) { escaped = false; continue; }
            if (char === '\\') { escaped = true; continue; }
            if (char === '"') count++;
          }
          return count;
        };
        
        // Helper: Extract JSON string value handling escaped quotes
        const extractJsonString = (text: string, fieldName: string): string | null => {
          const pattern = new RegExp(`"${fieldName}"\\s*:\\s*"`, 'i');
          const match = text.match(pattern);
          if (!match || match.index === undefined) return null;
          
          const startIdx = match.index + match[0].length;
          let result = '';
          let escaped = false;
          
          for (let i = startIdx; i < text.length; i++) {
            const char = text[i];
            if (escaped) {
              result += char;
              escaped = false;
              continue;
            }
            if (char === '\\') {
              escaped = true;
              continue;
            }
            if (char === '"') {
              return result;
            }
            result += char;
          }
          return result.length > 0 ? result : null; // Return partial if truncated
        };
        
        try {
          parsed = JSON.parse(jsonText);
        } catch (initialParseError) {
          // Detect truncation: unbalanced braces OR odd unescaped quotes
          const openBraces = (jsonText.match(/\{/g) || []).length;
          const closeBraces = (jsonText.match(/\}/g) || []).length;
          const unescapedQuotes = countUnescapedQuotes(jsonText);
          const isTruncated = openBraces > closeBraces || unescapedQuotes % 2 === 1;
          
          if (isTruncated || initialParseError) {
            // Strategy 1: Find JSON object bounds via brace matching
            let repairedJson = jsonText;
            const firstBrace = repairedJson.indexOf('{');
            
            if (firstBrace >= 0) {
              // Scan for balanced braces from first '{'
              let depth = 0;
              let lastValidPos = firstBrace;
              let inString = false;
              let escaped = false;
              
              for (let i = firstBrace; i < repairedJson.length; i++) {
                const char = repairedJson[i];
                
                if (escaped) { escaped = false; continue; }
                if (char === '\\') { escaped = true; continue; }
                
                if (char === '"') {
                  inString = !inString;
                  continue;
                }
                
                if (!inString) {
                  if (char === '{') depth++;
                  else if (char === '}') {
                    depth--;
                    if (depth === 0) {
                      lastValidPos = i;
                      break;
                    }
                  }
                }
                
                // Track last valid position after complete field
                if (!inString && depth === 1 && (char === ',' || char === '}')) {
                  lastValidPos = i;
                }
              }
              
              // If string was open at end, find last complete string
              if (inString || depth > 0) {
                // Find the last complete key-value pair
                const completeFieldPatterns = [
                  /"\s*,\s*$/,  // ends with ", 
                  /"\s*}\s*$/,  // ends with "}
                  /\d\s*,\s*$/, // ends with number,
                  /\d\s*}\s*$/, // ends with number}
                  /true\s*,\s*$/i,
                  /false\s*,\s*$/i,
                  /null\s*,\s*$/i,
                ];
                
                // Truncate at lastValidPos and close
                let truncated = repairedJson.substring(0, lastValidPos + 1);
                
                // Remove trailing incomplete content
                const lastCompleteComma = truncated.lastIndexOf('",');
                const lastCompleteClose = truncated.lastIndexOf('"}');
                const lastNumComma = truncated.search(/\d\s*,\s*[^,]*$/);
                
                let bestCut = Math.max(lastCompleteComma, lastCompleteClose);
                if (bestCut > 0) {
                  truncated = truncated.substring(0, bestCut + (truncated[bestCut + 1] === '}' ? 2 : 1));
                }
                
                // Ensure proper closing
                const newOpenBraces = (truncated.match(/\{/g) || []).length;
                const newCloseBraces = (truncated.match(/\}/g) || []).length;
                for (let i = 0; i < newOpenBraces - newCloseBraces; i++) {
                  truncated += '}';
                }
                
                try {
                  parsed = JSON.parse(truncated);
                  log.info('[AINotification] Repaired truncated JSON via brace matching');
                } catch (braceRepairError) {
                  // Fall through to regex extraction
                }
              }
            }
            
            // Strategy 2: Direct field extraction via robust regex (handles escaped quotes)
            if (!parsed) {
              log.info('[AINotification] Using robust field extraction fallback');
              parsed = {};

              const extTitle = extractJsonString(jsonText, 'title');
              const extSummary = extractJsonString(jsonText, 'summary');
              const extTechnicalSummary = extractJsonString(jsonText, 'technicalSummary');
              const extImpact = extractJsonString(jsonText, 'impact');
              const extResolution = extractJsonString(jsonText, 'resolution');
              const extEndUserSummary = extractJsonString(jsonText, 'endUserSummary');
              const extActionHint = extractJsonString(jsonText, 'actionHint');

              if (extTitle) parsed.title = extTitle;
              if (extSummary) parsed.summary = extSummary;
              if (extTechnicalSummary) parsed.technicalSummary = extTechnicalSummary;
              if (extImpact) parsed.impact = extImpact;
              if (extResolution) parsed.resolution = extResolution;
              if (extEndUserSummary) parsed.endUserSummary = extEndUserSummary;
              if (extActionHint) parsed.actionHint = extActionHint;

              if (Object.keys(parsed).length === 0) {
                parsed = null;
                log.info('[AINotification] Field extraction found no valid fields');
              } else {
                log.info('[AINotification] Extracted fields via regex:', Object.keys(parsed));
              }
            }
          }
        }
        
        if (parsed) {
          if (parsed.title && typeof parsed.title === 'string' && parsed.title.length > 5) {
            enrichedTitle = sanitizeForEndUser(parsed.title);
          }
          // Accept both new "summary" field and legacy "endUserSummary"
          const primaryMessage = parsed.summary || parsed.endUserSummary;
          if (primaryMessage) {
            enrichedMessage = sanitizeForEndUser(primaryMessage);
            structuredBreakdown.endUserSummary = enrichedMessage;
          }
          if (parsed.technicalSummary) structuredBreakdown.technicalSummary = sanitizeForEndUser(parsed.technicalSummary);
          if (parsed.impact) structuredBreakdown.impact = sanitizeForEndUser(parsed.impact);
          if (parsed.resolution) structuredBreakdown.resolution = sanitizeForEndUser(parsed.resolution);
          if (parsed.actionHint && parsed.actionHint !== 'null') {
            structuredBreakdown.actionHint = sanitizeForEndUser(parsed.actionHint);
          }

          log.info('[AINotification] Trinity enrichment complete:', Object.keys(structuredBreakdown));
        }
      } catch (parseError) {
        log.info('[AINotification] JSON parse failed in universal enrichment:', parseError);
      }
    }
  } catch (error) {
    log.info("[AINotification] Universal AI enrichment error (fallback to original):", error);
  }

  const aiEnriched = Object.keys(structuredBreakdown).length > 0;

  // When AI enrichment produced no result, use the smart role-aware fallback
  // instead of silently returning the raw technical title/message
  if (!aiEnriched) {
    const fallback = buildFallbackMessage(title, message, recipientFirstName, recipientRole);
    enrichedMessage = fallback;
    log.info('[AINotification] Using smart role-aware fallback message');
  }

  return {
    title: enrichedTitle,
    message: enrichedMessage,
    metadata: {
      ...metadata,
      ...structuredBreakdown,
      aiEnriched,
      originalTitle: title,
      originalMessage: message,
      recipientRole: recipientRole || undefined,
      workspaceName: companyName !== 'CoAIleague' ? companyName : undefined,
    },
  };
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
  enrichNotificationWithAI,
};

export default aiNotificationService;
