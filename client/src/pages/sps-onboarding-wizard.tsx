/**
 * SPS 10-Step Employee Onboarding Wizard
 * Route: /sps-forms/:id
 *
 * Orchestrates Step1–Step10 with auto-save, validation, PDF finalization,
 * and Trinity rate-setting (owner/co_owner only).
 */
import { useState, useCallback } from 'react';
import { useParams, useLocation } from 'wouter';
import { useMutation } from '@tanstack/react-query';
import {
  Card, CardContent, CardHeader, CardTitle, CardDescription,
} from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { useToast } from '@/hooks/use-toast';
import { useQuery } from '@tanstack/react-query';
import { apiRequest, queryClient } from '@/lib/queryClient';
import {
  ChevronLeft, ChevronRight, CheckCircle2, Loader2, FileText,
  Shield, DollarSign, AlertCircle, Download,
} from 'lucide-react';
import { useOnboardingForm } from '@/hooks/useOnboardingForm';
import { OnboardingProgressBar } from '@/components/onboarding/sps-forms/shared';
import { Step1_FileChecklist } from '@/components/onboarding/sps-forms/Step1_FileChecklist';
import { Step2_OfferLetter } from '@/components/onboarding/sps-forms/Step2_OfferLetter';
import { Step3_W4 } from '@/components/onboarding/sps-forms/Step3_W4';
import { Step4_I9 } from '@/components/onboarding/sps-forms/Step4_I9';
import { Step5_DirectDeposit } from '@/components/onboarding/sps-forms/Step5_DirectDeposit';
import { Step6_HandbookAck } from '@/components/onboarding/sps-forms/Step6_HandbookAck';
import { Step7_AtWill } from '@/components/onboarding/sps-forms/Step7_AtWill';
import { Step8_Uniform } from '@/components/onboarding/sps-forms/Step8_Uniform';
import { Step9_SecurityPolicy } from '@/components/onboarding/sps-forms/Step9_SecurityPolicy';
import { Step10_CredentialUpload } from '@/components/onboarding/sps-forms/Step10_CredentialUpload';

// ── Step metadata ─────────────────────────────────────────────────────────────
const STEPS = [
  { step: 1, label: 'Personal Info' },
  { step: 2, label: 'Offer Letter' },
  { step: 3, label: 'W-4' },
  { step: 4, label: 'I-9' },
  { step: 5, label: 'Direct Deposit' },
  { step: 6, label: 'Handbook' },
  { step: 7, label: 'At-Will' },
  { step: 8, label: 'Uniform' },
  { step: 9, label: 'Security Policy' },
  { step: 10, label: 'Credentials' },
];

// ── SetRateDialog (owner/co_owner only) ───────────────────────────────────────
function SetRateDialog({
  open,
  onClose,
  onboardingId,
}: {
  open: boolean;
  onClose: () => void;
  onboardingId: string;
}) {
  const { toast } = useToast();
  const [rate, setRate] = useState('');

  const setRateMutation = useMutation({
    mutationFn: (hourlyRate: number) =>
      apiRequest('POST', `/api/sps/forms/${onboardingId}/set-rate`, { hourly_rate: hourlyRate })
        .then(r => r.json()),
    onSuccess: (data) => {
      toast({
        title: 'Hourly rate set',
        description: `Trinity access enabled. Rate visible to employee until ${new Date(data.visible_until).toLocaleString()}.`,
      });
      queryClient.invalidateQueries({ queryKey: ['/api/sps/forms', onboardingId] });
      onClose();
    },
    onError: (err) => {
      toast({ variant: 'destructive', title: 'Failed to set rate', description: String(err) });
    },
  });

  const handleSubmit = () => {
    const parsed = parseFloat(rate);
    if (!parsed || parsed <= 0) {
      toast({ variant: 'destructive', title: 'Invalid rate', description: 'Enter a valid hourly rate greater than $0.00' });
      return;
    }
    setRateMutation.mutate(parsed);
  };

  return (
    <Dialog open={open} onOpenChange={v => { if (!v) onClose(); }}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <DollarSign className="h-5 w-5 text-primary" />
            Set Hourly Rate
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-3 py-2">
          <p className="text-sm text-muted-foreground">
            Setting the hourly rate will enable Trinity scheduling access for this employee.
            The rate will be visible to the employee for <strong>24 hours</strong>.
          </p>
          <div className="space-y-1">
            <Label htmlFor="hourly_rate_input">Hourly Rate (USD)</Label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">$</span>
              <Input
                id="hourly_rate_input"
                type="number"
                min="0.01"
                step="0.01"
                value={rate}
                onChange={e => setRate(e.target.value)}
                className="pl-7"
                placeholder="0.00"
                onKeyDown={e => { if (e.key === 'Enter') handleSubmit(); }}
              />
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={setRateMutation.isPending}>
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={setRateMutation.isPending}>
            {setRateMutation.isPending ? (
              <><Loader2 className="h-4 w-4 animate-spin mr-2" /> Setting…</>
            ) : (
              'Set Rate & Enable Trinity'
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── SuccessScreen ─────────────────────────────────────────────────────────────
function SuccessScreen({
  onboardingId,
  pdfUrl,
  isOwner,
}: {
  onboardingId: string;
  pdfUrl: string;
  isOwner: boolean;
}) {
  const [showRateDialog, setShowRateDialog] = useState(false);
  const { toast } = useToast();

  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] text-center space-y-6 py-12 px-4">
      <div className="rounded-full bg-green-100 p-6">
        <CheckCircle2 className="h-16 w-16 text-green-600" />
      </div>

      <div className="space-y-2">
        <h1 className="text-2xl font-bold text-foreground">Onboarding Complete!</h1>
        <p className="text-muted-foreground max-w-sm">
          All 10 steps have been completed successfully. Your employee packet has been generated.
        </p>
      </div>

      <div className="flex flex-col w-full max-w-xs gap-3">
        {pdfUrl && (
          <Button asChild size="lg" className="w-full">
            <a href={pdfUrl} target="_blank" rel="noopener noreferrer">
              <Download className="h-4 w-4 mr-2" />
              Download PDF Packet
            </a>
          </Button>
        )}
        {!pdfUrl && (
          <Button variant="outline" size="lg" className="w-full" disabled>
            <FileText className="h-4 w-4 mr-2" />
            PDF Generating…
          </Button>
        )}

        {isOwner && (
          <Button
            variant="secondary"
            size="lg"
            className="w-full"
            onClick={() => setShowRateDialog(true)}
          >
            <DollarSign className="h-4 w-4 mr-2" />
            Set Hourly Rate & Enable Trinity
          </Button>
        )}
      </div>

      {isOwner && (
        <p className="text-xs text-muted-foreground max-w-xs">
          Setting the hourly rate enables Trinity scheduling access for this employee.
          The rate will be visible to the employee for 24 hours after it is set.
        </p>
      )}

      <SetRateDialog
        open={showRateDialog}
        onClose={() => setShowRateDialog(false)}
        onboardingId={onboardingId}
      />
    </div>
  );
}

// ── Main Wizard ───────────────────────────────────────────────────────────────
export default function SpsOnboardingWizard() {
  const { id } = useParams<{ id: string }>();
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [pdfUrl, setPdfUrl] = useState('');

  const {
    session,
    isLoading,
    currentStep,
    completedSteps,
    stepData,
    setField,
    goToStep,
    submitStep,
    finalize,
    isSubmitting,
    isFinalizing,
    lastSavedAt,
  } = useOnboardingForm(id ?? '');

  // Derive user role from session
  const { data: me } = useQuery<{ workspaceRole?: string; role?: string }>({
    queryKey: ['/api/auth/me'],
    staleTime: 5 * 60_000,
  });
  const isOwner = ['owner', 'co_owner'].includes(me?.workspaceRole ?? me?.role ?? '');

  const handleNext = useCallback(async () => {
    setFieldErrors({});
    const result = await submitStep(currentStep);
    if (!result.success) {
      const errMap: Record<string, string> = {};
      for (const e of result.errors) errMap[e.field] = e.message;
      setFieldErrors(errMap);
      toast({
        variant: 'destructive',
        title: 'Please fix the highlighted fields',
        description: result.errors.map(e => e.message).join(', '),
      });
    }
  }, [currentStep, submitStep, toast]);

  const handleFinalize = useCallback(async () => {
    try {
      const { pdfUrl: url } = await finalize();
      setPdfUrl(url);
    } catch (err) {
      toast({ variant: 'destructive', title: 'Finalization failed', description: String(err) });
    }
  }, [finalize, toast]);

  const handlePrev = useCallback(() => {
    if (currentStep > 1) goToStep(currentStep - 1);
  }, [currentStep, goToStep]);

  // ── Loading ─────────────────────────────────────────────────────────────────
  if (isLoading || !session) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center space-y-3">
          <Loader2 className="h-8 w-8 animate-spin mx-auto text-primary" />
          <p className="text-muted-foreground text-sm">Loading onboarding session…</p>
        </div>
      </div>
    );
  }

  // ── Completed state ─────────────────────────────────────────────────────────
  if (session.status === 'completed' || pdfUrl) {
    return (
      <div className="min-h-screen bg-background">
        <div className="max-w-2xl mx-auto px-4 py-8">
          <SuccessScreen
            onboardingId={id ?? ''}
            pdfUrl={pdfUrl || ''}
            isOwner={isOwner}
          />
        </div>
      </div>
    );
  }

  // ── Step content ────────────────────────────────────────────────────────────
  const stepProps = { data: stepData, onChange: setField, errors: fieldErrors };
  const isLastStep = currentStep === 10;

  const renderStep = () => {
    switch (currentStep) {
      case 1: return <Step1_FileChecklist {...stepProps} />;
      case 2: return <Step2_OfferLetter {...stepProps} />;
      case 3: return <Step3_W4 {...stepProps} />;
      case 4: return <Step4_I9 {...stepProps} />;
      case 5: return <Step5_DirectDeposit {...stepProps} />;
      case 6: return <Step6_HandbookAck {...stepProps} />;
      case 7: return <Step7_AtWill {...stepProps} />;
      case 8: return <Step8_Uniform {...stepProps} />;
      case 9: return <Step9_SecurityPolicy {...stepProps} />;
      case 10: return <Step10_CredentialUpload {...stepProps} />;
      default: return null;
    }
  };

  const currentMeta = STEPS[currentStep - 1];

  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-2xl mx-auto px-4 py-6 space-y-4">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Shield className="h-5 w-5 text-primary" />
            <span className="font-semibold text-sm">Employee Onboarding</span>
          </div>
          {lastSavedAt && (
            <span className="text-xs text-muted-foreground">
              Saved {lastSavedAt.toLocaleTimeString()}
            </span>
          )}
        </div>

        {/* Progress */}
        <Card>
          <CardContent className="pt-4 pb-3">
            <OnboardingProgressBar
              currentStep={currentStep}
              totalSteps={10}
              completedSteps={completedSteps}
            />
          </CardContent>
        </Card>

        {/* Step navigator (compact, scrollable on mobile) */}
        <div className="flex gap-1.5 overflow-x-auto pb-1 hide-scrollbar">
          {STEPS.map(({ step, label }) => {
            const done = completedSteps.includes(step);
            const active = step === currentStep;
            return (
              <button
                key={step}
                type="button"
                onClick={() => {
                  // Only allow jumping to completed steps or current
                  if (done || step <= currentStep) goToStep(step);
                }}
                className={`flex-shrink-0 px-2.5 py-1.5 rounded-md text-xs font-medium transition-colors ${
                  active
                    ? 'bg-primary text-primary-foreground'
                    : done
                    ? 'bg-primary/10 text-primary hover:bg-primary/20'
                    : 'bg-muted text-muted-foreground cursor-default'
                }`}
              >
                {done && !active && <CheckCircle2 className="inline h-3 w-3 mr-1" />}
                {step}. {label}
              </button>
            );
          })}
        </div>

        {/* Step form card */}
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center gap-2">
              <Badge variant="secondary">{currentStep} / 10</Badge>
              <CardTitle className="text-base">{currentMeta?.label}</CardTitle>
            </div>
          </CardHeader>
          <CardContent>
            {renderStep()}
          </CardContent>
        </Card>

        {/* Navigation */}
        <div className="flex flex-col sm:flex-row gap-3">
          <Button
            variant="outline"
            className="flex-1"
            onClick={handlePrev}
            disabled={currentStep === 1 || isSubmitting || isFinalizing}
          >
            <ChevronLeft className="h-4 w-4 mr-1" />
            Previous
          </Button>

          {isLastStep ? (
            <Button
              className="flex-1"
              onClick={handleFinalize}
              disabled={isFinalizing || isSubmitting}
            >
              {isFinalizing ? (
                <><Loader2 className="h-4 w-4 animate-spin mr-2" /> Generating PDF…</>
              ) : (
                <>
                  <FileText className="h-4 w-4 mr-2" />
                  Complete & Generate PDF
                </>
              )}
            </Button>
          ) : (
            <Button
              className="flex-1"
              onClick={handleNext}
              disabled={isSubmitting || isFinalizing}
            >
              {isSubmitting ? (
                <><Loader2 className="h-4 w-4 animate-spin mr-2" /> Saving…</>
              ) : (
                <>
                  Next
                  <ChevronRight className="h-4 w-4 ml-1" />
                </>
              )}
            </Button>
          )}
        </div>

        {/* Error summary */}
        {Object.keys(fieldErrors).length > 0 && (
          <div className="flex items-start gap-2 text-sm text-red-600 bg-red-50 rounded-lg p-3">
            <AlertCircle className="h-4 w-4 mt-0.5 flex-shrink-0" />
            <span>Please fix the highlighted fields before continuing.</span>
          </div>
        )}
      </div>
    </div>
  );
}
