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

export function useVoiceCommand(options: UseVoiceCommandOptions = {}) {
  const {
    onResult,
    onError,
    onStateChange,
    maxDuration = 30000,
  } = options;

  const [state, setState] = useState<VoiceCommandState>('idle');
  const [transcript, setTranscript] = useState<string>('');
  const [interimTranscript, setInterimTranscript] = useState<string>('');
  const [hasPermission, setHasPermission] = useState<boolean | null>(null);
  const [isSupported, setIsSupported] = useState<boolean>(true);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const streamRef = useRef<MediaStream | null>(null);
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
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      setIsSupported(false);
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
      setHasPermission(false);
      if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError') {
        handleError('permission_denied', 'Microphone permission denied. Please allow access to use voice commands.');
      } else {
        handleError('unknown', 'Failed to access microphone.');
      }
      return false;
    }
  }, [updateState, handleError]);

  const uploadAndTranscribe = useCallback(async (audioBlob: Blob): Promise<void> => {
    try {
      updateState('processing');
      setInterimTranscript('Transcribing...');

      const formData = new FormData();
      const mimeType = audioBlob.type || 'audio/webm';
      const ext = mimeType.includes('mp4') || mimeType.includes('m4a') ? 'm4a'
        : mimeType.includes('ogg') ? 'ogg'
        : mimeType.includes('wav') ? 'wav'
        : 'webm';
      formData.append('audio', audioBlob, `recording.${ext}`);

      const response = await fetch('/api/voice/transcribe', {
        method: 'POST',
        body: formData,
        credentials: 'include',
      });

      if (!response.ok) {
        const err = await response.json().catch(() => ({}));
        throw new Error(err.error || `Server error ${response.status}`);
      }

      const data = await response.json();
      const finalTranscript = (data.transcript || '').trim();
      setInterimTranscript('');

      if (!finalTranscript) {
        updateState('idle');
        return;
      }

      setTranscript(finalTranscript);
      updateState('success');

      onResult?.({
        transcript: finalTranscript,
        confidence: data.confidence ?? 0.9,
        timestamp: new Date(),
      });
    } catch (err: any) {
      console.error('[VoiceCommand] transcription error:', err.message);
      setInterimTranscript('');
      handleError('network_error', 'Transcription failed. Please try again.');
    }
  }, [updateState, onResult, handleError]);

  const startListening = useCallback(async () => {
    if (!isSupported) {
      handleError('not_supported', 'Microphone not supported in this browser.');
      return;
    }

    const permitted = await checkPermission();
    if (!permitted) return;

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      chunksRef.current = [];

      const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
        ? 'audio/webm;codecs=opus'
        : MediaRecorder.isTypeSupported('audio/webm')
        ? 'audio/webm'
        : MediaRecorder.isTypeSupported('audio/mp4')
        ? 'audio/mp4'
        : '';

      const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
      mediaRecorderRef.current = recorder;

      recorder.ondataavailable = (e) => {
        if (e.data && e.data.size > 0) {
          chunksRef.current.push(e.data);
        }
      };

      recorder.onstop = async () => {
        stream.getTracks().forEach(t => t.stop());
        streamRef.current = null;

        if (chunksRef.current.length === 0) {
          updateState('idle');
          return;
        }

        const blob = new Blob(chunksRef.current, { type: recorder.mimeType || 'audio/webm' });
        chunksRef.current = [];

        if (blob.size < 1000) {
          updateState('idle');
          setInterimTranscript('');
          return;
        }

        await uploadAndTranscribe(blob);
      };

      recorder.onerror = () => {
        handleError('unknown', 'Recording failed. Please try again.');
      };

      recorder.start(200);
      updateState('listening');
      setTranscript('');
      setInterimTranscript('Recording...');

      timeoutRef.current = setTimeout(() => {
        stopListening();
      }, maxDuration);

    } catch (err: any) {
      console.error('[VoiceCommand] start error:', err.message);
      if (err.name === 'NotAllowedError') {
        handleError('permission_denied', 'Microphone permission denied.');
      } else {
        handleError('unknown', 'Failed to start recording.');
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isSupported, checkPermission, maxDuration, updateState, handleError, uploadAndTranscribe]);

  const stopListening = useCallback(() => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }

    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      try {
        mediaRecorderRef.current.stop();
      } catch {}
    }

    if (streamRef.current) {
      streamRef.current.getTracks().forEach(t => t.stop());
      streamRef.current = null;
    }
  }, []);

  const cancelListening = useCallback(() => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }

    chunksRef.current = [];

    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      try {
        mediaRecorderRef.current.ondataavailable = null;
        mediaRecorderRef.current.onstop = null;
        mediaRecorderRef.current.stop();
      } catch {}
    }

    if (streamRef.current) {
      streamRef.current.getTracks().forEach(t => t.stop());
      streamRef.current = null;
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
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
      if (longPressTimerRef.current) clearTimeout(longPressTimerRef.current);
      cancelListening();
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
