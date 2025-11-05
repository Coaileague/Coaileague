import { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Upload, FileText, CheckCircle2, AlertCircle, Loader2 } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Progress } from "@/components/ui/progress";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";

interface UploadedDocument {
  id?: string;
  fileName: string;
  filePath: string;
  documentType: string;
  status: 'uploading' | 'uploaded' | 'failed';
  progress: number;
  error?: string;
}

interface DocumentUploadStepProps {
  application: any;
  onNext: (data: any) => void;
}

export function DocumentUploadStep({ application, onNext }: DocumentUploadStepProps) {
  const [uploads, setUploads] = useState<Record<string, UploadedDocument>>({});
  const [isUploading, setIsUploading] = useState(false);
  const { toast } = useToast();

  // Fetch existing documents
  const { data: existingDocuments, isLoading: documentsLoading } = useQuery({
    queryKey: ['/api/onboarding/documents', application.id, application.workspaceId],
    queryFn: async () => {
      const response = await fetch(
        `/api/onboarding/documents/${application.id}?workspaceId=${application.workspaceId}`
      );
      if (!response.ok) {
        throw new Error('Failed to fetch documents');
      }
      return response.json();
    },
    enabled: !!application.id && !!application.workspaceId,
  });

  // Initialize uploads state from existing documents
  useEffect(() => {
    if (existingDocuments && existingDocuments.length > 0) {
      const uploadMap: Record<string, UploadedDocument> = {};
      existingDocuments.forEach((doc: any) => {
        uploadMap[`${doc.documentType}_${doc.id}`] = {
          id: doc.id,
          fileName: doc.originalFileName || doc.documentName,
          filePath: doc.fileUrl,
          documentType: doc.documentType,
          status: 'uploaded',
          progress: 100,
        };
      });
      setUploads(uploadMap);
    }
  }, [existingDocuments]);

  const uploadDocument = async (file: File, documentType: string) => {
    const uploadId = `${documentType}_${Date.now()}`;

    // Initialize upload tracking
    setUploads(prev => ({
      ...prev,
      [uploadId]: {
        fileName: file.name,
        filePath: '',
        documentType,
        status: 'uploading',
        progress: 0,
      }
    }));

    setIsUploading(true);

    try {
      // Step 1: Get signed upload URL
      const uploadUrlResponse = await apiRequest('POST', '/api/onboarding/documents/upload-url', {
        applicationId: application.id,
        workspaceId: application.workspaceId,
        documentType,
        fileName: file.name,
        fileType: file.type,
        fileSize: file.size,
      });

      if (!uploadUrlResponse.ok) {
        throw new Error('Failed to get upload URL');
      }

      const { uploadUrl, filePath } = await uploadUrlResponse.json();

      // Update progress
      setUploads(prev => ({
        ...prev,
        [uploadId]: { ...prev[uploadId], progress: 25 }
      }));

      // Step 2: Upload file to GCS
      const uploadResponse = await fetch(uploadUrl, {
        method: 'PUT',
        body: file,
        headers: {
          'Content-Type': file.type,
        },
      });

      if (!uploadResponse.ok) {
        throw new Error('File upload failed');
      }

      // Update progress
      setUploads(prev => ({
        ...prev,
        [uploadId]: { ...prev[uploadId], progress: 75 }
      }));

      // Step 3: Confirm upload with backend
      const confirmResponse = await apiRequest('POST', '/api/onboarding/documents/confirm', {
        applicationId: application.id,
        workspaceId: application.workspaceId,
        filePath,
        documentType,
        fileName: file.name,
        fileType: file.type,
        fileSize: file.size,
      });

      if (!confirmResponse.ok) {
        throw new Error('Failed to confirm upload');
      }

      const document = await confirmResponse.json();

      // Update upload status
      setUploads(prev => ({
        ...prev,
        [uploadId]: {
          ...prev[uploadId],
          id: document.id,
          filePath,
          status: 'uploaded',
          progress: 100,
        }
      }));

      toast({
        title: "Document uploaded",
        description: `${file.name} uploaded successfully`,
      });
    } catch (error: any) {
      console.error('Upload error:', error);

      setUploads(prev => ({
        ...prev,
        [uploadId]: {
          ...prev[uploadId],
          status: 'failed',
          error: error.message,
        }
      }));

      toast({
        title: "Upload failed",
        description: error.message || "Failed to upload document",
        variant: "destructive",
      });
    } finally {
      setIsUploading(false);
    }
  };

  const handleFileChange = async (docType: string, file: File | null) => {
    if (file) {
      // Validate file size (15MB max)
      const maxSize = 15 * 1024 * 1024;
      if (file.size > maxSize) {
        toast({
          title: "File too large",
          description: "File size must be less than 15MB",
          variant: "destructive",
        });
        return;
      }

      await uploadDocument(file, docType);
    }
  };

  const handleNext = () => {
    const uploadedDocuments = Object.values(uploads).filter(u => u.status === 'uploaded');
    onNext({
      uploadedDocuments,
    });
  };

  const getUploadsByType = (type: string) => {
    return Object.values(uploads).filter(u => u.documentType === type);
  };

  const hasRequiredDocs = () => {
    const govId = getUploadsByType('government_id').some(u => u.status === 'uploaded');
    const eligibility = getUploadsByType('i9_form').some(u => u.status === 'uploaded') ||
                        getUploadsByType('ssn_card').some(u => u.status === 'uploaded');
    return govId && eligibility;
  };

  const renderUploadStatus = (type: string) => {
    const docs = getUploadsByType(type);
    const uploading = docs.find(d => d.status === 'uploading');
    const uploaded = docs.filter(d => d.status === 'uploaded');
    const failed = docs.filter(d => d.status === 'failed');

    if (uploading) {
      return (
        <div className="space-y-2">
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            <span>Uploading {uploading.fileName}...</span>
          </div>
          <Progress value={uploading.progress} />
        </div>
      );
    }

    if (uploaded.length > 0) {
      return (
        <div className="space-y-1">
          {uploaded.map((doc, idx) => (
            <p key={idx} className="text-sm text-muted-foreground flex items-center gap-1">
              <CheckCircle2 className="h-3 w-3 text-green-600" />
              {doc.fileName}
            </p>
          ))}
        </div>
      );
    }

    if (failed.length > 0) {
      return (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>
            Upload failed: {failed[0].error}
          </AlertDescription>
        </Alert>
      );
    }

    return null;
  };

  return (
    <div>
      <h3 className="text-lg font-semibold mb-2">Document Upload</h3>
      <p className="text-sm text-muted-foreground mb-6">
        Please upload the required documents. All files must be in color and clearly legible.
      </p>

      <Alert className="mb-6">
        <AlertCircle className="h-4 w-4" />
        <AlertDescription>
          For legal compliance, all documents must be uploaded in color. Ensure text is clear and readable.
        </AlertDescription>
      </Alert>

      <div className="space-y-4">
        {/* Government ID */}
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="text-base flex items-center gap-2">
                  Government-Issued ID*
                  {getUploadsByType('government_id').some(u => u.status === 'uploaded') && (
                    <CheckCircle2 className="h-4 w-4 text-green-600" />
                  )}
                </CardTitle>
                <CardDescription>Driver's License, Passport, or State ID</CardDescription>
              </div>
              <Badge variant={getUploadsByType('government_id').some(u => u.status === 'uploaded') ? "default" : "secondary"}>
                {getUploadsByType('government_id').some(u => u.status === 'uploaded') ? "Uploaded" : "Required"}
              </Badge>
            </div>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              <Label htmlFor="government-id">Upload Color Copy</Label>
              <Input
                id="government-id"
                type="file"
                accept="image/*,.pdf"
                onChange={(e) => handleFileChange('government_id', e.target.files?.[0] || null)}
                disabled={isUploading}
                data-testid="input-file-government-id"
              />
              {renderUploadStatus('government_id')}
            </div>
          </CardContent>
        </Card>

        {/* Proof of Work Eligibility (I-9 or SSN) */}
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="text-base flex items-center gap-2">
                  Proof of Work Eligibility*
                  {(getUploadsByType('i9_form').some(u => u.status === 'uploaded') || 
                    getUploadsByType('ssn_card').some(u => u.status === 'uploaded')) && (
                    <CheckCircle2 className="h-4 w-4 text-green-600" />
                  )}
                </CardTitle>
                <CardDescription>Social Security Card, I-9 Form, Birth Certificate, or Passport</CardDescription>
              </div>
              <Badge variant={(getUploadsByType('i9_form').some(u => u.status === 'uploaded') || getUploadsByType('ssn_card').some(u => u.status === 'uploaded')) ? "default" : "secondary"}>
                {(getUploadsByType('i9_form').some(u => u.status === 'uploaded') || getUploadsByType('ssn_card').some(u => u.status === 'uploaded')) ? "Uploaded" : "Required"}
              </Badge>
            </div>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="ssn-card">Social Security Card</Label>
                <Input
                  id="ssn-card"
                  type="file"
                  accept="image/*,.pdf"
                  onChange={(e) => handleFileChange('ssn_card', e.target.files?.[0] || null)}
                  disabled={isUploading}
                  data-testid="input-file-ssn"
                />
                {renderUploadStatus('ssn_card')}
              </div>
              <div className="text-center text-sm text-muted-foreground">- OR -</div>
              <div className="space-y-2">
                <Label htmlFor="i9-form">I-9 Form / Birth Certificate / Passport</Label>
                <Input
                  id="i9-form"
                  type="file"
                  accept="image/*,.pdf"
                  onChange={(e) => handleFileChange('i9_form', e.target.files?.[0] || null)}
                  disabled={isUploading}
                  data-testid="input-file-eligibility"
                />
                {renderUploadStatus('i9_form')}
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Professional Certifications (Optional) */}
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="text-base">Professional Certifications</CardTitle>
                <CardDescription>Licenses, certificates, or required credentials (if applicable)</CardDescription>
              </div>
              <Badge variant="outline">Optional</Badge>
            </div>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              <Label htmlFor="certifications">Upload Certificates</Label>
              <Input
                id="certifications"
                type="file"
                accept="image/*,.pdf"
                onChange={(e) => handleFileChange('certification', e.target.files?.[0] || null)}
                disabled={isUploading}
                data-testid="input-file-certifications"
              />
              {renderUploadStatus('certification')}
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="flex justify-between pt-6">
        <p className="text-sm text-muted-foreground">
          * Required documents
        </p>
        <Button 
          onClick={handleNext} 
          disabled={!hasRequiredDocs() || isUploading}
          data-testid="button-next-documents"
        >
          {isUploading ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Uploading...
            </>
          ) : (
            "Continue to Agreements"
          )}
        </Button>
      </div>
    </div>
  );
}
