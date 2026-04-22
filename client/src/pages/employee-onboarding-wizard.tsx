import { useState, useRef, useEffect, useCallback } from 'react';
import { useParams } from 'wouter';
import { useQuery, useMutation } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Separator } from '@/components/ui/separator';
import { Checkbox } from '@/components/ui/checkbox';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/hooks/use-toast';
import { UnifiedBrandLogo } from '@/components/unified-brand-logo';
import { apiRequest } from '@/lib/queryClient';
import {
  ChevronRight, ChevronLeft, CheckCircle2, FileText, Loader2, UserCheck,
  Phone, MapPin, Calendar, DollarSign, Clock, Shield, PenLine, AlertCircle,
  Building2, FileCheck, ScrollText, Wrench, ChevronDown, Scale
} from 'lucide-react';
import { TOSAgreementStep } from '@/components/tos-agreement-step';

const STEPS = [
  { id: 'welcome',      label: 'Welcome',           icon: UserCheck },
  { id: 'personal',     label: 'Personal Info',      icon: UserCheck },
  { id: 'emergency',    label: 'Emergency Contact',  icon: Phone },
  { id: 'tax',          label: 'Work Type',          icon: DollarSign },
  { id: 'payroll',      label: 'Payroll Setup',      icon: Building2 },
  { id: 'availability', label: 'Availability',       icon: Calendar },
  { id: 'legal',        label: 'Legal Agreement',    icon: Scale },
  { id: 'documents',    label: 'Sign Documents',     icon: FileText },
  { id: 'complete',     label: 'Complete',           icon: CheckCircle2 },
];

const DAYS = ['Monday','Tuesday','Wednesday','Thursday','Friday','Saturday','Sunday'] as const;
const DAY_FIELDS = ['availableMonday','availableTuesday','availableWednesday','availableThursday','availableFriday','availableSaturday','availableSunday'] as const;

const REQUIRED_DOC_TYPES = ['employee_contract','offer_letter','liability_waiver','uniform_acknowledgment'];

interface InviteData {
  id: string;
  workspaceId: string;
  email: string;
  firstName: string;
  lastName: string;
  role: string | null;
  workspaceRole: string;
  isUsed: boolean;
  expiresAt: string;
}

interface Contract {
  id: string;
  documentType: string;
  documentTitle: string;
  documentContent: string;
  status: string;
}

interface FormState {
  firstName: string; lastName: string; middleName: string;
  phone: string; address: string; city: string; state: string; zipCode: string;
  dateOfBirth: string; ssnLastFour: string;
  emergencyContactName: string; emergencyContactPhone: string; emergencyContactRelation: string;
  taxClassification: string; filingStatus: string; multipleJobs: string;
  dependentsAmount: string; otherIncome: string; extraWithholding: string;
  bankName: string; routingNumber: string; accountNumber: string; accountType: string;
  availableMonday: boolean; availableTuesday: boolean; availableWednesday: boolean;
  availableThursday: boolean; availableFriday: boolean; availableSaturday: boolean;
  availableSunday: boolean; preferredShiftTime: string; maxHoursPerWeek: string;
  availabilityNotes: string;
}

function DocSignaturePanel({
  contract,
  onSigned,
  isSigning,
}: {
  contract: Contract;
  onSigned: (name: string) => void;
  isSigning: boolean;
}) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [hasScrolled, setHasScrolled] = useState(false);
  const [signName, setSignName] = useState('');
  const [signDate, setSignDate] = useState(new Date().toISOString().slice(0, 10));
  const [agreed, setAgreed] = useState(false);

  const checkScroll = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 40;
    if (atBottom) setHasScrolled(true);
  }, []);

  const iconMap: Record<string, any> = {
    employee_contract: ScrollText,
    offer_letter: FileText,
    liability_waiver: Shield,
    uniform_acknowledgment: Wrench,
    handbook: FileCheck,
    confidentiality: Shield,
    i9_form: UserCheck,
    w4_form: DollarSign,
    w9_form: DollarSign,
  };
  const DocIcon = iconMap[contract.documentType] || FileText;
  const isRequired = REQUIRED_DOC_TYPES.includes(contract.documentType);

  const canSign = hasScrolled && signName.trim().length >= 2 && agreed;

  return (
    <div className="space-y-4" data-testid={`doc-panel-${contract.documentType}`}>
      <div className="flex items-center gap-2">
        <DocIcon className="h-5 w-5 text-primary shrink-0" />
        <div>
          <h3 className="font-semibold text-base">{contract.documentTitle}</h3>
          {isRequired && (
            <Badge variant="secondary" className="text-xs mt-0.5 text-destructive">Required</Badge>
          )}
        </div>
      </div>

      {contract.status === 'signed' ? (
        <div className="flex items-center gap-2 p-4 rounded-md" style={{ background: 'hsl(var(--background))', border: '1px solid hsl(var(--border))' }}>
          <CheckCircle2 className="h-5 w-5 shrink-0 text-green-600 dark:text-green-400" />
          <p className="text-sm font-medium text-green-600 dark:text-green-400">Signed successfully</p>
        </div>
      ) : (
        <>
          <div className="relative">
            <div
              ref={scrollRef}
              onScroll={checkScroll}
              className="rounded-md border p-4 text-sm text-muted-foreground whitespace-pre-wrap leading-relaxed"
              style={{ maxHeight: 260, overflowY: 'auto', fontFamily: 'monospace', fontSize: 12 }}
              data-testid={`doc-content-${contract.documentType}`}
            >
              {contract.documentContent}
            </div>
            {!hasScrolled && (
              <div className="absolute bottom-2 right-2 flex items-center gap-1 text-xs text-muted-foreground animate-bounce">
                <ChevronDown className="h-3 w-3" />
                Scroll to read
              </div>
            )}
          </div>

          <div className={`space-y-3 transition-opacity duration-300 ${hasScrolled ? 'opacity-100' : 'opacity-30 pointer-events-none'}`}>
            <Separator />
            <p className="text-xs text-muted-foreground">
              By typing your full legal name below, you are applying your electronic signature to this document.
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label htmlFor={`sig-name-${contract.id}`} className="text-xs">Full Legal Name *</Label>
                <div className="relative">
                  <PenLine className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
                  <Input
                    id={`sig-name-${contract.id}`}
                    value={signName}
                    onChange={e => setSignName(e.target.value)}
                    placeholder="Type your full name"
                    className="pl-8 font-medium"
                    style={{ fontFamily: 'cursive', fontSize: 15 }}
                    data-testid={`input-sig-name-${contract.documentType}`}
                  />
                </div>
              </div>
              <div className="space-y-1">
                <Label htmlFor={`sig-date-${contract.id}`} className="text-xs">Date</Label>
                <Input
                  id={`sig-date-${contract.id}`}
                  type="date"
                  value={signDate}
                  onChange={e => setSignDate(e.target.value)}
                  data-testid={`input-sig-date-${contract.documentType}`}
                />
              </div>
            </div>
            <div className="flex items-start gap-2">
              <Checkbox
                id={`agree-${contract.id}`}
                checked={agreed}
                onCheckedChange={v => setAgreed(!!v)}
                data-testid={`checkbox-agree-${contract.documentType}`}
              />
              <Label htmlFor={`agree-${contract.id}`} className="text-sm leading-snug cursor-pointer">
                I have read the above document in full and agree to all terms and conditions.
              </Label>
            </div>
            <Button
              onClick={() => onSigned(signName.trim())}
              disabled={!canSign || isSigning}
              className="w-full"
              data-testid={`button-sign-${contract.documentType}`}
            >
              {isSigning ? (
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
              ) : (
                <PenLine className="h-4 w-4 mr-2" />
              )}
              Sign Document
            </Button>
          </div>
        </>
      )}
    </div>
  );
}

export default function EmployeeOnboardingWizard() {
  const { token } = useParams<{ token: string }>();
  const { toast } = useToast();

  const [step, setStep] = useState(0);
  const [applicationId, setApplicationId] = useState<string | null>(null);
  const [workspaceId, setWorkspaceId] = useState<string | null>(null);
  const [contracts, setContracts] = useState<Contract[]>([]);
  const [currentDocIdx, setCurrentDocIdx] = useState(0);
  const [tosAgreementId, setTosAgreementId] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>({
    firstName: '', lastName: '', middleName: '',
    phone: '', address: '', city: '', state: '', zipCode: '',
    dateOfBirth: '', ssnLastFour: '',
    emergencyContactName: '', emergencyContactPhone: '', emergencyContactRelation: '',
    taxClassification: 'w4_employee', filingStatus: 'single', multipleJobs: 'no',
    dependentsAmount: '', otherIncome: '', extraWithholding: '',
    bankName: '', routingNumber: '', accountNumber: '', accountType: 'checking',
    availableMonday: true, availableTuesday: true, availableWednesday: true,
    availableThursday: true, availableFriday: true, availableSaturday: false,
    availableSunday: false, preferredShiftTime: '', maxHoursPerWeek: '40',
    availabilityNotes: '',
  });

  const { data: invite, isLoading: inviteLoading, error: inviteError } = useQuery<InviteData>({
    queryKey: ['/api/onboarding/invite', token],
    queryFn: async () => {
      const res = await fetch(`/api/onboarding/invite/${token}`);
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.message || 'Invalid invite link');
      }
      return res.json();
    },
    enabled: !!token,
    retry: false,
  });

  useEffect(() => {
    if (invite) {
      setWorkspaceId(invite.workspaceId);
      setForm(prev => ({
        ...prev,
        firstName: invite.firstName || '',
        lastName: invite.lastName || '',
      }));
      fetch(`/api/onboarding/invite/${token}/opened`, { method: 'POST', headers: { 'Content-Type': 'application/json' } }).catch(() => {});
    }
  }, [invite, token]);

  const setField = (key: keyof FormState, val: string | boolean) =>
    setForm(prev => ({ ...prev, [key]: val }));

  const createAppMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch('/api/onboarding/application', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ inviteToken: token, ...form }),
      });
      if (!res.ok) { const e = await res.json(); throw new Error(e.message); }
      return res.json();
    },
    onSuccess: (data) => {
      setApplicationId(data.id);
    },
    onError: (e: any) => toast({ title: 'Error', description: e.message, variant: 'destructive' }),
  });

  const updateAppMutation = useMutation({
    mutationFn: async (updateData: Partial<FormState> & { currentStep?: string }) => {
      if (!applicationId || !workspaceId) return;
      const res = await fetch(`/api/onboarding/application/${applicationId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ workspaceId, ...updateData }),
      });
      if (!res.ok) { const e = await res.json(); throw new Error(e.message); }
      return res.json();
    },
    onError: (e: any) => toast({ title: 'Save failed', description: e.message || 'Failed to save your progress. Please try again.', variant: 'destructive' }),
  });

  const fetchContracts = useCallback(async () => {
    if (!applicationId || !workspaceId) return;
    const res = await fetch(`/api/onboarding/contracts/${applicationId}?workspaceId=${workspaceId}`);
    if (res.ok) {
      const data = await res.json();
      setContracts(data);
    }
  }, [applicationId, workspaceId]);

  useEffect(() => {
    if (step === 7 && applicationId) {
      fetchContracts();
    }
  }, [step, applicationId, fetchContracts]);

  const signMutation = useMutation({
    mutationFn: async ({ contractId, signedByName }: { contractId: string; signedByName: string }) => {
      const res = await fetch(`/api/onboarding/contracts/${contractId}/sign?workspaceId=${workspaceId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ signedByName, applicationId }),
      });
      if (!res.ok) { const e = await res.json(); throw new Error(e.message); }
      return res.json();
    },
    onSuccess: async (updated) => {
      setContracts(prev => prev.map(c => c.id === updated.id ? { ...c, status: 'signed' } : c));
      const nextUnsigned = contracts.findIndex((c, i) => i > currentDocIdx && c.status !== 'signed');
      if (nextUnsigned !== -1) {
        setCurrentDocIdx(nextUnsigned);
      } else {
        const allSigned = contracts.every(c => c.id === updated.id ? true : c.status === 'signed');
        if (allSigned) {
          toast({ title: 'All documents signed!', description: 'Ready to submit your application.' });
        } else {
          const firstUnsigned = contracts.findIndex((c) => c.id !== updated.id && c.status !== 'signed');
          if (firstUnsigned !== -1) setCurrentDocIdx(firstUnsigned);
        }
      }
    },
    onError: (e: any) => toast({ title: 'Signing failed', description: e.message, variant: 'destructive' }),
  });

  const submitMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch(`/api/onboarding/submit/${applicationId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ workspaceId }),
      });
      if (!res.ok) { const e = await res.json(); throw new Error(e.message); }
      return res.json();
    },
    onSuccess: () => setStep(8),
    onError: (e: any) => toast({ title: 'Submit failed', description: e.message, variant: 'destructive' }),
  });

  const handleNext = async () => {
    if (step === 0) {
      setStep(1);
      return;
    }

    try {
      if (step === 1) {
        if (!form.firstName.trim() || !form.lastName.trim()) {
          toast({ title: 'Required fields missing', description: 'First and last name are required.', variant: 'destructive' });
          return;
        }
        if (!applicationId) {
          await createAppMutation.mutateAsync();
        } else {
          await updateAppMutation.mutateAsync({ ...form } as any);
        }
      } else if (step === 2) {
        await updateAppMutation.mutateAsync({
          emergencyContactName: form.emergencyContactName,
          emergencyContactPhone: form.emergencyContactPhone,
          emergencyContactRelation: form.emergencyContactRelation,
        } as any);
      } else if (step === 3) {
        await updateAppMutation.mutateAsync({
          taxClassification: form.taxClassification as any,
          filingStatus: form.filingStatus,
          multipleJobs: form.multipleJobs,
          dependentsAmount: form.dependentsAmount,
          otherIncome: form.otherIncome,
          extraWithholding: form.extraWithholding,
        } as any);
      } else if (step === 4) {
        await updateAppMutation.mutateAsync({
          bankName: form.bankName,
          routingNumber: form.routingNumber,
          accountNumber: form.accountNumber,
          accountType: form.accountType,
        } as any);
      } else if (step === 5) {
        await updateAppMutation.mutateAsync({
          availableMonday: form.availableMonday,
          availableTuesday: form.availableTuesday,
          availableWednesday: form.availableWednesday,
          availableThursday: form.availableThursday,
          availableFriday: form.availableFriday,
          availableSaturday: form.availableSaturday,
          availableSunday: form.availableSunday,
          preferredShiftTime: form.preferredShiftTime,
          maxHoursPerWeek: form.maxHoursPerWeek ? parseInt(form.maxHoursPerWeek) : undefined,
          availabilityNotes: form.availabilityNotes,
          currentStep: 'work_availability',
        } as any);
      }
    } catch {
      // Error is displayed by mutation's onError callback; do not advance the step
      return;
    }

    setStep(s => s + 1);
  };

  const allRequiredSigned = contracts.length > 0 && contracts
    .filter(c => REQUIRED_DOC_TYPES.includes(c.documentType))
    .every(c => c.status === 'signed');

  const progress = step === 8 ? 100 : Math.round((step / (STEPS.length - 1)) * 100);

  if (inviteLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center space-y-3">
          <Loader2 className="h-8 w-8 animate-spin mx-auto text-primary" />
          <p className="text-muted-foreground">Loading your invitation...</p>
        </div>
      </div>
    );
  }

  if (inviteError || !invite) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4">
        <Card className="w-full max-w-md">
          <CardContent className="p-8 text-center space-y-4">
            <AlertCircle className="h-12 w-12 mx-auto text-destructive" />
            <h2 className="text-xl font-semibold">Invalid Invitation</h2>
            <p className="text-muted-foreground text-sm">
              This invitation link is invalid, expired, or has already been used. Please contact your employer for a new invite.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  const isBusy = createAppMutation.isPending || updateAppMutation.isPending;

  return (
    <div className="min-h-screen bg-gradient-to-b from-background to-muted/30 py-8 px-4">
      <div className="max-w-2xl mx-auto space-y-6">
        <div className="text-center space-y-2">
          <UnifiedBrandLogo size="md" showTagline={false} />
          <p className="text-sm text-muted-foreground">Employee Onboarding Portal</p>
        </div>

        {step < 8 && (
          <div className="space-y-2">
            <div className="flex items-center justify-between text-xs text-muted-foreground">
              <span>{STEPS[step]?.label}</span>
              <span>Step {step + 1} of {STEPS.length}</span>
            </div>
            <Progress value={progress} className="h-2" data-testid="onboarding-progress" />
            <div className="flex gap-1 justify-center flex-wrap">
              {STEPS.map((s, i) => (
                <div
                  key={s.id}
                  className={`h-1.5 flex-1 max-w-[2rem] rounded-full transition-colors ${
                    i < step ? 'bg-primary' : i === step ? 'bg-primary/50' : 'bg-muted'
                  }`}
                />
              ))}
            </div>
          </div>
        )}

        <Card data-testid={`step-${STEPS[step]?.id}`}>
          <CardHeader className="pb-4">
            <CardTitle className="flex items-center gap-2">
              {step < 8 && (() => { const Icon = STEPS[step].icon; return <Icon className="h-5 w-5 text-primary" />; })()}
              {step === 8 ? 'Application Submitted!' : STEPS[step]?.label}
            </CardTitle>
            {step === 0 && (
              <CardDescription>
                You've been invited to join the team. Let's get you set up!
              </CardDescription>
            )}
          </CardHeader>

          <CardContent className="space-y-5">
            {step === 0 && (
              <div className="space-y-4">
                <div className="p-4 rounded-md" style={{ background: 'hsl(var(--muted))' }}>
                  <p className="text-sm font-medium">Welcome, {invite.firstName} {invite.lastName}!</p>
                  <p className="text-sm text-muted-foreground mt-1">
                    You've been invited to complete your employee onboarding. This will take about 10–15 minutes.
                  </p>
                </div>
                <div className="space-y-2 text-sm">
                  <p className="font-medium">You'll complete the following steps:</p>
                  <ul className="space-y-1.5 text-muted-foreground">
                    {STEPS.slice(1, 7).map(s => (
                      <li key={s.id} className="flex items-center gap-2">
                        <CheckCircle2 className="h-3.5 w-3.5 text-primary shrink-0" />
                        {s.label}
                      </li>
                    ))}
                  </ul>
                </div>
                {invite && (
                  <div className="flex items-start gap-3 rounded-lg border border-amber-500/30 bg-amber-500/10 p-3">
                    <span className="text-amber-400 text-lg">⏱</span>
                    <div>
                      <p className="text-sm font-semibold text-amber-300">
                        DPS Provisional Work Authorization
                      </p>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        You have <strong>14 days</strong> from your start date to complete your
                        Texas DPS security license registration. You may work during this period,
                        but clock-in will be blocked if the deadline passes without completion.
                        Complete the <strong>DPS Credentials</strong> step to upload your license.
                      </p>
                    </div>
                  </div>
                )}
                <p className="text-xs text-muted-foreground">
                  Your information is secured and encrypted. Required fields are marked with *.
                </p>
              </div>
            )}

            {step === 1 && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label htmlFor="firstName">First Name *</Label>
                  <Input id="firstName" value={form.firstName} onChange={e => setField('firstName', e.target.value)} data-testid="input-firstName" />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="middleName">Middle Name</Label>
                  <Input id="middleName" value={form.middleName} onChange={e => setField('middleName', e.target.value)} data-testid="input-middleName" />
                </div>
                <div className="space-y-1.5 sm:col-span-2">
                  <Label htmlFor="lastName">Last Name *</Label>
                  <Input id="lastName" value={form.lastName} onChange={e => setField('lastName', e.target.value)} data-testid="input-lastName" />
                </div>
                <div className="space-y-1.5 sm:col-span-2">
                  <Label htmlFor="address">Street Address</Label>
                  <Input id="address" placeholder="123 Main St" value={form.address} onChange={e => setField('address', e.target.value)} data-testid="input-address" />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="city">City</Label>
                  <Input id="city" value={form.city} onChange={e => setField('city', e.target.value)} data-testid="input-city" />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="state">State</Label>
                  <Input id="state" placeholder="TX" maxLength={2} value={form.state} onChange={e => setField('state', e.target.value.toUpperCase())} data-testid="input-state" />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="zipCode">Zip Code</Label>
                  <Input id="zipCode" placeholder="78701" value={form.zipCode} onChange={e => setField('zipCode', e.target.value)} data-testid="input-zipCode" />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="phone">Phone Number</Label>
                  <div className="relative">
                    <Phone className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                    <Input id="phone" placeholder="(555) 000-0000" className="pl-9" value={form.phone} onChange={e => setField('phone', e.target.value)} data-testid="input-phone" />
                  </div>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="dob">Date of Birth</Label>
                  <Input id="dob" type="date" value={form.dateOfBirth} onChange={e => setField('dateOfBirth', e.target.value)} data-testid="input-dateOfBirth" />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="ssn">Last 4 of SSN/ITIN</Label>
                  <Input id="ssn" placeholder="1234" maxLength={4} type="password" value={form.ssnLastFour} onChange={e => setField('ssnLastFour', e.target.value.replace(/\D/g,''))} data-testid="input-ssnLastFour" />
                </div>
              </div>
            )}

            {step === 2 && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="sm:col-span-2 p-3 rounded-md text-sm text-muted-foreground" style={{ background: 'hsl(var(--muted))' }}>
                  In case of an emergency, who should we contact?
                </div>
                <div className="space-y-1.5 sm:col-span-2">
                  <Label htmlFor="ecName">Contact Full Name</Label>
                  <Input id="ecName" placeholder="Jane Doe" value={form.emergencyContactName} onChange={e => setField('emergencyContactName', e.target.value)} data-testid="input-ecName" />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="ecPhone">Contact Phone</Label>
                  <div className="relative">
                    <Phone className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                    <Input id="ecPhone" placeholder="(555) 000-0000" className="pl-9" value={form.emergencyContactPhone} onChange={e => setField('emergencyContactPhone', e.target.value)} data-testid="input-ecPhone" />
                  </div>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="ecRelation">Relationship</Label>
                  <Select value={form.emergencyContactRelation} onValueChange={v => setField('emergencyContactRelation', v)}>
                    <SelectTrigger id="ecRelation" data-testid="select-ecRelation">
                      <SelectValue placeholder="Select..." />
                    </SelectTrigger>
                    <SelectContent>
                      {['Spouse','Parent','Sibling','Child','Friend','Other'].map(r => (
                        <SelectItem key={r} value={r.toLowerCase()}>{r}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            )}

            {step === 3 && (
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label>Worker Classification *</Label>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {[
                      { val: 'w4_employee', label: 'W-4 Employee', desc: 'I am a full/part-time employee (taxes withheld by employer)' },
                      { val: 'w9_contractor', label: 'W-9 Independent Contractor', desc: 'I am a self-employed contractor (responsible for own taxes)' },
                    ].map(opt => (
                      <div
                        key={opt.val}
                        className={`p-3 rounded-md border cursor-pointer transition-colors hover-elevate ${form.taxClassification === opt.val ? 'border-primary' : ''}`}
                        onClick={() => setField('taxClassification', opt.val)}
                        data-testid={`card-tax-${opt.val}`}
                      >
                        <div className="flex items-center gap-2">
                          <div className={`h-4 w-4 rounded-full border-2 flex items-center justify-center shrink-0 ${form.taxClassification === opt.val ? 'border-primary' : 'border-muted-foreground'}`}>
                            {form.taxClassification === opt.val && <div className="h-2 w-2 rounded-full bg-primary" />}
                          </div>
                          <p className="font-medium text-sm">{opt.label}</p>
                        </div>
                        <p className="text-xs text-muted-foreground mt-1 ml-6">{opt.desc}</p>
                      </div>
                    ))}
                  </div>
                </div>
                {form.taxClassification === 'w4_employee' && (
                  <div className="space-y-4 pt-2">
                    <Separator />
                    <p className="text-sm font-medium">W-4 Tax Withholding Information</p>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div className="space-y-1.5">
                        <Label>Filing Status</Label>
                        <Select value={form.filingStatus} onValueChange={v => setField('filingStatus', v)}>
                          <SelectTrigger data-testid="select-filingStatus">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="single">Single or Married filing separately</SelectItem>
                            <SelectItem value="married_filing_jointly">Married filing jointly</SelectItem>
                            <SelectItem value="head_of_household">Head of household</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-1.5">
                        <Label>Multiple jobs or spouse works?</Label>
                        <Select value={form.multipleJobs} onValueChange={v => setField('multipleJobs', v)}>
                          <SelectTrigger data-testid="select-multipleJobs">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="no">No</SelectItem>
                            <SelectItem value="yes">Yes</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-1.5">
                        <Label>Dependents amount ($)</Label>
                        <Input placeholder="0.00" value={form.dependentsAmount} onChange={e => setField('dependentsAmount', e.target.value)} data-testid="input-dependentsAmount" />
                      </div>
                      <div className="space-y-1.5">
                        <Label>Extra withholding per paycheck ($)</Label>
                        <Input placeholder="0.00" value={form.extraWithholding} onChange={e => setField('extraWithholding', e.target.value)} data-testid="input-extraWithholding" />
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}

            {step === 4 && (
              <div className="space-y-4">
                <div className="p-3 rounded-md text-sm text-muted-foreground" style={{ background: 'hsl(var(--muted))' }}>
                  Your banking information is used to set up direct deposit for your paychecks. This information is encrypted and stored securely.
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-1.5 sm:col-span-2">
                    <Label>Bank or Financial Institution Name</Label>
                    <div className="relative">
                      <Building2 className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                      <Input placeholder="Chase, Wells Fargo, etc." className="pl-9" value={form.bankName} onChange={e => setField('bankName', e.target.value)} data-testid="input-bankName" />
                    </div>
                  </div>
                  <div className="space-y-1.5">
                    <Label>Routing Number (9 digits)</Label>
                    <Input placeholder="021000021" maxLength={9} value={form.routingNumber} onChange={e => setField('routingNumber', e.target.value.replace(/\D/,''))} data-testid="input-routingNumber" />
                  </div>
                  <div className="space-y-1.5">
                    <Label>Account Number</Label>
                    <Input placeholder="000123456789" value={form.accountNumber} onChange={e => setField('accountNumber', e.target.value)} data-testid="input-accountNumber" />
                  </div>
                  <div className="space-y-1.5">
                    <Label>Account Type</Label>
                    <Select value={form.accountType} onValueChange={v => setField('accountType', v)}>
                      <SelectTrigger data-testid="select-accountType">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="checking">Checking</SelectItem>
                        <SelectItem value="savings">Savings</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <p className="text-xs text-muted-foreground">
                  If you prefer to receive a paper check, you may leave this section blank and notify your HR representative.
                </p>
              </div>
            )}

            {step === 5 && (
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label>Days Available *</Label>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                    {DAYS.map((day, i) => {
                      const field = DAY_FIELDS[i];
                      const checked = form[field] as boolean;
                      return (
                        <div
                          key={day}
                          className={`flex items-center gap-2 p-2.5 rounded-md border cursor-pointer transition-colors ${checked ? 'border-primary bg-primary/5' : ''}`}
                          onClick={() => setField(field, !checked)}
                          data-testid={`toggle-${field}`}
                        >
                          <Checkbox checked={checked} onCheckedChange={v => setField(field, !!v)} />
                          <span className="text-sm">{day.slice(0, 3)}</span>
                        </div>
                      );
                    })}
                  </div>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <Label>Preferred Shift</Label>
                    <Select value={form.preferredShiftTime} onValueChange={v => setField('preferredShiftTime', v)}>
                      <SelectTrigger data-testid="select-preferredShift">
                        <SelectValue placeholder="No preference" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="">No preference</SelectItem>
                        <SelectItem value="morning">Morning (6am–2pm)</SelectItem>
                        <SelectItem value="afternoon">Afternoon (2pm–10pm)</SelectItem>
                        <SelectItem value="evening">Evening (4pm–midnight)</SelectItem>
                        <SelectItem value="night">Night (10pm–6am)</SelectItem>
                        <SelectItem value="overnight">Overnight (12am–8am)</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1.5">
                    <Label>Max Hours/Week</Label>
                    <div className="relative">
                      <Clock className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                      <Input placeholder="40" type="number" min={1} max={84} className="pl-9" value={form.maxHoursPerWeek} onChange={e => setField('maxHoursPerWeek', e.target.value)} data-testid="input-maxHours" />
                    </div>
                  </div>
                  <div className="space-y-1.5 sm:col-span-2">
                    <Label>Availability Notes (optional)</Label>
                    <Textarea
                      placeholder="e.g. Cannot work Tuesday evenings, available for overtime on weekends..."
                      value={form.availabilityNotes}
                      onChange={e => setField('availabilityNotes', e.target.value)}
                      data-testid="input-availabilityNotes"
                    />
                  </div>
                </div>
              </div>
            )}

            {step === 6 && (
              <div className="space-y-2">
                <TOSAgreementStep
                  agreementType="user_onboarding"
                  email={invite?.email || ''}
                  inviteToken={token}
                  onComplete={(id) => {
                    setTosAgreementId(id);
                    setStep(7);
                  }}
                />
              </div>
            )}

            {step === 7 && (
              <div className="space-y-6">
                {contracts.length === 0 ? (
                  <div className="flex items-center justify-center py-8">
                    <Loader2 className="h-6 w-6 animate-spin text-primary" />
                  </div>
                ) : (
                  <>
                    <div className="flex items-center justify-between gap-2 flex-wrap">
                      <p className="text-sm text-muted-foreground">
                        Review and sign each document. Required documents must all be signed before you can submit.
                      </p>
                      <Badge variant="secondary">
                        {contracts.filter(c => c.status === 'signed').length}/{contracts.length} Signed
                      </Badge>
                    </div>
                    <div className="flex gap-1.5 flex-wrap">
                      {contracts.map((c, i) => (
                        <button
                          key={c.id}
                          onClick={() => setCurrentDocIdx(i)}
                          className={`text-xs px-2.5 py-1 rounded-md border transition-colors ${
                            i === currentDocIdx
                              ? 'border-primary bg-primary/10 font-medium'
                              : c.status === 'signed'
                              ? 'border-green-500/50 bg-green-500/5 text-muted-foreground'
                              : 'border-muted text-muted-foreground'
                          }`}
                          data-testid={`tab-doc-${i}`}
                        >
                          {c.status === 'signed' ? '✓ ' : ''}{c.documentTitle.split(':')[0].slice(0, 22)}
                        </button>
                      ))}
                    </div>
                    <Separator />
                    {contracts[currentDocIdx] && (
                      <DocSignaturePanel
                        contract={contracts[currentDocIdx]}
                        onSigned={(name) => signMutation.mutate({ contractId: contracts[currentDocIdx].id, signedByName: name })}
                        isSigning={signMutation.isPending}
                      />
                    )}
                    <div className="flex items-center gap-2 p-3 rounded-md text-sm" style={{ background: 'hsl(var(--muted))' }}>
                      <Shield className="h-4 w-4 text-primary shrink-0" />
                      <p className="text-muted-foreground">
                        Your electronic signature is legally binding. Your IP address and timestamp are recorded for each signature.
                      </p>
                    </div>
                  </>
                )}
              </div>
            )}

            {step === 8 && (
              <div className="text-center space-y-5 py-4">
                <div className="flex justify-center">
                  <div className="h-16 w-16 rounded-full flex items-center justify-center bg-green-600/10 dark:bg-green-400/10">
                    <CheckCircle2 className="h-10 w-10 text-green-600 dark:text-green-400" />
                  </div>
                </div>
                <div>
                  <h3 className="text-xl font-semibold">Application Submitted!</h3>
                  <p className="text-muted-foreground mt-2 text-sm">
                    Thank you, {form.firstName}! Your onboarding application has been submitted and is now under review by your manager or HR representative.
                  </p>
                </div>
                <div className="p-4 rounded-md space-y-2 text-left" style={{ background: 'hsl(var(--muted))' }}>
                  <p className="text-sm font-medium">What happens next?</p>
                  <ul className="text-sm text-muted-foreground space-y-1.5">
                    <li className="flex items-start gap-2">
                      <CheckCircle2 className="h-4 w-4 mt-0.5 shrink-0 text-green-600 dark:text-green-400" />
                      Your manager will review your application and signed documents
                    </li>
                    <li className="flex items-start gap-2">
                      <CheckCircle2 className="h-4 w-4 mt-0.5 shrink-0 text-green-600 dark:text-green-400" />
                      You'll receive a notification when your profile is approved
                    </li>
                    <li className="flex items-start gap-2">
                      <CheckCircle2 className="h-4 w-4 mt-0.5 shrink-0 text-green-600 dark:text-green-400" />
                      Once approved, you'll be eligible for shift assignments
                    </li>
                    <li className="flex items-start gap-2">
                      <CheckCircle2 className="h-4 w-4 mt-0.5 shrink-0 text-green-600 dark:text-green-400" />
                      Your HR representative may follow up about required licenses or certifications
                    </li>
                  </ul>
                </div>
                {/* Phase 26C — Prompt new hires to set their clock-in PIN. */}
                <div
                  className="p-4 rounded-md space-y-2 text-left border"
                  style={{ borderColor: 'hsl(var(--primary))', background: 'hsl(var(--primary) / 0.05)' }}
                  data-testid="onboarding-pin-reminder"
                >
                  <div className="flex items-center gap-2">
                    <Shield className="h-4 w-4 text-primary" />
                    <p className="text-sm font-medium">One more thing — set your Clock-In PIN</p>
                  </div>
                  <p className="text-sm text-muted-foreground">
                    After your manager approves your application and you log in to your
                    dashboard for the first time, you'll be prompted to set a 4–8 digit
                    clock-in PIN. The PIN lets you clock in by voice and verifies your
                    identity with Trinity when you call in. <strong>Keep it private —
                    never share it with anyone, not even a supervisor.</strong>
                  </p>
                </div>
                <p className="text-xs text-muted-foreground">
                  If you need to make changes, contact your HR representative directly.
                </p>
              </div>
            )}
          </CardContent>

          {step < 8 && (
            <div className="px-6 pb-6 flex items-center justify-between gap-3">
              {step > 0 ? (
                <Button variant="outline" onClick={() => setStep(s => s - 1)} disabled={isBusy} data-testid="button-back">
                  <ChevronLeft className="h-4 w-4 mr-1" />
                  Back
                </Button>
              ) : (
                <div />
              )}

              {step < 6 && (
                <Button onClick={handleNext} disabled={isBusy} data-testid="button-next">
                  {isBusy ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                  {step === 0 ? 'Begin Onboarding' : 'Save & Continue'}
                  <ChevronRight className="h-4 w-4 ml-1" />
                </Button>
              )}

              {step === 7 && (
                <Button
                  onClick={() => submitMutation.mutate()}
                  disabled={!allRequiredSigned || submitMutation.isPending}
                  data-testid="button-submit-application"
                >
                  {submitMutation.isPending ? (
                    <Loader2 className="h-4 w-4 animate-spin mr-2" />
                  ) : (
                    <FileCheck className="h-4 w-4 mr-2" />
                  )}
                  {allRequiredSigned ? 'Submit Application' : `Sign Required Documents to Submit`}
                </Button>
              )}
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}
