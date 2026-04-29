import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Loader2, Plus, Building2, Shield, CheckCircle2, AlertCircle, ChevronRight, ChevronLeft, SkipForward, Save, Scale } from "lucide-react";
import { useState, useMemo, useEffect, useCallback, useRef } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { useLocation } from "wouter";
import { UnifiedBrandLogo } from "@/components/unified-brand-logo";
import { useMutation, useQuery } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { IndustrySelector, type IndustrySelection } from "@/components/industry-selector";
import { DOMAINS } from "@shared/platformConfig";
import { CanvasHubPage, type CanvasPageConfig } from "@/components/canvas-hub";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Progress } from "@/components/ui/progress";
import { TOSAgreementStep } from "@/components/tos-agreement-step";

const REGULATED_INDUSTRIES = ["security", "healthcare"];
const STATE_CODES = [
  { code: "TX", name: "Texas", regulator: "Private Security Bureau (PSB)" },
  { code: "CA", name: "California", regulator: "Bureau of Security (BSIS)" },
  { code: "FL", name: "Florida", regulator: "Dept. of Agriculture (DACS)" },
  { code: "NY", name: "New York", regulator: "Dept. of State (DOS)" },
  { code: "AZ", name: "Arizona", regulator: "Dept. of Public Safety" },
  { code: "NV", name: "Nevada", regulator: "Private Investigator's Board" },
  { code: "IL", name: "Illinois", regulator: "DFPR" },
  { code: "PA", name: "Pennsylvania", regulator: "State Police" },
  { code: "OH", name: "Ohio", regulator: "Dept. of Public Safety" },
  { code: "GA", name: "Georgia", regulator: "Board of Private Detective" },
];

const STORAGE_KEY = "create_org_progress";

const STEPS = [
  { id: "basics", title: "Organization Basics", description: "Name, code, and size" },
  { id: "details", title: "Additional Details", description: "Description and industry" },
  { id: "compliance", title: "Compliance & Licensing", description: "State license information" },
  { id: "legal", title: "Legal Agreement", description: "Terms of Service & AI disclaimer" },
  { id: "review", title: "Review & Create", description: "Confirm your details" },
];

interface FormData {
  orgName: string;
  orgCode: string;
  size: string;
  orgDescription: string;
  industrySelection: IndustrySelection | null;
  stateLicenseNumber: string;
  stateLicenseState: string;
}

interface SavedProgress {
  currentStep: number;
  formData: Record<string, any>;
  completedSteps: number[];
  skippedSteps: number[];
}

interface CreateWorkspaceResponse {
  success: boolean;
  workspace: {
    id: string;
    name: string;
    organizationId: string;
    organizationSerial: string;
  };
}

function loadLocalProgress(): SavedProgress | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return JSON.parse(raw);
  } catch {}
  return null;
}

function saveLocalProgress(progress: SavedProgress) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(progress));
  } catch {}
}

function clearLocalProgress() {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {}
}

export default function CreateOrg() {
  const [currentStep, setCurrentStep] = useState(0);
  const [completedSteps, setCompletedSteps] = useState<number[]>([]);
  const [skippedSteps, setSkippedSteps] = useState<number[]>([]);
  const [progressLoaded, setProgressLoaded] = useState(false);
  const saveTimerRef = useRef<NodeJS.Timeout | null>(null);

  const [orgName, setOrgName] = useState("");
  const [orgDescription, setOrgDescription] = useState("");
  const [industrySelection, setIndustrySelection] = useState<IndustrySelection | null>(null);
  const [size, setSize] = useState("");
  const [stateLicenseNumber, setStateLicenseNumber] = useState("");
  const [stateLicenseState, setStateLicenseState] = useState("");
  const [licenseValidationStatus, setLicenseValidationStatus] = useState<"idle" | "validating" | "valid" | "invalid">("idle");
  const [orgCode, setOrgCode] = useState("");
  const [orgCodeStatus, setOrgCodeStatus] = useState<"idle" | "checking" | "available" | "taken" | "invalid">("idle");
  const [orgCodeDebounceTimer, setOrgCodeDebounceTimer] = useState<NodeJS.Timeout | null>(null);
  const [tosAgreementId, setTosAgreementId] = useState<string | null>(null);
  const { toast } = useToast();
  const [, setLocation] = useLocation();

  const currentUserQuery = useQuery<{ id: string; email: string; username: string }>({
    queryKey: ["/api/auth/me"],
    staleTime: Infinity,
    retry: false,
  });

  const serverProgressQuery = useQuery<{ success: boolean; data: SavedProgress | null }>({
    queryKey: ["/api/onboarding/create-org/progress"],
    staleTime: Infinity,
    retry: false,
  });

  useEffect(() => {
    if (progressLoaded) return;

    const localProgress = loadLocalProgress();
    const serverProgress = serverProgressQuery.data?.data;

    const progress = serverProgress || localProgress;
    if (progress) {
      const fd = progress.formData || {};
      if (fd.orgName) setOrgName(fd.orgName);
      if (fd.orgCode) setOrgCode(fd.orgCode);
      if (fd.size) setSize(fd.size);
      if (fd.orgDescription) setOrgDescription(fd.orgDescription);
      if (fd.industrySelection) setIndustrySelection(fd.industrySelection);
      if (fd.stateLicenseNumber) setStateLicenseNumber(fd.stateLicenseNumber);
      if (fd.stateLicenseState) setStateLicenseState(fd.stateLicenseState);
      setCurrentStep(progress.currentStep || 0);
      setCompletedSteps(progress.completedSteps || []);
      setSkippedSteps(progress.skippedSteps || []);

      toast({
        title: "Progress Restored",
        description: `Resuming from step ${(progress.currentStep || 0) + 1} of ${STEPS.length}.`,
      });
    }

    setProgressLoaded(true);
  }, [serverProgressQuery.data, progressLoaded, toast]);

  const getFormData = useCallback((): Record<string, any> => ({
    orgName,
    orgCode,
    size,
    orgDescription,
    industrySelection,
    stateLicenseNumber,
    stateLicenseState,
  }), [orgName, orgCode, size, orgDescription, industrySelection, stateLicenseNumber, stateLicenseState]);

  const saveProgressMutation = useMutation({
    mutationFn: async (progress: SavedProgress) => {
      const response = await apiRequest('POST', '/api/onboarding/create-org/progress', progress);
      return response.json();
    },
  });

  const clearProgressMutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest('DELETE', '/api/onboarding/create-org/progress');
      return response.json();
    },
  });

  const saveProgress = useCallback((step: number, completed: number[], skipped: number[]) => {
    const progress: SavedProgress = {
      currentStep: step,
      formData: getFormData(),
      completedSteps: completed,
      skippedSteps: skipped,
    };
    saveLocalProgress(progress);

    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(() => {
      saveProgressMutation.mutate(progress);
    }, 1000);
  }, [getFormData, saveProgressMutation]);

  const isRegulatedIndustry = useMemo(() => {
    return industrySelection?.sectorId && REGULATED_INDUSTRIES.includes(industrySelection.sectorId);
  }, [industrySelection?.sectorId]);

  const selectedStateInfo = useMemo(() => {
    return STATE_CODES.find(s => s.code === stateLicenseState);
  }, [stateLicenseState]);

  const validateLicenseMutation = useMutation({
    mutationFn: async (params: { licenseNumber: string; state: string; industry: string }) => {
      const response = await apiRequest('POST', '/api/trinity/validate-license', params);
      return response.json();
    },
    onSuccess: (data) => {
      if (data.valid) {
        setLicenseValidationStatus("valid");
        toast({
          title: "License Validated",
          description: "Trinity AI has verified your license format matches state requirements.",
        });
      } else {
        setLicenseValidationStatus("invalid");
        toast({
          title: "License Format Issue",
          description: data.message || "Please verify your license number format.",
          variant: "destructive",
        });
      }
    },
    onError: () => {
      setLicenseValidationStatus("idle");
    },
  });

  const handleValidateLicense = () => {
    if (!stateLicenseNumber || !stateLicenseState || !industrySelection?.sectorId) return;
    setLicenseValidationStatus("validating");
    validateLicenseMutation.mutate({
      licenseNumber: stateLicenseNumber,
      state: stateLicenseState,
      industry: industrySelection.sectorId,
    });
  };

  const checkOrgCodeAvailability = async (code: string) => {
    if (code.length < 2) {
      setOrgCodeStatus("invalid");
      return;
    }
    if (!/^[a-z][a-z0-9]*$/.test(code)) {
      setOrgCodeStatus("invalid");
      return;
    }

    setOrgCodeStatus("checking");
    try {
      const response = await apiRequest('GET', `/api/workspace/org-code/check/${code}`);
      const data = await response.json();
      setOrgCodeStatus(data.available ? "available" : "taken");
    } catch {
      setOrgCodeStatus("idle");
    }
  };

  const handleOrgCodeChange = (value: string) => {
    const lowerValue = value.toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 6);
    setOrgCode(lowerValue);

    if (orgCodeDebounceTimer) clearTimeout(orgCodeDebounceTimer);

    if (lowerValue.length >= 2) {
      const timer = setTimeout(() => {
        checkOrgCodeAvailability(lowerValue);
      }, 500);
      setOrgCodeDebounceTimer(timer);
    } else {
      setOrgCodeStatus(lowerValue.length > 0 ? "invalid" : "idle");
    }
  };

  const [suggestedCode, setSuggestedCode] = useState("");

  useEffect(() => {
    if (orgName.trim().length > 3 && !orgCode) {
      const timer = setTimeout(() => {
        apiRequest('GET', `/api/workspace/suggest-org-code?name=${encodeURIComponent(orgName.trim())}`)
          .then(r => r.json())
          .then(data => {
            if (data?.suggestion && !orgCode) setSuggestedCode(data.suggestion);
          })
          .catch(() => {});
      }, 600);
      return () => clearTimeout(timer);
    } else if (orgCode) {
      setSuggestedCode("");
    }
  }, [orgName, orgCode]);

  const createWorkspaceMutation = useMutation({
    mutationFn: async (formData: {
      name: string;
      description: string;
      size: string;
      orgCode?: string;
      sectorId?: string;
      industryGroupId?: string;
      subIndustryId?: string;
      complianceTemplates?: string[];
      certifications?: string[];
      stateLicenseNumber?: string;
      stateLicenseState?: string;
    }) => {
      const response = await apiRequest('POST', '/api/workspace', formData);
      const result: CreateWorkspaceResponse = await response.json();
      return result;
    },
    onSuccess: async (data) => {
      clearLocalProgress();
      clearProgressMutation.mutate();

      if (tosAgreementId && data.workspace?.id) {
        try {
          await apiRequest("PATCH", "/api/tos/link-workspace", {
            agreementId: tosAgreementId,
            workspaceId: data.workspace.id,
          });
        } catch (e) {
          console.warn("[CreateOrg] TOS workspace link failed:", e);
        }
      }
      toast({
        title: "Organization Created",
        description: `${data.workspace.name} has been created successfully! Organization ID: ${data.workspace.organizationId}`,
      });

      try {
        await Promise.all([
          queryClient.refetchQueries({ queryKey: ["/api/auth/me"] }),
          queryClient.refetchQueries({ queryKey: ["/api/workspace/access"] }),
          queryClient.invalidateQueries({ queryKey: ["/api/workspaces/all"] }),
          queryClient.invalidateQueries({ queryKey: ["/api/workspaces"] }),
          queryClient.invalidateQueries({ queryKey: ["/api/user"] }),
        ]);
      } catch (e) {
        console.warn('[CreateOrg] Auth refetch warning:', e);
      }

      setLocation("/dashboard");
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message || "Failed to create organization",
        variant: "destructive",
      });
    },
  });

  const validateStep = (step: number): boolean => {
    switch (step) {
      case 0:
        if (!orgName.trim()) {
          toast({ title: "Required", description: "Organization name is required", variant: "destructive" });
          return false;
        }
        if (orgCode && orgCodeStatus !== "available") {
          toast({
            title: "Invalid Code",
            description: orgCodeStatus === "taken"
              ? "This organization code is already taken."
              : "Please enter a valid organization code (3-8 alphanumeric characters)",
            variant: "destructive",
          });
          return false;
        }
        return true;
      case 1:
        return true;
      case 2:
        return true;
      case 3:
        if (!tosAgreementId) {
          toast({ title: "Agreement Required", description: "Please sign the Terms of Service before continuing.", variant: "destructive" });
          return false;
        }
        return true;
      case 4:
        return true;
      default:
        return true;
    }
  };

  const goToStep = (step: number) => {
    setCurrentStep(step);
    saveProgress(step, completedSteps, skippedSteps);
  };

  const handleNext = () => {
    if (!validateStep(currentStep)) return;

    const newCompleted = completedSteps.includes(currentStep)
      ? completedSteps
      : [...completedSteps, currentStep];
    const newSkipped = skippedSteps.filter(s => s !== currentStep);

    setCompletedSteps(newCompleted);
    setSkippedSteps(newSkipped);

    const nextStep = currentStep + 1;
    setCurrentStep(nextStep);
    saveProgress(nextStep, newCompleted, newSkipped);
  };

  const handleBack = () => {
    if (currentStep > 0) {
      const prevStep = currentStep - 1;
      setCurrentStep(prevStep);
      saveProgress(prevStep, completedSteps, skippedSteps);
    }
  };

  const handleSkip = () => {
    const newSkipped = skippedSteps.includes(currentStep)
      ? skippedSteps
      : [...skippedSteps, currentStep];
    const newCompleted = completedSteps.filter(s => s !== currentStep);

    setSkippedSteps(newSkipped);
    setCompletedSteps(newCompleted);

    const nextStep = currentStep + 1;
    setCurrentStep(nextStep);
    saveProgress(nextStep, newCompleted, newSkipped);

    toast({
      title: "Step Skipped",
      description: `You can come back to "${STEPS[currentStep].title}" later.`,
    });
  };

  const handleSubmit = () => {
    if (!orgName.trim()) {
      toast({ title: "Error", description: "Organization name is required", variant: "destructive" });
      setCurrentStep(0);
      return;
    }
    if (orgCode && orgCodeStatus !== "available") {
      toast({
        title: "Error",
        description: orgCodeStatus === "taken"
          ? "This organization code is already taken. Please choose another."
          : "Please enter a valid organization code (3-8 alphanumeric characters)",
        variant: "destructive",
      });
      setCurrentStep(0);
      return;
    }

    createWorkspaceMutation.mutate({
      name: orgName.trim(),
      description: orgDescription,
      size,
      orgCode: orgCode || undefined,
      sectorId: industrySelection?.sectorId,
      industryGroupId: industrySelection?.industryGroupId,
      subIndustryId: industrySelection?.subIndustryId,
      complianceTemplates: industrySelection?.complianceTemplates,
      certifications: industrySelection?.certifications,
      stateLicenseNumber: isRegulatedIndustry ? stateLicenseNumber : undefined,
      stateLicenseState: isRegulatedIndustry ? stateLicenseState : undefined,
    });
  };

  const progressPercent = Math.round(((completedSteps.length + skippedSteps.length) / STEPS.length) * 100);

  const canSkipStep = (step: number): boolean => {
    if (step === 0) return false;
    if (step === 3) return false;
    if (step === 4) return false;
    return true;
  };

  const pageConfig: CanvasPageConfig = {
    id: 'create-org',
    title: 'Create New Organization',
    subtitle: 'Set up a new workspace for your team',
    category: 'settings',
    maxWidth: '4xl',
  };

  if (!progressLoaded && serverProgressQuery.isLoading) {
    return (
      <CanvasHubPage config={pageConfig}>
        <Card>
          <CardContent className="flex items-center justify-center py-16">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" data-testid="loader-progress" />
            <span className="ml-2 text-muted-foreground">Loading saved progress...</span>
          </CardContent>
        </Card>
      </CanvasHubPage>
    );
  }

  return (
    <CanvasHubPage config={pageConfig}>
      <Card>
        <CardHeader>
          <div className="flex justify-center mb-4">
            <UnifiedBrandLogo size="xl" />
          </div>

          <div className="space-y-3">
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <p className="text-sm text-muted-foreground">
                Step {currentStep + 1} of {STEPS.length}
              </p>
              <div className="flex items-center gap-2">
                {saveProgressMutation.isPending && (
                  <span className="text-xs text-muted-foreground flex items-center gap-1">
                    <Save className="h-3 w-3" /> Saving...
                  </span>
                )}
                <Badge variant="secondary" data-testid="badge-progress">
                  {progressPercent}% complete
                </Badge>
              </div>
            </div>
            <Progress value={progressPercent} className="h-2" data-testid="progress-bar" />

            <div className="flex gap-1 flex-wrap">
              {STEPS.map((step, idx) => {
                const isCompleted = completedSteps.includes(idx);
                const isSkipped = skippedSteps.includes(idx);
                const isCurrent = currentStep === idx;

                return (
                  <button
                    key={step.id}
                    onClick={() => goToStep(idx)}
                    className={`flex-1 min-w-0 py-1.5 px-2 rounded-md text-xs text-center transition-colors ${
                      isCurrent
                        ? "bg-primary text-primary-foreground"
                        : isCompleted
                        ? "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300"
                        : isSkipped
                        ? "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300"
                        : "bg-muted text-muted-foreground"
                    }`}
                    data-testid={`step-indicator-${idx}`}
                  >
                    <span className="truncate block">{step.title}</span>
                  </button>
                );
              })}
            </div>
          </div>

          <CardTitle className="flex items-center gap-2 mt-2">
            <Building2 className="h-5 w-5" />
            {STEPS[currentStep].title}
          </CardTitle>
          <CardDescription>
            {STEPS[currentStep].description}
          </CardDescription>
        </CardHeader>

        <CardContent>
          {currentStep === 0 && (
            <div className="space-y-6">
              <div>
                <Label htmlFor="orgName">Organization Name *</Label>
                <Input
                  id="orgName"
                  placeholder="Acme Corporation"
                  value={orgName}
                  onChange={(e) => setOrgName(e.target.value)}
                  data-testid="input-org-name"
                  required
                  disabled={createWorkspaceMutation.isPending}
                />
              </div>

              <div>
                <Label htmlFor="orgCode">Organization Code *</Label>
                <p className="text-xs text-muted-foreground mb-2">
                  A short unique code (2-6 characters) for your organization. Your staffing email: staffing@<strong>{orgCode || 'code'}</strong>.{DOMAINS.root}
                </p>
                <div className="relative">
                  <Input
                    id="orgCode"
                    placeholder="e.g., sps"
                    value={orgCode}
                    onChange={(e) => handleOrgCodeChange(e.target.value)}
                    className="lowercase pr-10 font-mono"
                    maxLength={6}
                    data-testid="input-org-code"
                    disabled={createWorkspaceMutation.isPending}
                  />
                  <div className="absolute right-3 top-1/2 -translate-y-1/2">
                    {orgCodeStatus === "checking" && (
                      <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" data-testid="icon-checking" />
                    )}
                    {orgCodeStatus === "available" && (
                      <CheckCircle2 className="h-4 w-4 text-green-500" data-testid="icon-available" />
                    )}
                    {orgCodeStatus === "taken" && (
                      <AlertCircle className="h-4 w-4 text-destructive" data-testid="icon-taken" />
                    )}
                    {orgCodeStatus === "invalid" && orgCode.length > 0 && (
                      <AlertCircle className="h-4 w-4 text-amber-500" data-testid="icon-invalid" />
                    )}
                  </div>
                </div>
                {suggestedCode && !orgCode && (
                  <p className="text-xs text-muted-foreground mt-2" data-testid="org-code-suggestion">
                    Suggested:{' '}
                    <button
                      type="button"
                      className="font-mono text-primary underline hover:text-primary/80"
                      onClick={() => handleOrgCodeChange(suggestedCode)}
                      data-testid="button-use-suggested-code"
                    >
                      {suggestedCode}
                    </button>
                    <span className="ml-1">— your staffing email: staffing@{suggestedCode}.{DOMAINS.root}</span>
                  </p>
                )}
                {orgCodeStatus === "available" && (
                  <p className="text-xs text-green-600 mt-1 flex items-center gap-1">
                    <CheckCircle2 className="h-3 w-3" /> This code is available!
                  </p>
                )}
                {orgCodeStatus === "taken" && (
                  <p className="text-xs text-destructive mt-1">This code is already taken. Try another.</p>
                )}
                {orgCodeStatus === "invalid" && orgCode.length > 0 && (
                  <p className="text-xs text-amber-600 mt-1">Code must be 2-6 letters/numbers, starting with a letter.</p>
                )}
              </div>

              <div>
                <Label htmlFor="size">Company Size</Label>
                <select
                  id="size"
                  className="w-full mt-1 rounded-md border bg-background px-3 py-2"
                  value={size}
                  onChange={(e) => setSize(e.target.value)}
                  data-testid="select-size"
                  disabled={createWorkspaceMutation.isPending}
                >
                  <option value="">Select company size</option>
                  <option value="1-10">1-10 employees</option>
                  <option value="11-50">11-50 employees</option>
                  <option value="51-200">51-200 employees</option>
                  <option value="201-500">201-500 employees</option>
                  <option value="500+">500+ employees</option>
                </select>
              </div>
            </div>
          )}

          {currentStep === 1 && (
            <div className="space-y-6">
              <div>
                <Label htmlFor="description">Description (Optional)</Label>
                <Textarea
                  id="description"
                  placeholder="Tell us about your organization..."
                  value={orgDescription}
                  onChange={(e) => setOrgDescription(e.target.value)}
                  rows={3}
                  data-testid="input-description"
                  disabled={createWorkspaceMutation.isPending}
                />
              </div>

              <div className="pt-2">
                <IndustrySelector
                  onSelectionChange={setIndustrySelection}
                  disabled={createWorkspaceMutation.isPending}
                />
              </div>
            </div>
          )}

          {currentStep === 2 && (
            <div className="space-y-6">
              {isRegulatedIndustry ? (
                <Card className="border-amber-200 bg-amber-50/50 dark:border-amber-900 dark:bg-amber-950/20">
                  <CardHeader className="pb-2">
                    <CardTitle className="flex items-center gap-2 text-base">
                      <Shield className="h-4 w-4 text-amber-600" />
                      State License Information
                      <Badge variant="secondary" className="bg-amber-100 text-amber-700 dark:bg-amber-900 dark:text-amber-300">
                        Regulated Industry
                      </Badge>
                    </CardTitle>
                    <CardDescription className="text-sm">
                      {industrySelection?.sectorName === "Security & Protective Services"
                        ? "Security companies are required to have valid state licensing. Enter your company's license number for compliance tracking."
                        : "Healthcare providers require state licensing. Enter your facility's license information."
                      }
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div>
                        <Label htmlFor="stateLicenseState">License State</Label>
                        <Select
                          value={stateLicenseState}
                          onValueChange={(value) => {
                            setStateLicenseState(value);
                            setLicenseValidationStatus("idle");
                          }}
                          disabled={createWorkspaceMutation.isPending}
                        >
                          <SelectTrigger id="stateLicenseState" data-testid="select-license-state">
                            <SelectValue placeholder="Select state" />
                          </SelectTrigger>
                          <SelectContent>
                            {STATE_CODES.map((state) => (
                              <SelectItem key={state.code} value={state.code}>
                                {state.name} ({state.code})
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        {selectedStateInfo && (
                          <p className="text-xs text-muted-foreground mt-1">
                            Regulator: {selectedStateInfo.regulator}
                          </p>
                        )}
                      </div>
                      <div>
                        <Label htmlFor="stateLicenseNumber">License Number</Label>
                        <div className="flex gap-2">
                          <Input
                            id="stateLicenseNumber"
                            placeholder="e.g., C11608501"
                            value={stateLicenseNumber}
                            onChange={(e) => {
                              setStateLicenseNumber(e.target.value.toUpperCase());
                              setLicenseValidationStatus("idle");
                            }}
                            data-testid="input-license-number"
                            disabled={createWorkspaceMutation.isPending}
                            className="font-mono"
                          />
                          <Button
                            type="button"
                            variant="outline"
                            size="icon"
                            onClick={handleValidateLicense}
                            disabled={!stateLicenseNumber || !stateLicenseState || validateLicenseMutation.isPending}
                            data-testid="button-validate-license"
                          >
                            {validateLicenseMutation.isPending ? (
                              <Loader2 className="h-4 w-4 animate-spin" />
                            ) : licenseValidationStatus === "valid" ? (
                              <CheckCircle2 className="h-4 w-4 text-green-500" />
                            ) : licenseValidationStatus === "invalid" ? (
                              <AlertCircle className="h-4 w-4 text-red-500" />
                            ) : (
                              <Shield className="h-4 w-4" />
                            )}
                          </Button>
                        </div>
                        {licenseValidationStatus === "valid" && (
                          <p className="text-xs text-green-600 dark:text-green-400 mt-1 flex items-center gap-1">
                            <CheckCircle2 className="h-3 w-3" />
                            Trinity AI verified license format
                          </p>
                        )}
                        {licenseValidationStatus === "invalid" && (
                          <p className="text-xs text-red-600 dark:text-red-400 mt-1 flex items-center gap-1">
                            <AlertCircle className="h-3 w-3" />
                            Please verify license format
                          </p>
                        )}
                      </div>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      License validation helps ensure compliance. You can update license details later in Settings.
                    </p>
                  </CardContent>
                </Card>
              ) : (
                <div className="text-center py-8 text-muted-foreground">
                  <Shield className="h-10 w-10 mx-auto mb-3 opacity-30" />
                  <p className="text-sm">
                    {industrySelection
                      ? "Your selected industry does not require additional licensing. You can skip this step."
                      : "Select an industry in the previous step to check for licensing requirements, or skip this step."}
                  </p>
                </div>
              )}
            </div>
          )}

          {currentStep === 3 && (
            <div className="space-y-2">
              <TOSAgreementStep
                agreementType="org_registration"
                email={currentUserQuery.data?.email || ""}
                orgName={orgName}
                onComplete={(id) => {
                  setTosAgreementId(id);
                  const newCompleted = completedSteps.includes(3) ? completedSteps : [...completedSteps, 3];
                  setCompletedSteps(newCompleted);
                  setCurrentStep(4);
                  saveProgress(4, newCompleted, skippedSteps);
                }}
              />
            </div>
          )}

          {currentStep === 4 && (
            <div className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <p className="text-xs text-muted-foreground">Organization Name</p>
                  <p className="font-medium" data-testid="review-org-name">{orgName || "Not set"}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Organization Code</p>
                  <p className="font-medium font-mono" data-testid="review-org-code">{orgCode || "Auto-generated"}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Company Size</p>
                  <p className="font-medium" data-testid="review-size">{size || "Not specified"}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Industry</p>
                  <p className="font-medium" data-testid="review-industry">{industrySelection?.sectorName || "Not selected"}</p>
                </div>
              </div>

              {orgDescription && (
                <div>
                  <p className="text-xs text-muted-foreground">Description</p>
                  <p className="text-sm" data-testid="review-description">{orgDescription}</p>
                </div>
              )}

              {isRegulatedIndustry && (stateLicenseState || stateLicenseNumber) && (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <p className="text-xs text-muted-foreground">License State</p>
                    <p className="font-medium" data-testid="review-license-state">
                      {STATE_CODES.find(s => s.code === stateLicenseState)?.name || "Not set"}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">License Number</p>
                    <p className="font-medium font-mono" data-testid="review-license-number">
                      {stateLicenseNumber || "Not set"}
                    </p>
                  </div>
                </div>
              )}

              {skippedSteps.length > 0 && (
                <div className="flex items-center gap-2 text-amber-600 dark:text-amber-400 text-sm">
                  <AlertCircle className="h-4 w-4" />
                  <span>
                    You skipped: {skippedSteps.map(s => STEPS[s].title).join(", ")}. You can go back to complete them.
                  </span>
                </div>
              )}
            </div>
          )}

          <div className="flex items-center justify-between gap-2 pt-6 flex-wrap">
            <div className="flex gap-2">
              {currentStep > 0 && (
                <Button
                  type="button"
                  variant="outline"
                  onClick={handleBack}
                  disabled={createWorkspaceMutation.isPending}
                  data-testid="button-back"
                >
                  <ChevronLeft className="h-4 w-4 mr-1" />
                  Back
                </Button>
              )}
              <Button
                type="button"
                variant="outline"
                onClick={() => setLocation("/dashboard")}
                data-testid="button-cancel"
                disabled={createWorkspaceMutation.isPending}
              >
                Cancel
              </Button>
            </div>

            <div className="flex gap-2">
              {canSkipStep(currentStep) && currentStep < STEPS.length - 1 && (
                <Button
                  type="button"
                  variant="ghost"
                  onClick={handleSkip}
                  disabled={createWorkspaceMutation.isPending}
                  data-testid="button-skip"
                >
                  <SkipForward className="h-4 w-4 mr-1" />
                  Skip
                </Button>
              )}

              {currentStep < STEPS.length - 1 && currentStep !== 3 ? (
                <Button
                  type="button"
                  onClick={handleNext}
                  disabled={createWorkspaceMutation.isPending}
                  data-testid="button-next"
                >
                  Next
                  <ChevronRight className="h-4 w-4 ml-1" />
                </Button>
              ) : currentStep === STEPS.length - 1 ? (
                <Button
                  type="button"
                  onClick={handleSubmit}
                  data-testid="button-create-org"
                  disabled={createWorkspaceMutation.isPending}
                >
                  {createWorkspaceMutation.isPending ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      Creating...
                    </>
                  ) : (
                    <>
                      <Plus className="h-4 w-4 mr-2" />
                      Create Organization
                    </>
                  )}
                </Button>
              ) : null}
            </div>
          </div>
        </CardContent>
      </Card>
    </CanvasHubPage>
  );
}
