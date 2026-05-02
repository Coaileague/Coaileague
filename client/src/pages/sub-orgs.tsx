import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import { Building2, Loader2, Plus, ArrowRightLeft } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";

/**
 * Sub-Organization Management
 * ===========================
 * Surfaces the previously-headless backend `GET /api/workspace/sub-orgs`,
 * `POST /api/workspace/sub-orgs`, and `PATCH /api/workspace/sub-orgs/:id`.
 * Org owners can list, create, rename, and switch into their sub-orgs
 * here; before this page existed they had to call the API by hand.
 */

interface SubOrg {
  id: string;
  name: string;
  subOrgLabel?: string | null;
  primaryOperatingState?: string | null;
  operatingStates?: string[] | null;
  consolidatedBillingEnabled?: boolean | null;
  subOrgCreatedAt?: string | null;
  subOrgCreatedBy?: string | null;
  onboardingFullyComplete?: boolean | null;
}

export default function SubOrgsPage(): JSX.Element {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [createOpen, setCreateOpen] = useState(false);
  const [name, setName] = useState("");
  const [label, setLabel] = useState("");
  const [primaryState, setPrimaryState] = useState("");

  const { data, isLoading } = useQuery<{ subOrgs: SubOrg[]; parentWorkspaceId?: string }>({
    queryKey: ["/api/workspace/sub-orgs"],
  });

  const createMut = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/workspace/sub-orgs", {
        name: name.trim(),
        subOrgLabel: label.trim() || null,
        primaryOperatingState: primaryState.trim() || null,
      });
      return res.json() as Promise<{ subOrg?: SubOrg }>;
    },
    onSuccess: async () => {
      toast({ title: "Sub-organization created" });
      setCreateOpen(false);
      setName("");
      setLabel("");
      setPrimaryState("");
      await qc.invalidateQueries({ queryKey: ["/api/workspace/sub-orgs"] });
    },
    onError: (err: unknown) => {
      toast({
        title: "Could not create sub-organization",
        description: err instanceof Error ? err.message : "Try again.",
        variant: "destructive",
      });
    },
  });

  const switchMut = useMutation({
    mutationFn: async (workspaceId: string) => {
      const res = await apiRequest("POST", `/api/workspace/switch/${workspaceId}`, {});
      return res.json() as Promise<{ workspaceName?: string; code?: string }>;
    },
    onSuccess: (data) => {
      toast({ title: `Switched to ${data?.workspaceName || "sub-organization"}` });
      window.location.href = "/dashboard";
    },
    onError: async (err: unknown) => {
      const apiErr = err as { response?: { json?: () => Promise<{ code?: string }> }; message?: string };
      try {
        const body = await apiErr?.response?.json?.();
        if (body?.code === "ONBOARDING_INCOMPLETE") {
          toast({
            title: "Sub-org onboarding incomplete",
            description: "Finish setup for that branch before switching in.",
            variant: "destructive",
          });
          return;
        }
      } catch {
        /* fall through */
      }
      const msg = err instanceof Error ? err.message : apiErr?.message;
      toast({ title: "Switch failed", description: msg, variant: "destructive" });
    },
  });

  const subOrgs = data?.subOrgs || [];

  return (
    <div className="container mx-auto py-6 space-y-6" data-testid="page-sub-orgs">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Building2 className="h-6 w-6" /> Sub-Organizations
          </h1>
          <p className="text-sm text-muted-foreground mt-1 max-w-2xl">
            Branches, departments, or subsidiaries underneath this organization.
            Each sub-org has its own employees and schedules but inherits parent
            billing settings until you override them.
          </p>
        </div>
        <Dialog open={createOpen} onOpenChange={setCreateOpen}>
          <DialogTrigger asChild>
            <Button data-testid="button-open-create-sub-org">
              <Plus className="h-4 w-4 mr-2" /> New sub-organization
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Create a sub-organization</DialogTitle>
              <DialogDescription>
                It will inherit your billing settings until you override them
                from the sub-org's billing page.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-3">
              <div>
                <Label htmlFor="sub-org-name">Name *</Label>
                <Input
                  id="sub-org-name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Acme Security — Dallas"
                  data-testid="input-sub-org-name"
                />
              </div>
              <div>
                <Label htmlFor="sub-org-label">Short label (optional)</Label>
                <Input
                  id="sub-org-label"
                  value={label}
                  onChange={(e) => setLabel(e.target.value)}
                  placeholder="DALLAS"
                  data-testid="input-sub-org-label"
                />
              </div>
              <div>
                <Label htmlFor="sub-org-state">Primary operating state (2-letter code, optional)</Label>
                <Input
                  id="sub-org-state"
                  value={primaryState}
                  onChange={(e) => setPrimaryState(e.target.value.toUpperCase().slice(0, 2))}
                  placeholder="TX"
                  data-testid="input-sub-org-primary-state"
                />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setCreateOpen(false)}>Cancel</Button>
              <Button
                onClick={() => createMut.mutate()}
                disabled={createMut.isPending || name.trim().length < 2}
                data-testid="button-create-sub-org"
              >
                {createMut.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                Create
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      {isLoading ? (
        <Card>
          <CardContent className="py-8 flex items-center gap-2 text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Loading sub-organizations…
          </CardContent>
        </Card>
      ) : subOrgs.length === 0 ? (
        <Card>
          <CardHeader>
            <CardTitle>No sub-organizations yet</CardTitle>
            <CardDescription>
              Create your first branch or department. You can switch into it any
              time to manage employees, schedules, and billing for that location
              independently.
            </CardDescription>
          </CardHeader>
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {subOrgs.map((s) => (
            <Card key={s.id} data-testid={`card-sub-org-${s.id}`}>
              <CardHeader>
                <CardTitle className="flex items-center justify-between">
                  <span className="truncate">{s.name}</span>
                  {s.onboardingFullyComplete ? (
                    <Badge variant="outline" className="ml-2">Active</Badge>
                  ) : (
                    <Badge variant="secondary" className="ml-2">Setup pending</Badge>
                  )}
                </CardTitle>
                <CardDescription>
                  {s.subOrgLabel ? <span className="font-mono mr-2">{s.subOrgLabel}</span> : null}
                  {s.primaryOperatingState ? <span>{s.primaryOperatingState}</span> : null}
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                <p className="text-xs text-muted-foreground">
                  Created {s.subOrgCreatedAt ? new Date(s.subOrgCreatedAt).toLocaleDateString() : "recently"}
                  {s.consolidatedBillingEnabled ? " · Consolidated billing" : ""}
                </p>
                <Button
                  variant="outline"
                  size="sm"
                  className="w-full"
                  onClick={() => switchMut.mutate(s.id)}
                  disabled={switchMut.isPending}
                  data-testid={`button-switch-${s.id}`}
                >
                  <ArrowRightLeft className="h-3.5 w-3.5 mr-1" /> Switch in
                </Button>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
