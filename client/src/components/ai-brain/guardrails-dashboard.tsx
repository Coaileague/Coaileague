import { secureFetch } from "@/lib/csrf";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";
import { AlertTriangle, Settings } from "lucide-react";

export function GuardrailsDashboard() {
  const { data: guardrailsConfig, isLoading, error } = useQuery({
    queryKey: ["/api/ai-brain/guardrails/config"],
    queryFn: async () => {
      const response = await secureFetch("/api/ai-brain/guardrails/config");
      if (!response.ok) throw new Error("Failed to fetch guardrails");
      const result = await response.json();
      return result.data;
    },
  });

  if (isLoading) {
    return (
      <Card data-testid="card-guardrails-loading">
        <CardContent className="pt-6">
          <p className="text-sm text-muted-foreground">Loading guardrails...</p>
        </CardContent>
      </Card>
    );
  }

  if (error) {
    return (
      <Card data-testid="card-guardrails-error">
        <CardContent className="pt-6">
          <p className="text-sm text-destructive">Failed to load guardrails</p>
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
      <Card data-testid="card-guardrails-config">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Settings className="w-5 h-5" />
            Trinity™ Guardrails
          </CardTitle>
          <CardDescription>Current automation limits and thresholds</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-6">
            {guardrailsList.map((section) => (
              <div key={section.category} data-testid={`section-guardrails-${section.category.toLowerCase().replace(/\s/g, "-")}`}>
                <h3 className="font-semibold text-sm mb-3">{section.category}</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {Object.entries(section.items).map(([key, value]) => {
                    if (typeof value === "object" && value !== null) {
                      return (
                        <div key={key} className="border rounded-lg p-3" data-testid={`guardrail-group-${key}`}>
                          <p className="text-xs font-medium text-muted-foreground">{key}</p>
                          <div className="mt-2 space-y-1">
                            {Object.entries(value).map(([subKey, subValue]) => (
                              <div key={subKey} className="text-xs flex justify-between gap-1">
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
                        className="border rounded-lg p-3 flex justify-between gap-2 items-center"
                        data-testid={`guardrail-item-${key}`}
                      >
                        <span className="text-xs font-medium text-muted-foreground">{key}</span>
                        <Badge variant="outline" data-testid={`badge-${key}`}>
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

      <Card data-testid="card-guardrails-status">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <AlertTriangle className="w-5 h-5" />
            Guardrail Status
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-sm space-y-2">
            <div className="flex justify-between gap-2" data-testid="status-extraction">
              <span>Document Extraction:</span>
              <Badge variant="outline">Active</Badge>
            </div>
            <div className="flex justify-between gap-2" data-testid="status-migration">
              <span>Data Migration:</span>
              <Badge variant="outline">Active</Badge>
            </div>
            <div className="flex justify-between gap-2" data-testid="status-detection">
              <span>Issue Detection:</span>
              <Badge variant="outline">Active</Badge>
            </div>
            <div className="flex justify-between gap-2" data-testid="status-cost">
              <span>Cost Control:</span>
              <Badge variant="outline">Active</Badge>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
