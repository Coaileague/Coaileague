const PLATFORM_NAME = (import.meta.env.VITE_PLATFORM_NAME as string) || 'CoAIleague';
import { useState } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { useLocation } from 'wouter';
import { queryClient, apiRequest } from '@/lib/queryClient';
import { useToast } from '@/hooks/use-toast';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import {
  Shield, ShieldCheck, BadgeCheck, ChevronRight, ChevronLeft,
  Upload, AlertTriangle, Clock, CheckCircle2, FileText, User, Building2
} from 'lucide-react';

const CREDENTIAL_OPTIONS = [
  {
    id: 'guard_card_unarmed',
    label: 'Unarmed Security Officer',
    sublabel: 'TX DPS – Unarmed Guard Card',
    description: 'Standard unarmed private security officer license issued by the Texas Department of Public Safety.',
    icon: Shield,
    whoFor: 'Security officers who do not carry firearms on duty.',
    color: 'text-blue-400',
  },
  {
    id: 'guard_card_armed',
    label: 'Armed Security Officer',
    sublabel: 'TX DPS – Armed Guard Card',
    description: 'Armed private security officer license. Requires firearms qualification and additional training.',
    icon: Shield,
    whoFor: 'Officers authorized to carry a firearm on duty.',
    color: 'text-red-400',
  },
  {
    id: 'manager_card',
    label: 'Security Manager / Supervisor',
    sublabel: 'TX DPS – Manager Card',
    description: 'Texas DPS Security Manager credential. Allows supervising guard operations and running a licensed security company without being a field officer.',
    icon: BadgeCheck,
    whoFor: 'Owners and managers who supervise guard operations. Common for company owners who don\'t work the field.',
    color: 'text-[#ffc83c]',
  },
  {
    id: 'representative_card',
    label: 'Company Representative / Owner',
    sublabel: 'TX DPS – Representative Card',
    description: 'Owner-designated representative credential issued by TX DPS. Allows an individual to legally represent and conduct business for a licensed security company.',
    icon: Building2,
    whoFor: 'Business owners, company principals, or authorized representatives who hold TX DPS-issued representative credentials.',
    color: 'text-purple-400',
  },
  {
    id: 'owner_operator_license',
    label: 'Owner / Qualifying Agent License',
    sublabel: 'TX DPS – Owner Operator / Qualifying Agent',
    description: 'License held by the qualifying agent of record for the security company. Required to legally operate a licensed private security company in Texas.',
    icon: Building2,
    whoFor: 'The named qualifying agent or principal who holds the company license on behalf of the organization.',
    color: 'text-green-400',
  },
];

const STEP_LABELS = ['Your Role', 'Credential Type', 'Card Details', 'Review & Submit'];

export default function RegulatoryEnrollmentPage() {
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const [step, setStep] = useState(0);
  const [selected, setSelected] = useState<string>('');
  const [form, setForm] = useState({
    cardNumber: '',
    issuingState: 'TX',
    issuingAgency: 'TX DPS',
    expirationDate: '',
    fileUrl: '',
    notes: '',
  });

  const { data, isLoading } = useQuery<any>({
    queryKey: ['/api/compliance/enrollment/status'],
  });

  const submitMutation = useMutation({
    mutationFn: (payload) => apiRequest('POST', '/api/compliance/enrollment/submit', payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/compliance/enrollment/status'] });
      queryClient.invalidateQueries({ queryKey: ['/api/compliance/enrollment/workspace'] });
      toast({ title: 'Credential submitted', description: 'Your submission is under review.' });
      navigate('/security-compliance');
    },
    onError: (e) => {
      toast({ title: 'Submission failed', description: e.message, variant: 'destructive' });
    },
  });

  const statusData = data?.data;
  const alreadySubmitted = statusData?.enrollment?.status && statusData.enrollment.status !== 'rejected';
  const deadline = statusData?.deadline ? new Date(statusData.deadline) : null;
  const daysRemaining = statusData?.daysRemaining ?? null;
  const isOverdue = statusData?.isOverdue ?? false;

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[#ffc83c]" />
      </div>
    );
  }

  if (alreadySubmitted && statusData?.enrollment?.status === 'approved') {
    return (
      <div className="max-w-2xl mx-auto p-6">
        <Card>
          <CardContent className="pt-8 pb-8 flex flex-col items-center gap-4 text-center">
            <CheckCircle2 className="w-14 h-14 text-green-400" />
            <CardTitle className="text-xl">Enrollment Complete</CardTitle>
            <CardDescription className="max-w-sm">
              Your {CREDENTIAL_OPTIONS.find(c => c.id === statusData.enrollment?.credentialType)?.label} has been verified and approved.
            </CardDescription>
            <Badge variant="outline" className="text-green-400 border-green-400/40">
              Approved
            </Badge>
            <Button variant="outline" onClick={() => navigate('/security-compliance')} data-testid="button-back-compliance">
              Back to Compliance
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  const selectedOption = CREDENTIAL_OPTIONS.find(c => c.id === selected);

  function handleSubmit() {
    if (!selected) return;
    submitMutation.mutate({
      credentialType: selected,
      cardNumber: form.cardNumber || undefined,
      issuingState: form.issuingState,
      issuingAgency: form.issuingAgency,
      expirationDate: form.expirationDate || undefined,
      fileUrl: form.fileUrl || undefined,
      notes: form.notes || undefined,
    });
  }

  return (
    <div className="max-w-3xl mx-auto px-4 sm:px-6 pt-4 sm:pt-6 pb-28 sm:pb-8 space-y-6">
      {/* Header */}
      <div className="space-y-1">
        <div className="flex items-center gap-2">
          <ShieldCheck className="w-6 h-6 text-[#ffc83c]" />
          <h1 className="text-xl font-semibold text-foreground">Regulatory Credential Enrollment</h1>
        </div>
        <p className="text-sm text-muted-foreground">
          All {PLATFORM_NAME} org members must submit a valid TX DPS operator credential.
          This is required by state law to operate as a licensed security company.
        </p>
      </div>

      {/* Deadline alert */}
      {deadline && (
        <div className={['flex items-start gap-3 rounded-md p-3 border text-sm', isOverdue ? 'border-red-700/50 bg-red-950/30 text-red-300'
          : daysRemaining <= 7 ? 'border-amber-700/50 bg-amber-950/30 text-amber-300'
          : 'border-[#ffc83c]/30 bg-[#ffc83c]/5 text-[#ffc83c]/80'].join(' ')}>
          <Clock className="w-4 h-4 mt-0.5 shrink-0" />
          <div>
            {isOverdue
              ? `Submission deadline passed on ${deadline.toLocaleDateString()}. Submit immediately to avoid compliance violations.`
              : `Deadline: ${deadline.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })} — ${daysRemaining} day${daysRemaining === 1 ? '' : 's'} remaining.`
            }
          </div>
        </div>
      )}

      {/* Stepper */}
      <div className="flex items-center gap-2" data-testid="enrollment-stepper">
        {STEP_LABELS.map((label, i) => (
          <div key={i} className="flex items-center gap-2 flex-1">
            <div className={['flex items-center justify-center w-6 h-6 rounded-full text-xs font-semibold shrink-0', i < step ? 'bg-[#ffc83c] text-[#0f172a]'
              : i === step ? 'bg-[#ffc83c]/20 text-[#ffc83c] border border-[#ffc83c]/50'
              : 'bg-muted text-muted-foreground'].join(' ')}>
              {i < step ? <CheckCircle2 className="w-3.5 h-3.5" /> : i + 1}
            </div>
            <span className={`text-xs hidden sm:inline ${i === step ? 'text-foreground font-medium' : 'text-muted-foreground'}`}>
              {label}
            </span>
            {i < STEP_LABELS.length - 1 && (
              <div className={['h-px flex-1', i < step ? 'bg-[#ffc83c]/40' : 'bg-border'].join(' ')} />
            )}
          </div>
        ))}
      </div>

      {/* Step 0 — Who are you */}
      {step === 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <User className="w-4 h-4 text-[#ffc83c]" />
              About Your Role
            </CardTitle>
            <CardDescription>
              {PLATFORM_NAME} requires every member of a security company — including owners — to hold a state-issued credential.
              Not every owner is a field officer. Texas DPS issues multiple credential types to cover all roles.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-3">
              {[
                { icon: Shield, title: 'Field Officers', desc: 'Hold an armed or unarmed guard card issued by TX DPS.' },
                { icon: BadgeCheck, title: 'Managers / Supervisors', desc: 'May hold a TX DPS Manager Card instead of a guard card.' },
                { icon: Building2, title: 'Owners / Company Principals', desc: 'May hold a Manager Card, Representative Card, or Owner Operator License issued by TX DPS Bureau of Security.' },
              ].map(({ icon: Icon, title, desc }) => (
                <div key={title} className="flex items-start gap-3 p-3 rounded-md bg-muted/40">
                  <Icon className="w-4 h-4 text-[#ffc83c] mt-0.5 shrink-0" />
                  <div>
                    <p className="text-sm font-medium text-foreground">{title}</p>
                    <p className="text-xs text-muted-foreground">{desc}</p>
                  </div>
                </div>
              ))}
            </div>
            <p className="text-xs text-muted-foreground pt-2">
              On the next step, select the credential type that matches what you hold or will obtain through TX DPS.
            </p>
            <div className="flex justify-end pt-2">
              <Button
                data-testid="button-step-next-0"
                onClick={() => setStep(1)}
              >
                Continue
                <ChevronRight className="w-4 h-4" />
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Step 1 — Select credential type */}
      {step === 1 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <ShieldCheck className="w-4 h-4 text-[#ffc83c]" />
              Select Your Credential Type
            </CardTitle>
            <CardDescription>
              Choose the TX DPS credential that best matches your role in the organization.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {CREDENTIAL_OPTIONS.map(opt => {
              const Icon = opt.icon;
              const isSelected = selected === opt.id;
              return (
                <button
                  key={opt.id}
                  data-testid={`option-credential-${opt.id}`}
                  onClick={() => setSelected(opt.id)}
                  className={['w-full text-left p-4 rounded-md border transition-colors', isSelected
                      ? 'border-[#ffc83c]/60 bg-[#ffc83c]/5'
                      : 'border-border bg-muted/20 hover-elevate'].join(' ')}
                >
                  <div className="flex items-start gap-3">
                    <Icon className={`w-5 h-5 mt-0.5 shrink-0 ${isSelected ? 'text-[#ffc83c]' : opt.color}`} />
                    <div className="flex-1 space-y-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-sm font-medium text-foreground">{opt.label}</span>
                        <span className="text-xs text-muted-foreground">{opt.sublabel}</span>
                        {isSelected && <Badge variant="outline" className="text-[#ffc83c] border-[#ffc83c]/40 text-xs">Selected</Badge>}
                      </div>
                      <p className="text-xs text-muted-foreground">{opt.description}</p>
                      <p className="text-xs text-muted-foreground/70 italic">{opt.whoFor}</p>
                    </div>
                  </div>
                </button>
              );
            })}
            <div className="flex justify-between pt-2">
              <Button variant="outline" onClick={() => setStep(0)} data-testid="button-step-back-1">
                <ChevronLeft className="w-4 h-4" />
                Back
              </Button>
              <Button
                data-testid="button-step-next-1"
                disabled={!selected}
                onClick={() => setStep(2)}
              >
                Continue
                <ChevronRight className="w-4 h-4" />
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Step 2 — Card details */}
      {step === 2 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <FileText className="w-4 h-4 text-[#ffc83c]" />
              Card / License Details
            </CardTitle>
            <CardDescription>
              Enter the details from your {selectedOption?.label}. Fields marked optional can be added later.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid sm:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label htmlFor="cardNumber">Card / License Number</Label>
                <Input
                  id="cardNumber"
                  data-testid="input-card-number"
                  placeholder="e.g. B12345678"
                  value={form.cardNumber}
                  onChange={e => setForm(f => ({ ...f, cardNumber: e.target.value }))}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="expirationDate">Expiration Date <span className="text-muted-foreground text-xs">(optional)</span></Label>
                <Input
                  id="expirationDate"
                  type="date"
                  data-testid="input-expiration-date"
                  value={form.expirationDate}
                  onChange={e => setForm(f => ({ ...f, expirationDate: e.target.value }))}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="issuingState">Issuing State</Label>
                <Input
                  id="issuingState"
                  data-testid="input-issuing-state"
                  value={form.issuingState}
                  onChange={e => setForm(f => ({ ...f, issuingState: e.target.value }))}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="issuingAgency">Issuing Agency</Label>
                <Input
                  id="issuingAgency"
                  data-testid="input-issuing-agency"
                  value={form.issuingAgency}
                  onChange={e => setForm(f => ({ ...f, issuingAgency: e.target.value }))}
                />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="notes">Notes <span className="text-muted-foreground text-xs">(optional)</span></Label>
              <Input
                id="notes"
                data-testid="input-notes"
                placeholder="Any additional context..."
                value={form.notes}
                onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
              />
            </div>
            <div className="flex items-start gap-3 rounded-md p-3 bg-muted/30 text-xs text-muted-foreground border border-border">
              <AlertTriangle className="w-3.5 h-3.5 mt-0.5 shrink-0 text-amber-400" />
              <span>
                Document upload via the file system is coming in a future release.
                For now, enter your card number and details — a compliance manager will verify against TX DPS records.
              </span>
            </div>
            <div className="flex justify-between pt-2">
              <Button variant="outline" onClick={() => setStep(1)} data-testid="button-step-back-2">
                <ChevronLeft className="w-4 h-4" />
                Back
              </Button>
              <Button
                data-testid="button-step-next-2"
                onClick={() => setStep(3)}
              >
                Review
                <ChevronRight className="w-4 h-4" />
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Step 3 — Review & submit */}
      {step === 3 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-[#ffc83c]" />
              Review & Submit
            </CardTitle>
            <CardDescription>
              Confirm your details are correct before submitting for review.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="rounded-md border border-border divide-y divide-border">
              <div className="flex justify-between items-center px-4 py-3">
                <span className="text-sm text-muted-foreground">Credential Type</span>
                <span className="text-sm font-medium text-foreground">{selectedOption?.label}</span>
              </div>
              <div className="flex justify-between items-center px-4 py-3">
                <span className="text-sm text-muted-foreground">Issuing Authority</span>
                <span className="text-sm text-foreground">{selectedOption?.sublabel}</span>
              </div>
              {form.cardNumber && (
                <div className="flex justify-between items-center px-4 py-3">
                  <span className="text-sm text-muted-foreground">Card Number</span>
                  <span className="text-sm font-mono text-foreground">{form.cardNumber}</span>
                </div>
              )}
              {form.expirationDate && (
                <div className="flex justify-between items-center px-4 py-3">
                  <span className="text-sm text-muted-foreground">Expiration</span>
                  <span className="text-sm text-foreground">{new Date(form.expirationDate).toLocaleDateString()}</span>
                </div>
              )}
              <div className="flex justify-between items-center px-4 py-3">
                <span className="text-sm text-muted-foreground">Issuing State</span>
                <span className="text-sm text-foreground">{form.issuingState}</span>
              </div>
              <div className="flex justify-between items-center px-4 py-3">
                <span className="text-sm text-muted-foreground">Status after submit</span>
                <Badge variant="outline" className="text-amber-400 border-amber-400/40">Under Review</Badge>
              </div>
            </div>

            <div className="flex items-start gap-3 rounded-md p-3 bg-muted/30 text-xs text-muted-foreground border border-border">
              <ShieldCheck className="w-3.5 h-3.5 mt-0.5 shrink-0 text-[#ffc83c]" />
              <span>
                By submitting, you confirm that the credential information provided is accurate. 
                A compliance manager will verify your credential against TX DPS records within 3–5 business days.
              </span>
            </div>

            <div className="flex justify-between pt-2">
              <Button variant="outline" onClick={() => setStep(2)} data-testid="button-step-back-3">
                <ChevronLeft className="w-4 h-4" />
                Back
              </Button>
              <Button
                data-testid="button-submit-enrollment"
                onClick={handleSubmit}
                disabled={submitMutation.isPending}
              >
                {submitMutation.isPending ? 'Submitting...' : 'Submit Credential'}
                {!submitMutation.isPending && <ChevronRight className="w-4 h-4" />}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
