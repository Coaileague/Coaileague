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
    for (const update of INITIAL_UPDATES) {
      const existing = await db.select({ id: platformUpdates.id })
        .from(platformUpdates)
        .where(eq(platformUpdates.id, update.id))
        .limit(1);
      
      if (existing.length === 0) {
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
    }
    
    console.log("[NotificationInit] Initial updates seeded successfully");
  } catch (error) {
    console.error("[NotificationInit] Failed to seed updates:", error);
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
