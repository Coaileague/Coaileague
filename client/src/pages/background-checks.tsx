import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { CanvasHubPage, type CanvasPageConfig } from "@/components/canvas-hub";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { UniversalModal, UniversalModalDescription, UniversalModalHeader, UniversalModalTitle, UniversalModalTrigger, UniversalModalFooter, UniversalModalContent } from '@/components/ui/universal-modal';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import {
  Search, FileSearch, Plus, Filter, Clock, CheckCircle, AlertTriangle,
  Loader2, ArrowRight, Settings, Globe, XCircle
} from "lucide-react";

interface BgCheckProvider {
  id: string;
  workspaceId: string;
  providerName: string;
  apiEndpoint: string;
  isActive: boolean;
  createdAt: string;
}

interface BackgroundCheck {
  id: string;
  workspaceId: string;
  employeeId: string;
  employeeName: string | null;
  checkType: string;
  status: string;
  result: string | null;
  requestedAt: string;
  completedAt: string | null;
  expiresAt: string | null;
  requestedBy: string;
  notes: string | null;
}

const CHECK_TYPES = [
  { value: "criminal", label: "Criminal Record" },
  { value: "employment_history", label: "Employment History" },
  { value: "education", label: "Education Verification" },
  { value: "drug_screen", label: "Drug Screen" },
  { value: "credit", label: "Credit Check" },
  { value: "reference", label: "Reference Check" },
  { value: "identity", label: "Identity Verification" },
];

const STATUS_FILTERS = [
  { value: "all", label: "All Statuses" },
  { value: "pending", label: "Pending" },
  { value: "in_progress", label: "In Progress" },
  { value: "clear", label: "Clear" },
  { value: "flagged", label: "Flagged" },
  { value: "expired", label: "Expired" },
];

export default function BackgroundChecks() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [statusFilter, setStatusFilter] = useState("all");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [newEmployeeId, setNewEmployeeId] = useState("");
  const [newCheckType, setNewCheckType] = useState("criminal");
  const [newNotes, setNewNotes] = useState("");
  const [providerName, setProviderName] = useState("");
  const [apiEndpoint, setApiEndpoint] = useState("");

  const { data: providers, isLoading: providersLoading } = useQuery<BgCheckProvider[]>({
    queryKey: ['/api/enterprise-features/background-checks/providers'],
  });

  const { data: checks, isLoading: checksLoading } = useQuery<BackgroundCheck[]>({
    queryKey: ['/api/enterprise-features/background-checks'],
  });

  const createProviderMutation = useMutation({
    mutationFn: async (data: { providerName: string; apiEndpoint: string }) => {
      return await apiRequest('POST', '/api/enterprise-features/background-checks/providers', data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/enterprise-features/background-checks/providers'] });
      toast({ title: "Provider Added", description: "Background check provider has been configured." });
      setProviderName("");
      setApiEndpoint("");
    },
    onError: (error: any) => {
      toast({ title: "Error", description: error.message || "Failed to add provider", variant: "destructive" });
    },
  });

  const requestCheckMutation = useMutation({
    mutationFn: async (data: { employeeId: string; checkType: string; notes: string }) => {
      return await apiRequest('POST', '/api/enterprise-features/background-checks', data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/enterprise-features/background-checks'] });
      toast({ title: "Check Requested", description: "Background check has been submitted for processing." });
      setDialogOpen(false);
      setNewEmployeeId("");
      setNewCheckType("criminal");
      setNewNotes("");
    },
    onError: (error: any) => {
      toast({ title: "Error", description: error.message || "Failed to request background check", variant: "destructive" });
    },
  });

  const cancelCheckMutation = useMutation({
    mutationFn: async (checkId: string) => {
      return await apiRequest('POST', `/api/enterprise-features/background-checks/${checkId}/cancel`, {});
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/enterprise-features/background-checks'] });
      toast({ title: "Check Cancelled", description: "Background check request has been cancelled." });
    },
    onError: (error: any) => {
      toast({ title: "Error", description: error.message || "Failed to cancel background check", variant: "destructive" });
    },
  });

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "pending":
        return <Badge variant="outline" className="border-yellow-500 text-yellow-600">Pending</Badge>;
      case "in_progress":
        return <Badge variant="outline" className="border-blue-500 text-blue-600">In Progress</Badge>;
      case "clear":
        return <Badge className="bg-green-600 text-white">Clear</Badge>;
      case "flagged":
        return <Badge variant="destructive">Flagged</Badge>;
      case "expired":
        return <Badge variant="secondary">Expired</Badge>;
      default:
        return <Badge variant="secondary">{status}</Badge>;
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case "pending":
        return <Clock className="h-4 w-4 text-yellow-500" />;
      case "in_progress":
        return <Loader2 className="h-4 w-4 text-blue-500 animate-spin" />;
      case "clear":
        return <CheckCircle className="h-4 w-4 text-green-500" />;
      case "flagged":
        return <AlertTriangle className="h-4 w-4 text-red-500" />;
      case "expired":
        return <AlertTriangle className="h-4 w-4 text-slate-500" />;
      default:
        return <Clock className="h-4 w-4 text-muted-foreground" />;
    }
  };

  const formatDate = (date: string | null) => {
    if (!date) return "N/A";
    return new Date(date).toLocaleDateString("en-US", {
      year: "numeric", month: "short", day: "numeric",
    });
  };

  const getCheckTypeLabel = (type: string) => {
    return CHECK_TYPES.find((t) => t.value === type)?.label || type;
  };

  const filteredChecks = checks?.filter(
    (c) => statusFilter === "all" || c.status === statusFilter
  );

  const pageConfig: CanvasPageConfig = {
    id: 'background-checks',
    title: 'Background Check Management',
    subtitle: 'Manage employee background verification and compliance',
    category: 'admin' as any,
    showHeader: true,
  };

  return (
    <CanvasHubPage config={pageConfig}>
      <div className="space-y-6">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Settings className="h-5 w-5" />
              Provider Configuration
            </CardTitle>
            <CardDescription>Set up your background check service provider</CardDescription>
          </CardHeader>
          <CardContent>
            {providers && providers.length > 0 ? (
              <div className="space-y-3 mb-4">
                {providers.map((p) => (
                  <div
                    key={p.id}
                    className="flex items-center justify-between gap-4 p-3 rounded-lg border flex-wrap"
                    data-testid={`provider-item-${p.id}`}
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <Globe className="h-4 w-4 text-muted-foreground shrink-0" />
                      <div className="min-w-0">
                        <p className="text-sm font-medium" data-testid={`text-provider-name-${p.id}`}>{p.providerName}</p>
                        <p className="text-xs text-muted-foreground truncate">{p.apiEndpoint}</p>
                      </div>
                    </div>
                    <Badge variant={p.isActive ? "default" : "secondary"}>
                      {p.isActive ? "Active" : "Inactive"}
                    </Badge>
                  </div>
                ))}
              </div>
            ) : null}
            <div className="flex items-end gap-3 flex-wrap">
              <div className="flex-1 min-w-[200px] space-y-2">
                <Label htmlFor="provider-name">Provider Name</Label>
                <Input
                  id="provider-name"
                  value={providerName}
                  onChange={(e) => setProviderName(e.target.value)}
                  placeholder="e.g. Checkr, GoodHire"
                  data-testid="input-provider-name"
                />
              </div>
              <div className="flex-1 min-w-[200px] space-y-2">
                <Label htmlFor="api-endpoint">API Endpoint</Label>
                <Input
                  id="api-endpoint"
                  value={apiEndpoint}
                  onChange={(e) => setApiEndpoint(e.target.value)}
                  placeholder="https://api.provider.com/v1"
                  data-testid="input-api-endpoint"
                />
              </div>
              <Button
                onClick={() => createProviderMutation.mutate({ providerName, apiEndpoint })}
                disabled={!providerName || !apiEndpoint || createProviderMutation.isPending}
                data-testid="button-add-provider"
              >
                <Plus className="h-4 w-4 mr-2" />
                {createProviderMutation.isPending ? "Adding..." : "Add Provider"}
              </Button>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <div className="flex items-center justify-between gap-4 flex-wrap">
              <div>
                <CardTitle className="flex items-center gap-2">
                  <FileSearch className="h-5 w-5" />
                  Background Checks
                </CardTitle>
                <CardDescription>Track and manage employee verification requests</CardDescription>
              </div>
              <div className="flex items-center gap-2 flex-wrap">
                <Select value={statusFilter} onValueChange={setStatusFilter}>
                  <SelectTrigger className="w-full md:w-[160px]" data-testid="select-status-filter">
                    <Filter className="h-4 w-4 mr-2" />
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {STATUS_FILTERS.map((f) => (
                      <SelectItem key={f.value} value={f.value}>{f.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <UniversalModal open={dialogOpen} onOpenChange={setDialogOpen}>
                  <UniversalModalTrigger asChild>
                    <Button data-testid="button-request-check">
                      <Plus className="h-4 w-4 mr-2" />
                      Request New Check
                    </Button>
                  </UniversalModalTrigger>
                  <UniversalModalContent>
                    <UniversalModalHeader>
                      <UniversalModalTitle>Request Background Check</UniversalModalTitle>
                      <UniversalModalDescription>Submit a new background verification request for an employee</UniversalModalDescription>
                    </UniversalModalHeader>
                    <div className="space-y-4 py-4">
                      <div className="space-y-2">
                        <Label htmlFor="employee-id">Employee ID</Label>
                        <Input
                          id="employee-id"
                          value={newEmployeeId}
                          onChange={(e) => setNewEmployeeId(e.target.value)}
                          placeholder="Enter employee ID"
                          data-testid="input-employee-id"
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="check-type">Check Type</Label>
                        <Select value={newCheckType} onValueChange={setNewCheckType}>
                          <SelectTrigger data-testid="select-check-type">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {CHECK_TYPES.map((t) => (
                              <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="check-notes">Notes (optional)</Label>
                        <Textarea
                          id="check-notes"
                          value={newNotes}
                          onChange={(e) => setNewNotes(e.target.value)}
                          placeholder="Additional notes or requirements"
                          rows={3}
                          data-testid="input-check-notes"
                        />
                      </div>
                    </div>
                    <UniversalModalFooter>
                      <Button variant="outline" onClick={() => setDialogOpen(false)} data-testid="button-cancel-check">
                        Cancel
                      </Button>
                      <Button
                        onClick={() => requestCheckMutation.mutate({
                          employeeId: newEmployeeId,
                          checkType: newCheckType,
                          notes: newNotes,
                        })}
                        disabled={!newEmployeeId || requestCheckMutation.isPending}
                        data-testid="button-submit-check"
                      >
                        {requestCheckMutation.isPending ? "Submitting..." : "Submit Request"}
                      </Button>
                    </UniversalModalFooter>
                  </UniversalModalContent>
                </UniversalModal>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            {checksLoading ? (
              <div className="space-y-4">
                {Array.from({ length: 5 }).map((_, i) => (
                  <Skeleton key={i} className="h-16 w-full rounded-md" />
                ))}
              </div>
            ) : checks.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 text-center border-2 border-dashed rounded-lg">
                <FileSearch className="h-12 w-12 text-muted-foreground mb-4" />
                <h3 className="text-lg font-semibold mb-2">No background checks yet</h3>
                <p className="text-muted-foreground mb-4">Submit your first employee verification check</p>
                <Button onClick={() => setDialogOpen(true)} data-testid="button-order-first-check">Order Check</Button>
              </div>
            ) : filteredChecks && filteredChecks.length > 0 ? (
              <div className="space-y-3">
                {filteredChecks.map((check) => (
                  <div
                    key={check.id}
                    className="flex items-center justify-between gap-4 p-4 rounded-lg border flex-wrap"
                    data-testid={`check-row-${check.id}`}
                  >
                    <div className="flex items-center gap-3 min-w-0 flex-1">
                      {getStatusIcon(check.status)}
                      <div className="min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <p className="text-sm font-medium" data-testid={`text-check-employee-${check.id}`}>
                            {check.employeeName || `Employee #${check.employeeId}`}
                          </p>
                          <Badge variant="outline" className="text-xs">
                            {getCheckTypeLabel(check.checkType)}
                          </Badge>
                        </div>
                        <div className="flex items-center gap-2 mt-1 text-xs text-muted-foreground flex-wrap">
                          <span>Requested: {formatDate(check.requestedAt)}</span>
                          {check.status === "in_progress" && (
                            <>
                              <ArrowRight className="h-3 w-3" />
                              <span>Processing</span>
                            </>
                          )}
                          {check.completedAt && (
                            <>
                              <ArrowRight className="h-3 w-3" />
                              <span>Completed: {formatDate(check.completedAt)}</span>
                            </>
                          )}
                          {check.expiresAt && (
                            <span className="text-muted-foreground">Expires: {formatDate(check.expiresAt)}</span>
                          )}
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 flex-wrap">
                      {check.result && (
                        <span className="text-xs text-muted-foreground">{check.result}</span>
                      )}
                      {getStatusBadge(check.status)}
                      {check.status === "pending" && (
                        <AlertDialog>
                          <AlertDialogTrigger asChild>
                            <Button variant="ghost" size="icon" className="text-destructive">
                              <XCircle className="h-4 w-4" />
                            </Button>
                          </AlertDialogTrigger>
                          <AlertDialogContent>
                            <AlertDialogHeader>
                              <AlertDialogTitle>Cancel Background Check?</AlertDialogTitle>
                              <AlertDialogDescription>
                                Are you sure you want to cancel this background check request for {check.employeeName || `Employee #${check.employeeId}`}? This action cannot be undone.
                              </AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                              <AlertDialogCancel>Cancel</AlertDialogCancel>
                              <AlertDialogAction 
                                onClick={() => cancelCheckMutation.mutate(check.id)}
                                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                              >
                                Cancel Request
                              </AlertDialogAction>
                            </AlertDialogFooter>
                          </AlertDialogContent>
                        </AlertDialog>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center py-12 text-muted-foreground">
                <FileSearch className="h-12 w-12 mx-auto mb-3 opacity-50" />
                <p className="text-sm">No background checks found</p>
                <p className="text-xs mt-1">Click "Request New Check" to submit your first verification</p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </CanvasHubPage>
  );
}
