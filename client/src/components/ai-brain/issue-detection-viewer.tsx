import { secureFetch } from "@/lib/csrf";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { AlertCircle, CheckCircle, AlertTriangle } from "lucide-react";

interface Issue {
  id: string;
  type: string;
  severity: "info" | "warning" | "critical";
  title: string;
  description: string;
  affectedFields: string[];
  suggestedAction: string;
}

interface IssueDetectionViewerProps {
  documentType: string;
  extractedData: Record<string, any>;
  onIssuesDetected?: (issues: Issue[]) => void;
}

export function IssueDetectionViewer({
  documentType,
  extractedData,
  onIssuesDetected,
}: IssueDetectionViewerProps) {
  const { data, isLoading, error } = useQuery({
    queryKey: ["/api/ai-brain/detect-issues", documentType],
    queryFn: async () => {
      const response = await secureFetch("/api/ai-brain/detect-issues", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          documentType,
          extractedData,
          useAIAnalysis: false,
        }),
      });
      if (!response.ok) throw new Error("Failed to detect issues");
      const result = await response.json();
      onIssuesDetected?.(result.data.issues);
      return result.data;
    },
    enabled: Object.keys(extractedData).length > 0,
  });

  const getSeverityIcon = (severity: string) => {
    switch (severity) {
      case "critical":
        return <AlertCircle className="w-5 h-5 text-red-600" />;
      case "warning":
        return <AlertTriangle className="w-5 h-5 text-yellow-600" />;
      default:
        return <CheckCircle className="w-5 h-5 text-blue-600" />;
    }
  };

  const getSeverityColor = (severity: string) => {
    switch (severity) {
      case "critical":
        return "destructive";
      case "warning":
        return "secondary";
      default:
        return "outline";
    }
  };

  if (isLoading) {
    return (
      <Card data-testid="card-issues-loading">
        <CardContent className="pt-6">
          <p className="text-sm text-muted-foreground">Analyzing data quality...</p>
        </CardContent>
      </Card>
    );
  }

  if (error) {
    return (
      <Card data-testid="card-issues-error">
        <CardContent className="pt-6">
          <p className="text-sm text-destructive">Failed to analyze data quality</p>
        </CardContent>
      </Card>
    );
  }

  if (!data) return null;

  return (
    <Card data-testid="card-issues-results">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          Issue Detection
        </CardTitle>
        <CardDescription>
          {data.issues.length === 0
            ? "✓ No issues detected"
            : `${data.issues.length} issue${data.issues.length !== 1 ? "s" : ""} found`}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {data.issues.map((issue: Issue) => (
          <div
            key={issue.id}
            className="p-3 border rounded-lg space-y-2"
            data-testid={`issue-${issue.type}`}
          >
            <div className="flex items-start justify-between gap-2">
              <div className="flex items-start gap-2">
                {getSeverityIcon(issue.severity)}
                <div>
                  <p className="font-medium text-sm">{issue.title}</p>
                  <p className="text-xs text-muted-foreground">{issue.description}</p>
                </div>
              </div>
              <Badge variant={getSeverityColor(issue.severity) as any}>
                {issue.severity}
              </Badge>
            </div>

            {issue.affectedFields.length > 0 && (
              <div className="text-xs">
                <p className="font-medium">Affected fields:</p>
                <div className="flex flex-wrap gap-1 mt-1">
                  {issue.affectedFields.map((field) => (
                    <Badge key={field} variant="outline" className="text-xs">
                      {field}
                    </Badge>
                  ))}
                </div>
              </div>
            )}

            <div className="text-xs bg-muted p-2 rounded">
              <p className="font-medium">Suggested action:</p>
              <p className="mt-1">{issue.suggestedAction}</p>
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
