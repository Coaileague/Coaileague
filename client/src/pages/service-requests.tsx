import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient } from "@/lib/queryClient";
import { apiRequest } from "@/lib/queryClient";
import { useAuth } from "@/hooks/useAuth";
import { CanvasHubPage, type CanvasPageConfig } from "@/components/canvas-hub";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import { Loader2, Plus, ClipboardList, CheckCircle2, Clock, AlertCircle } from "lucide-react";
import { format } from "date-fns";

const URGENCY_CONFIG: Record<string, { label: string; color: string; icon: any }> = {
  low:    { label: "Low",    color: "bg-muted/60 text-muted-foreground border-muted",          icon: Clock },
  normal: { label: "Normal", color: "bg-blue-500/15 text-blue-700 dark:text-blue-400 border-blue-500/30",   icon: Clock },
  high:   { label: "High",   color: "bg-orange-500/15 text-orange-700 dark:text-orange-400 border-orange-500/30", icon: AlertCircle },
  urgent: { label: "Urgent", color: "bg-red-500/15 text-red-700 dark:text-red-400 border-red-500/30",       icon: AlertCircle },
};

const STATUS_CONFIG: Record<string, { label: string; color: string }> = {
  submitted:    { label: "Submitted",    color: "bg-blue-500/15 text-blue-700 dark:text-blue-400 border-blue-500/30" },
  acknowledged: { label: "Acknowledged", color: "bg-purple-500/15 text-purple-700 dark:text-purple-400 border-purple-500/30" },
  in_review:    { label: "In Review",    color: "bg-yellow-500/15 text-yellow-700 dark:text-yellow-400 border-yellow-500/30" },
  approved:     { label: "Approved",     color: "bg-green-500/15 text-green-700 dark:text-green-400 border-green-500/30" },
  declined:     { label: "Declined",     color: "bg-red-500/15 text-red-700 dark:text-red-400 border-red-500/30" },
  completed:    { label: "Completed",    color: "bg-muted/60 text-muted-foreground border-muted" },
};

const REQUEST_TYPES = [
  { value: "extra_coverage", label: "Extra Coverage Request" },
  { value: "site_walk", label: "Site Walk / Inspection" },
  { value: "service_change", label: "Service Change" },
  { value: "emergency_coverage", label: "Emergency Coverage" },
  { value: "billing_inquiry", label: "Billing Inquiry" },
  { value: "other", label: "Other Request" },
];

const pageConfig: CanvasPageConfig = {
  id: "service-requests",
  title: "Service Requests",
  subtitle: "Client-submitted service and coverage requests",
  category: "dashboard",
};

export default function ServiceRequestsPage() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [showDialog, setShowDialog] = useState(false);
  const [selectedRequest, setSelectedRequest] = useState<any>(null);
  const [filterStatus, setFilterStatus] = useState("all");

  const canManage = user?.role === "owner" || user?.role === "manager" || user?.role === "root_admin";

  const { data: requests = [], isLoading } = useQuery<any[]>({
    queryKey: ["/api/service-requests"],
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: any }) =>
      apiRequest("PATCH", `/api/service-requests/${id}`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/service-requests"] });
      setSelectedRequest(null);
      toast({ title: "Request updated" });
    },
    onError: () => toast({ title: "Update failed", variant: "destructive" }),
  });

  const filtered = filterStatus === "all"
    ? requests
    : requests.filter((r: any) => r.status === filterStatus);

  const openCount = requests.filter((r: any) => ["submitted", "acknowledged", "in_review"].includes(r.status)).length;

  return (
    <CanvasHubPage config={pageConfig}>
      <div className="p-6 max-w-5xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h2 className="text-xl font-semibold">Service Requests</h2>
            <p className="text-sm text-muted-foreground mt-1">
              Client-submitted requests for extra coverage, site walks, and service changes.
            </p>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            {openCount > 0 && (
              <Badge variant="default" data-testid="badge-open-requests">{openCount} open</Badge>
            )}
          </div>
        </div>

        {/* Status Filter */}
        <div className="flex gap-2 flex-wrap">
          {["all", "submitted", "acknowledged", "in_review", "approved", "completed"].map((status) => (
            <Button
              key={status}
              variant={filterStatus === status ? "default" : "outline"}
              size="sm"
              onClick={() => setFilterStatus(status)}
              data-testid={`button-filter-${status}`}
            >
              {status === "all" ? "All Requests" : STATUS_CONFIG[status]?.label ?? status}
            </Button>
          ))}
        </div>

        {/* Requests List */}
        {isLoading ? (
          <div className="flex justify-center py-12">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          </div>
        ) : filtered.length === 0 ? (
          <Card>
            <CardContent className="py-14 text-center text-muted-foreground">
              <ClipboardList className="h-12 w-12 mx-auto mb-4 opacity-40" />
              <p className="font-medium">No service requests</p>
              <p className="text-sm mt-1">
                {filterStatus === "all"
                  ? "Requests submitted by clients will appear here."
                  : `No requests with status "${filterStatus}".`}
              </p>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-3">
            {filtered.map((request: any) => {
              const urgency = URGENCY_CONFIG[request.urgency] ?? URGENCY_CONFIG.normal;
              const status = STATUS_CONFIG[request.status] ?? STATUS_CONFIG.submitted;
              const UrgencyIcon = urgency.icon;
              const requestTypeLabel = REQUEST_TYPES.find(t => t.value === request.requestType)?.label ?? request.requestType;

              return (
                <Card
                  key={request.id}
                  className="hover-elevate cursor-pointer"
                  onClick={() => setSelectedRequest(request)}
                  data-testid={`card-service-request-${request.id}`}
                >
                  <CardContent className="p-4">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="space-y-1 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="font-medium text-sm">{requestTypeLabel}</span>
                          <Badge variant="outline" className={`text-xs ${status.color}`}>
                            {status.label}
                          </Badge>
                          <Badge variant="outline" className={`text-xs ${urgency.color}`}>
                            <UrgencyIcon className="h-3 w-3 mr-1" />
                            {urgency.label}
                          </Badge>
                        </div>
                        <p className="text-sm text-muted-foreground line-clamp-2">{request.description}</p>
                        {request.submittedBy && (
                          <p className="text-xs text-muted-foreground">By {request.submittedBy}</p>
                        )}
                      </div>
                      <span className="text-xs text-muted-foreground whitespace-nowrap">
                        {format(new Date(request.createdAt), "MMM d, yyyy")}
                      </span>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </div>

      {/* Request Detail Dialog */}
      {selectedRequest && (
        <Dialog open={!!selectedRequest} onOpenChange={(open) => !open && setSelectedRequest(null)}>
          <DialogContent className="max-w-md" data-testid="dialog-service-request-detail">
            <DialogHeader>
              <DialogTitle>
                {REQUEST_TYPES.find(t => t.value === selectedRequest.requestType)?.label ?? selectedRequest.requestType}
              </DialogTitle>
            </DialogHeader>
            <div className="space-y-4 py-2">
              <div className="flex flex-wrap gap-2">
                <Badge variant="outline" className={`text-xs ${STATUS_CONFIG[selectedRequest.status]?.color}`}>
                  {STATUS_CONFIG[selectedRequest.status]?.label ?? selectedRequest.status}
                </Badge>
                <Badge variant="outline" className={`text-xs ${URGENCY_CONFIG[selectedRequest.urgency]?.color}`}>
                  {URGENCY_CONFIG[selectedRequest.urgency]?.label ?? selectedRequest.urgency}
                </Badge>
              </div>

              <div className="space-y-1">
                <p className="text-sm font-medium">Description</p>
                <p className="text-sm text-muted-foreground">{selectedRequest.description}</p>
              </div>

              {selectedRequest.submittedBy && (
                <div className="space-y-1">
                  <p className="text-sm font-medium">Submitted By</p>
                  <p className="text-sm text-muted-foreground">{selectedRequest.submittedBy}</p>
                </div>
              )}

              <div className="space-y-1">
                <p className="text-sm font-medium">Submitted</p>
                <p className="text-sm text-muted-foreground">
                  {format(new Date(selectedRequest.createdAt), "MMMM d, yyyy 'at' h:mm a")}
                </p>
              </div>

              {canManage && (
                <div className="space-y-1.5 border-t pt-4">
                  <Label>Update Status</Label>
                  <div className="flex flex-wrap gap-2">
                    {["acknowledged", "in_review", "approved", "declined", "completed"].map((s) => (
                      <Button
                        key={s}
                        variant={selectedRequest.status === s ? "default" : "outline"}
                        size="sm"
                        onClick={() =>
                          updateMutation.mutate({ id: selectedRequest.id, data: { status: s } })
                        }
                        disabled={updateMutation.isPending || selectedRequest.status === s}
                        data-testid={`button-set-status-${s}`}
                      >
                        {STATUS_CONFIG[s]?.label ?? s}
                      </Button>
                    ))}
                  </div>
                </div>
              )}
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setSelectedRequest(null)} data-testid="button-close-request-detail">
                Close
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </CanvasHubPage>
  );
}
