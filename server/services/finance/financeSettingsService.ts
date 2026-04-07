import { db } from "../../db";
import { eq } from "drizzle-orm";
import { orgFinanceSettings, type OrgFinanceSettings } from "@shared/schema";

export async function getOrCreateSettings(workspaceId: string): Promise<OrgFinanceSettings> {
  let [settings] = await db.select().from(orgFinanceSettings)
    .where(eq(orgFinanceSettings.workspaceId, workspaceId));

  if (!settings) {
    [settings] = await db.insert(orgFinanceSettings).values({
      workspaceId,
    }).returning();
  }

  return settings;
}

export async function isQuickbooksEnabled(workspaceId: string): Promise<boolean> {
  const settings = await getOrCreateSettings(workspaceId);
  if (!settings.quickbooksSyncEnabled) return false;
  return settings.accountingMode === "quickbooks" || settings.accountingMode === "hybrid";
}

export async function getPayrollProvider(workspaceId: string): Promise<string> {
  const settings = await getOrCreateSettings(workspaceId);
  return settings.payrollProvider || "internal";
}

export async function getAccountingMode(workspaceId: string): Promise<string> {
  const settings = await getOrCreateSettings(workspaceId);
  return settings.accountingMode || "native";
}
