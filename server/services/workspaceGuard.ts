import { db } from "../db";
import { eq } from "drizzle-orm";
import { workspaces } from '@shared/schema';
import { createLogger } from '../lib/logger';
const log = createLogger('workspaceGuard');


export type WorkspaceType = 'sandbox' | 'production' | 'platform';

const WORKSPACE_TYPE_CACHE = new Map<string, { type: WorkspaceType; name: string; cachedAt: number }>();
const CACHE_TTL_MS = 60_000;

async function getWorkspaceType(workspaceId: string): Promise<{ type: WorkspaceType; name: string }> {
  const cached = WORKSPACE_TYPE_CACHE.get(workspaceId);
  if (cached && Date.now() - cached.cachedAt < CACHE_TTL_MS) {
    return { type: cached.type, name: cached.name };
  }

  const result = await db.select({ workspaceType: workspaces.workspaceType, name: workspaces.name })
    .from(workspaces)
    .where(eq(workspaces.id, workspaceId))
    .limit(1);

  if (result.length === 0) {
    throw new Error(`[WorkspaceGuard] Workspace "${workspaceId}" not found.`);
  }

  const row = result[0];
  const wsType = (row.workspaceType || 'sandbox') as WorkspaceType;
  const wsName = row.name || workspaceId;

  WORKSPACE_TYPE_CACHE.set(workspaceId, { type: wsType, name: wsName, cachedAt: Date.now() });
  return { type: wsType, name: wsName };
}

export async function guardAgainstProduction(workspaceId: string, operation: string): Promise<void> {
  const { type, name } = await getWorkspaceType(workspaceId);

  if (type === 'production') {
    const msg = `[BLOCKED] Cannot run "${operation}" on production workspace "${name}" (${workspaceId}). This workspace contains real business data. Use a sandbox workspace instead.`;
    log.error(msg);
    throw new Error(msg);
  }

  if (type === 'platform') {
    const msg = `[BLOCKED] Cannot run "${operation}" on platform workspace "${name}" (${workspaceId}). This is a persistent system workspace that must never be reset.`;
    log.error(msg);
    throw new Error(msg);
  }

  log.info(`[WorkspaceGuard] Workspace "${name}" is ${type} — "${operation}" permitted.`);
}

export async function isProductionWorkspace(workspaceId: string): Promise<boolean> {
  const { type } = await getWorkspaceType(workspaceId);
  return type === 'production';
}

export async function isSandboxWorkspace(workspaceId: string): Promise<boolean> {
  const { type } = await getWorkspaceType(workspaceId);
  return type === 'sandbox';
}

export function setDefaultWorkspaceType(): string {
  return 'production';
}

export function clearWorkspaceTypeCache(): void {
  WORKSPACE_TYPE_CACHE.clear();
}
