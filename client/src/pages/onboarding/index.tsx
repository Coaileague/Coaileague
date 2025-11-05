import { useEffect, useState } from "react";
import { useParams, useLocation } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { CheckCircle2, Circle, Loader2, AlertCircle } from "lucide-react";
import { PersonalInfoStep } from "./personal-info-step";
import { TaxSelectionStep } from "./tax-selection-step";
import { PayrollInfoStep } from "./payroll-info-step";
import { WorkAvailabilityStep } from "./work-availability-step";
import { DocumentUploadStep } from "./document-upload-step";
import { ContractsStep } from "./contracts-step";
import { queryClient, apiRequest } from "@/lib/queryClient";

type OnboardingStep = 
  | 'personal_info' 
  | 'tax_selection'
  | 'payroll_info'
  | 'tax_forms' 
  | 'contract_signature' 
  | 'document_upload' 
  | 'work_availability' 
  | 'certifications' 
  | 'acknowledgements' 
  | 'completed';

interface OnboardingApplication {
  id: string;
  workspaceId: string;
  employeeNumber: string;
  firstName: string;
  lastName: string;
  email: string;
  currentStep: OnboardingStep;
  status: string;
  taxClassification?: 'w4_employee' | 'w9_contractor';
}

const allSteps: { id: OnboardingStep; label: string; description: string; requiresW4?: boolean }[] = [
  { id: 'personal_info', label: 'Personal Info', description: 'Basic information' },
  { id: 'tax_selection', label: 'Tax Classification', description: 'W-4 or W-9' },
  { id: 'payroll_info', label: 'Payroll Setup', description: 'Direct deposit & W-4', requiresW4: true },
  { id: 'work_availability', label: 'Availability', description: 'Work schedule' },
  { id: 'document_upload', label: 'Documents', description: 'ID & certifications' },
  { id: 'contract_signature', label: 'Agreements', description: 'Sign contracts' },
  { id: 'completed', label: 'Complete', description: 'All done!' },
];

export default function OnboardingPage() {
  const { token } = useParams<{ token: string }>();
  const [, navigate] = useLocation();
  const [applicationId, setApplicationId] = useState<string | null>(null);
  const [workspaceId, setWorkspaceId] = useState<string | null>(null);

  // Fetch invite by token
  const { data: invite, isLoading: inviteLoading, error: inviteError } = useQuery({
    queryKey: ['/api/onboarding/invite', token],
    enabled: !!token && !applicationId,
  });

  // Fetch application if it exists
  const { data: application, isLoading: appLoading } = useQuery<OnboardingApplication>({
    queryKey: ['/api/onboarding/application', applicationId, workspaceId],
    enabled: !!applicationId && !!workspaceId,
  });

  // Create application mutation
  const createApplicationMutation = useMutation({
    mutationFn: async (data: any) => {
      const response = await apiRequest('POST', '/api/onboarding/application', data);
      return response.json();
    },
    onSuccess: (data: OnboardingApplication) => {
      setApplicationId(data.id);
      setWorkspaceId(data.workspaceId);
      queryClient.invalidateQueries({ queryKey: ['/api/onboarding/application'] });
    },
  });

  // Auto-create application when invite is loaded
  useEffect(() => {
    if (invite && !applicationId && !createApplicationMutation.isPending) {
      createApplicationMutation.mutate({ inviteToken: token });
    }
  }, [invite, applicationId, token]);

  const isW4Employee = application?.taxClassification === 'w4_employee';
  
  const steps = allSteps.filter(step => {
    if (step.requiresW4) {
      return isW4Employee;
    }
    return true;
  });

  const currentStepIndex = steps.findIndex(s => s.id === application?.currentStep) || 0;
  const progress = ((currentStepIndex + 1) / steps.length) * 100;

  const updateStepMutation = useMutation({
    mutationFn: async (data: Partial<OnboardingApplication>) => {
      const response = await apiRequest('PATCH', `/api/onboarding/application/${applicationId}`, {
        workspaceId,
        ...data,
      });
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/onboarding/application', applicationId] });
    },
  });

  const nextStep = (data?: any) => {
    const currentIndex = steps.findIndex(s => s.id === application?.currentStep);
    const nextStepId = steps[currentIndex + 1]?.id;
    
    if (nextStepId) {
      updateStepMutation.mutate({
        currentStep: nextStepId,
        ...data,
      });
    }
  };

  if (inviteLoading || appLoading || createApplicationMutation.isPending) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-background">
        <Card className="w-full max-w-md">
          <CardContent className="flex flex-col items-center gap-4 py-8">
            <Loader2 className="h-8 w-8 animate-spin text-primary" data-testid="loader-onboarding" />
            <p className="text-muted-foreground">Loading your onboarding...</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (inviteError || !invite) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-background">
        <Card className="w-full max-w-md">
          <CardHeader>
            <div className="flex items-center gap-2">
              <AlertCircle className="h-5 w-5 text-destructive" />
              <CardTitle>Invalid Invitation</CardTitle>
            </div>
            <CardDescription>
              This invitation link is invalid, expired, or has already been used.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button onClick={() => navigate('/')} data-testid="button-back-home">
              Return to Home
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (application?.status === 'completed') {
    return (
      <div className="flex items-center justify-center min-h-screen bg-background">
        <Card className="w-full max-w-md">
          <CardHeader>
            <div className="flex items-center gap-2">
              <CheckCircle2 className="h-6 w-6 text-green-600" />
              <CardTitle>Onboarding Complete!</CardTitle>
            </div>
            <CardDescription>
              Your employee number is: <strong>{application.employeeNumber}</strong>
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Alert>
              <AlertDescription>
                Thank you for completing your onboarding. HR will review your application and contact you shortly.
              </AlertDescription>
            </Alert>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background py-8 px-4">
      <div className="max-w-4xl mx-auto">
        <Card>
          <CardHeader>
            <CardTitle>Employee Onboarding</CardTitle>
            <CardDescription>
              Employee #{application?.employeeNumber} | {application?.firstName} {application?.lastName}
            </CardDescription>
            <div className="mt-4">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm text-muted-foreground">Progress</span>
                <span className="text-sm font-medium">{Math.round(progress)}%</span>
              </div>
              <Progress value={progress} data-testid="progress-onboarding" />
            </div>
          </CardHeader>

          <CardContent className="space-y-6">
            {/* Step Indicators */}
            <div className="flex items-center justify-between gap-2 overflow-x-auto pb-2">
              {steps.map((step, index) => {
                const isActive = step.id === application?.currentStep;
                const isComplete = index < currentStepIndex;

                return (
                  <div 
                    key={step.id} 
                    className="flex flex-col items-center min-w-[100px]"
                    data-testid={`step-indicator-${step.id}`}
                  >
                    <div className={`flex items-center justify-center w-10 h-10 rounded-full border-2 ${
                      isActive ? 'border-primary bg-primary text-primary-foreground' :
                      isComplete ? 'border-green-600 bg-green-600 text-white' :
                      'border-muted bg-background'
                    }`}>
                      {isComplete ? (
                        <CheckCircle2 className="h-5 w-5" />
                      ) : isActive ? (
                        <Circle className="h-5 w-5 fill-current" />
                      ) : (
                        <span className="text-xs">{index + 1}</span>
                      )}
                    </div>
                    <span className="text-xs mt-2 text-center font-medium">{step.label}</span>
                    <span className="text-[10px] text-muted-foreground">{step.description}</span>
                  </div>
                );
              })}
            </div>

            {/* Current Step Content */}
            <div className="border-t pt-6">
              {application?.currentStep === 'personal_info' && (
                <PersonalInfoStep application={application} onNext={nextStep} />
              )}
              {application?.currentStep === 'tax_selection' && (
                <TaxSelectionStep application={application} onNext={nextStep} />
              )}
              {application?.currentStep === 'payroll_info' && isW4Employee && (
                <PayrollInfoStep application={application} onNext={nextStep} />
              )}
              {application?.currentStep === 'work_availability' && (
                <WorkAvailabilityStep application={application} onNext={nextStep} />
              )}
              {application?.currentStep === 'document_upload' && (
                <DocumentUploadStep application={application} onNext={nextStep} />
              )}
              {application?.currentStep === 'contract_signature' && (
                <ContractsStep application={application} onNext={() => {
                  updateStepMutation.mutate({ status: 'completed' });
                }} />
              )}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
