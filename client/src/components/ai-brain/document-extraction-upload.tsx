import { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Upload, CheckCircle, AlertCircle, Loader2 } from "lucide-react";

interface ExtractionResult {
  documentId: string;
  documentType: string;
  extractedFields: Record<string, any>;
  confidence: number;
  status: "success" | "failed" | "pending";
}

export function DocumentExtractionUpload() {
  const [file, setFile] = useState<File | null>(null);
  const [documentType, setDocumentType] = useState<string>("employee_record");
  const [results, setResults] = useState<ExtractionResult | null>(null);
  const { toast } = useToast();

  const extractMutation = useMutation({
    mutationFn: async () => {
      if (!file) throw new Error("No file selected");

      const fileData = await new Promise<string>((resolve) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result as string);
        reader.readAsDataURL(file);
      });

      const base64Data = fileData.includes(",") ? fileData.split(",")[1] : fileData;
      return apiRequest("POST", "/api/documents/extract", {
        documentName: file.name,
        documentType,
        fileData: base64Data,
        fileMimeType: file.type,
      });
    },
    onSuccess: (data) => {
      setResults(data.data);
      toast({
        title: "Extraction Complete",
        description: `Document extracted with ${Object.keys(data.data.extractedFields).length} fields`,
      });
    },
    onError: (error: any) => {
      toast({
        title: "Extraction Failed",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Upload className="w-5 h-5" />
            Document Extraction
          </CardTitle>
          <CardDescription>Upload a document for AI-powered data extraction</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <label className="block text-sm font-medium mb-2">Document Type</label>
            <select
              value={documentType}
              onChange={(e) => setDocumentType(e.target.value)}
              className="w-full px-3 py-2 border rounded-md"
              data-testid="select-document-type"
            >
              <option value="employee_record">Employee Record</option>
              <option value="invoice">Invoice</option>
              <option value="contract">Contract</option>
              <option value="client_data">Client Data</option>
              <option value="financial_statement">Financial Statement</option>
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium mb-2">Upload File</label>
            <input
              type="file"
              onChange={(e) => setFile(e.target.files?.[0] || null)}
              accept=".pdf,.jpg,.png,.doc,.docx"
              className="w-full px-3 py-2 border rounded-md"
              data-testid="input-file-upload"
            />
          </div>

          <Button
            onClick={() => extractMutation.mutate()}
            disabled={!file || extractMutation.isPending}
            className="w-full"
            data-testid="button-extract"
          >
            {extractMutation.isPending ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Extracting...
              </>
            ) : (
              "Extract Data"
            )}
          </Button>
        </CardContent>
      </Card>

      {results && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              {results.status === "success" ? (
                <CheckCircle className="w-5 h-5 text-green-600" />
              ) : (
                <AlertCircle className="w-5 h-5 text-red-600" />
              )}
              Extraction Results
            </CardTitle>
            <Badge variant="outline">
              Confidence: {Math.round(results.confidence * 100)}%
            </Badge>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {Object.entries(results.extractedFields).map(([key, value]) => (
                <div key={key} className="flex justify-between text-sm">
                  <span className="font-medium">{key}:</span>
                  <span className="text-muted-foreground">{String(value)}</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
