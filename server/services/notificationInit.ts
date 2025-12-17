import { db } from "../db";
import { platformUpdates, maintenanceAlerts } from "@shared/schema";
import { sql, eq } from "drizzle-orm";
import aiNotificationService from "./aiNotificationService";

const INITIAL_UPDATES = [
  {
    id: "welcome-coaileague-v1",
    title: "Welcome to CoAIleague",
    description: "Your AI-powered workforce management platform is ready. Explore scheduling, time tracking, payroll, and more.",
    category: "announcement" as const,
    priority: 5,
    learnMoreUrl: "/help",
  },
  {
    id: "feature-ai-scheduling",
    title: "AI-Powered Scheduling Available",
    description: "Let our AI brain optimize your workforce schedules automatically based on employee preferences and business needs.",
    category: "feature" as const,
    priority: 4,
    learnMoreUrl: "/schedule",
  },
  {
    id: "feature-real-time-analytics",
    title: "Real-Time Analytics Dashboard",
    description: "Track workforce metrics, revenue, and performance with live data visualizations and AI-generated insights.",
    category: "feature" as const,
    priority: 3,
    learnMoreUrl: "/analytics",
  },
  {
    id: "feature-integrations",
    title: "QuickBooks & Gusto Integration",
    description: "Connect your accounting and payroll systems for seamless financial management and automated syncing.",
    category: "improvement" as const,
    priority: 3,
    learnMoreUrl: "/integrations",
  },
  {
    id: "security-encryption",
    title: "Enterprise Security Enabled",
    description: "Your data is protected with AES-256-GCM encryption, RBAC access controls, and comprehensive audit logging.",
    category: "security" as const,
    priority: 2,
    learnMoreUrl: "/settings/security",
  },
];

export async function initializeNotifications(): Promise<void> {
  console.log("[NotificationInit] Checking for initial platform updates...");
  
  try {
    // Check if there are ANY platform updates - if so, skip seeding entirely
    const existingCount = await db.select({ count: sql<number>`count(*)` })
      .from(platformUpdates);
    
    if (existingCount[0]?.count > 0) {
      console.log("[NotificationInit] Platform updates already exist, skipping seed");
      return;
    }
    
    // Only seed if the database is truly empty
    for (const update of INITIAL_UPDATES) {
      await db.insert(platformUpdates).values({
        id: update.id,
        title: update.title,
        description: update.description,
        category: update.category,
        priority: update.priority,
        isNew: true,
        visibility: "all",
        learnMoreUrl: update.learnMoreUrl,
        date: new Date(),
        metadata: { source: "system-init", version: "1.0.0" },
      });
      console.log(`[NotificationInit] Created update: ${update.title}`);
    }
    
    console.log("[NotificationInit] Initial updates seeded successfully");
  } catch (error) {
    console.error("[NotificationInit] Failed to seed updates:", error);
  }
}

// Cleanup old platform updates, keeping only the most recent 3
export async function cleanupOldPlatformUpdates(): Promise<number> {
  try {
    const result = await db.execute(sql`
      DELETE FROM platform_updates 
      WHERE id NOT IN (
        SELECT id FROM platform_updates ORDER BY created_at DESC LIMIT 3
      )
    `);
    const deleted = result.rowCount || 0;
    if (deleted > 0) {
      console.log(`[NotificationInit] Cleaned up ${deleted} old platform updates`);
    }
    return deleted;
  } catch (error) {
    console.error("[NotificationInit] Failed to cleanup updates:", error);
    return 0;
  }
}

export async function pushSystemNotification(
  title: string,
  description: string,
  category: "feature" | "improvement" | "bugfix" | "security" | "announcement" = "announcement",
  options: {
    workspaceId?: string;
    priority?: number;
    learnMoreUrl?: string;
    broadcast?: boolean;
  } = {}
): Promise<{ id: string } | null> {
  return aiNotificationService.generatePlatformUpdate({
    title,
    description,
    category,
    workspaceId: options.broadcast === false ? options.workspaceId : undefined,
    priority: options.priority || 2,
    learnMoreUrl: options.learnMoreUrl,
  });
}

export async function pushMaintenanceAlert(
  title: string,
  description: string,
  severity: "info" | "warning" | "critical",
  scheduledStart: Date,
  scheduledEnd: Date,
  affectedServices: string[],
  createdById: string
): Promise<{ id: string } | null> {
  return aiNotificationService.createMaintenanceAlert(createdById, {
    title,
    description,
    severity,
    scheduledStartTime: scheduledStart,
    scheduledEndTime: scheduledEnd,
    affectedServices,
    isBroadcast: true,
  });
}

export async function notifyScheduleGenerated(
  workspaceId: string,
  details: { shiftsCreated: number; weekStart: string }
): Promise<void> {
  await aiNotificationService.notifyAutomationComplete("scheduling", workspaceId, details);
}

export async function notifyPayrollProcessed(
  workspaceId: string,
  details: { employeesProcessed: number; totalAmount: number }
): Promise<void> {
  await aiNotificationService.notifyAutomationComplete("payroll", workspaceId, details);
}

export async function notifyInvoicesGenerated(
  workspaceId: string,
  details: { invoicesGenerated: number; totalValue: number }
): Promise<void> {
  await aiNotificationService.notifyAutomationComplete("invoicing", workspaceId, details);
}

export async function notifySecurityAlert(
  issue: string,
  recommendation: string,
  workspaceId?: string
): Promise<void> {
  await aiNotificationService.notifySystemIssue(issue, recommendation, workspaceId);
}

export const notificationInit = {
  initializeNotifications,
  pushSystemNotification,
  pushMaintenanceAlert,
  notifyScheduleGenerated,
  notifyPayrollProcessed,
  notifyInvoicesGenerated,
  notifySecurityAlert,
};

export default notificationInit;
