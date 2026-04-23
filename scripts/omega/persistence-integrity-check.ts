#!/usr/bin/env tsx
import { db } from '../../server/db';
import { sql, eq } from 'drizzle-orm';
import { workspaces, clients, clientBillingSettings } from '../../shared/schema';

async function main() {
  const workspaceRows = await db.select({ id: workspaces.id, subscriptionTier: workspaces.subscriptionTier }).from(workspaces).limit(2);
  if (workspaceRows.length < 1) {
    throw new Error('No workspaces found');
  }

  const workspaceA = process.env.WORKSPACE_ID_A || workspaceRows[0].id;
  const workspaceB = process.env.WORKSPACE_ID_B || workspaceRows[1]?.id || workspaceRows[0].id;

  // 1) Isolation check: ensure workspace A query does not leak workspace B records.
  const workspaceBClientIds = await db
    .select({ id: clients.id })
    .from(clients)
    .where(eq(clients.workspaceId, workspaceB))
    .limit(200);
  if (workspaceBClientIds.length === 0) {
    console.log(`ℹ️ Workspace ${workspaceB} has no clients; isolation leak check uses empty comparison set.`);
  }
  const leaked = workspaceBClientIds.length === 0 ? [] : await db
    .select({ id: clients.id })
    .from(clients)
    .where(sql`${clients.workspaceId} = ${workspaceA} AND ${clients.id} IN (${sql.join(workspaceBClientIds.map((c) => sql`${c.id}`), sql`,`)})`);
  if (leaked.length > 0) {
    throw new Error(`Isolation failure: workspace ${workspaceA} can see ${leaked.length} client(s) from ${workspaceB}`);
  }
  console.log(`✅ Isolation check passed (${workspaceA} vs ${workspaceB})`);

  // 2) Persistence check: subscription tier updates must not reset invoice taxRate.
  const [invoiceSettingsBefore] = await db
    .select({ id: clientBillingSettings.id, taxRate: clientBillingSettings.taxRate })
    .from(clientBillingSettings)
    .where(eq(clientBillingSettings.workspaceId, workspaceA))
    .limit(1);
  if (!invoiceSettingsBefore) {
    console.log(`ℹ️ Skipped tax-rate persistence check: no invoice settings in workspace ${workspaceA}`);
  } else {
    const [workspaceBefore] = await db
      .select({ subscriptionTier: workspaces.subscriptionTier })
      .from(workspaces)
      .where(eq(workspaces.id, workspaceA))
      .limit(1);

    await db
      .update(workspaces)
      .set({ subscriptionTier: workspaceBefore?.subscriptionTier || 'free', updatedAt: new Date() } as any)
      .where(eq(workspaces.id, workspaceA));

    const [invoiceSettingsAfter] = await db
      .select({ taxRate: clientBillingSettings.taxRate })
      .from(clientBillingSettings)
      .where(eq(clientBillingSettings.id, invoiceSettingsBefore.id))
      .limit(1);

    if ((invoiceSettingsAfter?.taxRate ?? null) !== (invoiceSettingsBefore.taxRate ?? null)) {
      throw new Error(`Persistence failure: taxRate changed from ${invoiceSettingsBefore.taxRate} to ${invoiceSettingsAfter?.taxRate}`);
    }
    console.log('✅ Persistence check passed (subscriptionTier update preserved invoice taxRate)');
  }

  // 3) Schema check: decimal storage for financial columns.
  const schemaTypes = await db.execute(sql`
    SELECT table_name, column_name, data_type, numeric_precision, numeric_scale
    FROM information_schema.columns
    WHERE (table_name = 'clients' AND column_name = 'billable_hourly_rate')
       OR (table_name = 'client_billing_settings' AND column_name = 'tax_rate')
  `) as any;
  const rows: Array<any> = schemaTypes.rows || schemaTypes;
  const nonNumeric = rows.filter((r) => r.data_type !== 'numeric' && r.data_type !== 'decimal');
  if (nonNumeric.length > 0) {
    throw new Error(`Schema check failure: expected decimal/numeric columns, got ${JSON.stringify(nonNumeric)}`);
  }
  console.log('✅ Schema check passed (billable_hourly_rate, tax_rate are decimal/numeric)');
}

main().catch((error) => {
  console.error('❌ Persistence integrity check failed:', error);
  process.exit(1);
});
