/**
 * useMascotMode - Maps application state to GeminiAgentMascot modes
 * 
 * This hook observes the global loading context and other system states
 * to determine the appropriate mascot animation mode.
 * 
 * State mappings:
 * - Loading API data → SEARCHING
 * - Processing/computing → THINKING  
 * - AI analysis → ANALYZING
 * - File upload → UPLOADING
 * - Voice/audio input → LISTENING
 * - Success → SUCCESS
 * - Error → ERROR
 * - Idle → IDLE
 */

import { useMemo } from 'react';
import type { MascotMode } from '@/components/gemini-agent-mascot';

interface MascotModeOptions {
  isLoading?: boolean;
  isError?: boolean;
  isSuccess?: boolean;
  isUploading?: boolean;
  isProcessing?: boolean;
  isAnalyzing?: boolean;
  isListening?: boolean;
  isCoding?: boolean;
  customMode?: MascotMode;
}

export function useMascotMode(options: MascotModeOptions = {}): MascotMode {
  const {
    isLoading = false,
    isError = false,
    isSuccess = false,
    isUploading = false,
    isProcessing = false,
    isAnalyzing = false,
    isListening = false,
    isCoding = false,
    customMode
  } = options;

  return useMemo(() => {
    if (customMode) return customMode;
    
    if (isError) return 'ERROR';
    if (isSuccess) return 'SUCCESS';
    if (isUploading) return 'UPLOADING';
    if (isListening) return 'LISTENING';
    if (isCoding) return 'CODING';
    if (isAnalyzing) return 'ANALYZING';
    if (isProcessing) return 'THINKING';
    if (isLoading) return 'SEARCHING';
    
    return 'IDLE';
  }, [
    customMode,
    isError,
    isSuccess,
    isUploading,
    isListening,
    isCoding,
    isAnalyzing,
    isProcessing,
    isLoading
  ]);
}

export function getMascotModeFromLoadingState(
  pendingRequests: number,
  error?: boolean,
  success?: boolean
): MascotMode {
  if (error) return 'ERROR';
  if (success) return 'SUCCESS';
  if (pendingRequests > 0) return 'SEARCHING';
  return 'IDLE';
}

export function getMascotModeFromProgress(progress: number): MascotMode {
  if (progress >= 100) return 'SUCCESS';
  if (progress >= 75) return 'THINKING';
  if (progress >= 25) return 'ANALYZING';
  if (progress > 0) return 'SEARCHING';
  return 'IDLE';
}
