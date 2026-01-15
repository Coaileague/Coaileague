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
  max: 2, // Minimal connections for Neon free tier (only allows ~5 total)
  idleTimeoutMillis: 10000, // Release idle connections after 10s
  connectionTimeoutMillis: 3000, // Fail fast on connection issues
  allowExitOnIdle: true // Allow pool to close when idle (helps with publishing)
});
export const db = drizzle({ client: pool, schema });

// Health check function
export async function checkDatabaseHealth(): Promise<boolean> {
  try {
    await pool.query('SELECT 1');
    return true;
  } catch (error) {
    console.error('Database health check failed:', error);
    return false;
  }
}
