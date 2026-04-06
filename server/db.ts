// Standard pg driver - compatible with Railway PostgreSQL and any standard Postgres
import { Pool } from 'pg';
import { drizzle } from 'drizzle-orm/node-postgres';
import * as schema from "@shared/schema";

const databaseUrl = process.env.DATABASE_URL;

if (!databaseUrl) {
  throw new Error(
    "DATABASE_URL must be set. Did you forget to provision a database?",
  );
}

// Database driver info
console.log('📊 Database: Using standard pg driver (node-postgres)');
console.log('   Compatible with: Railway PostgreSQL, Render, Supabase, and any standard Postgres');

export const pool = new Pool({ 
  connectionString: databaseUrl,
  max: 1, // Ultra-minimal: single connection to prevent "too many connections" during deploy
  idleTimeoutMillis: 5000, // Release idle connections faster (5s)
  connectionTimeoutMillis: 5000, // Timeout for getting a connection
  allowExitOnIdle: true // Allow pool to close when idle (helps with publishing)
});
export const db = drizzle({ client: pool, schema });

// Graceful shutdown - release all connections
process.on('SIGTERM', async () => {
  console.log('[Database] SIGTERM received, closing pool...');
  try {
    await pool.end();
    console.log('[Database] Pool closed gracefully');
  } catch (err) {
    console.error('[Database] Error closing pool:', err);
  }
});

process.on('SIGINT', async () => {
  console.log('[Database] SIGINT received, closing pool...');
  try {
    await pool.end();
    console.log('[Database] Pool closed gracefully');
  } catch (err) {
    console.error('[Database] Error closing pool:', err);
  }
});

// Health check function - with connection release
export async function checkDatabaseHealth(): Promise<boolean> {
  let client;
  try {
    client = await pool.connect();
    await client.query('SELECT 1');
    return true;
  } catch (error) {
    console.error('Database health check failed:', error);
    return false;
  } finally {
    if (client) client.release();
  }
}
