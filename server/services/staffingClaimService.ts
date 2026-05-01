/**
 * STAFFING CLAIM SERVICE
 * ======================
 * Cross-tenant atomic claim lock for multi-provider staffing race conditions.
 *
 * When the same client emails multiple CoAIleague security companies:
 * 1. Each company registers interest in the claim token.
 * 2. First company whose Trinity gets officer acceptance claims the token.
 * 3. All other orgs are notified via friendly "no longer available" email.
 *
 * Claim key = SHA-256 hash of (normalizedClientEmail + locationSlug + shiftDateStr)
 */

import crypto from 'crypto';
import { db } from '../db';
import { staffingClaimTokens, workspaces } from '@shared/schema';
import { eq, and, ne, sql } from 'drizzle-orm';
import { emailService } from './emailService';

export interface ClaimRegistration {
  workspaceId: string;
  workspaceName: string;
  staffingEmail: string;
  registeredAt: string;
}

export interface ClaimAttemptResult {
  success: boolean;
  alreadyClaimed: boolean;
  claimedByWorkspaceId?: string;
  claimedByWorkspaceName?: string;
  claimKey: string;
}

class StaffingClaimService {
  /**
   * Build a stable claim key from client email + location + date.
   * Normalizes inputs so minor formatting differences don't create separate tokens.
   */
  buildClaimKey(clientEmail: string, location: string, shiftDate: string): string {
    const normalEmail = clientEmail.toLowerCase().trim();
    const normalLocation = location
      .toLowerCase()
      .replace(/[^a-z0-9]/g, '')
      .slice(0, 64);
    const normalDate = shiftDate.replace(/[^0-9\-]/g, '').slice(0, 10);
    const raw = `${normalEmail}|${normalLocation}|${normalDate}`;
    return crypto.createHash('sha256').update(raw).digest('hex').slice(0, 64);
  }

  /**
   * Register an org's interest in a staffing job token.
   * Creates the token if it doesn't exist (open state).
   * If already claimed by another org, returns that info.
   */
  async registerInterest(params: {
    workspaceId: string;
    workspaceName: string;
    staffingEmail: string;
    clientEmail: string;
    location: string;
    shiftDate: string;
    shiftDescription?: string;
  }): Promise<{ claimKey: string; alreadyClaimed: boolean; claimedBy?: string }> {
    const claimKey = this.buildClaimKey(params.clientEmail, params.location, params.shiftDate);
    const locationHash = crypto.createHash('sha256').update(params.location.toLowerCase()).digest('hex').slice(0, 64);

    const newCompetitor: ClaimRegistration = {
      workspaceId: params.workspaceId,
      workspaceName: params.workspaceName,
      staffingEmail: params.staffingEmail,
      registeredAt: new Date().toISOString(),
    };

    try {
      // Converted to Drizzle ORM: CASE WHEN → sql fragment
      await db.insert(staffingClaimTokens).values({
        claimKey,
        clientEmail: params.clientEmail.toLowerCase().trim(),
        locationHash,
        shiftDate: params.shiftDate,
        shiftDescription: params.shiftDescription || null,
        status: 'open',
        competingWorkspaces: [newCompetitor],
        expiresAt: sql`now() + interval '48 hours'`
      }).onConflictDoUpdate({
        target: staffingClaimTokens.claimKey,
        set: {
          competingWorkspaces: sql`
            case
              when ${staffingClaimTokens.competingWorkspaces} @> ${JSON.stringify([{ workspaceId: params.workspaceId }])}::jsonb
              then ${staffingClaimTokens.competingWorkspaces}
              else ${staffingClaimTokens.competingWorkspaces} || ${JSON.stringify([newCompetitor])}::jsonb
            end
          `
        }
      });

      const [token] = await db.select()
        .from(staffingClaimTokens)
        .where(eq(staffingClaimTokens.claimKey, claimKey))
        .limit(1);

      if (token?.status === 'claimed' && token.claimedByWorkspaceId !== params.workspaceId) {
        return {
          claimKey,
          alreadyClaimed: true,
          claimedBy: token.claimedByWorkspaceName || token.claimedByWorkspaceId || undefined,
        };
      }

      return { claimKey, alreadyClaimed: false };
    } catch (err: unknown) {
      log.error('[StaffingClaim] registerInterest error:', (err instanceof Error ? err.message : String(err)));
      return { claimKey, alreadyClaimed: false };
    }
  }

  /**
   * Atomic claim attempt — called when an org's officer accepts a shift.
   * Uses a WHERE status='open' guard so only one org can win.
   * Returns success=true if this org won, false if another org already claimed.
   */
  async attemptClaim(params: {
    workspaceId: string;
    workspaceName: string;
    staffingEmail: string;
    claimKey: string;
  }): Promise<ClaimAttemptResult> {
    try {
      const rows = await db
        .update(staffingClaimTokens)
        .set({
          status: 'claimed',
          claimedByWorkspaceId: params.workspaceId,
          claimedByWorkspaceName: params.workspaceName,
          claimedByEmail: params.staffingEmail,
          claimedAt: sql`now()`,
        })
        .where(
          and(
            eq(staffingClaimTokens.claimKey, params.claimKey),
            eq(staffingClaimTokens.status, 'open'),
          )
        )
        .returning({
          id: staffingClaimTokens.id,
          competingWorkspaces: staffingClaimTokens.competingWorkspaces,
        });

      if (rows.length > 0) {
        log.info(`[StaffingClaim] ✅ Claim WON by ${params.workspaceName} (${params.workspaceId}) for key ${params.claimKey}`);
        return {
          success: true,
          alreadyClaimed: false,
          claimedByWorkspaceId: params.workspaceId,
          claimedByWorkspaceName: params.workspaceName,
          claimKey: params.claimKey,
        };
      }

      // Another org already claimed it — find out who
      const [existing] = await db.select()
        .from(staffingClaimTokens)
        .where(eq(staffingClaimTokens.claimKey, params.claimKey))
        .limit(1);

      log.info(`[StaffingClaim] ❌ Claim LOST by ${params.workspaceName} — already claimed by ${existing?.claimedByWorkspaceName}`);

      return {
        success: false,
        alreadyClaimed: true,
        claimedByWorkspaceId: existing?.claimedByWorkspaceId || undefined,
        claimedByWorkspaceName: existing?.claimedByWorkspaceName || undefined,
        claimKey: params.claimKey,
      };
    } catch (err: unknown) {
      log.error('[StaffingClaim] attemptClaim error:', (err instanceof Error ? err.message : String(err)));
      // On error, allow the org to proceed (fail open to not block staffing)
      return { success: true, alreadyClaimed: false, claimKey: params.claimKey };
    }
  }

  /**
   * After a claim is won, send friendly drop notifications to all losing orgs.
   * Each losing org receives a professional email explaining the assignment
   * has been fulfilled — no mention of which company won.
   */
  async sendDropNotifications(params: {
    claimKey: string;
    winnerWorkspaceId: string;
    clientEmail: string;
    clientName?: string;
    shiftDescription?: string;
    referenceNumber?: string;
  }): Promise<void> {
    try {
      const [token] = await db.select()
        .from(staffingClaimTokens)
        .where(eq(staffingClaimTokens.claimKey, params.claimKey))
        .limit(1);

      if (!token || token.dropNotificationsSent) return;

      const competitors = (token.competingWorkspaces as ClaimRegistration[]) || [];
      const losers = competitors.filter(c => c.workspaceId !== params.winnerWorkspaceId);

      for (const loser of losers) {
        try {
          // Get the workspace staffing email to send FROM
          const [ws] = await db.select({ staffingEmail: workspaces.staffingEmail, name: workspaces.name })
            .from(workspaces)
            .where(eq(workspaces.id, loser.workspaceId))
            .limit(1);

          await emailService.sendStaffingRequestDropped({ // email-tracked
            workspaceId: loser.workspaceId,
            workspaceName: ws?.name || loser.workspaceName,
            clientEmail: params.clientEmail,
            clientName: params.clientName,
            shiftDescription: params.shiftDescription || token.shiftDescription || undefined,
            referenceNumber: params.referenceNumber,
          });

          log.info(`[StaffingClaim] Drop notification sent to ${params.clientEmail} on behalf of ${loser.workspaceName}`);
        } catch (err: unknown) {
          log.error(`[StaffingClaim] Failed to send drop to loser ${loser.workspaceId}:`, (err instanceof Error ? err.message : String(err)));
        }
      }

      // Mark drop notifications as sent
      await db.update(staffingClaimTokens)
        .set({ dropNotificationsSent: true })
        .where(eq(staffingClaimTokens.claimKey, params.claimKey));
    } catch (err: unknown) {
      log.error('[StaffingClaim] sendDropNotifications error:', (err instanceof Error ? err.message : String(err)));
    }
  }

  /**
   * When an org loses the race (their officer acceptance came too late),
   * cancel their staged shift and send a friendly internal notice.
   */
  async handleLoss(params: {
    workspaceId: string;
    workspaceName: string;
    clientEmail: string;
    referenceNumber?: string;
  }): Promise<void> {
    log.info(`[StaffingClaim] Handling loss for workspace ${params.workspaceId} — client ${params.clientEmail}`);
    try {
      await emailService.sendStaffingRequestDropped({ // email-tracked
        workspaceId: params.workspaceId,
        workspaceName: params.workspaceName,
        clientEmail: params.clientEmail,
        referenceNumber: params.referenceNumber,
      });
    } catch (err: unknown) {
      log.error('[StaffingClaim] handleLoss error:', (err instanceof Error ? err.message : String(err)));
    }
  }

  /**
   * Look up whether a claim token exists and its current status.
   */
  async getClaimStatus(claimKey: string): Promise<StaffingClaimToken | null> {
    try {
      const [token] = await db.select()
        .from(staffingClaimTokens)
        .where(eq(staffingClaimTokens.claimKey, claimKey))
        .limit(1);
      return token || null;
    } catch {
      return null;
    }
  }
}

export const staffingClaimService = new StaffingClaimService();

// Re-export the type for use in other files
import type { StaffingClaimToken } from '@shared/schema';
import { typedExec } from '../lib/typedSql';
import { createLogger } from '../lib/logger';
const log = createLogger('staffingClaimService');

