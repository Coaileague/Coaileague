/**
 * useMascotActionStates - Triggers action state indicators based on mascot mode
 * 
 * This hook watches the current mascot mode and triggers appropriate action states
 * like "thinking...", "coding...", "automating..." with animated ellipsis display.
 * 
 * Action states are shown in the thought bubble and provide visual feedback about
 * what the AI mascot is currently doing.
 */

import { useEffect, useRef } from 'react';
import { thoughtManager } from '@/lib/mascot/ThoughtManager';
import type { MascotMode } from '@/config/mascotConfig';

interface UseMascotActionStatesOptions {
  mode: MascotMode;
  enabled?: boolean;
  customText?: string; // Override the default action text
}

// Modes that should show action states (active processing modes + holiday)
const ACTION_STATE_MODES: Set<MascotMode> = new Set([
  'SEARCHING',
  'THINKING',
  'ANALYZING',
  'CODING',
  'LISTENING',
  'UPLOADING',
  'ADVISING',
  'HOLIDAY', // Show seasonal action text like "flying through snow..."
  'GREETING', // Show greeting action text
]);

// Modes that should clear action states (completion/idle modes)
const CLEAR_STATE_MODES: Set<MascotMode> = new Set([
  'IDLE',
  'SUCCESS',
  'ERROR',
  'CELEBRATING',
]);

export function useMascotActionStates({
  mode,
  enabled = true,
  customText,
}: UseMascotActionStatesOptions): void {
  const previousModeRef = useRef<MascotMode | null>(null);
  
  useEffect(() => {
    // Clear action state when disabled
    if (!enabled) {
      thoughtManager.stopActionState();
      return;
    }
    
    const previousMode = previousModeRef.current;
    previousModeRef.current = mode;
    
    // Skip if mode hasn't changed
    if (previousMode === mode) {
      return;
    }
    
    // Check if we should show an action state for this mode
    if (ACTION_STATE_MODES.has(mode)) {
      // Trigger action state with optional custom text
      thoughtManager.triggerActionState(mode, customText);
    } else if (CLEAR_STATE_MODES.has(mode)) {
      // Clear any existing action state when entering idle/completion modes
      thoughtManager.stopActionState();
    }
    
  }, [mode, enabled, customText]);
  
  // Cleanup on unmount
  useEffect(() => {
    return () => {
      thoughtManager.stopActionState();
    };
  }, []);
}

/**
 * Manually trigger an action state with custom text
 * Useful for one-off action displays outside of mode changes
 */
export function triggerActionState(mode: MascotMode, customText?: string): void {
  thoughtManager.triggerActionState(mode, customText);
}

/**
 * Manually stop any current action state
 */
export function stopActionState(): void {
  thoughtManager.stopActionState();
}

/**
 * Check if currently showing an action state
 */
export function isShowingActionState(): boolean {
  return thoughtManager.isShowingActionState();
}
