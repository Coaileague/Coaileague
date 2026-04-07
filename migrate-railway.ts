/**
 * One-shot Railway migration runner — applies all SQL files in /migrations
 * to the Railway Postgres instance specified by DATABASE_URL.
 *
 * NOTE: This is a manual / debugging utility. The normal production flow runs
 * `drizzle-kit push --config=drizzle.config.ts` from the start script (see
 * package.json), which is more capable than raw SQL migrations because it
 * diffs shared/schema.ts against the live DB and applies the delta.
 *
 * Usage:
 *   DATABASE_URL='postgresql://...' npx tsx migrate-railway.ts
 *
 * SECURITY: Never hardcode the connection string. Always pass it via env.
 */
import pg from 'pg';
import { readFileSync } from 'fs';
import { readdirSync } from 'fs';
import path from 'path';

const DB_URL = process.env.DATABASE_URL;
if (!DB_URL) {
  console.error('❌ DATABASE_URL environment variable is required');
  console.error('   Usage: DATABASE_URL="postgresql://..." npx tsx migrate-railway.ts');
  process.exit(1);
}

(async () => {
  const client = new pg.Client(DB_URL);
  await client.connect();
  console.log('Connected to Railway DB');
  
  // Get all migration files
  const migrationsDir = path.join(process.cwd(), 'migrations');
  const files = readdirSync(migrationsDir)
    .filter(f => f.endsWith('.sql'))
    .sort();
  
  console.log(`Found ${files.length} migration files`);
  
  for (const file of files) {
    console.log(`Running: ${file}`);
    const sql = readFileSync(path.join(migrationsDir, file), 'utf8');
    try {
      await client.query(sql);
      console.log(`✓ ${file}`);
    } catch (e: any) {
      if (e.code === '42P07' || e.code === '42710') {
        console.log(`⚠ ${file} - already exists, skipping`);
      } else {
        console.error(`✗ ${file}: ${e.message}`);
      }
    }
  }
  
  await client.end();
  console.log('Migration complete!');
})();
