import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { CheckCircle2, FileText, Loader2, AlertCircle, PenTool } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";

interface ContractsStepProps {
  application: any;
  onNext: () => void;
  onBack?: () => void;
}

interface ContractDocument {
  id: string;
  documentType: string;
  documentTitle: string;
  documentContent: string;
  status: 'pending' | 'signed' | 'declined';
  signedAt?: string;
  signedByName?: string;
}

export function ContractsStep({ application, onNext, onBack }: ContractsStepProps) {
  const [signatures, setSignatures] = useState<Record<string, string>>({});
  const [signingContract, setSigningContract] = useState<string | null>(null);
  const { toast } = useToast();

  // Fetch required contracts based on tax classification
  const { data: contracts, isLoading } = useQuery<ContractDocument[]>({
    queryKey: ['/api/onboarding/contracts', application.id, application.workspaceId],
    queryFn: async () => {
      const response = await fetch(
        `/api/onboarding/contracts/${application.id}?workspaceId=${application.workspaceId}`
      );
      if (!response.ok) {
        throw new Error('Failed to fetch contracts');
      }
      return response.json();
    },
    enabled: !!application.id && !!application.workspaceId,
  });

  // Sign contract mutation
  const signMutation = useMutation({
    mutationFn: async ({ contractId, signatureName }: { contractId: string; signatureName: string }) => {
      return await apiRequest(
        `/api/onboarding/contracts/${contractId}/sign?workspaceId=${application.workspaceId}`,
        'POST',
        {
          signedByName: signatureName,
          applicationId: application.id,
        }
      );
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ 
        queryKey: ['/api/onboarding/contracts', application.id, application.workspaceId] 
      });
      toast({
        title: "Contract Signed",
        description: "Your signature has been recorded successfully",
      });
      setSigningContract(null);
    },
    onError: (error: any) => {
      toast({
        title: "Signature Failed",
        description: error.message || "Failed to record signature",
        variant: "destructive",
      });
    },
  });

  const handleSign = (contractId: string) => {
    const signatureName = signatures[contractId];
    if (!signatureName || signatureName.trim().length < 2) {
      toast({
        title: "Invalid Signature",
        description: "Please enter your full legal name",
        variant: "destructive",
      });
      return;
    }
    signMutation.mutate({ contractId, signatureName: signatureName.trim() });
  };

  const allContractsSigned = contracts?.every(c => c.status === 'signed') || false;
  const pendingContracts = contracts?.filter(c => c.status === 'pending') || [];
  const signedContracts = contracts?.filter(c => c.status === 'signed') || [];

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div>
      <h3 className="text-lg font-semibold mb-2">Legal Agreements & Forms</h3>
      <p className="text-sm text-muted-foreground mb-6">
        Please review and sign all required documents to complete your onboarding.
      </p>

      {/* Progress Summary */}
      <Alert className="mb-6">
        <FileText className="h-4 w-4" />
        <AlertDescription>
          <div className="flex items-center justify-between">
            <span>
              {signedContracts.length} of {contracts?.length || 0} documents signed
            </span>
            {allContractsSigned && (
              <Badge variant="default" className="ml-2">
                <CheckCircle2 className="h-3 w-3 mr-1" />
                Complete
              </Badge>
            )}
          </div>
        </AlertDescription>
      </Alert>

      {/* Pending Contracts */}
      {pendingContracts.length > 0 && (
        <div className="space-y-4 mb-6">
          <h4 className="font-medium text-sm">Pending Signatures</h4>
          {pendingContracts.map((contract) => (
            <Card key={contract.id}>
              <CardHeader>
                <div className="flex items-start justify-between">
                  <div>
                    <CardTitle className="text-base">{contract.documentTitle}</CardTitle>
                    <CardDescription className="text-xs mt-1">
                      {getContractDescription(contract.documentType)}
                    </CardDescription>
                  </div>
                  <Badge variant="secondary">Pending</Badge>
                </div>
              </CardHeader>
              <CardContent>
                {/* Document Content Preview */}
                <ScrollArea className="h-48 rounded-md border p-4 mb-4 bg-muted/30">
                  <div className="text-sm whitespace-pre-wrap font-mono text-xs">
                    {contract.documentContent}
                  </div>
                </ScrollArea>

                {/* Signature Section */}
                {signingContract === contract.id ? (
                  <div className="space-y-4 border-t pt-4">
                    <Alert>
                      <PenTool className="h-4 w-4" />
                      <AlertDescription className="text-xs">
                        By typing your full legal name below, you agree to the terms and conditions 
                        outlined in this document. This constitutes a legally binding electronic signature.
                      </AlertDescription>
                    </Alert>

                    <div className="space-y-2">
                      <Label htmlFor={`signature-${contract.id}`} className="text-sm">
                        Full Legal Name (as it appears on your ID)
                      </Label>
                      <Input
                        id={`signature-${contract.id}`}
                        placeholder="John Doe"
                        value={signatures[contract.id] || ''}
                        onChange={(e) => setSignatures({ ...signatures, [contract.id]: e.target.value })}
                        className="font-serif text-lg"
                        data-testid={`input-signature-${contract.documentType}`}
                      />
                    </div>

                    <div className="flex gap-2">
                      <Button
                        onClick={() => handleSign(contract.id)}
                        disabled={signMutation.isPending || !signatures[contract.id]?.trim()}
                        data-testid={`button-sign-${contract.documentType}`}
                      >
                        {signMutation.isPending ? (
                          <>
                            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                            Signing...
                          </>
                        ) : (
                          <>
                            <PenTool className="mr-2 h-4 w-4" />
                            Sign Document
                          </>
                        )}
                      </Button>
                      <Button
                        variant="outline"
                        onClick={() => setSigningContract(null)}
                        disabled={signMutation.isPending}
                        data-testid="button-cancel-sign"
                      >
                        Cancel
                      </Button>
                    </div>
                  </div>
                ) : (
                  <Button
                    onClick={() => setSigningContract(contract.id)}
                    variant="default"
                    className="w-full"
                    data-testid={`button-review-${contract.documentType}`}
                  >
                    <PenTool className="mr-2 h-4 w-4" />
                    Review & Sign
                  </Button>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Signed Contracts */}
      {signedContracts.length > 0 && (
        <div className="space-y-4 mb-6">
          <h4 className="font-medium text-sm">Completed Signatures</h4>
          {signedContracts.map((contract) => (
            <Card key={contract.id} className="bg-muted/30">
              <CardHeader className="pb-3">
                <div className="flex items-start justify-between">
                  <div>
                    <CardTitle className="text-sm">{contract.documentTitle}</CardTitle>
                    <CardDescription className="text-xs mt-1">
                      Signed by {contract.signedByName} on {new Date(contract.signedAt!).toLocaleDateString()}
                    </CardDescription>
                  </div>
                  <Badge variant="default" className="bg-green-600">
                    <CheckCircle2 className="h-3 w-3 mr-1" />
                    Signed
                  </Badge>
                </div>
              </CardHeader>
            </Card>
          ))}
        </div>
      )}

      {/* Navigation */}
      <Separator className="my-6" />
      <div className="flex justify-between">
        {onBack && (
          <Button
            type="button"
            variant="outline"
            onClick={onBack}
            data-testid="button-back"
          >
            Back
          </Button>
        )}
        <Button
          onClick={onNext}
          disabled={!allContractsSigned}
          className="ml-auto"
          data-testid="button-next-contracts"
        >
          {allContractsSigned ? 'Complete Onboarding' : 'Sign All Documents to Continue'}
        </Button>
      </div>
    </div>
  );
}

function getContractDescription(documentType: string): string {
  const descriptions: Record<string, string> = {
    'i9_form': 'Federal employment eligibility verification (required within 3 business days)',
    'w4_form': 'Federal tax withholding form for employees',
    'w9_form': 'Tax information form for independent contractors',
    'employee_contract': 'Employment agreement outlining terms and conditions',
    'contractor_agreement': 'Independent contractor agreement',
    'handbook': 'Company policies and procedures acknowledgment',
    'confidentiality': 'Non-disclosure and confidentiality agreement',
    'drug_free_policy': 'Drug-free workplace policy acknowledgment',
    'sop_acknowledgement': 'Standard operating procedures acknowledgment',
  };
  return descriptions[documentType] || 'Legal document requiring signature';
}
