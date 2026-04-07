
import { createLogger } from '../../lib/logger';
const log = createLogger('trinityPersonaAnchor');
/**
 * TrinityPersonaAnchor — Phase H of Cognitive Enhancement Sprint
 *
 * Lightweight pre-response tone and persona drift detector.
 * Ensures Trinity's core identity doesn't drift under pressure,
 * user frustration, or topic shifts. Max ~100 tokens of overhead.
 */

export type ToneCategory = 'formal' | 'professional' | 'warm' | 'direct';

export interface PersonaState {
  conversationId: string;
  establishedTone: ToneCategory;
  formalityLevel: number;   // 1-5 (1=very casual, 5=very formal)
  valuesStances: string[];  // positions Trinity has taken in this conversation
  userPreferenceSignals: string[];
  lastCheckedAt: Date;
}

export interface AnchorCheck {
  driftDetected: boolean;
  driftType: string | null;
  correctionInstruction: string | null;
  approvedTone: ToneCategory;
}

// In-memory per-conversation persona state (lightweight, no DB needed)
const personaStates = new Map<string, PersonaState>();

// Trinity's non-negotiable core identity anchors
const CORE_IDENTITY = {
  alwaysProfessional: true,
  neverAggressive: true,
  neverSycophantic: true,     // Never says "Great question!" or excessive flattery
  neverVague: true,           // Never hedges endlessly without making a point
  maintainsPositions: true,   // Never flip-flops on a position just because user pushes back
  securityIndustryVoice: true, // Always speaks with authority on security operations
};

// Drift indicators — patterns that signal Trinity is breaking character
const SYCOPHANCY_PATTERNS = [
  /great\s+(question|point|idea)/i,
  /absolutely!|certainly!|of course!/i,
  /you're (so|absolutely|totally) right/i,
];

const AGGRESSION_PATTERNS = [
  /you (should|must|need to) (stop|listen|understand)/i,
  /obviously|clearly you/i,
];

const VAGUENESS_PATTERNS = [
  /it depends on many factors/i,
  /there are (many|several) perspectives/i,
  /it's (complicated|complex) and (hard|difficult) to say/i,
];

class TrinityPersonaAnchor {
  /**
   * Check a proposed response for persona drift before delivering it.
   */
  checkForDrift(
    proposedResponse: string,
    conversationId: string,
    userMessage: string,
  ): AnchorCheck {
    const state = this.getOrCreateState(conversationId, userMessage);

    // Check for sycophancy
    if (SYCOPHANCY_PATTERNS.some(p => p.test(proposedResponse))) {
      return {
        driftDetected: true,
        driftType: 'sycophancy',
        correctionInstruction: 'Remove complimentary openers. Start directly with the answer. Trinity does not flatter.',
        approvedTone: state.establishedTone,
      };
    }

    // Check for aggression
    if (AGGRESSION_PATTERNS.some(p => p.test(proposedResponse))) {
      return {
        driftDetected: true,
        driftType: 'aggression',
        correctionInstruction: 'Soften directive language. Trinity is authoritative but never condescending.',
        approvedTone: state.establishedTone,
      };
    }

    // Check for excessive vagueness on operational topics
    const isOperational = /schedule|shift|officer|site|coverage|payroll|invoice/.test(userMessage.toLowerCase());
    if (isOperational && VAGUENESS_PATTERNS.some(p => p.test(proposedResponse))) {
      return {
        driftDetected: true,
        driftType: 'vagueness',
        correctionInstruction: 'Make a concrete recommendation. Trinity is decisive — give a specific answer, not a "it depends" hedge.',
        approvedTone: state.establishedTone,
      };
    }

    // No drift
    return {
      driftDetected: false,
      driftType: null,
      correctionInstruction: null,
      approvedTone: state.establishedTone,
    };
  }

  /**
   * Infer the appropriate tone modifier for a response based on user signals.
   * Returns a brief tone instruction to inject into the system prompt.
   */
  getToneInstruction(conversationId: string, userMessage: string): string {
    const state = this.getOrCreateState(conversationId, userMessage);

    // Update formality detection from user's message
    const userIsFormal = /dear|please|kindly|would you|could you/.test(userMessage.toLowerCase());
    const userIsCasual = /hey|yeah|nah|gonna|wanna|lemme/.test(userMessage.toLowerCase());

    if (userIsFormal && state.formalityLevel < 4) state.formalityLevel = Math.min(5, state.formalityLevel + 1);
    if (userIsCasual && state.formalityLevel > 2) state.formalityLevel = Math.max(1, state.formalityLevel - 1);

    const formalityNote = state.formalityLevel >= 4
      ? 'Use formal professional language.'
      : state.formalityLevel <= 2
        ? 'Use a direct, conversational tone — still professional, never unprofessional.'
        : 'Use a professional yet approachable tone.';

    return `PERSONA ANCHOR: Trinity is a security industry AI co-pilot. ${formalityNote} Never use sycophantic openers. Never hedge when concrete guidance is possible. Maintain positions unless presented with new factual evidence.`;
  }

  private getOrCreateState(conversationId: string, userMessage: string): PersonaState {
    if (personaStates.has(conversationId)) {
      return personaStates.get(conversationId)!;
    }

    // Infer initial tone from first message
    const isUrgent = /urgent|asap|emergency|critical|now/.test(userMessage.toLowerCase());
    const isFormal = /dear|please|could you|would you/.test(userMessage.toLowerCase());

    const state: PersonaState = {
      conversationId,
      establishedTone: isUrgent ? 'direct' : isFormal ? 'formal' : 'professional',
      formalityLevel: isFormal ? 4 : isUrgent ? 2 : 3,
      valuesStances: [],
      userPreferenceSignals: [],
      lastCheckedAt: new Date(),
    };

    personaStates.set(conversationId, state);

    // Prune stale states (keep last 500)
    if (personaStates.size > 500) {
      const oldest = personaStates.keys().next().value;
      if (oldest) personaStates.delete(oldest);
    }

    return state;
  }

  /**
   * Clean up state for ended conversations.
   */
  clearConversation(conversationId: string): void {
    personaStates.delete(conversationId);
  }
}

export const trinityPersonaAnchor = new TrinityPersonaAnchor();
