import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useParams, useLocation } from "wouter";
import { CanvasHubPage, type CanvasPageConfig } from '@/components/canvas-hub';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { UniversalModal, UniversalModalDescription, UniversalModalHeader, UniversalModalTitle, UniversalModalTrigger, UniversalModalFooter, UniversalModalContent } from '@/components/ui/universal-modal';
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import {
  Eye,
  User,
  Shield,
  FileCheck,
  Lock,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  Upload,
  Clock,
  FileText,
  Loader2,
  Building2,
  Calendar,
} from 'lucide-react';;
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";

interface ComplianceRecord {
  id: string;
  employeeId: string;
  stateId: string;
  overallStatus: string;
  complianceScore: number;
  totalRequirements: number;
  completedRequirements: number;
  pendingRequirements: number;
  vaultLocked: boolean;
  vaultLockedAt: string | null;
  vaultLockedBy: string | null;
}

interface ComplianceDocument {
  id: string;
  employeeId: string;
  documentTypeId: string;
  documentTypeName: string;
  fileName: string;
  status: string;
  isLocked: boolean;
  isColorImage: boolean;
  imageSide: string;
  expirationDate: string | null;
  fileHash: string;
  createdAt: string;
}

interface DocumentType {
  id: string;
  name: string;
  category: string;
  requiresColor: boolean;
  requiresBackSide: boolean;
  hasExpiration: boolean;
  acceptsSubstitute: boolean;
  substituteDocumentName: string | null;
}

interface ComplianceState {
  id: string;
  stateCode: string;
  stateName: string;
  regulatoryBody: string;
  regulatoryBodyAcronym: string;
  status: string;
}

export default function EmployeeComplianceDetail() {
  const { employeeId } = useParams<{ employeeId: string }>();
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const [uploadDialogOpen, setUploadDialogOpen] = useState(false);
  const [selectedDocType, setSelectedDocType] = useState<string>("");
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [imageSide, setImageSide] = useState<string>("front");
  const [isColorImage, setIsColorImage] = useState<boolean>(true);
  const [expirationDate, setExpirationDate] = useState<string>("");
  const [notes, setNotes] = useState<string>("");
  const [selectedStateId, setSelectedStateId] = useState<string>("");
  const [addStateDialogOpen, setAddStateDialogOpen] = useState(false);

  const { data: employeeData, isLoading: employeeLoading } = useQuery<{ success: boolean; employee: any }>({
    queryKey: ['/api/employees', employeeId],
    enabled: !!employeeId,
  });

  const { data: recordsData, isLoading: recordsLoading } = useQuery<{ success: boolean; records: { record: ComplianceRecord; state: any }[] }>({
    queryKey: ['/api/security-compliance/records/employee', employeeId],
    enabled: !!employeeId,
  });

  const { data: documentsData, isLoading: documentsLoading } = useQuery<{ success: boolean; documents: ComplianceDocument[] }>({
    queryKey: ['/api/security-compliance/documents/employee', employeeId],
    enabled: !!employeeId,
  });

  const { data: docTypesData } = useQuery<{ success: boolean; documentTypes: DocumentType[] }>({
    queryKey: ['/api/security-compliance/document-types'],
  });

  const { data: statesData } = useQuery<{ success: boolean; states: ComplianceState[] }>({
    queryKey: ['/api/security-compliance/states'],
  });

  const { data: officerScoreData } = useQuery<{ success: boolean; data: { isHardBlocked: boolean; hardBlockReasons?: string[] } }>({
    queryKey: ['/api/compliance/regulatory-portal/officer-score', employeeId],
    enabled: !!employeeId,
    retry: false,
  });

  const addStateComplianceMutation = useMutation({
    mutationFn: async (stateId: string) => {
      return await apiRequest('POST', '/api/security-compliance/records', {
        employeeId,
        stateId,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/security-compliance/records/employee', employeeId] });
      setAddStateDialogOpen(false);
      setSelectedStateId("");
      toast({
        title: "State Added",
        description: "Employee has been enrolled in the selected state compliance program",
      });
    },
    onError: (error: any) => {
      toast({
        variant: "destructive",
        title: "Failed to Add State",
        description: error.message || "Unable to add state compliance",
      });
    },
  });

  const uploadMutation = useMutation({
    mutationFn: async (formData: any) => {
      return await apiRequest('POST', '/api/security-compliance/documents', formData);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/security-compliance/documents/employee', employeeId] });
      setUploadDialogOpen(false);
      resetUploadForm();
      toast({
        title: "Document Uploaded",
        description: "Document has been uploaded and queued for approval",
      });
    },
    onError: (error: any) => {
      toast({
        variant: "destructive",
        title: "Upload Failed",
        description: error.message || "Failed to upload document",
      });
    },
  });

  const lockVaultMutation = useMutation({
    mutationFn: async (recordId: string) => {
      return await apiRequest('POST', `/api/security-compliance/records/${recordId}/lock-vault`, {});
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/security-compliance/records/employee', employeeId] });
      toast({
        title: "Vault Locked",
        description: "Employee compliance vault has been locked. Documents can no longer be modified.",
      });
    },
    onError: () => {
      toast({
        variant: "destructive",
        title: "Lock Failed",
        description: "Unable to lock the compliance vault",
      });
    },
  });

  const resetUploadForm = () => {
    setSelectedDocType("");
    setSelectedFile(null);
    setImageSide("front");
    setIsColorImage(true);
    setExpirationDate("");
    setNotes("");
  };

  const handleUpload = async () => {
    if (!selectedDocType || !selectedFile || !employeeId) {
      toast({
        variant: "destructive",
        title: "Missing Information",
        description: "Please select a document type and file",
      });
      return;
    }

    const docType = docTypes.find(t => t.id === selectedDocType);
    
    if (docType?.requiresColor && !isColorImage) {
      toast({
        variant: "destructive",
        title: "Color Image Required",
        description: `${docType.name} must be a COLOR scan`,
      });
      return;
    }

    const fileBuffer = await selectedFile.arrayBuffer();
    const hashBuffer = await crypto.subtle.digest('SHA-256', fileBuffer);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    const fileHashSha256 = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');

    const complianceRecordId = records[0]?.record?.id;

    uploadMutation.mutate({
      employeeId,
      complianceRecordId,
      documentTypeId: selectedDocType,
      fileName: selectedFile.name,
      fileSizeBytes: selectedFile.size,
      fileType: selectedFile.type,
      fileHashSha256,
      imageSide,
      isColorImage,
      expirationDate: expirationDate || undefined,
      verificationNotes: notes || undefined,
    });
  };

  const employee = employeeData?.employee;
  const records = recordsData?.records || [];
  const documents = documentsData?.documents || [];
  const docTypes = docTypesData?.documentTypes || [];
  const allStates = statesData?.states || [];
  
  const existingStateIds = records.map(r => r.state?.id).filter(Boolean);
  const availableStates = allStates.filter(s => !existingStateIds.includes(s.id) && s.status === 'active');

  const isLoading = employeeLoading || recordsLoading || documentsLoading;

  if (isLoading) {
    const loadingConfig: CanvasPageConfig = {
      id: 'employee-compliance-loading',
      title: 'Employee Compliance',
      subtitle: 'Loading employee records, compliance vault, and document requirements',
      category: 'operations',
      backButton: true,
      onBack: () => navigate('/security-compliance'),
    };
    return (
      <CanvasHubPage config={loadingConfig}>
        <div className="flex flex-col justify-center items-center py-12 text-center space-y-3">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          <div>
            <p className="font-medium text-foreground">Loading employee compliance file</p>
            <p className="text-sm text-muted-foreground">
              Reviewing vault status, uploaded documents, and state-specific requirements.
            </p>
          </div>
        </div>
      </CanvasHubPage>
    );
  }

  const complianceRecord = records[0]?.record;
  const stateInfo = records[0]?.state;
  const complianceScore = complianceRecord?.complianceScore || 0;
  const isHardBlocked = officerScoreData?.data?.isHardBlocked === true;
  const hardBlockReasons = officerScoreData?.data?.hardBlockReasons || [];

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'approved':
        return <Badge className="bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200"><CheckCircle2 className="w-3 h-3 mr-1" /> Approved</Badge>;
      case 'rejected':
        return <Badge className="bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200"><XCircle className="w-3 h-3 mr-1" /> Rejected</Badge>;
      case 'pending':
        return <Badge className="bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200"><Clock className="w-3 h-3 mr-1" /> Pending</Badge>;
      default:
        return <Badge variant="secondary">{status}</Badge>;
    }
  };

  const pageConfig: CanvasPageConfig = {
    id: 'employee-compliance-detail',
    title: employee ? `${employee.firstName} ${employee.lastName}` : 'Employee Compliance',
    subtitle: stateInfo ? `${stateInfo.stateName} - ${stateInfo.regulatoryBodyAcronym}` : 'Compliance Vault',
    category: 'operations',
    maxWidth: '6xl',
    backButton: true,
    onBack: () => navigate('/security-compliance'),
    headerActions: (
      <Button onClick={() => setUploadDialogOpen(true)} data-testid="btn-upload-document">
        Upload Document
      </Button>
    ),
  };

  return (
    <CanvasHubPage config={pageConfig}>
      <div className="space-y-6" data-testid="employee-compliance-detail">
        {isHardBlocked && (
          <div
            className="flex items-start gap-3 p-4 rounded-md bg-red-50 dark:bg-red-950 border border-red-200 dark:border-red-800"
            data-testid="banner-hard-block"
          >
            <AlertTriangle className="h-5 w-5 text-red-600 dark:text-red-400 flex-shrink-0 mt-0.5" />
            <div>
              <div className="font-semibold text-red-800 dark:text-red-200 text-sm">
                License Expired — Scheduling Blocked
              </div>
              {hardBlockReasons.length > 0 && (
                <div className="text-xs text-red-600 dark:text-red-400 mt-0.5">
                  {hardBlockReasons.join(' · ')}
                </div>
              )}
              <div className="text-xs text-red-500 dark:text-red-500 mt-1">
                This officer cannot be assigned to shifts until all expired or missing licenses are resolved.
              </div>
            </div>
          </div>
        )}
        {records.length > 1 && (
          <Card data-testid="card-state-selector">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium">State Compliance Programs</CardTitle>
              <CardDescription>This employee is enrolled in multiple state compliance programs</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="flex flex-wrap gap-2">
                {records.map((r, index) => (
                  <Badge 
                    key={r.state?.id || index}
                    variant={index === 0 ? "default" : "secondary"}
                    className="cursor-pointer"
                    data-testid={`badge-state-${r.state?.stateCode}`}
                  >
                    <Building2 className="w-3 h-3 mr-1" />
                    {r.state?.stateCode} - {r.state?.regulatoryBodyAcronym}
                  </Badge>
                ))}
                {availableStates.length > 0 && (
                  <Button 
                    size="sm" 
                    variant="outline"
                    onClick={() => setAddStateDialogOpen(true)}
                    data-testid="button-add-state"
                  >
                    + Add State
                  </Button>
                )}
              </div>
            </CardContent>
          </Card>
        )}

        {records.length === 1 && availableStates.length > 0 && (
          <div className="flex justify-end">
            <Button 
              size="sm" 
              variant="outline"
              onClick={() => setAddStateDialogOpen(true)}
              data-testid="button-add-state"
            >
              <Building2 className="w-4 h-4 mr-2" />
              Add State Compliance
            </Button>
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Card data-testid="card-compliance-score">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2 gap-2">
              <CardTitle className="text-sm font-medium">Compliance Score</CardTitle>
              <Shield className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-lg sm:text-2xl font-bold">{complianceScore}%</div>
              <Progress value={complianceScore} className="mt-2" />
              <p className="text-xs text-muted-foreground mt-1">
                {complianceRecord?.completedRequirements || 0} of {complianceRecord?.totalRequirements || 0} requirements
              </p>
            </CardContent>
          </Card>

          <Card data-testid="card-vault-status">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2 gap-2">
              <CardTitle className="text-sm font-medium">Vault Status</CardTitle>
              {complianceRecord?.vaultLocked ? (
                <Lock className="h-4 w-4 text-green-600" />
              ) : (
                <Lock className="h-4 w-4 text-muted-foreground" />
              )}
            </CardHeader>
            <CardContent>
              <div className="flex items-center gap-2">
                {complianceRecord?.vaultLocked ? (
                  <>
                    <Badge className="bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200">Locked</Badge>
                    <span className="text-xs text-muted-foreground">WORM Protected</span>
                  </>
                ) : (
                  <>
                    <Badge variant="secondary">Unlocked</Badge>
                    {complianceScore >= 100 && (
                      <Button 
                        size="sm" 
                        onClick={() => complianceRecord?.id && lockVaultMutation.mutate(complianceRecord.id)}
                        data-testid="button-lock-vault"
                      >
                        Lock Vault
                      </Button>
                    )}
                  </>
                )}
              </div>
              {complianceRecord?.vaultLockedAt && (
                <p className="text-xs text-muted-foreground mt-2">
                  Locked: {new Date(complianceRecord.vaultLockedAt).toLocaleDateString()}
                </p>
              )}
            </CardContent>
          </Card>

          <Card data-testid="card-documents-count">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2 gap-2">
              <CardTitle className="text-sm font-medium">Documents</CardTitle>
              <FileText className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-lg sm:text-2xl font-bold">{documents.length}</div>
              <p className="text-xs text-muted-foreground mt-1">
                {documents.filter(d => d.status === 'approved').length} approved, {documents.filter(d => d.status === 'pending').length} pending
              </p>
            </CardContent>
          </Card>
        </div>

        <Tabs defaultValue="documents" className="space-y-4">
          <TabsList className="w-full sm:w-auto overflow-x-auto">
            <TabsTrigger value="documents" data-testid="tab-documents">
              <FileCheck className="h-4 w-4 mr-2" />
              Documents
            </TabsTrigger>
            <TabsTrigger value="requirements" data-testid="tab-requirements">
              <Shield className="h-4 w-4 mr-2" />
              Requirements
            </TabsTrigger>
          </TabsList>

          <TabsContent value="documents" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>Uploaded Documents</CardTitle>
                <CardDescription>All compliance documents in the vault</CardDescription>
              </CardHeader>
              <CardContent>
                {documents.length === 0 ? (
                  <div className="text-center py-8 text-muted-foreground">
                    <FileText className="h-12 w-12 mx-auto mb-4 opacity-50" />
                    <p className="font-medium text-foreground">No documents uploaded yet</p>
                    <p className="text-sm text-muted-foreground mt-1">
                      Upload the first credential to start the review and vault-lock workflow.
                    </p>
                    <Button 
                      className="mt-4" 
                      onClick={() => setUploadDialogOpen(true)}
                      data-testid="button-upload-first"
                    >
                      Upload First Document
                    </Button>
                  </div>
                ) : (
                  <div className="space-y-4">
                    {documents.map((doc) => (
                      <div 
                        key={doc.id} 
                        className="flex items-center justify-between gap-2 p-4 border rounded-lg"
                        data-testid={`doc-row-${doc.id}`}
                      >
                        <div className="flex items-center gap-4 min-w-0">
                          <FileCheck className="h-8 w-8 text-muted-foreground shrink-0" />
                          <div className="min-w-0">
                            <div className="font-medium">{doc.documentTypeName || doc.fileName}</div>
                            <div className="text-sm text-muted-foreground">
                              {doc.imageSide} {doc.isColorImage ? '(color)' : '(B&W)'}
                              {doc.isLocked && (
                                <Badge variant="outline" className="ml-2">
                                  <Lock className="w-3 h-3 mr-1" /> Locked
                                </Badge>
                              )}
                            </div>
                            {doc.expirationDate && (
                              <div className="text-xs text-muted-foreground flex items-center gap-1 mt-1">
                                <Calendar className="w-3 h-3" />
                                Expires: {new Date(doc.expirationDate).toLocaleDateString()}
                              </div>
                            )}
                          </div>
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          {getStatusBadge(doc.status)}
                          <Button size="icon" variant="ghost" data-testid={`button-view-${doc.id}`}>
                            <Eye className="h-4 w-4" />
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="requirements" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>State Requirements</CardTitle>
                <CardDescription>
                  {stateInfo?.stateName || 'State'} compliance requirements
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  {docTypes.map((docType) => {
                    const docForType = documents.find(d => d.documentTypeId === docType.id);
                    const hasDoc = !!docForType;
                    const isApproved = docForType?.status === 'approved';
                    
                    return (
                      <div 
                        key={docType.id}
                        className="flex items-center justify-between gap-2 p-4 border rounded-lg"
                        data-testid={`req-row-${docType.id}`}
                      >
                        <div className="flex items-center gap-4 min-w-0">
                          {isApproved ? (
                            <CheckCircle2 className="h-6 w-6 text-green-600" />
                          ) : hasDoc ? (
                            <Clock className="h-6 w-6 text-yellow-600" />
                          ) : (
                            <XCircle className="h-6 w-6 text-muted-foreground" />
                          )}
                          <div className="min-w-0">
                            <div className="font-medium truncate">{docType.name}</div>
                            <div className="text-sm text-muted-foreground flex flex-wrap gap-1">
                              {docType.requiresColor && <Badge variant="outline">COLOR Required</Badge>}
                              {docType.requiresBackSide && <Badge variant="outline">Front & Back</Badge>}
                              {docType.hasExpiration && <Badge variant="outline">Has Expiration</Badge>}
                            </div>
                          </div>
                        </div>
                        <div>
                          {!hasDoc && (
                            <Button 
                              size="sm" 
                              variant="outline"
                              onClick={() => {
                                setSelectedDocType(docType.id);
                                setUploadDialogOpen(true);
                              }}
                              data-testid={`button-upload-${docType.id}`}
                            >
                              <Upload className="h-4 w-4 mr-2" />
                              Upload
                            </Button>
                          )}
                          {hasDoc && docForType && getStatusBadge(docForType.status)}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>

        <UniversalModal open={uploadDialogOpen} onOpenChange={setUploadDialogOpen}>
          <UniversalModalContent size="md">
            <UniversalModalHeader>
              <UniversalModalTitle>Upload Compliance Document</UniversalModalTitle>
              <UniversalModalDescription>
                Upload a document for compliance verification
              </UniversalModalDescription>
            </UniversalModalHeader>
            <div className="space-y-4">
              <div className="space-y-2">
                <Label>Document Type</Label>
                <Select value={selectedDocType} onValueChange={setSelectedDocType}>
                  <SelectTrigger data-testid="select-doc-type">
                    <SelectValue placeholder="Select document type" />
                  </SelectTrigger>
                  <SelectContent>
                    {docTypes.map((docType) => (
                      <SelectItem key={docType.id} value={docType.id}>
                        {docType.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label>File</Label>
                <Input 
                  type="file" 
                  accept="image/*,.pdf"
                  onChange={(e) => setSelectedFile(e.target.files?.[0] || null)}
                  data-testid="input-file"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Image Side</Label>
                  <Select value={imageSide} onValueChange={setImageSide}>
                    <SelectTrigger data-testid="select-image-side">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="front">Front</SelectItem>
                      <SelectItem value="back">Back</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label>Color Scan</Label>
                  <Select value={isColorImage ? "yes" : "no"} onValueChange={(v) => setIsColorImage(v === "yes")}>
                    <SelectTrigger data-testid="select-is-color">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="yes">Yes (Color)</SelectItem>
                      <SelectItem value="no">No (B&W)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {docTypes.find(t => t.id === selectedDocType)?.hasExpiration && (
                <div className="space-y-2">
                  <Label>Expiration Date</Label>
                  <Input 
                    type="date" 
                    value={expirationDate}
                    onChange={(e) => setExpirationDate(e.target.value)}
                    data-testid="input-expiration"
                  />
                </div>
              )}

              <div className="space-y-2">
                <Label>Notes (Optional)</Label>
                <Textarea 
                  placeholder="Any notes about this document..."
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  data-testid="input-notes"
                />
              </div>
            </div>
            <UniversalModalFooter>
              <Button variant="outline" onClick={() => setUploadDialogOpen(false)}>
                Cancel
              </Button>
              <Button 
                onClick={handleUpload}
                disabled={uploadMutation.isPending || !selectedDocType || !selectedFile}
                data-testid="button-submit-upload"
              >
                {uploadMutation.isPending ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Uploading...
                  </>
                ) : (
                  <>
                    <Upload className="h-4 w-4 mr-2" />
                    Upload
                  </>
                )}
              </Button>
            </UniversalModalFooter>
          </UniversalModalContent>
        </UniversalModal>

        <UniversalModal open={addStateDialogOpen} onOpenChange={setAddStateDialogOpen}>
          <UniversalModalContent size="md">
            <UniversalModalHeader>
              <UniversalModalTitle>Add State Compliance</UniversalModalTitle>
              <UniversalModalDescription>
                Enroll this employee in an additional state compliance program
              </UniversalModalDescription>
            </UniversalModalHeader>
            <div className="space-y-4">
              <div className="space-y-2">
                <Label>Select State</Label>
                <Select value={selectedStateId} onValueChange={setSelectedStateId}>
                  <SelectTrigger data-testid="select-state">
                    <SelectValue placeholder="Select a state" />
                  </SelectTrigger>
                  <SelectContent>
                    {availableStates.map((state) => (
                      <SelectItem key={state.id} value={state.id}>
                        {state.stateCode} - {state.stateName} ({state.regulatoryBodyAcronym})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              
              {selectedStateId && (
                <div className="p-4 bg-muted rounded-lg">
                  {(() => {
                    const state = availableStates.find(s => s.id === selectedStateId);
                    return state ? (
                      <div className="space-y-2">
                        <p className="font-medium">{state.stateName}</p>
                        <p className="text-sm text-muted-foreground">{state.regulatoryBody}</p>
                      </div>
                    ) : null;
                  })()}
                </div>
              )}
            </div>
            <UniversalModalFooter>
              <Button variant="outline" onClick={() => setAddStateDialogOpen(false)}>
                Cancel
              </Button>
              <Button 
                onClick={() => selectedStateId && addStateComplianceMutation.mutate(selectedStateId)}
                disabled={addStateComplianceMutation.isPending || !selectedStateId}
                data-testid="button-submit-add-state"
              >
                {addStateComplianceMutation.isPending ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Adding...
                  </>
                ) : (
                  <>
                    <Building2 className="h-4 w-4 mr-2" />
                    Add State
                  </>
                )}
              </Button>
            </UniversalModalFooter>
          </UniversalModalContent>
        </UniversalModal>
      </div>
    </CanvasHubPage>
  );
}
