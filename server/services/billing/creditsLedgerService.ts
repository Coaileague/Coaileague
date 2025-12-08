import { db } from '../../db';
import { 
  trinityCredits, 
  trinityCreditTransactions, 
  trinityCreditPackages,
  trinityUnlockCodes,
  trinityCreditCosts,
  workspaces,
  users,
  type TrinityCredit,
  type TrinityCreditTransaction,
  type TrinityCreditPackage,
  type TrinityUnlockCode,
  type TrinityCreditCost
} from '@shared/schema';
import { eq, and, gt, sql, desc } from 'drizzle-orm';
import { platformEventBus } from '../platformEventBus';

export type TransactionType = 'purchase' | 'usage' | 'refund' | 'bonus' | 'expiry' | 'code_redemption';

export interface CreditDeductionResult {
  success: boolean;
  creditsDeducted: number;
  balanceAfter: number;
  transactionId?: string;
  error?: string;
}

export interface CreditAdditionResult {
  success: boolean;
  creditsAdded: number;
  balanceAfter: number;
  transactionId?: string;
  error?: string;
}

export interface UnlockCodeRedemptionResult {
  success: boolean;
  creditsAdded?: number;
  featureUnlocked?: string;
  addonActivated?: string;
  error?: string;
}

export interface CreditStatus {
  workspaceId: string;
  balance: number;
  isActive: boolean;
  lowBalance: boolean;
  lifetimePurchased: number;
  lifetimeUsed: number;
  lastUsedAt: Date | null;
  lastPurchasedAt: Date | null;
}

class CreditsLedgerService {
  private static instance: CreditsLedgerService;
  
  private constructor() {}
  
  public static getInstance(): CreditsLedgerService {
    if (!CreditsLedgerService.instance) {
      CreditsLedgerService.instance = new CreditsLedgerService();
    }
    return CreditsLedgerService.instance;
  }

  async getOrCreateCreditRecord(workspaceId: string): Promise<TrinityCredit> {
    const [existing] = await db.select().from(trinityCredits)
      .where(eq(trinityCredits.workspaceId, workspaceId))
      .limit(1);

    if (existing) {
      return existing;
    }

    const [created] = await db.insert(trinityCredits).values({
      workspaceId,
      balance: 0,
      isActive: true
    }).returning();

    console.log(`[CreditsLedger] Created credit record for workspace ${workspaceId}`);
    return created;
  }

  async getBalance(workspaceId: string): Promise<number> {
    const record = await this.getOrCreateCreditRecord(workspaceId);
    return record.balance;
  }

  async getCreditStatus(workspaceId: string): Promise<CreditStatus> {
    const record = await this.getOrCreateCreditRecord(workspaceId);
    
    return {
      workspaceId,
      balance: record.balance,
      isActive: record.isActive ?? true,
      lowBalance: record.balance < (record.lowBalanceThreshold ?? 50),
      lifetimePurchased: record.lifetimePurchased ?? 0,
      lifetimeUsed: record.lifetimeUsed ?? 0,
      lastUsedAt: record.lastUsedAt,
      lastPurchasedAt: record.lastPurchasedAt
    };
  }

  async hasEnoughCredits(workspaceId: string, creditsNeeded: number): Promise<boolean> {
    const balance = await this.getBalance(workspaceId);
    return balance >= creditsNeeded;
  }

  async getActionCreditCost(actionKey: string, subscriptionTier: string = 'free'): Promise<number> {
    const [costConfig] = await db.select().from(trinityCreditCosts)
      .where(and(
        eq(trinityCreditCosts.actionKey, actionKey),
        eq(trinityCreditCosts.isActive, true)
      ))
      .limit(1);

    if (!costConfig) {
      return 1;
    }

    const baseCredits = costConfig.credits;
    let multiplier = 1.0;

    switch (subscriptionTier) {
      case 'free':
        multiplier = parseFloat(costConfig.freeMultiplier || '1.0');
        break;
      case 'starter':
        multiplier = parseFloat(costConfig.starterMultiplier || '1.0');
        break;
      case 'professional':
        multiplier = parseFloat(costConfig.professionalMultiplier || '0.8');
        break;
      case 'enterprise':
        multiplier = parseFloat(costConfig.enterpriseMultiplier || '0.5');
        break;
    }

    return Math.ceil(baseCredits * multiplier);
  }

  async deductCredits(
    workspaceId: string,
    credits: number,
    actionType: string,
    userId?: string,
    actionId?: string,
    metadata?: Record<string, any>
  ): Promise<CreditDeductionResult> {
    try {
      const record = await this.getOrCreateCreditRecord(workspaceId);

      if (!record.isActive) {
        return {
          success: false,
          creditsDeducted: 0,
          balanceAfter: record.balance,
          error: 'Credit account is inactive'
        };
      }

      if (record.balance < credits) {
        this.emitLowBalanceAlert(workspaceId, record.balance, credits);
        return {
          success: false,
          creditsDeducted: 0,
          balanceAfter: record.balance,
          error: 'Insufficient credits'
        };
      }

      const newBalance = record.balance - credits;

      await db.update(trinityCredits)
        .set({
          balance: newBalance,
          lifetimeUsed: sql`${trinityCredits.lifetimeUsed} + ${credits}`,
          lastUsedAt: new Date(),
          updatedAt: new Date()
        })
        .where(eq(trinityCredits.workspaceId, workspaceId));

      const [transaction] = await db.insert(trinityCreditTransactions).values({
        workspaceId,
        userId: userId || null,
        transactionType: 'usage',
        credits: -credits,
        balanceAfter: newBalance,
        description: `Credit usage for ${actionType}`,
        actionType,
        actionId,
        metadata
      }).returning();

      if (newBalance < (record.lowBalanceThreshold ?? 50)) {
        this.emitLowBalanceAlert(workspaceId, newBalance, 0);
      }

      console.log(`[CreditsLedger] Deducted ${credits} credits for ${actionType} from workspace ${workspaceId}. New balance: ${newBalance}`);

      return {
        success: true,
        creditsDeducted: credits,
        balanceAfter: newBalance,
        transactionId: transaction.id
      };
    } catch (error) {
      console.error('[CreditsLedger] Error deducting credits:', error);
      return {
        success: false,
        creditsDeducted: 0,
        balanceAfter: 0,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  async addCredits(
    workspaceId: string,
    credits: number,
    transactionType: TransactionType,
    description: string,
    userId?: string,
    packageId?: string,
    stripePaymentId?: string,
    priceUsd?: number,
    unlockCodeId?: string
  ): Promise<CreditAdditionResult> {
    try {
      const record = await this.getOrCreateCreditRecord(workspaceId);
      const newBalance = record.balance + credits;

      const updateData: any = {
        balance: newBalance,
        updatedAt: new Date()
      };

      if (transactionType === 'purchase' || transactionType === 'code_redemption') {
        updateData.lifetimePurchased = sql`${trinityCredits.lifetimePurchased} + ${credits}`;
        updateData.lastPurchasedAt = new Date();
      } else if (transactionType === 'bonus') {
        updateData.lifetimeBonuses = sql`${trinityCredits.lifetimeBonuses} + ${credits}`;
      }

      await db.update(trinityCredits)
        .set(updateData)
        .where(eq(trinityCredits.workspaceId, workspaceId));

      const [transaction] = await db.insert(trinityCreditTransactions).values({
        workspaceId,
        userId: userId || null,
        transactionType,
        credits,
        balanceAfter: newBalance,
        description,
        packageId,
        stripePaymentId,
        priceUsd: priceUsd ? priceUsd.toString() : undefined,
        unlockCodeId
      }).returning();

      console.log(`[CreditsLedger] Added ${credits} credits (${transactionType}) to workspace ${workspaceId}. New balance: ${newBalance}`);

      platformEventBus.publish({
        type: 'announcement',
        category: 'feature',
        title: 'Credits Added',
        description: `${credits} credits added to workspace`,
        metadata: {
          workspaceId,
          credits,
          transactionType,
          newBalance
        }
      });

      return {
        success: true,
        creditsAdded: credits,
        balanceAfter: newBalance,
        transactionId: transaction.id
      };
    } catch (error) {
      console.error('[CreditsLedger] Error adding credits:', error);
      return {
        success: false,
        creditsAdded: 0,
        balanceAfter: 0,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  async purchaseCredits(
    workspaceId: string,
    packageId: string,
    userId: string,
    stripePaymentId: string
  ): Promise<CreditAdditionResult> {
    const [pkg] = await db.select().from(trinityCreditPackages)
      .where(and(
        eq(trinityCreditPackages.id, packageId),
        eq(trinityCreditPackages.isActive, true)
      ))
      .limit(1);

    if (!pkg) {
      return {
        success: false,
        creditsAdded: 0,
        balanceAfter: 0,
        error: 'Package not found or inactive'
      };
    }

    const totalCredits = pkg.credits + (pkg.bonusCredits ?? 0);

    return this.addCredits(
      workspaceId,
      totalCredits,
      'purchase',
      `Purchased ${pkg.name} (${pkg.credits} + ${pkg.bonusCredits ?? 0} bonus credits)`,
      userId,
      packageId,
      stripePaymentId,
      parseFloat(pkg.priceUsd)
    );
  }

  async redeemUnlockCode(
    workspaceId: string,
    code: string,
    userId: string
  ): Promise<UnlockCodeRedemptionResult> {
    const [unlockCode] = await db.select().from(trinityUnlockCodes)
      .where(and(
        eq(trinityUnlockCodes.code, code.toUpperCase()),
        eq(trinityUnlockCodes.isActive, true)
      ))
      .limit(1);

    if (!unlockCode) {
      return { success: false, error: 'Invalid or expired code' };
    }

    if (unlockCode.workspaceId && unlockCode.workspaceId !== workspaceId) {
      return { success: false, error: 'Code not valid for this workspace' };
    }

    if (unlockCode.expiresAt && new Date(unlockCode.expiresAt) < new Date()) {
      return { success: false, error: 'Code has expired' };
    }

    if ((unlockCode.currentRedemptions ?? 0) >= (unlockCode.maxRedemptions ?? 1)) {
      return { success: false, error: 'Code has reached maximum redemptions' };
    }

    await db.update(trinityUnlockCodes)
      .set({
        currentRedemptions: sql`${trinityUnlockCodes.currentRedemptions} + 1`
      })
      .where(eq(trinityUnlockCodes.id, unlockCode.id));

    const result: UnlockCodeRedemptionResult = { success: true };

    if (unlockCode.codeType === 'credits' && unlockCode.credits) {
      const addResult = await this.addCredits(
        workspaceId,
        unlockCode.credits,
        'code_redemption',
        `Redeemed unlock code: ${code}`,
        userId,
        undefined,
        undefined,
        undefined,
        unlockCode.id
      );

      if (!addResult.success) {
        return { success: false, error: addResult.error };
      }

      result.creditsAdded = unlockCode.credits;
    }

    if (unlockCode.featureKey) {
      result.featureUnlocked = unlockCode.featureKey;
    }

    if (unlockCode.addonKey) {
      result.addonActivated = unlockCode.addonKey;
    }

    console.log(`[CreditsLedger] Redeemed code ${code} for workspace ${workspaceId}`);

    return result;
  }

  async getTransactionHistory(
    workspaceId: string,
    limit: number = 50,
    offset: number = 0
  ): Promise<TrinityCreditTransaction[]> {
    return db.select().from(trinityCreditTransactions)
      .where(eq(trinityCreditTransactions.workspaceId, workspaceId))
      .orderBy(desc(trinityCreditTransactions.createdAt))
      .limit(limit)
      .offset(offset);
  }

  async getAvailablePackages(subscriptionTier: string = 'free'): Promise<TrinityCreditPackage[]> {
    const packages = await db.select().from(trinityCreditPackages)
      .where(eq(trinityCreditPackages.isActive, true))
      .orderBy(trinityCreditPackages.sortOrder);

    return packages.filter(pkg => {
      const allowedTiers = pkg.allowedTiers || ['starter', 'professional', 'enterprise'];
      return allowedTiers.includes(subscriptionTier);
    });
  }

  async generateUnlockCode(
    codeType: 'credits' | 'feature_unlock' | 'trial_extension' | 'addon_activation',
    createdBy: string,
    options: {
      credits?: number;
      featureKey?: string;
      addonKey?: string;
      daysValid?: number;
      workspaceId?: string;
      maxRedemptions?: number;
      expiresAt?: Date;
    }
  ): Promise<TrinityUnlockCode | null> {
    try {
      const code = this.generateCodeString();

      const [unlockCode] = await db.insert(trinityUnlockCodes).values({
        code,
        codeType,
        credits: options.credits,
        featureKey: options.featureKey,
        addonKey: options.addonKey,
        daysValid: options.daysValid,
        workspaceId: options.workspaceId,
        maxRedemptions: options.maxRedemptions ?? 1,
        expiresAt: options.expiresAt,
        createdBy,
        isActive: true
      }).returning();

      console.log(`[CreditsLedger] Generated unlock code: ${code}`);
      return unlockCode;
    } catch (error) {
      console.error('[CreditsLedger] Error generating unlock code:', error);
      return null;
    }
  }

  private generateCodeString(): string {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    const segments = [4, 4, 4];
    const parts = segments.map(len => 
      Array.from({ length: len }, () => chars[Math.floor(Math.random() * chars.length)]).join('')
    );
    return `TRIN-${parts.join('-')}`;
  }

  private emitLowBalanceAlert(workspaceId: string, currentBalance: number, creditsNeeded: number): void {
    platformEventBus.publish({
      type: 'announcement',
      category: 'announcement',
      title: 'Low Credit Balance',
      description: creditsNeeded > 0 
        ? `Insufficient credits: need ${creditsNeeded}, have ${currentBalance}`
        : `Low credit balance warning: ${currentBalance} credits remaining`,
      metadata: {
        workspaceId,
        currentBalance,
        creditsNeeded,
        severity: currentBalance === 0 ? 'critical' : 'high'
      }
    });
  }

  async setAccountActive(workspaceId: string, isActive: boolean): Promise<void> {
    await db.update(trinityCredits)
      .set({ isActive, updatedAt: new Date() })
      .where(eq(trinityCredits.workspaceId, workspaceId));

    console.log(`[CreditsLedger] Set workspace ${workspaceId} credit account active: ${isActive}`);
  }

  async seedDefaultCreditCosts(): Promise<void> {
    const defaultCosts: Array<{
      actionKey: string;
      actionCategory: string;
      credits: number;
      displayName: string;
      description: string;
    }> = [
      { actionKey: 'trinity_quick_command', actionCategory: 'trinity_command', credits: 1, displayName: 'Trinity Quick Command', description: 'Execute a Trinity AI quick command' },
      { actionKey: 'ai_schedule_generate', actionCategory: 'automation', credits: 5, displayName: 'AI Schedule Generation', description: 'Generate AI-optimized schedules' },
      { actionKey: 'ai_document_extract', actionCategory: 'ai_analysis', credits: 3, displayName: 'Document Extraction', description: 'Extract data from documents using AI' },
      { actionKey: 'ai_sentiment_analysis', actionCategory: 'ai_analysis', credits: 2, displayName: 'Sentiment Analysis', description: 'Analyze text sentiment' },
      { actionKey: 'ai_dispute_resolution', actionCategory: 'automation', credits: 4, displayName: 'AI Dispute Resolution', description: 'AI-assisted dispute resolution' },
      { actionKey: 'helpai_conversation', actionCategory: 'trinity_command', credits: 1, displayName: 'HelpAI Conversation', description: 'Interact with HelpAI assistant' },
      { actionKey: 'ai_expense_categorize', actionCategory: 'ai_analysis', credits: 2, displayName: 'Expense Categorization', description: 'AI categorization of expenses' },
      { actionKey: 'ai_pricing_analysis', actionCategory: 'ai_analysis', credits: 3, displayName: 'Dynamic Pricing Analysis', description: 'AI pricing optimization analysis' },
      { actionKey: 'automation_workflow', actionCategory: 'automation', credits: 2, displayName: 'Automation Workflow', description: 'Execute automated workflow' },
      { actionKey: 'ai_report_generation', actionCategory: 'ai_analysis', credits: 4, displayName: 'AI Report Generation', description: 'Generate AI-powered reports' }
    ];

    for (const cost of defaultCosts) {
      const [existing] = await db.select().from(trinityCreditCosts)
        .where(eq(trinityCreditCosts.actionKey, cost.actionKey))
        .limit(1);

      if (!existing) {
        await db.insert(trinityCreditCosts).values({
          ...cost,
          isActive: true
        });
        console.log(`[CreditsLedger] Seeded credit cost for ${cost.actionKey}`);
      }
    }
  }

  async seedDefaultPackages(): Promise<void> {
    const defaultPackages: Array<{
      name: string;
      description: string;
      credits: number;
      priceUsd: string;
      bonusCredits: number;
      sortOrder: number;
    }> = [
      { name: 'Starter Pack', description: '100 credits for small teams', credits: 100, priceUsd: '9.99', bonusCredits: 0, sortOrder: 1 },
      { name: 'Pro Pack', description: '500 credits with 50 bonus', credits: 500, priceUsd: '39.99', bonusCredits: 50, sortOrder: 2 },
      { name: 'Business Pack', description: '1000 credits with 150 bonus', credits: 1000, priceUsd: '69.99', bonusCredits: 150, sortOrder: 3 },
      { name: 'Enterprise Pack', description: '5000 credits with 1000 bonus', credits: 5000, priceUsd: '299.99', bonusCredits: 1000, sortOrder: 4 }
    ];

    for (const pkg of defaultPackages) {
      const [existing] = await db.select().from(trinityCreditPackages)
        .where(eq(trinityCreditPackages.name, pkg.name))
        .limit(1);

      if (!existing) {
        await db.insert(trinityCreditPackages).values({
          ...pkg,
          packageType: 'one_time',
          isActive: true,
          allowedTiers: ['starter', 'professional', 'enterprise']
        });
        console.log(`[CreditsLedger] Seeded credit package: ${pkg.name}`);
      }
    }
  }
}

export const creditsLedgerService = CreditsLedgerService.getInstance();
