import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import {
  AlertTriangle,
  ShieldAlert,
  CheckCircle,
  Clock,
  User,
  ChevronDown,
  FileText,
} from "lucide-react";

type BreachSeverity = "low" | "medium" | "high" | "critical";

interface SopStep {
  id: string;
  phase: string;
  title: string;
  owner: string;
  timeTarget: string;
  required: boolean;
  actions: string[];
  notes?: string;
}

interface SeverityGuide {
  level: BreachSeverity;
  label: string;
  description: string;
  responseTime: string;
  notifyWithin: string;
  examples: string[];
}

interface SopPhase {
  id: string;
  label: string;
  description: string;
}

interface SopData {
  sop: SopStep[];
  severityGuide: SeverityGuide[];
  phases: SopPhase[];
}

const SEVERITY_COLORS: Record<BreachSeverity, string> = {
  critical: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400 border border-red-200 dark:border-red-800",
  high:     "bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-400 border border-orange-200 dark:border-orange-800",
  medium:   "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400 border border-yellow-200 dark:border-yellow-800",
  low:      "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400 border border-blue-200 dark:border-blue-800",
};

const PHASE_ORDER: string[] = [
  "detection",
  "initial_assessment",
  "containment",
  "evidence_preservation",
  "notification",
  "eradication",
  "recovery",
  "post_incident",
];

export default function BreachResponse() {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [severity, setSeverity] = useState<BreachSeverity | "">("");
  const [description, setDescription] = useState("");
  const [incidentOpened, setIncidentOpened] = useState<{ incidentId: string; severity: string } | null>(null);

  const { data, isLoading } = useQuery<SopData>({
    queryKey: ["/api/admin/breach-response/sop"],
  });

  const openIncidentMutation = useMutation({
    mutationFn: (body: { severity: BreachSeverity; description: string }) =>
      apiRequest("POST", "/api/admin/breach-response/incidents", body),
    onSuccess: async (res) => {
      const json = await res.json();
      setIncidentOpened(json.incident);
      setSeverity("");
      setDescription("");
      queryClient.invalidateQueries({ queryKey: ["/api/admin/breach-response/sop"] });
      toast({
        title: "Incident opened",
        description: `Incident ${json.incident.incidentId} has been logged and the team has been alerted.`,
      });
    },
    onError: (err: Error) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
  });

  const handleOpenIncident = () => {
    if (!severity || !description.trim()) {
      toast({
        title: "Missing fields",
        description: "Please select a severity level and describe the incident.",
        variant: "destructive",
      });
      return;
    }
    openIncidentMutation.mutate({ severity: severity as BreachSeverity, description: description.trim() });
  };

  const stepsByPhase = (phaseId: string): SopStep[] =>
    (data?.sop || []).filter(s => s.phase === phaseId);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-48">
        <div className="text-muted-foreground text-sm">Loading breach response SOP...</div>
      </div>
    );
  }

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-6">

      {/* Header */}
      <div className="flex flex-wrap items-center gap-3">
        <ShieldAlert className="h-7 w-7 text-destructive flex-shrink-0" />
        <div>
          <h1 className="text-xl font-semibold" data-testid="text-breach-heading">
            Breach Response SOP
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Security incident response procedures — CoAIleague platform
          </p>
        </div>
      </div>

      {/* Emergency Banner */}
      <Card className="border-destructive/50 bg-destructive/5">
        <CardHeader className="pb-3">
          <CardTitle className="flex flex-wrap items-center gap-2 text-base">
            <AlertTriangle className="h-4 w-4 text-destructive flex-shrink-0" />
            Open a Security Incident
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {incidentOpened && (
            <div
              className="rounded-md border border-green-300 bg-green-50 dark:border-green-800 dark:bg-green-950/30 p-3 flex items-center gap-2 text-sm text-green-800 dark:text-green-300"
              data-testid="status-incident-opened"
            >
              <CheckCircle className="h-4 w-4 flex-shrink-0" />
              <span>
                Incident <strong>{incidentOpened.incidentId}</strong> opened with severity{" "}
                <strong>{incidentOpened.severity}</strong>. The audit log has been updated.
              </span>
            </div>
          )}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="space-y-1">
              <Label htmlFor="select-severity">Severity</Label>
              <Select
                value={severity}
                onValueChange={(v) => setSeverity(v as BreachSeverity)}
              >
                <SelectTrigger id="select-severity" data-testid="input-severity">
                  <SelectValue placeholder="Select severity..." />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="critical">Critical</SelectItem>
                  <SelectItem value="high">High</SelectItem>
                  <SelectItem value="medium">Medium</SelectItem>
                  <SelectItem value="low">Low</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="sm:col-span-2 space-y-1">
              <Label htmlFor="input-description">Brief description</Label>
              <Textarea
                id="input-description"
                data-testid="input-description"
                placeholder="What happened? What data may be affected? Where was it discovered?"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                className="resize-none text-sm"
                rows={3}
              />
            </div>
          </div>
          <Button
            variant="destructive"
            onClick={handleOpenIncident}
            disabled={openIncidentMutation.isPending}
            data-testid="button-open-incident"
          >
            {openIncidentMutation.isPending ? "Opening..." : "Open Incident"}
          </Button>
          <p className="text-xs text-muted-foreground">
            Opening an incident logs a permanent audit entry, broadcasts an internal alert, and
            creates an incident ID for tracking. This action cannot be undone.
          </p>
        </CardContent>
      </Card>

      {/* Severity Guide */}
      <div>
        <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-3">
          Severity Classification
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {(data?.severityGuide || []).map((guide) => (
            <Card key={guide.level} data-testid={`card-severity-${guide.level}`}>
              <CardContent className="pt-4 pb-4 space-y-2">
                <div className="flex flex-wrap items-center gap-2">
                  <span className={`text-xs font-semibold px-2 py-0.5 rounded-md ${SEVERITY_COLORS[guide.level]}`}>
                    {guide.label}
                  </span>
                  <span className="text-xs text-muted-foreground flex items-center gap-1">
                    <Clock className="h-3 w-3" /> {guide.responseTime}
                  </span>
                </div>
                <p className="text-sm text-foreground">{guide.description}</p>
                <p className="text-xs text-muted-foreground">
                  Notify within: {guide.notifyWithin}
                </p>
                <ul className="text-xs text-muted-foreground space-y-0.5 list-disc list-inside">
                  {guide.examples.map((ex, i) => (
                    <li key={i}>{ex}</li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>

      {/* SOP Phases */}
      <div>
        <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-3">
          Response Procedures
        </h2>
        <Accordion type="multiple" defaultValue={["detection", "initial_assessment"]} className="space-y-2">
          {PHASE_ORDER.map((phaseId, phaseIndex) => {
            const phase = data?.phases.find(p => p.id === phaseId);
            const steps = stepsByPhase(phaseId);
            if (!phase) return null;
            return (
              <AccordionItem
                key={phaseId}
                value={phaseId}
                className="border rounded-md overflow-hidden"
                data-testid={`accordion-phase-${phaseId}`}
              >
                <AccordionTrigger className="px-4 py-3 hover:no-underline">
                  <div className="flex items-center gap-3 text-left">
                    <span className="flex-shrink-0 text-xs font-mono text-muted-foreground w-5">
                      {String(phaseIndex + 1).padStart(2, "0")}
                    </span>
                    <div>
                      <div className="text-sm font-medium">{phase.label}</div>
                      <div className="text-xs text-muted-foreground">{phase.description}</div>
                    </div>
                  </div>
                </AccordionTrigger>
                <AccordionContent className="px-4 pb-4 space-y-4">
                  {steps.map((step) => (
                    <div
                      key={step.id}
                      className="space-y-2 border-l-2 border-muted pl-4"
                      data-testid={`step-${step.id}`}
                    >
                      <div className="flex flex-wrap items-start gap-2">
                        <span className="text-sm font-medium flex-1">{step.title}</span>
                        {step.required && (
                          <Badge variant="secondary" className="text-xs flex-shrink-0">Required</Badge>
                        )}
                      </div>
                      <div className="flex flex-wrap gap-3 text-xs text-muted-foreground">
                        <span className="flex items-center gap-1">
                          <User className="h-3 w-3" /> {step.owner}
                        </span>
                        <span className="flex items-center gap-1">
                          <Clock className="h-3 w-3" /> {step.timeTarget}
                        </span>
                      </div>
                      <ul className="space-y-1.5">
                        {step.actions.map((action, ai) => (
                          <li key={ai} className="flex items-start gap-2 text-sm">
                            <CheckCircle className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0 mt-0.5" />
                            <span>{action}</span>
                          </li>
                        ))}
                      </ul>
                      {step.notes && (
                        <div className="rounded-md bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-800 px-3 py-2 text-xs text-amber-800 dark:text-amber-300 flex items-start gap-2">
                          <FileText className="h-3.5 w-3.5 flex-shrink-0 mt-0.5" />
                          {step.notes}
                        </div>
                      )}
                    </div>
                  ))}
                </AccordionContent>
              </AccordionItem>
            );
          })}
        </Accordion>
      </div>

      {/* Footer */}
      <p className="text-xs text-muted-foreground text-center pb-4">
        This SOP is reviewed after every incident and at minimum annually. Last updated: March 2026.
        Retain post-incident review (PIR) reports for a minimum of 3 years.
      </p>
    </div>
  );
}
