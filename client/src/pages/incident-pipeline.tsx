import { useState } from "react";
import { CanvasHubPage, type CanvasPageConfig } from '@/components/canvas-hub';
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import {
  Eye,
  AlertTriangle,
  ChevronLeft,
  Clock,
  CheckCircle2,
  XCircle,
  Send,
  RefreshCw,
  Filter,
  Search,
  FileText,
  Shield,
  MessageSquare,
  ArrowRight,
  Sparkles,
  Image,
  MapPin,
  AlertCircle,
  ArrowLeft,
} from 'lucide-react';;
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { cn } from "@/lib/utils";

type IncidentStatus = "submitted" | "trinity_processing" | "pending_review" | "approved" | "sent_to_client" | "revision_requested" | "rejected" | "client_acknowledged" | "draft";

interface Activity {
  id: string;
  incident_id: string;
  action: string;
  performed_by: string;
  performed_by_role: string;
  details: any;
  created_at: string;
}

interface Incident {
  id: string;
  workspace_id: string;
  incident_number: string;
  reported_by: string;
  shift_id: number | null;
  site_id: number | null;
  title: string;
  severity: "low" | "medium" | "high" | "critical";
  incident_type: string;
  raw_description: string | null;
  raw_voice_transcript: string | null;
  polished_description: string | null;
  polished_summary: string | null;
  photos: Array<{ url: string; caption?: string; takenAt?: string }>;
  witness_statements: Array<{ name: string; contact?: string; statement: string }>;
  trinity_legal_flags: Array<{ flag: string; severity: string; recommendation: string }> | null;
  trinity_revision_count: number;
  review_notes: string | null;
  reviewed_by: string | null;
  reviewed_at: string | null;
  gps_latitude: number | null;
  gps_longitude: number | null;
  location_address: string | null;
  status: IncidentStatus;
  occurred_at: string;
  sent_to_client_at: string | null;
  sent_to_client_by: string | null;
  created_at: string;
  updated_at: string;
  activities?: Activity[];
}

const STATUS_CONFIG: Record<IncidentStatus, { label: string; color: string; icon: typeof Clock }> = {
  draft: { label: "Draft", color: "bg-muted text-muted-foreground", icon: FileText },
  submitted: { label: "Submitted", color: "bg-blue-500/15 text-blue-600 dark:text-blue-400", icon: Send },
  trinity_processing: { label: "Trinity Processing", color: "bg-purple-500/15 text-purple-600 dark:text-purple-400", icon: Sparkles },
  pending_review: { label: "Pending Review", color: "bg-amber-500/15 text-amber-600 dark:text-amber-400", icon: Eye },
  approved: { label: "Approved", color: "bg-green-500/15 text-green-600 dark:text-green-400", icon: CheckCircle2 },
  sent_to_client: { label: "Sent to Client", color: "bg-cyan-500/15 text-cyan-600 dark:text-cyan-400", icon: ArrowRight },
  revision_requested: { label: "Revision Requested", color: "bg-orange-500/15 text-orange-600 dark:text-orange-400", icon: RefreshCw },
  rejected: { label: "Rejected", color: "bg-red-500/15 text-red-600 dark:text-red-400", icon: XCircle },
  client_acknowledged: { label: "Client Acknowledged", color: "bg-green-500/15 text-green-600 dark:text-green-400", icon: CheckCircle2 },
};

const SEVERITY_CONFIG = {
  low: { color: "bg-blue-500/15 text-blue-600 dark:text-blue-400", dotColor: "bg-blue-500" },
  medium: { color: "bg-amber-500/15 text-amber-600 dark:text-amber-400", dotColor: "bg-amber-500" },
  high: { color: "bg-orange-500/15 text-orange-600 dark:text-orange-400", dotColor: "bg-orange-500" },
  critical: { color: "bg-red-500/15 text-red-600 dark:text-red-400", dotColor: "bg-red-500" },
};

const STATUS_FILTERS: { value: IncidentStatus | "all"; label: string }[] = [
  { value: "all", label: "All" },
  { value: "submitted", label: "Submitted" },
  { value: "trinity_processing", label: "Processing" },
  { value: "pending_review", label: "Pending Review" },
  { value: "approved", label: "Approved" },
  { value: "sent_to_client", label: "Sent to Client" },
  { value: "revision_requested", label: "Revision Req." },
  { value: "rejected", label: "Rejected" },
];

export default function IncidentPipeline() {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<IncidentStatus | "all">("all");
  const [searchTerm, setSearchTerm] = useState("");
  const [managerNotes, setManagerNotes] = useState("");

  const { data: listData, isLoading: listLoading, isError: listError, refetch: refetchList } = useQuery<{ incidents: Incident[]; total: number }>({
    queryKey: ["/api/incident-reports", { status: statusFilter === "all" ? undefined : statusFilter, search: searchTerm || undefined, limit: 100 }],
  });

  const { data: detail, isLoading: detailLoading } = useQuery<Incident & { activities: Activity[] }>({
    queryKey: ["/api/incident-reports", selectedId],
    enabled: !!selectedId,
  });

  const statusMutation = useMutation({
    mutationFn: async ({ id, status, reviewNotes }: { id: string; status: string; reviewNotes?: string }) => {
      const res = await apiRequest("PATCH", `/api/incident-reports/${id}/status`, { status, reviewNotes });
      return res.json();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/incident-reports"] });
      toast({ title: "Status Updated", description: "Incident status has been updated." });
      setManagerNotes("");
    },
    onError: (err) => {
      toast({ title: "Error", description: err.message || "Failed to update status", variant: "destructive" });
    },
  });

  const trinityMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await apiRequest("POST", `/api/incident-reports/${id}/trinity-polish`);
      return res.json();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/incident-reports"] });
      toast({ title: "Trinity Analysis Complete", description: "The report has been polished by Trinity AI." });
    },
    onError: (err) => {
      toast({ title: "Error", description: err.message || "Failed to process with Trinity", variant: "destructive" });
    },
  });

  const incidents = listData?.incidents || [];

  const handleStatusChange = (id: string, newStatus: string) => {
    statusMutation.mutate({ id, status: newStatus, reviewNotes: managerNotes || undefined });
  };

  if (selectedId && detailLoading) {
    return (
      <div className="p-6 space-y-4">
        <Button variant="ghost" onClick={() => setSelectedId(null)} data-testid="button-back-loading"><ArrowLeft className="w-4 h-4 mr-2" /> Back</Button>
        <div className="space-y-3">
          <div className="h-8 w-64 bg-muted animate-pulse rounded-md" />
          <div className="h-4 w-48 bg-muted animate-pulse rounded-md" />
          <div className="h-40 w-full bg-muted animate-pulse rounded-md" />
          <div className="h-24 w-full bg-muted animate-pulse rounded-md" />
        </div>
      </div>
    );
  }

  if (selectedId && detail) {
    return <DetailView incident={detail} onBack={() => setSelectedId(null)} onStatusChange={handleStatusChange} onTrinityPolish={() => trinityMutation.mutate(selectedId)} managerNotes={managerNotes} setManagerNotes={setManagerNotes} isUpdating={statusMutation.isPending} isPolishing={trinityMutation.isPending} />;
  }

  const pageConfig: CanvasPageConfig = {
    id: 'incident-pipeline',
    title: 'Incident Pipeline',
    category: 'operations',
    showHeader: false,
  };

  return (
    <CanvasHubPage config={pageConfig}>
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold" data-testid="text-page-title">Incident Pipeline</h1>
          <p className="text-sm text-muted-foreground">Review and manage incident reports</p>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant="secondary" data-testid="text-incident-count">{listData?.total ?? 0} incidents</Badge>
        </div>
      </div>

      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search by title or incident number..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pl-9"
            data-testid="input-search"
          />
        </div>
        <div className="flex gap-1 flex-wrap">
          {STATUS_FILTERS.map((f) => (
            <Button
              key={f.value}
              variant={statusFilter === f.value ? "default" : "outline"}
              size="sm"
              onClick={() => setStatusFilter(f.value)}
              data-testid={`filter-status-${f.value}`}
            >
              {f.label}
            </Button>
          ))}
        </div>
      </div>

      {listError ? (
        <Card className="p-12 text-center" data-testid="incident-list-error">
          <AlertCircle className="w-12 h-12 mx-auto mb-3 text-destructive opacity-50" />
          <p className="text-muted-foreground mb-3">Failed to load incidents. Please try again.</p>
          <Button variant="outline" size="sm" onClick={() => refetchList()} data-testid="button-retry-incidents">Retry</Button>
        </Card>
      ) : listLoading ? (
        <div className="space-y-3">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="h-24 bg-muted rounded-md animate-pulse" />
          ))}
        </div>
      ) : incidents.length === 0 ? (
        <Card className="p-12 text-center">
          <FileText className="w-12 h-12 mx-auto mb-3 text-muted-foreground opacity-50" />
          <p className="text-muted-foreground" data-testid="text-no-incidents">No incidents found</p>
        </Card>
      ) : (
        <div className="space-y-2">
          {incidents.map((inc) => {
            const statusCfg = STATUS_CONFIG[inc.status] || STATUS_CONFIG.submitted;
            const sevCfg = SEVERITY_CONFIG[inc.severity];
            const StatusIcon = statusCfg.icon;
            return (
              <Card
                key={inc.id}
                className="p-4 cursor-pointer hover-elevate transition-colors"
                onClick={() => setSelectedId(inc.id)}
                data-testid={`incident-row-${inc.id}`}
              >
                <div className="flex items-start gap-3">
                  <div className={cn("w-2 h-2 rounded-full mt-2 shrink-0", sevCfg.dotColor)} />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-mono text-xs text-muted-foreground" data-testid={`text-incident-number-${inc.id}`}>{inc.incident_number}</span>
                      <Badge variant="outline" className={cn("text-xs", sevCfg.color)} data-testid={`badge-severity-${inc.id}`}>
                        {inc.severity}
                      </Badge>
                      <Badge variant="outline" className={cn("text-xs", statusCfg.color)} data-testid={`badge-status-${inc.id}`}>
                        <StatusIcon className="w-3 h-3 mr-1" />
                        {statusCfg.label}
                      </Badge>
                    </div>
                    <p className="font-medium mt-1 truncate" data-testid={`text-incident-title-${inc.id}`}>{inc.title}</p>
                    <div className="flex items-center gap-3 mt-1 text-xs text-muted-foreground flex-wrap">
                      <span>{inc.incident_type}</span>
                      <span>{format(new Date(inc.occurred_at || inc.updated_at || inc.created_at), "MMM d, yyyy h:mm a")}</span>
                      {inc.location_address && (
                        <span className="flex items-center gap-1">
                          <MapPin className="w-3 h-3" />
                          {inc.location_address}
                        </span>
                      )}
                    </div>
                  </div>
                  <ChevronLeft className="w-4 h-4 text-muted-foreground rotate-180 shrink-0 mt-1" />
                </div>
              </Card>
            );
          })}
        </div>
      )}
    </CanvasHubPage>
  );
}

function DetailView({
  incident,
  onBack,
  onStatusChange,
  onTrinityPolish,
  managerNotes,
  setManagerNotes,
  isUpdating,
  isPolishing,
}: {
  incident: Incident & { activities: Activity[] };
  onBack: () => void;
  onStatusChange: (id: string, status: string) => void;
  onTrinityPolish: () => void;
  managerNotes: string;
  setManagerNotes: (v: string) => void;
  isUpdating: boolean;
  isPolishing: boolean;
}) {
  const statusCfg = STATUS_CONFIG[incident.status] || STATUS_CONFIG.submitted;
  const sevCfg = SEVERITY_CONFIG[incident.severity];
  const StatusIcon = statusCfg.icon;

  const photos = Array.isArray(incident.photos) ? incident.photos : (() => { try { return JSON.parse(incident.photos as any) || []; } catch { return []; } })();
  const legalFlags = Array.isArray(incident.trinity_legal_flags) ? incident.trinity_legal_flags : (() => { try { return JSON.parse(incident.trinity_legal_flags as any) || []; } catch { return []; } })();

  return (
    <div className="p-4 md:p-6 max-w-5xl mx-auto space-y-4">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={onBack} data-testid="button-back">
          <ChevronLeft className="w-5 h-5" />
        </Button>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-mono text-sm text-muted-foreground" data-testid="text-detail-incident-number">{incident.incident_number}</span>
            <Badge variant="outline" className={cn("text-xs", sevCfg.color)} data-testid="badge-detail-severity">
              {incident.severity}
            </Badge>
            <Badge variant="outline" className={cn("text-xs", statusCfg.color)} data-testid="badge-detail-status">
              <StatusIcon className="w-3 h-3 mr-1" />
              {statusCfg.label}
            </Badge>
          </div>
          <h1 className="text-xl font-bold mt-1 truncate" data-testid="text-detail-title">{incident.title}</h1>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="lg:col-span-2 space-y-4">
          <Card className="p-4 space-y-3">
            <div className="flex items-center gap-3 text-sm text-muted-foreground flex-wrap">
              <span>Type: <strong className="text-foreground">{incident.incident_type}</strong></span>
              <span>Occurred: <strong className="text-foreground">{format(new Date(incident.occurred_at), "MMM d, yyyy h:mm a")}</strong></span>
              {incident.location_address && (
                <span className="flex items-center gap-1">
                  <MapPin className="w-3 h-3" />
                  {incident.location_address}
                </span>
              )}
            </div>
          </Card>

          <Tabs defaultValue={incident.polished_description ? "polished" : "raw"}>
            <TabsList data-testid="tabs-report-version">
              <TabsTrigger value="polished" disabled={!incident.polished_description} data-testid="tab-trinity-version">
                <Sparkles className="w-3 h-3 mr-1" />
                Trinity's Version
              </TabsTrigger>
              <TabsTrigger value="raw" data-testid="tab-raw-version">
                <FileText className="w-3 h-3 mr-1" />
                Raw
              </TabsTrigger>
            </TabsList>
            <TabsContent value="polished">
              <Card className="p-4">
                {incident.polished_description ? (
                  <div className="space-y-3">
                    {incident.polished_summary && (
                      <div className="p-3 bg-muted rounded-md">
                        <p className="text-sm font-medium" data-testid="text-polished-summary">{incident.polished_summary}</p>
                      </div>
                    )}
                    <p className="text-sm whitespace-pre-wrap" data-testid="text-polished-description">{incident.polished_description}</p>
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                      <Sparkles className="w-3 h-3" />
                      <span>Trinity revision #{incident.trinity_revision_count}</span>
                    </div>
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground">No Trinity version available yet.</p>
                )}
              </Card>
            </TabsContent>
            <TabsContent value="raw">
              <Card className="p-4">
                <p className="text-sm whitespace-pre-wrap" data-testid="text-raw-description">{incident.raw_description || "No description provided."}</p>
                {incident.raw_voice_transcript && (
                  <div className="mt-3 p-3 bg-muted rounded-md">
                    <p className="text-xs font-medium text-muted-foreground mb-1">Voice Transcript</p>
                    <p className="text-sm">{incident.raw_voice_transcript}</p>
                  </div>
                )}
              </Card>
            </TabsContent>
          </Tabs>

          {photos.length > 0 && (
            <Card className="p-4">
              <h3 className="text-sm font-medium mb-3 flex items-center gap-2">
                <Image className="w-4 h-4" />
                Photos ({photos.length})
              </h3>
              <div className="grid grid-cols-3 gap-2">
                {photos.map((photo: any, idx: number) => (
                  <div key={idx} className="aspect-square rounded-md bg-muted overflow-hidden" data-testid={`photo-thumbnail-${idx}`}>
                    <img src={photo.url} alt={photo.caption || `Photo ${idx + 1}`} width={300} height={300} className="w-full h-full object-cover" loading="lazy" />
                  </div>
                ))}
              </div>
            </Card>
          )}

          {legalFlags.length > 0 && (
            <Card className="p-4 border-amber-500/30">
              <h3 className="text-sm font-medium mb-3 flex items-center gap-2 text-amber-600 dark:text-amber-400">
                <Shield className="w-4 h-4" />
                Trinity Legal Flags ({legalFlags.length})
              </h3>
              <div className="space-y-2">
                {legalFlags.map((flag: any, idx: number) => (
                  <div key={idx} className="p-3 rounded-md bg-muted" data-testid={`legal-flag-${idx}`}>
                    <div className="flex items-center gap-2 mb-1">
                      <AlertCircle className="w-3 h-3" />
                      <span className="text-sm font-medium">{flag.flag}</span>
                      <Badge variant="outline" className={cn("text-xs", SEVERITY_CONFIG[flag.severity as keyof typeof SEVERITY_CONFIG]?.color || "")}>
                        {flag.severity}
                      </Badge>
                    </div>
                    <p className="text-xs text-muted-foreground">{flag.recommendation}</p>
                  </div>
                ))}
              </div>
            </Card>
          )}

          <Card className="p-4">
            <h3 className="text-sm font-medium mb-3 flex items-center gap-2">
              <Clock className="w-4 h-4" />
              Activity Timeline
            </h3>
            {incident.activities && incident.activities.length > 0 ? (
              <div className="space-y-3">
                {incident.activities.map((act) => (
                  <div key={act.id} className="flex gap-3 text-sm" data-testid={`activity-${act.id}`}>
                    <div className="w-2 h-2 rounded-full bg-muted-foreground mt-1.5 shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className="font-medium">{act.action.replace(/_/g, " ")}</p>
                      <p className="text-xs text-muted-foreground">
                        {act.performed_by_role} &middot; {format(new Date(act.created_at), "MMM d, h:mm a")}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">No activity recorded yet.</p>
            )}
          </Card>
        </div>

        <div className="space-y-4">
          <Card className="p-4 space-y-4">
            <h3 className="text-sm font-medium">Manager Actions</h3>

            <div>
              <label className="text-xs text-muted-foreground mb-1 block">Manager Notes</label>
              <Textarea
                value={managerNotes}
                onChange={(e) => setManagerNotes(e.target.value)}
                placeholder="Add review notes..."
                className="resize-none"
                rows={3}
                data-testid="input-manager-notes"
              />
            </div>

            <div className="space-y-2">
              {(incident.status === "pending_review" || incident.status === "submitted") && (
                <>
                  <Button
                    className="w-full"
                    onClick={() => onStatusChange(incident.id, "approved")}
                    disabled={isUpdating}
                    data-testid="button-approve"
                  >
                    <CheckCircle2 className="w-4 h-4 mr-2" />
                    Approve
                  </Button>
                  {incident.status === "pending_review" && (
                    <Button
                      variant="outline"
                      className="w-full"
                      onClick={() => onStatusChange(incident.id, "revision_requested")}
                      disabled={isUpdating}
                      data-testid="button-request-revision"
                    >
                      <RefreshCw className="w-4 h-4 mr-2" />
                      Request Revision
                    </Button>
                  )}
                  {incident.status === "pending_review" && (
                    <Button
                      variant="outline"
                      className="w-full text-destructive"
                      onClick={() => onStatusChange(incident.id, "rejected")}
                      disabled={isUpdating}
                      data-testid="button-reject"
                    >
                      <XCircle className="w-4 h-4 mr-2" />
                      Reject
                    </Button>
                  )}
                </>
              )}

              {incident.status === "approved" && (
                <Button
                  className="w-full"
                  onClick={() => onStatusChange(incident.id, "sent_to_client")}
                  disabled={isUpdating}
                  data-testid="button-send-to-client"
                >
                  <Send className="w-4 h-4 mr-2" />
                  Send to Client
                </Button>
              )}

              {(incident.status === "submitted" || incident.status === "revision_requested") && (
                <Button
                  variant="outline"
                  className="w-full"
                  onClick={onTrinityPolish}
                  disabled={isPolishing}
                  data-testid="button-trinity-reanalyze"
                >
                  <Sparkles className="w-4 h-4 mr-2" />
                  {isPolishing ? "Processing..." : "Re-analyze with Trinity (10 credits)"}
                </Button>
              )}
            </div>
          </Card>

          <Card className="p-4 space-y-2">
            <h3 className="text-sm font-medium">Details</h3>
            <div className="space-y-1 text-sm">
              <div className="flex justify-between gap-2">
                <span className="text-muted-foreground">Status</span>
                <span className="font-medium">{statusCfg.label}</span>
              </div>
              <div className="flex justify-between gap-2">
                <span className="text-muted-foreground">Severity</span>
                <span className="font-medium capitalize">{incident.severity}</span>
              </div>
              <div className="flex justify-between gap-2">
                <span className="text-muted-foreground">Type</span>
                <span className="font-medium">{incident.incident_type}</span>
              </div>
              <div className="flex justify-between gap-2">
                <span className="text-muted-foreground">Created</span>
                <span className="font-medium">{format(new Date(incident.occurred_at || incident.updated_at || incident.created_at), "MMM d, yyyy")}</span>
              </div>
              {incident.reviewed_at && (
                <div className="flex justify-between gap-2">
                  <span className="text-muted-foreground">Reviewed</span>
                  <span className="font-medium">{format(new Date(incident.reviewed_at), "MMM d, yyyy")}</span>
                </div>
              )}
              {incident.sent_to_client_at && (
                <div className="flex justify-between gap-2">
                  <span className="text-muted-foreground">Sent to Client</span>
                  <span className="font-medium">{format(new Date(incident.sent_to_client_at), "MMM d, yyyy")}</span>
                </div>
              )}
              {incident.review_notes && (
                <div className="pt-2 border-t">
                  <span className="text-muted-foreground text-xs">Review Notes</span>
                  <p className="text-sm mt-1" data-testid="text-review-notes">{incident.review_notes}</p>
                </div>
              )}
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}
