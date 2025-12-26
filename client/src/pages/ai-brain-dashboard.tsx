import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  DocumentExtractionUpload,
  IssueDetectionViewer,
  GuardrailsDashboard,
  MigrationReview,
} from "@/components/ai-brain";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Brain, FileText, AlertTriangle, Settings, Bell } from "lucide-react";

interface User {
  id: string;
  workspaceId: string;
  email: string;
}

export default function AIBrainDashboard() {
  const [extractedData, setExtractedData] = useState<any>(null);
  const [entityType, setEntityType] = useState<"employee" | "client" | "vendor" | "invoice">(
    "employee"
  );

  const { data: user } = useQuery({
    queryKey: ["/api/user"],
    queryFn: async () => {
      const response = await fetch("/api/user");
      return response.json();
    },
  });

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="space-y-2">
        <div className="flex items-center gap-2">
          <Brain className="w-8 h-8 text-blue-600" />
          <h1 className="text-3xl font-bold">Trinity™ Automation</h1>
          <Badge variant="outline" className="ml-auto">
            Production Ready
          </Badge>
        </div>
        <p className="text-muted-foreground">
          Manage document extraction, issue detection, guardrails, and notifications
        </p>
      </div>

      {/* Quick Stats */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <FileText className="w-4 h-4" />
              Document Extraction
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">5</p>
            <p className="text-xs text-muted-foreground">Document types supported</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <AlertTriangle className="w-4 h-4" />
              Issue Detection
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">5</p>
            <p className="text-xs text-muted-foreground">Detection rules enabled</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <Settings className="w-4 h-4" />
              Guardrails
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">4</p>
            <p className="text-xs text-muted-foreground">Categories configured</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <Bell className="w-4 h-4" />
              Notifications
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">4</p>
            <p className="text-xs text-muted-foreground">Channels enabled</p>
          </CardContent>
        </Card>
      </div>

      {/* Main Tabs */}
      <Tabs defaultValue="extraction" className="space-y-4">
        <TabsList className="grid w-full grid-cols-4">
          <TabsTrigger value="extraction">Extract</TabsTrigger>
          <TabsTrigger value="issues">Issues</TabsTrigger>
          <TabsTrigger value="guardrails">Guardrails</TabsTrigger>
          <TabsTrigger value="review">Review</TabsTrigger>
        </TabsList>

        {/* Document Extraction Tab */}
        <TabsContent value="extraction" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Document Extraction Workflow</CardTitle>
              <CardDescription>
                Upload business documents for AI-powered data extraction using Trinity Vision
              </CardDescription>
            </CardHeader>
            <CardContent>
              <DocumentExtractionUpload />
              {extractedData && (
                <div className="mt-4 p-4 bg-green-50 dark:bg-green-950 rounded-lg">
                  <p className="text-sm font-medium text-green-900 dark:text-green-200">
                    ✓ Document ready for review. Move to Review tab to import.
                  </p>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Issue Detection Tab */}
        <TabsContent value="issues" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Issue Detection & Quality Analysis</CardTitle>
              <CardDescription>
                Identify data quality issues, anomalies, and recommended actions
              </CardDescription>
            </CardHeader>
            <CardContent>
              {extractedData ? (
                <IssueDetectionViewer
                  documentType={extractedData.documentType}
                  extractedData={extractedData.extractedFields}
                  onIssuesDetected={(issues) => console.log("Issues detected:", issues)}
                />
              ) : (
                <div className="text-center py-8 text-muted-foreground">
                  <p>Extract a document first to analyze for issues</p>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Guardrails Tab */}
        <TabsContent value="guardrails" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Trinity™ Guardrails Configuration</CardTitle>
              <CardDescription>
                View and manage automation limits, thresholds, and safety controls
              </CardDescription>
            </CardHeader>
            <CardContent>
              <GuardrailsDashboard />
            </CardContent>
          </Card>
        </TabsContent>

        {/* Review & Import Tab */}
        <TabsContent value="review" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Review & Import Data</CardTitle>
              <CardDescription>
                Review extracted data, make corrections, and import to workspace
              </CardDescription>
            </CardHeader>
            <CardContent>
              {extractedData ? (
                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium mb-2">Entity Type</label>
                    <select
                      value={entityType}
                      onChange={(e) => setEntityType(e.target.value as any)}
                      className="w-full px-3 py-2 border rounded-md"
                      data-testid="select-entity-type"
                    >
                      <option value="employee">Employee</option>
                      <option value="client">Client</option>
                      <option value="vendor">Vendor</option>
                      <option value="invoice">Invoice</option>
                    </select>
                  </div>
                  <MigrationReview
                    extractedData={extractedData}
                    entityType={entityType}
                    onImportSuccess={() => {
                      setExtractedData(null);
                    }}
                  />
                </div>
              ) : (
                <div className="text-center py-8 text-muted-foreground">
                  <p>Extract a document first to review and import</p>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
