/**
 * GamificationActivationAgent — STUB
 * Gamification removed per product decision. Stub preserves onboardingOrchestrator types.
 */

export interface ActivationResult {
  success: boolean;
  achievementsCreated: number;
  automationGatesUnlocked: number;
  errors: string[];
}

export const AUTOMATION_GATES: Record<string, string> = {};

export const gamificationActivationAgent = {
  activateForOrg: async (_params: any): Promise<ActivationResult> => ({
    success: true,
    achievementsCreated: 0,
    automationGatesUnlocked: 0,
    errors: [],
  }),
};
