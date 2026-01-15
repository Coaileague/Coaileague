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
  max: 5, // Limit connections for stability during publishing
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 5000
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
