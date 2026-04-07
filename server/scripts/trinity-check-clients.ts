import { db } from '../db';
import { clients } from '@shared/schema';
import { eq } from 'drizzle-orm';

async function check() {
  const allClients = await db.select().from(clients).where(eq(clients.workspaceId, 'dev-acme-security-ws'));

  console.log(`Total clients: ${allClients.length}\n`);
  const byIndustry = new Map<string, number>();
  for (const c of allClients) {
    const ind = (c as any).industry || 'Unknown';
    byIndustry.set(ind, (byIndustry.get(ind) || 0) + 1);
    console.log(`  ${c.companyName} (${ind})`);
  }
  console.log('\nBy industry:');
  for (const [k, v] of [...byIndustry.entries()].sort((a, b) => b[1] - a[1])) {
    console.log(`  ${k}: ${v}`);
  }
}
check().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1); });
