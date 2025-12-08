/**
 * MobileVoiceCommandOverlay - Voice command interface for mobile Trinity interaction
 * 
 * Provides a touch-activated voice recording UI that allows mobile users to:
 * - Tap to start/stop recording
 * - Hold to record continuously
 * - See real-time transcription feedback
 * - Submit commands to the AI orchestration system
 */

import { useCallback, useEffect, useState, useMemo } from 'react';
import { useVoiceCommand, VoiceCommandResult, VoiceCommandError } from '@/hooks/use-voice-command';
import { useIsMobile } from '@/hooks/use-mobile';
import { useAuth } from '@/hooks/useAuth';
import { useToast } from '@/hooks/use-toast';
import { apiRequest, queryClient } from '@/lib/queryClient';
import { Mic, MicOff, X, Loader2, Send, AlertCircle, CheckCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { motion, AnimatePresence } from 'framer-motion';

interface MobileVoiceCommandOverlayProps {
  isOpen: boolean;
  onClose: () => void;
  onModeChange?: (mode: 'LISTENING' | 'THINKING' | 'SUCCESS' | 'ERROR' | 'IDLE') => void;
}

type SubmissionState = 'idle' | 'submitting' | 'success' | 'error';

export function MobileVoiceCommandOverlay({ 
  isOpen, 
  onClose,
  onModeChange 
}: MobileVoiceCommandOverlayProps) {
  const isMobile = useIsMobile();
  // Safe defaults for mobile properties since we don't require ResponsiveAppFrame context
  const safeAreaBottom = useMemo(() => {
    // Check for iOS safe area
    if (typeof window !== 'undefined') {
      const computed = getComputedStyle(document.documentElement);
      const safeBottom = computed.getPropertyValue('--sab');
      if (safeBottom) return parseInt(safeBottom) || 0;
    }
    return 0;
  }, []);
  const isIOS = useMemo(() => {
    if (typeof navigator === 'undefined') return false;
    return /iPad|iPhone|iPod/.test(navigator.userAgent);
  }, []);
  
  const { user } = useAuth();
  const { toast } = useToast();
  const [finalTranscript, setFinalTranscript] = useState('');
  const [submissionState, setSubmissionState] = useState<SubmissionState>('idle');
  const [errorMessage, setErrorMessage] = useState('');

  const handleResult = useCallback((result: VoiceCommandResult) => {
    console.log('[VoiceOverlay] Received result:', result);
    setFinalTranscript(prev => {
      const newTranscript = prev ? `${prev} ${result.transcript}` : result.transcript;
      return newTranscript.trim();
    });
  }, []);

  const handleError = useCallback((error: VoiceCommandError) => {
    console.error('[VoiceOverlay] Error:', error);
    setErrorMessage(error.message);
    onModeChange?.('ERROR');
    toast({
      title: 'Voice Command Error',
      description: error.message,
      variant: 'destructive',
    });
  }, [onModeChange, toast]);

  const handleStateChange = useCallback((state: string) => {
    console.log('[VoiceOverlay] State changed:', state);
    switch (state) {
      case 'listening':
        onModeChange?.('LISTENING');
        break;
      case 'processing':
        onModeChange?.('THINKING');
        break;
      case 'success':
        onModeChange?.('SUCCESS');
        break;
      case 'error':
        onModeChange?.('ERROR');
        break;
      default:
        onModeChange?.('IDLE');
    }
  }, [onModeChange]);

  const {
    state,
    transcript: liveTranscript,
    interimTranscript,
    isSupported,
    isListening,
    startListening,
    stopListening,
    cancelListening,
  } = useVoiceCommand({
    onResult: handleResult,
    onError: handleError,
    onStateChange: handleStateChange,
    language: 'en-US',
    maxDuration: 60000,
    interimResults: true,
  });

  const displayTranscript = finalTranscript || liveTranscript || interimTranscript;

  const handleSubmitCommand = useCallback(async () => {
    if (!finalTranscript.trim()) {
      toast({
        title: 'No command detected',
        description: 'Please speak a command first.',
        variant: 'destructive',
      });
      return;
    }

    setSubmissionState('submitting');
    onModeChange?.('THINKING');

    try {
      const response = await apiRequest('POST', '/api/voice-command', {
        transcript: finalTranscript.trim(),
        timestamp: new Date().toISOString(),
        source: 'mobile_trinity',
      });

      setSubmissionState('success');
      onModeChange?.('SUCCESS');
      
      toast({
        title: 'Command Submitted',
        description: 'Trinity is processing your request...',
      });

      queryClient.invalidateQueries({ queryKey: ['/api/workboard'] });

      setTimeout(() => {
        setFinalTranscript('');
        setSubmissionState('idle');
        onClose();
      }, 1500);

    } catch (error: any) {
      console.error('[VoiceOverlay] Submit error:', error);
      setSubmissionState('error');
      onModeChange?.('ERROR');
      setErrorMessage(error.message || 'Failed to submit command');
      
      toast({
        title: 'Submission Failed',
        description: error.message || 'Failed to submit voice command',
        variant: 'destructive',
      });
    }
  }, [finalTranscript, onModeChange, onClose, toast]);

  const handleClose = useCallback(() => {
    if (isListening) {
      cancelListening();
    }
    setFinalTranscript('');
    setErrorMessage('');
    setSubmissionState('idle');
    onModeChange?.('IDLE');
    onClose();
  }, [isListening, cancelListening, onModeChange, onClose]);

  const handleMicPress = useCallback(() => {
    if (isListening) {
      stopListening();
    } else {
      setErrorMessage('');
      startListening();
    }
  }, [isListening, startListening, stopListening]);

  useEffect(() => {
    if (!isOpen) {
      setFinalTranscript('');
      setErrorMessage('');
      setSubmissionState('idle');
    }
  }, [isOpen]);

  if (!isMobile) return null;

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ opacity: 0, y: 100 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 100 }}
          transition={{ type: 'spring', damping: 25, stiffness: 300 }}
          className="fixed inset-x-0 bottom-0 z-[9999] bg-background/95 backdrop-blur-xl border-t rounded-t-3xl shadow-2xl"
          style={{ 
            paddingBottom: Math.max(safeAreaBottom, 16),
            maxHeight: '70vh'
          }}
          data-testid="voice-command-overlay"
        >
          <div className="flex flex-col h-full p-4 gap-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-full bg-primary/20 flex items-center justify-center">
                  <Mic className="w-4 h-4 text-primary" />
                </div>
                <div>
                  <h3 className="font-semibold text-sm">Voice Command</h3>
                  <p className="text-xs text-muted-foreground">
                    {!isSupported 
                      ? 'Not supported in this browser' 
                      : isListening 
                        ? 'Listening...' 
                        : 'Tap mic to start'
                    }
                  </p>
                </div>
              </div>
              
              <Button
                variant="ghost"
                size="icon"
                onClick={handleClose}
                className="h-8 w-8"
                data-testid="button-close-voice-overlay"
              >
                <X className="h-4 w-4" />
              </Button>
            </div>

            <div className="flex-1 min-h-[80px] max-h-[200px] overflow-y-auto bg-muted/50 rounded-xl p-4">
              {errorMessage ? (
                <div className="flex items-start gap-2 text-destructive">
                  <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />
                  <p className="text-sm">{errorMessage}</p>
                </div>
              ) : displayTranscript ? (
                <p className="text-sm leading-relaxed" data-testid="text-voice-transcript">
                  {displayTranscript}
                  {interimTranscript && !finalTranscript && (
                    <span className="text-muted-foreground animate-pulse">
                      {interimTranscript}
                    </span>
                  )}
                </p>
              ) : (
                <p className="text-sm text-muted-foreground italic text-center">
                  {isListening 
                    ? 'Speak now... Trinity is listening' 
                    : 'Tap the microphone to give Trinity a command'
                  }
                </p>
              )}
            </div>

            <div className="flex items-center justify-center gap-4">
              <Button
                variant={isListening ? 'destructive' : 'default'}
                size="lg"
                onClick={handleMicPress}
                disabled={!isSupported || submissionState === 'submitting'}
                className="h-16 w-16 rounded-full"
                data-testid="button-voice-record"
              >
                {isListening ? (
                  <motion.div
                    animate={{ scale: [1, 1.2, 1] }}
                    transition={{ duration: 1, repeat: Infinity }}
                  >
                    <MicOff className="h-6 w-6" />
                  </motion.div>
                ) : (
                  <Mic className="h-6 w-6" />
                )}
              </Button>

              {finalTranscript && !isListening && submissionState !== 'success' && (
                <Button
                  variant="default"
                  size="lg"
                  onClick={handleSubmitCommand}
                  disabled={submissionState === 'submitting'}
                  className="h-12 px-6 gap-2"
                  data-testid="button-submit-voice-command"
                >
                  {submissionState === 'submitting' ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Submitting...
                    </>
                  ) : (
                    <>
                      <Send className="h-4 w-4" />
                      Send to Trinity
                    </>
                  )}
                </Button>
              )}

              {submissionState === 'success' && (
                <motion.div
                  initial={{ scale: 0 }}
                  animate={{ scale: 1 }}
                  className="flex items-center gap-2 text-green-500"
                >
                  <CheckCircle className="h-6 w-6" />
                  <span className="text-sm font-medium">Sent!</span>
                </motion.div>
              )}
            </div>

            {isListening && (
              <div className="flex justify-center">
                <motion.div 
                  className="flex gap-1"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                >
                  {[0, 1, 2, 3, 4].map((i) => (
                    <motion.div
                      key={i}
                      className="w-1 bg-primary rounded-full"
                      animate={{
                        height: [8, 24, 8],
                      }}
                      transition={{
                        duration: 0.5,
                        repeat: Infinity,
                        delay: i * 0.1,
                      }}
                    />
                  ))}
                </motion.div>
              </div>
            )}

            <p className="text-xs text-center text-muted-foreground">
              {isIOS 
                ? 'Voice recognition uses your device\'s speech services' 
                : 'Speak clearly for best results'
              }
            </p>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
