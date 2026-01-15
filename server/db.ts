// Reference: javascript_database blueprint
import { Pool, neonConfig } from '@neondatabase/serverless';
import { drizzle } from 'drizzle-orm/neon-serverless';
import ws from "ws";
import * as schema from "@shared/schema";

neonConfig.webSocketConstructor = ws;

const databaseUrl = process.env.DATABASE_URL;

if (!databaseUrl) {
  throw new Error(
    "DATABASE_URL must be set. Did you forget to provision a database?",
  );
}

// Database driver info
console.log('📊 Database: Using Neon serverless driver');
console.log('   Compatible with: Neon databases only');
console.log('   Deployment: Works on Replit, Render, Vercel, etc.');

// Warn if DATABASE_URL doesn't look like a Neon connection
if (databaseUrl && !databaseUrl.includes('neon.tech') && !databaseUrl.includes('localhost')) {
  console.warn('⚠️  DATABASE_URL does not appear to be a Neon database');
  console.warn('   Neon serverless driver only works with Neon databases');
  console.warn('   If using Render Postgres, switch to pg + drizzle-orm/node-postgres');
}

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
