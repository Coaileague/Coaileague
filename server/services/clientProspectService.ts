/**
 * CLIENT PROSPECT SERVICE
 * =======================
 * Manages temporary client access with org code routing.
 * 
 * Flow:
 * 1. Client sends staffing request email
 * 2. System generates temp code: {ORG_CODE}-TEMP-{RANDOM}
 * 3. Client receives temp code in status emails
 * 4. Client can view status with temp access
 * 5. When client signs up, they convert to full client with proper org routing
 */

import { db } from '../db';
import { clientProspects, workspaces, type InsertClientProspect } from '@shared/schema';
import { eq, and, sql } from 'drizzle-orm';
import { getAppBaseUrl } from '../utils/getAppBaseUrl';
import { createLogger } from '../lib/logger';
const log = createLogger('clientProspectService');


class ClientProspectService {
  private static instance: ClientProspectService;
  
  private constructor() {}
  
  static getInstance(): ClientProspectService {
    if (!ClientProspectService.instance) {
      ClientProspectService.instance = new ClientProspectService();
    }
    return ClientProspectService.instance;
  }
  
  /**
   * Generate a unique temp code for a client prospect
   * Format: {ORG_CODE}-TEMP-{4-char random}
   */
  generateTempCode(orgCode: string): string {
    const random = crypto.randomUUID().slice(0, 4).toUpperCase();
    return `${orgCode.toUpperCase()}-TEMP-${random}`;
  }
  
  /**
   * Get or create a client prospect from an inbound email
   */
  async getOrCreateFromEmail(params: {
    workspaceId: string;
    email: string;
    companyName?: string;
    contactName?: string;
    phone?: string;
    sourceEmailId?: string;
    referenceNumber?: string;
  }): Promise<{ prospect: typeof clientProspects.$inferSelect; isNew: boolean; tempCode: string }> {
    const normalizedEmail = params.email.toLowerCase().trim();
    
    // Check if prospect already exists for this workspace + email
    const [existing] = await db.select()
      .from(clientProspects)
      .where(and(
        eq(clientProspects.workspaceId, params.workspaceId),
        sql`LOWER(${clientProspects.email}) = ${normalizedEmail}`
      ))
      .limit(1);
    
    if (existing) {
      // Update activity tracking
      await db.update(clientProspects)
        .set({
          lastActivityAt: new Date(),
          totalRequests: sql`${clientProspects.totalRequests} + 1`,
          updatedAt: new Date(),
        })
        .where(eq(clientProspects.id, existing.id));
      
      return { prospect: existing, isNew: false, tempCode: existing.tempCode };
    }
    
    // Get the org code from the workspace
    const [workspace] = await db.select({ orgCode: workspaces.orgCode })
      .from(workspaces)
      .where(eq(workspaces.id, params.workspaceId))
      .limit(1);
    
    const orgCode = workspace?.orgCode || 'ORG';
    
    // Generate unique temp code
    let tempCode = this.generateTempCode(orgCode);
    let attempts = 0;
    while (attempts < 5) {
      try {
        const [newProspect] = await db.insert(clientProspects).values({
          workspaceId: params.workspaceId,
          tempCode,
          orgCode,
          email: normalizedEmail,
          companyName: params.companyName,
          contactName: params.contactName,
          phone: params.phone,
          sourceType: 'email',
          sourceEmailId: params.sourceEmailId,
          sourceReferenceNumber: params.referenceNumber,
          accessStatus: 'temp',
          accessExpiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // 30 days
          lastActivityAt: new Date(),
        }).returning();
        
        log.info(`[ClientProspect] Created new prospect: ${tempCode} for ${normalizedEmail}`);
        return { prospect: newProspect, isNew: true, tempCode };
      } catch (error: any) {
        if ((error instanceof Error ? error.message : String(error))?.includes('unique') || error.code === '23505') {
          // Temp code collision, regenerate
          tempCode = this.generateTempCode(orgCode);
          attempts++;
        } else {
          throw error;
        }
      }
    }
    
    throw new Error('Failed to generate unique temp code after 5 attempts');
  }
  
  /**
   * Look up a prospect by temp code
   */
  async getByTempCode(tempCode: string): Promise<typeof clientProspects.$inferSelect | null> {
    const [prospect] = await db.select()
      .from(clientProspects)
      .where(eq(clientProspects.tempCode, tempCode.toUpperCase()))
      .limit(1);
    
    if (prospect) {
      // Update activity
      await db.update(clientProspects)
        .set({ lastActivityAt: new Date() })
        .where(eq(clientProspects.id, prospect.id));
    }
    
    return prospect || null;
  }
  
  /**
   * Look up a prospect by email and workspace
   */
  async getByEmail(workspaceId: string, email: string): Promise<typeof clientProspects.$inferSelect | null> {
    const [prospect] = await db.select()
      .from(clientProspects)
      .where(and(
        eq(clientProspects.workspaceId, workspaceId),
        sql`LOWER(${clientProspects.email}) = ${email.toLowerCase().trim()}`
      ))
      .limit(1);
    
    return prospect || null;
  }
  
  /**
   * Mark onboarding link as sent
   */
  async markOnboardingLinkSent(prospectId: string): Promise<void> {
    await db.update(clientProspects)
      .set({
        onboardingLinkSent: true,
        onboardingLinkSentAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(clientProspects.id, prospectId));
  }
  
  /**
   * Mark onboarding link as clicked (user landed on signup page)
   */
  async markOnboardingLinkClicked(tempCode: string): Promise<void> {
    await db.update(clientProspects)
      .set({
        onboardingLinkClickedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(clientProspects.tempCode, tempCode.toUpperCase()));
  }
  
  /**
   * Convert a prospect to a full client
   */
  async convertToClient(params: {
    prospectId: string;
    clientId: string;
    userId: string;
  }): Promise<void> {
    await db.update(clientProspects)
      .set({
        accessStatus: 'converted',
        convertedToClientId: params.clientId,
        convertedAt: new Date(),
        convertedUserId: params.userId,
        updatedAt: new Date(),
      })
      .where(eq(clientProspects.id, params.prospectId));
    
    log.info(`[ClientProspect] Converted prospect ${params.prospectId} to client ${params.clientId}`);
  }
  
  /**
   * Increment shift filled count for a prospect
   */
  async incrementShiftsFilled(prospectId: string): Promise<void> {
    await db.update(clientProspects)
      .set({
        totalShiftsFilled: sql`${clientProspects.totalShiftsFilled} + 1`,
        updatedAt: new Date(),
      })
      .where(eq(clientProspects.id, prospectId));
  }
  
  /**
   * Get the status portal URL for a temp code
   */
  getStatusPortalUrl(tempCode: string): string {
    return `${getAppBaseUrl()}/client-portal/${tempCode}`;
  }
  
  /**
   * Get the signup URL with temp code pre-filled
   */
  getSignupUrl(tempCode: string): string {
    return `${getAppBaseUrl()}/client-signup?code=${tempCode}`;
  }
}

export const clientProspectService = ClientProspectService.getInstance();
