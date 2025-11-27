/**
 * Credit Wrapper Utility
 * Provides a reusable wrapper for any automation function to handle credit checks and deductions
 * Now includes AI Brain checkpoint system for graceful automation pausing
 */

import { creditManager, CREDIT_COSTS } from './creditManager';
import { db } from '../../db';
import { aiCheckpoints, workspaceCredits } from '@shared/schema';
import { eq } from 'drizzle-orm';

// Re-export the feature keys from CREDIT_COSTS for type safety
export type FeatureKey = keyof typeof CREDIT_COSTS;

export interface CreditWrapperOptions {
  workspaceId: string;
  featureKey: FeatureKey;
  description: string;
  userId?: string;
  // Checkpoint support - automation state for resume
  stateSnapshot?: Record<string, any>;
  resumeParameters?: Record<string, any>;
  completedSteps?: string[];
  progressPercentage?: number;
}

export interface CreditWrapperResult<T> {
  success: boolean;
  result?: T;
  error?: string;
  creditsDeducted?: number;
  insufficientCredits?: boolean;
  checkpointId?: string; // AI Brain checkpoint ID when paused
  checkpointExpiry?: Date; // When checkpoint expires (24h)
}

/**
 * Create AI Brain checkpoint when automation paused due to insufficient credits
 * Allows users to resume from where they left off after purchasing credits
 */
async function createCheckpoint(
  options: CreditWrapperOptions,
  creditsRequired: number,
  currentBalance: number
): Promise<{ checkpointId: string; expiresAt: Date }> {
  const {
    workspaceId,
    featureKey,
    description,
    userId,
    stateSnapshot = {},
    resumeParameters = {},
    completedSteps = [],
    progressPercentage = 0
  } = options;

  // Calculate expiry (24 hours from now)
  const expiresAt = new Date();
  expiresAt.setHours(expiresAt.getHours() + 24);

  const [checkpoint] = await db.insert(aiCheckpoints).values({
    workspaceId,
    userId: userId || null,
    featureKey,
    featureName: description || featureKey,
    status: 'paused',
    creditsRequired,
    creditsAtPause: currentBalance,
    progressPercentage,
    completedSteps,
    stateSnapshot,
    resumeParameters,
    expiresAt,
  }).returning();

  console.log(`💾 [AI Brain Checkpoint] Created checkpoint ${checkpoint.id} for ${featureKey}`);
  console.log(`   Expires: ${expiresAt.toISOString()}`);
  console.log(`   Progress: ${progressPercentage}%`);

  return {
    checkpointId: checkpoint.id,
    expiresAt: checkpoint.expiresAt
  };
}

/**
 * Wraps any async function with credit checking and deduction
 * Now includes AI Brain checkpoint system for graceful automation pausing
 * 
 * Usage example:
 * ```typescript
 * const result = await withCredits({
 *   workspaceId: '123',
 *   featureKey: 'ai_scheduling',
 *   description: 'Generated weekly schedule for workspace',
 *   userId: 'user-456',
 *   stateSnapshot: { weekStartDate: '2025-11-28', shiftRequirements: [...] },
 *   resumeParameters: { continueFrom: 'step2' },
 *   progressPercentage: 35
 * }, async () => {
 *   // Your automation logic here
 *   return await scheduleGenerator.generate();
 * });
 * 
 * if (result.success) {
 *   console.log('Automation completed:', result.result);
 * } else if (result.insufficientCredits) {
 *   console.log('Paused! Resume with checkpoint:', result.checkpointId);
 * }
 * ```
 */
export async function withCredits<T>(
  options: CreditWrapperOptions,
  fn: () => Promise<T>
): Promise<CreditWrapperResult<T>> {
  const { workspaceId, featureKey, description, userId } = options;

  try {
    // Step 1: Check if workspace has enough credits
    const creditCheck = await creditManager.checkCredits(workspaceId, featureKey);

    if (!creditCheck.hasEnoughCredits) {
      console.log(`❌ [Credit Wrapper] Insufficient credits for ${featureKey} in workspace ${workspaceId}`);
      console.log(`   Required: ${creditCheck.required}, Available: ${creditCheck.currentBalance}`);
      
      // Create AI Brain checkpoint for graceful resume
      const { checkpointId, expiresAt } = await createCheckpoint(
        options,
        creditCheck.required,
        creditCheck.currentBalance
      );
      
      return {
        success: false,
        insufficientCredits: true,
        error: `Insufficient credits. Need ${creditCheck.required}, have ${creditCheck.currentBalance}`,
        checkpointId,
        checkpointExpiry: expiresAt,
      };
    }

    console.log(`✅ [Credit Wrapper] Credit check passed for ${featureKey}`);
    console.log(`   Cost: ${creditCheck.required} credits, Available: ${creditCheck.currentBalance}`);

    // Step 2: Execute the automation function
    let result: T;
    try {
      result = await fn();
    } catch (executionError) {
      console.error(`❌ [Credit Wrapper] Automation execution failed:`, executionError);
      // Don't deduct credits if execution failed
      return {
        success: false,
        error: executionError instanceof Error ? executionError.message : String(executionError),
      };
    }

    // Step 3: Deduct credits after successful execution
    try {
      await creditManager.deductCredits({
        workspaceId,
        userId: userId || 'system-coaileague',
        featureKey,
        featureName: description || featureKey,
        description,
      });

      console.log(`✅ [Credit Wrapper] Deducted ${creditCheck.required} credits for ${featureKey}`);
    } catch (deductError) {
      console.error(`⚠️  [Credit Wrapper] Failed to deduct credits (automation succeeded):`, deductError);
      // Automation succeeded but credit deduction failed - this is recoverable
      // The result is still returned as successful
    }

    return {
      success: true,
      result,
      creditsDeducted: creditCheck.required,
    };

  } catch (error) {
    console.error(`❌ [Credit Wrapper] Unexpected error:`, error);
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

/**
 * Batch wrapper - checks credits once, runs multiple operations, deducts total at end
 * Useful for operations that generate multiple items (e.g., generating 50 shifts counts as 1 schedule)
 */
export async function withCreditsBatch<T>(
  options: CreditWrapperOptions,
  fn: () => Promise<T[]>
): Promise<CreditWrapperResult<T[]>> {
  // Same logic as withCredits, but for batch operations
  // The cost is still based on featureKey (e.g., 1 schedule = 25 credits regardless of shift count)
  return withCredits(options, fn);
}
