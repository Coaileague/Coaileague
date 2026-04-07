import { db } from '../db';
import { invoices, subscriptionInvoices } from '@shared/schema';
import { eq, desc, sql } from 'drizzle-orm';
import { FEATURES } from '@shared/platformConfig';

export type TrinityInvoiceType = 'client' | 'subscription' | 'payroll' | 'timesheet';

async function getNextSequenceAtomic(workspaceId: string, invoiceType: TrinityInvoiceType): Promise<number> {
  const prefix = FEATURES.trinityInvoicePrefix;
  const typeCode = FEATURES.trinityInvoiceTypes[invoiceType] || 'GEN';
  const pattern = `${prefix}-%-${typeCode}-%`;

  const lockKey = Buffer.from(`inv_seq_${workspaceId}_${invoiceType}`).reduce(
    (hash, byte) => ((hash << 5) - hash + byte) | 0, 0
  );

  const result = await db.transaction(async (tx) => {
    await tx.execute(sql`SELECT pg_advisory_xact_lock(${lockKey})`);

    const regularResult = await tx.select({ invoiceNumber: invoices.invoiceNumber })
      .from(invoices)
      .where(
        sql`${invoices.workspaceId} = ${workspaceId} AND ${invoices.invoiceNumber} LIKE ${pattern}`
      )
      .orderBy(desc(invoices.createdAt))
      .limit(1);

    const subResult = await tx.select({ invoiceNumber: subscriptionInvoices.invoiceNumber })
      .from(subscriptionInvoices)
      .where(
        sql`${subscriptionInvoices.workspaceId} = ${workspaceId} AND ${subscriptionInvoices.invoiceNumber} LIKE ${pattern}`
      )
      .orderBy(desc(subscriptionInvoices.createdAt))
      .limit(1);

    let maxSeq = 0;

    for (const row of [...regularResult, ...subResult]) {
      if (row?.invoiceNumber) {
        const match = row.invoiceNumber.match(/(\d+)$/);
        if (match) {
          const seq = parseInt(match[1]);
          if (seq > maxSeq) maxSeq = seq;
        }
      }
    }

    return maxSeq + 1;
  });

  return result;
}

export async function generateTrinityInvoiceNumber(
  workspaceId: string,
  invoiceType: TrinityInvoiceType,
  options?: { date?: Date }
): Promise<string> {
  const prefix = FEATURES.trinityInvoicePrefix;
  const typeCode = FEATURES.trinityInvoiceTypes[invoiceType] || 'GEN';
  const date = options?.date || new Date();
  const year = date.getFullYear();

  const seq = await getNextSequenceAtomic(workspaceId, invoiceType);
  return `${prefix}-${year}-${typeCode}-${seq.toString().padStart(4, '0')}`;
}
