import { useState, useRef, useCallback, useEffect, useMemo } from 'react';
import { useIsMobile } from './use-mobile';

export type VoiceCommandState = 
  | 'idle'
  | 'requesting_permission'
  | 'listening'
  | 'processing'
  | 'success'
  | 'error';

export interface VoiceCommandResult {
  transcript: string;
  confidence: number;
  timestamp: Date;
}

export interface VoiceCommandError {
  code: 'permission_denied' | 'not_supported' | 'network_error' | 'timeout' | 'unknown';
  message: string;
}

interface UseVoiceCommandOptions {
  onResult?: (result: VoiceCommandResult) => void;
  onError?: (error: VoiceCommandError) => void;
  onStateChange?: (state: VoiceCommandState) => void;
  language?: string;
  maxDuration?: number;
  interimResults?: boolean;
}

interface SpeechRecognitionEvent {
  results: SpeechRecognitionResultList;
  resultIndex: number;
}

interface SpeechRecognitionErrorEvent {
  error: string;
  message: string;
}

interface SpeechRecognition extends EventTarget {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  maxAlternatives: number;
  start(): void;
  stop(): void;
  abort(): void;
  onresult: ((event: SpeechRecognitionEvent) => void) | null;
  onerror: ((event: SpeechRecognitionErrorEvent) => void) | null;
  onend: (() => void) | null;
  onstart: (() => void) | null;
  onspeechend: (() => void) | null;
}

declare global {
  interface Window {
    SpeechRecognition: new () => SpeechRecognition;
    webkitSpeechRecognition: new () => SpeechRecognition;
  }
}

export function useVoiceCommand(options: UseVoiceCommandOptions = {}) {
  const {
    onResult,
    onError,
    onStateChange,
    language = 'en-US',
    maxDuration = 30000,
    interimResults = true
  } = options;

  const [state, setState] = useState<VoiceCommandState>('idle');
  const [transcript, setTranscript] = useState<string>('');
  const [interimTranscript, setInterimTranscript] = useState<string>('');
  const [hasPermission, setHasPermission] = useState<boolean | null>(null);
  const [isSupported, setIsSupported] = useState<boolean>(true);
  
  const recognitionRef = useRef<SpeechRecognition | null>(null);
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);
  const longPressTimerRef = useRef<NodeJS.Timeout | null>(null);
  const isLongPressingRef = useRef<boolean>(false);
  
  const isMobile = useIsMobile();
  const isTouchDevice = useMemo(() => {
    if (typeof window === 'undefined') return false;
    return 'ontouchstart' in window || navigator.maxTouchPoints > 0;
  }, []);

  const updateState = useCallback((newState: VoiceCommandState) => {
    setState(newState);
    onStateChange?.(newState);
  }, [onStateChange]);

  const handleError = useCallback((code: VoiceCommandError['code'], message: string) => {
    const error: VoiceCommandError = { code, message };
    updateState('error');
    onError?.(error);
    console.error('[VoiceCommand]', message);
  }, [updateState, onError]);

  useEffect(() => {
    const SpeechRecognitionAPI = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognitionAPI) {
      setIsSupported(false);
      console.log('[VoiceCommand] Speech Recognition not supported in this browser');
    }
  }, []);

  const checkPermission = useCallback(async (): Promise<boolean> => {
    try {
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        setHasPermission(false);
        return false;
      }

      updateState('requesting_permission');
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      stream.getTracks().forEach(track => track.stop());
      
      setHasPermission(true);
      return true;
    } catch (err: any) {
      console.error('[VoiceCommand] Permission error:', err);
      setHasPermission(false);
      
      if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError') {
        handleError('permission_denied', 'Microphone permission denied. Please allow access to use voice commands.');
      } else {
        handleError('unknown', 'Failed to access microphone.');
      }
      return false;
    }
  }, [updateState, handleError]);

  const startListening = useCallback(async () => {
    if (!isSupported) {
      handleError('not_supported', 'Voice commands are not supported in this browser. Please use Chrome or Safari.');
      return;
    }

    const permitted = await checkPermission();
    if (!permitted) return;

    try {
      const SpeechRecognitionAPI = window.SpeechRecognition || window.webkitSpeechRecognition;
      const recognition = new SpeechRecognitionAPI();
      
      recognition.continuous = false;
      recognition.interimResults = interimResults;
      recognition.lang = language;
      recognition.maxAlternatives = 1;

      recognition.onstart = () => {
        console.log('[VoiceCommand] Started listening');
        updateState('listening');
        setTranscript('');
        setInterimTranscript('');
      };

      recognition.onresult = (event: SpeechRecognitionEvent) => {
        let finalTranscript = '';
        let interim = '';

        for (let i = event.resultIndex; i < event.results.length; i++) {
          const result = event.results[i];
          if (result.isFinal) {
            finalTranscript += result[0].transcript;
          } else {
            interim += result[0].transcript;
          }
        }

        if (finalTranscript) {
          setTranscript(prev => prev + finalTranscript);
          const confidence = event.results[event.resultIndex][0].confidence;
          
          const voiceResult: VoiceCommandResult = {
            transcript: finalTranscript.trim(),
            confidence,
            timestamp: new Date()
          };
          
          console.log('[VoiceCommand] Final result:', voiceResult);
          onResult?.(voiceResult);
        }

        setInterimTranscript(interim);
      };

      recognition.onerror = (event: SpeechRecognitionErrorEvent) => {
        console.error('[VoiceCommand] Recognition error:', event.error);
        
        switch (event.error) {
          case 'not-allowed':
            handleError('permission_denied', 'Microphone access denied.');
            break;
          case 'network':
            handleError('network_error', 'Network error during speech recognition.');
            break;
          case 'no-speech':
            updateState('idle');
            break;
          default:
            handleError('unknown', `Speech recognition error: ${event.error}`);
        }
      };

      recognition.onend = () => {
        console.log('[VoiceCommand] Stopped listening');
        if (state === 'listening') {
          updateState('idle');
        }
        recognitionRef.current = null;
      };

      recognition.onspeechend = () => {
        console.log('[VoiceCommand] Speech ended');
      };

      recognitionRef.current = recognition;
      recognition.start();

      timeoutRef.current = setTimeout(() => {
        stopListening();
      }, maxDuration);

    } catch (err) {
      console.error('[VoiceCommand] Start error:', err);
      handleError('unknown', 'Failed to start voice recognition.');
    }
  }, [isSupported, checkPermission, interimResults, language, maxDuration, updateState, handleError, onResult, state]);

  const stopListening = useCallback(() => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }

    if (recognitionRef.current) {
      try {
        recognitionRef.current.stop();
      } catch (err) {
        console.log('[VoiceCommand] Stop error (may be already stopped):', err);
      }
    }

    if (state === 'listening') {
      updateState('idle');
    }
  }, [state, updateState]);

  const cancelListening = useCallback(() => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }

    if (recognitionRef.current) {
      try {
        recognitionRef.current.abort();
      } catch (err) {
        console.log('[VoiceCommand] Abort error:', err);
      }
      recognitionRef.current = null;
    }

    setTranscript('');
    setInterimTranscript('');
    updateState('idle');
  }, [updateState]);

  const handleLongPressStart = useCallback(() => {
    if (!isTouchDevice && !isMobile) return;
    
    isLongPressingRef.current = true;
    
    longPressTimerRef.current = setTimeout(() => {
      if (isLongPressingRef.current) {
        console.log('[VoiceCommand] Long press detected, starting voice command');
        if ('vibrate' in navigator) {
          navigator.vibrate(50);
        }
        startListening();
      }
    }, 500);
  }, [isTouchDevice, isMobile, startListening]);

  const handleLongPressEnd = useCallback(() => {
    isLongPressingRef.current = false;
    
    if (longPressTimerRef.current) {
      clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }

    if (state === 'listening') {
      stopListening();
    }
  }, [state, stopListening]);

  const handleTap = useCallback(() => {
    if (state === 'idle') {
      startListening();
    } else if (state === 'listening') {
      stopListening();
    }
  }, [state, startListening, stopListening]);

  useEffect(() => {
    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
      if (longPressTimerRef.current) {
        clearTimeout(longPressTimerRef.current);
      }
      if (recognitionRef.current) {
        try {
          recognitionRef.current.abort();
        } catch {}
      }
    };
  }, []);

  return {
    state,
    transcript,
    interimTranscript,
    hasPermission,
    isSupported,
    isListening: state === 'listening',
    isProcessing: state === 'processing',
    startListening,
    stopListening,
    cancelListening,
    handleLongPressStart,
    handleLongPressEnd,
    handleTap,
    checkPermission,
  };
}
