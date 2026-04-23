import { useState, useEffect, useRef, useCallback } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { useToast } from '@/hooks/use-toast';
import { apiRequest, queryClient } from '@/lib/queryClient';

export interface OnboardingSession {
  id: string;
  workspaceId: string;
  status: string;
  currentStep: number;
  completedSteps: number[];
  form1: Record<string, any> | null;
  form2: Record<string, any> | null;
  form3: Record<string, any> | null;
  form4: Record<string, any> | null;
  form5: Record<string, any> | null;
  form6: Record<string, any> | null;
  form7: Record<string, any> | null;
  form8: Record<string, any> | null;
  form9: Record<string, any> | null;
  form10: Record<string, any> | null;
}

interface UseOnboardingFormReturn {
  session: OnboardingSession | null;
  isLoading: boolean;
  currentStep: number;
  completedSteps: number[];
  stepData: Record<string, any>;
  setField: (field: string, value: any) => void;
  goToStep: (step: number) => void;
  submitStep: (step: number) => Promise<{ success: boolean; errors: { field: string; message: string }[] }>;
  finalize: () => Promise<{ pdfUrl: string }>;
  isSubmitting: boolean;
  isFinalizing: boolean;
  lastSavedAt: Date | null;
}

export function useOnboardingForm(onboardingId: string): UseOnboardingFormReturn {
  const { toast } = useToast();
  const [currentStep, setCurrentStep] = useState(1);
  const [completedSteps, setCompletedSteps] = useState<number[]>([]);
  // stepData holds local form state for the current step
  const [stepData, setStepData] = useState<Record<string, any>>({});
  const [lastSavedAt, setLastSavedAt] = useState<Date | null>(null);
  const autoSaveTimer = useRef<ReturnType<typeof setInterval> | null>(null);
  const dirtyRef = useRef(false);

  // ── Load session ────────────────────────────────────────────────────────────
  const { data: session, isLoading } = useQuery<OnboardingSession>({
    queryKey: ['/api/sps/forms', onboardingId],
    queryFn: () => apiRequest('GET', `/api/sps/forms/${onboardingId}`).then(r => r.json()),
    enabled: !!onboardingId,
    staleTime: 0,
  });

  // Sync server state into local state on load
  useEffect(() => {
    if (!session) return;
    setCurrentStep(session.currentStep);
    setCompletedSteps(session.completedSteps ?? []);
    // Pre-populate stepData from the form matching currentStep
    const formKey = `form${session.currentStep}` as keyof OnboardingSession;
    setStepData((session[formKey] as Record<string, any>) ?? {});
  }, [session?.id]); // only on session load, not every render

  // ── Field updates (optimistic) ──────────────────────────────────────────────
  const setField = useCallback((field: string, value: any) => {
    setStepData(prev => ({ ...prev, [field]: value }));
    dirtyRef.current = true;
  }, []);

  // ── Step navigation: loads stored form data for that step ───────────────────
  const goToStep = useCallback((step: number) => {
    if (!session) return;
    setCurrentStep(step);
    const formKey = `form${step}` as keyof OnboardingSession;
    setStepData((session[formKey] as Record<string, any>) ?? {});
    dirtyRef.current = false;
  }, [session]);

  // ── Save draft (silent) ─────────────────────────────────────────────────────
  const saveDraftMutation = useMutation({
    mutationFn: () =>
      apiRequest('PUT', `/api/sps/forms/${onboardingId}/save-draft`, {
        step: currentStep,
        data: stepData,
      }).then(r => r.json()),
    onSuccess: () => {
      setLastSavedAt(new Date());
      dirtyRef.current = false;
    },
    onError: (err) => {
      toast({ variant: 'destructive', title: 'Auto-save failed', description: String(err) });
    },
  });

  // Auto-save every 30 seconds if dirty
  useEffect(() => {
    autoSaveTimer.current = setInterval(() => {
      if (dirtyRef.current && onboardingId) {
        saveDraftMutation.mutate();
      }
    }, 30_000);
    return () => {
      if (autoSaveTimer.current) clearInterval(autoSaveTimer.current);
    };
  }, [onboardingId, currentStep, stepData]); // re-subscribe when step or data changes

  // ── Submit step ─────────────────────────────────────────────────────────────
  const submitStepMutation = useMutation({
    mutationFn: (step: number) =>
      apiRequest('POST', `/api/sps/forms/${onboardingId}/submit-step/${step}`, {
        data: stepData,
      }).then(r => r.json()),
    onSuccess: (result) => {
      if (result.success) {
        setCompletedSteps(result.completedSteps ?? []);
        if (result.nextStep !== currentStep) {
          setCurrentStep(result.nextStep);
          // Pre-populate next step's data
          if (session) {
            const formKey = `form${result.nextStep}` as keyof OnboardingSession;
            setStepData((session[formKey] as Record<string, any>) ?? {});
          }
          queryClient.invalidateQueries({ queryKey: ['/api/sps/forms', onboardingId] });
        }
        dirtyRef.current = false;
      }
    },
  });

  const submitStep = useCallback(async (step: number) => {
    const result = await submitStepMutation.mutateAsync(step);
    return {
      success: result.success ?? false,
      errors: result.errors ?? [],
    };
  }, [submitStepMutation, stepData]);

  // ── Finalize ────────────────────────────────────────────────────────────────
  const finalizeMutation = useMutation({
    mutationFn: () =>
      apiRequest('POST', `/api/sps/forms/${onboardingId}/finalize`).then(r => r.json()),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/sps/forms', onboardingId] });
    },
    onError: (err) => {
      toast({ variant: 'destructive', title: 'Finalization failed', description: String(err) });
    },
  });

  const finalize = useCallback(async () => {
    const result = await finalizeMutation.mutateAsync();
    return { pdfUrl: result.pdf_url ?? '' };
  }, [finalizeMutation]);

  return {
    session: session ?? null,
    isLoading,
    currentStep,
    completedSteps,
    stepData,
    setField,
    goToStep,
    submitStep,
    finalize,
    isSubmitting: submitStepMutation.isPending,
    isFinalizing: finalizeMutation.isPending,
    lastSavedAt,
  };
}
