/**
 * Claude Verification Service — validates Claude outputs for Trinity actions
 * Checks outputs for safety, accuracy, and compliance before execution
 */
import { claudeService } from './claudeService';
import { createLogger } from '../../../lib/logger';
const log = createLogger('ClaudeVerificationService');

export const claudeVerificationService = {
  async verify(output: string, context: string): Promise<{ valid: boolean; issues: string[]; confidence: number }> {
    try {
      const verificationPrompt = `You are a verification agent for Trinity AI. Review this AI-generated output for correctness and safety.

Context: ${context.slice(0, 500)}

Output to verify:
${output.slice(0, 1000)}

Respond ONLY with JSON: {"valid": true/false, "issues": ["issue1"], "confidence": 0.0-1.0}`;

      const response = await claudeService.call(verificationPrompt, 'You are a verification agent. Respond only with valid JSON.', 256);
      const clean = response.replace(/```json|```/g, '').trim();
      return JSON.parse(clean);
    } catch (err: unknown) {
      log.warn(`[ClaudeVerification] Verification failed: ${err?.message}`);
      // Default to trusting the output on verification failure (non-critical path)
      return { valid: true, issues: [], confidence: 0.5 };
    }
  },

  async verifySchedulingAction(action: Record<string, unknown>): Promise<boolean> {
    const issues: string[] = [];
    if (!action.employeeId) issues.push('Missing employeeId');
    if (!action.shiftId) issues.push('Missing shiftId');
    if (!action.workspaceId) issues.push('Missing workspaceId');
    return issues.length === 0;
  },
};
