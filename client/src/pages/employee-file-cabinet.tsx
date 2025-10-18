import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useRoute, useLocation } from "wouter";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ScrollArea } from "@/components/ui/scroll-area";
import { FileText, Download, Eye, Lock, Unlock, CheckCircle, XCircle, Clock, Shield, AlertTriangle, Printer, Share2, FileDown, History } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { format } from "date-fns";

// Document type labels
const DOCUMENT_TYPE_LABELS: Record<string, string> = {
  government_id: "Government ID",
  passport: "Passport",
  ssn_card: "Social Security Card",
  i9_form: "I-9 Form",
  w4_form: "W-4 Form",
  w9_form: "W-9 Form",
  certification: "Professional Certification",
  license: "Professional License",
  background_check: "Background Check",
  drug_test: "Drug Test Results",
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
        <div className="flex items-start justify-between">
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
    queryKey: [`/api/hireos/documents/${documentId}/access-logs`],
    enabled: open && !!documentId,
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[80vh]">
        <DialogHeader>
          <DialogTitle>Document Access Audit Trail</DialogTitle>
          <DialogDescription>Complete record of all access events for compliance</DialogDescription>
        </DialogHeader>

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
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-1">
                          {log.accessType === 'view' && <Eye className="h-4 w-4 text-blue-500" />}
                          {log.accessType === 'download' && <Download className="h-4 w-4 text-green-500" />}
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
      </DialogContent>
    </Dialog>
  );
}

export default function EmployeeFileCabinet() {
  const [, params] = useRoute("/employees/:employeeId/file-cabinet");
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const [selectedDocId, setSelectedDocId] = useState<string | null>(null);
  const [filterType, setFilterType] = useState<string>("all");
  const [filterStatus, setFilterStatus] = useState<string>("all");

  const employeeId = params?.employeeId;

  // Fetch employee data
  const { data: employee } = useQuery<any>({
    queryKey: [`/api/employees/${employeeId}`],
    enabled: !!employeeId,
  });

  // Fetch documents
  const { data: documents, isLoading: isLoadingDocs } = useQuery<any[]>({
    queryKey: [`/api/hireos/documents/${employeeId}`, filterType, filterStatus],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (filterType !== "all") params.append("documentType", filterType);
      if (filterStatus !== "all") params.append("status", filterStatus);
      
      const response = await fetch(`/api/hireos/documents/${employeeId}?${params.toString()}`, {
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
      return await apiRequest(`/api/hireos/documents/${documentId}/access`, 'POST', { accessType });
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: [`/api/hireos/documents/${variables.documentId}/access-logs`] });
      
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
  });

  // Generate PDF packet
  const generatePDFMutation = useMutation({
    mutationFn: async () => {
      return await apiRequest('/api/hireos/generate-onboarding-packet-pdf', 'POST', { employeeId });
    },
    onSuccess: (data) => {
      toast({
        title: "PDF Generated",
        description: "Onboarding packet PDF is ready for download",
      });
      // TODO: Trigger PDF download
    },
  });

  const handleLogAccess = (documentId: string, accessType: string) => {
    logAccessMutation.mutate({ documentId, accessType });
  };

  const handleViewAccessLogs = (documentId: string) => {
    setSelectedDocId(documentId);
  };

  if (!employeeId) {
    return (
      <div className="container mx-auto py-6">
        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" />
          <AlertDescription>Invalid employee ID</AlertDescription>
        </Alert>
      </div>
    );
  }

  return (
    <div className="container mx-auto py-6 max-w-7xl">
      <div className="mb-6">
        <div className="flex items-center justify-between mb-2">
          <div>
            <h1 className="text-3xl font-bold flex items-center gap-2">
              <FileText className="h-8 w-8" />
              Employee File Cabinet
            </h1>
            {employee && (
              <p className="text-muted-foreground mt-1">
                {employee.firstName} {employee.lastName} - {employee.email}
              </p>
            )}
          </div>
          <Button onClick={() => generatePDFMutation.mutate()} data-testid="button-generate-pdf">
            <FileDown className="h-4 w-4 mr-2" />
            Generate Onboarding Packet PDF
          </Button>
        </div>
        <Alert>
          <Shield className="h-4 w-4" />
          <AlertDescription>
            <strong>Monopolistic Feature:</strong> All documents permanently stored with full audit trail. Locked documents cannot be tampered with. 7-year retention for compliance.
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

      {/* Documents */}
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
    </div>
  );
}
