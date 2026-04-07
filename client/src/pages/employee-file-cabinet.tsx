import { useState } from "react";
import { secureFetch } from "@/lib/csrf";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useRoute, useLocation } from "wouter";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { UniversalModal, UniversalModalDescription, UniversalModalHeader, UniversalModalTitle, UniversalModalContent } from '@/components/ui/universal-modal';
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ScrollArea } from "@/components/ui/scroll-area";
import { FileText, Download, Eye, Lock, Unlock, CheckCircle, XCircle, Clock, Shield, AlertTriangle, Printer, Share2, FileDown, History, Pen, Send, ChevronLeft } from "lucide-react";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { format } from "date-fns";
import { CanvasHubPage, type CanvasPageConfig } from "@/components/canvas-hub";

// Document type labels
const DOCUMENT_TYPE_LABELS: Record<string, string> = {
  cover_sheet: "Officer File Cover Sheet",
  guard_card: "Security Guard Card",
  guard_card_copy: "Guard Card Copy (Front & Back, Color)",
  zero_policy_drug_form: "Zero Tolerance Drug Policy Form",
  drug_test: "Drug Screening Results",
  government_id: "Government ID",
  photo_id_copy: "Photo ID Copy (Front & Back, Color)",
  passport: "Passport",
  ssn_card: "Social Security Card",
  i9_form: "I-9 Form",
  w4_form: "W-4 Form",
  w9_form: "W-9 Form",
  tax_form: "Tax Withholding Form",
  certification: "Professional Certification",
  license: "Professional License",
  background_check: "Background Check",
  training_certificate: "Training Certificate",
  firearms_permit: "Firearms Permit",
  firearms_qualification: "Firearms Qualification",
  supervisor_training: "Supervisor Training",
  social_security_card: "Social Security Card",
  direct_deposit_form: "Direct Deposit Authorization",
  policy_acknowledgment: "Policy Acknowledgment",
  employment_contract: "Employment Contract",
  sop_acknowledgement: "SOP Acknowledgement",
  policy_signature: "Policy Signature",
  custom_form: "Custom Form",
  other: "Other Document",
};

// Status badge configuration
const STATUS_CONFIG: Record<string, { label: string; variant: any; icon: any }> = {
  uploaded: { label: "Uploaded", variant: "outline", icon: Clock },
  pending_review: { label: "Pending Review", variant: "secondary", icon: Clock },
  approved: { label: "Approved", variant: "default", icon: CheckCircle },
  rejected: { label: "Rejected", variant: "destructive", icon: XCircle },
  expired: { label: "Expired", variant: "destructive", icon: AlertTriangle },
  archived: { label: "Archived", variant: "outline", icon: FileText },
};

function DocumentCard({ document, onViewAccess, onLogAccess }: any) {
  const StatusIcon = STATUS_CONFIG[document.status]?.icon || FileText;
  const isLocked = document.isImmutable && document.digitalSignatureHash;

  return (
    <Card className="hover-elevate" data-testid={`document-card-${document.id}`}>
      <CardHeader>
        <div className="flex items-start justify-between gap-2">
          <div className="flex-1">
            <div className="flex items-center gap-2 mb-2">
              <FileText className="h-5 w-5 text-primary" />
              <CardTitle className="text-base">{DOCUMENT_TYPE_LABELS[document.documentType] || document.documentType}</CardTitle>
              {isLocked && (
                <Badge variant="secondary" className="flex items-center gap-1">
                  <Lock className="h-3 w-3" />
                  Locked
                </Badge>
              )}
            </div>
            <CardDescription>
              Uploaded {format(new Date(document.uploadedAt), "MMM d, yyyy 'at' h:mm a")}
            </CardDescription>
          </div>
          <Badge variant={STATUS_CONFIG[document.status]?.variant || "outline"} className="flex items-center gap-1">
            <StatusIcon className="h-3 w-3" />
            {STATUS_CONFIG[document.status]?.label || document.status}
          </Badge>
        </div>
      </CardHeader>
      <CardContent>
        <div className="space-y-3">
          {document.description && (
            <p className="text-sm text-muted-foreground">{document.description}</p>
          )}

          <div className="grid grid-cols-2 gap-2 text-sm">
            <div>
              <span className="text-muted-foreground">Uploaded by:</span>
              <p className="font-medium">{document.uploadedByEmail}</p>
            </div>
            <div>
              <span className="text-muted-foreground">Role:</span>
              <p className="font-medium capitalize">{document.uploadedByRole}</p>
            </div>
          </div>

          {document.expirationDate && (
            <Alert variant={new Date(document.expirationDate) < new Date() ? "destructive" : "default"}>
              <AlertTriangle className="h-4 w-4" />
              <AlertDescription className="text-xs">
                Expires: {format(new Date(document.expirationDate), "MMM d, yyyy")}
              </AlertDescription>
            </Alert>
          )}

          {document.approvedAt && (
            <div className="text-xs text-muted-foreground">
              Approved by {document.approvedBy} on {format(new Date(document.approvedAt), "MMM d, yyyy")}
              {document.approvalNotes && <p className="mt-1 italic">"{document.approvalNotes}"</p>}
            </div>
          )}

          {document.rejectedAt && (
            <Alert variant="destructive">
              <XCircle className="h-4 w-4" />
              <AlertDescription className="text-xs">
                Rejected by {document.rejectedBy} on {format(new Date(document.rejectedAt), "MMM d, yyyy")}
                {document.rejectionReason && <p className="mt-1 font-medium">Reason: {document.rejectionReason}</p>}
              </AlertDescription>
            </Alert>
          )}

          {isLocked && (
            <div className="flex items-center gap-2 text-xs bg-muted p-2 rounded">
              <Shield className="h-4 w-4 text-primary" />
              <div>
                <p className="font-medium">Tamper-Proof Document</p>
                <p className="text-muted-foreground">SHA-256: {document.digitalSignatureHash?.substring(0, 16)}...</p>
              </div>
            </div>
          )}

          <div className="flex gap-2 pt-2">
            <Button 
              size="sm" 
              variant="outline" 
              onClick={() => onLogAccess(document.id, 'view')}
              data-testid={`button-view-${document.id}`}
            >
              <Eye className="h-4 w-4 mr-1" />
              View
            </Button>
            <Button 
              size="sm" 
              variant="outline" 
              onClick={() => onLogAccess(document.id, 'download')}
              data-testid={`button-download-${document.id}`}
            >
              <Download className="h-4 w-4 mr-1" />
              Download
            </Button>
            <Button 
              size="sm" 
              variant="outline" 
              onClick={() => onViewAccess(document.id)}
              data-testid={`button-audit-${document.id}`}
            >
              <History className="h-4 w-4 mr-1" />
              Audit Trail
            </Button>
          </div>

          <div className="text-xs text-muted-foreground pt-2 border-t">
            <p>Retention: {document.retentionPeriodYears} years | Delete after: {format(new Date(document.deleteAfter), "MMM d, yyyy")}</p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function AccessLogDialog({ open, onOpenChange, documentId }: { open: boolean; onOpenChange: (open: boolean) => void; documentId: string | null }) {
  const { data: accessLogs, isLoading } = useQuery<any[]>({
    queryKey: ['/api/hireos/documents', documentId, 'access-logs'],
    enabled: open && !!documentId,
  });

  return (
    <UniversalModal open={open} onOpenChange={onOpenChange}>
      <UniversalModalContent size="full" className="max-h-[80vh]">
        <UniversalModalHeader>
          <UniversalModalTitle>Document Access Audit Trail</UniversalModalTitle>
          <UniversalModalDescription>Complete record of all access events for compliance</UniversalModalDescription>
        </UniversalModalHeader>

        <ScrollArea className="h-[500px]">
          {isLoading ? (
            <div className="text-center py-8">
              <div className="animate-spin w-8 h-8 border-4 border-primary border-t-transparent rounded-full mx-auto" />
            </div>
          ) : accessLogs && accessLogs.length > 0 ? (
            <div className="space-y-2">
              {accessLogs.map((log: any) => (
                <Card key={log.id} data-testid={`access-log-${log.id}`}>
                  <CardContent className="p-4">
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-1">
                          {log.accessType === 'view' && <Eye className="h-4 w-4 text-blue-500" />}
                          {log.accessType === 'download' && <Download className="h-4 w-4 text-blue-500" />}
                          {log.accessType === 'print' && <Printer className="h-4 w-4 text-purple-500" />}
                          {log.accessType === 'share' && <Share2 className="h-4 w-4 text-orange-500" />}
                          <span className="font-medium capitalize">{log.accessType}</span>
                        </div>
                        <div className="grid grid-cols-2 gap-2 text-sm text-muted-foreground">
                          <div>
                            <p><strong>User:</strong> {log.accessedByEmail}</p>
                            <p><strong>Role:</strong> {log.accessedByRole}</p>
                          </div>
                          <div>
                            <p><strong>IP:</strong> {log.ipAddress}</p>
                            <p><strong>Device:</strong> {log.userAgent?.substring(0, 50)}...</p>
                          </div>
                        </div>
                      </div>
                      <Badge variant="outline">
                        {format(new Date(log.accessedAt), "MMM d, yyyy h:mm a")}
                      </Badge>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          ) : (
            <div className="text-center py-8 text-muted-foreground">
              <History className="h-12 w-12 mx-auto mb-3 opacity-50" />
              <p>No access records yet</p>
            </div>
          )}
        </ScrollArea>
      </UniversalModalContent>
    </UniversalModal>
  );
}

function PendingSignatureCard({ sig, onSign }: { sig: any; onSign: (sig: any) => void }) {
  return (
    <Card className="hover-elevate border-amber-200 dark:border-amber-900" data-testid={`pending-sig-${sig.id}`}>
      <CardContent className="p-4">
        <div className="flex items-start gap-3">
          <div className="p-2 bg-amber-100 dark:bg-amber-900/30 rounded-lg">
            <Pen className="w-5 h-5 text-amber-600 dark:text-amber-400" />
          </div>
          <div className="flex-1 min-w-0">
            <h4 className="font-medium truncate">{sig.document?.fileName || 'Document'}</h4>
            <p className="text-sm text-muted-foreground truncate">
              {sig.document?.description || 'Signature requested'}
            </p>
            <div className="flex items-center gap-2 mt-2 flex-wrap">
              <Badge variant="outline" className="text-xs">
                <Clock className="w-3 h-3 mr-1" /> Awaiting Your Signature
              </Badge>
              {sig.requestedAt && (
                <span className="text-xs text-muted-foreground">
                  Requested {format(new Date(sig.requestedAt), "MMM d, yyyy")}
                </span>
              )}
            </div>
            {sig.expiresAt && (
              <div className="mt-1">
                <span className="text-xs text-amber-600 dark:text-amber-400">
                  Expires {format(new Date(sig.expiresAt), "MMM d, yyyy")}
                </span>
              </div>
            )}
          </div>
        </div>
        <div className="flex gap-2 mt-3 pt-3 border-t">
          <Button size="sm" onClick={() => onSign(sig)} data-testid={`button-sign-pending-${sig.id}`}>
            <Pen className="w-4 h-4 mr-1" /> Sign Now
          </Button>
          <Button size="sm" variant="ghost" data-testid={`button-view-pending-${sig.id}`}>
            <Eye className="w-4 h-4 mr-1" /> Preview
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

export default function EmployeeFileCabinet() {
  const [, params] = useRoute("/employees/:employeeId/file-cabinet");
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const [selectedDocId, setSelectedDocId] = useState<string | null>(null);
  const [filterType, setFilterType] = useState<string>("all");
  const [filterStatus, setFilterStatus] = useState<string>("all");

  const [showSignDialog, setShowSignDialog] = useState(false);
  const [signingItem, setSigningItem] = useState<any>(null);
  const [signatureData, setSignatureData] = useState("");
  const canvasRef = useState<HTMLCanvasElement | null>(null);

  const employeeId = params?.employeeId;

  const { data: employee } = useQuery<any>({
    queryKey: ['/api/employees', employeeId],
    enabled: !!employeeId,
  });

  const { data: pendingSignatures } = useQuery<any>({
    queryKey: ["/api/documents/my/pending-signatures"],
  });

  const signMutation = useMutation({
    mutationFn: async ({ signatureRequestId, signatureData: sigData }: { signatureRequestId: string; signatureData: string }) => {
      return await apiRequest('POST', `/api/documents/${signatureRequestId}/sign-internal`, { signatureData: sigData, signatureType: "drawn" });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/documents/my/pending-signatures"] });
      queryClient.invalidateQueries({ queryKey: ['/api/hireos/documents', employeeId] });
      setShowSignDialog(false);
      setSigningItem(null);
      setSignatureData("");
      toast({ title: "Document signed successfully" });
    },
    onError: (err: any) => {
      toast({ title: "Signing failed", description: err.message, variant: "destructive" });
    },
  });

  const handleSignPending = (sig: any) => {
    setSigningItem(sig);
    setShowSignDialog(true);
  };

  const { data: documents, isLoading: isLoadingDocs } = useQuery<any[]>({
    queryKey: ['/api/hireos/documents', employeeId, filterType, filterStatus],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (filterType !== "all") params.append("documentType", filterType);
      if (filterStatus !== "all") params.append("status", filterStatus);
      
      const response = await secureFetch(`/api/hireos/documents/${employeeId}?${params.toString()}`, {
        credentials: 'include'
      });
      if (!response.ok) throw new Error("Failed to fetch documents");
      return response.json();
    },
    enabled: !!employeeId,
  });

  // Log document access
  const logAccessMutation = useMutation({
    mutationFn: async ({ documentId, accessType }: { documentId: string; accessType: string }) => {
      return await apiRequest('POST', `/api/hireos/documents/${documentId}/access`, { accessType });
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['/api/hireos/documents', variables.documentId, 'access-logs'] });
      
      if (variables.accessType === 'view') {
        toast({
          title: "Document viewed",
          description: "Access has been logged for compliance",
        });
      } else if (variables.accessType === 'download') {
        toast({
          title: "Download logged",
          description: "Download action recorded in audit trail",
        });
      }
    },
    onError: (error: Error) => {
      toast({
        title: 'Log Access Failed',
        description: error.message || 'Something went wrong.',
        variant: 'destructive',
      });
    },
  });

  // Generate PDF packet
  const generatePDFMutation = useMutation({
    mutationFn: async () => {
      // Open PDF in new window (downloads automatically due to Content-Disposition header)
      window.open(`/api/hireos/documents/${employeeId}/packet`, '_blank');
      return { success: true };
    },
    onSuccess: () => {
      toast({
        title: "PDF Generated",
        description: "Complete onboarding packet with audit trail is downloading",
      });
    },
    onError: () => {
      toast({
        variant: "destructive",
        title: "PDF Generation Failed",
        description: "Unable to generate PDF packet. Please try again.",
      });
    },
  });

  const handleLogAccess = (documentId: string, accessType: string) => {
    logAccessMutation.mutate({ documentId, accessType });
  };

  const handleViewAccessLogs = (documentId: string) => {
    setSelectedDocId(documentId);
  };

  const errorConfig: CanvasPageConfig = {
    id: "employee-file-cabinet-error",
    title: "Employee File Cabinet",
    subtitle: "Invalid employee ID",
    category: "operations",
  };

  if (!employeeId) {
    return (
      <CanvasHubPage config={errorConfig}>
        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" />
          <AlertDescription>Invalid employee ID</AlertDescription>
        </Alert>
      </CanvasHubPage>
    );
  }

  const actionButton = (
    <Button onClick={() => generatePDFMutation.mutate()} data-testid="button-generate-pdf">
      <FileDown className="h-4 w-4 mr-2" />
      Generate Onboarding Packet PDF
    </Button>
  );

  const pageConfig: CanvasPageConfig = {
    id: "employee-file-cabinet",
    title: "Employee File Cabinet",
    subtitle: employee ? `${employee.firstName} ${employee.lastName} - ${employee.email}` : undefined,
    category: "operations",
    headerActions: actionButton,
  };

  return (
    <CanvasHubPage config={pageConfig}>
      <Button
        variant="ghost"
        size="sm"
        onClick={() => window.history.back()}
        data-testid="button-back-file-cabinet"
        className="mb-4 gap-1"
      >
        <ChevronLeft className="h-4 w-4" />
        Back
      </Button>
      <div className="mb-6">
        <Alert>
          <Shield className="h-4 w-4" />
          <AlertDescription>
            <strong>Compliance & Security:</strong> All documents permanently stored with full audit trail. Locked documents cannot be tampered with. 7-year retention for compliance requirements.
          </AlertDescription>
        </Alert>
      </div>

      {/* Filters */}
      <Card className="mb-6">
        <CardHeader>
          <CardTitle>Filter Documents</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="text-sm font-medium mb-2 block">Document Type</label>
              <Select value={filterType} onValueChange={setFilterType}>
                <SelectTrigger data-testid="select-filter-type">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Types</SelectItem>
                  {Object.entries(DOCUMENT_TYPE_LABELS).map(([value, label]) => (
                    <SelectItem key={value} value={value}>{label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-sm font-medium mb-2 block">Status</label>
              <Select value={filterStatus} onValueChange={setFilterStatus}>
                <SelectTrigger data-testid="select-filter-status">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Status</SelectItem>
                  {Object.entries(STATUS_CONFIG).map(([value, config]) => (
                    <SelectItem key={value} value={value}>{config.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardContent>
      </Card>

      {pendingSignatures?.data && pendingSignatures.data.length > 0 && (
        <div className="mb-6">
          <div className="flex items-center gap-2 mb-3">
            <Pen className="w-5 h-5 text-amber-600 dark:text-amber-400" />
            <h3 className="text-lg font-semibold">Pending Signatures</h3>
            <Badge variant="outline" className="text-xs">{pendingSignatures.data.length}</Badge>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {pendingSignatures.data.map((sig: any) => (
              <PendingSignatureCard
                key={sig.id}
                sig={sig}
                onSign={handleSignPending}
              />
            ))}
          </div>
          <Separator className="mt-6" />
        </div>
      )}

      {isLoadingDocs ? (
        <div className="text-center py-12">
          <div className="animate-spin w-8 h-8 border-4 border-primary border-t-transparent rounded-full mx-auto" />
        </div>
      ) : documents && documents.length > 0 ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {documents.map((doc: any) => (
            <DocumentCard
              key={doc.id}
              document={doc}
              onViewAccess={handleViewAccessLogs}
              onLogAccess={handleLogAccess}
            />
          ))}
        </div>
      ) : (
        <Card>
          <CardContent className="text-center py-12">
            <FileText className="h-16 w-16 mx-auto mb-4 opacity-50" />
            <h3 className="text-lg font-semibold mb-2">No Documents Found</h3>
            <p className="text-muted-foreground mb-4">
              {filterType !== "all" || filterStatus !== "all" 
                ? "Try adjusting your filters" 
                : "This employee hasn't uploaded any documents yet"}
            </p>
          </CardContent>
        </Card>
      )}

      <AccessLogDialog
        open={!!selectedDocId}
        onOpenChange={(open) => !open && setSelectedDocId(null)}
        documentId={selectedDocId}
      />

      <UniversalModal open={showSignDialog} onOpenChange={(open) => {
        setShowSignDialog(open);
        if (!open) { setSigningItem(null); setSignatureData(""); }
      }}>
        <UniversalModalContent>
          <UniversalModalHeader>
            <UniversalModalTitle>Sign Document</UniversalModalTitle>
            <UniversalModalDescription>
              {signingItem?.document?.fileName ? `Sign "${signingItem.document.fileName}"` : "Draw your signature below"}
            </UniversalModalDescription>
          </UniversalModalHeader>
          <div className="space-y-4">
            <div className="border rounded-lg p-2 bg-white dark:bg-gray-900">
              <canvas
                id="employee-sign-canvas"
                width={400}
                height={150}
                className="w-full cursor-crosshair"
                ref={(el) => {
                  if (el) {
                    const ctx = el.getContext("2d");
                    if (ctx) {
                      el.onmousedown = (e) => {
                        ctx.beginPath();
                        ctx.moveTo(e.offsetX, e.offsetY);
                        el.dataset.drawing = "true";
                      };
                      el.onmousemove = (e) => {
                        if (el.dataset.drawing !== "true") return;
                        ctx.lineTo(e.offsetX, e.offsetY);
                        ctx.strokeStyle = getComputedStyle(document.documentElement).getPropertyValue('--foreground').trim() ? '#000' : '#000';
                        ctx.lineWidth = 2;
                        ctx.stroke();
                      };
                      el.onmouseup = () => {
                        el.dataset.drawing = "false";
                        setSignatureData(el.toDataURL());
                      };
                      el.onmouseleave = () => {
                        if (el.dataset.drawing === "true") {
                          el.dataset.drawing = "false";
                          setSignatureData(el.toDataURL());
                        }
                      };
                    }
                  }
                }}
                data-testid="canvas-employee-signature"
              />
            </div>
            <Button
              size="sm"
              variant="outline"
              onClick={() => {
                const canvas = document.getElementById("employee-sign-canvas") as HTMLCanvasElement;
                if (canvas) {
                  const ctx = canvas.getContext("2d");
                  ctx?.clearRect(0, 0, canvas.width, canvas.height);
                  setSignatureData("");
                }
              }}
              data-testid="button-clear-employee-sig"
            >
              Clear
            </Button>
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setShowSignDialog(false)} data-testid="button-cancel-sign">Cancel</Button>
            <Button
              disabled={!signatureData || signMutation.isPending}
              onClick={() => {
                if (signingItem && signatureData) {
                  signMutation.mutate({
                    signatureRequestId: signingItem.documentId || signingItem.id,
                    signatureData,
                  });
                }
              }}
              data-testid="button-submit-employee-sig"
            >
              {signMutation.isPending ? "Signing..." : "Sign Document"}
            </Button>
          </div>
        </UniversalModalContent>
      </UniversalModal>
    </CanvasHubPage>
  );
}
