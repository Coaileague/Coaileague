import { useState, useCallback, useEffect, useRef } from 'react';
import { useMutation } from '@tanstack/react-query';
import { ChevronDown, Check, Loader2, ChevronRight, X } from 'lucide-react';
import { Button } from '@/components/ui/button';

export interface IntakeStep {
  id: string;
  question: string;
  subtext?: string;
  widgetType: string;
  fieldId: string;
  required: boolean;
  options?: string[];
  placeholder?: string;
  validation?: {
    minLength?: number;
    maxLength?: number;
    pattern?: string;
    min?: number;
    max?: number;
  };
  skipIf?: {
    fieldId: string;
    value: string | boolean;
  };
}

export interface ActiveIntakeSession {
  sessionId: string;
  step: IntakeStep;
  stepIndex: number;
  totalSteps: number;
  greeting?: string;
  flowTitle: string;
}

interface TrinityIntakeWidgetProps {
  session: ActiveIntakeSession;
  onComplete: (data: { complete: boolean; nextStep?: IntakeStep; nextStepIndex?: number; completionMessage?: string }) => void;
  onAbandon: () => void;
}

export function TrinityIntakeWidget({ session, onComplete, onAbandon }: TrinityIntakeWidgetProps) {
  const { sessionId, step, stepIndex, totalSteps, greeting, flowTitle } = session;
  const [value, setValue] = useState<string>('');
  const [error, setError] = useState<string>('');
  const inputRef = useRef<HTMLInputElement | HTMLTextAreaElement | null>(null);

  useEffect(() => {
    setValue('');
    setError('');
    setTimeout(() => (inputRef.current as HTMLInputElement | null)?.focus?.(), 50);
  }, [step.fieldId]);

  const respondMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch(`/api/trinity/intake/${sessionId}/respond`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ fieldId: step.fieldId, value, stepIndex })
      });
      if (!res.ok) throw new Error('Response failed');
      return res.json();
    },
    onSuccess: (data) => {
      onComplete(data);
    },
    onError: () => {
      setError('Something went wrong. Please try again.');
    }
  });

  const abandonMutation = useMutation({
    mutationFn: async () => {
      await fetch(`/api/trinity/intake/${sessionId}/abandon`, {
        method: 'POST',
        credentials: 'include'
      });
    },
    onSuccess: onAbandon
  });

  const validate = useCallback((): boolean => {
    if (step.required && (!value || value.trim() === '')) {
      setError('This field is required.');
      return false;
    }
    if (step.validation?.minLength && value.length < step.validation.minLength) {
      setError(`Must be at least ${step.validation.minLength} characters.`);
      return false;
    }
    if (step.validation?.min !== undefined && parseFloat(value) < step.validation.min) {
      setError(`Minimum value is ${step.validation.min}.`);
      return false;
    }
    if (step.validation?.max !== undefined && parseFloat(value) > step.validation.max) {
      setError(`Maximum value is ${step.validation.max}.`);
      return false;
    }
    setError('');
    return true;
  }, [value, step]);

  const handleSubmit = useCallback(() => {
    if (validate()) respondMutation.mutate();
  }, [validate, respondMutation]);

  const handleSkip = useCallback(() => {
    if (!step.required) {
      setValue('');
      respondMutation.mutate();
    }
  }, [step.required, respondMutation]);

  const baseInputClass =
    'w-full rounded-md border bg-background text-foreground text-sm px-3 py-2.5 ' +
    'focus:outline-none focus:ring-2 focus:ring-ring placeholder:text-muted-foreground ' +
    (error ? 'border-destructive' : 'border-border');

  const renderInput = () => {
    switch (step.widgetType) {
      case 'select':
        return (
          <div className="relative">
            <select
              value={value}
              onChange={e => { setValue(e.target.value); setError(''); }}
              className={baseInputClass + ' appearance-none cursor-pointer pr-8'}
              data-testid={`intake-select-${step.fieldId}`}
            >
              <option value="">Select an option...</option>
              {step.options?.map(opt => (
                <option key={opt} value={opt}>{opt}</option>
              ))}
            </select>
            <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
          </div>
        );

      case 'radio':
        return (
          <div className="space-y-2">
            {step.options?.map(opt => (
              <button
                key={opt}
                type="button"
                onClick={() => { setValue(opt); setError(''); }}
                data-testid={`intake-radio-${step.fieldId}-${opt.slice(0, 10)}`}
                className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-md border text-sm text-left transition-colors ${
                  value === opt
                    ? 'border-ring bg-accent text-accent-foreground'
                    : 'border-border bg-background text-foreground hover-elevate'
                }`}
              >
                <div className={`h-4 w-4 rounded-full border-2 flex items-center justify-center shrink-0 ${
                  value === opt ? 'border-ring' : 'border-muted-foreground'
                }`}>
                  {value === opt && <div className="h-2 w-2 rounded-full bg-ring" />}
                </div>
                <span>{opt}</span>
              </button>
            ))}
          </div>
        );

      case 'textarea':
        return (
          <textarea
            ref={inputRef as React.RefObject<HTMLTextAreaElement>}
            value={value}
            onChange={e => { setValue(e.target.value); setError(''); }}
            placeholder={step.placeholder}
            rows={4}
            className={baseInputClass + ' resize-none'}
            data-testid={`intake-textarea-${step.fieldId}`}
          />
        );

      case 'date':
        return (
          <input
            type="date"
            value={value}
            onChange={e => { setValue(e.target.value); setError(''); }}
            className={baseInputClass}
            data-testid={`intake-date-${step.fieldId}`}
          />
        );

      case 'number':
        return (
          <input
            ref={inputRef as React.RefObject<HTMLInputElement>}
            type="number"
            value={value}
            onChange={e => { setValue(e.target.value); setError(''); }}
            placeholder={step.placeholder}
            min={step.validation?.min}
            max={step.validation?.max}
            step="0.5"
            className={baseInputClass}
            data-testid={`intake-number-${step.fieldId}`}
          />
        );

      case 'phone':
        return (
          <input
            ref={inputRef as React.RefObject<HTMLInputElement>}
            type="tel"
            value={value}
            onChange={e => { setValue(e.target.value); setError(''); }}
            placeholder={step.placeholder || '(xxx) xxx-xxxx'}
            className={baseInputClass}
            data-testid={`intake-phone-${step.fieldId}`}
          />
        );

      case 'email':
        return (
          <input
            ref={inputRef as React.RefObject<HTMLInputElement>}
            type="email"
            value={value}
            onChange={e => { setValue(e.target.value); setError(''); }}
            placeholder={step.placeholder || 'email@example.com'}
            className={baseInputClass}
            data-testid={`intake-email-${step.fieldId}`}
          />
        );

      default:
        return (
          <input
            ref={inputRef as React.RefObject<HTMLInputElement>}
            type="text"
            value={value}
            onChange={e => { setValue(e.target.value); setError(''); }}
            placeholder={step.placeholder}
            className={baseInputClass}
            onKeyDown={e => { if (e.key === 'Enter') handleSubmit(); }}
            data-testid={`intake-text-${step.fieldId}`}
          />
        );
    }
  };

  return (
    <div className="my-3 flex items-start gap-2.5" data-testid="trinity-intake-widget">
      {/* Trinity avatar */}
      <div className="h-7 w-7 rounded-full bg-primary flex items-center justify-center shrink-0 mt-0.5">
        <span className="text-primary-foreground text-xs font-bold">T</span>
      </div>

      {/* Card */}
      <div className="flex-1 max-w-sm">
        {/* Greeting — only on first step */}
        {greeting && stepIndex === 0 && (
          <div className="bg-card border border-border rounded-md px-3 py-2.5 mb-2 text-sm text-foreground leading-relaxed">
            {greeting}
          </div>
        )}

        <div className="bg-card border border-border rounded-md px-3 py-3">
          {/* Header */}
          <div className="flex items-center justify-between mb-2.5 gap-2">
            <div className="flex items-center gap-2 min-w-0">
              <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide truncate">
                {flowTitle}
              </span>
            </div>
            <button
              type="button"
              onClick={() => abandonMutation.mutate()}
              disabled={abandonMutation.isPending}
              className="text-muted-foreground hover-elevate rounded-md p-0.5 shrink-0"
              data-testid="button-intake-abandon"
              title="Cancel"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>

          {/* Progress bar */}
          <div className="flex items-center gap-1.5 mb-3">
            <div className="flex gap-1 flex-1">
              {Array.from({ length: totalSteps }).map((_, i) => (
                <div
                  key={i}
                  className={`h-1 rounded-full flex-1 transition-colors ${
                    i < stepIndex
                      ? 'bg-primary'
                      : i === stepIndex
                      ? 'bg-primary opacity-70'
                      : 'bg-muted'
                  }`}
                />
              ))}
            </div>
            <span className="text-xs text-muted-foreground shrink-0">
              {stepIndex + 1}/{totalSteps}
            </span>
          </div>

          {/* Question */}
          <p className="text-sm font-medium text-foreground mb-1">
            {step.question}
          </p>
          {step.subtext && (
            <p className="text-xs text-muted-foreground mb-2.5">{step.subtext}</p>
          )}

          {/* Input */}
          <div className="mb-3">
            {renderInput()}
            {error && (
              <p className="text-xs text-destructive mt-1" data-testid="intake-error">{error}</p>
            )}
          </div>

          {/* Actions */}
          <div className="flex gap-2 items-center">
            <Button
              size="default"
              onClick={handleSubmit}
              disabled={respondMutation.isPending}
              className="flex-1"
              data-testid="button-intake-continue"
            >
              {respondMutation.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <>
                  Continue
                  <ChevronRight className="h-4 w-4 ml-1" />
                </>
              )}
            </Button>

            {!step.required && (
              <button
                type="button"
                onClick={handleSkip}
                disabled={respondMutation.isPending}
                className="text-xs text-muted-foreground hover-elevate px-2 py-1 rounded-md"
                data-testid="button-intake-skip"
              >
                Skip
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

interface TrinityIntakeCompletedProps {
  message: string;
}

export function TrinityIntakeCompleted({ message }: TrinityIntakeCompletedProps) {
  return (
    <div className="my-3 flex items-start gap-2.5" data-testid="trinity-intake-completed">
      <div className="h-7 w-7 rounded-full bg-primary flex items-center justify-center shrink-0 mt-0.5">
        <span className="text-primary-foreground text-xs font-bold">T</span>
      </div>
      <div className="bg-card border border-border rounded-md px-3 py-2.5 max-w-sm">
        <div className="flex items-center gap-2 mb-1">
          <Check className="h-4 w-4 text-green-500 shrink-0" />
          <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
            Trinity
          </span>
        </div>
        <p className="text-sm text-foreground">{message}</p>
      </div>
    </div>
  );
}
