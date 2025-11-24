import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";
import { AlertTriangle, Settings } from "lucide-react";

export function GuardrailsDashboard() {
  const { data: guardrailsConfig, isLoading } = useQuery({
    queryKey: ["/api/ai-brain/guardrails/config"],
    queryFn: async () => {
      const response = await fetch("/api/ai-brain/guardrails/config");
      const result = await response.json();
      return result.data;
    },
  });

  if (isLoading) {
    return (
      <Card>
        <CardContent className="pt-6">
          <p className="text-sm text-muted-foreground">Loading guardrails...</p>
        </CardContent>
      </Card>
    );
  }

  const formatBytes = (bytes: number) => {
    return `${Math.round(bytes / 1024 / 1024)}MB`;
  };

  const guardrailsList = [
    {
      category: "Document Extraction",
      items: guardrailsConfig?.documentExtraction || {},
    },
    {
      category: "Data Migration",
      items: guardrailsConfig?.dataMigration || {},
    },
    {
      category: "Automation",
      items: guardrailsConfig?.automation || {},
    },
    {
      category: "Cost Control",
      items: guardrailsConfig?.costControl || {},
    },
  ];

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Settings className="w-5 h-5" />
            AI Brain Guardrails
          </CardTitle>
          <CardDescription>Current automation limits and thresholds</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-6">
            {guardrailsList.map((section) => (
              <div key={section.category}>
                <h3 className="font-semibold text-sm mb-3">{section.category}</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {Object.entries(section.items).map(([key, value]) => {
                    if (typeof value === "object" && value !== null) {
                      return (
                        <div key={key} className="border rounded-lg p-3">
                          <p className="text-xs font-medium text-muted-foreground">{key}</p>
                          <div className="mt-2 space-y-1">
                            {Object.entries(value).map(([subKey, subValue]) => (
                              <div key={subKey} className="text-xs flex justify-between">
                                <span>{subKey}:</span>
                                <span className="font-medium">{String(subValue)}</span>
                              </div>
                            ))}
                          </div>
                        </div>
                      );
                    }

                    return (
                      <div
                        key={key}
                        className="border rounded-lg p-3 flex justify-between items-center"
                      >
                        <span className="text-xs font-medium text-muted-foreground">{key}</span>
                        <Badge variant="outline">
                          {typeof value === "number" ? (
                            key.includes("Bytes")
                              ? formatBytes(value)
                              : value
                          ) : String(value)}
                        </Badge>
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <AlertTriangle className="w-5 h-5" />
            Guardrail Status
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-sm space-y-2">
            <div className="flex justify-between">
              <span>Document Extraction:</span>
              <Badge variant="outline">Active</Badge>
            </div>
            <div className="flex justify-between">
              <span>Data Migration:</span>
              <Badge variant="outline">Active</Badge>
            </div>
            <div className="flex justify-between">
              <span>Issue Detection:</span>
              <Badge variant="outline">Active</Badge>
            </div>
            <div className="flex justify-between">
              <span>Cost Control:</span>
              <Badge variant="outline">Active</Badge>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
