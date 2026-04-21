/**
 * One-shot password reset script for production emergency access.
 *
 * Targets:
 *   1. Root admin (CoAIleague Support Group) — id: root-user-00000000
 *   2. Statewide tenant owner — found by role + workspace
 *
 * Usage:
 *   DATABASE_URL=<prod-url> npx tsx scripts/reset-passwords.ts
 *
 * Both accounts are set to TEMP_PASSWORD (below). Log in and change
 * the password immediately via Settings → Security.
 */

import { db } from '../server/db';
import { users, authSessions } from '../shared/schema';
import { eq, or, inArray } from 'drizzle-orm';
import bcrypt from 'bcryptjs';

const TEMP_PASSWORD = 'TempPass2026!';
const SALT_ROUNDS = 12;

const TARGET_IDS = [
  'root-user-00000000',          // root admin — CoAIleague Support Group
];

const TARGET_EMAILS = [
  'root@coaileague.local',       // root admin fallback email match
  'admin@statewide-test.example.com', // statewide dev/prod admin
];

async function run() {
  console.log('=== CoAIleague Password Reset Script ===\n');
  console.log(`Temporary password: ${TEMP_PASSWORD}\n`);
  console.log('Hashing password...');

  const hash = await bcrypt.hash(TEMP_PASSWORD, SALT_ROUNDS);

  // Find accounts by known ID and by email
  const byId = await db.select({ id: users.id, email: users.email, role: users.role })
    .from(users)
    .where(inArray(users.id, TARGET_IDS));

  const byEmail = await db.select({ id: users.id, email: users.email, role: users.role })
    .from(users)
    .where(inArray(users.email, TARGET_EMAILS));

  // Merge, deduplicate
  const seen = new Set<string>();
  const targets = [...byId, ...byEmail].filter(u => {
    if (seen.has(u.id)) return false;
    seen.add(u.id);
    return true;
  });

  if (targets.length === 0) {
    console.error('ERROR: No matching accounts found. Check TARGET_IDS / TARGET_EMAILS.');
    process.exit(1);
  }

  console.log(`Found ${targets.length} account(s) to reset:\n`);

  for (const u of targets) {
    console.log(`  • ${u.email} (id: ${u.id}, role: ${u.role})`);

    await db.update(users)
      .set({
        passwordHash: hash,
        loginAttempts: 0,
        lockedUntil: null,
        updatedAt: new Date(),
      })
      .where(eq(users.id, u.id));

    // Invalidate all active sessions so re-authentication is required
    try {
      const { authSessions: sessTable } = await import('../shared/schema');
      await db.update(sessTable)
        .set({ isValid: false })
        .where(eq(sessTable.userId, u.id));
    } catch {
      // authSessions table may not exist in all environments — non-fatal
    }

    console.log(`    ✅ Password reset`);
  }

  console.log('\n=== Done ===');
  console.log(`Temporary password: ${TEMP_PASSWORD}`);
  console.log('Log in and change your password immediately via Settings → Security.\n');

  process.exit(0);
}

run().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
