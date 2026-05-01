import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useAppToast } from "@/hooks/use-app-toast";
import { formatDate } from "@/lib/module-utils";
import { BADGE_COLORS } from "@/lib/module-utils";
import {
  ModulePageShell, ModuleDetailShell, ModuleSkeletonList,
  ModuleEmptyState, ModuleToolbar,
} from "@/components/modules/ModulePageShell";
import {
  FileText, GitBranch, CheckCircle2, Plus, History, ArrowLeft
} from "lucide-react";

interface PostOrderVersion {
  id: string;
  site_id: string;
  site_name?: string;
  version_number: number;
  title: string;
  content: string;
  change_summary: string;
  effective_date: string;
  created_by: string;
  is_current: boolean;
  requires_acknowledgment: boolean;
  acknowledgment_deadline?: string;
  acknowledged_count: number;
  pending_count: number;
  created_at: string;
}

interface Site {
  id: string;
  name: string;
}

const EMPTY_FORM = {
  site_id: "", title: "", content: "", change_summary: "",
  effective_date: "", requires_acknowledgment: false, acknowledgment_deadline: "",
};

function getPendingBadge(v: PostOrderVersion) {
  if (!v.requires_acknowledgment) return null;
  if (v.pending_count > 0) return <Badge className={BADGE_COLORS.amber}>{v.pending_count} pending</Badge>;
  return <Badge className={BADGE_COLORS.green}>All acknowledged</Badge>;
}

export default function PostOrderVersionsPage() {
  const { toast } = useAppToast();
  const [selectedSite, setSelectedSite] = useState("all");
  const [selectedVersion, setSelectedVersion] = useState<PostOrderVersion | null>(null);
  const [showNewVersionForm, setShowNewVersionForm] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);

  const { data: versions = [], isLoading } = useQuery<PostOrderVersion[]>({
    queryKey: ["/api/post-order-versions/current"],
  });
  const { data: allVersions = [] } = useQuery<PostOrderVersion[]>({
    queryKey: ["/api/post-order-versions/all"],
  });
  const { data: sites = [] } = useQuery<Site[]>({
    queryKey: ["/api/sites"],
  });

  const createMutation = useMutation({
    mutationFn: (data: typeof EMPTY_FORM) => apiRequest("POST", "/api/post-order-versions", data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/post-order-versions"] });
      setShowNewVersionForm(false);
      setForm(EMPTY_FORM);
      toast({ title: "Version created", description: "Post order version saved successfully." });
    },
    onError: (err) => toast({ title: "Failed to create version", description: err.message, variant: "destructive" }),
  });

  const filtered = selectedSite === "all"
    ? versions
    : versions.filter((v) => v.site_id === selectedSite);

  // ── Detail view ──────────────────────────────────────────────────────────
  if (selectedVersion) {
    const siteVersions = allVersions
      .filter((v) => v.site_id === selectedVersion.site_id)
      .sort((a, b) => b.version_number - a.version_number);

    return (
      <ModuleDetailShell
        backButton={
          <Button variant="ghost" size="sm" onClick={() => setSelectedVersion(null)} data-testid="button-back-versions" className="gap-2">
            <ArrowLeft className="w-4 h-4" /> Back to versions
          </Button>
        }
        title={selectedVersion.title}
        subtitle={`${selectedVersion.site_name || selectedVersion.site_id} — Version ${selectedVersion.version_number}`}
        badges={
          <>
            {selectedVersion.is_current && <Badge className={BADGE_COLORS.green}>Current Version</Badge>}
            <Button variant="outline" size="sm" onClick={() => setShowHistory(!showHistory)} className="gap-2">
              <History className="w-4 h-4" /> {showHistory ? "Hide" : "Show"} History
            </Button>
          </>
        }
      >
        {showHistory && (
          <Card className="mb-6">
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Version History</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {siteVersions.map((v) => (
                <div
                  key={v.id}
                  className={`flex items-center justify-between p-3 rounded-md ${v.id === selectedVersion.id ? "bg-muted" : "hover-elevate cursor-pointer"}`}
                  onClick={() => v.id !== selectedVersion.id && setSelectedVersion(v)}
                  data-testid={`version-history-${v.id}`}
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <GitBranch className="w-4 h-4 text-muted-foreground shrink-0" />
                    <div className="min-w-0">
                      <p className="text-sm font-medium truncate">v{v.version_number} — {v.change_summary}</p>
                      <p className="text-xs text-muted-foreground">
                        Created {formatDate(v.created_at)} · Effective {formatDate(v.effective_date)}
                      </p>
                    </div>
                  </div>
                  {v.is_current && (
                    <Badge className={BADGE_COLORS.green} data-testid={`badge-current-${v.id}`}>Current</Badge>
                  )}
                </div>
              ))}
            </CardContent>
          </Card>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
          {[
            { label: "Effective Date", value: formatDate(selectedVersion.effective_date) },
            { label: "Acknowledgments", value: `${selectedVersion.acknowledged_count} of ${selectedVersion.acknowledged_count + selectedVersion.pending_count}` },
            { label: "Deadline", value: formatDate(selectedVersion.acknowledgment_deadline) },
          ].map(({ label, value }) => (
            <Card key={label}>
              <CardContent className="pt-4">
                <p className="text-xs text-muted-foreground">{label}</p>
                <p className="text-sm font-medium mt-1">{value}</p>
              </CardContent>
            </Card>
          ))}
        </div>

        {selectedVersion.change_summary && (
          <Card className="mb-4">
            <CardContent className="pt-4">
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-2">Change Summary</p>
              <p className="text-sm text-foreground">{selectedVersion.change_summary}</p>
            </CardContent>
          </Card>
        )}

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Post Order Content</CardTitle>
          </CardHeader>
          <CardContent>
            <pre className="text-sm text-foreground whitespace-pre-wrap font-sans leading-relaxed" data-testid="text-post-order-content">
              {selectedVersion.content}
            </pre>
          </CardContent>
        </Card>
      </ModuleDetailShell>
    );
  }

  // ── List view ────────────────────────────────────────────────────────────
  return (
    <ModulePageShell
      title="Post Order Versions"
      description="Track and manage site post order version history and acknowledgments"
      action={
        <Button onClick={() => setShowNewVersionForm(true)} data-testid="button-new-post-order-version" className="gap-2">
          <Plus className="w-4 h-4" /> New Version
        </Button>
      }
    >
      {showNewVersionForm && (
        <Card className="mb-6">
          <CardHeader>
            <CardTitle className="text-base">Create New Post Order Version</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <Label htmlFor="pov-site">Site</Label>
                <Select value={form.site_id} onValueChange={(v) => setForm((f) => ({ ...f, site_id: v }))}>
                  <SelectTrigger id="pov-site" data-testid="select-pov-site">
                    <SelectValue placeholder="Select site" />
                  </SelectTrigger>
                  <SelectContent>
                    {sites.map((s) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label htmlFor="pov-title">Title</Label>
                <Input id="pov-title" data-testid="input-pov-title" placeholder="Post Orders v3"
                  value={form.title} onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))} />
              </div>
            </div>
            <div>
              <Label htmlFor="pov-summary">Change Summary</Label>
              <Input id="pov-summary" data-testid="input-pov-summary" placeholder="What changed in this version?"
                value={form.change_summary} onChange={(e) => setForm((f) => ({ ...f, change_summary: e.target.value }))} />
            </div>
            <div>
              <Label htmlFor="pov-content">Post Order Content</Label>
              <Textarea id="pov-content" data-testid="textarea-pov-content" placeholder="Enter full post order instructions..."
                value={form.content} onChange={(e) => setForm((f) => ({ ...f, content: e.target.value }))} className="min-h-32" />
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <Label htmlFor="pov-effective">Effective Date</Label>
                <Input id="pov-effective" type="date" data-testid="input-pov-effective"
                  value={form.effective_date} onChange={(e) => setForm((f) => ({ ...f, effective_date: e.target.value }))} />
              </div>
              <div>
                <Label htmlFor="pov-deadline">Acknowledgment Deadline</Label>
                <Input id="pov-deadline" type="date" data-testid="input-pov-deadline"
                  value={form.acknowledgment_deadline} onChange={(e) => setForm((f) => ({ ...f, acknowledgment_deadline: e.target.value }))} />
              </div>
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setShowNewVersionForm(false)} data-testid="button-cancel-pov">Cancel</Button>
              <Button
                onClick={() => createMutation.mutate(form)}
                disabled={createMutation.isPending || !form.site_id || !form.title || !form.content}
                data-testid="button-save-pov"
              >
                {createMutation.isPending ? "Saving..." : "Create Version"}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      <ModuleToolbar>
        <Select value={selectedSite} onValueChange={setSelectedSite}>
          <SelectTrigger className="w-52" data-testid="select-site-filter">
            <SelectValue placeholder="All Sites" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Sites</SelectItem>
            {sites.map((s) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
          </SelectContent>
        </Select>
        <p className="text-sm text-muted-foreground">
          {filtered.length} version{filtered.length !== 1 ? "s" : ""}
        </p>
      </ModuleToolbar>

      {isLoading ? (
        <ModuleSkeletonList count={3} height="h-24" />
      ) : filtered.length === 0 ? (
        <ModuleEmptyState
          icon={FileText}
          title="No post order versions found"
          subtitle="Create the first version for your sites"
        />
      ) : (
        <div className="space-y-3">
          {filtered.map((v) => (
            <Card
              key={v.id}
              className="hover-elevate cursor-pointer"
              onClick={() => setSelectedVersion(v)}
              data-testid={`card-version-${v.id}`}
            >
              <CardContent className="p-4">
                <div className="flex items-start justify-between flex-wrap gap-2">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="p-2 rounded-md bg-muted shrink-0">
                      <GitBranch className="w-4 h-4 text-muted-foreground" />
                    </div>
                    <div className="min-w-0">
                      <p className="font-medium text-foreground truncate" data-testid={`text-version-title-${v.id}`}>{v.title}</p>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        {v.site_name || v.site_id} · Effective {formatDate(v.effective_date)}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    {getPendingBadge(v)}
                  </div>
                </div>
                {v.change_summary && (
                  <p className="text-sm text-muted-foreground mt-3 pl-11 line-clamp-2">{v.change_summary}</p>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </ModulePageShell>
  );
}
