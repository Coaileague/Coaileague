import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { CanvasHubPage, type CanvasPageConfig } from "@/components/canvas-hub";
import { UniversalModal, UniversalModalContent, UniversalModalHeader, UniversalModalTitle, UniversalModalDescription, UniversalModalFooter } from "@/components/ui/universal-modal";
import {
  GitBranch,
  Building2,
  Users,
  Briefcase,
  Plus,
  Link2,
  Unlink,
  Receipt,
  DollarSign,
  MapPin,
  Globe,
  CheckCircle,
  AlertCircle,
  RefreshCw,
  ChevronRight,
  Layers,
  TrendingUp,
} from "lucide-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const US_STATES = [
  "AL","AK","AZ","AR","CA","CO","CT","DE","FL","GA","HI","ID","IL","IN","IA",
  "KS","KY","LA","ME","MD","MA","MI","MN","MS","MO","MT","NE","NV","NH","NJ",
  "NM","NY","NC","ND","OH","OK","OR","PA","RI","SC","SD","TN","TX","UT","VT",
  "VA","WA","WV","WI","WY","DC",
];

interface OrgNode {
  id: string;
  name: string;
  subOrgLabel: string;
  isRoot: boolean;
  isSubOrg: boolean;
  primaryOperatingState: string | null;
  operatingStates: string[];
  memberCount: number;
  clientCount: number;
  subscriptionTier: string | null;
  isCurrent: boolean;
  isSuspended: boolean;
  isFrozen: boolean;
}

interface OrgTree {
  root: OrgNode;
  children: OrgNode[];
  totalOrgs: number;
  consolidatedBillingEnabled: boolean;
}

interface BatchResult {
  summary: { total: number; succeeded: number; failed: number; totalInvoiced?: number };
  results: Array<{ workspaceId: string; workspaceName: string; success: boolean; error?: string; payrollRunId?: string; invoiceCount?: number; totalAmount?: number }>;
}

function StatPill({ icon: Icon, value, label }: { icon: any; value: string | number; label: string }) {
  return (
    <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
      <Icon size={14} className="shrink-0" />
      <span className="font-semibold text-foreground">{value}</span>
      <span>{label}</span>
    </div>
  );
}

function BranchCard({ node, isRoot, onDetach, detaching }: { node: OrgNode; isRoot: boolean; onDetach?: (id: string) => void; detaching: boolean }) {
  const statusColor = node.isSuspended
    ? "text-destructive"
    : node.isFrozen
    ? "text-muted-foreground"
    : "text-emerald-500";

  const states = Array.from(new Set([
    ...(node.primaryOperatingState ? [node.primaryOperatingState] : []),
    ...(node.operatingStates || []),
  ])).slice(0, 4);

  return (
    <Card className="relative" data-testid={`card-branch-${node.id}`}>
      <CardContent className="p-5">
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div className="flex items-start gap-3 min-w-0">
            <div className="mt-0.5 flex-shrink-0 w-9 h-9 rounded-md bg-muted flex items-center justify-center">
              {isRoot ? <Building2 size={18} className="text-primary" /> : <GitBranch size={18} className="text-muted-foreground" />}
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <h3 className="font-semibold text-sm truncate" data-testid={`text-branch-name-${node.id}`}>
                  {node.subOrgLabel || node.name}
                </h3>
                {isRoot && <Badge variant="secondary" className="text-[10px]">Headquarters</Badge>}
                {node.isCurrent && <Badge variant="outline" className="text-[10px]">Current</Badge>}
                {node.isSuspended && <Badge variant="destructive" className="text-[10px]">Suspended</Badge>}
                {node.isFrozen && <Badge variant="outline" className="text-[10px]">Frozen</Badge>}
              </div>
              <p className="text-xs text-muted-foreground mt-0.5 truncate">{node.name}</p>
              <div className="flex items-center gap-1 mt-1 flex-wrap">
                <CheckCircle size={11} className={statusColor} />
                <span className={`text-[11px] font-medium ${statusColor}`}>
                  {node.isSuspended ? "Suspended" : node.isFrozen ? "Frozen" : "Active"}
                </span>
              </div>
            </div>
          </div>
          {!isRoot && onDetach && (
            <Button
              size="icon"
              variant="ghost"
              onClick={() => onDetach(node.id)}
              disabled={detaching}
              data-testid={`button-detach-${node.id}`}
              title="Detach this branch"
              className="shrink-0"
            >
              <Unlink size={15} />
            </Button>
          )}
        </div>

        <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3">
          <StatPill icon={Users} value={node.memberCount} label="members" />
          <StatPill icon={Briefcase} value={node.clientCount} label="clients" />
          {states.length > 0 && (
            <div className="flex items-center gap-1.5 text-sm text-muted-foreground col-span-2 sm:col-span-1">
              <MapPin size={14} className="shrink-0" />
              <span className="text-foreground font-semibold text-xs">{states.join(", ")}</span>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

export default function OrgHub() {
  const { user } = useAuth();
  const { toast } = useToast();

  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showAttachModal, setShowAttachModal] = useState(false);
  const [showBatchPayrollModal, setShowBatchPayrollModal] = useState(false);
  const [showBatchInvoiceModal, setShowBatchInvoiceModal] = useState(false);
  const [batchResult, setBatchResult] = useState<BatchResult | null>(null);

  const [newBranchName, setNewBranchName] = useState("");
  const [newBranchLabel, setNewBranchLabel] = useState("");
  const [newBranchState, setNewBranchState] = useState("");

  const [attachWorkspaceId, setAttachWorkspaceId] = useState("");
  const [attachLabel, setAttachLabel] = useState("");

  const [payPeriodStart, setPayPeriodStart] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() - 14);
    return d.toISOString().split("T")[0];
  });
  const [payPeriodEnd, setPayPeriodEnd] = useState(() => new Date().toISOString().split("T")[0]);
  const [invoicePeriodDays, setInvoicePeriodDays] = useState("7");

  const { data: orgTree, isLoading } = useQuery<OrgTree>({
    queryKey: ["/api/workspace/org-tree"],
  });

  const createBranch = useMutation({
    mutationFn: (body: object) => apiRequest("POST", "/api/workspace/sub-orgs", body),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/workspace/org-tree"] });
      queryClient.invalidateQueries({ queryKey: ["/api/workspace/sub-orgs"] });
      setShowCreateModal(false);
      setNewBranchName("");
      setNewBranchLabel("");
      setNewBranchState("");
      toast({ title: "Branch created", description: "New sub-organization added to your network" });
    },
    onError: (e: any) => toast({ title: "Failed to create branch", description: e.message, variant: "destructive" }),
  });

  const attachBranch = useMutation({
    mutationFn: (body: object) => apiRequest("POST", "/api/workspace/sub-orgs/attach", body),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/workspace/org-tree"] });
      queryClient.invalidateQueries({ queryKey: ["/api/workspace/sub-orgs"] });
      setShowAttachModal(false);
      setAttachWorkspaceId("");
      setAttachLabel("");
      toast({ title: "Organization linked", description: "Workspace attached to your org network" });
    },
    onError: (e: any) => toast({ title: "Failed to attach organization", description: e.message, variant: "destructive" }),
  });

  const detachBranch = useMutation({
    mutationFn: (subOrgId: string) => apiRequest("POST", `/api/workspace/sub-orgs/${subOrgId}/detach`, {}),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/workspace/org-tree"] });
      toast({ title: "Branch detached", description: "The organization is now independent" });
    },
    onError: (e: any) => toast({ title: "Failed to detach", description: e.message, variant: "destructive" }),
  });

  const batchPayroll = useMutation({
    mutationFn: (body: object) => apiRequest("POST", "/api/workspace/sub-orgs/batch-payroll", body),
    onSuccess: (data: any) => {
      setBatchResult(data);
      setShowBatchPayrollModal(false);
      toast({
        title: `Batch payroll complete`,
        description: `${data.summary.succeeded}/${data.summary.total} organizations processed`,
      });
    },
    onError: (e: any) => toast({ title: "Batch payroll failed", description: e.message, variant: "destructive" }),
  });

  const batchInvoice = useMutation({
    mutationFn: (body: object) => apiRequest("POST", "/api/workspace/sub-orgs/batch-invoices", body),
    onSuccess: (data: any) => {
      setBatchResult(data);
      setShowBatchInvoiceModal(false);
      toast({
        title: `Batch invoicing complete`,
        description: `${data.summary.succeeded}/${data.summary.total} organizations invoiced — $${(data.summary.totalInvoiced || 0).toFixed(2)} total`,
      });
    },
    onError: (e: any) => toast({ title: "Batch invoicing failed", description: e.message, variant: "destructive" }),
  });

  const pageConfig: CanvasPageConfig = {
    id: "org-hub",
    title: "Organization Network",
    subtitle: "Manage your multi-branch security operations",
    category: "operations",
  };

  const totalMembers = (orgTree ? [orgTree.root, ...orgTree.children] : []).reduce((s, n) => s + n.memberCount, 0);
  const totalClients = (orgTree ? [orgTree.root, ...orgTree.children] : []).reduce((s, n) => s + n.clientCount, 0);
  const allStates = Array.from(new Set(
    (orgTree ? [orgTree.root, ...orgTree.children] : []).flatMap(n => [
      ...(n.primaryOperatingState ? [n.primaryOperatingState] : []),
      ...(n.operatingStates || []),
    ])
  ));

  return (
    <CanvasHubPage config={pageConfig}>
      <div className="space-y-6">

        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2 flex-wrap">
            <Button
              onClick={() => setShowCreateModal(true)}
              data-testid="button-create-branch"
            >
              <Plus size={16} />
              New Branch
            </Button>
            <Button
              variant="outline"
              onClick={() => setShowAttachModal(true)}
              data-testid="button-attach-org"
            >
              <Link2 size={16} />
              Link Existing Org
            </Button>
          </div>
          {orgTree && orgTree.totalOrgs > 1 && (
            <div className="flex items-center gap-2 flex-wrap">
              <Button
                variant="outline"
                onClick={() => setShowBatchPayrollModal(true)}
                disabled={batchPayroll.isPending}
                data-testid="button-batch-payroll"
              >
                <DollarSign size={16} />
                Run All Payroll
              </Button>
              <Button
                variant="outline"
                onClick={() => setShowBatchInvoiceModal(true)}
                disabled={batchInvoice.isPending}
                data-testid="button-batch-invoice"
              >
                <Receipt size={16} />
                Generate All Invoices
              </Button>
            </div>
          )}
        </div>

        {isLoading ? (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {[1, 2, 3].map(i => <Skeleton key={i} className="h-40 rounded-lg" />)}
          </div>
        ) : !orgTree ? (
          <Card>
            <CardContent className="py-12 text-center">
              <AlertCircle size={36} className="mx-auto text-muted-foreground mb-3" />
              <p className="font-semibold">Unable to load organization data</p>
              <p className="text-sm text-muted-foreground mt-1">Please refresh the page to try again</p>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-6">
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <Card data-testid="stat-total-branches">
                <CardContent className="p-5">
                  <div className="flex items-center gap-3">
                    <div className="w-9 h-9 rounded-md bg-muted flex items-center justify-center">
                      <Layers size={18} className="text-primary" />
                    </div>
                    <div>
                      <p className="text-2xl font-bold">{orgTree.totalOrgs}</p>
                      <p className="text-xs text-muted-foreground">Organizations</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
              <Card data-testid="stat-total-members">
                <CardContent className="p-5">
                  <div className="flex items-center gap-3">
                    <div className="w-9 h-9 rounded-md bg-muted flex items-center justify-center">
                      <Users size={18} className="text-primary" />
                    </div>
                    <div>
                      <p className="text-2xl font-bold">{totalMembers}</p>
                      <p className="text-xs text-muted-foreground">Total Workforce</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
              <Card data-testid="stat-total-clients">
                <CardContent className="p-5">
                  <div className="flex items-center gap-3">
                    <div className="w-9 h-9 rounded-md bg-muted flex items-center justify-center">
                      <Briefcase size={18} className="text-primary" />
                    </div>
                    <div>
                      <p className="text-2xl font-bold">{totalClients}</p>
                      <p className="text-xs text-muted-foreground">Total Clients</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
              <Card data-testid="stat-total-states">
                <CardContent className="p-5">
                  <div className="flex items-center gap-3">
                    <div className="w-9 h-9 rounded-md bg-muted flex items-center justify-center">
                      <Globe size={18} className="text-primary" />
                    </div>
                    <div>
                      <p className="text-2xl font-bold">{allStates.length}</p>
                      <p className="text-xs text-muted-foreground">Operating States</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>

            {orgTree.consolidatedBillingEnabled && (
              <Card className="border-primary/20 bg-primary/5">
                <CardContent className="py-3 px-5">
                  <div className="flex items-center gap-2">
                    <TrendingUp size={15} className="text-primary" />
                    <span className="text-sm font-medium">Consolidated billing is active — all branch usage is billed to this organization</span>
                  </div>
                </CardContent>
              </Card>
            )}

            <div>
              <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-3">Headquarters</h2>
              <BranchCard
                node={orgTree.root}
                isRoot
                detaching={detachBranch.isPending}
              />
            </div>

            {orgTree.children.length > 0 && (
              <div>
                <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-3">
                  Branches <span className="ml-1 text-foreground">({orgTree.children.length})</span>
                </h2>
                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                  {orgTree.children.map(node => (
                    <BranchCard
                      key={node.id}
                      node={node}
                      isRoot={false}
                      onDetach={(id) => detachBranch.mutate(id)}
                      detaching={detachBranch.isPending}
                    />
                  ))}
                </div>
              </div>
            )}

            {orgTree.children.length === 0 && (
              <Card>
                <CardContent className="py-10 text-center">
                  <GitBranch size={32} className="mx-auto text-muted-foreground mb-3" />
                  <p className="font-semibold text-sm">No branches yet</p>
                  <p className="text-sm text-muted-foreground mt-1 max-w-sm mx-auto">
                    Create a new branch to expand to additional states, or link an existing CoAIleague workspace to consolidate billing.
                  </p>
                </CardContent>
              </Card>
            )}

            {batchResult && (
              <Card data-testid="card-batch-results">
                <CardHeader>
                  <CardTitle className="text-base">Last Batch Operation Results</CardTitle>
                  <CardDescription>
                    {batchResult.summary.succeeded} succeeded, {batchResult.summary.failed} failed
                    {batchResult.summary.totalInvoiced !== undefined && ` — $${batchResult.summary.totalInvoiced.toFixed(2)} invoiced`}
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="space-y-2">
                    {batchResult.results.map(r => (
                      <div key={r.workspaceId} className="flex items-center justify-between gap-2 py-2 border-b last:border-0">
                        <div className="flex items-center gap-2 min-w-0">
                          {r.success
                            ? <CheckCircle size={14} className="text-emerald-500 shrink-0" />
                            : <AlertCircle size={14} className="text-destructive shrink-0" />
                          }
                          <span className="text-sm truncate">{r.workspaceName}</span>
                        </div>
                        <div className="text-xs text-muted-foreground shrink-0">
                          {r.success
                            ? r.payrollRunId ? "Payroll created" : `${r.invoiceCount || 0} invoices — $${(r.totalAmount || 0).toFixed(2)}`
                            : r.error || "Failed"
                          }
                        </div>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            )}
          </div>
        )}
      </div>

      <UniversalModal open={showCreateModal} onOpenChange={setShowCreateModal}>
        <UniversalModalContent>
          <UniversalModalHeader>
            <UniversalModalTitle>Create New Branch</UniversalModalTitle>
            <UniversalModalDescription>
              Add a new sub-organization under your headquarters. The branch will inherit your subscription tier and share your credit pool.
            </UniversalModalDescription>
          </UniversalModalHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <label className="text-sm font-medium">Organization Name</label>
              <Input
                placeholder="e.g. Acme Security — Dallas"
                value={newBranchName}
                onChange={e => setNewBranchName(e.target.value)}
                data-testid="input-branch-name"
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium">Display Label</label>
              <Input
                placeholder="e.g. Dallas Branch"
                value={newBranchLabel}
                onChange={e => setNewBranchLabel(e.target.value)}
                data-testid="input-branch-label"
              />
              <p className="text-xs text-muted-foreground">Shown in org tree and Trinity context</p>
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium">Primary Operating State</label>
              <Select value={newBranchState} onValueChange={setNewBranchState}>
                <SelectTrigger data-testid="select-branch-state">
                  <SelectValue placeholder="Select state" />
                </SelectTrigger>
                <SelectContent>
                  {US_STATES.map(s => (
                    <SelectItem key={s} value={s}>{s}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <UniversalModalFooter>
            <Button variant="outline" onClick={() => setShowCreateModal(false)}>Cancel</Button>
            <Button
              disabled={!newBranchName.trim() || createBranch.isPending}
              onClick={() => createBranch.mutate({ name: newBranchName, subOrgLabel: newBranchLabel || newBranchName, primaryOperatingState: newBranchState || undefined })}
              data-testid="button-confirm-create-branch"
            >
              {createBranch.isPending ? <RefreshCw size={15} className="animate-spin" /> : <Plus size={15} />}
              Create Branch
            </Button>
          </UniversalModalFooter>
        </UniversalModalContent>
      </UniversalModal>

      <UniversalModal open={showAttachModal} onOpenChange={setShowAttachModal}>
        <UniversalModalContent>
          <UniversalModalHeader>
            <UniversalModalTitle>Link Existing Organization</UniversalModalTitle>
            <UniversalModalDescription>
              Connect an existing CoAIleague workspace as a branch under your headquarters. You must own both organizations.
            </UniversalModalDescription>
          </UniversalModalHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <label className="text-sm font-medium">Workspace ID</label>
              <Input
                placeholder="Paste the workspace ID to link"
                value={attachWorkspaceId}
                onChange={e => setAttachWorkspaceId(e.target.value)}
                data-testid="input-attach-workspace-id"
              />
              <p className="text-xs text-muted-foreground">Found in that workspace's Settings page</p>
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium">Branch Label (optional)</label>
              <Input
                placeholder="e.g. Houston Office"
                value={attachLabel}
                onChange={e => setAttachLabel(e.target.value)}
                data-testid="input-attach-label"
              />
            </div>
          </div>
          <UniversalModalFooter>
            <Button variant="outline" onClick={() => setShowAttachModal(false)}>Cancel</Button>
            <Button
              disabled={!attachWorkspaceId.trim() || attachBranch.isPending}
              onClick={() => attachBranch.mutate({ targetWorkspaceId: attachWorkspaceId, subOrgLabel: attachLabel || undefined })}
              data-testid="button-confirm-attach"
            >
              {attachBranch.isPending ? <RefreshCw size={15} className="animate-spin" /> : <Link2 size={15} />}
              Link Organization
            </Button>
          </UniversalModalFooter>
        </UniversalModalContent>
      </UniversalModal>

      <UniversalModal open={showBatchPayrollModal} onOpenChange={setShowBatchPayrollModal}>
        <UniversalModalContent>
          <UniversalModalHeader>
            <UniversalModalTitle>Run Payroll for All Branches</UniversalModalTitle>
            <UniversalModalDescription>
              Triggers a payroll run for headquarters and all {orgTree ? orgTree.children.length : 0} branches. Each org processes independently using their own employee time data.
            </UniversalModalDescription>
          </UniversalModalHeader>
          <div className="space-y-4 py-2">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <label className="text-sm font-medium">Period Start</label>
                <Input
                  type="date"
                  value={payPeriodStart}
                  onChange={e => setPayPeriodStart(e.target.value)}
                  data-testid="input-pay-period-start"
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-sm font-medium">Period End</label>
                <Input
                  type="date"
                  value={payPeriodEnd}
                  onChange={e => setPayPeriodEnd(e.target.value)}
                  data-testid="input-pay-period-end"
                />
              </div>
            </div>
            <div className="rounded-md bg-muted p-3 text-sm text-muted-foreground">
              <strong className="text-foreground">{orgTree?.totalOrgs || 0}</strong> organizations will be processed. Results will be shown after completion.
            </div>
          </div>
          <UniversalModalFooter>
            <Button variant="outline" onClick={() => setShowBatchPayrollModal(false)}>Cancel</Button>
            <Button
              disabled={batchPayroll.isPending}
              onClick={() => batchPayroll.mutate({ payPeriodStart, payPeriodEnd })}
              data-testid="button-confirm-batch-payroll"
            >
              {batchPayroll.isPending ? <RefreshCw size={15} className="animate-spin" /> : <DollarSign size={15} />}
              Run All Payroll
            </Button>
          </UniversalModalFooter>
        </UniversalModalContent>
      </UniversalModal>

      <UniversalModal open={showBatchInvoiceModal} onOpenChange={setShowBatchInvoiceModal}>
        <UniversalModalContent>
          <UniversalModalHeader>
            <UniversalModalTitle>Generate Invoices for All Branches</UniversalModalTitle>
            <UniversalModalDescription>
              Generates client invoices across headquarters and all {orgTree ? orgTree.children.length : 0} branches using their schedule data.
            </UniversalModalDescription>
          </UniversalModalHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <label className="text-sm font-medium">Billing Period</label>
              <Select value={invoicePeriodDays} onValueChange={setInvoicePeriodDays}>
                <SelectTrigger data-testid="select-invoice-period">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="7">Last 7 days (weekly)</SelectItem>
                  <SelectItem value="14">Last 14 days (bi-weekly)</SelectItem>
                  <SelectItem value="30">Last 30 days (monthly)</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="rounded-md bg-muted p-3 text-sm text-muted-foreground">
              <strong className="text-foreground">{orgTree?.totalOrgs || 0}</strong> organizations will be invoiced. All revenue aggregates to your consolidated billing.
            </div>
          </div>
          <UniversalModalFooter>
            <Button variant="outline" onClick={() => setShowBatchInvoiceModal(false)}>Cancel</Button>
            <Button
              disabled={batchInvoice.isPending}
              onClick={() => batchInvoice.mutate({ periodDays: parseInt(invoicePeriodDays) })}
              data-testid="button-confirm-batch-invoice"
            >
              {batchInvoice.isPending ? <RefreshCw size={15} className="animate-spin" /> : <Receipt size={15} />}
              Generate All Invoices
            </Button>
          </UniversalModalFooter>
        </UniversalModalContent>
      </UniversalModal>
    </CanvasHubPage>
  );
}
