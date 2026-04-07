import { db, pool } from '../db';
import { SQL } from 'drizzle-orm';

export async function typedQuery<T = Record<string, unknown>>(query: SQL): Promise<T[]> {
  const result = await db.execute(query);
  return (result as any).rows as T[];
}

export async function typedPool<T = Record<string, unknown>>(text: string, params?: unknown[]): Promise<{ rows: T[] }> {
  const result = await pool.query(text, params);
  return { rows: result.rows as T[] };
}

export async function typedPoolExec(text: string, params?: unknown[]): Promise<{ rowCount: number }> {
  const result = await pool.query(text, params);
  return { rowCount: result.rowCount ?? 0 };
}

// CATEGORY C — Raw SQL retained: typedClient wrapper forwards raw SQL from transaction callers | Tables: dynamic | Verified: 2026-03-23
export function typedClient(client: { query: (text: string, params?: unknown[]) => Promise<any> }) {
  return {
    async query<T = Record<string, unknown>>(text: string, params?: unknown[]): Promise<T[]> {
      const result = await client.query(text, params);
      return result.rows as T[];
    },
    async exec(text: string, params?: unknown[]): Promise<{ rowCount: number }> {
      const result = await client.query(text, params);
      return { rowCount: result.rowCount ?? 0 };
    },
    raw: client,
  };
}

export async function typedQueryOne<T = Record<string, unknown>>(query: SQL): Promise<T | null> {
  const rows = await typedQuery<T>(query);
  return rows[0] || null;
}

export async function typedCount(query: SQL): Promise<number> {
  const result = await db.execute(query);
  const row = (result as any).rows[0];
  return parseInt(row?.count ?? row?.total ?? '0', 10);
}

export async function typedExists(query: SQL): Promise<boolean> {
  const result = await db.execute(query);
  return (result as any).rows[0]?.exists === true;
}

export async function typedScalar<T = string>(query: SQL): Promise<T | null> {
  const result = await db.execute(query);
  const row = (result as any).rows[0];
  if (!row) return null;
  const keys = Object.keys(row);
  return keys.length > 0 ? row[keys[0]] as T : null;
}

export async function typedExec(query: SQL): Promise<{ rowCount: number }> {
  const result = await db.execute(query);
  return { rowCount: (result as any).rowCount ?? 0 };
}
