import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, Plus, X } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import SRAPortalLayout from "./SRAPortalLayout";

const FINDING_TYPES = [
  { value: "expired_license", label: "Expired License" },
  { value: "training_deficiency", label: "Training Deficiency" },
  { value: "documentation_gap", label: "Documentation Gap" },
  { value: "policy_violation", label: "Policy Violation" },
  { value: "staffing_violation", label: "Staffing Violation" },
];
const SEVERITIES = ["critical", "major", "minor", "informational"];
const SEVERITY_COLORS: Record<string, string> = {
  critical: "bg-red-100 text-red-700",
  major: "bg-orange-100 text-orange-700",
  minor: "bg-yellow-100 text-yellow-700",
  informational: "bg-blue-100 text-blue-700",
};
const STATUS_COLORS: Record<string, string> = {
  open: "bg-red-50 text-red-600",
  in_progress: "bg-amber-50 text-amber-600",
  closed: "bg-green-50 text-green-600",
};

function sraFetch(path: string) {
  const token = localStorage.getItem("sra_session_token");
  return fetch(path, { headers: { Authorization: `Bearer ${token}` }, credentials: "include" }).then(r => r.json());
}

function sraRequest(method: string, path: string, body?: any) {
  const token = localStorage.getItem("sra_session_token");
  return fetch(path, {
    method,
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    credentials: "include",
    body: body ? JSON.stringify(body) : undefined,
  }).then(r => r.json());
}

interface NewFinding {
  findingType: string;
  severity: string;
  description: string;
  occupationCodeReference: string;
  recommendedAction: string;
  complianceDeadline: string;
  fineAmount: string;
}

export default function SRAFindings() {
  const qc = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  const [filterSeverity, setFilterSeverity] = useState("");
  const [filterStatus, setFilterStatus] = useState("open");
  const [newFinding, setNewFinding] = useState<NewFinding>({
    findingType: "",
    severity: "minor",
    description: "",
    occupationCodeReference: "",
    recommendedAction: "",
    complianceDeadline: "",
    fineAmount: "",
  });
  const [formError, setFormError] = useState("");

  const { data, isLoading } = useQuery({
    queryKey: ["/api/sra/findings"],
    queryFn: () => sraFetch("/api/sra/findings"),
  });

  const findings: any[] = data?.data || [];

  const createMutation = useMutation({
    mutationFn: (body: any) => sraRequest("POST", "/api/sra/findings", body),
    onSuccess: (res) => {
      if (!res.success) { setFormError(res.error || "Failed to create finding."); return; }
      qc.invalidateQueries({ queryKey: ["/api/sra/findings"] });
      setShowForm(false);
      setFormError("");
      setNewFinding({ findingType: "", severity: "minor", description: "", occupationCodeReference: "", recommendedAction: "", complianceDeadline: "", fineAmount: "" });
    },
    onError: (error: any) => {
      setFormError(error.message || "Failed to create finding. Please try again.");
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, body }: { id: string; body: any }) => sraRequest("PATCH", `/api/sra/findings/${id}`, body),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["/api/sra/findings"] }),
    onError: (error: any) => {
      setFormError(error.message || "Failed to update finding. Please try again.");
    },
  });

  const handleCreate = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newFinding.findingType || !newFinding.description) {
      setFormError("Finding type and description are required.");
      return;
    }
    createMutation.mutate({
      ...newFinding,
      fineAmount: newFinding.fineAmount ? parseFloat(newFinding.fineAmount) : undefined,
      complianceDeadline: newFinding.complianceDeadline || undefined,
    });
  };

  const setField = (field: keyof NewFinding) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) =>
    setNewFinding(prev => ({ ...prev, [field]: e.target.value }));

  const filtered = findings.filter(f =>
    (!filterSeverity || f.severity === filterSeverity) &&
    (!filterStatus || f.status === filterStatus)
  );

  return (
    <SRAPortalLayout activeRoute="/regulatory-audit/portal/findings">
      <div className="p-6 max-w-5xl mx-auto">
        <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Audit Findings</h1>
            <p className="text-gray-500 text-sm mt-1">Log and track compliance violations, deficiencies, and required actions.</p>
          </div>
          <Button
            data-testid="button-new-finding"
            onClick={() => setShowForm(true)}
            className="bg-[#1a3a6b] text-white gap-2"
          >
            <Plus className="w-4 h-4" /> New Finding
          </Button>
        </div>

        {/* Create Finding Modal */}
        {showForm && (
          <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4">
            <div className="bg-white rounded-lg shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
              <div className="flex items-center justify-between p-5 border-b">
                <h2 className="text-lg font-semibold text-[#1a3a6b]">New Audit Finding</h2>
                <button data-testid="button-close-finding-form" onClick={() => setShowForm(false)}>
                  <X className="w-5 h-5 text-gray-400" />
                </button>
              </div>
              <form onSubmit={handleCreate} className="p-5 space-y-4">
                {formError && <p className="text-red-600 text-sm">{formError}</p>}

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1">
                    <Label className="text-sm font-medium">Finding Type *</Label>
                    <select
                      data-testid="select-finding-type"
                      value={newFinding.findingType}
                      onChange={setField("findingType")}
                      className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm"
                    >
                      <option value="">Select type</option>
                      {FINDING_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                    </select>
                  </div>
                  <div className="space-y-1">
                    <Label className="text-sm font-medium">Severity *</Label>
                    <select
                      data-testid="select-severity"
                      value={newFinding.severity}
                      onChange={setField("severity")}
                      className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm"
                    >
                      {SEVERITIES.map(s => <option key={s} value={s}>{s.charAt(0).toUpperCase() + s.slice(1)}</option>)}
                    </select>
                  </div>
                </div>

                <div className="space-y-1">
                  <Label className="text-sm font-medium">Description *</Label>
                  <Textarea
                    data-testid="textarea-description"
                    value={newFinding.description}
                    onChange={setField("description")}
                    placeholder="Describe the finding in detail..."
                    rows={3}
                    className="border-gray-300 resize-none"
                  />
                </div>

                <div className="space-y-1">
                  <Label className="text-sm font-medium">Occupation Code Reference</Label>
                  <Input
                    data-testid="input-occ-code"
                    value={newFinding.occupationCodeReference}
                    onChange={setField("occupationCodeReference")}
                    placeholder="e.g., TX Occ. Code §1702"
                    className="border-gray-300"
                  />
                </div>

                <div className="space-y-1">
                  <Label className="text-sm font-medium">Recommended Action</Label>
                  <Textarea
                    data-testid="textarea-recommendation"
                    value={newFinding.recommendedAction}
                    onChange={setField("recommendedAction")}
                    placeholder="Recommended corrective action..."
                    rows={2}
                    className="border-gray-300 resize-none"
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1">
                    <Label className="text-sm font-medium">Compliance Deadline</Label>
                    <Input
                      data-testid="input-deadline"
                      type="date"
                      value={newFinding.complianceDeadline}
                      onChange={setField("complianceDeadline")}
                      className="border-gray-300"
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-sm font-medium">Fine Amount ($)</Label>
                    <Input
                      data-testid="input-fine"
                      type="number"
                      step="0.01"
                      min="0"
                      value={newFinding.fineAmount}
                      onChange={setField("fineAmount")}
                      placeholder="0.00"
                      className="border-gray-300"
                    />
                  </div>
                </div>

                <div className="flex gap-3 pt-2">
                  <Button
                    data-testid="button-submit-finding"
                    type="submit"
                    className="flex-1 bg-[#1a3a6b] text-white"
                    disabled={createMutation.isPending}
                  >
                    {createMutation.isPending ? "Saving..." : "Log Finding"}
                  </Button>
                  <Button type="button" variant="outline" onClick={() => setShowForm(false)}>Cancel</Button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* Filters */}
        <div className="flex flex-wrap gap-2 mb-4">
          {["", "open", "in_progress", "closed"].map(s => (
            <button
              key={s}
              data-testid={`filter-status-${s || "all"}`}
              onClick={() => setFilterStatus(s)}
              className={`px-3 py-1 rounded-full text-xs font-medium transition-colors ${filterStatus === s ? "bg-[#1a3a6b] text-white" : "bg-gray-100 text-gray-600 hover:bg-gray-200"}`}
            >
              {s ? s.replace("_", " ") : "All Statuses"}
            </button>
          ))}
          <div className="ml-auto">
            <select
              data-testid="filter-severity-select"
              value={filterSeverity}
              onChange={e => setFilterSeverity(e.target.value)}
              className="border border-gray-300 rounded px-2 py-1 text-xs"
            >
              <option value="">All Severities</option>
              {SEVERITIES.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>
        </div>

        {/* Findings list */}
        {isLoading ? (
          <div className="text-center py-12 text-gray-400">Loading findings...</div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-12">
            <AlertTriangle className="w-10 h-10 text-gray-300 mx-auto mb-3" />
            <p className="text-gray-400 text-sm">No findings match the current filters.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {filtered.map((f: any) => (
              <Card key={f.id} data-testid={`finding-card-${f.id}`} className="hover-elevate">
                <CardContent className="p-5">
                  <div className="flex items-start gap-4 flex-wrap">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap mb-2">
                        <Badge className={`${SEVERITY_COLORS[f.severity] || "bg-gray-100 text-gray-600"} text-xs`}>
                          {f.severity}
                        </Badge>
                        <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${STATUS_COLORS[f.status] || "bg-gray-50 text-gray-600"}`}>
                          {f.status.replace("_", " ")}
                        </span>
                        <span className="text-xs text-gray-400">
                          {FINDING_TYPES.find(t => t.value === f.findingType)?.label || f.findingType}
                        </span>
                        {f.occupationCodeReference && (
                          <span className="text-xs text-[#1a3a6b] font-mono">{f.occupationCodeReference}</span>
                        )}
                      </div>
                      <p className="text-gray-800 text-sm mb-2">{f.description}</p>
                      {f.recommendedAction && (
                        <p className="text-gray-500 text-xs"><strong>Action:</strong> {f.recommendedAction}</p>
                      )}
                      {f.complianceDeadline && (
                        <p className="text-gray-500 text-xs mt-1">
                          <strong>Deadline:</strong> {new Date(f.complianceDeadline).toLocaleDateString()}
                        </p>
                      )}
                      {f.fineAmount && (
                        <p className="text-red-600 text-xs font-medium mt-1">Fine: ${Number(f.fineAmount).toFixed(2)}</p>
                      )}
                    </div>
                    <div className="flex flex-col gap-2 flex-shrink-0">
                      {f.status === "open" && (
                        <Button
                          data-testid={`button-progress-${f.id}`}
                          size="sm"
                          variant="outline"
                          onClick={() => updateMutation.mutate({ id: f.id, body: { status: "in_progress" } })}
                        >
                          Mark In Progress
                        </Button>
                      )}
                      {f.status === "in_progress" && (
                        <Button
                          data-testid={`button-close-${f.id}`}
                          size="sm"
                          variant="outline"
                          onClick={() => updateMutation.mutate({ id: f.id, body: { status: "closed" } })}
                          className="text-green-700 border-green-300"
                        >
                          Close Finding
                        </Button>
                      )}
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>
    </SRAPortalLayout>
  );
}
