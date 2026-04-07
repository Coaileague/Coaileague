import { useState, useRef } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Loader2, Upload, FileText, CheckCircle2, AlertCircle, RefreshCw } from 'lucide-react';
import { apiRequest, queryClient } from '@/lib/queryClient';
import { useToast } from '@/hooks/use-toast';

interface IDUploadScannerProps {
  docId: string;
  onVerified?: (data: any) => void;
  label?: string;
}

export function IDUploadScanner({ docId, onVerified, label = "Upload Identification" }: IDUploadScannerProps) {
  const [isScanning, setIsScanning] = useState(false);
  const [preview, setPreview] = useState<string | null>(null);
  const [fileType, setFileType] = useState<string | null>(null);
  const [result, setResult] = useState<any>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 10 * 1024 * 1024) {
      toast({
        title: "File too large",
        description: "Maximum file size is 10MB",
        variant: "destructive",
      });
      return;
    }

    const validTypes = ['image/jpeg', 'image/jpg', 'image/png', 'application/pdf'];
    if (!validTypes.includes(file.type)) {
      toast({
        title: "Invalid file type",
        description: "Please upload a JPG, PNG, or PDF document",
        variant: "destructive",
      });
      return;
    }

    setFileType(file.type);
    const reader = new FileReader();
    reader.onloadend = async () => {
      const base64 = reader.result as string;
      setPreview(base64);
      await startScan(base64, file.type);
    };
    reader.readAsDataURL(file);
  };

  const startScan = async (base64: string, mimeType: string) => {
    setIsScanning(true);
    try {
      const res = await apiRequest('POST', `/api/sps/documents/${docId}/id-verify`, {
        imageBase64: base64,
        documentType: mimeType.includes('pdf') ? 'pdf' : 'government_id'
      });
      const data = await res.json();
      setResult(data.verificationResult);
      if (data.verificationResult?.flags?.length > 0) {
        toast({
          title: "Scan Completed with Warnings",
          description: "Trinity AI detected potential issues with the document. Please review the flags.",
          variant: "destructive",
        });
      } else {
        toast({
          title: "Scan Complete",
          description: "Trinity AI has analyzed your document.",
        });
      }
      queryClient.invalidateQueries({ queryKey: [`/api/sps/documents/${docId}`] });
    } catch (error) {
      toast({
        title: "Scan Failed",
        description: "Failed to scan document. Please try again or enter manually.",
        variant: "destructive",
      });
    } finally {
      setIsScanning(false);
    }
  };

  const reset = () => {
    setPreview(null);
    setResult(null);
    setFileType(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  return (
    <div className="space-y-4">
      {label && <h3 className="text-sm font-medium">{label}</h3>}

      {!preview ? (
        <div
          onClick={() => fileInputRef.current?.click()}
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => {
            e.preventDefault();
            const file = e.dataTransfer.files?.[0];
            if (file) {
              const event = { target: { files: [file] } } as any;
              handleFileSelect(event);
            }
          }}
          className="border-2 border-dashed rounded-lg p-12 flex flex-col items-center justify-center gap-4 cursor-pointer hover:bg-accent/50 transition-colors"
          data-testid="dropzone-id-upload"
        >
          <Upload className="h-8 w-8 text-muted-foreground" />
          <p className="text-sm text-muted-foreground text-center">
            Drag & drop or click to upload<br />
            (JPG, PNG, or PDF up to 10MB)
          </p>
          <input
            type="file"
            ref={fileInputRef}
            onChange={handleFileSelect}
            accept=".jpg,.jpeg,.png,.pdf"
            className="hidden"
          />
        </div>
      ) : (
        <Card className="overflow-hidden border-primary/20">
          <CardContent className="p-0">
            <div className="flex flex-col md:flex-row">
              {/* Preview Side */}
              <div className="w-full md:w-1/3 bg-muted flex items-center justify-center p-4 border-r">
                {fileType?.includes('pdf') ? (
                  <div className="flex flex-col items-center gap-2">
                    <FileText className="h-16 w-16 text-primary" />
                    <span className="text-xs font-medium">PDF Document</span>
                  </div>
                ) : (
                  <img src={preview} alt="ID Preview" width={300} height={192} className="max-h-48 rounded-md object-contain shadow-sm" />
                )}
              </div>

              {/* Status/Results Side */}
              <div className="flex-1 p-6 space-y-4">
                {isScanning ? (
                  <div className="flex flex-col items-center justify-center h-full gap-4 py-8">
                    <Loader2 className="h-8 w-8 animate-spin text-primary" />
                    <p className="text-sm font-medium animate-pulse">Trinity AI is scanning your document...</p>
                  </div>
                ) : result ? (
                  <div className="space-y-4">
                    <div className="flex items-center justify-between">
                      <h4 className="font-semibold text-lg">Scan Results</h4>
                      <Badge 
                        variant={result.verification_confidence === 'high' ? 'default' : result.verification_confidence === 'medium' ? 'secondary' : 'destructive'}
                        className={`capitalize ${result.verification_confidence === 'high' ? 'bg-success hover:bg-success/90' : result.verification_confidence === 'medium' ? 'bg-warning hover:bg-warning/90' : ''}`}
                      >
                        {result.verification_confidence === 'high' ? 'High Confidence' : result.verification_confidence === 'medium' ? 'Medium Confidence' : 'Manual Review Required'}
                      </Badge>
                    </div>

                    <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
                      <div className="text-muted-foreground">Name:</div>
                      <div className="font-medium">{result.full_name || 'Not detected'}</div>
                      <div className="text-muted-foreground">Date of Birth:</div>
                      <div className="font-medium">{result.date_of_birth || 'Not detected'}</div>
                      <div className="text-muted-foreground">ID Number:</div>
                      <div className="font-medium">{result.id_number || 'Not detected'}</div>
                      <div className="text-muted-foreground">Document Type:</div>
                      <div className="font-medium capitalize">{result.document_type?.replace('_', ' ') || 'Unknown'}</div>
                      <div className="text-muted-foreground">Issuing State:</div>
                      <div className="font-medium">{result.issuing_state || 'Not detected'}</div>
                      <div className="text-muted-foreground">Expiry Date:</div>
                      <div className="font-medium">{result.expiration_date || 'Not detected'}</div>
                    </div>

                    {result.flags && result.flags.length > 0 && (
                      <div className="space-y-2 pt-2 border-t">
                        <p className="text-xs font-semibold text-destructive uppercase tracking-wider">Verification Flags</p>
                        <div className="flex flex-wrap gap-2">
                          {result.flags.map((flag: string, i: number) => (
                            <Badge key={i} variant="outline" className="text-destructive border-destructive/20 bg-destructive/5 flex items-center gap-1">
                              <AlertCircle className="h-3 w-3" />
                              {flag}
                            </Badge>
                          ))}
                        </div>
                      </div>
                    )}

                    <div className="flex gap-2 pt-4">
                      <Button 
                        className="flex-1" 
                        data-testid="button-autopopulate"
                        onClick={() => onVerified?.(result)}
                      >
                        <CheckCircle2 className="mr-2 h-4 w-4" />
                        Auto-populate form fields
                      </Button>
                      <Button 
                        variant="outline" 
                        size="icon" 
                        onClick={reset}
                        data-testid="button-rescan"
                      >
                        <RefreshCw className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                ) : (
                  <div className="flex flex-col items-center justify-center h-full gap-4 py-8">
                    <AlertCircle className="h-8 w-8 text-destructive" />
                    <p className="text-sm font-medium text-destructive text-center">Scan failed — upload again or enter information manually</p>
                    <Button variant="outline" onClick={reset}>Try Again</Button>
                  </div>
                )}
              </div>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
