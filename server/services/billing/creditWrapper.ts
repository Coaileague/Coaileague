/**
 * Credit Wrapper Utility
 * Provides a reusable wrapper for any automation function to handle credit checks and deductions
 */

import { creditManager, CREDIT_COSTS } from './creditManager';

// Re-export the feature keys from CREDIT_COSTS for type safety
export type FeatureKey = keyof typeof CREDIT_COSTS;

export interface CreditWrapperOptions {
  workspaceId: string;
  featureKey: FeatureKey;
  description: string;
  userId?: string;
}

export interface CreditWrapperResult<T> {
  success: boolean;
  result?: T;
  error?: string;
  creditsDeducted?: number;
  insufficientCredits?: boolean;
}

/**
 * Wraps any async function with credit checking and deduction
 * 
 * Usage example:
 * ```typescript
 * const result = await withCredits({
 *   workspaceId: '123',
 *   featureKey: 'ai_scheduling',
 *   description: 'Generated weekly schedule for workspace',
 *   userId: 'user-456'
 * }, async () => {
 *   // Your automation logic here
 *   return await scheduleGenerator.generate();
 * });
 * 
 * if (result.success) {
 *   console.log('Automation completed:', result.result);
 * } else if (result.insufficientCredits) {
 *   console.log('Out of credits!');
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
      
      return {
        success: false,
        insufficientCredits: true,
        error: `Insufficient credits. Need ${creditCheck.required}, have ${creditCheck.currentBalance}`,
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
        userId: userId || 'system-autoforce',
        featureKey,
        description,
        metadata: {
          timestamp: new Date().toISOString(),
          featureKey,
        },
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
