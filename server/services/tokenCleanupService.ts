/**
 * Token Cleanup Service
 * 
 * Automatically removes expired tokens to keep the database clean:
 * - Onboarding handoff tokens: Remove after 7 days
 * - Password reset tokens: Remove after 24 hours
 * - Email verification tokens: Remove after 48 hours
 * - Expired QuickBooks migration flows: Clean after 7 days
 * 
 * Runs daily at 3 AM to minimize impact
 */

import { db } from "../db";
import { workspaces, users, quickbooksOnboardingFlows } from "@shared/schema";
import { sql, lt, eq, and, or, isNotNull } from "drizzle-orm";
import cron from "node-cron";
import { createLogger } from '../lib/logger';
const log = createLogger('tokenCleanupService');


const CLEANUP_CONFIG = {
  handoffTokenMaxAgeDays: 7,
  passwordResetTokenMaxAgeHours: 24,
  emailVerificationTokenMaxAgeHours: 48,
  qbFlowMaxAgeDays: 7,
};

interface TokenCleanupResult {
  handoffTokensExpired: number;
  passwordResetTokensCleared: number;
  emailVerificationTokensCleared: number;
  qbFlowsCleared: number;
  duration: number;
  errors: string[];
}

function getDateThreshold(daysAgo: number): Date {
  const date = new Date();
  date.setDate(date.getDate() - daysAgo);
  return date;
}

function getHoursAgoThreshold(hoursAgo: number): Date {
  const date = new Date();
  date.setTime(date.getTime() - hoursAgo * 60 * 60 * 1000);
  return date;
}

async function cleanupHandoffTokens(): Promise<number> {
  const threshold = getDateThreshold(CLEANUP_CONFIG.handoffTokenMaxAgeDays);
  
  const result = await db.update(workspaces)
    .set({
      handoffToken: null,
      handoffTokenExpiry: null,
      handoffStatus: 'handoff_expired',
      updatedAt: new Date(),
    } as any)
    .where(and(
      isNotNull((workspaces as any).handoffTokenExpiry),
      lt((workspaces as any).handoffTokenExpiry, threshold),
      eq((workspaces as any).handoffStatus, 'handoff_sent')
    ))
    .returning({ id: workspaces.id });
  
  return result.length;
}

async function cleanupPasswordResetTokens(): Promise<number> {
  const threshold = getHoursAgoThreshold(CLEANUP_CONFIG.passwordResetTokenMaxAgeHours);
  
  const result = await db.update(users)
    .set({
      resetToken: null,
      resetTokenExpiry: null,
    })
    .where(and(
      isNotNull(users.resetTokenExpiry),
      lt(users.resetTokenExpiry, threshold)
    ))
    .returning({ id: users.id });
  
  return result.length;
}

async function cleanupEmailVerificationTokens(): Promise<number> {
  const threshold = getHoursAgoThreshold(CLEANUP_CONFIG.emailVerificationTokenMaxAgeHours);
  
  const result = await db.update(users)
    .set({
      verificationToken: null,
      verificationTokenExpiry: null,
    })
    .where(and(
      isNotNull(users.verificationTokenExpiry),
      lt(users.verificationTokenExpiry, threshold)
    ))
    .returning({ id: users.id });
  
  return result.length;
}

async function cleanupOldQuickBooksFlows(): Promise<number> {
  const threshold = getDateThreshold(CLEANUP_CONFIG.qbFlowMaxAgeDays);
  
  try {
    const result = await db.delete(quickbooksOnboardingFlows)
      .where(and(
        or(
          eq(quickbooksOnboardingFlows.stage, 'flow_complete'),
          eq(quickbooksOnboardingFlows.stage, 'flow_failed')
        ),
        lt(quickbooksOnboardingFlows.updatedAt, threshold)
      ))
      .returning({ id: quickbooksOnboardingFlows.id });
    
    return result.length;
  } catch (error) {
    log.info('[TokenCleanup] QuickBooks flows table may not exist yet');
    return 0;
  }
}

export async function runTokenCleanup(): Promise<TokenCleanupResult> {
  const startTime = Date.now();
  const errors: string[] = [];
  
  let handoffTokensExpired = 0;
  let passwordResetTokensCleared = 0;
  let emailVerificationTokensCleared = 0;
  let qbFlowsCleared = 0;
  
  log.info("[TokenCleanup] Starting token cleanup tasks...");
  
  try {
    handoffTokensExpired = await cleanupHandoffTokens();
    log.info(`[TokenCleanup] Expired ${handoffTokensExpired} handoff tokens`);
  } catch (error) {
    const errMsg = `Failed to clean handoff tokens: ${error}`;
    log.error(`[TokenCleanup] ${errMsg}`);
    errors.push(errMsg);
  }
  
  try {
    passwordResetTokensCleared = await cleanupPasswordResetTokens();
    log.info(`[TokenCleanup] Cleared ${passwordResetTokensCleared} password reset tokens`);
  } catch (error) {
    const errMsg = `Failed to clean password reset tokens: ${error}`;
    log.error(`[TokenCleanup] ${errMsg}`);
    errors.push(errMsg);
  }
  
  try {
    emailVerificationTokensCleared = await cleanupEmailVerificationTokens();
    log.info(`[TokenCleanup] Cleared ${emailVerificationTokensCleared} email verification tokens`);
  } catch (error) {
    const errMsg = `Failed to clean email verification tokens: ${error}`;
    log.error(`[TokenCleanup] ${errMsg}`);
    errors.push(errMsg);
  }
  
  try {
    qbFlowsCleared = await cleanupOldQuickBooksFlows();
    log.info(`[TokenCleanup] Cleared ${qbFlowsCleared} old QuickBooks flows`);
  } catch (error) {
    const errMsg = `Failed to clean QuickBooks flows: ${error}`;
    log.error(`[TokenCleanup] ${errMsg}`);
    errors.push(errMsg);
  }
  
  const duration = Date.now() - startTime;
  
  log.info(`[TokenCleanup] Complete in ${duration}ms: ` +
    `${handoffTokensExpired} handoff, ` +
    `${passwordResetTokensCleared} reset, ` +
    `${emailVerificationTokensCleared} verification, ` +
    `${qbFlowsCleared} QB flows`);
  
  return {
    handoffTokensExpired,
    passwordResetTokensCleared,
    emailVerificationTokensCleared,
    qbFlowsCleared,
    duration,
    errors,
  };
}

let cleanupScheduled = false;

export function initTokenCleanupScheduler(): void {
  if (cleanupScheduled) {
    log.info("[TokenCleanup] Scheduler already initialized");
    return;
  }
  
  cron.schedule("0 3 * * *", async () => {
    log.info("[TokenCleanup] Running scheduled cleanup (3 AM)");
    await runTokenCleanup();
  });
  
  cleanupScheduled = true;
  log.info("[TokenCleanup] Scheduled daily cleanup at 3 AM");
}
