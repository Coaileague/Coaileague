import { db } from '../../db';
import {
  aiTokenWallets,
  billingAuditLog,
  type InsertAiTokenWallet,
  type AiTokenWallet,
} from '@shared/schema';
import { eq } from 'drizzle-orm';

export interface CreditTransaction {
  amount: number;
  description: string;
  relatedEventId?: string;
}

export class CreditLedgerService {
  /**
   * Get or create token wallet for workspace
   */
  async getWallet(workspaceId: string): Promise<AiTokenWallet> {
    const [wallet] = await db.select()
      .from(aiTokenWallets)
      .where(eq(aiTokenWallets.workspaceId, workspaceId))
      .limit(1);

    if (wallet) {
      return wallet;
    }

    // Create new wallet
    const [newWallet] = await db.insert(aiTokenWallets)
      .values({
        workspaceId,
        currentBalance: '0.0000',
        totalPurchased: '0.0000',
        totalUsed: '0.0000',
        monthlyIncludedCredits: '0.00',
        monthlyCreditsUsed: '0.00',
      })
      .returning();

    return newWallet;
  }

  /**
   * Add credits to wallet (purchase or grant)
   */
  async addCredits(
    workspaceId: string,
    amount: number,
    description: string,
    isPurchase: boolean = true,
    actorId?: string
  ): Promise<AiTokenWallet> {
    const wallet = await this.getWallet(workspaceId);

    const currentBalance = Number(wallet.currentBalance) || 0;
    const totalPurchased = Number(wallet.totalPurchased) || 0;

    const [updatedWallet] = await db.update(aiTokenWallets)
      .set({
        currentBalance: (currentBalance + amount).toString(),
        totalPurchased: isPurchase ? (totalPurchased + amount).toString() : wallet.totalPurchased,
        updatedAt: new Date(),
      })
      .where(eq(aiTokenWallets.id, wallet.id))
      .returning();

    // Log audit event
    await db.insert(billingAuditLog).values({
      workspaceId,
      eventType: 'credits_purchased',
      eventCategory: 'account',
      actorType: actorId ? 'user' : 'system',
      actorId,
      description,
      relatedEntityType: 'token_wallet',
      relatedEntityId: wallet.id,
      previousState: {
        balance: currentBalance,
      },
      newState: {
        balance: currentBalance + amount,
        amountAdded: amount,
      },
    });

    // Check if we should send low balance alert
    await this.checkLowBalanceAlert(updatedWallet);

    return updatedWallet;
  }

  /**
   * Deduct credits from wallet (for usage)
   */
  async deductCredits(
    workspaceId: string,
    amount: number,
    description: string,
    relatedEventId?: string
  ): Promise<AiTokenWallet> {
    const wallet = await this.getWallet(workspaceId);

    const currentBalance = Number(wallet.currentBalance) || 0;
    const totalUsed = Number(wallet.totalUsed) || 0;

    // Check if sufficient balance
    if (currentBalance < amount) {
      throw new Error(`Insufficient credits. Current balance: ${currentBalance}, Required: ${amount}`);
    }

    const [updatedWallet] = await db.update(aiTokenWallets)
      .set({
        currentBalance: (currentBalance - amount).toString(),
        totalUsed: (totalUsed + amount).toString(),
        updatedAt: new Date(),
      })
      .where(eq(aiTokenWallets.id, wallet.id))
      .returning();

    // Log audit event
    await db.insert(billingAuditLog).values({
      workspaceId,
      eventType: 'usage_recorded',
      eventCategory: 'usage',
      actorType: 'system',
      description,
      relatedEntityType: 'usage_event',
      relatedEntityId: relatedEventId,
      previousState: {
        balance: currentBalance,
      },
      newState: {
        balance: currentBalance - amount,
        amountUsed: amount,
      },
    });

    // Check if we should send low balance alert
    await this.checkLowBalanceAlert(updatedWallet);

    // Check if auto-recharge is enabled
    await this.checkAutoRecharge(updatedWallet);

    return updatedWallet;
  }

  /**
   * Set monthly included credits (from subscription tier)
   */
  async setMonthlyIncludedCredits(
    workspaceId: string,
    monthlyCredits: number
  ): Promise<AiTokenWallet> {
    const wallet = await this.getWallet(workspaceId);

    const [updatedWallet] = await db.update(aiTokenWallets)
      .set({
        monthlyIncludedCredits: monthlyCredits.toString(),
        monthlyCreditsResetAt: this.getNextMonthlyResetDate(),
        updatedAt: new Date(),
      })
      .where(eq(aiTokenWallets.id, wallet.id))
      .returning();

    return updatedWallet;
  }

  /**
   * Reset monthly credits (called by cron job)
   */
  async resetMonthlyCredits(workspaceId: string): Promise<AiTokenWallet> {
    const wallet = await this.getWallet(workspaceId);

    const [updatedWallet] = await db.update(aiTokenWallets)
      .set({
        monthlyCreditsUsed: '0.00',
        monthlyCreditsResetAt: this.getNextMonthlyResetDate(),
        updatedAt: new Date(),
      })
      .where(eq(aiTokenWallets.id, wallet.id))
      .returning();

    return updatedWallet;
  }

  /**
   * Configure auto-recharge settings
   */
  async configureAutoRecharge(
    workspaceId: string,
    enabled: boolean,
    threshold?: number,
    amount?: number
  ): Promise<AiTokenWallet> {
    const wallet = await this.getWallet(workspaceId);

    const [updatedWallet] = await db.update(aiTokenWallets)
      .set({
        autoRechargeEnabled: enabled,
        autoRechargeThreshold: threshold ? threshold.toString() : wallet.autoRechargeThreshold,
        autoRechargeAmount: amount ? amount.toString() : wallet.autoRechargeAmount,
        updatedAt: new Date(),
      })
      .where(eq(aiTokenWallets.id, wallet.id))
      .returning();

    return updatedWallet;
  }

  /**
   * Configure low balance alerts
   */
  async configureLowBalanceAlert(
    workspaceId: string,
    enabled: boolean,
    threshold?: number
  ): Promise<AiTokenWallet> {
    const wallet = await this.getWallet(workspaceId);

    const [updatedWallet] = await db.update(aiTokenWallets)
      .set({
        lowBalanceAlertEnabled: enabled,
        lowBalanceAlertThreshold: threshold ? threshold.toString() : wallet.lowBalanceAlertThreshold,
        updatedAt: new Date(),
      })
      .where(eq(aiTokenWallets.id, wallet.id))
      .returning();

    return updatedWallet;
  }

  /**
   * Get balance information
   */
  async getBalance(workspaceId: string): Promise<{
    currentBalance: number;
    totalPurchased: number;
    totalUsed: number;
    monthlyIncludedCredits: number;
    monthlyCreditsUsed: number;
    monthlyCreditsRemaining: number;
  }> {
    const wallet = await this.getWallet(workspaceId);

    const currentBalance = Number(wallet.currentBalance) || 0;
    const totalPurchased = Number(wallet.totalPurchased) || 0;
    const totalUsed = Number(wallet.totalUsed) || 0;
    const monthlyIncludedCredits = Number(wallet.monthlyIncludedCredits) || 0;
    const monthlyCreditsUsed = Number(wallet.monthlyCreditsUsed) || 0;

    return {
      currentBalance,
      totalPurchased,
      totalUsed,
      monthlyIncludedCredits,
      monthlyCreditsUsed,
      monthlyCreditsRemaining: Math.max(0, monthlyIncludedCredits - monthlyCreditsUsed),
    };
  }

  /**
   * Check if low balance alert should be sent
   */
  private async checkLowBalanceAlert(wallet: AiTokenWallet): Promise<void> {
    if (!wallet.lowBalanceAlertEnabled) return;

    const currentBalance = Number(wallet.currentBalance) || 0;
    const threshold = Number(wallet.lowBalanceAlertThreshold) || 10;

    if (currentBalance <= threshold) {
      // Check if we already sent an alert recently (within 24 hours)
      const lastAlertAt = wallet.lastLowBalanceAlertAt;
      if (lastAlertAt) {
        const hoursSinceLastAlert = (Date.now() - lastAlertAt.getTime()) / (1000 * 60 * 60);
        if (hoursSinceLastAlert < 24) {
          return; // Don't spam alerts
        }
      }

      // Send alert (implement notification service)
      // For now, just log
      console.log(`Low balance alert for workspace ${wallet.workspaceId}: $${currentBalance}`);

      // Update last alert timestamp
      await db.update(aiTokenWallets)
        .set({
          lastLowBalanceAlertAt: new Date(),
        })
        .where(eq(aiTokenWallets.id, wallet.id));
    }
  }

  /**
   * Check if auto-recharge should be triggered
   */
  private async checkAutoRecharge(wallet: AiTokenWallet): Promise<void> {
    if (!wallet.autoRechargeEnabled) return;

    const currentBalance = Number(wallet.currentBalance) || 0;
    const threshold = Number(wallet.autoRechargeThreshold) || 0;
    const rechargeAmount = Number(wallet.autoRechargeAmount) || 0;

    if (currentBalance <= threshold && rechargeAmount > 0) {
      // Trigger auto-recharge (implement Stripe payment)
      // For now, just log
      console.log(`Auto-recharge triggered for workspace ${wallet.workspaceId}: $${rechargeAmount}`);

      // This would create a Stripe Payment Intent and charge the customer
      // await stripeService.createPaymentIntent(wallet.workspaceId, rechargeAmount);
    }
  }

  /**
   * Get next monthly reset date (1st of next month)
   */
  private getNextMonthlyResetDate(): Date {
    const now = new Date();
    const nextMonth = new Date(now.getFullYear(), now.getMonth() + 1, 1);
    return nextMonth;
  }
}

// Singleton instance
export const creditLedgerService = new CreditLedgerService();
