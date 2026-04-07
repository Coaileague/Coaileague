import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { AlertCircle, CheckCircle, Edit2, Loader2 } from "lucide-react";

interface ExtractedData {
  documentId: string;
  documentType: string;
  extractedFields: Record<string, any>;
  confidence: number;
  status: "success" | "failed" | "pending";
}

interface MigrationReviewProps {
  extractedData: ExtractedData;
  entityType: "employee" | "client" | "vendor" | "invoice";
  onImportSuccess?: () => void;
}

export function MigrationReview({
  extractedData,
  entityType,
  onImportSuccess,
}: MigrationReviewProps) {
  const [editingField, setEditingField] = useState<string | null>(null);
  const [editedValues, setEditedValues] = useState<Record<string, any>>(
    extractedData.extractedFields
  );
  const { toast } = useToast();

  const importMutation = useMutation({
    mutationFn: async () => {
      return apiRequest("POST", "/api/migration/import-extracted", {
        entityType,
        mappedData: editedValues,
      });
    },
    onSuccess: () => {
      toast({
        title: "Import Successful",
        description: `${entityType} imported successfully`,
      });
      queryClient.invalidateQueries({ queryKey: ["/api/documents"] });
      onImportSuccess?.();
    },
    onError: (error: any) => {
      toast({
        title: "Import Failed",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base sm:text-lg">
          {extractedData.status === "success" ? (
            <CheckCircle className="w-4 h-4 sm:w-5 sm:h-5 text-green-600 flex-shrink-0" />
          ) : (
            <AlertCircle className="w-4 h-4 sm:w-5 sm:h-5 text-red-600 flex-shrink-0" />
          )}
          Migration Review
        </CardTitle>
        <CardDescription className="flex items-center justify-between gap-2">
          <span className="text-xs sm:text-sm">Review and confirm extracted data before import</span>
          <Badge variant="outline" className="flex-shrink-0">
            {Math.round(extractedData.confidence * 100)}%
          </Badge>
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-3">
          {Object.entries(editedValues).map(([key, value]) => (
            <div key={key} className="border rounded-lg p-2 sm:p-3 space-y-2">
              <div className="flex items-center justify-between gap-2 min-w-0">
                <div className="flex-1 min-w-0">
                  <label className="text-xs sm:text-sm font-medium truncate block">{key}</label>
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => setEditingField(editingField === key ? null : key)}
                  data-testid={`button-edit-${key}`}
                >
                  <Edit2 className="w-4 h-4" />
                </Button>
              </div>

              {editingField === key ? (
                <input
                  type="text"
                  value={String(value || "")}
                  onChange={(e) =>
                    setEditedValues({ ...editedValues, [key]: e.target.value })
                  }
                  className="w-full px-3 py-2 border rounded-md text-sm"
                  data-testid={`input-edit-${key}`}
                />
              ) : (
                <p className="text-sm text-muted-foreground">{String(value || "—")}</p>
              )}
            </div>
          ))}
        </div>

        <div className="border-t pt-4">
          <Button
            onClick={() => importMutation.mutate()}
            disabled={importMutation.isPending}
            className="w-full"
            data-testid="button-import-confirm"
          >
            {importMutation.isPending ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Importing...
              </>
            ) : (
              `Import ${entityType.charAt(0).toUpperCase() + entityType.slice(1)}`
            )}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
