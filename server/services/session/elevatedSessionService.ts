/**
 * Elevated Session Service
 * 
 * Provides cryptographically-signed session elevation for support roles
 * and AI services (Trinity, HelpAI, subagents, bots) to bypass repeated
 * auth checks during automated workflows.
 * 
 * IMPORTANT: Regular org users do NOT get elevated sessions.
 * Their access is controlled by RBAC and subscription tier.
 */

import { createHmac, randomBytes, timingSafeEqual } from 'crypto';
import { db } from '../../db';
import { supportSessionElevations, platformRoles } from '@shared/schema';
import { eq, and, gt, lt } from 'drizzle-orm';
import type { Request } from 'express';
import { createLogger } from '../../lib/logger';
const log = createLogger('elevatedSessionService');


// FIX: Removed insecure hardcoded fallback key. The startup validator in
// server/index.ts already enforces SESSION_SECRET presence before this module
// is loaded, so undefined here is a fatal misconfiguration — surface it clearly.
if (!process.env.SESSION_SECRET) {
  throw new Error('[ElevatedSession] FATAL: SESSION_SECRET env var is required. Server must not start without it.');
}
const SESSION_SECRET = process.env.SESSION_SECRET;
const SIGNATURE_VERSION = 1;

const IDLE_TIMEOUT_MS = 4 * 60 * 60 * 1000; // 4 hours idle timeout
const ABSOLUTE_TIMEOUT_MS = 12 * 60 * 60 * 1000; // 12 hours max session

type ElevationReason = 'auto_support_login' | 'governance_approved' | 'mfa_verified' | 'bot_service' | 'subagent_service' | 'trinity_service' | 'helpai_service';

const SUPPORT_ROLES = ['root_admin', 'deputy_admin', 'sysop', 'support_manager', 'support_agent', 'compliance_officer'];
const AI_SERVICE_ROLES = ['Bot'];

export interface ElevatedSessionContext {
  isElevated: boolean;
  elevationId?: string;
  userId?: string;
  platformRole?: string;
  reason?: ElevationReason;
  expiresAt?: Date;
  actionsExecuted?: number;
}

export interface ElevationResult {
  success: boolean;
  elevationId?: string;
  expiresAt?: Date;
  error?: string;
}

function generateSignature(userId: string, sessionId: string, issuedAt: Date, expiresAt: Date): string {
  const payload = `${userId}:${sessionId}:${issuedAt.toISOString()}:${expiresAt.toISOString()}:v${SIGNATURE_VERSION}`;
  return createHmac('sha256', SESSION_SECRET).update(payload).digest('hex');
}

function verifySignature(stored: string, userId: string, sessionId: string, issuedAt: Date, expiresAt: Date): boolean {
  const expected = generateSignature(userId, sessionId, issuedAt, expiresAt);
  try {
    return timingSafeEqual(Buffer.from(stored), Buffer.from(expected));
  } catch {
    return false;
  }
}

export async function canReceiveElevation(userId: string): Promise<{ canElevate: boolean; role?: string; reason?: string }> {
  try {
    const platformRole = await db.select()
      .from(platformRoles)
      .where(eq(platformRoles.userId, userId))
      .limit(1);

    if (!platformRole.length) {
      return { canElevate: false, reason: 'No platform role assigned' };
    }

    const role = platformRole[0].role;
    
    if (SUPPORT_ROLES.includes(role)) {
      return { canElevate: true, role };
    }
    
    if (AI_SERVICE_ROLES.includes(role)) {
      return { canElevate: true, role };
    }

    return { canElevate: false, role, reason: 'Role not eligible for elevation' };
  } catch (error) {
    log.error('[ElevatedSession] Error checking elevation eligibility:', error);
    return { canElevate: false, reason: 'Error checking eligibility' };
  }
}

export async function issueElevation(
  userId: string,
  sessionId: string,
  reason: ElevationReason,
  issuedBy?: string,
  ipAddress?: string,
  userAgent?: string
): Promise<ElevationResult> {
  try {
    const eligibility = await canReceiveElevation(userId);
    if (!eligibility.canElevate) {
      return { success: false, error: eligibility.reason || 'Not eligible for elevation' };
    }

    await db.update(supportSessionElevations)
      .set({
        isActive: false,
        revokedAt: new Date(),
        revocationReason: 'new_elevation_issued'
      })
      .where(and(
        eq(supportSessionElevations.userId, userId),
        eq(supportSessionElevations.isActive, true)
      ));

    const issuedAt = new Date();
    const expiresAt = new Date(Date.now() + ABSOLUTE_TIMEOUT_MS);
    const signature = generateSignature(userId, sessionId, issuedAt, expiresAt);

    const [elevation] = await db.insert(supportSessionElevations)
      .values({
        userId,
        sessionId,
        signature,
        signatureVersion: SIGNATURE_VERSION,
        issuedAt,
        expiresAt,
        lastActivityAt: issuedAt,
        issuedBy: issuedBy || userId,
        platformRole: eligibility.role!,
        elevationReason: reason,
        isActive: true,
        actionsExecuted: 0,
        ipAddress,
        userAgent
      })
      .returning();

    log.info(`[ElevatedSession] Issued elevation for user ${userId} (${eligibility.role}), expires: ${expiresAt.toISOString()}`);

    return {
      success: true,
      elevationId: elevation.id,
      expiresAt
    };
  } catch (error) {
    log.error('[ElevatedSession] Error issuing elevation:', error);
    return { success: false, error: 'Failed to issue elevation' };
  }
}

export async function validateElevation(userId: string, sessionId: string): Promise<ElevatedSessionContext> {
  try {
    const now = new Date();
    const idleThreshold = new Date(Date.now() - IDLE_TIMEOUT_MS);

    const [elevation] = await db.select()
      .from(supportSessionElevations)
      .where(and(
        eq(supportSessionElevations.userId, userId),
        eq(supportSessionElevations.sessionId, sessionId),
        eq(supportSessionElevations.isActive, true),
        gt(supportSessionElevations.expiresAt, now),
        gt(supportSessionElevations.lastActivityAt, idleThreshold)
      ))
      .limit(1);

    if (!elevation) {
      return { isElevated: false };
    }

    const isValid = verifySignature(
      elevation.signature,
      userId,
      sessionId,
      elevation.issuedAt,
      elevation.expiresAt
    );

    if (!isValid) {
      log.warn(`[ElevatedSession] Invalid signature for elevation ${elevation.id}`);
      await revokeElevation(elevation.id, userId, 'invalid_signature');
      return { isElevated: false };
    }

    await db.update(supportSessionElevations)
      .set({
        lastActivityAt: now,
        actionsExecuted: (elevation.actionsExecuted || 0) + 1,
        lastActionAt: now
      })
      .where(eq(supportSessionElevations.id, elevation.id));

    return {
      isElevated: true,
      elevationId: elevation.id,
      userId: elevation.userId,
      platformRole: elevation.platformRole,
      reason: elevation.elevationReason as ElevationReason,
      expiresAt: elevation.expiresAt,
      actionsExecuted: (elevation.actionsExecuted || 0) + 1
    };
  } catch (error) {
    log.error('[ElevatedSession] Error validating elevation:', error);
    return { isElevated: false };
  }
}

export async function revokeElevation(
  elevationId: string,
  revokedBy: string,
  reason: string
): Promise<boolean> {
  try {
    await db.update(supportSessionElevations)
      .set({
        isActive: false,
        revokedAt: new Date(),
        revokedBy,
        revocationReason: reason
      })
      .where(eq(supportSessionElevations.id, elevationId));

    log.info(`[ElevatedSession] Revoked elevation ${elevationId}: ${reason}`);
    return true;
  } catch (error) {
    log.error('[ElevatedSession] Error revoking elevation:', error);
    return false;
  }
}

export async function revokeAllUserElevations(userId: string, reason: string): Promise<number> {
  try {
    const result = await db.update(supportSessionElevations)
      .set({
        isActive: false,
        revokedAt: new Date(),
        revokedBy: userId,
        revocationReason: reason
      })
      .where(and(
        eq(supportSessionElevations.userId, userId),
        eq(supportSessionElevations.isActive, true)
      ))
      .returning();

    log.info(`[ElevatedSession] Revoked ${result.length} elevations for user ${userId}: ${reason}`);
    return result.length;
  } catch (error) {
    log.error('[ElevatedSession] Error revoking user elevations:', error);
    return 0;
  }
}

export async function cleanupExpiredElevations(): Promise<number> {
  try {
    const now = new Date();
    const idleThreshold = new Date(Date.now() - IDLE_TIMEOUT_MS);

    const result = await db.update(supportSessionElevations)
      .set({
        isActive: false,
        revokedAt: now,
        revocationReason: 'expired'
      })
      .where(and(
        eq(supportSessionElevations.isActive, true),
        lt(supportSessionElevations.expiresAt, now)
      ))
      .returning();

    const idleResult = await db.update(supportSessionElevations)
      .set({
        isActive: false,
        revokedAt: now,
        revocationReason: 'idle_timeout'
      })
      .where(and(
        eq(supportSessionElevations.isActive, true),
        lt(supportSessionElevations.lastActivityAt, idleThreshold)
      ))
      .returning();

    const total = result.length + idleResult.length;
    if (total > 0) {
      log.info(`[ElevatedSession] Cleaned up ${total} expired/idle elevations`);
    }
    return total;
  } catch (error) {
    log.error('[ElevatedSession] Error cleaning up elevations:', error);
    return 0;
  }
}

export async function isElevatedSupportSession(req: Request): Promise<ElevatedSessionContext> {
  const userId = req.user?.id || (req as any).session?.userId;
  const sessionId = req.sessionID;

  if (!userId || !sessionId) {
    return { isElevated: false };
  }

  return validateElevation(userId, sessionId);
}

export async function getActiveElevation(userId: string): Promise<ElevatedSessionContext | null> {
  try {
    const now = new Date();
    const idleThreshold = new Date(Date.now() - IDLE_TIMEOUT_MS);

    const [elevation] = await db.select()
      .from(supportSessionElevations)
      .where(and(
        eq(supportSessionElevations.userId, userId),
        eq(supportSessionElevations.isActive, true),
        gt(supportSessionElevations.expiresAt, now),
        gt(supportSessionElevations.lastActivityAt, idleThreshold)
      ))
      .limit(1);

    if (!elevation) {
      return null;
    }

    return {
      isElevated: true,
      elevationId: elevation.id,
      userId: elevation.userId,
      platformRole: elevation.platformRole,
      reason: elevation.elevationReason as ElevationReason,
      expiresAt: elevation.expiresAt,
      actionsExecuted: elevation.actionsExecuted || 0
    };
  } catch (error) {
    log.error('[ElevatedSession] Error getting active elevation:', error);
    return null;
  }
}

export async function issueAIServiceElevation(
  serviceType: 'trinity' | 'helpai' | 'subagent' | 'bot',
  serviceUserId: string,
  workflowId?: string
): Promise<ElevationResult> {
  const reasonMap: Record<string, ElevationReason> = {
    trinity: 'trinity_service',
    helpai: 'helpai_service',
    subagent: 'subagent_service',
    bot: 'bot_service'
  };

  const syntheticSessionId = `ai-service-${serviceType}-${workflowId || randomBytes(8).toString('hex')}`;
  
  return issueElevation(
    serviceUserId,
    syntheticSessionId,
    reasonMap[serviceType],
    serviceUserId,
    'internal',
    `AI-Service-${serviceType}`
  );
}

export const elevatedSessionService = {
  canReceiveElevation,
  issueElevation,
  validateElevation,
  revokeElevation,
  revokeAllUserElevations,
  cleanupExpiredElevations,
  isElevatedSupportSession,
  getActiveElevation,
  issueAIServiceElevation,
  
  SUPPORT_ROLES,
  AI_SERVICE_ROLES,
  IDLE_TIMEOUT_MS,
  ABSOLUTE_TIMEOUT_MS
};

export default elevatedSessionService;
