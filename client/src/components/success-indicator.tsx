import { useState, useEffect } from "react";
import { Check, Sparkles } from "lucide-react";

interface SuccessIndicatorProps {
  show: boolean;
  message?: string;
  duration?: number;
  onComplete?: () => void;
  variant?: 'saved' | 'success' | 'celebrate';
}

export function SuccessIndicator({ 
  show, 
  message = "Saved", 
  duration = 2500,
  onComplete,
  variant = 'saved'
}: SuccessIndicatorProps) {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (show) {
      setVisible(true);
      const timer = setTimeout(() => {
        setVisible(false);
        onComplete?.();
      }, duration);
      return () => clearTimeout(timer);
    }
  }, [show, duration, onComplete]);

  if (!visible) return null;

  if (variant === 'celebrate') {
    const confettiColors = ['#f59e0b', '#10b981', '#3b82f6', '#ec4899', '#8b5cf6', '#06b6d4'];
    const confettiOffsets = [-18, -10, -2, 6, 14, 22];
    
    return (
      <div className="fixed bottom-5 right-5 z-[9999]" data-testid="success-indicator-celebrate">
        <div className="relative">
          {confettiColors.map((color, i) => (
            <span
              key={i}
              className="absolute h-2 w-2 rounded-full animate-celebrate-confetti"
              style={{
                backgroundColor: color,
                left: `${confettiOffsets[i]}px`,
                animationDelay: `${i * 0.1}s`,
              }}
            />
          ))}
          <div className="flex items-center gap-2 bg-gradient-to-r from-purple-500 to-pink-500 text-white px-5 py-3 rounded-xl shadow-lg animate-success-pop">
            <Sparkles className="h-5 w-5 animate-sparkles-combined" />
            <span className="font-semibold">{message}</span>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div 
      className="fixed bottom-5 right-5 z-[9999]" 
      data-testid={`success-indicator-${variant}`}
    >
      <div className="flex items-center gap-2 bg-gradient-to-r from-green-500 to-emerald-500 text-white px-5 py-3 rounded-xl shadow-lg animate-saved-fade">
        <div className="relative">
          <div className="absolute inset-0 rounded-full bg-white/20 animate-success-ripple" />
          <Check className="h-5 w-5 animate-check-bounce relative z-10" />
        </div>
        <span className="font-medium">{message}</span>
      </div>
    </div>
  );
}

export function useSuccessIndicator() {
  const [state, setState] = useState<{
    show: boolean;
    message: string;
    variant: 'saved' | 'success' | 'celebrate';
  }>({ show: false, message: 'Saved', variant: 'saved' });

  const showSuccess = (message = 'Saved', variant: 'saved' | 'success' | 'celebrate' = 'saved') => {
    setState({ show: true, message, variant });
  };

  const hideSuccess = () => {
    setState(prev => ({ ...prev, show: false }));
  };

  const SuccessIndicatorComponent = () => (
    <SuccessIndicator 
      show={state.show} 
      message={state.message} 
      variant={state.variant}
      onComplete={hideSuccess}
    />
  );

  return { showSuccess, hideSuccess, SuccessIndicator: SuccessIndicatorComponent };
}
