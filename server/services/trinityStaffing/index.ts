/**
 * TRINITY STAFFING SERVICE INDEX
 * ================================
 * Premier AI-powered automated staffing system.
 * 
 * Exports all Trinity Staffing services for use throughout the platform.
 */

export { workRequestParser } from './workRequestParser';
export type { ParsedWorkRequest, EmailClassificationResult } from './workRequestParser';

export { escalationChainService } from './escalationChainService';
export type { 
  EscalationTier, 
  EscalationAction, 
  EscalationState, 
  EscalationResult 
} from './escalationChainService';

export { clientConfirmationService } from './clientConfirmationService';
export type { ConfirmationEmailData, ConfirmationResult } from './clientConfirmationService';

export { trinityStaffingOrchestrator } from './orchestrator';
